import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

export interface MinimalMotion {
  type: string;
  dir: string;
  startLoc: string;
  endLoc: string;
  turns: number;
  startOri: string;
  endOri: string;
}

export interface MinimalStep {
  step: number;
  letter: string;
  startPos: string;
  endPos: string;
  left: MinimalMotion | null;
  right: MinimalMotion | null;
}

export interface SequenceKey {
  startPos: string;
  endPos: string;
  startLoc: string;
  endLoc: string;
  startOri: string;
  endOri: string;
  type: string;
  dir: string;
  turns: string;
}

export interface MinimalSequence {
  key: SequenceKey;
  name: string;
  word: string;
  isCircular: boolean;
  gridMode: string;
  startPlacement: MinimalStep | null;
  steps: (MinimalStep | null)[];
}

/** Union type for beat-like objects that can be exported */
type StepLike = StepData | StartPlacementData | null | undefined;

/**
 * Exports sequences to minimal JSON format for debugging/admin use.
 * Strips placement data fluff, keeps only essential motion data.
 */

function minimalMotion(motion: MotionData | null | undefined): MinimalMotion | null {
  if (!motion) return null;
  return {
    type: motion.motionType || "",
    dir: motion.rotationDirection || "",
    startLoc: motion.startLocation || "",
    endLoc: motion.endLocation || "",
    turns: typeof motion.turns === "number" ? motion.turns : 0,
    startOri: motion.startOrientation || "",
    endOri: motion.endOrientation || "",
  };
}

function minimalStep(beat: StepLike): MinimalStep | null {
  if (!beat) return null;
  // Handle both StepData (has stepNumber) and StartPlacementData (no stepNumber)
  const stepNumber = "stepNumber" in beat ? beat.stepNumber : 0;
  return {
    step: stepNumber ?? 0,
    letter: beat.letter || "",
    startPos: beat.startPlacement || "",
    endPos: beat.endPlacement || "",
    left: minimalMotion(beat.motions?.left),
    right: minimalMotion(beat.motions?.right),
  };
}

export function toMinimalJson(sequence: SequenceData): MinimalSequence {
  return {
    key: {
      startPos: "placement = combination of both hand locations (e.g. gamma1, alpha3)",
      endPos: "placement at end of step",
      startLoc: "single hand grid location (n/e/s/w)",
      endLoc: "hand grid location at end of motion",
      startOri: "prop orientation at start (in/out/cw/ccw)",
      endOri: "prop orientation at end",
      type: "motion type (pro/anti/static/dash/float)",
      dir: "rotation direction (cw/ccw/noRotation)",
      turns: "additional rotation (0, 1, 2, fl)",
    },
    name: sequence.name || "",
    word: sequence.word || "",
    isCircular: sequence.isCircular || false,
    gridMode: sequence.gridMode || "",
    startPlacement: minimalStep(
      sequence.startPlacement || sequence.startingPlacement
    ),
    steps: (sequence.steps || []).map((step) => minimalStep(step)),
  };
}

export function toJsonString(sequence: SequenceData): string {
  const minimal = toMinimalJson(sequence);
  return JSON.stringify(minimal, null, 2);
}

/**
 * Escape every non-ASCII character to a `\uXXXX` sequence. TKA letters are UTF-8
 * Greek (Σ Θ Φ Ψ Ω …); when copied text crosses a non-UTF-8 boundary (Windows
 * clipboard ANSI interop, a codepage-narrowing paste target) those bytes are
 * lost — a char becomes `?` (codepage substitution) or `�` U+FFFD (invalid-UTF-8
 * decode), unrecoverably. `\u`-escaped JSON is pure 7-bit ASCII, still valid
 * JSON, and parses back to the exact glyph, so it survives any transport.
 */
function escapeNonAscii(s: string): string {
  return s.replace(/[^\x00-\x7F]/g, (c) => {
    const cp = c.codePointAt(0)!;
    return "\\u" + cp.toString(16).padStart(4, "0");
  });
}

/** ASCII-safe payload for clipboard/paste transport (see escapeNonAscii). */
export function toAsciiSafeJsonString(sequence: SequenceData): string {
  return escapeNonAscii(toJsonString(sequence));
}

export async function copyToClipboard(sequence: SequenceData): Promise<boolean> {
  try {
    // ASCII-safe so Greek letters survive the clipboard/paste encoding boundary.
    const jsonString = toAsciiSafeJsonString(sequence);
    await navigator.clipboard.writeText(jsonString);
    return true;
  } catch (error) {
    console.error("Failed to copy sequence JSON:", error);
    return false;
  }
}
