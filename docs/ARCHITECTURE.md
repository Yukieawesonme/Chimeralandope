# ChimeraLand - Arquitetura Técnica Completa

## 1. Árvore de Diretórios

```
CHIMERALAND/
├── src/
│   ├── core/                    # Sistemas fundamentais do engine
│   │   ├── Engine.ts            # Loop principal, time, input
│   │   ├── Entity.ts            # Classe base Entity (ECS-style)
│   │   ├── Component.ts         # Base Component
│   │   ├── System.ts            # Base System
│   │   ├── World.ts             # Gerenciador de entidades/sistemas
│   │   ├── MathUtils.ts         # Utilitários matemáticos (Vec3, Quat, Mat4)
│   │   ├── EventBus.ts          # Sistema de eventos desacoplado
│   │   └── Config.ts            # Configurações globais
│   │
│   ├── combat/                  # Sistema de Combate
│   │   ├── CombatController.ts  # Controlador principal de combate
│   │   ├── WeaponSystem.ts      # Sistema de armas e troca rápida
│   │   ├── Weapon.ts            # Classe base de arma
│   │   ├── weapons/
│   │   │   ├── Sword.ts         # Espada Longa/Katana (Parry)
│   │   │   ├── HeavyWeapon.ts   # Martelo/Machado (Carregamento)
│   │   │   ├── Bow.ts           # Arco/Besta (Mira livre)
│   │   │   ├── Staff.ts         # Cajado/Orbe (Magia/AoE)
│   │   │   └── Daggers.ts       # Adagas/Garras (Sangramento)
│   │   ├── Hitbox.ts            # Hitbox system com pooling
│   │   ├── DamageCalculator.ts  # Fórmulas de dano
│   │   ├── HitStop.ts           # Sistema de hitstop/hitpause
│   │   ├── CameraShake.ts       # Feedback de câmera
│   │   └── PoiseSystem.ts       # Sistema de postura/equilíbrio
│   │
│   ├── movement/                # Sistema de Movimentação Avançada
│   │   ├── PlayerController.ts  # Controlador principal do jogador
│   │   ├── LocomotionStateMachine.ts  # FSM de locomoção
│   │   ├── states/
│   │   │   ├── LocomotionState.ts      # Base state
│   │   │   ├── IdleState.ts
│   │   │   ├── WalkState.ts
│   │   │   ├── RunState.ts
│   │   │   ├── DashState.ts            # Esquiva com i-frames
│   │   │   ├── JumpState.ts
│   │   │   ├── DoubleJumpState.ts
│   │   │   ├── ClimbState.ts           # Escalada livre (BotW style)
│   │   │   ├── GlideState.ts           # Planador/Voar
│   │   │   ├── SwimState.ts            # Natação superfície
│   │   │   └── DiveState.ts            # Mergulho 3D
│   │   ├── StaminaSystem.ts     # Gerenciamento de stamina
│   │   └── MovementInput.ts     # Processamento de input
│   │
│   ├── skills/                  # Sistema de Skills
│   │   ├── SkillSystem.ts       # Gerenciador global de skills
│   │   ├── Skill.ts             # Classe base de skill (data-driven)
│   │   ├── SkillPhases.ts       # Startup/Active/Recovery
│   │   ├── ActiveSkill.ts       # Skills ativas
│   │   ├── PassiveSkill.ts      # Skills passivas
│   │   ├── UltimateSkill.ts     # Ultimate (Fúria Ancestral)
│   │   ├── ElementalSystem.ts   # Sistema de reações elementais
│   │   ├── StatusEffect.ts      # Status effects (burn, freeze, etc)
│   │   ├── ProjectilePool.ts    # Object pooling para projéteis
│   │   └── skills/
│   │       ├── LightningDash.ts      # Investida Relâmpago
│   │       ├── MeteorRain.ts         # Chuva de Meteoros
│   │       ├── GroundSlam.ts         # Salto Esmagador
│   │       ├── PiercingShot.ts       # Disparo Perfurante
│   │       └── PrimalManifestation.ts # Ultimate
│   │
│   ├── creatures/               # Ecossistema de Criaturas
│   │   ├── Creature.ts          # Classe base de criatura
│   │   ├── CreatureAI.ts        # Behavior Tree / FSM
│   │   ├── states/
│   │   │   ├── PatrolState.ts
│   │   │   ├── AlertState.ts
│   │   │   ├── CombatState.ts
│   │   │   └── EnragedState.ts
│   │   ├── BodyPart.ts          # Partes destruíveis (chefes)
│   │   ├── CaptureSystem.ts     # Sistema de captura (Selo Espiritual)
│   │   ├── ChimeraSystem.ts     # Sistema de devoração/mutação
│   │   ├── PetController.ts     # Controlador de pet/montaria
│   │   ├── MutationSocket.ts    # Sockets de mutação (asas, cauda, etc)
│   │   └── SpawnManager.ts      # Spawn dinâmico por bioma/horário
│   │
│   ├── building/                # Sistema de Construção Sandbox
│   │   ├── BuildingSystem.ts    # Sistema principal
│   │   ├── BuildingPiece.ts     # Peça de construção base
│   │   ├── GridSystem.ts        # Grid e snapping
│   │   ├── SocketSystem.ts      # Socket snapping magnético
│   │   ├── pieces/
│   │   │   ├── Foundation.ts
│   │   │   ├── Wall.ts
│   │   │   ├── Door.ts
│   │   │   ├── Stairs.ts
│   │   │   ├── Roof.ts
│   │   │   ├── Pillar.ts
│   │   │   └── Workstation.ts   # Forja, Alquimia, etc
│   │   ├── BuildPreview.ts      # Preview holográfico
│   │   └── TerritorySystem.ts   # Sistema de reivindicação de território
│   │
│   ├── ui/                      # Interface de Usuário
│   │   ├── HUD.ts               # HUD principal
│   │   ├── CombatHUD.ts         # HUD de combate (skills, weapon swap)
│   │   ├── StatusBars.ts        # HP, Stamina, Fury, Pet
│   │   ├── DamageNumbers.ts     # Números de dano flutuantes (pooling)
│   │   ├── EnemyHealthBar.ts    # Barras de HP inimigos
│   │   ├── SkillCooldownUI.ts   # Cooldowns radiais
│   │   ├── BuildModeUI.ts       # UI modo construção
│   │   ├── CreatureCaptureUI.ts # UI minigame captura
│   │   └── controls/
│   │       ├── VirtualJoystick.ts   # Touch controls
│   │       ├── TouchButton.ts
│   │       └── WeaponWheel.ts       # Roda de armas touch
│   │
│   ├── systems/                 # Sistemas globais
│   │   ├── WorldStreaming.ts    # Chunk streaming assíncrono
│   │   ├── BiomeSystem.ts       # Biomas e transições
│   │   ├── TimeSystem.ts        # Ciclo dia/noite
│   │   ├── WeatherSystem.ts     # Clima dinâmico
│   │   ├── ResourceSystem.ts    # Coleta e recursos
│   │   ├── SaveSystem.ts        # Save/Load
│   │   └── AudioSystem.ts       # Áudio espacial
│   │
│   └── pooling/                 # Object Pooling Global
│       ├── ObjectPool.ts        # Pool genérico
│       ├── PoolManager.ts       # Gerenciador central
│       ├── ProjectilePool.ts
│       ├── EffectPool.ts
│       ├── DamageNumberPool.ts
│       └── CreaturePool.ts
│
├── assets/
│   ├── data/                    # Configurações JSON/ScriptableObjects
│   │   ├── weapons/
│   │   │   ├── sword_long.json
│   │   │   ├── heavy_hammer.json
│   │   │   ├── longbow.json
│   │   │   ├── elemental_staff.json
│   │   │   └── twin_daggers.json
│   │   ├── skills/
│   │   │   ├── lightning_dash.json
│   │   │   ├── meteor_rain.json
│   │   │   ├── ground_slam.json
│   │   │   ├── piercing_shot.json
│   │   │   └── primal_manifestation.json
│   │   ├── creatures/
│   │   │   ├── spirit_wolf.json
│   │   │   ├── sky_eagle.json
│   │   │   └── abyssal_scorpion.json
│   │   ├── building/
│   │   │   └── building_pieces.json
│   │   ├── biomes.json
│   │   ├── elemental_reactions.json
│   │   └── game_config.json
│   │
│   ├── models/                  # Modelos 3D (referências)
│   ├── textures/                # Texturas
│   └── audio/                   # SFX/Música
│
├── scenes/                      # Cenas/Levels
│   ├── main_menu.tscn
│   ├── open_world.tscn
│   ├── build_mode.tscn
│   └── creature_arena.tscn
│
└── docs/
    ├── ARCHITECTURE.md
    ├── COMBAT_SYSTEM.md
    ├── MOVEMENT_SYSTEM.md
    ├── SKILL_SYSTEM.md
    ├── CREATURE_SYSTEM.md
    ├── BUILDING_SYSTEM.md
    └── DATA_CONFIGS.md
```

---

## 2. Responsabilidades por Módulo

### Core Systems (`src/core/`)
| Arquivo | Responsabilidade |
|---------|------------------|
| `Engine.ts` | Game loop fixo (60Hz), delta time, fixed update, input polling |
| `Entity.ts` | Entidade base com ID único, componentes, lifecycle (init/update/destroy) |
| `Component.ts` | Componente base (data-only, sem lógica) |
| `System.ts` | Sistema base (query entities, update logic) |
| `World.ts` | ECS World: add/remove entity, register system, query archetypes |
| `MathUtils.ts` | Vec3, Quat, Mat4, Ray, Bounds, Lerp, Slerp, math constants |
| `EventBus.ts` | Pub/Sub desacoplado: emit, on, off, once |
| `Config.ts` | Constantes globais: GRAVITY, MAX_STAMINA, CHUNK_SIZE, etc |

### Combat (`src/combat/`)
| Arquivo | Responsabilidade |
|---------|------------------|
| `CombatController.ts` | Orquestra input -> weapon -> skill -> hitbox -> damage |
| `WeaponSystem.ts` | Gerencia 3 slots de arma, quick-swap, switch cancel logic |
| `Weapon.ts` | Base: stats, moveset, unique mechanic, attack patterns |
| `Hitbox.ts` | Hitbox com shape (sphere/box/capsule), collision layers, pooling |
| `DamageCalculator.ts` | Fórmula matemática pura, crítico, elemental, defense |
| `HitStop.ts` | Pausa global seletiva (attacker/target), frame-perfect |
| `CameraShake.ts` | Trauma shake, impulse, decay, frequency/amplitude |
| `PoiseSystem.ts` | Poise hidden bar, stagger thresholds, launcher logic |

### Movement (`src/movement/`)
| Arquivo | Responsabilidade |
|---------|------------------|
| `PlayerController.ts` | Root: input -> state machine, physics integration, camera |
| `LocomotionStateMachine.ts` | FSM: transições válidas, enter/exit, tick |
| `StaminaSystem.ts` | Regen, drain, exhaustion, cooldowns por ação |
| `MovementInput.ts` | Normaliza input (KB/Mouse, Gamepad, Touch), deadzone |

### Skills (`src/skills/`)
| Arquivo | Responsabilidade |
|---------|------------------|
| `SkillSystem.ts` | Registra skills, cooldowns, input mapping, execution queue |
| `Skill.ts` | Data-driven: ID, phases, cost, cooldown, properties, VFX/SFX refs |
| `ElementalSystem.ts` | Reactions: Burn+Shock=Overload, Freeze+Shatter=Crit, etc |
| `StatusEffect.ts` | Stackable, tick damage, duration, refresh/extend rules |
| `ProjectilePool.ts` | Pool de projéteis com trail, homing, pierce, aoe |

### Creatures (`src/creatures/`)
| Arquivo | Responsabilidade |
|---------|------------------|
| `CreatureAI.ts` | Behavior Tree: Selector/Sequence/Decorator, Blackboard |
| `BodyPart.ts` | Hitbox separada, HP próprio, destroy callback, loot table |
| `CaptureSystem.ts` | Probability calc, minigame, seal item consumption |
| `ChimeraSystem.ts` | Devour: part inheritance, socket attachment, skill unlock |
| `MutationSocket.ts` | Socket definitions: back, tail, head, limbs; mesh attachment |
| `PetController.ts` | AI companion: follow, attack, mount, commands |

### Building (`src/building/`)
| Arquivo | Responsabilidade |
|---------|------------------|
| `GridSystem.ts` | 3D grid, world<->grid coords, bounds checking |
| `SocketSystem.ts` | Snap points per piece, magnetic attraction, validation |
| `BuildingPiece.ts` | Piece data: sockets, stability, health, craft cost |
| `BuildPreview.ts` | Ghost mesh, validity shader (green/red), rotation snap |
| `TerritorySystem.ts` | Claim radius, decay, permissions, ward protection |

### UI (`src/ui/`)
| Arquivo | Responsabilidade |
|---------|------------------|
| `HUD.ts` | Layout manager, safe area, responsive scaling |
| `CombatHUD.ts` | Weapon wheel, skill buttons (3+ultimate), swap button |
| `DamageNumbers.ts` | Pooled floating text: color by type, crit pop, arc motion |
| `VirtualJoystick.ts` | Touch: deadzone, snap angles, multi-touch support |

### Systems (`src/systems/`)
| Arquivo | Responsabilidade |
|---------|------------------|
| `WorldStreaming.ts` | Chunk load/unload async, LOD distance, priority queue |
| `BiomeSystem.ts` | Noise-based biome blend, spawn tables per biome/time |
| `TimeSystem.ts` | Day/night cycle, time scale, events at specific hours |

### Pooling (`src/pooling/`)
| Arquivo | Responsabilidade |
|---------|------------------|
| `ObjectPool<T>` | Generic: create, get, release, resize, warmup |
| `PoolManager.ts` | Central registry, prewarm all, memory stats |

---

## 3. Fluxo de Dados Principal

```
INPUT (Keyboard/Gamepad/Touch)
    ↓
MovementInput → PlayerController → LocomotionStateMachine
    ↓                                              ↓
StaminaSystem                              Physics Integration
    ↓                                              ↓
WeaponSystem ← CombatController ← SkillSystem
    ↓              ↓              ↓
Weapon.Slot[3]  Hitbox        Active Skills
    ↓              ↓              ↓
         DamageCalculator ← ElementalSystem
    ↓              ↓              ↓
         HitStop ← CameraShake ← StatusEffect
    ↓              ↓
         PoiseSystem → Stagger/Launch
    ↓
CreatureAI (Blackboard) ← BodyPart Damage
    ↓
CaptureSystem / ChimeraSystem
```

---

## 4. Convenções de Código

- **Naming**: PascalCase classes, camelCase métodos/variáveis, UPPER_SNAKE_CASE constants
- **ECS**: Components = data only; Systems = logic only; Entities = ID + Component bag
- **Async**: Chunk loading via Promise/Task, main thread never blocks
- **Pooling**: All frequent objects (projectiles, VFX, damage numbers, creatures) pooled
- **Math**: Fixed timestep physics (1/60), interpolation for render
- **Events**: EventBus for cross-system communication (no direct refs)

---

## 5. Configuração de Build (Godot 4 / TypeScript)

```json
// project.godot / package.json equivalent
{
  "name": "chimeraland",
  "version": "0.1.0-prototype",
  "engine": "Godot 4.3+",
  "target": ["Windows", "Linux", "Android", "Web"],
  "scripts": "src/",
  "assets": "assets/",
  "scenes": "scenes/",
  "autoload": [
    "Engine", "EventBus", "PoolManager", "WorldStreaming",
    "TimeSystem", "BiomeSystem", "AudioSystem", "SaveSystem"
  ]
}
```