import { describe, expect, it } from "vitest";
import demo from "../../src/lib/shared/landing/data/demo-sequence.json";
import { APP_DOMAIN } from "../../src/config/domains";
import { generateViewerURL } from "$lib/shared/navigation/services/sequence-encoder";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { verifyEncodedChoreography } from "$lib/shared/qr/services/choreography-fidelity";
import {
  cardParityCases,
  DEMO_SEQUENCE_LINK_8,
  DEMO_SHORT_CODE_URL_4,
} from "../render-parity/card-parity-cases";

// Captured from the read-only public shortcodes/0WHS record on 2026-10-01.
const fourStepPublicRecord = {
  code: "0WHS",
  encoded:
    "s~q1:HYPQN1Z0MJ0AC3A:66NI5/16S6MH504WUWRIA*N% OYWO2R7NX0N*K90LLG0M246BIQYJ-G1Q70/C3+ AH8L/C300",
};

// These checks catch a card whose printed QR silently points to different
// steps after the demo sequence or its encoding changes.
describe("card parity QR links open the steps on the card", () => {
  it("8-step inline link matches the viewer encoder", () => {
    const sequence = structuredClone(demo);
    sequence.steps = sequence.steps.slice(0, 8);
    sequence.word = sequence.steps.map((step) => step.letter).join("");
    const { url } = generateViewerURL(sequence as unknown as SequenceData, {
      compress: true,
    });
    // The encoder prefixes the current origin (jsdom's localhost here); the
    // printed card carries the production domain in front of the same path.
    const { pathname, search } = new URL(url, window.location.origin);
    expect(DEMO_SEQUENCE_LINK_8).toBe(`${APP_DOMAIN}${pathname}${search}`);
  });

  it("4-step short code payload plays the fixture choreography", async () => {
    const sequence = structuredClone(demo);
    sequence.steps = sequence.steps.slice(0, 4);
    sequence.word = sequence.steps.map((step) => step.letter).join("");
    const cases = cardParityCases();
    expect(new URL(DEMO_SHORT_CODE_URL_4).href).toBe(
      `https://tka.run/${fourStepPublicRecord.code}`
    );
    expect(
      cases
        .filter(({ name }) => name.startsWith("qr-code-row"))
        .map(({ options }) => options.qrUrl)
    ).toEqual([DEMO_SHORT_CODE_URL_4, DEMO_SHORT_CODE_URL_4]);
    expect(
      cases.find(({ name }) => name === "print-qr-column")?.options.qrUrl
    ).toBe(DEMO_SEQUENCE_LINK_8);
    expect(
      await verifyEncodedChoreography(
        fourStepPublicRecord.encoded,
        sequence as unknown as SequenceData
      )
    ).toMatchObject({ exact: true });
  });
});
