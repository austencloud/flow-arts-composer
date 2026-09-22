import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
} from "$lib/shared/animation-engine/domain/types/trail-types";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { capturePresentation } from "$lib/shared/foundation/services/presentation-intent";
import { resolveViewingPresentation } from "$lib/shared/sequence-preview/services/viewing-presentation";

const recorded = capturePresentation({
  primaryPropColors: { left: "#111111", right: "#222222" },
  trail: { ...DEFAULT_TRAIL_SETTINGS, mode: TrailMode.PERSISTENT },
  effects: {
    ...structuredClone(DEFAULT_EFFECTS_CONFIG),
    tipEffectMap: { "*": { effect: "fire" } },
  },
});

describe("resolveViewingPresentation", () => {
  it("returns the recorded look for a recorded sequence", () => {
    const value = resolveViewingPresentation({
      id: "s1",
      creatorIntent: { presentation: recorded },
    } as unknown as SequenceData);
    expect(value.primaryPropColors).toEqual({
      left: "#111111",
      right: "#222222",
    });
    expect(value.trail.mode).toBe(TrailMode.PERSISTENT);
    expect(value.effects.tipEffectMap).toEqual({ "*": { effect: "fire" } });
  });

  it("returns neutral for null, absent, legacy, and no sequence", () => {
    const neutralCases = [
      null,
      { id: "a" },
      { id: "b", creatorIntent: null },
      { id: "c", creatorIntent: { presentation: null } },
      {
        id: "d",
        intendedProp: {
          leftPropType: "staff",
          rightPropType: "staff",
          catDogMode: false,
        },
      },
    ] as unknown as (SequenceData | null)[];
    for (const sequence of neutralCases) {
      const value = resolveViewingPresentation(sequence);
      expect(value.primaryPropColors).toBeNull();
      expect(value.trail).toEqual(DEFAULT_TRAIL_SETTINGS);
      expect(value.effects).toEqual(DEFAULT_EFFECTS_CONFIG);
    }
  });

  it("returns a fresh neutral object per call so callers can mutate safely", () => {
    const a = resolveViewingPresentation(null);
    const b = resolveViewingPresentation(null);
    expect(a.trail).not.toBe(b.trail);
    expect(a.effects).not.toBe(b.effects);
  });

  it("returns a fresh recorded object per call and never aliases the stored snapshot", () => {
    const sequence = {
      id: "s1",
      creatorIntent: { presentation: recorded },
    } as unknown as SequenceData;
    const a = resolveViewingPresentation(sequence);
    const b = resolveViewingPresentation(sequence);
    expect(a.trail).not.toBe(b.trail);
    expect(a.effects).not.toBe(b.effects);
    expect(a.effects.tipEffectMap).not.toBe(recorded.effects.tipEffectMap);
    a.trail.mode = TrailMode.OFF;
    expect(resolveViewingPresentation(sequence).trail.mode).toBe(
      TrailMode.PERSISTENT
    );
  });

  it("returns neutral for a malformed snapshot", () => {
    const value = resolveViewingPresentation({
      id: "bad",
      creatorIntent: { presentation: { trail: "x", effects: 1 } },
    } as unknown as SequenceData);
    expect(value.primaryPropColors).toBeNull();
    expect(value.trail).toEqual(DEFAULT_TRAIL_SETTINGS);
    expect(value.effects).toEqual(DEFAULT_EFFECTS_CONFIG);
  });
});
