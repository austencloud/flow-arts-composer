/**
 * The SpiroAnim bridge resolver: cellKey → hydrated SequenceData.
 *
 * This is the heavyweight proof for the bridge. Every addressable cell in the
 * transcription is resolved through the real pipeline — real pictograph
 * dataframes, the real turn/orientation algebra, the real sequence hydrator —
 * and three independent invariants are checked per cell:
 *
 *   1. the hydrator's DERIVED word equals the word SpiroAnim transcribed
 *      (the letters were recovered from motions, not copied over);
 *   2. the step count survives;
 *   3. the per-hand orientation chain is continuous and each step's end
 *      orientation is what `calculateEndOrientation` says it is.
 *
 * Invariant 1 is the load-bearing one: it can only pass if the resolver picked
 * the right dataframe row for every step of every addressable cell.
 *
 * A fourth check pins the per-hand turns to the transcription, because the
 * derived word alone cannot see them: a 1:3 cell and a 1:4 cell share a word
 * and differ only by half a turn per step.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  formatCellKey,
  parseCellKey,
  type BridgeConcept,
} from "$lib/features/spiroanim-bridge/domain/cell-key";
import {
  getReturnLink,
  type DeepLinkMap,
} from "$lib/features/spiroanim-bridge/domain/return-links";
import {
  resolveCell,
  type TranscriptionEntry,
} from "$lib/features/spiroanim-bridge/services/resolve-cell";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";

// Repo-root-relative, matching spiroanim-72-validate.test.ts. An
// `import.meta.url` base is not safe in this runner: CI resolved it to a
// non-file scheme and the suite died at import with ERR_INVALID_URL_SCHEME.
const DATA = (name: string) => resolve("docs/research/spiroanim", name);

const transcription: TranscriptionEntry[] = JSON.parse(
  readFileSync(DATA("tka-transcription.json"), "utf8")
);

/**
 * The pictograph dataframes are fetched at runtime, never bundled. jsdom has no
 * server to fetch from, so the loader's `window.csvData` pre-injection path
 * feeds it the real files — same idiom as fused-word-derivation.test.ts. A stub
 * would defeat the point of this suite.
 */
function injectRealCsvData(): void {
  const read = (file: string) =>
    readFileSync(resolve("static/data/pictographs", file), "utf8");
  Object.assign(window, {
    csvData: {
      diamondData: read("DiamondPictographDataframe.csv"),
      boxData: read("BoxPictographDataframe.csv"),
      skewedData: read("SkewedPictographDataframe.csv"),
    },
  });
}

function keyOf(entry: TranscriptionEntry): string {
  return formatCellKey({
    concept: entry.concept as BridgeConcept,
    reference: entry.reference,
    speedRatio: entry.speedRatio ?? "1:1",
    shape: entry.shape,
    isAnti: entry.isAnti === true,
  });
}

/** The reading the five-field key addresses — see cell-key.ts. */
function isCanonicalReading(entry: TranscriptionEntry): boolean {
  if (entry.quarters !== undefined && entry.quarters !== 1) return false;
  if (entry.reversePlane !== undefined && entry.reversePlane !== false)
    return false;
  return true;
}

const addressable = new Map<string, TranscriptionEntry>();
for (const entry of transcription) {
  if (!isCanonicalReading(entry)) continue;
  const key = keyOf(entry);
  if (!addressable.has(key)) addressable.set(key, entry);
}

beforeAll(() => {
  injectRealCsvData();
});

describe("spiroanim bridge resolver", () => {
  it(
    "resolves every addressable cell to its transcribed sequence",
    async () => {
      expect(addressable.size).toBe(2160);

      const failures: string[] = [];
      for (const [key, entry] of addressable) {
        const resolved = await resolveCell(key, transcription);
        if (!resolved) {
          failures.push(`${key}: resolved to null`);
          continue;
        }
        const { sequence } = resolved;

        if (sequence.word !== entry.word) {
          failures.push(
            `${key}: derived word ${sequence.word} !== transcribed ${entry.word}`
          );
        }
        if (sequence.steps.length !== entry.steps.length) {
          failures.push(
            `${key}: ${sequence.steps.length} steps !== ${entry.steps.length}`
          );
        }

        for (const color of [HandSide.LEFT, HandSide.RIGHT]) {
          for (const [index, step] of sequence.steps.entries()) {
            const motion = step.motions?.[color];
            if (!motion) {
              failures.push(`${key} step${index + 1} ${color}: no motion`);
              break;
            }
            const transcribed = entry.steps[index];
            const expectedTurns =
              color === HandSide.LEFT
                ? transcribed?.blueTurns
                : transcribed?.redTurns;
            if (motion.turns !== expectedTurns) {
              failures.push(
                `${key} step${index + 1} ${color}: turns ${String(motion.turns)} !== transcribed ${String(expectedTurns)}`
              );
            }
            const expected = calculateEndOrientation(motion, color);
            if (motion.endOrientation !== expected) {
              failures.push(
                `${key} step${index + 1} ${color}: endOrientation ` +
                  `${motion.endOrientation} !== calculated ${expected}`
              );
            }
            if (index === 0) continue;
            const previous = sequence.steps[index - 1]?.motions?.[color];
            if (previous?.endOrientation !== motion.startOrientation) {
              failures.push(
                `${key} step${index}->${index + 1} ${color}: orientation break`
              );
            }
            if (previous?.endLocation !== motion.startLocation) {
              failures.push(
                `${key} step${index}->${index + 1} ${color}: location break`
              );
            }
          }
        }
      }

      console.log(
        `resolved cells: ${addressable.size}, failures: ${failures.length}`
      );
      if (failures.length) console.log(failures.slice(0, 20).join("\n"));
      expect(failures).toEqual([]);
    },
    600_000
  );

  it("returns null for a malformed key", async () => {
    expect(await resolveCell("vtg.9-9.1x1.diamond.base", transcription)).toBeNull();
    expect(await resolveCell("", transcription)).toBeNull();
  });

  it("returns null for a well-formed key with no transcription entry", async () => {
    // The 8-step catalogue has no anti variant — the key parses, the cell does
    // not exist. The route shows its honest "no bridge entry" card.
    expect(addressable.has("8stp.1-aa.1x1.diamond.anti")).toBe(false);
    expect(
      await resolveCell("8stp.1-aa.1x1.diamond.anti", transcription)
    ).toBeNull();
  });

  it("carries the transcription entry for provenance", async () => {
    const resolved = await resolveCell("vtg.1-1.1x1.diamond.base", transcription);
    expect(resolved).not.toBeNull();
    expect(resolved!.entry.concept).toBe("vtg");
    expect(resolved!.entry.reference).toBe("1-1");
    expect(resolved!.sequence.startPlacement).toBeTruthy();
  });
});

/**
 * Orientation translation. The transcription was captured at SpiroAnim pattern
 * orientation -90; SpiroAnim's live default is per ratio — 0 for 1:1, 1:3 and
 * 1:5, -90 for 1:2, 1:4, 2:3 and 2:5. A plain odd-ratio key therefore renders
 * the transcription rotated 90° clockwise, a plain even/two-cycle key renders
 * it as captured, and an `o` token requests any of the six views. Verified
 * against his compiler (2026-08-30): +45° of orientation = one compass step
 * clockwise for every hand.
 */
describe("spiroanim bridge orientation translation", () => {
  const positionsOf = (steps: readonly { startPlacement: unknown; endPlacement: unknown }[]) =>
    steps.map((step) => `${step.startPlacement}>${step.endPlacement}`);

  it("renders the default view 90° clockwise of the transcription", async () => {
    // vtg 3-4 @ 1:3 is the cell Austen reported: KEKE, transcribed as
    // alpha7>beta5>alpha3>beta1>alpha7. One compass step per 45°, so the
    // 0-orientation default sits two steps clockwise of the -90 capture.
    const resolved = await resolveCell("vtg.3-4.1x3.diamond.base", transcription);
    expect(resolved).not.toBeNull();
    expect(positionsOf(resolved!.sequence.steps)).toEqual([
      "alpha1>beta7",
      "beta7>alpha5",
      "alpha5>beta3",
      "beta3>alpha1",
    ]);
    expect(resolved!.sequence.word).toBe("KEKE");
    expect(resolved!.sequence.metadata?.spiroanimOrientation).toBe(0);
  });

  it("reproduces the transcription exactly at o-90", async () => {
    const resolved = await resolveCell(
      "vtg.3-4.1x3.diamond.base.o-90",
      transcription
    );
    expect(resolved).not.toBeNull();
    expect(positionsOf(resolved!.sequence.steps)).toEqual(
      positionsOf(resolved!.entry.steps)
    );
    expect(resolved!.sequence.metadata?.spiroanimOrientation).toBe(-90);
  });

  it("renders an even-denominator ratio's default view as captured", async () => {
    // vtg 3-4 @ 1:4 shares 1:3's hand paths; SpiroAnim's default view for it
    // is -90, which IS the capture orientation, so a plain key rotates nothing.
    const resolved = await resolveCell("vtg.3-4.1x4.diamond.base", transcription);
    expect(resolved).not.toBeNull();
    expect(positionsOf(resolved!.sequence.steps)).toEqual(
      positionsOf(resolved!.entry.steps)
    );
    expect(resolved!.sequence.word).toBe("KEKE");
    expect(resolved!.sequence.metadata?.spiroanimOrientation).toBe(-90);
    for (const step of resolved!.sequence.steps) {
      expect(step.motions?.[HandSide.LEFT]?.turns).toBe(1.5);
      expect(step.motions?.[HandSide.RIGHT]?.turns).toBe(1.5);
    }
  });

  it("carries a two-cycle ratio as its doubled word with quarter turns", async () => {
    // vtg 1-1 @ 2:3 repeats 1:3's four-step hand path twice (his compiler
    // emits 17 frames for a two-cycle ratio) and turns 0.25 per step.
    const resolved = await resolveCell("vtg.1-1.2x3.diamond.base", transcription);
    expect(resolved).not.toBeNull();
    expect(resolved!.sequence.steps).toHaveLength(8);
    expect(resolved!.sequence.word).toBe("HHHHHHHH");
    expect(resolved!.sequence.metadata?.spiroanimOrientation).toBe(-90);
    for (const step of resolved!.sequence.steps) {
      expect(step.motions?.[HandSide.LEFT]?.turns).toBe(0.25);
      expect(step.motions?.[HandSide.RIGHT]?.turns).toBe(0.25);
    }
  });

  it("rotates qtr gamma cells the same way", async () => {
    // qtr 3-4 @ 1:3: NQNQ, transcribed gamma15>gamma5>gamma11>gamma1. At the
    // default view (+2 steps clockwise): gamma15(N,W)→(E,N)=gamma9,
    // gamma5(E,S)→(S,W)=gamma7, gamma11(S,E)→(W,S)=gamma13,
    // gamma1(W,N)→(N,E)=gamma3.
    const resolved = await resolveCell("qtr.3-4.1x3.diamond.base", transcription);
    expect(resolved).not.toBeNull();
    expect(positionsOf(resolved!.sequence.steps)).toEqual([
      "gamma9>gamma7",
      "gamma7>gamma13",
      "gamma13>gamma3",
      "gamma3>gamma9",
    ]);
    expect(resolved!.sequence.word).toBe("NQNQ");
  });

  it("never rotates 8stp and ignores its foreign orientation token", async () => {
    const plain = await resolveCell("8stp.1-aa.1x1.diamond.base", transcription);
    const tokened = await resolveCell(
      "8stp.1-aa.1x1.diamond.base.o90",
      transcription
    );
    expect(plain).not.toBeNull();
    expect(tokened).not.toBeNull();
    expect(positionsOf(tokened!.sequence.steps)).toEqual(
      positionsOf(plain!.sequence.steps)
    );
    expect(positionsOf(plain!.sequence.steps)).toEqual(
      positionsOf(plain!.entry.steps)
    );
    expect(plain!.sequence.metadata?.spiroanimOrientation).toBeUndefined();
  });

  it(
    "resolves every vtg/qtr cell at the 45° view (box-grid positions)",
    async () => {
      // 45° rotations land every hand on intercardinal points, so this sweep
      // proves the Box dataframe covers the whole rotated corpus. The other
      // intercardinal views (o-45, o135-equivalent o180±45) are 90° rotations
      // of these rows within the same frame.
      const failures: string[] = [];
      let checked = 0;
      for (const [key, entry] of addressable) {
        if (key.startsWith("8stp.")) continue;
        checked++;
        const resolved = await resolveCell(`${key}.o45`, transcription);
        if (!resolved) {
          failures.push(`${key}.o45: resolved to null`);
          continue;
        }
        if (resolved.sequence.word !== entry.word) {
          failures.push(
            `${key}.o45: derived word ${resolved.sequence.word} !== transcribed ${entry.word}`
          );
        }
      }
      console.log(`o45 cells checked: ${checked}, failures: ${failures.length}`);
      if (failures.length) console.log(failures.slice(0, 20).join("\n"));
      expect(checked).toBe(2016);
      expect(failures).toEqual([]);
    },
    600_000
  );
});

/**
 * The trip back. `vtg-qtr-deep-links.json` is generated in the SpiroAnim repo
 * with his own codec at its current version and vendored here; the 8-Step map
 * is the legacy v6 export. Without the vtg/qtr artifact the coverage sweep has
 * nothing to measure, so it skips loudly rather than passing vacuously.
 */
const VTG_QTR_LINKS_PATH = DATA("vtg-qtr-deep-links.json");
const hasVtgQtrLinks = existsSync(VTG_QTR_LINKS_PATH);

const linkSources = {
  vtgQtr: hasVtgQtrLinks
    ? (JSON.parse(readFileSync(VTG_QTR_LINKS_PATH, "utf8")) as DeepLinkMap)
    : null,
  eightStep: JSON.parse(
    readFileSync(DATA("eightstep-deep-links.json"), "utf8")
  ) as DeepLinkMap,
};

describe("spiroanim bridge return links", () => {
  it.skipIf(!hasVtgQtrLinks)(
    "covers every diamond cell in the catalogue",
    () => {
      const missing: string[] = [];
      let checked = 0;
      for (const key of addressable.keys()) {
        const parsed = parseCellKey(key);
        if (!parsed || parsed.shape !== "diamond") continue;
        checked++;
        const link = getReturnLink(parsed, linkSources);
        if (!link) missing.push(key);
        else expect(link.startsWith("https://spiroanim.com/player?")).toBe(true);
      }
      console.log(`return links checked: ${checked}, missing: ${missing.length}`);
      expect(checked).toBe(1080);
      expect(missing).toEqual([]);
    }
  );

  it("omits a link it does not have rather than inventing one", () => {
    // Box cells were never exported — his VTG/QTR catalogue is diamond-only.
    expect(getReturnLink(parseCellKey("vtg.1-1.1x1.box.base")!, linkSources)).toBeNull();
    // The 8-Step export has no anti variant.
    expect(
      getReturnLink(parseCellKey("8stp.1-aa.1x1.diamond.anti")!, linkSources)
    ).toBeNull();
    // No vendored data at all is a missing link, not a crash.
    expect(
      getReturnLink(parseCellKey("vtg.1-1.1x1.diamond.base")!, {})
    ).toBeNull();
  });

  it("reads the legacy 8-Step map by its uppercase row label", () => {
    const link = getReturnLink(
      parseCellKey("8stp.1-aa.1x1.diamond.base")!,
      linkSources
    );
    expect(link).toBe(linkSources.eightStep["1-AA"]);
    expect(link?.startsWith("https://spiroanim.com/player?")).toBe(true);
  });

  it("refuses a vendored value that is not a player URL", () => {
    expect(
      getReturnLink(parseCellKey("vtg.1-1.1x1.diamond.base")!, {
        vtgQtr: { "vtg.1-1.1x1.diamond.base": "javascript:alert(1)" },
      })
    ).toBeNull();
  });
});
