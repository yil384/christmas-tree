import { useEffect, useLayoutEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { assetUrl } from '../lib/content';
import type { SceneBackground } from '../lib/scene-config';
import { getPerspectiveBackgroundPlacement } from './perspective-background';
import type { PerspectiveBackgroundSurface } from './ground-composite';
import { createPanoramaUniforms, PANORAMA_SAMPLING_GLSL } from './ground-composite';
import { createPanoramaPanelPool } from './panorama-panels';
import { GROUND_Y } from './tree-profile';

function createPerspectiveBackground(texture: THREE.Texture) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: { picture: { value: texture }, brightness: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vPictureUv;
      void main() {
        vPictureUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // A background belongs behind all geometry, even at a wide aspect.
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D picture;
      uniform float brightness;
      varying vec2 vPictureUv;
      void main() {
        gl_FragColor = vec4(texture2D(picture, vPictureUv).rgb * brightness, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'perspective-background';
  mesh.renderOrder = -10000;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return mesh;
}

const PANORAMA_CAPTURE_HEIGHT = 20;
const PANORAMA_WORLD_RADIUS = 320;

// Put the complete painting in one finite, stationary world. Its downward rays
// meet the same snow plane as the tree and kitten; above the horizon they meet
// the enclosing dome. Moving the camera now produces real translation parallax
// instead of dragging an infinite picture and its snow underneath the roots.
function createPanorama(texture: THREE.Texture, directionalPanels = false) {
  const geometry = new THREE.SphereGeometry(PANORAMA_WORLD_RADIUS, 192, 96);
  const positions = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    if (point.y < 0) {
      // Same grounded-sky construction as Three's GroundedSkybox: the lower
      // hemisphere becomes flat snow, with a smooth bend at the distant edge.
      const bend = -PANORAMA_CAPTURE_HEIGHT * 1.5;
      const scale = point.y < bend ? -PANORAMA_CAPTURE_HEIGHT / point.y
        : 1 - point.y * point.y / (3 * bend * bend);
      point.multiplyScalar(scale);
      positions.setXYZ(i, point.x, point.y, point.z);
    }
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    uniforms: createPanoramaUniforms(texture),
    defines: directionalPanels ? { USE_DIRECTIONAL_PANELS: 1 } : {},
    vertexShader: /* glsl */ `
      varying vec3 vWorldDirection;
      void main() {
        // Keep the unnormalised capture ray. Normalising at each vertex would
        // warp the texture when interpolating over the flattened ground.
        vWorldDirection = (modelMatrix * vec4(position, 0.0)).xyz;
        #include <begin_vertex>
        #include <project_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldDirection;
      ${PANORAMA_SAMPLING_GLSL}
      void main() {
        gl_FragColor = vec4(samplePanorama(vWorldDirection), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthTest: true,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'panorama-background';
  mesh.position.y = GROUND_Y + PANORAMA_CAPTURE_HEIGHT;
  mesh.renderOrder = -10000;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  mesh.updateMatrixWorld();
  material.uniforms.panoramaOrigin.value.setFromMatrixPosition(mesh.matrixWorld);
  return mesh;
}

/** Perspective photographs and real panoramas retain their own projection. */
export default function NightBackground({ background, surface }: {
  background: SceneBackground;
  surface?: MutableRefObject<PerspectiveBackgroundSurface | null>;
}) {
  const { scene, gl, size, camera, invalidate } = useThree();
  const textureRef = useRef<THREE.Texture | null>(null);
  const panoramaRef = useRef<ReturnType<typeof createPanorama> | null>(null);
  const panelsRef = useRef<ReturnType<typeof createPanoramaPanelPool> | null>(null);
  const perspectiveRef = useRef<ReturnType<typeof createPerspectiveBackground> | null>(null);
  const settings = useRef({ background, size });
  settings.current = { background, size };

  const update = (texture: THREE.Texture) => {
    const { background: current, size: viewport } = settings.current;
    if (current.projection === 'perspective') {
      texture.mapping = THREE.UVMapping;
      texture.repeat.set(1, 1);
      texture.offset.set(0, 0);
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      const plate = perspectiveRef.current;
      const image = texture.image as HTMLImageElement;
      if (plate) {
        const placement = getPerspectiveBackgroundPlacement(
          viewport.width, viewport.height,
          image.naturalWidth / Math.max(1, image.naturalHeight),
          current.focus, (camera as THREE.PerspectiveCamera).fov,
        );
        plate.position.set(placement.x, placement.y, placement.z);
        plate.scale.set(placement.width, placement.height, 1);
        plate.material.uniforms.brightness.value = current.brightness;
        plate.updateMatrixWorld();
      }
      texture.updateMatrix();
      return;
    }
    if (current.projection === 'equirectangular') {
      texture.mapping = THREE.UVMapping;
      texture.repeat.set(1, 1);
      texture.offset.set(0, 0);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      const panorama = panoramaRef.current;
      if (panorama) {
        // Match Three's existing environment-map rotation convention.
        panorama.material.uniforms.skyRotation.value.setFromMatrix4(
          new THREE.Matrix4().makeRotationY(-THREE.MathUtils.degToRad(current.rotation)),
        );
        panorama.material.uniforms.brightness.value = current.brightness;
      }
      texture.updateMatrix();
      return;
    }
    texture.mapping = THREE.UVMapping;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    scene.backgroundRotation.set(0, 0, 0);
    const image = texture.image as HTMLImageElement;
    const imageAspect = image.naturalWidth / Math.max(1, image.naturalHeight);
    const viewAspect = viewport.width / Math.max(1, viewport.height);
    const repeatX = Math.min(1, viewAspect / imageAspect);
    const repeatY = Math.min(1, imageAspect / viewAspect);
    texture.repeat.set(repeatX, repeatY);
    texture.offset.set((1 - repeatX) * current.focus[0], (1 - repeatY) * (1 - current.focus[1]));
    texture.updateMatrix();
    scene.backgroundIntensity = current.brightness;
  };
  const updateRef = useRef(update);
  updateRef.current = update;
  useFrame(({ clock }) => panelsRef.current?.update(camera, clock.elapsedTime));

  useEffect(() => {
    let cancelled = false;
    const detailTextures: THREE.Texture[] = [];
    scene.background = new THREE.Color('#030b16');
    scene.backgroundIntensity = 1;
    scene.backgroundRotation.set(0, 0, 0);
    invalidate();
    if (!background.src) return;
    const texture = new THREE.TextureLoader().load(assetUrl(background.src), loaded => {
      if (cancelled) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.SRGBColorSpace;
      // The stationary environment and its contact receiver share a sampling
      // footprint so their meeting edge never becomes a pale ground ring.
      loaded.anisotropy = background.projection === 'image' ? Math.min(8, gl.capabilities.getMaxAnisotropy()) : 1;
      textureRef.current = loaded;
      if (background.projection === 'perspective') {
        const plate = createPerspectiveBackground(loaded);
        perspectiveRef.current = plate;
        if (surface) surface.current = plate;
        scene.add(plate);
      } else if (background.projection === 'equirectangular') {
        const panorama = createPanorama(loaded, !!background.panels?.length);
        panoramaRef.current = panorama;
        if (surface) surface.current = panorama;
        scene.add(panorama);
        if (background.panels?.length) {
          panelsRef.current = createPanoramaPanelPool(background.panels, panorama.material, gl.capabilities.maxTextureSize, invalidate);
          panelsRef.current.update(camera, 0);
        }
        for (const [index, tile] of (background.panels?.length ? [] : background.detailTiles ?? []).entries()) {
          panorama.material.uniforms[`detailRect${index}`].value.set(tile.centerU, tile.spanU, tile.minV, tile.maxV);
          const detailTexture = new THREE.TextureLoader().load(assetUrl(tile.src), detail => {
            if (cancelled) { detail.dispose(); return; }
            detail.colorSpace = THREE.SRGBColorSpace;
            detail.anisotropy = 1;
            panorama.material.uniforms[`detail${index}`].value = detail;
            panorama.material.uniforms[`detailReady${index}`].value = 1;
            invalidate();
          });
          detailTexture.colorSpace = THREE.SRGBColorSpace;
          detailTextures.push(detailTexture);
        }
      } else {
        scene.background = loaded;
      }
      updateRef.current(loaded);
      invalidate();
    }, undefined, () => {
      // A missing picture should leave the tree on the dark sky, not block it.
      if (!cancelled) invalidate();
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    return () => {
      cancelled = true;
      if (scene.background === texture) scene.background = new THREE.Color('#030b16');
      if (textureRef.current === texture) textureRef.current = null;
      const panorama = panoramaRef.current;
      panelsRef.current?.dispose();
      panelsRef.current = null;
      if (panorama) {
        if (surface?.current === panorama) surface.current = null;
        scene.remove(panorama);
        panorama.geometry.dispose();
        panorama.material.dispose();
        panoramaRef.current = null;
      }
      detailTextures.forEach(detail => detail.dispose());
      const plate = perspectiveRef.current;
      if (plate) {
        if (surface?.current === plate) surface.current = null;
        scene.remove(plate);
        plate.geometry.dispose();
        plate.material.dispose();
        perspectiveRef.current = null;
      }
      texture.dispose();
    };
  }, [background.src, background.projection, background.detailTiles, background.panels, scene, gl, camera, invalidate, surface]);

  useLayoutEffect(() => {
    if (textureRef.current) updateRef.current(textureRef.current);
    invalidate();
  }, [size.width, size.height, background.brightness, background.focus, background.projection, background.rotation, invalidate]);

  return null;
}
