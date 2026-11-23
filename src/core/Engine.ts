// ChimeraLand - Core Engine
// Main game loop, time management, input handling

import { World } from './Entity';
import { System } from './System';
import { EventBus, GameEvents, emitEvent } from './EventBus';
import { Vec3, FIXED_DT, GRAVITY } from './MathUtils';
import { GameConfig, MovementState } from './Config';
import { InputComponent } from './Component';

export class Engine {
    static instance: Engine | null = null;
    world: World;
    running: boolean = false;
    paused: boolean = false;

    // Time
    time: number = 0;
    deltaTime: number = 0;
    fixedTime: number = 0;
    fixedDeltaTime: number = FIXED_DT;
    frameCount: number = 0;
    timeScale: number = 1;
    maxDeltaTime: number = 0.1;

    // Input
    input: InputComponent = new InputComponent();
    previousInput: InputComponent = new InputComponent();

    // Systems
    private systems: System[] = [];

    // Callbacks
    onUpdate: ((dt: number) => void) | null = null;
    onFixedUpdate: ((dt: number) => void) | null = null;
    onLateUpdate: ((dt: number) => void) | null = null;

    constructor() {
        if (Engine.instance) throw new Error('Engine is singleton');
        Engine.instance = this;
        this.world = new World();
        this.setupCoreSystems();
    }

    static getInstance(): Engine {
        if (!Engine.instance) Engine.instance = new Engine();
        return Engine.instance;
    }

    private setupCoreSystems(): void {
        // Systems will be added by game initialization
    }

    // Main loop
    start(): void {
        if (this.running) return;
        this.running = true;
        this.time = performance.now() / 1000;
        this.gameLoop();
    }

    stop(): void { this.running = false; }
    pause(): void { this.paused = true; }
    resume(): void { this.paused = false; }

    private lastFrameTime: number = 0;
    private accumulator: number = 0;

    private gameLoop(): void {
        if (!this.running) return;

        const now = performance.now() / 1000;
        let frameTime = now - this.lastFrameTime;
        this.lastFrameTime = now;

        if (frameTime > this.maxDeltaTime) frameTime = this.maxDeltaTime;
        frameTime *= this.timeScale;

        this.deltaTime = frameTime;
        this.time += frameTime;
        this.frameCount++;

        // Input update
        this.updateInput();

        // Fixed timestep accumulation
        this.accumulator += frameTime;
        while (this.accumulator >= this.fixedDeltaTime) {
            this.fixedUpdate(this.fixedDeltaTime);
            this.accumulator -= this.fixedDeltaTime;
            this.fixedTime += this.fixedDeltaTime;
        }

        // Variable update
        if (!this.paused) {
            this.update(frameTime);
        }

        // Late update
        if (!this.paused) {
            this.lateUpdate(frameTime);
        }

        // World ECS update
        this.world.update(frameTime);
        this.world.fixedUpdate(this.fixedDeltaTime);

        // Input state reset for pressed/released
        this.resetInputState();

        requestAnimationFrame(() => this.gameLoop());
    }

    private updateInput(): void {
        // Store previous frame input for pressed/released detection
        this.previousInput.move.copyFrom(this.input.move);
        this.previousInput.look.copyFrom(this.input.look);
        this.previousInput.jump = this.input.jump;
        this.previousInput.dash = this.input.dash;
        this.previousInput.attack = this.input.attack;
        this.previousInput.skill1 = this.input.skill1;
        this.previousInput.skill2 = this.input.skill2;
        this.previousInput.skill3 = this.input.skill3;
        this.previousInput.ultimate = this.input.ultimate;
        this.previousInput.swapWeapon = this.input.swapWeapon;
        this.previousInput.interact = this.input.interact;
        this.previousInput.buildMode = this.input.buildMode;
    }

    private resetInputState(): void {
        this.input.jumpPressed = this.input.jump && !this.previousInput.jump;
        this.input.jumpReleased = !this.input.jump && this.previousInput.jump;
        this.input.dashPressed = this.input.dash && !this.previousInput.dash;
        this.input.attackPressed = this.input.attack && !this.previousInput.attack;
        this.input.attackHeld = this.input.attack && this.previousInput.attack;
        if (this.input.attackHeld) this.input.attackHoldTime += this.deltaTime;
        else this.input.attackHoldTime = 0;

        this.input.skill1Pressed = this.input.skill1 && !this.previousInput.skill1;
        this.input.skill2Pressed = this.input.skill2 && !this.previousInput.skill2;
        this.input.skill3Pressed = this.input.skill3 && !this.previousInput.skill3;
        this.input.ultimatePressed = this.input.ultimate && !this.previousInput.ultimate;
        this.input.interactPressed = this.input.interact && !this.previousInput.interact;
        this.input.buildModePressed = this.input.buildMode && !this.previousInput.buildMode;

        // swapWeapon is consumed immediately
        this.input.swapWeapon = -1;
    }

    update(dt: number): void {
        if (this.onUpdate) this.onUpdate(dt);
        emitEvent(GameEvents.TIME_CHANGED, { time: this.time, dt });
    }

    fixedUpdate(dt: number): void {
        if (this.onFixedUpdate) this.onFixedUpdate(dt);
    }

    lateUpdate(dt: number): void {
        if (this.onLateUpdate) this.onLateUpdate(dt);
    }

    // System management
    addSystem(system: System): void {
        this.world.addSystem(system);
    }

    removeSystem(system: System): void {
        this.world.removeSystem(system);
    }

    getSystem<T extends System>(ctor: new (...args: any[]) => T): T | null {
        return this.world.getSystem(ctor);
    }

    // Entity management
    spawn(entity: any): any { return this.world.spawn(entity); }
    despawn(entity: any): void { this.world.despawn(entity); }

    // Time control
    setTimeScale(scale: number): void { this.timeScale = Math.max(0, scale); }
    getTimeScale(): number { return this.timeScale; }

    // Input helpers
    isKeyPressed(key: string): boolean {
        // Implementation depends on platform
        return false;
    }

    getMouseDelta(): Vec3 { return this.input.look; }
    getMoveInput(): Vec3 { return this.input.move; }

    // Debug
    getStats(): object {
        return {
            fps: Math.round(1 / this.deltaTime),
            frameTime: this.deltaTime * 1000,
            entities: this.world.entities.size,
            systems: this.systems.length,
            time: this.time,
            timeScale: this.timeScale,
        };
    }
}

// Input Manager for platform-specific input
export class InputManager {
    private keys: Map<string, boolean> = new Map();
    private keysPressed: Set<string> = new Set();
    private keysReleased: Set<string> = new Set();
    private mouseX: number = 0;
    private mouseY: number = 0;
    private mouseDeltaX: number = 0;
    private mouseDeltaY: number = 0;
    private gamepadIndex: number = 0;

    constructor() {
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => this.onKeyDown(e));
            window.addEventListener('keyup', (e) => this.onKeyUp(e));
            window.addEventListener('mousemove', (e) => this.onMouseMove(e));
            window.addEventListener('mousedown', (e) => this.onMouseDown(e));
            window.addEventListener('mouseup', (e) => this.onMouseUp(e));
            window.addEventListener('wheel', (e) => this.onWheel(e));
            window.addEventListener('gamepadconnected', (e) => this.onGamepadConnected(e));
            window.addEventListener('gamepaddisconnected', (e) => this.onGamepadDisconnected(e));
        }
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (!this.keys.get(e.code)) {
            this.keysPressed.add(e.code);
        }
        this.keys.set(e.code, true);
        e.preventDefault();
    }

    private onKeyUp(e: KeyboardEvent): void {
        this.keys.set(e.code, false);
        this.keysReleased.add(e.code);
    }

    private onMouseMove(e: MouseEvent): void {
        this.mouseDeltaX = e.movementX;
        this.mouseDeltaY = e.movementY;
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
    }

    private onMouseDown(e: MouseEvent): void {
        this.keys.set(`Mouse${e.button}`, true);
        this.keysPressed.add(`Mouse${e.button}`);
    }

    private onMouseUp(e: MouseEvent): void {
        this.keys.set(`Mouse${e.button}`, false);
        this.keysReleased.add(`Mouse${e.button}`);
    }

    private onWheel(e: WheelEvent): void {
        this.keys.set('Wheel', e.deltaY > 0);
    }

    private onGamepadConnected(e: GamepadEvent): void {
        console.log('Gamepad connected:', e.gamepad.id);
    }

    private onGamepadDisconnected(e: GamepadEvent): void {
        console.log('Gamepad disconnected');
    }

    update(engineInput: InputComponent): void {
        // Keyboard movement
        const move = new Vec3();
        if (this.isKeyDown('KeyW') || this.isKeyDown('ArrowUp')) move.z -= 1;
        if (this.isKeyDown('KeyS') || this.isKeyDown('ArrowDown')) move.z += 1;
        if (this.isKeyDown('KeyA') || this.isKeyDown('ArrowLeft')) move.x -= 1;
        if (this.isKeyDown('KeyD') || this.isKeyDown('ArrowRight')) move.x += 1;
        if (move.lengthSq() > 1) move.normalize();
        engineInput.move.copyFrom(move);

        // Mouse look
        engineInput.look.set(this.mouseDeltaX * 0.002, -this.mouseDeltaY * 0.002, 0);
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;

        // Actions
        engineInput.jump = this.isKeyDown('Space');
        engineInput.dash = this.isKeyDown('ShiftLeft') || this.isKeyDown('ControlLeft');
        engineInput.attack = this.isKeyDown('Mouse0');
        engineInput.skill1 = this.isKeyDown('Digit1') || this.isKeyDown('KeyQ');
        engineInput.skill2 = this.isKeyDown('Digit2') || this.isKeyDown('KeyE');
        engineInput.skill3 = this.isKeyDown('Digit3') || this.isKeyDown('KeyR');
        engineInput.ultimate = this.isKeyDown('KeyF') || this.isKeyDown('Mouse1');
        engineInput.interact = this.isKeyDown('KeyE') || this.isKeyDown('KeyF');
        engineInput.buildMode = this.isKeyDown('KeyB') || this.isKeyDown('Tab');

        // Weapon swap
        if (this.wasKeyPressed('KeyQ')) engineInput.swapWeapon = 0;
        else if (this.wasKeyPressed('KeyE')) engineInput.swapWeapon = 1;
        else if (this.wasKeyPressed('KeyR')) engineInput.swapWeapon = 2;

        // Gamepad
        this.updateGamepad(engineInput);

        // Clear pressed/released
        this.keysPressed.clear();
        this.keysReleased.clear();
    }

    private updateGamepad(input: InputComponent): void {
        const gamepads = navigator.getGamepads();
        const gp = gamepads[this.gamepadIndex];
        if (!gp) return;

        const deadzone = GameConfig.INPUT.GAMEPAD_DEADZONE;
        const lx = gp.axes[0], ly = gp.axes[1];
        const rx = gp.axes[2], ry = gp.axes[3];

        if (Math.abs(lx) > deadzone || Math.abs(ly) > deadzone) {
            input.move.set(lx, 0, -ly);
        }
        if (Math.abs(rx) > deadzone || Math.abs(ry) > deadzone) {
            input.look.set(rx * 2, -ry * 2, 0);
        }

        input.jump = gp.buttons[0]?.pressed || false; // A
        input.dash = gp.buttons[1]?.pressed || false; // B
        input.attack = gp.buttons[2]?.pressed || false; // X
        input.skill1 = gp.buttons[3]?.pressed || false; // Y
        input.skill2 = gp.buttons[4]?.pressed || false; // LB
        input.skill3 = gp.buttons[5]?.pressed || false; // RB
        input.ultimate = gp.buttons[6]?.pressed || false; // LT
        input.interact = gp.buttons[7]?.pressed || false; // RT
        input.buildMode = gp.buttons[9]?.pressed || false; // Start
    }

    isKeyDown(code: string): boolean { return this.keys.get(code) === true; }
    wasKeyPressed(code: string): boolean { return this.keysPressed.has(code); }
    wasKeyReleased(code: string): boolean { return this.keysReleased.has(code); }

    getMousePosition(): Vec3 { return new Vec3(this.mouseX, this.mouseY, 0); }
    setMousePosition(x: number, y: number): void { this.mouseX = x; this.mouseY = y; }
}

// Touch Input for Mobile
export class TouchInputManager {
    private touches: Map<number, TouchPoint> = new Map();
    private joystick: VirtualJoystick | null = null;
    private buttons: Map<string, TouchButton> = new Map();

    constructor() {
        this.setupTouchEvents();
    }

    private setupTouchEvents(): void {
        if (typeof window !== 'undefined') {
            window.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
            window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
            window.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
            window.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
        }
    }

    private onTouchStart(e: TouchEvent): void {
        for (const touch of e.changedTouches) {
            this.touches.set(touch.identifier, {
                id: touch.identifier,
                startX: touch.clientX,
                startY: touch.clientY,
                currentX: touch.clientX,
                currentY: touch.clientY,
                startTime: Date.now(),
            });
        }
        e.preventDefault();
    }

    private onTouchMove(e: TouchEvent): void {
        for (const touch of e.changedTouches) {
            const tp = this.touches.get(touch.identifier);
            if (tp) {
                tp.currentX = touch.clientX;
                tp.currentY = touch.clientY;
            }
        }
        e.preventDefault();
    }

    private onTouchEnd(e: TouchEvent): void {
        for (const touch of e.changedTouches) {
            this.touches.delete(touch.identifier);
        }
        e.preventDefault();
    }

    update(engineInput: InputComponent): void {
        // Process virtual joystick
        if (this.joystick) {
            this.joystick.update(this.touches);
            engineInput.move.set(this.joystick.deltaX, 0, -this.joystick.deltaY);
        }

        // Process touch buttons
        for (const [name, button] of this.buttons) {
            button.update(this.touches);
            if (button.pressed) {
                switch (name) {
                    case 'jump': engineInput.jump = true; break;
                    case 'dash': engineInput.dash = true; break;
                    case 'attack': engineInput.attack = true; break;
                    case 'skill1': engineInput.skill1 = true; break;
                    case 'skill2': engineInput.skill2 = true; break;
                    case 'skill3': engineInput.skill3 = true; break;
                    case 'ultimate': engineInput.ultimate = true; break;
                    case 'interact': engineInput.interact = true; break;
                    case 'swap': engineInput.swapWeapon = (engineInput.swapWeapon + 1) % 3; break;
                    case 'build': engineInput.buildMode = true; break;
                }
            }
        }
    }

    createJoystick(x: number, y: number, size: number = 120): VirtualJoystick {
        this.joystick = new VirtualJoystick(x, y, size);
        return this.joystick;
    }

    createButton(name: string, x: number, y: number, size: number = 64): TouchButton {
        const btn = new TouchButton(name, x, y, size);
        this.buttons.set(name, btn);
        return btn;
    }
}

interface TouchPoint {
    id: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    startTime: number;
}

export class VirtualJoystick {
    x: number; y: number; size: number;
    active: boolean = false;
    activeTouchId: number | null = null;
    deltaX: number = 0;
    deltaY: number = 0;
    private deadzone: number = 0.15;

    constructor(x: number, y: number, size: number) {
        this.x = x; this.y = y; this.size = size;
    }

    update(touches: Map<number, TouchPoint>): void {
        this.deltaX = 0; this.deltaY = 0;
        this.active = false;

        for (const [id, touch] of touches) {
            const dx = touch.currentX - this.x;
            const dy = touch.currentY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (!this.active && dist < this.size) {
                this.active = true;
                this.activeTouchId = id;
            }

            if (this.active && id === this.activeTouchId) {
                if (dist > this.size) {
                    this.active = false;
                    this.activeTouchId = null;
                } else {
                    const normX = dx / this.size;
                    const normY = dy / this.size;
                    const mag = Math.sqrt(normX * normX + normY * normY);
                    if (mag > this.deadzone) {
                        this.deltaX = normX / mag * (mag - this.deadzone) / (1 - this.deadzone);
                        this.deltaY = normY / mag * (mag - this.deadzone) / (1 - this.deadzone);
                    }
                }
            }
        }
    }
}

export class TouchButton {
    name: string;
    x: number; y: number; size: number;
    pressed: boolean = false;
    justPressed: boolean = false;
    private activeTouchId: number | null = null;

    constructor(name: string, x: number, y: number, size: number) {
        this.name = name; this.x = x; this.y = y; this.size = size;
    }

    update(touches: Map<number, TouchPoint>): void {
        this.justPressed = false;

        for (const [id, touch] of touches) {
            const dx = touch.currentX - this.x;
            const dy = touch.currentY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (!this.pressed && dist < this.size / 2) {
                this.pressed = true;
                this.justPressed = true;
                this.activeTouchId = id;
            } else if (this.pressed && id === this.activeTouchId) {
                if (dist > this.size / 2) {
                    this.pressed = false;
                    this.activeTouchId = null;
                }
            }
        }

        if (this.activeTouchId !== null && !touches.has(this.activeTouchId)) {
            this.pressed = false;
            this.activeTouchId = null;
        }
    }
}