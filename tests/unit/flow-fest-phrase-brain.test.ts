import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  beatsPerStepAt,
  countJoinMismatches,
  DEFAULT_PHRASE_BRAIN_SETTINGS,
  phraseEntryJoins,
  phraseStartPositions,
  planeShareTargets,
  planPhrases,
  PLANE_RUN_MAX,
  PLANE_RUN_MIN,
  turnBeatsFor,
  wrapAngle,
  type PhraseBrainSettings,
  type PhrasePerformerSpec,
  type ScheduledPhrase,
} from "../../src/lib/features/flow-fest-sim/domain/flow-fest-phrase-brain";
import {
  DEFAULT_WALK_SAFE,
  PHRASE_PLANES,
  isClosedLoop,
  isWalkSafeIn,
  joinDistance,
  tagPhraseSequence,
  type PhraseLibrary,
  type PhraseStepLike,
} from "../../src/lib/features/flow-fest-sim/domain/flow-fest-phrase-library";
import { rebuildPhraseSequence } from "../../src/lib/features/flow-fest-sim/domain/flow-fest-phrase-sequence";
import {
  buildPhraseStageSchedule,
  PHRASE_STAGE_PERFORMERS,
  PHRASE_STAGE_TEMPO_BPM,
} from "../../src/lib/features/flow-fest-sim/domain/flow-fest-phrase-stage";
import { isExactStepCountSupported } from "../../src/lib/shared/3d/locomotion/straight-travel-constraints";

const library = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../static/data/flow-fest/phrase-library.json"),
    "utf8"
  )
) as PhraseLibrary;
const byId = new Map(library.entries.map((e) => [e.id, e]));

const [TECHER, WANDERER] = PHRASE_STAGE_PERFORMERS as [
  PhrasePerformerSpec,
  PhrasePerformerSpec,
];
const TEMPO = PHRASE_STAGE_TEMPO_BPM;
const LENGTH = 512;

function plan(
  performer: PhrasePerformerSpec,
  settings: PhraseBrainSettings = DEFAULT_PHRASE_BRAIN_SETTINGS
) {
  return planPhrases({
    performer,
    tempoBpm: TEMPO,
    lengthBeats: LENGTH,
    library: library.entries,
    settings,
  });
}

function beatsIn(
  phrases: readonly ScheduledPhrase[],
  mode: ScheduledPhrase["mode"]
) {
  return phrases
    .filter((p) => !p.rest && p.mode === mode)
    .reduce((sum, p) => sum + p.beats, 0);
}

/** A run of several seeds per personality, so the shape claims are not one lucky draw. */
const SEEDS = [11, 23, 37, 41, 59, 73];
const nights = SEEDS.flatMap((seed) => [
  {
    who: "techer",
    phrases: plan({ ...TECHER, seed }),
    performer: { ...TECHER, seed },
  },
  {
    who: "wanderer",
    phrases: plan({ ...WANDERER, seed }),
    performer: { ...WANDERER, seed },
  },
]);

function step(
  left: [string, string, number],
  right: [string, string, number]
): PhraseStepLike {
  const hand = ([motionType, rotationDirection, turns]: [
    string,
    string,
    number,
  ]) => ({
    motionType,
    rotationDirection,
    turns,
  });
  return { motions: { left: hand(left), right: hand(right) } };
}

describe("phrase library tags", () => {
  it("calls one-direction hands a spin and reversing hands a figure-eight", () => {
    const spin = tagPhraseSequence([
      step(["pro", "cw", 0], ["pro", "cw", 0]),
      step(["pro", "cw", 0], ["pro", "cw", 0]),
      step(["pro", "cw", 0], ["pro", "cw", 0]),
      step(["pro", "cw", 0], ["pro", "cw", 0]),
    ]);
    expect(spin.kind).toBe("spin");
    expect(spin.reversals).toBe(0);
    expect(spin.walkPlanes).toEqual(["wheel"]);

    const eight = tagPhraseSequence([
      step(["pro", "cw", 0], ["pro", "ccw", 0]),
      step(["pro", "ccw", 0], ["pro", "cw", 0]),
      step(["pro", "cw", 0], ["pro", "ccw", 0]),
      step(["pro", "ccw", 0], ["pro", "cw", 0]),
    ]);
    expect(eight.kind).toBe("figure-eight");
    expect(eight.walkPlanes).toEqual(["wall"]);
  });

  it("calls dash-heavy material a pass, walkable in any plane", () => {
    const pass = tagPhraseSequence([
      step(["dash", "noRotation", 0], ["pro", "cw", 0]),
      step(["pro", "cw", 0], ["dash", "noRotation", 0]),
      step(["pro", "cw", 0], ["pro", "cw", 0]),
      step(["pro", "cw", 0], ["pro", "cw", 0]),
    ]);
    expect(pass.kind).toBe("pass");
    expect(pass.walkPlanes).toEqual(["wall", "wheel", "floor"]);
  });

  it("keeps turns and floats off the walk and scores them harder", () => {
    const plain = tagPhraseSequence(
      Array.from({ length: 4 }, () => step(["pro", "cw", 0], ["pro", "cw", 0]))
    );
    const turned = tagPhraseSequence(
      Array.from({ length: 4 }, () => step(["pro", "cw", 1], ["pro", "cw", 1]))
    );
    const floated = tagPhraseSequence([
      step(["float", "noRotation", 0], ["pro", "cw", 0]),
      ...Array.from({ length: 3 }, () =>
        step(["pro", "cw", 0], ["pro", "cw", 0])
      ),
    ]);
    expect(turned.totalTurns).toBe(8);
    expect(turned.walkSafe).toBe(false);
    expect(floated.walkSafe).toBe(false);
    expect(turned.difficulty).toBeGreaterThan(plain.difficulty);
    expect(floated.difficulty).toBeGreaterThan(plain.difficulty);
    const levelFive = tagPhraseSequence(
      Array.from({ length: 4 }, () => step(["pro", "cw", 0], ["pro", "cw", 0])),
      5
    );
    expect(levelFive.difficulty).toBeGreaterThan(plain.difficulty);
  });

  it("follows the settings, not a fixed list", () => {
    const eight = tagPhraseSequence([
      step(["pro", "cw", 0], ["pro", "ccw", 0]),
      step(["pro", "ccw", 0], ["pro", "cw", 0]),
    ]);
    expect(isWalkSafeIn(eight, "wall", DEFAULT_WALK_SAFE)).toBe(true);
    expect(
      isWalkSafeIn(eight, "wall", { ...DEFAULT_WALK_SAFE, moves: [] })
    ).toBe(false);
    expect(
      isWalkSafeIn(eight, "floor", {
        ...DEFAULT_WALK_SAFE,
        moves: [{ kind: "figure-eight", plane: "floor" }],
      })
    ).toBe(true);
    expect(
      isWalkSafeIn(eight, "wall", { ...DEFAULT_WALK_SAFE, maxDifficulty: -1 })
    ).toBe(false);
  });

  it("stores tags that match the rebuilt sequences, and every one is plane-change free", () => {
    expect(library.entries.length).toBeGreaterThan(100);
    for (const entry of library.entries) {
      const rebuilt = rebuildPhraseSequence(entry);
      expect(rebuilt.steps.length).toBe(entry.beats);
      expect(
        tagPhraseSequence(
          rebuilt.steps as unknown as PhraseStepLike[],
          entry.level
        )
      ).toEqual(entry.tags);
      expect(entry.tags.planeChangeFree).toBe(true);
    }
  });
});

describe("phrase brain", () => {
  it.each(nights.map((n) => [n.who, n.performer.seed, n] as const))(
    "%s seed %i tiles the night and keeps rules 1 to 8",
    (_who, _seed, { phrases, performer }) => {
      let beat = 0;
      let facing = performer.outwardYaw;
      for (const [i, phrase] of phrases.entries()) {
        // The phrases tile the night, and facing carries across them.
        expect(phrase.startBeat).toBe(beat);
        beat += phrase.beats;
        expect(phrase.facingStart).toBeCloseTo(facing, 3);
        facing = phrase.facingEnd;

        const entry = byId.get(phrase.sequenceId)!;
        expect(entry).toBeDefined();
        if (!phrase.rest) {
          // Rule 1: one sequence, played one to three times.
          expect(phrase.repeats).toBeGreaterThanOrEqual(1);
          expect(phrase.repeats).toBeLessThanOrEqual(3);
          expect(phrase.beats).toBe(entry.beats * phrase.repeats);
        }
        // Planes: one pair per beat of one play of the sequence; the label
        // is the plane most staff-beats are in.
        expect(phrase.beatPlanes).toHaveLength(entry.beats);
        const count = (p: string) =>
          phrase.beatPlanes.filter((b) => b.left === p).length +
          phrase.beatPlanes.filter((b) => b.right === p).length;
        for (const p of PHRASE_PLANES)
          expect(count(phrase.plane)).toBeGreaterThanOrEqual(count(p));
        // A rest holds both staffs' planes and the body's facing.
        if (phrase.rest) {
          for (const hand of ["left", "right"] as const)
            expect(new Set(phrase.beatPlanes.map((b) => b[hand])).size).toBe(1);
          if (i > 0)
            expect(phrase.facingTarget).toBe(phrases[i - 1]!.facingTarget);
        }
        // Rule 4: walk-safe material, each staff held in a plane it is
        // walk-safe in, one footfall per beatsPerStep from the first beat.
        if (phrase.mode === "travelling") {
          for (const hand of ["left", "right"] as const) {
            const planes = new Set(phrase.beatPlanes.map((b) => b[hand]));
            expect(planes.size).toBe(1);
            expect(
              isWalkSafeIn(entry.tags, [...planes][0]!, DEFAULT_WALK_SAFE)
            ).toBe(true);
          }
          const path = phrase.path!;
          expect(path.steps * path.beatsPerStep).toBeLessThanOrEqual(
            phrase.beats
          );
          const distance = Math.hypot(
            path.to.x - path.from.x,
            path.to.z - path.from.z
          );
          const seconds = (path.steps * path.beatsPerStep * 60) / TEMPO;
          expect(isExactStepCountSupported(distance, seconds, path.steps)).toBe(
            true
          );
          expect(phrase.facingEnd).toBe(phrase.facingStart);
        } else {
          expect(phrase.path).toBeNull();
        }
        // Rule 5: hard material is planted.
        if (
          entry.tags.difficulty > DEFAULT_PHRASE_BRAIN_SETTINGS.hardDifficulty
        )
          expect(phrase.mode).toBe("planted");
        // Rule 7: a walk and a rest keep the root; a planted phrase turns it,
        // grid and all, to the body's target.
        if (phrase.mode === "travelling" || phrase.rest)
          expect(phrase.facingEnd).toBe(phrase.facingStart);
        else if (phrase.mode === "planted")
          expect(phrase.facingEnd).toBe(phrase.facingTarget);
        // Rule 8: at most two turns in a row.
        if (i >= 2 && phrase.mode === "turning")
          expect(
            phrases[i - 1]!.mode === "turning" &&
              phrases[i - 2]!.mode === "turning"
          ).toBe(false);
        // Turns use the authored clips: a quarter over two beats, a half over three.
        if (phrase.mode === "turning") {
          const delta = Math.abs(
            wrapAngle(phrase.facingEnd - phrase.facingStart)
          );
          expect(
            [Math.PI / 2, Math.PI].some((d) => Math.abs(d - delta) < 1e-3)
          ).toBe(true);
          expect(phrase.turnBeats).toBe(turnBeatsFor(delta, TEMPO));
          expect(phrase.turnBeats!).toBeLessThan(phrase.beats);
        } else {
          expect(phrase.turnBeats).toBeNull();
        }
      }
      expect(beat).toBe(LENGTH);
    }
  );

  it("starts every phrase where the last one left the hands (rule 10)", () => {
    for (const { who, phrases, performer } of nights) {
      const label = `${who} seed ${performer.seed}`;
      expect(countJoinMismatches(phrases, library.entries), label).toBe(0);
      let chain: ReturnType<typeof phraseEntryJoins> = null;
      for (const [i, phrase] of phrases.entries()) {
        const joins = phraseEntryJoins(byId.get(phrase.sequenceId)!)!;
        if (chain)
          expect(joinDistance(joins.start, chain.end), `${label} at ${i}`).toBe(
            0
          );
        // Only a sequence that ends where it starts repeats.
        if (phrase.repeats > 1) expect(isClosedLoop(joins), label).toBe(true);
        // A rest holds the chain; it does not move it.
        if (!phrase.rest) chain = joins;
      }
    }
  });

  it("walks two steps a beat at the stage's 60 bpm, where a step a beat is too slow", () => {
    expect(PHRASE_STAGE_TEMPO_BPM).toBe(60);
    expect(beatsPerStepAt(60)).toBe(0.5);
    expect(beatsPerStepAt(120)).toBe(1);
    expect(beatsPerStepAt(180)).toBe(2);
    expect(turnBeatsFor(Math.PI / 2, 60)).toBe(1);
    expect(turnBeatsFor(Math.PI, 60)).toBe(2);
    expect(turnBeatsFor(Math.PI / 2, 120)).toBe(2);
    expect(turnBeatsFor(Math.PI, 120)).toBe(3);
  });

  it("keeps every walk inside the area, starting where the last one ended", () => {
    for (const { phrases, performer } of nights) {
      const starts = phraseStartPositions(performer.home, phrases);
      let at = performer.home;
      for (const [i, phrase] of phrases.entries()) {
        expect(starts[i]!.x).toBeCloseTo(at.x, 3);
        expect(starts[i]!.z).toBeCloseTo(at.z, 3);
        if (phrase.path) {
          at = phrase.path.to;
          expect(
            Math.hypot(at.x - performer.home.x, at.z - performer.home.z)
          ).toBeLessThanOrEqual(performer.areaRadius);
        }
      }
    }
  });

  it("is the same night for the same seed and a different one for another", () => {
    expect(plan(WANDERER)).toEqual(plan(WANDERER));
    expect(plan({ ...WANDERER, seed: WANDERER.seed + 1 })).not.toEqual(
      plan(WANDERER)
    );
  });

  it("has the techer planting most of the time and the wanderer travelling more", () => {
    // The root follows a planted body round (10-27), so a walk heads off at
    // whatever angle the body drifted to and now and then runs a techer into
    // the area's edge, a turn and the walks after it; seed 73 plants 45%.
    // Most nights, and the techer's nights together, still plant most.
    let techerPlanted = 0;
    let wandererPlanted = 0;
    let mostlyPlanted = 0;
    for (const seed of SEEDS) {
      const techer = nights.find(
        (n) => n.who === "techer" && n.performer.seed === seed
      )!.phrases;
      const wanderer = nights.find(
        (n) => n.who === "wanderer" && n.performer.seed === seed
      )!.phrases;
      techerPlanted += beatsIn(techer, "planted");
      if (beatsIn(techer, "planted") / LENGTH > 0.6) mostlyPlanted++;
      expect(beatsIn(wanderer, "travelling")).toBeGreaterThan(
        beatsIn(techer, "travelling")
      );
      wandererPlanted += beatsIn(wanderer, "planted");
    }
    expect(techerPlanted / (LENGTH * SEEDS.length)).toBeGreaterThan(0.75);
    expect(techerPlanted).toBeGreaterThan(wandererPlanted);
    expect(mostlyPlanted).toBeGreaterThanOrEqual(SEEDS.length - 1);
    const walked = nights
      .filter((n) => n.who === "wanderer")
      .map((n) => beatsIn(n.phrases, "travelling"));
    expect(Math.min(...walked)).toBeGreaterThan(48);
  });

  it("gives each staff its own plane per beat, in runs of 2 to 6 beats, at the night's shares", () => {
    // A long night per personality, so the shares settle.
    for (const performer of [TECHER, WANDERER]) {
      for (const seed of [11, 23, 37]) {
        const label = `${performer.id} seed ${seed}`;
        const phrases = planPhrases({
          performer: { ...performer, seed },
          tempoBpm: TEMPO,
          lengthBeats: 4096,
          library: library.entries,
        });
        const targets = planeShareTargets(performer.personality.style);
        const played = {
          left: { wall: 0, wheel: 0, floor: 0 },
          right: { wall: 0, wheel: 0, floor: 0 },
        };
        let beats = 0;
        let differ = 0;
        let held = 0;
        let changing = 0;
        for (const phrase of phrases) {
          if (phrase.rest) continue;
          for (let r = 0; r < phrase.repeats; r++)
            for (const planes of phrase.beatPlanes) {
              beats++;
              played.left[planes.left]++;
              played.right[planes.right]++;
              if (planes.left !== planes.right) differ++;
            }
          if (phrase.mode === "travelling") continue;
          // Within a phrase each staff either holds one plane throughout or
          // changes plane after runs of 2 to 6 beats; a repeated pattern
          // changes plane at its seam too, so no run outlasts six beats.
          for (const hand of ["left", "right"] as const) {
            const track = phrase.beatPlanes.map((b) => b[hand]);
            if (track.every((p) => p === track[0])) {
              held++;
              continue;
            }
            changing++;
            const runs: number[] = [];
            let n = 1;
            for (let i = 1; i <= track.length; i++) {
              if (i < track.length && track[i] === track[i - 1]) n++;
              else {
                runs.push(n);
                n = 1;
              }
            }
            for (const run of runs) {
              expect(run, label).toBeGreaterThanOrEqual(PLANE_RUN_MIN);
              expect(run, label).toBeLessThanOrEqual(PLANE_RUN_MAX);
            }
            if (phrase.repeats > 1)
              expect(track.at(-1), `${label} repeat seam`).not.toBe(track[0]);
          }
        }
        for (const hand of ["left", "right"] as const)
          for (const p of PHRASE_PLANES)
            expect(
              Math.abs(played[hand][p] / beats - targets[p]),
              `${label} ${hand} ${p}`
            ).toBeLessThanOrEqual(0.08);
        // The hands change independently, so they often differ.
        expect(differ / beats, label).toBeGreaterThanOrEqual(0.3);
        // A sequence may hold one plane throughout, but most change.
        expect(held, label).toBeGreaterThan(0);
        expect(changing, label).toBeGreaterThan(held);
      }
    }
    // Wall and wheel carry the night; floor is occasional.
    expect(planeShareTargets(0).floor).toBeLessThan(0.1);
    expect(planeShareTargets(1).floor).toBeLessThan(0.1);
    expect(planeShareTargets(0).wall).toBeGreaterThan(
      planeShareTargets(0).wheel
    );
    expect(planeShareTargets(1).wheel).toBeGreaterThan(
      planeShareTargets(1).wall
    );
  });

  it("drifts the body's facing to any angle, back toward the audience when turned far away", () => {
    const quarter = Math.PI / 2;
    const degree = Math.PI / 180;
    let targets = 0;
    let square = 0;
    for (const { who, phrases, performer } of nights) {
      const label = `${who} seed ${performer.seed}`;
      let previous = performer.outwardYaw;
      for (const [i, phrase] of phrases.entries()) {
        if (phrase.mode === "planted" && !phrase.rest) {
          // At most 70 degrees from the last target, once a phrase.
          const drift = wrapAngle(phrase.facingTarget - previous);
          expect(Math.abs(drift), `${label} at ${i}`).toBeLessThanOrEqual(
            70 * degree + 1e-3
          );
          // Turned more than 100 degrees from the audience, it comes back.
          const off = wrapAngle(previous - performer.outwardYaw);
          if (Math.abs(off) > 100 * degree && drift !== 0)
            expect(Math.sign(drift), `${label} at ${i}`).toBe(-Math.sign(off));
        }
        if (!phrase.rest && phrase.facingTarget !== previous) {
          targets++;
          const r = Math.abs(phrase.facingTarget) % quarter;
          if (Math.min(r, quarter - r) < degree) square++;
        }
        previous = phrase.facingTarget;
      }
    }
    // Any angle: a new target lands within a degree of a multiple of 90
    // about as often as chance puts it there (2 in 90), never as the rule.
    expect(targets).toBeGreaterThan(150);
    expect(square / targets).toBeLessThan(0.06);
  });

  it("turns the root only to set off on a walk, never in a planted phrase", () => {
    let turns = 0;
    let walkAfter = 0;
    for (const { phrases } of nights) {
      for (const [i, phrase] of phrases.entries()) {
        if (phrase.mode === "planted") expect(phrase.turnBeats).toBeNull();
        if (phrase.mode !== "turning") continue;
        turns++;
        const next = phrases.slice(i + 1).find((p) => !p.rest);
        if (next?.mode === "travelling" || next?.mode === "turning")
          walkAfter++;
      }
    }
    expect(turns).toBeGreaterThan(0);
    // The walk a turn sets up is tried next; it falls back to standing only
    // when no walk fits.
    expect(walkAfter / turns).toBeGreaterThan(0.8);
  });

  it("picks from the whole library, sequences that do not end where they start included", () => {
    const open = library.entries.filter(
      (e) => !isClosedLoop(phraseEntryJoins(e)!)
    );
    expect(open.length).toBeGreaterThan(0);
    const openIds = new Set(open.map((e) => e.id));
    const picked = Array.from({ length: 24 }, (_, i) =>
      [TECHER, WANDERER].flatMap((performer) =>
        planPhrases({
          performer: { ...performer, seed: 100 + i },
          tempoBpm: TEMPO,
          lengthBeats: 1024,
          library: library.entries,
        })
      )
    ).flat();
    const openPicks = picked.filter(
      (p) => !p.rest && openIds.has(p.sequenceId)
    );
    expect(openPicks.length).toBeGreaterThan(0);
    // They play once: only a sequence that ends where it starts repeats.
    for (const phrase of openPicks) expect(phrase.repeats).toBe(1);
  });

  it("has the wanderer walking over a third of the time and turning less", () => {
    const share = (
      phrases: readonly ScheduledPhrase[],
      mode: ScheduledPhrase["mode"]
    ) => phrases.filter((p) => p.mode === mode).length / phrases.length;
    const wanderers = nights.filter((n) => n.who === "wanderer");
    const mean = (mode: ScheduledPhrase["mode"]) =>
      wanderers.reduce((sum, n) => sum + share(n.phrases, mode), 0) /
      wanderers.length;
    expect(mean("travelling")).toBeGreaterThanOrEqual(0.3);
    expect(mean("travelling")).toBeLessThanOrEqual(0.5);
    expect(mean("turning")).toBeLessThan(mean("travelling"));
    for (const { phrases, performer } of wanderers)
      expect(
        share(phrases, "turning"),
        `wanderer seed ${performer.seed}`
      ).toBeLessThanOrEqual(0.3);
  });

  it("walks only what the walk-safe settings allow", () => {
    const noWalking: PhraseBrainSettings = {
      ...DEFAULT_PHRASE_BRAIN_SETTINGS,
      walkSafe: { ...DEFAULT_WALK_SAFE, moves: [] },
    };
    expect(plan(WANDERER, noWalking).some((p) => p.mode === "travelling")).toBe(
      false
    );

    const wheelSpinsOnly: PhraseBrainSettings = {
      ...DEFAULT_PHRASE_BRAIN_SETTINGS,
      walkSafe: {
        ...DEFAULT_WALK_SAFE,
        moves: [{ kind: "spin", plane: "wheel" }],
      },
    };
    const walks = plan(WANDERER, wheelSpinsOnly).filter(
      (p) => p.mode === "travelling"
    );
    expect(walks.length).toBeGreaterThan(0);
    for (const walk of walks) {
      expect(walk.plane).toBe("wheel");
      for (const planes of walk.beatPlanes)
        expect(planes).toEqual({ left: "wheel", right: "wheel" });
      expect(byId.get(walk.sequenceId)!.tags.kind).toBe("spin");
    }
  });

  it("leaves poi and rope dart to the grid work", () => {
    expect(() => plan({ ...WANDERER, propFamily: "poi" })).toThrow();
    expect(() => plan({ ...WANDERER, propFamily: "rope-dart" })).toThrow();
  });
});

describe("phrase stage schedule file", () => {
  it("gives both stage performers room to walk, in areas that do not overlap", () => {
    const [left, right] = PHRASE_STAGE_PERFORMERS;
    expect(
      Math.hypot(left!.home.x - right!.home.x, left!.home.z - right!.home.z)
    ).toBeGreaterThan(left!.areaRadius + right!.areaRadius);
    // A radius too small for the shortest walk once kept the techer planted
    // for every seed; the techer still travels, just rarely.
    const walked = Array.from({ length: 24 }, (_, i) =>
      buildPhraseStageSchedule(library.entries, {
        performers: [{ ...left!, seed: i + 1 }],
      }).performers[0]!.phrases.some((p) => p.mode === "travelling")
    ).filter(Boolean).length;
    expect(walked).toBeGreaterThan(12);
  });

  it("has both stage spinners playing every plane on each staff, and the wanderer wandering", () => {
    const [techer, wanderer] = buildPhraseStageSchedule(library.entries)
      .performers as [
      { phrases: ScheduledPhrase[] },
      { phrases: ScheduledPhrase[] },
    ];
    for (const { phrases } of [techer, wanderer])
      for (const hand of ["left", "right"] as const)
        expect(
          new Set(phrases.flatMap((p) => p.beatPlanes.map((b) => b[hand])))
        ).toEqual(new Set(["wall", "wheel", "floor"]));
    // Planes change mid-sequence: most of the techer's phrases change plane
    // inside the sequence.
    const changesInside = (phrases: readonly ScheduledPhrase[]) =>
      phrases.filter(
        (p) =>
          !p.rest &&
          p.beatPlanes.some(
            (b, i) =>
              i > 0 &&
              (b.left !== p.beatPlanes[i - 1]!.left ||
                b.right !== p.beatPlanes[i - 1]!.right)
          )
      ).length;
    expect(changesInside(techer.phrases)).toBeGreaterThan(
      techer.phrases.length / 2
    );
    const share = (mode: ScheduledPhrase["mode"]) =>
      wanderer.phrases.filter((p) => p.mode === mode).length /
      wanderer.phrases.length;
    expect(share("travelling")).toBeGreaterThanOrEqual(0.25);
    expect(share("turning")).toBeLessThanOrEqual(0.3);
    expect(
      techer.phrases.filter((p) => p.mode === "turning").length
    ).toBeLessThanOrEqual(3);
  });

  it("is what the brain writes for the stage's fixed seeds", () => {
    const file = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          "../../static/data/flow-fest/phrase-stage-schedule.json"
        ),
        "utf8"
      )
    );
    expect(file).toEqual(buildPhraseStageSchedule(library.entries));
    expect(file.version).toBe("flow-fest-phrase-schedule-v1");
    expect(file.tempoBpm).toBe(60);
    for (const performer of file.performers)
      expect(
        countJoinMismatches(performer.phrases, library.entries),
        performer.id
      ).toBe(0);
    expect(
      file.performers.map((p: { id: string; seed: number }) => [p.id, p.seed])
    ).toEqual([
      ["stage-left", 11],
      ["stage-right", 23],
    ]);
    for (const performer of file.performers) {
      for (const phrase of performer.phrases) {
        expect(Object.keys(phrase)).toEqual([
          "startBeat",
          "beats",
          "sequenceId",
          "sequenceName",
          "repeats",
          "plane",
          "beatPlanes",
          "mode",
          "facingStart",
          "facingEnd",
          "facingTarget",
          "turnBeats",
          "path",
          "rest",
          "timing",
        ]);
      }
    }
  });
});
