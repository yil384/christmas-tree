import { useEffect, useRef } from 'react';
import type { RideBurst, RideEffectKind } from './rideTypes';

type Particle = {
  kind: RideEffectKind; x: number; y: number; vx: number; vy: number;
  age: number; life: number; size: number; hue: number; phase: number; rotation: number;
};

/** A bounded, zero-download fallback for browsers without WebGL. */
export default function RideMagicFallback({ burst, active, reducedMotion }: {
  burst?: RideBurst; active: boolean; reducedMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const runtimeRef = useRef<{ emit: (value: RideBurst) => void; activate: (value: boolean) => void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let width = 1;
    let height = 1;
    let particles: Particle[] = [];
    let frame = 0;
    let previous = 0;
    let enabled = true;
    const TAU = Math.PI * 2;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const star = (radius: number) => {
      context.beginPath();
      for (let point = 0; point < 8; point++) {
        const angle = point * Math.PI / 4;
        const r = radius * (point % 2 ? 0.23 : 1);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (!point) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
    };
    const drawShape = (particle: Particle, alpha: number) => {
      const { size, kind, phase, age, hue } = particle;
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = `hsla(${hue},70%,86%,${alpha})`;
      context.strokeStyle = `hsla(${hue},80%,88%,${alpha * 0.75})`;
      context.lineWidth = 0.9;
      if (kind === 'ripple') {
        context.rotate(-particle.rotation);
        context.scale(1, 0.27);
        const radius = 5 + age * size * 14;
        context.beginPath(); context.arc(0, 0, radius, 0, TAU); context.stroke();
        context.globalAlpha = 0.4;
        context.beginPath(); context.arc(0, 0, radius * 0.75, 0, TAU); context.stroke();
      } else if (kind === 'butterflies') {
        const flap = reducedRef.current ? 0.9 : 0.3 + Math.abs(Math.sin(age * 8 + phase)) * 0.8;
        context.scale(flap, 1);
        for (const side of [-1, 1]) {
          context.beginPath();
          context.moveTo(0, 0);
          context.bezierCurveTo(side * size * 0.6, -size * 1.55, side * size * 1.8, -size * 0.9, side * size, size * 0.1);
          context.bezierCurveTo(side * size * 1.35, size * 1.1, side * size * 0.4, size * 1.4, 0, 0);
          context.fill();
        }
        context.fillStyle = `rgba(255,246,217,${alpha})`;
        context.fillRect(-0.5, -size * 0.6, 1, size * 1.2);
      } else if (kind === 'lanterns') {
        context.beginPath();
        context.moveTo(-size * 0.55, -size); context.quadraticCurveTo(0, -size * 1.25, size * 0.55, -size);
        context.lineTo(size * 0.7, size * 0.7); context.quadraticCurveTo(0, size * 1.1, -size * 0.7, size * 0.7);
        context.closePath(); context.fill();
        context.fillStyle = `rgba(255,249,216,${alpha})`;
        context.beginPath(); context.ellipse(0, size * 0.45, size * 0.24, size * 0.4, 0, 0, TAU); context.fill();
      } else if (kind === 'notes') {
        context.beginPath(); context.ellipse(-size * 0.2, size * 0.45, size * 0.35, size * 0.23, -0.35, 0, TAU); context.fill();
        context.fillRect(size * 0.1, -size, size * 0.12, size * 1.45);
        context.beginPath(); context.moveTo(size * 0.1, -size); context.quadraticCurveTo(size * 1.3, -size * 0.5, size * 0.6, 0); context.lineTo(size * 0.4, -size * 0.3); context.quadraticCurveTo(size * 0.7, -size * 0.6, size * 0.1, -size * 0.65); context.fill();
      } else if (kind === 'pages') {
        const bend = reducedRef.current ? 0.7 : 0.5 + Math.cos(age * 3 + phase) * 0.3;
        for (const side of [-1, 1]) {
          context.beginPath(); context.moveTo(0, -size * 0.7);
          context.quadraticCurveTo(side * size * 0.6, -size * 1.2 * bend, side * size, -size * 0.5);
          context.lineTo(side * size * 0.75, size * 0.6); context.quadraticCurveTo(side * size * 0.4, size * 0.25, 0, size * 0.65);
          context.closePath(); context.fill();
        }
      } else if (kind === 'crystal') {
        context.beginPath(); context.moveTo(0, -size); context.lineTo(size * 0.5, -size * 0.1); context.lineTo(0, size); context.lineTo(-size * 0.5, -size * 0.1); context.closePath(); context.stroke();
        context.globalAlpha = 0.35; context.fill();
        context.globalAlpha = 1; context.beginPath(); context.moveTo(0, -size); context.lineTo(0, size); context.stroke();
      } else if (kind === 'petals') {
        context.beginPath(); context.moveTo(0, -size);
        context.bezierCurveTo(size * 1.2, -size * 0.4, size * 0.7, size * 0.8, 0, size * 0.9);
        context.bezierCurveTo(-size * 0.8, size * 0.2, -size * 0.6, -size * 0.6, 0, -size); context.fill();
      } else if (kind === 'stars') {
        star(size);
      } else {
        context.beginPath(); context.arc(0, 0, Math.max(0.5, size * 0.3), 0, TAU); context.fill();
        if (kind === 'fireworks' && !reducedRef.current) {
          context.beginPath(); context.moveTo(0, 0); context.lineTo(-particle.vx * 0.035, -particle.vy * 0.035); context.stroke();
        }
      }
      context.restore();
    };
    const draw = (now: number) => {
      frame = 0;
      if (!enabled || document.hidden) return;
      const elapsed = previous ? Math.min((now - previous) / 1000, 0.05) : 0.016;
      previous = now;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'source-over';
      particles = particles.filter(particle => particle.age < particle.life);
      for (const particle of particles) {
        particle.age += elapsed;
        if (particle.age < 0 || particle.age >= particle.life) continue;
        const life = Math.min(1, particle.age / particle.life);
        const alpha = Math.min(1, particle.age * 8) * Math.pow(1 - life, 1.15);
        if (!reducedRef.current) {
          particle.x += (particle.vx + Math.sin(particle.age * 2 + particle.phase) * (particle.kind === 'fireworks' ? 1 : 9)) * elapsed;
          particle.y += particle.vy * elapsed;
          if (particle.kind === 'fireworks') { particle.vy += 20 * elapsed; particle.vx *= 0.988; }
          if (particle.kind !== 'ripple') particle.rotation += elapsed * Math.sin(particle.phase) * 0.4;
        }
        drawShape(particle, alpha);
      }
      if (particles.length) frame = requestAnimationFrame(draw);
    };
    const awaken = () => { if (!frame && enabled && particles.length) frame = requestAnimationFrame(draw); };
    runtimeRef.current = {
      emit(value) {
        const power = Math.max(0.1, Math.min(1, value.power ?? 0.65));
        const kind = value.kind;
        const count = reducedRef.current ? 5 : kind === 'fireworks' ? 100 : kind === 'ripple' ? 4 : kind === 'fireflies' ? 32 : 13;
        const hue = kind === 'petals' || kind === 'butterflies' ? 325 : kind === 'crystal' || kind === 'ripple' ? 192 : 41;
        for (let index = 0; index < count; index++) {
          const angle = index / count * TAU + Math.random() * 0.2;
          const speed = (25 + Math.random() * 75) * (0.5 + power);
          const fireworks = kind === 'fireworks';
          particles.push({ kind, x: value.x * width + (Math.random() - 0.5) * 12, y: value.y * height + (Math.random() - 0.5) * 8,
            vx: fireworks ? Math.cos(angle) * speed : (Math.random() - 0.5) * (kind === 'ripple' ? 0 : 45),
            vy: fireworks ? Math.sin(angle) * speed : kind === 'ripple' ? 0 : -(12 + Math.random() * 30),
            age: kind === 'ripple' ? -index * 0.12 : 0,
            life: kind === 'fireworks' ? 2.4 : 2.8 + Math.random() * 1.7,
            size: kind === 'fireworks' || kind === 'fireflies' ? 1.7 + Math.random() * 2 : 4.5 + Math.random() * 5.5,
            hue: hue + Math.random() * 20, phase: Math.random() * TAU, rotation: (Math.random() - 0.5) * 0.55,
          });
        }
        if (particles.length > 260) particles.splice(0, particles.length - 260);
        awaken();
      },
      activate(value) { enabled = value; previous = 0; if (!value) { cancelAnimationFrame(frame); frame = 0; } else awaken(); },
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); runtimeRef.current = null; };
  }, []);

  useEffect(() => { runtimeRef.current?.activate(active); }, [active]);
  useEffect(() => { if (burst) runtimeRef.current?.emit(burst); }, [burst]);
  return <canvas ref={canvasRef} className="ride-magic-canvas" aria-hidden="true" />;
}
