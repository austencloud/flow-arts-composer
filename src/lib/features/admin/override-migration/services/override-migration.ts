/**
 * Override Migration Engine — parity-by-construction Global → Special.
 *
 * Replays every pictograph variation through the REAL render code paths
 * (the same arrowAdjustmentCalculator the renderer uses), so each migrated
 * override is written under exactly the key the renderer reads. The verify
 * pass disables the Global render-read and re-resolves each staged arrow,
 * asserting the post-migration value is pixel-identical to the Global value
 * being migrated. write-key === read-key by construction.
 *
 * dryRun=true  → stage + verify in memory, write NOTHING to Firestore, clean up.
 * dryRun=false → after a 100%-parity staging, persist every row via saveOverride.
 */

import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { enumerateVariationArrows } from "./variation-enumerator";
import { computeSpecialOverrideKey } from "#lib/shared/pictograph/arrow/positioning/special-override/services/special-override-key.js";
import { parseSpecialOverrideKey } from "#lib/shared/pictograph/arrow/positioning/special-override/domain/special-arrow-placement.js";
import type { SpecialArrowPlacementInput } from "#lib/shared/pictograph/arrow/positioning/special-override/domain/special-arrow-placement.js";
import { arrowAdjustmentCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-adjustment-calculator.js";
import { arrowLocationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.js";
import { setGlobalReadDisabled } from "#lib/shared/pictograph/arrow/positioning/global/services/global-adjustment-singleton.js";
import { getSpecialOverrideRepository } from "#lib/shared/pictograph/arrow/positioning/special-override/services/special-override-singleton.js";
import type { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

export interface MigrationRow {
  key: string;
  propType: string;
  letter: string;
  arrowHand: HandSide;
  value: { x: number; y: number }; // the Global value being migrated
  original: { x: number; y: number }; // static-JSON baseline, for the trace's struck-through "original"
  parity: "pass" | "fail";
  note?: string;
}

export interface MigrationReport {
  totalArrowsScanned: number;
  staged: number; // distinct keys staged for migration
  pass: number;
  fail: number;
  rows: MigrationRow[];
}

interface StagedSource {
  pictographData: PictographData;
  motion: MotionData;
  arrowHand: HandSide;
  letter: string;
}

/** Build the persistence input from a staged row. The 7 key fields come from the
 *  canonical key itself (so write-input fields exactly match the key the renderer
 *  reads); the adjustment is the Global value, original is the static-JSON baseline. */
function buildInput(row: MigrationRow): SpecialArrowPlacementInput | null {
  const fields = parseSpecialOverrideKey(row.key);
  if (!fields) return null;
  return {
    placementFrame: fields.placementFrame,
    oriFolder: fields.oriFolder,
    letter: fields.letter,
    turnsTuple: fields.turnsTuple,
    motionType: fields.motionType,
    attributeKey: fields.attributeKey,
    propType: fields.propType,
    adjustmentX: row.value.x,
    adjustmentY: row.value.y,
    originalX: row.original.x,
    originalY: row.original.y,
  };
}

export async function runOverrideMigration(opts: {
  dryRun: boolean;
}): Promise<MigrationReport> {
  const repo = getSpecialOverrideRepository();
  if (!repo) {
    throw new Error(
      "Special override repository is not initialized; cannot run migration"
    );
  }

  const arrows = await enumerateVariationArrows();
  const totalArrowsScanned = arrows.length;

  const staged = new Map<string, MigrationRow>();
  const sources = new Map<string, StagedSource>();

  // --- Stage pass: probe every variation arrow through the real pipeline ---
  for (const { pictographData, arrowHand } of arrows) {
    const motion = pictographData.motions[arrowHand];
    if (!motion) continue;
    const letter = pictographData.letter;
    if (!letter) continue;

    const location = arrowLocationCalculator.calculateLocation(
      motion,
      pictographData
    );
    const diag = await arrowAdjustmentCalculator.getDiagnostics(
      pictographData,
      motion,
      letter,
      location,
      arrowHand
    );

    // Only Global-sourced arrows migrate. Special-json / prop-geometry / default
    // sources already render from non-Global data and need no migration.
    if (diag.activeTier !== "global" || !diag.global) continue;

    const value = { x: diag.global.value.x, y: diag.global.value.y };
    const key = computeSpecialOverrideKey(pictographData, motion, arrowHand);
    const original = diag.specialJson?.value
      ? { x: diag.specialJson.value.x, y: diag.specialJson.value.y }
      : { x: 0, y: 0 };

    const existing = staged.get(key);
    if (existing) {
      // Guard: the same canonical key resolved two different Global values.
      // This should never happen — flag it rather than silently overwrite.
      if (
        Math.round(existing.value.x) !== Math.round(value.x) ||
        Math.round(existing.value.y) !== Math.round(value.y)
      ) {
        existing.parity = "fail";
        existing.note = "conflicting global values for one key";
      }
      continue;
    }

    staged.set(key, {
      key,
      propType: motion.propType?.toLowerCase() || "staff",
      letter,
      arrowHand,
      value,
      original,
      parity: "pass",
    });
    sources.set(key, { pictographData, motion, arrowHand, letter });
  }

  for (const row of staged.values()) {
    const input = buildInput(row);
    if (!input) {
      row.parity = "fail";
      row.note = "unparseable override key";
      continue;
    }
    repo.saveOverrideLocal(input);
  }

  // --- Verify pass (parity gate): re-resolve with Global read disabled ---
  try {
    setGlobalReadDisabled(true);
    for (const row of staged.values()) {
      if (row.parity === "fail") continue; // already flagged (conflict / unparseable)
      const src = sources.get(row.key);
      if (!src) {
        row.parity = "fail";
        row.note = "missing staged source for verify";
        continue;
      }
      const resolved = await arrowAdjustmentCalculator.getBaseAdjustmentPublic(
        src.pictographData,
        src.motion,
        src.letter,
        src.arrowHand
      );
      const rx = Math.round(resolved.x);
      const ry = Math.round(resolved.y);
      const vx = Math.round(row.value.x);
      const vy = Math.round(row.value.y);
      if (rx === vx && ry === vy) {
        row.parity = "pass";
      } else {
        row.parity = "fail";
        row.note = `global=(${vx},${vy}) special=(${rx},${ry})`;
      }
    }
  } finally {
    setGlobalReadDisabled(false);
  }

  const rows = [...staged.values()];
  const pass = rows.filter((r) => r.parity === "pass").length;
  const fail = rows.filter((r) => r.parity === "fail").length;

  // --- Persist or clean up ---
  if (opts.dryRun) {
    // Leave the running app untouched: remove every in-memory staging.
    for (const key of staged.keys()) {
      repo.deleteOverrideLocal(key);
    }
  } else {
    if (fail > 0) {
      // Abort the write, but still clean up the in-memory staging.
      for (const key of staged.keys()) {
        repo.deleteOverrideLocal(key);
      }
      throw new Error("Parity failures present; aborting write");
    }
    for (const row of rows) {
      const input = buildInput(row);
      if (!input) continue;
      await repo.saveOverride(input);
    }
  }

  return {
    totalArrowsScanned,
    staged: rows.length,
    pass,
    fail,
    rows,
  };
}
