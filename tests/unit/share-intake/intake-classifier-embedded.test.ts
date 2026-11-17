/**
 * A shared picture that carries its sequence inside the file opens from that
 * sequence, exactly, without the QR decoder ever looking at its pixels.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PNG } from "pngjs";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  decodeSequenceFromQR,
  encodeSequence,
  isInlineEncoded,
} from "#lib/shared/navigation/services/sequence-encoder.js";
import { classifyIntake } from "#lib/shared/share-intake/services/intake-classifier.js";
import { embedSequenceInCardPng } from "#lib/shared/share/services/sequence-file-embedder.js";
import realRecords from "../../fixtures/shortcode-payloads/real-records.json";

const QR_PAYLOAD = (
  realRecords as unknown as Record<string, { encoded: string }>
).HFWmmG!.encoded;

let sequence: SequenceData;
let cardBytes: Uint8Array;

function plainPngBytes(): Uint8Array {
  const png = new PNG({ width: 4, height: 4 });
  png.data.fill(200);
  return new Uint8Array(PNG.sync.write(png));
}

beforeAll(async () => {
  sequence = await decodeSequenceFromQR(QR_PAYLOAD);
  const card = await embedSequenceInCardPng(
    new Blob([plainPngBytes() as BlobPart], { type: "image/png" }),
    sequence
  );
  cardBytes = new Uint8Array(await card.arrayBuffer());
});

function file(name: string, bytes: Uint8Array): File {
  return new File([bytes as BlobPart], name, { type: "image/png" });
}

describe("classifyIntake with a sequence inside the file", () => {
  it("makes a card from the embedded sequence without calling the QR decoder", async () => {
    const decode = vi.fn(async () => ["https://tka.run/WRONG"]);
    const result = await classifyIntake(
      { files: [file("card.png", cardBytes)] },
      decode
    );

    expect(decode).not.toHaveBeenCalled();
    const item = result.items[0]!;
    expect(item.kind).toBe("card");
    const code = (item as { code: string }).code;
    // The self-contained payload resolveForImport opens with no lookup.
    expect(isInlineEncoded(code)).toBe(true);
    expect(encodeSequence(await decodeSequenceFromQR(code))).toBe(
      encodeSequence(sequence)
    );
  });

  it("still sends a picture without a payload to the QR decoder", async () => {
    const decode = vi.fn(async () => ["https://tka.run/AB12"]);
    const result = await classifyIntake(
      { files: [file("photo.png", plainPngBytes())] },
      decode
    );
    expect(decode).toHaveBeenCalledTimes(1);
    expect(result.items[0]).toEqual({
      kind: "card",
      code: "AB12",
      file: expect.any(File),
    });
  });

  it("marks the same embedded card shared twice as a duplicate", async () => {
    const result = await classifyIntake(
      { files: [file("a.png", cardBytes), file("b.png", cardBytes)] },
      async () => []
    );
    expect(result.items.map((i) => i.kind)).toEqual(["card", "duplicate"]);
  });
});
