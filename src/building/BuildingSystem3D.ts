/**
 * Building System 3D - Free-form Construction with Preview, Snap, Validation
 * Supports grid/socket snapping, stability checks, persistence
 */

import * as THREE from 'three';
import { World, EntityId, BaseSystem } from '@core/ECS.js';
import { TransformComponent } from '@core/ECS.js';
import { PlayerComponent } from '@entities/Player.js';
import { InputManager } from '@engine/InputManager.js';
import { BUILDING_CONFIG } from '@core/Config.js';
import { ItemType, EquipmentSlot, ActionName, Vec3, Quat } from '@core/Types.js';

// ============================================================================
// BUILDING TYPES
// ============================================================================

export interface BuildingPieceDefinition {
  id: string;
  name: string;
  description: string;
  category: 'foundation' | 'wall' | 'floor' | 'roof' | 'door' | 'window' | 'stair' | 'decoration' | 'crafting' | 'storage';

  // Visual
  modelPath: string;
  previewModelPath?: string;
  scale: number;

  // Snap
  snapPoints: SnapPoint[];
  gridSize: number;
  rotationSteps: number; // 4 = 90°, 8 = 45°, etc.

  // Stability
  stability: number; // 0-1, how much stability this piece provides
  maxLoad: number; // How much weight it can support
  requiresSupport: boolean; // Needs foundation/ground beneath

  // Cost
  cost: { itemId: string; quantity: number }[];

  // Crafting
  craftingStation?: string; // Required station to craft
  craftTime: number;

  // States
  hasVariations: boolean;
  variations?: BuildingVariation[];

  // Interaction
  isInteractable: boolean;
  interactionType?: 'open' | 'craft' | 'store' | 'sleep' | 'light';
}

export interface SnapPoint {
  id: string;
  localPosition: Vec3;
  localRotation: Quat;
  type: 'grid' | 'socket' | 'edge' | 'corner';
  allowedConnections: string[]; // Piece IDs or categories
  direction: 'up' | 'down' | 'horizontal' | 'any';
}

export interface BuildingVariation {
  id: string;
  name: string;
  modelPath: string;
  textureTint?: { r: number; g: number; b: number };
  cost?: { itemId: string; quantity: number }[];
}

export interface PlacedBuildingPiece {
  id: string;
  entityId: EntityId;
  definitionId: string;
  variationId?: string;
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  snapConnections: Map<string, string>; // mySnapId -> connectedPieceId
  stability: number;
  durability: number;
  maxDurability: number;
  ownerId: EntityId;
  placedTime: number;
  customData: Record<string, any>; // For stations, storage, etc.
}

export interface BuildPreview {
  definitionId: string;
  variationId?: string;
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  isValid: boolean;
  validationErrors: string[];
  snapPointUsed?: string;
  connectedPieceId?: EntityId;
  material: THREE.Material;
}

// ============================================================================
// BUILDING SYSTEM
// ============================================================================

export class BuildingSystem3D extends BaseSystem {
  readonly priority = 35;

  private playerEntity: EntityId | null = null;
  private playerComp: PlayerComponent | null = null;
  private inputManager: InputManager;
  private camera: THREE.Camera;
  private scene: THREE.Scene;

  // Building definitions registry
  private pieceDefinitions: Map<string, BuildingPieceDefinition> = new Map();

  // Placed pieces
  private placedPieces: Map<EntityId, PlacedBuildingPiece> = new Map();
  private pieceEntities: Map<string, EntityId> = new Map(); // pieceId -> entityId

  // Preview system
  private currentPreview: BuildPreview | null = null;
  private previewMesh: THREE.Group | null = null;
  private previewMaterial: THREE.Material;
  private previewMaterialValid: THREE.Material;
  private previewMaterialInvalid: THREE.Material;

  // Grid/Snap
  private gridSize = BUILDING_CONFIG.gridSize;
  private snapThreshold = BUILDING_CONFIG.snapThreshold;
  private maxBuildDistance = BUILDING_CONFIG.maxBuildDistance;

  // Selection
  private selectedPieceId: EntityId | null = null;
  private hoverPieceId: EntityId | null = null;

  // Callbacks
  public onPiecePlaced?: (piece: PlacedBuildingPiece) => void;
  public onPieceRemoved?: (pieceId: EntityId) => void;
  public onPieceSelected?: (pieceId: EntityId | null) => void;
  public onPreviewUpdate?: (preview: BuildPreview | null) => void;
  public onValidationError?: (errors: string[]) => void;

  constructor(
    world: World,
    camera: THREE.Camera,
    scene: THREE.Scene,
    inputManager: InputManager
  ) {
    super();
    this.camera = camera;
    this.scene = scene;
    this.inputManager = inputManager;

    this.initializeMaterials();
    this.initializePieceDefinitions();
  }

  private initializeMaterials(): void {
    // Valid preview material (green tint)
    this.previewMaterialValid = new THREE.MeshStandardMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
      emissive: 0x22c55e,
      emissiveIntensity: 0.2,
    });

    // Invalid preview material (red tint)
    this.previewMaterialInvalid = new THREE.MeshStandardMaterial({
      color: 0xf87171,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
      emissive: 0xef4444,
      emissiveIntensity: 0.2,
    });

    // Default preview material
    this.previewMaterial = this.previewMaterialValid;
  }

  private initializePieceDefinitions(): void {
    // Foundation pieces
    this.registerPiece({
      id: 'foundation_stone',
      name: 'Fundação de Pedra',
      description: 'Base sólida para construções',
      category: 'foundation',
      modelPath: 'building/foundation_stone.glb',
      scale: 1,
      snapPoints: [
        { id: 'top', localPosition: { x: 0, y: 1, z: 0 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'grid', allowedConnections: ['wall', 'floor', 'stair'], direction: 'up' },
        { id: 'north', localPosition: { x: 0, y: 0.5, z: -1 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'edge', allowedConnections: ['wall'], direction: 'horizontal' },
        { id: 'south', localPosition: { x: 0, y: 0.5, z: 1 }, localRotation: { x: 0, y: Math.PI, z: 0, w: 1 }, type: 'edge', allowedConnections: ['wall'], direction: 'horizontal' },
        { id: 'east', localPosition: { x: 1, y: 0.5, z: 0 }, localRotation: { x: 0, y: -Math.PI/2, z: 0, w: 1 }, type: 'edge', allowedConnections: ['wall'], direction: 'horizontal' },
        { id: 'west', localPosition: { x: -1, y: 0.5, z: 0 }, localRotation: { x: 0, y: Math.PI/2, z: 0, w: 1 }, type: 'edge', allowedConnections: ['wall'], direction: 'horizontal' },
      ],
      gridSize: 2,
      rotationSteps: 4,
      stability: 1.0,
      maxLoad: 1000,
      requiresSupport: false,
      cost: [{ itemId: 'stone', quantity: 10 }, { itemId: 'wood', quantity: 5 }],
      craftTime: 5,
      hasVariations: false,
      isInteractable: false,
    });

    // Wall pieces
    this.registerPiece({
      id: 'wall_stone',
      name: 'Parede de Pedra',
      description: 'Parede sólida para delimitar áreas',
      category: 'wall',
      modelPath: 'building/wall_stone.glb',
      scale: 1,
      snapPoints: [
        { id: 'bottom', localPosition: { x: 0, y: 0, z: 0 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'socket', allowedConnections: ['foundation', 'floor'], direction: 'down' },
        { id: 'top', localPosition: { x: 0, y: 2, z: 0 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'socket', allowedConnections: ['wall', 'roof'], direction: 'up' },
        { id: 'north', localPosition: { x: 0, y: 1, z: -1 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'edge', allowedConnections: ['wall', 'door', 'window'], direction: 'horizontal' },
        { id: 'south', localPosition: { x: 0, y: 1, z: 1 }, localRotation: { x: 0, y: Math.PI, z: 0, w: 1 }, type: 'edge', allowedConnections: ['wall', 'door', 'window'], direction: 'horizontal' },
      ],
      gridSize: 2,
      rotationSteps: 4,
      stability: 0.8,
      maxLoad: 200,
      requiresSupport: true,
      cost: [{ itemId: 'stone', quantity: 15 }, { itemId: 'wood', quantity: 3 }],
      craftTime: 8,
      hasVariations: true,
      variations: [
        { id: 'doorway', name: 'Com Porta', modelPath: 'building/wall_stone_doorway.glb', cost: [{ itemId: 'stone', quantity: 12 }, { itemId: 'wood', quantity: 5 }, { itemId: 'iron_hinge', quantity: 2 }] },
        { id: 'window', name: 'Com Janela', modelPath: 'building/wall_stone_window.glb', cost: [{ itemId: 'stone', quantity: 12 }, { itemId: 'glass', quantity: 2 }] },
      ],
      isInteractable: false,
    });

    // Floor pieces
    this.registerPiece({
      id: 'floor_wood',
      name: 'Piso de Madeira',
      description: 'Piso elevado para segundo andar',
      category: 'floor',
      modelPath: 'building/floor_wood.glb',
      scale: 1,
      snapPoints: [
        { id: 'bottom', localPosition: { x: 0, y: 0, z: 0 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'socket', allowedConnections: ['wall', 'floor'], direction: 'down' },
        { id: 'top', localPosition: { x: 0, y: 0.2, z: 0 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'grid', allowedConnections: ['wall', 'floor', 'stair'], direction: 'up' },
        { id: 'edge_n', localPosition: { x: 0, y: 0.1, z: -1 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'edge', allowedConnections: ['wall'], direction: 'horizontal' },
        { id: 'edge_s', localPosition: { x: 0, y: 0.1, z: 1 }, localRotation: { x: 0, y: Math.PI, z: 0, w: 1 }, type: 'edge', allowedConnections: ['wall'], direction: 'horizontal' },
      ],
      gridSize: 2,
      rotationSteps: 4,
      stability: 0.6,
      maxLoad: 300,
      requiresSupport: true,
      cost: [{ itemId: 'wood', quantity: 20 }],
      craftTime: 5,
      hasVariations: false,
      isInteractable: false,
    });

    // Roof pieces
    this.registerPiece({
      id: 'roof_thatch',
      name: 'Telhado de Palha',
      description: 'Telhado simples para proteção contra chuva',
      category: 'roof',
      modelPath: 'building/roof_thatch.glb',
      scale: 1,
      snapPoints: [
        { id: 'bottom', localPosition: { x: 0, y: 0, z: 0 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'socket', allowedConnections: ['wall'], direction: 'down' },
      ],
      gridSize: 2,
      rotationSteps: 4,
      stability: 0.3,
      maxLoad: 50,
      requiresSupport: true,
      cost: [{ itemId: 'wood', quantity: 10 }, { itemId: 'thatch', quantity: 15 }],
      craftTime: 5,
      hasVariations: false,
      isInteractable: false,
    });

    // Door
    this.registerPiece({
      id: 'door_wood',
      name: 'Porta de Madeira',
      description: 'Porta que pode ser aberta/fechada',
      category: 'door',
      modelPath: 'building/door_wood.glb',
      scale: 1,
      snapPoints: [
        { id: 'hinge', localPosition: { x: -0.5, y: 1, z: 0 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'socket', allowedConnections: ['wall'], direction: 'horizontal' },
      ],
      gridSize: 2,
      rotationSteps: 4,
      stability: 0.2,
      maxLoad: 0,
      requiresSupport: true,
      cost: [{ itemId: 'wood', quantity: 10 }, { itemId: 'iron_hinge', quantity: 2 }],
      craftTime: 5,
      hasVariations: false,
      isInteractable: true,
      interactionType: 'open',
    });

    // Crafting stations
    this.registerPiece({
      id: 'workbench',
      name: 'Bancada de Trabalho',
      description: 'Permite criar armas, ferramentas e equipamentos',
      category: 'crafting',
      modelPath: 'building/workbench.glb',
      scale: 1,
      snapPoints: [
        { id: 'bottom', localPosition: { x: 0, y: 0, z: 0 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'socket', allowedConnections: ['floor', 'foundation'], direction: 'down' },
      ],
      gridSize: 2,
      rotationSteps: 4,
      stability: 0.5,
      maxLoad: 100,
      requiresSupport: true,
      cost: [{ itemId: 'wood', quantity: 15 }, { itemId: 'stone', quantity: 5 }, { itemId: 'iron_bar', quantity: 3 }],
      craftingStation: 'workbench',
      craftTime: 10,
      hasVariations: false,
      isInteractable: true,
      interactionType: 'craft',
    });

    // Storage
    this.registerPiece({
      id: 'chest_wood',
      name: 'Baú de Madeira',
      description: 'Armazena itens com segurança',
      category: 'storage',
      modelPath: 'building/chest_wood.glb',
      scale: 1,
      snapPoints: [
        { id: 'bottom', localPosition: { x: 0, y: 0, z: 0 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'socket', allowedConnections: ['floor', 'foundation'], direction: 'down' },
      ],
      gridSize: 1,
      rotationSteps: 4,
      stability: 0.3,
      maxLoad: 0,
      requiresSupport: true,
      cost: [{ itemId: 'wood', quantity: 10 }, { itemId: 'iron_hinge', quantity: 1 }],
      craftTime: 5,
      hasVariations: false,
      isInteractable: true,
      interactionType: 'store',
    });

    // Stairs
    this.registerPiece({
      id: 'stair_wood',
      name: 'Escada de Madeira',
      description: 'Conecta andares diferentes',
      category: 'stair',
      modelPath: 'building/stair_wood.glb',
      scale: 1,
      snapPoints: [
        { id: 'bottom', localPosition: { x: 0, y: 0, z: 0 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'socket', allowedConnections: ['floor', 'foundation'], direction: 'down' },
        { id: 'top', localPosition: { x: 0, y: 2, z: 2 }, localRotation: { x: 0, y: 0, z: 0, w: 1 }, type: 'grid', allowedConnections: ['floor', 'stair'], direction: 'up' },
      ],
      gridSize: 2,
      rotationSteps: 4,
      stability: 0.5,
      maxLoad: 200,
      requiresSupport: true,
      cost: [{ itemId: 'wood', quantity: 12 }],
      craftTime: 5,
      hasVariations: false,
      isInteractable: false,
    });
  }

  private registerPiece(def: BuildingPieceDefinition): void {
    this.pieceDefinitions.set(def.id, def);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getPieceDefinition(id: string): BuildingPieceDefinition | undefined {
    return this.pieceDefinitions.get(id);
  }

  getAllDefinitions(): BuildingPieceDefinition[] {
    return Array.from(this.pieceDefinitions.values());
  }

  getDefinitionsByCategory(category: BuildingPieceDefinition['category']): BuildingPieceDefinition[] {
    return Array.from(this.pieceDefinitions.values()).filter(d => d.category === category);
  }

  setPlayerEntity(entityId: EntityId): void {
    this.playerEntity = entityId;
    this.playerComp = this.world.getComponent(entityId, PlayerComponent);
  }

  // ============================================================================
  // PREVIEW SYSTEM
  // ============================================================================

  startPreview(definitionId: string, variationId?: string): boolean {
    const def = this.pieceDefinitions.get(definitionId);
    if (!def) return false;

    // Check if player has resources
    if (!this.canAfford(def)) return false;

    this.currentPreview = {
      definitionId,
      variationId,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: def.scale, y: def.scale, z: def.scale },
      isValid: false,
      validationErrors: [],
      material: this.previewMaterialValid,
    };

    this.createPreviewMesh();
    this.updatePreview(0);
    return true;
  }

  cancelPreview(): void {
    this.currentPreview = null;
    this.removePreviewMesh();
  }

  private createPreviewMesh(): void {
    if (!this.currentPreview) return;

    const def = this.pieceDefinitions.get(this.currentPreview.definitionId)!;

    this.previewMesh = new THREE.Group();

    // In a real implementation, load the actual GLTF model
    // For now, create a placeholder box
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const mesh = new THREE.Mesh(geometry, this.previewMaterial);
    mesh.position.y = 1;
    this.previewMesh.add(mesh);

    // Add snap point indicators
    this.addSnapPointIndicators(def);

    this.scene.add(this.previewMesh);
  }

  private addSnapPointIndicators(def: BuildingPieceDefinition): void {
    if (!this.previewMesh) return;

    for (const snap of def.snapPoints) {
      const indicator = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        new THREE.MeshBasicMaterial({
          color: snap.type === 'grid' ? 0x4ade80 : 0x60a5fa,
          transparent: true,
          opacity: 0.8,
        })
      );
      indicator.position.set(snap.localPosition.x, snap.localPosition.y, snap.localPosition.z);
      indicator.userData = { snapPointId: snap.id };
      this.previewMesh!.add(indicator);
    }
  }

  private removePreviewMesh(): void {
    if (this.previewMesh) {
      this.previewMesh.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.scene.remove(this.previewMesh);
      this.previewMesh = null;
    }
  }

  // ============================================================================
  // PREVIEW UPDATE
  // ============================================================================

  updatePreview(dt: number): void {
    if (!this.currentPreview || !this.previewMesh || !this.playerEntity) return;

    const playerTransform = this.world.getComponent(this.playerEntity, TransformComponent);
    if (!playerTransform) return;

    // Cast ray from camera
    const ray = this.getBuildRay();
    const hit = this.raycastBuild(ray);

    if (hit) {
      this.currentPreview.position = this.snapToGrid(hit.point, hit.normal);
      this.currentPreview.rotation = this.calculateRotation(hit.normal);
    } else {
      // Place at max distance in front of player
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        new THREE.Quaternion(this.camera.quaternion.x, this.camera.quaternion.y, this.camera.quaternion.z, this.camera.quaternion.w)
      );
      const pos = new THREE.Vector3(
        playerTransform.position.x + forward.x * this.maxBuildDistance,
        playerTransform.position.y,
        playerTransform.position.z + forward.z * this.maxBuildDistance
      );
      this.currentPreview.position = this.snapToGrid({ x: pos.x, y: pos.y, z: pos.z }, { x: 0, y: 1, z: 0 });
    }

    // Validate placement
    this.validatePlacement();

    // Update preview mesh transform
    this.previewMesh.position.set(
      this.currentPreview.position.x,
      this.currentPreview.position.y,
      this.currentPreview.position.z
    );
    this.previewMesh.quaternion.set(
      this.currentPreview.rotation.x,
      this.currentPreview.rotation.y,
      this.currentPreview.rotation.z,
      this.currentPreview.rotation.w
    );
    this.previewMesh.scale.set(
      this.currentPreview.scale.x,
      this.currentPreview.scale.y,
      this.currentPreview.scale.z
    );

    // Update material based on validity
    const material = this.currentPreview.isValid ? this.previewMaterialValid : this.previewMaterialInvalid;
    this.previewMesh.traverse(obj => {
      if (obj instanceof THREE.Mesh && obj.material !== this.previewMaterialValid && obj.material !== this.previewMaterialInvalid) {
        obj.material = material;
      }
    });

    // Update snap point indicator colors
    this.previewMesh.traverse(obj => {
      if (obj instanceof THREE.Mesh && obj.userData.snapPointId) {
        const snapPoint = this.currentPreview?.definitionId ?
          this.pieceDefinitions.get(this.currentPreview.definitionId)?.snapPoints.find(s => s.id === obj.userData.snapPointId) : null;
        if (snapPoint) {
          obj.material.color.setHex(snapPoint.type === 'grid' ? 0x4ade80 : 0x60a5fa);
        }
      }
    });

    this.onPreviewUpdate?.(this.currentPreview);
  }

  private getBuildRay(): THREE.Ray {
    const ndc = new THREE.Vector2(0, 0); // Center of screen
    const ray = new THREE.Ray();
    ray.setFromCamera(ndc, this.camera);
    return ray;
  }

  private raycastBuild(ray: THREE.Ray): { point: Vec3; normal: Vec3; pieceId?: EntityId } | null {
    // Check against placed pieces first
    let closestHit: { point: Vec3; normal: Vec3; pieceId: EntityId } | null = null;
    let closestDist = Infinity;

    for (const [pieceId, piece] of this.placedPieces) {
      const pieceTransform = this.world.getComponent(pieceId, TransformComponent);
      if (!pieceTransform) continue;

      const pieceDef = this.pieceDefinitions.get(piece.definitionId);
      if (!pieceDef) continue;

      // Simple bounding box check
      const box = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(pieceTransform.position.x, pieceTransform.position.y, pieceTransform.position.z),
        new THREE.Vector3(2.5, 2.5, 2.5) // Approximate size
      );

      const intersection = ray.intersectBox(box, new THREE.Vector3());
      if (intersection) {
        const dist = ray.origin.distanceTo(intersection);
        if (dist < closestDist && dist <= this.maxBuildDistance) {
          closestDist = dist;
          // Calculate normal from hit face
          const normal = this.calculateHitNormal(ray, intersection, pieceTransform);
          closestHit = {
            point: { x: intersection.x, y: intersection.y, z: intersection.z },
            normal,
            pieceId: piece.entityId,
          };
        }
      }
    }

    // Also check terrain
    // In a real implementation, this would use the terrain system
    if (!closestHit) {
      const groundY = 0; // Terrain height at ray origin
      const t = (groundY - ray.origin.y) / ray.direction.y;
      if (t > 0 && t <= this.maxBuildDistance) {
        const point = ray.at(t, new THREE.Vector3());
        closestHit = {
          point: { x: point.x, y: point.y, z: point.z },
          normal: { x: 0, y: 1, z: 0 },
        };
      }
    }

    return closestHit;
  }

  private calculateHitNormal(ray: THREE.Ray, point: THREE.Vector3, pieceTransform: TransformComponent): Vec3 {
    // Simplified: return up for horizontal surfaces, outward for vertical
    const localPoint = new THREE.Vector3().copy(point).applyMatrix4(
      new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion(pieceTransform.rotation.x, pieceTransform.rotation.y, pieceTransform.rotation.z, pieceTransform.rotation.w)
      ).invert().setPosition(new THREE.Vector3(-pieceTransform.position.x, -pieceTransform.position.y, -pieceTransform.position.z))
    );

    const abs = { x: Math.abs(localPoint.x), y: Math.abs(localPoint.y), z: Math.abs(localPoint.z) };
    if (abs.y > abs.x && abs.y > abs.z) {
      return { x: 0, y: localPoint.y > 0 ? 1 : -1, z: 0 };
    } else if (abs.x > abs.z) {
      return { x: localPoint.x > 0 ? 1 : -1, y: 0, z: 0 };
    } else {
      return { x: 0, y: 0, z: localPoint.z > 0 ? 1 : -1 };
    }
  }

  // ============================================================================
  // SNAP & GRID
  // ============================================================================

  private snapToGrid(point: Vec3, normal: Vec3): Vec3 {
    const def = this.currentPreview ? this.pieceDefinitions.get(this.currentPreview.definitionId) : null;
    if (!def) return point;

    // Snap to grid
    const grid = def.gridSize;
    let snappedX = Math.round(point.x / grid) * grid;
    let snappedZ = Math.round(point.z / grid) * grid;
    let snappedY = Math.round(point.y / grid) * grid;

    // Adjust based on normal (which face we're attaching to)
    if (Math.abs(normal.y) > 0.9) {
      // Horizontal surface - snap Y to grid
      snappedY = Math.round(point.y / grid) * grid;
    } else {
      // Vertical surface - keep Y, snap X/Z
      snappedX = Math.round(point.x / grid) * grid;
      snappedZ = Math.round(point.z / grid) * grid;
    }

    return { x: snappedX, y: snappedY, z: snappedZ };
  }

  private calculateRotation(normal: Vec3): Quat {
    // Calculate rotation based on surface normal and player facing
    if (Math.abs(normal.y) > 0.9) {
      // Horizontal surface - align to player yaw
      const yaw = this.camera.rotation.y;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
      return { x: q.x, y: q.y, z: q.z, w: q.w };
    } else {
      // Vertical surface - align to face normal
      const yaw = Math.atan2(normal.x, normal.z);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + Math.PI, 0));
      return { x: q.x, y: q.y, z: q.z, w: q.w };
    }
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  private validatePlacement(): void {
    if (!this.currentPreview) return;

    const errors: string[] = [];
    const def = this.pieceDefinitions.get(this.currentPreview.definitionId)!;

    // Check distance
    if (this.playerEntity) {
      const playerTransform = this.world.getComponent(this.playerEntity, TransformComponent);
      if (playerTransform) {
        const dist = Math.sqrt(
          (this.currentPreview.position.x - playerTransform.position.x) ** 2 +
          (this.currentPreview.position.z - playerTransform.position.z) ** 2
        );
        if (dist > this.maxBuildDistance) {
          errors.push(`Muito longe (máx: ${this.maxBuildDistance}m)`);
        }
      }
    }

    // Check support
    if (def.requiresSupport) {
      if (!this.hasSupport(this.currentPreview.position)) {
        errors.push('Requer suporte no chão ou fundação');
      }
    }

    // Check collision with existing pieces
    if (this.checkCollision(this.currentPreview)) {
      errors.push('Colisão com outra construção');
    }

    // Check height limit
    if (this.currentPreview.position.y > BUILDING_CONFIG.buildHeightLimit) {
      errors.push(`Altura máxima excedida (${BUILDING_CONFIG.buildHeightLimit}m)`);
    }

    // Check resources
    if (!this.canAfford(def)) {
      errors.push('Recursos insuficientes');
    }

    this.currentPreview.isValid = errors.length === 0;
    this.currentPreview.validationErrors = errors;
    this.currentPreview.material = this.currentPreview.isValid ? this.previewMaterialValid : this.previewMaterialInvalid;

    this.onValidationError?.(errors);
  }

  private hasSupport(position: Vec3): boolean {
    // Check if there's a foundation or floor directly below
    const checkY = position.y - 0.1;

    for (const piece of this.placedPieces.values()) {
      const pieceTransform = this.world.getComponent(piece.entityId, TransformComponent);
      if (!pieceTransform) continue;

      const pieceDef = this.pieceDefinitions.get(piece.definitionId);
      if (!pieceDef) continue;

      if ((pieceDef.category === 'foundation' || pieceDef.category === 'floor') &&
          Math.abs(pieceTransform.position.x - position.x) < 1.1 &&
          Math.abs(pieceTransform.position.z - position.z) < 1.1 &&
          Math.abs(pieceTransform.position.y - checkY) < 0.5) {
        return true;
      }
    }

    // Check terrain
    return position.y <= 1; // On ground level
  }

  private checkCollision(preview: BuildPreview): boolean {
    const def = this.pieceDefinitions.get(preview.definitionId);
    if (!def) return false;

    const halfSize = 1.1; // Approximate

    for (const piece of this.placedPieces.values()) {
      const pieceTransform = this.world.getComponent(piece.entityId, TransformComponent);
      if (!pieceTransform) continue;

      const dx = Math.abs(preview.position.x - pieceTransform.position.x);
      const dy = Math.abs(preview.position.y - pieceTransform.position.y);
      const dz = Math.abs(preview.position.z - pieceTransform.position.z);

      if (dx < 2.2 && dy < 2.2 && dz < 2.2) {
        return true;
      }
    }

    return false;
  }

  private canAfford(def: BuildingPieceDefinition): boolean {
    if (!this.playerComp) return false;

    for (const cost of def.cost) {
      if (this.playerComp.inventory.getItemCount(cost.itemId) < cost.quantity) {
        return false;
      }
    }
    return true;
  }

  // ============================================================================
  // PLACEMENT
  // ============================================================================

  placePiece(): boolean {
    if (!this.currentPreview || !this.currentPreview.isValid) return false;
    if (!this.playerEntity || !this.playerComp) return false;

    const def = this.pieceDefinitions.get(this.currentPreview.definitionId)!;

    // Consume resources
    for (const cost of def.cost) {
      this.playerComp.inventory.removeItem(cost.itemId, cost.quantity);
    }

    // Create entity
    const entityId = this.world.createEntity();

    // Transform
    const transform = new TransformComponent(entityId);
    transform.setPosition(
      this.currentPreview.position.x,
      this.currentPreview.position.y,
      this.currentPreview.position.z
    );
    transform.setRotation(
      this.currentPreview.rotation.x,
      this.currentPreview.rotation.y,
      this.currentPreview.rotation.z,
      this.currentPreview.rotation.w
    );
    transform.setScale(
      this.currentPreview.scale.x,
      this.currentPreview.scale.y,
      this.currentPreview.scale.z
    );
    this.world.addComponent(entityId, transform);

    // Name & Tag
    const nameComp = new (require('@core/ECS.js').NameComponent)(entityId, def.name);
    const tagComp = new (require('@core/ECS.js').TagComponent)(entityId, 'building', 'structure', def.category);
    this.world.addComponent(entityId, nameComp);
    this.world.addComponent(entityId, tagComp);

    // Record piece
    const pieceId = `piece_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const placedPiece: PlacedBuildingPiece = {
      id: pieceId,
      entityId,
      definitionId: this.currentPreview.definitionId,
      variationId: this.currentPreview.variationId,
      position: { ...this.currentPreview.position },
      rotation: { ...this.currentPreview.rotation },
      scale: { ...this.currentPreview.scale },
      snapConnections: new Map(),
      stability: def.stability,
      durability: def.maxDurability ?? 1000,
      maxDurability: def.maxDurability ?? 1000,
      ownerId: this.playerEntity,
      placedTime: Date.now(),
      customData: {},
    };

    this.placedPieces.set(entityId, placedPiece);
    this.pieceEntities.set(pieceId, entityId);

    // Handle snap connections
    this.createSnapConnections(entityId, placedPiece);

    // Cleanup preview
    this.cancelPreview();

    // Callbacks
    this.onPiecePlaced?.(placedPiece);

    return true;
  }

  private createSnapConnections(newEntityId: EntityId, newPiece: PlacedBuildingPiece): void {
    const newDef = this.pieceDefinitions.get(newPiece.definitionId)!;

    // Check nearby pieces for snap connections
    for (const [otherEntityId, otherPiece] of this.placedPieces) {
      if (otherEntityId === newEntityId) continue;

      const otherTransform = this.world.getComponent(otherEntityId, TransformComponent);
      const newTransform = this.world.getComponent(newEntityId, TransformComponent);
      if (!otherTransform || !newTransform) continue;

      const otherDef = this.pieceDefinitions.get(otherPiece.definitionId);
      if (!otherDef) continue;

      // Check each snap point pair
      for (const mySnap of newDef.snapPoints) {
        for (const otherSnap of otherDef.snapPoints) {
          if (!this.canSnap(mySnap, otherSnap)) continue;

          const myWorldPos = this.getSnapWorldPosition(newTransform, mySnap);
          const otherWorldPos = this.getSnapWorldPosition(otherTransform, otherSnap);

          const dist = Math.sqrt(
            (myWorldPos.x - otherWorldPos.x) ** 2 +
            (myWorldPos.y - otherWorldPos.y) ** 2 +
            (myWorldPos.z - otherWorldPos.z) ** 2
          );

          if (dist < this.snapThreshold) {
            // Create connection
            newPiece.snapConnections.set(mySnap.id, otherPiece.id);
            otherPiece.snapConnections.set(otherSnap.id, newPiece.id);

            // Adjust position for perfect snap
            const offset = {
              x: otherWorldPos.x - myWorldPos.x,
              y: otherWorldPos.y - myWorldPos.y,
              z: otherWorldPos.z - myWorldPos.z,
            };

            newTransform.position.x += offset.x;
            newTransform.position.y += offset.y;
            newTransform.position.z += offset.z;

            newPiece.position = { ...newTransform.position };
          }
        }
      }
    }
  }

  private canSnap(snapA: SnapPoint, snapB: SnapPoint): boolean {
    // Check if types are compatible
    if (snapA.type === 'grid' && snapB.type !== 'grid') return false;
    if (snapA.type === 'socket' && snapB.type !== 'socket') return false;
    if (snapA.type === 'edge' && snapB.type !== 'edge') return false;

    // Check allowed connections
    if (!snapA.allowedConnections.includes(snapB.type)) return false;
    if (!snapB.allowedConnections.includes(snapA.type)) return false;

    // Check direction compatibility
    if (snapA.direction === 'up' && snapB.direction !== 'down') return false;
    if (snapA.direction === 'down' && snapB.direction !== 'up') return false;
    if (snapA.direction === 'horizontal' && snapB.direction !== 'horizontal') return false;

    return true;
  }

  private getSnapWorldPosition(transform: TransformComponent, snap: SnapPoint): Vec3 {
    const localPos = new THREE.Vector3(snap.localPosition.x, snap.localPosition.y, snap.localPosition.z);
    const localRot = new THREE.Quaternion(snap.localRotation.x, snap.localRotation.y, snap.localRotation.z, snap.localRotation.w);

    const worldPos = localPos.applyQuaternion(localRot);
    const rotated = worldPos.applyQuaternion(
      new THREE.Quaternion(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w)
    );

    return {
      x: rotated.x + transform.position.x,
      y: rotated.y + transform.position.y,
      z: rotated.z + transform.position.z,
    };
  }

  // ============================================================================
  // REMOVAL
  // ============================================================================

  removePiece(entityId: EntityId): boolean {
    const piece = this.placedPieces.get(entityId);
    if (!piece) return false;

    // Check stability of connected pieces
    this.checkStabilityAfterRemoval(entityId);

    // Remove snap connections
    for (const [snapId, connectedId] of piece.snapConnections) {
      const connectedPiece = this.placedPieces.get(connectedId);
      if (connectedPiece) {
        connectedPiece.snapConnections.delete(snapId);
      }
    }

    // Dispose entity
    this.world.destroyEntity(entityId);
    this.placedPieces.delete(entityId);
    this.pieceEntities.delete(piece.id);

    this.onPieceRemoved?.(entityId);
    return true;
  }

  private checkStabilityAfterRemoval(removedEntityId: EntityId): void {
    // In a full implementation, this would do a structural analysis
    // For now, just warn
    console.log('Stability check needed after removal');
  }

  // ============================================================================
  // INTERACTION
  // ============================================================================

  interactWithPiece(entityId: EntityId): boolean {
    const piece = this.placedPieces.get(entityId);
    if (!piece) return false;

    const def = this.pieceDefinitions.get(piece.definitionId);
    if (!def || !def.isInteractable) return false;

    switch (def.interactionType) {
      case 'open':
        this.toggleDoor(piece);
        break;
      case 'craft':
        this.openCraftingStation(piece);
        break;
      case 'store':
        this.openStorage(piece);
        break;
      case 'sleep':
        this.sleepInBed(piece);
        break;
      case 'light':
        this.toggleLight(piece);
        break;
    }

    return true;
  }

  private toggleDoor(piece: PlacedBuildingPiece): void {
    piece.customData.isOpen = !piece.customData.isOpen;
    // Animate door
    const transform = this.world.getComponent(piece.entityId, TransformComponent);
    if (transform) {
      const targetRot = piece.customData.isOpen ? Math.PI / 2 : 0;
      // Animation would go here
    }
  }

  private openCraftingStation(piece: PlacedBuildingPiece): void {
    window.dispatchEvent(new CustomEvent('open-crafting', {
      detail: { stationId: piece.entityId, stationType: piece.definitionId }
    }));
  }

  private openStorage(piece: PlacedBuildingPiece): void {
    window.dispatchEvent(new CustomEvent('open-storage', {
      detail: { storageId: piece.entityId, storageType: piece.definitionId }
    }));
  }

  private sleepInBed(piece: PlacedBuildingPiece): void {
    window.dispatchEvent(new CustomEvent('sleep', {
      detail: { bedId: piece.entityId }
    }));
  }

  private toggleLight(piece: PlacedBuildingPiece): void {
    piece.customData.isLit = !piece.customData.isLit;
    // Toggle light component
  }

  // ============================================================================
  // SELECTION
  // ============================================================================

  selectPiece(entityId: EntityId | null): void {
    this.selectedPieceId = entityId;
    this.onPieceSelected?.(entityId);
  }

  getSelectedPiece(): PlacedBuildingPiece | null {
    if (!this.selectedPieceId) return null;
    return this.placedPieces.get(this.selectedPieceId) || null;
  }

  getHoveredPiece(): PlacedBuildingPiece | null {
    if (!this.hoverPieceId) return null;
    return this.placedPieces.get(this.hoverPieceId) || null;
  }

  // ============================================================================
  // SAVE/LOAD
  // ============================================================================

  serialize(): any {
    const pieces: any[] = [];
    for (const piece of this.placedPieces.values()) {
      pieces.push({
        id: piece.id,
        entityId: piece.entityId,
        definitionId: piece.definitionId,
        variationId: piece.variationId,
        position: piece.position,
        rotation: piece.rotation,
        scale: piece.scale,
        snapConnections: Array.from(piece.snapConnections.entries()),
        stability: piece.stability,
        durability: piece.durability,
        maxDurability: piece.maxDurability,
        ownerId: piece.ownerId,
        placedTime: piece.placedTime,
        customData: piece.customData,
      });
    }
    return { pieces };
  }

  deserialize(data: any): void {
    // Clear existing
    for (const entityId of this.placedPieces.keys()) {
      this.world.destroyEntity(entityId);
    }
    this.placedPieces.clear();
    this.pieceEntities.clear();

    // Recreate pieces
    for (const pieceData of data.pieces) {
      const entityId = this.world.createEntity();

      const transform = new TransformComponent(entityId);
      transform.setPosition(pieceData.position.x, pieceData.position.y, pieceData.position.z);
      transform.setRotation(pieceData.rotation.x, pieceData.rotation.y, pieceData.rotation.z, pieceData.rotation.w);
      transform.setScale(pieceData.scale.x, pieceData.scale.y, pieceData.scale.z);
      this.world.addComponent(entityId, transform);

      const nameComp = new (require('@core/ECS.js').NameComponent)(entityId, this.pieceDefinitions.get(pieceData.definitionId)?.name || 'Building');
      const tagComp = new (require('@core/ECS.js').TagComponent)(entityId, 'building', 'structure');
      this.world.addComponent(entityId, nameComp);
      this.world.addComponent(entityId, tagComp);

      const placedPiece: PlacedBuildingPiece = {
        ...pieceData,
        entityId,
        snapConnections: new Map(pieceData.snapConnections),
      };

      this.placedPieces.set(entityId, placedPiece);
      this.pieceEntities.set(pieceData.id, entityId);
    }
  }

  // ============================================================================
  // UPDATE
  // ============================================================================

  update(dt: number): void {
    // Handle input for building mode
    if (this.playerComp?.buildMode) {
      this.handleBuildInput();
    }

    // Update preview
    if (this.currentPreview) {
      this.updatePreview(dt);
    }

    // Update hover
    this.updateHover();
  }

  private handleBuildInput(): void {
    // Rotate preview
    if (this.inputManager.isActionPressed(ActionName.CameraReset)) {
      if (this.currentPreview) {
        const def = this.pieceDefinitions.get(this.currentPreview.definitionId);
        if (def) {
          const steps = def.rotationSteps;
          const angleStep = (Math.PI * 2) / steps;
          const currentYaw = this.getYawFromQuat(this.currentPreview.rotation);
          const newYaw = currentYaw + angleStep;
          this.currentPreview.rotation = this.quatFromYaw(newYaw);
        }
      }
    }

    // Place
    if (this.inputManager.isActionPressed(ActionName.Interact) && this.currentPreview?.isValid) {
      this.placePiece();
    }

    // Cancel
    if (this.inputManager.isActionPressed(ActionName.Block)) {
      this.cancelPreview();
    }

    // Remove (when not previewing)
    if (this.inputManager.isActionPressed(ActionName.AttackSecondary) && !this.currentPreview && this.hoverPieceId) {
      this.removePiece(this.hoverPieceId);
    }
  }

  private updateHover(): void {
    if (this.currentPreview) {
      this.hoverPieceId = null;
      return;
    }

    const ray = this.getBuildRay();
    let closestHit: { pieceId: EntityId; dist: number } | null = null;

    for (const [entityId, piece] of this.placedPieces) {
      const transform = this.world.getComponent(entityId, TransformComponent);
      if (!transform) continue;

      const box = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z),
        new THREE.Vector3(2.5, 2.5, 2.5)
      );

      const intersection = ray.intersectBox(box, new THREE.Vector3());
      if (intersection) {
        const dist = ray.origin.distanceTo(intersection);
        if (dist <= this.maxBuildDistance && (!closestHit || dist < closestHit.dist)) {
          closestHit = { pieceId: entityId, dist };
        }
      }
    }

    this.hoverPieceId = closestHit?.pieceId || null;
  }

  private getYawFromQuat(q: Quat): number {
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
  }

  private quatFromYaw(yaw: number): Quat {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    return { x: q.x, y: q.y, z: q.z, w: q.w };
  }
}