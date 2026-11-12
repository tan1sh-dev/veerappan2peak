import * as THREE from 'three';
import { Assets } from '../core/Assets.js';
import { TerrainSite } from '../world/Heightfield.js';
import { TerrainMesh } from '../world/Terrain.js';
import { RockField } from '../world/Rocks.js';
import { makeStarfield, makeGlowSprite, makeDiskSprite, makeGradientSky, dirFromAzEl } from '../world/Sky.js';
import * as P from '../world/Props.js';
import { Player } from '../player/Player.js';
import { CameraRig } from '../player/CameraRig.js';
import { Rover } from '../vehicles/Rover.js';
import { makeSuit, tickSuit, impactDamage } from '../sim/suit.js';
import { makeLander as makeLanderSim, stepLander, twr, LANDER } from '../sim/lander.js';
import { BODIES, SITES, EQUIPMENT, NPCS, MODULES, SAMPLE_TYPES, SOURCES } from '../data/catalog.js';
import { recordScan, collectItem, addSample, recycleAll, buildModule, scanBonus, equipmentById } from '../gameplay/economy.js';
import { getDialogue } from '../gameplay/dialogues.js';
import { missionById } from '../gameplay/missions.js';
import { tag } from '../ui/UI.js';
import { mergeStatic } from '../world/merge.js';
import { makeLaunchSurroundings, makeLunarFieldStation } from '../world/MissionScenery.js';
import { launchGround, makeLaunchPlatform, LAUNCH_BOARD } from '../world/LaunchPlatform.js';

const MODULE_SLOTS = { habitat: [0, 0], solar: [17, 6], comms: [-15, 10], lab: [2, 27], isru: [19, 25], roverbay: [-19, 27], greenhouse: [-2, 44] };
const MOON_PREBUILT = ['habitat', 'solar'];

function placeAt(o, x, y, z) { o.position.set(x, y, z); return o; }

export class SurfaceLevel {
  constructor(game, opts) {
    this.game = game; this.opts = opts; this.site = opts.site;
    this.scene = new THREE.Scene();
    this.camera = game.camera;
    this.interactables = [];
    this.npcModels = {};
    this.mode = 'foot';
    this.suit = makeSuit();
    this.scan = null;
    this.flashlight = false;
    this.lowO2Warned = 0;
    this.timeAcc = 0;
    this.beacons = [];
    this.collectedHere = new Set();
    this.trackIdx = 0;
    this.allowPause = true;
  }

  get state() { return this.game.state; }
  get ui() { return this.game.ui; }
  get audio() { return this.game.audio; }
  get g() { return BODIES[this.site].g; }

  // =====================================================================================
  async load(progress) {
    const cam = this.camera; cam.fov = this.game.settings.fov; cam.near = 0.25; cam.far = 150000; cam.updateProjectionMatrix();
    if (this.site === 'earth') await this.buildEarth(progress);
    else await this.buildPlanet(progress);
    progress(0.9);
    this.player = new Player(this.ground, this.g);
    this.player.onStep = () => this.audio.footstep(this.site);
    this.scene.add(this.player.model);
    this.rig = new CameraRig(this.camera, this.game.input, this.game.settings);
    this.rig.ground = this.ground;
    // flashlight
    this.spot = new THREE.SpotLight(0xfff4e0, 0, 45, 0.45, 0.5, 1.2);
    this.scene.add(this.spot, this.spot.target);
    this.player.colliders = this.colliders;
  }

  start() {
    const ui = this.ui;
    ui.buildHud();
    if (this.opts.landing) this.beginLanding();
    else {
      const sp = this.spawnPoint();
      this.player.place(sp.x, sp.z, sp.yaw || 0);
      this.rig.yaw = sp.yaw || 0;
      this.setMode('foot');
      if (this.site === 'earth') ui.radio('director', 'Launch Control here. The stack is fuelled and holding at T-minus 10 minutes. Commander Rao is waiting by the crew van.');
      else if (this.game.run) ui.radio('mitchell', `${missionById(this.game.run.def.id).name}: you're go for EVA. Check your objectives on the right.`);
      else ui.radio('mitchell', `Free exploration at ${SITES[this.site].name}. Everything is real terrain, so enjoy the walk.`);
    }
    // M3/M6: make sure enough debris exists
    const run = this.game.run;
    if (run && ['m3', 'm6'].includes(run.def.id)) {
      const avail = EQUIPMENT.filter(e => e.site === this.site && e.collectible && !(this.state.flags.recycled || []).includes(e.id) && !this.state.inventory.items.includes(e.id));
      if (avail.length < 4) {
        this.state.flags.recycled = (this.state.flags.recycled || []).filter(id => equipmentById(id)?.site !== this.site);
        this.refreshEquipmentVisibility();
        ui.toast('New debris has been located by orbital survey.', 'info');
      }
    }
  }

  spawnPoint() {
    if (this.site === 'earth') return { x: 40, z: 150, yaw: 0.2 };
    const b = SITES[this.site].base;
    return { x: b.x + 3, z: b.z - 12, yaw: Math.PI };
  }

  // =====================================================================================
  async buildEarth(progress) {
    this.ground = launchGround;
    this.colliders = [];
    const s = this.scene;
    s.add(makeGradientSky('#3d77c4', '#bcd5ea', 60000));
    s.fog = new THREE.Fog(0xbcd5ea, 2000, 30000);
    const sunDir = dirFromAzEl(120, 40);
    this.sunDir = sunDir;
    const sun = new THREE.DirectionalLight(0xfff3e0, 3.2); this.sun = sun; s.add(sun, sun.target);
    s.add(new THREE.HemisphereLight(0xbcd5ea, 0x55603a, 1.2));
    this.setupShadows(sun, 60);
    // ground
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
    g.fillStyle = '#5d6b3a'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${60 + Math.random() * 60},${80 + Math.random() * 50},${30 + Math.random() * 30},0.5)`; g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3); }
    const gt = new THREE.CanvasTexture(cv); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(200, 200); gt.colorSpace = THREE.SRGBColorSpace;
    const groundM = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
    groundM.rotation.x = -Math.PI / 2; groundM.receiveShadow = true; s.add(groundM);
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: 0x2a5d8a, roughness: 0.3, metalness: 0.2 }));
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(22000, 0.05, 0); s.add(ocean);
    // pad + crawlerway
    s.add(makeLaunchPlatform(this.colliders));
    const way = new THREE.Mesh(new THREE.PlaneGeometry(40, 3000), new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 1 })); way.rotation.x = -Math.PI / 2; way.position.set(0, 0.04, 1600); way.receiveShadow = true; s.add(way);
    progress(0.3);
    const tower = mergeStatic(P.makeLaunchTower(118)); tower.position.set(0, 3, 0); s.add(tower);
    // NASA Saturn V model (111 m tall)
    try {
      const rocket = mergeStatic(await Assets.model('models/saturn_v.glb', { height: 110.6 }));
      rocket.position.set(0, 11, 0); s.add(rocket); this.rocketModel = rocket;
    } catch (e) { console.warn(e); }
    progress(0.6);
    this.boardPoint = new THREE.Vector3(LAUNCH_BOARD.x, LAUNCH_BOARD.y, LAUNCH_BOARD.z);
    const elev = P.makeMarkerRing(1.5, 0x4fd1ff); elev.position.copy(this.boardPoint).y += 0.025; s.add(elev);
    // crew van
    s.add(makeLaunchSurroundings(this.colliders));
    this.colliders.push({ x: 34, z: 140, r: 3 }, { x: 0, z: 0, r: 7 }, { x: 16, z: 0, r: 5 });
    // NPC: Commander Rao
    this.addNPC('rao', 30, 136, -2.4);
    this.interactables.push({ id: 'board', kind: 'board', pos: this.boardPoint, radius: 5, label: 'Take the elevator to the crew access arm',
      action: () => this.tryBoard() });
    this.interactables.push({ id: 'director', kind: 'radio', pos: new THREE.Vector3(34, 0, 140), radius: 4, label: 'Radio Launch Control', action: () => this.talk('director') });
    this.stars = null;
  }

  tryBoard() {
    const run = this.game.run;
    if (run && !run.done.has('brief')) { this.ui.toast('Get the flight briefing from Commander Rao first.', 'bad'); return; }
    if (!run) { this.ui.toast('Start a mission from Mission Select to fly.', 'info'); return; }
    this.game.emit('boarded');
    this.game.loadLevel('cockpit', { rocket: this.game.flight.rocket, loadingText: 'Crew access arm · boarding' });
  }

  // =====================================================================================
  async buildPlanet(progress) {
    const cfg = SITES[this.site];
    const s = this.scene;
    const [core, far] = await Promise.all([Assets.heightfield(cfg.core), Assets.heightfield(cfg.far)]);
    progress(0.25);
    this.ground = new TerrainSite(core, far);
    const [coreTex, farTex] = await Promise.all([Assets.texture(cfg.coreTex, { aniso: 8 }), Assets.texture(cfg.farTex)]);
    progress(0.4);
    this.terrain = new TerrainMesh(this.ground, { map: coreTex, farMap: farTex, tint: cfg.tint, colorize: cfg.colorize, contrast: cfg.contrast, settings: this.game.preset ? { ...this.game.preset, quality: this.game.settings.quality } : {} });
    s.add(this.terrain.group);
    this.coreTex = coreTex;
    progress(0.6);

    // sky & light
    this.sunDir = dirFromAzEl(cfg.sun.az, cfg.sun.el);
    if (this.site === 'moon') {
      s.background = new THREE.Color(0x000000);
      this.stars = makeStarfield(this.game.preset.starCount, 40000); s.add(this.stars);
      const sunSp = makeGlowSprite('#fff8e8', 2600, 0.08); sunSp.position.copy(this.sunDir).multiplyScalar(45000); this.sky = new THREE.Group(); this.sky.add(sunSp);
      // Earth seen from Hadley: ~64° above the southern horizon (approximate geometry, libration ignored)
      try { const et = await Assets.texture('textures/earth_blue_marble.jpg'); const e = makeDiskSprite(et, 1500); e.position.copy(dirFromAzEl(188, 63.8)).multiplyScalar(42000); this.sky.add(e); } catch { }
      s.add(this.sky);
      const sun = new THREE.DirectionalLight(0xffffff, 4.2); this.sun = sun; s.add(sun, sun.target);
      s.add(new THREE.HemisphereLight(0x5a6a86, 0x2a2a2a, 0.7)); // fill light (gameplay visibility; real shadows are near-black)
    } else {
      s.add(this.skyDome = makeGradientSky('#b48f6b', '#dcb894', 70000));
      s.fog = new THREE.FogExp2(0xc9a682, 0.000045);
      const sunSp = makeGlowSprite('#fff1dc', 1400, 0.1); sunSp.position.copy(this.sunDir).multiplyScalar(45000); this.sky = new THREE.Group(); this.sky.add(sunSp); s.add(this.sky);
      const sun = new THREE.DirectionalLight(0xffe9d0, 2.8); this.sun = sun; s.add(sun, sun.target);
      s.add(new THREE.HemisphereLight(0xd6b08a, 0x5a3a22, 0.9));
      this.dust = this.makeDust(); s.add(this.dust);
    }
    this.setupShadows(this.sun, 70);

    // data
    this.waypoints = await Assets.json(cfg.waypoints).catch(() => []);
    this.wpWorld = {};
    for (const w of this.waypoints) { const [x, z] = this.ground.toWorld(w.lon, w.lat); this.wpWorld[w.name] = { x, z, w }; }
    this.paths = await Assets.json(cfg.path).catch(() => []);
    if (this.site === 'moon') this.science = await Assets.json('data/moon_a15_science.json').catch(() => null);
    else { this.weather = await Assets.json('data/insight_weather.json').catch(() => null); this.refreshWeather(); }

    this.colliders = [];
    this.buildBase();
    progress(0.7);
    await this.placeEquipment();
    this.placeSamples();
    this.placeTracks();
    progress(0.8);

    // rocks (keep clear of structures)
    const keep = [{ x: cfg.base.x, z: cfg.base.z, r: 55 }, { x: cfg.landing.x, z: cfg.landing.z, r: 14 }];
    for (const it of this.interactables) if (it.kind === 'equip') keep.push({ x: it.pos.x, z: it.pos.z, r: 7 });
    this.rocks = new RockField(this.ground, { count: this.game.preset.rocks, color: this.site === 'moon' ? 0x86847f : 0x8a5a3c, keepOut: keep });
    s.add(this.rocks.group);

    // rover
    this.rover = new Rover(this.ground, this.g, this.site === 'mars' ? 'mars' : 'lrv');
    this.rover.place(cfg.roverSpot.x, cfg.roverSpot.z, 0.4);
    s.add(this.rover.model);
    this.interactables.push({ id: 'rover', kind: 'rover', get pos() { return this._p; }, _p: this.rover.pos, radius: 4.5, label: this.site === 'moon' ? 'Drive the LRV-2 rover' : 'Drive the pressurised rover', action: () => this.enterRover() });

    // our lander (parked unless we are landing right now)
    this.lander = P.makeLander(); this.lander.userData.flame.userData.keep = true; mergeStatic(this.lander); s.add(this.lander);
    const lp = cfg.landing;
    this.lander.position.set(lp.x, this.ground.height(lp.x, lp.z), lp.z);
    this.landerColl = { x: lp.x, z: lp.z, r: 2.4 }; this.colliders.push(this.landerColl);
    this.interactables.push({ id: 'lander', kind: 'refill', get pos() { return this._p; }, _p: this.lander.position, radius: 5, label: 'Refill O2 & power from the lander', action: () => this.refillAt('lander') });

    this.trackMesh = this.makeTrackMesh(); s.add(this.trackMesh);
  }

  setupShadows(sun, size) {
    const p = this.game.preset;
    sun.castShadow = p.shadows;
    if (p.shadows) {
      sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
      const c = sun.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 1; c.far = 900;
      sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
    }
  }
  applyQuality(p) {
    if (this.sun) { this.sun.castShadow = p.shadows; if (p.shadows) { this.sun.shadow.mapSize.set(p.shadowSize, p.shadowSize); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } } }
  }

  makeDust() {
    const n = Math.round(600 * this.game.preset.particles);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 1] = Math.random() * 20; pos[i * 3 + 2] = (Math.random() - 0.5) * 80; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd9b48a, size: 0.08, transparent: true, opacity: 0.55, depthWrite: false }));
    p.frustumCulled = false; return p;
  }

  refreshWeather() {
    this.game.constructor; // keep reference
    import('../core/Bridge.js').then(({ Bridge }) => Bridge.nasaFetch('insight')).then(r => {
      if (!r || !r.ok || !r.data || !r.data.sol_keys) return;
      const w = r.data, sols = w.sol_keys.map(k => ({ sol: +k, firstUTC: w[k].First_UTC, lastUTC: w[k].Last_UTC, season: w[k].Season, airTempC: w[k].AT && { av: w[k].AT.av, mn: w[k].AT.mn, mx: w[k].AT.mx }, pressurePa: w[k].PRE && { av: w[k].PRE.av, mn: w[k].PRE.mn, mx: w[k].PRE.mx }, windMs: w[k].HWS && { av: w[k].HWS.av, mn: w[k].HWS.mn, mx: w[k].HWS.mx } }));
      if (sols.length) this.weather = { location: 'Elysium Planitia (InSight lander, 4.5N 135.6E)', sols, live: true };
    }).catch(() => { });
  }

  // ---------------- base ----------------
  buildBase() {
    const cfg = SITES[this.site], b = cfg.base, s = this.scene;
    this.base = new THREE.Group(); this.base.position.set(b.x, this.ground.height(b.x, b.z), b.z); s.add(this.base);
    const at = (dx, dz) => new THREE.Vector3(b.x + dx, this.ground.height(b.x + dx, b.z + dz), b.z + dz);
    // landing pad ring at the landing site
    const lp = P.makeModule('pad'); lp.position.set(cfg.landing.x, this.ground.height(cfg.landing.x, cfg.landing.z) - 0.05, cfg.landing.z); s.add(lp);
    // build pad
    const bp = P.makeMarkerRing(5, 0xffb347); bp.position.copy(at(0, 15)).add(new THREE.Vector3(0, 0.15, 0)); s.add(bp);
    this.buildPadPos = at(0, 15);
    this.interactables.push({ id: 'buildpad', kind: 'build', pos: this.buildPadPos, radius: 7, label: 'Open construction menu', key: 'B', action: () => this.openBuild() });
    // recycler (game model)
    const rec = new THREE.Group();
    rec.add(placeAt(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 1.8), P.propMaterial('grey')), 0, 0.9, 0));
    rec.add(placeAt(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 1, 10), P.propMaterial('orange')), 0, 2.2, 0));
    rec.add(placeAt(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.05), P.propMaterial('lightOn')), 0.5, 1.3, -0.92));
    rec.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    rec.position.copy(at(-9, -6)); s.add(rec);
    this.colliders.push({ x: rec.position.x, z: rec.position.z, r: 1.6 });
    this.interactables.push({ id: 'recycler', kind: 'recycler', pos: rec.position, radius: 4, label: 'Recycle carried equipment & analyse samples', action: () => this.doRecycle() });
    // modules
    this.moduleObjs = {};
    this.refreshModules();
    // NPCs at base
    const run = this.game.run, mid = run ? run.def.id : null;
    if (this.site === 'moon') {
      s.add(makeLunarFieldStation(this.ground, b, this.colliders));
      this.addNPC('okafor', b.x + 5, b.z - 7, Math.PI);
      this.addNPC('lindqvist', b.x - 6, b.z - 8, Math.PI + 0.6);
      if (mid === 'm1' || !mid) this.addNPC('rao', b.x + 10, b.z - 4, -2.4);
    } else {
      this.addNPC('chen', b.x + 4, b.z - 9, Math.PI);
      if (mid === 'm6' || !mid) { this.addNPC('lindqvist', b.x - 6, b.z - 8, Math.PI + 0.5); this.addNPC('rao', b.x + 9, b.z - 4, -2.4); this.addNPC('okafor', b.x - 2, b.z - 12, 2.8); }
      // cargo lander that delivered the outpost kit (game model)
      const cl = P.makeLander(); cl.userData.flame.userData.keep = true; mergeStatic(cl); cl.scale.setScalar(1.3); cl.position.copy(at(-26, -4)); s.add(cl);
      this.colliders.push({ x: cl.position.x, z: cl.position.z, r: 3 });
      this.interactables.push({ id: 'cargo', kind: 'refill', pos: cl.position, radius: 6, label: 'Refill O2 & power from the cargo lander', action: () => this.refillAt('cargo lander') });
    }
  }
  builtModules() { return [...(this.site === 'moon' ? MOON_PREBUILT : []), ...this.state.station[this.site]]; }
  refreshModules() {
    const b = SITES[this.site].base;
    for (const id of this.builtModules()) {
      if (this.moduleObjs[id]) continue;
      const [dx, dz] = MODULE_SLOTS[id];
      const m = mergeStatic(P.makeModule(id));
      m.position.set(b.x + dx, this.ground.height(b.x + dx, b.z + dz) - 0.1, b.z + dz);
      this.scene.add(m); this.moduleObjs[id] = m;
      const r = { habitat: 5.4, solar: 2, comms: 1.2, lab: 3.3, isru: 2, roverbay: 0.5, greenhouse: 3 }[id];
      if (id === 'solar') { this.colliders.push({ x: m.position.x - 3, z: m.position.z, r: 0.5 }, { x: m.position.x, z: m.position.z, r: 0.5 }, { x: m.position.x + 3, z: m.position.z, r: 0.5 }); }
      else if (id === 'habitat') { for (const ox of [-3, 0, 3]) this.colliders.push({ x: m.position.x + ox, z: m.position.z, r: 2.6 }); }
      else this.colliders.push({ x: m.position.x, z: m.position.z, r });
      if (id === 'habitat') {
        const door = new THREE.Vector3(m.position.x, m.position.y, m.position.z - 3.4);
        this.airlockPos = door;
        this.interactables.push({ id: 'airlock', kind: 'airlock', pos: door, radius: 3.2, label: 'Enter airlock: refill O2 and save', action: () => this.refillAt('habitat', true) });
      }
    }
  }

  // ---------------- NPCs ----------------
  addNPC(id, x, z, yaw = 0) {
    const npc = NPCS[id];
    const m = P.makeAstronaut({ accent: npc.accent || 'blue' });
    m.position.set(x, this.ground.height(x, z), z); m.rotation.y = yaw;
    // name tag
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48; const g = cv.getContext('2d');
    g.fillStyle = 'rgba(5,10,20,.7)'; g.fillRect(0, 0, 256, 48); g.strokeStyle = '#4fd1ff'; g.strokeRect(1, 1, 254, 46);
    g.fillStyle = '#fff'; g.font = 'bold 20px Consolas'; g.textAlign = 'center'; g.fillText(npc.name.split(' ').slice(-1)[0].toUpperCase(), 128, 22);
    g.fillStyle = '#8fd8ff'; g.font = '14px Consolas'; g.fillText(npc.role, 128, 40);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true })); sp.scale.set(1.6, 0.3, 1); sp.position.y = 2.25; m.add(sp);
    this.scene.add(m);
    this.npcModels[id] = m;
    this.colliders?.push({ x, z, r: 0.45 });
    this.interactables.push({ id: 'npc:' + id, kind: 'npc', npc: id, pos: m.position, radius: 3.2, label: `Talk to ${npc.name}`, action: () => this.talk(id) });
  }
  talk(id) {
    const run = this.game.run;
    const ctx = {
      mission: run ? run.def.id : null, done: oid => !!(run && run.done.has(oid)), flag: f => this.state.flags[f], state: this.state, site: this.site,
      statusText: `Suit O2 ${Math.round(this.suit.o2)}%, power ${Math.round(this.suit.power)}%. ${run ? 'Next: ' + (run.active()[0]?.text || 'wrap up') : 'No active mission.'}`,
    };
    const tree = getDialogue(id, ctx);
    const m = this.npcModels[id];
    if (m) m.lookAt(this.player.pos.x, m.position.y, this.player.pos.z);
    this.game.input.unlock();
    this.ui.dialogue(tree, eff => {
      if (eff.flag) this.state.flags[eff.flag] = true;
      if (eff.event) this.game.emit(eff.event);
      if (eff.research) this.state.research += eff.research;
    });
  }

  // ---------------- equipment ----------------
  async placeEquipment() {
    const list = EQUIPMENT.filter(e => e.site === this.site);
    this.equipObjs = {};
    for (const e of list) {
      let x, z;
      if (e.placement === 'trek') { const w = this.wpWorld[e.waypoint]; if (!w) continue; x = w.x; z = w.z; }
      else if (e.placement === 'approx') { const w = this.wpWorld[e.near]; if (!w) continue; x = w.x + e.offset[0]; z = w.z + e.offset[1]; }
      else { const b = SITES[this.site].base; x = e.at[0]; z = e.at[1]; }
      const y = this.ground.height(x, z);
      const obj = mergeStatic(await this.makeEquipModel(e.model));
      obj.position.set(x, y, z);
      obj.rotation.y = (e.id.length * 1.37) % (Math.PI * 2);
      this.scene.add(obj);
      this.equipObjs[e.id] = obj;
      const r = { lm_descent: 4.6, lrv_old: 1.8, alsep: 1.2, skycrane: 2.5, backshell: 2.2, heatshield: 2.3 }[e.model] || 1.1;
      if (e.model !== 'marker') this.colliders.push({ x, z, r, id: e.id });
      this.interactables.push({
        id: 'equip:' + e.id, kind: 'equip', equip: e, pos: new THREE.Vector3(x, y, z), radius: r + 4,
        get label() { return e.collectible ? `Collect ${e.name}` : `Inspect ${e.name}`; },
        action: () => this.interactEquip(e), scannable: true,
      });
    }
    this.refreshEquipmentVisibility();
  }
  refreshEquipmentVisibility() {
    for (const [id, obj] of Object.entries(this.equipObjs || {})) {
      const gone = this.state.inventory.items.includes(id) || (this.state.flags.recycled || []).includes(id) || this.collectedHere.has(id);
      obj.visible = !gone;
      const it = this.interactables.find(i => i.id === 'equip:' + id); if (it) it.disabled = gone;
      const c = this.colliders.find(c => c.id === id); if (c) c.r = gone ? 0 : c.r;
    }
  }
  async makeEquipModel(kind) {
    if (kind.startsWith('glb:')) {
      const [, name, h] = kind.split(':');
      try { return await Assets.model(`models/${name}.glb`, { height: parseFloat(h) }); } catch { return P.makeInstrumentBox(); }
    }
    switch (kind) {
      case 'lm_descent': {
        try {
          const lm = await Assets.model('models/apollo_lm.glb', { height: 7.0 });
          // Only the descent stage stays on the Moon: hide parts of the model above ~3.3 m (the ascent stage left in 1971).
          lm.updateMatrixWorld(true);
          const box = new THREE.Box3();
          lm.traverse(o => { if (o.isMesh) { box.setFromObject(o); const c = box.getCenter(new THREE.Vector3()); if (c.y > 3.3) o.visible = false; } });
          return lm;
        } catch { return P.makeLanderLeg(); }
      }
      case 'lrv_old': return P.makeLRV({ dusty: true });
      case 'alsep': return P.makeALSEP();
      case 'lrrr': return P.makeRetroreflector();
      case 'solar_broken': return P.makeBrokenSolarArray();
      case 'dish': return P.makeCommsDish();
      case 'pallet': return P.makeCargoPallet();
      case 'tank': return P.makeFuelTank();
      case 'arm': return P.makeRoboticArm();
      case 'instrument': return P.makeInstrumentBox();
      case 'leg': return P.makeLanderLeg();
      case 'mast': return P.makeAntennaMast();
      case 'skycrane': return P.makeDescentStageWreck();
      case 'backshell': return P.makeBackshell();
      case 'heatshield': return P.makeHeatShield();
      case 'ingenuity': try { return await Assets.model('models/ingenuity.glb', { height: 0.49 * 1.0 + 0.3 }); } catch { return P.makeInstrumentBox(); }
      case 'marker': { const g = P.makeBeacon(0xffb347, 25); g.add(P.makeMarkerRing(3, 0xffb347)); return g; }
      default: return P.makeInstrumentBox();
    }
  }

  equipCard(e, extraActions = []) {
    const scanned = this.state.discoveries.includes(e.id);
    const w = e.waypoint ? this.wpWorld[e.waypoint]?.w : e.near ? this.wpWorld[e.near]?.w : null;
    const [lon, lat] = this.ground.toLonLat(this.equipObjs[e.id].position.x, this.equipObjs[e.id].position.z);
    const pk = e.placement === 'trek' ? ['nasa', 'Coordinates from NASA Trek ' + (this.site === 'moon' ? 'Apollo15_waypoints' : 'curiosity_waypoints')] : e.placement === 'approx' ? ['approx', e.note || 'Approximate position'] : ['fiction', 'Fictional object and position'];
    return {
      kicker: e.exhibit ? 'Exhibit · NASA 3D model (display placement is fictional)' : e.heritage ? 'Heritage hardware · real mission object' : 'Discarded equipment · fictional ' + (this.site === 'moon' ? 'Pathfinder-H programme' : 'supply programme'),
      title: e.name, tagKind: e.heritage || e.exhibit ? 'nasa' : 'fiction', tagTitle: e.exhibit ? 'Real NASA 3D model and facts' : e.heritage ? 'Real NASA mission hardware' : 'Invented for the game',
      subtitle: `${lat.toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${lon.toFixed(4)}°E · ${scanned ? 'Scanned' : 'Not yet scanned'}`,
      rows: [
        ['Position', e.placement === 'trek' ? 'Real coordinates' : e.placement === 'approx' ? 'Approximate placement' : 'Game placement', pk[0], pk[1]],
        ['Scientific purpose', e.purpose, e.exhibit ? 'nasa' : null, e.exhibit ? 'NASA mission facts; model from science.nasa.gov/3d-resources' : null],
        ['Condition', e.condition, e.heritage ? 'approx' : 'fiction', 'Condition is a reasoned estimate'],
        ['Possible reuse', e.reuse],
        ['Environmental impact', e.impact],
        ...(e.yields ? [['Recovery yield', Object.entries(e.yields).map(([k, v]) => `${v} ${k}`).join(', '), 'approx', 'Recycling yields are gameplay values']] : []),
        ['Research value', `${e.research} RP`],
      ],
      quote: w && w.description && e.placement !== 'game' ? { text: w.description.slice(0, 420) + (w.description.length > 420 ? '…' : ''), source: w.descriptionSource || SOURCES.trek } : null,
      actions: extraActions,
    };
  }
  async interactEquip(e) {
    const scanned = this.state.discoveries.includes(e.id);
    if (e.collectible && scanned) {
      const r = collectItem(this.state, e.id);
      if (r.ok) { this.collectedHere.add(e.id); this.refreshEquipmentVisibility(); this.audio.pickup(); this.ui.toast(`Recovered: ${e.name}`, 'good'); this.game.emit('collect'); }
      else this.ui.toast(r.reason, 'bad');
      return;
    }
    if (!scanned) { this.ui.toast(e.heritage ? 'Hold Q to scan it first.' : 'Hold Q to scan it before handling.', 'info'); return; }
    await this.ui.scanCard(this.equipCard(e));
  }

  // ---------------- samples ----------------
  placeSamples() {
    const defs = this.site === 'moon'
      ? [['9A', 'mare_basalt'], ['9', 'vesicular_basalt'], ['10', 'mare_basalt'], ['1', 'mare_basalt'], ['2', 'anorthosite'], ['Elbow Crater', 'vesicular_basalt'], ['3', 'regolith'], ['4', 'mare_basalt'], ['__base', 'regolith']]
      : [['The Rocknest', 'dune_sand'], ['Glenelg', 'mudstone'], ['Bradbury Landing', 'conglomerate'], ['Darwin Outcrop', 'conglomerate'], ['__base', 'dune_sand'], ['__base2', 'mudstone']];
    const geo = new THREE.DodecahedronGeometry(0.22, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.8, emissive: 0x2aa8d8, emissiveIntensity: 0.6 });
    this.sampleObjs = [];
    let k = 0;
    for (const [where, type] of defs) {
      let c;
      if (where.startsWith('__base')) { const b = SITES[this.site].base; c = { x: b.x + (where === '__base' ? 30 : -34), z: b.z + (where === '__base' ? -26 : 30) }; }
      else c = this.wpWorld[where];
      if (!c) continue;
      for (let i = 0; i < 3; i++) {
        const a = (k * 2.39996) % (Math.PI * 2), r = 6 + (k % 4) * 3; k++;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        const m = new THREE.Mesh(geo, mat); m.position.set(x, this.ground.height(x, z) + 0.12, z); m.castShadow = true;
        this.scene.add(m);
        const label = where.startsWith('__') ? 'near ' + SITES[this.site].base.name : (/^\d/.test(where) ? 'Apollo 15 Station ' + where : where);
        const it = { id: 'sample:' + this.sampleObjs.length, kind: 'sample', pos: m.position, radius: 2.4, label: `Collect sample (${SAMPLE_TYPES[type].name})`, action: () => this.takeSample(it, type, label, m) };
        this.interactables.push(it); this.sampleObjs.push(m);
      }
    }
  }
  takeSample(it, type, where, mesh) {
    const r = addSample(this.state, type, where);
    if (!r.ok) { this.ui.toast(r.reason, 'bad'); return; }
    it.disabled = true; mesh.visible = false; this.audio.pickup();
    const t = r.sample;
    this.ui.toast(`Sample bagged: ${t.name}`, 'good');
    this.game.emit('sample');
    this.ui.scanCard({
      kicker: 'Sample analysis (field)', title: t.name, tagKind: 'approx', tagTitle: 'Your sample is a game find; the reference sample below is real',
      subtitle: `Collected ${where}`,
      rows: [['Comparable sample', t.reference.id, t.reference.data, t.reference.source], ['Reference facts', t.reference.facts], ['Research value', `${t.research} RP when analysed at a base`]],
      footer: 'Return samples to a base recycler/lab to analyse them for research points.',
    });
  }

  // ---------------- real traverse paths as ground tracks ----------------
  placeTracks() {
    if (!this.paths || !this.paths.length) return;
    const mat = new THREE.MeshBasicMaterial({ color: this.site === 'moon' ? 0x2a2a2a : 0x6a4026, transparent: true, opacity: this.site === 'moon' ? 0.35 : 0.0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    if (this.site === 'mars') return; // Curiosity's tracks have been erased by wind; we show the path only on the map
    for (const p of this.paths) {
      const pts = p.points.map(([lon, lat]) => this.ground.toWorld(lon, lat)).filter(([x, z]) => this.ground.inCore(x, z, 40));
      if (pts.length < 2) continue;
      const pos = [], idx = [];
      for (let i = 0; i < pts.length; i++) {
        const [x, z] = pts[i], [x2, z2] = pts[Math.min(i + 1, pts.length - 1)], [x0, z0] = pts[Math.max(i - 1, 0)];
        let dx = x2 - x0, dz = z2 - z0; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const nx = -dz * 1.0, nz = dx * 1.0;
        pos.push(x + nx, this.ground.height(x + nx, z + nz) + 0.05, z + nz, x - nx, this.ground.height(x - nx, z - nz) + 0.05, z - nz);
        if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      this.scene.add(new THREE.Mesh(g, mat));
    }
  }
  makeTrackMesh() {
    const N = 800;
    const geo = new THREE.PlaneGeometry(0.35, 0.5); geo.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: this.site === 'moon' ? 0x3a3a3a : 0x5b331d, transparent: true, opacity: 0.55, depthWrite: false }), N);
    m.count = 0; m.frustumCulled = false; m.userData.n = N; return m;
  }
  dropTrack(x, z, yaw) {
    const m = this.trackMesh, o = new THREE.Object3D();
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(this.rover.track / 2 * 0.9);
    for (const s of [-1, 1]) {
      const px = x + r.x * s, pz = z + r.z * s;
      o.position.set(px, this.ground.height(px, pz) + 0.04, pz); o.rotation.set(0, yaw, 0); o.updateMatrix();
      m.setMatrixAt(this.trackIdx % m.userData.n, o.matrix); this.trackIdx++;
    }
    m.count = Math.min(m.userData.n, this.trackIdx); m.instanceMatrix.needsUpdate = true;
  }

  // ---------------- actions ----------------
  refillAt(where, save = false) {
    this.suit.o2 = 100; this.suit.power = 100; if (where === 'habitat') this.suit.integrity = 100;
    this.audio.beep();
    this.ui.toast(`O2 and power refilled at the ${where}`, 'good');
    if (where === 'habitat') this.game.emit('reach:airlock');
    if (save) { this.game.save().then(() => this.ui.toast('Game saved', 'info')); }
  }
  doRecycle() {
    const st = this.state;
    if (!st.inventory.items.length && !st.inventory.samples.length) { this.ui.toast('Nothing to recycle. Collect scanned debris or samples first.', 'info'); return; }
    const hadItems = st.inventory.items.length > 0;
    const res = recycleAll(st, this.builtModules().includes('lab'));
    this.audio.build();
    const g = Object.entries(res.gained).map(([k, v]) => `+${v} ${k}`).join(', ');
    this.ui.toast(`Recycled: ${g}${res.research ? ` · +${res.research} RP from samples` : ''}`, 'good', 5000);
    if (hadItems) this.game.emit('recycle');
    this.game.save();
  }
  openBuild() {
    this.ui.buildMenu(this.state, this.site, id => {
      const r = buildModule(this.state, this.site, id);
      if (r.ok) { this.refreshModules(); this.audio.build(); this.ui.toast(`${MODULES[id].name} constructed`, 'good'); this.game.emit('build:' + id); this.game.save(); }
      return r;
    });
  }
  enterRover() {
    if (this.rover.health <= 0) { this.ui.toast('The rover is wrecked.', 'bad'); return; }
    this.setMode('rover'); this.game.emit('enterRover');
  }
  exitRover() {
    const f = this.rover.forward(), r = new THREE.Vector3(-f.z, 0, f.x);
    const x = this.rover.pos.x + r.x * 2.2, z = this.rover.pos.z + r.z * 2.2;
    this.player.place(x, z, this.rover.yaw); this.setMode('foot');
  }
  setMode(m) {
    this.mode = m;
    this.player.model.visible = m === 'foot';
    this.rig.vehicle = m === 'rover' ? { distance: 9, height: 2.4 } : m === 'lander' ? { distance: 22, height: 3 } : null;
    if (m === 'rover') { this.rig.targetDistance = 9; this.rig.yaw = this.rover.yaw; if (!this.rig.locksPointer) this.game.input.unlock(); }
    if (m === 'foot') { this.rig.targetDistance = 6; this.audio.setLoop('rover', 0); this.audio.setLoop('engine', 0); }
    this.rig.first = true;
  }

  // ---------------- scanning ----------------
  scanTarget() {
    const camDir = new THREE.Vector3(); this.camera.getWorldDirection(camDir);
    const origin = this.mode === 'foot' ? this.player.pos : this.rover.pos;
    let best = null, bestScore = 0;
    for (const it of this.interactables) {
      if (!it.scannable || it.disabled) continue;
      const to = new THREE.Vector3().subVectors(it.pos, this.camera.position); const d = to.length();
      const dp = Math.hypot(it.pos.x - origin.x, it.pos.z - origin.z);
      if (dp > 35) continue;
      to.normalize(); const dot = to.dot(camDir);
      if (dot < 0.93 && dp > 4) continue;
      const score = dot - dp / 200;
      if (score > bestScore) { bestScore = score; best = it; }
    }
    return best;
  }
  async finishScan(target) {
    this.audio.scanDone();
    if (target) {
      const e = target.equip;
      const gained = recordScan(this.state, e.id, scanBonus(this.state, this.site));
      if (gained) this.ui.toast(`Discovery logged: +${gained} RP`, 'good');
      this.game.emit('scan:' + e.id);
      if (!e.heritage && !e.exhibit && gained) this.game.emit('scanDebris');
      if (e.heritage && !this.state.flags.heritageMsg) { this.state.flags.heritageMsg = true; this.game.emit('heritage'); }
      const actions = e.collectible ? [{ id: 'collect', label: 'Collect (E)' }] : [];
      const a = await this.ui.scanCard(this.equipCard(e, actions));
      if (a === 'collect') this.interactEquip(e);
      return;
    }
    // ground scan: real site science
    this.game.emit('scanGround');
    const [lon, lat] = this.ground.toLonLat(this.player.pos.x, this.player.pos.z);
    const elev = this.ground.originElevation + this.ground.height(this.player.pos.x, this.player.pos.z);
    const slope = this.ground.slope(this.player.pos.x, this.player.pos.z);
    const rows = [
      ['Location', `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${lon.toFixed(4)}°E`, 'nasa', 'Computed from the Trek DEM georeference'],
      ['Elevation', `${elev.toFixed(0)} m relative to the ${this.site === 'moon' ? '1737.4 km lunar' : '3389.5 km Mars'} reference sphere`, 'nasa', SITES[this.site].terrainData],
      ['Local slope', `${slope.toFixed(1)}°`, 'nasa', 'Derived from the DEM'],
      ['Gravity', `${this.g} m/s²`, 'nasa', SOURCES.factsheet],
    ];
    if (this.site === 'moon' && this.science) {
      const v = this.science.values;
      const pct = x => (x <= 1 ? x * 100 : x).toFixed(1);
      if (v.feo?.value != null) rows.push(['FeO (iron oxide)', `${v.feo.value.toFixed(1)} wt%`, 'nasa', SOURCES.kaguya]);
      if (v.plagioclase?.value != null) rows.push(['Plagioclase', `${pct(v.plagioclase.value)} %`, 'nasa', SOURCES.kaguya]);
      if (v.clinopyroxene?.value != null) rows.push(['Clinopyroxene', `${pct(v.clinopyroxene.value)} %`, 'nasa', SOURCES.kaguya]);
      if (v.olivine?.value != null) rows.push(['Olivine', `${pct(v.olivine.value)} %`, 'nasa', SOURCES.kaguya]);
      if (v.thorium?.value != null) rows.push(['Thorium', `${v.thorium.value.toFixed(1)} ppm`, 'nasa', SOURCES.lp]);
      rows.push(['Note', 'Orbital values at the Apollo 15 LM site (one reading for the area, ~km-scale pixels).', 'nasa', this.science.values.feo?.source]);
      rows.push(['Surface temperature', BODIES.moon.surfaceTemp, 'nasa', SOURCES.factsheet]);
    } else if (this.site === 'mars' && this.weather && this.weather.sols?.length) {
      const s = this.weather.sols[this.weather.sols.length - 1];
      rows.push(['Weather source', `NASA InSight, ${this.weather.location} · Sol ${s.sol} (${(s.firstUTC || '').slice(0, 10)})${this.weather.live ? ' · live API' : ' · cached'}`, 'nasa', SOURCES.insight]);
      if (s.airTempC) rows.push(['Air temperature', `avg ${s.airTempC.av.toFixed(1)} °C (min ${s.airTempC.mn.toFixed(1)}, max ${s.airTempC.mx.toFixed(1)})`, 'nasa', SOURCES.insight]);
      if (s.pressurePa) rows.push(['Pressure', `avg ${s.pressurePa.av.toFixed(0)} Pa (about 0.7% of Earth's)`, 'nasa', SOURCES.insight]);
      if (s.windMs) rows.push(['Wind', `avg ${s.windMs.av.toFixed(1)} m/s (max ${s.windMs.mx.toFixed(1)})`, 'nasa', SOURCES.insight]);
      rows.push(['Caveat', 'InSight measured ~600 km from Gale Crater. These are real Mars readings, used here as a stand-in for local weather.', 'approx', 'Location substitution']);
      rows.push(['Atmosphere', BODIES.mars.atmosphere, 'nasa', SOURCES.factsheet]);
    }
    this.ui.scanCard({ kicker: 'Scanner · site survey', title: SITES[this.site].name, tagKind: 'nasa', tagTitle: 'Real NASA data', subtitle: SITES[this.site].subtitle, rows });
  }

  // ---------------- landing (Moon) / EDL (Mars) ----------------
  beginLanding() {
    const cfg = SITES[this.site];
    const t = cfg.landing;
    this.setMode('lander');
    this.player.model.visible = false;
    const mars = this.site === 'mars';
    this.landerSim = makeLanderSim({
      pos: { x: t.x + (mars ? -900 : -260), y: this.ground.height(t.x, t.z) + (mars ? 8500 : 1400), z: t.z + (mars ? 500 : 180) },
      vel: { x: mars ? 70 : 12, y: mars ? -420 : -28, z: mars ? -35 : -4 },
    });
    this.landerThrust = mars ? 90000 : LANDER.maxThrust;
    this.edl = mars ? { phase: 'ballistic', windowOpen: false } : null;
    this.landerColl.r = 0;
    this.throttle = 0.6;
    this.ui.radio(...(mars ? ['mitchell', 'Entry interface passed. Heat shield is taking the load. Stand by for the parachute window.'] : ['mitchell', 'Veerappan, you are GO for powered descent. Hold Space to fire, mouse wheel or Shift/Ctrl to throttle, WASD to steer with the thrusters.']));
    this.landingPad = P.makeBeacon(0x5eea8c, 400); this.landingPad.position.set(t.x, this.ground.height(t.x, t.z), t.z); this.scene.add(this.landingPad);
    if (mars) { this.chute = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 6, 0, Math.PI * 2, 0, 1.1), new THREE.MeshStandardMaterial({ color: 0xf0e6d0, side: THREE.DoubleSide, roughness: 0.9 })); this.chute.visible = false; this.scene.add(this.chute); }
    this.allowPause = true;
  }
  updateLander(dt) {
    const inp = this.game.input, L = this.landerSim;
    const mars = this.site === 'mars';
    let drag = 0, powered = true;
    if (this.edl) {
      const E = this.edl, agl = L.pos.y - this.ground.height(L.pos.x, L.pos.z), sp = Math.hypot(L.vel.x, L.vel.y, L.vel.z);
      if (E.phase === 'ballistic') {
        drag = 0.035; powered = false;
        E.windowOpen = sp < 380 && agl > 2500;
        if (E.windowOpen && !E.announced) { E.announced = true; this.game.emit('chuteWindow'); }
        if (inp.wasPressed('Space')) {
          if (sp >= 380) { this.ui.toast('Too fast! The parachute would shred. Wait for the green light.', 'bad'); this.audio.alarm(); }
          else if (agl > 2500) { E.phase = 'chute'; this.chute.visible = true; this.audio.separation(); this.game.emit('chute'); }
        }
        if (agl <= 2500 && E.phase === 'ballistic') { this.crash('Parachute window missed: too low to slow down.'); return; }
      } else if (E.phase === 'chute') {
        drag = 0.12; powered = false;
        if (agl < 1800) { E.phase = 'powered'; this.chute.visible = false; this.audio.separation(); this.ui.toast('Backshell separation: powered descent!', 'info'); }
      } else drag = 0.008;
      this.timeScale = E.phase === 'chute' ? 3 : 1;
    }
    if (powered) {
      if (inp.mouse.wheel) this.throttle = Math.max(0.1, Math.min(1, this.throttle - inp.mouse.wheel * 0.08));
      if (inp.isDown('ShiftLeft')) this.throttle = Math.min(1, this.throttle + dt * 0.8);
      if (inp.isDown('ControlLeft')) this.throttle = Math.max(0.1, this.throttle - dt * 0.8);
    }
    const rb = this.rig.basis();
    const ix = inp.axis('KeyA', 'KeyD'), iz = inp.axis('KeyS', 'KeyW');
    const rx = powered ? rb.r.x * ix + rb.f.x * iz : 0, rz = powered ? rb.r.z * ix + rb.f.z * iz : 0;
    const fire = powered && inp.isDown('Space');
    const steps = this.timeScale || 1;
    const save = LANDER.maxThrust; LANDER.maxThrust = this.landerThrust;
    for (let i = 0; i < steps; i++) stepLander(L, { throttle: this.throttle, fire, rx, rz }, { g: this.g, groundHeight: (x, z) => this.ground.height(x, z), slope: (x, z) => this.ground.slope(x, z), drag }, dt);
    const t = twr(L, this.g);
    LANDER.maxThrust = save;
    this.lander.position.set(L.pos.x, L.pos.y, L.pos.z);
    this.lander.rotation.set(L.vel.z * 0.01 * (fire ? 1 : 0.3), 0, -L.vel.x * 0.01 * (fire ? 1 : 0.3));
    if (this.chute && this.chute.visible) this.chute.position.set(L.pos.x, L.pos.y + 28, L.pos.z);
    const fl = this.lander.userData.flame; fl.visible = L.firing; fl.scale.set(1, 0.5 + this.throttle * (0.8 + Math.random() * 0.3), 1);
    this.audio.setLoop('engine', L.firing ? 0.4 + this.throttle * 0.6 : 0, this.throttle);
    this.audio.setLoop('rcs', (ix || iz) && powered ? 1 : 0);
    if (this.edl && this.edl.phase !== 'powered') this.audio.setLoop('wind', 1);
    this.rig.update(dt, this.lander.position, {});
    const agl = L.pos.y - this.ground.height(L.pos.x, L.pos.z);
    const cfg = SITES[this.site], dx = cfg.landing.x - L.pos.x, dz = cfg.landing.z - L.pos.z;
    const dist = Math.hypot(dx, dz);
    const bearing = ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
    const vs = -L.vel.y, hs = Math.hypot(L.vel.x, L.vel.z);
    const ok = (c) => c ? '<span class="light on"></span>' : '<span class="light warn"></span>';
    let phase = '';
    if (this.edl) phase = { ballistic: this.edl.windowOpen ? '<span class="light on"></span>PARACHUTE WINDOW: PRESS SPACE' : '<span class="light bad"></span>ENTRY: wait for speed &lt; 380 m/s', chute: '<span class="light on"></span>UNDER PARACHUTE (×3 time)', powered: 'POWERED DESCENT' }[this.edl.phase];
    this.ui.hud({
      showBars: false, fps: this.game.settings.showFps ? this.game.fps : 0,
      vehicle: `<div class="k">${this.site === 'mars' ? 'MARS EDL' : 'LUNAR DESCENT'} ${tag('approx', 'Lander engine/mass are gameplay approximations; gravity is real').outerHTML}</div>
        ${phase ? `<div style="margin:4px 0">${phase}</div>` : ''}
        <div class="k">ALTITUDE (AGL)</div><div class="big">${agl.toFixed(0)} m</div>
        <div>${ok(vs <= 3 || agl > 60)} V-speed <b>${vs.toFixed(1)} m/s</b> ${vs > 0 ? '↓' : '↑'}</div>
        <div>${ok(hs <= 1.5 || agl > 60)} H-speed <b>${hs.toFixed(1)} m/s</b></div>
        <div>Fuel <b>${(L.fuel / LANDER.fuelMass * 100).toFixed(0)}%</b> · Throttle <b>${Math.round(this.throttle * 100)}%</b> · TWR ${t.toFixed(2)}</div>
        <div class="gauge ${L.fuel < 600 ? 'amber' : ''}"><div style="width:${L.fuel / LANDER.fuelMass * 100}%"></div></div>
        <div>Pad: <b>${dist.toFixed(0)} m</b> bearing ${bearing.toFixed(0)}° · g = ${this.g} m/s² ${tag('nasa', SOURCES.factsheet).outerHTML}</div>
        <div class="k" style="margin-top:4px">SPACE fire · WHEEL/Shift/Ctrl throttle · WASD translate</div>`,
    });
    this.ui.compass(this.rig.yaw, [{ bearing, color: '#5eea8c', label: 'Landing pad' }]);
    if (L.landed) this.onTouchdown(true);
    else if (L.crashed) this.crash(`Hard landing: ${L.touchdown.vSpeed.toFixed(1)} m/s vertical, ${L.touchdown.hSpeed.toFixed(1)} m/s horizontal, slope ${L.touchdown.slope.toFixed(0)}°.`);
    else if (L.fuel <= 0 && agl > 5 && vs > 6) { /* falling without fuel: let physics decide */ }
  }
  onTouchdown() {
    const L = this.landerSim;
    this.audio.setLoop('engine', 0); this.audio.setLoop('rcs', 0); this.audio.setLoop('wind', 0); this.audio.land();
    this.game.emit('landed');
    this.game.emit('landed:' + this.site);
    this.state.stats.landings++;
    this.state.flags.flownTo = { ...(this.state.flags.flownTo || {}), [this.site]: true };
    const run = this.game.run;
    if (run && run.def.grantOnLanding) { for (const [k, v] of Object.entries(run.def.grantOnLanding)) this.state.inventory.materials[k] += v; this.ui.toast('Outpost kit unloaded: materials added to storage', 'good'); }
    this.ui.toast(`Touchdown at ${L.touchdown.vSpeed.toFixed(1)} m/s. Good landing!`, 'good', 5000);
    if (this.landingPad) { this.scene.remove(this.landingPad); this.landingPad = null; }
    this.landerColl.x = L.pos.x; this.landerColl.z = L.pos.z; this.landerColl.r = 2.4;
    const near = EQUIPMENT.filter(e => e.heritage && e.site === this.site).map(e => this.equipObjs[e.id]).filter(Boolean).some(o => Math.hypot(o.position.x - L.pos.x, o.position.z - L.pos.z) < 200);
    if (near) this.ui.radio('mitchell', 'Note: you landed within 200 m of historic hardware. Exhaust can sandblast heritage sites, so we\'ll log that.');
    const off = new THREE.Vector3(3.2, 0, 2);
    this.player.place(L.pos.x + off.x, L.pos.z + off.z, Math.PI);
    this.setMode('foot');
    this.edl = null; this.timeScale = 1;
    if (this.site === 'moon' && run && run.def.id === 'm1') setTimeout(() => this.ui.radio('mitchell', 'Veerappan, Houston. Press R when you\'re ready to report.'), 2500);
  }
  crash(reason) {
    if (this._crashed) return; this._crashed = true;
    this.audio.setLoop('engine', 0); this.audio.setLoop('rcs', 0); this.audio.setLoop('wind', 0);
    this.audio.alarm(); this.game.emit('crashed');
    this.lander.rotation.z = 1.2;
    if (this.game.run) this.game.run.fail(reason);
    else { this.ui.toast(reason, 'bad', 6000); setTimeout(() => this.game.mainMenu(), 3000); }
  }

  // =====================================================================================
  onKey(code) {
    if (this.mode === 'lander') return;
    if (code === 'KeyV' && this.mode === 'foot') { const m = this.rig.toggleView(); this.ui.toast(m === 'first' ? 'First-person view' : 'Third-person view', 'info', 1200); }
    if ((code === 'ShiftTap' || code === 'ControlLeft' || code === 'ControlRight') && this.mode === 'foot') {
      if (this.rig.mode === 'first') { if (code !== 'ShiftTap') this.ui.toast('Shift lock works in third-person view (press V)', 'info', 1500); }
      else { const on = this.rig.toggleShiftLock(); this.ui.toast(on ? 'Shift lock ON: move the mouse to turn the camera and your astronaut' : 'Shift lock OFF: right-drag to orbit', 'info', 1800); if (on) this.game.input.lock(); else this.game.input.unlock(); }
    }
    if (code === 'KeyF') { this.flashlight = !this.flashlight; this.audio.switchFlip(); }
    if (code === 'KeyE') {
      if (this.mode === 'rover') { this.exitRover(); return; }
      if (this.focus) this.focus.action();
    }
    if (code === 'KeyR') this.talk(this.site === 'earth' ? 'director' : 'mitchell');
    if (code === 'Tab') this.ui.inventory(this.state, this.site === 'earth' ? 'moon' : this.site);
    if (code === 'KeyM' && this.site !== 'earth') this.openMap();
    if (code === 'KeyB' && this.site !== 'earth') {
      if (this.buildPadPos && Math.hypot(this.player.pos.x - this.buildPadPos.x, this.player.pos.z - this.buildPadPos.z) < 30) this.openBuild();
      else this.ui.toast('Go to the build pad at the base (orange ring) to build.', 'info');
    }
    if (code === 'KeyJ') this.missionLog();
  }
  missionLog() {
    const run = this.game.run;
    if (!run) { this.ui.toast('Free exploration: no active mission', 'info'); return; }
    const d = run.def;
    this.ui.scanCard({ kicker: 'Mission log', title: d.name, subtitle: d.summary, rows: d.objectives.map(o => [run.done.has(o.id) ? '✔ done' : run.isActive(o) ? '▶ active' : '· locked', o.text + (o.optional ? ' (optional)' : '')]) });
  }
  openMap() {
    const cfg = SITES[this.site];
    const img = new Image(); img.src = './assets/' + cfg.coreTex;
    const markers = [];
    markers.push({ x: cfg.base.x, z: cfg.base.z, color: '#5eea8c', label: cfg.base.name, kind: 'base', kindLabel: 'Base (fictional)', r: 7 });
    for (const [name, p] of Object.entries(this.wpWorld)) if (this.ground.inCore(p.x, p.z, 0)) markers.push({ x: p.x, z: p.z, color: '#ffb347', label: /^\d/.test(name) ? 'Station ' + name : name, kind: 'wp', kindLabel: (this.site === 'moon' ? 'Apollo 15 waypoint' : 'Curiosity waypoint') + ' (NASA Trek)' });
    for (const e of EQUIPMENT.filter(e => e.site === this.site)) {
      const o = this.equipObjs[e.id]; if (!o || !o.visible) continue;
      const scanned = this.state.discoveries.includes(e.id);
      markers.push({ x: o.position.x, z: o.position.z, color: e.heritage ? '#4fd1ff' : scanned ? '#d4a8ff' : '#8a7aa0', label: scanned || e.heritage ? e.name.replace(/ \(.*\)/, '').slice(0, 28) : '?', kind: e.heritage ? 'her' : 'deb', kindLabel: e.heritage ? 'Real mission hardware' : 'Debris (fictional)' });
    }
    markers.push({ x: this.lander.position.x, z: this.lander.position.z, color: '#fff', label: 'Lander', kind: 'lander', kindLabel: 'Your lander' });
    markers.push({ x: this.rover.pos.x, z: this.rover.pos.z, color: '#ff8c5a', label: 'Rover', kind: 'rover', kindLabel: 'Rover' });
    const paths = this.paths.map(p => ({ points: p.points.map(([lon, lat]) => this.ground.toWorld(lon, lat)), color: this.site === 'moon' ? '#ffd166' : '#ff6b6b', label: this.site === 'moon' ? 'Apollo 15 EVA traverses (NASA Trek)' : 'Curiosity traverse (NASA Trek)', dash: [6, 4] }));
    const pos = this.mode === 'rover' ? this.rover.pos : this.player.pos;
    this.ui.map({ image: img, site: this.ground, player: { x: pos.x, z: pos.z, yaw: this.mode === 'rover' ? this.rover.yaw : this.player.yaw }, markers, paths: paths.slice(0, 6),
      title: cfg.name, subtitle: cfg.subtitle, credit: 'Base map: ' + (this.site === 'moon' ? 'LRO LROC NAC mosaic (NASA/GSFC/ASU) via Moon Trek' : 'MRO HiRISE mosaic (NASA/JPL/UArizona) via Mars Trek') });
  }

  // ---------------- targets / objectives ----------------
  resolveTarget(t) {
    if (!t) return null;
    const cfg = SITES[this.site] || {};
    if (t === 'base' && cfg.base) return { x: cfg.base.x, z: cfg.base.z, r: 40 };
    if (t === 'board' && this.boardPoint) return { x: this.boardPoint.x, z: this.boardPoint.z, r: 5 };
    if (t === 'rover' && this.rover) return { x: this.rover.pos.x, z: this.rover.pos.z, r: 4 };
    if (t === 'recycler') { const it = this.interactables.find(i => i.id === 'recycler'); return it && { x: it.pos.x, z: it.pos.z, r: 4 }; }
    if (t === 'airlock') return this.airlockPos ? { x: this.airlockPos.x, z: this.airlockPos.z, r: 3.5 } : null;
    if (t === 'buildpad') return this.buildPadPos ? { x: this.buildPadPos.x, z: this.buildPadPos.z, r: 7 } : null;
    if (t.startsWith('npc:')) { const m = this.npcModels[t.slice(4)]; return m ? { x: m.position.x, z: m.position.z, r: 3 } : null; }
    if (t.startsWith('wp:')) { const w = this.wpWorld?.[t.slice(3)]; return w ? { x: w.x, z: w.z, r: 30 } : null; }
    if (t.startsWith('equip:')) { const o = this.equipObjs?.[t.slice(6)]; return o ? { x: o.position.x, z: o.position.z, r: 6 } : null; }
    return null;
  }
  updateObjectives(pos) {
    const run = this.game.run;
    const markers = [], dists = {};
    if (run) {
      for (const o of run.active()) {
        const t = this.resolveTarget(o.target);
        if (!t) continue;
        const dx = t.x - pos.x, dz = t.z - pos.z, d = Math.hypot(dx, dz);
        dists[o.id] = d;
        markers.push({ bearing: ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360, color: o.optional ? '#b9c7d6' : '#4fd1ff', label: o.text, t, o });
        // reach events
        if (o.event.startsWith('reach:') && d < t.r && o.event !== 'reach:airlock') this.game.emit(o.event);
      }
    }
    if (this.site !== 'earth' && SITES[this.site]) {
      const b = SITES[this.site].base; const dx = b.x - pos.x, dz = b.z - pos.z;
      markers.push({ bearing: ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360, color: '#5eea8c', label: b.name });
    }
    // world beacons for up to 3 active targets
    const want = markers.filter(m => m.t).slice(0, 3);
    while (this.beacons.length < want.length) { const bcn = P.makeBeacon(0x4fd1ff, 60); this.scene.add(bcn); this.beacons.push(bcn); }
    this.beacons.forEach((bcn, i) => {
      const m = want[i]; bcn.visible = !!m;
      if (m) bcn.position.set(m.t.x, this.ground.height(m.t.x, m.t.z), m.t.z);
    });
    return { markers, dists };
  }

  // =====================================================================================
  update(dt) {
    const inp = this.game.input;
    this.timeAcc += dt;
    if (this.mode === 'lander') { this.updateLander(dt); this.updateEnv(dt, this.lander.position); return; }

    let pos;
    const locks = this.rig.locksPointer;
    inp.wantLock = locks && !this.ui.isModal;
    if (this.mode === 'rover') {
      const R = this.rover;
      const thr = inp.axis('KeyS', 'KeyW'), st = inp.axis('KeyA', 'KeyD');
      const sp = R.update(dt, thr, st, inp.isDown('Space'));
      if (sp > 0.5 && !R.airborne) { this._trackAcc = (this._trackAcc || 0) + sp * dt; if (this._trackAcc > 0.5) { this._trackAcc = 0; this.dropTrack(R.pos.x, R.pos.z, R.yaw); } }
      this.state.stats.distanceDriven += sp * dt;
      this.audio.setLoop('rover', thr ? 0.8 : sp > 0.2 ? 0.4 : 0.1, sp / R.maxSpeed);
      // auto-follow camera behind the rover unless the player is orbiting
      if (!inp.mouse.right) { let d = R.yaw - this.rig.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.rig.yaw += d * Math.min(1, 2.5 * dt); }
      this.rig.update(dt, R.pos);
      pos = R.pos;
      if (R.lastImpact > 4) this.ui.toast(`Hard bump! Rover integrity ${Math.round(R.health)}%`, 'bad', 1500);
      if (R.health <= 0 && !this._roverDead) {
        this._roverDead = true; this.exitRover(); this.audio.alarm();
        if (this.game.run && this.game.run.def.id === 'm4') this.game.run.fail('The rover was wrecked on rough terrain.');
        else this.ui.toast('Rover wrecked! Walk back to base.', 'bad', 5000);
      }
      const nearBase = Math.hypot(R.pos.x - SITES[this.site].base.x, R.pos.z - SITES[this.site].base.z) < 40;
      if (nearBase) R.battery = Math.min(100, R.battery + dt * (this.builtModules().includes('roverbay') ? 4 : 1.5));
      // inside the rover the suit is connected to rover life support
      tickSuit(this.suit, dt, { refill: true });
      this.ui.hud({
        showBars: false, fps: this.game.settings.showFps ? this.game.fps : 0,
        vehicle: `<div class="k">${this.site === 'moon' ? 'LRV-2 ROVER (game model)' : 'PRESSURISED ROVER (game model)'}</div><div class="big">${(sp * 3.6).toFixed(1)} km/h</div>
          <div>Battery <b>${R.battery.toFixed(0)}%</b> ${nearBase ? '· charging' : ''} ${tag('approx').outerHTML}</div><div class="gauge ${R.battery < 25 ? 'amber' : ''}"><div style="width:${R.battery}%"></div></div>
          <div>Integrity <b>${R.health.toFixed(0)}%</b> · ${R.airborne ? '<span style="color:var(--amber)">AIRBORNE</span>' : 'grounded'}</div>
          <div class="k">W/S throttle · A/D steer · SPACE brake · E exit · M map</div>`,
        prompt: null, crosshair: false, lockHint: false,
      });
    } else {
      // on foot
      const P_ = this.player;
      const { f, r } = this.rig.basis();
      const mx = inp.axis('KeyA', 'KeyD'), mz = inp.axis('KeyS', 'KeyW');
      const move = { x: f.x * mz + r.x * mx, z: f.z * mz + r.z * mx };
      const sprint = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
      P_.update(dt, move, sprint && (mx || mz), inp.wasPressed('Space'), this.rig.characterYaw());
      this.rig.update(dt, P_.pos);
      pos = P_.pos;
      this.state.stats.distanceWalked += Math.hypot(move.x, move.z) ? dt * 2 : 0;
      if (P_.lastImpact) {
        const dmg = impactDamage(this.suit, P_.lastImpact, this.site);
        if (dmg > 0) { this.audio.land(); this.ui.toast(`Hard landing! Suit integrity -${Math.round(dmg)}%`, 'bad', 1800); }
      }
      // suit consumables (Earth: on the ground, no drain)
      if (this.site !== 'earth') {
        const scanning = !!this.scan;
        tickSuit(this.suit, dt, { sprint: sprint && (mx || mz), flashlight: this.flashlight, scanning });
        if (this.suit.o2 < 25 && this.lowO2Warned < 1) { this.lowO2Warned = 1; this.game.emit('lowO2'); }
        if (this.suit.o2 < 10 && this.lowO2Warned < 2) { this.lowO2Warned = 2; this.game.emit('critO2'); this.audio.alarm(); }
        if (this.suit.o2 > 40) this.lowO2Warned = 0;
        if (this.suit.o2 <= 0 || this.suit.integrity <= 0) this.suitFailure();
        this.audio.setLoop('suit', 1, sprint ? 1 : 0);
      } else this.audio.setLoop('earthAmb', 1);
      if (this.site === 'mars') this.audio.setLoop('wind', 0.7);
      // focus interactable
      this.focus = null;
      let best = 1e9;
      for (const it of this.interactables) {
        if (it.disabled) continue;
        const d = Math.hypot(it.pos.x - pos.x, it.pos.z - pos.z);
        if (d > it.radius || Math.abs((it.pos.y || 0) - pos.y) > 6) continue;
        const to = new THREE.Vector3(it.pos.x - pos.x, 0, it.pos.z - pos.z).normalize();
        const facing = new THREE.Vector3(-Math.sin(this.rig.yaw), 0, -Math.cos(this.rig.yaw));
        const score = d - to.dot(facing) * 2;
        if (score < best) { best = score; this.focus = it; }
      }
      // scanner
      let scanHud = null;
      if (inp.isDown('KeyQ') && this.site !== 'earth') {
        const tgt = this.scanTarget();
        const key = tgt ? tgt.id : 'ground';
        if (!this.scan || this.scan.key !== key) this.scan = { key, t: 0, target: tgt, need: tgt ? tgt.equip.scanTime : 2 };
        this.scan.t += dt;
        if (Math.random() < 0.3) this.audio.scanTick();
        scanHud = { label: tgt ? `SCANNING · ${tgt.equip.name}` : 'SCANNING · ground / site survey', p: Math.min(1, this.scan.t / this.scan.need) };
        if (this.scan.t >= this.scan.need) { const s = this.scan; this.scan = null; this.finishScan(s.target); }
      } else this.scan = null;
      if (this.suit.power <= 0) { this.flashlight = false; }
      const lockHint = locks && !inp.locked;
      const status = this.site === 'earth' ? `<b>Kennedy Space Center</b> · Launch complex (game model)` :
        `<b>${SITES[this.site].name}</b><br>${this.rig.mode === 'first' ? 'FIRST PERSON' : 'THIRD PERSON'}${this.rig.shiftLock ? ' · <span style="color:var(--cyan)">SHIFT LOCK</span>' : ''}${this.flashlight ? ' · LIGHT' : ''}<br>g = ${this.g} m/s² ${tag('nasa', SOURCES.factsheet).outerHTML}`;
      this.ui.hud({
        suit: this.suit, showBars: this.site !== 'earth',
        prompt: this.focus ? `<kbd>${this.focus.key || 'E'}</kbd> ${this.focus.label}` : null,
        status, fps: this.game.settings.showFps ? this.game.fps : 0,
        crosshair: this.rig.mode === 'first' || this.rig.shiftLock, lockHint, scan: scanHud,
      });
    }
    // flashlight follows the camera
    const helmet = this.mode === 'foot' ? this.player.pos : this.rover.pos;
    this.spot.intensity = this.flashlight && this.mode === 'foot' ? 60 : 0;
    if (this.flashlight) {
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      this.spot.position.set(helmet.x, helmet.y + 1.6, helmet.z); this.spot.target.position.copy(this.spot.position).addScaledVector(dir, 10);
    }
    // NPC idle sway
    for (const m of Object.values(this.npcModels)) { const r = m.userData.rig; if (r) { r.body.rotation.z = Math.sin(this.timeAcc * 0.8 + m.position.x) * 0.03; r.head.rotation.y = Math.sin(this.timeAcc * 0.5 + m.position.z) * 0.3; } }
    for (const s of this.sampleObjs || []) s.rotation.y += dt * 0.6;
    const { markers, dists } = this.updateObjectives(pos);
    this.ui.compass(this.rig.yaw, markers);
    this.ui.objectives(this.game.run, dists);
    this.updateEnv(dt, pos);
  }

  updateEnv(dt, pos) {
    if (this.terrain) this.terrain.update(this.camera.position);
    if (this.rocks) this.rocks.update(pos);
    if (this.stars) this.stars.position.copy(this.camera.position);
    if (this.sky) this.sky.position.copy(this.camera.position);
    if (this.skyDome) this.skyDome.position.copy(this.camera.position);
    if (this.dust) {
      this.dust.position.set(pos.x, pos.y, pos.z);
      const a = this.dust.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) { let x = a.getX(i) + dt * 1.2, y = a.getY(i) - dt * 0.15; if (x > 40) x -= 80; if (y < 0) y += 20; a.setX(i, x); a.setY(i, y); }
      a.needsUpdate = true;
    }
    if (this.sun) {
      this.sun.position.set(pos.x, pos.y, pos.z).addScaledVector(this.sunDir, 400);
      this.sun.target.position.set(pos.x, pos.y, pos.z);
    }
  }

  suitFailure() {
    if (this._suitFailed) return; this._suitFailed = true;
    const reason = this.suit.o2 <= 0 ? 'Your suit ran out of oxygen.' : 'Suit integrity failed after too many hard impacts.';
    if (this.game.run) this.game.run.fail(reason);
    else {
      this.ui.toast(reason + ' Emergency recovery to base.', 'bad', 5000);
      const sp = this.spawnPoint(); this.player.place(sp.x, sp.z); this.suit.o2 = 100; this.suit.integrity = 100; this._suitFailed = false;
    }
  }

  dispose() {
    this.audio.stopAllLoops();
    if (this.terrain) this.terrain.dispose();
    this.scene.traverse(o => { if (o.geometry && !o.geometry.disposed) o.geometry.dispose(); });
    this.scene.clear();
  }
}
