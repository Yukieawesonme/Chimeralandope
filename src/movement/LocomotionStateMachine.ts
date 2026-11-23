// ChimeraLand - Locomotion State Machine
// Advanced movement: walk, run, dash, jump, climb, glide, swim, dive

import { EventBus, GameEvents, emitEvent } from '../core/EventBus';
import { GameConfig, MovementState } from '../core/Config';
import { Vec3, Quat } from '../core/MathUtils';
import { Engine } from '../core/Engine';

export abstract class LocomotionState {
    name: MovementState;
    controller: PlayerController | null = null;
    priority: number = 0;

    constructor(name: MovementState) { this.name = name; }

    enter(controller: PlayerController): void { this.controller = controller; }
    exit(): void {}
    update(dt: number): void {}
    fixedUpdate(dt: number): void {}
    handleInput(input: any): boolean { return false; }
    canTransitionTo(state: MovementState): boolean { return true; }
    getAnimation(): string { return this.name; }
}

export class IdleState extends LocomotionState {
    constructor() { super(MovementState.IDLE); }
    update(dt: number): void {
        const ctrl = this.controller!;
        const input = Engine.getInstance().input;

        if (input.move.lengthSq() > 0.01) {
            if (input.dash && ctrl.stamina.canAfford(GameConfig.PLAYER.STAMINA_MAX * 0.2)) {
                ctrl.requestState(MovementState.DASH);
            } else if (ctrl.isSprinting) {
                ctrl.requestState(MovementState.RUN);
            } else {
                ctrl.requestState(MovementState.WALK);
            }
        }
        if (input.jumpPressed && ctrl.isGrounded) {
            ctrl.requestState(MovementState.JUMP);
        }
    }
}

export class WalkState extends LocomotionState {
    constructor() { super(MovementState.WALK); }
    enter(controller: PlayerController): void {
        super.enter(controller);
        controller.targetSpeed = GameConfig.PLAYER.WALK_SPEED;
    }
    update(dt: number): void {
        const ctrl = this.controller!;
        const input = Engine.getInstance().input;

        if (input.move.lengthSq() < 0.01) {
            ctrl.requestState(MovementState.IDLE);
        } else if (input.dash && ctrl.stamina.canAfford(GameConfig.PLAYER.STAMINA_MAX * 0.2)) {
            ctrl.requestState(MovementState.DASH);
        } else if (ctrl.isSprinting && ctrl.stamina.canAfford(5 * dt)) {
            ctrl.requestState(MovementState.RUN);
        }
        if (input.jumpPressed && ctrl.isGrounded) {
            ctrl.requestState(MovementState.JUMP);
        }
    }
    fixedUpdate(dt: number): void {
        this.controller!.moveCharacter(this.controller!.targetSpeed);
    }
}

export class RunState extends LocomotionState {
    constructor() { super(MovementState.RUN); }
    enter(controller: PlayerController): void {
        super.enter(controller);
        controller.targetSpeed = GameConfig.PLAYER.RUN_SPEED;
    }
    update(dt: number): void {
        const ctrl = this.controller!;
        const input = Engine.getInstance().input;

        if (input.move.lengthSq() < 0.01) {
            ctrl.requestState(MovementState.IDLE);
        } else if (input.dash && ctrl.stamina.canAfford(GameConfig.PLAYER.STAMINA_MAX * 0.2)) {
            ctrl.requestState(MovementState.DASH);
        } else if (!ctrl.isSprinting || !ctrl.stamina.canAfford(5 * dt)) {
            ctrl.requestState(MovementState.WALK);
        }
        if (input.jumpPressed && ctrl.isGrounded) {
            ctrl.requestState(MovementState.JUMP);
        }
        // Consume stamina
        ctrl.stamina.consume(8 * dt);
    }
    fixedUpdate(dt: number): void {
        this.controller!.moveCharacter(this.controller!.targetSpeed);
    }
}

export class DashState extends LocomotionState {
    private dashDirection: Vec3 = new Vec3();
    private dashTimer: number = 0;
    private iframeTimer: number = 0;

    constructor() { super(MovementState.DASH); priority = 10; }

    enter(controller: PlayerController): void {
        super.enter(controller);
        const input = Engine.getInstance().input;

        // Determine dash direction
        if (input.move.lengthSq() > 0.01) {
            this.dashDirection.copyFrom(input.move).normalize();
        } else {
            this.dashDirection.copyFrom(controller.transform.getForward());
        }

        this.dashTimer = GameConfig.PLAYER.DASH_DURATION;
        this.iframeTimer = GameConfig.PLAYER.DASH_IFRAMES;

        // Consume stamina
        controller.stamina.consume(GameConfig.PLAYER.STAMINA_MAX * 0.2);

        // Apply dash impulse
        controller.velocity.velocity.set(
            this.dashDirection.x * GameConfig.PLAYER.DASH_DISTANCE / GameConfig.PLAYER.DASH_DURATION,
            controller.velocity.velocity.y,
            this.dashDirection.z * GameConfig.PLAYER.DASH_DISTANCE / GameConfig.PLAYER.DASH_DURATION
        );

        // Grant i-frames
        controller.invulnerable = true;

        emitEvent(GameEvents.DASH_PERFORMED, { direction: this.dashDirection.copy() });
    }

    exit(): void {
        this.controller!.invulnerable = false;
    }

    update(dt: number): void {
        this.dashTimer -= dt;
        this.iframeTimer -= dt;

        if (this.iframeTimer <= 0) {
            this.controller!.invulnerable = false;
        }

        if (this.dashTimer <= 0) {
            if (this.controller!.isGrounded) {
                this.controller!.requestState(MovementState.IDLE);
            } else {
                this.controller!.requestState(MovementState.FALL);
            }
        }
    }

    handleInput(input: any): boolean {
        // Can't cancel dash except by getting hit
        return true;
    }
}

export class JumpState extends LocomotionState {
    private hasDoubleJumped: boolean = false;

    constructor() { super(MovementState.JUMP); priority = 5; }

    enter(controller: PlayerController): void {
        super.enter(controller);
        controller.velocity.velocity.y = GameConfig.PLAYER.JUMP_FORCE;
        controller.isGrounded = false;
        this.hasDoubleJumped = false;
    }

    update(dt: number): void {
        const ctrl = this.controller!;
        const input = Engine.getInstance().input;

        // Double jump
        if (input.jumpPressed && !this.hasDoubleJumped && !ctrl.isGrounded) {
            this.hasDoubleJumped = true;
            ctrl.requestState(MovementState.DOUBLE_JUMP);
            return;
        }

        // Check for climb
        if (!ctrl.isGrounded && ctrl.checkClimbable()) {
            ctrl.requestState(MovementState.CLIMB);
            return;
        }

        // Check for glide
        if (!ctrl.isGrounded && input.jump && ctrl.velocity.velocity.y < 0 && ctrl.stamina.current > 10) {
            ctrl.requestState(MovementState.GLIDE);
            return;
        }

        // Transition to fall
        if (ctrl.velocity.velocity.y < -0.5) {
            ctrl.requestState(MovementState.FALL);
        }
    }

    fixedUpdate(dt: number): void {
        this.controller!.applyGravity();
        this.controller!.moveCharacter(this.controller!.targetSpeed * 0.5);
    }
}

export class DoubleJumpState extends LocomotionState {
    constructor() { super(MovementState.DOUBLE_JUMP); priority = 5; }

    enter(controller: PlayerController): void {
        super.enter(controller);
        controller.velocity.velocity.y = GameConfig.PLAYER.DOUBLE_JUMP_FORCE;
    }

    update(dt: number): void {
        const ctrl = this.controller!;

        if (ctrl.checkClimbable()) {
            ctrl.requestState(MovementState.CLIMB);
            return;
        }

        if (ctrl.velocity.velocity.y < -0.5) {
            ctrl.requestState(MovementState.FALL);
        }
    }

    fixedUpdate(dt: number): void {
        this.controller!.applyGravity();
        this.controller!.moveCharacter(this.controller!.targetSpeed * 0.5);
    }
}

export class FallState extends LocomotionState {
    constructor() { super(MovementState.FALL); }

    update(dt: number): void {
        const ctrl = this.controller!;

        if (ctrl.isGrounded) {
            ctrl.requestState(MovementState.LAND);
            return;
        }

        if (ctrl.checkClimbable()) {
            ctrl.requestState(MovementState.CLIMB);
            return;
        }

        const input = Engine.getInstance().input;
        if (!ctrl.isGrounded && input.jump && ctrl.velocity.velocity.y < 0 && ctrl.stamina.current > 10) {
            ctrl.requestState(MovementState.GLIDE);
            return;
        }
    }

    fixedUpdate(dt: number): void {
        this.controller!.applyGravity();
        this.controller!.moveCharacter(this.controller!.targetSpeed * 0.3);
    }
}

export class LandState extends LocomotionState {
    private landTimer: number = 0;

    constructor() { super(MovementState.LAND); }

    enter(controller: PlayerController): void {
        super.enter(controller);
        this.landTimer = 0.15; // Landing recovery
        controller.isGrounded = true;
        // Calculate fall damage
        const fallHeight = controller.lastGroundY - controller.transform.position.y;
        if (fallHeight > 5) {
            const damage = ctrl.calculateFallDamage(fallHeight);
            ctrl.takeDamage(damage);
        }
    }

    update(dt: number): void {
        this.landTimer -= dt;
        if (this.landTimer <= 0) {
            const input = Engine.getInstance().input;
            if (input.move.lengthSq() > 0.01) {
                this.controller!.requestState(this.controller!.isSprinting ? MovementState.RUN : MovementState.WALK);
            } else {
                this.controller!.requestState(MovementState.IDLE);
            }
        }
    }
}

export class ClimbState extends LocomotionState {
    private climbNormal: Vec3 = new Vec3();
    private climbTimer: number = 0;

    constructor() { super(MovementState.CLIMB); priority = 8; }

    enter(controller: PlayerController): void {
        super.enter(controller);
        const hit = controller.getClimbHit();
        if (hit) {
            this.climbNormal.copyFrom(hit.normal).mul(-1);
            controller.transform.rotation = Quat.lookRotation(this.climbNormal, Vec3.up());
        }
        controller.velocity.velocity.set(0, 0, 0);
        controller.useGravity = false;

        emitEvent(GameEvents.CLIMB_STARTED, {});
    }

    exit(): void {
        this.controller!.useGravity = true;
        emitEvent(GameEvents.CLIMB_ENDED, {});
    }

    update(dt: number): void {
        const ctrl = this.controller!;
        const input = Engine.getInstance().input;

        // Consume stamina
        ctrl.stamina.consume(10 * dt);
        if (ctrl.stamina.current <= 0) {
            ctrl.requestState(MovementState.FALL);
            return;
        }

        // Climb jump
        if (input.jumpPressed) {
            ctrl.velocity.velocity.set(
                ctrl.climbNormal.x * GameConfig.PLAYER.CLIMB_JUMP_FORCE,
                GameConfig.PLAYER.CLIMB_JUMP_FORCE,
                ctrl.climbNormal.z * GameConfig.PLAYER.CLIMB_JUMP_FORCE
            );
            ctrl.requestState(MovementState.CLIMB_JUMP);
            return;
        }

        // Let go
        if (input.dashPressed || input.move.lengthSq() < 0.01) {
            ctrl.requestState(MovementState.FALL);
            return;
        }

        // Move on wall
        const moveInput = new Vec3(input.move.x, input.move.z, 0); // x=horizontal, z=vertical on wall
        if (moveInput.lengthSq() > 0.01) {
            moveInput.normalize();
            const right = ctrl.transform.getRight();
            const up = Vec3.up();
            const moveDir = right.mulled(moveInput.x).add(up.mulled(moveInput.y));
            ctrl.velocity.velocity.copyFrom(moveDir.mulled(GameConfig.PLAYER.CLIMB_SPEED));
        } else {
            ctrl.velocity.velocity.set(0, 0, 0);
        }

        // Check if still climbable
        if (!ctrl.checkClimbable()) {
            ctrl.requestState(MovementState.FALL);
        }
    }
}

export class ClimbJumpState extends LocomotionState {
    constructor() { super(MovementState.CLIMB_JUMP); }

    update(dt: number): void {
        const ctrl = this.controller!;

        if (ctrl.isGrounded) {
            ctrl.requestState(MovementState.LAND);
        } else if (ctrl.velocity.velocity.y < -0.5) {
            ctrl.requestState(MovementState.FALL);
        }
    }

    fixedUpdate(dt: number): void {
        this.controller!.applyGravity();
    }
}

export class GlideState extends LocomotionState {
    constructor() { super(MovementState.GLIDE); priority = 6; }

    enter(controller: PlayerController): void {
        super.enter(controller);
        controller.useGravity = false;
        controller.velocity.velocity.y = -GameConfig.PLAYER.GLIDE_FALL_SPEED;

        emitEvent(GameEvents.GLIDE_STARTED, {});
    }

    exit(): void {
        this.controller!.useGravity = true;
        emitEvent(GameEvents.GLIDE_ENDED, {});
    }

    update(dt: number): void {
        const ctrl = this.controller!;
        const input = Engine.getInstance().input;

        // Consume stamina
        ctrl.stamina.consume(5 * dt);
        if (ctrl.stamina.current <= 0 || !input.jump) {
            ctrl.requestState(MovementState.FALL);
            return;
        }

        // Check for updrafts
        const updraft = ctrl.checkUpdraft();
        if (updraft) {
            ctrl.velocity.velocity.y = Math.max(ctrl.velocity.velocity.y, updraft.strength);
        }

        // Glide movement
        const moveInput = new Vec3(input.move.x, 0, input.move.z);
        if (moveInput.lengthSq() > 0.01) {
            moveInput.normalize();
            const forward = ctrl.transform.getForward();
            const right = ctrl.transform.getRight();
            const moveDir = forward.mulled(moveInput.z).add(right.mulled(moveInput.x));
            ctrl.velocity.velocity.x = moveDir.x * GameConfig.PLAYER.GLIDE_SPEED;
            ctrl.velocity.velocity.z = moveDir.z * GameConfig.PLAYER.GLIDE_SPEED;
        }

        // Turn towards movement
        if (moveInput.lengthSq() > 0.01) {
            const targetRot = Quat.lookRotation(new Vec3(moveInput.x, 0, moveInput.z).normalize(), Vec3.up());
            ctrl.transform.rotation.slerp(targetRot, GameConfig.PLAYER.GLIDE_TURN_SPEED * dt);
        }
    }
}

export class SwimState extends LocomotionState {
    constructor() { super(MovementState.SWIM); }

    enter(controller: PlayerController): void {
        super.enter(controller);
        controller.useGravity = false;
        controller.velocity.velocity.y = 0;
        controller.oxygen = GameConfig.PLAYER.OXYGEN_MAX;

        emitEvent(GameEvents.SWIM_STARTED, {});
    }

    exit(): void {
        this.controller!.useGravity = true;
    }

    update(dt: number): void {
        const ctrl = this.controller!;
        const input = Engine.getInstance().input;

        // Consume oxygen slowly
        ctrl.oxygen -= GameConfig.PLAYER.OXYGEN_CONSUMPTION * dt * 0.2;
        if (ctrl.oxygen <= 0) {
            ctrl.takeDamage(10 * dt); // Drowning
        }

        // Dive transition
        if (input.dashPressed || (input.move.y < -0.5 && input.move.lengthSq() > 0.01)) {
            ctrl.requestState(MovementState.DIVE);
            return;
        }

        // Exit water
        if (!ctrl.isInWater) {
            ctrl.requestState(MovementState.IDLE);
            return;
        }

        // Surface jump
        if (input.jumpPressed) {
            ctrl.velocity.velocity.y = GameConfig.PLAYER.JUMP_FORCE * 0.5;
        }

        // Swim movement
        const moveInput = new Vec3(input.move.x, input.move.y, input.move.z);
        if (moveInput.lengthSq() > 0.01) {
            moveInput.normalize();
            const forward = ctrl.transform.getForward();
            const right = ctrl.transform.getRight();
            const up = Vec3.up();
            const moveDir = forward.mulled(moveInput.z).add(right.mulled(moveInput.x)).add(up.mulled(moveInput.y));
            ctrl.velocity.velocity.copyFrom(moveDir.mulled(GameConfig.PLAYER.SWIM_SPEED));
        } else {
            ctrl.velocity.velocity.mul(0.9); // Water drag
        }
    }
}

export class DiveState extends LocomotionState {
    constructor() { super(MovementState.DIVE); }

    enter(controller: PlayerController): void {
        super.enter(controller);
        controller.useGravity = false;
        emitEvent(GameEvents.DIVE_STARTED, {});
    }

    exit(): void {
        this.controller!.useGravity = true;
    }

    update(dt: number): void {
        const ctrl = this.controller!;
        const input = Engine.getInstance().input;

        // Consume oxygen faster
        ctrl.oxygen -= GameConfig.PLAYER.OXYGEN_CONSUMPTION * dt;
        if (ctrl.oxygen <= 0) {
            ctrl.takeDamage(20 * dt);
        }

        // Surface
        if (input.jumpPressed || !ctrl.isInWater || ctrl.transform.position.y > ctrl.waterSurfaceY) {
            ctrl.requestState(MovementState.SWIM);
            return;
        }

        // Dive movement (3D)
        const moveInput = new Vec3(input.move.x, input.move.y, input.move.z);
        if (moveInput.lengthSq() > 0.01) {
            moveInput.normalize();
            const forward = ctrl.transform.getForward();
            const right = ctrl.transform.getRight();
            const up = Vec3.up();
            const moveDir = forward.mulled(moveInput.z).add(right.mulled(moveInput.x)).add(up.mulled(moveInput.y));
            ctrl.velocity.velocity.copyFrom(moveDir.mulled(GameConfig.PLAYER.DIVE_SPEED));
        } else {
            ctrl.velocity.velocity.mul(0.95);
        }
    }
}

// ============================================================
// PLAYER CONTROLLER
// ============================================================

export class PlayerController {
    // Components
    transform: any = { position: new Vec3(), rotation: new Quat(), getForward: () => new Vec3(0,0,-1), getRight: () => new Vec3(1,0,0) };
    velocity: any = { velocity: new Vec3() };
    stamina: any = { current: 100, max: 100, canAfford: (a: number) => true, consume: (a: number) => true };
    health: any = { current: 100, max: 100, takeDamage: (a: number) => {} };

    // State machine
    currentState: LocomotionState | null = null;
    states: Map<MovementState, LocomotionState> = new Map();
    pendingState: MovementState | null = null;

    // Movement params
    targetSpeed: number = 0;
    isSprinting: boolean = false;
    isGrounded: boolean = true;
    useGravity: boolean = true;
    invulnerable: boolean = false;
    lastGroundY: number = 0;

    // Climb
    climbNormal: Vec3 = new Vec3();
    climbHit: any = null;

    // Water
    isInWater: boolean = false;
    waterSurfaceY: number = 0;
    oxygen: number = GameConfig.PLAYER.OXYGEN_MAX;

    // Glide
    glideTime: number = 0;

    constructor() {
        this.initializeStates();
        this.requestState(MovementState.IDLE);
    }

    private initializeStates(): void {
        this.states.set(MovementState.IDLE, new IdleState());
        this.states.set(MovementState.WALK, new WalkState());
        this.states.set(MovementState.RUN, new RunState());
        this.states.set(MovementState.DASH, new DashState());
        this.states.set(MovementState.JUMP, new JumpState());
        this.states.set(MovementState.DOUBLE_JUMP, new DoubleJumpState());
        this.states.set(MovementState.FALL, new FallState());
        this.states.set(MovementState.LAND, new LandState());
        this.states.set(MovementState.CLIMB, new ClimbState());
        this.states.set(MovementState.CLIMB_JUMP, new ClimbJumpState());
        this.states.set(MovementState.GLIDE, new GlideState());
        this.states.set(MovementState.SWIM, new SwimState());
        this.states.set(MovementState.DIVE, new DiveState());
    }

    requestState(state: MovementState): void {
        const newState = this.states.get(state);
        if (!newState) return;

        if (this.currentState && !this.currentState.canTransitionTo(state)) return;

        this.pendingState = state;
    }

    update(dt: number): void {
        // Process pending state transition
        if (this.pendingState) {
            this.transitionTo(this.pendingState);
            this.pendingState = null;
        }

        // Update current state
        if (this.currentState) {
            this.currentState.update(dt);
        }

        // Update physics
        this.integrateVelocity(dt);
    }

    fixedUpdate(dt: number): void {
        if (this.currentState) {
            this.currentState.fixedUpdate(dt);
        }
    }

    private transitionTo(state: MovementState): void {
        if (this.currentState) {
            this.currentState.exit();
        }
        this.currentState = this.states.get(state)!;
        this.currentState.enter(this);
    }

    private integrateVelocity(dt: number): void {
        if (this.useGravity) {
            this.applyGravity(dt);
        }

        this.transform.position.addScaled(this.velocity.velocity, dt);
    }

    applyGravity(dt: number = 1/60): void {
        this.velocity.velocity.y += GameConfig.PHYSICS.GRAVITY * dt;
        this.velocity.velocity.y = Math.max(this.velocity.velocity.y, GameConfig.PHYSICS.TERMINAL_VELOCITY);
    }

    moveCharacter(speed: number): void {
        const input = Engine.getInstance().input;
        if (input.move.lengthSq() < 0.01) return;

        const moveDir = new Vec3(input.move.x, 0, input.move.z).normalize();
        const forward = this.transform.getForward();
        const right = this.transform.getRight();
        const worldDir = forward.mulled(moveDir.z).add(right.mulled(moveDir.x)).normalize();

        this.velocity.velocity.x = worldDir.x * speed;
        this.velocity.velocity.z = worldDir.z * speed;

        // Rotate towards movement
        if (speed > 0) {
            const targetRot = Quat.lookRotation(worldDir, Vec3.up());
            this.transform.rotation.slerp(targetRot, 10 * dt);
        }
    }

    // Collision checks (would integrate with physics)
    checkGrounded(): boolean {
        // Raycast down
        return this.isGrounded;
    }

    checkClimbable(): boolean {
        // Raycast forward for climbable surface
        // Return true if wall detected within reach
        this.climbHit = { normal: new Vec3(0, 0, -1), point: new Vec3() }; // Mock
        return false; // Would return true if climbable
    }

    getClimbHit(): any { return this.climbHit; }

    checkUpdraft(): { strength: number } | null {
        // Check for upward wind currents
        return null;
    }

    calculateFallDamage(height: number): number {
        const safeHeight = 5;
        if (height <= safeHeight) return 0;
        return Math.floor(this.health.max * 0.1 * Math.min((height - safeHeight) / 10, 1));
    }

    takeDamage(amount: number): void {
        this.health.current = Math.max(0, this.health.current - amount);
    }

    getCurrentState(): MovementState {
        return this.currentState?.name || MovementState.IDLE;
    }

    // Input handling
    handleInput(input: any): void {
        this.isSprinting = input.attack; // Shift/L1 for sprint

        if (this.currentState) {
            this.currentState.handleInput(input);
        }
    }
}