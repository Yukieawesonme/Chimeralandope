/**
 * Asset Pipeline - Automated Download & Import from Public 3D Libraries
 * Integrates with Poly Haven, Kenney, Quaternius, Sketchfab, OpenGameArt, ambientCG
 */

import { AssetManifestEntry, AssetRole, PBRMaterialData, BiomeType } from '@core/Types.js';

// ============================================================================
// LIBRARY CATALOGS
// ============================================================================

export interface LibraryCatalog {
  name: string;
  baseUrl: string;
  apiUrl?: string;
  license: string;
  attributionRequired: boolean;
  categories: string[];
  searchEndpoint?: string;
  downloadEndpoint?: string;
  rateLimit: { requests: number; windowMs: number };
}

export const PUBLIC_LIBRARIES: Record<string, LibraryCatalog> = {
  polyhaven: {
    name: 'Poly Haven',
    baseUrl: 'https://api.polyhaven.com',
    license: 'CC0',
    attributionRequired: false,
    categories: ['hdris', 'textures', 'models'],
    searchEndpoint: '/assets',
    downloadEndpoint: '/files',
    rateLimit: { requests: 60, windowMs: 60000 },
  },
  ambientcg: {
    name: 'ambientCG',
    baseUrl: 'https://ambientcg.com/api/v2',
    license: 'CC0',
    attributionRequired: false,
    categories: ['materials', 'hdris', 'models'],
    searchEndpoint: '/materials',
    downloadEndpoint: '/download',
    rateLimit: { requests: 30, windowMs: 60000 },
  },
  kenney: {
    name: 'Kenney.nl',
    baseUrl: 'https://kenney.nl/assets',
    license: 'CC0',
    attributionRequired: false,
    categories: ['models', 'textures', 'audio', 'ui'],
    rateLimit: { requests: 10, windowMs: 60000 },
  },
  quaternius: {
    name: 'Quaternius',
    baseUrl: 'https://quaternius.com',
    license: 'CC0',
    attributionRequired: true,
    categories: ['models', 'characters', 'environments'],
    rateLimit: { requests: 10, windowMs: 60000 },
  },
  sketchfab: {
    name: 'Sketchfab',
    baseUrl: 'https://api.sketchfab.com/v3',
    license: 'Mixed (check per model)',
    attributionRequired: true,
    categories: ['models'],
    searchEndpoint: '/search',
    downloadEndpoint: '/models/{uid}/download',
    rateLimit: { requests: 100, windowMs: 60000 },
  },
  opengameart: {
    name: 'OpenGameArt.org',
    baseUrl: 'https://opengameart.org',
    license: 'Mixed (GPL, CC-BY, CC0, etc.)',
    attributionRequired: true,
    categories: ['models', 'textures', 'audio', 'sprites'],
    rateLimit: { requests: 5, windowMs: 60000 },
  },
  sharetextures: {
    name: 'ShareTextures',
    baseUrl: 'https://sharetextures.com',
    license: 'CC0',
    attributionRequired: false,
    categories: ['textures'],
    rateLimit: { requests: 30, windowMs: 60000 },
  },
};

// ============================================================================
// ASSET MANIFEST
// ============================================================================

export interface AssetManifest {
  version: string;
  lastUpdated: number;
  assets: AssetManifestEntry[];
  libraries: Record<string, { lastSync: number; version: string }>;
}

export interface DownloadTask {
  id: string;
  entry: AssetManifestEntry;
  status: 'pending' | 'downloading' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  localPath?: string;
  startTime: number;
  endTime?: number;
}

// ============================================================================
// ASSET PIPELINE
// ============================================================================

export class AssetPipeline {
  private manifest: AssetManifest;
  private downloadQueue: DownloadTask[] = [];
  private activeDownloads = 0;
  private maxConcurrentDownloads = 3;
  private cacheDir = '/assets/cache/';
  private onProgressCallback?: (task: DownloadTask) => void;
  private onCompleteCallback?: (task: DownloadTask) => void;
  private onErrorCallback?: (task: DownloadTask, error: Error) => void;

  constructor() {
    this.manifest = this.loadManifest();
  }

  private loadManifest(): AssetManifest {
    try {
      const stored = localStorage.getItem('chimeraland_asset_manifest');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}

    return {
      version: '1.0',
      lastUpdated: Date.now(),
      assets: [],
      libraries: {},
    };
  }

  private saveManifest(): void {
    this.manifest.lastUpdated = Date.now();
    localStorage.setItem('chimeraland_asset_manifest', JSON.stringify(this.manifest));
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  setProgressCallback(callback: (task: DownloadTask) => void): void {
    this.onProgressCallback = callback;
  }

  setCompleteCallback(callback: (task: DownloadTask) => void): void {
    this.onCompleteCallback = callback;
  }

  setErrorCallback(callback: (task: DownloadTask, error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  getManifest(): AssetManifest {
    return { ...this.manifest };
  }

  getAsset(entryId: string): AssetManifestEntry | undefined {
    return this.manifest.assets.find(a => a.id === entryId);
  }

  getAssetsByRole(role: AssetRole): AssetManifestEntry[] {
    return this.manifest.assets.filter(a => a.targetRole === role);
  }

  getAssetsByBiome(biome: BiomeType): AssetManifestEntry[] {
    return this.manifest.assets.filter(a => a.targetRole === AssetRole.BiomeTerrain || a.targetRole === AssetRole.BiomeFoliage);
  }

  // ============================================================================
  // LIBRARY SYNC
  // ============================================================================

  async syncLibrary(libraryId: string): Promise<void> {
    const library = PUBLIC_LIBRARIES[libraryId];
    if (!library) throw new Error(`Unknown library: ${libraryId}`);

    console.log(`[AssetPipeline] Syncing ${library.name}...`);

    try {
      let assets: any[] = [];

      switch (libraryId) {
        case 'polyhaven':
          assets = await this.syncPolyHaven();
          break;
        case 'ambientcg':
          assets = await this.syncAmbientCG();
          break;
        case 'kenney':
          assets = await this.syncKenney();
          break;
        case 'quaternius':
          assets = await this.syncQuaternius();
          break;
        case 'sketchfab':
          assets = await this.syncSketchfab();
          break;
        default:
          throw new Error(`Sync not implemented for ${libraryId}`);
      }

      // Convert to manifest entries
      for (const asset of assets) {
        const entry = this.convertToManifestEntry(libraryId, asset);
        if (entry) {
          this.addOrUpdateEntry(entry);
        }
      }

      this.manifest.libraries[libraryId] = {
        lastSync: Date.now(),
        version: library.baseUrl,
      };
      this.saveManifest();

      console.log(`[AssetPipeline] Synced ${library.name}: ${assets.length} assets`);
    } catch (error) {
      console.error(`[AssetPipeline] Failed to sync ${library.name}:`, error);
      throw error;
    }
  }

  private async syncPolyHaven(): Promise<any[]> {
    const response = await fetch('https://api.polyhaven.com/assets?t=models');
    const data = await response.json();
    return Object.values(data);
  }

  private async syncAmbientCG(): Promise<any[]> {
    const response = await fetch('https://ambientcg.com/api/v2/materials?include=download');
    const data = await response.json();
    return data.materials || [];
  }

  private async syncKenney(): Promise<any[]> {
    // Kenney doesn't have a public API, would need scraping
    // Return known asset list
    return [
      { id: 'kenney_nature', name: 'Nature Kit', url: 'https://kenney.nl/assets/nature-kit', type: 'models' },
      { id: 'kenney_medieval', name: 'Medieval RTS', url: 'https://kenney.nl/assets/medieval-rts', type: 'models' },
      { id: 'kenney_fantasy', name: 'Fantasy RPG', url: 'https://kenney.nl/assets/fantasy-rpg', type: 'models' },
      { id: 'kenney_proto', name: 'Prototype', url: 'https://kenney.nl/assets/prototype', type: 'models' },
    ];
  }

  private async syncQuaternius(): Promise<any[]> {
    // Quaternius doesn't have API, return known packs
    return [
      { id: 'quat_animals', name: 'Animals Pack', url: 'https://quaternius.com/packs/animals.html', type: 'models' },
      { id: 'quat_fantasy', name: 'Fantasy Creatures', url: 'https://quaternius.com/packs/fantasy-creatures.html', type: 'models' },
      { id: 'quat_medieval', name: 'Medieval Pack', url: 'https://quaternius.com/packs/medieval.html', type: 'models' },
    ];
  }

  private async syncSketchfab(): Promise<any[]> {
    // Would need API key
    console.warn('[AssetPipeline] Sketchfab sync requires API key');
    return [];
  }

  // ============================================================================
  // ENTRY MANAGEMENT
  // ============================================================================

  private convertToManifestEntry(libraryId: string, asset: any): AssetManifestEntry | null {
    // This would convert library-specific format to our manifest format
    // Implementation depends on each library's API response
    return null;
  }

  addOrUpdateEntry(entry: AssetManifestEntry): void {
    const existingIndex = this.manifest.assets.findIndex(a => a.id === entry.id);
    if (existingIndex >= 0) {
      this.manifest.assets[existingIndex] = entry;
    } else {
      this.manifest.assets.push(entry);
    }
    this.saveManifest();
  }

  removeEntry(entryId: string): boolean {
    const index = this.manifest.assets.findIndex(a => a.id === entryId);
    if (index >= 0) {
      this.manifest.assets.splice(index, 1);
      this.saveManifest();
      return true;
    }
    return false;
  }

  // ============================================================================
  // DOWNLOAD MANAGEMENT
  // ============================================================================

  async downloadAsset(entryId: string): Promise<string> {
    const entry = this.manifest.assets.find(a => a.id === entryId);
    if (!entry) throw new Error(`Asset not found: ${entryId}`);

    if (entry.localPath) {
      // Already downloaded
      return entry.localPath;
    }

    const task: DownloadTask = {
      id: `dl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      entry,
      status: 'pending',
      progress: 0,
      startTime: Date.now(),
    };

    this.downloadQueue.push(task);
    this.processQueue();

    // Wait for completion
    return new Promise((resolve, reject) => {
      const checkComplete = setInterval(() => {
        const currentTask = this.downloadQueue.find(t => t.id === task.id);
        if (currentTask) {
          if (currentTask.status === 'completed') {
            clearInterval(checkComplete);
            resolve(currentTask.localPath!);
          } else if (currentTask.status === 'failed') {
            clearInterval(checkComplete);
            reject(new Error(currentTask.error));
          }
        } else {
          clearInterval(checkComplete);
          reject(new Error('Task removed from queue'));
        }
      }, 100);
    });
  }

  private async processQueue(): Promise<void> {
    while (this.downloadQueue.length > 0 && this.activeDownloads < this.maxConcurrentDownloads) {
      const task = this.downloadQueue.find(t => t.status === 'pending');
      if (!task) break;

      this.activeDownloads++;
      task.status = 'downloading';
      this.onProgressCallback?.(task);

      try {
        const localPath = await this.downloadFile(task);
        task.localPath = localPath;
        task.status = 'completed';
        task.progress = 1;
        task.endTime = Date.now();

        // Update manifest
        task.entry.localPath = localPath;
        this.saveManifest();

        this.onCompleteCallback?.(task);
      } catch (error) {
        task.status = 'failed';
        task.error = (error as Error).message;
        task.endTime = Date.now();
        this.onErrorCallback?.(task, error as Error);
      } finally {
        this.activeDownloads--;
        this.onProgressCallback?.(task);
      }
    }
  }

  private async downloadFile(task: DownloadTask): Promise<string> {
    const entry = task.entry;

    if (!entry.downloadUrl && !entry.localPath) {
      throw new Error('No download URL available');
    }

    const url = entry.downloadUrl || entry.localPath;
    const filename = this.getFilenameFromUrl(url, entry.id);
    const localPath = `${this.cacheDir}${filename}`;

    // In a real browser environment, we'd use fetch with progress
    // For now, simulate download
    task.progress = 0;
    const totalSize = 10000000; // 10MB estimate
    let downloaded = 0;

    const simulateDownload = () => {
      return new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          downloaded += Math.random() * 500000;
          task.progress = Math.min(0.9, downloaded / totalSize);
          this.onProgressCallback?.(task);

          if (downloaded >= totalSize) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
      });
    };

    await simulateDownload();
    task.progress = 1;
    this.onProgressCallback?.(task);

    // In real implementation, would save to IndexedDB or File System Access API
    // For now, return the local path
    return localPath;
  }

  private getFilenameFromUrl(url: string, fallback: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || fallback;
      return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    } catch {
      return `${fallback}.glb`;
    }
  }

  // ============================================================================
  // ASSET PROCESSING
  // ============================================================================

  async processAsset(entryId: string, options?: {
    normalizeScale?: boolean;
    centerGeometry?: boolean;
    generateLODs?: number;
    generateColliders?: boolean;
    targetFormat?: 'glb' | 'gltf' | 'fbx';
  }): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    const entry = this.manifest.assets.find(a => a.id === entryId);
    if (!entry || !entry.localPath) {
      return { success: false, error: 'Asset not downloaded' };
    }

    try {
      // This would use a Web Worker or WASM module for processing
      // For now, return success
      const outputPath = entry.localPath.replace('.glb', '_processed.glb');

      // Update entry with processed info
      if (options?.generateLODs) {
        entry.lods = Array.from({ length: options.generateLODs }, (_, i) =>
          entry.localPath!.replace('.glb', `_lod${i}.glb`)
        );
      }

      this.saveManifest();
      return { success: true, outputPath };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ============================================================================
  // MATERIAL PROCESSING
  // ============================================================================

  async processPBRTextures(basePath: string, maps: Partial<PBRMaterialData>, entryId: string): Promise<Record<string, string>> {
    const results: Record<string, string> = {};

    const textureTypes: [keyof PBRMaterialData, string][] = [
      ['albedoMap', 'albedo'],
      ['normalMap', 'normal'],
      ['roughnessMap', 'roughness'],
      ['metalnessMap', 'metalness'],
      ['aoMap', 'ao'],
      ['heightMap', 'height'],
      ['emissiveMap', 'emissive'],
    ];

    for (const [mapKey, suffix] of textureTypes) {
      const mapPath = maps[mapKey];
      if (!mapPath || typeof mapPath !== 'string') continue;

      const fullUrl = mapPath.startsWith('http') ? mapPath : `${basePath}/${mapPath}`;
      const localPath = await this.downloadTexture(fullUrl, `${entryId}_${suffix}`);
      results[mapKey] = localPath;
    }

    return results;
  }

  private async downloadTexture(url: string, name: string): Promise<string> {
    // Similar to downloadFile but for textures
    const filename = `${name}.ktx2`; // Prefer KTX2 for GPU compression
    return `${this.cacheDir}${filename}`;
  }

  // ============================================================================
  // PRESET MANIFESTS FOR CHIMERALAND
  // ============================================================================

  static createChimeraLandManifest(): AssetManifestEntry[] {
    return [
      // Terrain materials from ambientCG/Poly Haven
      {
        id: 'terrain_grass_01',
        sourceLibrary: 'ambientCG',
        license: 'CC0',
        downloadUrl: 'https://cdn.ambientcg.com/resources/Texture2D/Grass001/Grass001_2K-JPG.zip',
        localPath: '',
        targetRole: AssetRole.BiomeTerrain,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: { 'Grass001': 'grass_blend' },
      },
      {
        id: 'terrain_dirt_01',
        sourceLibrary: 'ambientCG',
        license: 'CC0',
        downloadUrl: 'https://cdn.ambientcg.com/resources/Texture2D/Soil001/Soil001_2K-JPG.zip',
        localPath: '',
        targetRole: AssetRole.BiomeTerrain,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: { 'Soil001': 'dirt_blend' },
      },
      {
        id: 'terrain_rock_01',
        sourceLibrary: 'ambientCG',
        license: 'CC0',
        downloadUrl: 'https://cdn.ambientcg.com/resources/Texture2D/Rock001/Rock001_2K-JPG.zip',
        localPath: '',
        targetRole: AssetRole.BiomeTerrain,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: { 'Rock001': 'rock_blend' },
      },
      {
        id: 'terrain_sand_01',
        sourceLibrary: 'ambientCG',
        license: 'CC0',
        downloadUrl: 'https://cdn.ambientcg.com/resources/Texture2D/Sand001/Sand001_2K-JPG.zip',
        localPath: '',
        targetRole: AssetRole.BiomeTerrain,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: { 'Sand001': 'sand_blend' },
      },
      {
        id: 'terrain_moss_01',
        sourceLibrary: 'ambientCG',
        license: 'CC0',
        downloadUrl: 'https://cdn.ambientcg.com/resources/Texture2D/Moss001/Moss001_2K-JPG.zip',
        localPath: '',
        targetRole: AssetRole.BiomeTerrain,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: { 'Moss001': 'moss_blend' },
      },

      // Foliage from Kenney
      {
        id: 'foliage_tree_01',
        sourceLibrary: 'kenney',
        license: 'CC0',
        downloadUrl: 'https://kenney.nl/assets/nature-kit',
        localPath: '',
        targetRole: AssetRole.BiomeFoliage,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
      {
        id: 'foliage_bush_01',
        sourceLibrary: 'kenney',
        license: 'CC0',
        downloadUrl: 'https://kenney.nl/assets/nature-kit',
        localPath: '',
        targetRole: AssetRole.BiomeFoliage,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
      {
        id: 'foliage_grass_01',
        sourceLibrary: 'kenney',
        license: 'CC0',
        downloadUrl: 'https://kenney.nl/assets/nature-kit',
        localPath: '',
        targetRole: AssetRole.BiomeFoliage,
        scaleFactor: 0.5,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },

      // Creatures from Quaternius
      {
        id: 'creature_deer',
        sourceLibrary: 'quaternius',
        license: 'CC0',
        downloadUrl: 'https://quaternius.com/packs/animals.html',
        localPath: '',
        targetRole: AssetRole.CreatureBase,
        scaleFactor: 0.8,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
      {
        id: 'creature_wolf',
        sourceLibrary: 'quaternius',
        license: 'CC0',
        downloadUrl: 'https://quaternius.com/packs/animals.html',
        localPath: '',
        targetRole: AssetRole.CreatureBase,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
      {
        id: 'creature_boar',
        sourceLibrary: 'quaternius',
        license: 'CC0',
        downloadUrl: 'https://quaternius.com/packs/animals.html',
        localPath: '',
        targetRole: AssetRole.CreatureBase,
        scaleFactor: 1.2,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
      {
        id: 'creature_bird',
        sourceLibrary: 'quaternius',
        license: 'CC0',
        downloadUrl: 'https://quaternius.com/packs/animals.html',
        localPath: '',
        targetRole: AssetRole.CreatureBase,
        scaleFactor: 0.5,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },

      // Fantasy creatures
      {
        id: 'creature_dragon',
        sourceLibrary: 'quaternius',
        license: 'CC0',
        downloadUrl: 'https://quaternius.com/packs/fantasy-creatures.html',
        localPath: '',
        targetRole: AssetRole.CreatureBase,
        scaleFactor: 2,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
      {
        id: 'creature_goblin',
        sourceLibrary: 'quaternius',
        license: 'CC0',
        downloadUrl: 'https://quaternius.com/packs/fantasy-creatures.html',
        localPath: '',
        targetRole: AssetRole.CreatureBase,
        scaleFactor: 0.9,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },

      // Building pieces from Kenney
      {
        id: 'building_foundation',
        sourceLibrary: 'kenney',
        license: 'CC0',
        downloadUrl: 'https://kenney.nl/assets/medieval-rts',
        localPath: '',
        targetRole: AssetRole.BuildingPiece,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
      {
        id: 'building_wall',
        sourceLibrary: 'kenney',
        license: 'CC0',
        downloadUrl: 'https://kenney.nl/assets/medieval-rts',
        localPath: '',
        targetRole: AssetRole.BuildingPiece,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
      {
        id: 'building_door',
        sourceLibrary: 'kenney',
        license: 'CC0',
        downloadUrl: 'https://kenney.nl/assets/medieval-rts',
        localPath: '',
        targetRole: AssetRole.BuildingPiece,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },

      // Weapons from Kenney
      {
        id: 'weapon_sword_01',
        sourceLibrary: 'kenney',
        license: 'CC0',
        downloadUrl: 'https://kenney.nl/assets/medieval-rts',
        localPath: '',
        targetRole: AssetRole.Weapon,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
      {
        id: 'weapon_bow_01',
        sourceLibrary: 'kenney',
        license: 'CC0',
        downloadUrl: 'https://kenney.nl/assets/medieval-rts',
        localPath: '',
        targetRole: AssetRole.Weapon,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
      {
        id: 'weapon_staff_01',
        sourceLibrary: 'kenney',
        license: 'CC0',
        downloadUrl: 'https://kenney.nl/assets/fantasy-rpg',
        localPath: '',
        targetRole: AssetRole.Weapon,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },

      // HDRI skies from Poly Haven
      {
        id: 'hdri_sunny',
        sourceLibrary: 'polyhaven',
        license: 'CC0',
        downloadUrl: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/exr/4k/sunny_vondelpark_4k.exr',
        localPath: '',
        targetRole: AssetRole.Prop,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
      {
        id: 'hdri_forest',
        sourceLibrary: 'polyhaven',
        license: 'CC0',
        downloadUrl: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/exr/4k/forest_road_4k.exr',
        localPath: '',
        targetRole: AssetRole.Prop,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
      {
        id: 'hdri_sunset',
        sourceLibrary: 'polyhaven',
        license: 'CC0',
        downloadUrl: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/exr/4k/sunset_4k.exr',
        localPath: '',
        targetRole: AssetRole.Prop,
        scaleFactor: 1,
        upAxisFix: 'Y_UP',
        materialMapping: {},
      },
    ];
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  initializeChimeraLandAssets(): void {
    const entries = AssetPipeline.createChimeraLandManifest();
    for (const entry of entries) {
      this.addOrUpdateEntry(entry);
    }
    console.log(`[AssetPipeline] Initialized ${entries.length} ChimeraLand asset entries`);
  }
}

// ============================================================================
// MATERIAL PROCESSING UTILITIES
// ============================================================================

export class MaterialProcessor {
  static async createPBRMaterialFromMaps(maps: Record<string, string>): Promise<PBRMaterialData> {
    // This would load and process texture maps
    // For now, return a basic PBR material data structure
    return {
      albedoMap: maps.albedo || maps.baseColor,
      normalMap: maps.normal,
      roughnessMap: maps.roughness,
      metalnessMap: maps.metalness || maps.metallic,
      aoMap: maps.ao || maps.ambientOcclusion,
      heightMap: maps.height || maps.displacement,
      emissiveMap: maps.emissive,
      albedoColor: { x: 1, y: 1, z: 1 },
      emissiveColor: { x: 0, y: 0, z: 0 },
      emissiveIntensity: 0,
      roughness: 0.8,
      metalness: 0,
      alphaMode: 'OPAQUE',
      alphaCutoff: 0.5,
      doubleSided: false,
    };
  }

  static async generateLODs(
    modelPath: string,
    levels: number = 3,
    targetRatios: number[] = [1, 0.5, 0.25]
  ): Promise<string[]> {
    // Would use meshoptimizer or similar
    // Returns paths to generated LOD models
    return targetRatios.map((ratio, i) =>
      modelPath.replace('.glb', `_lod${i}.glb`)
    );
  }

  static async generateColliders(modelPath: string): Promise<{
    convexHull: string;
    box: string;
    capsule: string;
  }> {
    // Would use VHACD or similar for convex decomposition
    return {
      convexHull: modelPath.replace('.glb', '_collider.glb'),
      box: modelPath.replace('.glb', '_box.glb'),
      capsule: modelPath.replace('.glb', '_capsule.glb'),
    };
  }
}