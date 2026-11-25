/**
 * Chimera System 3D - Unified mutation system with socket-based 3D attachment
 * Integrates ECS, AssetPipeline, and ChimeraSocketSystem for full 3D visual mutations
 */

import * as THREE from 'three';
import { World, BaseSystem, EntityId, TransformComponent, TagComponent } from '@core/ECS.js';
import { AssetLoader, LoadedGLTF } from '@engine/AssetLoader.js';
import { AssetManifestEntry, AssetRole } from '@core/Types.js';
import { ChimeraSocketSystem, ChimeraSocket } from '@assets/AssetPipeline.js';
import { CreatureData, CreatureAnatomy, BodyPartData, MutationSocket, CreatureStats } from './CreatureAI.js';
import { SaveChimera, SaveMutation } from '@core/Types.js';

// ============================================================================
// CHIMERA 3D TYPES
// ============================================================================

export interface Chimera3DData {
  entityId: EntityId;
  baseSpeciesId: string;
  name: string;
  level: number;
  experience: number;
  stats: CreatureStats;
  currentHP: number;
  currentPoise: number;
  mutations: ChimeraMutation[];
  state: 'inventory' | 'pet' | 'mount';
  socketBindings: Record<string, string>; // socketId -> partAssetId
  visualModel: THREE.Group | null;
  animationMixer: THREE.AnimationMixer | null;
  animationActions: Map<string, THREE.AnimationAction>;
  lastDevourTime: number;
}

export interface ChimeraMutation {
  partAssetId: string;
  socketId: string;
  sourceCreatureId: string;
  bodyPartId: string;
  statBonuses: Partial<CreatureStats>;
  unlockedSkills: string[];
  visualMesh: string;
  visualScale: THREE.Vector3;
  visualOffset: THREE.Vector3;
  visualRotation: THREE.Quaternion;
  isRare: boolean;
  attachedTime: number;
  level: number;
  experience: number;
}

export interface DevourRecipe3D {
  id: string;
  name: string;
  description: string;
  predatorSpeciesId: string;
  preySpeciesId: string;
  targetSocket: string;
  successChance: number;
  rareChance: number;
  requiredLevel: number;
  cooldown: number;
  staminaCost: number;
  energyCost: number;
  requiredItems: { itemId: string; quantity: number }[];
  results: DevourResult3D[];
}

export interface DevourResult3D {
  bodyPartId: string;
  socketId: string;
  chance: number;
  statBonuses: Partial<CreatureStats>;
  unlockedSkills: string[];
  partAssetId: string; // Asset manifest ID for the visual part
  isRare: boolean;
}

export interface DevourSession3D {
  id: string;
  chimeraEntityId: EntityId;
  preyEntityId: EntityId;
  recipe: DevourRecipe3D;
  startTime: number;
  progress: number;
  duration: number;
  isComplete: boolean;
  results: ChimeraMutation[];
}

// ============================================================================
// CHIMERA 3D SYSTEM
// ============================================================================

export class ChimeraSystem3D extends BaseSystem {
  readonly priority = 30;

  private assetLoader: AssetLoader;
  private socketSystem: ChimeraSocketSystem;
  private manifestEntries: Map<string, AssetManifestEntry> = new Map();
  private recipes: Map<string, DevourRecipe3D> = new Map();
  private activeDevours: Map<string, DevourSession3D> = new Map();

  // ECS Component types (would be registered)
  private chimeraComponentType = 'Chimera3D';

  constructor(world: World, assetLoader: AssetLoader, manifestEntries: AssetManifestEntry[]) {
    super();
    this.setWorld(world);
    this.assetLoader = assetLoader;

    // Initialize socket system
    this.socketSystem = new ChimeraSocketSystem(assetLoader);

    // Index manifest entries by ID
    for (const entry of manifestEntries) {
      this.manifestEntries.set(entry.id, entry);
    }

    // Register default recipes
    this.registerDefaultRecipes();

    console.log('[ChimeraSystem3D] Initialized');
  }

  // ---- Recipe Management ----

  registerRecipe(recipe: DevourRecipe3D): void {
    this.recipes.set(recipe.id, recipe);
  }

  private registerDefaultRecipes(): void {
    // Spirit Wolf + Sky Eagle -> Wings
    this.registerRecipe({
      id: 'wolf_devour_eagle_wings',
      name: 'Absorção: Asas de Águia',
      description: 'Devora uma Águia Celestial para ganhar asas e voo',
      predatorSpeciesId: 'spirit_wolf',
      preySpeciesId: 'sky_eagle',
      targetSocket: 'back',
      successChance: 0.15,
      rareChance: 0.05,
      requiredLevel: 5,
      cooldown: 300,
      staminaCost: 50,
      energyCost: 30,
      requiredItems: [{ itemId: 'spirit_essence', quantity: 1 }],
      results: [
        {
          bodyPartId: 'wings',
          socketId: 'back',
          chance: 1.0,
          statBonuses: { speed: 2, hp: 100, stamina: 50 },
          unlockedSkills: ['skill_wing_buffet', 'skill_aerial_dive', 'skill_glide'],
          partAssetId: 'part_eagle_wings',
          isRare: false,
        },
      ],
    });

    // Spirit Wolf + Abyssal Scorpion -> Stinger Tail
    this.registerRecipe({
      id: 'wolf_devour_scorpion_tail',
      name: 'Absorção: Cauda de Escorpião',
      description: 'Devora um Escorpião Abissal para ganhar cauda venenosa',
      predatorSpeciesId: 'spirit_wolf',
      preySpeciesId: 'abyssal_scorpion',
      targetSocket: 'tail_socket',
      successChance: 0.10,
      rareChance: 0.03,
      requiredLevel: 8,
      cooldown: 600,
      staminaCost: 75,
      energyCost: 50,
      requiredItems: [{ itemId: 'spirit_essence', quantity: 2 }, { itemId: 'poison_sac', quantity: 1 }],
      results: [
        {
          bodyPartId: 'stinger',
          socketId: 'tail_socket',
          chance: 1.0,
          statBonuses: { damage: 20, elementalResist: { poison: 50 } as any },
          unlockedSkills: ['skill_venom_strike', 'skill_poison_tail', 'skill_paralyze_sting'],
          partAssetId: 'part_scorpion_tail',
          isRare: true,
        },
      ],
    });

    // Sky Eagle + Spirit Wolf -> Horns
    this.registerRecipe({
      id: 'eagle_devour_wolf_horns',
      name: 'Absorção: Chifres Alfa',
      description: 'Devora um Lobo Espiritual Alfa para ganhar chifres de dominância',
      predatorSpeciesId: 'sky_eagle',
      preySpeciesId: 'spirit_wolf',
      targetSocket: 'head_horns',
      successChance: 0.12,
      rareChance: 0.04,
      requiredLevel: 6,
      cooldown: 300,
      staminaCost: 40,
      energyCost: 25,
      requiredItems: [{ itemId: 'wolf_fang', quantity: 2 }],
      results: [
        {
          bodyPartId: 'alpha_horns',
          socketId: 'head_horns',
          chance: 1.0,
          statBonuses: { damage: 15, poise: 30 },
          unlockedSkills: ['skill_alpha_roar', 'skill_territory_mark'],
          partAssetId: 'part_alpha_horns',
          isRare: false,
        },
      ],
    });

    // Abyssal Scorpion + Sky Eagle -> Dragon Wings
    this.registerRecipe({
      id: 'scorpion_devour_eagle_dragon_wings',
      name: 'Absorção: Asas Dracônicas',
      description: 'Devora uma Águia Celestial rara para ganhar asas de dragão',
      predatorSpeciesId: 'abyssal_scorpion',
      preySpeciesId: 'sky_eagle',
      targetSocket: 'back',
      successChance: 0.05,
      rareChance: 0.02,
      requiredLevel: 15,
      cooldown: 1200,
      staminaCost: 100,
      energyCost: 80,
      requiredItems: [{ itemId: 'dragon_scale', quantity: 1 }, { itemId: 'spirit_essence', quantity: 5 }],
      results: [
        {
          bodyPartId: 'dragon_wings',
          socketId: 'back',
          chance: 1.0,
          statBonuses: { speed: 3, hp: 200, damage: 30, elementalResist: { fire: 30, ice: 30 } as any },
          unlockedSkills: ['skill_dragon_breath', 'skill_wing_storm', 'skill_flight_mastery'],
          partAssetId: 'part_dragon_wings',
          isRare: true,
        },
      ],
    });

    console.log('[ChimeraSystem3D] Registered default recipes');
  }

  getRecipe(predatorSpeciesId: string, preySpeciesId: string): DevourRecipe3D | null {
    for (const recipe of this.recipes.values()) {
      if (recipe.predatorSpeciesId === predatorSpeciesId && recipe.preySpeciesId === preySpeciesId) {
        return recipe;
      }
    }
    return null;
  }

  getAvailableRecipes(predatorSpeciesId: string): DevourRecipe3D[] {
    const results: DevourRecipe3D[] = [];
    for (const recipe of this.recipes.values()) {
      if (recipe.predatorSpeciesId === predatorSpeciesId) {
        results.push(recipe);
      }
    }
    return results;
  }

  // ---- Devour Process ----

  async startDevour(predatorEntityId: EntityId, preyEntityId: EntityId): Promise<DevourSession3D | null> {
    const predatorComp = this.world.getComponent(predatorEntityId, this.chimeraComponentType as any) as Chimera3DData | undefined;
    const preyTag = this.world.getComponent(preyEntityId, TagComponent);
    const preyCreatureTag = preyTag?.hasTag('creature');
    const preySpeciesTag = preyTag?.tags ? Array.from(preyTag.tags).find(t => t.startsWith('species:')) : null;
    const preySpeciesId = preySpeciesTag?.replace('species:', '') || '';

    if (!predatorComp || !preyCreatureTag || !preySpeciesId) {
      console.warn('[ChimeraSystem3D] Invalid devour: missing components');
      return null;
    }

    const recipe = this.getRecipe(predatorComp.baseSpeciesId, preySpeciesId);
    if (!recipe) {
      console.warn('[ChimeraSystem3D] No recipe for', predatorComp.baseSpeciesId, '->', preySpeciesId);
      return null;
    }

    if (predatorComp.level < recipe.requiredLevel) {
      console.warn('[ChimeraSystem3D] Level too low:', predatorComp.level, '<', recipe.requiredLevel);
      return null;
    }

    // Check cooldown
    const now = Date.now() / 1000;
    if (now - predatorComp.lastDevourTime < recipe.cooldown) {
      console.warn('[ChimeraSystem3D] On cooldown');
      return null;
    }

    // Check costs (would check player inventory/stamina)
    // For now, assume we can afford

    // Create session
    const session: DevourSession3D = {
      id: `devour_${now}_${Math.random().toString(36).slice(2, 9)}`,
      chimeraEntityId: predatorEntityId,
      preyEntityId,
      recipe,
      startTime: now,
      progress: 0,
      duration: 5, // 5 second animation
      isComplete: false,
      results: [],
    };

    this.activeDevours.set(session.id, session);
    predatorComp.lastDevourTime = now;

    // Trigger devour animation on visual model
    if (predatorComp.animationMixer) {
      this.playAnimation(predatorComp, 'devour');
    }

    console.log('[ChimeraSystem3D] Devour started:', session.id);
    return session;
  }

  updateDevour(sessionId: string, dt: number): DevourSession3D | null {
    const session = this.activeDevours.get(sessionId);
    if (!session || session.isComplete) return null;

    session.progress += dt / session.duration;

    if (session.progress >= 1) {
      this.completeDevour(session);
    }

    return session;
  }

  private async completeDevour(session: DevourSession3D): Promise<void> {
    const predatorComp = this.world.getComponent(session.chimeraEntityId, this.chimeraComponentType as any) as Chimera3DData | undefined;
    if (!predatorComp) return;

    const { preyEntityId, recipe } = session;

    // Calculate mutation results
    const results = await this.calculateDevourResults(recipe, predatorComp);
    session.results = results;
    session.isComplete = true;

    // Apply mutations to chimera
    for (const result of results) {
      await this.applyMutation(predatorComp, result);
    }

    // Destroy prey entity
    this.world.destroyEntity(preyEntityId);

    // Grant experience
    predatorComp.experience += 50; // Base amount
    this.checkLevelUp(predatorComp);

    // Unlock evolution if applicable
    this.checkEvolution(predatorComp);

    console.log('[ChimeraSystem3D] Devour completed:', session.id, 'mutations:', results.length);
    this.activeDevours.delete(session.id);
  }

  private async calculateDevourResults(recipe: DevourRecipe3D, predator: Chimera3DData): Promise<ChimeraMutation[]> {
    const results: ChimeraMutation[] = [];

    for (const resultTemplate of recipe.results) {
      // Check if socket is available
      const socket = this.socketSystem.getAllSockets().find(s => s.id === recipe.targetSocket);
      if (!socket || socket.attachedPartId) {
        continue; // Socket occupied
      }

      // Check socket compatibility
      if (!socket.compatibleParts.includes(resultTemplate.partAssetId)) {
        continue;
      }

      // Roll for success
      let finalChance = recipe.successChance * resultTemplate.chance;

      // Level difference bonus (predator level vs typical prey level)
      finalChance += (predator.level - 5) * 0.02;

      // Rare mutation roll
      const isRare = Math.random() < recipe.rareChance;

      if (Math.random() < finalChance) {
        const mutation: ChimeraMutation = {
          partAssetId: resultTemplate.partAssetId,
          socketId: recipe.targetSocket,
          sourceCreatureId: recipe.preySpeciesId,
          bodyPartId: resultTemplate.bodyPartId,
          statBonuses: isRare ? this.boostStats(resultTemplate.statBonuses, 1.5) : resultTemplate.statBonuses,
          unlockedSkills: resultTemplate.unlockedSkills,
          visualMesh: resultTemplate.partAssetId,
          visualScale: new THREE.Vector3(1, 1, 1),
          visualOffset: new THREE.Vector3(0, 0, 0),
          visualRotation: new THREE.Quaternion(0, 0, 0, 1),
          isRare: isRare || resultTemplate.isRare,
          attachedTime: Date.now() / 1000,
          level: 1,
          experience: 0,
        };

        // Get visual transform from manifest
        const manifestEntry = this.manifestEntries.get(resultTemplate.partAssetId);
        if (manifestEntry?.socketBinding) {
          mutation.visualScale.set(manifestEntry.socketBinding.scale.x, manifestEntry.socketBinding.scale.y, manifestEntry.socketBinding.scale.z);
          mutation.visualOffset.set(manifestEntry.socketBinding.offset.x, manifestEntry.socketBinding.offset.y, manifestEntry.socketBinding.offset.z);
          mutation.visualRotation.set(manifestEntry.socketBinding.rotation.x, manifestEntry.socketBinding.rotation.y, manifestEntry.socketBinding.rotation.z, manifestEntry.socketBinding.rotation.w);
        }

        results.push(mutation);
      }
    }

    return results;
  }

  private boostStats(stats: Partial<CreatureStats>, multiplier: number): Partial<CreatureStats> {
    const boosted: Partial<CreatureStats> = {};
    for (const [key, value] of Object.entries(stats)) {
      if (typeof value === 'number') {
        boosted[key as keyof CreatureStats] = value * multiplier;
      } else if (typeof value === 'object' && value !== null) {
        // Handle nested objects like elementalResist
        boosted[key as keyof CreatureStats] = value as any; // Simplified
      }
    }
    return boosted;
  }

  private async applyMutation(chimera: Chimera3DData, mutation: ChimeraMutation): Promise<void> {
    // Apply stat bonuses
    this.applyStatBonuses(chimera, mutation.statBonuses);

    // Add unlocked skills
    for (const skillId of mutation.unlockedSkills) {
      chimera.unlockedSkills = chimera.unlockedSkills || new Set();
      chimera.unlockedSkills.add(skillId);
    }

    // Attach visual to socket
    const manifestEntry = this.manifestEntries.get(mutation.partAssetId);
    if (manifestEntry) {
      const success = await this.socketSystem.attachPart(
        mutation.socketId,
        mutation.partAssetId,
        manifestEntry
      );
      if (success) {
        chimera.socketBindings[mutation.socketId] = mutation.partAssetId;
        chimera.mutations.push(mutation);
      }
    }

    // Update visual model if exists
    if (chimera.visualModel && chimera.socketBindings[mutation.socketId]) {
      // Visual already attached via socket system
    }
  }

  private applyStatBonuses(chimera: Chimera3DData, bonuses: Partial<CreatureStats>): void {
    if (bonuses.hp) {
      chimera.stats.hp += bonuses.hp;
      chimera.currentHP = Math.min(chimera.currentHP + bonuses.hp, chimera.stats.hp);
    }
    if (bonuses.damage) chimera.stats.damage += bonuses.damage;
    if (bonuses.defense) chimera.stats.defense += bonuses.defense;
    if (bonuses.poise) {
      chimera.stats.poise += bonuses.poise;
      chimera.currentPoise = Math.min(chimera.currentPoise + bonuses.poise, chimera.stats.poise);
    }
    if (bonuses.speed) chimera.stats.speed += bonuses.speed;
    if (bonuses.stamina) chimera.stats.stamina += bonuses.stamina;
    if (bonuses.elementalResist) {
      for (const [type, value] of Object.entries(bonuses.elementalResist)) {
        chimera.stats.elementalResist[type as any] =
          (chimera.stats.elementalResist[type as any] || 0) + value;
      }
    }
  }

  private checkLevelUp(chimera: Chimera3DData): void {
    const xpForNextLevel = chimera.level * 100;
    while (chimera.experience >= xpForNextLevel) {
      chimera.experience -= xpForNextLevel;
      chimera.level++;
      // Stat gains per level
      chimera.stats.hp += 15;
      chimera.stats.damage += 2;
      chimera.stats.defense += 1;
      chimera.stats.poise += 5;
      chimera.currentHP = chimera.stats.hp; // Full heal on level up
      console.log('[ChimeraSystem3D] Chimera leveled up to', chimera.level);
    }
  }

  private checkEvolution(chimera: Chimera3DData): void {
    // Check evolution paths (defined in ChimeraSystem)
    // This would trigger visual evolution and new base stats
  }

  // ---- Mutation Management ----

  removeMutation(chimeraEntityId: EntityId, socketId: string): ChimeraMutation | null {
    const chimera = this.world.getComponent(chimeraEntityId, this.chimeraComponentType as any) as Chimera3DData | undefined;
    if (!chimera) return null;

    const mutationIndex = chimera.mutations.findIndex(m => m.socketId === socketId);
    if (mutationIndex === -1) return null;

    const mutation = chimera.mutations[mutationIndex];

    // Remove stat bonuses
    this.removeStatBonuses(chimera, mutation.statBonuses);

    // Remove skills
    for (const skillId of mutation.unlockedSkills) {
      chimera.unlockedSkills?.delete(skillId);
    }

    // Detach visual
    this.socketSystem.detachPart(socketId);
    delete chimera.socketBindings[socketId];

    // Remove from mutations array
    chimera.mutations.splice(mutationIndex, 1);

    return mutation;
  }

  private removeStatBonuses(chimera: Chimera3DData, bonuses: Partial<CreatureStats>): void {
    if (bonuses.hp) chimera.stats.hp = Math.max(1, chimera.stats.hp - bonuses.hp);
    if (bonuses.damage) chimera.stats.damage = Math.max(1, chimera.stats.damage - bonuses.damage);
    if (bonuses.defense) chimera.stats.defense = Math.max(0, chimera.stats.defense - bonuses.defense);
    if (bonuses.poise) {
      chimera.stats.poise = Math.max(1, chimera.stats.poise - bonuses.poise);
      chimera.currentPoise = Math.min(chimera.currentPoise, chimera.stats.poise);
    }
    if (bonuses.speed) chimera.stats.speed = Math.max(0.1, chimera.stats.speed - bonuses.speed);
    if (bonuses.stamina) chimera.stats.stamina = Math.max(1, chimera.stats.stamina - bonuses.stamina);
    if (bonuses.elementalResist) {
      for (const [type, value] of Object.entries(bonuses.elementalResist)) {
        chimera.stats.elementalResist[type as any] =
          Math.max(0, (chimera.stats.elementalResist[type as any] || 0) - value);
      }
    }
  }

  // ---- Visual Model Management ----

  async createVisualModel(chimera: Chimera3DData, baseCreatureData: CreatureData): Promise<THREE.Group> {
    // Load base creature model
    const baseEntry = this.manifestEntries.get(baseCreatureData.id);
    if (!baseEntry) {
      console.warn('[ChimeraSystem3D] No manifest entry for base creature:', baseCreatureData.id);
      return new THREE.Group();
    }

    try {
      const gltf = await this.assetLoader.loadGLTFFromManifest(baseEntry, {
        normalizeScale: true,
        centerGeometry: true,
      });

      const model = gltf.scene.clone(true);

      // Setup animation mixer
      chimera.animationMixer = new THREE.AnimationMixer(model);
      chimera.animationActions = new Map();

      for (const clip of gltf.animations) {
        const action = chimera.animationMixer.clipAction(clip);
        chimera.animationActions.set(clip.name, action);
      }

      // Initialize socket system with creature model
      this.socketSystem.initializeFromCreatureData(baseCreatureData);
      this.socketSystem.bindToModel(model);

      // Attach existing mutations
      for (const mutation of chimera.mutations) {
        const manifestEntry = this.manifestEntries.get(mutation.partAssetId);
        if (manifestEntry) {
          await this.socketSystem.attachPart(mutation.socketId, mutation.partAssetId, manifestEntry);
        }
      }

      chimera.visualModel = model;
      return model;
    } catch (error) {
      console.error('[ChimeraSystem3D] Failed to create visual model:', error);
      return new THREE.Group();
    }
  }

  playAnimation(chimera: Chimera3DData, name: string, loop = false): void {
    if (!chimera.animationMixer || !chimera.animationActions) return;

    const action = chimera.animationActions.get(name);
    if (!action) {
      console.warn('[ChimeraSystem3D] Animation not found:', name);
      return;
    }

    // Stop current actions
    for (const [, a] of chimera.animationActions) {
      if (a.isRunning()) a.fadeOut(0.2);
    }

    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
    action.clampWhenFinished = !loop;
    action.fadeIn(0.2).play();
  }

  updateAnimations(dt: number): void {
    // Update animation mixers for all chimeras
    // Would iterate over all Chimera3D components
  }

  // ---- ECS System Update ----

  update(dt: number): void {
    // Update active devour sessions
    for (const [sessionId, session] of this.activeDevours) {
      this.updateDevour(sessionId, dt);
    }

    // Update animation mixers
    // In a real implementation, iterate over all entities with Chimera3D component
  }

  // ---- Serialization ----

  serializeChimera(chimera: Chimera3DData): SaveChimera {
    return {
      id: chimera.entityId,
      baseSpeciesId: chimera.baseSpeciesId,
      name: chimera.name,
      level: chimera.level,
      experience: chimera.experience,
      hp: chimera.currentHP,
      maxHp: chimera.stats.hp,
      mutations: chimera.mutations.map(m => ({
        partId: m.partAssetId,
        socketId: m.socketId,
        sourceCreatureId: m.sourceCreatureId,
        attributeBonuses: m.statBonuses as Record<string, number>,
        inheritedSkillId: m.unlockedSkills[0],
      })),
      state: chimera.state,
      socketBindings: chimera.socketBindings,
    };
  }

  async deserializeChimera(data: SaveChimera, baseCreatureData: CreatureData): Promise<Chimera3DData> {
    const chimera: Chimera3DData = {
      entityId: data.id as EntityId,
      baseSpeciesId: data.baseSpeciesId,
      name: data.name,
      level: data.level,
      experience: data.experience,
      stats: {
        hp: data.maxHp,
        damage: 0,
        defense: 0,
        poise: 0,
        speed: 0,
        stamina: 0,
        elementalResist: {},
      },
      currentHP: data.hp,
      currentPoise: 0,
      mutations: [],
      state: data.state,
      socketBindings: data.socketBindings,
      visualModel: null,
      animationMixer: null,
      animationActions: new Map(),
      lastDevourTime: 0,
    };

    // Reconstruct mutations
    for (const m of data.mutations) {
      const mutation: ChimeraMutation = {
        partAssetId: m.partId,
        socketId: m.socketId,
        sourceCreatureId: m.sourceCreatureId,
        bodyPartId: m.partId,
        statBonuses: m.attributeBonuses as Partial<CreatureStats>,
        unlockedSkills: m.inheritedSkillId ? [m.inheritedSkillId] : [],
        visualMesh: m.partId,
        visualScale: new THREE.Vector3(1, 1, 1),
        visualOffset: new THREE.Vector3(0, 0, 0),
        visualRotation: new THREE.Quaternion(0, 0, 0, 1),
        isRare: false,
        attachedTime: 0,
        level: 1,
        experience: 0,
      };
      chimera.mutations.push(mutation);
    }

    // Create visual model and attach parts
    await this.createVisualModel(chimera, baseCreatureData);

    return chimera;
  }

  // ---- Utility ----

  getSocketSystem(): ChimeraSocketSystem {
    return this.socketSystem;
  }

  getActiveDevours(): DevourSession3D[] {
    return Array.from(this.activeDevours.values());
  }

  getDevourSession(sessionId: string): DevourSession3D | undefined {
    return this.activeDevours.get(sessionId);
  }
}

// ============================================================================
// EVOLUTION PATHS
// ============================================================================

export const EVOLUTION_PATHS_3D: Record<string, EvolutionStage3D[]> = {
  'spirit_wolf': [
    {
      name: 'Dire Wolf',
      requiredLevel: 10,
      requiredMutations: 1,
      statMultiplier: 1.3,
      newBaseStats: { hp: 150, damage: 20, speed: 2 },
      visualChanges: { bodyScale: 1.2, furColor: { r: 0.4, g: 0.3, b: 0.2 } },
      unlockedParts: ['wolf_alpha_horns'],
    },
    {
      name: 'Fenrir',
      requiredLevel: 25,
      requiredMutations: 3,
      statMultiplier: 1.6,
      newBaseStats: { hp: 400, damage: 50, speed: 5 },
      visualChanges: { bodyScale: 1.5, furColor: { r: 0.2, g: 0.2, b: 0.4 }, iceEffects: true },
      unlockedParts: ['fenrir_ice_mane', 'fenrir_runic_tail'],
    },
    {
      name: 'Wolf of the End',
      requiredLevel: 50,
      requiredMutations: 6,
      statMultiplier: 2.0,
      newBaseStats: { hp: 1000, damage: 120, speed: 8 },
      visualChanges: { bodyScale: 2.0, furColor: { r: 0.05, g: 0.05, b: 0.1 }, voidEffects: true },
      unlockedParts: ['apocalypse_jaws', 'void_wings'],
    },
  ],
  'sky_eagle': [
    {
      name: 'Storm Eagle',
      requiredLevel: 10,
      requiredMutations: 1,
      statMultiplier: 1.3,
      newBaseStats: { hp: 100, damage: 15, speed: 3 },
      visualChanges: { featherColor: { r: 0.5, g: 0.5, b: 0.8 }, lightningEffects: true },
      unlockedParts: ['storm_talons'],
    },
    {
      name: 'Thunder Roc',
      requiredLevel: 25,
      requiredMutations: 3,
      statMultiplier: 1.6,
      newBaseStats: { hp: 300, damage: 40, speed: 6 },
      visualChanges: { bodyScale: 1.5, featherColor: { r: 0.8, g: 0.7, b: 0.2 }, thunderEffects: true },
      unlockedParts: ['roc_lightning_wings', 'roc_thunder_crest'],
    },
    {
      name: 'Sky Emperor',
      requiredLevel: 50,
      requiredMutations: 6,
      statMultiplier: 2.0,
      newBaseStats: { hp: 800, damage: 100, speed: 10 },
      visualChanges: { bodyScale: 1.8, featherColor: { r: 1.0, g: 0.9, b: 0.3 }, crownEffect: true },
      unlockedParts: ['emperor_crown', 'tempest_wings'],
    },
  ],
  'abyssal_scorpion': [
    {
      name: 'Venomous Scorpid',
      requiredLevel: 10,
      requiredMutations: 1,
      statMultiplier: 1.3,
      newBaseStats: { hp: 120, damage: 18, defense: 10 },
      visualChanges: { carapaceColor: { r: 0.3, g: 0.1, b: 0.3 }, poisonGlow: true },
      unlockedParts: ['scorpid_venom_stinger'],
    },
    {
      name: 'Abyss Crawler',
      requiredLevel: 25,
      requiredMutations: 3,
      statMultiplier: 1.6,
      newBaseStats: { hp: 350, damage: 45, defense: 25 },
      visualChanges: { bodyScale: 1.4, carapaceColor: { r: 0.1, g: 0.05, b: 0.2 }, shadowAura: true },
      unlockedParts: ['crawler_shadow_claws', 'crawler_toxic_shell'],
    },
    {
      name: 'Deep One',
      requiredLevel: 50,
      requiredMutations: 6,
      statMultiplier: 2.0,
      newBaseStats: { hp: 900, damage: 110, defense: 50 },
      visualChanges: { bodyScale: 1.8, carapaceColor: { r: 0.02, g: 0.02, b: 0.1 }, abyssalGlow: true },
      unlockedParts: ['deep_one_void_tail', 'abyssal_mandibles'],
    },
  ],
};

export interface EvolutionStage3D {
  name: string;
  requiredLevel: number;
  requiredMutations: number;
  statMultiplier: number;
  newBaseStats: Partial<CreatureStats>;
  visualChanges: Record<string, any>;
  unlockedParts: string[];
}

// ============================================================================
// MUTATION PREVIEW (for UI)
// ============================================================================

export interface MutationPreview3D {
  predatorSpeciesId: string;
  preySpeciesId: string;
  recipeId: string;
  duration: number;
  staminaCost: number;
  energyCost: number;
  requiredItems: { itemId: string; quantity: number }[];
  possibleResults: MutationPreviewResult3D[];
}

export interface MutationPreviewResult3D {
  bodyPartId: string;
  bodyPartName: string;
  socketId: string;
  socketName: string;
  chance: number;
  isRare: boolean;
  statBonuses: Partial<CreatureStats>;
  unlockedSkills: string[];
  partAssetId: string;
  visualPreview: string; // Asset ID for preview mesh
}

export function getMutationPreview(
  system: ChimeraSystem3D,
  predatorSpeciesId: string,
  preySpeciesId: string
): MutationPreview3D | null {
  const recipe = system.getRecipe(predatorSpeciesId, preySpeciesId);
  if (!recipe) return null;

  const possibleResults: MutationPreviewResult3D[] = [];

  for (const resultTemplate of recipe.results) {
    const manifestEntry = system['manifestEntries'].get(resultTemplate.partAssetId);
    const socket = system.getSocketSystem().getAllSockets().find(s => s.id === recipe.targetSocket);

    possibleResults.push({
      bodyPartId: resultTemplate.bodyPartId,
      bodyPartName: manifestEntry?.id || resultTemplate.partAssetId,
      socketId: recipe.targetSocket,
      socketName: socket?.type || recipe.targetSocket,
      chance: recipe.successChance * resultTemplate.chance,
      isRare: resultTemplate.isRare,
      statBonuses: resultTemplate.statBonuses,
      unlockedSkills: resultTemplate.unlockedSkills,
      partAssetId: resultTemplate.partAssetId,
      visualPreview: resultTemplate.partAssetId,
    });
  }

  return {
    predatorSpeciesId,
    preySpeciesId,
    recipeId: recipe.id,
    duration: recipe.duration || 5,
    staminaCost: recipe.staminaCost,
    energyCost: recipe.energyCost,
    requiredItems: recipe.requiredItems,
    possibleResults,
  };
}