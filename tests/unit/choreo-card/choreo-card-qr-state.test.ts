import { flushSync } from "svelte";
import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { QRCodeResult } from "$lib/shared/qr/services/types";
import { createChoreoCardQrStateHarness } from "./choreo-card-qr-state-harness.svelte";
import { TRANSITION_REVIEW_SEQUENCE } from "../../../src/routes/test/sequence-viewer-transitions/transition-review-fixture";

const sequence = {
  id: "sequence-1",
  word: "TEST",
  steps: [],
  metadata: {},
} as unknown as SequenceData;

function qrResult(label: string): QRCodeResult {
  return {
    svg: `<svg>${label}</svg>`,
    dataUrl: `data:image/svg+xml,${label}`,
    encodedUrl: `https://tka.run/TEST?bp=${label}&rp=${label}`,
    shortCode: "TEST",
  };
}

describe("choreo card QR state", () => {
  it("drops the old scan target when motions change without changing the sequence ID", async () => {
    const generateForSequence = vi
      .fn()
      .mockResolvedValueOnce(qrResult("first"))
      .mockImplementationOnce(() => new Promise(() => {}));
    const harness = createChoreoCardQrStateHarness({
      sequence: TRANSITION_REVIEW_SEQUENCE,
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      generateForSequence,
    });
    try {
      flushSync();
      await Promise.resolve();
      expect(harness.qrState.dataUrl).toBe(qrResult("first").dataUrl);
      harness.setSequence({
        ...TRANSITION_REVIEW_SEQUENCE,
        steps: TRANSITION_REVIEW_SEQUENCE.steps.map((step, i) =>
          i ? step : { ...step, duration: 2 }
        ),
      });
      flushSync();
      expect(generateForSequence).toHaveBeenCalledTimes(2);
      expect(harness.qrState.dataUrl).toBeNull();
    } finally {
      harness.dispose();
    }
  });
  it("draws a published code for a guest without minting a new sequence code", async () => {
    const generateForSequence = vi.fn();
    const generateForUrl = vi.fn().mockResolvedValue(qrResult("published"));
    const harness = createChoreoCardQrStateHarness({
      sequence,
      leftPropType: PropType.HAND,
      rightPropType: PropType.HAND,
      generateForSequence,
      generateForUrl,
      isAuthenticated: false,
      qrUrl: "https://tka.run/DACF4E",
    });
    try {
      flushSync();
      expect(harness.qrState.settled).toBe(false);
      await Promise.resolve();
      flushSync();
      expect(generateForSequence).not.toHaveBeenCalled();
      expect(generateForUrl).toHaveBeenCalledWith(
        "https://tka.run/DACF4E",
        expect.any(Object)
      );
      expect(harness.qrState.dataUrl).toBe(qrResult("published").dataUrl);
      expect(harness.qrState.settled).toBe(true);
    } finally {
      harness.dispose();
    }
  });

  it("rejects a late QR from the previous mode and never displays its scan target", async () => {
    const pending: Array<(result: QRCodeResult) => void> = [];
    const generateForUrl = vi.fn(
      () => new Promise<QRCodeResult>((resolve) => pending.push(resolve))
    );
    const harness = createChoreoCardQrStateHarness({
      sequence,
      leftPropType: PropType.HAND,
      rightPropType: PropType.HAND,
      generateForSequence: vi.fn(),
      generateForUrl,
      isAuthenticated: false,
      qrUrl: "https://tka.run/DACF4E",
    });
    try {
      flushSync();
      harness.setQrUrl("https://tka.run/4C1913");
      flushSync();
      pending[1]!(qrResult("second"));
      await Promise.resolve();
      pending[0]!(qrResult("first"));
      await Promise.resolve();
      expect(harness.qrState.dataUrl).toBe(qrResult("second").dataUrl);
      harness.setQrUrl("https://tka.run/89E048");
      flushSync();
      expect(harness.qrState.dataUrl).toBeNull();
      expect(harness.qrState.settled).toBe(false);
    } finally {
      harness.dispose();
    }
  });

  it("regenerates the QR with the current props when the viewer prop changes", async () => {
    const generateForSequence = vi
      .fn()
      .mockResolvedValueOnce(qrResult("staff"))
      .mockResolvedValueOnce(qrResult("club"));
    const harness = createChoreoCardQrStateHarness({
      sequence,
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      generateForSequence,
    });

    try {
      flushSync();
      expect(generateForSequence).toHaveBeenCalledTimes(1);
      expect(generateForSequence).toHaveBeenLastCalledWith(
        sequence,
        expect.objectContaining({
          leftPropType: PropType.STAFF,
          rightPropType: PropType.STAFF,
        })
      );

      harness.setProps(PropType.CLUB, PropType.CLUB);
      flushSync();

      expect(generateForSequence).toHaveBeenCalledTimes(2);
      expect(generateForSequence).toHaveBeenLastCalledWith(
        sequence,
        expect.objectContaining({
          leftPropType: PropType.CLUB,
          rightPropType: PropType.CLUB,
        })
      );

      await Promise.resolve();
      expect(harness.qrState.dataUrl).toBe("data:image/svg+xml,club");
    } finally {
      harness.dispose();
    }
  });
});
