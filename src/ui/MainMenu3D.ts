/**
 * Main Menu 3D - Live biome background with a finite camera flyover.
 * Renders a real 3D scene behind the menu UI.
 */

import * as THREE from 'three';
import { Renderer } from '@engine/Renderer.js';
import { AssetLoader } from '@engine/AssetLoader.js';
import { BiomeManager } from '@world/BiomeManager.js';
import { TerrainSystem } from '@world/TerrainSystem.js';
import { WORLD_CONFIG } from '@core/Config.js';

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
  private cameraPaths: CameraPathPoint[] = [];
  private ambientCreatures: THREE.Group[] = [];
  private skyMesh: THREE.Mesh | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private fogColor = new THREE.Color(0x081426);
  private timeOfDay = 0.3;
  private dayCycleSpeed = 0.0001;

  constructor(renderer: Renderer, assetLoader: AssetLoader, biomeManager: BiomeManager, terrainSystem: TerrainSystem) {
    this.renderer = renderer;
    this.assetLoader = assetLoader;
    this.biomeManager = biomeManager;
    this.terrainSystem = terrainSystem;
    this.scene = renderer.getScene();
    this.camera = renderer.getCamera();
    this.setupCameraPaths();
  }

  private setupCameraPaths(): void {
    this.cameraPaths = [
      { position: new THREE.Vector3(-100, 60, -100), target: new THREE.Vector3(0, 35, 0), duration: 20000, easing: this.easeInOutCubic },
      { position: new THREE.Vector3(80, 45, 120), target: new THREE.Vector3(20, 35, 10), duration: 15000, easing: this.easeInOutCubic },
      { position: new THREE.Vector3(-60, 50, 80), target: new THREE.Vector3(-30, 35, 20), duration: 18000, easing: this.easeInOutCubic },
      { position: new THREE.Vector3(100, 70, -50), target: new THREE.Vector3(50, 35, -20), duration: 22000, easing: this.easeInOutCubic },
    ];
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  async initialize(): Promise<void> {
    await this.setupEnvironment();
    await this.spawnAmbientCreatures();
    this.setupCamera();
  }

  private async setupEnvironment(): Promise<void> {
    this.createSkyDome();
    this.createSunLight();
    this.ambientLight = new THREE.AmbientLight(0x405060, 0.5);
    this.scene.add(this.ambientLight);
    this.scene.fog = new THREE.FogExp2(this.fogColor, 0.002);
    this.ensureTerrainLoaded();
  }

  private createSkyDome(): void {
    const geometry = new THREE.SphereGeometry(5000, 32, 16);
    geometry.scale(-1, 1, 1);
    const vertexShader = `varying vec3 vWorldPosition; void main() { vec4 worldPos = modelMatrix * vec4(position, 1.0); vWorldPosition = worldPos.xyz; gl_Position = projectionMatrix * viewMatrix * worldPos; }`;
    const fragmentShader = `uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 bottomColor; varying vec3 vWorldPosition; void main() { float h = normalize(vWorldPosition).y; vec3 color; if (h > 0.0) { color = mix(horizonColor, topColor, h * 2.0); } else { color = mix(bottomColor, horizonColor, h + 1.0); } gl_FragColor = vec4(color, 1.0); }`;
    const material = new THREE.ShaderMaterial({
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
    this.skyMesh = new THREE.Mesh(geometry, material);
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
    this.scene.add(this.sunLight.target);
  }

  private ensureTerrainLoaded(): void {
    const radius = 3;
    for (let z = -radius; z <= radius; z++) {
      for (let x = -radius; x <= radius; x++) {
        this.terrainSystem.getOrCreateChunk(x * WORLD_CONFIG.chunkSize, z * WORLD_CONFIG.chunkSize);
      }
    }
    this.terrainSystem.update(0);
  }

  private async spawnAmbientCreatures(): Promise<void> {
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
    const bodyGeo = new THREE.CapsuleGeometry(0.6, 1.2, 8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.1 + Math.random() * 0.1, 0.5, 0.4), roughness: 0.8 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), bodyMat);
    head.position.set(0, 1.8, 0.7);
    head.castShadow = true;
    group.add(head);
    const legGeo = new THREE.CylinderGeometry(0.1, 0.15, 1.2, 6);
    const legPositions: [number, number][] = [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]];
    for (const [lx, lz] of legPositions) {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(lx, 0.3, lz);
      leg.castShadow = true;
      group.add(leg);
    }
    group.userData = {
      wanderAngle: Math.random() * Math.PI * 2,
      wanderRadius: 15 + Math.random() * 20,
      homePosition: new THREE.Vector3(x, y, z),
      speed: 1.5 + Math.random(),
      state: 'idle' as 'idle' | 'walk',
      stateTimer: 0,
    };
    return group;
  }

  private setupCamera(): void {
    const first = this.cameraPaths[0];
    if (!first) return;
    this.camera.position.copy(first.position);
    this.camera.lookAt(first.target);
  }

  update(dt: number): void {
    if (!this.isActive) return;
    this.updateCamera(dt);
    this.updateCreatures(dt);
    this.updateEnvironment(dt);
    this.updateSunPosition();
  }

  private updateCamera(dt: number): void {
    const current = this.cameraPaths[this.currentPathIndex];
    if (!current) return;

    const next = this.cameraPaths[this.currentPathIndex + 1];
    if (!next) {
      this.camera.position.copy(current.position);
      this.camera.lookAt(current.target);
      return;
    }

    this.pathProgress = Math.min(1, this.pathProgress + dt / (current.duration / 1000));
    const t = current.easing ? current.easing(this.pathProgress) : this.pathProgress;
    this.camera.position.lerpVectors(current.position, next.position, t);
    this.camera.lookAt(new THREE.Vector3().lerpVectors(current.target, next.target, t));

    if (this.pathProgress >= 1) {
      this.currentPathIndex++;
      this.pathProgress = 0;
    }
  }

  private updateCreatures(dt: number): void {
    for (const creature of this.ambientCreatures) {
      const data = creature.userData;
      data.stateTimer -= dt;
      if (data.state === 'idle') {
        if (data.stateTimer <= 0) {
          data.state = 'walk';
          data.wanderAngle = Math.random() * Math.PI * 2;
          data.stateTimer = 3 + Math.random() * 5;
        }
        creature.position.y = data.homePosition.y + Math.sin(performance.now() * 0.001 + creature.position.x) * 0.05;
      } else {
        const targetX = data.homePosition.x + Math.cos(data.wanderAngle) * data.wanderRadius;
        const targetZ = data.homePosition.z + Math.sin(data.wanderAngle) * data.wanderRadius;
        const dx = targetX - creature.position.x;
        const dz = targetZ - creature.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 1) {
          const moveX = dx / dist * data.speed * dt;
          const moveZ = dz / dist * data.speed * dt;
          creature.position.x += moveX;
          creature.position.z += moveZ;
          creature.position.y = this.terrainSystem.getHeightAtWorld(creature.position.x, creature.position.z) + 0.5;
          creature.rotation.y = THREE.MathUtils.lerp(creature.rotation.y, Math.atan2(moveX, moveZ), 0.1);
        } else {
          data.state = 'idle';
          data.stateTimer = 2 + Math.random() * 4;
        }
      }
    }
  }

  private updateEnvironment(dt: number): void {
    this.timeOfDay = (this.timeOfDay + this.dayCycleSpeed * dt) % 1;
  }

  private updateSunPosition(): void {
    if (!this.sunLight) return;
    const angle = this.timeOfDay * Math.PI * 2 - Math.PI / 2;
    const height = Math.sin(angle) * 200 + 100;
    const radius = Math.cos(angle) * 200;
    this.sunLight.position.set(Math.cos(this.timeOfDay * Math.PI * 2) * radius, height, Math.sin(this.timeOfDay * Math.PI * 2) * radius);
    this.sunLight.target.position.set(0, 35, 0);
    this.sunLight.intensity = Math.max(0.3, Math.sin(angle + Math.PI / 2)) * 1.5;
  }

  activate(): void {
    this.isActive = true;
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
    for (const creature of this.ambientCreatures) {
      creature.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(material => material.dispose());
          else obj.material.dispose();
        }
      });
      this.scene.remove(creature);
    }
    this.ambientCreatures.length = 0;
    if (this.skyMesh) {
      this.skyMesh.geometry.dispose();
      (this.skyMesh.material as THREE.Material).dispose();
      this.scene.remove(this.skyMesh);
      this.skyMesh = null;
    }
    if (this.sunLight) this.scene.remove(this.sunLight);
    if (this.ambientLight) this.scene.remove(this.ambientLight);
  }
}
