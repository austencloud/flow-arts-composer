import { describe, expect, it } from "vitest";
import {
  captureSetupSnapshot,
  setupSnapshotsEqual,
  type SetupSnapshot,
} from "../setup-snapshot";
import { GenerationMode } from "../../shared/domain/models/generate-models";
import type { UIGenerationConfig } from "../../state/generate-config.svelte";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";

const baseConfig = (): UIGenerationConfig =>
  ({
    mode: GenerationMode.FREEFORM,
    loopEnabled: false,
    length: 8,
    level: 2,
    turnIntensity: 1,
    gridMode: "diamond",
    propContinuity: "continuous",
    period: "halved",
    loopType: "rotated",
    constraintPreset: "smooth",
    handPathMode: "smooth",
    motionTypeFilter: null,
    durationTemplateId: null,
    spellTargetLength: null,
  }) as unknown as UIGenerationConfig;

const baseStartEnd = (): StartEndOptions =>
  ({
    blockedStartPlacements: ["alpha1", "beta3"],
    startPlacement: null,
    endPlacement: null,
    mustContainLetters: ["A", "B"],
    mustNotContainLetters: [],
    leftStartOrientation: "in",
    rightStartOrientation: "in",
  }) as unknown as StartEndOptions;

function snap(
  config = baseConfig(),
  startEnd: StartEndOptions | null = baseStartEnd()
): SetupSnapshot {
  return captureSetupSnapshot(config, startEnd);
}

describe("setupSnapshotsEqual", () => {
  it("ignores object key order", () => {
    const a = snap();
    const reordered = JSON.parse(
      JSON.stringify(a.config, Object.keys(a.config).sort().reverse())
    ) as UIGenerationConfig;
    expect(setupSnapshotsEqual(a, snap(reordered))).toBe(true);
  });

  it("treats undefined object values as absent", () => {
    const withUndefined = { ...baseConfig(), reflectionAxis: undefined };
    expect(setupSnapshotsEqual(snap(withUndefined), snap(baseConfig()))).toBe(
      true
    );
  });

  it("normalizes absent and undefined start/end options to null", () => {
    expect(
      setupSnapshotsEqual(
        captureSetupSnapshot(baseConfig(), undefined),
        captureSetupSnapshot(baseConfig(), null)
      )
    ).toBe(true);
  });

  it("compares reordered set-semantics arrays as equal", () => {
    const shuffled = {
      ...baseStartEnd(),
      blockedStartPlacements: ["beta3", "alpha1"],
      mustContainLetters: ["B", "A"],
    } as unknown as StartEndOptions;
    expect(setupSnapshotsEqual(snap(baseConfig(), shuffled), snap())).toBe(
      true
    );
  });

  it("detects nested config changes", () => {
    const changed = { ...baseConfig(), level: 3 } as UIGenerationConfig;
    expect(setupSnapshotsEqual(snap(changed), snap())).toBe(false);
  });

  it("keeps a setup saved during spell mode active immediately after apply", () => {
    const spellLive = {
      ...baseConfig(),
      mode: GenerationMode.SPELL,
      spellTargetLength: 6,
    } as unknown as UIGenerationConfig;
    const saved = captureSetupSnapshot(spellLive, baseStartEnd());
    const liveAfterApply = captureSetupSnapshot(
      {
        ...saved.config,
        mode: GenerationMode.FREEFORM,
        spellTargetLength: null,
      },
      baseStartEnd()
    );

    expect(setupSnapshotsEqual(saved, liveAfterApply)).toBe(true);
    expect(saved.config.spellTargetLength).toBeNull();
    expect(saved.config.mode).toBe(GenerationMode.FREEFORM);
  });
});
