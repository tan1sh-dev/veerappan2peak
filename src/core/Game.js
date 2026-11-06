import * as THREE from 'three';
import { Input } from './Input.js';
import { Audio } from './Audio.js';
import { Bridge } from './Bridge.js';
import { SaveSystem, newGameState } from './SaveSystem.js';
import { PRESETS, mergeSettings } from './Settings.js';
import { Assets } from './Assets.js';
import { UI } from '../ui/UI.js';
import { MISSIONS, MissionRun, missionById, applyRewards } from '../gameplay/missions.js';
import { RADIO } from '../gameplay/dialogues.js';
import { SITES } from '../data/catalog.js';

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.ui = new UI(uiRoot, this);
    this.state = newGameState();
    this.settings = mergeSettings();
    this.level = null;
    this.run = null;
    this.paused = false;
    this.clock = new THREE.Clock();
    this.fps = 0; this._fpsAcc = 0; this._fpsN = 0; this._lowFpsTime = 0;
    this.flight = null;       // { missionId, rocket, dest }
    window.__game = this;     // debug/testing hook
  }

  async init() {
    const cfg = await Bridge.getConfig();
    this.settings = mergeSettings(cfg.settings);
    this.apiInfo = { hasApiKey: cfg.hasApiKey };
    this.makeRenderer();
    const saved = await SaveSystem.load();
    this.hasSave = !!saved;
    if (saved) this.state = saved;
    this.provenance = await Assets.json('provenance.json').catch(() => null);
    this.input.onKey((code, e) => this.onKey(code, e));
    addEventListener('resize', () => this.resize());
    const unlockAudio = () => { this.audio.resume(); this.applyVolumes(); };
    addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.1, 200000);
    this.resize();
    this.menuScene = this.makeMenuScene();
    this.loop();
    this.mainMenu();
  }

  makeRenderer() {
    if (this.renderer) this.renderer.dispose();
    const p = PRESETS[this.settings.quality] || PRESETS.medium;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: p.antialias, powerPreference: 'high-performance', logarithmicDepthBuffer: false });
    this.renderer.setPixelRatio(Math.min(p.pixelRatio, devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = p.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.preset = p;
  }
  applyQuality() {
    const p = PRESETS[this.settings.quality] || PRESETS.medium;
    this.preset = p;
    this.renderer.setPixelRatio(Math.min(p.pixelRatio, devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = p.shadows;
    if (this.level && this.level.applyQuality) this.level.applyQuality(p);
    this.resize();
  }
  applyVolumes() { this.audio.setVolumes(this.settings.masterVolume, this.settings.sfxVolume, this.settings.ambienceVolume); }
  resize() {
    if (!this.renderer) return;
    this.renderer.setSize(innerWidth, innerHeight, false);
    if (this.camera) { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
  }

  // Slowly rotating Moon globe behind the main menu (LRO WAC global mosaic).
  makeMenuScene() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x02040a);
    const moonMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    Assets.texture('textures/moon_globe.jpg').then(t => { moonMat.map = t; moonMat.needsUpdate = true; });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), moonMat);
    moon.position.set(9, -2, -30); s.add(moon);
    const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(-30, 10, 10); s.add(sun);
    s.add(new THREE.AmbientLight(0x223344, 0.4));
    import('../world/Sky.js').then(({ makeStarfield }) => s.add(makeStarfield(2500, 900)));
    s.userData.moon = moon;
    return s;
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc > 0.5) {
      this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0;
      this.autoQuality(0.5);
    }
    if (this.level && !this.paused) {
      try { this.level.update(dt); } catch (e) { console.error(e); this.ui.toast('Error: ' + e.message, 'bad'); this.paused = true; }
      this.state.stats.playTime += dt;
      if (this.run && !this.ui.isModal) { this.run.tick(dt); if (this.run.failed && !this._failShown) this.finishMission(false, this.run.failed); }
    }
    const scene = this.level ? this.level.scene : this.menuScene;
    const cam = this.level && this.level.camera ? this.level.camera : this.camera;
    if (!this.level) { this.menuScene.userData.moon.rotation.y += dt * 0.03; this.camera.position.set(0, 0, 0); this.camera.lookAt(0, 0, -30); }
    this.renderer.render(scene, cam);
    this.input.endFrame();
  }
  /** Testing hook: advance the simulation n frames synchronously (works even when the window is hidden). */
  step(n = 1, dt = 1 / 30) {
    for (let i = 0; i < n; i++) {
      if (this.level && !this.paused) { this.level.update(dt); if (this.run && !this.ui.isModal) { this.run.tick(dt); if (this.run.failed && !this._failShown) this.finishMission(false, this.run.failed); } }
      this.input.endFrame();
    }
    const scene = this.level ? this.level.scene : this.menuScene;
    this.renderer.render(scene, this.level && this.level.camera ? this.level.camera : this.camera);
  }
  autoQuality(dt) {
    if (!this.settings.autoQuality || !this.level || this.ui.isModal) { this._lowFpsTime = 0; return; }
    if (this.fps > 0 && this.fps < 26) this._lowFpsTime += dt; else this._lowFpsTime = Math.max(0, this._lowFpsTime - dt);
    if (this._lowFpsTime > 6) {
      this._lowFpsTime = 0;
      const order = ['high', 'medium', 'low'];
      const i = order.indexOf(this.settings.quality);
      if (i < order.length - 1) {
        this.settings.quality = order[i + 1];
        this.applyQuality(); Bridge.setSettings(this.settings);
        this.ui.toast(`Low frame rate: graphics set to ${this.settings.quality.toUpperCase()}`, 'info');
      }
    }
  }

  // ---------------- input routing ----------------
  onKey(code) {
    if (code === 'Escape') {
      if (this.ui.isModal) return; // modal handles its own Esc
      if (this.level && this.level.allowPause !== false) this.pauseMenu();
      return;
    }
    if (this.ui.isModal || this.paused || !this.level) return;
    if (this.level.onKey) this.level.onKey(code);
  }

  // ---------------- menus ----------------
  async mainMenu() {
    await this.unloadLevel();
    this.run = null; this.paused = false;
    this.audio.stopAllLoops();
    const ctl = this.ui.mainMenu({
      hasSave: this.hasSave,
      onNew: async () => {
        if (this.hasSave && !confirm('Start a new game? Your saved progress will be replaced.')) return;
        this.state = newGameState(); await SaveSystem.save(this.state); this.hasSave = true;
        this.startMission('m1');
      },
      onContinue: () => this.missionSelect(),
      onMissions: () => this.missionSelect(),
      onSettings: () => this.settingsMenu(() => this.mainMenu()),
      onCredits: () => this.ui.credits(this.provenance, () => this.mainMenu()),
      onExit: () => { if (window.veerappan) window.close(); else this.ui.toast('Close the browser tab to exit.'); },
      apod: null,
    });
    this.loadApod().then(a => ctl.setApod(a));
  }
  async loadApod() {
    if (this._apod) return this._apod;
    const r = await Bridge.nasaFetch('apod').catch(() => ({ ok: false }));
    // Reject invalid records (e.g. the API occasionally returns a placeholder with the agency logo).
    const valid = d => d && d.media_type === 'image' && d.url && !/logo|meatball|insignia/i.test(d.url) && d.title && d.title !== 'NASA Science';
    if (r.ok && valid(r.data)) {
      const d = r.data;
      this._apod = { title: d.title, explanation: d.explanation, date: d.date, copyright: d.copyright, img: d.media_type === 'image' ? d.url : null, live: true };
    } else {
      const f = await Assets.json('data/apod_fallback.json').catch(() => null);
      this._apod = f ? { ...f, img: './assets/textures/apod_fallback.jpg', live: false } : null;
    }
    return this._apod;
  }
  missionSelect() {
    this.ui.missionSelect(this.state, {
      onStart: (id, opts) => this.startMission(id, opts),
      onExplore: site => this.explore(site),
      onBack: () => this.mainMenu(),
    });
  }
  settingsMenu(back) {
    this.ui.settings({ ...this.settings }, {
      apiInfo: this.apiInfo,
      onChange: (s, key) => {
        this.settings = s;
        if (key === 'quality') { this.settings.autoQuality = s.autoQuality; this.applyQuality(); }
        if (key === 'fov' && this.camera) { this.camera.fov = s.fov; this.camera.updateProjectionMatrix(); if (this.level?.camera) { this.level.camera.fov = s.fov; this.level.camera.updateProjectionMatrix(); } }
        if (key.endsWith('Volume')) this.applyVolumes();
        if (this.level?.rig) this.level.rig.settings = s;
        Bridge.setSettings(s);
      },
      onApiKey: async k => { const r = await Bridge.setApiKey(k); if (r.ok) { this.apiInfo.hasApiKey = !!k; this._apod = null; } return r; },
      onBack: back,
    });
  }
  pauseMenu() {
    this.paused = true;
    this.audio.stopAllLoops();
    const back = () => this.pauseMenu();
    this.ui.pause({
      onResume: () => { this.ui.close(); this.paused = false; },
      onSave: async () => { await this.save(); this.ui.toast('Game saved', 'good'); },
      onSettings: () => this.settingsMenu(back),
      onControls: () => this.ui.controls(back),
      onRestart: this.run ? () => { this.ui.close(); this.paused = false; this.startMission(this.run.def.id, this.lastStartOpts); } : null,
      onQuit: async () => { this.ui.close(); this.paused = false; await this.save(); this.mainMenu(); },
    });
  }
  async save() { await SaveSystem.save(this.state); this.hasSave = true; }

  // ---------------- levels ----------------
  async unloadLevel() {
    if (this.level) { this.level.dispose(); this.level = null; }
    this.ui.removeHud(); this.ui.removeFlightHud(); this.ui.checklist(null); this.ui.clearRadio();
    this.input.wantLock = false; this.input.unlock();
    this.audio.stopAllLoops();
  }
  async loadLevel(kind, opts = {}) {
    await this.ui.fade(true);
    this.ui.close();
    await this.unloadLevel();
    const facts = [
      'The Moon terrain is built from LRO laser-altimeter and stereo-camera elevation data.',
      'Hadley Rille is about 1.2 km wide and 300 m deep where Apollo 15 visited it.',
      'Mars gravity is 38% of Earth\'s: you can jump nearly three times higher.',
      'Curiosity landed in Gale Crater on 6 August 2012 using a rocket-powered "sky crane".',
      'Lunar sample 15415, the "Genesis Rock", is almost pure plagioclase feldspar.',
      'The Apollo 15 Lunar Roving Vehicle is still parked where it was left in 1971.',
    ];
    const ld = this.ui.loading(opts.loadingText || 'Loading', facts[Math.floor(Math.random() * facts.length)]);
    try {
      let L;
      if (kind === 'surface') { const { SurfaceLevel } = await import('../levels/SurfaceLevel.js'); L = new SurfaceLevel(this, opts); }
      else if (kind === 'cockpit') { const { CockpitLevel } = await import('../levels/CockpitLevel.js'); L = new CockpitLevel(this, opts); }
      else if (kind === 'ascent') { const { AscentLevel } = await import('../levels/AscentLevel.js'); L = new AscentLevel(this, opts); }
      else if (kind === 'cruise') { const { CruiseLevel } = await import('../levels/CruiseLevel.js'); L = new CruiseLevel(this, opts); }
      await L.load(p => ld.set(p));
      this.level = L;
      ld.set(1);
    } catch (e) {
      console.error(e); ld.done(); await this.ui.fade(false);
      this.ui.toast('Failed to load: ' + e.message, 'bad', 8000);
      this.mainMenu();
      return;
    }
    ld.done();
    this.clock.getDelta();
    await this.ui.fade(false);
    if (this.level.start) this.level.start();
  }

  // ---------------- missions ----------------
  startMission(id, opts = {}) {
    const def = missionById(id);
    this.lastStartOpts = opts;
    this.run = new MissionRun(def);
    this._failShown = false;
    this.state.missions.current = id;
    this.flight = { missionId: id, rocket: def.rocket || 'saturn_v', dest: def.site };
    if (def.start === 'earth' && !opts.skipFlight) return this.loadLevel('surface', { site: 'earth', loadingText: 'Kennedy Space Center · Launch Complex' });
    if (def.start === 'earth' && opts.skipFlight) {
      // resume at the landing: mark the flight objectives as done
      const flightIds = def.objectives.filter(o => ['talk:rao', 'boarded', 'preflight', 'orbit', 'departure', 'mcc', 'chute'].includes(o.event) && !o.optional).map(o => o.id);
      this.run.forceDone(flightIds.filter(x => x !== 'chute'));
      return this.loadLevel('surface', { site: def.site, landing: true, loadingText: 'Approach' });
    }
    return this.loadLevel('surface', { site: def.site, loadingText: SITES[def.site].name });
  }
  explore(site) { this.run = null; this.state.missions.current = null; this.loadLevel('surface', { site, loadingText: SITES[site].name }); }

  /** Game events feed the mission (and radio chatter). */
  emit(name, n = 1) {
    if (RADIO[name]) this.ui.radio(...RADIO[name]);
    if (!this.run) return [];
    const done = this.run.event(name, n);
    for (const o of done) { this.ui.toast('✔ ' + o.text, 'good'); this.audio.beep(); }
    if (this.run.complete && !this._failShown) setTimeout(() => this.finishMission(true), 1200);
    return done;
  }
  async finishMission(success, reason) {
    if (this._failShown) return;
    this._failShown = true;
    const run = this.run, def = run.def;
    // let the player finish reading an open card/dialogue before the results screen appears
    for (let i = 0; i < 240 && this.ui.isModal; i++) await new Promise(r => setTimeout(r, 250));
    this.input.unlock();
    let rows = [['Mission time', `${Math.floor(run.elapsed / 60)}:${String(Math.round(run.elapsed % 60)).padStart(2, '0')}`],
      ['Objectives', `${[...run.done].length}/${def.objectives.length}`]];
    if (success) {
      const r = applyRewards(this.state, def, run);
      rows.push(['Research', `+${r.research} RP (total ${this.state.research})`]);
      if (r.unlocked.length) rows.push(['Unlocked', r.unlocked.map(u => missionById(u).name).join(', ')]);
      if (r.spacecraft.length) rows.push(['New spacecraft', r.spacecraft.join(', ').replace('vx_heavy', 'VX-Heavy')]);
      if (r.locations.length) rows.push(['New location', r.locations.map(l => SITES[l].name).join(', ')]);
      this.state.missions.current = null;
      await this.save();
    }
    const next = success ? MISSIONS.find(m => this.state.missions.unlocked.includes(m.id) && !this.state.missions.completed[m.id]) : null;
    this.ui.results({
      success, title: def.name, reason: success ? (def.id === 'm6' ? 'Aeolis Station is operational. The VEERAPPAN programme has a permanent home on Mars. Thank you for playing!' : null) : reason, rows,
      onContinue: success ? () => { this.ui.close(); if (next) this.missionSelect(); else this.missionSelect(); } : null,
      onRetry: () => { this.ui.close(); this.startMission(def.id, this.lastStartOpts); },
      onMenu: () => { this.ui.close(); this.mainMenu(); },
    });
    if (!success) this.audio.stopAllLoops();
  }
}
