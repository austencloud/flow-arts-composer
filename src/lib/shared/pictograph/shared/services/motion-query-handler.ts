import { HandSide } from "../domain/enums/pictograph-enums";
import { GridMode } from "../../grid/domain/enums/grid-enums";
import type { MotionData } from "../domain/models/motion-data";
import { createMotionData } from "../domain/models/motion-data";
import type { PictographData } from "../domain/models/pictograph-data";
import type { CSVPictographParser, CSVRow } from "./csv-pictograph-parser";
import type { ParsedCsvRow } from "$lib/shared/foundation/domain/models/csv-models";
import type { CsvLoader } from "../../../foundation/services/data/csv-loader";
import type { IMotionQueryHandler } from "../../../foundation/services/data/data-contracts";
import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";
import type { Orientation } from "../domain/enums/pictograph-enums";
import { bootProfiler } from "$lib/shared/analytics/boot-profiler";

interface ICSVParser {
  parseCSV(csvText: string): { rows: ParsedCsvRow[] };
}

export class MotionQueryHandler implements IMotionQueryHandler {
  private parsedData: Record<GridMode, ParsedCsvRow[]> | null = null;
  private isInitialized = false;
  private pendingInitialization: Promise<void> | null = null;

  constructor(
    private csvLoader: CsvLoader,
    private CSVParser: ICSVParser,
    private csvPictographParser: CSVPictographParser
  ) {}

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.pendingInitialization) {
      return this.pendingInitialization;
    }

    const initialization = this.initialize();
    this.pendingInitialization = initialization;
    try {
      await initialization;
    } finally {
      if (this.pendingInitialization === initialization) {
        this.pendingInitialization = null;
      }
    }
  }

  private async initialize(): Promise<void> {
    try {
      const csvData = await this.csvLoader.loadCSVDataSet();
      const parseSpan = bootProfiler.startSpan("csv:parse");

      let diamondParseResult: { rows: ParsedCsvRow[] };
      let boxParseResult: { rows: ParsedCsvRow[] };
      let skewedParseResult: { rows: ParsedCsvRow[] };
      try {
        diamondParseResult = this.CSVParser.parseCSV(
          csvData.data?.diamondData || ""
        );
        boxParseResult = this.CSVParser.parseCSV(csvData.data?.boxData || "");
        skewedParseResult = csvData.data?.skewedData
          ? this.CSVParser.parseCSV(csvData.data.skewedData)
          : { rows: [] };
        parseSpan("ok", {
          diamondRows: diamondParseResult.rows.length,
          boxRows: boxParseResult.rows.length,
          skewedRows: skewedParseResult.rows.length,
          hasSkewedData: Boolean(csvData.data?.skewedData),
          hasTrigridData: Boolean(csvData.data?.trigridData),
        });
      } catch (error) {
        parseSpan("error");
        throw error;
      }

      this.parsedData = {
        [GridMode.DIAMOND]: diamondParseResult.rows,
        [GridMode.BOX]: boxParseResult.rows,
        [GridMode.SKEWED]: skewedParseResult.rows,
        [GridMode.CENTRIC]: [],
        [GridMode.TRIGRID]: [],
        [GridMode.EIGHT_POINT]: [],
      };

      this.isInitialized = true;
    } catch (error) {
      console.error("❌ MotionQueryHandler: Error loading CSV data:", error);
      throw new Error(
        `Failed to load CSV data: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async queryMotions(
    criteria: Record<string, unknown>
  ): Promise<PictographData[]> {
    await this.ensureInitialized();

    if (!this.parsedData) {
      console.error("❌ No parsed CSV data available");
      return [];
    }

    const gridMode = (criteria["gridMode"] as GridMode) || GridMode.DIAMOND;
    let csvRows = this.parsedData[gridMode] || [];
    if (gridMode === GridMode.SKEWED && csvRows.length === 0) {
      csvRows = this.parsedData[GridMode.DIAMOND] || [];
    }
    const actualGridMode = gridMode;
    const pictographs: PictographData[] = [];

    for (const row of csvRows) {
      const pictograph = this.csvPictographParser.parseCSVRowToPictograph(
        row as unknown as CSVRow,
        actualGridMode
      );
      if (pictograph) {
        pictographs.push(pictograph);
      }
    }

    return pictographs;
  }

  async getMotionById(motionId: string): Promise<PictographData | null> {
    await this.ensureInitialized();

    if (!this.parsedData) {
      console.error("❌ No parsed CSV data available");
      return null;
    }

    for (const gridMode of [GridMode.DIAMOND, GridMode.BOX]) {
      const csvRows =
        this.parsedData[gridMode as keyof typeof this.parsedData] || [];
      for (const row of csvRows) {
        const pictograph = this.csvPictographParser.parseCSVRowToPictograph(
          row as unknown as CSVRow,
          gridMode
        );
        if (pictograph?.id === motionId) {
          return pictograph;
        }
      }
    }

    return null;
  }

  async searchMotions(pattern: string): Promise<PictographData[]> {
    await this.ensureInitialized();

    if (!this.parsedData) {
      console.error("❌ No parsed CSV data available");
      return [];
    }

    const pictographs: PictographData[] = [];
    const lowerPattern = pattern.toLowerCase();

    for (const gridMode of [GridMode.DIAMOND, GridMode.BOX]) {
      const csvRows =
        this.parsedData[gridMode as keyof typeof this.parsedData] || [];
      for (const row of csvRows.slice(0, 100)) {
        const data = row;
        if (
          data.letter.toLowerCase().includes(lowerPattern) ||
          data.leftMotionType.toLowerCase().includes(lowerPattern) ||
          data.rightMotionType.toLowerCase().includes(lowerPattern) ||
          data.leftStartLocation.toLowerCase().includes(lowerPattern) ||
          data.rightStartLocation.toLowerCase().includes(lowerPattern)
        ) {
          const pictograph = this.csvPictographParser.parseCSVRowToPictograph(
            row as CSVRow,
            gridMode
          );
          if (pictograph) {
            pictographs.push(pictograph);
          }
        }
      }
    }

    return pictographs;
  }

  async getNextOptionsForSequence(
    sequence: unknown[],
    gridMode: GridMode
  ): Promise<PictographData[]> {
    const span = bootProfiler.startSpan("construct:option-query");
    let filterSpan: ReturnType<typeof bootProfiler.startSpan> | null = null;
    try {
      await this.ensureInitialized();

      if (!this.parsedData) {
        console.error("❌ No parsed CSV data available");
        span("error");
        return [];
      }

      let csvRows = this.parsedData[gridMode] || [];
      if (gridMode === GridMode.SKEWED && csvRows.length === 0) {
        csvRows = this.parsedData[GridMode.DIAMOND] || [];
      }
      const effectiveMode = gridMode;

      const allPictographs: PictographData[] = [];
      for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];
        try {
          const pictograph = this.csvPictographParser.parseCSVRowToPictograph(
            row as unknown as CSVRow,
            effectiveMode
          );
          if (pictograph) {
            allPictographs.push(pictograph);
          }
        } catch (parseError) {
          console.warn(
            "⚠️ MotionQueryHandler: Failed to parse row:",
            parseError
          );
        }
      }

      filterSpan = bootProfiler.startSpan("construct:option-filter", {
        candidates: allPictographs.length,
      });
      if (!sequence || sequence.length === 0) {
        const options = allPictographs.slice(0, 20);
        filterSpan("cancelled");
        span("ok", {
          candidates: allPictographs.length,
          options: options.length,
        });
        return options;
      }

      const lastStep = sequence[sequence.length - 1] as PictographData;
      if (!lastStep.motions.left || !lastStep.motions.right) {
        console.warn(
          "⚠️ MotionQueryHandler: Last beat has no motion data, returning all options"
        );
        filterSpan("cancelled");
        span("ok", {
          candidates: allPictographs.length,
          options: allPictographs.length,
        });
        return allPictographs;
      }

      const endLeftOrientation = lastStep.motions.left.endOrientation;
      const endRightOrientation = lastStep.motions.right.endOrientation;
      const endLeftLocation = lastStep.motions.left.endLocation;
      const endRightLocation = lastStep.motions.right.endLocation;

      const transformedPictographs: PictographData[] = [];

      for (let i = 0; i < allPictographs.length; i++) {
        const pictograph = allPictographs[i];
        if (!pictograph?.motions.left || !pictograph.motions.right) {
          continue;
        }

        const startLeftLocation = pictograph.motions.left.startLocation;
        const startRightLocation = pictograph.motions.right.startLocation;

        const canConnect =
          startLeftLocation === endLeftLocation &&
          startRightLocation === endRightLocation;

        if (canConnect) {
          const transformedPictograph =
            this.transformPictographStartOrientation(
              pictograph,
              endLeftOrientation,
              endRightOrientation
            );

          transformedPictographs.push(transformedPictograph);
        }
      }

      if (transformedPictographs.length === 0) {
        console.warn(
          "⚠️ MotionQueryHandler: No matching options found, returning all options as fallback"
        );
        filterSpan("ok", { options: allPictographs.length, fallback: true });
        span("ok", {
          candidates: allPictographs.length,
          options: allPictographs.length,
        });
        return allPictographs;
      }

      filterSpan("ok", { options: transformedPictographs.length });
      span("ok", {
        candidates: allPictographs.length,
        options: transformedPictographs.length,
      });
      return transformedPictographs;
    } catch (error) {
      console.error(
        "❌ MotionQueryHandler: Error in getNextOptionsForSequence:",
        error
      );
      filterSpan?.("error");
      span("error");
      throw error;
    }
  }

  private transformPictographStartOrientation(
    pictograph: PictographData,
    targetLeftStartOrientation: Orientation,
    targetRightStartOrientation: Orientation
  ): PictographData {
    if (!pictograph.motions.left || !pictograph.motions.right) {
      return pictograph;
    }

    const transformedPictograph: PictographData = {
      ...pictograph,
      motions: {
        left: { ...pictograph.motions.left },
        right: { ...pictograph.motions.right },
      },
    };

    if (transformedPictograph.motions.left) {
      transformedPictograph.motions.left = {
        ...transformedPictograph.motions.left,
        startOrientation: targetLeftStartOrientation,
        endOrientation: this.calculateTransformedEndOrientation(
          transformedPictograph.motions.left,
          targetLeftStartOrientation,
          HandSide.LEFT
        ),
      };
    }

    if (transformedPictograph.motions.right) {
      transformedPictograph.motions.right = {
        ...transformedPictograph.motions.right,
        startOrientation: targetRightStartOrientation,
        endOrientation: this.calculateTransformedEndOrientation(
          transformedPictograph.motions.right,
          targetRightStartOrientation,
          HandSide.RIGHT
        ),
      };
    }

    return transformedPictograph;
  }

  private calculateTransformedEndOrientation(
    originalMotion: MotionData,
    newStartOrientation: Orientation,
    color: HandSide
  ): Orientation {
    const transformedMotionData: MotionData = createMotionData({
      motionType: originalMotion.motionType,
      rotationDirection: originalMotion.rotationDirection,
      startLocation: originalMotion.startLocation,
      endLocation: originalMotion.endLocation,
      turns: originalMotion.turns,
      startOrientation: newStartOrientation,
      endOrientation: originalMotion.endOrientation,
      isVisible: originalMotion.isVisible,
      hand: color,
      propType: originalMotion.propType,
      arrowLocation: originalMotion.arrowLocation,
    });

    return calculateEndOrientation(transformedMotionData, color);
  }

  async findLetterByMotionConfiguration(
    leftMotion: MotionData,
    rightMotion: MotionData,
    gridMode: GridMode
  ): Promise<string | null> {
    await this.ensureInitialized();

    if (!this.parsedData) {
      console.error("❌ No parsed CSV data available");
      return null;
    }

    let csvRows = this.parsedData[gridMode] || [];
    if (gridMode === GridMode.SKEWED && csvRows.length === 0) {
      csvRows = this.parsedData[GridMode.DIAMOND] || [];
    }

    // A float carrying a prefloat TYPE next to a "noRotation" prefloat
    // ROTATION is the legacy blob decoder's FABRICATED pair — the old wire
    // format carried no prefloat data, and the decoder manufactured a type
    // from the empty rotation slot (parity-repair spec, root-caused
    // 2026-07-27 against embedded mint-time witnesses: the manufactured
    // types flip pro↔anti arbitrarily). Matching CSV rows against that pair
    // produces confident same-family WRONG letters. Treat the whole pair as
    // absent; the decoder no longer emits it, but persisted copies of old
    // decodes can still carry it.
    const isFabricatedPrefloat = (motion: MotionData): boolean =>
      !!motion.prefloatMotionType &&
      String(motion.prefloatRotationDirection ?? "").toLowerCase() ===
        "norotation";

    const getSearchMotionType = (motion: MotionData): string => {
      if (motion.prefloatMotionType && !isFabricatedPrefloat(motion)) {
        return motion.prefloatMotionType;
      }
      if (motion.motionType.toLowerCase() === "float") {
        if (motion.startLocation !== motion.endLocation) {
          return "pro";
        }
      }
      return motion.motionType;
    };

    const leftSearchMotion = {
      ...leftMotion,
      motionType: getSearchMotionType(leftMotion),
      rotationDirection: isFabricatedPrefloat(leftMotion)
        ? leftMotion.rotationDirection
        : leftMotion.prefloatRotationDirection || leftMotion.rotationDirection,
    };
    const rightSearchMotion = {
      ...rightMotion,
      motionType: getSearchMotionType(rightMotion),
      rotationDirection: isFabricatedPrefloat(rightMotion)
        ? rightMotion.rotationDirection
        : rightMotion.prefloatRotationDirection ||
          rightMotion.rotationDirection,
    };

    const leftIsFloatWithoutPrefloat =
      leftMotion.motionType.toLowerCase() === "float" &&
      (!leftMotion.prefloatMotionType || isFabricatedPrefloat(leftMotion));
    const rightIsFloatWithoutPrefloat =
      rightMotion.motionType.toLowerCase() === "float" &&
      (!rightMotion.prefloatMotionType || isFabricatedPrefloat(rightMotion));
    const leftAlternativeTypes =
      leftIsFloatWithoutPrefloat && leftSearchMotion.motionType === "pro"
        ? ["pro", "anti"]
        : [leftSearchMotion.motionType];
    const rightAlternativeTypes =
      rightIsFloatWithoutPrefloat && rightSearchMotion.motionType === "pro"
        ? ["pro", "anti"]
        : [rightSearchMotion.motionType];

    for (const leftType of leftAlternativeTypes) {
      for (const rightType of rightAlternativeTypes) {
        for (const row of csvRows) {
          const leftIgnoreRotation =
            leftType.toLowerCase() === "static" ||
            leftType.toLowerCase() === "dash" ||
            leftIsFloatWithoutPrefloat;
          const rightIgnoreRotation =
            rightType.toLowerCase() === "static" ||
            rightType.toLowerCase() === "dash" ||
            rightIsFloatWithoutPrefloat;

          const matchesLeftMotion =
            row.leftMotionType.toLowerCase() === leftType.toLowerCase() &&
            row.leftStartLocation.toLowerCase() ===
              leftMotion.startLocation.toLowerCase() &&
            row.leftEndLocation.toLowerCase() ===
              leftMotion.endLocation.toLowerCase() &&
            (leftIgnoreRotation ||
              row.leftRotationDirection.toLowerCase() ===
                leftSearchMotion.rotationDirection.toLowerCase());

          const matchesRightMotion =
            row.rightMotionType.toLowerCase() === rightType.toLowerCase() &&
            row.rightStartLocation.toLowerCase() ===
              rightMotion.startLocation.toLowerCase() &&
            row.rightEndLocation.toLowerCase() ===
              rightMotion.endLocation.toLowerCase() &&
            (rightIgnoreRotation ||
              row.rightRotationDirection.toLowerCase() ===
                rightSearchMotion.rotationDirection.toLowerCase());

          if (matchesLeftMotion && matchesRightMotion) {
            return row.letter || null;
          }
        }
      }
    }

    const leftDesc = leftMotion.prefloatMotionType
      ? `${leftMotion.motionType}(was ${leftMotion.prefloatMotionType}) ${leftMotion.startLocation}->${leftMotion.endLocation} ${leftSearchMotion.rotationDirection}`
      : `${leftMotion.motionType} ${leftMotion.startLocation}->${leftMotion.endLocation} ${leftSearchMotion.rotationDirection}`;
    const rightDesc = rightMotion.prefloatMotionType
      ? `${rightMotion.motionType}(was ${rightMotion.prefloatMotionType}) ${rightMotion.startLocation}->${rightMotion.endLocation} ${rightSearchMotion.rotationDirection}`
      : `${rightMotion.motionType} ${rightMotion.startLocation}->${rightMotion.endLocation} ${rightSearchMotion.rotationDirection}`;
    console.warn(
      `⚠️ No letter found for motion configuration: Left(${leftDesc}), Right(${rightDesc})`
    );
    return null;
  }
}

import { csvLoader } from "../../../foundation/services/data/csv-loader";
import { csvParser } from "../../../foundation/services/implementations/data/csv-parser";
import { csvPictographParser } from "./csv-pictograph-parser";

export const motionQueryHandler = new MotionQueryHandler(
  csvLoader,
  csvParser,
  csvPictographParser
);
