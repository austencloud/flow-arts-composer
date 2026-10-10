import { describe, expect, it } from "vitest";

import { encodeWav24 } from "#lib/features/lab/pronunciation-recorder/domain/wav-encoder.js";

async function bytesOf(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}

function ascii(view: DataView, offset: number, length: number): string {
  let text = "";
  for (let index = 0; index < length; index++) {
    text += String.fromCharCode(view.getUint8(offset + index));
  }
  return text;
}

describe("encodeWav24", () => {
  it("writes a canonical mono 24-bit header", async () => {
    const view = await bytesOf(encodeWav24(new Float32Array(10), 48_000));

    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(ascii(view, 8, 4)).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1); // PCM, not float — Kaldi reads this
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint32(28, true)).toBe(48_000 * 3); // byte rate
    expect(view.getUint16(32, true)).toBe(3); // block align
    expect(view.getUint16(34, true)).toBe(24);
    expect(ascii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(30);
    expect(view.byteLength).toBe(74);
  });

  it("round-trips positive and negative samples as little-endian two's complement", async () => {
    const view = await bytesOf(encodeWav24(new Float32Array([1, -1, 0]), 48_000));

    const read = (index: number) => {
      const offset = 44 + index * 3;
      const raw =
        view.getUint8(offset) |
        (view.getUint8(offset + 1) << 8) |
        (view.getUint8(offset + 2) << 16);
      return raw >= 0x800000 ? raw - 0x1000000 : raw;
    };

    expect(read(0)).toBe(8_388_607);
    expect(read(1)).toBe(-8_388_607);
    expect(read(2)).toBe(0);
  });

  it("clamps out-of-range samples instead of wrapping them", async () => {
    // A sample above 1.0 that wraps produces a full-scale click of the OPPOSITE
    // sign in the middle of a letter, which survives every downstream check.
    const view = await bytesOf(encodeWav24(new Float32Array([4, -4]), 48_000));
    const read = (index: number) => {
      const offset = 44 + index * 3;
      const raw =
        view.getUint8(offset) |
        (view.getUint8(offset + 1) << 8) |
        (view.getUint8(offset + 2) << 16);
      return raw >= 0x800000 ? raw - 0x1000000 : raw;
    };

    expect(read(0)).toBe(8_388_607);
    expect(read(1)).toBe(-8_388_607);
  });
});
