import { afterEach, expect, it } from "vitest";
import { setLocale } from "../../src/lib/shared/i18n/i18n.svelte";
import {
  GENERATION_DASH_OPTIONS,
  GENERATION_STYLE_OPTIONS,
} from "../../src/lib/shared/create/domain/generation-style-display";
import { ORIENTATION_SHORT } from "../../src/lib/features/create/generate/components/cards/customize-summary";
import { Orientation } from "../../src/lib/shared/pictograph/shared/domain/enums/pictograph-enums";

afterEach(async () => {
  await setLocale("en");
  document.cookie = "PARAGLIDE_LOCALE=; max-age=0; path=/";
});

it("translates held generation options across en→de→en without changing saved values", async () => {
  const styleOptions = GENERATION_STYLE_OPTIONS;
  const dashOptions = GENERATION_DASH_OPTIONS;
  const styleValues = styleOptions.map((option) => option.value);
  const dashValues = dashOptions.map((option) => option.value);
  const orientationLabels = ORIENTATION_SHORT;
  const orientationValues = [
    Orientation.IN,
    Orientation.CLOCK,
    Orientation.OUT,
    Orientation.COUNTER,
  ];
  const readOrientationLabels = () =>
    orientationValues.map((value) => orientationLabels[value]);

  await setLocale("en");
  expect(styleOptions.map((option) => option.label)).toEqual([
    "Smooth",
    "Mixed",
    "Choppy",
  ]);
  expect(dashOptions.map((option) => option.label)).toEqual([
    "Low",
    "Mixed",
    "High",
  ]);
  const englishStyleHints = styleOptions.map((option) => option.hint);
  const englishDashHints = dashOptions.map((option) => option.hint);
  expect(englishStyleHints[0]).toBe("Reversals kept to a minimum.");
  expect(englishDashHints[1]).toBe("Dashes allowed where they fit.");
  expect(readOrientationLabels()).toEqual(["In", "CW", "Out", "CCW"]);

  await setLocale("de");
  expect(GENERATION_STYLE_OPTIONS).toBe(styleOptions);
  expect(GENERATION_DASH_OPTIONS).toBe(dashOptions);
  expect(styleOptions.map((option) => option.label)).toEqual([
    "Fließend",
    "Gemischt",
    "Abgehackt",
  ]);
  expect(dashOptions.map((option) => option.label)).toEqual([
    "Niedrig",
    "Gemischt",
    "Hoch",
  ]);
  expect(styleOptions.map((option) => option.hint)).toEqual([
    "Richtungswechsel werden auf ein Minimum beschränkt.",
    "Richtungswechsel sind erlaubt, wo sie passen.",
    "Bei jedem Schritt ein Richtungswechsel — das schränkt die Auswahl ein, daher wiederholen sich Ergebnisse häufiger.",
  ]);
  expect(dashOptions.map((option) => option.hint)).toEqual([
    "Dashes werden vermieden.",
    "Dashes sind erlaubt, wo sie passen.",
    "Dashes werden bevorzugt.",
  ]);
  expect(ORIENTATION_SHORT).toBe(orientationLabels);
  expect(readOrientationLabels()).toEqual(["Innen", "Mit", "Außen", "Gegen"]);
  expect(styleOptions.map((option) => option.value)).toEqual(styleValues);
  expect(dashOptions.map((option) => option.value)).toEqual(dashValues);

  await setLocale("en");
  expect(styleOptions.map((option) => option.label)).toEqual([
    "Smooth",
    "Mixed",
    "Choppy",
  ]);
  expect(dashOptions.map((option) => option.label)).toEqual([
    "Low",
    "Mixed",
    "High",
  ]);
  expect(styleOptions.map((option) => option.hint)).toEqual(englishStyleHints);
  expect(dashOptions.map((option) => option.hint)).toEqual(englishDashHints);
  expect(readOrientationLabels()).toEqual(["In", "CW", "Out", "CCW"]);
  expect(styleOptions.map((option) => option.value)).toEqual(styleValues);
  expect(dashOptions.map((option) => option.value)).toEqual(dashValues);
});
