---
status: backlog
value: 3
effort: M
remaining: Audit accessibility acceptance; first fix the view-toggle radio buttons lacking aria-label, then verify the remaining keyboard and screen-reader paths.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Accessibility Fixes Design Spec

Date: 2026-05-23
Status: Backlog

## Context

Audit of the TKA Composer codebase against WCAG 2.1 AA surfaced 10 issues across four severity tiers. The codebase already has solid foundations: global `focus-visible` styles in `app.css`, a well-built `FocusTrap` class at `src/lib/shared/foundation/ui/drawer/FocusTrap.ts`, and `prefers-reduced-motion` queries in 250+ files. These fixes close the remaining gaps.

## P0 -- Motion Safety

### Issue 1: No `prefers-reduced-motion` in 3D system

**What:** The 3D environments (`src/lib/shared/3d/environments/scenes/`) and animation-engine effects run unconditionally. Users with vestibular disorders get full particle systems, camera choreography, and shader animations with no opt-out.

**Why it matters:** WCAG 2.3.3 (AAA) and WCAG 2.3.1 (A) require that motion can be disabled. The 2D layer already has `prefers-reduced-motion: reduce` coverage in `app.css` (lines 1051-1070). The 3D layer has none in environments and effects rendering.

**Where the gap is:**
- `src/lib/shared/3d/environments/scenes/` -- 65+ scene component files, zero reduced-motion queries
- `src/lib/shared/3d/environments/scenes/ocean/` -- fish behavior shaders, caustics, jellyfish, particles
- `src/lib/shared/3d/environments/scenes/ember/` -- lava rivers, fire wisps, heat distortion
- `src/lib/shared/3d/environments/scenes/cosmic/` -- meteor streaks, energy particles, prismatic caustics
- All 16 effects renderers animate unconditionally via `useTask` / `useFrame` loops

**Already covered:** `CameraChoreographyControls.svelte`, `WorldScene.svelte`, `SceneLoadingCurtain.svelte`, and `DebugPanel.svelte` do have reduced-motion queries.

**Design:**

1. Add a reactive `prefersReducedMotion` signal (JS `matchMedia` listener) to a shared utility:
   ```ts
   // src/lib/shared/3d/utils/reduced-motion.ts
   export function createReducedMotionState(): { readonly value: boolean }
   ```
   Components import this and gate their animation loops.

2. When `prefersReducedMotion` is true:
   - Environment particle systems (fish, jellyfish, meteors, fireflies, bubbles, snow): freeze at initial positions or hide
   - Shader-driven animations (caustics, lava flow, heat distortion, water surface): render a static frame (time parameter = 0)
   - Camera choreography auto-orbits: disabled (user can still manually orbit)
   - Tip effects (trail, bloom, echo, sparkles, etc.): render static glow halo at tip position instead of animated particles

3. The `Viewer3DCanvas` component reads the signal and passes it as context so child scenes can branch without each creating their own `matchMedia` listener.

4. A manual override toggle in the effects panel ("Reduce Motion") allows users to override the OS preference per-session. This satisfies users who have the OS preference on globally but want to selectively enable motion in TKA.

## P1 -- Focus Management

### Issue 2: CardInspectModal -- no focus trap

**What:** `CardInspectModal.svelte` (line 120) declares `role="dialog" aria-modal="true"` but does not trap focus. Tab key navigates behind the modal to the main app.

**Where:** `src/lib/features/choreo-card/components/CardInspectModal.svelte`

**Existing pattern:** The `Drawer` component (`src/lib/shared/foundation/ui/Drawer.svelte`, line 239) lazily creates a `FocusTrap` instance from `src/lib/shared/foundation/ui/drawer/FocusTrap.ts`. The `FocusTrap` class handles:
- Tab/Shift+Tab wrapping within container
- `inert` attribute on sibling elements for screen reader containment
- Previous focus restoration on deactivate
- Dynamic content (recalculates focusable elements on each Tab)
- Configurable initial focus, inert exclusions, and escape callback

**Design:**

Import and activate `FocusTrap` on mount, deactivate on close:

```svelte
<script>
  import { FocusTrap } from "$lib/shared/foundation/ui/drawer/FocusTrap";

  let containerEl: HTMLDivElement;
  let focusTrap: FocusTrap | null = null;

  $effect(() => {
    if (containerEl) {
      focusTrap = new FocusTrap({ onEscapeAttempt: onClose });
      focusTrap.activate(containerEl);
      return () => focusTrap?.deactivate();
    }
  });
</script>
```

Bind `containerEl` to the `.modal-container` div. The existing `handleKeydown` for Escape can be replaced by the `onEscapeAttempt` callback.

### Issue 3: MotionVisibilityToggle popover -- no focus trap or aria-modal

**What:** The narrow-viewport popover at `MotionVisibilityToggle.svelte` (line 93) declares `role="dialog"` but has no `aria-modal`, no `tabindex="-1"`, and no focus trap. The backdrop uses `role="button"` on a div (unnecessary when using pointer events).

**Where:** `src/lib/shared/sequence-viewer/components/MotionVisibilityToggle.svelte`

**Design:**

This is a small popover with 2 toggle chips. Full `FocusTrap` with `inert` siblings is heavy for a lightweight popover. Instead:

1. Add `aria-modal="true"` and `tabindex="-1"` to the popover div
2. Focus the popover on open so screen readers announce it
3. Trap Tab within the popover: the popover contains exactly 2 `MotionColorChips` buttons, so Tab wrapping is simple
4. Replace the backdrop `role="button"` with `aria-hidden="true"` -- the backdrop is a dismiss affordance for pointer users, not an interactive element. Remove the `tabindex="-1"` since it should not be focusable.
5. On close, return focus to the trigger button (already happens implicitly when `open` toggles off and the popover unmounts, but explicitly call `triggerBtnRef.focus()`)

## P2 -- Color Contrast

### Issue 4: SidebarFooter -- mic button colors below AA

**What:** The mic button in `SidebarFooter.svelte` uses:
- Default state: `color: rgba(255, 255, 255, 0.25)` -- contrast ~1.6:1 against dark bg
- Inactive state: `color: rgba(255, 255, 255, 0.15)` -- contrast ~1.3:1

**Where:** `src/lib/shared/navigation/components/desktop-sidebar/SidebarFooter.svelte`, lines 408 and 427

**Why it matters:** WCAG 1.4.3 requires 4.5:1 for text, 3:1 for UI components. The mic icon is a UI component, so 3:1 minimum applies.

**Design:**

The mic button is intentionally dim when inactive to signal "available but not active." Raise the floor to meet 3:1:

| State | Current | Target |
|-------|---------|--------|
| Default (voice enabled, not in command mode) | `rgba(255, 255, 255, 0.25)` | `rgba(255, 255, 255, 0.55)` (~4.5:1) |
| Inactive (voice not yet activated) | `rgba(255, 255, 255, 0.15)` | `rgba(255, 255, 255, 0.45)` (~3.3:1) |
| Hover states | proportionally higher | keep relative brightness bump |

The visual hierarchy (command-mode > enabled > inactive) is preserved by adjusting all three tiers up.

### Issue 5: AccountPopover -- nudge arrow and version link below AA

**What:** `AccountPopover.svelte` uses:
- `.nudge-arrow`: `color: var(--theme-text-dim, rgba(255, 255, 255, 0.3))` -- ~2.3:1
- `.version-link`: `color: var(--theme-text-dim, rgba(255, 255, 255, 0.4)); opacity: 0.6` -- effective ~1.6:1

**Where:** `src/lib/shared/navigation/components/account/AccountPopover.svelte`, lines 448 and 523-524

**Design:**

These are decorative/secondary elements but they are interactive (the version link is a clickable button). Interactive elements need 3:1 minimum.

| Element | Current | Target |
|---------|---------|--------|
| `.nudge-arrow` | `rgba(255, 255, 255, 0.3)` | `rgba(255, 255, 255, 0.55)` |
| `.version-link` | `rgba(255, 255, 255, 0.4)` at `opacity: 0.6` | `rgba(255, 255, 255, 0.55)` at `opacity: 1` |

The `.nudge-arrow` is a decorative chevron alongside labeled text, so its low contrast is less harmful. But since it sits on a button that already has a label, raising it costs nothing and helps low-vision users track the row.

## P3 -- Missing Labels

### Issue 6: BottomNavigation `<nav>` -- no aria-label

**What:** `BottomNavigation.svelte` (line 163) renders `<nav class="bottom-navigation">` with no `aria-label`. The `DesktopNavigationSidebar` correctly uses `aria-label="Main navigation"` (line 323).

**Where:** `src/lib/shared/navigation/components/layouts/BottomNavigation.svelte`

**Design:**

Add `aria-label="Main navigation"` to the `<nav>` element. This matches the desktop sidebar and helps screen reader users distinguish this nav from breadcrumbs and other `<nav>` elements on the page.

### Issue 7: ChoreoCardThumbnail -- button has no aria-label

**What:** `ChoreoCardThumbnail.svelte` (line 247) renders `<button class="choreo-card">` with no `aria-label`. The button content is purely visual (a rendered pictograph thumbnail). Screen readers announce "button" with no description.

**Where:** `src/lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte`

**Design:**

Add a dynamic `aria-label` using the sequence metadata:

```svelte
<button
  class="choreo-card"
  aria-label="View sequence {displayedSequence.word || displayedSequence.name}{variationCount > 0 ? `, variation ${currentVariationIndex + 1} of ${variationCount}` : ''}"
>
```

The `ChoreoCard` component in the choreo-card feature already does this correctly (`aria-label="View sequence {sequence.name}"` at line 124).

### Issue 8: ScanActivityTab -- role="radio" buttons not in radiogroup

**What:** `ScanActivityTab.svelte` (lines 76-89) renders `role="radio"` buttons for scope and view toggles. The scope buttons are correctly wrapped in `role="radiogroup"`, but the view-toggle buttons at line 83-89 are also wrapped. However, the scope section at line 75-82 uses a `div.scope` wrapper which correctly has `role="radiogroup"`.

Looking more carefully: both `.scope` (line 75) and `.view-toggle` (line 83) divs have `role="radiogroup"` and `aria-label`. This is actually implemented correctly.

**Remaining issue:** The `role="radio"` buttons in the `view-toggle` group (lines 84-89) lack `aria-label` attributes, unlike the scope buttons. The text content ("Active", "Zero-scan (N)") serves as the accessible name, which is acceptable. No change needed here.

**Correction:** Re-reading the audit -- the issue is that in some contexts these radio buttons appear without a radiogroup wrapper. Checking the template: both sets are wrapped. The audit finding appears to be a false positive for this specific file. No change needed.

## P4 -- Backdrop Pattern

### Issue 9: ViewerOverflowMenu -- no-op onkeydown on backdrop

**What:** `ViewerOverflowMenu.svelte` (line 151) renders:
```svelte
<div class="overflow-backdrop" onclick={close} onkeydown={() => {}}></div>
```
The `onkeydown={() => {}}` is a no-op added to suppress the Svelte a11y warning about `onclick` without `onkeydown`. The backdrop div should not be interactive at all.

**Where:** `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte`

**Design:**

Replace the backdrop with a non-interactive element:

```svelte
<div class="overflow-backdrop" aria-hidden="true" onclick={close}></div>
```

Add `aria-hidden="true"` so screen readers skip it entirely. Remove the `onkeydown` no-op. The Svelte a11y warning can be suppressed with the comment `<!-- svelte-ignore a11y_click_events_have_key_events -->` since the backdrop is intentionally mouse/touch only -- keyboard users dismiss via Escape (already handled in `handleKeydown`).

Alternatively, since the existing code already has `<!-- svelte-ignore a11y_no_static_element_interactions -->` on the wrapper, adding `aria-hidden="true"` alone is sufficient.

### Issue 10: LegalSheet -- backdrop div with onclick but no keyboard equivalent

**What:** `LegalSheet.svelte` (line 35) renders:
```svelte
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="sheet-backdrop" onclick={handleBackdropClick}>
```
The backdrop is click-dismissible but has no keyboard equivalent. It already uses `svelte-ignore` comments.

**Where:** `src/lib/shared/legal/components/LegalSheet.svelte`

**Design:**

The `LegalSheet` already handles Escape key via `<svelte:window onkeydown={handleKeydown} />` (line 30), so keyboard dismissal works. The issue is purely the backdrop's role in the accessibility tree.

Fix: Add `aria-hidden="true"` to the backdrop div. The `role="dialog"` on the inner `.sheet` element is the real landmark. The backdrop is a visual/pointer affordance only.

Additionally, this modal should have a focus trap. Apply the same `FocusTrap` pattern as Issue 2:

```svelte
<script>
  import { FocusTrap } from "$lib/shared/foundation/ui/drawer/FocusTrap";

  let sheetEl: HTMLDivElement;
  let focusTrap: FocusTrap | null = null;

  $effect(() => {
    if (isOpen && sheetEl) {
      focusTrap = new FocusTrap({ onEscapeAttempt: onClose });
      focusTrap.activate(sheetEl);
      return () => focusTrap?.deactivate();
    }
  });
</script>
```

## Implementation Order

1. **P0 (Issue 1):** Create `reduced-motion.ts` utility, wire into `Viewer3DCanvas` context, gate environment particle systems and shader time uniforms. Largest surface area but mechanical -- each scene component gets a 3-line branch.
2. **P1 (Issues 2-3):** Add `FocusTrap` to `CardInspectModal` and lightweight focus management to `MotionVisibilityToggle`. Both are self-contained, no risk of regression.
3. **P2 (Issues 4-5):** Bump color values in `SidebarFooter` mic button and `AccountPopover` secondary text. CSS-only changes.
4. **P3 (Issues 6-7):** Add `aria-label` to `BottomNavigation` nav and `ChoreoCardThumbnail` button. One-line each.
5. **P4 (Issues 9-10):** Replace backdrop no-ops with `aria-hidden="true"`, add `FocusTrap` to `LegalSheet`.

## Files Modified

| File | Issues |
|------|--------|
| `src/lib/shared/3d/utils/reduced-motion.ts` (new) | 1 |
| `src/lib/shared/3d/components/Viewer3DCanvas.svelte` | 1 |
| 65+ scene components under `src/lib/shared/3d/environments/scenes/` | 1 |
| `src/lib/features/choreo-card/components/CardInspectModal.svelte` | 2 |
| `src/lib/shared/sequence-viewer/components/MotionVisibilityToggle.svelte` | 3 |
| `src/lib/shared/navigation/components/desktop-sidebar/SidebarFooter.svelte` | 4 |
| `src/lib/shared/navigation/components/account/AccountPopover.svelte` | 5 |
| `src/lib/shared/navigation/components/layouts/BottomNavigation.svelte` | 6 |
| `src/lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte` | 7 |
| `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte` | 9 |
| `src/lib/shared/legal/components/LegalSheet.svelte` | 10 |

## Verification

- P0: Toggle OS reduced-motion preference, confirm 3D scenes render static, effects show static glow
- P1: Open each modal, Tab through all focusable elements, confirm focus wraps within container
- P2: Use Chrome DevTools color contrast audit or axe-core to confirm all modified elements pass 3:1 for UI components
- P3: Run axe-core scan on browse gallery and bottom navigation, confirm zero "missing label" violations
- P4: Screen reader (NVDA/VoiceOver) navigation through overflow menu and legal sheet, confirm backdrops are not announced
