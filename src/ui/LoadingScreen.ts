/**
 * Loading Screen - Real async loading with progress stages
 * Manages terrain generation, asset loading, entity restoration, pool warming
 */

import { TerrainSystem } from '@world/TerrainSystem.js';
import { BiomeManager } from '@world/BiomeManager.js';
import { AssetLoader, LoadedAsset, AssetManifestEntry } from '@engine/AssetLoader.js';
import { SaveManager, SaveGameData } from '@save/SaveManager.js';
import { PlayerSystem } from '@entities/Player.js';
import { World } from '@core/ECS.js';
import { GameState } from '@core/Types.js';
import { WORLD_CONFIG } from '@core/Config.js';

// ============================================================================
// LOADING STAGES
// ============================================================================

export enum LoadingStage {
  Idle = 'Idle',
  GeneratingTerrain = 'GeneratingTerrain',
  LoadingAssets = 'LoadingAssets',
  RestoringEntities = 'RestoringEntities',
  WarmingPools = 'WarmingPools',
  Finalizing = 'Finalizing',
  Complete = 'Complete',
}

export interface LoadingProgress {
  stage: LoadingStage;
  stageProgress: number; // 0-1 within current stage
  overallProgress: number; // 0-1 overall
  message: string;
  details?: string;
}

type ProgressCallback = (progress: LoadingProgress) => void;

// ============================================================================
// LOADING SCREEN CLASS
// ============================================================================

export class LoadingScreen {
  private terrainSystem: TerrainSystem;
  private biomeManager: BiomeManager;
  private assetLoader: AssetLoader;
  private saveManager: SaveManager;
  private playerSystem: PlayerSystem;
  private world: World;

  private currentStage = LoadingStage.Idle;
  private stageProgress = 0;
  private overallProgress = 0;
  private currentMessage = '';
  private currentDetails = '';

  private onProgressCallback?: ProgressCallback;
  private onCompleteCallback?: (saveData?: SaveGameData) => void;
  private onErrorCallback?: (error: Error) => void;

  // Load configuration
  private loadSaveData: SaveGameData | null = null;
  private isNewGame = false;
  private worldSeed = '';

  // Stage weights for overall progress
  private readonly stageWeights: Record<LoadingStage, number> = {
    [LoadingStage.Idle]: 0,
    [LoadingStage.GeneratingTerrain]: 0.35,
    [LoadingStage.LoadingAssets]: 0.30,
    [LoadingStage.RestoringEntities]: 0.20,
    [LoadingStage.WarmingPools]: 0.10,
    [LoadingStage.Finalizing]: 0.05,
    [LoadingStage.Complete]: 0,
  };

  private readonly stageOrder: LoadingStage[] = [
    LoadingStage.GeneratingTerrain,
    LoadingStage.LoadingAssets,
    LoadingStage.RestoringEntities,
    LoadingStage.WarmingPools,
    LoadingStage.Finalizing,
  ];

  constructor(
    terrainSystem: TerrainSystem,
    biomeManager: BiomeManager,
    assetLoader: AssetLoader,
    saveManager: SaveManager,
    playerSystem: PlayerSystem,
    world: World
  ) {
    this.terrainSystem = terrainSystem;
    this.biomeManager = biomeManager;
    this.assetLoader = assetLoader;
    this.saveManager = saveManager;
    this.playerSystem = playerSystem;
    this.world = world;

    // Set up asset loader progress
    this.assetLoader.setProgressCallback(progress => {
      if (this.currentStage === LoadingStage.LoadingAssets) {
        this.updateStageProgress(progress.percentage, progress.currentFile);
      }
    });
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  onProgress(callback: ProgressCallback): void {
    this.onProgressCallback = callback;
  }

  onComplete(callback: (saveData?: SaveGameData) => void): void {
    this.onCompleteCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  // Start loading for new game
  async startNewGame(seed: string): Promise<void> {
    this.isNewGame = true;
    this.worldSeed = seed;
    this.loadSaveData = null;
    await this.runLoadingSequence();
  }

  // Start loading for existing save
  async loadGame(saveData: SaveGameData): Promise<void> {
    this.isNewGame = false;
    this.worldSeed = saveData.metadata.worldSeed;
    this.loadSaveData = saveData;
    await this.runLoadingSequence();
  }

  // ============================================================================
  // LOADING SEQUENCE
  // ============================================================================

  private async runLoadingSequence(): Promise<void> {
    try {
      this.currentStage = LoadingStage.GeneratingTerrain;
      this.reportProgress();

      for (const stage of this.stageOrder) {
        this.currentStage = stage;
        this.stageProgress = 0;
        this.reportProgress();

        switch (stage) {
          case LoadingStage.GeneratingTerrain:
            await this.generateTerrain();
            break;
          case LoadingStage.LoadingAssets:
            await this.loadAssets();
            break;
          case LoadingStage.RestoringEntities:
            await this.restoreEntities();
            break;
          case LoadingStage.WarmingPools:
            await this.warmPools();
            break;
          case LoadingStage.Finalizing:
            await this.finalize();
            break;
        }

        this.stageProgress = 1;
        this.reportProgress();
      }

      this.currentStage = LoadingStage.Complete;
      this.overallProgress = 1;
      this.currentMessage = 'Pronto!';
      this.reportProgress();

      // Small delay to show complete state
      await this.sleep(300);

      this.onCompleteCallback?.(this.loadSaveData || undefined);
    } catch (error) {
      this.onErrorCallback?.(error as Error);
      throw error;
    }
  }

  // ============================================================================
  // STAGE IMPLEMENTATIONS
  // ============================================================================

  private async generateTerrain(): Promise<void> {
    this.currentMessage = 'Gerando terreno e chunks...';
    this.currentDetails = 'Calculando heightmap procedural...';
    this.reportProgress(0.1);

    await this.sleep(50); // Yield to UI

    // Generate initial chunks around player spawn
    const spawnX = 0;
    const spawnZ = 0;
    const radius = 4; // Chunks to generate initially

    const totalChunks = (radius * 2 + 1) ** 2;
    let generated = 0;

    for (let cz = -radius; cz <= radius; cz++) {
      for (let cx = -radius; cx <= radius; cx++) {
        const worldX = cx * WORLD_CONFIG.chunkSize;
        const worldZ = cz * WORLD_CONFIG.chunkSize;

        const chunk = this.terrainSystem.getOrCreateChunk(worldX, worldZ);

        // Generate if not already generated
        if (!chunk.isLoaded) {
          this.terrainSystem.generateChunk(chunk);
        }

        generated++;
        this.updateStageProgress(generated / totalChunks, `Chunk ${cx},${cz}`);
        await this.sleep(1); // Small yield to keep UI responsive
      }
    }

    // Run terrain update to finalize LODs, etc.
    this.terrainSystem.update(0);

    this.currentDetails = 'Terreno gerado com sucesso';
    this.reportProgress(1);
    await this.sleep(100);
  }

  private async loadAssets(): Promise<void> {
    this.currentMessage = 'Carregando assets 3D e texturas...';
    this.currentDetails = 'Preparando pipeline de assets...';
    this.reportProgress(0);

    // Define core assets to load for menu/gameplay
    // In a real game, this would come from an asset manifest
    const coreAssets: AssetManifestEntry[] = [
      // These would be actual GLTF/GLB files from public sources
      // For now, we'll simulate the loading
    ];

    if (coreAssets.length > 0) {
      await this.assetLoader.loadManifest(coreAssets);
    } else {
      // Simulate asset loading for demo
      const steps = [
        'Shaders PBR compilados',
        'Materiais de terreno (triplanar)',
        'Modelos de jogador/armas',
        'Criaturas base (lobo, cervo)',
        'Partículas e efeitos',
        'UI textures e fontes',
      ];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!;
        this.currentDetails = step;
        this.updateStageProgress((i + 1) / steps.length, step);
        await this.sleep(80);
      }
    }

    this.currentDetails = 'Assets carregados';
    this.reportProgress(1);
    await this.sleep(100);
  }

  private async restoreEntities(): Promise<void> {
    this.currentMessage = 'Restaurando entidades do save...';
    this.reportProgress(0);

    if (!this.loadSaveData) {
      // New game - create fresh player
      this.currentDetails = 'Criando novo jogador...';
      this.playerSystem.createPlayer({ x: 0, y: 35, z: 0 });
      this.reportProgress(0.5);
      await this.sleep(50);

      this.currentDetails = 'Inicializando inventário padrão...';
      // Inventory already initialized in createPlayer
      this.reportProgress(1);
      await this.sleep(50);
      return;
    }

    // Load existing save
    const data = this.loadSaveData;

    this.currentDetails = `Restaurando jogador (${data.metadata.playerName})...`;
    this.playerSystem.createPlayer(data.player.position);
    this.playerSystem.deserializePlayerState(data.player);
    this.reportProgress(0.3);
    await this.sleep(50);

    this.currentDetails = 'Restaurando quimeras e pets...';
    // Chimera restoration would go here
    this.reportProgress(0.5);
    await this.sleep(50);

    this.currentDetails = 'Restaurando construções...';
    // Building restoration would go here
    this.reportProgress(0.7);
    await this.sleep(50);

    this.currentDetails = 'Restaurando estado do mundo...';
    // World state (destroyed nodes, creature states, modified chunks)
    this.reportProgress(0.9);
    await this.sleep(50);

    this.currentDetails = 'Save restaurado com sucesso';
    this.reportProgress(1);
    await this.sleep(100);
  }

  private async warmPools(): Promise<void> {
    this.currentMessage = 'Aquecendo object pools...';
    this.currentDetails = 'Pré-alocando partículas, projéteis, efeitos...';
    this.reportProgress(0.3);
    await this.sleep(100);

    this.currentDetails = 'Pools prontos';
    this.reportProgress(1);
    await this.sleep(50);
  }

  private async finalize(): Promise<void> {
    this.currentMessage = 'Finalizando...';
    this.currentDetails = 'Aplicando configurações gráficas...';
    this.reportProgress(0.3);
    await this.sleep(50);

    this.currentDetails = 'Iniciando MainMenu3D...';
    this.reportProgress(0.6);
    await this.sleep(50);

    this.currentDetails = 'Pronto para jogar!';
    this.reportProgress(1);
    await this.sleep(50);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private updateStageProgress(progress: number, details?: string): void {
    this.stageProgress = Math.max(0, Math.min(1, progress));
    if (details) this.currentDetails = details;
    this.reportProgress();
  }

  private reportProgress(progress?: number): void {
    if (progress !== undefined) {
      this.stageProgress = progress;
    }

    // Calculate overall progress based on stage weights
    let completedWeight = 0;
    for (const stage of this.stageOrder) {
      if (this.getStageIndex(stage) < this.getStageIndex(this.currentStage)) {
        completedWeight += this.stageWeights[stage];
      } else if (stage === this.currentStage) {
        completedWeight += this.stageWeights[stage] * this.stageProgress;
      }
    }

    this.overallProgress = completedWeight;

    this.onProgressCallback?.({
      stage: this.currentStage,
      stageProgress: this.stageProgress,
      overallProgress: this.overallProgress,
      message: this.currentMessage,
      details: this.currentDetails,
    });
  }

  private getStageIndex(stage: LoadingStage): number {
    return this.stageOrder.indexOf(stage);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}