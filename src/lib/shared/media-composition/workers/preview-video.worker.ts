import {
  ALL_FORMATS,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  UrlSource,
} from "mediabunny";
import {
  MAX_PREVIEW_DURATION_SECONDS,
  MAX_PREVIEW_VIDEO_BYTES,
  previewVideoDimensions,
} from "../domain/preview-video";

self.onmessage = async (event: MessageEvent<{ sourceUrl: string }>) => {
  let input: Input | undefined;
  try {
    input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(event.data.sourceUrl),
    });
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("The source has no video track");
    const durationSeconds = await input.computeDuration();
    if (
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > MAX_PREVIEW_DURATION_SECONDS
    ) {
      throw new Error("This video's length exceeds the local preview limit");
    }
    const sourceWidth = video.displayWidth;
    const sourceHeight = video.displayHeight;
    const { width, height } = previewVideoDimensions(sourceWidth, sourceHeight);
    const target = new BufferTarget();
    target.on("write", ({ end }) => {
      if (end > MAX_PREVIEW_VIDEO_BYTES)
        throw new Error("This preview exceeds the local size limit");
    });
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target,
    });
    const conversion = await Conversion.init({
      input,
      output,
      // Conversion otherwise shifts a late first frame to zero, breaking saved take timings.
      trim: { start: 0 },
      video: {
        forceTranscode: true,
        codec: "avc",
        width,
        height,
        fit: "contain",
        bitrate: 1_500_000,
        keyFrameInterval: 0.5,
        allowRotationMetadata: false,
      },
      audio: { forceTranscode: true, codec: "aac", bitrate: 96_000 },
    });
    if (!conversion.isValid || conversion.discardedTracks.length) {
      throw new Error(
        "This browser cannot preserve the video's picture and sound in a preview copy"
      );
    }
    let lastProgress = -1;
    conversion.onProgress = (fraction) => {
      const progress = Math.floor(fraction * 100);
      if (progress === lastProgress) return;
      lastProgress = progress;
      self.postMessage({ type: "progress", progress: fraction });
    };
    await conversion.execute();
    const buffer = target.buffer;
    if (!buffer || buffer.byteLength > MAX_PREVIEW_VIDEO_BYTES)
      throw new Error("The preview encoder produced no usable file");
    self.postMessage(
      {
        type: "done",
        buffer,
        width,
        height,
        sourceWidth,
        sourceHeight,
        durationSeconds,
      },
      { transfer: [buffer] }
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      reason:
        error instanceof Error
          ? error.message
          : "The preview could not be prepared",
    });
  } finally {
    input?.dispose();
  }
};
