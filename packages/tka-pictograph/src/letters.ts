import box from "./data/box.json";
import diamond from "./data/diamond.json";
import type { MotionInput, PictographInput } from "./types.js";

type Row = Record<string, string>;

const ROWS: Record<"diamond" | "box", Row[]> = { diamond, box };

function motion(row: Row, side: "blue" | "red", hand: "left" | "right"): MotionInput {
  return {
    motionType: row[`${side}MotionType`] ?? "",
    rotationDirection: row[`${side}RotationDirection`] || "no_rotation",
    startLocation: row[`${side}StartLocation`] ?? "",
    endLocation: row[`${side}EndLocation`] ?? "",
    hand,
    turns: 0,
    startOrientation: "in",
  };
}

/**
 * A letter's pictographs from the dataframe, blue as the left hand and red as
 * the right, with no turns and both props starting in. `start` keeps only
 * those that start at a placement ("alpha3") or in a group ("alpha").
 */
export function pictographsForLetter(
  letter: string,
  filter: { start?: string; gridMode?: "diamond" | "box" } = {}
): PictographInput[] {
  const gridMode = filter.gridMode ?? "diamond";
  const start = filter.start;
  return ROWS[gridMode]
    .filter((row) => row.letter === letter)
    .filter(
      (row) =>
        !start ||
        row.startPlacement === start ||
        row.startPlacement?.replace(/\d+$/, "") === start
    )
    .map((row) => ({
      letter: row.letter ?? letter,
      startPlacement: row.startPlacement,
      endPlacement: row.endPlacement,
      leftMotion: motion(row, "blue", "left"),
      rightMotion: motion(row, "red", "right"),
      gridMode,
    }));
}
