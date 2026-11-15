import { describe, expect, it } from "vitest";
import { parseCollectionTranslations } from "#lib/shared/library/services/collection-firestore-mapper.js";
import {
  collectionDisplayDescription,
  collectionDisplayName,
} from "#lib/shared/library/domain/collection-display-name.js";

// A collection we publish ourselves can carry its name per language. The
// silent bug this guards: a malformed stored value (wrong locale, blank name)
// replacing a good typed name with an empty string or a stray key.
describe("collection translations", () => {
  it("keeps known locales with text and drops everything else", () => {
    expect(
      parseCollectionTranslations({
        "zh-Hant": { name: " 甩火球動作 ", description: "" },
        ja: { description: "ポイの動き" },
        klingon: { name: "x" },
        fr: { name: "   " },
        de: "not an object",
      })
    ).toEqual({
      "zh-Hant": { name: "甩火球動作" },
      ja: { description: "ポイの動き" },
    });
  });

  it("reads absent, empty or malformed data as no translations", () => {
    expect(parseCollectionTranslations(undefined)).toBeUndefined();
    expect(parseCollectionTranslations({})).toBeUndefined();
    expect(parseCollectionTranslations(["zh"])).toBeUndefined();
  });

  it("shows the visitor's language and falls back to the typed name", () => {
    const collection = {
      name: "Poi Moves",
      description: "Moves for poi",
      translations: { "zh-Hant": { name: "甩火球動作" } },
    };
    expect(collectionDisplayName(collection, "zh-Hant")).toBe("甩火球動作");
    // Simplified readers do not get the Traditional name.
    expect(collectionDisplayName(collection, "zh")).toBe("Poi Moves");
    expect(collectionDisplayName(collection, "en")).toBe("Poi Moves");
    expect(collectionDisplayDescription(collection, "zh-Hant")).toBe(
      "Moves for poi"
    );
  });

  it("leaves a name nobody translated exactly as typed", () => {
    expect(collectionDisplayName({ name: "Mis secuencias" }, "ja")).toBe(
      "Mis secuencias"
    );
  });
});
