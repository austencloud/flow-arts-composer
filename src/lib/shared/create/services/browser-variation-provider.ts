/**
 * Browser Variation Provider
 *
 * Implements IVariationProvider for the browser app by wrapping the existing
 * LetterQueryHandler (which handles CSV loading, parsing, and caching) and
 * adding a letter:placement index on top.
 *
 * Maps from the app's rich PictographData (with rendering fields, enum types,
 * embedded placement data) to the engine's minimal PictographData (string fields,
 * motion essentials only).
 */

import type { PictographData as EnginePictographData } from "@tka/sequence-engine/generation";
import type { ILetterQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";
import type { PictographData as AppPictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { Motion as AppMotion } from "@tka/tka-types";
import type { MotionData as EngineMotionData } from "@tka/sequence-engine/generation";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

export class BrowserVariationProvider {
  private readonly index = new Map<string, EnginePictographData[]>();
  private allVariationsList: EnginePictographData[] = [];
  private initialized = false;
  private initializedGridMode: string | null = null;

  constructor(private readonly letterQueryHandler: ILetterQueryHandler) {}

  async initialize(gridMode: string): Promise<void> {
    if (this.initialized && this.initializedGridMode === gridMode) return;

    // Clear previous data when switching grid modes
    this.index.clear();
    this.allVariationsList = [];

    // Convert string grid mode to the enum the LetterQueryHandler expects
    const gridModeEnum = this.toGridModeEnum(gridMode);

    // Load all pictograph variations via the existing CSV infrastructure
    const appPictographs =
      await this.letterQueryHandler.getAllPictographVariations(gridModeEnum);

    // Map each app pictograph to the engine's minimal type and build the index
    for (const appPicto of appPictographs) {
      const enginePicto = this.mapToEngineType(appPicto);
      if (!enginePicto) continue;

      this.allVariationsList.push(enginePicto);

      const key = `${enginePicto.letter}:${enginePicto.startPlacement}`;
      const bucket = this.index.get(key);
      if (bucket) {
        bucket.push(enginePicto);
      } else {
        this.index.set(key, [enginePicto]);
      }
    }

    this.initialized = true;
    this.initializedGridMode = gridMode;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getVariations(
    letter: string,
    placement: string,
    _gridMode: string
  ): EnginePictographData[] {
    return this.index.get(`${letter}:${placement}`) ?? [];
  }

  getAllVariations(_gridMode: string): EnginePictographData[] {
    return this.allVariationsList;
  }

  /**
   * Map the app's rich PictographData to the engine's minimal PictographData.
   *
   * The app stores motions as `motions: { left?: MotionData, right?: MotionData }`
   * with enum-typed fields and embedded placement/rendering data.
   * The engine needs `leftMotion` / `rightMotion` with plain string fields.
   */
  private mapToEngineType(
    appPicto: AppPictographData
  ): EnginePictographData | null {
    const leftMotion = appPicto.motions[HandSide.LEFT];
    const rightMotion = appPicto.motions[HandSide.RIGHT];

    // Both motions are required for the engine's sequence generation
    if (!leftMotion || !rightMotion) return null;

    return {
      letter: appPicto.letter?.toString() ?? "",
      startPlacement: appPicto.startPlacement?.toString() ?? "",
      endPlacement: appPicto.endPlacement?.toString() ?? "",
      timing: "together",
      direction: "together",
      leftMotion: this.mapMotion(leftMotion, "blue"),
      rightMotion: this.mapMotion(rightMotion, "red"),
    };
  }

  /**
   * Extract the fields the engine cares about from a rich app MotionData.
   * Enum values (.toString()) produce the same lowercase strings the engine uses.
   *
   * Phase 2a transitional cast: the app-layer enums are nominally incompatible
   * with the tka-types literal unions, but the runtime values are identical.
   * Data is trusted (validated via letter CSV + enum constructors upstream).
   */
  private mapMotion(appMotion: AppMotion, color: string): EngineMotionData {
    return {
      motionType: String(appMotion.motionType),
      startLocation: String(appMotion.startLocation),
      endLocation: String(appMotion.endLocation),
      rotationDirection: String(appMotion.rotationDirection),
      startOrientation: String(appMotion.startOrientation),
      endOrientation: String(appMotion.endOrientation),
      turns: appMotion.turns,
      color,
    } as EngineMotionData;
  }

  private toGridModeEnum(gridMode: string): GridMode {
    const modeMap: Record<string, GridMode> = {
      diamond: GridMode.DIAMOND,
      box: GridMode.BOX,
      skewed: GridMode.SKEWED,
      centric: GridMode.CENTRIC,
      trigrid: GridMode.TRIGRID,
    };
    return modeMap[gridMode.toLowerCase()] ?? GridMode.DIAMOND;
  }
}
