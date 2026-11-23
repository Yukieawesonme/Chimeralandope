/**
 * Main Menu 3D - Live biome background with camera flyover
 * Renders a real 3D scene behind the menu UI
 */

import * as THREE from 'three';
import { Renderer } from '@engine/Renderer.js';
import { AssetLoader } from '@engine/AssetLoader.js';
import { BiomeManager } from '@world/BiomeManager.js';
import { TerrainSystem } from '@world/TerrainSystem.js';
import { GameState } from '@core/Types.js';
import { WORLD_CONFIG } from '@core/Config.js';

// ============================================================================
// MENU CAMERA CONTROLLER
// ============================================================================

interface CameraPathPoint {
  position: THREE.Vector3;
  target: THREE.Vector3;
  duration: number;
  easing?: (t: number) => number;
}

export class MainMenu3D {
  private renderer: Renderer;
  private assetLoader: AssetLoader;
  private biomeManager: BiomeManager;
  private terrainSystem: TerrainSystem;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private isActive = false;
  private currentPathIndex = 0;
  private pathProgress = 0;
  private pathStartTime = 0;
  private cameraPaths: CameraPathPoint[] = [];

  // Ambient creatures
  private ambientCreatures: THREE.Group[] = [];
  private creatureAnimations: Map<THREE.Group, {
    mixer: THREE.AnimationMixer;
    actions: THREE.AnimationAction[];
    state: 'idle' | 'walk' | 'graze';
  }> = new Map();

  // Sky/atmosphere
  private skyMesh: THREE.Mesh | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private fogColor = new THREE.Color(0x081426);

  // Time
  private timeOfDay = 0.3; // 0-1 (dawn to dusk)
  private dayCycleSpeed = 0.0001; // Very slow for menu

  constructor(
    renderer: Renderer,
    assetLoader: AssetLoader,
    biomeManager: BiomeManager,
    terrainSystem: TerrainSystem
  ) {
    this.renderer = renderer;
    this.assetLoader = assetLoader;
    this.biomeManager = biomeManager;
    this.terrainSystem = terrainSystem;
    this.scene = renderer.getScene();
    this.camera = renderer.getCamera();

    this.setupCameraPaths();
  }

  private setupCameraPaths(): void {
    // Cinematic camera paths over Spirit Plains
    this.cameraPaths = [
      {
        position: new THREE.Vector3(-100, 60, -100),
        target: new THREE.Vector3(0, 35, 0),
        duration: 20000,
        easing: this.easeInOutCubic,
      },
      {
        position: new THREE.Vector3(80, 45, 120),
        target: new THREE.Vector3(20, 35, 10),
        duration: 15000,
        easing: this.easeInOutCubic,
      },
      {
        position: new THREE.Vector3(-60, 50, 80),
        target: new THREE.Vector3(-30, 35, 20),
        duration: 18000,
        easing: this.easeInOutCubic,
      },
      {
        position: new THREE.Vector3(100, 70, -50),
        target: new THREE.Vector3(50, 35, -20),
        duration: 22000,
        easing: this.easeInOutCubic,
      },
    ];
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    await this.setupEnvironment();
    await this.spawnAmbientCreatures();
    this.setupCamera();
  }

  private async setupEnvironment(): Promise<void> {
    // Sky dome
    this.createSkyDome();

    // Sun light
    this.createSunLight();

    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0x405060, 0.5);
    this.scene.add(this.ambientLight);

    // Fog
    this.scene.fog = new THREE.FogExp2(this.fogColor, 0.002);

    // Ensure terrain chunks around origin are loaded
    this.ensureTerrainLoaded();
  }

  private createSkyDome(): void {
    // Large sphere for sky gradient
    const geometry = new THREE.SphereGeometry(5000, 32, 16);
    geometry.scale(-1, 1, 1); // Invert normals

    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        vec3 color;
        if (h > 0.0) {
          color = mix(horizonColor, topColor, h * 2.0);
        } else {
          color = mix(bottomColor, horizonColor, h + 1.0);
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const skyMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        topColor: { value: new THREE.Color(0x1a3a4a) },
        horizonColor: { value: new THREE.Color(0x4a8a9a) },
        bottomColor: { value: new THREE.Color(0x1a2a3a) },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.skyMesh = new THREE.Mesh(geometry, skyMaterial);
    this.scene.add(this.skyMesh);
  }

  private createSunLight(): void {
    this.sunLight = new THREE.DirectionalLight(0xfff0e0, 1.5);
    this.sunLight.position.set(100, 200, 50);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 500;
    this.sunLight.shadow.camera.left = -200;
    this.sunLight.shadow.camera.right = 200;
    this.sunLight.shadow.camera.top = 200;
    this.sunLight.shadow.camera.bottom = -200;
    this.sunLight.shadow.bias = -0.001;
    this.scene.add(this.sunLight);

    // Sun target for shadows
    this.scene.add(this.sunLight.target);
  }

  private ensureTerrainLoaded(): void {
    // Load chunks in a radius around origin
    const radius = 3;
    for (let z = -radius; z <= radius; z++) {
      for (let x = -radius; x <= radius; x++) {
        this.terrainSystem.getOrCreateChunk(x * WORLD_CONFIG.chunkSize, z * WORLD_CONFIG.chunkSize);
      }
    }
    // Force generation
    this.terrainSystem.update(0);
  }

  private async spawnAmbientCreatures(): Promise<void> {
    // Spawn simple placeholder creatures (will be replaced with real models)
    const creatureCount = 8;
    const spawnRadius = 150;

    for (let i = 0; i < creatureCount; i++) {
      const angle = (i / creatureCount) * Math.PI * 2;
      const distance = 30 + Math.random() * (spawnRadius - 30);
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const y = this.terrainSystem.getHeightAtWorld(x, z) + 0.5;

      const creature = this.createSimpleCreature(x, y, z);
      this.ambientCreatures.push(creature);
      this.scene.add(creature);
    }
  }

  private createSimpleCreature(x: number, y: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Body (simple capsule-like shape)
    const bodyGeo = new THREE.CapsuleGeometry(0.6, 1.2, 8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.1 + Math.random() * 0.1, 0.5, 0.4),
      roughness: 0.8,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0, 1.8, 0.7);
    head.castShadow = true;
    group.add(head);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.1, 0.15, 1.2, 6);
    const legPositions: [number, number][] = [
      [-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]
    ];
    for (const pos of legPositions) {
      const [lx, lz] = pos;
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(lx, 0.3, lz);
      leg.castShadow = true;
      group.add(leg);
    }

    // Animation data
    group.userData = {
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: Math.random() * 10,
      wanderRadius: 15 + Math.random() * 20,
      homePosition: new THREE.Vector3(x, y, z),
      speed: 1.5 + Math.random() * 1.0,
      state: 'idle' as 'idle' | 'walk',
      stateTimer: 0,
    };

    return group;
  }

  private setupCamera(): void {
    // Start at first path point
    if (this.cameraPaths.length > 0) {
      const first = this.cameraPaths[0]!;
      this.camera.position.copy(first.position);
      this.camera.lookAt(first.target);
    }
  }

  // ============================================================================
  // UPDATE LOOP
  // ============================================================================

  update(dt: number): void {
    if (!this.isActive) return;

    this.updateCamera(dt);
    this.updateCreatures(dt);
    this.updateEnvironment(dt);
    this.updateSunPosition();
  }

  private updateCamera(dt: number): void {
    if (this.cameraPaths.length === 0) return;

    const path = this.cameraPaths[this.currentPathIndex]!;
    this.pathProgress += dt / path.duration;

    if (this.pathProgress >= 1) {
      this.pathProgress = 0;
      this.currentPathIndex = (this.currentPathIndex + 1) % this.cameraPaths.length;
      this.pathStartTime = performance.now();
    }

    const nextIndex = (this.currentPathIndex + 1) % this.cameraPaths.length;
    const current = this.cameraPaths[this.currentPathIndex]!;
    const next = this.cameraPaths[nextIndex]!;

    const t = path.easing ? path.easing(this.pathProgress) : this.pathProgress;

    // Interpolate position
    this.camera.position.lerpVectors(current.position, next.position, t);

    // Interpolate target
    const target = new THREE.Vector3().lerpVectors(current.target, next.target, t);
    this.camera.lookAt(target);
  }

  private updateCreatures(dt: number): void {
    for (const creature of this.ambientCreatures) {
      const data = creature.userData;
      data.stateTimer -= dt;

      if (data.state === 'idle') {
        if (data.stateTimer <= 0) {
          // Start wandering
          data.state = 'walk';
          data.wanderAngle = Math.random() * Math.PI * 2;
          data.stateTimer = 3 + Math.random() * 5;
        }
        // Subtle idle animation
        creature.position.y = data.homePosition.y + Math.sin(performance.now() * 0.001 + creature.position.x) * 0.05;
      } else if (data.state === 'walk') {
        // Walk towards wander target
        const targetX = data.homePosition.x + Math.cos(data.wanderAngle) * data.wanderRadius;
        const targetZ = data.homePosition.z + Math.sin(data.wanderAngle) * data.wanderRadius;

        const dx = targetX - creature.position.x;
        const dz = targetZ - creature.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 1) {
          const moveX = (dx / dist) * data.speed * dt;
          const moveZ = (dz / dist) * data.speed * dt;
          creature.position.x += moveX;
          creature.position.z += moveZ;

          // Update Y to terrain
          creature.position.y = this.terrainSystem.getHeightAtWorld(creature.position.x, creature.position.z) + 0.5;

          // Rotate to face movement
          const targetAngle = Math.atan2(moveX, moveZ);
          creature.rotation.y = THREE.MathUtils.lerp(creature.rotation.y, targetAngle, 0.1);

          // Walk bob
          creature.position.y += Math.sin(performance.now() * 0.01) * 0.02;
        } else {
          // Reached target
          data.state = 'idle';
          data.stateTimer = 2 + Math.random() * 4;
        }

        if (data.stateTimer <= 0) {
          data.state = 'idle';
          data.stateTimer = 2 + Math.random() * 4;
        }
      }
    }
  }

  private updateEnvironment(dt: number): void {
    // Slow day/night cycle for menu
    this.timeOfDay += this.dayCycleSpeed * dt;
    if (this.timeOfDay > 1) this.timeOfDay = 0;
  }

  private updateSunPosition(): void {
    if (!this.sunLight) return;

    // Sun moves in a circle
    const angle = this.timeOfDay * Math.PI * 2 - Math.PI / 2;
    const height = Math.sin(angle) * 200 + 100;
    const radius = Math.cos(angle) * 200;

    this.sunLight.position.set(
      Math.cos(this.timeOfDay * Math.PI * 2) * radius,
      height,
      Math.sin(this.timeOfDay * Math.PI * 2) * radius
    );
    this.sunLight.target.position.set(0, 35, 0);

    // Adjust light intensity based on time
    const intensity = Math.max(0.3, Math.sin(angle + Math.PI / 2));
    this.sunLight.intensity = intensity * 1.5;

    // Adjust sky colors
    if (this.skyMesh && this.skyMesh.material instanceof THREE.ShaderMaterial) {
      const t = this.timeOfDay;
      // @ts-ignore - uniforms are set in createSkyDome
      const topColor = this.skyMesh.material.uniforms.topColor.value!;
      // @ts-ignore - uniforms are set in createSkyDome
      const horizonColor = this.skyMesh.material.uniforms.horizonColor.value!;

      if (t < 0.25) { // Dawn
        const dawnT = t / 0.25;
        topColor.lerpColors(new THREE.Color(0x0a1a3a), new THREE.Color(0x1a3a5a), dawnT);
        horizonColor.lerpColors(new THREE.Color(0x6a4a3a), new THREE.Color(0x8a7a5a), dawnT);
      } else if (t < 0.75) { // Day
        topColor.set(0x1a3a5a);
        horizonColor.set(0x4a8a9a);
      } else { // Dusk
        const duskT = (t - 0.75) / 0.25;
        topColor.lerpColors(new THREE.Color(0x1a3a5a), new THREE.Color(0x0a1a3a), duskT);
        horizonColor.lerpColors(new THREE.Color(0x4a8a9a), new THREE.Color(0x6a4a3a), duskT);
      }

      // Update fog color
      this.fogColor.lerpColors(new THREE.Color(0x081426), new THREE.Color(0x1a2a3a), intensity);
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.copy(this.fogColor);
      }
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  activate(): void {
    this.isActive = true;
    this.pathStartTime = performance.now();
    this.currentPathIndex = 0;
    this.pathProgress = 0;
  }

  deactivate(): void {
    this.isActive = false;
  }

  setTimeOfDay(t: number): void {
    this.timeOfDay = Math.max(0, Math.min(1, t));
  }

  getCamera(): THREE.Camera {
    return this.camera;
  }

  dispose(): void {
    // Clean up creatures
    for (const creature of this.ambientCreatures) {
      creature.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.scene.remove(creature);
    }
    this.ambientCreatures.length = 0;

    // Clean up sky
    if (this.skyMesh) {
      this.skyMesh.geometry.dispose();
      (this.skyMesh.material as THREE.Material).dispose();
      this.scene.remove(this.skyMesh);
    }

    // Clean up lights
    if (this.sunLight) this.scene.remove(this.sunLight);
    if (this.ambientLight) this.scene.remove(this.ambientLight);
  }
}