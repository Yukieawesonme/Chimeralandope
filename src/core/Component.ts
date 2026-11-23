// ChimeraLand - ECS Component Base
// Components are pure data containers - no logic

export abstract class Component {
    entity: Entity | null = null;
    enabled: boolean = true;
    readonly componentName: string;

    constructor(name?: string) {
        this.componentName = name || this.constructor.name;
    }

    onAttach(entity: Entity): void { this.entity = entity; }
    onDetach(): void { this.entity = null; }
    onEnable(): void {}
    onDisable(): void {}
    clone(): Component { throw new Error('Component.clone() must be implemented'); }
}

// Component type registry for fast queries
export const ComponentType = new Map<Function, number>();
let nextTypeId = 0;

export function getComponentTypeId<T extends Component>(ctor: new (...args: any[]) => T): number {
    if (!ComponentType.has(ctor)) {
        ComponentType.set(ctor, nextTypeId++);
    }
    return ComponentType.get(ctor)!;
}

// Common component interfaces
export interface ITransform {
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
}

export interface IVelocity {
    velocity: Vec3;
    angularVelocity: Vec3;
}

export interface IHealth {
    current: number;
    max: number;
    armor: number;
    poise: number;
    maxPoise: number;
    invulnerable: boolean;
    lastDamageTime: number;
}

export interface IStamina {
    current: number;
    max: number;
    regenRate: number;
    regenDelay: number;
    exhausted: boolean;
}

export interface IInput {
    move: Vec3;
    look: Vec3;
    jump: boolean;
    dash: boolean;
    attack: boolean;
    skill1: boolean;
    skill2: boolean;
    skill3: boolean;
    ultimate: boolean;
    swapWeapon: number; // -1, 0, 1, 2 for next/prev/specific
    interact: boolean;
    buildMode: boolean;
}

import { Vec3, Quat } from './MathUtils';
import { Entity } from './Entity';

// Transform Component
export class TransformComponent extends Component {
    position: Vec3 = new Vec3();
    rotation: Quat = new Quat();
    scale: Vec3 = new Vec3(1, 1, 1);
    previousPosition: Vec3 = new Vec3();
    previousRotation: Quat = new Quat();

    constructor() { super('Transform'); }

    getForward(): Vec3 { return this.rotation.rotateVec3(new Vec3(0, 0, -1)); }
    getRight(): Vec3 { return this.rotation.rotateVec3(new Vec3(1, 0, 0)); }
    getUp(): Vec3 { return this.rotation.rotateVec3(new Vec3(0, 1, 0)); }
    setFromMatrix(mat: Mat4): void {
        this.position = mat.transformPoint(new Vec3());
        // Extract rotation from matrix (simplified)
    }
    clone(): TransformComponent {
        const c = new TransformComponent();
        c.position = this.position.copy();
        c.rotation = this.rotation.copy();
        c.scale = this.scale.copy();
        return c;
    }
}

// Velocity Component
export class VelocityComponent extends Component {
    velocity: Vec3 = new Vec3();
    angularVelocity: Vec3 = new Vec3();
    terminalVelocity: number = 50;
    constructor() { super('Velocity'); }
    clone(): VelocityComponent {
        const c = new VelocityComponent();
        c.velocity = this.velocity.copy();
        c.angularVelocity = this.angularVelocity.copy();
        return c;
    }
}

// Health Component
export class HealthComponent extends Component {
    current: number = 100;
    max: number = 100;
    armor: number = 0;
    poise: number = 100;
    maxPoise: number = 100;
    invulnerable: boolean = false;
    invulnerableTimer: number = 0;
    lastDamageTime: number = -Infinity;
    regenRate: number = 0;
    regenDelay: number = 5;
    timeSinceDamage: number = 0;

    constructor(maxHealth: number = 100) {
        super('Health');
        this.max = maxHealth;
        this.current = maxHealth;
        this.maxPoise = maxHealth * 0.5;
        this.poise = this.maxPoise;
    }

    takeDamage(amount: number, ignoreArmor: boolean = false): number {
        if (this.invulnerable) return 0;
        let dmg = amount;
        if (!ignoreArmor) dmg = Math.max(1, dmg - this.armor);
        this.current = Math.max(0, this.current - dmg);
        this.lastDamageTime = Date.now() / 1000;
        this.timeSinceDamage = 0;
        return dmg;
    }

    takePoiseDamage(amount: number): number {
        this.poise = Math.max(0, this.poise - amount);
        return this.poise;
    }

    heal(amount: number): number {
        const old = this.current;
        this.current = Math.min(this.max, this.current + amount);
        return this.current - old;
    }

    restorePoise(amount: number): void {
        this.poise = Math.min(this.maxPoise, this.poise + amount);
    }

    isDead(): boolean { return this.current <= 0; }
    isPoiseBroken(): boolean { return this.poise <= 0; }
    getHealthPercent(): number { return this.current / this.max; }
    getPoisePercent(): number { return this.poise / this.maxPoise; }
    clone(): HealthComponent {
        const c = new HealthComponent(this.max);
        c.current = this.current; c.armor = this.armor;
        c.poise = this.poise; c.maxPoise = this.maxPoise;
        c.invulnerable = this.invulnerable; c.regenRate = this.regenRate;
        return c;
    }
}

// Stamina Component
export class StaminaComponent extends Component {
    current: number = 100;
    max: number = 100;
    regenRate: number = 15; // per second
    regenDelay: number = 1; // seconds after use
    exhausted: boolean = false;
    exhaustionEndTime: number = 0;
    timeSinceUse: number = 0;

    constructor(maxStamina: number = 100) {
        super('Stamina');
        this.max = maxStamina;
        this.current = maxStamina;
    }

    consume(amount: number): boolean {
        if (this.exhausted) return false;
        if (this.current < amount) return false;
        this.current -= amount;
        this.timeSinceUse = 0;
        if (this.current <= 0) {
            this.exhausted = true;
            this.exhaustionEndTime = Date.now() / 1000 + 2; // 2s exhaustion
        }
        return true;
    }

    update(dt: number): void {
        this.timeSinceUse += dt;
        if (this.exhausted) {
            if (Date.now() / 1000 >= this.exhaustionEndTime) {
                this.exhausted = false;
            }
        } else if (this.timeSinceUse >= this.regenDelay && this.current < this.max) {
            this.current = Math.min(this.max, this.current + this.regenRate * dt);
        }
    }

    canAfford(amount: number): boolean { return !this.exhausted && this.current >= amount; }
    getPercent(): number { return this.current / this.max; }
    clone(): StaminaComponent {
        const c = new StaminaComponent(this.max);
        c.current = this.current; c.regenRate = this.regenRate; c.regenDelay = this.regenDelay;
        return c;
    }
}

// Input Component
export class InputComponent extends Component {
    move: Vec3 = new Vec3();
    look: Vec3 = new Vec3();
    jump: boolean = false;
    jumpPressed: boolean = false;
    jumpReleased: boolean = false;
    dash: boolean = false;
    dashPressed: boolean = false;
    attack: boolean = false;
    attackPressed: boolean = false;
    attackHeld: boolean = false;
    attackHoldTime: number = 0;
    skill1: boolean = false;
    skill1Pressed: boolean = false;
    skill2: boolean = false;
    skill2Pressed: boolean = false;
    skill3: boolean = false;
    skill3Pressed: boolean = false;
    ultimate: boolean = false;
    ultimatePressed: boolean = false;
    swapWeapon: number = -1; // 0,1,2 for specific, -1 for none
    interact: boolean = false;
    interactPressed: boolean = false;
    buildMode: boolean = false;
    buildModePressed: boolean = false;

    constructor() { super('Input'); }

    clear(): void {
        this.move.set(0, 0, 0);
        this.look.set(0, 0, 0);
        this.jumpPressed = false;
        this.jumpReleased = false;
        this.dashPressed = false;
        this.attackPressed = false;
        this.skill1Pressed = false;
        this.skill2Pressed = false;
        this.skill3Pressed = false;
        this.ultimatePressed = false;
        this.swapWeapon = -1;
        this.interactPressed = false;
        this.buildModePressed = false;
    }

    clone(): InputComponent { return new InputComponent(); }
}

// Tag Components (marker components for queries)
export class PlayerTag extends Component { constructor() { super('PlayerTag'); } clone(): PlayerTag { return new PlayerTag(); } }
export class EnemyTag extends Component { constructor() { super('EnemyTag'); } clone(): EnemyTag { return new EnemyTag(); } }
export class PetTag extends Component { constructor() { super('PetTag'); } clone(): PetTag { return new PetTag(); } }
export class MountTag extends Component { constructor() { super('MountTag'); } clone(): MountTag { return new MountTag(); } }
export class ProjectileTag extends Component { constructor() { super('ProjectileTag'); } clone(): ProjectileTag { return new ProjectileTag(); } }
export class PickupTag extends Component { constructor() { super('PickupTag'); } clone(): PickupTag { return new PickupTag(); } }
export class BuildingPieceTag extends Component { constructor() { super('BuildingPieceTag'); } clone(): BuildingPieceTag { return new BuildingPieceTag(); } }
export class InteractableTag extends Component { constructor() { super('InteractableTag'); } clone(): InteractableTag { return new InteractableTag(); } }
export class ClimbableTag extends Component { constructor() { super('ClimbableTag'); } clone(): ClimbableTag { return new ClimbableTag(); } }
export class WaterTag extends Component { constructor() { super('WaterTag'); } clone(): WaterTag { return new WaterTag(); } }
export class ResourceNodeTag extends Component { constructor() { super('ResourceNodeTag'); } clone(): ResourceNodeTag { return new ResourceNodeTag(); } }

import { Mat4 } from './MathUtils';