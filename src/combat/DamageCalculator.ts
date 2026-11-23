// ChimeraLand - Damage Calculation System
// Mathematical formulas for combat damage, critical hits, elemental reactions

import { DamageType, StatusEffectType, GameConfig } from '../core/Config';
import { Vec3 } from '../core/MathUtils';

export interface DamageContext {
    attacker: any;
    target: any;
    baseDamage: number;
    skillMultiplier: number;
    damageType: DamageType;
    elementalBonus: number;
    isCritical: boolean;
    isWeakPoint: boolean;
    hitPoint: Vec3;
    hitNormal: Vec3;
    weaponType: string;
    skillId: string;
}

export interface DamageResult {
    finalDamage: number;
    actualDamage: number;
    isCritical: boolean;
    isWeakPoint: boolean;
    poiseDamage: number;
    knockbackForce: number;
    hitstopDuration: number;
    elementalReactions: ElementalReaction[];
    statusApplied: StatusEffectType[];
    blocked: boolean;
    parried: boolean;
}

export interface ElementalReaction {
    type: string;
    damage: number;
    radius: number;
    position: Vec3;
}

// Damage Type Effectiveness
const DAMAGE_TYPE_EFFECTIVENESS: Record<DamageType, Record<string, number>> = {
    [DamageType.PHYSICAL]: { default: 1.0 },
    [DamageType.SLASHING]: { flesh: 1.2, armor: 0.8, plant: 1.5 },
    [DamageType.PIERCING]: { armor: 1.3, flesh: 1.0, shield: 1.5 },
    [DamageType.BLUNT]: { armor: 1.2, bone: 1.3, shield: 1.2, plant: 0.7 },
    [DamageType.FIRE]: { flesh: 1.1, plant: 1.5, ice: 1.5, water: 0.5 },
    [DamageType.ICE]: { flesh: 1.0, water: 1.5, fire: 0.5, machine: 1.2 },
    [DamageType.LIGHTNING]: { flesh: 1.0, water: 1.5, metal: 1.5, earth: 0.5 },
    [DamageType.POISON]: { flesh: 1.2, machine: 0.3, undead: 0.5 },
    [DamageType.BLEED]: { flesh: 1.0, armor: 0.5 },
    [DamageType.HOLY]: { undead: 1.5, shadow: 1.5, demon: 1.5 },
    [DamageType.SHADOW]: { holy: 0.5, flesh: 1.2, light: 1.3 },
};

export class DamageCalculator {
    static calculate(context: DamageContext): DamageResult {
        const { attacker, target, baseDamage, skillMultiplier, damageType, elementalBonus, isCritical, isWeakPoint, weaponType } = context;

        let finalDamage = baseDamage * skillMultiplier;

        // Apply elemental bonus
        finalDamage *= (1 + elementalBonus);

        // Damage type effectiveness vs target
        const targetTags = target.tags || [];
        let typeMultiplier = 1.0;
        for (const tag of targetTags) {
            const effectiveness = DAMAGE_TYPE_EFFECTIVENESS[damageType]?.[tag] || DAMAGE_TYPE_EFFECTIVENESS[damageType]?.default || 1.0;
            typeMultiplier = Math.max(typeMultiplier, effectiveness);
        }
        finalDamage *= typeMultiplier;

        // Target defense reduction
        const targetDefense = target.getDefense?.() || 0;
        const defenseReduction = 100 / (100 + targetDefense);
        finalDamage *= defenseReduction;

        // Critical hit
        if (isCritical) {
            finalDamage *= GameConfig.COMBAT.CRITICAL_MULTIPLIER;
        }

        // Weak point bonus
        if (isWeakPoint) {
            finalDamage *= GameConfig.COMBAT.WEAKPOINT_MULTIPLIER;
        }

        // Weapon switch cancel bonus
        if (context.attacker?.lastWeaponSwitchTime &&
            Date.now() / 1000 - context.attacker.lastWeaponSwitchTime < GameConfig.COMBAT.SWITCH_CANCEL_WINDOW) {
            finalDamage *= GameConfig.COMBAT.SWITCH_ATTACK_BONUS;
        }

        // Minimum damage
        finalDamage = Math.max(1, Math.floor(finalDamage));

        // Poise damage calculation
        const poiseDamage = this.calculatePoiseDamage(finalDamage, weaponType, damageType, isCritical, isWeakPoint);

        // Knockback force
        const knockbackForce = this.calculateKnockback(finalDamage, weaponType, damageType, isCritical);

        // Hitstop duration
        const hitstopDuration = this.calculateHitstop(finalDamage, weaponType, isCritical, isWeakPoint);

        // Elemental reactions
        const elementalReactions = this.processElementalReactions(context);

        // Status effects
        const statusApplied = this.processStatusEffects(context);

        return {
            finalDamage,
            actualDamage: finalDamage,
            isCritical,
            isWeakPoint,
            poiseDamage,
            knockbackForce,
            hitstopDuration,
            elementalReactions,
            statusApplied,
            blocked: false,
            parried: false,
        };
    }

    private static calculatePoiseDamage(damage: number, weaponType: string, damageType: DamageType, isCritical: boolean, isWeakPoint: boolean): number {
        let poiseDamage = damage * 0.1;

        // Weapon type modifiers
        switch (weaponType) {
            case 'heavy': poiseDamage *= 2.5; break;
            case 'polearm': poiseDamage *= 1.5; break;
            case 'sword': poiseDamage *= 1.0; break;
            case 'daggers': poiseDamage *= 0.5; break;
            case 'bow': poiseDamage *= 0.3; break;
            case 'staff': poiseDamage *= 0.5; break;
        }

        // Damage type modifiers
        if (damageType === DamageType.BLUNT) poiseDamage *= 1.5;
        if (damageType === DamageType.PIERCING) poiseDamage *= 0.8;

        // Critical/Weak point
        if (isCritical) poiseDamage *= 1.5;
        if (isWeakPoint) poiseDamage *= 2.0;

        return Math.floor(poiseDamage);
    }

    private static calculateKnockback(damage: number, weaponType: string, damageType: DamageType, isCritical: boolean): number {
        let knockback = GameConfig.COMBAT.KNOCKBACK_BASE * (damage / 100);

        switch (weaponType) {
            case 'heavy': knockback *= 2.0; break;
            case 'polearm': knockback *= 1.2; break;
            case 'sword': knockback *= 1.0; break;
            case 'daggers': knockback *= 0.5; break;
            case 'bow': knockback *= 0.3; break;
            case 'staff': knockback *= 0.8; break;
        }

        if (damageType === DamageType.BLUNT) knockback *= 1.5;
        if (isCritical) knockback *= 1.5;

        return knockback;
    }

    private static calculateHitstop(damage: number, weaponType: string, isCritical: boolean, isWeakPoint: boolean): number {
        let hitstop = GameConfig.COMBAT.HITSTOP_LIGHT;

        if (weaponType === 'heavy') hitstop = GameConfig.COMBAT.HITSTOP_HEAVY;
        else if (weaponType === 'polearm' || weaponType === 'sword') hitstop = GameConfig.COMBAT.HITSTOP_MEDIUM;

        if (isCritical) hitstop = GameConfig.COMBAT.HITSTOP_CRITICAL;
        if (isWeakPoint) hitstop *= 1.5;

        return hitstop;
    }

    private static processElementalReactions(context: DamageContext): ElementalReaction[] {
        const reactions: ElementalReaction[] = [];
        const target = context.target;
        const damageType = context.damageType;

        // Get existing statuses on target
        const existingStatuses = target.getActiveStatuses?.() || [];

        // Fire + Lightning = Overload
        if (damageType === DamageType.FIRE && existingStatuses.includes(StatusEffectType.SHOCK)) {
            reactions.push({
                type: 'overload',
                damage: context.finalDamage * 0.5,
                radius: 4,
                position: context.hitPoint.copy(),
            });
        }
        if (damageType === DamageType.LIGHTNING && existingStatuses.includes(StatusEffectType.BURN)) {
            reactions.push({
                type: 'overload',
                damage: context.finalDamage * 0.5,
                radius: 4,
                position: context.hitPoint.copy(),
            });
        }

        // Ice + Lightning = Superconduct
        if (damageType === DamageType.ICE && existingStatuses.includes(StatusEffectType.SHOCK)) {
            reactions.push({
                type: 'superconduct',
                damage: 0,
                radius: 3,
                position: context.hitPoint.copy(),
            });
        }
        if (damageType === DamageType.LIGHTNING && (existingStatuses.includes(StatusEffectType.FREEZE) || existingStatuses.includes(StatusEffectType.CHILL))) {
            reactions.push({
                type: 'superconduct',
                damage: 0,
                radius: 3,
                position: context.hitPoint.copy(),
            });
        }

        // Fire + Ice = Melt
        if (damageType === DamageType.FIRE && (existingStatuses.includes(StatusEffectType.FREEZE) || existingStatuses.includes(StatusEffectType.CHILL))) {
            reactions.push({
                type: 'melt',
                damage: context.finalDamage * 0.5,
                radius: 2,
                position: context.hitPoint.copy(),
            });
        }
        if (damageType === DamageType.ICE && existingStatuses.includes(StatusEffectType.BURN)) {
            reactions.push({
                type: 'melt',
                damage: context.finalDamage * 0.5,
                radius: 2,
                position: context.hitPoint.copy(),
            });
        }

        // Fire + Water = Vaporize
        if (damageType === DamageType.FIRE && existingStatuses.includes(StatusEffectType.WET)) {
            reactions.push({
                type: 'vaporize',
                damage: context.finalDamage * 0.75,
                radius: 3,
                position: context.hitPoint.copy(),
            });
        }

        // Blunt on Frozen = Shatter
        if (damageType === DamageType.BLUNT && existingStatuses.includes(StatusEffectType.FREEZE)) {
            reactions.push({
                type: 'shatter',
                damage: context.finalDamage * 2.0,
                radius: 2,
                position: context.hitPoint.copy(),
            });
        }

        return reactions;
    }

    private static processStatusEffects(context: DamageContext): StatusEffectType[] {
        const applied: StatusEffectType[] = [];
        const damageType = context.damageType;
        const chance = context.attacker?.getStatusChance?.() || 0.1;

        if (Math.random() > chance) return applied;

        switch (damageType) {
            case DamageType.FIRE:
                applied.push(StatusEffectType.BURN);
                break;
            case DamageType.ICE:
                applied.push(Math.random() < 0.5 ? StatusEffectType.CHILL : StatusEffectType.FREEZE);
                break;
            case DamageType.LIGHTNING:
                applied.push(StatusEffectType.SHOCK);
                break;
            case DamageType.POISON:
                applied.push(StatusEffectType.POISON);
                break;
            case DamageType.SLASHING:
            case DamageType.PIERCING:
                if (context.weaponType === 'daggers') applied.push(StatusEffectType.BLEED);
                break;
        }

        return applied;
    }

    // Parry calculation
    static calculateParry(attacker: any, defender: any, attackDamage: number): { success: boolean; staminaRestored: number; counterDamage: number } {
        const parryWindow = GameConfig.COMBAT.PARRY_WINDOW;
        const timeSinceAttackStart = Date.now() / 1000 - attacker.attackStartTime;

        if (timeSinceAttackStart > parryWindow) {
            return { success: false, staminaRestored: 0, counterDamage: 0 };
        }

        const staminaRestored = GameConfig.COMBAT.PARRY_STAMINA_RESTORE;
        const counterDamage = attackDamage * 1.5; // Parry counter deals 150% damage

        return { success: true, staminaRestored, counterDamage };
    }

    // Fall damage
    static calculateFallDamage(fallHeight: number, maxHealth: number): number {
        const safeHeight = 5;
        if (fallHeight <= safeHeight) return 0;
        const excessHeight = fallHeight - safeHeight;
        return Math.floor(maxHealth * 0.1 * Math.min(excessHeight / 10, 1));
    }

    // Environmental damage
    static calculateEnvironmentalDamage(type: DamageType, intensity: number, maxHealth: number): number {
        const baseDamage = maxHealth * 0.02 * intensity;
        return Math.floor(baseDamage);
    }
}

// Utility function for getting damage color
export function getDamageColor(damageType: DamageType, isCritical: boolean): string {
    if (isCritical) return '#FFD700'; // Gold
    switch (damageType) {
        case DamageType.PHYSICAL:
        case DamageType.SLASHING:
        case DamageType.PIERCING:
        case DamageType.BLUNT:
        case DamageType.BLEED:
            return '#FFFFFF'; // White
        case DamageType.FIRE:
        case DamageType.BURN:
            return '#FF4400'; // Orange-Red
        case DamageType.ICE:
        case DamageType.FREEZE:
        case DamageType.CHILL:
            return '#00AAFF'; // Blue
        case DamageType.LIGHTNING:
        case DamageType.SHOCK:
        case DamageType.ELECTRIFIED:
            return '#AA44FF'; // Purple
        case DamageType.POISON:
            return '#00FF44'; // Green
        case DamageType.HOLY:
            return '#FFFF88'; // Yellow
        case DamageType.SHADOW:
            return '#8800FF'; // Dark Purple
        default:
            return '#FFFFFF';
    }
}

// Utility for damage number formatting
export function formatDamageNumber(value: number): string {
    if (value >= 10000) return (value / 1000).toFixed(1) + 'k';
    if (value >= 1000) return value.toLocaleString();
    return value.toString();
}