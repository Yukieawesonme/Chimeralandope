/**
 * Creature Types - 3D Creature System
 * Defines creature data, sockets, mutations, and AI
 */

import { EntityId, Vec3, Quat, CreatureState, BiomeType } from '@core/Types.js';

// ============================================================================
// CREATURE DEFINITIONS
// ============================================================================

export interface CreatureDefinition {
  id: string;
  name: string;
  description: string;

  // Visual
  modelPath: string;
  scale: number;
  variations: CreatureVariation[];

  // Stats (base at level 1)
  baseHp: number;
  baseDamage: number;
  baseArmor: number;
  baseSpeed: number;
  baseStamina: number;

  // Growth per level
  hpPerLevel: number;
  damagePerLevel: number;
  armorPerLevel: number;
  speedPerLevel: number;

  // AI
  detectionRange: number;
  attackRange: number;
  loseInterestRange: number;
  wanderRadius: number;
  wanderInterval: { min: number; max: number };
  aggroChance: number;

  // Combat
  staggerThreshold: number;
  knockbackResistance: number;
  poiseRegenRate: number;
  attackPatterns: AttackPattern[];

  // Taming
  baseTameChance: number;
  preferredFood: string[];
  tameFoodBonus: number;
  maxTameLevelDiff: number;

  // Mutation
  mutationSlots: MutationSlot[];

  // Spawn
  biomeWeights: Record<BiomeType, number>;
  spawnGroupSize: { min: number; max: number };
  isBoss: boolean;
  isUnique: boolean;

  // Drops
  dropTable: DropEntry[];

  // Audio
  soundIdle: string;
  soundAlert: string;
  soundAttack: string;
  soundHit: string;
  soundDeath: string;
}

export interface CreatureVariation {
  id: string;
  name: string;
  modelPath?: string;
  textureTint?: { r: number; g: number; b: number };
  statMultipliers: Partial<CreatureStats>;
  unlockCondition?: string;
}

export interface CreatureStats {
  hp: number;
  maxHp: number;
  damage: number;
  armor: number;
  speed: number;
  stamina: number;
  maxStamina: number;
}

export interface AttackPattern {
  id: string;
  name: string;
  weight: number;
  minRange: number;
  maxRange: number;
  cooldown: number;
  animation: string;
  hitboxes: HitboxData[];
  effects: AttackEffect[];
}

export interface HitboxData {
  shape: 'capsule' | 'box' | 'sphere' | 'cone';
  offset: Vec3;
  rotation: Quat;
  size: Record<string, number>; // radius/length for capsule, x/y/z for box, radius for sphere, angle/length for cone
  damageMultiplier: number;
  staggerPower: number;
  knockback: number;
  element?: DamageElement;
}

export interface AttackEffect {
  type: 'bleed' | 'poison' | 'burn' | 'stun' | 'slow' | 'fear';
  chance: number;
  duration: number;
  power: number;
}

export type DamageElement = 'physical' | 'fire' | 'ice' | 'lightning' | 'poison' | 'spirit';

// ============================================================================
// MUTATION SYSTEM
// ============================================================================

export interface MutationSlot {
  id: string;
  name: string;
  socketName: string; // Matches model socket/bone
  allowedParts: string[]; // Creature part IDs that can go here
  maxParts: number;
  statBonuses: Record<string, number>; // Base bonuses for using this slot
}

export interface CreaturePart {
  id: string;
  name: string;
  description: string;

  // Source
  sourceCreatureId: string; // Which creature this part comes from
  sourceSlot: string; // Which mutation slot on source

  // Visual
  modelPath: string;
  scale: number;
  socketOffset: Vec3;
  socketRotation: Quat;
  textureTint?: { r: number; g: number; b: number };

  // Stats
  statBonuses: Record<string, number>;

  // Skills granted
  grantedSkillId?: string;
  grantedAttackPatternId?: string;

  // Requirements
  requiredLevel: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

  // Element affinity
  element: DamageElement;
}

export interface MutationInstance {
  partId: string;
  slotId: string;
  socketName: string;
  level: number;
  experience: number;
  statBonuses: Record<string, number>;
  activeSkillId?: string;
}

// ============================================================================
// CREATURE INSTANCE (Runtime)
// ============================================================================

export interface CreatureInstance {
  entityId: EntityId;
  definitionId: string;
  variationId?: string;

  // Identity
  name: string;
  isTamed: boolean;
  ownerId?: EntityId; // Player who owns this
  isPartyMember: boolean;
  isMount: boolean;

  // Progression
  level: number;
  experience: number;

  // Stats (calculated)
  stats: CreatureStats;

  // State
  state: CreatureState;
  currentTarget?: EntityId;
  homePosition: Vec3;
  wanderTarget?: Vec3;

  // Combat
  attackCooldowns: Record<string, number>;
  poise: number;
  maxPoise: number;
  staggerTimer: number;

  // Mutations
  mutations: MutationInstance[];
  activeMutations: Map<string, MutationInstance>; // slotId -> mutation

  // AI
  lastSeenPlayer: number;
  alertLevel: number; // 0-1
  fearLevel: number; // 0-1

  // Taming
  tameProgress: number; // 0-1
  trustLevel: number; // 0-100

  // Visual
  modelScale: number;
  textureTints: Map<string, { r: number; g: number; b: number }>;

  // Timers
  wanderTimer: number;
  idleTimer: number;
  roarTimer: number;
}

// ============================================================================
// CREATURE COMPONENTS (ECS)
// ============================================================================

export class CreatureComponent {
  entityId: EntityId;

  definitionId: string;
  instance: CreatureInstance;

  constructor(entityId: EntityId, definitionId: string, instance: CreatureInstance) {
    this.entityId = entityId;
    this.definitionId = definitionId;
    this.instance = instance;
  }
}

export class CreatureAIComponent {
  entityId: EntityId;

  // Behavior tree state
  currentBehavior: 'idle' | 'wander' | 'chase' | 'attack' | 'flee' | 'follow' | 'graze' | 'sleep';
  behaviorTimer: number;

  // Targets
  targetEntity?: EntityId;
  targetPosition?: Vec3;
  lastKnownTargetPos?: Vec3;

  // Memory
  knownEntities: Map<EntityId, { position: Vec3; timestamp: number; threat: number }>;
  memoryDuration: number;

  // Navigation
  path: Vec3[];
  pathIndex: number;
  stuckTimer: number;
  lastPosition: Vec3;

  // Social
  herdMembers: EntityId[];
  herdLeader?: EntityId;
  separationRadius: number;
  alignmentWeight: number;
  cohesionWeight: number;

  constructor(entityId: EntityId) {
    this.entityId = entityId;
    this.currentBehavior = 'idle';
    this.behaviorTimer = 0;
    this.memoryDuration = 30; // seconds
    this.knownEntities = new Map();
    this.path = [];
    this.pathIndex = 0;
    this.stuckTimer = 0;
    this.herdMembers = [];
    this.separationRadius = 3;
    this.alignmentWeight = 0.5;
    this.cohesionWeight = 0.5;
  }
}

export class MutationComponent {
  entityId: EntityId;

  mutations: MutationInstance[] = [];
  activeMutations: Map<string, MutationInstance> = new Map(); // slotId -> mutation
  availableSlots: MutationSlot[] = [];

  // Visual attachment points
  attachedParts: Map<string, { // socketName -> part data
    partId: string;
    modelEntityId?: EntityId;
    offset: Vec3;
    rotation: Quat;
  }> = new Map();

  // Stat cache (recalculated on mutation change)
  cachedStatBonuses: Record<string, number> = {};
  cachedGrantedSkills: string[] = [];
  cachedAttackPatterns: string[] = [];
  cacheDirty = true;

  constructor(entityId: EntityId) {
    this.entityId = entityId;
  }
}

// ============================================================================
// DROP SYSTEM
// ============================================================================

export interface DropEntry {
  itemId: string;
  minQuantity: number;
  maxQuantity: number;
  chance: number; // 0-1
  condition?: string; // e.g., "killed_by_player", "tamed"
  minLevel?: number;
}

export interface DroppedItem {
  entityId: EntityId;
  itemId: string;
  quantity: number;
  position: Vec3;
  velocity: Vec3;
  despawnTime: number; // timestamp
  ownerId?: EntityId; // For instanced drops
}

// ============================================================================
// SPAWN SYSTEM
// ============================================================================

export interface SpawnPoint {
  id: string;
  position: Vec3;
  biome: BiomeType;
  creatureWeights: Record<string, number>; // creatureDefId -> weight
  spawnRadius: number;
  maxPopulation: number;
  currentPopulation: number;
  respawnInterval: number; // seconds
  lastSpawnTime: number;
  conditions?: SpawnCondition[];
  isActive: boolean;
}

export interface SpawnCondition {
  type: 'time_of_day' | 'weather' | 'player_level' | 'quest' | 'population';
  params: Record<string, any>;
}

export interface SpawnGroup {
  id: string;
  center: Vec3;
  radius: number;
  creatureDefId: string;
  count: { min: number; max: number };
  formation: 'circle' | 'line' | 'cluster' | 'random';
  leaderLevelBonus: number;
  members: EntityId[];
}

// ============================================================================
// TAME SYSTEM
// ============================================================================

export interface TameAttempt {
  creatureEntityId: EntityId;
  playerEntityId: EntityId;
  foodItemId: string;
  timestamp: number;
  success: boolean;
  progressGain: number;
}

export interface TameResult {
  success: boolean;
  newTrustLevel: number;
  tameProgress: number;
  message: string;
  effects: string[]; // Visual/audio effects
}

// ============================================================================
// CREATURE DEFINITIONS REGISTRY
// ============================================================================

export const CREATURE_DEFINITIONS: Record<string, CreatureDefinition> = {
  // Spirit Plains
  spirit_deer: {
    id: 'spirit_deer',
    name: 'Cervo Espiritual',
    description: 'Cervo pacífico que brilha à noite. Foge ao primeiro sinal de perigo.',
    modelPath: 'creatures/spirit_deer.glb',
    scale: 1.0,
    variations: [
      { id: 'normal', name: 'Comum', statMultipliers: {} },
      { id: 'elder', name: 'Ancião', textureTint: { r: 1, g: 0.9, b: 0.7 }, statMultipliers: { hp: 1.5, damage: 1.2 } },
    ],
    baseHp: 80,
    baseDamage: 10,
    baseArmor: 2,
    baseSpeed: 6,
    baseStamina: 60,
    hpPerLevel: 8,
    damagePerLevel: 1,
    armorPerLevel: 0.2,
    speedPerLevel: 0.05,
    detectionRange: 25,
    attackRange: 2,
    loseInterestRange: 40,
    wanderRadius: 20,
    wanderInterval: { min: 5, max: 15 },
    aggroChance: 0.05,
    staggerThreshold: 0.25,
    knockbackResistance: 0.5,
    poiseRegenRate: 8,
    attackPatterns: [
      {
        id: 'kick',
        name: 'Coice',
        weight: 1,
        minRange: 1,
        maxRange: 2.5,
        cooldown: 3,
        animation: 'kick_back',
        hitboxes: [{
          shape: 'capsule',
          offset: { x: 0, y: 0.5, z: -1.2 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          size: { radius: 0.3, length: 1.5 },
          damageMultiplier: 1.2,
          staggerPower: 8,
          knockback: 3,
        }],
        effects: [],
      },
    ],
    baseTameChance: 0.3,
    preferredFood: ['spirit_apple', 'golden_carrot', 'crystal_hay'],
    tameFoodBonus: 0.25,
    maxTameLevelDiff: 5,
    mutationSlots: [
      { id: 'antlers', name: 'Chifres', socketName: 'Socket_Antlers', allowedParts: ['deer_antlers', 'moose_antlers'], maxParts: 1, statBonuses: { armor: 2 } },
      { id: 'hooves', name: 'Casco', socketName: 'Socket_Hooves', allowedParts: ['crystal_hooves', 'iron_hooves'], maxParts: 1, statBonuses: { damage: 3 } },
    ],
    biomeWeights: {
      SpiritPlains: 1.0,
      FloatingMountains: 0.2,
      AshDesert: 0,
      ToxicSwamp: 0,
      CoastalOcean: 0,
    },
    spawnGroupSize: { min: 2, max: 5 },
    isBoss: false,
    isUnique: false,
    dropTable: [
      { itemId: 'venison', minQuantity: 1, maxQuantity: 3, chance: 0.8 },
      { itemId: 'spirit_essence', minQuantity: 1, maxQuantity: 1, chance: 0.15 },
      { itemId: 'deer_antlers', minQuantity: 1, maxQuantity: 2, chance: 0.3, condition: 'killed_by_player' },
    ],
    soundIdle: 'deer_idle',
    soundAlert: 'deer_alert',
    soundAttack: 'deer_kick',
    soundHit: 'deer_hit',
    soundDeath: 'deer_death',
  },

  spirit_wolf: {
    id: 'spirit_wolf',
    name: 'Lobo Espiritual',
    description: 'Predador de matilha que caça em coordenação. Olhos brilham no escuro.',
    modelPath: 'creatures/spirit_wolf.glb',
    scale: 1.0,
    variations: [
      { id: 'normal', name: 'Comum', statMultipliers: {} },
      { id: 'alpha', name: 'Alfa', textureTint: { r: 1, g: 0.8, b: 0.6 }, statMultipliers: { hp: 1.3, damage: 1.5, armor: 1.2 } },
      { id: 'spectral', name: 'Espectral', textureTint: { r: 0.6, g: 0.8, b: 1 }, statMultipliers: { hp: 0.8, speed: 1.4, damage: 1.2 } },
    ],
    baseHp: 120,
    baseDamage: 22,
    baseArmor: 5,
    baseSpeed: 7,
    baseStamina: 80,
    hpPerLevel: 12,
    damagePerLevel: 2,
    armorPerLevel: 0.5,
    speedPerLevel: 0.08,
    detectionRange: 30,
    attackRange: 2.5,
    loseInterestRange: 50,
    wanderRadius: 25,
    wanderInterval: { min: 8, max: 20 },
    aggroChance: 0.4,
    staggerThreshold: 0.3,
    knockbackResistance: 1.0,
    poiseRegenRate: 10,
    attackPatterns: [
      {
        id: 'bite',
        name: 'Mordida',
        weight: 3,
        minRange: 0.5,
        maxRange: 2.5,
        cooldown: 1.5,
        animation: 'bite',
        hitboxes: [{
          shape: 'capsule',
          offset: { x: 0, y: 0.6, z: 1 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          size: { radius: 0.25, length: 1.8 },
          damageMultiplier: 1.0,
          staggerPower: 6,
          knockback: 2,
          element: 'physical',
        }],
        effects: [
          { type: 'bleed', chance: 0.25, duration: 5, power: 3 },
        ],
      },
      {
        id: 'pounce',
        name: 'Salto',
        weight: 1,
        minRange: 3,
        maxRange: 6,
        cooldown: 8,
        animation: 'pounce',
        hitboxes: [{
          shape: 'box',
          offset: { x: 0, y: 0.5, z: 1.5 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          size: { x: 1.5, y: 1, z: 2.5 },
          damageMultiplier: 1.8,
          staggerPower: 15,
          knockback: 5,
        }],
        effects: [
          { type: 'stun', chance: 0.4, duration: 1.5, power: 1 },
        ],
      },
    ],
    baseTameChance: 0.15,
    preferredFood: ['raw_meat', 'spirit_meat', 'wolf_bone'],
    tameFoodBonus: 0.3,
    maxTameLevelDiff: 8,
    mutationSlots: [
      { id: 'fangs', name: 'Presas', socketName: 'Socket_Fangs', allowedParts: ['wolf_fangs', 'saber_fangs', 'venom_fangs'], maxParts: 1, statBonuses: { damage: 5 } },
      { id: 'claws', name: 'Garras', socketName: 'Socket_Claws', allowedParts: ['wolf_claws', 'iron_claws', 'crystal_claws'], maxParts: 1, statBonuses: { damage: 3, armor: 1 } },
      { id: 'fur', name: 'Pelo', socketName: 'Socket_Fur', allowedParts: ['thick_fur', 'spirit_fur', 'fire_fur'], maxParts: 1, statBonuses: { armor: 4 } },
    ],
    biomeWeights: {
      SpiritPlains: 0.8,
      FloatingMountains: 0.3,
      AshDesert: 0.1,
      ToxicSwamp: 0.2,
      CoastalOcean: 0,
    },
    spawnGroupSize: { min: 3, max: 6 },
    isBoss: false,
    isUnique: false,
    dropTable: [
      { itemId: 'wolf_pelt', minQuantity: 1, maxQuantity: 2, chance: 0.7 },
      { itemId: 'wolf_fang', minQuantity: 1, maxQuantity: 3, chance: 0.4 },
      { itemId: 'spirit_essence', minQuantity: 1, maxQuantity: 1, chance: 0.2 },
    ],
    soundIdle: 'wolf_idle',
    soundAlert: 'wolf_growl',
    soundAttack: 'wolf_bite',
    soundHit: 'wolf_hit',
    soundDeath: 'wolf_death',
  },

  // Add more creatures here...
  crystal_boar: {
    id: 'crystal_boar',
    name: 'Javali de Cristal',
    description: 'Javali com cristais crescendo nas costas. Investida devastadora.',
    modelPath: 'creatures/crystal_boar.glb',
    scale: 1.1,
    variations: [
      { id: 'normal', name: 'Comum', statMultipliers: {} },
      { id: 'geode', name: 'Geode', textureTint: { r: 0.7, g: 0.9, b: 1 }, statMultipliers: { armor: 2.0, hp: 1.4 } },
    ],
    baseHp: 200,
    baseDamage: 30,
    baseArmor: 12,
    baseSpeed: 5,
    baseStamina: 100,
    hpPerLevel: 20,
    damagePerLevel: 3,
    armorPerLevel: 1.5,
    speedPerLevel: 0.03,
    detectionRange: 20,
    attackRange: 3,
    loseInterestRange: 35,
    wanderRadius: 15,
    wanderInterval: { min: 10, max: 30 },
    aggroChance: 0.6,
    staggerThreshold: 0.4,
    knockbackResistance: 2.5,
    poiseRegenRate: 15,
    attackPatterns: [
      {
        id: 'charge',
        name: 'Investida',
        weight: 2,
        minRange: 4,
        maxRange: 12,
        cooldown: 6,
        animation: 'charge',
        hitboxes: [{
          shape: 'capsule',
          offset: { x: 0, y: 0.8, z: 1.5 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          size: { radius: 0.6, length: 3 },
          damageMultiplier: 2.0,
          staggerPower: 25,
          knockback: 10,
          element: 'physical',
        }],
        effects: [
          { type: 'stun', chance: 0.6, duration: 2, power: 1 },
        ],
      },
      {
        id: 'crystal_burst',
        name: 'Explosão de Cristal',
        weight: 1,
        minRange: 0,
        maxRange: 4,
        cooldown: 15,
        animation: 'crystal_burst',
        hitboxes: [{
          shape: 'sphere',
          offset: { x: 0, y: 1, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          size: { radius: 4 },
          damageMultiplier: 1.2,
          staggerPower: 12,
          knockback: 4,
          element: 'spirit',
        }],
        effects: [
          { type: 'slow', chance: 0.5, duration: 4, power: 0.5 },
        ],
      },
    ],
    baseTameChance: 0.1,
    preferredFood: ['crystal_corn', 'geode_apple', 'mineral_salt'],
    tameFoodBonus: 0.35,
    maxTameLevelDiff: 10,
    mutationSlots: [
      { id: 'crystals', name: 'Cristais', socketName: 'Socket_BackCrystals', allowedParts: ['boar_crystals', 'amethyst_crystals', 'quartz_crystals'], maxParts: 1, statBonuses: { armor: 8 } },
      { id: 'tusks', name: 'Presas', socketName: 'Socket_Tusks', allowedParts: ['boar_tusks', 'crystal_tusks', 'obsidian_tusks'], maxParts: 1, statBonuses: { damage: 8 } },
    ],
    biomeWeights: {
      SpiritPlains: 0.3,
      FloatingMountains: 0.1,
      AshDesert: 0,
      ToxicSwamp: 0,
      CoastalOcean: 0,
    },
    spawnGroupSize: { min: 1, max: 2 },
    isBoss: false,
    isUnique: false,
    dropTable: [
      { itemId: 'boar_meat', minQuantity: 2, maxQuantity: 4, chance: 0.9 },
      { itemId: 'crystal_shard', minQuantity: 1, maxQuantity: 5, chance: 0.5 },
      { itemId: 'boar_tusk', minQuantity: 1, maxQuantity: 2, chance: 0.4, condition: 'killed_by_player' },
    ],
    soundIdle: 'boar_idle',
    soundAlert: 'boar_snort',
    soundAttack: 'boar_charge',
    soundHit: 'boar_hit',
    soundDeath: 'boar_death',
  },
};