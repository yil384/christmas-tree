import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/experience-route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { resolveExperience } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('the home page is Christmas immediately, including old and incorrect visitor clocks', () => {
  for (const host of ['tanchensiyi.com', 'jimeixiaomiao.wildmole.chatgpt.site', 'localhost']) {
    for (const time of [0, Date.parse('2026-11-13T00:00:00Z'), Date.parse('2026-12-25T00:00:00Z')]) {
      assert.equal(resolveExperience('/', host, time), 'christmas');
    }
  }
});

test('both gifts remain available regardless of date and host', () => {
  for (const host of ['tanchensiyi.com', 'jimeixiaomiao.wildmole.chatgpt.site']) {
    for (const time of [0, Date.parse('2027-01-01T00:00:00Z')]) {
      assert.equal(resolveExperience('/letter/', host, time), 'letter');
      assert.equal(resolveExperience('/christmas/', host, time), 'christmas');
    }
  }
  assert.equal(resolveExperience('/letter'), 'letter');
  assert.equal(resolveExperience('/christmas'), 'christmas');
});
