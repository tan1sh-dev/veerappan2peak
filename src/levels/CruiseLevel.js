import * as THREE from 'three';
import { Assets } from '../core/Assets.js';
import { makeStarfield, makeGlowSprite, makeDiskSprite } from '../world/Sky.js';
import { propMaterial as mat, makeLander } from '../world/Props.js';
import { tag } from '../ui/UI.js';

// Interplanetary / cislunar cruise. Travel is time-compressed. Mid-course correction (MCC): point the
// spacecraft at the cyan target marker and burn to null the trajectory error. Real transit times are shown.
export class CruiseLevel {
  constructor(game, opts) {
    this.game = game; this.dest = opts.dest || 'moon';
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(game.settings.fov, innerWidth / innerHeight, 0.1, 1e6);
    this.progress = 0; this.warp = 1; this.phase = 'coast'; this.error = 0; this.fuel = 100;
    this.camYaw = 0.35; this.camPitch = 0.22; this.camDist = 30; this.allowPause = true; this.t = 0;
    this.shipYaw = 0; this.shipPitch = 0;
    // Real reference durations
    this.totalDays = this.dest === 'mars' ? 254 : 3.0;
  }
  async load(progress) {
    const s = this.scene;
    s.background = new THREE.Color(0x000000);
    s.add(makeStarfield(this.game.preset.starCount + 1000, 5e5));
    const sun = new THREE.DirectionalLight(0xffffff, 3.2); sun.position.set(-1, 0.3, 0.6).multiplyScalar(1000); s.add(sun);
    s.add(new THREE.AmbientLight(0x223344, 0.4));
    const sunSp = makeGlowSprite('#fff6e0', 30000, 0.06); sunSp.position.set(-1, 0.3, 0.6).multiplyScalar(4e5); s.add(sunSp);
    // destination globe (real global mosaic textures)
    const tex = await Assets.texture(this.dest === 'mars' ? 'textures/mars_globe.jpg' : 'textures/moon_globe.jpg');
    this.target = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    s.add(this.target);
    progress(0.5);
    try { const et = await Assets.texture('textures/earth_blue_marble.jpg'); this.earth = makeDiskSprite(et, 1); s.add(this.earth); } catch { }
    // spacecraft (game model): service module + capsule (+ lander for the Moon)
    this.ship = new THREE.Group();
    const sm = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 6, 20), mat('alu')); sm.rotation.x = Math.PI / 2; this.ship.add(sm);
    const cm = new THREE.Mesh(new THREE.ConeGeometry(2, 3.4, 20), mat('white')); cm.rotation.x = -Math.PI / 2; cm.position.z = -4.7; this.ship.add(cm);
    const bell = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 16, 1, true), mat('dark')); bell.rotation.x = -Math.PI / 2; bell.position.z = 4.2; this.ship.add(bell);
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 2.2), mat('solar')); p.position.set(sx * 5.6, 0, 1); this.ship.add(p); }
    const lander = makeLander(); lander.scale.setScalar(0.45); lander.rotation.x = Math.PI / 2; lander.position.z = 7.5; this.ship.add(lander);
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(1, 6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flame.rotation.x = Math.PI / 2; this.flame.position.z = 8; this.ship.add(this.flame);
    s.add(this.ship);
    this.marker = makeGlowSprite('#4fd1ff', 3, 0.3); s.add(this.marker);
    progress(1);
  }
  start() {
    this.game.ui.flightHud();
    this.game.ui.radio('mitchell', this.dest === 'mars'
      ? 'Trans-Mars injection confirmed. Curiosity\'s cruise took 254 days. We\'ll compress that for you. Use , and . to change time warp.'
      : 'Trans-lunar injection confirmed. Apollo 15 took about three days to reach lunar orbit. We\'ll speed things up. Use , and . for time warp.');
  }
  onKey(code) {
    if (code === 'Period') { this.warp = Math.min(this.phase === 'mcc' ? 1 : 8, this.warp * 2); this.game.ui.toast(`Time warp ×${this.warp}`, 'info', 800); }
    if (code === 'Comma') { this.warp = Math.max(1, this.warp / 2); this.game.ui.toast(`Time warp ×${this.warp}`, 'info', 800); }
  }
  update(dt) {
    const inp = this.game.input, ui = this.game.ui;
    this.t += dt;
    const rate = 1 / 75; // ~75 s of real time at x1 for the whole cruise
    if (this.phase === 'coast' || this.phase === 'coast2') {
      this.progress = Math.min(1, this.progress + dt * rate * this.warp);
      if (this.phase === 'coast' && this.progress >= 0.35) {
        this.phase = 'mcc'; this.warp = 1;
        // random small trajectory error: target direction offset from the ship's nose
        this.tYaw = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4);
        this.tPitch = (Math.random() - 0.5) * 0.6;
        this.error = 1;
        this.game.emit('mccNeeded');
      }
      if (this.progress >= 1 && !this.arrived) {
        this.arrived = true;
        this.game.emit(this.dest === 'mars' ? 'entry' : 'approach');
        setTimeout(() => this.game.loadLevel('surface', { site: this.dest, landing: true, loadingText: this.dest === 'mars' ? 'Entry, descent and landing' : 'Powered descent' }), 1800);
      }
    }
    // ship attitude control (mouse with right button, or WASD)
    const yawIn = inp.axis('KeyD', 'KeyA'), pitchIn = inp.axis('KeyS', 'KeyW');
    this.shipYaw += yawIn * dt * 0.6; this.shipPitch = Math.max(-1.2, Math.min(1.2, this.shipPitch + pitchIn * dt * 0.6));
    if (inp.mouse.right) { this.camYaw -= inp.mouse.dx * 0.004; this.camPitch = Math.max(-1.3, Math.min(1.3, this.camPitch - inp.mouse.dy * 0.004)); }
    if (inp.mouse.wheel) this.camDist = Math.max(14, Math.min(120, this.camDist * (1 + inp.mouse.wheel * 0.1)));
    this.ship.rotation.set(this.shipPitch, this.shipYaw, 0, 'YXZ');
    const nose = new THREE.Vector3(0, 0, -1).applyEuler(this.ship.rotation);
    let burning = false, align = 0;
    if (this.phase === 'mcc') {
      const tdir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.tPitch, this.tYaw, 0, 'YXZ'));
      this.marker.visible = true; this.marker.position.copy(tdir).multiplyScalar(40);
      align = nose.dot(tdir);
      if (inp.isDown('Space') && this.fuel > 0) {
        burning = true; this.fuel = Math.max(0, this.fuel - dt * 4);
        if (align > 0.985) this.error = Math.max(0, this.error - dt * 0.35);
        else this.error = Math.min(1.5, this.error + dt * 0.15 * (1 - align));
      }
      if (this.error <= 0.02) { this.phase = 'coast2'; this.marker.visible = false; this.game.emit('mcc'); }
      if (this.fuel <= 0 && this.error > 0.02) this.fail('Out of correction propellant: the trajectory misses the target.');
    } else this.marker.visible = false;
    this.flame.visible = burning; this.flame.scale.setScalar(0.8 + Math.random() * 0.3);
    this.game.audio.setLoop('rcs', (yawIn || pitchIn) ? 0.6 : 0);
    this.game.audio.setLoop('engine', burning ? 0.25 : 0, 0.3);
    this.game.audio.setLoop('cabin', 1);
    // scenery: target grows as we approach; Earth shrinks behind
    const p = this.progress;
    const dir = new THREE.Vector3(0.3, -0.05, -1).normalize();
    const R = this.dest === 'mars' ? 3389.5 : 1737.4;
    const dist = THREE.MathUtils.lerp(this.dest === 'mars' ? 400000 : 200000, R * 3.2, Math.pow(p, 2.2));
    const scale = 1000 / 1; // 1 unit = 1 km, but compress distance so it stays inside the far plane
    const vis = Math.min(dist, 120000);
    this.target.scale.setScalar(R * vis / dist);
    this.target.position.copy(dir).multiplyScalar(vis);
    this.target.rotation.y += dt * 0.01;
    if (this.earth) {
      const ed = THREE.MathUtils.lerp(3 * 6371, this.dest === 'mars' ? 4e5 : 2e5, Math.pow(p, 0.8));
      const ev = Math.min(ed, 120000);
      this.earth.scale.setScalar(2 * 6371 * ev / ed);
      this.earth.position.set(-0.4, 0.15, 1).normalize().multiplyScalar(ev);
    }
    // camera
    const off = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch)).multiplyScalar(this.camDist);
    this.camera.position.copy(off); this.camera.lookAt(0, 0, 0);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    // HUD
    const days = p * this.totalDays;
    const remainKm = dist - R;
    ui.flight({
      left: `<div class="hdr">${this.dest === 'mars' ? 'Trans-Mars coast' : 'Trans-lunar coast'} ${tag('approx', 'Time-compressed; scenery distances approximate').outerHTML}</div>
        <div><span class="k">MISSION DAY</span><b>${days < 10 ? days.toFixed(1) : Math.floor(days)}</b> / ${this.totalDays} ${tag('nasa', this.dest === 'mars' ? 'MSL: launch 26 Nov 2011, landing 6 Aug 2012 (PDS context record)' : 'Apollo 15: launch 26 July 1971, lunar orbit 29 July').outerHTML}</div>
        <div><span class="k">DISTANCE TO GO</span>${remainKm > 1e6 ? (remainKm / 1e6).toFixed(1) + ' million km' : Math.round(remainKm).toLocaleString() + ' km'}</div>
        <div><span class="k">PROGRESS</span>${Math.round(p * 100)}%</div><div class="gauge"><div style="width:${p * 100}%"></div></div>
        <div><span class="k">RCS / MCC FUEL</span>${this.fuel.toFixed(0)}%</div>
        <div><span class="k">TIME WARP</span>×${this.warp}</div>`,
      right: this.phase === 'mcc' ? `<div class="hdr">Mid-course correction</div>
        <div><span class="light ${align > 0.985 ? 'on' : align > 0.9 ? 'warn' : 'bad'}"></span>Alignment ${(Math.max(0, align) * 100).toFixed(1)}%</div>
        <div>Trajectory error</div><div class="gauge amber"><div style="width:${Math.min(100, this.error * 100)}%"></div></div>
        <div style="color:var(--muted)">Point the nose (W/A/S/D) at the cyan marker until the light is green, then hold SPACE.</div>` : '',
      msg: this.phase === 'mcc' ? 'MID-COURSE CORRECTION REQUIRED' : this.arrived ? (this.dest === 'mars' ? 'ENTRY INTERFACE' : 'APPROACHING LANDING SITE') : '',
      bottom: 'W/A/S/D attitude · SPACE burn · , . time warp · right-drag camera · wheel zoom',
    });
  }
  fail(reason) { if (this._f) return; this._f = true; this.game.audio.alarm(); if (this.game.run) this.game.run.fail(reason); }
  dispose() { this.game.ui.removeFlightHud(); this.game.audio.stopAllLoops(); this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
}
