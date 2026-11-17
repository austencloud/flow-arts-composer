/**
 * WebCodecs Video Encoder
 *
 * Uses WebCodecs API for hardware-accelerated video encoding with explicit
 * frame timestamps. This solves the MediaRecorder timing issue where real-time
 * recording causes BPM mismatches.
 *
 * Unlike MediaRecorder (which records in real-time), WebCodecs allows us to
 * specify exact timestamps for each frame, just like gif.js does for GIFs.
 */

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  EncodedVideoPacketSource,
  EncodedPacket,
  type MetadataTags,
} from "mediabunny";

export interface WebCodecsEncoderOptions {
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
  /**
   * Descriptive tags written into the MP4 (the sequence a video carries, for
   * one). mediabunny only accepts them before the output starts.
   */
  metadataTags?: MetadataTags;
}

export class WebCodecsVideoEncoder {
  private encoder: VideoEncoder | null = null;
  private output: Output | null = null;
  private videoSource: EncodedVideoPacketSource | null = null;
  private frameIndex = 0;
  private frameDurationUs: number;
  private width: number;
  private height: number;
  private encoderWidth: number;
  private encoderHeight: number;
  private isFinished = false;
  private resizeCanvas: HTMLCanvasElement | null = null;
  private resizeCtx: CanvasRenderingContext2D | null = null;

  constructor(private options: WebCodecsEncoderOptions) {
    // Round to integers - canvas dimensions can be decimals from CSS calculations
    this.width = Math.round(options.width);
    this.height = Math.round(options.height);
    // H.264 requires even dimensions - round up to nearest even number
    this.encoderWidth = this.width % 2 === 0 ? this.width : this.width + 1;
    this.encoderHeight = this.height % 2 === 0 ? this.height : this.height + 1;
    // Frame duration in microseconds (WebCodecs uses microseconds)
    this.frameDurationUs = Math.round(1_000_000 / options.fps);
  }

  static isSupported(): boolean {
    return (
      typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined"
    );
  }

  async initialize(): Promise<void> {
    if (!WebCodecsVideoEncoder.isSupported()) {
      throw new Error("WebCodecs API is not supported in this browser");
    }

    // Create mediabunny output for MP4 container
    this.videoSource = new EncodedVideoPacketSource("avc");
    this.output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });
    this.output.addVideoTrack(this.videoSource, {
      frameRate: this.options.fps,
    });
    if (this.options.metadataTags) {
      this.output.setMetadataTags(this.options.metadataTags);
    }
    await this.output.start();

    this.encoder = new VideoEncoder({
      output: async (chunk, meta) => {
        const packet = EncodedPacket.fromEncodedChunk(chunk);
        await this.videoSource?.add(packet, meta);
      },
      error: (e) => {
        console.error("VideoEncoder error:", e);
      },
    });

    // Configure encoder for H.264 with even dimensions
    // Use a reasonable bitrate - 5 Mbps default for good quality
    const bitrate = this.options.bitrate ?? 5_000_000;

    // Choose appropriate H.264 level based on resolution
    // Level 3.1 (0x1f) supports up to 921,600 pixels (e.g., 1280x720)
    // Level 4.0 (0x28) supports up to 2,073,600 pixels (e.g., 1920x1080)
    // Level 5.1 (0x33) supports up to 8,912,896 pixels (e.g., 4096x2160)
    const pixelArea = this.encoderWidth * this.encoderHeight;
    let codecString: string;
    if (pixelArea <= 921600) {
      codecString = "avc1.42001f"; // Level 3.1
    } else if (pixelArea <= 2073600) {
      codecString = "avc1.420028"; // Level 4.0
    } else {
      codecString = "avc1.420033"; // Level 5.1
    }

    await this.encoder.configure({
      codec: codecString,
      width: this.encoderWidth,
      height: this.encoderHeight,
      bitrate,
      framerate: this.options.fps,
    });

    // Create resize canvas if dimensions need adjustment
    if (
      this.encoderWidth !== this.width ||
      this.encoderHeight !== this.height
    ) {
      this.resizeCanvas = document.createElement("canvas");
      this.resizeCanvas.width = this.encoderWidth;
      this.resizeCanvas.height = this.encoderHeight;
      this.resizeCtx = this.resizeCanvas.getContext("2d");
    }

    this.frameIndex = 0;
    this.isFinished = false;
  }

  async addFrame(canvas: HTMLCanvasElement): Promise<void> {
    if (!this.encoder || this.isFinished) {
      throw new Error("Encoder not initialized or already finished");
    }

    // Get the canvas to encode from (resize if needed for even dimensions)
    let canvasToEncode = canvas;
    if (this.resizeCanvas && this.resizeCtx) {
      // Draw the source canvas onto the resize canvas (slightly larger to meet even dimensions)
      this.resizeCtx.fillStyle = "#000000";
      this.resizeCtx.fillRect(
        0,
        0,
        this.resizeCanvas.width,
        this.resizeCanvas.height
      );
      this.resizeCtx.drawImage(canvas, 0, 0);
      canvasToEncode = this.resizeCanvas;
    }

    // Calculate exact timestamp for this frame in microseconds
    const timestamp = this.frameIndex * this.frameDurationUs;

    const frame = new VideoFrame(canvasToEncode, {
      timestamp,
      duration: this.frameDurationUs,
    });

    // Encode the frame
    // Use keyFrame every 30 frames for seeking support
    const keyFrame = this.frameIndex % 30 === 0;
    this.encoder.encode(frame, { keyFrame });

    // Close the frame to free memory
    frame.close();

    this.frameIndex++;
  }

  async finish(): Promise<Blob> {
    if (!this.encoder || !this.output || this.isFinished) {
      throw new Error("Encoder not initialized or already finished");
    }

    this.isFinished = true;

    // Flush remaining frames
    await this.encoder.flush();

    // Finalize output
    this.videoSource?.close();
    await this.output.finalize();

    const buffer = (this.output.target as BufferTarget).buffer!;

    // Clean up
    this.encoder.close();
    this.encoder = null;
    this.output = null;
    this.videoSource = null;
    this.resizeCanvas = null;
    this.resizeCtx = null;

    return new Blob([buffer], { type: "video/mp4" });
  }

  cancel(): void {
    if (this.encoder && !this.isFinished) {
      try {
        this.encoder.close();
      } catch {
        // Ignore errors on cancel
      }
    }
    this.encoder = null;
    this.output = null;
    this.videoSource = null;
    this.resizeCanvas = null;
    this.resizeCtx = null;
    this.isFinished = true;
  }
}
