import * as THREE from 'three';
import { FOLIAGE_BOTTOM, FOLIAGE_TOP, TREE_HEIGHT, TREE_RADIUS, foliageRadiusAt } from './tree-profile';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const BORDER_COLORS = ['#FFFAF0', '#F0E68C', '#E6E6FA', '#FFB6C1', '#98FB98', '#87CEFA', '#FFDAB9'];
const PRINT_TOP = 0.6;
const PRINT_BOTTOM = -0.9;

export interface PhotoPlacement {
  formedPosition: THREE.Vector3;
  scatteredPosition: THREE.Vector3;
  formedRotation: THREE.Quaternion;
  scatteredRotation: THREE.Quaternion;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  /** Connection on the evergreen in tree-local coordinates. */
  attachmentPoint: THREE.Vector3;
  /** Same connection in card-local coordinates, shared by its instanced string. */
  hangerEnd: THREE.Vector3;
  scale: number;
  weight: number;
  frameColor: THREE.Color;
}

/** Separate prints on an evergreen, rather than an opaque paper cone. */
export function createPhotoPlacements(count: number): PhotoPlacement[] {
  const length = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  let seed = 0x54e3c91;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const tilt = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const radial = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const inverse = new THREE.Quaternion();
  const cream = new THREE.Color('#FFF6E7');
  // Leave the trunk and the narrow crown visible. Surface-area sampling also
  // leaves fewer prints at the tip, where the original uniform-height shell overlapped.
  const bottomY = FOLIAGE_BOTTOM + 1.5;
  const topY = FOLIAGE_TOP - 2.1;
  const baseRadius = foliageRadiusAt(bottomY);
  const crownRadius = foliageRadiusAt(topY);

  return Array.from({ length }, (_, index) => {
    const areaFraction = (index + 0.2 + random() * 0.6) / length;
    const surfaceRadius = Math.sqrt(THREE.MathUtils.lerp(baseRadius * baseRadius, crownRadius * crownRadius, areaFraction));
    const y = FOLIAGE_BOTTOM + TREE_HEIGHT * (1 - surfaceRadius / TREE_RADIUS);
    const angle = index * GOLDEN_ANGLE + (random() - 0.5) * 0.45;
    radial.set(Math.cos(angle), 0, Math.sin(angle));
    const scale = random() < 0.13 ? 1.28 + random() * 0.22 : 0.76 + random() * 0.4;

    // Keep the fixed tree-up axis, including on the back side, then add a slight
    // irregular tilt like cards clipped by hand rather than an aligned grid.
    euler.set(-0.025, Math.PI / 2 - angle, 0, 'YXZ');
    const formedRotation = new THREE.Quaternion().setFromEuler(euler);
    euler.set((random() - 0.5) * 0.08, 0, (random() - 0.5) * 0.16, 'XYZ');
    tilt.setFromEuler(euler);
    formedRotation.multiply(tilt);

    // Keep the whole card in front of the solid leaves. Merely offsetting its
    // center clips the lower edge against the wider part of the evergreen.
    let radius = surfaceRadius;
    for (const x of [-0.6, 0.6]) {
      for (const localY of [PRINT_BOTTOM, PRINT_TOP]) {
        corner.set(x, localY, 0).multiplyScalar(scale).applyQuaternion(formedRotation);
        radius = Math.max(radius, foliageRadiusAt(y + corner.y) - corner.dot(radial) + 0.2);
      }
    }
    const formedPosition = radial.clone().multiplyScalar(radius).setY(y);
    const top = new THREE.Vector3(0, PRINT_TOP + 0.04, 0).multiplyScalar(scale).applyQuaternion(formedRotation).add(formedPosition);
    const anchorY = top.y + 0.28 + random() * 0.34;
    const anchorAngle = angle + (random() - 0.5) * 0.03;
    // End inside the continuous inner crown. The opaque outer boughs hide the
    // rest of the ribbon, so gaps between needles cannot leave a floating tip.
    const anchorRadius = foliageRadiusAt(anchorY) * 0.5;
    const attachmentPoint = new THREE.Vector3(Math.cos(anchorAngle) * anchorRadius, anchorY, Math.sin(anchorAngle) * anchorRadius);
    inverse.copy(formedRotation).invert();
    const hangerEnd = attachmentPoint.clone().sub(formedPosition).applyQuaternion(inverse).multiplyScalar(1 / scale);

    const scatteredPosition = new THREE.Vector3((random() - 0.5) * 70, (random() - 0.5) * 70, (random() - 0.5) * 70);
    euler.set(random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2, 'XYZ');
    const scatteredRotation = new THREE.Quaternion().setFromEuler(euler);
    return {
      formedPosition,
      scatteredPosition,
      formedRotation,
      scatteredRotation,
      position: formedPosition.clone(),
      rotation: formedRotation.clone(),
      attachmentPoint,
      hangerEnd,
      scale,
      weight: 0.8 + random() * 1.2,
      frameColor: new THREE.Color(BORDER_COLORS[Math.floor(random() * BORDER_COLORS.length)]).lerp(cream, 0.35),
    };
  });
}
