export type RideEffectKind =
  | 'fireflies' | 'ripple' | 'butterflies' | 'lanterns' | 'notes'
  | 'pages' | 'crystal' | 'petals' | 'stars' | 'fireworks';

export interface RideBurst {
  id: number;
  kind: RideEffectKind;
  /** Coordinates in the visible stage, after the video's cover crop. */
  x: number;
  y: number;
  power?: number;
}

export interface RideMagicSceneProps {
  active: boolean;
  reducedMotion: boolean;
  burst?: RideBurst;
  onUnavailable?: () => void;
}

export interface RideHotspot {
  id: string;
  from: number;
  to: number;
  /** Coordinates in the original 9:16 movie, before cover cropping. */
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  kind: RideEffectKind;
  power?: number;
  /** Screen-reader label only. The movie has no visible captions. */
  label: string;
}

/** Authored against one original shot; editing the film never rewrites these times. */
export interface RideSourceHotspot extends RideHotspot {
  shotId: number;
}
