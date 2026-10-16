import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  decodePerformanceTransfer,
  encodePerformanceTransfer,
  MAX_PERFORMANCE_TRANSFER_BYTES,
  setPerformanceTransferEditorBaseline,
  withPerformanceTransferOrigin,
} from "./performance-transfer.js";
import { stableStringify } from "../../../../../unreal/Shared/Tools/capture-provenance.mjs";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { processReversals } from "#lib/shared/create/services/reversal-detector.js";
import { normalizeSequenceDerived } from "#lib/shared/create/services/sequence-derived-fields.js";
import { hydrateSequence } from "#lib/shared/navigation/services/sequence-hydrator.js";
import { loopDetector } from "#lib/shared/create/services/loop-detector.js";
import { DeepLinkSequenceHandler } from "#lib/features/create/shared/services/deep-link-sequence-handler.js";
import type { DeepLinker } from "#lib/shared/navigation/services/deep-linker.js";
import nativeTransfer from "./performance-transfer.native-fixture.json";

const richSequence = {
  id: "sequence-42",
  name: "A full performance",
  word: "ABCD",
  displayName: "Festival score",
  steps: [
    {
      id: "step-one",
      stepNumber: 1,
      duration: 1.5,
      motions: { left: { propType: "staff" }, right: { propType: "staff" } },
      propType: "staff",
      performers: [{ id: "one", hand: "left" }],
    },
    {
      id: "step-two",
      stepNumber: 2,
      duration: 0.75,
      motions: { left: { propType: "staff" }, right: { propType: "staff" } },
      propType: "staff",
      unknownStepField: { accents: [1, 2] },
    },
  ],
  metadata: { authorIntent: { tempo: [90, 120] }, futureField: true },
  thumbnails: [],
  isFavorite: false,
  isCircular: true,
  tags: ["festival"],
  performers: [{ id: "one", prop: { family: "staff", weight: 3 } }],
  futureTopLevelField: { nested: [{ keep: "exactly" }] },
} as unknown as SequenceData;

describe("performance transfer", () => {
  it("round trips the complete serialized snapshot without dropping unknown fields", async () => {
    const encoded = await encodePerformanceTransfer(richSequence, {
      selection: { characterId: "x-bot", propFamily: "staff" },
      playback: { phase: 0.4, rate: 1.25, paused: false },
    });
    const decoded = await decodePerformanceTransfer(encoded);
    expect(decoded.sequence).toEqual(JSON.parse(JSON.stringify(richSequence)));
    expect(decoded.transfer.sequenceJson).toBe(
      stableStringify(JSON.parse(JSON.stringify(richSequence)))
    );
    expect(decoded.transfer.selection).toEqual({
      characterId: "x-bot",
      propFamily: "staff",
    });
    expect(decoded.transfer.playback).toEqual({
      phase: 0.4,
      rate: 1.25,
      paused: false,
    });
  });

  it("rejects altered sequence content and a claimed hash", async () => {
    const transfer = JSON.parse(await encodePerformanceTransfer(richSequence));
    transfer.sequenceJson = transfer.sequenceJson.replace(
      "Festival score",
      "Changed score"
    );
    await expect(
      decodePerformanceTransfer(JSON.stringify(transfer))
    ).rejects.toThrow("SHA-256");
    transfer.sequenceJson = JSON.parse(
      await encodePerformanceTransfer(richSequence)
    ).sequenceJson;
    transfer.sequenceSHA256 = "0".repeat(64);
    await expect(
      decodePerformanceTransfer(JSON.stringify(transfer))
    ).rejects.toThrow("SHA-256");
  });

  it("rejects unsupported schema, invalid playback, noncanonical JSON, and oversized input", async () => {
    const transfer = JSON.parse(await encodePerformanceTransfer(richSequence));
    await expect(
      decodePerformanceTransfer(JSON.stringify({ ...transfer, schema: "v2" }))
    ).rejects.toThrow("schema");
    await expect(
      decodePerformanceTransfer(
        JSON.stringify({
          ...transfer,
          playback: { phase: 1, rate: 1, paused: false },
        })
      )
    ).rejects.toThrow("fields");
    await expect(
      decodePerformanceTransfer(
        JSON.stringify({
          ...transfer,
          playback: { phase: 0, rate: 2, paused: false },
        })
      )
    ).rejects.toThrow("fields");
    await expect(
      decodePerformanceTransfer(
        JSON.stringify({
          ...transfer,
          sequenceJson: JSON.stringify(
            JSON.parse(transfer.sequenceJson),
            null,
            2
          ),
        })
      )
    ).rejects.toThrow("canonical");
    await expect(
      decodePerformanceTransfer("x".repeat(MAX_PERFORMANCE_TRANSFER_BYTES + 1))
    ).rejects.toThrow("size limit");
  });

  it("accepts sparse native sequence snapshots without adding or dropping fields", async () => {
    const nativeSequence = {
      id: "museum-native-cave-air-seq-dj",
      word: "DJDJ",
      isCircular: true,
      startPlacement: { id: "museum-start", letter: "β" },
      steps: [
        {
          id: "museum-step-1",
          stepNumber: 1,
          duration: 1,
          motions: { left: {}, right: {} },
        },
      ],
    } as unknown as SequenceData;
    const encoded = await encodePerformanceTransfer(nativeSequence);
    const decoded = await decodePerformanceTransfer(encoded);
    expect(decoded.sequence).toEqual(nativeSequence);
  });

  it("reuses a verified native snapshot after Composer defaults, then invalidates on edits", async () => {
    const nativeSequence = {
      id: "native-djdj",
      word: "DJDJ",
      isCircular: true,
      steps: [
        {
          id: "step-1",
          stepNumber: 2,
          duration: 1,
          motions: {
            left: { propType: "staff" },
            right: { propType: "staff" },
          },
        },
      ],
    } as unknown as SequenceData;
    const source = await decodePerformanceTransfer(
      await encodePerformanceTransfer(nativeSequence, {
        selection: { characterId: "x-bot", propFamily: "staff" },
        playback: { phase: 0.3, rate: 1.25, paused: false },
      })
    );
    const normalize = (sequence: SequenceData) =>
      normalizeSequenceDerived(
        processReversals({
          ...sequence,
          steps: sequence.steps.map((step, index) => ({
            ...step,
            stepNumber: index + 1,
          })),
        })
      );
    const editor = withPerformanceTransferOrigin(
      { ...createSequenceData(source.sequence), ...source.sequence },
      source.transfer
    );
    const ready = normalize(
      setPerformanceTransferEditorBaseline(editor, normalize)
    );
    const unchanged = JSON.parse(await encodePerformanceTransfer(ready));
    expect(unchanged.sequenceJson).toBe(source.transfer.sequenceJson);
    expect(unchanged.sequenceSHA256).toBe(source.transfer.sequenceSHA256);
    expect(unchanged.selection).toEqual(source.transfer.selection);
    expect(unchanged.playback).toEqual(source.transfer.playback);

    const edited = {
      ...ready,
      steps: ready.steps.map((step) => ({ ...step, duration: 2 })),
    };
    const changed = JSON.parse(await encodePerformanceTransfer(edited));
    expect(changed.sequenceSHA256).not.toBe(source.transfer.sequenceSHA256);
    expect(JSON.parse(changed.sequenceJson).steps[0].duration).toBe(2);
    expect(JSON.parse(changed.sequenceJson).metadata).not.toHaveProperty(
      "__performanceTransferOrigin"
    );

    const tampered = structuredClone(ready);
    const origin = tampered.metadata.__performanceTransferOrigin as {
      source: { sequenceSHA256: string };
    };
    origin.source.sequenceSHA256 = "0".repeat(64);
    await expect(encodePerformanceTransfer(tampered)).rejects.toThrow(
      "SHA-256"
    );
  });

  it("retains the actual native snapshot through viewer hydration, but not edited scores", async () => {
    const source = await decodePerformanceTransfer(
      JSON.stringify(nativeTransfer)
    );
    const editor = withPerformanceTransferOrigin(
      { ...createSequenceData(source.sequence), ...source.sequence },
      source.transfer
    );
    const published: SequenceData[] = [];
    const deepLinker = {
      consumeData: () => ({ sequence: editor, tabId: "construct" }),
      clearDeepLinkFromURL: () => undefined,
    } as unknown as DeepLinker;
    await new DeepLinkSequenceHandler(deepLinker).loadFromDeepLink(
      (sequence) => {
        published.push(sequence);
      }
    );
    await vi.waitFor(() => expect(published).toHaveLength(2));
    // This is the same derived-state pass Create applies to the enriched callback.
    const ready = normalizeSequenceDerived(processReversals(published[1]!));
    const viewer = await hydrateSequence(ready, { loopDetector });
    const unchanged = JSON.parse(await encodePerformanceTransfer(viewer));
    expect(unchanged.sequenceSHA256).toBe(nativeTransfer.sequenceSHA256);
    expect(unchanged.sequenceJson).toBe(nativeTransfer.sequenceJson);
    expect(unchanged.selection).toEqual(nativeTransfer.selection);
    expect(unchanged.playback).toEqual(nativeTransfer.playback);

    for (const changed of [
      { ...ready, name: "Edited title" },
      {
        ...ready,
        steps: ready.steps.map((step, index) =>
          index === 0 ? { ...step, duration: 2 } : step
        ),
      },
      {
        ...ready,
        steps: ready.steps.map((step, index) =>
          index === 0
            ? {
                ...step,
                motions: {
                  ...step.motions,
                  left: { ...step.motions.left, propType: "clubs" },
                },
              }
            : step
        ),
      },
    ]) {
      const editedViewer = await hydrateSequence(changed, { loopDetector });
      const edited = JSON.parse(await encodePerformanceTransfer(editedViewer));
      expect(edited.sequenceSHA256).not.toBe(nativeTransfer.sequenceSHA256);
    }
  });
});
