# Mobile 3D Scene Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile 3D viewer usable on an iPhone SE by consolidating all scene controls behind two thumb-corner bottom-sheet menus (Performer / Everything-else), adding a playback-bar toggle, and adding a hybrid fullscreen/immersive button.

**Architecture:** The mobile 3D experience is the dedicated overlay `Viewer3DFullscreen.svelte` (fixed `inset:0`, z-100), mounted by `src/routes/sequence/[id]/+page.svelte:600-617` only when `isMobile && renderMode==='3d'`. Desktop uses `RightRail` + `PerformerHub` inside `ViewerSplitPane` and is **not touched**. We add a new `BottomSheet` primitive plus a `MobileSceneControls` overlay that reuses the existing performer bodies (`PerformerSpine`, `PerformerHubDetail`) and rail popover bodies (`FormationPopover`, `CameraPopover`, `ExportPopover`, `SceneSelectorPopover`, `DevToolsPopover`) inside sheets. We extend `fullscreen-controller.svelte.ts` with feature-detected native Fullscreen API + an immersive (bars-hidden) flag. A throwaway test route mounts the real overlay with a catalog-seeded sequence for on-device judgment.

**Tech Stack:** Svelte 5 (runes), `bits-ui@^2.14.4`, Threlte, FontAwesome, existing `viewer-3d-context` / `effects-config-context`.

> **Spec correction (read first):** The design doc
> `docs/superpowers/specs/2026-06-22-mobile-3d-scene-controls-design.md` assumed
> the mobile controls mount where `RightRail`/`PerformerHub` mount
> (`ViewerSplitPane.svelte:509-520`). Verified during planning: on mobile the
> route forces the split pane to 2D (`+page.svelte:622
> renderMode={isMobile ? '2d' : ctx.renderMode}`) and mounts a separate
> `Viewer3DFullscreen.svelte` for 3D. **That overlay is the real host.** All
> design intent (two sheets, playback toggle, hybrid fullscreen) is unchanged;
> only the host component differs. `Viewer3DFullscreen` currently shows almost
> nothing (word + close, 3 playback buttons, disabled "coming soon" effect
> pills) — we replace that bottom row with the consolidated controls.

---

## File Structure

**Create:**
- `src/lib/shared/3d/components/controls/BottomSheet.svelte` — generic mobile bottom-sheet primitive (fixed panel, fly transition, Escape + outside-click close, optional backdrop). Reusable app-wide.
- `src/lib/shared/3d/components/controls/BottomSheet.test.ts` — unit test for the outside-click/escape close contract via the exported controller, plus a smoke render.
- `src/lib/shared/3d/components/MobileSceneControls.svelte` — the two FABs + their sheets + playback toggle, mounted inside `Viewer3DFullscreen`'s bottom bar.
- `src/lib/shared/3d/components/MobileScenePerformerSheet.svelte` — performer sheet body (wraps `PerformerSpine` + `PerformerHubDetail`).
- `src/lib/shared/3d/components/MobileSceneEverythingSheet.svelte` — scene/formation/camera/export/dev sheet body (wraps the rail popover bodies as sections).
- `src/lib/shared/sequence-viewer/state/fullscreen-capabilities.ts` — pure feature-detection helpers (`supportsNativeFullscreen`, `requestNativeFullscreen`, `exitNativeFullscreen`).
- `src/lib/shared/sequence-viewer/state/fullscreen-capabilities.test.ts` — unit tests for the detection branches.
- `src/routes/test/mobile-3d-controls/+page.svelte` — throwaway on-device validation harness.

**Modify:**
- `src/lib/shared/sequence-viewer/state/fullscreen-controller.svelte.ts` — add `immersive` flag + `toggleImmersive`, and route enter/exit through the native API when available.
- `src/lib/shared/3d/components/Viewer3DFullscreen.svelte` — replace the static bottom row (playback buttons + `Viewer3DEffectPills`) with `MobileSceneControls`; add the immersive/fullscreen button to the top bar; make the top/bottom bars hideable.

---

## Task 1: Fullscreen capability helpers (pure, TDD)

**Files:**
- Create: `src/lib/shared/sequence-viewer/state/fullscreen-capabilities.ts`
- Test: `src/lib/shared/sequence-viewer/state/fullscreen-capabilities.test.ts`

Rationale: iPhone Safari has no Fullscreen API on non-video elements (verified
2026-06-22 — Apple Dev Forums 133248, caniuse). This module isolates the
feature-detect + webkit-prefix fallbacks so the controller stays simple and the
branching is unit-tested.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/sequence-viewer/state/fullscreen-capabilities.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  supportsNativeFullscreen,
  requestNativeFullscreen,
  exitNativeFullscreen,
} from "./fullscreen-capabilities";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("supportsNativeFullscreen", () => {
  it("is false when the element exposes no fullscreen method (iPhone Safari)", () => {
    const el = {} as HTMLElement;
    expect(supportsNativeFullscreen(el)).toBe(false);
  });

  it("is true when requestFullscreen exists", () => {
    const el = { requestFullscreen: () => Promise.resolve() } as unknown as HTMLElement;
    expect(supportsNativeFullscreen(el)).toBe(true);
  });

  it("is true when the webkit-prefixed method exists", () => {
    const el = { webkitRequestFullscreen: () => undefined } as unknown as HTMLElement;
    expect(supportsNativeFullscreen(el)).toBe(true);
  });
});

describe("requestNativeFullscreen", () => {
  it("calls requestFullscreen and resolves true", async () => {
    const fn = vi.fn(() => Promise.resolve());
    const el = { requestFullscreen: fn } as unknown as HTMLElement;
    await expect(requestNativeFullscreen(el)).resolves.toBe(true);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("returns false when unsupported (no throw)", async () => {
    const el = {} as HTMLElement;
    await expect(requestNativeFullscreen(el)).resolves.toBe(false);
  });

  it("returns false when the request rejects (user gesture / permission)", async () => {
    const el = { requestFullscreen: () => Promise.reject(new Error("denied")) } as unknown as HTMLElement;
    await expect(requestNativeFullscreen(el)).resolves.toBe(false);
  });
});

describe("exitNativeFullscreen", () => {
  it("no-ops without throwing when nothing is fullscreen", async () => {
    vi.stubGlobal("document", {});
    await expect(exitNativeFullscreen()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/sequence-viewer/state/fullscreen-capabilities.test.ts`
Expected: FAIL — "Cannot find module './fullscreen-capabilities'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/shared/sequence-viewer/state/fullscreen-capabilities.ts

/**
 * Fullscreen capability helpers.
 *
 * iPhone Safari does not implement the Fullscreen API on non-video elements
 * (verified 2026-06-22). These helpers feature-detect + handle the webkit
 * prefix so callers can fall back to a CSS-immersive path when native
 * fullscreen is unavailable. All functions are safe to call on any element.
 */

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};
type FsDocument = Document & {
  webkitExitFullscreen?: () => void;
  webkitFullscreenElement?: Element | null;
};

export function supportsNativeFullscreen(el: HTMLElement | null): boolean {
  if (!el) return false;
  const e = el as FsElement;
  return typeof e.requestFullscreen === "function" ||
    typeof e.webkitRequestFullscreen === "function";
}

export async function requestNativeFullscreen(el: HTMLElement | null): Promise<boolean> {
  if (!el) return false;
  const e = el as FsElement;
  try {
    if (typeof e.requestFullscreen === "function") {
      await e.requestFullscreen();
      return true;
    }
    if (typeof e.webkitRequestFullscreen === "function") {
      e.webkitRequestFullscreen();
      return true;
    }
    return false;
  } catch {
    // User gesture / permission rejection — caller falls back to CSS-immersive.
    return false;
  }
}

export async function exitNativeFullscreen(): Promise<void> {
  if (typeof document === "undefined") return;
  const d = document as FsDocument;
  try {
    if (d.fullscreenElement && typeof d.exitFullscreen === "function") {
      await d.exitFullscreen();
    } else if (d.webkitFullscreenElement && typeof d.webkitExitFullscreen === "function") {
      d.webkitExitFullscreen();
    }
  } catch {
    // Already exited or not permitted — nothing to do.
  }
}

export function isNativeFullscreenActive(): boolean {
  if (typeof document === "undefined") return false;
  const d = document as FsDocument;
  return Boolean(d.fullscreenElement ?? d.webkitFullscreenElement);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/sequence-viewer/state/fullscreen-capabilities.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/state/fullscreen-capabilities.ts src/lib/shared/sequence-viewer/state/fullscreen-capabilities.test.ts
git commit -m "feat(viewer): fullscreen capability helpers with iPhone-safe detection" -- src/lib/shared/sequence-viewer/state/fullscreen-capabilities.ts src/lib/shared/sequence-viewer/state/fullscreen-capabilities.test.ts
```

---

## Task 2: Extend the fullscreen controller (immersive flag + native routing)

**Files:**
- Modify: `src/lib/shared/sequence-viewer/state/fullscreen-controller.svelte.ts`

The controller currently owns only the CSS-overlay `isFullscreen` +
auto-hiding `fullscreenControlsVisible`. Add an `immersive` flag (bars hidden
for max scene real estate) and route enter/exit through the native API when the
host element supports it, falling back to the CSS path on iPhone.

- [ ] **Step 1: Replace the controller body**

Replace the entire contents of `src/lib/shared/sequence-viewer/state/fullscreen-controller.svelte.ts` with:

```ts
import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
import {
  supportsNativeFullscreen,
  requestNativeFullscreen,
  exitNativeFullscreen,
} from "./fullscreen-capabilities";

export interface FullscreenControllerDeps {
  getHapticService: () => HapticFeedback | null;
  announce: (message: string, priority?: "polite" | "assertive") => void;
}

export function createFullscreenController(deps: FullscreenControllerDeps) {
  let isFullscreen = $state(false);
  // immersive = the overlay's own top/bottom bars are hidden for max canvas.
  // Independent of isFullscreen so a non-fullscreen mobile overlay can also
  // toggle its chrome.
  let immersive = $state(false);
  let fullscreenControlsVisible = $state(false);
  let controlsHideTimeout: ReturnType<typeof setTimeout> | null = null;

  function clearControlsTimeout() {
    if (controlsHideTimeout) {
      clearTimeout(controlsHideTimeout);
      controlsHideTimeout = null;
    }
  }

  function scheduleControlsHide() {
    clearControlsTimeout();
    controlsHideTimeout = setTimeout(() => {
      fullscreenControlsVisible = false;
    }, 3000);
  }

  function showFullscreenControls() {
    fullscreenControlsVisible = true;
    scheduleControlsHide();
  }

  function enterFullscreen() {
    deps.getHapticService()?.trigger("selection");
    isFullscreen = true;
    showFullscreenControls();
    deps.announce("Fullscreen mode. Tap to show controls, press Escape to exit.", "assertive");
  }

  function exitFullscreen() {
    deps.getHapticService()?.trigger("selection");
    isFullscreen = false;
    fullscreenControlsVisible = false;
    clearControlsTimeout();
    deps.announce("Exited fullscreen");
  }

  function handleFullscreenTap() {
    if (isFullscreen && !fullscreenControlsVisible) {
      showFullscreenControls();
    }
  }

  /**
   * Immersive toggle for the mobile 3D overlay. Hides the overlay's own
   * top/bottom bars. When the host element supports the native Fullscreen API
   * (iPad / desktop / Android) it also enters true OS fullscreen; on iPhone
   * Safari (no API) it falls back to the bars-hidden CSS path only.
   */
  async function enterImmersive(host: HTMLElement | null) {
    deps.getHapticService()?.trigger("selection");
    immersive = true;
    if (supportsNativeFullscreen(host)) {
      const ok = await requestNativeFullscreen(host);
      if (!ok) {
        deps.announce("Immersive mode. Tap to show controls.", "assertive");
      }
    } else {
      deps.announce("Immersive mode. Tap to show controls.", "assertive");
    }
  }

  async function exitImmersive() {
    deps.getHapticService()?.trigger("selection");
    immersive = false;
    await exitNativeFullscreen();
    deps.announce("Exited immersive mode");
  }

  function toggleImmersive(host: HTMLElement | null) {
    return immersive ? exitImmersive() : enterImmersive(host);
  }

  /** Re-show the bars after immersive auto-hide on tap. */
  function revealImmersiveBars() {
    immersive = false;
  }

  return {
    get isFullscreen() { return isFullscreen; },
    set isFullscreen(v: boolean) { isFullscreen = v; },
    get immersive() { return immersive; },
    get fullscreenControlsVisible() { return fullscreenControlsVisible; },
    enterFullscreen,
    exitFullscreen,
    handleFullscreenTap,
    enterImmersive,
    exitImmersive,
    toggleImmersive,
    revealImmersiveBars,
    clearControlsTimeout,
  };
}
```

- [ ] **Step 2: Verify no type breakage at the existing call sites**

The orchestrator (`SequenceViewerOrchestrator.svelte:299-304, 1170`) consumes
`enterFullscreen`/`exitFullscreen`/`isFullscreen`/`fullscreenControlsVisible` —
all preserved. New members are additive.

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i fullscreen-controller`
Expected: no output (no errors referencing the file).

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/sequence-viewer/state/fullscreen-controller.svelte.ts
git commit -m "feat(viewer): immersive toggle + native fullscreen routing in controller" -- src/lib/shared/sequence-viewer/state/fullscreen-controller.svelte.ts
```

---

## Task 3: BottomSheet primitive

**Files:**
- Create: `src/lib/shared/3d/components/controls/BottomSheet.svelte`
- Test: `src/lib/shared/3d/components/controls/BottomSheet.test.ts`

**Never-hand-roll justification:** Grepped `BottomSheet`, `Sheet`, `Drawer`,
`bottom-sheet` across `src/lib/shared` and the viewer dirs — no bottom-sheet
primitive exists (`SequenceViewerDrawerHost` is a layout host, not reusable).
`bits-ui@2.14.4` ships `Popover` (anchored — fights a full-width bottom anchor)
and `Dialog` (modal scrim — hides the live 3D scene we want visible behind the
sheet while the user previews prop/effort/plane changes). Neither fits a
**non-modal, scene-preserving** bottom sheet, so this is a justified new
primitive (option 4). It uses Svelte's built-in `fly` transition; close-on-
Escape and outside-click are tiny contracts unit-tested below.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/3d/components/controls/BottomSheet.test.ts
import { describe, it, expect, vi } from "vitest";
import { createSheetDismiss } from "./BottomSheet.svelte";

describe("createSheetDismiss", () => {
  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    const d = createSheetDismiss(onClose);
    d.onKeydown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    const d = createSheetDismiss(onClose);
    d.onKeydown(new KeyboardEvent("keydown", { key: "a" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when a pointerdown lands outside the panel", () => {
    const onClose = vi.fn();
    const panel = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(panel, outside);
    const d = createSheetDismiss(onClose, () => panel);
    d.onBackdropPointerDown({ target: outside } as unknown as PointerEvent);
    expect(onClose).toHaveBeenCalledOnce();
    panel.remove();
    outside.remove();
  });

  it("does NOT close when pointerdown is inside the panel", () => {
    const onClose = vi.fn();
    const panel = document.createElement("div");
    const child = document.createElement("button");
    panel.append(child);
    document.body.append(panel);
    const d = createSheetDismiss(onClose, () => panel);
    d.onBackdropPointerDown({ target: child } as unknown as PointerEvent);
    expect(onClose).not.toHaveBeenCalled();
    panel.remove();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/3d/components/controls/BottomSheet.test.ts`
Expected: FAIL — `createSheetDismiss` is not exported.

- [ ] **Step 3: Implement BottomSheet.svelte**

```svelte
<!-- src/lib/shared/3d/components/controls/BottomSheet.svelte -->
<script module lang="ts">
  /**
   * Dismiss contract for the bottom sheet, extracted so it's unit-testable
   * without mounting Svelte. Escape closes; a pointerdown outside the panel
   * closes; pointerdown inside is ignored.
   */
  export function createSheetDismiss(
    onClose: () => void,
    getPanel: () => HTMLElement | null = () => null,
  ) {
    return {
      onKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") onClose();
      },
      onBackdropPointerDown(e: PointerEvent) {
        const panel = getPanel();
        if (panel && e.target instanceof Node && panel.contains(e.target)) return;
        onClose();
      },
    };
  }
</script>

<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { Snippet } from "svelte";

  interface Props {
    open: boolean;
    title: string;
    accentColor?: string;
    /** When true a dim backdrop is shown. Default false so the live 3D scene
     *  stays visible/interactive behind the sheet for prop/effort previews. */
    backdrop?: boolean;
    onClose: () => void;
    children: Snippet;
  }

  let { open = $bindable(), title, accentColor = "#4a9eff", backdrop = false, onClose, children }: Props = $props();

  let panelEl = $state<HTMLElement | null>(null);
  const dismiss = createSheetDismiss(onClose, () => panelEl);
</script>

<svelte:window onkeydown={(e) => { if (open) dismiss.onKeydown(e); }} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="sheet-layer"
    class:has-backdrop={backdrop}
    onpointerdown={dismiss.onBackdropPointerDown}
    transition:fade={{ duration: 120 }}
  >
    <div
      bind:this={panelEl}
      class="sheet-panel"
      style:--sheet-accent={accentColor}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      transition:fly={{ y: 320, duration: 260, easing: cubicOut }}
    >
      <div class="grab-handle" aria-hidden="true"></div>
      <header class="sheet-header">
        <span class="sheet-title">{title}</span>
        <button class="sheet-close" aria-label="Close {title}" onclick={onClose}>
          <i class="fas fa-chevron-down"></i>
        </button>
      </header>
      <div class="sheet-body">
        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet-layer {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    pointer-events: none; /* only the panel is interactive when no backdrop */
  }
  .sheet-layer.has-backdrop {
    background: rgba(0, 0, 0, 0.45);
    pointer-events: auto;
  }
  .sheet-panel {
    pointer-events: auto;
    width: 100%;
    max-height: 70vh;
    overflow-y: auto;
    background: #0c0e16;
    border-top: 1px solid color-mix(in srgb, var(--sheet-accent) 30%, rgba(255, 255, 255, 0.12));
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -12px 48px rgba(0, 0, 0, 0.7);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .grab-handle {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.25);
    margin: 8px auto 4px;
  }
  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .sheet-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
  }
  .sheet-close {
    width: 44px;
    height: 44px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sheet-close:active { background: rgba(255, 255, 255, 0.08); }
  .sheet-body { padding: 12px 14px 18px; }

  @media (prefers-reduced-motion: reduce) {
    .sheet-panel { transition: none; }
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/3d/components/controls/BottomSheet.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/3d/components/controls/BottomSheet.svelte src/lib/shared/3d/components/controls/BottomSheet.test.ts
git commit -m "feat(viewer): non-modal mobile BottomSheet primitive" -- src/lib/shared/3d/components/controls/BottomSheet.svelte src/lib/shared/3d/components/controls/BottomSheet.test.ts
```

---

## Task 4: Performer sheet body

**Files:**
- Create: `src/lib/shared/3d/components/MobileScenePerformerSheet.svelte`

Reuses the exact desktop performer controls (`PerformerSpine` for selection,
`PerformerHubDetail` for the 6 tabs). Both read `viewer-3d-context`, already in
scope inside `Viewer3DFullscreen`. The desktop `PerformerHubDetail` is a fixed
440px panel; inside the sheet we let it size to the sheet width.

- [ ] **Step 1: Implement the component**

```svelte
<!-- src/lib/shared/3d/components/MobileScenePerformerSheet.svelte -->
<script lang="ts">
  /**
   * Performer controls for the mobile bottom sheet. Wraps the same
   * PerformerSpine (selection chips) + PerformerHubDetail (Avatar/Seq/Prop/
   * Planes/Effort/FX tabs) the desktop PerformerHub uses, re-flowed to the
   * sheet width.
   */
  import PerformerSpine from "./controls/PerformerSpine.svelte";
  import PerformerHubDetail from "./controls/PerformerHubDetail.svelte";
</script>

<div class="mobile-performer-sheet">
  <div class="spine-row">
    <PerformerSpine hasInteracted={true} />
  </div>
  <div class="detail-wrap">
    <PerformerHubDetail />
  </div>
</div>

<style>
  .mobile-performer-sheet {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  /* Selection chips run horizontally in the sheet, not the vertical spine. */
  .spine-row :global(.performer-spine) {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }
  .spine-row :global(.separator) {
    width: 1px;
    height: 32px;
  }
  /* Let the 440px desktop detail shrink to the sheet. */
  .detail-wrap :global(.hub-detail) {
    width: 100%;
  }
</style>
```

- [ ] **Step 2: Type-check the new component**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i MobileScenePerformerSheet`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/3d/components/MobileScenePerformerSheet.svelte
git commit -m "feat(viewer): mobile performer sheet body (reuses spine + detail)" -- src/lib/shared/3d/components/MobileScenePerformerSheet.svelte
```

---

## Task 5: Everything-else sheet body

**Files:**
- Create: `src/lib/shared/3d/components/MobileSceneEverythingSheet.svelte`

Reuses the exact rail popover bodies (`FormationPopover`, `CameraPopover`,
`ExportPopover`, `SceneSelectorPopover`, `DevToolsPopover`) — the same ones
`RightRail.svelte:37-61` renders — stacked as labelled sections. Dev section is
admin-gated identically to the rail.

- [ ] **Step 1: Implement the component**

```svelte
<!-- src/lib/shared/3d/components/MobileSceneEverythingSheet.svelte -->
<script lang="ts">
  /**
   * "Everything else" controls for the mobile bottom sheet: the same bodies
   * the desktop RightRail exposes as popovers (Formation, Camera, Export,
   * Scene, + Dev for admins), stacked as sections.
   */
  import FormationPopover from "./controls/FormationPopover.svelte";
  import CameraPopover from "./CameraPopover.svelte";
  import ExportPopover from "$lib/shared/sequence-viewer/components/ExportPopover.svelte";
  import SceneSelectorPopover from "./SceneSelectorPopover.svelte";
  import DevToolsPopover from "./controls/DevToolsPopover.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";

  const SECTIONS = [
    { id: "scene", label: "Scene", icon: "fa-mountain-sun" },
    { id: "formation", label: "Formation", icon: "fa-users" },
    { id: "camera", label: "Camera", icon: "fa-video" },
    { id: "export", label: "Export", icon: "fa-arrow-up-from-bracket" },
  ];
  let active = $state("scene");
</script>

<div class="everything-sheet">
  <div class="section-tabs" role="tablist" aria-label="Scene controls">
    {#each SECTIONS as s}
      <button
        class="section-tab"
        class:active={active === s.id}
        role="tab"
        aria-selected={active === s.id}
        onclick={() => (active = s.id)}
      >
        <i class="fas {s.icon}" aria-hidden="true"></i>
        <span>{s.label}</span>
      </button>
    {/each}
    {#if authState.isAdmin}
      <button
        class="section-tab"
        class:active={active === "dev"}
        role="tab"
        aria-selected={active === "dev"}
        onclick={() => (active = "dev")}
      >
        <i class="fas fa-terminal" aria-hidden="true"></i>
        <span>Dev</span>
      </button>
    {/if}
  </div>

  <div class="section-body">
    {#if active === "scene"}<SceneSelectorPopover />{/if}
    {#if active === "formation"}<FormationPopover />{/if}
    {#if active === "camera"}<CameraPopover />{/if}
    {#if active === "export"}<ExportPopover />{/if}
    {#if active === "dev" && authState.isAdmin}<DevToolsPopover />{/if}
  </div>
</div>

<style>
  .everything-sheet { display: flex; flex-direction: column; gap: 12px; }
  .section-tabs {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 4px;
    padding: 3px;
    background: rgba(0, 0, 0, 0.28);
    border-radius: 10px;
  }
  .section-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-height: 44px;
    padding: 6px 0;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: rgba(255, 255, 255, 0.68);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .section-tab.active {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .section-tab i { font-size: 14px; }
</style>
```

> **Verify imports before running:** the rail bodies' real paths come from
> `RightRail.svelte:5-10` and `PerformerHubDetail.svelte`. Confirm each import
> path resolves (Step 2 catches a wrong path as a svelte-check error). If
> `ExportPopover` lives under `sequence-viewer/components/` per `RightRail`'s
> `import ExportPopover from "./ExportPopover.svelte"` (RightRail is itself in
> `sequence-viewer/components/`), the path above is correct; adjust if check
> reports otherwise.

- [ ] **Step 2: Type-check**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i MobileSceneEverythingSheet`
Expected: no output. If an import path errors, fix it to the path svelte-check names, then re-run.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/3d/components/MobileSceneEverythingSheet.svelte
git commit -m "feat(viewer): mobile everything-else sheet body (reuses rail popovers)" -- src/lib/shared/3d/components/MobileSceneEverythingSheet.svelte
```

---

## Task 6: MobileSceneControls — FABs + sheets + playback toggle

**Files:**
- Create: `src/lib/shared/3d/components/MobileSceneControls.svelte`

The bottom-bar content for `Viewer3DFullscreen`: two corner FABs opening the two
sheets, the 3 playback buttons centered (moved out of `Viewer3DFullscreen`), and
a chevron that hides/shows the playback row. Single-sheet invariant: opening one
closes the other.

- [ ] **Step 1: Implement the component**

```svelte
<!-- src/lib/shared/3d/components/MobileSceneControls.svelte -->
<script lang="ts">
  import BottomSheet from "./controls/BottomSheet.svelte";
  import MobileScenePerformerSheet from "./MobileScenePerformerSheet.svelte";
  import MobileSceneEverythingSheet from "./MobileSceneEverythingSheet.svelte";

  interface Props {
    isPlaying: boolean;
    onPlaybackToggle: () => void;
    onStepForward: () => void;
    onStepBackward: () => void;
  }
  let { isPlaying, onPlaybackToggle, onStepForward, onStepBackward }: Props = $props();

  type Sheet = "performer" | "everything" | null;
  let openSheet = $state<Sheet>(null);
  let playbackVisible = $state(true);

  function toggle(sheet: Exclude<Sheet, null>) {
    openSheet = openSheet === sheet ? null : sheet;
  }
</script>

<!-- Sheets render above everything in the bar -->
<BottomSheet
  open={openSheet === "performer"}
  title="Performer"
  onClose={() => (openSheet = null)}
>
  <MobileScenePerformerSheet />
</BottomSheet>

<BottomSheet
  open={openSheet === "everything"}
  title="Scene & Controls"
  onClose={() => (openSheet = null)}
>
  <MobileSceneEverythingSheet />
</BottomSheet>

<!-- Playback row (toggleable) -->
{#if playbackVisible}
  <div class="playback-row">
    <button class="ctl" onclick={onStepBackward} aria-label="Previous beat">
      <i class="fas fa-backward-step"></i>
    </button>
    <button class="ctl play" onclick={onPlaybackToggle} aria-label={isPlaying ? "Pause" : "Play"}>
      <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}"></i>
    </button>
    <button class="ctl" onclick={onStepForward} aria-label="Next beat">
      <i class="fas fa-forward-step"></i>
    </button>
  </div>
{/if}

<!-- FAB row: performer (left), playback toggle (center), everything (right) -->
<div class="fab-row">
  <button
    class="fab"
    class:active={openSheet === "performer"}
    aria-label="Performer controls"
    aria-pressed={openSheet === "performer"}
    onclick={() => toggle("performer")}
  >
    <i class="fas fa-user"></i>
  </button>

  <button
    class="fab toggle"
    aria-label={playbackVisible ? "Hide playback bar" : "Show playback bar"}
    aria-pressed={!playbackVisible}
    onclick={() => (playbackVisible = !playbackVisible)}
  >
    <i class="fas {playbackVisible ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
  </button>

  <button
    class="fab"
    class:active={openSheet === "everything"}
    aria-label="Scene and controls"
    aria-pressed={openSheet === "everything"}
    onclick={() => toggle("everything")}
  >
    <i class="fas fa-sliders"></i>
  </button>
</div>

<style>
  .playback-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .fab-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }
  .ctl, .fab {
    min-width: 44px;
    min-height: 44px;
    border-radius: 50%;
    background: rgba(20, 22, 32, 0.78);
    backdrop-filter: blur(20px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .ctl.play { min-width: 52px; min-height: 52px; font-size: 18px; background: rgba(255, 255, 255, 0.15); }
  .fab.toggle { min-width: 38px; min-height: 38px; font-size: 13px; opacity: 0.8; }
  .fab.active {
    background: color-mix(in srgb, var(--theme-accent, #4a9eff) 22%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #4a9eff) 55%, transparent);
    color: color-mix(in srgb, var(--theme-accent, #4a9eff) 70%, #fff);
  }
  .ctl:active, .fab:active { background: rgba(255, 255, 255, 0.22); }
</style>
```

- [ ] **Step 2: Type-check**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i MobileSceneControls`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/3d/components/MobileSceneControls.svelte
git commit -m "feat(viewer): MobileSceneControls — two FABs, sheets, playback toggle" -- src/lib/shared/3d/components/MobileSceneControls.svelte
```

---

## Task 7: Wire controls + immersive button into Viewer3DFullscreen

**Files:**
- Modify: `src/lib/shared/3d/components/Viewer3DFullscreen.svelte`

Replace the static playback row + disabled `Viewer3DEffectPills` with
`MobileSceneControls`. Add an immersive/fullscreen button to the top bar that
calls a new `onToggleImmersive(hostEl)` prop, and make the top/bottom bars hide
when `immersive` is true (tap-to-reveal). The host element ref is the overlay
root, passed to the native fullscreen request.

- [ ] **Step 1: Add props + host ref + immersive state to the script**

In `Viewer3DFullscreen.svelte`, replace the `interface Props { ... }` block
(lines 36-49) and the destructure (lines 51-64) with:

```ts
  import MobileSceneControls from "./MobileSceneControls.svelte";

  interface Props {
    sequenceData: SequenceData | null;
    currentStep: number;
    isPlaying: boolean;
    bpm: number;
    word: string | null;
    bluePropType?: string | null;
    redPropType?: string | null;
    onClose: () => void;
    onPlaybackToggle: () => void;
    onBpmChange: (bpm: number) => void;
    onStepForward: () => void;
    onStepBackward: () => void;
    /** Immersive toggle. Receives the overlay root for native fullscreen. */
    immersive?: boolean;
    onToggleImmersive?: (host: HTMLElement | null) => void;
  }

  let {
    sequenceData,
    currentStep,
    isPlaying,
    bpm,
    word,
    bluePropType = null,
    redPropType = null,
    onClose,
    onPlaybackToggle,
    onBpmChange,
    onStepForward,
    onStepBackward,
    immersive = false,
    onToggleImmersive,
  }: Props = $props();

  let hostEl = $state<HTMLElement | null>(null);
```

Remove the now-unused `import Viewer3DEffectPills from "./Viewer3DEffectPills.svelte";` (line 18).

- [ ] **Step 2: Replace the markup body**

Replace the entire `<div class="viewer-3d-fullscreen"> ... </div>` block
(lines 67-118) with:

```svelte
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="viewer-3d-fullscreen"
  class:immersive
  bind:this={hostEl}
  onclick={immersive ? () => onToggleImmersive?.(hostEl) : undefined}
>
  <!-- Top bar: word label + immersive + close -->
  <div class="top-bar" class:hidden={immersive}>
    {#if word}
      <span class="word-label"><TKAWordGlyph {word} height={14} darkMode /></span>
    {/if}
    <div class="top-actions">
      <button
        class="icon-button"
        onclick={(e) => { e.stopPropagation(); onToggleImmersive?.(hostEl); }}
        aria-label={immersive ? "Exit immersive" : "Immersive fullscreen"}
        aria-pressed={immersive}
      >
        <i class="fas {immersive ? 'fa-compress' : 'fa-expand'}"></i>
      </button>
      <button class="icon-button" onclick={onClose} aria-label="Exit 3D view">
        <i class="fas fa-xmark"></i>
      </button>
    </div>
  </div>

  <!-- 3D canvas fills remaining space -->
  <div class="canvas-area">
    <Viewer3DCanvas
      {sequenceData}
      {currentStep}
      {isPlaying}
      {bpm}
      {onBpmChange}
      {bluePropType}
      {redPropType}
      hideOverlays={true}
    />
  </div>

  <!-- Bottom bar: consolidated controls -->
  <div class="bottom-bar" class:hidden={immersive}>
    <MobileSceneControls
      {isPlaying}
      {onPlaybackToggle}
      {onStepForward}
      {onStepBackward}
    />
  </div>
</div>
```

Note `hideOverlays={true}` is now passed to `Viewer3DCanvas` so its built-in
`UnifiedTimeline` (the desktop transport) does not double up with the mobile
playback row — the mobile bottom bar owns transport here.

- [ ] **Step 3: Add the immersive/hidden styles**

Append to the `<style>` block:

```css
  .top-actions { display: flex; gap: 8px; align-items: center; margin-left: auto; }
  .icon-button {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.85);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; padding: 0; font-size: 15px;
  }
  .icon-button:active { background: rgba(255, 255, 255, 0.22); }
  .top-bar.hidden, .bottom-bar.hidden {
    opacity: 0;
    pointer-events: none;
    transition: opacity 180ms ease;
  }
  .bottom-bar { gap: 14px; }
```

(Replace the old `.close-button` rule references; the close button now uses
`.icon-button`. Remove the obsolete `.close-button` style block.)

- [ ] **Step 4: Type-check the component**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i Viewer3DFullscreen`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/3d/components/Viewer3DFullscreen.svelte
git commit -m "feat(viewer): consolidated mobile controls + immersive toggle in 3D overlay" -- src/lib/shared/3d/components/Viewer3DFullscreen.svelte
```

---

## Task 8: Pass immersive wiring from the route

**Files:**
- Modify: `src/routes/sequence/[id]/+page.svelte:600-617`

The route already mounts `Viewer3DFullscreen` with the playback/step props. Add
the immersive flag + handler from the orchestrator context. The orchestrator
exposes the fullscreen controller; surface `immersive` + `toggleImmersive`
through its context (one-line additions mirroring `enterFullscreen` at
`SequenceViewerOrchestrator.svelte:1170`).

- [ ] **Step 1: Expose immersive on the orchestrator context**

In `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte`,
where the context object is built (near line 1170, alongside
`enterFullscreen: fullscreen.enterFullscreen,`), add:

```ts
    immersive: fullscreen.immersive,
    toggleImmersive: fullscreen.toggleImmersive,
```

And add to the `OrchestratorContext` type (near line 114 where
`enterFullscreen: () => void;` is declared):

```ts
    immersive: boolean;
    toggleImmersive: (host: HTMLElement | null) => Promise<void> | void;
```

- [ ] **Step 2: Pass them into Viewer3DFullscreen**

In `src/routes/sequence/[id]/+page.svelte`, inside the `<mod.default ... />`
mount (lines 602-615), add two props before the closing `/>`:

```svelte
                    immersive={ctx.immersive}
                    onToggleImmersive={ctx.toggleImmersive}
```

- [ ] **Step 3: Type-check the route + orchestrator**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -iE "sequence/\[id\]|SequenceViewerOrchestrator"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/routes/sequence/[id]/+page.svelte src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte
git commit -m "feat(viewer): wire immersive toggle from route through orchestrator" -- src/routes/sequence/[id]/+page.svelte src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte
```

---

## Task 9: On-device validation harness

**Files:**
- Create: `src/routes/test/mobile-3d-controls/+page.svelte`

Mounts the real `Viewer3DFullscreen` with a catalog-seeded sequence and a live
`viewer-3d-context`, so Austen opens it on his iPhone SE. Seeds via
`loadCatalogs`/`loadCatalogSequences` (the same source `mandala-mobile` uses),
so no Firestore auth is needed.

- [ ] **Step 1: Implement the harness**

```svelte
<!-- src/routes/test/mobile-3d-controls/+page.svelte -->
<script lang="ts">
  /**
   * Mobile 3D Controls — on-device validation harness.
   * Open https://localhost:5173/test/mobile-3d-controls on an iPhone SE.
   * Mounts the real Viewer3DFullscreen overlay with a real catalog sequence.
   */
  import { onMount } from "svelte";
  import Viewer3DFullscreen from "$lib/shared/3d/components/Viewer3DFullscreen.svelte";
  import { createViewer3DState } from "$lib/shared/3d/state/viewer-3d-state.svelte";
  import { setViewer3DContext } from "$lib/shared/3d/context/viewer-3d-context";
  import { createFullscreenController } from "$lib/shared/sequence-viewer/state/fullscreen-controller.svelte";
  import { loadCatalogs, loadCatalogSequences } from "$lib/features/choreo-card/services/catalog-loader";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  const viewer = createViewer3DState();
  setViewer3DContext(viewer);

  const fullscreen = createFullscreenController({
    getHapticService: () => null,
    announce: (m) => console.debug("[a11y]", m),
  });

  let sequence = $state<SequenceData | null>(null);
  let isPlaying = $state(false);
  let currentStep = $state(0);
  let bpm = $state(60);
  let error = $state("");

  onMount(async () => {
    try {
      const catalogs = await loadCatalogs();
      const first = catalogs[0];
      if (!first) { error = "No catalogs available"; return; }
      const seqs = await loadCatalogSequences(first.id);
      const seq = seqs.find((s) => (s.steps?.length ?? 0) > 1) ?? seqs[0];
      if (!seq) { error = "No sequences in catalog"; return; }
      sequence = seq as SequenceData;
      viewer.enter3D(sequence);
    } catch (e) {
      error = `Load failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  });
</script>

{#if error}
  <div class="harness-error">{error}</div>
{:else if sequence}
  <Viewer3DFullscreen
    sequenceData={sequence}
    {currentStep}
    {isPlaying}
    {bpm}
    word={sequence.word ?? null}
    bluePropType={sequence.bluePropType != null ? String(sequence.bluePropType) : null}
    redPropType={sequence.redPropType != null ? String(sequence.redPropType) : null}
    onClose={() => history.back()}
    onPlaybackToggle={() => (isPlaying = !isPlaying)}
    onBpmChange={(b) => (bpm = b)}
    onStepForward={() => (currentStep += 1)}
    onStepBackward={() => (currentStep = Math.max(0, currentStep - 1))}
    immersive={fullscreen.immersive}
    onToggleImmersive={(host) => fullscreen.toggleImmersive(host)}
  />
{:else}
  <div class="harness-error">Loading sequence…</div>
{/if}

<style>
  .harness-error {
    position: fixed; inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.6); background: #0a0a14;
    font-size: 14px; padding: 24px; text-align: center;
  }
</style>
```

> **Verify the catalog-loader API before running:** confirm `loadCatalogs()`
> returns `Catalog[]` with `.id` and `loadCatalogSequences(id)` returns objects
> with `.steps`/`.word`/`.bluePropType`/`.redPropType` (it's the same import
> `mandala-mobile/+page.svelte:10` uses). If the signatures differ, adjust the
> two calls to match — Step 2 (load in the browser) will surface a mismatch.

- [ ] **Step 2: Verify it loads (build + dev check)**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i mobile-3d-controls`
Expected: no output.

Then confirm the route serves (dev server is on :5173):
Run: `curl -sk -o /dev/null -w "%{http_code}" https://localhost:5173/test/mobile-3d-controls`
Expected: `200`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/test/mobile-3d-controls/+page.svelte
git commit -m "test(viewer): mobile 3D controls on-device validation harness" -- src/routes/test/mobile-3d-controls/+page.svelte
```

---

## Task 10: Full verification gate

- [ ] **Step 1: Run the unit tests**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer/state/__tests__/fullscreen-capabilities.test.ts src/lib/shared/3d/components/controls/__tests__/BottomSheet.test.ts`
Expected: all PASS. (Tests live under `__tests__/` so the suite include glob `src/**/__tests__/**` actually runs them; use the suite config so they inherit jsdom + setup.)

- [ ] **Step 2: One full type-check (capture once, grep many)**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "error" /tmp/check.log | head -50`
Expected: no NEW errors in any file this plan created/modified. (Pre-existing
unrelated errors in the repo are out of scope — confirm none reference the Task
1-9 files.)

- [ ] **Step 3: On-device judgment (Austen)**

Hand off the link: `https://localhost:5173/test/mobile-3d-controls`. Austen opens
it on his iPhone SE and judges: thumb reach of the two FABs, sheet feel, playback
toggle, immersive button (note: native fullscreen no-ops on iPhone by design —
bars hide, Safari URL bar stays). Iterate on feedback before the change is
considered shippable to the production route.

> Per `verification-protocol.md`: do not claim the mobile redesign "works" from
> code alone. The on-device pass in Step 3 is the verification evidence.

---

## Self-Review (completed during authoring)

**Spec coverage:**
- Two thumb-corner bottom sheets (Performer / Everything-else) → Tasks 3-6. ✓
- BottomSheet extends/replaces a bits-ui gap → Task 3 with justification. ✓
- Playback-bar toggle → Task 6 (chevron). ✓
- Hybrid fullscreen (native + CSS-immersive fallback) → Tasks 1-2, 7-8. ✓
- Reuse existing rail/performer bodies verbatim → Tasks 4-5. ✓
- Test route on real components → Task 9. ✓
- Desktop untouched → confirmed: all changes are in `Viewer3DFullscreen` (mobile-
  only mount) + additive controller/context members. ✓

**Spec deviations (intentional, justified inline):**
1. Host is `Viewer3DFullscreen`, not `ViewerSplitPane`'s rail (mobile forces 2D
   split pane). Documented in the header correction.
2. `Viewer3DEffectPills` (disabled placeholders) removed — FX lives in the
   performer sheet's FX tab. Earns the cleanup.
3. Playback toggle + immersive collapse into the overlay's own bars rather than
   the app shell, because `Viewer3DFullscreen` is already a fixed `inset:0`
   overlay above all app chrome — hiding its bars IS reclaiming the screen.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `toggleImmersive(host)`, `immersive` getter, `onToggleImmersive`
prop, and the context members match across Tasks 2, 6, 7, 8, 9.

**Known soft spots flagged for the implementer (not placeholders — guarded with a
verify step):** the exact `ExportPopover` import path (Task 5) and the
`catalog-loader` signatures (Task 9) are confirmed against the grep sources cited,
with a svelte-check/browser guard step that surfaces any drift immediately.
