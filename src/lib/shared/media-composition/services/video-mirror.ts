import type { Attachment } from "svelte/attachments";
import type { LayoutRegion } from "$lib/shared/media-composition/domain/media-layout-schema";
import { calculateMediaFit } from "$lib/shared/media-composition/services/media-fit";

/**
 * A copy of a preview video, painted into a canvas laid over it.
 *
 * On 2026-09-30 the Post timing screen went black 43 seconds into playback
 * while the video element itself was fine: readyState 4, no error, every
 * frame decoded, and drawing it into a canvas returned the picture. The
 * browser had stopped drawing the video's own layer, so the frame's
 * background showed through, while the animation inset beside it, a canvas,
 * kept drawing. A canvas is composited with the page rather than as a
 * separate video surface, so this copy stays on screen when the video's
 * layer drops out. The video stays mounted underneath: a canvas that cannot
 * draw is left clear and shows it.
 */

export type VideoMirrorFit = LayoutRegion["fit"];

export interface VideoMirrorEnvironment {
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
  pixelRatio(): number;
  /** Reports the element's layout size now and whenever it changes. */
  observeSize(
    element: Element,
    onResize: (width: number, height: number) => void
  ): () => void;
}

/** HTMLMediaElement.HAVE_CURRENT_DATA, which jsdom does not define. */
const HAVE_CURRENT_DATA = 2;
/** The longest side the copy's bitmap may reach. */
const MAX_BITMAP_SIDE = 4096;

/** Events after which the video may show a different frame. */
const REPAINT_EVENTS = [
  "loadeddata",
  "seeked",
  "pause",
  "ended",
  "resize",
  "timeupdate",
] as const;
const PLAY_EVENTS = ["play", "playing"] as const;

const browserEnvironment: VideoMirrorEnvironment = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  pixelRatio: () => window.devicePixelRatio || 1,
  observeSize(element, onResize) {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) onResize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  },
};

/**
 * Paint `video` into `canvas`, fitted as the video's `object-fit` fits it,
 * on every animation frame while it plays and after anything that changes
 * its frame while paused. Returns the function that stops it.
 */
export function startVideoMirror(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  fit: VideoMirrorFit,
  environment: VideoMirrorEnvironment = browserEnvironment
): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => undefined;
  let boxWidth = 0;
  let boxHeight = 0;
  let frameId: number | null = null;
  let videoFrameId: number | null = null;
  let stopped = false;

  function clear(): void {
    context!.clearRect(0, 0, canvas.width, canvas.height);
  }

  function paint(): void {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (
      stopped ||
      video.readyState < HAVE_CURRENT_DATA ||
      sourceWidth <= 0 ||
      sourceHeight <= 0 ||
      boxWidth <= 0 ||
      boxHeight <= 0
    )
      return;
    const rect = calculateMediaFit({
      sourceWidth,
      sourceHeight,
      regionWidth: boxWidth,
      regionHeight: boxHeight,
      fit,
    }).drawRect;
    // At least the source's own resolution, so a zoomed slot stays as sharp
    // as the video under it.
    const ratio = Math.min(
      Math.max(
        environment.pixelRatio(),
        sourceWidth / rect.width,
        sourceHeight / rect.height
      ),
      MAX_BITMAP_SIDE / Math.max(boxWidth, boxHeight)
    );
    const width = Math.max(1, Math.round(boxWidth * ratio));
    const height = Math.max(1, Math.round(boxHeight * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context!.clearRect(0, 0, width, height);
    try {
      context!.drawImage(
        video,
        rect.x * ratio,
        rect.y * ratio,
        rect.width * ratio,
        rect.height * ratio
      );
    } catch {
      clear();
    }
  }

  function follow(): void {
    frameId = null;
    paint();
    if (!stopped && !video.paused && !video.ended) {
      frameId = environment.requestFrame(follow);
    }
  }

  function onPlay(): void {
    paint();
    if (frameId === null) frameId = environment.requestFrame(follow);
  }

  // Also repaint on every presented frame, so a frame that arrives without
  // an event, such as the one a paused video decodes after loading, is
  // never left out of the copy.
  function onVideoFrame(): void {
    videoFrameId = null;
    paint();
    watchVideoFrames();
  }

  function watchVideoFrames(): void {
    if (stopped || typeof video.requestVideoFrameCallback !== "function")
      return;
    videoFrameId = video.requestVideoFrameCallback(onVideoFrame);
  }

  for (const name of REPAINT_EVENTS) video.addEventListener(name, paint);
  for (const name of PLAY_EVENTS) video.addEventListener(name, onPlay);
  video.addEventListener("emptied", clear);
  const stopObserving = environment.observeSize(canvas, (width, height) => {
    boxWidth = width;
    boxHeight = height;
    paint();
  });
  watchVideoFrames();
  if (!video.paused && !video.ended) onPlay();

  return () => {
    stopped = true;
    if (frameId !== null) environment.cancelFrame(frameId);
    if (videoFrameId !== null) video.cancelVideoFrameCallback(videoFrameId);
    for (const name of REPAINT_EVENTS) video.removeEventListener(name, paint);
    for (const name of PLAY_EVENTS) video.removeEventListener(name, onPlay);
    video.removeEventListener("emptied", clear);
    stopObserving();
  };
}

/** `{@attach videoMirror(video, fit)}` on the canvas laid over `video`. */
export function videoMirror(
  video: HTMLVideoElement | null,
  fit: VideoMirrorFit
): Attachment<HTMLCanvasElement> {
  return (canvas) => (video ? startVideoMirror(canvas, video, fit) : undefined);
}
