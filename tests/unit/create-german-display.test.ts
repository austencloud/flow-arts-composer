import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "$lib/shared/i18n/i18n.svelte";
import {
  CARD_REGISTRY,
  getGeneratorCardHelp,
  getGeneratorCardTourLabel,
} from "$lib/shared/create/domain/card-registry";
import { localizedModeWords } from "$lib/shared/shape-matrix/domain/shape-matrix-display";
import { describeCreateTnDSelection } from "$lib/features/create/generate/components/cards/tnd-presentation";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { describePictograph } from "$lib/shared/pictograph/shared/domain/utils/pictograph-description";

afterEach(async () => {
  await setLocale("en");
  document.cookie = "PARAGLIDE_LOCALE=; max-age=0; path=/";
});

describe("Create display language", () => {
  it("switches helper labels and tour overrides without changing canonical card data", async () => {
    const before = JSON.stringify(CARD_REGISTRY);
    const word = CARD_REGISTRY.find((entry) => entry.id === "word-input")!;
    const setups = CARD_REGISTRY.find((entry) => entry.id === "preset")!;

    await setLocale("en");
    const englishHelp = getGeneratorCardHelp(word).fullDesc;
    const englishMode = localizedModeWords("TO");
    const englishSelection = describeCreateTnDSelection("TO");
    expect(getGeneratorCardTourLabel(setups).value).toBe("Browse");

    await setLocale("de");
    expect(getGeneratorCardHelp(word).fullDesc).not.toBe(englishHelp);
    expect(getGeneratorCardHelp(word).fullDesc).toMatch(/Wort/);
    expect(getGeneratorCardTourLabel(setups).value).not.toBe("Browse");
    expect(localizedModeWords("TO")).not.toEqual(englishMode);
    expect(describeCreateTnDSelection("TO")).not.toBe(englishSelection);
    expect(JSON.stringify(CARD_REGISTRY)).toBe(before);

    await setLocale("en");
    expect(getGeneratorCardHelp(word).fullDesc).toBe(englishHelp);
    expect(localizedModeWords("TO")).toEqual(englishMode);
    expect(describeCreateTnDSelection("TO")).toBe(englishSelection);
  });

  it("switches accessible pictograph descriptions while preserving motion data", async () => {
    const pictograph = {
      letter: "α",
      startPlacement: "alpha1",
      endPlacement: "alpha1",
      motions: {
        left: createMotionData({
          hand: HandSide.LEFT,
          motionType: MotionType.STATIC,
          startLocation: GridLocation.CENTER,
          endLocation: GridLocation.CENTER,
          isVisible: true,
        }),
      },
    };
    const before = JSON.stringify(pictograph);
    await setLocale("en");
    const english = describePictograph(pictograph);
    expect(english).toContain("Left hand static hold at center");
    await setLocale("de");
    const german = describePictograph(pictograph);
    expect(german).toContain("Buchstabe α");
    expect(german).toContain("Linke Hand");
    expect(german).toContain("Zentrum");
    expect(german).not.toMatch(/Left hand|hands opposite|center/);
    expect(JSON.stringify(pictograph)).toBe(before);
    await setLocale("en");
    expect(describePictograph(pictograph)).toBe(english);
  });
});
