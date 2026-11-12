import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import ts from 'typescript';
import { prepareScene } from '../scripts/prepare-scene.mjs';

const { outputText } = ts.transpileModule(await readFile(new URL('../src/lib/scene-config.ts', import.meta.url), 'utf8'), {
  fileName: 'scene-config.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { readSceneConfig } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

// One black 16×16 H.264 frame in a complete MP4 container. Embedding it keeps
// these file-pipeline tests independent of ffmpeg being installed on CI.
const tinyMp4 = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMMbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAACgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAjd0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAAoAAAAAAABAAAAAAGvbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAAAgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABWm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAARpzdGJsAAAAtnN0c2QAAAAAAAAAAQAAAKZhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALGF2Y0MBQsAK/+EAFWdCwAraewEQAAADABAAAAMDIPEiagEABGjOD8gAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAHfsAAAAAAAAAAYc3R0cwAAAAAAAAABAAAAAQAAAgAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAACZgAAAAEAAAAUc3RjbwAAAAAAAAABAAADPAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjEuNy4xMDMAAAAIZnJlZQAAAm5tZGF0AAACVAYF//9Q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTEgZGVibG9jaz0wOjA6MCBhbmFseXNlPTA6MCBtZT1kaWEgc3VibWU9MCBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0wIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MCA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0wIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0wIGtleWludD0yNTAga2V5aW50X21pbj0yNSBzY2VuZWN1dD0wIGludHJhX3JlZnJlc2g9MCByYz1jcmYgbWJ0cmVlPTAgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MACAAAAACmWIhDomKAAJAuA=', 'base64');

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

test('a perspective photograph keeps native proportions and its projection through the build and runtime', async t => {
  const root = await project(t);
  const source = await sharp({ create: { width: 1774, height: 887, channels: 3, background: '#879cc6' } }).png().toBuffer();
  await writeFile(join(root, 'public/backgrounds/castle.png'), source);
  const config = { background: {
    image: 'backgrounds/castle.png', projection: 'perspective', brightness: 0.92,
    focus: [0.83, 0.44], groundColor: '#879cc6',
  } };
  await writeFile(join(root, 'public/scene.json'), JSON.stringify(config));
  const { manifest } = await prepareScene({ root });
  const { width, height } = await sharp(join(root, 'public', manifest.background.src)).metadata();
  assert.deepEqual([width, height], [1774, 887]);
  const background = readSceneConfig(manifest).background;
  assert.equal(background.projection, 'perspective');
  assert.deepEqual(background.focus, [0.83, 0.44]);
  assert.equal(background.groundColor, '#879cc6');
  assert.equal(background.detailTiles, undefined);
  assert.deepEqual(await readFile(join(root, 'public/backgrounds/castle.png')), source);

  // A separately drawn detail patch must not silently become part of this
  // ordinary perspective photograph or replace its last working manifest.
  const previous = await readFile(join(root, 'public/generated/scene.json'));
  config.background.detailTiles = [{ image: 'backgrounds/castle.png' }];
  await writeFile(join(root, 'public/scene.json'), JSON.stringify(config));
  await assert.rejects(prepareScene({ root }), /equirectangular/);
  assert.deepEqual(await readFile(join(root, 'public/generated/scene.json')), previous);
  for (const groundColor of ['red', 'url(example)', '#fff', '#zzzzzz', 123]) {
    assert.equal(readSceneConfig({ background: { groundColor } }).background.groundColor, undefined);
  }
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
  assert.equal(Math.max(meta.width, meta.height), 2600);
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

test('a 2:1 panorama preserves native detail, projection and rotation below the 8K cap', async t => {
  const root = await project(t);
  await sharp({ create: { width: 4100, height: 2050, channels: 3, background: '#16324d' } })
    .png().toFile(join(root, 'public/backgrounds/panorama.png'));
  await writeFile(join(root, 'public/scene.json'), JSON.stringify({
    background: { image: 'backgrounds/panorama.png', projection: 'equirectangular', rotation: -37, brightness: 0.7 },
  }));
  const { manifest } = await prepareScene({ root });
  const metadata = await sharp(join(root, 'public', manifest.background.src)).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 4100);
  assert.equal(metadata.height, 2050);
  assert.deepEqual(readSceneConfig(manifest).background, manifest.background);
  assert.equal(manifest.background.projection, 'equirectangular');
  assert.equal(manifest.background.rotation, -37);
});

test('ordinary photos and corrupt panoramas cannot replace a working panorama or its asset', async t => {
  const root = await project(t);
  await sharp({ create: { width: 400, height: 200, channels: 3, background: '#183247' } })
    .png().toFile(join(root, 'public/backgrounds/valid.png'));
  const configPath = join(root, 'public/scene.json');
  const selection = image => JSON.stringify({ background: { image, projection: 'equirectangular' } });
  await writeFile(configPath, selection('backgrounds/valid.png'));
  const { manifest } = await prepareScene({ root });
  const manifestPath = join(root, 'public/generated/scene.json');
  const previous = await readFile(manifestPath);
  const assetPath = join(root, 'public', manifest.background.src);
  const asset = await readFile(assetPath);
  const filenames = await readdir(join(root, 'public/generated/background'));
  for (const [width, height] of [[200, 200], [300, 200], [200, 400]]) {
    await sharp({ create: { width, height, channels: 3, background: '#26425b' } })
      .png().toFile(join(root, 'public/backgrounds/wrong.png'));
    await writeFile(configPath, selection('backgrounds/wrong.png'));
    await assert.rejects(prepareScene({ root }), /2:1 panorama/);
    assert.deepEqual(await readFile(manifestPath), previous);
    assert.deepEqual(await readFile(assetPath), asset);
    assert.deepEqual(await readdir(join(root, 'public/generated/background')), filenames);
  }
  await writeFile(join(root, 'public/backgrounds/wrong.png'), 'not a decodable image');
  await assert.rejects(prepareScene({ root }));
  assert.deepEqual(await readFile(manifestPath), previous);
  assert.deepEqual(await readFile(assetPath), asset);
});

test('panorama ratio validation uses oriented dimensions for all EXIF axis-swapping orientations', async t => {
  const root = await project(t);
  const configPath = join(root, 'public/scene.json');
  const manifestPath = join(root, 'public/generated/scene.json');
  await writeFile(configPath, JSON.stringify({ background: { image: 'backgrounds/oriented.jpg', projection: 'equirectangular' } }));
  for (const orientation of [5, 6, 7, 8]) {
    // Stored portrait pixels become a valid horizontal panorama when displayed.
    await sharp({ create: { width: 100, height: 200, channels: 3, background: '#183247' } })
      .jpeg().withMetadata({ orientation }).toFile(join(root, 'public/backgrounds/oriented.jpg'));
    const { manifest } = await prepareScene({ root });
    const meta = await sharp(join(root, 'public', manifest.background.src)).metadata();
    assert.equal(meta.width, 200, `orientation ${orientation}`);
    assert.equal(meta.height, 100, `orientation ${orientation}`);
    assert.equal(meta.orientation, undefined);
    const previous = await readFile(manifestPath);
    // Conversely, these stored 2:1 pixels become portrait and must be rejected.
    await sharp({ create: { width: 200, height: 100, channels: 3, background: '#183247' } })
      .jpeg().withMetadata({ orientation }).toFile(join(root, 'public/backgrounds/oriented.jpg'));
    await assert.rejects(prepareScene({ root }), /2:1 panorama/);
    assert.deepEqual(await readFile(manifestPath), previous);
  }
});

test('cat WebP preserves transparent, translucent and opaque alpha without changing its aspect', async t => {
  const root = await project(t);
  await mkdir(join(root, 'public/characters'));
  const width = 64;
  const height = 48;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 180;
    rgba[offset + 1] = 150;
    rgba[offset + 2] = 120;
    rgba[offset + 3] = x < 16 ? 0 : x < 32 ? 128 : 255;
  }
  const original = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const originalPath = join(root, 'public/characters/cat.png');
  await writeFile(originalPath, original);
  await writeFile(join(root, 'public/scene.json'), JSON.stringify({ cat: { image: 'characters/cat.png' } }));
  const { manifest } = await prepareScene({ root });
  const output = await readFile(join(root, 'public', manifest.cat.src));
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.hasAlpha, true);
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
  const alpha = await sharp(output).extractChannel('alpha').raw().toBuffer();
  for (let pixel = 0; pixel < width * height; pixel++) assert.equal(alpha[pixel], rgba[pixel * 4 + 3]);
  assert.deepEqual(await readFile(originalPath), original);
  assert.equal(readSceneConfig(manifest).cat.src, manifest.cat.src);
  assert.equal(manifest.cat.video, null);
});

test('a local MP4 is copied exactly to a stable generated path; invalid paths preserve the previous video', async t => {
  const root = await project(t);
  await mkdir(join(root, 'public/videos'));
  await writeFile(join(root, 'public/videos/clip.mp4'), tinyMp4);
  const configPath = join(root, 'public/scene.json');
  await writeFile(configPath, JSON.stringify({ cat: { video: 'videos/clip.mp4' } }));
  const first = await prepareScene({ root });
  assert.equal(readSceneConfig(first.manifest).cat.video, first.manifest.cat.video);
  const generatedPath = join(root, 'public', first.manifest.cat.video);
  assert.deepEqual(await readFile(generatedPath), tinyMp4);
  assert.deepEqual(await prepareScene({ root }), first);
  const manifestPath = join(root, 'public/generated/scene.json');
  const previous = await readFile(manifestPath);
  const invalidSelections = [
    'https://example.com/clip.mp4', '/videos/clip.mp4', '../clip.mp4',
    'videos/../clip.mp4', 'videos/sub/clip.mp4', 'videos\\clip.mp4',
    'videos/clip.mp4?download=1', 'videos/clip.mp4#fragment', 'videos/clip.webm', 123,
  ];
  for (const video of invalidSelections) {
    await writeFile(configPath, JSON.stringify({ cat: { video } }));
    await assert.rejects(prepareScene({ root }), /local file directly inside/);
    assert.deepEqual(await readFile(manifestPath), previous);
    assert.deepEqual(await readFile(generatedPath), tinyMp4);
  }
  await writeFile(join(root, 'public/videos/not-video.mp4'), 'an ordinary text document');
  await writeFile(configPath, JSON.stringify({ cat: { video: 'videos/not-video.mp4' } }));
  await assert.rejects(prepareScene({ root }), /real MP4/);
  assert.deepEqual(await readFile(manifestPath), previous);
  assert.deepEqual(await readFile(generatedPath), tinyMp4);
});

test('video symlinks cannot bypass the regular-local-file restriction or replace the working manifest', async t => {
  const root = await project(t);
  await prepareScene({ root });
  const manifestPath = join(root, 'public/generated/scene.json');
  const previous = await readFile(manifestPath);
  await mkdir(join(root, 'public/videos'));
  await mkdir(join(root, 'outside'));
  await writeFile(join(root, 'outside/clip.mp4'), tinyMp4);
  await symlink(join(root, 'outside/clip.mp4'), join(root, 'public/videos/clip.mp4'));
  await writeFile(join(root, 'public/scene.json'), JSON.stringify({ cat: { video: 'videos/clip.mp4' } }));
  await assert.rejects(prepareScene({ root }), /not a symbolic link/);
  assert.deepEqual(await readFile(manifestPath), previous);
  await rm(join(root, 'public/videos'), { recursive: true });
  await symlink(join(root, 'outside'), join(root, 'public/videos'), 'dir');
  await assert.rejects(prepareScene({ root }), /not a symbolic link/);
  assert.deepEqual(await readFile(manifestPath), previous);
  assert.deepEqual(await readFile(join(root, 'outside/clip.mp4')), tinyMp4);
});

test('runtime scene config accepts generated assets and refuses remote, raw, traversing and malformed paths', () => {
  const hash = 'a0123456789bcdef0123';
  const paths = {
    background: `generated/background/night-${hash}.webp`,
    cat: `generated/characters/cat-${hash}.webp`,
    video: `generated/videos/transformation-${hash}.mp4`,
  };
  const valid = readSceneConfig({ background: { src: paths.background }, cat: { src: paths.cat, video: paths.video } });
  assert.equal(valid.background.src, paths.background);
  assert.equal(valid.cat.src, paths.cat);
  assert.equal(valid.cat.video, paths.video);
  for (const path of Object.values(paths)) {
    const invalid = [
      `https://example.com/${path}`, `/${path}`, `../${path}`, `generated/../${path}`,
      path.replaceAll('/', '\\'), `${path}?v=1`, `${path}#preview`, path.replace(hash, 'abc'),
      path.replace(hash, hash.toUpperCase()), 123, { src: path },
    ];
    for (const src of invalid) {
      const config = readSceneConfig({ background: { src }, cat: { src, video: src } });
      assert.equal(config.background.src, null);
      assert.equal(config.cat.src, null);
      assert.equal(config.cat.video, null);
    }
  }
  for (const src of ['backgrounds/night.jpg', 'characters/cat.png', 'videos/clip.mp4']) {
    const config = readSceneConfig({ background: { src }, cat: { src, video: src } });
    assert.equal(config.background.src, null);
    assert.equal(config.cat.src, null);
    assert.equal(config.cat.video, null);
  }
});


test('panorama detail tiles retain native pixels, round-trip through runtime config, and reject unsafe paths', async t => {
  const root = await project(t);
  await sharp({ create: { width: 400, height: 200, channels: 3, background: '#183247' } })
    .png().toFile(join(root, 'public/backgrounds/panorama.png'));
  await sharp({ create: { width: 800, height: 600, channels: 3, background: '#304b72' } })
    .png().toFile(join(root, 'public/backgrounds/castle-detail.png'));
  const config = { background: {
    image: 'backgrounds/panorama.png', projection: 'equirectangular',
    detailTiles: [{ image: 'backgrounds/castle-detail.png', centerU: 0.5, spanU: 1 / 3, minV: 0.25, maxV: 0.75 }],
  } };
  await writeFile(join(root, 'public/scene.json'), JSON.stringify(config));
  const { manifest } = await prepareScene({ root });
  assert.deepEqual(readSceneConfig(manifest).background, manifest.background);
  const tile = manifest.background.detailTiles[0];
  const metadata = await sharp(join(root, 'public', tile.src)).metadata();
  assert.equal(metadata.width, 800);
  assert.equal(metadata.height, 600);
  const previous = await readFile(join(root, 'public/generated/scene.json'));
  config.background.detailTiles[0].image = 'https://example.com/detail.png';
  await writeFile(join(root, 'public/scene.json'), JSON.stringify(config));
  await assert.rejects(prepareScene({ root }), /local file directly inside/);
  assert.deepEqual(await readFile(join(root, 'public/generated/scene.json')), previous);
});

test('detail tile latitude ranges stay nonempty when an upper bound is missing or invalid', async t => {
  const root = await project(t);
  await sharp({ create: { width: 4, height: 2, channels: 3, background: '#183247' } })
    .png().toFile(join(root, 'public/backgrounds/panorama.png'));
  await sharp({ create: { width: 4, height: 3, channels: 3, background: '#304b72' } })
    .png().toFile(join(root, 'public/backgrounds/detail.png'));
  for (const minV of [0.75, 0.9, 0.99]) {
    await writeFile(join(root, 'public/scene.json'), JSON.stringify({ background: {
      image: 'backgrounds/panorama.png', projection: 'equirectangular',
      detailTiles: [{ image: 'backgrounds/detail.png', minV }],
    } }));
    const { manifest } = await prepareScene({ root });
    const built = manifest.background.detailTiles[0];
    assert.ok(built.maxV > built.minV && built.maxV <= 1, 'Build output must not divide by zero in the sky shader');
    for (const maxV of [undefined, null, NaN, Infinity]) {
      const parsed = readSceneConfig({ background: {
        ...manifest.background, detailTiles: [{ ...built, maxV }],
      } }).background.detailTiles[0];
      assert.ok(parsed.maxV > parsed.minV && parsed.maxV <= 1, 'Runtime fallback must keep the latitude range valid');
    }
  }
});

test('eight perspective views retain native pixels and camera projection through asset preparation', async t => {
  const root = await project(t);
  await sharp({ create: { width: 64, height: 32, channels: 3, background: '#183247' } })
    .png().toFile(join(root, 'public/backgrounds/panorama.png'));
  await sharp({ create: { width: 1254, height: 1254, channels: 3, background: '#304b72' } })
    .png().toFile(join(root, 'public/backgrounds/view.png'));
  const config = { background: { image: 'backgrounds/panorama.png', projection: 'equirectangular',
    panels: Array.from({ length: 8 }, (_, i) => ({ image: 'backgrounds/view.png', yaw: 5.4 + 45 * i,
      pitch: -10, horizontalFov: 60, verticalFov: 60 })),
  } };
  await writeFile(join(root, 'public/scene.json'), JSON.stringify(config));
  const { manifest } = await prepareScene({ root });
  assert.deepEqual(readSceneConfig(manifest).background, manifest.background);
  assert.equal(manifest.background.panels.length, 8);
  const panel = manifest.background.panels[0];
  const full = await sharp(join(root, 'public', panel.src)).metadata();
  const compact = await sharp(join(root, 'public', panel.compactSrc)).metadata();
  assert.deepEqual([full.width, full.height], [1254, 1254], 'new pixels must come from independently generated views, never resizing');
  assert.deepEqual([compact.width, compact.height], [1024, 1024]);
  assert.equal(manifest.background.panels[7].yaw, 320.4);
  const previous = await readFile(join(root, 'public/generated/scene.json'));
  config.background.panels[0].horizontalFov = 90;
  await writeFile(join(root, 'public/scene.json'), JSON.stringify(config));
  await assert.rejects(prepareScene({ root }), /stretching is not allowed/);
  assert.deepEqual(await readFile(join(root, 'public/generated/scene.json')), previous);
});
