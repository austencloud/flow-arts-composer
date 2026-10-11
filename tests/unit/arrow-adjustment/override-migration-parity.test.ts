/**
 * Override-migration parity gate — enumerator portion.
 *
 * Proves enumerateVariationArrows() yields one (PictographData, arrowHand)
 * pair per present motion, across diamond + box, carrying the right hand.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PictographData } from "../../../src/lib/shared/pictograph/shared/domain/models/pictograph-data";
import { GridMode } from "../../../src/lib/shared/pictograph/grid/domain/enums/grid-enums";

const getAllPictographVariations = vi.fn();

vi.mock(
  "../../../src/lib/shared/pictograph/tka-glyph/services/letter-query-handler",
  () => ({
    letterQueryHandler: {
      getAllPictographVariations: (gridMode: GridMode) =>
        getAllPictographVariations(gridMode),
    },
  })
);

// Imported after the mock is registered so it binds to the mocked singleton.
import { enumerateVariationArrows } from "../../../src/lib/features/admin/override-migration/services/variation-enumerator";

// Diamond fixture: letter P with BOTH motions present.
const diamondP = {
  letter: "P",
  motions: {
    left: { motionType: "pro" },
    right: { motionType: "anti" },
  },
} as unknown as PictographData;

// Box fixture: letter I with a single (blue-only) motion present.
const boxI = {
  letter: "I",
  motions: {
    left: { motionType: "pro" },
  },
} as unknown as PictographData;

describe("enumerateVariationArrows", () => {
  beforeEach(() => {
    getAllPictographVariations.mockReset();
    getAllPictographVariations.mockImplementation((gridMode: GridMode) =>
      Promise.resolve(gridMode === GridMode.DIAMOND ? [diamondP] : [boxI])
    );
  });

  it("loads both grid modes", async () => {
    await enumerateVariationArrows();
    expect(getAllPictographVariations).toHaveBeenCalledWith(GridMode.DIAMOND);
    expect(getAllPictographVariations).toHaveBeenCalledWith(GridMode.BOX);
  });

  it("yields one entry per present motion", async () => {
    const result = await enumerateVariationArrows();
    // P has blue+red (2) + I has blue-only (1) = 3 entries total.
    expect(result).toHaveLength(3);
  });

  it("carries the correct arrowHand per motion", async () => {
    const result = await enumerateVariationArrows();

    const pEntries = result.filter((e) => e.pictographData.letter === "P");
    expect(pEntries.map((e) => e.arrowHand).sort()).toEqual(["left", "right"]);

    const iEntries = result.filter((e) => e.pictographData.letter === "I");
    expect(iEntries).toHaveLength(1);
    expect(iEntries[0].arrowHand).toBe("left");
  });

  it("includes the known letter P", async () => {
    const result = await enumerateVariationArrows();
    expect(result.some((e) => e.pictographData.letter === "P")).toBe(true);
  });
});

// Migration engine — parity-by-construction Global → Special.
//
// Uses vi.doMock + a fresh dynamic import so this block's dependency mocks are
// scoped to it and do NOT collide with the enumerator-portion tests above
// (which import the REAL enumerator).

import { Point } from "fabric";
import type { MigrationReport } from "../../../src/lib/features/admin/override-migration/services/override-migration";

const ENGINE_PATH =
  "../../../src/lib/features/admin/override-migration/services/override-migration";

// Mutable per-test fixtures the doMock factories close over.
const globalByLetter: Record<string, { x: number; y: number }> = {};
const baseAdjustmentByLetter: Record<string, { x: number; y: number }> = {};
const repoSpies = {
  saveOverrideLocal: vi.fn(),
  deleteOverrideLocal: vi.fn(),
  saveOverride: vi.fn(async () => {}),
};
const setGlobalReadDisabledSpy = vi.fn();

async function loadEngine(): Promise<
  (opts: { dryRun: boolean }) => Promise<MigrationReport>
> {
  vi.resetModules();

  // Firestore / auth chain pulled in transitively by the real domain helpers
  // (parseSpecialOverrideKey lives in SpecialArrowPlacement which imports firestore).
  vi.doMock("#lib/shared/auth/state/authState.svelte", () => ({
    authState: { effectiveUserId: null, user: { email: "admin@test" } },
  }));
  vi.doMock("firebase/firestore", () => ({
    collection: vi.fn(),
    doc: vi.fn(),
  }));

  // 3 fixture variation-arrows: A left, B right, C left.
  vi.doMock(
    "#lib/features/admin/override-migration/services/variation-enumerator.js",
    () => ({
      enumerateVariationArrows: vi.fn(async () => [
        {
          pictographData: {
            letter: "A",
            motions: { left: { propType: "staff", hand: "left" } },
          },
          arrowHand: "left",
        },
        {
          pictographData: {
            letter: "B",
            motions: { right: { propType: "staff", hand: "right" } },
          },
          arrowHand: "right",
        },
        {
          pictographData: {
            letter: "C",
            motions: { left: { propType: "staff", hand: "left" } },
          },
          arrowHand: "left",
        },
      ]),
    })
  );

  // Canonical key: stable per-letter so parseSpecialOverrideKey round-trips.
  vi.doMock(
    "#lib/shared/pictograph/arrow/positioning/special-override/services/special-override-key.js",
    () => ({
      computeSpecialOverrideKey: vi.fn(
        (pd: { letter: string }, _m: unknown, color: string) =>
          `canonical|from_layer1|${pd.letter}|(0, 0)|pro|${color}|staff`
      ),
    })
  );

  vi.doMock(
    "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.js",
    () => ({
      arrowLocationCalculator: { calculateLocation: vi.fn(() => "n") },
    })
  );

  vi.doMock(
    "#lib/shared/pictograph/arrow/positioning/global/services/global-adjustment-singleton.js",
    () => ({
      setGlobalReadDisabled: (v: boolean) => setGlobalReadDisabledSpy(v),
      isGlobalReadDisabled: vi.fn(() => false),
    })
  );

  // A + B report global; C reports default (skipped). Verify-pass values come
  // from baseAdjustmentByLetter so a single letter can be forced to mismatch.
  vi.doMock(
    "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-adjustment-calculator.js",
    () => ({
      arrowAdjustmentCalculator: {
        getDiagnostics: vi.fn(async (pd: { letter: string }) => {
          const g = globalByLetter[pd.letter];
          return g
            ? { activeTier: "global", global: { value: g }, specialJson: null }
            : { activeTier: "default", global: null, specialJson: null };
        }),
        getBaseAdjustmentPublic: vi.fn(
          async (pd: { letter: string }) =>
            new Point(
              baseAdjustmentByLetter[pd.letter]?.x ?? 0,
              baseAdjustmentByLetter[pd.letter]?.y ?? 0
            )
        ),
      },
    })
  );

  vi.doMock(
    "#lib/shared/pictograph/arrow/positioning/special-override/services/special-override-singleton.js",
    () => ({
      getSpecialOverrideRepository: () => repoSpies,
    })
  );

  const mod = await import(ENGINE_PATH);
  return mod.runOverrideMigration;
}

describe("runOverrideMigration", () => {
  beforeEach(() => {
    repoSpies.saveOverrideLocal.mockClear();
    repoSpies.deleteOverrideLocal.mockClear();
    repoSpies.saveOverride.mockClear();
    setGlobalReadDisabledSpy.mockClear();
    globalByLetter.A = { x: 12, y: -8 };
    globalByLetter.B = { x: 5, y: 5 };
    delete globalByLetter.C;
    baseAdjustmentByLetter.A = { x: 12, y: -8 };
    baseAdjustmentByLetter.B = { x: 5, y: 5 };
  });

  it("stages only global-sourced arrows and passes parity (dryRun)", async () => {
    const runOverrideMigration = await loadEngine();
    const report = await runOverrideMigration({ dryRun: true });

    expect(report.totalArrowsScanned).toBe(3);
    expect(report.staged).toBe(2);
    expect(report.pass).toBe(2);
    expect(report.fail).toBe(0);

    expect(repoSpies.saveOverrideLocal).toHaveBeenCalledTimes(2);
    expect(repoSpies.saveOverride).not.toHaveBeenCalled();
    expect(repoSpies.deleteOverrideLocal).toHaveBeenCalledTimes(2);
    expect(setGlobalReadDisabledSpy).toHaveBeenCalledWith(true);
    expect(setGlobalReadDisabledSpy).toHaveBeenLastCalledWith(false);
  });

  it("persists every row via saveOverride when parity is clean (dryRun=false)", async () => {
    const runOverrideMigration = await loadEngine();
    const report = await runOverrideMigration({ dryRun: false });

    expect(report.staged).toBe(2);
    expect(report.fail).toBe(0);
    expect(repoSpies.saveOverride).toHaveBeenCalledTimes(2);
    expect(repoSpies.deleteOverrideLocal).not.toHaveBeenCalled();
  });

  it("flags a parity failure and aborts the write (dryRun=false throws)", async () => {
    baseAdjustmentByLetter.B = { x: 999, y: 999 };
    const runOverrideMigration = await loadEngine();

    await expect(runOverrideMigration({ dryRun: false })).rejects.toThrow(
      "Parity failures present; aborting write"
    );

    expect(repoSpies.saveOverride).not.toHaveBeenCalled();
    expect(repoSpies.deleteOverrideLocal).toHaveBeenCalledTimes(2);
  });

  it("reports the parity failure count in dryRun without throwing", async () => {
    baseAdjustmentByLetter.A = { x: 0, y: 0 };
    const runOverrideMigration = await loadEngine();

    const report = await runOverrideMigration({ dryRun: true });
    expect(report.staged).toBe(2);
    expect(report.fail).toBe(1);
    expect(report.pass).toBe(1);
    const failedRow = report.rows.find((r) => r.parity === "fail");
    expect(failedRow?.letter).toBe("A");
    expect(failedRow?.note).toContain("global=(12,-8)");
  });
});
