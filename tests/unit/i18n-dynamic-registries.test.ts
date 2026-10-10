import { describe, expect, it } from "vitest";
import { BACKGROUND_CARD_REGISTRY } from "@austencloud/backgrounds/card";

import en from "../../messages/en.json";
import de from "../../messages/de.json";
import {
  CARD_REGISTRY,
  getGeneratorCardHelp,
  getGeneratorCardTourLabel,
} from "#lib/shared/create/domain/card-registry.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { localizedPropName } from "#lib/shared/settings/components/tabs/prop-type/localized-prop-name.js";
import { SHOWROOM_THEMES } from "#lib/shared/settings/components/tabs/background/showroom/theme-showroom-data.js";

const catalogs = { en, de } as const;

function missingKeys(keys: Iterable<string>): string[] {
  const missing: string[] = [];
  for (const key of keys) {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      if (!Object.hasOwn(catalog, key) || !catalog[key as keyof typeof catalog]) {
        missing.push(`${locale}:${key}`);
      }
    }
  }
  return missing.sort();
}

describe("dynamic UI translation keys", () => {
  it("covers every prop name resolved by the settings prop-name helper", () => {
    const keys = Object.values(PropType).map((propType) => {
      const key = `settings_prop_name_${propType}`;
      expect(localizedPropName(propType)).not.toBe(key);
      return key;
    });

    expect(missingKeys(keys)).toEqual([]);
  });

  it("covers background card titles and descriptions, plus showroom titles", () => {
    const keys = new Set<string>();
    for (const card of BACKGROUND_CARD_REGISTRY) {
      keys.add(`settings_theme_${card.type}`);
      keys.add(`settings_theme_${card.type}_desc`);
    }
    for (const theme of SHOWROOM_THEMES) {
      keys.add(`settings_theme_${theme.id}`);
    }

    expect(missingKeys(keys)).toEqual([]);
  });

  it("covers authored generator card help and readable tour labels", () => {
    const keys = new Set<string>();
    for (const card of CARD_REGISTRY) {
      const prefix = `create_tour_card_${card.id.replaceAll("-", "_")}`;
      const help = getGeneratorCardHelp(card);
      const label = getGeneratorCardTourLabel(card);
      const override = "helpOverride" in card ? card.helpOverride : undefined;

      for (const [field, suffix] of [
        ["name", "name"],
        ["shortDesc", "short_desc"],
        ["fullDesc", "full_desc"],
      ] as const) {
        if (override?.[field]) {
          expect(help[field]).toBeTruthy();
          keys.add(`${prefix}_${suffix}`);
        }
      }
      if (card.tourHeader) {
        expect(label.header).toBeTruthy();
        keys.add(`${prefix}_header`);
      }
      // Numbers and symbols have no language-specific tour value to translate.
      if (/\p{L}/u.test(card.tourDefaultValue)) {
        expect(label.value).toBeTruthy();
        keys.add(`${prefix}_value`);
      }
    }

    expect(missingKeys(keys)).toEqual([]);
  });
});
