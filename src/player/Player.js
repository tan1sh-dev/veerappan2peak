import * as THREE from 'three';
import { makeAstronaut, animateAstronaut } from '../world/Props.js';

// Kinematic astronaut controller on the real heightfield. Uses the body's real surface gravity,
// so the same jump impulse gives ~2 m hops on the Moon, ~0.9 m on Mars and ~0.35 m on Earth.
export class Player {
  constructor(ground, g) {
    this.ground = ground;           // { height(x,z), slope(x,z) }
    this.g = g;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;                   // facing (radians, 0 = facing -z / north)
    this.onGround = true;
    this.model = makeAstronaut({ accent: 'red' });
    this.colliders = [];            // [{x,z,r}]
    this.walkSpeed = g < 2 ? 2.2 : g < 5 ? 2.6 : 3.0;
    this.sprintSpeed = g < 2 ? 4.6 : g < 5 ? 5.2 : 6.0;
    this.jumpV = 2.7;
    this.lastImpact = 0;
    this.distance = 0;
    this.stepAcc = 0;
    this.onStep = null;
  }
  place(x, z, yaw = 0) {
    this.pos.set(x, this.ground.height(x, z), z); this.vel.set(0, 0, 0); this.yaw = yaw; this.onGround = true;
    this.model.position.copy(this.pos); this.model.rotation.y = yaw;
  }
  /**
   * move: {x, z} desired direction in world space (unit or zero), sprint, jump; faceYaw: optional forced yaw (shift lock / first person)
   */
  update(dt, move, sprint, jump, faceYaw = null) {
    const lowG = this.g < 5;
    const maxV = sprint ? this.sprintSpeed : this.walkSpeed;
    const len = Math.hypot(move.x, move.z);
    const target = new THREE.Vector3(len ? move.x / len * maxV : 0, 0, len ? move.z / len * maxV : 0);
    // traction: lower gravity -> less grip -> slower speed changes (floaty)
    const traction = this.onGround ? (lowG ? 3.0 + this.g : 10) : 0.6;
    this.vel.x += (target.x - this.vel.x) * Math.min(1, traction * dt);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, traction * dt);

    if (jump && this.onGround) { this.vel.y = this.jumpV; this.onGround = false; }
    this.vel.y -= this.g * dt;

    const previousX = this.pos.x, previousZ = this.pos.z;
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    // slope limit: block moving uphill onto very steep ground
    const hNow = this.ground.height(this.pos.x, this.pos.z), hNext = this.ground.height(nx, nz);
    const step = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    const blockedSurface = this.ground.canMove && !this.ground.canMove(this.pos.x, this.pos.z, nx, nz, this.pos.y);
    if (blockedSurface || (this.onGround && step > 1e-4 && (hNext - hNow) / step > Math.tan(38 * Math.PI / 180))) {
      this.vel.x *= -0.2; this.vel.z *= -0.2;
    } else { this.distance += step; this.pos.x = nx; this.pos.z = nz; }
    // structure colliders
    for (const c of this.colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z, d = Math.hypot(dx, dz), r = c.r + 0.35;
      if (d < r && d > 1e-4 && (c.h === undefined || this.pos.y < c.y + c.h)) { this.pos.x = c.x + dx / d * r; this.pos.z = c.z + dz / d * r; }
    }
    // A nearby prop must not push the player through a raised surface's side wall.
    if (this.ground.canMove && !this.ground.canMove(previousX, previousZ, this.pos.x, this.pos.z, this.pos.y)) {
      this.pos.x = previousX; this.pos.z = previousZ;
      this.vel.x = 0; this.vel.z = 0;
    }
    this.pos.y += this.vel.y * dt;
    const gh = this.ground.height(this.pos.x, this.pos.z);
    this.lastImpact = 0;
    if (this.pos.y <= gh) {
      if (!this.onGround) this.lastImpact = -this.vel.y;
      this.pos.y = gh; this.vel.y = 0; this.onGround = true;
    } else if (this.onGround && this.pos.y - gh < 0.35 && this.vel.y <= 0) {
      this.pos.y = gh; this.vel.y = 0; // stick to ground when walking downhill
    } else this.onGround = false;

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (faceYaw !== null) this.yaw = faceYaw;
    else if (hs > 0.3) {
      const want = Math.atan2(-this.vel.x, -this.vel.z);
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, 10 * dt);
    }
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.yaw;
    animateAstronaut(this.model, dt, hs, !this.onGround, lowG);
    if (this.onGround && hs > 0.5) {
      this.stepAcc += hs * dt;
      const stride = lowG ? 1.6 : 1.1;
      if (this.stepAcc > stride) { this.stepAcc = 0; if (this.onStep) this.onStep(); }
    }
    return hs;
  }
}
