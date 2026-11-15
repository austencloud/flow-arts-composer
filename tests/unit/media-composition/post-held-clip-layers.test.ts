import { describe, expect, it } from "vitest";
import type { PostProject } from "@austencloud/video-editor/core";
import {
  compilePostProject,
  editContext,
  evaluatePresetFrame,
  PostProjectSchema,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  HOLD_FIXTURE_SECONDS,
  holdFixture,
} from "../../../src/routes/test/post-studio/hold-fixture";
import { NOW, overlay, project, video } from "./post-project-fixtures";

/**
 * A layer that follows the footage under it (here a moves square) stops on
 * what it showed at the footage's last frame while the clip holds that
 * frame: it never runs on past the take's span or stretches across the hold.
 */
const ctx = editContext(NOW);
const HOLD = 2;

/** A 6 s clip (take seconds 2 to 8) with a moves square over all of it. */
function post(holdOut?: number): PostProject {
  const clip = video("v1", {
    sourceIn: 2,
    sourceOut: 8,
    duration: 6 + (holdOut ?? 0),
    ...(holdOut ? { holdOut } : {}),
  });
  return project(
    [clip],
    [
      [
        overlay("sq", "moves", {
          start: 0,
          duration: clip.duration,
          anchor: { itemId: "v1", offset: 0 },
        }),
      ],
    ]
  );
}

function sourceTimes(p: PostProject, at: number) {
  const compiled = compilePostProject(p, ctx)!;
  const layers = evaluatePresetFrame(
    compiled.preset,
    compiled.durationSeconds,
    at
  );
  return {
    square: layers.find((layer) => layer.regionId === "sq")?.sourceTimeSeconds,
    footage: layers.find((layer) => layer.clipId === "v1")?.sourceTimeSeconds,
  };
}

describe("a moves square over a clip that holds its last frame", () => {
  it("reads exactly what it read without the hold, before the hold", () => {
    for (const at of [0, 1.5, 3, 5.25, 5.99]) {
      expect(sourceTimes(post(HOLD), at).square).toBe(
        sourceTimes(post(), at).square
      );
    }
  });

  it("stays on the footage's last frame through the hold", () => {
    const last = sourceTimes(post(HOLD), 5.999).square!;
    expect(last).toBeCloseTo(8, 2);
    // At the cut itself the footage piece reads its own last time, 8 s,
    // one millisecond of take from the held frame: the same picture.
    expect(sourceTimes(post(HOLD), 6).square).toBeCloseTo(8, 2);
    for (const at of [6.01, 6.5, 7, 7.99]) {
      const { square, footage } = sourceTimes(post(HOLD), at);
      // The same frame the clip's own picture holds, never past its span.
      expect(square).toBeCloseTo(footage!, 6);
      expect(square).toBeCloseTo(last, 2);
      expect(square!).toBeLessThan(8);
    }
  });

  it("cuts its pieces where the footage ends and marks the held one", () => {
    const compiled = compilePostProject(post(HOLD), ctx)!;
    const pieces = compiled.preset.clips.filter(
      (clip) => clip.kind === "visual" && clip.regionId === "sq"
    );
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).not.toHaveProperty("holdOutSeconds");
    expect(pieces[1]).toMatchObject({ holdOutSeconds: HOLD });
  });
});

describe("a staff effect over a clip that holds its last frame", () => {
  it("rides the clip's hold, so it stays on the last frame too", () => {
    const p = post(HOLD);
    const main = p.tracks[0]!.items[0]!;
    const withEffect: PostProject = {
      ...p,
      tracks: [
        {
          ...p.tracks[0]!,
          items: [{ ...main, staffEffect: { effect: "trails" } }],
        },
        ...p.tracks.slice(1),
      ],
    };
    const compiled = compilePostProject(withEffect, ctx)!;
    const staff = compiled.preset.clips.find((clip) => clip.id === "v1~staff");
    expect(staff).toMatchObject({ holdOutSeconds: HOLD });
    const layers = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      7
    );
    const effect = layers.find((layer) => layer.clipId === "v1~staff")!;
    const footage = layers.find((layer) => layer.clipId === "v1")!;
    expect(effect.sourceTimeSeconds).toBeCloseTo(footage.sourceTimeSeconds, 6);
  });
});

describe("the harness's hold fixture", () => {
  it("is a valid post: the footage holds, the card fades in as it ends", () => {
    const post = holdFixture("seq", { videoId: "cut", durationSeconds: 25 });
    expect(PostProjectSchema.safeParse(post).success).toBe(true);
    const items = post.tracks.flatMap((track) => track.items);
    const footage = items.find((item) => item.kind === "video")!;
    const card = items.find((item) => item.kind === "card")!;
    expect(footage).toMatchObject({ holdOut: HOLD_FIXTURE_SECONDS });
    expect(card.start).toBe(footage.duration - HOLD_FIXTURE_SECONDS);
    expect(card.fadeIn).toBeGreaterThan(0);
    const compiled = compilePostProject(post, ctx)!;
    const square = compiled.preset.clips.filter(
      (clip) => clip.kind === "visual" && clip.regionId === "hold-square"
    );
    expect(square.at(-1)).toMatchObject({
      holdOutSeconds: HOLD_FIXTURE_SECONDS,
    });
  });
});
