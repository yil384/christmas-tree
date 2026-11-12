import timelineJson from './rideTimeline.json?raw';
import { mapRideHotspots } from './mapRideHotspots';
import type { RideTimeline } from './mapRideHotspots';
import type { RideSourceHotspot } from './rideTypes';

/** Bundled at build time; the opening screen makes no timeline request. */
const timeline = JSON.parse(timelineJson) as RideTimeline;
export const RIDE_DURATION = timeline.duration;

/** Local source-shot windows, unaffected by the producer's cut or shot order. */
export const RIDE_SOURCE_HOTSPOTS: RideSourceHotspot[] = [
  { shotId: 1, id: 'harbor-ripple', from: 4, to: 11, x: 0.5, y: 0.68, kind: 'ripple', label: '轻触水面的小光点' },
  { shotId: 2, id: 'lily-fireflies', from: 4, to: 11, x: 0.23, y: 0.64, endX: 0.16, endY: 0.6, kind: 'fireflies', label: '轻触睡莲花心的萤光' },
  { shotId: 3, id: 'rose-butterfly', from: 3, to: 11, x: 0.55, y: 0.5, endX: 0.32, endY: 0.6, kind: 'butterflies', label: '轻触玫瑰间的蝴蝶' },
  { shotId: 4, id: 'gate-starlight', from: 4, to: 10, x: 0.5, y: 0.52, kind: 'stars', label: '轻触金门的星光纹样' },
  { shotId: 5, id: 'hall-lanterns', from: 4, to: 11, x: 0.51, y: 0.2, kind: 'lanterns', label: '轻触吊灯下的小光灯' },
  { shotId: 6, id: 'hall-piano', from: 5, to: 10, x: 0.42, y: 0.55, endX: 0.84, endY: 0.63, kind: 'notes', label: '轻触钢琴旁的光点' },
  { shotId: 7, id: 'celestial-music-box', from: 4, to: 10, x: 0.52, y: 0.46, endX: 0.46, endY: 0.42, kind: 'crystal', label: '轻触音乐盒的小星球' },
  { shotId: 10, id: 'mirror-ripple', from: 5, to: 10, x: 0.5, y: 0.55, kind: 'ripple', label: '轻触魔镜里的光' },
  { shotId: 11, id: 'crystal-cave', from: 7, to: 12, x: 0.84, y: 0.47, kind: 'crystal', label: '轻触河边的小晶簇' },
  { shotId: 12, id: 'singing-crystal', from: 4, to: 8.5, x: 0.53, y: 0.42, endX: 0.57, endY: 0.34, kind: 'notes', label: '轻触水晶风铃' },
  { shotId: 13, id: 'underground-stars', from: 4, to: 11, x: 0.5, y: 0.68, kind: 'ripple', label: '轻触地下星湖的倒影' },
  { shotId: 14, id: 'water-curtain', from: 3, to: 7.5, x: 0.5, y: 0.5, kind: 'stars', label: '轻触水幕上的光点' },
  { shotId: 15, id: 'garden-butterflies', from: 5, to: 10, x: 0.29, y: 0.4, endX: 0.28, endY: 0.43, kind: 'butterflies', label: '轻触花园里的蝴蝶' },
  { shotId: 16, id: 'garden-lanterns', from: 4.5, to: 10, x: 0.72, y: 0.42, endY: 0.2, kind: 'lanterns', label: '轻触正在升起的灯笼' },
  { shotId: 17, id: 'observatory-stars', from: 8, to: 12, x: 0.5, y: 0.25, endX: 0.52, endY: 0.16, kind: 'stars', label: '轻触天文台的蝴蝶星座' },
  { shotId: 18, id: 'cloud-bridge', from: 5, to: 10, x: 0.5, y: 0.68, endY: 0.72, kind: 'crystal', label: '轻触云桥下的星石' },
];

export const RIDE_HOTSPOTS = mapRideHotspots(RIDE_SOURCE_HOTSPOTS, timeline);
