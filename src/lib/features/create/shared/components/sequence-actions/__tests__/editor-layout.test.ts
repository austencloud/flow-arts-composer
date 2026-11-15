import { describe, expect, it } from "vitest";
import {
  bandAllowance,
  choosePhoneStartForm,
  choosePhoneStepForm,
  EMPTY_BAND_LIMIT,
  tallHeaderExtraHeight,
} from "../editor-layout";

// Top zones measured on Generate (8-step sequence), 2026-11-13. A step's top
// zone is the editor body less the 101px controls zone; the start has no
// controls zone, so it gets the whole body.
const STEP_ACTIONS = 36 + 6 + 72; // trash, gap, Done

describe("phone step editor arrangement", () => {
  it.each([
    // window, top zone, picture before this pass
    ["360x591", 360, 188, 140],
    ["360x640", 360, 190, 140],
    ["375x667", 375, 190, 155],
  ])("%s never shrinks the picture or leaves a band", (_, w, h, before) => {
    const choice = choosePhoneStepForm(w, h, STEP_ACTIONS);
    expect(choice.board).toBeGreaterThanOrEqual(before);
    expect(choice.band).toBeLessThanOrEqual(bandAllowance(choice.board));
  });

  it("never leaves an empty block beside a small picture", () => {
    // 360 x 591 measured exactly 16 of slack beside the column form.
    expect(
      choosePhoneStepForm(360, 188, STEP_ACTIONS).band
    ).toBeLessThanOrEqual(EMPTY_BAND_LIMIT);
  });

  // The tall arrangement is unchanged from the first pass; the chooser only
  // has to keep picking it where it already gave the biggest picture.
  it.each([
    ["360x780", 360, 330],
    ["412x915", 412, 443],
  ])("%s keeps the tall arrangement", (_, w, h) => {
    expect(choosePhoneStepForm(w, h, STEP_ACTIONS).form).toBe("tall");
  });

  // Measured in a browser: with Duration under the picture, 360 x 689 left a
  // 183 picture beside an empty block about 107 tall. Duration belongs in
  // that column, and the picture grows to 194.
  it("fills the column beside the picture at 360x689", () => {
    const choice = choosePhoneStepForm(360, 239, STEP_ACTIONS);
    expect(choice.form).toBe("column");
    expect(choice.board).toBeGreaterThanOrEqual(190);
  });

  // Measured in a browser: 375 x 667 gives a 211 top zone, and with the beta
  // chip a strict 16px band limit chose a 155 picture over a 185 one.
  it("takes the bigger picture at 375x667 with the beta chip", () => {
    const choice = choosePhoneStepForm(375, 211, STEP_ACTIONS + 62);
    expect(choice.form).toBe("column");
    expect(choice.board).toBeGreaterThanOrEqual(180);
  });

  it("keeps a wide beta-swap action row out of the picture's way", () => {
    const withBeta = choosePhoneStepForm(360, 188, STEP_ACTIONS + 56);
    expect(360 - 14 - withBeta.board).toBeGreaterThanOrEqual(STEP_ACTIONS + 56);
  });
});

// Measured at 360 x 689 in German, 2026-11-14: the tall header's text has
// 160px beside Delete and Done; "Schritt 5 wird bearbeitet" needs 176 and was
// cut with an ellipsis. The title's line is 18.4 (16px at 1.15), the red
// line's 14.4 (12px at 1.2).
const DE_TITLE = { titleWidth: 176, titleLine: 18.4, scopeLine: 14.4 };

describe("tall step header that wraps", () => {
  it("adds nothing when the words fit on one line", () => {
    expect(
      tallHeaderExtraHeight({
        textRoom: 160,
        titleWidth: 112,
        titleLine: 18.4,
        scopeWidth: 150,
        scopeLine: 14.4,
      })
    ).toBe(0);
  });

  it("grows by the German title's second line", () => {
    // 4 + 2 x 18.4 + 2 + 14.4 + 4 = 61.2, so 62 against the 44px row.
    expect(
      tallHeaderExtraHeight({ textRoom: 160, scopeWidth: 159, ...DE_TITLE })
    ).toBe(18);
  });

  it("grows by both second lines when the red line wraps too", () => {
    expect(
      tallHeaderExtraHeight({ textRoom: 150, scopeWidth: 159, ...DE_TITLE })
    ).toBe(32);
  });

  it("takes the taller header from the tall picture", () => {
    // 360 x 800: a 372px top zone.
    expect(choosePhoneStepForm(360, 372, 176)).toMatchObject({
      form: "tall",
      board: 272,
    });
    expect(choosePhoneStepForm(360, 372, 176, 18)).toMatchObject({
      form: "tall",
      board: 254,
    });
  });

  it("takes another arrangement once it gives the bigger picture", () => {
    // 360 x 689 in German: a 261px top zone. One-line, the tall picture was
    // 161 with the title cut; with the header 18px taller it would be 143,
    // and the picture beside the header (196) scores higher.
    expect(choosePhoneStepForm(360, 261, 176).form).toBe("tall");
    const wrapped = choosePhoneStepForm(360, 261, 176, 18);
    expect(wrapped.form).not.toBe("tall");
    expect(wrapped.board).toBeGreaterThan(161);
  });
});

describe("phone start editor arrangement", () => {
  it("stacks at 360x689 with a board of at least 180", () => {
    const choice = choosePhoneStartForm(360, 340);
    expect(choice.form).toBe("stack");
    expect(choice.board).toBeGreaterThanOrEqual(180);
    expect(choice.twoUp).toBe(true);
  });

  it.each([
    ["360x591", 360, 289],
    ["360x640", 360, 291],
    ["375x667", 375, 291],
  ])("%s keeps whichever form gives the bigger board", (_, w, h) => {
    const choice = choosePhoneStartForm(w, h);
    expect(choice.form).toBe("side");
    expect(choice.board).toBeGreaterThanOrEqual(162);
  });
});
