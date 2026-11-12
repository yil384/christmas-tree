import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
  await rm(join(dist, 'backgrounds'), { recursive: true, force: true });
  await rm(join(dist, 'characters'), { recursive: true, force: true });
  await rm(join(dist, 'videos'), { recursive: true, force: true });
  // The former confession entry is no longer reachable. Keep its source
  // assets in public for history, but do not ship its obsolete films or
  // unattached image imports with the current ride and Christmas routes.
  await rm(join(dist, 'princess'), { recursive: true, force: true });
  await rm(join(dist, 'hd-assets'), { recursive: true, force: true });
  await rm(join(dist, 'scene.json'), { force: true });
  await rm(starterIcon, { force: true });
  // An interrupted photo preparation can leave its private staging directory
  // under public/generated. Vite copies it, but it is never a published asset.
  const generated = join(dist, 'generated');
  if (await exists(generated)) {
    const generatedInfo = await lstat(generated);
    if (generatedInfo.isDirectory() && !generatedInfo.isSymbolicLink()) {
      for (const entry of await readdir(generated, { withFileTypes: true })) {
        if (/^\.photos-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(entry.name)) {
          await rm(join(generated, entry.name), { recursive: true, force: true });
        }
      }
    }
  }
  // These are real static entry files, so shared links and refreshes do not
  // depend on a hosting provider's SPA fallback. Vite emits root asset URLs.
  const entry = await readFile(join(dist, 'index.html'), 'utf8');
  for (const route of ['letter', 'christmas']) {
    await mkdir(join(dist, route), { recursive: true });
    const html = route === 'christmas' ? entry
      .replaceAll('月光秘境 · 思仪', '集美小喵的圣诞魔法')
      .replaceAll('给谭陈思仪的城堡巡游，和一句我喜欢你。', '送给集美小喵的圣诞魔法：城堡、星光与照片圣诞树。')
      .replace('https://tanchensiyi.com/journey/cover.webp', 'https://tanchensiyi.com/film/starlight-return-poster.webp')
      .replace('property="og:url" content="https://tanchensiyi.com/"', 'property="og:url" content="https://tanchensiyi.com/christmas/"')
      .replace(/<noscript>[\s\S]*?<\/noscript>/, '<noscript><main style="padding:20vh 8vw;text-align:center"><h1>集美小喵的圣诞魔法</h1><p>请启用 JavaScript 来打开照片圣诞树。</p></main></noscript>')
      : entry.replace('property="og:url" content="https://tanchensiyi.com/"', 'property="og:url" content="https://tanchensiyi.com/letter/"');
    await writeFile(join(dist, route, 'index.html'), html);
  }
  return { removedPhotos, removedStarterIcon };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  finalizeBuild().then(() => {
    console.log('Build finalized: source photos/backgrounds excluded; generated WebP images retained.');
  }).catch(error => {
    console.error(`Build finalization failed: ${error.message}`);
    process.exitCode = 1;
  });
}
