import type { GridMode } from "../../grid/domain/enums/grid-enums";
import { GridPlacement } from "../../grid/domain/enums/grid-enums";
import type { Letter } from "../../../foundation/domain/models/letter";
import { HandSide, HandPath, SkewDirection } from "../domain/enums/pictograph-enums";
import { createMotionData } from "../domain/models/motion-data";
import type { PictographData } from "../domain/models/pictograph-data";
import { createPictographData } from "../domain/factories/create-pictograph-data";
import type { EnumMapper } from "../../../foundation/services/implementations/data/enum-mapper";
import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";
import { Orientation } from "../domain/enums/pictograph-enums";

/**
 * A single row of BoxPictographDataframe.csv — the CSV → PictographData input shape.
 * Skewed-mode fields are present only in SkewedPictographDataframe.csv.
 */
export interface CSVRow {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  timing: string;
  direction: string;
  leftMotionType: string;
  leftRotationDirection: string;
  leftStartLocation: string;
  leftEndLocation: string;
  rightMotionType: string;
  rightRotationDirection: string;
  rightStartLocation: string;
  rightEndLocation: string;
  leftSkewDir?: string;
  leftHandPath?: string;
  leftSkewSteps?: string;
  rightSkewDir?: string;
  rightHandPath?: string;
  rightSkewSteps?: string;
  category?: string;
}

function mapHandPath(value: string | undefined): HandPath | null {
  if (!value) return null;
  switch (value.toLowerCase()) {
    case "cw":
      return HandPath.CLOCKWISE;
    case "ccw":
      return HandPath.COUNTER_CLOCKWISE;
    case "dash":
      return HandPath.DASH;
    case "static":
      return HandPath.STATIC;
    case "hashin":
      return HandPath.HASH_IN;
    case "hashout":
      return HandPath.HASH_OUT;
    default:
      return null;
  }
}

function mapSkewDir(value: string | undefined): SkewDirection | null {
  if (!value) return null;
  switch (value.trim()) {
    case "+":
      return SkewDirection.PLUS;
    case "-":
      return SkewDirection.MINUS;
    default:
      return null;
  }
}

export class CSVPictographParser {
  constructor(
    private readonly enumMapper: EnumMapper
  ) {}

  parseCSVRowToPictograph(row: CSVRow, gridMode: GridMode): PictographData {
    const letter = row.letter as Letter;

    const tempLeftMotion = createMotionData({
      motionType: this.enumMapper.mapMotionType(row.leftMotionType),
      rotationDirection: this.enumMapper.mapRotationDirection(
        row.leftRotationDirection
      ),
      startLocation: this.enumMapper.mapLocation(row.leftStartLocation),
      endLocation: this.enumMapper.mapLocation(row.leftEndLocation),
      startOrientation: Orientation.IN, 
      turns: 0, 
      hand: HandSide.LEFT,
      gridMode: gridMode, 
    });

    const leftEndOrientation = calculateEndOrientation(
      tempLeftMotion,
      HandSide.LEFT
    );

    const leftHandPath = mapHandPath(row.leftHandPath);
    const leftSkewSteps = row.leftSkewSteps ? parseInt(row.leftSkewSteps, 10) : null;
    const leftSkewDir = mapSkewDir(row.leftSkewDir);

    const leftMotion = createMotionData({
      motionType: this.enumMapper.mapMotionType(row.leftMotionType),
      rotationDirection: this.enumMapper.mapRotationDirection(
        row.leftRotationDirection
      ),
      startLocation: this.enumMapper.mapLocation(row.leftStartLocation),
      endLocation: this.enumMapper.mapLocation(row.leftEndLocation),
      startOrientation: Orientation.IN,
      endOrientation: leftEndOrientation, 
      turns: 0,
      hand: HandSide.LEFT,
      gridMode: gridMode, 
      ...(leftHandPath !== null && { handPath: leftHandPath }),
      ...(leftSkewSteps !== null && { skewSteps: leftSkewSteps }),
      ...(leftSkewDir !== null && { skewDir: leftSkewDir }),
    });

    const tempRightMotion = createMotionData({
      motionType: this.enumMapper.mapMotionType(row.rightMotionType),
      rotationDirection: this.enumMapper.mapRotationDirection(
        row.rightRotationDirection
      ),
      startLocation: this.enumMapper.mapLocation(row.rightStartLocation),
      endLocation: this.enumMapper.mapLocation(row.rightEndLocation),
      startOrientation: Orientation.IN, 
      turns: 0, 
      hand: HandSide.RIGHT,
      gridMode: gridMode, 
    });

    const rightEndOrientation = calculateEndOrientation(
      tempRightMotion,
      HandSide.RIGHT
    );

    const rightHandPath = mapHandPath(row.rightHandPath);
    const rightSkewSteps = row.rightSkewSteps ? parseInt(row.rightSkewSteps, 10) : null;
    const rightSkewDir = mapSkewDir(row.rightSkewDir);

    const rightMotion = createMotionData({
      motionType: this.enumMapper.mapMotionType(row.rightMotionType),
      rotationDirection: this.enumMapper.mapRotationDirection(
        row.rightRotationDirection
      ),
      startLocation: this.enumMapper.mapLocation(row.rightStartLocation),
      endLocation: this.enumMapper.mapLocation(row.rightEndLocation),
      startOrientation: Orientation.IN,
      endOrientation: rightEndOrientation, 
      turns: 0,
      hand: HandSide.RIGHT,
      gridMode: gridMode, 
      ...(rightHandPath !== null && { handPath: rightHandPath }),
      ...(rightSkewSteps !== null && { skewSteps: rightSkewSteps }),
      ...(rightSkewDir !== null && { skewDir: rightSkewDir }),
    });

    const category = row.category ? parseInt(row.category, 10) : null;

    return createPictographData({
      letter,
      startPlacement: this.mapStringToGridPlacement(row.startPlacement),
      endPlacement: this.mapStringToGridPlacement(row.endPlacement),
      motions: {
        [HandSide.LEFT]: leftMotion,
        [HandSide.RIGHT]: rightMotion,
      },
      ...(category !== null && { category }),
    });
  }

  private mapStringToGridPlacement(position: string): GridPlacement | null {
    const upperPosition = position.toUpperCase();

    if (upperPosition in GridPlacement) {
      return GridPlacement[upperPosition as keyof typeof GridPlacement];
    }

    return null;
  }

  parseLetterPictographs(
    letterRows: CSVRow[],
    gridMode: GridMode
  ): PictographData[] {
    return letterRows.map((row) => this.parseCSVRowToPictograph(row, gridMode));
  }

  validateCSVRow(row: unknown): row is CSVRow {
    const requiredFields = [
      "letter",
      "startPlacement",
      "endPlacement",
      "timing",
      "direction",
      "blueMotionType",
      "blueRotationDirection",
      "blueStartLocation",
      "blueEndLocation",
      "redMotionType",
      "redRotationDirection",
      "redStartLocation",
      "redEndLocation",
    ];

    return requiredFields.every(
      (field) =>
        row &&
        typeof row === "object" &&
        field in row &&
        (row as Record<string, unknown>)[field] !== undefined
    );
  }
}

import { enumMapper } from "../../../foundation/services/implementations/data/enum-mapper";

export const csvPictographParser = new CSVPictographParser(
  enumMapper
);
