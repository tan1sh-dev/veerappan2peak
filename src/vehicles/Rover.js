import * as THREE from 'three';
import { makeLRV, makeMarsRover } from '../world/Props.js';
import { mergeStatic } from '../world/merge.js';

// Rover driving on the real heightfield. Arcade-style but gravity-aware: lower gravity means less grip and
// more airtime over bumps. Speeds and battery are GAMEPLAY APPROXIMATIONS (the Apollo LRV did ~13 km/h).
export class Rover {
  constructor(ground, g, kind = 'lrv') {
    this.ground = ground; this.g = g; this.kind = kind;
    this.model = kind === 'mars' ? makeMarsRover() : makeLRV();
    for (const w of this.model.userData.wheels) w.userData.keep = true;
    mergeStatic(this.model);
    this.pos = new THREE.Vector3(); this.yaw = 0; this.speed = 0; this.vy = 0;
    this.maxSpeed = kind === 'mars' ? 5.5 : 4.5;   // m/s
    this.battery = 100; this.health = 100;
    this.airborne = false; this.distance = 0;
    this.wheelBase = kind === 'mars' ? 3.0 : 2.3; this.track = kind === 'mars' ? 2.7 : 2.0;
    this.pitch = 0; this.roll = 0;
    this.lastImpact = 0;
  }
  place(x, z, yaw = 0) { this.pos.set(x, this.ground.height(x, z), z); this.yaw = yaw; this.speed = 0; this.vy = 0; this._pose(0); }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  update(dt, throttle, steer, brake) {
    const grip = Math.min(1, 0.35 + this.g / 6);
    if (this.battery <= 0) throttle = 0;
    if (!this.airborne) {
      const accel = (this.kind === 'mars' ? 2.2 : 1.6) * grip;
      if (brake) this.speed *= Math.max(0, 1 - 3 * dt);
      else if (throttle) this.speed += throttle * accel * dt;
      else this.speed *= Math.max(0, 1 - 0.6 * dt);
      // slope assist/resistance from gravity
      const f = this.forward();
      const ahead = this.ground.height(this.pos.x + f.x * 1.5, this.pos.z + f.z * 1.5) - this.ground.height(this.pos.x - f.x * 1.5, this.pos.z - f.z * 1.5);
      this.speed -= (ahead / 3) * this.g * 0.5 * dt;
      this.speed = Math.max(-this.maxSpeed * 0.4, Math.min(this.maxSpeed, this.speed));
      const turnRate = 0.9 * grip * Math.min(1, Math.abs(this.speed) / 1.5 + 0.15);
      this.yaw -= steer * turnRate * dt * Math.sign(this.speed || 1);
    }
    this.battery = Math.max(0, this.battery - (Math.abs(throttle) * 0.055 + 0.005) * dt * 1.0);
    const f = this.forward();
    const nx = this.pos.x + f.x * this.speed * dt, nz = this.pos.z + f.z * this.speed * dt;
    this.distance += Math.abs(this.speed * dt);
    const gh = this.ground.height(nx, nz);
    // vertical: follow ground, or fly off crests in low gravity
    this.lastImpact = 0;
    if (this.airborne) {
      this.vy -= this.g * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gh) { this.lastImpact = -this.vy; this.pos.y = gh; this.airborne = false; this.vy = 0; }
    } else {
      const climb = (gh - this.pos.y) / Math.max(dt, 1e-3);
      if (gh < this.pos.y - 0.05 && this.vyFromGround !== undefined && this.vyFromGround > 0.6 && this.speed > 2.5) {
        // crest: keep upward/forward momentum
        this.airborne = true; this.vy = this.vyFromGround;
      } else this.pos.y = gh;
      this.vyFromGround = climb;
    }
    this.pos.x = nx; this.pos.z = nz;
    if (this.lastImpact > 4) this.health = Math.max(0, this.health - (this.lastImpact - 4) * 8);
    this._pose(dt);
    return Math.abs(this.speed);
  }
  _pose(dt) {
    const f = this.forward(), r = new THREE.Vector3(-f.z, 0, f.x);
    const L = this.wheelBase / 2, W = this.track / 2, gh = (x, z) => this.ground.height(x, z);
    const front = (gh(this.pos.x + f.x * L + r.x * W, this.pos.z + f.z * L + r.z * W) + gh(this.pos.x + f.x * L - r.x * W, this.pos.z + f.z * L - r.z * W)) / 2;
    const back = (gh(this.pos.x - f.x * L + r.x * W, this.pos.z - f.z * L + r.z * W) + gh(this.pos.x - f.x * L - r.x * W, this.pos.z - f.z * L - r.z * W)) / 2;
    const right = (gh(this.pos.x + r.x * W + f.x * L, this.pos.z + r.z * W + f.z * L) + gh(this.pos.x + r.x * W - f.x * L, this.pos.z + r.z * W - f.z * L)) / 2;
    const left = (gh(this.pos.x - r.x * W + f.x * L, this.pos.z - r.z * W + f.z * L) + gh(this.pos.x - r.x * W - f.x * L, this.pos.z - r.z * W - f.z * L)) / 2;
    const tp = Math.atan2(front - back, this.wheelBase), tr = Math.atan2(right - left, this.track);
    const k = dt ? Math.min(1, 8 * dt) : 1;
    if (!this.airborne) { this.pitch += (tp - this.pitch) * k; this.roll += (tr - this.roll) * k; }
    this.model.position.copy(this.pos);
    this.model.rotation.set(0, 0, 0);
    this.model.rotateY(this.yaw); this.model.rotateX(this.pitch); this.model.rotateZ(-this.roll);
    for (const w of this.model.userData.wheels || []) w.children[0].rotation.x += this.speed * (dt || 0) / 0.41;
    // tipping over on steep side slopes damages the rover
    if (Math.abs(this.roll) > 0.6 && Math.abs(this.speed) > 1) this.health = Math.max(0, this.health - 20 * (dt || 0));
  }
}
