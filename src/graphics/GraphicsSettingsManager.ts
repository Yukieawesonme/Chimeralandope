/**
 * Graphics Settings Manager - Real-time graphics options
 * Handles presets, live application, and persistence
 */

import { GraphicsSettings, GraphicsPreset, ShadowQuality, TextureQuality, ScreenMode, Vec2 } from '@core/Types.js';
import { DEFAULT_GRAPHICS_SETTINGS, GRAPHICS_PRESETS } from '@core/Config.js';
import { SaveManager } from '@save/SaveManager.js';

// ============================================================================
// GRAPHICS SETTINGS MANAGER
// ============================================================================

export class GraphicsSettingsManager {
  private settings: GraphicsSettings;
  private pendingSettings: Partial<GraphicsSettings> = {};
  private saveManager: SaveManager;
  private renderer: any = null; // Will be set after renderer init
  private callbacks: Set<(settings: GraphicsSettings) => void> = new Set();

  constructor(saveManager: SaveManager) {
    this.saveManager = saveManager;
    this.settings = { ...DEFAULT_GRAPHICS_SETTINGS };
    this.loadSettings();
  }

  setRenderer(renderer: any): void {
    this.renderer = renderer;
    this.applySettings(this.settings);
  }

  // ---- Settings Access ----

  getSettings(): GraphicsSettings {
    return { ...this.settings };
  }

  getPendingSettings(): Partial<GraphicsSettings> {
    return { ...this.pendingSettings };
  }

  // ---- Preset Management ----

  applyPreset(preset: GraphicsPreset): void {
    const presetSettings = GRAPHICS_PRESETS[preset];
    if (!presetSettings) {
      console.warn(`[GraphicsSettings] Unknown preset: ${preset}`);
      return;
    }

    this.pendingSettings = { ...presetSettings };
    this.settings = { ...this.settings, ...presetSettings, preset };
    this.applySettings(this.settings);
    this.saveSettings();
    this.notifyCallbacks();
  }

  // ---- Individual Setting Changes ----

  setSetting<K extends keyof GraphicsSettings>(key: K, value: GraphicsSettings[K]): void {
    // Validate value
    if (!this.validateSetting(key, value)) {
      console.warn(`[GraphicsSettings] Invalid value for ${key}:`, value);
      return;
    }

    this.pendingSettings[key] = value;
    this.settings[key] = value;

    // If preset was Custom, keep it Custom; otherwise switch to Custom
    if (this.settings.preset !== GraphicsPreset.Custom) {
      this.settings.preset = GraphicsPreset.Custom;
    }

    this.applySetting(key, value);
    this.notifyCallbacks();
  }

  setSettings(partial: Partial<GraphicsSettings>): void {
    for (const key of Object.keys(partial) as (keyof GraphicsSettings)[]) {
      const value = partial[key];
      if (value !== undefined && this.validateSetting(key, value)) {
        (this.pendingSettings as any)[key] = value;
        (this.settings as any)[key] = value;
      }
    }

    if (this.settings.preset !== GraphicsPreset.Custom) {
      this.settings.preset = GraphicsPreset.Custom;
    }

    this.applySettings(this.settings);
    this.saveSettings();
    this.notifyCallbacks();
  }

  // ---- Validation ----

  private validateSetting<K extends keyof GraphicsSettings>(key: K, value: GraphicsSettings[K]): boolean {
    const v = value as any; // TypeScript can't narrow union types in switch
    switch (key) {
      case 'resolution':
        return v.x >= 640 && v.x <= 7680 && v.y >= 360 && v.y <= 4320;
      case 'screenMode':
        return Object.values(ScreenMode).includes(v);
      case 'vSync':
      case 'bloom':
      case 'motionBlur':
      case 'colorGrading':
      case 'dynamicResolution':
        return typeof v === 'boolean';
      case 'fpsLimit':
        return [0, 30, 60, 120, 144, 240].includes(v);
      case 'textureQuality':
        return Object.values(TextureQuality).includes(v);
      case 'anisotropicFiltering':
        return [1, 2, 4, 8, 16].includes(v);
      case 'shadowQuality':
        return Object.values(ShadowQuality).includes(v);
      case 'shadowDistance':
        return v >= 10 && v <= 500;
      case 'shadowCascades':
        return [1, 2, 3, 4].includes(v);
      case 'bloomIntensity':
      case 'motionBlurIntensity':
        return v >= 0 && v <= 2;
      case 'toneMapping':
        return ['none', 'aces', 'reinhard', 'cineon'].includes(v);
      case 'renderDistance':
        return v >= 50 && v <= 1000;
      case 'lodBias':
        return v >= 0.25 && v <= 4;
      case 'foliageDensity':
      case 'particleDensity':
      case 'resolutionScale':
        return v >= 0.25 && v <= 1.5;
      case 'targetFPS':
        return [30, 60, 75, 120, 144, 240].includes(v);
      case 'preset':
        return Object.values(GraphicsPreset).includes(v);
      default:
        return true;
    }
  }

  // ---- Application ----

  private applySettings(settings: GraphicsSettings): void {
    if (!this.renderer) {
      console.warn('[GraphicsSettings] Renderer not set, deferring application');
      return;
    }

    // Apply to renderer
    this.renderer.applySettings(settings);

    // Apply to engine systems
    this.applyToSystems(settings);
  }

  private applySetting<K extends keyof GraphicsSettings>(key: K, value: GraphicsSettings[K]): void {
    if (!this.renderer) return;

    switch (key) {
      case 'resolution':
      case 'screenMode':
        this.applyDisplayMode(value as Vec2, this.settings.screenMode);
        break;
      case 'vSync':
        // Handled in game loop
        break;
      case 'fpsLimit':
        // Handled in game loop
        break;
      case 'textureQuality':
        this.renderer.setTextureQuality(value as TextureQuality);
        break;
      case 'shadowQuality':
      case 'shadowDistance':
      case 'shadowCascades':
        this.renderer.applySettings(this.settings); // Re-apply all shadow settings
        break;
      case 'bloom':
      case 'bloomIntensity':
      case 'motionBlur':
      case 'motionBlurIntensity':
      case 'toneMapping':
      case 'colorGrading':
        this.renderer.applySettings(this.settings);
        break;
      case 'renderDistance':
      case 'lodBias':
      case 'foliageDensity':
      case 'particleDensity':
      case 'resolutionScale':
      case 'dynamicResolution':
      case 'targetFPS':
        this.renderer.applySettings(this.settings);
        break;
    }
  }

  private applyDisplayMode(resolution: Vec2, screenMode: ScreenMode): void {
    const canvas = this.renderer.getCanvas();

    switch (screenMode) {
      case ScreenMode.Fullscreen:
        if (document.fullscreenElement !== canvas) {
          canvas.requestFullscreen().catch(console.error);
        }
        break;
      case ScreenMode.Borderless:
        if (document.fullscreenElement === canvas) {
          document.exitFullscreen();
        }
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        break;
      case ScreenMode.Windowed:
        if (document.fullscreenElement === canvas) {
          document.exitFullscreen();
        }
        canvas.style.width = `${resolution.x}px`;
        canvas.style.height = `${resolution.y}px`;
        canvas.style.position = '';
        break;
    }

    // Resize renderer to match
    this.renderer.getThreeRenderer().setSize(resolution.x, resolution.y, false);
  }

  private applyToSystems(settings: GraphicsSettings): void {
    // This would notify other systems (terrain, foliage, particles, etc.)
    // For now, just a placeholder
    this.notifySystemSettings(settings);
  }

  // ---- Persistence ----

  private loadSettings(): void {
    const saved = this.saveManager.loadGraphicsSettings();
    if (saved) {
      // Merge with defaults, preserving any new settings
      this.settings = { ...DEFAULT_GRAPHICS_SETTINGS, ...saved };
      this.applySettings(this.settings);
    }
  }

  private saveSettings(): void {
    this.saveManager.saveGraphicsSettings(this.settings);
  }

  // ---- Callbacks ----

  subscribe(callback: (settings: GraphicsSettings) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private notifyCallbacks(): void {
    for (const callback of this.callbacks) {
      callback(this.settings);
    }
  }

  private notifySystemSettings(settings: GraphicsSettings): void {
    // Emit event for other systems
    window.dispatchEvent(new CustomEvent('graphics-settings-changed', { detail: settings }));
  }

  // ---- Preset Helpers ----

  getPresetOptions(): { value: GraphicsPreset; label: string; description: string }[] {
    return [
      { value: GraphicsPreset.Low, label: 'Baixo (Performance)', description: 'Para hardware antigo / mobile, 30 FPS alvo' },
      { value: GraphicsPreset.Medium, label: 'Médio (Equilibrado)', description: 'Balanceado para a maioria dos PCs, 60 FPS alvo' },
      { value: GraphicsPreset.High, label: 'Alto (Qualidade)', description: 'Boa qualidade visual, 60 FPS alvo' },
      { value: GraphicsPreset.Ultra, label: 'Ultra (Máximo)', description: 'Máxima qualidade, hardware high-end, 120+ FPS' },
      { value: GraphicsPreset.Custom, label: 'Personalizado', description: 'Configurações manuais individuais' },
    ];
  }

  getCurrentPreset(): GraphicsPreset {
    return this.settings.preset;
  }

  // ---- Reset ----

  resetToDefaults(): void {
    this.settings = { ...DEFAULT_GRAPHICS_SETTINGS };
    this.pendingSettings = {};
    this.applySettings(this.settings);
    this.saveSettings();
    this.notifyCallbacks();
  }

  // ---- Export/Import ----

  exportSettings(): string {
    return JSON.stringify(this.settings, null, 2);
  }

  importSettings(json: string): boolean {
    try {
      const imported = JSON.parse(json);
      const result = this.validateAllSettings(imported);
      if (!result.valid) {
        console.error('[GraphicsSettings] Import validation failed:', result.errors);
        return false;
      }
      this.settings = { ...DEFAULT_GRAPHICS_SETTINGS, ...imported };
      this.applySettings(this.settings);
      this.saveSettings();
      this.notifyCallbacks();
      return true;
    } catch (error) {
      console.error('[GraphicsSettings] Import failed:', error);
      return false;
    }
  }

  private validateAllSettings(settings: Partial<GraphicsSettings>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    for (const [key, value] of Object.entries(settings)) {
      if (!this.validateSetting(key as keyof GraphicsSettings, value)) {
        errors.push(`Invalid ${key}: ${value}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }
}