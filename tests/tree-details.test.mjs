import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

// Execute the actual factories and frame synchronizer, including the instance
// matrices sent to Three. Private exports exist only in this test module.
const compile = (source, fileName) => ts.transpileModule(source, {
  fileName,
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const read = file => readFile(new URL(`../src/scene/${file}`, import.meta.url), 'utf8');
const imports = (source, aliases = {}) => source.replace(
  /from\s+(['"])([^'"]+)\1/g,
  (_match, _quote, name) => `from ${JSON.stringify(aliases[name] ?? import.meta.resolve(name))}`,
);
const profileUrl = moduleUrl(compile(await read('tree-profile.ts'), 'tree-profile.ts'));
const snowUrl = moduleUrl(imports(compile(await read('Snowfall.ts'), 'Snowfall.ts'), {
  './tree-profile': profileUrl,
}));
const source = `${await read('TreeDetails.tsx')}\nexport { createDetails, syncDetails, disposeDetails };`;
const { createDetails, syncDetails, disposeDetails } = await import(moduleUrl(
  imports(compile(source, 'TreeDetails.tsx'), { './Snowfall': snowUrl }),
));

test('attached ornaments keep their instance matrices while time and light shimmer advance', () => {
  for (const compact of [false, true]) {
    const details = createDetails(compact);
    try {
      const motion = { time: 0, foliage: 1, lights: 1, decorations: 1, star: 1 };
      syncDetails(details, motion, 1);
      const initial = details.decorations.map(({ mesh }) => Array.from(mesh.instanceMatrix.array));
      for (const time of [30, 150, 1800]) {
        syncDetails(details, { ...motion, time }, 1);
        for (const [index, { mesh }] of details.decorations.entries()) {
          assert.deepEqual(Array.from(mesh.instanceMatrix.array), initial[index],
            'An attached ornament rotates independently of the branches and camera');
        }
        assert.equal(details.lights.material.uniforms.uTime.value, time,
          'Fixing solid ornaments must not freeze the fairy light shimmer');
      }
    } finally {
      disposeDetails(details);
    }
  }
});

test('ornaments still travel between scattered and formed positions during assembly', () => {
  const details = createDetails(true);
  try {
    const motion = { time: 30, foliage: 1, lights: 1, decorations: 1, star: 1 };
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const positionsAt = progress => {
      syncDetails(details, { ...motion, decorations: progress }, 1);
      return details.decorations.flatMap(({ mesh, items }) => items.map((_item, index) => {
        mesh.getMatrixAt(index, matrix);
        return position.setFromMatrixPosition(matrix).clone();
      }));
    };
    const scattered = positionsAt(0);
    const halfway = positionsAt(0.5);
    const formed = positionsAt(1);
    for (let index = 0; index < formed.length; index += 1) {
      assert.ok(scattered[index].distanceTo(formed[index]) > 0.1,
        'A decoration no longer moves when the tree assembles');
      assert.ok(halfway[index].distanceTo(scattered[index].clone().lerp(formed[index], 0.5)) < 1e-5,
        'The positional assembly transition no longer passes between its endpoints');
    }
  } finally {
    disposeDetails(details);
  }
});
