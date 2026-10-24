/**
 * The authored hero pools against the real CAP rows and Zan's table, no mocks.
 * What would go wrong silently: an entry that does not close makes the hero
 * snap at the loop seam; a chained draw that misses its target makes the hero
 * teleport between sequences; Zan's built with HAND motions plays as hand
 * pictographs on straight paths instead of a prop.
 */
import { describe, it, expect } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { rotateSequenceGeometry } from "#lib/shared/create/services/sequence-derived-fields.js";
import { CAPS } from "#lib/shared/guide-topics/caps-topic.js";
import { ZANS_DIAMOND_ORIGINAL } from "#lib/shared/guide-topics/zans-diamond-topic.js";
import {
  HERO_CAP_POOL,
  HERO_ZANS_POOL,
  capSequence,
  drawAuthoredRealization,
  zansSequence,
  type AuthoredPoolId,
} from "../hero-authored-pool";
import { elementOf, startLocKey } from "../hero-draw-utils";

/** Closed means the last beat ends exactly on the start pose, orientation
 *  included, so the next pass (and the next chained draw) starts seamlessly. */
function closes(seq: SequenceData): boolean {
  const start = seq.startPlacement?.motions;
  const end = seq.steps.at(-1)?.motions;
  return (["left", "right"] as const).every(
    (hand) =>
      start?.[hand]?.startLocation === end?.[hand]?.endLocation &&
      start?.[hand]?.startOrientation === end?.[hand]?.endOrientation
  );
}

/** A small seeded generator so draws are repeatable. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Always picks entry `index`. */
function pick(index: number, size: number): () => number {
  return () => (index + 0.5) / size;
}

describe("hero authored pools", () => {
  it("holds the 72 chart CAPs plus 36 spins on each of the eight hand paths, and all 24 Zan's", () => {
    expect(HERO_CAP_POOL.length).toBe(72 + 8 * 36);
    expect(HERO_CAP_POOL.slice(0, 72)).toEqual(CAPS);
    expect(HERO_ZANS_POOL.length).toBe(24);
  });

  it("every CAP entry closes and has a VTG element", () => {
    for (const cap of HERO_CAP_POOL) {
      const seq = capSequence(cap);
      expect(closes(seq), cap.id).toBe(true);
      expect(elementOf(seq), cap.id).not.toBeNull();
    }
  });

  it("every Zan's variation closes and plays as a staff, not hands", () => {
    for (const variation of HERO_ZANS_POOL) {
      const seq = zansSequence(variation);
      expect(closes(seq), variation.id).toBe(true);
      for (const step of [seq.startPlacement!, ...seq.steps]) {
        expect(step.motions?.left?.propType, variation.id).toBe(PropType.STAFF);
        expect(step.motions?.right?.propType, variation.id).toBe(
          PropType.STAFF
        );
      }
    }
  });

  it.each(["caps", "zans"] as const)(
    "a %s draw chained to a diamond start lands on it",
    (pool: AuthoredPoolId) => {
      // A quarter turn of a real entry's start: a diamond pose the entry
      // itself does not start on, so the draw has to rotate to reach it.
      const source =
        pool === "caps"
          ? capSequence(CAPS[0]!)
          : zansSequence(ZANS_DIAMOND_ORIGINAL);
      const target = rotateSequenceGeometry(source, 2).startPlacement!;
      expect(startLocKey(target)).not.toBe(startLocKey(source.startPlacement));

      for (let seed = 1; seed <= 5; seed++) {
        const draw = drawAuthoredRealization({
          pool,
          chainStartPlacement: target,
          random: seeded(seed),
        });
        expect(draw).not.toBeNull();
        expect(startLocKey(draw!.sequence.startPlacement)).toBe(
          startLocKey(target)
        );
        // The first beat leaves from the target too, or the hero would jump.
        const first = draw!.sequence.steps[0]!.motions;
        expect(
          `${first.left?.startLocation}|${first.right?.startLocation}`
        ).toBe(startLocKey(target));
        expect(closes(draw!.sequence)).toBe(true);
      }
    }
  );

  it.each(["caps", "zans"] as const)(
    "a %s draw chained to a box start returns null",
    (pool: AuthoredPoolId) => {
      // One 45° step moves a diamond pose onto the box points, which the
      // diamond-only pools cannot reach with 90° rotations.
      const boxStart = rotateSequenceGeometry(
        capSequence(CAPS[0]!),
        1
      ).startPlacement!;
      expect(startLocKey(boxStart)).toMatch(/^(ne|se|sw|nw)\|(ne|se|sw|nw)$/);

      expect(
        drawAuthoredRealization({
          pool,
          chainStartPlacement: boxStart,
          random: seeded(7),
        })
      ).toBeNull();
    }
  );

  it("a Zan's draw plays twice through and carries no element; a CAP draw carries its element", () => {
    const zans = drawAuthoredRealization({ pool: "zans", random: seeded(3) });
    expect(zans?.sequence.steps).toHaveLength(16);
    expect(new Set(zans?.sequence.steps.map((s) => s.id)).size).toBe(16);
    expect(zans?.element).toBeNull();
    expect(zans?.sequence.isCircular).toBe(true);

    const cap = drawAuthoredRealization({ pool: "caps", random: seeded(3) });
    expect(cap?.element).not.toBeNull();
    expect(cap?.sequence.isCircular).toBe(true);
  });

  // The design expected the reversed Zan's families and some CAPs to bring
  // reversal dots to the hero. They cannot: the dots mark a prop changing spin
  // direction, and both records keep every prop turning one way (a CAP's
  // capping hand switches pro/anti on its beat back; a reversed Zan's walks
  // the hand path backwards with the prop's spin kept). This pins that, so the
  // hero's dots are not assumed to come from here; they come from the mixed
  // generated draws (per-visit-demo-continuity.test.ts). If an entry is ever
  // added that does flip a prop, this fails and the bake is already in place.
  it("bakes no reversal dots: no authored entry flips a prop's spin", () => {
    const pools: [AuthoredPoolId, number][] = [
      ["caps", HERO_CAP_POOL.length],
      ["zans", HERO_ZANS_POOL.length],
    ];
    for (const [pool, size] of pools) {
      for (let i = 0; i < size; i++) {
        const draw = drawAuthoredRealization({ pool, random: pick(i, size) });
        const flagged = draw!.sequence.steps.filter(
          (s) => s.leftReversal || s.rightReversal
        );
        expect(flagged, `${pool} ${i}`).toHaveLength(0);
      }
    }
  });
});
