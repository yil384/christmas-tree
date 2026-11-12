import { useLayoutEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GROUND_Y } from './tree-profile';
import { snowContactOcclusionAt, snowHeightAt } from './tree-base';
import type { SceneBackground } from '../lib/scene-config';
import { bindProjectiveGroundMaterial, createProjectiveGroundMaterial, setGroundCompanionContact } from './ground-composite';
import { CAT_GROUND_CONTACT, type CatGroundContact } from './cat-placement';
import type { PerspectiveBackgroundSurface } from './ground-composite';

interface Props {
  state: 'FORMED' | 'CHAOS';
  reducedMotion: boolean;
  background: SceneBackground;
  backgroundSurface?: MutableRefObject<PerspectiveBackgroundSurface | null>;
  companion?: boolean;
  companionContact?: MutableRefObject<CatGroundContact>;
}
const NIGHT_SNOW_FOG = new THREE.Color('#18283e');

function createSnowGeometry() {
  // Dense enough to resolve small deposits beside the roots, progressively
  // coarser toward the horizon. The former grid had 4.4-unit cells at the stem.
  const radii = [0.16, 0.30, 0.45, 0.60, 0.75, 0.90, 1.05, 1.20, 1.35, 1.50, 1.70,
    1.90, 2.15, 2.40, 2.70, 3, 3.4, 3.8, 4.3, 4.9, 5.6, 6.5, 7.5, 8.8, 10.5,
    12.5, 15, 18, 22, 27, 33, 40, 49, 60, 73, 90, 110, 135, 165, 200, 230];
  const segments = 96;
  const positions: number[] = [];
  const uvs: number[] = [];
  const contact: number[] = [];
  const indices: number[] = [];
  const vertex = (x: number, z: number) => {
    const height = snowHeightAt(x, z);
    positions.push(x, height, z);
    uvs.push(0.5 + x / 460, 0.5 + z / 460);
    contact.push(snowContactOcclusionAt(x, z, height));
  };
  vertex(0, 0);
  for (const radius of radii) {
    for (let side = 0; side < segments; side++) {
      const angle = side / segments * Math.PI * 2;
      vertex(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
  }
  for (let side = 0; side < segments; side++) {
    indices.push(0, 1 + (side + 1) % segments, 1 + side);
  }
  for (let ring = 0; ring < radii.length - 1; ring++) {
    const inner = 1 + ring * segments;
    const outer = inner + segments;
    for (let side = 0; side < segments; side++) {
      const next = (side + 1) % segments;
      indices.push(inner + side, inner + next, outer + side, inner + next, outer + next, outer + side);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aSnowContact', new THREE.Float32BufferAttribute(contact, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSnowGround(assembly: { value: number } = { value: 1 }) {
  const geometry = createSnowGeometry();
  const pixels = new Uint8Array(128 * 128 * 4);
  let seed = 0x730ead;
  for (let i = 0; i < pixels.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 105 + Math.floor((seed / 4294967296) * 100);
    pixels.set([value, value, value, 255], i);
  }
  const bump = new THREE.DataTexture(pixels, 128, 128, THREE.RGBAFormat);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(210, 210);
  bump.magFilter = THREE.LinearFilter;
  bump.minFilter = THREE.LinearMipmapLinearFilter;
  bump.generateMipmaps = true;
  bump.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    color: '#bdc7d5', roughness: 0.96, metalness: 0,
    bumpMap: bump, bumpScale: 0.018,
    transparent: true, depthWrite: true,
  });
  const fogColor = { value: NIGHT_SNOW_FOG.clone() };
  const blending = { value: new THREE.Vector4(28, 145, 115, 215) };
  material.onBeforeCompile = shader => {
    shader.uniforms.uGroundAssembly = assembly;
    shader.uniforms.uGroundFogColor = fogColor;
    shader.uniforms.uGroundBlending = blending;
    shader.vertexShader = 'attribute float aSnowContact;\nvarying vec2 vSnowGround;\nvarying float vSnowContact;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
      #include <begin_vertex>
      vSnowGround = position.xz;
      vSnowContact = aSnowContact;
    `);
    shader.fragmentShader = /* glsl */ `
      varying vec2 vSnowGround;
      varying float vSnowContact;
      uniform float uGroundAssembly;
      uniform vec3 uGroundFogColor;
      uniform vec4 uGroundBlending;
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
      #include <color_fragment>
      float groundRadius = length(vSnowGround);
      diffuseColor.a *= 1.0 - smoothstep(uGroundBlending.z, uGroundBlending.w, groundRadius);
      if (diffuseColor.a < 0.008) discard;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', /* glsl */ `
      #include <aomap_fragment>
      // Short ambient crevices follow the six buried roots. Directional light
      // and the warm lower bulbs still shade the real snow normals and relief.
      float rootOcclusion = clamp(vSnowContact, 0.0, 0.43) * uGroundAssembly;
      reflectedLight.indirectDiffuse *= 1.0 - rootOcclusion;
      reflectedLight.indirectSpecular *= 1.0 - rootOcclusion;
      reflectedLight.directDiffuse *= 1.0 - rootOcclusion * 0.36;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', /* glsl */ `
      // World-space haze joins the distant background without sliding a photo
      // over the roots when the camera orbits the fixed tree.
      outgoingLight = mix(outgoingLight, uGroundFogColor, smoothstep(uGroundBlending.x, uGroundBlending.y, groundRadius));
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'rooted-world-snow-v4';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'snow-ground';
  mesh.position.y = GROUND_Y;
  mesh.renderOrder = -2;
  mesh.receiveShadow = true;
  return {
    mesh, geometry, material, bump, assembly, fogColor, blending,
    dispose() { geometry.dispose(); material.dispose(); bump.dispose(); },
  };
}

function createProjectiveSnowGround(assembly: { value: number } = { value: 1 }, companion = false) {
  const geometry = createSnowGeometry();
  const material = createProjectiveGroundMaterial(assembly);
  setGroundCompanionContact(material, companion ? CAT_GROUND_CONTACT : null);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'snow-contact-receiver';
  mesh.position.y = GROUND_Y;
  // Establish real ground depth before the trunk is drawn. Its buried bottom
  // is hidden by this surface even though the surface's colour matches the photo.
  mesh.renderOrder = -2;
  mesh.visible = false;
  return {
    mesh, geometry, material, assembly,
    dispose() { geometry.dispose(); material.dispose(); },
  };
}

/** World-space relief physically hides the buried flare, from every azimuth. */
export default function SnowGround({ state, reducedMotion, background, backgroundSurface, companion = false, companionContact }: Props) {
  const group = useRef<THREE.Group>(null);
  const groundRef = useRef<ReturnType<typeof createSnowGround> | ReturnType<typeof createProjectiveSnowGround> | null>(null);
  const assembly = useRef({ value: state === 'FORMED' ? 1 : 0 });
  const invalidate = useThree(root => root.invalidate);
  const projective = background.projection === 'perspective' || background.projection === 'equirectangular';
  useLayoutEffect(() => {
    const parent = group.current;
    if (!parent) return;
    const ground = projective ? createProjectiveSnowGround(assembly.current, companion) : createSnowGround(assembly.current);
    groundRef.current = ground;
    parent.add(ground.mesh);
    invalidate();
    return () => {
      parent.remove(ground.mesh);
      ground.dispose();
      if (groundRef.current === ground) groundRef.current = null;
    };
  }, [invalidate, projective, companion]);
  useLayoutEffect(() => {
    if (reducedMotion) assembly.current.value = state === 'FORMED' ? 1 : 0;
    invalidate();
  }, [state, reducedMotion, invalidate]);
  useLayoutEffect(() => {
    const ground = groundRef.current;
    if (!ground || !('fogColor' in ground)) return;
    // Flat image fallbacks retain their world-lit surface. Projected photos
    // and panoramas use their exact pixels and never enter this colour path.
    ground.fogColor.value.set(background.src && background.groundColor ? background.groundColor : NIGHT_SNOW_FOG)
      .multiplyScalar(background.src ? background.brightness : 1);
    invalidate();
  }, [background.src, background.groundColor, background.brightness, background.projection, invalidate]);
  useFrame((_, delta) => {
    const ground = groundRef.current;
    if (ground && ground.material instanceof THREE.ShaderMaterial) {
      setGroundCompanionContact(ground.material, companion ? companionContact?.current ?? CAT_GROUND_CONTACT : null);
      ground.mesh.visible = bindProjectiveGroundMaterial(ground.material, backgroundSurface?.current ?? null);
    }
    const target = state === 'FORMED' ? 1 : 0;
    if (assembly.current.value === target) return;
    const next = THREE.MathUtils.damp(assembly.current.value, target, 2.1, Math.min(delta, 0.05));
    assembly.current.value = reducedMotion || Math.abs(next - target) < 0.0005 ? target : next;
    invalidate();
  });
  return <group ref={group} dispose={null} />;
}
