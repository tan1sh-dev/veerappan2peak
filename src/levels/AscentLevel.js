import * as THREE from 'three';
import { Assets } from '../core/Assets.js';
import { makeStarfield, makeGradientSky, makeGlowSprite } from '../world/Sky.js';
import { makeLaunchTower, propMaterial as mat } from '../world/Props.js';
import { makeAscent, stepAscent, guidancePitch, altitude, orbit, speed, canStage, doStage, inOrbit, ROCKETS, EARTH, stageDeltaV, burnPrograde, DEPARTURE_DV } from '../sim/ascent.js';
import { tag } from '../ui/UI.js';
import { mergeStatic } from '../world/merge.js';

// Rocket ascent: interactive pitch/throttle/staging with a guidance cue, real g and Earth radius,
// simplified (approximate) vehicle data. Then the departure burn (TLI / TMI).
export class AscentLevel {
  constructor(game, opts) {
    this.game = game; this.opts = opts; this.type = opts.rocket || 'saturn_v';
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(game.settings.fov, innerWidth / innerHeight, 0.5, 4e7);
    this.A = makeAscent(this.type); this.phase = 'pad'; this.warp = 1; this.autopilot = false; this.t = 0;
    this.camYaw = 0.6; this.camPitch = 0.15; this.camDist = 180;
    this.departDv = 0; this.allowPause = true;
  }
  async load(progress) {
    const s = this.scene;
    this.sky = makeGradientSky('#3d77c4', '#bcd5ea', 3e6); s.add(this.sky);
    this.stars = makeStarfield(3000, 3e6); this.stars.material.opacity = 0; this.stars.material.transparent = true; s.add(this.stars);
    s.add(new THREE.HemisphereLight(0xbcd5ea, 0x55603a, 1.0));
    const sun = new THREE.DirectionalLight(0xfff3e0, 3.2); sun.position.set(1, 0.8, 0.4).multiplyScalar(1e5); s.add(sun);
    // Earth: big sphere (radius in metres) under the pad; ground near the pad is a flat disc
    const earthMat = new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: new THREE.Vector3(1, 0.8, 0.4).normalize() } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vN; varying vec3 vP; uniform vec3 sunDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        void main(){ vec3 p = normalize(vP)*6.0; float land = n(p)*0.6 + n(p*2.3)*0.3 + n(p*5.0)*0.1;
          vec3 c = land > 0.55 ? mix(vec3(0.25,0.35,0.15), vec3(0.55,0.45,0.3), smoothstep(0.55,0.8,land)) : vec3(0.05,0.18,0.42);
          float cl = smoothstep(0.55, 0.8, n(p*3.0+7.0)*0.7 + n(p*8.0)*0.3); c = mix(c, vec3(0.95), cl*0.8);
          float d = max(dot(normalize(vN), sunDir), 0.0); gl_FragColor = vec4(c*(0.15+0.95*d), 1.0); }`,
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH.R, 96, 64), earthMat);
    this.earth.position.set(0, -EARTH.R - 2, 0); s.add(this.earth);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(EARTH.R * 1.015, 64, 32), new THREE.MeshBasicMaterial({ color: 0x6fb2ff, transparent: true, opacity: 0.18, side: THREE.BackSide, depthWrite: false }));
    this.earth.add(atm);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30000, 48), new THREE.MeshStandardMaterial({ color: 0x5d6b3a, roughness: 1 })); ground.rotation.x = -Math.PI / 2; s.add(ground); this.groundDisc = ground;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(70, 80, 3, 8), new THREE.MeshStandardMaterial({ color: 0x9a9890 })); pad.position.y = 1.5; s.add(pad);
    const tower = mergeStatic(makeLaunchTower(118)); tower.position.set(0, 3, 0); s.add(tower); this.tower = tower;
    progress(0.4);
    this.rocket = new THREE.Group(); s.add(this.rocket);
    if (this.type === 'saturn_v') {
      try { const m = mergeStatic(await Assets.model('models/saturn_v.glb', { height: 110.6 })); this.rocket.add(m); } catch (e) { this.rocket.add(this.proceduralRocket()); }
    } else this.rocket.add(this.proceduralRocket());
    this.rocket.position.set(0, 11, 0);
    // exhaust
    const flame = new THREE.Mesh(new THREE.ConeGeometry(7, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.rotation.x = Math.PI; flame.position.y = -30; this.rocket.add(flame); this.flame = flame;
    const glow = makeGlowSprite('#ffcf8a', 120, 0.2); glow.position.y = -10; this.rocket.add(glow); this.glow = glow;
    // smoke trail
    const N = Math.round(400 * this.game.preset.particles) + 50;
    this.smoke = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd, transparent: true, opacity: 0.55, depthWrite: false }), N);
    this.smoke.count = 0; this.smoke.frustumCulled = false; this.smokeIdx = 0; this.smokeN = N; this.smokeData = []; s.add(this.smoke);
    progress(1);
  }
  proceduralRocket() {
    const g = new THREE.Group();
    const add = (geo, m, y) => { const o = new THREE.Mesh(geo, mat(m)); o.position.y = y; o.castShadow = true; g.add(o); return o; };
    add(new THREE.CylinderGeometry(5, 5, 60, 24), 'white', 30); add(new THREE.CylinderGeometry(4, 5, 30, 24), 'white', 75);
    add(new THREE.ConeGeometry(4, 14, 24), 'grey', 97); add(new THREE.CylinderGeometry(5.2, 5.2, 2, 24), 'orange', 59);
    for (const a of [0, Math.PI]) { const b = add(new THREE.CylinderGeometry(2, 2, 45, 16), 'white', 24); b.position.x = Math.cos(a) * 7.5; b.position.z = Math.sin(a) * 7.5; const n = add(new THREE.ConeGeometry(2, 6, 16), 'orange', 49.5); n.position.x = b.position.x; n.position.z = b.position.z; }
    return g;
  }
  start() {
    this.game.ui.flightHud();
    this.game.ui.radio('director', `All engines running… LIFTOFF! ${ROCKETS[this.type].name} has cleared the tower.`);
    this.A.engineOn = true; this.phase = 'ascent';
    this.game.emit('liftoff');
    this.game.audio.separation();
  }
  onKey(code) {
    if (code === 'KeyG') { this.autopilot = !this.autopilot; this.game.ui.toast(this.autopilot ? 'Guidance autopilot ON' : 'Manual control', 'info', 1500); }
    if (code === 'Period') this.setWarp(this.warp * 2);
    if (code === 'Comma') this.setWarp(this.warp / 2);
    if (code === 'Space' && this.phase === 'ascent' && canStage(this.A)) this.stage();
    if (code === 'KeyV') this.camDist = this.camDist > 100 ? 60 : this.camDist > 50 ? 400 : 180;
  }
  setWarp(w) {
    const max = altitude(this.A) < 30000 ? 4 : 16;
    this.warp = Math.max(1, Math.min(max, Math.round(w)));
    this.game.ui.toast(`Time warp ×${this.warp}`, 'info', 900);
  }
  stage() { if (doStage(this.A)) { this.game.audio.separation(); this.game.emit('staging'); } }
  update(dt) {
    const A = this.A, inp = this.game.input, ui = this.game.ui;
    this.t += dt;
    // controls
    if (this.phase === 'ascent') {
      const cue = guidancePitch(A);
      if (this.autopilot) A.pitch += (cue - A.pitch) * Math.min(1, 3 * dt);
      else {
        const p = inp.axis('KeyD', 'KeyA'); // A raises the nose, D lowers it (towards the horizon)
        A.pitch = Math.max(-5, Math.min(90, A.pitch + p * 12 * dt));
      }
      if (inp.isDown('ShiftLeft')) A.throttle = Math.min(1, A.throttle + dt * 0.7);
      if (inp.isDown('ControlLeft')) A.throttle = Math.max(0, A.throttle - dt * 0.7);
      const steps = this.warp;
      for (let i = 0; i < steps; i++) {
        stepAscent(A, dt);
        if (A.fuel[A.stage] <= 0 && canStage(A) && (this.autopilot || A.stage === 0)) this.stage();
      }
      if (!this.maxqSaid && altitude(A) > 11000) { this.maxqSaid = true; this.game.emit('maxq'); }
      if (inOrbit(A)) { this.phase = 'orbit'; A.engineOn = false; this.warp = 4; this.game.emit('orbit'); }
      else if (A.t > 20 && altitude(A) < 500 && A.vr < -5) this.failFlight('The vehicle fell back: not enough upward speed.');
      else if (A.fuel.every((f, i) => i < A.stage || f <= 0) && !canStage(A) && !inOrbit(A) && A.vr < 0) this.failFlight('Out of propellant before reaching orbit.');
      else if (Math.abs(A.pitch - guidancePitch(A)) > 35 && altitude(A) < 40000 && speed(A) > 300) this.failFlight('Vehicle broke up: angle of attack too high in the atmosphere.');
    } else if (this.phase === 'orbit') {
      // coast; Space (hold) = departure burn
      A.engineOn = false;
      stepAscent(A, dt * this.warp);
      const need = DEPARTURE_DV[this.game.flight?.dest || 'moon'];
      if (inp.isDown('Space') && A.fuel[A.stage] > 0) {
        this.departDv += burnPrograde(A, dt * this.warp);
        this.burning = true;
        if (this.departDv >= need) { this.phase = 'done'; this.burning = false; this.game.emit('departure'); setTimeout(() => this.game.loadLevel('cruise', { dest: this.game.flight?.dest || 'moon', loadingText: 'Trans-' + (this.game.flight?.dest === 'mars' ? 'Mars' : 'lunar') + ' coast' }), 2500); }
      } else this.burning = false;
      if (A.fuel[A.stage] <= 0 && this.departDv < need) this.failFlight('Not enough propellant for the departure burn.');
    }
    // visuals
    const alt = altitude(A);
    const down = A.theta * EARTH.R;   // downrange distance (m) along the surface
    // place rocket: local frame where the pad is at origin; earth curvature via sphere
    const ang = A.theta;
    const rp = new THREE.Vector3(Math.sin(ang) * A.r, Math.cos(ang) * A.r - EARTH.R - 2 + 11, 0);
    this.rocket.position.copy(rp);
    const pitchRad = A.pitch * Math.PI / 180;
    this.rocket.rotation.set(0, 0, -(Math.PI / 2 - pitchRad) - ang);
    const firing = (this.phase === 'ascent' && A.engineOn && A.fuel[A.stage] > 0 && A.throttle > 0) || this.burning;
    this.flame.visible = firing; this.glow.visible = firing;
    this.flame.scale.set(1 + Math.random() * 0.1, (0.6 + A.throttle * 0.6) * (1 + alt / 60000), 1 + Math.random() * 0.1);
    this.game.audio.setLoop('engine', firing ? Math.max(0.15, 1 - alt / 90000) : 0, A.throttle);
    // smoke puffs in the low atmosphere
    if (firing && alt < 25000 && this.phase === 'ascent') {
      const n = this.warp > 1 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const sz = 6 + Math.random() * 6 + alt / 1500;
        this.smokeData[this.smokeIdx % this.smokeN] = { p: rp.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, -50, (Math.random() - 0.5) * 6).applyEuler(this.rocket.rotation)), s: sz, t: 0 };
        this.smokeIdx++;
      }
    }
    const o = new THREE.Object3D(); let c = 0;
    for (const d of this.smokeData) { if (!d) continue; d.t += dt; o.position.copy(d.p); o.scale.setScalar(d.s * (1 + d.t * 0.4)); o.updateMatrix(); this.smoke.setMatrixAt(c++, o.matrix); }
    this.smoke.count = c; this.smoke.instanceMatrix.needsUpdate = true;
    // sky fades to black with altitude
    const k = Math.min(1, alt / 60000);
    this.sky.material.uniforms.top.value.setRGB(0.24 * (1 - k), 0.47 * (1 - k), 0.77 * (1 - k));
    this.sky.material.uniforms.horizon.value.setRGB(0.74 * (1 - k * 0.9), 0.83 * (1 - k * 0.85), 0.92 * (1 - k * 0.8));
    this.stars.material.opacity = k; this.groundDisc.visible = alt < 40000;
    // camera chase
    if (inp.mouse.right) { this.camYaw -= inp.mouse.dx * 0.004; this.camPitch = Math.max(-1.2, Math.min(1.2, this.camPitch - inp.mouse.dy * 0.004)); }
    if (inp.mouse.wheel) this.camDist = Math.max(40, Math.min(3000, this.camDist * (1 + inp.mouse.wheel * 0.12)));
    const dist = this.camDist * (1 + Math.min(alt / 20000, 6));
    const center = rp.clone().add(new THREE.Vector3(0, 50, 0).applyEuler(this.rocket.rotation));
    const cpos = center.clone().add(new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch)).multiplyScalar(dist));
    const surf = Math.cos(Math.atan2(cpos.x, cpos.y + EARTH.R)) * 0; // keep above ground
    if (alt < 2000 && cpos.y < 5) cpos.y = 5 + surf;
    this.camera.position.copy(cpos);
    this.camera.up.set(Math.sin(ang), Math.cos(ang), 0);
    this.camera.lookAt(center);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.stars.position.copy(this.camera.position); this.sky.position.copy(this.camera.position);
    // HUD
    const ob = orbit(A), R = ROCKETS[this.type], st = R.stages[A.stage];
    const cue = guidancePitch(A);
    const fuelPct = A.fuel[A.stage] / st.fuel * 100;
    const need = DEPARTURE_DV[this.game.flight?.dest || 'moon'];
    let msg = '';
    if (this.phase === 'ascent' && A.fuel[A.stage] <= 0 && canStage(A)) msg = 'STAGE EMPTY: PRESS SPACE TO STAGE';
    if (this.phase === 'orbit') msg = `IN ORBIT · HOLD SPACE FOR ${this.game.flight?.dest === 'mars' ? 'TRANS-MARS' : 'TRANS-LUNAR'} INJECTION<br><span style="font-size:14px">Δv ${Math.round(this.departDv)} / ${need} m/s</span>`;
    if (this.phase === 'done') msg = 'BURN COMPLETE';
    ui.flight({
      left: `<div class="hdr">${R.name} ${tag(this.type === 'saturn_v' ? 'approx' : 'fiction', 'Vehicle masses/thrust approximated; Earth radius & gravity real').outerHTML}</div>
        <div><span class="k">MET</span>T+${Math.floor(A.t / 60)}:${String(Math.floor(A.t % 60)).padStart(2, '0')} ${this.warp > 1 ? `<b style="color:var(--amber)">×${this.warp}</b>` : ''}</div>
        <div><span class="k">ALTITUDE</span><b>${(alt / 1000).toFixed(1)} km</b></div>
        <div><span class="k">VELOCITY</span><b>${speed(A).toFixed(0)} m/s</b></div>
        <div><span class="k">VERT. SPEED</span>${A.vr.toFixed(0)} m/s</div>
        <div><span class="k">DOWNRANGE</span>${(down / 1000).toFixed(0)} km</div>
        <div><span class="k">APOAPSIS</span>${ob.escape ? '∞' : (ob.apo / 1000).toFixed(0) + ' km'}</div>
        <div><span class="k">PERIAPSIS</span>${ob.peri === null ? '-' : ob.peri < -1000000 ? 'suborbital' : (ob.peri / 1000).toFixed(0) + ' km'}</div>
        <div><span class="k">G-LOAD</span>${(A.accelG || 0).toFixed(1)} g</div>`,
      right: `<div class="hdr">${st.name}</div>
        <div>Fuel ${fuelPct.toFixed(0)}%</div><div class="gauge ${fuelPct < 15 ? 'amber' : ''}"><div style="width:${fuelPct}%"></div></div>
        <div>Throttle ${Math.round(A.throttle * 100)}%</div><div class="gauge"><div style="width:${A.throttle * 100}%"></div></div>
        <div>Stage Δv left: ${stageDeltaV(A).toFixed(0)} m/s</div>
        <div><span class="light ${Math.abs(A.pitch - cue) < 5 ? 'on' : Math.abs(A.pitch - cue) < 15 ? 'warn' : 'bad'}"></span>Pitch ${A.pitch.toFixed(0)}° / cue ${cue.toFixed(0)}°</div>
        <div><span class="light ${this.autopilot ? 'on' : ''}"></span>Autopilot (G)</div>
        <div style="margin-top:6px;color:var(--muted)">Target orbit: 170 km · Real TLI Δv ≈ 3.1 km/s, TMI ≈ 3.6 km/s ${tag('nasa', 'Typical published mission values').outerHTML}</div>`,
      msg,
      bottom: this.phase === 'ascent' ? 'A/D pitch to the cue · Shift/Ctrl throttle · SPACE stage · G autopilot · , . time warp · right-drag camera · V camera distance' : 'Hold SPACE to burn · press . to speed up time (the burn takes a few minutes at ×1)',
      ladder: g => {
        g.strokeStyle = 'rgba(79,209,255,.6)'; g.lineWidth = 1; g.beginPath(); g.arc(110, 110, 100, 0, Math.PI * 2); g.stroke();
        const toXY = deg => { const a = (90 - deg) * Math.PI / 180; return [110 + Math.sin(a) * 95, 110 - Math.cos(a) * 95]; };
        g.font = '11px Consolas'; g.fillStyle = 'rgba(200,220,240,.7)'; g.fillText('90°', 100, 12); g.fillText('0°', 200, 114);
        const [cx, cy] = toXY(cue); g.strokeStyle = '#4fd1ff'; g.lineWidth = 3; g.strokeRect(cx - 9, cy - 9, 18, 18);
        const [px, py] = toXY(A.pitch); g.fillStyle = '#ffb347'; g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#ffb347'; g.beginPath(); g.moveTo(110, 110); g.lineTo(px, py); g.stroke();
      },
    });
  }
  failFlight(reason) {
    if (this._failed) return; this._failed = true; this.phase = 'failed';
    this.game.audio.alarm(); this.game.audio.setLoop('engine', 0);
    if (this.game.run) this.game.run.fail(reason); else this.game.mainMenu();
  }
  dispose() { this.game.ui.removeFlightHud(); this.game.audio.stopAllLoops(); this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
}
