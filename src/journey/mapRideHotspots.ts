import type { RideHotspot, RideSourceHotspot } from './rideTypes';

export interface RideTimelineSegment {
  shotId: number;
  file: string;
  sourceIn: number;
  sourceOut: number;
  start: number;
  end: number;
  duration: number;
  startFrame: number;
  endFrame: number;
  sourceInFrame: number;
  sourceOutFrame: number;
  overlapIn: number;
  overlapOut: number;
  solidStart: number;
  solidEnd: number;
}

export interface RideTimeline {
  version: number;
  fps: number;
  duration: number;
  durationFrames: number;
  crossfadeDuration: number;
  segments: RideTimelineSegment[];
}

/** Preserve source timing and motion when shots are shortened or moved. */
export function mapRideHotspots(sources: RideSourceHotspot[], timeline: RideTimeline): RideHotspot[] {
  const mapped: RideHotspot[] = [];
  for (const segment of timeline.segments) {
    for (const source of sources) {
      if (source.shotId !== segment.shotId || source.to <= source.from) continue;
      // Keep a clue on its own visible shot, outside the adjoining dissolve.
      const firstSourceTime = Math.max(source.from, segment.sourceIn, segment.sourceIn + segment.solidStart - segment.start);
      const lastSourceTime = Math.min(source.to, segment.sourceOut, segment.sourceIn + segment.solidEnd - segment.start);
      if (lastSourceTime - firstSourceTime < 0.6) continue;
      const position = (time: number) => {
        const fraction = Math.max(0, Math.min(1, (time - source.from) / (source.to - source.from)));
        return {
          x: source.x + ((source.endX ?? source.x) - source.x) * fraction,
          y: source.y + ((source.endY ?? source.y) - source.y) * fraction,
        };
      };
      const first = position(firstSourceTime);
      const last = position(lastSourceTime);
      mapped.push({
        id: `${source.id}:${segment.startFrame}`,
        from: segment.start + firstSourceTime - segment.sourceIn,
        to: segment.start + lastSourceTime - segment.sourceIn,
        x: first.x, y: first.y, endX: last.x, endY: last.y,
        kind: source.kind, power: source.power, label: source.label,
      });
    }
  }
  return mapped.sort((a, b) => a.from - b.from);
}
