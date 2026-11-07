import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { prepareScene } from '../scripts/prepare-scene.mjs';

async function project(t) {
  const root = await mkdtemp(join(tmpdir(), 'christmas-scene-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'public', 'backgrounds'), { recursive: true });
  return root;
}

test('a missing optional scene config keeps the personal greeting and snow without blocking the build', async t => {
  const root = await project(t);
  const result = await prepareScene({ root });
  assert.equal(result.manifest.greeting, '祝集美小喵【zkl】圣诞节快乐');
  assert.equal(result.manifest.snow, true);
  assert.equal(result.manifest.background.src, null);
  assert.equal(result.imageBytes, 0);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'public/generated/scene.json'), 'utf8')), result.manifest);
});

test('night images are oriented, compressed and bounded, while the original and selected crop stay intact', async t => {
  const root = await project(t);
  const original = await sharp({ create: { width: 2600, height: 1400, channels: 3, background: '#183247' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const photo = join(root, 'public/backgrounds/night.jpg');
  await writeFile(photo, original);
  await writeFile(join(root, 'public/scene.json'), JSON.stringify({
    greeting: '圣诞快乐',
    background: { image: 'backgrounds/night.jpg', brightness: 0.6, focus: [0.3, 0.7] },
    snow: false,
  }));
  const first = await prepareScene({ root });
  const output = await readFile(join(root, 'public', first.manifest.background.src));
  const meta = await sharp(output).metadata();
  assert.equal(meta.format, 'webp');
  assert.ok(meta.height > meta.width, 'EXIF orientation must be applied');
  assert.equal(Math.max(meta.width, meta.height), 1920);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.orientation, undefined);
  assert.equal(first.manifest.background.brightness, 0.6);
  assert.deepEqual(first.manifest.background.focus, [0.3, 0.7]);
  assert.equal(first.manifest.snow, false);
  assert.deepEqual(await readFile(photo), original);
  assert.deepEqual(await prepareScene({ root }), first, 'Repeated builds should produce the same asset path');
});

test('invalid background selections fail without replacing the last valid scene', async t => {
  const root = await project(t);
  await prepareScene({ root });
  const manifestPath = join(root, 'public/generated/scene.json');
  const previous = await readFile(manifestPath, 'utf8');
  for (const image of ['https://example.com/night.jpg', '../private.jpg', 'backgrounds/../private.jpg']) {
    await writeFile(join(root, 'public/scene.json'), JSON.stringify({ background: { image } }));
    await assert.rejects(prepareScene({ root }), /local image directly inside/);
    assert.equal(await readFile(manifestPath, 'utf8'), previous);
  }
  await writeFile(join(root, 'public/backgrounds/broken.jpg'), 'not an image');
  await writeFile(join(root, 'public/scene.json'), JSON.stringify({ background: { image: 'backgrounds/broken.jpg' } }));
  await assert.rejects(prepareScene({ root }));
  assert.equal(await readFile(manifestPath, 'utf8'), previous);
});
