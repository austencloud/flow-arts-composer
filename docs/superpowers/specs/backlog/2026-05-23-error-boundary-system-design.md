---
status: backlog
value: 2
effort: XS
remaining: 'Code complete. Phase 4 step 3 is a runtime activity: monitor errorTelemetry for two weeks and promote recurring user-facing failures with count >10. Authenticated admin verification of the moderation failure toasts is also outstanding.'
depends_on: 'external: two-week production errorTelemetry window and authenticated admin failure-path verification'
plan_path: ''
tags:
- error-handling
- telemetry
- infrastructure
- reliability
last_triaged: '2026-10-07'
work_state: blocked
---

# Error Boundary System — Design Spec

**Status:** Implementation recorded; production telemetry and authenticated admin verification remain externally blocked (reviewed 2026-10-07).

> **DRIFT WARNING — 2026-08-02.** Verified 2026-08-02. Re-triaged 2026-08-01 and its own 2026-05-31 trailer is accurate; only the documented P3 residual remains. The detector's alarm comes from 969 commits touching broad shared paths, of which few concern this spec. Not a rebuild hazard.
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state.


> **Implementation status (2026-05-31):** The original `remaining` ("all four phases
> unstarted") was stale. Verification against the tree found the core already shipped:
> - **Phase 1** — `src/routes/+error.svelte` exists, reuses `ErrorScreen` exactly as specced.
> - **Phase 2** — `handleError` in `src/hooks.server.ts:112` (with hardened URL extraction).
> - **Phase 3** — production `unhandledrejection` telemetry in `src/hooks.client.ts:124`.
> - **Phase 4 step 1** — `onError` callback + `handleCrudError` (auto-telemetry default) on every
>   function in `src/lib/shared/firestore/firestore-crud.ts`.
> - **Firestore rule** — `errorTelemetry` block in `firestore.rules:1326`.
> - **Phase 4 step 2 (P0)** — `recording-persister.ts` was already fully guarded (try/catch +
>   `toast.error`). `collection-manager.ts` had five unguarded user-facing write paths
>   (`createUserCollection`, `updateCollection`, `addSequenceToCollection`,
>   `removeSequenceFromCollection`, `reorderSequences`) — now guarded with the file's own
>   `toast.error` + `throw CollectionError(..., "NETWORK", ...)` pattern.
>
> Residual (low priority): `shame-queue-manager.ts` admin moderation writes catch + `console.error`
> but show no user toast — defensible as P3 (admin/internal) per the framework below. Phase 4 step 3
> is the monitoring loop, which is inherently a future runtime activity.

> **Residual closed 2026-08-01:** `ShameQueuePanel.svelte` now handles each moderation write
> failure at the operation boundary. Approve, reject, hide, feature, and unfeature failures use
> the shared `ErrorHandler` warning tier, which keeps the queue visible, shows an action-specific
> toast, and sends deduplicated telemetry. The only remaining work is the production monitoring
> window and authenticated failure-path verification.
>
> Static proof: `tests/unit/shame-queue-error-boundary-contract.test.ts` passes 5/5 checks, and
> the Svelte compiler accepts `ShameQueuePanel.svelte` with zero warnings.

**Date:** 2026-05-23
**Original status:** Backlog
**Tier:** 1 (Fix What's Broken)
**Value:** 5 (every user-facing crash and silent failure is invisible today)
**Effort:** M (four discrete phases, each small)

---

## Problem

The app has a mature error-handling interior — `ErrorHandler` service, `ErrorModal`, `ErrorToast`, `error-telemetry-reporter` writing to Firestore `errorTelemetry` collection, a CLI script for querying telemetry — but no exterior boundary layer catches errors that escape before that infrastructure runs.

Three specific gaps:

1. **No `+error.svelte` anywhere in the route tree.** A bad route, a server error, or an unhandled load function exception produces the raw SvelteKit error page (white background, monospaced "500 Internal Error"). The existing `ErrorScreen` component at `src/lib/shared/foundation/ui/ErrorScreen.svelte` renders a styled error page with Retry and Go Home buttons, but nothing connects it to SvelteKit's error boundary system.

2. **No `handleError` export in `hooks.server.ts`.** Server-side errors (load function failures, form action errors, +server.ts exceptions) get the default SvelteKit handler: a `{ message: "Internal Error" }` response with zero telemetry. No Firestore write, no log beyond stderr. The `hooks.server.ts` file (109 lines) handles CORS, security headers, and a dev console-forward endpoint — nothing else.

3. **No production `unhandledrejection` telemetry in `hooks.client.ts`.** Two listeners exist elsewhere:
   - `app.html` has a bare `console.error("UNHANDLED PROMISE REJECTION:", event.reason)` — logs to browser console, no telemetry.
   - `src/lib/shared/hmr-helper.ts` catches `unhandledrejection` only for dynamic import MIME failures (dev-mode HMR recovery) — no production telemetry.
   - `hooks.client.ts` (67 lines) handles Capacitor init, cache benchmark, service worker registration, and stale chunk recovery — no global error capture.

   Net result: promise rejections outside of try/catch blocks vanish silently in production.

4. **ErrorHandler adoption is 33 call sites across 22 files out of 560 Firestore operations across 124 files.** The 2026-03-10 error handling spec identified 12 rollout targets; those were shipped. But the remaining ~530 Firestore call sites have bare `try/catch` with `console.error` or no catch at all. A Firestore outage or permission error in any of those sites produces a silent failure.

## Existing Infrastructure (What's Already Built)

| Component | Path | Role |
|---|---|---|
| `ErrorHandler` | `src/lib/shared/application/services/error-handler.ts` | Singleton service. Routes errors to modal (error/critical) or toast (warning/info). Reports warnings to `errorTelemetry` collection. Submits bug reports to `feedback` collection. |
| `ErrorModal` | `src/lib/shared/error/components/ErrorModal.svelte` | Full-screen overlay. Copy-all, Report Bug with user comment, two-column layout on desktop. Mounted in `MainApplication.svelte`. |
| `ErrorToast` | `src/lib/shared/error/components/ErrorToast.svelte` | Bottom-right stacking toasts. Progress bar, pause-on-hover, max 3 visible, "+N more" badge. Mounted in `MainApplication.svelte`. |
| `ErrorScreen` | `src/lib/shared/foundation/ui/ErrorScreen.svelte` | Styled full-page error with `glass-surface` class, SVG X icon, Retry and Go Home buttons, expandable technical details. Takes `error: string` and `onRetry` callback. |
| `error-state.svelte.ts` | `src/lib/shared/error/state/error-state.svelte.ts` | Svelte 5 rune state for modal errors. `showError()`, `dismissError()`, history bounded to 50. |
| `error-toast-state.svelte.ts` | `src/lib/shared/error/state/error-toast-state.svelte.ts` | Toast queue state. Pause/resume timers, stacking compression. |
| `error-telemetry-reporter.ts` | `src/lib/shared/error/services/error-telemetry-reporter.ts` | Writes to Firestore `errorTelemetry` collection with 24h dedup window. Key = `message::module::action`. |
| `error-models.ts` | `src/lib/shared/error/domain/error-models.ts` | `AppError`, `ErrorContext`, `ShowErrorOptions`, `ErrorReportData` types. |
| `getErrorHandler()` | `src/lib/shared/application/get-error-handler.ts` | Browser-only singleton factory. |
| `scripts/error-telemetry.js` | `scripts/error-telemetry.js` | CLI: `list`, `recent`, `resolve <key>`, `stats` subcommands. |

## Design

### Phase 1: Root `+error.svelte`

Create `src/routes/+error.svelte`. This catches any error that SvelteKit's error boundary propagates — bad routes (404), server load failures (500), unexpected exceptions in any route segment that lacks its own `+error.svelte`.

**Implementation:**

```svelte
<script lang="ts">
  import { page } from "$app/state";
  import ErrorScreen from "$lib/shared/foundation/ui/ErrorScreen.svelte";

  function handleRetry() {
    window.location.reload();
  }

  const errorMessage = $derived(
    page.error?.message ?? "Something went wrong"
  );
</script>

<ErrorScreen error={errorMessage} onRetry={handleRetry} />
```

This reuses the existing `ErrorScreen` component with no new UI work. The `glass-surface` class, cosmic gradient background, Retry/Go Home buttons, and expandable technical details are all already built.

**What this catches:**
- 404: User types `/nonexistent-route`
- 500: A `+page.server.ts` load function throws
- Unhandled exceptions in `+layout.svelte` or `+page.svelte` during SSR
- `error()` calls from SvelteKit's `@sveltejs/kit` in load functions

**What this does NOT catch:**
- Client-side runtime errors after hydration (those need `unhandledrejection` / `window.onerror`)
- Errors inside `MainApplication.svelte` or its children (those are caught by the existing `ErrorModal`/`ErrorToast` system inside the app shell)

### Phase 2: `handleError` in `hooks.server.ts`

Export a `handleError` function from `hooks.server.ts` that logs structured error data. SvelteKit calls this for every server-side error before rendering the error page.

**Implementation:**

```typescript
import type { HandleServerError } from "@sveltejs/kit";

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
  const err = error instanceof Error ? error : new Error(String(error));

  // Structured log for production monitoring (Cloudflare Workers logs, stdout)
  console.error(JSON.stringify({
    level: "error",
    type: "server_error",
    status,
    message: err.message,
    stack: err.stack,
    url: event.url.pathname + event.url.search,
    method: event.request.method,
    userAgent: event.request.headers.get("user-agent") ?? "unknown",
    timestamp: new Date().toISOString(),
  }));

  // Return the error shape SvelteKit passes to +error.svelte
  return {
    message: dev ? err.message : message,
    code: status,
  };
};
```

**Why not write to Firestore from the server hook:**
- `hooks.server.ts` runs in the Node/Cloudflare Workers server context. The Firestore client SDK (`firebase/firestore`) is initialized client-side with browser auth. Writing from the server would require the Admin SDK or a service account, which this codebase doesn't use server-side.
- Structured JSON logs are queryable via Cloudflare Workers logs or any log aggregator. This is the correct server-side telemetry path.
- Client-side errors already write to `errorTelemetry` via the existing reporter.

**What this catches:**
- `+page.server.ts` and `+layout.server.ts` load function errors
- `+server.ts` (API route) unhandled exceptions
- Form action errors

### Phase 3: Global `unhandledrejection` Telemetry in `hooks.client.ts`

Add a production `unhandledrejection` listener that pipes errors to the existing `errorTelemetry` Firestore collection via `reportErrorTelemetry()`.

**Implementation:**

Add to `hooks.client.ts`, after the existing stale chunk recovery block:

```typescript
// Production: capture unhandled promise rejections and report to telemetry.
// The app.html listener only console.error's. The hmr-helper listener only
// catches MIME/import failures. This catches everything else.
if (browser && !dev) {
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason) || "Unknown rejection";
    const stack = reason?.stack;

    // Skip known benign rejections
    if (
      message.includes("ResizeObserver loop") ||
      message.includes("Failed to fetch dynamically imported module") ||
      message.includes("MIME type")
    ) {
      return;
    }

    // Dynamic import to avoid loading Firebase on every page load
    import("$lib/shared/error/services/error-telemetry-reporter")
      .then(({ reportErrorTelemetry }) => {
        reportErrorTelemetry({
          message: `Unhandled rejection: ${message.slice(0, 200)}`,
          severity: "warning",
          context: {
            module: "global",
            action: "unhandledrejection",
            additionalData: {
              url: window.location.pathname,
              stack: stack?.slice(0, 1000),
            },
          },
          error: reason instanceof Error ? reason : undefined,
        });
      })
      .catch(() => {
        // Telemetry reporter itself failed — don't recurse
      });
  });
}
```

**Why `hooks.client.ts` and not `app.html`:**
- `app.html` runs before SvelteKit hydration. It can't import modules or use `$app/environment`.
- `hooks.client.ts` runs once on client init, has access to `browser` and `dev` guards, and can dynamic-import the telemetry reporter.
- The `app.html` listener stays as a console.error fallback for errors that fire before hooks.client.ts loads.

**Dedup:** The existing `reportErrorTelemetry` function already deduplicates by `message::module::action` with a 24h window. The key for all unhandled rejections will be `Unhandled rejection: <message>::global::unhandledrejection`, so duplicate spam from the same error is collapsed automatically.

### Phase 4: ErrorHandler Adoption Strategy

Current state: 33 `showUserError`/`showError`/`showWarning` call sites across 22 files. 560 Firestore operations across 124 files. The gap is not "add ErrorHandler to every catch block" — it's "identify which failures users actually notice."

**Prioritization framework:**

| Priority | Criteria | Target |
|---|---|---|
| P0 | User loses data (write fails silently) | All `setDoc`, `addDoc`, `updateDoc` in user-owned collections (library, compositions, settings) |
| P1 | User sees stale or missing data (read fails silently) | `getDocs`/`getDoc` that populate primary UI (browse gallery, library, sequence viewer) |
| P2 | Background sync fails silently | `onSnapshot` listeners, prefetch operations, cache warming |
| P3 | Admin/internal operations | Admin dashboard, telemetry, analytics |

**P0 targets (write operations that lose user data on failure):**

These files have Firestore writes in user-facing flows with no ErrorHandler integration:

| File | Operations | Count |
|---|---|---|
| `collection-manager.ts` | `addDoc`, `updateDoc`, `deleteDoc` on user collections | 16 |
| `Messenger.ts` | `addDoc`, `updateDoc` for messages | 19 |
| `AchievementManager.ts` | `setDoc`, `updateDoc` for achievements | 16 |
| `ConnectionManager.ts` | `setDoc`, `deleteDoc` for user connections | 9 |
| `ConversationManager.ts` | `addDoc`, `updateDoc` for conversations | 13 |
| `recording-persister.ts` | `addDoc`, `setDoc` for video recordings | 5 |
| `shame-queue-manager.ts` | Various writes for hall of shame | 13 |

**Implementation pattern for adoption:**

Do not wrap every Firestore call individually. Instead, add error reporting at the service method level where the user-facing action is defined. The `firestore-crud.ts` utility functions (`firestoreGet`, `firestoreSet`, `firestoreDelete`, `firestoreListen`) are the right interception point for P1/P2 coverage — add an optional `onError` callback to the CRUD functions that defaults to `reportErrorTelemetry`.

For P0, explicit `showUserError` calls remain correct because the user needs to know their action failed and the error message should be context-specific ("Couldn't save your collection" not "Firestore write failed").

**Phased rollout:**

1. First: Add `onError` callback to `firestoreSet` / `firestoreDelete` / `firestoreGet` / `firestoreList` in `firestore-crud.ts` that auto-reports to telemetry when no explicit error handler is provided. This gives passive coverage for P1-P3 without touching 124 files.
2. Second: Add explicit `showUserError` calls to the P0 files listed above. Estimated 7 files, ~40 call sites.
3. Third: Monitor `errorTelemetry` via `node scripts/error-telemetry.js stats` for 2 weeks. Any error with count > 10 that's in a user-facing flow gets promoted to explicit `showUserError`.

## Firestore Rules

The `errorTelemetry` collection is missing from `firestore.rules`. Currently, writes succeed because the rules likely have no deny for unauthenticated writes to unknown collections, or the collection was created via Admin SDK. This needs an explicit rule:

```
match /errorTelemetry/{docId} {
  // Anyone can write error telemetry (including unauthenticated users)
  allow create: if true;
  // Only authenticated users can update (dedup increment)
  allow update: if request.auth != null;
  // No client reads - telemetry is accessed via scripts/Admin SDK
  allow read: if false;
  // No client deletes
  allow delete: if false;
}
```

Allow unauthenticated creates because errors can happen before auth initializes — blocking telemetry from logged-out users defeats the purpose.

## Files to Create

| File | Purpose |
|---|---|
| `src/routes/+error.svelte` | Root error boundary, reuses `ErrorScreen` |

## Files to Modify

| File | Change |
|---|---|
| `src/hooks.server.ts` | Add `handleError` export with structured JSON logging |
| `src/hooks.client.ts` | Add production `unhandledrejection` listener with telemetry |
| `src/lib/shared/firestore/firestore-crud.ts` | Add optional `onError` callback to CRUD functions, default to `reportErrorTelemetry` |
| `firestore.rules` | Add `errorTelemetry` collection rules |
| `src/lib/features/admin/components/ShameQueuePanel.svelte` | Keep the moderation queue usable after write failures and route action-specific warnings through the shared toast and telemetry boundary |

## Out of Scope

- **Per-route `+error.svelte` variants.** The root boundary is sufficient. Feature modules (create, browse, compose) render inside `MainApplication.svelte` which already mounts `ErrorModal` and `ErrorToast`. Route-level error boundaries would only matter for SSR load failures, which the root boundary handles.
- **`handleError` in `hooks.client.ts`.** SvelteKit's `handleError` client hook exists but duplicates what the `unhandledrejection` listener does. The listener is more general (catches non-SvelteKit promise rejections too) and the telemetry path is the same.
- **Retry infrastructure.** The 2026-03-10 spec explicitly deferred this. Still deferred. Add retry logic per-operation when telemetry proves a specific operation fails transiently.
- **Error boundary components (React-style).** Svelte doesn't have `componentDidCatch`. The try/catch-at-operation-site pattern from the 2026-03-10 spec is correct. The `+error.svelte` boundary is SvelteKit's equivalent for routing/load errors.
- **Admin SDK server-side telemetry.** Would require a service account and changes to the deployment pipeline. Structured stdout logs are queryable via Cloudflare and sufficient for server errors.

## Verification

- Phase 1: Navigate to `/this-route-does-not-exist` and confirm the styled `ErrorScreen` renders (cosmic gradient, Retry button, Go Home button) instead of the raw SvelteKit error page.
- Phase 2: Throw an error in a `+page.server.ts` load function and confirm structured JSON appears in server logs with `type: "server_error"`.
- Phase 3: Run `Promise.reject(new Error("test-telemetry"))` in browser console on production build. Confirm a document appears in Firestore `errorTelemetry` collection with message `Unhandled rejection: test-telemetry`, module `global`, action `unhandledrejection`.
- Phase 4: Run `node scripts/error-telemetry.js stats` after 1 week of Phase 3 being live. Confirm unhandled rejections are being captured and deduped.
