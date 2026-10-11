/**
 * cellKey grammar for the SpiroAnim → Composer bridge route.
 *
 * The key is the shared identity contract between two repositories, so the
 * round-trip is asserted against every entry of the real transcription rather
 * than a fixture. Grammar:
 *
 *   <concept>.<reference>.<ratio>.<shape>.<variant>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatCellKey,
  parseCellKey,
} from "#lib/features/spiroanim-bridge/domain/cell-key.js";

// Repo-root-relative, matching spiroanim-72-validate.test.ts. An
// `import.meta.url` base is not safe in this runner: CI resolved it to a
// non-file scheme and the suite died at import with ERR_INVALID_URL_SCHEME.
const DATA = (name: string) => resolve("docs/research/spiroanim", name);

interface TranscriptionEntry {
  concept: string;
  reference: string;
  speedRatio?: string;
  isAnti?: boolean;
  shape: string;
  word: string;
  steps: unknown[];
  /** qtr only — his quarter-spacing builder's `quarters` option (1 or 2). */
  quarters?: number;
  /** 8stp only — his eight-step builder's `reversePlane` option. */
  reversePlane?: boolean;
}

const transcription: TranscriptionEntry[] = JSON.parse(
  readFileSync(DATA("tka-transcription.json"), "utf8")
);

function isCanonicalReading(entry: TranscriptionEntry): boolean {
  if (entry.quarters !== undefined && entry.quarters !== 1) return false;
  if (entry.reversePlane !== undefined && entry.reversePlane !== false)
    return false;
  return true;
}

describe("spiroanim bridge cell keys", () => {
  it("round-trips every transcription entry", () => {
    expect(transcription.length).toBe(3312);
    for (const entry of transcription) {
      const key = formatCellKey({
        concept: entry.concept as "vtg" | "qtr" | "8stp",
        reference: entry.reference,
        speedRatio: entry.speedRatio ?? "1:1",
        shape: entry.shape,
        isAnti: entry.isAnti === true,
      });
      const parsed = parseCellKey(key);
      expect(parsed, key).not.toBeNull();
      expect(parsed!.concept).toBe(entry.concept);
      expect(parsed!.reference.toLowerCase()).toBe(
        String(entry.reference).toLowerCase()
      );
      expect(parsed!.shape).toBe(entry.shape);
      expect(parsed!.isAnti).toBe(entry.isAnti === true);
      expect(parsed!.orientation).toBeNull();
      expect(parsed!.speedRatio).toBe(
        entry.concept === "8stp" ? "1:1" : (entry.speedRatio ?? "1:1")
      );
    }
  });

  /**
   * The transcription carries two axes the five-field key does not address:
   * `quarters` (qtr only, 1 or 2) and `reversePlane` (8stp only). The bridge
   * addresses the CANONICAL reading of each cell — `quarters: 1`,
   * `reversePlane: false` — which is the same reading `cell-catalogue.json`
   * records and the only one SpiroAnim's own link builder emits. This pins
   * that collapse: 2,160 addressable keys, and every collision resolves to
   * exactly one canonical entry.
   */
  it("addresses one canonical entry per key", () => {
    const byKey = new Map<string, TranscriptionEntry[]>();
    for (const entry of transcription) {
      const key = formatCellKey({
        concept: entry.concept as "vtg" | "qtr" | "8stp",
        reference: entry.reference,
        speedRatio: entry.speedRatio ?? "1:1",
        shape: entry.shape,
        isAnti: entry.isAnti === true,
      });
      byKey.set(key, [...(byKey.get(key) ?? []), entry]);
    }
    expect(byKey.size).toBe(2160);

    const notExactlyOne = [...byKey.entries()].filter(
      ([, entries]) => entries.filter(isCanonicalReading).length !== 1
    );
    expect(notExactlyOne.map(([key]) => key)).toEqual([]);
  });

  it("rejects malformed keys", () => {
    for (const bad of [
      "",
      "vtg.9-9.1x1.diamond.base",
      "vtg.1-1.2x1.diamond.base",
      "poi.1-1.1x1.diamond.base",
      "VTG.1-1.1x1.diamond.base",
      "vtg.1-1.1x1.diamond",
      "vtg.1-1.1x1.pyramid.base",
      "vtg.1-1.1x1.diamond.wild",
      "8stp.1-aa.1x3.diamond.base",
      "8stp.1-zz.1x1.diamond.base",
      "qtr.1-aa.1x1.diamond.base",
    ]) {
      expect(parseCellKey(bad), bad).toBeNull();
    }
  });

  it("parses every bridged speed ratio and only those", () => {
    const bridged: Record<string, string> = {
      "1x1": "1:1",
      "1x2": "1:2",
      "1x3": "1:3",
      "1x4": "1:4",
      "1x5": "1:5",
      "2x3": "2:3",
      "2x5": "2:5",
    };
    for (const [token, ratio] of Object.entries(bridged)) {
      const key = `vtg.1-1.${token}.diamond.base`;
      expect(parseCellKey(key)?.speedRatio, key).toBe(ratio);
      expect(
        formatCellKey({
          concept: "qtr",
          reference: "2-5",
          speedRatio: ratio,
          shape: "diamond",
          isAnti: true,
        })
      ).toBe(`qtr.2-5.${token}.diamond.anti`);
    }
    // 2:1 is SpiroAnim's one picker ratio with no TKA reading (its prop turns
    // 45° per 90° hand arc — less than a 0-turn shift, and not a float).
    expect(parseCellKey("vtg.1-1.2x1.diamond.base")).toBeNull();
    expect(parseCellKey("vtg.1-1.1:3.diamond.base")).toBeNull();
  });

  it("ignores unknown trailing fields", () => {
    expect(parseCellKey("vtg.1-1.1x1.diamond.base.future-field")).not.toBeNull();
  });

  it("parses the orientation token on vtg/qtr keys", () => {
    for (const orientation of [-90, -45, 0, 45, 90, 180]) {
      const key = `vtg.1-1.1x1.diamond.base.o${orientation}`;
      expect(parseCellKey(key)?.orientation, key).toBe(orientation);
    }
    expect(parseCellKey("qtr.3-4.1x3.diamond.base.o-90")?.orientation).toBe(-90);
    // A key without the token carries no orientation — the resolver supplies
    // SpiroAnim's default view, not the transcription baseline.
    expect(parseCellKey("vtg.1-1.1x1.diamond.base")?.orientation).toBeNull();
    // The `o` prefix identifies the token; its position among trailing fields
    // does not matter.
    expect(
      parseCellKey("vtg.1-1.1x1.diamond.base.future-field.o90")?.orientation
    ).toBe(90);
  });

  it("rejects an orientation token with a wrong coordinate", () => {
    for (const bad of [
      "vtg.1-1.1x1.diamond.base.o30",
      "vtg.1-1.1x1.diamond.base.o-180",
      "vtg.1-1.1x1.diamond.base.o360",
      "vtg.1-1.1x1.diamond.base.o90.o180",
    ]) {
      expect(parseCellKey(bad), bad).toBeNull();
    }
  });

  it("treats an orientation token on 8stp as a foreign field", () => {
    // 8stp has no orientation axis; the token is ignored like any unknown
    // trailing field, matching what already-deployed builds do with it.
    const parsed = parseCellKey("8stp.1-aa.1x1.diamond.base.o90");
    expect(parsed).not.toBeNull();
    expect(parsed!.orientation).toBeNull();
    // Even an off-axis value is a foreign field there, not a wrong coordinate.
    expect(parseCellKey("8stp.1-aa.1x1.diamond.base.o30")).not.toBeNull();
  });

  it("formats 8stp without a speed-ratio axis", () => {
    expect(
      formatCellKey({
        concept: "8stp",
        reference: "1-AA",
        speedRatio: "1:5",
        shape: "diamond",
        isAnti: false,
      })
    ).toBe("8stp.1-aa.1x1.diamond.base");
  });
});
