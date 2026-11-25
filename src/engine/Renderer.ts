/**
 * Three.js Renderer Wrapper
 * Manages WebGLRenderer, scene, camera, and render loop integration
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GraphicsSettings, ScreenMode, ShadowQuality, TextureQuality } from '@core/Types.js';
import { DEFAULT_GRAPHICS_SETTINGS, GRAPHICS_PRESETS } from '@core/Config.js';

// ============================================================================
// RENDERER CLASS
// ============================================================================

export class Renderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private renderTarget: THREE.WebGLRenderTarget | null = null;

  private settings: GraphicsSettings = { ...DEFAULT_GRAPHICS_SETTINGS };
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;

  // Callbacks
  public onResize: ((width: number, height: number) => void) | null = null;
  public onBeforeRender: (() => void) | null = null;
  public onAfterRender: (() => void) | null = null;

  constructor(container: HTMLElement, canvas?: HTMLCanvasElement) {
    this.container = container;

    // Create or use provided canvas
    this.canvas = canvas ?? document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    if (!canvas) container.appendChild(this.canvas);

    // Initialize Three.js renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    });

    this.configureRenderer();

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x081426);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      65, // FOV
      container.clientWidth / container.clientHeight,
      0.1, // near
      1000 // far
    );
    this.camera.position.set(0, 5, 10);

    // Setup post-processing
    this.setupPostProcessing();

    // Handle resize
    window.addEventListener('resize', this.handleResize.bind(this));
    this.handleResize();
  }

  private configureRenderer(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // physicallyCorrectLights is deprecated in Three.js r155+, it's now the default behavior
  }

  private setupPostProcessing(): void {
    // Basic EffectComposer setup for bloom, etc.
    // Will be expanded when we add post-processing passes
    this.renderTarget = new THREE.WebGLRenderTarget(
      this.container.clientWidth,
      this.container.clientHeight,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        colorSpace: THREE.SRGBColorSpace,
      }
    );
  }

  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    if (this.renderTarget) {
      this.renderTarget.setSize(
        Math.floor(width * this.settings.resolutionScale),
        Math.floor(height * this.settings.resolutionScale)
      );
    }

    if (this.composer) {
      this.composer.setSize(
        Math.floor(width * this.settings.resolutionScale),
        Math.floor(height * this.settings.resolutionScale)
      );
    }

    this.onResize?.(width, height);
  }

  // ---- Public API ----

  render(): void {
    this.onBeforeRender?.();

    if (this.composer && (this.settings.bloom || this.settings.motionBlur)) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    this.onAfterRender?.();
  }

  // Render HUD elements (called after main scene)
  renderHUD(hudScene: THREE.Scene, hudCamera: THREE.Camera): void {
    this.renderer.autoClear = false;
    this.renderer.render(hudScene, hudCamera);
    this.renderer.autoClear = true;
  }

  renderShadowMap(light: THREE.Light, camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }

  // ---- Settings Application ----

  applySettings(settings: Partial<GraphicsSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.applyCurrentSettings();
  }

  applyPreset(preset: keyof typeof GRAPHICS_PRESETS): void {
    const presetSettings = GRAPHICS_PRESETS[preset];
    if (presetSettings) {
      this.settings = { ...DEFAULT_GRAPHICS_SETTINGS, ...presetSettings };
      this.applyCurrentSettings();
    }
  }

  private applyCurrentSettings(): void {
    const s = this.settings;

    // Resolution scale
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const scaledWidth = Math.floor(width * s.resolutionScale);
    const scaledHeight = Math.floor(height * s.resolutionScale);

    this.renderer.setSize(scaledWidth, scaledHeight, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio * s.resolutionScale, 2));

    if (this.renderTarget) {
      this.renderTarget.setSize(scaledWidth, scaledHeight);
    }
    if (this.composer) {
      this.composer.setSize(scaledWidth, scaledHeight);
    }

    // Shadow quality
    this.applyShadowQuality(s.shadowQuality);

    // Tone mapping
    switch (s.toneMapping) {
      case 'aces': this.renderer.toneMapping = THREE.ACESFilmicToneMapping; break;
      case 'reinhard': this.renderer.toneMapping = THREE.ReinhardToneMapping; break;
      case 'cineon': this.renderer.toneMapping = THREE.CineonToneMapping; break;
      default: this.renderer.toneMapping = THREE.NoToneMapping;
    }

    // VSync / FPS limit handled at game loop level
  }

  private applyShadowQuality(quality: ShadowQuality): void {
    this.renderer.shadowMap.enabled = quality !== ShadowQuality.Off;

    if (quality === ShadowQuality.Off) return;

    // Shadow map quality settings would be applied per-light
    // This is a global hint for the renderer
    switch (quality) {
      case ShadowQuality.Low:
        this.renderer.shadowMap.type = THREE.BasicShadowMap;
        break;
      case ShadowQuality.Medium:
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        break;
      case ShadowQuality.High:
      case ShadowQuality.Ultra:
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        break;
    }
  }

  // ---- Texture Quality ----

  setTextureQuality(quality: TextureQuality): void {
    const maxSizeMap: Record<TextureQuality, number> = {
      [TextureQuality.Low]: 512,
      [TextureQuality.Medium]: 1024,
      [TextureQuality.High]: 2048,
      [TextureQuality.Ultra]: 4096,
    };

    const maxSize = maxSizeMap[quality];
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of materials) {
          if (material.map) {
            material.map.maxFilter = THREE.LinearFilter;
            // Note: Actual texture resizing would need reloading
          }
          if (material.normalMap) material.normalMap.maxFilter = THREE.LinearFilter;
          if (material.roughnessMap) material.roughnessMap.maxFilter = THREE.LinearFilter;
          if (material.metalnessMap) material.metalnessMap.maxFilter = THREE.LinearFilter;
          if (material.aoMap) material.aoMap.maxFilter = THREE.LinearFilter;
        }
      }
    });
  }

  // ---- Getters ----

  getThreeRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getSettings(): GraphicsSettings {
    return { ...this.settings };
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  // ---- Camera Helpers ----

  setCameraPosition(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
  }

  setCameraTarget(x: number, y: number, z: number): void {
    this.camera.lookAt(x, y, z);
  }

  // ---- Cleanup ----

  dispose(): void {
    window.removeEventListener('resize', this.handleResize.bind(this));
    this.renderer.dispose();
    this.renderTarget?.dispose();
    this.composer?.dispose();
    this.scene.clear();
  }
}

// ============================================================================
// RENDER STATS (for debug)
// ============================================================================

export interface RenderStats {
  fps: number;
  frameTime: number;
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
}

export function getRenderStats(renderer: THREE.WebGLRenderer): RenderStats {
  const info = renderer.info;
  return {
    fps: 0, // Calculated externally
    frameTime: 0, // Calculated externally
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    points: info.render.points,
    lines: info.render.lines,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  };
}