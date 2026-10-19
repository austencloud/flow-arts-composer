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
  MotionType,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  turnValuesForLevel,
  type TurnValue,
} from "#lib/shared/create/services/level-turn-values.js";
import type { SoloPropStepData } from "#lib/shared/foundation/domain/models/solo-prop-step-data.js";

const travelOf = (step: SoloPropStepData) =>
  (RING.indexOf(step.endLocation) - RING.indexOf(step.startLocation) + 4) % 4;
import {
  CAPS,
  CAP_HAND_PATHS,
  CAP_WORDS,
  capBeats,
  capPairing,
  capCell,
  capHandSteps,
  capStrip,
  capOnPath,
  capPoiProblem,
  capWorksOnPoi,
  type Cap,
  type CapHand,
  type CapHandSpin,
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

describe("what the Eight Step page says about them", () => {
  const laps = (hand: CapHand) => {
    let at = hand.start;
    let quarters = 0;
    for (const to of hand.path) {
      quarters += forward(at, to) ? 1 : -1;
      at = to;
    }
    return Math.abs(quarters) / 4;
  };
  const route = (hand: CapHand) => hand.start + hand.path.join("");

  it("puts nine CAPs on each of eight hand paths", () => {
    expect(CAP_HAND_PATHS).toHaveLength(8);
    const routes = new Set<string>();
    for (const { caps: column } of CAP_HAND_PATHS) {
      expect(column).toHaveLength(9);
      for (const cap of column) {
        expect(route(cap.left)).toBe(route(column[0]!.left));
        expect(route(cap.right)).toBe(route(column[0]!.right));
      }
      routes.add(route(column[0]!.left) + route(column[0]!.right));
      // Nine distinct pairings of the three spins.
      const pairings = column.map((cap) => {
        const { capping, circling } = capPairing(cap);
        return `${capping}/${circling}`;
      });
      expect(new Set(pairings).size).toBe(9);
    }
    expect(routes.size).toBe(8);
  });

  it("has the left hand cap once round while the right circles three times", () => {
    for (const cap of CAPS) {
      expect(laps(cap.left), cap.id).toBe(1);
      expect(laps(cap.right), cap.id).toBe(3);
    }
  });

  it("reads each path's timing and direction from where the hands start", () => {
    expect(
      CAP_HAND_PATHS.map((p) => [p.column, p.timing, p.direction])
    ).toEqual([
      [1, "split", "opposite"],
      [2, "together", "opposite"],
      [3, "together", "same"],
      [4, "split", "same"],
      [5, "quarter", "same"],
      [6, "quarter", "same"],
      [7, "quarter", "opposite"],
      [8, "quarter", "opposite"],
    ]);
    for (const path of CAP_HAND_PATHS) {
      for (const cap of path.caps) {
        expect([cap.timing, cap.direction], cap.id).toEqual([
          path.timing,
          path.direction,
        ]);
      }
    }
  });

  it("names each pairing as the chart's row code does", () => {
    const CODE = { A: "antispin", E: "extension", I: "prospin" } as const;
    for (const cap of CAPS) {
      const [capping, circling] = [...cap.id.split("-")[1]!] as (
        | "A"
        | "E"
        | "I"
      )[];
      expect(capPairing(cap), cap.id).toEqual({
        capping: CODE[capping!],
        circling: CODE[circling!],
      });
    }
  });

  it("puts every CAP on poi, since each points in only mid-run", () => {
    // Pro with one turn ends a beat pointing in, but every one comes in a
    // pair that carries on the same way and ends pointing out, and the
    // capping hand doubles back only on a beat that ends pointing out.
    expect(CAPS.filter(capWorksOnPoi)).toHaveLength(72);
  });

  it("keeps poi off a hand that changes direction while pointing in", () => {
    const withLeft = (path: string, spins: CapHand["spins"]): Cap => ({
      ...CAPS[0]!,
      left: { start: "n", path: [...path], spins } as CapHand,
    });
    // On through e to s: the poi points in at e but carries on, so it works.
    expect(capWorksOnPoi(withLeft("es", ["prospin", "prospin"]))).toBe(true);
    // Back from e to n while pointing in: the momentum breaks.
    expect(capWorksOnPoi(withLeft("en", ["prospin", "prospin"]))).toBe(false);
    // A loop that ends pointing in cannot repeat.
    expect(capWorksOnPoi(withLeft("e", ["prospin"]))).toBe(false);
  });

  it("keeps poi off antispin with no turns and off a turnaround not out", () => {
    const spin = (motion: "pro" | "anti", turns: TurnValue): CapHandSpin => ({
      motion,
      turns,
    });
    for (const path of CAP_HAND_PATHS) {
      const at = (left: CapHandSpin, right: CapHandSpin) =>
        capPoiProblem(capOnPath(path, left, right));
      // The beat back of a pro capping hand is an antispin, so 0 turns
      // there stops a poi too.
      expect(at(spin("pro", 0), spin("pro", 0))).toBe("anti-zero");
      // Pro, pro, anti at 1 turn: out, in, out, out, so the turnaround
      // falls on out.
      expect(at(spin("pro", 1), spin("anti", 1))).toBeNull();
      // Anti, anti, pro at 1 turn ends the beat back pointing in, and the
      // hand turns round there.
      expect(at(spin("anti", 1), spin("anti", 1))).toBe("momentum");
      expect(at(spin("anti", 2), spin("pro", 2))).toBeNull();
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

  it("spins every hand path at one turn value on every beat", () => {
    const motions = ["pro", "anti"] as const;
    const flip = { pro: MotionType.ANTI, anti: MotionType.PRO } as const;
    const same = { pro: MotionType.PRO, anti: MotionType.ANTI } as const;
    for (const path of CAP_HAND_PATHS) {
      for (const turns of turnValuesForLevel(4)) {
        for (const lm of motions) {
          for (const rm of motions) {
            const left = { motion: lm, turns };
            const right = { motion: rm, turns };
            const cap = capOnPath(path, left, right);
            const chart = path.caps.find((c) => cap.id.startsWith(`${c.id}:`))!;
            // An odd number of quarter turns takes two times round.
            const rounds =
              typeof turns === "number" && (turns * 4) % 2 === 1 ? 2 : 1;
            expect(cap.word).toBe(chart.word.repeat(rounds));
            expect(capStrip(cap)).toHaveLength(12 * rounds + 1);
            for (const [hand, spin] of [
              [cap.left, left],
              [cap.right, right],
            ] as const) {
              const steps = capHandSteps(hand);
              const forward = travelOf(steps[0]!);
              expect(steps.at(-1)!.endOrientation).toBe(Orientation.OUT);
              steps.forEach((step, i) => {
                expect(step.turns).toBe(turns);
                if (i > 0) {
                  expect(step.startOrientation).toBe(
                    steps[i - 1]!.endOrientation
                  );
                }
                // The capping hand flips its motion only on the beat back.
                const motion =
                  turns === "fl" ? step.prefloatMotionType : step.motionType;
                expect(motion).toBe(
                  travelOf(step) === forward
                    ? same[spin.motion]
                    : flip[spin.motion]
                );
              });
            }
          }
        }
      }
    }
  });
});
