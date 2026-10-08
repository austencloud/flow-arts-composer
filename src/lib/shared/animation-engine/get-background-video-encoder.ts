import { BackgroundVideoEncoder } from "@austencloud/video-editor/encoder";

let instance: BackgroundVideoEncoder | null = null;
export function getBackgroundVideoEncoder(): BackgroundVideoEncoder {
  return (instance ??= new BackgroundVideoEncoder());
}
