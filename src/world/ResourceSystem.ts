/**
 * Resource System - Gathering Nodes, Respawn, Economy
 * Manages harvestable resources, nodes, and resource economy
 */

import { World, EntityId, BaseSystem } from '@core/ECS.js';
import { TransformComponent } from '@core/ECS.js';
import { TerrainSystem } from './TerrainSystem.js';
import { BiomeManager } from './BiomeManager.js';
import { BiomeType, ItemType, Vec3, Quat } from '@core/Types.js';
import { ITEM_DEFINITIONS } from '@core/Config.js';
import { AssetLoader } from '@engine/AssetLoader.js';
import { ItemType as ConfigItemType } from '@core/Config.js';

// ============================================================================
// RESOURCE NODE TYPES
// ============================================================================

export interface ResourceNodeDefinition {
  id: string;
  name: string;
  description: string;

  // Visual
  modelPath: string;
  scale: number;
  variations: ResourceVariation[];

  // Harvesting
  toolRequired: string | null; // e.g., 'axe', 'pickaxe', 'sickle', null
  harvestTime: number; // seconds
  harvestSkill: string | null; // 'mining', 'logging', 'foraging', 'fishing'
  expReward: number;

  // Yield
  drops: ResourceDrop[];

  // Respawn
  respawnTime: number; // seconds
  respawnVariance: number; // 0-1
  maxNodesPerChunk: number;

  // Placement
  biomeWeights: Record<BiomeType, number>;
  placementRules: PlacementRule[];

  // Visual feedback
  harvestEffect: string;
  depletionEffect: string;
  soundHarvest: string;
  soundDeplete: string;
}

export interface ResourceVariation {
  id: string;
  name: string;
  modelPath?: string;
  textureTint?: { r: number; g: number; b: number };
  dropMultiplier: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic';
}

export interface ResourceDrop {
  itemId: string;
  minQuantity: number;
  maxQuantity: number;
  chance: number;
  condition?: string; // 'tool', 'skill_level', 'time_of_day'
  requiredTool?: string;
  requiredSkillLevel?: number;
}

export interface PlacementRule {
  type: 'terrain' | 'biome' | 'proximity' | 'height' | 'slope';
  params: Record<string, any>;
}

export interface ResourceNodeInstance {
  entityId: EntityId;
  definitionId: string;
  variationId?: string;
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  currentHealth: number;
  maxHealth: number;
  isDepleted: boolean;
  depletionTime: number;
  respawnTime: number;
  chunkKey: string;
  harvesterId?: EntityId;
  lastHarvestTime: number;
}

export interface HarvestResult {
  success: boolean;
  items: { itemId: string; quantity: number }[];
  experience: number;
  nodeDepleted: boolean;
  message: string;
}

// ============================================================================
// RESOURCE SYSTEM
// ============================================================================

export class ResourceSystem extends BaseSystem {
  readonly priority = 45;

  private terrainSystem: TerrainSystem;
  private biomeManager: BiomeManager;
  private assetLoader: AssetLoader;

  // Definitions
  private nodeDefinitions: Map<string, ResourceNodeDefinition> = new Map();

  // Active nodes
  private activeNodes: Map<EntityId, ResourceNodeInstance> = new Map();
  private nodesByChunk: Map<string, EntityId[]> = new Map();

  // Configuration
  private maxNodesTotal = 500;
  private spawnCheckInterval = 10; // seconds
  private spawnTimer = 0;

  // Callbacks
  public onNodeSpawned?: (entityId: EntityId, definitionId: string) => void;
  public onNodeDepleted?: (entityId: EntityId, harvesterId: EntityId) => void;
  public onNodeRespawned?: (entityId: EntityId) => void;
  public onHarvestComplete?: (result: HarvestResult) => void;

  constructor(
    world: any,
    terrainSystem: TerrainSystem,
    biomeManager: BiomeManager,
    assetLoader: AssetLoader
  ) {
    super();
    this.terrainSystem = terrainSystem;
    this.biomeManager = biomeManager;
    this.assetLoader = assetLoader;
    this.initializeDefinitions();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeDefinitions(): void {
    // Trees
    this.registerNode({
      id: 'tree_spirit_oak',
      name: 'Carvalho Espiritual',
      description: 'Árvore antiga que brilha à noite. Fornece madeira espiritual.',
      modelPath: 'resources/tree_spirit_oak.glb',
      scale: 1.2,
      variations: [
        { id: 'normal', name: 'Comum', dropMultiplier: 1.0, rarity: 'common' },
        { id: 'ancient', name: 'Ancião', textureTint: { r: 1, g: 0.9, b: 0.7 }, dropMultiplier: 2.0, rarity: 'rare' },
      ],
      toolRequired: 'axe',
      harvestTime: 4.0,
      harvestSkill: 'logging',
      expReward: 15,
      drops: [
        { itemId: 'wood', minQuantity: 3, maxQuantity: 6, chance: 1.0 },
        { itemId: 'spirit_essence', minQuantity: 1, maxQuantity: 1, chance: 0.15 },
        { itemId: 'acorn', minQuantity: 1, maxQuantity: 2, chance: 0.3 },
      ],
      respawnTime: 300, // 5 minutes
      respawnVariance: 0.3,
      maxNodesPerChunk: 5,
      biomeWeights: {
        SpiritPlains: 1.0,
        FloatingMountains: 0.3,
        AshDesert: 0.0,
        ToxicSwamp: 0.2,
        CoastalOcean: 0.5,
      },
      placementRules: [
        { type: 'terrain', params: { allowedTypes: ['grass', 'dirt'] } },
        { type: 'slope', params: { maxSlope: 0.5 } },
        { type: 'proximity', params: { minDistance: 4, checkTypes: ['tree'] } },
      ],
      harvestEffect: 'wood_chips',
      depletionEffect: 'tree_fall',
      soundHarvest: 'chop_wood',
      soundDeplete: 'tree_fall',
    });

    // Stone nodes
    this.registerNode({
      id: 'stone_runic',
      name: 'Pedra Rúnica',
      description: 'Pedra com gravuras que brilham fracamente.',
      modelPath: 'resources/stone_runic.glb',
      scale: 1.0,
      variations: [
        { id: 'normal', name: 'Comum', dropMultiplier: 1.0, rarity: 'common' },
        { id: 'crystal_vein', name: 'Veio de Cristal', textureTint: { r: 0.7, g: 0.9, b: 1 }, dropMultiplier: 1.5, rarity: 'uncommon' },
      ],
      toolRequired: 'pickaxe',
      harvestTime: 3.0,
      harvestSkill: 'mining',
      expReward: 12,
      drops: [
        { itemId: 'stone', minQuantity: 2, maxQuantity: 5, chance: 1.0 },
        { itemId: 'crystal', minQuantity: 1, maxQuantity: 2, chance: 0.25 },
        { itemId: 'rune_fragment', minQuantity: 1, maxQuantity: 1, chance: 0.1 },
      ],
      respawnTime: 240,
      respawnVariance: 0.2,
      maxNodesPerChunk: 4,
      biomeWeights: {
        SpiritPlains: 0.5,
        FloatingMountains: 1.0,
        AshDesert: 0.8,
        ToxicSwamp: 0.3,
        CoastalOcean: 0.4,
      },
      placementRules: [
        { type: 'terrain', params: { allowedTypes: ['rock', 'dirt'] } },
        { type: 'slope', params: { maxSlope: 0.7 } },
      ],
      harvestEffect: 'stone_dust',
      depletionEffect: 'rock_break',
      soundHarvest: 'mine_stone',
      soundDeplete: 'rock_shatter',
    });

    // Crystal nodes
    this.registerNode({
      id: 'crystal_mana',
      name: 'Cristal de Mana',
      description: 'Cristal puro que pulsa com energia mágica.',
      modelPath: 'resources/crystal_mana.glb',
      scale: 0.8,
      variations: [
        { id: 'normal', name: 'Comum', dropMultiplier: 1.0, rarity: 'common' },
        { id: 'greater', name: 'Maior', textureTint: { r: 1, g: 1, b: 1 }, dropMultiplier: 2.0, rarity: 'rare' },
        { id: 'primal', name: 'Primal', textureTint: { r: 1, g: 0.5, b: 1 }, dropMultiplier: 3.0, rarity: 'epic' },
      ],
      toolRequired: 'pickaxe',
      harvestTime: 5.0,
      harvestSkill: 'mining',
      expReward: 25,
      drops: [
        { itemId: 'crystal', minQuantity: 1, maxQuantity: 3, chance: 1.0 },
        { itemId: 'essence', minQuantity: 1, maxQuantity: 2, chance: 0.5 },
        { itemId: 'primal_shard', minQuantity: 1, maxQuantity: 1, chance: 0.05 },
      ],
      respawnTime: 600,
      respawnVariance: 0.5,
      maxNodesPerChunk: 2,
      biomeWeights: {
        SpiritPlains: 0.3,
        FloatingMountains: 0.8,
        AshDesert: 0.5,
        ToxicSwamp: 0.1,
        CoastalOcean: 0.2,
      },
      placementRules: [
        { type: 'height', params: { minHeight: 50 } },
        { type: 'proximity', params: { minDistance: 10, checkTypes: ['crystal'] } },
      ],
      harvestEffect: 'crystal_sparkle',
      depletionEffect: 'crystal_shatter',
      soundHarvest: 'mine_crystal',
      soundDeplete: 'crystal_explode',
    });

    // Plants/Herbs
    this.registerNode({
      id: 'herb_spirit_flower',
      name: 'Flor Espiritual',
      description: 'Flor que brilha suavemente. Usada em poções.',
      modelPath: 'resources/herb_spirit_flower.glb',
      scale: 0.5,
      variations: [
        { id: 'normal', name: 'Comum', dropMultiplier: 1.0, rarity: 'common' },
        { id: 'lunar', name: 'Lunar', textureTint: { r: 0.7, g: 0.7, b: 1 }, dropMultiplier: 1.5, rarity: 'uncommon' },
      ],
      toolRequired: null, // Can be harvested by hand
      harvestTime: 1.5,
      harvestSkill: 'foraging',
      expReward: 8,
      drops: [
        { itemId: 'spirit_flower', minQuantity: 1, maxQuantity: 2, chance: 1.0 },
        { itemId: 'nectar', minQuantity: 1, maxQuantity: 1, chance: 0.3 },
      ],
      respawnTime: 180,
      respawnVariance: 0.4,
      maxNodesPerChunk: 8,
      biomeWeights: {
        SpiritPlains: 1.0,
        FloatingMountains: 0.5,
        AshDesert: 0.0,
        ToxicSwamp: 0.6,
        CoastalOcean: 0.4,
      },
      placementRules: [
        { type: 'terrain', params: { allowedTypes: ['grass', 'dirt'] } },
        { type: 'slope', params: { maxSlope: 0.6 } },
      ],
      harvestEffect: 'petals',
      depletionEffect: 'wither',
      soundHarvest: 'pick_herb',
      soundDeplete: 'plant_wither',
    });

    // Bushes
    this.registerNode({
      id: 'bush_berry',
      name: 'Arbusto de Bagas',
      description: 'Arbusto carregado de bagas comestíveis.',
      modelPath: 'resources/bush_berry.glb',
      scale: 0.7,
      variations: [
        { id: 'normal', name: 'Comum', dropMultiplier: 1.0, rarity: 'common' },
        { id: 'thorny', name: 'Espinhoso', dropMultiplier: 1.2, rarity: 'uncommon' },
      ],
      toolRequired: 'sickle',
      harvestTime: 2.0,
      harvestSkill: 'foraging',
      expReward: 10,
      drops: [
        { itemId: 'berry', minQuantity: 2, maxQuantity: 5, chance: 1.0 },
        { itemId: 'seed', minQuantity: 1, maxQuantity: 2, chance: 0.2 },
      ],
      respawnTime: 120,
      respawnVariance: 0.3,
      maxNodesPerChunk: 6,
      biomeWeights: {
        SpiritPlains: 0.8,
        FloatingMountains: 0.4,
        AshDesert: 0.1,
        ToxicSwamp: 0.5,
        CoastalOcean: 0.6,
      },
      placementRules: [
        { type: 'terrain', params: { allowedTypes: ['grass', 'dirt'] } },
      ],
      harvestEffect: 'berries',
      depletionEffect: 'shake_empty',
      soundHarvest: 'pick_berry',
      soundDeplete: 'bush_rustle',
    });

    // Mushrooms
    this.registerNode({
      id: 'mushroom_glow',
      name: 'Cogumelo Brilhante',
      description: 'Cogumelo que emite luz própria. Valioso para alquimia.',
      modelPath: 'resources/mushroom_glow.glb',
      scale: 0.4,
      variations: [
        { id: 'normal', name: 'Comum', dropMultiplier: 1.0, rarity: 'common' },
        { id: 'giant', name: 'Gigante', dropMultiplier: 3.0, rarity: 'rare' },
      ],
      toolRequired: null,
      harvestTime: 1.0,
      harvestSkill: 'foraging',
      expReward: 12,
      drops: [
        { itemId: 'glow_mushroom', minQuantity: 1, maxQuantity: 2, chance: 1.0 },
        { itemId: 'spore', minQuantity: 1, maxQuantity: 3, chance: 0.4 },
      ],
      respawnTime: 300,
      respawnVariance: 0.5,
      maxNodesPerChunk: 4,
      biomeWeights: {
        SpiritPlains: 0.2,
        FloatingMountains: 0.1,
        AshDesert: 0.0,
        ToxicSwamp: 1.0,
        CoastalOcean: 0.0,
      },
      placementRules: [
        { type: 'terrain', params: { allowedTypes: ['dirt', 'mud'] } },
        { type: 'proximity', params: { minDistance: 3, checkTypes: ['mushroom'] } },
      ],
      harvestEffect: 'spores',
      depletionEffect: 'pop',
      soundHarvest: 'pick_mushroom',
      soundDeplete: 'mushroom_pop',
    });

    // Ore veins (rare, high value)
    this.registerNode({
      id: 'ore_iron',
      name: 'Veio de Ferro',
      description: 'Depósito de ferro bruto. Essencial para ferramentas.',
      modelPath: 'resources/ore_iron.glb',
      scale: 1.0,
      variations: [
        { id: 'normal', name: 'Comum', dropMultiplier: 1.0, rarity: 'common' },
        { id: 'rich', name: 'Rico', textureTint: { r: 1, g: 0.8, b: 0.6 }, dropMultiplier: 2.0, rarity: 'uncommon' },
      ],
      toolRequired: 'pickaxe',
      harvestTime: 6.0,
      harvestSkill: 'mining',
      expReward: 30,
      drops: [
        { itemId: 'iron_ore', minQuantity: 3, maxQuantity: 6, chance: 1.0 },
        { itemId: 'coal', minQuantity: 1, maxQuantity: 2, chance: 0.4 },
        { itemId: 'gem_raw', minQuantity: 1, maxQuantity: 1, chance: 0.1 },
      ],
      respawnTime: 900,
      respawnVariance: 0.4,
      maxNodesPerChunk: 1,
      biomeWeights: {
        SpiritPlains: 0.2,
        FloatingMountains: 0.6,
        AshDesert: 0.7,
        ToxicSwamp: 0.1,
        CoastalOcean: 0.2,
      },
      placementRules: [
        { type: 'height', params: { minHeight: 30 } },
        { type: 'terrain', params: { allowedTypes: ['rock'] } },
      ],
      harvestEffect: 'metal_sparks',
      depletionEffect: 'vein_exhausted',
      soundHarvest: 'mine_metal',
      soundDeplete: 'vein_collapse',
    });

    // Water resources
    this.registerNode({
      id: 'water_spring',
      name: 'Nascente Pura',
      description: 'Água cristalina com propriedades curativas.',
      modelPath: 'resources/water_spring.glb',
      scale: 1.0,
      variations: [
        { id: 'normal', name: 'Comum', dropMultiplier: 1.0, rarity: 'common' },
        { id: 'blessed', name: 'Abençoada', textureTint: { r: 0.7, g: 1, b: 1 }, dropMultiplier: 2.0, rarity: 'rare' },
      ],
      toolRequired: null, // Use container
      harvestTime: 2.0,
      harvestSkill: 'foraging',
      expReward: 5,
      drops: [
        { itemId: 'pure_water', minQuantity: 1, maxQuantity: 3, chance: 1.0 },
        { itemId: 'blessed_droplet', minQuantity: 1, maxQuantity: 1, chance: 0.1 },
      ],
      respawnTime: 60,
      respawnVariance: 0.2,
      maxNodesPerChunk: 3,
      biomeWeights: {
        SpiritPlains: 0.5,
        FloatingMountains: 0.3,
        AshDesert: 0.1,
        ToxicSwamp: 0.0,
        CoastalOcean: 0.8,
      },
      placementRules: [
        { type: 'terrain', params: { allowedTypes: ['water', 'shore'] } },
      ],
      harvestEffect: 'water_splash',
      depletionEffect: 'dry_up',
      soundHarvest: 'water_fill',
      soundDeplete: 'water_dry',
    });
  }

  private registerNode(def: ResourceNodeDefinition): void {
    this.nodeDefinitions.set(def.id, def);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getNodeDefinition(id: string): ResourceNodeDefinition | undefined {
    return this.nodeDefinitions.get(id);
  }

  getAllDefinitions(): ResourceNodeDefinition[] {
    return Array.from(this.nodeDefinitions.values());
  }

  // ============================================================================
  // SPAWNING
  // ============================================================================

  async initializeNodes(): Promise<void> {
    // Spawn initial nodes across the world
    const worldRadius = 2000;
    const chunkSize = 64;

    for (let cz = -worldRadius / chunkSize; cz <= worldRadius / chunkSize; cz++) {
      for (let cx = -worldRadius / chunkSize; cx <= worldRadius / chunkSize; cx++) {
        const chunkKey = `${cx},${cz}`;
        await this.spawnNodesInChunk(cx, cz, chunkKey);
      }
    }

    console.log(`[ResourceSystem] Initialized ${this.activeNodes.size} resource nodes`);
  }

  private async spawnNodesInChunk(cx: number, cz: number, chunkKey: string): Promise<void> {
    const chunkCenterX = cx * 64 + 32;
    const chunkCenterZ = cz * 64 + 32;

    // Determine biome at chunk center
    const biome = this.biomeManager.getDominantBiome({ x: chunkCenterX, y: 0, z: chunkCenterZ });

    // Get candidate nodes for this biome
    const candidates = this.getNodesForBiome(biome);
    if (candidates.length === 0) return;

    // Spawn nodes
    for (const def of candidates) {
      const maxNodes = def.maxNodesPerChunk;
      const currentInChunk = this.nodesByChunk.get(chunkKey)?.length ?? 0;

      // Check if we can spawn more of this type
      let typeCount = 0;
      for (const nodeId of this.nodesByChunk.get(chunkKey) || []) {
        const node = this.activeNodes.get(nodeId);
        if (node && node.definitionId === def.id) typeCount++;
      }

      if (typeCount >= maxNodes) continue;

      // Determine how many to spawn
      const toSpawn = Math.floor(Math.random() * (maxNodes - typeCount + 1));

      for (let i = 0; i < toSpawn; i++) {
        const position = this.findNodePosition(chunkCenterX, chunkCenterZ, def);
        if (position) {
          this.createNode(def.id, position, chunkKey);
        }
      }
    }
  }

  private getNodesForBiome(biome: BiomeType): ResourceNodeDefinition[] {
    const results: ResourceNodeDefinition[] = [];

    for (const def of this.nodeDefinitions.values()) {
      const weight = def.biomeWeights[biome] ?? 0;
      if (weight > 0) {
        // Add multiple entries based on weight for weighted random
        const count = Math.max(1, Math.floor(weight * 2));
        for (let i = 0; i < count; i++) {
          results.push(def);
        }
      }
    }

    return results;
  }

  private findNodePosition(chunkCenterX: number, chunkCenterZ: number, def: ResourceNodeDefinition): Vec3 | null {
    const attempts = 20;
    const radius = 28; // Chunk radius minus margin

    for (let i = 0; i < attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius;
      const x = chunkCenterX + Math.cos(angle) * distance;
      const z = chunkCenterZ + Math.sin(angle) * distance;
      const y = this.terrainSystem.getHeightAtWorld(x, z);

      if (this.isValidNodePosition(x, y, z, def)) {
        return { x, y: y + 0.1, z };
      }
    }

    return null;
  }

  private isValidNodePosition(x: number, y: number, z: number, def: ResourceNodeDefinition): boolean {
    // Check terrain type
    // Would check terrain system for biome/type at position

    // Check slope
    // Would check terrain normal

    // Check collision with other nodes
    for (const node of this.activeNodes.values()) {
      const dist = Math.sqrt((node.position.x - x) ** 2 + (node.position.z - z) ** 2);
      if (dist < 3) return false;
    }

    // Check collision with buildings
    // Would check building system

    // Check water (unless water node)
    // if (y < 0 && !def.id.includes('water')) return false;

    return true;
  }

  private createNode(defId: string, position: Vec3, chunkKey: string): EntityId | null {
    const def = this.nodeDefinitions.get(defId);
    if (!def) return null;

    const world = this.world;
    const entityId = world.createEntity();

    // Transform
    const transform = new TransformComponent(entityId);
    transform.setPosition(position.x, position.y, position.z);
    const q = new (require('three')).Quaternion().setFromEuler(
      new (require('three')).Euler(0, Math.random() * Math.PI * 2, 0)
    );
    transform.setRotation(q.x, q.y, q.z, q.w);
    transform.setScale(def.scale, def.scale, def.scale);
    world.addComponent(entityId, transform);

    // Pick variation
    const variationId = this.pickVariation(def);

    // Determine health based on variation
    let baseHealth = 100;
    if (variationId) {
      const variation = def.variations.find(v => v.id === variationId);
      if (variation) {
        baseHealth = Math.round(100 * variation.dropMultiplier);
      }
    }

    // Create node instance
    const node: ResourceNodeInstance = {
      entityId,
      definitionId: defId,
      variationId,
      position: { ...position },
      rotation: { x: 0, y: Math.random() * Math.PI * 2, z: 0, w: 1 },
      scale: { x: def.scale, y: def.scale, z: def.scale },
      currentHealth: baseHealth,
      maxHealth: baseHealth,
      isDepleted: false,
      depletionTime: 0,
      respawnTime: 0,
      chunkKey,
      lastHarvestTime: 0,
    };

    this.activeNodes.set(entityId, node);

    if (!this.nodesByChunk.has(chunkKey)) {
      this.nodesByChunk.set(chunkKey, []);
    }
    this.nodesByChunk.get(chunkKey)!.push(entityId);

    // Name & Tag
    const nameComp = new (require('@core/ECS.js').NameComponent)(entityId, def.name);
    const tagComp = new (require('@core/ECS.js').TagComponent)(entityId, 'resource', 'node', def.id, def.harvestSkill || 'none');
    world.addComponent(entityId, nameComp);
    world.addComponent(entityId, tagComp);

    // Load model (async)
    this.loadNodeModel(entityId, def, variationId);

    this.onNodeSpawned?.(entityId, defId);
    return entityId;
  }

  private pickVariation(def: ResourceNodeDefinition): string | undefined {
    if (!def.variations || def.variations.length === 0) return undefined;

    // Weighted by rarity
    const rarityWeights = { common: 100, uncommon: 20, rare: 5, epic: 1, legendary: 1 };
    let totalWeight = 0;
    for (const v of def.variations) {
      totalWeight += rarityWeights[v.rarity] || 1;
    }

    let random = Math.random() * totalWeight;
    for (const v of def.variations) {
      random -= rarityWeights[v.rarity] || 1;
      if (random <= 0) return v.id;
    }

    return def.variations[0]?.id ?? '';
  }

  private async loadNodeModel(entityId: EntityId, def: ResourceNodeDefinition, variationId?: string): Promise<void> {
    // Would load GLTF model
    // For now, placeholder
    console.log(`[ResourceSystem] Loading model for ${def.id}${variationId ? ` (${variationId})` : ''}`);
  }

  // ============================================================================
  // HARVESTING
  // ============================================================================

  harvestNode(harvesterId: EntityId, nodeId: EntityId, toolId?: string): HarvestResult {
    const node = this.activeNodes.get(nodeId);
    if (!node) {
      return { success: false, items: [], experience: 0, nodeDepleted: false, message: 'Nó não encontrado' };
    }

    if (node.isDepleted) {
      return { success: false, items: [], experience: 0, nodeDepleted: true, message: 'Nó esgotado' };
    }

    const def = this.nodeDefinitions.get(node.definitionId);
    if (!def) {
      return { success: false, items: [], experience: 0, nodeDepleted: false, message: 'Definição não encontrada' };
    }

    // Check tool requirement
    if (def.toolRequired && toolId) {
      const toolDef = ITEM_DEFINITIONS[toolId];
      if (!toolDef || toolDef.weaponType !== this.getToolType(def.toolRequired)) {
        return { success: false, items: [], experience: 0, nodeDepleted: false, message: `Requer ${def.toolRequired}` };
      }
    }

    // Check skill level (would integrate with player skills)
    // For now, always allow

    // Calculate damage based on tool
    let damage = 25; // Base damage
    if (toolId) {
      const toolDef = ITEM_DEFINITIONS[toolId];
      if (toolDef && toolDef.weaponType) {
        const weaponConfig = (require('@core/Config.js') as any).WEAPON_CONFIG?.[toolDef.weaponType];
        if (weaponConfig) {
          damage = weaponConfig.damage;
        }
      }
    }

    // Apply damage
    node.currentHealth = Math.max(0, node.currentHealth - damage);
    node.lastHarvestTime = Date.now();
    node.harvesterId = harvesterId;

    // Check for depletion
    if (node.currentHealth <= 0) {
      return this.depleteNode(nodeId, harvesterId);
    }

    // Partial harvest - small chance for items
    const items: { itemId: string; quantity: number }[] = [];
    const expGain = Math.round(def.expReward * 0.1);

    // Small chance for partial drops
    if (Math.random() < 0.1) {
      for (const drop of def.drops) {
        if (Math.random() < drop.chance * 0.2) {
          const qty = drop.minQuantity + Math.floor(Math.random() * (drop.maxQuantity - drop.minQuantity + 1));
          items.push({ itemId: drop.itemId, quantity: qty });
        }
      }
    }

    const result: HarvestResult = {
      success: true,
      items,
      experience: expGain,
      nodeDepleted: false,
      message: `Coletando... (${node.currentHealth}/${node.maxHealth})`,
    };

    this.onHarvestComplete?.(result);
    return result;
  }

  private depleteNode(nodeId: EntityId, harvesterId: EntityId): HarvestResult {
    const node = this.activeNodes.get(nodeId)!;
    const def = this.nodeDefinitions.get(node.definitionId)!;

    node.isDepleted = true;
    node.depletionTime = Date.now();
    node.respawnTime = Date.now() + (def.respawnTime + def.respawnTime * def.respawnVariance * (Math.random() * 2 - 1)) * 1000;

    // Full harvest drops
    const items: { itemId: string; quantity: number }[] = [];
    for (const drop of def.drops) {
      if (Math.random() < drop.chance) {
        const multiplier = node.variationId ? this.getVariationMultiplier(def, node.variationId!) : 1;
        const qty = Math.round((drop.minQuantity + Math.floor(Math.random() * (drop.maxQuantity - drop.minQuantity + 1))) * multiplier);
        if (qty > 0) {
          items.push({ itemId: drop.itemId, quantity: qty });
        }
      }
    }

    const expGain = def.expReward;

    const result: HarvestResult = {
      success: true,
      items,
      experience: expGain,
      nodeDepleted: true,
      message: `${def.name} esgotado!`,
    };

    // Visual/audio effects
    this.playDepletionEffect(node);

    this.onNodeDepleted?.(nodeId, harvesterId);
    this.onHarvestComplete?.(result);

    return result;
  }

  private getVariationMultiplier(def: ResourceNodeDefinition, variationId: string): number {
    const variation = def.variations.find(v => v.id === variationId);
    return variation?.dropMultiplier ?? 1;
  }

  private playDepletionEffect(node: ResourceNodeInstance): void {
    // Would trigger visual/audio effects
    console.log(`[ResourceSystem] Node depleted: ${node.definitionId}`);
  }

  // ============================================================================
  // RESPAWN
  // ============================================================================

  private checkRespawns(): void {
    const now = Date.now();

    for (const [entityId, node] of this.activeNodes) {
      if (node.isDepleted && now >= node.respawnTime) {
        this.respawnNode(entityId);
      }
    }
  }

  private respawnNode(entityId: EntityId): void {
    const node = this.activeNodes.get(entityId);
    if (!node) return;

    const def = this.nodeDefinitions.get(node.definitionId);
    if (!def) return;

    // Reset health
    const variationId = this.pickVariation(def);
    node.variationId = variationId;
    node.maxHealth = Math.round(100 * (def.variations.find(v => v.id === variationId)?.dropMultiplier ?? 1));
    node.currentHealth = node.maxHealth;
    node.isDepleted = false;
    node.depletionTime = 0;
    node.respawnTime = 0;
    node.harvesterId = undefined;

    // New random rotation
    const q = new (require('three')).Quaternion().setFromEuler(
      new (require('three')).Euler(0, Math.random() * Math.PI * 2, 0)
    );
    node.rotation = { x: 0, y: q.y, z: 0, w: q.w };

    // Reload model with new variation
    this.loadNodeModel(entityId, def, variationId);

    this.onNodeRespawned?.(entityId);
  }

  // ============================================================================
  // UPDATE
  // ============================================================================

  update(dt: number): void {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnCheckInterval) {
      this.spawnTimer = 0;
      this.checkRespawns();
      this.cleanupDistantNodes();
    }
  }

  private cleanupDistantNodes(): void {
    // Remove nodes too far from any player
    // Would need player positions
  }

  // ============================================================================
  // SAVE/LOAD
  // ============================================================================

  serialize(): any {
    const nodes: any[] = [];
    for (const [entityId, node] of this.activeNodes) {
      nodes.push({
        entityId,
        definitionId: node.definitionId,
        variationId: node.variationId,
        position: node.position,
        rotation: node.rotation,
        scale: node.scale,
        currentHealth: node.currentHealth,
        maxHealth: node.maxHealth,
        isDepleted: node.isDepleted,
        depletionTime: node.depletionTime,
        respawnTime: node.respawnTime,
        chunkKey: node.chunkKey,
      });
    }
    return { nodes };
  }

  deserialize(data: any): void {
    // Clear existing
    for (const entityId of this.activeNodes.keys()) {
      this.world.destroyEntity(entityId);
    }
    this.activeNodes.clear();
    this.nodesByChunk.clear();

    // Recreate nodes
    for (const nodeData of data.nodes) {
      const entityId = this.world.createEntity();

      const transform = new TransformComponent(entityId);
      transform.setPosition(nodeData.position.x, nodeData.position.y, nodeData.position.z);
      transform.setRotation(nodeData.rotation.x, nodeData.rotation.y, nodeData.rotation.z, nodeData.rotation.w);
      transform.setScale(nodeData.scale.x, nodeData.scale.y, nodeData.scale.z);
      this.world.addComponent(entityId, transform);

      const node: ResourceNodeInstance = {
        ...nodeData,
        entityId,
      };

      this.activeNodes.set(entityId, node);

      if (!this.nodesByChunk.has(nodeData.chunkKey)) {
        this.nodesByChunk.set(nodeData.chunkKey, []);
      }
      this.nodesByChunk.get(nodeData.chunkKey)!.push(entityId);

      // Reload model
      const def = this.nodeDefinitions.get(nodeData.definitionId);
      if (def) {
        this.loadNodeModel(entityId, def, nodeData.variationId);
      }
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getToolType(toolName: string): string {
    const toolMap: Record<string, string> = {
      axe: 'Axe',
      pickaxe: 'Axe', // Would be separate in real implementation
      sickle: 'Daggers',
    };
    return toolMap[toolName] || 'Axe';
  }
}