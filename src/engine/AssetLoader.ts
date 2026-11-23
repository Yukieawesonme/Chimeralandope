/**
 * Asset Loader - GLTF/GLB, Textures, Audio
 * Handles async loading with progress tracking and caching
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { AssetManifestEntry, AssetRole, PBRMaterialData } from '@core/Types.js';

// ============================================================================
// LOAD RESULT TYPES
// ============================================================================

export interface LoadedGLTF {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  asset: { version?: string; generator?: string; copyright?: string; minVersion?: string; extensions?: any; extras?: any };
  parser: any;
  userData: any;
}

export interface LoadedTexture {
  texture: THREE.Texture;
  source: string;
}

export interface LoadedAudio {
  buffer: AudioBuffer;
  source: string;
}

export type LoadedAsset = LoadedGLTF | LoadedTexture | LoadedAudio;

export interface LoadProgress {
  loaded: number;
  total: number;
  percentage: number;
  currentFile: string;
}

// Type guard functions
function isLoadedGLTF(asset: LoadedAsset): asset is LoadedGLTF {
  return 'scene' in asset;
}

function isLoadedTexture(asset: LoadedAsset): asset is LoadedTexture {
  return 'texture' in asset;
}

// ============================================================================
// ASSET LOADER CLASS
// ============================================================================

export class AssetLoader {
  private gltfLoader: GLTFLoader;
  private textureLoader: THREE.TextureLoader;
  private audioLoader: THREE.AudioLoader;
  private dracoLoader: DRACOLoader;
  private ktx2Loader: KTX2Loader;

  private cache = new Map<string, LoadedAsset>();
  private loadingPromises = new Map<string, Promise<LoadedAsset>>();

  private onProgressCallback?: (progress: LoadProgress) => void;

  constructor(private renderer: THREE.WebGLRenderer) {
    // GLTF Loader with Draco and Meshopt support
    this.gltfLoader = new GLTFLoader();

    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this.gltfLoader.setDRACOLoader(this.dracoLoader);

    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);

    // KTX2 for compressed textures
    this.ktx2Loader = new KTX2Loader();
    this.ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.165/examples/jsm/libs/basis/');
    // detectGPURenderer may not exist in all versions
    const ktx2LoaderAny = this.ktx2Loader as any;
    if (typeof ktx2LoaderAny.detectGPURenderer === 'function') {
      ktx2LoaderAny.detectGPURenderer(this.renderer);
    }
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);

    // Texture loader
    this.textureLoader = new THREE.TextureLoader();

    // Audio loader
    this.audioLoader = new THREE.AudioLoader();
  }

  setProgressCallback(callback: (progress: LoadProgress) => void): void {
    this.onProgressCallback = callback;
  }

  // ---- GLTF/GLB Loading ----

  async loadGLTF(url: string, options?: {
    normalizeScale?: boolean;
    centerGeometry?: boolean;
    generateColliders?: boolean;
  }): Promise<LoadedGLTF> {
    return this.loadWithCacheGLTF(url, async () => {
      const gltf = await this.gltfLoader.loadAsync(url);

      if (options?.normalizeScale) {
        this.normalizeScale(gltf.scene);
      }
      if (options?.centerGeometry) {
        this.centerGeometry(gltf.scene);
      }
      if (options?.generateColliders) {
        this.generateColliders(gltf.scene);
      }

      // Ensure all materials are configured for PBR
      this.setupPBRMaterials(gltf.scene);

      return gltf;
    });
  }

  async loadGLTFFromManifest(entry: AssetManifestEntry, options?: {
    normalizeScale?: boolean;
    centerGeometry?: boolean;
  }): Promise<LoadedGLTF> {
    const url = entry.localPath || entry.downloadUrl;
    if (!url) throw new Error(`No URL for asset ${entry.id}`);

    const gltf = await this.loadGLTF(url, options);

    // Apply scale factor from manifest
    if (entry.scaleFactor !== 1) {
      gltf.scene.scale.setScalar(entry.scaleFactor);
    }

    // Apply up-axis fix
    if (entry.upAxisFix === 'Z_UP') {
      gltf.scene.rotateX(-Math.PI / 2);
    }

    // Apply material mapping
    this.applyMaterialMapping(gltf.scene, entry.materialMapping);

    return gltf;
  }

  // ---- Texture Loading ----

  async loadTexture(url: string, options?: {
    colorSpace?: THREE.ColorSpace;
    flipY?: boolean;
    generateMipmaps?: boolean;
    anisotropicFiltering?: number;
  }): Promise<LoadedTexture> {
    return this.loadWithCacheTexture(url, async () => {
      const texture = await this.textureLoader.loadAsync(url);

      texture.colorSpace = options?.colorSpace ?? THREE.SRGBColorSpace;
      texture.flipY = options?.flipY ?? false;
      texture.generateMipmaps = options?.generateMipmaps ?? true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;

      if (options?.anisotropicFiltering) {
        texture.anisotropy = options.anisotropicFiltering;
      }

      return { texture, source: url };
    });
  }

  async loadPBRTextureSet(baseUrl: string, maps: Partial<PBRMaterialData>): Promise<Record<string, THREE.Texture>> {
    const results: Record<string, THREE.Texture> = {};

    const mapEntries: [keyof PBRMaterialData, string][] = [
      ['albedoMap', 'map'],
      ['normalMap', 'normalMap'],
      ['roughnessMap', 'roughnessMap'],
      ['metalnessMap', 'metalnessMap'],
      ['aoMap', 'aoMap'],
      ['heightMap', 'displacementMap'],
      ['emissiveMap', 'emissiveMap'],
    ];

    const promises = mapEntries
      .filter(([key]) => maps[key])
      .map(async ([key, materialProp]) => {
        const url = maps[key];
        if (!url || typeof url !== 'string') return;
        const fullUrl = url.startsWith('http') ? url : `${baseUrl}/${url}`;
        const { texture } = await this.loadTexture(fullUrl, {
          colorSpace: key === 'albedoMap' || key === 'emissiveMap' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace,
          flipY: false,
        });
        results[materialProp] = texture;
      });

    await Promise.all(promises);
    return results;
  }

  // ---- Audio Loading ----

  async loadAudio(url: string): Promise<LoadedAudio> {
    return this.loadWithCacheAudio(url, async () => {
      const buffer = await this.audioLoader.loadAsync(url);
      return { buffer, source: url };
    });
  }

  // ---- Manifest-based Loading ----

  async loadManifest(entries: AssetManifestEntry[]): Promise<Map<string, LoadedAsset>> {
    const results = new Map<string, LoadedAsset>();
    let loaded = 0;
    const total = entries.length;

    const loadEntry = async (entry: AssetManifestEntry) => {
      let asset: LoadedAsset;

      switch (entry.targetRole) {
        case AssetRole.CreatureBase:
        case AssetRole.CreaturePart:
        case AssetRole.Weapon:
        case AssetRole.BuildingPiece:
        case AssetRole.Prop:
          asset = await this.loadGLTFFromManifest(entry, {
            normalizeScale: true,
            centerGeometry: true,
          });
          break;
        case AssetRole.BiomeTerrain:
        case AssetRole.BiomeFoliage:
          asset = await this.loadGLTFFromManifest(entry, {
            normalizeScale: true,
            centerGeometry: false,
          });
          break;
        default:
          asset = await this.loadGLTFFromManifest(entry);
      }

      results.set(entry.id, asset);
      loaded++;
      this.reportProgress(loaded, total, entry.id);
    };

    await Promise.all(entries.map(loadEntry));
    return results;
  }

  // ---- Cache Management ----

  private async loadWithCacheGLTF(url: string, loader: () => Promise<LoadedGLTF>): Promise<LoadedGLTF> {
    if (this.cache.has(url)) {
      const cached = this.cache.get(url);
      if (cached && isLoadedGLTF(cached)) return cached;
    }

    if (this.loadingPromises.has(url)) {
      const promise = this.loadingPromises.get(url);
      if (promise) {
        const result = await promise;
        if (isLoadedGLTF(result)) return result;
      }
    }

    const promise = loader().then(result => {
      this.cache.set(url, result);
      this.loadingPromises.delete(url);
      return result;
    });

    this.loadingPromises.set(url, promise);
    return promise;
  }

  private async loadWithCacheTexture(url: string, loader: () => Promise<LoadedTexture>): Promise<LoadedTexture> {
    if (this.cache.has(url)) {
      const cached = this.cache.get(url);
      if (cached && isLoadedTexture(cached)) return cached;
    }

    if (this.loadingPromises.has(url)) {
      const promise = this.loadingPromises.get(url);
      if (promise) {
        const result = await promise;
        if (isLoadedTexture(result)) return result;
      }
    }

    const promise = loader().then(result => {
      this.cache.set(url, result);
      this.loadingPromises.delete(url);
      return result;
    });

    this.loadingPromises.set(url, promise);
    return promise;
  }

  private async loadWithCacheAudio(url: string, loader: () => Promise<LoadedAudio>): Promise<LoadedAudio> {
    if (this.cache.has(url)) {
      const cached = this.cache.get(url);
      if (cached && !isLoadedGLTF(cached) && !isLoadedTexture(cached)) return cached;
    }

    if (this.loadingPromises.has(url)) {
      const promise = this.loadingPromises.get(url);
      if (promise) {
        const result = await promise;
        if (!isLoadedGLTF(result) && !isLoadedTexture(result)) return result;
      }
    }

    const promise = loader().then(result => {
      this.cache.set(url, result);
      this.loadingPromises.delete(url);
      return result;
    });

    this.loadingPromises.set(url, promise);
    return promise;
  }

  getCachedGLTF(url: string): LoadedGLTF | undefined {
    const cached = this.cache.get(url);
    return cached && isLoadedGLTF(cached) ? cached : undefined;
  }

  getCachedTexture(url: string): LoadedTexture | undefined {
    const cached = this.cache.get(url);
    return cached && isLoadedTexture(cached) ? cached : undefined;
  }

  clearCache(): void {
    this.cache.clear();
    this.loadingPromises.clear();
  }

  // ---- Material Setup ----

  private setupPBRMaterials(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial) {
            // Already PBR
            material.side = THREE.FrontSide;
          } else if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshPhongMaterial) {
            // Upgrade to MeshStandardMaterial
            const newMat = new THREE.MeshStandardMaterial();
            newMat.color.copy(material.color);
            newMat.map = material.map;
            newMat.normalMap = (material as THREE.MeshPhongMaterial).normalMap;
            newMat.roughness = 0.8;
            newMat.metalness = 0.1;
            child.material = newMat;
            material.dispose();
          }
        }
      }
    });
  }

  private applyMaterialMapping(object: THREE.Object3D, mapping: Record<string, string>): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (mapping[material.name]) {
            console.log(`Material mapping: ${material.name} -> ${mapping[material.name]}`);
          }
        }
      }
    });
  }

  // ---- Geometry Utilities ----

  private normalizeScale(object: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const scale = 1 / maxDim;
      object.scale.setScalar(scale);
    }
  }

  private centerGeometry(object: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
  }

  private generateColliders(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.userData.colliderGeometry = this.simplifyGeometry(child.geometry);
      }
    });
  }

  private simplifyGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    return geometry;
  }

  // ---- Progress Reporting ----

  private reportProgress(loaded: number, total: number, currentFile: string): void {
    if (this.onProgressCallback) {
      this.onProgressCallback({
        loaded,
        total,
        percentage: total > 0 ? loaded / total : 1,
        currentFile,
      });
    }
  }

  // ---- Disposal ----

  dispose(): void {
    this.cache.forEach(asset => {
      if (isLoadedGLTF(asset)) {
        asset.scene.traverse(obj => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => m.dispose());
          }
        });
      } else if (isLoadedTexture(asset)) {
        asset.texture.dispose();
      }
    });
    this.cache.clear();
    this.loadingPromises.clear();
    this.dracoLoader.dispose();
    this.ktx2Loader.dispose();
  }
}

// ============================================================================
// MATERIAL FACTORY
// ============================================================================

export class MaterialFactory {
  static createPBRMaterial(data: PBRMaterialData): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(data.albedoColor.x, data.albedoColor.y, data.albedoColor.z),
      roughness: data.roughness,
      metalness: data.metalness,
      emissive: new THREE.Color(data.emissiveColor.x, data.emissiveColor.y, data.emissiveColor.z),
      emissiveIntensity: data.emissiveIntensity,
      alphaTest: data.alphaCutoff,
      transparent: data.alphaMode === 'BLEND',
      side: data.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });

    if (data.albedoMap) material.map = data.albedoMap as any;
    if (data.normalMap) material.normalMap = data.normalMap as any;
    if (data.roughnessMap) material.roughnessMap = data.roughnessMap as any;
    if (data.metalnessMap) material.metalnessMap = data.metalnessMap as any;
    if (data.aoMap) material.aoMap = data.aoMap as any;
    if (data.heightMap) material.displacementMap = data.heightMap as any;
    if (data.emissiveMap) material.emissiveMap = data.emissiveMap as any;

    return material;
  }

  static createTerrainBlendMaterial(layers: TerrainLayer[]): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: terrainVertexShader,
      fragmentShader: terrainFragmentShader(layers.length),
      uniforms: {
        uLayers: { value: layers.map(l => ({
          albedo: l.albedo,
          normal: l.normal,
          roughness: l.roughness,
          scale: l.scale,
          blendSharpness: l.blendSharpness,
        })) },
        uBlendWeights: { value: new Float32Array(layers.length) },
        uGlobalScale: { value: 1.0 },
      },
    });
  }
}

interface TerrainLayer {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
  scale: number;
  blendSharpness: number;
}

const terrainVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

function terrainFragmentShader(layerCount: number): string {
  return `
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
      float roughness = 0.0;
      vec3 normal = vec3(0.0, 1.0, 0.0);

      for (int i = 0; i < ${layerCount}; i++) {
        float weight = uBlendWeights[i];
        if (weight > 0.001) {
          vec3 layerAlbedo = triplanarSample(uLayers[i], vWorldPosition, vWorldNormal, uGlobalScale);
          albedo += layerAlbedo * weight;
        }
      }

      gl_FragColor = vec4(albedo, 1.0);
    }
  `;
}