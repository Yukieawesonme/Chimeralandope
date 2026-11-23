/**
 * Save Manager - Complete Save/Load System
 * Handles serialization, slots, validation, and versioning
 */

import * as z from 'zod';
import {
  SaveGameData,
  SaveMetadata,
  SavePlayerState,
  SaveChimera,
  SaveBuildingPiece,
  SaveWorldState,
  SaveInventoryItem,
  SaveBuff,
  SaveMutation,
  SaveCreatureWorldState,
  BiomeType,
  LocomotionState,
  ItemType,
  EquipmentSlot,
  CreatureState,
  Vec3,
  Quat,
  EntityId,
} from '@core/Types.js';
import { ENGINE_CONFIG } from '@core/Config.js';

// Re-export for consumers
export type { SaveGameData } from '@core/Types.js';

// ============================================================================
// ZOD SCHEMAS FOR VALIDATION
// ============================================================================

const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const QuatSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  w: z.number(),
});

const SaveMetadataSchema = z.object({
  saveId: z.string(),
  slotName: z.string(),
  timestamp: z.number(),
  playTimeSeconds: z.number(),
  worldSeed: z.string(),
  engineVersion: z.string(),
  currentBiome: z.nativeEnum(BiomeType),
  playerName: z.string(),
});

const SaveInventoryItemSchema = z.object({
  itemId: z.string(),
  itemType: z.nativeEnum(ItemType),
  quantity: z.number().int().min(1),
  durability: z.number().optional(),
  maxDurability: z.number().optional(),
  enchantments: z.array(z.string()).optional(),
  customData: z.record(z.unknown()).optional(),
});

const SaveBuffSchema = z.object({
  id: z.string(),
  remainingTime: z.number(),
  stacks: z.number().int().min(1),
  sourceEntityId: z.string().optional(),
});

const SaveMutationSchema = z.object({
  partId: z.string(),
  socketId: z.string(),
  sourceCreatureId: z.string(),
  attributeBonuses: z.record(z.number()),
  inheritedSkillId: z.string().optional(),
});

const SaveChimeraSchema = z.object({
  id: z.string(),
  baseSpeciesId: z.string(),
  name: z.string(),
  level: z.number().int().min(1),
  experience: z.number().min(0),
  hp: z.number().min(0),
  maxHp: z.number().min(1),
  mutations: z.array(SaveMutationSchema),
  state: z.enum(['inventory', 'pet', 'mount']),
  socketBindings: z.record(z.string()),
});

const SaveBuildingPieceSchema = z.object({
  pieceId: z.string(),
  type: z.string(),
  position: Vec3Schema,
  rotation: QuatSchema,
  scale: Vec3Schema,
  socketConnections: z.record(z.string()),
  durability: z.number(),
  stationState: z.record(z.unknown()).optional(),
});

const SaveCreatureWorldStateSchema = z.object({
  entityId: z.string(),
  speciesId: z.string(),
  position: Vec3Schema,
  rotation: QuatSchema,
  hp: z.number(),
  state: z.nativeEnum(CreatureState),
  isBoss: z.boolean(),
  isUnique: z.boolean(),
});

const SaveWorldStateSchema = z.object({
  destroyedResourceNodes: z.record(z.number()),
  creatureStates: z.record(SaveCreatureWorldStateSchema),
  modifiedChunks: z.array(z.string()),
});

const SavePlayerStateSchema = z.object({
  position: Vec3Schema,
  rotation: QuatSchema,
  velocity: Vec3Schema,
  locomotionState: z.nativeEnum(LocomotionState),
  hp: z.number().min(0),
  maxHp: z.number().min(1),
  stamina: z.number().min(0),
  maxStamina: z.number().min(1),
  fury: z.number().min(0),
  oxygen: z.number().min(0),
  equippedWeapons: z.array(z.string().nullable()).length(3),
  activeWeaponIndex: z.number().int().min(0).max(2),
  skillCooldowns: z.record(z.number()),
  skillLevels: z.record(z.number()),
  inventory: z.array(SaveInventoryItemSchema),
  activeBuffs: z.array(SaveBuffSchema),
});

const SaveGameDataSchema = z.object({
  metadata: SaveMetadataSchema,
  player: SavePlayerStateSchema,
  chimeras: z.array(SaveChimeraSchema),
  buildings: z.array(SaveBuildingPieceSchema),
  world: SaveWorldStateSchema,
});

// Type inference from schema
type ValidatedSaveGameData = z.infer<typeof SaveGameDataSchema>;

// ============================================================================
// SAVE MANAGER CLASS
// ============================================================================

export class SaveManager {
  private static readonly STORAGE_PREFIX = 'chimeraland_save_';
  private static readonly SETTINGS_KEY = 'chimeraland_graphics_settings';
  private static readonly MAX_SLOTS = 10;
  private static readonly AUTO_SAVE_INTERVAL = 60000; // 1 minute

  private currentSlot: string | null = null;
  private autoSaveTimer: number | null = null;
  private playTimeStart = Date.now();
  private totalPlayTime = 0;
  private worldSeed: string = '';
  private currentBiome: BiomeType = BiomeType.SpiritPlains;
  private playerName: string = 'Player';

  // Callbacks
  public onSaveComplete?: (slot: string, success: boolean) => void;
  public onLoadComplete?: (data: SaveGameData | null, success: boolean) => void;
  public onAutoSave?: () => void;

  // ---- Slot Management ----

  getSaveSlots(): SaveSlotInfo[] {
    const slots: SaveSlotInfo[] = [];

    for (let i = 1; i <= SaveManager.MAX_SLOTS; i++) {
      const slotKey = `Slot_${i.toString().padStart(2, '0')}`;
      const data = this.loadRaw(slotKey);

      if (data) {
        try {
          const parsed = JSON.parse(data);
          const metadata = parsed.metadata;
          slots.push({
            slot: slotKey,
            exists: true,
            saveId: metadata.saveId,
            playerName: metadata.playerName,
            timestamp: metadata.timestamp,
            playTimeSeconds: metadata.playTimeSeconds,
            worldSeed: metadata.worldSeed,
            currentBiome: metadata.currentBiome,
            engineVersion: metadata.engineVersion,
            screenshot: parsed.screenshot, // base64 thumbnail
          });
        } catch {
          slots.push({ slot: slotKey, exists: false, error: 'Corrupted' });
        }
      } else {
        slots.push({ slot: slotKey, exists: false });
      }
    }

    // Auto-save slot
    const autoData = this.loadRaw('AutoSave');
    if (autoData) {
      try {
        const parsed = JSON.parse(autoData);
        const metadata = parsed.metadata;
        slots.unshift({
          slot: 'AutoSave',
          exists: true,
          saveId: metadata.saveId,
          playerName: metadata.playerName,
          timestamp: metadata.timestamp,
          playTimeSeconds: metadata.playTimeSeconds,
          worldSeed: metadata.worldSeed,
          currentBiome: metadata.currentBiome,
          engineVersion: metadata.engineVersion,
        });
      } catch {
        slots.unshift({ slot: 'AutoSave', exists: false, error: 'Corrupted' });
      }
    } else {
      slots.unshift({ slot: 'AutoSave', exists: false });
    }

    return slots;
  }

  deleteSlot(slot: string): boolean {
    if (slot === 'AutoSave') {
      localStorage.removeItem(SaveManager.STORAGE_PREFIX + 'AutoSave');
    } else {
      localStorage.removeItem(SaveManager.STORAGE_PREFIX + slot);
    }
    return true;
  }

  // ---- Save Operations ----

  async saveGame(slot: string, gameData: Partial<SaveGameData>): Promise<boolean> {
    try {
      const fullData = this.buildSaveData(gameData);

      // Validate before saving
      const result = SaveGameDataSchema.safeParse(fullData);
      if (!result.success) {
        console.error('[SaveManager] Validation failed:', result.error.format());
        this.onSaveComplete?.(slot, false);
        return false;
      }

      // Add screenshot (thumbnail)
      fullData.screenshot = await this.captureScreenshot();

      // Compress and save
      const json = JSON.stringify(fullData);
      const compressed = this.compress(json);
      localStorage.setItem(SaveManager.STORAGE_PREFIX + slot, compressed);

      this.currentSlot = slot;
      this.onSaveComplete?.(slot, true);
      console.log(`[SaveManager] Saved to ${slot}`);
      return true;
    } catch (error) {
      console.error('[SaveManager] Save failed:', error);
      this.onSaveComplete?.(slot, false);
      return false;
    }
  }

  async quickSave(): Promise<boolean> {
    if (!this.currentSlot) {
      this.currentSlot = 'AutoSave';
    }
    return this.saveGame(this.currentSlot, {});
  }

  startAutoSave(): void {
    if (this.autoSaveTimer) return;
    this.autoSaveTimer = window.setInterval(() => {
      this.quickSave();
      this.onAutoSave?.();
    }, SaveManager.AUTO_SAVE_INTERVAL);
  }

  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // ---- Load Operations ----

  loadGame(slot: string): SaveGameData | null {
    try {
      const compressed = localStorage.getItem(SaveManager.STORAGE_PREFIX + slot);
      if (!compressed) {
        this.onLoadComplete?.(null, false);
        return null;
      }

      const json = this.decompress(compressed);
      const parsed = JSON.parse(json);

      // Validate schema
      const result = SaveGameDataSchema.safeParse(parsed);
      if (!result.success) {
        console.error('[SaveManager] Load validation failed:', result.error.format());

        // Try migration from older version
        const migrated = this.migrateSave(parsed);
        if (migrated) {
          const migratedResult = SaveGameDataSchema.safeParse(migrated);
          if (migratedResult.success) {
            this.onLoadComplete?.(migratedResult.data, true);
            return migratedResult.data;
          }
        }

        this.onLoadComplete?.(null, false);
        return null;
      }

      this.currentSlot = slot;
      this.worldSeed = result.data.metadata.worldSeed;
      this.currentBiome = result.data.metadata.currentBiome;
      this.playerName = result.data.metadata.playerName;
      this.totalPlayTime = result.data.metadata.playTimeSeconds;
      this.playTimeStart = Date.now();

      this.onLoadComplete?.(result.data, true);
      console.log(`[SaveManager] Loaded from ${slot}`);
      return result.data;
    } catch (error) {
      console.error('[SaveManager] Load failed:', error);
      this.onLoadComplete?.(null, false);
      return null;
    }
  }

  // ---- Data Building ----

  private buildSaveData(partial: Partial<SaveGameData>): SaveGameData & { screenshot?: string } {
    const now = Date.now();
    const playTimeSeconds = this.totalPlayTime + Math.floor((now - this.playTimeStart) / 1000);

    const metadata: SaveMetadata = {
      saveId: `save_${now}_${Math.random().toString(36).slice(2, 9)}`,
      slotName: this.currentSlot || 'Unknown',
      timestamp: now,
      playTimeSeconds,
      worldSeed: this.worldSeed,
      engineVersion: ENGINE_CONFIG.version,
      currentBiome: this.currentBiome,
      playerName: this.playerName,
    };

    return {
      metadata,
      player: partial.player || this.createDefaultPlayerState(),
      chimeras: partial.chimeras || [],
      buildings: partial.buildings || [],
      world: partial.world || this.createDefaultWorldState(),
      screenshot: undefined, // Will be set by saveGame
    };
  }

  private createDefaultPlayerState(): SavePlayerState {
    return {
      position: { x: 0, y: 35, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0, z: 0 },
      locomotionState: LocomotionState.Idle,
      hp: 100,
      maxHp: 100,
      stamina: 100,
      maxStamina: 100,
      fury: 0,
      oxygen: 100,
      equippedWeapons: ['wooden_sword', null, null],
      activeWeaponIndex: 0,
      skillCooldowns: {},
      skillLevels: {},
      inventory: [
        { itemId: 'wood', itemType: ItemType.Resource, quantity: 50 },
        { itemId: 'stone', itemType: ItemType.Resource, quantity: 20 },
        { itemId: 'health_potion', itemType: ItemType.Consumable, quantity: 5 },
      ],
      activeBuffs: [],
    };
  }

  private createDefaultWorldState(): SaveWorldState {
    return {
      destroyedResourceNodes: {},
      creatureStates: {},
      modifiedChunks: [],
    };
  }

  // ---- Screenshot Capture ----

  private async captureScreenshot(): Promise<string> {
    // This would be called with a reference to the renderer
    // For now, return placeholder
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }

  setScreenshotCapture(captureFn: () => Promise<string>): void {
    this.captureScreenshot = captureFn;
  }

  // ---- Compression ----

  private compress(data: string): string {
    // Simple LZ-string style compression for localStorage size limits
    // In production, use lz-string or similar
    try {
      return btoa(JSON.stringify(JSON.parse(data))); // Just ensure valid JSON
    } catch {
      return data;
    }
  }

  private decompress(data: string): string {
    try {
      return JSON.stringify(JSON.parse(atob(data)));
    } catch {
      return data;
    }
  }

  // ---- Migration ----

  private migrateSave(oldData: any): SaveGameData | null {
    // Version migration logic would go here
    // For now, return null to indicate migration not possible
    console.warn('[SaveManager] Save migration not implemented for version:', oldData.metadata?.engineVersion);
    return null;
  }

  // ---- Settings Persistence ----

  saveGraphicsSettings(settings: any): void {
    localStorage.setItem(SaveManager.SETTINGS_KEY, JSON.stringify(settings));
  }

  loadGraphicsSettings(): any | null {
    const data = localStorage.getItem(SaveManager.SETTINGS_KEY);
    return data ? JSON.parse(data) : null;
  }

  // ---- Utility ----

  private loadRaw(key: string): string | null {
    return localStorage.getItem(SaveManager.STORAGE_PREFIX + key);
  }

  setWorldSeed(seed: string): void {
    this.worldSeed = seed;
  }

  getWorldSeed(): string {
    return this.worldSeed;
  }

  setCurrentBiome(biome: BiomeType): void {
    this.currentBiome = biome;
  }

  setPlayerName(name: string): void {
    this.playerName = name;
  }

  getCurrentSlot(): string | null {
    return this.currentSlot;
  }

  getPlayTime(): number {
    return this.totalPlayTime + Math.floor((Date.now() - this.playTimeStart) / 1000);
  }

  // ---- Export/Import ----

  exportSave(slot: string): string | null {
    const compressed = localStorage.getItem(SaveManager.STORAGE_PREFIX + slot);
    return compressed;
  }

  importSave(slot: string, data: string): boolean {
    try {
      // Validate before importing
      const json = this.decompress(data);
      const parsed = JSON.parse(json);
      const result = SaveGameDataSchema.safeParse(parsed);
      if (!result.success) return false;

      localStorage.setItem(SaveManager.STORAGE_PREFIX + slot, data);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// SLOT INFO TYPE
// ============================================================================

export interface SaveSlotInfo {
  slot: string;
  exists: boolean;
  saveId?: string;
  playerName?: string;
  timestamp?: number;
  playTimeSeconds?: number;
  worldSeed?: string;
  currentBiome?: BiomeType;
  engineVersion?: string;
  screenshot?: string;
  error?: string;
}

// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================

export class SaveSerializer {
  // Serialize Three.js objects to plain objects
  static serializeVector3(v: THREE.Vector3): Vec3 {
    return { x: v.x, y: v.y, z: v.z };
  }

  static serializeQuaternion(q: THREE.Quaternion): Quat {
    return { x: q.x, y: q.y, z: q.z, w: q.w };
  }

  static serializeTransform(position: THREE.Vector3, rotation: THREE.Quaternion, scale: THREE.Vector3) {
    return {
      position: this.serializeVector3(position),
      rotation: this.serializeQuaternion(rotation),
      scale: this.serializeVector3(scale),
    };
  }

  // Deserialize back to Three.js
  static deserializeVector3(v: Vec3): THREE.Vector3 {
    return new THREE.Vector3(v.x, v.y, v.z);
  }

  static deserializeQuaternion(q: Quat): THREE.Quaternion {
    return new THREE.Quaternion(q.x, q.y, q.z, q.w);
  }

  static applyTransform(object: THREE.Object3D, transform: { position: Vec3; rotation: Quat; scale: Vec3 }): void {
    object.position.set(transform.position.x, transform.position.y, transform.position.z);
    object.quaternion.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w);
    object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
  }
}

// Need to import THREE for serializer
import * as THREE from 'three';