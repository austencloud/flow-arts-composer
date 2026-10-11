import { describe, expect, it } from "vitest";
import {
  PLAYBACK_REVISIT_MS,
  SIDEBAR_FAMILIARITY_MS,
  navigationSignature,
  playbackWouldRepeat,
  recognizesNavigation,
} from "#lib/shared/attract/domain/episodic-memory.js";
import {
  EMPTY_WORLD,
  type GhostContext,
  type GhostNavigationOption,
} from "#lib/shared/attract/domain/intention.js";
import { createMemory } from "#lib/shared/attract/domain/scoring.js";
import { createRng } from "#lib/shared/attract/services/rng.js";
import { createTrail } from "#lib/shared/attract/services/trail.js";

function context(at = 10_000): GhostContext {
  const rng = createRng(7);
  const trail = createTrail(() => at);
  trail.push({
    intentionId: "test",
    thought: "test",
    moduleId: "create",
    ok: true,
  });
  return { ...EMPTY_WORLD, ...createMemory(rng, trail) };
}

describe("ghost episodic memory", () => {
  it("recognizes only the same recently read sidebar", () => {
    const ctx = context();
    const options: GhostNavigationOption[] = [
      { kind: "module", id: "create", label: "Create" },
      { kind: "module", id: "library", label: "Library" },
    ];
    const signature = navigationSignature(options);
    ctx.navigation.familiarityByContext.set("create/construct", {
      signature,
      reads: 1,
      lastReadAt: 1_000,
    });

    expect(
      recognizesNavigation(ctx.navigation, "create/construct", signature, 2_000)
    ).toBe(true);
    expect(
      recognizesNavigation(
        ctx.navigation,
        "create/construct",
        `${signature}|module:museum:Museum`,
        2_000
      )
    ).toBe(false);
    expect(
      recognizesNavigation(
        ctx.navigation,
        "create/construct",
        signature,
        1_000 + SIDEBAR_FAMILIARITY_MS + 1
      )
    ).toBe(false);
  });

  it("blocks a fresh unchanged replay but permits change or elapsed time", () => {
    const ctx = context();
    ctx.playback.presentationRevision = 4;
    ctx.playback.lastPlayedRevision = 4;
    ctx.playback.lastPlayedSurface = "workspace";
    ctx.playback.lastPlayedAt = 9_000;

    expect(playbackWouldRepeat(ctx)).toBe(true);

    ctx.playback.presentationRevision += 1;
    expect(playbackWouldRepeat(ctx)).toBe(false);

    ctx.playback.presentationRevision = 4;
    ctx.playback.lastPlayedAt = 10_000 - PLAYBACK_REVISIT_MS;
    expect(playbackWouldRepeat(ctx)).toBe(false);
  });
});
