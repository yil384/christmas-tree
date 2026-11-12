import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/film-presentation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { claimOpeningFilm, formatFilmDuration } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function session() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('no finished film means no opening interruption or remembered invitation', () => {
  const store = session();
  assert.equal(claimOpeningFilm(null, false, store), false);
  assert.equal(claimOpeningFilm('film-a.mp4', false, store), true);
});

test('a finished film is offered once per session, with a fresh offer for a new film', () => {
  const store = session();
  assert.equal(claimOpeningFilm('film-a.mp4', false, store), true);
  assert.equal(claimOpeningFilm('film-a.mp4', false, store), false);
  assert.equal(claimOpeningFilm('film-b.mp4', false, store), true);
});

test('late scene settings do not interrupt someone already exploring the tree', () => {
  const store = session();
  assert.equal(claimOpeningFilm('film-a.mp4', true, store), false);
  assert.equal(claimOpeningFilm('film-a.mp4', false, store), true);
});

test('disabled browser storage does not prevent entry', () => {
  const unavailable = { getItem() { throw new Error('Unavailable'); }, setItem() { throw new Error('Unavailable'); } };
  assert.equal(claimOpeningFilm(null, false, unavailable), false);
  assert.equal(claimOpeningFilm('film-a.mp4', false, unavailable), true);
});

test('film duration comes from usable metadata, with no invented runtime', () => {
  for (const value of [null, NaN, Infinity, -1, 0]) assert.equal(formatFilmDuration(value), '');
  assert.equal(formatFilmDuration(131), '2:11');
  assert.equal(formatFilmDuration(59.9), '1:00');
  assert.equal(formatFilmDuration(30), '0:30');
});
