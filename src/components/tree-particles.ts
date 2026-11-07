/** Small, deterministic scene data. No textures, network requests or 3D runtime. */
export type TreeParticle = {
  x: number
  y: number
  z: number
  scatteredX: number
  scatteredY: number
  scatteredZ: number
  size: number
  color: number
  needleX: number
  needleY: number
  phase: number
}

export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function particle(
  random: () => number,
  x: number,
  y: number,
  z: number,
  size: number,
  color: number,
): TreeParticle {
  const angle = random() * Math.PI * 2
  const radius = Math.sqrt(random())
  const needleAngle = random() * Math.PI
  return {
    x,
    y,
    z,
    scatteredX: Math.cos(angle) * radius * 1.05,
    scatteredY: (random() - 0.5) * 2.05,
    scatteredZ: Math.sin(angle) * radius * 0.72,
    size,
    color,
    needleX: Math.cos(needleAngle),
    needleY: Math.sin(needleAngle),
    phase: random() * Math.PI * 2,
  }
}

export function createTreeParticles(count: number) {
  const random = seededRandom(122526)
  const foliage: TreeParticle[] = []
  const garland: TreeParticle[] = []
  const ornaments: TreeParticle[] = []

  for (let i = 0; i < count; i++) {
    // Layered, tapered branches leave a fir silhouette rather than a solid cone.
    const tier = Math.floor(random() * 13)
    const level = tier / 13
    const radial = 0.14 + Math.pow(random(), 0.38) * 0.86
    const angle = random() * Math.PI * 2
    const branchLobes = 0.92 + Math.cos(angle * 9 + tier * 0.85) * 0.08
    const radius = (0.69 * (1 - level) + 0.016) * radial * branchLobes
    const y = -0.78 + level * 1.68 + (1 - radial) * 0.11 - radial * 0.035 + (random() - 0.5) * 0.10
    foliage.push(particle(random, Math.cos(angle) * radius, y, Math.sin(angle) * radius,
      0.006 + random() * 0.011, Math.floor(random() * 6)))
  }

  // A single continuous champagne garland, with a light at every sixth point.
  for (let i = 0; i < 300; i++) {
    const t = i / 299
    const angle = t * Math.PI * 2 * 5.4 + 0.4
    const radius = 0.71 * (1 - t) + 0.022
    garland.push(particle(random, Math.cos(angle) * radius, -0.80 + t * 1.76,
      Math.sin(angle) * radius, i % 6 === 0 ? 0.014 : 0.005, i % 3))
  }

  for (let i = 0; i < 24; i++) {
    const t = 0.06 + random() * 0.79
    const angle = i * 2.399963229728653
    const radius = (0.70 * (1 - t) + 0.025)
    ornaments.push(particle(random, Math.cos(angle) * radius, -0.78 + t * 1.70,
      Math.sin(angle) * radius, 0.021 + random() * 0.011, i % 4 === 0 ? 1 : 0))
  }

  return { foliage, garland, ornaments }
}
