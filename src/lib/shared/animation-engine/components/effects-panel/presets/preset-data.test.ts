/**
 * Preset data invariants.
 *
 * After the data-first refactor (2026-06-04) every preset is a plain object
 * with a static `patch` or a dynamic `resolvePatch` — no imperative `apply`
 * closures. These invariants guard the data shape so an agent can verify the
 * refactor without a browser.
 *
 * Note on field validity: we do NOT assert patch keys ⊆ default-intent keys.
 * Several intents carry valid OPTIONAL fields that `DEFAULT_EFFECTS_CONFIG`
 * omits (e.g. charcoal's coreColor/midColor/coolColor), so a default-key
 * subset check would false-fail legitimate presets. Field names are already
 * guaranteed at compile time: each array is typed `EffectPreset<"effect">[]`,
 * so both `patch` and `resolvePatch` returns are checked against the intent by
 * TypeScript. Here we assert the runtime shape and that dynamic presets resolve
 * without throwing.
 */

import { describe, it, expect } from "vitest";
import type { EffectPresetGroup } from "./types";

import { TRAIL_PRESET_GROUP } from "./trail-presets";
import { FIRE_PRESET_GROUP } from "./fire-presets";
import { LED_PRESET_GROUP } from "./led-presets";
import { CHARCOAL_PRESET_GROUP } from "./charcoal-presets";
import { ZAP_PRESET_GROUP } from "./zap-presets";
import { SPARKLES_PRESET_GROUP } from "./sparkles-presets";
import { GHOST_PRESET_GROUP } from "./ghost-presets";
import { BLOOM_PRESET_GROUP } from "./bloom-presets";
import { GOO_PRESET_GROUP } from "./goo-presets";
import { BUBBLES_PRESET_GROUP } from "./bubbles-presets";
import { PETALS_PRESET_GROUP } from "./petals-presets";
import { SMOKE_PRESET_GROUP } from "./smoke-presets";
import { INK_PRESET_GROUP, INK_PRESETS } from "./ink-presets";
import { FROST_PRESET_GROUP } from "./frost-presets";
import { SILK_PRESET_GROUP } from "./silk-presets";
import { ANIMAL_PRESET_GROUP } from "./animal-presets";
import { PULSE_PRESET_GROUP } from "./pulse-presets";

const GROUPS: EffectPresetGroup[] = [
  TRAIL_PRESET_GROUP,
  FIRE_PRESET_GROUP,
  LED_PRESET_GROUP,
  CHARCOAL_PRESET_GROUP,
  ZAP_PRESET_GROUP,
  SPARKLES_PRESET_GROUP,
  GHOST_PRESET_GROUP,
  BLOOM_PRESET_GROUP,
  GOO_PRESET_GROUP,
  BUBBLES_PRESET_GROUP,
  PETALS_PRESET_GROUP,
  SMOKE_PRESET_GROUP,
  INK_PRESET_GROUP,
  FROST_PRESET_GROUP,
  SILK_PRESET_GROUP,
  ANIMAL_PRESET_GROUP,
  PULSE_PRESET_GROUP,
];

/**
 * Fields a look may leave unset, and the condition that makes leaving it safe.
 * Every other field that a sibling look sets must be set by every look in the
 * group.
 */
const SAFE_OMISSIONS: Record<
  string,
  Record<string, (patch: Record<string, unknown>) => boolean>
> = {
  // The blend slider applies to every fire look; only Liquid Fire resets it.
  fire: { colorBlend: () => true },
  // Sparkles draws `color` only in solid mode and `palette` only in palette mode.
  sparkles: {
    color: (patch) => patch.colorMode !== "solid",
    palette: (patch) => patch.colorMode !== "palette",
  },
  // Pulse reads `beatInterval` only on the beat trigger and
  // `velocityThreshold` only on the velocity trigger.
  pulse: {
    beatInterval: (patch) => patch.trigger !== "beat",
    velocityThreshold: (patch) => patch.trigger !== "velocity",
  },
};

describe("effect preset data", () => {
  it("registers all 17 effect groups", () => {
    expect(GROUPS).toHaveLength(17);
  });

  it("every look sets each field its sibling looks set", () => {
    // applyPreset merges a look over the current config, so a field the look
    // leaves out keeps whatever the previous look set. Storm after Tesla kept
    // Tesla's glow and jitter; Hot Coal after Cinder Fan kept the fan emission.
    const leaks: string[] = [];
    for (const group of GROUPS) {
      const patches = group.presets.map((preset) => ({
        id: preset.id,
        patch: (preset.patch ?? {}) as Record<string, unknown>,
      }));
      const fields = new Set(
        patches.flatMap(({ patch }) => Object.keys(patch))
      );
      const safe = SAFE_OMISSIONS[group.effectType] ?? {};
      for (const { id, patch } of patches) {
        for (const field of fields) {
          if (field in patch) continue;
          if (safe[field]?.(patch)) continue;
          leaks.push(`${id}.${field}`);
        }
      }
    }
    expect(
      leaks,
      `looks that inherit the previous look: ${leaks.join(", ")}`
    ).toEqual([]);
  });

  it("every effect except Ghost offers at least one named preset", () => {
    // Sanity: groups aren't mis-wired (e.g. LED group holding fire presets).
    for (const g of GROUPS) {
      expect(typeof g.effectType).toBe("string");
      if (g.effectType === "ghost") {
        expect(g.presets).toEqual([]);
      } else {
        expect(g.presets.length).toBeGreaterThan(0);
      }
    }
  });

  it("preset ids are unique across all groups", () => {
    const ids = GROUPS.flatMap((g) => g.presets.map((p) => p.id));
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `duplicate preset ids: ${dupes.join(", ")}`).toEqual([]);
  });

  it("every preset has exactly one of patch / resolvePatch", () => {
    for (const g of GROUPS) {
      for (const p of g.presets) {
        const hasPatch = p.patch !== undefined;
        const hasResolve = p.resolvePatch !== undefined;
        expect(
          hasPatch !== hasResolve,
          `${p.id}: expected exactly one of patch/resolvePatch (patch=${hasPatch}, resolvePatch=${hasResolve})`
        ).toBe(true);
      }
    }
  });

  it("every animal preset pins the `creature` mode axis", () => {
    // `creature` decides which ornament renders. applyPreset shallow-merges, so
    // a preset omitting `creature` would inherit the previously-selected one.
    // This is the descendant of the original silk `form`-leak guard: when the
    // creature mode split out of Silk into Animal, the discriminator moved
    // with it (Silk is now a single-purpose ribbon with no mode axis).
    const missing = ANIMAL_PRESET_GROUP.presets
      .filter(
        (p) => p.patch && !("creature" in (p.patch as Record<string, unknown>))
      )
      .map((p) => p.id);
    expect(
      missing,
      `animal presets missing \`creature\`: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("every preset uses a static patch (no dynamic resolvePatch remains)", () => {
    // The trail/fire colour-picker "Custom" presets were retired — custom colours
    // now live in the Customize panels, and trail's default IS the colour-matched
    // pair on the synthetic Default chip. So every preset is a static patch.
    const dynamic = GROUPS.flatMap((g) =>
      g.presets.filter((p) => p.resolvePatch).map((p) => p.id)
    );
    expect(dynamic).toEqual([]);
  });

  it("keeps only the production-approved Ink looks on the preset surface", () => {
    expect(INK_PRESETS.map((preset) => preset.name)).toEqual([
      "Toxic",
      "Neon Tag",
      "Splatter",
    ]);
    expect(INK_PRESETS.map((preset) => preset.id)).not.toContain("ink-classic");
    expect(INK_PRESETS.map((preset) => preset.id)).not.toContain("ink-drip");
  });
});
