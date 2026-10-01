'use strict';

// Ввод: геймпад (Xbox 360 через Gamepad API) + клавиатура/мышь как запасной вариант.
// Общий для обеих игр: гусь берёт run/sneak/honk/grab, шутер — стики, курки и мышь.
const Input = (() => {
  const DEADZONE = 0.22;
  const keys = new Set();
  const mouseButtons = new Set();
  const listeners = [];
  let padIndex = null;
  let prev = {};
  let mouseDX = 0;
  let mouseDY = 0;

  const state = {
    mx: 0, my: 0,         // левый стик / WASD
    rx: 0, ry: 0,         // правый стик
    run: false, sneak: false,
    fire: false, aim: false, sprint: false,
    pressed: {},          // кнопки, нажатые именно в этом кадре
    padName: null,
    lastSource: 'kb',     // 'pad' | 'kb' — для подсказок и аим-ассиста
  };

  const BLOCK = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    state.lastSource = 'kb';
    if (BLOCK.includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouseButtons.clear(); });

  window.addEventListener('mousedown', (e) => { mouseButtons.add(e.button); state.lastSource = 'kb'; });
  window.addEventListener('mouseup', (e) => mouseButtons.delete(e.button));
  window.addEventListener('mousemove', (e) => {
    if (!document.pointerLockElement) return;
    mouseDX += e.movementX;
    mouseDY += e.movementY;
    state.lastSource = 'kb';
  });

  window.addEventListener('gamepadconnected', (e) => {
    padIndex = e.gamepad.index;
    state.lastSource = 'pad';
    listeners.forEach((fn) => fn('connected', e.gamepad));
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    if (padIndex === e.gamepad.index) padIndex = null;
    listeners.forEach((fn) => fn('disconnected', e.gamepad));
  });

  function getPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (padIndex !== null && pads[padIndex] && pads[padIndex].connected) return pads[padIndex];
    for (const p of pads) {
      if (p && p.connected) { padIndex = p.index; return p; }
    }
    return null;
  }

  function btn(p, i) {
    const b = p.buttons[i];
    return !!b && (b.pressed || b.value > 0.5);
  }

  function stick(x, y) {
    const mag = Math.hypot(x, y);
    if (mag <= DEADZONE) return [0, 0, 0];
    const k = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE)) / mag;
    return [x * k, y * k, mag];
  }

  function poll() {
    const p = getPad();
    let mx = 0, my = 0, rx = 0, ry = 0;
    const cur = {
      honk: false, grab: false, pause: false, confirm: false, restart: false, reload: false,
      left: false, right: false, up: false, down: false,
    };
    let run = false, sneak = false, fire = false, aim = false, sprint = false;

    if (p) {
      // В "standard" раскладке: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start,
      // 10 L3, 11 R3, 12-15 крестовина; правый стик — оси 2 и 3.
      // Без неё (например Firefox на Linux) у 360-го: 6 Back, 7 Start, 9 L3, курки на осях 2 и 5,
      // правый стик на осях 3 и 4.
      const std = p.mapping === 'standard';
      const [lx, ly, lmag] = stick(p.axes[0] || 0, p.axes[1] || 0);
      const [sx, sy, rmag] = std
        ? stick(p.axes[2] || 0, p.axes[3] || 0)
        : stick(p.axes[3] || 0, p.axes[4] || 0);
      mx += lx; my += ly;
      rx = sx; ry = sy;
      if (std) {
        if (btn(p, 12)) { my -= 1; cur.up = true; }
        if (btn(p, 13)) { my += 1; cur.down = true; }
        if (btn(p, 14)) { mx -= 1; cur.left = true; }
        if (btn(p, 15)) { mx += 1; cur.right = true; }
      }
      const lt = std ? btn(p, 6) : (p.axes[2] ?? -1) > 0.2;
      const rt = std ? btn(p, 7) : (p.axes[5] ?? -1) > 0.2;
      cur.honk = btn(p, 0);
      cur.grab = btn(p, 2) || btn(p, 1);
      cur.reload = btn(p, 2);
      cur.restart = btn(p, 3);
      sneak = btn(p, 4) || lt;
      run = btn(p, 5) || rt;
      fire = rt;
      aim = lt;
      sprint = btn(p, 1) || btn(p, std ? 10 : 9);
      cur.pause = std ? btn(p, 9) : btn(p, 7);
      cur.confirm = cur.honk || cur.pause;
      if (ly < -0.6) cur.up = true;
      if (ly > 0.6) cur.down = true;
      if (lx < -0.6) cur.left = true;
      if (lx > 0.6) cur.right = true;

      if (lmag > DEADZONE || rmag > DEADZONE || p.buttons.some((b) => b.pressed)) state.lastSource = 'pad';
      state.padName = p.id;
    } else {
      state.padName = null;
    }

    const k = (...codes) => codes.some((c) => keys.has(c));
    if (k('KeyW', 'ArrowUp')) { my -= 1; cur.up = true; }
    if (k('KeyS', 'ArrowDown')) { my += 1; cur.down = true; }
    if (k('KeyA', 'ArrowLeft')) { mx -= 1; cur.left = true; }
    if (k('KeyD', 'ArrowRight')) { mx += 1; cur.right = true; }
    run = run || k('ShiftLeft', 'ShiftRight');
    sprint = sprint || k('ShiftLeft', 'ShiftRight');
    sneak = sneak || k('ControlLeft', 'KeyC');
    fire = fire || mouseButtons.has(0);
    aim = aim || mouseButtons.has(2);
    cur.honk = cur.honk || k('Space');
    cur.grab = cur.grab || k('KeyE', 'KeyJ');
    cur.reload = cur.reload || k('KeyR');
    cur.pause = cur.pause || k('Escape', 'KeyP');
    cur.confirm = cur.confirm || k('Enter', 'Space');
    cur.restart = cur.restart || k('KeyR');

    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }

    state.mx = mx; state.my = my;
    state.rx = rx; state.ry = ry;
    state.run = run; state.sneak = sneak;
    state.fire = fire; state.aim = aim; state.sprint = sprint;
    for (const key in cur) state.pressed[key] = cur[key] && !prev[key];
    prev = cur;
    return state;
  }

  // Сдвиг мыши с прошлого вызова (только при захваченном курсоре)
  function takeMouse() {
    const d = [mouseDX, mouseDY];
    mouseDX = 0;
    mouseDY = 0;
    return d;
  }

  // Вибрация: Chrome/Edge умеют dual-rumble для Xbox-джойстиков. Где не умеют, просто молчим.
  function rumble(duration, strong, weak) {
    const p = getPad();
    const act = p && p.vibrationActuator;
    if (!act || !act.playEffect) return;
    act.playEffect('dual-rumble', {
      startDelay: 0, duration, strongMagnitude: strong, weakMagnitude: weak,
    }).catch(() => {});
  }

  return {
    state, poll, rumble, takeMouse,
    onPad: (fn) => listeners.push(fn),
    hasPad: () => !!getPad(),
  };
})();
