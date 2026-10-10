import { BackgroundVideoEncoder } from '#lib/shared/animation-engine/services/background-video-encoder.js';

let instance: BackgroundVideoEncoder | null = null;
export function getBackgroundVideoEncoder(): BackgroundVideoEncoder {
  return instance ??= new BackgroundVideoEncoder();
}
