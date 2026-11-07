import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GROUND_Y } from './tree-profile';

interface Props { state: 'FORMED' | 'CHAOS'; reducedMotion: boolean }

/** A world-space snow surface with a contact shadow anchored to the stem. */
export default function SnowGround({ state, reducedMotion }: Props) {
  const { invalidate, scene, gl, size } = useThree();
  const ground = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(440, 440, 100, 100);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const awayFromStem = 1 - Math.exp(-(x * x + z * z) * 0.045);
      positions.setY(index, (Math.sin(x * 0.19 + z * 0.06) * 0.11 + Math.cos(z * 0.23) * 0.09) * awayFromStem);
    }
    geometry.computeVertexNormals();
    // The bump texture is tiny, repeatable and generated locally, so snow has
    // granular grazing light without another downloaded texture dependency.
    const pixels = new Uint8Array(128 * 128 * 4);
    let seed = 0x730ead;
    for (let i = 0; i < pixels.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = 105 + Math.floor((seed / 4294967296) * 100);
      pixels.set([value, value, value, 255], i);
    }
    const bump = new THREE.DataTexture(pixels, 128, 128, THREE.RGBAFormat);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(200, 200);
    bump.magFilter = THREE.LinearFilter;
    bump.minFilter = THREE.LinearMipmapLinearFilter;
    bump.generateMipmaps = true;
    bump.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({
      color: '#b3b2cf', roughness: 0.94, metalness: 0,
      bumpMap: bump, bumpScale: 0.022,
      transparent: true, depthWrite: true,
    });
    const assembly = { value: 1 };
    const backdrop = { value: bump as THREE.Texture };
    const hasBackdrop = { value: 0 };
    const backdropMatrix = { value: new THREE.Matrix3() };
    const backdropBrightness = { value: 1 };
    const resolution = { value: new THREE.Vector2(1, 1) };
    material.onBeforeCompile = shader => {
      shader.uniforms.uGroundAssembly = assembly;
      shader.uniforms.uGroundBackdrop = backdrop;
      shader.uniforms.uGroundHasBackdrop = hasBackdrop;
      shader.uniforms.uGroundBackdropMatrix = backdropMatrix;
      shader.uniforms.uGroundBackdropBrightness = backdropBrightness;
      shader.uniforms.uGroundResolution = resolution;
      shader.vertexShader = 'varying vec2 vSnowGround;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnowGround = position.xz;');
      shader.fragmentShader = /* glsl */ `
        varying vec2 vSnowGround;
        uniform float uGroundAssembly;
        uniform sampler2D uGroundBackdrop;
        uniform float uGroundHasBackdrop;
        uniform mat3 uGroundBackdropMatrix;
        uniform float uGroundBackdropBrightness;
        uniform vec2 uGroundResolution;
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        float groundRadius = length(vSnowGround);
        float stemContact = exp(-groundRadius * groundRadius * 1.65) * 0.76;
        float canopyShadow = exp(-dot(vSnowGround / vec2(5.8, 4.7), vSnowGround / vec2(5.8, 4.7))) * 0.40;
        diffuseColor.rgb *= 1.0 - min(0.90, stemContact + canopyShadow) * uGroundAssembly;
        // A subtle warm pool ties the light string to the snow below it.
        diffuseColor.rgb += vec3(0.046, 0.020, 0.003) * exp(-groundRadius * groundRadius / 80.0) * uGroundAssembly;
        // The distant surface softly meets the photographic snow field.
        diffuseColor.a *= 1.0 - smoothstep(60.0, 175.0, groundRadius);
        if (diffuseColor.a < 0.012) discard;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', /* glsl */ `
        if (uGroundHasBackdrop > 0.5) {
          // Project the same photographic plate onto distant snow. The floor
          // then meets its real backdrop without a pale disc or a second horizon.
          vec2 imageUv = (uGroundBackdropMatrix * vec3(gl_FragCoord.xy / uGroundResolution, 1.0)).xy;
          vec3 photographicSnow = texture2D(uGroundBackdrop, imageUv).rgb * uGroundBackdropBrightness;
          float contact = min(0.90, stemContact + canopyShadow) * uGroundAssembly;
          vec3 localSnow = mix(photographicSnow * (1.0 - contact), outgoingLight * 0.30, 0.28);
          outgoingLight = mix(photographicSnow, localSnow, 1.0 - smoothstep(10.0, 55.0, groundRadius));
        }
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey = () => 'grounded-snow-contact-v2';
    return { geometry, material, bump, assembly, backdrop, hasBackdrop, backdropMatrix, backdropBrightness, resolution };
  }, []);
  useEffect(() => {
    if (reducedMotion) ground.assembly.value = state === 'FORMED' ? 1 : 0;
    invalidate();
  }, [ground, state, reducedMotion, invalidate]);
  useFrame((_, delta) => {
    const target = state === 'FORMED' ? 1 : 0;
    ground.assembly.value = reducedMotion ? target : THREE.MathUtils.damp(ground.assembly.value, target, 3.2, Math.min(delta, 0.05));
    const texture = scene.background;
    ground.hasBackdrop.value = texture instanceof THREE.Texture ? 1 : 0;
    if (texture instanceof THREE.Texture) {
      ground.backdrop.value = texture;
      ground.backdropMatrix.value.copy(texture.matrix);
      ground.backdropBrightness.value = scene.backgroundIntensity;
    }
    const ratio = Math.min(gl.getPixelRatio(), size.width < 700 ? 1 : 1.5);
    ground.resolution.value.set(Math.max(1, size.width * ratio), Math.max(1, size.height * ratio));
  });
  useEffect(() => () => { ground.geometry.dispose(); ground.material.dispose(); ground.bump.dispose(); }, [ground]);
  return <mesh geometry={ground.geometry} material={ground.material} position={[0, GROUND_Y, 0]} renderOrder={-2} />;
}
