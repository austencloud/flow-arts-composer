# Hover-Expand Overlay Rail Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Content permanently reserves the 64px rail; hovering/focusing the rail expands the sidebar to 220px as an overlay above content (zero reflow); clicking the header pins it back to the classic 220px push layout.

**Architecture:** A pure-timer hover-intent controller feeds a component-local `hoverExpanded` flag. `visuallyExpanded = !isCollapsed || hoverExpanded` drives width, content tree, and behavior inside `DesktopNavigationSidebar.svelte` only. `desktopSidebarState.width` keeps its existing 64/220 setter but is re-documented as the *reserved* layout width — all six external consumers already want the reserved edge, so nothing outside the sidebar folder changes.

**Tech Stack:** Svelte 5 runes, vitest (jsdom, fake timers), existing design tokens.

**Spec:** `docs/superpowers/specs/active/2026-07-05-hover-expand-overlay-sidebar-design.md`

---

### Task 1: Hover-intent controller (TDD)

**Files:**
- Create: `src/lib/shared/navigation/services/hover-intent.ts`
- Test: `src/lib/shared/navigation/services/__tests__/hover-intent.test.ts`

(Vitest config only picks up co-located tests under `src/**/__tests__/` — `tests/config/vitest.config.ts:24`.)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/navigation/services/__tests__/hover-intent.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHoverIntent } from "../hover-intent";

describe("createHoverIntent", () => {
  let onOpen: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onOpen = vi.fn();
    onClose = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function make() {
    return createHoverIntent({ openDelay: 120, closeDelay: 300, onOpen, onClose });
  }

  it("opens after openDelay on pointerEnter", () => {
    const intent = make();
    intent.pointerEnter();
    expect(onOpen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(119);
    expect(onOpen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("cancels pending open when pointer leaves before openDelay", () => {
    const intent = make();
    intent.pointerEnter();
    vi.advanceTimersByTime(60);
    intent.pointerLeave();
    vi.advanceTimersByTime(1000);
    expect(onOpen).not.toHaveBeenCalled();
    // leave-before-open still schedules a close (harmless; consumer is idempotent)
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes after closeDelay on pointerLeave", () => {
    const intent = make();
    intent.pointerEnter();
    vi.advanceTimersByTime(120);
    intent.pointerLeave();
    vi.advanceTimersByTime(299);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("re-enter within closeDelay cancels the pending close", () => {
    const intent = make();
    intent.pointerEnter();
    vi.advanceTimersByTime(120);
    intent.pointerLeave();
    vi.advanceTimersByTime(150);
    intent.pointerEnter();
    vi.advanceTimersByTime(1000);
    expect(onClose).not.toHaveBeenCalled();
    // already open — a second onOpen fire is fine (idempotent consumer),
    // but the pending close MUST have been cancelled
  });

  it("openNow fires synchronously and clears timers", () => {
    const intent = make();
    intent.pointerLeave(); // arm a close
    intent.openNow();
    expect(onOpen).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closeNow fires synchronously and clears timers", () => {
    const intent = make();
    intent.pointerEnter(); // arm an open
    intent.closeNow();
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("cancel clears both timers without firing callbacks", () => {
    const intent = make();
    intent.pointerEnter();
    intent.cancel();
    vi.advanceTimersByTime(1000);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses default delays of 120/300 when not provided", () => {
    const intent = createHoverIntent({ onOpen, onClose });
    intent.pointerEnter();
    vi.advanceTimersByTime(120);
    expect(onOpen).toHaveBeenCalledTimes(1);
    intent.pointerLeave();
    vi.advanceTimersByTime(300);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/navigation/services/__tests__/hover-intent.test.ts --config tests/config/vitest.config.ts`
Expected: FAIL — cannot resolve `../hover-intent`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/shared/navigation/services/hover-intent.ts
/**
 * Hover-Intent Controller
 * Domain: Desktop Navigation Sidebar
 *
 * Pure timer logic for the hover-expand overlay rail: a short open delay so
 * pointers crossing the rail en route elsewhere don't trigger expansion, and
 * a close grace so brief overshoots don't collapse it. No DOM, no runes —
 * the consumer owns state and guards.
 */

export interface HoverIntentOptions {
  /** ms of sustained hover before onOpen fires (default 120) */
  openDelay?: number;
  /** ms of grace after pointer leaves before onClose fires (default 300) */
  closeDelay?: number;
  onOpen: () => void;
  onClose: () => void;
}

export interface HoverIntentController {
  /** Pointer entered the target: cancel pending close, schedule open. */
  pointerEnter(): void;
  /** Pointer left the target: cancel pending open, schedule close. */
  pointerLeave(): void;
  /** Open immediately (keyboard focus), clearing all timers. */
  openNow(): void;
  /** Close immediately (Escape, guard teardown), clearing all timers. */
  closeNow(): void;
  /** Clear all timers without firing callbacks. */
  cancel(): void;
}

export function createHoverIntent({
  openDelay = 120,
  closeDelay = 300,
  onOpen,
  onClose,
}: HoverIntentOptions): HoverIntentController {
  let openTimer: ReturnType<typeof setTimeout> | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  function clearOpenTimer() {
    if (openTimer !== null) {
      clearTimeout(openTimer);
      openTimer = null;
    }
  }

  function clearCloseTimer() {
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  return {
    pointerEnter() {
      clearCloseTimer();
      if (openTimer !== null) return;
      openTimer = setTimeout(() => {
        openTimer = null;
        onOpen();
      }, openDelay);
    },
    pointerLeave() {
      clearOpenTimer();
      if (closeTimer !== null) return;
      closeTimer = setTimeout(() => {
        closeTimer = null;
        onClose();
      }, closeDelay);
    },
    openNow() {
      clearOpenTimer();
      clearCloseTimer();
      onOpen();
    },
    closeNow() {
      clearOpenTimer();
      clearCloseTimer();
      onClose();
    },
    cancel() {
      clearOpenTimer();
      clearCloseTimer();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/navigation/services/__tests__/hover-intent.test.ts --config tests/config/vitest.config.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/navigation/services/hover-intent.ts src/lib/shared/navigation/services/__tests__/hover-intent.test.ts
git commit -m "feat(nav): hover-intent controller for overlay rail sidebar" -- src/lib/shared/navigation/services/hover-intent.ts src/lib/shared/navigation/services/__tests__/hover-intent.test.ts
```

---

### Task 2: Reserved-width semantics + rail default

**Files:**
- Modify: `src/lib/shared/layout/desktop-sidebar-state.svelte.ts`

- [ ] **Step 1: Re-document `width` as reserved width**

Replace the `// Sidebar widths` comment block (lines 22-25) with:

```ts
  // Sidebar widths. `width` is the RESERVED layout width — the space content
  // permanently cedes to the sidebar (64 rail / 220 pinned). Hover-expansion
  // is a purely visual overlay inside DesktopNavigationSidebar and NEVER
  // changes this value. All --desktop-sidebar-width consumers (MainInterface
  // padding, drawer left edges, TabIntro, BrowseModule) align to this
  // reserved edge by design.
  expandedWidth: 220, // Pinned sidebar width
  collapsedWidth: 64, // Rail width (icon-only)
  width: 220, // Current RESERVED width (computed from collapsed state)
```

- [ ] **Step 2: Flip the no-preference default to rail**

Replace `loadDesktopSidebarCollapsedState` (lines 112-121) with:

```ts
export function loadDesktopSidebarCollapsedState(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // No stored preference → rail mode (collapsed) is the default: content
    // keeps max width and the rail hover-expands as an overlay. Users who
    // explicitly pinned the sidebar open (stored "false") keep push layout.
    return stored === null ? true : stored === "true";
  } catch (error) {
    console.warn("Failed to load desktop sidebar collapsed state:", error);
    return true;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/layout/desktop-sidebar-state.svelte.ts
git commit -m "feat(nav): sidebar width = reserved width; default to rail mode" -- src/lib/shared/layout/desktop-sidebar-state.svelte.ts
```

---

### Task 3: Sidebar component — visual state, intent wiring, guards

**Files:**
- Modify: `src/lib/shared/navigation/components/DesktopNavigationSidebar.svelte`

- [ ] **Step 1: Add imports**

After the existing `desktop-sidebar-state` import block (line 15), add:

```ts
  import { createHoverIntent } from "../services/hover-intent";
  import { hasOpenDrawers } from "../../foundation/ui/drawer/drawer-stack";
```

- [ ] **Step 2: Add visual state, remove dead state**

Delete lines 109-111 (`isTransitioningFromCollapsed` comment + `$state`). In its place add:

```ts
  // --- Hover-expand overlay state (rail mode only) -------------------------
  // hoverExpanded is a purely VISUAL flag: it widens the sidebar above the
  // content without touching desktopSidebarState.width (the reserved width).
  let hoverExpanded = $state(false);
  let pointerInside = $state(false);
  let hoverCapable = $state(false);

  // What the user SEES (and therefore how the sidebar behaves)
  const visuallyExpanded = $derived(!isCollapsed || hoverExpanded);

  const hoverIntent = createHoverIntent({
    onOpen: () => {
      hoverExpanded = true;
    },
    onClose: () => {
      hoverExpanded = false;
    },
  });
```

- [ ] **Step 3: Add hold-open guard + handlers**

After the `accountPopoverOpen`/`accountSectionEl` declarations (line 118), add:

```ts
  // Floating UI anchored to sidebar elements must hold the overlay open —
  // collapsing under an open menu/popover would orphan its anchor.
  const holdOpen = $derived(
    contextMenuState.mode !== "closed" || accountPopoverOpen
  );

  function handleSidebarPointerEnter() {
    pointerInside = true;
    // Drawers (z 400) sit above the sidebar (z 200) anchored at the reserved
    // edge — expanding underneath one looks broken, so suppress.
    if (!hoverCapable || !isCollapsed || hasOpenDrawers()) return;
    hoverIntent.pointerEnter();
  }

  function handleSidebarPointerLeave() {
    pointerInside = false;
    if (!hoverExpanded) {
      hoverIntent.cancel();
      return;
    }
    if (holdOpen) return; // the $effect below re-arms close when guard clears
    hoverIntent.pointerLeave();
  }

  function handleSidebarFocusIn() {
    if (!isCollapsed) return;
    // Keyboard users get no intent delay
    hoverIntent.openNow();
  }

  function handleSidebarFocusOut(e: FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (next && sidebarElement?.contains(next)) return;
    if (pointerInside || holdOpen) return;
    hoverIntent.closeNow();
  }

  function handleSidebarKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && hoverExpanded) {
      hoverIntent.closeNow();
    }
  }

  // When a hold-open guard clears and the pointer is already gone, start the
  // close grace so the overlay doesn't hang open forever.
  $effect(() => {
    if (!holdOpen && !pointerInside && hoverExpanded) {
      hoverIntent.pointerLeave();
    }
  });
```

- [ ] **Step 4: Rework `handleToggleCollapse` (pin/unpin)**

Replace the existing function (lines 248-252) with:

```ts
  function handleToggleCollapse() {
    hapticService?.trigger("selection");
    const pinning = desktopSidebarState.isCollapsed; // rail → pinned
    toggleDesktopSidebarCollapsed();
    saveDesktopSidebarCollapsedState(desktopSidebarState.isCollapsed);
    hoverIntent.cancel();
    // Pinning: visual expansion now comes from !isCollapsed. Unpinning under
    // the cursor: stay visually open until the pointer leaves (no snap-shut).
    hoverExpanded = pinning ? false : pointerInside;
  }
```

- [ ] **Step 5: Key module-tap behavior off visual state**

In `handleModuleTap` (line 199), change:

```ts
    if (isCollapsed || hasNoSections) {
```

to:

```ts
    if (!visuallyExpanded || hasNoSections) {
```

and inside that branch change `if (!isCollapsed)` (line 203) to `if (visuallyExpanded)`.

- [ ] **Step 6: matchMedia hover capability in onMount**

Inside `onMount`, after `hapticService = getHapticFeedback();` (line 309), add:

```ts
    // Hover-expand only for real pointers; convertibles can flip mid-session
    const hoverMq = window.matchMedia("(hover: hover) and (pointer: fine)");
    hoverCapable = hoverMq.matches;
    const onHoverMqChange = (ev: MediaQueryListEvent) => {
      hoverCapable = ev.matches;
      if (!ev.matches) hoverIntent.closeNow();
    };
    hoverMq.addEventListener("change", onHoverMqChange);
```

and in the returned cleanup function add:

```ts
      hoverMq.removeEventListener("change", onHoverMqChange);
      hoverIntent.cancel();
```

- [ ] **Step 7: Template — wire events + visual-state classes**

Replace the `<nav>` opening tag (lines 337-344) with:

```svelte
<nav
  class="desktop-navigation-sidebar"
  class:collapsed={!visuallyExpanded}
  class:hover-expanded={hoverExpanded && isCollapsed}
  class:entry-animating={isEntryAnimating}
  bind:this={sidebarElement}
  style="view-transition-name: sidebar"
  aria-label="Main navigation"
  onpointerenter={handleSidebarPointerEnter}
  onpointerleave={handleSidebarPointerLeave}
  onfocusin={handleSidebarFocusIn}
  onfocusout={handleSidebarFocusOut}
  onkeydown={handleSidebarKeydown}
>
```

(If svelte-check flags a11y on the non-interactive `<nav>` handlers, add
`<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->` above it —
the handlers are enhancement-only; all inner controls remain real buttons.)

- [ ] **Step 8: Template — every tree/branch switches on visual state**

Apply these exact substitutions in the template (each occurrence listed):

| Line (pre-edit) | Old | New |
|---|---|---|
| 346-350 `SidebarHeader` | `{isCollapsed}` + `onLogoClick={handleLogoTap}` | `mode={!visuallyExpanded ? "rail" : isCollapsed ? "hover" : "pinned"}` (drop `onLogoClick` — Task 4 removes the dead prop) |
| 355 `.navigation-content` | `class:tabs-mode={isCollapsed}` | `class:tabs-mode={!visuallyExpanded}` |
| 364 settings header | `{#if !isCollapsed}` | `{#if visuallyExpanded}` |
| 374 back button | `class:collapsed={isCollapsed}` | `class:collapsed={!visuallyExpanded}` |
| 381 back label | `{#if !isCollapsed}` | `{#if visuallyExpanded}` |
| 386 settings tabs | `{#if isCollapsed}` | `{#if !visuallyExpanded}` |
| 429 modules trees | `{#if isCollapsed}` | `{#if !visuallyExpanded}` |
| 507-521 `ModuleGroup` | `{isCollapsed}` and `{isTransitioningFromCollapsed}` props | delete both lines (Task 6 removes them from ModuleGroup) |
| 529-535 `SidebarFooter` | `{isCollapsed}` | `isCollapsed={!visuallyExpanded}` |

Also delete the now-unused `handleLogoTap` function (lines 254-258).

- [ ] **Step 9: CSS — overlay shadow + inner width pin**

In `.desktop-navigation-sidebar`'s `transition` (line 567), add box-shadow:

```css
    transition:
      width var(--duration-emphasis, 280ms)
        var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
      box-shadow var(--duration-emphasis, 280ms)
        var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
      top 0.2s ease;
```

After the `.desktop-navigation-sidebar.collapsed` rule (line 579-581), add:

```css
  /* Hover-expanded overlay (rail mode): floats above content, so it gets
     elevation. Width comes from the base rule (collapsed class is absent). */
  .desktop-navigation-sidebar.hover-expanded {
    box-shadow: 24px 0 48px -12px rgba(0, 0, 0, 0.45);
    border-right-color: var(--theme-stroke-strong, var(--theme-stroke));
  }
```

In `.navigation-content` (line 586), pin the inner width when visually
expanded so the 64→220 animation is a *reveal* — labels neither wrap nor
container-query-rescale mid-animation:

```css
  .navigation-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 8px;
    position: relative;
    /* Pin inner content to the expanded width; the nav's overflow:hidden
       clips it while the width animates. Prevents cqw font rescaling and
       label wrap during expansion. */
    width: 220px;

    /* Enable container queries for responsive sizing */
    container-type: inline-size;
    container-name: nav-content;
  }
```

(Note: padding changes from `16px 12px` to `16px 8px` — part of the icon
alignment in Task 5's math.)

The `.navigation-content.tabs-mode` rule keeps its own layout but must also
pin its width to the rail:

```css
  .navigation-content.tabs-mode {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 8px;
    width: 64px;
  }
```

- [ ] **Step 10: Verify with check:watch / check:fast**

Run: `npm run check:fast`
Expected: no new errors in `DesktopNavigationSidebar.svelte` (SidebarHeader/ModuleGroup prop errors are expected until Tasks 4 & 6 land — note them, don't chase them).

- [ ] **Step 11: Commit** (after Tasks 4-6 make the tree consistent — single commit at Task 7)

---

### Task 4: SidebarHeader — three modes + pin affordance

**Files:**
- Modify: `src/lib/shared/navigation/components/desktop-sidebar/SidebarHeader.svelte`

- [ ] **Step 1: Replace script props**

```svelte
<script lang="ts">
  // rail: icon-only "TKA" mark (not hovered, not pinned)
  // hover: overlay-expanded — clicking PINS the sidebar open
  // pinned: classic push layout — clicking collapses back to the rail
  let { mode, onToggleCollapse } = $props<{
    mode: "rail" | "hover" | "pinned";
    onToggleCollapse: () => void;
  }>();

  const actionLabel = $derived(
    mode === "pinned"
      ? "Collapse sidebar to rail"
      : mode === "hover"
        ? "Pin sidebar open"
        : "Expand sidebar"
  );
</script>
```

(The old `isCollapsed` and `onLogoClick` props die — `onLogoClick` was
declared but never wired to any element; dead code.)

- [ ] **Step 2: Replace template**

```svelte
<div class="sidebar-header">
  <button
    class="brand-toggle"
    onclick={onToggleCollapse}
    aria-label={actionLabel}
    title={actionLabel}
  >
    {#if mode === "rail"}
      <span class="brand-icon">TKA</span>
    {:else}
      <span class="brand-text">TKA Composer</span>
      {#if mode === "hover"}
        <i class="fas fa-thumbtack toggle-icon pin-visible" aria-hidden="true"></i>
      {:else}
        <i class="fas fa-chevron-left toggle-icon" aria-hidden="true"></i>
      {/if}
    {/if}
  </button>
</div>
```

- [ ] **Step 3: Add pin-visible style**

After the `.brand-toggle:hover .toggle-icon` rule (line 112-114), add:

```css
  /* Pin affordance in hover-overlay mode is always visible — it is the only
     discoverable path to pinning, so it cannot hide behind another hover. */
  .toggle-icon.pin-visible {
    opacity: 0.7;
  }

  .brand-toggle:hover .toggle-icon.pin-visible {
    opacity: 1;
  }
```

- [ ] **Step 4: Run check**

Run: `npm run check:fast`
Expected: SidebarHeader prop errors from Task 3 Step 8 now resolved.

---

### Task 5: Icon-column alignment (x=32px in both trees)

**Math:** Rail icon center = 8px (content pad) + 2px (44px button centered in
48px column) + 22px (half of 44px button) = **32px**. The expanded tree must
match: 8px (content pad, changed in Task 3 Step 9) + 2px (module-group pad) +
0px (button pad-left) + 22px (half of 44px icon column) = **32px**.

**Files:**
- Modify: `src/lib/shared/navigation/components/desktop-sidebar/ModuleButton.svelte`
- Modify: `src/lib/shared/navigation/components/desktop-sidebar/ModuleGroup.svelte`

- [ ] **Step 1: ModuleButton — fixed 44px icon column, zero left pad**

In `.module-button` (line 147-162), change `gap: 12px` → `gap: 0` and
`padding: 12px 14px` → `padding: 12px 14px 12px 0`:

```css
  .module-button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0;
    min-height: var(--min-touch-target);
    padding: 12px 14px 12px 0;
    /* ...rest unchanged... */
  }
```

In `.icon-wrapper` (line 304-309), fix the column width so the icon centers
at the same x as the rail's icons (44px column, icon centered):

```css
  .icon-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    flex-shrink: 0;
  }
```

- [ ] **Step 2: ModuleGroup — 2px horizontal padding in both variants**

Line 140: `padding: 4px;` → `padding: 4px 2px;`
Line 148 (`.module-group.active.has-sections`): `padding: 8px 6px;` → `padding: 8px 2px;`

- [ ] **Step 3: Run check**

Run: `npm run check:fast`
Expected: clean for both files.

---

### Task 6: Remove redundant per-icon hover tooltips + dead prop

**Files:**
- Modify: `src/lib/shared/navigation/components/desktop-sidebar/CollapsedModuleButton.svelte`
- Modify: `src/lib/shared/navigation/components/desktop-sidebar/CollapsedTabButton.svelte`
- Modify: `src/lib/shared/navigation/components/desktop-sidebar/ModuleGroup.svelte`

- [ ] **Step 1: CollapsedModuleButton — delete tooltip**

Delete the template span (lines 89-90):

```svelte
  <!-- Hover Label -->
  <span class="hover-label">{translatedLabel}</span>
```

Delete the styles: the `/* Hover Label - slides in from right */` comment,
the whole `.hover-label` rule, and the `.collapsed-module-button:hover .hover-label`
rule (lines 187-210). `aria-label={translatedLabel}` on the button remains —
AT users lose nothing; sighted users get the real overlay labels 120ms later.

- [ ] **Step 2: CollapsedTabButton — delete tooltip**

Delete the template span (lines 37-38):

```svelte
  <!-- Hover Label -->
  <span class="hover-label">{translatedLabel}</span>
```

Delete the `/* Hover Label - slides in from right */` `.hover-label` rule and
the `.collapsed-tab-button:hover .hover-label` rule (lines 114-137).

- [ ] **Step 3: ModuleGroup — drop dead `isTransitioningFromCollapsed`**

Remove `isTransitioningFromCollapsed,` from the destructured props (line 20)
and from the `$props<{...}>` type (line 34). Change line 118:

```svelte
  {#if isExpanded && filteredSections.length > 0 && !isCollapsed && !isTransitioningFromCollapsed}
```

to:

```svelte
  {#if isExpanded && filteredSections.length > 0 && !isCollapsed}
```

Also remove `isCollapsed,` from props and `{isCollapsed}` pass-through to
`ModuleButton`? **No** — `ModuleButton` still consumes `isCollapsed` for its
`sidebar-collapsed` class. Keep `isCollapsed` threading; the parent (Task 3
Step 8) stopped passing it, so give it a default in ModuleGroup:

```ts
    isCollapsed = false,
```

and in the type: `isCollapsed?: boolean;`

- [ ] **Step 4: Run check**

Run: `npm run check:fast`
Expected: all Task 3-6 files clean; zero references to `isTransitioningFromCollapsed` (verify: `grep -r isTransitioningFromCollapsed src/` → no hits).

---

### Task 7: Full gate + commit the component work

- [ ] **Step 1: Unit tests still green**

Run: `npx vitest run src/lib/shared/navigation/services/__tests__/hover-intent.test.ts --config tests/config/vitest.config.ts`
Expected: PASS

- [ ] **Step 2: One full check (capture once, grep many)**

```bash
npm run check > "$TMPDIR/sidebar-check.log" 2>&1; grep -ciE "error" "$TMPDIR/sidebar-check.log"
```

Expected: 0 new errors attributable to the touched files (compare any hits against files in this plan).

- [ ] **Step 3: Commit (scoped pathspec — shared index!)**

```bash
git add src/lib/shared/navigation/components/DesktopNavigationSidebar.svelte src/lib/shared/navigation/components/desktop-sidebar/SidebarHeader.svelte src/lib/shared/navigation/components/desktop-sidebar/ModuleButton.svelte src/lib/shared/navigation/components/desktop-sidebar/ModuleGroup.svelte src/lib/shared/navigation/components/desktop-sidebar/CollapsedModuleButton.svelte src/lib/shared/navigation/components/desktop-sidebar/CollapsedTabButton.svelte
git commit -m "feat(nav): hover-expand overlay rail sidebar

Rail (64px) is the permanently reserved width; hover/focus expands the
sidebar to 220px as an overlay above content — zero content reflow.
Header pin toggles back to classic push. Icon columns aligned at x=32px
in both trees so the expansion reads as a reveal. Drops redundant
per-icon hover tooltips and dead isTransitioningFromCollapsed state." -- src/lib/shared/navigation/components/DesktopNavigationSidebar.svelte src/lib/shared/navigation/components/desktop-sidebar/SidebarHeader.svelte src/lib/shared/navigation/components/desktop-sidebar/ModuleButton.svelte src/lib/shared/navigation/components/desktop-sidebar/ModuleGroup.svelte src/lib/shared/navigation/components/desktop-sidebar/CollapsedModuleButton.svelte src/lib/shared/navigation/components/desktop-sidebar/CollapsedTabButton.svelte
```

---

### Task 8: Runtime verification (Chrome DevTools MCP, dev server :5173)

- [ ] **Step 1: Sanity — dev server serving**

Run: `curl -sk -o /dev/null -w "%{http_code}" https://localhost:5173/`
Expected: 200

- [ ] **Step 2: Browser checks** (evidence per `verification-protocol.md`)

Navigate to `https://localhost:5173/?mode=app` at ≥1280px viewport. Clear the
stored pref first to see the new default: `localStorage.removeItem("tka-desktop-sidebar-collapsed")` + reload.

| Check | Method | Pass criterion |
|---|---|---|
| Rail default | snapshot | sidebar renders at 64px, content padding 64px |
| Zero reflow | `evaluate`: record `getBoundingClientRect().x` of `#main-content` firstElementChild, hover rail, re-measure | identical x before/during/after |
| Overlay expands | hover rail 200ms | nav width 220, shadow present, content unmoved |
| Icon anchoring | `evaluate`: icon center x in rail vs expanded | both 32±1px |
| No font rescale | `evaluate`: computed font-size of a section label mid-animation | constant |
| Pin | click header pin | width stays 220, content padding animates to 220, persists after reload |
| Unpin | click chevron | back to rail after pointer leaves |
| Keyboard | Tab into rail | expands immediately; Escape collapses |
| Drawer guard | open a drawer, hover rail | no expansion |
| Reduced motion | CDP emulate `prefers-reduced-motion: reduce` | expansion snaps, no transition |

- [ ] **Step 3: Report results with evidence** (screenshots / evaluate output) — no "should work" phrasing.

---

## Self-Review Notes

- Spec coverage: Decisions 1-7 → Tasks 3 (1,2,5,7 via guards/wiring), 2 (3),
  3 Step 9 (4), 3 Step 3 (5), 6 (6), 3 Step 5 (7). Motion/geometry → Tasks 3
  Step 9 + 5. Cleanup → Task 6. Testing → Tasks 1, 7, 8. ✓
- No placeholders; all code inline. ✓
- Type consistency: `createHoverIntent` signature identical in Task 1 test,
  Task 1 impl, Task 3 usage. `mode` union identical in Task 3 Step 8 and
  Task 4. ✓
