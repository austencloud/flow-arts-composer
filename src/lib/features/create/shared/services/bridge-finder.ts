/**
 * Bridge Finder Implementation
 *
 * Finds bridge letters that can connect a sequence to a loopable placement.
 * Analyzes pictograph candidates and determines available LOOP patterns.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type {
  GridPlacement} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { CircularizationOption } from "./sequence-extender";
import type { OrientationAlignment } from "./orientation-alignment-calculator";

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { ILetterQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";
import type { PlacementAnalyzer } from "../../construct/option-picker/services/placement-analyzer";
import type { LOOPValidator } from "./loop-validator";
import type { SequenceAnalyzer } from "./sequence-analyzer";
type OrientationAlignmentCalculator = {
  calculateOrientationAlignment: (sequence: SequenceData, bridgePictograph: PictographData) => OrientationAlignment | null;
  calculateResultingLength: (currentLength: number, rotationRelation: "exact" | "half" | "quarter" | null, repetitionsNeeded?: 1 | 2 | 4) => number;
};
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  LOOPType,
  Period,
} from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  HALVED_LOOPS,
  QUARTERED_LOOPS,
} from "$lib/shared/foundation/domain/models/generation/circular-placement-maps";
import type { LOOPOption } from "./loop-validator";

export class BridgeFinder {
  constructor(
    private letterQueryHandler: ILetterQueryHandler,
    private placementAnalyzer: PlacementAnalyzer,
    private loopValidator: LOOPValidator,
    private sequenceAnalyzer: SequenceAnalyzer,
    private orientationCalculator: OrientationAlignmentCalculator
  ) {}

  /**
   * Get circularization options for a sequence that isn't directly loopable.
   */
  async getCircularizationOptions(
    sequence: SequenceData
  ): Promise<CircularizationOption[]> {
    const startPlacement = this.sequenceAnalyzer.getStartPlacement(sequence);
    const endPlacement = this.sequenceAnalyzer.getCurrentEndPlacement(sequence);

    if (!startPlacement || !endPlacement) {
      return [];
    }

    // Get placement groups
    const startGroup = this.placementAnalyzer.getEndPlacementGroup(startPlacement);
    const endGroup = this.placementAnalyzer.getEndPlacementGroup(endPlacement);

    // If already in same group, no bridge needed (use regular extension)
    if (!startGroup || !endGroup || startGroup === endGroup) {
      return [];
    }

    const gridMode = sequence.gridMode || GridMode.DIAMOND;

    // Get all pictographs
    const allPictographs =
      await this.letterQueryHandler.getAllPictographVariations(gridMode);

    // Find pictographs that:
    // 1. Start at the sequence's current end placement
    // 2. End at a placement in the start group
    const bridgeCandidates = allPictographs.filter((p) => {
      if (p.startPlacement !== endPlacement) return false;
      const pEndGroup = this.placementAnalyzer.getEndPlacementGroup(
        p.endPlacement as GridPlacement
      );
      return pEndGroup === startGroup;
    });

    if (bridgeCandidates.length === 0) {
      return [];
    }

    // Group candidates by letter and ending placement
    const uniqueBridges = this.groupByLetterAndPlacement(bridgeCandidates);

    // For each unique bridge, analyze available LOOPs
    return this.analyzeBridgeCandidates(
      sequence,
      uniqueBridges,
      startPlacement,
      endPlacement,
      /* excludeRewound */ true
    );
  }

  /**
   * Get all extension options that would bring the sequence to a loopable placement.
   */
  async getAllExtensionOptions(
    sequence: SequenceData
  ): Promise<CircularizationOption[]> {
    const startPlacement = this.sequenceAnalyzer.getStartPlacement(sequence);
    const endPlacement = this.sequenceAnalyzer.getCurrentEndPlacement(sequence);

    if (!startPlacement || !endPlacement) {
      return [];
    }

    // Extract the placement GROUP from start placement (alpha, beta, gamma)
    const startGroup = this.placementAnalyzer.getEndPlacementGroup(startPlacement);
    if (!startGroup) {
      return [];
    }

    const gridMode = sequence.gridMode || GridMode.DIAMOND;

    // Get all pictographs
    const allPictographs =
      await this.letterQueryHandler.getAllPictographVariations(gridMode);

    // Find pictographs that:
    // 1. Start at the sequence's current end placement
    // 2. End in the SAME placement group as the sequence start (for loopability)
    const extensionCandidates = allPictographs.filter((p) => {
      if (p.startPlacement !== endPlacement) return false;
      const endGroup = this.placementAnalyzer.getEndPlacementGroup(
        p.endPlacement as GridPlacement
      );
      return endGroup === startGroup;
    });

    if (extensionCandidates.length === 0) {
      return [];
    }

    // Group candidates by letter and ending placement
    const uniqueExtensions = this.groupByLetterAndPlacement(extensionCandidates);

    // For each unique extension, analyze available LOOPs (include REWOUND)
    return this.analyzeBridgeCandidates(
      sequence,
      uniqueExtensions,
      startPlacement,
      endPlacement,
      /* excludeRewound */ false
    );
  }

  /**
   * Group pictograph candidates by letter and ending placement to avoid duplicates.
   */
  private groupByLetterAndPlacement(
    candidates: PictographData[]
  ): Map<
    string,
    { letter: Letter; endPlacement: string; pictographData: PictographData }
  > {
    const uniqueMap = new Map<
      string,
      { letter: Letter; endPlacement: string; pictographData: PictographData }
    >();

    for (const variation of candidates) {
      const key = `${variation.letter}|${variation.endPlacement}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          letter: variation.letter as Letter,
          endPlacement: variation.endPlacement || "",
          pictographData: variation,
        });
      }
    }

    return uniqueMap;
  }

  /**
   * Analyze available LOOPs for a placement pair (inline version of SequenceExtender.analyzeSequence).
   * Avoids circular dependency by using loopValidator directly.
   */
  private getAvailableLOOPs(
    startPlacement: GridPlacement,
    newEndPlacement: GridPlacement
  ): {
    available: LOOPOption[];
    period: Period;
  } {
    const placementPair = `${startPlacement},${newEndPlacement}`;
    const isHalvedValid = HALVED_LOOPS.has(placementPair);
    const isQuarteredValid = QUARTERED_LOOPS.has(placementPair);
    const isAlreadyComplete = newEndPlacement === startPlacement;

    let period = Period.HALVED;
    if (isQuarteredValid) {
      period = Period.QUARTERED;
    }

    // Get LOOP options from validator
    const { available } = this.loopValidator.getLOOPOptionsForPlacementPair(
      startPlacement,
      newEndPlacement,
      period
    );

    // If it's already complete or has valid LOOP placement, return available options
    if (isAlreadyComplete || isHalvedValid || isQuarteredValid) {
      return { available, period };
    }

    return { available: [], period };
  }

  /**
   * Analyze bridge candidates and create CircularizationOption objects.
   */
  private analyzeBridgeCandidates(
    sequence: SequenceData,
    uniqueBridges: Map<
      string,
      { letter: Letter; endPlacement: string; pictographData: PictographData }
    >,
    startPlacement: GridPlacement,
    _currentEndPlacement: GridPlacement,
    excludeRewound: boolean
  ): CircularizationOption[] {
    const options: CircularizationOption[] = [];

    for (const [_, bridge] of uniqueBridges) {
      // Get available LOOPs for the new placement pair (start → bridge end)
      const { available } = this.getAvailableLOOPs(
        startPlacement,
        bridge.endPlacement as GridPlacement
      );

      let availableLOOPs = available;

      if (excludeRewound) {
        availableLOOPs = availableLOOPs.filter(
          (opt) => opt.loopType !== LOOPType.STRICT_REWOUND
        );
      }

      if (availableLOOPs.length > 0) {
        // Calculate rotation relationship and orientation alignment
        const rotationRelation = this.placementAnalyzer.getRotationRelation(
          startPlacement,
          bridge.endPlacement as GridPlacement
        );

        const currentLength = sequence.steps?.length || 0;

        let orientationAlignment: OrientationAlignment | undefined;
        let repetitionsNeeded: 1 | 2 | 4 = 1;

        if (rotationRelation === "exact") {
          orientationAlignment =
            this.orientationCalculator.calculateOrientationAlignment(
              sequence,
              bridge.pictographData
            ) || undefined;
          repetitionsNeeded = orientationAlignment?.repetitionsNeeded || 1;
        }

        const resultingLength =
          this.orientationCalculator.calculateResultingLength(
            currentLength,
            rotationRelation,
            repetitionsNeeded
          );

        options.push({
          bridgeLetters: [bridge.letter],
          endPlacement: bridge.endPlacement,
          availableLOOPs: availableLOOPs,
          description: excludeRewound
            ? `Add "${bridge.letter}" to end at ${bridge.endPlacement}`
            : `Add "${bridge.letter}" → ${bridge.endPlacement}`,
          pictographData: bridge.pictographData,
          rotationRelation: rotationRelation || undefined,
          orientationAlignment,
          currentLength,
          resultingLength,
        });
      }
    }

    return options;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
import { placementAnalyzer } from "$lib/features/create/construct/option-picker/services/placement-analyzer";
import { loopValidator } from "./loop-validator";
import { sequenceAnalyzer } from "./sequence-analyzer";
import * as orientationAlignmentCalculatorModule from "./orientation-alignment-calculator";
const orientationAlignmentCalculator: OrientationAlignmentCalculator = {
  calculateOrientationAlignment: orientationAlignmentCalculatorModule.calculateOrientationAlignment,
  calculateResultingLength: orientationAlignmentCalculatorModule.calculateResultingLength,
};

export const bridgeFinder = new BridgeFinder(
  letterQueryHandler,
  placementAnalyzer,
  loopValidator,
  sequenceAnalyzer,
  orientationAlignmentCalculator
);
