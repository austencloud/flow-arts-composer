import { describe, expect, it } from "vitest";
import demo from "../../src/lib/shared/landing/data/demo-sequence.json";
import { APP_DOMAIN } from "../../src/config/domains";
import { generateViewerURL } from "$lib/shared/navigation/services/sequence-encoder";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { DEMO_SEQUENCE_LINKS } from "../render-parity/card-parity-cases";

/**
 * The parity fixtures hard-code the viewer deep link for each sliced demo
 * sequence so the Node-side card renderer never imports the encoder. When the
 * codec or the demo data changes, the printed QR must follow.
 */
describe("card parity QR links open the steps on the card", () => {
  for (const count of [4, 8] as const) {
    it(`${count}-step demo link matches the viewer encoder`, () => {
      const sequence = structuredClone(demo);
      sequence.steps = sequence.steps.slice(0, count);
      sequence.word = sequence.steps.map((step) => step.letter).join("");
      const { url } = generateViewerURL(sequence as unknown as SequenceData, {
        compress: true,
      });
      expect(DEMO_SEQUENCE_LINKS[count]).toBe(`${APP_DOMAIN}${url}`);
    });
  }
});
