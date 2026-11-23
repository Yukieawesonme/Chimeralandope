// ChimeraLand - Object Pooling System
// High-performance object pooling for zero-GC gameplay

export interface IPooledObject {
    reset(): void;
    isActive(): boolean;
    setActive(active: boolean): void;
}

export class ObjectPool<T extends IPooledObject> {
    private pool: T[] = [];
    private active: Set<T> = new Set();
    private factory: () => T;
    private maxSize: number;
    private autoExpand: boolean;

    constructor(factory: () => T, initialSize: number = 10, maxSize: number = 1000, autoExpand: boolean = true) {
        this.factory = factory;
        this.maxSize = maxSize;
        this.autoExpand = autoExpand;
        this.warmup(initialSize);
    }

    warmup(count: number): void {
        for (let i = 0; i < count; i++) {
            const obj = this.factory();
            obj.setActive(false);
            this.pool.push(obj);
        }
    }

    get(): T {
        let obj: T | undefined;

        // Try to find inactive object in pool
        while (this.pool.length > 0) {
            const candidate = this.pool.pop()!;
            if (!candidate.isActive()) {
                obj = candidate;
                break;
            }
        }

        // Create new if pool empty
        if (!obj) {
            if (this.active.size >= this.maxSize) {
                // Find oldest active object to recycle (LRU)
                let oldest: T | null = null;
                let oldestTime = Infinity;
                for (const active of this.active) {
                    if ((active as any)._spawnTime < oldestTime) {
                        oldestTime = (active as any)._spawnTime;
                        oldest = active;
                    }
                }
                if (oldest) {
                    oldest.reset();
                    oldest.setActive(false);
                    this.active.delete(oldest);
                    obj = oldest;
                } else if (this.autoExpand) {
                    obj = this.factory();
                } else {
                    throw new Error('Object pool exhausted and autoExpand is false');
                }
            } else {
                obj = this.factory();
            }
        }

        obj.setActive(true);
        (obj as any)._spawnTime = Date.now();
        this.active.add(obj);
        return obj;
    }

    release(obj: T): void {
        if (!this.active.has(obj)) return;
        obj.reset();
        obj.setActive(false);
        this.active.delete(obj);
        if (this.pool.length < this.maxSize) {
            this.pool.push(obj);
        }
    }

    releaseAll(): void {
        for (const obj of this.active) {
            obj.reset();
            obj.setActive(false);
            if (this.pool.length < this.maxSize) this.pool.push(obj);
        }
        this.active.clear();
    }

    getActiveCount(): number { return this.active.size; }
    getInactiveCount(): number { return this.pool.length; }
    getTotalCount(): number { return this.active.size + this.pool.length; }

    forEachActive(callback: (obj: T) => void): void {
        for (const obj of this.active) callback(obj);
    }

    clear(): void {
        this.pool.length = 0;
        this.active.clear();
    }
}

// Pool Manager - Central registry for all pools
export class PoolManager {
    private static instance: PoolManager;
    private pools: Map<string, ObjectPool<any>> = new Map();

    static getInstance(): PoolManager {
        if (!PoolManager.instance) PoolManager.instance = new PoolManager();
        return PoolManager.instance;
    }

    register<T extends IPooledObject>(name: string, pool: ObjectPool<T>): void {
        this.pools.set(name, pool);
    }

    get<T extends IPooledObject>(name: string): ObjectPool<T> | null {
        return this.pools.get(name) as ObjectPool<T> || null;
    }

    getOrCreate<T extends IPooledObject>(name: string, factory: () => T, initialSize: number = 10): ObjectPool<T> {
        let pool = this.pools.get(name) as ObjectPool<T>;
        if (!pool) {
            pool = new ObjectPool(factory, initialSize);
            this.pools.set(name, pool);
        }
        return pool;
    }

    releaseAll(): void {
        for (const pool of this.pools.values()) pool.releaseAll();
    }

    getStats(): object {
        const stats: any = {};
        for (const [name, pool] of this.pools) {
            stats[name] = {
                active: pool.getActiveCount(),
                inactive: pool.getInactiveCount(),
                total: pool.getTotalCount(),
            };
        }
        return stats;
    }

    clear(): void { this.pools.clear(); }
}

// Base Pooled Object Implementation
export abstract class PooledObject implements IPooledObject {
    private _active: boolean = false;
    _spawnTime: number = 0;

    isActive(): boolean { return this._active; }
    setActive(active: boolean): void { this._active = active; }
    abstract reset(): void;
}

// Specialized Pool Types

// Projectile Pool
import { Vec3, Quat } from '../core/MathUtils';
import { DamageType } from '../core/Config';

export interface ProjectileData {
    position: Vec3;
    velocity: Vec3;
    rotation: Quat;
    damage: number;
    damageType: DamageType;
    owner: any;
    lifetime: number;
    maxLifetime: number;
    pierceCount: number;
    maxPierce: number;
    homingTarget: any | null;
    homingStrength: number;
    trailEnabled: boolean;
}

export class PooledProjectile extends PooledObject implements ProjectileData {
    position: Vec3 = new Vec3();
    velocity: Vec3 = new Vec3();
    rotation: Quat = new Quat();
    damage: number = 0;
    damageType: DamageType = DamageType.PHYSICAL;
    owner: any = null;
    lifetime: number = 0;
    maxLifetime: number = 5;
    pierceCount: number = 0;
    maxPierce: number = 0;
    homingTarget: any = null;
    homingStrength: number = 0;
    trailEnabled: boolean = false;

    reset(): void {
        this.position.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.rotation.set(0, 0, 0, 1);
        this.damage = 0;
        this.damageType = DamageType.PHYSICAL;
        this.owner = null;
        this.lifetime = 0;
        this.maxLifetime = 5;
        this.pierceCount = 0;
        this.maxPierce = 0;
        this.homingTarget = null;
        this.homingStrength = 0;
        this.trailEnabled = false;
    }
}

// Effect Pool (VFX)
export interface EffectData {
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
    lifetime: number;
    maxLifetime: number;
    effectType: string;
}

export class PooledEffect extends PooledObject implements EffectData {
    position: Vec3 = new Vec3();
    rotation: Quat = new Quat();
    scale: Vec3 = new Vec3(1, 1, 1);
    lifetime: number = 0;
    maxLifetime: number = 2;
    effectType: string = '';

    reset(): void {
        this.position.set(0, 0, 0);
        this.rotation.set(0, 0, 0, 1);
        this.scale.set(1, 1, 1);
        this.lifetime = 0;
        this.maxLifetime = 2;
        this.effectType = '';
    }
}

// Damage Number Pool
export interface DamageNumberData {
    position: Vec3;
    value: number;
    type: DamageType;
    isCritical: boolean;
    lifetime: number;
    maxLifetime: number;
    velocity: Vec3;
}

export class PooledDamageNumber extends PooledObject implements DamageNumberData {
    position: Vec3 = new Vec3();
    value: number = 0;
    type: DamageType = DamageType.PHYSICAL;
    isCritical: boolean = false;
    lifetime: number = 0;
    maxLifetime: number = 1.5;
    velocity: Vec3 = new Vec3();

    reset(): void {
        this.position.set(0, 0, 0);
        this.value = 0;
        this.type = DamageType.PHYSICAL;
        this.isCritical = false;
        this.lifetime = 0;
        this.velocity.set(0, 2, 0);
    }
}

// Creature Pool
export class PooledCreature extends PooledObject {
    entity: any = null;
    creatureType: string = '';
    level: number = 1;

    reset(): void {
        this.entity = null;
        this.creatureType = '';
        this.level = 1;
    }
}

// Pickup Pool
export interface PickupData {
    position: Vec3;
    itemId: string;
    quantity: number;
    lifetime: number;
    maxLifetime: number;
    velocity: Vec3;
    magnetRange: number;
}

export class PooledPickup extends PooledObject implements PickupData {
    position: Vec3 = new Vec3();
    itemId: string = '';
    quantity: number = 1;
    lifetime: number = 0;
    maxLifetime: number = 300;
    velocity: Vec3 = new Vec3();
    magnetRange: number = 3;

    reset(): void {
        this.position.set(0, 0, 0);
        this.itemId = '';
        this.quantity = 1;
        this.lifetime = 0;
        this.velocity.set(0, 0, 0);
        this.magnetRange = 3;
    }
}

// Initialize all pools
export function initializePools(): void {
    const manager = PoolManager.getInstance();

    manager.getOrCreate('projectiles', () => new PooledProjectile(), 100);
    manager.getOrCreate('effects', () => new PooledEffect(), 50);
    manager.getOrCreate('damageNumbers', () => new PooledDamageNumber(), 30);
    manager.getOrCreate('creatures', () => new PooledCreature(), 30);
    manager.getOrCreate('pickups', () => new PooledPickup(), 20);
}