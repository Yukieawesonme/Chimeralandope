// ChimeraLand - Combat Controller
// Main combat orchestration: input -> weapon -> hitbox -> damage -> feedback

import { EventBus, GameEvents, emitEvent, onEvent } from '../core/EventBus';
import { GameConfig, DamageType, WeaponType } from '../core/Config';
import { DamageCalculator, DamageContext, DamageResult } from './DamageCalculator';
import { HitStop } from './HitStop';
import { CameraShake } from './HitStop';
import { PoiseSystem, StaggerType, StaggerImpulses } from './PoiseSystem';
import { WeaponSystem } from './WeaponSystem';
import { SkillSystem } from '../skills/SkillSystem';
import { Vec3, Quat } from '../core/MathUtils';
import { Engine } from '../core/Engine';

export class CombatController {
    private static instance: CombatController;
    player: any = null;
    weaponSystem: WeaponSystem;
    skillSystem: SkillSystem;
    damageCalculator: DamageCalculator;
    hitStop: HitStop;
    cameraShake: CameraShake;
    poiseSystem: PoiseSystem;

    // Combat state
    isInCombat: boolean = false;
    combatStartTime: number = 0;
    lastHitTime: number = 0;
    comboCounter: number = 0;
    comboTimer: number = 0;
    maxComboTime: number = 2.0;
    fury: number = 0;
    maxFury: number = GameConfig.PLAYER.FURY_MAX;

    // Targeting
    currentTarget: any = null;
    targetHistory: any[] = [];
    lockOnEnabled: boolean = false;
    lockOnRange: number = 15;

    // Hitbox tracking
    activeHitboxes: Map<string, ActiveHitbox> = new Map();
    hitboxIdCounter: number = 0;

    static getInstance(): CombatController {
        if (!CombatController.instance) CombatController.instance = new CombatController();
        return CombatController.instance;
    }

    constructor() {
        this.weaponSystem = WeaponSystem.getInstance();
        this.skillSystem = SkillSystem.getInstance();
        this.damageCalculator = new DamageCalculator();
        this.hitStop = HitStop.getInstance();
        this.cameraShake = CameraShake.getInstance();
        this.poiseSystem = PoiseSystem.getInstance();
    }

    setPlayer(player: any): void {
        this.player = player;
        this.initializePlayerCombat();
    }

    private initializePlayerCombat(): void {
        if (!this.player) return;

        // Initialize poise
        this.poiseSystem.initialize(this.player, GameConfig.PLAYER.HEALTH_MAX * 0.5);

        // Subscribe to events
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        onEvent(GameEvents.ATTACK_HIT, (data) => this.onAttackHit(data));
        onEvent(GameEvents.DAMAGE_TAKEN, (data) => this.onDamageTaken(data));
        onEvent(GameEvents.CREATURE_DIED, (data) => this.onEnemyDied(data));
        onEvent(GameEvents.SKILL_USED, (data) => this.onSkillUsed(data));
    }

    update(dt: number): void {
        if (!this.player) return;

        // Update fury
        this.updateFury(dt);

        // Update combo
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) {
                this.comboCounter = 0;
            }
        }

        // Update targeting
        this.updateTargeting();

        // Update active hitboxes
        this.updateHitboxes(dt);

        // Update hitstop
        this.hitStop.update(dt);

        // Update camera shake
        this.cameraShake.update(dt);

        // Update weapon system
        this.weaponSystem.update(dt, this.getPlayerInput());
    }

    private getPlayerInput(): any {
        return Engine.getInstance().input;
    }

    private updateFury(dt: number): void {
        // Fury decays slowly out of combat
        if (!this.isInCombat && this.fury > 0) {
            this.fury = Math.max(0, this.fury - 5 * dt);
        }

        emitEvent(GameEvents.FURY_CHANGED, { fury: this.fury, maxFury: this.maxFury });

        if (this.fury >= this.maxFury) {
            emitEvent(GameEvents.ULTIMATE_READY, {});
        }
    }

    private updateTargeting(): void {
        if (!this.player) return;

        // Find nearest enemy in range
        let nearest: any = null;
        let nearestDist = this.lockOnRange;

        // This would query the world for enemies
        // Simplified for now
    }

    // ============================================================
    // HITBOX MANAGEMENT
    // ============================================================

    spawnHitbox(data: HitboxSpawnData): string {
        const id = `hitbox_${++this.hitboxIdCounter}`;
        const hitbox: ActiveHitbox = {
            id,
            owner: data.owner,
            weapon: data.weapon,
            move: data.move,
            hitboxData: data.hitboxData,
            position: data.position.copy(),
            rotation: data.rotation.copy(),
            startTime: Date.now() / 1000,
            duration: data.move.activeFrames / 60,
            hitEntities: new Set(),
            damageMultiplier: data.hitboxData.damageMultiplier,
            knockback: data.hitboxData.knockback,
            angle: data.hitboxData.angle,
        };

        this.activeHitboxes.set(id, hitbox);
        return id;
    }

    despawnHitbox(id: string): void {
        this.activeHitboxes.delete(id);
    }

    private updateHitboxes(dt: number): void {
        const now = Date.now() / 1000;
        const toRemove: string[] = [];

        for (const [id, hitbox] of this.activeHitboxes) {
            // Update position to follow owner
            if (hitbox.owner && hitbox.owner.transform) {
                const offset = hitbox.hitboxData.offset;
                const forward = hitbox.owner.transform.getForward();
                const right = hitbox.owner.transform.getRight();
                const up = hitbox.owner.transform.getUp();

                hitbox.position.set(
                    hitbox.owner.transform.position.x +
                    forward.x * offset.z + right.x * offset.x + up.x * offset.y,
                    hitbox.owner.transform.position.y +
                    forward.y * offset.z + right.y * offset.x + up.y * offset.y,
                    hitbox.owner.transform.position.z +
                    forward.z * offset.z + right.z * offset.x + up.z * offset.y
                );
            }

            // Check expiration
            if (now - hitbox.startTime > hitbox.duration) {
                toRemove.push(id);
                continue;
            }

            // Perform collision check
            this.checkHitboxCollisions(hitbox);
        }

        for (const id of toRemove) this.despawnHitbox(id);
    }

    private checkHitboxCollisions(hitbox: ActiveHitbox): void {
        // This would integrate with physics engine
        // For now, placeholder for collision logic
        // In real implementation: physics.overlapSphere/Box/Capsule
    }

    // Called when a hitbox overlaps with a target
    registerHit(hitboxId: string, target: any, hitPoint: Vec3, hitNormal: Vec3): void {
        const hitbox = this.activeHitboxes.get(hitboxId);
        if (!hitbox) return;

        // Prevent multi-hit on same target per attack
        if (hitbox.hitEntities.has(target)) return;
        hitbox.hitEntities.add(target);

        const weapon = hitbox.weapon;
        const move = hitbox.move;
        const owner = hitbox.owner;

        // Build damage context
        const context: DamageContext = {
            attacker: owner,
            target,
            baseDamage: weapon.data.baseDamage,
            skillMultiplier: move.damageMultiplier * hitbox.damageMultiplier,
            damageType: weapon.data.elementalType || weapon.data.type === 'staff' ? DamageType.FIRE : DamageType.PHYSICAL,
            elementalBonus: weapon.data.elementalDamage / 100,
            isCritical: Math.random() < (weapon.data.criticalChance / 100),
            isWeakPoint: this.checkWeakPoint(target, hitPoint),
            hitPoint,
            hitNormal,
            weaponType: weapon.data.type,
            skillId: move.id,
        };

        // Calculate damage
        const result = this.damageCalculator.calculate(context);

        // Apply damage to target
        this.applyDamage(target, result, hitPoint, hitNormal, owner);

        // Apply poise damage
        const staggerType = this.poiseSystem.applyPoiseDamage(
            target,
            weapon.data.poiseDamage * move.poiseMultiplier * hitbox.damageMultiplier,
            hitNormal.negated(),
            hitPoint
        );

        // Apply knockback
        this.applyKnockback(target, result, hitNormal);

        // Visual/audio feedback
        this.spawnHitEffects(hitPoint, hitNormal, result, weapon.data.type);

        // Hitstop
        this.triggerHitStop(result, weapon.data.type);

        // Camera shake
        this.triggerCameraShake(result, weapon.data.type);

        // Fury gain
        this.gainFury(result.finalDamage, true);

        // Combo
        this.incrementCombo();

        // Emit hit event
        emitEvent(GameEvents.ATTACK_HIT, {
            attacker: owner,
            target,
            damage: result.finalDamage,
            hitPoint,
            hitNormal,
            isCritical: result.isCritical,
            damageType: context.damageType,
            staggerType,
        });

        // Process elemental reactions
        for (const reaction of result.elementalReactions) {
            this.processElementalReaction(reaction);
        }

        // Apply status effects
        for (const status of result.statusApplied) {
            target.applyStatus?.(status, { source: owner });
        }
    }

    private checkWeakPoint(target: any, hitPoint: Vec3): boolean {
        const weakPoints = target.weakPoints || [];
        for (const wp of weakPoints) {
            if (hitPoint.distanceTo(wp.position) < wp.radius) return true;
        }
        return false;
    }

    private applyDamage(target: any, result: DamageResult, hitPoint: Vec3, hitNormal: Vec3, source: any): void {
        const actualDamage = target.takeDamage?.(result.finalDamage, source) || result.finalDamage;

        // Spawn damage number
        emitEvent(GameEvents.UI_DAMAGE_NUMBER, {
            position: hitPoint,
            value: actualDamage,
            type: result.isCritical ? 'critical' : 'normal',
            damageType: result.isWeakPoint ? 'weakpoint' : 'normal',
        });

        emitEvent(GameEvents.DAMAGE_DEALT, {
            attacker: source,
            target,
            damage: actualDamage,
            hitPoint,
        });
    }

    private applyKnockback(target: any, result: DamageResult, hitNormal: Vec3): void {
        if (result.knockbackForce <= 0) return;

        const velocity = target.getComponent?.('Velocity');
        if (velocity) {
            const knockbackDir = hitNormal.mulled(-1);
            velocity.velocity.addScaled(knockbackDir, result.knockbackForce);
            velocity.velocity.y += result.knockbackForce * 0.3; // Upward component
        }
    }

    private spawnHitEffects(hitPoint: Vec3, hitNormal: Vec3, result: DamageResult, weaponType: WeaponType): void {
        // Hit particle effect
        const effectType = this.getHitEffectType(weaponType, result);
        emitEvent(GameEvents.UI_HIT_EFFECT, {
            position: hitPoint,
            normal: hitNormal,
            type: effectType,
            scale: result.isCritical ? 1.5 : 1,
        });
    }

    private getHitEffectType(weaponType: WeaponType, result: DamageResult): string {
        if (result.isCritical) return 'hit_critical';
        if (result.isWeakPoint) return 'hit_weakpoint';

        switch (weaponType) {
            case 'heavy': return 'hit_heavy';
            case 'sword': return 'hit_slash';
            case 'daggers': return 'hit_pierce';
            case 'bow': return 'hit_arrow';
            case 'staff': return 'hit_magic';
            default: return 'hit_default';
        }
    }

    private triggerHitStop(result: DamageResult, weaponType: WeaponType): void {
        const attacker = this.player;
        // Target would be passed in real implementation

        if (result.isCritical) {
            this.hitStop.triggerCritical(attacker, {});
        } else if (result.isWeakPoint) {
            this.hitStop.triggerHeavy(attacker, {});
        } else if (weaponType === 'heavy') {
            this.hitStop.triggerHeavy(attacker, {});
        } else if (weaponType === 'sword' || weaponType === 'polearm') {
            this.hitStop.triggerMedium(attacker, {});
        } else {
            this.hitStop.triggerLight(attacker, {});
        }
    }

    private triggerCameraShake(result: DamageResult, weaponType: WeaponType): void {
        if (result.isCritical) {
            this.cameraShake.critical();
        } else if (result.isWeakPoint) {
            this.cameraShake.heavy();
        } else if (weaponType === 'heavy') {
            this.cameraShake.heavy();
        } else if (result.finalDamage > 50) {
            this.cameraShake.medium();
        } else {
            this.cameraShake.light();
        }
    }

    private gainFury(amount: number, isDealing: boolean): void {
        const gain = isDealing ? GameConfig.PLAYER.FURY_GAIN_ON_DEAL : GameConfig.PLAYER.FURY_GAIN_ON_DAMAGE;
        this.fury = Math.min(this.maxFury, this.fury + gain);
    }

    private incrementCombo(): void {
        this.comboCounter++;
        this.comboTimer = this.maxComboTime;
    }

    private processElementalReaction(reaction: any): void {
        // Spawn reaction effect
        emitEvent(GameEvents.UI_HIT_EFFECT, {
            position: reaction.position,
            type: `reaction_${reaction.type}`,
            scale: reaction.radius / 2,
        });

        // Apply reaction damage to nearby enemies
        // This would query physics for entities in radius
    }

    // ============================================================
    // DAMAGE TAKEN
    // ============================================================

    private onDamageTaken(data: any): void {
        if (data.entity !== this.player) return;

        this.isInCombat = true;
        this.combatStartTime = Date.now() / 1000;
        this.lastHitTime = Date.now() / 1000;

        // Fury gain on taking damage
        this.gainFury(data.damage, false);

        // Check for parry
        if (this.weaponSystem.tryParry()) {
            // Parry handled in weapon
        }
    }

    private onEnemyDied(data: any): void {
        // Check if all enemies cleared
        // this.isInCombat = false; // Would check for nearby enemies
    }

    private onAttackHit(data: any): void {
        // Track for combo display
    }

    private onSkillUsed(data: any): void {
        // Skill damage handled separately
    }

    // ============================================================
    // ULTIMATE
    // ============================================================

    tryUltimate(): boolean {
        if (this.fury < this.maxFury) return false;

        this.fury = 0;
        emitEvent(GameEvents.ULTIMATE_USED, { player: this.player });

        // Trigger ultimate skill
        const ultimateSkill = this.skillSystem.getUltimateSkill();
        if (ultimateSkill) {
            this.skillSystem.executeSkill(ultimateSkill.id, this.player);
        }

        return true;
    }

    // ============================================================
    // PARRY
    // ============================================================

    onParryWindow(attacker: any, damage: number): { success: boolean; counterDamage: number } {
        const weapon = this.weaponSystem.getActiveWeapon();
        if (weapon && weapon.tryParry) {
            return weapon.onParryHit(attacker, damage);
        }
        return { success: false, counterDamage: 0 };
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    getFury(): number { return this.fury; }
    getFuryPercent(): number { return this.fury / this.maxFury; }
    getComboCount(): number { return this.comboCounter; }
    isInCombatState(): boolean { return this.isInCombat; }
    getActiveWeapon(): any { return this.weaponSystem.getActiveWeapon(); }
}

// Hitbox data structures
interface HitboxSpawnData {
    owner: any;
    weapon: any;
    move: any;
    hitboxData: any;
    position: Vec3;
    rotation: Quat;
}

interface ActiveHitbox {
    id: string;
    owner: any;
    weapon: any;
    move: any;
    hitboxData: any;
    position: Vec3;
    rotation: Quat;
    startTime: number;
    duration: number;
    hitEntities: Set<any>;
    damageMultiplier: number;
    knockback: number;
    angle: number;
}

// Extend Vec3 with negated
declare module '../core/MathUtils' {
    interface Vec3 {
        negated(): Vec3;
    }
}