import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import {
  flameColorToHex,
  hexToFlameColor,
} from "#lib/shared/animation-engine/domain/types/fire-types.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import {
  EFFECT_CONTROLS,
  resolveEffectControlOptions,
  type ControlDescriptor,
} from "#lib/shared/effects/domain/effect-control-manifest.js";
import {
  createEffectControlOverrides,
  formatEffectSliderValue,
} from "#lib/shared/effects/effect-control-fields.js";
import type { EffectId } from "#lib/shared/effects/state/effects-config-state.svelte.js";

type ControlConfig = Parameters<typeof createEffectControlOverrides>[1];
type ControlAnimation = Parameters<typeof createEffectControlOverrides>[2];

function makeControlDependencies() {
  let fire = structuredClone(DEFAULT_EFFECTS_CONFIG.fire);
  let trail = structuredClone(DEFAULT_TRAIL_SETTINGS);

  const config = {
    get fire() {
      return fire;
    },
    updateEffect: vi.fn((_effect: "fire", patch: Partial<typeof fire>) => {
      fire = { ...fire, ...patch };
    }),
  } as unknown as ControlConfig;

  const animation = {
    get trail() {
      return trail;
    },
    setTailLength: vi.fn((tailLength: number) => {
      trail = { ...trail, tailLength };
    }),
    setTrackingMode: vi.fn((trackingMode: TrackingMode) => {
      trail = { ...trail, trackingMode };
    }),
  } as ControlAnimation;

  return { config, animation };
}

describe("effect control fields", () => {
  it("resolves every slider to a finite number before it reaches the formatter", () => {
    const { config, animation } = makeControlDependencies();
    const defaults = DEFAULT_EFFECTS_CONFIG as unknown as Record<
      string,
      Record<string, unknown>
    >;

    for (const [effect, controls] of Object.entries(EFFECT_CONTROLS)) {
      const overrides = createEffectControlOverrides(
        effect as EffectId,
        config,
        animation
      );
      for (const control of controls.filter((item) => item.type === "slider")) {
        const value =
          overrides?.[control.field]?.get() ??
          defaults[effect]?.[control.field];
        expect(Number.isFinite(value), `${effect}.${control.field}`).toBe(true);
      }
    }
  });

  it("routes trail controls to animation settings", () => {
    const { config, animation } = makeControlDependencies();
    const overrides = createEffectControlOverrides(
      "trails",
      config,
      animation
    )!;

    expect(overrides.tailLength!.get()).toBe(DEFAULT_TRAIL_SETTINGS.tailLength);
    overrides.tailLength!.set(135);
    overrides.trackingMode!.set(TrackingMode.BOTH_ENDS);

    expect(animation.setTailLength).toHaveBeenCalledWith(135);
    expect(animation.setTrackingMode).toHaveBeenCalledWith(
      TrackingMode.BOTH_ENDS
    );
  });

  it("uses canonical staff-end names for trail tracking", () => {
    const track = EFFECT_CONTROLS.trails.find(
      (control) => control.id === "trails-track"
    )!;

    expect(resolveEffectControlOptions(track, "staff")).toEqual([
      { value: "left_end", label: "Pinky" },
      { value: "both_ends", label: "Pinky + Thumb" },
      { value: "right_end", label: "Thumb" },
      { value: "hand", label: "Hand" },
    ]);
  });

  it("routes fire color controls through the flame color conversion", () => {
    const { config, animation } = makeControlDependencies();
    const overrides = createEffectControlOverrides("fire", config, animation)!;

    overrides.fireLeftHex!.set("#123456");

    expect(config.updateEffect).toHaveBeenCalledWith("fire", {
      colorBlend: 1,
      propColors: [
        hexToFlameColor("#123456"),
        hexToFlameColor(overrides.fireRightHex!.get() as string),
      ],
    });
    expect(
      flameColorToHex(
        (config.updateEffect as ReturnType<typeof vi.fn>).mock.calls[0]![1]
          .propColors[0]
      )
    ).toBe("#123456");
  });

  it("does not throw when a persisted or miswired slider value is absent", () => {
    const control = {
      type: "slider",
      pct: false,
    } as ControlDescriptor;

    expect(formatEffectSliderValue(control, undefined)).toBe("");
    expect(formatEffectSliderValue(control, Number.NaN)).toBe("");
    expect(formatEffectSliderValue(control, 0)).toBe("0");
    expect(formatEffectSliderValue(control, 0.75)).toBe("0.8");
  });
});
