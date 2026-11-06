// All game audio is synthesized at runtime with the Web Audio API (original, no licensed samples).
export class Audio {
  constructor() {
    this.ctx = null;
    this.loops = {};
    this.volumes = { master: 0.8, sfx: 0.9, ambience: 0.6 };
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.amb = this.ctx.createGain(); this.amb.connect(this.master);
    this.applyVolumes();
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.98 * b + 0.02 * w; d[i] = w * 0.5 + b * 4; }
  }
  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolumes(master, sfx, ambience) { this.volumes = { master, sfx, ambience }; this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.amb.gain.value = this.volumes.ambience;
  }
  get t() { return this.ctx.currentTime; }

  _noiseSrc(loop = false) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = loop; return s; }

  tone(freq, dur = 0.12, type = 'sine', vol = 0.25, when = 0, slideTo = null) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, this.t + when);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, this.t + when + dur);
    g.gain.setValueAtTime(0.0001, this.t + when);
    g.gain.exponentialRampToValueAtTime(vol, this.t + when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + when + dur);
    o.connect(g).connect(this.sfx); o.start(this.t + when); o.stop(this.t + when + dur + 0.05);
  }
  noiseBurst(dur = 0.2, freq = 1200, q = 0.7, vol = 0.3, when = 0, type = 'bandpass') {
    if (!this.ctx) return;
    const s = this._noiseSrc(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, this.t + when); g.gain.exponentialRampToValueAtTime(0.0001, this.t + when + dur);
    s.connect(f).connect(g).connect(this.sfx); s.start(this.t + when, Math.random()); s.stop(this.t + when + dur + 0.05);
  }

  // ----- one-shots -----
  click() { this.tone(1800, 0.04, 'square', 0.06); }
  hover() { this.tone(1200, 0.03, 'sine', 0.03); }
  beep() { this.tone(880, 0.09, 'sine', 0.15); this.tone(1320, 0.09, 'sine', 0.12, 0.1); }
  radioOpen() { this.noiseBurst(0.18, 2200, 0.6, 0.18); this.tone(1250, 0.08, 'sine', 0.12, 0.16); }
  radioClose() { this.tone(1250, 0.06, 'sine', 0.1); this.noiseBurst(0.12, 2500, 0.6, 0.12, 0.06); }
  footstep(surface = 'moon') {
    // In vacuum footsteps are only "heard" through the suit — a soft muffled thud.
    const f = surface === 'mars' ? 420 : surface === 'earth' ? 600 : 260;
    this.noiseBurst(0.09, f, 1.2, surface === 'earth' ? 0.22 : 0.14, 0, 'lowpass');
  }
  land() { this.noiseBurst(0.5, 180, 0.8, 0.5, 0, 'lowpass'); }
  scanTick() { this.tone(2400 + Math.random() * 400, 0.03, 'triangle', 0.05); }
  scanDone() { [660, 990, 1320].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.12, i * 0.08)); }
  pickup() { this.tone(520, 0.08, 'triangle', 0.15); this.tone(780, 0.12, 'triangle', 0.15, 0.07); }
  success() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.16, i * 0.13)); }
  fail() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.08, i * 0.18)); }
  alarm() { this.tone(960, 0.15, 'square', 0.08); this.tone(720, 0.15, 'square', 0.08, 0.17); }
  build() { this.noiseBurst(0.25, 900, 2, 0.2); this.tone(300, 0.3, 'square', 0.06, 0.1, 600); }
  switchFlip() { this.noiseBurst(0.03, 4000, 1, 0.15, 0, 'highpass'); this.tone(2200, 0.03, 'square', 0.05); }
  separation() { this.noiseBurst(0.6, 300, 0.5, 0.5, 0, 'lowpass'); this.noiseBurst(0.2, 3000, 1, 0.2, 0, 'highpass'); }

  // ----- loops with a controllable level 0..1 -----
  _loop(name, build) {
    if (!this.ctx) return null;
    if (!this.loops[name]) this.loops[name] = build();
    return this.loops[name];
  }
  setLoop(name, level, param = 0) {
    if (!this.ctx) return;
    const L = this._loop(name, () => this._make(name));
    if (!L) return;
    const now = this.t;
    L.gain.gain.setTargetAtTime(Math.max(0, level) * L.base, now, 0.08);
    if (L.update) L.update(param, now);
  }
  stopAllLoops() { for (const k of Object.keys(this.loops)) this.setLoop(k, 0); }

  _make(name) {
    const c = this.ctx, gain = c.createGain(); gain.gain.value = 0;
    const out = name === 'engine' || name === 'rover' || name === 'rcs' ? this.sfx : this.amb;
    gain.connect(out);
    if (name === 'engine') {
      // rocket rumble: low-passed noise + sub oscillator
      const n = this._noiseSrc(true), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38; const og = c.createGain(); og.gain.value = 0.25;
      n.connect(f).connect(gain); o.connect(og).connect(gain); n.start(); o.start();
      return { gain, base: 0.9, update: (p, t) => { f.frequency.setTargetAtTime(160 + p * 500, t, 0.1); o.frequency.setTargetAtTime(30 + p * 25, t, 0.1); } };
    }
    if (name === 'rcs') {
      const n = this._noiseSrc(true), f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
      n.connect(f).connect(gain); n.start(); return { gain, base: 0.25 };
    }
    if (name === 'rover') {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 90;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      o.connect(f).connect(gain); o.start();
      const n = this._noiseSrc(true), nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 300; const ng = c.createGain(); ng.gain.value = 0.4;
      n.connect(nf).connect(ng).connect(gain); n.start();
      return { gain, base: 0.18, update: (p, t) => { o.frequency.setTargetAtTime(70 + p * 160, t, 0.1); } };
    }
    if (name === 'suit') {
      // suit fans + slow breathing
      const n = this._noiseSrc(true), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.5;
      const breath = c.createGain(); breath.gain.value = 0.5;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.22; const lg = c.createGain(); lg.gain.value = 0.45;
      lfo.connect(lg).connect(breath.gain); lfo.start();
      n.connect(f).connect(breath).connect(gain); n.start();
      return { gain, base: 0.12, update: (p, t) => { lfo.frequency.setTargetAtTime(0.22 + p * 0.35, t, 0.5); } };
    }
    if (name === 'wind') {
      const n = this._noiseSrc(true), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.8;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lg = c.createGain(); lg.gain.value = 250;
      lfo.connect(lg).connect(f.frequency); lfo.start();
      n.connect(f).connect(gain); n.start();
      return { gain, base: 0.15 };
    }
    if (name === 'cabin') {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 60;
      const n = this._noiseSrc(true), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const og = c.createGain(); og.gain.value = 0.15;
      o.connect(og).connect(gain); n.connect(f).connect(gain); o.start(); n.start();
      return { gain, base: 0.08 };
    }
    if (name === 'earthAmb') {
      const n = this._noiseSrc(true), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      n.connect(f).connect(gain); n.start(); return { gain, base: 0.08 };
    }
    return null;
  }
}
