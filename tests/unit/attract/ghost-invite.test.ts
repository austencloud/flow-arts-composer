/**
 * The invitation family and the savor beat
 * (spec: 2026-08-05-ghost-presence-design.md).
 *
 * Both are cheap to get subtly wrong in ways nobody notices until the laptop
 * has been running for an hour in front of strangers:
 *
 * - An invitation that fires without its budget becomes a nag, and one that
 *   fires during playback or over a modal talks across the only good bit.
 * - `point-it-out` MUST leave its target unpressed. The unfinished action is
 *   the entire mechanism — if it presses, it is just another intention and the
 *   invitation evaporates.
 * - `savor` must be opt-in per intention forever. The global version of that
 *   behaviour was the "moves out of the way after clicking" bug (3b912bbc97).
 */

import { describe, expect, it } from "vitest";
import { createRng } from "$lib/shared/attract/services/rng";
import { createTrail, type Trail } from "$lib/shared/attract/services/trail";
import { createMemory } from "$lib/shared/attract/domain/scoring";
import {
  EMPTY_WORLD,
  type GhostContext,
} from "$lib/shared/attract/domain/intention";
import { INVITE_INTENTIONS } from "$lib/shared/attract/intentions/invite";
import { ALL_INTENTIONS } from "$lib/shared/attract/intentions";

/** A trail with `count` successful decisions already on it. */
function warmTrail(count: number): Trail {
  const trail = createTrail();
  for (let i = 0; i < count; i++) {
    trail.push({ intentionId: "x", thought: "", moduleId: "create", ok: true });
  }
  return trail;
}

function ctxWith(overrides: Partial<GhostContext> = {}, decisions = 8): GhostContext {
  const trail = warmTrail(decisions);
  const memory = createMemory(createRng(1), trail);
  return {
    ...EMPTY_WORLD,
    ...memory,
    // Something pointable on screen, so `point-it-out` is a fair candidate.
    available: { ...EMPTY_WORLD.available, effect: 3, play: 1 },
    hasSequence: true,
    ...overrides,
  } as GhostContext;
}

const inviteById = (id: string) => INVITE_INTENTIONS.find((i) => i.id === id)!;

describe("invitation preconditions", () => {
  it("offers once the ghost has actually demonstrated something", () => {
    const ctx = ctxWith();
    expect(INVITE_INTENTIONS.every((i) => i.can(ctx))).toBe(true);
  });

  it("stays quiet before the warm-up — an offer in the first seconds is a popup", () => {
    const ctx = ctxWith({}, 1);
    expect(INVITE_INTENTIONS.some((i) => i.can(ctx))).toBe(false);
  });

  it.each([
    ["playback", { isPlaying: true }],
    ["an open viewer", { viewerOpen: true }],
    ["a module running its own show", { presenting: true }],
  ])("never interrupts %s", (_label, world) => {
    const ctx = ctxWith(world);
    expect(INVITE_INTENTIONS.some((i) => i.can(ctx))).toBe(false);
  });

  /*
   * This case previously asserted the opposite, and the assertion was wrong
   * rather than the code. `pickerOpen` reads as "a chooser is up, do not
   * interrupt", but the sensor defines it as
   * `available.option > 0 || available["start-placement"] > 0` — which is true
   * for the whole time the construct screen is displayed. Gating invitations on
   * it meant the family could never fire on the busiest screen in the app, and
   * a 400-decision session simulation produced exactly one invitation.
   *
   * The construct screen is the screen a passerby is most likely to be looking
   * at. It is the entire point of the invitation.
   */
  it("does offer while the option picker is on screen — that is the main screen", () => {
    const ctx = ctxWith({
      pickerOpen: true,
      available: { ...EMPTY_WORLD.available, option: 24, effect: 16 },
    });
    expect(INVITE_INTENTIONS.some((i) => i.can(ctx))).toBe(true);
  });

  it("never speaks over a modal — the one shape that makes the app unpressable", () => {
    const ctx = ctxWith({
      available: { ...EMPTY_WORLD.available, effect: 3, dismiss: 1 },
    });
    expect(INVITE_INTENTIONS.some((i) => i.can(ctx))).toBe(false);
  });

  it("stops offering once the session budget is spent", () => {
    const ctx = ctxWith();
    ctx.budgets.invites = 99;
    expect(INVITE_INTENTIONS.some((i) => i.can(ctx))).toBe(false);
  });

  it("spaces them out — a fresh offer cannot follow the last one", () => {
    const ctx = ctxWith();
    // Just offered, on the trail's own clock.
    ctx.budgets.lastInviteAt = ctx.trail.lastAt();
    ctx.budgets.invites = 1;
    expect(INVITE_INTENTIONS.some((i) => i.can(ctx))).toBe(false);
  });

  it("loses to real curiosity — appeal stays under every ordinary intention", () => {
    const ctx = ctxWith();
    const loudest = Math.max(...INVITE_INTENTIONS.map((i) => i.appeal(ctx)));
    expect(loudest).toBeLessThanOrEqual(0.15);
  });
});

describe("point-it-out leaves the button unpressed", () => {
  it("hovers its target and never presses it", async () => {
    const calls: string[] = [];
    const target = { id: "target" } as unknown as HTMLElement;
    const ghost = {
      halted: () => false,
      jitter: (base: number) => base,
      setHover: () => calls.push("setHover"),
      hoverOn: async () => {
        calls.push("hoverOn");
      },
      moveAndPress: async () => {
        calls.push("moveAndPress");
      },
      dwell: async () => {
        calls.push("dwell");
      },
    } as never;

    const ctx = ctxWith();
    const ok = await inviteById("point-it-out").perform(ghost, ctx, target);

    expect(ok).toBe(true);
    expect(calls).toContain("hoverOn");
    // The whole mechanism. If this ever flips, the invitation is gone.
    expect(calls).not.toContain("moveAndPress");
  });

  it("spends its budget so the next one is spaced", async () => {
    const ctx = ctxWith();
    const before = ctx.budgets.invites;
    await inviteById("offer-the-wheel").perform(
      {
        halted: () => false,
        jitter: (base: number) => base,
        setHover: () => {},
        dwell: async () => {},
      } as never,
      ctx,
      null,
    );
    expect(ctx.budgets.invites).toBe(before + 1);
    expect(ctx.budgets.lastInviteAt).toBeGreaterThan(0);
  });
});

describe("savor is opt-in, and only where there is something to watch", () => {
  it("is declared on the payoff beats", () => {
    const withSavor = ALL_INTENTIONS.filter((i) => i.savor !== undefined).map(
      (i) => i.id,
    );
    expect(withSavor).toContain("play-it");
    expect(withSavor).toContain("try-effect");
  });

  it("stays off the vast majority of the bag", () => {
    // The bug this guards is a GLOBAL step-aside after every press
    // (3b912bbc97). If most of the bag ever declares savor, that bug is back
    // under a new name.
    const withSavor = ALL_INTENTIONS.filter((i) => i.savor !== undefined);
    expect(withSavor.length).toBeLessThan(ALL_INTENTIONS.length / 3);
  });

  it("never asks an invitation to step aside — it is already standing still", () => {
    expect(INVITE_INTENTIONS.every((i) => i.savor === undefined)).toBe(true);
  });

  it("scales the look to the sequence, and stays bounded", () => {
    const savor = ALL_INTENTIONS.find((i) => i.id === "play-it")!.savor!;
    const at = (sequenceLength: number) =>
      typeof savor === "function"
        ? savor(ctxWith({ sequenceLength }))
        : savor;
    expect(at(16)).toBeGreaterThan(at(2));
    expect(at(999)).toBeLessThanOrEqual(9000);
  });
});
