/**
 * Lighttoys FT2 serial commands, limited to what an image upload needs.
 * See docs/reference/lighttoys-protocol.md.
 *
 * The same link carries firmware and bootloader updates, so every text
 * command goes through `assertSafeCommand`: only `v` (identify), `sd` (list
 * banks) and `fW e … b1-4 …` (start a show write) pass. Data blocks are built
 * only by `frameBlock`. Nothing here deletes a show or touches bank 5.
 */

import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import {
  compileLighttoysShow,
  makeShowUid,
  type LighttoysImage,
} from "./lighttoys-show";

export const LIGHTTOYS_VENDOR_ID = 0x1669;
export const LIGHTTOYS_PRODUCT_ID = 0x1026;
export const LIGHTTOYS_BAUD = 115200;
export const LIGHTTOYS_BANKS = 4;
export const BLOCK_BYTES = 1024;

/** Lumi Staff: what Composer generates for it (`*X85`, about 1.3 ms a column). */
export const LUMI_STAFF = { ledCount: 85, columnTimeUs: 1300 } as const;

export class LighttoysError extends Error {}

const SAFE_COMMANDS = [
  /^v$/,
  /^sd$/,
  /^fW e [0-9a-f]{8} b[1-4] [1-9]\d{0,7} [A-Za-z0-9 _-]{1,24}$/,
];

/** Refuse anything but the identify, list and write commands. */
export function assertSafeCommand(command: string): void {
  if (!SAFE_COMMANDS.some((re) => re.test(command)))
    throw new LighttoysError(
      `Refusing to send "${command}" to a Lighttoys device`
    );
}

export function commandBytes(command: string): Uint8Array {
  assertSafeCommand(command);
  return new TextEncoder().encode(`${command}\r\n`);
}

/** `fW ` 7F len(BE) data fletcher16(sum2, sum1) 0A */
export function frameBlock(data: Uint8Array): Uint8Array {
  if (data.length === 0 || data.length > BLOCK_BYTES)
    throw new LighttoysError(`A block holds 1 to ${BLOCK_BYTES} bytes`);
  let sum1 = 0;
  let sum2 = 0;
  for (const byte of data) {
    sum1 = (sum1 + byte) % 256;
    sum2 = (sum2 + sum1) % 256;
  }
  const out = new Uint8Array(data.length + 9);
  out.set([0x66, 0x57, 0x20, 0x7f, data.length >> 8, data.length & 0xff]);
  out.set(data, 6);
  out.set([sum2, sum1, 0x0a], data.length + 6);
  return out;
}

export function writeCommand(
  uid: number,
  bank: number,
  size: number,
  name: string
): string {
  if (!Number.isInteger(bank) || bank < 1 || bank > LIGHTTOYS_BANKS)
    throw new LighttoysError(`Bank must be 1 to ${LIGHTTOYS_BANKS}`);
  const command = `fW e ${(uid >>> 0).toString(16).padStart(8, "0")} b${bank} ${size} ${name}`;
  assertSafeCommand(command);
  return command;
}

/** Track names the staff will take: plain ASCII, at most 24 characters. */
export function showName(name: string): string {
  const clean = name
    .replace(/[^A-Za-z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24)
    .trim();
  return clean || "Flow Arts";
}

export interface LighttoysIdentity {
  hardware: string;
  firmware?: string;
  productId?: string;
  raw: string;
}

/** Parse the `v` reply, e.g. `HW:FT2module-1.0.0;FW:v1.0;DT:20240701112107;PI:3`. */
export function parseIdentity(lines: string[]): LighttoysIdentity | null {
  const raw = lines.find((l) => l.includes("HW:"));
  if (!raw) return null;
  const fields = Object.fromEntries(
    raw
      .slice(raw.indexOf("HW:"))
      .split(";")
      .map((part) => {
        const i = part.indexOf(":");
        return [part.slice(0, i).trim(), part.slice(i + 1).trim()];
      })
  );
  return {
    hardware: fields.HW ?? "",
    firmware: fields.FW,
    productId: fields.PI,
    raw,
  };
}

/** Only the hardware whose show format was checked (Austen's Lumi Staffs). */
export function isVerifiedStaff(identity: LighttoysIdentity | null): boolean {
  return (
    !!identity &&
    identity.hardware.startsWith("FT2module") &&
    identity.productId === "3"
  );
}

/**
 * Banks the `sd` reply lists as holding a show. Composer reads one line per
 * used bank, starting with its number and a colon. Any such line with content
 * counts as used, so an unexpected format errs toward leaving a bank alone.
 */
export function usedBanks(lines: string[]): Set<number> {
  const used = new Set<number>();
  for (const line of lines) {
    const m = /^\s*([1-4])\s*:(.*)$/.exec(line);
    if (m && m[2]!.trim() !== "") used.add(Number(m[1]));
  }
  return used;
}

/** Resample a pattern to the staff's LED count (nearest LED). */
function columnsFor(pattern: StripPattern, ledCount: number): Uint8Array[] {
  return pattern.frames.map((frame) => {
    const out = new Uint8Array(ledCount * 3);
    for (let led = 0; led < ledCount; led++) {
      const src = Math.min(
        pattern.ledCount - 1,
        Math.floor(((led + 0.5) * pattern.ledCount) / ledCount)
      );
      out[led * 3] = frame.colors[src * 3]!;
      out[led * 3 + 1] = frame.colors[src * 3 + 1]!;
      out[led * 3 + 2] = frame.colors[src * 3 + 2]!;
    }
    return out;
  });
}

export interface StaffShowOptions {
  /** How long the staff plays the pattern, repeating it, in seconds. */
  playSeconds: number;
  now?: Date;
  random?: number;
}

/**
 * One-image show: the pattern's columns once, displayed for `playSeconds`.
 * The staff repeats an image's columns across its displayed length, the way
 * Composer's logo images hold about 100 columns but play for 8000.
 */
export function patternToStaffShow(
  pattern: StripPattern,
  options: StaffShowOptions
): { bytes: Uint8Array; uid: number } {
  if (pattern.frameCount < 1)
    throw new LighttoysError("The pattern has no columns");
  if (pattern.frameCount > 0xffff)
    throw new LighttoysError("The pattern is too wide for a staff");
  const now = options.now ?? new Date();
  const createdAt = Math.floor(now.getTime() / 1000);
  const uid = makeShowUid(
    createdAt,
    now.getMilliseconds(),
    options.random ?? Math.floor(Math.random() * 32)
  );
  const columnTime = LUMI_STAFF.columnTimeUs << 8;
  const displayLength = Math.max(
    pattern.frameCount,
    Math.round((options.playSeconds * 1_000_000) / LUMI_STAFF.columnTimeUs)
  );
  const image: LighttoysImage = {
    ledCount: LUMI_STAFF.ledCount,
    columns: columnsFor(pattern, LUMI_STAFF.ledCount),
    columnTime,
    displayLength,
  };
  return { bytes: compileLighttoysShow([image], { uid, createdAt }), uid };
}
