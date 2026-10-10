import { describe, it, expect } from "vitest";
import {
  buildPatternPacket,
  buildBrightnessPacket,
  buildSpeedPacket,
  chunkPacket,
} from "#lib/features/poi/services/open-pixel-poi-adapter.js";
import { createEmptyPattern, setPixel } from "#lib/shared/poi/domain/strip-pattern.js";
import { BLE_START_BYTE, BLE_END_BYTE, BleCommCode } from "#lib/features/poi/domain/device-types.js";

describe("Open-Pixel-Poi packet building", () => {
  describe("buildPatternPacket", () => {
    it("builds correct header for a 3-LED 2-frame pattern", () => {
      const pattern = createEmptyPattern(3, 2, "test");
      setPixel(pattern, 0, 0, { r: 255, g: 0, b: 0 });

      const packet = buildPatternPacket(pattern);

      // Header: [0xD0] [0x04] [height=3] [count_hi] [count_lo]
      expect(packet[0]).toBe(BLE_START_BYTE);
      expect(packet[1]).toBe(BleCommCode.IMAGE_UPLOAD);
      expect(packet[2]).toBe(3); // ledCount
      // Total pixels = 3 * 2 = 6
      expect(packet[3]).toBe(0); // count high byte
      expect(packet[4]).toBe(6); // count low byte

      // First pixel data: red
      expect(packet[5]).toBe(255);
      expect(packet[6]).toBe(0);
      expect(packet[7]).toBe(0);

      // End byte
      expect(packet[packet.length - 1]).toBe(BLE_END_BYTE);

      // Total size: 5 header + 6*3 data + 1 end = 24
      expect(packet.length).toBe(24);
    });

    it("throws when pattern exceeds 40,000 pixels", () => {
      const pattern = createEmptyPattern(200, 201, "too-big"); // 200*201 = 40200 > 40000
      expect(() => buildPatternPacket(pattern)).toThrow("exceeds Open-Pixel-Poi limit");
    });
  });

  describe("buildBrightnessPacket", () => {
    it("builds a 4-byte brightness command", () => {
      const packet = buildBrightnessPacket(128);
      expect(packet).toEqual(
        new Uint8Array([BLE_START_BYTE, BleCommCode.SET_BRIGHTNESS, 128, BLE_END_BYTE])
      );
    });

    it("clamps brightness to 0–255", () => {
      expect(buildBrightnessPacket(300)[2]).toBe(255);
      expect(buildBrightnessPacket(-10)[2]).toBe(0);
    });
  });

  describe("buildSpeedPacket", () => {
    it("encodes speed as uint16 big-endian", () => {
      const packet = buildSpeedPacket(300); // 0x012C
      expect(packet[0]).toBe(BLE_START_BYTE);
      expect(packet[1]).toBe(BleCommCode.SET_SPEED);
      expect(packet[2]).toBe(1);   // 300 >> 8
      expect(packet[3]).toBe(44);  // 300 & 0xFF
      expect(packet[4]).toBe(BLE_END_BYTE);
    });
  });

  describe("chunkPacket", () => {
    it("splits a packet into chunks of given size", () => {
      const data = new Uint8Array(1200);
      const chunks = chunkPacket(data, 509);
      expect(chunks).toHaveLength(3); // 509 + 509 + 182
      expect(chunks[0]!.length).toBe(509);
      expect(chunks[1]!.length).toBe(509);
      expect(chunks[2]!.length).toBe(182);
    });

    it("returns single chunk for small packets", () => {
      const data = new Uint8Array(100);
      const chunks = chunkPacket(data, 509);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.length).toBe(100);
    });
  });
});
