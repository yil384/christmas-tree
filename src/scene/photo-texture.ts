import * as THREE from 'three';

/** Allocate each decoded atlas at its final size before its first GPU upload. */
export function createPhotoTexture(image: TexImageSource | OffscreenCanvas, anisotropy: number): THREE.Texture {
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(8, anisotropy);
  texture.needsUpdate = true;
  return texture;
}

/** Keep the material and its cleanup owner pointing at the same GPU resource. */
export function replacePhotoTexture(
  owner: { texture: THREE.Texture },
  material: THREE.MeshStandardMaterial,
  texture: THREE.Texture,
) {
  const previous = owner.texture;
  owner.texture = texture;
  material.map = texture;
  material.needsUpdate = true;
  if (previous !== texture) previous.dispose();
}
