import { KITTEN_ACTIONS, KITTEN_IDS } from './kitten-pack';
import type { KittenAction, KittenId } from './kitten-pack';

export interface KittenPose {
  id: KittenId;
  position: [number, number];
  yaw: number;
  speed: number;
  action: KittenAction;
  actionTime: number;
  /** Zero means native clip speed; positive values are captured per action. */
  actionDuration: number;
  partnerId: KittenId | null;
  focused: boolean;
}

export interface KittenSocialConfig {
  seed?: number;
  /** Center bounds; footprintRadius is inset from these edges. */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  obstacles?: readonly { position: readonly [number, number]; radius: number }[];
  footprintRadius?: number;
  minimumSeparation?: number;
  /** Must be calibrated to the selected models' dimensions and reach. */
  playDistance?: number;
  walkSpeed?: number;
  trotSpeed?: number;
  gallopSpeed?: number;
  acceleration?: number;
  actionDurations?: Partial<Record<KittenAction, number>>;
}

type Point = [number, number];
type RestAction = 'idle' | 'sit' | 'lie' | 'sleep';
type Phase = 'meet' | 'chase' | 'regroup' | 'pounce-a' | 'pause-a' | 'pounce-b' | 'pause-b' | 'paw-a' | 'paw-b' | 'rest';
interface Cat {
  id: KittenId;
  position: Point;
  yaw: number;
  velocity: number;
  speed: number;
  action: KittenAction;
  actionTime: number;
  actionDuration: number;
  rest: RestAction;
  restUntil: number;
  initialRestUntil: number;
  goal: Point | null;
  focusUntil: number;
}
interface Play {
  cats: [Cat, Cat];
  phase: Phase;
  elapsed: number;
  duration: number;
  goals: [Point, Point];
  chaseGoal: Point;
  side: number;
  returnGoals: [Point, Point] | null;
  alignmentUsed: boolean;
}
interface Intent { goal: Point | null; speed: number; action: KittenAction; duration: number }

export const KITTEN_SOCIAL_DEFAULTS = {
  bounds: { minX: -12, maxX: 12, minZ: 2, maxZ: 13 },
  obstacles: [{ position: [0, 0] as Point, radius: 9.2 }],
  footprintRadius: 0.85,
  minimumSeparation: 1.9,
  playDistance: 2.2,
  walkSpeed: 0.58,
  trotSpeed: 1.2,
  gallopSpeed: 2.2,
  acceleration: 2.4,
} as const;

const STARTS: readonly Point[] = [[-10.2, 4.5], [-11, 7.2], [-8.6, 10.3], [10.2, 4.5], [11, 7.2], [8.6, 10.3]];
const START_YAWS = [-0.29, 2.85, -2.6, 0.29, -2.85, 2.6];
const INITIAL_RESTS: readonly RestAction[] = ['sit', 'idle', 'lie', 'idle', 'sit', 'sleep'];
const PAIRS = [[0, 1], [3, 4], [1, 2], [4, 5], [2, 0], [5, 3]] as const;
const RESTS: readonly RestAction[] = ['idle', 'sit', 'lie', 'sleep'];
const SEQUENCE: readonly Phase[] = ['meet', 'pounce-a', 'pause-a', 'pounce-b', 'pause-b', 'paw-a', 'paw-b', 'chase', 'regroup', 'rest'];
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const moving = (action: KittenAction) => action === 'walk' || action === 'trot' || action === 'gallop';

/** Only social timing, safe planar movement and semantic clip intentions live
 * here. No meshes, limb edits, body squash, asset paths or invented clip names.
 * The real asset layer supplies authored clips and their inspected durations. */
export function createKittenSocialController(options: KittenSocialConfig = {}) {
  const config = { ...KITTEN_SOCIAL_DEFAULTS, ...options };
  const bounds = { ...config.bounds };
  const obstacles = config.obstacles.map(obstacle => ({ position: [...obstacle.position] as Point, radius: obstacle.radius }));
  for (const [name, value] of Object.entries({
    footprintRadius: config.footprintRadius, minimumSeparation: config.minimumSeparation,
    playDistance: config.playDistance, walkSpeed: config.walkSpeed, trotSpeed: config.trotSpeed,
    gallopSpeed: config.gallopSpeed, acceleration: config.acceleration,
  })) if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be finite and positive.`);
  if (config.minimumSeparation < config.footprintRadius * 2 || config.playDistance < config.minimumSeparation + 0.15) {
    throw new Error('Play distance and separation must leave room for both kitten footprints.');
  }
  if (!(config.walkSpeed < config.trotSpeed && config.trotSpeed < config.gallopSpeed)) throw new Error('Gait speeds must increase from walk to trot to gallop.');
  if (!Object.values(bounds).every(Number.isFinite) || bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ
    || obstacles.some(obstacle => !obstacle.position.every(Number.isFinite) || !Number.isFinite(obstacle.radius) || obstacle.radius < 0)) {
    throw new Error('Invalid kitten safe area.');
  }
  let seed = (Number.isFinite(options.seed) ? options.seed! : 7319) >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  // These are provisional scheduling holds, not claims about purchased clips.
  // Real integration replaces them with inspected durations before mounting.
  const durations: Partial<Record<KittenAction, number>> = { pounce: 1.8, paw: 1.25 };
  function setActionDurations(values: Partial<Record<KittenAction, number>>) {
    for (const [action, value] of Object.entries(values)) {
      if (!KITTEN_ACTIONS.includes(action as KittenAction) || !Number.isFinite(value) || value! <= 0) {
        throw new Error('Action durations must use known semantics and finite positive seconds.');
      }
    }
    Object.assign(durations, values);
  }
  setActionDurations(options.actionDurations ?? {});
  const cats: Cat[] = KITTEN_IDS.map((id, index) => ({
    id, position: [...STARTS[index]], yaw: START_YAWS[index], velocity: 0, speed: 0,
    action: INITIAL_RESTS[index], actionTime: 0, actionDuration: durations[INITIAL_RESTS[index]] ?? 0,
    rest: INITIAL_RESTS[index], restUntil: Math.max(index < 2 ? 20 : 4 + index * 2.6, (durations[INITIAL_RESTS[index]] ?? 0) + 2),
    initialRestUntil: (durations[INITIAL_RESTS[index]] ?? 0) + 2, goal: null, focusUntil: 0,
  }));
  let clock = 0, nextPlayAt = 9, pairIndex = 0, play: Play | null = null;
  let requestedPair: [KittenId, KittenId] | null = null;
  let paused = false, reduced = false, turn = 0;

  function safe(point: readonly number[]) {
    const r = config.footprintRadius;
    return point[0] >= bounds.minX + r && point[0] <= bounds.maxX - r
      && point[1] >= bounds.minZ + r && point[1] <= bounds.maxZ - r
      && obstacles.every(obstacle => distance(point, obstacle.position) >= obstacle.radius + r + 0.02);
  }
  for (let i = 0; i < cats.length; i++) {
    if (!safe(cats[i].position) || cats.slice(0, i).some(cat => distance(cat.position, cats[i].position) < config.minimumSeparation)) {
      throw new Error('The configured safe area cannot contain the six starting positions.');
    }
  }
  const partner = (cat: Cat) => play?.cats.includes(cat) ? play.cats[play.cats[0] === cat ? 1 : 0] : null;
  const held = (cat: Cat) => cat.focusUntil > clock;
  const settled = (pair: Play) => pair.cats.every(cat => cat.speed < 0.05 && cat.velocity < 0.05);

  function rest(cat: Cat, minimum = 5) {
    cat.goal = null;
    cat.rest = RESTS[Math.floor(random() * RESTS.length)];
    cat.restUntil = clock + Math.max(minimum, durations[cat.rest] ?? 0) + 3 + random() * 9;
  }

  function meetingGoals(a: Cat, b: Cat): [Point, Point] | null {
    const length = distance(a.position, b.position);
    const dx = (b.position[0] - a.position[0]) / length, dz = (b.position[1] - a.position[1]) / length;
    const middle: Point = [(a.position[0] + b.position[0]) / 2, (a.position[1] + b.position[1]) / 2];
    const gap = config.playDistance / 2;
    const side = Math.sign(a.position[0] + b.position[0]) || 1;
    const candidates: { middle: Point; dx: number; dz: number }[] = [{ middle, dx, dz }];
    for (const center of [[side * 9.9, 7], [side * 9.4, 8.3], [side * 6, 11], [side * 3.8, 11.2]] as Point[]) {
      for (const angle of [0, Math.PI / 2, Math.PI / 4]) candidates.push({ middle: center, dx: Math.sin(angle), dz: Math.cos(angle) });
    }
    for (const candidate of candidates) {
      const { middle: center, dx: x, dz: z } = candidate;
      const result: [Point, Point] = [[center[0] - x * gap, center[1] - z * gap], [center[0] + x * gap, center[1] + z * gap]];
      if (distance(a.position, result[1]) + distance(b.position, result[0]) < distance(a.position, result[0]) + distance(b.position, result[1])) result.reverse();
      if (result.every(point => safe(point) && cats.every(other => other === a || other === b || distance(point, other.position) >= config.minimumSeparation + 0.2)) && safe(center)) return result;
    }
    return null;
  }

  function chooseChaseGoal(pair: Play): Point {
    const leader = pair.cats[0];
    const candidates: Point[] = [
      [pair.side * 11, 4.5], [pair.side * 11, 10.8],
      [pair.side * 7, 11.4], [pair.side * 10.3, 7.4],
    ];
    let best = [...leader.position] as Point, score = -Infinity;
    for (const point of candidates) {
      if (!safe(point)) continue;
      const clearance = Math.min(...cats.filter(cat => !pair.cats.includes(cat)).map(cat => distance(point, cat.position)));
      const nextScore = Math.min(clearance, 4) + Math.min(distance(point, leader.position), 5) + random() * 0.8;
      if (nextScore > score) { score = nextScore; best = point; }
    }
    return best;
  }

  function beginPair(a: Cat, b: Cat) {
    if (held(a) || held(b) || clock < a.initialRestUntil || clock < b.initialRestUntil || cats.some(cat => cat.speed > config.walkSpeed * 1.05)) return false;
    const goals = meetingGoals(a, b);
    if (!goals) return false;
    a.goal = null; b.goal = null;
    play = { cats: [a, b], phase: 'meet', elapsed: 0, duration: 0, goals, chaseGoal: [...a.position], side: Math.sign(a.position[0] + b.position[0]) || 1, returnGoals: null, alignmentUsed: false };
    play.chaseGoal = chooseChaseGoal(play);
    return true;
  }

  function endPair() {
    if (play) for (const cat of play.cats) rest(cat, 7);
    play = null; nextPlayAt = clock + 7 + random() * 5;
  }

  function nextPhase(pair: Play) {
    const phase = SEQUENCE[SEQUENCE.indexOf(pair.phase) + 1];
    if (!phase) { endPair(); return; }
    if (phase === 'chase') {
      // The kitten nearer the open destination leads. Otherwise two cats that
      // just greeted nose-to-nose would try to run through one another.
      if (distance(pair.cats[1].position, pair.chaseGoal) < distance(pair.cats[0].position, pair.chaseGoal)) pair.cats.reverse();
    }
    if (phase === 'regroup') {
      const goals = meetingGoals(...pair.cats);
      if (!goals) { endPair(); return; }
      pair.goals = goals;
      pair.alignmentUsed = false; pair.returnGoals = null;
    }
    pair.phase = phase; pair.elapsed = 0;
    pair.duration = phase.startsWith('pounce') ? durations.pounce! : phase.startsWith('paw') ? durations.paw! : 0;
  }

  function advanceSocial(step: number) {
    if (play) {
      const pair = play;
      pair.elapsed += step;
      if (pair.phase === 'meet' || pair.phase === 'regroup') {
        const near = pair.cats.every((cat, index) => distance(cat.position, pair.goals[index]) < 0.2);
        const facing = pair.cats.every((cat, index) => {
          const other = pair.cats[1 - index];
          return Math.abs(angleDifference(Math.atan2(other.position[0] - cat.position[0], other.position[1] - cat.position[1]), cat.yaw)) < Math.PI / 9;
        });
        // A one-shot cannot begin while the kittens are still traveling or apart.
        if (near && settled(pair)) {
          if (pair.returnGoals) { pair.goals = pair.returnGoals; pair.returnGoals = null; }
          else if (facing && distance(pair.cats[0].position, pair.cats[1].position) <= config.playDistance + 0.3) nextPhase(pair);
          else if (!pair.alignmentUsed) {
            // Walk a short approach again rather than rotating a planted body.
            // If there is no clear staging space, this play session times out.
            pair.alignmentUsed = true;
            const length = distance(pair.goals[0], pair.goals[1]);
            const dx = (pair.goals[1][0] - pair.goals[0][0]) / length, dz = (pair.goals[1][1] - pair.goals[0][1]) / length;
            const staging: [Point, Point] = [[pair.goals[0][0] - dx * 0.8, pair.goals[0][1] - dz * 0.8], [pair.goals[1][0] + dx * 0.8, pair.goals[1][1] + dz * 0.8]];
            if (staging.every(safe)) { pair.returnGoals = pair.goals; pair.goals = staging; }
          }
        }
        if (play === pair && (pair.phase === 'meet' || pair.phase === 'regroup') && pair.elapsed > 24) endPair();
      } else if (pair.phase === 'chase') {
        if (distance(pair.cats[0].position, pair.chaseGoal) < 0.9) pair.chaseGoal = chooseChaseGoal(pair);
        if (pair.elapsed >= 7.5) nextPhase(pair);
      } else if (pair.phase.startsWith('pounce') || pair.phase.startsWith('paw')) {
        const actor = pair.cats[pair.phase.endsWith('-a') ? 0 : 1];
        const kind = pair.phase.startsWith('pounce') ? 'pounce' : 'paw';
        if (actor.action === kind && actor.actionTime >= pair.duration) nextPhase(pair);
      } else if (pair.phase === 'rest') {
        if (pair.elapsed >= 3) nextPhase(pair);
      } else if (pair.elapsed >= 0.75) nextPhase(pair);
    }
    if (!play && cats.every(cat => cat.speed <= config.walkSpeed * 1.05)) {
      if (requestedPair) {
        const [a, b] = requestedPair.map(id => cats.find(cat => cat.id === id)!);
        if (beginPair(a, b)) requestedPair = null;
      } else if (clock >= nextPlayAt) {
        const [a, b] = PAIRS[pairIndex++ % PAIRS.length];
        if (!beginPair(cats[a], cats[b])) nextPlayAt = clock + 2;
      }
    }
    // Outside the playing pair, at most one companion takes occasional steps.
    let wandering = cats.some(cat => !partner(cat) && cat.goal !== null);
    for (const cat of cats) {
      if (held(cat) || partner(cat)) continue;
      if (cat.goal && distance(cat.position, cat.goal) < 0.18 && cat.speed < 0.05) { rest(cat); wandering = false; }
      if (!cat.goal && !wandering && clock >= cat.restUntil) {
        for (let attempt = 0; attempt < 6; attempt++) {
          const angle = random() * Math.PI * 2, reach = 0.45 + random() * 0.65;
          const goal: Point = [cat.position[0] + Math.sin(angle) * reach, cat.position[1] + Math.cos(angle) * reach];
          if (safe(goal) && cats.every(other => other === cat || distance(goal, other.position) > config.minimumSeparation + 0.2)) {
            cat.goal = goal; wandering = true; break;
          }
        }
        cat.restUntil = clock + 3;
      }
    }
  }

  function intent(cat: Cat): Intent {
    const base: Intent = { goal: held(cat) ? null : cat.goal, speed: config.walkSpeed, action: held(cat) ? 'idle' : cat.rest, duration: 0 };
    if (held(cat) || !play || !play.cats.includes(cat)) return base;
    const pair = play, index = pair.cats[0] === cat ? 0 : 1;
    if (pair.phase === 'meet' || pair.phase === 'regroup') return { ...base, goal: pair.goals[index], action: 'idle' };
    if (pair.phase === 'chase') {
      const leader = pair.cats[0];
      const gap = config.minimumSeparation + 0.65;
      if (index === 1 && pair.elapsed < 1) return { goal: null, speed: 0, action: 'idle', duration: 0 };
      return { ...base, action: 'idle', speed: config.gallopSpeed,
        goal: index === 0 ? pair.chaseGoal : [leader.position[0] - Math.sin(leader.yaw) * gap, leader.position[1] - Math.cos(leader.yaw) * gap] };
    }
    const actor = pair.phase.endsWith('-a') ? 0 : 1;
    if ((pair.phase.startsWith('pounce') || pair.phase.startsWith('paw')) && index === actor) {
      return { goal: null, speed: 0, action: pair.phase.startsWith('pounce') ? 'pounce' : 'paw', duration: pair.duration };
    }
    return { goal: null, speed: 0, action: pair.phase === 'rest' ? (index ? 'lie' : 'sit') : 'idle', duration: 0 };
  }

  /** Clip the swept footprint before obstacles/cats, never repair overlap by
   * teleporting bodies apart. Small integration steps preserve safe crossings. */
  function safeFraction(cat: Cat, dx: number, dz: number) {
    let fraction = 1;
    const [x, z] = cat.position, r = config.footprintRadius;
    if (dx < 0) fraction = Math.min(fraction, (bounds.minX + r - x) / dx);
    if (dx > 0) fraction = Math.min(fraction, (bounds.maxX - r - x) / dx);
    if (dz < 0) fraction = Math.min(fraction, (bounds.minZ + r - z) / dz);
    if (dz > 0) fraction = Math.min(fraction, (bounds.maxZ - r - z) / dz);
    const length = dx * dx + dz * dz;
    if (length < 1e-14) return 0;
    const circle = (position: readonly number[], radius: number) => {
      const rx = x - position[0], rz = z - position[1];
      const b = 2 * (rx * dx + rz * dz), c = rx * rx + rz * rz - radius * radius;
      if (b >= 0) return;
      const discriminant = b * b - 4 * length * c;
      if (discriminant < 0) return;
      const enter = (-b - Math.sqrt(discriminant)) / (2 * length);
      if (enter >= -1e-7 && enter <= fraction) fraction = Math.max(0, enter - 0.0001);
    };
    for (const obstacle of obstacles) circle(obstacle.position, obstacle.radius + r + 0.02);
    for (const other of cats) if (other !== cat) circle(other.position, config.minimumSeparation);
    return clamp(fraction, 0, 1);
  }

  function move(cat: Cat, command: Intent, step: number) {
    const target = command.goal;
    let targetSpeed = 0, yaw = cat.yaw;
    if (target) {
      const dx = target[0] - cat.position[0], dz = target[1] - cat.position[1], remaining = Math.hypot(dx, dz);
      if (remaining > 0.12) {
        let sx = dx / remaining, sz = dz / remaining;
        // A final clear short step must approach the partner directly; broad
        // avoidance fields otherwise push an already safe greeting sideways.
        const closing = partner(cat) && (play?.phase === 'meet' || play?.phase === 'regroup') && remaining < 1;
        if (!closing) for (const other of cats) {
          if (other === cat || (other === partner(cat) && play?.phase !== 'chase')) continue;
          const separation = distance(cat.position, other.position), range = config.minimumSeparation + 1.2;
          if (separation < range) {
            const strength = ((range - separation) / 1.2) ** 2 * 1.6;
            sx += (cat.position[0] - other.position[0]) / separation * strength;
            sz += (cat.position[1] - other.position[1]) / separation * strength;
          }
        }
        if (!closing) for (const obstacle of obstacles) {
          const separation = distance(cat.position, obstacle.position), range = obstacle.radius + config.footprintRadius + 2.2;
          if (separation < range) {
            const strength = ((range - separation) / 2.2) ** 2 * 2.5;
            sx += (cat.position[0] - obstacle.position[0]) / separation * strength;
            sz += (cat.position[1] - obstacle.position[1]) / separation * strength;
          }
        }
        if (!closing) {
          const edge = 1.5, r = config.footprintRadius;
          sx += clamp(1 - (cat.position[0] - bounds.minX - r) / edge, 0, 1) ** 2 * 2.5;
          sx -= clamp(1 - (bounds.maxX - r - cat.position[0]) / edge, 0, 1) ** 2 * 2.5;
          sz += clamp(1 - (cat.position[1] - bounds.minZ - r) / edge, 0, 1) ** 2 * 2.5;
          sz -= clamp(1 - (bounds.maxZ - r - cat.position[1]) / edge, 0, 1) ** 2 * 2.5;
        }
        const error = angleDifference(Math.atan2(sx, sz), cat.yaw);
        const turnRate = 1.8 / (1 + cat.velocity * 0.25);
        yaw += clamp(error, -turnRate * step, turnRate * step);
        const facing = 0.10 + 0.90 * Math.max(0, Math.cos(error));
        targetSpeed = Math.min(command.speed * facing, Math.sqrt(Math.max(0, 2 * config.acceleration * (remaining - 0.12))));
      }
    }
    cat.velocity += clamp(targetSpeed - cat.velocity, -config.acceleration * step, config.acceleration * step);
    const dx = Math.sin(yaw) * cat.velocity * step, dz = Math.cos(yaw) * cat.velocity * step;
    const fraction = safeFraction(cat, dx, dz);
    cat.position[0] += dx * fraction; cat.position[1] += dz * fraction;
    cat.speed = cat.velocity * fraction;
    // Heading is root locomotion only. A still cat is never rotated in lieu of
    // an authored turn/head animation; renderer receives an idle focus intent.
    if (cat.speed > 0.015) cat.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    if (fraction < 0.1) cat.velocity *= fraction;
    const kind: KittenAction = cat.speed > config.trotSpeed * 0.95 ? 'gallop'
      : cat.speed > config.walkSpeed * 1.12 ? 'trot' : cat.speed > 0.035 ? 'walk' : command.action;
    if (kind !== cat.action) {
      cat.action = kind; cat.actionTime = 0;
      cat.actionDuration = command.duration || durations[kind] || 0;
    } else cat.actionTime += step;
  }

  function snapshot(): KittenPose[] {
    return cats.map(cat => ({
      id: cat.id, position: [...cat.position], yaw: cat.yaw, speed: paused || reduced ? 0 : cat.speed,
      action: reduced ? (moving(cat.action) || cat.action === 'pounce' || cat.action === 'paw' ? 'idle' : cat.action) : cat.action,
      actionTime: cat.actionTime, actionDuration: cat.actionDuration,
      partnerId: reduced ? null : partner(cat)?.id ?? null, focused: held(cat),
    }));
  }

  function update(deltaSeconds: number, mode: { paused?: boolean; reducedMotion?: boolean } = {}) {
    paused = Boolean(mode.paused); reduced = Boolean(mode.reducedMotion);
    let remaining = Number.isFinite(deltaSeconds) ? clamp(deltaSeconds, 0, 0.05) : 0;
    if (paused || reduced) return snapshot();
    while (remaining > 1e-8) {
      const step = Math.min(remaining, 1 / 60); remaining -= step; clock += step;
      advanceSocial(step);
      const commands = cats.map(intent);
      for (let i = 0; i < cats.length; i++) { const index = (i + turn) % cats.length; move(cats[index], commands[index], step); }
      turn = (turn + 1) % cats.length;
    }
    return snapshot();
  }

  function focus(id: KittenId, seconds = 3) {
    const cat = cats.find(candidate => candidate.id === id);
    if (!cat || !Number.isFinite(seconds) || seconds <= 0) throw new Error('Focus requires a known kitten and positive duration.');
    if (play?.cats.includes(cat)) endPair();
    cat.goal = null; cat.focusUntil = Math.max(cat.focusUntil, clock + seconds);
    cat.rest = 'idle'; cat.restUntil = cat.focusUntil + 1.5;
    if (requestedPair?.includes(id)) requestedPair = null;
  }

  function magic(point?: readonly [number, number]) {
    if (point && !point.every(Number.isFinite)) throw new Error('Magic location must contain finite coordinates.');
    let selected: [KittenId, KittenId] | null = null, score = Infinity;
    for (let i = 0; i < cats.length; i++) for (let j = i + 1; j < cats.length; j++) {
      const a = cats[i], b = cats[j];
      if (held(a) || held(b) || !meetingGoals(a, b)) continue;
      const midpoint: Point = [(a.position[0] + b.position[0]) / 2, (a.position[1] + b.position[1]) / 2];
      const candidate = distance(a.position, b.position) + (point ? distance(midpoint, point) * 2 : 0);
      if (candidate < score) { score = candidate; selected = [a.id, b.id]; }
    }
    if (!selected) return null;
    if (play) endPair();
    requestedPair = selected;
    return [...selected] as [KittenId, KittenId];
  }

  return { update, snapshot, focus, magic, setActionDurations };
}

export type KittenSocialController = ReturnType<typeof createKittenSocialController>;
