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
  edges: CsvEdge[],
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

let cachedDiamondEdges: CsvEdge[] | null = null;

/** Fetch + cache the diamond pictograph dataframe (served from /static). */
export async function loadDiamondEdges(): Promise<CsvEdge[]> {
  if (cachedDiamondEdges) return cachedDiamondEdges;
  const res = await fetch("/data/pictographs/DiamondPictographDataframe.csv");
  if (!res.ok) throw new Error(`Failed to load pictograph CSV: ${res.status}`);
  cachedDiamondEdges = parseCsvEdges(await res.text());
  return cachedDiamondEdges;
}
