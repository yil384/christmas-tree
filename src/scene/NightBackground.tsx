import { useEffect, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { assetUrl } from '../lib/content';
import type { SceneBackground } from '../lib/scene-config';

/** A fixed picture behind the scene; rotating the tree never rotates this backdrop. */
export default function NightBackground({ background }: { background: SceneBackground }) {
  const { scene, size, invalidate } = useThree();
  const textureRef = useRef<THREE.Texture | null>(null);
  const settings = useRef({ background, size });
  settings.current = { background, size };

  const update = (texture: THREE.Texture) => {
    const { background: current, size: viewport } = settings.current;
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

  useEffect(() => {
    let cancelled = false;
    scene.background = new THREE.Color('#030b16');
    scene.backgroundIntensity = 1;
    invalidate();
    if (!background.src) return;
    const texture = new THREE.TextureLoader().load(assetUrl(background.src), loaded => {
      if (cancelled) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.SRGBColorSpace;
      updateRef.current(loaded);
      textureRef.current = loaded;
      scene.background = loaded;
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
      texture.dispose();
    };
  }, [background.src, scene, invalidate]);

  useLayoutEffect(() => {
    if (textureRef.current) updateRef.current(textureRef.current);
    invalidate();
  }, [size.width, size.height, background.brightness, background.focus, invalidate]);

  return null;
}
