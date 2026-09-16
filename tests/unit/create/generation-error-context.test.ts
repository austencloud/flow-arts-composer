import { describe, expect, it } from "vitest";
import { captureGenerationErrorContext } from "$lib/shared/create/utils/generation-error-context";
import { buildErrorCopyText } from "$lib/shared/error/domain/error-report-text";
import type { GenerationOptions } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { UIGenerationConfig } from "$lib/shared/create/utils/config-mapper";
import type { AppError } from "$lib/shared/error/domain/error-models";

describe("generation error reports", () => {
  const request = () =>
    ({
      mode: "circular",
      length: 8,
      gridMode: "diamond",
      difficulty: "advanced",
      propType: "fan",
      constraintPreset: "smooth",
      handPathMode: "smooth",
      motionTypeFilter: "no-dash",
      turnIntensity: 1.5,
      handRelationship: "mirrored",
      handRelationshipInverted: true,
      matchHandTurns: false,
      startPlacementId: "alpha1",
      blockedStartPlacements: ["beta1", "gamma3"],
      endPlacements: ["alpha3", "alpha7"],
      mustContainLetters: ["A"],
      mustNotContainLetters: [],
      leftStartOrientation: "out",
      rightStartOrientation: "clock",
      word: "AB",
      loopType: "rotated",
      period: "quartered",
      turnPattern: { left: [0, 1.5], right: [1, 0] },
      loopSpec: { left: { components: new Map([["rotated", { period: 4 }]]) } },
      loopSpecWire: { left: { components: { rotated: { period: 4 } } } },
    }) as unknown as GenerationOptions;

  it("keeps every supplied request and UI field, including nested Customize settings", () => {
    const options = request();
    const uiConfig = {
      durationTemplateId: "swing",
      spellTargetLength: 8,
      reflectionAxis: "vertical",
      inversionInterval: 4,
      inversionMode: "overlay",
    } as UIGenerationConfig;
    const snapshot = captureGenerationErrorContext(options, uiConfig);
    expect(Object.keys(snapshot)).toEqual(
      expect.arrayContaining(Object.keys(options))
    );
    expect(snapshot).toMatchObject({
      handRelationship: "mirrored",
      handRelationshipInverted: true,
      matchHandTurns: false,
      startPlacementId: "alpha1",
      endPlacements: ["alpha3", "alpha7"],
      leftStartOrientation: "out",
      rightStartOrientation: "clock",
      turnPattern: options.turnPattern,
      loopSpecWire: options.loopSpecWire,
      loopSpec: { left: { components: { rotated: { period: 4 } } } },
      uiConfig,
    });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("freezes the failed attempt's values before settings can change", () => {
    const options = request();
    const snapshot = captureGenerationErrorContext(options);
    options.endPlacements!.length = 0;
    options.blockedStartPlacements!.length = 0;
    expect(snapshot.endPlacements).toEqual(["alpha3", "alpha7"]);
    expect(snapshot.blockedStartPlacements).toEqual(["beta1", "gamma3"]);
  });

  it("copies nested configuration, false, zero, null, and empty lists without losing data", () => {
    const context = captureGenerationErrorContext({
      ...request(),
      turnIntensity: 0,
      motionTypeFilter: null,
    });
    const error: AppError = {
      id: "test",
      message: "Sequence generation failed",
      severity: "error",
      reportable: true,
      timestamp: new Date(0),
      technicalDetails: "No reachable placements",
      stack: "Error: No reachable placements",
      context: {
        module: "create",
        tab: "generate",
        action: "generateSequence",
        additionalData: context,
      },
    };
    const report = buildErrorCopyText(error);
    for (const text of [
      '"rotated"',
      '"period": 4',
      '"left"',
      "Match Hand Turns: false",
      "Turn Intensity: 0",
      "Motion Type Filter: null",
      "Must Not Contain Letters: []",
      "End Placements: alpha3, alpha7",
      "Left Start Orientation: out",
      "Tab: generate",
      "No reachable placements",
    ])
      expect(report).toContain(text);
    expect(report).not.toContain("[object Object]");
  });
});
