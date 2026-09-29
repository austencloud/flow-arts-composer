import { describe, expect, it } from "vitest";
import {
  PostProjectSchema,
  findItem,
} from "$lib/shared/media-composition/domain/post-project";
import { updateItem } from "$lib/shared/media-composition/domain/post-project-edits";
import { cardOptionsForItem } from "$lib/shared/share/components/post-studio/post-item-render-options";
import { card, overlay, project } from "./post-project-fixtures";

const ctx = { now: 1_700_000_000_001 };

describe("selected media appearance", () => {
  it("changes one animation without touching its neighbor or its timing", () => {
    const original = project(
      [card("end")],
      [[overlay("a", "animation"), overlay("b", "animation", { start: 4 })]]
    );
    const edited = updateItem(
      original,
      "a",
      {
        animationAppearance: {
          gridMode: "none",
          props: false,
          stepNumbers: true,
          pathShape: "concave",
          motionAwarePaths: false,
          effortPreset: "glide",
          trail: {
            enabled: true,
            trackingMode: "both_ends",
            thickness: 4,
            brightness: 0.8,
            tailLength: 50,
            leftColor: "#123456",
            rightColor: "#abcdef",
          },
        },
      },
      ctx
    );
    const a = findItem(edited, "a")?.item;
    const b = findItem(edited, "b")?.item;
    expect(a?.kind === "animation" && a.animationAppearance).toEqual({
      gridMode: "none",
      props: false,
      stepNumbers: true,
      pathShape: "concave",
      motionAwarePaths: false,
      effortPreset: "glide",
      trail: {
        enabled: true,
        trackingMode: "both_ends",
        thickness: 4,
        brightness: 0.8,
        tailLength: 50,
        leftColor: "#123456",
        rightColor: "#abcdef",
      },
    });
    expect(b?.kind === "animation" && b.animationAppearance).toBeUndefined();
    expect(a?.start).toBe(findItem(original, "a")?.item.start);
    expect(a?.duration).toBe(findItem(original, "a")?.item.duration);
    expect(PostProjectSchema.parse(JSON.parse(JSON.stringify(edited)))).toEqual(
      edited
    );
  });

  it("applies a card's own export options without changing shared options", () => {
    const original = project([card("one"), card("two")]);
    const edited = updateItem(
      original,
      "one",
      {
        cardAppearance: { addWord: false, showGrid: false },
      },
      ctx
    );
    const one = findItem(edited, "one")?.item;
    const two = findItem(edited, "two")?.item;
    const base = {
      addWord: true,
      visibilityOverrides: { showGrid: true, darkMode: true },
    };
    expect(cardOptionsForItem(base, one?.kind === "card" ? one : null)).toEqual(
      {
        addWord: false,
        visibilityOverrides: { showGrid: false, darkMode: true },
      }
    );
    expect(cardOptionsForItem(base, two?.kind === "card" ? two : null)).toBe(
      base
    );
    expect(base.addWord).toBe(true);
    expect(PostProjectSchema.parse(JSON.parse(JSON.stringify(edited)))).toEqual(
      edited
    );
  });
});
