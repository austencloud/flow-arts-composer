import { describe, expect, it } from "vitest";
import { featureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "$lib/shared/media-composition/domain/post-project-ops";
import { NOW, project } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };
const URL_03 = featureVideoMediaUrl("promo", "footage/take-03.mp4");
const empty = () => project([], [], []);

describe("add-take", () => {
  it("adds a feature video file as a take, with no clip", () => {
    const next = applyPostProjectOps(
      empty(),
      [{ op: "add-take", url: URL_03, durationSeconds: 12.5 }],
      ctx
    );
    expect(next.takes).toEqual([
      {
        id: "take-1",
        label: "take-03",
        ref: { kind: "linked", url: URL_03 },
        takeKey: `linked:${URL_03}`,
        durationSeconds: 12.5,
      },
    ]);
    expect(next.tracks[0]?.items).toEqual([]);
    expect(next.updatedAt).toBe(NOW + 1);
  });

  it("puts the whole take on the end of the main track when asked", () => {
    const next = applyPostProjectOps(
      empty(),
      [{ op: "add-take", url: URL_03, durationSeconds: 12.5, append: true }],
      ctx
    );
    expect(next.tracks[0]?.items).toHaveLength(1);
    expect(next.tracks[0]?.items[0]).toMatchObject({
      kind: "video",
      takeId: "take-1",
      sourceIn: 0,
      sourceOut: 12.5,
    });
  });

  it("refreshes the take when the same file comes again, keeping its name", () => {
    const first = applyPostProjectOps(
      empty(),
      [
        {
          op: "add-take",
          url: URL_03,
          durationSeconds: 12.5,
          label: "Opening",
        },
      ],
      ctx
    );
    const again = applyPostProjectOps(
      first,
      [{ op: "add-take", url: URL_03, durationSeconds: 13 }],
      ctx
    );
    expect(again.takes).toHaveLength(1);
    expect(again.takes[0]).toMatchObject({
      id: "take-1",
      label: "Opening",
      durationSeconds: 13,
    });
  });

  it("names a take after its file", () => {
    const url = featureVideoMediaUrl("promo", "footage/take 04.mov");
    expect(url).toContain("take%2004.mov");
    const next = applyPostProjectOps(
      empty(),
      [{ op: "add-take", url, durationSeconds: 3 }],
      ctx
    );
    expect(next.takes[0]?.label).toBe("take 04");
  });

  it.each([
    [
      { op: "add-take", url: "https://example.test/a.mp4", durationSeconds: 5 },
      "feature video media url",
    ],
    [{ op: "add-take", url: URL_03, durationSeconds: 0 }, "positive number"],
    [
      { op: "add-take", url: URL_03, durationSeconds: Number.NaN },
      "positive number",
    ],
    [
      {
        op: "add-take",
        url: URL_03,
        durationSeconds: 5,
        label: "x".repeat(121),
      },
      "1 to 120 characters",
    ],
  ])("refuses %o", (op, message) => {
    expect(() =>
      applyPostProjectOps(empty(), [op as PostProjectOp], ctx)
    ).toThrow(message);
  });
});

describe("remove-take", () => {
  it("removes the take and every clip cut from it", () => {
    const added = applyPostProjectOps(
      empty(),
      [{ op: "add-take", url: URL_03, durationSeconds: 12.5, append: true }],
      ctx
    );
    const next = applyPostProjectOps(
      added,
      [{ op: "remove-take", take: "take-1" }],
      ctx
    );
    expect(next.takes).toEqual([]);
    expect(next.tracks[0]?.items).toEqual([]);
  });

  it("names a take that is not there", () => {
    expect(() =>
      applyPostProjectOps(empty(), [{ op: "remove-take", take: "nope" }], ctx)
    ).toThrow('No take "nope" in this post.');
  });
});
