// ChimeraLand - Skill System
// Data-driven skills with phases, cooldowns, elemental effects, object pooling

import { EventBus, GameEvents, emitEvent, onEvent } from '../core/EventBus';
import { GameConfig, DamageType, StatusEffectType, WeaponType } from '../core/Config';
import { Vec3, Quat, Vec3Pool } from '../core/MathUtils';
import { ObjectPool, PooledProjectile, PooledEffect, PoolManager } from '../pooling/ObjectPool';
import { DamageCalculator, DamageContext } from '../combat/DamageCalculator';

export enum SkillPhase {
    STARTUP = 'startup',
    ACTIVE = 'active',
    RECOVERY = 'recovery',
    CHANNELING = 'channeling',
}

export enum SkillType {
    ACTIVE = 'active',
    PASSIVE = 'passive',
    ULTIMATE = 'ultimate',
    WEAPON_SWITCH = 'weapon_switch',
}

export interface SkillData {
    id: string;
    name: string;
    description: string;
    type: SkillType;
    requiredWeaponType: WeaponType | 'any';
    weaponSlot: number; // 0,1,2 for active skills
    icon: string;

    // Costs
    staminaCost: number;
    energyCost: number;
    furyCost: number; // For ultimate

    // Timing
    cooldown: number;
    globalCooldown: boolean;

    // Phases (in seconds)
    startupTime: number;
    activeTime: number;
    recoveryTime: number;
    channelTime: number; // For channeling skills

    // Properties
    canCancelWithDodge: boolean;
    canCancelWithWeaponSwitch: boolean;
    isAerial: boolean;
    isGrounded: boolean;
    movementImpulse: Vec3;

    // Damage
    baseDamage: number;
    damageMultiplier: number;
    damageType: DamageType;
    poiseDamage: number;
    knockback: number;

    // Area/Targeting
    range: number;
    radius: number;
    maxTargets: number;
    requiresTarget: boolean;
    targetType: 'self' | 'enemy' | 'ally' | 'ground' | 'direction';

    // Effects
    applyStatus: StatusEffectType[];
    statusChance: number;
    statusDuration: number;
    statusStacks: number;

    // Elemental
    elementalType: DamageType;
    elementalBonus: number;
    comboElements: DamageType[];

    // Projectile
    projectileSpeed: number;
    projectileCount: number;
    projectileSpread: number;
    projectilePierce: number;
    projectileHoming: boolean;
    projectileHomingRange: number;
    projectileHomingStrength: number;
    projectileLifetime: number;
    projectileTrail: string;

    // Visual/Audio
    castEffect: string;
    hitEffect: string;
    soundCast: string;
    soundHit: string;
    screenShake: number;

    // Upgrades
    maxLevel: number;
    upgradeData: SkillUpgrade[];
}

export interface SkillUpgrade {
    level: number;
    damageMultiplier?: number;
    cooldownReduction?: number;
    radiusIncrease?: number;
    extraProjectile?: number;
    newEffect?: string;
    description: string;
}

export interface ActiveSkillInstance {
    skill: Skill;
    cooldownRemaining: number;
    charges: number;
    maxCharges: number;
    chargeRechargeTime: number;
    level: number;
}

export class Skill {
    data: SkillData;
    level: number = 1;
    cooldownRemaining: number = 0;
    isActive: boolean = false;
    currentPhase: SkillPhase = SkillPhase.STARTUP;
    phaseTimer: number = 0;
    owner: any = null;
    targets: any[] = [];
    projectiles: PooledProjectile[] = [];
    effects: any[] = [];

    constructor(data: SkillData) {
        this.data = data;
    }

    setOwner(owner: any): void { this.owner = owner; }

    canUse(): boolean {
        if (this.cooldownRemaining > 0) return false;
        if (!this.owner) return false;

        // Check weapon requirement
        const weaponSystem = (globalThis as any).WeaponSystem?.getInstance?.();
        if (weaponSystem && this.data.requiredWeaponType !== 'any') {
            const activeWeapon = weaponSystem.getActiveWeapon();
            if (!activeWeapon || activeWeapon.data.type !== this.data.requiredWeaponType) {
                return false;
            }
        }

        // Check costs
        const stamina = this.owner.getComponent?.('Stamina');
        if (stamina && !stamina.canAfford(this.data.staminaCost)) return false;

        const fury = (globalThis as any).CombatController?.getInstance?.().getFury?.();
        if (this.data.furyCost > 0 && (fury || 0) < this.data.furyCost) return false;

        // Check state requirements
        const movement = this.owner.getComponent?.('Movement');
        if (movement) {
            if (this.data.isAerial && movement.currentState !== 'jump' && movement.currentState !== 'fall' && movement.currentState !== 'glide') {
                return false;
            }
            if (this.data.isGrounded && !movement.isGrounded) return false;
        }

        return true;
    }

    execute(): boolean {
        if (!this.canUse()) return false;

        // Consume costs
        const stamina = this.owner.getComponent?.('Stamina');
        if (stamina) stamina.consume(this.data.staminaCost);

        if (this.data.furyCost > 0) {
            const combatCtrl = (globalThis as any).CombatController?.getInstance?.();
            if (combatCtrl) combatCtrl.fury -= this.data.furyCost;
        }

        // Start skill
        this.isActive = true;
        this.currentPhase = SkillPhase.STARTUP;
        this.phaseTimer = this.getStartupTime();
        this.targets = this.findTargets();

        // Apply movement impulse
        if (this.data.movementImpulse.lengthSq() > 0) {
            const vel = this.owner.getComponent?.('Velocity');
            if (vel) {
                const forward = this.owner.transform.getForward();
                const right = this.owner.transform.getRight();
                const impulse = forward.mulled(this.data.movementImpulse.z).add(right.mulled(this.data.movementImpulse.x));
                impulse.y = this.data.movementImpulse.y;
                vel.velocity.add(impulse);
            }
        }

        // Cast effect
        if (this.data.castEffect) {
            emitEvent(GameEvents.UI_HIT_EFFECT, {
                position: this.owner.transform.position,
                type: this.data.castEffect,
            });
        }

        emitEvent(GameEvents.SKILL_USED, { skillId: this.data.id, owner: this.owner, targets: this.targets });

        // Start cooldown
        this.cooldownRemaining = this.getCooldown();

        return true;
    }

    update(dt: number): void {
        // Update cooldown
        if (this.cooldownRemaining > 0) {
            this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
        }

        if (!this.isActive) return;

        this.phaseTimer -= dt;

        switch (this.currentPhase) {
            case SkillPhase.STARTUP:
                if (this.phaseTimer <= 0) {
                    this.currentPhase = SkillPhase.ACTIVE;
                    this.phaseTimer = this.getActiveTime();
                    this.onActiveStart();
                }
                break;

            case SkillPhase.ACTIVE:
                this.onActiveUpdate(dt);
                if (this.phaseTimer <= 0) {
                    this.currentPhase = SkillPhase.RECOVERY;
                    this.phaseTimer = this.getRecoveryTime();
                    this.onRecoveryStart();
                }
                break;

            case SkillPhase.RECOVERY:
                if (this.phaseTimer <= 0) {
                    this.endSkill();
                }
                break;

            case SkillPhase.CHANNELING:
                this.onChannelUpdate(dt);
                if (this.phaseTimer <= 0) {
                    this.endSkill();
                }
                break;
        }

        // Update projectiles
        this.updateProjectiles(dt);
    }

    protected getStartupTime(): number {
        return this.data.startupTime * (1 - (this.level - 1) * 0.05); // 5% faster per level
    }

    protected getActiveTime(): number { return this.data.activeTime; }
    protected getRecoveryTime(): number { return this.data.recoveryTime; }
    protected getCooldown(): number {
        return this.data.cooldown * (1 - (this.level - 1) * 0.1); // 10% CD reduction per level
    }
    protected getDamage(): number {
        return this.data.baseDamage * this.data.damageMultiplier * (1 + (this.level - 1) * 0.2);
    }
    protected getRadius(): number {
        return this.data.radius * (1 + (this.level - 1) * 0.1);
    }

    protected findTargets(): any[] {
        // Would query world for targets in range
        return [];
    }

    protected onActiveStart(): void {
        // Spawn projectiles, create areas, apply instant effects
        switch (this.data.targetType) {
            case 'direction':
                this.spawnProjectiles();
                break;
            case 'ground':
                this.createGroundEffect();
                break;
            case 'enemy':
                this.applyToTargets();
                break;
            case 'self':
                this.applyToSelf();
                break;
        }
    }

    protected onActiveUpdate(dt: number): void {
        // For channeling or multi-hit skills
    }

    protected onRecoveryStart(): void {}

    protected onChannelUpdate(dt: number): void {
        // Channeling skills tick damage/effects
    }

    protected spawnProjectiles(): void {
        const pool = PoolManager.getInstance().get('projectiles') as ObjectPool<PooledProjectile>;
        if (!pool) return;

        const count = this.data.projectileCount + (this.level - 1) * (this.data.upgradeData.find(u => u.extraProjectile)?.extraProjectile || 0);
        const forward = this.owner.transform.getForward();
        const right = this.owner.transform.getRight();
        const startPos = this.owner.transform.position.added(forward.mulled(1)).added(new Vec3(0, 1.5, 0));

        for (let i = 0; i < count; i++) {
            const proj = pool.get();
            const spread = (Math.random() - 0.5) * this.data.projectileSpread;
            const dir = forward.mulled(Math.cos(spread)).add(right.mulled(Math.sin(spread))).normalize();

            proj.position.copyFrom(startPos);
            proj.velocity.copyFrom(dir.mulled(this.data.projectileSpeed));
            proj.rotation = Quat.lookRotation(dir, Vec3.up());
            proj.damage = this.getDamage();
            proj.damageType = this.data.damageType;
            proj.owner = this.owner;
            proj.lifetime = 0;
            proj.maxLifetime = this.data.projectileLifetime;
            proj.pierceCount = 0;
            proj.maxPierce = this.data.projectilePierce;
            proj.homingTarget = this.data.projectileHoming ? this.findHomingTarget(proj.position, this.data.projectileHomingRange) : null;
            proj.homingStrength = this.data.projectileHomingStrength;
            proj.trailEnabled = !!this.data.projectileTrail;

            this.projectiles.push(proj);
        }
    }

    protected findHomingTarget(position: Vec3, range: number): any {
        // Find nearest enemy in range
        return null;
    }

    protected createGroundEffect(): void {
        // Create persistent area effect
        const pool = PoolManager.getInstance().get('effects') as ObjectPool<PooledEffect>;
        if (!pool) return;

        const effect = pool.get();
        effect.position.copyFrom(this.targets[0]?.position || this.owner.transform.position.added(this.owner.transform.getForward().mulled(this.data.range)));
        effect.rotation.set(0, 0, 0, 1);
        effect.scale.set(this.getRadius(), 1, this.getRadius());
        effect.lifetime = 0;
        effect.maxLifetime = this.data.activeTime;
        effect.effectType = this.data.hitEffect || 'skill_area';

        this.effects.push(effect);
    }

    protected applyToTargets(): void {
        for (const target of this.targets) {
            this.applyDamageToTarget(target);
        }
    }

    protected applyToSelf(): void {
        this.applyDamageToTarget(this.owner);
    }

    protected applyDamageToTarget(target: any): void {
        const context: DamageContext = {
            attacker: this.owner,
            target,
            baseDamage: this.getDamage(),
            skillMultiplier: 1,
            damageType: this.data.damageType,
            elementalBonus: this.data.elementalBonus,
            isCritical: Math.random() < 0.05,
            isWeakPoint: false,
            hitPoint: target.transform?.position || new Vec3(),
            hitNormal: new Vec3(0, 1, 0),
            weaponType: 'skill',
            skillId: this.data.id,
        };

        const result = DamageCalculator.calculate(context);

        // Apply damage
        target.takeDamage?.(result.finalDamage, this.owner);

        // Apply status
        if (Math.random() < this.data.statusChance) {
            for (const status of this.data.applyStatus) {
                target.applyStatus?.(status, {
                    duration: this.data.statusDuration,
                    stacks: this.data.statusStacks,
                    source: this.owner,
                });
            }
        }

        // Hit effects
        emitEvent(GameEvents.UI_HIT_EFFECT, {
            position: context.hitPoint,
            normal: context.hitNormal,
            type: this.data.hitEffect || 'skill_hit',
        });

        // Screen shake
        if (this.data.screenShake > 0) {
            const cameraShake = (globalThis as any).CameraShake?.getInstance?.();
            if (cameraShake) cameraShake.addTrauma(this.data.screenShake);
        }
    }

    protected updateProjectiles(dt: number): void {
        const pool = PoolManager.getInstance().get('projectiles') as ObjectPool<PooledProjectile>;
        if (!pool) return;

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.lifetime += dt;

            if (proj.lifetime >= proj.maxLifetime) {
                pool.release(proj);
                this.projectiles.splice(i, 1);
                continue;
            }

            // Homing
            if (proj.homingTarget && proj.homingTarget.isActive?.()) {
                const toTarget = proj.homingTarget.transform.position.subbed(proj.position).normalize();
                proj.velocity.lerp(toTarget.mulled(proj.velocity.length()), proj.homingStrength * dt);
                proj.rotation = Quat.lookRotation(proj.velocity.normalized(), Vec3.up());
            }

            // Move
            proj.position.addScaled(proj.velocity, dt);

            // Check collisions
            this.checkProjectileCollision(proj);
        }
    }

    protected checkProjectileCollision(proj: PooledProjectile): void {
        // Physics overlap check
        // On hit:
        // - Apply damage
        // - Spawn hit effect
        // - Handle pierce
        // - Release if no pierce left
    }

    cancel(): void {
        if (!this.isActive) return;

        // Clean up projectiles
        const pool = PoolManager.getInstance().get('projectiles') as ObjectPool<PooledProjectile>;
        if (pool) {
            for (const proj of this.projectiles) pool.release(proj);
        }
        this.projectiles.length = 0;

        // Clean up effects
        const effectPool = PoolManager.getInstance().get('effects') as ObjectPool<PooledEffect>;
        if (effectPool) {
            for (const effect of this.effects) effectPool.release(effect);
        }
        this.effects.length = 0;

        this.endSkill();
    }

    protected endSkill(): void {
        this.isActive = false;
        this.currentPhase = SkillPhase.STARTUP;
        this.phaseTimer = 0;
        this.targets.length = 0;
    }

    // Upgrades
    upgrade(): boolean {
        if (this.level >= this.data.maxLevel) return false;
        this.level++;
        return true;
    }

    getCooldownPercent(): number {
        return this.cooldownRemaining / this.getCooldown();
    }
}

// ============================================================
// SKILL SYSTEM MANAGER
// ============================================================

export class SkillSystem {
    private static instance: SkillSystem;
    private skills: Map<string, Skill> = new Map();
    private activeSkills: Map<string, ActiveSkillInstance> = new Map();
    private passiveSkills: Set<string> = new Set();
    private ultimateSkill: Skill | null = null;
    private globalCooldown: number = 0;

    static getInstance(): SkillSystem {
        if (!SkillSystem.instance) SkillSystem.instance = new SkillSystem();
        return SkillSystem.instance;
    }

    registerSkill(data: SkillData): Skill {
        const skill = new Skill(data);
        this.skills.set(data.id, skill);

        if (data.type === SkillType.PASSIVE) {
            this.passiveSkills.add(data.id);
        } else if (data.type === SkillType.ULTIMATE) {
            this.ultimateSkill = skill;
        }

        return skill;
    }

    getSkill(id: string): Skill | null {
        return this.skills.get(id) || null;
    }

    getUltimateSkill(): Skill | null {
        return this.ultimateSkill;
    }

    equipSkill(skillId: string, weaponSlot: number): void {
        const skill = this.skills.get(skillId);
        if (!skill) return;

        skill.data.weaponSlot = weaponSlot;
        this.activeSkills.set(skillId, {
            skill,
            cooldownRemaining: 0,
            charges: 1,
            maxCharges: 1,
            chargeRechargeTime: 0,
            level: 1,
        });
    }

    unequipSkill(skillId: string): void {
        this.activeSkills.delete(skillId);
    }

    activateSkill(skillId: string): void {
        const instance = this.activeSkills.get(skillId);
        if (instance) {
            instance.skill.isActive = true;
        }
    }

    deactivateSkill(skillId: string): void {
        const instance = this.activeSkills.get(skillId);
        if (instance) {
            instance.skill.cancel();
        }
    }

    deactivateAllWeaponSkills(): void {
        for (const instance of this.activeSkills.values()) {
            instance.skill.cancel();
        }
    }

    executeSkill(skillId: string, owner: any): boolean {
        const instance = this.activeSkills.get(skillId);
        if (!instance) return false;

        instance.skill.setOwner(owner);
        return instance.skill.execute();
    }

    tryUseSkill(skillId: string, owner: any): boolean {
        const instance = this.activeSkills.get(skillId);
        if (!instance || !instance.skill.canUse()) return false;
        return this.executeSkill(skillId, owner);
    }

    update(dt: number, owner: any): void {
        this.globalCooldown = Math.max(0, this.globalCooldown - dt);

        for (const instance of this.activeSkills.values()) {
            instance.skill.setOwner(owner);
            instance.skill.update(dt);
            instance.cooldownRemaining = instance.skill.cooldownRemaining;
        }

        // Update passive effects
        this.updatePassives(owner, dt);
    }

    private updatePassives(owner: any, dt: number): void {
        // Passive skill logic
    }

    getActiveSkillIds(): string[] {
        return Array.from(this.activeSkills.keys());
    }

    getSkillCooldown(skillId: string): number {
        const instance = this.activeSkills.get(skillId);
        return instance?.skill.cooldownRemaining || 0;
    }

    getSkillCooldownPercent(skillId: string): number {
        const instance = this.activeSkills.get(skillId);
        if (!instance) return 0;
        return instance.skill.getCooldownPercent();
    }

    // Elemental System
    private elementalReactions: Map<string, ElementalReaction> = new Map();

    registerReaction(name: string, reaction: ElementalReaction): void {
        this.elementalReactions.set(name, reaction);
    }

    tryReaction(element1: DamageType, element2: DamageType, target: any, source: any): ElementalReaction | null {
        const key = `${element1}+${element2}`;
        const altKey = `${element2}+${element1}`;
        return this.elementalReactions.get(key) || this.elementalReactions.get(altKey) || null;
    }

    // Status Effects
    applyStatus(target: any, type: StatusEffectType, data: any): void {
        // Add status to target
        target.statusEffects = target.statusEffects || new Map();
        const existing = target.statusEffects.get(type);

        if (existing && data.refreshOnHit) {
            existing.duration = data.duration;
            existing.stacks = Math.min(existing.stacks + (data.stacks || 1), data.maxStacks || 99);
        } else {
            target.statusEffects.set(type, {
                type,
                duration: data.duration,
                stacks: data.stacks || 1,
                maxStacks: data.maxStacks || 5,
                damagePerTick: data.damagePerTick || 0,
                tickInterval: data.tickInterval || 1,
                tickTimer: 0,
                source: data.source,
            });
        }

        emitEvent(GameEvents.STATUS_APPLIED, { target, type, data });
    }

    updateStatusEffects(target: any, dt: number): void {
        if (!target.statusEffects) return;

        for (const [type, status] of target.statusEffects) {
            status.duration -= dt;
            status.tickTimer -= dt;

            if (status.tickTimer <= 0 && status.damagePerTick > 0) {
                status.tickTimer = status.tickInterval;
                target.takeDamage?.(status.damagePerTick * status.stacks, status.source);
            }

            if (status.duration <= 0) {
                target.statusEffects.delete(type);
                emitEvent(GameEvents.STATUS_REMOVED, { target, type });
            }
        }
    }
}

// Elemental Reaction Definition
export interface ElementalReaction {
    name: string;
    elements: [DamageType, DamageType];
    damageMultiplier: number;
    radius: number;
    effect: string;
    applyStatus?: StatusEffectType;
    statusDuration?: number;
}

// Status Effect Data
export const StatusEffectData: Record<StatusEffectType, any> = {
    [StatusEffectType.BURN]: { tickInterval: 1, damagePerTick: 0.02, maxStacks: 5, spreadRadius: 3 },
    [StatusEffectType.FREEZE]: { tickInterval: 0, damagePerTick: 0, maxStacks: 1, root: true, shatterBonus: 2 },
    [StatusEffectType.SHOCK]: { tickInterval: 0.5, damagePerTick: 0.01, maxStacks: 3, chainRange: 4, chainCount: 3 },
    [StatusEffectType.POISON]: { tickInterval: 1, damagePerTick: 0.015, maxStacks: 10, healReduction: 0.5 },
    [StatusEffectType.BLEED]: { tickInterval: 1, damagePerTick: 0.03, maxStacks: 5, maxHpPercent: true },
    [StatusEffectType.WET]: { tickInterval: 0, damagePerTick: 0, maxStacks: 1, conductivity: 1.5, fireResist: 0.5 },
    [StatusEffectType.CHILL]: { tickInterval: 0, damagePerTick: 0, maxStacks: 3, slowPerStack: 0.15, freezeAtStacks: 3 },
    [StatusEffectType.ELECTRIFIED]: { tickInterval: 0, damagePerTick: 0, maxStacks: 1, nextHitStun: true },
    [StatusEffectType.OVERLOAD]: { tickInterval: 0, damagePerTick: 0, maxStacks: 1, explosion: true },
    [StatusEffectType.SUPERCONDUCT]: { tickInterval: 0, damagePerTick: 0, maxStacks: 1, defenseReduction: 0.4 },
    [StatusEffectType.MELT]: { tickInterval: 0, damagePerTick: 0, maxStacks: 1, damageBonus: 1.5 },
    [StatusEffectType.VAPORIZE]: { tickInterval: 0, damagePerTick: 0, maxStacks: 1, damageBonus: 2 },
    [StatusEffectType.SHATTER]: { tickInterval: 0, damagePerTick: 0, maxStacks: 1, damageBonus: 3 },
};