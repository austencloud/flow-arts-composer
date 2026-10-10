import { TrailCapturer } from '#lib/shared/animation-engine/services/trail-capturer.js';

let instance: TrailCapturer | null = null;
export function getTrailCapturer(): TrailCapturer {
  return instance ??= new TrailCapturer();
}
