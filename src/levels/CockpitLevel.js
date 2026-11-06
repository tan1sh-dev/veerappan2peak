import * as THREE from 'three';
import { propMaterial as mat } from '../world/Props.js';
import { makeGradientSky } from '../world/Sky.js';

// Interactive capsule cockpit (game model). Click the glowing switches in checklist order, then ignite.
const STEPS = [
  { label: 'MAIN BUS A/B: ON', radio: ['director', 'Main bus voltage nominal.'] },
  { label: 'GUIDANCE: ALIGN', radio: ['mitchell', 'Guidance platform aligned. You\'re looking good.'] },
  { label: 'CABIN PRESSURE: CHECK', radio: ['director', 'Cabin pressure holding. Suit loop is good.'] },
  { label: 'COMMS: LAUNCH CONTROL', radio: ['director', 'Loud and clear, Veerappan. All stations report GO for launch.'] },
  { label: 'ENGINES: ARM', radio: ['mitchell', 'Engines armed. Final countdown is yours.'] },
  { label: 'IGNITION', radio: null },
];

function placeAt(o, x, y, z) { o.position.set(x, y, z); return o; }

export class CockpitLevel {
  constructor(game, opts) { this.game = game; this.opts = opts; this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 5000); this.step = 0; this.switches = []; this.allowPause = true; this.t = 0; }
  async load(progress) {
    const s = this.scene;
    s.add(makeGradientSky('#2f6db8', '#a8c8e8', 3000));
    s.add(new THREE.HemisphereLight(0xcfe3ff, 0x333333, 1.2));
    const key = new THREE.PointLight(0xfff0dd, 6, 6); key.position.set(0, 1.8, 0.3); s.add(key);
    // capsule interior: truncated cone shell
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 2.0, 2.6, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x6f7680, roughness: 0.8, side: THREE.BackSide }));
    shell.position.set(0, 1.2, 0); s.add(shell);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2, 24), mat('dark')); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.05; s.add(floor);
    // windows
    for (const x of [-0.55, 0.55]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshBasicMaterial({ color: 0x8ec5ff })); w.position.set(x, 1.95, -1.05); w.rotation.x = -0.35; s.add(w); }
    // seats
    for (const x of [-0.7, 0, 0.7]) {
      const seat = new THREE.Group();
      seat.add(placeAt(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.9), mat('grey')), 0, 0.45, 0.2));
      seat.add(placeAt(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.12), mat('grey')), 0, 0.85, 0.65));
      seat.position.x = x; s.add(seat);
    }
    // main panel
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.12), mat('dark')); panel.position.set(0, 1.35, -0.8); panel.rotation.x = -0.35; s.add(panel);
    this.panel = panel;
    // displays (canvas textures)
    this.displays = [];
    for (const x of [-0.6, 0.6]) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.31), new THREE.MeshBasicMaterial({ map: t }));
      d.position.set(x, 0.08, 0.065); panel.add(d); this.displays.push({ cv, t });
    }
    // switches
    STEPS.forEach((st, i) => {
      const isBig = i === STEPS.length - 1;
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.03), mat('grey'));
      const lever = new THREE.Mesh(isBig ? new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16) : new THREE.BoxGeometry(0.03, 0.1, 0.03), new THREE.MeshStandardMaterial({ color: isBig ? 0xcc2020 : 0xdddddd, emissive: 0x000000 }));
      if (isBig) lever.rotation.x = Math.PI / 2; else { lever.position.y = 0.03; lever.rotation.x = 0.5; }
      lever.position.z = 0.03;
      g.add(base, lever);
      g.position.set(-0.75 + i * 0.3, -0.25, 0.07);
      panel.add(g);
      this.switches.push({ g, lever, i });
    });
    this.raycaster = new THREE.Raycaster();
    this.camera.position.set(0, 1.25, 0.35);
    this.yaw = 0; this.pitch = -0.25;
    progress(1);
  }
  start() {
    this.game.ui.checklist(STEPS.map(s => s.label), 0);
    this.game.ui.radio('director', 'Veerappan, Launch Control. Welcome aboard. Work through the checklist on the right: click each glowing switch.');
    this.game.input.wantLock = false;
  }
  flip(i) {
    if (i !== this.step) { this.game.audio.alarm(); this.game.ui.toast('Follow the checklist order', 'bad', 1200); return; }
    const sw = this.switches[i]; this.game.audio.switchFlip();
    if (i < STEPS.length - 1) sw.lever.rotation.x = -0.5; else sw.lever.position.z = 0.015;
    const st = STEPS[i];
    if (st.radio) this.game.ui.radio(...st.radio);
    this.step++;
    this.game.ui.checklist(STEPS.map(s => s.label), this.step);
    if (this.step === STEPS.length - 1) this.game.emit('preflight');
    if (this.step === STEPS.length) this.countdown();
  }
  countdown() {
    this.counting = 10;
    this.game.ui.radio('director', 'T-minus 10, 9, 8… ignition sequence start…', 6000);
  }
  onKey(code) { if (code === 'KeyE' && this.step < STEPS.length) this.flip(this.step); }
  update(dt) {
    this.t += dt;
    const inp = this.game.input;
    if (inp.mouse.right) { this.yaw -= inp.mouse.dx * 0.003; this.pitch -= inp.mouse.dy * 0.003; }
    this.yaw = Math.max(-1, Math.min(1, this.yaw)); this.pitch = Math.max(-0.8, Math.min(0.5, this.pitch));
    const shake = this.counting !== undefined && this.counting < 4 ? (4 - this.counting) * 0.004 : 0;
    this.camera.position.set(0 + (Math.random() - 0.5) * shake, 1.25 + (Math.random() - 0.5) * shake, 0.35);
    this.camera.lookAt(this.camera.position.clone().add(new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch))));
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    // glow on the next switch
    this.switches.forEach((s, i) => s.lever.material.emissive.setHex(i === this.step ? (Math.sin(this.t * 6) > 0 ? 0x4fd1ff : 0x0a3040) : 0x000000));
    if (inp.mouse.leftPressed && !this.game.ui.isModal) {
      const ndc = new THREE.Vector2(inp.mouse.x / innerWidth * 2 - 1, -(inp.mouse.y / innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObjects(this.switches.map(s => s.g), true);
      if (hits.length) { const sw = this.switches.find(s => s.g === hits[0].object.parent); if (sw) this.flip(sw.i); }
    }
    // displays
    const [a, b] = this.displays;
    const draw = (d, lines, col = '#5eea8c') => { const g = d.cv.getContext('2d'); g.fillStyle = '#020806'; g.fillRect(0, 0, 256, 160); g.fillStyle = col; g.font = '16px Consolas'; lines.forEach((l, i) => g.fillText(l, 10, 26 + i * 22)); d.t.needsUpdate = true; };
    if (Math.floor(this.t * 4) !== this._lastDraw) {
      this._lastDraw = Math.floor(this.t * 4);
      draw(a, ['VEHICLE: ' + (this.opts.rocket === 'vx_heavy' ? 'VX-HEAVY' : 'SATURN V'), `BUS  ${this.step > 0 ? '28.4 V' : '--.- V'}`, `IMU  ${this.step > 1 ? 'ALIGNED' : 'STBY'}`, `CABIN ${this.step > 2 ? '5.0 psi' : '--'}`, `ENG  ${this.step > 4 ? 'ARMED' : 'SAFE'}`]);
      draw(b, ['COUNTDOWN', this.counting !== undefined ? `T-${Math.max(0, Math.ceil(this.counting))}` : 'HOLD', '', 'DEST: ' + (this.game.flight?.dest || '').toUpperCase()], this.counting !== undefined ? '#ffb347' : '#5eea8c');
    }
    this.game.ui.hud && null;
    if (this.counting !== undefined) {
      this.counting -= dt;
      this.game.audio.setLoop('engine', this.counting < 3 ? (3 - this.counting) / 3 * 0.6 : 0, 0.2);
      if (this.counting <= 0 && !this.leaving) { this.leaving = true; this.game.ui.checklist(null); this.game.loadLevel('ascent', { rocket: this.opts.rocket, loadingText: 'Ignition' }); }
    } else this.game.audio.setLoop('cabin', 1);
  }
  dispose() { this.game.ui.checklist(null); this.game.audio.stopAllLoops(); this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
}
