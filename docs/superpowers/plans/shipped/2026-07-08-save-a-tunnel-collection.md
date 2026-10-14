# Save-a-Tunnel Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click (or button) save of a live tunnel's full reproduction state into a Firebase-backed "favorite tunnels" collection with a Playground gallery that reproduces and exports it.

**Architecture:** Clone the proven 4-file mandala-collection template (types+zod → firestore-paths → firebase-repo over shared `firestore-crud` → state singleton with localStorage migration) into a new `tunnel-collection` feature. A new symmetric `captureTunnelSnapshot` / `applyTunnelSnapshot` pair (over the existing per-store getters/setters) powers save, sandboxed live preview, and open-in-viewer. A separate `captureTunnelPoster` downscales the live canvas to a small WebP for the gallery grid.

**Tech Stack:** Svelte 5 runes, TypeScript, Firestore (`firestore-crud`), zod, vitest.

**Spec:** `docs/superpowers/specs/2026-07-08-save-a-tunnel-collection-design.md`

**Conventions (every commit):**
- Scope each `git commit` to an explicit pathspec (`git commit -m "…" -- <paths>`). The git index is shared across parallel agents — never a bare `git commit`.
- Append these two trailer lines to every commit message:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01VpSyrzK9TZ46ePqu29pzr9
  ```
- Inner loop: rely on the running `check:watch` / targeted `npx vitest run`. Run one full `npm run check` only at the end (Task 12).

---

## File Structure

**Create:**
- `src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts` — `TunnelSnapshot` type, `SNAPSHOT_VERSION`, `TunnelSnapshotSchema` (zod), `SnapshotDeps`, `captureTunnelSnapshot`, `applyTunnelSnapshot`.
- `src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts`
- `src/lib/shared/sequence-viewer/tunnel/tunnel-poster.ts` — `captureTunnelPoster`.
- `src/lib/shared/sequence-viewer/tunnel/tunnel-poster.test.ts`
- `src/lib/features/tunnel-collection/domain/tunnel-collection-types.ts` — `CollectedTunnel` + schema + storage keys.
- `src/lib/features/tunnel-collection/domain/tunnel-collection-types.test.ts`
- `src/lib/features/tunnel-collection/services/firestore-paths.ts`
- `src/lib/features/tunnel-collection/services/firebase-tunnel-collection-repository.ts`
- `src/lib/features/tunnel-collection/services/local-tunnel-collection-repository.ts`
- `src/lib/features/tunnel-collection/services/local-tunnel-collection-repository.test.ts`
- `src/lib/features/tunnel-collection/state/tunnel-collection-state.svelte.ts`
- `src/lib/features/tunnel-collection/state/tunnel-collection-state.test.ts`
- `src/lib/features/tunnel-collection/TunnelCollectionModule.svelte`

**Modify:**
- `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte` (+ its context-menu host) — additive `extraContextMenuItems` prop.
- `src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte` — build `SnapshotDeps` + a "Save tunnel" menu entry; expose a `onSaveTunnel` prop.
- `src/lib/shared/sequence-viewer/components/ArtPane.svelte` — wire the save handler (capture + poster + `tunnelCollectionState.add`).
- `src/lib/shared/sequence-viewer/components/ArtSettingsPanel.svelte` — "Save tunnel" button in the tunnel section.
- `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte` — `applyTunnelSnapshot` + load-steps entry for Open-in-Viewer/Export.
- `src/lib/shared/auth/services/auth-boot-orchestrator.ts` — `tunnelCollectionState.init(uid)`.
- `src/lib/shared/auth/state/auth-state.svelte.ts` — `tunnelCollectionState.teardown()`.
- `src/lib/shared/navigation/config/tab-definitions.ts` — add "Tunnels" to `PLAYGROUND_TABS`.
- `src/lib/features/playground/PlaygroundModule.svelte` — register `tunnels` tab component.

---

## Task 1: Snapshot type, version, and zod schema

**Files:**
- Create: `src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts`
- Test: `src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tunnel-snapshot.test.ts
import { describe, it, expect } from "vitest";
import { TunnelSnapshotSchema, SNAPSHOT_VERSION } from "./tunnel-snapshot";
import { DEFAULT_CONFIG } from "./tunnel-config";

const validSnapshot = {
  version: SNAPSHOT_VERSION,
  tunnel: { config: DEFAULT_CONFIG, gridVisible: false, spectrum: true, section: "tunnel" },
  effects: { activeEffect: "none" }, // EffectsConfig is passed through untyped (z.any)
  effort: "linear",
  paths: { pathShape: "arc", motionAwarePaths: false, bluePathLines: false, redPathLines: false },
  playback: { bpm: 60, playbackMode: "continuous" },
  props: { bluePropType: "staff", redPropType: "staff" },
  trailRender: { mode: "trail" },
};

describe("TunnelSnapshotSchema", () => {
  it("accepts a well-formed snapshot", () => {
    expect(TunnelSnapshotSchema.safeParse(validSnapshot).success).toBe(true);
  });

  it("rejects a snapshot missing the tunnel block", () => {
    const { tunnel: _drop, ...rest } = validSnapshot;
    expect(TunnelSnapshotSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a bad section value", () => {
    const bad = { ...validSnapshot, tunnel: { ...validSnapshot.tunnel, section: "bogus" } };
    expect(TunnelSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts`
Expected: FAIL — `tunnel-snapshot` has no exports yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// tunnel-snapshot.ts
import { z } from "zod";
import type { TunnelConfig } from "./tunnel-config";
import type { TunnelViewState } from "./tunnel-view-state";
import type { EffectsConfig } from "$lib/shared/effects/domain/effects-config";
import type { EffortId } from "$lib/shared/effort/domain/effort-types";
import type { TrailSettings } from "$lib/shared/animation-engine/domain/types/trail-types";
import type { PlaybackMode } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";

export const SNAPSHOT_VERSION = 1;

type TunnelSection = TunnelViewState["section"];
type PathShape = "arc" | "linear" | "concave";

/** The complete, JSON-serializable reproduction state of a live tunnel. Trail
 *  visuals ride inside `effects.trails`, so they are not double-stored. */
export interface TunnelSnapshot {
  version: number;
  tunnel: { config: TunnelConfig; gridVisible: boolean; spectrum: boolean; section: TunnelSection };
  effects: EffectsConfig;
  effort: EffortId;
  paths: { pathShape: PathShape; motionAwarePaths: boolean; bluePathLines: boolean; redPathLines: boolean };
  playback: { bpm: number; playbackMode: PlaybackMode };
  props: { bluePropType: string; redPropType: string };
  trailRender: TrailSettings;
}

// TunnelConfig / EffectsConfig / TrailSettings are large, internally-validated
// shapes; the boundary schema guards the envelope + enums and passes the deep
// blobs through as `z.any()` (same pattern mandala uses for nested StepData).
export const TunnelSnapshotSchema = z.object({
  version: z.number(),
  tunnel: z.object({
    config: z.any(),
    gridVisible: z.boolean(),
    spectrum: z.boolean(),
    section: z.enum(["tunnel", "speed", "effects", "effort", "playback"]),
  }),
  effects: z.any(),
  effort: z.string(),
  paths: z.object({
    pathShape: z.enum(["arc", "linear", "concave"]),
    motionAwarePaths: z.boolean(),
    bluePathLines: z.boolean(),
    redPathLines: z.boolean(),
  }),
  playback: z.object({
    bpm: z.number(),
    playbackMode: z.enum(["continuous", "step"]),
  }),
  props: z.object({ bluePropType: z.string(), redPropType: z.string() }),
  trailRender: z.any(),
});
```

Note: if `PlaybackMode` is not exported from `animation-panel-state.svelte`, import it from wherever its `type PlaybackMode` is declared (grep `export type PlaybackMode`); the enum values are `"continuous" | "step"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts
git commit -m "feat(tunnel): TunnelSnapshot type + zod schema" -- src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts
```

---

## Task 2: `SnapshotDeps` + `captureTunnelSnapshot`

**Files:**
- Modify: `src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts`
- Test: `src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts`

- [ ] **Step 1: Write the failing test** (append to the test file)

```ts
import { captureTunnelSnapshot, type SnapshotDeps } from "./tunnel-snapshot";

function fakeDeps(): SnapshotDeps {
  return {
    controller: {
      config: { ...DEFAULT_CONFIG, fold: 4 },
      gridVisible: true,
      spectrum: false,
      section: "effects",
      applyConfig() {},
    } as unknown as SnapshotDeps["controller"],
    effects: { config: { activeEffect: "fire", tag: "E" }, replace() {} } as unknown as SnapshotDeps["effects"],
    visibility: {
      getEffortPreset: () => "sharp",
      getPathShape: () => "concave",
      getMotionAwarePaths: () => true,
      getVisibility: (k: string) => k === "bluePathLines",
      setEffortPreset() {}, setPathShape() {}, setMotionAwarePaths() {}, setVisibility() {},
    } as unknown as SnapshotDeps["visibility"],
    settings: { bluePropType: "fan", redPropType: "club", updateSettings() {} } as unknown as SnapshotDeps["settings"],
    animationSettings: { trail: { mode: "trail", tag: "T" }, updateSettings() {} } as unknown as SnapshotDeps["animationSettings"],
    playback: { handleBpmChange() {}, handlePlaybackModeChange() {} } as unknown as SnapshotDeps["playback"],
    animationPanel: { playbackMode: "step" } as unknown as SnapshotDeps["animationPanel"],
    getBpm: () => 144,
  };
}

describe("captureTunnelSnapshot", () => {
  it("reads every store into the flat blob", () => {
    const snap = captureTunnelSnapshot(fakeDeps());
    expect(snap.version).toBe(SNAPSHOT_VERSION);
    expect(snap.tunnel).toEqual({ config: { ...DEFAULT_CONFIG, fold: 4 }, gridVisible: true, spectrum: false, section: "effects" });
    expect(snap.effort).toBe("sharp");
    expect(snap.paths).toEqual({ pathShape: "concave", motionAwarePaths: true, bluePathLines: true, redPathLines: false });
    expect(snap.playback).toEqual({ bpm: 144, playbackMode: "step" });
    expect(snap.props).toEqual({ bluePropType: "fan", redPropType: "club" });
  });

  it("deep-clones effects + trailRender (no shared reference to the live store)", () => {
    const deps = fakeDeps();
    const snap = captureTunnelSnapshot(deps);
    expect(snap.effects).toEqual(deps.effects.config);
    expect(snap.effects).not.toBe(deps.effects.config);
    expect(snap.trailRender).toEqual(deps.animationSettings.trail);
    expect(snap.trailRender).not.toBe(deps.animationSettings.trail);
  });

  it("passes the schema it produces", () => {
    expect(TunnelSnapshotSchema.safeParse(captureTunnelSnapshot(fakeDeps())).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts`
Expected: FAIL — `captureTunnelSnapshot` / `SnapshotDeps` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `tunnel-snapshot.ts`)

```ts
import type { TunnelViewController } from "./tunnel-view-controller.svelte";
import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import type { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import type { AnimationSettingsState } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";

/** Everything capture/apply needs, passed in by the caller (no ambient store
 *  access) so the module is testable in isolation. */
export interface SnapshotDeps {
  controller: TunnelViewController;
  effects: EffectsConfigState;
  visibility: AnimationVisibilityStateManager;
  settings: { bluePropType: string; redPropType: string; updateSettings: (p: { bluePropType?: string; redPropType?: string }) => unknown };
  animationSettings: AnimationSettingsState;
  playback: { handleBpmChange: (bpm: number) => void; handlePlaybackModeChange: (mode: PlaybackMode) => void };
  animationPanel: { playbackMode: PlaybackMode };
  getBpm: () => number;
}

const clone = <T>(v: T): T => {
  try { return structuredClone(v); }
  catch { return JSON.parse(JSON.stringify(v)); }
};

export function captureTunnelSnapshot(deps: SnapshotDeps): TunnelSnapshot {
  const { controller, effects, visibility, settings, animationSettings, animationPanel, getBpm } = deps;
  return {
    version: SNAPSHOT_VERSION,
    tunnel: {
      config: clone(controller.config),
      gridVisible: controller.gridVisible,
      spectrum: controller.spectrum,
      section: controller.section,
    },
    effects: clone(effects.config),
    effort: visibility.getEffortPreset(),
    paths: {
      pathShape: visibility.getPathShape(),
      motionAwarePaths: visibility.getMotionAwarePaths(),
      bluePathLines: visibility.getVisibility("bluePathLines"),
      redPathLines: visibility.getVisibility("redPathLines"),
    },
    playback: { bpm: getBpm(), playbackMode: animationPanel.playbackMode },
    props: { bluePropType: settings.bluePropType, redPropType: settings.redPropType },
    trailRender: clone(animationSettings.trail),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tunnel): captureTunnelSnapshot + SnapshotDeps" -- src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts
```

---

## Task 3: `applyTunnelSnapshot` (round-trip symmetric with capture)

**Files:**
- Modify: `src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts`
- Test: `src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { applyTunnelSnapshot } from "./tunnel-snapshot";
import { vi } from "vitest";

describe("applyTunnelSnapshot", () => {
  it("fans the snapshot out through the per-store setters", () => {
    // A mutable spy deps whose getters read back what the setters wrote.
    const store = {
      config: { ...DEFAULT_CONFIG }, gridVisible: false, spectrum: true, section: "tunnel",
      effort: "linear", pathShape: "arc", motionAware: false, blueLines: false, redLines: false,
      bluePropType: "staff", redPropType: "staff", bpm: 60, playbackMode: "continuous",
      effects: { activeEffect: "none" }, trail: { mode: "none" },
    };
    const deps = {
      controller: {
        get config() { return store.config; },
        get gridVisible() { return store.gridVisible; }, set gridVisible(v) { store.gridVisible = v; },
        get spectrum() { return store.spectrum; }, set spectrum(v) { store.spectrum = v; },
        get section() { return store.section; }, set section(v) { store.section = v; },
        applyConfig: vi.fn((c) => { store.config = c; }),
      },
      effects: { get config() { return store.effects; }, replace: vi.fn((c) => { store.effects = c; }) },
      visibility: {
        getEffortPreset: () => store.effort, setEffortPreset: vi.fn((v) => { store.effort = v; }),
        getPathShape: () => store.pathShape, setPathShape: vi.fn((v) => { store.pathShape = v; }),
        getMotionAwarePaths: () => store.motionAware, setMotionAwarePaths: vi.fn((v) => { store.motionAware = v; }),
        getVisibility: (k) => (k === "bluePathLines" ? store.blueLines : store.redLines),
        setVisibility: vi.fn((k, v) => { if (k === "bluePathLines") store.blueLines = v; else store.redLines = v; }),
      },
      settings: {
        get bluePropType() { return store.bluePropType; }, get redPropType() { return store.redPropType; },
        updateSettings: vi.fn((p) => Object.assign(store, p)),
      },
      animationSettings: { get trail() { return store.trail; }, updateSettings: vi.fn((p) => { if (p.trail) store.trail = p.trail; }) },
      playback: { handleBpmChange: vi.fn((b) => { store.bpm = b; }), handlePlaybackModeChange: vi.fn((m) => { store.playbackMode = m; }) },
      animationPanel: { get playbackMode() { return store.playbackMode; } },
      getBpm: () => store.bpm,
    } as unknown as SnapshotDeps;

    const target: TunnelSnapshot = {
      version: SNAPSHOT_VERSION,
      tunnel: { config: { ...DEFAULT_CONFIG, fold: 8 }, gridVisible: true, spectrum: false, section: "effort" },
      effects: { activeEffect: "fire" } as never,
      effort: "sharp",
      paths: { pathShape: "concave", motionAwarePaths: true, bluePathLines: true, redPathLines: false },
      playback: { bpm: 120, playbackMode: "step" },
      props: { bluePropType: "fan", redPropType: "club" },
      trailRender: { mode: "trail" } as never,
    };

    applyTunnelSnapshot(deps, target);

    // Round-trip: capturing after applying reproduces the target (idempotent).
    expect(captureTunnelSnapshot(deps)).toEqual(target);
    expect(deps.controller.applyConfig).toHaveBeenCalledWith(target.tunnel.config);
    expect(deps.effects.replace).toHaveBeenCalledWith(target.effects);
    expect(deps.playback.handleBpmChange).toHaveBeenCalledWith(120);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts`
Expected: FAIL — `applyTunnelSnapshot` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `tunnel-snapshot.ts`)

```ts
export function applyTunnelSnapshot(deps: SnapshotDeps, snap: TunnelSnapshot): void {
  const { controller, effects, visibility, settings, animationSettings, playback } = deps;

  // Tunnel topology + chrome (applyConfig clamps to the live budget; grid/spectrum/
  // section are public $state fields on the controller).
  controller.applyConfig(snap.tunnel.config);
  controller.gridVisible = snap.tunnel.gridVisible;
  controller.spectrum = snap.tunnel.spectrum;
  controller.section = snap.tunnel.section;

  // Effects (its own capture/restore pair).
  effects.replace(snap.effects);

  // Effort + paths (global visibility manager).
  visibility.setEffortPreset(snap.effort);
  visibility.setPathShape(snap.paths.pathShape);
  visibility.setMotionAwarePaths(snap.paths.motionAwarePaths);
  visibility.setVisibility("bluePathLines", snap.paths.bluePathLines);
  visibility.setVisibility("redPathLines", snap.paths.redPathLines);

  // Trail render params (bulk trail set).
  animationSettings.updateSettings({ trail: snap.trailRender });

  // Playback (mode first, then bpm ramp).
  playback.handlePlaybackModeChange(snap.playback.playbackMode);
  playback.handleBpmChange(snap.playback.bpm);

  // Prop types.
  settings.updateSettings({ bluePropType: snap.props.bluePropType, redPropType: snap.props.redPropType });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tunnel): applyTunnelSnapshot (symmetric restore)" -- src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.test.ts
```

---

## Task 4: `captureTunnelPoster` (downscale live canvas → WebP)

**Files:**
- Create: `src/lib/shared/sequence-viewer/tunnel/tunnel-poster.ts`
- Test: `src/lib/shared/sequence-viewer/tunnel/tunnel-poster.test.ts`

Rationale: the tunnel already renders to an on-screen `<canvas>`. The poster is a
one-frame, downscaled copy of it — no re-render, no second WebGL context. Isolated
behind one function so the fallback (read the on-screen canvas at the current
frame) doesn't ripple. `preserveDrawingBuffer` risk: AnimatorCanvas composites to
a 2D canvas the caller passes; if the source is a raw WebGL canvas that reads
blank, the caller passes the composite canvas instead (wired in Task 9).

- [ ] **Step 1: Write the failing test**

```ts
// tunnel-poster.test.ts
import { describe, it, expect, vi } from "vitest";
import { captureTunnelPoster, POSTER_SIZE } from "./tunnel-poster";

function fakeSource(w: number, h: number): HTMLCanvasElement {
  return { width: w, height: h } as HTMLCanvasElement;
}

describe("captureTunnelPoster", () => {
  it("draws the source into a POSTER_SIZE square and returns a webp data URL", () => {
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => "data:image/webp;base64,AAAA");
    const ctx = { drawImage, clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
    const target = { width: 0, height: 0, getContext: () => ctx, toDataURL } as unknown as HTMLCanvasElement;
    const makeCanvas = () => target;

    const url = captureTunnelPoster(fakeSource(800, 800), makeCanvas);

    expect(target.width).toBe(POSTER_SIZE);
    expect(target.height).toBe(POSTER_SIZE);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(toDataURL).toHaveBeenCalledWith("image/webp", expect.any(Number));
    expect(url).toBe("data:image/webp;base64,AAAA");
  });

  it("returns empty string when the source has no dimensions", () => {
    expect(captureTunnelPoster(fakeSource(0, 0), () => ({} as HTMLCanvasElement))).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/sequence-viewer/tunnel/tunnel-poster.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// tunnel-poster.ts
/** Edge length of the square poster thumbnail stored per saved tunnel. Small so
 *  the WebP data URL stays a few KB (well under the Firestore 1MB doc limit). */
export const POSTER_SIZE = 200;

type CanvasFactory = () => HTMLCanvasElement;

const defaultFactory: CanvasFactory = () => document.createElement("canvas");

/**
 * Downscale a rendered tunnel canvas to a POSTER_SIZE² WebP data URL. Cover-fits
 * (center-crop) so the roughly-circular pattern fills the square. Returns "" if
 * the source is empty or a 2D context can't be obtained.
 */
export function captureTunnelPoster(
  source: HTMLCanvasElement,
  makeCanvas: CanvasFactory = defaultFactory,
): string {
  const sw = source.width;
  const sh = source.height;
  if (!sw || !sh) return "";

  const target = makeCanvas();
  target.width = POSTER_SIZE;
  target.height = POSTER_SIZE;
  const ctx = target.getContext("2d");
  if (!ctx) return "";

  // Cover fit: crop the source to a centered square, scale into the poster.
  const side = Math.min(sw, sh);
  const sx = (sw - side) / 2;
  const sy = (sh - side) / 2;
  ctx.clearRect(0, 0, POSTER_SIZE, POSTER_SIZE);
  ctx.drawImage(source, sx, sy, side, side, 0, 0, POSTER_SIZE, POSTER_SIZE);

  return target.toDataURL("image/webp", 0.8);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/sequence-viewer/tunnel/tunnel-poster.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tunnel): captureTunnelPoster (canvas → webp thumbnail)" -- src/lib/shared/sequence-viewer/tunnel/tunnel-poster.ts src/lib/shared/sequence-viewer/tunnel/tunnel-poster.test.ts
```

---

## Task 5: Collection domain types + zod

**Files:**
- Create: `src/lib/features/tunnel-collection/domain/tunnel-collection-types.ts`
- Test: `src/lib/features/tunnel-collection/domain/tunnel-collection-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tunnel-collection-types.test.ts
import { describe, it, expect } from "vitest";
import { CollectedTunnelSchema, TUNNEL_COLLECTION_STORAGE_KEY } from "./tunnel-collection-types";
import { SNAPSHOT_VERSION } from "$lib/shared/sequence-viewer/tunnel/tunnel-snapshot";
import { DEFAULT_CONFIG } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";

const snapshot = {
  version: SNAPSHOT_VERSION,
  tunnel: { config: DEFAULT_CONFIG, gridVisible: false, spectrum: true, section: "tunnel" },
  effects: { activeEffect: "none" },
  effort: "linear",
  paths: { pathShape: "arc", motionAwarePaths: false, bluePathLines: false, redPathLines: false },
  playback: { bpm: 60, playbackMode: "continuous" },
  props: { bluePropType: "staff", redPropType: "staff" },
  trailRender: { mode: "none" },
};

const valid = { id: "t1", name: "My Tunnel", steps: [], snapshot, poster: "data:image/webp;base64,AA", createdAt: 123 };

describe("CollectedTunnelSchema", () => {
  it("accepts a well-formed record", () => {
    expect(CollectedTunnelSchema.safeParse(valid).success).toBe(true);
  });
  it("requires an id", () => {
    const { id: _drop, ...rest } = valid;
    expect(CollectedTunnelSchema.safeParse(rest).success).toBe(false);
  });
  it("exposes the storage key", () => {
    expect(TUNNEL_COLLECTION_STORAGE_KEY).toBe("tka:tunnel-collection");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/features/tunnel-collection/domain/tunnel-collection-types.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// tunnel-collection-types.ts
import { z } from "zod";
import { StepDataSchema } from "$lib/shared/foundation/domain/schemas";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { TunnelSnapshotSchema, type TunnelSnapshot } from "$lib/shared/sequence-viewer/tunnel/tunnel-snapshot";

export interface CollectedTunnel {
  id: string;
  name: string;
  steps: StepData[];
  snapshot: TunnelSnapshot;
  poster: string; // ~200px WebP data URL
  createdAt: number;
  source?: "viewer" | "default";
}

export const CollectedTunnelSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  steps: z.array(StepDataSchema),
  snapshot: TunnelSnapshotSchema,
  poster: z.string(),
  createdAt: z.any(),
  updatedAt: z.any().optional(),
  source: z.enum(["viewer", "default"]).optional(),
});

export const TUNNEL_COLLECTION_STORAGE_KEY = "tka:tunnel-collection";
export const TUNNEL_COLLECTION_SCHEMA_VERSION = 1;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/features/tunnel-collection/domain/tunnel-collection-types.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tunnel-collection): CollectedTunnel type + schema" -- src/lib/features/tunnel-collection/domain/tunnel-collection-types.ts src/lib/features/tunnel-collection/domain/tunnel-collection-types.test.ts
```

---

## Task 6: Firestore paths + Firebase repository

**Files:**
- Create: `src/lib/features/tunnel-collection/services/firestore-paths.ts`
- Create: `src/lib/features/tunnel-collection/services/firebase-tunnel-collection-repository.ts`

No unit test here (Firestore CRUD is exercised through the state test in Task 8 with a mocked repo). These are direct clones of the mandala files with names swapped.

- [ ] **Step 1: Write `firestore-paths.ts`**

```ts
export function getUserTunnelCollectionPath(userId: string): string {
  return `users/${userId}/tunnel-collection`;
}

export function getUserTunnelPath(userId: string, tunnelId: string): string {
  return `users/${userId}/tunnel-collection/${tunnelId}`;
}
```

- [ ] **Step 2: Write `firebase-tunnel-collection-repository.ts`**

```ts
import { firestoreList, firestoreSet, firestoreDelete } from "$lib/shared/firestore/firestore-crud";
import { getUserTunnelCollectionPath } from "./firestore-paths";
import { CollectedTunnelSchema } from "../domain/tunnel-collection-types";
import type { CollectedTunnel } from "../domain/tunnel-collection-types";

export async function loadTunnels(userId: string): Promise<CollectedTunnel[]> {
  const path = getUserTunnelCollectionPath(userId);
  const results = await firestoreList(path, CollectedTunnelSchema, {
    orderBy: [{ field: "createdAt", direction: "desc" }],
  });
  return results as CollectedTunnel[];
}

export async function saveTunnel(userId: string, tunnel: CollectedTunnel): Promise<void> {
  const path = getUserTunnelCollectionPath(userId);
  const { id, ...data } = tunnel;
  await firestoreSet(path, id, data as Record<string, unknown>);
}

export async function removeTunnel(userId: string, tunnelId: string): Promise<void> {
  const path = getUserTunnelCollectionPath(userId);
  await firestoreDelete(path, tunnelId);
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i tunnel-collection` (or rely on `check:watch`).
Expected: no errors referencing these two files.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(tunnel-collection): firestore paths + firebase repo" -- src/lib/features/tunnel-collection/services/firestore-paths.ts src/lib/features/tunnel-collection/services/firebase-tunnel-collection-repository.ts
```

---

## Task 7: Local (migration) repository

**Files:**
- Create: `src/lib/features/tunnel-collection/services/local-tunnel-collection-repository.ts`
- Test: `src/lib/features/tunnel-collection/services/local-tunnel-collection-repository.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// local-tunnel-collection-repository.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { LocalTunnelCollectionRepository } from "./local-tunnel-collection-repository";
import { TUNNEL_COLLECTION_STORAGE_KEY, TUNNEL_COLLECTION_SCHEMA_VERSION } from "../domain/tunnel-collection-types";
import type { CollectedTunnel } from "../domain/tunnel-collection-types";

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null, length: 0,
  } as Storage;
}

const entry = { id: "t1", name: "T", steps: [], snapshot: {}, poster: "", createdAt: 1 } as unknown as CollectedTunnel;

describe("LocalTunnelCollectionRepository", () => {
  let storage: Storage;
  beforeEach(() => { storage = makeStorage(); });

  it("round-trips a versioned payload", () => {
    const repo = new LocalTunnelCollectionRepository(storage);
    repo.save([entry]);
    expect(repo.load()).toEqual([entry]);
  });

  it("returns [] on a version mismatch", () => {
    storage.setItem(TUNNEL_COLLECTION_STORAGE_KEY, JSON.stringify({ version: TUNNEL_COLLECTION_SCHEMA_VERSION + 1, collection: [entry] }));
    expect(new LocalTunnelCollectionRepository(storage).load()).toEqual([]);
  });

  it("returns [] when empty or malformed, and clear() wipes", () => {
    const repo = new LocalTunnelCollectionRepository(storage);
    expect(repo.load()).toEqual([]);
    storage.setItem(TUNNEL_COLLECTION_STORAGE_KEY, "{not json");
    expect(repo.load()).toEqual([]);
    repo.save([entry]);
    repo.clear();
    expect(repo.load()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/features/tunnel-collection/services/local-tunnel-collection-repository.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation** (clone of the mandala local repo)

```ts
// local-tunnel-collection-repository.ts
import type { CollectedTunnel } from "../domain/tunnel-collection-types";
import {
  TUNNEL_COLLECTION_STORAGE_KEY,
  TUNNEL_COLLECTION_SCHEMA_VERSION,
} from "../domain/tunnel-collection-types";

interface StoredPayload {
  version: number;
  collection: CollectedTunnel[];
}

export class LocalTunnelCollectionRepository {
  constructor(private readonly storage: Storage = globalThis.localStorage) {}

  load(): CollectedTunnel[] {
    const raw = this.storage.getItem(TUNNEL_COLLECTION_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isStoredPayload(parsed)) return [];
      if (parsed.version !== TUNNEL_COLLECTION_SCHEMA_VERSION) return [];
      return parsed.collection;
    } catch {
      return [];
    }
  }

  save(collection: CollectedTunnel[]): void {
    const payload: StoredPayload = { version: TUNNEL_COLLECTION_SCHEMA_VERSION, collection };
    this.storage.setItem(TUNNEL_COLLECTION_STORAGE_KEY, JSON.stringify(payload));
  }

  clear(): void {
    this.storage.removeItem(TUNNEL_COLLECTION_STORAGE_KEY);
  }
}

function isStoredPayload(value: unknown): value is StoredPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    "collection" in value &&
    typeof (value as Record<string, unknown>).version === "number" &&
    Array.isArray((value as Record<string, unknown>).collection)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/features/tunnel-collection/services/local-tunnel-collection-repository.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tunnel-collection): local migration repository" -- src/lib/features/tunnel-collection/services/local-tunnel-collection-repository.ts src/lib/features/tunnel-collection/services/local-tunnel-collection-repository.test.ts
```

---

## Task 8: Collection state singleton

**Files:**
- Create: `src/lib/features/tunnel-collection/state/tunnel-collection-state.svelte.ts`
- Test: `src/lib/features/tunnel-collection/state/tunnel-collection-state.test.ts`

- [ ] **Step 1: Write the failing test** (mocks the firebase repo module so no Firestore is hit)

```ts
// tunnel-collection-state.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const saved: unknown[] = [];
const removed: string[] = [];
vi.mock("../services/firebase-tunnel-collection-repository", () => ({
  loadTunnels: vi.fn(async () => []),
  saveTunnel: vi.fn(async (_uid: string, t: unknown) => { saved.push(t); }),
  removeTunnel: vi.fn(async (_uid: string, id: string) => { removed.push(id); }),
}));

import { TunnelCollectionState } from "./tunnel-collection-state.svelte";

const base = { name: "T", steps: [], snapshot: {} as never, poster: "" };

describe("TunnelCollectionState", () => {
  beforeEach(() => { saved.length = 0; removed.length = 0; });

  it("add() prepends, assigns id + createdAt, and persists when signed in", async () => {
    const s = new TunnelCollectionState();
    await s.init("user-1");
    const entry = await s.add(base);
    expect(entry.id).toBeTruthy();
    expect(typeof entry.createdAt).toBe("number");
    expect(s.collection[0]).toBe(entry);
    expect(s.count).toBe(1);
    expect(saved).toHaveLength(1);
  });

  it("remove() drops the entry and calls the repo", async () => {
    const s = new TunnelCollectionState();
    await s.init("user-1");
    const entry = await s.add(base);
    await s.remove(entry.id);
    expect(s.count).toBe(0);
    expect(removed).toEqual([entry.id]);
  });

  it("teardown() clears state", async () => {
    const s = new TunnelCollectionState();
    await s.init("user-1");
    await s.add(base);
    s.teardown();
    expect(s.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/features/tunnel-collection/state/tunnel-collection-state.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation** (clone of mandala state, `class` exported for testability + singleton at bottom)

```ts
// tunnel-collection-state.svelte.ts
import type { CollectedTunnel } from "../domain/tunnel-collection-types";
import { LocalTunnelCollectionRepository } from "../services/local-tunnel-collection-repository";
import { loadTunnels, saveTunnel, removeTunnel } from "../services/firebase-tunnel-collection-repository";

const localRepo = new LocalTunnelCollectionRepository();

export class TunnelCollectionState {
  collection = $state<CollectedTunnel[]>([]);
  loading = $state(false);
  private userId: string | null = null;
  private initialized = false;

  async init(userId: string): Promise<void> {
    this.userId = userId;
    this.loading = true;
    try {
      const firebaseEntries = await loadTunnels(userId);
      this.collection = firebaseEntries;
      await this.migrateFromLocalStorage(userId, firebaseEntries);
      this.initialized = true;
    } finally {
      this.loading = false;
    }
  }

  teardown(): void {
    this.collection = [];
    this.loading = false;
    this.userId = null;
    this.initialized = false;
  }

  async add(tunnel: Omit<CollectedTunnel, "id" | "createdAt">): Promise<CollectedTunnel> {
    const entry: CollectedTunnel = { ...tunnel, id: crypto.randomUUID(), createdAt: Date.now() };
    this.collection.unshift(entry);
    if (this.userId) await saveTunnel(this.userId, entry);
    return entry;
  }

  async remove(id: string): Promise<void> {
    const idx = this.collection.findIndex((t) => t.id === id);
    if (idx !== -1) {
      this.collection.splice(idx, 1);
      if (this.userId) await removeTunnel(this.userId, id);
    }
  }

  get count(): number {
    return this.collection.length;
  }

  private async migrateFromLocalStorage(userId: string, existing: CollectedTunnel[]): Promise<void> {
    const localEntries = localRepo.load();
    if (localEntries.length === 0) return;
    const existingIds = new Set(existing.map((t) => t.id));
    const toMigrate = localEntries.filter((t) => !existingIds.has(t.id));
    for (const entry of toMigrate) {
      await saveTunnel(userId, entry);
      this.collection.push(entry);
    }
    localRepo.clear();
  }
}

export const tunnelCollectionState = new TunnelCollectionState();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/features/tunnel-collection/state/tunnel-collection-state.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tunnel-collection): collection state singleton + migration" -- src/lib/features/tunnel-collection/state/tunnel-collection-state.svelte.ts src/lib/features/tunnel-collection/state/tunnel-collection-state.test.ts
```

---

## Task 9: `AnimatorCanvas` extra context-menu items (additive prop)

**Files:**
- Modify: `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte`

Context: `AnimatorCanvas` has `handleContextMenu(e)` → `contextMenuHost?.openContextMenu(...)` and mounts a context-menu host. Add an optional `extraContextMenuItems` prop that is merged (prepended) into that host's items, so a consumer can add a "Save tunnel" entry without forking the menu.

- [ ] **Step 1: Read the current menu host wiring**

Run: search `AnimatorCanvas.svelte` for `ContextMenuHost`, `openContextMenu`, and `items=` to find the host component + how its `items` are built. Read that host file (`CanvasContextMenuHost.svelte` or `ChoreoCardContextMenuHost.svelte` — whichever AnimatorCanvas mounts).

- [ ] **Step 2: Add the prop + thread it**

In `AnimatorCanvas.svelte` `$props()` add:

```ts
import type { ContextMenuEntry } from "$lib/shared/components/context-menu/ContextMenu.svelte";
// …
extraContextMenuItems = [] as ContextMenuEntry[],
```

Add to the props type:

```ts
extraContextMenuItems?: ContextMenuEntry[];
```

Pass it to the mounted host (the host must accept and prepend it). If the host builds a fixed `items` array, change that array to `[...extraContextMenuItems, ...existingItems]`. If the host is a shared component used elsewhere, add an optional `extraItems` prop to it defaulting to `[]` and spread it first.

Confirm the exact `ContextMenuEntry` export name by reading `src/lib/shared/components/context-menu/ContextMenu.svelte` (grep `export .*ContextMenuEntry`). Use that name.

- [ ] **Step 3: Verify types**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -iE "AnimatorCanvas|ContextMenu"` (or watch).
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(animator): additive extraContextMenuItems on AnimatorCanvas" -- src/lib/shared/animation-engine/components/AnimatorCanvas.svelte <the host file you edited>
```

---

## Task 10: Save trigger — `TunnelArtView` deps + entry, `ArtPane` handler, `ArtSettingsPanel` button

**Files:**
- Modify: `src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte`
- Modify: `src/lib/shared/sequence-viewer/components/ArtPane.svelte`
- Modify: `src/lib/shared/sequence-viewer/components/ArtSettingsPanel.svelte`

`TunnelArtView` already holds `effectsConfig`, `controller`, `bpm`, `bluePropType`,
`redPropType`, and imports `animationSettings`. It builds `SnapshotDeps` and offers
a save callback; the actual capture + `tunnelCollectionState.add` lives in the save
handler passed down from `ArtPane` (where the sequence + prop types are in scope).

- [ ] **Step 1: `TunnelArtView` — accept an `onSaveTunnel` prop and pass a Save entry to the canvas**

Add to `$props()`:

```ts
onSaveTunnel,
```
and to the props type:
```ts
onSaveTunnel?: () => void;
```

Import the context-menu entry type and build the entry, then pass it to `AnimatorCanvas`:

```svelte
<script lang="ts">
  import type { ContextMenuEntry } from "$lib/shared/components/context-menu/ContextMenu.svelte";
  // …existing imports…

  const saveMenuItems = $derived<ContextMenuEntry[]>(
    onSaveTunnel ? [{ id: "save-tunnel", label: "Save tunnel", icon: "fa-bookmark", action: onSaveTunnel }] : [],
  );
</script>
```

Add `extraContextMenuItems={saveMenuItems}` to the `<AnimatorCanvas …/>` prop list.

Match the actual `ContextMenuEntry` field names discovered in Task 9 (e.g. `label`/`icon`/`action`).

- [ ] **Step 2: `ArtPane` — implement the save handler**

`ArtPane` renders `<TunnelArtView controller={…} bpm={…} bluePropType={…} redPropType={…} …/>`. It has access to the sequence and the shared controller. Add a `handleSaveTunnel` and pass it as `onSaveTunnel`.

```svelte
<script lang="ts">
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { captureTunnelSnapshot, type SnapshotDeps } from "$lib/shared/sequence-viewer/tunnel/tunnel-snapshot";
  import { captureTunnelPoster } from "$lib/shared/sequence-viewer/tunnel/tunnel-poster";
  import { tunnelCollectionState } from "$lib/features/tunnel-collection/state/tunnel-collection-state.svelte";
  import { toast } from "$lib/shared/components/toast/…"; // use the same toast import mandala's WorkspaceGrid uses
  // existing settings/playback/animationPanel handles are already in scope in ArtPane
  //   (or read them from the props ArtPane receives — see how bpm/bluePropType arrive).

  function buildDeps(): SnapshotDeps {
    return {
      controller,                                   // the tunnel controller ArtPane owns
      effects: getEffectsConfigContext()!,          // provider is mounted above the pane
      visibility: getAnimationVisibilityManager(),
      settings,                                      // the app settings state ArtPane already reads bluePropType/redPropType from
      animationSettings,
      playback,                                      // the playback-controller handle (handleBpmChange/handlePlaybackModeChange)
      animationPanel,                                // the animation-panel-state (playbackMode)
      getBpm: () => bpm,
    };
  }

  async function handleSaveTunnel() {
    const seq = /* the current SequenceData ArtPane renders */;
    const steps = seq?.steps ?? [];
    const snapshot = captureTunnelSnapshot(buildDeps());
    const srcCanvas = tunnelStageEl?.querySelector("canvas") as HTMLCanvasElement | null;
    const poster = srcCanvas ? captureTunnelPoster(srcCanvas) : "";
    const name = seq?.word || `Tunnel #${tunnelCollectionState.count + 1}`;
    await tunnelCollectionState.add({ name, steps, snapshot, poster, source: "viewer" });
    toast.success("Tunnel saved to your collection");
  }
</script>
```

Wire `bind:this={tunnelStageEl}` on the wrapper around `<TunnelArtView>` (or read the canvas via the existing pane ref) so the poster can read the live canvas. Pass `onSaveTunnel={handleSaveTunnel}` to `<TunnelArtView>`.

If any of `settings` / `playback` / `animationPanel` are not already in `ArtPane`'s scope, thread them from `SequenceViewerOrchestrator` (which owns all three — see Task 11) as props to `ArtPane`. Read `ArtPane`'s current `$props()` first and follow the existing threading style.

- [ ] **Step 3: `ArtSettingsPanel` — add the "Save tunnel" button**

In the tunnel section body (`id === "tunnel"`), beside the `.customize-btn`, add:

```svelte
<button class="customize-btn" onclick={onSaveTunnel}>
  <i class="fas fa-bookmark" aria-hidden="true"></i>
  Save tunnel
</button>
```

Add `onSaveTunnel?: () => void;` to `ArtSettingsPanel`'s `$props()` and thread it from wherever `ArtSettingsPanel` is mounted (the same host that owns the tunnel `controller`). Reuse the existing `.customize-btn` class (44px touch target already satisfied). Do NOT use a checkbox or a bare text link.

- [ ] **Step 4: Verify**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -iE "ArtPane|ArtSettingsPanel|TunnelArtView"` (or watch).
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tunnel): Save tunnel via button + canvas right-click" -- src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte src/lib/shared/sequence-viewer/components/ArtPane.svelte src/lib/shared/sequence-viewer/components/ArtSettingsPanel.svelte
```

---

## Task 11: Open-in-viewer + export entry on the orchestrator

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte`

The collection page needs to: load a saved tunnel's `steps` as the viewer's
sequence, switch to Tunnel mode, apply the snapshot, and (for Export) fire the
existing export. Expose ONE method on the orchestrator (or a small exported
helper it owns) that does the apply, reusing `applyTunnelSnapshot`.

- [ ] **Step 1: Read the orchestrator's sequence-load + mode-switch + export entry**

Run: in `SequenceViewerOrchestrator.svelte` find how a sequence gets loaded (search `sequenceData`, `loadSequence`, `setSequence`), how the viewer mode is set to `tunnel` (search `viewer-modes`, `mode =`, `'tunnel'`), and the export entry (`handleArtExport` / `exportCoord.exportTunnel`).

- [ ] **Step 2: Add an `openTunnelSnapshot` method**

```ts
import { applyTunnelSnapshot, type SnapshotDeps, type TunnelSnapshot } from "$lib/shared/sequence-viewer/tunnel/tunnel-snapshot";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

/**
 * Load a saved tunnel into the live viewer: set its sequence, switch to Tunnel
 * mode, apply the full snapshot. When `andExport` is true, fire the existing
 * tunnel export after the state settles.
 */
export async function openTunnelSnapshot(
  steps: StepData[],
  snapshot: TunnelSnapshot,
  andExport = false,
): Promise<void> {
  // 1. materialize the sequence into the engine (reuse the existing load path)
  // 2. set viewer mode to 'tunnel'
  // 3. applyTunnelSnapshot(buildDeps(), snapshot)   // buildDeps mirrors ArtPane's
  // 4. if (andExport) await handleArtExport(...)     // the existing export entry
}
```

Fill each numbered step with the concrete calls found in Step 1 (the load path, the mode setter, the `buildDeps()` from Task 10, and the existing export handler). Export the function (or expose it via the component instance) so the collection module can call it. If the collection module runs outside the viewer's component tree, route through the existing viewer-open mechanism (how the drawer host opens a sequence) + apply — follow whatever entry the app already uses to open the viewer with a given sequence.

- [ ] **Step 3: Verify**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -i SequenceViewerOrchestrator` (or watch).
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(viewer): openTunnelSnapshot (load steps + apply + optional export)" -- src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte
```

---

## Task 12: Playground "Tunnels" tab + collection module + boot wiring

**Files:**
- Create: `src/lib/features/tunnel-collection/TunnelCollectionModule.svelte`
- Modify: `src/lib/shared/navigation/config/tab-definitions.ts`
- Modify: `src/lib/features/playground/PlaygroundModule.svelte`
- Modify: `src/lib/shared/auth/services/auth-boot-orchestrator.ts`
- Modify: `src/lib/shared/auth/state/auth-state.svelte.ts`

- [ ] **Step 1: Boot wiring — init on sign-in**

In `auth-boot-orchestrator.ts`, beside the existing `mandalaCollectionState.init(user.uid)` block (the dynamic import around lines 146-155), add the same for tunnels:

```ts
void import("$lib/features/tunnel-collection/state/tunnel-collection-state.svelte").then(
  ({ tunnelCollectionState }) => tunnelCollectionState.init(user.uid),
);
```

Match the exact style of the mandala call (same guards, same `await`/`void`).

- [ ] **Step 2: Boot wiring — teardown on sign-out**

In `auth-state.svelte.ts`, beside the existing `mandalaCollectionState.teardown()` (lines ~655-659), add the tunnel teardown following the same import style.

- [ ] **Step 3: Register the Playground tab**

In `tab-definitions.ts` `PLAYGROUND_TABS`, add an entry after the mandala tab:

```ts
{ id: "tunnels", label: "Tunnels", icon: "fa-fan" },
```

Match the exact object shape of the existing mandala tab entry (read it first).

In `PlaygroundModule.svelte` `tabComponents`, add:

```ts
tunnels: () => import("$lib/features/tunnel-collection/TunnelCollectionModule.svelte"),
```

Gate it the same way the mandala tab is gated (if there's a feature flag around the mandala tab, apply the same condition).

- [ ] **Step 4: Write `TunnelCollectionModule.svelte`** (mirror `MandalaModule.svelte`)

Read `src/lib/features/mandala/MandalaModule.svelte` and mirror its structure. Concrete requirements:

```svelte
<script lang="ts">
  import { tunnelCollectionState } from "./state/tunnel-collection-state.svelte";
  import type { CollectedTunnel } from "./domain/tunnel-collection-types";

  let phase = $state<"gallery" | "detail">("gallery");
  let selected = $state<CollectedTunnel | null>(null);
  let confirmingDelete = $state<string | null>(null);

  const items = $derived(tunnelCollectionState.collection);

  function open(t: CollectedTunnel) { selected = t; phase = "detail"; }
  function back() { phase = "gallery"; selected = null; }
  async function del(id: string) {
    if (confirmingDelete !== id) { confirmingDelete = id; return; }
    await tunnelCollectionState.remove(id);
    confirmingDelete = null;
    back();
  }
</script>
```

- **Gallery phase:** a responsive grid of `.gallery-card` buttons, one per `items`
  entry, each rendering `<img src={item.poster} alt={item.name} />` (fixed
  `aspect-ratio: 1` box so first paint doesn't relayout — `no-layout-shift`) + the
  name label. Empty state: "Right-click a tunnel in the viewer to save one." Card
  click → `open(item)`.
- **Detail phase:** a live animated preview + actions. For the preview, mount the
  saved tunnel using the sandboxed apply from the spec (§2.2): capture the current
  globals, `applyTunnelSnapshot(deps, selected.snapshot)`, render a single
  `<TunnelArtView>` seeded from a local `TunnelViewController` (`applyConfig(selected.snapshot.tunnel.config)`)
  + a local effects context (`createEffectsConfigState(selected.snapshot.effects, { persist: false })`,
  then `setEffectsConfigContext(...)`), passing `sequence={{ steps: selected.steps }}`,
  `bpm={selected.snapshot.playback.bpm}`, `bluePropType`/`redPropType` from the
  snapshot; on `onDestroy`, re-apply the captured globals. Actions row:
  **Open in Viewer** (`openTunnelSnapshot(selected.steps, selected.snapshot)`),
  **Export** (`openTunnelSnapshot(selected.steps, selected.snapshot, true)`),
  **Delete** (two-tap via `del`). Use real `<button>`s styled like the design
  system (44px targets, no bare text links, no checkboxes).

Reuse styling tokens per the `styling` skill (`--theme-card-bg`, `--theme-stroke`,
`--theme-panel-bg`, `--font-size-*`). Do not hand-roll a new card primitive if
`MandalaModule` uses a shared one — reuse it.

Note the `persist: false` on the preview's effects state (from the effects-config
factory) so the live detail preview never clobbers the user's global effects config.

- [ ] **Step 5: Full check**

Run: `npm run check`
Expected: `svelte-check found 0 errors and 0 warnings`. Fix any errors (common: a `ContextMenuEntry` field name mismatch from Task 9, or a missing dep handle in `buildDeps`) and re-run until clean.

- [ ] **Step 6: Run the full tunnel + collection test set**

Run: `npx vitest run src/lib/shared/sequence-viewer/tunnel src/lib/features/tunnel-collection`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(tunnel-collection): Playground Tunnels tab + module + boot wiring" -- src/lib/features/tunnel-collection/TunnelCollectionModule.svelte src/lib/shared/navigation/config/tab-definitions.ts src/lib/features/playground/PlaygroundModule.svelte src/lib/shared/auth/services/auth-boot-orchestrator.ts src/lib/shared/auth/state/auth-state.svelte.ts
```

---

## Task 13: Manual verification (Austen)

Not automatable (in-app viewer + Firestore + WebGL). After Task 12 is green,
verify by hand:

- [ ] Open a sequence → Art → Tunnel. Build a look (fold/mirror + an effect +
  speed overrides + effort + prop). Click **Save tunnel** → toast fires.
- [ ] Right-click the tunnel canvas → **Save tunnel** appears in the menu → saves.
- [ ] Playground → **Tunnels** tab shows a poster card. Click it → the detail
  view plays the exact tunnel (same effect/speed/effort/prop/paths).
- [ ] **Open in Viewer** reproduces it live; **Export** lands in the viewer and
  produces the video. **Delete** (two-tap) removes it.
- [ ] Reload / sign in on another device → the saved tunnel is still there
  (Firestore round-trip). Browsing the collection did NOT change the live viewer's
  global effort/paths (sandbox restored).

---

## Self-Review (completed against the spec)

**Spec coverage:** §1 data model → Tasks 1, 5. §2 capture/apply/poster → Tasks 2,
3, 4. §2.2 sandboxed preview → Task 12 detail phase. §3 persistence 4-file clone →
Tasks 5-8. §3 boot wiring → Task 12. §4 save triggers (button + right-click) →
Tasks 9, 10. §5 collection page + Open-in-Viewer/Export → Tasks 11, 12. §7 tests →
Tasks 1-8; manual → Task 13. All covered.

**Placeholder scan:** the Svelte-wiring tasks (9-12) contain "find/match the
existing X" instructions rather than full literal diffs, because the exact host
component names, `ContextMenuEntry` field names, and `ArtPane`/orchestrator prop
threading must be read at implementation time — each such instruction names the
exact file + symbol to read and the exact code to add. No `TBD`/`later`.

**Type consistency:** `SnapshotDeps`, `TunnelSnapshot`, `captureTunnelSnapshot`,
`applyTunnelSnapshot`, `captureTunnelPoster`, `CollectedTunnel`,
`tunnelCollectionState`, `openTunnelSnapshot` are used with identical signatures
across tasks. `controller.gridVisible/spectrum/section` assignable (verified public
`$state`). `effects.config`/`.replace`, `visibility` get/set pairs,
`animationSettings.updateSettings({trail})`, `playback.handleBpmChange/handlePlaybackModeChange`
all verified against source.
