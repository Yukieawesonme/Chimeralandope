// ChimeraLand - Building System
// Free-form construction with grid snapping, socket system, and territory management

import { EventBus, GameEvents, emitEvent, onEvent } from '../core/EventBus';
import { GameConfig, BuildingPieceType, BiomeType } from '../core/Config';
import { Vec3, Quat, Bounds } from '../core/MathUtils';
import { Engine } from '../core/Engine';

export interface BuildingPieceData {
    id: string;
    name: string;
    type: BuildingPieceType;
    category: 'structure' | 'utility' | 'decoration' | 'crafting';

    // Grid
    gridSize: Vec3; // in grid units (1 grid = 1m)
    sockets: SocketData[];

    // Requirements
    craftCost: CraftCost[];
    requiredLevel: number;
    requiredTech: string[];

    // Stats
    health: number;
    stability: number; // 0-1, affects connected pieces
    weight: number;

    // Visual
    model: string;
    materials: string[];
    previewColor: number;

    // Behavior
    canRotate: boolean;
    rotationSnap: number; // degrees
    canMirror: boolean;
    snapsToGround: boolean;
    snapsToCeiling: boolean;
    requiresFoundation: boolean;
}

export interface SocketData {
    id: string;
    localPosition: Vec3;
    localRotation: Quat;
    type: 'floor' | 'wall' | 'ceiling' | 'door' | 'window' | 'stair' | 'pillar' | 'any';
    direction: Vec3; // Outward normal
    gender: 'male' | 'female' | 'neutral';
    allowedTypes: BuildingPieceType[];
    maxConnections: number;
}

export interface CraftCost {
    itemId: string;
    quantity: number;
}

export interface BuildingPiece {
    id: string;
    data: BuildingPieceData;
    position: Vec3;
    rotation: Quat;
    gridPosition: Vec3; // Grid coordinates
    owner: any;
    territoryId: string;
    health: number;
    maxHealth: number;
    stability: number;
    connections: Map<string, string>; // socketId -> connectedPieceId
    placedTime: number;
    isPreview: boolean;
    isGhost: boolean;
}

export interface Territory {
    id: string;
    owner: any;
    center: Vec3;
    radius: number;
    bounds: Bounds;
    pieces: Set<string>;
    claimTime: number;
    lastActivity: number;
    decayTime: number;
    permissions: TerritoryPermissions;
    wards: Ward[];
}

export interface TerritoryPermissions {
    canBuild: Set<any>; // player IDs
    canAccess: Set<any>;
    canOpenContainers: Set<any>;
    isPublic: boolean;
}

export interface Ward {
    id: string;
    position: Vec3;
    radius: number;
    type: 'protection' | 'privacy' | 'decay_prevention';
    level: number;
    fuel: number;
    maxFuel: number;
    fuelConsumption: number; // per hour
}

export interface SnapResult {
    piece: BuildingPiece | null;
    socket: SocketData | null;
    worldPosition: Vec3;
    worldRotation: Quat;
    gridPosition: Vec3;
    isValid: boolean;
    blockedReason: string | null;
    stability: number;
    connectedSockets: { pieceSocket: string; targetSocket: string }[];
}

// Grid System
export class GridSystem {
    static gridSize: number = GameConfig.BUILDING.GRID_SIZE;

    static worldToGrid(worldPos: Vec3): Vec3 {
        return new Vec3(
            Math.round(worldPos.x / this.gridSize),
            Math.round(worldPos.y / this.gridSize),
            Math.round(worldPos.z / this.gridSize)
        );
    }

    static gridToWorld(gridPos: Vec3): Vec3 {
        return new Vec3(
            gridPos.x * this.gridSize,
            gridPos.y * this.gridSize,
            gridPos.z * this.gridSize
        );
    }

    static snapToGrid(worldPos: Vec3): Vec3 {
        return this.gridToWorld(this.worldToGrid(worldPos));
    }

    static getBounds(piece: BuildingPiece): Bounds {
        const halfSize = piece.data.gridSize.mulled(this.gridSize * 0.5);
        const min = piece.position.subbed(halfSize);
        const max = piece.position.added(halfSize);
        return new Bounds(min, max);
    }

    static checkOverlap(piece: BuildingPiece, otherPieces: BuildingPiece[]): boolean {
        const bounds = this.getBounds(piece);
        for (const other of otherPieces) {
            if (other.id === piece.id) continue;
            if (bounds.intersects(this.getBounds(other))) return true;
        }
        return false;
    }
}

// Socket System
export class SocketSystem {
    static findSnapTarget(
        previewPiece: BuildingPiece,
        existingPieces: BuildingPiece[],
        raycastHit: { position: Vec3; normal: Vec3; pieceId: string | null } | null
    ): SnapResult {
        const result: SnapResult = {
            piece: null,
            socket: null,
            worldPosition: new Vec3(),
            worldRotation: new Quat(),
            gridPosition: new Vec3(),
            isValid: false,
            blockedReason: null,
            stability: 0,
            connectedSockets: [],
        };

        // If hitting existing piece, try socket snap
        if (raycastHit && raycastHit.pieceId) {
            const targetPiece = existingPieces.find(p => p.id === raycastHit.pieceId);
            if (targetPiece) {
                return this.trySocketSnap(previewPiece, targetPiece, raycastHit);
            }
        }

        // Ground snap
        if (raycastHit && !raycastHit.pieceId) {
            return this.tryGroundSnap(previewPiece, raycastHit);
        }

        return result;
    }

    private static trySocketSnap(
        preview: BuildingPiece,
        target: BuildingPiece,
        hit: { position: Vec3; normal: Vec3 }
    ): SnapResult {
        const result: SnapResult = {
            piece: target,
            socket: null,
            worldPosition: new Vec3(),
            worldRotation: new Quat(),
            gridPosition: new Vec3(),
            isValid: false,
            blockedReason: null,
            stability: 0,
            connectedSockets: [],
        };

        // Find compatible sockets on target
        for (const targetSocket of target.data.sockets) {
            if (target.connections.has(targetSocket.id) && targetSocket.maxConnections <= target.connections.size) continue;

            // Check if preview has compatible socket
            for (const previewSocket of preview.data.sockets) {
                if (!this.areSocketsCompatible(previewSocket, targetSocket)) continue;

                // Calculate world position/rotation for preview
                const targetSocketWorld = this.getSocketWorldTransform(target, targetSocket);
                const previewSocketLocal = preview.data.sockets.find(s => s.id === previewSocket.id)!;
                const previewSocketWorld = this.getSocketLocalTransform(previewSocketLocal);

                // Preview should connect its socket to target's socket
                // previewSocketWorld * previewTransform = targetSocketWorld
                // previewTransform = targetSocketWorld * inverse(previewSocketWorld)

                const previewTransform = this.calculatePreviewTransform(
                    targetSocketWorld, previewSocketLocal
                );

                result.socket = targetSocket;
                result.worldPosition = previewTransform.position;
                result.worldRotation = previewTransform.rotation;
                result.gridPosition = GridSystem.worldToGrid(previewTransform.position);
                result.connectedSockets.push({ pieceSocket: previewSocket.id, targetSocket: targetSocket.id });

                // Validate
                const validation = this.validatePlacement(preview, result, existingPieces);
                result.isValid = validation.valid;
                result.blockedReason = validation.reason;
                result.stability = validation.stability;

                if (result.isValid) return result;
            }
        }

        return result;
    }

    private static tryGroundSnap(preview: BuildingPiece, hit: { position: Vec3; normal: Vec3 }): SnapResult {
        const result: SnapResult = {
            piece: null,
            socket: null,
            worldPosition: hit.position.copy(),
            worldRotation: new Quat(),
            gridPosition: new Vec3(),
            isValid: true,
            blockedReason: null,
            stability: 1,
            connectedSockets: [],
        };

        // Snap to grid
        result.worldPosition = GridSystem.snapToGrid(result.worldPosition);
        result.gridPosition = GridSystem.worldToGrid(result.worldPosition);

        // Align rotation to grid (y-axis only for ground pieces)
        if (preview.data.type !== BuildingPieceType.PILLAR) {
            const angles = [0, 90, 180, 270].map(d => d * Math.PI / 180);
            let bestAngle = 0;
            let bestDist = Infinity;
            for (const angle of angles) {
                const rot = Quat.fromEuler(angle, 0, 0);
                // Check which rotation aligns best with camera/player
                const dist = Math.abs(angle); // Simplified
                if (dist < bestDist) { bestDist = dist; bestAngle = angle; }
            }
            result.worldRotation = Quat.fromEuler(bestAngle, 0, 0);
        }

        // Validate ground placement
        if (preview.data.requiresFoundation) {
            // Check for foundation below
            const below = result.worldPosition.copy();
            below.y -= GridSystem.gridSize;
            // Would check for foundation piece at below position
        }

        const validation = this.validatePlacement(preview, result, []);
        result.isValid = validation.valid;
        result.blockedReason = validation.reason;
        result.stability = validation.stability;

        return result;
    }

    private static areSocketsCompatible(a: SocketData, b: SocketData): boolean {
        // Type compatibility
        if (a.type !== 'any' && b.type !== 'any' && a.type !== b.type) return false;

        // Gender compatibility
        if (a.gender !== 'neutral' && b.gender !== 'neutral' && a.gender === b.gender) return false;

        // Direction: sockets should face each other (normals opposite)
        const dot = a.direction.dot(b.direction);
        if (dot > -0.5) return false; // Not facing each other

        // Allowed types
        if (a.allowedTypes.length > 0 && !a.allowedTypes.includes(b.type)) return false;

        return true;
    }

    private static getSocketWorldTransform(piece: BuildingPiece, socket: SocketData): { position: Vec3; rotation: Quat } {
        const pos = piece.position.added(piece.rotation.rotateVec3(socket.localPosition.mulled(GridSystem.gridSize)));
        const rot = piece.rotation.mul(socket.localRotation);
        return { position: pos, rotation: rot };
    }

    private static getSocketLocalTransform(socket: SocketData): { position: Vec3; rotation: Quat } {
        return { position: socket.localPosition.mulled(GridSystem.gridSize), rotation: socket.localRotation };
    }

    private static calculatePreviewTransform(
        targetSocket: { position: Vec3; rotation: Quat },
        previewSocket: SocketData
    ): { position: Vec3; rotation: Quat } {
        // Preview socket should align with target socket (flipped 180)
        const previewSocketRot = previewSocket.localRotation;
        const targetSocketRot = targetSocket.rotation;

        // Calculate rotation difference
        const rotDiff = targetSocketRot.mul(previewSocketRot.inverse());
        // Flip 180 on Y
        const flip = Quat.fromEuler(Math.PI, 0, 0);
        const finalRot = rotDiff.mul(flip);

        // Position: target socket position minus preview socket offset rotated
        const offset = finalRot.rotateVec3(previewSocket.localPosition.mulled(GridSystem.gridSize).mul(-1));
        const finalPos = targetSocket.position.added(offset);

        return { position: finalPos, rotation: finalRot };
    }

    private static validatePlacement(
        preview: BuildingPiece,
        snap: SnapResult,
        existingPieces: BuildingPiece[]
    ): { valid: boolean; reason: string | null; stability: number } {
        // Check bounds
        const bounds = new Bounds(
            snap.worldPosition.subbed(preview.data.gridSize.mulled(GridSystem.gridSize * 0.5)),
            snap.worldPosition.added(preview.data.gridSize.mulled(GridSystem.gridSize * 0.5))
        );

        // Check overlap
        for (const piece of existingPieces) {
            if (piece.id === snap.piece?.id) continue;
            const otherBounds = GridSystem.getBounds(piece);
            if (bounds.intersects(otherBounds)) {
                return { valid: false, reason: 'Overlaps with existing structure', stability: 0 };
            }
        }

        // Check territory
        // Would check if position is within player's territory

        // Check stability
        let stability = 1;
        if (snap.piece) {
            stability = snap.piece.stability * 0.9; // Decreases with each connection
        }

        if (stability < GameConfig.BUILDING.MIN_STABILITY) {
            return { valid: false, reason: 'Insufficient structural stability', stability };
        }

        // Check height limit
        if (snap.worldPosition.y > GameConfig.BUILDING.MAX_HEIGHT) {
            return { valid: false, reason: 'Exceeds maximum build height', stability };
        }

        return { valid: true, reason: null, stability };
    }
}

// Building System Main
export class BuildingSystem {
    private static instance: BuildingSystem;
    pieces: Map<string, BuildingPiece> = new Map();
    territories: Map<string, Territory> = new Map();
    pieceConfigs: Map<string, BuildingPieceData> = new Map();

    // Build mode state
    isBuildMode: boolean = false;
    previewPiece: BuildingPiece | null = null;
    selectedPieceId: string | null = null;
    currentTerritory: Territory | null = null;
    rotation: number = 0;
    mirror: boolean = false;

    static getInstance(): BuildingSystem {
        if (!BuildingSystem.instance) BuildingSystem.instance = new BuildingSystem();
        return BuildingSystem.instance;
    }

    registerPieceConfig(data: BuildingPieceData): void {
        this.pieceConfigs.set(data.id, data);
    }

    getPieceConfig(id: string): BuildingPieceData | null {
        return this.pieceConfigs.get(id) || null;
    }

    enterBuildMode(player: any): void {
        this.isBuildMode = true;
        this.currentTerritory = this.getTerritoryAt(player.transform.position);
        emitEvent(GameEvents.BUILD_MODE_ENTERED, { player });
    }

    exitBuildMode(): void {
        this.isBuildMode = false;
        this.previewPiece = null;
        this.selectedPieceId = null;
        emitEvent(GameEvents.BUILD_MODE_EXITED, {});
    }

    setPreviewPiece(pieceId: string): void {
        const config = this.pieceConfigs.get(pieceId);
        if (!config) return;

        this.previewPiece = this.createGhostPiece(config);
        this.selectedPieceId = pieceId;
        this.rotation = 0;
        this.mirror = false;
    }

    private createGhostPiece(config: BuildingPieceData): BuildingPiece {
        return {
            id: `preview_${Date.now()}`,
            data: config,
            position: new Vec3(),
            rotation: new Quat(),
            gridPosition: new Vec3(),
            owner: null,
            territoryId: '',
            health: config.health,
            maxHealth: config.health,
            stability: 1,
            connections: new Map(),
            placedTime: 0,
            isPreview: true,
            isGhost: true,
        };
    }

    updatePreview(raycastHit: { position: Vec3; normal: Vec3; pieceId: string | null } | null): SnapResult | null {
        if (!this.previewPiece || !raycastHit) return null;

        const existingPieces = Array.from(this.pieces.values()).filter(p => !p.isGhost);
        const snap = SocketSystem.findSnapTarget(this.previewPiece, existingPieces, raycastHit);

        if (snap.isValid || snap.blockedReason) {
            this.previewPiece.position = snap.worldPosition;
            this.previewPiece.rotation = snap.worldRotation;
            this.previewPiece.gridPosition = snap.gridPosition;
        }

        return snap;
    }

    rotatePreview(delta: number): void {
        if (!this.previewPiece) return;
        this.rotation += delta;
        const snapAngle = GameConfig.BUILDING.ROTATION_SNAP;
        this.rotation = Math.round(this.rotation / snapAngle) * snapAngle;
        this.previewPiece.rotation = Quat.fromEuler(0, this.rotation, 0);
    }

    toggleMirror(): void {
        if (!this.previewPiece) return;
        this.mirror = !this.mirror;
        // Flip preview on X axis
        this.previewPiece.rotation = this.previewPiece.rotation.mul(Quat.fromEuler(0, Math.PI, 0));
    }

    confirmPlacement(player: any): boolean {
        if (!this.previewPiece || !this.currentTerritory) return false;

        // Check resources
        if (!this.canAfford(player, this.previewPiece.data.craftCost)) return false;

        // Consume resources
        this.consumeResources(player, this.previewPiece.data.craftCost);

        // Create real piece
        const piece: BuildingPiece = {
            ...this.previewPiece,
            id: `piece_${Date.now()}`,
            owner: player,
            territoryId: this.currentTerritory.id,
            isPreview: false,
            isGhost: false,
            placedTime: Date.now() / 1000,
            health: this.previewPiece.data.health,
            maxHealth: this.previewPiece.data.health,
            stability: this.previewPiece.stability,
        };

        this.pieces.set(piece.id, piece);
        this.currentTerritory.pieces.add(piece.id);
        this.currentTerritory.lastActivity = Date.now() / 1000;

        // Update connections
        this.updateConnections(piece);

        emitEvent(GameEvents.PIECE_PLACED, { piece, player });

        // Keep preview for multi-place
        this.previewPiece.position = new Vec3();

        return true;
    }

    removePiece(pieceId: string, player: any): boolean {
        const piece = this.pieces.get(pieceId);
        if (!piece) return false;

        // Check ownership/permissions
        if (piece.owner !== player && !this.hasPermission(player, piece.territoryId, 'canBuild')) return false;

        // Check stability of connected pieces
        if (!this.canSafelyRemove(piece)) return false;

        // Remove connections
        this.removeConnections(piece);

        // Refund resources (partial)
        this.refundResources(player, piece.data.craftCost, 0.5);

        // Remove piece
        this.pieces.delete(pieceId);
        const territory = this.territories.get(piece.territoryId);
        if (territory) territory.pieces.delete(pieceId);

        emitEvent(GameEvents.PIECE_REMOVED, { piece, player });

        return true;
    }

    private updateConnections(piece: BuildingPiece): void {
        // Find nearby pieces and connect sockets
        for (const other of this.pieces.values()) {
            if (other.id === piece.id || other.territoryId !== piece.territoryId) continue;

            for (const socketA of piece.data.sockets) {
                for (const socketB of other.data.sockets) {
                    if (!SocketSystem.areSocketsCompatible(socketA, socketB)) continue;

                    const worldA = SocketSystem.getSocketWorldTransform(piece, socketA);
                    const worldB = SocketSystem.getSocketWorldTransform(other, socketB);

                    if (worldA.position.distanceTo(worldB.position) < GameConfig.BUILDING.SNAP_DISTANCE) {
                        piece.connections.set(socketA.id, other.id);
                        other.connections.set(socketB.id, piece.id);
                    }
                }
            }
        }
    }

    private removeConnections(piece: BuildingPiece): void {
        for (const [socketId, connectedId] of piece.connections) {
            const other = this.pieces.get(connectedId);
            if (other) {
                for (const [otherSocketId, otherConnectedId] of other.connections) {
                    if (otherConnectedId === piece.id) {
                        other.connections.delete(otherSocketId);
                    }
                }
            }
        }
        piece.connections.clear();
    }

    private canSafelyRemove(piece: BuildingPiece): boolean {
        // Check if removing would cause collapse
        for (const connectedId of piece.connections.values()) {
            const other = this.pieces.get(connectedId);
            if (other && other.connections.size <= 1 && other.data.requiresFoundation) {
                return false; // Would cause collapse
            }
        }
        return true;
    }

    private canAfford(player: any, costs: CraftCost[]): boolean {
        for (const cost of costs) {
            if (!player.inventory.hasItem(cost.itemId, cost.quantity)) return false;
        }
        return true;
    }

    private consumeResources(player: any, costs: CraftCost[]): void {
        for (const cost of costs) {
            player.inventory.removeItem(cost.itemId, cost.quantity);
        }
    }

    private refundResources(player: any, costs: CraftCost[], rate: number): void {
        for (const cost of costs) {
            const qty = Math.floor(cost.quantity * rate);
            if (qty > 0) player.inventory.addItem(cost.itemId, qty);
        }
    }

    private hasPermission(player: any, territoryId: string, permission: keyof TerritoryPermissions): boolean {
        const territory = this.territories.get(territoryId);
        if (!territory) return false;
        return territory.permissions[permission].has(player) || territory.permissions.isPublic;
    }

    // Territory Management
    claimTerritory(player: any, center: Vec3): Territory | null {
        // Check if already claimed
        for (const territory of this.territories.values()) {
            if (territory.bounds.contains(center)) return null;
        }

        const territory: Territory = {
            id: `territory_${Date.now()}`,
            owner: player,
            center,
            radius: GameConfig.BUILDING.CLAIM_RADIUS,
            bounds: new Bounds(
                new Vec3(center.x - GameConfig.BUILDING.CLAIM_RADIUS, 0, center.z - GameConfig.BUILDING.CLAIM_RADIUS),
                new Vec3(center.x + GameConfig.BUILDING.CLAIM_RADIUS, GameConfig.BUILDING.MAX_HEIGHT, center.z + GameConfig.BUILDING.CLAIM_RADIUS)
            ),
            pieces: new Set(),
            claimTime: Date.now() / 1000,
            lastActivity: Date.now() / 1000,
            decayTime: GameConfig.BUILDING.DECAY_TIME,
            permissions: {
                canBuild: new Set([player]),
                canAccess: new Set([player]),
                canOpenContainers: new Set([player]),
                isPublic: false,
            },
            wards: [],
        };

        this.territories.set(territory.id, territory);
        emitEvent(GameEvents.TERRITORY_CLAIMED, { territory, player });

        return territory;
    }

    getTerritoryAt(position: Vec3): Territory | null {
        for (const territory of this.territories.values()) {
            if (territory.bounds.contains(position)) return territory;
        }
        return null;
    }

    updateTerritories(dt: number): void {
        const now = Date.now() / 1000;
        for (const [id, territory] of this.territories) {
            // Decay
            if (now - territory.lastActivity > territory.decayTime) {
                this.startDecay(territory);
            }

            // Ward fuel consumption
            for (const ward of territory.wards) {
                ward.fuel = Math.max(0, ward.fuel - ward.fuelConsumption * dt / 3600);
                if (ward.fuel <= 0) {
                    this.removeWard(territory, ward.id);
                }
            }
        }
    }

    private startDecay(territory: Territory): void {
        // Damage pieces over time
        for (const pieceId of territory.pieces) {
            const piece = this.pieces.get(pieceId);
            if (piece) {
                piece.health = Math.max(0, piece.health - 10 * (1 / 60));
                if (piece.health <= 0) {
                    this.removePiece(pieceId, territory.owner);
                }
            }
        }
    }

    addWard(territoryId: string, ward: Ward): boolean {
        const territory = this.territories.get(territoryId);
        if (!territory) return false;

        territory.wards.push(ward);
        return true;
    }

    removeWard(territory: Territory, wardId: string): void {
        const idx = territory.wards.findIndex(w => w.id === wardId);
        if (idx >= 0) territory.wards.splice(idx, 1);
    }

    // Get pieces in radius for UI
    getPiecesInRadius(center: Vec3, radius: number): BuildingPiece[] {
        const results: BuildingPiece[] = [];
        for (const piece of this.pieces.values()) {
            if (piece.position.distanceTo(center) <= radius) {
                results.push(piece);
            }
        }
        return results;
    }

    // Serialization
    toJSON(): any {
        return {
            pieces: Array.from(this.pieces.values()).map(p => ({
                id: p.id,
                dataId: p.data.id,
                position: p.position,
                rotation: p.rotation,
                territoryId: p.territoryId,
                health: p.health,
                connections: Array.from(p.connections.entries()),
            })),
            territories: Array.from(this.territories.values()).map(t => ({
                id: t.id,
                ownerId: t.owner?.id,
                center: t.center,
                radius: t.radius,
                pieces: Array.from(t.pieces),
                claimTime: t.claimTime,
                lastActivity: t.lastActivity,
                permissions: {
                    canBuild: Array.from(t.permissions.canBuild),
                    canAccess: Array.from(t.permissions.canAccess),
                    canOpenContainers: Array.from(t.permissions.canOpenContainers),
                    isPublic: t.permissions.isPublic,
                },
                wards: t.wards,
            })),
        };
    }
}