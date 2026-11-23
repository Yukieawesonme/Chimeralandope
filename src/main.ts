// ChimeraLand - Main Entry Point
// Initializes all systems and starts the game loop

import { Engine } from './core/Engine';
import { EventBus, GameEvents } from './core/EventBus';
import { Vec3 } from './core/MathUtils';
import { GameConfig } from './core/Config';
import { ObjectPool, PoolManager, initializePools } from './pooling/ObjectPool';
import { WeaponSystem } from './combat/WeaponSystem';
import { CombatController } from './combat/CombatController';
import { DamageCalculator } from './combat/DamageCalculator';
import { HitStop } from './combat/HitStop';
import { CameraShake } from './combat/HitStop';
import { PoiseSystem } from './combat/PoiseSystem';
import { PlayerController } from './movement/LocomotionStateMachine';
import { SkillSystem } from './skills/SkillSystem';
import { CreatureSpawnManager } from './creatures/CreatureAI';
import { ChimeraSystem } from './creatures/ChimeraSystem';
import { BuildingSystem } from './building/BuildingSystem';
import { InputManager, TouchInputManager } from './core/Engine';

// Global system references (for easy access from anywhere)
declare global {
    var Engine: Engine;
    var EventBus: EventBus;
    var WeaponSystem: WeaponSystem;
    var CombatController: CombatController;
    var SkillSystem: SkillSystem;
    var CreatureSpawnManager: CreatureSpawnManager;
    var ChimeraSystem: ChimeraSystem;
    var BuildingSystem: BuildingSystem;
    var PlayerController: PlayerController;
    var InputManager: InputManager;
    var TouchInputManager: TouchInputManager;
    var DamageCalculator: DamageCalculator;
    var HitStop: HitStop;
    var CameraShake: CameraShake;
    var PoiseSystem: PoiseSystem;
    var PoolManager: PoolManager;
    var GameConfig: typeof GameConfig;
}

class Game {
    engine: Engine;
    eventBus: EventBus;
    weaponSystem: WeaponSystem;
    combatController: CombatController;
    skillSystem: SkillSystem;
    creatureSpawnManager: CreatureSpawnManager;
    chimeraSystem: ChimeraSystem;
    buildingSystem: BuildingSystem;
    playerController: PlayerController;
    inputManager: InputManager;
    touchInputManager: TouchInputManager;
    damageCalculator: DamageCalculator;
    hitStop: HitStop;
    cameraShake: CameraShake;
    poiseSystem: PoiseSystem;
    poolManager: PoolManager;

    // Game state
    isInitialized: boolean = false;
    player: any = null;
    currentBiome: string = 'spirit_plains';
    isNight: boolean = false;
    worldTime: number = 0;

    constructor() {
        // Initialize core engine
        this.engine = new Engine();
        this.eventBus = EventBus.getInstance();

        // Initialize systems
        this.weaponSystem = WeaponSystem.getInstance();
        this.combatController = CombatController.getInstance();
        this.skillSystem = SkillSystem.getInstance();
        this.creatureSpawnManager = CreatureSpawnManager.getInstance();
        this.chimeraSystem = ChimeraSystem.getInstance();
        this.buildingSystem = BuildingSystem.getInstance();
        this.playerController = new PlayerController();
        this.inputManager = new InputManager();
        this.touchInputManager = new TouchInputManager();
        this.damageCalculator = new DamageCalculator();
        this.hitStop = HitStop.getInstance();
        this.cameraShake = CameraShake.getInstance();
        this.poiseSystem = PoiseSystem.getInstance();
        this.poolManager = PoolManager.getInstance();

        // Set global references
        this.setGlobalReferences();

        // Initialize pools
        initializePools();

        // Setup engine callbacks
        this.setupEngineCallbacks();

        // Load game data
        this.loadGameData();
    }

    private setGlobalReferences(): void {
        globalThis.Engine = this.engine;
        globalThis.EventBus = this.eventBus;
        globalThis.WeaponSystem = this.weaponSystem;
        globalThis.CombatController = this.combatController;
        globalThis.SkillSystem = this.skillSystem;
        globalThis.CreatureSpawnManager = this.creatureSpawnManager;
        globalThis.ChimeraSystem = this.chimeraSystem;
        globalThis.BuildingSystem = this.buildingSystem;
        globalThis.PlayerController = this.playerController;
        globalThis.InputManager = this.inputManager;
        globalThis.TouchInputManager = this.touchInputManager;
        globalThis.DamageCalculator = this.damageCalculator;
        globalThis.HitStop = this.hitStop;
        globalThis.CameraShake = this.cameraShake;
        globalThis.PoiseSystem = this.poiseSystem;
        globalThis.PoolManager = this.poolManager;
        globalThis.GameConfig = GameConfig;
    }

    private setupEngineCallbacks(): void {
        this.engine.onUpdate = (dt: number) => this.update(dt);
        this.engine.onFixedUpdate = (dt: number) => this.fixedUpdate(dt);
        this.engine.onLateUpdate = (dt: number) => this.lateUpdate(dt);
    }

    private async loadGameData(): Promise<void> {
        try {
            // Load weapon configs
            await this.loadWeaponConfigs();

            // Load skill configs
            await this.loadSkillConfigs();

            // Load creature configs
            await this.loadCreatureConfigs();

            // Load building configs
            await this.loadBuildingConfigs();

            // Load biome data
            await this.loadBiomeData();

            // Load elemental reactions
            await this.loadElementalReactions();

            console.log('All game data loaded successfully');
        } catch (error) {
            console.error('Failed to load game data:', error);
        }
    }

    private async loadWeaponConfigs(): Promise<void> {
        const weaponIds = [
            'sword_long',
            'heavy_hammer',
            'longbow',
            'elemental_staff',
            'twin_daggers'
        ];

        for (const id of weaponIds) {
            try {
                const response = await fetch(`/assets/data/weapons/${id}.json`);
                const data = await response.json();
                this.weaponSystem.equipWeapon(
                    data.slot as any,
                    data
                );
            } catch (error) {
                console.warn(`Failed to load weapon ${id}:`, error);
            }
        }
    }

    private async loadSkillConfigs(): Promise<void> {
        const skillIds = [
            'lightning_dash',
            'meteor_rain',
            'ground_slam',
            'piercing_shot',
            'primal_manifestation'
        ];

        for (const id of skillIds) {
            try {
                const response = await fetch(`/assets/data/skills/${id}.json`);
                const data = await response.json();
                this.skillSystem.registerSkill(data);
            } catch (error) {
                console.warn(`Failed to load skill ${id}:`, error);
            }
        }
    }

    private async loadCreatureConfigs(): Promise<void> {
        const creatureIds = [
            'spirit_wolf',
            'sky_eagle',
            'abyssal_scorpion'
        ];

        for (const id of creatureIds) {
            try {
                const response = await fetch(`/assets/data/creatures/${id}.json`);
                const data = await response.json();
                this.creatureSpawnManager.registerConfig(data);
                this.chimeraSystem.registerCreature(data);
            } catch (error) {
                console.warn(`Failed to load creature ${id}:`, error);
            }
        }
    }

    private async loadBuildingConfigs(): Promise<void> {
        try {
            const response = await fetch('/assets/data/building/building_pieces.json');
            const data = await response.json();

            for (const piece of data.pieces) {
                this.buildingSystem.registerPieceConfig(piece);
            }
        } catch (error) {
            console.warn('Failed to load building configs:', error);
        }
    }

    private async loadBiomeData(): Promise<void> {
        // Biome data would be used by WorldStreaming system
        try {
            const response = await fetch('/assets/data/biomes.json');
            const data = await response.json();
            console.log('Biome data loaded:', data.biomes.length, 'biomes');
        } catch (error) {
            console.warn('Failed to load biome data:', error);
        }
    }

    private async loadElementalReactions(): Promise<void> {
        try {
            const response = await fetch('/assets/data/elemental_reactions.json');
            const data = await response.json();

            for (const reaction of data.reactions) {
                this.skillSystem.registerReaction(reaction.name, {
                    name: reaction.name,
                    elements: reaction.elements as any,
                    damageMultiplier: reaction.damageMultiplier,
                    radius: reaction.radius,
                    effect: reaction.effect,
                    applyStatus: reaction.applyStatus
                });
            }
        } catch (error) {
            console.warn('Failed to load elemental reactions:', error);
        }
    }

    private createPlayer(): void {
        // Create player entity
        this.player = this.engine.world.spawn({
            name: 'Player',
            components: {
                Transform: { position: new Vec3(0, 10, 0) },
                Velocity: {},
                Health: { max: GameConfig.PLAYER.HEALTH_MAX },
                Stamina: { max: GameConfig.PLAYER.STAMINA_MAX },
                Input: {},
                PlayerTag: {}
            }
        });

        // Set up combat controller
        this.combatController.setPlayer(this.player);

        // Set up player controller
        this.playerController.transform = this.player.getComponent('Transform');
        this.playerController.velocity = this.player.getComponent('Velocity');
        this.playerController.stamina = this.player.getComponent('Stamina');
        this.playerController.health = this.player.getComponent('Health');

        // Initialize poise
        this.poiseSystem.initialize(this.player, GameConfig.PLAYER.HEALTH_MAX * 0.5);

        // Emit spawn event
        this.eventBus.emit(GameEvents.PLAYER_SPAWNED, {
            position: new Vec3(0, 10, 0)
        });

        console.log('Player created');
    }

    private initializeSystems(): void {
        // Equip starting weapons
        this.weaponSystem.equipWeapon(0, this.weaponSystem.getWeapon(0)?.data);
        this.weaponSystem.equipWeapon(1, this.weaponSystem.getWeapon(1)?.data);
        this.weaponSystem.equipWeapon(2, this.weaponSystem.getWeapon(2)?.data);

        // Set up skill system
        this.skillSystem.equipSkill('skill_lightning_dash', 0);
        this.skillSystem.equipSkill('skill_piercing_shot', 1);
        this.skillSystem.equipSkill('skill_meteor_rain', 2);
        this.skillSystem.equipSkill('skill_primal_manifestation', -1); // Ultimate

        // Claim starting territory
        this.buildingSystem.claimTerritory(this.player, new Vec3(0, 0, 0));

        console.log('Systems initialized');
    }

    update(dt: number): void {
        if (!this.isInitialized) return;

        // Update input
        this.inputManager.update(this.engine.input);
        this.touchInputManager.update(this.engine.input);

        // Update player controller
        this.playerController.handleInput(this.engine.input);
        this.playerController.update(dt);

        // Update combat
        this.combatController.update(dt);

        // Update skills
        this.skillSystem.update(dt, this.player);

        // Update creature spawning
        this.creatureSpawnManager.update(dt, {
            getPlayer: () => this.player,
            getBiomeAt: (pos: Vec3) => this.currentBiome,
            isNight: () => this.isNight
        });

        // Update building system
        this.buildingSystem.updateTerritories(dt);

        // Update world time
        this.updateWorldTime(dt);

        // Handle build mode
        if (this.engine.input.buildModePressed) {
            if (this.buildingSystem.isBuildMode) {
                this.buildingSystem.exitBuildMode();
            } else {
                this.buildingSystem.enterBuildMode(this.player);
            }
        }

        if (this.buildingSystem.isBuildMode) {
            this.handleBuildMode();
        }
    }

    fixedUpdate(dt: number): void {
        if (!this.isInitialized) return;

        this.playerController.fixedUpdate(dt);

        // Physics would run here
    }

    lateUpdate(dt: number): void {
        if (!this.isInitialized) return;

        // Camera update would go here
        this.updateCamera(dt);
    }

    private updateWorldTime(dt: number): void {
        this.worldTime += dt;
        const dayLength = GameConfig.WORLD.DAY_LENGTH;
        const timeOfDay = (this.worldTime % dayLength) / dayLength;

        const wasNight = this.isNight;
        this.isNight = timeOfDay < (GameConfig.WORLD.DAWN_HOUR / 24) || timeOfDay > (GameConfig.WORLD.DUSK_HOUR / 24);

        if (wasNight !== this.isNight) {
            this.eventBus.emit(GameEvents.TIME_CHANGED, {
                time: this.worldTime,
                isNight: this.isNight,
                timeOfDay
            });
        }
    }

    private updateCamera(dt: number): void {
        // Camera follow logic
        if (!this.player) return;

        const camera = this.engine.getSystem?.('Camera'); // Would be actual camera system
        // Camera follows player with offset and smoothing
    }

    private handleBuildMode(): void {
        // Raycast from camera to find placement position
        // This would integrate with actual rendering/physics
        const raycastHit = this.performBuildRaycast();

        if (raycastHit) {
            const snap = this.buildingSystem.updatePreview(raycastHit);

            // Handle rotation
            if (this.engine.input.attackPressed) {
                this.buildingSystem.rotatePreview(Math.PI / 2);
            }

            // Handle mirror
            if (this.engine.input.skill1Pressed) {
                this.buildingSystem.toggleMirror();
            }

            // Confirm placement
            if (this.engine.input.interactPressed && snap?.isValid) {
                this.buildingSystem.confirmPlacement(this.player);
            }

            // Cancel
            if (this.engine.input.buildModePressed) {
                this.buildingSystem.exitBuildMode();
            }
        }
    }

    private performBuildRaycast(): { position: Vec3; normal: Vec3; pieceId: string | null } | null {
        // Would perform actual raycast from camera
        // Returns mock data for now
        return null;
    }

    async start(): Promise<void> {
        console.log('Starting ChimeraLand...');

        // Create player
        this.createPlayer();

        // Initialize systems
        this.initializeSystems();

        // Mark as initialized
        this.isInitialized = true;

        // Start engine
        this.engine.start();

        console.log('ChimeraLand started successfully!');
    }

    stop(): void {
        this.engine.stop();
        this.isInitialized = false;
        console.log('ChimeraLand stopped');
    }

    // Public API for external access
    getPlayer(): any { return this.player; }
    getWeaponSystem(): WeaponSystem { return this.weaponSystem; }
    getCombatController(): CombatController { return this.combatController; }
    getSkillSystem(): SkillSystem { return this.skillSystem; }
    getBuildingSystem(): BuildingSystem { return this.buildingSystem; }
    getPlayerController(): PlayerController { return this.playerController; }
}

// Auto-start when loaded
if (typeof window !== 'undefined') {
    const game = new Game();
    game.start().catch(console.error);

    // Expose for debugging
    (window as any).game = game;
}

export { Game };