import { describe, it, expect, vi } from "vitest";
import {
  computeDisplaySummary,
  computeEffectsSummary,
  computePlaybackSummary,
  computeExportSummary,
  type DisplayFlags,
} from "$lib/shared/animation-panel/pill-nav/pill-summaries";

const allOff: DisplayFlags = {
  tkaGlyph: false,
  elementalGlyph: false,
  propElementalGlyph: false,
  stepNumbers: false,
  props: false,
  wordHeader: false,
  mandala: false,
  pathLines: false,
  grid: false,
};

const allOn: DisplayFlags = {
  tkaGlyph: true,
  elementalGlyph: true,
  propElementalGlyph: true,
  stepNumbers: true,
  props: true,
  wordHeader: true,
  mandala: true,
  pathLines: true,
  grid: true,
};

describe("computeDisplaySummary", () => {
  it("reports 0 / 9 visible when everything is off", () => {
    expect(computeDisplaySummary(allOff)).toBe("0 / 9 visible");
  });

  it("reports 9 / 9 visible when every flag including grid is on", () => {
    expect(computeDisplaySummary(allOn)).toBe("9 / 9 visible");
  });

  it("counts grid as a regular flag", () => {
    expect(computeDisplaySummary({ ...allOff, grid: true })).toBe(
      "1 / 9 visible"
    );
  });

  it("does not count a progress-bar flag", () => {
    // The transport is unconditional now, so the Display page offers no
    // progress switch and must not claim one in its denominator.
    expect(Object.keys(allOff)).not.toContain("progressBar");
  });

  it("says nothing about path shape", () => {
    // Path shape is motion behavior and lives under the Motion pill. The
    // Display summary describing it was a leftover from the era when the two
    // shared a section.
    expect(computeDisplaySummary(allOn)).not.toMatch(
      /arc|linear|concave|motion/i
    );
  });

  it("counts each visibility flag independently", () => {
    expect(
      computeDisplaySummary({ ...allOff, tkaGlyph: true, props: true })
    ).toBe("2 / 9 visible");
  });

  it("denominator follows DisplayFlags arity (regression guard)", () => {
    // If someone adds a field to DisplayFlags without updating allOff, this
    // test will fail because Object.values(...).length will jump to 10.
    expect(Object.keys(allOff).length).toBe(9);
  });
});

describe("computeEffectsSummary", () => {
  const labels = { trails: "Trails", fire: "Fire", zap: "Zap" };

  it("returns 'Off' when the active effect id is 'none'", () => {
    expect(computeEffectsSummary("none", labels)).toBe("Off");
  });

  it("returns the label from the lookup table for a known id", () => {
    expect(computeEffectsSummary("trails", labels)).toBe("Trails");
    expect(computeEffectsSummary("fire", labels)).toBe("Fire");
  });

  it("falls back to 'Custom' for an unknown id — does NOT leak raw kebab-case", () => {
    // This guards against silent UI regressions if EFFECT_LABELS ever drifts
    // from the EffectType union (e.g., a new effect ships in state before its
    // label is registered).
    expect(computeEffectsSummary("per-tip-halation", labels)).toBe("Custom");
  });

  it("returns 'Off' for empty-string / non-string input (silent-failure guard)", () => {
    // Upstream state corruption (getActiveEffect returning "" or undefined)
    // must surface as a safe neutral, NOT laundered into "Custom".
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(computeEffectsSummary("", labels)).toBe("Off");
    expect(computeEffectsSummary(undefined as unknown as string, labels)).toBe(
      "Off"
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("computePlaybackSummary", () => {
  it("reports BPM plus continuous mode as 'Cont.'", () => {
    expect(computePlaybackSummary(120, "continuous")).toBe("120 BPM • Cont.");
  });

  it("reports BPM plus step mode as 'Step'", () => {
    expect(computePlaybackSummary(60, "step")).toBe("60 BPM • Step");
  });

  it("preserves the bpm integer as given (no rounding or coercion)", () => {
    expect(computePlaybackSummary(92, "continuous")).toBe("92 BPM • Cont.");
  });

  it("renders '— BPM' for NaN / 0 / negative bpm (silent-failure guard)", () => {
    // Upstream corruption must surface as a visible "something is wrong"
    // signal, not a literal "NaN BPM" that blends into the UI.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(computePlaybackSummary(Number.NaN, "continuous")).toBe(
      "- BPM • Cont."
    );
    expect(computePlaybackSummary(0, "step")).toBe("- BPM • Step");
    expect(computePlaybackSummary(-1, "continuous")).toBe("- BPM • Cont.");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("computeExportSummary", () => {
  it("formats 1080p at 60 fps in 2D mode without a loop suffix when loops === 1", () => {
    expect(
      computeExportSummary({
        resolution: 1080,
        fps: 60,
        loopCount: 1,
        renderMode: "2d",
      })
    ).toBe("1080p • 60 fps");
  });

  it("uses × notation for resolution in 3D mode", () => {
    expect(
      computeExportSummary({
        resolution: 1080,
        fps: 60,
        loopCount: 1,
        renderMode: "3d",
      })
    ).toBe("1080×1080 • 60 fps");
  });

  it("abbreviates 4K and 8K in 2D mode, passes through × notation in 3D mode", () => {
    expect(
      computeExportSummary({
        resolution: 2160,
        fps: 30,
        loopCount: 1,
        renderMode: "2d",
      })
    ).toBe("4K • 30 fps");
    expect(
      computeExportSummary({
        resolution: 4320,
        fps: 30,
        loopCount: 1,
        renderMode: "2d",
      })
    ).toBe("8K • 30 fps");
    expect(
      computeExportSummary({
        resolution: 4320,
        fps: 30,
        loopCount: 1,
        renderMode: "3d",
      })
    ).toBe("4320×4320 • 30 fps");
  });

  it("appends ' • Nx' when loopCount > 1", () => {
    expect(
      computeExportSummary({
        resolution: 720,
        fps: 30,
        loopCount: 3,
        renderMode: "2d",
      })
    ).toBe("720p • 30 fps • 3×");
  });

  it("returns '— • - fps' for non-canonical resolution / invalid fps (silent-failure guard)", () => {
    // Resolutions outside {720,1080,2160,4320} are either a state bug or an
    // untested configuration. Render a visible fallback instead of a
    // plausible-looking "0p • 60 fps".
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      computeExportSummary({
        resolution: 0,
        fps: 60,
        loopCount: 1,
        renderMode: "2d",
      })
    ).toBe("- • - fps");
    expect(
      computeExportSummary({
        resolution: 999,
        fps: 60,
        loopCount: 1,
        renderMode: "2d",
      })
    ).toBe("- • - fps");
    expect(
      computeExportSummary({
        resolution: 1080,
        fps: Number.NaN,
        loopCount: 1,
        renderMode: "2d",
      })
    ).toBe("- • - fps");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
