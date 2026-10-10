import { describe, expect, it } from "vitest";
import {
  POST_BOX,
  POST_DEFAULT_OVERLAY_SECONDS,
  POST_MAX_SPOKEN_LENGTH,
  PostProjectSchema,
  type PostAnimationItem,
  type PostItem,
  type PostProject,
  type PostTitlesItem,
  type PostVideoItem,
} from "#lib/shared/media-composition/domain/post-project.js";
import { compilePostProject } from "#lib/shared/media-composition/domain/post-project-compiler.js";
import {
  addTitlesItem,
  findTunnelHook,
  updateItem,
} from "#lib/shared/media-composition/domain/post-project-edits.js";
import { normalizeProject } from "#lib/shared/media-composition/domain/post-project-normalize.js";
import { sampleEasing } from "#lib/shared/media-composition/domain/post-project-keyframes.js";
import { evaluatePresetFrame } from "#lib/shared/media-composition/services/frame-evaluator.js";
import {
  DEFAULT_TUNNEL_HOOK,
  MOVE_END_SHARE,
  MOVE_START_SHARE,
  type TunnelHook,
} from "#lib/shared/media-composition/domain/tunnel-hook.js";
import {
  OPENING_TITLES_SHARE,
  titlesPlanOf,
  titlesRole,
  tunnelTitlesLook,
} from "#lib/shared/media-composition/domain/tunnel-titles.js";
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
function opening(legacyTitles?: TunnelHook["titles"]) {
  const hook = overlay("anim", "animation", {
    start: 0,
    duration: 12,
    box: { ...POST_BOX.bottom },
    animationAppearance: {},
    tunnelHook: {
      ...DEFAULT_TUNNEL_HOOK,
      seconds: 5,
      ...(legacyTitles ? { titles: legacyTitles } : {}),
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
    [take("a"), take("b")]
  );
}

function titlesIn(post: PostProject): PostTitlesItem[] {
  return post.tracks
    .flatMap((track): PostItem[] => track.items)
    .filter((item): item is PostTitlesItem => item.kind === "titles");
}

function withTitles(
  post = opening(),
  init: { at?: number; spoken?: string } = {}
) {
  const result = addTitlesItem(post, ctx, { at: 20, ...init })!;
  const item = titlesIn(result.project).find(
    (entry) => entry.id === result.itemId
  )!;
  return { post: result.project, item };
}

describe("titles clip", () => {
  it("goes over the opening tunnel on its own track, gone before the tunnel settles", () => {
    const { post, item } = withTitles();
    expect(item.start).toBe(0);
    expect(item.duration).toBeCloseTo(5 * OPENING_TITLES_SHARE, 9);
    expect(item.start + item.duration).toBeLessThan(5 * MOVE_END_SHARE);
    expect(item.box).toEqual(POST_BOX.full);
    expect(item.spoken).toBeUndefined();
    const trackOf = (id: string) =>
      post.tracks.findIndex((track) =>
        track.items.some((entry) => entry.id === id)
      );
    expect(trackOf(item.id)).toBeGreaterThan(trackOf("anim"));
    expect(PostProjectSchema.safeParse(post).success).toBe(true);
  });

  it("starts where asked in a post with no opening tunnel", () => {
    const plain = project([
      video("v1", { start: 0, duration: 10, pinnedStart: true }),
    ]);
    const { item } = withTitles(plain, { at: 4, spoken: "ohm" });
    expect(item.start).toBe(4);
    expect(item.duration).toBe(POST_DEFAULT_OVERLAY_SECONDS);
    expect(item.spoken).toBe("ohm");
  });

  it("keeps how to say it as typed, drawn trimmed, within its limit", () => {
    const { post, item } = withTitles();
    const set = (spoken: string) => {
      const next = updateItem(post, item.id, { spoken }, ctx);
      return titlesIn(next).find((entry) => entry.id === item.id)!;
    };
    expect(set("ohm ").spoken).toBe("ohm ");
    expect(titlesPlanOf(set("ohm ")).spoken).toBe("ohm");
    expect(titlesPlanOf(set("   ")).spoken).toBeUndefined();
    expect(set("x".repeat(POST_MAX_SPOKEN_LENGTH + 5)).spoken).toHaveLength(
      POST_MAX_SPOKEN_LENGTH
    );
  });
});

describe("titles saved on the opening tunnel", () => {
  it("move onto their own clip with the same words", () => {
    const post = normalizeProject(
      opening({ name: true, spoken: "  ohm.lam-dash.X.J " })
    );
    expect(findTunnelHook(post)?.tunnelHook?.titles).toBeUndefined();
    const [titles, ...rest] = titlesIn(post);
    expect(rest).toHaveLength(0);
    expect(titles!.spoken).toBe("ohm.lam-dash.X.J");
    expect(titles!.start).toBe(0);
    expect(titles!.duration).toBeCloseTo(5 * OPENING_TITLES_SHARE, 9);
    expect(PostProjectSchema.safeParse(post).success).toBe(true);
    // Opening it again changes nothing more.
    expect(titlesIn(normalizeProject(post))).toHaveLength(1);
  });

  it("go when they were switched off; a retired parts bar is dropped", () => {
    const off = normalizeProject(opening({ name: false, spoken: "ohm" }));
    expect(titlesIn(off)).toHaveLength(0);
    expect(findTunnelHook(off)?.tunnelHook?.titles).toBeUndefined();
    const barred = normalizeProject(opening({ name: true, structure: true }));
    expect(titlesIn(barred)).toHaveLength(1);
    expect(titlesIn(barred)[0]!.spoken).toBeUndefined();
  });
});

describe("titles timing", () => {
  const { item } = withTitles(opening(), { spoken: "ohm.lam-dash.X.J" });
  const plan = titlesPlanOf(item);
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

    const gone = look(plan.end);
    expect(gone.name.opacity).toBe(0);
    expect(gone.spoken.opacity).toBe(0);
  });

  it("fits its motion into a short clip", () => {
    const short = { ...plan, start: 0, end: 1 };
    expect(tunnelTitlesLook(short, 0.37, sampleEasing).name.opacity).toBe(1);
    expect(tunnelTitlesLook(short, 1, sampleEasing).name.opacity).toBe(0);
  });
});

describe("titles in the post", () => {
  it("paints over everything for as long as the clip runs", () => {
    const { post, item } = withTitles();
    const compiled = compilePostProject(post, ctx)!;
    const clip = compiled.preset.clips.find(
      (entry) =>
        entry.kind === "visual" && entry.sourceRole === titlesRole(item.id)
    );
    expect(clip).toBeDefined();
    const region = compiled.preset.regions.find(
      (entry) => entry.id === (clip as { regionId: string }).regionId
    )!;
    expect(region).toMatchObject({ x: 0, y: 0, width: 1, height: 1 });
    expect(region.zIndex).toBe(
      Math.max(...compiled.preset.regions.map((entry) => entry.zIndex))
    );
    expect(compiled.titles.map((entry) => entry.itemId)).toEqual([item.id]);
  });

  it("stays bright while the footage behind the tunnel is dimmed", () => {
    const dimmed = opening();
    const hook = dimmed.tracks[1]!.items[0] as PostAnimationItem;
    hook.tunnelHook = { ...hook.tunnelHook!, backdrop: true };
    const { post, item } = withTitles(dimmed);
    const compiled = compilePostProject(post, ctx)!;
    const layers = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      1
    );
    const titles = layers.find(
      (layer) => layer.sourceRole === titlesRole(item.id)
    )!;
    const footage = layers.find((layer) => layer.clipId.startsWith("full"))!;
    expect(footage.opacity).toBeLessThan(1);
    expect(titles.opacity).toBe(1);
  });
});
