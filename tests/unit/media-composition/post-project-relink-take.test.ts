import { describe, expect, it } from "vitest";
import { featureVideoMediaUrl } from "#lib/shared/media-composition/domain/feature-video.js";
import { PostProjectSchema } from "#lib/shared/media-composition/domain/post-project.js";
import { bridgeLockedChange } from "#lib/shared/media-composition/domain/post-project-bridge-guard.js";
import { applyPostProjectOps } from "#lib/shared/media-composition/domain/post-project-ops.js";
import type { PostTake } from "#lib/shared/media-composition/domain/post-plan.js";
import {
  TakeTimingSchema,
  createTakeTiming,
  type TakeTiming,
} from "#lib/shared/media-composition/domain/take-timing.js";
import { NOW, project, spans, take, video } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };
const FIRST = featureVideoMediaUrl("promo", "captures/builder.1.mp4");
const SECOND = featureVideoMediaUrl("promo", "captures/builder.2.mp4");
const empty = () => project([], [], []);
const recorded = () =>
  applyPostProjectOps(
    empty(),
    [{ op: "add-take", url: FIRST, durationSeconds: 12.5, append: true }],
    ctx
  );
const relink = (before: ReturnType<typeof recorded>, durationSeconds: number) =>
  applyPostProjectOps(
    before,
    [{ op: "relink-take", take: "take-1", url: SECOND, durationSeconds }],
    { now: NOW + 2 }
  );
const clip = (p: ReturnType<typeof recorded>) =>
  p.tracks[0]?.items[0] as {
    takeId: string;
    sourceIn: number;
    sourceOut: number;
    duration: number;
  };

describe("relink-take", () => {
  it("points the same take at the new file", () => {
    const next = relink(recorded(), 12.5);
    expect(next.takes).toHaveLength(1);
    expect(next.takes[0]).toMatchObject({
      id: "take-1",
      ref: { kind: "linked", url: SECOND },
      takeKey: `linked:${SECOND}`,
      durationSeconds: 12.5,
    });
    expect(clip(next).takeId).toBe("take-1");
  });

  it("keeps every clip range when the new file is longer", () => {
    const next = relink(recorded(), 20);
    expect(next.takes[0]?.durationSeconds).toBe(20);
    expect(clip(next)).toMatchObject({
      sourceIn: 0,
      sourceOut: 12.5,
      duration: 12.5,
    });
  });

  it("cuts clips back when the new file is shorter", () => {
    const next = relink(recorded(), 8);
    expect(next.takes[0]?.durationSeconds).toBe(8);
    expect(clip(next)).toMatchObject({
      sourceIn: 0,
      sourceOut: 8,
      duration: 8,
    });
  });

  it("removes a clip the new file no longer reaches and cuts one it ends inside", () => {
    const capture: PostTake = {
      id: "take-1",
      label: "builder",
      ref: { kind: "linked", url: FIRST },
      takeKey: `linked:${FIRST}`,
      durationSeconds: 12.5,
    };
    const cut = (
      id: string,
      start: number,
      sourceIn: number,
      sourceOut: number
    ) => video(id, { takeId: "take-1", start, sourceIn, sourceOut });
    const before = project(
      [
        cut("whole", 0, 0, 4),
        cut("ends-inside", 4, 6, 10),
        cut("sliver", 8, 7.95, 9),
        cut("past", 9.05, 9, 12),
      ],
      [],
      [capture]
    );
    const next = relink(before, 8);
    expect(spans(next, 0)).toEqual([
      ["whole", 0, 4],
      ["ends-inside", 4, 2],
    ]);
    expect(PostProjectSchema.safeParse(next).success).toBe(true);
  });

  it("moves the take's timing to the new file", () => {
    const before = {
      ...recorded(),
      timings: {
        "take-1": createTakeTiming({
          sequenceId: "seq",
          takeKey: `linked:${FIRST}`,
          durationSeconds: 12.5,
          now: NOW,
        }),
      },
    };
    const next = relink(before, 8);
    const timing = next.timings?.["take-1"];
    expect(timing?.takeKey).toBe(`linked:${SECOND}`);
    expect(timing?.sections.at(-1)?.endSeconds).toBe(8);
  });

  it("keeps a valid timing when a shorter file drops a part, and asks for a new check", () => {
    const whole = createTakeTiming({
      sequenceId: "seq",
      takeKey: `linked:${FIRST}`,
      durationSeconds: 12.5,
      now: NOW,
    });
    const [first] = whole.sections;
    const split: TakeTiming = {
      ...whole,
      confirmedAt: NOW,
      sections: [
        {
          ...first!,
          endSeconds: 6,
          taps: [1, 2, 3],
          beatOneSeconds: 1,
          continuesIntoNext: true,
        },
        {
          ...first!,
          id: "section-2",
          startSeconds: 6,
          taps: [7, 9, 11],
          overrides: [{ position: 9, seconds: 11.5 }],
          lastPosition: 10,
        },
      ],
    };
    const before = { ...recorded(), timings: { "take-1": split } };
    const timing = relink(before, 5).timings?.["take-1"];
    expect(TakeTimingSchema.safeParse(timing).success).toBe(true);
    expect(timing?.confirmedAt).toBeNull();
    expect(timing?.sections).toHaveLength(1);
    expect(timing?.sections[0]).toMatchObject({
      startSeconds: 0,
      endSeconds: 5,
      taps: [1, 2, 3],
      beatOneSeconds: 1,
    });
    expect(timing?.sections[0]).not.toHaveProperty("continuesIntoNext");

    const cutInside = relink(before, 10).timings?.["take-1"];
    expect(TakeTimingSchema.safeParse(cutInside).success).toBe(true);
    expect(
      cutInside?.sections.map((s) => [s.startSeconds, s.endSeconds])
    ).toEqual([
      [0, 6],
      [6, 10],
    ]);
    expect(cutInside?.sections[1]).toMatchObject({
      taps: [7, 9],
      overrides: [],
    });
  });

  it("names what is wrong", () => {
    const before = recorded();
    const apply = (op: object) => () =>
      applyPostProjectOps(before, [op as never], ctx);
    expect(
      apply({
        op: "relink-take",
        take: "take-9",
        url: SECOND,
        durationSeconds: 5,
      })
    ).toThrow('No take "take-9" in this post.');
    expect(
      apply({
        op: "relink-take",
        take: "take-1",
        url: "https://x.test/a.mp4",
        durationSeconds: 5,
      })
    ).toThrow(/feature video media url/);
    expect(
      apply({
        op: "relink-take",
        take: "take-1",
        url: SECOND,
        durationSeconds: 0,
      })
    ).toThrow("durationSeconds must be a positive number.");
  });

  it("refuses a file another take already plays", () => {
    const two = applyPostProjectOps(
      recorded(),
      [{ op: "add-take", url: SECOND, durationSeconds: 5 }],
      ctx
    );
    expect(() =>
      applyPostProjectOps(
        two,
        [
          {
            op: "relink-take",
            take: "take-1",
            url: SECOND,
            durationSeconds: 5,
          },
        ],
        ctx
      )
    ).toThrow("Another take already plays that file.");
  });
});

describe("the bridge guard and feature video timings", () => {
  const timingFor = (takeKey: string, durationSeconds: number) =>
    createTakeTiming({ sequenceId: "seq", takeKey, durationSeconds, now: NOW });

  it("lets a relink through, timing included", () => {
    const before = {
      ...recorded(),
      timings: { "take-1": timingFor(`linked:${FIRST}`, 12.5) },
    };
    expect(bridgeLockedChange(before, relink(before, 8))).toBeNull();
  });

  it("lets a removed take keep its orphan timing", () => {
    const before = {
      ...recorded(),
      timings: { "take-1": timingFor(`linked:${FIRST}`, 12.5) },
    };
    const after = applyPostProjectOps(
      before,
      [{ op: "remove-take", take: "take-1" }],
      ctx
    );
    expect(bridgeLockedChange(before, after)).toBeNull();
  });

  it("still locks the timing of a feature take it does not relink", () => {
    const other = featureVideoMediaUrl("promo", "captures/ring.1.mp4");
    const two = applyPostProjectOps(
      recorded(),
      [{ op: "add-take", url: other, durationSeconds: 6 }],
      ctx
    );
    const before = {
      ...two,
      timings: {
        "take-1": timingFor(`linked:${FIRST}`, 12.5),
        "take-2": timingFor(`linked:${other}`, 6),
      },
    };
    const relinked = relink(before, 8);
    const retimed = {
      ...relinked,
      timings: {
        ...relinked.timings,
        "take-2": { ...timingFor(`linked:${other}`, 6), confirmedAt: NOW },
      },
    };
    expect(bridgeLockedChange(before, relinked)).toBeNull();
    expect(bridgeLockedChange(before, retimed)).toBe("timings");
  });

  it("still locks the timing of any other take", () => {
    const before = {
      ...empty(),
      takes: [take("x")],
      timings: { x: timingFor("key-x", 20) },
    };
    const after = { ...before, timings: { x: timingFor("key-x", 30) } };
    expect(bridgeLockedChange(before, after)).toBe("timings");
  });
});
