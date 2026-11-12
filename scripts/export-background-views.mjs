/** Render exact perspective references from the approved spherical artwork.
 * These are composition guides for new generated detail, never final enlarged assets.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] || join(root, 'docs', 'background-view-references'));
const config = JSON.parse(await readFile(join(root, 'public', 'scene.json'), 'utf8'));
const sourcePath = join(root, 'public', config.background.image);
const { data: source, info } = await sharp(sourcePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const size = 1254;
const fov = 60;
const pitch = -10;
const yawOffset = 5.4; // Equirectangular U=.265: the existing castle's center.
const radians = Math.PI / 180;
const tangent = Math.tan(fov * radians / 2);
const linear = Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});
const toByte = value => Math.round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
const sample = (u, v, channel) => {
  const px = u * info.width - 0.5;
  const py = Math.min(info.height - 1, Math.max(0, v * info.height - 0.5));
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const x1 = x0 + 1, y1 = Math.min(info.height - 1, y0 + 1);
  const fx = px - x0, fy = py - y0;
  const value = (x, y) => linear[source[(y * info.width + ((x % info.width + info.width) % info.width)) * info.channels + channel]];
  return toByte((value(x0, y0) * (1 - fx) + value(x1, y0) * fx) * (1 - fy)
    + (value(x0, y1) * (1 - fx) + value(x1, y1) * fx) * fy);
};

await mkdir(output, { recursive: true });
const views = [];
for (let index = 0; index < 8; index++) {
  const yaw = yawOffset + 45 * index;
  const a = yaw * radians, b = pitch * radians;
  const forward = [Math.sin(a) * Math.cos(b), Math.sin(b), -Math.cos(a) * Math.cos(b)];
  const right = [Math.cos(a), 0, Math.sin(a)];
  const up = [-Math.sin(a) * Math.sin(b), Math.cos(b), Math.cos(a) * Math.sin(b)];
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const horizontal = (2 * (x + 0.5) / size - 1) * tangent;
    const vertical = (1 - 2 * (y + 0.5) / size) * tangent;
    const direction = forward.map((component, axis) => component + right[axis] * horizontal + up[axis] * vertical);
    const magnitude = Math.hypot(...direction);
    const u = Math.atan2(direction[2], direction[0]) / (2 * Math.PI) + 0.5;
    const v = 0.5 - Math.asin(direction[1] / magnitude) / Math.PI;
    for (let c = 0; c < 3; c++) pixels[(y * size + x) * 3 + c] = sample(u, v, c);
  }
  const file = `view-${String(index).padStart(2, '0')}-reference.png`;
  await sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).png().toFile(join(output, file));
  views.push({ index, file, yaw, pitch, horizontalFov: fov, verticalFov: fov, width: size, height: size,
    forward, right, up, sourceCenterU: ((0.25 + yaw / 360) % 1) });
}
const manifest = {
  purpose: 'Exact perspective composition references; regenerate fine artwork inside these views before publishing.',
  source: sourcePath, sourceWidth: info.width, sourceHeight: info.height,
  convention: 'Yaw 0 looks toward -Z; positive yaw looks toward +X. Pitch is elevation, negative below the horizon. PNG origin is top-left.',
  overlapDegrees: 15, views,
};
await writeFile(join(output, 'views.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output, count: views.length, sourceSize: [info.width, info.height], viewSize: [size, size], fov, pitch, yawOffset }));
