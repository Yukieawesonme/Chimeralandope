// ChimeraLand - Poise/Stagger System
// Hidden poise bar, stagger thresholds, launcher mechanics

import { EventBus, GameEvents, emitEvent } from '../core/EventBus';
import { GameConfig } from '../core/Config';
import { Vec3 } from '../core/MathUtils';

export enum StaggerType {
    NONE = 'none',
    LIGHT = 'light',      // Flinch - brief animation interrupt
    MEDIUM = 'medium',    // Stagger - longer stun, can be combo'd
    HEAVY = 'heavy',      // Crumple - falls to ground, vulnerable
    LAUNCH = 'launch',    // Launched into air - aerial combo
    KNOCKBACK = 'knockback', // Pushed back
    KNOCKDOWN = 'knockdown', // Knocked down, gets up slowly
}

export interface PoiseState {
    current: number;
    max: number;
    regenTimer: number;
    isBroken: boolean;
    breakTime: number;
    staggerType: StaggerType;
    staggerEndTime: number;
    invulnerableUntil: number;
}

export class PoiseSystem {
    private static instance: PoiseSystem;

    static getInstance(): PoiseSystem {
        if (!PoiseSystem.instance) PoiseSystem.instance = new PoiseSystem();
        return PoiseSystem.instance;
    }

    // Initialize poise state for entity
    initialize(entity: any, maxPoise: number): void {
        entity.poise = {
            current: maxPoise,
            max: maxPoise,
            regenTimer: 0,
            isBroken: false,
            breakTime: 0,
            staggerType: StaggerType.NONE,
            staggerEndTime: 0,
            invulnerableUntil: 0,
        };
    }

    // Apply poise damage
    applyPoiseDamage(entity: any, amount: number, hitDirection: Vec3, hitPoint: Vec3): StaggerType {
        if (!entity.poise) this.initialize(entity, entity.maxPoise || 100);

        const poise = entity.poise;
        const now = Date.now() / 1000;

        // Don't apply if already staggered (unless heavier hit)
        if (poise.staggerType !== StaggerType.NONE && now < poise.staggerEndTime) {
            // Check if new hit is heavier - if so, upgrade stagger
            const currentStaggerWeight = this.getStaggerWeight(poise.staggerType);
            const newStaggerWeight = this.calculateStaggerWeight(amount);
            if (newStaggerWeight <= currentStaggerWeight) return StaggerType.NONE;
        }

        poise.current = Math.max(0, poise.current - amount);
        poise.regenTimer = now + GameConfig.COMBAT.POISE_REGEN_DELAY;

        // Check for poise break
        if (poise.current <= 0 && !poise.isBroken) {
            return this.breakPoise(entity, hitDirection, hitPoint, amount);
        }

        // Determine stagger type based on damage amount
        return this.calculateStagger(entity, amount, hitDirection);
    }

    private breakPoise(entity: any, hitDirection: Vec3, hitPoint: Vec3, damage: number): StaggerType {
        const poise = entity.poise;
        poise.isBroken = true;
        poise.breakTime = Date.now() / 1000;

        // Determine stagger type based on damage and entity type
        let staggerType = this.determineStaggerType(entity, damage, hitDirection);

        poise.staggerType = staggerType;
        poise.staggerEndTime = Date.now() / 1000 + this.getStaggerDuration(staggerType);

        // Grant brief invulnerability during stagger transition
        poise.invulnerableUntil = poise.staggerEndTime + 0.2;

        // Emit event
        emitEvent(GameEvents.POISE_BROKEN, { entity, staggerType, hitPoint, hitDirection });

        if (staggerType === StaggerType.LAUNCH) {
            emitEvent(GameEvents.ENEMY_LAUNCHED, { entity, hitDirection, hitPoint });
        } else if (staggerType === StaggerType.HEAVY || staggerType === StaggerType.MEDIUM) {
            emitEvent(GameEvents.ENEMY_STAGGERED, { entity, staggerType });
        }

        return staggerType;
    }

    private determineStaggerType(entity: any, damage: number, hitDirection: Vec3): StaggerType {
        const isPlayer = entity.hasTag?.('PlayerTag');
        const isBoss = entity.hasTag?.('BossTag');
        const isAirborne = entity.isAirborne?.();

        // Weight-based determination
        const weight = this.calculateStaggerWeight(damage);

        if (isAirborne) {
            // Airborne enemies get launched easier
            if (weight >= 1.5) return StaggerType.LAUNCH;
            return StaggerType.KNOCKBACK;
        }

        if (isBoss) {
            // Bosses resist stagger
            if (weight >= 4) return StaggerType.HEAVY;
            if (weight >= 2) return StaggerType.MEDIUM;
            return StaggerType.LIGHT;
        }

        if (isPlayer) {
            // Player gets lighter stagger
            if (weight >= 3) return StaggerType.KNOCKDOWN;
            if (weight >= 1.5) return StaggerType.MEDIUM;
            return StaggerType.LIGHT;
        }

        // Regular enemies
        if (weight >= 3) return StaggerType.LAUNCH;
        if (weight >= 2) return StaggerType.HEAVY;
        if (weight >= 1) return StaggerType.MEDIUM;
        return StaggerType.LIGHT;
    }

    private calculateStaggerWeight(damage: number): number {
        // Normalize damage to weight (100 damage = weight 1)
        return damage / 100;
    }

    private getStaggerWeight(type: StaggerType): number {
        switch (type) {
            case StaggerType.LAUNCH: return 4;
            case StaggerType.KNOCKDOWN: return 3;
            case StaggerType.HEAVY: return 3;
            case StaggerType.MEDIUM: return 2;
            case StaggerType.LIGHT: return 1;
            case StaggerType.KNOCKBACK: return 1.5;
            default: return 0;
        }
    }

    private getStaggerDuration(type: StaggerType): number {
        switch (type) {
            case StaggerType.LIGHT: return 0.3;
            case StaggerType.MEDIUM: return 1.0;
            case StaggerType.HEAVY: return 2.0;
            case StaggerType.LAUNCH: return 2.5;
            case StaggerType.KNOCKBACK: return 0.5;
            case StaggerType.KNOCKDOWN: return 3.0;
            default: return 0;
        }
    }

    private calculateStagger(entity: any, amount: number, hitDirection: Vec3): StaggerType {
        // Light stagger for small poise damage
        const poise = entity.poise;
        const percentLost = amount / poise.max;

        if (percentLost > 0.5) return StaggerType.MEDIUM;
        if (percentLost > 0.25) return StaggerType.LIGHT;
        return StaggerType.NONE;
    }

    // Update poise regeneration
    update(entity: any, dt: number): void {
        if (!entity.poise) return;

        const poise = entity.poise;
        const now = Date.now() / 1000;

        // Handle stagger end
        if (poise.staggerType !== StaggerType.NONE && now >= poise.staggerEndTime) {
            poise.staggerType = StaggerType.NONE;
        }

        // Regenerate poise
        if (!poise.isBroken && poise.current < poise.max && now >= poise.regenTimer) {
            poise.current = Math.min(poise.max, poise.current + GameConfig.COMBAT.POISE_REGEN_RATE * dt);
        }

        // Recover from broken poise
        if (poise.isBroken && now - poise.breakTime > 5) { // 5 seconds to recover
            poise.isBroken = false;
            poise.current = poise.max * 0.5; // Recover to 50%
        }
    }

    // Get current stagger state
    getStaggerState(entity: any): { type: StaggerType; remaining: number; isInvulnerable: boolean } {
        if (!entity.poise) return { type: StaggerType.NONE, remaining: 0, isInvulnerable: false };

        const poise = entity.poise;
        const now = Date.now() / 1000;

        return {
            type: poise.staggerType,
            remaining: Math.max(0, poise.staggerEndTime - now),
            isInvulnerable: now < poise.invulnerableUntil,
        };
    }

    // Check if entity can be hit
    canBeHit(entity: any): boolean {
        if (!entity.poise) return true;
        const now = Date.now() / 1000;
        return now >= entity.poise.invulnerableUntil;
    }

    // Force stagger (for skills, finishers)
    forceStagger(entity: any, type: StaggerType, hitDirection: Vec3, hitPoint: Vec3): void {
        if (!entity.poise) this.initialize(entity, entity.maxPoise || 100);

        entity.poise.staggerType = type;
        entity.poise.staggerEndTime = Date.now() / 1000 + this.getStaggerDuration(type);
        entity.poise.invulnerableUntil = entity.poise.staggerEndTime + 0.2;

        emitEvent(GameEvents.POISE_BROKEN, { entity, staggerType: type, hitPoint, hitDirection, forced: true });
    }

    // Reset poise (on respawn, etc)
    reset(entity: any): void {
        if (!entity.poise) return;
        entity.poise.current = entity.poise.max;
        entity.poise.isBroken = false;
        entity.poise.staggerType = StaggerType.NONE;
        entity.poise.regenTimer = 0;
    }

    // Get poise percentage for UI
    getPoisePercent(entity: any): number {
        if (!entity.poise) return 1;
        return entity.poise.current / entity.poise.max;
    }
}

// Stagger animation mapping
export const StaggerAnimations: Record<StaggerType, string> = {
    [StaggerType.NONE]: '',
    [StaggerType.LIGHT]: 'stagger_light',
    [StaggerType.MEDIUM]: 'stagger_medium',
    [StaggerType.HEAVY]: 'stagger_heavy',
    [StaggerType.LAUNCH]: 'launch',
    [StaggerType.KNOCKBACK]: 'knockback',
    [StaggerType.KNOCKDOWN]: 'knockdown',
};

// Stagger physics impulses
export const StaggerImpulses: Record<StaggerType, { force: number; upward: number }> = {
    [StaggerType.NONE]: { force: 0, upward: 0 },
    [StaggerType.LIGHT]: { force: 2, upward: 0 },
    [StaggerType.MEDIUM]: { force: 5, upward: 1 },
    [StaggerType.HEAVY]: { force: 8, upward: 3 },
    [StaggerType.LAUNCH]: { force: 3, upward: 12 },
    [StaggerType.KNOCKBACK]: { force: 10, upward: 0 },
    [StaggerType.KNOCKDOWN]: { force: 5, upward: 2 },
};