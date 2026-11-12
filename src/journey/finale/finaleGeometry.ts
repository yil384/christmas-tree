import {
  BufferGeometry, Float32BufferAttribute, PlaneGeometry, Shape, ShapeGeometry,
} from 'three';

/** A gently inflated, open-bottom paper sky lantern, with rounded square sides. */
export function makeLanternGeometry() {
  const rings = [
    { y: -0.34, r: 0.135 }, { y: -0.22, r: 0.19 },
    { y: 0.15, r: 0.22 }, { y: 0.31, r: 0.18 }, { y: 0.37, r: 0.085 },
  ];
  const segments = 24;
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  rings.forEach((ring, row) => {
    for (let column = 0; column <= segments; column++) {
      const angle = column / segments * Math.PI * 2;
      const cosine = Math.cos(angle); const sine = Math.sin(angle);
      positions.push(Math.sign(cosine) * Math.sqrt(Math.abs(cosine)) * ring.r,
        ring.y, Math.sign(sine) * Math.sqrt(Math.abs(sine)) * ring.r);
      uv.push(column / segments, row / (rings.length - 1));
      if (row < rings.length - 1 && column < segments) {
        const a = row * (segments + 1) + column;
        const b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  const top = positions.length / 3;
  positions.push(0, 0.395, 0); uv.push(0.5, 1);
  for (let column = 0; column < segments; column++) {
    const a = (rings.length - 1) * (segments + 1) + column;
    indices.push(a, top, a + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function makeButterflyWing(side: -1 | 1) {
  const shape = new Shape();
  shape.moveTo(0, 0.08);
  shape.bezierCurveTo(side * 0.22, 0.68, side * 0.98, 0.91, side * 0.86, 0.26);
  shape.bezierCurveTo(side * 0.84, 0.07, side * 0.56, -0.01, side * 0.43, -0.03);
  shape.bezierCurveTo(side * 0.81, -0.06, side * 0.75, -0.68, side * 0.41, -0.59);
  shape.bezierCurveTo(side * 0.16, -0.48, side * 0.12, -0.14, 0, -0.1);
  shape.lineTo(0, 0.08);
  const geometry = new ShapeGeometry(shape, 12);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(Math.abs(p.getX(i)) * 3.1) * 0.09);
  geometry.computeVertexNormals();
  return geometry;
}

export function makePetalGeometry() {
  const shape = new Shape();
  shape.moveTo(0, -0.54);
  shape.bezierCurveTo(-0.63, -0.08, -0.47, 0.7, 0.03, 0.53);
  shape.bezierCurveTo(0.58, 0.58, 0.57, -0.13, 0, -0.54);
  const geometry = new ShapeGeometry(shape, 10);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i);
    p.setZ(i, 0.23 * x * x + 0.12 * Math.sin(y * 3.1));
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function makeRippleGeometry() {
  // The shader makes thin, soft-edged ellipses; no enormous glowing disc.
  return new PlaneGeometry(2, 2);
}
