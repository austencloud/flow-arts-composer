/**
 * `observeSequenceFileDelivery` only reads part of a delivered file. An MP4
 * whose tags sat outside that part would be delivered with its sequence and
 * never counted, silently. Both layouts the exporter writes are covered, with
 * enough sample data that the file is far bigger than one scan window.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { decodeSequenceFromQR } from "#lib/shared/navigation/services/sequence-encoder.js";
import {
  buildSequenceVideoTags,
  embedSequenceTagsInMp4,
} from "#lib/shared/share/services/sequence-file-embedder.js";
import realRecords from "../../fixtures/shortcode-payloads/real-records.json";

const captureEvent = vi.fn();
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureEvent: (...args: unknown[]) => captureEvent(...args),
}));

const { observeSequenceFileDelivery } = await import(
  "#lib/shared/analytics/sequence-file-events.js"
);

const QR_PAYLOAD = (
  realRecords as unknown as Record<string, { encoded: string }>
).HFWmmG!.encoded;
let realSequence: SequenceData;
beforeAll(async () => {
  realSequence = await decodeSequenceFromQR(QR_PAYLOAD);
});
beforeEach(() => captureEvent.mockClear());

const SPS = [
  0x67, 0x42, 0xc0, 0x1e, 0xd9, 0x01, 0x05, 0xfe, 0x5f, 0x9c, 0x04, 0x40,
];
const PPS = [0x68, 0xce, 0x3c, 0x80];
const AVCC = new Uint8Array([
  1, 0x42, 0xc0, 0x1e, 0xff, 0xe1, 0, SPS.length, ...SPS, 1, 0, PPS.length,
  ...PPS,
]);

/** A plain MP4, as the worker encoder hands it over: about 1.2 MB of samples. */
async function muxPlainMp4(fragmented: boolean): Promise<Blob> {
  const source = new EncodedVideoPacketSource("avc");
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({
      fastStart: fragmented ? "fragmented" : "in-memory",
    }),
    target,
  });
  output.addVideoTrack(source, { frameRate: 10 });
  await output.start();
  const frameBytes = 100 * 1024;
  for (let i = 0; i < 12; i++) {
    const nal = new Uint8Array(frameBytes);
    const body = frameBytes - 4;
    nal.set([body >>> 24, (body >>> 16) & 0xff, (body >>> 8) & 0xff, body & 0xff]);
    nal[4] = i % 5 === 0 ? 0x65 : 0x41;
    await source.add(
      new EncodedPacket(nal, i % 5 === 0 ? "key" : "delta", i / 10, 0.1),
      i === 0
        ? {
            decoderConfig: {
              codec: "avc1.42c01e",
              codedWidth: 16,
              codedHeight: 16,
              description: AVCC,
            },
          }
        : undefined
    );
  }
  await output.finalize();
  return new Blob([target.buffer!], { type: "video/mp4" });
}

describe("observeSequenceFileDelivery on a tagged MP4", () => {
  for (const fragmented of [false, true]) {
    it(`counts a ${fragmented ? "fragmented" : "plain"} MP4`, async () => {
      const plain = await muxPlainMp4(fragmented);
      const tags = buildSequenceVideoTags(realSequence)!;
      const tagged = await embedSequenceTagsInMp4(plain, tags, { fragmented });
      expect(tagged).not.toBe(plain);
      expect(tagged.size).toBeGreaterThan(1024 * 1024);

      await observeSequenceFileDelivery(tagged, "download");
      expect(captureEvent).toHaveBeenCalledTimes(1);
      expect(captureEvent).toHaveBeenCalledWith("sequence_file_written", {
        file_kind: "mp4",
        delivery: "download",
      });
    });
  }

  it("counts nothing for the same MP4 without tags", async () => {
    await observeSequenceFileDelivery(await muxPlainMp4(true), "download");
    expect(captureEvent).not.toHaveBeenCalled();
  });
});
