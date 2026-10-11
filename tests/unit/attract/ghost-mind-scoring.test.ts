/**
 * The mind is pure logic and this is where it is cheap to protect
 * (spec: 2026-08-04-ghost-mind-design.md §Testing). No DOM, no rendering —
 * these prove that boredom emerges, that novelty stops repetition, that the
 * tour is reproducible from a seed, and that no intention assumes state.
 */

import { describe, expect, it } from "vitest";
import { createRng } from "#lib/shared/attract/services/rng.js";
import { createTrail } from "#lib/shared/attract/services/trail.js";
import {
  FATIGUE_GAIN,
  createMemory,
  decayFatigue,
  noveltyOf,
  remember,
  scoreAll,
  scoreIntention,
  selectIntention,
} from "#lib/shared/attract/domain/scoring.js";
import type {
  GhostContext,
  GhostWorld,
  Intention,
  IntentionCategory,
} from "#lib/shared/attract/domain/intention.js";

const EMPTY_WORLD: GhostWorld = {
  moduleId: null,
  tabId: null,
  hasSequence: false,
  sequenceLength: 0,
  sequenceWord: null,
  isPlaying: false,
  activeEffectIds: [],
  viewerOpen: false,
  pickerOpen: false,
  reachableModules: [],
};

function makeCtx(world: Partial<GhostWorld> = {}, seed = 7): GhostContext {
  const rng = createRng(seed);
  return { ...EMPTY_WORLD, ...world, ...createMemory(rng, createTrail(() => 0)) };
}

function fake(
  id: string,
  category: IntentionCategory,
  appeal = 0.5,
): Intention {
  return {
    id,
    category,
    thought: id,
    can: () => true,
    appeal: () => appeal,
    perform: async () => {},
  };
}

describe("ghost mind scoring", () => {
  it("produces the same tour twice for a fixed seed, and a different one otherwise", () => {
    const bag = [
      fake("a", "build"),
      fake("b", "playback"),
      fake("c", "effects"),
      fake("d", "explore"),
      fake("e", "admire"),
      fake("f", "props"),
    ];

    const tour = (seed: number) => {
      const ctx = makeCtx({}, seed);
      const picked: string[] = [];
      for (let i = 0; i < 25; i++) {
        decayFatigue(ctx);
        const next = selectIntention(bag, ctx);
        if (!next) break;
        picked.push(next.id);
        remember(ctx, next);
      }
      return picked;
    };

    expect(tour(42)).toEqual(tour(42));
    expect(tour(42)).not.toEqual(tour(43));
    expect(tour(42)).toHaveLength(25);
  });

  it("drives a category switch once fatigue builds — boredom emerges", () => {
    // Effects is the most appealing thing in the world by a wide margin. If
    // fatigue works, the ghost still gets bored of it and looks elsewhere.
    const bag = [fake("tweak", "effects", 1), fake("wander", "explore", 0.4)];
    const ctx = makeCtx();

    const picked: string[] = [];
    for (let i = 0; i < 12; i++) {
      decayFatigue(ctx);
      const next = selectIntention(bag, ctx)!;
      picked.push(next.id);
      remember(ctx, next);
    }

    expect(picked[0]).toBe("tweak");
    expect(picked).toContain("wander");
    // And it does not simply flee forever: fatigue decays back.
    expect(picked.filter((id) => id === "tweak").length).toBeGreaterThan(1);
  });

  it("strictly decreases novelty on repeat", () => {
    const ctx = makeCtx();
    const intention = fake("repeatable", "build");

    const first = scoreIntention(intention, ctx);
    remember(ctx, intention);
    const second = scoreIntention(intention, ctx);
    remember(ctx, intention);
    const third = scoreIntention(intention, ctx);

    expect(noveltyOf(ctx, "repeatable")).toBeCloseTo(1 / 3);
    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
  });

  it("applies the momentum bonus only to natural successors", () => {
    const ctx = makeCtx();
    ctx.lastCategory = "build";
    // build -> playback is a natural successor; build -> admire is not.
    expect(scoreIntention(fake("p", "playback"), ctx)).toBeGreaterThan(
      scoreIntention(fake("a", "admire"), ctx),
    );
  });

  it("caps fatigue at 1 and decays it back toward 0", () => {
    const ctx = makeCtx();
    for (let i = 0; i < 10; i++) remember(ctx, fake("x", "effects"));
    expect(ctx.fatigue.get("effects")).toBe(1);
    expect(scoreIntention(fake("y", "effects"), ctx)).toBe(0);

    for (let i = 0; i < 50; i++) decayFatigue(ctx);
    expect(ctx.fatigue.get("effects")).toBe(0);
  });

  it("returns null rather than throwing when nothing is satisfiable", () => {
    const ctx = makeCtx();
    const impossible: Intention = { ...fake("nope", "build"), can: () => false };
    const thrower: Intention = {
      ...fake("boom", "build"),
      can: () => {
        throw new Error("sensor exploded");
      },
    };

    expect(scoreAll([impossible, thrower], ctx)).toEqual([]);
    expect(selectIntention([impossible, thrower], ctx)).toBeNull();
  });

  it("never picks argmax deterministically when several candidates are close", () => {
    const bag = [
      fake("a", "build", 0.9),
      fake("b", "build", 0.88),
      fake("c", "build", 0.86),
    ];
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const ctx = makeCtx({}, seed);
      seen.add(selectIntention(bag, ctx)!.id);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("adds the documented fatigue per performance", () => {
    const ctx = makeCtx();
    remember(ctx, fake("one", "props"));
    expect(ctx.fatigue.get("props")).toBeCloseTo(FATIGUE_GAIN);
  });
});
