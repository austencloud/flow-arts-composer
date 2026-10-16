/**
 * The Codex board's reader controls, as plain data: which layers each
 * pictograph draws, and the whole-board transforms (rotate, mirror, swap
 * hands). Layers are a reading preference and persist in localStorage;
 * transforms ride in the URL (?tf=) so a transformed board is a shareable
 * link, and they reset with the link.
 */
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  handSwapAllPictographs,
  mirrorAllPictographs,
  rotateAllPictographs,
} from "#lib/features/learn/codex/services/codex-pictograph-updater.js";

export interface CodexVisibility {
  showGlyph: boolean;
  showGrid: boolean;
  showTKA: boolean;
  showPlacements: boolean;
  showReversals: boolean;
  showNonRadialPoints: boolean;
}

export const CODEX_VISIBILITY_STORAGE_KEY = "codex-board-layers";

/** The printed sheet's look: grid and TKA glyph on, everything else off. */
export function defaultCodexVisibility(): CodexVisibility {
  return {
    showGlyph: false,
    showGrid: true,
    showTKA: true,
    showPlacements: false,
    showReversals: false,
    showNonRadialPoints: false,
  };
}

/** Restore saved layers, keeping the default for anything missing or bad. */
export function restoreCodexVisibility(raw: string | null): CodexVisibility {
  const visibility = defaultCodexVisibility();
  if (!raw) return visibility;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return visibility;
    for (const key of Object.keys(visibility) as (keyof CodexVisibility)[]) {
      const value = (saved as Record<string, unknown>)[key];
      if (typeof value === "boolean") visibility[key] = value;
    }
  } catch {
    // A damaged entry falls back to the defaults.
  }
  return visibility;
}

export type CodexTransformOp = "rotate" | "mirror" | "swap";

const OP_CODES: Record<CodexTransformOp, string> = {
  rotate: "r",
  mirror: "m",
  swap: "s",
};

/** Long enough for any real sequence of presses; a hand-edited URL with
 *  more is cut rather than letting it cost the board a slow render. */
const MAX_TRANSFORMS = 16;

export function parseCodexTransforms(
  value: string | null
): CodexTransformOp[] {
  if (!value) return [];
  const ops: CodexTransformOp[] = [];
  for (const code of value.slice(0, MAX_TRANSFORMS)) {
    const op = (Object.keys(OP_CODES) as CodexTransformOp[]).find(
      (candidate) => OP_CODES[candidate] === code
    );
    if (op) ops.push(op);
  }
  return ops;
}

/** The URL value for a transform list, or null when there is none. */
export function formatCodexTransforms(
  ops: readonly CodexTransformOp[]
): string | null {
  return ops.length === 0
    ? null
    : ops
        .slice(-MAX_TRANSFORMS)
        .map((op) => OP_CODES[op])
        .join("");
}

/** Apply the transforms in the order they were pressed. Rotation turns the
 *  pictograph an eighth clockwise, so it also switches Diamond and Box. */
export function transformCodexPictograph(
  pictograph: PictographData,
  ops: readonly CodexTransformOp[]
): PictographData {
  let result = [pictograph];
  for (const op of ops) {
    result =
      op === "rotate"
        ? rotateAllPictographs(result)
        : op === "mirror"
          ? mirrorAllPictographs(result)
          : handSwapAllPictographs(result);
  }
  return result[0]!;
}
