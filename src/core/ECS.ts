/**
 * Entity-Component-System Core
 * Lightweight, performant ECS for game logic
 */

import {
  EntityId,
  Component,
  ComponentClass,
  System,
  Query,
  createEntityId,
} from './Types.js';

export type { EntityId } from './Types.js';

// ============================================================================
// COMPONENT REGISTRY
// ============================================================================

const componentRegistry = new Map<ComponentClass<Component>, number>();
let nextComponentTypeId = 0;

export function getComponentTypeId<T extends Component>(componentClass: ComponentClass<T>): number {
  let id = componentRegistry.get(componentClass);
  if (id === undefined) {
    id = nextComponentTypeId++;
    componentRegistry.set(componentClass, id);
  }
  return id;
}

// ============================================================================
// WORLD / ECS MANAGER
// ============================================================================

export class World {
  private entities = new Map<EntityId, Set<number>>(); // entityId -> componentTypeIds
  private components = new Map<number, Map<EntityId, Component>>(); // typeId -> (entityId -> component)
  private systems: System[] = [];
  private entityToAdd: Array<{ entityId: EntityId; components: Component[] }> = [];
  private entitiesToRemove: EntityId[] = [];
  private systemQueries = new Map<System, Set<EntityId>>();

  // ---- Entity Management ----

  createEntity(...components: Component[]): EntityId {
    const entityId = createEntityId();
    this.entityToAdd.push({ entityId, components });
    return entityId;
  }

  destroyEntity(entityId: EntityId): void {
    this.entitiesToRemove.push(entityId);
  }

  hasEntity(entityId: EntityId): boolean {
    return this.entities.has(entityId);
  }

  // ---- Component Management ----

  addComponent<T extends Component>(entityId: EntityId, component: T): T {
    const typeId = getComponentTypeId(component.constructor as ComponentClass<Component>);

    if (!this.components.has(typeId)) {
      this.components.set(typeId, new Map());
    }
    this.components.get(typeId)!.set(entityId, component);

    let entityComponents = this.entities.get(entityId);
    if (!entityComponents) {
      entityComponents = new Set();
      this.entities.set(entityId, entityComponents);
    }
    entityComponents.add(typeId);

    // Notify systems
    this.refreshEntityInSystems(entityId);

    return component;
  }

  getComponent<T extends Component>(entityId: EntityId, componentClass: ComponentClass<T>): T | undefined {
    const typeId = getComponentTypeId(componentClass);
    return this.components.get(typeId)?.get(entityId) as T | undefined;
  }

  removeComponent<T extends Component>(entityId: EntityId, componentClass: ComponentClass<T>): boolean {
    const typeId = getComponentTypeId(componentClass);
    const removed = this.components.get(typeId)?.delete(entityId) ?? false;

    if (removed) {
      const entityComponents = this.entities.get(entityId);
      entityComponents?.delete(typeId);
      if (entityComponents?.size === 0) {
        this.entities.delete(entityId);
      }
      this.refreshEntityInSystems(entityId);
    }
    return removed;
  }

  hasComponent<T extends Component>(entityId: EntityId, componentClass: ComponentClass<T>): boolean {
    const typeId = getComponentTypeId(componentClass);
    return this.components.get(typeId)?.has(entityId) ?? false;
  }

  // ---- Query System ----

  query(query: Query): EntityId[] {
    const { all = [], any = [], none = [] } = query;
    const allTypeIds = all.map(getComponentTypeId);
    const anyTypeIds = any.map(getComponentTypeId);
    const noneTypeIds = none.map(getComponentTypeId);

    const results: EntityId[] = [];

    // Start with entities that have ALL required components
    let candidateEntities: EntityId[] = [];

    if (allTypeIds.length > 0) {
      const firstTypeId = allTypeIds[0]!;
      const firstMap = this.components.get(firstTypeId);
      if (firstMap) {
        candidateEntities = Array.from(firstMap.keys()) as EntityId[];
      } else {
        candidateEntities = [];
      }
    } else if (anyTypeIds.length > 0) {
      // Union of any components
      const union = new Set<EntityId>();
      for (const typeId of anyTypeIds) {
        const map = this.components.get(typeId);
        if (map) {
          for (const eid of map.keys()) union.add(eid);
        }
      }
      candidateEntities = Array.from(union);
    } else {
      // All entities
      candidateEntities = Array.from(this.entities.keys());
    }

    for (const entityId of candidateEntities) {
      const entityComponents = this.entities.get(entityId);
      if (!entityComponents) continue;

      // Check ALL
      let matches = true;
      for (const typeId of allTypeIds) {
        if (!entityComponents.has(typeId)) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      // Check ANY
      if (anyTypeIds.length > 0) {
        matches = false;
        for (const typeId of anyTypeIds) {
          if (entityComponents.has(typeId)) {
            matches = true;
            break;
          }
        }
        if (!matches) continue;
      }

      // Check NONE
      for (const typeId of noneTypeIds) {
        if (entityComponents.has(typeId)) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      results.push(entityId);
    }

    return results;
  }

  // Iterate over query results with components
  *queryIter<T extends Component[]>(
    query: Query,
    ...componentClasses: { [K in keyof T]: ComponentClass<T[K]> }
  ): Generator<[EntityId, ...T], void, unknown> {
    const typeIds = componentClasses.map(getComponentTypeId);
    const entities = this.query(query);

    for (const entityId of entities) {
      const components = typeIds.map(typeId => this.components.get(typeId)!.get(entityId)!) as T;
      yield [entityId, ...components] as [EntityId, ...T];
    }
  }

  // ---- System Management ----

  addSystem(system: System): void {
    this.systems.push(system);
    this.systems.sort((a, b) => a.priority - b.priority);
    this.systemQueries.set(system, new Set());
    // Initialize with current entities
    for (const entityId of this.entities.keys()) {
      this.checkSystemMatch(system, entityId);
    }
  }

  removeSystem(system: System): void {
    const idx = this.systems.indexOf(system);
    if (idx >= 0) {
      this.systems.splice(idx, 1);
      this.systemQueries.delete(system);
    }
  }

  private checkSystemMatch(system: System, entityId: EntityId): void {
    // Simple heuristic: if system has a query method, use it
    // Otherwise, we rely on manual registration or the system queries itself each frame
    const querySet = this.systemQueries.get(system);
    if (querySet) {
      // For now, systems manage their own queries each frame
      // This is a placeholder for a more sophisticated archetype-based approach
    }
  }

  private refreshEntityInSystems(entityId: EntityId): void {
    // Systems will re-query each frame in this simple implementation
    // A full archetype ECS would update archetype membership here
  }

  // ---- Update Loop ----

  update(dt: number): void {
    // Process deferred entity additions
    for (const { entityId, components } of this.entityToAdd) {
      for (const component of components) {
        this.addComponent(entityId, component);
      }
    }
    this.entityToAdd.length = 0;

    // Process deferred entity removals
    for (const entityId of this.entitiesToRemove) {
      this.removeEntityImmediate(entityId);
    }
    this.entitiesToRemove.length = 0;

    // Update systems
    for (const system of this.systems) {
      system.update(dt);
    }
  }

  private removeEntityImmediate(entityId: EntityId): void {
    const entityComponents = this.entities.get(entityId);
    if (entityComponents) {
      for (const typeId of entityComponents) {
        this.components.get(typeId)?.delete(entityId);
      }
      this.entities.delete(entityId);
    }
  }

  // ---- Debug ----

  getEntityCount(): number {
    return this.entities.size;
  }

  getComponentCount(typeId: number): number {
    return this.components.get(typeId)?.size ?? 0;
  }

  getAllEntities(): EntityId[] {
    return Array.from(this.entities.keys());
  }

  clear(): void {
    this.entities.clear();
    this.components.clear();
    this.entityToAdd.length = 0;
    this.entitiesToRemove.length = 0;
  }
}

// ============================================================================
// BASE COMPONENT CLASSES
// ============================================================================

export abstract class BaseComponent implements Component {
  readonly entityId: EntityId;
  constructor(entityId: EntityId) {
    this.entityId = entityId;
  }
}

// Transform Component
export class TransformComponent extends BaseComponent {
  position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  rotation: { x: number; y: number; z: number; w: number } = { x: 0, y: 0, z: 0, w: 1 };
  scale: { x: number; y: number; z: number } = { x: 1, y: 1, z: 1 };

  constructor(entityId: EntityId) {
    super(entityId);
  }

  setPosition(x: number, y: number, z: number): this {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
    return this;
  }

  setRotation(x: number, y: number, z: number, w: number): this {
    this.rotation.x = x;
    this.rotation.y = y;
    this.rotation.z = z;
    this.rotation.w = w;
    return this;
  }

  setScale(x: number, y: number, z: number): this {
    this.scale.x = x;
    this.scale.y = y;
    this.scale.z = z;
    return this;
  }

  forward(): { x: number; y: number; z: number } {
    // Quaternion forward vector (assuming Y-up)
    const { x, y, z, w } = this.rotation;
    return {
      x: 2 * (x * z + w * y),
      y: 1 - 2 * (x * x + z * z),
      z: 2 * (y * z - w * x),
    };
  }

  right(): { x: number; y: number; z: number } {
    const { x, y, z, w } = this.rotation;
    return {
      x: 1 - 2 * (y * y + z * z),
      y: 2 * (x * y - w * z),
      z: 2 * (x * z + w * y),
    };
  }

  up(): { x: number; y: number; z: number } {
    const { x, y, z, w } = this.rotation;
    return {
      x: 2 * (x * y + w * z),
      y: 1 - 2 * (x * x + z * z),
      z: 2 * (y * z - w * x),
    };
  }
}

// ============================================================================
// COMMON COMPONENTS
// ============================================================================

export class NameComponent extends BaseComponent {
  name: string = '';
  constructor(entityId: EntityId, name: string = '') {
    super(entityId);
    this.name = name;
  }
}

export class TagComponent extends BaseComponent {
  tags: Set<string> = new Set();
  constructor(entityId: EntityId, ...args: unknown[]) {
    super(entityId);
    for (const tag of args) {
      if (typeof tag === 'string') this.tags.add(tag);
    }
  }
  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }
  addTag(tag: string): void {
    this.tags.add(tag);
  }
  removeTag(tag: string): void {
    this.tags.delete(tag);
  }
}

// ============================================================================
// SYSTEM BASE CLASS
// ============================================================================

export abstract class BaseSystem implements System {
  abstract readonly priority: number;
  protected world!: World;

  setWorld(world: World): void {
    this.world = world;
  }

  abstract update(dt: number): void;

  // Helper to query entities each frame
  protected queryEntities(query: Query): EntityId[] {
    return this.world.query(query);
  }
}