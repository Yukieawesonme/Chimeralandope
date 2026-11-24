/**
 * Weapon System 3D - 3 Weapon Slots, Swap, Combos, Skills
 * Manages weapon state, combos, skills, and attack execution
 */

import { World, EntityId, BaseSystem } from '@core/ECS.js';
import { TransformComponent } from '@core/ECS.js';
import { PlayerComponent } from '@entities/Player.js';
import { CombatSystem3D, Hitbox } from './CombatSystem3D.js';
import { WEAPON_CONFIG, ITEM_DEFINITIONS } from '@core/Config.js';
import { WeaponType, WeaponTypeConfig, ItemType, EquipmentSlot, DamageElement, ActionName } from '@core/Types.js';
import { InputManager } from '@engine/InputManager.js';

// ============================================================================
// WEAPON STATE
// ============================================================================

export interface WeaponState {
  weaponId: string | null;
  weaponType: WeaponType | undefined;
  config: WeaponTypeConfig | undefined;

  // Combo
  comboStep: number;
  comboTimer: number;
  maxCombo: number;
  lastAttackTime: number;

  // Cooldowns
  attackCooldown: number;
  skillCooldowns: Record<string, number>;

  // Charge
  isCharging: boolean;
  chargeLevel: number; // 0-1
  chargeStartTime: number;

  // Ammo (for ranged)
  currentAmmo: number;
  maxAmmo: number;
  reloadTime: number;
  isReloading: boolean;

  // Durability
  durability: number;
  maxDurability: number;
}

export interface EquippedWeapons {
  main: WeaponState;
  offhand: WeaponState;
  ranged: WeaponState;
  activeSlot: 0 | 1 | 2; // 0=main, 1=offhand, 2=ranged
}

export interface SkillState {
  skillId: string;
  currentCooldown: number;
  maxCooldown: number;
  charges: number;
  maxCharges: number;
  chargeRechargeTime: number;
  level: number;
  isUnlocked: boolean;
}

// ============================================================================
// WEAPON SYSTEM
// ============================================================================

export class WeaponSystem3D extends BaseSystem {
  readonly priority = 25;

  private playerEntity: EntityId | null = null;
  private playerComp: PlayerComponent | null = null;
  private combatSystem: CombatSystem3D;
  private inputManager: InputManager;

  // Weapon states per entity (for future multiplayer/NPCs)
  private weaponStates: Map<EntityId, EquippedWeapons> = new Map();

  // Skill definitions
  private skillDefinitions: Map<string, SkillDefinition> = new Map();

  // Callbacks
  public onWeaponSwap?: (entityId: EntityId, oldSlot: number, newSlot: number) => void;
  public onAttack?: (entityId: EntityId, weaponType: WeaponType, comboStep: number) => void;
  public onSkillUse?: (entityId: EntityId, skillId: string) => void;
  public onComboChange?: (entityId: EntityId, comboStep: number, maxCombo: number) => void;

  constructor(
    world: World,
    combatSystem: CombatSystem3D,
    inputManager: InputManager
  ) {
    super();
    this.combatSystem = combatSystem;
    this.inputManager = inputManager;
    this.initializeSkillDefinitions();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  setPlayerEntity(entityId: EntityId): void {
    this.playerEntity = entityId;
    const playerComp = this.world.getComponent(entityId, PlayerComponent);
    this.playerComp = playerComp ?? null;
    this.initializePlayerWeapons(entityId);
  }

  private initializePlayerWeapons(entityId: EntityId): void {
    const playerComp = this.playerComp;
    if (!playerComp) return;

    const activeSlot = Math.min(Math.max(playerComp.activeWeaponIndex, 0), 2) as 0 | 1 | 2;

    const equipped: EquippedWeapons = {
      main: this.createWeaponState(playerComp.equippedWeaponIds[0] ?? null),
      offhand: this.createWeaponState(playerComp.equippedWeaponIds[1] ?? null),
      ranged: this.createWeaponState(playerComp.equippedWeaponIds[2] ?? null),
      activeSlot,
    };

    this.weaponStates.set(entityId, equipped);
  }

  private createWeaponState(weaponId: string | null): WeaponState {
    if (!weaponId) {
      return this.emptyWeaponState();
    }

    const itemDef = ITEM_DEFINITIONS[weaponId];
    if (!itemDef || !itemDef.weaponType) {
      return this.emptyWeaponState();
    }

    const config = WEAPON_CONFIG[itemDef.weaponType];
    return {
      weaponId,
      weaponType: itemDef.weaponType,
      config,
      comboStep: 0,
      comboTimer: 0,
      maxCombo: config.comboCount,
      lastAttackTime: 0,
      attackCooldown: 0,
      skillCooldowns: {},
      isCharging: false,
      chargeLevel: 0,
      chargeStartTime: 0,
      currentAmmo: config.hitboxShape === 'ray' ? 30 : 0,
      maxAmmo: config.hitboxShape === 'ray' ? 30 : 0,
      reloadTime: 1.5,
      isReloading: false,
      durability: itemDef.durability ?? 100,
      maxDurability: itemDef.durability ?? 100,
    };
  }

  private emptyWeaponState(): WeaponState {
    return {
      weaponId: null,
      weaponType: undefined,
      config: undefined,
      comboStep: 0,
      comboTimer: 0,
      maxCombo: 0,
      lastAttackTime: 0,
      attackCooldown: 0,
      skillCooldowns: {},
      isCharging: false,
      chargeLevel: 0,
      chargeStartTime: 0,
      currentAmmo: 0,
      maxAmmo: 0,
      reloadTime: 0,
      isReloading: false,
      durability: 0,
      maxDurability: 0,
    };
  }

  private initializeSkillDefinitions(): void {
    // Weapon Skills
    this.registerSkill({
      id: 'whirlwind',
      name: 'Redemoinho',
      weaponTypes: [WeaponType.Sword, WeaponType.Axe],
      cooldown: 12,
      cost: { stamina: 25 },
      description: 'Gira a arma em 360°, atingindo todos ao redor',
      execute: (entityId, weaponState) => this.executeWhirlwind(entityId, weaponState),
    });

    this.registerSkill({
      id: 'parry',
      name: 'Aparar',
      weaponTypes: [WeaponType.Sword, WeaponType.Daggers, WeaponType.Spear],
      cooldown: 8,
      cost: { stamina: 15 },
      description: 'Bloqueia o próximo ataque e contra-ataca',
      execute: (entityId, weaponState) => this.executeParry(entityId, weaponState),
    });

    this.registerSkill({
      id: 'lunge',
      name: 'Investida',
      weaponTypes: [WeaponType.Sword, WeaponType.Spear],
      cooldown: 10,
      cost: { stamina: 20, fury: 10 },
      description: 'Avança rapidamente perfurando inimigos',
      execute: (entityId, weaponState) => this.executeLunge(entityId, weaponState),
    });

    this.registerSkill({
      id: 'execute',
      name: 'Execução',
      weaponTypes: [WeaponType.Axe],
      cooldown: 15,
      cost: { stamina: 30, fury: 15 },
      description: 'Golpe poderoso que ignora armadura',
      execute: (entityId, weaponState) => this.executeExecute(entityId, weaponState),
    });

    this.registerSkill({
      id: 'cleave',
      name: 'Cleave',
      weaponTypes: [WeaponType.Axe, WeaponType.Hammer],
      cooldown: 10,
      cost: { stamina: 25 },
      description: 'Corte amplo em cone frontal',
      execute: (entityId, weaponState) => this.executeCleave(entityId, weaponState),
    });

    this.registerSkill({
      id: 'impale',
      name: 'Empalar',
      weaponTypes: [WeaponType.Spear],
      cooldown: 12,
      cost: { stamina: 20, fury: 10 },
      description: 'Perfura alvo e aplica sangramento pesado',
      execute: (entityId, weaponState) => this.executeImpale(entityId, weaponState),
    });

    this.registerSkill({
      id: 'rapid_fire',
      name: 'Tiro Rápido',
      weaponTypes: [WeaponType.Bow],
      cooldown: 8,
      cost: { stamina: 15 },
      description: 'Dispara 3 flechas em sequência rápida',
      execute: (entityId, weaponState) => this.executeRapidFire(entityId, weaponState),
    });

    this.registerSkill({
      id: 'fireball',
      name: 'Bola de Fogo',
      weaponTypes: [WeaponType.Staff],
      cooldown: 10,
      cost: { stamina: 20, fury: 5 },
      description: 'Lança projétil explosivo de fogo',
      execute: (entityId, weaponState) => this.executeFireball(entityId, weaponState),
    });

    this.registerSkill({
      id: 'flurry',
      name: 'Saraivada',
      weaponTypes: [WeaponType.Daggers],
      cooldown: 8,
      cost: { stamina: 20 },
      description: 'Seqüência de 6 golpes ultra-rápidos',
      execute: (entityId, weaponState) => this.executeFlurry(entityId, weaponState),
    });

    this.registerSkill({
      id: 'ground_slam',
      name: 'Impacto Sísmico',
      weaponTypes: [WeaponType.Hammer],
      cooldown: 18,
      cost: { stamina: 35, fury: 20 },
      description: 'Bate o martelo no chão criando onda de choque',
      execute: (entityId, weaponState) => this.executeGroundSlam(entityId, weaponState),
    });

    this.registerSkill({
      id: 'wyvern_fire',
      name: 'Fogo de Wyvern',
      weaponTypes: [WeaponType.Gunlance],
      cooldown: 25,
      cost: { stamina: 40, fury: 25 },
      description: 'Dispara rajada massiva de energia',
      execute: (entityId, weaponState) => this.executeWyvernFire(entityId, weaponState),
    });
  }

  private registerSkill(def: SkillDefinition): void {
    this.skillDefinitions.set(def.id, def);
  }

  // ============================================================================
  // SKILL EXECUTION
  // ============================================================================

  private executeWhirlwind(entityId: EntityId, weaponState: WeaponState): void {
    const hitboxId = this.combatSystem.createHitbox({
      ownerId: entityId,
      shape: 'sphere',
      offset: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      size: { radius: 3.5 },
      damage: Math.round((weaponState.config?.damage ?? 20) * 0.6),
      staggerPower: 8,
      knockback: 3,
      element: 'physical',
      duration: 0.8,
      maxHits: 8,
      sourceWeaponType: weaponState.weaponType,
      sourceAttackId: 'whirlwind',
    });

    // Visual effect event
    window.dispatchEvent(new CustomEvent('skill-effect', {
      detail: { type: 'whirlwind', entityId, hitboxId, radius: 3.5 }
    }));
  }

  private executeParry(entityId: EntityId, weaponState: WeaponState): void {
    // Parry window handled by CombatSystem3D
    this.combatSystem.startParryWindow(entityId, 0.5, { x: 0, y: 0, z: 1 }, Math.PI / 2.5);

    window.dispatchEvent(new CustomEvent('skill-effect', {
      detail: { type: 'parry', entityId, duration: 0.5 }
    }));
  }

  private executeLunge(entityId: EntityId, weaponState: WeaponState): void {
    const hitboxId = this.combatSystem.createHitbox({
      ownerId: entityId,
      shape: 'capsule',
      offset: { x: 0, y: 1, z: 2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      size: { radius: 0.4, length: 5 },
      damage: Math.round((weaponState.config?.damage ?? 20) * 1.5),
      staggerPower: 12,
      knockback: 5,
      element: 'physical',
      duration: 0.4,
      maxHits: 3,
      sourceWeaponType: weaponState.weaponType,
      sourceAttackId: 'lunge',
    });

    // Movement dash
    window.dispatchEvent(new CustomEvent('skill-movement', {
      detail: { type: 'lunge', entityId, distance: 6, hitboxId }
    }));
  }

  private executeExecute(entityId: EntityId, weaponState: WeaponState): void {
    const hitboxId = this.combatSystem.createHitbox({
      ownerId: entityId,
      shape: 'box',
      offset: { x: 0, y: 1.2, z: 1.5 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      size: { x: 2, y: 1.5, z: 2.5 },
      damage: Math.round((weaponState.config?.damage ?? 35) * 2.5),
      staggerPower: 30,
      knockback: 8,
      element: 'physical',
      duration: 0.3,
      maxHits: 2,
      sourceWeaponType: weaponState.weaponType,
      sourceAttackId: 'execute',
    });
  }

  private executeCleave(entityId: EntityId, weaponState: WeaponState): void {
    const hitboxId = this.combatSystem.createHitbox({
      ownerId: entityId,
      shape: 'cone',
      offset: { x: 0, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      size: { angle: Math.PI / 2, length: 3.5 },
      damage: Math.round((weaponState.config?.damage ?? 35) * 1.3),
      staggerPower: 18,
      knockback: 6,
      element: 'physical',
      duration: 0.5,
      maxHits: 6,
      sourceWeaponType: weaponState.weaponType,
      sourceAttackId: 'cleave',
    });
  }

  private executeImpale(entityId: EntityId, weaponState: WeaponState): void {
    const hitboxId = this.combatSystem.createHitbox({
      ownerId: entityId,
      shape: 'ray',
      offset: { x: 0, y: 1.3, z: 1.5 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      size: { length: 8 },
      damage: Math.round((weaponState.config?.damage ?? 20) * 2),
      staggerPower: 15,
      knockback: 4,
      element: 'physical',
      duration: 0.1,
      maxHits: 1,
      sourceWeaponType: weaponState.weaponType,
      sourceAttackId: 'impale',
    });

    window.dispatchEvent(new CustomEvent('skill-effect', {
      detail: { type: 'impale', entityId, hitboxId, bleed: true }
    }));
  }

  private executeRapidFire(entityId: EntityId, weaponState: WeaponState): void {
    // Fire 3 arrows in quick succession
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const hitboxId = this.combatSystem.createHitbox({
          ownerId: entityId,
          shape: 'ray',
          offset: { x: (i - 1) * 0.1, y: 1.4, z: 1 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          size: { length: 40 },
          damage: Math.round((weaponState.config?.damage ?? 18) * 0.7),
          staggerPower: 4,
          knockback: 1.5,
          element: 'physical',
          duration: 0.05,
          maxHits: 1,
          sourceWeaponType: weaponState.weaponType,
          sourceAttackId: 'rapid_fire',
        });
      }, i * 100);
    }
  }

  private executeFireball(entityId: EntityId, weaponState: WeaponState): void {
    const hitboxId = this.combatSystem.createHitbox({
      ownerId: entityId,
      shape: 'sphere',
      offset: { x: 0, y: 1.5, z: 2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      size: { radius: 3 },
      damage: Math.round((weaponState.config?.damage ?? 15) * 2.5),
      staggerPower: 10,
      knockback: 5,
      element: 'fire',
      duration: 0.6,
      maxHits: 5,
      sourceWeaponType: weaponState.weaponType,
      sourceAttackId: 'fireball',
    });

    window.dispatchEvent(new CustomEvent('skill-projectile', {
      detail: { type: 'fireball', entityId, hitboxId, speed: 25, gravity: 0.02 }
    }));
  }

  private executeFlurry(entityId: EntityId, weaponState: WeaponState): void {
    // 6 rapid hits
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const hitboxId = this.combatSystem.createHitbox({
          ownerId: entityId,
          shape: 'capsule',
          offset: { x: 0, y: 1, z: 1.2 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          size: { radius: 0.25, length: 1.8 },
          damage: Math.round((weaponState.config?.damage ?? 14) * 0.5),
          staggerPower: 2,
          knockback: 0.5,
          element: 'physical',
          duration: 0.08,
          maxHits: 1,
          sourceWeaponType: weaponState.weaponType,
          sourceAttackId: 'flurry',
        });
      }, i * 60);
    }
  }

  private executeGroundSlam(entityId: EntityId, weaponState: WeaponState): void {
    const hitboxId = this.combatSystem.createHitbox({
      ownerId: entityId,
      shape: 'sphere',
      offset: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      size: { radius: 5 },
      damage: Math.round((weaponState.config?.damage ?? 50) * 1.5),
      staggerPower: 35,
      knockback: 12,
      element: 'physical',
      duration: 0.8,
      maxHits: 10,
      sourceWeaponType: weaponState.weaponType,
      sourceAttackId: 'ground_slam',
    });

    window.dispatchEvent(new CustomEvent('skill-effect', {
      detail: { type: 'ground_slam', entityId, hitboxId, radius: 5 }
    }));
  }

  private executeWyvernFire(entityId: EntityId, weaponState: WeaponState): void {
    const hitboxId = this.combatSystem.createHitbox({
      ownerId: entityId,
      shape: 'cone',
      offset: { x: 0, y: 1.2, z: 1.5 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      size: { angle: Math.PI / 3, length: 6 },
      damage: Math.round((weaponState.config?.damage ?? 35) * 2.5),
      staggerPower: 25,
      knockback: 8,
      element: 'fire',
      duration: 1.0,
      maxHits: 8,
      sourceWeaponType: weaponState.weaponType,
      sourceAttackId: 'wyvern_fire',
    });
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getWeaponState(entityId: EntityId, slot: 0 | 1 | 2): WeaponState | undefined {
    const equipped = this.weaponStates.get(entityId);
    if (!equipped) return undefined;

    switch (slot) {
      case 0: return equipped.main;
      case 1: return equipped.offhand;
      case 2: return equipped.ranged;
    }
  }

  getActiveWeaponState(entityId: EntityId): WeaponState | undefined {
    const equipped = this.weaponStates.get(entityId);
    if (!equipped) return undefined;

    switch (equipped.activeSlot) {
      case 0: return equipped.main;
      case 1: return equipped.offhand;
      case 2: return equipped.ranged;
    }
  }

  getActiveWeaponSlot(entityId: EntityId): 0 | 1 | 2 {
    const equipped = this.weaponStates.get(entityId);
    return equipped?.activeSlot ?? 0;
  }

  setActiveWeaponSlot(entityId: EntityId, slot: 0 | 1 | 2): boolean {
    const equipped = this.weaponStates.get(entityId);
    if (!equipped) return false;

    const newWeapon = this.getWeaponState(entityId, slot);
    if (!newWeapon || !newWeapon.weaponId) return false;

    const oldSlot = equipped.activeSlot;
    equipped.activeSlot = slot;

    // Update player component
    if (this.playerComp) {
      this.playerComp.activeWeaponIndex = slot;
    }

    this.onWeaponSwap?.(entityId, oldSlot, slot);
    return true;
  }

  equipWeapon(entityId: EntityId, slot: 0 | 1 | 2, weaponId: string): boolean {
    const equipped = this.weaponStates.get(entityId);
    if (!equipped) return false;

    const itemDef = ITEM_DEFINITIONS[weaponId];
    if (!itemDef || !itemDef.weaponType) return false;

    // Check slot compatibility
    const slotTypes: Record<0 | 1 | 2, WeaponType[]> = {
      0: [WeaponType.Sword, WeaponType.Axe, WeaponType.Spear, WeaponType.Hammer, WeaponType.Gunlance],
      1: [WeaponType.Daggers, WeaponType.Staff],
      2: [WeaponType.Bow, WeaponType.Gunlance],
    };

    const allowedTypes = slotTypes[slot];
    if (!allowedTypes || !allowedTypes.includes(itemDef.weaponType)) return false;

    const newState = this.createWeaponState(weaponId);

    switch (slot) {
      case 0: equipped.main = newState; break;
      case 1: equipped.offhand = newState; break;
      case 2: equipped.ranged = newState; break;
    }

    // Update player component
    if (this.playerComp) {
      this.playerComp.equippedWeaponIds[slot] = weaponId;
    }

    return true;
  }

  unequipWeapon(entityId: EntityId, slot: 0 | 1 | 2): void {
    const equipped = this.weaponStates.get(entityId);
    if (!equipped) return;

    switch (slot) {
      case 0: equipped.main = this.emptyWeaponState(); break;
      case 1: equipped.offhand = this.emptyWeaponState(); break;
      case 2: equipped.ranged = this.emptyWeaponState(); break;
    }

    if (this.playerComp) {
      this.playerComp.equippedWeaponIds[slot] = null;
    }
  }

  canAttack(entityId: EntityId): boolean {
    const weaponState = this.getActiveWeaponState(entityId);
    if (!weaponState || !weaponState.config) return false;
    return weaponState.attackCooldown <= 0 && !weaponState.isReloading;
  }

  startAttack(entityId: EntityId, attackId: string = 'primary'): string[] | null {
    const weaponState = this.getActiveWeaponState(entityId);
    if (!weaponState || !weaponState.config) return null;
    if (weaponState.attackCooldown > 0) return null;
    if (weaponState.isReloading) return null;

    // Check ammo for ranged
    if (weaponState.config.hitboxShape === 'ray' && weaponState.currentAmmo <= 0) {
      this.startReload(entityId);
      return null;
    }

    // Consume ammo
    if (weaponState.config.hitboxShape === 'ray') {
      weaponState.currentAmmo--;
    }

    // Execute attack
    const hitboxIds = this.combatSystem.executeAttack(
      entityId,
      weaponState.weaponType!,
      attackId,
      weaponState.comboStep
    );

    // Update combo
    const now = performance.now() / 1000;
    if (now - weaponState.lastAttackTime < 0.8) {
      weaponState.comboStep = (weaponState.comboStep + 1) % weaponState.maxCombo;
    } else {
      weaponState.comboStep = 0;
    }
    weaponState.lastAttackTime = now;
    weaponState.comboTimer = 0.8;

    // Set cooldown
    weaponState.attackCooldown = 1 / weaponState.config.attackSpeed;

    // Durability loss
    weaponState.durability = Math.max(0, weaponState.durability - 0.5);

    this.onAttack?.(entityId, weaponState.weaponType!, weaponState.comboStep);
    this.onComboChange?.(entityId, weaponState.comboStep, weaponState.maxCombo);

    return hitboxIds;
  }

  private startReload(entityId: EntityId): void {
    const weaponState = this.getActiveWeaponState(entityId);
    if (!weaponState || weaponState.isReloading || weaponState.currentAmmo >= weaponState.maxAmmo) return;

    weaponState.isReloading = true;

    setTimeout(() => {
      weaponState.currentAmmo = weaponState.maxAmmo;
      weaponState.isReloading = false;

      window.dispatchEvent(new CustomEvent('weapon-reload', {
        detail: { entityId, weaponType: weaponState.weaponType }
      }));
    }, weaponState.reloadTime * 1000);
  }

  useSkill(entityId: EntityId, skillId: string): boolean {
    const weaponState = this.getActiveWeaponState(entityId);
    if (!weaponState || !weaponState.config) return false;

    const skillDef = this.skillDefinitions.get(skillId);
    if (!skillDef) return false;

    // Check weapon compatibility
    if (!skillDef.weaponTypes.includes(weaponState.weaponType!)) return false;

    // Check cooldown
    const cooldown = weaponState.skillCooldowns[skillId] ?? 0;
    if (cooldown > 0) return false;

    // Check resources
    const playerComp = this.world.getComponent(entityId, PlayerComponent);
    if (!playerComp) return false;

    if (skillDef.cost.stamina && playerComp.stamina < skillDef.cost.stamina) return false;
    if (skillDef.cost.fury && playerComp.fury < skillDef.cost.fury) return false;

    // Consume resources
    if (skillDef.cost.stamina) playerComp.stamina -= skillDef.cost.stamina;
    if (skillDef.cost.fury) playerComp.fury -= skillDef.cost.fury;

    // Execute skill
    skillDef.execute(entityId, weaponState);

    // Set cooldown
    weaponState.skillCooldowns[skillId] = skillDef.cooldown;

    this.onSkillUse?.(entityId, skillId);
    return true;
  }

  // ============================================================================
  // UPDATE
  // ============================================================================

  update(dt: number): void {
    // Update weapon states
    for (const [entityId, equipped] of this.weaponStates) {
      const slots: WeaponState[] = [equipped.main, equipped.offhand, equipped.ranged];

      for (const weaponState of slots) {
        if (!weaponState.config) continue;

        // Attack cooldown
        if (weaponState.attackCooldown > 0) {
          weaponState.attackCooldown = Math.max(0, weaponState.attackCooldown - dt);
        }

        // Combo timer
        if (weaponState.comboTimer > 0) {
          weaponState.comboTimer -= dt;
          if (weaponState.comboTimer <= 0) {
            weaponState.comboStep = 0;
          }
        }

        // Skill cooldowns
        for (const skillId of Object.keys(weaponState.skillCooldowns)) {
          const currentCooldown = weaponState.skillCooldowns[skillId];
          if (currentCooldown !== undefined) {
            weaponState.skillCooldowns[skillId] = Math.max(0, currentCooldown - dt);
          }
        }

        // Charge handling (for chargeable weapons)
        if (weaponState.isCharging) {
          weaponState.chargeLevel = Math.min(1, (performance.now() / 1000 - weaponState.chargeStartTime) / 2);
        }
      }
    }
  }

  // ============================================================================
  // INPUT HANDLING (for player)
  // ============================================================================

  handleInput(): void {
    if (!this.playerEntity) return;

    // Weapon swap
    if (this.inputManager.isActionPressed(ActionName.WeaponSwap1)) {
      this.setActiveWeaponSlot(this.playerEntity, 0);
    }
    if (this.inputManager.isActionPressed(ActionName.WeaponSwap2)) {
      this.setActiveWeaponSlot(this.playerEntity, 1);
    }
    if (this.inputManager.isActionPressed(ActionName.WeaponSwap3)) {
      this.setActiveWeaponSlot(this.playerEntity, 2);
    }

    // Skills
    if (this.inputManager.isActionPressed(ActionName.Skill1)) {
      this.useSkill(this.playerEntity, this.getSkillForSlot(1));
    }
    if (this.inputManager.isActionPressed(ActionName.Skill2)) {
      this.useSkill(this.playerEntity, this.getSkillForSlot(2));
    }
    if (this.inputManager.isActionPressed(ActionName.Skill3)) {
      this.useSkill(this.playerEntity, this.getSkillForSlot(3));
    }
    if (this.inputManager.isActionPressed(ActionName.Skill4)) {
      this.useSkill(this.playerEntity, this.getSkillForSlot(4));
    }
  }

  private getSkillForSlot(slot: number): string {
    // Returns the skill ID mapped to this slot for the current weapon
    const weaponState = this.getActiveWeaponState(this.playerEntity!);
    if (!weaponState || !weaponState.config) return '';

    const skillMap: Record<WeaponType, string[]> = {
      [WeaponType.Sword]: ['whirlwind', 'parry', 'lunge', ''],
      [WeaponType.Axe]: ['execute', 'cleave', '', ''],
      [WeaponType.Spear]: ['impale', 'lunge', 'parry', ''],
      [WeaponType.Bow]: ['rapid_fire', '', '', ''],
      [WeaponType.Staff]: ['fireball', 'ice_shard', 'lightning_chain', 'heal'],
      [WeaponType.Daggers]: ['flurry', 'parry', 'backstab', 'smoke_bomb'],
      [WeaponType.Hammer]: ['ground_slam', 'seismic_wave', 'stun', ''],
      [WeaponType.Gunlance]: ['wyvern_fire', 'charged_shell', 'guard', ''],
    };

    const skills = skillMap[weaponState.weaponType!] || [];
    return skills[slot - 1] || '';
  }

  // ============================================================================
  // DEFINITIONS
  // ============================================================================

  getSkillDefinition(skillId: string): SkillDefinition | undefined {
    return this.skillDefinitions.get(skillId);
  }

  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skillDefinitions.values());
  }

  getSkillsForWeapon(weaponType: WeaponType): SkillDefinition[] {
    return Array.from(this.skillDefinitions.values()).filter(s =>
      s.weaponTypes.includes(weaponType)
    );
  }
}

// ============================================================================
// SKILL DEFINITION
// ============================================================================

export interface SkillDefinition {
  id: string;
  name: string;
  weaponTypes: WeaponType[];
  cooldown: number;
  cost: { stamina?: number; fury?: number; hp?: number };
  description: string;
  execute: (entityId: EntityId, weaponState: WeaponState) => void;
  icon?: string;
  requiredLevel?: number;
}