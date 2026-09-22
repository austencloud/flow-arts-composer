# Creator Presentation Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public sequence cards render with the colors, trail settings, and effects the creator saved, captured at save time into `creatorIntent.presentation`, never from the viewer's own settings.

**Architecture:** A pure `presentation-intent` module owns the snapshot type, the capture pruning, the neutral default, and resolution. Two existing capture points (the save dialog and the publish-moment stamp) call it. `SequenceShowcasePreview` and `ArtifactTile` resolve once per sequence and push the result into their ephemeral animation scope through the two bulk setters tunnel snapshots already use, `effects.replace` and `settings.updateSettings`. One leak fix makes ephemeral scopes stop reading the viewer's effects localStorage.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, vitest (jsdom logic suite at `tests/config/vitest.config.ts`), Firestore.

**Spec:** `docs/superpowers/specs/2026-09-17-creator-presentation-intent-design.md`

**Worktree:** `E:/worktrees/tka-platform/creator-presentation`, branch `codex/creator-presentation-intent`. All commands below run from that directory. `node_modules` is a junction into the primary checkout; never `rm -rf` it.

**Deviations from the spec's testing section, decided while planning:** the spec asked for browser component tests on `SavePropDialog` and `SequenceShowcasePreview`. The dialog's only new logic is "switch on resolves `null`", and that seam is the handler, so it is a jsdom unit test on the handler instead. The showcase preview mounts a Three.js player, which the component harness does not exercise today, so its behavior is proven by the resolver unit test plus the visual pass. Both follow `.claude/rules/component-test-discipline.md` ("smallest stable assertion").

**Run commands used throughout:**

```bash
# one jsdom unit test file
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/presentation-intent.test.ts
# type gate for code branches
pnpm run check:tsc
```

---

## File map

| Path | Responsibility |
| --- | --- |
| `src/lib/shared/foundation/domain/models/presentation-intent.ts` (create) | `PresentationIntent`, `PresentationTrailSettings`, `PresentationEffectsConfig` types. Type-only imports. |
| `src/lib/shared/foundation/domain/models/creator-intent.ts` (modify) | Adds `presentation?: PresentationIntent \| null`. |
| `src/lib/shared/foundation/services/presentation-intent.ts` (create) | `capturePresentation`, `neutralPresentation`, `resolvePresentation`, `summarizePresentation`. Pure. |
| `tests/unit/presentation-intent.test.ts` (create) | Unit tests for the pure module. |
| `src/lib/shared/animation-engine/state/animation-scope.svelte.ts` (modify) | Ephemeral scope builds effects with `persist: false`. |
| `tests/unit/animation-engine/animation-scope.test.ts` (modify) | Proves no localStorage read. |
| `src/lib/shared/library/services/contracts/IVisualSequenceSaveCoordinator.ts` (modify) | `presentation?` on the save intent. |
| `src/lib/features/library/services/implementations/VisualSequenceSaveCoordinator.ts` (modify) | Writes `creatorIntent.presentation`. |
| `tests/unit/library/visual-sequence-save-coordinator.test.ts` (modify) | Write / null / omit cases. |
| `src/lib/shared/sequence-viewer/state/library-action-handler.svelte.ts` (modify) | Captures from the live scene, exposes `useDefaultLook` and `presentationSummary`. |
| `tests/unit/sequence-viewer/library-action-handler.test.ts` (modify) | Capture and default-look cases. |
| `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte` (modify) | Supplies `getPresentationSource`; binds the dialog's switch. |
| `src/lib/shared/library/components/SavePropDialog.svelte` (modify) | Summary line and "Use default look" chip. |
| `src/lib/features/library/services/library-save-service.ts` (modify) | Publish-moment presentation stamp. |
| `tests/unit/library-save-service-persisted.test.ts` (modify) | Stamp only when absent. |
| `src/lib/shared/sequence-preview/services/viewing-presentation.ts` (create) | `resolveViewingPresentation(sequence)`. |
| `tests/unit/sequence-preview/viewing-presentation.test.ts` (create) | Recorded vs neutral. |
| `src/lib/shared/animation-engine/components/CanvasSurface.svelte` (modify) | Explicit `null` colors mean theme default. |
| `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte`, `SplitCanvasView.svelte`, `src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte` (modify) | Prop type widened to accept `null`. |
| `src/lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte` (modify) | Applies the resolved presentation to its scope and passes explicit colors. |
| `src/lib/features/creators/components/profile/stage/ArtifactTile.svelte` (modify) | Same pattern with its own ephemeral scope. |
| `firestore.indexes.json` (modify) | Field override excluding `creatorIntent.presentation` from single-field indexes. |
| `tests/unit/library/public-sequence-projection-presentation.test.ts` (create) | `presentation: null` survives normalization and projection. |

---

### Task 1: Presentation types and the pure module

**Files:**
- Create: `src/lib/shared/foundation/domain/models/presentation-intent.ts`
- Create: `src/lib/shared/foundation/services/presentation-intent.ts`
- Modify: `src/lib/shared/foundation/domain/models/creator-intent.ts`
- Test: `tests/unit/presentation-intent.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/presentation-intent.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailEffect,
  TrailMode,
} from "$lib/shared/animation-engine/domain/types/trail-types";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import type { CreatorIntent } from "$lib/shared/foundation/domain/models/creator-intent";
import {
  capturePresentation,
  neutralPresentation,
  resolvePresentation,
  summarizePresentation,
} from "$lib/shared/foundation/services/presentation-intent";

const CUSTOM_COLORS = { left: "#00ff00", right: "#ff00ff" };

function liveEffects() {
  return {
    ...structuredClone(DEFAULT_EFFECTS_CONFIG),
    tipEffectMap: { "*": { effect: "trails" as const }, "1": { effect: "led" as const } },
    activeEffect: "led" as const,
  };
}

function liveTrail() {
  return {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.PERSISTENT,
    effect: TrailEffect.NONE,
    usePathCache: false,
    previewMode: true,
  };
}

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(hasUndefined);
}

describe("capturePresentation", () => {
  it("drops trail workflow fields and the tunnel layer array", () => {
    const captured = capturePresentation({
      primaryPropColors: CUSTOM_COLORS,
      trail: liveTrail(),
      effects: liveEffects(),
    });
    expect(captured.trail).not.toHaveProperty("usePathCache");
    expect(captured.trail).not.toHaveProperty("previewMode");
    expect(captured.trail).not.toHaveProperty("additionalLayerColors");
    expect(captured.trail.mode).toBe(TrailMode.PERSISTENT);
    expect(captured.trail.effect).toBe(TrailEffect.NONE);
  });

  it("keeps only the effect intents referenced by the tip map", () => {
    const captured = capturePresentation({
      primaryPropColors: null,
      trail: liveTrail(),
      effects: liveEffects(),
    });
    expect(captured.effects.trails).toEqual(DEFAULT_EFFECTS_CONFIG.trails);
    expect(captured.effects.led).toEqual(DEFAULT_EFFECTS_CONFIG.led);
    expect(captured.effects).not.toHaveProperty("fire");
    expect(captured.effects).not.toHaveProperty("sparkles");
    expect(captured.effects.version).toBe(DEFAULT_EFFECTS_CONFIG.version);
    expect(captured.effects.activeEffect).toBe("led");
    expect(captured.effects.activePresets).toEqual(DEFAULT_EFFECTS_CONFIG.activePresets);
    expect(captured.effects.effectLayerOverrides).toEqual({});
  });

  it("keeps no intents when the tip map is empty", () => {
    const captured = capturePresentation({
      primaryPropColors: null,
      trail: liveTrail(),
      effects: { ...liveEffects(), tipEffectMap: {} },
    });
    expect(captured.effects).not.toHaveProperty("trails");
    expect(captured.effects).not.toHaveProperty("led");
  });

  it("never emits undefined anywhere in the snapshot", () => {
    const captured = capturePresentation({
      primaryPropColors: CUSTOM_COLORS,
      trail: liveTrail(),
      effects: liveEffects(),
    });
    expect(hasUndefined(captured)).toBe(false);
  });

  it("lowercases and passes colors through, null stays null", () => {
    expect(
      capturePresentation({
        primaryPropColors: { left: "#AABBCC", right: "#DDEEFF" },
        trail: liveTrail(),
        effects: liveEffects(),
      }).primaryPropColors
    ).toEqual({ left: "#aabbcc", right: "#ddeeff" });
    expect(
      capturePresentation({
        primaryPropColors: null,
        trail: liveTrail(),
        effects: liveEffects(),
      }).primaryPropColors
    ).toBeNull();
  });
});

describe("resolvePresentation", () => {
  it("is absent for undefined intent, legacy intent, and no presentation key", () => {
    expect(resolvePresentation(undefined).kind).toBe("absent");
    expect(resolvePresentation(null).kind).toBe("absent");
    expect(resolvePresentation({ effortTimeline: null }).kind).toBe("absent");
    expect(
      resolvePresentation({
        propConfig: { leftPropType: "staff", rightPropType: "staff", catDogMode: false },
      } as unknown as CreatorIntent).kind
    ).toBe("absent");
  });

  it("is neutral for an explicit null", () => {
    expect(resolvePresentation({ presentation: null }).kind).toBe("neutral");
  });

  it("is recorded and fully populated for a pruned snapshot", () => {
    const captured = capturePresentation({
      primaryPropColors: CUSTOM_COLORS,
      trail: liveTrail(),
      effects: liveEffects(),
    });
    const resolved = resolvePresentation({ presentation: captured });
    expect(resolved.kind).toBe("recorded");
    if (resolved.kind !== "recorded") return;
    expect(resolved.value.primaryPropColors).toEqual(CUSTOM_COLORS);
    expect(resolved.value.trail.mode).toBe(TrailMode.PERSISTENT);
    expect(resolved.value.trail.usePathCache).toBe(DEFAULT_TRAIL_SETTINGS.usePathCache);
    expect(resolved.value.trail.additionalLayerColors).toEqual(
      DEFAULT_TRAIL_SETTINGS.additionalLayerColors
    );
    expect(resolved.value.effects.fire).toEqual(DEFAULT_EFFECTS_CONFIG.fire);
    expect(resolved.value.effects.tipEffectMap).toEqual(captured.effects.tipEffectMap);
    expect(resolved.value.effects.activeEffect).toBe("led");
  });

  it("falls back to neutral with one warning for garbage", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolved = resolvePresentation({
      presentation: { trail: 42, effects: "nope", primaryPropColors: [] },
    } as unknown as CreatorIntent);
    expect(resolved.kind).toBe("neutral");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("neutralPresentation", () => {
  it("is default trail, default effects, and theme-default colors", () => {
    const neutral = neutralPresentation();
    expect(neutral.primaryPropColors).toBeNull();
    expect(neutral.trail).toEqual(DEFAULT_TRAIL_SETTINGS);
    expect(neutral.effects).toEqual(DEFAULT_EFFECTS_CONFIG);
  });

  it("returns a fresh object each call", () => {
    const a = neutralPresentation();
    const b = neutralPresentation();
    expect(a).not.toBe(b);
    expect(a.effects).not.toBe(b.effects);
  });
});

describe("summarizePresentation", () => {
  it("labels theme-default colors, the trail mode, and distinct tip effects", () => {
    const summary = summarizePresentation(neutralPresentation());
    expect(summary.colors).toBeNull();
    expect(summary.trailLabel).toBe("Fade trail");
    expect(summary.effectLabels).toEqual(["Trails"]);
  });

  it("lists each distinct effect once and reports none for an empty map", () => {
    const value = {
      ...neutralPresentation(),
      primaryPropColors: CUSTOM_COLORS,
      trail: { ...DEFAULT_TRAIL_SETTINGS, mode: TrailMode.OFF },
      effects: {
        ...DEFAULT_EFFECTS_CONFIG,
        tipEffectMap: {
          "*": { effect: "fire" as const },
          "0": { effect: "led" as const },
          "1": { effect: "fire" as const },
        },
      },
    };
    const summary = summarizePresentation(value);
    expect(summary.colors).toEqual(CUSTOM_COLORS);
    expect(summary.trailLabel).toBe("No trail");
    expect(summary.effectLabels).toEqual(["Fire", "LED"]);

    expect(
      summarizePresentation({
        ...value,
        effects: { ...value.effects, tipEffectMap: {} },
      }).effectLabels
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/presentation-intent.test.ts
```
Expected: FAIL, "Failed to resolve import ... presentation-intent".

- [ ] **Step 3: Create the type module**

```ts
// src/lib/shared/foundation/domain/models/presentation-intent.ts
import type { TrailSettings } from "$lib/shared/animation-engine/domain/types/trail-types";
import type { EffectsConfig } from "$lib/shared/effects/domain/effects-config";
import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";

/** Trail render settings minus workflow flags and the tunnel-only layer array. */
export type PresentationTrailSettings = Omit<
  TrailSettings,
  "usePathCache" | "previewMode" | "additionalLayerColors"
>;

/** Keys of EffectsConfig that describe one effect's look. */
export type EffectIntentKey = Exclude<
  keyof EffectsConfig,
  "version" | "tipEffectMap" | "activePresets" | "activeEffect" | "effectLayerOverrides"
>;

/**
 * EffectsConfig with only the intent objects referenced by tipEffectMap.
 * The bookkeeping keys are always present; unreferenced intents are omitted
 * and filled from DEFAULT_EFFECTS_CONFIG on read.
 */
export type PresentationEffectsConfig = Pick<
  EffectsConfig,
  "version" | "tipEffectMap" | "activePresets" | "activeEffect" | "effectLayerOverrides"
> &
  Partial<Pick<EffectsConfig, EffectIntentKey>>;

/** The visual look a creator saved a sequence with. */
export interface PresentationIntent {
  /** Null follows the theme's blue/red defaults, same contract as AppSettings. */
  readonly primaryPropColors: ViewerCustomColorPair | null;
  readonly trail: PresentationTrailSettings;
  readonly effects: PresentationEffectsConfig;
}
```

- [ ] **Step 4: Add the field to CreatorIntent**

Replace the whole file `src/lib/shared/foundation/domain/models/creator-intent.ts` with:

```ts
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { EffortTimeline } from "$lib/shared/effort/domain/effort-timeline-types";
import type { PresentationIntent } from "./presentation-intent";

export interface CreatorIntent {
  /** Prop pair the creator recorded for presentation. Optional: an intent may
   * carry only an effort timeline. Absent means "no prop intent recorded" —
   * never substitute a default here; display falls back to viewer context. */
  readonly propConfig?: {
    readonly leftPropType: PropType;
    readonly rightPropType: PropType;
    readonly catDogMode: boolean;
  };
  readonly effortTimeline?: EffortTimeline | null;
  /**
   * Visual presentation the creator saved with. Three states:
   *   undefined  never recorded (legacy or private working save)
   *   null       creator chose the default look explicitly
   *   object     recorded snapshot
   * Absent and null both render neutral. Only absent triggers publish-moment
   * capture. Never substitute viewer settings here.
   */
  readonly presentation?: PresentationIntent | null;
}
```

- [ ] **Step 5: Create the pure service module**

```ts
// src/lib/shared/foundation/services/presentation-intent.ts
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
  normalizeLegacyTrailSettings,
  type TrailSettings,
} from "$lib/shared/animation-engine/domain/types/trail-types";
import type { EffectType } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
import { EFFECT_LABELS } from "$lib/shared/animation-engine/components/effects-panel/effect-registry";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import { migrateEffectsConfig } from "$lib/shared/effects/domain/migrations";
import type { EffectsConfig } from "$lib/shared/effects/domain/effects-config";
import type { CreatorIntent } from "$lib/shared/foundation/domain/models/creator-intent";
import type {
  EffectIntentKey,
  PresentationEffectsConfig,
  PresentationIntent,
  PresentationTrailSettings,
} from "$lib/shared/foundation/domain/models/presentation-intent";
import {
  resolveViewerCustomColorPair,
  type ViewerCustomColorPair,
} from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";

/** A fully populated look, ready to push into an animation scope. */
export interface ResolvedPresentationValue {
  primaryPropColors: ViewerCustomColorPair | null;
  trail: TrailSettings;
  effects: EffectsConfig;
}

export type ResolvedPresentation =
  | { kind: "recorded"; value: ResolvedPresentationValue }
  | { kind: "neutral" }
  | { kind: "absent" };

export interface PresentationSource {
  primaryPropColors: ViewerCustomColorPair | null | undefined;
  trail: TrailSettings;
  effects: EffectsConfig;
}

export interface PresentationSummary {
  /** Null means the theme's blue/red defaults. */
  colors: ViewerCustomColorPair | null;
  trailLabel: string;
  /** Distinct effect labels in first-seen order; empty when no tip has an effect. */
  effectLabels: string[];
}

const TRAIL_MODE_LABELS: Record<TrailMode, string> = {
  [TrailMode.OFF]: "No trail",
  [TrailMode.FADE]: "Fade trail",
  [TrailMode.LOOP_CLEAR]: "Loop-clear trail",
  [TrailMode.PERSISTENT]: "Persistent trail",
};

/** Deep copy that tolerates Svelte $state proxies (structuredClone throws on them). */
function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function lowercasePair(pair: ViewerCustomColorPair): ViewerCustomColorPair {
  return { left: pair.left.toLowerCase(), right: pair.right.toLowerCase() };
}

function referencedEffects(map: EffectsConfig["tipEffectMap"]): Set<EffectType> {
  const seen = new Set<EffectType>();
  for (const assignment of Object.values(map ?? {})) {
    if (assignment?.effect && assignment.effect !== "none") seen.add(assignment.effect);
  }
  return seen;
}

/**
 * Snapshot the live scene for storage. Pure: no store reads. Drops trail
 * workflow flags and every effect intent the tip map does not reference.
 */
export function capturePresentation(source: PresentationSource): PresentationIntent {
  const trail = clone(source.trail);
  const {
    usePathCache: _usePathCache,
    previewMode: _previewMode,
    additionalLayerColors: _additionalLayerColors,
    ...presentationTrail
  } = trail;

  const effects = clone(source.effects);
  const kept = referencedEffects(effects.tipEffectMap);
  const prunedEffects: PresentationEffectsConfig = {
    version: effects.version,
    tipEffectMap: effects.tipEffectMap ?? {},
    activePresets: effects.activePresets,
    activeEffect: effects.activeEffect ?? "none",
    effectLayerOverrides: effects.effectLayerOverrides ?? {},
  };
  for (const key of kept) {
    const intent = effects[key as EffectIntentKey];
    if (intent !== undefined) {
      (prunedEffects as Record<string, unknown>)[key] = intent;
    }
  }

  return {
    primaryPropColors: source.primaryPropColors
      ? lowercasePair(resolveViewerCustomColorPair(source.primaryPropColors))
      : null,
    trail: presentationTrail as PresentationTrailSettings,
    effects: prunedEffects,
  };
}

/** The single definition of what legacy and "default look" sequences show. */
export function neutralPresentation(): ResolvedPresentationValue {
  return {
    primaryPropColors: null,
    trail: clone(DEFAULT_TRAIL_SETTINGS),
    effects: clone(DEFAULT_EFFECTS_CONFIG),
  };
}

const warned = new Set<string>();

function warnOnce(key: string, error: unknown): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn("[presentation-intent] malformed presentation, rendering neutral", error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read a stored intent. Recorded values come back fully populated: saved
 * fields over DEFAULT_TRAIL_SETTINGS / DEFAULT_EFFECTS_CONFIG, then the
 * existing legacy normalizers. Never throws; garbage resolves neutral.
 */
export function resolvePresentation(
  intent: CreatorIntent | null | undefined,
  warnKey = "unknown"
): ResolvedPresentation {
  if (!intent || intent.presentation === undefined) return { kind: "absent" };
  if (intent.presentation === null) return { kind: "neutral" };

  try {
    const saved = intent.presentation;
    if (!isRecord(saved.trail) || !isRecord(saved.effects)) {
      throw new Error("presentation.trail and presentation.effects must be objects");
    }
    const trail = normalizeLegacyTrailSettings({
      ...clone(DEFAULT_TRAIL_SETTINGS),
      ...clone(saved.trail),
    }) as TrailSettings;
    const effects = migrateEffectsConfig({
      ...clone(DEFAULT_EFFECTS_CONFIG),
      ...clone(saved.effects),
    });
    const primaryPropColors =
      saved.primaryPropColors == null
        ? null
        : lowercasePair(resolveViewerCustomColorPair(saved.primaryPropColors));
    return { kind: "recorded", value: { primaryPropColors, trail, effects } };
  } catch (error) {
    warnOnce(warnKey, error);
    return { kind: "neutral" };
  }
}

/** Human labels for the save dialog's summary line. */
export function summarizePresentation(
  value: ResolvedPresentationValue
): PresentationSummary {
  const effectLabels: string[] = [];
  for (const effect of referencedEffects(value.effects.tipEffectMap)) {
    const label = EFFECT_LABELS[effect] ?? effect;
    if (!effectLabels.includes(label)) effectLabels.push(label);
  }
  return {
    colors: value.primaryPropColors,
    trailLabel: TRAIL_MODE_LABELS[value.trail.mode] ?? "Trail",
    effectLabels,
  };
}
```

The registry at `src/lib/shared/animation-engine/components/effects-panel/effect-registry.ts:56-58` labels these `Trails`, `Fire`, and `LED`, which is what the tests expect.

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/presentation-intent.test.ts
```
Expected: PASS, 13 tests.

If `hasUndefined` fails on `activePresets`, an intent inside `DEFAULT_EFFECTS_CONFIG` carries `undefined`; find it with `Object.entries` in the test output and add `?? null` for that key in `capturePresentation`. Do not change the test.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/foundation/domain/models/presentation-intent.ts src/lib/shared/foundation/domain/models/creator-intent.ts src/lib/shared/foundation/services/presentation-intent.ts tests/unit/presentation-intent.test.ts
git commit -m "feat(intent): presentation snapshot type, capture, and resolve

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Null presentation survives normalization and projection

**Files:**
- Test: `tests/unit/library/public-sequence-projection-presentation.test.ts` (create)

No source change is expected. This task proves the spec's invariant and stops here if it holds.

- [ ] **Step 1: Write the test**

```ts
// tests/unit/library/public-sequence-projection-presentation.test.ts
import { describe, expect, it } from "vitest";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";

const BASE = {
  id: "seq-null-presentation",
  name: "AB",
  word: "AB",
  steps: [],
  thumbnails: [],
  isFavorite: false,
  isCircular: false,
  tags: [],
  metadata: {},
} as unknown as SequenceData;

describe("creatorIntent.presentation null preservation", () => {
  it("createSequenceData keeps an explicit null presentation", () => {
    const out = createSequenceData({
      ...BASE,
      creatorIntent: { presentation: null },
    });
    expect(out.creatorIntent).toEqual({ presentation: null });
    expect(out.creatorIntent).toHaveProperty("presentation");
  });

  it("hydrate keeps an explicit null presentation", () => {
    const out = hydrate({ ...BASE, creatorIntent: { presentation: null } });
    expect(out.creatorIntent?.presentation).toBeNull();
    expect(out.creatorIntent).toHaveProperty("presentation");
  });

  it("hydrate does not invent a presentation for a legacy intent", () => {
    const out = hydrate({
      ...BASE,
      intendedProp: { leftPropType: "staff", rightPropType: "staff", catDogMode: false },
    } as unknown as SequenceData);
    expect(out.creatorIntent).not.toHaveProperty("presentation");
  });
});
```

- [ ] **Step 2: Run it**

Run:
```bash
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/library/public-sequence-projection-presentation.test.ts
```
Expected: PASS, 3 tests. If `hydrate` requires more fields on `BASE` and throws, add the minimal fields the error names to `BASE` until it runs. If a test fails because a normalizer strips the null, fix that normalizer to copy `creatorIntent` whole (the pattern at `sequence-data.ts:359`) and note the file in the commit body.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/library/public-sequence-projection-presentation.test.ts
git commit -m "test(intent): explicit null presentation survives normalize and hydrate

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Ephemeral scopes stop reading the viewer's effects localStorage

**Files:**
- Modify: `src/lib/shared/animation-engine/state/animation-scope.svelte.ts:29-33`
- Test: `tests/unit/animation-engine/animation-scope.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/animation-engine/animation-scope.test.ts`, inside a new `describe` at the end of the file:

```ts
describe("ephemeral animation scope effects", () => {
  it("does not read or write tka_effects_config", () => {
    const stored = JSON.stringify({
      version: 38,
      tipEffectMap: { "*": { effect: "fire" } },
    });
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation((key: string) => (key === "tka_effects_config" ? stored : null));
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});

    const scope = createAnimationScope({ persistence: "ephemeral" });
    expect(scope.effects.config.tipEffectMap).toEqual({ "*": { effect: "trails" } });
    scope.effects.setActiveEffect("led");

    const effectsReads = getItem.mock.calls.filter(([key]) => key === "tka_effects_config");
    const effectsWrites = setItem.mock.calls.filter(([key]) => key === "tka_effects_config");
    expect(effectsReads).toHaveLength(0);
    expect(effectsWrites).toHaveLength(0);

    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("local scopes still load the persisted effects config", () => {
    const stored = JSON.stringify({
      version: 38,
      tipEffectMap: { "*": { effect: "fire" } },
    });
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation((key: string) => (key === "tka_effects_config" ? stored : null));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});

    const scope = createAnimationScope({ persistence: "local" });
    expect(scope.effects.config.tipEffectMap["*"]?.effect).toBe("fire");

    getItem.mockRestore();
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run it to verify the first case fails**

Run:
```bash
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/animation-engine/animation-scope.test.ts
```
Expected: FAIL on "does not read or write tka_effects_config", tipEffectMap equals `{ "*": { effect: "fire" } }`.

If the save is debounced and `effectsWrites` is empty even before the fix, that assertion is not the discriminating one; the `tipEffectMap` assertion is. Keep both.

- [ ] **Step 3: Fix the scope**

In `src/lib/shared/animation-engine/state/animation-scope.svelte.ts` replace the constructor body:

```ts
  constructor(options: AnimationScopeOptions) {
    const ephemeral = options.persistence === "ephemeral";
    this.visibility = new AnimationVisibilityStateManager({ ephemeral });
    this.settings = createAnimationSettingsState({ ephemeral });
    // An ephemeral scope must never read from or write to the shared
    // tka_effects_config key; public previews render the creator's look, not
    // the visitor's saved effects. Persisted tiers keep today's behavior.
    this.effects = createEffectsConfigState(undefined, { persist: !ephemeral });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Same command. Expected: PASS for the whole file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/animation-engine/state/animation-scope.svelte.ts tests/unit/animation-engine/animation-scope.test.ts
git commit -m "fix(animation): ephemeral scopes stop reading the viewer's effects config

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Save coordinator writes presentation from the intent

**Files:**
- Modify: `src/lib/shared/library/services/contracts/IVisualSequenceSaveCoordinator.ts:6-11`
- Modify: `src/lib/features/library/services/implementations/VisualSequenceSaveCoordinator.ts:88-127`
- Test: `tests/unit/library/visual-sequence-save-coordinator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("VisualSequenceSaveCoordinator", ...)` block of `tests/unit/library/visual-sequence-save-coordinator.test.ts`:

```ts
  const PRESENTATION = {
    primaryPropColors: { left: "#00ff00", right: "#ff00ff" },
    trail: { mode: "fade" },
    effects: { version: 38, tipEffectMap: {}, activePresets: {}, activeEffect: "none", effectLayerOverrides: {} },
  } as never;

  it("writes a recorded presentation onto creatorIntent", async () => {
    const saveSequence = vi.fn(async () => ({ persisted: true, sequenceId: "seq-1" }));
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });
    await coordinator.save(SEQUENCE, { presentation: PRESENTATION });
    const stored = saveSequence.mock.calls[0]?.[0] as SequenceData;
    expect(stored.creatorIntent?.presentation).toEqual(PRESENTATION);
  });

  it("writes an explicit null when the creator chose the default look", async () => {
    const saveSequence = vi.fn(async () => ({ persisted: true, sequenceId: "seq-1" }));
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });
    await coordinator.save(SEQUENCE, { presentation: null });
    const stored = saveSequence.mock.calls[0]?.[0] as SequenceData;
    expect(stored.creatorIntent).toHaveProperty("presentation");
    expect(stored.creatorIntent?.presentation).toBeNull();
  });

  it("leaves a saved presentation alone when the intent omits it", async () => {
    const saveSequence = vi.fn(async () => ({ persisted: true, sequenceId: "seq-1" }));
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });
    await coordinator.save(
      { ...SEQUENCE, creatorIntent: { presentation: PRESENTATION } } as SequenceData,
      {}
    );
    const stored = saveSequence.mock.calls[0]?.[0] as SequenceData;
    expect(stored.creatorIntent?.presentation).toEqual(PRESENTATION);
  });

  it("does not add a presentation key when nothing was saved or captured", async () => {
    const saveSequence = vi.fn(async () => ({ persisted: true, sequenceId: "seq-1" }));
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });
    await coordinator.save(SEQUENCE, {});
    const stored = saveSequence.mock.calls[0]?.[0] as SequenceData;
    expect(stored.creatorIntent).not.toHaveProperty("presentation");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run:
```bash
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/library/visual-sequence-save-coordinator.test.ts
```
Expected: the first two new tests FAIL (presentation undefined); the third FAILS (existing code rebuilds `creatorIntent` without presentation).

- [ ] **Step 3: Extend the intent contract**

In `src/lib/shared/library/services/contracts/IVisualSequenceSaveCoordinator.ts`:

```ts
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PresentationIntent } from "$lib/shared/foundation/domain/models/presentation-intent";
import type { SaveResult } from "$lib/shared/library/domain/library-contract-types";

export type VisualSequencePathShape = "arc" | "linear" | "concave";

export interface VisualSequenceSaveIntent {
  leftPropType?: string | null;
  rightPropType?: string | null;
  catDogModeEnabled?: boolean | null;
  pathShape?: VisualSequencePathShape;
  /**
   * Visual look captured from the live scene. Object = record it, null = the
   * creator chose the default look, key absent = leave whatever is saved.
   */
  presentation?: PresentationIntent | null;
}
```

Keep the rest of the file unchanged.

- [ ] **Step 4: Write it in the coordinator**

In `src/lib/features/library/services/implementations/VisualSequenceSaveCoordinator.ts`, replace the `return createSequenceData({...})` block of `withPresentationIntent` (currently lines 111-126) with:

```ts
    const presentation =
      "presentation" in intent
        ? { presentation: intent.presentation ?? null }
        : sequence.creatorIntent && "presentation" in sequence.creatorIntent
          ? { presentation: sequence.creatorIntent.presentation ?? null }
          : {};

    return createSequenceData({
      ...sequence,
      metadata:
        pathShape === "arc"
          ? sequence.metadata
          : { ...sequence.metadata, pathShape },
      creatorIntent: {
        propConfig: { leftPropType, rightPropType, catDogMode },
        ...(sequence.creatorIntent?.effortTimeline !== undefined
          ? { effortTimeline: sequence.creatorIntent.effortTimeline }
          : sequence.effortTimeline !== undefined
            ? { effortTimeline: sequence.effortTimeline }
            : {}),
        ...presentation,
      },
      intendedProp: { leftPropType, rightPropType, catDogMode },
    });
```

- [ ] **Step 5: Run to verify they pass**

Same command. Expected: PASS, all tests in the file.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/library/services/contracts/IVisualSequenceSaveCoordinator.ts src/lib/features/library/services/implementations/VisualSequenceSaveCoordinator.ts tests/unit/library/visual-sequence-save-coordinator.test.ts
git commit -m "feat(library): save coordinator records creator presentation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Handler captures the live scene and honors "Use default look"

**Files:**
- Modify: `src/lib/shared/sequence-viewer/state/library-action-handler.svelte.ts`
- Test: `tests/unit/sequence-viewer/library-action-handler.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/sequence-viewer/library-action-handler.test.ts`, change `makeHandler` to accept an optional presentation source and pass the new dep:

```ts
const LIVE_SOURCE = {
  primaryPropColors: { left: "#00ff00", right: "#ff00ff" },
  trail: {
    mode: "persistent",
    effect: "none",
    fadeDurationMs: 1,
    maxPoints: 1,
    lineWidth: 1,
    glowBlur: 0,
    leftColor: "#000000",
    rightColor: "#ffffff",
    additionalLayerColors: [],
    minOpacity: 0,
    maxOpacity: 1,
    trackingMode: "both_ends",
    hideProps: false,
    usePathCache: true,
    previewMode: false,
    tailLength: 5,
  },
  effects: {
    version: 38,
    tipEffectMap: { "*": { effect: "led" } },
    activePresets: {},
    activeEffect: "led",
    effectLayerOverrides: {},
    led: { intensity: 1 },
    fire: { intensity: 1 },
  },
};

function makeHandler(isOwned = true, presentationSource: unknown = LIVE_SOURCE) {
  const handler = createLibraryActionHandler({
    getSequence: () => sequence as never,
    getIsOwned: () => isOwned,
    getLeftPropType: () => undefined,
    getRightPropType: () => undefined,
    getCatDogModeEnabled: () => false,
    getHapticService: () => ({ trigger: vi.fn() }) as never,
    getPresentationSource: () => presentationSource as never,
    onDeleteSuccess: vi.fn(),
  });
  handler.syncSavedState(sequence as never);
  return handler;
}
```

Then append these tests inside the main `describe`:

```ts
  it("captures the live look and stores it pruned on save", async () => {
    mocks.saveSequence.mockResolvedValue({ persisted: true, sequenceId: "copy" });
    const handler = makeHandler(false);
    const pending = handler.handleSave();
    expect(handler.presentationSummary?.trailLabel).toBe("Persistent trail");
    handler.finishPropChoice(true);
    await pending;
    const stored = mocks.saveSequence.mock.calls[0]?.[0];
    expect(stored.creatorIntent.presentation.primaryPropColors).toEqual({
      left: "#00ff00",
      right: "#ff00ff",
    });
    expect(stored.creatorIntent.presentation.trail.mode).toBe("persistent");
    expect(stored.creatorIntent.presentation.trail).not.toHaveProperty("usePathCache");
    expect(stored.creatorIntent.presentation.effects.led).toEqual({ intensity: 1 });
    expect(stored.creatorIntent.presentation.effects).not.toHaveProperty("fire");
  });

  it("stores an explicit null when Use default look is on", async () => {
    mocks.saveSequence.mockResolvedValue({ persisted: true, sequenceId: "copy" });
    const handler = makeHandler(false);
    const pending = handler.handleSave();
    handler.useDefaultLook = true;
    handler.finishPropChoice(true);
    await pending;
    const stored = mocks.saveSequence.mock.calls[0]?.[0];
    expect(stored.creatorIntent).toHaveProperty("presentation");
    expect(stored.creatorIntent.presentation).toBeNull();
  });

  it("omits presentation when no live scene is available", async () => {
    mocks.saveSequence.mockResolvedValue({ persisted: true, sequenceId: "copy" });
    const handler = makeHandler(false, null);
    const pending = handler.handleSave();
    expect(handler.presentationSummary).toBeNull();
    handler.finishPropChoice(true);
    await pending;
    const stored = mocks.saveSequence.mock.calls[0]?.[0];
    expect(stored.creatorIntent).not.toHaveProperty("presentation");
  });

  it("resets the default-look switch after the dialog closes", async () => {
    const handler = makeHandler();
    const pending = handler.handleSave();
    handler.useDefaultLook = true;
    handler.finishPropChoice(false);
    await pending;
    expect(handler.useDefaultLook).toBe(false);
    expect(handler.presentationSummary).toBeNull();
  });
```

The test file mocks `PropType` with only STAFF and FAN; that is unrelated to these tests and stays.

- [ ] **Step 2: Run to verify they fail**

Run:
```bash
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/sequence-viewer/library-action-handler.test.ts
```
Expected: type error or FAIL on `getPresentationSource` / `presentationSummary` / `useDefaultLook` being unknown.

- [ ] **Step 3: Implement in the handler**

In `src/lib/shared/sequence-viewer/state/library-action-handler.svelte.ts`:

Add imports after the existing `import type { PropType } ...` line:

```ts
import {
  capturePresentation,
  resolvePresentation,
  summarizePresentation,
  type PresentationSource,
  type PresentationSummary,
} from "$lib/shared/foundation/services/presentation-intent";
import type { PresentationIntent } from "$lib/shared/foundation/domain/models/presentation-intent";
```

Extend the deps interface:

```ts
export interface LibraryActionHandlerDeps {
  getSequence: () => SequenceData | null;
  getIsOwned: () => boolean;
  getLeftPropType: () => PropType | undefined;
  getRightPropType: () => PropType | undefined;
  getCatDogModeEnabled: () => boolean | undefined;
  /** The live scene's look, or null when this surface has no animation scope. */
  getPresentationSource: () => PresentationSource | null;
  getHapticService: () => HapticFeedback | null;
  onDeleteSuccess: () => void;
}
```

(Keep any other existing members of the interface; only add `getPresentationSource`.)

Inside `createLibraryActionHandler`, after the `saveProps` / `resolveSaveProps` declarations add:

```ts
  let capturedPresentation = $state<PresentationIntent | null>(null);
  let useDefaultLook = $state(false);
  const presentationSummary = $derived<PresentationSummary | null>(
    capturedPresentation
      ? (() => {
          const resolved = resolvePresentation({ presentation: capturedPresentation });
          return resolved.kind === "recorded" ? summarizePresentation(resolved.value) : null;
        })()
      : null
  );
```

Change `finishPropChoice` to also clear the presentation state after resolving:

```ts
  function finishPropChoice(save: boolean) {
    resolveSaveProps?.(save ? saveProps : null);
    resolveSaveProps = null;
    saveProps = null;
  }
```

stays as is, and in `handleSave` replace the block from `saveProps = captureActivePropConfig({` through the `coordinator.save(...)` call with:

```ts
    saveProps = captureActivePropConfig({
      leftPropType: deps.getLeftPropType(),
      rightPropType: deps.getRightPropType(),
      catDogMode: deps.getCatDogModeEnabled(),
    });
    const source = deps.getPresentationSource();
    capturedPresentation = source ? capturePresentation(source) : null;
    useDefaultLook = false;
    const selectedProps = await new Promise<ResolvedPropConfig | null>(
      (resolve) => {
        resolveSaveProps = resolve;
      }
    );
    const presentationIntent = capturedPresentation
      ? { presentation: useDefaultLook ? null : capturedPresentation }
      : {};
    capturedPresentation = null;
    useDefaultLook = false;
    if (!selectedProps) return;

    savedStateRevision += 1;
    isSaving = true;

    try {
      const coordinator = await getVisualSequenceSaveCoordinator();
      const outcome = await coordinator.save(sequence, {
        leftPropType: selectedProps.leftPropType,
        rightPropType: selectedProps.rightPropType,
        catDogModeEnabled: selectedProps.catDogMode,
        pathShape: getAnimationVisibilityManager().getPathShape(),
        ...presentationIntent,
      });
```

The rest of `handleSave` is unchanged.

Add to the returned object, next to the `saveProps` accessors:

```ts
    get useDefaultLook() {
      return useDefaultLook;
    },
    set useDefaultLook(value: boolean) {
      useDefaultLook = value;
    },
    get presentationSummary() {
      return presentationSummary;
    },
```

- [ ] **Step 4: Run to verify they pass**

Same command. Expected: PASS, whole file.

- [ ] **Step 5: Fix the one other caller of the deps type**

`tests/unit/public-collection-live-choreo-contract.test.ts` references the handler; run it:

```bash
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/public-collection-live-choreo-contract.test.ts
```
Expected: PASS. If it constructs the handler and now fails on the missing dep, add `getPresentationSource: () => null,` to that construction.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/sequence-viewer/state/library-action-handler.svelte.ts tests/unit/sequence-viewer/library-action-handler.test.ts tests/unit/public-collection-live-choreo-contract.test.ts
git commit -m "feat(viewer): capture the live look when saving to library

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

If the second test file needed no change, drop it from `git add`.

---

### Task 6: Orchestrator supplies the live scene, dialog shows the summary and switch

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte:869-877` and `:1245-1250`
- Modify: `src/lib/shared/library/components/SavePropDialog.svelte`

No unit test: the handler test in Task 5 covers the logic; the visual pass in Task 11 covers the dialog.

- [ ] **Step 1: Supply the source from the orchestrator**

In `SequenceViewerOrchestrator.svelte`, the `createLibraryActionHandler({...})` call becomes:

```ts
  const libraryActions = createLibraryActionHandler({
    getSequence: () => sequence,
    getIsOwned: () => isOwned,
    getLeftPropType: () => getSettings().leftPropType,
    getRightPropType: () => getSettings().rightPropType,
    getCatDogModeEnabled: () => getSettings().catDogMode,
    getPresentationSource: () => ({
      primaryPropColors: getAppSettings().primaryPropColors ?? null,
      trail: animationSettings.trail,
      effects: effectsConfigState.config,
    }),
    getHapticService: () => interactive.hapticService,
    onDeleteSuccess: () => handleClose(),
  });
```

`getAppSettings` is already imported at line 100 as an alias of `getSettings` from app-state; `animationSettings` at line 84; `effectsConfigState` is the const created at line 692. If `getSettings` in this file is a different local function than `getAppSettings`, keep whichever one already returns `AppSettings` with `primaryPropColors`; the two lines above it use `getSettings().leftPropType`, so `getSettings().primaryPropColors` is equally valid. Use the same one as the neighboring lines.

- [ ] **Step 2: Bind the dialog**

Replace the `<SavePropDialog ... />` block:

```svelte
{#if libraryActions.saveProps}
  <SavePropDialog
    bind:value={libraryActions.saveProps}
    presentationSummary={libraryActions.presentationSummary}
    bind:useDefaultLook={libraryActions.useDefaultLook}
    onSave={() => libraryActions.finishPropChoice(true)}
    onCancel={() => libraryActions.finishPropChoice(false)}
  />
{/if}
```

- [ ] **Step 3: Extend the dialog**

Replace `src/lib/shared/library/components/SavePropDialog.svelte` with:

```svelte
<script lang="ts">
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import PropPairField from "$lib/shared/pictograph/prop/components/PropPairField.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import type { ResolvedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
  import type { PresentationSummary } from "$lib/shared/foundation/services/presentation-intent";
  let {
    value = $bindable(),
    presentationSummary = null,
    useDefaultLook = $bindable(false),
    onSave,
    onCancel,
  }: {
    value: ResolvedPropConfig;
    /** Null when the surface has no live scene to capture. */
    presentationSummary?: PresentationSummary | null;
    useDefaultLook?: boolean;
    onSave: () => void;
    onCancel: () => void;
  } = $props();
  const titleId = $props.id();

  const lookText = $derived.by(() => {
    if (!presentationSummary) return "";
    const parts = [presentationSummary.trailLabel];
    parts.push(
      presentationSummary.effectLabels.length
        ? presentationSummary.effectLabels.join(", ")
        : "no effects"
    );
    return parts.join(" · ");
  });
</script>

<BaseModal open={true} onclose={onCancel} size="fit" labelledBy={titleId}>
  {#snippet header()}<h2 id={titleId}>Save to Library</h2>{/snippet}
  <div class="body">
    <PropPairField bind:value />
    <p>Used when someone chooses As saved.</p>
    {#if presentationSummary}
      <div class="look" class:muted={useDefaultLook}>
        <span class="look-label">Saved look</span>
        <span class="swatches" aria-hidden="true">
          {#if presentationSummary.colors}
            <span class="swatch" style:background={presentationSummary.colors.left}></span>
            <span class="swatch" style:background={presentationSummary.colors.right}></span>
          {:else}
            <span class="swatch theme-left"></span>
            <span class="swatch theme-right"></span>
          {/if}
        </span>
        <span class="look-text">
          {presentationSummary.colors ? "Custom colors" : "Theme colors"} · {lookText}
        </span>
        <FilterChipBase
          label="Use default look"
          mode="toggle"
          active={useDefaultLook}
          labelScale="readable"
          onclick={() => (useDefaultLook = !useDefaultLook)}
        />
      </div>
    {/if}
  </div>
  {#snippet footer()}
    <div class="actions">
      <PanelButton variant="secondary" onclick={onCancel}>Cancel</PanelButton>
      <PanelButton onclick={onSave}>Save</PanelButton>
    </div>
  {/snippet}
</BaseModal>

<style>
  .body {
    padding: 0 20px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 20px;
  }
  h2 {
    padding: 20px;
    margin: 0;
    font-size: var(--font-size-lg, 18px);
  }
  p {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
  }
  .look {
    display: grid;
    grid-template-columns: auto auto 1fr;
    grid-template-areas:
      "label swatches text"
      "chip chip chip";
    align-items: center;
    column-gap: 10px;
    row-gap: 10px;
    padding: 12px 0 16px;
    font-size: var(--font-size-sm, 14px);
  }
  .look.muted .look-text,
  .look.muted .swatches {
    opacity: 0.45;
  }
  .look-label {
    grid-area: label;
    color: var(--theme-text-dim);
  }
  .swatches {
    grid-area: swatches;
    display: inline-flex;
    gap: 4px;
  }
  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--theme-border, rgba(255, 255, 255, 0.2));
  }
  .swatch.theme-left {
    background: var(--theme-swatch-left);
  }
  .swatch.theme-right {
    background: var(--theme-swatch-right);
  }
  .look-text {
    grid-area: text;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .look :global(.filter-chip),
  .look > :last-child {
    grid-area: chip;
    justify-self: start;
  }
</style>
```

There is no CSS token for the theme prop colors; the app derives them from `getMotionColor(HandSide.LEFT | RIGHT, "dark")` in `$lib/shared/utils/svg-color-utils`. Set the two swatch custom properties inline from that function so the dots match the canvas exactly. Add to the script block:

```ts
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  const themeLeft = getMotionColor(HandSide.LEFT, "dark");
  const themeRight = getMotionColor(HandSide.RIGHT, "dark");
```

and change the `.look` wrapper's opening tag to:

```svelte
      <div
        class="look"
        class:muted={useDefaultLook}
        style:--theme-swatch-left={themeLeft}
        style:--theme-swatch-right={themeRight}
      >
```

- [ ] **Step 4: Type gate**

```bash
pnpm run check:tsc
```
Expected: exit 0. Fix any error the gate names in the three files above before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte src/lib/shared/library/components/SavePropDialog.svelte
git commit -m "feat(viewer): save dialog shows the saved look with a default-look switch

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Publish-moment capture stamps presentation when absent

**Files:**
- Modify: `src/lib/features/library/services/library-save-service.ts:220-240` and its imports
- Test: `tests/unit/library-save-service-persisted.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/library-save-service-persisted.test.ts`, extend the settings mock at line 83 so it also carries colors:

```ts
vi.mock("$lib/shared/settings/state/settings-state.svelte", () => ({
  settingsService: {
    settings: {
      leftPropType: "club",
      rightPropType: "club",
      catDogMode: false,
      primaryPropColors: { left: "#123456", right: "#abcdef" },
    },
  },
}));
```

Add these two mocks next to the other `vi.mock` calls (before the dynamic `await import` of the service):

```ts
vi.mock("$lib/shared/animation-engine/state/animation-settings-state.svelte", () => ({
  animationSettings: {
    trail: {
      mode: "loop_clear",
      effect: "glow",
      fadeDurationMs: 2500,
      maxPoints: 1000,
      lineWidth: 4,
      glowBlur: 2.5,
      leftColor: "#000000",
      rightColor: "#ffffff",
      additionalLayerColors: [],
      minOpacity: 0.25,
      maxOpacity: 1,
      trackingMode: "both_ends",
      hideProps: false,
      usePathCache: true,
      previewMode: false,
      tailLength: 20,
    },
  },
}));

vi.mock("$lib/shared/effects/state/effects-config-state.svelte", () => ({
  loadPersistedEffectsConfig: () => ({
    version: 38,
    tipEffectMap: { "*": { effect: "sparkles" } },
    activePresets: {},
    activeEffect: "sparkles",
    effectLayerOverrides: {},
    sparkles: { density: 2 },
    fire: { intensity: 1 },
  }),
}));
```

Append inside `describe("LibrarySaveService.saveSequence - publication-moment intent capture", ...)`:

```ts
  it("stamps the creator's active look on a public save with no presentation", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(makeSequence({ steps: publicSteps }), {
      ...makeOptions(),
      visibility: "public",
    });
    const stored = dbPutMock.mock.calls[0]?.[0];
    expect(stored.creatorIntent.presentation.primaryPropColors).toEqual({
      left: "#123456",
      right: "#abcdef",
    });
    expect(stored.creatorIntent.presentation.trail.mode).toBe("loop_clear");
    expect(stored.creatorIntent.presentation.effects.sparkles).toEqual({ density: 2 });
    expect(stored.creatorIntent.presentation.effects).not.toHaveProperty("fire");
  });

  it("never restamps a recorded or default-look presentation", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(
      makeSequence({ steps: publicSteps, creatorIntent: { presentation: null } }),
      { ...makeOptions(), visibility: "public" }
    );
    expect(dbPutMock.mock.calls[0]?.[0].creatorIntent.presentation).toBeNull();
  });

  it("does not stamp presentation on a private save", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(makeSequence({ steps: publicSteps }), {
      ...makeOptions(),
      visibility: "private",
    });
    expect(dbPutMock.mock.calls[0]?.[0].creatorIntent ?? {}).not.toHaveProperty(
      "presentation"
    );
  });
```

`makeSequence` and `makeOptions` already exist in the file; check that `makeSequence` spreads its argument onto the base sequence so `creatorIntent` passes through (the existing "never restamps an existing recording" test relies on the same thing).

- [ ] **Step 2: Run to verify they fail**

Run:
```bash
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/library-save-service-persisted.test.ts
```
Expected: the first new test FAILS (presentation undefined). If existing tests in the file now fail because the new mocks are missing exports the service imports, add the missing export names to the mock factories with `vi.fn()` values.

- [ ] **Step 3: Implement the stamp**

In `src/lib/features/library/services/library-save-service.ts`, add imports next to the `captureActivePropConfig` import block:

```ts
import {
  capturePresentation,
  resolvePresentation,
} from "$lib/shared/foundation/services/presentation-intent";
import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
import { loadPersistedEffectsConfig } from "$lib/shared/effects/state/effects-config-state.svelte";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
```

Replace the block from `const capturedIntent =` through the closing `}),` of the `...(capturedIntent && {...})` spread with:

```ts
    const capturedIntent =
      visibility === "public" && !resolveRecordedPropConfig(resolvedSequence)
        ? captureActivePropConfig(settingsService.settings)
        : null;
    // Same publication-moment rule for the look: a public save with nothing
    // recorded stamps what the creator is looking at. Recorded and explicit
    // default-look (null) sequences are never restamped; private saves are
    // working saves.
    const capturedPresentation =
      visibility === "public" &&
      resolvePresentation(resolvedSequence.creatorIntent, resolvedSequence.id).kind ===
        "absent"
        ? capturePresentation({
            primaryPropColors: settingsService.settings.primaryPropColors ?? null,
            trail: animationSettings.trail,
            effects: loadPersistedEffectsConfig() ?? DEFAULT_EFFECTS_CONFIG,
          })
        : null;
    const sequenceToSave = withCanonicalStepCount({
      ...resolvedSequence,
      ...((capturedIntent || capturedPresentation) && {
        creatorIntent: {
          ...resolvedSequence.creatorIntent,
          ...(capturedIntent && { propConfig: capturedIntent }),
          ...(capturedPresentation && { presentation: capturedPresentation }),
        },
        ...(capturedIntent && { intendedProp: capturedIntent }),
      }),
```

Keep everything after that (`name,`, `displayName`, …) exactly as it is.

- [ ] **Step 4: Run to verify they pass**

Same command. Expected: PASS, whole file, including the two pre-existing publication-moment tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/library/services/library-save-service.ts tests/unit/library-save-service-persisted.test.ts
git commit -m "feat(library): stamp creator presentation on first public save

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Viewing resolver

**Files:**
- Create: `src/lib/shared/sequence-preview/services/viewing-presentation.ts`
- Test: `tests/unit/sequence-preview/viewing-presentation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sequence-preview/viewing-presentation.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_TRAIL_SETTINGS, TrailMode } from "$lib/shared/animation-engine/domain/types/trail-types";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { capturePresentation } from "$lib/shared/foundation/services/presentation-intent";
import { resolveViewingPresentation } from "$lib/shared/sequence-preview/services/viewing-presentation";

const recorded = capturePresentation({
  primaryPropColors: { left: "#111111", right: "#222222" },
  trail: { ...DEFAULT_TRAIL_SETTINGS, mode: TrailMode.PERSISTENT },
  effects: { ...structuredClone(DEFAULT_EFFECTS_CONFIG), tipEffectMap: { "*": { effect: "fire" } } },
});

describe("resolveViewingPresentation", () => {
  it("returns the recorded look for a recorded sequence", () => {
    const value = resolveViewingPresentation({
      id: "s1",
      creatorIntent: { presentation: recorded },
    } as unknown as SequenceData);
    expect(value.primaryPropColors).toEqual({ left: "#111111", right: "#222222" });
    expect(value.trail.mode).toBe(TrailMode.PERSISTENT);
    expect(value.effects.tipEffectMap).toEqual({ "*": { effect: "fire" } });
  });

  it("returns neutral for null, absent, legacy, and no sequence", () => {
    const neutralCases = [
      null,
      { id: "a" },
      { id: "b", creatorIntent: null },
      { id: "c", creatorIntent: { presentation: null } },
      { id: "d", intendedProp: { leftPropType: "staff", rightPropType: "staff", catDogMode: false } },
    ] as unknown as (SequenceData | null)[];
    for (const sequence of neutralCases) {
      const value = resolveViewingPresentation(sequence);
      expect(value.primaryPropColors).toBeNull();
      expect(value.trail).toEqual(DEFAULT_TRAIL_SETTINGS);
      expect(value.effects).toEqual(DEFAULT_EFFECTS_CONFIG);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/sequence-preview/viewing-presentation.test.ts
```
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement**

```ts
// src/lib/shared/sequence-preview/services/viewing-presentation.ts
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  neutralPresentation,
  resolvePresentation,
  type ResolvedPresentationValue,
} from "$lib/shared/foundation/services/presentation-intent";

/**
 * The look a public surface renders a sequence with. Mode-free by design:
 * the viewer's own settings are never an input. Recorded intent wins;
 * everything else (explicit default, legacy, malformed, no sequence) is the
 * one neutral look. See the 2026-09-17 creator presentation intent spec.
 */
export function resolveViewingPresentation(
  sequence: SequenceData | null | undefined
): ResolvedPresentationValue {
  const resolved = resolvePresentation(sequence?.creatorIntent, sequence?.id ?? "unknown");
  return resolved.kind === "recorded" ? resolved.value : neutralPresentation();
}
```

- [ ] **Step 4: Run to verify it passes**

Same command. Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-preview/services/viewing-presentation.ts tests/unit/sequence-preview/viewing-presentation.test.ts
git commit -m "feat(preview): resolve the viewing presentation for public surfaces

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Explicit null colors through the canvas chain

**Files:**
- Modify: `src/lib/shared/animation-engine/components/CanvasSurface.svelte:156` and `:485-486`
- Modify: `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte:169`
- Modify: `src/lib/shared/animation-engine/components/SplitCanvasView.svelte:108`
- Modify: `src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte:355`
- Modify: `src/lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte` Props (`primaryPropColors?: ViewerCustomColorPair;`)

No unit test: these are type widenings plus one conditional; Task 10's wiring and Task 11's visual pass exercise them.

- [ ] **Step 1: Widen the four prop types**

In each of the four component files, change the declaration to accept `null`:

`CanvasSurface.svelte` line 156:
```ts
    /** undefined = fall back to the viewer's Settings; null = theme default. */
    primaryPropColors?: TunnelPropColorPair | null;
```

`AnimatorCanvas.svelte` line 169:
```ts
    primaryPropColors?: TunnelPropColorPair | null;
```

`SplitCanvasView.svelte` line 108:
```ts
    primaryPropColors?: ViewerCustomColorPair | null;
```

`InlineAnimationPlayer.svelte` line 355:
```ts
    primaryPropColors?: ViewerCustomColorPair | null;
```

`SequenceShowcasePreview.svelte` Props:
```ts
    primaryPropColors?: ViewerCustomColorPair | null;
```

- [ ] **Step 2: Make CanvasSurface distinguish undefined from null**

Replace lines 485-486 of `CanvasSurface.svelte`:

```ts
      primaryPropColors:
        primaryPropColors !== undefined
          ? primaryPropColors
          : (getSettings().primaryPropColors ?? null),
```

- [ ] **Step 3: Type gate**

```bash
pnpm run check:tsc
```
Expected: exit 0. If a downstream consumer of `props.primaryPropColors` in the engine rejects `null`, it already receives `null` today via the old `?? null`, so the error is a declared type only; widen that declaration to `| null` and re-run.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/animation-engine/components/CanvasSurface.svelte src/lib/shared/animation-engine/components/AnimatorCanvas.svelte src/lib/shared/animation-engine/components/SplitCanvasView.svelte src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte src/lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte
git commit -m "refactor(canvas): explicit null prop colors mean theme default

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Showcase preview and artifact tile render the creator's look

**Files:**
- Modify: `src/lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte`
- Modify: `src/lib/features/creators/components/profile/stage/ArtifactTile.svelte`

- [ ] **Step 1: Apply the resolved look in SequenceShowcasePreview**

Add imports in the script block:

```ts
  import { untrack } from "svelte";
  import { resolveViewingPresentation } from "$lib/shared/sequence-preview/services/viewing-presentation";
```

(Keep `untrack` out if the file already imports it.)

After `const recordedPropConfig = $derived(resolveRecordedPropConfig(sequence));` add:

```ts
  // Creator-recorded look (colors, trail, effects), resolved once per sequence
  // and pushed into this preview's own ephemeral scope. Mode-free: the
  // visitor's settings never reach a public card. A caller-supplied
  // primaryPropColors prop still wins for surfaces that deliberately recolor.
  const viewingPresentation = $derived(resolveViewingPresentation(sequence));
  const playerPropColors = $derived(
    primaryPropColors !== undefined
      ? primaryPropColors
      : viewingPresentation.primaryPropColors
  );

  $effect(() => {
    const look = viewingPresentation;
    untrack(() => {
      previewAnimationScope.settings.updateSettings({ trail: look.trail });
      previewAnimationScope.effects.replace(look.effects);
    });
  });
```

In the player `props={{ ... }}` object replace the line `primaryPropColors,` with:

```ts
            primaryPropColors: playerPropColors,
```

`trailSettingsOverride: previewAnimationScope.settings.trail` and `effectsConfigState: previewAnimationScope.effects` already hand the scope to the player; leave them.

- [ ] **Step 2: Give ArtifactTile its own scope and the same resolution**

In `ArtifactTile.svelte` add imports:

```ts
  import { untrack } from "svelte";
  import { createAnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
  import { resolveRecordedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
  import { resolveViewingPresentation } from "$lib/shared/sequence-preview/services/viewing-presentation";
```

Replace the `seqPropTypes` derived:

```ts
  // Creator-recorded prop pair wins on the creator's own stage; the visitor's
  // props are only a fallback for legacy records with nothing recorded.
  const recordedPropConfig = $derived(resolveRecordedPropConfig(sequence));
  const seqPropTypes = $derived({
    left: recordedPropConfig?.leftPropType ?? settingsService.settings.leftPropType ?? "staff",
    right: recordedPropConfig?.rightPropType ?? settingsService.settings.rightPropType ?? "staff",
  });

  const tileAnimationScope = createAnimationScope({ persistence: "ephemeral" });
  const viewingPresentation = $derived(resolveViewingPresentation(sequence));
  $effect(() => {
    const look = viewingPresentation;
    untrack(() => {
      tileAnimationScope.settings.updateSettings({ trail: look.trail });
      tileAnimationScope.effects.replace(look.effects);
    });
  });
```

In the `InlineAnimationPlayer` `props={{ ... }}` object add four entries after `rightPropType: seqPropTypes.right,`:

```ts
                  primaryPropColors: viewingPresentation.primaryPropColors,
                  visibilityManagerOverride: tileAnimationScope.visibility,
                  effectsConfigState: tileAnimationScope.effects,
                  trailSettingsOverride: tileAnimationScope.settings.trail,
```

- [ ] **Step 3: Type gate and the nearest existing tests**

```bash
pnpm run check:tsc
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/inbox/inbox-inline-sequence-player-contract.test.ts tests/unit/public-collection-live-choreo-contract.test.ts
```
Expected: exit 0 and PASS. If a contract test asserts the exact props the showcase preview hands the player, update its expectation to include `primaryPropColors` as the resolved value and note it in the commit body.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte src/lib/features/creators/components/profile/stage/ArtifactTile.svelte
git commit -m "feat(creators): public cards render the creator's saved look

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Visual verification on /creators and the save dialog

**Files:** none modified unless a defect is found.

Follow `.claude/rules/visual-verification-mandatory.md`. This is a focused pass on two surfaces: the Recent Work card (appearance only, no geometry change) and the save dialog (one added row, so check the dialog at the iPhone SE, laptop, and 4K 100% tiers).

- [ ] **Step 1: Start the dev server from the primary checkout**

Per `.claude/rules/never-start-the-dev-server.md` and the worktree rule, the primary checkout owns the dev server. Follow the memory note "Worktree dev server gotcha": run the primary's vite with a temporary `.mts` config that allows `E:/tka-platform/node_modules`, pointed at this worktree. If that note's recipe is unavailable, use the launch configuration in `.claude/launch.json` named for the worktree, if present, otherwise ask Austen which port to use and stop.

- [ ] **Step 2: Produce two sequences with different looks**

In the dedicated agent browser (`pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank`), signed in as the test account already configured for that browser:

1. Open the sequence viewer for any owned sequence. In Settings set custom prop colors to green/magenta, in the effects panel set the tip effect to LED, in the trail panel choose Persistent. Save to library as public. Confirm the dialog shows "Custom colors · Persistent trail · LED" and the chip is off.
2. Change Settings colors back to theme default, tip effect to Fire, trail to Fade. Save a second sequence public with the chip ON ("Use default look").
3. Change the viewer's Settings colors to orange/cyan and tip effect to Sparkles.

- [ ] **Step 3: Verify the cards**

Open `/creators`. In Recent Work:
- Sequence 1 renders green/magenta, persistent trail, LED tips.
- Sequence 2 renders theme blue/red, fade trail, and the neutral default effect (trails).
- Neither card shows orange/cyan or sparkles.

Capture one WebP screenshot at quality 70 of the Recent Work row at the laptop tier, and one of the save dialog at each of the three tiers named above. Save under the scratchpad directory and list the paths in the task report.

- [ ] **Step 4: Verify the editor still uses the viewer's look**

Open sequence 1 in Create (remix) and confirm it renders orange/cyan with sparkles there. That is the adoption boundary from the August contract.

- [ ] **Step 5: Record evidence**

Write the observations and screenshot paths into the task report. No commit unless a defect was fixed; if one was, commit it with the fix scoped to the file it touched.

---

### Task 12: Firestore field override for the presentation blob

**Files:**
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Run the two gates from the Firestore cost rule**

```bash
grep -rn "where(\|orderBy(" src/lib firebase-functions/src scripts | grep "creatorIntent"
grep -n "creatorIntent" firestore.indexes.json
```
Expected: both print nothing. If the first prints a query on `creatorIntent.presentation`, stop and report it; the override cannot be added.

- [ ] **Step 2: Add the overrides**

In `firestore.indexes.json`, inside the `fieldOverrides` array, after the `publicSequences` / `startPosition` entry, add:

```json
    {
      "collectionGroup": "publicSequences",
      "fieldPath": "creatorIntent.presentation",
      "indexes": []
    },
    {
      "collectionGroup": "sequences",
      "fieldPath": "creatorIntent.presentation",
      "indexes": []
    }
```

Keep valid JSON: the previous last entry needs a trailing comma.

- [ ] **Step 3: Validate the file parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8')); console.log('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add firestore.indexes.json
git commit -m "chore(firestore): exempt creatorIntent.presentation from single-field indexes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Deployment of the index change is a separate, Austen-driven step (`firebase deploy --only firestore:indexes` after reviewing the drift report). Do not deploy from this plan.

---

### Task 13: Full gate and finish

- [ ] **Step 1: Run the unit suite and the type check**

```bash
pnpm run test:ci
pnpm run check
```
Expected: both exit 0. Fix anything that fails in files this branch touched; anything failing in untouched files gets reported, not fixed.

- [ ] **Step 2: Mark the spec in-flight to shipped in the index**

In `docs/superpowers/specs/INDEX.md`, change the row for `2026-09-17-creator-presentation-intent-design.md` status from `**IN-FLIGHT**` to `**SHIPPED**`, evidence to the merge commit once known (fill after `wt:finish`), and clear the Next action column. Adjust the `creators` heading counts accordingly.

```bash
git add docs/superpowers/specs/INDEX.md
git commit -m "docs: mark creator presentation intent shipped

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Bring the branch current and finish**

From the worktree:
```bash
git fetch origin main 2>/dev/null; git merge --no-edit main
```
Re-run only `pnpm run check:tsc` if the merge touched any file this branch touched.

Then leave the worktree and run the guarded finish from the primary checkout:

```powershell
Set-Location E:/tka-platform
npm run wt:finish -- codex/creator-presentation-intent --route /creators
```

If a gate fails, stop with the branch and worktree intact and report the exact blocker.

---

## Self-review

**Spec coverage.** Schema and pure module: Task 1. Null preservation: Task 2. Save dialog capture: Tasks 5, 6. Publish-moment capture: Task 7. Firestore override: Task 12. Viewing resolver: Task 8. Ephemeral effects leak: Task 3. Explicit null colors: Task 9. Showcase and ArtifactTile wiring: Task 10. No viewer setting: nothing to build, confirmed by the resolver taking only the sequence. Visual pass: Task 11. Playback mode explicitly out of scope: no task, matching the spec.

**Type consistency.** `capturePresentation(source: PresentationSource)`, `resolvePresentation(intent, warnKey?)`, `neutralPresentation()`, `summarizePresentation(value)`, `resolveViewingPresentation(sequence)` are used with the same names and shapes in Tasks 1, 5, 7, 8, 10. `presentationSummary` and `useDefaultLook` on the handler match the dialog props in Task 6. `PresentationSummary` fields `colors`, `trailLabel`, `effectLabels` match between Task 1 and Task 6.

**Placeholders.** None. Two label strings in Task 1 are checked against the registry rather than assumed.
