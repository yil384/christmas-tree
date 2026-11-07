import { lstat, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Finish Vite output without ever modifying source photos or generated WebP assets. */
export async function finalizeBuild({ root = projectRoot } = {}) {
  const dist = join(root, 'dist');
  let directory;
  let index;
  try {
    directory = await lstat(dist);
    index = await lstat(join(dist, 'index.html'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Build output dist/index.html is missing. Run the Vite build before finalizing.');
    }
    throw error;
  }
  if (!directory.isDirectory() || directory.isSymbolicLink() || !index.isFile() || index.isSymbolicLink()) {
    throw new Error('Expected a real dist directory containing a regular index.html file.');
  }

  // Keep these paths explicit: never accept an arbitrary directory to remove.
  const originals = join(dist, 'photos');
  const starterIcon = join(dist, 'vite.svg');
  const removedPhotos = await exists(originals);
  const removedStarterIcon = await exists(starterIcon);
  await rm(originals, { recursive: true, force: true });
  await rm(starterIcon, { force: true });
  return { removedPhotos, removedStarterIcon };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  finalizeBuild().then(() => {
    console.log('Build finalized: original photos excluded from dist; generated WebP images retained.');
  }).catch(error => {
    console.error(`Build finalization failed: ${error.message}`);
    process.exitCode = 1;
  });
}
