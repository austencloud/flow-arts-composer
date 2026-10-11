import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  rotateSequence,
  mirrorSequence,
  flipSequence,
  invertSequence,
  rewindSequence,
} from "#lib/shared/create/services/sequence-transforms.js";
import { normalizeSequenceDerived } from "#lib/shared/create/services/sequence-derived-fields.js";
import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";
import {
  generateCopyOps,
  type CopyOp,
  type TunnelConfig,
} from "./tunnel-config";
import {
  resolveTunnelLayerPlans,
  type TunnelComposition,
  type TunnelLayerPlan,
} from "./tunnel-composition";

/** Apply one transform op to a sequence, dispatching to the canonical
 *  `sequence-transforms` function. No new transform math lives here. */
async function applyOp(seq: SequenceData, op: CopyOp): Promise<SequenceData> {
  switch (op.kind) {
    case "rotate":
      return rotateSequence(seq, op.amount, motionQueryHandler);
    case "mirror":
      return mirrorSequence(seq, motionQueryHandler);
    case "flip":
      return flipSequence(seq, motionQueryHandler);
    case "invert":
      return invertSequence(seq, motionQueryHandler);
    case "rewind":
      return rewindSequence(seq, motionQueryHandler);
  }
}

/** Fold an ordered op chain onto the base to produce one overlaid copy. Ops
 *  compose left-to-right (order matters: rotate-then-mirror ≠ mirror-then-rotate). */
async function applyOps(
  base: SequenceData,
  ops: CopyOp[]
): Promise<SequenceData> {
  let out = normalizeSequenceDerived(base);
  for (const op of ops) {
    out = normalizeSequenceDerived(await applyOp(out, op));
  }
  return out;
}

export interface BuiltTunnelLayer extends TunnelLayerPlan {
  /** The authored performer's resolved choreography, before formation placement. */
  performerSequence: SequenceData;
  sequence: SequenceData;
}

/** Build every resolved performer in an authored tunnel. The plan decides
 *  which choreography belongs to each formation arm; this module only applies
 *  the canonical sequence transforms that place it there. */
export async function buildTunnelCompositionLayers(
  composition: TunnelComposition,
  cfg: TunnelConfig
): Promise<BuiltTunnelLayer[]> {
  const plans = resolveTunnelLayerPlans(composition, cfg);
  return Promise.all(
    plans.map(async (plan) => {
      const performerSequence = await applyOps(plan.sequence, plan.sourceOps);
      return {
        ...plan,
        performerSequence,
        sequence: await applyOps(performerSequence, plan.formationOps),
      };
    })
  );
}

/**
 * Bake the overlaid copies (everything beyond the always-drawn base) for a
 * config. Returns one SequenceData per extra copy, in overlay order — the
 * SPATIAL result only. The per-copy Stagger + Speed modulators are applied at
 * sample time (see {@link copyModulators} + `sampleTunnelProps`), so tweaking
 * them never re-runs these transforms. The base is NOT included — the caller
 * draws it as the left/right prop pair.
 */
export async function buildTunnelLayers(
  base: SequenceData,
  cfg: TunnelConfig
): Promise<SequenceData[]> {
  return Promise.all(generateCopyOps(cfg).map((ops) => applyOps(base, ops)));
}
