/**
 * Byte-level codec for Ignis iPixel HD poi (the "packed TLV" protocol).
 *
 * Decoded from Ignis Pixel Utility 2 (2.1.28). See
 * docs/reference/ignis-protocol.md for the layer diagram and the
 * function addresses each piece was read from.
 *
 * Layers, outermost first:
 *   serial frame   FF <message, each FF sent as FF FE> FF FF
 *   message        01 <crc16 of tlv, little-endian> <tlv>
 *   tlv            nested tag/length/value nodes under ROOT (tag 1)
 */

// ---------------------------------------------------------------- CRCs

const CRC16_TABLE = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    table[i] = crc;
  }
  return table;
})();

/** CRC-16/XMODEM: poly 0x1021, init 0, no reflection, no final xor. */
export function crc16(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc = ((crc << 8) ^ CRC16_TABLE[((crc >> 8) ^ byte) & 0xff]!) & 0xffff;
  }
  return crc;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/**
 * The Utility's CRC-32: the standard reflected table, but init 0 and no
 * final xor (so it is not the zlib CRC-32).
 */
export function crc32(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!;
  }
  return crc >>> 0;
}

// ---------------------------------------------------------------- TLV

const CONTAINER_FLAG = 0x40;

function tagBytes(tag: number, container: boolean): number[] {
  let out: number[];
  if (tag < 0x40) out = [tag];
  else if (tag < 0x2000) out = [(tag >> 7) | 0x80, tag & 0x7f];
  else out = [(tag >> 14) | 0x80, ((tag >> 7) & 0x7f) | 0x80, tag & 0x7f];
  if (container) out[0]! |= CONTAINER_FLAG;
  return out;
}

/** Width the Utility reserves for a length field, from a size hint. */
function lengthWidth(n: number): 1 | 2 | 3 {
  return n < 0x80 ? 1 : n < 0x4000 ? 2 : 3;
}

function lengthBytes(len: number, width: 1 | 2 | 3): number[] {
  if (width === 1) {
    if (len >= 0x80) throw new Error(`TLV length ${len} does not fit 1 byte`);
    return [len];
  }
  if (width === 2) {
    if (len >= 0x4000) throw new Error(`TLV length ${len} does not fit 2 bytes`);
    return [(len >> 7) | 0x80, len & 0x7f];
  }
  return [(len >> 14) | 0x80, ((len >> 7) & 0x7f) | 0x80, len & 0x7f];
}

export interface TlvLeaf {
  tag: number;
  value: Uint8Array;
}

export interface TlvContainer {
  tag: number;
  /**
   * Size hint the Utility passes when opening this container. It fixes the
   * width of the length field (under 0x80 -> 1 byte, under 0x4000 -> 2),
   * even when the real content turns out shorter. Matching it keeps our
   * bytes identical to the Utility's.
   */
  hint: number;
  children: TlvNode[];
}

export type TlvNode = TlvLeaf | TlvContainer;

export function isContainer(node: TlvNode): node is TlvContainer {
  return "children" in node;
}

export const leaf = (tag: number, value: Uint8Array | number[]): TlvLeaf => ({
  tag,
  value: value instanceof Uint8Array ? value : Uint8Array.from(value),
});

export const container = (tag: number, hint: number, children: TlvNode[]): TlvContainer => ({
  tag,
  hint,
  children,
});

function encodeNode(node: TlvNode, out: number[]): void {
  if (!isContainer(node)) {
    out.push(...tagBytes(node.tag, false));
    out.push(...lengthBytes(node.value.length, lengthWidth(node.value.length)));
    for (const b of node.value) out.push(b);
    return;
  }
  const body: number[] = [];
  for (const child of node.children) encodeNode(child, body);
  out.push(...tagBytes(node.tag, true));
  out.push(...lengthBytes(body.length, lengthWidth(node.hint)));
  for (const b of body) out.push(b);
}

export function encodeTlv(root: TlvNode): Uint8Array {
  const out: number[] = [];
  encodeNode(root, out);
  return Uint8Array.from(out);
}

function readVarint(bytes: Uint8Array, at: number, firstMask: number): { value: number; next: number } {
  let value = 0;
  let i = at;
  for (let n = 0; n < 3; n++, i++) {
    if (i >= bytes.length) throw new Error("TLV truncated");
    const b = bytes[i]!;
    const bits = n === 0 ? b & firstMask : b & 0x7f;
    value = (value << 7) | bits;
    if (!(b & 0x80)) return { value, next: i + 1 };
  }
  throw new Error("TLV varint longer than 3 bytes");
}

/** Parse a TLV byte run into its sibling nodes. */
export function decodeTlv(bytes: Uint8Array, start = 0, end = bytes.length): TlvNode[] {
  const nodes: TlvNode[] = [];
  let at = start;
  while (at < end) {
    const containerNode = (bytes[at]! & CONTAINER_FLAG) !== 0;
    const tag = readVarint(bytes, at, 0x3f);
    const len = readVarint(bytes, tag.next, 0x7f);
    const valueEnd = len.next + len.value;
    if (valueEnd > end) throw new Error("TLV value runs past its parent");
    if (containerNode) {
      nodes.push({
        tag: tag.value,
        hint: len.value,
        children: decodeTlv(bytes, len.next, valueEnd),
      });
    } else {
      nodes.push({ tag: tag.value, value: bytes.slice(len.next, valueEnd) });
    }
    at = valueEnd;
  }
  return nodes;
}

// ---------------------------------------------------------------- message

const MESSAGE_HEADER = 0x01;

/** Wrap TLV bytes as `01 <crc16 LE> <tlv>`. */
export function encodeMessage(tlv: Uint8Array): Uint8Array {
  const crc = crc16(tlv);
  const out = new Uint8Array(tlv.length + 3);
  out[0] = MESSAGE_HEADER;
  out[1] = crc & 0xff;
  out[2] = crc >> 8;
  out.set(tlv, 3);
  return out;
}

/** Check and strip the message header, returning the TLV bytes. */
export function decodeMessage(message: Uint8Array): Uint8Array {
  if (message.length <= 4) throw new Error(`Message too short (${message.length} bytes)`);
  if (message[0] !== MESSAGE_HEADER) throw new Error(`Unknown message header 0x${message[0]!.toString(16)}`);
  const tlv = message.subarray(3);
  const expected = message[1]! | (message[2]! << 8);
  const actual = crc16(tlv);
  if (expected !== actual) {
    throw new Error(`Message CRC mismatch: got 0x${expected.toString(16)}, computed 0x${actual.toString(16)}`);
  }
  return tlv;
}

// ---------------------------------------------------------------- serial frame

/** The Utility refuses to queue more than this many bytes. */
export const MAX_FRAME_BYTES = 0x2800;

export function encodeFrame(message: Uint8Array): Uint8Array {
  if (message.length === 0) throw new Error("Empty frame");
  if (message[0]! > 0xfd) throw new Error("Frame payload may not start with 0xFE or 0xFF");
  const out: number[] = [0xff];
  for (const b of message) {
    out.push(b);
    if (b === 0xff) out.push(0xfe);
  }
  out.push(0xff, 0xff);
  if (out.length > MAX_FRAME_BYTES) throw new Error(`Frame of ${out.length} bytes is over the device limit`);
  return Uint8Array.from(out);
}

/**
 * Streaming frame decoder. Feed it whatever the port delivers; it emits each
 * complete message. `FF FE` is a literal FF, `FF FF` ends a frame, and FF
 * followed by any other byte starts a new frame (dropping a partial one).
 */
export class FrameDecoder {
  private buffer: number[] = [];
  private inFrame = false;
  private pendingFF = false;

  constructor(private readonly onMessage: (message: Uint8Array) => void) {}

  push(chunk: Uint8Array): void {
    for (const b of chunk) this.pushByte(b);
  }

  private pushByte(b: number): void {
    if (this.pendingFF) {
      this.pendingFF = false;
      if (b === 0xfe) {
        if (this.inFrame) this.buffer.push(0xff);
        return;
      }
      if (b === 0xff) {
        if (this.inFrame && this.buffer.length > 0) this.onMessage(Uint8Array.from(this.buffer));
        this.buffer = [];
        this.inFrame = false;
        return;
      }
      // FF + data byte: a new frame starts with this byte.
      this.buffer = [b];
      this.inFrame = true;
      return;
    }
    if (b === 0xff) {
      this.pendingFF = true;
      return;
    }
    if (this.inFrame) {
      this.buffer.push(b);
      if (this.buffer.length > MAX_FRAME_BYTES) {
        this.buffer = [];
        this.inFrame = false;
      }
    }
  }
}

// ---------------------------------------------------------------- little-endian helpers

export const u8 = (n: number) => [n & 0xff];
export const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
export const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

export function readUint(value: Uint8Array): number {
  let n = 0;
  for (let i = Math.min(value.length, 4) - 1; i >= 0; i--) n = n * 256 + value[i]!;
  return n;
}
