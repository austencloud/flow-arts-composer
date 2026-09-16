/**
 * Validate the 72 Eight Step base cells against TKA's own orientation engine.
 *
 * The cells were transcribed from SpiroAnim's compiled geometry (his rootCompile
 * + closestPoint as oracle). This asserts TKA's orientation algebra reproduces
 * his per-frame prop orientations exactly — 72 cells x 12 steps x 2 hands.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { calculateEndOrientation } from "@tka/sequence-engine/core";

// Repo-root-relative, matching every other fixture-reading test here. An
// `import.meta.url` base is not safe in this runner: CI resolved it to a
// non-file scheme and the suite died at import with ERR_INVALID_URL_SCHEME,
// which gated deploys.
const DATA = (name: string) => resolve("docs/research/spiroanim", name);

type Hand = {
  motionType: string;
  startLoc: string;
  endLoc: string;
  rotationDirection: string;
  turns: number;
  startOrientation: string;
  endOrientation: string;
};
type Step = {
  letter: string;
  startPos: string;
  endPos: string;
  blue: Hand;
  red: Hand;
};
type Cell = { reference: string; word: string; steps: Step[] };

const WALL_PLANE_FLAGGED_CELLS = new Set([
  "1-AE",
  "1-AI",
  "2-AE",
  "2-AI",
  "3-EE",
  "3-EI",
  "3-IE",
  "3-II",
  "4-EE",
  "4-EI",
  "4-IE",
  "4-II",
  "5-EE",
  "5-EI",
  "5-IE",
  "5-II",
  "6-EE",
  "6-EI",
  "6-IE",
  "6-II",
  "7-AE",
  "7-AI",
  "8-AE",
  "8-AI",
]);

const cells: Cell[] = JSON.parse(
  readFileSync(DATA("eightstep-72-base.json"), "utf8")
);

describe("SpiroAnim Eight Step base cells", () => {
  it("agrees with TKA's orientation engine on every motion", () => {
    const mismatches: string[] = [];
    let checked = 0;
    for (const cell of cells) {
      for (const [i, step] of cell.steps.entries()) {
        for (const color of ["blue", "red"] as const) {
          const m = step[color];
          const got = calculateEndOrientation({
            motionType: m.motionType,
            turns: m.turns,
            rotationDirection: m.rotationDirection,
            startLocation: m.startLoc,
            endLocation: m.endLoc,
            startOrientation: m.startOrientation,
          });
          checked++;
          if (got !== m.endOrientation) {
            mismatches.push(
              `${cell.reference} step${i + 1} ${step.letter} ${color} ` +
                `${m.motionType}${m.turns}t ${m.startLoc}->${m.endLoc} ` +
                `${m.startOrientation}: tka=${got} spiroanim=${m.endOrientation}`
            );
          }
        }
      }
    }
    console.log(
      `orientation checks: ${checked}, mismatches: ${mismatches.length}`
    );
    if (mismatches.length) console.log(mismatches.slice(0, 20).join("\n"));
    expect(mismatches).toEqual([]);
  });

  it("propagates continuously and closes the cycle", () => {
    const open: string[] = [];
    for (const cell of cells) {
      for (const color of ["blue", "red"] as const) {
        for (let i = 1; i < cell.steps.length; i++) {
          const prev = cell.steps[i - 1]![color];
          const cur = cell.steps[i]![color];
          if (prev.endOrientation !== cur.startOrientation)
            open.push(
              `${cell.reference} ${color} step${i}->${i + 1} orientation break`
            );
          if (prev.endLoc !== cur.startLoc)
            open.push(
              `${cell.reference} ${color} step${i}->${i + 1} location break`
            );
        }
        const first = cell.steps[0]![color];
        const last = cell.steps.at(-1)![color];
        if (last.endLoc !== first.startLoc)
          open.push(`${cell.reference} ${color} does not close (location)`);
        if (last.endOrientation !== first.startOrientation)
          open.push(`${cell.reference} ${color} does not close (orientation)`);
      }
    }
    console.log(`continuity/closure failures: ${open.length}`);
    if (open.length) console.log(open.slice(0, 20).join("\n"));
    expect(open).toEqual([]);
  });

  it("emits persisted sequence blobs", () => {
    const blobs = cells.map((cell) => ({
      word: cell.word,
      metadata: {
        source: "spiroanim-eight-step",
        cell: cell.reference,
        attribution:
          "8-Step Concepts and handpaths by Gage DeMello; transcribed from Mentive's SpiroAnim (@rbgirard)",
        ...(WALL_PLANE_FLAGGED_CELLS.has(cell.reference) && {
          wallPlaneSourceAssessment: {
            status: "flagged-difficult-or-impossible",
            source: "Mentive's SpiroAnim 8-Step wall-plane warning",
            sourceRepository: "https://github.com/rbgirard/spiroanim",
            sourceCommit: "6bd56cde61c82bd9a047727ceff70d22428113d3",
            note: "SpiroAnim marks this cell as potentially difficult or impossible in Wall Plane without significant modification.",
          },
        }),
      },
      startPlacement: {
        letter: null,
        gridPlacement: cell.steps[0]!.startPos,
        motions: {
          left: motionBlob(cell.steps[0]!.blue, "left", true),
          right: motionBlob(cell.steps[0]!.red, "right", true),
        },
      },
      steps: cell.steps.map((s, i) => ({
        stepNumber: i + 1,
        letter: s.letter,
        startPlacement: s.startPos,
        endPlacement: s.endPos,
        duration: 1,
        motions: {
          left: motionBlob(s.blue, "left"),
          right: motionBlob(s.red, "right"),
        },
      })),
    }));
    writeFileSync(
      DATA("eightstep-72-sequences.json"),
      JSON.stringify(blobs, null, 1)
    );
    console.log(
      `wrote ${blobs.length} sequence blobs; sample word ${blobs[0]!.word}`
    );
    expect(blobs).toHaveLength(72);
    expect(
      blobs.filter((blob) => blob.metadata.wallPlaneSourceAssessment)
    ).toHaveLength(24);
  });
});

function motionBlob(m: Hand, hand: "left" | "right", asStart = false) {
  return {
    hand,
    motionType: asStart ? "static" : m.motionType,
    rotationDirection: asStart ? "no_rot" : m.rotationDirection,
    startLocation: m.startLoc,
    endLocation: asStart ? m.startLoc : m.endLoc,
    turns: asStart ? 0 : m.turns,
    startOrientation: m.startOrientation,
    endOrientation: asStart ? m.startOrientation : m.endOrientation,
  };
}
