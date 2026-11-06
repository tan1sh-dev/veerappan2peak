import * as THREE from 'three';

// Third/first person camera with a Roblox-style "shift lock":
//  - Third person, shift lock OFF: free cursor, hold right mouse to orbit, character turns toward movement.
//  - Third person, shift lock ON (Left Ctrl): cursor locked, mouse turns the camera, the character always faces
//    where the camera looks, camera sits over the right shoulder.
//  - First person (V): cursor locked, mouse look.
export class CameraRig {
  constructor(camera, input, settings) {
    this.camera = camera; this.input = input; this.settings = settings;
    this.yaw = 0; this.pitch = -0.25;
    this.distance = 7; this.targetDistance = 7;
    this.mode = settings.cameraMode === 'first' ? 'first' : 'third';
    this.shiftLock = false;
    this.ground = null;
    this.eyeHeight = 1.62;
    this.shoulder = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.first = true;
    this.vehicle = null; // when set: {distance, height}
  }
  get locksPointer() { return this.mode === 'first' || this.shiftLock || !!(this.vehicle && this.vehicle.lockMouse); }
  toggleShiftLock() { if (this.mode === 'third') this.shiftLock = !this.shiftLock; return this.shiftLock; }
  toggleView() { this.mode = this.mode === 'third' ? 'first' : 'third'; return this.mode; }
  /** Yaw the character should face, or null when it should turn toward movement. */
  characterYaw() { return (this.mode === 'first' || this.shiftLock) ? this.yaw : null; }
  /** Forward/right vectors on the ground plane for movement input. */
  basis() {
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return { f, r };
  }
  update(dt, targetPos, opts = {}) {
    const inp = this.input, sens = 0.0024 * (this.settings.mouseSensitivity || 1);
    const rotating = this.locksPointer ? inp.locked : inp.mouse.right;
    if (rotating) {
      this.yaw -= inp.mouse.dx * sens;
      this.pitch -= inp.mouse.dy * sens * (this.settings.invertY ? -1 : 1);
    }
    const minP = this.mode === 'first' ? -1.45 : -1.2, maxP = this.mode === 'first' ? 1.45 : 0.6;
    this.pitch = Math.max(minP, Math.min(maxP, this.pitch));
    if (inp.mouse.wheel && this.mode === 'third' && !opts.noZoom) this.targetDistance = Math.max(2.5, Math.min(this.vehicle ? 40 : 16, this.targetDistance + inp.mouse.wheel * 0.9));
    this.distance += (this.targetDistance - this.distance) * Math.min(1, 8 * dt);

    const cam = this.camera;
    if (this.first) { this.smoothTarget.copy(targetPos); this.first = false; }
    this.smoothTarget.lerp(targetPos, Math.min(1, 20 * dt));
    const t = this.smoothTarget;
    if (this.mode === 'first' && !this.vehicle) {
      cam.position.set(t.x, t.y + this.eyeHeight, t.z);
      const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      cam.lookAt(cam.position.clone().add(dir));
      return;
    }
    const height = this.vehicle ? this.vehicle.height : 1.5;
    const focus = new THREE.Vector3(t.x, t.y + height, t.z);
    if (this.shiftLock && !this.vehicle) {
      const { r } = this.basis();
      focus.addScaledVector(r, 0.9);
    }
    const dist = this.vehicle ? Math.max(this.vehicle.distance, this.distance) : this.distance;
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(dist);
    const pos = focus.clone().add(off);
    if (this.ground) {
      const gh = this.ground.height(pos.x, pos.z) + 0.5;
      if (pos.y < gh) pos.y = gh;
    }
    cam.position.copy(pos);
    cam.lookAt(focus);
  }
}
