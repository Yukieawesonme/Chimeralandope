/**
 * In-Game Log Console - Debug overlay with filtering, search, copy, and persistence
 * Toggle with F3 (or configurable key), integrates with console.log/warn/error
 */

import { GameState } from '@core/Types.js';

export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: string;
  stack?: string;
}

export interface LogConsoleConfig {
  maxEntries: number;
  persistAcrossLoads: boolean;
  showTimestamps: boolean;
  showLevels: boolean;
  autoScroll: boolean;
  defaultFilter: LogLevel[];
}

const DEFAULT_CONFIG: LogConsoleConfig = {
  maxEntries: 5000,
  persistAcrossLoads: true,
  showTimestamps: true,
  showLevels: true,
  autoScroll: true,
  defaultFilter: [LogLevel.Info, LogLevel.Warn, LogLevel.Error],
};

// ============================================================================
// LOG CONSOLE CLASS
// ============================================================================

export class LogConsole {
  private entries: LogEntry[] = [];
  private filteredEntries: LogEntry[] = [];
  private config: LogConsoleConfig = { ...DEFAULT_CONFIG };
  private activeFilters: Set<LogLevel> = new Set(DEFAULT_CONFIG.defaultFilter);
  private searchQuery = '';
  private isVisible = false;
  private isMinimized = false;
  private container: HTMLElement | null = null;
  private logListEl: HTMLElement | null = null;
  private filterButtons: Map<LogLevel, HTMLButtonElement> = new Map();
  private searchInput: HTMLInputElement | null = null;
  private autoScrollCheckbox: HTMLInputElement | null = null;
  private timestampsCheckbox: HTMLInputElement | null = null;
  private levelsCheckbox: HTMLInputElement | null = null;
  private entryCountEl: HTMLElement | null = null;
  private onVisibilityChange?: (visible: boolean) => void;

  // Intercept original console methods
  private originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    info: console.info.bind(console),
  };

  constructor(config?: Partial<LogConsoleConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadPersistedLogs();
    this.interceptConsole();
    this.createUI();
    this.bindHotkeys();
  }

  // ---- Console Interception ----

  private interceptConsole(): void {
    const self = this;

    console.log = (...args: any[]) => {
      self.originalConsole.log(...args);
      self.addEntry(LogLevel.Info, args.map(self.formatArg).join(' '));
    };

    console.warn = (...args: any[]) => {
      self.originalConsole.warn(...args);
      self.addEntry(LogLevel.Warn, args.map(self.formatArg).join(' '));
    };

    console.error = (...args: any[]) => {
      self.originalConsole.error(...args);
      self.addEntry(LogLevel.Error, args.map(self.formatArg).join(' '));
    };

    console.debug = (...args: any[]) => {
      self.originalConsole.debug(...args);
      self.addEntry(LogLevel.Debug, args.map(self.formatArg).join(' '));
    };

    console.info = (...args: any[]) => {
      self.originalConsole.info(...args);
      self.addEntry(LogLevel.Info, args.map(self.formatArg).join(' '));
    };

    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      self.addEntry(LogLevel.Error, event.message, 'GlobalError', event.error?.stack);
    });

    window.addEventListener('unhandledrejection', (event) => {
      self.addEntry(LogLevel.Error, `Unhandled Promise: ${event.reason}`, 'PromiseRejection');
    });
  }

  private formatArg(arg: any): string {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, (key, value) =>
          value instanceof Error ? value.stack || value.message : value
        );
      } catch {
        return '[Object]';
      }
    }
    return String(arg);
  }

  // ---- Log Management ----

  addEntry(level: LogLevel, message: string, context?: string, stack?: string): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context,
      stack,
    };

    this.entries.push(entry);

    // Trim to max entries
    if (this.entries.length > this.config.maxEntries) {
      this.entries.shift();
    }

    this.applyFilters();
    this.persistLogs();
    this.render();
  }

  private applyFilters(): void {
    this.filteredEntries = this.entries.filter(entry => {
      // Level filter
      if (!this.activeFilters.has(entry.level)) return false;

      // Search filter
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        const searchable = `${entry.message} ${entry.context || ''} ${entry.stack || ''}`.toLowerCase();
        if (!searchable.includes(query)) return false;
      }

      return true;
    });
  }

  // ---- Persistence ----

  private persistLogs(): void {
    if (!this.config.persistAcrossLoads) return;

    try {
      const data = {
        entries: this.entries.slice(-1000), // Only persist last 1000
        config: this.config,
        timestamp: Date.now(),
      };
      localStorage.setItem('chimeraland_logs', JSON.stringify(data));
    } catch (e) {
      // Ignore quota errors
    }
  }

  private loadPersistedLogs(): void {
    if (!this.config.persistAcrossLoads) return;

    try {
      const data = localStorage.getItem('chimeraland_logs');
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.entries && Array.isArray(parsed.entries)) {
          this.entries = parsed.entries;
        }
        if (parsed.config) {
          this.config = { ...DEFAULT_CONFIG, ...parsed.config };
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // ---- UI Creation ----

  private createUI(): void {
    this.container = document.createElement('div');
    this.container.id = 'log-console';
    this.container.className = 'log-console hidden';
    this.container.innerHTML = this.renderHTML();
    document.body.appendChild(this.container);

    // Cache elements
    this.logListEl = this.container.querySelector('.log-entries') as HTMLElement;
    this.searchInput = this.container.querySelector('.log-search') as HTMLInputElement;
    this.autoScrollCheckbox = this.container.querySelector('.log-autoscroll') as HTMLInputElement;
    this.timestampsCheckbox = this.container.querySelector('.log-timestamps') as HTMLInputElement;
    this.levelsCheckbox = this.container.querySelector('.log-showlevels') as HTMLInputElement;
    this.entryCountEl = this.container.querySelector('.log-count') as HTMLElement;

    // Filter buttons
    [LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error].forEach(level => {
      const btn = this.container!.querySelector(`.log-filter-${level}`) as HTMLButtonElement;
      if (btn) this.filterButtons.set(level, btn);
    });

    // Bind events
    this.bindUIEvents();

    // Initial render
    this.applyFilters();
    this.render();
  }

  private renderHTML(): string {
    const levels = [LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error];
    const levelColors = {
      [LogLevel.Debug]: '#64748b',
      [LogLevel.Info]: '#3b82f6',
      [LogLevel.Warn]: '#f59e0b',
      [LogLevel.Error]: '#ef4444',
    };

    return `
      <style>
        .log-console {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 300px;
          background: rgba(8, 20, 38, 0.98);
          border-top: 1px solid #1e3a4a;
          z-index: 10000;
          display: flex;
          flex-direction: column;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 11px;
          backdrop-filter: blur(8px);
          box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.5);
        }
        .log-console.minimized {
          height: 32px;
        }
        .log-console.hidden {
          display: none;
        }
        .log-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: rgba(13, 31, 51, 0.9);
          border-bottom: 1px solid #1e3a4a;
          flex-shrink: 0;
        }
        .log-title {
          font-weight: 600;
          color: #42d9c5;
          font-size: 12px;
        }
        .log-count {
          margin-left: auto;
          color: #a0c4b8;
          font-size: 10px;
        }
        .log-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .log-search {
          flex: 1;
          max-width: 200px;
          padding: 4px 8px;
          background: #081426;
          border: 1px solid #1e3a4a;
          border-radius: 4px;
          color: #e8f4f0;
          font-family: inherit;
          font-size: 11px;
        }
        .log-search:focus {
          outline: none;
          border-color: #42d9c5;
        }
        .log-filter-btn {
          padding: 2px 8px;
          border: 1px solid #1e3a4a;
          border-radius: 3px;
          background: #0d1f33;
          color: #a0c4b8;
          font-family: inherit;
          font-size: 10px;
          cursor: pointer;
          transition: all 0.1s;
        }
        .log-filter-btn.active {
          border-color: currentColor;
          font-weight: 600;
        }
        .log-filter-btn:hover:not(.active) {
          background: #1e3a4a;
        }
        .log-filter-debug.active { color: #64748b; }
        .log-filter-info.active { color: #3b82f6; }
        .log-filter-warn.active { color: #f59e0b; }
        .log-filter-error.active { color: #ef4444; }
        .log-toggle {
          padding: 2px 8px;
          border: 1px solid #1e3a4a;
          border-radius: 3px;
          background: #0d1f33;
          color: #a0c4b8;
          font-family: inherit;
          font-size: 10px;
          cursor: pointer;
        }
        .log-toggle:hover { background: #1e3a4a; }
        .log-close {
          padding: 2px 8px;
          border: 1px solid #1e3a4a;
          border-radius: 3px;
          background: #ef4444;
          color: white;
          font-family: inherit;
          font-size: 10px;
          cursor: pointer;
        }
        .log-close:hover { background: #dc2626; }
        .log-copy {
          padding: 2px 8px;
          border: 1px solid #1e3a4a;
          border-radius: 3px;
          background: #0d1f33;
          color: #42d9c5;
          font-family: inherit;
          font-size: 10px;
          cursor: pointer;
        }
        .log-copy:hover { background: #1e3a4a; }
        .log-entries {
          flex: 1;
          overflow-y: auto;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .log-console.minimized .log-entries {
          display: none;
        }
        .log-entry {
          display: flex;
          gap: 8px;
          padding: 2px 0;
          border-bottom: 1px solid rgba(30, 58, 74, 0.3);
          line-height: 1.4;
          word-break: break-word;
        }
        .log-entry:hover {
          background: rgba(66, 217, 197, 0.05);
        }
        .log-entry-time {
          color: #64748b;
          font-size: 10px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .log-entry-level {
          font-weight: 600;
          font-size: 10px;
          text-transform: uppercase;
          white-space: nowrap;
          flex-shrink: 0;
          min-width: 48px;
        }
        .log-entry-context {
          color: #42d9c5;
          font-size: 10px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .log-entry-message {
          flex: 1;
          color: #e8f4f0;
          white-space: pre-wrap;
        }
        .log-entry-stack {
          color: #64748b;
          font-size: 9px;
          margin-top: 2px;
          padding-left: 8px;
          border-left: 2px solid #1e3a4a;
        }
        .log-entry.debug .log-entry-level { color: #64748b; }
        .log-entry.info .log-entry-level { color: #3b82f6; }
        .log-entry.warn .log-entry-level { color: #f59e0b; }
        .log-entry.error .log-entry-level { color: #ef4444; }
        .log-minimized-bar {
          display: none;
          align-items: center;
          gap: 8px;
          padding: 4px 12px;
          background: rgba(13, 31, 51, 0.9);
          border-top: 1px solid #1e3a4a;
        }
        .log-console.minimized .log-minimized-bar {
          display: flex;
        }
        .log-minimized-bar .log-count {
          margin-left: auto;
        }
      </style>
      <div class="log-header">
        <span class="log-title">📋 Log Console</span>
        <div class="log-controls">
          <input type="text" class="log-search" placeholder="Filtrar logs...">
          ${levels.map(l => `
            <button class="log-filter-btn log-filter-${l}" data-level="${l}">${l.toUpperCase()}</button>
          `).join('')}
          <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#a0c4b8;cursor:pointer;">
            <input type="checkbox" class="log-autoscroll" checked> Auto-scroll
          </label>
          <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#a0c4b8;cursor:pointer;">
            <input type="checkbox" class="log-timestamps" checked> Tempo
          </label>
          <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#a0c4b8;cursor:pointer;">
            <input type="checkbox" class="log-showlevels" checked> Níveis
          </label>
          <button class="log-copy" title="Copiar logs filtrados (Ctrl+Shift+C)">📋 Copiar</button>
          <button class="log-toggle" title="Minimizar (Ctrl+Shift+M)">_</button>
          <button class="log-close" title="Fechar (F3)">×</button>
        </div>
        <span class="log-count">0 entradas</span>
      </div>
      <div class="log-entries"></div>
      <div class="log-minimized-bar">
        <span class="log-title">📋 Log Console (minimizado)</span>
        <span class="log-count">0 entradas</span>
        <button class="log-toggle" title="Expandir">□</button>
      </div>
    `;
  }

  private bindUIEvents(): void {
    if (!this.container) return;

    // Search
    this.searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.applyFilters();
      this.render();
    });

    // Filter buttons
    this.filterButtons.forEach((btn, level) => {
      btn.addEventListener('click', () => {
        if (this.activeFilters.has(level)) {
          this.activeFilters.delete(level);
          btn.classList.remove('active');
        } else {
          this.activeFilters.add(level);
          btn.classList.add('active');
        }
        this.applyFilters();
        this.render();
      });
      // Set initial active state
      if (this.activeFilters.has(level)) {
        btn.classList.add('active');
      }
    });

    // Checkboxes
    this.autoScrollCheckbox?.addEventListener('change', (e) => {
      this.config.autoScroll = (e.target as HTMLInputElement).checked;
    });

    this.timestampsCheckbox?.addEventListener('change', (e) => {
      this.config.showTimestamps = (e.target as HTMLInputElement).checked;
      this.render();
    });

    this.levelsCheckbox?.addEventListener('change', (e) => {
      this.config.showLevels = (e.target as HTMLInputElement).checked;
      this.render();
    });

    // Buttons
    this.container.querySelector('.log-copy')?.addEventListener('click', () => this.copyLogs());
    this.container.querySelector('.log-toggle')?.addEventListener('click', () => this.toggleMinimize());
    this.container.querySelector('.log-close')?.addEventListener('click', () => this.hide());

    // Double-click entry to copy
    this.logListEl?.addEventListener('dblclick', (e) => {
      const entryEl = (e.target as HTMLElement).closest('.log-entry') as HTMLElement | null;
      if (entryEl) {
        const index = parseInt(entryEl.dataset.index || '-1');
        if (index >= 0) this.copyEntry(index);
      }
    });

    // Context menu for entries
    this.logListEl?.addEventListener('contextmenu', (e) => {
      const entryEl = (e.target as HTMLElement).closest('.log-entry') as HTMLElement | null;
      if (entryEl) {
        e.preventDefault();
        const index = parseInt(entryEl.dataset.index || '-1');
        if (index >= 0) this.showEntryContextMenu(index, e.clientX, e.clientY);
      }
    });
  }

  // ---- Rendering ----

  private render(): void {
    if (!this.logListEl || !this.entryCountEl) return;

    const showTime = this.config.showTimestamps;
    const showLevel = this.config.showLevels;

    this.logListEl.innerHTML = this.filteredEntries.map((entry, index) => {
      const time = new Date(entry.timestamp);
      const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}.${time.getMilliseconds().toString().padStart(3, '0')}`;
      const levelStr = entry.level.toUpperCase();
      const contextStr = entry.context ? `[${entry.context}]` : '';

      return `
        <div class="log-entry ${entry.level}" data-index="${index}">
          ${showTime ? `<span class="log-entry-time">${timeStr}</span>` : ''}
          ${showLevel ? `<span class="log-entry-level">${levelStr}</span>` : ''}
          ${contextStr ? `<span class="log-entry-context">${contextStr}</span>` : ''}
          <span class="log-entry-message">${this.escapeHtml(entry.message)}</span>
        </div>
        ${entry.stack ? `<div class="log-entry-stack">${this.escapeHtml(entry.stack)}</div>` : ''}
      `;
    }).join('');

    this.entryCountEl.textContent = `${this.filteredEntries.length} / ${this.entries.length} entradas`;

    // Auto scroll
    if (this.config.autoScroll && this.logListEl) {
      this.logListEl.scrollTop = this.logListEl.scrollHeight;
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#039;');
  }

  // ---- Actions ----

  copyLogs(): void {
    const text = this.filteredEntries.map(entry => {
      const time = new Date(entry.timestamp).toISOString();
      const context = entry.context ? `[${entry.context}]` : '';
      return `${time} [${entry.level.toUpperCase()}] ${context} ${entry.message}`;
    }).join('\n');

    navigator.clipboard.writeText(text).then(() => {
      this.addEntry(LogLevel.Info, 'Logs copiados para clipboard', 'LogConsole');
    }).catch(() => {
      this.addEntry(LogLevel.Error, 'Falha ao copiar logs', 'LogConsole');
    });
  }

  copyEntry(index: number): void {
    const entry = this.filteredEntries[index];
    if (!entry) return;

    const text = `${new Date(entry.timestamp).toISOString()} [${entry.level.toUpperCase()}] ${entry.context ? `[${entry.context}]` : ''} ${entry.message}`;
    navigator.clipboard.writeText(text).then(() => {
      this.addEntry(LogLevel.Info, `Log copiado: ${entry.message.slice(0, 50)}...`, 'LogConsole');
    });
  }

  showEntryContextMenu(index: number, x: number, y: number): void {
    const entry = this.filteredEntries[index];
    if (!entry) return;

    // Remove existing menu
    const existing = document.getElementById('log-context-menu');
    existing?.remove();

    const menu = document.createElement('div');
    menu.id = 'log-context-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      background: #0d1f33;
      border: 1px solid #1e3a4a;
      border-radius: 6px;
      padding: 4px 0;
      z-index: 10001;
      min-width: 180px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    `;
    menu.innerHTML = `
      <button style="width:100%;padding:8px 12px;text-align:left;background:none;border:none;color:#e8f4f0;font-family:inherit;font-size:11px;cursor:pointer;" data-action="copy">📋 Copiar esta entrada</button>
      <button style="width:100%;padding:8px 12px;text-align:left;background:none;border:none;color:#e8f4f0;font-family:inherit;font-size:11px;cursor:pointer;" data-action="copy-full">📄 Copiar com stack trace</button>
      <button style="width:100%;padding:8px 12px;text-align:left;background:none;border:none;color:#f59e0b;font-family:inherit;font-size:11px;cursor:pointer;" data-action="filter-level">🔍 Filtrar por "${entry.level}"</button>
      <button style="width:100%;padding:8px 12px;text-align:left;background:none;border:none;color:#42d9c5;font-family:inherit;font-size:11px;cursor:pointer;" data-action="filter-context">🏷️ Filtrar por contexto "${entry.context || '(vazio)'}"</button>
      <hr style="margin:4px 0;border-color:#1e3a4a;">
      <button style="width:100%;padding:8px 12px;text-align:left;background:none;border:none;color:#ef4444;font-family:inherit;font-size:11px;cursor:pointer;" data-action="clear">🗑️ Limpar todos os logs</button>
    `;

    menu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('mouseenter', () => btn.style.background = '#1e3a4a');
      btn.addEventListener('mouseleave', () => btn.style.background = 'none');
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        menu.remove();
        this.handleContextAction(action!, index);
      });
    });

    document.body.appendChild(menu);

    // Close on click outside
    const closeFn = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeFn);
      }
    };
    setTimeout(() => document.addEventListener('click', closeFn), 0);
  }

  private handleContextAction(action: string, index: number): void {
    const entry = this.filteredEntries[index];
    if (!entry) return;

    switch (action) {
      case 'copy':
        this.copyEntry(index);
        break;
      case 'copy-full':
        navigator.clipboard.writeText(
          `${new Date(entry.timestamp).toISOString()} [${entry.level.toUpperCase()}] ${entry.context ? `[${entry.context}]` : ''} ${entry.message}\n${entry.stack || ''}`
        ).then(() => this.addEntry(LogLevel.Info, 'Log completo copiado', 'LogConsole'));
        break;
      case 'filter-level':
        this.activeFilters.clear();
        this.activeFilters.add(entry.level);
        this.filterButtons.forEach((btn, l) => btn.classList.toggle('active', l === entry.level));
        this.applyFilters();
        this.render();
        break;
      case 'filter-context':
        if (entry.context) {
          this.searchQuery = entry.context;
          this.searchInput!.value = entry.context;
          this.applyFilters();
          this.render();
        }
        break;
      case 'clear':
        this.clear();
        break;
    }
  }

  clear(): void {
    this.entries = [];
    this.filteredEntries = [];
    this.persistLogs();
    this.render();
    this.addEntry(LogLevel.Info, 'Logs limpos', 'LogConsole');
  }

  // ---- Visibility ----

  show(): void {
    this.isVisible = true;
    this.container?.classList.remove('hidden');
    this.onVisibilityChange?.(true);
    // Focus search
    setTimeout(() => this.searchInput?.focus(), 100);
  }

  hide(): void {
    this.isVisible = false;
    this.container?.classList.add('hidden');
    this.onVisibilityChange?.(false);
  }

  toggle(): void {
    if (this.isVisible) this.hide(); else this.show();
  }

  toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    this.container?.classList.toggle('minimized', this.isMinimized);
  }

  isOpen(): boolean {
    return this.isVisible;
  }

  // ---- Hotkeys ----

  private bindHotkeys(): void {
    document.addEventListener('keydown', (e) => {
      // F3 - Toggle console
      if (e.key === 'F3' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.toggle();
      }
      // Ctrl+Shift+C - Copy filtered logs
      if (e.key === 'c' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        this.copyLogs();
      }
      // Ctrl+Shift+M - Minimize
      if (e.key === 'm' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        this.toggleMinimize();
      }
      // Ctrl+Shift+L - Clear logs
      if (e.key === 'l' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        this.clear();
      }
    });
  }

  // ---- Config ----

  setConfig(config: Partial<LogConsoleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): LogConsoleConfig {
    return { ...this.config };
  }

  setVisibilityCallback(cb: (visible: boolean) => void): void {
    this.onVisibilityChange = cb;
  }

  // ---- Stats ----

  getStats(): { total: number; filtered: number; byLevel: Record<LogLevel, number> } {
    const byLevel: Record<LogLevel, number> = {
      [LogLevel.Debug]: 0,
      [LogLevel.Info]: 0,
      [LogLevel.Warn]: 0,
      [LogLevel.Error]: 0,
    };
    for (const entry of this.entries) {
      byLevel[entry.level]++;
    }
    return {
      total: this.entries.length,
      filtered: this.filteredEntries.length,
      byLevel,
    };
  }

  // ---- Cleanup ----

  destroy(): void {
    // Restore original console
    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
    console.info = this.originalConsole.info;

    this.container?.remove();
    this.container = null;
  }
}

// ============================================================================
// GLOBAL INSTANCE (Singleton)
// ============================================================================

let globalLogConsole: LogConsole | null = null;

export function getLogConsole(config?: Partial<LogConsoleConfig>): LogConsole {
  if (!globalLogConsole) {
    globalLogConsole = new LogConsole(config);
  }
  return globalLogConsole;
}

export function initLogConsole(config?: Partial<LogConsoleConfig>): LogConsole {
  globalLogConsole = new LogConsole(config);
  return globalLogConsole;
}