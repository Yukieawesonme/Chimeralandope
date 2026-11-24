/**
 * Creature System 3D - Runtime Spawning, AI, Mutations, Taming
 * Manages creature lifecycle from spawn to death/taming
 */

import * as THREE from 'three';
import { World, EntityId, BaseSystem } from '@core/ECS.js';
import { TransformComponent } from '@core/ECS.js';
import { NameComponent, TagComponent } from '@core/ECS.js';
import { CreatureComponent, CreatureAIComponent, MutationComponent } from './CreatureTypes.js';
import { CREATURE_DEFINITIONS, CreatureDefinition, CreatureInstance, CreaturePart, MutationInstance, MutationSlot, SpawnPoint, SpawnGroup, DropEntry, DroppedItem, TameResult } from './CreatureTypes.js';
import { BiomeManager } from '@world/BiomeManager.js';
import { TerrainSystem } from '@world/TerrainSystem.js';
import { CombatSystem3D } from '@combat/CombatSystem3D.js';
import { SaveManager } from '@save/SaveManager.js';
import { PlayerComponent } from '@entities/Player.js';
import { BiomeType, Vec3, Quat, DamageElement, ActionName, CreatureState } from '@core/Types.js';
import { CREATURE_CONFIG, WORLD_CONFIG } from '@core/Config.js';

// ============================================================================
// CREATURE SYSTEM
// ============================================================================

export class CreatureSystem3D extends BaseSystem {
  readonly priority = 40;

  private biomeManager: BiomeManager;
  private terrainSystem: TerrainSystem;
  private combatSystem: CombatSystem3D;
  private saveManager: SaveManager;

  // Spawn management
  private spawnPoints: Map<string, SpawnPoint> = new Map();
  private activeSpawnGroups: Map<string, SpawnGroup> = new Map();
  private creatureEntities: Set<EntityId> = new Set();
  private maxCreatures = 150;
  private spawnCheckInterval = 5; // seconds
  private spawnTimer = 0;

  // Dropped items
  private droppedItems: Map<EntityId, DroppedItem> = new Map();
  private itemDespawnTime = 300; // 5 minutes

  // Taming
  private tamingAttempts: Map<string, { creatureId: EntityId; playerId: EntityId; progress: number; trustLevel: number }> = new Map();

  // Callbacks
  public onCreatureSpawned?: (entityId: EntityId, definitionId: string) => void;
  public onCreatureDeath?: (entityId: EntityId, killerId?: EntityId) => void;
  public onCreatureTamed?: (entityId: EntityId, playerId: EntityId) => void;
  public onMutationApplied?: (entityId: EntityId, partId: string, slotId: string) => void;
  public onItemDropped?: (item: DroppedItem) => void;

  private playerEntity: EntityId | null = null;

  constructor(
    world: World,
    biomeManager: BiomeManager,
    terrainSystem: TerrainSystem,
    combatSystem: CombatSystem3D,
    saveManager: SaveManager
  ) {
    super();
    this.biomeManager = biomeManager;
    this.terrainSystem = terrainSystem;
    this.combatSystem = combatSystem;
    this.saveManager = saveManager;
    this.initializeSpawnPoints();
  }

  setPlayerEntity(entityId: EntityId): void {
    this.playerEntity = entityId;
  }

  private getPlayerPosition(): Vec3 | null {
    if (!this.playerEntity) return null;
    const transform = this.world.getComponent(this.playerEntity, TransformComponent);
    if (!transform) return null;
    return { ...transform.position };
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeSpawnPoints(): void {
    // Generate spawn points across the world
    const spacing = 200; // meters between spawn points
    const worldRadius = 3000;

    for (let x = -worldRadius; x <= worldRadius; x += spacing) {
      for (let z = -worldRadius; z <= worldRadius; z += spacing) {
        // Add some randomness
        const rx = x + (Math.random() - 0.5) * spacing * 0.5;
        const rz = z + (Math.random() - 0.5) * spacing * 0.5;

        const biome = this.biomeManager.getDominantBiome({ x: rx, y: 0, z: rz });
        const biomeConfig = CREATURE_DEFINITIONS; // Would use biome weights

        // Calculate creature weights for this biome
        const weights: Record<string, number> = {};
        for (const [defId, def] of Object.entries(CREATURE_DEFINITIONS)) {
          const weight = def.biomeWeights[biome] ?? 0;
          if (weight > 0) {
            weights[defId] = weight;
          }
        }

        if (Object.keys(weights).length > 0) {
          const spawnPoint: SpawnPoint = {
            id: `spawn_${rx}_${rz}`,
            position: { x: rx, y: this.terrainSystem.getHeightAtWorld(rx, rz) + 1, z: rz },
            biome,
            creatureWeights: weights,
            spawnRadius: spacing * 0.4,
            maxPopulation: 3,
            currentPopulation: 0,
            respawnInterval: 60 + Math.random() * 120, // 1-3 minutes
            lastSpawnTime: Date.now() + Math.random() * 60000, // Stagger initial spawns
            conditions: [],
            isActive: true,
          };
          this.spawnPoints.set(spawnPoint.id, spawnPoint);
        }
      }
    }

    console.log(`[CreatureSystem] Initialized ${this.spawnPoints.size} spawn points`);
  }

  // ============================================================================
  // SPAWNING
  // ============================================================================

  private trySpawnAtPoint(spawnPoint: SpawnPoint): EntityId | null {
    if (spawnPoint.currentPopulation >= spawnPoint.maxPopulation) return null;
    if (this.creatureEntities.size >= this.maxCreatures) return null;

    // Pick creature based on weights
    const defId = this.weightedRandom(spawnPoint.creatureWeights);
    if (!defId) return null;

    const def = CREATURE_DEFINITIONS[defId];
    if (!def) return null;

    // Find valid spawn position near spawn point
    const position = this.findSpawnPosition(spawnPoint, def);
    if (!position) return null;

    // Create creature entity
    const entityId = this.createCreature(defId, position, spawnPoint.id);
    if (!entityId) return null;

    spawnPoint.currentPopulation++;
    spawnPoint.lastSpawnTime = Date.now();

    return entityId;
  }

  private findSpawnPosition(spawnPoint: SpawnPoint, def: CreatureDefinition): Vec3 | null {
    const attempts = 10;
    for (let i = 0; i < attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * spawnPoint.spawnRadius;
      const x = spawnPoint.position.x + Math.cos(angle) * distance;
      const z = spawnPoint.position.z + Math.sin(angle) * distance;
      const y = this.terrainSystem.getHeightAtWorld(x, z) + 1;

      // Check if position is valid (not in water, not too steep, not colliding)
      if (this.isValidSpawnPosition(x, y, z, def)) {
        return { x, y, z };
      }
    }
    return null;
  }

  private isValidSpawnPosition(x: number, y: number, z: number, def: CreatureDefinition): boolean {
    // Check height (not underground, not floating)
    const groundY = this.terrainSystem.getHeightAtWorld(x, z);
    if (y < groundY + 0.5 || y > groundY + 5) return false;

    // Check slope (not too steep)
    // Would need terrain normal here

    // Check collision with other creatures
    const entities = this.world.query({ all: [TransformComponent] });
    for (const entityId of entities) {
      if (!this.creatureEntities.has(entityId)) continue;
      const transform = this.world.getComponent(entityId, TransformComponent);
      if (!transform) continue;
      const dist = Math.sqrt((transform.position.x - x) ** 2 + (transform.position.z - z) ** 2);
      if (dist < 3) return false;
    }

    // Check collision with buildings
    // Would check building system

    return true;
  }

  private createCreature(defId: string, position: Vec3, spawnPointId: string): EntityId {
    const def = CREATURE_DEFINITIONS[defId];
    if (!def) return null as any;

    const entityId = this.world.createEntity();

    // Transform
    const transform = new TransformComponent(entityId);
    transform.setPosition(position.x, position.y, position.z);
    const yaw = Math.random() * Math.PI * 2;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    transform.setRotation(q.x, q.y, q.z, q.w);
    transform.setScale(def.scale, def.scale, def.scale);
    this.world.addComponent(entityId, transform);

    // Creature instance data
    const instance: CreatureInstance = {
      entityId,
      definitionId: defId,
      variationId: this.pickVariation(def),
      name: def.name,
      isTamed: false,
      isPartyMember: false,
      isMount: false,
      level: this.calculateSpawnLevel(def),
      experience: 0,
      stats: this.calculateStats(def, 1), // Will be updated with level
      state: CreatureState.Idle,
      homePosition: { ...position },
      attackCooldowns: {},
      poise: 100,
      maxPoise: 100,
      staggerTimer: 0,
      mutations: [],
      activeMutations: new Map(),
      lastSeenPlayer: 0,
      alertLevel: 0,
      fearLevel: 0,
      tameProgress: 0,
      trustLevel: 0,
      modelScale: def.scale,
      textureTints: new Map(),
      wanderTimer: Math.random() * def.wanderInterval.max,
      idleTimer: 0,
      roarTimer: Math.random() * 30,
    };

    // Update stats for level
    instance.stats = this.calculateStats(def, instance.level);

    // Components
    const creatureComp = new CreatureComponent(entityId, defId, instance);
    const aiComp = new CreatureAIComponent(entityId);
    const mutationComp = new MutationComponent(entityId);

    // Initialize mutation component with definition slots
    mutationComp.availableSlots = def.mutationSlots;

    this.world.addComponent(entityId, creatureComp);
    this.world.addComponent(entityId, aiComp);
    this.world.addComponent(entityId, mutationComp);

    // Name & Tag
    const nameComp = new (require('@core/ECS.js').NameComponent)(entityId, instance.name);
    const tagComp = new (require('@core/ECS.js').TagComponent)(entityId, 'creature', 'ai', defId, instance.isTamed ? 'tamed' : 'wild');
    this.world.addComponent(entityId, nameComp);
    this.world.addComponent(entityId, tagComp);

    // Track
    this.creatureEntities.add(entityId);

    // Callback
    this.onCreatureSpawned?.(entityId, defId);

    return entityId;
  }

  private pickVariation(def: CreatureDefinition): string | undefined {
    if (!def.variations || def.variations.length === 0) return undefined;
    const roll = Math.random();
    let cumulative = 0;
    for (const v of def.variations) {
      // Would use variation weights
      cumulative += 1 / def.variations.length;
      if (Math.random() < cumulative) return v.id;
    }
    return def.variations[0]?.id;
  }

  private calculateSpawnLevel(def: CreatureDefinition): number {
    // Base level with some variance
    return 1 + Math.floor(Math.random() * 3);
  }

  private calculateStats(def: CreatureDefinition, level: number): CreatureInstance['stats'] {
    return {
      hp: def.baseHp + def.hpPerLevel * (level - 1),
      maxHp: def.baseHp + def.hpPerLevel * (level - 1),
      damage: def.baseDamage + def.damagePerLevel * (level - 1),
      armor: def.baseArmor + def.armorPerLevel * (level - 1),
      speed: def.baseSpeed + def.speedPerLevel * (level - 1),
      stamina: def.baseStamina,
      maxStamina: def.baseStamina,
    };
  }

  private weightedRandom(weights: Record<string, number>): string | null {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let random = Math.random() * total;
    for (const [key, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) return key;
    }
    const keys = Object.keys(weights);
    return keys.length > 0 ? keys[0]! : null;
  }

  // ============================================================================
  // AI SYSTEM
  // ============================================================================

  private updateCreatureAI(entityId: EntityId, dt: number): void {
    const creatureComp = this.world.getComponent(entityId, CreatureComponent);
    const aiComp = this.world.getComponent(entityId, CreatureAIComponent);
    const transform = this.world.getComponent(entityId, TransformComponent);
    if (!creatureComp || !aiComp || !transform) return;

    const instance = creatureComp.instance;

    // Update timers
    instance.wanderTimer -= dt;
    instance.idleTimer -= dt;
    instance.roarTimer -= dt;
    aiComp.behaviorTimer -= dt;

    // Update attack cooldowns
    for (const key of Object.keys(instance.attackCooldowns)) {
      const currentCooldown = instance.attackCooldowns[key];
      if (currentCooldown !== undefined) {
        instance.attackCooldowns[key] = Math.max(0, currentCooldown - dt);
      }
    }

    // Poise regeneration
    if (instance.poise < instance.maxPoise) {
      instance.poise = Math.min(instance.maxPoise, instance.poise + CREATURE_CONFIG.poiseRegenRate * dt);
    }

    // Stagger timer
    if (instance.staggerTimer > 0) {
      instance.staggerTimer -= dt;
      if (instance.staggerTimer <= 0) {
        instance.state = CreatureState.Idle;
      }
    }

    // Handle tamed creatures differently
    if (instance.isTamed) {
      this.updateTamedAI(entityId, instance, aiComp, transform, dt);
      return;
    }

    // Wild creature AI
    this.updateWildAI(entityId, instance, aiComp, transform, dt);
  }

  private updateWildAI(entityId: EntityId, instance: CreatureInstance, aiComp: CreatureAIComponent, transform: TransformComponent, dt: number): void {
    const def = CREATURE_DEFINITIONS[instance.definitionId];
    if (!def) return;

    // Detect player
    const playerDetected = this.detectPlayer(entityId, instance, transform);

    // State machine
    switch (instance.state) {
      case CreatureState.Idle:
        if (playerDetected) {
          instance.state = CreatureState.Chase;
          instance.alertLevel = 1;
        } else if (instance.wanderTimer <= 0) {
          instance.state = CreatureState.Wander;
          instance.wanderTimer = def.wanderInterval.min + Math.random() * (def.wanderInterval.max - def.wanderInterval.min);
          // Pick random wander target
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * def.wanderRadius;
          instance.wanderTarget = {
            x: instance.homePosition.x + Math.cos(angle) * dist,
            y: instance.homePosition.y,
            z: instance.homePosition.z + Math.sin(angle) * dist,
          };
        }
        break;

      case CreatureState.Wander:
        if (playerDetected) {
          instance.state = CreatureState.Chase;
        } else if (instance.wanderTarget) {
          this.moveTowards(entityId, instance.wanderTarget, instance.stats.speed * 0.5, dt);
          const dist = this.distanceToTarget(transform.position, instance.wanderTarget);
          if (dist < 1) {
            instance.state = CreatureState.Idle;
            instance.idleTimer = 3 + Math.random() * 5;
          }
        } else {
          instance.state = CreatureState.Idle;
        }
        break;

      case CreatureState.Chase:
        if (playerDetected) {
          const playerPos = this.getPlayerPosition();
          if (playerPos) {
            const dist = this.distanceToTarget(transform.position, playerPos);
            if (dist <= def.attackRange) {
              instance.state = CreatureState.Attack;
            } else if (dist > def.loseInterestRange) {
              instance.state = CreatureState.Idle;
              instance.alertLevel = 0;
            } else {
              this.moveTowards(entityId, playerPos, instance.stats.speed, dt);
            }
          }
        } else {
          instance.state = CreatureState.Idle;
        }
        break;

      case CreatureState.Attack:
        this.executeAttack(entityId, instance, def);
        break;

      case CreatureState.Flee:
        this.executeFlee(entityId, instance, transform, dt);
        break;

      case CreatureState.Dead:
        // Handled by death system
        break;
    }

    // Roar occasionally
    if (instance.roarTimer <= 0 && Math.random() < 0.01) {
      this.playSound(entityId, 'roar');
      instance.roarTimer = 20 + Math.random() * 40;
    }
  }

  private updateTamedAI(entityId: EntityId, instance: CreatureInstance, aiComp: CreatureAIComponent, transform: TransformComponent, dt: number): void {
    // Follow player, assist in combat, etc.
    const playerPos = this.getPlayerPosition();
    if (!playerPos) return;

    const dist = this.distanceToTarget(transform.position, playerPos);
    const followDistance = instance.isMount ? 2 : 5;

    if (dist > followDistance * 2) {
      // Teleport to player if too far
      transform.position = { ...playerPos };
      transform.position.x += (Math.random() - 0.5) * 2;
      transform.position.z += (Math.random() - 0.5) * 2;
    } else if (dist > followDistance) {
      this.moveTowards(entityId, playerPos, instance.stats.speed * 0.8, dt);
    }

    // Assist in combat if player is attacking
    // Would check player combat state
  }

  private detectPlayer(entityId: EntityId, instance: CreatureInstance, transform: TransformComponent): boolean {
    const playerPos = this.getPlayerPosition();
    if (!playerPos) return false;

    const def = CREATURE_DEFINITIONS[instance.definitionId];
    if (!def) return false;

    const dist = this.distanceToTarget(transform.position, playerPos);
    if (dist > def.detectionRange) return false;

    // Check line of sight (simplified)
    instance.lastSeenPlayer = performance.now() / 1000;
    return true;
  }

  private moveTowards(entityId: EntityId, target: Vec3, speed: number, dt: number): void {
    const transform = this.world.getComponent(entityId, TransformComponent);
    if (!transform) return;

    const dx = target.x - transform.position.x;
    const dz = target.z - transform.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.1) return;

    const moveX = (dx / dist) * speed * dt;
    const moveZ = (dz / dist) * speed * dt;

    transform.position.x += moveX;
    transform.position.z += moveZ;

    // Update Y to terrain
    transform.position.y = this.terrainSystem.getHeightAtWorld(transform.position.x, transform.position.z) + 0.5;

    // Rotate to face movement
    const targetYaw = Math.atan2(moveX, moveZ);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetYaw, 0));
    transform.rotation.x = q.x;
    transform.rotation.y = q.y;
    transform.rotation.z = q.z;
    transform.rotation.w = q.w;
  }

  private executeAttack(entityId: EntityId, instance: CreatureInstance, def: CreatureDefinition): void {
    const playerPos = this.getPlayerPosition();
    if (!playerPos) {
      instance.state = CreatureState.Idle;
      return;
    }

    const transform = this.world.getComponent(entityId, TransformComponent);
    if (!transform) return;

    const dist = this.distanceToTarget(transform.position, playerPos);
    const defAttack = def.attackPatterns[0]; // Use first pattern for now

    const attackCooldown = defAttack ? instance.attackCooldowns[defAttack.id] : undefined;
    if (defAttack && attackCooldown !== undefined && attackCooldown <= 0) {
      // Create hitbox via combat system
      this.combatSystem.createHitbox({
        ownerId: entityId,
        shape: 'capsule',
        offset: { x: 0, y: 1, z: 1.5 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        size: { radius: 0.5, length: 2.5 },
        damage: instance.stats.damage,
        staggerPower: 10,
        knockback: 3,
        element: 'physical',
        duration: 0.4,
        maxHits: 1,
        sourceAttackId: defAttack.id,
      });

      instance.attackCooldowns[defAttack.id] = defAttack.cooldown;
      instance.state = CreatureState.Chase; // Return to chase after attack
    }
  }

  private executeFlee(entityId: EntityId, instance: CreatureInstance, transform: TransformComponent, dt: number): void {
    const playerPos = this.getPlayerPosition();
    if (!playerPos) {
      instance.state = CreatureState.Idle;
      return;
    }

    // Move away from player
    const dx = transform.position.x - playerPos.x;
    const dz = transform.position.z - playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 20) {
      const fleeX = transform.position.x + (dx / dist) * instance.stats.speed * dt;
      const fleeZ = transform.position.z + (dz / dist) * instance.stats.speed * dt;
      transform.position.x = fleeX;
      transform.position.z = fleeZ;
      transform.position.y = this.terrainSystem.getHeightAtWorld(fleeX, fleeZ) + 0.5;
    } else {
      instance.state = CreatureState.Idle;
    }
  }

  // ============================================================================
  // TAMING SYSTEM
  // ============================================================================

  attemptTame(playerId: EntityId, creatureId: EntityId, foodItemId: string): TameResult {
    const creatureComp = this.world.getComponent(creatureId, CreatureComponent);
    if (!creatureComp || creatureComp.instance.isTamed) {
      return { success: false, newTrustLevel: 0, tameProgress: 0, message: 'Já domado', effects: [] };
    }

    const instance = creatureComp.instance;
    const def = CREATURE_DEFINITIONS[instance.definitionId];
    if (!def) return { success: false, newTrustLevel: 0, tameProgress: 0, message: 'Erro', effects: [] };

    // Check if food is preferred
    const isPreferred = def.preferredFood.includes(foodItemId);
    let progressGain = isPreferred ? 0.15 : 0.05;
    progressGain += def.tameFoodBonus;

    // Level difference penalty (taming skill not yet implemented, use 0)
    const levelDiff = instance.level - 0;
    if (levelDiff > def.maxTameLevelDiff) {
      progressGain *= 0.5;
    }

    instance.tameProgress = Math.min(1, instance.tameProgress + progressGain);
    instance.trustLevel = Math.min(100, instance.trustLevel + progressGain * 100);

    const success = instance.tameProgress >= 1;

    if (success) {
      this.tameCreature(creatureId, playerId);
      return { success: true, newTrustLevel: instance.trustLevel, tameProgress: instance.tameProgress, message: `${instance.name} foi domado!`, effects: ['tame_success', 'hearts'] };
    }

    return { success: false, newTrustLevel: instance.trustLevel, tameProgress: instance.tameProgress, message: `Progresso: ${Math.round(instance.tameProgress * 100)}%`, effects: ['tame_progress'] };
  }

  private tameCreature(creatureId: EntityId, playerId: EntityId): void {
    const creatureComp = this.world.getComponent(creatureId, CreatureComponent);
    if (!creatureComp) return;

    const instance = creatureComp.instance;
    instance.isTamed = true;
    instance.ownerId = playerId;
    instance.isPartyMember = true;
    instance.trustLevel = 100;
    instance.tameProgress = 1;
    instance.state = CreatureState.Idle;

    // Update tag
    const tagComp = this.world.getComponent(creatureId, TagComponent);
    if (tagComp) {
      tagComp.tags.delete('wild');
      tagComp.tags.add('tamed');
      tagComp.tags.add('pet');
    }

    // Add to player's creature list
    // Would integrate with player's creature collection

    this.onCreatureTamed?.(creatureId, playerId);
  }

  // ============================================================================
  // MUTATION SYSTEM
  // ============================================================================

  applyMutation(creatureId: EntityId, partId: string, slotId: string): boolean {
    const creatureComp = this.world.getComponent(creatureId, CreatureComponent);
    const mutationComp = this.world.getComponent(creatureId, MutationComponent);
    if (!creatureComp || !mutationComp) return false;

    const instance = creatureComp.instance;
    const def = CREATURE_DEFINITIONS[instance.definitionId];
    if (!def) return false;

    // Find the part definition
    const part = this.getCreaturePart(partId);
    if (!part) return false;

    // Check if part fits in slot
    const slot = def.mutationSlots.find(s => s.id === slotId);
    if (!slot || !slot.allowedParts.includes(partId)) return false;

    // Check if slot is already occupied
    if (instance.activeMutations.has(slotId)) return false;

    // Create mutation instance
    const mutation: MutationInstance = {
      partId,
      slotId,
      socketName: slot.socketName,
      level: 1,
      experience: 0,
      statBonuses: { ...part.statBonuses },
      activeSkillId: part.grantedSkillId,
    };

    instance.mutations.push(mutation);
    instance.activeMutations.set(slotId, mutation);

    // Apply stat bonuses
    this.recalculateStats(creatureId);

    // Visual attachment
    this.attachPartVisual(creatureId, part, slotId);

    // Grant skill if any
    if (part.grantedSkillId) {
      // Add to creature's available skills
    }

    this.onMutationApplied?.(creatureId, partId, slotId);
    return true;
  }

  private recalculateStats(creatureId: EntityId): void {
    const creatureComp = this.world.getComponent(creatureId, CreatureComponent);
    if (!creatureComp) return;

    const instance = creatureComp.instance;
    const def = CREATURE_DEFINITIONS[instance.definitionId];
    if (!def) return;

    // Base stats
    const baseStats = this.calculateStats(def, instance.level);

    // Apply mutation bonuses
    for (const mutation of instance.activeMutations.values()) {
      for (const [stat, bonus] of Object.entries(mutation.statBonuses)) {
        switch (stat) {
          case 'hp': baseStats.hp += bonus; baseStats.maxHp += bonus; break;
          case 'damage': baseStats.damage += bonus; break;
          case 'armor': baseStats.armor += bonus; break;
          case 'speed': baseStats.speed += bonus; break;
        }
      }
    }

    instance.stats = baseStats;
  }

  private attachPartVisual(creatureId: EntityId, part: CreaturePart, slotId: string): void {
    // In a real implementation, this would load the part model and attach to the creature's skeleton
    const mutationComp = this.world.getComponent(creatureId, MutationComponent);
    if (!mutationComp) return;

    mutationComp.attachedParts.set(slotId, {
      partId: part.id,
      offset: part.socketOffset,
      rotation: part.socketRotation,
    });

    // Would load model and attach to socket
    console.log(`[CreatureSystem] Attached ${part.name} to slot ${slotId}`);
  }

  private getCreaturePart(partId: string): CreaturePart | undefined {
    // Would look up in a parts registry
    // For now, return a mock
    const parts: Record<string, CreaturePart> = {
      wolf_fangs: { id: 'wolf_fangs', name: 'Presas de Lobo', description: '', sourceCreatureId: 'spirit_wolf', sourceSlot: 'fangs', modelPath: 'parts/wolf_fangs.glb', scale: 1, socketOffset: { x: 0, y: 0, z: 0 }, socketRotation: { x: 0, y: 0, z: 0, w: 1 }, statBonuses: { damage: 5 }, element: 'physical', requiredLevel: 1, rarity: 'common' },
      wolf_claws: { id: 'wolf_claws', name: 'Garras de Lobo', description: '', sourceCreatureId: 'spirit_wolf', sourceSlot: 'claws', modelPath: 'parts/wolf_claws.glb', scale: 1, socketOffset: { x: 0, y: 0, z: 0 }, socketRotation: { x: 0, y: 0, z: 0, w: 1 }, statBonuses: { damage: 3, armor: 1 }, element: 'physical', requiredLevel: 1, rarity: 'common' },
      deer_antlers: { id: 'deer_antlers', name: 'Chifres de Cervo', description: '', sourceCreatureId: 'spirit_deer', sourceSlot: 'antlers', modelPath: 'parts/deer_antlers.glb', scale: 1, socketOffset: { x: 0, y: 0, z: 0 }, socketRotation: { x: 0, y: 0, z: 0, w: 1 }, statBonuses: { armor: 2 }, element: 'spirit', requiredLevel: 1, rarity: 'common' },
    };
    return parts[partId];
  }

  // ============================================================================
  // DEATH & LOOT
  // ============================================================================

  killCreature(entityId: EntityId, killerId?: EntityId): void {
    const creatureComp = this.world.getComponent(entityId, CreatureComponent);
    if (!creatureComp) return;

    const instance = creatureComp.instance;
    instance.state = CreatureState.Dead;

    // Drop loot
    this.dropLoot(entityId, instance, killerId);

    // Remove from spawn point tracking
    // Would need to track which spawn point this came from

    // Remove from active creatures
    this.creatureEntities.delete(entityId);

    // Callback
    this.onCreatureDeath?.(entityId, killerId);

    // Cleanup after delay (ragdoll, etc.)
    setTimeout(() => {
      this.world.destroyEntity(entityId);
      this.creatureEntities.delete(entityId);
    }, 5000); // 5 second ragdoll
  }

  private dropLoot(entityId: EntityId, instance: CreatureInstance, killerId?: EntityId): void {
    const def = CREATURE_DEFINITIONS[instance.definitionId];
    if (!def) return;

    const transform = this.world.getComponent(entityId, TransformComponent);
    if (!transform) return;

    for (const drop of def.dropTable) {
      if (Math.random() > drop.chance) continue;
      if (drop.condition === 'killed_by_player' && !this.isPlayerKiller(killerId)) continue;

      const quantity = drop.minQuantity + Math.floor(Math.random() * (drop.maxQuantity - drop.minQuantity + 1));
      this.dropItem(entityId, drop.itemId, quantity, transform.position);
    }
  }

  private dropItem(sourceEntityId: EntityId, itemId: string, quantity: number, position: Vec3): void {
    const itemEntityId = this.world.createEntity();

    const transform = new TransformComponent(itemEntityId);
    transform.setPosition(
      position.x + (Math.random() - 0.5) * 0.5,
      position.y + 0.5,
      position.z + (Math.random() - 0.5) * 0.5
    );
    transform.setRotation(0, Math.random() * Math.PI * 2, 0, 1);
    this.world.addComponent(itemEntityId, transform);

    const tagComp = new (require('@core/ECS.js').TagComponent)(itemEntityId, 'item', 'dropped');
    this.world.addComponent(itemEntityId, tagComp);

    const droppedItem: DroppedItem = {
      entityId: itemEntityId,
      itemId,
      quantity,
      position: { ...position },
      velocity: { x: (Math.random() - 0.5) * 2, y: 3, z: (Math.random() - 0.5) * 2 },
      despawnTime: Date.now() + this.itemDespawnTime * 1000,
      ownerId: sourceEntityId,
    };

    this.droppedItems.set(itemEntityId, droppedItem);
    this.onItemDropped?.(droppedItem);
  }

  private isPlayerKiller(killerId?: EntityId): boolean {
    if (!killerId) return false;
    const tagComp = this.world.getComponent(killerId, TagComponent);
    return tagComp?.tags.has('player') ?? false;
  }

  // ============================================================================
  // UPDATE LOOP
  // ============================================================================

  update(dt: number): void {
    // Spawn management
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnCheckInterval) {
      this.spawnTimer = 0;
      this.processSpawns();
    }

    // Update creature AI
    for (const entityId of this.creatureEntities) {
      this.updateCreatureAI(entityId, dt);
    }

    // Update dropped items
    this.updateDroppedItems(dt);

    // Cleanup dead creatures
    this.cleanupDeadCreatures();
  }

  private processSpawns(): void {
    for (const spawnPoint of this.spawnPoints.values()) {
      if (!spawnPoint.isActive) continue;
      if (spawnPoint.currentPopulation >= spawnPoint.maxPopulation) continue;

      const timeSinceLastSpawn = (Date.now() - spawnPoint.lastSpawnTime) / 1000;
      if (timeSinceLastSpawn >= spawnPoint.respawnInterval) {
        this.trySpawnAtPoint(spawnPoint);
      }
    }
  }

  private updateDroppedItems(dt: number): void {
    const now = Date.now();
    for (const [entityId, item] of this.droppedItems) {
      // Despawn check
      if (now >= item.despawnTime) {
        this.world.destroyEntity(entityId);
        this.droppedItems.delete(entityId);
        continue;
      }

      // Physics (simple gravity)
      const transform = this.world.getComponent(entityId, TransformComponent);
      if (transform) {
        item.velocity.y -= 9.81 * dt;
        transform.position.x += item.velocity.x * dt;
        transform.position.y += item.velocity.y * dt;
        transform.position.z += item.velocity.z * dt;

        // Ground collision
        const groundY = this.terrainSystem.getHeightAtWorld(transform.position.x, transform.position.z);
        if (transform.position.y <= groundY + 0.1) {
          transform.position.y = groundY + 0.1;
          item.velocity.y = 0;
          item.velocity.x *= 0.9;
          item.velocity.z *= 0.9;
        }
      }
    }
  }

  private cleanupDeadCreatures(): void {
    // Creatures are cleaned up via killCreature timeout
    // This is for any edge cases
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private distanceToTarget(a: Vec3, b: Vec3): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  }

  private playSound(entityId: EntityId, soundType: string): void {
    // Would play 3D sound
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getCreatureEntityIds(): EntityId[] {
    return Array.from(this.creatureEntities);
  }

  getCreatureInstance(entityId: EntityId): CreatureInstance | undefined {
    const comp = this.world.getComponent(entityId, CreatureComponent);
    return comp?.instance;
  }

  getCreatureCount(): number {
    return this.creatureEntities.size;
  }

  getCreaturesInRange(position: Vec3, range: number): EntityId[] {
    const results: EntityId[] = [];
    for (const entityId of this.creatureEntities) {
      const transform = this.world.getComponent(entityId, TransformComponent);
      if (!transform) continue;
      const dist = this.distanceToTarget(transform.position, position);
      if (dist <= range) results.push(entityId);
    }
    return results;
  }

  forceSpawn(defId: string, position: Vec3): EntityId | null {
    return this.createCreature(defId, position, 'manual');
  }

  // Save/Load
  serialize(): any {
    const creatures: any[] = [];
    for (const entityId of this.creatureEntities) {
      const creatureComp = this.world.getComponent(entityId, CreatureComponent);
      const transform = this.world.getComponent(entityId, TransformComponent);
      if (!creatureComp || !transform) continue;

      creatures.push({
        entityId,
        definitionId: creatureComp.instance.definitionId,
        variationId: creatureComp.instance.variationId,
        instance: creatureComp.instance,
        position: transform.position,
        rotation: transform.rotation,
        scale: transform.scale,
      });
    }

    const spawnPoints: any[] = [];
    for (const sp of this.spawnPoints.values()) {
      spawnPoints.push(sp);
    }

    return { creatures, spawnPoints };
  }

  deserialize(data: any): void {
    // Clear existing
    for (const entityId of this.creatureEntities) {
      this.world.destroyEntity(entityId);
    }
    this.creatureEntities.clear();

    // Recreate creatures
    for (const c of data.creatures) {
      const entityId = this.world.createEntity();

      const transform = new TransformComponent(entityId);
      transform.setPosition(c.position.x, c.position.y, c.position.z);
      transform.setRotation(c.rotation.x, c.rotation.y, c.rotation.z, c.rotation.w);
      transform.setScale(c.scale.x, c.scale.y, c.scale.z);
      this.world.addComponent(entityId, transform);

      const creatureComp = new CreatureComponent(entityId, c.definitionId, c.instance);
      const aiComp = new CreatureAIComponent(entityId);
      const mutationComp = new MutationComponent(entityId);
      this.world.addComponent(entityId, creatureComp);
      this.world.addComponent(entityId, aiComp);
      this.world.addComponent(entityId, mutationComp);

      this.creatureEntities.add(entityId);
    }

    // Restore spawn points
    for (const sp of data.spawnPoints) {
      this.spawnPoints.set(sp.id, sp);
    }
  }
}