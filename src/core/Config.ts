// ChimeraLand - Global Configuration
// All game constants, tuning values, and settings

import { Vec3 } from './MathUtils';

export const GameConfig = {
    // Version
    VERSION: '0.1.0-prototype',
    BUILD_DATE: new Date().toISOString(),

    // Physics
    PHYSICS: {
        FIXED_TIMESTEP: 1 / 60,
        MAX_SUBSTEPS: 4,
        GRAVITY: new Vec3(0, -9.81, 0),
        GROUND_CHECK_DISTANCE: 0.1,
        SLOPE_LIMIT: 45 * Math.PI / 180,
        STEP_HEIGHT: 0.4,
        TERMINAL_VELOCITY: 50,
    },

    // Player
    PLAYER: {
        HEIGHT: 1.8,
        RADIUS: 0.4,
        MASS: 80,
        WALK_SPEED: 3.5,
        RUN_SPEED: 7,
        SPRINT_SPEED: 10,
        JUMP_FORCE: 8,
        DOUBLE_JUMP_FORCE: 6,
        DASH_DISTANCE: 4,
        DASH_DURATION: 0.2,
        DASH_IFRAMES: 0.15,
        DASH_COOLDOWN: 1.0,
        CLIMB_SPEED: 2.5,
        CLIMB_JUMP_FORCE: 7,
        GLIDE_SPEED: 12,
        GLIDE_FALL_SPEED: 2,
        GLIDE_TURN_SPEED: 3,
        SWIM_SPEED: 3,
        DIVE_SPEED: 4,
        OXYGEN_MAX: 30,
        OXYGEN_CONSUMPTION: 1, // per second
        STAMINA_MAX: 100,
        STAMINA_REGEN: 15,
        STAMINA_REGEN_DELAY: 1,
        HEALTH_MAX: 100,
        FURY_MAX: 100,
        FURY_GAIN_ON_DAMAGE: 5,
        FURY_GAIN_ON_DEAL: 3,
    },

    // Camera
    CAMERA: {
        DISTANCE: 4,
        MIN_DISTANCE: 1.5,
        MAX_DISTANCE: 8,
        HEIGHT_OFFSET: 1.2,
        PITCH_MIN: -70 * Math.PI / 180,
        PITCH_MAX: 70 * Math.PI / 180,
        ROTATION_SPEED: 3,
        ZOOM_SPEED: 5,
        SMOOTH_TIME: 0.1,
        COLLISION_LAYERS: 1 << 0,
        SHAKE_TRAUMA_DECAY: 0.8,
        SHAKE_FREQUENCY: 25,
        SHAKE_AMPLITUDE: 1,
    },

    // Combat
    COMBAT: {
        HITSTOP_LIGHT: 0.04,
        HITSTOP_MEDIUM: 0.06,
        HITSTOP_HEAVY: 0.08,
        HITSTOP_CRITICAL: 0.1,
        KNOCKBACK_BASE: 5,
        KNOCKUP_BASE: 8,
        POISE_REGEN_DELAY: 2,
        POISE_REGEN_RATE: 10,
        PARRY_WINDOW: 0.3,
        PARRY_STAMINA_RESTORE: 15,
        SWITCH_CANCEL_WINDOW: 0.2,
        SWITCH_ATTACK_BONUS: 1.25,
        CRITICAL_MULTIPLIER: 1.5,
        WEAKPOINT_MULTIPLIER: 2.0,
        ELEMENTAL_BONUS: 1.25,
    },

    // Skills
    SKILLS: {
        MAX_ACTIVE_SKILLS: 3,
        MAX_PASSIVE_SKILLS: 5,
        ULTIMATE_COST: 100,
        GLOBAL_COOLDOWN: 0.1,
    },

    // Creatures
    CREATURES: {
        SPAWN_RADIUS: 50,
        DESPAWN_RADIUS: 100,
        MAX_ACTIVE: 50,
        AGGRO_RANGE: 20,
        LEASH_RANGE: 40,
        PATROL_RADIUS: 15,
        CAPTURE_HP_THRESHOLD: 0.2,
        CAPTURE_BASE_CHANCE: 0.3,
        CAPTURE_ITEM_BONUS: 0.4,
        DEVOUR_COOLDOWN: 300, // 5 minutes
        MUTATION_CHANCE_BASE: 0.15,
        MUTATION_CHANCE_RARE: 0.05,
    },

    // Building
    BUILDING: {
        GRID_SIZE: 1,
        MAX_HEIGHT: 50,
        MAX_PIECES_PER_TERRITORY: 500,
        CLAIM_RADIUS: 20,
        CLAIM_COST: 100,
        DECAY_TIME: 7 * 24 * 60 * 60, // 7 days
        SNAP_DISTANCE: 0.5,
        ROTATION_SNAP: 90 * Math.PI / 180,
        STABILITY_CHECK_RADIUS: 3,
        MIN_STABILITY: 0.3,
    },

    // World
    WORLD: {
        CHUNK_SIZE: 64,
        CHUNK_HEIGHT: 32,
        RENDER_DISTANCE: 4, // chunks
        LOAD_DISTANCE: 5,
        UNLOAD_DISTANCE: 6,
        LOD_DISTANCES: [32, 64, 128],
        BIOME_BLEND_RADIUS: 16,
        DAY_LENGTH: 20 * 60, // 20 minutes
        DAWN_HOUR: 5,
        DUSK_HOUR: 19,
    },

    // Resources
    RESOURCES: {
        PICKUP_RANGE: 1.5,
        PICKUP_MAGNET_RANGE: 3,
        PICKUP_SPEED: 8,
        DROP_LIFETIME: 300, // 5 minutes
        TOOL_EFFICIENCY: {
            AXE: { WOOD: 2, PLANT: 1 },
            PICKAXE: { ORE: 2, STONE: 1.5 },
            SICKLE: { PLANT: 2, FIBER: 1.5 },
        },
    },

    // UI
    UI: {
        DAMAGE_NUMBER_LIFETIME: 1.5,
        DAMAGE_NUMBER_SPEED: 2,
        DAMAGE_NUMBER_ARC_HEIGHT: 1,
        HP_BAR_FADE_DELAY: 3,
        SKILL_COOLDOWN_ALPHA: 0.4,
        TOUCH_DEADZONE: 0.15,
        VIRTUAL_JOYSTICK_SIZE: 120,
        TOUCH_BUTTON_SIZE: 64,
    },

    // Audio
    AUDIO: {
        MASTER_VOLUME: 1,
        MUSIC_VOLUME: 0.5,
        SFX_VOLUME: 0.8,
        UI_VOLUME: 0.6,
        MAX_SOURCES: 32,
        ROLLOFF_FACTOR: 1,
        REF_DISTANCE: 1,
        MAX_DISTANCE: 50,
    },

    // Pooling
    POOLS: {
        PROJECTILES: 100,
        EFFECTS: 50,
        DAMAGE_NUMBERS: 30,
        CREATURES: 30,
        PICKUPS: 20,
    },

    // Input
    INPUT: {
        GAMEPAD_DEADZONE: 0.15,
        KEYBOARD_REPEAT_DELAY: 0.5,
        KEYBOARD_REPEAT_RATE: 0.05,
    },
} as const;

// Damage Types
export enum DamageType {
    PHYSICAL = 'physical',
    SLASHING = 'slashing',
    PIERCING = 'piercing',
    BLUNT = 'blunt',
    FIRE = 'fire',
    ICE = 'ice',
    LIGHTNING = 'lightning',
    POISON = 'poison',
    BLEED = 'bleed',
    HOLY = 'holy',
    SHADOW = 'shadow',
}

// Elemental Status Effects
export enum StatusEffectType {
    BURN = 'burn',           // Fire: DoT, spreads to nearby
    FREEZE = 'freeze',       // Ice: Slow -> Root -> Shatter on hit
    SHOCK = 'shock',         // Lightning: Chain to nearby, stun
    POISON = 'poison',       // Poison: DoT, reduces healing
    BLEED = 'bleed',         // Physical: % max HP damage at stacks
    WET = 'wet',             // Water: Conducts lightning, resists fire
    CHILL = 'chill',         // Ice: Slow, stacks to freeze
    ELECTRIFIED = 'electrified', // Lightning: Stun on next hit
    OVERLOAD = 'overload',   // Fire + Lightning: AoE explosion
    SUPERCONDUCT = 'superconduct', // Ice + Lightning: Reduce defense
    MELT = 'melt',           // Fire + Ice: Extra damage
    VAPORIZE = 'vaporize',   // Fire + Water: Extra damage
    SHATTER = 'shatter',     // Blunt on Frozen: Massive damage
}

// Weapon Types
export enum WeaponType {
    SWORD = 'sword',           // Longsword/Katana - Parry
    HEAVY = 'heavy',           // Hammer/Axe - Charge
    BOW = 'bow',               // Bow/Crossbow - Aim
    STAFF = 'staff',           // Staff/Orb - Magic
    DAGGERS = 'daggers',       // Dual Daggers/Claws - Bleed
    POLEARM = 'polearm',       // Spear/Halberd - Reach
    FIST = 'fist',             // Gauntlets - Combo
    GUN = 'gun',               // Firearm - Reload
}

// Weapon Slots
export enum WeaponSlot {
    MAIN = 0,
    SECONDARY = 1,
    TERTIARY = 2,
}

// Movement States
export enum MovementState {
    IDLE = 'idle',
    WALK = 'walk',
    RUN = 'run',
    SPRINT = 'sprint',
    DASH = 'dash',
    JUMP = 'jump',
    DOUBLE_JUMP = 'double_jump',
    FALL = 'fall',
    LAND = 'land',
    CLIMB = 'climb',
    CLIMB_JUMP = 'climb_jump',
    GLIDE = 'glide',
    SWIM = 'swim',
    DIVE = 'dive',
    CROUCH = 'crouch',
    PRONE = 'prone',
    KNOCKBACK = 'knockback',
    STAGGER = 'stagger',
    DEAD = 'dead',
}

// Creature States
export enum CreatureState {
    PATROL = 'patrol',
    IDLE = 'idle',
    ALERT = 'alert',
    CHASE = 'chase',
    COMBAT = 'combat',
    FLEE = 'flee',
    ENRAGED = 'enraged',
    WEAKENED = 'weakened',
    CAPTURED = 'captured',
    DEAD = 'dead',
}

// Biomes
export enum BiomeType {
    SPIRIT_PLAINS = 'spirit_plains',
    FLOATING_MOUNTAINS = 'floating_mountains',
    ASH_DESERT = 'ash_desert',
    TOXIC_SWAMP = 'toxic_swamp',
    DEEP_OCEAN = 'deep_ocean',
    CRYSTAL_CAVES = 'crystal_caves',
    ANCIENT_FOREST = 'ancient_forest',
    VOLCANIC_WASTES = 'volcanic_wastes',
}

// Building Piece Types
export enum BuildingPieceType {
    FOUNDATION = 'foundation',
    FOUNDATION_TRI = 'foundation_tri',
    WALL = 'wall',
    WALL_WINDOW = 'wall_window',
    WALL_DOOR = 'wall_door',
    DOOR = 'door',
    STAIRS = 'stairs',
    STAIRS_L = 'stairs_l',
    ROOF = 'roof',
    ROOF_CORNER = 'roof_corner',
    PILLAR = 'pillar',
    FLOOR = 'floor',
    CEILING = 'ceiling',
    FORGE = 'forge',
    ALCHEMY = 'alchemy',
    STORAGE = 'storage',
    BED = 'bed',
    DECOR = 'decor',
}

// Rarity
export enum Rarity {
    COMMON = 0,
    UNCOMMON = 1,
    RARE = 2,
    EPIC = 3,
    LEGENDARY = 4,
    MYTHIC = 5,
}

// Helper to get config with type safety
export function getConfig<T>(path: string): T {
    const keys = path.split('.');
    let obj: any = GameConfig;
    for (const key of keys) {
        obj = obj[key];
        if (obj === undefined) throw new Error(`Config path not found: ${path}`);
    }
    return obj as T;
}