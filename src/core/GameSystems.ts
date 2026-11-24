/**
 * Game Systems Integration - Central coordinator for all gameplay systems
 * Connects Player, Combat, Weapons, Creatures, Building, Terrain, Biomes
 */

import * as THREE from 'three';
import { World, EntityId, BaseSystem } from '@core/ECS.js';
import { TransformComponent } from '@core/ECS.js';
import { PlayerSystem, PlayerComponent } from '@entities/Player.js';
import { CombatSystem3D } from '@combat/CombatSystem3D.js';
import { WeaponSystem3D } from '@combat/WeaponSystem3D.js';
import { CreatureSystem3D } from '@creatures/CreatureSystem3D.js';
import { BuildingSystem3D } from '@building/BuildingSystem3D.js';
import { TerrainSystem } from '@world/TerrainSystem.js';
import { BiomeManager } from '@world/BiomeManager.js';
import { ResourceSystem } from '@world/ResourceSystem.js';
import { InputManager } from '@engine/InputManager.js';
import { SaveManager } from '@save/SaveManager.js';
import { GraphicsSettingsManager } from '@graphics/GraphicsSettingsManager.js';
import { AssetLoader } from '@engine/AssetLoader.js';
import { Renderer } from '@engine/Renderer.js';
import { BiomeType, Vec3, Quat, ActionName, GameState } from '@core/Types.js';
import { PLAYER_CONFIG, WORLD_CONFIG, ENGINE_CONFIG } from '@core/Config.js';

// ============================================================================
// GAME SYSTEMS MANAGER
// ============================================================================

export class GameSystems {
  // Core systems
  private world: World;
  private renderer: Renderer;
  private inputManager: InputManager;
  private assetLoader: AssetLoader;
  private saveManager: SaveManager;
  private graphicsManager: GraphicsSettingsManager;

  // Gameplay systems
  public playerSystem: PlayerSystem;
  public combatSystem: CombatSystem3D;
  public weaponSystem: WeaponSystem3D;
  public creatureSystem: CreatureSystem3D;
  public buildingSystem: BuildingSystem3D;
  public terrainSystem: TerrainSystem;
  public biomeManager: BiomeManager;
  public resourceSystem: ResourceSystem;

  // State
  private isInitialized = false;
  private currentState: GameState = GameState.Loading;

  // Entity references
  private playerEntity: EntityId | null = null;

  constructor(
    world: World,
    renderer: Renderer,
    inputManager: InputManager,
    assetLoader: AssetLoader,
    saveManager: SaveManager,
    graphicsManager: GraphicsSettingsManager,
    camera: THREE.PerspectiveCamera,
    scene: THREE.Scene
  ) {
    this.world = world;
    this.renderer = renderer;
    this.inputManager = inputManager;
    this.assetLoader = assetLoader;
    this.saveManager = saveManager;
    this.graphicsManager = graphicsManager;

    // Initialize systems in dependency order
    this.biomeManager = new BiomeManager(saveManager.getWorldSeed() || 'chimeraland_seed');

    this.terrainSystem = new TerrainSystem(world);

    this.playerSystem = new PlayerSystem(world, inputManager, camera);

    this.combatSystem = new CombatSystem3D(world);

    this.weaponSystem = new WeaponSystem3D(world, this.combatSystem, inputManager);

    this.creatureSystem = new CreatureSystem3D(
      world,
      this.biomeManager,
      this.terrainSystem,
      this.combatSystem,
      this.saveManager
    );

    this.buildingSystem = new BuildingSystem3D(world, camera, scene, inputManager);

    this.resourceSystem = new ResourceSystem(world, this.terrainSystem, this.biomeManager, this.assetLoader);

    // Set up cross-system references
    this.setupCrossSystemReferences();
  }

  private setupCrossSystemReferences(): void {
    // Combat system callbacks
    this.combatSystem.onHitConfirm = (attackerId, targetId, hitResult) => {
      this.onHitConfirm(attackerId, targetId, hitResult);
    };
    this.combatSystem.onParry = (parrierId, attackerId) => {
      this.onParry(parrierId, attackerId);
    };
    this.combatSystem.onKill = (killerId, victimId) => {
      this.onKill(killerId, victimId);
    };

    // Weapon system callbacks
    this.weaponSystem.onWeaponSwap = (entityId, oldSlot, newSlot) => {
      this.onWeaponSwap(entityId, oldSlot, newSlot);
    };
    this.weaponSystem.onAttack = (entityId, weaponType, comboStep) => {
      this.onAttack(entityId, weaponType, comboStep);
    };
    this.weaponSystem.onSkillUse = (entityId, skillId) => {
      this.onSkillUse(entityId, skillId);
    };
    this.weaponSystem.onComboChange = (entityId, comboStep, maxCombo) => {
      this.onComboChange(entityId, comboStep, maxCombo);
    };

    // Creature system callbacks
    this.creatureSystem.onCreatureSpawned = (entityId, defId) => {
      this.onCreatureSpawned(entityId, defId);
    };
    this.creatureSystem.onCreatureDeath = (entityId, killerId) => {
      this.onCreatureDeath(entityId, killerId);
    };
    this.creatureSystem.onCreatureTamed = (entityId, playerId) => {
      this.onCreatureTamed(entityId, playerId);
    };
    this.creatureSystem.onMutationApplied = (entityId, partId, slotId) => {
      this.onMutationApplied(entityId, partId, slotId);
    };
    this.creatureSystem.onItemDropped = (item) => {
      this.onItemDropped(item);
    };

    // Building system callbacks
    this.buildingSystem.onPiecePlaced = (piece) => {
      this.onPiecePlaced(piece);
    };
    this.buildingSystem.onPieceRemoved = (pieceId) => {
      this.onPieceRemoved(pieceId);
    };
    this.buildingSystem.onPieceSelected = (pieceId) => {
      this.onPieceSelected(pieceId);
    };
    this.buildingSystem.onPreviewUpdate = (preview) => {
      this.onPreviewUpdate(preview);
    };
    this.buildingSystem.onValidationError = (errors) => {
      this.onValidationError(errors);
    };
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Load core assets
    await this.loadCoreAssets();

    // Initialize terrain
    await this.initializeTerrain();

    // Create player
    this.createPlayer();

    // Initialize systems
    this.weaponSystem.setPlayerEntity(this.playerEntity!);
    this.creatureSystem.setPlayerEntity(this.playerEntity!);
    this.buildingSystem.setPlayerEntity(this.playerEntity!);

    // Initialize resource system
    await this.resourceSystem.initializeNodes();

    // Spawn initial creatures
    await this.spawnInitialCreatures();

    this.isInitialized = true;
    console.log('[GameSystems] All systems initialized');
  }

  private async loadCoreAssets(): Promise<void> {
    // Core assets would be loaded here
    // For now, just initialize asset pipeline
    this.assetLoader.setProgressCallback(progress => {
      // Update loading screen
    });
  }

  private async initializeTerrain(): Promise<void> {
    // Generate initial chunks around player spawn
    const spawnPos = { x: 0, y: 35, z: 0 };
    const radius = 4;

    for (let cz = -radius; cz <= radius; cz++) {
      for (let cx = -radius; cx <= radius; cx++) {
        const worldX = cx * WORLD_CONFIG.chunkSize;
        const worldZ = cz * WORLD_CONFIG.chunkSize;
        const chunk = this.terrainSystem.getOrCreateChunk(worldX, worldZ);
        if (!chunk.isLoaded) {
          this.terrainSystem.generateChunk(chunk);
        }
      }
    }

    this.terrainSystem.update(0);
  }

  private createPlayer(): void {
    const spawnPos = { x: 0, y: 35, z: 0 };
    this.playerEntity = this.playerSystem.createPlayer(spawnPos);

    // Give starter equipment
    this.weaponSystem.equipWeapon(this.playerEntity!, 0, 'wooden_sword');
    this.weaponSystem.equipWeapon(this.playerEntity!, 2, 'wooden_bow'); // Would need to exist

    console.log('[GameSystems] Player created');
  }

  private async spawnInitialCreatures(): Promise<void> {
    // Spawn some creatures near player for immediate gameplay
    const spawnPositions = [
      { x: 20, z: 15 },
      { x: -15, z: -20 },
      { x: 30, z: -10 },
      { x: -25, z: 25 },
    ];

    for (const pos of spawnPositions) {
      const y = this.terrainSystem.getHeightAtWorld(pos.x, pos.z) + 1;
      this.creatureSystem.forceSpawn('spirit_deer', { x: pos.x, y, z: pos.z });
      this.creatureSystem.forceSpawn('spirit_wolf', { x: pos.x + 5, y, z: pos.z + 5 });
    }

    console.log('[GameSystems] Initial creatures spawned');
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  private onHitConfirm(attackerId: EntityId, targetId: EntityId, hitResult: any): void {
    // Apply damage to target
    this.applyDamage(targetId, hitResult, attackerId);

    // Fury gain
    if (attackerId === this.playerEntity) {
      const playerComp = this.playerSystem.getPlayerComponent();
      if (playerComp) {
        playerComp.fury = Math.min(playerComp.maxFury, playerComp.fury + PLAYER_CONFIG.furyGainOnHit);
      }
    }

    // Screen shake / hit effects
    // Would trigger via event system
  }

  private onParry(parrierId: EntityId, attackerId: EntityId): void {
    // Stagger attacker, give parrier advantage
    console.log(`[GameSystems] Parry! ${parrierId} parried ${attackerId}`);

    // Visual/audio feedback
    window.dispatchEvent(new CustomEvent('parry-success', {
      detail: { parrierId, attackerId }
    }));
  }

  private onKill(killerId: EntityId, victimId: EntityId): void {
    console.log(`[GameSystems] Kill! ${killerId} killed ${victimId}`);

    // Experience gain
    if (killerId === this.playerEntity) {
      this.grantExperience(killerId, 50); // Base XP

      // Fury gain
      const playerComp = this.playerSystem.getPlayerComponent();
      if (playerComp) {
        playerComp.fury = Math.min(playerComp.maxFury, playerComp.fury + PLAYER_CONFIG.furyGainOnKill);
      }
    }

    // Creature death handled by creature system
    this.creatureSystem.killCreature(victimId, killerId);
  }

  private onWeaponSwap(entityId: EntityId, oldSlot: number, newSlot: number): void {
    console.log(`[GameSystems] Weapon swap: ${oldSlot} -> ${newSlot}`);

    // Update player component
    if (entityId === this.playerEntity) {
      const playerComp = this.playerSystem.getPlayerComponent();
      if (playerComp) {
        playerComp.activeWeaponIndex = newSlot;
      }
    }
  }

  private onAttack(entityId: EntityId, weaponType: any, comboStep: number): void {
    // Trigger attack animations, sounds
    window.dispatchEvent(new CustomEvent('player-attack', {
      detail: { entityId, weaponType, comboStep }
    }));
  }

  private onSkillUse(entityId: EntityId, skillId: string): void {
    console.log(`[GameSystems] Skill used: ${skillId}`);

    window.dispatchEvent(new CustomEvent('skill-used', {
      detail: { entityId, skillId }
    }));
  }

  private onComboChange(entityId: EntityId, comboStep: number, maxCombo: number): void {
    // Update combo UI
    window.dispatchEvent(new CustomEvent('combo-change', {
      detail: { entityId, comboStep, maxCombo }
    }));
  }

  private onCreatureSpawned(entityId: EntityId, defId: string): void {
    console.log(`[GameSystems] Creature spawned: ${defId}`);
  }

  private onCreatureDeath(entityId: EntityId, killerId?: EntityId): void {
    console.log(`[GameSystems] Creature died: ${entityId}`);
  }

  private onCreatureTamed(entityId: EntityId, playerId: EntityId): void {
    console.log(`[GameSystems] Creature tamed by player: ${entityId}`);

    // Add to player's creature collection
    // Would update player's creature list
  }

  private onMutationApplied(entityId: EntityId, partId: string, slotId: string): void {
    console.log(`[GameSystems] Mutation applied: ${partId} to ${slotId}`);

    // Visual feedback
    window.dispatchEvent(new CustomEvent('mutation-applied', {
      detail: { entityId, partId, slotId }
    }));
  }

  private onItemDropped(item: any): void {
    // Item dropped in world
  }

  private onPiecePlaced(piece: any): void {
    console.log(`[GameSystems] Building piece placed: ${piece.definitionId}`);

    // Check for crafting station placement
    // Would enable crafting recipes nearby
  }

  private onPieceRemoved(pieceId: EntityId): void {
    console.log(`[GameSystems] Building piece removed: ${pieceId}`);
  }

  private onPieceSelected(pieceId: EntityId | null): void {
    // Update UI for selected piece
  }

  private onPreviewUpdate(preview: any): void {
    // Update preview visualization
  }

  private onValidationError(errors: string[]): void {
    // Show validation errors to player
    if (errors.length > 0) {
      console.warn('[GameSystems] Build validation:', errors);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getPlayerEntity(): EntityId | null {
    return this.playerEntity;
  }

  getPlayerSystem(): PlayerSystem {
    return this.playerSystem;
  }

  getCombatSystem(): CombatSystem3D {
    return this.combatSystem;
  }

  getWeaponSystem(): WeaponSystem3D {
    return this.weaponSystem;
  }

  getCreatureSystem(): CreatureSystem3D {
    return this.creatureSystem;
  }

  getBuildingSystem(): BuildingSystem3D {
    return this.buildingSystem;
  }

  getTerrainSystem(): TerrainSystem {
    return this.terrainSystem;
  }

  getBiomeManager(): BiomeManager {
    return this.biomeManager;
  }

  getResourceSystem(): ResourceSystem {
    return this.resourceSystem;
  }

  getSaveManager(): SaveManager {
    return this.saveManager;
  }

  getGraphicsManager(): GraphicsSettingsManager {
    return this.graphicsManager;
  }

  // ============================================================================
  // GAMEPLAY HELPERS
  // ============================================================================

  private applyDamage(targetId: EntityId, hitResult: any, attackerId: EntityId): void {
    // Would apply damage to target's health component
    // For creatures, this is handled by creature system
    // For player, handled by player system
    const targetCreature = this.creatureSystem.getCreatureInstance(targetId);
    if (targetCreature) {
      // Creature takes damage
      const actualDamage = Math.max(1, hitResult.damage - targetCreature.stats.armor);
      targetCreature.stats.hp = Math.max(0, targetCreature.stats.hp - actualDamage);

      if (targetCreature.stats.hp <= 0) {
        this.creatureSystem.killCreature(targetId, attackerId);
      }
    }
  }

  private grantExperience(entityId: EntityId, amount: number): void {
    // Grant XP to entity (player or creature)
    // Would implement leveling system
  }

  // ============================================================================
  // UPDATE
  // ============================================================================

  update(dt: number): void {
    if (!this.isInitialized) return;

    // Update all systems in correct order
    this.terrainSystem.update(dt);
    this.playerSystem.update(dt);
    this.weaponSystem.update(dt);
    this.creatureSystem.update(dt);
    this.buildingSystem.update(dt);
    this.resourceSystem.update(dt);
    this.combatSystem.update(dt);

    // Update terrain with player position
    if (this.playerEntity) {
      const playerComp = this.playerSystem.getPlayerComponent();
      const transform = this.playerSystem['transformComp'];
      if (transform) {
        this.terrainSystem.updatePlayerPosition({
          x: transform.position.x,
          y: transform.position.y,
          z: transform.position.z
        });
      }
    }
  }

  // ============================================================================
  // SAVE/LOAD
  // ============================================================================

  async saveGame(slot: string): Promise<boolean> {
    const playerData = this.playerSystem.serializePlayerState();
    const creatureData = this.creatureSystem.serialize();
    const buildingData = this.buildingSystem.serialize();

    // Build SaveGameData structure matching Types.ts
    const saveData = {
      metadata: {
        saveId: `save_${Date.now()}`,
        slotName: slot,
        timestamp: Date.now(),
        playTimeSeconds: 0, // Would track actual play time
        worldSeed: this.saveManager.getWorldSeed() || 'chimeraland_seed',
        engineVersion: ENGINE_CONFIG.version,
        currentBiome: this.biomeManager.getDominantBiome({ x: 0, y: 0, z: 0 }),
        playerName: 'Player',
      },
      player: playerData,
      chimeras: creatureData.creatures || [],
      buildings: buildingData.pieces || [],
      world: {
        destroyedResourceNodes: {},
        creatureStates: {},
        modifiedChunks: [],
      },
    };

    return this.saveManager.saveGame(slot, saveData);
  }

  async loadGame(slot: string): Promise<boolean> {
    const data = this.saveManager.loadGame(slot);
    if (!data) return false;

    // Restore player
    if (data.player) {
      this.playerSystem.deserializePlayerState(data.player);
    }

    // Restore world seed
    if (data.metadata?.worldSeed) {
      this.saveManager.setWorldSeed(data.metadata.worldSeed);
      this.biomeManager = new BiomeManager(data.metadata.worldSeed);
    }

    // Restore creatures
    if (data.chimeras) {
      this.creatureSystem.deserialize(data.chimeras);
    }

    // Restore buildings
    if (data.buildings) {
      this.buildingSystem.deserialize(data.buildings);
    }

    return true;
  }

  // ============================================================================
  // DEBUG
  // ============================================================================

  getDebugInfo(): any {
    return {
      player: this.playerSystem.getPlayerComponent(),
      creatures: this.creatureSystem.getCreatureCount(),
      chunks: this.terrainSystem.getLoadedChunks().length,
      biomes: this.biomeManager.getDominantBiome({ x: 0, y: 0, z: 0 }),
      weapon: this.weaponSystem.getActiveWeaponState(this.playerEntity!),
      building: this.buildingSystem.getSelectedPiece(),
    };
  }
}