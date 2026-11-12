import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { launchGround, makeLaunchPlatform, LAUNCH_BOARD } from '../src/world/LaunchPlatform.js';
import { Player } from '../src/player/Player.js';

describe('solid launch platform', () => {
  it('renders the same deck and ramp heights used by collision', () => {
    const platform = makeLaunchPlatform([]); platform.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const [x, z] of [[40, 40], [30, 85], [10, 31.25], [-8, 8], [16, 9]]) {
      ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(platform, true);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].point.y).toBeCloseTo(launchGround.height(x, z), 1);
    }
    expect(launchGround.height(LAUNCH_BOARD.x, LAUNCH_BOARD.z)).toBe(LAUNCH_BOARD.y);
  });

  it('allows the full crew route up both ramps and onto the elevator deck', () => {
    const player = new Player(launchGround, 9.81);
    player.colliders = []; makeLaunchPlatform(player.colliders);
    player.colliders.push({ x: 0, z: 0, r: 7 }, { x: 16, z: 0, r: 5 });
    player.place(30, 105);
    for (const [x, z] of [[30, 55], [10, 55], [10, 10], [16, 9]]) {
      let reached = false;
      for (let frame = 0; frame < 1800; frame++) {
        const dx = x - player.pos.x, dz = z - player.pos.z;
        if (Math.hypot(dx, dz) < 0.15) { reached = true; break; }
        player.update(1 / 60, { x: dx, z: dz }, false, false);
        expect(player.pos.y).toBeGreaterThanOrEqual(launchGround.height(player.pos.x, player.pos.z) - 0.001);
      }
      expect(reached).toBe(true);
    }
    expect(player.pos.y).toBeCloseTo(11);
  });

  it('blocks walking and jumping through vertical platform walls', () => {
    for (const jump of [false, true]) {
      const player = new Player(launchGround, 9.81); player.place(45, 72);
      for (let i = 0; i < 180; i++) player.update(1 / 60, { x: 0, z: -1 }, true, jump);
      expect(player.pos.z).toBeGreaterThan(70);
      expect(player.pos.y).toBeLessThan(1);
      player.place(0, 17);
      for (let i = 0; i < 180; i++) player.update(1 / 60, { x: 0, z: -1 }, true, jump);
      expect(player.pos.z).toBeGreaterThan(15);
      expect(player.pos.y).toBeLessThan(4);
    }
  });
});
