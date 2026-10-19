/**
 * Ignis TLV requests and replies, built exactly as Pixel Utility 2 builds
 * them (request builder at 0x1400243e0, reply parser at 0x140025920).
 *
 * Safety: every outgoing tree passes `assertSafeRequest`, an allowlist of the
 * only tags this uploader needs. The control container (CTRL, which carries
 * GOTO_BL, ERASE_FW and WRITE_FW) and both bootloader containers are not on
 * it, so no code path here can send firmware or bootloader commands.
 */

import {
  container,
  decodeMessage,
  decodeTlv,
  encodeFrame,
  encodeMessage,
  encodeTlv,
  isContainer,
  leaf,
  readUint,
  u16,
  u32,
  u8,
  type TlvContainer,
  type TlvNode,
} from "./ignis-codec";

/** Container tags (sent with the 0x40 flag). */
export const CTAG = {
  ROOT: 1,
  ACK: 10,
  WAIT: 0x0b,
  STATUS: 0x0c,
  REQ_INFO: 0x14,
  DEV_INFO: 0x1f,
  MODE: 0x32,
  MODE_INFO: 0x33,
  MODE_IMG_INFO: 0x34,
  MODE_SEQ_INFO: 0x35,
  MODE_SEQ_ITEM_INFO: 0x36,
  MODE_DATA: 0x37,
} as const;

/** Leaf tags. */
export const TAG = {
  ACK_CODE: 1,
  REQ_ID: 3,
  WAIT_TIME: 4,
  ACTION: 5,
  DATA: 6,
  DATA_CRC: 7,
  REQ_TYPE: 10,
  REQ_LEVEL: 0x0b,
  MODE_TYPE: 0x32,
  MODE_INDEX: 0x33,
  MODE_OFFSET: 0x34,
  MODE_WIDTH: 0x48,
  MODE_HEIGHT: 0x49,
  ITEM_DRAWSTYLE: 0x4d,
  ITEM_SCALE: 0x4e,
  ITEM_GAP_SIZE: 0x4f,
  IMG_COLSIZE: 0x51,
  DEV_INFO_FAMILY: 0x82,
  DEV_INFO_FW_VER: 0x83,
  DEV_INFO_BL_VER: 0x84,
  DEV_INFO_BAT_V: 0x85,
  DEV_INFO_BAT_LEVEL: 0x86,
  DEV_INFO_UID: 0x87,
  DEV_INFO_MAC: 0x88,
  DEV_INFO_RSSI: 0x89,
  DEV_INFO_NAME: 0x8a,
} as const;

export const MODE_ACTION = { ERASE: 0, WRITE: 1 } as const;
export const MODE_TYPE = { SEQUENCE: 0, IMAGE: 1 } as const;

const SAFE_CONTAINERS = new Set<number>([
  CTAG.ROOT,
  CTAG.REQ_INFO,
  CTAG.MODE,
  CTAG.MODE_INFO,
  CTAG.MODE_IMG_INFO,
  CTAG.MODE_DATA,
]);

const SAFE_LEAVES = new Set<number>([
  TAG.ACTION,
  TAG.DATA,
  TAG.DATA_CRC,
  TAG.REQ_TYPE,
  TAG.REQ_LEVEL,
  TAG.MODE_TYPE,
  TAG.MODE_INDEX,
  TAG.MODE_OFFSET,
  TAG.MODE_WIDTH,
  TAG.MODE_HEIGHT,
  TAG.ITEM_DRAWSTYLE,
  TAG.ITEM_SCALE,
  TAG.ITEM_GAP_SIZE,
  TAG.IMG_COLSIZE,
]);

export class UnsafeRequestError extends Error {}

/** Throw unless every node in the tree is on the uploader's allowlist. */
export function assertSafeRequest(node: TlvNode): void {
  if (isContainer(node)) {
    if (!SAFE_CONTAINERS.has(node.tag)) {
      throw new UnsafeRequestError(`Container tag 0x${node.tag.toString(16)} is not allowed`);
    }
    for (const child of node.children) assertSafeRequest(child);
    return;
  }
  if (!SAFE_LEAVES.has(node.tag)) {
    throw new UnsafeRequestError(`Tag 0x${node.tag.toString(16)} is not allowed`);
  }
  if (node.tag === TAG.ACTION) {
    const action = node.value[0];
    if (node.value.length !== 1 || (action !== MODE_ACTION.ERASE && action !== MODE_ACTION.WRITE)) {
      throw new UnsafeRequestError("ACTION must be erase (0) or write (1)");
    }
  }
}

/** Root tree -> bytes ready for the serial port. */
export function toWire(root: TlvContainer): Uint8Array {
  if (root.tag !== CTAG.ROOT) throw new UnsafeRequestError("Requests must be wrapped in ROOT");
  assertSafeRequest(root);
  return encodeFrame(encodeMessage(encodeTlv(root)));
}

// ---------------------------------------------------------------- requests

/** "Tell me who you are": REQ_INFO asking for DEV_INFO at level 2. */
export function infoRequest(): TlvContainer {
  return container(CTAG.ROOT, 0x20, [
    container(CTAG.REQ_INFO, 0x10, [leaf(TAG.REQ_TYPE, [CTAG.DEV_INFO]), leaf(TAG.REQ_LEVEL, [2])]),
  ]);
}

export interface ModeTarget {
  type: (typeof MODE_TYPE)[keyof typeof MODE_TYPE];
  /** Index within that type: image 0 is the first image slot. */
  index: number;
}

/** Erase one image or sequence slot. */
export function eraseRequest(target: ModeTarget): TlvContainer {
  return container(CTAG.ROOT, 0x3f, [
    container(CTAG.MODE, 0x18, [
      leaf(TAG.ACTION, [MODE_ACTION.ERASE]),
      container(CTAG.MODE_INFO, 0x10, [leaf(TAG.MODE_TYPE, u8(target.type)), leaf(TAG.MODE_INDEX, u16(target.index))]),
    ]),
  ]);
}

/** The 17-byte header `C_IMAGE::CnvToTlvFmt` builds for an image. */
export interface ImageHeader {
  width: number;
  height: number;
  colSize: number;
  drawStyle: number;
  gapSize: number;
  /** Fixed point, 1.0 = 0x400000. */
  scale: number;
  /** crc32 of the unpadded column data. */
  dataCrc: number;
}

/** One 2048-byte (or shorter) chunk of an image upload. */
export function writeImageChunkRequest(
  index: number,
  chunk: Uint8Array,
  chunkNumber: number,
  header: ImageHeader,
  chunkCrc: number
): TlvContainer {
  const len = chunk.length;
  const offset = len * chunkNumber;
  const modeChildren: TlvNode[] = [
    leaf(TAG.ACTION, [MODE_ACTION.WRITE]),
    container(CTAG.MODE_INFO, 9, [
      leaf(TAG.MODE_TYPE, u8(MODE_TYPE.IMAGE)),
      leaf(TAG.MODE_INDEX, u16(index)),
      leaf(TAG.MODE_OFFSET, u32(offset)),
    ]),
  ];
  if (offset === 0) {
    modeChildren.push(
      container(CTAG.MODE_IMG_INFO, 0x11, [
        leaf(TAG.MODE_WIDTH, u16(header.width)),
        leaf(TAG.MODE_HEIGHT, u16(header.height)),
        leaf(TAG.IMG_COLSIZE, u16(header.colSize)),
        leaf(TAG.ITEM_DRAWSTYLE, u8(header.drawStyle)),
        leaf(TAG.ITEM_GAP_SIZE, u16(header.gapSize)),
        leaf(TAG.ITEM_SCALE, u32(header.scale)),
        leaf(TAG.DATA_CRC, u32(header.dataCrc)),
      ])
    );
  }
  modeChildren.push(container(CTAG.MODE_DATA, len, [leaf(TAG.DATA, chunk), leaf(TAG.DATA_CRC, u32(chunkCrc))]));
  return container(CTAG.ROOT, len + 0x18, [container(CTAG.MODE, len + 0x15, modeChildren)]);
}

// ---------------------------------------------------------------- replies

export interface IgnisAck {
  code: number;
  /** Container tag of the request being acknowledged (0x32 for MODE). */
  requestTag: number;
  action: number;
}

export interface IgnisDeviceInfo {
  /** Hardware type code, e.g. 0x010B for iPixel 200 HD. */
  family?: number;
  firmware?: string;
  /** Firmware packed as major<<24 | minor<<16 | patch<<8 | build. */
  firmwareCode?: number;
  bootloader?: string;
  batteryLevel?: number;
  batteryVoltage?: number;
  uid?: string;
  mac?: string;
  name?: string;
}

export interface IgnisReply {
  ack?: IgnisAck;
  /** The device asked us to wait this many ms before expecting the ack. */
  waitMs?: number;
  deviceInfo?: IgnisDeviceInfo;
  /** Every top-level container tag seen, for logging. */
  tags: number[];
}

const hex = (bytes: Uint8Array, sep = "") => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(sep);

function versionString(code: number): string {
  return [(code >>> 24) & 0xff, (code >>> 16) & 0xff, (code >>> 8) & 0xff, code & 0xff].join(".");
}

function leafValues(node: TlvContainer): Map<number, Uint8Array> {
  const map = new Map<number, Uint8Array>();
  for (const child of node.children) if (!isContainer(child)) map.set(child.tag, child.value);
  return map;
}

function parseDeviceInfo(node: TlvContainer): IgnisDeviceInfo {
  const v = leafValues(node);
  const info: IgnisDeviceInfo = {};
  const family = v.get(TAG.DEV_INFO_FAMILY);
  if (family) info.family = readUint(family);
  const fw = v.get(TAG.DEV_INFO_FW_VER);
  if (fw) {
    info.firmwareCode = readUint(fw);
    info.firmware = versionString(info.firmwareCode);
  }
  const bl = v.get(TAG.DEV_INFO_BL_VER);
  if (bl) info.bootloader = versionString(readUint(bl));
  const level = v.get(TAG.DEV_INFO_BAT_LEVEL);
  if (level) info.batteryLevel = readUint(level);
  const volts = v.get(TAG.DEV_INFO_BAT_V);
  if (volts) info.batteryVoltage = readUint(volts);
  const uid = v.get(TAG.DEV_INFO_UID);
  if (uid) info.uid = hex(uid);
  const mac = v.get(TAG.DEV_INFO_MAC);
  if (mac) info.mac = hex(mac, ":");
  const name = v.get(TAG.DEV_INFO_NAME);
  if (name) info.name = new TextDecoder().decode(name).replace(/\0+$/, "");
  return info;
}

/** Decode one framed message (already unescaped) into what we care about. */
export function parseReply(message: Uint8Array): IgnisReply {
  const nodes = decodeTlv(decodeMessage(message));
  const root = nodes[0];
  if (!root || !isContainer(root) || root.tag !== CTAG.ROOT) throw new Error("Reply is not a ROOT container");
  const reply: IgnisReply = { tags: [] };
  for (const child of root.children) {
    if (!isContainer(child)) continue;
    reply.tags.push(child.tag);
    if (child.tag === CTAG.ACK) {
      const v = leafValues(child);
      reply.ack = {
        code: readUint(v.get(TAG.ACK_CODE) ?? new Uint8Array()),
        requestTag: readUint(v.get(TAG.REQ_ID) ?? new Uint8Array()),
        action: readUint(v.get(TAG.ACTION) ?? new Uint8Array()),
      };
    } else if (child.tag === CTAG.WAIT) {
      const t = leafValues(child).get(TAG.WAIT_TIME);
      if (t) reply.waitMs = readUint(t);
    } else if (child.tag === CTAG.DEV_INFO) {
      reply.deviceInfo = parseDeviceInfo(child);
    }
  }
  return reply;
}

/** Ack codes named in the Utility. Only 0 is success. */
export function describeAck(code: number): string {
  return code === 0 ? "OK" : `device refused (ack ${code})`;
}

// ---------------------------------------------------------------- device model

/** HD models: type code, name and LED count (0x140025010, 0x14001e780). */
export const IGNIS_MODELS: Record<number, { name: string; ledCount: number }> = {
  0x010d: { name: "iPixel 104 HD", ledCount: 104 },
  0x010a: { name: "iPixel 144 HD", ledCount: 144 },
  0x010b: { name: "iPixel 200 HD", ledCount: 200 },
  0x010c: { name: "iPixel 256 HD", ledCount: 256 },
};

/**
 * HD poi can report the generic family 0x0100; the Utility then picks the
 * real type from the name prefix (0x140025010).
 */
export function resolveFamily(info: IgnisDeviceInfo): number | undefined {
  if (info.family !== 0x0100) return info.family;
  for (const [code, model] of Object.entries(IGNIS_MODELS)) {
    if (info.name?.toLowerCase().startsWith(model.name.toLowerCase())) return Number(code);
  }
  return undefined;
}

/** Types whose image encoding this uploader reproduces byte for byte. */
export const VERIFIED_FAMILIES = new Set<number>([0x010b]);
