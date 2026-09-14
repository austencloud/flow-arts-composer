/**
 * Generation Orchestrator
 *
 * Delegates sequence generation to the shared SequenceBuilder from
 * @tka/sequence-engine. Both freeform and circular generation go through
 * the same beam-search pipeline with constraint composition.
 *
 * The orchestrator's job is thin:
 * 1. Map app-level GenerationOptions to the engine's BuildOptions
 * 2. Initialize the BrowserVariationProvider (CSV loading)
 * 3. Call SequenceBuilder.build()
 * 4. Convert the engine's BuildResult to the app's SequenceData via BuildResultTransformer
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { GenerationOptions } from "$lib/shared/foundation/domain/models/generation/generate-models";
import {
  GenerationMode,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { sequenceMetadataManager as SequenceMetadataManagerSingleton } from "$lib/shared/create/services/sequence-metadata-manager";
type SequenceMetadataManager = typeof SequenceMetadataManagerSingleton;
import { SequenceBuilder } from "@tka/sequence-engine/generation";
import type { ConstraintOptions } from "@tka/sequence-engine/generation";
import { LOOPType, Period as EnginePeriod, loopSpecFromWire } from "@tka/sequence-engine/loop";
import {
  TransitionGraph as EngineTransitionGraph,
  setLetterTransitionGraph,
  type ISequenceDataProvider,
} from "@tka/sequence-engine";
import { BrowserDataProvider } from "$lib/shared/sequence-engine/data/browser-data-provider";
import { letterQueryHandler as globalLetterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
import { expanderMultiplier, specHasExpandInversion } from "$lib/shared/create/services/loop-type-utils";
import { handRelationshipToEngine } from "$lib/shared/create/domain/hand-relationship";

// The engine's word-based generation path reads from a global transition
// graph singleton (mirrors mcp-server/src/shared/server-context.ts which
// initializes it during startup). Freeform length-based generation doesn't
// need it, but spell mode does. Register lazily on first spell call so
// startup cost is only paid when spell mode is actually used.
let engineTransitionGraphPromise: Promise<void> | null = null;

function ensureEngineTransitionGraph(): Promise<void> {
  if (engineTransitionGraphPromise) return engineTransitionGraphPromise;

  engineTransitionGraphPromise = (async () => {
    const dataProvider = new BrowserDataProvider(globalLetterQueryHandler);
     
    // BrowserDataProvider structurally matches the engine's SequenceDataProvider;
    // the nominal type mismatch comes from two separate type declarations that
    // will be reconciled when the app's shim is retired.
    const graph = new EngineTransitionGraph(dataProvider as unknown as ISequenceDataProvider);
    await graph.initialize();
    setLetterTransitionGraph(graph);
  })();

  return engineTransitionGraphPromise;
}

/**
 * The engine's end-position goal, as position strings.
 *
 * Until 2026-08-03 neither `endPosition` nor `endPositions` was passed to
 * `builder.build()` at all — the End Position picker wrote to state, persisted,
 * and showed on the Customize card, and the constraint was silently dropped at
 * this boundary. Anything added to GenerationOptions has to be threaded through
 * here or it does nothing.
 *
 * `endPositions` is the multi-select form. `endPosition` is the legacy single
 * PictographData; its `.endPosition` field carries the grid position (a
 * start-position pictograph is static, so start and end are the same value —
 * see start-position-manager's createStartPosition). Empty = unconstrained.
 */
function resolveEndPositions(
  options: GenerationOptions
): string[] | undefined {
  const ends = new Set<string>();
  for (const p of options.endPositions ?? []) {
    if (p) ends.add(String(p));
  }
  const legacy =
    options.endPosition?.endPosition ?? options.endPosition?.startPosition;
  if (legacy) ends.add(String(legacy));
  return ends.size > 0 ? [...ends] : undefined;
}

/**
 * The engine's pinned start position.
 *
 * `startPositionId` is the direct form. `startPosition` is the legacy
 * PictographData whose `.startPosition` field carries the same grid position;
 * a start-position pictograph is static, so its start and end are one value.
 */
function resolveStartPosition(options: GenerationOptions): string | undefined {
  if (options.startPositionId) return String(options.startPositionId);
  return options.startPosition?.startPosition
    ? String(options.startPosition.startPosition)
    : undefined;
}

export class GenerationOrchestrator {
  constructor(
    private readonly variationProvider: BrowserVariationProvider,
    private readonly transformer: BuildResultTransformer,
    private readonly metadataManager: SequenceMetadataManager
  ) {}

  /**
   * Generate complete sequence - routes to appropriate mode
   */
  async generateSequence(options: GenerationOptions): Promise<SequenceData> {
    if (options.mode === GenerationMode.CIRCULAR) {
      return this.generateCircularSequence(options);
    }
    return this.generateFreeformSequence(options);
  }

  /**
   * Generate a freeform (non-looping) sequence via the shared engine.
   */
  private async generateFreeformSequence(
    options: GenerationOptions
  ): Promise<SequenceData> {
    await this.variationProvider.initialize(String(options.gridMode));
    if (options.word) {
      await ensureEngineTransitionGraph();
    }
    const builder = new SequenceBuilder(this.variationProvider);
    const level = this.metadataManager.mapDifficultyToLevel(options.difficulty);

    const result = builder.build({
      // Word wins over length: spell mode passes an expanded word string;
      // freeform passes length. The engine handles both paths identically
      // after parsing letters.
      ...(options.word ? { word: options.word } : { length: options.length }),
      gridMode: String(options.gridMode),
      level,
      constraintOptions: this.mapConstraints(options),
      startPosition: resolveStartPosition(options),
      blockedStartPositions: options.blockedStartPositions?.map(String),
      endPositions: resolveEndPositions(options),
      mustContainLetters: options.mustContainLetters?.map(String),
      mustNotContainLetters: options.mustNotContainLetters?.map(String),
      maxTurnIntensity: options.turnIntensity,
      matchHandTurns: options.matchHandTurns === true,
      turnPattern: options.turnPattern,
      leftStartOrientation: options.leftStartOrientation,
      rightStartOrientation: options.rightStartOrientation,
    });

    return this.transformer.convertToSequenceData(result, options);
  }

  /**
   * Generate a circular (LOOP) sequence via the shared engine.
   *
   * The engine's SequenceBuilder handles LOOP extension internally -
   * it generates the seed sequence, then applies the LOOP executor to
   * produce the full circular sequence.
   */
  private async generateCircularSequence(
    options: GenerationOptions
  ): Promise<SequenceData> {
    await this.variationProvider.initialize(String(options.gridMode));
    if (options.word) {
      await ensureEngineTransitionGraph();
    }
    const builder = new SequenceBuilder(this.variationProvider);
    const level = this.metadataManager.mapDifficultyToLevel(options.difficulty);

    // Map app's LOOPType enum values to engine's. Both use the same string
    // values for most types, but the app has "strict_rewound" while the
    // engine uses "rewound".
    const engineLoopType = this.mapLoopTypeToEngine(options.loopType);
    const period = this.mapPeriod(options.period);

    // The UI's length is the total output length. The seed is a fraction.
    // the engine extends it back to the full length. Legacy path (no
    // loopSpecWire): halved = length / 2, quartered = length / 4. Spec path:
    // the fraction is the spec's expanderMultiplier (per-component periods,
    // fused-stage rules; see loop-type-utils.expanderMultiplier). For
    // word-based spell-LOOP, the word itself is the seed. No length
    // division is applied because the user's word IS the pattern.
    const wire = options.loopSpecWire;
    const multiplier = wire
      ? expanderMultiplier(wire)
      : period === EnginePeriod.QUARTERED
        ? 4
        : 2;

    if (!options.word && wire && options.length % multiplier !== 0) {
      throw new Error(
        `A ${options.length}-step sequence is not divisible by this combo's expansion (${multiplier}).`
      );
    }

    const seedLength = Math.max(1, Math.floor(options.length / multiplier));

    if (!options.word && wire && specHasExpandInversion(wire) && seedLength < 2) {
      throw new Error(
        "Seed too short for an inversion combo. One-step half seeds are dash-only, so inversion would be invisible."
      );
    }

    const result = builder.build({
      ...(options.word ? { word: options.word } : { length: seedLength }),
      gridMode: String(options.gridMode),
      level,
      constraintOptions: this.mapConstraints(options),
      startPosition: resolveStartPosition(options),
      blockedStartPositions: options.blockedStartPositions?.map(String),
      endPositions: resolveEndPositions(options),
      mustContainLetters: options.mustContainLetters?.map(String),
      mustNotContainLetters: options.mustNotContainLetters?.map(String),
      maxTurnIntensity: options.turnIntensity,
      matchHandTurns: options.matchHandTurns === true,
      turnPattern: options.turnPattern,
      leftStartOrientation: options.leftStartOrientation,
      rightStartOrientation: options.rightStartOrientation,
      loop: {
        type: engineLoopType,
        period,
        useTargetedGeneration: true,
        ...(wire ? { loopSpec: loopSpecFromWire(wire) } : {}),
        ...(!options.word
          ? { requestedTotalLength: options.length }
          : {}),
      },
    });

    return this.transformer.convertToSequenceData(result, options);
  }

  /**
   * Map the app's 3-axis constraint system to the engine's ConstraintOptions.
   *
   * constraintPreset: smooth/mixed/choppy → prop spin continuity
   * handPathMode: smooth/mixed/choppy → hand path continuity
   * motionTypeFilter: no-dash/prefer-dash/null → motion family exclusion
   */
  private mapConstraints(options: GenerationOptions): ConstraintOptions {
    const result: ConstraintOptions = {};

    // Prop continuity (constraintPreset axis)
    const propAxis = options.constraintPreset ?? "smooth";
    switch (propAxis) {
      case "smooth":
        result.propContinuity = "maximize";
        break;
      case "choppy":
        result.propContinuity = "force-reversals";
        break;
      case "mixed":
        result.propContinuity = "allow-reversals";
        break;
    }

    // Hand path continuity (handPathMode axis)
    const handAxis = options.handPathMode ?? "smooth";
    switch (handAxis) {
      case "smooth":
        result.handPathContinuity = "maximize";
        break;
      case "choppy":
        result.handPathContinuity = "force-reversals";
        break;
      case "mixed":
        result.handPathContinuity = "allow-reversals";
        break;
    }

    // Motion type filter (motionTypeFilter axis)
    // no-dash = hard exclude; prefer-dash = soft maximize (weighted to
    // dominate other soft constraints, but closure/hard filters can still
    // force non-dash picks on specific steps).
    if (options.motionTypeFilter === "no-dash") {
      result.motionFamily = { exclude: ["dash"] };
    } else if (options.motionTypeFilter === "prefer-dash") {
      result.dashPreference = "maximize";
    }

    // Hand relationship: a hard per-step constraint, passed straight through.
    // Anything added to GenerationOptions has to be threaded here or it does
    // nothing (see the endPositions note at the top of this file).
    const relationship = handRelationshipToEngine(
      options.handRelationship ?? "free",
      options.handRelationshipInverted ?? false
    );
    if (relationship) {
      result.handRelationship = relationship;
    }

    return result;
  }

  /**
   * Map the app's LOOPType enum to the engine's LOOPType enum.
   *
   * The two enums share most string values. The main difference is the
   * app uses "strict_rewound" while the engine uses "rewound".
   */
  private mapLoopTypeToEngine(
    appLoopType?: string
  ): LOOPType {
    if (!appLoopType) return LOOPType.ROTATED;

    // Handle the naming difference for rewound
    if (appLoopType === "strict_rewound") {
      return LOOPType.REWOUND;
    }

    // All other values match between app and engine enums
    const engineType = Object.values(LOOPType).find(
      (v) => v === appLoopType
    );
    return engineType ?? LOOPType.ROTATED;
  }

  /**
   * Map the app's Period to the engine's Period.
   * Both use identical string values.
   */
  private mapPeriod(appPeriod?: string): EnginePeriod {
    if (appPeriod === "quartered") return EnginePeriod.QUARTERED;
    return EnginePeriod.HALVED;
  }
}

import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
import { BrowserVariationProvider } from "$lib/shared/create/services/browser-variation-provider";
import { BuildResultTransformer } from "$lib/shared/create/services/build-result-transformer";
import { sequenceMetadataManager } from "$lib/shared/create/services/sequence-metadata-manager";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";

const browserVariationProvider = new BrowserVariationProvider(
  letterQueryHandler
);

const buildResultTransformer = new BuildResultTransformer(
  sequenceMetadataManager,
  reversalDetector
);

export const generationOrchestrator = new GenerationOrchestrator(
  browserVariationProvider,
  buildResultTransformer,
  sequenceMetadataManager
);
