// ChimeraLand - Chimera Mutation System
// Devouring creatures to absorb parts, unlock skills, and evolve pets

import { EventBus, GameEvents, emitEvent } from '../core/EventBus';
import { GameConfig, BiomeType, DamageType } from '../core/Config';
import { Vec3, Quat } from '../core/MathUtils';
import { Creature, MutationPart, CreatureData, BodyPartData, MutationSocket } from './CreatureAI';

export interface DevourRecipe {
    id: string;
    name: string;
    description: string;
    predatorCreatureId: string; // Creature doing the devouring
    preyCreatureId: string;     // Creature being devoured
    requiredParts: string[];    // Body part IDs that can be absorbed
    targetSocket: string;       // Socket on predator to attach to
    successChance: number;      // Base chance (0-1)
    rareChance: number;         // Chance for rare mutation (0-1)
    requiredLevel: number;      // Minimum predator level
    cooldown: number;           // Cooldown in seconds
    cost: DevourCost;
    results: DevourResult[];
}

export interface DevourCost {
    stamina: number;
    energy: number;
    items: { itemId: string; quantity: number }[];
}

export interface DevourResult {
    bodyPartId: string;         // Part being absorbed
    socketId: string;           // Target socket
    chance: number;             // Individual chance
    statBonuses: Partial<CreatureStats>;
    unlockedSkills: string[];
    visualMesh: string;
    visualScale: Vec3;
    visualOffset: Vec3;
    visualRotation: Quat;
    isRare: boolean;
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

export interface MutationSlot {
    socketId: string;
    attachedPart: AttachedPart | null;
    isLocked: boolean;
    unlockLevel: number;
}

export interface AttachedPart {
    sourceCreatureId: string;
    bodyPartId: string;
    bodyPartData: BodyPartData;
    mutationResult: DevourResult;
    attachedTime: number;
    level: number;
    experience: number;
}

export class ChimeraSystem {
    private static instance: ChimeraSystem;
    private recipes: Map<string, DevourRecipe> = new Map();
    private activeDevours: Map<string, DevourSession> = new Map();
    private creatureRegistry: Map<string, CreatureData> = new Map();

    static getInstance(): ChimeraSystem {
        if (!ChimeraSystem.instance) ChimeraSystem.instance = new ChimeraSystem();
        return ChimeraSystem.instance;
    }

    registerCreature(data: CreatureData): void {
        this.creatureRegistry.set(data.id, data);
    }

    registerRecipe(recipe: DevourRecipe): void {
        this.recipes.set(recipe.id, recipe);
    }

    getRecipe(predatorId: string, preyId: string): DevourRecipe | null {
        for (const recipe of this.recipes.values()) {
            if (recipe.predatorCreatureId === predatorId && recipe.preyCreatureId === preyId) {
                return recipe;
            }
        }
        return null;
    }

    getAvailableRecipes(predatorId: string): DevourRecipe[] {
        const results: DevourRecipe[] = [];
        for (const recipe of this.recipes.values()) {
            if (recipe.predatorCreatureId === predatorId) {
                results.push(recipe);
            }
        }
        return results;
    }

    // Start devouring process
    startDevour(predator: Creature, prey: Creature): DevourSession | null {
        const recipe = this.getRecipe(predator.data.id, prey.data.id);
        if (!recipe) return null;

        if (predator.level < recipe.requiredLevel) return null;

        // Check cooldown
        const lastDevour = predator.lastDevourTime || 0;
        if (Date.now() / 1000 - lastDevour < recipe.cooldown) return null;

        // Check costs
        if (!this.canAffordCost(predator, recipe.cost)) return null;

        // Pay costs
        this.payCost(predator, recipe.cost);

        // Create session
        const session: DevourSession = {
            id: `devour_${Date.now()}`,
            predator,
            prey,
            recipe,
            startTime: Date.now() / 1000,
            progress: 0,
            duration: 5, // 5 second devour animation
            isComplete: false,
            results: [],
        };

        this.activeDevours.set(session.id, session);
        predator.lastDevourTime = session.startTime;

        emitEvent(GameEvents.DEVOUR_STARTED, { predator, prey, recipe });

        return session;
    }

    updateDevour(sessionId: string, dt: number): DevourSession | null {
        const session = this.activeDevours.get(sessionId);
        if (!session || session.isComplete) return null;

        session.progress += dt / session.duration;

        if (session.progress >= 1) {
            this.completeDevour(session);
        }

        return session;
    }

    private completeDevour(session: DevourSession): void {
        const { predator, prey, recipe } = session;

        // Calculate results
        const results = this.calculateDevourResults(recipe, predator, prey);
        session.results = results;
        session.isComplete = true;

        // Apply mutations
        for (const result of results) {
            this.applyMutation(predator, result);
        }

        // Destroy prey
        prey.despawn();

        // Grant experience
        predator.experience = (predator.experience || 0) + prey.level * 10;

        emitEvent(GameEvents.DEVOUR_COMPLETED, { predator, prey, results });
        emitEvent(GameEvents.MUTATION_OCCURRED, { pet: predator, devouredCreature: prey, results });

        this.activeDevours.delete(session.id);
    }

    private calculateDevourResults(recipe: DevourRecipe, predator: Creature, prey: Creature): DevourResult[] {
        const results: DevourResult[] = [];

        for (const resultTemplate of recipe.results) {
            // Check if this part is available on prey
            const preyPart = prey.bodyParts.get(resultTemplate.bodyPartId);
            if (!preyPart || preyPart.isDestroyed) continue;

            // Check if predator has compatible socket
            const predatorSocket = this.getSocket(predator, recipe.targetSocket);
            if (!predatorSocket) continue;

            // Check socket compatibility
            if (!predatorSocket.compatibleParts.includes(resultTemplate.bodyPartId)) continue;

            // Roll for success
            let finalChance = recipe.successChance * resultTemplate.chance;

            // Level difference bonus
            const levelDiff = predator.level - prey.level;
            finalChance += levelDiff * 0.02;

            // Rare mutation roll
            const isRare = Math.random() < recipe.rareChance;

            if (Math.random() < finalChance) {
                const result: DevourResult = {
                    ...resultTemplate,
                    isRare: isRare || resultTemplate.isRare,
                    statBonuses: isRare ? this.boostStats(resultTemplate.statBonuses, 1.5) : resultTemplate.statBonuses,
                };
                results.push(result);
            }
        }

        return results;
    }

    private boostStats(stats: Partial<CreatureStats>, multiplier: number): Partial<CreatureStats> {
        const boosted: Partial<CreatureStats> = {};
        for (const [key, value] of Object.entries(stats)) {
            boosted[key as keyof CreatureStats] = value * multiplier;
        }
        return boosted;
    }

    private applyMutation(predator: Creature, result: DevourResult): void {
        // Attach part to socket
        const socket = this.getSocket(predator, result.socketId);
        if (!socket) return;

        // Create attached part
        const preyData = this.creatureRegistry.get(result.sourceCreatureId); // Would need source tracking
        const partData = preyData?.anatomy.bodyParts.find(p => p.id === result.bodyPartId);

        if (!partData) return;

        const attachedPart: AttachedPart = {
            sourceCreatureId: '', // Would be set from prey
            bodyPartId: result.bodyPartId,
            bodyPartData: partData,
            mutationResult: result,
            attachedTime: Date.now() / 1000,
            level: 1,
            experience: 0,
        };

        // Apply to mutation slots
        const slot = predator.mutationSlots?.get(result.socketId);
        if (slot) {
            slot.attachedPart = attachedPart;
            slot.isLocked = false;
        } else {
            // Add new slot
            if (!predator.mutationSlots) predator.mutationSlots = new Map();
            predator.mutationSlots.set(result.socketId, {
                socketId: result.socketId,
                attachedPart,
                isLocked: false,
                unlockLevel: 1,
            });
        }

        // Apply stat bonuses
        this.applyStatBonuses(predator, result.statBonuses);

        // Unlock skills
        for (const skillId of result.unlockedSkills) {
            predator.unlockedSkills = predator.unlockedSkills || new Set();
            predator.unlockedSkills.add(skillId);
        }

        // Visual attachment (would trigger mesh attachment in renderer)
        this.attachVisual(predator, result);
    }

    private applyStatBonuses(creature: Creature, bonuses: Partial<CreatureStats>): void {
        if (bonuses.hp) creature.stats.hp += bonuses.hp;
        if (bonuses.damage) creature.stats.damage += bonuses.damage;
        if (bonuses.defense) creature.stats.defense += bonuses.defense;
        if (bonuses.poise) creature.stats.poise += bonuses.poise;
        if (bonuses.speed) creature.stats.speed += bonuses.speed;
        if (bonuses.stamina) creature.stats.stamina += bonuses.stamina;
        if (bonuses.elementalResist) {
            for (const [type, value] of Object.entries(bonuses.elementalResist)) {
                creature.stats.elementalResist[type as DamageType] =
                    (creature.stats.elementalResist[type as DamageType] || 0) + value;
            }
        }

        // Update current values proportionally
        creature.currentHP = Math.min(creature.currentHP + (bonuses.hp || 0), creature.stats.hp);
        creature.currentPoise = Math.min(creature.currentPoise + (bonuses.poise || 0), creature.stats.poise);
    }

    private attachVisual(creature: Creature, result: DevourResult): void {
        // This would trigger the renderer to attach mesh to socket
        // For now, emit event for visual system
        emitEvent(GameEvents.MUTATION_OCCURRED, {
            pet: creature,
            devouredCreature: null,
            part: {
                socketId: result.socketId,
                mesh: result.visualMesh,
                offset: result.visualOffset,
                rotation: result.visualRotation,
                scale: result.visualScale,
            },
        });
    }

    private getSocket(creature: Creature, socketId: string): MutationSocket | null {
        return creature.data.anatomy.sockets.find(s => s.id === socketId) || null;
    }

    private canAffordCost(creature: Creature, cost: DevourCost): boolean {
        const stamina = creature.getComponent?.('Stamina');
        if (stamina && !stamina.canAfford(cost.stamina)) return false;
        // Check energy, items
        return true;
    }

    private payCost(creature: Creature, cost: DevourCost): void {
        const stamina = creature.getComponent?.('Stamina');
        if (stamina) stamina.consume(cost.stamina);
        // Pay energy, consume items
    }

    // Mutation slot management
    initializeMutationSlots(creature: Creature): void {
        creature.mutationSlots = new Map();
        for (const socket of creature.data.anatomy.sockets) {
            creature.mutationSlots.set(socket.id, {
                socketId: socket.id,
                attachedPart: null,
                isLocked: socket.unlockLevel > 1,
                unlockLevel: socket.unlockLevel || 1,
            });
        }
    }

    unlockSlot(creature: Creature, socketId: string): boolean {
        const slot = creature.mutationSlots?.get(socketId);
        if (!slot || !slot.isLocked) return false;

        if (creature.level >= slot.unlockLevel) {
            slot.isLocked = false;
            return true;
        }
        return false;
    }

    removeMutation(creature: Creature, socketId: string): AttachedPart | null {
        const slot = creature.mutationSlots?.get(socketId);
        if (!slot || !slot.attachedPart) return null;

        const part = slot.attachedPart;

        // Remove stat bonuses
        this.removeStatBonuses(creature, part.mutationResult.statBonuses);

        // Remove skills
        for (const skillId of part.mutationResult.unlockedSkills) {
            creature.unlockedSkills?.delete(skillId);
        }

        // Remove visual
        this.detachVisual(creature, socketId);

        slot.attachedPart = null;
        return part;
    }

    private removeStatBonuses(creature: Creature, bonuses: Partial<CreatureStats>): void {
        if (bonuses.hp) creature.stats.hp = Math.max(1, creature.stats.hp - bonuses.hp);
        if (bonuses.damage) creature.stats.damage = Math.max(1, creature.stats.damage - bonuses.damage);
        if (bonuses.defense) creature.stats.defense = Math.max(0, creature.stats.defense - bonuses.defense);
        if (bonuses.poise) creature.stats.poise = Math.max(1, creature.stats.poise - bonuses.poise);
        if (bonuses.speed) creature.stats.speed = Math.max(0.1, creature.stats.speed - bonuses.speed);
        if (bonuses.elementalResist) {
            for (const [type, value] of Object.entries(bonuses.elementalResist)) {
                creature.stats.elementalResist[type as DamageType] =
                    Math.max(0, (creature.stats.elementalResist[type as DamageType] || 0) - value);
            }
        }

        creature.currentHP = Math.min(creature.currentHP, creature.stats.hp);
        creature.currentPoise = Math.min(creature.currentPoise, creature.stats.poise);
    }

    private detachVisual(creature: Creature, socketId: string): void {
        // Trigger visual detachment
    }

    // Get mutation preview for UI
    getMutationPreview(predator: Creature, prey: Creature): MutationPreview | null {
        const recipe = this.getRecipe(predator.data.id, prey.data.id);
        if (!recipe) return null;

        const possibleResults: MutationPreviewResult[] = [];

        for (const resultTemplate of recipe.results) {
            const preyPart = prey.bodyParts.get(resultTemplate.bodyPartId);
            if (!preyPart || preyPart.isDestroyed) continue;

            const predatorSocket = this.getSocket(predator, recipe.targetSocket);
            if (!predatorSocket || !predatorSocket.compatibleParts.includes(resultTemplate.bodyPartId)) continue;

            let chance = recipe.successChance * resultTemplate.chance;
            chance += (predator.level - prey.level) * 0.02;

            possibleResults.push({
                bodyPartId: resultTemplate.bodyPartId,
                bodyPartName: preyPart.data.name,
                socketId: recipe.targetSocket,
                socketName: predatorSocket.id,
                chance: Math.min(1, chance),
                isRare: false,
                statBonuses: resultTemplate.statBonuses,
                unlockedSkills: resultTemplate.unlockedSkills,
                visualMesh: resultTemplate.visualMesh,
            });
        }

        return {
            predatorId: predator.data.id,
            preyId: prey.data.id,
            recipeId: recipe.id,
            duration: 5,
            cost: recipe.cost,
            possibleResults,
        };
    }
}

export interface DevourSession {
    id: string;
    predator: Creature;
    prey: Creature;
    recipe: DevourRecipe;
    startTime: number;
    progress: number;
    duration: number;
    isComplete: boolean;
    results: DevourResult[];
}

export interface MutationPreview {
    predatorId: string;
    preyId: string;
    recipeId: string;
    duration: number;
    cost: DevourCost;
    possibleResults: MutationPreviewResult[];
}

export interface MutationPreviewResult {
    bodyPartId: string;
    bodyPartName: string;
    socketId: string;
    socketName: string;
    chance: number;
    isRare: boolean;
    statBonuses: Partial<CreatureStats>;
    unlockedSkills: string[];
    visualMesh: string;
}

// Evolution paths
export const EvolutionPaths: Record<string, EvolutionStage[]> = {
    'spirit_wolf': [
        { name: 'Dire Wolf', requiredLevel: 10, statMultiplier: 1.3, newParts: ['wolf_alpha_horns'] },
        { name: 'Fenrir', requiredLevel: 25, statMultiplier: 1.6, newParts: ['fenrir_ice_mane', 'fenrir_runic_tail'] },
        { name: 'Wolf of the End', requiredLevel: 50, statMultiplier: 2.0, newParts: ['apocalypse_jaws', 'void_wings'] },
    ],
    'sky_eagle': [
        { name: 'Storm Eagle', requiredLevel: 10, statMultiplier: 1.3, newParts: ['storm_talons'] },
        { name: 'Thunder Roc', requiredLevel: 25, statMultiplier: 1.6, newParts: ['roc_lightning_wings', 'roc_thunder_crest'] },
        { name: 'Sky Emperor', requiredLevel: 50, statMultiplier: 2.0, newParts: ['emperor_crown', 'tempest_wings'] },
    ],
    'abyssal_scorpion': [
        { name: 'Venomous Scorpid', requiredLevel: 10, statMultiplier: 1.3, newParts: ['scorpid_venom_stinger'] },
        { name: 'Abyss Crawler', requiredLevel: 25, statMultiplier: 1.6, newParts: ['crawler_shadow_claws', 'crawler_toxic_shell'] },
        { name: 'Deep One', requiredLevel: 50, statMultiplier: 2.0, newParts: ['deep_one_void_tail', 'abyssal_mandibles'] },
    ],
};

export interface EvolutionStage {
    name: string;
    requiredLevel: number;
    statMultiplier: number;
    newParts: string[];
}