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

import { loopTypeLabel } from "$lib/features/create/generate/components/loop-component-presentation";
import {
  feedbackStatusLabel,
  feedbackTypePlaceholder,
} from "$lib/features/feedback/domain/feedback-display-labels";
import { mapAuthError } from "$lib/shared/auth/services/auth-error-messages";
import { localizeFilterChip } from "$lib/shared/browse/components/localize-filter-chip";
import { effectUiLabel } from "$lib/shared/animation-engine/components/effects-panel/effect-ui-label";
import { postActDisplayLabel } from "$lib/shared/share/components/post-studio/builder/post-builder-format";
import { POST_ACT } from "$lib/shared/media-composition/domain/post-plan";

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

describe("German audit display helpers", () => {
  it("localizes persisted built-in labels without modifying filters or user content", async () => {
    const filters = [
      { type: "length", label: "8 steps", value: 8 },
      { type: "cap_type", label: "Mirrored", value: "component:mirrored" },
      { type: "gridMode", label: "Diamond", value: "diamond" },
      { type: "owner", label: "Fire", value: "Fire" },
      { type: "collection", label: "My German practice", value: "mine" },
    ];
    const before = JSON.stringify(filters);
    await setLocale("en");
    const english = filters.map(localizeFilterChip);
    await setLocale("de");
    const german = filters.map(localizeFilterChip);
    expect(german.slice(0, 3)).toEqual(["8 Schritte", "Gespiegelt", "Raute"]);
    expect(german.slice(3)).toEqual(["Fire", "My German practice"]);
    expect(effectUiLabel("Fire")).toBe("Feuer");
    expect(effectUiLabel("My custom effect")).toBe("My custom effect");
    expect(postActDisplayLabel(POST_ACT.fullSpeed, "Full speed")).not.toBe(
      "Full speed"
    );
    expect(postActDisplayLabel(POST_ACT.fullSpeed, "My chosen title")).toBe(
      "My chosen title"
    );
    expect(JSON.stringify(filters)).toBe(before);
    await setLocale("en");
    expect(filters.map(localizeFilterChip)).toEqual(english);
  });

  it("updates combined LOOP names and existing form helpers after a locale switch", async () => {
    const read = () => ({
      loop: loopTypeLabel("rotated_swapped"),
      status: feedbackStatusLabel("in-progress"),
      placeholder: feedbackTypePlaceholder("bug"),
      auth: mapAuthError({ code: "auth/popup-blocked" }),
    });
    await setLocale("en");
    const english = read();
    await setLocale("de");
    const german = read();
    for (const key of Object.keys(english) as Array<keyof typeof english>) {
      expect(german[key]).not.toBe(english[key]);
      expect(german[key]).not.toMatch(/^(feedback_|generator_|auth_)/);
    }
    expect(german.loop).toContain(" + ");
    await setLocale("en");
    expect(read()).toEqual(english);
  });
});
