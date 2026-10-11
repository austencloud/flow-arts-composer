import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import de from "../../../messages/de.json";

const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// The Hand Motions Guide page splits Austen's intro into sentences so the
// first can be the lede. The combinations lead is the shared record's key,
// checked in hand-motions-topic.test.ts.
describe("Hand Motions Guide page copy", () => {
  for (const [lang, catalog] of [
    ["en", en as Record<string, string>],
    ["de", de as Record<string, string>],
  ] as const) {
    it(`splits the intro without changing a word (${lang})`, () => {
      expect(
        [
          catalog.guide_topic_hand_motions_three,
          catalog.guide_topic_hand_motions_arrow,
          catalog.guide_topic_hand_motions_hand,
        ].join(" ")
      ).toBe(plain(catalog.verified_level1_hand_motions_72!));
    });
  }
});
