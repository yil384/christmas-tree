import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/experience-route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { CHRISTMAS_LAUNCH, resolveExperience, nextSeasonCheck } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('custom-domain entry changes at the exact Christmas instant', () => {
  assert.equal(new Date(CHRISTMAS_LAUNCH).toISOString(), '2026-12-24T16:00:00.000Z');
  assert.equal(resolveExperience('/', 'tanchensiyi.com', CHRISTMAS_LAUNCH - 1), 'letter');
  assert.equal(resolveExperience('/', 'tanchensiyi.com', CHRISTMAS_LAUNCH), 'christmas');
});

test('both gifts remain available regardless of date and host', () => {
  for (const host of ['tanchensiyi.com', 'jimeixiaomiao.wildmole.chatgpt.site']) {
    for (const time of [CHRISTMAS_LAUNCH - 1, CHRISTMAS_LAUNCH + 1]) {
      assert.equal(resolveExperience('/letter/', host, time), 'letter');
      assert.equal(resolveExperience('/christmas/', host, time), 'christmas');
    }
  }
  assert.equal(resolveExperience('/', 'jimeixiaomiao.wildmole.chatgpt.site', CHRISTMAS_LAUNCH - 1), 'christmas');
});

test('a tab opened weeks earlier never schedules an overflowing browser timer', () => {
  const november = Date.parse('2026-11-09T00:00:00Z');
  assert.ok(nextSeasonCheck(november) <= 86_400_000);
  assert.equal(nextSeasonCheck(CHRISTMAS_LAUNCH - 5000), 5000);
  assert.ok(nextSeasonCheck(CHRISTMAS_LAUNCH) > 0);
});
