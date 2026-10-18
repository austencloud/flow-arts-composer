/**
 * Flowtoys Connect radio packets, sent through a Flowtoys Bridge.
 * See docs/reference/flowtoys-protocol.md.
 *
 * Props only play their built-in modes; a packet picks a page and mode and
 * can override hue, saturation, brightness, speed and density. Only the
 * restart, wake and power-off flags are ever set here.
 */

export const FLOWTOYS_SERVICE = "49550001-aad5-59bd-934c-023d807e01d5";
export const FLOWTOYS_NOTIFY = "49550002-aad5-59bd-934c-023d807e01d5";
export const FLOWTOYS_WRITE = "49550003-aad5-59bd-934c-023d807e01d5";
export const FLOWTOYS_BRIDGE_NAME = "Flowtoys Bridge";

export const PACKET_BYTES = 21;
export const NOTIFY_BYTES = 22;

export const FLAG = {
  WAKE: 0x02,
  POWER_OFF: 0x04,
  RESTART: 0x08,
} as const;
const ALLOWED_FLAGS = FLAG.WAKE | FLAG.POWER_OFF | FLAG.RESTART;

const OVERRIDE = {
  hue: 0x02,
  saturation: 0x04,
  brightness: 0x08,
  speed: 0x10,
  density: 0x20,
} as const;

export type FlowtoysAdjust = keyof typeof OVERRIDE;
export const FLOWTOYS_ADJUSTS = Object.keys(OVERRIDE) as FlowtoysAdjust[];

/** What a group should show. Pages and modes count from 1, as on the props. */
export interface FlowtoysState {
  page: number;
  mode: number;
  /** 0-255 each; a missing value leaves the prop's own setting. */
  adjust?: Partial<Record<FlowtoysAdjust, number>>;
}

export interface FlowtoysPacket {
  group: number;
  counter: number;
  page: number;
  mode: number;
  flags: number;
}

const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export function buildPacket(
  group: number,
  counter: number,
  state: FlowtoysState,
  flags = 0
): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(group) || group < 0 || group > 0xffff)
    throw new Error(`Bad group id ${group}`);
  if (!Number.isInteger(state.page) || state.page < 1 || state.page > 256)
    throw new Error(`Bad page ${state.page}`);
  if (!Number.isInteger(state.mode) || state.mode < 1 || state.mode > 256)
    throw new Error(`Bad mode ${state.mode}`);
  if ((flags & ~ALLOWED_FLAGS) !== 0)
    throw new Error(`Refusing unverified flags 0x${flags.toString(16)}`);
  const out = new Uint8Array(PACKET_BYTES);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, group, false);
  dv.setUint32(2, counter >>> 0, true);
  let overrides = 0;
  const offsets: Record<FlowtoysAdjust, number> = {
    hue: 10,
    saturation: 11,
    brightness: 12,
    speed: 13,
    density: 14,
  };
  for (const key of FLOWTOYS_ADJUSTS) {
    const value = state.adjust?.[key];
    if (value === undefined) continue;
    out[offsets[key]] = byte(value);
    overrides |= OVERRIDE[key];
  }
  out[15] = overrides;
  out[18] = state.page - 1;
  out[19] = state.mode - 1;
  out[20] = flags;
  return out;
}

/** Read a 22-byte bridge notification (one unknown byte, then a packet). */
export function parseNotification(data: DataView): FlowtoysPacket | null {
  if (data.byteLength !== NOTIFY_BYTES) return null;
  return {
    group: data.getUint16(1, false),
    counter: data.getUint32(3, true),
    page: data.getUint8(19) + 1,
    mode: data.getUint8(20) + 1,
    flags: data.getUint8(21),
  };
}

/** Pressing a prop's button five times selects its grouping setting. */
export const isGroupingAnnounce = (p: FlowtoysPacket) =>
  p.page === 5 && p.mode === 1;
