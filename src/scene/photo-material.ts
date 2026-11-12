import * as THREE from 'three';

// All prints share this small closed mesh. Their separate images and hang points
// are still instance attributes, so paper, peg and cord cost one draw call.
const PAPER_HALF_THICKNESS = 0.009;
const CORD_START = new THREE.Vector3(0, 0.72, 0.015);

function paperCurve(x: number, y: number) {
  const lower = (0.6 - y) / 1.5;
  return 0.026 * (x / 0.6) ** 2 + 0.042 * lower ** 3 + 0.007 * x * lower;
}

export function createPrintGeometry() {
  const positions: number[] = [];
  const uvs: number[] = [];
  const parts: number[] = [];
  const indices: number[] = [];
  const vertex = (x: number, y: number, z: number, u: number, v: number, part: number) => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(u, v);
    parts.push(part);
    return index;
  };
  const quad = (a: number, b: number, c: number, d: number, reverse = false) => {
    if (reverse) indices.push(a, c, b, b, c, d);
    else indices.push(a, b, c, b, d, c);
  };

  // A slightly curled sheet has real front and back faces, normal gradients,
  // and a narrow cream edge. The back image remains readable from behind.
  const columns = 6;
  const rows = 8;
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const v = row / rows;
      const y = -0.9 + 1.5 * v;
      for (let column = 0; column <= columns; column++) {
        const u = column / columns;
        const x = -0.6 + 1.2 * u;
        vertex(x, y, paperCurve(x, y) + side * PAPER_HALF_THICKNESS, side > 0 ? u : 1 - u, v, 0);
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = base + row * (columns + 1) + column;
        quad(a, a + 1, a + columns + 1, a + columns + 2, side < 0);
      }
    }
  }
  const edge = (ax: number, ay: number, bx: number, by: number, steps: number) => {
    const base = positions.length / 3;
    for (let step = 0; step <= steps; step++) {
      const fraction = step / steps;
      const x = THREE.MathUtils.lerp(ax, bx, fraction);
      const y = THREE.MathUtils.lerp(ay, by, fraction);
      const curve = paperCurve(x, y);
      vertex(x, y, curve - PAPER_HALF_THICKNESS, fraction, 0, 3);
      vertex(x, y, curve + PAPER_HALF_THICKNESS, fraction, 1, 3);
    }
    for (let step = 0; step < steps; step++) {
      const a = base + step * 2;
      quad(a, a + 1, a + 2, a + 3, true);
    }
  };
  edge(-0.6, -0.9, 0.6, -0.9, columns);
  edge(0.6, -0.9, 0.6, 0.6, rows);
  edge(0.6, 0.6, -0.6, 0.6, columns);
  edge(-0.6, 0.6, -0.6, -0.9, rows);

  const append = (geometry: THREE.BufferGeometry, part: number) => {
    const base = positions.length / 3;
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    for (let index = 0; index < position.count; index++) {
      vertex(position.getX(index), position.getY(index), position.getZ(index), uv.getX(index), uv.getY(index), part);
    }
    const source = geometry.index;
    for (let index = 0; index < (source?.count ?? position.count); index++) indices.push(base + (source?.getX(index) ?? index));
    geometry.dispose();
  };

  // Two tapered jaws straddle the paper. A small steel spring catches the light
  // separately from the rough wood, all within the same material program.
  for (const side of [1, -1]) {
    const jaw = new THREE.BoxGeometry(0.116, 0.29, 0.058);
    const position = jaw.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      const y = position.getY(index);
      const taper = y < 0 ? 0.72 : 1;
      position.setXYZ(index, position.getX(index) * taper, y + 0.64, position.getZ(index) + side * (0.043 + y * 0.035));
    }
    append(jaw, 1);
  }
  const spring = new THREE.TorusGeometry(0.046, 0.008, 4, 10, Math.PI * 1.7);
  spring.rotateY(Math.PI / 2);
  spring.translate(0, 0.66, 0.006);
  append(spring, 4);

  // The cord is a six-sided tube, not a camera-facing line. Degenerate CPU
  // positions leave it out of ray picking; the vertex shader uses aHangerEnd.
  const cordBase = positions.length / 3;
  const cordSides = 6;
  const cordSections = 6;
  for (let row = 0; row <= cordSections; row++) {
    for (let side = 0; side <= cordSides; side++) vertex(0, 0, 0, side / cordSides, row / cordSections, 2);
  }
  for (let row = 0; row < cordSections; row++) {
    for (let side = 0; side < cordSides; side++) {
      const a = cordBase + row * (cordSides + 1) + side;
      quad(a, a + 1, a + cordSides + 1, a + cordSides + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Avoid zero normals on the procedural cord before its shader override.
  const normal = geometry.getAttribute('normal');
  for (let index = cordBase; index < normal.count; index++) normal.setXYZ(index, 0, 0, 1);
  return geometry;
}

export function createPrintMaterial(atlas: THREE.Texture, photoReveal = { value: 1 }) {
  const material = new THREE.MeshStandardMaterial({
    map: atlas,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.uCordStart = { value: CORD_START };
    shader.uniforms.uPhotoReveal = photoReveal;
    shader.vertexShader = /* glsl */ `
      attribute vec4 aPhotoRect;
      attribute vec3 aFrameColor;
      attribute vec3 aHangerEnd;
      attribute float aPart;
      uniform vec3 uCordStart;
      varying vec2 vCardUv;
      varying vec4 vPhotoRect;
      varying vec3 vFrameColor;
      varying float vPart;
      varying vec3 vPaperPosition;
      vec3 cordSide(vec3 direction) {
        return normalize(cross(direction, abs(direction.z) > 0.96 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0)));
      }
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', /* glsl */ `
      #include <beginnormal_vertex>
      if (aPart > 1.5 && aPart < 2.5) {
        vec3 cordDirection = normalize(aHangerEnd - uCordStart);
        vec3 cordU = cordSide(cordDirection);
        vec3 cordV = cross(cordDirection, cordU);
        float angle = uv.x * 6.28318530718;
        objectNormal = cordU * cos(angle) + cordV * sin(angle);
      }
    `);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
      #include <begin_vertex>
      vCardUv = uv;
      vPhotoRect = aPhotoRect;
      vFrameColor = aFrameColor;
      vPart = aPart;
      if (aPart > 1.5 && aPart < 2.5) {
        vec3 cordDirection = normalize(aHangerEnd - uCordStart);
        vec3 cordU = cordSide(cordDirection);
        vec3 cordV = cross(cordDirection, cordU);
        float angle = uv.x * 6.28318530718;
        transformed = mix(uCordStart, aHangerEnd, uv.y)
          + (cordU * cos(angle) + cordV * sin(angle)) * 0.011;
        transformed.y -= 0.045 * sin(uv.y * 3.14159265359);
      }
      vPaperPosition = transformed;
    `);
    shader.fragmentShader = /* glsl */ `
      uniform float uPhotoReveal;
      varying vec2 vCardUv;
      varying vec4 vPhotoRect;
      varying vec3 vFrameColor;
      varying float vPart;
      varying vec3 vPaperPosition;
      float paperGrain(vec2 uv) {
        return fract(sin(dot(uv, vec2(127.1, 311.7))) * 43758.5453123);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', /* glsl */ `
      vec2 cardUv = vCardUv;
      // Back-face geometry already has mirrored U coordinates. Retain the
      // inside view as well when the camera sees across a curled corner.
      if (!gl_FrontFacing) cardUv.x = 1.0 - cardUv.x;
      vec2 photoUv = (cardUv - vec2(1.0 / 12.0, 4.0 / 15.0)) / vec2(5.0 / 6.0, 2.0 / 3.0);
      float inPhoto = step(0.0, photoUv.x) * step(photoUv.x, 1.0)
        * step(0.0, photoUv.y) * step(photoUv.y, 1.0) * (1.0 - step(0.5, vPart));
      vec2 atlasUv = vPhotoRect.xy + clamp(photoUv, 0.0, 1.0) * vPhotoRect.zw;
      // The atlas is SRGBColorSpace; Three uploads it as sRGB, decoding
      // these pixels to linear light before the standard lighting pipeline.
      vec3 photograph = texture2D(map, atlasUv).rgb;
      float grain = paperGrain(floor(cardUv * vec2(680.0, 850.0)));
      vec3 paper = mix(vFrameColor, vec3(0.89, 0.86, 0.80), 0.66) * (0.986 + grain * 0.028);
      vec3 surfaceColor = mix(paper, photograph, inPhoto * uPhotoReveal);
      float edgeDistance = min(min(photoUv.x, 1.0 - photoUv.x), min(photoUv.y, 1.0 - photoUv.y));
      surfaceColor *= 1.0 - inPhoto * uPhotoReveal * 0.12 * (1.0 - smoothstep(0.0, 0.012, edgeDistance));
      if (vPart > 3.5) {
        surfaceColor = vec3(0.32, 0.34, 0.35);
      } else if (vPart > 2.5) {
        surfaceColor = paper * 0.8;
      } else if (vPart > 1.5) {
        float twist = sin(vCardUv.y * 125.0 + vCardUv.x * 18.85);
        surfaceColor = vec3(0.41, 0.29, 0.16) * (0.85 + 0.15 * twist);
      } else if (vPart > 0.5) {
        float grainLine = sin(vPaperPosition.x * 430.0 + sin(vPaperPosition.y * 28.0) * 2.5 + vPaperPosition.z * 67.0);
        surfaceColor = vec3(0.53, 0.32, 0.145) * (0.88 + grainLine * 0.12);
      }
      diffuseColor.rgb *= surfaceColor;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', /* glsl */ `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(0.85, 0.38, inPhoto);
      if (vPart > 3.5) roughnessFactor = 0.31;
      else if (vPart > 0.5 && vPart < 1.5) roughnessFactor = 0.68;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', /* glsl */ `
      #include <metalnessmap_fragment>
      metalnessFactor = vPart > 3.5 ? 0.72 : 0.0;
    `);
  };
  material.customProgramCacheKey = () => 'physical-polaroid-wood-cord-v2-batch-reveal';
  return material;
}
