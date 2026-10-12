import { CanvasFrameCapturer } from "@austencloud/video-editor/encoder";

let instance: CanvasFrameCapturer | null = null;
export function getCanvasFrameCapturer(): CanvasFrameCapturer {
  return (instance ??= new CanvasFrameCapturer());
}
