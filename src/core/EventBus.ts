// ChimeraLand - Event Bus System
// Decoupled pub/sub for cross-system communication

export type EventCallback<T = any> = (data: T) => void;
export type EventUnsubscribe = () => void;

interface Listener<T> {
    callback: EventCallback<T>;
    once: boolean;
    priority: number;
}

export class EventBus {
    private static instance: EventBus;
    private events: Map<string, Listener<any>[]> = new Map();
    private eventQueue: Array<{ event: string; data: any }> = [];
    private isDispatching = false;

    static getInstance(): EventBus {
        if (!EventBus.instance) EventBus.instance = new EventBus();
        return EventBus.instance;
    }

    on<T>(event: string, callback: EventCallback<T>, priority: number = 0): EventUnsubscribe {
        if (!this.events.has(event)) this.events.set(event, []);
        const listeners = this.events.get(event)!;
        const listener: Listener<T> = { callback, once: false, priority };
        listeners.push(listener);
        listeners.sort((a, b) => b.priority - a.priority);
        return () => this.off(event, callback);
    }

    once<T>(event: string, callback: EventCallback<T>, priority: number = 0): EventUnsubscribe {
        if (!this.events.has(event)) this.events.set(event, []);
        const listeners = this.events.get(event)!;
        const listener: Listener<T> = { callback, once: true, priority };
        listeners.push(listener);
        listeners.sort((a, b) => b.priority - a.priority);
        return () => this.off(event, callback);
    }

    off<T>(event: string, callback?: EventCallback<T>): void {
        if (!this.events.has(event)) return;
        const listeners = this.events.get(event)!;
        if (callback) {
            const idx = listeners.findIndex(l => l.callback === callback);
            if (idx >= 0) listeners.splice(idx, 1);
        } else {
            listeners.length = 0;
        }
        if (listeners.length === 0) this.events.delete(event);
    }

    emit<T>(event: string, data: T): void {
        if (!this.events.has(event)) return;
        const listeners = this.events.get(event)!;
        const toCall = listeners.filter(l => !l.once);
        const onceListeners = listeners.filter(l => l.once);

        for (const listener of toCall) {
            try { listener.callback(data); } catch (e) { console.error(`EventBus error in ${event}:`, e); }
        }
        for (const listener of onceListeners) {
            try { listener.callback(data); } catch (e) { console.error(`EventBus error in ${event}:`, e); }
        }
        // Remove once listeners after calling
        for (const listener of onceListeners) {
            const idx = listeners.indexOf(listener);
            if (idx >= 0) listeners.splice(idx, 1);
        }
    }

    // Deferred emit for safe emission during event handling
    emitDeferred<T>(event: string, data: T): void {
        this.eventQueue.push({ event, data });
        if (!this.isDispatching) this.flush();
    }

    private flush(): void {
        this.isDispatching = true;
        while (this.eventQueue.length > 0) {
            const { event, data } = this.eventQueue.shift()!;
            this.emit(event, data);
        }
        this.isDispatching = false;
    }

    clear(): void { this.events.clear(); this.eventQueue.length = 0; }
    hasListeners(event: string): boolean { return this.events.has(event) && this.events.get(event)!.length > 0; }
    listenerCount(event: string): number { return this.events.get(event)?.length || 0; }
}

// Game Events Enum - Type-safe event names
export const GameEvents = {
    // Player
    PLAYER_SPAWNED: 'player:spawned',
    PLAYER_DIED: 'player:died',
    PLAYER_REVIVED: 'player:revived',
    PLAYER_LEVEL_UP: 'player:level_up',

    // Movement
    MOVEMENT_STATE_CHANGED: 'movement:state_changed',
    STAMINA_CHANGED: 'movement:stamina_changed',
    DASH_PERFORMED: 'movement:dash_performed',
    CLIMB_STARTED: 'movement:climb_started',
    CLIMB_ENDED: 'movement:climb_ended',
    GLIDE_STARTED: 'movement:glide_started',
    GLIDE_ENDED: 'movement:glide_ended',
    SWIM_STARTED: 'movement:swim_started',
    DIVE_STARTED: 'movement:dive_started',

    // Combat
    WEAPON_SWAPPED: 'combat:weapon_swapped',
    WEAPON_SWITCH_CANCEL: 'combat:weapon_switch_cancel',
    ATTACK_STARTED: 'combat:attack_started',
    ATTACK_HIT: 'combat:attack_hit',
    ATTACK_PARRIED: 'combat:attack_parried',
    DAMAGE_TAKEN: 'combat:damage_taken',
    DAMAGE_DEALT: 'combat:damage_dealt',
    CRITICAL_HIT: 'combat:critical_hit',
    POISE_BROKEN: 'combat:poise_broken',
    ENEMY_STAGGERED: 'combat:enemy_staggered',
    ENEMY_LAUNCHED: 'combat:enemy_launched',
    KILL: 'combat:kill',
    FURY_CHANGED: 'combat:fury_changed',
    ULTIMATE_READY: 'combat:ultimate_ready',
    ULTIMATE_USED: 'combat:ultimate_used',

    // Skills
    SKILL_USED: 'skill:used',
    SKILL_COOLDOWN_START: 'skill:cooldown_start',
    SKILL_COOLDOWN_END: 'skill:cooldown_end',
    STATUS_APPLIED: 'skill:status_applied',
    STATUS_REMOVED: 'skill:status_removed',
    ELEMENTAL_REACTION: 'skill:elemental_reaction',

    // Creatures
    CREATURE_SPAWNED: 'creature:spawned',
    CREATURE_DESPAWNED: 'creature:despawned',
    CREATURE_DAMAGED: 'creature:damaged',
    CREATURE_DIED: 'creature:died',
    CREATURE_WEAKENED: 'creature:weakened',
    CREATURE_CAPTURED: 'creature:captured',
    CREATURE_ENRAGED: 'creature:enraged',
    BODY_PART_DESTROYED: 'creature:body_part_destroyed',
    PET_SUMMONED: 'creature:pet_summoned',
    PET_DISMISSED: 'creature:pet_dismissed',
    PET_MOUNTED: 'creature:pet_mounted',
    PET_UNMOUNTED: 'creature:pet_unmounted',
    DEVOUR_STARTED: 'creature:devour_started',
    DEVOUR_COMPLETED: 'creature:devour_completed',
    MUTATION_OCCURRED: 'creature:mutation_occurred',

    // Building
    BUILD_MODE_ENTERED: 'build:mode_entered',
    BUILD_MODE_EXITED: 'build:mode_exited',
    PIECE_PLACED: 'build:piece_placed',
    PIECE_REMOVED: 'build:piece_removed',
    TERRITORY_CLAIMED: 'build:territory_claimed',
    TERRITORY_LOST: 'build:territory_lost',
    SNAP_POINT_FOUND: 'build:snap_point_found',

    // World
    CHUNK_LOADED: 'world:chunk_loaded',
    CHUNK_UNLOADED: 'world:chunk_unloaded',
    BIOME_CHANGED: 'world:biome_changed',
    TIME_CHANGED: 'world:time_changed',
    WEATHER_CHANGED: 'world:weather_changed',
    RESOURCE_GATHERED: 'world:resource_gathered',

    // UI
    UI_DAMAGE_NUMBER: 'ui:damage_number',
    UI_HIT_EFFECT: 'ui:hit_effect',
    UI_SCREEN_SHAKE: 'ui:screen_shake',
    UI_HITSTOP: 'ui:hitstop',
    UI_NOTIFICATION: 'ui:notification',

    // Systems
    SAVE_GAME: 'system:save_game',
    LOAD_GAME: 'system:load_game',
    SETTINGS_CHANGED: 'system:settings_changed',
} as const;

export type GameEventKey = keyof typeof GameEvents;
export type GameEventData = {
    [GameEvents.PLAYER_SPAWNED]: { position: Vec3 };
    [GameEvents.PLAYER_DIED]: { position: Vec3; killer?: Entity };
    [GameEvents.WEAPON_SWAPPED]: { fromSlot: number; toSlot: number; weapon: Weapon };
    [GameEvents.ATTACK_HIT]: { attacker: Entity; target: Entity; damage: number; hitPoint: Vec3; hitNormal: Vec3; isCritical: boolean; damageType: DamageType };
    [GameEvents.DAMAGE_TAKEN]: { entity: Entity; damage: number; source: Entity; hitPoint: Vec3 };
    [GameEvents.CREATURE_CAPTURED]: { creature: Creature; itemUsed: string; success: boolean };
    [GameEvents.MUTATION_OCCURRED]: { pet: Creature; devouredCreature: Creature; part: MutationPart };
    [GameEvents.PIECE_PLACED]: { piece: BuildingPiece; position: Vec3; rotation: Quat };
} & Record<string, any>;

import { Vec3, Quat } from './MathUtils';
import { Entity } from './Entity';
import { Weapon } from '../combat/Weapon';
import { Creature } from '../creatures/Creature';
import { BuildingPiece } from '../building/BuildingPiece';
import { DamageType } from '../combat/DamageCalculator';
import { MutationPart } from '../creatures/ChimeraSystem';

// Type-safe emit helper
export function emitEvent<K extends GameEventKey>(event: K, data: GameEventData[K]): void {
    EventBus.getInstance().emit(GameEvents[event], data);
}

export function onEvent<K extends GameEventKey>(event: K, callback: (data: GameEventData[K]) => void, priority?: number): EventUnsubscribe {
    return EventBus.getInstance().on(GameEvents[event], callback, priority);
}

export function onceEvent<K extends GameEventKey>(event: K, callback: (data: GameEventData[K]) => void, priority?: number): EventUnsubscribe {
    return EventBus.getInstance().once(GameEvents[event], callback, priority);
}