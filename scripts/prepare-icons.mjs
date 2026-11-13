import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// The SVG is the hand-drawn source. Raster variants keep the same small,
// legible silhouette in Safari, browser tabs and home-screen shortcuts.
const directory = new URL('../public/icons/', import.meta.url);
const stem = 'xiaomiao-mark-v2';
const source = await readFile(new URL(`${stem}.svg`, directory));
const icons = new Map();
for (const size of [16, 32, 48, 180, 192, 512]) {
  const png = await sharp(source, { density: 384 }).resize(size, size).png().toBuffer();
  icons.set(size, png);
  await writeFile(new URL(`${stem}-${size}.png`, directory), png);
}
const sizes = [16, 32, 48];
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + i * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(icons.get(size).length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += icons.get(size).length;
});
const ico = Buffer.concat([header, ...sizes.map(size => icons.get(size))]);
await writeFile(new URL(`${stem}.ico`, directory), ico);
await writeFile(new URL('../favicon.ico', directory), ico);
console.log(`Prepared hand-drawn kitten icons in ${fileURLToPath(directory)}`);
