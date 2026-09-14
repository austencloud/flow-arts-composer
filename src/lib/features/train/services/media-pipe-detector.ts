/**
 * MediaPipeDetector (Refactored) - Hand Detection Orchestrator
 *
 * This service orchestrates multiple focused sub-services for hand detection:
 * - HandLandmarker: MediaPipe initialization and raw detection
 * - HandednessAnalyzer: Anatomical left/right hand detection
 * - HandStateAnalyzer: Open/closed/partial state detection
 * - HandTrackingStabilizer: Temporal smoothing and history
 * - HandAssigner: Blue/red slot assignment
 *
 * This orchestrator maintains backward compatibility with IPositionDetector
 * while internally using decomposed, single-responsibility services.
 */

import type { HandLandmark } from "./hand-landmarker";
import type { DetectedHandData } from "./hand-assigner";

export interface DetectionCapabilities {
  supportsRealtime: boolean;
  supportsPostRecording: boolean;
  requiresCalibration: boolean;
}

export interface DetectionOptions {
  mirrored?: boolean;
  gridMode?: GridMode;
}
import type {
  DetectionFrame,
  DetectedPosition,
} from "$lib/shared/train/domain/detection-frame";
import type { HandLandmarker } from "./hand-landmarker";
import type { HandTrackingStabilizer } from "./hand-tracking-stabilizer";
import { analyzeHandedness } from "./handedness-analyzer";
import {
  analyzeHandState,
  calculatePalmCenter,
  getReferencePoint,
} from "./hand-state-analyzer";
import { mapToQuadrant, isValidForMode } from "./quadrant-mapper";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

// How many frames to persist a hand after it disappears (for stability)
const HAND_PERSISTENCE_FRAMES = 5;

export class MediaPipeDetector {
  private _landmarker: HandLandmarker;
  private _stabilizer: HandTrackingStabilizer;

  // State
  private _isDetecting = false;
  // Bumped by every stop and every start, so a session still waiting on the
  // model load can tell whether anyone is still interested in its frames.
  private _sessionId = 0;
  private _frameCallback: ((frame: DetectionFrame) => void) | null = null;
  private _animationFrameId: number | null = null;
  private _videoElement: HTMLVideoElement | null = null;
  private _isMirrored = true;
  private _gridMode: GridMode | undefined = undefined;

  // Performance monitoring
  private _frameCount = 0;
  private _lastFpsUpdate = 0;
  private _detectionTimes: number[] = [];
  private _currentFps = 0;

  // Persistence tracking
  private _lastLeftPosition: DetectedPosition | null = null;
  private _lastRightPosition: DetectedPosition | null = null;
  private _leftFramesMissing = 0;
  private _rightFramesMissing = 0;

  constructor(landmarker: HandLandmarker, stabilizer: HandTrackingStabilizer) {
    this._landmarker = landmarker;
    this._stabilizer = stabilizer;
  }

  get isInitialized(): boolean {
    return this._landmarker.isInitialized;
  }

  get isDetecting(): boolean {
    return this._isDetecting;
  }

  getCapabilities(): DetectionCapabilities {
    return {
      supportsRealtime: true,
      supportsPostRecording: true,
      requiresCalibration: false,
    };
  }

  async initialize(): Promise<void> {
    await this._landmarker.initialize();
  }

  async startRealTimeDetection(
    video: HTMLVideoElement,
    onFrame: (frame: DetectionFrame) => void,
    options?: { mirrored?: boolean; gridMode?: GridMode }
  ): Promise<void> {
    // End the previous session and claim this one before anything async. The
    // first start waits on a CDN download that can take seconds, and whoever
    // stops tracking in the meantime (the user leaving Train, a grid-mode
    // restart) bumps the session id — without that, the load finishes and
    // starts a frame loop the stop can no longer cancel, pushing detections
    // into a session that is already gone.
    this.stopDetection();
    const session = this._sessionId;

    if (!this.isInitialized) {
      await this.initialize();
      if (session !== this._sessionId || !this.isInitialized) {
        return;
      }
    }

    this._videoElement = video;
    this._frameCallback = onFrame;
    this._isMirrored = options?.mirrored ?? true;
    this._gridMode = options?.gridMode;
    this._isDetecting = true;

    this._processVideoFrame();
  }

  private _processVideoFrame(): void {
    if (!this._isDetecting || !this._videoElement || !this._frameCallback) {
      return;
    }

    if (this._videoElement.readyState < 2) {
      this._animationFrameId = requestAnimationFrame(() =>
        this._processVideoFrame()
      );
      return;
    }

    const now = performance.now();
    const frameStart = now;

    // Detection
    const result = this._landmarker.detectForVideo(this._videoElement, now);
    const frame = this._processResult(result, now);
    this._frameCallback(frame);

    // Track performance
    const totalTime = performance.now() - frameStart;
    this._detectionTimes.push(totalTime);
    if (this._detectionTimes.length > 60) {
      this._detectionTimes.shift();
    }

    // Update FPS counter
    this._frameCount++;
    if (now - this._lastFpsUpdate >= 1000) {
      this._currentFps = this._frameCount;
      this._frameCount = 0;
      this._lastFpsUpdate = now;
    }

    this._animationFrameId = requestAnimationFrame(() =>
      this._processVideoFrame()
    );
  }

  private _processResult(
    result: {
      landmarks: HandLandmark[][];
      handedness: Array<Array<{ categoryName: string; score: number }>>;
    },
    timestamp: number
  ): DetectionFrame {
    let leftPosition: DetectedPosition | null = null;
    let rightPosition: DetectedPosition | null = null;

    if (result.landmarks && result.landmarks.length > 0) {
      // Extract hand data using sub-services
      const detectedHands: DetectedHandData[] = [];

      for (let i = 0; i < result.landmarks.length; i++) {
        const landmarks = result.landmarks[i];
        if (!landmarks || landmarks.length < 1) continue;

        const wrist = landmarks[0];
        if (!wrist) continue;

        // Use HandStateAnalyzer to detect hand state
        const stateResult = analyzeHandState(landmarks);
        const handState = stateResult.state;

        const palmCenter = calculatePalmCenter(landmarks, handState);
        const referencePoint = getReferencePoint(landmarks, handState);

        // Transform debug landmarks from full video space to crop space
        const wristTransformed = this._transformCropCoordinates(
          wrist.x,
          wrist.y
        );
        const fingerTransformed = this._transformCropCoordinates(
          referencePoint?.x ?? wrist.x,
          referencePoint?.y ?? wrist.y
        );
        const palmTransformed = this._transformCropCoordinates(
          palmCenter.x,
          palmCenter.y
        );

        // Create debug landmarks (apply mirroring AFTER crop transformation)
        const debugLandmarks = {
          wrist: {
            x: this._isMirrored ? 1 - wristTransformed.x : wristTransformed.x,
            y: wristTransformed.y,
          },
          middleFingerTip: {
            x: this._isMirrored ? 1 - fingerTransformed.x : fingerTransformed.x,
            y: fingerTransformed.y,
          },
          palmCenter: {
            x: this._isMirrored ? 1 - palmTransformed.x : palmTransformed.x,
            y: palmTransformed.y,
          },
        };

        // Use HandednessAnalyzer for anatomical detection
        const handednessResult = analyzeHandedness(landmarks);
        const anatomicalHandedness = handednessResult.anatomicalHandedness;

        // Determine final handedness
        const handednessData = result.handedness[i]?.[0];
        let isUserLeftHand: boolean;
        let confidence: number;

        if (anatomicalHandedness) {
          isUserLeftHand = anatomicalHandedness === "left";
          confidence = handednessResult.confidence;
        } else {
          // Fallback to MediaPipe
          const rawHandedness = handednessData?.categoryName;
          isUserLeftHand = this._isMirrored
            ? rawHandedness === "Left"
            : rawHandedness === "Right";
          confidence = handednessData?.score ?? 0;
        }

        // Create detected position
        const position = this._createDetectedPosition(
          palmCenter,
          timestamp,
          debugLandmarks,
          handState
        );

        // Only add hand if position is valid for current grid mode
        if (position) {
          detectedHands.push({
            position,
            wristX: wrist.x,
            isUserLeftHand,
            confidence,
          });
        }
      }

      // Assign hands to blue/red slots
      const assignment = this._assignHands(detectedHands, timestamp);
      leftPosition = assignment.left;
      rightPosition = assignment.right;
    }

    // Clear history for undetected hands
    if (!leftPosition) {
      this._stabilizer.clearHistory("left");
    }
    if (!rightPosition) {
      this._stabilizer.clearHistory("right");
    }

    const persisted = this._applyPersistence(leftPosition, rightPosition);
    leftPosition = persisted.left;
    rightPosition = persisted.right;

    return {
      timestamp,
      left: leftPosition,
      right: rightPosition,
      source: "mediapipe",
    };
  }

  /**
   * Assign detected hands to blue (left) and red (right) slots
   */
  private _assignHands(
    detectedHands: DetectedHandData[],
    timestamp: number
  ): { left: DetectedPosition | null; right: DetectedPosition | null } {
    let leftPosition: DetectedPosition | null = null;
    let rightPosition: DetectedPosition | null = null;

    if (detectedHands.length === 2) {
      // Two hands - use position to disambiguate
      const sorted = [...detectedHands].sort((a, b) => a.wristX - b.wristX);
      const hand0 = sorted[0];
      const hand1 = sorted[1];

      if (hand0 && hand1) {
        if (this._isMirrored) {
          rightPosition = hand0.position;
          leftPosition = hand1.position;
        } else {
          leftPosition = hand0.position;
          rightPosition = hand1.position;
        }
      }

      if (leftPosition) {
        leftPosition = this._applySmoothingToPosition(
          leftPosition,
          "left",
          timestamp
        );
      }
      if (rightPosition) {
        rightPosition = this._applySmoothingToPosition(
          rightPosition,
          "right",
          timestamp
        );
      }
    } else if (detectedHands.length === 1) {
      const hand = detectedHands[0];
      if (hand) {
        const assigned = this._assignSingleHand(hand, timestamp);
        leftPosition = assigned.left;
        rightPosition = assigned.right;
      }
    }

    return { left: leftPosition, right: rightPosition };
  }

  /**
   * Assign a single detected hand using proximity matching
   */
  private _assignSingleHand(
    hand: DetectedHandData,
    timestamp: number
  ): { left: DetectedPosition | null; right: DetectedPosition | null } {
    const handX = hand.position.rawPosition.x;
    const handY = hand.position.rawPosition.y;

    let assignToBlue = false;

    const hasLeftHistory = this._stabilizer.hasHistory("left");
    const hasRightHistory = this._stabilizer.hasHistory("right");

    if (hasLeftHistory && hasRightHistory) {
      const lastLeft = this._stabilizer.getLastPosition("left");
      const lastRight = this._stabilizer.getLastPosition("right");

      if (lastLeft && lastRight) {
        const distToLeft = this._stabilizer.calculateDistance(
          handX,
          handY,
          lastLeft.x,
          lastLeft.y
        );
        const distToRight = this._stabilizer.calculateDistance(
          handX,
          handY,
          lastRight.x,
          lastRight.y
        );
        assignToBlue = distToLeft < distToRight;
      }
    } else if (hasLeftHistory) {
      const lastLeft = this._stabilizer.getLastPosition("left");
      if (lastLeft) {
        const distToLeft = this._stabilizer.calculateDistance(
          handX,
          handY,
          lastLeft.x,
          lastLeft.y
        );
        assignToBlue = distToLeft < 0.3;
      }
    } else if (hasRightHistory) {
      const lastRight = this._stabilizer.getLastPosition("right");
      if (lastRight) {
        const distToRight = this._stabilizer.calculateDistance(
          handX,
          handY,
          lastRight.x,
          lastRight.y
        );
        assignToBlue = distToRight >= 0.3;
      }
    } else {
      assignToBlue = handX > 0.5;
    }

    if (assignToBlue) {
      const smoothedPosition = this._applySmoothingToPosition(
        hand.position,
        "left",
        timestamp
      );
      this._stabilizer.setAssignedHand("left", "left");
      return { left: smoothedPosition, right: null };
    } else {
      const smoothedPosition = this._applySmoothingToPosition(
        hand.position,
        "right",
        timestamp
      );
      this._stabilizer.setAssignedHand("right", "right");
      return { left: null, right: smoothedPosition };
    }
  }

  /**
   * Apply temporal smoothing to a position
   */
  private _applySmoothingToPosition(
    position: DetectedPosition,
    handId: "left" | "right",
    timestamp: number
  ): DetectedPosition {
    const smoothed = this._stabilizer.addPosition(
      handId,
      position.rawPosition.x,
      position.rawPosition.y,
      timestamp
    );

    return {
      ...position,
      rawPosition: smoothed,
      quadrant: mapToQuadrant(smoothed.x, smoothed.y),
    };
  }

  /**
   * Apply hand persistence (show hands briefly after they disappear)
   */
  private _applyPersistence(
    currentLeft: DetectedPosition | null,
    currentRight: DetectedPosition | null
  ): { left: DetectedPosition | null; right: DetectedPosition | null } {
    let left = currentLeft;
    let right = currentRight;

    // Left-hand persistence
    if (left) {
      this._lastLeftPosition = left;
      this._leftFramesMissing = 0;
    } else if (
      this._lastLeftPosition &&
      this._leftFramesMissing < HAND_PERSISTENCE_FRAMES
    ) {
      left = this._lastLeftPosition;
      this._leftFramesMissing++;
    } else {
      this._lastLeftPosition = null;
    }

    // Right-hand persistence
    if (right) {
      this._lastRightPosition = right;
      this._rightFramesMissing = 0;
    } else if (
      this._lastRightPosition &&
      this._rightFramesMissing < HAND_PERSISTENCE_FRAMES
    ) {
      right = this._lastRightPosition;
      this._rightFramesMissing++;
    } else {
      this._lastRightPosition = null;
    }

    return { left, right };
  }

  /**
   * Transform coordinates from full video space to displayed crop space.
   *
   * When video uses object-fit: cover, the displayed area may be a crop of the full frame.
   * MediaPipe returns coordinates normalized to the full video dimensions.
   * We need to transform these to the visible crop region.
   *
   * For example, if video is 1920x1080 (16:9) displayed in a square container:
   * - object-fit: cover crops the sides, showing center 1080x1080 pixels
   * - Visible x range: (1920-1080)/2 / 1920 = 0.219 to 0.781
   * - Transform: x_crop = (x - 0.219) / 0.562
   */
  private _transformCropCoordinates(
    x: number,
    y: number
  ): { x: number; y: number } {
    if (!this._videoElement) {
      return { x, y };
    }

    const videoWidth = this._videoElement.videoWidth;
    const videoHeight = this._videoElement.videoHeight;
    const displayWidth = this._videoElement.clientWidth;
    const displayHeight = this._videoElement.clientHeight;

    if (!videoWidth || !videoHeight || !displayWidth || !displayHeight) {
      return { x, y };
    }

    const videoAspect = videoWidth / videoHeight;
    const displayAspect = displayWidth / displayHeight;

    // object-fit: cover behavior
    if (videoAspect > displayAspect) {
      // Video is wider - crop sides
      const visibleWidth = videoHeight * displayAspect;
      const cropLeft = (videoWidth - visibleWidth) / 2;
      const cropRight = cropLeft + visibleWidth;

      // Transform x coordinate
      const cropLeftNorm = cropLeft / videoWidth;
      const cropRightNorm = cropRight / videoWidth;
      const xTransformed = (x - cropLeftNorm) / (cropRightNorm - cropLeftNorm);

      return { x: xTransformed, y };
    } else if (videoAspect < displayAspect) {
      // Video is taller - crop top/bottom
      const visibleHeight = videoWidth / displayAspect;
      const cropTop = (videoHeight - visibleHeight) / 2;
      const cropBottom = cropTop + visibleHeight;

      // Transform y coordinate
      const cropTopNorm = cropTop / videoHeight;
      const cropBottomNorm = cropBottom / videoHeight;
      const yTransformed = (y - cropTopNorm) / (cropBottomNorm - cropTopNorm);

      return { x, y: yTransformed };
    }

    // Same aspect ratio - no crop needed
    return { x, y };
  }

  private _createDetectedPosition(
    landmark: HandLandmark,
    timestamp: number,
    debugLandmarks?: {
      wrist: { x: number; y: number };
      middleFingerTip: { x: number; y: number };
      palmCenter: { x: number; y: number };
    },
    handState?: "open" | "closed" | "partial"
  ): DetectedPosition | null {
    // Transform coordinates from full video space to visible crop space
    const transformed = this._transformCropCoordinates(landmark.x, landmark.y);

    // Apply mirroring AFTER crop transformation
    const x = this._isMirrored ? 1 - transformed.x : transformed.x;
    const y = transformed.y;

    const quadrant = mapToQuadrant(x, y);

    // Check if this quadrant is valid for the current grid mode
    if (!isValidForMode(quadrant, this._gridMode)) {
      // Position detected but not valid for current mode - reject it
      return null;
    }

    return {
      quadrant,
      confidence: 1.0,
      rawPosition: { x, y },
      timestamp,
      debug: debugLandmarks,
      handState,
    };
  }

  getPerformanceStats(): {
    fps: number;
    avgFrameTime: number;
    videoResolution: string;
  } {
    const avgTime =
      this._detectionTimes.length > 0
        ? this._detectionTimes.reduce((a, b) => a + b, 0) /
          this._detectionTimes.length
        : 0;
    const resolution = this._videoElement
      ? `${this._videoElement.videoWidth}x${this._videoElement.videoHeight}`
      : "N/A";
    return {
      fps: this._currentFps,
      avgFrameTime: avgTime,
      videoResolution: resolution,
    };
  }

  stopDetection(): void {
    this._sessionId++;
    this._isDetecting = false;
    this._frameCallback = null;
    this._videoElement = null;

    // Reset persistence state
    this._lastLeftPosition = null;
    this._lastRightPosition = null;
    this._leftFramesMissing = 0;
    this._rightFramesMissing = 0;

    // Reset stabilizer
    this._stabilizer.resetAll();

    // Reset performance tracking
    this._frameCount = 0;
    this._detectionTimes = [];
    this._currentFps = 0;

    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }

  async processFrame(
    imageData: ImageData,
    timestamp: number
  ): Promise<DetectionFrame> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(imageData, 0, 0);

    const result = this._landmarker.detect(canvas);
    return this._processResult(result, timestamp);
  }

  dispose(): void {
    this.stopDetection();
    this._landmarker.dispose();
  }
}
