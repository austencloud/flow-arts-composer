import { describe, expect, it } from "vitest";
import {
  POST_BOX,
  type PostAnimationItem,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  compilePostProject,
  TUNNEL_TITLES_ROLE,
} from "$lib/shared/media-composition/domain/post-project-compiler";
import { setTunnelHookTitles } from "$lib/shared/media-composition/domain/post-project-edits";
import { sampleEasing } from "$lib/shared/media-composition/domain/post-project-keyframes";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import {
  DEFAULT_TUNNEL_HOOK,
  MOVE_END_SHARE,
  MOVE_START_SHARE,
  TUNNEL_SPOKEN_MAX_LENGTH,
  type TunnelTitles,
} from "$lib/shared/media-composition/domain/tunnel-hook";
import {
  tunnelTitlesLook,
  tunnelTitlesPlanOf,
} from "$lib/shared/media-composition/domain/tunnel-titles";
import {
  NOW,
  card,
  overlay,
  project,
  take,
  video,
} from "./post-project-fixtures";

const ctx = { now: NOW };

/** Full speed for 12 s, half speed for 20 s, then the closing card. */
/** `seconds` null makes the whole item the tunnel, with no intro. */
function opening(titles?: TunnelTitles, seconds: number | null = 5) {
  const hook = overlay("anim", "animation", {
    start: 0,
    duration: 12,
    box: { ...POST_BOX.bottom },
    animationAppearance: {},
    tunnelHook: {
      ...DEFAULT_TUNNEL_HOOK,
      ...(seconds === null ? {} : { seconds }),
      ...(titles ? { titles } : {}),
    },
  } as Partial<PostAnimationItem>);
  return project(
    [
      video("full", {
        takeId: "a",
        start: 0,
        sourceOut: 12,
        pinnedStart: true,
      } as Partial<PostVideoItem>),
      video("half", {
        takeId: "b",
        start: 12,
        sourceOut: 10,
        speed: 0.5,
        pinnedStart: true,
      } as Partial<PostVideoItem>),
      card("end", 4, { start: 32 }),
    ],
    [[hook]],
    [
      { ...take("a"), label: "Full Speed" },
      { ...take("b"), label: "Half Speed" },
    ]
  );
}

describe("opening titles plan", () => {
  it("shows the name by default, with no pronunciation", () => {
    const plan = tunnelTitlesPlanOf(opening())!;
    expect(plan.itemId).toBe("anim");
    expect(plan.spoken).toBeUndefined();
    // Every word has gone by the time the tunnel settles into its box.
    expect(plan.end).toBeCloseTo(5 * MOVE_END_SHARE, 9);
  });

  it("trims how to say it, and has nothing to draw with the name off", () => {
    const named = tunnelTitlesPlanOf(
      opening({ name: true, spoken: "  ohm.lam-dash.X.J " })
    )!;
    expect(named.spoken).toBe("ohm.lam-dash.X.J");
    expect(
      tunnelTitlesPlanOf(opening({ name: false, spoken: "ohm" }))
    ).toBeNull();
  });

  it("still opens a draft saved with the retired parts bar, and draws no bar", () => {
    const plan = tunnelTitlesPlanOf(
      opening({ name: true, structure: true })
    )!;
    expect(Object.keys(plan).sort()).toEqual(
      ["end", "itemId", "seconds", "start"].sort()
    );
  });
});

describe("opening titles timing", () => {
  const plan = tunnelTitlesPlanOf(
    opening({ name: true, spoken: "ohm.lam-dash.X.J" })
  )!;
  const look = (seconds: number) =>
    tunnelTitlesLook(plan, seconds, sampleEasing);

  it("brings the words in, holds them, and lifts them away as the tunnel moves", () => {
    expect(look(0).name.opacity).toBe(0);
    const held = look(5 * MOVE_START_SHARE - 0.01);
    expect(held.name.opacity).toBe(1);
    expect(held.spoken.opacity).toBe(1);
    expect(held.name.rise).toBe(0);

    const leaving = look(5 * (MOVE_START_SHARE + 0.1));
    expect(leaving.name.opacity).toBeLessThan(1);
    expect(leaving.name.rise).toBeGreaterThan(0);

    const gone = look(5 * MOVE_END_SHARE);
    expect(gone.name.opacity).toBe(0);
    expect(gone.spoken.opacity).toBe(0);
  });
});

describe("opening titles in the post", () => {
  it("paints over everything for as long as the words show", () => {
    const compiled = compilePostProject(opening(), ctx)!;
    const clip = compiled.preset.clips.find(
      (entry) =>
        entry.kind === "visual" && entry.sourceRole === TUNNEL_TITLES_ROLE
    );
    expect(clip).toBeDefined();
    const region = compiled.preset.regions.find(
      (entry) => entry.id === (clip as { regionId: string }).regionId
    )!;
    expect(region).toMatchObject({ x: 0, y: 0, width: 1, height: 1 });
    expect(region.zIndex).toBe(
      Math.max(...compiled.preset.regions.map((entry) => entry.zIndex))
    );
    expect(compiled.tunnelTitles?.itemId).toBe("anim");
  });

  it("stays bright while the footage behind the tunnel is dimmed", () => {
    const dimmed = opening();
    const hook = dimmed.tracks[1]!.items[0] as PostAnimationItem;
    hook.tunnelHook = { ...hook.tunnelHook!, backdrop: true };
    const compiled = compilePostProject(dimmed, ctx)!;
    const layers = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      1
    );
    const titles = layers.find(
      (layer) => layer.sourceRole === TUNNEL_TITLES_ROLE
    )!;
    const footage = layers.find((layer) => layer.clipId.startsWith("full"))!;
    expect(footage.opacity).toBeLessThan(1);
    expect(titles.opacity).toBe(1);
  });

  it("keeps the pronunciation as typed, within its limit", () => {
    const set = (spoken: string) =>
      tunnelTitlesPlanOf(
        setTunnelHookTitles(
          opening(),
          { name: true, spoken },
          ctx
        )
      );
    expect(set("ohm ").spoken).toBe("ohm");
    expect(set("   ").spoken).toBeUndefined();
    expect(set("x".repeat(TUNNEL_SPOKEN_MAX_LENGTH + 5)).spoken).toHaveLength(
      TUNNEL_SPOKEN_MAX_LENGTH
    );
  });
});
