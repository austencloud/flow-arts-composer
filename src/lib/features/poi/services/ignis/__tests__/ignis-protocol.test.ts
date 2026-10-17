import { describe, expect, it } from "vitest";
import {
  FrameDecoder,
  container,
  crc16,
  crc32,
  decodeMessage,
  decodeTlv,
  encodeFrame,
  encodeMessage,
  encodeTlv,
  leaf,
} from "../ignis-codec";
import {
  CTAG,
  MODE_TYPE,
  UnsafeRequestError,
  eraseRequest,
  infoRequest,
  parseReply,
  resolveFamily,
  toWire,
  writeImageChunkRequest,
} from "../ignis-messages";

const bytes = (s: string) => Uint8Array.from(s.split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16)));
const ascii = (s: string) => new TextEncoder().encode(s);

/** Bit-by-bit reference for the Utility's CRC-32 (reflected, init 0, no xorout). */
function crc32Reference(data: Uint8Array): number {
  let crc = 0;
  for (const b of data) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return crc >>> 0;
}

describe("CRCs", () => {
  it("crc16 is CRC-16/XMODEM", () => {
    expect(crc16(ascii("123456789"))).toBe(0x31c3);
  });

  it("crc32 uses init 0 and no final xor", () => {
    const data = ascii("123456789");
    expect(crc32(data)).toBe(crc32Reference(data));
    // Table entry 1 of the Utility's table at 0x1400a48e0.
    expect(crc32(Uint8Array.of(1))).toBe(0x77073096);
    expect(crc32(data)).not.toBe(0xcbf43926);
  });
});

describe("TLV", () => {
  it("encodes multi-byte tags and container flags like the Utility", () => {
    expect([...encodeTlv(leaf(0x82, [1]))]).toEqual([0x81, 0x02, 0x01, 0x01]);
    expect([...encodeTlv(container(1000, 4, []))]).toEqual([0xc7, 0x68, 0x00]);
  });

  it("keeps the hinted length width even when content is short", () => {
    // Hint 0x80 reserves two bytes: length 3 is written 0x80 0x03.
    expect([...encodeTlv(container(0x37, 0x80, [leaf(6, [9])]))]).toEqual([0x77, 0x80, 0x03, 0x06, 0x01, 0x09]);
  });

  it("round-trips through the parser, including non-minimal lengths", () => {
    const tree = container(1, 0x900, [container(0x32, 0x10, [leaf(5, [1]), leaf(0x34, [1, 2, 3, 4])])]);
    const [root] = decodeTlv(encodeTlv(tree));
    expect(root).toEqual({
      tag: 1,
      hint: 11,
      children: [{ tag: 0x32, hint: 9, children: [{ tag: 5, value: Uint8Array.of(1) }, { tag: 0x34, value: Uint8Array.of(1, 2, 3, 4) }] }],
    });
  });
});

describe("message and frame", () => {
  it("prefixes 01 and the little-endian crc16 of the TLV", () => {
    const tlv = bytes("41 08 54 06 0a 01 1f 0b 01 02");
    const crc = crc16(tlv);
    expect([...encodeMessage(tlv)]).toEqual([1, crc & 0xff, crc >> 8, ...tlv]);
    expect([...decodeMessage(encodeMessage(tlv))]).toEqual([...tlv]);
  });

  it("rejects a corrupted message", () => {
    const msg = encodeMessage(bytes("41 02 4a 00"));
    msg[4] ^= 1;
    expect(() => decodeMessage(msg)).toThrow(/CRC/);
  });

  it("escapes FF as FF FE and ends with FF FF", () => {
    expect([...encodeFrame(Uint8Array.of(1, 0xff, 2))]).toEqual([0xff, 1, 0xff, 0xfe, 2, 0xff, 0xff]);
  });

  it("decodes frames split across reads", () => {
    const got: number[][] = [];
    const decoder = new FrameDecoder((m) => got.push([...m]));
    const a = encodeFrame(Uint8Array.of(1, 0xff, 0xfe, 3));
    const b = encodeFrame(Uint8Array.of(1, 2, 3, 4, 5));
    const stream = Uint8Array.from([0x00, 0x13, ...a, ...b]);
    decoder.push(stream.subarray(0, 5));
    decoder.push(stream.subarray(5));
    expect(got).toEqual([
      [1, 0xff, 0xfe, 3],
      [1, 2, 3, 4, 5],
    ]);
  });
});

describe("requests", () => {
  const tlvOf = (wire: Uint8Array) => {
    const out: Uint8Array[] = [];
    new FrameDecoder((m) => out.push(m)).push(wire);
    return [...decodeMessage(out[0]!)];
  };

  it("builds the device-info request byte for byte", () => {
    expect(tlvOf(toWire(infoRequest()))).toEqual([...bytes("41 08 54 06 0a 01 1f 0b 01 02")]);
  });

  it("builds an image-slot erase", () => {
    expect(tlvOf(toWire(eraseRequest({ type: MODE_TYPE.IMAGE, index: 3 })))).toEqual([
      ...bytes("41 0e 72 0c 05 01 00 73 07 32 01 01 33 02 03 00"),
    ]);
  });

  it("puts image info in the first chunk only, with 2-byte lengths", () => {
    const chunk = new Uint8Array(2048).fill(7);
    const header = { width: 10, height: 200, colSize: 808, drawStyle: 0, gapSize: 0, scale: 0x400000, dataCrc: 0x11223344 };
    const first = tlvOf(toWire(writeImageChunkRequest(0, chunk, 0, header, crc32(chunk))));
    const second = tlvOf(toWire(writeImageChunkRequest(0, chunk, 1, header, crc32(chunk))));
    // ROOT tag then a two-byte length.
    expect(first.slice(0, 1)).toEqual([0x41]);
    expect(first[1]! & 0x80).toBe(0x80);
    const parse = (t: number[]) => decodeTlv(Uint8Array.from(t));
    const json = (t: number[]) => JSON.stringify(parse(t), (_k, v) => (v instanceof Uint8Array ? [...v] : v));
    expect(json(first)).toContain(`"tag":52`); // MODE_IMG_INFO (0x34)
    expect(json(second)).not.toContain(`"tag":52,"hint"`);
    expect(json(second)).toContain(`"tag":52,"value":[0,8,0,0]`); // MODE_OFFSET 2048
  });

  it("refuses control and bootloader tags", () => {
    expect(() => toWire(container(CTAG.ROOT, 0x10, [container(0x3c, 8, [leaf(0x3c, [13])])]))).toThrow(UnsafeRequestError);
    expect(() => toWire(container(CTAG.ROOT, 0x10, [container(1000, 8, [])]))).toThrow(UnsafeRequestError);
    expect(() => toWire(container(CTAG.ROOT, 0x10, [container(CTAG.MODE, 8, [leaf(5, [2])])]))).toThrow(UnsafeRequestError);
  });
});

describe("replies", () => {
  const reply = (tree: ReturnType<typeof container>) => encodeMessage(encodeTlv(tree));

  it("reads an ack", () => {
    const r = parseReply(reply(container(1, 0x20, [container(10, 0x10, [leaf(1, [0]), leaf(3, [0x32, 0]), leaf(5, [1])])])));
    expect(r.ack).toEqual({ code: 0, requestTag: 0x32, action: 1 });
  });

  it("reads device info and resolves the HD type from the name", () => {
    const r = parseReply(
      reply(
        container(1, 0x40, [
          container(0x1f, 0x40, [
            leaf(0x82, [0x00, 0x01]),
            leaf(0x83, [10, 11, 0, 3]),
            leaf(0x84, [0, 2, 0, 3]),
            leaf(0x8a, ascii("iPixel 200 HD")),
          ]),
        ])
      )
    );
    expect(r.deviceInfo?.firmware).toBe("3.0.11.10");
    expect(r.deviceInfo?.bootloader).toBe("3.0.2.0");
    expect(resolveFamily(r.deviceInfo!)).toBe(0x010b);
  });
});
