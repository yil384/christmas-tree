import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/scene/photo-atlas-loader.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { loadPhotoAtlas } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const tick = () => Promise.resolve();

function fixture({ count = 7, atlas = true, drawingFailsAt = -1 } = {}) {
  const images = [];
  const requests = [];
  const events = { atlas: [], fallbackStarts: 0, cards: [], batches: 0 };
  class ControlledImage {
    onload = null;
    onerror = null;
    decoding = '';
    naturalWidth = 384;
    naturalHeight = 384;
    decodeCalls = 0;
    constructor() {
      this.decoded = new Promise((resolve, reject) => {
        this.resolveDecode = resolve;
        this.rejectDecode = reject;
      });
      images.push(this);
    }
    set src(value) { this.url = value; if (value) requests.push(value); }
    get src() { return this.url; }
    decode() { this.decodeCalls++; return this.decoded; }
    load() { this.onload?.(); }
    error() { this.onerror?.(); }
  }
  const cancel = loadPhotoAtlas({
    atlasUrl: atlas ? '/album-atlas.webp' : undefined,
    cardUrls: Array.from({ length: count }, (_, index) => `/photo-${index}-card.webp`),
    createImage: () => new ControlledImage(),
    onAtlas: image => events.atlas.push(image),
    onFallbackStart: () => events.fallbackStarts++,
    onCard: slot => {
      if (slot === drawingFailsAt) throw new Error('Cannot draw this photo');
      events.cards.push(slot);
    },
    onFallbackComplete: () => events.batches++,
  });
  return { images, requests, events, cancel };
}

async function succeed(image) {
  image.load();
  image.resolveDecode();
  await tick();
}

test('a healthy atlas waits for decoding and reveals once without any card requests', async () => {
  const f = fixture({ count: 95 });
  assert.deepEqual(f.requests, ['/album-atlas.webp']);
  f.images[0].load();
  assert.equal(f.events.atlas.length, 0);
  f.images[0].resolveDecode();
  await tick();
  assert.equal(f.events.atlas.length, 1);
  assert.equal(f.events.fallbackStarts, 0);
  assert.equal(f.requests.length, 1);
  f.cancel();
});

test('an atlas network failure falls back once with three lanes and reveals only the complete batch', async () => {
  const f = fixture({ count: 95, drawingFailsAt: 4 });
  const repeatedError = f.images[0].onerror;
  f.images[0].error();
  repeatedError();
  assert.equal(f.events.fallbackStarts, 1);
  assert.equal(f.requests.length, 4, 'One failed atlas plus three active card requests');
  for (let index = 0; index < 95; index++) {
    assert.equal(f.events.batches, 0, 'No partial album may be revealed');
    assert.ok(f.images.filter(image => image.onload || image.onerror).length <= 3);
    const image = f.images[index + 1];
    if (index === 1) image.error();
    else if (index === 2) {
      image.load();
      image.rejectDecode(new Error('Bad card data'));
      await tick();
    } else await succeed(image);
  }
  assert.equal(f.events.batches, 1);
  assert.equal(f.events.atlas.length, 0);
  assert.equal(f.events.cards.length, 92, 'Two bad downloads/decodes and one failed draw keep placeholders');
  assert.equal(f.requests.length, 96, 'Every card is tried exactly once, with no retry recursion');
  assert.equal(new Set(f.requests).size, 96);
  repeatedError();
  assert.equal(f.requests.length, 96);
  f.cancel();
});

test('an atlas decode failure also enters the bounded card fallback', async () => {
  const f = fixture({ count: 2 });
  f.images[0].load();
  f.images[0].rejectDecode(new Error('Invalid atlas image'));
  await tick();
  assert.equal(f.events.fallbackStarts, 1);
  assert.equal(f.requests.length, 3);
  await succeed(f.images[1]);
  assert.equal(f.events.batches, 0);
  await succeed(f.images[2]);
  assert.equal(f.events.batches, 1);
  f.cancel();
});

test('cancellation during atlas decode prevents both reveal and fallback after late events', async () => {
  const f = fixture();
  const lateError = f.images[0].onerror;
  f.images[0].load();
  f.cancel();
  assert.equal(f.images[0].src, '');
  assert.equal(f.images[0].onload, null);
  assert.equal(f.images[0].onerror, null);
  f.images[0].resolveDecode();
  lateError();
  await tick();
  assert.equal(f.events.atlas.length, 0);
  assert.equal(f.events.fallbackStarts, 0);
  assert.equal(f.requests.length, 1);
});

test('cancellation during fallback clears its active requests and never starts the next lane', async () => {
  const f = fixture();
  f.images[0].error();
  const lateErrors = f.images.slice(1).map(image => image.onerror);
  f.images[1].load();
  f.cancel();
  for (const image of f.images.slice(1)) {
    assert.equal(image.src, '');
    assert.equal(image.onload, null);
    assert.equal(image.onerror, null);
  }
  f.images[1].resolveDecode();
  lateErrors.forEach(fail => fail());
  await tick();
  assert.equal(f.events.cards.length, 0);
  assert.equal(f.events.batches, 0);
  assert.equal(f.requests.length, 4);
});

test('old albums use the same bounded loader and one complete reveal', async () => {
  const f = fixture({ atlas: false, count: 4 });
  assert.equal(f.events.fallbackStarts, 1);
  assert.equal(f.requests.length, 3);
  for (let index = 0; index < 4; index++) await succeed(f.images[index]);
  assert.deepEqual(f.events.cards, [0, 1, 2, 3]);
  assert.equal(f.events.batches, 1);
  assert.equal(f.events.atlas.length, 0);
  f.cancel();
});
