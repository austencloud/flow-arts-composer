/// <reference lib="webworker" />

/**
 * Headless Video Renderer Worker
 *
 * Takes pre-computed animation frame states and produces an MP4
 * ArrayBuffer. No DOM, no app bundle, no Svelte.
 *
 * Animation orchestration happens on the main thread (where SvelteKit
 * imports are available). This worker only does: load SVG assets →
 * render each frame on OffscreenCanvas → encode via WebCodecs +
 * mediabunny → return MP4.
 */

import { Output, Mp4OutputFormat, BufferTarget, EncodedVideoPacketSource, EncodedPacket } from "mediabunny";
import { renderScene, createRenderState, type SceneOverlay } from "../services/worker-scene-renderer";
import { createWorkerEffectRenderer } from "../services/worker-effect-renderer";
import type {
  WorkerInMessage,
  WorkerOutMessage,
  RenderRequest,
} from "../domain/qr-video-types";

const hasWebCodecs = typeof VideoEncoder !== "undefined";

const scope = self as DedicatedWorkerGlobalScope;

function post(msg: WorkerOutMessage): void {
  if (msg.type === "complete") {
    scope.postMessage(msg, [msg.mp4]);
  } else {
    scope.postMessage(msg);
  }
}

function postProgress(phase: WorkerOutMessage extends { type: "progress" } ? WorkerOutMessage["phase"] : string, percent: number): void {
  post({ type: "progress", phase: phase as "loading-assets", percent });
}

function ensureEven(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function selectCodec(width: number, height: number): string {
  const pixelArea = width * height;
  if (pixelArea <= 921_600) return "avc1.42001f";
  if (pixelArea <= 2_073_600) return "avc1.420028";
  if (pixelArea <= 8_912_896) return "avc1.420033";
  return "avc1.42003c";
}

async function handleRender(msg: RenderRequest): Promise<void> {
  const startTime = performance.now();
  const { config, frames } = msg;
  const { fps, resolution } = config;

  const assets = msg.assets;

  // 2. Set up canvas and renderer
  const canvasSize = resolution;
  const canvas = new OffscreenCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext("2d", { willReadFrequently: !hasWebCodecs });
  if (!ctx) {
    post({ type: "error", message: "Failed to create OffscreenCanvas 2D context" });
    return;
  }

  const totalFrames = frames.length;

  if (totalFrames === 0) {
    post({ type: "error", message: "No frames to render" });
    return;
  }

  // 3. Set up encoder
  const encWidth = ensureEven(canvasSize);
  const encHeight = ensureEven(canvasSize);
  const bitrate = Math.min(8_000_000, encWidth * encHeight * 8);
  const keyframeInterval = Math.round(fps / 2);
  const frameDurationMicros = Math.round(1_000_000 / fps);

  let mbOutput: Output | null = null;
  let videoSource: EncodedVideoPacketSource | null = null;
  let encoder: VideoEncoder | null = null;
  let encoderErrored = false;

  type WasmEncoder = {
    width: number;
    height: number;
    frameRate: number;
    kbps: number;
    groupOfPictures: number;
    quantizationParameter: number;
    initialize: () => void;
    addFrameRgba: (data: Uint8ClampedArray) => void;
    finalize: () => void;
    FS: { readFile: (filename: string) => Uint8Array };
    outputFilename: string;
    delete: () => void;
  };
  let wasmEncoder: WasmEncoder | null = null;

  if (hasWebCodecs) {
    videoSource = new EncodedVideoPacketSource("avc");
    mbOutput = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });
    mbOutput.addVideoTrack(videoSource, { frameRate: fps });
    await mbOutput.start();

    const localVideoSource = videoSource;
    encoder = new VideoEncoder({
      output: async (chunk, meta) => {
        const packet = EncodedPacket.fromEncodedChunk(chunk);
        await localVideoSource.add(packet, meta);
      },
      error: (e) => {
        encoderErrored = true;
        post({ type: "error", message: `VideoEncoder error: ${e.message}` });
      },
    });

    await encoder.configure({
      codec: selectCodec(encWidth, encHeight),
      width: encWidth,
      height: encHeight,
      bitrate,
      framerate: fps,
    });
  } else {
    const h264Mp4Encoder = await import("h264-mp4-encoder");
    const createEncoder =
      h264Mp4Encoder.createH264MP4Encoder ??
      (h264Mp4Encoder.default as { createH264MP4Encoder: () => Promise<WasmEncoder> })
        ?.createH264MP4Encoder;

    if (!createEncoder) {
      post({ type: "error", message: "Failed to load h264-mp4-encoder" });
      return;
    }

    wasmEncoder = await createEncoder();
    wasmEncoder.width = encWidth;
    wasmEncoder.height = encHeight;
    wasmEncoder.frameRate = fps;
    wasmEncoder.kbps = Math.round(bitrate / 1000);
    wasmEncoder.groupOfPictures = 30;
    wasmEncoder.quantizationParameter = 20;
    wasmEncoder.initialize();
  }

  // 4. Render + encode frame loop
  postProgress("rendering", 0);

  const effectType = config.effectType;
  const effectRenderer = effectType && effectType !== "none"
    ? createWorkerEffectRenderer(effectType, canvasSize)
    : null;

  const renderState = effectRenderer ? undefined : createRenderState();
  const dt = 1 / fps;

  for (let i = 0; i < totalFrames; i++) {
    const frame = frames[i]!;

    const overlay: SceneOverlay = {
      stepIndex: frame.stepIndex,
      isStartPlacement: frame.isStartPlacement,
      letterGlyphs: assets.letterGlyphs,
      startPlacementGlyph: assets.startPlacementGlyph,
    };

    renderScene(
      ctx,
      canvasSize,
      assets.gridImage,
      assets.leftPropImage,
      assets.rightPropImage,
      frame.left,
      frame.right,
      assets.leftPropViewBox,
      assets.rightPropViewBox,
      overlay,
      renderState,
    );

    if (effectRenderer) {
      effectRenderer.renderFrame(
        ctx, canvasSize,
        frame.left, frame.right,
        assets.leftPropViewBox, assets.rightPropViewBox,
        i, dt,
        frame.stepIndex, frame.isStartPlacement,
        {
          left: assets.leftPropImage,
          right: assets.rightPropImage,
        }
      );
    }

    const isKeyframe = i % keyframeInterval === 0;
    const timestampMicros = i * frameDurationMicros;

    if (hasWebCodecs && encoder && !encoderErrored) {
      const videoFrame = new VideoFrame(canvas, {
        timestamp: timestampMicros,
        duration: frameDurationMicros,
      });
      encoder.encode(videoFrame, { keyFrame: isKeyframe });
      videoFrame.close();
    } else if (wasmEncoder) {
      const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
      let data = imageData.data;
      if (canvasSize !== encWidth || canvasSize !== encHeight) {
        const padded = new Uint8ClampedArray(encWidth * encHeight * 4);
        const srcRowBytes = canvasSize * 4;
        const dstRowBytes = encWidth * 4;
        for (let row = 0; row < canvasSize; row++) {
          padded.set(
            data.subarray(row * srcRowBytes, row * srcRowBytes + srcRowBytes),
            row * dstRowBytes
          );
        }
        data = padded;
      }
      wasmEncoder.addFrameRgba(data);
    }

    if (i % 10 === 0) {
      postProgress("rendering", Math.round((i / totalFrames) * 100));
    }
  }

  effectRenderer?.dispose();

  // 5. Finalize
  postProgress("finalizing", 100);

  let mp4Buffer: ArrayBuffer;

  if (hasWebCodecs && encoder && mbOutput && !encoderErrored) {
    await encoder.flush();
    encoder.close();
    videoSource?.close();
    await mbOutput!.finalize();
    mp4Buffer = (mbOutput!.target as BufferTarget).buffer!;
  } else if (wasmEncoder) {
    wasmEncoder.finalize();
    const rawBuffer = wasmEncoder.FS.readFile(wasmEncoder.outputFilename);
    mp4Buffer = new Uint8Array(rawBuffer).buffer;
    wasmEncoder.delete();
  } else {
    post({ type: "error", message: "No encoder available to finalize" });
    return;
  }

  const hash = config.cacheHash ?? "";
  const durationMs = Math.round(performance.now() - startTime);

  post({
    type: "complete",
    mp4: mp4Buffer,
    hash,
    durationMs,
  });
}

scope.addEventListener("message", async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  if (msg.type === "render") {
    try {
      await handleRender(msg);
    } catch (err) {
      post({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
});
