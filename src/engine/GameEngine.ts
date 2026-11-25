/**
 * Game Engine - Main bootstrap and game loop
 * Coordinates renderer, input, ECS world, and game states
 */

import * as THREE from 'three';
import { World, BaseSystem } from '@core/ECS.js';
import { Renderer } from './Renderer.js';
import { InputManager } from './InputManager.js';
import { AssetLoader } from './AssetLoader.js';
import { GameState } from '@core/Types.js';
import { ENGINE_CONFIG, WORLD_CONFIG } from '@core/Config.js';

// ============================================================================
// GAME ENGINE CLASS
// ============================================================================

export class GameEngine {
  private renderer: Renderer;
  private inputManager: InputManager;
  private assetLoader: AssetLoader;
  private world: World;

  private state: GameState = GameState.Boot;
  private previousState: GameState = GameState.Boot;

  private isRunning = false;
  private lastTime = 0;
  private accumulator = 0;
  private frameCount = 0;
  private fps = 0;
  private fpsUpdateTime = 0;

  // Systems (added in order of priority)
  private systems: BaseSystem[] = [];

  // Callbacks
  public onStateChange?: (newState: GameState, oldState: GameState) => void;
  public onLoadingProgress?: (progress: number, stage: string) => void;

  // Canvas reference
  private canvas: HTMLCanvasElement;

  constructor(container: HTMLElement) {
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);

    // Initialize core systems
    this.renderer = new Renderer(container, this.canvas);
    this.inputManager = new InputManager(this.canvas);
    this.assetLoader = new AssetLoader(this.renderer.getThreeRenderer());
    this.world = new World();

    // Setup asset loader progress
    this.assetLoader.setProgressCallback(progress => {
      this.onLoadingProgress?.(progress.percentage, progress.currentFile);
    });

    // Bind renderer resize to update camera
    this.renderer.onResize = (width, height) => {
      // Camera aspect already updated in renderer
    };

    console.log('[GameEngine] Initialized');
  }

  // ---- Initialization ----

  async initialize(): Promise<void> {
    console.log('[GameEngine] Starting initialization...');
    this.changeState(GameState.Loading);

    try {
      // Load core assets
      console.log('[GameEngine] Loading core assets...');
      await this.loadCoreAssets();
      console.log('[GameEngine] Core assets loaded');

      // Initialize game systems
      console.log('[GameEngine] Initializing systems...');
      this.initializeSystems();
      console.log('[GameEngine] Systems initialized');

      console.log('[GameEngine] Initialization complete');
      this.changeState(GameState.MainMenu);
      console.log('[GameEngine] State changed to MainMenu');
    } catch (error) {
      console.error('[GameEngine] Initialization failed:', error);
      throw error;
    }
  }

  private async loadCoreAssets(): Promise<void> {
    console.log('[GameEngine] Loading shaders...');
    this.onLoadingProgress?.(0.1, 'Loading shaders...');
    // Shaders would be loaded here

    console.log('[GameEngine] Loading core models...');
    this.onLoadingProgress?.(0.3, 'Loading core models...');
    // Core models (player, basic weapons, etc.)

    console.log('[GameEngine] Loading environment...');
    this.onLoadingProgress?.(0.6, 'Loading environment...');
    // Skybox, base terrain materials

    console.log('[GameEngine] Core assets ready');
    this.onLoadingProgress?.(1.0, 'Ready');
  }

  private initializeSystems(): void {
    // Systems will be added here in Phase 1
    // For now, empty - we'll add them as we build
  }

  // ---- Game Loop ----

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.gameLoop();
  }

  stop(): void {
    this.isRunning = false;
  }

  private gameLoop(): void {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000; // seconds
    this.lastTime = currentTime;

    // Clamp delta time to prevent spiral of death
    const clampedDt = Math.min(deltaTime, 1 / 30);

    // Fixed timestep accumulation
    this.accumulator += clampedDt;
    const fixedDt = ENGINE_CONFIG.fixedTimestep;

    // Update FPS counter
    this.frameCount++;
    if (currentTime - this.fpsUpdateTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsUpdateTime = currentTime;
    }

    // Run fixed timestep updates
    let subSteps = 0;
    while (this.accumulator >= fixedDt && subSteps < ENGINE_CONFIG.maxSubSteps) {
      this.fixedUpdate(fixedDt);
      this.accumulator -= fixedDt;
      subSteps++;
    }

    // Interpolation factor for rendering
    const alpha = this.accumulator / fixedDt;

    // Variable timestep update (for input, camera, etc.)
    this.variableUpdate(clampedDt);

    // Render
    this.render(alpha);

    // Continue loop
    requestAnimationFrame(() => this.gameLoop());
  }

  private fixedUpdate(dt: number): void {
    // Update input
    this.inputManager.update();

    // Update ECS world (gameplay systems)
    this.world.update(dt);

    // Update custom systems
    for (const system of this.systems) {
      system.update(dt);
    }
  }

  private variableUpdate(dt: number): void {
    // Camera updates, UI, etc. would go here
  }

  private render(alpha: number): void {
    this.renderer.render();

    // Render In-Game Log HUD 3D after main scene
    const hud = (window as any).inGameLogHUD3D;
    if (hud && hud.isInitialized) {
      console.log('[GameEngine] Rendering HUD3D, hud:', hud, 'isVisible:', hud.isVisible, 'initialized:', hud.isInitialized);
      hud.render(this.renderer);
    } else {
      console.log('[GameEngine] HUD3D not ready:', hud ? 'not initialized' : 'not found');
    }
  }

  // ---- State Management ----

  changeState(newState: GameState): void {
    if (newState === this.state) return;

    const oldState = this.state;
    this.previousState = oldState;
    this.state = newState;

    console.log(`[GameEngine] State: ${oldState} -> ${newState}`);

    // State-specific logic
    this.onStateEnter(newState, oldState);

    console.log(`[GameEngine] Calling onStateChange callback...`);
    this.onStateChange?.(newState, oldState);
    console.log(`[GameEngine] onStateChange callback done`);
  }

  private onStateEnter(newState: GameState, oldState: GameState): void {
    switch (newState) {
      case GameState.MainMenu:
        this.setupMainMenu();
        break;
      case GameState.Gameplay:
        this.setupGameplay();
        break;
      case GameState.PauseMenu:
        this.setupPauseMenu();
        break;
      case GameState.Loading:
        // Already in loading
        break;
    }
  }

  private setupMainMenu(): void {
    // Show main menu UI, start background scene
    document.body.classList.add('state-mainmenu');
    document.body.classList.remove('state-gameplay', 'state-paused');
  }

  private setupGameplay(): void {
    // Hide menus, enable gameplay input
    document.body.classList.add('state-gameplay');
    document.body.classList.remove('state-mainmenu', 'state-paused');
    this.canvas.requestPointerLock();
  }

  private setupPauseMenu(): void {
    document.body.classList.add('state-paused');
    document.exitPointerLock();
  }

  // ---- Public API ----

  getRenderer(): Renderer {
    return this.renderer;
  }

  getInputManager(): InputManager {
    return this.inputManager;
  }

  getAssetLoader(): AssetLoader {
    return this.assetLoader;
  }

  getWorld(): World {
    return this.world;
  }

  getState(): GameState {
    return this.state;
  }

  getPreviousState(): GameState {
    return this.previousState;
  }

  getFPS(): number {
    return this.fps;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  addSystem(system: BaseSystem): void {
    system.setWorld(this.world);
    this.systems.push(system);
    this.systems.sort((a, b) => a.priority - b.priority);
    this.world.addSystem(system);
  }

  // ---- Cleanup ----

  destroy(): void {
    this.stop();
    this.inputManager.destroy();
    this.assetLoader.dispose();
    this.renderer.dispose();
    this.world.clear();
    this.canvas.remove();
  }
}

// ============================================================================
// ENGINE FACTORY
// ============================================================================

export async function createGameEngine(container: HTMLElement): Promise<GameEngine> {
  const engine = new GameEngine(container);
  await engine.initialize();
  return engine;
}