import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { deriveStartPlacementFromSteps } from "$lib/shared/foundation/services/sequence-hydrator";
import {
  createIndependentTunnelPerformer,
  createTunnelComposition,
  type TunnelComposition,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-composition";
import type { CollectedTunnel } from "./tunnel-collection-types";

/**
 * How to read a saved tunnel back into the things that can perform it.
 *
 * A tunnel saved before the Tunnel creator existed has no `composition` — the
 * concept did not exist yet. What it has is `steps`, the one sequence it was
 * built from, plus the formation that multiplied it. Every surface that reopens
 * a tunnel therefore has to reconstruct the cast, and each one that did it
 * privately got a different answer: the viewer rebuilt a one-performer cast and
 * showed the tunnel correctly, while the creator read `composition` straight
 * off the entry, found nothing, and opened an empty picker that still called
 * itself "Edit tunnel". One owner, so a legacy tunnel means the same thing
 * wherever it is opened.
 */

/** The sequence a saved tunnel was built from.
 *
 *  The steps were captured from a live, already-hydrated viewer sequence, so
 *  each carries motions.left/right — the orchestrator's hydrateSequence
 *  short-circuits on hasMotionData() and uses them verbatim rather than
 *  re-deriving from compositional fields the collection does not store.
 *  gridMode is recovered off the steps so the right grid renders.
 *
 *  A CollectedTunnel has never had a field for the start position, so the
 *  start-placement pictograph has to be rebuilt from the first step the same way
 *  the hydrator rebuilds it for any stored sequence. Without this a reopened
 *  tunnel's step strip begins at step 1 with the start cell simply missing. */
export function collectedTunnelSequence(tunnel: CollectedTunnel): SequenceData {
  const steps = [...tunnel.steps];
  const startPlacement = deriveStartPlacementFromSteps(steps);

  return createSequenceData({
    id: tunnel.id,
    name: tunnel.name,
    word: tunnel.name,
    steps,
    gridMode: steps.find((step) => step.gridMode)?.gridMode,
    ...(startPlacement ? { startPlacement } : {}),
  });
}

/**
 * The authored cast, or the cast a legacy tunnel implies.
 *
 * A legacy tunnel implies exactly one performer, because one sequence is all it
 * stored: every arm beyond the first came from the formation — its fold, its
 * reflections, its stagger — and those are saved on the snapshot. Handing the
 * creator a second performer here would put an authored relationship in the
 * record that nobody authored, and an identity copy shown beside its own lead
 * reads as a transform that failed to save. The creator's linked mode is what
 * synthesizes a partner from a solo lead, under controls the user can see.
 */
export function collectedTunnelComposition(
  tunnel: CollectedTunnel
): TunnelComposition {
  if (tunnel.composition) return tunnel.composition;

  return createTunnelComposition(
    [createIndependentTunnelPerformer(collectedTunnelSequence(tunnel), 0)],
    {
      id: tunnel.id,
      name: tunnel.name,
      formation: tunnel.snapshot.tunnel.config,
      legacyGeneratedStage: true,
    }
  );
}

/**
 * The exact sequence the viewer should mount for a saved tunnel. Authored
 * tunnels already carry full SequenceData on their independent performer;
 * rebuilding from the legacy top-level step projection would replace that
 * identity and discard its source metadata before the user edits or re-saves.
 */
export function collectedTunnelViewerSequence(
  tunnel: CollectedTunnel
): SequenceData {
  const independent = tunnel.composition?.performers.find(
    (performer) => performer.source.kind === "independent"
  );
  return independent?.source.kind === "independent"
    ? independent.source.sequence
    : collectedTunnelSequence(tunnel);
}
