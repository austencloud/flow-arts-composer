import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  POST_STUDIO_ROLE,
  type PostProject,
} from "@austencloud/video-editor/core";
import { sequenceFrameAt } from "#lib/shared/media-composition/domain/sequence-frame.js";
import {
  PostAnimationItemSchema,
  PostProjectSchema,
  compilePostProject,
  normalizeProject,
  stage3DRole,
  type PostAnimationItem,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  STAGE_3D_FALLBACK_SECONDS_PER_TURN,
  postPerformerPositions,
  stage3DOrbitAngle,
  stage3DPerformerSteps,
  stage3DSecondsPerTurn,
} from "./stage-3d";
import { staggeredFrames, type TkaSequenceFrame } from "./staggered-performers";
import { PostStage3DSchema } from "./item-kinds";
import { holdStageAfterFootage } from "./compile-hooks";

const DCK_FILE = "tests/fixtures/video-editor-parity/dck.project.json";
const TURN = 2 * Math.PI;

function dck(): PostProject {
  return normalizeProject(
    PostProjectSchema.parse(JSON.parse(fs.readFileSync(DCK_FILE, "utf8")))
  );
}

function withAnimation(
  project: PostProject,
  change: (item: PostAnimationItem) => PostAnimationItem
): PostProject {
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.kind === "animation" ? change(item) : item
      ),
    })),
  };
}

describe("stage3DOrbitAngle", () => {
  it("starts at zero where the clip starts and makes one turn per period", () => {
    expect(stage3DOrbitAngle(5, 5, 16)).toBe(0);
    expect(stage3DOrbitAngle(13, 5, 16)).toBeCloseTo(TURN / 2);
    expect(stage3DOrbitAngle(21, 5, 16)).toBeCloseTo(TURN);
    expect(stage3DOrbitAngle(37, 5, 16)).toBeCloseTo(2 * TURN);
  });

  it("is a pure function of time, so scrubbing back unwinds it", () => {
    const forward = [6, 7.5, 9, 12].map((t) => stage3DOrbitAngle(t, 5, 10));
    const backward = [12, 9, 7.5, 6].map((t) => stage3DOrbitAngle(t, 5, 10));
    expect(backward).toEqual([...forward].reverse());
    expect(stage3DOrbitAngle(4, 5, 10)).toBeLessThan(0);
  });

  it("turns the other way for direction -1", () => {
    expect(stage3DOrbitAngle(9, 5, 16, -1)).toBeCloseTo(
      -stage3DOrbitAngle(9, 5, 16, 1)
    );
  });

  it("falls back to the default period for a broken one", () => {
    expect(stage3DOrbitAngle(5 + STAGE_3D_FALLBACK_SECONDS_PER_TURN, 5, 0)).toBeCloseTo(
      TURN
    );
  });
});

describe("stage3DSecondsPerTurn", () => {
  it("turns once per 16 beats of the tapped grid under the clip", () => {
    const project = dck();
    const animation = project.tracks
      .flatMap((track) => track.items)
      .find((item): item is PostAnimationItem => item.kind === "animation")!;
    const video = project.tracks[0]!.items[0]!;
    if (video.kind !== "video") throw new Error("dck starts with footage");
    const bpm = project.timings![video.takeId]!.sections[0]!.bpm;
    expect(stage3DSecondsPerTurn(project, animation)).toBeCloseTo(
      (16 * 60) / (bpm * video.speed)
    );
  });

  it("uses the clip's own speed when it has one", () => {
    const project = dck();
    const animation = project.tracks
      .flatMap((track) => track.items)
      .find((item): item is PostAnimationItem => item.kind === "animation")!;
    expect(
      stage3DSecondsPerTurn(project, {
        ...animation,
        stage3d: { shot: "orbit", orbitSecondsPerTurn: 9 },
      })
    ).toBe(9);
  });

  it("takes 20 seconds a turn with no footage under the clip", () => {
    const project = { ...dck(), tracks: [] } as PostProject;
    expect(
      stage3DSecondsPerTurn(project, {
        start: 0,
        duration: 10,
      } as Parameters<typeof stage3DSecondsPerTurn>[1])
    ).toBe(STAGE_3D_FALLBACK_SECONDS_PER_TURN);
  });
});

describe("the 3D stage's performer steps", () => {
  const MOVES = [1, 1, 1, 1, 1, 1, 1, 1];
  function tapped(arrival: number, endArrival: number | null): TkaSequenceFrame {
    return Object.assign(sequenceFrameAt(arrival, MOVES, { endArrival }), {
      endArrival,
    });
  }
  const partner: PostAnimationItem["followers"] = [
    { beatsBehind: 4, mirror: true, flip: true, swap: true },
  ];

  it("gives front and back performers exactly the 2D clip's positions", () => {
    for (const arrival of [0, 0.5, 2.25, 7.9, 13, 18, 20]) {
      const frame = tapped(arrival, 20);
      const positions = postPerformerPositions(frame, MOVES, partner, 1);
      const staggered = staggeredFrames(frame, MOVES, [4]);
      // What the 2D clip draws: the leader's and each follower's frame.
      expect(positions.sequencePosition).toBe(staggered.leader.enginePosition);
      expect(positions.followerPositions).toEqual([
        staggered.followers[0]!.enginePosition,
      ]);
      expect(stage3DPerformerSteps(positions)).toEqual([
        staggered.leader.enginePosition,
        staggered.followers[0]!.enginePosition,
      ]);
    }
  });

  it("keeps the back performer behind and holding until its turn", () => {
    const steps = stage3DPerformerSteps(
      postPerformerPositions(tapped(2.5, 20), MOVES, partner, 1)
    );
    expect(steps).toHaveLength(2);
    expect(steps[1]).toBe(1);
    expect(steps[0]).toBeGreaterThan(steps[1]!);
  });

  it("gives a clip without followers the layer's own position", () => {
    const frame = tapped(3.5, 20);
    const positions = postPerformerPositions(frame, MOVES, undefined, 4.5);
    expect(positions.sequencePosition).toBe(4.5);
    expect(positions.followerPositions).toEqual([]);
    expect(positions.staggered).toBeNull();
    expect(stage3DPerformerSteps(positions)).toEqual([4.5]);
  });
});

describe("a 3D clip in the compiled post", () => {
  it("leaves a 2D clip exactly as it was", () => {
    const project = dck();
    const animation = project.tracks
      .flatMap((track) => track.items)
      .find((item) => item.kind === "animation")!;
    expect(animation).not.toHaveProperty("stage3d");
    const reparsed = PostAnimationItemSchema.parse(animation);
    expect(reparsed).toEqual(animation);
    expect(reparsed).not.toHaveProperty("stage3d");

    const compiled = compilePostProject(project, {
      now: project.updatedAt,
      animationOverlay: false,
    })!;
    const roles = compiled.preset.clips.map((clip) => clip.sourceRole);
    expect(roles).toContain(POST_STUDIO_ROLE.animation);
    expect(roles.some((role) => role.startsWith("stage-3d:"))).toBe(false);
  });

  it("reads the same taps on its own role, piece for piece", () => {
    const flat = dck();
    const staged = withAnimation(flat, (item) => ({
      ...item,
      stage3d: { shot: "orbit" },
    }));
    const options = { now: flat.updatedAt, animationOverlay: false };
    const before = compilePostProject(flat, options)!.preset.clips.filter(
      (clip) => clip.sourceRole === POST_STUDIO_ROLE.animation
    );
    const after = compilePostProject(staged, options)!.preset.clips.filter(
      (clip) => clip.sourceRole === stage3DRole("animation-1")
    );
    expect(before.length).toBeGreaterThan(0);
    expect(after.map((clip) => ({ ...clip, sourceRole: "" }))).toEqual(
      before.map((clip) => ({ ...clip, sourceRole: "" }))
    );
  });

  it("keeps a saved camera and scene through a save", () => {
    const item = {
      ...dck()
        .tracks.flatMap((track) => track.items)
        .find((entry) => entry.kind === "animation")!,
      stage3d: {
        shot: "saved",
        orbitDirection: -1,
        camera: {
          position: { x: 1, y: 2, z: 3 },
          target: { x: 0, y: 1, z: 0 },
        },
        environment: "winter",
      },
    };
    expect(PostAnimationItemSchema.parse(item).stage3d).toEqual(item.stage3d);
    expect(() =>
      PostAnimationItemSchema.parse({
        ...item,
        stage3d: { shot: "sideways" },
      })
    ).toThrow();
  });

  it("keeps spacing, zoom and elevation and refuses them out of range", () => {
    const stage3d = { shot: "orbit", spacing: 0.9, zoom: 0.6, elevation: 20 };
    expect(PostStage3DSchema.parse(stage3d)).toEqual(stage3d);
    expect(PostStage3DSchema.parse({ shot: "front" })).toEqual({ shot: "front" });
    for (const [key, low, high] of [
      ["spacing", 0.4, 3],
      ["zoom", 0.35, 2],
      ["elevation", 5, 60],
    ] as const) {
      expect(PostStage3DSchema.parse({ shot: "front", [key]: low })[key]).toBe(low);
      expect(PostStage3DSchema.parse({ shot: "front", [key]: high })[key]).toBe(high);
      expect(() => PostStage3DSchema.parse({ shot: "front", [key]: low - 0.01 })).toThrow();
      expect(() => PostStage3DSchema.parse({ shot: "front", [key]: high + 0.01 })).toThrow();
      expect(() =>
        PostStage3DSchema.parse({ shot: "front", [key]: Number.NaN })
      ).toThrow();
    }
  });
});

describe("a 3D clip past its footage", () => {
  it("holds the footage's last instant instead of the opening pose", () => {
    const covered = {
      start: 2,
      end: 10,
      sourceIn: 4,
      sourceOut: 12,
      rate: 1,
      useResolvedTimeMap: true,
      timeMapRole: "take:a",
      takeId: "a",
    };
    const after = {
      start: 10,
      end: 13,
      sourceIn: 0,
      sourceOut: 3,
      rate: 1,
      useResolvedTimeMap: false,
    };
    const [first, held] = holdStageAfterFootage([covered, after]);
    expect(first).toBe(covered);
    expect(held).toMatchObject({
      start: 10,
      end: 13,
      sourceIn: 11.999,
      sourceOut: 12,
      useResolvedTimeMap: true,
      timeMapRole: "take:a",
    });
    // Freezing a piece on one instant would fail the clip schema.
    expect(held!.sourceOut).toBeGreaterThan(held!.sourceIn);
    // Nothing before the footage to hold: the opening pose stays.
    expect(holdStageAfterFootage([after])).toEqual([after]);
  });
});

describe("a 3D clip running over the end card", () => {
  it("compiles, holding the footage's last moment under the card", () => {
    const project = dck();
    const footage = project.tracks[0]!.items.find(
      (item) => item.id === "dck-main-2"
    )!;
    const footageEnd = footage.start + footage.duration;
    const staged = withAnimation(project, (item) => ({
      ...item,
      start: footageEnd - 4,
      duration: 6,
      anchor: null,
      stage3d: { shot: "orbit" },
    }));
    const clips = compilePostProject(staged, {
      now: project.updatedAt,
      animationOverlay: false,
    })!.preset.clips.filter(
      (clip) => clip.sourceRole === stage3DRole("animation-1")
    );
    expect(clips).toHaveLength(2);
    const [over, after] = clips as unknown as {
      sourceOut: { value: number };
      useResolvedTimeMap: boolean;
      timeMapRole?: string;
    }[];
    expect(after!.useResolvedTimeMap).toBe(true);
    expect(after!.timeMapRole).toBe(over!.timeMapRole);
    expect(after!.sourceOut.value).toBeCloseTo(over!.sourceOut.value);
  });
});
