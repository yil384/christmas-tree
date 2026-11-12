import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preparePhotos, selectPhotos, sortPhotoFiles } from '../scripts/prepare-photos.mjs';

test('photo discovery sorts top first and numbers naturally, supports arbitrary filenames', () => {
  assert.deepEqual(sortPhotoFiles(['10.jpg', '2.JPG', 'notes.txt', '海边 1.png', 'top.jpg', '1.avif']),
    ['top.jpg', '1.avif', '2.JPG', '10.jpg', '海边 1.png']);
});

test('an optional manifest preserves order, captions, alt text, and explicit empty selection', () => {
  const files = ['1.jpg', '2.jpg', 'top.jpg'];
  assert.deepEqual(selectPhotos(files, { photos: ['2.jpg', { file: '1.jpg', caption: '  冬日  ', alt: '  海边  ' }] }),
    [{ file: '2.jpg', alt: '圣诞回忆 1' }, { file: '1.jpg', alt: '海边', caption: '冬日' }]);
  assert.deepEqual(selectPhotos(files, { photos: [] }), []);
  assert.equal(selectPhotos(files)[0].file, 'top.jpg');
});

test('malformed manifest, missing images, duplicates and path traversal are rejected', () => {
  for (const manifest of [[], {}, null, { photos: [null] }, { photos: ['missing.jpg'] }, { photos: ['1.jpg', '1.jpg'] },
    { photos: ['../1.jpg'] }, { photos: ['/1.jpg'] }, { photos: ['..\\1.jpg'] },
    { photos: [{ file: '1.jpg', caption: 42 }] }]) {
    assert.throws(() => selectPhotos(['1.jpg'], manifest));
  }
});

test('zero photos builds successfully and removes only previous generated photos', async t => {
  const root = await mkdtemp(join(tmpdir(), 'christmas-empty-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'public', 'generated', 'photos'), { recursive: true });
  await writeFile(join(root, 'public', 'generated', 'photos', '1234567890abcdef1234.webp'), 'old');
  await writeFile(join(root, 'public', 'generated', 'photos', 'README.txt'), 'keep');
  const result = await preparePhotos({ root });
  assert.equal(result.count, 0);
  assert.deepEqual(result.manifest, { version: 1, photos: [] });
  assert.deepEqual(await readdir(join(root, 'public', 'generated', 'photos')), ['README.txt']);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'public', 'generated', 'photo-manifest.json'))), result.manifest);
});

test('real image pipeline limits sizes, fixes orientation, strips metadata, preserves originals and is repeatable', async t => {
  let sharp;
  try { sharp = (await import('sharp')).default; }
  catch { t.skip('Install devDependencies to run image encoding checks.'); return; }
  const root = await mkdtemp(join(tmpdir(), 'christmas-photos-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'public', 'photos'), { recursive: true });
  const original = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#0b3828' } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const source = join(root, 'public', 'photos', '回忆 1.jpg');
  await writeFile(source, original);
  const result = await preparePhotos({ root, imageProcessor: sharp });
  assert.equal(result.count, 1);
  assert.equal(result.manifest.photos[0].width, 1000);
  assert.equal(result.manifest.photos[0].height, 2000);
  assert.deepEqual(await readFile(source), original);
  const entry = result.manifest.photos[0];
  const thumb = await sharp(join(root, 'public', entry.thumbnail)).metadata();
  const full = await sharp(join(root, 'public', entry.src)).metadata();
  const card = await sharp(join(root, 'public', entry.ornament)).metadata();
  assert.equal(card.width, 384);
  assert.equal(card.height, 384);
  assert.equal(thumb.width, 160);
  assert.equal(thumb.height, 320);
  assert.equal(thumb.format, 'webp');
  assert.equal(full.width, 1000);
  assert.equal(full.height, 2000, 'the full-size viewer must receive all original oriented pixels, not a thumbnail');
  assert.equal(full.exif, undefined);
  assert.equal(full.orientation, undefined);
  assert.deepEqual((await preparePhotos({ root, imageProcessor: sharp })).manifest, result.manifest);
  await writeFile(join(root, 'public', 'photos', 'manifest.json'), JSON.stringify({ photos: [] }));
  assert.equal((await preparePhotos({ root, imageProcessor: sharp })).count, 0);
  assert.equal((await readdir(join(root, 'public', 'generated', 'photos'))).length, 0);
  assert.deepEqual(await readFile(source), original);
});

test('a corrupt image fails with its filename while leaving the previous manifest unchanged', async t => {
  let sharp;
  try { sharp = (await import('sharp')).default; }
  catch { t.skip('Install devDependencies to run image encoding checks.'); return; }
  const root = await mkdtemp(join(tmpdir(), 'christmas-corrupt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'public', 'photos'), { recursive: true });
  await writeFile(join(root, 'public', 'photos', 'good.png'), await sharp({ create: { width: 32, height: 16, channels: 3, background: '#ffffff' } }).png().toBuffer());
  const good = await preparePhotos({ root, imageProcessor: sharp });
  // Small originals must not be enlarged.
  assert.equal(good.manifest.photos[0].width, 32);
  assert.equal(good.manifest.photos[0].height, 16);
  await writeFile(join(root, 'public', 'photos', 'broken.jpg'), 'not an image');
  await assert.rejects(preparePhotos({ root, imageProcessor: sharp }), /broken\.jpg/);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'public', 'generated', 'photo-manifest.json'))), good.manifest);
});


test('one atlas preserves photo order, UV orientation and border pixels; warm builds skip all encoding', async t => {
  const sharp = (await import('sharp')).default;
  const root = await mkdtemp(join(tmpdir(), 'christmas-atlas-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const photos = join(root, 'public', 'photos');
  await mkdir(photos, { recursive: true });
  const colors = [[220, 30, 30], [25, 190, 55], [40, 65, 220], [215, 190, 35], [170, 45, 190]];
  for (const [index, [r, g, b]] of colors.entries()) {
    await writeFile(join(photos, `${index}.png`), await sharp({ create: {
      width: 96, height: 64, channels: 3, background: { r, g, b },
    } }).png().toBuffer());
  }
  const selection = [4, 1, 3, 0, 2].map(index => ({ file: `${index}.png`, caption: `Memory ${index}` }));
  await writeFile(join(photos, 'manifest.json'), JSON.stringify({ photos: selection }));
  const first = await preparePhotos({ root, imageProcessor: sharp });
  assert.equal(first.reusedPhotos, 0);
  const atlasPaths = new Set(first.manifest.photos.map(photo => photo.atlas.src));
  assert.equal(atlasPaths.size, 1, 'Every initial card must use the same network resource');
  const atlasPath = join(root, 'public', [...atlasPaths][0]);
  const atlas = await sharp(atlasPath).raw().toBuffer({ resolveWithObject: true });
  assert.equal(atlas.info.width, 1152);
  assert.equal(atlas.info.height, 768, 'The final atlas has no unused power-of-two area');
  const pixel = (x, y) => Array.from(atlas.data.subarray(
    (y * atlas.info.width + x) * atlas.info.channels,
    (y * atlas.info.width + x) * atlas.info.channels + 3,
  ));
  for (const [index, photo] of first.manifest.photos.entries()) {
    const [u, v, w, h] = photo.atlas.rect;
    const x = Math.floor((u + w / 2) * atlas.info.width);
    const y = Math.floor((1 - v - h / 2) * atlas.info.height);
    const expected = colors[Number(selection[index].file.split('.')[0])];
    for (const sampled of [pixel(x, y), pixel(Math.floor(u * atlas.info.width) - 4, y)]) {
      assert.ok(sampled.every((value, channel) => Math.abs(value - expected[channel]) <= 8),
        `Wrong atlas tile or gutter for photo ${index}: ${sampled} vs ${expected}`);
    }
    assert.equal(photo.caption, selection[index].caption);
    assert.equal(photo.width, 96);
    assert.equal(photo.height, 64);
    assert.notEqual(photo.src, photo.atlas.src, 'Full-size gallery content remains independent');
  }
  const mustNotEncode = () => { throw new Error('Warm preparation encoded an unchanged image'); };
  const warm = await preparePhotos({ root, imageProcessor: mustNotEncode });
  assert.equal(warm.reusedPhotos, 5);
  assert.equal(warm.atlasBytes, first.atlasBytes);
  assert.deepEqual(warm.manifest, first.manifest);

  // Missing derivative files must be repaired without rebuilding the album.
  await rm(join(root, 'public', first.manifest.photos[2].thumbnail));
  const repaired = await preparePhotos({ root, imageProcessor: sharp });
  assert.equal(repaired.reusedPhotos, 4);
  assert.deepEqual(repaired.manifest, first.manifest);

  // A source change invalidates its three derivatives and the shared atlas.
  await writeFile(join(photos, '4.png'), await sharp({ create: {
    width: 72, height: 48, channels: 3, background: '#112233',
  } }).png().toBuffer());
  const changed = await preparePhotos({ root, imageProcessor: sharp });
  assert.equal(changed.reusedPhotos, 4);
  assert.notEqual(changed.manifest.photos[0].id, first.manifest.photos[0].id);
  assert.notEqual(changed.manifest.photos[0].atlas.src, first.manifest.photos[0].atlas.src);
  assert.equal(changed.manifest.photos[0].width, 72);
  await assert.rejects(readFile(atlasPath), { code: 'ENOENT' });
});
