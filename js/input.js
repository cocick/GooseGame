'use strict';

// Ввод: геймпад (Xbox 360 через Gamepad API) + клавиатура как запасной вариант.
const Input = (() => {
  const DEADZONE = 0.22;
  const keys = new Set();
  const listeners = [];
  let padIndex = null;
  let prev = {};

  const state = {
    mx: 0, my: 0,
    run: false, sneak: false,
    pressed: {},          // кнопки, нажатые именно в этом кадре
    padName: null,
    lastSource: 'kb',     // 'pad' | 'kb' — для подсказок на экране
  };

  const BLOCK = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    state.lastSource = 'kb';
    if (BLOCK.includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

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

  function poll() {
    const p = getPad();
    let mx = 0, my = 0;
    const cur = { honk: false, grab: false, pause: false, confirm: false, restart: false };
    let run = false, sneak = false;

    if (p) {
      // В "standard" раскладке: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 12-15 крестовина.
      // Без неё (например Firefox на Linux) у 360-го: 6 Back, 7 Start, курки на осях 2 и 5.
      const std = p.mapping === 'standard';
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const mag = Math.hypot(ax, ay);
      if (mag > DEADZONE) {
        const k = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE)) / mag;
        mx += ax * k; my += ay * k;
      }
      if (std) {
        if (btn(p, 12)) my -= 1;
        if (btn(p, 13)) my += 1;
        if (btn(p, 14)) mx -= 1;
        if (btn(p, 15)) mx += 1;
      }
      cur.honk = btn(p, 0);
      cur.grab = btn(p, 2) || btn(p, 1);
      cur.restart = btn(p, 3);
      sneak = btn(p, 4) || (std ? btn(p, 6) : (p.axes[2] ?? -1) > 0.2);
      run = btn(p, 5) || (std ? btn(p, 7) : (p.axes[5] ?? -1) > 0.2);
      cur.pause = std ? btn(p, 9) : btn(p, 7);
      cur.confirm = cur.honk || cur.pause;

      const anyPad = mag > DEADZONE || p.buttons.some((b) => b.pressed);
      if (anyPad) state.lastSource = 'pad';
      state.padName = p.id;
    } else {
      state.padName = null;
    }

    const k = (...codes) => codes.some((c) => keys.has(c));
    if (k('KeyW', 'ArrowUp')) my -= 1;
    if (k('KeyS', 'ArrowDown')) my += 1;
    if (k('KeyA', 'ArrowLeft')) mx -= 1;
    if (k('KeyD', 'ArrowRight')) mx += 1;
    run = run || k('ShiftLeft', 'ShiftRight');
    sneak = sneak || k('ControlLeft', 'KeyC');
    cur.honk = cur.honk || k('Space');
    cur.grab = cur.grab || k('KeyE', 'KeyJ');
    cur.pause = cur.pause || k('Escape', 'KeyP');
    cur.confirm = cur.confirm || k('Enter', 'Space');
    cur.restart = cur.restart || k('KeyR');

    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }

    state.mx = mx; state.my = my;
    state.run = run; state.sneak = sneak;
    for (const key in cur) state.pressed[key] = cur[key] && !prev[key];
    prev = cur;
    return state;
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
    state, poll, rumble,
    onPad: (fn) => listeners.push(fn),
    hasPad: () => !!getPad(),
  };
})();
