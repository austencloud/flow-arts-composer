/**
 * Sequences the Flow Fest performers actually spin.
 *
 * The fire circle used to run three hand-authored demo fixtures on repeat. It
 * now spins LOOPs from the production generator, gated by the shared effect
 * preview policy: at least eight counts, a multiple of eight, and a seamless
 * seam so the closing count runs straight into count one.
 *
 * Generation is asynchronous, so the scene boots on the fixtures and swaps to
 * generated LOOPs when they land. A fixture that never gets replaced is
 * reported as such rather than passing silently for the real thing.
 */

import {
  EFFECT_PREVIEW_TARGET_COUNTS,
  isEffectPreviewLoop,
} from "#lib/shared/effects/domain/effect-preview-loop-policy.js";
import {
  GGGG_CW,
  GHGH,
  HHHH_CCW,
} from "#lib/shared/combination/domain/demo-fixtures.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { FlowFestFestivalPersonRole } from "#lib/features/flow-fest-sim/domain/flow-fest-living-fire-jam.js";

export type FlowFestPerformerRole = Exclude<
  FlowFestFestivalPersonRole,
  "spectator"
>;

export interface FlowFestPerformerProfile {
  propType: PropType;
  effectId: "fire" | "led";
}

export const FLOW_FEST_PERFORMER_PROFILES: Record<
  FlowFestPerformerRole,
  FlowFestPerformerProfile
> = {
  "fire-poi": { propType: PropType.POI, effectId: "fire" },
  "fire-hoop": { propType: PropType.BIGHOOP, effectId: "fire" },
  juggler: { propType: PropType.CLUB, effectId: "led" },
  "led-flow": { propType: PropType.CAPSULE_BATON, effectId: "led" },
};

export type FlowFestSequenceSource = "placeholder" | "generated";

export interface FlowFestPerformerSequencePool {
  loops: SequenceData[];
  sources: FlowFestSequenceSource[];
  requestedCount: number;
  generatedCount: number;
  rejectedCount: number;
  /** Honest, human-readable record for the runtime proof object. */
  notes: string[];
}

const PLACEHOLDER_LOOPS: SequenceData[] = [GHGH, HHHH_CCW, GGGG_CW];

/**
 * Instant-boot placeholders. These are the old demo fixtures and most do not
 * satisfy the preview-LOOP contract, which is exactly why they are labelled as
 * placeholders and replaced.
 */
export function createFlowFestPlaceholderPool(): FlowFestPerformerSequencePool {
  const failing = PLACEHOLDER_LOOPS.filter(
    (sequence) => !isEffectPreviewLoop(sequence)
  ).length;
  return {
    loops: [...PLACEHOLDER_LOOPS],
    sources: PLACEHOLDER_LOOPS.map(() => "placeholder" as const),
    requestedCount: 0,
    generatedCount: 0,
    rejectedCount: 0,
    notes: [
      `Boot placeholders in use: ${PLACEHOLDER_LOOPS.length} demo fixtures, ${failing} of which do not meet the effect preview LOOP contract.`,
    ],
  };
}

export interface FlowFestPerformerPoolOptions {
  /** Distinct LOOPs to generate. */
  count?: number;
  /** Generation attempts before giving up on a slot. */
  attemptsPerLoop?: number;
  /**
   * Produce one candidate LOOP. Defaults to the production
   * `InfiniteSequenceGenerator`; tests supply their own so the gate can be
   * exercised without standing up the generation orchestrator.
   */
  generate?: () => Promise<SequenceData | null>;
}

/**
 * The production generator is loaded on demand. Its metrics repository pulls in
 * Firebase, which has no business in the scene's initial chunk or in a unit
 * test's import graph.
 */
let productionGenerator: Promise<() => Promise<SequenceData | null>> | null =
  null;

function defaultGenerator(): () => Promise<SequenceData | null> {
  productionGenerator ??= (async () => {
    const [
      { InfiniteSequenceGenerator },
      { SpinnerMetricsRepository },
      { getGenerationOrchestrator },
      { orientationCycleExtender },
    ] = await Promise.all([
      import("#lib/features/landing/services/infinite-sequence-generator.js"),
      import("#lib/features/landing/services/spinner-metrics-repository.js"),
      import("#lib/features/create/generate/shared/get-generation-orchestrator.js"),
      import(
        "#lib/features/create/generate/circular/services/orientation-cycle-extender.js"
      ),
    ]);
    const generator = new InfiniteSequenceGenerator(
      getGenerationOrchestrator(),
      new SpinnerMetricsRepository(),
      orientationCycleExtender
    );
    return async () => (await generator.generateInitial())?.sequence ?? null;
  })();
  return async () => (await productionGenerator!)();
}

/**
 * Generate the performer LOOP pool. Resolves with whatever it managed to make;
 * a short pool keeps its placeholders and says so in `notes`.
 */
export async function generateFlowFestPerformerPool(
  options: FlowFestPerformerPoolOptions = {}
): Promise<FlowFestPerformerSequencePool> {
  const count = options.count ?? 4;
  const attemptsPerLoop = options.attemptsPerLoop ?? 3;
  const generate = options.generate ?? defaultGenerator();

  const loops: SequenceData[] = [];
  const notes: string[] = [];
  let rejectedCount = 0;

  for (let slot = 0; slot < count; slot += 1) {
    let accepted: SequenceData | null = null;
    for (let attempt = 0; attempt < attemptsPerLoop && !accepted; attempt += 1) {
      let generated: SequenceData | null = null;
      try {
        generated = await generate();
      } catch (error) {
        notes.push(
          `LOOP ${slot + 1} attempt ${attempt + 1} threw: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        continue;
      }
      if (!generated) {
        rejectedCount += 1;
        notes.push(`LOOP ${slot + 1} attempt ${attempt + 1} produced nothing.`);
        continue;
      }
      if (!isEffectPreviewLoop(generated)) {
        rejectedCount += 1;
        notes.push(
          `LOOP ${slot + 1} attempt ${attempt + 1} failed the preview contract at ${generated.steps.length} steps.`
        );
        continue;
      }
      accepted = generated;
    }
    if (accepted) loops.push(accepted);
  }

  if (loops.length === 0) {
    const placeholder = createFlowFestPlaceholderPool();
    return {
      ...placeholder,
      requestedCount: count,
      rejectedCount,
      notes: [
        ...placeholder.notes,
        ...notes,
        `Generation produced no valid LOOP in ${count * attemptsPerLoop} attempts; the fire circle is still spinning placeholders.`,
      ],
    };
  }

  const shortfall = count - loops.length;
  const sources: FlowFestSequenceSource[] = loops.map(() => "generated");
  const filled = [...loops];
  if (shortfall > 0) {
    notes.push(
      `Generated ${loops.length} of ${count} LOOPs; the remaining slots reuse generated LOOPs rather than falling back to fixtures.`
    );
    for (let index = 0; index < shortfall; index += 1) {
      filled.push(loops[index % loops.length]!);
      sources.push("generated");
    }
  }

  notes.push(
    `Target ${EFFECT_PREVIEW_TARGET_COUNTS} counts; pool step counts: ${filled
      .map((sequence) => sequence.steps.length)
      .join(", ")}.`
  );

  return {
    loops: filled,
    sources,
    requestedCount: count,
    generatedCount: loops.length,
    rejectedCount,
    notes,
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministic per-performer assignment, so two people beside the fire are
 * rarely spinning the same LOOP and the same person keeps theirs across
 * re-renders.
 */
export function flowFestSequenceForPerformer(
  pool: FlowFestPerformerSequencePool,
  personId: string
): SequenceData {
  if (pool.loops.length === 0) return GHGH;
  return pool.loops[stableHash(personId) % pool.loops.length]!;
}

export function flowFestSequenceSourceForPerformer(
  pool: FlowFestPerformerSequencePool,
  personId: string
): FlowFestSequenceSource {
  if (pool.sources.length === 0) return "placeholder";
  return pool.sources[stableHash(personId) % pool.sources.length]!;
}

export interface FlowFestPerformerSequenceProof {
  poolSize: number;
  generatedCount: number;
  rejectedCount: number;
  stepCounts: number[];
  allPassPreviewLoop: boolean;
  sources: FlowFestSequenceSource[];
  notes: string[];
}

export function flowFestPerformerSequenceProof(
  pool: FlowFestPerformerSequencePool
): FlowFestPerformerSequenceProof {
  return {
    poolSize: pool.loops.length,
    generatedCount: pool.generatedCount,
    rejectedCount: pool.rejectedCount,
    stepCounts: pool.loops.map((sequence) => sequence.steps.length),
    allPassPreviewLoop: pool.loops.every((sequence) =>
      isEffectPreviewLoop(sequence)
    ),
    sources: [...pool.sources],
    notes: [...pool.notes],
  };
}
