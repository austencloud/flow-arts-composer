# Scan Handoff — Desktop to Phone (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desktop scan sheet shows a QR that deep-links a signed-in phone straight into this collection with the scanner open; scanned cards land in the desktop's open grid live.

**Architecture:** New URL parser (`/browse/collections/[id]?scan=1`) mirroring the existing creator deep-link seam; a one-shot pending-scan intent mirroring `pending-sequence.svelte.ts`; BrowseModule consumes the URL on mount; CollectionDetailView auto-opens the sheet; ScanCardSheet becomes dual-mode by placement (desktop = handoff QR first, camera on demand; mobile = camera, unchanged). Live desktop update already exists via `subscribeToCollection` — nothing to build there.

**Tech Stack:** Svelte 5 runes, existing `QRCodeGenerator.generateForUrl`, `getAppCanonicalURL`, vitest (jsdom config at `tests/config/vitest.config.ts`).

**Spec:** `docs/superpowers/specs/active/2026-07-03-scan-handoff-desktop-to-phone-design.md`

---

## Project Ground Rules (read first)

- Repo package manager is **pnpm**. No new deps needed for this plan.
- **Commit with explicit pathspec only**: `git commit -m "..." -- <files>`. Never bare `git commit`. The shared index may hold other agents' staged work.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Do NOT run `npm run dev` (port 5173 is the user's). Do NOT run full `npm run check` per task — one full check at the end (Task 6). Targeted vitest runs per task.
- Scoped test command shape: `npx vitest run --config tests/config/vitest.config.ts <test-file-path>` — the config includes `src/**/__tests__/**/*.test.ts` and runs jsdom. Never run a directory glob that could sweep `.svelte.test.ts` browser-mode tests (they're excluded in this config, but keep runs file-scoped anyway).
- All work on `main`. No branches, no stash, no worktrees.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/shared/browse/state/browse-navigation-state.svelte.ts` | Modify | Add `getCollectionScanTargetFromURL()` next to `getCreatorIdFromURL()` |
| `src/lib/shared/browse/state/__tests__/collection-scan-target.test.ts` | Create | URL parser unit tests |
| `src/lib/features/browse/state/pending-scan-intent.svelte.ts` | Create | One-shot scan intent (sibling of `pending-sequence.svelte.ts`) |
| `src/lib/features/browse/state/__tests__/pending-scan-intent.test.ts` | Create | One-shot semantics tests |
| `src/lib/features/browse/shared/components/BrowseModule.svelte` | Modify | onMount: consume deep link → navigate + stash intent |
| `src/lib/features/browse/collections/components/CollectionDetailView.svelte` | Modify | Consume intent at init → `scanSheetOpen = true` |
| `src/lib/features/browse/collections/components/ScanCardSheet.svelte` | Modify | Dual-mode: desktop handoff panel (QR + live phone counter + camera fallback) |

---

### Task 1: `getCollectionScanTargetFromURL()`

**Files:**
- Test: `src/lib/shared/browse/state/__tests__/collection-scan-target.test.ts` (create)
- Modify: `src/lib/shared/browse/state/browse-navigation-state.svelte.ts` (insert after `getCreatorIdFromURL`, which ends at line 65)

- [ ] **Step 1: Write the failing test**

Create `src/lib/shared/browse/state/__tests__/collection-scan-target.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getCollectionScanTargetFromURL } from "../browse-navigation-state.svelte";

/** jsdom: rewrite the current URL without a navigation. */
function setUrl(pathAndQuery: string) {
	window.history.replaceState(null, "", pathAndQuery);
}

describe("getCollectionScanTargetFromURL", () => {
	it("parses a collection deep link with the scan flag", () => {
		setUrl("/browse/collections/col_abc123?scan=1");
		expect(getCollectionScanTargetFromURL()).toEqual({
			collectionId: "col_abc123",
			scan: true,
		});
	});

	it("parses a collection deep link without the scan flag", () => {
		setUrl("/browse/collections/col_abc123");
		expect(getCollectionScanTargetFromURL()).toEqual({
			collectionId: "col_abc123",
			scan: false,
		});
	});

	it("treats any other scan value as no-scan", () => {
		setUrl("/browse/collections/col_abc123?scan=0");
		expect(getCollectionScanTargetFromURL()?.scan).toBe(false);
	});

	it("decodes URL-encoded collection ids", () => {
		setUrl("/browse/collections/a%3Ab?scan=1");
		expect(getCollectionScanTargetFromURL()?.collectionId).toBe("a:b");
	});

	it("returns null on non-collection paths", () => {
		setUrl("/browse/creators/user_1");
		expect(getCollectionScanTargetFromURL()).toBeNull();
		setUrl("/browse/collections");
		expect(getCollectionScanTargetFromURL()).toBeNull();
		setUrl("/browse/gallery");
		expect(getCollectionScanTargetFromURL()).toBeNull();
		setUrl("/");
		expect(getCollectionScanTargetFromURL()).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/browse/state/__tests__/collection-scan-target.test.ts`
Expected: FAIL — `getCollectionScanTargetFromURL` is not exported.

- [ ] **Step 3: Implement the parser**

In `src/lib/shared/browse/state/browse-navigation-state.svelte.ts`, directly after the closing brace of `getCreatorIdFromURL()` (line 65), insert:

```ts
/**
 * A collection deep link: /browse/collections/[collectionId], optionally with
 * ?scan=1. This is the URL a phone lands on after scanning the desktop scan
 * sheet's handoff QR — it opens that collection, and the scan flag asks the
 * detail view to open the card scanner immediately.
 */
export interface CollectionScanTarget {
  collectionId: string;
  scan: boolean;
}

/**
 * Read a collection deep link from the current URL. Returns null on any other
 * path. Safe to call anywhere (returns null during SSR).
 */
export function getCollectionScanTargetFromURL(): CollectionScanTarget | null {
  if (typeof window === "undefined") return null;
  const parts = window.location.pathname
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  // Expect: browse / collections / [collectionId]
  if (parts[0] === "browse" && parts[1] === "collections" && parts[2]) {
    const scan =
      new URLSearchParams(window.location.search).get("scan") === "1";
    return { collectionId: decodeURIComponent(parts[2]), scan };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/browse/state/__tests__/collection-scan-target.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/browse/state/__tests__/collection-scan-target.test.ts src/lib/shared/browse/state/browse-navigation-state.svelte.ts
git commit -m "feat(scan): collection deep-link parser for phone handoff

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/lib/shared/browse/state/__tests__/collection-scan-target.test.ts src/lib/shared/browse/state/browse-navigation-state.svelte.ts
```

---

### Task 2: `pending-scan-intent.svelte.ts` (one-shot)

**Files:**
- Test: `src/lib/features/browse/state/__tests__/pending-scan-intent.test.ts` (create)
- Create: `src/lib/features/browse/state/pending-scan-intent.svelte.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/features/browse/state/__tests__/pending-scan-intent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
	setPendingScanIntent,
	consumePendingScanIntent,
} from "../pending-scan-intent.svelte";

describe("pending scan intent", () => {
	it("returns null when nothing was set", () => {
		expect(consumePendingScanIntent()).toBeNull();
	});

	it("returns the stashed id once, then clears (one-shot)", () => {
		setPendingScanIntent("col_1");
		expect(consumePendingScanIntent()).toBe("col_1");
		expect(consumePendingScanIntent()).toBeNull();
	});

	it("a later set overwrites an unconsumed earlier one", () => {
		setPendingScanIntent("col_1");
		setPendingScanIntent("col_2");
		expect(consumePendingScanIntent()).toBe("col_2");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/browse/state/__tests__/pending-scan-intent.test.ts`
Expected: FAIL — cannot resolve `../pending-scan-intent.svelte`.

- [ ] **Step 3: Create the module**

Create `src/lib/features/browse/state/pending-scan-intent.svelte.ts` (exact sibling pattern of `pending-sequence.svelte.ts` in the same directory):

```ts
/**
 * Pending Scan Intent
 *
 * One-shot handoff for "open the card scanner as soon as this collection
 * loads." Set when the app boots from a scan deep link
 * (/browse/collections/[id]?scan=1 — the QR a desktop shows so a phone can
 * take over scanning); consumed once by CollectionDetailView. One-shot so a
 * refresh or a later visit to the same collection doesn't reopen the scanner.
 */

let pendingScanCollectionId = $state<string | null>(null);

/** Stash a request to auto-open the scan sheet for a collection. */
export function setPendingScanIntent(collectionId: string): void {
	pendingScanCollectionId = collectionId;
}

/** Read and clear the pending scan intent. */
export function consumePendingScanIntent(): string | null {
	const id = pendingScanCollectionId;
	pendingScanCollectionId = null;
	return id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/browse/state/__tests__/pending-scan-intent.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/browse/state/pending-scan-intent.svelte.ts src/lib/features/browse/state/__tests__/pending-scan-intent.test.ts
git commit -m "feat(scan): one-shot pending-scan intent for deep-link auto-open

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/lib/features/browse/state/pending-scan-intent.svelte.ts src/lib/features/browse/state/__tests__/pending-scan-intent.test.ts
```

---

### Task 3: BrowseModule consumes the deep link

**Files:**
- Modify: `src/lib/features/browse/shared/components/BrowseModule.svelte` (imports ~line 34; onMount deep-link block ~lines 383–394)

- [ ] **Step 1: Add imports**

In the existing import from `$lib/shared/browse/state/browse-navigation-state.svelte` (the one that already pulls `getCreatorIdFromURL`, around line 34), add `getCollectionScanTargetFromURL`:

```ts
import {
    browseNavigationState,
    getCreatorIdFromURL,
    getCollectionScanTargetFromURL,
} from "$lib/shared/browse/state/browse-navigation-state.svelte";
```

(Match however the existing import is formatted — only add the symbol. If `browseNavigationState` is imported separately, just add `getCollectionScanTargetFromURL` to the same specifier list as `getCreatorIdFromURL`.)

Add a new import below it:

```ts
import { setPendingScanIntent } from "$lib/features/browse/state/pending-scan-intent.svelte";
```

- [ ] **Step 2: Add the deep-link branch in onMount**

Current code (BrowseModule.svelte, in `onMount`, lines ~383–394):

```ts
    // Check whether the URL contains a creator profile path (/browse/creators/[userId]).
    // If it does, override the localStorage-restored state and open that profile directly
    // so a page refresh lands on the same profile the user was viewing.
    const initialCreatorId = getCreatorIdFromURL();

    // Initialize navigation state (restores from localStorage if available)
    browseNavigationState.initialize("gallery");

    if (initialCreatorId) {
      // Override whatever localStorage had - the URL is the source of truth on load.
      browseNavigationState.viewCreatorProfile(initialCreatorId);
    }
```

Replace with:

```ts
    // Check whether the URL contains a creator profile path (/browse/creators/[userId]).
    // If it does, override the localStorage-restored state and open that profile directly
    // so a page refresh lands on the same profile the user was viewing.
    const initialCreatorId = getCreatorIdFromURL();

    // Same idea for collection deep links (/browse/collections/[id]?scan=1) —
    // this is the URL a phone lands on after scanning the desktop scan sheet's
    // handoff QR. The scan flag asks the detail view to open the scanner
    // immediately, so the phone goes from QR scan to camera in one hop.
    const scanTarget = getCollectionScanTargetFromURL();

    // Initialize navigation state (restores from localStorage if available)
    browseNavigationState.initialize("gallery");

    if (initialCreatorId) {
      // Override whatever localStorage had - the URL is the source of truth on load.
      browseNavigationState.viewCreatorProfile(initialCreatorId);
    } else if (scanTarget) {
      browseNavigationState.viewCollectionDetail(scanTarget.collectionId);
      if (scanTarget.scan) {
        setPendingScanIntent(scanTarget.collectionId);
      }
    }
```

(`else if` is correct: the two URL shapes are mutually exclusive — a path is either `/browse/creators/…` or `/browse/collections/…`.)

- [ ] **Step 3: Verify it compiles**

Run: `npm run check:fast`
Expected: no NEW errors in `BrowseModule.svelte`. (Pre-existing unrelated warnings elsewhere are fine — compare against the file list, not the count.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/browse/shared/components/BrowseModule.svelte
git commit -m "feat(scan): route collection scan deep links on browse mount

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/lib/features/browse/shared/components/BrowseModule.svelte
```

---

### Task 4: CollectionDetailView auto-opens the scanner

**Files:**
- Modify: `src/lib/features/browse/collections/components/CollectionDetailView.svelte` (import block ~line 38; `scanSheetOpen` declaration ~line 187)

Why script-init and not `onMount`/`$effect`: the intent is stashed in BrowseModule's `onMount`, which runs before this child component is ever created (the detail view renders only after nav state points at it). Consuming at script init is one-shot by construction and can't re-fire on prop changes.

- [ ] **Step 1: Add the import**

Next to the `ScanCardSheet` import (line 39):

```ts
	import { consumePendingScanIntent } from "$lib/features/browse/state/pending-scan-intent.svelte";
```

- [ ] **Step 2: Consume the intent into the initial sheet state**

Current code (lines 184–187):

```ts
	// Build-from-inside: the add-sequences browser overlay.
	let addSheetOpen = $state(false);
	// File physical cards: the camera scan sheet.
	let scanSheetOpen = $state(false);
```

Replace with:

```ts
	// Build-from-inside: the add-sequences browser overlay.
	let addSheetOpen = $state(false);
	// File physical cards: the camera scan sheet. A phone that arrived via the
	// desktop's handoff QR (?scan=1 deep link) has a pending intent stashed —
	// consume it (one-shot) and open the scanner straight away. Foreign
	// (read-only) collections never scan.
	const pendingScan = consumePendingScanIntent();
	let scanSheetOpen = $state(pendingScan === collectionId && !foreignOwnerId);
```

Note the existing mount guard already covers the render side: `{#if scanSheetOpen && !foreignOwnerId}` (line ~418) stays as is.

- [ ] **Step 3: Verify it compiles**

Run: `npm run check:fast`
Expected: no NEW errors in `CollectionDetailView.svelte`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/browse/collections/components/CollectionDetailView.svelte
git commit -m "feat(scan): auto-open scanner when arriving via handoff deep link

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/lib/features/browse/collections/components/CollectionDetailView.svelte
```

---

### Task 5: ScanCardSheet dual mode (desktop handoff panel)

**Files:**
- Modify: `src/lib/features/browse/collections/components/ScanCardSheet.svelte`

The component already derives `placement` (`"right"` on desktop side-by-side layouts, `"bottom"` on mobile). Desktop gets a handoff-first view; mobile keeps today's camera-first behavior byte-for-byte. The 200ms scan timer stays unconditional — `tick()` already early-returns while the camera is inactive.

- [ ] **Step 1: Add imports**

After the `extractScanCode` import (line 26), add:

```ts
	import { getQRCodeGenerator } from "$lib/shared/qr/get-qr-code-generator";
	import { getAppCanonicalURL } from "../../../../../config/domains";
```

Path note (resolved during planning — don't re-litigate): nothing under `src/lib` imports `src/config/domains.ts` today; routes import it relatively, and the `$config` alias is dead (see the commented-out TODO import in `src/hooks.server.ts:1`). `src/config` sits outside `$lib`, so `$lib/...` cannot resolve it. The five-level relative path above is correct from `src/lib/features/browse/collections/components/` up to `src/`, then into `config/`.

- [ ] **Step 2: Add handoff state + camera gating**

Current code (lines 68–80):

```ts
	// Camera + detection.
	const camera = new CameraManager();
	let detector: TkaQrDetector | null = null;
	let videoHost = $state<HTMLDivElement | null>(null);
	let cameraError = $state<string | null>(null);
	let cameraReady = $state(false);

	// Session bookkeeping.
	let addedCount = $state(0);
	const seen = new Set<string>();
	let processing = false; // one hit at a time; also pauses detection ticks
	let scanTimer: ReturnType<typeof setInterval> | null = null;
	const SCAN_INTERVAL_MS = 200;
```

Replace with:

```ts
	// Camera + detection.
	const camera = new CameraManager();
	let detector: TkaQrDetector | null = null;
	let videoHost = $state<HTMLDivElement | null>(null);
	let cameraError = $state<string | null>(null);
	let cameraReady = $state(false);

	// Desktop handoff: a desktop usually has no camera worth pointing at a
	// printed card, so the right-side placement leads with a QR that hands the
	// scan job to the user's phone. The phone opens this same collection with
	// the scanner running; cards it files appear in the desktop grid live
	// (the detail view's collection subscription — nothing extra needed here).
	let cameraChosen = $state(false);
	const handoffMode = $derived(placement === "right" && !cameraChosen);
	const handoffUrl = getAppCanonicalURL(
		`browse/collections/${encodeURIComponent(collectionId)}?scan=1`,
	);
	let handoffQrDataUrl = $state<string | null>(null);
	let handoffQrFailed = $state(false);
	// Count cards the phone adds while the handoff panel is up: baseline the
	// collection size when we first see it, then show the live delta.
	let handoffBaseline = $state<number | null>(null);
	const phoneAddedCount = $derived(
		handoffBaseline === null
			? 0
			: Math.max(0, (target?.sequenceCount ?? handoffBaseline) - handoffBaseline),
	);

	// Session bookkeeping.
	let addedCount = $state(0);
	const seen = new Set<string>();
	let processing = false; // one hit at a time; also pauses detection ticks
	let scanTimer: ReturnType<typeof setInterval> | null = null;
	const SCAN_INTERVAL_MS = 200;
	// The camera starts on demand, not on mount: immediately on phones (bottom
	// placement), only after "use this computer's camera" on desktop.
	let cameraStartRequested = false;

	function requestCameraStart() {
		if (cameraStartRequested) return;
		cameraStartRequested = true;
		void startCamera();
	}
```

- [ ] **Step 3: Wire the mode effects**

Current `onMount` (lines 191–213):

```ts
	onMount(() => {
		isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
		layoutUnsubscribe = responsiveLayoutManager.onLayoutChange(() => {
			isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
		});

		// Focus mode: picking through a physical stack, chrome is noise.
		browseScrollState.hideUI();

		detector = createTkaQrDetector();
		void startCamera();
		scanTimer = setInterval(() => void tick(), SCAN_INTERVAL_MS);

		requestAnimationFrame(() => {
			drawerOpen = true;
		});

		return () => {
			if (scanTimer) clearInterval(scanTimer);
			camera.stop(); // release the camera the moment the sheet goes
			browseScrollState.showUI();
		};
	});
```

Replace with (the only line removed is the unconditional `void startCamera()`; `camera.stop()` in teardown is a safe no-op when the camera never started — it guards on its internal stream):

```ts
	onMount(() => {
		isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
		layoutUnsubscribe = responsiveLayoutManager.onLayoutChange(() => {
			isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
		});

		// Focus mode: picking through a physical stack, chrome is noise.
		browseScrollState.hideUI();

		detector = createTkaQrDetector();
		scanTimer = setInterval(() => void tick(), SCAN_INTERVAL_MS);

		requestAnimationFrame(() => {
			drawerOpen = true;
		});

		return () => {
			if (scanTimer) clearInterval(scanTimer);
			camera.stop(); // release the camera the moment the sheet goes
			browseScrollState.showUI();
		};
	});

	// Phones scan directly: bottom placement starts the camera immediately
	// (also covers a desktop window resized down to the mobile layout).
	$effect(() => {
		if (placement === "bottom") requestCameraStart();
	});

	// Desktop handoff panel: render the QR once. If generation fails we fall
	// back to showing the link itself, so the handoff still works.
	$effect(() => {
		if (!handoffMode || handoffQrDataUrl || handoffQrFailed) return;
		getQRCodeGenerator()
			.generateForUrl(handoffUrl, { size: 480, margin: 2 })
			.then((result) => {
				handoffQrDataUrl = result.dataUrl;
			})
			.catch((err) => {
				console.error("[ScanCard] handoff QR generation failed:", err);
				handoffQrFailed = true;
			});
	});

	// Baseline the collection size the first time we see it in handoff mode,
	// so the "added from your phone" counter starts at zero.
	$effect(() => {
		if (handoffMode && handoffBaseline === null && target) {
			handoffBaseline = target.sequenceCount;
		}
	});
```

- [ ] **Step 4: Add the handoff panel to the template**

Current viewfinder block (lines 247–267):

```svelte
		<div class="viewfinder">
			{#if cameraError}
				<div class="camera-error" role="alert">
					<i class="fas fa-video-slash" aria-hidden="true"></i>
					<p>{cameraError}</p>
					<button type="button" class="retry-btn" onclick={() => void startCamera()}>
						<i class="fas fa-rotate-right" aria-hidden="true"></i>
						<span>Try again</span>
					</button>
				</div>
			{:else}
				<div class="video-host" bind:this={videoHost}></div>
				{#if !cameraReady}
					<div class="camera-starting" role="status">
						<i class="fas fa-camera" aria-hidden="true"></i>
						<p>Starting camera…</p>
					</div>
				{/if}
				<p class="scan-hint">Point at a card's QR code</p>
			{/if}
		</div>
```

Replace with:

```svelte
		{#if handoffMode}
			<div class="handoff-panel">
				<div class="qr-box">
					{#if handoffQrDataUrl}
						<img
							class="handoff-qr"
							src={handoffQrDataUrl}
							alt="QR code that opens this collection's card scanner on your phone"
						/>
					{:else if handoffQrFailed}
						<p class="handoff-link-fallback">
							Open this on your phone:
							<span class="handoff-url">{handoffUrl}</span>
						</p>
					{/if}
				</div>
				<p class="handoff-copy">
					Scan this with your phone to add cards. They'll appear here as you go.
				</p>
				<p class="phone-count" aria-live="polite">
					{phoneAddedCount}
					{phoneAddedCount === 1 ? "card" : "cards"} added from your phone
				</p>
				<button
					type="button"
					class="camera-fallback-btn"
					onclick={() => {
						cameraChosen = true;
						requestCameraStart();
					}}
				>
					<i class="fas fa-camera" aria-hidden="true"></i>
					<span>Use this computer's camera</span>
				</button>
			</div>
		{:else}
			<div class="viewfinder">
				{#if cameraError}
					<div class="camera-error" role="alert">
						<i class="fas fa-video-slash" aria-hidden="true"></i>
						<p>{cameraError}</p>
						<button type="button" class="retry-btn" onclick={() => void startCamera()}>
							<i class="fas fa-rotate-right" aria-hidden="true"></i>
							<span>Try again</span>
						</button>
					</div>
				{:else}
					<div class="video-host" bind:this={videoHost}></div>
					{#if !cameraReady}
						<div class="camera-starting" role="status">
							<i class="fas fa-camera" aria-hidden="true"></i>
							<p>Starting camera…</p>
						</div>
					{/if}
					<p class="scan-hint">Point at a card's QR code</p>
				{/if}
			</div>
		{/if}
```

- [ ] **Step 5: Add the handoff styles**

Append inside the existing `<style>` block, before the `@media (prefers-reduced-motion: reduce)` rule:

```css
	/* ── Desktop handoff panel ────────────────────────────────────── */

	.handoff-panel {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 14px;
		padding: 24px;
		overflow-y: auto;
	}

	/* Fixed box: the QR decodes async, and the panel must not reflow when it
	   lands (no-layout-shift). White backing keeps the QR scannable on any
	   theme background. */
	.qr-box {
		width: 240px;
		height: 240px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 16px;
		background: white;
		padding: 12px;
	}

	.handoff-qr {
		width: 100%;
		height: 100%;
		display: block;
	}

	.handoff-link-fallback {
		margin: 0;
		color: #1a1a2e;
		font-size: var(--font-size-compact, 12px);
		text-align: center;
		overflow-wrap: anywhere;
	}

	.handoff-url {
		display: block;
		margin-top: 6px;
		font-weight: 600;
		user-select: all;
	}

	.handoff-copy {
		margin: 0;
		max-width: 320px;
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		line-height: 1.5;
		text-align: center;
	}

	.phone-count {
		margin: 0;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
		font-size: var(--font-size-compact, 12px);
		font-variant-numeric: tabular-nums;
	}

	.camera-fallback-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 44px;
		padding: 0 18px;
		margin-top: 8px;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
		border-radius: 12px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		cursor: pointer;
	}

	.camera-fallback-btn:focus-visible {
		outline: 2px solid var(--theme-accent);
		outline-offset: 2px;
	}
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run check:fast`
Expected: no NEW errors in `ScanCardSheet.svelte`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/features/browse/collections/components/ScanCardSheet.svelte
git commit -m "feat(scan): desktop handoff panel — QR hands scanning to the phone

Desktop (right-placement) scan sheet now leads with a QR deep link
(/browse/collections/[id]?scan=1) instead of assuming a camera; a
secondary button still starts the local camera. Live phone-added
counter reads the existing collection subscription.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/lib/features/browse/collections/components/ScanCardSheet.svelte
```

---

### Task 6: Full gate + verification

- [ ] **Step 1: Run the new unit tests together**

Run:
```bash
npx vitest run --config tests/config/vitest.config.ts src/lib/shared/browse/state/__tests__/collection-scan-target.test.ts src/lib/features/browse/state/__tests__/pending-scan-intent.test.ts
```
Expected: 8 tests PASS.

- [ ] **Step 2: One full check (the commit gate)**

Run (Git Bash):
```bash
npm run check > /tmp/scan-handoff-check.log 2>&1
grep -icE "error" /tmp/scan-handoff-check.log
```
Expected: 0 errors. If errors: fix, then re-run ONE more full check. Never run parallel checks; re-filter by grepping the log, not by re-running the compiler.

- [ ] **Step 3: Build**

Run: `npm run build:fast`
Expected: exit 0.

- [ ] **Step 4: Desktop smoke via curl (route reachability)**

Run: `curl -sk "https://localhost:5173/browse/collections/some-id?scan=1" -o /dev/null -w "%{http_code}"`
Expected: `200` (SPA shell serves the deep-link path). Quotes required — `?` globs in Git Bash. Note this only proves route reachability; content-type/status can't distinguish SPA fallback pages, which is fine here (the shell IS the app).

- [ ] **Step 5: Manual verification handoff (requires the user)**

Cannot verify camera + cross-device flow programmatically. Tell the user exactly this:

> I've made the changes but need you to verify. On desktop: open a collection → Scan → you should see a QR (no camera prompt) and a "Use this computer's camera" button. Scan the QR with your phone's camera app: the app should open on that same collection with the scanner running. Scan a printed card — it should land in the desktop grid live and the desktop counter should tick. Tell me what you see.

- [ ] **Step 6: Update memory + spec status**

Add a shipped block to `project_collections_module.md` memory (scan handoff v1: deep link `/browse/collections/[id]?scan=1`, dual-mode ScanCardSheet, one-shot intent), per the memory style guide.

---

## Self-Review Notes (already applied)

- `getQRCodeGenerator` is the real export name (capital QR) — `src/lib/shared/qr/get-qr-code-generator.ts:7`.
- `camera.stop()` verified safe when never started (`camera-manager.ts:116` guards on `this._stream`).
- Bare collection id in `contextId` → `foreignOwnerId: null` verified in `MyCollectionsPanel.svelte:100`.
- `viewCollectionDetail` exists — `browse-navigation-state.svelte.ts:308`.
- QR size 480 with a 240px display box = 2x for retina desktop displays.
- `?scan=1` uses `=== "1"` strictly; `?scan=0` or garbage → no auto-open.
- The scan timer keeps running in handoff mode; `tick()` early-returns on `!camera.isActive` (ScanCardSheet.svelte:103) — no camera, no work.
