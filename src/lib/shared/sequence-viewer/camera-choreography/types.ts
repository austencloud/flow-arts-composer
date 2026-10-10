/**
 * Camera Choreography - types
 *
 * A preset is a driver that owns the CameraControls instance while a
 * recording is in progress. On apply(), it captures controls, sets the
 * opening shot, subscribes to per-frame ticks and loop boundaries, and
 * returns a disposer that tears it all down on recording end / cancel.
 */

import type CameraControls from "camera-controls";
import type { CharacterInstanceState } from "#lib/shared/3d/state/character-instance-state.svelte.js";

export type PerformerCountRule =
  | { kind: "exactly"; count: number }
  | { kind: "atLeast"; count: number }
  | { kind: "any" };

export interface CameraPresetContext {
  performers: CharacterInstanceState[];
  /** One loop of the sequence, in seconds. */
  sequenceDurationSec: number;
  /**
   * How many loops this preset will record over. Drivers use it to
   * partition behavior across loops (e.g. Quad-plane tour = 4).
   */
  totalLoops: number;
  /**
   * Subscribe to loop-boundary events. Returns an unsubscribe function.
   * Fires at the instant playback wraps from ≈1 → ≈0.
   */
  onLoopBoundary: (fn: () => void) => () => void;
  /**
   * Per-frame tick registration. Called every Threlte useTask frame
   * while the preset is active. Returns an unsubscribe.
   */
  onTick: (fn: (deltaSec: number) => void) => () => void;
}

export interface CameraPreset {
  id: string;
  label: string;
  icon: string;
  performerCountRule: PerformerCountRule;
  /** How many loops of the sequence this preset needs to capture. */
  totalLoops: number;
  /**
   * Attach the driver. Return a disposer that releases all subscriptions
   * and restores any smoothTime / target mutations the driver made.
   */
  apply(controls: CameraControls, ctx: CameraPresetContext): () => void;
}

export interface PresetEvaluation {
  eligible: boolean;
  /** Human-readable reason when !eligible. */
  reason?: string;
}

export function evaluatePreset(
  preset: Pick<CameraPreset, "performerCountRule">,
  performerCount: number,
): PresetEvaluation {
  const rule = preset.performerCountRule;
  if (rule.kind === "any") return { eligible: true };
  if (rule.kind === "atLeast") {
    return performerCount >= rule.count
      ? { eligible: true }
      : {
          eligible: false,
          reason: `Needs at least ${rule.count} performer${rule.count === 1 ? "" : "s"} (you have ${performerCount})`,
        };
  }
  // exactly
  return performerCount === rule.count
    ? { eligible: true }
    : {
        eligible: false,
        reason: `Needs exactly ${rule.count} performer${rule.count === 1 ? "" : "s"} (you have ${performerCount})`,
      };
}
