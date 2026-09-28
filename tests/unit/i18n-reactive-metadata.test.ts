import { afterEach, expect, it } from "vitest";
import { setLocale } from "../../src/lib/shared/i18n/i18n.svelte";
import { COLOR_PRESETS } from "../../src/lib/shared/ui/color-presets";
import {
  WORKSPACE_BUTTON_ICON,
  WORKSPACE_BUTTON_TUTORIAL,
} from "../../src/lib/features/create/shared/workspace-panel/shared/workspace-button-layout";
import { actionHelpContent } from "../../src/lib/features/create/shared/domain/transforms/transform-help-content";

afterEach(async () => {
  await setLocale("en");
  document.cookie = "PARAGLIDE_LOCALE=; max-age=0; path=/";
});

it("updates existing color presets and tutorial metadata after a language switch", async () => {
  await setLocale("en");
  const colors = COLOR_PRESETS.map((color) => color.name);
  const tutorial = WORKSPACE_BUTTON_TUTORIAL.undo;
  const englishDescription = tutorial.description;
  expect(WORKSPACE_BUTTON_ICON.undo.actionLabel).toBe("Undo");

  await setLocale("de");
  expect(COLOR_PRESETS[0]!.name).toBe("Hellrot");
  expect(COLOR_PRESETS.map((color) => color.name)).not.toEqual(colors);
  expect(WORKSPACE_BUTTON_ICON.undo.actionLabel).toBe("Rückgängig");
  expect(tutorial.description).not.toBe(englishDescription);

  await setLocale("en");
  expect(COLOR_PRESETS.map((color) => color.name)).toEqual(colors);
  expect(tutorial.description).toBe(englishDescription);
});

it("updates a held action help item without changing its action identity", async () => {
  await setLocale("en");
  const action = actionHelpContent.find((item) => item.id === "invert");
  expect(action).toBeDefined();
  if (!action) return;

  const identity = {
    id: action.id,
    icon: action.icon,
    category: action.category,
  };
  const english = {
    name: action.name,
    shortDesc: action.shortDesc,
    fullDesc: action.fullDesc,
    warning: action.warning,
  };
  expect(english.name).toBe("Invert");
  expect(english.warning).toBe("This will change the letters in your sequence!");

  await setLocale("de");
  expect(actionHelpContent.find((item) => item.id === "invert")).toBe(action);
  expect({
    id: action.id,
    icon: action.icon,
    category: action.category,
  }).toEqual(identity);
  expect(action.name).toBe("Umkehren");
  expect(action.shortDesc).toBe("Drehrichtung und Bewegungsart umkehren");
  expect(action.fullDesc).toContain("Aus CW wird CCW");
  expect(action.warning).toBe("Dadurch ändern sich die Buchstaben deiner Sequenz!");

  await setLocale("en");
  expect({
    name: action.name,
    shortDesc: action.shortDesc,
    fullDesc: action.fullDesc,
    warning: action.warning,
  }).toEqual(english);
  expect({
    id: action.id,
    icon: action.icon,
    category: action.category,
  }).toEqual(identity);
});
