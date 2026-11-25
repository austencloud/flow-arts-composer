import { Period } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import { describe, expect, it } from "vitest";
import { loopFamily } from "../domain/loop-families";
import { readMade, type MadeRecord } from "./loop-tab-memory";

const record: MadeRecord = {
  ids: "alpha1,step-A,step-B",
  family: "rotated",
  variant: loopFamily("rotated").variants.find(
    ({ period }) => period === Period.HALVED
  )!,
  partLength: 1,
};

describe("readMade", () => {
  it("reads back a LOOP it wrote", () => {
    expect(readMade(JSON.stringify(record))).toEqual(record);
  });

  // A wrong record would make the tab call ordinary steps a finished LOOP.
  it.each([
    ["nothing stored", null],
    ["a kind that is gone", JSON.stringify({ ...record, family: "spiral" })],
    [
      "a form its kind does not have",
      JSON.stringify({
        ...record,
        variant: loopFamily("swapped").variants[0],
      }),
    ],
    ["no steps", JSON.stringify({ ...record, ids: undefined })],
    ["no part", JSON.stringify({ ...record, partLength: 0 })],
    ["half a part", JSON.stringify({ ...record, partLength: 1.5 })],
    ["an empty record", "null"],
  ])("refuses %s", (_name, raw) => {
    expect(readMade(raw)).toBeNull();
  });
});
