// ChimeraLand - Creature AI System
// Behavior Tree / FSM for creatures with destructible parts, capture, and mutation

import { EventBus, GameEvents, emitEvent, onEvent } from '../core/EventBus';
import { GameConfig, CreatureState, BiomeType, DamageType } from '../core/Config';
import { Vec3, Quat } from '../core/MathUtils';
import { DamageCalculator, DamageContext } from '../combat/DamageCalculator';
import { PoiseSystem, StaggerType } from '../combat/PoiseSystem';
import { ObjectPool, PooledCreature, PoolManager } from '../pooling/ObjectPool';

export interface CreatureData {
    id: string;
    name: string;
    biome: BiomeType[];
    level: number;
    baseHP: number;
    baseDamage: number;
    baseDefense: number;
    basePoise: number;
    moveSpeed: number;
    attackRange: number;
    aggroRange: number;
    leashRange: number;
    patrolRadius: number;
    size: 'small' | 'medium' | 'large' | 'colossal';
    anatomy: CreatureAnatomy;
    attacks: CreatureAttack[];
    skills: string[];
    lootTable: LootEntry[];
    captureDifficulty: number;
    mutationParts: MutationPart[];
    isBoss: boolean;
    isRare: boolean;
    spawnWeight: number;
    timeOfDay: 'day' | 'night' | 'any';
}

export interface CreatureAnatomy {
    bodyParts: BodyPartData[];
    sockets: MutationSocket[];
    movementType: 'ground' | 'flying' | 'swimming' | 'amphibious';
    canClimb: boolean;
    canSwim: boolean;
}

export interface BodyPartData {
    id: string;
    name: string;
    boneName: string;
    hpMultiplier: number;
    armorMultiplier: number;
    isVital: boolean;
    isWeakPoint: boolean;
    destroyEffect: string;
    destroyLoot: LootEntry[];
    staggerOnDestroy: StaggerType;
    skillsUnlocked: string[]; // Skills player gets if mutates this part
}

export interface MutationSocket {
    id: string;
    boneName: string;
    type: 'head' | 'back' | 'tail' | 'limb_front' | 'limb_rear' | 'wing' | 'horn' | 'custom';
    compatibleParts: string[]; // Body part IDs that can attach here
    offset: Vec3;
    rotation: Quat;
}

export interface CreatureAttack {
    id: string;
    name: string;
    damageMultiplier: number;
    range: number;
    angle: number;
    startupTime: number;
    activeTime: number;
    recoveryTime: number;
    poiseDamage: number;
    knockback: number,
    hitboxCount: number;
    hitboxes: any[];
    animation: string;
    effects: string[];
    cooldown: number;
    minDistance: number;
    maxDistance: number;
    requiresTarget: boolean;
}

export interface LootEntry {
    itemId: string;
    minQuantity: number;
    maxQuantity: number;
    chance: number;
    condition?: string;
}

export interface MutationPart {
    sourceCreatureId: string;
    bodyPartId: string;
    targetSocket: string;
    chance: number;
    isRare: boolean;
    statBonuses: Partial<CreatureStats>;
    unlockedSkills: string[];
    visualMesh: string;
}

export interface CreatureStats {
    hp: number;
    damage: number;
    defense: number;
    poise: number;
    speed: number;
    stamina: number;
    elementalResist: Record<DamageType, number>;
}

export class Creature {
    data: CreatureData;
    entity: any = null;
    level: number = 1;

    // Runtime stats
    stats: CreatureStats;
    currentHP: number;
    currentPoise: number;
    currentStamina: number;

    // AI
    state: CreatureState = CreatureState.PATROL;
    stateTimer: number = 0;
    blackboard: CreatureBlackboard = new CreatureBlackboard();

    // Body parts
    bodyParts: Map<string, BodyPart> = new Map();
    destroyedParts: Set<string> = new Set();

    // Combat
    target: any = null;
    lastAttackTime: number = 0;
    attackCooldowns: Map<string, number> = new Map();
    isEnraged: boolean = false;

    // Capture
    isWeakened: boolean = false;
    captureProgress: number = 0;
    isCaptured: boolean = false;

    // Pet/Mount
    isPet: boolean = false;
    owner: any = null;
    petCommand: 'follow' | 'attack' | 'stay' | 'mount' = 'follow';
    mutationParts: MutationPart[] = [];

    constructor(data: CreatureData, level: number = 1) {
        this.data = data;
        this.level = level;
        this.initializeStats();
        this.initializeBodyParts();
    }

    private initializeStats(): void {
        const mult = 1 + (this.level - 1) * 0.15;
        this.stats = {
            hp: Math.floor(this.data.baseHP * mult),
            damage: Math.floor(this.data.baseDamage * mult),
            defense: Math.floor(this.data.baseDefense * mult),
            poise: Math.floor(this.data.basePoise * mult),
            speed: this.data.moveSpeed,
            stamina: 100,
            elementalResist: {} as any,
        };
        for (const dt of Object.values(DamageType)) {
            this.stats.elementalResist[dt] = 0;
        }
        this.currentHP = this.stats.hp;
        this.currentPoise = this.stats.poise;
        this.currentStamina = this.stats.stamina;
    }

    private initializeBodyParts(): void {
        for (const partData of this.data.anatomy.bodyParts) {
            const part: BodyPart = {
                data: partData,
                currentHP: Math.floor(this.stats.hp * partData.hpMultiplier),
                maxHP: Math.floor(this.stats.hp * partData.hpMultiplier),
                isDestroyed: false,
            };
            this.bodyParts.set(partData.id, part);
        }
    }

    // AI Update
    update(dt: number, world: any): void {
        this.updateCooldowns(dt);
        this.updateState(dt, world);
        this.updateBodyParts(dt);

        // Pet behavior
        if (this.isPet && this.owner) {
            this.updatePetBehavior(dt);
        }
    }

    private updateCooldowns(dt: number): void {
        for (const [id, cd] of this.attackCooldowns) {
            this.attackCooldowns.set(id, Math.max(0, cd - dt));
        }
    }

    private updateState(dt: number, world: any): void {
        this.stateTimer += dt;

        switch (this.state) {
            case CreatureState.PATROL:
                this.updatePatrol(dt, world);
                break;
            case CreatureState.ALERT:
                this.updateAlert(dt, world);
                break;
            case CreatureState.CHASE:
                this.updateChase(dt, world);
                break;
            case CreatureState.COMBAT:
                this.updateCombat(dt, world);
                break;
            case CreatureState.FLEE:
                this.updateFlee(dt, world);
                break;
            case CreatureState.ENRAGED:
                this.updateEnraged(dt, world);
                break;
            case CreatureState.WEAKENED:
                this.updateWeakened(dt);
                break;
        }
    }

    private updatePatrol(dt: number, world: any): void {
        // Check for player detection
        const player = world.getPlayer?.();
        if (player) {
            const dist = this.entity.transform.position.distanceTo(player.transform.position);
            if (dist <= this.data.aggroRange && this.canSeePlayer(player)) {
                this.transitionTo(CreatureState.ALERT);
                return;
            }
        }

        // Patrol logic
        if (this.stateTimer > 3 + Math.random() * 5) {
            this.pickNewPatrolPoint();
            this.stateTimer = 0;
        }
    }

    private updateAlert(dt: number, world: any): void {
        const player = world.getPlayer?.();
        if (!player) {
            this.transitionTo(CreatureState.PATROL);
            return;
        }

        const dist = this.entity.transform.position.distanceTo(player.transform.position);

        if (dist > this.data.leashRange) {
            this.transitionTo(CreatureState.PATROL);
            return;
        }

        if (dist <= this.data.attackRange) {
            this.transitionTo(CreatureState.COMBAT);
            return;
        }

        this.transitionTo(CreatureState.CHASE);
    }

    private updateChase(dt: number, world: any): void {
        const player = world.getPlayer?.();
        if (!player) {
            this.transitionTo(CreatureState.PATROL);
            return;
        }

        const dist = this.entity.transform.position.distanceTo(player.transform.position);

        if (dist > this.data.leashRange) {
            this.transitionTo(CreatureState.PATROL);
            return;
        }

        if (dist <= this.data.attackRange) {
            this.transitionTo(CreatureState.COMBAT);
            return;
        }

        // Move towards player
        this.moveTowards(player.transform.position);
    }

    private updateCombat(dt: number, world: any): void {
        const player = world.getPlayer?.();
        if (!player) {
            this.transitionTo(CreatureState.PATROL);
            return;
        }

        const dist = this.entity.transform.position.distanceTo(player.transform.position);

        if (dist > this.data.leashRange) {
            this.transitionTo(CreatureState.PATROL);
            return;
        }

        // Select and execute attack
        this.selectAttack(player);

        // Check for enrage
        if (!this.isEnraged && this.currentHP / this.stats.hp < 0.25) {
            this.transitionTo(CreatureState.ENRAGED);
        }

        // Check for weakened (capturable)
        if (!this.isWeakened && this.currentHP / this.stats.hp <= GameConfig.CREATURES.CAPTURE_HP_THRESHOLD) {
            this.transitionTo(CreatureState.WEAKENED);
        }
    }

    private updateEnraged(dt: number, world: any): void {
        // Enraged: faster, more damage, new attacks
        this.stats.damage = Math.floor(this.data.baseDamage * 1.5);
        this.stats.speed = this.data.moveSpeed * 1.3;

        const player = world.getPlayer?.();
        if (!player) {
            this.transitionTo(CreatureState.PATROL);
            return;
        }

        const dist = this.entity.transform.position.distanceTo(player.transform.position);
        if (dist > this.data.leashRange * 1.5) {
            this.transitionTo(CreatureState.PATROL);
        }
    }

    private updateWeakened(dt: number): void {
        // Weakened state - can be captured
        this.isWeakened = true;
        // Slower, less damage
        this.stats.speed *= 0.5;
        this.stats.damage = Math.floor(this.stats.damage * 0.5);
    }

    private updateFlee(dt: number, world: any): void {
        // Run away from threat
        const player = world.getPlayer?.();
        if (player) {
            this.moveAwayFrom(player.transform.position);
        }

        if (this.stateTimer > 10) {
            this.transitionTo(CreatureState.PATROL);
        }
    }

    private transitionTo(newState: CreatureState): void {
        this.state = newState;
        this.stateTimer = 0;
        emitEvent(GameEvents.CREATURE_DAMAGED, { creature: this, newState });
    }

    private canSeePlayer(player: any): boolean {
        // Line of sight check
        return true; // Simplified
    }

    private pickNewPatrolPoint(): void {
        const center = this.blackboard.patrolCenter || this.entity.transform.position;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * this.data.patrolRadius;
        this.blackboard.moveTarget = new Vec3(
            center.x + Math.cos(angle) * radius,
            center.y,
            center.z + Math.sin(angle) * radius
        );
    }

    private moveTowards(target: Vec3): void {
        this.blackboard.moveTarget = target.copy();
    }

    private moveAwayFrom(target: Vec3): void {
        const dir = this.entity.transform.position.subbed(target).normalize();
        this.blackboard.moveTarget = this.entity.transform.position.added(dir.mulled(20));
    }

    private selectAttack(target: any): void {
        const availableAttacks = this.data.attacks.filter(atk => {
            const cd = this.attackCooldowns.get(atk.id) || 0;
            if (cd > 0) return false;
            const dist = this.entity.transform.position.distanceTo(target.transform.position);
            return dist >= atk.minDistance && dist <= atk.maxDistance;
        });

        if (availableAttacks.length === 0) return;

        // Weighted random selection
        const attack = availableAttacks[Math.floor(Math.random() * availableAttacks.length)];
        this.executeAttack(attack, target);
    }

    private executeAttack(attack: CreatureAttack, target: any): void {
        this.attackCooldowns.set(attack.id, attack.cooldown);
        this.lastAttackTime = Date.now() / 1000;

        // Spawn hitboxes, apply damage after startup
        setTimeout(() => {
            this.applyAttackDamage(attack, target);
        }, attack.startupTime * 1000);
    }

    private applyAttackDamage(attack: CreatureAttack, target: any): void {
        const context: DamageContext = {
            attacker: this.entity,
            target: target,
            baseDamage: this.stats.damage,
            skillMultiplier: attack.damageMultiplier,
            damageType: DamageType.PHYSICAL,
            elementalBonus: 0,
            isCritical: false,
            isWeakPoint: false,
            hitPoint: target.transform.position,
            hitNormal: new Vec3(0, 1, 0),
            weaponType: 'creature',
            skillId: attack.id,
        };

        const result = DamageCalculator.calculate(context);
        target.takeDamage?.(result.finalDamage, this.entity);

        // Poise damage
        PoiseSystem.getInstance().applyPoiseDamage(target, attack.poiseDamage, new Vec3(), target.transform.position);
    }

    private updateBodyParts(dt: number): void {
        // Regenerate body part HP slowly
    }

    // Damage handling
    takeDamage(amount: number, source: any, hitPoint: Vec3, hitNormal: Vec3, bodyPartId?: string): number {
        // Check body part
        if (bodyPartId) {
            const part = this.bodyParts.get(bodyPartId);
            if (part && !part.isDestroyed) {
                part.currentHP -= amount;
                if (part.currentHP <= 0) {
                    this.destroyBodyPart(bodyPartId);
                }
                return amount;
            }
        }

        // Main HP
        const actualDamage = Math.max(1, amount - this.stats.defense * 0.1);
        this.currentHP = Math.max(0, this.currentHP - actualDamage);

        // Poise
        this.currentPoise = Math.max(0, this.currentPoise - amount * 0.1);

        emitEvent(GameEvents.CREATURE_DAMAGED, { creature: this, damage: actualDamage, source });

        if (this.currentHP <= 0) {
            this.die(source);
        }

        return actualDamage;
    }

    private destroyBodyPart(partId: string): void {
        const part = this.bodyParts.get(partId);
        if (!part || part.isDestroyed) return;

        part.isDestroyed = true;
        this.destroyedParts.add(partId);

        // Apply effects
        if (part.data.staggerOnDestroy) {
            PoiseSystem.getInstance().forceStagger(this.entity, part.data.staggerOnDestroy, new Vec3(), this.entity.transform.position);
        }

        // Drop loot
        for (const loot of part.data.destroyLoot) {
            if (Math.random() < loot.chance) {
                // Spawn pickup
            }
        }

        emitEvent(GameEvents.BODY_PART_DESTROYED, { creature: this, partId, partData: part.data });

        // Disable associated abilities
        if (part.data.skillsUnlocked.length > 0) {
            // Creature loses these abilities
        }
    }

    private die(killer: any): void {
        emitEvent(GameEvents.CREATURE_DIED, { creature: this, killer });

        // Drop loot
        for (const loot of this.data.lootTable) {
            if (Math.random() < loot.chance) {
                const qty = loot.minQuantity + Math.floor(Math.random() * (loot.maxQuantity - loot.minQuantity + 1));
                // Spawn pickup
            }
        }

        // Despawn
        setTimeout(() => this.despawn(), 5000);
    }

    despawn(): void {
        emitEvent(GameEvents.CREATURE_DESPAWNED, { creature: this });
        // Return to pool
    }

    // Capture
    tryCapture(itemQuality: number): boolean {
        if (!this.isWeakened) return false;

        const baseChance = GameConfig.CREATURES.CAPTURE_BASE_CHANCE;
        const itemBonus = GameConfig.CREATURES.CAPTURE_ITEM_BONUS * itemQuality;
        const hpFactor = 1 - (this.currentHP / this.stats.hp);
        const chance = baseChance + itemBonus + hpFactor * 0.3;

        const success = Math.random() < chance;

        if (success) {
            this.isCaptured = true;
            emitEvent(GameEvents.CREATURE_CAPTURED, { creature: this, success: true });
        } else {
            emitEvent(GameEvents.CREATURE_CAPTURED, { creature: this, success: false });
        }

        return success;
    }

    // Pet behavior
    private updatePetBehavior(dt: number): void {
        if (!this.owner) return;

        const dist = this.entity.transform.position.distanceTo(this.owner.transform.position);

        switch (this.petCommand) {
            case 'follow':
                if (dist > 5) this.moveTowards(this.owner.transform.position);
                break;
            case 'attack':
                if (this.target) this.updateCombat(dt, { getPlayer: () => this.target });
                else if (dist > 10) this.moveTowards(this.owner.transform.position);
                break;
            case 'stay':
                break;
            case 'mount':
                // Mount logic handled by player
                break;
        }
    }

    setCommand(command: 'follow' | 'attack' | 'stay' | 'mount'): void {
        this.petCommand = command;
    }

    // Mutation
    addMutation(part: MutationPart): void {
        this.mutationParts.push(part);
        this.applyMutationStats(part);

        emitEvent(GameEvents.MUTATION_OCCURRED, { pet: this, part });
    }

    private applyMutationStats(part: MutationPart): void {
        if (part.statBonuses.hp) this.stats.hp += part.statBonuses.hp;
        if (part.statBonuses.damage) this.stats.damage += part.statBonuses.damage;
        if (part.statBonuses.defense) this.stats.defense += part.statBonuses.defense;
        if (part.statBonuses.speed) this.stats.speed += part.statBonuses.speed;

        // Add new skills
        for (const skillId of part.unlockedSkills) {
            // Unlock skill for creature
        }
    }

    getMaxHealth(): number { return this.stats.hp; }
    getCurrentHealth(): number { return this.currentHP; }
    getHealthPercent(): number { return this.currentHP / this.stats.hp; }
    isAlive(): boolean { return this.currentHP > 0; }
    isBoss(): boolean { return this.data.isBoss; }

    getActiveStatuses(): string[] {
        // Return active status effects
        return [];
    }
}

// Blackboard for AI
export class CreatureBlackboard {
    patrolCenter: Vec3 | null = null;
    moveTarget: Vec3 | null = null;
    lastSeenPlayerPos: Vec3 | null = null;
    lastSeenPlayerTime: number = 0;
    threatLevel: number = 0;
    preferredAttack: string | null = null;
    customData: Map<string, any> = new Map();
}

// Body Part Runtime
export interface BodyPart {
    data: BodyPartData;
    currentHP: number;
    maxHP: number;
    isDestroyed: boolean;
}

// Creature Spawn Manager
export class CreatureSpawnManager {
    private static instance: CreatureSpawnManager;
    private spawnPoints: Map<BiomeType, SpawnPoint[]> = new Map();
    private activeCreatures: Map<string, Creature> = new Map();
    private creatureConfigs: Map<string, CreatureData> = new Map();

    static getInstance(): CreatureSpawnManager {
        if (!CreatureSpawnManager.instance) CreatureSpawnManager.instance = new CreatureSpawnManager();
        return CreatureSpawnManager.instance;
    }

    registerConfig(data: CreatureData): void {
        this.creatureConfigs.set(data.id, data);
    }

    addSpawnPoint(biome: BiomeType, point: SpawnPoint): void {
        if (!this.spawnPoints.has(biome)) this.spawnPoints.set(biome, []);
        this.spawnPoints.get(biome)!.push(point);
    }

    update(dt: number, world: any): void {
        // Check spawn conditions
        const player = world.getPlayer?.();
        if (!player) return;

        const currentBiome = world.getBiomeAt?.(player.transform.position) || BiomeType.SPIRIT_PLAINS;
        const isNight = world.isNight?.() || false;

        // Spawn creatures around player
        this.spawnAroundPlayer(currentBiome, isNight, player.transform.position);

        // Despawn distant creatures
        this.despawnDistant(player.transform.position);
    }

    private spawnAroundPlayer(biome: BiomeType, isNight: boolean, playerPos: Vec3): void {
        const points = this.spawnPoints.get(biome) || [];
        const configs = Array.from(this.creatureConfigs.values()).filter(c =>
            c.biome.includes(biome) &&
            (c.timeOfDay === 'any' || c.timeOfDay === (isNight ? 'night' : 'day'))
        );

        if (configs.length === 0 || points.length === 0) return;

        // Check max active
        if (this.activeCreatures.size >= GameConfig.CREATURES.MAX_ACTIVE) return;

        // Try to spawn
        for (const point of points) {
            if (this.activeCreatures.size >= GameConfig.CREATURES.MAX_ACTIVE) break;
            if (point.lastSpawnTime + point.cooldown > Date.now() / 1000) continue;

            const dist = point.position.distanceTo(playerPos);
            if (dist < GameConfig.CREATURES.SPAWN_RADIUS || dist > GameConfig.CREATURES.DESPAWN_RADIUS) continue;

            // Weighted random selection
            const totalWeight = configs.reduce((sum, c) => sum + c.spawnWeight, 0);
            let roll = Math.random() * totalWeight;
            let selected: CreatureData | null = null;

            for (const config of configs) {
                roll -= config.spawnWeight;
                if (roll <= 0) { selected = config; break; }
            }

            if (selected) {
                this.spawnCreature(selected, point.position);
                point.lastSpawnTime = Date.now() / 1000;
            }
        }
    }

    private spawnCreature(config: CreatureData, position: Vec3): Creature {
        const level = config.level + Math.floor(Math.random() * 3) - 1;
        const creature = new Creature(config, Math.max(1, level));

        // Create entity, set position
        // creature.entity = world.spawnEntity(...)

        this.activeCreatures.set(config.id + '_' + Date.now(), creature);
        emitEvent(GameEvents.CREATURE_SPAWNED, { creature, position });

        return creature;
    }

    private despawnDistant(playerPos: Vec3): void {
        for (const [id, creature] of this.activeCreatures) {
            if (!creature.entity) continue;
            const dist = creature.entity.transform.position.distanceTo(playerPos);
            if (dist > GameConfig.CREATURES.DESPAWN_RADIUS) {
                creature.despawn();
                this.activeCreatures.delete(id);
            }
        }
    }
}

export interface SpawnPoint {
    position: Vec3;
    biome: BiomeType;
    cooldown: number;
    lastSpawnTime: number;
    maxCreatures: number;
    creatureIds: string[];
}