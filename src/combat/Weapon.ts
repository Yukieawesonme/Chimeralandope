// ChimeraLand - Weapon System
// Base weapon class and all 5 weapon archetypes with unique mechanics

import { Vec3, Quat } from '../core/MathUtils';
import { EventBus, GameEvents, emitEvent } from '../core/EventBus';
import { GameConfig, DamageType, WeaponType, WeaponSlot } from '../core/Config';
import { DamageCalculator, DamageContext } from './DamageCalculator';
import { HitStop } from './HitStop';
import { CameraShake } from './HitStop';
import { PoiseSystem, StaggerType } from './PoiseSystem';
import { Skill, SkillSystem } from '../skills/SkillSystem';

export interface WeaponData {
    id: string;
    name: string;
    type: WeaponType;
    slot: WeaponSlot;
    baseDamage: number;
    attackSpeed: number;
    range: number;
    staminaCost: number;
    poiseDamage: number;
    knockback: number;
    criticalChance: number;
    criticalMultiplier: number;
    elementalType: DamageType;
    elementalDamage: number;
    moveset: AttackMove[];
    switchAttack: AttackMove;
    uniqueMechanic: WeaponMechanic;
}

export interface AttackMove {
    id: string;
    name: string;
    damageMultiplier: number;
    poiseMultiplier: number;
    startupFrames: number;
    activeFrames: number;
    recoveryFrames: number;
    hitboxCount: number;
    hitboxes: HitboxData[];
    movementImpulse: Vec3;
    canCancelInto: string[];
    animation: string;
    soundEffect: string;
    effects: string[];
}

export interface HitboxData {
    offset: Vec3;
    size: Vec3;
    shape: 'sphere' | 'box' | 'capsule';
    damageMultiplier: number;
    angle: number;
    knockback: number;
}

export interface WeaponMechanic {
    type: string;
    data: any;
}

// Parry Mechanic (Sword)
export interface ParryMechanic {
    window: number;
    staminaRestore: number;
    counterWindow: number;
    counterDamageMultiplier: number;
    perfectParryBonus: number;
}

// Charge Mechanic (Heavy)
export interface ChargeMechanic {
    levels: ChargeLevel[];
    maxChargeTime: number;
    holdStaminaCost: number;
    releaseWindow: number;
}

export interface ChargeLevel {
    level: number;
    minChargeTime: number;
    damageMultiplier: number;
    radiusMultiplier: number;
    poiseMultiplier: number;
    superArmor: boolean;
    effect: string;
}

// Aim Mechanic (Bow)
export interface AimMechanic {
    zoomFOV: number;
    zoomSpeed: number;
    holdStaminaCost: number;
    maxHoldTime: number;
    chargeLevels: BowChargeLevel[];
    weakpointMultiplier: number;
}

export interface BowChargeLevel {
    level: number;
    minHoldTime: number;
    damageMultiplier: number;
    velocityMultiplier: number;
    pierceCount: number;
    effect: string;
}

// Channel Mechanic (Staff)
export interface ChannelMechanic {
    channelTime: number;
    tickRate: number;
    manaCostPerTick: number;
    areaRadius: number;
    elementalAura: DamageType;
    auraDamagePerTick: number;
    comboElements: DamageType[];
}

// Bleed Mechanic (Daggers)
export interface BleedMechanic {
    stacksPerHit: number;
    maxStacks: number;
    tickInterval: number;
    damagePerStack: number; // % of max HP
    duration: number;
    refreshOnHit: boolean;
}

// Base Weapon Class
export abstract class Weapon {
    data: WeaponData;
    owner: any = null;
    currentMoveIndex: number = 0;
    comboCount: number = 0;
    lastAttackTime: number = 0;
    isAttacking: boolean = false;
    attackState: 'startup' | 'active' | 'recovery' | 'idle' = 'idle';
    attackTimer: number = 0;
    currentMove: AttackMove | null = null;
    hitEntitiesThisAttack: Set<any> = new Set();
    chargeLevel: number = 0;
    chargeTime: number = 0;
    isCharging: boolean = false;
    isAiming: boolean = false;
    aimTime: number = 0;
    bleedStacks: Map<any, number> = new Map();
    parryWindow: number = 0;
    lastWeaponSwitchTime: number = 0;

    constructor(data: WeaponData) {
        this.data = data;
    }

    setOwner(owner: any): void { this.owner = owner; }

    // Main attack input
    tryAttack(moveId?: string): boolean {
        if (!this.canAttack()) return false;

        const move = moveId ? this.data.moveset.find(m => m.id === moveId) : this.getNextMove();
        if (!move) return false;

        this.startAttack(move);
        return true;
    }

    protected canAttack(): boolean {
        if (!this.owner) return false;
        if (this.isAttacking && this.attackState !== 'recovery') return false;
        if (this.attackState === 'recovery' && this.attackTimer > 0) return false;

        // Check stamina
        const stamina = this.owner.getComponent?.('Stamina');
        if (stamina && !stamina.canAfford(this.data.staminaCost)) return false;

        return true;
    }

    protected getNextMove(): AttackMove | null {
        if (this.comboCount >= this.data.moveset.length) this.comboCount = 0;
        return this.data.moveset[this.comboCount] || null;
    }

    protected startAttack(move: AttackMove): void {
        this.currentMove = move;
        this.attackState = 'startup';
        this.attackTimer = move.startupFrames / 60;
        this.isAttacking = true;
        this.comboCount++;
        this.hitEntitiesThisAttack.clear();
        this.lastAttackTime = Date.now() / 1000;

        // Consume stamina
        const stamina = this.owner.getComponent?.('Stamina');
        if (stamina) stamina.consume(this.data.staminaCost);

        // Trigger weapon-specific mechanic on startup
        this.onAttackStartup(move);

        emitEvent(GameEvents.ATTACK_STARTED, {
            attacker: this.owner,
            weapon: this,
            move: move.id,
            comboCount: this.comboCount
        });
    }

    protected onAttackStartup(move: AttackMove): void {
        // Override in subclasses
    }

    // Update attack state machine
    update(dt: number): void {
        if (!this.isAttacking) return;

        this.attackTimer -= dt;

        switch (this.attackState) {
            case 'startup':
                if (this.attackTimer <= 0) {
                    this.attackState = 'active';
                    this.attackTimer = this.currentMove!.activeFrames / 60;
                    this.onAttackActive();
                }
                break;

            case 'active':
                this.updateHitboxes();
                if (this.attackTimer <= 0) {
                    this.attackState = 'recovery';
                    this.attackTimer = this.currentMove!.recoveryFrames / 60;
                    this.onAttackRecovery();
                }
                break;

            case 'recovery':
                if (this.attackTimer <= 0) {
                    this.endAttack();
                }
                break;
        }

        // Update weapon-specific mechanics
        this.updateMechanic(dt);
    }

    protected onAttackActive(): void {
        // Spawn hitboxes
        this.spawnHitboxes();
    }

    protected onAttackRecovery(): void {
        // Can be cancelled by weapon switch or dodge
    }

    protected endAttack(): void {
        this.isAttacking = false;
        this.attackState = 'idle';
        this.currentMove = null;
        this.attackTimer = 0;
        this.onAttackEnded();
    }

    protected onAttackEnded(): void {}

    protected spawnHitboxes(): void {
        if (!this.currentMove || !this.owner) return;

        // Hitbox spawning would integrate with physics/hitbox system
        // This is a placeholder for the actual implementation
    }

    protected updateHitboxes(): void {
        // Update active hitboxes position/rotation
    }

    // Weapon Switch Cancel - called when switching to this weapon during recovery
    onSwitchCancel(previousWeapon: Weapon): void {
        this.lastWeaponSwitchTime = Date.now() / 1000;

        // Execute switch attack immediately
        if (this.data.switchAttack) {
            this.startAttack(this.data.switchAttack);
        }
    }

    // Parry attempt (Sword)
    tryParry(): boolean {
        return false; // Override in Sword
    }

    // Charge attack (Heavy)
    startCharge(): boolean { return false; }
    updateCharge(dt: number): void {}
    releaseCharge(): void {}

    // Aim (Bow)
    startAim(): void {}
    updateAim(dt: number): void {}
    stopAim(): void {}
    fireArrow(chargeLevel: number): void {}

    // Channel (Staff)
    startChannel(): void {}
    updateChannel(dt: number): void {}
    stopChannel(): void {}

    // Bleed (Daggers)
    applyBleed(target: any): void {}

    // Mechanic update
    protected updateMechanic(dt: number): void {}

    // Getters
    getData(): WeaponData { return this.data; }
    getType(): WeaponType { return this.data.type; }
    getSlot(): WeaponSlot { return this.data.slot; }
    getRange(): number { return this.data.range; }
    getBaseDamage(): number { return this.data.baseDamage; }
    isBusy(): boolean { return this.isAttacking && this.attackState !== 'recovery'; }
    canSwitchCancel(): boolean { return this.attackState === 'recovery'; }
}

// ============================================================
// SWORD / KATANA - Parry Mechanic
// ============================================================
export class SwordWeapon extends Weapon {
    private parryActive: boolean = false;
    private parryTimer: number = 0;
    private parryMechanic: ParryMechanic;

    constructor(data: WeaponData) {
        super(data);
        this.parryMechanic = data.uniqueMechanic as ParryMechanic;
    }

    protected onAttackStartup(move: AttackMove): void {
        // Sword has fast startup, can chain quickly
    }

    tryParry(): boolean {
        if (this.parryActive) return false;

        this.parryActive = true;
        this.parryTimer = this.parryMechanic.window;
        return true;
    }

    protected updateMechanic(dt: number): void {
        if (this.parryActive) {
            this.parryTimer -= dt;
            if (this.parryTimer <= 0) {
                this.parryActive = false;
            }
        }
    }

    // Called when hit during parry window
    onParryHit(attacker: any, damage: number): { success: boolean; counterDamage: number } {
        if (!this.parryActive) return { success: false, counterDamage: 0 };

        const isPerfect = this.parryTimer > this.parryMechanic.window * 0.5;
        const stamina = this.owner.getComponent?.('Stamina');
        if (stamina) stamina.current = Math.min(stamina.max, stamina.current + this.parryMechanic.staminaRestore);

        this.parryActive = false;

        // Trigger counter attack
        const counterDamage = damage * this.parryMechanic.counterDamageMultiplier * (isPerfect ? this.parryMechanic.perfectParryBonus : 1);

        // Apply hitstop for parry
        HitStop.getInstance().triggerHeavy(this.owner, attacker);
        CameraShake.getInstance().heavy();

        emitEvent(GameEvents.ATTACK_PARRIED, {
            defender: this.owner,
            attacker,
            perfect: isPerfect,
            counterDamage
        });

        return { success: true, counterDamage };
    }
}

// ============================================================
// HEAVY WEAPON (Hammer/Axe) - Charge Mechanic
// ============================================================
export class HeavyWeapon extends Weapon {
    private chargeMechanic: ChargeMechanic;
    private superArmorActive: boolean = false;

    constructor(data: WeaponData) {
        super(data);
        this.chargeMechanic = data.uniqueMechanic as ChargeMechanic;
    }

    startCharge(): boolean {
        if (this.isCharging || this.isAttacking) return false;

        this.isCharging = true;
        this.chargeTime = 0;
        this.chargeLevel = 0;
        return true;
    }

    updateCharge(dt: number): void {
        if (!this.isCharging) return;

        this.chargeTime += dt;

        // Check charge levels
        for (const level of this.chargeMechanic.levels) {
            if (this.chargeTime >= level.minChargeTime && level.level > this.chargeLevel) {
                this.chargeLevel = level.level;
                this.onChargeLevelUp(level);
            }
        }

        // Consume stamina while charging
        const stamina = this.owner.getComponent?.('Stamina');
        if (stamina) {
            stamina.consume(this.chargeMechanic.holdStaminaCost * dt);
            if (stamina.current <= 0) {
                this.releaseCharge();
            }
        }

        // Max charge time reached
        if (this.chargeTime >= this.chargeMechanic.maxChargeTime) {
            this.releaseCharge();
        }
    }

    releaseCharge(): void {
        if (!this.isCharging) return;

        const levelData = this.chargeMechanic.levels.find(l => l.level === this.chargeLevel);
        if (levelData) {
            this.executeChargedAttack(levelData);
        }

        this.isCharging = false;
        this.chargeTime = 0;
        this.chargeLevel = 0;
        this.superArmorActive = false;
    }

    protected onChargeLevelUp(level: ChargeLevel): void {
        if (level.superArmor) this.superArmorActive = true;
        // Visual/audio feedback for charge level
    }

    private executeChargedAttack(level: ChargeLevel): void {
        // Create a powerful attack with level multipliers
        const move: AttackMove = {
            id: `charge_${level.level}`,
            name: `Charged Attack Lv${level.level}`,
            damageMultiplier: level.damageMultiplier,
            poiseMultiplier: level.poiseMultiplier,
            startupFrames: 10,
            activeFrames: 8,
            recoveryFrames: 30,
            hitboxCount: 1,
            hitboxes: [{
                offset: new Vec3(0, 1, 2),
                size: new Vec3(3 * level.radiusMultiplier, 2, 3 * level.radiusMultiplier),
                shape: 'sphere',
                damageMultiplier: 1,
                angle: 0,
                knockback: 15 * level.damageMultiplier,
            }],
            movementImpulse: new Vec3(0, 0, 5),
            canCancelInto: [],
            animation: `heavy_charge_${level.level}`,
            soundEffect: 'heavy_impact',
            effects: [level.effect],
        };

        this.startAttack(move);
    }

    protected updateMechanic(dt: number): void {
        // Super armor prevents stagger during charge
    }

    isSuperArmorActive(): boolean { return this.superArmorActive; }
}

// ============================================================
// BOW / CROSSBOW - Aim Mechanic
// ============================================================
export class BowWeapon extends Weapon {
    private aimMechanic: AimMechanic;
    private currentChargeLevel: number = 0;

    constructor(data: WeaponData) {
        super(data);
        this.aimMechanic = data.uniqueMechanic as AimMechanic;
    }

    startAim(): void {
        if (this.isAiming) return;
        this.isAiming = true;
        this.aimTime = 0;
        this.currentChargeLevel = 0;
        // Trigger camera zoom
    }

    updateAim(dt: number): void {
        if (!this.isAiming) return;

        this.aimTime += dt;

        // Consume stamina
        const stamina = this.owner.getComponent?.('Stamina');
        if (stamina) {
            stamina.consume(this.aimMechanic.holdStaminaCost * dt);
            if (stamina.current <= 0) this.stopAim();
        }

        // Update charge level
        for (const level of this.aimMechanic.chargeLevels) {
            if (this.aimTime >= level.minHoldTime && level.level > this.currentChargeLevel) {
                this.currentChargeLevel = level.level;
            }
        }

        // Max hold time
        if (this.aimTime >= this.aimMechanic.maxHoldTime) {
            this.fireArrow(this.currentChargeLevel);
        }
    }

    stopAim(): void {
        if (!this.isAiming) return;
        const wasCharging = this.currentChargeLevel > 0;
        this.isAiming = false;
        this.aimTime = 0;

        if (wasCharging) {
            this.fireArrow(this.currentChargeLevel);
        }
        this.currentChargeLevel = 0;
    }

    fireArrow(chargeLevel: number): void {
        const levelData = this.aimMechanic.chargeLevels.find(l => l.level === chargeLevel) || this.aimMechanic.chargeLevels[0];

        // Spawn projectile with charge properties
        const projectileData = {
            damage: this.data.baseDamage * levelData.damageMultiplier,
            velocity: 50 * levelData.velocityMultiplier,
            pierce: levelData.pierceCount,
            damageType: this.data.elementalType,
            weakpointMultiplier: this.aimMechanic.weakpointMultiplier,
            effect: levelData.effect,
        };

        // Projectile spawn would go through projectile pool
        emitEvent(GameEvents.ATTACK_HIT, {
            weapon: this,
            projectile: projectileData,
            chargeLevel
        });
    }

    // Weak point detection
    checkWeakPoint(target: any, hitPoint: Vec3): boolean {
        // Check if hit point matches target's weak point
        const weakPoints = target.weakPoints || [];
        for (const wp of weakPoints) {
            if (hitPoint.distanceTo(wp.position) < wp.radius) return true;
        }
        return false;
    }
}

// ============================================================
// STAFF / ORB - Channel Mechanic
// ============================================================
export class StaffWeapon extends Weapon {
    private channelMechanic: ChannelMechanic;
    private channeling: boolean = false;
    private channelTimer: number = 0;
    private tickTimer: number = 0;
    private activeZones: Map<string, any> = new Map();

    constructor(data: WeaponData) {
        super(data);
        this.channelMechanic = data.uniqueMechanic as ChannelMechanic;
    }

    startChannel(): void {
        if (this.channeling) return;

        const stamina = this.owner.getComponent?.('Stamina');
        if (!stamina || !stamina.canAfford(this.channelMechanic.manaCostPerTick)) return;

        this.channeling = true;
        this.channelTimer = this.channelMechanic.channelTime;
        this.tickTimer = 0;
    }

    updateChannel(dt: number): void {
        if (!this.channeling) return;

        this.channelTimer -= dt;
        this.tickTimer -= dt;

        // Consume mana/stamina per tick
        if (this.tickTimer <= 0) {
            this.tickTimer = 1 / this.channelMechanic.tickRate;

            const stamina = this.owner.getComponent?.('Stamina');
            if (stamina && stamina.consume(this.channelMechanic.manaCostPerTick)) {
                this.channelTick();
            } else {
                this.stopChannel();
            }
        }

        if (this.channelTimer <= 0) {
            this.stopChannel();
        }
    }

    stopChannel(): void {
        this.channeling = false;
        this.channelTimer = 0;
        this.tickTimer = 0;
    }

    private channelTick(): void {
        // Create elemental zone at target location
        const zoneId = `zone_${Date.now()}`;
        const zone = {
            id: zoneId,
            position: this.getTargetPosition(),
            radius: this.channelMechanic.areaRadius,
            elementalType: this.channelMechanic.elementalAura,
            damagePerTick: this.channelMechanic.auraDamagePerTick,
            ticksRemaining: this.channelMechanic.channelTime * this.channelMechanic.tickRate,
            comboElements: this.channelMechanic.comboElements,
        };

        this.activeZones.set(zoneId, zone);

        // Apply elemental status to enemies in zone
        this.applyZoneEffects(zone);
    }

    private getTargetPosition(): Vec3 {
        // Get position from aim/cursor
        return this.owner.transform.position.added(this.owner.transform.getForward().mulled(10));
    }

    private applyZoneEffects(zone: any): void {
        // Find enemies in radius and apply status
    }

    // Elemental combo reactions
    tryElementalCombo(target: any, incomingElement: DamageType): boolean {
        const existingStatuses = target.getActiveStatuses?.() || [];

        for (const comboElement of this.channelMechanic.comboElements) {
            if (existingStatuses.includes(comboElement) && incomingElement !== comboElement) {
                // Trigger elemental reaction
                this.triggerReaction(target, incomingElement, comboElement);
                return true;
            }
        }
        return false;
    }

    private triggerReaction(target: any, element1: DamageType, element2: DamageType): void {
        // Reaction logic handled by DamageCalculator
    }
}

// ============================================================
// DAGGERS / CLAWS - Bleed Mechanic
// ============================================================
export class DaggersWeapon extends Weapon {
    private bleedMechanic: BleedMechanic;

    constructor(data: WeaponData) {
        super(data);
        this.bleedMechanic = data.uniqueMechanic as BleedMechanic;
    }

    applyBleed(target: any): void {
        const currentStacks = this.bleedStacks.get(target) || 0;
        const newStacks = Math.min(this.bleedMechanic.maxStacks, currentStacks + this.bleedMechanic.stacksPerHit);
        this.bleedStacks.set(target, newStacks);

        // Apply bleed status effect
        target.applyStatus?.('bleed', {
            stacks: newStacks,
            damagePerStack: this.bleedMechanic.damagePerStack,
            tickInterval: this.bleedMechanic.tickInterval,
            duration: this.bleedMechanic.duration,
        });

        // Check for max stacks burst
        if (newStacks >= this.bleedMechanic.maxStacks) {
            this.triggerBleedBurst(target);
        }
    }

    private triggerBleedBurst(target: any): void {
        // Bonus damage when max stacks reached
        const maxHealth = target.getMaxHealth?.() || 100;
        const burstDamage = maxHealth * this.bleedMechanic.damagePerStack * this.bleedMechanic.maxStacks;

        target.takeDamage(burstDamage, this.owner, DamageType.BLEED);

        // Reset stacks after burst
        this.bleedStacks.set(target, 0);
    }

    // Daggers have fastest attack recovery for switch cancels
    protected onAttackRecovery(): void {
        super.onAttackRecovery();
        // Daggers can cancel recovery earlier
        this.attackTimer *= 0.5;
    }
}

// ============================================================
// Weapon Factory
// ============================================================
export class WeaponFactory {
    static create(data: WeaponData): Weapon {
        switch (data.type) {
            case WeaponType.SWORD:
                return new SwordWeapon(data);
            case WeaponType.HEAVY:
                return new HeavyWeapon(data);
            case WeaponType.BOW:
                return new BowWeapon(data);
            case WeaponType.STAFF:
                return new StaffWeapon(data);
            case WeaponType.DAGGERS:
                return new DaggersWeapon(data);
            default:
                return new Weapon(data) as any;
        }
    }

    static createFromConfig(config: any): Weapon {
        // Load from JSON config
        return this.create(config);
    }
}