/**
 * Mobile Controls System - Virtual joystick, touch buttons, gestures
 * Handles all touch input for mobile gameplay
 */

import { InputManager } from '@engine/InputManager.js';
import { ActionName, Vec2 } from '@core/Types.js';

// ============================================================================
// TOUCH CONTROL CONFIG
// ============================================================================

export interface TouchControlConfig {
  joystickSize: number;
  joystickDeadzone: number;
  buttonSize: number;
  buttonSpacing: number;
  bottomSafeArea: number;
  sideSafeArea: number;
  opacity: number;
  pressedOpacity: number;
}

export const DEFAULT_TOUCH_CONFIG: TouchControlConfig = {
  joystickSize: 120,
  joystickDeadzone: 0.15,
  buttonSize: 70,
  buttonSpacing: 16,
  bottomSafeArea: 24,
  sideSafeArea: 16,
  opacity: 0.7,
  pressedOpacity: 1.0,
};

// ============================================================================
// VIRTUAL JOYSTICK
// ============================================================================

export class VirtualJoystick {
  private container!: HTMLElement;
  private base!: HTMLElement;
  private stick!: HTMLElement;
  private config: TouchControlConfig;

  private isActive = false;
  private pointerId: number | null = null;
  private centerX = 0;
  private centerY = 0;
  private currentValue: Vec2 = { x: 0, y: 0 };
  private onChangeCallback?: (value: Vec2) => void;

  constructor(parent: HTMLElement, config: TouchControlConfig) {
    this.config = config;
    this.createElements(parent);
    this.bindEvents();
  }

  private createElements(parent: HTMLElement): void {
    this.container = document.createElement('div');
    this.container.id = 'virtual-joystick';
    this.container.style.cssText = `
      position: fixed;
      left: ${this.config.sideSafeArea}px;
      bottom: ${this.config.bottomSafeArea + this.config.buttonSize + this.config.buttonSpacing}px;
      width: ${this.config.joystickSize}px;
      height: ${this.config.joystickSize}px;
      pointer-events: none;
      z-index: 40;
      touch-action: none;
    `;

    this.base = document.createElement('div');
    this.base.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: rgba(8, 20, 38, ${this.config.opacity});
      border: 2px solid rgba(66, 217, 197, 0.5);
      box-shadow:
        inset 0 2px 8px rgba(0, 0, 0, 0.3),
        0 0 20px rgba(66, 217, 197, 0.1);
      pointer-events: auto;
    `;

    this.stick = document.createElement('div');
    this.stick.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 45%;
      height: 45%;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(66, 217, 197, 0.9), rgba(124, 58, 237, 0.9));
      border: 2px solid rgba(255, 255, 255, 0.3);
      box-shadow:
        0 4px 12px rgba(66, 217, 197, 0.4),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2);
      pointer-events: none;
      transition: transform 0.05s ease-out;
    `;

    this.base.appendChild(this.stick);
    this.container.appendChild(this.base);
    parent.appendChild(this.container);
  }

  private bindEvents(): void {
    const handleStart = (e: TouchEvent | PointerEvent) => {
      const touch = this.getTouch(e);
      if (!touch) return;

      const rect = this.base.getBoundingClientRect();
      this.centerX = rect.left + rect.width / 2;
      this.centerY = rect.top + rect.height / 2;

      this.isActive = true;
      this.pointerId = touch.identifier ?? 1;
      this.base.style.pointerEvents = 'none';

      this.updateStickPosition(touch.clientX, touch.clientY);
      e.preventDefault();
    };

    const handleMove = (e: TouchEvent | PointerEvent) => {
      if (!this.isActive) return;
      const touch = this.getTouchById(e);
      if (!touch) return;

      this.updateStickPosition(touch.clientX, touch.clientY);
      e.preventDefault();
    };

    const handleEnd = (e: TouchEvent | PointerEvent) => {
      if (!this.isActive) return;
      const touch = this.getTouchById(e);
      if (touch && touch.identifier !== this.pointerId) return;

      this.isActive = false;
      this.pointerId = null;
      this.currentValue = { x: 0, y: 0 };
      this.stick.style.transform = 'translate(-50%, -50%)';
      this.base.style.pointerEvents = 'auto';
      this.onChangeCallback?.(this.currentValue);
    };

    this.base.addEventListener('pointerdown', handleStart as any);
    window.addEventListener('pointermove', handleMove as any);
    window.addEventListener('pointerup', handleEnd as any);
    window.addEventListener('pointercancel', handleEnd as any);
    window.addEventListener('pointerleave', handleEnd as any);

    this.base.addEventListener('touchstart', handleStart as any, { passive: false });
    window.addEventListener('touchmove', handleMove as any, { passive: false });
    window.addEventListener('touchend', handleEnd as any);
    window.addEventListener('touchcancel', handleEnd as any);
  }

  private getTouch(e: TouchEvent | PointerEvent): Touch | null {
    if ('touches' in e) {
      return e.touches[0] || null;
    }
    return e as any;
  }

  private getTouchById(e: TouchEvent | PointerEvent): Touch | null {
    if ('touches' in e) {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.pointerId) return touch;
      }
      return null;
    }
    return (e as any).pointerId === this.pointerId ? (e as any) : null;
  }

  private updateStickPosition(clientX: number, clientY: number): void {
    const dx = clientX - this.centerX;
    const dy = clientY - this.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = this.config.joystickSize / 2;

    let normalizedX = dx / maxDistance;
    let normalizedY = dy / maxDistance;

    const magnitude = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
    if (magnitude > 1) {
      normalizedX /= magnitude;
      normalizedY /= magnitude;
    }

    if (magnitude < this.config.joystickDeadzone) {
      normalizedX = 0;
      normalizedY = 0;
    }

    const stickX = normalizedX * maxDistance * 0.65;
    const stickY = normalizedY * maxDistance * 0.65;
    this.stick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;

    this.currentValue = { x: normalizedX, y: -normalizedY };
    this.onChangeCallback?.(this.currentValue);
  }

  onChange(callback: (value: Vec2) => void): void {
    this.onChangeCallback = callback;
  }

  getValue(): Vec2 {
    return { ...this.currentValue };
  }

  destroy(): void {
    this.container.remove();
  }
}

// ============================================================================
// TOUCH BUTTON
// ============================================================================

export class TouchButton {
  private element!: HTMLElement;
  private actionName: ActionName;
  private inputManager: InputManager;
  private config: TouchControlConfig;
  private isPressed = false;

  constructor(
    parent: HTMLElement,
    actionName: ActionName,
    label: string,
    icon: string,
    position: { bottom: number; right?: number; left?: number },
    inputManager: InputManager,
    config: TouchControlConfig
  ) {
    this.actionName = actionName;
    this.inputManager = inputManager;
    this.config = config;
    this.createElement(parent, label, icon, position);
    this.bindEvents();
  }

  private createElement(
    parent: HTMLElement,
    label: string,
    icon: string,
    position: { bottom: number; right?: number; left?: number }
  ): void {
    this.element = document.createElement('button');
    this.element.style.cssText = `
      position: fixed;
      bottom: ${position.bottom}px;
      ${position.right !== undefined ? `right: ${position.right}px;` : `left: ${position.left}px;`}
      width: ${this.config.buttonSize}px;
      height: ${this.config.buttonSize}px;
      border-radius: 50%;
      border: none;
      background: rgba(8, 20, 38, ${this.config.opacity});
      border: 2px solid rgba(66, 217, 197, 0.5);
      color: var(--fg-primary);
      font-size: 1.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      pointer-events: auto;
      z-index: 40;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
      box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.4),
        0 0 20px rgba(66, 217, 197, 0.1);
      transition:
        transform 0.05s ease,
        background 0.1s ease,
        border-color 0.1s ease,
        box-shadow 0.1s ease;
    `;

    this.element.innerHTML = `
      <span style="font-size: 1.8rem; line-height: 1;">${icon}</span>
      <span style="font-size: 0.6rem; font-weight: 600; text-transform: uppercase; opacity: 0.8;">${label}</span>
    `;

    parent.appendChild(this.element);
  }

  private bindEvents(): void {
    const handleStart = (e: TouchEvent | PointerEvent) => {
      this.isPressed = true;
      this.element.style.transform = 'scale(0.9)';
      this.element.style.background = `rgba(66, 217, 197, ${this.config.pressedOpacity})`;
      this.element.style.borderColor = 'rgba(66, 217, 197, 1)';
      this.element.style.boxShadow = '0 0 30px rgba(66, 217, 197, 0.6)';
      this.inputManager.simulateActionPress(this.actionName);
      e.preventDefault();
    };

    const handleEnd = (e: TouchEvent | PointerEvent) => {
      if (!this.isPressed) return;
      this.isPressed = false;
      this.element.style.transform = 'scale(1)';
      this.element.style.background = `rgba(8, 20, 38, ${this.config.opacity})`;
      this.element.style.borderColor = 'rgba(66, 217, 197, 0.5)';
      this.element.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 20px rgba(66, 217, 197, 0.1)';
      this.inputManager.simulateActionRelease(this.actionName);
      e.preventDefault();
    };

    this.element.addEventListener('pointerdown', handleStart as any);
    window.addEventListener('pointerup', handleEnd as any);
    window.addEventListener('pointercancel', handleEnd as any);
    window.addEventListener('pointerleave', handleEnd as any);

    this.element.addEventListener('touchstart', handleStart as any, { passive: false });
    window.addEventListener('touchend', handleEnd as any);
    window.addEventListener('touchcancel', handleEnd as any);
  }

  destroy(): void {
    this.element.remove();
  }
}

// ============================================================================
// LOOK AREA (Right side for camera control)
// ============================================================================

export class TouchLookArea {
  private element!: HTMLElement;
  private inputManager: InputManager;
  private isActive = false;
  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private sensitivity = 0.003;

  constructor(parent: HTMLElement, inputManager: InputManager) {
    this.inputManager = inputManager;
    this.createElement(parent);
    this.bindEvents();
  }

  private createElement(parent: HTMLElement): void {
    this.element = document.createElement('div');
    this.element.id = 'touch-look-area';
    this.element.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 50%;
      height: 100%;
      pointer-events: auto;
      z-index: 30;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
    `;
    parent.appendChild(this.element);
  }

  private bindEvents(): void {
    const handleStart = (e: TouchEvent | PointerEvent) => {
      const touch = 'touches' in e ? e.touches[0] : e;
      if (!touch) return;
      this.isActive = true;
      this.pointerId = 'identifier' in touch ? touch.identifier : 1;
      this.lastX = touch.clientX;
      this.lastY = touch.clientY;
      e.preventDefault();
    };

    const handleMove = (e: TouchEvent | PointerEvent) => {
      if (!this.isActive) return;
      const touch = this.getTouchById(e);
      if (!touch) return;

      const dx = touch.clientX - this.lastX;
      const dy = touch.clientY - this.lastY;

      this.inputManager.addLookDelta(dx * this.sensitivity, dy * this.sensitivity);

      this.lastX = touch.clientX;
      this.lastY = touch.clientY;
      e.preventDefault();
    };

    const handleEnd = (e: TouchEvent | PointerEvent) => {
      const touch = this.getTouchById(e);
      if (touch && 'identifier' in touch && touch.identifier !== this.pointerId) return;
      this.isActive = false;
      this.pointerId = null;
    };

    this.element.addEventListener('pointerdown', handleStart as any);
    window.addEventListener('pointermove', handleMove as any);
    window.addEventListener('pointerup', handleEnd as any);
    window.addEventListener('pointercancel', handleEnd as any);

    this.element.addEventListener('touchstart', handleStart as any, { passive: false });
    window.addEventListener('touchmove', handleMove as any, { passive: false });
    window.addEventListener('touchend', handleEnd as any);
    window.addEventListener('touchcancel', handleEnd as any);
  }

  private getTouchById(e: TouchEvent | PointerEvent): Touch | null {
    if ('touches' in e) {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.pointerId) return touch;
      }
      return null;
    }
    return (e as any).pointerId === this.pointerId ? (e as any) : null;
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  destroy(): void {
    this.element.remove();
  }
}

// ============================================================================
// MOBILE CONTROLS MANAGER
// ============================================================================

export class MobileControlsManager {
  private container!: HTMLElement;
  private inputManager: InputManager;
  private config: TouchControlConfig;

  private joystick!: VirtualJoystick;
  private lookArea!: TouchLookArea;
  private buttons: Map<ActionName, TouchButton> = new Map();
  private isInitialized = false;

  constructor(inputManager: InputManager, config: Partial<TouchControlConfig> = {}) {
    this.inputManager = inputManager;
    this.config = { ...DEFAULT_TOUCH_CONFIG, ...config };
  }

  initialize(): void {
    if (this.isInitialized) return;

    this.container = document.getElementById('touch-controls')!;
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'touch-controls';
      document.body.appendChild(this.container);
    }

    this.container.innerHTML = '';

    this.lookArea = new TouchLookArea(this.container, this.inputManager);

    this.joystick = new VirtualJoystick(this.container, this.config);
    this.joystick.onChange((value) => {
      this.inputManager.setMoveVector(value.x, value.y);
    });

    this.createActionButtons();

    this.isInitialized = true;
    console.log('[MobileControls] Initialized');
  }

  private createActionButtons(): void {
    const buttonSize = this.config.buttonSize;
    const spacing = this.config.buttonSpacing;
    const bottomBase = this.config.bottomSafeArea;
    const rightBase = this.config.sideSafeArea;

    this.createButton(
      ActionName.AttackPrimary,
      'Atacar',
      '⚔️',
      { bottom: bottomBase, right: rightBase + buttonSize + spacing }
    );

    this.createButton(
      ActionName.Dodge,
      'Esquiva',
      '💨',
      { bottom: bottomBase, right: rightBase + (buttonSize + spacing) * 2 + 8 }
    );

    this.createButton(
      ActionName.Skill1,
      'Skill 1',
      '✨',
      { bottom: bottomBase + buttonSize + spacing + 8, right: rightBase + buttonSize + spacing }
    );

    this.createButton(
      ActionName.Skill2,
      'Skill 2',
      '⚡',
      { bottom: bottomBase + buttonSize + spacing + 8, right: rightBase }
    );

    this.createButton(
      ActionName.Skill3,
      'Skill 3',
      '🔥',
      { bottom: bottomBase + (buttonSize + spacing) * 2 + 16, right: rightBase + buttonSize + spacing }
    );

    this.createButton(
      ActionName.Skill4,
      'Ult',
      '⭐',
      { bottom: bottomBase + (buttonSize + spacing) * 2 + 16, right: rightBase }
    );

    this.createButton(
      ActionName.Jump,
      'Pular',
      '⬆️',
      { bottom: bottomBase + this.config.joystickSize + spacing, left: rightBase }
    );

    this.createButton(
      ActionName.Interact,
      'Interagir',
      '🤲',
      { bottom: bottomBase + this.config.joystickSize + (buttonSize + spacing) * 2 + 8, left: rightBase }
    );
  }

  private createButton(
    action: ActionName,
    label: string,
    icon: string,
    position: { bottom: number; right?: number; left?: number }
  ): void {
    const button = new TouchButton(
      this.container,
      action,
      label,
      icon,
      position,
      this.inputManager,
      this.config
    );
    this.buttons.set(action, button);
  }

  setConfig(config: Partial<TouchControlConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setLookSensitivity(value: number): void {
    this.lookArea.setSensitivity(value);
  }

  getJoystickValue(): Vec2 {
    return this.joystick?.getValue() ?? { x: 0, y: 0 };
  }

  destroy(): void {
    this.joystick?.destroy();
    this.lookArea?.destroy();
    this.buttons.forEach(b => b.destroy());
    this.buttons.clear();
    this.isInitialized = false;
  }
}

// ============================================================================
// AUTO-INIT ON MOBILE
// ============================================================================

export function initMobileControls(inputManager: InputManager): MobileControlsManager | null {
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                   (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);

  if (!isMobile) {
    console.log('[MobileControls] Desktop detected, skipping mobile controls');
    return null;
  }

  const manager = new MobileControlsManager(inputManager);
  manager.initialize();
  return manager;
}