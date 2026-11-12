import * as THREE from 'three';
import type { PanoramaPanel } from '../lib/scene-config';

export type BackgroundSurface = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
export type PerspectiveBackgroundSurface = BackgroundSurface;
export interface GroundCompanionContact {
  position: readonly [number, number];
  yaw: number;
  body: readonly [number, number, number, number];
  paws: readonly (readonly [number, number, number, number])[];
}

/** The sky and its contact receiver share one texture sampling implementation. */
export function createPanoramaUniforms(texture: THREE.Texture | null) {
  return {
    panorama: { value: texture },
    panoramaOrigin: { value: new THREE.Vector3() },
    skyRotation: { value: new THREE.Matrix3() },
    brightness: { value: 1 },
    ...Object.fromEntries(Array.from({ length: 4 }, (_, i) => [
      [`detail${i}`, { value: texture }],
      [`detailRect${i}`, { value: new THREE.Vector4(0.5, 1 / 3, 0.25, 0.75) }],
      [`detailReady${i}`, { value: 0 }],
    ]).flat()),
    ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [
      [`panel${i}`, { value: texture }],
      [`panelView${i}`, { value: new THREE.Matrix3() }],
      [`panelLens${i}`, { value: new THREE.Vector2(Math.tan(Math.PI / 6), Math.tan(Math.PI / 6)) }],
      [`panelReady${i}`, { value: 0 }],
    ]).flat()),
  };
}

export function configurePanoramaPanel(
  material: THREE.ShaderMaterial, index: number,
  panel: Pick<PanoramaPanel, 'yaw' | 'pitch' | 'horizontalFov' | 'verticalFov'>,
) {
  const yaw = THREE.MathUtils.degToRad(panel.yaw), pitch = THREE.MathUtils.degToRad(panel.pitch);
  const s = Math.sin(yaw), c = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  // Rows are camera right, up, forward. Yaw zero faces -Z; negative pitch looks down.
  material.uniforms[`panelView${index}`].value.set(c, 0, s, -s * sp, cp, c * sp, s * cp, sp, -c * cp);
  material.uniforms[`panelLens${index}`].value.set(
    Math.tan(THREE.MathUtils.degToRad(panel.horizontalFov) / 2),
    Math.tan(THREE.MathUtils.degToRad(panel.verticalFov) / 2),
  );
}

export const PANORAMA_SAMPLING_GLSL = /* glsl */ `
  uniform sampler2D panorama;
  uniform vec3 panoramaOrigin;
  uniform mat3 skyRotation;
  uniform float brightness;
  #include <common>
  #ifdef USE_DIRECTIONAL_PANELS
  ${Array.from({ length: 8 }, (_, i) => `uniform sampler2D panel${i}; uniform mat3 panelView${i}; uniform vec2 panelLens${i}; uniform float panelReady${i};`).join('\n')}
  vec4 panelSample(sampler2D image, vec3 ray, mat3 view, vec2 lens, float ready) {
    vec3 local = view * ray;
    vec2 localUv = 0.5 + local.xy / (2.0 * max(abs(local.z), 0.00001) * lens);
    // Derivatives are evaluated before the per-fragment branch. Both the sky
    // and the contact receiver therefore use the same mip footprint at edges.
    vec2 uvDx = dFdx(localUv), uvDy = dFdy(localUv);
    vec2 edge = smoothstep(vec2(0.0), vec2(0.15), localUv)
      * (vec2(1.0) - smoothstep(vec2(0.85), vec2(1.0), localUv));
    float weight = edge.x * edge.y * ready * step(0.00001, local.z);
    if (weight <= 0.0) return vec4(0.0);
    return vec4(textureGrad(image, localUv, uvDx, uvDy).rgb * weight, weight);
  }
  #else
  ${Array.from({ length: 4 }, (_, i) => `uniform sampler2D detail${i}; uniform vec4 detailRect${i}; uniform float detailReady${i};`).join('\n')}
  vec4 detailSample(sampler2D image, vec2 skyUv, vec4 rect, float ready) {
    float deltaU = fract(skyUv.x - rect.x + 0.5) - 0.5;
    vec2 localUv = vec2(deltaU / rect.y + 0.5, (skyUv.y - rect.z) / (rect.w - rect.z));
    vec2 edge = smoothstep(vec2(0.0), vec2(0.12), localUv)
      * (vec2(1.0) - smoothstep(vec2(0.88), vec2(1.0), localUv));
    float weight = edge.x * edge.y * ready;
    return vec4(texture2D(image, clamp(localUv, 0.0, 1.0)).rgb * weight, weight);
  }
  #endif
  vec3 samplePanorama(vec3 worldDirection) {
    vec3 skyDirection = skyRotation * worldDirection;
    vec2 skyUv = equirectUv(normalize(skyDirection));
    // Longitude wraps once per turn. Treat its derivatives periodically so
    // the seam cannot request a blurred whole-image mipmap on one pixel row.
    vec2 uvDx = dFdx(skyUv);
    vec2 uvDy = dFdy(skyUv);
    uvDx.x -= floor(uvDx.x + 0.5);
    uvDy.x -= floor(uvDy.x + 0.5);
    vec3 base = textureGrad(panorama, skyUv, uvDx, uvDy).rgb;
    // Hand-painted panoramas can retain a slight edge-colour difference.
    // Join only the final two degrees on each side, without stretching the
    // interior image. Both sides meet at the same average at longitude zero.
    float seamDistance = min(skyUv.x, 1.0 - skyUv.x);
    const float seamWidth = 2.0 / 360.0;
    if (seamDistance < seamWidth) {
      vec2 otherUv = vec2(1.0 - skyUv.x, skyUv.y);
      vec3 other = textureGrad(panorama, otherUv, vec2(-uvDx.x, uvDx.y), vec2(-uvDy.x, uvDy.y)).rgb;
      float join = 0.5 * (1.0 - smoothstep(0.0, seamWidth, seamDistance));
      base = mix(base, other, join);
    }
    vec4 details = vec4(0.0);
    #ifdef USE_DIRECTIONAL_PANELS
    ${Array.from({ length: 8 }, (_, i) => `details += panelSample(panel${i}, skyDirection, panelView${i}, panelLens${i}, panelReady${i});`).join('\n')}
    #else
    ${Array.from({ length: 4 }, (_, i) => `details += detailSample(detail${i}, skyUv, detailRect${i}, detailReady${i});`).join('\n')}
    #endif
    return mix(base, details.rgb / max(details.a, 0.00001), min(details.a, 1.0)) * brightness;
  }
`;

/** A depth-writing snow receiver that preserves the actual background pixels. */
export function createProjectiveGroundMaterial(assembly: { value: number } = { value: 1 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPhoto: { value: null },
      uPhotoBrightness: { value: 1 },
      uPhotoWorldToLocal: { value: new THREE.Matrix4() },
      uPhotoReady: { value: 0 },
      uPanoramaMode: { value: 0 },
      uGroundAssembly: assembly,
      uCompanionReady: { value: 0 },
      uCompanionCenter: { value: new THREE.Vector2() },
      uCompanionRotation: { value: new THREE.Vector2(1, 0) },
      uCompanionBody: { value: new THREE.Vector4() },
      uCompanionPaws: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
      ...createPanoramaUniforms(null),
    },
    vertexShader: /* glsl */ `
      attribute float aSnowContact;
      varying vec3 vWorldPosition;
      varying vec2 vSnowGround;
      varying float vSnowContact;
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vSnowGround = position.xz;
        vSnowContact = aSnowContact;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uPhoto;
      uniform float uPhotoBrightness;
      uniform mat4 uPhotoWorldToLocal;
      uniform float uPhotoReady;
      uniform float uPanoramaMode;
      uniform float uGroundAssembly;
      uniform float uCompanionReady;
      uniform vec2 uCompanionCenter;
      uniform vec2 uCompanionRotation;
      uniform vec4 uCompanionBody;
      uniform vec4 uCompanionPaws[4];
      varying vec3 vWorldPosition;
      varying vec2 vSnowGround;
      varying float vSnowContact;
      ${PANORAMA_SAMPLING_GLSL}
      float companionFootprint(vec2 point, vec4 contact) {
        vec2 radius = max(contact.zw, vec2(0.0001));
        return (1.0 - smoothstep(0.15, 1.0, length((point - contact.xy) / radius)))
          * step(0.0001, min(contact.z, contact.w));
      }
      float companionContact(vec2 ground) {
        vec2 offset = ground - uCompanionCenter;
        vec2 local = vec2(uCompanionRotation.x * offset.x - uCompanionRotation.y * offset.y,
          uCompanionRotation.y * offset.x + uCompanionRotation.x * offset.y);
        float shade = 0.08 * companionFootprint(local, uCompanionBody);
        for (int i = 0; i < 4; i++) shade = max(shade, 0.20 * companionFootprint(local, uCompanionPaws[i]));
        return shade * uCompanionReady;
      }
      void main() {
        if (uPhotoReady < 0.5) discard;
        vec3 base;
        if (uPanoramaMode > 0.5) {
          // The snow belongs to the fixed environment, just like the roots.
          // Its capture ray must not depend on the moving viewing camera.
          base = samplePanorama(vWorldPosition - panoramaOrigin);
        } else {
          vec3 cameraLocal = (uPhotoWorldToLocal * vec4(cameraPosition, 1.0)).xyz;
          vec3 receiverLocal = (uPhotoWorldToLocal * vec4(vWorldPosition, 1.0)).xyz;
          vec3 rayLocal = receiverLocal - cameraLocal;
          if (abs(rayLocal.z) < 0.000001) discard;
          float travel = -cameraLocal.z / rayLocal.z;
          if (travel <= 0.0) discard;
          vec2 photoUv = cameraLocal.xy + travel * rayLocal.xy + 0.5;
          // The shared sRGB texture is decoded once, just as in the sky.
          base = texture2D(uPhoto, photoUv).rgb * uPhotoBrightness;
        }
        float localContact = clamp(vSnowContact, 0.0, 0.43)
          * (1.0 - smoothstep(5.0, 7.0, length(vSnowGround)));
        float shade = max(localContact * clamp(uGroundAssembly, 0.0, 1.0), companionContact(vSnowGround));
        // Only darken actual root contact. No independently lit white ground,
        // radial alpha, fog colour or added glow can form a pale circular pad.
        gl_FragColor = vec4(base * (1.0 - shade), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    fog: false,
    lights: false,
  });
}

/** Contact stays on the snow while the companion's upper body can animate. */
export function setGroundCompanionContact(material: THREE.ShaderMaterial, contact: GroundCompanionContact | null) {
  material.uniforms.uCompanionReady.value = contact ? 1 : 0;
  if (!contact) return;
  material.uniforms.uCompanionCenter.value.set(...contact.position);
  material.uniforms.uCompanionRotation.value.set(Math.cos(contact.yaw), Math.sin(contact.yaw));
  material.uniforms.uCompanionBody.value.set(...contact.body);
  const paws = material.uniforms.uCompanionPaws.value as THREE.Vector4[];
  for (let i = 0; i < paws.length; i++) paws[i].set(...(contact.paws[i] ?? [0, 0, 0, 0]));
}

/** Borrow the background texture; the background remains its only owner. */
export function bindProjectiveGroundMaterial(
  material: THREE.ShaderMaterial,
  background: BackgroundSurface | null,
) {
  const source = background?.material.uniforms;
  const panorama = !!source && 'panorama' in source;
  const photo = panorama ? source?.panorama.value : source?.picture?.value;
  if (!background || !(photo instanceof THREE.Texture)) {
    material.uniforms.uPhoto.value = null;
    material.uniforms.uPhotoReady.value = 0;
    material.uniforms.uPanoramaMode.value = 0;
    material.uniforms.panorama.value = null;
    for (let i = 0; i < 4; i++) {
      material.uniforms[`detail${i}`].value = null;
      material.uniforms[`detailReady${i}`].value = 0;
    }
    for (let i = 0; i < 8; i++) {
      material.uniforms[`panel${i}`].value = null;
      material.uniforms[`panelReady${i}`].value = 0;
    }
    return false;
  }
  material.uniforms.uPhoto.value = photo;
  material.uniforms.uPhotoBrightness.value = background.material.uniforms.brightness.value;
  material.uniforms.uPhotoWorldToLocal.value.copy(background.matrixWorld).invert();
  material.uniforms.uPanoramaMode.value = panorama ? 1 : 0;
  material.uniforms.panorama.value = photo;
  material.uniforms.brightness.value = background.material.uniforms.brightness.value;
  const panelMode = panorama && !!background.material.defines.USE_DIRECTIONAL_PANELS;
  if (!!material.defines.USE_DIRECTIONAL_PANELS !== panelMode) {
    if (panelMode) material.defines.USE_DIRECTIONAL_PANELS = 1;
    else delete material.defines.USE_DIRECTIONAL_PANELS;
    material.needsUpdate = true;
  }
  if (panorama) {
    material.uniforms.panoramaOrigin.value.setFromMatrixPosition(background.matrixWorld);
    material.uniforms.skyRotation.value.copy(source!.skyRotation.value);
    for (let i = 0; i < 4; i++) {
      material.uniforms[`detail${i}`].value = source![`detail${i}`]?.value ?? photo;
      material.uniforms[`detailReady${i}`].value = source![`detailReady${i}`]?.value ?? 0;
      if (source![`detailRect${i}`]) material.uniforms[`detailRect${i}`].value.copy(source![`detailRect${i}`].value);
    }
    for (let i = 0; i < 8; i++) {
      material.uniforms[`panel${i}`].value = source![`panel${i}`]?.value ?? photo;
      material.uniforms[`panelReady${i}`].value = source![`panelReady${i}`]?.value ?? 0;
      if (source![`panelView${i}`]) material.uniforms[`panelView${i}`].value.copy(source![`panelView${i}`].value);
      if (source![`panelLens${i}`]) material.uniforms[`panelLens${i}`].value.copy(source![`panelLens${i}`].value);
    }
  }
  material.uniforms.uPhotoReady.value = 1;
  return true;
}
