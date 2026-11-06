import { makeAscent, stepAscent, guidancePitch, altitude, orbit, canStage, doStage, ROCKETS, totalMass, speed } from '../src/sim/ascent.js';
for (const type of ['saturn_v', 'vx_heavy']) {
  const A = makeAscent(type); A.engineOn = true;
  const dt = 0.05; let log = [];
  console.log(type, 'liftoff TWR', (ROCKETS[type].stages[0].thrust / (totalMass(A) * 9.81)).toFixed(2));
  while (A.t < 1200) {
    A.pitch = guidancePitch(A);
    stepAscent(A, dt);
    if (A.fuel[A.stage] <= 0 && canStage(A)) { doStage(A); log.push(`stage@${A.t.toFixed(0)}s alt ${(altitude(A)/1000).toFixed(0)}km v ${speed(A).toFixed(0)}`); }
    const o = orbit(A);
    if (o.peri > 150000) { log.push(`ORBIT at t=${A.t.toFixed(0)} alt ${(altitude(A)/1000).toFixed(0)}km apo ${(o.apo/1000).toFixed(0)} peri ${(o.peri/1000).toFixed(0)} fuelLeft ${A.fuel.map(f=>Math.round(f)).join('/')}`); break; }
    if (altitude(A) < -1 || (A.t > 20 && altitude(A) <= 0)) { log.push('crash'); break; }
    if (A.fuel.every(f => f <= 0)) { log.push(`OUT OF FUEL t=${A.t.toFixed(0)} alt ${(altitude(A)/1000).toFixed(0)} apo ${(o.apo/1000).toFixed(0)} peri ${(o.peri/1000).toFixed(0)} v ${speed(A).toFixed(0)}`); break; }
    if (Math.round(A.t / dt) % 600 === 0) log.push(`t ${A.t.toFixed(0)} alt ${(altitude(A)/1000).toFixed(1)}km vr ${A.vr.toFixed(0)} vt ${A.vt.toFixed(0)} pitch ${A.pitch.toFixed(0)} apo ${(o.apo/1000).toFixed(0)} peri ${o.peri ? (o.peri/1000).toFixed(0) : '-'} g ${A.accelG.toFixed(1)}`);
  }
  console.log(log.join('\n'));
}
import { stageDeltaV, DEPARTURE_DV, inOrbit } from '../src/sim/ascent.js';
for (const [type, dest] of [['saturn_v', 'moon'], ['vx_heavy', 'mars']]) {
  const A = makeAscent(type); A.engineOn = true;
  while (A.t < 1500 && !inOrbit(A)) { A.pitch = guidancePitch(A); stepAscent(A, 0.05); if (A.fuel[A.stage] <= 0 && canStage(A)) doStage(A); }
  console.log(type, 'orbit', inOrbit(A), 't', A.t.toFixed(0), 'stage', A.stage, 'dv left', stageDeltaV(A).toFixed(0), 'need', DEPARTURE_DV[dest]);
}
