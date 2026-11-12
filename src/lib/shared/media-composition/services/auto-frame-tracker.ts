import { ALL_FORMATS, BlobSource, CanvasSink, Input, UrlSource, type InputVideoTrack } from "mediabunny";
import {
  findBackdropLine,
  forearmLength,
  POSE_POINTS,
  propsBox,
  type FrameBox,
  type PoseLandmarks,
} from "../domain/auto-frame";

/**
 * Tracking for Auto frame: where the props are in each sample of a take.
 *
 * The camera is still, so a spinning staff is the pixels that changed since
 * the frame before. Those are kept only near the hands (MediaPipe pose finds
 * them), within two forearm lengths, so a passer-by or a flickering light
 * far from the performer is not mistaken for a staff. The take is decoded
 * once, front to back, over the clip's range; motion is read 15 times a
 * second against the frame just before each sample.
 *
 * A median of frames spread over the whole take gives the empty stage, and
 * its brightness by row finds a bright ceiling above a dark backdrop.
 *
 * This runs on the main thread because the pose model wants the GPU; the
 * decode loop awaits each frame, so the page keeps painting.
 */

export interface AutoFrameTracking {
  /** Sample times in take seconds. */
  times: number[];
  /** Props box per sample, unmirrored footage fractions; null when no body. */
  props: (FrameBox | null)[];
  poses: PoseLandmarks[];
  /** Row (footage fraction) where a dark backdrop starts under a bright ceiling. */
  backdropLine: number | null;
  /** Footage width / height, after rotation. */
  footageAspect: number;
}

export interface AutoFrameTrackOptions {
  /** Take seconds to track, inclusive. */
  start: number;
  end: number;
  onProgress?: (phase: AutoFrameTrackPhase, fraction: number) => void;
  signal?: AbortSignal;
}

export type AutoFrameTrackPhase = "model" | "stage" | "track";

const SAMPLES_PER_SECOND = 15;
/** Motion and stage grids: the short side, as in the tuning runs. */
const MOTION_SHORT = 270;
const MOTION_LONG = 480;
const POSE_SHORT = 540;
const POSE_LONG = 960;
/** A pixel moved when a colour channel changed by more than this since the frame before. */
const MOTION_THRESHOLD = 35;
const STAGE_FRAMES = 60;
/** Props are looked for within this many forearm lengths of a hand. */
const REACH_FOREARMS = 2;
/** Decoding starts this long before the range so the first sample has a frame before it. */
const LEAD_IN = 0.5;

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

type PoseRunner = {
  detectForVideo(image: TexImageSource, timestamp: number): { landmarks: { x: number; y: number; visibility?: number }[][] };
  close(): void;
};

async function createPoseRunner(): Promise<PoseRunner> {
  const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  return (await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  })) as unknown as PoseRunner;
}

async function openInput(url: string, signal?: AbortSignal): Promise<Input> {
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    const blob = await (await fetch(url, { signal })).blob();
    return new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  }
  return new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
}

function gridSize(track: InputVideoTrack, short: number, long: number): [number, number] {
  return track.displayWidth >= track.displayHeight ? [long, short] : [short, long];
}

function context2d(width: number, height: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const canvas =
    typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("This browser cannot read video frames.");
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Auto frame was stopped.", "AbortError");
}

/** Per-row brightness of the empty stage: the median over frames, per pixel, then per row. */
function stageRowLevels(frames: Uint8Array[], width: number, height: number): number[] {
  const n = frames.length;
  const column = new Uint8Array(n);
  const row = new Uint8Array(width);
  const levels: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      for (let f = 0; f < n; f++) column[f] = frames[f]![at]!;
      column.sort();
      row[x] = column[n >> 1]!;
    }
    row.sort();
    levels.push(row[width >> 1]!);
  }
  return levels;
}

function grayOf(rgba: Uint8ClampedArray, out: Uint8Array): Uint8Array {
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = (0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]! + 0.5) | 0;
  }
  return out;
}

const cache = new Map<string, AutoFrameTracking>();

/** Tracks the props over [start, end] of the take at `url`. Results are kept per key and range. */
export async function trackForAutoFrame(
  cacheKey: string,
  url: string,
  options: AutoFrameTrackOptions
): Promise<AutoFrameTracking> {
  const { start, end, onProgress, signal } = options;
  const key = `${cacheKey}|${start.toFixed(3)}|${end.toFixed(3)}`;
  const kept = cache.get(key);
  if (kept) return kept;

  onProgress?.("model", 0);
  const posePromise = createPoseRunner();
  const input = await openInput(url, signal);
  let pose: PoseRunner | null = null;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("This take has no video.");
    const duration = await track.computeDuration();
    const footageAspect = track.displayWidth / track.displayHeight;
    const [mw, mh] = gridSize(track, MOTION_SHORT, MOTION_LONG);
    const [pw, ph] = gridSize(track, POSE_SHORT, POSE_LONG);
    const sink = new CanvasSink(track, { width: pw, height: ph, fit: "fill", poolSize: 4 });
    const small = context2d(mw, mh);

    // The empty stage, for the backdrop line.
    const stage: Uint8Array[] = [];
    const span = Math.max(0, duration - 2);
    const stageTimes = Array.from({ length: STAGE_FRAMES }, (_, i) => 1 + (span * i) / (STAGE_FRAMES - 1));
    for await (const frame of sink.canvasesAtTimestamps(stageTimes)) {
      throwIfAborted(signal);
      if (frame) {
        small.drawImage(frame.canvas, 0, 0, mw, mh);
        stage.push(grayOf(small.getImageData(0, 0, mw, mh).data, new Uint8Array(mw * mh)));
      }
      onProgress?.("stage", stage.length / STAGE_FRAMES);
    }
    const backdropLine = stage.length >= 5 ? findBackdropLine(stageRowLevels(stage, mw, mh)) : null;

    pose = await posePromise;
    onProgress?.("model", 1);

    // One pass front to back: motion against the frame before each sample, pose at each sample.
    const times: number[] = [];
    const moving: Uint32Array[] = [];
    const poses: PoseLandmarks[] = [];
    let previous: Uint8ClampedArray | null = null;
    let next = start;
    let lastStamp = -1;
    const scratch = new Uint32Array(mw * mh);
    for await (const frame of sink.canvases(Math.max(0, start - LEAD_IN), end + 0.01)) {
      throwIfAborted(signal);
      const t = frame.timestamp;
      small.drawImage(frame.canvas, 0, 0, mw, mh);
      const pixels = small.getImageData(0, 0, mw, mh).data;
      if (t + 1e-6 < next) {
        previous = pixels;
        continue;
      }
      next += 1 / SAMPLES_PER_SECOND;
      let count = 0;
      if (previous) {
        for (let i = 0, p = 0; p < mw * mh; i += 4, p++) {
          const d = Math.max(
            Math.abs(pixels[i]! - previous[i]!),
            Math.abs(pixels[i + 1]! - previous[i + 1]!),
            Math.abs(pixels[i + 2]! - previous[i + 2]!)
          );
          if (d > MOTION_THRESHOLD) scratch[count++] = p;
        }
      }
      moving.push(scratch.slice(0, count));
      const stamp = Math.max(lastStamp + 1, Math.round(t * 1000));
      lastStamp = stamp;
      const found = pose.detectForVideo(frame.canvas as TexImageSource, stamp).landmarks[0];
      let landmarks: PoseLandmarks = null;
      if (found && found.length >= POSE_POINTS) {
        landmarks = new Float32Array(POSE_POINTS * 3);
        found.forEach((p, i) => {
          landmarks![i * 3] = p.x;
          landmarks![i * 3 + 1] = p.y;
          landmarks![i * 3 + 2] = p.visibility ?? 1;
        });
      }
      poses.push(landmarks);
      times.push(t);
      previous = pixels;
      onProgress?.("track", Math.min(1, (t - start) / Math.max(1e-6, end - start)));
    }

    const reach = REACH_FOREARMS * forearmLength(poses, mh / mw);
    const props = poses.map((p, i) => propsBox(moving[i]!, mw, mh, p, reach));
    const result: AutoFrameTracking = { times, props, poses, backdropLine, footageAspect };
    cache.set(key, result);
    return result;
  } finally {
    input.dispose?.();
    (pose ?? (await posePromise.catch(() => null)))?.close();
  }
}
