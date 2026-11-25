/**
 * Core type definitions for ChimeraLand 3D
 * Fundamental math, entity, and game types
 */

// ============================================================================
// MATH TYPES
// ============================================================================

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Mat4 {
  elements: Float32Array; // 16 elements, column-major
}

export interface Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

export interface RaycastHit {
  point: Vec3;
  normal: Vec3;
  distance: number;
  entityId: string | null;
  faceIndex: number;
}

// ============================================================================
// ECS TYPES
// ============================================================================

export type EntityId = string & { readonly __brand: unique symbol };

export function createEntityId(): EntityId {
  return `ent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` as EntityId;
}

export interface Component {
  readonly entityId: EntityId;
}

export type ComponentClass<T extends Component> = new (entityId: EntityId, ...args: unknown[]) => T;

export interface System {
  readonly priority: number;
  update(dt: number): void;
  onEntityAdded?(entityId: EntityId): void;
  onEntityRemoved?(entityId: EntityId): void;
}

export interface Query {
  all?: ComponentClass<Component>[];
  any?: ComponentClass<Component>[];
  none?: ComponentClass<Component>[];
}

// ============================================================================
// GAME STATE TYPES
// ============================================================================

export enum GameState {
  Boot = 'Boot',
  MainMenu = 'MainMenu',
  NewGameSetup = 'NewGameSetup',
  Loading = 'Loading',
  Gameplay = 'Gameplay',
  PauseMenu = 'PauseMenu',
}

export enum BiomeType {
  SpiritPlains = 'SpiritPlains',
  FloatingMountains = 'FloatingMountains',
  AshDesert = 'AshDesert',
  ToxicSwamp = 'ToxicSwamp',
  CoastalOcean = 'CoastalOcean',
}

export enum EquipmentSlot {
  WeaponMain = 'WeaponMain',
  WeaponOffhand = 'WeaponOffhand',
  WeaponRanged = 'WeaponRanged',
  Head = 'Head',
  Chest = 'Chest',
  Legs = 'Legs',
  Hands = 'Hands',
  Feet = 'Feet',
  Accessory1 = 'Accessory1',
  Accessory2 = 'Accessory2',
}

export enum ItemType {
  Resource = 'Resource',
  Weapon = 'Weapon',
  Armor = 'Armor',
  Consumable = 'Consumable',
  ChimeraCore = 'ChimeraCore',
  ChimeraPart = 'ChimeraPart',
  BuildingPiece = 'BuildingPiece',
  Tool = 'Tool',
}

export enum WeaponType {
  Sword = 'Sword',
  Axe = 'Axe',
  Spear = 'Spear',
  Bow = 'Bow',
  Staff = 'Staff',
  Daggers = 'Daggers',
  Hammer = 'Hammer',
  Gunlance = 'Gunlance',
}

export enum DamageType {
  Physical = 'Physical',
  Fire = 'Fire',
  Ice = 'Ice',
  Lightning = 'Lightning',
  Poison = 'Poison',
  Spirit = 'Spirit',
}

export enum CreatureState {
  Idle = 'Idle',
  Wander = 'Wander',
  Chase = 'Chase',
  Attack = 'Attack',
  Flee = 'Flee',
  Dead = 'Dead',
  Tamed = 'Tamed',
}

export enum LocomotionState {
  Idle = 'Idle',
  Walk = 'Walk',
  Run = 'Run',
  Sprint = 'Sprint',
  Jump = 'Jump',
  Fall = 'Fall',
  Swim = 'Swim',
  Fly = 'Fly',
  Dash = 'Dash',
  Climb = 'Climb',
  Stagger = 'Stagger',
  Knockout = 'Knockout',
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface InputState {
  move: Vec2;
  look: Vec2;
  actions: Set<string>;
  actionPressed: Set<string>;
  actionReleased: Set<string>;
  scroll: number;
}

export enum ActionName {
  MoveForward = 'MoveForward',
  MoveBackward = 'MoveBackward',
  MoveLeft = 'MoveLeft',
  MoveRight = 'MoveRight',
  Jump = 'Jump',
  Sprint = 'Sprint',
  Dodge = 'Dodge',
  AttackPrimary = 'AttackPrimary',
  AttackSecondary = 'AttackSecondary',
  Block = 'Block',
  Interact = 'Interact',
  WeaponSwap1 = 'WeaponSwap1',
  WeaponSwap2 = 'WeaponSwap2',
  WeaponSwap3 = 'WeaponSwap3',
  Skill1 = 'Skill1',
  Skill2 = 'Skill2',
  Skill3 = 'Skill3',
  Skill4 = 'Skill4',
  CameraReset = 'CameraReset',
  Pause = 'Pause',
  PhotoMode = 'PhotoMode',
}

export type DamageElement = 'physical' | 'fire' | 'ice' | 'lightning' | 'poison' | 'spirit';

// ============================================================================
// WEAPON CONFIG TYPES
// ============================================================================

export interface WeaponTypeConfig {
  type: WeaponType;
  damage: number;
  attackSpeed: number; // attacks per second
  range: number;
  angle: number;
  staminaCost: number;
  knockback: number;
  staggerPower: number;
  comboCount: number;
  skills: string[];
  hitboxShape: 'capsule' | 'box' | 'sphere' | 'ray' | 'cone';
  hitboxSize: Record<string, number>;
  projectileSpeed?: number;
  projectileGravity?: number;
  elementalDamage?: DamageElement;
  shellDamage?: number;
}

// ============================================================================
// ASSET TYPES
// ============================================================================

export interface AssetManifestEntry {
  id: string;
  sourceLibrary: string;
  license: string;
  downloadUrl?: string;
  localPath: string;
  targetRole: AssetRole;
  scaleFactor: number;
  upAxisFix: 'Y_UP' | 'Z_UP' | 'AUTO';
  materialMapping: Record<string, string>;
  lods?: string[];
  rigMapping?: Record<string, string>; // socketId -> boneName
  socketBinding?: {
    socketId: string;
    offset: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    scale: { x: number; y: number; z: number };
  };
}

export enum AssetRole {
  BiomeTerrain = 'BiomeTerrain',
  BiomeFoliage = 'BiomeFoliage',
  CreatureBase = 'CreatureBase',
  CreaturePart = 'CreaturePart',
  Weapon = 'Weapon',
  BuildingPiece = 'BuildingPiece',
  Prop = 'Prop',
  VFX = 'VFX',
  UI = 'UI',
  Audio = 'Audio',
}

export interface PBRMaterialData {
  albedoMap?: string;
  normalMap?: string;
  roughnessMap?: string;
  metalnessMap?: string;
  aoMap?: string;
  heightMap?: string;
  emissiveMap?: string;
  albedoColor: Vec3;
  emissiveColor: Vec3;
  emissiveIntensity: number;
  roughness: number;
  metalness: number;
  alphaMode: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff: number;
  doubleSided: boolean;
}

// ============================================================================
// SAVE TYPES
// ============================================================================

export interface SaveMetadata {
  saveId: string;
  slotName: string;
  timestamp: number;
  playTimeSeconds: number;
  worldSeed: string;
  engineVersion: string;
  currentBiome: BiomeType;
  playerName: string;
}

export interface SavePlayerState {
  position: Vec3;
  rotation: Quat;
  velocity: Vec3;
  locomotionState: LocomotionState;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  fury: number;
  oxygen: number;
  equippedWeapons: (string | null)[];
  activeWeaponIndex: number;
  skillCooldowns: Record<string, number>;
  skillLevels: Record<string, number>;
  inventory: SaveInventoryItem[];
  activeBuffs: SaveBuff[];
}

export interface SaveInventoryItem {
  itemId: string;
  itemType: ItemType;
  quantity: number;
  durability?: number;
  maxDurability?: number;
  enchantments?: string[];
  customData?: Record<string, unknown>;
}

export interface SaveBuff {
  id: string;
  remainingTime: number;
  stacks: number;
  sourceEntityId?: string;
}

export interface SaveChimera {
  id: string;
  baseSpeciesId: string;
  name: string;
  level: number;
  experience: number;
  hp: number;
  maxHp: number;
  mutations: SaveMutation[];
  state: 'inventory' | 'pet' | 'mount';
  socketBindings: Record<string, string>; // socketId -> partId
}

export interface SaveMutation {
  partId: string;
  socketId: string;
  sourceCreatureId: string;
  attributeBonuses: Record<string, number>;
  inheritedSkillId?: string;
}

export interface SaveBuildingPiece {
  pieceId: string;
  type: string;
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  socketConnections: Record<string, string>;
  durability: number;
  stationState?: Record<string, unknown>;
}

export interface SaveWorldState {
  destroyedResourceNodes: Record<string, number>; // nodeId -> respawnTimestamp
  creatureStates: Record<string, SaveCreatureWorldState>;
  modifiedChunks: string[]; // chunk keys that have been modified
}

export interface SaveCreatureWorldState {
  entityId: string;
  speciesId: string;
  position: Vec3;
  rotation: Quat;
  hp: number;
  state: CreatureState;
  isBoss: boolean;
  isUnique: boolean;
}

export interface SaveGameData {
  metadata: SaveMetadata;
  player: SavePlayerState;
  chimeras: SaveChimera[];
  buildings: SaveBuildingPiece[];
  world: SaveWorldState;
}

// ============================================================================
// GRAPHICS SETTINGS TYPES
// ============================================================================

export enum GraphicsPreset {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
  Ultra = 'Ultra',
  Custom = 'Custom',
}

export enum ShadowQuality {
  Off = 'Off',
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
  Ultra = 'Ultra',
}

export enum TextureQuality {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
  Ultra = 'Ultra',
}

export enum ScreenMode {
  Fullscreen = 'Fullscreen',
  Borderless = 'Borderless',
  Windowed = 'Windowed',
}

export interface GraphicsSettings {
  // Display
  resolution: Vec2;
  screenMode: ScreenMode;
  vSync: boolean;
  fpsLimit: number; // 0 = unlimited

  // Quality
  textureQuality: TextureQuality;
  anisotropicFiltering: number;
  shadowQuality: ShadowQuality;
  shadowDistance: number;
  shadowCascades: number;

  // Post-processing
  bloom: boolean;
  bloomIntensity: number;
  toneMapping: 'none' | 'aces' | 'reinhard' | 'cineon';
  motionBlur: boolean;
  motionBlurIntensity: number;
  colorGrading: boolean;

  // World
  renderDistance: number;
  lodBias: number;
  foliageDensity: number;
  particleDensity: number;
  resolutionScale: number; // 0.5 - 1.0
  dynamicResolution: boolean;
  targetFPS: number;

  // Preset
  preset: GraphicsPreset;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type DeepReadonly<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function degToRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function radToDeg(rad: number): number {
  return rad * (180 / Math.PI);
}