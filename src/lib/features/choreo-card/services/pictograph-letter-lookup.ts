import { DIAMOND_EDGES, type CsvEdge } from "@tka/shape-domain";

export {
  BOX_EDGES,
  DIAMOND_EDGES,
  lookupLetter,
  parseCsvEdges,
  type CsvEdge,
  type StepMotionQuery,
} from "@tka/shape-domain";

/** Kept for callers that awaited the fetch; the edges ship with the package now. */
export async function loadDiamondEdges(): Promise<CsvEdge[]> {
  return DIAMOND_EDGES as CsvEdge[];
}
