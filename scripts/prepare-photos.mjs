import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const naturalOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const pipelineVersion = 'webp-v2-thumb320-q86-card384-q94-photo-native-q94';
const atlasVersion = 'webp-atlas-v1-tile384-gutter8-q84';
const ATLAS_GUTTER = 8;
const MAX_ATLAS_SIZE = 4096;

export function isSupportedPhoto(file) {
  return typeof file === 'string' && supportedExtensions.has(extname(file).toLowerCase());
}

/** Original files stay in public/photos. Only generated files are overwritten. */
export function sortPhotoFiles(files) {
  return [...files].filter(isSupportedPhoto).sort((a, b) => {
    const aTop = a.slice(0, -extname(a).length).toLowerCase() === 'top';
    const bTop = b.slice(0, -extname(b).length).toLowerCase() === 'top';
    return Number(bTop) - Number(aTop) || naturalOrder.compare(a, b) || a.localeCompare(b);
  });
}

function safeFileName(file) {
  return typeof file === 'string' && file.length > 0 &&
    !isAbsolute(file) && !file.includes('/') && !file.includes('\\') &&
    !file.includes('\0') && file !== '.' && file !== '..' && isSupportedPhoto(file);
}

/**
 * Optional manifest: { "photos": ["top.jpg", { "file": "winter.jpg", "caption": "...", "alt": "..." }] }
 * An explicit empty list intentionally creates a photo-free gift.
 */
export function selectPhotos(files, manifest) {
  const available = new Set(files.filter(isSupportedPhoto));
  if (manifest === undefined) {
    return sortPhotoFiles([...available]).map((file, index) => ({ file, alt: `圣诞回忆 ${index + 1}` }));
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Array.isArray(manifest.photos)) {
    throw new Error('photos/manifest.json must contain a "photos" array.');
  }
  const seen = new Set();
  return manifest.photos.map((entry, index) => {
    const item = typeof entry === 'string' ? { file: entry } : entry;
    if (!item || typeof item !== 'object' || Array.isArray(item) || !safeFileName(item.file)) {
      throw new Error(`photos/manifest.json entry ${index + 1}: use an image filename from public/photos (no paths).`);
    }
    if (!available.has(item.file)) {
      throw new Error(`photos/manifest.json entry ${index + 1}: file "${item.file}" is missing or is not a regular image file.`);
    }
    if (seen.has(item.file)) {
      throw new Error(`photos/manifest.json contains the same file more than once: "${item.file}".`);
    }
    seen.add(item.file);
    for (const key of ['alt', 'caption']) {
      if (item[key] !== undefined && typeof item[key] !== 'string') {
        throw new Error(`photos/manifest.json entry ${index + 1}: "${key}" must be text.`);
      }
    }
    return {
      file: item.file,
      alt: item.alt?.trim() || item.caption?.trim() || `圣诞回忆 ${index + 1}`,
      ...(item.caption?.trim() ? { caption: item.caption.trim() } : {}),
    };
  });
}

async function readOptionalManifest(path) {
  let contents;
  try { contents = await readFile(path, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  try { return JSON.parse(contents); }
  catch { throw new Error(`Invalid JSON in ${path}. Check commas and quotation marks.`); }
}

async function loadSharp() {
  try { return (await import('sharp')).default; }
  catch {
    throw new Error('Photo preparation needs the sharp development dependency. Run npm install before npm run photos.');
  }
}

export async function preparePhotos({ root = process.cwd(), imageProcessor } = {}) {
  const photosDirectory = join(root, 'public', 'photos');
  const generatedDirectory = join(root, 'public', 'generated');
  const outputDirectory = join(generatedDirectory, 'photos');
  await mkdir(photosDirectory, { recursive: true });
  const entries = await readdir(photosDirectory, { withFileTypes: true });
  // Never follow symlinks into unrelated local files.
  const files = entries.filter(entry => entry.isFile() && isSupportedPhoto(entry.name)).map(entry => entry.name);
  const selected = selectPhotos(files, await readOptionalManifest(join(photosDirectory, 'manifest.json')));
  const sharp = selected.length ? imageProcessor ?? await loadSharp() : undefined;
  await mkdir(generatedDirectory, { recursive: true });
  const staging = join(generatedDirectory, `.photos-${randomUUID()}`);
  await mkdir(staging);
  const manifestPath = join(generatedDirectory, 'photo-manifest.json');
  const previous = await readOptionalManifest(manifestPath).catch(() => undefined);
  const previousPhotos = new Map((Array.isArray(previous?.photos) ? previous.photos : []).map(photo => [photo.id, photo]));
  const manifest = { version: 1, photos: [] };
  const wanted = new Set();
  const cardPaths = [];
  let reusedPhotos = 0;
  let atlasBytes = 0;
  let sourceBytes = 0;
  let thumbnailBytes = 0;
  let displayBytes = 0;

  try {
    const realSourceRoot = await realpath(photosDirectory);
    // Sequential processing caps peak memory even for large collections.
    for (const photo of selected) {
      const sourcePath = join(photosDirectory, photo.file);
      const resolvedSource = await realpath(sourcePath);
      const sourceRelative = relative(realSourceRoot, resolvedSource);
      if (sourceRelative === '..' || sourceRelative.startsWith(`..${sep}`) || isAbsolute(sourceRelative)) {
        throw new Error(`Image "${photo.file}" resolves outside public/photos.`);
      }
      const original = await readFile(sourcePath);
      const id = createHash('sha256').update(pipelineVersion).update(photo.file).update(original).digest('hex').slice(0, 20);
      const thumbnailName = `${id}-thumb.webp`;
      const displayName = `${id}.webp`;
      const ornamentName = `${id}-card.webp`;
      try {
        const names = [thumbnailName, displayName, ornamentName];
        names.forEach(name => wanted.add(name));
        const cached = previousPhotos.get(id);
        const cachedFiles = cached && Number.isFinite(cached.width) && Number.isFinite(cached.height)
          ? await Promise.all(names.map(name => stat(join(outputDirectory, name)).catch(() => null)))
          : [];
        let thumbnail, display;
        if (cachedFiles.length === 3 && cachedFiles.every(file => file?.isFile() && file.size > 0)) {
          // Content-addressed files survive predev/prebuild. Metadata comes from
          // the matching original hash, so gallery dimensions remain unchanged.
          thumbnail = { size: cachedFiles[0].size };
          display = { size: cachedFiles[1].size, width: cached.width, height: cached.height };
          cardPaths.push(join(outputDirectory, ornamentName));
          reusedPhotos++;
        } else {
          // rotate() applies EXIF orientation; metadata is stripped by default.
          const base = sharp(original, { failOn: 'error', limitInputPixels: 64_000_000 }).rotate();
          thumbnail = await base.clone()
            .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 86, effort: 4 }).toFile(join(staging, thumbnailName));
          // Full native pixels are retained and requested only by the gallery.
          display = await base.clone().webp({ quality: 94, effort: 4 }).toFile(join(staging, displayName));
          await base.clone().resize({ width: 384, height: 384, fit: 'cover', position: 'centre', withoutEnlargement: true })
            .webp({ quality: 94, effort: 4 }).toFile(join(staging, ornamentName));
          cardPaths.push(join(staging, ornamentName));
        }
        sourceBytes += original.length;
        thumbnailBytes += thumbnail.size;
        displayBytes += display.size;
        manifest.photos.push({
          id,
          src: `generated/photos/${displayName}`,
          thumbnail: `generated/photos/${thumbnailName}`,
          ornament: `generated/photos/${ornamentName}`,
          width: display.width,
          height: display.height,
          alt: photo.alt,
          ...(photo.caption ? { caption: photo.caption } : {}),
        });
      } catch (error) {
        throw new Error(`Cannot process public/photos/${photo.file}: ${error.message}. Use a valid JPEG, PNG, WebP or AVIF image under 64 megapixels.`);
      }
    }

    if (manifest.photos.length) {
      // Build the atlas once on the server, not 95 times on the visitor's GPU.
      // Every tile keeps the former 368px photograph area and extruded gutters.
      const columns = Math.ceil(Math.sqrt(manifest.photos.length));
      const tileSize = Math.min(384, Math.floor(MAX_ATLAS_SIZE / columns));
      if (tileSize <= ATLAS_GUTTER * 2) throw new Error('Too many photos for one tree atlas.');
      const rows = Math.ceil(manifest.photos.length / columns);
      const width = columns * tileSize;
      const height = rows * tileSize;
      const inner = tileSize - ATLAS_GUTTER * 2;
      const atlasId = createHash('sha256').update(atlasVersion)
        .update(manifest.photos.map(photo => photo.id).join(',')).digest('hex').slice(0, 20);
      const atlasName = `${atlasId}-atlas.webp`;
      wanted.add(atlasName);
      const cachedAtlas = await stat(join(outputDirectory, atlasName)).catch(() => null);
      if (cachedAtlas?.isFile() && cachedAtlas.size > 0) {
        atlasBytes = cachedAtlas.size;
      } else {
        const tiles = [];
        for (let index = 0; index < cardPaths.length; index++) {
          const tile = await sharp(cardPaths[index]).resize(inner, inner, { fit: 'cover', position: 'centre' })
            .removeAlpha().extend({ top: ATLAS_GUTTER, bottom: ATLAS_GUTTER,
              left: ATLAS_GUTTER, right: ATLAS_GUTTER, extendWith: 'copy' })
            .raw().toBuffer({ resolveWithObject: true });
          tiles.push({ input: tile.data,
            raw: { width: tile.info.width, height: tile.info.height, channels: tile.info.channels },
            left: (index % columns) * tileSize, top: Math.floor(index / columns) * tileSize });
        }
        const atlas = await sharp({ create: { width, height, channels: 3, background: '#16342c' } })
          .composite(tiles).webp({ quality: 84, effort: 4 }).toFile(join(staging, atlasName));
        atlasBytes = atlas.size;
      }
      manifest.photos.forEach((photo, index) => {
        const x = (index % columns) * tileSize + ATLAS_GUTTER;
        const y = Math.floor(index / columns) * tileSize + ATLAS_GUTTER;
        photo.atlas = {
          src: `generated/photos/${atlasName}`,
          rect: [(x + 0.5) / width, 1 - (y + inner - 0.5) / height, (inner - 1) / width, (inner - 1) / height],
        };
      });
    }

    // Commit only after every source and the complete atlas has been validated.
    await mkdir(outputDirectory, { recursive: true });
    for (const file of await readdir(staging)) await rename(join(staging, file), join(outputDirectory, file));
    const temporaryManifest = join(staging, 'photo-manifest.json');
    await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(temporaryManifest, manifestPath);
    for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
      if (entry.isFile() && !wanted.has(entry.name) && /^[a-f0-9]{20}(?:-(?:thumb|card|atlas))?\.webp$/.test(entry.name)) {
        await rm(join(outputDirectory, entry.name));
      }
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { count: selected.length, sourceBytes, thumbnailBytes, displayBytes, atlasBytes, reusedPhotos, manifest };
}

const invokedPath = process.argv[1] && resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  preparePhotos({ root: projectRoot }).then(result => {
    const kb = size => (size / 1024).toFixed(1);
    console.log(`Prepared ${result.count} photos: originals ${kb(result.sourceBytes)} KiB → thumbnails ${kb(result.thumbnailBytes)} KiB + display images ${kb(result.displayBytes)} KiB.`);
    console.log(`Tree atlas ${kb(result.atlasBytes)} KiB in one request; reused ${result.reusedPhotos}/${result.count} unchanged photos. Originals are unchanged.`);
    console.log('Manifest: public/generated/photo-manifest.json');
  }).catch(error => {
    console.error(`Photo preparation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
