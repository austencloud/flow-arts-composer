# Sidebar text motion: findings (2026-11-06)

Austen: "as the sidebar contracts and expands, the transition animation that's
supposed to handle the text is awkward and not pretty."

## Method

1440×900 on `/create` (module with sections) and `/settings/display` (the
sub-nav with the back label), `@austencloud/sidebar` 1.2.0. Motion tokens were
slowed on `:root` by 20×, which keeps their ratios: `--duration-fast` 3s,
`--duration-normal` 4s, `--duration-emphasis` 5.6s. Opacity and box edges were
sampled on animation frames while the package's own hover controller ran
(`pointerenter` / `pointerleave` dispatched on `.ac-sidebar`). Times below are
slowed; divide by 20 for real time.

Frames in `evidence/2026-11-06-sidebar-text-motion/`:

- `frame-1-expand-early.webp`: expand, before the host fixes
- `frame-2-collapse-early.webp`: collapse, before the host fixes
- `frame-3-collapse-host-fixed.webp`: collapse, after the host fixes
- `frame-4-settings-expand.webp`: Settings expand, after the host fixes
- `wordmark-rail.webp`, `wordmark-mid.webp`, `wordmark-mid-2.webp`,
  `wordmark-expanded.webp`

## Root cause

The width moves on `--duration-emphasis` with `--ease-out`, a curve that does
most of its travel early. Each text runs its own clock against that:

| Text               | Expand                             | Collapse                                 |
| ------------------ | ---------------------------------- | ---------------------------------------- |
| Width              | 64 → 171 by 1.0s, 217 by 3.1s      | 220 → 131 by 1.0s, 112 by 1.3s           |
| Module label       | Opacity 0 until 3.1s, full at 7s   | Removed on the first frame, no exit      |
| Section label      | 0.37 at 1.0s, 0.96 at 3.1s         | 0.77 at 1.0s, clipped mid-word at 0.62   |
| Footer label (old) | Same delayed keyframe, 0 at 1.0s   | Removed on the first frame, button snaps |
| Back label (old)   | `--ease-standard`, from the source | Same token and curve, from the source    |
| Pin button         | Fades in over the opening name     | Ghost sits over the closing name         |

What that looks like:

- **Expand lags.** The panel reaches 217 of 220px while module labels are still
  invisible. Section labels are 96% in at that moment, so one tree shows two
  separate reveals: the rows below a module first, the module's own name after
  the panel has stopped.
- **Module labels drift.** The keyframe also slides them 4px, which starts after
  the width has settled, so they move on a still panel.
- **Collapse pops, then clips.** Module labels vanish on the first frame while
  section labels stay near full strength and the narrowing panel cuts through
  their letters ("Asse", "Cons"). No text wraps or jumps vertically; the
  defects are timing, popping and clipping.

## Fixed in the host

- `SidebarFooter.svelte`: labels stay mounted and fade with no delay. Button
  width moves 44↔200 on the nav's token and curve, measured to hold 10px from
  the nav's edge at every sample. The footer stays 220px wide, so its divider
  no longer snaps to 64px while the nav is wide.
- `DesktopNavigationSidebar.svelte`: the back label uses `--ease-out`, and
  closes on `--duration-fast`. It is at 0.04 opacity when the edge reaches it.
- `SidebarWordmark.svelte`: FAC opens into Flow Arts Composer, with the initials
  at full opacity throughout.

## Still host-owned, outside this task's files

`account/AccountRow.svelte` swaps variants on `isCollapsed`, so the account row
snaps from a full row to a 44px circle and its name pops (visible in
`frame-3-collapse-host-fixed.webp`). It needs the same treatment as the footer.

## Recommended package change

One rule for every label: **open on the width's curve with no delay, and close
on the shorter token so the text has faded before the edge reaches it.** The
footer and back label now do this, so these changes make the tree match them.

### `src/sidebar/ModuleButton.svelte`

Keep the label mounted. The button already carries its `aria-label`.

Before:

```svelte
{#if !isCollapsed}
  <span class="module-label">{label}</span>
  ...
{/if}
```

```css
.module-label {
  flex: 1;
  text-align: left;
  /* ...type rules... */
  animation: label-fade-in var(--duration-normal) ease-out var(--duration-fast)
    both;
}
```

After:

```svelte
<span class="module-label">{label}</span>
{#if !isCollapsed}
  <!-- the disabled badge and expand chevron stay as they are -->
{/if}
```

```css
.module-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-align: left;
  /* ...type rules... */
  transition: opacity var(--duration-normal) var(--ease-out);
}

.module-button.sidebar-collapsed .module-label {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
```

Remove `@keyframes label-fade-in`.

### `src/sidebar/SectionButton.svelte`

Before:

```css
.section-label {
  opacity: 1;
  transition: opacity var(--duration-normal) ease;
}

.section-button.collapsed .section-label {
  opacity: 0;
}
```

After:

```css
.section-label {
  opacity: 1;
  transition: opacity var(--duration-normal) var(--ease-out);
}

.section-button.collapsed .section-label {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
```

### `src/sidebar/SidebarBrand.svelte`

Before:

```css
.pin-toggle {
  transition:
    opacity var(--duration-normal) ease,
    background var(--duration-normal) ease,
    color var(--duration-normal) ease;
}
```

After: closed, the pin leaves on the short token. Opening, it waits until the
name has made room.

```css
.pin-toggle {
  transition:
    opacity var(--duration-fast) var(--ease-out),
    background var(--duration-normal) ease,
    color var(--duration-normal) ease;
}

.pin-toggle.visible {
  transition:
    opacity var(--duration-normal) var(--ease-out) var(--duration-fast),
    background var(--duration-normal) ease,
    color var(--duration-normal) ease;
}
```

`.pin-toggle.visible:hover` also matches `.visible`, so it needs its own
`transition` without the delay, or the hover response lags.

These package changes are proposed, not tried: nothing in the package was
edited or patched, so their result has not been observed.

## Other observations

- Pin then collapse: with the pointer still over the sidebar, pressing collapse
  leaves it hover-expanded at 220px. It narrows when the pointer leaves, with
  the same text motion as a hover collapse.
- `.pin-toggle` measures 44px wide, not the package's 28px, so something outside
  its rule sets a larger minimum. That hit area starts at x=163.3. The final "r"
  of the name ends at x=162.7, and the icon starts at x=177.8.
- Chromium builds a `background-clip: text` mask from every descendant's glyphs,
  ignoring their overflow and opacity. A clip on `.wordmark` drew the closed
  tails over FAC, so the gradient sits on each piece. The package's `.brand`
  uses the same parent clip with hidden children, so a consumer whose closed
  text has any width could hit this too. This rendering cause is inferred from
  the observed overlap and its disappearance after moving the clip.

## Fixed in the package (2026-11-06)

`@austencloud/sidebar` 1.2.1. Same method as above: 1440×900, tokens slowed 20×,
the package's own hover controller, opacity read on animation frames. "Before"
is 1.2.0 on the main dev server, on the same day with the same script. Its host
already had the first pass, so its footer and wordmark rows already follow the
rule. A dash means the element was not in the page.

### Opacity at each point of the width's travel, `/create`

| Text    |       | Expand 25 / 50 / 75 / 100 | Collapse 25 / 50 / 75 / 100 |
| ------- | ----- | ------------------------- | --------------------------- |
| Module  | 1.2.0 | 0 / 0 / 0 / 0.40          | — / — / — / —               |
|         | 1.2.1 | 0.34 / 0.62 / 0.86 / 1    | 0.42 / 0.14 / 0.02 / 0      |
| Section | 1.2.0 | 0.05 / 0.17 / 0.47 / 1    | 0.95 / 0.83 / 0.53 / 0      |
|         | 1.2.1 | 0.34 / 0.62 / 0.86 / 1    | 0.42 / 0.14 / 0.02 / 0      |
| Account | 1.2.0 | 0 / 0 / 0 / 0.60          | — / — / — / —               |
|         | 1.2.1 | 0.34 / 0.62 / 0.86 / 1    | 0.42 / 0.14 / 0.02 / 0      |
| Footer  | 1.2.0 | 0.34 / 0.62 / 0.86 / 1    | 0.57 / 0.27 / 0.07 / 0      |
|         | 1.2.1 | 0.34 / 0.62 / 0.86 / 1    | 0.42 / 0.14 / 0.02 / 0      |
| Pin     | 1.2.0 | 0.03 / 0.12 / 0.33 / 0.70 | 0.67 / 0.58 / 0.37 / 0      |
|         | 1.2.1 | 0 / 0 / 0 / 0.84, then 1  | 0.42 / 0.14 / 0.02 / 0      |

The back label and wordmark tails read the same as the 1.2.1 rows on
`/settings/display`. One tree now shows one reveal: every label reads the same
number at every point.

### Highest opacity at which letters were cut, closing

| Text                                | 1.2.0        | 1.2.1 |
| ----------------------------------- | ------------ | ----- |
| Section, "Assemble"                 | 0.74         | 0.06  |
| Module, "Feedback"                  | —            | 0.06  |
| Account, "Sign in"                  | —            | 0.03  |
| Back label                          | not measured | 0     |
| Footer, "Double Staff"              | 0.28         | 0.15  |
| Module, "Notifications"             | —            | 0.15  |
| Section, "Your visuals" (`/browse`) | not measured | 0.28  |
| Group, "Community" (`/browse`)      | not measured | 0.20  |
| Wordmark tail                       | 0.97         | 0.95  |

### What shipped versus what was proposed

- As proposed: the module label stays mounted with no keyframe and no slide, the
  section label shares its tokens, and the pin leaves first and arrives after the
  name has made room.
- Changed, close token: the proposed `--duration-fast` left labels at 0.16 to 0.28
  when the edge arrived. Labels, the pin and the host's footer, back label,
  account row and wordmark now close on `--duration-instant` (100 ms).
- Changed, pin hover: the proposed separate hover rule would still have delayed
  the fade when the pointer left. The reveal stays on the button and hover moves
  an inner icon's opacity, so only the reveal waits.
- Added, grouped lists: on `/browse` the list swapped trees on the first frame, so
  group headers popped and rows jumped 46 px. It is now one tree. Headers fold,
  and rows ease their height and indent on the width's clock, at most 17 px a
  frame at normal speed. Opening or closing a group now takes
  `--duration-emphasis` instead of a raw 150 ms slide.
- Added, inset: the section list's inset moved on a different curve from the
  width. It now uses `--ease-out`.
- Host: `AccountRow.svelte` has the footer's treatment. `readNavigationOptions`
  now refuses a collapsed rail, because module labels being in the DOM no longer
  means the Ghost can see them.

### Normal speed and reduced motion

- Module and footer icons did not move across a full `/browse` cycle, and neither
  did main content while hover-expanded. Pinning pushes content, as designed.
- The collapsed rail on `/browse` has no horizontal overflow and no focusable
  invisible control. Module `aria-label`s are unchanged.
- With `prefers-reduced-motion: reduce`, width and labels reach their end state
  with no animation running.
- Phone, 375×667: no `.ac-sidebar` is mounted, and the navigation drawer's account
  row looks and measures right. `/guide` rail: opens to 320 px and closes, with
  labels at 0 width in the rail. Six of its seven rows report 44 px of content in
  42 px, from the fixed icon column and not the label.

### Still open

- Wordmark tails are cut while they narrow, by design: FAC closes because each
  tail's column does. Holding the columns open would push the F off the left edge.
- Opening is a wipe, so letters are cut at up to 0.93 opacity as the edge moves
  away from them. Removing that would need a delay, which the rule forbids.
- The longest labels stay above 0.1 when closing, as in the table.
- The account name shows an ellipsis ("Si…") for a moment while opening, because
  long addresses need it at rest.
- `SidebarAccount.svelte` in the package still swaps variants and keeps the old
  keyframe. This app does not render it, so it was left alone.
- The module row's expand chevron can never render: `hasSections` is false
  whenever `isExpanded` is false.
