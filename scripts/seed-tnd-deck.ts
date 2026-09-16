/**
 * Seed the Level 1 TnD Motions Deck to Firestore
 *
 * 19 TnD base motions as quartered and halved rotated LOOPs.
 * Each card represents one fundamental TnD motion category.
 *
 * Same-direction motions (10): 1-letter seed walked 4 beats 90° around the grid.
 * Opposite-direction motions (9): 2-letter seed alternated, walked 4 beats 180°.
 *
 * CANONICAL SOURCE: static/data/pictographs/DiamondPictographDataframe.csv.
 * The CSV already contains every rotated beat of every TnD motion, so this
 * seeder walks the CSV directly — it does NOT route through any rotation
 * executor. Each of the 4 beats is one (letter, startPos, endPos[, leftDir])
 * CSV row; orientations chain through the engine's OrientationCalculator.
 *
 * This is the single canonical seeder for decks/l1-tnd-motions. It folds in the
 * former scripts/seed-vtg-togopp.ts (the tog-opp mirror-chirality re-seed): the
 * 3 tog-opp sequences (DJDJ/EKEK/FLFL) walk beta5→alpha3→beta1→alpha7→beta5
 * with left=anti (EK/FL) / left=pro (DJ), reproducing the live mirror chirality.
 * The other 16 reproduce the original old-engine output byte-for-byte.
 *
 * Why no rotation executor: the function-based executeLOOP →
 * executeStrictRotated → createRotatedStep in
 * packages/sequence-engine/src/loop/execution/LOOPExecutor.ts reads
 * step.motions.{left,right} while seeders built flat leftMotion/rightMotion steps,
 * so it threw on the missing nested motion structure for all 19
 * seeds. That function path is dead for the app (the app uses the class-based
 * StrictRotatedExecutor) but is still imported by scripts/seed-l1-deck.ts, so it
 * is left in place; this seeder simply no longer depends on it.
 *
 * Usage: npx tsx scripts/seed-tnd-deck.ts [--dry-run]
 * Requires: serviceAccountKey.json in project root
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

import { calculateEndOrientation } from "../packages/sequence-engine/src/core/orientation/OrientationCalculator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CSV_PATH = path.resolve(
  PROJECT_ROOT,
  "static/data/pictographs/DiamondPictographDataframe.csv"
);
const SERVICE_ACCOUNT_PATH = path.resolve(
  PROJECT_ROOT,
  "serviceAccountKey.json"
);
const DECK_ID = "l1-tnd-motions";
const DRY_RUN = process.argv.includes("--dry-run");

// Period labels for metadata (matches the prior enum's two values).
const PERIOD_QUARTERED = "quartered";
const PERIOD_HALVED = "halved";
type PeriodLabel = typeof PERIOD_QUARTERED | typeof PERIOD_HALVED;

interface CsvMotion {
  motionType: string;
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
}

interface CsvRow {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  timing: string;
  direction: string;
  left: CsvMotion;
  right: CsvMotion;
}

/**
 * Load the canonical diamond dataframe. Column order matches
 * DiamondPictographDataframe.csv:
 *   letter, startPlacement, endPlacement, timing, direction,
 *   blueMotionType, blueRotationDirection, blueStartLocation, blueEndLocation,
 *   redMotionType,  redRotationDirection,  redStartLocation,  redEndLocation
 * The CSV is master truth and is never reordered or edited.
 */
function loadCsv(): CsvRow[] {
  const content = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = content.trim().split("\n");
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i].split(",").map((s) => s.trim());
    if (!v[0]) continue;
    rows.push({
      letter: v[0],
      startPlacement: v[1],
      endPlacement: v[2],
      timing: v[3],
      direction: v[4],
      left: {
        motionType: v[5],
        rotationDirection: v[6],
        startLocation: v[7],
        endLocation: v[8],
      },
      right: {
        motionType: v[9],
        rotationDirection: v[10],
        startLocation: v[11],
        endLocation: v[12],
      },
    });
  }
  return rows;
}

// TnD MOTION DEFINITIONS
//
// Each TnD motion is a 4-beat walk. Every beat is one explicit
// (letter, startPos, endPos) triple resolving to exactly one CSV row, plus an
// optional leftDir discriminator for hybrid letters (F, L) that have two
// pictographs per triple differing in which hand is anti vs pro.
//
// The 16 non-tog-opp walks reproduce the original old-engine output:
//   - quartered (same-dir): the 1-letter seed walked CW 90° per beat
//   - split-opp / quarter-opp halved: the 2-letter seed alternated, walked 180°
// The 3 tog-opp walks use the mirror chirality (beta5→alpha3→beta1→alpha7).

interface BeatRef {
  letter: string;
  startPos: string;
  endPos: string;
  /** Left-hand rotationDirection discriminator for hybrid (F/L) ties. */
  leftDir?: string;
}

interface TnDMotionDef {
  id: number;
  word: string; // Full 4-beat word (e.g. "AAAA" or "JDJD")
  vtg: string; // VTG category label
  familyId: string; // Family grouping ID
  startPos: string; // Starting position
  period: PeriodLabel;
  /** Seed letters, used only for the metadata.seed field. */
  seed: string[];
  /** The 4-beat walk; every beat is a unique CSV row. */
  beats: BeatRef[];
}

/**
 * Every TnD motion's 4-beat walk is written out explicitly as
 * (letter, startPos, endPos) triples. The walk direction is NOT a uniform grid
 * rotation — each TnD family circles the grid differently (e.g. SSSS walks
 * gamma11→gamma9→gamma15→gamma13, UUUU walks gamma11→gamma13→gamma15→gamma9),
 * so the positions are taken directly from the canonical production data rather
 * than computed. findRow resolves each triple to the FIRST matching CSV row
 * (verified: every live beat is triple-index 0); for the hybrid F/L beats a
 * leftDir discriminator pins the left=anti / right=pro pictograph.
 *
 * The 16 same-dir + split-opp + quarter-opp walks reproduce the original
 * old-engine output (the 13 of them already in production are byte-identical;
 * GGGG/HHHH/IIII follow the identical tog-same pattern but were never seeded).
 * The 3 tog-opp walks (DJDJ/EKEK/FLFL) use the live mirror chirality
 * (beta5→alpha3→beta1→alpha7→beta5).
 */
const TND_MOTIONS: TnDMotionDef[] = [
  // Same-Direction Quartered — Split-Same (alpha1, walks alpha1→alpha3→alpha5→alpha7)
  {
    id: 1,
    word: "AAAA",
    vtg: "Split-Same",
    familyId: "split-same",
    startPos: "alpha1",
    period: PERIOD_QUARTERED,
    seed: ["A"],
    beats: [
      { letter: "A", startPos: "alpha1", endPos: "alpha3" },
      { letter: "A", startPos: "alpha3", endPos: "alpha5" },
      { letter: "A", startPos: "alpha5", endPos: "alpha7" },
      { letter: "A", startPos: "alpha7", endPos: "alpha1" },
    ],
  },
  {
    id: 2,
    word: "BBBB",
    vtg: "Split-Same",
    familyId: "split-same",
    startPos: "alpha1",
    period: PERIOD_QUARTERED,
    seed: ["B"],
    beats: [
      { letter: "B", startPos: "alpha1", endPos: "alpha3" },
      { letter: "B", startPos: "alpha3", endPos: "alpha5" },
      { letter: "B", startPos: "alpha5", endPos: "alpha7" },
      { letter: "B", startPos: "alpha7", endPos: "alpha1" },
    ],
  },
  {
    id: 3,
    word: "CCCC",
    vtg: "Split-Same",
    familyId: "split-same",
    startPos: "alpha1",
    period: PERIOD_QUARTERED,
    seed: ["C"],
    beats: [
      { letter: "C", startPos: "alpha1", endPos: "alpha3", leftDir: "ccw" },
      { letter: "C", startPos: "alpha3", endPos: "alpha5", leftDir: "ccw" },
      { letter: "C", startPos: "alpha5", endPos: "alpha7", leftDir: "ccw" },
      { letter: "C", startPos: "alpha7", endPos: "alpha1", leftDir: "ccw" },
    ],
  },

  // Same-Direction Quartered — Tog-Same (beta5, walks beta5→beta7→beta1→beta3)
  {
    id: 4,
    word: "GGGG",
    vtg: "Tog-Same",
    familyId: "tog-same",
    startPos: "beta5",
    period: PERIOD_QUARTERED,
    seed: ["G"],
    beats: [
      { letter: "G", startPos: "beta5", endPos: "beta7" },
      { letter: "G", startPos: "beta7", endPos: "beta1" },
      { letter: "G", startPos: "beta1", endPos: "beta3" },
      { letter: "G", startPos: "beta3", endPos: "beta5" },
    ],
  },
  {
    id: 5,
    word: "HHHH",
    vtg: "Tog-Same",
    familyId: "tog-same",
    startPos: "beta5",
    period: PERIOD_QUARTERED,
    seed: ["H"],
    beats: [
      { letter: "H", startPos: "beta5", endPos: "beta7" },
      { letter: "H", startPos: "beta7", endPos: "beta1" },
      { letter: "H", startPos: "beta1", endPos: "beta3" },
      { letter: "H", startPos: "beta3", endPos: "beta5" },
    ],
  },
  {
    id: 6,
    word: "IIII",
    vtg: "Tog-Same",
    familyId: "tog-same",
    startPos: "beta5",
    period: PERIOD_QUARTERED,
    seed: ["I"],
    beats: [
      { letter: "I", startPos: "beta5", endPos: "beta7", leftDir: "ccw" },
      { letter: "I", startPos: "beta7", endPos: "beta1", leftDir: "ccw" },
      { letter: "I", startPos: "beta1", endPos: "beta3", leftDir: "ccw" },
      { letter: "I", startPos: "beta3", endPos: "beta5", leftDir: "ccw" },
    ],
  },

  // Same-Direction Quartered — Quarter-Same (gamma11). S/T walk
  // gamma11→gamma9→gamma15→gamma13; U/V walk gamma11→gamma13→gamma15→gamma9.
  {
    id: 7,
    word: "SSSS",
    vtg: "Quarter-Same",
    familyId: "quarter-same",
    startPos: "gamma11",
    period: PERIOD_QUARTERED,
    seed: ["S"],
    beats: [
      { letter: "S", startPos: "gamma11", endPos: "gamma9" },
      { letter: "S", startPos: "gamma9", endPos: "gamma15" },
      { letter: "S", startPos: "gamma15", endPos: "gamma13" },
      { letter: "S", startPos: "gamma13", endPos: "gamma11" },
    ],
  },
  {
    id: 8,
    word: "TTTT",
    vtg: "Quarter-Same",
    familyId: "quarter-same",
    startPos: "gamma11",
    period: PERIOD_QUARTERED,
    seed: ["T"],
    beats: [
      { letter: "T", startPos: "gamma11", endPos: "gamma9" },
      { letter: "T", startPos: "gamma9", endPos: "gamma15" },
      { letter: "T", startPos: "gamma15", endPos: "gamma13" },
      { letter: "T", startPos: "gamma13", endPos: "gamma11" },
    ],
  },
  {
    id: 9,
    word: "UUUU",
    vtg: "Quarter-Same",
    familyId: "quarter-same",
    startPos: "gamma11",
    period: PERIOD_QUARTERED,
    seed: ["U"],
    beats: [
      { letter: "U", startPos: "gamma11", endPos: "gamma13" },
      { letter: "U", startPos: "gamma13", endPos: "gamma15" },
      { letter: "U", startPos: "gamma15", endPos: "gamma9" },
      { letter: "U", startPos: "gamma9", endPos: "gamma11" },
    ],
  },
  {
    id: 10,
    word: "VVVV",
    vtg: "Quarter-Same",
    familyId: "quarter-same",
    startPos: "gamma11",
    period: PERIOD_QUARTERED,
    seed: ["V"],
    beats: [
      { letter: "V", startPos: "gamma11", endPos: "gamma13" },
      { letter: "V", startPos: "gamma13", endPos: "gamma15" },
      { letter: "V", startPos: "gamma15", endPos: "gamma9" },
      { letter: "V", startPos: "gamma9", endPos: "gamma11" },
    ],
  },

  // Opposite-Direction Halved — Split-Opp (alpha1, walks alpha1→beta3→alpha5→beta7)
  {
    id: 11,
    word: "JDJD",
    vtg: "Split-Opp",
    familyId: "split-opp",
    startPos: "alpha1",
    period: PERIOD_HALVED,
    seed: ["J", "D"],
    beats: [
      { letter: "J", startPos: "alpha1", endPos: "beta3" },
      { letter: "D", startPos: "beta3", endPos: "alpha5" },
      { letter: "J", startPos: "alpha5", endPos: "beta7" },
      { letter: "D", startPos: "beta7", endPos: "alpha1" },
    ],
  },
  {
    id: 12,
    word: "KEKE",
    vtg: "Split-Opp",
    familyId: "split-opp",
    startPos: "alpha1",
    period: PERIOD_HALVED,
    seed: ["K", "E"],
    beats: [
      { letter: "K", startPos: "alpha1", endPos: "beta3" },
      { letter: "E", startPos: "beta3", endPos: "alpha5" },
      { letter: "K", startPos: "alpha5", endPos: "beta7" },
      { letter: "E", startPos: "beta7", endPos: "alpha1" },
    ],
  },
  {
    id: 13,
    word: "LFLF",
    vtg: "Split-Opp",
    familyId: "split-opp",
    startPos: "alpha1",
    period: PERIOD_HALVED,
    seed: ["L", "F"],
    beats: [
      { letter: "L", startPos: "alpha1", endPos: "beta3", leftDir: "cw" },
      { letter: "F", startPos: "beta3", endPos: "alpha5", leftDir: "cw" },
      { letter: "L", startPos: "alpha5", endPos: "beta7", leftDir: "cw" },
      { letter: "F", startPos: "beta7", endPos: "alpha1", leftDir: "cw" },
    ],
  },

  // tog-opp: MIRROR chirality (beta5→alpha3→beta1→alpha7→beta5). DJ leads
  // left=pro; EK/FL use left=anti. Hybrid F/L need leftDir to pick the
  // left=anti, right=pro pictograph. These reproduce the live mirror state.
  {
    id: 14,
    word: "DJDJ",
    vtg: "Tog-Opp",
    familyId: "tog-opp",
    startPos: "beta5",
    period: PERIOD_HALVED,
    seed: ["D", "J"],
    beats: [
      { letter: "D", startPos: "beta5", endPos: "alpha3" },
      { letter: "J", startPos: "alpha3", endPos: "beta1" },
      { letter: "D", startPos: "beta1", endPos: "alpha7" },
      { letter: "J", startPos: "alpha7", endPos: "beta5" },
    ],
  },
  {
    id: 15,
    word: "EKEK",
    vtg: "Tog-Opp",
    familyId: "tog-opp",
    startPos: "beta5",
    period: PERIOD_HALVED,
    seed: ["E", "K"],
    beats: [
      { letter: "E", startPos: "beta5", endPos: "alpha3" },
      { letter: "K", startPos: "alpha3", endPos: "beta1" },
      { letter: "E", startPos: "beta1", endPos: "alpha7" },
      { letter: "K", startPos: "alpha7", endPos: "beta5" },
    ],
  },
  {
    id: 16,
    word: "FLFL",
    vtg: "Tog-Opp",
    familyId: "tog-opp",
    startPos: "beta5",
    period: PERIOD_HALVED,
    seed: ["F", "L"],
    beats: [
      { letter: "F", startPos: "beta5", endPos: "alpha3", leftDir: "ccw" },
      { letter: "L", startPos: "alpha3", endPos: "beta1", leftDir: "ccw" },
      { letter: "F", startPos: "beta1", endPos: "alpha7", leftDir: "ccw" },
      { letter: "L", startPos: "alpha7", endPos: "beta5", leftDir: "ccw" },
    ],
  },

  // Opposite-Direction Halved — Quarter-Opp (gamma11, walks gamma11→gamma1→gamma15→gamma5)
  {
    id: 17,
    word: "MPMP",
    vtg: "Quarter-Opp",
    familyId: "quarter-opp",
    startPos: "gamma11",
    period: PERIOD_HALVED,
    seed: ["M", "P"],
    beats: [
      { letter: "M", startPos: "gamma11", endPos: "gamma1" },
      { letter: "P", startPos: "gamma1", endPos: "gamma15" },
      { letter: "M", startPos: "gamma15", endPos: "gamma5" },
      { letter: "P", startPos: "gamma5", endPos: "gamma11" },
    ],
  },
  {
    id: 18,
    word: "NQNQ",
    vtg: "Quarter-Opp",
    familyId: "quarter-opp",
    startPos: "gamma11",
    period: PERIOD_HALVED,
    seed: ["N", "Q"],
    beats: [
      { letter: "N", startPos: "gamma11", endPos: "gamma1" },
      { letter: "Q", startPos: "gamma1", endPos: "gamma15" },
      { letter: "N", startPos: "gamma15", endPos: "gamma5" },
      { letter: "Q", startPos: "gamma5", endPos: "gamma11" },
    ],
  },
  {
    id: 19,
    word: "OROR",
    vtg: "Quarter-Opp",
    familyId: "quarter-opp",
    startPos: "gamma11",
    period: PERIOD_HALVED,
    seed: ["O", "R"],
    beats: [
      { letter: "O", startPos: "gamma11", endPos: "gamma1", leftDir: "ccw" },
      { letter: "R", startPos: "gamma1", endPos: "gamma15", leftDir: "ccw" },
      { letter: "O", startPos: "gamma15", endPos: "gamma5", leftDir: "ccw" },
      { letter: "R", startPos: "gamma5", endPos: "gamma11", leftDir: "ccw" },
    ],
  },
  // Gamma SPLIT half (spec §4.2) — the mirror of MPMP/NQNQ/OROR. Lead letter
  // reversed (P/Q/R first) and started at the split-half preimage gamma9, walking
  // 9→3→13→7→9. Diamond = quarter-opp (Moon, gamma undivided there); box transform
  // lands in GAMMA_DIAG → split-opp (Fire). familyId is the diamond classification;
  // the deck releaser recomputes box at runtime (deck-composer TnD classification).
  {
    id: 20,
    word: "PMPM",
    vtg: "Quarter-Opp",
    familyId: "quarter-opp",
    startPos: "gamma9",
    period: PERIOD_HALVED,
    seed: ["P", "M"],
    beats: [
      { letter: "P", startPos: "gamma9", endPos: "gamma3" },
      { letter: "M", startPos: "gamma3", endPos: "gamma13" },
      { letter: "P", startPos: "gamma13", endPos: "gamma7" },
      { letter: "M", startPos: "gamma7", endPos: "gamma9" },
    ],
  },
  {
    id: 21,
    word: "QNQN",
    vtg: "Quarter-Opp",
    familyId: "quarter-opp",
    startPos: "gamma9",
    period: PERIOD_HALVED,
    seed: ["Q", "N"],
    beats: [
      { letter: "Q", startPos: "gamma9", endPos: "gamma3" },
      { letter: "N", startPos: "gamma3", endPos: "gamma13" },
      { letter: "Q", startPos: "gamma13", endPos: "gamma7" },
      { letter: "N", startPos: "gamma7", endPos: "gamma9" },
    ],
  },
  {
    id: 22,
    word: "RORO",
    vtg: "Quarter-Opp",
    familyId: "quarter-opp",
    startPos: "gamma9",
    period: PERIOD_HALVED,
    seed: ["R", "O"],
    beats: [
      { letter: "R", startPos: "gamma9", endPos: "gamma3", leftDir: "ccw" },
      { letter: "O", startPos: "gamma3", endPos: "gamma13", leftDir: "ccw" },
      { letter: "R", startPos: "gamma13", endPos: "gamma7", leftDir: "ccw" },
      { letter: "O", startPos: "gamma7", endPos: "gamma9", leftDir: "ccw" },
    ],
  },
];

// TnD FAMILY DEFINITIONS (for Firestore deck metadata)

const TND_FAMILIES = [
  { id: "split-same", label: "Split-Same", typeCombo: "Quartered" },
  { id: "tog-same", label: "Tog-Same", typeCombo: "Quartered" },
  { id: "quarter-same", label: "Quarter-Same", typeCombo: "Quartered" },
  { id: "split-opp", label: "Split-Opp", typeCombo: "Halved" },
  { id: "tog-opp", label: "Tog-Opp", typeCombo: "Halved" },
  { id: "quarter-opp", label: "Quarter-Opp", typeCombo: "Halved" },
];

/**
 * Resolve a single beat to a CSV row by (letter, startPos, endPos) and, when
 * given, left-hand rotationDirection. When the triple has two pictographs (hybrid
 * letters C/F/L share an endPos across two variants), the FIRST CSV row in
 * canonical order is taken — verified against the live deck, every production
 * beat is exactly the first triple-match (and where a leftDir is supplied it
 * already selects that same first row). Throws only when nothing matches, so a
 * bad walk fails loudly rather than silently picking a wrong position.
 */
function findRow(rows: CsvRow[], b: BeatRef): CsvRow {
  const matches = rows.filter(
    (r) =>
      r.letter === b.letter &&
      r.startPlacement === b.startPos &&
      r.endPlacement === b.endPos &&
      (b.leftDir === undefined || r.left.rotationDirection === b.leftDir)
  );
  if (matches.length === 0) {
    const dir = b.leftDir ? ` leftDir=${b.leftDir}` : "";
    throw new Error(
      `No CSV row for ${b.letter} ${b.startPos}>${b.endPos}${dir}`
    );
  }
  return matches[0];
}

// ============================================================================
// ORIENTATION CHAINING
// ============================================================================

interface BuiltMotion extends CsvMotion {
  startOrientation: string;
  endOrientation: string;
}

interface BuiltBeat {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  left: BuiltMotion;
  right: BuiltMotion;
}

/**
 * Chain orientations across beats: each beat's start orientation is the
 * previous beat's end orientation. Both hands start at "in". This matches the
 * chainOrientations behavior of the prior seeder (turns=0, default rotation
 * "cw" when a row leaves it blank).
 */
function chainOrientations(rows: CsvRow[]): BuiltBeat[] {
  let leftOri = "in";
  let rightOri = "in";
  return rows.map((r) => {
    const leftStart = leftOri;
    const rightStart = rightOri;
    const leftEnd = calculateEndOrientation({
      motionType: r.left.motionType,
      turns: 0,
      rotationDirection: r.left.rotationDirection || "cw",
      startLocation: r.left.startLocation,
      endLocation: r.left.endLocation,
      startOrientation: leftStart,
    });
    const rightEnd = calculateEndOrientation({
      motionType: r.right.motionType,
      turns: 0,
      rotationDirection: r.right.rotationDirection || "cw",
      startLocation: r.right.startLocation,
      endLocation: r.right.endLocation,
      startOrientation: rightStart,
    });
    leftOri = leftEnd;
    rightOri = rightEnd;
    return {
      letter: r.letter,
      startPlacement: r.startPlacement,
      endPlacement: r.endPlacement,
      left: { ...r.left, startOrientation: leftStart, endOrientation: leftEnd },
      right: {
        ...r.right,
        startOrientation: rightStart,
        endOrientation: rightEnd,
      },
    };
  });
}

// ============================================================================
// HAND PATH TRACING
// ============================================================================

function computeHandPathId(beats: BuiltBeat[]): string {
  const left = [
    beats[0].left.startLocation,
    ...beats.map((b) => b.left.endLocation),
  ].join("→");
  const right = [
    beats[0].right.startLocation,
    ...beats.map((b) => b.right.endLocation),
  ].join("→");
  return [left, right].sort().join("|");
}

function traceHandPath(beats: BuiltBeat[]): { left: string; right: string } {
  return {
    left: [
      beats[0].left.startLocation,
      ...beats.map((b) => b.left.endLocation),
    ].join("→"),
    right: [
      beats[0].right.startLocation,
      ...beats.map((b) => b.right.endLocation),
    ].join("→"),
  };
}

// ============================================================================
// TnD SEQUENCE BUILDER
// ============================================================================

interface TnDSequence {
  seqId: string;
  word: string;
  vtg: string;
  familyId: string;
  startPos: string;
  period: PeriodLabel;
  seed: string[];
  handPathId: string;
  beats: BuiltBeat[];
}

function buildTnDSequence(def: TnDMotionDef, rows: CsvRow[]): TnDSequence {
  const csvRows = def.beats.map((b) => findRow(rows, b));
  const beats = chainOrientations(csvRows);
  const handPathId = computeHandPathId(beats);
  const seqId = `tnd-${def.familyId}-${def.word.toLowerCase()}`;
  return {
    seqId,
    word: def.word,
    vtg: def.vtg,
    familyId: def.familyId,
    startPos: def.startPos,
    period: def.period,
    seed: def.seed,
    handPathId,
    beats,
  };
}

// ============================================================================
// FIRESTORE SHAPE
// ============================================================================

function buildFirestoreMotion(m: BuiltMotion, hand: "left" | "right") {
  return {
    motionType: m.motionType,
    rotationDirection: m.rotationDirection,
    startLocation: m.startLocation,
    endLocation: m.endLocation,
    turns: 0,
    startOrientation: m.startOrientation,
    endOrientation: m.endOrientation,
    hand,
    propType: "staff",
    gridMode: "diamond",
    isVisible: true,
    arrowLocation: m.endLocation,
  };
}

function buildFirestoreStep(beat: BuiltBeat, stepNumber: number) {
  return {
    id: randomUUID(),
    isStep: true,
    stepNumber,
    letter: beat.letter,
    startPlacement: beat.startPlacement,
    endPlacement: beat.endPlacement,
    gridMode: "diamond",
    duration: 1.0,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions: {
      left: buildFirestoreMotion(beat.left, "left"),
      right: buildFirestoreMotion(beat.right, "right"),
    },
  };
}

/**
 * The start position is a static pose at the walk's startPos, using beat-1's
 * start hand locations so the opening pose matches the walk's first beat.
 */
function buildFirestoreStartPlacement(seq: TnDSequence) {
  const first = seq.beats[0];
  const staticMotion = (loc: string, hand: "left" | "right") =>
    buildFirestoreMotion(
      {
        motionType: "static",
        rotationDirection: "noRotation",
        startLocation: loc,
        endLocation: loc,
        startOrientation: "in",
        endOrientation: "in",
      },
      hand
    );
  return {
    isStartPlacement: true,
    id: randomUUID(),
    gridPlacement: first.startPlacement,
    gridMode: "diamond",
    motions: {
      left: staticMotion(first.left.startLocation, "left"),
      right: staticMotion(first.right.startLocation, "right"),
    },
  };
}

interface FamilyMeta {
  id: string;
  label: string;
  typeCombo: string;
  sequenceIds: string[];
}

async function writeToFirestore(sequences: TnDSequence[]): Promise<void> {
  const admin = await import("firebase-admin");

  const serviceAccount = JSON.parse(
    fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8")
  );

  if (!admin.default.apps.length) {
    admin.default.initializeApp({
      credential: admin.default.credential.cert(serviceAccount),
    });
  }

  const db = admin.default.firestore();

  // Delete old sequences first
  const oldSeqsRef = db.collection(`catalogs/${DECK_ID}/sequences`);
  const oldSnap = await oldSeqsRef.get();
  if (!oldSnap.empty) {
    console.log(`Deleting ${oldSnap.size} old sequence docs...`);
    const deleteBatch = db.batch();
    for (const doc of oldSnap.docs) {
      deleteBatch.delete(doc.ref);
    }
    await deleteBatch.commit();
    console.log("Old docs deleted.");
  }

  const familySequenceIds = new Map<string, string[]>();
  const batch = db.batch();
  let batchCount = 0;

  for (const seq of sequences) {
    const ids = familySequenceIds.get(seq.familyId) ?? [];
    ids.push(seq.seqId);
    familySequenceIds.set(seq.familyId, ids);

    const firestoreSteps = seq.beats.map((beat, i) =>
      buildFirestoreStep(beat, i + 1)
    );

    const seqRef = db.doc(`catalogs/${DECK_ID}/sequences/${seq.seqId}`);
    batch.set(seqRef, {
      id: seq.seqId,
      name: seq.word,
      word: seq.word,
      gridMode: "diamond",
      isCircular: true,
      loopType: "rotated",
      sequenceLength: 4,
      level: 1,
      isFavorite: false,
      tags: ["tnd-deck", seq.familyId],
      thumbnails: [],
      steps: firestoreSteps,
      startPlacement: buildFirestoreStartPlacement(seq),
      metadata: {
        deckId: DECK_ID,
        familyId: seq.familyId,
        familyLabel: seq.vtg,
        handPathId: seq.handPathId,
        startPlacement: seq.startPos,
        seed: seq.seed.join(""),
        vtgCategory: seq.vtg,
      },
      author: "TKA System",
      notes: `TnD ${seq.vtg}: ${seq.word}`,
    });

    batchCount++;
  }

  // Write deck metadata
  const familiesMeta: FamilyMeta[] = TND_FAMILIES.map((f) => ({
    ...f,
    sequenceIds: familySequenceIds.get(f.id) ?? [],
  }));

  const deckRef = db.doc(`catalogs/${DECK_ID}`);
  batch.set(deckRef, {
    id: DECK_ID,
    name: "Level 1: TnD Motions",
    description: "The 19 fundamental TnD motion categories as rotated LOOPs.",
    families: familiesMeta,
    totalSequences: sequences.length,
    gridMode: "diamond",
    level: 1,
  });
  batchCount++;

  console.log(`Committing batch (${batchCount} ops)...`);
  await batch.commit();
  console.log(`Done! Wrote ${sequences.length} sequences to Firestore.`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log("=== Level 1 TnD Motions Deck Seeder ===\n");

  console.log("Loading CSV data...");
  const rows = loadCsv();
  console.log(`  Loaded ${rows.length} pictograph rows`);

  console.log("\nBuilding TnD sequences...");
  const sequences: TnDSequence[] = [];
  for (const def of TND_MOTIONS) {
    const seq = buildTnDSequence(def, rows);
    sequences.push(seq);
    console.log(`  #${def.id} ${def.word} (${def.vtg}, ${def.period}) ✓`);
  }

  console.log(`\nBuilt ${sequences.length}/${TND_MOTIONS.length} sequences`);

  console.log("\nFamilies:");
  for (const family of TND_FAMILIES) {
    const familySeqs = sequences.filter((s) => s.familyId === family.id);
    console.log(
      `  ${family.label} (${family.typeCombo}): ${familySeqs.length} sequences`
    );
    for (const seq of familySeqs) console.log(`    ${seq.word}`);
  }

  const handPaths = new Map<string, TnDSequence[]>();
  for (const seq of sequences) {
    const group = handPaths.get(seq.handPathId) ?? [];
    group.push(seq);
    handPaths.set(seq.handPathId, group);
  }
  console.log(
    `\n${handPaths.size} unique hand paths across ${sequences.length} sequences`
  );

  console.log("\nHand path traces:");
  let hpNum = 1;
  for (const [, seqs] of [...handPaths.entries()].sort()) {
    const trace = traceHandPath(seqs[0].beats);
    const words = seqs.map((s) => s.word).join(", ");
    console.log(
      `  #${hpNum} [${seqs[0].vtg}] — ${seqs.length} sequence(s): ${words}`
    );
    console.log(`    Hand A: ${trace.left}`);
    console.log(`    Hand B: ${trace.right}`);
    hpNum++;
  }

  if (sequences.length > 0) {
    const sample = sequences[0];
    console.log(`\nSample: ${sample.seqId}`);
    console.log(
      `  Word: ${sample.word} | VTG: ${sample.vtg} | Start: ${sample.startPos}`
    );
    sample.beats.forEach((b, i) => {
      console.log(
        `    Beat ${i + 1}: ${b.letter} ` +
          `left=${b.left.motionType}[${b.left.startLocation}→${b.left.endLocation}] ` +
          `ori=${b.left.startOrientation}→${b.left.endOrientation} | ` +
          `right=${b.right.motionType}[${b.right.startLocation}→${b.right.endLocation}] ` +
          `ori=${b.right.startOrientation}→${b.right.endOrientation}`
      );
    });
  }

  if (DRY_RUN) {
    console.log("\n--- DRY RUN — Skipping Firestore write ---");
    console.log(
      `Would write ${sequences.length} sequences in ${TND_FAMILIES.length} families`
    );
    console.log(`Firestore path: decks/${DECK_ID}`);
  } else {
    console.log("\nWriting to Firestore...");
    await writeToFirestore(sequences);
  }

  console.log(`\n--- Summary ---`);
  console.log(`Deck: ${DECK_ID}`);
  console.log(`Total sequences: ${sequences.length}`);
  console.log(`Unique hand paths: ${handPaths.size}`);
  console.log(`Families: ${TND_FAMILIES.length}`);
  console.log(`Steps per sequence: 4`);
  console.log(`Firestore path: decks/${DECK_ID}`);
}

// Exports for verification tooling (e.g. a no-regression diff harness).
// The build path is pure (CSV in → sequences out) and does not touch Firestore.
export {
  loadCsv,
  buildTnDSequence,
  buildFirestoreStep,
  buildFirestoreStartPlacement,
  TND_MOTIONS,
  DECK_ID,
};
export type { TnDSequence, TnDMotionDef, BuiltBeat };

// Only auto-run when executed directly (tsx scripts/seed-tnd-deck.ts), not when
// imported by a verification harness. Compare resolved filesystem paths so the
// check is robust to Windows drive-letter casing and file:// slash variants.
const isDirectRun = (() => {
  try {
    const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
    return (
      path.resolve(__filename) === invoked ||
      invoked.endsWith("seed-tnd-deck.ts")
    );
  } catch {
    return true;
  }
})();

if (isDirectRun) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
