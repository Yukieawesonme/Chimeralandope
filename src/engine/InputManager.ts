/**
 * Input Manager - Keyboard, Mouse, Touch, Gamepad
 * Normalizes all input to action-based system
 */

import { InputState, ActionName, Vec2 } from '@core/Types.js';

// ============================================================================
// KEY MAPS
// ============================================================================

const KEY_ACTION_MAP: Record<string, ActionName> = {
  // Movement
  KeyW: ActionName.MoveForward,
  ArrowUp: ActionName.MoveForward,
  KeyS: ActionName.MoveBackward,
  ArrowDown: ActionName.MoveBackward,
  KeyA: ActionName.MoveLeft,
  ArrowLeft: ActionName.MoveLeft,
  KeyD: ActionName.MoveRight,
  ArrowRight: ActionName.MoveRight,

  // Actions
  Space: ActionName.Jump,
  ShiftLeft: ActionName.Sprint,
  ShiftRight: ActionName.Sprint,
  ControlLeft: ActionName.Dodge,
  ControlRight: ActionName.Dodge,
  KeyE: ActionName.Interact,
  KeyQ: ActionName.Block,
  KeyR: ActionName.AttackSecondary,
  KeyF: ActionName.WeaponSwap1,
  KeyG: ActionName.WeaponSwap2,
  KeyV: ActionName.WeaponSwap3,
  Digit1: ActionName.Skill1,
  Digit2: ActionName.Skill2,
  Digit3: ActionName.Skill3,
  Digit4: ActionName.Skill4,
  KeyC: ActionName.CameraReset,
  Escape: ActionName.Pause,
  KeyP: ActionName.PhotoMode,
};

const MOUSE_ACTION_MAP: Record<number, ActionName> = {
  0: ActionName.AttackPrimary,   // Left click
  2: ActionName.Block,           // Right click
  1: ActionName.AttackSecondary, // Middle click
};

// ============================================================================
// INPUT MANAGER CLASS
// ============================================================================

export class InputManager {
  private state: InputState = {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    actions: new Set(),
    actionPressed: new Set(),
    actionReleased: new Set(),
    scroll: 0,
  };

  private previousActions = new Set<ActionName>();

  // Touch/Joystick state
  private touchMove: Vec2 = { x: 0, y: 0 };
  private touchLook: Vec2 = { x: 0, y: 0 };
  private lastTouchLookPos: Vec2 = { x: 0, y: 0 };
  private joystickActive = false;
  private lookTouchId: number | null = null;
  private moveTouchId: number | null = null;
  private joystickCenter: Vec2 = { x: 0, y: 0 };
  private joystickRadius = 60;

  // Gamepad
  private gamepadIndex: number | null = null;
  private gamepadDeadzone = 0.15;

  // Sensitivity
  mouseSensitivity = 0.002;
  touchSensitivity = 0.003;

  // Element references
  private canvas: HTMLCanvasElement;
  private joystickElement?: HTMLElement;
  private stickElement?: HTMLElement;
  private attackButton?: HTMLElement;
  private dodgeButton?: HTMLElement;
  private skillButtons: HTMLElement[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.bindEvents();
    this.setupTouchControls();
  }

  // ---- Event Binding ----

  private bindEvents(): void {
    // Keyboard
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));

    // Mouse
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Pointer lock
    this.canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this));

    // Gamepad
    window.addEventListener('gamepadconnected', this.onGamepadConnected.bind(this));
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected.bind(this));

    // Visibility change - release all keys
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.releaseAllActions();
      }
    });
  }

  private setupTouchControls(): void {
    // Create virtual joystick and buttons if on touch device
    if ('ontouchstart' in window) {
      this.createTouchUI();
    }
  }

  private createTouchUI(): void {
    // Joystick container
    const joystickContainer = document.createElement('div');
    joystickContainer.id = 'virtual-joystick';
    joystickContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 120px;
      height: 120px;
      touch-action: none;
      z-index: 100;
      pointer-events: none;
    `;

    this.joystickElement = document.createElement('div');
    this.joystickElement.style.cssText = `
      position: absolute;
      width: 100%;
      height: 100%;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      background: rgba(0,0,0,0.2);
      pointer-events: auto;
    `;

    this.stickElement = document.createElement('div');
    this.stickElement.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 40px;
      height: 40px;
      margin: -20px 0 0 -20px;
      background: rgba(255,255,255,0.6);
      border-radius: 50%;
      transition: transform 0.05s ease-out;
      pointer-events: none;
    `;

    this.joystickElement.appendChild(this.stickElement);
    joystickContainer.appendChild(this.joystickElement);
    document.body.appendChild(joystickContainer);

    // Attack button
    this.attackButton = document.createElement('button');
    this.attackButton.id = 'touch-attack';
    this.attackButton.innerHTML = '⚔️';
    this.attackButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 70px;
      height: 70px;
      border-radius: 50%;
      background: rgba(255,100,100,0.8);
      border: 2px solid rgba(255,255,255,0.5);
      color: white;
      font-size: 28px;
      z-index: 100;
      touch-action: manipulation;
    `;
    document.body.appendChild(this.attackButton);

    // Dodge button
    this.dodgeButton = document.createElement('button');
    this.dodgeButton.id = 'touch-dodge';
    this.dodgeButton.innerHTML = '💨';
    this.dodgeButton.style.cssText = `
      position: fixed;
      bottom: 110px;
      right: 20px;
      width: 70px;
      height: 70px;
      border-radius: 50%;
      background: rgba(100,200,255,0.8);
      border: 2px solid rgba(255,255,255,0.5);
      color: white;
      font-size: 28px;
      z-index: 100;
      touch-action: manipulation;
    `;
    document.body.appendChild(this.dodgeButton);

    // Skill buttons
    for (let i = 0; i < 4; i++) {
      const btn = document.createElement('button');
      btn.id = `touch-skill-${i}`;
      btn.innerHTML = `${i + 1}`;
      btn.style.cssText = `
        position: fixed;
        bottom: ${200 + i * 60}px;
        right: 20px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: rgba(255,255,100,0.8);
        border: 2px solid rgba(255,255,255,0.5);
        color: white;
        font-size: 18px;
        z-index: 100;
        touch-action: manipulation;
        opacity: 0.5;
      `;
      this.skillButtons.push(btn);
      document.body.appendChild(btn);
    }

    // Bind touch events
    this.bindTouchEvents();
  }

  private bindTouchEvents(): void {
    // Joystick
    this.joystickElement?.addEventListener('touchstart', this.onJoystickStart.bind(this), { passive: false });
    this.joystickElement?.addEventListener('touchmove', this.onJoystickMove.bind(this), { passive: false });
    this.joystickElement?.addEventListener('touchend', this.onJoystickEnd.bind(this), { passive: false });

    // Attack
    this.attackButton?.addEventListener('touchstart', e => { e.preventDefault(); this.pressAction(ActionName.AttackPrimary); }, { passive: false });
    this.attackButton?.addEventListener('touchend', e => { e.preventDefault(); this.releaseAction(ActionName.AttackPrimary); }, { passive: false });

    // Dodge
    this.dodgeButton?.addEventListener('touchstart', e => { e.preventDefault(); this.pressAction(ActionName.Dodge); }, { passive: false });
    this.dodgeButton?.addEventListener('touchend', e => { e.preventDefault(); this.releaseAction(ActionName.Dodge); }, { passive: false });

    // Skills
    const skillActions = [ActionName.Skill1, ActionName.Skill2, ActionName.Skill3, ActionName.Skill4];
    this.skillButtons.forEach((btn, i) => {
      const action = skillActions[i]!;
      btn.addEventListener('touchstart', e => { e.preventDefault(); this.pressAction(action); btn.style.opacity = '1'; }, { passive: false });
      btn.addEventListener('touchend', e => { e.preventDefault(); this.releaseAction(action); btn.style.opacity = '0.5'; }, { passive: false });
    });

    // Look area (right side of screen)
    const lookArea = document.createElement('div');
    lookArea.id = 'touch-look-area';
    lookArea.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 50%;
      height: 100%;
      z-index: 50;
      touch-action: none;
    `;
    document.body.appendChild(lookArea);

    lookArea.addEventListener('touchstart', this.onLookStart.bind(this), { passive: false });
    lookArea.addEventListener('touchmove', this.onLookMove.bind(this), { passive: false });
    lookArea.addEventListener('touchend', this.onLookEnd.bind(this), { passive: false });
  }

  // ---- Keyboard Handlers ----

  private onKeyDown(event: KeyboardEvent): void {
    // Ignore if typing in input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

    const action = KEY_ACTION_MAP[event.code];
    if (action) {
      event.preventDefault();
      this.pressAction(action);
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    const action = KEY_ACTION_MAP[event.code];
    if (action) {
      this.releaseAction(action);
    }
  }

  // ---- Mouse Handlers ----

  private onMouseDown(event: MouseEvent): void {
    const action = MOUSE_ACTION_MAP[event.button];
    if (action) {
      this.pressAction(action);
    }
  }

  private onMouseUp(event: MouseEvent): void {
    const action = MOUSE_ACTION_MAP[event.button];
    if (action) {
      this.releaseAction(action);
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (document.pointerLockElement === this.canvas) {
      this.state.look.x += event.movementX * this.mouseSensitivity;
      this.state.look.y += event.movementY * this.mouseSensitivity;
    }
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.state.scroll = event.deltaY > 0 ? 1 : -1;
  }

  private onPointerLockChange(): void {
    if (document.pointerLockElement !== this.canvas) {
      this.state.look = { x: 0, y: 0 };
    }
  }

  // ---- Touch Handlers ----

  private onJoystickStart(event: TouchEvent): void {
    event.preventDefault();
    const touch = event.changedTouches[0]!;
    this.moveTouchId = touch.identifier;

    const rect = this.joystickElement!.getBoundingClientRect();
    this.joystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    this.joystickActive = true;
  }

  private onJoystickMove(event: TouchEvent): void {
    event.preventDefault();
    if (!this.joystickActive || this.moveTouchId === null) return;

    for (const touch of event.changedTouches) {
      if (touch.identifier !== this.moveTouchId) continue;

      let dx = touch.clientX - this.joystickCenter.x;
      let dy = touch.clientY - this.joystickCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > this.joystickRadius) {
        dx = (dx / dist) * this.joystickRadius;
        dy = (dy / dist) * this.joystickRadius;
      }

      this.stickElement!.style.transform = `translate(${dx}px, ${dy}px)`;

      this.touchMove.x = dx / this.joystickRadius;
      this.touchMove.y = dy / this.joystickRadius;

      // Map to movement actions
      this.updateMovementFromTouch();
      break;
    }
  }

  private onJoystickEnd(event: TouchEvent): void {
    for (const touch of event.changedTouches) {
      if (touch.identifier === this.moveTouchId) {
        this.moveTouchId = null;
        this.joystickActive = false;
        this.touchMove = { x: 0, y: 0 };
        this.stickElement!.style.transform = '';
        this.updateMovementFromTouch();
        break;
      }
    }
  }

  private onLookStart(event: TouchEvent): void {
    event.preventDefault();
    const touch = event.changedTouches[0]!;
    this.lookTouchId = touch.identifier;
    this.lastTouchLookPos.x = touch.clientX;
    this.lastTouchLookPos.y = touch.clientY;
  }

  private onLookMove(event: TouchEvent): void {
    event.preventDefault();
    if (this.lookTouchId === null) return;

    for (const touch of event.changedTouches) {
      if (touch.identifier !== this.lookTouchId) continue;

      const dx = touch.clientX - this.lastTouchLookPos.x;
      const dy = touch.clientY - this.lastTouchLookPos.y;

      this.touchLook.x += dx * this.touchSensitivity;
      this.touchLook.y += dy * this.touchSensitivity;

      this.lastTouchLookPos.x = touch.clientX;
      this.lastTouchLookPos.y = touch.clientY;
      break;
    }
  }

  private onLookEnd(event: TouchEvent): void {
    for (const touch of event.changedTouches) {
      if (touch.identifier === this.lookTouchId) {
        this.lookTouchId = null;
        break;
      }
    }
  }

  private updateMovementFromTouch(): void {
    this.state.move.x = this.touchMove.x;
    this.state.move.y = -this.touchMove.y; // Invert Y for forward/back

    // Press/release movement actions based on touch input
    const threshold = 0.2;

    if (this.state.move.y < -threshold) this.pressAction(ActionName.MoveForward);
    else this.releaseAction(ActionName.MoveForward);

    if (this.state.move.y > threshold) this.pressAction(ActionName.MoveBackward);
    else this.releaseAction(ActionName.MoveBackward);

    if (this.state.move.x < -threshold) this.pressAction(ActionName.MoveLeft);
    else this.releaseAction(ActionName.MoveLeft);

    if (this.state.move.x > threshold) this.pressAction(ActionName.MoveRight);
    else this.releaseAction(ActionName.MoveRight);
  }

  // ---- Gamepad Handlers ----

  private onGamepadConnected(event: GamepadEvent): void {
    if (this.gamepadIndex === null) {
      this.gamepadIndex = event.gamepad.index;
      console.log(`Gamepad connected: ${event.gamepad.id}`);
    }
  }

  private onGamepadDisconnected(event: GamepadEvent): void {
    if (this.gamepadIndex === event.gamepad.index) {
      this.gamepadIndex = null;
      console.log('Gamepad disconnected');
    }
  }

  private pollGamepad(): void {
    if (this.gamepadIndex === null) return;

    const gamepad = navigator.getGamepads()[this.gamepadIndex];
    if (!gamepad) return;

    // Left stick - movement
    const lx = gamepad.axes[0] || 0;
    const ly = gamepad.axes[1] || 0;

    if (Math.abs(lx) > this.gamepadDeadzone) {
      this.state.move.x = lx;
      if (lx < -this.gamepadDeadzone) this.pressAction(ActionName.MoveLeft); else this.releaseAction(ActionName.MoveLeft);
      if (lx > this.gamepadDeadzone) this.pressAction(ActionName.MoveRight); else this.releaseAction(ActionName.MoveRight);
    } else {
      this.state.move.x = 0;
      this.releaseAction(ActionName.MoveLeft);
      this.releaseAction(ActionName.MoveRight);
    }

    if (Math.abs(ly) > this.gamepadDeadzone) {
      this.state.move.y = -ly; // Invert Y
      if (ly < -this.gamepadDeadzone) this.pressAction(ActionName.MoveForward); else this.releaseAction(ActionName.MoveForward);
      if (ly > this.gamepadDeadzone) this.pressAction(ActionName.MoveBackward); else this.releaseAction(ActionName.MoveBackward);
    } else {
      this.state.move.y = 0;
      this.releaseAction(ActionName.MoveForward);
      this.releaseAction(ActionName.MoveBackward);
    }

    // Right stick - camera
    const rx = gamepad.axes[2] || 0;
    const ry = gamepad.axes[3] || 0;

    if (Math.abs(rx) > this.gamepadDeadzone) {
      this.state.look.x += rx * 0.03;
    }
    if (Math.abs(ry) > this.gamepadDeadzone) {
      this.state.look.y += ry * 0.03;
    }

    // Buttons
    const btnMap: [number, ActionName][] = [
      [0, ActionName.Jump],           // A
      [1, ActionName.AttackSecondary], // B
      [2, ActionName.Block],          // X
      [3, ActionName.Interact],       // Y
      [4, ActionName.Dodge],          // LB
      [5, ActionName.AttackPrimary],  // RB
      [6, ActionName.Skill1],         // LT
      [7, ActionName.Skill2],         // RT
      [9, ActionName.WeaponSwap1],    // D-pad up
      [10, ActionName.WeaponSwap2],   // D-pad down
      [11, ActionName.WeaponSwap3],   // D-pad left
      [12, ActionName.Pause],         // Start
    ];

    for (const [index, action] of btnMap) {
      if (gamepad.buttons[index]?.pressed) {
        this.pressAction(action);
      } else {
        this.releaseAction(action);
      }
    }

    // Triggers for skills 3/4
    const lt = gamepad.axes[6] ?? -1; // LT
    const rt = gamepad.axes[7] ?? -1; // RT
    if (lt > 0.5) this.pressAction(ActionName.Skill3); else this.releaseAction(ActionName.Skill3);
    if (rt > 0.5) this.pressAction(ActionName.Skill4); else this.releaseAction(ActionName.Skill4);
  }

  // ---- Action Management ----

  private pressAction(action: ActionName): void {
    this.state.actions.add(action);
    this.state.actionPressed.add(action);
  }

  private releaseAction(action: ActionName): void {
    this.state.actions.delete(action);
    this.state.actionReleased.add(action);
  }

  private releaseAllActions(): void {
    for (const action of this.state.actions) {
      this.state.actionReleased.add(action);
    }
    this.state.actions.clear();
    this.state.move = { x: 0, y: 0 };
    this.state.look = { x: 0, y: 0 };
  }

  // ---- Update ----

  update(): void {
    // Poll gamepad
    this.pollGamepad();

    // Clear frame-only states
    this.state.actionPressed.clear();
    this.state.actionReleased.clear();
    this.state.scroll = 0;
    this.state.look = { x: 0, y: 0 }; // Mouse look is accumulated in event handler

    // Add touch look to state
    if (this.touchLook.x !== 0 || this.touchLook.y !== 0) {
      this.state.look.x += this.touchLook.x;
      this.state.look.y += this.touchLook.y;
      this.touchLook = { x: 0, y: 0 };
    }
  }

  // ---- Public API ----

  getState(): Readonly<InputState> {
    return this.state;
  }

  isActionDown(action: ActionName): boolean {
    return this.state.actions.has(action);
  }

  isActionPressed(action: ActionName): boolean {
    return this.state.actionPressed.has(action);
  }

  isActionReleased(action: ActionName): boolean {
    return this.state.actionReleased.has(action);
  }

  getMoveVector(): Vec2 {
    return { ...this.state.move };
  }

  getLookDelta(): Vec2 {
    return { ...this.state.look };
  }

  getScroll(): number {
    return this.state.scroll;
  }

  setMouseSensitivity(value: number): void {
    this.mouseSensitivity = value;
  }

  setTouchSensitivity(value: number): void {
    this.touchSensitivity = value;
  }

  // ---- Cleanup ----

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown.bind(this));
    window.removeEventListener('keyup', this.onKeyUp.bind(this));
    this.canvas.removeEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.removeEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.removeEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.removeEventListener('wheel', this.onWheel.bind(this));
    document.removeEventListener('pointerlockchange', this.onPointerLockChange.bind(this));
    window.removeEventListener('gamepadconnected', this.onGamepadConnected.bind(this));
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected.bind(this));

    // Remove touch UI
    document.getElementById('virtual-joystick')?.remove();
    document.getElementById('touch-attack')?.remove();
    document.getElementById('touch-dodge')?.remove();
    document.getElementById('touch-look-area')?.remove();
    this.skillButtons.forEach(btn => btn.remove());
  }
}