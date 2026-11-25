// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { locales, setLocale, t } from "#lib/shared/i18n/i18n.svelte.js";
import { loopOptionName } from "#lib/shared/components/loop-picker/loop-option-name.js";
import { loopTypeLabel } from "#lib/features/create/generate/components/loop-component-presentation.js";
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import {
  HORIZONTAL_MIRROR_LOCATION_MAP,
  VERTICAL_MIRROR_LOCATION_MAP,
} from "#lib/shared/create/domain/strict-loop-placement-maps.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

function messages(locale: string): Record<string, string> {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `messages/${locale}.json`), "utf8")
  );
}

afterEach(async () => {
  await setLocale("en");
  document.cookie = "PARAGLIDE_LOCALE=; max-age=0; path=/";
});

describe("LOOP names in the Extend list", () => {
  // Two languages prove the name follows the locale; the word itself is one
  // message, and loading all twelve here is slow enough to time out under load.
  it("calls both reflections Reflected, in the language on screen", async () => {
    for (const locale of ["en", "de"] as const) {
      await setLocale(locale);
      const reflected = t("generator_loop_reflected");
      expect(loopOptionName(LOOPType.MIRRORED), locale).toBe(reflected);
      expect(loopOptionName(LOOPType.FLIPPED), locale).toBe(reflected);
    }
  });

  it("leaves every other type's name as it was", () => {
    for (const type of Object.values(LOOPType)) {
      if (type === LOOPType.FLIPPED) continue;
      expect(loopOptionName(type)).toBe(loopTypeLabel(type));
    }
  });

  it("tells the two apart by their line, in every language", () => {
    for (const locale of locales) {
      const words = messages(locale);
      const vertical = words["loop_picker_description_mirrored"];
      const horizontal = words["loop_picker_description_flipped"];
      expect(vertical, locale).toBeTruthy();
      expect(horizontal, locale).toBeTruthy();
      expect(vertical, locale).not.toBe(horizontal);
    }
  });

  it("names the sides each reflection really trades", () => {
    const english = messages("en");

    expect(VERTICAL_MIRROR_LOCATION_MAP[GridLocation.EAST]).toBe(
      GridLocation.WEST
    );
    expect(VERTICAL_MIRROR_LOCATION_MAP[GridLocation.NORTH]).toBe(
      GridLocation.NORTH
    );
    expect(english["loop_picker_description_mirrored"]).toBe(
      "Vertical line: east and west trade places"
    );

    expect(HORIZONTAL_MIRROR_LOCATION_MAP[GridLocation.NORTH]).toBe(
      GridLocation.SOUTH
    );
    expect(HORIZONTAL_MIRROR_LOCATION_MAP[GridLocation.EAST]).toBe(
      GridLocation.EAST
    );
    expect(english["loop_picker_description_flipped"]).toBe(
      "Horizontal line: north and south trade places"
    );
  });
});
