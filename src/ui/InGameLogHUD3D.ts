/**
 * In-Game Log HUD 3D - Three.js-based log table rendered WITHIN the game canvas
 * Renders as part of the game's Three.js scene, not as HTML overlay
 */

import * as THREE from 'three';
import { LogConsole, LogLevel, LogEntry } from './LogConsole.js';

export interface InGameLogHUD3DConfig {
  maxVisibleEntries: number;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  width: number;
  height: number;
  fontSize: number;
  fontColor: number;
  backgroundColor: number;
  backgroundOpacity: number;
  borderColor: number;
  levelColors: Record<LogLevel, number>;
  showTimestamps: boolean;
  showLevels: boolean;
  autoScroll: boolean;
  keybind: string;
  padding: number;
  lineHeight: number;
}

const DEFAULT_CONFIG: InGameLogHUD3DConfig = {
  maxVisibleEntries: 30,
  position: 'bottom-left',
  width: 420,
  height: 280,
  fontSize: 14,
  fontColor: 0xe8f4f0,
  backgroundColor: 0x081426,
  backgroundOpacity: 0.95,
  borderColor: 0x1e3a4a,
  levelColors: {
    debug: 0x64748b,
    info: 0x3b82f6,
    warn: 0xf59e0b,
    error: 0xef4444,
  },
  showTimestamps: true,
  showLevels: true,
  autoScroll: true,
  keybind: 'F3',
  padding: 12,
  lineHeight: 1.4,
};

interface TextSprite {
  sprite: THREE.Sprite;
  texture: THREE.Texture;
  entry: LogEntry;
  yOffset: number;
}

// Extend TextSprite to include sprite property properly
interface TextSpriteWithSprite extends TextSprite {
  sprite: THREE.Sprite;
}

export class InGameLogHUD3D {
  private logConsole: any;
  private config: InGameLogHUD3DConfig;
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private entries: LogEntry[] = [];
  private textSprites: TextSprite[] = [];
  private backgroundMesh: THREE.Mesh | null = null;
  private borderMesh: THREE.LineLoop | null = null;
  private headerSprite: THREE.Sprite | null = null;
  private countSprite: THREE.Sprite | null = null;
  private isVisible = false;
  private canvas!: HTMLCanvasElement;
  private textureCache: Map<string, THREE.Texture> = new Map();
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private fontCanvas!: HTMLCanvasElement;
  private fontContext!: CanvasRenderingContext2D;
  private isInitialized = false;

  constructor(logConsole: any, config: Partial<InGameLogHUD3DConfig> = {}) {
    this.logConsole = logConsole;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create offscreen canvas for text rendering
    this.fontCanvas = document.createElement('canvas');
    this.fontCanvas.width = 1024;
    this.fontCanvas.height = 1024;
    this.fontContext = this.fontCanvas.getContext('2d')!;
    this.setupFontContext();

    // Hook into log console
    this.hookLogConsole();

    console.log('[InGameLogHUD3D] Created');
  }

  private setupFontContext(): void {
    this.fontContext.font = `bold ${this.config.fontSize}px 'JetBrains Mono', 'Fira Code', monospace`;
    this.fontContext.textBaseline = 'top';
    this.fontContext.fillStyle = '#e8f4f0';
  }

  private hookLogConsole(): void {
    // Capture existing entries
    if (this.logConsole.entries) {
      this.logConsole.entries.forEach((entry: any) => this.onNewEntry(entry));
    }

    // Hook addEntry
    const originalAddEntry = this.logConsole.addEntry.bind(this.logConsole);
    this.logConsole.addEntry = (level: any, message: string, context?: string, stack?: string) => {
      this.logConsole.addEntry = originalAddEntry; // Temporarily restore
      originalAddEntry(level, message, stack); // Call original with correct signature
      this.logConsole.addEntry = (l: any, m: string, c?: string, s?: string) => {
        originalAddEntry(l, m, c, s);
        const entry = this.logConsole.entries[this.logConsole.entries.length - 1];
        if (entry) this.onNewEntry(entry);
      };
    };
  }

  // Initialize with Three.js renderer from the game engine
  initialize(renderer: THREE.WebGLRenderer, mainScene: THREE.Scene, mainCamera: THREE.Camera): void {
    this.renderer = renderer;

    // Create orthographic camera for HUD
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      0, width, height, 0, -1000, 1000
    );
    this.camera.position.z = 100;

    // Create separate scene for HUD
    this.scene = new THREE.Scene();

    // Create background panel
    this.createBackground();

    // Create header (includes count display)
    this.createHeader();

    // Bind keys
    this.bindKeys();

    // Set initial visibility
    this.setVisibility(false);

    this.isInitialized = true;
    console.log('[InGameLogHUD3D] Initialized with Three.js');
  }

  private createBackground(): void {
    const { width, height, padding, backgroundColor, backgroundOpacity, borderColor } = this.config;
    const x = this.getX();
    const y = this.getY();

    // Background plane
    const bgGeometry = new THREE.PlaneGeometry(width, height);
    const bgMaterial = new THREE.MeshBasicMaterial({
      color: backgroundColor,
      opacity: backgroundOpacity,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.backgroundMesh = new THREE.Mesh(bgGeometry, bgMaterial);
    this.backgroundMesh.position.set(x + width / 2, y + height / 2, 0);
    this.backgroundMesh.renderOrder = 998;
    this.scene.add(this.backgroundMesh);

    // Border
    const borderGeometry = new THREE.BufferGeometry();
    const borderVertices = new Float32Array([
      x, y, 0.1,
      x + width, y, 0.1,
      x + width, y + height, 0.1,
      x, y + height, 0.1,
    ]);
    borderGeometry.setAttribute('position', new THREE.BufferAttribute(borderVertices, 3));

    const borderMaterial = new THREE.LineBasicMaterial({
      color: borderColor,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });
    this.borderMesh = new THREE.LineLoop(borderGeometry, borderMaterial);
    this.borderMesh.renderOrder = 999;
    this.scene.add(this.borderMesh);
  }

  private createHeader(): void {
    const texture = this.createTextTexture('📋 Game Logs', this.config.fontSize + 2, 0x42d9c5, true);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.headerSprite = new THREE.Sprite(spriteMaterial);
    this.headerSprite.scale.set(200, 30, 1);
    this.updateHeaderPosition();
    this.headerSprite.renderOrder = 1000;
    this.scene.add(this.headerSprite);
  }

  private createTextTexture(text: string, fontSize: number, color: number, bold = false): THREE.Texture {
    const cacheKey = `${text}-${fontSize}-${color}-${this.config.fontSize}`;
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey)!;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    this.fontContext.font = `${fontSize}px 'JetBrains Mono', 'Fira Code', monospace`;
    const metrics = this.fontContext.measureText(text);
    const padding = 8;

    canvas.width = Math.ceil(metrics.width) + padding * 2;
    canvas.height = fontSize + 8;

    ctx.font = `${fontSize}px 'JetBrains Mono', 'Fira Code', monospace`;
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.textBaseline = 'top';
    ctx.fillText(text, padding, 4);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  private updateHeaderPosition(): void {
    if (!this.headerSprite) return;
    const { width, padding } = this.config;
    const x = this.getX() + padding + 100;
    const y = this.getY() + padding + 10;
    this.headerSprite.position.set(x, y, 1);
  }

  private updateCountPosition(): void {
    if (!this.countSprite) return;
    const { width, padding } = this.config;
    const x = this.getX() + width - padding - 30;
    const y = this.getY() + padding + 10;
    this.countSprite.position.set(x, y, 1);
  }

  private onNewEntry(entry: any): void {
    this.entries.push(entry);

    // Trim old entries
    if (this.entries.length > this.config.maxVisibleEntries * 2) {
      this.entries = this.entries.slice(-this.config.maxVisibleEntries);
    }

    this.rebuildTextSprites();
    this.updateCount();
  }

  private rebuildTextSprites(): void {
    // Remove old sprites
    this.textSprites.forEach(ts => {
      ts.sprite.material.map?.dispose();
      ts.sprite.material.dispose();
      this.scene.remove(ts.sprite);
    });
    this.textSprites = [];

    const visibleEntries = this.entries.slice(-this.config.maxVisibleEntries);
    const { width, padding, lineHeight, fontSize, showTimestamps, showLevels, height } = this.config;
    const x = this.getX() + padding;
    let y = this.getY() + height - padding - this.config.fontSize * 1.5;
    const maxLines = this.config.maxVisibleEntries;

    // We need to render from bottom up for proper stacking
    const visibleEntriesReversed = [...visibleEntries].reverse().slice(0, maxLines);

    visibleEntriesReversed.forEach((entry, index) => {
      const time = new Date(entry.timestamp);
      const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}.${time.getMilliseconds().toString().padStart(3, '0')}`;
      const levelStr = entry.level.toUpperCase();
      const levelColor = this.config.levelColors[entry.level as keyof typeof this.config.levelColors] || 0xe8f4f0;
      const contextStr = entry.context ? `[${entry.context}]` : '';

      let text = '';
      if (this.config.showTimestamps) text += `${timeStr} `;
      if (this.config.showLevels) text += `[${levelStr}] `;
      if (entry.context) text += `[${entry.context}] `;
      text += entry.message;

      // Create sprites for each part with different colors
      const parts: { text: string; color: number; bold: boolean }[] = [];
      if (this.config.showTimestamps) parts.push({ text: timeStr + ' ', color: 0x64748b, bold: false });
      if (this.config.showLevels) parts.push({ text: `[${levelStr}] `, color: entry.level === 'error' ? 0xef4444 : entry.level === 'warn' ? 0xf59e0b : entry.level === 'info' ? 0x3b82f6 : 0x64748b, bold: true });
      if (entry.context) parts.push({ text: `[${entry.context}] `, color: 0x42d9c5, bold: false });
      parts.push({ text: entry.message, color: 0xe8f4f0, bold: false });

      let xOffset = this.getX() + this.config.padding;
      const yPos = this.getY() + this.config.height - this.config.padding - (index + 1) * (this.config.fontSize * this.config.lineHeight);

      parts.forEach(part => {
        const texture = this.createTextTexture(part.text, this.config.fontSize, part.color, part.bold);
        const spriteMaterial = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        const metrics = this.fontContext.measureText(part.text);
        sprite.scale.set(metrics.width, this.config.fontSize * 1.2, 1);
        sprite.position.set(
          this.getX() + this.config.padding + this.getTextWidth(part.text) / 2,
          yPos,
          1001
        );
        sprite.renderOrder = 1000;
        this.scene.add(sprite);
        this.textSprites.push({ sprite, texture, entry, yOffset: yPos });

        // Update x offset for next part
        xOffset += this.getTextWidth(part.text);
      });
    });

    // Update header and count positions
    this.updateHeaderPosition();
    this.updateCountPosition();
  }

  private getTextWidth(text: string): number {
    return this.fontContext.measureText(text).width;
  }

  private updateCount(): void {
    if (this.countSprite) {
      const texture = this.createTextTexture(this.entries.length.toString(), this.config.fontSize, 0xa0c4b8);
      this.countSprite.material.map?.dispose();
      this.countSprite.material.map = texture;
      this.countSprite.material.needsUpdate = true;
      this.countSprite.material.map = texture;
    }
  }

  private setVisibility(visible: boolean): void {
    this.isVisible = visible;
    if (this.backgroundMesh) this.backgroundMesh.visible = visible;
    if (this.borderMesh) this.borderMesh.visible = visible;
    if (this.headerSprite) this.headerSprite.visible = visible;
    if (this.countSprite) this.countSprite.visible = visible;
    this.textSprites.forEach(ts => ts.sprite.visible = visible);
  }

  toggle(): void {
    this.setVisibility(!this.isVisible);
  }

  show(): void {
    this.setVisibility(true);
  }

  hide(): void {
    this.setVisibility(false);
  }

  private bindKeys(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === this.config.keybind && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.toggle();
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  private getX(): number {
    const { position, width, padding } = this.config;
    switch (position) {
      case 'top-left': return padding;
      case 'top-right': return window.innerWidth - width - padding;
      case 'bottom-left': return padding;
      case 'bottom-right': return window.innerWidth - width - padding;
    }
  }

  private getY(): number {
    const { position, height, padding } = this.config;
    switch (position) {
      case 'top-left':
      case 'top-right': return padding;
      case 'bottom-left':
      case 'bottom-right': return window.innerHeight - height - padding;
    }
  }

  private get height(): number {
    return this.config.height;
  }

  setConfig(config: Partial<InGameLogHUD3DConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Call this in the game's render loop
  render(renderer: THREE.WebGLRenderer): void {
    if (!this.isVisible || !this.isInitialized) return;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }

  destroy(): void {
    this.textSprites.forEach(ts => {
      if (ts.sprite && ts.sprite.material) {
        ts.sprite.material.map?.dispose();
        ts.sprite.material.dispose();
      }
      if (ts.sprite) this.scene.remove(ts.sprite);
    });
    this.textureCache.forEach(t => t.dispose());
    this.textureCache.clear();

    this.textSprites = [];

    if (this.backgroundMesh) {
      this.backgroundMesh.geometry.dispose();
      (this.backgroundMesh.material as THREE.Material).dispose();
      this.scene.remove(this.backgroundMesh);
      this.backgroundMesh = null;
    }
    if (this.borderMesh) {
      this.borderMesh.geometry.dispose();
      (this.borderMesh.material as THREE.Material).dispose();
      this.scene.remove(this.borderMesh);
      this.borderMesh = null;
    }
    if (this.headerSprite) {
      if (this.headerSprite.material) {
        this.headerSprite.material.map?.dispose();
        this.headerSprite.material.dispose();
      }
      this.scene.remove(this.headerSprite);
      this.headerSprite = null;
    }
    if (this.countSprite) {
      if (this.countSprite.material) {
        this.countSprite.material.map?.dispose();
        this.countSprite.material.dispose();
      }
      this.scene.remove(this.countSprite);
      this.countSprite = null;
    }
    this.scene.clear();
  }
}

export function initInGameLogHUD3D(logConsole: any, config?: Partial<InGameLogHUD3DConfig>): InGameLogHUD3D {
  return new InGameLogHUD3D(logConsole, config);
}