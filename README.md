# ChimeraLand - Action-RPG Sandbox de Mundo Aberto

Protótipo jogável inspirado nas mecânicas centrais de *Chimeraland*, focado em gameplay sistêmico, exploração livre sem barreiras, combate dinâmico baseado em troca de armas em tempo real, sistema de skills vinculadas às armas, captura/evolução/devoração de criaturas (quimeras) e construção livre no mundo.

## 🎮 Funcionalidades Principais

### ⚔️ Sistema de Combate
- **3 Slots de Arma** com troca instantânea (Quick-Swap)
- **Weapon Switch Cancel**: Cancela recovery frames e executa Switch Attack
- **5 Arquétipos de Armas** com mecânicas únicas:
  - **Espada Longa/Katana**: Parry/Deflexão com contra-ataque crítico
  - **Martelo Gigante/Machado**: Carregamento em 3 níveis com Super Armor
  - **Arco/Besta**: Mira livre over-the-shoulder + Tiro em Ponto Fraco
  - **Cajado Elemental**: Canalização de Aura + Reações Elementais
  - **Adagas Duplas/Garras**: Sangramento (stacks até 5 = burst %HP)
- **Hitstop, Camera Shake, Knockback, Poise/Stagger** para game feel

### 🏃 Movimentação Avançada (Parkour & Física)
- **Locomoção Base**: Walk, Run, Sprint, Dash com i-frames, Double Jump
- **Escalada Livre** (estilo BotW): Qualquer superfície vertical
- **Planador/Voar**: Correntes de ar ascendentes
- **Natação/Mergulho 3D**: Barra de oxigênio, exploração oceânica

### 🌍 Mundo Aberto Seamless
- **Chunk Streaming** assíncrono com LOD
- **5 Biomas** com transições suaves e spawn tables por horário
- **Ciclo Dia/Noite** (20 min) altera spawns e visibilidade
- **Coleta/Destrutibilidade**: Árvores, minérios, cristais com HP e drops físicos

### 🧬 Ecossistema de Criaturas & Quimeras
- **Behavior Tree/FSM**: Patrol → Alert → Combat → Enraged
- **Partes Destrutíveis** em chefes (asas, cauda, garras, cabeça)
- **Captura** (HP < 20% = Enfraquecido + Selo Espiritual)
- **Devoração/Mutação**: Absorve partes físicas (asas, cauda venenosa) → desbloqueia skills + altera modelo 3D

### 🏗️ Construção Sandbox Livre
- **Grid 3D + Socket Snapping** magnético
- **Peças Modulares**: Fundações, paredes, portas, escadas, telhados, pilares, bancadas
- **Sistema de Território**: Claim, decay, wards, permissões

### 🎯 Skills & Elementais
- **3 Skills Ativas por Arma** + 1 Ultimate (Fúria Ancestral)
- **Fases**: Startup → Active → Recovery (canceláveis)
- **Reações Elementais**: Overload, Superconduct, Melt, Vaporize, Shatter, Electro-Charged, etc.
- **Status Effects**: Burn, Freeze, Shock, Poison, Bleed, Wet, Chill, Electrified

## 📁 Estrutura do Projeto

```
CHIMERALAND/
├── src/
│   ├── core/                    # Engine core (ECS, Math, Events, Config)
│   ├── combat/                  # Sistema de combate completo
│   ├── movement/                # Locomotion State Machine
│   ├── skills/                  # Skill System data-driven
│   ├── creatures/               # IA, Captura, Mutação (Chimera)
│   ├── building/                # Construção livre + Territórios
│   ├── ui/                      # HUD, Controles Touch/Gamepad
│   ├── systems/                 # World streaming, Biomas, Tempo
│   └── pooling/                 # Object Pooling global
├── assets/data/                 # Configs JSON (ScriptableObjects)
│   ├── weapons/                 # 5 armas completas
│   ├── skills/                  # 5 skills + Ultimate
│   ├── creatures/               # 3 criaturas com mutações
│   ├── building/                # 14 peças de construção
│   ├── biomes.json              # 6 biomas com spawn tables
│   ├── elemental_reactions.json # 10 reações + status
│   └── game_config.json         # Configuração global
├── docs/                        # Documentação técnica
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🚀 Como Executar

```bash
# Instalar dependências
npm install

# Desenvolvimento (hot reload)
npm run dev

# Build de produção
npm run build

# Preview do build
npm run preview

# Type checking
npm run type-check
```

## 🎯 Controles

### Teclado/Mouse
| Ação | Tecla |
|------|-------|
| Mover | WASD |
| Pular | Espaço |
| Esquiva/Dash | Shift Esquerdo |
| Ataque Básico | Botão Esquerdo Mouse |
| Ataque Pesado | Botão Direito Mouse |
| Skill 1 | 1 / Q |
| Skill 2 | 2 / E |
| Skill 3 | 3 / R |
| Ultimate | F |
| Interagir | E |
| Trocar Arma | Q (próx) / R (ant) / 1,2,3 (slot) |
| Modo Construção | B / Tab |
| Reset Câmera | C |

### Gamepad
| Ação | Botão |
|------|-------|
| Mover | Left Stick |
| Olhar | Right Stick |
| Pular | A (South) |
| Esquiva | B (East) |
| Ataque | X (West) |
| Pesado | Y (North) |
| Skill 1 | LT |
| Skill 2 | RT |
| Skill 3 | LB |
| Ultimate | RB |
| Interagir | A |
| Trocar Arma | D-Pad Up |
| Construção | Start |

### Touch (Mobile)
- **Joystick Virtual**: Canto inferior esquerdo
- **Botão Ataque**: Grande, canto inferior direito
- **Skills**: 3 botões em arco ao redor do ataque
- **Ultimate**: Botão dedicado acima do ataque
- **Dash/Pulo**: Botões laterais
- **Troca Arma / Construção**: Canto superior esquerdo

## ⚙️ Configuração

Edite `assets/data/game_config.json` para ajustar:
- Dificuldade, multiplicadores de XP/loot
- Configurações de gráficos/áudio
- Controles personalizados
- Configurações de rede (multiplayer futuro)

## 📚 Documentação Técnica

- [Arquitetura Completa](docs/ARCHITECTURE.md) - Árvore de diretórios, responsabilidades, fluxo de dados
- Convenções de código: ECS, Object Pooling, Fixed Timestep, EventBus

## 🔧 Stack Tecnológica

- **TypeScript** (ES2022, strict mode)
- **Vite** (build, dev server, WASM support)
- **ECS Architecture** (Entity-Component-System)
- **WebGL2** / **Canvas2D** ready
- **Object Pooling** para 60 FPS estável
- **Zero dependencies** pesadas (mobile-friendly)

## 📦 Dados Inclusos (Prontos para Jogar)

### Armas (5)
1. **Espada Longa Espiritual** - Parry, combo 5 hits, switch attack elétrico
2. **Martelo Colossal** - Charge 3 níveis, Super Armor, switch attack sísmico
3. **Arco Longo** - Aim zoom, charge 3 níveis, weakpoint 2.5x, switch interrupt
4. **Cajado Elemental** - Channel aura fogo, combo lightning/ice, switch nova
5. **Adagas Gêmeas** - Bleed stacks, combo 5 hits rápido, switch dance

### Skills (5 + Ultimate)
1. **Investida Relâmpago** (Espada) - Dash 8m, rastro elétrico, Eletrificação
2. **Chuva de Meteoros** (Cajado) - Área 6m, 12 meteoros/3s, Chill + Burn
3. **Salto Esmagador** (Martelo) - Salto 5m, onda choque 5m, Knockup
4. **Disparo Perfurante** (Arco) - Flecha 80 velocidade, pierce ∞, ignora 50% DEF
5. **Manifestação Primordial** (Ultimate) - 100% Fúria, pet spirit, imunidade, área 15m

### Criaturas (3 + Mutações)
1. **Lobo Espiritual** (Lv5) - Planícies, muta: Asas de Águia (voo), Ferrão de Escorpião (veneno)
2. **Águia Celestial** (Lv8) - Montanhas, muta: Juba de Lobo (HP/Poise), Carapaça de Escorpião (DEF)
3. **Escorpião Abissal** (Lv12) - Oceano/Pântano, muta: Asas de Águia (velocidade), Núcleo de Lobo (HP/Resist)

### Biomas (6)
Planícies Espirituais, Montanhas Flutuantes, Deserto de Cinzas, Pântano Tóxico, Oceanos Profundos, Cavernas de Cristal

### Construção (14 peças)
Fundações (quad/tri), Paredes (simples/janela/porta), Porta, Escada, Telha, Pilar, Piso, Teto, Forja, Alquimia, Baú, Cama

## 🏗️ Próximos Passos (Roadmap)

- [ ] Integração com Three.js / WebGPU para renderização 3D
- [ ] Sistema de navegação (NavMesh) para criaturas
- [ ] Multiplayer cooperativo (WebRTC/WebSocket)
- [ ] Sistema de quests/progressão
- [ ] Mais biomas, criaturas, armas, skills
- [ ] Editor de build mode visual
- [ ] Save/Load system (IndexedDB)
- [ ] Audio spatial (Web Audio API)

## 📄 Licença

MIT License - Livre para uso, modificação e distribuição.

---

**ChimeraLand** - Onde cada arma define sua classe, cada criatura pode virar sua montaria mutante, e cada pedaço de terra pode virar sua fortaleza flutuante. 🐺🦅🦂