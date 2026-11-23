// ChimeraLand - Weapon System
// Manages 3 weapon slots, quick-swap, switch cancel combos

import { EventBus, GameEvents, emitEvent, onEvent } from '../core/EventBus';
import { GameConfig, WeaponType, WeaponSlot, DamageType } from '../core/Config';
import { Weapon, WeaponFactory, WeaponData, AttackMove } from './Weapon';
import { Vec3 } from '../core/MathUtils';
import { SkillSystem } from '../skills/SkillSystem';

export interface WeaponSlotData {
    weapon: Weapon | null;
    skillIds: string[]; // 3 active skills + ultimate
}

export class WeaponSystem {
    private static instance: WeaponSystem;
    slots: WeaponSlotData[] = [
        { weapon: null, skillIds: [] },
        { weapon: null, skillIds: [] },
        { weapon: null, skillIds: [] },
    ];
    activeSlot: WeaponSlot = WeaponSlot.MAIN;
    previousSlot: WeaponSlot = WeaponSlot.MAIN;
    switchCooldown: number = 0;
    switchCancelWindow: number = GameConfig.COMBAT.SWITCH_CANCEL_WINDOW;
    lastSwitchTime: number = 0;
    isSwitching: boolean = false;
    switchQueue: WeaponSlot | null = null;

    static getInstance(): WeaponSystem {
        if (!WeaponSystem.instance) WeaponSystem.instance = new WeaponSystem();
        return WeaponSystem.instance;
    }

    constructor() {
        this.initializeEventListeners();
    }

    private initializeEventListeners(): void {
        onEvent(GameEvents.WEAPON_SWAP, (data) => {
            this.requestSwitch(data.slot);
        });
    }

    // Equip weapon to slot
    equipWeapon(slot: WeaponSlot, weaponData: WeaponData): Weapon {
        const weapon = WeaponFactory.create(weaponData);
        weapon.data.slot = slot;

        const oldWeapon = this.slots[slot].weapon;
        if (oldWeapon) {
            oldWeapon.onAttackEnded?.();
        }

        this.slots[slot].weapon = weapon;
        this.slots[slot].skillIds = weaponData.skillIds || [];

        // Assign skills to weapon
        this.assignSkillsToWeapon(slot, weapon);

        emitEvent(GameEvents.WEAPON_SWAPPED, {
            slot,
            weapon,
            previousWeapon: oldWeapon
        });

        return weapon;
    }

    private assignSkillsToWeapon(slot: WeaponSlot, weapon: Weapon): void {
        const skillSystem = SkillSystem.getInstance();
        for (const skillId of this.slots[slot].skillIds) {
            const skill = skillSystem.getSkill(skillId);
            if (skill) {
                skill.requiredWeaponType = weapon.data.type;
                skill.weaponSlot = slot;
            }
        }
    }

    // Get active weapon
    getActiveWeapon(): Weapon | null {
        return this.slots[this.activeSlot].weapon;
    }

    getWeapon(slot: WeaponSlot): Weapon | null {
        return this.slots[slot].weapon;
    }

    // Request weapon switch (with queue for switch cancel)
    requestSwitch(slot: WeaponSlot): boolean {
        if (slot === this.activeSlot) return false;
        if (slot < 0 || slot > 2) return false;
        if (!this.slots[slot].weapon) return false;

        const now = Date.now() / 1000;
        if (now - this.lastSwitchTime < this.switchCooldown) {
            // Queue the switch for when cooldown ends
            this.switchQueue = slot;
            return false;
        }

        return this.executeSwitch(slot);
    }

    // Execute immediate switch
    private executeSwitch(newSlot: WeaponSlot): boolean {
        const currentWeapon = this.getActiveWeapon();
        const newWeapon = this.slots[newSlot].weapon;

        if (!newWeapon) return false;

        const now = Date.now() / 1000;

        // Check for Switch Cancel
        const isSwitchCancel = currentWeapon && currentWeapon.canSwitchCancel() &&
                               (now - (currentWeapon.lastAttackTime || 0)) < this.switchCancelWindow;

        if (isSwitchCancel) {
            // Cancel current weapon's recovery
            currentWeapon!.onAttackEnded?.();
            currentWeapon!.isAttacking = false;
            currentWeapon!.attackState = 'idle';

            // Execute new weapon's switch attack
            newWeapon.onSwitchCancel(currentWeapon!);

            emitEvent(GameEvents.WEAPON_SWITCH_CANCEL, {
                fromSlot: this.activeSlot,
                toSlot: newSlot,
                fromWeapon: currentWeapon,
                toWeapon: newWeapon,
            });
        }

        // Update slots
        this.previousSlot = this.activeSlot;
        this.activeSlot = newSlot;
        this.lastSwitchTime = now;
        this.isSwitching = false;
        this.switchQueue = null;

        // Update active skills
        this.updateActiveSkills();

        emitEvent(GameEvents.WEAPON_SWAPPED, {
            fromSlot: this.previousSlot,
            toSlot: this.activeSlot,
            weapon: newWeapon,
            isSwitchCancel,
        });

        return true;
    }

    // Switch to next/previous weapon
    switchNext(): void {
        const nextSlot = (this.activeSlot + 1) % 3;
        this.requestSwitch(nextSlot);
    }

    switchPrevious(): void {
        const prevSlot = (this.activeSlot + 2) % 3;
        this.requestSwitch(prevSlot);
    }

    // Update active skills based on current weapon
    private updateActiveSkills(): void {
        const skillSystem = SkillSystem.getInstance();

        // Deactivate all skills first
        skillSystem.deactivateAllWeaponSkills();

        // Activate skills for current weapon
        const activeSkills = this.slots[this.activeSlot].skillIds;
        for (const skillId of activeSkills) {
            skillSystem.activateSkill(skillId);
        }
    }

    // Input handling
    update(dt: number, input: any): void {
        // Process switch queue
        if (this.switchQueue !== null) {
            const now = Date.now() / 1000;
            if (now - this.lastSwitchTime >= this.switchCooldown) {
                this.executeSwitch(this.switchQueue);
            }
        }

        // Direct slot input (1, 2, 3 keys)
        if (input.swapWeapon >= 0 && input.swapWeapon <= 2) {
            this.requestSwitch(input.swapWeapon as WeaponSlot);
        }

        // Scroll wheel / D-pad
        if (input.weaponWheelUp) this.switchPrevious();
        if (input.weaponWheelDown) this.switchNext();

        // Update active weapon
        const weapon = this.getActiveWeapon();
        if (weapon) {
            weapon.update(dt);
        }

        // Update cooldown
        if (this.switchCooldown > 0) this.switchCooldown -= dt;
    }

    // Attack input forwarded to active weapon
    tryAttack(moveId?: string): boolean {
        const weapon = this.getActiveWeapon();
        if (!weapon) return false;
        return weapon.tryAttack(moveId);
    }

    // Heavy attack / charge
    tryHeavyAttack(): boolean {
        const weapon = this.getActiveWeapon();
        if (!weapon) return false;

        if (weapon.data.type === 'heavy') {
            return (weapon as any).startCharge?.() || false;
        }
        return false;
    }

    // Aim (bow)
    tryAim(): boolean {
        const weapon = this.getActiveWeapon();
        if (!weapon) return false;

        if (weapon.data.type === 'bow') {
            (weapon as any).startAim?.();
            return true;
        }
        return false;
    }

    stopAim(): void {
        const weapon = this.getActiveWeapon();
        if (weapon && weapon.data.type === 'bow') {
            (weapon as any).stopAim?.();
        }
    }

    // Channel (staff)
    tryChannel(): boolean {
        const weapon = this.getActiveWeapon();
        if (!weapon) return false;

        if (weapon.data.type === 'staff') {
            (weapon as any).startChannel?.();
            return true;
        }
        return false;
    }

    stopChannel(): void {
        const weapon = this.getActiveWeapon();
        if (weapon && weapon.data.type === 'staff') {
            (weapon as any).stopChannel?.();
        }
    }

    // Parry (sword)
    tryParry(): boolean {
        const weapon = this.getActiveWeapon();
        if (!weapon) return false;
        return weapon.tryParry?.() || false;
    }

    // Get active skills for UI
    getActiveSkillIds(): string[] {
        return this.slots[this.activeSlot].skillIds;
    }

    getActiveWeaponType(): WeaponType | null {
        return this.getActiveWeapon()?.data.type || null;
    }

    getActiveWeaponData(): WeaponData | null {
        return this.getActiveWeapon()?.data || null;
    }

    // Combo tracking
    getComboCount(): number {
        return this.getActiveWeapon()?.comboCount || 0;
    }

    resetCombo(): void {
        const weapon = this.getActiveWeapon();
        if (weapon) weapon.comboCount = 0;
    }

    // Serialization
    toJSON(): any {
        return {
            activeSlot: this.activeSlot,
            slots: this.slots.map(s => ({
                weaponId: s.weapon?.data.id,
                skillIds: s.skillIds,
            })),
        };
    }

    static fromJSON(data: any, weaponConfigs: Map<string, WeaponData>): WeaponSystem {
        const system = new WeaponSystem();
        system.activeSlot = data.activeSlot;

        for (let i = 0; i < 3; i++) {
            const slotData = data.slots[i];
            if (slotData.weaponId) {
                const config = weaponConfigs.get(slotData.weaponId);
                if (config) {
                    system.equipWeapon(i as WeaponSlot, config);
                }
            }
            system.slots[i].skillIds = slotData.skillIds || [];
        }

        system.updateActiveSkills();
        return system;
    }
}

// Weapon Wheel UI Helper
export class WeaponWheel {
    static instance: WeaponWheel;
    visible: boolean = false;
    selectedIndex: number = -1;
    animationProgress: number = 0;
    animationDirection: number = 0; // 1 = opening, -1 = closing

    static getInstance(): WeaponWheel {
        if (!WeaponWheel.instance) WeaponWheel.instance = new WeaponWheel();
        return WeaponWheel.instance;
    }

    open(): void {
        this.visible = true;
        this.animationDirection = 1;
        this.animationProgress = 0;
    }

    close(): void {
        this.animationDirection = -1;
    }

    update(dt: number): void {
        const speed = 8;
        this.animationProgress += this.animationDirection * speed * dt;
        this.animationProgress = Math.max(0, Math.min(1, this.animationProgress));

        if (this.animationProgress === 0 && this.animationDirection === -1) {
            this.visible = false;
        }
    }

    selectSlot(index: number): void {
        if (index >= 0 && index < 3) {
            this.selectedIndex = index;
        }
    }

    confirmSelection(): WeaponSlot | null {
        if (this.selectedIndex >= 0) {
            const slot = this.selectedIndex as WeaponSlot;
            this.close();
            this.selectedIndex = -1;
            return slot;
        }
        return null;
    }

    getSlotAngle(index: number): number {
        // 3 slots in a wheel: bottom, bottom-right, bottom-left
        const angles = [-Math.PI / 2, -Math.PI / 6, -5 * Math.PI / 6];
        return angles[index] || 0;
    }
}