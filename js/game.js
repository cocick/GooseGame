'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VW = canvas.width;
const VH = canvas.height;

// ---------- Мир ----------

const WORLD = { w: 2400, h: 1600 };
const BORDER = 40;
const NEST = { x: 190, y: 200, r: 70 };
const POND = { x: 760, y: 480, rx: 260, ry: 160 };

const RECTS = [
  { x: 1550, y: 120, w: 460, h: 300, kind: 'house' },
  { x: 2080, y: 1150, w: 180, h: 150, kind: 'shed' },
  { x: 1240, y: 860, w: 160, h: 90, kind: 'table' },
  // забор огорода, с калитками сверху и снизу
  { x: 260, y: 960, w: 180, h: 14, kind: 'fence' },
  { x: 560, y: 960, w: 180, h: 14, kind: 'fence' },
  { x: 260, y: 960, w: 14, h: 300, kind: 'fence' },
  { x: 726, y: 960, w: 14, h: 300, kind: 'fence' },
  { x: 260, y: 1246, w: 180, h: 14, kind: 'fence' },
  { x: 560, y: 1246, w: 180, h: 14, kind: 'fence' },
];

const TREES = [
  { x: 1100, y: 250, r: 70 }, { x: 1000, y: 1380, r: 76 }, { x: 1950, y: 620, r: 72 },
  { x: 2230, y: 420, r: 66 }, { x: 140, y: 1460, r: 70 }, { x: 1700, y: 1420, r: 74 },
  { x: 130, y: 800, r: 64 },
];
const TRUNK_R = 14;

const BUSHES = [
  { x: 1150, y: 600, r: 58 }, { x: 420, y: 760, r: 62 }, { x: 1820, y: 1050, r: 56 },
  { x: 2180, y: 880, r: 52 }, { x: 930, y: 1110, r: 52 }, { x: 1450, y: 1260, r: 60 },
  { x: 380, y: 300, r: 50 },
];

const WAYPOINTS = [
  { x: 1780, y: 520 }, { x: 1350, y: 780 }, { x: 500, y: 920 }, { x: 500, y: 1110 },
  { x: 500, y: 920 }, { x: 1000, y: 900 }, { x: 1300, y: 1150 }, { x: 2000, y: 1250 },
  { x: 2000, y: 800 },
];

const ITEM_DEFS = [
  { id: 'bread', name: 'хлеб', x: 1300, y: 885 },
  { id: 'keys', name: 'ключи', x: 1700, y: 455 },
  { id: 'carrot', name: 'морковку', x: 470, y: 1120 },
  { id: 'slipper', name: 'тапок', x: 1930, y: 470 },
  { id: 'radio', name: 'радио', x: 2040, y: 1340 },
  { id: 'hat', name: 'шляпу садовника', x: 0, y: 0, onHead: true },
];

// ---------- Утилиты ----------

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function inPond(x, y, pad = 0) {
  const dx = (x - POND.x) / (POND.rx + pad);
  const dy = (y - POND.y) / (POND.ry + pad);
  return dx * dx + dy * dy < 1;
}

function collide(e, r, avoidPond) {
  for (const s of RECTS) {
    const cx = clamp(e.x, s.x, s.x + s.w);
    const cy = clamp(e.y, s.y, s.y + s.h);
    const dx = e.x - cx, dy = e.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 1e-4) {
      const d = Math.sqrt(d2);
      e.x = cx + (dx / d) * r;
      e.y = cy + (dy / d) * r;
    } else {
      const l = e.x - s.x, rr = s.x + s.w - e.x, t = e.y - s.y, b = s.y + s.h - e.y;
      const m = Math.min(l, rr, t, b);
      if (m === l) e.x = s.x - r;
      else if (m === rr) e.x = s.x + s.w + r;
      else if (m === t) e.y = s.y - r;
      else e.y = s.y + s.h + r;
    }
  }
  for (const t of TREES) {
    const dx = e.x - t.x, dy = e.y - t.y;
    const d = Math.hypot(dx, dy);
    const min = TRUNK_R + r;
    if (d < min && d > 1e-4) {
      e.x = t.x + (dx / d) * min;
      e.y = t.y + (dy / d) * min;
    }
  }
  if (avoidPond) {
    const dx = (e.x - POND.x) / (POND.rx + r);
    const dy = (e.y - POND.y) / (POND.ry + r);
    const d = Math.hypot(dx, dy);
    if (d < 1 && d > 1e-4) {
      e.x = POND.x + (dx / d) * (POND.rx + r);
      e.y = POND.y + (dy / d) * (POND.ry + r);
    }
  }
  e.x = clamp(e.x, BORDER + r, WORLD.w - BORDER - r);
  e.y = clamp(e.y, BORDER + r, WORLD.h - BORDER - r);
}

function blocked(x, y) {
  for (const s of RECTS) {
    if (s.kind !== 'table' && x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) return true;
  }
  for (const t of TREES) {
    if (Math.hypot(x - t.x, y - t.y) < TRUNK_R) return true;
  }
  return false;
}

function lineOfSight(a, b) {
  const n = Math.ceil(dist(a, b) / 8);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (blocked(lerp(a.x, b.x, t), lerp(a.y, b.y, t))) return false;
  }
  return true;
}

// ---------- Состояние ----------

const game = { mode: 'title', time: 0, playTime: 0, scares: 0, swam: false, tasksDirty: true };
const cam = { x: 0, y: 0, shake: 0 };
let goose, gardener, items, popups, particles;

function reset() {
  goose = {
    x: 300, y: 330, vx: 0, vy: 0, r: 16, angle: 0,
    carrying: null, honkT: 0, honkCd: 0, stunT: 0, walkPhase: 0,
    inPond: false, hiddenIn: null, sneaking: false, running: false, lastHonkAt: -99,
  };
  gardener = {
    x: 1780, y: 560, vx: 0, vy: 0, r: 17, angle: Math.PI / 2,
    state: 'patrol', wp: 0, hat: true, carrying: null,
    stunT: 0, anger: 0, lostT: 0, waitT: 0, searchT: 0,
    lastSeen: { x: 0, y: 0 }, stuckT: 0, detourT: 0, detourAng: 0, walkPhase: 0,
  };
  items = ITEM_DEFS.map((d) => ({
    ...d, hx: d.x, hy: d.y, carriedBy: d.onHead ? 'head' : null, inNest: false, nestSlot: -1,
  }));
  popups = [];
  particles = [];
  game.time = 0;
  game.playTime = 0;
  game.scares = 0;
  game.swam = false;
  game.tasksDirty = true;
  cam.x = clamp(goose.x - VW / 2, 0, WORLD.w - VW);
  cam.y = clamp(goose.y - VH / 2, 0, WORLD.h - VH);
}

function beak() {
  const reach = 26 + (goose.honkT > 0 ? 8 : 0);
  return { x: goose.x + Math.cos(goose.angle) * reach, y: goose.y + Math.sin(goose.angle) * reach };
}

function handPos() {
  return { x: gardener.x + Math.cos(gardener.angle) * 22, y: gardener.y + Math.sin(gardener.angle) * 22 };
}

function popup(x, y, text, color = '#fff', size = 28) {
  popups.push({ x, y, text, color, size, t: 0, life: 1.1 });
}

function feathers(x, y, n, color = '#fff') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(40, 180);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
      t: 0, life: rand(0.6, 1.2), rot: Math.random() * 6, color, kind: 'feather',
    });
  }
}

function droplets(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(40, 140);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      t: 0, life: rand(0.3, 0.6), rot: 0, color: '#bfe6ff', kind: 'drop',
    });
  }
}

// ---------- Гусь ----------

function updateGoose(dt, inp) {
  const g = goose;
  g.honkCd -= dt;
  g.honkT -= dt;

  if (g.stunT > 0) {
    g.stunT -= dt;
    const k = Math.exp(-dt * 5);
    g.vx *= k; g.vy *= k;
  } else {
    g.sneaking = inp.sneak;
    g.running = inp.run && !inp.sneak && Math.hypot(inp.mx, inp.my) > 0.3;
    let spd = g.sneaking ? 95 : g.running ? 300 : 175;
    if (g.carrying) spd *= 0.92;
    if (g.inPond) spd *= 0.75;
    const k = 1 - Math.exp(-dt * 12);
    g.vx += (inp.mx * spd - g.vx) * k;
    g.vy += (inp.my * spd - g.vy) * k;
  }

  g.x += g.vx * dt;
  g.y += g.vy * dt;
  collide(g, g.r, false);

  const sp = Math.hypot(g.vx, g.vy);
  if (sp > 15 && g.stunT <= 0) g.angle += angDiff(g.angle, Math.atan2(g.vy, g.vx)) * Math.min(1, dt * 14);
  g.walkPhase += sp * dt * 0.09;
  if (g.running && Math.random() < dt * 6) feathers(g.x, g.y, 1);

  const was = g.inPond;
  g.inPond = inPond(g.x, g.y);
  if (g.inPond && !was) {
    Sfx.splash();
    droplets(g.x, g.y, 14);
    if (!game.swam) {
      game.swam = true;
      game.tasksDirty = true;
      taskDone('Искупался!');
    }
  }
  g.hiddenIn = BUSHES.find((b) => dist(b, g) < b.r - 8) || null;

  if (inp.pressed.honk && g.honkCd <= 0) honk();
  if (inp.pressed.grab) {
    if (g.carrying) dropItem();
    else tryGrab();
  }
}

function honk() {
  const g = goose;
  g.honkCd = 0.3;
  g.honkT = 0.3;
  g.lastHonkAt = game.time;
  Sfx.honk();
  Input.rumble(120, 0.15, 0.6);
  cam.shake = 5;
  const b = beak();
  popup(b.x, b.y - 20, pick(['ГА!', 'ГА-ГА!', 'ГАААА!', 'ГА!!', 'ГА-ГА-ГА!']), '#fff', 30);
  // Как в оригинале: гогот роняет то, что в клюве
  if (g.carrying) dropItem();
  if (dist(g, gardener) < 190 && gardener.state !== 'stunned') scareGardener();
}

function grabbable() {
  const b = beak();
  let best = null;
  let bd = 50;
  for (const it of items) {
    if (it.inNest || it.carriedBy === 'goose' || it.carriedBy === 'head') continue;
    const d = Math.hypot(it.x - b.x, it.y - b.y);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}

function tryGrab() {
  const it = grabbable();
  if (!it) return;
  if (it.carriedBy === 'gardener') {
    gardener.carrying = null;
    gardener.anger = 5;
    startChase();
    popup(gardener.x, gardener.y - 50, 'ЭЙ!', '#ffd34d');
  }
  it.carriedBy = 'goose';
  goose.carrying = it;
  Sfx.pickup();
  Input.rumble(60, 0, 0.4);
}

function dropItem() {
  const it = goose.carrying;
  if (!it) return;
  const b = beak();
  it.carriedBy = null;
  it.x = b.x;
  it.y = b.y;
  goose.carrying = null;
  if (Math.hypot(it.x - NEST.x, it.y - NEST.y) < NEST.r) {
    it.inNest = true;
    it.nestSlot = items.filter((o) => o.inNest).length - 1;
    const a = it.nestSlot * 1.15;
    it.x = NEST.x + Math.cos(a) * 30;
    it.y = NEST.y + Math.sin(a) * 22;
    game.tasksDirty = true;
    taskDone(`Стырил ${it.name}!`);
  } else {
    Sfx.drop();
  }
}

function taskDone(text) {
  Sfx.done();
  Input.rumble(250, 0.4, 0.8);
  popup(goose.x, goose.y - 60, '✔ ' + text, '#9cff6b', 26);
  feathers(goose.x, goose.y, 10, '#fff7a8');
}

// ---------- Садовник ----------

function canGardenerSee() {
  const G = gardener;
  const g = goose;
  if (G.state === 'stunned') return false;
  const d = dist(G, g);
  const range = g.sneaking ? 200 : 340;
  if (d > range) return false;
  const loud = game.time - g.lastHonkAt < 0.6;
  if (g.hiddenIn && !loud) return false;
  const a = Math.atan2(g.y - G.y, g.x - G.x);
  const inCone = Math.abs(angDiff(G.angle, a)) < 1.1;
  const heard = (loud && d < 380) || (g.running && d < 150) || d < 60;
  if (!inCone && !heard) return false;
  return lineOfSight(G, g);
}

function startChase() {
  const G = gardener;
  if (G.state !== 'chase') Input.rumble(150, 0.3, 0);
  G.state = 'chase';
  G.lostT = 0;
  G.lastSeen = { x: goose.x, y: goose.y };
}

function scareGardener() {
  const G = gardener;
  G.state = 'stunned';
  G.stunT = 1.8;
  game.scares++;
  game.tasksDirty = true;
  Sfx.scare();
  popup(G.x, G.y - 60, pick(['А-А-А!', 'ЁКАРНЫЙ БАБАЙ!', 'ЧТОБ ТЕБЯ!', 'АЙ, БЛИН!']), '#ffd34d', 26);
  if (game.scares === 3) taskDone('Напугал садовника 3 раза!');
  const away = Math.atan2(G.y - goose.y, G.x - goose.x);
  if (G.carrying) {
    const it = G.carrying;
    it.carriedBy = null;
    it.x = G.x + Math.cos(away + 1.2) * 30;
    it.y = G.y + Math.sin(away + 1.2) * 30;
    G.carrying = null;
  }
  if (G.hat) {
    G.hat = false;
    const hat = items.find((i) => i.id === 'hat');
    hat.carriedBy = null;
    const p = { x: G.x + Math.cos(away) * 46, y: G.y + Math.sin(away) * 46 };
    collide(p, 10, false);
    hat.x = p.x;
    hat.y = p.y;
    popup(hat.x, hat.y - 20, 'шляпа!', '#fff', 20);
  }
}

function catchGoose() {
  const G = gardener;
  const g = goose;
  const it = g.carrying;
  if (it) {
    g.carrying = null;
    if (it.id === 'hat') {
      it.carriedBy = 'head';
      G.hat = true;
      G.state = 'patrol';
    } else {
      it.carriedBy = 'gardener';
      G.carrying = it;
      G.state = 'return';
    }
    popup(G.x, G.y - 60, pick(['ПОПАЛСЯ!', 'А НУ ОТДАЙ!', 'МОЁ!']), '#ff4d4d', 30);
  } else {
    G.state = 'patrol';
    popup(G.x, G.y - 60, 'ПШЁЛ ВОН!', '#ff4d4d', 30);
  }
  G.anger = 0;
  const a = Math.atan2(g.y - G.y, g.x - G.x);
  g.vx = Math.cos(a) * 560;
  g.vy = Math.sin(a) * 560;
  g.stunT = 0.5;
  Sfx.caught();
  Input.rumble(380, 1, 0.8);
  cam.shake = 12;
  feathers(g.x, g.y, 18);
}

function moveGardener(dt, target, speed) {
  const G = gardener;
  let a = Math.atan2(target.y - G.y, target.x - G.x);
  const d = dist(G, target);
  if (G.detourT > 0) {
    G.detourT -= dt;
    a += G.detourAng;
  }
  const want = d < 6 ? 0 : speed;
  const k = 1 - Math.exp(-dt * 8);
  G.vx += (Math.cos(a) * want - G.vx) * k;
  G.vy += (Math.sin(a) * want - G.vy) * k;
  const ox = G.x, oy = G.y;
  G.x += G.vx * dt;
  G.y += G.vy * dt;
  collide(G, G.r, true);
  const moved = Math.hypot(G.x - ox, G.y - oy);
  const sp = Math.hypot(G.vx, G.vy);
  if (sp > 10) G.angle += angDiff(G.angle, Math.atan2(G.vy, G.vx)) * Math.min(1, dt * 8);
  G.walkPhase += moved * 0.12;
  // Упёрся в препятствие — обходим боком
  if (want > 0 && G.detourT <= 0 && moved < want * dt * 0.3) {
    G.stuckT += dt;
    if (G.stuckT > 0.35) {
      G.stuckT = 0;
      G.detourT = 0.8;
      G.detourAng = (Math.random() < 0.5 ? -1 : 1) * Math.PI * 0.5;
    }
  } else {
    G.stuckT = 0;
  }
  return d;
}

function stand(dt) {
  const G = gardener;
  const k = Math.exp(-dt * 10);
  G.vx *= k;
  G.vy *= k;
}

function nearestWaypoint() {
  let best = 0;
  let bd = Infinity;
  WAYPOINTS.forEach((w, i) => {
    const d = dist(w, gardener);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function updateGardener(dt) {
  const G = gardener;
  const sees = canGardenerSee();
  const hot = !!goose.carrying || G.anger > 0;
  G.anger = Math.max(0, G.anger - dt);

  switch (G.state) {
    case 'stunned':
      stand(dt);
      G.stunT -= dt;
      if (G.stunT <= 0) {
        G.anger = 5;
        if (canGardenerSee()) startChase();
        else { G.state = 'search'; G.searchT = 2; G.lastSeen = { x: goose.x, y: goose.y }; }
      }
      break;

    case 'patrol': {
      if (sees && hot) { startChase(); break; }
      if (G.waitT > 0) {
        G.waitT -= dt;
        stand(dt);
        G.angle += Math.sin(game.time * 1.5) * dt * 1.2;
        break;
      }
      const wp = WAYPOINTS[G.wp];
      if (moveGardener(dt, wp, 105) < 16) {
        G.wp = (G.wp + 1) % WAYPOINTS.length;
        G.waitT = rand(0.8, 2.2);
      }
      break;
    }

    case 'chase': {
      if (sees && !goose.inPond) {
        G.lastSeen = { x: goose.x, y: goose.y };
        G.lostT = 0;
      } else {
        G.lostT += dt * (goose.inPond ? 2 : 1);
      }
      if (G.lostT > 2.5 || !hot) {
        G.state = 'search';
        G.searchT = 2;
        popup(G.x, G.y - 55, pick(['Тьфу!', 'Где этот гусь?!', 'Зараза...']), '#ddd', 22);
        break;
      }
      moveGardener(dt, G.lastSeen, 235);
      if (dist(G, goose) < G.r + goose.r + 6 && goose.stunT <= 0 && !goose.inPond) catchGoose();
      break;
    }

    case 'search': {
      if (sees && hot) { startChase(); break; }
      if (moveGardener(dt, G.lastSeen, 120) < 20) {
        stand(dt);
        G.searchT -= dt;
        G.angle += dt * 2.5;
        if (G.searchT <= 0) { G.state = 'patrol'; G.wp = nearestWaypoint(); }
      }
      break;
    }

    case 'return': {
      const it = G.carrying;
      if (!it) { G.state = 'patrol'; G.wp = nearestWaypoint(); break; }
      if (moveGardener(dt, { x: it.hx, y: it.hy }, 125) < 34) {
        it.carriedBy = null;
        it.x = it.hx;
        it.y = it.hy;
        G.carrying = null;
        G.state = 'patrol';
        G.wp = nearestWaypoint();
        G.waitT = 0.8;
      }
      break;
    }
  }
}

function updateItems() {
  for (const it of items) {
    if (it.carriedBy === 'goose') Object.assign(it, beak());
    else if (it.carriedBy === 'gardener') Object.assign(it, handPos());
    else if (it.carriedBy === 'head') { it.x = gardener.x; it.y = gardener.y; }
  }
}

function updateFx(dt) {
  for (const p of popups) { p.t += dt; p.y -= dt * 40; }
  popups = popups.filter((p) => p.t < p.life);
  for (const p of particles) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-dt * 3);
    p.vy = p.vy * Math.exp(-dt * 3) + (p.kind === 'feather' ? 20 : 300) * dt;
    p.rot += dt * 4;
  }
  particles = particles.filter((p) => p.t < p.life);
  cam.shake = Math.max(0, cam.shake - dt * 30);
  const tx = clamp(goose.x - VW / 2, 0, WORLD.w - VW);
  const ty = clamp(goose.y - VH / 2, 0, WORLD.h - VH);
  const k = 1 - Math.exp(-dt * 6);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
}

// ---------- Задачи и HUD ----------

function tasks() {
  const list = items.map((it) => ({ text: `Стырить ${it.name} в гнездо`, done: it.inNest }));
  list.push({ text: `Напугать садовника (${Math.min(game.scares, 3)}/3)`, done: game.scares >= 3 });
  list.push({ text: 'Искупаться в пруду', done: game.swam });
  return list;
}

const $ = (id) => document.getElementById(id);

function renderTodo() {
  const list = tasks();
  $('todo-list').innerHTML = list
    .map((t) => `<li class="${t.done ? 'done' : ''}">${t.text}</li>`)
    .join('');
  return list.every((t) => t.done);
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function padLabel(action) {
  const pad = Input.state.lastSource === 'pad';
  const map = {
    grab: pad ? 'X' : 'E',
    honk: pad ? 'A' : 'Пробел',
  };
  return map[action];
}

function updatePadStatus() {
  const el = $('pad-status');
  const name = Input.state.padName;
  if (name) {
    el.textContent = '🎮 ' + name.replace(/\s*\(.*\)\s*/g, ' ').trim();
    el.className = 'ok';
  } else {
    el.textContent = '🎮 Подключи джойстик и нажми любую кнопку';
    el.className = '';
  }
  $('sound-hint').hidden = !Sfx.locked() || game.mode === 'title';
}

function setMode(mode) {
  game.mode = mode;
  $('title').hidden = mode !== 'title';
  $('pause').hidden = mode !== 'pause';
  $('win').hidden = mode !== 'win';
  $('hud').hidden = mode === 'title';
}

// ---------- Отрисовка ----------

const ground = document.createElement('canvas');

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function buildGround() {
  ground.width = WORLD.w;
  ground.height = WORLD.h;
  const g = ground.getContext('2d');
  const r = seeded(1337);
  g.fillStyle = '#74b84f';
  g.fillRect(0, 0, WORLD.w, WORLD.h);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(60,120,40,0.18)' : 'rgba(150,210,100,0.18)';
    g.beginPath();
    g.ellipse(r() * WORLD.w, r() * WORLD.h, 30 + r() * 90, 20 + r() * 60, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(40,100,30,0.5)';
  g.lineWidth = 2;
  for (let i = 0; i < 2500; i++) {
    const x = r() * WORLD.w, y = r() * WORLD.h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 3 + r() * 2, y - 7);
    g.moveTo(x + 3, y);
    g.lineTo(x + 4 + r() * 2, y - 6);
    g.stroke();
  }
  // тропинка
  const path = [[1780, 420], [1760, 700], [1400, 800], [900, 910], [500, 940], [500, 1240], [500, 1400]];
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [w, c] of [[52, '#b38b55'], [40, '#d2b07a']]) {
    g.strokeStyle = c;
    g.lineWidth = w;
    g.beginPath();
    path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
  // огород
  g.fillStyle = '#7a5530';
  g.fillRect(274, 974, 452, 272);
  for (let row = 0; row < 5; row++) {
    const y = 1005 + row * 50;
    g.fillStyle = '#5e3f22';
    g.fillRect(290, y - 8, 420, 16);
    for (let x = 300; x < 700; x += 28) {
      if (row === 2 && x > 400 && x < 600) continue;
      g.fillStyle = '#4caf3a';
      g.beginPath();
      g.ellipse(x, y - 4, 6, 9, 0.4, 0, Math.PI * 2);
      g.ellipse(x + 6, y - 6, 5, 8, -0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  // цветочки
  const colors = ['#ff6b8a', '#ffd34d', '#fff', '#b98cff', '#ff9a3d'];
  for (let i = 0; i < 400; i++) {
    const x = r() * WORLD.w, y = r() * WORLD.h;
    if (inPond(x, y, 30) || blocked(x, y)) continue;
    g.fillStyle = colors[(r() * colors.length) | 0];
    g.beginPath();
    g.arc(x, y, 3 + r() * 2, 0, Math.PI * 2);
    g.fill();
  }
  // живая изгородь по периметру
  g.fillStyle = '#2f6b2a';
  g.fillRect(0, 0, WORLD.w, BORDER);
  g.fillRect(0, WORLD.h - BORDER, WORLD.w, BORDER);
  g.fillRect(0, 0, BORDER, WORLD.h);
  g.fillRect(WORLD.w - BORDER, 0, BORDER, WORLD.h);
  g.fillStyle = '#3d8a35';
  for (let i = 0; i < 500; i++) {
    const side = i % 4;
    const t = r();
    const x = side < 2 ? t * WORLD.w : side === 2 ? r() * BORDER : WORLD.w - r() * BORDER;
    const y = side >= 2 ? t * WORLD.h : side === 0 ? r() * BORDER : WORLD.h - r() * BORDER;
    g.beginPath();
    g.arc(x, y, 10 + r() * 14, 0, Math.PI * 2);
    g.fill();
  }
}

function ell(x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function drawPond() {
  const t = game.time;
  ctx.fillStyle = '#c9b27a';
  ell(POND.x, POND.y, POND.rx + 14, POND.ry + 12);
  ctx.fill();
  ctx.fillStyle = '#3f8fcf';
  ell(POND.x, POND.y, POND.rx, POND.ry);
  ctx.fill();
  ctx.fillStyle = '#5aaee6';
  ell(POND.x - 20, POND.y - 15, POND.rx * 0.75, POND.ry * 0.7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const x = POND.x + Math.cos(i * 2.1) * POND.rx * 0.55;
    const y = POND.y + Math.sin(i * 1.7) * POND.ry * 0.5;
    const w = 14 + Math.sin(t * 2 + i) * 6;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x, y - 6, x + w, y);
    ctx.stroke();
  }
  for (const [x, y] of [[620, 420], [900, 560], [820, 380]]) {
    ctx.fillStyle = '#3a9a3a';
    ctx.beginPath();
    ctx.arc(x, y, 16, 0.3, Math.PI * 2 - 0.3);
    ctx.lineTo(x, y);
    ctx.fill();
  }
  ctx.fillStyle = '#ff9ad0';
  ctx.beginPath();
  ctx.arc(905, 556, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawNest() {
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ell(NEST.x, NEST.y + 8, NEST.r, NEST.r * 0.7);
  ctx.fill();
  ctx.fillStyle = '#8b5a2b';
  ell(NEST.x, NEST.y, NEST.r, NEST.r * 0.72);
  ctx.fill();
  ctx.fillStyle = '#5c3a1a';
  ell(NEST.x, NEST.y, NEST.r * 0.72, NEST.r * 0.5);
  ctx.fill();
  ctx.strokeStyle = '#b07a42';
  ctx.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    const a = i * 0.7;
    const r1 = NEST.r * 0.8;
    ctx.beginPath();
    ctx.moveTo(NEST.x + Math.cos(a) * r1, NEST.y + Math.sin(a) * r1 * 0.72);
    ctx.lineTo(NEST.x + Math.cos(a + 0.5) * NEST.r, NEST.y + Math.sin(a + 0.5) * NEST.r * 0.72);
    ctx.stroke();
  }
  ctx.fillStyle = '#f4efe0';
  for (const [dx, dy] of [[-12, -4], [8, -8], [0, 8]]) {
    ell(NEST.x + dx, NEST.y + dy, 9, 11);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ГНЕЗДО', NEST.x, NEST.y - NEST.r * 0.8 - 8);
}

function drawItem(it) {
  const t = game.time;
  ctx.save();
  ctx.translate(it.x, it.y);
  if (!it.carriedBy && !it.inNest) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ell(0, 6, 14, 6);
    ctx.fill();
    ctx.translate(0, Math.sin(t * 3 + it.hx) * 2 - 2);
  }
  if (it.carriedBy === 'goose') ctx.rotate(goose.angle + Math.PI / 2);
  switch (it.id) {
    case 'bread':
      ctx.fillStyle = '#c98a3e';
      ell(0, 0, 18, 10);
      ctx.fill();
      ctx.strokeStyle = '#8a5520';
      ctx.lineWidth = 2;
      for (const x of [-8, 0, 8]) {
        ctx.beginPath();
        ctx.moveTo(x - 3, -6);
        ctx.lineTo(x + 3, 6);
        ctx.stroke();
      }
      break;
    case 'keys':
      ctx.strokeStyle = '#e8c33a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(-6, 0, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#e8c33a';
      ctx.fillRect(0, -2, 14, 4);
      ctx.fillRect(9, 2, 3, 4);
      ctx.fillStyle = '#b0b8c0';
      ctx.fillRect(-4, 3, 4, 12);
      break;
    case 'carrot':
      ctx.fillStyle = '#ff8a1f';
      ctx.beginPath();
      ctx.moveTo(-6, -8);
      ctx.lineTo(6, -8);
      ctx.lineTo(0, 16);
      ctx.fill();
      ctx.fillStyle = '#3fae2a';
      ell(-3, -13, 3, 7, -0.4);
      ctx.fill();
      ell(3, -13, 3, 7, 0.4);
      ctx.fill();
      break;
    case 'slipper':
      ctx.fillStyle = '#ff7eb6';
      ell(0, 0, 9, 17);
      ctx.fill();
      ctx.fillStyle = '#d94f8c';
      ctx.fillRect(-9, -6, 18, 8);
      break;
    case 'radio':
      ctx.fillStyle = '#d33';
      ctx.fillRect(-15, -10, 30, 20);
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(-6, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd';
      ctx.fillRect(3, -5, 9, 4);
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, -10);
      ctx.lineTo(18, -22);
      ctx.stroke();
      if (!it.carriedBy) {
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.fillText('♪', 18 + Math.sin(t * 4) * 4, -24 - ((t * 20) % 12));
      }
      break;
    case 'hat':
      drawHat();
      break;
  }
  ctx.restore();
}

function drawHat() {
  ctx.fillStyle = '#c9a25a';
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a07a38';
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6b4a1e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.stroke();
}

function drawGoose() {
  const g = goose;
  const t = game.time;
  ctx.save();
  ctx.translate(g.x, g.y);
  if (g.inPond) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    const rr = 26 + ((t * 20) % 14);
    ell(0, 0, rr, rr * 0.7);
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ell(0, 8, 24, 13);
    ctx.fill();
  }
  if (g.stunT > 0) ctx.rotate(Math.sin(t * 40) * 0.15);
  ctx.rotate(g.angle);

  if (!g.inPond) {
    const s = Math.sin(g.walkPhase) * 6;
    ctx.fillStyle = '#ff9a1f';
    ell(-2 + s, 9, 7, 4);
    ctx.fill();
    ell(-2 - s, -9, 7, 4);
    ctx.fill();
  }

  // хвост
  ctx.fillStyle = '#e8e8e8';
  ctx.beginPath();
  ctx.moveTo(-18, -7);
  ctx.lineTo(-31, 0);
  ctx.lineTo(-18, 7);
  ctx.fill();

  // крылья нараспашку на бегу
  if (g.running) {
    const f = Math.sin(t * 28) * 0.5;
    ctx.fillStyle = '#f2f2f2';
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.9 + f));
      ell(-4, side * 22, 18, 9);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth = 2;
  ell(0, 0, 23, 16);
  ctx.fill();
  ctx.stroke();
  if (!g.running) {
    ctx.strokeStyle = '#d6d6d6';
    ctx.beginPath();
    ctx.ellipse(-4, -6, 14, 7, 0.1, 0, Math.PI);
    ctx.moveTo(10, 6);
    ctx.ellipse(-4, 6, 14, 7, -0.1, 0, Math.PI, true);
    ctx.stroke();
  }

  const stretch = g.honkT > 0 ? Math.sin((g.honkT / 0.3) * Math.PI) * 14 : 0;
  const hx = (g.sneaking ? 14 : 22) + stretch;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(hx, 0);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(hx, 0, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ff9a1f';
  const open = g.honkT > 0 ? 5 : 1;
  ctx.beginPath();
  ctx.moveTo(hx + 6, -4);
  ctx.lineTo(hx + 19, -open);
  ctx.lineTo(hx + 6, 0);
  ctx.moveTo(hx + 6, 0);
  ctx.lineTo(hx + 19, open);
  ctx.lineTo(hx + 6, 4);
  ctx.fill();

  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(hx + 2, -5, 2, 0, Math.PI * 2);
  ctx.arc(hx + 2, 5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGardener() {
  const G = gardener;
  const t = game.time;
  const jump = G.state === 'stunned' ? Math.abs(Math.sin(G.stunT * 12)) * 12 : 0;

  // конус зрения: подсказка игроку, куда лучше не соваться
  if (G.state !== 'stunned') {
    const range = goose.sneaking ? 200 : 340;
    ctx.fillStyle = G.state === 'chase' ? 'rgba(255,60,60,0.12)' : 'rgba(255,240,150,0.10)';
    ctx.beginPath();
    ctx.moveTo(G.x, G.y);
    ctx.arc(G.x, G.y, range, G.angle - 1.1, G.angle + 1.1);
    ctx.closePath();
    ctx.fill();
  }

  ctx.save();
  ctx.translate(G.x, G.y);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ell(0, 8, 22, 14);
  ctx.fill();
  ctx.translate(0, -jump);
  ctx.rotate(G.angle);

  const s = Math.sin(G.walkPhase) * 9;
  ctx.fillStyle = '#3b3b4f';
  ell(s, 8, 9, 6);
  ctx.fill();
  ell(-s, -8, 9, 6);
  ctx.fill();

  const arm = G.state === 'stunned' ? 14 : -s * 0.8;
  ctx.fillStyle = '#f0c49a';
  ctx.beginPath();
  ctx.arc(4 + arm, 21, 6, 0, Math.PI * 2);
  ctx.arc(4 - arm, -21, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3f7fbf';
  ell(0, 0, 13, 21);
  ctx.fill();
  ctx.fillStyle = '#2c5f93';
  ctx.fillRect(-8, -9, 16, 18);

  ctx.fillStyle = '#f0c49a';
  ctx.beginPath();
  ctx.arc(3, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c96';
  ctx.beginPath();
  ctx.arc(13, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  if (G.hat) {
    ctx.translate(2, 0);
    drawHat();
  } else {
    ctx.fillStyle = '#7a5a3a';
    ctx.beginPath();
    ctx.arc(1, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0c49a';
    ctx.beginPath();
    ctx.arc(1, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.textAlign = 'center';
  if (G.state === 'chase') {
    outlinedText('!', G.x, G.y - 38 - Math.abs(Math.sin(t * 10)) * 4, 34, '#ff4d4d');
  } else if (G.state === 'search') {
    outlinedText('?', G.x, G.y - 38, 30, '#ffd34d');
  } else if (G.state === 'stunned') {
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + (i * Math.PI * 2) / 3;
      outlinedText('★', G.x + Math.cos(a) * 18, G.y - 38 - jump + Math.sin(a) * 6, 16, '#ffe14d');
    }
  }
}

function drawTree(tr) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ell(tr.x + 10, tr.y + 10, tr.r * 0.9, tr.r * 0.6);
  ctx.fill();
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(tr.x - 9, tr.y - 30, 18, 34);
  const behind = goose.y < tr.y && Math.hypot(goose.x - tr.x, goose.y - (tr.y - 50)) < tr.r;
  ctx.globalAlpha = behind ? 0.55 : 1;
  for (const [dx, dy, k, c] of [
    [0, -60, 1, '#2e7d32'], [-22, -72, 0.6, '#388e3c'], [20, -80, 0.55, '#43a047'], [0, -95, 0.45, '#4caf50'],
  ]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(tr.x + dx, tr.y + dy, tr.r * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBush(b) {
  const hidden = goose.hiddenIn === b;
  ctx.globalAlpha = hidden ? 0.7 : 1;
  ctx.fillStyle = '#1f5e22';
  ctx.beginPath();
  ctx.arc(b.x, b.y + 6, b.r, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    ctx.fillStyle = i % 2 ? '#2f7d33' : '#3a8f3d';
    ctx.beginPath();
    ctx.arc(b.x + Math.cos(a) * b.r * 0.5, b.y + Math.sin(a) * b.r * 0.45, b.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#4caf50';
  ctx.beginPath();
  ctx.arc(b.x - b.r * 0.2, b.y - b.r * 0.2, b.r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawRect(s) {
  if (s.kind === 'house') {
    const facadeH = 110;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(s.x + 12, s.y + 12, s.w, s.h);
    ctx.fillStyle = '#efe0c0';
    ctx.fillRect(s.x, s.y + s.h - facadeH, s.w, facadeH);
    ctx.fillStyle = '#6b3b1f';
    ctx.fillRect(s.x + s.w / 2 - 25, s.y + s.h - 80, 50, 80);
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(s.x + s.w / 2 + 14, s.y + s.h - 40, 3, 0, Math.PI * 2);
    ctx.fill();
    for (const wx of [s.x + 50, s.x + s.w - 130]) {
      ctx.fillStyle = '#8fd0ff';
      ctx.fillRect(wx, s.y + s.h - 85, 80, 50);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.strokeRect(wx, s.y + s.h - 85, 80, 50);
      ctx.beginPath();
      ctx.moveTo(wx + 40, s.y + s.h - 85);
      ctx.lineTo(wx + 40, s.y + s.h - 35);
      ctx.stroke();
    }
    ctx.fillStyle = '#b5452b';
    ctx.fillRect(s.x - 15, s.y - 10, s.w + 30, s.h - facadeH + 10);
    ctx.strokeStyle = '#8f3320';
    ctx.lineWidth = 3;
    for (let y = s.y + 10; y < s.y + s.h - facadeH; y += 22) {
      ctx.beginPath();
      ctx.moveTo(s.x - 15, y);
      ctx.lineTo(s.x + s.w + 15, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#7d2f1d';
    ctx.fillRect(s.x - 15, s.y + (s.h - facadeH) / 2 - 6, s.w + 30, 12);
    ctx.fillStyle = '#6d6d6d';
    ctx.fillRect(s.x + s.w - 90, s.y + 20, 36, 50);
  } else if (s.kind === 'shed') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(s.x + 10, s.y + 10, s.w, s.h);
    ctx.fillStyle = '#a0703c';
    ctx.fillRect(s.x, s.y + s.h - 60, s.w, 60);
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(s.x + s.w / 2 - 22, s.y + s.h - 55, 44, 55);
    ctx.fillStyle = '#6f7f8f';
    ctx.fillRect(s.x - 8, s.y - 6, s.w + 16, s.h - 54);
    ctx.strokeStyle = '#596673';
    ctx.lineWidth = 2;
    for (let x = s.x; x < s.x + s.w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, s.y - 6);
      ctx.lineTo(x, s.y + s.h - 60);
      ctx.stroke();
    }
  } else if (s.kind === 'table') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(s.x + 8, s.y + 8, s.w, s.h);
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(s.x - 10, s.y - 22, s.w + 20, 14);
    ctx.fillRect(s.x - 10, s.y + s.h + 8, s.w + 20, 14);
    ctx.fillStyle = '#b07a42';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 2;
    for (let y = s.y + 18; y < s.y + s.h; y += 18) {
      ctx.beginPath();
      ctx.moveTo(s.x, y);
      ctx.lineTo(s.x + s.w, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x + 120, s.y + 40, 14, 0, Math.PI * 2);
    ctx.fill();
  } else if (s.kind === 'fence') {
    ctx.fillStyle = '#d9c09a';
    if (s.w > s.h) {
      ctx.fillRect(s.x, s.y + 2, s.w, 4);
      ctx.fillRect(s.x, s.y + 9, s.w, 4);
      for (let x = s.x; x <= s.x + s.w - 8; x += 30) {
        ctx.fillStyle = '#c4a57a';
        ctx.fillRect(x, s.y - 14, 10, 28);
        ctx.fillStyle = '#d9c09a';
      }
    } else {
      ctx.fillRect(s.x + 2, s.y, 4, s.h);
      ctx.fillRect(s.x + 8, s.y, 4, s.h);
      for (let y = s.y; y <= s.y + s.h; y += 30) {
        ctx.fillStyle = '#c4a57a';
        ctx.fillRect(s.x, y - 14, 14, 18);
        ctx.fillStyle = '#d9c09a';
      }
    }
  }
}

function outlinedText(text, x, y, size, color) {
  ctx.font = `900 ${size}px system-ui, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = Math.max(3, size / 6);
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function render() {
  const sx = (Math.random() - 0.5) * cam.shake;
  const sy = (Math.random() - 0.5) * cam.shake;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2f6b2a';
  ctx.fillRect(0, 0, VW, VH);
  ctx.translate(-Math.round(cam.x + sx), -Math.round(cam.y + sy));

  ctx.drawImage(ground, 0, 0);
  drawPond();
  drawNest();

  for (const it of items) if (!it.carriedBy) drawItem(it);

  // всё, что стоит на земле, рисуем по Y, чтобы ближние перекрывали дальние
  const drawables = [];
  for (const s of RECTS) drawables.push({ y: s.y + s.h, fn: () => drawRect(s) });
  for (const tr of TREES) drawables.push({ y: tr.y, fn: () => drawTree(tr) });
  drawables.push({
    y: goose.y,
    fn: () => {
      drawGoose();
      if (goose.carrying) drawItem(goose.carrying);
    },
  });
  drawables.push({
    y: gardener.y,
    fn: () => {
      drawGardener();
      if (gardener.carrying) drawItem(gardener.carrying);
    },
  });
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.fn();

  for (const b of BUSHES) drawBush(b);

  for (const p of particles) {
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillStyle = p.color;
    if (p.kind === 'feather') ell(p.x, p.y, 5, 2.5, p.rot);
    else ell(p.x, p.y, 3, 3);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // подсказка "схватить"
  if (game.mode === 'play' && !goose.carrying && goose.stunT <= 0) {
    const it = grabbable();
    if (it) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(it.x, it.y, 22 + Math.sin(game.time * 6) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      outlinedText(`${padLabel('grab')} — схватить`, it.x, it.y - 30, 16, '#fff');
    }
  }

  for (const p of popups) {
    const k = p.t / p.life;
    ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    const sc = k < 0.15 ? 0.6 + (k / 0.15) * 0.4 : 1;
    outlinedText(p.text, p.x, p.y, p.size * sc, p.color);
  }
  ctx.globalAlpha = 1;

  if (goose.hiddenIn && game.mode === 'play') {
    outlinedText('🌿 спрятался', goose.x, goose.y + 44, 14, '#cfffbf');
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (game.mode === 'play' || game.mode === 'pause') {
    outlinedText(fmtTime(game.playTime), VW - 70, 44, 28, '#fff');
  }
}

// ---------- Цикл ----------

let last = performance.now();
let lastPadSeen = false;
let statusT = 0;

Input.onPad((ev) => {
  if (ev === 'disconnected' && game.mode === 'play') setMode('pause');
});

// Звук в браузере включается только после клика/клавиши. Геймпад, увы, не считается.
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => Sfx.unlock());

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const inp = Input.poll();
  if (Object.values(inp.pressed).some(Boolean)) Sfx.unlock();
  game.time += dt;

  if (game.mode === 'title') {
    if (inp.pressed.confirm) { reset(); setMode('play'); }
  } else if (game.mode === 'play') {
    if (inp.pressed.pause) setMode('pause');
    else {
      game.playTime += dt;
      updateGoose(dt, inp);
      updateGardener(dt);
      updateItems();
      if (game.tasksDirty) {
        game.tasksDirty = false;
        if (renderTodo()) {
          setMode('win');
          $('win-time').textContent = fmtTime(game.playTime);
          Sfx.win();
          Input.rumble(600, 0.8, 1);
        }
      }
    }
  } else if (game.mode === 'pause') {
    if (inp.pressed.pause || inp.pressed.honk) setMode('play');
    else if (inp.pressed.restart) { reset(); setMode('play'); }
  } else if (game.mode === 'win') {
    if (inp.pressed.confirm || inp.pressed.restart) { reset(); setMode('play'); }
  }

  if (game.mode !== 'pause') updateFx(dt);
  render();

  const padNow = !!inp.padName;
  statusT -= dt;
  if (padNow !== lastPadSeen || statusT <= 0) {
    updatePadStatus();
    statusT = 0.5;
  }
  lastPadSeen = padNow;

  requestAnimationFrame(frame);
}

buildGround();
reset();
setMode('title');
updatePadStatus();
requestAnimationFrame(frame);
