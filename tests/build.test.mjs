import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalizeBuild } from '../scripts/finalize-build.mjs';

async function temporaryProject(t) {
  const root = await mkdtemp(join(tmpdir(), 'christmas-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('finalizing excludes deployed originals while preserving source photos, generated images and CNAME', async t => {
  const root = await temporaryProject(t);
  const fixtures = {
    'dist/index.html': '<html>gift</html>',
    'dist/photos/original.jpg': 'large-original',
    'dist/vite.svg': 'starter',
    'dist/backgrounds/night.jpg': 'large-night-original',
    'dist/scene.json': 'source-config',
    'dist/generated/background/night.webp': 'small-night-image',
    'dist/generated/scene.json': 'prepared-scene',
    'public/backgrounds/night.jpg': 'source-night-original',
    'public/scene.json': 'source-scene',
    'dist/generated/photos/compressed.webp': 'small-display-image',
    'dist/generated/photo-manifest.json': '{"version":1,"photos":[]}',
    'dist/CNAME': 'www.weiyirao.com',
    'public/photos/original.jpg': 'source-original',
    'public/vite.svg': 'source-starter',
  };
  for (const [path, content] of Object.entries(fixtures)) {
    const absolute = join(root, path);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, content);
  }
  assert.deepEqual(await finalizeBuild({ root }), { removedPhotos: true, removedStarterIcon: true });
  for (const path of ['dist/photos/original.jpg', 'dist/vite.svg', 'dist/backgrounds/night.jpg', 'dist/scene.json']) {
    await assert.rejects(readFile(join(root, path)), { code: 'ENOENT' });
  }
  for (const path of Object.keys(fixtures).filter(path => !['dist/photos/original.jpg', 'dist/vite.svg', 'dist/backgrounds/night.jpg', 'dist/scene.json'].includes(path))) {
    assert.equal(await readFile(join(root, path), 'utf8'), fixtures[path]);
  }
  assert.deepEqual(await finalizeBuild({ root }), { removedPhotos: false, removedStarterIcon: false });
});

test('missing build output fails before deleting anything', async t => {
  const root = await temporaryProject(t);
  await assert.rejects(finalizeBuild({ root }), /dist\/index\.html is missing/);
  await mkdir(join(root, 'dist', 'photos'), { recursive: true });
  await writeFile(join(root, 'dist', 'photos', 'keep.jpg'), 'keep');
  await assert.rejects(finalizeBuild({ root }), /dist\/index\.html is missing/);
  assert.equal(await readFile(join(root, 'dist', 'photos', 'keep.jpg'), 'utf8'), 'keep');
});

test('interrupted photo staging is excluded while source staging and published media survive', async t => {
  const root = await temporaryProject(t);
  const staging = '.photos-69e61d96-6886-4b15-8dea-3fb0301da10e/unfinished.webp';
  const paths = ['dist/index.html', `dist/generated/${staging}`, `public/generated/${staging}`,
    'dist/generated/photos/final.webp', 'dist/generated/videos/final.mp4', 'dist/video-posters/christmas-film.webp'];
  for (const path of paths) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), path);
  }
  await finalizeBuild({ root });
  await assert.rejects(readFile(join(root, 'dist/generated', staging)), { code: 'ENOENT' });
  for (const path of paths.filter(path => path !== `dist/generated/${staging}`)) {
    assert.equal(await readFile(join(root, path), 'utf8'), path);
  }
});

test('a symlinked dist directory is rejected without touching its target', async t => {
  const root = await temporaryProject(t);
  await mkdir(join(root, 'unrelated', 'photos'), { recursive: true });
  await writeFile(join(root, 'unrelated', 'index.html'), 'other site');
  await writeFile(join(root, 'unrelated', 'photos', 'keep.jpg'), 'keep');
  await symlink(join(root, 'unrelated'), join(root, 'dist'), 'dir');
  await assert.rejects(finalizeBuild({ root }), /Expected a real dist directory/);
  assert.equal(await readFile(join(root, 'unrelated', 'photos', 'keep.jpg'), 'utf8'), 'keep');
});
