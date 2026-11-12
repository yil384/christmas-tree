import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/photo-viewer.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { getPhotoViewMetrics, constrainPhotoView, zoomPhotoAt, pinchPhoto } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const rest = { scale: 1, x: 0, y: 0 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('portrait, landscape and long-strip photos fit without distortion and reach actual source pixels', () => {
  for (const [width, height] of [[1920, 2560], [4000, 2400], [1014, 10798], [32, 16]]) {
    for (const [vw, vh] of [[350, 490], [1160, 760]]) {
      const metrics = getPhotoViewMetrics(width, height, vw, vh);
      near(metrics.fittedWidth / metrics.fittedHeight, width / height);
      assert.ok(metrics.fittedWidth <= Math.min(width, vw) + 1e-8);
      assert.ok(metrics.fittedHeight <= Math.min(height, vh) + 1e-8);
      const original = constrainPhotoView(metrics, { scale: Infinity, x: 0, y: 0 });
      assert.equal(original.scale, 1, 'invalid zoom must recover to a finite fit');
      const largest = constrainPhotoView(metrics, { scale: 1e8, x: 0, y: 0 });
      near(metrics.fittedWidth * largest.scale, width);
      near(metrics.fittedHeight * largest.scale, height);
    }
  }
});

test('pointer-anchored zoom keeps the same source pixel under the mouse', () => {
  const metrics = getPhotoViewMetrics(3000, 2000, 600, 400);
  const anchor = { x: 125, y: -60 };
  const zoomed = zoomPhotoAt(metrics, rest, 3, anchor);
  near((anchor.x - zoomed.x) / zoomed.scale, anchor.x);
  near((anchor.y - zoomed.y) / zoomed.scale, anchor.y);
  const restored = zoomPhotoAt(metrics, zoomed, 1, anchor);
  assert.deepEqual(restored, rest);
});

test('pinch follows both scale and moving midpoint without a jump', () => {
  const metrics = getPhotoViewMetrics(3000, 2000, 600, 400);
  const initial = { scale: 2, x: -50, y: 15 };
  const from = { x: 70, y: -40 };
  const to = { x: 105, y: -20 };
  const zoomed = pinchPhoto(metrics, initial, from, to, 1.5);
  near(zoomed.scale, 3);
  near((to.x - zoomed.x) / zoomed.scale, (from.x - initial.x) / initial.scale);
  near((to.y - zoomed.y) / zoomed.scale, (from.y - initial.y) / initial.scale);
});

test('dragging cannot lose a photo beyond its bounds and reset clears all pan', () => {
  const metrics = getPhotoViewMetrics(2400, 3000, 600, 500);
  const zoomed = constrainPhotoView(metrics, { scale: 3, x: 1e6, y: -1e6 });
  near(zoomed.x, (metrics.fittedWidth * 3 - metrics.width) / 2);
  near(zoomed.y, -(metrics.fittedHeight * 3 - metrics.height) / 2);
  assert.deepEqual(constrainPhotoView(metrics, { ...zoomed, scale: 1 }), rest);
  assert.deepEqual(constrainPhotoView(metrics, { scale: NaN, x: NaN, y: Infinity }), rest);
});

test('small original photos are never enlarged by native-size or pinch controls', () => {
  const metrics = getPhotoViewMetrics(32, 16, 400, 600);
  assert.equal(metrics.maxScale, 1);
  assert.deepEqual(pinchPhoto(metrics, rest, { x: 0, y: 0 }, { x: 100, y: 100 }, 20), rest);
});
