/**
 * Terrain System - Chunked procedural terrain with heightmap
 * Supports LOD, biome blending, and triplanar materials
 */

import * as THREE from 'three';
import { World, BaseSystem } from '@core/ECS.js';
import { Vec3 } from '@core/Types.js';
import { WORLD_CONFIG, BIOME_CONFIGS, BiomeType } from '@core/Config.js';
import { Noise } from './Noise.js';

// ============================================================================
// TERRAIN CHUNK
// ============================================================================

interface TerrainChunk {
  key: string;
  x: number;
  z: number;
  mesh: THREE.Mesh | null;
  geometry: THREE.BufferGeometry | null;
  heightData: Float32Array | null;
  biomeWeights: Map<BiomeType, number>;
  isLoaded: boolean;
  lodLevel: number;
}

interface ChunkCoord {
  x: number;
  z: number;
  key: string;
}

// ============================================================================
// TERRAIN SYSTEM
// ============================================================================

export class TerrainSystem extends BaseSystem {
  readonly priority = 10;

  private chunks = new Map<string, TerrainChunk>();
  private chunkMeshes = new Map<string, THREE.Mesh>();
  private material!: THREE.MeshStandardMaterial;
  private wireframeMaterial!: THREE.MeshBasicMaterial;

  private playerPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private renderDistance: number = WORLD_CONFIG.renderDistanceChunks * WORLD_CONFIG.chunkSize;
  private chunkSize: number = WORLD_CONFIG.chunkSize;
  private chunkResolution: number = 64; // vertices per chunk edge
  private maxLOD: number = 3;

  // Noise generators per biome
  private biomeNoises: Map<BiomeType, Noise> = new Map();

  // Heightmap texture for GPU displacement (future)
  private heightmapTexture: THREE.DataTexture | null = null;

  constructor(world: World) {
    super();
    this.setWorld(world);
    this.initializeMaterials();
    this.initializeBiomeNoises();
  }

  private initializeMaterials(): void {
    // Base terrain material with triplanar mapping support
    this.material = new THREE.MeshStandardMaterial({
      color: 0x3a5a3a,
      roughness: 0.9,
      metalness: 0.0,
      flatShading: false,
      vertexColors: true,
    });

    // Wireframe for debug
    this.wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });
  }

  private initializeBiomeNoises(): void {
    for (const [biomeType, config] of Object.entries(BIOME_CONFIGS)) {
      this.biomeNoises.set(biomeType as BiomeType, new Noise({
        scale: config.noiseScale,
        octaves: WORLD_CONFIG.terrainOctaves,
        persistence: WORLD_CONFIG.terrainPersistence,
        lacunarity: WORLD_CONFIG.terrainLacunarity,
        seed: this.hashString(biomeType),
      }));
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  // ---- Chunk Management ----

  getChunkKey(x: number, z: number): string {
    const chunkX = Math.floor(x / this.chunkSize);
    const chunkZ = Math.floor(z / this.chunkSize);
    return `${chunkX},${chunkZ}`;
  }

  getChunkCoord(key: string): ChunkCoord {
    const parts = key.split(',');
    const x = Number(parts[0]) || 0;
    const z = Number(parts[1]) || 0;
    return { x, z, key };
  }

  getChunkWorldBounds(chunk: TerrainChunk): { min: Vec3; max: Vec3 } {
    const worldX = chunk.x * this.chunkSize;
    const worldZ = chunk.z * this.chunkSize;
    return {
      min: { x: worldX, y: 0, z: worldZ },
      max: { x: worldX + this.chunkSize, y: WORLD_CONFIG.terrainHeightScale, z: worldZ + this.chunkSize },
    };
  }

  // ---- Height Generation ----

  getHeightAt(x: number, z: number): number {
    // Determine biome at this position
    const biomeWeights = this.getBiomeWeights(x, z);
    let height = 0;
    let totalWeight = 0;

    for (const [biomeType, weight] of biomeWeights) {
      if (weight <= 0) continue;
      const noise = this.biomeNoises.get(biomeType);
      const config = BIOME_CONFIGS[biomeType];
      if (!noise || !config) continue;
      const biomeHeight = noise.getFBM(x, z) * config.heightVariation + config.baseHeight;
      height += biomeHeight * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? height / totalWeight : WORLD_CONFIG.terrainBaseHeight;
  }

  getBiomeWeights(x: number, z: number): Map<BiomeType, number> {
    const weights = new Map<BiomeType, number>();

    // Simple distance-based biome blending
    // In a full implementation, this would use a biome map
    const distFromOrigin = Math.sqrt(x * x + z * z);

    if (distFromOrigin < 500) {
      weights.set(BiomeType.SpiritPlains, 1.0);
    } else if (distFromOrigin < 1500) {
      weights.set(BiomeType.FloatingMountains, 1.0);
    } else if (distFromOrigin < 3000) {
      weights.set(BiomeType.AshDesert, 1.0);
    } else {
      weights.set(BiomeType.ToxicSwamp, 1.0);
    }

    return weights;
  }

  getDominantBiome(x: number, z: number): BiomeType {
    const weights = this.getBiomeWeights(x, z);
    let maxWeight = 0;
    let dominant = BiomeType.SpiritPlains;

    for (const [biome, weight] of weights) {
      if (weight > maxWeight) {
        maxWeight = weight;
        dominant = biome;
      }
    }

    return dominant;
  }

  // ---- Chunk Generation ----

  generateChunk(chunk: TerrainChunk): void {
    const resolution = this.chunkResolution >> chunk.lodLevel;
    const vertexCount = (resolution + 1) * (resolution + 1);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const colors = new Float32Array(vertexCount * 3);
    const indices: number[] = [];

    const worldX = chunk.x * this.chunkSize;
    const worldZ = chunk.z * this.chunkSize;

    // Generate height data
    const heightData = new Float32Array((resolution + 1) * (resolution + 1));
    let heightIndex = 0;

    for (let gz = 0; gz <= resolution; gz++) {
      for (let gx = 0; gx <= resolution; gx++) {
        const x = worldX + (gx / resolution) * this.chunkSize;
        const z = worldZ + (gz / resolution) * this.chunkSize;
        const y = this.getHeightAt(x, z);

        heightData[heightIndex++] = y;

        // Position
        const vi = (gz * (resolution + 1) + gx) * 3;
        positions[vi] = x - worldX - this.chunkSize / 2; // Center chunk at origin
        positions[vi + 1] = y;
        positions[vi + 2] = z - worldZ - this.chunkSize / 2;

        // UV
        uvs[(gz * (resolution + 1) + gx) * 2] = gx / resolution;
        uvs[(gz * (resolution + 1) + gx) * 2 + 1] = gz / resolution;

        // Color based on biome
        const biome = this.getDominantBiome(x, z);
        const config = BIOME_CONFIGS[biome];
        if (!config) continue;
        const color = new THREE.Color(config.skyTint.r, config.skyTint.g, config.skyTint.b);
        colors[(gz * (resolution + 1) + gx) * 3] = color.r;
        colors[(gz * (resolution + 1) + gx) * 3 + 1] = color.g;
        colors[(gz * (resolution + 1) + gx) * 3 + 2] = color.b;
      }
    }

    // Generate indices (triangles)
    for (let gz = 0; gz < resolution; gz++) {
      for (let gx = 0; gx < resolution; gx++) {
        const a = gz * (resolution + 1) + gx;
        const b = gz * (resolution + 1) + gx + 1;
        const c = (gz + 1) * (resolution + 1) + gx;
        const d = (gz + 1) * (resolution + 1) + gx + 1;

        indices.push(a, b, d);
        indices.push(d, c, a);
      }
    }

    // Compute normals
    for (let gz = 0; gz <= resolution; gz++) {
      for (let gx = 0; gx <= resolution; gx++) {
        const idx = (gz * (resolution + 1) + gx) * 3;

        // Sample neighbors for normal
        const baseIdx = gz * (resolution + 1) + gx;
        const hL = gx > 0 ? heightData[baseIdx - 1]! : heightData[baseIdx]!;
        const hR = gx < resolution ? heightData[baseIdx + 1]! : heightData[baseIdx]!;
        const hD = gz > 0 ? heightData[baseIdx - (resolution + 1)]! : heightData[baseIdx]!;
        const hU = gz < resolution ? heightData[baseIdx + (resolution + 1)]! : heightData[baseIdx]!;

        const scale = this.chunkSize / resolution;
        const normal = new THREE.Vector3(
          (hL - hR) / (2 * scale),
          1,
          (hD - hU) / (2 * scale)
        ).normalize();

        normals[idx] = normal.x;
        normals[idx + 1] = normal.y;
        normals[idx + 2] = normal.z;
      }
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    chunk.geometry = geometry;
    chunk.heightData = heightData;
    chunk.isLoaded = true;

    // Create mesh
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(worldX + this.chunkSize / 2, 0, worldZ + this.chunkSize / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.userData.chunkKey = chunk.key;

    chunk.mesh = mesh;
    this.chunkMeshes.set(chunk.key, mesh);
  }

  // ---- LOD ----

  getLODForDistance(distance: number): number {
    const chunkSize = this.chunkSize;
    if (distance < chunkSize * 2) return 0;
    if (distance < chunkSize * 6) return 1;
    if (distance < chunkSize * 14) return 2;
    return 3;
  }

  updateChunkLOD(chunk: TerrainChunk, playerPos: Vec3): void {
    const chunkCenterX = chunk.x * this.chunkSize + this.chunkSize / 2;
    const chunkCenterZ = chunk.z * this.chunkSize + this.chunkSize / 2;
    const distance = Math.sqrt(
      (playerPos.x - chunkCenterX) ** 2 +
      (playerPos.z - chunkCenterZ) ** 2
    );

    const targetLOD = this.getLODForDistance(distance);
    if (targetLOD !== chunk.lodLevel) {
      chunk.lodLevel = targetLOD;
      this.regenerateChunk(chunk);
    }
  }

  regenerateChunk(chunk: TerrainChunk): void {
    if (chunk.mesh) {
      chunk.mesh.geometry.dispose();
      this.chunkMeshes.delete(chunk.key);
    }
    this.generateChunk(chunk);
    // Re-add to scene (handled by render system)
  }

  // ---- Public API ----

  updatePlayerPosition(position: Vec3): void {
    this.playerPosition = position;
  }

  getChunk(key: string): TerrainChunk | undefined {
    return this.chunks.get(key);
  }

  getOrCreateChunk(x: number, z: number): TerrainChunk {
    const key = this.getChunkKey(x, z);
    let chunk = this.chunks.get(key);

    if (!chunk) {
      const chunkCoord = this.getChunkCoord(key);
      chunk = {
        key,
        x: chunkCoord.x,
        z: chunkCoord.z,
        mesh: null,
        geometry: null,
        heightData: null,
        biomeWeights: new Map(),
        isLoaded: false,
        lodLevel: 0,
      };
      this.chunks.set(key, chunk);
    }

    return chunk;
  }

  getLoadedChunks(): TerrainChunk[] {
    return Array.from(this.chunks.values()).filter(c => c.isLoaded);
  }

  getChunkMesh(key: string): THREE.Mesh | undefined {
    return this.chunkMeshes.get(key);
  }

  getAllMeshes(): THREE.Mesh[] {
    return Array.from(this.chunkMeshes.values());
  }

  getHeightAtWorld(x: number, z: number): number {
    return this.getHeightAt(x, z);
  }

  // Raycast against terrain
  raycast(ray: THREE.Ray, maxDistance: number = 1000): THREE.Vector3 | null {
    // Check chunks in range
    const chunksToCheck = this.getChunksInRadius(ray.origin.x, ray.origin.z, maxDistance);

    let closestHit: THREE.Vector3 | null = null;
    let closestDist = Infinity;

    for (const chunk of chunksToCheck) {
      if (!chunk.mesh || !chunk.geometry) continue;

      const matrix = new THREE.Matrix4().copy(chunk.mesh.matrixWorld).invert();
      const localRay = ray.clone().applyMatrix4(matrix);

      const box = chunk.geometry.boundingBox;
      if (!box) continue;

      const intersectionPoint = localRay.intersectBox(box, new THREE.Vector3());
      if (intersectionPoint) {
        const worldPoint = intersectionPoint.applyMatrix4(chunk.mesh.matrixWorld);
        const dist = ray.origin.distanceTo(worldPoint);
        if (dist < closestDist) {
          closestDist = dist;
          closestHit = worldPoint;
        }
      }
    }

    return closestHit;
  }

  private getChunksInRadius(x: number, z: number, radius: number): TerrainChunk[] {
    const chunkRadius = Math.ceil(radius / this.chunkSize);
    const centerX = Math.floor(x / this.chunkSize);
    const centerZ = Math.floor(z / this.chunkSize);

    const chunks: TerrainChunk[] = [];

    for (let cz = -chunkRadius; cz <= chunkRadius; cz++) {
      for (let cx = -chunkRadius; cx <= chunkRadius; cx++) {
        const key = `${centerX + cx},${centerZ + cz}`;
        const chunk = this.chunks.get(key);
        if (chunk && chunk.isLoaded) {
          chunks.push(chunk);
        }
      }
    }

    return chunks;
  }

  // ---- ECS System Update ----

  update(dt: number): void {
    // Update LODs based on player position
    for (const chunk of this.chunks.values()) {
      if (chunk.isLoaded) {
        this.updateChunkLOD(chunk, this.playerPosition);
      }
    }
  }

  // ---- Debug ----

  toggleWireframe(enabled: boolean): void {
    for (const mesh of this.chunkMeshes.values()) {
      mesh.material = enabled ? this.wireframeMaterial : this.material;
    }
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) {
      if (chunk.geometry) chunk.geometry.dispose();
      if (chunk.mesh) {
        const mats = Array.isArray(chunk.mesh.material) ? chunk.mesh.material : [chunk.mesh.material];
        mats.forEach(m => m.dispose());
      }
    }
    this.chunks.clear();
    this.chunkMeshes.clear();
    this.material.dispose();
    this.wireframeMaterial.dispose();
  }
}