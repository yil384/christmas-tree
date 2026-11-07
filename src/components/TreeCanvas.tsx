import { useEffect, useRef, useState } from 'react'
import { createTreeParticles, seededRandom } from './tree-particles'
import type { TreeParticle } from './tree-particles'

export type TreeCanvasProps = {
  lit: boolean
  scattered: boolean
  snow: boolean
  paused: boolean
  onReady?: () => void
  className?: string
}

type Projection = {
  x: Float32Array
  y: Float32Array
  depth: Float32Array
  perspective: Float32Array
}

const TAU = Math.PI * 2
const FOLIAGE_COLORS = ['#206d50', '#2d8260', '#38906a', '#60a980', '#3b7660', '#89ad87']
const LIGHT_COLORS = ['#f3cf85', '#ffe9ba', '#e5b97c']

function createProjection(length: number): Projection {
  return {
    x: new Float32Array(length),
    y: new Float32Array(length),
    depth: new Float32Array(length),
    perspective: new Float32Array(length),
  }
}

function glowSprite(color: string, size = 64) {
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = size
  const context = sprite.getContext('2d')!
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, color)
  gradient.addColorStop(0.09, `${color}e8`)
  gradient.addColorStop(0.25, `${color}40`)
  gradient.addColorStop(0.55, `${color}13`)
  gradient.addColorStop(1, `${color}00`)
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  return sprite
}

function ornamentSprite(red: boolean) {
  const sprite = document.createElement('canvas')
  sprite.width = 64
  sprite.height = 72
  const context = sprite.getContext('2d')!
  context.fillStyle = '#c9a56b'
  context.fillRect(27, 4, 10, 7)
  const gradient = context.createRadialGradient(23, 22, 1, 32, 37, 29)
  gradient.addColorStop(0, red ? '#d47a72' : '#f0d6a0')
  gradient.addColorStop(0.18, red ? '#a64c47' : '#c5a46e')
  gradient.addColorStop(0.6, red ? '#6a2929' : '#85623a')
  gradient.addColorStop(1, red ? '#351c21' : '#3b3024')
  context.fillStyle = gradient
  context.beginPath()
  context.arc(32, 37, 28, 0, TAU)
  context.fill()
  return sprite
}

function starSprite() {
  const sprite = document.createElement('canvas')
  sprite.width = 128
  sprite.height = 128
  const context = sprite.getContext('2d')!
  const coordinates: Array<[number, number]> = []
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 5
    const radius = i % 2 === 0 ? 47 : 21
    coordinates.push([64 + Math.cos(angle) * radius, 64 + Math.sin(angle) * radius])
  }
  // Alternating faces make the little star look folded, even when motion is off.
  for (let i = 0; i < 10; i++) {
    const current = coordinates[i]
    const next = coordinates[(i + 1) % coordinates.length]
    context.beginPath()
    context.moveTo(64, 64)
    context.lineTo(current[0], current[1])
    context.lineTo(next[0], next[1])
    context.closePath()
    context.fillStyle = i % 2 === 0 ? '#f1db9f' : '#bf9655'
    context.fill()
  }
  context.beginPath()
  for (let i = 0; i < coordinates.length; i++) {
    const [x, y] = coordinates[i]
    if (i === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()
  context.strokeStyle = '#ffedbd'
  context.lineWidth = 1.1
  context.stroke()
  return sprite
}

/** A small, network-free 3D projection rendered on a single 2D canvas. */
export default function TreeCanvas({ lit, scattered, snow, paused, onReady, className }: TreeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const options = useRef({ lit, scattered, snow, paused, onReady })
  const requestDraw = useRef<() => void>(() => undefined)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    options.current = { lit, scattered, snow, paused, onReady }
    requestDraw.current()
  }, [lit, scattered, snow, paused, onReady])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) {
      setUnavailable(true)
      options.current.onReady?.()
      return
    }

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const smallScreen = window.matchMedia('(max-width: 640px)').matches
    const scene = createTreeParticles(smallScreen ? 1550 : 2250)
    const foliageProjection = createProjection(scene.foliage.length)
    const garlandProjection = createProjection(scene.garland.length)
    const ornamentProjection = createProjection(scene.ornaments.length)
    const lights = LIGHT_COLORS.map(color => glowSprite(color))
    const floorGlow = glowSprite('#bfa679', 256)
    const starGlow = glowSprite('#e9c984', 128)
    const star = starSprite()
    const balls = [ornamentSprite(false), ornamentSprite(true)]
    const random = seededRandom(24122026)
    const snowflakes = Array.from({ length: smallScreen ? 42 : 66 }, () => ({
      x: random(), y: random(), radius: 0.5 + random() * 1.3,
      speed: 0.013 + random() * 0.021, phase: random() * TAU,
    }))
    const stars = Array.from({ length: 32 }, () => ({
      x: random(), y: random() * 0.87, size: random() > 0.9 ? 1.3 : 0.65,
    }))

    let width = 1
    let height = 1
    let dpr = 1
    let scale = 1
    let centerX = 0
    let centerY = 0
    let rotation = -0.35
    let targetRotation = rotation
    let spread = options.current.scattered ? 1 : 0
    let light = options.current.lit ? 1 : 0
    let elapsed = 0
    let lastTime = 0
    let lastRender = -1000
    let frame = 0
    let disposed = false
    let ready = false
    let inView = true
    let dragging = false
    let pointerX = 0
    let lastDrag = -5000
    let forceNext = true
    let reducedMotion = motionQuery.matches

    const isAnimated = () => !options.current.paused && !reducedMotion && inView && !document.hidden

    const project = (particles: TreeParticle[], output: Projection, sine: number, cosine: number) => {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        const x = p.x + (p.scatteredX - p.x) * spread
        const y = p.y + (p.scatteredY - p.y) * spread
        const z = p.z + (p.scatteredZ - p.z) * spread
        const rotatedX = x * cosine + z * sine
        const rotatedZ = z * cosine - x * sine
        const perspective = 4.4 / (4.4 - rotatedZ)
        output.x[i] = centerX + rotatedX * scale * perspective
        output.y[i] = centerY - (y + rotatedZ * 0.075) * scale * perspective
        output.depth[i] = rotatedZ
        output.perspective[i] = perspective
      }
    }

    const drawOrnaments = (front: boolean) => {
      for (let i = 0; i < scene.ornaments.length; i++) {
        if ((ornamentProjection.depth[i] >= 0) !== front) continue
        const p = scene.ornaments[i]
        const size = p.size * scale * ornamentProjection.perspective[i] * 2.5
        context.globalAlpha = (front ? 0.85 : 0.34) * (0.62 + light * 0.38) * (1 - spread * 0.65)
        context.drawImage(balls[p.color], ornamentProjection.x[i] - size / 2, ornamentProjection.y[i] - size / 2, size, size * 1.125)
      }
    }

    const drawGarland = (front: boolean) => {
      // One path per depth half, rather than a material/mesh per light.
      context.strokeStyle = '#dfbd78'
      context.globalAlpha = (front ? 0.36 : 0.12) * (0.25 + light * 0.75) * (1 - spread)
      context.lineWidth = Math.max(0.55, scale * 0.0027)
      context.beginPath()
      let connected = false
      for (let i = 0; i < scene.garland.length; i++) {
        if ((garlandProjection.depth[i] >= 0) !== front) { connected = false; continue }
        if (connected) context.lineTo(garlandProjection.x[i], garlandProjection.y[i])
        else context.moveTo(garlandProjection.x[i], garlandProjection.y[i])
        connected = true
      }
      context.stroke()
      for (let i = 0; i < scene.garland.length; i++) {
        if ((garlandProjection.depth[i] >= 0) !== front) continue
        const p = scene.garland[i]
        const x = garlandProjection.x[i]
        const y = garlandProjection.y[i]
        const twinkle = 0.83 + Math.sin(elapsed * 0.9 + p.phase) * 0.17
        const brightness = (front ? 0.95 : 0.38) * (0.32 + light * 0.68) * twinkle
        const pointSize = Math.max(0.65, p.size * scale * garlandProjection.perspective[i] * 0.55)
        if (i % 6 === 0) {
          const glowSize = pointSize * (10 + light * 3)
          context.globalAlpha = brightness * (0.35 + light * 0.65)
          context.drawImage(lights[p.color], x - glowSize / 2, y - glowSize / 2, glowSize, glowSize)
        }
        context.globalAlpha = brightness
        context.fillStyle = LIGHT_COLORS[p.color]
        context.fillRect(x - pointSize / 2, y - pointSize / 2, pointSize, pointSize)
      }
    }

    const drawFoliage = (front: boolean) => {
      // Batched needle paths keep draw calls small and the silhouette delicate.
      for (let color = 0; color < FOLIAGE_COLORS.length; color++) {
        context.strokeStyle = FOLIAGE_COLORS[color]
        context.globalAlpha = (front ? 0.88 : 0.40) * (0.77 + light * 0.23) * (1 - spread * 0.35)
        context.lineWidth = Math.max(0.55, scale * 0.0027)
        context.beginPath()
        for (let i = 0; i < scene.foliage.length; i++) {
          const p = scene.foliage[i]
          if (p.color !== color || (foliageProjection.depth[i] >= 0) !== front) continue
          const x = foliageProjection.x[i]
          const y = foliageProjection.y[i]
          const size = Math.max(0.7, p.size * scale * foliageProjection.perspective[i]) * (1 - spread * 0.65)
          context.moveTo(x, y)
          context.lineTo(x + p.needleX * size, y + p.needleY * size)
        }
        context.stroke()
      }
    }

    const draw = (timestamp: number) => {
      frame = 0
      if (disposed || document.hidden) return
      const forced = forceNext
      forceNext = false
      const animated = isAnimated()
      const interval = width < 641 ? 1000 / 30 : 1000 / 45
      if (!forced && animated && timestamp - lastRender < interval - 1) {
        frame = requestAnimationFrame(draw)
        return
      }
      const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.06) : 1 / 30
      lastTime = timestamp
      lastRender = timestamp
      if (animated) {
        elapsed += dt
        if (!dragging && timestamp - lastDrag > 1600) targetRotation += dt * 0.065
        rotation += (targetRotation - rotation) * (1 - Math.exp(-dt * 9))
        spread += ((options.current.scattered ? 1 : 0) - spread) * (1 - Math.exp(-dt * 2.4))
        light += ((options.current.lit ? 1 : 0) - light) * (1 - Math.exp(-dt * 2.8))
      } else {
        rotation = targetRotation
        spread = options.current.scattered ? 1 : 0
        light = options.current.lit ? 1 : 0
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      context.fillStyle = '#d9d7bd'
      context.globalAlpha = 0.28
      for (const p of stars) context.fillRect(p.x * width, p.y * height, p.size, p.size)

      const groundY = centerY + 0.91 * scale
      context.globalAlpha = (0.11 + light * 0.19) * (1 - spread)
      context.drawImage(floorGlow, centerX - scale * 0.9, groundY - scale * 0.085, scale * 1.8, scale * 0.17)
      context.globalAlpha = 0.35 * (1 - spread)
      context.fillStyle = '#684e33'
      context.fillRect(centerX - scale * 0.024, centerY + scale * 0.72, scale * 0.048, scale * 0.14)

      const sine = Math.sin(rotation)
      const cosine = Math.cos(rotation)
      project(scene.foliage, foliageProjection, sine, cosine)
      project(scene.garland, garlandProjection, sine, cosine)
      project(scene.ornaments, ornamentProjection, sine, cosine)
      drawGarland(false)
      drawOrnaments(false)
      drawFoliage(false)
      drawFoliage(true)
      drawOrnaments(true)
      drawGarland(true)

      const starY = centerY - 1.105 * scale
      const starSize = scale * 0.17 * (1 - spread)
      const haloSize = scale * 0.42
      context.globalAlpha = (0.22 + light * 0.52) * (1 - spread)
      context.drawImage(starGlow, centerX - haloSize / 2, starY - haloSize / 2, haloSize, haloSize)
      context.globalAlpha = (0.72 + light * 0.28) * (1 - spread)
      if (starSize > 0.1) context.drawImage(star, centerX - starSize / 2, starY - starSize / 2, starSize, starSize)

      if (options.current.snow) {
        context.fillStyle = '#e9e9d9'
        for (const flake of snowflakes) {
          const x = (flake.x + Math.sin(elapsed * 0.15 + flake.phase) * 0.025) * width
          const y = ((flake.y + elapsed * flake.speed) % 1) * height
          context.globalAlpha = 0.16 + flake.radius * 0.19
          context.beginPath()
          context.arc(x, y, flake.radius, 0, TAU)
          context.fill()
        }
      }
      context.globalAlpha = 1
      if (!ready) {
        ready = true
        options.current.onReady?.()
      }
      if (animated) frame = requestAnimationFrame(draw)
    }

    const wake = () => {
      forceNext = true
      if (!frame && !document.hidden && !disposed) frame = requestAnimationFrame(draw)
    }
    requestDraw.current = wake

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      dpr = Math.min(window.devicePixelRatio || 1, width < 641 ? 1.35 : 1.6)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      scale = Math.min(width / 2.5, height / 2.62)
      centerX = width * 0.5
      centerY = height * 0.51
      wake()
    }
    const pointerDown = (event: PointerEvent) => {
      if (!event.isPrimary) return
      dragging = true
      pointerX = event.clientX
      lastDrag = performance.now()
      canvas.setPointerCapture?.(event.pointerId)
      canvas.style.cursor = 'grabbing'
    }
    const pointerMove = (event: PointerEvent) => {
      if (!dragging || !event.isPrimary) return
      targetRotation += (event.clientX - pointerX) * 0.009
      pointerX = event.clientX
      lastDrag = performance.now()
      wake()
    }
    const pointerEnd = () => {
      dragging = false
      lastDrag = performance.now()
      canvas.style.cursor = 'grab'
    }
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      targetRotation += event.key === 'ArrowLeft' ? -0.28 : 0.28
      lastDrag = performance.now()
      wake()
    }
    const visibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame)
        frame = 0
      } else {
        lastTime = 0
        wake()
      }
    }
    const motionChange = () => {
      reducedMotion = motionQuery.matches
      wake()
    }

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : undefined
    resizeObserver?.observe(canvas)
    window.addEventListener('resize', resize)
    const intersectionObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
      inView = entries[0]?.isIntersecting ?? true
      if (!inView) {
        cancelAnimationFrame(frame)
        frame = 0
      } else {
        lastTime = 0
        wake()
      }
    }) : undefined
    intersectionObserver?.observe(canvas)
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerup', pointerEnd)
    canvas.addEventListener('pointercancel', pointerEnd)
    canvas.addEventListener('lostpointercapture', pointerEnd)
    canvas.addEventListener('keydown', keyDown)
    document.addEventListener('visibilitychange', visibilityChange)
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', motionChange)
    else motionQuery.addListener(motionChange)
    resize()

    return () => {
      disposed = true
      requestDraw.current = () => undefined
      cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerup', pointerEnd)
      canvas.removeEventListener('pointercancel', pointerEnd)
      canvas.removeEventListener('lostpointercapture', pointerEnd)
      canvas.removeEventListener('keydown', keyDown)
      document.removeEventListener('visibilitychange', visibilityChange)
      if (motionQuery.removeEventListener) motionQuery.removeEventListener('change', motionChange)
      else motionQuery.removeListener(motionChange)
    }
  }, [])

  if (unavailable) {
    return <div className={className} role="img" aria-label="一棵为你点亮的圣诞树" style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%' }}>
      <span style={{ textAlign: 'center', color: '#e7d5a8' }}>✦<br />愿你的冬天，星光常在。</span>
    </div>
  }
  return <canvas
    ref={canvasRef}
    className={className}
    role="img"
    aria-label="一棵可以拖动旋转的圣诞树，也可用左右方向键旋转"
    tabIndex={0}
    style={{ display: 'block', width: '100%', height: '100%', touchAction: 'pan-y', cursor: 'grab' }}
  >愿你的冬天，星光常在。</canvas>
}

export { TreeCanvas }
