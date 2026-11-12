import * as THREE from 'three';
import type { PanoramaPanel } from '../lib/scene-config';
import { assetUrl } from '../lib/content';
import { configurePanoramaPanel } from './ground-composite';

const RESIDENT_PANELS = 4;
const LOAD_LANES = 2;

/** Keep native detail around the viewing direction without retaining eight GPU images. */
export function createPanoramaPanelPool(
  panels: PanoramaPanel[], material: THREE.ShaderMaterial,
  maximumTextureSize: number, invalidate: () => void,
) {
  const loader = new THREE.TextureLoader();
  const ray = new THREE.Vector3();
  const states = panels.map((panel, index) => {
    configurePanoramaPanel(material, index, panel);
    const yaw = THREE.MathUtils.degToRad(panel.yaw);
    return { panel, index, x: Math.sin(yaw), z: -Math.cos(yaw),
      texture: null as THREE.Texture | null, loading: false, failed: false };
  });
  let disposed = false, running = 0, nextCheck = -Infinity;
  let wanted: number[] = [];

  const release = (state: typeof states[number]) => {
    material.uniforms[`panelReady${state.index}`].value = 0;
    material.uniforms[`panel${state.index}`].value = material.uniforms.panorama.value;
    state.texture?.dispose();
    state.texture = null;
  };

  const pump = () => {
    if (disposed) return;
    for (const index of wanted) {
      const state = states[index];
      if (running >= LOAD_LANES) break;
      if (state.texture || state.loading || state.failed) continue;
      state.loading = true;
      running++;
      const { panel } = state;
      const src = Math.max(panel.width, panel.height) > maximumTextureSize && panel.compactSrc ? panel.compactSrc : panel.src;
      state.texture = loader.load(assetUrl(src), loaded => {
        state.loading = false;
        running--;
        if (disposed || !wanted.includes(index)) {
          loaded.dispose();
          state.texture = null;
        } else {
          loaded.colorSpace = THREE.SRGBColorSpace;
          loaded.anisotropy = 1;
          loaded.wrapS = loaded.wrapT = THREE.ClampToEdgeWrapping;
          material.uniforms[`panel${index}`].value = loaded;
          material.uniforms[`panelReady${index}`].value = 1;
          invalidate();
        }
        pump();
      }, undefined, () => {
        state.loading = false;
        state.failed = true;
        running--;
        release(state);
        // A missing panel leaves the complete approved panorama visible.
        if (!disposed) { invalidate(); pump(); }
      });
      state.texture.colorSpace = THREE.SRGBColorSpace;
    }
  };

  return {
    update(camera: THREE.Camera, time: number) {
      if (disposed || time < nextCheck) return;
      nextCheck = time + 0.15;
      camera.getWorldDirection(ray).applyMatrix3(material.uniforms.skyRotation.value);
      // Four neighbouring 60-degree views cover the visible horizon plus the
      // upcoming views during the slow orbit, including wide screens.
      wanted = states.slice().sort((a, b) => (b.x - a.x) * ray.x + (b.z - a.z) * ray.z)
        .slice(0, RESIDENT_PANELS).map(state => state.index);
      for (const state of states) if (!wanted.includes(state.index) && !state.loading && state.texture) release(state);
      pump();
    },
    dispose() {
      disposed = true;
      wanted = [];
      for (const state of states) release(state);
    },
  };
}
