/**
 * Player Entity - 3D locomotion, camera, inventory, combat
 * Integrates with ECS and Three.js
 */

import * as THREE from 'three';
import { World, EntityId, BaseSystem, TransformComponent, NameComponent, TagComponent } from '@core/ECS.js';
import { InputManager } from '@engine/InputManager.js';
import { SaveManager } from '@save/SaveManager.js';
import {
  Vec3, Quat, LocomotionState, ActionName, EquipmentSlot,
  ItemType, WeaponType, DamageType, BiomeType,
} from '@core/Types.js';
import {
  PLAYER_CONFIG, WEAPON_CONFIG, WORLD_CONFIG,
  CREATURE_CONFIG, ITEM_DEFINITIONS,
} from '@core/Config.js';
import type { WeaponTypeConfig } from '@core/Config.js';

// ============================================================================
// PLAYER COMPONENTS
// ============================================================================

export class PlayerComponent {
  entityId: EntityId;

  // Stats
  hp: number = PLAYER_CONFIG.maxHp;
  maxHp: number = PLAYER_CONFIG.maxHp;
  stamina: number = PLAYER_CONFIG.maxStamina;
  maxStamina: number = PLAYER_CONFIG.maxStamina;
  fury: number = 0;
  maxFury: number = PLAYER_CONFIG.maxFury;
  oxygen: number = 100;

  // Movement
  velocity: Vec3 = { x: 0, y: 0, z: 0 };
  moveInput: Vec3 = { x: 0, y: 0, z: 0 };
  locomotionState = LocomotionState.Idle;
  isGrounded = false;
  coyoteTimer = 0;
  jumpBufferTimer = 0;
  airJumps = 0;

  // Dash
  dashTimer = 0;
  dashCooldownTimer = 0;
  dashDirection: Vec3 | null = null;

  // Combat
  attackTimer = 0;
  comboStep = 0;
  comboTimer = 0;
  activeWeaponIndex = 0;
  equippedWeaponIds: (string | null)[] = [null, null, null];
  attackRange = PLAYER_CONFIG.attackRange;
  attackAngle = PLAYER_CONFIG.attackAngle;

  // Camera
  cameraDistance = PLAYER_CONFIG.cameraDistance;
  cameraPitch = 0;
  cameraYaw = 0;
  cameraTargetOffset: Vec3 = { x: 0, y: PLAYER_CONFIG.cameraHeightOffset, z: 0 };

  // Interaction
  interactTarget: EntityId | null = null;
  buildMode = false;

  // Stamina regen
  staminaRegenDelayTimer = 0;

  constructor(entityId: EntityId) {
    this.entityId = entityId;
  }
}

export class InventoryComponent {
  entityId: EntityId;
  width = PLAYER_CONFIG.inventoryWidth;
  height = PLAYER_CONFIG.inventoryHeight;
  slots: (InventorySlot | null)[] = [];
  maxStackSize = PLAYER_CONFIG.maxStackSize;

  constructor(entityId: EntityId) {
    this.entityId = entityId;
    this.slots = new Array(this.width * this.height).fill(null);
  }

  addItem(itemId: string, quantity: number = 1): boolean {
    const def = ITEM_DEFINITIONS[itemId];
    if (!def) return false;

    // Try stack
    if (def.maxStack > 1) {
      for (const slot of this.slots) {
        if (slot && slot.itemId === itemId && slot.quantity < def.maxStack) {
          const space = def.maxStack - slot.quantity;
          const add = Math.min(space, quantity);
          slot.quantity += add;
          quantity -= add;
          if (quantity <= 0) return true;
        }
      }
    }

    // Find empty slot
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { itemId, quantity: Math.min(quantity, def.maxStack) };
        quantity -= this.slots[i]!.quantity;
        if (quantity <= 0) return true;
      }
    }

    return quantity <= 0;
  }

  removeItem(itemId: string, quantity: number = 1): boolean {
    let remaining = quantity;
    for (const slot of this.slots) {
      if (slot && slot.itemId === itemId) {
        const remove = Math.min(slot.quantity, remaining);
        slot.quantity -= remove;
        remaining -= remove;
        if (slot.quantity <= 0) {
          this.slots[this.slots.indexOf(slot)] = null;
        }
        if (remaining <= 0) return true;
      }
    }
    return remaining <= 0;
  }

  getItemCount(itemId: string): number {
    let count = 0;
    for (const slot of this.slots) {
      if (slot && slot.itemId === itemId) count += slot.quantity;
    }
    return count;
  }

  getSlot(index: number): InventorySlot | null {
    const slot = this.slots[index];
    return slot ?? null;
  }

  setSlot(index: number, slot: InventorySlot | null): void {
    this.slots[index] = slot ?? null;
  }

  swapSlots(i: number, j: number): void {
    const temp = this.slots[i];
    this.slots[i] = this.slots[j] ?? null;
    this.slots[j] = temp ?? null;
  }
}

export interface InventorySlot {
  itemId: string;
  quantity: number;
  durability?: number;
  maxDurability?: number;
  enchantments?: string[];
}

// ============================================================================
// PLAYER SYSTEM
// ============================================================================

export class PlayerSystem extends BaseSystem {
  readonly priority = 20;

  private playerEntity: EntityId | null = null;
  private playerComp: PlayerComponent | null = null;
  private inventoryComp: InventoryComponent | null = null;
  private transformComp: TransformComponent | null = null;

  private inputManager: InputManager;
  private camera: THREE.PerspectiveCamera;
  private raycastTarget: THREE.Vector3 = new THREE.Vector3();

  // Raycaster for interactions
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(0, 0);

  constructor(
    world: World,
    inputManager: InputManager,
    camera: THREE.PerspectiveCamera
  ) {
    super();
    this.inputManager = inputManager;
    this.camera = camera;
  }

  createPlayer(spawnPosition: Vec3 = { x: 0, y: 35, z: 0 }): EntityId {
    const entityId = this.world.createEntity();

    // Transform
    this.transformComp = new TransformComponent(entityId);
    this.transformComp.setPosition(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    this.world.addComponent(entityId, this.transformComp);

    // Player component
    this.playerComp = new PlayerComponent(entityId);
    this.playerComp.equippedWeaponIds = ['wooden_sword', null, null];
    this.world.addComponent(entityId, this.playerComp);

    // Inventory
    this.inventoryComp = new InventoryComponent(entityId);
    this.inventoryComp.addItem('wood', 50);
    this.inventoryComp.addItem('stone', 20);
    this.inventoryComp.addItem('health_potion', 5);
    this.world.addComponent(entityId, this.inventoryComp);

    // Name & Tag
    const nameComp = new NameComponent(entityId, 'Player');
    const tagComp = new TagComponent(entityId, 'player', 'character');
    this.world.addComponent(entityId, nameComp);
    this.world.addComponent(entityId, tagComp);

    this.playerEntity = entityId;
    return entityId;
  }

  getPlayerEntity(): EntityId | null {
    return this.playerEntity;
  }

  getPlayerComponent(): PlayerComponent | null {
    return this.playerComp;
  }

  getInventory(): InventoryComponent | null {
    return this.inventoryComp;
  }

  // ---- Update ----

  update(dt: number): void {
    if (!this.playerEntity || !this.playerComp || !this.transformComp) return;

    this.handleInput(dt);
    this.updateMovement(dt);
    this.updateCamera(dt);
    this.updateCombat(dt);
    this.updateStamina(dt);
    this.updateFury(dt);
    this.updateLocomotionState();
  }

  private updateCombat(dt: number): void {
    const player = this.playerComp!;
    if (player.attackTimer > 0) {
      player.attackTimer = Math.max(0, player.attackTimer - dt);
    }
  }

  // ---- Input Handling ----

  private handleInput(dt: number): void {
    const input = this.inputManager.getState();
    const player = this.playerComp!;

    // Movement input
    const moveX = input.move.x;
    const moveZ = input.move.y; // y is forward/back in our input

    player.moveInput.x = moveX;
    player.moveInput.z = moveZ;

    // Jump
    if (this.inputManager.isActionPressed(ActionName.Jump)) {
      player.jumpBufferTimer = PLAYER_CONFIG.coyoteTime;
    }

    // Sprint
    const wantsSprint = this.inputManager.isActionDown(ActionName.Sprint);
    if (wantsSprint && player.stamina > 0 && player.isGrounded) {
      // Handled in movement
    }

    // Dodge/Dash
    if (this.inputManager.isActionPressed(ActionName.Dodge) && player.dashCooldownTimer <= 0 && player.stamina >= PLAYER_CONFIG.dashStaminaCost) {
      this.startDash();
    }

    // Attack
    if (this.inputManager.isActionDown(ActionName.AttackPrimary)) {
      this.tryAttack();
    }

    // Weapon swap
    if (this.inputManager.isActionPressed(ActionName.WeaponSwap1)) this.switchWeapon(0);
    if (this.inputManager.isActionPressed(ActionName.WeaponSwap2)) this.switchWeapon(1);
    if (this.inputManager.isActionPressed(ActionName.WeaponSwap3)) this.switchWeapon(2);

    // Skills
    if (this.inputManager.isActionPressed(ActionName.Skill1)) this.useSkill(0);
    if (this.inputManager.isActionPressed(ActionName.Skill2)) this.useSkill(1);
    if (this.inputManager.isActionPressed(ActionName.Skill3)) this.useSkill(2);
    if (this.inputManager.isActionPressed(ActionName.Skill4)) this.useSkill(3);

    // Interact
    if (this.inputManager.isActionPressed(ActionName.Interact)) {
      this.tryInteract();
    }

    // Build mode toggle
    if (this.inputManager.isActionPressed(ActionName.Block)) {
      player.buildMode = !player.buildMode;
    }

    // Camera reset
    if (this.inputManager.isActionPressed(ActionName.CameraReset)) {
      player.cameraPitch = 0;
      player.cameraYaw = 0;
    }
  }

  // ---- Movement ----

  private updateMovement(dt: number): void {
    const player = this.playerComp!;
    const transform = this.transformComp!;

    // Gravity
    player.velocity.y += WORLD_CONFIG.gravity * dt;
    player.velocity.y = Math.max(player.velocity.y, WORLD_CONFIG.terminalVelocity);

    // Ground check
    this.checkGrounded();
    player.coyoteTimer = player.isGrounded ? PLAYER_CONFIG.coyoteTime : Math.max(0, player.coyoteTimer - dt);
    player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt);

    // Handle jump
    if (player.jumpBufferTimer > 0 && (player.isGrounded || player.coyoteTimer > 0 || player.airJumps > 0)) {
      if (!player.isGrounded && player.coyoteTimer <= 0) {
        player.airJumps--;
      }
      player.velocity.y = Math.sqrt(2 * -WORLD_CONFIG.gravity * PLAYER_CONFIG.jumpHeight);
      player.jumpBufferTimer = 0;
      player.coyoteTimer = 0;
      player.isGrounded = false;
    }

    // Air jumps reset on ground
    if (player.isGrounded) {
      player.airJumps = PLAYER_CONFIG.maxAirJumps;
    }

    // Dash
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      if (player.dashDirection) {
        const dashSpeed = PLAYER_CONFIG.dashDistance / PLAYER_CONFIG.dashDuration;
        player.velocity.x = player.dashDirection.x * dashSpeed;
        player.velocity.z = player.dashDirection.z * dashSpeed;
        player.velocity.y = 0;
      }
    } else if (player.dashCooldownTimer > 0) {
      player.dashCooldownTimer -= dt;
    }

    // Calculate forward/right vectors for movement and rotation
    const forward = this.getForwardVector();
    const right = this.getRightVector();

    // Normal movement (when not dashing)
    if (player.dashTimer <= 0) {
      const isSprinting = this.inputManager.isActionDown(ActionName.Sprint) && player.stamina > 0 && player.isGrounded;
      const targetSpeed = isSprinting ? PLAYER_CONFIG.sprintSpeed : PLAYER_CONFIG.runSpeed;
      const acceleration = player.isGrounded ? PLAYER_CONFIG.acceleration : PLAYER_CONFIG.airAcceleration;

      const targetVelX = (forward.x * player.moveInput.z + right.x * player.moveInput.x) * targetSpeed;
      const targetVelZ = (forward.z * player.moveInput.z + right.z * player.moveInput.x) * targetSpeed;

      // Smooth velocity
      player.velocity.x = this.lerp(player.velocity.x, targetVelX, acceleration * dt);
      player.velocity.z = this.lerp(player.velocity.z, targetVelZ, acceleration * dt);

      // Sprint stamina cost
      if (isSprinting && (player.moveInput.x !== 0 || player.moveInput.z !== 0)) {
        player.stamina = Math.max(0, player.stamina - PLAYER_CONFIG.sprintStaminaCost * dt);
        player.staminaRegenDelayTimer = PLAYER_CONFIG.staminaRegenDelay;
      }
    }

    // Apply velocity
    transform.position.x += player.velocity.x * dt;
    transform.position.y += player.velocity.y * dt;
    transform.position.z += player.velocity.z * dt;

    // Clamp to world bounds (temporary)
    const worldLimit = 5000;
    transform.position.x = Math.max(-worldLimit, Math.min(worldLimit, transform.position.x));
    transform.position.z = Math.max(-worldLimit, Math.min(worldLimit, transform.position.z));

    // Update rotation to face movement direction (when moving)
    if (player.moveInput.x !== 0 || player.moveInput.z !== 0 && player.dashTimer <= 0) {
      const targetYaw = Math.atan2(
        forward.x * player.moveInput.z + right.x * player.moveInput.x,
        forward.z * player.moveInput.z + right.z * player.moveInput.x
      );
      transform.rotation.y = this.lerpAngle(transform.rotation.y, targetYaw, PLAYER_CONFIG.turnSpeed * dt);
    }
  }

  private checkGrounded(): void {
    const player = this.playerComp!;
    const transform = this.transformComp!;

    // Raycast down
    this.raycaster.set(
      new THREE.Vector3(transform.position.x, transform.position.y + 0.5, transform.position.z),
      new THREE.Vector3(0, -1, 0)
    );
    this.raycaster.far = PLAYER_CONFIG.capsuleHeight / 2 + 0.2;

    // In a real implementation, this would raycast against the terrain
    // For now, simple height check
    const groundY = 32; // Temporary
    player.isGrounded = transform.position.y <= groundY + 0.1 && player.velocity.y <= 0;

    if (player.isGrounded) {
      transform.position.y = groundY;
      player.velocity.y = 0;
    }
  }

  private startDash(): void {
    const player = this.playerComp!;
    const transform = this.transformComp!;

    player.dashTimer = PLAYER_CONFIG.dashDuration;
    player.dashCooldownTimer = PLAYER_CONFIG.dashCooldown;
    player.stamina -= PLAYER_CONFIG.dashStaminaCost;
    player.staminaRegenDelayTimer = PLAYER_CONFIG.staminaRegenDelay;

    // Dash in camera direction or movement direction
    const forward = this.getForwardVector();
    const right = this.getRightVector();

    const moveX = player.moveInput.x;
    const moveZ = player.moveInput.z;

    if (moveX !== 0 || moveZ !== 0) {
      player.dashDirection = {
        x: forward.x * moveZ + right.x * moveX,
        y: 0,
        z: forward.z * moveZ + right.z * moveX,
      };
      const len = Math.sqrt(player.dashDirection.x ** 2 + player.dashDirection.z ** 2);
      if (len > 0) {
        player.dashDirection.x /= len;
        player.dashDirection.z /= len;
      }
    } else {
      // Dash in camera forward direction
      player.dashDirection = { x: forward.x, y: 0, z: forward.z };
    }
  }

  // ---- Camera ----

  private updateCamera(dt: number): void {
    const player = this.playerComp!;
    const transform = this.transformComp!;
    const input = this.inputManager.getState();

    // Mouse look
    const lookDelta = input.look;
    player.cameraYaw -= lookDelta.x;
    player.cameraPitch -= lookDelta.y;
    player.cameraPitch = Math.max(
      THREE.MathUtils.degToRad(PLAYER_CONFIG.cameraPitchMin),
      Math.min(THREE.MathUtils.degToRad(PLAYER_CONFIG.cameraPitchMax), player.cameraPitch)
    );

    // Calculate camera position
    const yaw = player.cameraYaw;
    const pitch = player.cameraPitch;

    const offsetX = Math.sin(yaw) * Math.cos(pitch) * player.cameraDistance;
    const offsetY = Math.sin(pitch) * player.cameraDistance + player.cameraTargetOffset.y;
    const offsetZ = Math.cos(yaw) * Math.cos(pitch) * player.cameraDistance;

    this.camera.position.set(
      transform.position.x + offsetX,
      transform.position.y + offsetY,
      transform.position.z + offsetZ
    );

    // Look at player
    this.camera.lookAt(
      transform.position.x + player.cameraTargetOffset.x,
      transform.position.y + player.cameraTargetOffset.y,
      transform.position.z + player.cameraTargetOffset.z
    );
  }

  // ---- Combat ----

  private tryAttack(): void {
    const player = this.playerComp!;
    if (player.attackTimer > 0) return;

    const weaponId = player.equippedWeaponIds[player.activeWeaponIndex];
    if (!weaponId) return;

    const weaponDef = ITEM_DEFINITIONS[weaponId];
    if (!weaponDef || !weaponDef.weaponType) return;

    const weaponConfig = WEAPON_CONFIG[weaponDef.weaponType];
    if (!weaponConfig) return;

    // Check stamina
    if (player.stamina < weaponConfig.staminaCost) return;

    // Start attack
    player.attackTimer = 1 / weaponConfig.attackSpeed;
    player.stamina -= weaponConfig.staminaCost;
    player.staminaRegenDelayTimer = PLAYER_CONFIG.staminaRegenDelay;

    // Combo
    const now = Date.now();
    if (player.comboTimer > 0 && now - player.comboTimer < 500) {
      player.comboStep = (player.comboStep + 1) % weaponConfig.comboCount;
    } else {
      player.comboStep = 0;
    }
    player.comboTimer = now;

    // Trigger attack hitbox (would be handled by combat system)
    this.executeAttack(weaponConfig, weaponDef.weaponType);
  }

  private executeAttack(weaponConfig: WeaponTypeConfig, weaponType: WeaponType): void {
    // This would create a hitbox entity in the combat system
    console.log(`Attack with ${weaponType}, combo step ${this.playerComp!.comboStep}`);
  }

  private switchWeapon(index: number): void {
    const player = this.playerComp!;
    if (index >= 0 && index < 3 && player.equippedWeaponIds[index]) {
      player.activeWeaponIndex = index;
      player.comboStep = 0;
      player.comboTimer = 0;
    }
  }

  private useSkill(index: number): void {
    // Skill system integration
    console.log(`Use skill ${index + 1}`);
  }

  private tryInteract(): void {
    const player = this.playerComp!;
    // Raycast for interactables
    this.raycaster.setFromCamera(this.mouse, this.camera);
    // Would check for interactable entities
  }

  // ---- Stats ----

  private updateStamina(dt: number): void {
    const player = this.playerComp!;
    player.staminaRegenDelayTimer = Math.max(0, player.staminaRegenDelayTimer - dt);

    if (player.staminaRegenDelayTimer <= 0 && player.stamina < player.maxStamina) {
      player.stamina = Math.min(player.maxStamina, player.stamina + PLAYER_CONFIG.staminaRegenRate * dt);
    }
  }

  private updateFury(dt: number): void {
    const player = this.playerComp!;
    if (player.fury > 0) {
      player.fury = Math.max(0, player.fury - PLAYER_CONFIG.furyDecayRate * dt);
    }
  }

  private updateLocomotionState(): void {
    const player = this.playerComp!;

    if (player.dashTimer > 0) {
      player.locomotionState = LocomotionState.Dash;
    } else if (!player.isGrounded) {
      player.locomotionState = player.velocity.y > 0 ? LocomotionState.Jump : LocomotionState.Fall;
    } else if (player.moveInput.x !== 0 || player.moveInput.z !== 0) {
      const isSprinting = this.inputManager.isActionDown(ActionName.Sprint) && player.stamina > 0;
      player.locomotionState = isSprinting ? LocomotionState.Sprint : LocomotionState.Run;
    } else {
      player.locomotionState = LocomotionState.Idle;
    }
  }

  // ---- Helpers ----

  private getForwardVector(): Vec3 {
    const yaw = this.playerComp!.cameraYaw;
    return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
  }

  private getRightVector(): Vec3 {
    const yaw = this.playerComp!.cameraYaw + Math.PI / 2;
    return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.min(1, t);
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * Math.min(1, t);
  }

  // ---- Public API ----

  takeDamage(amount: number, source?: EntityId): void {
    const player = this.playerComp!;
    player.hp = Math.max(0, player.hp - amount);
    player.fury = Math.min(player.maxFury, player.fury + PLAYER_CONFIG.furyGainOnHit);
    if (player.hp <= 0) {
      this.die();
    }
  }

  heal(amount: number): void {
    const player = this.playerComp!;
    player.hp = Math.min(player.maxHp, player.hp + amount);
  }

  addFury(amount: number): void {
    const player = this.playerComp!;
    player.fury = Math.min(player.maxFury, player.fury + amount);
  }

  private die(): void {
    console.log('Player died!');
    // Handle death - respawn, etc.
  }

  // ---- Save/Load ----

  serializePlayerState(): any {
    const player = this.playerComp!;
    const transform = this.transformComp!;

    return {
      position: { ...transform.position },
      rotation: { ...transform.rotation },
      velocity: { ...player.velocity },
      locomotionState: player.locomotionState,
      hp: player.hp,
      maxHp: player.maxHp,
      stamina: player.stamina,
      maxStamina: player.maxStamina,
      fury: player.fury,
      oxygen: player.oxygen,
      equippedWeapons: [...player.equippedWeaponIds],
      activeWeaponIndex: player.activeWeaponIndex,
      skillCooldowns: {}, // Would track actual cooldowns
      skillLevels: {},
      inventory: this.inventoryComp!.slots.map(s => s ? { ...s } : null).filter(Boolean),
      activeBuffs: [],
    };
  }

  deserializePlayerState(data: any): void {
    const player = this.playerComp!;
    const transform = this.transformComp!;

    if (data.position) transform.setPosition(data.position.x, data.position.y, data.position.z);
    if (data.rotation) transform.setRotation(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
    if (data.velocity) player.velocity = data.velocity;
    player.locomotionState = data.locomotionState || LocomotionState.Idle;
    player.hp = data.hp || player.maxHp;
    player.maxHp = data.maxHp || player.maxHp;
    player.stamina = data.stamina || player.maxStamina;
    player.maxStamina = data.maxStamina || player.maxStamina;
    player.fury = data.fury || 0;
    player.oxygen = data.oxygen || 100;
    player.equippedWeaponIds = data.equippedWeaponIds || [null, null, null];
    player.activeWeaponIndex = data.activeWeaponIndex || 0;

    // Restore inventory
    if (data.inventory && this.inventoryComp) {
      this.inventoryComp.slots.fill(null);
      for (let i = 0; i < data.inventory.length; i++) {
        if (data.inventory[i]) {
          this.inventoryComp.slots[i] = data.inventory[i];
        }
      }
    }
  }
}