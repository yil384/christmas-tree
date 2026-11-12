import type { RideBurst } from '../rideTypes';
import { FINALE_DURATION } from '../rideSequenceConfig';
import {
  clamp, CONSTELLATION_EDGES, CONSTELLATION_POINTS, FIREWORK_SCORE,
  GARDEN_LIGHTS, smooth, unit,
} from './finaleScore';
import type { FireworkCue } from './finaleScore';

const SOURCE_WIDTH = 941;
const SOURCE_HEIGHT = 1672;
const ASPECT = SOURCE_WIDTH / SOURCE_HEIGHT;
const CAMERA_Z = 28;
const HALF_TANGENT = Math.tan(22 * Math.PI / 180);
const TAU = Math.PI * 2;
const MAX_SPARKS = 768;
const COLORS = ['#f5c77d', '#f4bcd4', '#c8defa', '#d9c3f0'];
const RGB = [[245, 199, 125], [244, 188, 212], [200, 222, 250], [217, 195, 240]];
type Vec = { x: number; y: number; z: number };
type Projected = { x: number; y: number; scale: number };
type ShellParticle = { x: number; y: number; z: number; speed: number; pixels: number; ivory: boolean };
type Shell = { cue: FireworkCue; particles: ShellParticle[]; life: number };
type Lantern = { id: number; born: number; life: number; depth: number; phase: number; scale: number; x: number; y: number; speed: number };
type Reflection = { x: number; strength: number; color: number };

function source(out: Vec, x: number, y: number, z = 0) {
  const half = (CAMERA_Z - z) * HALF_TANGENT;
  out.x = (x * 2 - 1) * half * ASPECT;
  out.y = (1 - y * 2) * half;
  out.z = z;
  return out;
}
function makeShell(cue: FireworkCue): Shell {
  const particles: ShellParticle[] = [];
  for (let i = 0; i < cue.count; i++) {
    const seed = cue.seed * 17 + i * 13;
    const sy = 1 - 2 * (i + .5) / cue.count;
    const radius = Math.sqrt(Math.max(0, 1 - sy * sy));
    const angle = i * 2.3999632297 + unit(cue.seed) * TAU;
    let x = Math.cos(angle) * radius;
    let y = sy;
    let z = Math.sin(angle) * radius;
    if (cue.shape === 'ring') {
      const theta = i / cue.count * TAU;
      x = Math.cos(theta); y = Math.sin(theta) * .84; z = Math.sin(theta) * .27;
    } else if (cue.shape === 'palm') {
      const theta = Math.floor(i / (cue.count / 9)) / 9 * TAU + (unit(seed) - .5) * .12;
      x = Math.cos(theta); y = Math.sin(theta) * .78 + .1; z = (unit(seed + 1) - .5) * .55;
    } else if (cue.shape === 'willow') y = sy * .65 + .27;
    particles.push({ x, y, z, speed: cue.size / 1.55 * (.76 + unit(seed + 2) * .32),
      pixels: 1.05 + unit(seed + 3) * .65, ivory: i % 9 === 0 });
  }
  return { cue, particles, life: cue.shape === 'willow' ? 4.9 : cue.shape === 'palm' ? 4.1 : 3.8 };
}

/** Projected, individually shaded objects; no resampling or movement of the plate. */
export function makeCanvasFinale(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  let width = 1; let height = 1; let cover = 1;
  let effectClock = 0;
  let sparkBudget = MAX_SPARKS;
  const point: Vec = { x: 0, y: 0, z: 0 };
  const start: Vec = { x: 0, y: 0, z: 0 };
  const end: Vec = { x: 0, y: 0, z: 0 };
  const projected: Projected = { x: 0, y: 0, scale: 1 };
  const projectedTail: Projected = { x: 0, y: 0, scale: 1 };
  const shells = FIREWORK_SCORE.map(makeShell);
  const extraShells: Array<{ shell: Shell; born: number }> = [];
  const wands: Array<{ x: number; y: number; born: number; seed: number }> = [];
  const reflections: Reflection[] = [];
  const lanterns: Lantern[] = Array.from({ length: 48 }, (_, i) => {
    const seed = i * 7 + 31;
    return { id: i, born: 15 + i * .32 + unit(seed) * .45,
      life: 22 + unit(seed + 1) * 5,
      depth: i < 20 ? -12 - unit(seed + 2) * 4 : i < 40 ? -5 + unit(seed + 2) * 3 : 1 + unit(seed + 2) * 3,
      phase: unit(seed + 5) * TAU,
      scale: ((i >= 40 ? 1.18 : .7) + unit(seed + 7) * .28) * 1.15,
      x: .16 + unit(seed + 3) * .68, y: .752 + unit(seed + 4) * .014,
      speed: .68 + unit(seed + 6) * .18 };
  }).sort((a, b) => a.depth - b.depth);

  const sprites = RGB.map(rgb => {
    const image = document.createElement('canvas'); image.width = 64; image.height = 64;
    const c = image.getContext('2d');
    if (c) {
      const gradient = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,244,209,.92)');
      gradient.addColorStop(.1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.78)`);
      gradient.addColorStop(.32, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.22)`);
      gradient.addColorStop(.68, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.045)`);
      gradient.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      c.fillStyle = gradient; c.fillRect(0, 0, 64, 64);
    }
    return image;
  });
  const screen = (x: number, y: number) => ({
    x: width / 2 + (x - .5) * SOURCE_WIDTH * cover,
    y: height / 2 + (y - .5) * SOURCE_HEIGHT * cover,
  });
  const project = (out: Projected, p: Vec) => {
    out.scale = SOURCE_HEIGHT * cover / (2 * HALF_TANGENT * (CAMERA_Z - p.z));
    out.x = width / 2 + p.x * out.scale;
    out.y = height / 2 - p.y * out.scale;
    return out;
  };
  const glow = (x: number, y: number, radius: number, color: number, alpha: number) => {
    if (alpha < .001 || radius <= 0) return;
    context.globalAlpha = alpha;
    context.drawImage(sprites[color % sprites.length], x - radius, y - radius, radius * 2, radius * 2);
  };
  const star = (x: number, y: number, size: number, alpha: number, color = 0) => {
    glow(x, y, size * 3, color, alpha * .65);
    context.globalAlpha = alpha; context.fillStyle = color === 2 ? '#e4efff' : '#fff0c9';
    context.beginPath(); context.moveTo(x, y - size); context.quadraticCurveTo(x + size * .2, y - size * .2, x + size, y);
    context.quadraticCurveTo(x + size * .2, y + size * .2, x, y + size);
    context.quadraticCurveTo(x - size * .2, y + size * .2, x - size, y);
    context.quadraticCurveTo(x - size * .2, y - size * .2, x, y - size); context.fill();
  };
  const reflection = (x: number, strength: number, color: number) => {
    if (strength <= .001) return;
    reflections.push({ x, strength, color });
  };

  const drawWater = (time: number, reduced: boolean) => {
    const top = screen(0, .711).y; const bottom = screen(0, .881).y;
    context.save(); context.beginPath(); context.rect(0, top, width, bottom - top); context.clip();
    const awake = smooth(1, 13, time);
    const fixed = [.113, .273, .46, .548, .73, .886].map(x => ({ x, strength: awake * .25, color: 0 }));
    context.globalCompositeOperation = 'screen';
    for (const column of [...fixed, ...reflections.slice(0, 6)]) {
      const x = screen(column.x, .8).x;
      context.strokeStyle = COLORS[column.color];
      for (let row = 0; row < 31; row++) {
        const p = row / 30;
        const y = top + (bottom - top) * p;
        const phase = row * 1.74 + column.x * 12;
        const shimmer = reduced ? .55 : .5 + .5 * Math.sin(time * .8 + phase);
        const jitter = (reduced ? Math.sin(phase) : Math.sin(time * .34 + phase)) * (3 + p * 15);
        const length = (3 + p * 17) * (.35 + unit(row + column.x * 100) * .9);
        context.globalAlpha = column.strength * (.1 + .17 * shimmer) * Math.sin(p * Math.PI);
        context.lineWidth = .6 + p * .55;
        context.beginPath(); context.moveTo(x + jitter - length, y); context.lineTo(x + jitter + length, y); context.stroke();
      }
    }
    for (let i = 0; i < 10; i++) {
      const born = 2.5 + i * .85;
      const alpha = smooth(born, born + 1.8, time) * (1 - smooth(13, 18, time));
      const p = screen(.3 + i / 9 * .4, .792 + Math.sin(i * .8) * .018);
      star(p.x, p.y, 1.5, alpha * .7);
    }
    const births = [1.3, 3.6, 6, 8.6, 11.1, 13.4];
    for (let i = 0; i < births.length; i++) {
      const age = time - births[i];
      const alpha = smooth(0, .8, age) * (1 - smooth(1, 4, age));
      if (alpha <= .001) continue;
      source(point, .38 + unit(i + 1) * .25, .77 + unit(i + 2) * .065, 1.1); project(projected, point);
      const r = (reduced ? .6 + i * .06 : .18 + clamp(age, 0, 4) * .42) * projected.scale;
      context.globalAlpha = alpha * .32; context.strokeStyle = '#f3d194'; context.lineWidth = .75;
      context.beginPath(); context.ellipse(projected.x, projected.y, r, r * .12, 0, 0, TAU); context.stroke();
      context.globalAlpha = alpha * .14;
      context.beginPath(); context.ellipse(projected.x, projected.y, r * .78, r * .094, 0, 0, TAU); context.stroke();
    }
    context.restore();
  };

  const drawLantern = (lantern: Lantern, time: number, reduced: boolean) => {
    const age = time - lantern.born;
    const travel = reduced ? lantern.life * .5 : clamp(age, 0, lantern.life);
    source(start, lantern.x, lantern.y, lantern.depth);
    point.x = start.x + Math.sin(travel * .38 + lantern.phase) * (.15 + travel * .012);
    point.y = start.y + travel * lantern.speed; point.z = start.z - travel * .08;
    const sourceY = .5 - point.y / (2 * (CAMERA_Z - point.z) * HALF_TANGENT);
    const alpha = smooth(0, reduced ? 3.3 : 1.7, age) * (1 - smooth(lantern.life - 3.5, lantern.life, age))
      * (1 - smooth(50, 55, time)) * smooth(-.04, .055, sourceY);
    if (alpha <= .001) return;
    project(projected, point);
    const scale = lantern.scale * projected.scale;
    const yaw = lantern.phase + (reduced ? 0 : travel * .12);
    const halfWidth = .225 * scale * (.9 + Math.abs(Math.cos(yaw)) * .1);
    const bodyHeight = .73 * scale;
    glow(projected.x, projected.y + bodyHeight * .15, bodyHeight * .72, 0, alpha * .13);
    context.save(); context.translate(projected.x, projected.y);
    context.rotate(reduced ? 0 : Math.sin(travel * .55 + lantern.phase) * .035);
    context.globalAlpha = alpha;
    const gradient = context.createLinearGradient(-halfWidth, 0, halfWidth, bodyHeight * .3);
    gradient.addColorStop(0, '#bd7735'); gradient.addColorStop(.18, '#e9ad5f');
    gradient.addColorStop(.48, '#f6cf87'); gradient.addColorStop(.7, '#f4bf6e'); gradient.addColorStop(1, '#bc773b');
    context.fillStyle = gradient;
    context.beginPath(); context.moveTo(-halfWidth * .65, bodyHeight * .43);
    context.bezierCurveTo(-halfWidth * .88, bodyHeight * .16, -halfWidth * 1.03, -bodyHeight * .22, -halfWidth * .86, -bodyHeight * .36);
    context.quadraticCurveTo(-halfWidth * .62, -bodyHeight * .53, 0, -bodyHeight * .52);
    context.quadraticCurveTo(halfWidth * .65, -bodyHeight * .53, halfWidth * .86, -bodyHeight * .36);
    context.bezierCurveTo(halfWidth * 1.03, -bodyHeight * .22, halfWidth * .88, bodyHeight * .16, halfWidth * .65, bodyHeight * .43);
    context.quadraticCurveTo(0, bodyHeight * .49, -halfWidth * .65, bodyHeight * .43); context.closePath(); context.fill();
    context.strokeStyle = 'rgba(111,61,23,.34)'; context.lineWidth = Math.max(.35, scale * .012);
    for (const rib of [-.5, 0, .5]) {
      context.beginPath(); context.moveTo(halfWidth * rib * .85, -bodyHeight * .48);
      context.quadraticCurveTo(halfWidth * rib * 1.16, 0, halfWidth * rib * .72, bodyHeight * .43); context.stroke();
    }
    context.strokeStyle = 'rgba(255,227,164,.42)'; context.lineWidth = .6;
    context.beginPath(); context.moveTo(-halfWidth * .75, -bodyHeight * .34);
    context.quadraticCurveTo(0, -bodyHeight * .43, halfWidth * .75, -bodyHeight * .34); context.stroke();
    const light = context.createRadialGradient(0, bodyHeight * .28, 0, 0, bodyHeight * .22, halfWidth * .85);
    light.addColorStop(0, 'rgba(255,240,181,.75)'); light.addColorStop(.42, 'rgba(255,212,119,.28)'); light.addColorStop(1, 'rgba(255,191,82,0)');
    context.fillStyle = light; context.fillRect(-halfWidth * .83, -bodyHeight * .03, halfWidth * 1.66, bodyHeight * .48);
    context.fillStyle = '#925723'; context.beginPath(); context.ellipse(0, bodyHeight * .435, halfWidth * .66, bodyHeight * .027, 0, 0, TAU); context.fill();
    context.fillStyle = '#ffd981'; context.beginPath();
    context.ellipse(0, bodyHeight * .365, Math.max(.65, halfWidth * .105), bodyHeight * .075, 0, 0, TAU); context.fill();
    context.fillStyle = '#fff0bb'; context.beginPath(); context.ellipse(0, bodyHeight * .384, Math.max(.4, halfWidth * .055), bodyHeight * .035, 0, 0, TAU); context.fill();
    context.restore();
  };

  const wing = (side: number, size: number, squash: number, alpha: number, blush: boolean) => {
    context.save(); context.scale(squash, 1);
    const gradient = context.createLinearGradient(0, 0, side * size * .8, -size * .4);
    gradient.addColorStop(0, '#d4a267'); gradient.addColorStop(.4, blush ? '#f3d3d6' : '#f2dcb5');
    gradient.addColorStop(1, blush ? '#c77d9e' : '#dcb980'); context.fillStyle = gradient;
    context.globalAlpha = alpha;
    context.beginPath(); context.moveTo(0, -size * .08);
    context.bezierCurveTo(side * size * .22, -size * .68, side * size * .98, -size * .91, side * size * .86, -size * .26);
    context.bezierCurveTo(side * size * .84, -size * .07, side * size * .56, size * .01, side * size * .43, size * .03);
    context.bezierCurveTo(side * size * .81, size * .06, side * size * .75, size * .68, side * size * .41, size * .59);
    context.bezierCurveTo(side * size * .16, size * .48, side * size * .12, size * .14, 0, size * .1);
    context.closePath(); context.fill();
    context.strokeStyle = 'rgba(255,235,199,.42)'; context.lineWidth = .45; context.stroke();
    context.strokeStyle = 'rgba(128,78,54,.22)';
    context.beginPath(); context.moveTo(0, 0); context.lineTo(side * size * .65, -size * .41);
    context.moveTo(0, 0); context.lineTo(side * size * .48, size * .35); context.stroke();
    context.restore();
  };

  const drawButterfliesAndPetals = (time: number, reduced: boolean) => {
    const morph = smooth(48.5, 53.8, time);
    for (let i = 0; i < 18; i++) {
      const seed = i * 9 + 320; const age = time - 35 - i * .23;
      const p = reduced ? .83 : smooth(0, 13.5 + unit(seed) * 1.5, age);
      const alpha = smooth(0, 1.6, age) * (1 - morph);
      if (alpha <= .001) continue;
      const target = CONSTELLATION_POINTS[Math.floor(i / 18 * CONSTELLATION_POINTS.length)];
      source(start, i % 2 ? .88 - unit(seed + 1) * .08 : .12 + unit(seed + 1) * .08, .885, 4);
      source(end, target[0], target[1], -8);
      point.x = start.x + (end.x - start.x) * p + Math.sin(p * TAU + i) * Math.sin(p * Math.PI) * .65;
      point.y = start.y + (end.y - start.y) * p + Math.sin(p * Math.PI) * 1.7;
      point.z = start.z + (end.z - start.z) * p; project(projected, point);
      const phase = unit(seed + 2) * TAU;
      const flap = reduced ? .3 : .12 + Math.sin(Math.max(0, age) * 18 + phase) * .78;
      const size = (.23 + unit(seed + 3) * .14) * projected.scale;
      context.save(); context.translate(projected.x, projected.y); context.rotate(Math.sin(phase) * .25);
      wing(-1, size, .25 + Math.abs(Math.cos(flap + .12)) * .75, alpha, i % 3 === 0);
      wing(1, size, .25 + Math.abs(Math.cos(flap - .12)) * .75, alpha, i % 3 === 0);
      context.globalAlpha = alpha; context.strokeStyle = '#bd925a'; context.lineWidth = Math.max(.65, size * .065);
      context.beginPath(); context.moveTo(0, -size * .23); context.lineTo(0, size * .25); context.stroke(); context.restore();
    }
    for (let i = 0; i < 36; i++) {
      const seed = 700 + i * 11; const age = time - 35.5 - unit(seed) * 6;
      const alpha = smooth(0, 2, age) * (1 - smooth(49, 54, time));
      if (alpha <= .001) continue;
      const p = reduced ? .65 : smooth(0, 13.5, age);
      source(start, i % 2 ? .83 + unit(seed + 1) * .1 : .07 + unit(seed + 1) * .1, .91, 5.5);
      source(end, .3 + unit(seed + 2) * .4, .27 + unit(seed + 3) * .11, -5);
      point.x = start.x + (end.x - start.x) * p + Math.sin(p * TAU * 1.5 + i) * Math.sin(p * Math.PI) * .9;
      point.y = start.y + (end.y - start.y) * p + Math.sin(p * Math.PI) * (1.2 + unit(seed + 4));
      point.z = start.z + (end.z - start.z) * p + Math.cos(p * TAU + i) * Math.sin(p * Math.PI) * 1.5;
      project(projected, point); const phase = unit(seed + 5) * TAU;
      const size = (.13 + unit(seed + 6) * .17) * projected.scale;
      context.save(); context.translate(projected.x, projected.y); context.rotate(reduced ? phase : age * .7 + phase);
      context.scale(reduced ? .8 : .35 + Math.abs(Math.cos(age * .85 + phase)) * .65, 1);
      const g = context.createLinearGradient(-size * .5, -size * .5, size * .5, size * .5);
      g.addColorStop(0, '#efcbd6'); g.addColorStop(.55, '#dba1b9'); g.addColorStop(1, '#b77391');
      context.fillStyle = g; context.globalAlpha = alpha * .88;
      context.beginPath(); context.moveTo(0, -size * .54);
      context.bezierCurveTo(-size * .63, -size * .08, -size * .47, size * .7, size * .03, size * .53);
      context.bezierCurveTo(size * .58, size * .58, size * .57, -size * .13, 0, -size * .54); context.fill(); context.restore();
    }
  };

  const drawConstellation = (time: number, reduced: boolean) => {
    const alpha = smooth(48.7, 53.2, time) * (1 - smooth(55, 59.2, time));
    if (alpha <= .001) return;
    context.strokeStyle = '#e8ca97'; context.lineWidth = .7;
    context.globalAlpha = alpha * .45;
    context.beginPath();
    for (const [a, b] of CONSTELLATION_EDGES) {
      const from = screen(CONSTELLATION_POINTS[a][0], CONSTELLATION_POINTS[a][1]);
      const to = screen(CONSTELLATION_POINTS[b][0], CONSTELLATION_POINTS[b][1]);
      context.moveTo(from.x, from.y); context.lineTo(to.x, to.y);
    }
    context.stroke();
    CONSTELLATION_POINTS.forEach(([x, y], i) => {
      const p = screen(x, y);
      const twinkle = reduced ? .83 : .76 + Math.sin(time * 1.3 + i * 2.1) * .18;
      star(p.x, p.y, (i % 6 === 0 ? 3.1 : 1.8) * Math.max(.75, cover * 1.5), alpha * twinkle, 0);
    });
  };

  const drawShell = (shell: Shell, age: number, reduced: boolean) => {
    const { cue } = shell;
    if (age < -1.25 || age > shell.life || sparkBudget <= 0) return;
    source(start, cue.x, cue.y, cue.z);
    const gravity = cue.shape === 'willow' ? .5 : cue.shape === 'palm' ? .29 : .18;
    const sample = (particle: ShellParticle, seconds: number, out: Projected) => {
      const radial = (1 - Math.exp(-.22 * Math.max(0, seconds))) / .22;
      point.x = start.x + particle.x * particle.speed * radial;
      point.y = start.y + particle.y * particle.speed * radial - gravity * seconds * seconds * .5;
      point.z = start.z + particle.z * particle.speed * radial;
      return project(out, point);
    };
    if (age < 0) {
      if (reduced) return;
      const p = smooth(-1.25, 0, age);
      // Rockets emerge above the tallest roof. Their trails never paint through masonry.
      const launch = screen(cue.x + (unit(cue.seed) - .5) * .11, .419);
      const target = screen(cue.x, cue.y);
      const rocketX = launch.x + (target.x - launch.x) * p;
      const rocketY = launch.y + (target.y - launch.y) * p;
      const tailP = Math.max(0, p - .14);
      const gradient = context.createLinearGradient(rocketX, rocketY,
        launch.x + (target.x - launch.x) * tailP, launch.y + (target.y - launch.y) * tailP);
      gradient.addColorStop(0, 'rgba(255,225,162,.8)'); gradient.addColorStop(1, 'rgba(245,177,91,0)');
      context.globalAlpha = smooth(0, .15, p); context.strokeStyle = gradient; context.lineWidth = 1.1;
      context.beginPath(); context.moveTo(rocketX, rocketY);
      context.lineTo(launch.x + (target.x - launch.x) * tailP, launch.y + (target.y - launch.y) * tailP); context.stroke();
      glow(rocketX, rocketY, 4.5, 0, .75); return;
    }
    const fade = smooth(0, reduced ? .85 : .09, age) * (1 - smooth(shell.life * .35, shell.life, age));
    if (fade <= .001) return;
    reflection(cue.x, fade * .95, cue.color);
    const travel = reduced ? 1.5 : age;
    for (let i = 0; i < shell.particles.length && sparkBudget > 0; i++) {
      const particle = shell.particles[i];
      sample(particle, travel, projected);
      const normalizedY = .5 + (projected.y - height / 2) / (SOURCE_HEIGHT * cover);
      const skyMask = 1 - smooth(.405, .43, normalizedY);
      const shimmer = reduced ? .9 : .82 + .18 * Math.sin(age * 8 + i * 3.1);
      const alpha = fade * skyMask * shimmer;
      if (alpha <= .005) continue;
      sparkBudget--;
      const px = projected.x; const py = projected.y;
      const radius = particle.pixels * clamp(projected.scale / 29, .65, 1.5);
      if (!reduced && age > .07) {
        const duration = cue.shape === 'willow' ? .34 : cue.shape === 'palm' ? .23 : .16;
        context.strokeStyle = COLORS[cue.color]; context.globalAlpha = alpha * .62;
        context.lineWidth = Math.max(.5, radius * .66); context.lineCap = 'round';
        context.beginPath(); context.moveTo(px, py);
        for (let step = 1; step <= 4; step++) {
          sample(particle, Math.max(0, age - duration * step / 4), projectedTail);
          context.lineTo(projectedTail.x, projectedTail.y);
        }
        context.stroke();
        if (cue.shape === 'willow') {
          context.globalAlpha = alpha * .18; context.lineWidth = .65;
          context.beginPath(); context.moveTo(projectedTail.x, projectedTail.y);
          sample(particle, Math.max(0, age - duration - .23), projectedTail);
          context.lineTo(projectedTail.x, projectedTail.y); context.stroke();
        }
      }
      glow(px, py, radius * 3.5, cue.color, alpha * .7);
      context.globalAlpha = alpha; context.fillStyle = particle.ivory ? '#fff0ce' : COLORS[cue.color];
      context.beginPath(); context.arc(px, py, radius * .55, 0, TAU); context.fill();
    }
  };

  const drawGarden = (time: number, reduced: boolean) => {
    GARDEN_LIGHTS.forEach(([x, y], i) => {
      const strength = smooth(.7 + i * .65, 4.1 + i * .65, time);
      const p = screen(x, y);
      const breathe = reduced ? 1 : .92 + Math.sin(time * .35 + i) * .08;
      const radius = (i < 2 ? 12 : 6) * Math.max(.75, cover * 1.4);
      glow(p.x, p.y, radius, 0, strength * breathe * .4);
    });
    const fireflyFade = smooth(3, 8, time) * (1 - smooth(14, 21, time));
    if (fireflyFade <= .001) return;
    for (let i = 0; i < 24; i++) {
      const seed = 1700 + i * 13;
      const travel = reduced ? 0 : time;
      const p = screen(.12 + unit(seed) * .76 + Math.sin(travel * .23 + i) * .014,
        .68 + unit(seed + 1) * .1 + Math.sin(travel * .28 + i * .7) * .012);
      const brightness = reduced ? .7 : .45 + .35 * Math.sin(time * .8 + i * .9);
      glow(p.x, p.y, 3.3 + unit(seed + 2) * 1.7, 0, fireflyFade * brightness);
    }
  };

  return {
    resize(w: number, h: number, dpr: number) {
      width = Math.max(1, w); height = Math.max(1, h); cover = Math.max(width / SOURCE_WIDTH, height / SOURCE_HEIGHT);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    render(timeValue: number, delta: number, reduced: boolean) {
      const time = clamp(timeValue, 0, FINALE_DURATION);
      effectClock += clamp(delta, 0, .1); sparkBudget = MAX_SPARKS;
      context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
      context.lineCap = 'round';
      context.clearRect(0, 0, width, height); reflections.length = 0;
      drawGarden(time, reduced);
      for (const lantern of lanterns) {
        drawLantern(lantern, time, reduced);
        const age = time - lantern.born;
        if (age > 0 && age < 5 && lantern.id >= 40) reflection(lantern.x, .3 * Math.sin(age / 5 * Math.PI), 0);
      }
      drawButterfliesAndPetals(time, reduced); drawConstellation(time, reduced);
      context.save(); context.beginPath(); context.rect(0, 0, width, screen(0, .431).y); context.clip();
      for (const shell of shells) drawShell(shell, time - shell.cue.at, reduced);
      for (let i = extraShells.length - 1; i >= 0; i--) {
        const extra = extraShells[i]; const age = effectClock - extra.born;
        if (age > extra.shell.life) extraShells.splice(i, 1);
        else drawShell(extra.shell, age, reduced);
      }
      context.restore();
      reflections.sort((a, b) => b.strength - a.strength); drawWater(time, reduced);
      for (let i = wands.length - 1; i >= 0; i--) {
        const wand = wands[i]; const age = effectClock - wand.born;
        if (age >= 1.5) { wands.splice(i, 1); continue; }
        const alpha = smooth(0, .12, age) * (1 - smooth(.3, 1.5, age));
        const p = screen(wand.x, wand.y);
        for (let j = 0; j < 8; j++) {
          const phase = unit(wand.seed + j * 17) * TAU;
          const radius = reduced ? 8 : age * (8 + unit(wand.seed + j) * 16);
          star(p.x + Math.cos(phase) * radius, p.y + Math.sin(phase) * radius - (reduced ? 0 : age * 9),
            j % 3 === 0 ? 2.2 : 1.2, alpha * .75);
        }
      }
      context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
      return extraShells.length > 0 || wands.length > 0;
    },
    emit(burst: RideBurst) {
      const x = .5 + (clamp(burst.x) * width - width / 2) / (SOURCE_WIDTH * cover);
      const y = .5 + (clamp(burst.y) * height - height / 2) / (SOURCE_HEIGHT * cover);
      const power = clamp(burst.power ?? .7, .2, 1);
      if (burst.kind !== 'fireworks' && power < .48) {
        if (wands.length >= 6) wands.shift();
        wands.push({ x, y, born: effectClock, seed: burst.id }); return;
      }
      if (extraShells.length >= 3) extraShells.shift();
      const cue: FireworkCue = { at: 0, x: clamp(x, .18, .82), y: clamp(y, .16, .35), z: -7,
        size: 1.4 + power * .6, shape: burst.id % 3 === 0 ? 'ring' : 'peony',
        color: Math.abs(burst.id) % COLORS.length, seed: burst.id, count: Math.round(65 + power * 35) };
      extraShells.push({ shell: makeShell(cue), born: effectClock + .18 });
    },
    clearInteractive() { extraShells.length = 0; wands.length = 0; effectClock = 0; },
    dispose() { extraShells.length = 0; wands.length = 0; sprites.forEach(image => { image.width = 1; image.height = 1; }); },
  };
}
