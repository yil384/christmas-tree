import * as THREE from 'three';

/** Keep the dimensions and pastel Polaroids from the original scene. */
const TREE_HEIGHT = 22;
const TREE_RADIUS = 9;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const BORDER_COLORS = ['#FFFAF0', '#F0E68C', '#E6E6FA', '#FFB6C1', '#98FB98', '#87CEFA', '#FFDAB9'];

export interface PhotoPlacement {
  formedPosition: THREE.Vector3;
  scatteredPosition: THREE.Vector3;
  formedRotation: THREE.Quaternion;
  scatteredRotation: THREE.Quaternion;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: number;
  weight: number;
  frameColor: THREE.Color;
}

/** A stable arrangement prevents cards jumping when the manifest finishes loading. */
export function createPhotoPlacements(count: number): PhotoPlacement[] {
  let seed = 0x54e3c91;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const tilt = new THREE.Quaternion();
  const euler = new THREE.Euler();

  return Array.from({ length: count }, (_, index) => {
    // Stratified heights retain the dense cone, with a little irregularity like the original.
    const heightFraction = (index + 0.2 + random() * 0.6) / count;
    const y = heightFraction * TREE_HEIGHT - TREE_HEIGHT / 2;
    const radius = TREE_RADIUS * (1 - heightFraction) + 0.5;
    const angle = index * GOLDEN_ANGLE + (random() - 0.5) * 0.6;
    const formedPosition = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    // Fix local +Y as up before adding a little tilt: a shortest-arc rotation
    // from +Z to the far side of the tree can otherwise turn photos upside down.
    euler.set(-Math.atan(0.035), Math.PI / 2 - angle, 0, 'YXZ');
    const formedRotation = new THREE.Quaternion().setFromEuler(euler);
    euler.set((random() - 0.5) * 0.07, 0, (random() - 0.5) * 0.14, 'XYZ');
    tilt.setFromEuler(euler);
    formedRotation.multiply(tilt);
    const scatteredPosition = new THREE.Vector3((random() - 0.5) * 70, (random() - 0.5) * 70, (random() - 0.5) * 70);
    euler.set(random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2);
    const scatteredRotation = new THREE.Quaternion().setFromEuler(euler);

    return {
      formedPosition,
      scatteredPosition,
      formedRotation,
      scatteredRotation,
      position: formedPosition.clone(),
      rotation: formedRotation.clone(),
      scale: random() < 0.2 ? 2.2 : 0.8 + random() * 0.6,
      weight: 0.8 + random() * 1.2,
      frameColor: new THREE.Color(BORDER_COLORS[Math.floor(random() * BORDER_COLORS.length)]),
    };
  });
}
