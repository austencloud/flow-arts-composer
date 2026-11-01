import { describe, expect, it } from "vitest";
import { performerSequence } from "./performer-sequence";
import { FRONT, PARTNER, rowsOf, sequenceOf } from "./djii-partners.fixture";

describe("performerSequence", () => {
  it("turns the front performer's sequence into the partner's", async () => {
    const partner = await performerSequence(sequenceOf(FRONT), {
      mirror: true,
      flip: true,
      swap: true,
    });
    expect(rowsOf(partner)).toEqual(PARTNER);
  });

  it("leaves the sequence alone with nothing set", async () => {
    const front = sequenceOf(FRONT);
    expect(await performerSequence(front, {})).toBe(front);
  });
});
