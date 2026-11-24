/**
 * Game Configuration - Centralized constants and tunables
 * All gameplay numbers live here for easy balancing
 */

// Import enum values (runtime values) - enums are both types and values
import {
  BiomeType,
  DamageType,
  DamageElement,
  WeaponType,
  ItemType,
  EquipmentSlot,
  LocomotionState,
  CreatureState,
  ActionName,
  GraphicsPreset,
  TextureQuality,
  ShadowQuality,
  ScreenMode,
} from './Types.js';

// Import types from Types.js (using import type for isolatedModules compatibility)
import type {
  WeaponTypeConfig,
  GraphicsSettings,
} from './Types.js';

// Re-export types for consumers (using export type for isolatedModules)
export type {
  WeaponTypeConfig,
  GraphicsSettings,
  DamageElement,
};

// Re-export enum values (enums are both types and values, export covers both)
export {
  BiomeType,
  DamageType,
  WeaponType,
  ItemType,
  EquipmentSlot,
  LocomotionState,
  CreatureState,
  ActionName,
  GraphicsPreset,
  TextureQuality,
  ShadowQuality,
  ScreenMode,
};

// ============================================================================
// ENGINE CONFIG
// ============================================================================

export const ENGINE_CONFIG = {
  name: 'ChimeraLand',
  version: '0.2.0-3d-prototype',
  targetFPS: 60,
  fixedTimestep: 1 / 60,
  maxSubSteps: 3,
} as const;

// ============================================================================
// WORLD CONFIG
// ============================================================================

export const WORLD_CONFIG = {
  // Chunk system
  chunkSize: 64, // meters
  chunkHeight: 128,
  renderDistanceChunks: 4, // radius in chunks
  chunkLoadRadius: 5,
  chunkUnloadRadius: 7,

  // Terrain
  terrainHeightScale: 64,
  terrainBaseHeight: 32,
  terrainNoiseScale: 0.005,
  terrainOctaves: 6,
  terrainPersistence: 0.5,
  terrainLacunarity: 2.0,

  // Biome blending
  biomeBlendRadius: 128,
  biomeTransitionSharpness: 0.5,

  // Gravity
  gravity: -9.81 * 2, // Double gravity for snappier feel
  terminalVelocity: -80,
} as const;

// ============================================================================
// PLAYER CONFIG
// ============================================================================

export const PLAYER_CONFIG = {
  // Capsule collider
  capsuleRadius: 0.45,
  capsuleHeight: 1.8,
  capsuleYOffset: 0.9,

  // Movement
  walkSpeed: 3.5,
  runSpeed: 6.5,
  sprintSpeed: 10.0,
  swimSpeed: 2.5,
  flySpeed: 15.0,
  acceleration: 25.0,
  airAcceleration: 12.0,
  turnSpeed: 15.0,

  // Jumping
  jumpHeight: 1.8,
  coyoteTime: 0.1,
  jumpBufferTime: 0.15,
  maxAirJumps: 1,

  // Dash
  dashDistance: 5.0,
  dashDuration: 0.15,
  dashCooldown: 1.0,
  dashInvincibilityTime: 0.2,

  // Stamina
  maxStamina: 100,
  staminaRegenRate: 15,
  staminaRegenDelay: 0.5,
  sprintStaminaCost: 20, // per second
  dashStaminaCost: 25,
  attackStaminaCost: 8,
  blockStaminaCost: 5, // per second

  // Health
  maxHp: 100,
  hpRegenRate: 2,
  hpRegenDelay: 3.0,

  // Fury (resource for ultimate skills)
  maxFury: 100,
  furyGainOnHit: 5,
  furyGainOnKill: 15,
  furyDecayRate: 2, // per second

  // Camera
  cameraDistance: 4.0,
  cameraMinDistance: 1.5,
  cameraMaxDistance: 10.0,
  cameraHeightOffset: 1.4,
  cameraPitchMin: -80,
  cameraPitchMax: 80,
  cameraSensitivity: 0.002,
  cameraSmoothing: 0.1,

  // Combat
  attackRange: 2.5,
  attackAngle: Math.PI / 3, // 60 degrees
  lockOnRange: 20.0,
  lockOnAngle: Math.PI / 4, // 45 degrees

  // Inventory
  inventoryWidth: 10,
  inventoryHeight: 8,
  maxStackSize: 999,
} as const;

// ============================================================================
// CREATURE CONFIG
// ============================================================================

export const CREATURE_CONFIG = {
  // Base stats scaling per level
  hpPerLevel: 15,
  damagePerLevel: 2,
  armorPerLevel: 0.5,
  speedPerLevel: 0.1,

  // AI
  detectionRange: 25.0,
  attackRange: 2.0,
  loseInterestRange: 40.0,
  wanderRadius: 15.0,
  wanderInterval: { min: 3, max: 8 },

  // Combat
  staggerThreshold: 0.3, // damage / maxHp
  knockbackResistance: 1.0,
  poiseRegenRate: 10,

  // Taming
  baseTameChance: 0.15,
  tameFoodBonus: 0.25,
  maxTameLevelDiff: 10,

  // Mutation
  maxMutations: 6,
  mutationSlots: ['head', 'back', 'tail', 'frontLegs', 'claws', 'core'] as const,
} as const;

// ============================================================================
// WEAPON CONFIG
// ============================================================================

export const WEAPON_CONFIG: Record<WeaponType, WeaponTypeConfig> = {
  [WeaponType.Sword]: {
    type: WeaponType.Sword,
    damage: 28,
    attackSpeed: 1.2,
    range: 2.8,
    angle: Math.PI / 2.5,
    staminaCost: 8,
    knockback: 2.0,
    staggerPower: 8,
    comboCount: 4,
    skills: ['Whirlwind', 'Parry', 'Lunge'],
    hitboxShape: 'capsule',
    hitboxSize: { radius: 0.3, length: 2.5 },
  },
  [WeaponType.Axe]: {
    type: WeaponType.Axe,
    damage: 42,
    attackSpeed: 0.8,
    range: 2.5,
    angle: Math.PI / 3,
    staminaCost: 12,
    knockback: 4.0,
    staggerPower: 15,
    comboCount: 3,
    skills: ['Execute', 'Cleave', 'Throw'],
    hitboxShape: 'box',
    hitboxSize: { x: 1.2, y: 0.8, z: 2.2 },
  },
  [WeaponType.Spear]: {
    type: WeaponType.Spear,
    damage: 22,
    attackSpeed: 1.0,
    range: 4.0,
    angle: Math.PI / 4,
    staminaCost: 6,
    knockback: 1.5,
    staggerPower: 6,
    comboCount: 4,
    skills: ['Impale', 'Sweep', 'Vault'],
    hitboxShape: 'capsule',
    hitboxSize: { radius: 0.2, length: 3.8 },
  },
  [WeaponType.Bow]: {
    type: WeaponType.Bow,
    damage: 18,
    attackSpeed: 0.9,
    range: 35.0,
    angle: Math.PI / 12,
    staminaCost: 5,
    knockback: 1.0,
    staggerPower: 4,
    comboCount: 1,
    skills: ['RapidFire', 'PiercingShot', 'ExplosiveArrow'],
    hitboxShape: 'ray',
    hitboxSize: {},
    projectileSpeed: 50,
    projectileGravity: 0.02,
  },
  [WeaponType.Staff]: {
    type: WeaponType.Staff,
    damage: 15,
    attackSpeed: 0.7,
    range: 3.0,
    angle: Math.PI / 2,
    staminaCost: 6,
    knockback: 1.0,
    staggerPower: 5,
    comboCount: 3,
    skills: ['Fireball', 'IceShard', 'LightningChain', 'Heal'],
    hitboxShape: 'sphere',
    hitboxSize: { radius: 2.5 },
    elementalDamage: 'fire',
  },
  [WeaponType.Daggers]: {
    type: WeaponType.Daggers,
    damage: 14,
    attackSpeed: 1.8,
    range: 2.0,
    angle: Math.PI / 2,
    staminaCost: 5,
    knockback: 0.5,
    staggerPower: 3,
    comboCount: 6,
    skills: ['Flurry', 'Backstab', 'SmokeBomb'],
    hitboxShape: 'capsule',
    hitboxSize: { radius: 0.2, length: 1.8 },
  },
  [WeaponType.Hammer]: {
    type: WeaponType.Hammer,
    damage: 55,
    attackSpeed: 0.55,
    range: 2.2,
    angle: Math.PI / 2.5,
    staminaCost: 18,
    knockback: 8.0,
    staggerPower: 25,
    comboCount: 2,
    skills: ['GroundSlam', 'SeismicWave', 'Stun'],
    hitboxShape: 'sphere',
    hitboxSize: { radius: 1.8 },
  },
  [WeaponType.Gunlance]: {
    type: WeaponType.Gunlance,
    damage: 35,
    attackSpeed: 0.65,
    range: 3.5,
    angle: Math.PI / 3,
    staminaCost: 10,
    knockback: 3.0,
    staggerPower: 12,
    comboCount: 3,
    skills: ['WyvernFire', 'ChargedShell', 'Guard'],
    hitboxShape: 'cone',
    hitboxSize: { angle: Math.PI / 4, length: 3.2 },
    shellDamage: 45,
  },
} as const;

// ============================================================================
// SKILL CONFIG
// ============================================================================

export const SKILL_CONFIG = {
  globalCooldown: 0.3,
  categories: {
    weapon: { maxEquipped: 4, swapCooldown: 1.0 },
    utility: { maxEquipped: 2, swapCooldown: 0.5 },
    ultimate: { maxEquipped: 1, swapCooldown: 5.0 },
  },
} as const;

// ============================================================================
// BUILDING CONFIG
// ============================================================================

export const BUILDING_CONFIG = {
  gridSize: 2.0,
  snapThreshold: 0.5,
  maxBuildDistance: 8.0,
  buildHeightLimit: 64,
  stabilityRequired: true,
  decayEnabled: true,
  decayTimeDays: 7,
  repairCostMultiplier: 0.3,
} as const;

// ============================================================================
// ITEM CONFIG
// ============================================================================

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  equipmentSlot?: EquipmentSlot;
  maxStack: number;
  weight: number;
  value: number;
  icon: string;
  modelPath?: string;
  durability?: number;
  weaponType?: WeaponType;
  armorRating?: number;
  effects?: ItemEffect[];
  craftingRecipe?: CraftingRecipe;
}

export interface ItemEffect {
  type: 'heal' | 'stamina' | 'fury' | 'buff' | 'stat';
  value: number;
  duration?: number;
  stat?: string;
}

export interface CraftingRecipe {
  ingredients: { itemId: string; quantity: number }[];
  stationType?: string;
  craftTime: number;
  experienceReward: number;
}

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  // Resources
  wood: {
    id: 'wood',
    name: 'Madeira Espiritual',
    description: 'Madeira imbuída com energia da planície',
    type: ItemType.Resource,
    maxStack: 999,
    weight: 0.5,
    value: 2,
    icon: '🪵',
  },
  stone: {
    id: 'stone',
    name: 'Pedra Rúnica',
    description: 'Pedra com gravuras antigas',
    type: ItemType.Resource,
    maxStack: 999,
    weight: 1.0,
    value: 3,
    icon: '🪨',
  },
  crystal: {
    id: 'crystal',
    name: 'Cristal de Mana',
    description: 'Fonte pura de energia mágica',
    type: ItemType.Resource,
    maxStack: 999,
    weight: 0.3,
    value: 50,
    icon: '💎',
  },
  essence: {
    id: 'essence',
    name: 'Essência de Quimera',
    description: 'Extraída de quimeras derrotadas',
    type: ItemType.Resource,
    maxStack: 99,
    weight: 0.1,
    value: 200,
    icon: '✨',
  },

  // Weapons
  wooden_sword: {
    id: 'wooden_sword',
    name: 'Espada de Treino',
    description: 'Espada básica de madeira',
    type: ItemType.Weapon,
    equipmentSlot: EquipmentSlot.WeaponMain,
    maxStack: 1,
    weight: 2.0,
    value: 10,
    icon: '⚔️',
    weaponType: WeaponType.Sword,
    durability: 50,
  },
  iron_sword: {
    id: 'iron_sword',
    name: 'Espada de Ferro',
    description: 'Espada forjada com ferro rúnico',
    type: ItemType.Weapon,
    equipmentSlot: EquipmentSlot.WeaponMain,
    maxStack: 1,
    weight: 3.5,
    value: 150,
    icon: '⚔️',
    weaponType: WeaponType.Sword,
    durability: 200,
  },

  // Consumables
  health_potion: {
    id: 'health_potion',
    name: 'Poção de Vida',
    description: 'Restaura 50 de vida instantaneamente',
    type: ItemType.Consumable,
    maxStack: 30,
    weight: 0.2,
    value: 25,
    icon: '🧪',
    effects: [{ type: 'heal', value: 50 }],
  },
  stamina_potion: {
    id: 'stamina_potion',
    name: 'Poção de Vigor',
    description: 'Restaura 40 de stamina instantaneamente',
    type: ItemType.Consumable,
    maxStack: 30,
    weight: 0.2,
    value: 25,
    icon: '🧪',
    effects: [{ type: 'stamina', value: 40 }],
  },

  // Chimera parts
  wolf_fang: {
    id: 'wolf_fang',
    name: 'Presa de Lobo Espiritual',
    description: 'Concede habilidade de mordida sangrenta',
    type: ItemType.ChimeraPart,
    maxStack: 10,
    weight: 0.1,
    value: 100,
    icon: '🦷',
  },
  eagle_wing: {
    id: 'eagle_wing',
    name: 'Asa de Águia Celestial',
    description: 'Permite planar por curtas distâncias',
    type: ItemType.ChimeraPart,
    maxStack: 10,
    weight: 0.3,
    value: 150,
    icon: '🪽',
  },
  scorpion_tail: {
    id: 'scorpion_tail',
    name: 'Cauda de Escorpião Venenoso',
    description: 'Ataques aplicam veneno',
    type: ItemType.ChimeraPart,
    maxStack: 10,
    weight: 0.5,
    value: 200,
    icon: '🦂',
  },
};

// ============================================================================
// BIOME CONFIG
// ============================================================================

export interface BiomeConfig {
  type: BiomeType;
  name: string;
  description: string;
  // Terrain
  baseHeight: number;
  heightVariation: number;
  noiseScale: number;
  // Colors (for fog/sky tint)
  fogColor: { r: number; g: number; b: number };
  fogDensity: number;
  skyTint: { r: number; g: number; b: number };
  // Materials
  terrainMaterial: string; // asset ID
  foliageDensity: number;
  // Spawn
  creatureSpawnWeights: Record<string, number>;
  resourceNodes: string[];
  // Ambient
  ambientSound: string;
  musicTrack: string;
}

export const BIOME_CONFIGS: Record<BiomeType, BiomeConfig> = {
  [BiomeType.SpiritPlains]: {
    type: BiomeType.SpiritPlains,
    name: 'Planícies Espirituais',
    description: 'Campos ondulados banhados por energia mística',
    baseHeight: 32,
    heightVariation: 12,
    noiseScale: 0.004,
    fogColor: { r: 0.2, g: 0.4, b: 0.35 },
    fogDensity: 0.002,
    skyTint: { r: 0.5, g: 0.7, b: 0.6 },
    terrainMaterial: 'grass_dirt_blend',
    foliageDensity: 0.8,
    creatureSpawnWeights: {
      spirit_deer: 1.0,
      spirit_wolf: 0.6,
      spirit_hare: 1.5,
      crystal_boar: 0.3,
    },
    resourceNodes: ['wood', 'stone', 'crystal'],
    ambientSound: 'ambient_plains',
    musicTrack: 'music_plains',
  },
  [BiomeType.FloatingMountains]: {
    type: BiomeType.FloatingMountains,
    name: 'Montanhas Flutuantes',
    description: 'Ilhas suspensas nas correntes de ar etéreo',
    baseHeight: 80,
    heightVariation: 60,
    noiseScale: 0.008,
    fogColor: { r: 0.4, g: 0.5, b: 0.7 },
    fogDensity: 0.0015,
    skyTint: { r: 0.6, g: 0.7, b: 0.9 },
    terrainMaterial: 'rock_moss_blend',
    foliageDensity: 0.4,
    creatureSpawnWeights: {
      sky_whale: 0.1,
      wind_drake: 0.4,
      cloud_goat: 0.8,
      storm_eagle: 0.3,
    },
    resourceNodes: ['stone', 'crystal', 'essence'],
    ambientSound: 'ambient_mountains',
    musicTrack: 'music_mountains',
  },
  [BiomeType.AshDesert]: {
    type: BiomeType.AshDesert,
    name: 'Deserto de Cinzas',
    description: 'Dunas escuras sob céu vermelho, calor intenso',
    baseHeight: 20,
    heightVariation: 15,
    noiseScale: 0.003,
    fogColor: { r: 0.3, g: 0.15, b: 0.1 },
    fogDensity: 0.003,
    skyTint: { r: 0.8, g: 0.3, b: 0.2 },
    terrainMaterial: 'ash_basalt_blend',
    foliageDensity: 0.1,
    creatureSpawnWeights: {
      ash_lizard: 1.0,
      fire_scorpion: 0.7,
      magma_worm: 0.2,
      ember_fox: 0.5,
    },
    resourceNodes: ['stone', 'crystal', 'essence'],
    ambientSound: 'ambient_desert',
    musicTrack: 'music_desert',
  },
  [BiomeType.ToxicSwamp]: {
    type: BiomeType.ToxicSwamp,
    name: 'Pântano Tóxico',
    description: 'Águas putrefatas, névoa venenosa, raízes retorcidas',
    baseHeight: 10,
    heightVariation: 8,
    noiseScale: 0.006,
    fogColor: { r: 0.15, g: 0.3, b: 0.15 },
    fogDensity: 0.005,
    skyTint: { r: 0.3, g: 0.4, b: 0.35 },
    terrainMaterial: 'mud_root_blend',
    foliageDensity: 1.0,
    creatureSpawnWeights: {
      bog_stalker: 0.8,
      poison_frog: 1.2,
      rot_wyrm: 0.2,
      moss_turtle: 0.6,
    },
    resourceNodes: ['wood', 'essence'],
    ambientSound: 'ambient_swamp',
    musicTrack: 'music_swamp',
  },
  [BiomeType.CoastalOcean]: {
    type: BiomeType.CoastalOcean,
    name: 'Costa e Oceanos',
    description: 'Praias de areia branca, recifes de coral, abismos misteriosos',
    baseHeight: 0,
    heightVariation: 40,
    noiseScale: 0.002,
    fogColor: { r: 0.2, g: 0.4, b: 0.6 },
    fogDensity: 0.001,
    skyTint: { r: 0.4, g: 0.6, b: 0.8 },
    terrainMaterial: 'sand_coral_blend',
    foliageDensity: 0.5,
    creatureSpawnWeights: {
      reef_fish: 2.0,
      tide_crab: 1.0,
      deep_serpent: 0.1,
      coral_golem: 0.3,
    },
    resourceNodes: ['wood', 'stone', 'crystal'],
    ambientSound: 'ambient_ocean',
    musicTrack: 'music_ocean',
  },
};

// ============================================================================
// GRAPHICS PRESETS
// ============================================================================

export const GRAPHICS_PRESETS: Record<GraphicsPreset, Partial<GraphicsSettings>> = {
  [GraphicsPreset.Low]: {
    textureQuality: TextureQuality.Low,
    anisotropicFiltering: 1,
    shadowQuality: ShadowQuality.Off,
    shadowDistance: 15,
    shadowCascades: 1,
    bloom: false,
    motionBlur: false,
    colorGrading: false,
    renderDistance: 80,
    lodBias: 2.0,
    foliageDensity: 0.3,
    particleDensity: 0.3,
    resolutionScale: 0.7,
    dynamicResolution: true,
    targetFPS: 30,
    preset: GraphicsPreset.Low,
  },
  [GraphicsPreset.Medium]: {
    textureQuality: TextureQuality.Medium,
    anisotropicFiltering: 4,
    shadowQuality: ShadowQuality.Low,
    shadowDistance: 35,
    shadowCascades: 2,
    bloom: true,
    bloomIntensity: 0.5,
    motionBlur: false,
    colorGrading: true,
    renderDistance: 150,
    lodBias: 1.5,
    foliageDensity: 0.6,
    particleDensity: 0.6,
    resolutionScale: 0.85,
    dynamicResolution: true,
    targetFPS: 60,
    preset: GraphicsPreset.Medium,
  },
  [GraphicsPreset.High]: {
    textureQuality: TextureQuality.High,
    anisotropicFiltering: 8,
    shadowQuality: ShadowQuality.Medium,
    shadowDistance: 60,
    shadowCascades: 3,
    bloom: true,
    bloomIntensity: 0.8,
    motionBlur: true,
    motionBlurIntensity: 0.5,
    colorGrading: true,
    renderDistance: 250,
    lodBias: 1.0,
    foliageDensity: 0.85,
    particleDensity: 0.85,
    resolutionScale: 1.0,
    dynamicResolution: false,
    targetFPS: 60,
    preset: GraphicsPreset.High,
  },
  [GraphicsPreset.Ultra]: {
    textureQuality: TextureQuality.Ultra,
    anisotropicFiltering: 16,
    shadowQuality: ShadowQuality.Ultra,
    shadowDistance: 120,
    shadowCascades: 4,
    bloom: true,
    bloomIntensity: 1.0,
    toneMapping: 'aces',
    motionBlur: true,
    motionBlurIntensity: 0.8,
    colorGrading: true,
    renderDistance: 400,
    lodBias: 0.5,
    foliageDensity: 1.0,
    particleDensity: 1.0,
    resolutionScale: 1.0,
    dynamicResolution: false,
    targetFPS: 120,
    preset: GraphicsPreset.Ultra,
  },
  [GraphicsPreset.Custom]: {
    preset: GraphicsPreset.Custom,
  },
};

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  resolution: { x: 1920, y: 1080 },
  screenMode: ScreenMode.Borderless,
  vSync: true,
  fpsLimit: 0,
  textureQuality: TextureQuality.High,
  anisotropicFiltering: 8,
  shadowQuality: ShadowQuality.Medium,
  shadowDistance: 60,
  shadowCascades: 3,
  bloom: true,
  bloomIntensity: 0.8,
  toneMapping: 'aces',
  motionBlur: true,
  motionBlurIntensity: 0.5,
  colorGrading: true,
  renderDistance: 250,
  lodBias: 1.0,
  foliageDensity: 0.85,
  particleDensity: 0.85,
  resolutionScale: 1.0,
  dynamicResolution: false,
  targetFPS: 60,
  preset: GraphicsPreset.High,
};