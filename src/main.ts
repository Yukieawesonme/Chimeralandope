const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;
const healthFill = document.querySelector<HTMLDivElement>('#healthFill')!;
const stats = document.querySelector<HTMLDivElement>('#stats')!;
const timeLabel = document.querySelector<HTMLDivElement>('#time')!;
const toast = document.querySelector<HTMLDivElement>('#toast')!;
const startScreen = document.querySelector<HTMLDivElement>('#start')!;

interface Vec { x: number; y: number }
interface Enemy { x: number; y: number; radius: number; speed: number; health: number; maxHealth: number; angle: number }

const keys = new Set<string>();
const mouse: Vec = { x: innerWidth / 2, y: innerHeight / 2 };
let running = false;
let last = 0;
let score = 0;
let elapsed = 0;
let spawnTimer = 0;
let attackCooldown = 0;
let slashTimer = 0;
let dashTimer = 0;
let shake = 0;
let touchMove: Vec = { x: 0, y: 0 };

const player = { x: innerWidth / 2, y: innerHeight / 2, radius: 18, speed: 230, health: 100, maxHealth: 100, angle: 0 };
const enemies: Enemy[] = [];

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function showToast(text: string) {
  toast.textContent = text;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 1400);
}

function spawnEnemy() {
  const side = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;
  if (side === 0) { x = Math.random() * innerWidth; y = -30; }
  if (side === 1) { x = innerWidth + 30; y = Math.random() * innerHeight; }
  if (side === 2) { x = Math.random() * innerWidth; y = innerHeight + 30; }
  if (side === 3) { x = -30; y = Math.random() * innerHeight; }
  const level = 1 + Math.floor(score / 250);
  enemies.push({ x, y, radius: 16 + Math.random() * 8, speed: 55 + Math.random() * 25 + level * 3, health: 35 + level * 8, maxHealth: 35 + level * 8, angle: 0 });
}

function attack() {
  if (!running || attackCooldown > 0) return;
  attackCooldown = 0.28;
  slashTimer = 0.16;
  for (const enemy of [...enemies]) {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angleTo = Math.atan2(dy, dx);
    let diff = Math.abs(((angleTo - player.angle + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (dist < 92 && diff < 1.15) {
      enemy.health -= 34;
      shake = 5;
      if (enemy.health <= 0) {
        score += 100;
        const i = enemies.indexOf(enemy);
        if (i >= 0) enemies.splice(i, 1);
      }
    }
  }
}

function dash() {
  if (!running || dashTimer > 0) return;
  dashTimer = 1;
  player.x += Math.cos(player.angle) * 95;
  player.y += Math.sin(player.angle) * 95;
  player.x = Math.max(20, Math.min(innerWidth - 20, player.x));
  player.y = Math.max(20, Math.min(innerHeight - 20, player.y));
  shake = 3;
}

function reset() {
  player.x = innerWidth / 2;
  player.y = innerHeight / 2;
  player.health = player.maxHealth;
  enemies.length = 0;
  score = 0;
  elapsed = 0;
  spawnTimer = 0;
  for (let i = 0; i < 4; i++) spawnEnemy();
}

function update(dt: number) {
  elapsed += dt;
  attackCooldown = Math.max(0, attackCooldown - dt);
  slashTimer = Math.max(0, slashTimer - dt);
  dashTimer = Math.max(0, dashTimer - dt);
  shake = Math.max(0, shake - dt * 20);
  spawnTimer -= dt;
  if (spawnTimer <= 0 && enemies.length < 22) {
    spawnEnemy();
    spawnTimer = Math.max(0.35, 1.35 - elapsed * 0.008);
  }

  let mx = 0;
  let my = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  mx += touchMove.x;
  my += touchMove.y;
  const length = Math.sqrt(mx * mx + my * my);
  if (length > 0) {
    mx /= length;
    my /= length;
    player.x += mx * player.speed * dt;
    player.y += my * player.speed * dt;
  }
  player.x = Math.max(player.radius, Math.min(innerWidth - player.radius, player.x));
  player.y = Math.max(player.radius, Math.min(innerHeight - player.radius, player.y));
  player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

  for (const enemy of enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    enemy.angle = Math.atan2(dy, dx);
    if (dist > player.radius + enemy.radius - 4) {
      enemy.x += dx / dist * enemy.speed * dt;
      enemy.y += dy / dist * enemy.speed * dt;
    } else {
      player.health -= 10 * dt;
      if (player.health <= 0) {
        player.health = 0;
        showToast(`Fim de jogo · ${score} pontos`);
        running = false;
        startScreen.style.display = 'grid';
        document.querySelector<HTMLButtonElement>('#play')!.textContent = 'JOGAR NOVAMENTE';
      }
    }
  }

  healthFill.style.width = `${Math.max(0, player.health / player.maxHealth * 100)}%`;
  stats.textContent = `VIDA ${Math.ceil(player.health)} · PONTOS ${score}`;
  timeLabel.textContent = `DIA ${Math.floor(elapsed / 30) + 1}`;
}

function drawBackground() {
  const day = (elapsed % 30) / 30;
  const night = Math.abs(day - 0.5) > 0.32;
  ctx.fillStyle = night ? '#081426' : '#183a32';
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.strokeStyle = night ? 'rgba(115,145,180,.10)' : 'rgba(255,255,255,.055)';
  ctx.lineWidth = 1;
  for (let x = -40; x < innerWidth + 40; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, innerHeight); ctx.stroke();
  }
  for (let y = -40; y < innerHeight + 40; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(innerWidth, y); ctx.stroke();
  }
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawBackground();

  for (const enemy of enemies) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle);
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath(); ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c4b5fd';
    ctx.beginPath(); ctx.arc(enemy.radius * 0.25, -enemy.radius * 0.25, enemy.radius * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 9, enemy.radius * 2, 5);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 9, enemy.radius * 2 * Math.max(0, enemy.health / enemy.maxHealth), 5);
  }

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.fillStyle = '#42d9c5';
  ctx.beginPath(); ctx.arc(0, 0, player.radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#dffaf5';
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(5, -7); ctx.lineTo(5, 7); ctx.closePath(); ctx.fill();
  if (slashTimer > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${slashTimer / 0.16})`;
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(0, 0, 75, -1.05, 1.05); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

function loop(now: number) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0);
  last = now;
  if (running) update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.code === 'Space') { event.preventEventDefault?.(); attack(); }
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') dash();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('mousemove', (event) => { mouse.x = event.clientX; mouse.y = event.clientY; });
window.addEventListener('mousedown', (event) => { if (event.button === 0) attack(); });

const joystick = document.querySelector<HTMLDivElement>('#joystick')!;
const stick = document.querySelector<HTMLDivElement>('#stick')!;
let joystickId: number | null = null;
joystick.addEventListener('touchstart', (event) => {
  event.preventDefault();
  joystickId = event.changedTouches[0].identifier;
}, { passive: false });
joystick.addEventListener('touchmove', (event) => {
  event.preventDefault();
  for (const touch of Array.from(event.changedTouches)) {
    if (touch.identifier !== joystickId) continue;
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const max = 42;
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
    touchMove = { x: dx / max, y: dy / max };
    mouse.x = player.x + dx;
    mouse.y = player.y + dy;
  }
}, { passive: false });
const resetJoystick = (event: TouchEvent) => {
  for (const touch of Array.from(event.changedTouches)) {
    if (touch.identifier === joystickId) {
      joystickId = null;
      touchMove = { x: 0, y: 0 };
      stick.style.transform = '';
    }
  }
};
joystick.addEventListener('touchend', resetJoystick);
joystick.addEventListener('touchcancel', resetJoystick);
document.querySelector<HTMLButtonElement>('#attackBtn')!.addEventListener('touchstart', (event) => { event.preventDefault(); attack(); }, { passive: false });
document.querySelector<HTMLButtonElement>('#dashBtn')!.addEventListener('touchstart', (event) => { event.preventDefault(); dash(); }, { passive: false });

document.querySelector<HTMLButtonElement>('#play')!.addEventListener('click', () => {
  reset();
  startScreen.style.display = 'none';
  running = true;
  showToast('Sobreviva à planície espiritual');
});

resize();
requestAnimationFrame(loop);
