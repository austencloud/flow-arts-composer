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
  type TnDMode,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  turnValuesForLevel,
  type TurnValue,
} from "#lib/shared/create/services/level-turn-values.js";
import { deriveTnDFromPictograph } from "#lib/shared/pictograph/shared/domain/utils/tnd-deriver.js";
import { derivePropRelationshipForStep } from "#lib/shared/shape-matrix/domain/prop-relationship.js";
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
  capPathMode,
  capPathRhythm,
  capPropRelationship,
  capStrip,
  capOnPath,
  capPoiProblem,
  capWorksOnPoi,
  type Cap,
  type CapHand,
  type CapHandSpin,
  type CapSpin,
} from "./caps-topic";
import { TND_TO_ELEMENTAL } from "#lib/shared/pictograph/shared/domain/utils/tnd-calculator.js";

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
      // The beat back keeps the chart's spin, so Gage's EE and AA work:
      // pro 0, pro 0, anti 1 and anti 1, anti 1, pro 0 end every beat out.
      expect(at(spin("pro", 0), spin("pro", 0))).toBeNull();
      expect(at(spin("anti", 1), spin("anti", 1))).toBeNull();
      // Pro, pro, anti at 1 turn: out, in, out, out, so the turnaround
      // falls on out.
      expect(at(spin("pro", 1), spin("anti", 1))).toBeNull();
      expect(at(spin("anti", 2), spin("pro", 2))).toBeNull();
      // Antispin with no turns is still out of reach.
      expect(at(spin("anti", 0), spin("pro", 1))).toBe("anti-zero");
      // Two half turns on leave the poi pointing in, and the hand turns
      // round there.
      expect(at(spin("pro", 0.5), spin("pro", 1))).toBe("momentum");
      // A picked beat back counts too. Pro 1 on the way back after anti
      // ends pointing in as the hand turns round again.
      expect(at({ motion: "anti", turns: 1, back: 1 }, spin("anti", 1))).toBe(
        "momentum"
      );
      // Anti 0 on the way back after pro is out of reach on poi.
      expect(at({ motion: "pro", turns: 0, back: 0 }, spin("pro", 0))).toBe(
        "anti-zero"
      );
    }
  });

  it("matches the chart CAP at the chart's own turns", () => {
    // The picker at a spin's own turns plays the chart's capping hand, beat
    // back and all, on every path: all 72. The circling hand matches too,
    // except that prospin plays pro 1 on every beat where the chart rests
    // on pro 0 every third beat.
    const SPINS: [CapHandSpin, CapSpin][] = [
      [{ motion: "pro", turns: 0 }, "extension"],
      [{ motion: "anti", turns: 1 }, "antispin"],
      [{ motion: "pro", turns: 1 }, "prospin"],
    ];
    let matched = 0;
    for (const path of CAP_HAND_PATHS)
      for (const [left, capping] of SPINS)
        for (const [right, circling] of SPINS) {
          const cap = capOnPath(path, left, right);
          const chart = path.caps.find((c) => {
            const pairing = capPairing(c);
            return pairing.capping === capping && pairing.circling === circling;
          })!;
          const label = `path ${path.column} ${capping} / ${circling}`;
          expect(capHandSteps(cap.left), label).toEqual(
            capHandSteps(chart.left)
          );
          const circlingSteps = capHandSteps(cap.right);
          const chartRight = capHandSteps(chart.right);
          if (circling !== "prospin") {
            expect(circlingSteps, label).toEqual(chartRight);
          } else {
            // The extra turn every third beat flips which way the prop
            // points from there on, so the other beats match in everything
            // but orientation.
            const motionOf = (step: SoloPropStepData) => ({
              ...step,
              startOrientation: undefined,
              endOrientation: undefined,
            });
            circlingSteps.forEach((step, i) => {
              const beat = `${label}, beat ${i + 1}`;
              if (i % 3 !== 2) {
                expect(motionOf(step), beat).toEqual(motionOf(chartRight[i]!));
                return;
              }
              expect(chartRight[i]!.turns, beat).toBe(0);
              expect(step.motionType, beat).toBe(MotionType.PRO);
              expect(step.turns, beat).toBe(1);
            });
          }
          matched++;
        }
    expect(matched).toBe(72);
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

  it("spins every hand path at one turn value, but the beat back", () => {
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
                if (i > 0) {
                  expect(step.startOrientation).toBe(
                    steps[i - 1]!.endOrientation
                  );
                }
                // The capping hand flips its motion only on the beat back,
                // which with no back picked takes the chart's turns: anti 1
                // after pro, pro 0 after anti.
                if (travelOf(step) !== forward) {
                  expect(step.motionType).toBe(flip[spin.motion]);
                  expect(step.turns).toBe(spin.motion === "pro" ? 1 : 0);
                  return;
                }
                // Every other beat, the circling hand's every beat
                // included, plays the picked turns.
                expect(step.turns).toBe(turns);
                const motion =
                  turns === "fl" ? step.prefloatMotionType : step.motionType;
                expect(motion).toBe(same[spin.motion]);
              });
            }
          }
        }
      }
    }
  });
});

describe("the capping hand's beat back", () => {
  it("plays the picked back turns on each beat the hand turns round", () => {
    for (const path of CAP_HAND_PATHS)
      for (const motion of ["pro", "anti"] as const)
        for (const back of [0, 1, 2, "fl"] as const) {
          const cap = capOnPath(
            path,
            { motion, turns: 1, back },
            { motion: "anti", turns: 1 }
          );
          const steps = capHandSteps(cap.left);
          const forward = travelOf(steps[0]!);
          const label = `path ${path.column} ${motion} back ${back}`;
          steps.forEach((step, i) =>
            expect(step.turns, `${label}, beat ${i + 1}`).toBe(
              travelOf(step) === forward ? 1 : back
            )
          );
        }
  });
});

describe("hand modes along each path", () => {
  // The page shows each beat's hand mode as its element. Two beats run in the
  // path's opening mode, then the capping hand's beat back flips the
  // direction; split and together paths also trade timing every three beats.
  // Read by the same deriver that draws the strips' element glyphs.
  const EXPECTED: Record<number, string> = {
    1: "SO SO SS TO TO SS",
    2: "TO TO TS SO SO TS",
    3: "TS TS TO SS SS TO",
    4: "SS SS SO TS TS SO",
    5: "QS QS QO",
    6: "QS QS QO",
    7: "QO QO QS",
    8: "QO QO QS",
  };
  it("matches the rhythm for every path", () => {
    for (const cap of CAPS) {
      const path = CAP_HAND_PATHS.find((p) => p.caps.includes(cap))!;
      const beats = capStrip(cap).slice(1);
      const modes = beats.map((step) => deriveTnDFromPictograph(step).tndMode);
      const rhythm = EXPECTED[path.column]!.split(" ");
      expect(modes, cap.id).toEqual(
        modes.map((_, i) => rhythm[i % rhythm.length])
      );
    }
  });
  // The path pickers show this rhythm as two lines of three.
  it("splits each path's six-step rhythm into its two halves", () => {
    for (const path of CAP_HAND_PATHS) {
      const rhythm = EXPECTED[path.column]!.split(" ");
      const six = [0, 1, 2, 3, 4, 5].map(
        (i) => TND_TO_ELEMENTAL[rhythm[i % rhythm.length] as TnDMode]
      );
      expect(capPathRhythm(path), `path ${path.column}`).toEqual([
        six.slice(0, 3),
        six.slice(3),
      ]);
    }
  });
  it("opens on the mode of the box the page puts it in", () => {
    for (const path of CAP_HAND_PATHS) {
      expect(capPathMode(path), `path ${path.column}`).toBe(
        EXPECTED[path.column]!.slice(0, 2)
      );
    }
  });
});

describe("the props on a hand path", () => {
  const TURNS = [0, 0.5, 1, 1.5, 2, 3] as const;
  const MOTIONS = ["anti", "pro"] as const;
  const reading = (r: ReturnType<typeof capPropRelationship>) =>
    `${r.kind} ${r.timing} ${r.direction}`;

  it("keep one direction on every beat", () => {
    for (const path of CAP_HAND_PATHS)
      for (const lm of MOTIONS)
        for (const rm of MOTIONS)
          for (const lt of TURNS)
            for (const rt of TURNS) {
              const cap = capOnPath(
                path,
                { motion: lm, turns: lt },
                { motion: rm, turns: rt }
              );
              const whole = capPropRelationship(cap);
              const beats = capStrip(cap).slice(1);
              beats.forEach((step, i) =>
                expect(
                  derivePropRelationshipForStep(step).direction,
                  `path ${path.column} ${lm} ${lt} / ${rm} ${rt}, beat ${i + 1}`
                ).toBe(whole.direction)
              );
              // The beat back keeps the chart's turns, so the timing can
              // change there, as in Gage's own 1-AA (split, then together).
              // The two beats before it share the first beat's reading.
              expect(reading(derivePropRelationshipForStep(beats[1]!))).toBe(
                reading(whole)
              );
            }
  });

  it("read Gage's 1-AA beat by beat as the corner glyph does", () => {
    // The beat back changes the props' timing, which is why the copy names
    // the CAP by its opening half.
    const cap = capOnPath(
      CAP_HAND_PATHS[0]!,
      { motion: "anti", turns: 1 },
      { motion: "anti", turns: 1 }
    );
    const readings = capStrip(cap)
      .slice(1)
      .map((step) => {
        const r = derivePropRelationshipForStep(step);
        return r.kind === "full" ? reading(r) : r.kind;
      });
    const six = [
      "full split opp",
      "full split opp",
      "direction-only",
      "full tog opp",
      "full tog opp",
      "direction-only",
    ];
    expect(readings).toEqual([...six, ...six]);
  });

  it("take the path's timing, and its direction when the motions match", () => {
    for (const path of CAP_HAND_PATHS)
      for (const lm of MOTIONS)
        for (const rm of MOTIONS)
          for (const [lt, rt] of [
            [1, 1],
            [0, 2],
          ] as const) {
            const props = capPropRelationship(
              capOnPath(
                path,
                { motion: lm, turns: lt },
                { motion: rm, turns: rt }
              )
            );
            const label = `path ${path.column} ${lm} ${lt} / ${rm} ${rt}`;
            const flips = (path.direction === "same") !== (lm === rm);
            expect(props.direction, label).toBe(flips ? "opp" : "same");
            if (lt === rt) {
              expect(props.kind, label).toBe("full");
              expect(props.timing, label).toBe(
                path.timing === "together" ? "tog" : path.timing
              );
            } else {
              expect(props.kind, label).toBe("direction-only");
            }
          }
  });
});
