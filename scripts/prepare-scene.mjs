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
  const catInput = config.cat && typeof config.cat === 'object' ? config.cat : {};
  const manifest = {
    version: 1,
    greeting: typeof config.greeting === 'string' && config.greeting.trim() ? config.greeting.trim().slice(0, 160) : fallbackGreeting,
    background: {
      src: null,
      brightness: clamp(input.brightness, 0.52, 0.12, 1),
      focus: [clamp(focus[0], 0.5, 0, 1), clamp(focus[1], 0.42, 0, 1)],
      projection: input.projection === 'equirectangular' ? 'equirectangular' : input.projection === 'perspective' ? 'perspective' : 'image',
      rotation: clamp(input.rotation, 0, -360, 360),
      ...(typeof input.groundColor === 'string' && /^#[a-f0-9]{6}$/i.test(input.groundColor) ? { groundColor: input.groundColor } : {}),
    },
    snow: typeof config.snow === 'boolean' ? config.snow : true,
    cat: { src: null, video: null },
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
    const panorama = manifest.background.projection === 'equirectangular';
    if (panorama) {
      const metadata = await sharp(source).metadata();
      const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation);
      const width = swapsAxes ? metadata.height : metadata.width;
      const height = swapsAxes ? metadata.width : metadata.height;
      if (Math.abs(width / height - 2) > 0.025) {
        throw new Error('An equirectangular background must be a 2:1 panorama, not an ordinary perspective photo.');
      }
    }
    const longEdge = panorama ? 8192 : 4096;
    const quality = 95;
    const hash = createHash('sha256').update(`night-webp-v2-${longEdge}-${quality}`).update(source).digest('hex').slice(0, 20);
    filename = 'night-' + hash + '.webp';
    // Keep the long edge bounded, strip EXIF, and orient phone photos correctly.
    optimized = await sharp(source, { limitInputPixels: 64_000_000 }).rotate()
      .resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 5 }).toBuffer();
    imageBytes = optimized.length;
    manifest.background.src = 'generated/background/' + filename;
  }
  // Validate every optional asset before replacing the last working manifest.
  const extras = [];
  const readLocal = async (selection, folder, pattern, label) => {
    if (typeof selection !== 'string' || !pattern.test(selection)) {
      throw new Error(`${label} must be a local file directly inside public/${folder}/.`);
    }
    const [directoryInfo, info] = await Promise.all([lstat(join(root, 'public', folder)), lstat(join(root, 'public', selection))]);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || !info.isFile() || info.isSymbolicLink()) {
      throw new Error(`${label} must be a regular local file, not a symbolic link.`);
    }
    if (info.size > 24 * 1024 * 1024) throw new Error(`${label} exceeds the 24 MiB per-file limit; compress it before publishing.`);
    return readFile(join(root, 'public', selection));
  };
  if (input.detailTiles !== undefined) {
    if (manifest.background.projection !== 'equirectangular' || !Array.isArray(input.detailTiles) || input.detailTiles.length > 4) {
      throw new Error('Panorama detailTiles must be an array of at most four images on an equirectangular background.');
    }
    const tiles = [];
    for (const tile of input.detailTiles) {
      if (!tile || typeof tile !== 'object') throw new Error('Each panorama detail tile must be an object.');
      const source = await readLocal(tile.image, 'backgrounds', /^backgrounds\/[^/\\]+\.(?:png|jpe?g|webp|avif)$/i, 'Panorama detail image');
      const hash = createHash('sha256').update('panorama-detail-v1-3072-95').update(source).digest('hex').slice(0, 20);
      const name = `detail-${hash}.webp`;
      const data = await sharp(source, { limitInputPixels: 32_000_000 }).rotate()
        .resize({ width: 3072, height: 3072, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 95, effort: 5 }).toBuffer();
      const minV = clamp(tile.minV, 0.25, 0, 0.99);
      const maxV = clamp(tile.maxV, Math.max(0.75, minV + 0.01), minV + 0.01, 1);
      extras.push({ folder: 'background', name, data });
      tiles.push({ src: `generated/background/${name}`, centerU: clamp(tile.centerU, 0.5, 0, 1), spanU: clamp(tile.spanU, 1 / 3, 0.01, 1), minV, maxV });
    }
    if (tiles.length) manifest.background.detailTiles = tiles;
  }
  if (input.panels !== undefined) {
    if (manifest.background.projection !== 'equirectangular' || !Array.isArray(input.panels) || input.panels.length > 8) {
      throw new Error('Background panels must be an array of at most eight perspective views on an equirectangular background.');
    }
    const panels = [];
    for (const panel of input.panels) {
      if (!panel || typeof panel !== 'object') throw new Error('Each background perspective panel must be an object.');
      const source = await readLocal(panel.image, 'backgrounds', /^backgrounds\/[^/\\]+\.(?:png|jpe?g|webp|avif)$/i, 'Perspective panel image');
      const yaw = clamp(panel.yaw, 0, -360, 360), pitch = clamp(panel.pitch, -10, -60, 60);
      const horizontalFov = clamp(panel.horizontalFov, 60, 30, 100), verticalFov = clamp(panel.verticalFov, 60, 30, 100);
      const metadata = await sharp(source).metadata();
      const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation);
      const aspect = swapsAxes ? metadata.height / metadata.width : metadata.width / metadata.height;
      const lensAspect = Math.tan(horizontalFov * Math.PI / 360) / Math.tan(verticalFov * Math.PI / 360);
      if (Math.abs(aspect / lensAspect - 1) > 0.01) {
        throw new Error('A perspective panel image must match its horizontal/vertical camera field of view; stretching is not allowed.');
      }
      const hash = createHash('sha256').update('perspective-panel-v1-2048-96').update(source).digest('hex').slice(0, 20);
      const name = `panel-${hash}.webp`, compactName = `panel-small-${hash}.webp`;
      const full = await sharp(source, { limitInputPixels: 32_000_000 }).rotate()
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 96, effort: 5 }).toBuffer({ resolveWithObject: true });
      const compact = await sharp(source, { limitInputPixels: 32_000_000 }).rotate()
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 94, effort: 5 }).toBuffer();
      extras.push({ folder: 'background', name, data: full.data }, { folder: 'background', name: compactName, data: compact });
      panels.push({ src: `generated/background/${name}`, compactSrc: `generated/background/${compactName}`,
        width: full.info.width, height: full.info.height, yaw, pitch, horizontalFov, verticalFov });
    }
    if (panels.length) manifest.background.panels = panels;
  }
  if (catInput.image) {
    const source = await readLocal(catInput.image, 'characters', /^characters\/[^/\\]+\.(?:png|webp|avif)$/i, 'Cat image');
    const hash = createHash('sha256').update('cat-alpha-webp-v2-2048-96').update(source).digest('hex').slice(0, 20);
    const name = `cat-${hash}.webp`;
    const data = await sharp(source, { limitInputPixels: 32_000_000 }).rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 96, alphaQuality: 100, effort: 5 }).toBuffer();
    extras.push({ folder: 'characters', name, data });
    manifest.cat.src = `generated/characters/${name}`;
  }
  if (catInput.video) {
    const data = await readLocal(catInput.video, 'videos', /^videos\/[^/\\]+\.mp4$/i, 'Transformation video');
    if (data.length < 12 || data.toString('ascii', 4, 8) !== 'ftyp') throw new Error('Transformation video must be a real MP4 file.');
    const hash = createHash('sha256').update(data).digest('hex').slice(0, 20);
    const name = `transformation-${hash}.mp4`;
    extras.push({ folder: 'videos', name, data });
    manifest.cat.video = `generated/videos/${name}`;
  }
  const output = join(root, 'public', 'generated');
  const images = join(output, 'background');
  await mkdir(images, { recursive: true });
  if (optimized && filename) {
    await writeFile(join(images, filename + '.tmp'), optimized);
    await rename(join(images, filename + '.tmp'), join(images, filename));
  }
  for (const asset of extras) {
    const folder = join(output, asset.folder);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, asset.name + '.tmp'), asset.data);
    await rename(join(folder, asset.name + '.tmp'), join(folder, asset.name));
  }
  await writeFile(join(output, 'scene.json.tmp'), JSON.stringify(manifest, null, 2) + '\n');
  await rename(join(output, 'scene.json.tmp'), join(output, 'scene.json'));
  for (const name of await readdir(images)) {
    if (/^(?:night|detail|panel|panel-small)-[a-f0-9]{20}\.webp$/.test(name) && name !== filename
      && !extras.some(asset => asset.folder === 'background' && asset.name === name)) await rm(join(images, name));
  }
  for (const folder of ['characters', 'videos']) {
    await mkdir(join(output, folder), { recursive: true });
    for (const name of await readdir(join(output, folder))) {
      if (/^(?:cat|transformation)-[a-f0-9]{20}\.(?:webp|mp4)$/.test(name)
        && !extras.some(asset => asset.folder === folder && asset.name === name)) await rm(join(output, folder, name));
    }
  }
  return { manifest, imageBytes };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareScene().then(({ imageBytes }) => console.log('Prepared scene background: ' + (imageBytes / 1024).toFixed(1) + ' KiB.'))
    .catch(error => { console.error('Scene preparation failed: ' + error.message); process.exitCode = 1; });
}
