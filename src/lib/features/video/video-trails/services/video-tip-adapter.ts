import type { DetectedEndpoint } from "../domain/types";
import type { PropTipData } from "#lib/shared/animation-engine/domain/types/fire-types.js";
import type {
  LedSample,
  LedOverlayConfig,
} from "#lib/shared/animation-engine/domain/types/led-types.js";
import type { TrailPoint } from "#lib/shared/animation-engine/domain/types/trail-types.js";

// Tracks a single endpoint's last known position and timestamp so we can
// compute instantaneous velocity via finite differencing on the next frame.
interface PreviousPosition {
  x: number;
  y: number;
  time: number;
  velocityX: number;
  velocityY: number;
}

interface EndpointTrack {
  x: number;
  y: number;
  frame: number;
  velocityX: number;
  velocityY: number;
}

export interface StabilizedEndpoints {
  endpoints: DetectedEndpoint[];
  /** Trails for these tips must start a new stroke after a long dropout. */
  breaks: string[];
}

// Minimum time delta (seconds) used as the denominator in velocity calculations.
// Prevents division by near-zero when two frames arrive at nearly the same time.
const MIN_DT_SECONDS = 0.001;

export class VideoTipAdapter {
  // Keyed by "propIndex-tipIndex" so each tip is tracked independently.
  private previousPositions = new Map<string, PreviousPosition>();
  private endpointTracks = new Map<string, EndpointTrack>();
  private previousEndpointTracks = new Map<string, EndpointTrack>();

  /** Keep detector labels attached to the same physical tips across frames. */
  stabilizeEndpoints(
    detections: DetectedEndpoint[],
    frame: number,
    canvasSize: number,
  ): StabilizedEndpoints {
    this.previousEndpointTracks = new Map(this.endpointTracks);
    const diagonal = Math.hypot(canvasSize, canvasSize);
    const slots = ["0-0", "0-1", "1-0", "1-1"];
    const assigned = new Map<number, string>();
    const usedSlots = new Set<string>();
    const candidates: { index: number; slot: string; distance: number }[] = [];

    for (let index = 0; index < detections.length; index++) {
      const detection = detections[index]!;
      for (const [slot, track] of this.endpointTracks) {
        const gap = frame - track.frame;
        if (gap < 1 || gap > 12) continue;
        const coast = Math.min(gap, 6);
        const distance = Math.hypot(
          detection.x - (track.x + track.velocityX * coast),
          detection.y - (track.y + track.velocityY * coast),
        );
        const reach = diagonal * (0.06 + Math.min(gap, 9) * 0.02);
        if (distance <= reach) candidates.push({ index, slot, distance });
      }
    }

    // A global closest-first pass prevents one detection from occupying two tips.
    candidates.sort((a, b) => a.distance - b.distance);
    for (const candidate of candidates) {
      if (assigned.has(candidate.index) || usedSlots.has(candidate.slot)) continue;
      assigned.set(candidate.index, candidate.slot);
      usedSlots.add(candidate.slot);
    }

    const breaks: string[] = [];
    const endpoints: DetectedEndpoint[] = [];
    for (let index = 0; index < detections.length; index++) {
      const detection = detections[index]!;
      let slot = assigned.get(index);
      if (!slot) {
        const preferred = `${detection.propIndex}-${detection.tipIndex}`;
        // A fresh point cannot hijack an active tip just because the detector
        // reused its label. Wait for another frame if all slots are occupied.
        slot = slots.find((key) =>
          !usedSlots.has(key) &&
          (!this.endpointTracks.has(key) || frame - this.endpointTracks.get(key)!.frame > 12) &&
          key === preferred,
        ) ?? slots.find((key) =>
          !usedSlots.has(key) &&
          (!this.endpointTracks.has(key) || frame - this.endpointTracks.get(key)!.frame > 12),
        );
        if (!slot) continue;
        usedSlots.add(slot);
      }

      const previous = this.endpointTracks.get(slot);
      const gap = previous ? frame - previous.frame : 0;
      if (previous && gap > 6) {
        breaks.push(slot);
        this.previousPositions.delete(slot);
      }
      const velocityX = previous && gap > 0 && gap <= 6
        ? (detection.x - previous.x) / gap : 0;
      const velocityY = previous && gap > 0 && gap <= 6
        ? (detection.y - previous.y) / gap : 0;
      this.endpointTracks.set(slot, {
        x: detection.x,
        y: detection.y,
        frame,
        velocityX,
        velocityY,
      });
      const [propIndex, tipIndex] = slot.split("-").map(Number);
      endpoints.push({
        ...detection,
        propIndex: propIndex as 0 | 1,
        tipIndex: tipIndex!,
        frameIndex: frame,
      });
    }

    return { endpoints, breaks };
  }

  /** Corrected and occluded points must also change the next frame's prediction. */
  reconcileCorrections(endpoints: DetectedEndpoint[], frame: number): void {
    this.endpointTracks = new Map(this.previousEndpointTracks);
    for (const endpoint of endpoints) {
      const slot = `${endpoint.propIndex}-${endpoint.tipIndex}`;
      const previous = this.endpointTracks.get(slot);
      const gap = previous ? frame - previous.frame : 0;
      this.endpointTracks.set(slot, {
        x: endpoint.x,
        y: endpoint.y,
        frame,
        velocityX: previous && gap > 0 && gap <= 6
          ? (endpoint.x - previous.x) / gap : 0,
        velocityY: previous && gap > 0 && gap <= 6
          ? (endpoint.y - previous.y) / gap : 0,
      });
    }
  }

  mapToFireTips(
    endpoints: DetectedEndpoint[],
    canvasSize: number,
    currentTime: number
  ): PropTipData[] {
    return endpoints.map((ep) => {
      const key = `${ep.propIndex}-${ep.tipIndex}`;
      const prev = this.previousPositions.get(key);

      // On the first frame for this tip there is no previous position, so velocity
      // is zero. On subsequent frames we use finite differencing: Δposition / Δtime.
      let vx = 0;
      let vy = 0;
      let accelerationX = 0;
      let accelerationY = 0;

      if (prev !== undefined) {
        // Clamp dt so a duplicate timestamp doesn't produce Infinity.
        const dt = Math.max((currentTime - prev.time) / 1000, MIN_DT_SECONDS);
        vx = (ep.x - prev.x) / dt;
        vy = (ep.y - prev.y) / dt;
        accelerationX = (vx - prev.velocityX) / dt;
        accelerationY = (vy - prev.velocityY) / dt;
      }

      this.previousPositions.set(key, {
        x: ep.x,
        y: ep.y,
        time: currentTime,
        velocityX: vx,
        velocityY: vy,
      });

      return {
        x: ep.x,
        y: ep.y,
        prevX: prev?.x ?? ep.x,
        prevY: prev?.y ?? ep.y,
        velocityX: vx,
        velocityY: vy,
        speed: Math.sqrt(vx * vx + vy * vy),
        accelerationX,
        accelerationY,
        propIndex: ep.propIndex,
        tipIndex: ep.tipIndex,
        flameScale: ep.brightness,
        jerk: Math.hypot(accelerationX, accelerationY),
      };
    });
  }

  mapToLedSamples(
    endpoints: DetectedEndpoint[],
    _currentTime: number,
    _ledConfig: LedOverlayConfig
  ): LedSample[] {
    // A detected endpoint is one capsule LED. Color comes from the renderer's
    // configured pattern, so these carry white and let detection brightness
    // through.
    return endpoints.map((ep) => ({
      x: ep.x,
      y: ep.y,
      propIndex: ep.propIndex,
      ledIndex: ep.tipIndex,
      endpointIndex: ep.tipIndex,
      brightness: ep.brightness,
      r: 1,
      g: 1,
      b: 1,
    }));
  }

  mapToTrailPoints(
    endpoints: DetectedEndpoint[],
    currentTime: number
  ): TrailPoint[] {
    return endpoints.map((ep) => ({
      x: ep.x,
      y: ep.y,
      timestamp: currentTime,
      propIndex: ep.propIndex as 0 | 1,
      tipIndex: ep.tipIndex,
    }));
  }

  reset(): void {
    // Called when the video is seeked or restarted. Clearing the position map
    // means the next frame will have no previous position to diff against,
    // producing zero velocity - exactly what we want after a discontinuity.
    this.previousPositions.clear();
    this.endpointTracks.clear();
    this.previousEndpointTracks.clear();
  }
}
