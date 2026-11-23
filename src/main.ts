/**
 * ChimeraLand 3D - Main Entry Point
 * Bootstraps the game engine and starts the application
 */

import { createGameEngine } from '@engine/GameEngine.js';
import { GameState } from '@core/Types.js';
import { SaveManager } from '@save/SaveManager.js';
import { GraphicsSettingsManager } from '@graphics/GraphicsSettingsManager.js';
import { PlayerSystem } from '@entities/Player.js';
import { TerrainSystem } from '@world/TerrainSystem.js';
import { BiomeManager } from '@world/BiomeManager.js';
import { MainMenu3D } from '@ui/MainMenu3D.js';
import { LoadingScreen, LoadingStage } from '@ui/LoadingScreen.js';

// ============================================================================
// GLOBAL REFERENCES
// ============================================================================

let engine: any = null;
let saveManager: SaveManager;
let graphicsManager: GraphicsSettingsManager;
let playerSystem: PlayerSystem;
let terrainSystem: TerrainSystem;
let biomeManager: BiomeManager;
let mainMenu3D: MainMenu3D;
let loadingScreen: LoadingScreen;

// ============================================================================
// INITIALIZATION
// ============================================================================

async function main(): Promise<void> {
  console.log('🧬 ChimeraLand 3D - Starting...');

  // Get container
  const container = document.getElementById('game-container');
  if (!container) {
    console.error('Game container not found!');
    return;
  }

  // Initialize managers
  saveManager = new SaveManager();
  graphicsManager = new GraphicsSettingsManager(saveManager);

  // Create and initialize engine
  engine = await createGameEngine(container);
  graphicsManager.setRenderer(engine.getRenderer());

  // Initialize game systems
  initializeGameSystems();

  // Setup UI
  setupUI();

  // Load saved graphics settings
  loadGraphicsSettings();

  // Initialize MainMenu3D and LoadingScreen
  await initializeMenuAndLoading();

  // Start game loop
  engine.start();

  console.log('✅ ChimeraLand 3D - Running!');
}

function initializeGameSystems(): void {
  const world = engine.getWorld();
  const inputManager = engine.getInputManager();
  const camera = engine.getRenderer().getCamera();
  const renderer = engine.getRenderer();
  const assetLoader = engine.getAssetLoader();

  // Biome Manager
  biomeManager = new BiomeManager(saveManager.getWorldSeed() || 'chimeraland_seed');

  // Terrain System
  terrainSystem = new TerrainSystem(world);
  engine.addSystem(terrainSystem);

  // Player System
  playerSystem = new PlayerSystem(world, inputManager, camera);
  engine.addSystem(playerSystem);

  // Create player entity (will be properly positioned during load)
  const spawnPos = { x: 0, y: 35, z: 0 };
  playerSystem.createPlayer(spawnPos);

  // Connect player to terrain
  const playerComp = playerSystem.getPlayerComponent();
  if (playerComp) {
    const originalUpdate = playerSystem.update.bind(playerSystem);
    playerSystem.update = (dt: number) => {
      originalUpdate(dt);
      if (playerComp && engine.getState() === GameState.Gameplay) {
        const transform = playerSystem['transformComp'];
        if (transform) {
          terrainSystem.updatePlayerPosition({
            x: transform.position.x,
            y: transform.position.y,
            z: transform.position.z
          });
        }
      }
    };
  }

  // Create MainMenu3D
  mainMenu3D = new MainMenu3D(renderer, assetLoader, biomeManager, terrainSystem);

  // Create LoadingScreen
  loadingScreen = new LoadingScreen(
    terrainSystem,
    biomeManager,
    assetLoader,
    saveManager,
    playerSystem,
    world
  );

  // Wire up loading screen callbacks
  loadingScreen.onProgress(progress => {
    updateLoadingScreenUI(progress);
  });

  loadingScreen.onComplete(saveData => {
    onLoadingComplete(saveData);
  });

  loadingScreen.onError(error => {
    console.error('Loading failed:', error);
    showErrorScreen(error.message);
  });

  // Listen for state changes
  engine.onStateChange = (newState: GameState, oldState: GameState) => {
    handleStateChange(newState, oldState);
  };
}

async function initializeMenuAndLoading(): Promise<void> {
  // Initialize MainMenu3D (loads environment, creatures)
  await mainMenu3D.initialize();

  // Start at MainMenu
  engine.changeState(GameState.MainMenu);
}

function handleStateChange(newState: GameState, oldState: GameState): void {
  const loadingScreenEl = document.getElementById('loading-screen');
  const mainMenu = document.getElementById('main-menu');
  const pauseMenu = document.getElementById('pause-menu');
  const hud = document.getElementById('hud');
  const errorScreen = document.getElementById('error-screen');

  // Hide all
  loadingScreenEl?.classList.add('hidden');
  mainMenu?.classList.add('hidden');
  pauseMenu?.classList.add('hidden');
  hud?.classList.add('hidden');
  errorScreen?.classList.add('hidden');

  switch (newState) {
    case GameState.Loading:
      loadingScreenEl?.classList.remove('hidden');
      break;
    case GameState.MainMenu:
      mainMenu?.classList.remove('hidden');
      mainMenu3D.activate();
      break;
    case GameState.Gameplay:
      hud?.classList.remove('hidden');
      mainMenu3D.deactivate();
      break;
    case GameState.PauseMenu:
      pauseMenu?.classList.remove('hidden');
      hud?.classList.remove('hidden');
      break;
  }
}

function updateLoadingScreenUI(progress: any): void {
  const bar = document.getElementById('loading-bar');
  const text = document.getElementById('loading-text');
  const stageEl = document.getElementById('loading-stage');
  const detailsEl = document.getElementById('loading-details');

  if (bar) bar.style.width = `${progress.overallProgress * 100}%`;
  if (text) text.textContent = progress.message;
  if (stageEl) stageEl.textContent = `Etapa: ${progress.stage}`;
  if (detailsEl) detailsEl.textContent = progress.details || '';
}

function onLoadingComplete(saveData?: any): void {
  // If loading a save, restore player state
  if (saveData) {
    playerSystem.deserializePlayerState(saveData.player);
    saveManager.setWorldSeed(saveData.metadata.worldSeed);
    biomeManager = new BiomeManager(saveData.metadata.worldSeed);
  }

  // Enter gameplay
  engine.changeState(GameState.Gameplay);
}

function showErrorScreen(message: string): void {
  const errorScreen = document.getElementById('error-screen');
  const errorMsg = document.getElementById('error-message');
  if (errorMsg) errorMsg.textContent = message;
  errorScreen?.classList.remove('hidden');

  // Hide other screens
  document.getElementById('loading-screen')?.classList.add('hidden');
  document.getElementById('main-menu')?.classList.add('hidden');
}

// ============================================================================
// UI SETUP
// ============================================================================

function setupUI(): void {
  // Main Menu Buttons
  const newGameBtn = document.getElementById('btn-new-game');
  const loadGameBtn = document.getElementById('btn-load-game');
  const settingsBtn = document.getElementById('btn-settings');
  const quitBtn = document.getElementById('btn-quit');

  newGameBtn?.addEventListener('click', () => startNewGame());
  loadGameBtn?.addEventListener('click', () => showLoadMenu());
  settingsBtn?.addEventListener('click', () => showSettingsMenu());
  quitBtn?.addEventListener('click', () => window.close());

  // Load Menu
  const loadSlotsContainer = document.getElementById('load-slots');
  const backFromLoadBtn = document.getElementById('btn-back-from-load');
  backFromLoadBtn?.addEventListener('click', () => showMainMenu());
  refreshLoadSlots();

  // Settings Menu
  const graphicsSettingsContainer = document.getElementById('graphics-settings');
  const backFromSettingsBtn = document.getElementById('btn-back-from-settings');
  backFromSettingsBtn?.addEventListener('click', () => showMainMenu());
  setupGraphicsSettingsUI();

  // Pause Menu
  const resumeBtn = document.getElementById('btn-resume');
  const saveBtn = document.getElementById('btn-save');
  const loadBtn = document.getElementById('btn-load');
  const pauseSettingsBtn = document.getElementById('btn-pause-settings');
  const mainMenuBtn = document.getElementById('btn-main-menu');

  resumeBtn?.addEventListener('click', () => engine.changeState(GameState.Gameplay));
  saveBtn?.addEventListener('click', () => quickSave());
  loadBtn?.addEventListener('click', () => { engine.changeState(GameState.MainMenu); showLoadMenu(); });
  pauseSettingsBtn?.addEventListener('click', () => showSettingsMenu());
  mainMenuBtn?.addEventListener('click', () => { engine.changeState(GameState.MainMenu); showMainMenu(); });

  // Error screen retry
  const errorRetryBtn = document.getElementById('btn-error-retry');
  errorRetryBtn?.addEventListener('click', () => {
    document.getElementById('error-screen')?.classList.add('hidden');
    engine.changeState(GameState.MainMenu);
  });

  // HUD
  setupHUD();
}

function showMainMenu(): void {
  engine.changeState(GameState.MainMenu);
}

function showLoadMenu(): void {
  refreshLoadSlots();
  document.getElementById('main-menu')?.classList.add('hidden');
  document.getElementById('load-menu')?.classList.remove('hidden');
}

function showSettingsMenu(): void {
  document.getElementById('main-menu')?.classList.add('hidden');
  document.getElementById('pause-menu')?.classList.add('hidden');
  document.getElementById('settings-menu')?.classList.remove('hidden');
}

function refreshLoadSlots(): void {
  const container = document.getElementById('load-slots');
  if (!container) return;

  const slots = saveManager.getSaveSlots();
  container.innerHTML = '';

  for (const slot of slots) {
    const slotEl = document.createElement('div');
    slotEl.className = 'save-slot';
    slotEl.innerHTML = `
      <div class="slot-info">
        <span class="slot-name">${slot.slot}</span>
        ${slot.exists ? `
          <span class="slot-details">
            ${slot.playerName} · ${formatPlayTime(slot.playTimeSeconds ?? 0)} · ${slot.currentBiome}
          </span>
        ` : '<span class="slot-empty">Vazio</span>'}
      </div>
      ${slot.exists ? `
        <div class="slot-actions">
          <button class="btn-load-slot" data-slot="${slot.slot}">Carregar</button>
          <button class="btn-delete-slot" data-slot="${slot.slot}">Excluir</button>
        </div>
      ` : ''}
    `;
    container.appendChild(slotEl);
  }

  // Bind slot buttons
  container.querySelectorAll('.btn-load-slot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const slot = (e.target as HTMLButtonElement).dataset.slot!;
      loadGame(slot);
    });
  });

  container.querySelectorAll('.btn-delete-slot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const slot = (e.target as HTMLButtonElement).dataset.slot!;
      if (confirm(`Excluir save ${slot}?`)) {
        saveManager.deleteSlot(slot);
        refreshLoadSlots();
      }
    });
  });
}

async function loadGame(slot: string): Promise<void> {
  // Show loading screen
  engine.changeState(GameState.Loading);

  const data = saveManager.loadGame(slot);
  if (data) {
    await loadingScreen.loadGame(data);
  } else {
    engine.changeState(GameState.MainMenu);
  }
}

function startNewGame(): void {
  // Generate new world seed
  const seed = `chimeraland_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  saveManager.setWorldSeed(seed);
  biomeManager = new BiomeManager(seed);

  // Show loading screen
  engine.changeState(GameState.Loading);

  loadingScreen.startNewGame(seed);
}

function quickSave(): void {
  const playerData = playerSystem.serializePlayerState();
  saveManager.quickSave();
}

// ============================================================================
// GRAPHICS SETTINGS UI
// ============================================================================

function setupGraphicsSettingsUI(): void {
  const container = document.getElementById('graphics-settings');
  if (!container) return;

  const settings = graphicsManager.getSettings();
  const presets = graphicsManager.getPresetOptions();

  container.innerHTML = `
    <h3>Configurações Gráficas</h3>

    <div class="setting-group">
      <label>Preset: </label>
      <select id="graphics-preset">
        ${presets.map(p => `<option value="${p.value}" ${p.value === settings.preset ? 'selected' : ''}>${p.label}</option>`).join('')}
      </select>
      <p class="setting-desc">${presets.find(p => p.value === settings.preset)?.description}</p>
    </div>

    <div class="setting-group">
      <label>Modo de Tela: </label>
      <select id="screen-mode">
        <option value="Borderless" ${settings.screenMode === 'Borderless' ? 'selected' : ''}>Sem Borda</option>
        <option value="Fullscreen" ${settings.screenMode === 'Fullscreen' ? 'selected' : ''}>Tela Cheia</option>
        <option value="Windowed" ${settings.screenMode === 'Windowed' ? 'selected' : ''}>Janela</option>
      </select>
    </div>

    <div class="setting-group">
      <label>V-Sync: </label>
      <input type="checkbox" id="v-sync" ${settings.vSync ? 'checked' : ''}>
    </div>

    <div class="setting-group">
      <label>Limite FPS: </label>
      <select id="fps-limit">
        <option value="0" ${settings.fpsLimit === 0 ? 'selected' : ''}>Ilimitado</option>
        <option value="30" ${settings.fpsLimit === 30 ? 'selected' : ''}>30</option>
        <option value="60" ${settings.fpsLimit === 60 ? 'selected' : ''}>60</option>
        <option value="120" ${settings.fpsLimit === 120 ? 'selected' : ''}>120</option>
        <option value="144" ${settings.fpsLimit === 144 ? 'selected' : ''}>144</option>
      </select>
    </div>

    <div class="setting-group">
      <label>Qualidade de Textura: </label>
      <select id="texture-quality">
        <option value="Low" ${settings.textureQuality === 'Low' ? 'selected' : ''}>Baixa</option>
        <option value="Medium" ${settings.textureQuality === 'Medium' ? 'selected' : ''}>Média</option>
        <option value="High" ${settings.textureQuality === 'High' ? 'selected' : ''}>Alta</option>
        <option value="Ultra" ${settings.textureQuality === 'Ultra' ? 'selected' : ''}>Ultra</option>
      </select>
    </div>

    <div class="setting-group">
      <label>Qualidade de Sombras: </label>
      <select id="shadow-quality">
        <option value="Off" ${settings.shadowQuality === 'Off' ? 'selected' : ''}>Desligado</option>
        <option value="Low" ${settings.shadowQuality === 'Low' ? 'selected' : ''}>Baixa</option>
        <option value="Medium" ${settings.shadowQuality === 'Medium' ? 'selected' : ''}>Média</option>
        <option value="High" ${settings.shadowQuality === 'High' ? 'selected' : ''}>Alta</option>
        <option value="Ultra" ${settings.shadowQuality === 'Ultra' ? 'selected' : ''}>Ultra</option>
      </select>
    </div>

    <div class="setting-group">
      <label>Distância de Renderização: </label>
      <input type="range" id="render-distance" min="50" max="500" value="${settings.renderDistance}" step="10">
      <span id="render-distance-value">${settings.renderDistance}m</span>
    </div>

    <div class="setting-group">
      <label>Escala de Resolução: </label>
      <input type="range" id="resolution-scale" min="0.5" max="1.0" value="${settings.resolutionScale}" step="0.05">
      <span id="resolution-scale-value">${Math.round(settings.resolutionScale * 100)}%</span>
    </div>

    <div class="setting-group">
      <label>Densidade de Folhagem: </label>
      <input type="range" id="foliage-density" min="0.1" max="1.0" value="${settings.foliageDensity}" step="0.1">
      <span id="foliage-density-value">${Math.round(settings.foliageDensity * 100)}%</span>
    </div>

    <div class="setting-group">
      <label>Densidade de Partículas: </label>
      <input type="range" id="particle-density" min="0.1" max="1.0" value="${settings.particleDensity}" step="0.1">
      <span id="particle-density-value">${Math.round(settings.particleDensity * 100)}%</span>
    </div>

    <div class="setting-group">
      <label>LOD Bias: </label>
      <input type="range" id="lod-bias" min="0.25" max="2.0" value="${settings.lodBias}" step="0.25">
      <span id="lod-bias-value">${settings.lodBias.toFixed(2)}x</span>
    </div>

    <div class="setting-group">
      <label>Bloom: </label>
      <input type="checkbox" id="bloom-enabled" ${settings.bloom ? 'checked' : ''}>
    </div>

    <div class="setting-group">
      <label>Motion Blur: </label>
      <input type="checkbox" id="motion-blur" ${settings.motionBlur ? 'checked' : ''}>
    </div>

    <div class="setting-group">
      <label>Resolução Dinâmica: </label>
      <input type="checkbox" id="dynamic-resolution" ${settings.dynamicResolution ? 'checked' : ''}>
    </div>

    <button id="btn-apply-graphics" class="btn-primary">Aplicar</button>
    <button id="btn-reset-graphics" class="btn-secondary">Restaurar Padrão</button>
  `;

  // Bind events
  const presetSelect = document.getElementById('graphics-preset') as HTMLSelectElement;
  const descEl = container.querySelector('.setting-desc');
  presetSelect?.addEventListener('change', () => {
    const preset = presets.find(p => p.value === presetSelect.value);
    if (descEl && preset) descEl.textContent = preset.description;
  });

  document.getElementById('btn-apply-graphics')?.addEventListener('click', () => applyGraphicsSettings());
  document.getElementById('btn-reset-graphics')?.addEventListener('click', () => {
    graphicsManager.resetToDefaults();
    setupGraphicsSettingsUI(); // Refresh UI
  });

  // Live preview for sliders
  const bindSlider = (id: string, valueId: string, formatter?: (v: number) => string) => {
    const slider = document.getElementById(id) as HTMLInputElement;
    const valueEl = document.getElementById(valueId);
    slider?.addEventListener('input', () => {
      if (valueEl) valueEl.textContent = formatter ? formatter(slider.valueAsNumber) : slider.value;
    });
  };

  bindSlider('render-distance', 'render-distance-value', v => `${v}m`);
  bindSlider('resolution-scale', 'resolution-scale-value', v => `${Math.round(v * 100)}%`);
  bindSlider('foliage-density', 'foliage-density-value', v => `${Math.round(v * 100)}%`);
  bindSlider('particle-density', 'particle-density-value', v => `${Math.round(v * 100)}%`);
  bindSlider('lod-bias', 'lod-bias-value', v => `${v.toFixed(2)}x`);
}

function applyGraphicsSettings(): void {
  const settings: Partial<any> = {
    preset: (document.getElementById('graphics-preset') as HTMLSelectElement).value,
    screenMode: (document.getElementById('screen-mode') as HTMLSelectElement).value,
    vSync: (document.getElementById('v-sync') as HTMLInputElement).checked,
    fpsLimit: parseInt((document.getElementById('fps-limit') as HTMLSelectElement).value),
    textureQuality: (document.getElementById('texture-quality') as HTMLSelectElement).value,
    shadowQuality: (document.getElementById('shadow-quality') as HTMLSelectElement).value,
    renderDistance: (document.getElementById('render-distance') as HTMLInputElement).valueAsNumber,
    resolutionScale: (document.getElementById('resolution-scale') as HTMLInputElement).valueAsNumber,
    foliageDensity: (document.getElementById('foliage-density') as HTMLInputElement).valueAsNumber,
    particleDensity: (document.getElementById('particle-density') as HTMLInputElement).valueAsNumber,
    lodBias: (document.getElementById('lod-bias') as HTMLInputElement).valueAsNumber,
    bloom: (document.getElementById('bloom-enabled') as HTMLInputElement).checked,
    motionBlur: (document.getElementById('motion-blur') as HTMLInputElement).checked,
    dynamicResolution: (document.getElementById('dynamic-resolution') as HTMLInputElement).checked,
  };

  graphicsManager.setSettings(settings);
  showMainMenu();
}

function loadGraphicsSettings(): void {
  const saved = saveManager.loadGraphicsSettings();
  if (saved) {
    graphicsManager.setSettings(saved);
  }
}

// ============================================================================
// HUD
// ============================================================================

function setupHUD(): void {
  // Subscribe to graphics settings changes for live updates
  graphicsManager.subscribe(settings => {
    // Could update HUD elements based on settings if needed
  });
}

// ============================================================================
// GAME LOOP INTEGRATION
// ============================================================================

const originalVariableUpdate = engine?.variableUpdate?.bind(engine);
if (engine) {
  engine.variableUpdate = (dt: number) => {
    originalVariableUpdate?.(dt);

    // Update MainMenu3D when in menu
    if (engine.getState() === GameState.MainMenu) {
      mainMenu3D.update(dt);
    }

    updateHUD(dt);
  };
}

function updateHUD(dt: number): void {
  if (engine.getState() !== GameState.Gameplay) return;

  const playerComp = playerSystem.getPlayerComponent();
  if (!playerComp) return;

  // Health
  const healthFill = document.getElementById('health-fill');
  const healthText = document.getElementById('health-text');
  if (healthFill) healthFill.style.width = `${(playerComp.hp / playerComp.maxHp) * 100}%`;
  if (healthText) healthText.textContent = `${Math.ceil(playerComp.hp)} / ${playerComp.maxHp}`;

  // Stamina
  const staminaFill = document.getElementById('stamina-fill');
  const staminaText = document.getElementById('stamina-text');
  if (staminaFill) staminaFill.style.width = `${(playerComp.stamina / playerComp.maxStamina) * 100}%`;
  if (staminaText) staminaText.textContent = `${Math.ceil(playerComp.stamina)}`;

  // Fury
  const furyFill = document.getElementById('fury-fill');
  if (furyFill) furyFill.style.width = `${(playerComp.fury / playerComp.maxFury) * 100}%`;

  // Position/Debug
  const posEl = document.getElementById('debug-position');
  if (posEl && playerSystem.getPlayerComponent()) {
    const transform = playerSystem['transformComp'];
    if (transform) {
      posEl.textContent = `Pos: ${transform.position.x.toFixed(1)}, ${transform.position.y.toFixed(1)}, ${transform.position.z.toFixed(1)}`;
    }
  }

  // FPS
  const fpsEl = document.getElementById('debug-fps');
  if (fpsEl) fpsEl.textContent = `FPS: ${engine.getFPS()}`;

  // Biome
  const biomeEl = document.getElementById('debug-biome');
  if (biomeEl) {
    const transform = playerSystem['transformComp'];
    if (transform) {
      const dominant = biomeManager.getDominantBiome({
        x: transform.position.x,
        y: 0,
        z: transform.position.z
      });
      biomeEl.textContent = `Bioma: ${dominant}`;
    }
  }
}

function formatPlayTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ============================================================================
// START
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
});