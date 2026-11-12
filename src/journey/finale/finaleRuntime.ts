import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry,
  DoubleSide, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh,
  LineBasicMaterial, LineSegments, Mesh, MeshPhysicalMaterial, Object3D,
  PerspectiveCamera, PlaneGeometry, Points, ShaderMaterial, SphereGeometry,
  Vector3, Vector4,
} from 'three';
import type { Material, MeshPhysicalMaterialParameters } from 'three';
import type { RideBurst } from '../rideTypes';
import {
  clamp, CONSTELLATION_EDGES, CONSTELLATION_POINTS, FIREWORK_SCORE,
  GARDEN_LIGHTS, smooth, unit,
} from './finaleScore';
import type { FireworkCue } from './finaleScore';
import { makeButterflyWing, makeLanternGeometry, makePetalGeometry, makeRippleGeometry } from './finaleGeometry';

export const FINALE_CAMERA_Z = 28;
export const FINALE_FOV = 44;
export const FINALE_SOURCE_ASPECT = 941 / 1672;
const HALF_TANGENT = Math.tan(FINALE_FOV * Math.PI / 360);
const TAU = Math.PI * 2;
const SPARK_CAPACITY = 768;
const GLOW_CAPACITY = 144;
const palette = [new Color('#f5c77d'), new Color('#f6c9d9'), new Color('#d8e6ff'), new Color('#e3d4f4')];
const ivory = new Color('#fff0c8');
const pink = new Color('#e8a7c4');
const white = new Color('#fff2da');

/** Coordinates stay registered to the unchanged 941 × 1672 background plate. */
export function sourcePoint(out: Vector3, x: number, y: number, z = 0) {
  const halfHeight = (FINALE_CAMERA_Z - z) * HALF_TANGENT;
  return out.set((x * 2 - 1) * halfHeight * FINALE_SOURCE_ASPECT, (1 - y * 2) * halfHeight, z);
}

function physical(parameters: MeshPhysicalMaterialParameters) {
  const material = new MeshPhysicalMaterial({
    transparent: true, depthWrite: false, side: DoubleSide, roughness: .38,
    metalness: .12, clearcoat: .4, ...parameters,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float finaleOpacity; varying float vFinaleOpacity;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFinaleOpacity=finaleOpacity;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFinaleOpacity;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a*=vFinaleOpacity;');
  };
  material.customProgramCacheKey = () => 'palace-finale-opacity-v1';
  return material;
}

function makeGlowPoints(capacity: number, skyOnly: boolean) {
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
  const color = new BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
  const alpha = new BufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);
  const size = new BufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);
  const angle = new BufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);
  const stretch = new BufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);
  const softness = new BufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', position); geometry.setAttribute('sparkColor', color);
  geometry.setAttribute('sparkAlpha', alpha); geometry.setAttribute('sparkSize', size);
  geometry.setAttribute('sparkAngle', angle); geometry.setAttribute('sparkStretch', stretch);
  geometry.setAttribute('sparkSoftness', softness);
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
    uniforms: { uDpr: { value: 1 }, uSkyOnly: { value: skyOnly ? 1 : 0 } },
    vertexShader: `
      attribute vec3 sparkColor; attribute float sparkAlpha; attribute float sparkSize;
      attribute float sparkAngle; attribute float sparkStretch; attribute float sparkSoftness;
      uniform float uDpr; uniform float uSkyOnly;
      varying vec3 vColor; varying float vAlpha; varying float vAngle;
      varying float vStretch; varying float vSoftness;
      void main(){
        vec4 p=modelViewMatrix*vec4(position,1.0);
        float sourceY=.5-position.y/(2.0*.4040262258*(28.0-position.z));
        float sky=1.0-smoothstep(.405,.43,sourceY);
        vAlpha=sparkAlpha*mix(1.0,sky,uSkyOnly); vColor=sparkColor;
        vAngle=sparkAngle; vStretch=sparkStretch; vSoftness=sparkSoftness;
        gl_PointSize=clamp(sparkSize*uDpr*28.0/max(4.0,-p.z),1.0,84.0*uDpr);
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha; varying float vAngle;
      varying float vStretch; varying float vSoftness;
      void main(){
        vec2 p=(gl_PointCoord-.5)*2.0;
        float c=cos(vAngle), s=sin(vAngle);
        vec2 q=vec2(c*p.x+s*p.y,-s*p.x+c*p.y);
        float r=dot(p,p);
        if(r>1.0||vAlpha<.001)discard;
        float soft=exp(-r*mix(7.0,3.0,vSoftness));
        float core=exp(-r*28.0)*(1.0-vSoftness*.8);
        float tail=exp(-pow((q.x+.22)*1.55,2.0)-q.y*q.y*25.0)*vStretch;
        float edge=1.0-smoothstep(.72,1.0,r);
        float a=(soft*.45+core*.65+tail*.36)*edge*vAlpha;
        gl_FragColor=vec4(mix(vColor,vec3(1.0,.96,.86),core*.28),a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const object = new Points(geometry, material);
  object.frustumCulled = false; object.renderOrder = skyOnly ? 3 : 4;
  let count = 0;
  return {
    object, geometry, material,
    begin() { count = 0; },
    put(point: Vector3, tint: Color, opacity: number, pixels: number, rotation = 0, trail = 0, soft = 0) {
      if (count >= capacity || opacity <= .001) return;
      position.setXYZ(count, point.x, point.y, point.z);
      color.setXYZ(count, tint.r, tint.g, tint.b); alpha.setX(count, opacity);
      size.setX(count, pixels); angle.setX(count, rotation); stretch.setX(count, trail); softness.setX(count, soft);
      count++;
    },
    finish() {
      geometry.setDrawRange(0, count); object.visible = count > 0;
      for (const attribute of [position, color, alpha, size, angle, stretch, softness]) attribute.needsUpdate = true;
      return count;
    },
    setDpr(value: number) { material.uniforms.uDpr.value = value; },
  };
}

/** 768 firework sparks + 144 lights + 240 solid instances; all pools are bounded. */
export function makeFinaleWorld(camera: PerspectiveCamera) {
  const object = new Group();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const instancedMeshes: InstancedMesh[] = [];
  const point = new Vector3(); const origin = new Vector3(); const target = new Vector3();
  const temp = new Vector3();
  const dummy = new Object3D();
  const sparks = makeGlowPoints(SPARK_CAPACITY, true);
  const glows = makeGlowPoints(GLOW_CAPACITY, false);
  object.add(sparks.object, glows.object);
  geometries.add(sparks.geometry); geometries.add(glows.geometry);
  materials.add(sparks.material); materials.add(glows.material);

  const batch = (geometry: BufferGeometry, material: Material, count: number) => {
    const opacity = new InstancedBufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute('finaleOpacity', opacity);
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.renderOrder = 2; object.add(mesh); geometries.add(geometry); materials.add(material); instancedMeshes.push(mesh);
    for (let i = 0; i < count; i++) mesh.setColorAt(i, white);
    let anyVisible = false;
    return {
      begin() { anyVisible = false; },
      set(index: number, p: Vector3, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number, a: number, tint?: Color) {
        anyVisible ||= a > .001;
        dummy.position.copy(p); dummy.scale.set(sx, sy, sz); dummy.rotation.set(rx, ry, rz); dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix); opacity.setX(index, a);
        if (tint) mesh.setColorAt(index, tint);
      },
      finish() {
        mesh.visible = anyVisible; mesh.instanceMatrix.needsUpdate = true; opacity.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      },
    };
  };

  const gold = physical({ color: '#bc8f53', metalness: .75, roughness: .32, emissive: '#eeb76c', emissiveIntensity: .025 });
  const lanterns = batch(makeLanternGeometry(), physical({ color: '#ffe3ae', metalness: 0,
    roughness: .8, clearcoat: 0, emissive: '#f9ae58', emissiveIntensity: .4 }), 48);
  const lanternRims = batch(new CylinderGeometry(.14, .14, .018, 12, 1, true), gold, 48);
  const lanternFlames = batch(new SphereGeometry(1, 8, 6), physical({ color: '#ffdfa0',
    emissive: '#ffc06f', emissiveIntensity: 1.1, roughness: .55, metalness: 0, clearcoat: 0 }), 48);
  const wingMaterial = physical({ color: '#f7decf', metalness: .2, roughness: .3,
    clearcoat: .65, emissive: '#e0bb86', emissiveIntensity: .08 });
  const leftWings = batch(makeButterflyWing(-1), wingMaterial, 18);
  const rightWings = batch(makeButterflyWing(1), wingMaterial, 18);
  const butterflyBodies = batch(new SphereGeometry(1, 8, 6), gold, 18);
  const petals = batch(makePetalGeometry(), physical({ color: '#edb6cf', metalness: .035,
    roughness: .52, clearcoat: .18, emissive: '#a96b83', emissiveIntensity: .045 }), 36);
  const rippleMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
    uniforms: {},
    vertexShader: `attribute float finaleOpacity; varying vec2 vUv; varying float vAlpha;
      void main(){vUv=uv;vAlpha=finaleOpacity;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv; varying float vAlpha;
      void main(){vec2 p=(vUv-.5)*2.0; float r=length(p);
        float rings=exp(-pow((r-.78)*60.0,2.0))*.55+exp(-pow((r-.95)*75.0,2.0))*.3;
        gl_FragColor=vec4(.93,.78,.48,rings*vAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const ripples = batch(makeRippleGeometry(), rippleMaterial, 6);
  const batches = [lanterns, lanternRims, lanternFlames, leftWings, rightWings, butterflyBodies, petals, ripples];

  const linePositions: number[] = [];
  for (const [a, b] of CONSTELLATION_EDGES) {
    for (const index of [a, b]) {
      const p = CONSTELLATION_POINTS[index]; sourcePoint(point, p[0], p[1], -8);
      linePositions.push(point.x, point.y, point.z);
    }
  }
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new BufferAttribute(new Float32Array(linePositions), 3));
  const lineMaterial = new LineBasicMaterial({ color: '#e9d6b1', transparent: true,
    opacity: 0, blending: AdditiveBlending, depthTest: false, depthWrite: false });
  const constellation = new LineSegments(lineGeometry, lineMaterial);
  constellation.frustumCulled = false; object.add(constellation); geometries.add(lineGeometry); materials.add(lineMaterial);

  const reflections = Array.from({ length: 4 }, () => new Vector4(0, 0, 0, 0));
  const waterGeometry = new PlaneGeometry(1, 1);
  const waterMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAwake: { value: 0 }, uReflections: { value: reflections } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uAwake; uniform vec4 uReflections[4];
      void main(){
        float edge=smoothstep(0.0,.1,vUv.y)*(1.0-smoothstep(.92,1.0,vUv.y));
        float wave=.5+.5*sin(vUv.y*235.0+uTime*1.1+sin(vUv.x*49.0+uTime*.36)*1.8);
        float stripe=pow(wave,18.0)*(.45+.55*sin(vUv.x*163.0+vUv.y*37.0+uTime*.24)*sin(vUv.x*163.0+vUv.y*37.0+uTime*.24));
        float gold=exp(-pow((vUv.x-.46)*12.0,2.0))+exp(-pow((vUv.x-.55)*13.0,2.0));
        gold+=.5*exp(-pow((vUv.x-.27)*19.0,2.0))+.5*exp(-pow((vUv.x-.73)*19.0,2.0));
        vec3 light=vec3(1.0,.69,.31)*gold*uAwake*.16;
        for(int i=0;i<4;i++){
          float width=.025+.045*(1.0-vUv.y);
          float reflected=exp(-pow((vUv.x-uReflections[i].x)/width,2.0))*uReflections[i].y;
          vec3 tint=mix(vec3(1.0,.68,.32),vec3(.76,.81,1.0),uReflections[i].z);
          light+=tint*reflected*.22;
        }
        float a=min(.22,max(light.r,max(light.g,light.b))*stripe*edge);
        gl_FragColor=vec4(light/max(.001,max(light.r,max(light.g,light.b))),a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  sourcePoint(point, .5, (.711 + .881) / 2, 0);
  const water = new Mesh(waterGeometry, waterMaterial);
  water.position.copy(point);
  water.scale.set(2 * FINALE_CAMERA_Z * HALF_TANGENT * FINALE_SOURCE_ASPECT,
    2 * FINALE_CAMERA_Z * HALF_TANGENT * (.881 - .711), 1);
  water.frustumCulled = false; water.renderOrder = 1; object.add(water);
  geometries.add(waterGeometry); materials.add(waterMaterial);

  let effectClock = 0;
  const interactive: Array<{ cue: FireworkCue; born: number }> = [];

  // The choreography and firework renderer below are functions of absolute time.
  // Seeking therefore reconstructs the exact scene instead of replaying missed cues.

  const lifetime = (cue: FireworkCue) => cue.shape === 'willow' ? 4.9 : cue.shape === 'palm' ? 4.1 : 3.8;
  const reflect = (cue: FireworkCue, strength: number) => {
    if (strength <= .001) return;
    let weakest = 0;
    for (let i = 1; i < reflections.length; i++) if (reflections[i].y < reflections[weakest].y) weakest = i;
    if (reflections[weakest].y < strength) reflections[weakest].set(cue.x, strength, cue.color === 2 ? .88 : cue.color === 1 ? .32 : .06, 0);
  };

  const drawFirework = (cue: FireworkCue, age: number, reduced: boolean) => {
    const life = lifetime(cue);
    if (age < -1.08 || age > life) return;
    sourcePoint(target, cue.x, cue.y, cue.z);
    const tint = palette[cue.color % palette.length];
    if (age < 0) {
      if (reduced) return;
      sourcePoint(origin, .5 + (cue.x - .5) * .25, .438, cue.z);
      // A rising shell emerges above the castle; no trail is painted through stone.
      for (let i = 0; i < 13; i++) {
        const p = clamp((age + 1.08 - i * .018) / 1.08);
        const rise = 1 - Math.pow(1 - p, 1.35);
        point.lerpVectors(origin, target, rise);
        point.x += Math.sin(p * Math.PI) * .14;
        sparks.put(point, ivory, (1 - i / 13) * .62 * smooth(0, .18, p),
          i ? 4.1 : 6.3, -Math.PI / 2, .65, .05);
      }
      return;
    }
    const count = reduced ? Math.ceil(cue.count * .52) : cue.count;
    const appearance = smooth(0, reduced ? 1.25 : .28, age);
    const fade = 1 - smooth(reduced ? 1.8 : .8, life, age);
    const opacity = appearance * fade * (reduced ? .5 : .72);
    const a = reduced ? 1.65 : age;
    const drag = .22;
    const radialTime = (1 - Math.exp(-drag * a)) / drag;
    const gravity = cue.shape === 'willow' ? .5 : cue.shape === 'palm' ? .29 : .18;
    for (let i = 0; i < count; i++) {
      const seed = cue.seed * 17 + i * 13;
      const sphereY = 1 - 2 * (i + .5) / count;
      const sphereR = Math.sqrt(Math.max(0, 1 - sphereY * sphereY));
      const angle = i * 2.3999632297 + unit(cue.seed) * TAU;
      let dx = Math.cos(angle) * sphereR;
      let dy = sphereY;
      let dz = Math.sin(angle) * sphereR;
      if (cue.shape === 'ring') {
        const theta = i / count * TAU;
        dx = Math.cos(theta); dy = Math.sin(theta) * .84; dz = Math.sin(theta) * .27;
      } else if (cue.shape === 'palm') {
        const theta = Math.floor(i / (count / 9)) / 9 * TAU + (unit(seed) - .5) * .12;
        dx = Math.cos(theta); dy = Math.sin(theta) * .78 + .1; dz = (unit(seed + 1) - .5) * .55;
      } else if (cue.shape === 'willow') {
        dy = sphereY * .65 + .27;
      }
      const speed = cue.size / 1.55 * (.76 + unit(seed + 2) * .32);
      point.set(target.x + dx * speed * radialTime,
        target.y + dy * speed * radialTime - gravity * a * a * .5,
        target.z + dz * speed * radialTime);
      const vx = dx * speed * Math.exp(-drag * a);
      const vy = dy * speed * Math.exp(-drag * a) - gravity * a;
      const shimmer = reduced ? 1 : .9 + .1 * Math.sin(age * 2.2 + seed);
      const size = (3.6 + unit(seed + 3) * 2.5) * (cue.shape === 'willow' ? 1.14 : 1);
      sparks.put(point, i % 9 ? tint : ivory, opacity * shimmer,
        size + (reduced ? 0 : Math.min(2.4, age * .65)), Math.atan2(-vy, vx),
        reduced ? 0 : clamp(age * .3), .08 + Math.abs(dz) * .12);
    }
    reflect(cue, appearance * fade * .75);
  };

  const render = (inputTime: number, delta: number, reduced: boolean) => {
    const time = clamp(inputTime, 0, 90);
    effectClock += clamp(delta, 0, .07);
    sparks.begin(); glows.begin(); batches.forEach(b => b.begin());
    reflections.forEach(value => value.set(0, 0, 0, 0));

    // 0–15 seconds: the existing garden lamps and their water reflections awaken.
    for (let i = 0; i < GARDEN_LIGHTS.length; i++) {
      const [x, y] = GARDEN_LIGHTS[i];
      const awake = smooth(.7 + i * .55, 3.5 + i * .55, time);
      sourcePoint(point, x, y, -3);
      glows.put(point, ivory, awake * .17, 38, 0, 0, 1);
    }
    const waterWake = smooth(1, 13, time);
    waterMaterial.uniforms.uTime.value = reduced ? 0 : time;
    waterMaterial.uniforms.uAwake.value = waterWake;
    for (let i = 0; i < 10; i++) {
      const born = 2.5 + i * .85;
      const alpha = smooth(born, born + 1.8, time) * (1 - smooth(13, 18, time));
      const x = .3 + i / 9 * .4;
      const y = .792 + Math.sin(i * .8) * .018;
      sourcePoint(point, x, y, 1);
      glows.put(point, ivory, alpha * .72, 6.2, 0, 0, .15);
    }
    for (let i = 0; i < 40; i++) {
      const phase = unit(i + 71) * TAU;
      const alpha = smooth(3 + unit(i + 91) * 8, 12 + unit(i + 92) * 5, time) * (1 - smooth(29, 39, time));
      const x = .13 + unit(i + 5) * .74 + (reduced ? 0 : Math.sin(time * .32 + phase) * .009);
      const y = .715 + unit(i + 21) * .125 + (reduced ? 0 : Math.sin(time * .42 + phase) * .006);
      sourcePoint(point, x, y, -2 + unit(i + 43) * 5);
      glows.put(point, i % 5 ? ivory : palette[1], alpha * .4, 3.4 + unit(i + 7) * 2.5, 0, 0, .25);
    }
    const rippleBirths = [1.3, 3.6, 6.0, 8.6, 11.1, 13.4];
    for (let i = 0; i < 6; i++) {
      const age = time - rippleBirths[i];
      const alpha = smooth(0, .8, age) * (1 - smooth(1, 4, age));
      const radius = reduced ? .6 + i * .06 : .18 + clamp(age, 0, 4) * .42;
      sourcePoint(point, .38 + unit(i + 1) * .25, .77 + unit(i + 2) * .065, 1.1);
      ripples.set(i, point, radius, radius * .12, 1, 0, 0, 0, alpha * .6);
    }

    // 15–35 seconds: 48 individually timed paper lanterns, at three distances.
    for (let i = 0; i < 48; i++) {
      const seed = i * 7 + 31;
      const born = 15 + i * .32 + unit(seed) * .45;
      const age = time - born;
      const life = 22 + unit(seed + 1) * 5;
      const travel = reduced ? life * .5 : clamp(age, 0, life);
      const depth = i < 20 ? -12 - unit(seed + 2) * 4 : i < 40 ? -5 + unit(seed + 2) * 3 : 1 + unit(seed + 2) * 3;
      sourcePoint(origin, .16 + unit(seed + 3) * .68, .752 + unit(seed + 4) * .014, depth);
      const phase = unit(seed + 5) * TAU;
      point.set(origin.x + Math.sin(travel * .38 + phase) * (.15 + travel * .012),
        origin.y + travel * (.68 + unit(seed + 6) * .18), origin.z - travel * .08);
      const sourceY = .5 - point.y / (2 * (FINALE_CAMERA_Z - point.z) * HALF_TANGENT);
      const alpha = smooth(0, reduced ? 3.3 : 1.7, age) * (1 - smooth(life - 3.5, life, age))
        * (1 - smooth(50, 55, time)) * smooth(-.04, .055, sourceY);
      const scale = (i >= 40 ? 1.18 : .7) + unit(seed + 7) * .28;
      const yaw = phase + (reduced ? 0 : travel * .12);
      lanterns.set(i, point, scale, scale, scale, 0, yaw, 0, alpha);
      temp.copy(point); temp.y -= scale * .34;
      lanternRims.set(i, temp, scale, scale, scale, 0, yaw, 0, alpha * .9);
      temp.copy(point); temp.y -= scale * .24;
      lanternFlames.set(i, temp, scale * .024, scale * .06, scale * .024, 0, yaw, 0, alpha * .85);
      glows.put(temp, ivory, alpha * .11, 31 * scale, 0, 0, 1);
    }

    // 35–55 seconds: butterflies rise from the foreground roses, then settle
    // into a single constellation; petals describe a separate spiralling path.
    const morph = smooth(48.5, 53.8, time);
    for (let i = 0; i < 18; i++) {
      const seed = i * 9 + 320;
      const born = 35 + i * .23;
      const age = time - born;
      const progress = smooth(0, 13.5 + unit(seed) * 1.5, age);
      const p = reduced ? .83 : progress;
      const end = CONSTELLATION_POINTS[Math.floor(i / 18 * CONSTELLATION_POINTS.length)];
      sourcePoint(origin, i % 2 ? .88 - unit(seed + 1) * .08 : .12 + unit(seed + 1) * .08, .885, 4);
      sourcePoint(target, end[0], end[1], -8);
      point.lerpVectors(origin, target, p);
      point.x += Math.sin(p * TAU + i) * Math.sin(p * Math.PI) * .65;
      point.y += Math.sin(p * Math.PI) * 1.7;
      const phase = unit(seed + 2) * TAU;
      const flap = reduced ? .3 : .12 + Math.sin(Math.max(0, age) * 18 + phase) * .78;
      const yaw = reduced ? .1 : Math.sin(age * 1.4 + phase) * .35;
      const tilt = Math.sin(phase) * .25;
      const scale = .23 + unit(seed + 3) * .14;
      const alpha = smooth(0, 1.6, age) * (1 - morph);
      leftWings.set(i, point, scale, scale, scale, .1, yaw + flap, tilt, alpha, i % 3 ? ivory : pink);
      rightWings.set(i, point, scale, scale, scale, .1, yaw - flap, tilt, alpha, i % 3 ? ivory : pink);
      butterflyBodies.set(i, point, scale * .055, scale * .28, scale * .045, .1, yaw, tilt, alpha);
    }
    for (let i = 0; i < 36; i++) {
      const seed = 700 + i * 11;
      const born = 35.5 + unit(seed) * 6;
      const age = time - born;
      const p = reduced ? .65 : smooth(0, 13.5, age);
      sourcePoint(origin, i % 2 ? .83 + unit(seed + 1) * .1 : .07 + unit(seed + 1) * .1, .91, 5.5);
      sourcePoint(target, .3 + unit(seed + 2) * .4, .27 + unit(seed + 3) * .11, -5);
      point.lerpVectors(origin, target, p);
      point.x += Math.sin(p * TAU * 1.5 + i) * Math.sin(p * Math.PI) * .9;
      point.y += Math.sin(p * Math.PI) * (1.2 + unit(seed + 4));
      point.z += Math.cos(p * TAU + i) * Math.sin(p * Math.PI) * 1.5;
      const alpha = smooth(0, 2, age) * (1 - smooth(49, 54, time));
      const phase = unit(seed + 5) * TAU;
      const scale = .13 + unit(seed + 6) * .17;
      petals.set(i, point, scale, scale, scale,
        reduced ? .35 : age * .72 + phase, reduced ? .3 : age * .35 + phase,
        reduced ? phase : age * .2 + phase, alpha * .92, i % 4 ? pink : ivory);
    }
    const constellationAlpha = smooth(48.7, 53.2, time) * (1 - smooth(55, 59.2, time));
    lineMaterial.opacity = constellationAlpha * .22;
    constellation.visible = constellationAlpha > .001;
    CONSTELLATION_POINTS.forEach(([x, y], i) => {
      sourcePoint(point, x, y, -8);
      glows.put(point, i % 5 ? ivory : palette[2], constellationAlpha * .83,
        7.2 + unit(i + 19) * 2.4, 0, 0, .08);
    });

    // 55–85 seconds: distinct launches, shells and falling willow trails.
    // 85–90 seconds contains only the soft decay of the final three shells.
    for (let i = interactive.length - 1; i >= 0; i--) {
      const current = interactive[i];
      const age = effectClock - current.born;
      if (age > lifetime(current.cue)) interactive.splice(i, 1);
      else drawFirework(current.cue, age, reduced);
    }
    for (const cue of FIREWORK_SCORE) drawFirework(cue, time - cue.at, reduced);

    batches.forEach(b => b.finish()); sparks.finish(); glows.finish();
    return interactive.length > 0;
  };

  const emit = (burst: RideBurst) => {
    const power = clamp(burst.power ?? .65, .15, 1);
    const z = -6;
    const halfHeight = (FINALE_CAMERA_Z - z) * Math.tan(camera.fov * Math.PI / 360);
    point.set((clamp(burst.x) * 2 - 1) * halfHeight * camera.aspect,
      (1 - clamp(burst.y) * 2) * halfHeight, z);
    const referenceHalfHeight = (FINALE_CAMERA_Z - z) * HALF_TANGENT;
    const x = clamp(.5 + point.x / (2 * referenceHalfHeight * FINALE_SOURCE_ASPECT), .18, .82);
    const y = clamp(.5 - point.y / (2 * referenceHalfHeight), .16, .35);
    if (interactive.length >= 3) interactive.shift();
    interactive.push({ born: effectClock + 1.05, cue: {
      at: 0, x, y, z, size: 1.35 + power * .8, shape: power > .8 ? 'willow' : 'peony',
      color: Math.abs(Math.floor(burst.id)) % palette.length, seed: 1400 + burst.id * 13,
      count: Math.round(84 + power * 38),
    } });
  };

  return {
    object, render, emit,
    setDpr(value: number) { sparks.setDpr(value); glows.setDpr(value); },
    clearInteractive() { interactive.length = 0; },
    dispose() {
      instancedMeshes.forEach(mesh => mesh.dispose());
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); object.clear();
    },
  };
}
