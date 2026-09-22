import { describe, it, expect } from "vitest";
import {
  FAQ_ITEMS,
  faqPageJsonLd,
} from "../../src/lib/shared/landing/faq/faq-items";

// Content contract for the public-site FAQ (/faq). Guards the answer → door
// structure and the schema-matches-visible-text invariant (Google policy:
// FAQPage JSON-LD must mirror on-page content). Copy quality itself is
// Austen's call; this only catches structural drift.
// Design: docs/superpowers/specs/2026-07-16-interactive-faq-design.md

// Every CTA door must point at a route or landing anchor that actually exists.
// If a route is renamed, update BOTH the FAQ item and this list.
const KNOWN_DOORS = new Set([
  "/history",
  "/learn/guide", // Level 1 guide reader (the /guide/level-1 static page is a retired 308)
  "/endless-spinner",
  "/composer",
]);

describe("landing FAQ content contract", () => {
  it("every item has a real question and a substantive answer", () => {
    expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(5);
    for (const item of FAQ_ITEMS) {
      expect(item.question.trim().endsWith("?")).toBe(true);
      // One-sentence SEO-stub answers are the failure mode this FAQ was
      // rebuilt to kill; a floor on length keeps them from creeping back.
      expect(item.answer.trim().length).toBeGreaterThan(120);
    }
  });

  it("copy follows the writing guide: no em dashes", () => {
    for (const item of FAQ_ITEMS) {
      expect(item.question).not.toContain("—");
      expect(item.answer).not.toContain("—");
    }
  });

  it("every door points at a known route or anchor and has a label", () => {
    for (const item of FAQ_ITEMS) {
      if (!item.cta) continue;
      expect(
        KNOWN_DOORS.has(item.cta.href),
        `unknown FAQ door: ${item.cta.href}`
      ).toBe(true);
      expect(item.cta.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("at most one door per destination (no wall of duplicate buttons)", () => {
    const doors = FAQ_ITEMS.map((i) => i.cta?.href).filter(Boolean);
    expect(new Set(doors).size).toBe(doors.length);
  });

  it('copy uses the canonical term "step", never "beat"', () => {
    for (const item of FAQ_ITEMS) {
      expect(`${item.question} ${item.answer}`.toLowerCase()).not.toMatch(
        /\bbeats?\b/
      );
    }
  });

  it("does not promise unsupported export formats or direct social destinations", () => {
    const sharing = FAQ_ITEMS.find(
      (item) => item.question === "Can I share what I make?"
    );

    expect(sharing).toBeDefined();
    expect(sharing!.answer).not.toMatch(/\bPDFs?\b/i);
    expect(sharing!.answer).not.toMatch(
      /straight to Instagram|directly to Instagram/i
    );
    expect(sharing!.answer).toMatch(/PNG/);
    expect(sharing!.answer).not.toMatch(/GIF/);
    expect(sharing!.answer).toMatch(/video/);
    expect(sharing!.answer).toMatch(/share sheet/);
  });

  it("JSON-LD mirrors the visible items exactly (question + answer prose only)", () => {
    const parsed = JSON.parse(faqPageJsonLd());
    expect(parsed["@type"]).toBe("FAQPage");
    expect(parsed.mainEntity).toHaveLength(FAQ_ITEMS.length);
    parsed.mainEntity.forEach(
      (
        entity: { name: string; acceptedAnswer: { text: string } },
        index: number
      ) => {
        expect(entity.name).toBe(FAQ_ITEMS[index]!.question);
        expect(entity.acceptedAnswer.text).toBe(FAQ_ITEMS[index]!.answer);
      }
    );
  });
});
