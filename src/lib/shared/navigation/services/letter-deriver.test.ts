import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { deriveLettersForSequence } from "./letter-deriver";
import { decodeSequenceFromQR } from "./sequence-encoder";
import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";
import { deriveGridMode } from "#lib/shared/pictograph/grid/services/grid-mode-deriver.js";

// A real minted blob (short code B2ZM). Its start position is a still beat.
const ENCODED_B2ZM =
  "s~r1:sm:f2938653:q1:HYPQN1Z0M/2Q 5Q:66VH93T9PYLH504WU/L92IGQSUG54HJCJQILD2JEQS+MO:9YE1U33FNO5*Q$ZMWDNXZ9PI5B32+80QLL8PR";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("letter deriver still beats", () => {
  it("letters a start position without fetching the pictograph dataframes", async () => {
    const decoded = await decodeSequenceFromQR(ENCODED_B2ZM);
    const start = decoded.startPlacement!;
    expect(start.letter).toBeNull();

    const fetchSpy = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchSpy);

    const lettered = await deriveLettersForSequence({
      ...decoded,
      steps: [],
    });

    expect(lettered.startPlacement?.letter).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gives the letter the dataframe lookup gives", async () => {
    const decoded = await decodeSequenceFromQR(ENCODED_B2ZM);
    const start = decoded.startPlacement!;
    const lettered = await deriveLettersForSequence({ ...decoded, steps: [] });

    const root = resolve(__dirname, "../../../../..");
    const read = (file: string) =>
      readFileSync(resolve(root, "static/data/pictographs", file), "utf8");
    Object.assign(window, {
      csvData: {
        diamondData: read("DiamondPictographDataframe.csv"),
        boxData: read("BoxPictographDataframe.csv"),
        skewedData: read("SkewedPictographDataframe.csv"),
      },
    });
    const { left, right } = start.motions;
    const fromTable = await motionQueryHandler.findLetterByMotionConfiguration(
      left!,
      right!,
      deriveGridMode(left!, right!)
    );

    expect(fromTable).not.toBeNull();
    expect(lettered.startPlacement?.letter).toBe(fromTable);
  });
});
