/**
 * The CAP record behind /guide/three-levels. The silent failures: the compact
 * table drifting from the SpiroAnim transcription of Gage's chart, a rebuilt
 * step with the wrong rotation or orientation, a word the dataframe does not
 * spell, the essay's claims about the CAPs (one hand caps, the other keeps
 * circling; 72 CAPs, 32 words) going untrue, or a strip that does not chain.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  lookupLetter,
  parseCsvEdges,
} from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import { getGridPlacementFromLocations } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import {
  CAPS,
  CAP_WORDS,
  capBeats,
  capCell,
  capHandSteps,
  capStrip,
  type CapHand,
} from "./caps-topic";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

interface SourceMotion {
  motionType: string;
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
  turns: number;
  startOrientation: string;
  endOrientation: string;
}
interface SourceSequence {
  word: string;
  metadata: { cell: string };
  steps: {
    letter: string;
    motions: { left: SourceMotion; right: SourceMotion };
  }[];
}

const source: SourceSequence[] = JSON.parse(
  read("docs/research/spiroanim/eightstep-72-sequences.json")
);
const edges = parseCsvEdges(
  read("static/data/pictographs/DiamondPictographDataframe.csv")
);

const RING = ["n", "e", "s", "w"];
const forward = (from: string, to: string) =>
  (RING.indexOf(to) - RING.indexOf(from) + 4) % 4 === 1;

describe("the CAP table", () => {
  it("holds all 72 of Gage's CAPs in chart order", () => {
    expect(CAPS.map((c) => c.id)).toEqual(source.map((s) => s.metadata.cell));
  });

  it("rebuilds every step of the transcription exactly", () => {
    for (const [i, cap] of CAPS.entries()) {
      const src = source[i]!;
      expect(cap.word).toBe(src.word);
      for (const side of ["left", "right"] as const) {
        const steps = capHandSteps(cap[side]);
        steps.forEach((step, beat) => {
          const m = src.steps[beat]!.motions[side];
          expect({ ...step, duration: undefined }).toEqual({
            duration: undefined,
            motionType: m.motionType,
            rotationDirection: m.rotationDirection,
            startLocation: m.startLocation,
            endLocation: m.endLocation,
            turns: m.turns,
            startOrientation: m.startOrientation,
            endOrientation: m.endOrientation,
          });
        });
      }
    }
  });

  it("spells each word from the dataframe", () => {
    for (const cap of CAPS) {
      const left = capHandSteps(cap.left);
      const right = capHandSteps(cap.right);
      const word = left
        .map((l, i) => {
          const r = right[i]!;
          return lookupLetter(edges, {
            startPlacement: getGridPlacementFromLocations(
              l.startLocation,
              r.startLocation
            ),
            endPlacement: getGridPlacementFromLocations(
              l.endLocation,
              r.endLocation
            ),
            left: l,
            right: r,
          });
        })
        .join("");
      expect(word).toBe(cap.word);
    }
  });
});

describe("what the essay says about them", () => {
  const caps = (hand: CapHand) => {
    let at = hand.start;
    return hand.path.every((to, i) => {
      const ok =
        (forward(at, to) === forward(hand.start, hand.path[0]!)) ===
        (i % 3 !== 2);
      at = to;
      return ok;
    });
  };
  const keepsCircling = (hand: CapHand) => {
    let at = hand.start;
    const way = forward(at, hand.path[0]!);
    return hand.path.every((to) => {
      const ok = forward(at, to) === way;
      at = to;
      return ok;
    });
  };

  it("has one hand capping (two beats on, one back) and the other circling", () => {
    for (const cap of CAPS) {
      const [capper, other] = caps(cap.left)
        ? [cap.left, cap.right]
        : [cap.right, cap.left];
      expect(caps(capper), cap.id).toBe(true);
      expect(keepsCircling(other), cap.id).toBe(true);
      // The capping hand changes its spin on the beat it doubles back.
      capper.spins.forEach((spin, i) => {
        const turnBack = i % 3 === 2;
        expect(spin === capper.spins[0], `${cap.id} beat ${i + 1}`).toBe(
          !turnBack
        );
      });
    }
  });

  it("makes 72 CAPs into 32 words, each a cell repeated", () => {
    expect(CAPS).toHaveLength(72);
    expect(CAP_WORDS).toHaveLength(32);
    for (const { word } of CAP_WORDS) {
      expect([3, 6]).toContain(capCell(word).length);
    }
    expect(capCell("KECKECKECKEC")).toBe("KEC");
    expect(capCell("IIDCCJIIDCCJ")).toBe("IIDCCJ");
  });

  it("shares a word only between CAPs that differ in turns alone", () => {
    const shape = (hand: CapHand) =>
      capHandSteps(hand)
        .map(
          (s) =>
            `${s.startLocation}${s.endLocation}${s.motionType}${s.rotationDirection}`
        )
        .join();
    for (const { caps } of CAP_WORDS) {
      for (const cap of caps.slice(1)) {
        expect(shape(cap.left)).toBe(shape(caps[0]!.left));
        expect(shape(cap.right)).toBe(shape(caps[0]!.right));
      }
    }
    const shapes = new Set(
      CAP_WORDS.map((w) => shape(w.caps[0]!.left) + shape(w.caps[0]!.right))
    );
    expect(shapes.size).toBe(CAP_WORDS.length);
  });

  it("reads every beat as a Type 1 element with 1:1 or 1:3 in each hand", () => {
    for (const cap of CAPS) {
      for (const beat of capBeats(cap)) {
        // Every beat moves both hands round the ring, so each has an element.
        expect(beat.element, `${cap.id} beat ${beat.beat}`).not.toBeNull();
        for (const side of ["left", "right"] as const) {
          expect(beat[side].ratio).toBe(
            beat[side].spin === "extension" ? "1:1" : "1:3"
          );
        }
      }
    }
  });
});

describe("strips", () => {
  it("plays every CAP as a start pose and twelve chained beats", () => {
    for (const cap of CAPS) {
      const strip = capStrip(cap);
      expect(strip).toHaveLength(13);
      for (let i = 1; i < strip.length; i++) {
        expect(strip[i]!.startPlacement).toBe(strip[i - 1]!.endPlacement);
      }
      expect(
        strip
          .slice(1)
          .map((s) => s.letter)
          .join("")
      ).toBe(cap.word);
    }
  });
});
