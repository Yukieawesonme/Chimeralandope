// ChimeraLand - HitStop System
// Frame-perfect hitpause for game feel (hitstop/hitlag)

import { EventBus, GameEvents, emitEvent } from '../core/EventBus';
import { GameConfig } from '../core/Config';

export class HitStop {
    private static instance: HitStop;
    private active: boolean = false;
    private duration: number = 0;
    private elapsed: number = 0;
    private affectedEntities: Set<any> = new Set();
    private globalTimeScale: number = 1;
    private onCompleteCallbacks: (() => void)[] = [];

    static getInstance(): HitStop {
        if (!HitStop.instance) HitStop.instance = new HitStop();
        return HitStop.instance;
    }

    // Trigger hitstop for specific entities (attacker, target)
    trigger(entities: any[], duration: number, timeScale: number = 0): void {
        if (duration <= 0) return;

        this.active = true;
        this.duration = duration;
        this.elapsed = 0;
        this.globalTimeScale = timeScale;
        this.affectedEntities.clear();

        for (const entity of entities) {
            if (entity && entity.isActive?.()) {
                this.affectedEntities.add(entity);
                entity.hitstopActive = true;
                entity.previousTimeScale = entity.timeScale || 1;
                entity.timeScale = timeScale;
            }
        }

        // Global time scale for camera shake sync
        emitEvent(GameEvents.UI_HITSTOP, { duration, timeScale, entities: entities.length });
    }

    // Trigger with preset based on hit weight
    triggerLight(attacker: any, target: any): void {
        this.trigger([attacker, target], GameConfig.COMBAT.HITSTOP_LIGHT, 0.05);
    }

    triggerMedium(attacker: any, target: any): void {
        this.trigger([attacker, target], GameConfig.COMBAT.HITSTOP_MEDIUM, 0.02);
    }

    triggerHeavy(attacker: any, target: any): void {
        this.trigger([attacker, target], GameConfig.COMBAT.HITSTOP_HEAVY, 0);
    }

    triggerCritical(attacker: any, target: any): void {
        this.trigger([attacker, target], GameConfig.COMBAT.HITSTOP_CRITICAL, 0);
    }

    update(dt: number): void {
        if (!this.active) return;

        this.elapsed += dt;

        if (this.elapsed >= this.duration) {
            this.end();
        }
    }

    private end(): void {
        this.active = false;

        // Restore entity time scales
        for (const entity of this.affectedEntities) {
            if (entity && entity.isActive?.()) {
                entity.hitstopActive = false;
                entity.timeScale = entity.previousTimeScale || 1;
            }
        }
        this.affectedEntities.clear();

        // Execute callbacks
        for (const cb of this.onCompleteCallbacks) {
            try { cb(); } catch (e) { console.error('HitStop callback error:', e); }
        }
        this.onCompleteCallbacks.length = 0;
    }

    onComplete(callback: () => void): void {
        this.onCompleteCallbacks.push(callback);
    }

    isActive(): boolean { return this.active; }
    getProgress(): number { return this.active ? this.elapsed / this.duration : 0; }
    getRemainingTime(): number { return this.active ? this.duration - this.elapsed : 0; }

    // Force end early
    cancel(): void {
        if (this.active) this.end();
    }
}

// Screen Shake System
export class CameraShake {
    private static instance: CameraShake;
    private trauma: number = 0;
    private shakeOffset: { x: number; y: number; z: number; pitch: number; yaw: number; roll: number } = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };
    private frequency: number = GameConfig.CAMERA.SHAKE_FREQUENCY;
    private amplitude: number = GameConfig.CAMERA.SHAKE_AMPLITUDE;
    private decay: number = GameConfig.CAMERA.SHAKE_TRAUMA_DECAY;
    private seed: number = Math.random() * 1000;

    static getInstance(): CameraShake {
        if (!CameraShake.instance) CameraShake.instance = new CameraShake();
        return CameraShake.instance;
    }

    // Add trauma (0-1), accumulates
    addTrauma(amount: number): void {
        this.trauma = Math.min(1, this.trauma + amount);
        emitEvent(GameEvents.UI_SCREEN_SHAKE, { trauma: this.trauma });
    }

    // Impulse shake (one-time)
    impulse(intensity: number, frequency: number = 25): void {
        this.trauma = Math.min(1, this.trauma + intensity * 0.3);
        this.frequency = frequency;
    }

    // Preset shakes
    light(): void { this.addTrauma(0.1); }
    medium(): void { this.addTrauma(0.3); }
    heavy(): void { this.addTrauma(0.6); }
    critical(): void { this.addTrauma(1.0); }
    explosion(radius: number, distance: number): void {
        const falloff = Math.max(0, 1 - distance / radius);
        this.addTrauma(0.8 * falloff);
    }

    update(dt: number): void {
        if (this.trauma <= 0) {
            this.shakeOffset = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };
            return;
        }

        // Decay trauma
        this.trauma = Math.max(0, this.trauma - this.decay * dt);

        // Calculate shake based on trauma^2 for more natural feel
        const shakeAmount = this.trauma * this.trauma;
        const t = Date.now() * 0.001 * this.frequency + this.seed;

        // Perlin-like noise using sine waves
        const noise1 = Math.sin(t * 1.3) * 0.5 + Math.sin(t * 2.7) * 0.3 + Math.sin(t * 4.1) * 0.2;
        const noise2 = Math.sin(t * 1.7 + 100) * 0.5 + Math.sin(t * 3.1 + 100) * 0.3 + Math.sin(t * 5.3 + 100) * 0.2;
        const noise3 = Math.sin(t * 2.3 + 200) * 0.5 + Math.sin(t * 3.7 + 200) * 0.3 + Math.sin(t * 6.1 + 200) * 0.2;

        this.shakeOffset.x = noise1 * shakeAmount * this.amplitude;
        this.shakeOffset.y = noise2 * shakeAmount * this.amplitude;
        this.shakeOffset.z = noise3 * shakeAmount * this.amplitude * 0.5;
        this.shakeOffset.pitch = noise1 * shakeAmount * 0.02;
        this.shakeOffset.yaw = noise2 * shakeAmount * 0.02;
        this.shakeOffset.roll = noise3 * shakeAmount * 0.01;
    }

    getOffset(): { x: number; y: number; z: number; pitch: number; yaw: number; roll: number } {
        return { ...this.shakeOffset };
    }

    getTrauma(): number { return this.trauma; }
    setDecay(decay: number): void { this.decay = decay; }
    setFrequency(freq: number): void { this.frequency = freq; }
    setAmplitude(amp: number): void { this.amplitude = amp; }
    reset(): void { this.trauma = 0; this.shakeOffset = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 }; }
}

// HitStop integration helper for entities
export interface IHitStoppable {
    hitstopActive: boolean;
    timeScale: number;
    previousTimeScale: number;
    isActive(): boolean;
}

export function applyHitStop(entity: IHitStoppable, duration: number, timeScale: number = 0): void {
    entity.hitstopActive = true;
    entity.previousTimeScale = entity.timeScale;
    entity.timeScale = timeScale;

    setTimeout(() => {
        if (entity.isActive?.()) {
            entity.hitstopActive = false;
            entity.timeScale = entity.previousTimeScale;
        }
    }, duration * 1000);
}