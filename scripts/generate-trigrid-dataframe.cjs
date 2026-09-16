/**
 * Trigrid Pictograph Dataframe Generator
 *
 * Generates TrigridPictographDataframe.csv for the 3-point equilateral triangle grid.
 *
 * Trigrid alphabet (22 letters):
 *   Type 1 (Dual-Shift): G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V
 *   Type 2 (Shift):       W, X, Y, Z
 *   Type 6 (Static):      β, γ
 *
 * Position space (upright mode):
 *   Beta:  beta1 (N,N), beta2 (SE,SE), beta3 (SW,SW)
 *   Gamma: gamma1 (N,SE), gamma2 (SE,N), gamma3 (N,SW),
 *          gamma4 (SW,N), gamma5 (SE,SW), gamma6 (SW,SE)
 *
 * Usage: node scripts/generate-trigrid-dataframe.cjs [--dry-run]
 */

const fs = require("fs");
const path = require("path");

// Grid geometry

/** The 3 vertices in CW order for upright mode */
const VERTICES = ["n", "se", "sw"];

/** Get the next vertex CW */
function cwNeighbor(v) {
  return VERTICES[(VERTICES.indexOf(v) + 1) % 3];
}

/** Get the next vertex CCW */
function ccwNeighbor(v) {
  return VERTICES[(VERTICES.indexOf(v) + 2) % 3];
}

// Position enumeration

/**
 * All 9 positions: 3 beta + 6 gamma (ordered pairs)
 * Each position = { name, blue, red }
 */
const POSITIONS = [];

// Beta: both hands at same vertex
VERTICES.forEach((v, i) => {
  POSITIONS.push({ name: `beta${i + 1}`, left: v, right: v });
});

// Gamma: hands at different vertices (ordered — blue/red assignment matters)
let gammaIdx = 1;
for (let i = 0; i < VERTICES.length; i++) {
  for (let j = 0; j < VERTICES.length; j++) {
    if (i !== j) {
      POSITIONS.push({
        name: `gamma${gammaIdx}`,
        left: VERTICES[i],
        right: VERTICES[j],
      });
      gammaIdx++;
    }
  }
}

/** Look up position name from blue/red locations */
function findPosition(left, right) {
  const pos = POSITIONS.find((p) => p.left === left && p.right === right);
  return pos ? pos.name : null;
}

/** Get position group (beta or gamma) */
function placementGroup(posName) {
  return posName.startsWith("beta") ? "beta" : "gamma";
}

// ============================================================================
// Motion helpers
// ============================================================================

/**
 * Shift a hand from one vertex to another.
 * Returns the destination vertex given a start vertex and direction (cw/ccw).
 */
function shift(vertex, direction) {
  return direction === "cw" ? cwNeighbor(vertex) : ccwNeighbor(vertex);
}

// ============================================================================
// CSV row generation
// ============================================================================

const CSV_HEADER =
  "letter,startPlacement,endPlacement,timing,direction," +
  "blueMotionType,blueRotationDirection,blueStartLocation,blueEndLocation," +
  "redMotionType,redRotationDirection,redStartLocation,redEndLocation";

function makeRow(letter, startPos, endPos, timing, direction, left, right) {
  return [
    letter,
    startPos,
    endPos,
    timing,
    direction,
    left.motionType,
    left.rotationDir,
    left.startLoc,
    left.endLoc,
    right.motionType,
    right.rotationDir,
    right.startLoc,
    right.endLoc,
  ].join(",");
}

// ============================================================================
// Letter generators
// ============================================================================

const rows = [];

/**
 * Generate Beta → Beta letters (G, H, I)
 * Both hands at same vertex, both shift same orbital direction → still beta.
 *
 * G: tog-same, both pro
 * H: tog-same, both anti
 * I: tog-same, blue pro + red anti
 */
function generateBetaToBeta() {
  const letters = [
    { letter: "G", leftMotion: "pro", rightMotion: "pro" },
    { letter: "H", leftMotion: "anti", rightMotion: "anti" },
    { letter: "I", leftMotion: "pro", rightMotion: "anti" },
  ];

  for (const { letter, leftMotion, rightMotion } of letters) {
    // From each beta position, both hands can shift CW or CCW together
    for (let i = 0; i < VERTICES.length; i++) {
      const startVertex = VERTICES[i];
      const startPos = `beta${i + 1}`;

      for (const dir of ["cw", "ccw"]) {
        const endVertex = shift(startVertex, dir);
        const endIdx = VERTICES.indexOf(endVertex);
        const endPos = `beta${endIdx + 1}`;

        rows.push(
          makeRow(letter, startPos, endPos, "tog", "same", {
            motionType: leftMotion,
            rotationDir: dir,
            startLoc: startVertex,
            endLoc: endVertex,
          }, {
            motionType: rightMotion,
            rotationDir: dir,
            startLoc: startVertex,
            endLoc: endVertex,
          })
        );
      }
    }
  }
}

/**
 * Generate Beta → Gamma letters (J, K, L)
 * Both hands at same vertex, shift opposite orbital directions → gamma.
 *
 * J: tog-opp, both pro
 * K: tog-opp, both anti
 * L: tog-opp, blue pro + red anti
 */
function generateBetaToGamma() {
  const letters = [
    { letter: "J", leftMotion: "pro", rightMotion: "pro" },
    { letter: "K", leftMotion: "anti", rightMotion: "anti" },
    { letter: "L", leftMotion: "pro", rightMotion: "anti" },
  ];

  for (const { letter, leftMotion, rightMotion } of letters) {
    for (let i = 0; i < VERTICES.length; i++) {
      const startVertex = VERTICES[i];
      const startPos = `beta${i + 1}`;

      // Blue goes CW, Red goes CCW
      {
        const leftEnd = shift(startVertex, "cw");
        const rightEnd = shift(startVertex, "ccw");
        const endPos = findPosition(leftEnd, rightEnd);
        if (endPos) {
          rows.push(
            makeRow(letter, startPos, endPos, "tog", "opp", {
              motionType: leftMotion,
              rotationDir: "cw",
              startLoc: startVertex,
              endLoc: leftEnd,
            }, {
              motionType: rightMotion,
              rotationDir: "ccw",
              startLoc: startVertex,
              endLoc: rightEnd,
            })
          );
        }
      }

      // Blue goes CCW, Red goes CW
      {
        const leftEnd = shift(startVertex, "ccw");
        const rightEnd = shift(startVertex, "cw");
        const endPos = findPosition(leftEnd, rightEnd);
        if (endPos) {
          rows.push(
            makeRow(letter, startPos, endPos, "tog", "opp", {
              motionType: leftMotion,
              rotationDir: "ccw",
              startLoc: startVertex,
              endLoc: leftEnd,
            }, {
              motionType: rightMotion,
              rotationDir: "cw",
              startLoc: startVertex,
              endLoc: rightEnd,
            })
          );
        }
      }
    }
  }
}

/**
 * Generate Gamma → Gamma Type 1 letters (M, N, O, P, Q, R)
 * Both hands at different vertices, both shift.
 *
 * There are 4 orbital combos from any gamma:
 *   blue CW + red CW   → may produce gamma or beta
 *   blue CW + red CCW   → may produce gamma or beta
 *   blue CCW + red CW   → may produce gamma or beta
 *   blue CCW + red CCW  → may produce gamma or beta
 *
 * We filter to only gamma→gamma outcomes.
 *
 * M: split-opp, both pro     (M/N/O parallel diamond M/N/O)
 * N: split-opp, both anti
 * O: split-opp, blue pro + red anti
 * P: split-same, both pro    (P/Q/R parallel diamond P/Q/R)
 * Q: split-same, both anti
 * R: split-same, blue pro + red anti
 */
function generateGammaToGamma() {
  const letters = [
    { letter: "M", timing: "split", direction: "opp", leftMotion: "pro", rightMotion: "pro" },
    { letter: "N", timing: "split", direction: "opp", leftMotion: "anti", rightMotion: "anti" },
    { letter: "O", timing: "split", direction: "opp", leftMotion: "pro", rightMotion: "anti" },
    { letter: "P", timing: "split", direction: "same", leftMotion: "pro", rightMotion: "pro" },
    { letter: "Q", timing: "split", direction: "same", leftMotion: "anti", rightMotion: "anti" },
    { letter: "R", timing: "split", direction: "same", leftMotion: "pro", rightMotion: "anti" },
  ];

  // For each letter, find which orbital direction combos produce gamma→gamma
  for (const { letter, timing, direction, leftMotion, rightMotion } of letters) {
    // Determine which orbital combos match the timing/direction
    // "same direction" = both hands orbit same way (both CW or both CCW)
    // "opp direction" = hands orbit opposite ways (one CW, one CCW)
    const orbitalCombos =
      direction === "same"
        ? [["cw", "cw"], ["ccw", "ccw"]]
        : [["cw", "ccw"], ["ccw", "cw"]];

    // From each gamma position
    const gammaPositions = POSITIONS.filter((p) => p.name.startsWith("gamma"));

    for (const startP of gammaPositions) {
      for (const [leftDir, rightDir] of orbitalCombos) {
        const leftEnd = shift(startP.left, leftDir);
        const rightEnd = shift(startP.right, rightDir);
        const endPos = findPosition(leftEnd, rightEnd);

        // Only keep gamma→gamma transitions
        if (endPos && placementGroup(endPos) === "gamma") {
          rows.push(
            makeRow(letter, startP.name, endPos, timing, direction, {
              motionType: leftMotion,
              rotationDir: leftDir,
              startLoc: startP.left,
              endLoc: leftEnd,
            }, {
              motionType: rightMotion,
              rotationDir: rightDir,
              startLoc: startP.right,
              endLoc: rightEnd,
            })
          );
        }
      }
    }
  }
}

/**
 * Generate Gamma → Gamma quarter-time letters (S, T, U, V)
 *
 * Quarter-time means the hands are offset by 1/4 of the cycle.
 * On the trigrid, this likely means one hand shifts while the other
 * is mid-shift (creating an offset timing pattern).
 *
 * S: quarter-same, both pro
 * T: quarter-same, both anti
 * U: quarter-same, blue pro + red anti
 * V: quarter-opp, both pro
 *
 * NOTE: Quarter-time on trigrid needs domain verification.
 * Using same orbital combos as M-R for now with "quarter" timing.
 */
function generateQuarterTime() {
  const letters = [
    { letter: "S", timing: "quarter", direction: "same", leftMotion: "pro", rightMotion: "pro" },
    { letter: "T", timing: "quarter", direction: "same", leftMotion: "anti", rightMotion: "anti" },
    { letter: "U", timing: "quarter", direction: "same", leftMotion: "pro", rightMotion: "anti" },
    { letter: "V", timing: "quarter", direction: "opp", leftMotion: "pro", rightMotion: "pro" },
  ];

  const gammaPositions = POSITIONS.filter((p) => p.name.startsWith("gamma"));

  for (const { letter, timing, direction, leftMotion, rightMotion } of letters) {
    const orbitalCombos =
      direction === "same"
        ? [["cw", "cw"], ["ccw", "ccw"]]
        : [["cw", "ccw"], ["ccw", "cw"]];

    for (const startP of gammaPositions) {
      for (const [leftDir, rightDir] of orbitalCombos) {
        const leftEnd = shift(startP.left, leftDir);
        const rightEnd = shift(startP.right, rightDir);
        const endPos = findPosition(leftEnd, rightEnd);

        if (endPos && placementGroup(endPos) === "gamma") {
          rows.push(
            makeRow(letter, startP.name, endPos, timing, direction, {
              motionType: leftMotion,
              rotationDir: leftDir,
              startLoc: startP.left,
              endLoc: leftEnd,
            }, {
              motionType: rightMotion,
              rotationDir: rightDir,
              startLoc: startP.right,
              endLoc: rightEnd,
            })
          );
        }
      }
    }
  }
}

/**
 * Generate Type 2 letters (W, X, Y, Z)
 * One hand shifts, one stays static.
 *
 * W: gamma→gamma, blue shifts pro, red static
 * X: gamma→gamma, blue shifts anti, red static
 * Y: gamma→beta, blue shifts pro, red static
 * Z: gamma→beta, blue shifts anti, red static
 */
function generateType2() {
  const gammaPositions = POSITIONS.filter((p) => p.name.startsWith("gamma"));

  // W and X: gamma→gamma, one shift one static
  for (const { letter, shiftMotion } of [
    { letter: "W", shiftMotion: "pro" },
    { letter: "X", shiftMotion: "anti" },
  ]) {
    for (const startP of gammaPositions) {
      for (const dir of ["cw", "ccw"]) {
        // Blue shifts, red stays
        {
          const leftEnd = shift(startP.left, dir);
          const endPos = findPosition(leftEnd, startP.right);
          if (endPos && placementGroup(endPos) === "gamma") {
            rows.push(
              makeRow(letter, startP.name, endPos, "split", "opp", {
                motionType: shiftMotion,
                rotationDir: dir,
                startLoc: startP.left,
                endLoc: leftEnd,
              }, {
                motionType: "static",
                rotationDir: "noRotation",
                startLoc: startP.right,
                endLoc: startP.right,
              })
            );
          }
        }

        // Red shifts, blue stays
        {
          const rightEnd = shift(startP.right, dir);
          const endPos = findPosition(startP.left, rightEnd);
          if (endPos && placementGroup(endPos) === "gamma") {
            rows.push(
              makeRow(letter, startP.name, endPos, "split", "opp", {
                motionType: "static",
                rotationDir: "noRotation",
                startLoc: startP.left,
                endLoc: startP.left,
              }, {
                motionType: shiftMotion,
                rotationDir: dir,
                startLoc: startP.right,
                endLoc: rightEnd,
              })
            );
          }
        }
      }
    }
  }

  // Y and Z: gamma→beta, one shift one static
  for (const { letter, shiftMotion } of [
    { letter: "Y", shiftMotion: "pro" },
    { letter: "Z", shiftMotion: "anti" },
  ]) {
    for (const startP of gammaPositions) {
      for (const dir of ["cw", "ccw"]) {
        // Blue shifts to red's vertex → beta
        {
          const leftEnd = shift(startP.left, dir);
          if (leftEnd === startP.right) {
            const endPos = findPosition(leftEnd, startP.right);
            if (endPos && placementGroup(endPos) === "beta") {
              rows.push(
                makeRow(letter, startP.name, endPos, "split", "opp", {
                  motionType: shiftMotion,
                  rotationDir: dir,
                  startLoc: startP.left,
                  endLoc: leftEnd,
                }, {
                  motionType: "static",
                  rotationDir: "noRotation",
                  startLoc: startP.right,
                  endLoc: startP.right,
                })
              );
            }
          }
        }

        // Red shifts to blue's vertex → beta
        {
          const rightEnd = shift(startP.right, dir);
          if (rightEnd === startP.left) {
            const endPos = findPosition(startP.left, rightEnd);
            if (endPos && placementGroup(endPos) === "beta") {
              rows.push(
                makeRow(letter, startP.name, endPos, "split", "opp", {
                  motionType: "static",
                  rotationDir: "noRotation",
                  startLoc: startP.left,
                  endLoc: startP.left,
                }, {
                  motionType: shiftMotion,
                  rotationDir: dir,
                  startLoc: startP.right,
                  endLoc: rightEnd,
                })
              );
            }
          }
        }
      }
    }
  }
}

/**
 * Generate Type 6 static letters (β, γ)
 * Both hands stay in place. No orbital motion.
 */
function generateStatic() {
  // β: static at beta positions
  for (let i = 0; i < VERTICES.length; i++) {
    const v = VERTICES[i];
    const pos = `beta${i + 1}`;
    rows.push(
      makeRow("β", pos, pos, "none", "none", {
        motionType: "static",
        rotationDir: "noRotation",
        startLoc: v,
        endLoc: v,
      }, {
        motionType: "static",
        rotationDir: "noRotation",
        startLoc: v,
        endLoc: v,
      })
    );
  }

  // γ: static at gamma positions
  const gammaPositions = POSITIONS.filter((p) => p.name.startsWith("gamma"));
  for (const gp of gammaPositions) {
    rows.push(
      makeRow("γ", gp.name, gp.name, "none", "none", {
        motionType: "static",
        rotationDir: "noRotation",
        startLoc: gp.left,
        endLoc: gp.left,
      }, {
        motionType: "static",
        rotationDir: "noRotation",
        startLoc: gp.right,
        endLoc: gp.right,
      })
    );
  }
}

// ============================================================================
// Main
// ============================================================================

// Generate all rows
generateBetaToBeta();     // G, H, I
generateBetaToGamma();    // J, K, L
generateGammaToGamma();   // M, N, O, P, Q, R
generateQuarterTime();    // S, T, U, V
generateType2();          // W, X, Y, Z
generateStatic();         // β, γ

// Sort by letter, then start position
rows.sort((a, b) => {
  const [aLetter, aStart] = a.split(",");
  const [bLetter, bStart] = b.split(",");
  if (aLetter !== bLetter) return aLetter.localeCompare(bLetter);
  return aStart.localeCompare(bStart);
});

const csv = [CSV_HEADER, ...rows].join("\n") + "\n";

// Stats
const letterCounts = {};
for (const row of rows) {
  const letter = row.split(",")[0];
  letterCounts[letter] = (letterCounts[letter] || 0) + 1;
}

console.log("=== Trigrid Dataframe Generation ===\n");
console.log(`Total rows: ${rows.length}`);
console.log(`Unique letters: ${Object.keys(letterCounts).length}`);
console.log("\nPer-letter counts:");
for (const [letter, count] of Object.entries(letterCounts).sort()) {
  console.log(`  ${letter}: ${count} variations`);
}

// Verify transition coverage
const transitionPairs = new Set();
for (const row of rows) {
  const parts = row.split(",");
  const startGroup = placementGroup(parts[1]);
  const endGroup = placementGroup(parts[2]);
  transitionPairs.add(`${startGroup}→${endGroup}`);
}
console.log("\nTransition coverage:", [...transitionPairs].sort().join(", "));

const dryRun = process.argv.includes("--dry-run");
if (dryRun) {
  console.log("\n[DRY RUN] Would write to static/data/pictographs/TrigridPictographDataframe.csv");
  console.log("\nFirst 10 rows:");
  console.log(CSV_HEADER);
  rows.slice(0, 10).forEach((r) => console.log(r));
} else {
  const outPath = path.join(
    __dirname,
    "..",
    "static",
    "data",
    "pictographs",
    "TrigridPictographDataframe.csv"
  );
  fs.writeFileSync(outPath, csv, "utf-8");
  console.log(`\nWritten to: ${outPath}`);
}
