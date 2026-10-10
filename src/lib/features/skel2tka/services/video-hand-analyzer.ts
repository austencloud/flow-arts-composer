/**
 * VideoHandAnalyzer - Run MediaPipe hand detection on extracted video frames
 *
 * Uses its own ImageModeHandLandmarker (separate from the train module's
 * VIDEO mode singleton) to process pre-extracted frames independently.
 *
 * Processing is simpler than the live camera pipeline:
 * - No mirroring (video files are not front-facing camera)
 * - No crop transforms (frames are already the correct size)
 * - No temporal stabilizer (IMAGE mode, each frame is independent)
 * - No hand persistence (no real-time continuity needed)
 *
 * Hand assignment uses the same spatial heuristic as the camera pipeline:
 * leftmost hand = blue, rightmost = red.
 */

import type {
  DetectionFrame,
  DetectedPosition,
} from "#lib/shared/train/domain/detection-frame.js";
import type { HandLandmark } from "#lib/features/train/services/hand-landmarker.js";
import { mapToQuadrant } from "#lib/features/train/services/quadrant-mapper.js";
import type { ExtractedFrame, HandTimeline, ProgressCallback } from "../domain/models";
import type { ImageModeHandLandmarker } from "./image-mode-hand-landmarker";

export class VideoHandAnalyzer {
  constructor(private readonly _landmarker: ImageModeHandLandmarker) {}

  async analyze(
    frames: ExtractedFrame[],
    fps: number,
    duration: number,
    onProgress?: ProgressCallback
  ): Promise<HandTimeline> {
    if (!this._landmarker.isInitialized) {
      await this._landmarker.initialize();
    }

    const detectionFrames: DetectionFrame[] = [];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]!;
      const detection = this.processFrame(frame);
      detectionFrames.push(detection);
      onProgress?.(i + 1, frames.length, "Analyzing hands");
    }

    return { frames: detectionFrames, fps, duration };
  }

  private processFrame(frame: ExtractedFrame): DetectionFrame {
    const canvas = new OffscreenCanvas(
      frame.imageData.width,
      frame.imageData.height
    );
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(frame.imageData, 0, 0);

    const result = this._landmarker.detect(canvas);
    return this.buildDetectionFrame(result, frame.timestamp);
  }

  private buildDetectionFrame(
    result: {
      landmarks: HandLandmark[][];
      handedness: Array<Array<{ categoryName: string; score: number }>>;
    },
    timestamp: number
  ): DetectionFrame {
    let leftPosition: DetectedPosition | null = null;
    let rightPosition: DetectedPosition | null = null;

    if (result.landmarks && result.landmarks.length > 0) {
      const hands: Array<{ position: DetectedPosition; wristX: number }> = [];

      for (let i = 0; i < result.landmarks.length; i++) {
        const landmarks = result.landmarks[i];
        if (!landmarks || landmarks.length < 1) continue;

        const wrist = landmarks[0];
        if (!wrist) continue;

        // Compute palm center from wrist + middle finger MCP
        const palmCenter = this.computePalmCenter(landmarks);
        const quadrant = mapToQuadrant(
          palmCenter.x,
          palmCenter.y
        );

        // Use MediaPipe's handedness confidence
        const handednessData = result.handedness[i]?.[0];
        const confidence = handednessData?.score ?? 0.5;

        hands.push({
          position: {
            quadrant,
            confidence,
            rawPosition: palmCenter,
            timestamp,
          },
          wristX: wrist.x,
        });
      }

      // Assign by horizontal position: leftmost = blue, rightmost = red
      if (hands.length >= 2) {
        const sorted = [...hands].sort((a, b) => a.wristX - b.wristX);
        leftPosition = sorted[0]!.position;
        rightPosition = sorted[1]!.position;
      } else if (hands.length === 1) {
        const hand = hands[0]!;
        if (hand.wristX < 0.5) {
          leftPosition = hand.position;
        } else {
          rightPosition = hand.position;
        }
      }
    }

    return {
      timestamp,
      left: leftPosition,
      right: rightPosition,
      source: "mediapipe",
    };
  }

  /**
   * Compute palm center from wrist (landmark 0) and middle finger MCP (landmark 9).
   * Falls back to wrist position if middle finger MCP is missing.
   */
  private computePalmCenter(landmarks: HandLandmark[]): { x: number; y: number } {
    const wrist = landmarks[0]!;
    const middleMcp = landmarks[9];

    if (middleMcp) {
      return {
        x: (wrist.x + middleMcp.x) / 2,
        y: (wrist.y + middleMcp.y) / 2,
      };
    }

    return { x: wrist.x, y: wrist.y };
  }
}
