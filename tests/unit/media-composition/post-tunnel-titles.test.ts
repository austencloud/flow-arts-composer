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
import {
  DEFAULT_TUNNEL_HOOK,
  MOVE_END_SHARE,
  MOVE_START_SHARE,
  TUNNEL_SPOKEN_MAX_LENGTH,
  type TunnelTitles,
} from "$lib/shared/media-composition/domain/tunnel-hook";
import {
  TUNNEL_TITLES_CARD_LABEL,
  tunnelTitleParts,
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
  it("reads the video's parts off the main track, closing on the card", () => {
    const parts = tunnelTitleParts(opening());
    expect(parts.map((part) => part.label)).toEqual([
      "Full speed",
      "Half speed",
      TUNNEL_TITLES_CARD_LABEL,
    ]);
    expect(parts.map((part) => [part.start, part.end])).toEqual([
      [0, 12],
      [12, 32],
      [32, 36],
    ]);
  });

  it("joins neighbouring clips of one part", () => {
    const p = opening();
    const main = p.tracks[0]!;
    const split = {
      ...p,
      tracks: [
        {
          ...main,
          items: [
            video("full-1", { takeId: "a", start: 0, sourceOut: 6 }),
            video("full-2", {
              takeId: "a",
              start: 6,
              sourceIn: 6,
              sourceOut: 12,
            }),
            ...main.items.slice(1),
          ],
        },
        ...p.tracks.slice(1),
      ],
    };
    const parts = tunnelTitleParts(split);
    expect(parts[0]).toMatchObject({ label: "Full speed", start: 0, end: 12 });
    expect(parts).toHaveLength(3);
  });

  it("shows the name and the parts by default, with no pronunciation", () => {
    const plan = tunnelTitlesPlanOf(opening())!;
    expect(plan.itemId).toBe("anim");
    expect(plan.name).toBe(true);
    expect(plan.spoken).toBeUndefined();
    expect(plan.parts).toHaveLength(3);
    // The thin line carries on filling along the animation's box until the
    // full-speed part ends, then leaves.
    expect(plan.divider).toMatchObject({ fadeOutStart: 12 });
    expect(plan.end).toBe(plan.divider!.fadeOutEnd);
  });

  it("drops what is hidden, and has nothing to draw with both off", () => {
    const named = tunnelTitlesPlanOf(
      opening({ name: true, spoken: "  ohm.lam-dash.X.J ", structure: false })
    )!;
    expect(named.spoken).toBe("ohm.lam-dash.X.J");
    expect(named.parts).toEqual([]);
    expect(named.divider).toBeNull();
    expect(named.end).toBeCloseTo(5 * MOVE_END_SHARE, 9);

    const partsOnly = tunnelTitlesPlanOf(
      opening({ name: false, spoken: "ohm", structure: true })
    )!;
    expect(partsOnly.spoken).toBeUndefined();
    expect(tunnelTitlesPlanOf(opening({ name: false, structure: false }))).toBe(
      null
    );
  });

  it("draws no line without an intro to settle into", () => {
    expect(tunnelTitlesPlanOf(opening(undefined, null))!.divider).toBe(
      null
    );
  });
});

describe("opening titles timing", () => {
  const plan = tunnelTitlesPlanOf(
    opening({ name: true, spoken: "ohm.lam-dash.X.J", structure: true })
  )!;
  const look = (seconds: number) =>
    tunnelTitlesLook(plan, seconds, sampleEasing);

  it("brings the words in, holds them, and lifts them away as the tunnel moves", () => {
    expect(look(0).name.opacity).toBe(0);
    const held = look(5 * MOVE_START_SHARE - 0.01);
    expect(held.name.opacity).toBe(1);
    expect(held.spoken.opacity).toBe(1);
    expect(held.parts.opacity).toBe(1);
    expect(held.name.rise).toBe(0);

    const leaving = look(5 * (MOVE_START_SHARE + 0.1));
    expect(leaving.name.opacity).toBeLessThan(1);
    expect(leaving.name.rise).toBeGreaterThan(0);
    // The parts make way downward, under the tunnel coming down.
    expect(leaving.parts.rise).toBeLessThan(0);

    const gone = look(5 * MOVE_END_SHARE);
    expect(gone.name.opacity).toBe(0);
    expect(gone.spoken.opacity).toBe(0);
    expect(gone.parts.opacity).toBe(0);
  });

  it("fills the first part like a loading bar over the full-speed run", () => {
    expect(look(0).fills).toEqual([0, 0, 0]);
    expect(look(6).fills[0]).toBeCloseTo(0.5, 9);
    expect(look(6).fills[1]).toBe(0);
    expect(look(12).fills[0]).toBe(1);
  });

  it("hands the bar to the line, which leaves once the first part is full", () => {
    expect(look(2).divider).toBe(0);
    expect(look(5).divider).toBe(1);
    expect(look(11.9).divider).toBe(1);
    expect(look(plan.divider!.fadeOutEnd).divider).toBe(0);
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

  it("keeps the pronunciation as typed, within its limit", () => {
    const set = (spoken: string) =>
      tunnelTitlesPlanOf(
        setTunnelHookTitles(
          opening(),
          { name: true, spoken, structure: true },
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
