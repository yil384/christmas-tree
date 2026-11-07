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
  assert.equal(result.manifest.photos[0].width, 800);
  assert.equal(result.manifest.photos[0].height, 1600);
  assert.deepEqual(await readFile(source), original);
  const entry = result.manifest.photos[0];
  const thumb = await sharp(join(root, 'public', entry.thumbnail)).metadata();
  const full = await sharp(join(root, 'public', entry.src)).metadata();
  assert.equal(thumb.width, 160);
  assert.equal(thumb.height, 320);
  assert.equal(thumb.format, 'webp');
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
