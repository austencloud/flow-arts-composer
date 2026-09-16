#!/usr/bin/env node
/**
 * Generalized LOOP Deck Enumerator
 *
 * Exhaustively enumerates every valid LOOP sequence for a given configuration.
 * Deduplicates to one representative per letter-combination per start position.
 *
 * Usage:
 *   node scripts/enumerate-deck.cjs --loopType rotated --slice halved --seedLength 3 --level 1
 *   node scripts/enumerate-deck.cjs --loopType rotated --slice quartered --seedLength 2 --level 1 --dry-run
 *   node scripts/enumerate-deck.cjs --loopType rotated --slice halved --seedLength 3 --level 1 --out deck.json
 */

const fs = require("fs");
const path = require("path");
const {
  REVERSAL_PATTERNS,
  applyReversalPattern,
} = require("./apply-reversal-pattern.cjs");
const {
  buildLocationToPositionMap,
  twinSequence,
  isSelfTwin,
} = require("./twin-transform.cjs");

// CLI Argument Parsing

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const loopType = getArg("loopType");
const slice = getArg("slice");
const seedLength = parseInt(getArg("seedLength") || "0", 10);
const level = parseInt(getArg("level") || "0", 10);
const gridMode = getArg("gridMode") || "diamond";
const dryRun = hasFlag("dry-run");
const outPath = getArg("out");
const seedFirestore = hasFlag("seed-firestore");
const startPlacementsArg = getArg("startPlacements");
const reversalPattern = getArg("reversalPattern");
const twin = hasFlag("twin");
const curateN = parseInt(getArg("curate") || "0", 10);
const noWrite = hasFlag("no-write");
const allowReversals = hasFlag("allow-reversals");

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// All LOOP type values (hardcoded to avoid ES module import issues)
const ALL_LOOP_TYPES = new Set([
  "rotated",
  "mirrored",
  "swapped",
  "inverted",
  "swapped_inverted",
  "rotated_inverted",
  "mirrored_swapped",
  "mirrored_inverted",
  "rotated_swapped",
  "mirrored_rotated",
  "mirrored_inverted_rotated",
  "mirrored_swapped_inverted",
  "mirrored_rotated_inverted_swapped",
  "flipped",
  "rewound",
]);

if (!loopType || !ALL_LOOP_TYPES.has(loopType)) {
  console.error(
    `Invalid --loopType. Must be one of: ${[...ALL_LOOP_TYPES].join(", ")}`
  );
  process.exit(1);
}

if (slice !== "halved" && slice !== "quartered") {
  console.error("--slice must be 'halved' or 'quartered'");
  process.exit(1);
}

if (!seedLength || seedLength < 1) {
  console.error("--seedLength must be a positive integer");
  process.exit(1);
}

if (level < 1 || level > 3) {
  console.error("--level must be 1, 2, or 3");
  process.exit(1);
}

// Validate LOOP type + slice size combination
const QUARTERED_CAPABLE = new Set([
  "rotated",
  "rotated_swapped",
  "rotated_inverted",
  "mirrored_rotated",
  "mirrored_inverted_rotated",
  "mirrored_rotated_inverted_swapped",
]);

if (slice === "quartered" && !QUARTERED_CAPABLE.has(loopType)) {
  console.error(
    `LOOP type "${loopType}" only supports halved mode, not quartered.`
  );
  process.exit(1);
}

if (reversalPattern) {
  if (!REVERSAL_PATTERNS[reversalPattern]) {
    console.error(`Unknown reversal pattern: ${reversalPattern}`);
    console.error(`Available: ${Object.keys(REVERSAL_PATTERNS).join(", ")}`);
    process.exit(1);
  }
  const patternDef = REVERSAL_PATTERNS[reversalPattern];
  const totalBeats = seedLength * (slice === "quartered" ? 4 : 2);
  if (totalBeats % patternDef.period !== 0) {
    console.error(
      `Pattern "${reversalPattern}" (period ${patternDef.period}) incompatible with ${totalBeats}-beat sequences`
    );
    process.exit(1);
  }
}

console.log(`\nLOOP Deck Enumerator`);
console.log(`  Type: ${loopType}`);
console.log(`  Slice: ${slice}`);
console.log(`  Seed length: ${seedLength} beats`);
console.log(`  Level: ${level}`);
console.log(`  Grid: ${gridMode}`);
console.log(`  Reversal: ${reversalPattern || "continuous"}`);
console.log(`  Twin (mirror+swap): ${twin}`);
console.log(`  Dry run: ${dryRun}`);
if (outPath) console.log(`  Output: ${outPath}`);
console.log("");

// ---------------------------------------------------------------------------
// Continuous-deck reversal check
// ---------------------------------------------------------------------------

/**
 * Returns true if the beat steps contain any rotation-direction reversals.
 * Uses LOOP wrapping — beat 1's "previous" context is the tail of the sequence.
 * Skips noRotation beats (static/dash) when looking backwards.
 */
function hasReversals(beatSteps) {
  function getRotDir(step, hand) {
    const m = step.motions[hand];
    if (!m) return null;
    if (m.rotationDirection && m.rotationDirection !== "noRotation")
      return m.rotationDirection;
    if (m.motionType === "static" || m.motionType === "dash") return null;
    return m.rotationDirection || null;
  }

  function getLastValidDir(steps, endIdx, hand) {
    // Walk backwards (with wrapping) to find last non-null rotation direction
    for (let offset = 1; offset <= steps.length; offset++) {
      const idx = (endIdx - offset + steps.length) % steps.length;
      const dir = getRotDir(steps[idx], hand);
      if (dir) return dir;
    }
    return null;
  }

  for (let i = 0; i < beatSteps.length; i++) {
    for (const hand of ["left", "right"]) {
      const current = getRotDir(beatSteps[i], hand);
      if (!current) continue;
      const prev = getLastValidDir(beatSteps, i, hand);
      if (prev && prev !== current) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// CSV Loading
// ---------------------------------------------------------------------------

const CSV_PATHS = {
  diamond: path.join(
    __dirname,
    "..",
    "static",
    "data",
    "pictographs",
    "DiamondPictographDataframe.csv"
  ),
  box: path.join(
    __dirname,
    "..",
    "static",
    "data",
    "pictographs",
    "BoxPictographDataframe.csv"
  ),
  skewed: path.join(
    __dirname,
    "..",
    "static",
    "data",
    "pictographs",
    "SkewedPictographDataframe.csv"
  ),
};

const csvPath = CSV_PATHS[gridMode];
if (!csvPath || !fs.existsSync(csvPath)) {
  console.error(`No CSV found for grid mode "${gridMode}"`);
  process.exit(1);
}

const csvContent = fs.readFileSync(csvPath, "utf-8");
const csvLines = csvContent.split("\n");
const headers = csvLines[0].split(",").map((h) => h.trim());

const edges = [];
for (let i = 1; i < csvLines.length; i++) {
  const cols = csvLines[i].split(",").map((c) => c.trim());
  if (cols.length < 13 || !cols[0]) continue;

  const edge = {
    letter: cols[0],
    startPos: cols[1],
    endPos: cols[2],
    timing: cols[3],
    direction: cols[4],
    leftMotionType: cols[5],
    leftRotDir: cols[6],
    leftStartLoc: cols[7],
    leftEndLoc: cols[8],
    rightMotionType: cols[9],
    rightRotDir: cols[10],
    rightStartLoc: cols[11],
    rightEndLoc: cols[12],
  };

  // Level filtering: L1 = 0 turns only (all CSV rows are 0-turn at base)
  // Turn allocation happens separately; the CSV data is all 0-turn variations.
  // So for L1 enumeration, we use all CSV rows as-is.
  // For L2/L3, we'd need to generate turn-allocated variants — deferred for now.
  edges.push(edge);
}

// Build adjacency map: startPlacement -> [edges]
const adjacency = {};
for (const e of edges) {
  if (!adjacency[e.startPos]) adjacency[e.startPos] = [];
  adjacency[e.startPos].push(e);
}

console.log(`Loaded ${edges.length} variations from ${gridMode} CSV`);
console.log(`Adjacency map: ${Object.keys(adjacency).length} positions\n`);

// ---------------------------------------------------------------------------
// End-Position Constraint Resolution
// ---------------------------------------------------------------------------

// Since the sequence engine is an ES module, we load the position maps via
// dynamic import() inside an async IIFE. This is the only reliable way to
// consume ES modules from a CJS script.

(async function main() {
  const circularMaps =
    await import("../packages/sequence-engine/dist/loop/placement-maps/circular-placement-maps.js");
  const strictMaps =
    await import("../packages/sequence-engine/dist/loop/placement-maps/strict-loop-placement-maps.js");

  const { HALVED_LOOPS, QUARTERED_LOOPS, QUARTER_PLACEMENT_MAP_CW } =
    circularMaps;

  // For quartered LOOPs, CW-only validation set.
  // The full QUARTERED_LOOPS includes both CW and CCW. Using CW-only matches
  // the established L1 deck counting (CCW is the mirror of CW — same letter
  // combinations, just rotated the other way, so enumerating both double-counts).
  const QUARTERED_LOOPS_CW = new Set(
    Object.entries(QUARTER_PLACEMENT_MAP_CW).map(([s, e]) => `${s},${e}`)
  );

  const {
    INVERTED_LOOP_VALIDATION_SET,
    MIRRORED_LOOP_VALIDATION_SET,
    FLIPPED_LOOP_VALIDATION_SET,
    SWAPPED_LOOP_VALIDATION_SET,
    MIRRORED_SWAPPED_VALIDATION_SET,
    MIRRORED_INVERTED_VALIDATION_SET,
    ROTATED_SWAPPED_HALVED_VALIDATION_SET,
    ROTATED_SWAPPED_QUARTERED_VALIDATION_SET,
  } = strictMaps;

  /**
   * Get the validation set for a given LOOP type + slice size.
   * Returns a Set of "start,end" strings that are valid seed endpoints.
   */
  function getValidationSet(lt, sl) {
    switch (lt) {
      case "rotated":
        return sl === "quartered" ? QUARTERED_LOOPS_CW : HALVED_LOOPS;
      case "mirrored":
        return MIRRORED_LOOP_VALIDATION_SET;
      case "flipped":
        return FLIPPED_LOOP_VALIDATION_SET;
      case "swapped":
        return SWAPPED_LOOP_VALIDATION_SET;
      case "inverted":
      case "rewound":
        return INVERTED_LOOP_VALIDATION_SET;
      case "swapped_inverted":
        // Swap changes the position constraint — seed must end at swapped(start).
        // Inversion only affects motion types, not positions.
        return SWAPPED_LOOP_VALIDATION_SET;
      case "mirrored_swapped":
        return MIRRORED_SWAPPED_VALIDATION_SET;
      case "mirrored_inverted":
        return MIRRORED_INVERTED_VALIDATION_SET;
      case "rotated_swapped":
        // Swap only changes which color does what — it doesn't change the
        // position constraint. The rotation alone determines the endpoint.
        return sl === "quartered" ? QUARTERED_LOOPS_CW : HALVED_LOOPS;
      case "rotated_inverted":
        return sl === "quartered" ? QUARTERED_LOOPS_CW : HALVED_LOOPS;
      case "mirrored_rotated":
      case "mirrored_inverted_rotated":
      case "mirrored_rotated_inverted_swapped":
        // These use composed position constraints — fall back to HALVED_LOOPS
        // for halved, QUARTERED_LOOPS_CW for quartered (rotation is the base constraint)
        return sl === "quartered" ? QUARTERED_LOOPS_CW : HALVED_LOOPS;
      case "mirrored_swapped_inverted":
        // Mirror + swap + invert: inversion forces return-to-start (identity
        // end), but the mirror only composes cleanly from starts fixed under
        // both mirror and swap (beta1/beta5 — enforced via START_OVERRIDES).
        // From other starts the mirror degrades to a flip and the loop is not
        // actually MSI (fixed-point theorem).
        return INVERTED_LOOP_VALIDATION_SET;
      default:
        console.error(`No validation set for LOOP type "${lt}"`);
        process.exit(1);
    }
  }

  const validationSet = getValidationSet(loopType, slice);

  // Determine valid start positions and their required end positions.
  // Most types sample one representative per family (alpha1/beta5/gamma11).
  // Some combos are degenerate outside specific fixed points (LOOP fixed-point
  // theorem — see reference_loop_builder_seam_divergence): enumerating them
  // from the generic starts produces sequences whose declared transformation
  // isn't actually present (the c54 MSI deck shipped 40/54 unclassifiable this
  // way, 2026-07-13). Restrict those to their mathematically valid starts.
  const DEFAULT_STARTS = ["alpha1", "beta5", "gamma11"];
  const START_OVERRIDES = {
    // Mirror+swap need starts fixed under BOTH mirror and swap: beta1/beta5.
    // (Plain mirrored_swapped tolerates more starts empirically, but the
    // inverted variant degrades to a flip elsewhere.) MRIS uses the rotation
    // end (beta1↔beta5) with the same start restriction.
    mirrored_swapped_inverted: ["beta1", "beta5"],
    mirrored_rotated_inverted_swapped: ["beta1", "beta5"],
  };
  const requestedStarts = startPlacementsArg
    ? startPlacementsArg.split(",").map((s) => s.trim())
    : (START_OVERRIDES[loopType] ?? DEFAULT_STARTS);

  // Build start -> requiredEnds map from validation set.
  // A start position may have multiple valid endpoints (e.g. CW and CCW rotations).
  const startEndMap = {};
  for (const pair of validationSet) {
    const [start, end] = pair.split(",");
    if (requestedStarts.includes(start)) {
      if (!startEndMap[start]) startEndMap[start] = new Set();
      startEndMap[start].add(end);
    }
  }

  const validStarts = Object.keys(startEndMap);
  if (validStarts.length === 0) {
    console.error(
      "No valid start positions found for this LOOP type + slice combination."
    );
    console.error(`Requested: ${requestedStarts.join(", ")}`);
    process.exit(1);
  }

  console.log("Start positions and required endpoints:");
  for (const [start, ends] of Object.entries(startEndMap)) {
    console.log(`  ${start} → must end at ${[...ends].join(" or ")}`);
  }
  console.log("");

  // ---------------------------------------------------------------------------
  // Letter Types (for hand-path family grouping)
  // ---------------------------------------------------------------------------

  const TYPES = {
    A: 1,
    B: 1,
    C: 1,
    D: 1,
    E: 1,
    F: 1,
    G: 1,
    H: 1,
    I: 1,
    J: 1,
    K: 1,
    L: 1,
    M: 1,
    N: 1,
    O: 1,
    P: 1,
    Q: 1,
    R: 1,
    S: 1,
    T: 1,
    U: 1,
    V: 1,
    W: 2,
    X: 2,
    Y: 2,
    Z: 2,
    Σ: 2,
    Δ: 2,
    Θ: 2,
    Ω: 2,
    "W-": 3,
    "X-": 3,
    "Y-": 3,
    "Z-": 3,
    "Σ-": 3,
    "Δ-": 3,
    "Θ-": 3,
    "Ω-": 3,
    Φ: 4,
    Ψ: 4,
    Λ: 4,
    "Φ-": 5,
    "Ψ-": 5,
    "Λ-": 5,
    α: 6,
    β: 6,
    γ: 6,
  };

  const TYPE_NAMES = {
    1: "Dual-Shift",
    2: "Shift",
    3: "Cross-Shift",
    4: "Dash",
    5: "Dual-Dash",
    6: "Static",
  };

  // ---------------------------------------------------------------------------
  // DFS Enumeration
  // ---------------------------------------------------------------------------

  /**
   * Check if two consecutive beats have compatible rotation directions.
   */
  function rotationCompatible(prevEdge, nextEdge) {
    // noRotation is compatible with anything
    if (
      prevEdge.leftRotDir === "noRotation" ||
      nextEdge.leftRotDir === "noRotation"
    ) {
      // Check the right hand independently
      if (
        prevEdge.rightRotDir !== "noRotation" &&
        nextEdge.rightRotDir !== "noRotation"
      ) {
        return prevEdge.rightRotDir === nextEdge.rightRotDir;
      }
      return true;
    }
    if (
      prevEdge.rightRotDir === "noRotation" ||
      nextEdge.rightRotDir === "noRotation"
    ) {
      return prevEdge.leftRotDir === nextEdge.leftRotDir;
    }
    return (
      prevEdge.leftRotDir === nextEdge.leftRotDir &&
      prevEdge.rightRotDir === nextEdge.rightRotDir
    );
  }

  /**
   * Enumerate all valid seeds of the given length from a start position.
   * Uses depth-first search. Only keeps paths that end at a valid endpoint.
   *
   * @param {string} startPos - Starting grid position
   * @param {Set<string>} requiredEnds - Set of valid end positions for LOOP closure
   * @param {number} depth - Number of beats in seed
   * @returns {Array} Array of valid seeds (each is an array of edges)
   */
  function enumerateSeeds(startPos, requiredEnds, depth) {
    const results = [];

    function dfs(currentPos, pathSoFar) {
      if (pathSoFar.length === depth) {
        // Check if we've reached any valid end position
        if (requiredEnds.has(currentPos)) {
          results.push([...pathSoFar]);
        }
        return;
      }

      const neighbors = adjacency[currentPos] || [];
      for (const edge of neighbors) {
        // Check rotation continuity with previous beat
        if (
          pathSoFar.length > 0 &&
          !rotationCompatible(pathSoFar[pathSoFar.length - 1], edge)
        ) {
          continue;
        }
        pathSoFar.push(edge);
        dfs(edge.endPos, pathSoFar);
        pathSoFar.pop();
      }
    }

    dfs(startPos, []);
    return results;
  }

  // Enumerate from each start position
  let totalRawSeeds = 0;
  const allSeeds = []; // { startPos, edges[], seedWord, handPathFamily }

  for (const startPos of validStarts) {
    const requiredEnds = startEndMap[startPos];
    const seeds = enumerateSeeds(startPos, requiredEnds, seedLength);
    totalRawSeeds += seeds.length;

    for (const edgeList of seeds) {
      const seedWord = edgeList.map((e) => e.letter).join("");
      const handPathFamily = edgeList
        .map((e) => TYPE_NAMES[TYPES[e.letter] || 0] || "Unknown")
        .join("+");

      allSeeds.push({ startPos, edges: edgeList, seedWord, handPathFamily });
    }

    console.log(`  ${startPos}: ${seeds.length} raw seeds found`);
  }

  console.log(`\nTotal raw seeds: ${totalRawSeeds}`);

  // ---------------------------------------------------------------------------
  // Deduplication: one representative per (startPlacement, seedWord, motionTypeSignature)
  //
  // The same letter pair can be executed with different motion type allocations
  // (e.g. left=shift/right=static vs left=static/right=shift for the same letter).
  // These are physically distinct sequences that belong as separate deck entries.
  // This matches the L1 deck's counting method.
  // ---------------------------------------------------------------------------

  const deduped = [];
  const seen = new Set();

  for (const seed of allSeeds) {
    // One representative per letter-triplet per start position
    const key = `${seed.startPos}|${seed.seedWord}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(seed);
  }

  console.log(
    `After dedup: ${deduped.length} unique sequences (from ${totalRawSeeds} raw)`
  );

  // ---------------------------------------------------------------------------
  // Curation (--curate N): select N sequences with even coverage across
  // (handPathFamily × startPlacement) cells via deterministic round-robin —
  // pick depth-0 of every cell, then depth-1, etc., until N. Produces a
  // shippable ~54-card physical deck that samples the whole family's variety
  // rather than over-weighting the largest hand-path families.
  // ---------------------------------------------------------------------------
  if (curateN > 0 && !seedFirestore && deduped.length > curateN) {
    // Preview/JSON path only. The Firestore seed path curates AFTER the
    // continuous-reversal filter (see the pre-pass in the seeding block), because
    // curating the pre-filter pool here would leave far fewer than curateN once
    // the filter drops reversal-containing sequences at execution time.
    const cells = new Map();
    for (const s of deduped) {
      const key = `${s.handPathFamily}||${s.startPos}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(s);
    }
    const cellLists = [...cells.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map((e) => e[1]);
    const selected = [];
    if (cellLists.length >= curateN) {
      // More cells than cards: stride evenly across the full sorted cell range
      // so the sample spans the whole family×start spread (not just the
      // alphabetically-first N cells). One card per sampled cell.
      for (let i = 0; i < curateN; i++) {
        selected.push(
          cellLists[Math.floor((i * cellLists.length) / curateN)][0]
        );
      }
    } else {
      // Fewer cells than cards: round-robin by depth across all cells.
      for (let depth = 0; selected.length < curateN; depth++) {
        let advanced = false;
        for (const list of cellLists) {
          if (list.length > depth) {
            selected.push(list[depth]);
            advanced = true;
            if (selected.length >= curateN) break;
          }
        }
        if (!advanced) break;
      }
    }
    deduped.length = 0;
    deduped.push(...selected);
    console.log(
      `Curated to ${deduped.length} sequences (even coverage across ${cells.size} family×start cells)`
    );
  }

  // ---------------------------------------------------------------------------
  // Apply reversal pattern to edge-level data (for --out JSON and console display).
  // This flips motionType on the CSV edge objects and re-derives letters so that
  // seedWord, display output, and JSON all reflect post-reversal state.
  // The Firestore path does its own reversal on engine steps (for orientation calc).
  // ---------------------------------------------------------------------------

  if (reversalPattern && reversalPattern !== "continuous") {
    const patternDef = REVERSAL_PATTERNS[reversalPattern];
    for (const entry of deduped) {
      // Clone edges so mutations don't affect the global edges array or other entries
      entry.edges = entry.edges.map((e) => ({ ...e }));
      for (let i = 0; i < entry.edges.length; i++) {
        const e = entry.edges[i];
        const symbol = patternDef.sequence[i % patternDef.sequence.length];
        const leftReversed = symbol === "P" || symbol === "B";
        const rightReversed = symbol === "P" || symbol === "R";

        // Compute the reversed motion types WITHOUT mutating yet
        const newLeft = leftReversed
          ? e.leftMotionType === "pro"
            ? "anti"
            : e.leftMotionType === "anti"
              ? "pro"
              : e.leftMotionType
          : e.leftMotionType;
        const newRight = rightReversed
          ? e.rightMotionType === "pro"
            ? "anti"
            : e.rightMotionType === "anti"
              ? "pro"
              : e.rightMotionType
          : e.rightMotionType;

        // Look up the new letter from the UNMODIFIED global edges array
        const match = edges.find(
          (csvEdge) =>
            csvEdge.startPos === e.startPos &&
            csvEdge.endPos === e.endPos &&
            csvEdge.leftMotionType === newLeft &&
            csvEdge.leftStartLoc === e.leftStartLoc &&
            csvEdge.leftEndLoc === e.leftEndLoc &&
            csvEdge.rightMotionType === newRight &&
            csvEdge.rightStartLoc === e.rightStartLoc &&
            csvEdge.rightEndLoc === e.rightEndLoc
        );

        // Mutate motion types and rotation directions
        e.leftMotionType = newLeft;
        e.rightMotionType = newRight;
        if (leftReversed && (e.leftRotDir === "cw" || e.leftRotDir === "ccw")) {
          e.leftRotDir = e.leftRotDir === "cw" ? "ccw" : "cw";
        }
        if (
          rightReversed &&
          (e.rightRotDir === "cw" || e.rightRotDir === "ccw")
        ) {
          e.rightRotDir = e.rightRotDir === "cw" ? "ccw" : "cw";
        }
        if (match) e.letter = match.letter;
      }

      entry.seedWord = entry.edges.map((e) => e.letter).join("");
    }
  }

  // ---------------------------------------------------------------------------
  // Group by hand-path family
  // ---------------------------------------------------------------------------

  const groups = {};
  for (const entry of deduped) {
    if (!groups[entry.handPathFamily]) groups[entry.handPathFamily] = [];
    groups[entry.handPathFamily].push(entry);
  }

  // Sort groups by type combination (lower types first)
  const sortedGroups = Object.entries(groups).sort((a, b) => {
    const aTypes = a[1][0].edges.map((e) => TYPES[e.letter] || 99);
    const bTypes = b[1][0].edges.map((e) => TYPES[e.letter] || 99);
    for (let i = 0; i < Math.max(aTypes.length, bTypes.length); i++) {
      const diff = (aTypes[i] || 0) - (bTypes[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  // ---------------------------------------------------------------------------
  // Console Output
  // ---------------------------------------------------------------------------

  const posLabels = { alpha1: "α1", beta5: "β5", gamma11: "γ11" };

  console.log("");
  console.log(
    "╔═══════════════════════════════════════════════════════════════╗"
  );
  console.log(
    `║   LEVEL ${level} · ${slice.toUpperCase()} ${loopType.toUpperCase()} LOOP DECK`
  );
  console.log(
    `║   ${gridMode} grid · ${seedLength}-beat seed · ${seedLength * (slice === "quartered" ? 4 : 2)} total beats`
  );
  console.log(`║   Start positions: ${validStarts.join(", ")}`);
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝"
  );

  let deckNum = 1;
  for (const [family, items] of sortedGroups) {
    console.log("");
    console.log(`  ╔═══ ${family} ═══ ${items.length} sequences ═══╗`);

    for (const startPos of validStarts) {
      const subset = items.filter((i) => i.startPos === startPos);
      if (subset.length === 0) continue;

      const label = posLabels[startPos] || startPos;
      console.log(`  ║`);
      console.log(`  ║  From ${label} (${startPos}):`);

      for (const item of subset) {
        const num = String(deckNum).padStart(3, " ");
        console.log(`  ║  #${num}  ${item.seedWord}`);
        deckNum++;
      }
    }
    console.log(`  ╚${"═".repeat(58)}`);
  }

  // Summary table
  console.log("");
  console.log("═".repeat(62));
  console.log(
    `  TOTAL: ${deduped.length} unique sequences in the Level ${level} ${slice} ${loopType} Deck`
  );
  if (twin) {
    console.log(
      `  TWIN: deck will seed up to ${deduped.length * 2} cards ` +
        `(${deduped.length} generated + ${deduped.length} mirror-swap twins; ` +
        `self-twins and any reversal-filtered cards are removed at seed time).`
    );
  }
  console.log("═".repeat(62));

  // Per-start-placement summary
  console.log("");
  const colWidth =
    Math.max(...validStarts.map((s) => (posLabels[s] || s).length)) + 2;
  const headerRow = validStarts
    .map((s) => (posLabels[s] || s).padStart(colWidth))
    .join(" │");
  console.log(
    `  ┌${"─".repeat(28)}┬${validStarts.map(() => "─".repeat(colWidth + 1)).join("┬")}┬${"─".repeat(7)}┐`
  );
  console.log(`  │ Hand Path${" ".repeat(18)}│${headerRow} │ Total │`);
  console.log(
    `  ├${"─".repeat(28)}┼${validStarts.map(() => "─".repeat(colWidth + 1)).join("┼")}┼${"─".repeat(7)}┤`
  );

  for (const [family, items] of sortedGroups) {
    const counts = validStarts.map(
      (s) => items.filter((i) => i.startPos === s).length
    );
    const total = counts.reduce((a, b) => a + b, 0);
    const countCols = counts
      .map((c) => String(c).padStart(colWidth))
      .join(" │");
    console.log(
      `  │ ${family.padEnd(27)}│${countCols} │ ${String(total).padStart(5)} │`
    );
  }

  const totals = validStarts.map(
    (s) => deduped.filter((i) => i.startPos === s).length
  );
  const totalCols = totals.map((c) => String(c).padStart(colWidth)).join(" │");
  console.log(
    `  ├${"─".repeat(28)}┼${validStarts.map(() => "─".repeat(colWidth + 1)).join("┼")}┼${"─".repeat(7)}┤`
  );
  console.log(
    `  │ TOTAL${" ".repeat(22)}│${totalCols} │ ${String(deduped.length).padStart(5)} │`
  );
  console.log(
    `  └${"─".repeat(28)}┴${validStarts.map(() => "─".repeat(colWidth + 1)).join("┴")}┴${"─".repeat(7)}┘`
  );

  // ---------------------------------------------------------------------------
  // JSON Output
  // ---------------------------------------------------------------------------

  if (outPath) {
    const output = {
      metadata: {
        loopType,
        period: slice,
        seedLength,
        level,
        gridMode,
        reversalPattern: reversalPattern || "continuous",
        totalSequences: deduped.length,
        startPlacements: validStarts,
        generatedAt: new Date().toISOString(),
      },
      families: sortedGroups.map(([family, items]) => ({
        name: family,
        count: items.length,
        sequences: items.map((item) => ({
          seedWord: item.seedWord,
          startPlacement: item.startPos,
          handPathFamily: item.handPathFamily,
          path: item.edges
            .map((e) => e.startPos)
            .concat(item.edges[item.edges.length - 1].endPos),
          beats: item.edges.map((e) => ({
            letter: e.letter,
            startPos: e.startPos,
            endPos: e.endPos,
            leftMotionType: e.leftMotionType,
            leftRotDir: e.leftRotDir,
            leftStartLoc: e.leftStartLoc,
            leftEndLoc: e.leftEndLoc,
            rightMotionType: e.rightMotionType,
            rightRotDir: e.rightRotDir,
            rightStartLoc: e.rightStartLoc,
            rightEndLoc: e.rightEndLoc,
          })),
        })),
      })),
    };

    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`\nDeck written to ${outPath}`);
  }

  // ---------------------------------------------------------------------------
  // Firestore Seeding
  // ---------------------------------------------------------------------------

  if (seedFirestore) {
    const admin = require("firebase-admin");
    const { resolve } = require("path");
    const serviceAccountPath = resolve(__dirname, "../serviceAccountKey.json");
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    } catch {
      console.error("Missing serviceAccountKey.json in project root.");
      process.exit(1);
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    const db = admin.firestore();

    const totalBeats = seedLength * (slice === "quartered" ? 4 : 2);
    const deckId = `l${level}-${slice}-${loopType.replace(/_/g, "-")}${twin ? "-twin" : ""}-${totalBeats}beat${curateN > 0 ? `-c${curateN}` : ""}`;
    const sliceLabel = slice === "quartered" ? "Quartered" : "Halved";
    const loopLabel = loopType
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    // Track which sequences survive filtering so deck metadata is accurate.
    // Maps family index → set of written sequence IDs.
    const writtenByFamily = new Map();
    for (let i = 0; i < sortedGroups.length; i++) {
      writtenByFamily.set(i, new Set());
    }
    // Reverse map: seedKey → family index
    const seedToFamilyIdx = new Map();
    for (let idx = 0; idx < sortedGroups.length; idx++) {
      for (const item of sortedGroups[idx][1]) {
        seedToFamilyIdx.set(`${item.startPos}_${item.seedWord}`, idx);
      }
    }

    console.log(`\nSeeding deck "${deckId}" to Firestore...`);

    // Execute LOOP on each seed to produce full circular sequences
    const {
      loopExecutorSelector,
    } = require("../packages/sequence-engine/dist/loop/execution/LOOPExecutorSelector.js");
    const {
      deriveReversals,
    } = require("../packages/sequence-engine/dist/analysis/deriveReversals.js");
    const {
      calculateEndOrientation,
    } = require("../packages/sequence-engine/dist/core/orientation/OrientationCalculator.js");
    const {
      reduceToMinimalLoop,
    } = require("../packages/sequence-engine/dist/loop/reduction/minimal-loop-reducer.js");
    const {
      loopDetectorClass,
    } = require("../packages/sequence-engine/dist/loop/detection/LOOPDetector.js");
    // A printed deck card must unambiguously BE its declared LOOP type. Detection
    // is the round-trip check: execute the seed, then confirm the full sequence
    // classifies back as `loopType`. Rejects sequences that alias to a sibling
    // type or are unclassifiable (the MSI deck shipped 40/54 such cards). Applied
    // in the curation pre-pass so curation only ever samples genuine cards.
    const detectsAsTarget = (fullSteps) => {
      try {
        return (
          loopDetectorClass.detectLOOPType(fullSteps)?.loopType === loopType
        );
      } catch {
        return false;
      }
    };
    // Twin transform inputs: the engine's vertical-mirror location map and the
    // rotation-flip fn (reused, not hand-rolled), plus a location->position
    // table built from the same CSV the enumeration walks. The twin module is
    // pure and takes these as parameters.
    const {
      VERTICAL_MIRROR_LOCATION_MAP,
    } = require("../packages/sequence-engine/dist/loop/placement-maps/strict-loop-placement-maps.js");
    const {
      mirrorHandRotationDirection,
    } = require("../packages/sequence-engine/dist/loop/placement-maps/circular-placement-maps.js");
    const locToPos = twin ? buildLocationToPositionMap(edges) : null;
    const twinDeps = twin
      ? {
          mirrorLocationMap: VERTICAL_MIRROR_LOCATION_MAP,
          mirrorRotation: mirrorHandRotationDirection,
          locToPos,
        }
      : null;
    // Twin bookkeeping: family label -> Set of twin seq ids, plus guards.
    const twinIdsByFamily = new Map();
    const writtenSeqIds = new Set();
    let selfTwinSkipped = 0;
    let twinDupSkipped = 0;
    let twinLetterMisses = 0;
    let redundantSkipped = 0;
    const executor = loopExecutorSelector.getExecutor(loopType);

    /**
     * Convert a raw CSV edge to the engine's SequenceStep format.
     * Orientations are set by propagateOrientations() after construction.
     */
    function edgeToEngineStep(edge, beatIndex) {
      return {
        id: `beat-${beatIndex}`,
        letter: edge.letter,
        startPlacement: edge.startPos,
        endPlacement: edge.endPos,
        beatIndex,
        stepNumber: beatIndex,
        duration: 1,
        motions: {
          left: {
            motionType: edge.leftMotionType,
            rotationDirection: edge.leftRotDir,
            startLocation: edge.leftStartLoc,
            endLocation: edge.leftEndLoc,
            startOrientation: "in",
            endOrientation: "in",
            turns: 0,
            hand: "left",
          },
          right: {
            motionType: edge.rightMotionType,
            rotationDirection: edge.rightRotDir,
            startLocation: edge.rightStartLoc,
            endLocation: edge.rightEndLoc,
            startOrientation: "in",
            endOrientation: "in",
            turns: 0,
            hand: "right",
          },
        },
      };
    }

    /**
     * Propagate orientations through a sequence of steps.
     * Each step's start orientation = previous step's end orientation.
     * Each step's end orientation = calculated from motion type + turns + start.
     */
    function propagateOrientations(steps) {
      for (let i = 1; i < steps.length; i++) {
        const prev = steps[i - 1];
        const step = steps[i];

        // Chain: previous end → current start
        step.motions.left.startOrientation = prev.motions.left.endOrientation;
        step.motions.right.startOrientation = prev.motions.right.endOrientation;

        // Calculate end orientations
        step.motions.left.endOrientation = calculateEndOrientation({
          motionType: step.motions.left.motionType,
          turns: step.motions.left.turns,
          rotationDirection: step.motions.left.rotationDirection,
          startLocation: step.motions.left.startLocation,
          endLocation: step.motions.left.endLocation,
          startOrientation: step.motions.left.startOrientation,
        });

        step.motions.right.endOrientation = calculateEndOrientation({
          motionType: step.motions.right.motionType,
          turns: step.motions.right.turns,
          rotationDirection: step.motions.right.rotationDirection,
          startLocation: step.motions.right.startLocation,
          endLocation: step.motions.right.endLocation,
          startOrientation: step.motions.right.startOrientation,
        });
      }
      return steps;
    }

    /**
     * Convert an engine SequenceStep to the Firestore step format
     * (with motions.left/right nested structure).
     */
    function engineStepToFirestore(step, beat) {
      return {
        beat,
        letter: step.letter,
        startPlacement: step.startPlacement,
        endPlacement: step.endPlacement,
        leftReversal: step.leftReversal ?? false,
        rightReversal: step.rightReversal ?? false,
        motions: {
          left: {
            motionType: step.motions.left.motionType,
            rotationDirection: step.motions.left.rotationDirection,
            startLocation: step.motions.left.startLocation,
            endLocation: step.motions.left.endLocation,
            turns: step.motions.left.turns ?? 0,
            startOrientation: step.motions.left.startOrientation ?? "in",
            endOrientation: step.motions.left.endOrientation ?? "in",
            isVisible: true,
            propType: "staff",
            hand: "left",
            gridMode,
          },
          right: {
            motionType: step.motions.right.motionType,
            rotationDirection: step.motions.right.rotationDirection,
            startLocation: step.motions.right.startLocation,
            endLocation: step.motions.right.endLocation,
            turns: step.motions.right.turns ?? 0,
            startOrientation: step.motions.right.startOrientation ?? "in",
            endOrientation: step.motions.right.endOrientation ?? "in",
            isVisible: true,
            propType: "staff",
            hand: "right",
            gridMode,
          },
        },
      };
    }

    /**
     * Given an engine step (post-LOOP execution, post-reversal), find the
     * matching CSV letter by matching start position, end position, and motion
     * types for both hands. This is needed after reversal flips pro↔anti — the
     * original letter is now wrong and must be re-derived from the mutated
     * motion types.
     *
     * The edges array is the full CSV loaded at startup. We match on all six
     * fields that uniquely identify a pictograph row: startPos, endPos,
     * leftMotionType, leftStartLoc, leftEndLoc, rightMotionType, rightStartLoc,
     * rightEndLoc. Rotation direction is excluded because it can legitimately
     * vary within a letter family and is not part of the letter identity.
     *
     * Returns null if no match is found (e.g. the reversal produced a
     * physically invalid combination — caller should keep the original letter).
     *
     * @param {{ startPlacement: string, endPlacement: string, motions: { left: object, right: object } }} step
     * @returns {string|null}
     */
    function lookupLetterFromMotions(step) {
      const match = edges.find(
        (e) =>
          e.startPos === step.startPlacement &&
          e.endPos === step.endPlacement &&
          e.leftMotionType === step.motions.left.motionType &&
          e.leftStartLoc === step.motions.left.startLocation &&
          e.leftEndLoc === step.motions.left.endLocation &&
          e.rightMotionType === step.motions.right.motionType &&
          e.rightStartLoc === step.motions.right.startLocation &&
          e.rightEndLoc === step.motions.right.endLocation
      );
      return match ? match.letter : null;
    }

    // Write sequence documents in batches of 500
    // 499 not 500: in --twin mode each iteration writes TWO docs (base + twin)
    // before the flush check runs, so the batch can reach BATCH_SIZE + 1. Capping
    // at 499 guarantees the committed batch never exceeds Firestore's 500-op limit.
    const BATCH_SIZE = 499;
    let batch = db.batch();
    let batchCount = 0;
    let totalWritten = 0;
    let loopErrors = 0;

    // ── Curation pre-pass ──────────────────────────────────────────────────
    // The continuous-reversal filter in the write loop drops sequences whose
    // executed LOOP contains a rotation-direction reversal. Curating the
    // pre-filter pool leaves far fewer than curateN, so instead execute + apply
    // the same filter here to find the survivors, then curate the SURVIVORS to
    // curateN via even (family × start) coverage. chosenKeys gates the write loop.
    let chosenKeys = null;
    if (curateN > 0) {
      const survivors = [];
      for (const item of deduped) {
        const fe = item.edges[0];
        const ppStart = {
          id: "pp-start",
          letter: "x",
          startPlacement: item.startPos,
          endPlacement: item.startPos,
          beatIndex: 0,
          stepNumber: 0,
          duration: 1,
          motions: {
            left: {
              motionType: "static",
              rotationDirection: "noRotation",
              startLocation: fe.leftStartLoc,
              endLocation: fe.leftStartLoc,
              startOrientation: "in",
              endOrientation: "in",
              turns: 0,
              hand: "left",
            },
            right: {
              motionType: "static",
              rotationDirection: "noRotation",
              startLocation: fe.rightStartLoc,
              endLocation: fe.rightStartLoc,
              startOrientation: "in",
              endOrientation: "in",
              turns: 0,
              hand: "right",
            },
          },
        };
        const ppSeed = [
          ppStart,
          ...item.edges.map((e, i) => edgeToEngineStep(e, i + 1)),
        ];
        propagateOrientations(ppSeed);
        let ppFull;
        try {
          ppFull = executor.executeLOOP([...ppSeed], slice);
        } catch {
          continue;
        }
        if (
          !allowReversals &&
          (!reversalPattern || reversalPattern === "continuous") &&
          hasReversals(ppFull.slice(1))
        ) {
          continue;
        }
        if (reduceToMinimalLoop(ppFull).reduced) continue; // literal-repeat
        if (!detectsAsTarget(ppFull)) continue; // must round-trip as loopType
        survivors.push(item);
      }

      const cells = new Map();
      for (const s of survivors) {
        const key = `${s.handPathFamily}||${s.startPos}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(`${s.startPos}_${s.seedWord}`);
      }
      const cellLists = [...cells.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map((e) => e[1]);
      const chosen = [];
      if (cellLists.length >= curateN) {
        for (let i = 0; i < curateN; i++) {
          chosen.push(
            cellLists[Math.floor((i * cellLists.length) / curateN)][0]
          );
        }
      } else {
        for (let depth = 0; chosen.length < curateN; depth++) {
          let advanced = false;
          for (const list of cellLists) {
            if (list.length > depth) {
              chosen.push(list[depth]);
              advanced = true;
              if (chosen.length >= curateN) break;
            }
          }
          if (!advanced) break;
        }
      }
      chosenKeys = new Set(chosen);
      console.log(
        `Curated to ${chosenKeys.size} of ${survivors.length} ${allowReversals ? "sequences" : "continuous survivors"} (from ${deduped.length} seeds)`
      );
    }

    for (const item of deduped) {
      const seqId = `${item.startPos}_${item.seedWord}`;
      if (chosenKeys && !chosenKeys.has(seqId)) continue;
      const seqRef = db.doc(`catalogs/${deckId}/sequences/${seqId}`);

      // Build seed as engine SequenceStep array (start position + beats)
      const firstEdge = item.edges[0];
      const startStep = {
        id: `start-${seqId}`,
        letter: item.startPos.startsWith("alpha")
          ? "α"
          : item.startPos.startsWith("beta")
            ? "β"
            : "γ",
        startPlacement: item.startPos,
        endPlacement: item.startPos,
        beatIndex: 0,
        stepNumber: 0,
        duration: 1,
        motions: {
          left: {
            motionType: "static",
            rotationDirection: "noRotation",
            startLocation: firstEdge.leftStartLoc,
            endLocation: firstEdge.leftStartLoc,
            startOrientation: "in",
            endOrientation: "in",
            turns: 0,
            hand: "left",
          },
          right: {
            motionType: "static",
            rotationDirection: "noRotation",
            startLocation: firstEdge.rightStartLoc,
            endLocation: firstEdge.rightStartLoc,
            startOrientation: "in",
            endOrientation: "in",
            turns: 0,
            hand: "right",
          },
        },
      };

      const seedSteps = [
        startStep,
        ...item.edges.map((e, i) => edgeToEngineStep(e, i + 1)),
      ];

      // Propagate orientations through the seed before LOOP extension
      propagateOrientations(seedSteps);

      // Execute LOOP to extend the seed into the full circular sequence
      let fullSteps;
      try {
        fullSteps = executor.executeLOOP([...seedSteps], slice);
      } catch (err) {
        loopErrors++;
        if (loopErrors <= 5)
          console.warn(`  LOOP error for ${seqId}: ${err.message}`);
        continue;
      }

      // Reject redundant literal-repeat loops: a seed that already closes
      // before the requested period extends into a shorter closing loop copied
      // to length (the YΦΔ×4 defect). It does not belong in this target-length
      // deck — the genuine shorter loop lives in the shorter-length deck.
      if (reduceToMinimalLoop(fullSteps).reduced) {
        redundantSkipped++;
        continue;
      }

      // For continuous decks, reject sequences that contain reversals.
      const beatStepsForReversal = fullSteps.slice(1);
      if (
        !allowReversals &&
        (!reversalPattern || reversalPattern === "continuous")
      ) {
        if (hasReversals(beatStepsForReversal)) {
          continue;
        }
      }

      // Natural-reversal marking (--allow-reversals): inverted/mirrored LOOPs
      // reverse prop spin at the transformation seam. That reversal is real and
      // must render as a dot — but catalog-loader TRUSTS stored leftReversal/
      // rightReversal flags (it only derives when they are absent, and
      // engineStepToFirestore always writes them). So mark the natural reversals
      // here with the canonical detector (deriveReversals; prop channel = the dot
      // channel) so the stored flags are correct. No imposed pattern — the
      // reversals come from the executed sequence itself.
      if (
        allowReversals &&
        (!reversalPattern || reversalPattern === "continuous")
      ) {
        const revFlags = deriveReversals(fullSteps, { loop: true });
        for (let i = 0; i < beatStepsForReversal.length; i++) {
          const f = revFlags[i + 1];
          beatStepsForReversal[i].leftReversal = f
            ? f.left.propReversal
            : false;
          beatStepsForReversal[i].rightReversal = f
            ? f.right.propReversal
            : false;
        }
      }

      // Apply reversal pattern to the beat steps (all steps after the start position).
      if (reversalPattern && reversalPattern !== "continuous") {
        const patternDef = REVERSAL_PATTERNS[reversalPattern];
        for (let i = 0; i < beatStepsForReversal.length; i++) {
          const step = beatStepsForReversal[i];

          const symbol = patternDef.sequence[i % patternDef.sequence.length];
          const leftReversed = symbol === "P" || symbol === "B";
          const rightReversed = symbol === "P" || symbol === "R";

          step.leftReversal = leftReversed;
          step.rightReversal = rightReversed;

          // Apply reversal based on the CURRENT beat's motion type:
          // - pro/anti: flip motion type AND rotation direction
          // - static/dash: only flip rotation direction (type stays)
          if (leftReversed) {
            if (
              step.motions.left.motionType === "pro" ||
              step.motions.left.motionType === "anti"
            ) {
              step.motions.left.motionType =
                step.motions.left.motionType === "pro" ? "anti" : "pro";
            }
            if (
              step.motions.left.rotationDirection === "cw" ||
              step.motions.left.rotationDirection === "ccw"
            ) {
              step.motions.left.rotationDirection =
                step.motions.left.rotationDirection === "cw" ? "ccw" : "cw";
            }
          }
          if (rightReversed) {
            if (
              step.motions.right.motionType === "pro" ||
              step.motions.right.motionType === "anti"
            ) {
              step.motions.right.motionType =
                step.motions.right.motionType === "pro" ? "anti" : "pro";
            }
            if (
              step.motions.right.rotationDirection === "cw" ||
              step.motions.right.rotationDirection === "ccw"
            ) {
              step.motions.right.rotationDirection =
                step.motions.right.rotationDirection === "cw" ? "ccw" : "cw";
            }
          }

          // Re-derive the letter from the reversed motion types via CSV lookup.
          // If no match is found (reversal produced a combination not in the CSV),
          // we keep the original letter so the sequence is still usable.
          const newLetter = lookupLetterFromMotions(step);
          if (newLetter) step.letter = newLetter;
        }

        // Recalculate orientations now that motion types have been flipped.
        // The original propagation used pre-reversal motion types, so the
        // endOrientation values are wrong for reversed beats.
        propagateOrientations(fullSteps);
      }

      // The executor returns the full sequence including start position as step 0
      const sp = fullSteps[0];
      const startPlacement = {
        isStartPlacement: true,
        id: `start-${seqId}`,
        gridPlacement: sp.startPlacement,
        gridMode,
        motions: {
          left: {
            motionType: sp.motions.left.motionType,
            rotationDirection: sp.motions.left.rotationDirection,
            startLocation: sp.motions.left.startLocation,
            endLocation: sp.motions.left.endLocation,
            turns: sp.motions.left.turns ?? 0,
            startOrientation: sp.motions.left.startOrientation ?? "in",
            endOrientation: sp.motions.left.endOrientation ?? "in",
            isVisible: true,
            propType: "staff",
            hand: "left",
            gridMode,
          },
          right: {
            motionType: sp.motions.right.motionType,
            rotationDirection: sp.motions.right.rotationDirection,
            startLocation: sp.motions.right.startLocation,
            endLocation: sp.motions.right.endLocation,
            turns: sp.motions.right.turns ?? 0,
            startOrientation: sp.motions.right.startOrientation ?? "in",
            endOrientation: sp.motions.right.endOrientation ?? "in",
            isVisible: true,
            propType: "staff",
            hand: "right",
            gridMode,
          },
        },
      };

      // Steps are everything after the start position.
      // beatStepsForReversal already has reversed motion types and re-derived
      // letters applied (if --reversalPattern was passed), so we use it directly.
      const steps = beatStepsForReversal.map((step, i) =>
        engineStepToFirestore(step, i)
      );
      const fullWord = steps.map((s) => s.letter).join("");

      const seqData = {
        id: seqId,
        name: fullWord,
        word: fullWord,
        gridMode,
        isCircular: true,
        loopType: loopType,
        orientationCycleCount: slice === "quartered" ? 4 : 2,
        reversalPattern: reversalPattern || "continuous",
        sequenceLength: steps.length,
        level,
        isFavorite: false,
        tags: [],
        thumbnails: [],
        steps,
        startPlacement,
        metadata: {
          seedWord: item.seedWord,
          handPathFamily: item.handPathFamily,
        },
        author: "TKA Enumerator",
        notes: "",
      };

      batch.set(seqRef, seqData);
      batchCount++;
      totalWritten++;
      writtenSeqIds.add(seqId);

      // Track which family this sequence belongs to
      const familyIdx = seedToFamilyIdx.get(seqId);
      if (familyIdx !== undefined) writtenByFamily.get(familyIdx).add(seqId);

      // ── Twin (mirror + color swap) ─────────────────────────────────────
      if (twin) {
        // Geometry from the pure module, applied to the FULL executed steps so
        // the twin matches the rendered card exactly (not the pre-loop seed).
        const twinSteps = twinSequence(fullSteps, twinDeps);

        // Re-propagate orientations: the start step is static (in/in); the rest
        // are recomputed from the swapped/mirrored motions.
        const ts0 = twinSteps[0];
        ts0.motions.left.startOrientation = "in";
        ts0.motions.left.endOrientation = "in";
        ts0.motions.right.startOrientation = "in";
        ts0.motions.right.endOrientation = "in";
        propagateOrientations(twinSteps);

        // Re-derive letters for the beat steps from the transformed motions.
        // Seed the miss flag from the START step too: under canonical starts its
        // transformed pair is always in the CSV, but a non-canonical
        // --startPlacements could yield a null start position, which would
        // otherwise produce a "null_WORD" doc id.
        const twinBeatSteps = twinSteps.slice(1);
        let twinPositionMiss = twinSteps[0].startPlacement === null;
        for (const ts of twinBeatSteps) {
          if (ts.startPlacement === null || ts.endPlacement === null) {
            twinPositionMiss = true;
            break;
          }
          const L = lookupLetterFromMotions(ts);
          if (L) ts.letter = L;
          else twinLetterMisses++;
        }

        // Skip if any beat's mirrored hand pair was absent from the CSV
        // (physically invalid twin — should not occur for valid grid mirrors).
        if (twinPositionMiss) {
          // counted via guard below; treat like a dup-skip for reporting
          twinDupSkipped++;
        } else if (isSelfTwin(fullSteps, twinSteps)) {
          // Self-twin: a card equal to its own mirror-swap. Excluded by design.
          selfTwinSkipped++;
        } else {
          const twinStartPos = twinSteps[0].startPlacement;
          const twinWord = twinBeatSteps.map((s) => s.letter).join("");
          const twinSeqId = `${twinStartPos}_${twinWord}`;

          if (writtenSeqIds.has(twinSeqId)) {
            // Cross-duplicate guard (expected count 0: twin starts are disjoint
            // from generated starts under canonical start positions).
            twinDupSkipped++;
          } else {
            // Build the twin start position doc in the same shape as the base.
            const tsp = twinSteps[0];
            const twinStartPlacement = {
              isStartPlacement: true,
              id: `start-${twinSeqId}`,
              gridPlacement: tsp.startPlacement,
              gridMode,
              motions: {
                left: {
                  motionType: tsp.motions.left.motionType,
                  rotationDirection: tsp.motions.left.rotationDirection,
                  startLocation: tsp.motions.left.startLocation,
                  endLocation: tsp.motions.left.endLocation,
                  turns: tsp.motions.left.turns ?? 0,
                  startOrientation: tsp.motions.left.startOrientation ?? "in",
                  endOrientation: tsp.motions.left.endOrientation ?? "in",
                  isVisible: true,
                  propType: "staff",
                  hand: "left",
                  gridMode,
                },
                right: {
                  motionType: tsp.motions.right.motionType,
                  rotationDirection: tsp.motions.right.rotationDirection,
                  startLocation: tsp.motions.right.startLocation,
                  endLocation: tsp.motions.right.endLocation,
                  turns: tsp.motions.right.turns ?? 0,
                  startOrientation: tsp.motions.right.startOrientation ?? "in",
                  endOrientation: tsp.motions.right.endOrientation ?? "in",
                  isVisible: true,
                  propType: "staff",
                  hand: "right",
                  gridMode,
                },
              },
            };

            const twinFsSteps = twinBeatSteps.map((s, i) =>
              engineStepToFirestore(s, i)
            );

            const twinSeqData = {
              id: twinSeqId,
              name: twinWord,
              word: twinWord,
              gridMode,
              isCircular: true,
              loopType: loopType,
              orientationCycleCount: slice === "quartered" ? 4 : 2,
              reversalPattern: reversalPattern || "continuous",
              sequenceLength: twinFsSteps.length,
              level,
              isFavorite: false,
              tags: [],
              thumbnails: [],
              steps: twinFsSteps,
              startPlacement: twinStartPlacement,
              metadata: {
                seedWord: twinBeatSteps
                  .slice(0, seedLength)
                  .map((s) => s.letter)
                  .join(""),
                handPathFamily: twinBeatSteps
                  .slice(0, seedLength)
                  .map((s) => TYPE_NAMES[TYPES[s.letter] || 0] || "Unknown")
                  .join("+"),
              },
              author: "TKA Enumerator",
              notes: "",
            };

            const twinRef = db.doc(`catalogs/${deckId}/sequences/${twinSeqId}`);
            batch.set(twinRef, twinSeqData);
            batchCount++;
            totalWritten++;
            writtenSeqIds.add(twinSeqId);

            const fam = twinSeqData.metadata.handPathFamily;
            if (!twinIdsByFamily.has(fam)) twinIdsByFamily.set(fam, new Set());
            twinIdsByFamily.get(fam).add(twinSeqId);
          }
        }
      }

      if (batchCount >= BATCH_SIZE) {
        // Guard the mid-loop flush too — without this, --no-write still wrote
        // every full batch and only spared the final partial one.
        if (!noWrite) await batch.commit();
        console.log(
          `  ${noWrite ? "[no-write] would write" : "Written"} ${totalWritten}/${deduped.length} sequences...`
        );
        batch = db.batch();
        batchCount = 0;
      }
    }

    // Flush remaining
    if (!noWrite && batchCount > 0) {
      await batch.commit();
    }

    // Build deck metadata with only the sequences that survived filtering
    const familyDocs = sortedGroups
      .map(([family], idx) => {
        const ids = [...writtenByFamily.get(idx)];
        return {
          id: `family-${idx}`,
          label: family,
          typeCombo: family,
          sequenceIds: ids,
        };
      })
      .filter((f) => f.sequenceIds.length > 0);

    // Fold twin cards into family docs: same-label families merge; new labels
    // become additional family docs so the Decks UI surfaces every twin.
    if (twin) {
      let twinFamilyIdx = 0;
      for (const [label, idSet] of twinIdsByFamily) {
        const existing = familyDocs.find((f) => f.label === label);
        if (existing) {
          existing.sequenceIds.push(...idSet);
        } else {
          familyDocs.push({
            id: `family-twin-${twinFamilyIdx++}`,
            label,
            typeCombo: label,
            sequenceIds: [...idSet],
          });
        }
      }
    }

    const deckData = {
      name: `Level ${level}: ${sliceLabel} ${loopLabel} LOOP · ${totalBeats}-count${curateN > 0 ? ` · ${curateN}-card` : ""}${twin ? " · Twin" : ""}`,
      description: twin
        ? `${sliceLabel} ${loopLabel} LOOP, Twin edition: each card paired with its mirror-swap (vertical mirror + color swap), self-twins excluded. ${totalWritten} sequences across ${familyDocs.length} hand-path families.`
        : `Complete enumeration of all L${level} ${slice} ${loopLabel} LOOP sequences. ${totalWritten} sequences across ${familyDocs.length} hand-path families.`,
      families: familyDocs,
      totalSequences: totalWritten,
      gridMode,
      level,
      collection: "LOOPs",
      loopType,
      sliceType: slice,
      stepCount: seedLength * (slice === "quartered" ? 4 : 2),
      turnPattern: "0-turn",
      reversalPattern: reversalPattern || "continuous",
    };

    if (!noWrite) await db.doc(`catalogs/${deckId}`).set(deckData);
    console.log(
      noWrite
        ? `  [no-write] deck doc NOT written (preview)`
        : `  Deck document written`
    );
    console.log(
      `  Done! ${totalWritten} sequences written to decks/${deckId}/sequences/`
    );
    if (totalWritten < deduped.length) {
      console.log(
        `  Filtered out ${deduped.length - totalWritten} sequences with reversals (continuous deck)`
      );
    }
    if (redundantSkipped > 0) {
      console.log(
        `  Skipped ${redundantSkipped} redundant literal-repeat sequence(s) (collapse to a shorter closing loop)`
      );
    }
    if (twin) {
      console.log(
        `  Twin: ${twinIdsByFamily.size} twin family group(s); ` +
          `${selfTwinSkipped} self-twin(s) excluded; ` +
          `${twinDupSkipped} twin(s) skipped (duplicate or invalid mirror); ` +
          `${twinLetterMisses} twin beat(s) kept an un-re-derived letter.`
      );
    }
  }

  if (!outPath && !seedFirestore) {
    console.log(
      "\nUse --out <path> to save as JSON or --seed-firestore to write to Firestore."
    );
  }
})();
