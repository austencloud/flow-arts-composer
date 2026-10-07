import { describe, expect, it } from "vitest";
import { featureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
import { applyPostProjectOps } from "$lib/shared/media-composition/domain/post-project-ops";
import { createTakeTiming } from "$lib/shared/media-composition/domain/take-timing";
import { NOW, project, take } from "./post-project-fixtures";

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
