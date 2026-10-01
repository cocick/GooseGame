'use strict';

// Все звуки синтезируются в WebAudio, файлов нет.
const Sfx = (() => {
  let ac = null;
  let master = null;
  let noiseBuf = null;

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.6;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ac;
  }

  function unlock() {
    const c = ctx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  const locked = () => !ac || ac.state !== 'running';

  function env(g, t, peak, attack, release) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  function tone(type, f0, f1, dur, peak = 0.3, when = 0) {
    const c = ctx();
    if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, peak, 0.01, dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dur, freq, q, peak) {
    const c = ctx();
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    env(g, t, peak, 0.01, dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ГА! Две пилы через гнусавые форманты.
  function honk() {
    const c = ctx();
    if (!c) return;
    const t = c.currentTime;
    const base = 300 + Math.random() * 70;
    const g = c.createGain();
    env(g, t, 0.55, 0.015, 0.26);
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 1050; f1.Q.value = 3;
    const f2 = c.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = 2500; f2.Q.value = 5;
    f1.connect(g); f2.connect(g);
    g.connect(master);
    for (const [type, mul] of [['sawtooth', 1], ['square', 1.012]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(base * 1.2 * mul, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.78 * mul, t + 0.24);
      o.connect(f1); o.connect(f2);
      o.start(t);
      o.stop(t + 0.32);
    }
  }

  return {
    unlock, locked, honk,
    pickup: () => tone('triangle', 500, 900, 0.09, 0.25),
    drop: () => tone('triangle', 500, 250, 0.1, 0.2),
    done: () => { tone('square', 523, 523, 0.1, 0.12); tone('square', 784, 784, 0.18, 0.12, 0.1); },
    caught: () => { tone('sawtooth', 220, 80, 0.35, 0.3); noise(0.2, 900, 1, 0.3); },
    scare: () => tone('sawtooth', 700, 1200, 0.25, 0.12),
    splash: () => noise(0.35, 2000, 0.8, 0.35),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.18, 0.12, i * 0.13)),
  };
})();
