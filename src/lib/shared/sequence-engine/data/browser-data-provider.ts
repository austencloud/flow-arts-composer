/**
 * Browser Data Provider
 *
 * Implementation of ISequenceDataProvider for browser contexts.
 * Wraps the existing ILetterQueryHandler and fetches letter mappings.
 */

import type { LetterVariationData } from "./types";
import type { LetterMappingsJson } from "../domain/models/sequence-engine-types";
import type { ILetterQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Minimal top-level shape guard for the letter-mappings payload. */
function isLetterMappingsJson(value: unknown): value is LetterMappingsJson {
  return isRecord(value) && isRecord(value.letters) && isRecord(value.categories);
}

/**
 * Browser-specific data provider.
 * Uses fetch for letter mappings and ILetterQueryHandler for variations.
 */
export class BrowserDataProvider {
  private letterMappings: LetterMappingsJson | null = null;
  private initialized = false;

  constructor(private readonly letterQueryHandler: ILetterQueryHandler) {}

  async loadLetterMappings(): Promise<LetterMappingsJson> {
    if (this.letterMappings) {
      return this.letterMappings;
    }

    const response = await fetch("/data/learn/letter-mappings.json");
    if (!response.ok) {
      throw new Error(`Failed to load letter mappings: ${response.statusText}`);
    }

    // The endpoint is a trusted first-party static asset
    // (static/data/learn/letter-mappings.json), so a full schema isn't warranted.
    // But a malformed shape would otherwise slip through untyped and only blow up
    // later as a cryptic error inside TransitionGraph.buildGraph (Object.entries on
    // a missing `letters`). Guard the two top-level keys so a bad payload fails loud
    // right here at the fetch site instead.
    const raw: unknown = await response.json();
    if (!isLetterMappingsJson(raw)) {
      throw new Error(
        "Malformed letter mappings: expected `letters` and `categories` objects"
      );
    }

    this.letterMappings = raw;
    this.initialized = true;
    return raw;
  }

  async loadLetterVariations(letter: string): Promise<LetterVariationData[]> {
    // Use getAllPictographVariations and filter by letter
    // This returns all variations from CSV data
    const allVariations = await this.letterQueryHandler.getAllPictographVariations(GridMode.DIAMOND);
    const letterVariations = allVariations.filter(
      (p: PictographData) => p.letter === letter
    );

    return letterVariations.map((p: PictographData) => this.pictographToVariationData(p));
  }

  private pictographToVariationData(p: PictographData): LetterVariationData {
    const leftMotion = p.motions?.left;
    const rightMotion = p.motions?.right;

    return {
      letter: p.letter as string,
      startPlacement: p.startPlacement || "",
      endPlacement: p.endPlacement || "",
      leftMotionType: leftMotion?.motionType || "static",
      leftStartLocation: leftMotion?.startLocation || "",
      leftEndLocation: leftMotion?.endLocation || "",
      leftRotationDirection: leftMotion?.rotationDirection || "cw",
      rightMotionType: rightMotion?.motionType || "static",
      rightStartLocation: rightMotion?.startLocation || "",
      rightEndLocation: rightMotion?.endLocation || "",
      rightRotationDirection: rightMotion?.rotationDirection || "cw",
      gridMode: p.gridMode,
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Create a browser data provider from the container's letterQueryHandler.
 */
export function createBrowserDataProvider(
  letterQueryHandler: ILetterQueryHandler
): BrowserDataProvider {
  return new BrowserDataProvider(letterQueryHandler);
}
