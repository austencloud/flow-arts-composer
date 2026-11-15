import { describe, expect, it } from "vitest";
import {
  findItem,
  splitItemAt,
  type PostItem,
  type PostProject,
} from "@austencloud/video-editor/core";
import { shiftTkaItemTimes } from "./item-times";
import { TKA_EDIT_HOOKS } from "./edit-hooks";
import { createEmptyPostProject, editContext } from "./bound";

const base = {
  label: "",
  start: 0,
  duration: 10,
  box: { x: 0, y: 0, width: 1, height: 1 },
  opacity: 1,
  fadeIn: 0,
  fadeOut: 0,
  anchor: null,
  fill: false,
};

const animation = (split: object) =>
  ({ ...base, id: "a", kind: "animation", overlay: false, split }) as PostItem;
const titles = (fields: object) =>
  ({ ...base, id: "t", kind: "titles", ...fields }) as PostItem;
const card = (fields: object) =>
  ({ ...base, id: "c", kind: "card", ...fields }) as PostItem;
const field = (item: PostItem, key: string) =>
  (item as unknown as Record<string, unknown>)[key];

describe("shiftTkaItemTimes: animation split", () => {
  const split = { openAt: 4, openSeconds: 0.7, closeAt: 7, closeSeconds: 0.5 };

  it("stays on the same moments after a later start", () => {
    expect(field(shiftTkaItemTimes(animation(split), 1.5), "split")).toEqual({
      ...split,
      openAt: 2.5,
      closeAt: 5.5,
    });
  });

  it("stays on the same moments after an earlier start", () => {
    expect(field(shiftTkaItemTimes(animation(split), -2), "split")).toEqual({
      ...split,
      openAt: 6,
      closeAt: 9,
    });
  });

  it("stays open from the clip's start when the opening is cut away", () => {
    const next = field(shiftTkaItemTimes(animation(split), 5), "split");
    expect(next).toEqual({ ...split, openAt: -1, closeAt: 2 });
  });

  it("is removed when it closed before the new start", () => {
    const next = shiftTkaItemTimes(animation(split), 8);
    expect(next).not.toHaveProperty("split");
  });

  it("keeps an open-ended split open", () => {
    const open = { openAt: 1, openSeconds: 0.7 };
    expect(field(shiftTkaItemTimes(animation(open), 6), "split")).toEqual({
      openAt: -5,
      openSeconds: 0.7,
    });
  });
});

describe("shiftTkaItemTimes: animation lifted panel", () => {
  const lifted = (panelLift: object, split?: object) =>
    ({ ...animation(split as never), panelLift }) as PostItem;
  const lift = {
    canvasY: 0.344,
    inAt: 2,
    inSeconds: 0.8,
    outAt: 7,
    outSeconds: 0.7,
  };

  it("stays on the same moments after a later start", () => {
    expect(field(shiftTkaItemTimes(lifted(lift), 1.5), "panelLift")).toEqual({
      ...lift,
      inAt: 0.5,
      outAt: 5.5,
    });
  });

  it("stays on the same moments after an earlier start", () => {
    expect(field(shiftTkaItemTimes(lifted(lift), -2), "panelLift")).toEqual({
      ...lift,
      inAt: 4,
      outAt: 9,
    });
  });

  it("is already in at the clip's start when the arrival is cut away", () => {
    expect(field(shiftTkaItemTimes(lifted(lift), 3), "panelLift")).toEqual({
      ...lift,
      inAt: -1,
      outAt: 4,
    });
  });

  it("is removed when it had gone all the way back before the new start", () => {
    // Going back ends at 7.7.
    expect(shiftTkaItemTimes(lifted(lift), 7.8)).not.toHaveProperty(
      "panelLift"
    );
    const late = field(shiftTkaItemTimes(lifted(lift), 7.6), "panelLift");
    expect((late as { outAt: number }).outAt).toBeCloseTo(-0.6);
  });

  it("keeps a lift that stays in to the end", () => {
    const open = { inAt: 1, inSeconds: 0.8 };
    expect(field(shiftTkaItemTimes(lifted(open), 6), "panelLift")).toEqual({
      inAt: -5,
      inSeconds: 0.8,
    });
  });

  it("leaves a lift without times as it was", () => {
    const whole = { canvasScale: 0.9 };
    expect(field(shiftTkaItemTimes(lifted(whole), 3), "panelLift")).toBe(
      whole
    );
  });

  it("shifts the split and the lift together", () => {
    const next = shiftTkaItemTimes(
      lifted(lift, { openAt: 4, openSeconds: 0.7 }),
      1
    );
    expect(field(next, "split")).toEqual({ openAt: 3, openSeconds: 0.7 });
    expect(field(next, "panelLift")).toMatchObject({ inAt: 1, outAt: 6 });
  });
});

describe("shiftTkaItemTimes: titles spans", () => {
  const lit = { from: 2, to: 5 };
  const quiet = { from: 6, to: 8 };

  it("moves both spans after a later start", () => {
    const next = shiftTkaItemTimes(titles({ lit, quiet }), 1);
    expect(field(next, "lit")).toEqual({ from: 1, to: 4 });
    expect(field(next, "quiet")).toEqual({ from: 5, to: 7 });
  });

  it("moves both spans after an earlier start", () => {
    const next = shiftTkaItemTimes(titles({ lit, quiet }), -1.5);
    expect(field(next, "lit")).toEqual({ from: 3.5, to: 6.5 });
    expect(field(next, "quiet")).toEqual({ from: 7.5, to: 9.5 });
  });

  it("keeps the remainder of a span cut partly away, and drops one cut wholly away", () => {
    const next = shiftTkaItemTimes(titles({ lit, quiet }), 6.5);
    expect(next).not.toHaveProperty("lit");
    expect(field(next, "quiet")).toEqual({ from: 0, to: 1.5 });
  });
});

describe("shiftTkaItemTimes: card ring and QR exit", () => {
  const ring = { at: 2, every: 0.5 };
  const qrExit = { at: 6, seconds: 1 };

  it("moves both after a later start", () => {
    const next = shiftTkaItemTimes(card({ ring, qrExit }), 1);
    expect(field(next, "ring")).toEqual({ at: 1, every: 0.5 });
    expect(field(next, "qrExit")).toEqual({ at: 5, seconds: 1 });
  });

  it("moves both after an earlier start", () => {
    const next = shiftTkaItemTimes(card({ ring, qrExit }), -2);
    expect(field(next, "ring")).toEqual({ at: 4, every: 0.5 });
    expect(field(next, "qrExit")).toEqual({ at: 8, seconds: 1 });
  });

  it("keeps a start before the clip as already under way", () => {
    const next = shiftTkaItemTimes(card({ ring, qrExit }), 3);
    expect(field(next, "ring")).toEqual({ at: -1, every: 0.5 });
    expect(field(next, "qrExit")).toEqual({ at: 3, seconds: 1 });
  });
});

describe("shiftTkaItemTimes: nothing to shift", () => {
  it("returns the same item", () => {
    for (const item of [
      animation(undefined as never),
      titles({}),
      card({}),
      { ...base, id: "f", kind: "flash", strength: 1, fade: 0.3, marks: false },
    ] as PostItem[]) {
      const plain = { ...item };
      delete (plain as Record<string, unknown>).split;
      expect(shiftTkaItemTimes(plain as PostItem, 2)).toBe(plain);
    }
  });

  it("is the plugin's shiftItemTimes hook", () => {
    expect(TKA_EDIT_HOOKS.shiftItemTimes).toBe(shiftTkaItemTimes);
  });
});

describe("the second piece of a cut", () => {
  it("carries a titles clip's span to the same moment", () => {
    const empty = createEmptyPostProject({ sequenceId: "seq", now: 1 });
    const item = titles({ start: 2, lit: { from: 1, to: 6 } });
    const project: PostProject = {
      ...empty,
      tracks: [
        empty.tracks[0]!,
        { id: "over", hidden: false, locked: false, items: [item] },
      ],
    };
    const cut = splitItemAt(project, "t", 5, editContext(2))!.project;
    const pieces = cut.tracks[1]!.items;
    expect(pieces).toHaveLength(2);
    const second = pieces.find((piece) => piece.id !== "t")!;
    expect(second.start).toBeCloseTo(5);
    // Post 3 to 8 was lit; the second piece starts at post 5.
    expect(field(second, "lit")).toEqual({ from: 0, to: 3 });
    expect(field(findItem(cut, "t")!.item, "lit")).toEqual({ from: 1, to: 6 });
  });
});
