// ChimeraLand - ECS Entity
// Lightweight entity with component bag

import { Component, getComponentTypeId } from './Component';
import { Vec3, Quat } from './MathUtils';

let nextEntityId = 1;

export class Entity {
    readonly id: number;
    readonly name: string;
    active: boolean = true;
    tags: Set<string> = new Set();

    private components: Map<number, Component> = new Map();
    private componentArray: Component[] = [];
    private toAdd: Component[] = [];
    private toRemove: Set<number> = new Set();
    private transforming: boolean = false;

    constructor(name: string = 'Entity') {
        this.id = nextEntityId++;
        this.name = name;
    }

    // Component management
    addComponent<T extends Component>(component: T): T {
        const typeId = getComponentTypeId(component.constructor as any);
        if (this.components.has(typeId)) {
            console.warn(`Entity ${this.name} already has component ${component.componentName}`);
            return this.getComponent(component.constructor as any)!;
        }
        component.onAttach(this);
        this.toAdd.push(component);
        return component;
    }

    getComponent<T extends Component>(ctor: new (...args: any[]) => T): T | null {
        const typeId = getComponentTypeId(ctor);
        return (this.components.get(typeId) as T) || null;
    }

    hasComponent<T extends Component>(ctor: new (...args: any[]) => T): boolean {
        return this.components.has(getComponentTypeId(ctor));
    }

    removeComponent<T extends Component>(ctor: new (...args: any[]) => T): boolean {
        const typeId = getComponentTypeId(ctor);
        const comp = this.components.get(typeId);
        if (comp) {
            this.toRemove.add(typeId);
            return true;
        }
        return false;
    }

    removeComponentByInstance(comp: Component): boolean {
        const typeId = getComponentTypeId(comp.constructor as any);
        if (this.components.has(typeId)) {
            this.toRemove.add(typeId);
            return true;
        }
        return false;
    }

    // Apply deferred changes
    applyChanges(): void {
        for (const comp of this.toAdd) {
            const typeId = getComponentTypeId(comp.constructor as any);
            this.components.set(typeId, comp);
            this.componentArray.push(comp);
        }
        this.toAdd.length = 0;

        for (const typeId of this.toRemove) {
            const comp = this.components.get(typeId);
            if (comp) {
                comp.onDetach();
                this.components.delete(typeId);
                const idx = this.componentArray.indexOf(comp);
                if (idx >= 0) this.componentArray.splice(idx, 1);
            }
        }
        this.toRemove.clear();
    }

    getAllComponents(): Component[] { return this.componentArray; }

    // Tag system for fast filtering
    addTag(tag: string): this { this.tags.add(tag); return this; }
    removeTag(tag: string): this { this.tags.delete(tag); return this; }
    hasTag(tag: string): boolean { return this.tags.has(tag); }

    // Lifecycle
    destroy(): void {
        for (const comp of this.componentArray) {
            comp.onDetach();
        }
        this.components.clear();
        this.componentArray.length = 0;
        this.active = false;
    }

    // Serialization
    toJSON(): object {
        const data: any = { id: this.id, name: this.name, active: this.active, tags: [...this.tags], components: {} };
        for (const comp of this.componentArray) {
            if (comp.enabled) data.components[comp.componentName] = comp;
        }
        return data;
    }

    static fromJSON(data: any, world: World): Entity {
        const entity = new Entity(data.name);
        entity.id = data.id;
        entity.active = data.active;
        entity.tags = new Set(data.tags);
        // Components would need custom deserialization
        return entity;
    }
}

// World - ECS Manager
import { System } from './System';

export class World {
    entities: Map<number, Entity> = new Map();
    systems: System[] = [];
    private toAdd: Entity[] = [];
    private toRemove: Set<number> = new Set();
    private entityTags: Map<string, Set<Entity>> = new Map();

    // Entity management
    spawn(entity: Entity): Entity {
        this.toAdd.push(entity);
        return entity;
    }

    despawn(entity: Entity): void {
        this.toRemove.add(entity.id);
    }

    getEntity(id: number): Entity | undefined { return this.entities.get(id); }
    getEntitiesWithTag(tag: string): Set<Entity> | undefined { return this.entityTags.get(tag); }

    // System management
    addSystem(system: System): System {
        system.world = this;
        this.systems.push(system);
        this.systems.sort((a, b) => a.priority - b.priority);
        system.onInit();
        return system;
    }

    removeSystem(system: System): boolean {
        const idx = this.systems.indexOf(system);
        if (idx >= 0) {
            system.onDestroy();
            this.systems.splice(idx, 1);
            return true;
        }
        return false;
    }

    getSystem<T extends System>(ctor: new (...args: any[]) => T): T | null {
        return this.systems.find(s => s instanceof ctor) as T || null;
    }

    // Update loop
    update(dt: number): void {
        // Apply entity changes
        for (const entity of this.toAdd) {
            this.entities.set(entity.id, entity);
            for (const tag of entity.tags) {
                if (!this.entityTags.has(tag)) this.entityTags.set(tag, new Set());
                this.entityTags.get(tag)!.add(entity);
            }
        }
        this.toAdd.length = 0;

        for (const id of this.toRemove) {
            const entity = this.entities.get(id);
            if (entity) {
                for (const tag of entity.tags) {
                    this.entityTags.get(tag)?.delete(entity);
                }
                entity.destroy();
                this.entities.delete(id);
            }
        }
        this.toRemove.clear();

        // Apply component changes for all entities
        for (const entity of this.entities.values()) {
            if (entity.active) entity.applyChanges();
        }

        // Update systems
        for (const system of this.systems) {
            if (system.enabled) system.update(dt);
        }

        // Late update
        for (const system of this.systems) {
            if (system.enabled) system.lateUpdate(dt);
        }
    }

    fixedUpdate(fixedDt: number): void {
        for (const system of this.systems) {
            if (system.enabled) system.fixedUpdate(fixedDt);
        }
    }

    // Queries
    query<T extends Component>(...ctors: (new (...args: any[]) => T)[]): Entity[] {
        const results: Entity[] = [];
        const typeIds = ctors.map(c => getComponentTypeId(c));
        for (const entity of this.entities.values()) {
            if (!entity.active) continue;
            let match = true;
            for (const typeId of typeIds) {
                if (!entity.components.has(typeId)) { match = false; break; }
            }
            if (match) results.push(entity);
        }
        return results;
    }

    queryOne<T extends Component>(...ctors: (new (...args: any[]) => T)[]): Entity | null {
        const typeIds = ctors.map(c => getComponentTypeId(c));
        for (const entity of this.entities.values()) {
            if (!entity.active) continue;
            let match = true;
            for (const typeId of typeIds) {
                if (!entity.components.has(typeId)) { match = false; break; }
            }
            if (match) return entity;
        }
        return null;
    }

    // Clear all
    clear(): void {
        for (const entity of this.entities.values()) entity.destroy();
        this.entities.clear();
        this.toAdd.length = 0;
        this.toRemove.clear();
        this.entityTags.clear();
    }
}