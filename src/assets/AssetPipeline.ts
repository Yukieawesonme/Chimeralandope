/**
 * Asset Adaptation Pipeline - Automated import, normalization, and integration of public library assets
 * Handles download, scale/axis correction, LOD generation, material adaptation, and socket rigging
 */

import * as THREE from 'three';
import { AssetLoader, LoadedGLTF } from '@engine/AssetLoader.js';
import { AssetManifestEntry, AssetRole, PBRMaterialData } from '@core/Types.js';

export interface PipelineStage {
  name: string;
  process: (entry: AssetManifestEntry, asset: LoadedGLTF) => Promise<LoadedGLTF>;
}

export interface PipelineResult {
  entry: AssetManifestEntry;
  success: boolean;
  asset?: LoadedGLTF;
  error?: string;
  warnings: string[];
}

export class AssetAdaptationPipeline {
  private assetLoader: AssetLoader;
  private manifest: AssetManifestEntry[] = [];
  private stages: PipelineStage[] = [];
  private results: Map<string, PipelineResult> = new Map();

  constructor(assetLoader: AssetLoader) {
    this.assetLoader = assetLoader;
    this.initializeStages();
  }

  private initializeStages(): void {
    this.stages = [
      { name: 'Load & Validate', process: this.stageLoadAndValidate.bind(this) },
      { name: 'Normalize Scale', process: this.stageNormalizeScale.bind(this) },
      { name: 'Fix Up Axis', process: this.stageFixUpAxis.bind(this) },
      { name: 'Center Geometry', process: this.stageCenterGeometry.bind(this) },
      { name: 'Setup PBR Materials', process: this.stageSetupPBRMaterials.bind(this) },
      { name: 'Apply Material Mapping', process: this.stageApplyMaterialMapping.bind(this) },
      { name: 'Generate LODs', process: this.stageGenerateLODs.bind(this) },
      { name: 'Generate Colliders', process: this.stageGenerateColliders.bind(this) },
      { name: 'Setup Animation Clips', process: this.stageSetupAnimations.bind(this) },
      { name: 'Setup Socket Rigging', process: this.stageSetupSocketRigging.bind(this) },
      { name: 'Optimize for Runtime', process: this.stageOptimizeForRuntime.bind(this) },
    ];
  }

  async loadManifest(manifestPath: string): Promise<void> {
    const response = await fetch(manifestPath);
    const data = await response.json();
    this.manifest = data.assets || [];
    console.log(`[AssetPipeline] Loaded manifest with ${this.manifest.length} assets`);
  }

  async processAll(onProgress?: (progress: { stage: string; entry: string; completed: number; total: number }) => void): Promise<Map<string, PipelineResult>> {
    this.results.clear();

    for (let i = 0; i < this.manifest.length; i++) {
      const entry = this.manifest[i]!;
      const result = await this.processEntry(entry);
      this.results.set(entry.id, result);

      onProgress?.({
        stage: 'Complete',
        entry: entry.id,
        completed: i + 1,
        total: this.manifest.length,
      });
    }

    return this.results;
  }

  async processEntry(entry: AssetManifestEntry): Promise<PipelineResult> {
    const result: PipelineResult = {
      entry,
      success: false,
      warnings: [],
    };

    try {
      // Load the asset
      let asset = await this.assetLoader.loadGLTFFromManifest(entry, {
        normalizeScale: false,
        centerGeometry: false,
      });

      // Run through all pipeline stages
      for (const stage of this.stages) {
        try {
          asset = await stage.process(entry, asset);
        } catch (stageError) {
          const msg = `${stage.name} failed: ${stageError}`;
          console.warn(`[AssetPipeline] ${entry.id}: ${msg}`);
          result.warnings.push(msg);
        }
      }

      result.success = true;
      result.asset = asset;
      console.log(`[AssetPipeline] ✓ Processed: ${entry.id}`);
    } catch (error) {
      result.error = String(error);
      console.error(`[AssetPipeline] ✗ Failed: ${entry.id} - ${error}`);
    }

    return result;
  }

  // ============================================================================
  // PIPELINE STAGES
  // ============================================================================

  private async stageLoadAndValidate(entry: AssetManifestEntry, asset: LoadedGLTF): Promise<LoadedGLTF> {
    // Validate basic structure
    if (!asset.scene) throw new Error('No scene in GLTF');
    if (!asset.animations) asset.animations = [];

    // Check for required bones based on target role
    if (entry.targetRole === AssetRole.CreatureBase || entry.targetRole === AssetRole.CreaturePart) {
      this.validateRig(entry, asset);
    }

    return asset;
  }

  private validateRig(entry: AssetManifestEntry, asset: LoadedGLTF): void {
    const requiredBones = this.getRequiredBonesForRole(entry.targetRole);
    const foundBones = new Set<string>();

    asset.scene.traverse((obj) => {
      // Check for bone or skinned mesh
      if ((obj as any).isBone || obj instanceof THREE.SkinnedMesh) {
        foundBones.add(obj.name);
      }
    });

    for (const bone of requiredBones) {
      if (!foundBones.has(bone)) {
        console.warn(`[AssetPipeline] ${entry.id}: Missing expected bone "${bone}"`);
      }
    }
  }

  private getRequiredBonesForRole(role: AssetRole): string[] {
    switch (role) {
      case AssetRole.CreatureBase:
        return ['Head', 'Spine', 'Tail', 'FrontLeftLeg', 'FrontRightLeg', 'BackLeftLeg', 'BackRightLeg'];
      case AssetRole.CreaturePart:
        return [];
      default:
        return [];
    }
  }

  private async stageNormalizeScale(entry: AssetManifestEntry, asset: LoadedGLTF): Promise<LoadedGLTF> {
    // Normalize to 1 unit = 1 meter, max dimension = 1
    const box = new THREE.Box3().setFromObject(asset.scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim > 0) {
      const scale = (1 / maxDim) * entry.scaleFactor;
      asset.scene.scale.setScalar(scale);
    }

    // Update bounding boxes
    asset.scene.updateWorldMatrix(true, false);

    return asset;
  }

  private async stageFixUpAxis(entry: AssetManifestEntry, asset: LoadedGLTF): Promise<LoadedGLTF> {
    if (entry.upAxisFix === 'Z_UP') {
      // Rotate -90 degrees around X to convert Z-up to Y-up
      asset.scene.rotateX(-Math.PI / 2);
      asset.scene.updateWorldMatrix(true, false);
    }
    return asset;
  }

  private async stageCenterGeometry(entry: AssetManifestEntry, asset: LoadedGLTF): Promise<LoadedGLTF> {
    const box = new THREE.Box3().setFromObject(asset.scene);
    const center = box.getCenter(new THREE.Vector3());

    // For creatures, center at feet (bottom of bounding box)
    if (entry.targetRole === AssetRole.CreatureBase || entry.targetRole === AssetRole.CreaturePart) {
      center.y = box.min.y;
    }

    asset.scene.position.sub(center);
    asset.scene.updateWorldMatrix(true, false);

    return asset;
  }

  private async stageSetupPBRMaterials(entry: AssetManifestEntry, asset: LoadedGLTF): Promise<LoadedGLTF> {
    asset.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        for (let i = 0; i < materials.length; i++) {
          const material = materials[i];

          if (material instanceof THREE.MeshStandardMaterial) {
            // Already PBR, ensure proper setup
            material.side = THREE.FrontSide;
            if ('colorSpace' in material) {
              (material as any).colorSpace = THREE.SRGBColorSpace;
            }
          } else if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshPhongMaterial) {
            // Upgrade to MeshStandardMaterial
            const newMat = new THREE.MeshStandardMaterial();
            newMat.color.copy(material.color);
            newMat.map = material.map;
            if (material instanceof THREE.MeshPhongMaterial) {
              newMat.normalMap = material.normalMap;
            }
            newMat.roughness = 0.7;
            newMat.metalness = 0.1;
            newMat.side = THREE.FrontSide;

            materials[i] = newMat;
            material.dispose();
          }
        }

        if (materials.length === 1) {
          child.material = materials[0];
        } else {
          child.material = materials;
        }
      }
    });

    return asset;
  }

  private async stageApplyMaterialMapping(entry: AssetManifestEntry, asset: LoadedGLTF): Promise<LoadedGLTF> {
    if (!entry.materialMapping || Object.keys(entry.materialMapping).length === 0) {
      return asset;
    }

    asset.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        for (const material of materials) {
          if (entry.materialMapping[material.name] || entry.materialMapping[child.name]) {
            const targetMaterialId = entry.materialMapping[material.name] || entry.materialMapping[child.name];
            console.log(`[AssetPipeline] ${entry.id}: Material "${material.name}" -> "${targetMaterialId}"`);
            material.userData.targetMaterialId = targetMaterialId;
          }
        }
      }
    });

    return asset;
  }

  private async stageGenerateLODs(entry: AssetManifestEntry, asset: LoadedGLTF): Promise<LoadedGLTF> {
    // Only generate LODs for high-poly assets
    const shouldGenerateLODs = entry.targetRole === AssetRole.CreatureBase ||
                               entry.targetRole === AssetRole.BuildingPiece ||
                               entry.targetRole === AssetRole.Prop;

    if (!shouldGenerateLODs) return asset;

    // Check triangle count
    let triCount = 0;
    asset.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) {
        triCount += obj.geometry.index ? obj.geometry.index.count / 3 : obj.geometry.attributes.position.count / 3;
      }
    });

    if (triCount < 5000) return asset;

    // Mark for LOD generation
    asset.userData = asset.userData || {};
    asset.userData.lodInfo = {
      originalTris: triCount,
      lod1Target: Math.floor(triCount * 0.5),
      lod2Target: Math.floor(triCount * 0.25),
      shouldGenerate: true,
    };

    return asset;
  }

  private async stageGenerateColliders(entry: AssetManifestEntry, asset: LoadedGLTF): Promise<LoadedGLTF> {
    asset.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geometry = child.geometry;
        if (!geometry) return;

        const box = new THREE.Box3().setFromObject(child);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        child.userData.collider = {
          type: this.chooseColliderType(size),
          size: { x: size.x, y: size.y, z: size.z },
          center: { x: center.x, y: center.y, z: center.z },
          isTrigger: false,
        };
      }
    });

    return asset;
  }

  private chooseColliderType(size: THREE.Vector3): string {
    const maxDim = Math.max(size.x, size.y, size.z);
    const minDim = Math.min(size.x, size.y, size.z);
    const ratio = maxDim / minDim;

    if (ratio > 5) return 'capsule';
    if (ratio > 2) return 'box';
    return 'sphere';
  }

  private async stageSetupAnimations(entry: AssetManifestEntry, asset: LoadedGLTF): Promise<LoadedGLTF> {
    // Map animation clips to standard names
    const standardAnimations: Record<string, string[]> = {
      CreatureBase: ['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death'],
      CreaturePart: [],
      Weapon: ['Swing', 'Thrust', 'Charge', 'Reload'],
    };

    const expected = standardAnimations[entry.targetRole] || [];
    const foundAnimations = new Set(asset.animations.map(a => a.name));

    for (const expectedAnim of expected) {
      if (!foundAnimations.has(expectedAnim)) {
        const similar = asset.animations.find(a =>
          a.name.toLowerCase().includes(expectedAnim.toLowerCase())
        );
        if (similar) {
          similar.name = expectedAnim;
        } else {
          console.warn(`[AssetPipeline] ${entry.id}: Missing animation "${expectedAnim}"`);
        }
      }
    }

    for (const anim of asset.animations) {
      if (anim.duration <= 0) {
        console.warn(`[AssetPipeline] ${entry.id}: Animation "${anim.name}" has invalid duration`);
      }
    }

    return asset;
  }

  private async stageSetupSocketRigging(entry: AssetManifestEntry, asset: LoadedGLTF): Promise<LoadedGLTF> {
    if (entry.targetRole !== AssetRole.CreatureBase && entry.targetRole !== AssetRole.CreaturePart) {
      return asset;
    }

    const sockets: Record<string, THREE.Object3D> = {};

    if (entry.rigMapping) {
      asset.scene.traverse((obj) => {
        for (const [socketId, boneName] of Object.entries(entry.rigMapping || {})) {
          if (obj.name === boneName && ((obj as any).isBone || obj instanceof THREE.SkinnedMesh)) {
            const socket = new THREE.Object3D();
            socket.name = `Socket_${socketId}`;
            obj.add(socket);
            sockets[socketId] = socket;
          }
        }
      });
    }

    if (entry.socketBinding) {
      const binding = entry.socketBinding;
      const socket = new THREE.Object3D();
      socket.name = `Socket_${binding.socketId}`;
      socket.position.set(binding.offset.x, binding.offset.y, binding.offset.z);
      socket.quaternion.set(binding.rotation.x, binding.rotation.y, binding.rotation.z, binding.rotation.w);
      socket.scale.set(binding.scale.x, binding.scale.y, binding.scale.z);
      asset.scene.add(socket);
      sockets[binding.socketId] = socket;
    }

    asset.userData = asset.userData || {};
    asset.userData.sockets = sockets;

    return asset;
  }

  private async stageOptimizeForRuntime(entry: AssetManifestEntry, asset: LoadedGLTF): Promise<LoadedGLTF> {
    asset.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Ensure geometry is buffered
        if (!child.geometry.isBufferGeometry) {
          // BufferGeometry doesn't have fromGeometry in newer Three.js
          // Just ensure it's a BufferGeometry
        }

        child.geometry.computeBoundingBox();
        child.geometry.computeBoundingSphere();
      }
    });

    asset.scene.updateWorldMatrix(true, false);

    return asset;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getResult(entryId: string): PipelineResult | undefined {
    return this.results.get(entryId);
  }

  getAllResults(): Map<string, PipelineResult> {
    return this.results;
  }

  getSuccessfulAssets(): Map<string, LoadedGLTF> {
    const assets = new Map<string, LoadedGLTF>();
    for (const [id, result] of this.results) {
      if (result.success && result.asset) {
        assets.set(id, result.asset);
      }
    }
    return assets;
  }

  async exportProcessedManifest(outputPath: string): Promise<void> {
    const processedEntries = this.manifest.map(entry => {
      const result = this.results.get(entry.id);
      return {
        ...entry,
        processed: result?.success || false,
        warnings: result?.warnings || [],
        error: result?.error,
        triangleCount: result?.asset?.userData?.lodInfo?.originalTris,
        hasAnimations: (result?.asset?.animations?.length || 0) > 0,
        sockets: result?.asset?.userData?.sockets ? Object.keys(result.asset.userData.sockets) : [],
      };
    });

    const output = {
      version: '1.0.0',
      processedAt: new Date().toISOString(),
      totalAssets: this.manifest.length,
      successful: processedEntries.filter(e => e.processed).length,
      failed: processedEntries.filter(e => !e.processed).length,
      assets: processedEntries,
    };

    console.log('[AssetPipeline] Processed manifest:', JSON.stringify(output, null, 2));
  }
}

// ============================================================================
// MATERIAL ADAPTER - Biome Blending & Triplanar Mapping
// ============================================================================

export class MaterialAdapter {
  private renderer: THREE.WebGLRenderer;
  private biomeMaterials: Map<string, THREE.MeshStandardMaterial> = new Map();
  private terrainBlendMaterial: THREE.ShaderMaterial | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
  }

  async loadBiomeMaterials(manifestEntries: AssetManifestEntry[]): Promise<void> {
    const materialEntries = manifestEntries.filter(e =>
      e.targetRole === AssetRole.BiomeTerrain && e.materialMapping
    );

    for (const entry of materialEntries) {
      const material = await this.createBiomeMaterial(entry);
      this.biomeMaterials.set(entry.id, material);
    }
  }

  private async createBiomeMaterial(entry: AssetManifestEntry): Promise<THREE.MeshStandardMaterial> {
    const mapping = entry.materialMapping;

    const hasAlbedo = mapping.Albedo || mapping.albedoMap;
    const hasNormal = mapping.Normal || mapping.normalMap;
    const hasRoughness = mapping.Roughness || mapping.roughnessMap;
    const hasMetalness = mapping.Metalness || mapping.metalnessMap;
    const hasAO = mapping.AO || mapping.aoMap;
    const hasHeight = mapping.Height || mapping.heightMap;

    if (hasAlbedo && hasNormal && hasRoughness) {
      const textures = await this.loadPBRTextureSet(entry.localPath, mapping);
      return this.createTerrainBlendMaterial(textures, entry.id);
    }

    return new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.8,
      metalness: 0.1,
    });
  }

  private async loadPBRTextureSet(basePath: string, mapping: Record<string, string>): Promise<Record<string, THREE.Texture>> {
    const results: Record<string, THREE.Texture> = {};
    const textureLoader = new THREE.TextureLoader();

    const mapConfigs: [string, string, THREE.ColorSpace][] = [
      ['Albedo', 'map', THREE.SRGBColorSpace],
      ['albedoMap', 'map', THREE.SRGBColorSpace],
      ['Normal', 'normalMap', THREE.LinearSRGBColorSpace],
      ['normalMap', 'normalMap', THREE.LinearSRGBColorSpace],
      ['Roughness', 'roughnessMap', THREE.LinearSRGBColorSpace],
      ['roughnessMap', 'roughnessMap', THREE.LinearSRGBColorSpace],
      ['Metalness', 'metalnessMap', THREE.LinearSRGBColorSpace],
      ['metalnessMap', 'metalnessMap', THREE.LinearSRGBColorSpace],
      ['AO', 'aoMap', THREE.LinearSRGBColorSpace],
      ['aoMap', 'aoMap', THREE.LinearSRGBColorSpace],
      ['Height', 'displacementMap', THREE.LinearSRGBColorSpace],
      ['heightMap', 'displacementMap', THREE.LinearSRGBColorSpace],
      ['Emissive', 'emissiveMap', THREE.SRGBColorSpace],
      ['emissiveMap', 'emissiveMap', THREE.SRGBColorSpace],
    ];

    for (const [sourceKey, targetKey, colorSpace] of mapConfigs) {
      const sourcePath = mapping[sourceKey];
      if (!sourcePath) continue;

      try {
        const fullPath = sourcePath.startsWith('http') ? sourcePath : `${basePath}/${sourcePath}`;
        const texture = await textureLoader.loadAsync(fullPath);
        texture.colorSpace = colorSpace;
        texture.flipY = false;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        results[targetKey] = texture;
      } catch (error) {
        console.warn(`[MaterialAdapter] Failed to load ${sourceKey}: ${error}`);
      }
    }

    return results;
  }

  private createTerrainBlendMaterial(textures: Record<string, THREE.Texture>, biomeId: string): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      map: textures.map,
      normalMap: textures.normalMap,
      roughnessMap: textures.roughnessMap,
      metalnessMap: textures.metalnessMap,
      aoMap: textures.aoMap,
      displacementMap: textures.displacementMap,
      emissiveMap: textures.emissiveMap,
      roughness: 0.8,
      metalness: 0.1,
      displacementScale: 0.1,
      displacementBias: -0.05,
    });

    material.userData = {
      biomeId,
      isTerrainMaterial: true,
      triplanar: true,
    };

    return material;
  }

  createBiomeBlendShader(layerCount: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D uLayers[${layerCount}];
        uniform float uBlendWeights[${layerCount}];
        uniform float uGlobalScale;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        vec3 triplanarSample(sampler2D tex, vec3 pos, vec3 normal, float scale) {
          vec3 blend = abs(normal);
          blend = pow(blend, vec3(10.0));
          blend /= dot(blend, vec3(1.0));
          vec2 uvX = pos.zy * scale;
          vec2 uvY = pos.xz * scale;
          vec2 uvZ = pos.xy * scale;
          vec3 colX = texture2D(tex, uvX).rgb;
          vec3 colY = texture2D(tex, uvY).rgb;
          vec3 colZ = texture2D(tex, uvZ).rgb;
          return colX * blend.x + colY * blend.y + colZ * blend.z;
        }
        void main() {
          vec3 albedo = vec3(0.0);
          for (int i = 0; i < ${layerCount}; i++) {
            float weight = uBlendWeights[i];
            if (weight > 0.001) {
              vec3 layerAlbedo = triplanarSample(uLayers[i], vWorldPosition, vWorldNormal, uGlobalScale);
              albedo += layerAlbedo * weight;
            }
          }
          gl_FragColor = vec4(albedo, 1.0);
        }
      `,
      uniforms: {
        uLayers: { value: [] },
        uBlendWeights: { value: new Float32Array(layerCount) },
        uGlobalScale: { value: 1.0 },
      },
    });
  }

  getBiomeMaterial(biomeId: string): THREE.MeshStandardMaterial | undefined {
    return this.biomeMaterials.get(biomeId);
  }

  applyBiomeTint(material: THREE.MeshStandardMaterial, biomeConfig: { skyTint: { r: number; g: number; b: number }; fogColor: { r: number; g: number; b: number } }): void {
    if (material.map) {
      material.color.setRGB(
        biomeConfig.skyTint.r * 0.3 + 0.7,
        biomeConfig.skyTint.g * 0.3 + 0.7,
        biomeConfig.skyTint.b * 0.3 + 0.7
      );
    }
  }
}

// ============================================================================
// CHIMERA SOCKET SYSTEM - Runtime attachment of parts
// ============================================================================

export interface ChimeraSocket {
  id: string;
  boneName: string;
  type: 'head' | 'back' | 'tail' | 'frontLegs' | 'claws' | 'core' | 'horn';
  compatibleParts: string[];
  offset: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: THREE.Vector3;
  attachedPartId: string | null;
  attachedObject: THREE.Object3D | null;
}

export class ChimeraSocketSystem {
  private sockets: Map<string, ChimeraSocket> = new Map();
  private assetLoader: AssetLoader;
  private partCache: Map<string, THREE.Group> = new Map();

  constructor(assetLoader: AssetLoader) {
    this.assetLoader = assetLoader;
  }

  initializeFromCreatureData(creatureData: any): void {
    this.sockets.clear();

    if (creatureData.anatomy?.sockets) {
      for (const socketData of creatureData.anatomy.sockets) {
        const socket: ChimeraSocket = {
          id: socketData.id,
          boneName: socketData.boneName,
          type: socketData.type,
          compatibleParts: socketData.compatibleParts || [],
          offset: new THREE.Vector3(socketData.offset.x, socketData.offset.y, socketData.offset.z),
          rotation: new THREE.Quaternion(socketData.rotation.x, socketData.rotation.y, socketData.rotation.z, socketData.rotation.w),
          scale: new THREE.Vector3(socketData.visualScale?.x || 1, socketData.visualScale?.y || 1, socketData.visualScale?.z || 1),
          attachedPartId: null,
          attachedObject: null,
        };
        this.sockets.set(socket.id, socket);
      }
    }
  }

  bindToModel(model: THREE.Group): void {
    for (const socket of this.sockets.values()) {
      const bone = this.findBone(model, socket.boneName);
      if (bone) {
        const socketObj = new THREE.Object3D();
        socketObj.name = `Socket_${socket.id}`;
        socketObj.position.copy(socket.offset);
        socketObj.quaternion.copy(socket.rotation);
        socketObj.scale.copy(socket.scale);
        bone.add(socketObj);
        socket.attachedObject = socketObj;
      } else {
        console.warn(`[ChimeraSocketSystem] Bone "${socket.boneName}" not found for socket "${socket.id}"`);
      }
    }
  }

  private findBone(model: THREE.Group, boneName: string): THREE.Bone | THREE.Object3D | null {
    let found: THREE.Bone | THREE.Object3D | null = null;
    model.traverse((obj) => {
      if (obj.name === boneName && ((obj as any).isBone || obj instanceof THREE.SkinnedMesh)) {
        found = obj;
      }
    });
    return found;
  }

  async attachPart(socketId: string, partAssetId: string, partManifestEntry: any): Promise<boolean> {
    const socket = this.sockets.get(socketId);
    if (!socket) {
      console.error(`[ChimeraSocketSystem] Socket "${socketId}" not found`);
      return false;
    }

    if (!socket.compatibleParts.includes(partAssetId)) {
      console.warn(`[ChimeraSocketSystem] Part "${partAssetId}" not compatible with socket "${socketId}"`);
    }

    this.detachPart(socketId);

    let partGroup = this.partCache.get(partAssetId);
    if (!partGroup) {
      try {
        const gltf = await this.assetLoader.loadGLTFFromManifest(partManifestEntry, {
          normalizeScale: true,
          centerGeometry: true,
        });
        partGroup = gltf.scene.clone(true);
        this.partCache.set(partAssetId, partGroup);
      } catch (error) {
        console.error(`[ChimeraSocketSystem] Failed to load part ${partAssetId}:`, error);
        return false;
      }
    }

    const attachedPart = partGroup.clone(true);

    if (partManifestEntry.socketBinding) {
      const binding = partManifestEntry.socketBinding;
      attachedPart.position.set(binding.offset.x, binding.offset.y, binding.offset.z);
      attachedPart.quaternion.set(binding.rotation.x, binding.rotation.y, binding.rotation.z, binding.rotation.w);
      attachedPart.scale.set(binding.scale.x, binding.scale.y, binding.scale.z);
    } else {
      attachedPart.position.copy(socket.offset);
      attachedPart.quaternion.copy(socket.rotation);
      attachedPart.scale.copy(socket.scale);
    }

    if (socket.attachedObject) {
      socket.attachedObject.add(attachedPart);
      socket.attachedPartId = partAssetId;
      console.log(`[ChimeraSocketSystem] Attached "${partAssetId}" to socket "${socketId}"`);
      return true;
    }

    return false;
  }

  detachPart(socketId: string): boolean {
    const socket = this.sockets.get(socketId);
    if (!socket || !socket.attachedObject) return false;

    while (socket.attachedObject.children.length > 0) {
      const child = socket.attachedObject.children[0];
      if (!child) break;
      socket.attachedObject.remove(child);
      child.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => m.dispose());
        }
      });
    }

    socket.attachedPartId = null;
    return true;
  }

  getAttachedPart(socketId: string): string | null {
    return this.sockets.get(socketId)?.attachedPartId || null;
  }

  getAllSockets(): ChimeraSocket[] {
    return Array.from(this.sockets.values());
  }

  serialize(): any {
    const data: any = {};
    for (const [id, socket] of this.sockets) {
      data[id] = {
        attachedPartId: socket.attachedPartId,
        offset: { x: socket.offset.x, y: socket.offset.y, z: socket.offset.z },
        rotation: { x: socket.rotation.x, y: socket.rotation.y, z: socket.rotation.z, w: socket.rotation.w },
        scale: { x: socket.scale.x, y: socket.scale.y, z: socket.scale.z },
      };
    }
    return data;
  }

  deserialize(data: any, model: THREE.Group): void {
    for (const [id, socketData] of Object.entries(data)) {
      const socket = this.sockets.get(id);
      if (socket && (socketData as any).attachedPartId) {
        console.log(`[ChimeraSocketSystem] Would re-attach ${(socketData as any).attachedPartId} to ${id}`);
      }
    }
  }
}