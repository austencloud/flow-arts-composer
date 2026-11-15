import { describe, expect, it, vi } from "vitest";
import en from "../../../../../../../messages/en.json";
import { staffMotionsContent } from "./staff-motions.content";
import { localizeLevel1Block, localizeLevel1Text } from "../localize-level1-content";

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
  // Since 2026-11-12 the tagline is the opener question's answer
  // (`figureChoice.after`), so it counts as page words there too.
  const prose = staffMotionsContent.flatMap((b) =>
    b.kind === "prose" ? [b.html] : b.kind === "figureChoice" && b.after ? [b.after] : []
  );

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

// The opener's four new lines (PROPOSED 2026-11-12, awaiting Austen's yes):
// each is in the question block and finds its message in every language file.
const PROPOSED = {
  guide_l1_staff_motions_choice_lead: "Same hand, same move. Watch the staff.",
  guide_l1_staff_motions_choice_question: "Which staff spins the same way as the hand?",
  guide_l1_staff_motions_choice_right:
    "Yes. A spins with the hand: a prospin. B spins against it: an antispin.",
  guide_l1_staff_motions_choice_wrong: "Look again. Follow the hand, then the staff.",
} as const;

describe("the Staff Motions opener question", () => {
  const choice = staffMotionsContent.find((b) => b.kind === "figureChoice");

  it("declares the question, the answer and the tagline after it", () => {
    expect(choice?.kind).toBe("figureChoice");
    if (choice?.kind !== "figureChoice") return;
    expect([choice.lead, choice.question, choice.right, choice.wrong]).toEqual(
      Object.values(PROPOSED)
    );
    expect(choice.after).toBe(APPROVED.verified_level1_staff_motions_shift_intro);
    expect(choice.answer).toBe(0);
  });

  it.each(Object.entries(PROPOSED))("%s resolves to its message", (key, text) => {
    expect((en as Record<string, string>)[key]).toBe(text);
    expect(localizeLevel1Text(text)).toBe(`key:${key}`);
  });

  it("localizes every line of the block", () => {
    const local = localizeLevel1Block(choice!);
    expect(local).toMatchObject({
      lead: "key:guide_l1_staff_motions_choice_lead",
      question: "key:guide_l1_staff_motions_choice_question",
      right: "key:guide_l1_staff_motions_choice_right",
      wrong: "key:guide_l1_staff_motions_choice_wrong",
      after: "key:verified_level1_staff_motions_shift_intro",
    });
  });

  it("titles the opener cards A and B until answered, then by name", () => {
    const cards = staffMotionsContent.filter(
      (b) => b.kind === "pictographGroup" && b.blindTitle
    );
    expect(cards.map((b) => b.kind === "pictographGroup" && [b.blindTitle, b.figureTitle])).toEqual([
      ["A", "Prospin"],
      ["B", "Antispin"],
    ]);
  });
});
