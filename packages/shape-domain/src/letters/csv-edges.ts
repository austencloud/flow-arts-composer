import diamond from "./diamond-edges.json";
import box from "./box-edges.json";

export interface CsvEdge {
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
  [key: string]: string;
}

export interface StepMotionQuery {
  startPlacement: string;
  endPlacement: string;
  left: { motionType: string; startLocation: string; endLocation: string };
  right: { motionType: string; startLocation: string; endLocation: string };
}

/** Parse the pictograph dataframe CSV text into edge rows. */
export function parseCsvEdges(csvText: string): CsvEdge[] {
  const lines = csvText.split("\n").filter((l) => l.trim());
  const headerLine = lines[0];
  if (!headerLine) return [];
  const headers = headerLine.split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const edge: Record<string, string> = {};
    headers.forEach((h, i) => (edge[h] = cols[i] ?? ""));

    // The checked-in dataframes are a long-lived interchange format used by
    // cards and external tooling. Translate their legacy color-keyed headers
    // at this ingestion boundary so the rest of the app speaks in hands.
    edge.leftMotionType ??= edge.blueMotionType ?? "";
    edge.leftRotationDirection ??= edge.blueRotationDirection ?? "";
    edge.leftStartLocation ??= edge.blueStartLocation ?? "";
    edge.leftEndLocation ??= edge.blueEndLocation ?? "";
    edge.rightMotionType ??= edge.redMotionType ?? "";
    edge.rightRotationDirection ??= edge.redRotationDirection ?? "";
    edge.rightStartLocation ??= edge.redStartLocation ?? "";
    edge.rightEndLocation ??= edge.redEndLocation ?? "";
    return edge as CsvEdge;
  });
}

/** Find the letter for a transformed step by exact edge match. Null when none. */
export function lookupLetter(
  edges: readonly CsvEdge[],
  q: StepMotionQuery
): string | null {
  const match = edges.find(
    (e) =>
      e.startPlacement === q.startPlacement &&
      e.endPlacement === q.endPlacement &&
      e.leftMotionType === q.left.motionType &&
      e.leftStartLocation === q.left.startLocation &&
      e.leftEndLocation === q.left.endLocation &&
      e.rightMotionType === q.right.motionType &&
      e.rightStartLocation === q.right.startLocation &&
      e.rightEndLocation === q.right.endLocation
  );
  return match ? match.letter : null;
}

/** The diamond and box pictograph dataframes, baked by scripts/bake-edges.mjs. */
export const DIAMOND_EDGES: readonly CsvEdge[] = diamond as CsvEdge[];
export const BOX_EDGES: readonly CsvEdge[] = box as CsvEdge[];
