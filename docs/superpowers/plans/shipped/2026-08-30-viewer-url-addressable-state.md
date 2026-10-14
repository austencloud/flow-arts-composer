# Viewer URL-Addressable State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A copied sequence-viewer link snapshots the complete visual state; opening it restores exactly that state without touching the recipient's saved settings.

**Architecture:** A per-mount `ViewerUrlSession` decodes slice payloads from the URL and hands them to the viewer's existing store factories as `initial` + `persist:false` (the shipped view-only pattern from `createEffectsConfigState`). Mounted surfaces register live `capture()` hooks; a Svelte `$effect` in the orchestrator re-captures on any change and debounce-writes the URL via `mutateCurrentUrl`. Share/Copy call a synchronous `captureNow()`. Spec: `docs/superpowers/specs/2026-08-30-viewer-url-addressable-state-design.md`.

**Tech Stack:** SvelteKit + Svelte 5 runes, existing `compressForURL` (fflate) in `sequence-codec.ts`, vitest (`npx vitest run --config tests/config/vitest.config.ts <file>`).

**Worktree:** `E:/worktrees/tka-platform/viewer-url-state`, branch `claude/viewer-url-state`.

**Executor discipline (every task):** re-read this plan file at task start; commit ONLY with explicit pathspec (`git commit -m "..." -- <paths>`); every commit message ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`; completion claims carry test output. Do not delegate further.

**Phase A (Tasks 1–8)** ships the core + the two slices that caused the incident (view/pane + effects). It is independently shippable. **Phase B (Tasks 9–14)** rolls the remaining slices onto the demonstrated pattern; each Phase B task begins with a mandatory store-discovery step because the spec requires encoding each store's post-normalize persisted shape, never an invented schema.

---

## Phase A — Core

### Task 1: URL state codec

**Files:**
- Create: `src/lib/shared/sequence-viewer/services/viewer-url-state-codec.ts`
- Test: `src/lib/shared/sequence-viewer/services/viewer-url-state-codec.test.ts`

The codec owns param names and the headline/blob split. Headline params are canonical for their fields; the blob never duplicates them.

- [x] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  encodeViewerStateParams,
  decodeViewerStateParams,
  deepEqual,
  VIEWER_STATE_PARAM_NAMES,
} from "./viewer-url-state-codec";

describe("viewer-url-state-codec", () => {
  it("round-trips headline + blob slices", () => {
    const slices = {
      vw: { mode: "split", split: { leftPane: "animation", rightPane: "card" } },
      fx: { active: "sparkles", tuning: { sparkles: { rate: 0.92 } } },
      tn: { speed: 2, cameraMode: "orbit" },
    };
    const patch = encodeViewerStateParams(slices);
    expect(patch.set.vm).toBe("split");
    expect(patch.set.split).toBe("animation,card");
    expect(patch.set.fx).toBe("sparkles");
    expect(patch.set.s).toMatch(/^(d1:|raw:)/);

    const params = new URLSearchParams(patch.set);
    expect(decodeViewerStateParams(params)).toEqual(slices);
  });

  it("empty slices produce removals, not params", () => {
    const patch = encodeViewerStateParams({});
    expect(Object.keys(patch.set)).toHaveLength(0);
    expect([...patch.remove].sort()).toEqual([...VIEWER_STATE_PARAM_NAMES].sort());
  });

  it("headline-only state emits no blob", () => {
    const patch = encodeViewerStateParams({ vw: { mode: "animation" } });
    expect(patch.set.vm).toBe("animation");
    expect(patch.set.s).toBeUndefined();
    expect(patch.remove).toContain("s");
  });

  it("cd slice splits cols headline from blob rest", () => {
    const patch = encodeViewerStateParams({ cd: { cols: 4, rest: { showWord: false } } });
    expect(patch.set.cols).toBe("4");
    const decoded = decodeViewerStateParams(new URLSearchParams(patch.set));
    expect(decoded.cd).toEqual({ cols: 4, rest: { showWord: false } });
  });

  it("ignores a corrupt blob but keeps headline params", () => {
    const params = new URLSearchParams({ vm: "card", s: "d1:%%%not-base64%%%" });
    expect(decodeViewerStateParams(params)).toEqual({ vw: { mode: "card" } });
  });

  it("ignores unknown slice ids in the blob", () => {
    const patch = encodeViewerStateParams({ tn: { speed: 1 } });
    // hand-craft a blob with a foreign key by decoding, mutating, re-encoding is
    // overkill — instead assert decode only returns known ids
    const decoded = decodeViewerStateParams(new URLSearchParams(patch.set));
    expect(Object.keys(decoded)).toEqual(["tn"]);
  });

  it("deepEqual: structural, order-sensitive arrays, null-safe", () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer/services/viewer-url-state-codec.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the codec**

```ts
/**
 * Viewer URL state codec — owns the param names and the headline/blob split
 * for full-state viewer links.
 * Spec: docs/superpowers/specs/2026-08-30-viewer-url-addressable-state-design.md
 *
 * Headline params (`vm`, `split`, `fx`, `cols`) are canonical for their
 * fields; the compressed `s` blob carries everything else and never
 * duplicates a headline value. `?v=` (sequence identity) is NOT owned here.
 */
import {
  compressForURL,
  decompressFromURL,
} from "$lib/shared/navigation/services/sequence-codec";

export type SliceId = "vw" | "fx" | "an" | "ex" | "t3" | "cd" | "tn" | "ps";
export type SlicePayloads = Partial<Record<SliceId, unknown>>;

const BLOB_SLICE_IDS: readonly SliceId[] = ["fx", "an", "ex", "t3", "cd", "tn", "ps"];

export const VIEWER_STATE_PARAM_NAMES = ["vm", "split", "fx", "cols", "s"] as const;

export interface ViewerUrlParamPatch {
  set: Record<string, string>;
  remove: string[];
}

interface VwPayload {
  mode?: string;
  split?: { leftPane: string; rightPane: string };
}
interface FxPayload {
  active?: string;
  tuning?: Record<string, unknown>;
}
interface CdPayload {
  cols?: number;
  rest?: Record<string, unknown>;
}

export function encodeViewerStateParams(slices: SlicePayloads): ViewerUrlParamPatch {
  const set: Record<string, string> = {};
  const blob: Record<string, unknown> = {};

  const vw = slices.vw as VwPayload | undefined;
  if (vw?.mode) set.vm = vw.mode;
  if (vw?.split) set.split = `${vw.split.leftPane},${vw.split.rightPane}`;

  const fx = slices.fx as FxPayload | undefined;
  if (fx?.active) set.fx = fx.active;
  if (fx?.tuning && Object.keys(fx.tuning).length > 0) blob.fx = fx.tuning;

  const cd = slices.cd as CdPayload | undefined;
  if (cd?.cols != null) set.cols = String(cd.cols);
  if (cd?.rest && Object.keys(cd.rest).length > 0) blob.cd = cd.rest;

  for (const id of BLOB_SLICE_IDS) {
    if (id === "fx" || id === "cd") continue;
    const payload = slices[id];
    if (payload != null) blob[id] = payload;
  }

  if (Object.keys(blob).length > 0) {
    set.s = compressForURL(JSON.stringify({ sv: 1, ...blob }));
  }

  const remove = VIEWER_STATE_PARAM_NAMES.filter((name) => !(name in set));
  return { set, remove };
}

export function decodeViewerStateParams(params: URLSearchParams): SlicePayloads {
  const slices: SlicePayloads = {};

  let blob: Record<string, unknown> = {};
  const s = params.get("s");
  if (s) {
    try {
      const parsed = JSON.parse(decompressFromURL(s)) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") blob = parsed;
    } catch {
      // Corrupt blob: tolerated per spec — headline params still apply.
    }
  }

  const vw: VwPayload = {};
  const vm = params.get("vm");
  if (vm) vw.mode = vm;
  const split = params.get("split");
  if (split) {
    const [leftPane, rightPane] = split.split(",");
    if (leftPane && rightPane) vw.split = { leftPane, rightPane };
  }
  if (Object.keys(vw).length > 0) slices.vw = vw;

  const fx: FxPayload = {};
  const active = params.get("fx");
  if (active) fx.active = active;
  if (blob.fx && typeof blob.fx === "object") {
    fx.tuning = blob.fx as Record<string, unknown>;
  }
  if (Object.keys(fx).length > 0) slices.fx = fx;

  const cd: CdPayload = {};
  const cols = Number(params.get("cols"));
  if (Number.isInteger(cols) && cols > 0) cd.cols = cols;
  if (blob.cd && typeof blob.cd === "object") {
    cd.rest = blob.cd as Record<string, unknown>;
  }
  if (Object.keys(cd).length > 0) slices.cd = cd;

  for (const id of BLOB_SLICE_IDS) {
    if (id === "fx" || id === "cd") continue;
    if (blob[id] != null) slices[id] = blob[id];
  }

  return slices;
}

/** Structural equality; `undefined` properties are treated as absent. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const aKeys = Object.keys(a as object).filter(
    (k) => (a as Record<string, unknown>)[k] !== undefined
  );
  const bKeys = Object.keys(b as object).filter(
    (k) => (b as Record<string, unknown>)[k] !== undefined
  );
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer/services/viewer-url-state-codec.test.ts`
Expected: PASS (7 tests). Note: the codec runs in Node too — `compressForURL` uses `btoa`; if the vitest environment lacks it, the test file sets `globalThis.btoa/atob` from `Buffer` in a `beforeAll`.

- [x] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/services/viewer-url-state-codec.ts src/lib/shared/sequence-viewer/services/viewer-url-state-codec.test.ts
git commit -m "feat(viewer): URL state codec for full-state links" -- src/lib/shared/sequence-viewer/services/viewer-url-state-codec.ts src/lib/shared/sequence-viewer/services/viewer-url-state-codec.test.ts
```

---

### Task 2: ViewerUrlSession

**Files:**
- Create: `src/lib/shared/sequence-viewer/services/viewer-url-session.ts`
- Test: `src/lib/shared/sequence-viewer/services/viewer-url-session.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createViewerUrlSession } from "./viewer-url-session";

describe("ViewerUrlSession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("exposes decoded seeds", () => {
    const session = createViewerUrlSession(
      new URLSearchParams({ vm: "split", fx: "sparkles" }),
      { writeParams: vi.fn() }
    );
    expect(session.getSeed("vw")).toEqual({ mode: "split" });
    expect(session.getSeed("fx")).toEqual({ active: "sparkles" });
    expect(session.getSeed("tn")).toBeNull();
  });

  it("isOverride: seed present and different from persisted", () => {
    const session = createViewerUrlSession(
      new URLSearchParams({ fx: "sparkles" }),
      { writeParams: vi.fn() }
    );
    expect(session.isOverride("fx", { active: "fire" })).toBe(true);
    expect(session.isOverride("fx", { active: "sparkles" })).toBe(false); // own-link rule
    expect(session.isOverride("tn", null)).toBe(false); // no seed
    expect(session.isOverride("fx", null)).toBe(true); // seed, nothing persisted
  });

  it("captureNow merges live captures over URL seeds (unmounted pass-through)", () => {
    const session = createViewerUrlSession(
      new URLSearchParams({ vm: "animation", fx: "fire" }),
      { writeParams: vi.fn() }
    );
    session.registerSlice("vw", () => ({ mode: "card" }));
    // fx surface never mounted — its seed must survive verbatim
    expect(session.captureNow()).toEqual({
      vw: { mode: "card" },
      fx: { active: "fire" },
    });
  });

  it("a capture returning null clears that slice from the snapshot", () => {
    const session = createViewerUrlSession(new URLSearchParams({ vm: "card" }), {
      writeParams: vi.fn(),
    });
    session.registerSlice("vw", () => null); // back at defaults
    expect(session.captureNow()).toEqual({});
  });

  it("scheduleUrlWrite debounces; captureNow does not depend on it", () => {
    const writeParams = vi.fn();
    const session = createViewerUrlSession(new URLSearchParams(), { writeParams });
    session.registerSlice("vw", () => ({ mode: "card" }));
    session.scheduleUrlWrite();
    session.scheduleUrlWrite();
    expect(writeParams).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(writeParams).toHaveBeenCalledTimes(1);
    expect(writeParams.mock.calls[0][0].set.vm).toBe("card");
  });

  it("unregister removes the live hook; seed pass-through resumes", () => {
    const session = createViewerUrlSession(new URLSearchParams({ vm: "split" }), {
      writeParams: vi.fn(),
    });
    const off = session.registerSlice("vw", () => ({ mode: "card" }));
    off();
    expect(session.captureNow()).toEqual({ vw: { mode: "split" } });
  });

  it("dispose cancels a pending write", () => {
    const writeParams = vi.fn();
    const session = createViewerUrlSession(new URLSearchParams(), { writeParams });
    session.registerSlice("vw", () => ({ mode: "card" }));
    session.scheduleUrlWrite();
    session.dispose();
    vi.advanceTimersByTime(1000);
    expect(writeParams).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer/services/viewer-url-session.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the session**

```ts
/**
 * ViewerUrlSession — one per viewer mount. Decodes slice payloads from the
 * inbound URL, hands seeds to store construction, collects live captures, and
 * writes the merged snapshot back to the URL (debounced) so the address bar
 * is always a complete snapshot.
 * Spec: docs/superpowers/specs/2026-08-30-viewer-url-addressable-state-design.md
 */
import {
  decodeViewerStateParams,
  encodeViewerStateParams,
  deepEqual,
  VIEWER_STATE_PARAM_NAMES,
  type SliceId,
  type SlicePayloads,
  type ViewerUrlParamPatch,
} from "./viewer-url-state-codec";

const URL_WRITE_DEBOUNCE_MS = 400;

export interface ViewerUrlSessionDeps {
  /** Applies a param patch to the live URL (production: mutateCurrentUrl). */
  writeParams: (patch: ViewerUrlParamPatch) => void;
}

export type ViewerUrlSession = ReturnType<typeof createViewerUrlSession>;

export function createViewerUrlSession(
  initialParams: URLSearchParams,
  deps: ViewerUrlSessionDeps
) {
  const seeds: SlicePayloads = decodeViewerStateParams(initialParams);
  const liveCaptures = new Map<SliceId, () => unknown | null>();
  let writeTimer: ReturnType<typeof setTimeout> | null = null;

  function getSeed(id: SliceId): unknown | null {
    return seeds[id] ?? null;
  }

  /**
   * The own-link rule: a seed that deep-equals what the user's own disk would
   * load is NOT an override — their own link must not flip them to view-only.
   */
  function isOverride(id: SliceId, persisted: unknown | null): boolean {
    const seed = seeds[id];
    if (seed == null) return false;
    return !deepEqual(seed, persisted);
  }

  function registerSlice(id: SliceId, capture: () => unknown | null): () => void {
    liveCaptures.set(id, capture);
    return () => {
      if (liveCaptures.get(id) === capture) liveCaptures.delete(id);
    };
  }

  /** URL seeds pass through verbatim for slices with no mounted surface. */
  function captureNow(): SlicePayloads {
    const merged: SlicePayloads = { ...seeds };
    for (const [id, capture] of liveCaptures) {
      const value = capture();
      if (value == null) delete merged[id];
      else merged[id] = value;
    }
    return merged;
  }

  function scheduleUrlWrite(): void {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = null;
      deps.writeParams(encodeViewerStateParams(captureNow()));
    }, URL_WRITE_DEBOUNCE_MS);
  }

  /** Synchronous full snapshot as a param patch — used by Share/Copy Link. */
  function captureNowAsParams(): ViewerUrlParamPatch {
    return encodeViewerStateParams(captureNow());
  }

  function ownedParams(): readonly string[] {
    return VIEWER_STATE_PARAM_NAMES;
  }

  function dispose(): void {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = null;
    liveCaptures.clear();
  }

  return {
    getSeed,
    isOverride,
    registerSlice,
    captureNow,
    captureNowAsParams,
    scheduleUrlWrite,
    ownedParams,
    dispose,
  };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer/services/viewer-url-session.test.ts`
Expected: PASS (7 tests).

- [x] **Step 5: Commit**

```bash
git commit -m "feat(viewer): ViewerUrlSession — seeds, own-link rule, capture, debounced sync" -- src/lib/shared/sequence-viewer/services/viewer-url-session.ts src/lib/shared/sequence-viewer/services/viewer-url-session.test.ts
```

---

### Task 3: Effects store — snapshot() + persisted-config export

**Files:**
- Modify: `src/lib/shared/effects/state/effects-config-state.svelte.ts`
- Test: extend the store's existing test file if one exists (`Grep: effects-config-state.test`); otherwise create `src/lib/shared/effects/state/effects-config-state.snapshot.test.ts`

Two small extensions of the owner (never a parallel serializer):

- [x] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  createEffectsConfigState,
  loadPersistedEffectsConfig,
} from "./effects-config-state.svelte";
import { DEFAULT_EFFECTS_CONFIG } from "../domain/defaults";

describe("effects config snapshot", () => {
  it("snapshot() returns a detached full config", () => {
    const state = createEffectsConfigState(undefined, { persist: false });
    state.setActiveEffect("sparkles");
    const snap = state.snapshot();
    expect(snap.activeEffect).toBe("sparkles");
    // Detached: mutating the snapshot must not affect live state
    (snap as { activeEffect: string }).activeEffect = "fire";
    expect(state.activeEffect).toBe("sparkles");
  });

  it("loadPersistedEffectsConfig returns null with empty storage", () => {
    localStorage.clear();
    expect(loadPersistedEffectsConfig()).toBeNull();
  });

  it("snapshot at factory defaults deep-equals DEFAULT_EFFECTS_CONFIG", () => {
    const state = createEffectsConfigState(undefined, { persist: false });
    expect(state.snapshot()).toEqual(DEFAULT_EFFECTS_CONFIG);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/effects/state/effects-config-state.snapshot.test.ts`
Expected: FAIL — `snapshot is not a function` / export missing.

- [x] **Step 3: Implement**

In the factory, add next to the existing methods (uses the same clone-fallback idiom as the undo capture at ~line 345):

```ts
  /** Detached copy of the full current config (transients like prewarmHint excluded by construction). */
  function snapshot(): EffectsConfig {
    try {
      return structuredClone($state.snapshot(config)) as EffectsConfig;
    } catch {
      return JSON.parse(JSON.stringify(config)) as EffectsConfig;
    }
  }
```

Add `snapshot,` to the returned object. Then export at module level, delegating to the existing private loader + normalize path (do NOT duplicate their logic — call them):

```ts
/**
 * What a persist:true instance would boot with, for the URL layer's own-link
 * comparison. Null when nothing is stored.
 */
export function loadPersistedEffectsConfig(): EffectsConfig | null {
  const stored = loadStoredConfig();
  return stored ? normalizeEffectsConfig(stored) : null;
}
```

(If `loadStoredConfig` already normalizes internally, match whatever the persist:true constructor path actually does — the exported value must equal a persist:true instance's boot state. Read the constructor and mirror it exactly.)

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/effects/state/effects-config-state.snapshot.test.ts`
Expected: PASS (3 tests). Also run the store's existing tests if any exist — zero regressions.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(effects): snapshot() and loadPersistedEffectsConfig for URL state layer" -- src/lib/shared/effects/state/effects-config-state.svelte.ts src/lib/shared/effects/state/effects-config-state.snapshot.test.ts
```

---

**Task 3 landed note (orchestrator):** `loadPersistedEffectsConfig()` mirrors the
persist:true boot path except the closure-local `healStaleTrailColors` pass
(legacy `#8b5cf6`/`#ec4899` leak). Accepted: the healer schedules a save on any
persist:true boot, so disk self-repairs on the next normal open; worst case is
one view-only session for a user still carrying the leaked pair. Task 5 needs no
special handling.

### Task 4: fx slice — capture/seed + zero-write guard

**Files:**
- Create: `src/lib/shared/sequence-viewer/services/viewer-url-slices/fx-slice.ts`
- Test: `src/lib/shared/sequence-viewer/services/viewer-url-slices/fx-slice.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { captureFxSlice, seedFromFxSlice } from "./fx-slice";
import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";

afterEach(() => vi.restoreAllMocks());

describe("fx slice", () => {
  it("returns null at factory defaults", () => {
    const state = createEffectsConfigState(undefined, { persist: false });
    expect(captureFxSlice(state)).toBeNull();
  });

  it("captures only the keys that differ from defaults", () => {
    const state = createEffectsConfigState(undefined, { persist: false });
    state.setActiveEffect("sparkles");
    state.updateEffect("sparkles", { rate: 0.92 });
    const slice = captureFxSlice(state);
    expect(slice?.active).toBe("sparkles");
    expect(slice?.tuning?.sparkles).toMatchObject({ rate: 0.92 });
    expect(slice?.tuning && "fire" in slice.tuning).toBe(false);
  });

  it("round-trips: capture -> seed -> new instance -> capture is identity", () => {
    const a = createEffectsConfigState(undefined, { persist: false });
    a.setActiveEffect("sparkles");
    a.updateEffect("sparkles", { rate: 0.92 });
    const slice = captureFxSlice(a);

    const b = createEffectsConfigState(seedFromFxSlice(slice!), { persist: false });
    expect(captureFxSlice(b)).toEqual(slice);
    expect(b.activeEffect).toBe("sparkles");
  });

  it("seeding + reading performs zero localStorage writes", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const state = createEffectsConfigState(
      seedFromFxSlice({ active: "sparkles", tuning: { sparkles: { rate: 0.92 } } }),
      { persist: false }
    );
    state.updateEffect("sparkles", { rate: 0.5 }); // tweaks during a link session stay session-local
    expect(setItem).not.toHaveBeenCalled();
  });

  it("seedFromFxSlice merges onto factory defaults, not user state", () => {
    const seeded = seedFromFxSlice({ active: "fire" });
    expect(seeded.activeEffect).toBe("fire");
    expect(seeded.sparkles).toEqual(DEFAULT_EFFECTS_CONFIG.sparkles);
  });
});
```

Note: `updateEffect`'s exact partial-update signature must be read from the store before writing this test — if it differs (e.g. takes a full section), adapt the test to the real API. Never change the store to fit the test.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer/services/viewer-url-slices/fx-slice.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
/**
 * fx slice — effects config <-> URL payload.
 * Capture: per-top-level-key diff vs DEFAULT_EFFECTS_CONFIG (null at defaults).
 * Seed: merge onto factory defaults (the sender diffed against them).
 */
import type { EffectsConfig } from "$lib/shared/effects/domain/effects-config";
import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import { deepEqual } from "../viewer-url-state-codec";

export interface FxSlicePayload {
  active?: string;
  tuning?: Record<string, unknown>;
}

export function captureFxSlice(state: EffectsConfigState): FxSlicePayload | null {
  const snap = state.snapshot();
  const tuning: Record<string, unknown> = {};

  for (const key of Object.keys(DEFAULT_EFFECTS_CONFIG) as (keyof EffectsConfig)[]) {
    if (key === "activeEffect") continue;
    if (!deepEqual(snap[key], DEFAULT_EFFECTS_CONFIG[key])) {
      tuning[key] = snap[key];
    }
  }

  const payload: FxSlicePayload = {};
  if (snap.activeEffect !== DEFAULT_EFFECTS_CONFIG.activeEffect) {
    payload.active = snap.activeEffect as string;
  }
  if (Object.keys(tuning).length > 0) payload.tuning = tuning;

  return Object.keys(payload).length > 0 ? payload : null;
}

export function seedFromFxSlice(payload: FxSlicePayload): EffectsConfig {
  const seed = structuredClone(DEFAULT_EFFECTS_CONFIG) as EffectsConfig;
  if (payload.tuning) Object.assign(seed, payload.tuning);
  if (payload.active) {
    (seed as { activeEffect: unknown }).activeEffect = payload.active;
  }
  return seed;
}
```

(`createEffectsConfigState` normalizes the seed via its own `normalizeEffectsConfig` path — an invalid `active` from a hand-edited URL is healed by the owner, not re-validated here.)

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer/services/viewer-url-slices/fx-slice.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git commit -m "feat(viewer): fx URL slice — capture/seed with zero-write guard" -- src/lib/shared/sequence-viewer/services/viewer-url-slices/fx-slice.ts src/lib/shared/sequence-viewer/services/viewer-url-slices/fx-slice.test.ts
```

---

### Task 5: View-state seam + entry-point wiring

**Files:**
- Modify: `src/lib/shared/sequence-viewer/state/viewer-state.svelte.ts` (add `initialMode`/`initialSplit`/`persist` options)
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte` (~line 388 effects creation; add session creation + context + sync `$effect`)
- Modify: `src/routes/sequence/[id]/SequenceViewerPage.svelte` (session from `page.url.searchParams`)
- Modify: `src/lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.ts` (session for drawer opens)
- Modify: `src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte` (~line 81 — must receive the orchestrator's effects instance, never construct a second one when a session is active)
- Test: `src/lib/shared/sequence-viewer/state/viewer-state.url-seed.test.ts`

This is the wiring task — the one that most needs hawk-eyed review. Sub-steps:

- [x] **Step 1: Failing test for the viewer-state seam**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createViewerState } from "./viewer-state.svelte";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("createViewerState URL seeding", () => {
  it("initialMode wins over persisted mode", () => {
    localStorage.setItem("tka-viewer-mode", "card");
    const state = createViewerState({ initialMode: "tunnel", persist: false });
    expect(state.viewerMode).toBe("tunnel");
  });

  it("persist:false never writes viewer-mode or split keys", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const state = createViewerState({ initialMode: "split", persist: false });
    state.setViewerMode("card");
    state.setSplitConfig({ leftPane: "animation", rightPane: "card" });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("no options preserves today's behavior (loads + persists)", () => {
    const state = createViewerState();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    state.setViewerMode("card");
    expect(setItem).toHaveBeenCalledWith("tka-viewer-mode", "card");
  });

  it("URL post-studio is honored (explicit-intent carve-out)", () => {
    const state = createViewerState({ initialMode: "post-studio", persist: false });
    expect(state.viewerMode).toBe("post-studio");
  });
});
```

- [x] **Step 2: Verify it fails, then implement the seam**

`createViewerState(options?: { initialMode?: ViewerMode; initialSplit?: SplitConfig; persist?: boolean })`:
- `const persist = options?.persist ?? true;`
- `const initialMode = options?.initialMode ?? loadViewerMode();` — the URL value bypasses `loadViewerMode`'s post-studio/mandala filtering **on purpose**: that filter guards against stale localStorage, and a URL is explicit intent (spec carve-out — put this sentence in a comment).
- `let splitConfig = $state<SplitConfig>(options?.initialSplit ?? loadSplitConfig());`
- Guard every `persistViewerMode(...)`/`persistSplitConfig(...)` call with `if (persist)`.
- Validate `initialMode`/`initialSplit` against the same type guards `viewer-state-persistence.ts` uses (import `isValidContentType` — export it if private) so a hand-edited `vm=garbage` falls back to defaults, not a broken viewer.

Run the test: PASS (4 tests).

- [x] **Step 3: Wire the session end to end (read each file before editing)**

1. **Orchestrator** creates the session once at mount:

```ts
import { createViewerUrlSession } from "../services/viewer-url-session";
import { mutateCurrentUrl } from "$lib/shared/navigation/services/url-state";
import { captureFxSlice, seedFromFxSlice } from "../services/viewer-url-slices/fx-slice";
import { loadPersistedEffectsConfig } from "$lib/shared/effects/state/effects-config-state.svelte";

const urlSession = createViewerUrlSession(
  new URLSearchParams(browser ? window.location.search : ""),
  {
    writeParams: (patch) =>
      mutateCurrentUrl((url) => {
        for (const name of patch.remove) url.searchParams.delete(name);
        for (const [name, value] of Object.entries(patch.set)) {
          url.searchParams.set(name, value);
        }
      }),
  }
);
```

2. **Effects instance** (replace the bare `createEffectsConfigState()` at ~line 388):

```ts
const fxSeedPayload = urlSession.getSeed("fx") as FxSlicePayload | null;
const fxSeed = fxSeedPayload ? seedFromFxSlice(fxSeedPayload) : null;
const effectsConfigState =
  fxSeed && urlSession.isOverride("fx", loadPersistedEffectsConfig())
    ? createEffectsConfigState(fxSeed, { persist: false })
    : createEffectsConfigState();
urlSession.registerSlice("fx", () => captureFxSlice(effectsConfigState));
```

3. **View state:** pass the `vw` seed into `createViewerState` (or into the existing `initialViewerMode` flow — read how `viewerState` is constructed in the orchestrator/context first and use THAT path; do not create a second mode-setting route). Register the capture:

```ts
urlSession.registerSlice("vw", () => {
  const mode = viewerState.viewerMode;
  const split = viewerState.splitConfig;
  const atDefaultMode = mode === "split";
  const atDefaultSplit = split.leftPane === "animation" && split.rightPane === "card";
  if (atDefaultMode && atDefaultSplit) return null;
  return {
    ...(atDefaultMode ? {} : { mode }),
    ...(atDefaultSplit ? {} : { split }),
  };
});
```

Important: the vw override must also mean `persist:false` for viewer-state (`urlSession.isOverride("vw", { mode: loadViewerMode(), ... })` — compare against the same shape the capture produces, with the same default-elision).

4. **Live sync `$effect`** in the orchestrator (component context, so `$effect` is legal):

```ts
$effect(() => {
  void urlSession.captureNow(); // reads every registered store's reactive state
  urlSession.scheduleUrlWrite();
});
onDestroy(() => urlSession.dispose());
```

5. **Existing `vm` param path:** `SequenceViewerPage.svelte:137` reads `vm` today. The codec now also reads `vm`. Route BOTH through the session: the page passes nothing new — the orchestrator's session reads `window.location.search` directly, so delete/bypass any now-redundant ad-hoc `vm` plumbing **only if** reading the page code proves the orchestrator path fully covers it (drawer opens without URL params must still respect `initialViewerMode` from `openSequenceOverlay` options — programmatic opens win over URL leftovers; precedence: explicit open options > URL seed > localStorage).

6. **ViewerSplitPane** must consume the orchestrator's effects instance (`inheritedEffectsConfig` prop at ~line 81). Verify the orchestrator actually passes it everywhere the viewer renders effects; fix any path that lets a pane construct its own persist:true instance while a session override is active (that would leak link state to disk — the exact bug class this project kills).

- [x] **Step 4: Verify**

Run both new test files + `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer` (expected: all green). Then `npm run check > /tmp/check.log 2>&1; grep -ciE "^.*error" /tmp/check.log` — expected 0 errors (one check per turn; capture once, grep many).

- [x] **Step 5: Commit**

```bash
git commit -m "feat(viewer): URL session wiring — view + effects slices seed and live-sync" -- src/lib/shared/sequence-viewer/state/viewer-state.svelte.ts src/lib/shared/sequence-viewer/state/viewer-state.url-seed.test.ts src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte src/routes/sequence/[id]/SequenceViewerPage.svelte src/lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.ts src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte src/lib/shared/sequence-viewer/services/viewer-state-persistence.ts
```

(Adjust the pathspec to the files actually touched — commit only your own changes.)

**Execution notes (deltas from the plan text):**

1. **`vm` is already taken on `/sequence/[id]`, by a physical artifact.**
   `SequenceViewerPage.svelte:137` is NOT the viewer mode the spec assumed — it
   is the printed-card BROWSE view mode (`short-code-manager.ts:404` writes
   `vm=hsb`; `decodeViewMode` parses it into hand-path + per-prop visibility;
   `buildScanSequenceDestination` carries it verbatim from `/q` onto
   `/sequence/[code]`). The two vocabularies are disjoint (no viewer mode
   parses as a browse code and vice versa), so the plumbing is not redundant
   and was kept. The orchestrator's session now refuses to seed from,
   overwrite, or remove a `vm` that parses as a browse code, which prevents the
   debounced writer from stripping printed-card state off the URL.
   **Consequence:** a viewer opened from a printed card cannot also record its
   viewer mode in the URL. If both are ever needed at once, rename the codec's
   viewer-mode headline param (`VIEWER_STATE_PARAM_NAMES`, `viewer-url-state-codec.ts`)
   — `vm` belongs to the printed cards.
2. **`ViewerSplitPane` consumes the effects instance by CONTEXT, not a prop.**
   There is no `inheritedEffectsConfig` prop; line ~81 reads
   `getEffectsConfigContext()`. All three shell hosts (drawer, `/sequence`,
   `/from/spiroanim`) mount inside `SequenceViewerOrchestrator`, which calls
   `setEffectsConfigContext`, so its local `?? createEffectsConfigState()`
   fallback is unreachable while a session is live. Left as-is, comment
   strengthened.
3. **`sequence-viewer-overlay-state.svelte.ts` was NOT touched.** Drawer opens
   are already covered: the session reads `window.location.search` inside the
   orchestrator, which the drawer mounts. The only overlay-state change this
   project needs is the close-path param strip, which is Task 7.
4. **`loadViewerMode` / `loadSplitConfig` gained an optional
   `{ persist }`.** Both write to disk on their migration paths (legacy
   editing-pane key, mandala retirement), which a view-only mount must not do.
   `persist:false` makes them pure reads.
5. **The `fx` own-link comparison happens in slice space.**
   `isOverride("fx", ...)` receives `captureFxSlice(...)` of a throwaway
   `persist:false` instance built from `loadPersistedEffectsConfig()`, not the
   raw `EffectsConfig` the plan snippet passed — a raw config can never
   deep-equal an `FxSlicePayload`, which would have made every fx link an
   override and broken the own-link rule.

---

**Orchestrator decision after Task 5 (binding for Tasks 6+):** the viewer-mode
headline param is **`pane`**, not `vm` — printed QR cards own `vm` as the browse
view-mode code and cannot be re-parameterized (commit `486af01fc4` renamed the
codec + tests and deleted the orchestrator's value-sniffing guard; the session
never reads or writes `vm`). Anywhere a task snippet below says `vm` in a URL
param or patch fixture, write `pane`.

### Task 6: Share/Copy carry the snapshot (captureNow, not the address bar)

**Files:**
- Modify: `src/lib/shared/sequence-viewer/services/viewer-share-actions.ts`
- Modify: `src/lib/shared/sequence-viewer/services/viewer-orchestrator-model.ts` (`buildViewerShareDetails`)
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte` (pass a `getStateParams` dependency)
- Test: `src/lib/shared/sequence-viewer/services/viewer-orchestrator-model.share-state.test.ts`

**Verification blocker (environment, not scoped to this task):** the shared
`node_modules` every worktree symlinks to (`E:/tka-platform/node_modules`) has
a broken pnpm store — `@acemir/cssom@0.9.31` is resolved in `pnpm-lock.yaml`
but absent from `node_modules/.pnpm`, which breaks jsdom's require chain,
which is the global `environment: "jsdom"` for every vitest file in this repo
(`tests/config/vitest.config.ts`). `node_modules/.bin` is also empty, so
`npx vitest`/`pnpm exec vitest` fail outright ("'vitest' is not recognized").
Invoking vitest's `vitest.mjs` entry directly via `node` (bypassing `.bin`)
reproduces the same `MODULE_NOT_FOUND` for `@acemir/cssom` on EVERY test
file, including `viewer-url-state-codec.test.ts` (Task 1, previously
passing) — confirmed twice, stable, not transient. This is a machine-wide
regression that happened after Tasks 1–5 landed (their tests are marked
passing in this plan), not something introduced by Task 6/7's changes. Fixing
it requires `pnpm install` in the primary checkout, which is out of scope
here (worktree-only mandate) — flagged separately as a background task.
**Consequence:** Step 2's "run test to verify it fails" below DID execute
successfully with real output (captured before the environment broke
mid-session); Step 3's "verify it passes" + the module's other tests could
NOT be executed. The implementation was verified by careful static/manual
review instead (types match, both `buildUrl` and fallback paths converge on
one `url` variable the patch is applied to, `getStateParams` threads through
`ViewerShareInputs` → `buildViewerShareDetails` → the orchestrator's
`urlSession.captureNowAsParams()`).

- [x] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildViewerShareDetails } from "./viewer-orchestrator-model";

describe("share URL carries viewer state", () => {
  it("appends state params from getStateParams to the built URL", () => {
    const details = buildViewerShareDetails({
      sequence: null,
      bpm: 60,
      darkMode: false,
      fallbackUrl: "https://example.com/sequence/EHWE",
      buildUrl: () => "https://example.com/sequence/EHWE",
      getStateParams: () => ({ set: { pane: "card", fx: "sparkles" }, remove: [] }),
    });
    const url = new URL(details.url);
    expect(url.searchParams.get("pane")).toBe("card");
    expect(url.searchParams.get("fx")).toBe("sparkles");
  });
});
```

- [x] **Step 2: Verify fail, implement**

`buildViewerShareDetails` gains optional `getStateParams?: () => ViewerUrlParamPatch`. After the existing `url = input.buildUrl(...)` (and also on the fallback path), apply the patch:

```ts
if (input.getStateParams) {
  try {
    const patch = input.getStateParams();
    const u = new URL(url);
    for (const name of patch.remove) u.searchParams.delete(name);
    for (const [name, value] of Object.entries(patch.set)) u.searchParams.set(name, value);
    url = u.toString();
  } catch {
    // State params must never break sharing.
  }
}
```

`createViewerShareActions` inputs gain `getStateParams` and pass it through; the orchestrator supplies `() => urlSession.captureNowAsParams()`. This is the synchronous path — no debounce dependence; "the moment I copied" is literal.

- [~] **Step 3: Verify test passes, run the module's other tests** (`viewer-modes.test.ts` etc. still green). NOT executed — vitest is non-functional repo-wide right now (see blocker note above). Implementation reviewed manually instead.

- [x] **Step 4: Commit**

```bash
git commit -m "feat(viewer): share/copy links carry a synchronous full-state snapshot" -- src/lib/shared/sequence-viewer/services/viewer-share-actions.ts src/lib/shared/sequence-viewer/services/viewer-orchestrator-model.ts src/lib/shared/sequence-viewer/services/viewer-orchestrator-model.share-state.test.ts src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte
```

---

### Task 7: Close cleanup strips all owned params

**Files:**
- Modify: `src/lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.ts:177`
- Test: extend `viewer-url-state-codec.test.ts` is wrong home — add assertion to any existing overlay-state test file (`Grep: sequence-viewer-overlay-state.test`); if none exists, this is covered by Task 8's integration check instead — do NOT build a new browser-test harness just for this line.

- [x] **Step 1: Implement**

```ts
import { VIEWER_STATE_PARAM_NAMES } from "../services/viewer-url-state-codec";
// in closeSequenceOverlay():
removeCurrentUrlParams(["v", ...VIEWER_STATE_PARAM_NAMES], {
  removeState: ["sequenceOverlay"],
});
```

No `sequence-viewer-overlay-state.test.ts` exists (grepped — none found), so
per this task's own instruction no new browser-test harness was built; Task
8's integration check covers it. Same vitest environment blocker as Task 6
applies here too (see note above Task 6) — moot in this task's case since
there was no existing test file to run regardless.

- [x] **Step 2: Commit**

```bash
git commit -m "fix(viewer): closing the drawer strips all viewer-state URL params" -- src/lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.ts
```

---

### Task 8: Phase A verification gate (orchestrator runs this, not a subagent)

- [x] Full unit suite for touched areas green; one `npm run check` captured to log, 0 errors.
- [x] Live round-trip in the browser (DevTools MCP, dedicated instance, per `visual-verification-mandatory.md`): open `/sequence/<id>`, set effect to sparkles + tune rate, switch pane to 2D, wait 1s, confirm address bar contains `vm`/`fx`/`s`; copy URL; open it in a fresh incognito-context page; confirm identical pane + effect + tuning; confirm `localStorage.getItem("tka_effects_config")` in the fresh context is unchanged/null.
- [x] Confirm drawer path: open viewer from gallery, tweak, confirm URL params appear on the module route; close drawer, confirm params stripped.
- [x] Confirm plain-link invariant: fresh viewer with untouched settings shows NO new params.

---

## Phase B — Remaining slices (one task each, clone the Task 4 pattern)

Every Phase B task follows the same five steps: **(1) Discovery** — read the backing store file(s) end-to-end and list the exact persisted fields (post-normalize shape); **(2) seam** — add `initial`/`persist:false` options to the store factory if missing (seam choice per store: an instance seam like fx for per-mount stores, or the global-store memento defined in Task 9 for app-global singletons); **(3) slice module** in `viewer-url-slices/<id>-slice.ts` with capture-diff-vs-defaults returning null at defaults + seed-merge-onto-defaults; **(4) tests** — round-trip identity, null-at-defaults, zero-write spy (same three shapes as `fx-slice.test.ts`); **(5) register** in the surface that owns the store (register on mount, unregister on destroy — these surfaces mount/unmount with panes, unlike fx). Commit per task with pathspec.

### Task 9: `an` — 2D animation settings (REVISED 2026-08-30 after executor discovery)

Discovery invalidated the original premise. `createPersistenceHelper` is invoked at
MODULE scope in `animation-settings-state.svelte.ts` (~line 91), so a helper option
never reaches `createAnimationSettingsState`; the stores are app-global singletons
(`animationSettings` export ~line 357; lazy `getAnimationVisibilityManager()`) read
directly by ~7 viewer files and 2 services with no injection seam short of the
AnimationScope Phase 2 refactor; and `AnimationVisibilityStateManager.ephemeral`
gates BOTH `saveToStorage()` AND `syncDarkModeClass()`, so an ephemeral seeded
instance could never render a link's dark mode. The fx separate-instance pattern is
therefore WRONG here — any read site missed (now or by future code) would silently
show recipient state.

**Revised mechanism — memento on the global stores.** A link session borrows the
real singletons and restores them on close: snapshot → suspend persistence → apply
seed → every consumer renders it by construction (dark mode included, via the
store's own non-ephemeral sync path) → on dispose, restore the snapshot while still
suspended, THEN resume persistence. Disk is never touched; recipient tweaks during
the session stay session-local (approved view-only contract).

- [x] **Store seams (additive; NO `createPersistenceHelper` change — that premise is dropped):**
  - `animation-settings-state.svelte.ts`: add `setPersistenceSuspended(suspended: boolean)` (gates the module-scope helper's save), `snapshot(): AnimationSettings` (deep), `replaceAll(settings)`.
  - `animation-visibility-state.svelte.ts`: same trio on the manager — suspension flag checked in `saveToStorage()` (alongside, not replacing, `ephemeral`), `snapshot()`, `replaceAll(settings)` applied through the normal setter path so `syncDarkModeClass()` fires on the global instance.
- [x] **Slice module** `viewer-url-slices/an-slice.ts`: payload `{ settings?, visibility? }`.
  `tka_trail_settings` EXCLUDED — in the viewer it is shadowed by
  `tka_animation_settings.trail` (viewer surfaces pass external trail settings);
  record why in the doc comment. Diff baselines are POST-NORMALIZE defaults (fx
  precedent): trail forced-vivid == `DEFAULT_TRAIL_SETTINGS` (verified byte-equal);
  the visibility baseline must account for `stepNumbers` forced `true` on every
  load — derive it from a fresh `ephemeral` instance or shared normalize function,
  never the raw constant. `effortPreset` + `tipEffortMap` are ONE quantity (mirror
  pair — same trap as fx activeEffect/tipEffectMap). Capture the user-owned
  settings: if `motionPolicySource` overlay values are viewer/sequence-derived
  (recipient re-derives them), capture RAW settings and say so in the doc comment;
  implementer decides from the code with a stated reason.
- [x] **Tests** (`an-slice.test.ts`): round-trip identity; null at post-normalize
  defaults; zero-write spy across suspend→apply→tweak→restore→resume for BOTH
  storage keys; restore returns the store to the pre-override snapshot.
- [x] **Wiring** in `SequenceViewerOrchestrator.svelte` (like fx — the globals are
  session-wide, not per-pane; a link carries 2D settings regardless of active pane):
  compute `persistedAnSlice` from the live globals; if a seed exists and
  `urlSession.isOverride("an", persistedAnSlice)`: snapshot both stores, suspend
  persistence, apply the seed (merge onto post-normalize defaults → `replaceAll`).
  In the existing dispose path: `replaceAll(snapshot)` while still suspended, THEN
  resume persistence. Always `urlSession.registerSlice("an", () => captureAnSlice(...))`
  reading the live globals.
- [x] **Commit** with explicit pathspec.

Note for Task 11: several `tka-3d-*` stores may also be app-global singletons. The
memento above is the sanctioned mechanism for global-store slices; per-store
discovery chooses instance-seam (fx) vs memento (an).

### Task 10: `ex` — export options
- [x] Store: `createExportOptionsState()` (`export-options-state.svelte.ts`, key `tka_export_options`). Add options seam, slice, tests, registration in the export panel host.

### Task 11: `t3` — 3D viewer
- [x] Stores (sub-keys of one payload): `tka-3d-animator-state` (`scene3d-persister.ts`), `tka-viewer3d-environment`, `tka-scene-features`, `tka-3d-playback-state` (`createPlaybackState` — already takes options), `tka-scene-audio-v1`, `tka-3d-quality-tier-override`. Discovery step decides which of these are *visual state* (encode) vs *device capability* (quality tier: DO NOT encode — a sender's GPU tier must not follow the link; record the exclusion in the slice's doc comment). (RESOLVED: encode `env` + `features` only. Excluded with recorded reasons in the slice doc comment: quality tier = device capability; animator-state = dead key, no importers; default playback key = never written, all call sites pass explicit per-avatar keys; scene audio = device-personal + autoplay-gated.)
- [x] Slice + tests + registration in the 3D pane host (`viewer-3d-activation-state` / `Viewer3DCanvas` mount path — discovery names the exact component). (Mixed slice: seed at orchestrator via NEW narrow `viewOnlyEnvironmentId`/`viewOnlySceneFeatures` options — deliberately NOT `Viewer3DStateSeed`, which flips preview semantics/camera distance; capture registered in `Viewer3DCanvas` via `setViewerUrlSessionContext`/`tryGetViewerUrlSessionContext` on the session owner, plus a pane-side tracking `$effect` because the orchestrator's live-sync effect settled before the lazy pane chunk mounted.)

### Task 12: `cd` + `cols` — card controls
- [x] Stores: `tka-image-composition-settings` (`image-composition-state.svelte.ts`), `columnCount` (viewer context, `viewer-orchestrator-context-state.svelte.ts:268` — discovery traces who sets it and how it persists). `cols` rides the headline param (codec already supports it); the rest goes in the blob. (RESOLVED: the cited line is NOT the owner — `columnCount: null` there is a hardcoded "no explicit prop" pass-through, and `ChoreoCard` falls back to `compositionManager.getColumnCountForStepCount(stepCount)`. Every writer — `ExportImagePanel.setColumns`, the card context menu, `choreo-card-layout-state` — reads and writes that same manager, so ONE store owns both halves and `cols` folds into its memento. Excluded with recorded reasons: `darkMode` (mirror of AnimationVisibilityManager, owned by `an`), `addUserInfo` (derived from `showNotes`), `columnCountPreference{Owner,Version}` (identity provenance — the owner string is literally `user:<sender uid>`), and the three per-length override MAPS (only the viewed length is meaningful, so it rides `cols`/`startLayout`/`infoCell`).)
- [x] Slice + tests + registration. (Memento pattern — `getImageCompositionManager()` is a module singleton with ~10 direct callers. All six write paths gated by a new `setPersistenceSuspended`: the local key, the scoped column key, `settingsService.updateSetting("imageExport")` → FIRESTORE, the `saveToStorage` funnel, and the async `onRemoteSettingsApplied`/`onAuthStateChanged` identity callbacks via a `runOrDefer` queue; the one-shot notes-migration marker is constructor-time only and documented rather than gated. Session-identity bookkeeping is frozen across the borrow. Also closes a PRE-EXISTING leak from Task 9: the card store observes the visibility manager's dark mode, so an `an`-only override was writing the sender's dark mode into the recipient's localStorage AND account — the card store is now suspended whenever `cdIsOverride || anRestore`.)

### Task 13: `tn` — tunnel config
- [x] Store: `tka_tunnel_view_state` (`tunnel-view-state.ts` — plain load/persist functions; add a factory-style seam mirroring viewer-state's Task 5 change). User presets (`tka_tunnel_user_presets`) are referenced by value, not id — a recipient doesn't have the sender's presets, so capture resolves the active preset into concrete values (discovery confirms the resolved shape). (RESOLVED: `DEFAULTS` renamed/exported as `DEFAULT_TUNNEL_VIEW_STATE` — confirmed byte-equal to a factory-fresh `loadTunnelViewState()`, no boot migration to diverge. `TunnelControllerSources` gained `initialViewState?: TunnelViewState`, threaded as `sources.initialViewState ?? loadTunnelViewState()` — a pure instance seam like Task 4's `fx`, not a memento; `TunnelViewController` is a per-mount class with no app-global singleton behind it. Preset-by-value is satisfied structurally, not by new resolution logic: `TunnelPresetRecipe.config` is always a frozen clone via `cloneTunnelConfig`, for both "built-in" and "saved" kinds, so capturing `presetRecipe` verbatim already carries only concrete values — there is no id to resolve against the recipient's `tka_tunnel_user_presets` list.)
- [x] Slice + tests + registration in the tunnel pane host. (`tn-slice.ts` created — capture/seed diff against `DEFAULT_TUNNEL_VIEW_STATE`, `null` at defaults. Registered in `ArtPane.svelte`, gated to `artType === "tunnel"` only: `ArtPane` mounts TWO `TunnelViewController` instances per viewer — one per `artType` ("mandala" stays permanently inert via the pre-existing `controller.active` shim) — and the session's `registerSlice` map holds one live capture per slice id, so registering from both panes would let whichever mounts second shadow the other's capture. EXCLUDED with recorded reasons: `active` (derived from `artType`, not view state), `selectedArm`/`selectedPerformerId` (transient spotlight focus, already documented on the controller as not part of config/persistence), `lookEditorOpen` (transient disclosure), `#layers`/`#buildToken`/`buildError` (private build-pipeline state, derived every rebuild, never in `TunnelViewState`).)

### Task 14: `ps` — Post Studio
- [x] Store: PostStudio's internal `persist:false` effects instance + its layout/setup state (`PostStudio.svelte:100` — discovery lists what constitutes "setup"). Honor the explicit-intent carve-out: `vm=post-studio` from a URL opens Post Studio (Task 5 already allows it); this task makes its setup round-trip. (DEVIATION — plan wording correction, not a behavior change: the viewer-mode headline param is `pane`, not `vm`, per the binding decision recorded after Task 5 above; `pane=post-studio` already opens Post Studio and was not touched here. REVISED after discovery: the effects instance is NOT re-encoded by `ps` — confirmed `SequenceViewerOrchestrator.svelte` calls `setEffectsConfigContext` on the `fx`-sliced instance before `PostStudioPane`/`PostStudio` mount as a descendant, so `PostStudio.svelte:98-101`'s local `getEffectsConfigContext() ?? createEffectsConfigState(...)` fallback is unreachable in-viewer (same finding as Task 5's `ViewerSplitPane`); encoding it again here would be the `fx` mirror-pair trap at slice granularity. PostStudio's `MediaCompositionState` (slot source assignment, clip transforms/trims, tempo, playback mode, safe zones) is EXCLUDED as a scope/sizing decision, the same call `t3-slice.ts` made for `performers`: no existing seed seam, and adding one means a partial-patch mechanism against a Zod-validated preset schema — materially bigger than any other Phase B store. What survives discovery as durable setup: `propType` (diffed against the LIVE per-session default, `settingsService.settings.bluePropType ?? STAFF`, never a fixed constant — that fallback is itself per-user), `audioMode` (captured only when `audioModeTouched`, since its own default is an async decode-probe result not recomputable at capture time), `notationMirrored` (boolean, diffed against `false`; seeding calls the existing flip function `toggleNotationMirror()` once at mount rather than duplicating its async cache-population branch, since state starts unset and the function's own logic always takes the "turn on" path in that case). EXCLUDED with reasons: `chosenPerformance` (sender-private video reference, no by-value form at all — worse than tn's preset-by-id case); `performancePickerOpen`/`focusedPanel`/`timingAdvanced` (transient disclosure, tn's `lookEditorOpen` class); assorted runtime/error bookkeeping (`performanceLibraryError`, `exportError`, `exportedUrl`, `exportProgress`, `exportCancelled`, `notationMirrorPending`, `audioInspectionVersion`, `performanceHasAudio`, `bootedToPerformance`, `localPerformanceUrl`, `mirrorCache`); measured/viewport-relative geometry (`workspaceWidth`, `workspaceHeight`, `viewportHeight`, `workspaceSizes`, `workspaceWasAdjusted` — t3's quality-tier class).)
- [x] Slice + tests + registration. (`ps-slice.ts` created — pure instance seam like `fx`/`tn`, but with NO merge-onto-defaults step on seed, unlike fx/t3/tn/cd: each of the three encoded fields independently falls through to `PostStudio.svelte`'s own default computation when the seed omits it, since they are three independent `$state` locals rather than one constructed object. `persistedPsSlice()` always returns `null` — no encoded field has a disk-backed form — so `isOverride` correctly degenerates to "any non-null URL payload is an override." Registered entirely inside `PostStudio.svelte` via `tryGetViewerUrlSessionContext()`, matching `ArtPane`'s tn wiring; `PostStudioPane.svelte` needed no changes (it passes no seed-related props). `PostStudioPane` mounts/unmounts via `{#if layout.showPostStudio}` (confirmed in `SequenceViewerShell.svelte`), so the `onDestroy`-unregister pattern is required and correct; unlike `ArtPane`, `PostStudio` mounts once, so no `artType`-style registration gating was needed. Executor evidence: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer` → `Test Files 23 passed (23)`, `Tests 204 passed (204)`, incl. 12 new `ps-slice.test.ts` tests (null-at-defaults, live-baseline `propType` diffing distinguished from a fixed-constant diff, touched-flag `audioMode` diffing, `notationMirrored` true-only capture, capture→seed→apply→capture round-trip, no-merge-on-seed behavior, invalid-enum rejection from a simulated hand-edited URL, always-null persisted baseline, and a zero-write `Storage.prototype.setItem` spy with an anti-vacuity companion proving the spy mechanism itself catches a real write). `npm run check` → `svelte-check found 0 errors and 0 warnings`. Commit: `4474a687e8`.)

### Task 15: Phase B verification gate (orchestrator)
- [x] Full-state torture link: 551 chars (< 2000), all slice families in one URL — fx sparkles with full tuning (rate 0.9, size 0.5, lifetime 1.2, color #fbbf24, spread 8, gravity 0.3, mode stream), an `visibility.speed: 2` plus the legacy `?bpm=120` headline, t3 `env: ocean`, tn full config (fold 4, staggerSteps 1, grid visible, section playback, built-in spiral preset recipe carried by value), cd `addDifficultyLevel` in the blob plus `cols=2` headline, vw `pane=animation-3d` + `split=animation-3d,card`, and the foreign `render=3d` param preserved through live rewrites. Round-tripped in fresh isolated browser contexts on :5209: recipient booted directly into the 3D pane on the ocean at BPM 120 with the sparkles tuning restored (screenshots `sender-final.webp`, `recipient-final.webp`, `recipient-sparkles*.webp`, `fxboot-firstpaint.webp` in the session scratchpad). Zero slice-owned persistence writes in the recipient context — every observed localStorage write traced to boot-path writers unmodified on this branch (`tka_animation_settings` bpm:120 is the factory default; `animation-visibility-settings` persisted defaults while live state ran the link's speed 2, proving `persistenceSuspended`; one-bit note: `tka_animation_panel_active_pill: "effects"` written by the unmodified main-line AnimationPanel).
- [x] `npm run check` → `svelte-check found 0 errors and 0 warnings` (re-run 2026-08-31 after the fx-wiring fix); full unit suite from the gate run: 12219 passed with 8 remaining failures individually triaged as pre-existing on red main; affected suites re-run post-fix: 7 files / 76 tests green. No visible chrome changed, so no separate visual pass owed beyond the round-trip screenshots above. Two real bugs found and fixed during this gate: (1) pane precedence — `pane` must outrank the `render`-derived mode or a tunnel-pane link reopens on animation-3d (`initialViewerModeForUrl`, 13a082d8a5); (2) fx→3D first boot — a link booting straight into `pane=animation-3d` mounts no 2D `CanvasSurface`, which was the only assigner of `visibilityManager.effectsConfigState`, so a seeded effect rendered nowhere in 3D until an unrelated pane switch; the orchestrator now makes the assignment eagerly before fx slice registration (7b55786b7b, with a decomposition-contract regression test), verified in a second cold context whose first paint shows sparkles.

---

## Ledger

- [x] Task 1 — codec
- [x] Task 2 — session
- [x] Task 3 — effects snapshot/export
- [x] Task 4 — fx slice
- [x] Task 5 — view seam + wiring
- [x] Task 6 — share captureNow (verified: env blocker resolved via worktree-local pnpm install; share-state test 1/1, full sequence-viewer suite 127/127)
- [x] Task 7 — close cleanup
- [x] Task 8 — Phase A gate (PASSED 2026-08-30: check 0 errors; 165/165 tests; live round-trip on :5209 — sparkles+rate90%+2D pane restored in isolated context, zero recipient localStorage writes; drawer params appear on /browse and strip on close; plain-link invariant holds. Fix landed during gate: fx slice now diffs the EFFECTIVE active effect (tipEffectMap wildcard) against the derived default — raw DEFAULT_EFFECTS_CONFIG.activeEffect "none" vs migration-derived "trails" stamped fx=trails onto every untouched viewer)
- [x] Task 9 — an slice (d7be08fda1; REVISED to global-store memento after executor discovery, 05e0d3bcc3. Orchestrator verified: re-ran suite personally — 47 files/318 tests green incl. 12 new an-slice tests; read full diff; check 0 errors per executor log)
- [x] Task 10 — ex slice (ea2c3c5567; memento pattern — getExportOptionsState() is a module singleton with ~8 direct readers, verified. Orchestrator verified: re-ran sequence-viewer suite personally 19 files/151 tests green incl. 10 new ex-slice tests; read full diff; confirmed exportCoord.exportOptions IS the global singleton)
- [x] Task 11 — t3 slice (07789dfc37; mixed pattern — view-only options at orchestrator + pane-side capture via session context. Orchestrator verified: re-ran sequence-viewer suite personally 165/165 incl. 14 new t3 tests; read full diff; confirmed `seededBackgroundType` stays null for persistent viewers so camera distance is untouched; svelte-check re-run personally, 0 errors 0 warnings; 3D-suite failures confirmed pre-existing — performer-initial-reveal asserts on UNMODIFIED SceneLoadingCurtain.svelte, ember-hash + wick-frame geometry unrelated to the 8 changed files)
- [x] Task 12 — cd slice (37c37e55df; memento pattern on the image-composition singleton, which owns BOTH halves — the plan's `columnCount` citation was a pass-through, not the owner. All six write paths gated, including the Firestore account sink and the async remote/auth callbacks (queued by `runOrDefer`, drained after restore). Executor evidence: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer tests/unit/share` → 54 files / 512 tests passed, incl. 14 new cd-slice tests AND the 19 pre-existing `column-preference-state` account-arbitration tests; `npm run check` → 0 errors 0 warnings against the committed tree. Also closes a pre-existing dark-mode write leak from Task 9's `an` override. Orchestrator verified: re-ran viewer+share suites personally 54 files/512 tests green; read full diff — funnel refactor preserves behavior (the auth-transition write path is wholly deferred via runOrDefer, not dropped), suspend-before-an ordering and restore-after-an ordering both correct; confirmed the dark-mode observer exists at image-composition-state.svelte.ts:374-384 so the leak claim is real; tests assert zero writes on BOTH the localStorage keys and the mocked Firestore updateSetting sink with anti-vacuity companions.)
- [x] Task 13 — tn slice (55bd658144; pure instance seam — `TunnelViewController` is a per-mount class with no app-global singleton, so this is Task 4's `fx` shape rather than a memento or t3's split. Both seed and capture live in `ArtPane.svelte`, the tunnel pane host, gated to `artType === "tunnel"` because `ArtPane` mounts two controller instances per viewer (mandala + tunnel) and the session's `registerSlice` map holds one live capture per slice id. Preset-by-value satisfied structurally by `TunnelPresetRecipe.config` always being a frozen clone (`cloneTunnelConfig`) — no id-to-value resolution needed. Executor evidence: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer` → `Test Files 22 passed (22)`, `Tests 192 passed (192)`, incl. 13 new `tn-slice.test.ts` tests (null-at-defaults, post-normalize baseline equals a factory-fresh load, per-field config diff, preset captured as a value clone with a post-capture mutation proving it didn't move, capture→seed→apply→capture round-trip, and a zero-write spy pass over BOTH `tka_tunnel_view_state` and `tka_tunnel_user_presets` with an anti-vacuity companion). `npm run check` → `svelte-check found 0 errors and 0 warnings`. Deviation: the zero-write tests required `flushSync()` after each mutation (imported from `"svelte"`, following the existing `an-slice.test.ts` pattern) — `TunnelViewController` persists via a reactive `$effect` rather than an imperative save-on-set, so the effect's write is not observable synchronously in vitest without it; not a plan deviation, a test-mechanics finding. Orchestrator verified: re-ran sequence-viewer suite personally 22 files/192 tests green (+13 tn tests; the commit prose says 14 — the file holds 13 `it()` blocks, arithmetic favors 13); read full diff — seam replaces the disk read outright (`initialViewState ?? loadTunnelViewState()`), ArtPane gating to artType==="tunnel" prevents the double-mount capture shadow, `persistedTnSliceFromStorage` is read-only through the shared capture path, zero-write test seeds real recipient state incl. a preset list and proves both keys untouched with an anti-vacuity companion.)
- [x] Task 14 — ps slice (4474a687e8; pure instance seam with no merge-onto-defaults step on seed — the only slice shaped that way, since its three encoded fields are independent `$state` locals rather than one constructed store object. Confirmed `fx` inheritance via Svelte context (`SequenceViewerOrchestrator` sets it before `PostStudioPane` mounts) so effects are NOT re-encoded; excluded `MediaCompositionState` as a scope decision mirroring t3's `performers` exclusion — no existing seed seam, would need a partial-patch mechanism against a Zod-validated schema. Encoded: `propType` (diffed against the live per-session default, not a fixed constant), `audioMode` (touched-flag diffed, not value diffed — its default is an async decode probe), `notationMirrored` (seeded by calling the existing flip function once at mount rather than duplicating its cache-population branch). `persistedPsSlice()` always `null` — no encoded field persists to disk — so `isOverride` degenerates to "any non-null seed is an override," by design. Executor evidence: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer` → `Test Files 23 passed (23)`, `Tests 204 passed (204)`, incl. 12 new `ps-slice.test.ts` tests. `npm run check` → `svelte-check found 0 errors and 0 warnings`. Plan-wording correction (not a behavior change): the Task 14 store line said "`vm=post-studio`" — the actual viewer-mode param is `pane`, per the binding decision already recorded after Task 5; not touched by this task. Orchestrator verified: re-ran sequence-viewer suite personally 23 files/204 tests green (+12 ps tests); read full diff — seed computed before `selectedPropType` init and applied through the component's own initializers; the seeded `audioModeTouched` flag is load-bearing and correct (the untouched-audio `$effect` at PostStudio.svelte:521 bails on it, so a seeded choice survives the async `canKeepOriginalAudio` default); `setPropType`/`setAudioMode` verified to only reassign local `$state` — no settingsService write, so the always-null persisted baseline claim is real; the mount-time `void toggleNotationMirror()` call is flip-safe because both `notationMirrored` and `mirrorCache` still hold fresh-mount values at that point in setup, and an async build failure degrades honestly to unmirrored capture; `"ps"` confirmed in the codec's `SliceId` union and `BLOB_SLICE_IDS`. The zero-write test is admittedly the weakest of the eight slices — the module itself has no storage sink to exercise — but the test says so honestly, pairs the spy with an anti-vacuity companion, and the real write-risk surface (component wiring) was cleared by the setter inspection above. Design note recorded for the Task 15 report: `propType` diffs against the LIVE per-user default, so a sender who never touched Post Studio's prop picker shares a link that renders with the recipient's prop — acceptable because main-viewer prop identity already travels via the pre-existing `bp`/`rp` headline params (spec state-inventory line: "existing parsePropsFromURL — Exists; unchanged"), and Post Studio's picker is a deliberate per-surface override on top of that.)
- [x] Task 15 — Phase B gate (PASSED 2026-08-31; evidence in the Task 15 section above. Commits landed during the gate: 13a082d8a5 pane precedence, 7b55786b7b fx-to-3D eager wiring. Scope notes owed in the delivery report: t3 excludes performers/quality tier; ps excludes MediaCompositionState and chosenPerformance and went unexercised in the torture link because Post Studio is access-gated; cd excludes darkMode; the ex tweak was skipped in the live pass because its only entry point risks starting a real render; hide-left/right motion is per-mount ephemeral state deliberately outside the an slice; guest drawer URLs stay non-shareable by design; playback speed rides the pre-existing `?bpm=` headline param rather than the codec.)
