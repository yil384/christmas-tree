import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import { WebGLTextures } from 'three/src/renderers/webgl/WebGLTextures.js';
import { WebGLProperties } from 'three/src/renderers/webgl/WebGLProperties.js';

const source = await readFile(new URL('../src/scene/photo-texture.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("from 'three'", `from ${JSON.stringify(import.meta.resolve('three'))}`);
const { createPhotoTexture, replacePhotoTexture } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

// Exercise the installed Three renderer's real upload/cache/disposal decisions.
// The GL boundary records storage dimensions, as WebGL2 immutable storage does.
function uploadHarness() {
  const allocations = [], uploads = [], deleted = [];
  const memory = { textures: 0 };
  let current, textureId = 0, constant = 0x1000;
  const gl = new Proxy({
    createTexture: () => ({ id: ++textureId }),
    deleteTexture: texture => deleted.push(texture),
    pixelStorei() {},
    texParameteri() {},
    generateMipmap() {},
  }, {
    get(target, key) {
      if (!(key in target)) target[key] = ++constant;
      return target[key];
    },
  });
  const state = {
    activeTexture() {},
    bindTexture(_target, texture) { current = texture; },
    texStorage2D(_target, levels, _format, width, height) {
      assert.equal(current.size, undefined, 'immutable storage may only be allocated once');
      current.size = [width, height];
      allocations.push({ id: current.id, width, height, levels: Math.floor(levels) });
    },
    texSubImage2D(_target, _level, _x, _y, _format, _type, image) {
      uploads.push({ id: current.id, width: image.width, height: image.height });
      assert.ok(image.width <= current.size[0] && image.height <= current.size[1],
        `upload ${image.width}x${image.height} exceeds ${current.size.join('x')} immutable storage`);
    },
  };
  const textures = new WebGLTextures(gl, { has: () => false, get: () => null }, state,
    WebGLProperties(), { maxTextureSize: 8192, getMaxAnisotropy: () => 16 }, {
      convert(value) {
        if (value === THREE.RGBAFormat) return gl.RGBA;
        if (value === THREE.UnsignedByteType) return gl.UNSIGNED_BYTE;
        throw new Error(`Unexpected texture format/type: ${value}`);
      },
    }, { memory });
  return { upload: texture => textures.setTexture2D(texture, 0), allocations, uploads, deleted, memory };
}

test('the regression harness detects the old 1px-to-atlas image mutation', () => {
  const gpu = uploadHarness();
  const texture = createPhotoTexture({ width: 1, height: 1 }, 4);
  gpu.upload(texture);
  texture.image = { width: 3840, height: 3840 };
  texture.needsUpdate = true;
  assert.throws(() => gpu.upload(texture), /exceeds 1x1 immutable storage/);
  texture.dispose();
});

for (const [name, width] of [['decoded image', 3840], ['batched fallback canvas', 4096]]) {
  test(`${name} replaces an already-uploaded placeholder with correctly sized GPU storage`, () => {
    const gpu = uploadHarness();
    const placeholder = createPhotoTexture({ width: 1, height: 1 }, 16);
    const owner = { texture: placeholder };
    const material = new THREE.MeshStandardMaterial({ map: placeholder });
    gpu.upload(placeholder);

    const image = { width, height: width };
    const ready = createPhotoTexture(image, 16);
    replacePhotoTexture(owner, material, ready);
    assert.equal(owner.texture, ready, 'unmount cleanup must own the installed texture');
    assert.equal(material.map, ready, 'the shader must sample the replacement');
    assert.equal(ready.image, image);
    assert.equal(placeholder.image.width, 1, 'never resize the uploaded placeholder');
    assert.equal(ready.colorSpace, THREE.SRGBColorSpace);
    assert.equal(ready.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(ready.anisotropy, 8);
    assert.notEqual(ready.source, placeholder.source);
    assert.equal(gpu.deleted.length, 1, 'release the obsolete GPU storage');

    gpu.upload(material.map);
    gpu.upload(material.map);
    assert.deepEqual(gpu.allocations.map(({ width, height }) => [width, height]), [[1, 1], [width, width]]);
    assert.equal(gpu.uploads.length, 2, 'one placeholder upload plus one complete atlas upload');
    assert.equal(gpu.memory.textures, 1, 'retain just the complete atlas');
    owner.texture.dispose();
    material.dispose();
    assert.equal(gpu.memory.textures, 0, 'unmount releases the adopted atlas');
  });
}
