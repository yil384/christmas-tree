import type { RideBurst } from '../rideTypes';

export interface FinaleSceneProps {
  /** Local finale time, 0–90 seconds; owned by the single journey playback clock. */
  totalTime: number;
  /** False freezes every animation. At the end, true allows optional firework taps. */
  playing: boolean;
  /** Sound belongs to the parent soundtrack; this renderer never opens another audio track. */
  muted: boolean;
  reducedMotion: boolean;
  burst?: RideBurst;
  onEnd?: () => void;
  onUnavailable?: () => void;
}
