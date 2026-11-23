// ChimeraLand - ECS System Base
// Systems contain logic, operate on entities with specific components

import { World } from './Entity';
import { Component, getComponentTypeId } from './Component';

export abstract class System {
    world: World | null = null;
    enabled: boolean = true;
    priority: number = 0; // Lower runs first
    requiredComponents: (new (...args: any[]) => Component)[] = [];

    constructor(priority: number = 0) { this.priority = priority; }

    onInit(): void {}
    onDestroy(): void {}

    abstract update(dt: number): void;
    lateUpdate(dt: number): void {}
    fixedUpdate(fixedDt: number): void {}

    // Helper to get entities with required components
    protected getEntities(): Entity[] {
        if (!this.world) return [];
        if (this.requiredComponents.length === 0) {
            return Array.from(this.world.entities.values()).filter(e => e.active);
        }
        return this.world.query(...this.requiredComponents);
    }

    protected getEntity(entityId: number): Entity | undefined {
        return this.world?.getEntity(entityId);
    }
}

// Entity reference for System
import { Entity } from './Entity';

// Specialized Systems
export class RenderSystem extends System {
    requiredComponents = [];
    constructor() { super(100); } // Run last
    update(dt: number): void {
        // Render logic would go here
    }
}

export class PhysicsSystem extends System {
    requiredComponents = [];
    constructor() { super(-100); } // Run first
    fixedUpdate(fixedDt: number): void {
        // Physics integration
    }
}

// Base entity class for non-ECS usage (simpler alternative)
export class GameObject {
    id: number = -1;
    name: string = 'GameObject';
    active: boolean = true;
    parent: GameObject | null = null;
    children: GameObject[] = [];
    components: Map<string, Component> = new Map();
    transform: TransformComponent;

    constructor(name?: string) {
        this.name = name || 'GameObject';
        this.transform = new TransformComponent();
        this.addComponent(this.transform);
    }

    addComponent<T extends Component>(component: T): T {
        component.onAttach(this as any);
        this.components.set(component.componentName, component);
        return component;
    }

    getComponent<T extends Component>(name: string): T | null {
        return this.components.get(name) as T || null;
    }

    removeComponent(name: string): boolean {
        const comp = this.components.get(name);
        if (comp) {
            comp.onDetach();
            this.components.delete(name);
            return true;
        }
        return false;
    }

    update(dt: number): void {
        for (const comp of this.components.values()) {
            if (comp.enabled && typeof (comp as any).update === 'function') {
                (comp as any).update(dt);
            }
        }
    }

    destroy(): void {
        for (const comp of this.components.values()) comp.onDetach();
        this.components.clear();
        this.active = false;
    }
}

import { TransformComponent } from './Component';