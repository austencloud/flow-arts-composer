import type { SequenceStep } from "../../core/types/sequence-engine-types.js";
import {
  LOOPComponent,
  type PropLOOPSpec,
  type LOOPSpec,
  specsAreEqual,
  EMPTY_PROP_SPEC,
} from "../loop-spec.js";
import { Period } from "../loop-types.js";
import { strictRotatedExecutor } from "./StrictRotatedExecutor.js";
import { rewoundExecutor } from "./RewoundExecutor.js";
import { FusedExecutor, type FusedTransformFlags } from "./FusedExecutor.js";
import { applyOverlayInversion } from "./overlay-inversion.js";

const FUSEABLE = new Set([
  LOOPComponent.MIRRORED,
  LOOPComponent.FLIPPED,
  LOOPComponent.SWAPPED,
  LOOPComponent.INVERTED,
]);

export function executeSymmetricSpec(
  sequence: SequenceStep[],
  spec: PropLOOPSpec
): SequenceStep[] {
  if (spec.components.size === 0) return sequence;

  let result = sequence;

  // Assumes caller has pre-validated via validateLOOPSpec (rewound_exclusivity).
  if (spec.components.has(LOOPComponent.REWOUND)) {
    const period = spec.components.get(LOOPComponent.REWOUND)!.period;
    const periodEnum = period === 4 ? Period.QUARTERED : Period.HALVED;
    return rewoundExecutor.executeLOOP(result, periodEnum);
  }

  // Decide whether ROTATED needs a separate stage or is absorbed by
  // FusedExecutor.  FusedExecutor.computeEndLocation() inherently rotates
  // locations by applying the hand-path direction from the seed step.
  // When the fuseable group at the same period contains only SWAP/INVERT
  // (no MIRROR/FLIP), that implicit rotation is sufficient and a separate
  // ROTATED stage would incorrectly double the sequence a second time.
  //
  // When the fuseable group at the same period includes MIRROR or FLIP,
  // the separate ROTATED stage IS required: ROTATED must expand the
  // sequence first so that MIRROR/FLIP can then double the expanded
  // sequence (matching the legacy chaining pattern).
  if (spec.components.has(LOOPComponent.ROTATED)) {
    const rotatedPeriod = spec.components.get(LOOPComponent.ROTATED)!.period;
    const fuseableAtSamePeriod = hasFuseableAtPeriod(spec, rotatedPeriod);
    const mirrorOrFlipAtSamePeriod = hasMirrorOrFlipAtPeriod(
      spec,
      rotatedPeriod
    );

    // Run ROTATED as a separate stage only when:
    // - there are no fuseable components at the same period (pure rotation), OR
    // - fuseable components at the same period include MIRROR or FLIP
    //   (chaining pattern: rotate first, then mirror/flip the expanded result)
    if (!fuseableAtSamePeriod || mirrorOrFlipAtSamePeriod) {
      const periodEnum = rotatedPeriod === 4 ? Period.QUARTERED : Period.HALVED;
      result = strictRotatedExecutor.executeLOOP(result, periodEnum);
    }
    // Otherwise (only SWAP/INVERT at the same period), FusedExecutor's
    // computeEndLocation handles the rotation implicitly — skip the stage.
  }

  const groups = groupFuseableByPeriod(spec);
  for (const [period, flags] of groups) {
    const rotated = spec.components.get(LOOPComponent.ROTATED);
    const absorbedRotation =
      rotated?.period === period &&
      hasFuseableAtPeriod(spec, period) &&
      !hasMirrorOrFlipAtPeriod(spec, period);
    const executor = new FusedExecutor({ ...flags, rotate: absorbedRotation });
    result = executor.execute(result, period);
  }

  // Overlay stages run last, in place (x1 length) — inversion is applied
  // over the fully-expanded result, not folded into the fused-expand groups.
  for (const [comp, cSpec] of spec.components) {
    if (cSpec.mode !== "overlay") continue;
    if (comp !== LOOPComponent.INVERTED) {
      throw new Error(`Overlay mode is not supported for ${comp}`);
    }
    result = applyOverlayInversion(result, cSpec.period);
  }

  return result;
}

export function executeLOOPSpec(
  sequence: SequenceStep[],
  spec: LOOPSpec
): SequenceStep[] {
  const leftSpec = spec.left ?? EMPTY_PROP_SPEC;
  const rightSpec = spec.right ?? EMPTY_PROP_SPEC;

  if (specsAreEqual(leftSpec, rightSpec)) {
    return executeSymmetricSpec(sequence, leftSpec);
  }

  throw new Error(
    "Asymmetric LOOPSpec execution not yet implemented. " +
      "Per-prop independent execution requires Phase 3b follow-on."
  );
}

/**
 * Return the number of output steps produced per seed step by a LOOPSpec.
 *
 * This follows the executor's real stage plan:
 * - same-period fuseable components share one expansion;
 * - ROTATED gets its own expansion only when it is not absorbed by a
 *   same-period SWAPPED/INVERTED group;
 * - overlay components do not change length.
 */
export function getLOOPSpecExpansionMultiplier(spec: LOOPSpec): number {
  const leftSpec = spec.left ?? EMPTY_PROP_SPEC;
  const rightSpec = spec.right ?? EMPTY_PROP_SPEC;

  if (!specsAreEqual(leftSpec, rightSpec)) {
    throw new Error(
      "Asymmetric LOOPSpec expansion is not yet implemented. " +
        "A single seed-length multiplier requires symmetric execution."
    );
  }

  if (leftSpec.components.size === 0) return 1;

  // RewoundExecutor appends one reversed copy. Its legacy period parameter is
  // accepted for compatibility but does not alter the two-pass execution.
  if (leftSpec.components.has(LOOPComponent.REWOUND)) return 2;

  let multiplier = 1;
  const rotated = leftSpec.components.get(LOOPComponent.ROTATED);
  if (rotated) {
    const fuseableAtSamePeriod = hasFuseableAtPeriod(leftSpec, rotated.period);
    const mirrorOrFlipAtSamePeriod = hasMirrorOrFlipAtPeriod(
      leftSpec,
      rotated.period
    );

    if (!fuseableAtSamePeriod || mirrorOrFlipAtSamePeriod) {
      multiplier *= rotated.period === 4 ? 4 : 2;
    }
  }

  for (const period of groupFuseableByPeriod(leftSpec).keys()) {
    multiplier *= period;
  }

  return multiplier;
}

/**
 * True when at least one FUSEABLE component exists at the given period.
 * Overlay-mode components are excluded — they never join a fused-expand
 * group (they run as a separate in-place stage after everything else), so
 * they must not influence whether ROTATED needs its own expand stage.
 */
function hasFuseableAtPeriod(spec: PropLOOPSpec, period: number): boolean {
  for (const [comp, cSpec] of spec.components) {
    if (cSpec.mode === "overlay") continue;
    if (FUSEABLE.has(comp) && cSpec.period === period) return true;
  }
  return false;
}

/**
 * True when MIRRORED or FLIPPED exists at the given period.
 * Overlay-mode components are excluded (see hasFuseableAtPeriod).
 */
function hasMirrorOrFlipAtPeriod(spec: PropLOOPSpec, period: number): boolean {
  for (const [comp, cSpec] of spec.components) {
    if (cSpec.mode === "overlay") continue;
    if (
      (comp === LOOPComponent.MIRRORED || comp === LOOPComponent.FLIPPED) &&
      cSpec.period === period
    ) {
      return true;
    }
  }
  return false;
}

function groupFuseableByPeriod(
  spec: PropLOOPSpec
): Map<number, FusedTransformFlags> {
  const groups = new Map<
    number,
    { mirror: boolean; flip: boolean; swap: boolean; invert: boolean }
  >();

  for (const [comp, cSpec] of spec.components) {
    if (!FUSEABLE.has(comp)) continue;
    if (cSpec.mode === "overlay") continue;

    if (!groups.has(cSpec.period)) {
      groups.set(cSpec.period, {
        mirror: false,
        flip: false,
        swap: false,
        invert: false,
      });
    }
    const flags = groups.get(cSpec.period)!;
    if (comp === LOOPComponent.MIRRORED) flags.mirror = true;
    if (comp === LOOPComponent.FLIPPED) flags.flip = true;
    if (comp === LOOPComponent.SWAPPED) flags.swap = true;
    if (comp === LOOPComponent.INVERTED) flags.invert = true;
  }

  // Canonical stage order: groups containing MIRROR/FLIP/SWAP run before
  // invert-only groups (inversion is the outermost layer); ascending period
  // within each class. Same-period components remain fused in one group —
  // fused mirror+invert cancels rotation flips, which sequential stages
  // would not (and the legacy one-period-for-all path depends on it).
  return new Map(
    [...groups.entries()].sort(([pa, fa], [pb, fb]) => {
      const invOnlyA = fa.invert && !fa.mirror && !fa.flip && !fa.swap ? 1 : 0;
      const invOnlyB = fb.invert && !fb.mirror && !fb.flip && !fb.swap ? 1 : 0;
      if (invOnlyA !== invOnlyB) return invOnlyA - invOnlyB;
      return pa - pb;
    })
  ) as Map<number, FusedTransformFlags>;
}
