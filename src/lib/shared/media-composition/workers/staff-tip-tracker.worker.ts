/// <reference lib="webworker" />

/**
 * Staff Tip Tracker Worker
 *
 * Decodes a filmed take with mediabunny, finds the two LED staffs' lit ends
 * in every sampled frame, tracks them across the take, and posts back the
 * finished `StaffTipTrack`. Everything expensive — decode, per-frame pixel
 * classification, the tracker's O(candidates^2) pairing — runs here so the
 * main thread (and the take-analysis UI) never stalls.
 *
 * `staff-tip-detection.ts` and `staff-tip-tracking.ts` are pure and don't
 * touch the DOM; this worker owns the one DOM-shaped part of the job
 * (decoding samples onto an OffscreenCanvas and reading pixels back out).
 */

import { Input, BufferSource, ALL_FORMATS, VideoSampleSink, type VideoSample } from "mediabunny";
import {
  createDetectionScratch,
  computeBackgroundMedian,
  detectBlobsInFrame,
  type DetectionBlob,
  type DetectionScratch,
} from "../services/staff-tip-detection";
import { trackStaffTips } from "../services/staff-tip-tracking";
import {
  StaffTipTrackSchema,
  STAFF_TIP_TRACK_VERSION,
  TIP_MISSING,
  type StaffTipTrack,
} from "../domain/staff-tip-track";

export interface AnalyzeMessage {
  type: "analyze";
  video: Blob;
}
export type StaffTipWorkerInMessage = AnalyzeMessage;

export interface StaffTipProgressMessage {
  type: "progress";
  phase: "background" | "detect" | "track";
  fraction: number;
}
export interface StaffTipCompleteMessage {
  type: "complete";
  track: StaffTipTrack;
}
export interface StaffTipErrorMessage {
  type: "error";
  message: string;
}
export type StaffTipWorkerOutMessage =
  | StaffTipProgressMessage
  | StaffTipCompleteMessage
  | StaffTipErrorMessage;

const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: StaffTipWorkerOutMessage): void {
  scope.postMessage(msg);
}

/** Samples per second of media time — see the module doc in staff-tip-track.ts. */
const SAMPLE_RATE = 30;
const FIRST_SAMPLE_SECONDS = 0;
/** ~45 frames spread across the take, matching detect.py's background pass. */
const BACKGROUND_SAMPLE_COUNT = 45;
/** All detection thresholds were tuned at this resolution; never upscale past it. */
const ANALYSIS_SHORT_SIDE = 720;
/** Post progress at most this often. */
const PROGRESS_INTERVAL_MS = 100;

scope.onmessage = (event: MessageEvent<StaffTipWorkerInMessage>): void => {
  if (event.data.type === "analyze") {
    void analyze(event.data.video);
  }
};

function readablePixelError(): Error {
  return new Error("This video could not be read.");
}

/** Drops the alpha channel: detection works on packed RGB, not RGBA. */
function rgbaToRgb(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; j < out.length; i += 4, j += 3) {
    out[j] = rgba[i]!;
    out[j + 1] = rgba[i + 1]!;
    out[j + 2] = rgba[i + 2]!;
  }
  return out;
}

/** Evenly spaced sample indices across [0, sampleCount), including both ends. */
function evenlySpacedIndices(count: number, sampleCount: number): number[] {
  if (count <= 1 || sampleCount <= 1) return [0];
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    indices.push(Math.round((i * (sampleCount - 1)) / (count - 1)));
  }
  return indices;
}

async function analyze(video: Blob): Promise<void> {
  let input: Input | null = null;
  try {
    const bytes = new Uint8Array(await video.arrayBuffer());
    input = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw readablePixelError();

    const sourceWidth = track.displayWidth || track.codedWidth;
    const sourceHeight = track.displayHeight || track.codedHeight;
    const duration = await track.computeDuration();
    if (!sourceWidth || !sourceHeight || !Number.isFinite(duration) || duration <= 0) {
      throw readablePixelError();
    }

    const shortSide = Math.min(sourceWidth, sourceHeight);
    const scale = shortSide > ANALYSIS_SHORT_SIDE ? ANALYSIS_SHORT_SIDE / shortSide : 1;
    const analysisWidth = Math.max(1, Math.round(sourceWidth * scale));
    const analysisHeight = Math.max(1, Math.round(sourceHeight * scale));

    const sampleCount = Math.max(1, Math.round(duration * SAMPLE_RATE));
    const lastValidTimestamp = Math.max(0, duration - 1 / (SAMPLE_RATE * 4));
    const sampleTimestamp = (k: number): number =>
      Math.min(lastValidTimestamp, FIRST_SAMPLE_SECONDS + k / SAMPLE_RATE);

    const canvas = new OffscreenCanvas(analysisWidth, analysisHeight);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw readablePixelError();

    const sink = new VideoSampleSink(track);
    const drawToRgb = (sample: VideoSample): Uint8Array => {
      ctx.clearRect(0, 0, analysisWidth, analysisHeight);
      sample.draw(ctx, 0, 0, analysisWidth, analysisHeight);
      return rgbaToRgb(ctx.getImageData(0, 0, analysisWidth, analysisHeight).data, analysisWidth, analysisHeight);
    };

    // --- Phase 1: background plate (median of ~45 samples spread across the take) ---
    const backgroundCount = Math.min(BACKGROUND_SAMPLE_COUNT, sampleCount);
    const backgroundTimestamps = evenlySpacedIndices(backgroundCount, sampleCount).map(sampleTimestamp);
    const backgroundFrames: Uint8Array[] = [];
    {
      let seen = 0;
      let lastPost = 0;
      for await (const sample of sink.samplesAtTimestamps(backgroundTimestamps)) {
        if (sample) {
          backgroundFrames.push(drawToRgb(sample));
          sample.close();
        }
        seen++;
        const now = performance.now();
        if (now - lastPost > PROGRESS_INTERVAL_MS || seen === backgroundCount) {
          post({ type: "progress", phase: "background", fraction: seen / backgroundCount });
          lastPost = now;
        }
      }
    }
    if (backgroundFrames.length === 0) throw readablePixelError();
    const background = computeBackgroundMedian(backgroundFrames, analysisWidth, analysisHeight);

    // --- Phase 2: per-sample blob detection ---
    const detectionsPerFrame: DetectionBlob[][] = [];
    const scratch: DetectionScratch = createDetectionScratch(analysisWidth, analysisHeight);
    const detectTimestamps: number[] = [];
    for (let k = 0; k < sampleCount; k++) detectTimestamps.push(sampleTimestamp(k));
    {
      let seen = 0;
      let lastPost = 0;
      for await (const sample of sink.samplesAtTimestamps(detectTimestamps)) {
        if (sample) {
          const rgb = drawToRgb(sample);
          sample.close();
          detectionsPerFrame.push(detectBlobsInFrame(rgb, background, analysisWidth, analysisHeight, scratch));
        } else {
          detectionsPerFrame.push([]);
        }
        seen++;
        const now = performance.now();
        if (now - lastPost > PROGRESS_INTERVAL_MS || seen === sampleCount) {
          post({ type: "progress", phase: "detect", fraction: seen / sampleCount });
          lastPost = now;
        }
      }
    }

    await input.dispose?.();
    input = null;

    // --- Phase 3: track both staffs and gap-fill ---
    post({ type: "progress", phase: "track", fraction: 0 });
    const staffs = trackStaffTips(detectionsPerFrame, analysisWidth, analysisHeight);
    post({ type: "progress", phase: "track", fraction: 1 });

    const anyoneFound = staffs.some((staff) =>
      staff.ends.some((end) => end.state.some((state) => state !== TIP_MISSING)),
    );
    if (!anyoneFound) {
      throw new Error("No lit staff ends were found in this video.");
    }

    const track2 = StaffTipTrackSchema.parse({
      version: STAFF_TIP_TRACK_VERSION,
      sourceWidth,
      sourceHeight,
      sampleRate: SAMPLE_RATE,
      firstSampleSeconds: FIRST_SAMPLE_SECONDS,
      sampleCount,
      staffs,
    });

    post({ type: "complete", track: track2 });
  } catch (err) {
    post({
      type: "error",
      message: err instanceof Error ? err.message : "This video could not be read.",
    });
  } finally {
    await input?.dispose?.();
  }
}
