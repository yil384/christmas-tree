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
  for (const path of ['dist/photos/original.jpg', 'dist/vite.svg']) {
    await assert.rejects(readFile(join(root, path)), { code: 'ENOENT' });
  }
  for (const path of Object.keys(fixtures).filter(path => !['dist/photos/original.jpg', 'dist/vite.svg'].includes(path))) {
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

test('a symlinked dist directory is rejected without touching its target', async t => {
  const root = await temporaryProject(t);
  await mkdir(join(root, 'unrelated', 'photos'), { recursive: true });
  await writeFile(join(root, 'unrelated', 'index.html'), 'other site');
  await writeFile(join(root, 'unrelated', 'photos', 'keep.jpg'), 'keep');
  await symlink(join(root, 'unrelated'), join(root, 'dist'), 'dir');
  await assert.rejects(finalizeBuild({ root }), /Expected a real dist directory/);
  assert.equal(await readFile(join(root, 'unrelated', 'photos', 'keep.jpg'), 'utf8'), 'keep');
});
