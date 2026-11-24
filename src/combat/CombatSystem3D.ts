/**
 * Combat System 3D - Hitboxes, Lock-on, Parry, Hitstop
 * Real-time 3D combat with spatial hit detection
 */

import * as THREE from 'three';
import { World, EntityId, BaseSystem } from '@core/ECS.js';
import { TransformComponent } from '@core/ECS.js';
import { Vec3, Quat, DamageType, DamageElement, WeaponType } from '@core/Types.js';
import { CREATURE_DEFINITIONS } from '@creatures/CreatureTypes.js';
import { PLAYER_CONFIG, WEAPON_CONFIG, WeaponTypeConfig, ITEM_DEFINITIONS } from '@core/Config.js';

// ============================================================================
// HITBOX & HIT DATA
// ============================================================================

export interface Hitbox {
  id: string;
  ownerId: EntityId;
  shape: 'capsule' | 'box' | 'sphere' | 'cone' | 'ray';
  offset: Vec3;
  rotation: Quat;
  size: Record<string, number>;
  damage: number;
  staggerPower: number;
  knockback: number;
  element: DamageElement;
  damageMultiplier: number;
  hitEntities: Set<EntityId>; // Prevent multi-hit per swing
  duration: number; // Active time
  maxHits: number; // Max entities to hit
  hitCount: number;
  sourceWeaponType?: WeaponType;
  sourceAttackId?: string;
}

export interface HitResult {
  hit: boolean;
  targetId?: EntityId;
  hitPoint: Vec3;
  hitNormal: Vec3;
  damage: number;
  staggerPower: number;
  knockback: number;
  element: DamageElement;
  isCritical: boolean;
  isBlocked: boolean;
  isParried: boolean;
  hitboxId: string;
}

export interface CombatState {
  isInCombat: boolean;
  combatStartTime: number;
  lastHitTime: number;
  hitCombo: number;
  maxCombo: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
}

// ============================================================================
// PARRY SYSTEM
// ============================================================================

export interface ParryWindow {
  entityId: EntityId;
  startTime: number;
  endTime: number;
  direction: Vec3; // Forward direction for parry
  angle: number; // Acceptable angle in radians
  onParry: (attackerId: EntityId, hitResult: HitResult) => void;
}

export interface HitstopInstance {
  duration: number;
  remaining: number;
  intensity: number;
  sourceId: EntityId;
  targetId: EntityId;
}

// ============================================================================
// LOCK-ON SYSTEM
// ============================================================================

export interface LockOnTarget {
  targetId: EntityId;
  targetPosition: Vec3;
  distance: number;
  screenPosition: { x: number; y: number };
  isValid: boolean;
  timeLocked: number;
}

// ============================================================================
// COMBAT SYSTEM
// ============================================================================

export class CombatSystem3D extends BaseSystem {
  readonly priority = 30;

  private hitboxes: Map<string, Hitbox> = new Map();
  private parryWindows: Map<EntityId, ParryWindow> = new Map();
  private hitstops: HitstopInstance[] = [];
  private lockOnTargets: Map<EntityId, LockOnTarget> = new Map();
  private combatStates: Map<EntityId, CombatState> = new Map();

  // Configuration
  private globalHitstopMultiplier = 1.0;
  private lockOnRange: number = PLAYER_CONFIG.lockOnRange;
  private lockOnAngle: number = PLAYER_CONFIG.lockOnAngle;
  private lockOnStickiness = 0.8; // How much camera sticks to target

  // Hitstop callback
  public onHitstop?: (duration: number, intensity: number) => void;
  public onHitConfirm?: (attackerId: EntityId, targetId: EntityId, hitResult: HitResult) => void;
  public onParry?: (parrierId: EntityId, attackerId: EntityId) => void;
  public onKill?: (killerId: EntityId, victimId: EntityId) => void;

  constructor(world: World) {
    super();
    this.setWorld(world);
  }

  // ============================================================================
  // HITBOX MANAGEMENT
  // ============================================================================

  createHitbox(config: {
    ownerId: EntityId;
    shape: Hitbox['shape'];
    offset: Vec3;
    rotation: Quat;
    size: Record<string, number>;
    damage: number;
    staggerPower: number;
    knockback: number;
    element: DamageElement;
    damageMultiplier?: number;
    duration: number;
    maxHits?: number;
    sourceWeaponType?: WeaponType;
    sourceAttackId?: string;
  }): string {
    const hitboxId = `hb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const hitbox: Hitbox = {
      id: hitboxId,
      ownerId: config.ownerId,
      shape: config.shape,
      offset: config.offset,
      rotation: config.rotation,
      size: config.size,
      damage: config.damage,
      staggerPower: config.staggerPower,
      knockback: config.knockback,
      element: config.element,
      damageMultiplier: config.damageMultiplier ?? 1.0,
      hitEntities: new Set(),
      duration: config.duration,
      maxHits: config.maxHits ?? 999,
      hitCount: 0,
      sourceWeaponType: config.sourceWeaponType,
      sourceAttackId: config.sourceAttackId,
    };

    this.hitboxes.set(hitboxId, hitbox);
    return hitboxId;
  }

  removeHitbox(hitboxId: string): void {
    this.hitboxes.delete(hitboxId);
  }

  getHitbox(hitboxId: string): Hitbox | undefined {
    return this.hitboxes.get(hitboxId);
  }

  getOwnerHitboxes(ownerId: EntityId): Hitbox[] {
    const results: Hitbox[] = [];
    for (const hitbox of this.hitboxes.values()) {
      if (hitbox.ownerId === ownerId) results.push(hitbox);
    }
    return results;
  }

  // ============================================================================
  // ATTACK EXECUTION
  // ============================================================================

  executeAttack(attackerId: EntityId, weaponType: WeaponType, attackId: string, comboStep: number): string[] {
    const weaponConfig = WEAPON_CONFIG[weaponType];
    if (!weaponConfig) return [];

    const attackerTransform = this.world.getComponent(attackerId, TransformComponent);
    if (!attackerTransform) return [];

    const hitboxIds: string[] = [];
    // Use default attack patterns if creature definitions not available
    const patterns: any[] = [];
    const pattern = patterns.find(p => p.id === attackId) || patterns[0];

    if (!pattern) {
      // Fallback: create basic hitbox from weapon config
      const hitboxId = this.createHitbox({
        ownerId: attackerId,
        shape: weaponConfig.hitboxShape,
        offset: this.getWeaponOffset(weaponType, comboStep),
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        size: weaponConfig.hitboxSize,
        damage: weaponConfig.damage,
        staggerPower: weaponConfig.staggerPower,
        knockback: weaponConfig.knockback,
        element: weaponConfig.elementalDamage ?? 'physical',
        duration: 1 / weaponConfig.attackSpeed * 0.5, // Active for half the attack duration
        maxHits: weaponConfig.hitboxShape === 'ray' ? 1 : 5,
        sourceWeaponType: weaponType,
        sourceAttackId: attackId,
      });
      hitboxIds.push(hitboxId);
    } else {
      // Create hitboxes from pattern
      for (const hbData of pattern.hitboxes) {
        const hitboxId = this.createHitbox({
          ownerId: attackerId,
          shape: hbData.shape,
          offset: hbData.offset,
          rotation: hbData.rotation,
          size: hbData.size,
          damage: Math.round(weaponConfig.damage * hbData.damageMultiplier),
          staggerPower: hbData.staggerPower,
          knockback: hbData.knockback,
          element: hbData.element ?? weaponConfig.elementalDamage ?? 'physical',
          damageMultiplier: hbData.damageMultiplier,
          duration: 1 / weaponConfig.attackSpeed * 0.6,
          maxHits: 3,
          sourceWeaponType: weaponType,
          sourceAttackId: attackId,
        });
        hitboxIds.push(hitboxId);
      }
    }

    // Initialize combat state
    this.ensureCombatState(attackerId);

    return hitboxIds;
  }

  private getWeaponOffset(weaponType: WeaponType, comboStep: number): Vec3 {
    // Returns the world-space offset for the weapon hitbox based on animation frame
    const offsets: Record<WeaponType, Vec3[]> = {
      [WeaponType.Sword]: [
        { x: 0, y: 1.2, z: 1.5 },
        { x: 0.3, y: 1.0, z: 1.8 },
        { x: -0.2, y: 1.4, z: 1.6 },
        { x: 0, y: 1.1, z: 2.0 },
      ],
      [WeaponType.Axe]: [
        { x: 0, y: 1.3, z: 1.2 },
        { x: 0.2, y: 1.1, z: 1.5 },
        { x: 0, y: 1.4, z: 1.8 },
      ],
      [WeaponType.Spear]: [
        { x: 0, y: 1.2, z: 2.5 },
        { x: 0, y: 1.0, z: 3.0 },
        { x: 0, y: 1.3, z: 2.8 },
        { x: 0, y: 1.1, z: 3.5 },
      ],
      [WeaponType.Daggers]: [
        { x: -0.3, y: 1.0, z: 1.0 },
        { x: 0.3, y: 1.0, z: 1.0 },
        { x: -0.2, y: 1.2, z: 0.8 },
        { x: 0.2, y: 1.2, z: 0.8 },
        { x: 0, y: 1.4, z: 1.2 },
        { x: 0, y: 1.1, z: 1.5 },
      ],
      [WeaponType.Hammer]: [
        { x: 0, y: 1.5, z: 1.0 },
        { x: 0, y: 1.8, z: 1.5 },
      ],
      [WeaponType.Staff]: [
        { x: 0, y: 1.3, z: 2.0 },
        { x: 0, y: 1.1, z: 2.5 },
        { x: 0, y: 1.4, z: 1.8 },
      ],
      [WeaponType.Bow]: [{ x: 0, y: 1.4, z: 0 }],
      [WeaponType.Gunlance]: [
        { x: 0, y: 1.2, z: 2.0 },
        { x: 0, y: 1.0, z: 2.5 },
        { x: 0, y: 1.3, z: 1.8 },
      ],
    };

    const weaponOffsets = offsets[weaponType] || [{ x: 0, y: 1.2, z: 1.5 }];
    const offset = weaponOffsets[comboStep % weaponOffsets.length];
    return offset ?? { x: 0, y: 1.2, z: 1.5 };
  }

  // ============================================================================
  // HIT DETECTION
  // ============================================================================

  private checkHitboxCollisions(dt: number): void {
    const hitboxesToRemove: string[] = [];

    for (const [hitboxId, hitbox] of this.hitboxes) {
      // Update duration
      hitbox.duration -= dt;
      if (hitbox.duration <= 0 || hitbox.hitCount >= hitbox.maxHits) {
        hitboxesToRemove.push(hitboxId);
        continue;
      }

      // Get owner transform
      const ownerTransform = this.world.getComponent(hitbox.ownerId, TransformComponent);
      if (!ownerTransform) {
        hitboxesToRemove.push(hitboxId);
        continue;
      }

      // Calculate world-space hitbox
      const worldHitbox = this.calculateWorldHitbox(hitbox, ownerTransform);

      // Find potential targets
      const targets = this.findTargetsInRange(hitbox.ownerId, worldHitbox);

      for (const targetId of targets) {
        if (hitbox.hitEntities.has(targetId)) continue;
        if (targetId === hitbox.ownerId) continue;

        const hitResult = this.testHitboxVsEntity(worldHitbox, targetId);
        if (hitResult.hit) {
          this.processHit(hitbox, targetId, hitResult);
          hitbox.hitEntities.add(targetId);
          hitbox.hitCount++;

          if (hitbox.hitCount >= hitbox.maxHits) break;
        }
      }
    }

    for (const id of hitboxesToRemove) {
      this.hitboxes.delete(id);
    }
  }

  private calculateWorldHitbox(hitbox: Hitbox, transform: TransformComponent): any {
    // Convert local hitbox to world space
    const worldPos = new THREE.Vector3(
      transform.position.x,
      transform.position.y,
      transform.position.z
    );

    const rotation = new THREE.Quaternion(
      transform.rotation.x,
      transform.rotation.y,
      transform.rotation.z,
      transform.rotation.w
    );

    const localOffset = new THREE.Vector3(hitbox.offset.x, hitbox.offset.y, hitbox.offset.z);
    const worldOffset = localOffset.applyQuaternion(rotation);
    const worldCenter = worldPos.add(worldOffset);

    const worldRotation = new THREE.Quaternion(
      hitbox.rotation.x,
      hitbox.rotation.y,
      hitbox.rotation.z,
      hitbox.rotation.w
    ).multiply(rotation);

    return {
      shape: hitbox.shape,
      center: worldCenter,
      rotation: worldRotation,
      size: hitbox.size,
      data: hitbox,
    };
  }

  private findTargetsInRange(attackerId: EntityId, worldHitbox: any): EntityId[] {
    const targets: EntityId[] = [];
    const range = this.getHitboxRange(worldHitbox) + 2; // Extra margin

    // Query all entities with TransformComponent
    const entities = this.world.query({ all: [TransformComponent] });

    for (const entityId of entities) {
      if (entityId === attackerId) continue;

      const targetTransform = this.world.getComponent(entityId, TransformComponent);
      if (!targetTransform) continue;

      const distance = this.distanceToHitbox(
        targetTransform.position,
        worldHitbox
      );

      if (distance <= range) {
        targets.push(entityId);
      }
    }

    return targets;
  }

  private getHitboxRange(hitbox: any): number {
    const size = hitbox.size;
    switch (hitbox.shape) {
      case 'sphere': return size.radius;
      case 'capsule': return size.length / 2 + size.radius;
      case 'box': return Math.max(size.x, size.y, size.z) / 2;
      case 'cone': return size.length;
      case 'ray': return size.length || 50;
      default: return 2;
    }
  }

  private distanceToHitbox(point: Vec3, hitbox: any): number {
    // Simplified distance check - in reality would use proper shape collision
    const center = hitbox.center;
    return Math.sqrt(
      (point.x - center.x) ** 2 +
      (point.y - center.y) ** 2 +
      (point.z - center.z) ** 2
    ) - this.getHitboxRange(hitbox);
  }

  private testHitboxVsEntity(worldHitbox: any, targetId: EntityId): HitResult {
    const targetTransform = this.world.getComponent(targetId, TransformComponent);
    if (!targetTransform) return { hit: false, hitPoint: { x: 0, y: 0, z: 0 }, hitNormal: { x: 0, y: 1, z: 0 }, damage: 0, staggerPower: 0, knockback: 0, element: 'physical', isCritical: false, isBlocked: false, isParried: false, hitboxId: '' };

    // Check if target has a collider/hitbox component
    // For now, use simple capsule collision for creatures
    const targetCapsule = {
      center: new THREE.Vector3(targetTransform.position.x, targetTransform.position.y + 1, targetTransform.position.z),
      radius: 0.6,
      height: 2.0,
    };

    const hitboxData = worldHitbox.data;
    let hit = false;
    let hitPoint: Vec3 = { x: 0, y: 0, z: 0 };
    let hitNormal: Vec3 = { x: 0, y: 1, z: 0 };

    // Simplified collision tests
    switch (worldHitbox.shape) {
      case 'sphere':
        hit = this.sphereCapsuleIntersection(
          worldHitbox.center,
          worldHitbox.size.radius,
          targetCapsule
        );
        break;
      case 'capsule':
        hit = this.capsuleCapsuleIntersection(
          worldHitbox.center,
          worldHitbox.rotation,
          worldHitbox.size.radius,
          worldHitbox.size.length,
          targetCapsule
        );
        break;
      case 'box':
        hit = this.boxCapsuleIntersection(
          worldHitbox.center,
          worldHitbox.rotation,
          new THREE.Vector3(worldHitbox.size.x, worldHitbox.size.y, worldHitbox.size.z),
          targetCapsule
        );
        break;
      case 'cone':
        hit = this.coneCapsuleIntersection(
          worldHitbox.center,
          worldHitbox.rotation,
          worldHitbox.size.angle,
          worldHitbox.size.length,
          targetCapsule
        );
        break;
      case 'ray':
        hit = this.rayCapsuleIntersection(
          worldHitbox.center,
          new THREE.Vector3().setFromEuler(new THREE.Euler(0, 0, 0)).applyQuaternion(worldHitbox.rotation),
          worldHitbox.size.length || 50,
          targetCapsule
        );
        break;
    }

    if (hit) {
      hitPoint = { x: targetTransform.position.x, y: targetTransform.position.y + 1, z: targetTransform.position.z };
      hitNormal = this.calculateHitNormal(worldHitbox.center, targetTransform.position);
    }

    // Check for critical hit (headshot, backstab, etc.)
    const isCritical = this.checkCriticalHit(worldHitbox, targetTransform);

    return {
      hit,
      targetId,
      hitPoint,
      hitNormal,
      damage: hitboxData.damage,
      staggerPower: hitboxData.staggerPower,
      knockback: hitboxData.knockback,
      element: hitboxData.element,
      isCritical,
      isBlocked: false,
      isParried: false,
      hitboxId: hitboxData.id,
    };
  }

  // Simplified collision functions
  private sphereCapsuleIntersection(sphereCenter: THREE.Vector3, radius: number, capsule: any): boolean {
    const dist = this.closestPointOnCapsule(sphereCenter, capsule);
    return dist <= radius;
  }

  private capsuleCapsuleIntersection(center: THREE.Vector3, rotation: THREE.Quaternion, radius: number, length: number, targetCapsule: any): boolean {
    // Simplified: treat as sphere with expanded radius
    const expandedRadius = radius + length / 2;
    return this.sphereCapsuleIntersection(center, expandedRadius, targetCapsule);
  }

  private boxCapsuleIntersection(center: THREE.Vector3, rotation: THREE.Quaternion, size: THREE.Vector3, targetCapsule: any): boolean {
    // Simplified: use max dimension as sphere radius
    const maxDim = Math.max(size.x, size.y, size.z) / 2;
    return this.sphereCapsuleIntersection(center, maxDim, targetCapsule);
  }

  private coneCapsuleIntersection(center: THREE.Vector3, rotation: THREE.Quaternion, angle: number, length: number, targetCapsule: any): boolean {
    // Check if capsule center is within cone
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation);
    const toTarget = new THREE.Vector3().subVectors(targetCapsule.center, center);
    const dist = toTarget.length();

    if (dist > length) return false;

    const cosAngle = dir.dot(toTarget.normalize());
    return cosAngle >= Math.cos(angle / 2);
  }

  private rayCapsuleIntersection(origin: THREE.Vector3, direction: THREE.Vector3, length: number, targetCapsule: any): boolean {
    const ray = new THREE.Ray(origin, direction);
    const dist = this.closestPointOnCapsule(ray.at(length, new THREE.Vector3()), targetCapsule);
    return dist <= 0.5; // Rough check
  }

  private closestPointOnCapsule(point: THREE.Vector3, capsule: any): number {
    const center = capsule.center;
    const radius = capsule.radius;
    const halfHeight = capsule.height / 2;

    const toPoint = new THREE.Vector3().subVectors(point, center);
    const y = Math.max(-halfHeight, Math.min(halfHeight, toPoint.y));
    const closest = new THREE.Vector3(0, y, 0).add(center);

    return point.distanceTo(closest) - radius;
  }

  private calculateHitNormal(attackerPos: THREE.Vector3, targetPos: Vec3): Vec3 {
    const dir = new THREE.Vector3(
      targetPos.x - attackerPos.x,
      targetPos.y - attackerPos.y,
      targetPos.z - attackerPos.z
    ).normalize();
    return { x: dir.x, y: dir.y, z: dir.z };
  }

  private checkCriticalHit(worldHitbox: any, targetTransform: TransformComponent): boolean {
    // Headshot check (hit above certain height)
    // Backstab check (attack from behind)
    // For now, random chance
    return Math.random() < 0.05;
  }

  // ============================================================================
  // HIT PROCESSING
  // ============================================================================

  private processHit(hitbox: Hitbox, targetId: EntityId, hitResult: HitResult): void {
    const attackerId = hitbox.ownerId;

    // Check parry
    const parryWindow = this.parryWindows.get(targetId);
    if (parryWindow && this.isParryValid(parryWindow, hitbox)) {
      hitResult.isParried = true;
      this.onParry?.(targetId, attackerId);
      this.triggerHitstop(0.15, 0.8, attackerId, targetId);
      this.createParryEffect(targetId, attackerId);
      return;
    }

    // Check block
    if (this.isBlocking(targetId, hitbox)) {
      hitResult.isBlocked = true;
      hitResult.damage *= 0.25; // Block reduces damage
      hitResult.staggerPower *= 0.5;
      hitResult.knockback *= 0.3;
      this.triggerHitstop(0.08, 0.4, attackerId, targetId);
    } else {
      // Normal hit
      const hitstopDuration = hitResult.isCritical ? 0.12 : 0.06;
      const hitstopIntensity = hitResult.isCritical ? 0.7 : 0.5;
      this.triggerHitstop(hitstopDuration, hitstopIntensity, attackerId, targetId);
    }

    // Apply damage
    this.applyDamage(targetId, hitResult, attackerId);

    // Update combat state
    this.updateCombatState(attackerId, targetId, hitResult);

    // Callbacks
    this.onHitConfirm?.(attackerId, targetId, hitResult);
  }

  private isParryValid(parryWindow: ParryWindow, hitbox: Hitbox): boolean {
    const now = performance.now() / 1000;
    if (now < parryWindow.startTime || now > parryWindow.endTime) return false;

    // Check if attack direction is within parry angle
    const hitboxOwnerTransform = this.world.getComponent(hitbox.ownerId, TransformComponent);
    const parrierTransform = this.world.getComponent(parryWindow.entityId, TransformComponent);
    if (!hitboxOwnerTransform || !parrierTransform) return false;

    const attackDir = new THREE.Vector3(
      parrierTransform.position.x - hitboxOwnerTransform.position.x,
      0,
      parrierTransform.position.z - hitboxOwnerTransform.position.z
    ).normalize();

    const parryDir = new THREE.Vector3(parryWindow.direction.x, 0, parryWindow.direction.z).normalize();

    const angle = Math.acos(Math.max(-1, Math.min(1, attackDir.dot(parryDir))));
    return angle <= parryWindow.angle;
  }

  private isBlocking(targetId: EntityId, hitbox: Hitbox): boolean {
    // Check if target is blocking and facing the attack
    // This would integrate with player/creature block state
    return false; // Placeholder
  }

  private applyDamage(targetId: EntityId, hitResult: HitResult, attackerId: EntityId): void {
    // This would integrate with health components
    // For now, emit event
    const event = new CustomEvent('entity-damaged', {
      detail: { targetId, hitResult, attackerId }
    });
    window.dispatchEvent(event);
  }

  private ensureCombatState(entityId: EntityId): void {
    if (!this.combatStates.has(entityId)) {
      this.combatStates.set(entityId, {
        isInCombat: true,
        combatStartTime: performance.now() / 1000,
        lastHitTime: performance.now() / 1000,
        hitCombo: 0,
        maxCombo: 0,
        totalDamageDealt: 0,
        totalDamageTaken: 0,
      });
    }
  }

  private updateCombatState(attackerId: EntityId, targetId: EntityId, hitResult: HitResult): void {
    let attackerState = this.combatStates.get(attackerId);
    if (!attackerState) {
      attackerState = {
        isInCombat: true,
        combatStartTime: performance.now() / 1000,
        lastHitTime: performance.now() / 1000,
        hitCombo: 0,
        maxCombo: 0,
        totalDamageDealt: 0,
        totalDamageTaken: 0,
      };
      this.combatStates.set(attackerId, attackerState);
    }

    attackerState.isInCombat = true;
    attackerState.lastHitTime = performance.now() / 1000;
    attackerState.hitCombo++;
    attackerState.maxCombo = Math.max(attackerState.maxCombo, attackerState.hitCombo);
    attackerState.totalDamageDealt += hitResult.damage;

    let targetState = this.combatStates.get(targetId);
    if (!targetState) {
      targetState = {
        isInCombat: true,
        combatStartTime: performance.now() / 1000,
        lastHitTime: performance.now() / 1000,
        hitCombo: 0,
        maxCombo: 0,
        totalDamageDealt: 0,
        totalDamageTaken: 0,
      };
      this.combatStates.set(targetId, targetState);
    }

    targetState.isInCombat = true;
    targetState.totalDamageTaken += hitResult.damage;
  }

  // ============================================================================
  // PARRY SYSTEM
  // ============================================================================

  startParryWindow(entityId: EntityId, duration: number, direction: Vec3, angle: number = Math.PI / 3): void {
    const now = performance.now() / 1000;
    this.parryWindows.set(entityId, {
      entityId,
      startTime: now,
      endTime: now + duration,
      direction,
      angle,
      onParry: () => {},
    });
  }

  endParryWindow(entityId: EntityId): void {
    this.parryWindows.delete(entityId);
  }

  // ============================================================================
  // HITSTOP
  // ============================================================================

  private triggerHitstop(duration: number, intensity: number, sourceId: EntityId, targetId: EntityId): void {
    const hitstop: HitstopInstance = {
      duration: duration * this.globalHitstopMultiplier,
      remaining: duration * this.globalHitstopMultiplier,
      intensity,
      sourceId,
      targetId,
    };
    this.hitstops.push(hitstop);

    this.onHitstop?.(hitstop.remaining, hitstop.intensity);
  }

  private updateHitstops(dt: number): void {
    for (let i = this.hitstops.length - 1; i >= 0; i--) {
      const hs = this.hitstops[i]!;
      hs.remaining -= dt;
      if (hs.remaining <= 0) {
        this.hitstops.splice(i, 1);
      }
    }
  }

  getTotalHitstopRemaining(): number {
    if (this.hitstops.length === 0) return 0;
    return Math.max(...this.hitstops.map(h => h.remaining));
  }

  // ============================================================================
  // LOCK-ON SYSTEM
  // ============================================================================

  updateLockOn(entityId: EntityId, cameraForward: THREE.Vector3, cameraPosition: THREE.Vector3): LockOnTarget | null {
    const entityTransform = this.world.getComponent(entityId, TransformComponent);
    if (!entityTransform) return null;

    let bestTarget: LockOnTarget | null = null;
    let bestScore = -1;

    const entities = this.world.query({ all: [TransformComponent] });

    for (const targetId of entities) {
      if (targetId === entityId) continue;

      const targetTransform = this.world.getComponent(targetId, TransformComponent);
      if (!targetTransform) continue;

      const toTarget = new THREE.Vector3(
        targetTransform.position.x - entityTransform.position.x,
        targetTransform.position.y + 1 - (entityTransform.position.y + 1.5),
        targetTransform.position.z - entityTransform.position.z
      );
      const distance = toTarget.length();

      if (distance > this.lockOnRange) continue;

      toTarget.normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, cameraForward.dot(toTarget))));
      if (angle > this.lockOnAngle) continue;

      // Score based on distance and angle
      const score = (1 - distance / this.lockOnRange) * 0.7 + (1 - angle / this.lockOnAngle) * 0.3;
      if (score > bestScore) {
        bestScore = score;
        bestTarget = {
          targetId,
          targetPosition: { x: targetTransform.position.x, y: targetTransform.position.y + 1, z: targetTransform.position.z },
          distance,
          screenPosition: { x: 0, y: 0 }, // Would project to screen
          isValid: true,
          timeLocked: performance.now() / 1000,
        };
      }
    }

    if (bestTarget) {
      this.lockOnTargets.set(entityId, bestTarget);
    } else {
      this.lockOnTargets.delete(entityId);
    }

    return bestTarget;
  }

  getLockOnTarget(entityId: EntityId): LockOnTarget | undefined {
    return this.lockOnTargets.get(entityId);
  }

  clearLockOn(entityId: EntityId): void {
    this.lockOnTargets.delete(entityId);
  }

  // ============================================================================
  // VISUAL EFFECTS
  // ============================================================================

  private createParryEffect(parrierId: EntityId, attackerId: EntityId): void {
    window.dispatchEvent(new CustomEvent('parry-effect', {
      detail: { parrierId, attackerId, timestamp: performance.now() }
    }));
  }

  // ============================================================================
  // UPDATE LOOP
  // ============================================================================

  update(dt: number): void {
    // Apply hitstop time dilation
    const effectiveDt = this.hitstops.length > 0 ? dt * 0.01 : dt; // Nearly freeze during hitstop

    this.checkHitboxCollisions(effectiveDt);
    this.updateHitstops(dt);

    // Clean up old combat states
    const now = performance.now() / 1000;
    for (const [entityId, state] of this.combatStates) {
      if (state.isInCombat && now - state.lastHitTime > 10) {
        state.isInCombat = false;
        state.hitCombo = 0;
      }
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getCombatState(entityId: EntityId): CombatState | undefined {
    return this.combatStates.get(entityId);
  }

  getActiveHitboxes(ownerId: EntityId): Hitbox[] {
    return this.getOwnerHitboxes(ownerId);
  }

  setGlobalHitstopMultiplier(multiplier: number): void {
    this.globalHitstopMultiplier = Math.max(0, multiplier);
  }

  setLockOnSettings(range: number, angle: number): void {
    this.lockOnRange = range as number;
    this.lockOnAngle = angle as number;
  }

  // Cleanup
  clearAllHitboxes(): void {
    this.hitboxes.clear();
  }

  clearAllParryWindows(): void {
    this.parryWindows.clear();
  }

  clearAllLockOns(): void {
    this.lockOnTargets.clear();
  }
}