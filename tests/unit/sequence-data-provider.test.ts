import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import { loopDetector } from "#lib/shared/create/services/loop-detector.js";
import { registerLoopDetector } from "#lib/shared/create/get-loop-detector.js";
import { decodeSequenceFromQR } from "#lib/shared/navigation/services/sequence-encoder.js";
import type { ShortCodeData } from "#lib/shared/qr/services/types.js";
import {
  decodeWordShortCodePayload,
  hydrateSelfContainedShortCodePayload,
} from "#lib/shared/qr/services/short-code-payload-hydrator.js";
import {
  getCached,
  hydrateSequence,
  prefetch,
} from "#lib/shared/sequence-viewer/services/sequence-data-provider.js";
import { openSequenceViewer } from "#lib/shared/sequence-viewer/services/sequence-viewer-navigator.js";
import { openSequenceOverlay } from "#lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.js";

vi.mock(
  "#lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.js",
  () => ({
    openSequenceOverlay: vi.fn(),
  })
);

vi.mock("#lib/shared/create/get-sequence-repository.js", () => ({
  getSequenceRepository: () => ({ getSequence: vi.fn() }),
}));
vi.mock("#lib/shared/browse/get-browse-loader.js", () => ({
  getBrowseLoader: () => ({ loadFullSequenceData: vi.fn() }),
}));
vi.mock("#lib/shared/sequence-viewer/services/cell-pre-warmer.js", () => ({
  cellPreWarmer: { preWarmSequence: vi.fn() },
}));

const AR18_ENCODED =
  "s~r1:sr:bbc58ece:q1:HYPQN1Z0M/2Q 5Q:66VH93T9PYLH500QP5N9O*N$+VUSGQSUYCI3 AL.FE5A00";
const ENCODED_B2ZM =
  "s~r1:sm:f2938653:q1:HYPQN1Z0M/2Q 5Q:66VH93T9PYLH504WU/L92IGQSUG54HJCJQILD2JEQS+MO:9YE1U33FNO5*Q$ZMWDNXZ9PI5B32+80QLL8PR";
const B2ZM_WORD = "Λ-γYΘγΛ-γYΘγ";

function shortCodeRecord(
  overrides: Partial<ShortCodeData> = {}
): ShortCodeData {
  return {
    sequence: B2ZM_WORD,
    payloadWord: B2ZM_WORD,
    encoded: ENCODED_B2ZM,
    createdAt: "2026-07-30T00:00:00.000Z",
    createdBy: "test",
    scanCount: 0,
    ...overrides,
  };
}

function injectRealCsvData(): void {
  const root = resolve(__dirname, "../..");
  const read = (filename: string) =>
    readFileSync(resolve(root, "static/data/pictographs", filename), "utf8");
  Object.assign(window, {
    csvData: {
      diamondData: read("DiamondPictographDataframe.csv"),
      boxData: read("BoxPictographDataframe.csv"),
      skewedData: read("SkewedPictographDataframe.csv"),
    },
  });
}

describe("sequence data provider", () => {
  beforeAll(() => {
    injectRealCsvData();
    registerLoopDetector(loopDetector);
  });

  it("fully hydrates a lean full-motion sequence before the viewer uses it", async () => {
    const decoded = await decodeSequenceFromQR(AR18_ENCODED);

    expect(decoded.steps).toHaveLength(8);
    expect(decoded.steps.every((step) => step.letter === null)).toBe(true);
    expect(decoded.word).toBe("");
    expect(decoded.loopType).toBeUndefined();

    const hydrated = await hydrateSequence({
      ...decoded,
      id: "AR18-regression",
    });

    expect(hydrated.steps.map((step) => step.letter)).toEqual([
      "V",
      "Λ-",
      "V",
      "Λ-",
      "V",
      "Λ-",
      "V",
      "Λ-",
    ]);
    expect(hydrated.word).toBe("VΛ-VΛ-VΛ-VΛ-");
    expect(hydrated.loopType).toBe("rotated");
    expect(hydrated.isCircular).toBe(true);
    expect(hydrated.gridMode).toBe("diamond");
  });

  it.each(["delete", "append", "turns"] as const)(
    "plays workspace %s edits even when the collection original is prefetched",
    async (edit) => {
      const original = await hydrateSequence({
        ...(await decodeSequenceFromQR(AR18_ENCODED)),
        id: `workspace-cache-${edit}`,
      });
      const card = { ...original, steps: [] };
      prefetch(original);
      await vi.waitFor(() => expect(getCached(card)).not.toBeNull());

      const steps =
        edit === "delete"
          ? original.steps.slice(0, 3)
          : edit === "append"
            ? [...original.steps, { ...original.steps[0]!, stepNumber: 9 }]
            : original.steps.map((step, index) =>
                index === 0
                  ? {
                      ...step,
                      motions: {
                        ...step.motions,
                        left: { ...step.motions.left!, turns: 2 },
                        right: { ...step.motions.right!, turns: 0 },
                      },
                    }
                  : step
              );
      const edited = { ...original, steps };

      openSequenceViewer(edited, {
        source: "create_workspace",
        returnPath: "/create/construct",
        playOnOpen: true,
      });
      const [opened, options] = vi.mocked(openSequenceOverlay).mock.lastCall!;
      expect(opened.steps).toEqual(steps);
      expect(opened).toBe(edited);
      expect(options.playOnOpen).toBe(true);
      expect(
        (await hydrateSequence(opened)).steps.map((step) => step.motions)
      ).toEqual(steps.map((step) => step.motions));
      expect(getCached(card)?.steps).toEqual(original.steps);
    }
  );
});

describe("short-code payload selection", () => {
  it("prefers the exact embedded sequence over a lean encoded copy", async () => {
    const decoded = await decodeWordShortCodePayload("B2ZM", shortCodeRecord());
    expect(decoded).not.toBeNull();

    const embeddedSteps = decoded!.steps.map((step, index) => ({
      ...step,
      letter: index === 0 ? "V" : step.letter,
    }));
    const sequence = await hydrateSelfContainedShortCodePayload(
      "B2ZM",
      shortCodeRecord({
        payloadStepCount: embeddedSteps.length,
        ownerId: "owner-1",
        sequenceData: {
          id: "source-sequence-id",
          steps: embeddedSteps,
          word: B2ZM_WORD,
          isCircular: true,
          loopType: "rotated",
        },
      })
    );

    expect(sequence).toMatchObject({
      id: "B2ZM",
      name: B2ZM_WORD,
      word: B2ZM_WORD,
      ownerId: "owner-1",
      isCircular: true,
      loopType: "rotated",
    });
    expect(sequence?.steps[0]?.letter).toBe("V");
  });
});
