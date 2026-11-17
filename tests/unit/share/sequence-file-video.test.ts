/**
 * The video half of "the sequence inside the file", proven without a browser.
 *
 * mediabunny muxes encoded packets without WebCodecs, so a tiny MP4 built from
 * hand-made H.264 packets exercises the real container code: tags written at
 * mux time, tags added later by a packet-copy remux, and the one reader.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  type MetadataTags,
} from "mediabunny";
import { writeFileSync } from "node:fs";
import { buildSequenceFilePayload } from "#lib/shared/share/domain/sequence-file-payload.js";
import { decodeSequenceFromQR } from "#lib/shared/navigation/services/sequence-encoder.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  buildSequenceVideoTags,
  embedSequenceTagsInMp4,
} from "#lib/shared/share/services/sequence-file-embedder.js";
import { readSequenceFromFile } from "#lib/shared/share/services/sequence-file-reader.js";
import realRecords from "../../fixtures/shortcode-payloads/real-records.json";

// A real production card (s~ QR payload) from the short-code fixtures.
const QR_PAYLOAD = (
  realRecords as unknown as Record<string, { encoded: string }>
).HFWmmG!.encoded;
let realSequence: SequenceData;
beforeAll(async () => {
  realSequence = await decodeSequenceFromQR(QR_PAYLOAD);
});

// avcC for a 16x16 baseline stream: version, profile 66, compat, level 30,
// lengthSize 4, one SPS, one PPS. The muxer stores it; nothing decodes it.
const SPS = [
  0x67, 0x42, 0xc0, 0x1e, 0xd9, 0x01, 0x05, 0xfe, 0x5f, 0x9c, 0x04, 0x40,
];
const PPS = [0x68, 0xce, 0x3c, 0x80];
const AVCC = new Uint8Array([
  1,
  0x42,
  0xc0,
  0x1e,
  0xff,
  0xe1,
  0,
  SPS.length,
  ...SPS,
  1,
  0,
  PPS.length,
  ...PPS,
]);

async function muxTinyMp4(tags?: MetadataTags): Promise<Blob> {
  const source = new EncodedVideoPacketSource("avc");
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  output.addVideoTrack(source, { frameRate: 10 });
  if (tags) output.setMetadataTags(tags);
  await output.start();
  for (let i = 0; i < 3; i++) {
    const nal = new Uint8Array([0, 0, 0, 2, i === 0 ? 0x65 : 0x41, 0x88]);
    await source.add(
      new EncodedPacket(nal, i === 0 ? "key" : "delta", i / 10, 0.1),
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

function sequenceFixture(): SequenceData {
  return { ...realSequence, word: "ΦΨ-ΦΨ-" };
}

describe("sequence inside an MP4", () => {
  it("reads back tags written at mux time", async () => {
    const tags = buildSequenceVideoTags(sequenceFixture())!;
    const blob = await muxTinyMp4(tags);
    const result = await readSequenceFromFile(blob);
    expect(result?.fileKind).toBe("mp4");
    expect(result?.payload.sequence).toBe(
      buildSequenceFilePayload(sequenceFixture()).sequence
    );
    expect(result?.payload.word).toBe("ΦΨ-");
  });

  it("adds the tags to a finished MP4 by remuxing, keeping every packet", async () => {
    const plain = await muxTinyMp4();
    expect(await readSequenceFromFile(plain)).toBeNull();

    const tags = buildSequenceVideoTags(sequenceFixture())!;
    const tagged = await embedSequenceTagsInMp4(plain, tags);
    expect(tagged).not.toBe(plain);
    if (process.env.SEQUENCE_FILE_MP4_OUT) {
      writeFileSync(
        process.env.SEQUENCE_FILE_MP4_OUT,
        new Uint8Array(await tagged.arrayBuffer())
      );
    }

    const result = await readSequenceFromFile(tagged);
    expect(result?.payload.word).toBe("ΦΨ-");
    expect(result?.sequence.steps.length).toBe(realSequence.steps.length);

    const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
    const input = new Input({
      source: new BlobSource(tagged),
      formats: ALL_FORMATS,
    });
    const track = await input.getPrimaryVideoTrack();
    expect(await track?.computePacketStats()).toMatchObject({ packetCount: 3 });
    const meta = await input.getMetadataTags();
    expect(meta.description).toContain("This video carries its sequence");
  });

  it("returns the original blob when the bytes are not an MP4", async () => {
    const notVideo = new Blob([new Uint8Array([1, 2, 3])]);
    const tags = buildSequenceVideoTags(sequenceFixture())!;
    const original = console.warn;
    console.warn = () => {};
    try {
      expect(await embedSequenceTagsInMp4(notVideo, tags)).toBe(notVideo);
    } finally {
      console.warn = original;
    }
  });
});
