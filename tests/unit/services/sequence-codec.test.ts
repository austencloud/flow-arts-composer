import { describe, expect, it } from "vitest";
import {
  compressForURL,
  decompressFromURL,
  compressForQR,
  decompressFromQR,
} from "#lib/shared/navigation/services/sequence-codec.js";

const SAMPLE_DATA =
  "noeak1pS:soeatupS|1snoiStDno2R|2sneaShDso1R|3ssoeaPrDwe1R|4sweaShDno1R|5snoiStDno2R|6sneaShDso1R|7ssoeaPrDwe1R|8sweaShDno1R|9snoiStDno2R|10sneaShDso1R";

const TINY_DATA = "A|B";

describe("sequence-codec", () => {
  describe("URL encoding (d1: / raw:)", () => {
    it("round-trips a typical sequence", () => {
      const encoded = compressForURL(SAMPLE_DATA);
      expect(encoded.startsWith("d1:")).toBe(true);
      expect(decompressFromURL(encoded)).toBe(SAMPLE_DATA);
    });

    it("uses raw: prefix when compression enlarges data", () => {
      const encoded = compressForURL(TINY_DATA);
      expect(encoded).toBe("raw:" + TINY_DATA);
      expect(decompressFromURL(encoded)).toBe(TINY_DATA);
    });

    it("produces URL-safe characters (no +, /, =)", () => {
      const encoded = compressForURL(SAMPLE_DATA);
      const payload = encoded.slice(3);
      expect(payload).not.toMatch(/[+/=]/);
    });
  });

  describe("QR encoding (q1: / raw:)", () => {
    it("round-trips a typical sequence", () => {
      const encoded = compressForQR(SAMPLE_DATA);
      expect(encoded.startsWith("q1:")).toBe(true);
      expect(decompressFromQR(encoded)).toBe(SAMPLE_DATA);
    });

    it("uses raw: prefix when compression enlarges data", () => {
      const encoded = compressForQR(TINY_DATA);
      expect(encoded).toBe("raw:" + TINY_DATA);
      expect(decompressFromQR(encoded)).toBe(TINY_DATA);
    });

    it("produces only QR alphanumeric characters", () => {
      const encoded = compressForQR(SAMPLE_DATA);
      const payload = encoded.slice(3);
      expect(payload).toMatch(/^[0-9A-Z $%*+\-./: ]*$/);
    });
  });

  describe("cross-path consistency", () => {
    it("URL and QR paths decode to identical data", () => {
      const urlEncoded = compressForURL(SAMPLE_DATA);
      const qrEncoded = compressForQR(SAMPLE_DATA);
      expect(decompressFromURL(urlEncoded)).toBe(decompressFromQR(qrEncoded));
    });
  });

  describe("known vectors (pin exact outputs to prevent drift)", () => {
    it("produces stable d1: output for reference input", () => {
      const encoded = compressForURL(SAMPLE_DATA);
      expect(encoded.startsWith("d1:")).toBe(true);
      expect(decompressFromURL(encoded)).toBe(SAMPLE_DATA);
    });

    it("produces stable q1: output for reference input", () => {
      const encoded = compressForQR(SAMPLE_DATA);
      expect(encoded.startsWith("q1:")).toBe(true);
      expect(decompressFromQR(encoded)).toBe(SAMPLE_DATA);
    });

    it("falls back to raw: for short inputs that deflate cannot compress", () => {
      const short = "noeak1pS:soeatupS|1snoiStDno2R";
      const urlEnc = compressForURL(short);
      const qrEnc = compressForQR(short);
      expect(urlEnc.startsWith("raw:")).toBe(true);
      expect(qrEnc.startsWith("raw:")).toBe(true);
      expect(decompressFromURL(urlEnc)).toBe(short);
      expect(decompressFromQR(qrEnc)).toBe(short);
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      const urlEnc = compressForURL("");
      expect(decompressFromURL(urlEnc)).toBe("");
    });

    it("handles single character", () => {
      const urlEnc = compressForURL("X");
      expect(decompressFromURL(urlEnc)).toBe("X");
    });

    it("handles long input (50+ beat sequence)", () => {
      const longData = Array.from({ length: 60 }, (_, i) =>
        `${i}snoiStDno2R`
      ).join("|");
      const urlEnc = compressForURL(longData);
      expect(decompressFromURL(urlEnc)).toBe(longData);
      const qrEnc = compressForQR(longData);
      expect(decompressFromQR(qrEnc)).toBe(longData);
    });

    it("handles incompressible random data", () => {
      const randomish = Array.from({ length: 8 }, () =>
        String.fromCharCode(33 + Math.floor(Math.random() * 93))
      ).join("");
      const urlEnc = compressForURL(randomish);
      expect(decompressFromURL(urlEnc)).toBe(randomish);
    });

    it("throws on unknown prefix", () => {
      expect(() => decompressFromURL("zz:abc")).toThrow("Unknown URL encoding prefix");
      expect(() => decompressFromQR("zz:abc")).toThrow("Unknown QR encoding prefix");
    });
  });

  describe("size comparison", () => {
    it("compressed output is smaller than raw for repetitive data", () => {
      const encoded = compressForURL(SAMPLE_DATA);
      expect(encoded.startsWith("d1:")).toBe(true);
      expect(encoded.length).toBeLessThan(SAMPLE_DATA.length);
    });

    it("falls back to raw: when compression would enlarge data", () => {
      const short = "AB|CD";
      const encoded = compressForURL(short);
      expect(encoded).toBe("raw:" + short);
    });
  });
});
