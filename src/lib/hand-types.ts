/** Model-independent contracts. Coordinates arriving from the camera are unmirrored. */
export interface HandLandmark { x: number; y: number; z?: number }

export interface TrackedHand {
  landmarks: HandLandmark[];
  handedness: 'Left' | 'Right' | 'Unknown';
  gesture: string;
  gestureScore: number;
}

export interface HandFrame { timestamp: number; hands: TrackedHand[] }

export type HandCommand =
  | { type: 'orbit'; dx: number; dy: number }
  | { type: 'zoom'; factor: number }
  | { type: 'scatter' }
  | { type: 'gather' }
  | { type: 'toggle-rotation' }
  | { type: 'select-photo' }
  | { type: 'gallery-step'; direction: -1 | 1 }
  | { type: 'close-gallery' }
  | { type: 'magic' };

export interface HandFeedback {
  mode: 'searching' | 'ready' | 'orbit' | 'zoom' | 'point' | 'holding' | 'cooldown' | 'uncertain';
  label: string;
  progress: number;
  handCount: number;
}

export interface HandUpdate {
  commands: HandCommand[];
  /** Mirrored display coordinates, in [0, 1]. Null means no pointer. */
  cursor: { x: number; y: number } | null;
  feedback: HandFeedback;
}

/** A small mailbox between recognition and the render loop; no React renders at camera FPS. */
export interface HandSceneInput {
  enabled: boolean;
  orbitX: number;
  orbitY: number;
  /** Accumulated natural logarithm of camera distance scale. */
  zoomLog: number;
  cursor: { x: number; y: number } | null;
  /** Updated by real photo-mesh raycasting, never inferred from screen zones. */
  hoveredPhoto: number | null;
  hoveredAt: number;
  /** A pinch is picked on the next render using its exact, anchored cursor. */
  selectionRequest: { cursor: { x: number; y: number }; requestedAt: number } | null;
  lastInputAt: number;
  magic: number;
}

export function createHandSceneInput(): HandSceneInput {
  return { enabled: false, orbitX: 0, orbitY: 0, zoomLog: 0, cursor: null, hoveredPhoto: null, hoveredAt: 0, selectionRequest: null, lastInputAt: 0, magic: 0 };
}
