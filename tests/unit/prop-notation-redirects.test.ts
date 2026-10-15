import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROP_KEYS,
  PROPS,
  isPropKey,
} from "../../src/routes/(public)/notation/props/props-content";
import {
  findPropTypeByValue,
  getPropTypeDisplayInfo,
} from "../../src/lib/shared/pictograph/prop/domain/prop-type-display-registry";

// The five per-prop pages merged into /notation/props on 2026-10-15. Each old
// address must 301 to the hash that picks its own prop; a wrong or unknown
// hash silently opens the page on staves instead.
describe("old per-prop notation addresses", () => {
  it("each 301s to /notation/props with its own prop picked", () => {
    for (const prop of PROP_KEYS) {
      const loader = readFileSync(
        resolve(process.cwd(), `src/routes/(public)/notation/${prop}/+page.ts`),
        "utf-8"
      );
      expect(loader).toContain(`redirect(301, "/notation/props#${prop}")`);
    }
  });

  it("every prop the page offers has copy, a caption, and a player prop type", () => {
    for (const prop of PROP_KEYS) {
      const entry = PROPS[prop];
      expect(entry.paragraphs.length).toBeGreaterThan(0);
      expect(entry.note.trim()).not.toBe("");
      expect(entry.propType.trim()).not.toBe("");
    }
    expect(isPropKey("poi")).toBe(true);
    expect(isPropKey("history")).toBe(false);
  });

  // The switcher shows each prop's picker art. An unknown prop type falls
  // back to the staff picture, which would put five staves on the picker.
  it("every prop's tab resolves to its own picture", () => {
    const images = PROP_KEYS.map((prop) => {
      const type = findPropTypeByValue(PROPS[prop].propType);
      expect(type, prop).toBeDefined();
      return getPropTypeDisplayInfo(type!).image;
    });
    expect(new Set(images).size).toBe(PROP_KEYS.length);
    for (const image of images) {
      const file = image.split("?")[0]!;
      expect(() =>
        readFileSync(resolve(process.cwd(), `static${file}`))
      ).not.toThrow();
    }
  });
});
