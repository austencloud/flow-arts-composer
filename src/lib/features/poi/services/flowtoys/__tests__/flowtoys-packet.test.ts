import { describe, expect, it } from "vitest";
import { FLOWTOYS_MODES, FLOWTOYS_PAGES } from "../flowtoys-modes";
import {
  FLAG,
  NOTIFY_BYTES,
  PACKET_BYTES,
  buildPacket,
  isGroupingAnnounce,
  parseNotification,
} from "../flowtoys-packet";

describe("buildPacket", () => {
  it("lays out group, counter, page and mode", () => {
    const p = buildPacket(0x1234, 0x01020304, { page: 2, mode: 7 });
    expect(p.length).toBe(PACKET_BYTES);
    expect([...p.slice(0, 6)]).toEqual([0x12, 0x34, 0x04, 0x03, 0x02, 0x01]);
    expect(p[15]).toBe(0);
    expect(p[18]).toBe(1);
    expect(p[19]).toBe(6);
    expect(p[20]).toBe(0);
  });

  it("sets an override bit only for each value given", () => {
    const p = buildPacket(1, 1, {
      page: 1,
      mode: 1,
      adjust: { hue: 300, brightness: 128, density: 0 },
    });
    expect(p[10]).toBe(255);
    expect(p[11]).toBe(0);
    expect(p[12]).toBe(128);
    expect(p[14]).toBe(0);
    expect(p[15]).toBe(0x02 | 0x08 | 0x20);
  });

  it("allows only the restart, wake and power-off flags", () => {
    expect(
      buildPacket(1, 1, { page: 1, mode: 1 }, FLAG.WAKE | FLAG.RESTART)[20]
    ).toBe(0x0a);
    expect(() => buildPacket(1, 1, { page: 1, mode: 1 }, 0x01)).toThrow(
      /unverified/
    );
    expect(() => buildPacket(1, 1, { page: 1, mode: 1 }, 0x10)).toThrow(
      /unverified/
    );
  });

  it("refuses out-of-range ids and modes", () => {
    expect(() => buildPacket(0x10000, 1, { page: 1, mode: 1 })).toThrow();
    expect(() => buildPacket(1, 1, { page: 0, mode: 1 })).toThrow();
    expect(() => buildPacket(1, 1, { page: 1, mode: 0 })).toThrow();
  });
});

describe("parseNotification", () => {
  it("reads the packet after the leading byte", () => {
    const sent = buildPacket(0xbeef, 42, { page: 5, mode: 1 }, FLAG.WAKE);
    const raw = new Uint8Array(NOTIFY_BYTES);
    raw[0] = 0x99;
    raw.set(sent, 1);
    const packet = parseNotification(new DataView(raw.buffer))!;
    expect(packet).toEqual({
      group: 0xbeef,
      counter: 42,
      page: 5,
      mode: 1,
      flags: FLAG.WAKE,
    });
    expect(isGroupingAnnounce(packet)).toBe(true);
  });

  it("ignores other lengths", () => {
    expect(parseNotification(new DataView(new ArrayBuffer(21)))).toBeNull();
  });
});

describe("FLOWTOYS_MODES", () => {
  it("covers each page with unique modes", () => {
    const keys = new Set(FLOWTOYS_MODES.map((m) => `${m.page}:${m.mode}`));
    expect(keys.size).toBe(FLOWTOYS_MODES.length);
    for (const page of FLOWTOYS_PAGES)
      expect(FLOWTOYS_MODES.some((m) => m.page === page)).toBe(true);
  });
});
