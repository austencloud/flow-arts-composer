#!/usr/bin/env node
/**
 * L2 Halved Rotated LOOP Deck — Canonical Enumeration + Turn Allocation
 *
 * Enumerates all 4-step halved rotated LOOPs in diamond mode,
 * canonicalizes to unique hand paths (collapsing circular-rotation
 * equivalents), cross-references VTG, and assigns L2 turns (max 1/beat).
 *
 * Usage:
 *   node scripts/seed-l2-halved-rotated-deck.cjs --dry-run
 *   node scripts/seed-l2-halved-rotated-deck.cjs --out deck.json
 *   node scripts/seed-l2-halved-rotated-deck.cjs --seed-firestore
 */

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const seedFirestore = args.includes("--seed-firestore");
const outIdx = args.indexOf("--out");
const outPath = outIdx !== -1 ? args[outIdx + 1] : null;

const GRID_MODE = "diamond";
const SEED_LENGTH = 2;
const LEVEL = 2;
const MAX_TURNS = 1;
const DEFAULT_STARTS = ["alpha1", "beta5", "gamma11"];
const DECK_ID = "l2-halved-rotated-4beat-t1";

// CSV Loading

const CSV_PATH = path.join(
  __dirname,
  "..",
  "static",
  "data",
  "pictographs",
  "DiamondPictographDataframe.csv"
);

const csvContent = fs.readFileSync(CSV_PATH, "utf-8");
const csvLines = csvContent.split("\n");
const headers = csvLines[0].split(",").map((h) => h.trim());

const edges = [];
for (let i = 1; i < csvLines.length; i++) {
  const cols = csvLines[i].split(",").map((c) => c.trim());
  if (cols.length < 13 || !cols[0]) continue;
  edges.push({
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
  });
}

const adjacency = {};
for (const e of edges) {
  if (!adjacency[e.startPos]) adjacency[e.startPos] = [];
  adjacency[e.startPos].push(e);
}

console.log(`Loaded ${edges.length} edges from CSV`);

// ============================================================================
// Letter Types
// ============================================================================

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

// ============================================================================
// Reversal Check (continuous deck — no direction reversals allowed)
// ============================================================================

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

// ============================================================================
// DFS Seed Enumeration
// ============================================================================

function rotationCompatible(prevEdge, nextEdge) {
  if (
    prevEdge.leftRotDir === "noRotation" ||
    nextEdge.leftRotDir === "noRotation"
  ) {
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

function enumerateSeeds(startPos, requiredEnds) {
  const results = [];
  function dfs(currentPos, pathSoFar) {
    if (pathSoFar.length === SEED_LENGTH) {
      if (requiredEnds.has(currentPos)) results.push([...pathSoFar]);
      return;
    }
    const neighbors = adjacency[currentPos] || [];
    for (const edge of neighbors) {
      if (
        pathSoFar.length > 0 &&
        !rotationCompatible(pathSoFar[pathSoFar.length - 1], edge)
      )
        continue;
      pathSoFar.push(edge);
      dfs(edge.endPos, pathSoFar);
      pathSoFar.pop();
    }
  }
  dfs(startPos, []);
  return results;
}

// ============================================================================
// Canonical Fingerprinting
// ============================================================================

function compareLetterArrays(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function minCircularRotation(letterArray) {
  let min = letterArray;
  for (let i = 1; i < letterArray.length; i++) {
    const rotated = [...letterArray.slice(i), ...letterArray.slice(0, i)];
    if (compareLetterArrays(rotated, min) < 0) min = rotated;
  }
  return min;
}

function canonicalFingerprint(letterArray) {
  return minCircularRotation(letterArray).join("|");
}

// ============================================================================
// VTG Canonical Set (16 unique from 19 VTG motions)
// ============================================================================

const VTG_WORDS = [
  ["A", "A", "A", "A"],
  ["B", "B", "B", "B"],
  ["C", "C", "C", "C"],
  ["G", "G", "G", "G"],
  ["H", "H", "H", "H"],
  ["I", "I", "I", "I"],
  ["S", "S", "S", "S"],
  ["T", "T", "T", "T"],
  ["U", "U", "U", "U"],
  ["V", "V", "V", "V"],
  ["J", "D", "J", "D"],
  ["K", "E", "K", "E"],
  ["L", "F", "L", "F"],
  ["D", "J", "D", "J"],
  ["E", "K", "E", "K"],
  ["F", "L", "F", "L"],
  ["M", "P", "M", "P"],
  ["N", "Q", "N", "Q"],
  ["O", "R", "O", "R"],
];

const VTG_CANONICAL = new Set(VTG_WORDS.map((w) => canonicalFingerprint(w)));

console.log(`VTG canonical fingerprints: ${VTG_CANONICAL.size}`);

// ============================================================================
// Main (async for ES module imports)
// ============================================================================

(async function main() {
  // Import position maps + LOOP executor
  const circularMaps =
    await import("../packages/sequence-engine/dist/loop/placement-maps/circular-placement-maps.js");
  const { HALVED_LOOPS } = circularMaps;

  const { loopExecutorSelector } =
    await import("../packages/sequence-engine/dist/loop/execution/LOOPExecutorSelector.js");
  const { calculateEndOrientation } =
    await import("../packages/sequence-engine/dist/core/orientation/OrientationCalculator.js");
  const executor = loopExecutorSelector.getExecutor("rotated");

  // Build start→end map
  const startEndMap = {};
  for (const pair of HALVED_LOOPS) {
    const [start, end] = pair.split(",");
    if (DEFAULT_STARTS.includes(start)) {
      if (!startEndMap[start]) startEndMap[start] = new Set();
      startEndMap[start].add(end);
    }
  }

  const validStarts = Object.keys(startEndMap);
  console.log(`\nValid starts: ${validStarts.join(", ")}`);
  for (const [s, ends] of Object.entries(startEndMap)) {
    console.log(`  ${s} → ${[...ends].join(" or ")}`);
  }

  // ========================================================================
  // Phase 1: DFS Enumerate + Seed Dedup
  // ========================================================================

  const allSeeds = [];
  const seedSeen = new Set();

  for (const startPos of validStarts) {
    const seeds = enumerateSeeds(startPos, startEndMap[startPos]);
    for (const edgeList of seeds) {
      const seedWord = edgeList.map((e) => e.letter).join("");
      const key = `${startPos}|${seedWord}`;
      if (seedSeen.has(key)) continue;
      seedSeen.add(key);
      allSeeds.push({ startPos, edges: edgeList, seedWord });
    }
    console.log(
      `  ${startPos}: ${seeds.length} raw → ${allSeeds.filter((s) => s.startPos === startPos).length} deduped`
    );
  }

  console.log(`\nTotal deduped seeds: ${allSeeds.length}`);

  // ========================================================================
  // Phase 2: Execute LOOP for each seed → full 4-beat sequences
  // ========================================================================

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

  function propagateOrientations(steps) {
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1];
      const step = steps[i];
      step.motions.left.startOrientation = prev.motions.left.endOrientation;
      step.motions.right.startOrientation = prev.motions.right.endOrientation;
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

  const fullSequences = []; // { seed, fullSteps, fullWord, letterArray }
  let loopErrors = 0;

  for (const seed of allSeeds) {
    const firstEdge = seed.edges[0];
    const startStep = {
      id: `start`,
      letter: seed.startPos.startsWith("alpha")
        ? "α"
        : seed.startPos.startsWith("beta")
          ? "β"
          : "γ",
      startPlacement: seed.startPos,
      endPlacement: seed.startPos,
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
      ...seed.edges.map((e, i) => edgeToEngineStep(e, i + 1)),
    ];
    propagateOrientations(seedSteps);

    let fullSteps;
    try {
      fullSteps = executor.executeLOOP([...seedSteps], "halved");
    } catch (err) {
      loopErrors++;
      if (loopErrors <= 3)
        console.warn(
          `  LOOP error for ${seed.startPos}/${seed.seedWord}: ${err.message}`
        );
      continue;
    }

    const beatSteps = fullSteps.slice(1);
    if (hasReversals(beatSteps)) continue;

    const letterArray = beatSteps.map((s) => s.letter);
    const fullWord = letterArray.join("");

    fullSequences.push({
      seed,
      fullSteps,
      beatSteps,
      fullWord,
      letterArray,
      handPathFamily: seed.edges
        .map((e) => TYPE_NAMES[TYPES[e.letter] || 0] || "?")
        .join("+"),
    });
  }

  if (loopErrors) console.log(`  ${loopErrors} LOOP execution errors`);
  console.log(
    `After LOOP execution + reversal filter: ${fullSequences.length} valid sequences`
  );

  // ========================================================================
  // Phase 3: Canonical Fingerprinting + Dedup
  // ========================================================================

  const canonicalGroups = new Map(); // fingerprint → [sequences]
  for (const seq of fullSequences) {
    const fp = canonicalFingerprint(seq.letterArray);
    if (!canonicalGroups.has(fp)) canonicalGroups.set(fp, []);
    canonicalGroups.get(fp).push(seq);
  }

  // Pick one representative per canonical group (prefer alpha1, then beta5, then gamma11)
  const START_PRIORITY = { alpha1: 0, beta5: 1, gamma11: 2 };
  const canonicals = [];

  for (const [fp, members] of canonicalGroups) {
    members.sort(
      (a, b) =>
        (START_PRIORITY[a.seed.startPos] ?? 99) -
        (START_PRIORITY[b.seed.startPos] ?? 99)
    );
    const rep = members[0];
    const isVTG = VTG_CANONICAL.has(fp);
    canonicals.push({
      fingerprint: fp,
      representative: rep,
      allMembers: members,
      memberCount: members.length,
      isVTG,
    });
  }

  canonicals.sort((a, b) => {
    if (a.isVTG !== b.isVTG) return a.isVTG ? 1 : -1; // non-VTG first
    return a.fingerprint.localeCompare(b.fingerprint);
  });

  const vtgCount = canonicals.filter((c) => c.isVTG).length;
  const newCount = canonicals.length - vtgCount;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  CANONICAL HAND PATHS: ${canonicals.length} total`);
  console.log(`    VTG overlaps: ${vtgCount}`);
  console.log(`    New (non-VTG): ${newCount}`);
  console.log(`${"═".repeat(60)}`);

  // ========================================================================
  // Phase 4: Turn Allocation (L2, max 1 per beat per hand)
  // ========================================================================

  /**
   * Try all 2^4 turn assignments on the 2-beat seed (blue0, red0, blue1, red1).
   * LOOP mirrors seed turns to second half. Check orientation circularity.
   * Return assignment with max total turns, or null if none valid with turns.
   */
  function findBestTurnAssignment(seq) {
    const { fullSteps } = seq.representative;
    const beatSteps = fullSteps.slice(1);
    let bestAssignment = null;
    let bestTotalTurns = -1;

    // 2^4 = 16 combinations for 2-beat seed (blue/red on each beat)
    for (let mask = 0; mask < 16; mask++) {
      const seedTurns = [
        { left: (mask >> 0) & 1, right: (mask >> 1) & 1 },
        { left: (mask >> 2) & 1, right: (mask >> 3) & 1 },
      ];

      // Mirror seed turns to second half (halved LOOP)
      const allTurns = [seedTurns[0], seedTurns[1], seedTurns[0], seedTurns[1]];

      const totalTurns = allTurns.reduce((s, t) => s + t.left + t.right, 0);
      if (totalTurns <= bestTotalTurns) continue; // skip if not better

      // Clone beat steps and apply turns
      const testSteps = beatSteps.map((step, i) => ({
        ...step,
        motions: {
          left: { ...step.motions.left, turns: allTurns[i].left },
          right: { ...step.motions.right, turns: allTurns[i].right },
        },
      }));

      // Propagate orientations from "in"
      let leftOri = "in";
      let rightOri = "in";
      for (const step of testSteps) {
        step.motions.left.startOrientation = leftOri;
        step.motions.right.startOrientation = rightOri;
        step.motions.left.endOrientation = calculateEndOrientation({
          motionType: step.motions.left.motionType,
          turns: step.motions.left.turns,
          rotationDirection: step.motions.left.rotationDirection,
          startLocation: step.motions.left.startLocation,
          endLocation: step.motions.left.endLocation,
          startOrientation: leftOri,
        });
        step.motions.right.endOrientation = calculateEndOrientation({
          motionType: step.motions.right.motionType,
          turns: step.motions.right.turns,
          rotationDirection: step.motions.right.rotationDirection,
          startLocation: step.motions.right.startLocation,
          endLocation: step.motions.right.endLocation,
          startOrientation: rightOri,
        });
        leftOri = step.motions.left.endOrientation;
        rightOri = step.motions.right.endOrientation;
      }

      // Check circularity: end orientation must match start ("in")
      if (leftOri === "in" && rightOri === "in") {
        bestAssignment = allTurns;
        bestTotalTurns = totalTurns;
      }
    }

    return (
      bestAssignment || [
        { left: 0, right: 0 },
        { left: 0, right: 0 },
        { left: 0, right: 0 },
        { left: 0, right: 0 },
      ]
    );
  }

  // Compute turn assignments for all canonicals
  for (const canon of canonicals) {
    canon.turnAssignment = findBestTurnAssignment(canon);
    canon.totalTurns = canon.turnAssignment.reduce(
      (s, t) => s + t.left + t.right,
      0
    );
  }

  // ========================================================================
  // Phase 5: Console Output
  // ========================================================================

  console.log(
    "\n╔═══════════════════════════════════════════════════════════════╗"
  );
  console.log(`║   L${LEVEL} HALVED ROTATED LOOP DECK (max T${MAX_TURNS})`);
  console.log(
    `║   ${GRID_MODE} grid · 4 beats · ${canonicals.length} canonical hand paths`
  );
  console.log(`║   VTG overlaps: ${vtgCount} · New: ${newCount}`);
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝"
  );

  // Group by hand-path family
  const familyGroups = {};
  for (const canon of canonicals) {
    const family = canon.representative.handPathFamily;
    if (!familyGroups[family]) familyGroups[family] = [];
    familyGroups[family].push(canon);
  }

  let num = 1;
  for (const [family, members] of Object.entries(familyGroups).sort()) {
    const vtgInFamily = members.filter((m) => m.isVTG).length;
    const newInFamily = members.length - vtgInFamily;
    console.log(
      `\n  ═══ ${family} ═══ ${members.length} canonical (${vtgInFamily} VTG, ${newInFamily} new) ═══`
    );
    for (const canon of members) {
      const rep = canon.representative;
      const tag = canon.isVTG ? " [VTG]" : " [NEW]";
      const turnStr = canon.turnAssignment
        .map((t) => `${t.left}${t.right}`)
        .join(" ");
      console.log(
        `  #${String(num).padStart(3)} ${rep.fullWord.padEnd(12)} from ${rep.seed.startPos.padEnd(8)}` +
          ` turns=[${turnStr}] total=${canon.totalTurns}${tag}` +
          ` (${canon.memberCount} variant${canon.memberCount > 1 ? "s" : ""})`
      );
      num++;
    }
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  DECK SUMMARY`);
  console.log(`  Total canonical hand paths: ${canonicals.length}`);
  console.log(`  VTG overlaps: ${vtgCount}`);
  console.log(`  New (non-VTG): ${newCount}`);
  console.log(
    `  Turn stats: min=${Math.min(...canonicals.map((c) => c.totalTurns))} max=${Math.max(...canonicals.map((c) => c.totalTurns))} avg=${(canonicals.reduce((s, c) => s + c.totalTurns, 0) / canonicals.length).toFixed(1)}`
  );

  // Family breakdown
  console.log(`\n  By family:`);
  for (const [family, members] of Object.entries(familyGroups).sort()) {
    console.log(
      `    ${family}: ${members.length} (${members.filter((m) => m.isVTG).length} VTG)`
    );
  }
  console.log(`${"═".repeat(60)}`);

  // ========================================================================
  // Phase 6: JSON Output
  // ========================================================================

  if (outPath) {
    const output = {
      metadata: {
        deckId: DECK_ID,
        level: LEVEL,
        maxTurnIntensity: MAX_TURNS,
        loopType: "rotated",
        sliceType: "halved",
        stepCount: 4,
        gridMode: GRID_MODE,
        totalCanonical: canonicals.length,
        vtgOverlaps: vtgCount,
        newHandPaths: newCount,
        generatedAt: new Date().toISOString(),
      },
      canonicalHandPaths: canonicals.map((c) => ({
        fingerprint: c.fingerprint,
        fullWord: c.representative.fullWord,
        startPlacement: c.representative.seed.startPos,
        handPathFamily: c.representative.handPathFamily,
        isVTG: c.isVTG,
        turnAssignment: c.turnAssignment,
        totalTurns: c.totalTurns,
        variantCount: c.memberCount,
        variants: c.allMembers.map((m) => ({
          startPos: m.seed.startPos,
          seedWord: m.seed.seedWord,
          fullWord: m.fullWord,
        })),
      })),
    };
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`\nJSON written to ${outPath}`);
  }

  // ========================================================================
  // Phase 7: Firestore Seeding
  // ========================================================================

  if (seedFirestore) {
    const admin = require("firebase-admin");
    const serviceAccountPath = path.resolve(
      __dirname,
      "../serviceAccountKey.json"
    );
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

    console.log(`\nSeeding deck "${DECK_ID}" to Firestore...`);

    // Delete old sequences
    const oldRef = db.collection(`catalogs/${DECK_ID}/sequences`);
    const oldSnap = await oldRef.get();
    if (!oldSnap.empty) {
      console.log(`  Deleting ${oldSnap.size} old docs...`);
      const delBatch = db.batch();
      for (const doc of oldSnap.docs) delBatch.delete(doc.ref);
      await delBatch.commit();
    }

    let batch = db.batch();
    let batchCount = 0;
    let totalWritten = 0;

    for (const canon of canonicals) {
      const rep = canon.representative;
      const turns = canon.turnAssignment;
      const beatSteps = rep.beatSteps;

      // Apply turn assignment to beat steps
      const stepsWithTurns = beatSteps.map((step, i) => ({
        ...step,
        motions: {
          left: { ...step.motions.left, turns: turns[i].left },
          right: { ...step.motions.right, turns: turns[i].right },
        },
      }));

      // Re-propagate orientations with turns
      let leftOri = "in";
      let rightOri = "in";
      for (const step of stepsWithTurns) {
        step.motions.left.startOrientation = leftOri;
        step.motions.right.startOrientation = rightOri;
        step.motions.left.endOrientation = calculateEndOrientation({
          motionType: step.motions.left.motionType,
          turns: step.motions.left.turns,
          rotationDirection: step.motions.left.rotationDirection,
          startLocation: step.motions.left.startLocation,
          endLocation: step.motions.left.endLocation,
          startOrientation: leftOri,
        });
        step.motions.right.endOrientation = calculateEndOrientation({
          motionType: step.motions.right.motionType,
          turns: step.motions.right.turns,
          rotationDirection: step.motions.right.rotationDirection,
          startLocation: step.motions.right.startLocation,
          endLocation: step.motions.right.endLocation,
          startOrientation: rightOri,
        });
        leftOri = step.motions.left.endOrientation;
        rightOri = step.motions.right.endOrientation;
      }

      // Build Firestore document
      const sp = rep.fullSteps[0];
      const seqId = `${rep.seed.startPos}_${rep.fullWord}`;
      const seqRef = db.doc(`catalogs/${DECK_ID}/sequences/${seqId}`);

      const firestoreSteps = stepsWithTurns.map((step, i) => ({
        beat: i,
        letter: step.letter,
        startPlacement: step.startPlacement,
        endPlacement: step.endPlacement,
        leftReversal: false,
        rightReversal: false,
        motions: {
          left: {
            motionType: step.motions.left.motionType,
            rotationDirection: step.motions.left.rotationDirection,
            startLocation: step.motions.left.startLocation,
            endLocation: step.motions.left.endLocation,
            turns: step.motions.left.turns,
            startOrientation: step.motions.left.startOrientation,
            endOrientation: step.motions.left.endOrientation,
            isVisible: true,
            propType: "staff",
            hand: "left",
            gridMode: GRID_MODE,
          },
          right: {
            motionType: step.motions.right.motionType,
            rotationDirection: step.motions.right.rotationDirection,
            startLocation: step.motions.right.startLocation,
            endLocation: step.motions.right.endLocation,
            turns: step.motions.right.turns,
            startOrientation: step.motions.right.startOrientation,
            endOrientation: step.motions.right.endOrientation,
            isVisible: true,
            propType: "staff",
            hand: "right",
            gridMode: GRID_MODE,
          },
        },
      }));

      const startPlacement = {
        isStartPlacement: true,
        id: `start-${seqId}`,
        gridPlacement: sp.startPlacement,
        gridMode: GRID_MODE,
        motions: {
          left: {
            motionType: sp.motions.left.motionType,
            rotationDirection: sp.motions.left.rotationDirection,
            startLocation: sp.motions.left.startLocation,
            endLocation: sp.motions.left.endLocation,
            turns: 0,
            startOrientation: "in",
            endOrientation: "in",
            isVisible: true,
            propType: "staff",
            hand: "left",
            gridMode: GRID_MODE,
          },
          right: {
            motionType: sp.motions.right.motionType,
            rotationDirection: sp.motions.right.rotationDirection,
            startLocation: sp.motions.right.startLocation,
            endLocation: sp.motions.right.endLocation,
            turns: 0,
            startOrientation: "in",
            endOrientation: "in",
            isVisible: true,
            propType: "staff",
            hand: "right",
            gridMode: GRID_MODE,
          },
        },
      };

      const seqData = {
        id: seqId,
        name: rep.fullWord,
        word: rep.fullWord,
        canonicalHandPath: canon.fingerprint,
        gridMode: GRID_MODE,
        isCircular: true,
        loopType: "rotated",
        orientationCycleCount: 2,
        reversalPattern: "continuous",
        sequenceLength: 4,
        level: LEVEL,
        isFavorite: false,
        tags: canon.isVTG ? ["vtg-overlap"] : [],
        thumbnails: [],
        steps: firestoreSteps,
        startPlacement,
        metadata: {
          deckId: DECK_ID,
          canonicalFingerprint: canon.fingerprint,
          handPathFamily: rep.handPathFamily,
          isVTG: canon.isVTG,
          turnAssignment: canon.turnAssignment,
          totalTurns: canon.totalTurns,
          variantCount: canon.memberCount,
        },
        author: "TKA Enumerator",
        notes: "",
      };

      batch.set(seqRef, seqData);
      batchCount++;
      totalWritten++;

      if (batchCount >= 500) {
        await batch.commit();
        console.log(`  Written ${totalWritten}/${canonicals.length}...`);
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) await batch.commit();

    // Build family metadata
    const familyMeta = Object.entries(familyGroups).map(
      ([family, members]) => ({
        id: family.toLowerCase().replace(/[+\s]/g, "-"),
        label: family,
        sequenceIds: members.map(
          (m) =>
            `${m.representative.seed.startPos}_${m.representative.fullWord}`
        ),
      })
    );

    const deckData = {
      id: DECK_ID,
      name: `Level 2: Halved Rotated LOOP (T1)`,
      description: `${canonicals.length} canonical hand paths for 4-step halved rotated LOOPs. Max 1 turn per beat. ${vtgCount} VTG overlaps, ${newCount} new patterns.`,
      families: familyMeta,
      totalSequences: totalWritten,
      gridMode: GRID_MODE,
      level: LEVEL,
      collection: "LOOPs",
      loopType: "rotated",
      sliceType: "halved",
      stepCount: 4,
      maxTurnIntensity: MAX_TURNS,
      turnPattern: "l2-t1",
      reversalPattern: "continuous",
      vtgOverlapCount: vtgCount,
      newHandPathCount: newCount,
    };

    await db.doc(`catalogs/${DECK_ID}`).set(deckData);
    console.log(
      `  Deck doc written. ${totalWritten} sequences in decks/${DECK_ID}/`
    );
  }

  if (!outPath && !seedFirestore) {
    console.log(
      "\nUse --out <path> for JSON or --seed-firestore to write to Firestore."
    );
  }
})();
