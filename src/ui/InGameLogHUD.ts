/**
 * In-Game Log HUD - Real-time log display within the game UI
 * Shows logs directly in the game canvas/UI, not just browser console
 */

import * as THREE from 'three';
import { LogConsole, LogLevel, LogEntry } from './LogConsole.js';

export interface InGameLogHUDConfig {
  maxVisibleEntries: number;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  width: number;
  height: number;
  backgroundColor: string;
  backgroundOpacity: number;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  levelColors: Record<LogLevel, string>;
  showTimestamps: boolean;
  showLevels: boolean;
  autoScroll: boolean;
  fadeAfter: number; // ms, 0 = no fade
  keybind: string; // key to toggle
}

const DEFAULT_CONFIG: InGameLogHUDConfig = {
  maxVisibleEntries: 50,
  position: 'bottom-left',
  width: 400,
  height: 300,
  backgroundColor: '#081426',
  backgroundOpacity: 0.95,
  fontSize: 12,
  fontFamily: 'JetBrains Mono, Fira Code, monospace',
  textColor: '#e8f4f0',
  levelColors: {
    debug: '#64748b',
    info: '#3b82f6',
    warn: '#f59e0b',
    error: '#ef4444',
  },
  showTimestamps: true,
  showLevels: true,
  autoScroll: true,
  fadeAfter: 0,
  keybind: 'F3',
};

export class InGameLogHUD {
  private logConsole: LogConsole;
  private config: InGameLogHUDConfig;
  private container: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private threeScene: THREE.Scene | null = null;
  private threeCamera: THREE.OrthographicCamera | null = null;
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private entries: LogEntry[] = [];
  private isVisible = false;
  private animationId: number | null = null;
  private lastRenderTime = 0;
  private fadeTimers: Map<number, number> = new Map();
  private useHTML = true; // Use HTML overlay by default (better performance)

  constructor(logConsole: LogConsole, config: Partial<InGameLogHUDConfig> = {}) {
    this.logConsole = logConsole;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Subscribe to log console entries
    this.logConsole['entries'].forEach(entry => this.onNewEntry(entry));

    // Hook into addEntry
    const originalAddEntry = this.logConsole.addEntry.bind(this.logConsole);
    this.logConsole.addEntry = (level: LogLevel, message: string, context?: string, stack?: string) => {
      originalAddEntry(level, message, context, stack);
      const entry = this.logConsole['entries'][this.logConsole['entries'].length - 1];
      if (entry) this.onNewEntry(entry);
    };

    this.init();
  }

  private init(): void {
    if (this.useHTML) {
      this.initHTMLOverlay();
    } else {
      this.initThreeJS();
    }
    this.bindKeys();
    console.log('[InGameLogHUD] Initialized');
  }

  private initHTMLOverlay(): void {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'ingame-log-hud';
    this.container.style.cssText = `
      position: fixed;
      ${this.getPositionCSS()}
      width: ${this.config.width}px;
      max-height: ${this.config.height}px;
      background: ${this.config.backgroundColor};
      opacity: ${this.config.backgroundOpacity};
      border: 1px solid #1e3a4a;
      border-radius: 8px;
      padding: 8px;
      font-family: ${this.config.fontFamily};
      font-size: ${this.config.fontSize}px;
      color: ${this.config.textColor};
      z-index: 10000;
      display: none;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 8px;
      border-bottom: 1px solid #1e3a4a;
      margin-bottom: 4px;
    `;
    header.innerHTML = `
      <span style="font-weight: 600; color: #42d9c5;">📋 Game Logs</span>
      <span id="hud-log-count" style="color: #a0c4b8; font-size: 10px;">0</span>
    `;
    this.container.appendChild(header);

    // Log entries container
    const entriesContainer = document.createElement('div');
    entriesContainer.id = 'hud-log-entries';
    entriesContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      -webkit-overflow-scrolling: touch;
    `;
    this.container.appendChild(entriesContainer);

    document.body.appendChild(this.container);
  }

  private initThreeJS(): void {
    // Alternative: Three.js-based overlay (for WebGL integration)
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'ingame-log-hud-canvas';
    this.canvas.style.cssText = `
      position: fixed;
      ${this.getPositionCSS()}
      width: ${this.config.width}px;
      height: ${this.config.height}px;
      z-index: 10000;
      display: none;
      pointer-events: none;
    `;
    this.canvas.width = this.config.width * window.devicePixelRatio;
    this.canvas.height = this.config.height * window.devicePixelRatio;
    this.canvas.style.width = `${this.config.width}px`;
    this.canvas.style.height = `${this.config.height}px`;

    this.context = this.canvas.getContext('2d')!;
    document.body.appendChild(this.canvas);
  }

  private getPositionCSS(): string {
    const padding = 16;
    switch (this.config.position) {
      case 'top-left': return `top: ${padding}px; left: ${padding}px;`;
      case 'top-right': return `top: ${padding}px; right: ${padding}px;`;
      case 'bottom-left': return `bottom: ${padding}px; left: ${padding}px;`;
      case 'bottom-right': return `bottom: ${padding}px; right: ${padding}px;`;
      case 'center': return `top: 50%; left: 50%; transform: translate(-50%, -50%);`;
    }
  }

  private onNewEntry(entry: LogEntry): void {
    this.entries.push(entry);

    // Trim old entries
    if (this.entries.length > this.config.maxVisibleEntries * 2) {
      this.entries = this.entries.slice(-this.config.maxVisibleEntries);
    }

    if (this.useHTML) {
      this.renderHTMLEntry(entry);
    } else {
      this.scheduleRender();
    }

    // Handle fade
    if (this.config.fadeAfter > 0) {
      const entryId = this.entries.length - 1;
      const timer = window.setTimeout(() => {
        this.fadeEntry(entryId);
      }, this.config.fadeAfter);
      this.fadeTimers.set(entryId, timer);
    }
  }

  private renderHTMLEntry(entry: LogEntry): void {
    const entriesContainer = document.getElementById('hud-log-entries');
    if (!entriesContainer) return;

    const time = new Date(entry.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}.${time.getMilliseconds().toString().padStart(3, '0')}`;
    const levelStr = entry.level.toUpperCase();
    const levelColor = this.config.levelColors[entry.level];
    const contextStr = entry.context ? `[${entry.context}]` : '';

    const entryEl = document.createElement('div');
    entryEl.className = 'hud-log-entry';
    entryEl.dataset.level = entry.level;
    entryEl.style.cssText = `
      display: flex;
      gap: 6px;
      padding: 3px 6px;
      border-radius: 4px;
      line-height: 1.4;
      word-break: break-word;
      border-left: 3px solid ${levelColor};
      background: rgba(255, 255, 255, 0.02);
      transition: background 0.1s;
    `;

    let html = '';
    if (this.config.showTimestamps) {
      html += `<span style="color: #64748b; font-size: 10px; white-space: nowrap;">${timeStr}</span>`;
    }
    if (this.config.showLevels) {
      html += `<span style="color: ${levelColor}; font-weight: 600; font-size: 10px; text-transform: uppercase; min-width: 48px;">${levelStr}</span>`;
    }
    if (entry.context) {
      html += `<span style="color: #42d9c5; font-size: 10px; white-space: nowrap;">${contextStr}</span>`;
    }
    html += `<span style="color: ${this.config.textColor}; flex: 1; word-break: break-word;">${this.escapeHtml(entry.message)}</span>`;

    entryEl.innerHTML = html;

    // Add hover effect
    entryEl.addEventListener('mouseenter', () => {
      entryEl.style.background = 'rgba(66, 217, 197, 0.1)';
    });
    entryEl.addEventListener('mouseleave', () => {
      entryEl.style.background = 'rgba(255, 255, 255, 0.02)';
    });

    entriesContainer.appendChild(entryEl);

    // Trim old entries from DOM
    const maxDOM = this.config.maxVisibleEntries;
    while (entriesContainer.children.length > maxDOM) {
      const child = entriesContainer.children[0];
      if (child) entriesContainer.removeChild(child);
    }

    // Auto scroll
    if (this.config.autoScroll) {
      entriesContainer.scrollTop = entriesContainer.scrollHeight;
    }

    // Update count
    const countEl = document.getElementById('hud-log-count');
    if (countEl) {
      countEl.textContent = this.entries.length.toString();
    }
  }

  private fadeEntry(entryId: number): void {
    if (this.useHTML) {
      const entries = document.querySelectorAll<HTMLDivElement>('.hud-log-entry');
      const entry = entries[entryId];
      if (entry) {
        entry.style.transition = 'opacity 0.5s, transform 0.5s';
        entry.style.opacity = '0';
        entry.style.transform = 'translateX(-20px)';
        setTimeout(() => entry.remove(), 500);
      }
    }
    this.fadeTimers.delete(entryId);
  }

  private scheduleRender(): void {
    if (this.animationId) return;
    this.animationId = requestAnimationFrame(() => {
      this.animationId = null;
      this.renderThreeJS();
    });
  }

  private renderThreeJS(): void {
    if (!this.context || !this.canvas) return;

    const ctx = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear
    ctx.fillStyle = `${this.config.backgroundColor}CC`;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#1e3a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // Header
    ctx.fillStyle = '#42d9c5';
    ctx.font = `bold ${this.config.fontSize * 1.2}px ${this.config.fontFamily}`;
    ctx.fillText('📋 Game Logs', 16, 24);

    ctx.fillStyle = '#a0c4b8';
    ctx.font = `${this.config.fontSize * 0.8}px ${this.config.fontFamily}`;
    ctx.fillText(`${this.entries.length}`, width - 40, 24);

    // Entries
    const startY = 40;
    const lineHeight = this.config.fontSize * 1.5;
    const visibleEntries = this.entries.slice(-this.config.maxVisibleEntries);

    visibleEntries.forEach((entry, i) => {
      const y = startY + i * lineHeight;
      if (y > height - lineHeight) return;

      const time = new Date(entry.timestamp);
      const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}.${time.getMilliseconds().toString().padStart(3, '0')}`;
      const levelStr = entry.level.toUpperCase();
      const levelColor = this.config.levelColors[entry.level];

      let x = 12;
      if (this.config.showTimestamps) {
        ctx.fillStyle = '#64748b';
        ctx.font = `${this.config.fontSize * 0.8}px ${this.config.fontFamily}`;
        ctx.fillText(timeStr, x, y);
        x += 90;
      }
      if (this.config.showLevels) {
        ctx.fillStyle = levelColor;
        ctx.font = `bold ${this.config.fontSize * 0.8}px ${this.config.fontFamily}`;
        ctx.fillText(levelStr, x, y);
        x += 50;
      }
      if (entry.context) {
        ctx.fillStyle = '#42d9c5';
        ctx.font = `${this.config.fontSize * 0.8}px ${this.config.fontFamily}`;
        ctx.fillText(`[${entry.context}]`, x, y);
        x += entry.context.length * 7 + 10;
      }

      ctx.fillStyle = this.config.textColor;
      ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`;
      ctx.fillText(entry.message, x, y);
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#039;');
  }

  private boundKeyHandler = (e: KeyboardEvent) => {
    if (e.key === this.config.keybind && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.toggle();
    }
  };

  private bindKeys(): void {
    document.addEventListener('keydown', this.boundKeyHandler);
  }

  toggle(): void {
    this.isVisible = !this.isVisible;
    if (this.container) {
      this.container.style.display = this.isVisible ? 'flex' : 'none';
    }
    if (this.canvas) {
      this.canvas.style.display = this.isVisible ? 'block' : 'none';
    }
    console.log('[InGameLogHUD] Toggled:', this.isVisible);
  }

  show(): void {
    this.isVisible = true;
    if (this.container) this.container.style.display = 'flex';
    if (this.canvas) this.canvas.style.display = 'block';
  }

  hide(): void {
    this.isVisible = false;
    if (this.container) this.container.style.display = 'none';
    if (this.canvas) this.canvas.style.display = 'none';
  }

  clear(): void {
    this.entries = [];
    this.fadeTimers.forEach(timer => clearTimeout(timer));
    this.fadeTimers.clear();

    if (this.useHTML) {
      const container = document.getElementById('hud-log-entries');
      if (container) container.innerHTML = '';
      const countEl = document.getElementById('hud-log-count');
      if (countEl) countEl.textContent = '0';
    }
  }

  setConfig(config: Partial<InGameLogHUDConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.container) {
      this.container.style.width = `${this.config.width}px`;
      this.container.style.maxHeight = `${this.config.height}px`;
      this.container.style.fontSize = `${this.config.fontSize}px`;
      this.container.style.fontFamily = this.config.fontFamily;
    }
  }

  destroy(): void {
    this.fadeTimers.forEach(timer => clearTimeout(timer));
    this.fadeTimers.clear();
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.container?.remove();
    this.canvas?.remove();
    document.removeEventListener('keydown', this.boundKeyHandler);
  }
}

// Auto-initialize if LogConsole exists
export function initInGameLogHUD(logConsole: LogConsole, config?: Partial<InGameLogHUDConfig>): InGameLogHUD {
  return new InGameLogHUD(logConsole, config);
}