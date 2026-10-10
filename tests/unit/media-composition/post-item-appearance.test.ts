import { describe, expect, it } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import {
  PostProjectSchema,
  findItem,
} from "#lib/shared/media-composition/domain/post-project.js";
import { updateItem } from "#lib/shared/media-composition/domain/post-project-edits.js";
import { animationAppearanceForItem, cardOptionsForItem } from "#lib/shared/share/components/post-studio/post-item-render-options.js";
import { card, overlay, project } from "./post-project-fixtures";

const ctx = { now: 1_700_000_000_001 };

describe("selected media appearance", () => {
  it("keeps PiP appearance and effects scoped through draft serialization", () => {
    const original = project(
      [card("end")],
      [[overlay("moves-a", "moves"), overlay("moves-b", "moves", { start: 4 })]]
    );
    const effects = {
      ...DEFAULT_EFFECTS_CONFIG,
      activeEffect: "fire" as const,
      tipEffectMap: { "*": { effect: "fire" as const } },
    };
    const edited = updateItem(original, "moves-a", {
      animationAppearance: {
        propType: PropType.CLUB,
        propLook: "pictograph",
        darkMode: false,
        progressBar: false,
        pathShape: "concave",
        effortPreset: "glide",
        effects,
      },
    }, ctx);
    const selected = findItem(edited, "moves-a")?.item;
    const neighbor = findItem(edited, "moves-b")?.item;
    expect(selected?.kind).toBe("moves");
    expect(selected?.kind === "moves" && selected.mode).toBe("alternate");
    expect(animationAppearanceForItem(selected?.kind === "moves" ? selected : null))
      .toMatchObject({ propLook: "pictograph", darkMode: false, progressBar: false, effortPreset: "glide", effects });
    expect(animationAppearanceForItem(neighbor?.kind === "moves" ? neighbor : null))
      .toBeNull();
    expect(selected?.start).toBe(findItem(original, "moves-a")?.item.start);
    expect(selected?.duration).toBe(findItem(original, "moves-a")?.item.duration);
    expect(PostProjectSchema.parse(JSON.parse(JSON.stringify(edited)))).toEqual(edited);
  });

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
          propType: PropType.CLUB,
          propLook: "model",
          gridMode: "none",
          props: false,
          stepNumbers: true,
          progressBar: true,
          wordHeaderHighlight: "travel",
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
      propType: PropType.CLUB,
      propLook: "model",
      gridMode: "none",
      props: false,
      stepNumbers: true,
      progressBar: true,
      wordHeaderHighlight: "travel",
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

  it("persists the viewer card controls and resolves the one-cell choice per card", () => {
    const original = project([card("one"), card("two")]);
    const edited = updateItem(original, "one", {
      cardAppearance: {
        showNotes: true,
        customNotesText: "Practice this turn",
        infoCellChoice: "mandala",
        columnCount: 3,
        startPlacementLayout: "column",
        showPropTnD: false,
        showHandColorKey: false,
        showNonRadialPoints: false,
        darkMode: false,
      },
    }, ctx);
    const one = findItem(edited, "one")?.item;
    const two = findItem(edited, "two")?.item;
    const base = {
      showNotes: false,
      visibilityOverrides: { showQRCode: true, showMandala: false, darkMode: true },
    };
    const rendered = cardOptionsForItem(base, one?.kind === "card" ? one : null);
    expect(rendered).toMatchObject({
      showNotes: true,
      customNotesText: "Practice this turn",
      columnCount: 3,
      startPlacementLayout: "column",
      visibilityOverrides: {
        showQRCode: false,
        showMandala: true,
        showPropTnD: false,
        showHandColorKey: false,
        showNonRadialPoints: false,
        darkMode: false,
      },
    });
    expect(cardOptionsForItem(base, two?.kind === "card" ? two : null)).toBe(base);
    expect(PostProjectSchema.parse(JSON.parse(JSON.stringify(edited)))).toEqual(edited);
  });
});
