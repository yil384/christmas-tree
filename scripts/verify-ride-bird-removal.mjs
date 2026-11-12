#!/usr/bin/env node
/** Read-only checks against the actual shipped timeline and runtime hotspot mapper. */
import assert from 'node:assert/strict';
import { readFile, access, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
assert(args.includes('--original-timeline'), 'Pass --original-timeline with the snapshotted original 228.5-second timeline');
const original = JSON.parse(await readFile(resolve(value('--original-timeline')), 'utf8'));
const timeline = JSON.parse(await readFile(resolve(root, 'src/journey/rideTimeline.json'), 'utf8'));
const published = JSON.parse(await readFile(resolve(root, 'public/journey/film/timeline.json'), 'utf8'));
assert.equal(original.durationFrames, 5484);
assert.equal(timeline.revision, 'birdfree-r1');
assert.equal(timeline.durationFrames, 4872);
assert.equal(timeline.duration, 203);
assert.equal(timeline.totalExperienceDuration, 293);
assert.deepEqual(timeline, published, 'Source and shipped timelines must match');
assert.deepEqual(timeline.segments.map(segment => segment.shotId), [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
const before = timeline.segments.find(segment => segment.shotId === 7);
const after = timeline.segments.find(segment => segment.shotId === 10);
assert.equal(before.end, 88.5);
assert.equal(before.sourceOut, 14.5);
assert.equal(before.overlapOut, 0);
assert.equal(after.start, 88.5);
assert.equal(after.sourceIn, 0.5);
assert.equal(after.overlapIn, 0);

const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const mapperURL = moduleURL(compile(await readFile(resolve(root, 'src/journey/mapRideHotspots.ts'), 'utf8')));
const { mapRideHotspots } = await import(mapperURL);
const hotspotSource = (await readFile(resolve(root, 'src/journey/rideHotspots.ts'), 'utf8'))
  .replace(/^import timelineJson from .*;$/m, `const timelineJson = ${JSON.stringify(JSON.stringify(timeline))};`);
const hotspotJS = compile(hotspotSource).replace(/from ['"]\.\/mapRideHotspots['"]/g, `from ${JSON.stringify(mapperURL)}`);
const { RIDE_HOTSPOTS, RIDE_SOURCE_HOTSPOTS, RIDE_DURATION } = await import(moduleURL(hotspotJS));
assert.equal(RIDE_DURATION, 203);
assert(!RIDE_SOURCE_HOTSPOTS.some(source => [8, 9].includes(source.shotId)));
assert.equal(RIDE_HOTSPOTS.length, 16);
const oldMapped = mapRideHotspots(RIDE_SOURCE_HOTSPOTS, original);
const sourceID = hotspot => hotspot.id.slice(0, hotspot.id.lastIndexOf(':'));
let unchanged = 0;
let shifted = 0;
for (const hotspot of RIDE_HOTSPOTS) {
  const prior = oldMapped.find(candidate => sourceID(candidate) === sourceID(hotspot));
  assert(prior, `No original counterpart for ${hotspot.id}`);
  assert(prior.to <= 88.5 || prior.from >= 114, `Hotspot crosses the removed window: ${prior.id}`);
  const shift = prior.from >= 114 ? 25.5 : 0;
  assert.equal(hotspot.from, prior.from - shift);
  assert.equal(hotspot.to, prior.to - shift);
  for (const property of ['x', 'y', 'endX', 'endY', 'kind', 'power', 'label']) {
    assert.deepEqual(hotspot[property], prior[property], `${property} changed for ${hotspot.id}`);
  }
  assert(hotspot.from >= 0 && hotspot.to <= 203);
  if (shift) shifted += 1;
  else unchanged += 1;
}

const playback = await readFile(resolve(root, 'src/journey/useRidePlayback.ts'), 'utf8');
assert(playback.includes("assetUrl('journey/film/index-birdfree-r1.m3u8')"));
await access(resolve(root, 'public/journey/film/index-birdfree-r1.m3u8'));
const confession = await readFile(resolve(root, 'src/journey/RideConfession.tsx'), 'utf8');
for (const text of ['马来西亚那趟，我一直记着。', '我喜欢你。', '要不要和我在一起？']) {
  assert(confession.includes(text), `Missing confession copy: ${text}`);
}
const report = {
  revision: 'birdfree-r1', passed: true,
  filmDuration: RIDE_DURATION, totalExperienceDuration: timeline.totalExperienceDuration,
  retainedShots: timeline.segments.length, retainedHotspots: RIDE_HOTSPOTS.length,
  unchangedHotspots: unchanged, shiftedHotspots: shifted, shiftSeconds: 25.5,
  removedShotIds: [8, 9], sourceAndPublicTimelineMatch: true,
  cacheVersionedMediaExists: true, confessionCopyVerified: true,
};
if (args.includes('--report')) await writeFile(resolve(value('--report')), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
