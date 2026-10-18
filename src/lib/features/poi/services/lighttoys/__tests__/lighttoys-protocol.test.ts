import { describe, expect, it } from "vitest";
import { createEmptyPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import {
  assertSafeCommand,
  commandBytes,
  frameBlock,
  isVerifiedStaff,
  parseIdentity,
  patternToStaffShow,
  showName,
  usedBanks,
  writeCommand,
} from "../lighttoys-protocol";

describe("assertSafeCommand", () => {
  it("passes only identify, bank list and show writes to banks 1-4", () => {
    for (const ok of [
      "v",
      "sd",
      "fW e 006d0c29 b1 546122 Lumi Staff 1",
      "fW e b3ce0c29 b4 9 x",
    ])
      expect(() => assertSafeCommand(ok)).not.toThrow();
    for (const bad of [
      "fd 1",
      "fse",
      "fsem",
      "fW e 006d0c29 b5 10 x",
      "fW e 006d0c29 b0 10 x",
      "fw e 006d0c29 b1 10 x",
      "pp",
      "sm 1",
      "v\r\nfd 1",
      "",
    ])
      expect(() => assertSafeCommand(bad)).toThrow();
  });

  it("ends commands with CR LF", () => {
    expect(Array.from(commandBytes("v"))).toEqual([0x76, 0x0d, 0x0a]);
  });
});

describe("writeCommand", () => {
  it("formats the uid as 8 lowercase hex digits", () => {
    expect(writeCommand(0xb3ce0c29, 1, 138995, "Lumi Staff 1")).toBe(
      "fW e b3ce0c29 b1 138995 Lumi Staff 1"
    );
    expect(writeCommand(0x0c29, 2, 5, "a")).toBe("fW e 00000c29 b2 5 a");
    expect(() => writeCommand(0x0c29, 5, 5, "a")).toThrow();
  });

  it("cleans names to what the staff takes", () => {
    expect(showName("Zan's Diamond — 3D!")).toBe("Zan s Diamond 3D");
    expect(showName("???")).toBe("Flow Arts");
    expect(showName("x".repeat(40))).toHaveLength(24);
  });
});

describe("frameBlock", () => {
  it("frames data with its length and Fletcher-16", () => {
    expect(Array.from(frameBlock(Uint8Array.from([1, 2, 3])))).toEqual([
      0x66, 0x57, 0x20, 0x7f, 0, 3, 1, 2, 3, 10, 6, 0x0a,
    ]);
    expect(() => frameBlock(new Uint8Array(1025))).toThrow();
  });
});

describe("parseIdentity", () => {
  it("reads the staff and recognises only the checked model", () => {
    const staff = parseIdentity([
      "HW:FT2module-1.0.0;FW:v1.0;DT:20240701112107;PI:3",
    ]);
    expect(staff).toMatchObject({
      hardware: "FT2module-1.0.0",
      firmware: "v1.0",
      productId: "3",
    });
    expect(isVerifiedStaff(staff)).toBe(true);
    const remote = parseIdentity([
      "v",
      "HW:LTC-2.0.0;FW:v2.0;DT:20250611153057;PI:6",
    ]);
    expect(isVerifiedStaff(remote)).toBe(false);
    expect(isVerifiedStaff(parseIdentity([]))).toBe(false);
  });
});

describe("usedBanks", () => {
  it("counts any bank line with content as used", () => {
    expect([
      ...usedBanks([
        "1:006D0C29 546122 0[Lumi Staff 1]",
        "3: x",
        "4:",
        "5:2742 [cfg]",
        "OKAY",
      ]),
    ]).toEqual([1, 3]);
  });
});

describe("patternToStaffShow", () => {
  it("writes the pattern once at 85 LEDs and plays it for the asked time", () => {
    const pattern = createEmptyPattern(40, 12, "test");
    pattern.frames[0]!.colors.fill(255);
    const { bytes, uid } = patternToStaffShow(pattern, {
      playSeconds: 60,
      now: new Date(1756000000123),
      random: 3,
    });
    expect(uid & 0xffff).toBe(0x0c29);
    const dv = new DataView(bytes.buffer);
    const table = bytes.length - 128 - 32;
    expect(dv.getUint16(table + 4, true)).toBe(85);
    expect(dv.getUint16(table + 6, true)).toBe(12);
    expect(dv.getUint32(table + 0x18, true)).toBe(Math.round(60e6 / 1300));
    expect(dv.getUint32(bytes.length - 128 + 4, true)).toBe(60000);
  });
});
