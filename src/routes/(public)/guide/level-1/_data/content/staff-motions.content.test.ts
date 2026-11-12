import { describe, expect, it, vi } from "vitest";
import en from "../../../../../../../messages/en.json";
import { staffMotionsContent } from "./staff-motions.content";
import { localizeLevel1Text } from "../localize-level1-content";

// The lookup answers with the key it found, so a miss (which falls back to
// the English text) cannot pass.
vi.mock("#lib/shared/i18n/i18n.svelte.js", () => ({ t: (key: string) => `key:${key}` }));

// Austen approved these three sentences on 2026-11-11. Each must still be on
// the page and still find its translated message: the lookup goes by the
// exact English text, so a quiet edit to either side drops every language
// back to English.
const APPROVED = {
  verified_level1_staff_motions_shift_intro:
    "During a shift, a prop can rotate in one of two directions - Prospin or Antispin.",
  verified_level1_staff_motions_prospin_rule:
    "The prop rotates the same direction as the handpath.<br>A 90 degree isolation is our base unit of a prospin.",
  verified_level1_staff_motions_antispin_rule:
    "The prop rotates in the opposite direction of the handpath.<br>A 90 degree antispin is our base unit of antispin.",
} as const;

describe("the Staff Motions wording", () => {
  const prose = staffMotionsContent.flatMap((b) => (b.kind === "prose" ? [b.html] : []));

  it.each(Object.entries(APPROVED))("%s is on the page and resolves to its message", (key, text) => {
    expect(prose).toContain(text);
    expect((en as Record<string, string>)[key]).toBe(text);
    expect(localizeLevel1Text(text)).toBe(`key:${key}`);
  });

  // The print sheet keeps the earlier wording; its lookups must still hit.
  const SHEET = {
    verified_level1_staff_motions_275:
      "During a shift, a prop can rotate in one of two directions - Prospin or Antispin",
    verified_level1_staff_motions_277:
      "• <strong>Prospin</strong> - The prop rotates the same direction as the handpath<br>A 90 degree isolation is our base unit of a prospin.",
    verified_level1_staff_motions_281:
      "• <strong>Antispin</strong> - The prop rotates in the opposite direction of the handpath<br>A 90 degree antispin is our base unit of antispin.",
  } as const;

  it.each(Object.entries(SHEET))("print sheet text for %s still resolves", (key, text) => {
    expect((en as Record<string, string>)[key]).toBe(text);
    expect(localizeLevel1Text(text)).toBe(`key:${key}`);
  });
});
