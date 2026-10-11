# Error-to-Feedback Boundaries

Loaded on demand when adding error handling. Not needed every session.

## Philosophy: Earned Error Boundaries

Same principle as "earned tests" -- error boundaries are earned, not sprinkled everywhere defensively. Most code works fine. Wrap try/catch + feedback submission only where it's proven valuable.

---

## When to Add an Error Boundary

| Criteria | Example |
|----------|---------|
| External system calls (network, Firebase, APIs) | Saving to Firestore, uploading files |
| Operation the user initiated and is waiting on | "Save sequence", "Generate", "Upload video" |
| Failure would leave user stuck with no recourse | Blank screen, silent data loss, no retry option |
| You've seen this fail before | Known flaky operation, recurring bug |
| Failure is silent (user wouldn't notice immediately) | Thumbnail generation, tag sync, background upload |

## When NOT to Add One

| Criteria | Why |
|----------|-----|
| Internal wiring / deterministic code | You'll see it break in dev |
| UI rendering | Visually obvious when broken |
| Code that's simple and stable | Defensive noise, not value |
| "Just in case" | That's not earning it |

---

## How to Use the Pattern

```typescript
import { container } from "#lib/shared/di";
import type { IErrorHandler } from "#lib/shared/application/services/contracts/IErrorHandler";

try {
  await riskyOperation();
} catch (error) {
  const errorHandler = container.items.errorHandler as IErrorHandler;

  errorHandler.showUserError({
    message: "What the user should know",
    technicalDetails: "What we need for debugging",
    error: error instanceof Error ? error : new Error(String(error)),
    severity: "error",
    context: {
      module: "module-name",
      tab: "tab-name",
      action: "what-was-attempted",
      additionalData: { /* relevant state */ }
    }
  });
}
```

The ErrorModal (mounted once in MainApplication.svelte) handles display + optional "Report Bug" submission to Firestore.

---

## Existing Usage

- **Sequence generation** (`generate-actions.svelte.ts`) -- the original and model implementation

---

## High-Value Candidates (Add When Touching These Files)

Don't go add these all at once. Add the boundary when you're already working in the file or when a user reports a failure.

### Tier 1: User is blocked if these fail

| File | Operation | Current behavior |
|------|-----------|-----------------|
| `SequencePersister.ts` | Save/load/update sequences | Generic toast "Failed to save" -- no detail, no report option |
| `LibrarySaveService.ts` | Save to library (thumbnail, tags, refresh) | Thumbnail + tag creation fail silently, user thinks save succeeded |
| `CameraManager.ts` | Camera access for training | Generic "Camera access failed" -- no distinction between permission/hardware/in-use |
| `PublicSequencesLoader.ts` | Load sequence from browse gallery | Returns null, user sees blank -- no error shown |

### Tier 2: User loses data or sees stale state

| File | Operation | Current behavior |
|------|-----------|-----------------|
| `FirebaseVideoUploader.ts` | Upload practice video | Generic throw, no distinction between network/quota/permission |
| `CreateModuleEventHandler.ts` | Beat calculation (reversal, orientation) | Fails silently, beat added with wrong data |
| `PublicIndexSyncer.ts` | Publish sequence to public gallery | Some errors thrown, others silently swallowed |
| `OptimizedBrowser.ts` | Gallery pagination | Error thrown but total count returns 0 (looks like "no results") |

### Tier 3: Annoying but not blocking

| File | Operation | Current behavior |
|------|-----------|-----------------|
| `CloudThumbnailCache.ts` | Thumbnail download/manifest | Returns null silently, gallery shows no previews |
| `AudioLibraryService.ts` | Delete audio track | `.catch(() => {})` -- track reappears on refresh |
| `TimelinePlaybackService.ts` | Audio playback during animation | `.catch(console.error)` -- audio just doesn't play |
| `FirebaseMLStorageManager.ts` | ML training data upload | Progress shows "error" status but no guidance |

---

## Rules for Adding Boundaries

1. **Message for the user, details for us.** `message` = plain language. `technicalDetails` = stack trace + state.
2. **Include context.** Module, tab, action, and any state that helps reproduce.
3. **Don't catch and re-throw.** Either handle it (show error modal) or let it propagate. Not both.
4. **Don't replace working toast errors.** If a toast already gives the user enough info and a retry path, that's fine. The error-to-feedback modal is for when users are stuck.
5. **Don't wrap happy paths.** If the operation works 99.9% of the time and failures are obvious, skip it.
