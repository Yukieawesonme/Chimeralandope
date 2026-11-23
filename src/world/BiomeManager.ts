/**
 * Biome Manager - Handles biome transitions, blending, and spawn weights
 * Manages continuous biome blending across the world
 */

import { BiomeType, Vec3 } from '@core/Types.js';
import { BIOME_CONFIGS, BiomeConfig } from '@core/Config.js';
import { Noise } from './Noise.js';

// ============================================================================
// BIOME MANAGER
// ============================================================================

export class BiomeManager {
  private biomeNoises: Map<BiomeType, Noise> = new Map();
  private biomeBoundaries: Map<BiomeType, { center: Vec3; radius: number }[]> = new Map();

  // World seed for deterministic generation
  private worldSeed: number = 0;

  constructor(seed: string = 'default') {
    this.worldSeed = this.hashString(seed);
    this.initializeBiomeNoises();
    this.initializeBiomeBoundaries();
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  private initializeBiomeNoises(): void {
    for (const [biomeType, config] of Object.entries(BIOME_CONFIGS)) {
      this.biomeNoises.set(biomeType as BiomeType, new Noise({
        scale: config.noiseScale,
        octaves: 4,
        persistence: 0.5,
        lacunarity: 2.0,
        seed: this.worldSeed + this.hashString(biomeType),
      }));
    }
  }

  private initializeBiomeBoundaries(): void {
    // Define biome regions for large-scale structure
    // In a full implementation, this would be procedurally generated
    this.biomeBoundaries.set(BiomeType.SpiritPlains, [
      { center: { x: 0, y: 0, z: 0 }, radius: 800 },
    ]);

    this.biomeBoundaries.set(BiomeType.FloatingMountains, [
      { center: { x: 1200, y: 0, z: 0 }, radius: 600 },
      { center: { x: -1200, y: 0, z: 1200 }, radius: 500 },
    ]);

    this.biomeBoundaries.set(BiomeType.AshDesert, [
      { center: { x: 2500, y: 0, z: 0 }, radius: 800 },
      { center: { x: -2000, y: 0, z: -1500 }, radius: 600 },
    ]);

    this.biomeBoundaries.set(BiomeType.ToxicSwamp, [
      { center: { x: 0, y: 0, z: 2500 }, radius: 700 },
    ]);

    this.biomeBoundaries.set(BiomeType.CoastalOcean, [
      { center: { x: 3000, y: 0, z: 2000 }, radius: 1000 },
    ]);
  }

  // ---- Biome Queries ----

  getBiomeWeights(position: Vec3): Map<BiomeType, number> {
    const weights = new Map<BiomeType, number>();
    const { x, z } = position;

    // Calculate influence from each biome region
    for (const [biomeType, regions] of this.biomeBoundaries) {
      let maxInfluence = 0;

      for (const region of regions) {
        const dx = x - region.center.x;
        const dz = z - region.center.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Smooth falloff
        if (dist < region.radius) {
          const influence = 1 - (dist / region.radius);
          maxInfluence = Math.max(maxInfluence, influence * influence); // Smoothstep
        }
      }

      if (maxInfluence > 0) {
        weights.set(biomeType, maxInfluence);
      }
    }

    // Default to Spirit Plains if no biome found
    if (weights.size === 0) {
      weights.set(BiomeType.SpiritPlains, 1.0);
    }

    // Normalize weights
    this.normalizeWeights(weights);

    return weights;
  }

  getDominantBiome(position: Vec3): BiomeType {
    const weights = this.getBiomeWeights(position);
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

  private normalizeWeights(weights: Map<BiomeType, number>): void {
    let total = 0;
    for (const weight of weights.values()) {
      total += weight;
    }

    if (total > 0) {
      for (const [biome, weight] of weights) {
        weights.set(biome, weight / total);
      }
    }
  }

  // ---- Biome Properties ----

  getBiomeConfig(biomeType: BiomeType): BiomeConfig {
    return BIOME_CONFIGS[biomeType];
  }

  getBiomeConfigAt(position: Vec3): BiomeConfig {
    return this.getBiomeConfig(this.getDominantBiome(position));
  }

  getBlendedBiomeConfig(position: Vec3): BlendedBiomeConfig {
    const weights = this.getBiomeWeights(position);
    const result: BlendedBiomeConfig = {
      fogColor: { r: 0, g: 0, b: 0 },
      fogDensity: 0,
      skyTint: { r: 0, g: 0, b: 0 },
      ambientSound: '',
      musicTrack: '',
      spawnWeights: new Map(),
      resourceNodes: [],
    };

    let totalWeight = 0;

    for (const [biome, weight] of weights) {
      if (weight <= 0) continue;
      const config = BIOME_CONFIGS[biome];

      result.fogColor.r += config.fogColor.r * weight;
      result.fogColor.g += config.fogColor.g * weight;
      result.fogColor.b += config.fogColor.b * weight;

      result.fogDensity += config.fogDensity * weight;

      result.skyTint.r += config.skyTint.r * weight;
      result.skyTint.g += config.skyTint.g * weight;
      result.skyTint.b += config.skyTint.b * weight;

      // Spawn weights
      for (const [creature, spawnWeight] of Object.entries(config.creatureSpawnWeights)) {
        const current = result.spawnWeights.get(creature) || 0;
        result.spawnWeights.set(creature, current + spawnWeight * weight);
      }

      // Resource nodes (add unique)
      for (const node of config.resourceNodes) {
        if (!result.resourceNodes.includes(node)) {
          result.resourceNodes.push(node);
        }
      }

      // Audio (use dominant)
      if (weight > 0.5) {
        result.ambientSound = config.ambientSound;
        result.musicTrack = config.musicTrack;
      }

      totalWeight += weight;
    }

    if (totalWeight === 0 && weights.size > 0) {
      // Fallback to first biome
      const firstBiome = weights.keys().next().value!;
      return this.getBlendedBiomeConfig({ ...position }); // Will recurse once
    }

    return result;
  }

  // ---- Height Modifiers ----

  getBiomeHeightOffset(position: Vec3): number {
    const weights = this.getBiomeWeights(position);
    let offset = 0;
    let totalWeight = 0;

    for (const [biome, weight] of weights) {
      if (weight <= 0) continue;
      const config = BIOME_CONFIGS[biome];
      const noise = this.biomeNoises.get(biome)!;
      const noiseValue = noise.getFBM(position.x, position.z);
      offset += (noiseValue * config.heightVariation + config.baseHeight) * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? offset / totalWeight : BIOME_CONFIGS[BiomeType.SpiritPlains].baseHeight;
  }

  // ---- Serialization ----

  serialize(): any {
    return {
      worldSeed: this.worldSeed,
      // Biome boundaries would be serialized here for persistence
    };
  }

  static deserialize(data: any): BiomeManager {
    const manager = new BiomeManager('');
    manager.worldSeed = data.worldSeed || 0;
    return manager;
  }
}

// ============================================================================
// BLENDED BIOME CONFIG
// ============================================================================

export interface BlendedBiomeConfig {
  fogColor: { r: number; g: number; b: number };
  fogDensity: number;
  skyTint: { r: number; g: number; b: number };
  ambientSound: string;
  musicTrack: string;
  spawnWeights: Map<string, number>;
  resourceNodes: string[];
}