'use strict';

// ---------- Константы ----------

const ARENA_R = 57;
const SPAWN_R = 64;
const BASE_R = 4.2;
const BASE_MAX_HP = 600;
const GOOSE_R = 0.45;

const ZTYPES = {
  walker: { hp: 60, speed: 1.7, dmg: 8, scale: 1, skin: 0x6f9a5a, shirt: 0x5a4a7a, pants: 0x3a3a4a, score: 10 },
  runner: { hp: 35, speed: 3.9, dmg: 6, scale: 0.9, skin: 0x9ab870, shirt: 0x8a3030, pants: 0x2a3a5a, score: 15 },
  brute: { hp: 340, speed: 1.15, dmg: 25, scale: 1.7, skin: 0x557a45, shirt: 0x3a3a3a, pants: 0x4a3a2a, score: 60 },
};

const UPGRADES = [
  { id: 'dmg', icon: '💥', name: 'Злые пули', desc: '+25% урона', apply: (s) => { s.dmg *= 1.25; } },
  { id: 'rate', icon: '⚡', name: 'Скорострел', desc: '+20% скорострельности', apply: (s) => { s.rate *= 1.2; } },
  { id: 'mag', icon: '📦', name: 'Большой магазин', desc: '+10 патронов в магазине', apply: (s) => { s.mag += 10; } },
  { id: 'reload', icon: '🔄', name: 'Шустрые крылья', desc: 'Перезарядка на 30% быстрее', apply: (s) => { s.reload *= 0.7; } },
  {
    id: 'hp', icon: '❤️', name: 'Жирный гусь', desc: '+30 к здоровью и полное лечение',
    apply: (s) => { s.maxHp += 30; player.hp = s.maxHp; },
  },
  {
    id: 'repair', icon: '🔨', name: 'Починить гнездо', desc: '+40% прочности гнезда',
    apply: () => { game.baseHp = Math.min(BASE_MAX_HP, game.baseHp + BASE_MAX_HP * 0.4); },
  },
  {
    id: 'honk', icon: '📢', name: 'Громкий ГА', desc: 'ГА! чаще, дальше и больнее',
    apply: (s) => { s.honkCd *= 0.65; s.honkR += 1.5; s.honkDmg += 15; },
  },
  { id: 'pierce', icon: '🗡️', name: 'Пробивные', desc: 'Пуля прошивает ещё одного зомби', apply: (s) => { s.pierce += 1; } },
  {
    id: 'shotgun', icon: '🔫', name: 'Дробь', desc: '+2 дробины на выстрел, каждая чуть слабее',
    apply: (s) => { s.pellets += 2; s.dmg *= 0.75; },
  },
  { id: 'speed', icon: '👟', name: 'Быстрые лапы', desc: '+15% скорости гуся', apply: (s) => { s.speed *= 1.15; } },
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const $ = (id) => document.getElementById(id);

// ---------- Рендер и сцена ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = 0x1b2638;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 28, 80);

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

scene.add(new THREE.HemisphereLight(0x9fb4dd, 0x2a3a20, 1.1));
const moon = new THREE.DirectionalLight(0xd0dcff, 1.6);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
moon.shadow.bias = -0.0008;
scene.add(moon, moon.target);

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}

function mesh(geo, material, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// Коллайдеры — вертикальные цилиндры: и для ходьбы, и чтобы пули в них упирались
const colliders = [];

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3f6b32';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(30,70,25,0.5)' : 'rgba(110,160,70,0.35)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 4 + Math.random() * 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(50, 50);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildWorld() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshLambertMaterial({ map: grassTexture() }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const dirt = new THREE.Mesh(new THREE.CircleGeometry(15, 48), mat(0x6b5236));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = 0.01;
  dirt.receiveShadow = true;
  scene.add(dirt);

  // Сарай с гнездом на крыше — это и есть база
  const barn = new THREE.Group();
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  mesh(box(6, 3.6, 6), mat(0xa8322a), 0, 1.8, 0, barn);
  mesh(box(6.6, 0.35, 6.6), mat(0x3a2a20), 0, 3.75, 0, barn);
  for (const [x, z, ry] of [[0, 3.01, 0], [0, -3.01, 0], [3.01, 0, Math.PI / 2], [-3.01, 0, Math.PI / 2]]) {
    const door = new THREE.Group();
    door.position.set(x, 0, z);
    door.rotation.y = ry;
    mesh(box(2.2, 2.6, 0.08), mat(0x6e1f1a), 0, 1.3, 0, door);
    for (const s of [-1, 1]) {
      const bar = mesh(box(0.18, 3.2, 0.1), mat(0xf2ead8), 0, 1.3, 0.02, door);
      bar.rotation.z = s * 0.7;
    }
    barn.add(door);
  }
  const nest = mesh(new THREE.TorusGeometry(1.7, 0.55, 10, 24), mat(0x8b5a2b), 0, 4.3, 0, barn);
  nest.rotation.x = Math.PI / 2;
  for (const [x, z] of [[-0.5, 0.2], [0.45, -0.3], [0.1, 0.55]]) {
    const egg = mesh(new THREE.SphereGeometry(0.42, 14, 10), mat(0xf6f0dc), x, 4.4, z, barn);
    egg.scale.y = 1.3;
  }
  scene.add(barn);
  colliders.push({ x: 0, z: 0, r: BASE_R, h: 5, base: true });
  game.barn = barn;

  // Фонари у базы
  for (const [x, z] of [[7, 7], [-7, -7], [7, -7], [-7, 7]]) {
    mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6), mat(0x333333), x, 1.7, z, scene);
    mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd28a }), x, 3.5, z, scene);
    const l = new THREE.PointLight(0xffb860, 25, 18, 1.6);
    l.position.set(x, 3.4, z);
    scene.add(l);
    colliders.push({ x, z, r: 0.2, h: 3.4 });
  }

  // Ящики и бочки-укрытия
  const crateGeo = box(1.3, 1.3, 1.3);
  for (const [x, z, stack] of [[10, 3, 1], [-8, 9, 0], [4, -11, 1], [-12, -5, 0], [13, -9, 0], [-3, 14, 1], [16, 12, 0], [-17, 3, 1]]) {
    const c = mesh(crateGeo, mat(0x9a6b38), x, 0.65, z, scene);
    c.rotation.y = rand(0, 1);
    if (stack) {
      const c2 = mesh(crateGeo, mat(0x8a5e30), x + 0.1, 1.95, z - 0.1, scene);
      c2.rotation.y = rand(0, 1);
    }
    colliders.push({ x, z, r: 0.9, h: stack ? 2.6 : 1.3 });
  }
  const barrelGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12);
  for (const [x, z] of [[11.5, 4.5], [-9.5, 10], [5.5, -12.5], [-14, 14]]) {
    mesh(barrelGeo, mat(0x4a6b8a), x, 0.6, z, scene);
    colliders.push({ x, z, r: 0.55, h: 1.2 });
  }

  // Ёлки по кругу
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2, 7);
  const coneGeo = [new THREE.ConeGeometry(2.2, 3, 8), new THREE.ConeGeometry(1.7, 2.6, 8), new THREE.ConeGeometry(1.1, 2.2, 8)];
  let placed = 0;
  for (let tries = 0; placed < 60 && tries < 2000; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(22, 75);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (colliders.some((c) => Math.hypot(c.x - x, c.z - z) < 4.5)) continue;
    const s = rand(0.8, 1.5);
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    tree.scale.setScalar(s);
    mesh(trunkGeo, mat(0x5a3b22), 0, 1, 0, tree);
    coneGeo.forEach((g, i) => mesh(g, mat([0x1f4a2a, 0x255a30, 0x2d6a38][i]), 0, 2.6 + i * 1.4, 0, tree));
    scene.add(tree);
    colliders.push({ x, z, r: 0.4 * s, h: 8 * s });
    placed++;
  }

  // Камни и трава для красоты
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(17, 70);
    const s = rand(0.3, 1);
    const rock = mesh(rockGeo, mat(0x6d7178), Math.cos(a) * r, s * 0.4, Math.sin(a) * r, scene);
    rock.scale.set(s, s * 0.7, s);
    rock.rotation.set(rand(0, 3), rand(0, 3), 0);
    if (s > 0.7) colliders.push({ x: rock.position.x, z: rock.position.z, r: s * 0.8, h: s });
  }
  const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.08, 0.4, 4), mat(0x4f8a3a), 2500);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < tufts.count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(14, 90);
    m4.makeRotationZ(rand(-0.3, 0.3));
    m4.setPosition(Math.cos(a) * r, 0.2, Math.sin(a) * r);
    tufts.setMatrixAt(i, m4);
  }
  scene.add(tufts);
}

// ---------- Модели ----------

function makeGoose() {
  const g = new THREE.Group();
  const white = mat(0xf5f5f0);
  const orange = mat(0xff9a1f);
  const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const parts = {};

  const body = new THREE.Group();
  g.add(body);
  mesh(new THREE.SphereGeometry(0.5, 16, 12), white, 0, 0.75, 0, body).scale.set(0.75, 0.62, 1);
  const tail = mesh(new THREE.ConeGeometry(0.22, 0.45, 8), white, 0, 0.88, 0.52, body);
  tail.rotation.x = Math.PI / 2 + 0.4;
  parts.neck = new THREE.Group();
  parts.neck.position.set(0, 1.0, -0.3);
  body.add(parts.neck);
  const neck = mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.7, 10), white, 0, 0.3, -0.05, parts.neck);
  neck.rotation.x = -0.2;
  mesh(new THREE.SphereGeometry(0.2, 12, 10), white, 0, 0.66, -0.14, parts.neck);
  const beak = mesh(new THREE.ConeGeometry(0.08, 0.32, 8), orange, 0, 0.62, -0.42, parts.neck);
  beak.rotation.x = -Math.PI / 2;
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.035, 6, 6), black, s * 0.14, 0.72, -0.24, parts.neck);

  parts.legs = [-1, 1].map((s) => {
    const leg = new THREE.Group();
    leg.position.set(s * 0.16, 0.45, 0);
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 6), orange, 0, -0.21, 0, leg);
    mesh(new THREE.BoxGeometry(0.18, 0.04, 0.26), orange, 0, -0.42, -0.08, leg);
    g.add(leg);
    return leg;
  });

  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.5, 12, 10), mat(0xe8e8e2), s * 0.34, 0.82, 0.05, body).scale.set(0.22, 0.45, 0.8);
  }

  // Пушка под правым крылом
  parts.gun = new THREE.Group();
  parts.gun.position.set(0.45, 0.95, -0.25);
  body.add(parts.gun);
  mesh(new THREE.BoxGeometry(0.14, 0.2, 0.6), mat(0x2b2f36), 0, 0, 0, parts.gun);
  mesh(new THREE.BoxGeometry(0.1, 0.22, 0.12), mat(0x2b2f36), 0, -0.16, 0.12, parts.gun);
  const barrel = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8), mat(0x555c66), 0, 0.03, -0.52, parts.gun);
  barrel.rotation.x = Math.PI / 2;
  parts.muzzle = new THREE.Object3D();
  parts.muzzle.position.set(0, 0.03, -0.8);
  parts.gun.add(parts.muzzle);

  parts.flash = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
  parts.flash.visible = false;
  parts.muzzle.add(parts.flash);
  parts.flashLight = new THREE.PointLight(0xffc860, 0, 10, 2);
  parts.muzzle.add(parts.flashLight);

  parts.body = body;
  scene.add(g);
  return { group: g, parts };
}

const zGeo = {
  leg: new THREE.BoxGeometry(0.22, 0.8, 0.25),
  torso: new THREE.BoxGeometry(0.62, 0.75, 0.36),
  head: new THREE.BoxGeometry(0.42, 0.42, 0.42),
  arm: new THREE.BoxGeometry(0.17, 0.72, 0.17),
  eye: new THREE.BoxGeometry(0.08, 0.06, 0.03),
};
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });

function makeZombie(typeName, hpMul) {
  const def = ZTYPES[typeName];
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  inner.scale.setScalar(def.scale);
  const skin = new THREE.MeshLambertMaterial({ color: def.skin });
  const shirt = new THREE.MeshLambertMaterial({ color: def.shirt });

  const limb = (x, y, geo, material) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    mesh(geo, material, 0, -0.38, 0, pivot);
    inner.add(pivot);
    return pivot;
  };
  const legs = [limb(-0.16, 0.8, zGeo.leg, mat(def.pants)), limb(0.16, 0.8, zGeo.leg, mat(def.pants))];
  mesh(zGeo.torso, shirt, 0, 1.18, 0, inner);
  const head = mesh(zGeo.head, skin, 0, 1.78, 0, inner);
  head.rotation.z = rand(-0.25, 0.25);
  for (const s of [-1, 1]) mesh(zGeo.eye, eyeMat, s * 0.1, 0.04, -0.215, head);
  const arms = [limb(-0.42, 1.48, zGeo.arm, skin), limb(0.42, 1.48, zGeo.arm, skin)];

  const a = Math.random() * Math.PI * 2;
  group.position.set(Math.cos(a) * SPAWN_R, 0, Math.sin(a) * SPAWN_R);
  scene.add(group);

  const hp = def.hp * hpMul;
  return {
    def, type: typeName, group, inner, legs, arms, head, skin, shirt,
    hp, maxHp: hp, vx: 0, vz: 0, stunT: 0, attackCd: rand(0.3, 1), attackAnim: 0,
    flashT: 0, dead: false, deadT: 0, walkPhase: rand(0, 6), speedMul: rand(0.85, 1.15),
  };
}

// ---------- Эффекты ----------

const particleGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
const particleMats = {
  goo: new THREE.MeshBasicMaterial({ color: 0x7dff4a }),
  feather: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  wood: new THREE.MeshBasicMaterial({ color: 0xc08a50 }),
  dirt: new THREE.MeshBasicMaterial({ color: 0x8a7050 }),
};
const particles = [];
for (let i = 0; i < 260; i++) {
  const m = new THREE.Mesh(particleGeo, particleMats.goo);
  m.visible = false;
  scene.add(m);
  particles.push({ mesh: m, vx: 0, vy: 0, vz: 0, t: 0, life: 0 });
}
let particleIdx = 0;

function burst(pos, n, kind, power = 4) {
  for (let i = 0; i < n; i++) {
    const p = particles[particleIdx];
    particleIdx = (particleIdx + 1) % particles.length;
    p.mesh.material = particleMats[kind];
    p.mesh.position.copy(pos);
    p.mesh.visible = true;
    const s = rand(0.6, 1.6);
    p.mesh.scale.setScalar(s);
    p.vx = rand(-1, 1) * power;
    p.vy = rand(0.3, 1.2) * power;
    p.vz = rand(-1, 1) * power;
    p.t = 0;
    p.life = rand(0.4, 0.9);
  }
}

const tracers = [];
for (let i = 0; i < 24; i++) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true }));
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, t: 0 });
}
let tracerIdx = 0;

function tracer(a, b) {
  const tr = tracers[tracerIdx];
  tracerIdx = (tracerIdx + 1) % tracers.length;
  const arr = tr.line.geometry.attributes.position.array;
  arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
  arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
  tr.line.geometry.attributes.position.needsUpdate = true;
  tr.line.visible = true;
  tr.t = 0.07;
}

const shock = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1, 48),
  new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, side: THREE.DoubleSide }),
);
shock.rotation.x = -Math.PI / 2;
shock.visible = false;
scene.add(shock);
let shockT = 0;
let shockR = 1;

// ---------- Состояние ----------

const game = {
  mode: 'title', phase: 'countdown', phaseT: 0, wave: 0, baseHp: BASE_MAX_HP,
  score: 0, kills: 0, spawnQueue: [], spawnT: 0, shake: 0, groanT: 0, barn: null,
  upgradeChoices: [], upgradeSel: 0, hitmarkT: 0,
};

let goose;
let zombies = [];
const player = {
  pos: new THREE.Vector3(), vx: 0, vz: 0, yaw: 0, pitch: 0, hp: 100, dead: false, respawnT: 0,
  ammo: 0, reloadT: 0, fireCd: 0, honkCd: 0, honkAnim: 0, bloom: 0, hurtT: 0, walkPhase: 0, adsK: 0,
  stats: null,
};

function newStats() {
  return {
    dmg: 22, rate: 8, mag: 24, reload: 1.4, speed: 5.5, maxHp: 100,
    honkCd: 7, honkR: 6.5, honkDmg: 20, pierce: 0, pellets: 1,
  };
}

function resetGame() {
  for (const z of zombies) scene.remove(z.group);
  zombies = [];
  player.stats = newStats();
  player.pos.set(0, 0, 7);
  player.vx = player.vz = 0;
  player.yaw = 0;
  player.pitch = -0.08;
  player.hp = player.stats.maxHp;
  player.dead = false;
  player.ammo = player.stats.mag;
  player.reloadT = 0;
  player.honkCd = 0;
  player.bloom = 0;
  goose.group.rotation.set(0, 0, 0);
  game.wave = 0;
  game.baseHp = BASE_MAX_HP;
  game.score = 0;
  game.kills = 0;
  startWave();
}

function startWave() {
  game.wave++;
  const n = game.wave;
  const total = 5 + n * 4;
  const brutes = n >= 3 ? Math.floor(n / 3) + (n >= 7 ? 1 : 0) : 0;
  const runners = n >= 2 ? Math.floor(total * Math.min(0.45, 0.1 * n)) : 0;
  const q = [];
  for (let i = 0; i < brutes; i++) q.push('brute');
  for (let i = 0; i < runners; i++) q.push('runner');
  while (q.length < total) q.push('walker');
  for (let i = q.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [q[i], q[j]] = [q[j], q[i]];
  }
  game.spawnQueue = q;
  game.spawnT = 0;
  game.phase = 'countdown';
  game.phaseT = 3;
  banner(`ВОЛНА ${n}`, 2.5);
  Sfx.wave();
}

// ---------- Утилиты для лучей ----------

const tmpV = new THREE.Vector3();

function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  return t > 0 ? t : null;
}

function rayCylinder(o, d, c) {
  const dx = d.x, dz = d.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return null;
  const ox = o.x - c.x, oz = o.z - c.z;
  const b = ox * dx + oz * dz;
  const cc = ox * ox + oz * oz - c.r * c.r;
  const disc = b * b - a * cc;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  if (t < 0) return null;
  const y = o.y + d.y * t;
  return y >= 0 && y <= c.h ? t : null;
}

function zombieSpheres(z) {
  const s = z.def.scale;
  const p = z.group.position;
  return {
    body: { x: p.x, y: 1.15 * s, z: p.z, r: 0.48 * s },
    head: { x: p.x, y: (1.78 + z.inner.position.y) * s, z: p.z, r: 0.3 * s },
  };
}

function collideCircle(p, r, skipBase = false) {
  for (const c of colliders) {
    if (skipBase && c.base) continue;
    const dx = p.x - c.x, dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + r;
    if (d < min && d > 1e-4) {
      p.x = c.x + (dx / d) * min;
      p.z = c.z + (dz / d) * min;
    }
  }
}

// ---------- Игрок ----------

function aimDir() {
  return camera.getWorldDirection(new THREE.Vector3());
}

function assistTarget(dir, cone) {
  let best = null;
  let bestAng = cone;
  for (const z of zombies) {
    if (z.dead) continue;
    const sp = zombieSpheres(z).body;
    tmpV.set(sp.x - camera.position.x, sp.y - camera.position.y, sp.z - camera.position.z);
    const dist = tmpV.length();
    if (dist > 45) continue;
    const ang = tmpV.angleTo(dir);
    // на дальних дистанциях конус чуть шире, чтобы мелкие цели тоже ловились
    const lim = cone * (1 + Math.min(1, dist / 30) * 0.5);
    if (ang < lim && ang < bestAng * 1.5) {
      if (!best || ang < bestAng) {
        best = { z, dir: tmpV.clone().normalize() };
        bestAng = ang;
      }
    }
  }
  return best;
}

function updateCamera(dt, inp) {
  const p = player;
  p.adsK = lerp(p.adsK, inp.aim && !p.dead ? 1 : 0, 1 - Math.exp(-dt * 14));
  const pad = Input.state.lastSource === 'pad';

  let sens = lerp(3.2, 1.5, p.adsK);
  if (pad && !p.dead && assistTarget(aimDir(), 0.07)) sens *= 0.5; // "липкий" прицел
  const cx = inp.rx * Math.abs(inp.rx);
  const cy = inp.ry * Math.abs(inp.ry);
  p.yaw -= cx * sens * dt;
  p.pitch -= cy * sens * 0.65 * dt;
  const [mdx, mdy] = Input.takeMouse();
  const ms = lerp(0.0024, 0.0013, p.adsK);
  p.yaw -= mdx * ms;
  p.pitch -= mdy * ms;
  p.pitch = clamp(p.pitch, -0.6, 0.55);

  const cp = Math.cos(p.pitch);
  const d = new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
  const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
  const dist = lerp(4.4, 2.4, p.adsK);
  const pivot = p.pos.clone().add(new THREE.Vector3(0, 2.05, 0)).addScaledVector(right, lerp(1.3, 1.0, p.adsK));
  const camPos = pivot.clone().addScaledVector(d, -dist);
  camPos.y = Math.max(0.35, camPos.y);
  if (game.shake > 0) camPos.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(game.shake * 0.03));
  camera.position.copy(camPos);
  camera.lookAt(pivot.addScaledVector(d, 25));
  const fov = lerp(72, 50, p.adsK);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

function updatePlayer(dt, inp) {
  const p = player;
  const s = p.stats;
  const parts = goose.parts;
  p.fireCd -= dt;
  p.honkCd -= dt;
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.bloom = Math.max(0, p.bloom - dt * 0.12);
  p.honkAnim = Math.max(0, p.honkAnim - dt);

  if (p.dead) {
    p.respawnT -= dt;
    goose.group.rotation.z = lerp(goose.group.rotation.z, Math.PI / 2, 1 - Math.exp(-dt * 8));
    banner(`ГУСЯ ВЫРУБИЛИ... ${Math.ceil(p.respawnT)}`, 0.2);
    if (p.respawnT <= 0) {
      p.dead = false;
      p.hp = s.maxHp * 0.6;
      p.pos.set(0, 0, 6.5);
      goose.group.rotation.z = 0;
      p.ammo = s.mag;
      p.reloadT = 0;
      burst(new THREE.Vector3(p.pos.x, 1, p.pos.z), 20, 'feather', 5);
    }
    goose.group.position.copy(p.pos);
    return;
  }

  // движение относительно камеры
  const ads = inp.aim;
  const sprint = inp.sprint && !ads && !inp.fire;
  let speed = s.speed * (sprint ? 1.55 : 1) * (ads ? 0.6 : 1);
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  const wx = fx * -inp.my + rx * inp.mx;
  const wz = fz * -inp.my + rz * inp.mx;
  const k = 1 - Math.exp(-dt * 12);
  p.vx += (wx * speed - p.vx) * k;
  p.vz += (wz * speed - p.vz) * k;
  p.pos.x += p.vx * dt;
  p.pos.z += p.vz * dt;
  collideCircle(p.pos, GOOSE_R);
  for (const z of zombies) {
    if (z.dead) continue;
    const zp = z.group.position;
    const dx = p.pos.x - zp.x, dz = p.pos.z - zp.z;
    const d = Math.hypot(dx, dz);
    const min = GOOSE_R + 0.35 * z.def.scale;
    if (d < min && d > 1e-4) {
      p.pos.x = zp.x + (dx / d) * min;
      p.pos.z = zp.z + (dz / d) * min;
    }
  }
  const pr = Math.hypot(p.pos.x, p.pos.z);
  if (pr > ARENA_R) p.pos.multiplyScalar(ARENA_R / pr);

  // анимация
  const sp = Math.hypot(p.vx, p.vz);
  p.walkPhase += sp * dt * 2.2;
  goose.group.position.copy(p.pos);
  goose.group.rotation.y = p.yaw;
  const swing = Math.sin(p.walkPhase) * Math.min(1, sp / 3) * 0.7;
  parts.legs[0].rotation.x = swing;
  parts.legs[1].rotation.x = -swing;
  parts.body.position.y = Math.abs(Math.sin(p.walkPhase)) * 0.06 * Math.min(1, sp / 3);
  parts.body.rotation.z = Math.sin(p.walkPhase) * 0.06 * Math.min(1, sp / 3);
  parts.neck.rotation.x = p.honkAnim > 0 ? -0.6 * Math.sin((p.honkAnim / 0.35) * Math.PI) : -p.pitch * 0.4;
  parts.gun.rotation.x = p.pitch * 0.8;

  // перезарядка
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    parts.gun.rotation.z = Math.sin(p.reloadT * 10) * 0.4;
    if (p.reloadT <= 0) {
      p.ammo = s.mag;
      parts.gun.rotation.z = 0;
    }
  }
  if (inp.pressed.reload && p.ammo < s.mag && p.reloadT <= 0) startReload();

  if (inp.fire && p.fireCd <= 0) fire();
  if (inp.pressed.honk) honk();

  // вспышка выстрела
  const fl = parts.flash;
  if (fl.visible) {
    fl.userData.t -= dt;
    if (fl.userData.t <= 0) {
      fl.visible = false;
      parts.flashLight.intensity = 0;
    }
  }
}

function startReload() {
  if (player.reloadT > 0) return;
  player.reloadT = player.stats.reload;
  Sfx.reload();
}

function fire() {
  const p = player;
  const s = p.stats;
  if (p.reloadT > 0) return;
  if (p.ammo <= 0) {
    Sfx.empty();
    p.fireCd = 0.25;
    startReload();
    return;
  }
  p.ammo--;
  p.fireCd = 1 / s.rate;
  const origin = camera.position.clone();
  let dir = aimDir();

  if (Input.state.lastSource === 'pad') {
    const t = assistTarget(dir, lerp(0.075, 0.05, p.adsK));
    if (t) dir = t.dir;
  }

  const moving = Math.hypot(p.vx, p.vz) > 1 ? 0.012 : 0;
  const baseSpread = lerp(0.02, 0.005, p.adsK) + p.bloom + moving + (s.pellets > 1 ? 0.035 : 0);
  const muzzle = goose.parts.muzzle.getWorldPosition(new THREE.Vector3());
  const minT = camera.position.distanceTo(p.pos) - 0.3;
  let anyHit = false;
  let anyKill = false;

  for (let i = 0; i < s.pellets; i++) {
    const d = dir.clone();
    d.x += rand(-1, 1) * baseSpread;
    d.y += rand(-1, 1) * baseSpread;
    d.z += rand(-1, 1) * baseSpread;
    d.normalize();

    let blockT = 80;
    for (const c of colliders) {
      const t = rayCylinder(origin, d, c);
      if (t !== null && t > minT && t < blockT) blockT = t;
    }
    if (d.y < 0) {
      const t = -origin.y / d.y;
      if (t > 0 && t < blockT) blockT = t;
    }

    const hits = [];
    for (const z of zombies) {
      if (z.dead) continue;
      const sph = zombieSpheres(z);
      const th = raySphere(origin, d, sph.head, sph.head.r);
      const tb = raySphere(origin, d, sph.body, sph.body.r);
      let t = null;
      let head = false;
      if (th !== null && (tb === null || th <= tb + 0.3)) { t = th; head = true; } else if (tb !== null) t = tb;
      if (t !== null && t > minT && t < blockT) hits.push({ z, t, head });
    }
    hits.sort((a, b) => a.t - b.t);
    const limit = 1 + s.pierce;
    const n = Math.min(hits.length, limit);
    // пуля застревает в последнем зомби, если пробивная сила кончилась, иначе летит до препятствия
    let end = origin.clone().addScaledVector(d, n === limit ? hits[n - 1].t : blockT);
    for (let h = 0; h < n; h++) {
      const { z, t, head } = hits[h];
      const at = origin.clone().addScaledVector(d, t);
      if (damageZombie(z, s.dmg * (head ? 2 : 1), d, at, head)) anyKill = true;
      anyHit = true;
    }
    if (n < limit && blockT < 80) burst(end, 3, 'dirt', 2);
    tracer(muzzle, end);
  }

  p.bloom = Math.min(0.045, p.bloom + lerp(0.006, 0.003, p.adsK));
  const fl = goose.parts.flash;
  fl.visible = true;
  fl.userData.t = 0.045;
  fl.scale.setScalar(rand(0.7, 1.4));
  goose.parts.flashLight.intensity = 12;
  game.shake = Math.max(game.shake, 1.5);
  Sfx.shoot();
  Input.rumble(40, 0.1, 0.35);
  if (anyHit) {
    game.hitmarkT = 0.15;
    $('hitmarker').classList.toggle('kill', anyKill);
    if (!anyKill) Sfx.hit();
  }
}

function damageZombie(z, dmg, dir, at, head) {
  z.hp -= dmg;
  z.flashT = 0.08;
  const kb = 2.2 / z.def.scale;
  z.vx += dir.x * kb;
  z.vz += dir.z * kb;
  burst(at, head ? 8 : 4, 'goo', 3);
  if (z.hp <= 0) {
    z.dead = true;
    z.deadT = 0;
    game.kills++;
    game.score += Math.round(z.def.score * (head ? 1.5 : 1));
    burst(at, 14, 'goo', 5);
    Sfx.kill();
    Input.rumble(80, 0.3, 0.2);
    return true;
  }
  return false;
}

function honk() {
  const p = player;
  const s = p.stats;
  if (p.honkCd > 0) return;
  p.honkCd = s.honkCd;
  p.honkAnim = 0.35;
  Sfx.honk();
  Input.rumble(350, 0.7, 1);
  game.shake = 8;
  shock.visible = true;
  shock.position.set(p.pos.x, 0.15, p.pos.z);
  shockT = 0.45;
  shockR = s.honkR;
  banner('ГА!', 0.6);
  for (const z of zombies) {
    if (z.dead) continue;
    const zp = z.group.position;
    const dx = zp.x - p.pos.x, dz = zp.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > s.honkR) continue;
    const power = (10 * (1 - d / s.honkR) + 4) / z.def.scale;
    z.vx = (dx / (d || 1)) * power;
    z.vz = (dz / (d || 1)) * power;
    z.stunT = 1.5;
    damageZombie(z, s.honkDmg, new THREE.Vector3(dx, 0, dz).normalize(), zp.clone().setY(1.2), false);
  }
}

function hurtPlayer(dmg, from) {
  const p = player;
  if (p.dead) return;
  p.hp -= dmg;
  p.hurtT = 0.5;
  game.shake = Math.max(game.shake, 5);
  Sfx.hurt();
  Input.rumble(200, 0.8, 0.5);
  burst(new THREE.Vector3(p.pos.x, 0.9, p.pos.z), 6, 'feather', 3);
  const dx = p.pos.x - from.x, dz = p.pos.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  p.vx += (dx / d) * 6;
  p.vz += (dz / d) * 6;
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    p.respawnT = 5;
    p.reloadT = 0;
    burst(new THREE.Vector3(p.pos.x, 1, p.pos.z), 30, 'feather', 6);
    Input.rumble(600, 1, 1);
  }
}

// ---------- Зомби ----------

function updateZombies(dt) {
  const n = game.wave;
  const waveSpeed = 1 + 0.03 * (n - 1);
  const p = player;

  for (const z of zombies) {
    const g = z.group;
    if (z.dead) {
      z.deadT += dt;
      z.inner.rotation.x = Math.min(1, z.deadT / 0.4) * (Math.PI / 2);
      z.inner.position.y = z.deadT > 1.5 ? -(z.deadT - 1.5) * 0.8 : 0;
      continue;
    }

    const zp = g.position;
    const s = z.def.scale;
    let tx = 0, tz = 0;
    let targetPlayer = false;
    const dpx = p.pos.x - zp.x, dpz = p.pos.z - zp.z;
    const dPlayer = Math.hypot(dpx, dpz);
    if (!p.dead && dPlayer < 9) {
      tx = p.pos.x; tz = p.pos.z;
      targetPlayer = true;
    }
    const dBase = Math.hypot(zp.x, zp.z);

    if (z.stunT > 0) {
      z.stunT -= dt;
      const k = Math.exp(-dt * 4);
      z.vx *= k;
      z.vz *= k;
      z.inner.rotation.z = Math.sin(z.stunT * 20) * 0.15;
    } else {
      z.inner.rotation.z = 0;
      let dx = tx - zp.x, dz = tz - zp.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      const stopDist = targetPlayer ? 0.9 * s : BASE_R + 0.45 * s;
      const want = (targetPlayer ? d : dBase) > stopDist ? z.def.speed * z.speedMul * waveSpeed : 0;
      const k = 1 - Math.exp(-dt * 5);
      z.vx += (dx * want - z.vx) * k;
      z.vz += (dz * want - z.vz) * k;
      g.rotation.y = Math.atan2(-dx, -dz);
    }

    zp.x += z.vx * dt;
    zp.z += z.vz * dt;
    collideCircle(zp, 0.35 * s);

    // атака
    z.attackCd -= dt;
    z.attackAnim = Math.max(0, z.attackAnim - dt);
    if (z.stunT <= 0 && z.attackCd <= 0) {
      if (targetPlayer && dPlayer < 1.1 * s + 0.45) {
        z.attackCd = 1.1;
        z.attackAnim = 0.3;
        hurtPlayer(z.def.dmg, zp);
      } else if (!targetPlayer && dBase < BASE_R + 0.6 * s + 0.3) {
        z.attackCd = 1.2;
        z.attackAnim = 0.3;
        game.baseHp -= z.def.dmg;
        Sfx.baseHit();
        burst(new THREE.Vector3(zp.x * 0.9, 1.2, zp.z * 0.9), 4, 'wood', 3);
        if (game.baseHp <= 0) gameOver();
      }
    }

    // анимация
    const sp = Math.hypot(z.vx, z.vz);
    z.walkPhase += sp * dt * 2.5 / s;
    const swing = Math.sin(z.walkPhase) * 0.6 * Math.min(1, sp / 1.5);
    z.legs[0].rotation.x = swing;
    z.legs[1].rotation.x = -swing;
    const reach = z.attackAnim > 0 ? Math.PI / 2 + Math.sin((z.attackAnim / 0.3) * Math.PI) * 0.8 : Math.PI / 2 - 0.1;
    z.arms[0].rotation.x = reach + Math.sin(z.walkPhase * 0.5) * 0.15;
    z.arms[1].rotation.x = reach - Math.sin(z.walkPhase * 0.5) * 0.15;
    z.inner.position.y = Math.abs(Math.sin(z.walkPhase)) * 0.05;

    if (z.flashT > 0) {
      z.flashT -= dt;
      z.skin.emissive.setHex(0xffffff);
      z.shirt.emissive.setHex(0x888888);
    } else {
      z.skin.emissive.setHex(0x000000);
      z.shirt.emissive.setHex(0x000000);
    }
  }

  // зомби не должны слипаться в одну кучу
  const alive = zombies.filter((z) => !z.dead);
  for (let i = 0; i < alive.length; i++) {
    const a = alive[i].group.position;
    const sa = alive[i].def.scale;
    for (let j = i + 1; j < alive.length; j++) {
      const b = alive[j].group.position;
      const min = 0.38 * (sa + alive[j].def.scale);
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.z -= (dz / d) * push;
        b.x += (dx / d) * push; b.z += (dz / d) * push;
      }
    }
  }

  // стоны, громче когда ближе
  game.groanT -= dt;
  if (game.groanT <= 0 && alive.length) {
    game.groanT = rand(0.6, 1.6);
    const z = alive[(Math.random() * alive.length) | 0];
    const d = z.group.position.distanceTo(p.pos);
    if (d < 35) Sfx.groan(0.22 * (1 - d / 35) * (z.type === 'brute' ? 1.6 : 1));
  }

  // убираем трупы, утонувшие в земле
  zombies = zombies.filter((z) => {
    if (z.dead && z.deadT > 3) {
      scene.remove(z.group);
      z.skin.dispose();
      z.shirt.dispose();
      return false;
    }
    return true;
  });
}

function updateWave(dt) {
  if (game.phase === 'countdown') {
    game.phaseT -= dt;
    if (game.phaseT <= 0) game.phase = 'fight';
    return;
  }
  if (game.phase === 'fight') {
    const alive = zombies.filter((z) => !z.dead).length;
    game.spawnT -= dt;
    if (game.spawnQueue.length && game.spawnT <= 0 && alive < 45) {
      game.spawnT = Math.max(0.3, 1.5 - game.wave * 0.11);
      zombies.push(makeZombie(game.spawnQueue.pop(), 1 + 0.12 * (game.wave - 1)));
    }
    if (!game.spawnQueue.length && alive === 0) {
      game.phase = 'cleared';
      game.phaseT = 1.8;
      banner('ВОЛНА ОТБИТА!', 1.8);
      Sfx.done();
    }
    return;
  }
  if (game.phase === 'cleared') {
    game.phaseT -= dt;
    if (game.phaseT <= 0) openUpgrades();
  }
}

// ---------- Эффекты по кадру ----------

function updateFx(dt) {
  for (const p of particles) {
    if (!p.mesh.visible) continue;
    p.t += dt;
    if (p.t >= p.life) { p.mesh.visible = false; continue; }
    p.vy -= 14 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.vx *= 0.5; p.vz *= 0.5; p.vy = 0; }
    p.mesh.rotation.x += dt * 8;
    p.mesh.scale.multiplyScalar(1 - dt * 1.5);
  }
  for (const tr of tracers) {
    if (!tr.line.visible) continue;
    tr.t -= dt;
    tr.line.material.opacity = Math.max(0, tr.t / 0.07);
    if (tr.t <= 0) tr.line.visible = false;
  }
  if (shock.visible) {
    shockT -= dt;
    const k = 1 - shockT / 0.45;
    shock.scale.setScalar(0.5 + k * shockR);
    shock.material.opacity = 1 - k;
    if (shockT <= 0) shock.visible = false;
  }
  game.shake = Math.max(0, game.shake - dt * 25);
  game.hitmarkT = Math.max(0, game.hitmarkT - dt);

  // база дрожит, когда её грызут
  if (game.barn) {
    const dmgK = 1 - game.baseHp / BASE_MAX_HP;
    game.barn.rotation.z = Math.sin(performance.now() / 40) * 0.004 * dmgK;
  }

  moon.position.set(player.pos.x + 15, 30, player.pos.z + 10);
  moon.target.position.copy(player.pos);
}

// ---------- HUD и меню ----------

let bannerT = 0;
function banner(text, dur) {
  const el = $('banner');
  el.textContent = text;
  el.classList.add('show');
  bannerT = dur;
}

const hudCache = {};
function setText(id, v) {
  if (hudCache[id] === v) return;
  hudCache[id] = v;
  $(id).textContent = v;
}

function updateHud(dt) {
  const p = player;
  const s = p.stats;
  bannerT -= dt;
  if (bannerT <= 0) $('banner').classList.remove('show');

  $('base-bar').style.width = `${Math.max(0, (game.baseHp / BASE_MAX_HP) * 100)}%`;
  $('hp-bar').style.width = `${Math.max(0, (p.hp / s.maxHp) * 100)}%`;
  setText('wave-num', `ВОЛНА ${game.wave}`);
  const left = game.spawnQueue.length + zombies.filter((z) => !z.dead).length;
  setText('wave-left', `Зомби: ${left}`);
  setText('score', `${game.score}`);
  setText('ammo-cur', String(p.ammo));
  setText('ammo-max', ` / ${s.mag}`);
  const ammo = $('ammo');
  ammo.classList.toggle('low', p.ammo <= s.mag * 0.25);
  ammo.classList.toggle('reloading', p.reloadT > 0);
  if (p.reloadT > 0) $('reload-bar').firstElementChild.style.width = `${(1 - p.reloadT / s.reload) * 100}%`;

  const honkReady = p.honkCd <= 0;
  $('honk').classList.toggle('ready', honkReady);
  setText('honk-state', honkReady ? (Input.state.lastSource === 'pad' ? '[A]' : '[Пробел]') : `${Math.ceil(p.honkCd)}с`);

  const gap = 8 + (1 - p.adsK) * 8 + p.bloom * 300 + (Math.hypot(p.vx, p.vz) > 1 ? 6 : 0);
  const ch = $('crosshair');
  ch.style.setProperty('--gap', `${gap.toFixed(1)}px`);
  ch.classList.toggle('on-target', !!assistTarget(aimDir(), 0.03));
  ch.hidden = p.dead;
  $('hitmarker').style.opacity = game.hitmarkT > 0 ? 1 : 0;
  $('vignette').style.opacity = Math.max(p.hurtT * 1.6, p.hp < s.maxHp * 0.3 ? 0.35 : 0, p.dead ? 0.8 : 0);
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
  for (const id of ['title', 'pause', 'upgrade', 'over']) $(id).hidden = mode !== id;
  $('hud').hidden = mode === 'title';
  if (mode !== 'play' && document.pointerLockElement) document.exitPointerLock();
}

function openUpgrades() {
  const pool = UPGRADES.slice();
  const choices = [];
  if (game.baseHp < BASE_MAX_HP * 0.5) choices.push(pool.splice(pool.findIndex((u) => u.id === 'repair'), 1)[0]);
  while (choices.length < 3) choices.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
  game.upgradeChoices = choices;
  game.upgradeSel = 1;
  $('upgrade-title').textContent = `Волна ${game.wave} отбита!`;
  $('cards').innerHTML = choices
    .map((u, i) => `<div class="upg" data-i="${i}"><div class="icon">${u.icon}</div><h3>${u.name}</h3><p>${u.desc}</p></div>`)
    .join('');
  $('cards').querySelectorAll('.upg').forEach((el) => {
    el.addEventListener('mouseenter', () => { game.upgradeSel = +el.dataset.i; renderUpgradeSel(); });
    el.addEventListener('click', () => { game.upgradeSel = +el.dataset.i; pickUpgrade(); });
  });
  renderUpgradeSel();
  setMode('upgrade');
}

function renderUpgradeSel() {
  $('cards').querySelectorAll('.upg').forEach((el, i) => el.classList.toggle('sel', i === game.upgradeSel));
}

function pickUpgrade() {
  if (game.mode !== 'upgrade') return;
  const u = game.upgradeChoices[game.upgradeSel];
  u.apply(player.stats);
  player.ammo = player.stats.mag;
  player.reloadT = 0;
  player.hp = Math.min(player.stats.maxHp, player.hp + player.stats.maxHp * 0.25);
  Sfx.upgrade();
  Input.rumble(150, 0.2, 0.6);
  setMode('play');
  startWave();
}

function gameOver() {
  game.baseHp = 0;
  $('over-wave').textContent = game.wave;
  $('over-kills').textContent = game.kills;
  $('over-score').textContent = game.score;
  Sfx.caught();
  Input.rumble(800, 1, 1);
  setMode('over');
}

// ---------- Цикл ----------

renderer.domElement.addEventListener('click', () => {
  if (game.mode === 'play' && !document.pointerLockElement) renderer.domElement.requestPointerLock?.();
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => Sfx.unlock());
Input.onPad((ev) => {
  if (ev === 'disconnected' && game.mode === 'play') setMode('pause');
});

let last = performance.now();
let statusT = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const inp = Input.poll();
  if (Object.values(inp.pressed).some(Boolean)) Sfx.unlock();

  if (game.mode === 'title') {
    if (inp.pressed.confirm) { resetGame(); setMode('play'); }
    // на титульнике камера медленно облетает базу
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.15) * 22, 9, Math.cos(t * 0.15) * 22);
    camera.lookAt(0, 2, 0);
  } else if (game.mode === 'play') {
    if (inp.pressed.pause) setMode('pause');
    else {
      updatePlayer(dt, inp);
      updateZombies(dt);
      updateWave(dt);
      updateCamera(dt, inp);
      updateHud(dt);
    }
  } else if (game.mode === 'pause') {
    Input.takeMouse();
    if (inp.pressed.pause || inp.pressed.honk) setMode('play');
    else if (inp.pressed.restart) { resetGame(); setMode('play'); }
  } else if (game.mode === 'upgrade') {
    Input.takeMouse();
    if (inp.pressed.left) { game.upgradeSel = (game.upgradeSel + 2) % 3; renderUpgradeSel(); }
    if (inp.pressed.right) { game.upgradeSel = (game.upgradeSel + 1) % 3; renderUpgradeSel(); }
    if (inp.pressed.confirm) pickUpgrade();
  } else if (game.mode === 'over') {
    Input.takeMouse();
    if (inp.pressed.confirm) { resetGame(); setMode('play'); }
  }

  if (game.mode !== 'pause') updateFx(dt);
  renderer.render(scene, camera);

  statusT -= dt;
  if (statusT <= 0) { updatePadStatus(); statusT = 0.5; }
  requestAnimationFrame(frame);
}

buildWorld();
goose = makeGoose();
player.stats = newStats();
goose.group.position.set(0, 0, 7);
setMode('title');
updatePadStatus();
requestAnimationFrame(frame);
