// @vitest-environment jsdom
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { decodeSequenceFromQR } from "#lib/shared/navigation/services/sequence-encoder.js";
import {
  cachePostSequence,
  resolvePostSequence,
} from "#lib/features/post/services/post-workspace-projects.js";

// A real minted blob (short code B2ZM).
const ENCODED_B2ZM =
  "s~r1:sm:f2938653:q1:HYPQN1Z0M/2Q 5Q:66VH93T9PYLH504WU/L92IGQSUG54HJCJQILD2JEQS+MO:9YE1U33FNO5*Q$ZMWDNXZ9PI5B32+80QLL8PR";

const { resolveShortCode } = vi.hoisted(() => ({
  resolveShortCode: vi.fn(),
}));
vi.mock(
  "#lib/shared/sequence-viewer/services/sequence-data-provider.js",
  () => ({ loadByIdentifier: vi.fn().mockResolvedValue(null) })
);
vi.mock("#lib/shared/qr/get-short-code-manager.js", () => ({
  getShortCodeManager: () => ({ resolveShortCode }),
}));

beforeAll(() => {
  const root = resolve(__dirname, "../..");
  const read = (file: string) =>
    readFileSync(resolve(root, "static/data/pictographs", file), "utf8");
  Object.assign(window, {
    csvData: {
      diamondData: read("DiamondPictographDataframe.csv"),
      boxData: read("BoxPictographDataframe.csv"),
      skewedData: read("SkewedPictographDataframe.csv"),
    },
  });
});

describe("a post made from a share code", () => {
  it("gets the letters and word the code's motions spell, not the name", async () => {
    const decoded = await decodeSequenceFromQR(ENCODED_B2ZM);
    expect(decoded.word).toBe("");
    expect(decoded.steps.every((step) => step.letter == null)).toBe(true);
    resolveShortCode.mockResolvedValue(decoded);

    const sequence = await resolvePostSequence("B2ZM");

    expect(sequence?.id).toBe("B2ZM");
    expect(sequence?.steps.every((step) => !!step.letter)).toBe(true);
    expect(sequence?.word).not.toBe("");
    expect(sequence?.word).not.toContain("Shared");
  });

  it("letters a snapshot that was saved before it had letters", async () => {
    const decoded = await decodeSequenceFromQR(ENCODED_B2ZM);
    cachePostSequence({ ...decoded, id: "C3ZN" });
    resolveShortCode.mockReset();

    const sequence = await resolvePostSequence("C3ZN");

    expect(resolveShortCode).not.toHaveBeenCalled();
    expect(sequence?.steps.every((step) => !!step.letter)).toBe(true);
    expect(sequence?.word).not.toBe("");
  });
});
