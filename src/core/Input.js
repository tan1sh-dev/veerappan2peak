// Keyboard + mouse input with pointer lock, edge-triggered keys and mouse deltas.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, left: false, right: false, leftPressed: false, rightPressed: false, x: 0, y: 0 };
    this.locked = false;
    this.enabled = true;     // false while a UI screen captures input
    this.wantLock = false;   // gameplay wants pointer lock (shift lock / first person)
    this.listeners = [];

    addEventListener('keydown', e => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (['Tab', 'Space', 'ControlLeft', 'ControlRight', 'AltLeft', 'F1', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      // Shift tap detection: a quick Shift press with no other key involved = 'ShiftTap' (toggles shift lock);
      // holding Shift while moving stays a sprint.
      const isShift = e.code === 'ShiftLeft' || e.code === 'ShiftRight';
      if (isShift && !e.repeat) {
        this.shiftDownAt = performance.now();
        this.shiftUsed = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(k => this.down.has(k));
      } else if (!isShift) this.shiftUsed = true;
      this.down.add(e.code);
      if (!e.repeat) for (const fn of this.listeners) fn(e.code, e);
    });
    addEventListener('keyup', e => {
      this.down.delete(e.code);
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !this.shiftUsed && performance.now() - (this.shiftDownAt || 0) < 300) {
        for (const fn of this.listeners) fn('ShiftTap', e);
      }
    });
    addEventListener('blur', () => { this.down.clear(); this.mouse.left = this.mouse.right = false; });
    addEventListener('mousemove', e => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.locked || this.mouse.right) { this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0; }
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
      if (this.wantLock && !this.locked && this.enabled) this.lock();
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('wheel', e => { if (this.enabled) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.canvas; });
  }
  onKey(fn) { this.listeners.push(fn); }
  lock() { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch { /* not allowed yet */ } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  isDown(code) { return this.enabled && this.down.has(code); }
  wasPressed(code) { return this.enabled && this.pressed.has(code); }
  axis(neg, pos) { return (this.isDown(pos) ? 1 : 0) - (this.isDown(neg) ? 1 : 0); }
  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0;
    this.mouse.leftPressed = this.mouse.rightPressed = false;
  }
}
