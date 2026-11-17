/**
 * When the worker's canvas takes a new size.
 *
 * Resizing a canvas clears it, and the browser presents whatever the canvas
 * holds when the current task ends. A resize applied the moment the page asks
 * for it leaves the stage black until the next frame is drawn, which is a
 * visible flash when a panel docks beside the stage.
 *
 * While live frames are being drawn, the new size waits for the next frame,
 * which resizes and redraws in one task. Sizes that arrive between two frames
 * collapse into the last one. With no frame coming to apply it, the size is
 * applied at once.
 */
export interface WorkerResizeMoment {
  visible: boolean;
  disposed: boolean;
  preparingFirstFrame: boolean;
  /** A frame callback is waiting to run. */
  frameQueued: boolean;
  hasScene: boolean;
}

export type WorkerResizeTiming = "with-next-frame" | "now";

export function resolveWorkerResizeTiming(
  moment: WorkerResizeMoment
): WorkerResizeTiming {
  const drawingLiveFrames =
    moment.visible &&
    !moment.disposed &&
    !moment.preparingFirstFrame &&
    moment.frameQueued &&
    moment.hasScene;
  return drawingLiveFrames ? "with-next-frame" : "now";
}
