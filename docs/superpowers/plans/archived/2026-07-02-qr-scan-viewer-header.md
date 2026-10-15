# QR Scan Viewer Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/q/[code]` a real "Sequence Viewer" header carrying the funnel actions (Open in Composer, Open TKA, Download), consolidating the 4 scattered spawn points of those actions into one bar.

**Architecture:** New `ScanViewerHeader.svelte` follows `RouteViewerHeader`'s grid pattern and reuses `ViewerOverflowMenu` for the title-triggered menu. Desktop shows the two CTAs as labeled buttons in the right cluster with Download in the menu; portrait folds all three into the menu. Four existing spawn points in `+page.svelte` are removed.

**Tech Stack:** Svelte 5 (runes), existing `ViewerOverflowMenu` primitive, page-local theme CSS vars.

**Verification note:** This is presentational + reuse of a tested menu primitive. Per `.claude/rules/component-test-discipline.md` and the `testing` skill (silent-bug philosophy), a header layout is obvious-when-broken — no vitest-browser component test is written. Each task verifies via `npm run check` and the live scan route `https://localhost:5173/q/9DQN`.

**Spec:** `docs/superpowers/specs/2026-07-02-qr-scan-viewer-header-design.md`

---

### Task 1: Add `remixLabel` prop to `ViewerOverflowMenu`

The scan menu needs the Remix item labeled "Open in Composer". The menu hardcodes `"Remix"` at `ViewerOverflowMenu.svelte:160`. Add an optional label prop mirroring the existing `openAppLabel` pattern (`:52-53, :90`).

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte`

- [ ] **Step 1: Add the prop to the interface**

In the `Props` interface, directly after the `onRemix?` line (`:45`), add:

```ts
    onRemix?: () => void;
    /** Label for the onRemix item. Defaults to "Remix". */
    remixLabel?: string;
```

- [ ] **Step 2: Destructure it with a default**

In the `let { ... }: Props = $props();` block, directly after `onRemix,` (`:86`), add:

```ts
    onRemix,
    remixLabel = "Remix",
```

- [ ] **Step 3: Use it in the menu-item builder**

Replace the `onRemix` item push (`:159-161`):

```ts
    if (onRemix) {
      items.push({ label: "Remix", icon: "fa-pen-to-square", action: onRemix, className: "remix" });
    }
```

with:

```ts
    if (onRemix) {
      items.push({ label: remixLabel, icon: "fa-pen-to-square", action: onRemix, className: "remix" });
    }
```

- [ ] **Step 4: Typecheck**

Run: `npm run check:fast`
Expected: no new errors in `ViewerOverflowMenu.svelte`. Every existing caller keeps the `"Remix"` default — no behavior change.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte
git commit -m "feat(viewer): optional remixLabel prop on ViewerOverflowMenu

Lets the QR scan header relabel the Remix item to 'Open in Composer'.
Defaults to 'Remix' — no change for existing callers.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMU5Yq93Vr7DtpP79QxTck" -- src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte
```

---

### Task 2: Create `ScanViewerHeader.svelte`

**Files:**
- Create: `src/lib/shared/sequence-viewer/components/ScanViewerHeader.svelte`

- [ ] **Step 1: Write the component**

Create the file with exactly this content:

```svelte
<!--
  ScanViewerHeader.svelte

  Header for the /q/[code] QR scan landing page. Mirrors the real /sequence
  viewer's "Sequence Viewer" header (RouteViewerHeader) but carries the guest
  funnel actions — Open in Composer, Open TKA, Download — instead of the
  auth/save/publish actions. Follows RouteViewerHeader's grid pattern and reuses
  ViewerOverflowMenu for the title-triggered menu.

  Desktop / landscape: right cluster = [Open in Composer] + [Open TKA]; title
  menu holds Download. Portrait: right cluster empty; title menu holds Open in
  Composer · Download · Open TKA. The centered title is always the menu trigger,
  matching the app.
-->
<script lang="ts">
  import ViewerOverflowMenu from "./ViewerOverflowMenu.svelte";

  interface Props {
    isMobile: boolean;
    onOpenInComposer: () => void;
    openTkaHref: string;
    onDownload: () => void;
    downloadBusy?: boolean;
  }

  let {
    isMobile,
    onOpenInComposer,
    openTkaHref,
    onDownload,
    downloadBusy = false,
  }: Props = $props();
</script>

<header class="scan-header" class:mobile={isMobile}>
  {#if isMobile}
    <div class="swipe-handle" aria-hidden="true"></div>
  {/if}

  <div class="header-left"></div>

  {#snippet titleTrigger({ isOpen, hasMenu }: { isOpen: boolean; hasMenu: boolean })}
    <span class="sequence-title">Sequence Viewer</span>
    {#if hasMenu}
      <i class="fas fa-chevron-down title-caret" class:open={isOpen} aria-hidden="true"></i>
    {/if}
  {/snippet}

  <div class="header-center">
    {#if isMobile}
      <ViewerOverflowMenu
        trigger={titleTrigger}
        dropDown
        align="center"
        variant="header"
        onRemix={onOpenInComposer}
        remixLabel="Open in Composer"
        onDownload={onDownload}
        {downloadBusy}
        onOpenApp={() => { location.href = openTkaHref; }}
      />
    {:else}
      <ViewerOverflowMenu
        trigger={titleTrigger}
        dropDown
        align="center"
        variant="header"
        onDownload={onDownload}
        {downloadBusy}
      />
    {/if}
  </div>

  <div class="header-right">
    {#if !isMobile}
      <button type="button" class="cta accent" onclick={onOpenInComposer}>
        <i class="fas fa-pen" aria-hidden="true"></i>
        <span>Open in Composer</span>
      </button>
      <a class="cta ghost" href={openTkaHref}>
        <i class="fas fa-compass" aria-hidden="true"></i>
        <span>Open TKA</span>
      </a>
    {/if}
  </div>
</header>

<style>
  .scan-header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 12px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
    position: relative;
    z-index: 20;
  }

  .scan-header.mobile {
    padding-top: 16px;
    touch-action: pan-y;
  }

  .swipe-handle {
    position: absolute;
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    width: 40px;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }

  .header-left {
    justify-self: start;
  }

  .header-center {
    display: flex;
    justify-content: center;
  }

  .header-right {
    justify-self: end;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sequence-title {
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    white-space: nowrap;
  }

  .scan-header.mobile .sequence-title {
    font-size: var(--font-size-min, 14px);
  }

  .title-caret {
    font-size: 11px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    transition: transform 180ms ease;
    margin-left: 6px;
    flex-shrink: 0;
  }

  .title-caret.open {
    transform: rotate(180deg);
  }

  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 0 16px;
    border-radius: 8px;
    font-weight: 600;
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    text-decoration: none;
    border: none;
    white-space: nowrap;
  }

  .cta.accent {
    background: var(--theme-accent, #6366f1);
    color: #fff;
  }

  .cta.ghost {
    background: rgba(18, 18, 28, 0.85);
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    color: var(--theme-text, #fff);
  }

  .cta:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .title-caret {
      transition: none;
    }
  }
</style>
```

- [ ] **Step 2: Typecheck**

Run: `npm run check:fast`
Expected: no errors in `ScanViewerHeader.svelte`. (Not yet mounted — this only verifies the component compiles.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/ScanViewerHeader.svelte
git commit -m "feat(qr): ScanViewerHeader — Sequence Viewer header for scan page

New guest-funnel header: reuses ViewerOverflowMenu for the title menu,
follows RouteViewerHeader's grid pattern. Not yet mounted.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMU5Yq93Vr7DtpP79QxTck" -- src/lib/shared/sequence-viewer/components/ScanViewerHeader.svelte
```

---

### Task 3: Mount `ScanViewerHeader` in `+page.svelte` + adjust layout grid

**Files:**
- Modify: `src/routes/q/[code]/+page.svelte`

- [ ] **Step 1: Import the component**

After the `ViewerModeBottomBar` import (`:58`), add:

```ts
  import ViewerModeBottomBar from "$lib/shared/sequence-viewer/components/ViewerModeBottomBar.svelte";
  import ScanViewerHeader from "$lib/shared/sequence-viewer/components/ScanViewerHeader.svelte";
```

- [ ] **Step 2: Mount the header as the first child of `.player-layout`**

Find the opening of the player layout (`:685-689`):

```svelte
        <div
          class="player-layout"
          class:sidebar-mode={isSidebarLayout}
          class:with-panel={isSidebarLayout && (qrViewerMode === "animation" || qrViewerMode === "card")}
        >
          {#if isSidebarLayout}
```

Insert the header between the opening `<div>` and the `{#if isSidebarLayout}`:

```svelte
        <div
          class="player-layout"
          class:sidebar-mode={isSidebarLayout}
          class:with-panel={isSidebarLayout && (qrViewerMode === "animation" || qrViewerMode === "card")}
        >
          <ScanViewerHeader
            isMobile={!isSidebarLayout}
            onOpenInComposer={openInComposer}
            openTkaHref={`/browse/gallery?from=scan&code=${shortCode}`}
            onDownload={() => handleExport(ctx)}
            downloadBusy={isExporting}
          />
          {#if isSidebarLayout}
```

- [ ] **Step 3: Add header layout CSS**

In the `<style>` block, directly after the `.player-layout { ... }` rule (`:1036`), add:

```css
  /* Scan header: full-width row atop the player layout at every breakpoint.
     Portrait player-layout centers its children, so opt the header out into a
     full stretch (same trick as .mode-bar-slot). */
  .player-layout :global(.scan-header) {
    align-self: stretch;
    width: 100%;
  }
```

- [ ] **Step 4: Give the sidebar grid a header row**

Replace the `.player-layout.sidebar-mode` rule (`:1082-1091`):

```css
  .player-layout.sidebar-mode {
    display: grid;
    /* rail (auto) | canvas (flex). Mirrors the desktop viewer: no permanent
       right panel — Side-by-Side / Card / Mandala fill the full width. */
    grid-template-columns: auto 1fr;
    grid-template-rows: 1fr;
    align-items: stretch;
    padding: 8px 12px;
    gap: 8px;
  }
```

with (adds a top `auto` row for the header):

```css
  .player-layout.sidebar-mode {
    display: grid;
    /* header (full width) on top; below: rail (auto) | canvas (flex). Mirrors
       the desktop viewer: no permanent right panel — Side-by-Side / Card /
       Mandala fill the full width. */
    grid-template-columns: auto 1fr;
    grid-template-rows: auto 1fr;
    align-items: stretch;
    padding: 8px 12px;
    gap: 8px;
  }

  .sidebar-mode :global(.scan-header) {
    grid-column: 1 / -1;
    grid-row: 1;
  }
```

- [ ] **Step 5: Move the body grid items to row 2**

Replace the three body-placement rules (`:1100-1117`):

```css
  /* The view-switcher rail owns the first column at landscape/desktop widths. */
  .sidebar-mode :global(.content-rail) {
    grid-column: 1;
    grid-row: 1;
  }

  .sidebar-mode .canvas-area {
    grid-column: 2;
    grid-row: 1;
    max-width: none;
    min-height: 0;
  }

  .sidebar-mode .controls-column {
    grid-column: 3;
    grid-row: 1;
    max-width: none;
    overflow: hidden;
  }
```

with (row 1 → row 2):

```css
  /* The view-switcher rail owns the first column at landscape/desktop widths. */
  .sidebar-mode :global(.content-rail) {
    grid-column: 1;
    grid-row: 2;
  }

  .sidebar-mode .canvas-area {
    grid-column: 2;
    grid-row: 2;
    max-width: none;
    min-height: 0;
  }

  .sidebar-mode .controls-column {
    grid-column: 3;
    grid-row: 2;
    max-width: none;
    overflow: hidden;
  }
```

- [ ] **Step 6: Typecheck**

Run: `npm run check:fast`
Expected: no errors in `+page.svelte`.

- [ ] **Step 7: Visual verify (header appears, both breakpoints)**

Load `https://localhost:5173/q/9DQN`. Confirm: header row reads "Sequence Viewer ▾" at top; on a wide window the right cluster shows [Open in Composer] + [Open TKA]; narrow the window under 960px → CTAs vanish, title menu remains. The old floating cluster / rail-footer are still present at this step (removed in Task 4) — expect temporary duplication.

- [ ] **Step 8: Commit**

```bash
git add src/routes/q/[code]/+page.svelte
git commit -m "feat(qr): mount ScanViewerHeader atop the scan player layout

Adds the header row to the sidebar grid and full-width stretch in portrait.
Duplicate legacy spawn points removed in the next commit.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMU5Yq93Vr7DtpP79QxTck" -- "src/routes/q/[code]/+page.svelte"
```

---

### Task 4: Remove the 4 duplicate spawn points

**Files:**
- Modify: `src/routes/q/[code]/+page.svelte`

- [ ] **Step 1: Remove the `ViewerContentRail` footerAction (dup #3)**

Replace the rail block (`:694-704`):

```svelte
            <ViewerContentRail
              activeMode={qrViewerMode}
              webgl2Available={false}
              onSelectMode={selectQrMode}
              onSelectSplit={selectQrSplit}
              footerAction={{
                label: "Open TKA",
                icon: "fa-compass",
                href: `/browse/gallery?from=scan&code=${shortCode}`,
              }}
            />
```

with:

```svelte
            <ViewerContentRail
              activeMode={qrViewerMode}
              webgl2Available={false}
              onSelectMode={selectQrMode}
              onSelectSplit={selectQrSplit}
            />
```

- [ ] **Step 2: Remove the floating CTA cluster + portrait overflow (dups #1, #2)**

Delete the entire `{#if isSidebarLayout} ... {:else} ... {/if}` block inside `.canvas-area` (`:744-772`) — both branches:

```svelte
            {#if isSidebarLayout}
              <!-- Landscape/desktop has no bottom dock outside animation mode,
                   so the scan page's two exits float over the stage. -->
              <div class="scan-cta-cluster">
                <button class="cta-button" onclick={openInComposer}>
                  <i class="fas fa-pen" aria-hidden="true"></i>
                  Open in Composer
                </button>
                <a class="cta-button ghost" href={`/browse/gallery?from=scan&code=${shortCode}`}>
                  <i class="fas fa-compass" aria-hidden="true"></i>
                  Open TKA
                </a>
              </div>
            {:else}
              <!-- Portrait: the funnel actions live in a floating "…" menu over
                   the stage — mirroring the viewer's mobile header overflow — so
                   the panes keep the full body height. Reuses ViewerOverflowMenu. -->
              <div class="scan-overflow">
                <ViewerOverflowMenu
                  variant="header"
                  dropDown
                  align="right"
                  onRemix={openInComposer}
                  onDownload={() => handleExport(ctx)}
                  downloadBusy={isExporting}
                  onOpenApp={() => goto(`/browse/gallery?from=scan&code=${shortCode}`)}
                />
              </div>
            {/if}
```

Delete all of it (nothing replaces it — the header owns these now).

- [ ] **Step 3: Remove the now-unused `ViewerOverflowMenu` import**

Delete the import line (`:68`):

```ts
  import ViewerOverflowMenu from "$lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte";
```

- [ ] **Step 4: Neutralize the AnimationPanel secondaryActions (dup #4)**

Replace the `secondaryActions` prop (`:814-819`):

```svelte
                  secondaryActions={isSidebarLayout
                    ? [
                        { label: "Remix", icon: "fa-pen", onClick: openInComposer, accent: true },
                        { label: "Open TKA", href: `/browse/gallery?from=scan&code=${shortCode}`, icon: "fa-compass" },
                      ]
                    : []}
```

with:

```svelte
                  secondaryActions={[]}
```

- [ ] **Step 5: Remove the dead CSS**

Delete the `.scan-cta-cluster` rule (`:958-967`) and the `.scan-overflow` rule (`:969-976`), including their comment blocks:

```css
  /* Floating exits over the stage (sidebar/landscape only — portrait gets
     the same two actions in the bottom ControlDock). */
  .scan-cta-cluster {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 10;
    display: flex;
    gap: 8px;
  }

  /* Portrait: floating "…" overflow over the stage (zero layout height) so the
     panes keep the full body. Mirrors the viewer's mobile header overflow. */
  .scan-overflow {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
  }
```

Keep `.cta-button` and `.cta-button.ghost` — the error-state screen still uses them (`:653-671`).

- [ ] **Step 6: Grep the diff — no funnel spawn points remain**

Run:
```bash
grep -nE "scan-cta-cluster|scan-overflow|footerAction|secondaryActions=\{isSidebarLayout" "src/routes/q/[code]/+page.svelte"
```
Expected: no output (empty). Also confirm no stray `ViewerOverflowMenu` usage:
```bash
grep -n "ViewerOverflowMenu" "src/routes/q/[code]/+page.svelte"
```
Expected: no output.

- [ ] **Step 7: Typecheck**

Run: `npm run check:fast`
Expected: no errors; no "unused import" for `ViewerOverflowMenu`.

- [ ] **Step 8: Commit**

```bash
git add "src/routes/q/[code]/+page.svelte"
git commit -m "refactor(qr): remove 4 duplicate funnel-action spawn points

Header now owns Open in Composer / Open TKA / Download. Drops the floating
CTA cluster, the portrait floating overflow, the ViewerContentRail
footerAction dup, and the AnimationPanel secondaryActions.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMU5Yq93Vr7DtpP79QxTck" -- "src/routes/q/[code]/+page.svelte"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck (one cold run, captured)**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "error" /tmp/check.log`
Expected: no errors attributable to `ScanViewerHeader.svelte`, `ViewerOverflowMenu.svelte`, or `q/[code]/+page.svelte`.

- [ ] **Step 2: Desktop/landscape behavior**

Load `https://localhost:5173/q/9DQN` in a wide window. Confirm:
- Header top row: "Sequence Viewer ▾" centered; right cluster [Open in Composer] (accent) + [Open TKA] (ghost).
- No floating cluster over the stage. Rail has no bottom "Open TKA".
- Click the title → menu shows **Download** only. Click Download → export runs, item flips to "Preparing…".
- Click [Open in Composer] → navigates to `/create/construct?sheet=auth`.
- Click [Open TKA] → navigates to `/browse/gallery?from=scan&code=9DQN`.
- Switch to 2D Animation mode → the right Effects panel has no Remix / Open TKA secondary buttons.

- [ ] **Step 3: Portrait behavior**

Narrow the window under 960px (or device-emulate a phone). Confirm:
- Header shows "Sequence Viewer ▾"; right cluster empty; no floating "…" over the stage.
- Title menu shows **Open in Composer · Download · Open TKA** in that order.
- Each item routes as in Step 2.

- [ ] **Step 4: Report**

Capture a screenshot or ask the user to confirm both breakpoints match the spec's Verification section. Report the `npm run check` result verbatim.
