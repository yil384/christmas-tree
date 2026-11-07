import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fallbackGreeting = '祝集美小喵【zkl】圣诞节快乐';
const clamp = (v, fallback, low, high) => typeof v === 'number' && Number.isFinite(v) ? Math.max(low, Math.min(high, v)) : fallback;

export async function prepareScene({ root = projectRoot } = {}) {
  let config = {};
  try { config = JSON.parse(await readFile(join(root, 'public', 'scene.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read public/scene.json: ' + error.message); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('scene.json must contain an object.');
  const input = config.background && typeof config.background === 'object' ? config.background : {};
  const focus = Array.isArray(input.focus) ? input.focus : [];
  const manifest = {
    version: 1,
    greeting: typeof config.greeting === 'string' && config.greeting.trim() ? config.greeting.trim().slice(0, 160) : fallbackGreeting,
    background: {
      src: null,
      brightness: clamp(input.brightness, 0.52, 0.12, 1),
      focus: [clamp(focus[0], 0.5, 0, 1), clamp(focus[1], 0.42, 0, 1)],
    },
    snow: typeof config.snow === 'boolean' ? config.snow : true,
  };
  let filename = null;
  let imageBytes = 0;
  let optimized = null;
  if (input.image !== null && input.image !== undefined && input.image !== '') {
    if (typeof input.image !== 'string' || !/^backgrounds\/[^/\\]+\.(?:jpe?g|png|webp|avif|svg)$/i.test(input.image)) {
      throw new Error('Background must be a local image directly inside public/backgrounds/.');
    }
    const directory = join(root, 'public', 'backgrounds');
    const file = join(root, 'public', input.image);
    const [directoryInfo, fileInfo] = await Promise.all([lstat(directory), lstat(file)]);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || !fileInfo.isFile() || fileInfo.isSymbolicLink()) {
      throw new Error('Background must be a regular local file, not a symbolic link.');
    }
    const source = await readFile(file);
    const hash = createHash('sha256').update('night-webp-v1-1920-78').update(source).digest('hex').slice(0, 20);
    filename = 'night-' + hash + '.webp';
    // Keep the long edge bounded, strip EXIF, and orient phone photos correctly.
    optimized = await sharp(source, { limitInputPixels: 64_000_000 }).rotate()
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78, effort: 5 }).toBuffer();
    imageBytes = optimized.length;
    manifest.background.src = 'generated/background/' + filename;
  }
  const output = join(root, 'public', 'generated');
  const images = join(output, 'background');
  await mkdir(images, { recursive: true });
  if (optimized && filename) {
    await writeFile(join(images, filename + '.tmp'), optimized);
    await rename(join(images, filename + '.tmp'), join(images, filename));
  }
  await writeFile(join(output, 'scene.json.tmp'), JSON.stringify(manifest, null, 2) + '\n');
  await rename(join(output, 'scene.json.tmp'), join(output, 'scene.json'));
  for (const name of await readdir(images)) {
    if (/^night-[a-f0-9]{20}\.webp$/.test(name) && name !== filename) await rm(join(images, name));
  }
  return { manifest, imageBytes };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareScene().then(({ imageBytes }) => console.log('Prepared scene background: ' + (imageBytes / 1024).toFixed(1) + ' KiB.'))
    .catch(error => { console.error('Scene preparation failed: ' + error.message); process.exitCode = 1; });
}
