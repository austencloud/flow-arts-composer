# Viewer Header / Action-Surface Unification — Implementation Plan (Increment 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three drifting viewer header/action surfaces onto one gated action builder + one profiled `ViewerHeader`, so the `/q` scan page and the `/sequence` viewer draw their actions from a single source.

**Architecture:** A pure `viewer-actions.ts` derives the gated callback set (favorite/save/remix/download/open/video/publish/unpublish/delete) from the orchestrator `ctx` + a `'full' | 'scan'` profile, applying every gate **once**. A new profiled `ViewerHeader.svelte` (merging the near-identical `RouteViewerHeader` + `ScanViewerHeader`) renders it. Both route pages adopt `ViewerHeader`; `SequenceViewerDrawerHost`'s inline modal header adopts the same builder for its overflow menu. Behavior-preserving: with `/q` still `forceGuest`, the scan surface renders exactly today's funnel actions; the owner/auth branches stay dormant until Increment 3 drops `forceGuest`.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest (unit tests for the pure builder), Chrome DevTools MCP (visual parity verification).

This is **Increment 1** of the design spec
`docs/superpowers/specs/active/2026-07-02-viewer-scan-chrome-unification-design.md`.
Increments 2 (`ViewerControls` per-mode mounting), 3 (auth-aware `/q`), and 4
(lazy 3D + Practice on `/q`) are separate follow-on plans — each ships working
software on its own. Do not start them here.

---

## File Structure

- **Create** `src/lib/shared/sequence-viewer/services/viewer-actions.ts` — the pure gated action builder + its types. Single source of truth for "which actions exist and when."
- **Create** `src/lib/shared/sequence-viewer/services/viewer-actions.test.ts` — unit tests asserting the gate table across guest / signed-in / owner / admin combinations (the spec's named risk: an owner action must never leak to a guest).
- **Create** `src/lib/shared/sequence-viewer/components/ViewerHeader.svelte` — one profiled header (`profile: 'full' | 'scan'`) replacing `RouteViewerHeader` + `ScanViewerHeader`. Center title→`ViewerOverflowMenu` (shared), profile-branched left/right clusters.
- **Modify** `src/routes/sequence/[id]/+page.svelte:539-562` — swap `RouteViewerHeader` for `<ViewerHeader profile="full" …>`.
- **Modify** `src/routes/q/[code]/+page.svelte:690-696` — swap `ScanViewerHeader` for `<ViewerHeader profile="scan" …>`.
- **Modify** `src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte` — feed its inline-header `ViewerOverflowMenu` from `buildHeaderActions(ctx, 'full', …)` instead of hand-computed props (de-drift the actions; leave the modal header markup as-is).
- **Delete** `src/lib/shared/sequence-viewer/components/RouteViewerHeader.svelte` and `ScanViewerHeader.svelte` after both routes migrate and typecheck passes.

**Never-hand-roll check:** `ViewerOverflowMenu.svelte` already builds the menu item list from optional callback props (`:148-238`) — it is reused as-is, not rebuilt. The two route headers are near-identical (both CSS-grid `1fr auto 1fr`, both title→`ViewerOverflowMenu`); merging them is de-duplication, not new construction. `viewer-actions.ts` is new because grep of `src/lib/shared/sequence-viewer/services/` shows no existing action/gate builder — the gating lives inline in each header + each route today (`RouteViewerHeader.svelte:167-183`, `/sequence/[id]/+page.svelte:548-561`, `ScanViewerHeader.svelte:51-70`).

---

## Task 1: The gated action builder (`viewer-actions.ts`)

**Files:**
- Create: `src/lib/shared/sequence-viewer/services/viewer-actions.ts`
- Test: `src/lib/shared/sequence-viewer/services/viewer-actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/sequence-viewer/services/viewer-actions.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildHeaderActions, type ViewerHeaderProfile } from "./viewer-actions";

// Minimal ctx stub — only the fields buildHeaderActions reads.
function makeCtx(over: Partial<Record<string, unknown>> = {}) {
  return {
    isFavorite: false,
    isSaved: true,
    isPublished: false,
    isOwned: false,
    isLoggedIn: false,
    practiceActive: false,
    invokeGatedAction: vi.fn((_id: string, run: () => void) => run()),
    handleFavoriteToggle: vi.fn(),
    handleSave: vi.fn(),
    handleEdit: vi.fn(),
    handlePublishAction: vi.fn(),
    handleUnpublishAction: vi.fn(),
    handleVideoUpload: vi.fn(),
    enterPracticeMode: vi.fn(),
    exitPracticeMode: vi.fn(),
    ...over,
  } as never;
}

const wiring = {
  onDeleteRequest: () => {},
  onDownload: () => {},
  onOpenInComposer: () => {},
  openAppHref: "/browse/gallery",
};

describe("buildHeaderActions", () => {
  it("scan + guest: only funnel actions, no owner/engagement", () => {
    const a = buildHeaderActions(makeCtx(), "scan", wiring);
    expect(a.onRemix).toBeTypeOf("function"); // Open in Composer
    expect(a.remixLabel).toBe("Open in Composer");
    expect(a.onDownload).toBeTypeOf("function");
    expect(a.onOpenApp).toBeTypeOf("function");
    // Engagement + owner surfaces hidden for a cold guest:
    expect(a.onFavoriteToggle).toBeUndefined();
    expect(a.onSave).toBeUndefined();
    expect(a.onVideoUpload).toBeUndefined();
    expect(a.onPublish).toBeUndefined();
    expect(a.onDeleteRequest).toBeUndefined();
    expect(a.showPractice).toBe(false);
  });

  it("full + guest: engagement offered (login-prompt), no owner management", () => {
    const a = buildHeaderActions(makeCtx(), "full", wiring);
    expect(a.onFavoriteToggle).toBeTypeOf("function");
    expect(a.onRemix).toBeTypeOf("function"); // Remix (edit), not composer
    expect(a.remixLabel).toBeUndefined();
    expect(a.showPractice).toBe(true);
    expect(a.onPublish).toBeUndefined();
    expect(a.onUnpublish).toBeUndefined();
    expect(a.onDeleteRequest).toBeUndefined();
    expect(a.onVideoUpload).toBeUndefined();
  });

  it("owner + signed in + saved: management actions light up", () => {
    const a = buildHeaderActions(
      makeCtx({ isOwned: true, isSaved: true, isLoggedIn: true }),
      "full",
      wiring,
    );
    expect(a.onPublish).toBeTypeOf("function");
    expect(a.onUnpublish).toBeTypeOf("function");
    expect(a.onDeleteRequest).toBeTypeOf("function");
    expect(a.onVideoUpload).toBeTypeOf("function");
  });

  it("owner not yet saved: no publish/delete (gate is isOwned && isSaved)", () => {
    const a = buildHeaderActions(
      makeCtx({ isOwned: true, isSaved: false, isLoggedIn: true }),
      "full",
      wiring,
    );
    expect(a.onPublish).toBeUndefined();
    expect(a.onDeleteRequest).toBeUndefined();
    expect(a.onSave).toBeTypeOf("function"); // Save IS offered when unsaved
  });

  it("scan + signed-in owner: engagement + management appear on scan too", () => {
    const a = buildHeaderActions(
      makeCtx({ isOwned: true, isSaved: true, isLoggedIn: true }),
      "scan",
      wiring,
    );
    // Funnel still present:
    expect(a.onOpenApp).toBeTypeOf("function");
    // Owner surface now lit (this is the Increment-3 outcome; the builder
    // already supports it — scan just needs forceGuest dropped to reach here):
    expect(a.onFavoriteToggle).toBeTypeOf("function");
    expect(a.onPublish).toBeTypeOf("function");
    expect(a.onDeleteRequest).toBeTypeOf("function");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/shared/sequence-viewer/services/viewer-actions.test.ts`
Expected: FAIL — `Cannot find module './viewer-actions'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/shared/sequence-viewer/services/viewer-actions.ts
import type { OrchestratorContext } from "../components/SequenceViewerOrchestrator.svelte";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";

export type ViewerHeaderProfile = "full" | "scan";

/**
 * Handlers the orchestrator `ctx` cannot own — page-local wiring. `full` passes
 * `onDeleteRequest` (opens the page's confirm dialog); `scan` passes the funnel
 * handlers (its own export + composer handoff + explore-home href).
 */
export interface ViewerActionWiring {
  onDeleteRequest?: () => void;
  onDownload?: () => void;
  downloadBusy?: boolean;
  onOpenInComposer?: () => void;
  openAppHref?: string;
}

/**
 * The exact gated prop-set both header surfaces feed to `ViewerOverflowMenu`
 * (and their desktop right-cluster). `undefined` handler = the action is hidden.
 */
export interface ViewerHeaderActions {
  isFavorite: boolean;
  isSaved: boolean;
  isPublished: boolean;
  practiceActive: boolean;
  showPractice: boolean;
  onFavoriteToggle?: () => void;
  onSave?: () => void;
  onRemix?: () => void;
  remixLabel?: string;
  onDownload?: () => void;
  downloadBusy?: boolean;
  onOpenApp?: () => void;
  onVideoUpload?: () => void;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onDeleteRequest?: () => void;
  onCopyData?: () => void;
}

/**
 * Single source of truth for which viewer actions exist and when. Gate rules
 * (grounded in SequenceViewerOrchestrator.svelte:400,1060):
 *   - Funnel (scan only): Open-in-Composer (as Remix), Download, Open TKA.
 *   - Engagement (favorite/save/remix/practice): always on `full` (a guest tap
 *     prompts login via invokeGatedAction). On `scan` these appear only once the
 *     scanner is a signed-in user — a cold guest sees only funnel actions
 *     (behavior-preserving vs today's ScanViewerHeader). When forceGuest is
 *     dropped (Increment 3), a signed-in owner's scan lights these up with no
 *     extra wiring.
 *   - Management (video/publish/unpublish/delete): gated by ctx eligibility
 *     (isLoggedIn / isOwned && isSaved), profile-independent.
 *   - Copy Data: admin only.
 */
export function buildHeaderActions(
  ctx: OrchestratorContext,
  profile: ViewerHeaderProfile,
  wiring: ViewerActionWiring = {},
): ViewerHeaderActions {
  const ownerCanManage = ctx.isOwned && ctx.isSaved;
  const showEngagement = profile === "full" || ctx.isLoggedIn;

  const a: ViewerHeaderActions = {
    isFavorite: ctx.isFavorite,
    isSaved: ctx.isSaved,
    isPublished: ctx.isPublished,
    practiceActive: ctx.practiceActive,
    showPractice: showEngagement,
  };

  // Funnel — scan surface only.
  if (profile === "scan") {
    a.onRemix = wiring.onOpenInComposer;
    a.remixLabel = "Open in Composer";
    a.onDownload = wiring.onDownload;
    a.downloadBusy = wiring.downloadBusy;
    a.onOpenApp = wiring.openAppHref
      ? () => { location.href = wiring.openAppHref!; }
      : undefined;
  }

  // Engagement.
  if (showEngagement) {
    a.onFavoriteToggle = () =>
      ctx.invokeGatedAction("favorite", ctx.handleFavoriteToggle);
    a.onSave = () => ctx.invokeGatedAction("save", ctx.handleSave);
    // On scan, Remix already routes to the composer (funnel); keep it.
    if (profile === "full") {
      a.onRemix = () => ctx.invokeGatedAction("remix", ctx.handleEdit);
    }
    a.onPracticeToggle = () =>
      ctx.practiceActive ? ctx.exitPracticeMode() : ctx.enterPracticeMode();
  }

  // Management.
  if (ctx.isLoggedIn) a.onVideoUpload = () => ctx.handleVideoUpload();
  if (ownerCanManage) {
    a.onPublish = () =>
      ctx.invokeGatedAction("publish", ctx.handlePublishAction);
    a.onUnpublish = ctx.handleUnpublishAction;
    a.onDeleteRequest = wiring.onDeleteRequest;
  }

  return a;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/shared/sequence-viewer/services/viewer-actions.test.ts`
Expected: PASS (5 tests). If `onSave` assertions fail, note `ViewerOverflowMenu`
itself hides Save when `isSaved` (`:159`); the builder still passes `onSave` and
lets the menu gate visibility — the test asserts the *builder*, which always
provides it when `showEngagement`, so keep `onSave` set in both the saved and
unsaved cases and let the menu hide it. (The "not yet saved" test asserts it is a
function; add no `!isSaved` guard in the builder.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/services/viewer-actions.ts src/lib/shared/sequence-viewer/services/viewer-actions.test.ts
git commit -m "feat(viewer): gated action builder shared by all header surfaces -- src/lib/shared/sequence-viewer/services/viewer-actions.ts src/lib/shared/sequence-viewer/services/viewer-actions.test.ts"
```

---

## Task 2: Profiled `ViewerHeader.svelte`

**Files:**
- Create: `src/lib/shared/sequence-viewer/components/ViewerHeader.svelte`
- Reference (read, do not modify yet): `RouteViewerHeader.svelte` (full markup + CSS to reuse), `ScanViewerHeader.svelte` (scan CTA cluster + CSS to reuse), `ViewerOverflowMenu.svelte` (the menu primitive + its prop names).

- [ ] **Step 1: Create the component**

The component merges the two route headers. Center is identical (title →
`ViewerOverflowMenu` fed by `buildHeaderActions`). Left/right clusters branch on
`profile`. Copy the CSS wholesale from `RouteViewerHeader.svelte:257-478` (it is
the superset — grid header, back button, action buttons, practice pills, title,
caret, swipe handle) and add the two `.cta` rules from
`ScanViewerHeader.svelte:157-187`. Script + template:

```svelte
<!--
  ViewerHeader.svelte

  One profiled header for every non-modal viewer surface. profile="full" is the
  /sequence route header (back nav, engagement + management actions); profile="scan"
  is the /q QR-scan header (guest funnel: Open in Composer / Download / Open TKA).
  Both derive their ViewerOverflowMenu prop-set from buildHeaderActions so the
  action gating lives in exactly one place (viewer-actions.ts). Center title IS
  the menu trigger, matching the app.
-->
<script lang="ts">
  import type { OrchestratorContext } from "./SequenceViewerOrchestrator.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { getClaudeCodeCopier } from "$lib/shared/browse/get-claude-code-copier";
  import MotionVisibilityToggle from "./MotionVisibilityToggle.svelte";
  import ViewerOverflowMenu from "./ViewerOverflowMenu.svelte";
  import { buildHeaderActions, type ViewerHeaderProfile } from "../services/viewer-actions";

  interface Props {
    profile: ViewerHeaderProfile;
    ctx: OrchestratorContext;
    isMobile: boolean;
    isFullscreen?: boolean;
    sequence?: SequenceData | null;
    // full-profile wiring
    editingPane?: "animation" | "image" | "video-upload" | null;
    returnLabel?: string;
    homeHref?: string;
    onDeleteRequest?: () => void;
    // scan-profile wiring
    onOpenInComposer?: () => void;
    openAppHref?: string;
    onDownload?: () => void;
    downloadBusy?: boolean;
  }

  let {
    profile,
    ctx,
    isMobile,
    isFullscreen = false,
    sequence = null,
    editingPane = null,
    returnLabel = "Back",
    homeHref,
    onDeleteRequest,
    onOpenInComposer,
    openAppHref,
    onDownload,
    downloadBusy = false,
  }: Props = $props();

  const actions = $derived(
    buildHeaderActions(ctx, profile, {
      onDeleteRequest,
      onOpenInComposer,
      openAppHref,
      onDownload,
      downloadBusy,
    }),
  );

  const practiceActive = $derived(ctx.practiceActive);

  let copyClaudeFeedback = $state(false);
  async function handleCopyForClaude() {
    if (!sequence) return;
    try {
      await getClaudeCodeCopier().copyForClaude(sequence);
      copyClaudeFeedback = true;
      setTimeout(() => { copyClaudeFeedback = false; }, 1500);
    } catch (error) {
      console.error("[ViewerHeader] Copy for Claude failed:", error);
    }
  }
</script>

<header
  class="route-header"
  class:mobile={isMobile}
  class:export-header={!!editingPane}
  data-hidden={isFullscreen}
>
  {#if isMobile && !editingPane}
    <div class="swipe-handle" aria-hidden="true"></div>
  {/if}

  <div class="header-left">
    {#if profile === "full"}
      <button type="button" class="back-button" onclick={ctx.onClose}
        aria-label={editingPane ? "Close viewer" : `Back to ${returnLabel}`}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        {#if !isMobile && !editingPane}<span class="back-label">{returnLabel}</span>{/if}
      </button>
      {#if homeHref && !editingPane && !practiceActive}
        <a href={homeHref} class="header-action-btn explore" aria-label="Explore TKA" title="Explore TKA">
          <i class="fas fa-compass" aria-hidden="true"></i>
        </a>
      {/if}
      {#if practiceActive}
        <button type="button" class="header-action-btn practice-exit"
          onclick={actions.onPracticeToggle} aria-label="Exit practice mode">
          <i class="fas fa-arrow-left" aria-hidden="true"></i><span>Exit Practice</span>
        </button>
      {/if}
    {/if}
  </div>

  {#snippet titleTrigger({ isOpen, hasMenu }: { isOpen: boolean; hasMenu: boolean })}
    {#if editingPane}
      <span class="sequence-title">
        {#if editingPane === "animation"}Download Animation
        {:else if editingPane === "image"}Download Card
        {:else}Upload Video{/if}
      </span>
    {:else}
      <span class="title-group">
        <span class="sequence-title">Sequence Viewer</span>
        {#if isMobile && profile === "scan"}<span class="export-hint">Tap for options</span>{/if}
      </span>
    {/if}
    {#if hasMenu}
      <i class="fas fa-chevron-down title-caret" class:open={isOpen} aria-hidden="true"></i>
    {/if}
  {/snippet}

  <div class="header-center">
    {#if practiceActive}
      <div class="title-group"><h2 class="sequence-title">Practice Mode</h2></div>
    {:else}
      <ViewerOverflowMenu
        trigger={titleTrigger}
        dropDown
        align="center"
        variant="header"
        sequenceId={sequence?.id}
        isFavorite={actions.isFavorite}
        onFavoriteToggle={isMobile ? actions.onFavoriteToggle : undefined}
        isSaved={actions.isSaved}
        onSave={isMobile ? actions.onSave : undefined}
        onRemix={actions.onRemix}
        remixLabel={actions.remixLabel}
        onDownload={actions.onDownload}
        downloadBusy={actions.downloadBusy}
        onOpenApp={actions.onOpenApp}
        onVideoUpload={actions.onVideoUpload}
        isPublished={actions.isPublished}
        onPublish={actions.onPublish}
        onUnpublish={actions.onUnpublish}
        onDeleteRequest={actions.onDeleteRequest}
      />
    {/if}
  </div>

  <div class="header-right">
    {#if profile === "scan" && !isMobile}
      {#if onOpenInComposer}
        <button type="button" class="cta accent" onclick={onOpenInComposer}>
          <i class="fas fa-pen" aria-hidden="true"></i><span>Open in Composer</span>
        </button>
      {/if}
      {#if openAppHref}
        <a class="cta ghost" href={openAppHref}>
          <i class="fas fa-compass" aria-hidden="true"></i><span>Open TKA</span>
        </a>
      {/if}
    {:else if profile === "full" && !practiceActive}
      {#if !isMobile && actions.onFavoriteToggle}
        <button type="button" class="header-action-btn" class:favorited={actions.isFavorite}
          onclick={actions.onFavoriteToggle}
          aria-label={actions.isFavorite ? "Remove from favorites" : "Add to favorites"}>
          <i class="fas fa-heart" aria-hidden="true"></i>
        </button>
      {/if}
      {#if !isMobile && !actions.isSaved && actions.onSave}
        <button type="button" class="header-action-btn save" onclick={actions.onSave} aria-label="Save sequence">
          <i class="fas fa-floppy-disk" aria-hidden="true"></i>
        </button>
      {/if}
      {#if !isMobile && actions.onRemix}
        <button type="button" class="header-action-btn remix" onclick={actions.onRemix} aria-label="Remix">
          <i class="fas fa-pen-to-square" aria-hidden="true"></i>
        </button>
      {/if}
      {#if actions.showPractice && actions.onPracticeToggle}
        <button type="button" class="header-action-btn practice" class:icon-only={isMobile}
          onclick={actions.onPracticeToggle} aria-label="Practice">
          <i class="fas fa-dumbbell" aria-hidden="true"></i>{#if !isMobile}<span>Practice</span>{/if}
        </button>
      {/if}
      <span class="header-action-divider"></span>
      <MotionVisibilityToggle />
      {#if authState.isAdmin}
        <button type="button" class="header-action-btn" onclick={handleCopyForClaude}
          aria-label="Copy sequence data for Claude" title="Copy for Claude">
          <i class="fas {copyClaudeFeedback ? 'fa-check' : 'fa-terminal'}" aria-hidden="true"></i>
        </button>
      {/if}
    {/if}
  </div>
</header>

<style>
  /* Copy verbatim from RouteViewerHeader.svelte:258-477 (the full superset:
     .route-header grid, [data-hidden], .swipe-handle, .mobile, .header-left/
     -right/-center, .back-button/.back-label, .header-action-btn + variants
     (.favorited/.save/.remix/.practice/.practice-exit/.explore), .header-action-
     divider, .title-group, .sequence-title, .export-hint, .title-caret, the
     reduced-motion blocks). THEN append the two scan CTA rules from
     ScanViewerHeader.svelte:157-187 (.cta, .cta.accent, .cta.ghost, .cta:focus-
     visible). No new CSS is authored — this is a mechanical merge of the two
     source stylesheets, which already share class names. */
</style>
```

- [ ] **Step 2: Typecheck the component in isolation (warm checker)**

Run: `npm run check:fast`
Expected: no new errors referencing `ViewerHeader.svelte`. Fix any prop-type
mismatches against `ViewerOverflowMenu`'s prop names (`onFavoriteToggle`,
`onOpenApp`, `remixLabel`, `downloadBusy` — verified in `ViewerOverflowMenu.svelte:41-97`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/ViewerHeader.svelte
git commit -m "feat(viewer): profiled ViewerHeader (full|scan) on shared action builder -- src/lib/shared/sequence-viewer/components/ViewerHeader.svelte"
```

---

## Task 3: Migrate `/q` scan page to `ViewerHeader`

**Files:**
- Modify: `src/routes/q/[code]/+page.svelte` (import at `:59`, usage at `:690-696`)

- [ ] **Step 1: Swap the import**

Replace line 59:
```svelte
  import ScanViewerHeader from "$lib/shared/sequence-viewer/components/ScanViewerHeader.svelte";
```
with:
```svelte
  import ViewerHeader from "$lib/shared/sequence-viewer/components/ViewerHeader.svelte";
```

- [ ] **Step 2: Swap the usage**

Replace the `<ScanViewerHeader … />` block at `:690-696` with:
```svelte
          <ViewerHeader
            profile="scan"
            {ctx}
            isMobile={!isSidebarLayout}
            sequence={resolvedSeq}
            onOpenInComposer={openInComposer}
            openAppHref={`/browse/gallery?from=scan&code=${shortCode}`}
            onDownload={() => handleExport(ctx)}
            downloadBusy={isExporting}
          />
```

- [ ] **Step 3: Verify live parity (scan)**

Dev server is on 5173. In Chrome DevTools MCP, load `https://localhost:5173/q/003N`
at 390×844 (a real short code; `003N` = word "AAAA"). Confirm: the header shows
the "Sequence Viewer" title as the menu trigger; tapping it opens Open in
Composer · Download · Open TKA (unchanged from today — `/q` is still `forceGuest`,
so no owner actions appear). Screenshot it.

- [ ] **Step 4: Commit**

```bash
git add src/routes/q/[code]/+page.svelte
git commit -m "refactor(qr): scan page uses profiled ViewerHeader -- src/routes/q/[code]/+page.svelte"
```

---

## Task 4: Migrate `/sequence/[id]` to `ViewerHeader`

**Files:**
- Modify: `src/routes/sequence/[id]/+page.svelte` (import at `:40`, usage at `:539-562`)

- [ ] **Step 1: Swap the import**

Replace line 40:
```svelte
  import RouteViewerHeader from "$lib/shared/sequence-viewer/components/RouteViewerHeader.svelte";
```
with:
```svelte
  import ViewerHeader from "$lib/shared/sequence-viewer/components/ViewerHeader.svelte";
```

- [ ] **Step 2: Swap the usage**

Replace the `<RouteViewerHeader … />` block at `:539-562` with:
```svelte
        <ViewerHeader
          profile="full"
          {ctx}
          {isMobile}
          isFullscreen={ctx.isFullscreen}
          editingPane={ctx.editingPane}
          returnLabel={handoffData?.returnLabel || "Back"}
          homeHref="/browse/gallery"
          sequence={sequence}
          onDeleteRequest={() => (deleteConfirmOpen = true)}
        />
```

Note: `onClose`, `onExitEditMode`, favorite/save/remix/practice/video/publish/
unpublish handlers are now derived inside `ViewerHeader` from `ctx` +
`buildHeaderActions` — they are no longer passed here. `deleteConfirmOpen` is the
existing page-local state (unchanged).

- [ ] **Step 3: Verify live parity (full viewer)**

In Chrome DevTools MCP, load a `/sequence/[id]` route (use any sequence the app
links to, e.g. from `https://localhost:5173/browse/gallery` → open a card) at both
mobile (390×844) and desktop (1280×800). Confirm the header renders the same
actions as before this change: back nav, title-menu (favorite/save/remix/video/
publish/delete per current auth state), desktop right cluster (favorite/save/remix/
practice + motion toggle + admin copy if admin). Screenshot both.

- [ ] **Step 4: Full typecheck**

Run: `npm run check > /tmp/check.log 2>&1` then `grep -niE "error" /tmp/check.log`
Expected: no errors (the cross-file rename removed both old header usages).

- [ ] **Step 5: Commit**

```bash
git add src/routes/sequence/[id]/+page.svelte
git commit -m "refactor(viewer): /sequence route uses profiled ViewerHeader -- src/routes/sequence/[id]/+page.svelte"
```

---

## Task 5: De-drift the DrawerHost inline-header actions

The modal viewer's inline header (`SequenceViewerDrawerHost.svelte:422-549`) keeps
its own markup (it is the modal variant with the export-settings toggle + close),
but its `ViewerOverflowMenu` should read from the same builder so the *action set*
can't drift from the routes.

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte`

- [ ] **Step 1: Import the builder**

Add near the other imports:
```svelte
  import { buildHeaderActions } from "../services/viewer-actions";
```

- [ ] **Step 2: Derive the actions**

In the `<script>`, add:
```svelte
  const headerActions = $derived(
    buildHeaderActions(ctx, "full", { onDeleteRequest: () => (deleteConfirmOpen = true) }),
  );
```
(Use the same `ctx` the children snippet exposes; if the header markup is inside
the `{#snippet children(ctx)}` scope, derive `headerActions` there instead — the
executor: place the `$derived` in whichever scope `ctx` is in view.)

- [ ] **Step 3: Feed the overflow menu from the builder**

In the `overflowMenu` snippet (`:393-420`), replace the hand-computed props
(`onFavoriteToggle`/`onSave`/`onRemix`/`onVideoUpload`/`onPublish`/`onUnpublish`/
`onDeleteRequest` and their inline gates) with the matching `headerActions.*`
fields. Leave `motionVisibility`, `onCopyData` (admin), and the `includeMotion`
handling exactly as they are — those are DrawerHost-specific and out of scope for
this de-drift. Do not change the left/right inline action buttons in this task
(markup stays; only the overflow menu's data source changes).

- [ ] **Step 4: Verify no behavior change**

Run: `npm run check:fast` (no new errors). Then in DevTools MCP open the in-app
modal viewer (from `https://localhost:5173/browse/gallery` open a sequence into the
viewer overlay) and confirm the overflow menu shows the same items as before.
Screenshot.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte
git commit -m "refactor(viewer): DrawerHost overflow reads shared action builder -- src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte"
```

---

## Task 6: Delete the superseded headers

**Files:**
- Delete: `src/lib/shared/sequence-viewer/components/RouteViewerHeader.svelte`
- Delete: `src/lib/shared/sequence-viewer/components/ScanViewerHeader.svelte`

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rniE "RouteViewerHeader|ScanViewerHeader" src` (via the Grep tool).
Expected: zero matches (both routes migrated in Tasks 3–4).

- [ ] **Step 2: Delete both files**

```bash
git rm src/lib/shared/sequence-viewer/components/RouteViewerHeader.svelte src/lib/shared/sequence-viewer/components/ScanViewerHeader.svelte
```

- [ ] **Step 3: Full check + unit tests**

Run: `npm run check > /tmp/check.log 2>&1` then `grep -niE "error" /tmp/check.log` (expect none).
Run: `npx vitest run src/lib/shared/sequence-viewer/services/viewer-actions.test.ts` (expect PASS).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(viewer): remove RouteViewerHeader + ScanViewerHeader (superseded by ViewerHeader) -- src/lib/shared/sequence-viewer/components/RouteViewerHeader.svelte src/lib/shared/sequence-viewer/components/ScanViewerHeader.svelte"
```

---

## Self-Review (completed)

- **Spec coverage (Increment 1 = "Action catalog + ViewerActions"):** `viewer-actions.ts` is the catalog (Task 1); `ViewerHeader` is the rendering surface for both profiles (Task 2); routes + DrawerHost adopt it (Tasks 3–5); drift sources deleted (Task 6). The spec's Increment-1 gate ("header + scan-overflow render the same actions as today") is the Task 3/4/5 verification steps. ✓
- **Auth-aware seam:** the builder already lights owner actions when `isOwned && isSaved && isLoggedIn` on *either* profile (Task 1 test 5). Increment 3 need only drop `forceGuest` on `/q` — no builder change. ✓
- **Placeholder scan:** no TBD/TODO; the one "copy CSS verbatim" instruction in Task 2 cites exact source line ranges (`RouteViewerHeader.svelte:258-477` + `ScanViewerHeader.svelte:157-187`) — mechanical, not a design gap. ✓
- **Type consistency:** `buildHeaderActions`/`ViewerHeaderActions`/`ViewerHeaderProfile`/`ViewerActionWiring` names are identical across Task 1 (def), Task 2/5 (call sites). Prop names fed to `ViewerOverflowMenu` (`onFavoriteToggle`, `onOpenApp`, `remixLabel`, `downloadBusy`, `onDeleteRequest`) match `ViewerOverflowMenu.svelte:41-97`. ✓
- **Testing posture:** unit tests cover the pure gate table (the spec's named risk); Svelte surfaces verify via DevTools parity screenshots — consistent with `component-test-discipline` (no mandated component tests). ✓

## Out of scope (later increments / plans)
- `ViewerControls` per-mode panel component (Increment 2).
- Dropping `forceGuest` + lazy auth on `/q` (Increment 3) — the builder is ready for it.
- Lazy 3D + Practice on `/q` (Increment 4).
- Merging DrawerHost's inline header *markup* into `ViewerHeader` (only its action *data source* is unified here).
