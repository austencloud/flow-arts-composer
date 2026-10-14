# Share Target Intake (Native Path) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Flow Arts Composer appear in the Android share sheet so a shared image resolves its TKA card QR, or lands in the inbox with a conversation picker.

**Architecture:** One `share-intake` module owns a normalized payload and all routing. A thin native adapter converts `@capgo/capacitor-share-target`'s URI descriptors into `File` objects and hands them over. Records persist to IndexedDB before any auth check so a share survives sign-in. The PWA adapter is deliberately **out of scope** — see Scope.

**Read the Lifecycle traces section before any task.** This plan failed
whole-picture review three times for the same reason: units were specified in
isolation and the wiring between them was implied rather than written. The
traces are the spine. Every task below names the trace step it closes. A module
whose trace step cannot be named does not belong here.

**Tech Stack:** Capacitor 8.4.2, `@capgo/capacitor-share-target` v8.0.44, Svelte 5 runes, IndexedDB, vitest.

**Spec:** [`../specs/2026-07-28-share-target-intake-design.md`](../specs/2026-07-28-share-target-intake-design.md)

---

## Scope

This plan covers the **native path only**. The spec's PWA half (manifest
`share_target` + service-worker POST interception) is deferred because two of
its lifecycle risks are unproven on a device: service-worker version skew, and
whether `launch_handler: "focus-existing"` swallows the POST. Planning around
two unknowns produces a plan that dies on contact.

The native path is also the only one that reaches a Play-build device — the
manifest `share_target` is inert inside the Capacitor shell.

Everything here is real, verified API. The plugin was spiked on 2026-07-28
(v8.0.44); its event shape and limitations are recorded in the spec.

**Working directory:** `E:/tka-platform` on `main`. Do **not** create a branch
or worktree (`.claude/rules/worktree-workflow.md`).

**Commits:** always scoped — `git commit -m "..." -- <explicit paths>`. The
index is shared with other agent sessions
(`.claude/rules/commit-only-your-own-changes.md`).

---

## Lifecycle traces

Three paths. Each hop names the file and the function. If a hop below has no
implementation, the task that supplies it is named in the right-hand column.
Nothing else in this plan is allowed to exist.

Two structural facts make all three traces work, and both are corrections to
the previous revision:

1. **The native shell always boots into the app shell.** `NativeInitializer`
   calls `bootIntoApp()` → `goto("/create")` on every share-less AND
   share-carrying cold start. `/create` falls through
   `src/routes/[...appPath]/+page.svelte` → `src/routes/app/AppShellLoader.svelte`
   → `MainApplication.svelte`, which is the only place `InboxDrawer` and
   `SequenceViewerDrawerHost` are ever mounted (`MainApplication.svelte:623-625`
   and `:708-710`). The previous revision suppressed `bootIntoApp()` when a
   share was pending and commented "the share routes itself." It does not — the
   native shell loads `/`, which is `src/routes/+page.svelte`, the marketing
   landing (`HomeHero` + `LaunchpadGrid`). Opening the picker from there sets
   state that nothing renders.
2. **Routing is triggered from inside the shell, never from the adapter.** A new
   `ShareIntakeHost.svelte` mounts as a sibling of the inbox drawer and the
   viewer host. It is the sole caller of `scheduleIntakeRun()`. The adapter only
   persists bytes and bumps a signal. Because the host cannot run before its
   siblings exist, "the drawer is mounted before the picker opens" is true by
   construction rather than by timing. This also deletes the 300 ms registration
   grace the previous revision charged to every share-less cold boot.

### Trace 1 — Cold launch, one image carrying a TKA card QR

| # | Hop | Where | Task |
|---|---|---|---|
| 1.1 | Android delivers `ACTION_SEND` | `android/app/src/main/AndroidManifest.xml` intent filter | 1 ✅ |
| 1.2 | Plugin copies bytes to `cacheDir/shared_files/<name>` and fires `shareReceived` (retained; fires twice on cold launch — `load()` **and** `handleOnNewIntent`) | `CapacitorShareTargetPlugin.java:29,35,89` | — |
| 1.3 | Listener claims the delivery synchronously, drops the twin | `native-share-adapter.ts` → `deriveDeliveryKey` + `inFlight` Set | 13 |
| 1.4 | Descriptors screened for mime + count before a byte is read | `intake-validator.ts` → `screenDescriptors` | 3 |
| 1.5 | URIs become real `File`s, four at a time | `shared-file-bridge.ts` → `sharedFilesToFiles` | 5 |
| 1.6 | Bytes + problems persist; durable id derived from post-bridge sizes | `intake-store.ts` → `putIntake`, `derive-receipt-id.ts` → `deriveReceiptId` | 6, 2 ✅ |
| 1.7 | Adapter bumps the signal and returns. It never routes | `share-intake-signal.svelte.ts` → `bumpIntakeSignal` | 12 |
| 1.8 | In parallel, `bootIntoApp()` → `/create` → `MainApplication` mounts | `native-initializer.ts` → `bootIntoApp` | 13 |
| 1.9 | `ShareIntakeHost` mounts beside the drawers and calls the runner | `ShareIntakeHost.svelte` → `onMount` + `$effect` on the signal | 12 |
| 1.10 | Runner loads the record and classifies it | `share-intake-runner.ts` → `runPendingIntakes`, `intake-classifier.ts` → `classifyIntake` | 11, 7 |
| 1.11 | QR decoded straight off the `File` (no canvas round trip) | `tka-qr-detector.ts` → `detect(ImageBitmapSource)` | 4 |
| 1.12 | Code resolved; a printed card is saved to My Library first | `intake-router.ts` → `routeIntake` → `fileCard` | 10 |
| 1.13 | **The viewer opens on the sequence** | `open-filed-card.ts` → `openFiledCard` → `openSequenceOverlay` | 8 |
| 1.14 | Record deleted; nothing is left behind | `share-intake-runner.ts` → `deleteIntake` | 11 |

**Terminal state:** the sequence viewer overlay is open on the shared card, over
`/create` — that open viewer IS the View affordance. From there the viewer's
own chrome supplies Save-to-library (`ViewerOverflowMenu.svelte:190-194`,
`ViewerHeader.svelte:142-143`) and Send (`SequenceViewerShell.svelte:277`). The
spec asks for View / Add to collection / Send (spec:295-297); Save-to-library is
the accepted stand-in for Add-to-collection — the viewer's chrome has no
collection-picker entry point at all (see Task 8's note and Known accepted
limitations).
**Bytes:** consumed. The record is deleted only at 1.14, after the viewer has
the hydrated sequence. A crash anywhere in 1.10–1.13 leaves the bytes in
IndexedDB and 1.9 replays on the next launch.

### Trace 2 — Warm launch, three images

| # | Hop | Where | Task |
|---|---|---|---|
| 2.1 | App is backgrounded; Android delivers `ACTION_SEND_MULTIPLE` to the running activity | `handleOnNewIntent` → `notifyListeners` (fires **once** — no `load()` twin) | — |
| 2.2–2.7 | Same as 1.3–1.8, minus the boot: the shell is already mounted | — | 13, 3, 5, 6, 12 |
| 2.8 | `ShareIntakeHost`'s signal `$effect` fires; runner starts | `ShareIntakeHost.svelte` | 12 |
| 2.9 | Classification yields three `image` items | `intake-classifier.ts` → `classifyIntake` | 7 |
| 2.10 | **Auth gate.** Images need a full account (`services/implementations/MessageImageSender.ts:32-34` throws for `!user \|\| user.isAnonymous`). Signed in → continue | `share-intake-runner.ts` → `requiresFullAccount` | 11 |
| 2.11 | Router opens the picker on image #1, carrying the intake's `receiptId`, reports #2 and #3 as `queued` + `send-dropped`, and toasts the count | `intake-router.ts` → `routeIntake` → `openSendAttachmentSheet` | 10, 9 |
| 2.12 | Runner sets status `ready` and **keeps the record**. It does not delete on picker-open | `share-intake-runner.ts` | 11 |
| 2.13 | User picks a conversation, hits Send; the sheet uploads via `getMessageImageSender().send(...)` | `SendAttachmentSheet.svelte` → `send()` | 9 |
| 2.14 | `onSent` → drawer resolves the intake: two files still queued → status `partially-sent`, record kept, problems visible | `InboxDrawer.svelte` → `handleSequenceSent` → `completeShareIntake` | 9, 11 |

**Terminal state:** image #1 is in the conversation; the record survives as
`partially-sent` carrying two `send-dropped` problems for #2 and #3, and the
router's toast has already told the user the other two are saved rather than
lost. Re-opening the app replays 2.8 for the remaining files.
**Bytes:** all three survive until the user has seen what happened to each.
Cancelling the picker, reloading, or force-stopping mid-flow leaves the record
`ready` with every byte intact — the previous revision deleted the record when
the picker **opened**, leaving the only copy in an in-memory `File` on
`inboxState`.

### Trace 3 — Signed out, share an image, sign in with a magic link

| # | Hop | Where | Task |
|---|---|---|---|
| 3.1–3.9 | Identical to trace 2 through classification | — | 13, 3, 5, 6, 12, 7 |
| 3.10 | **Auth gate fires.** `authState.isFullAccount` is false and the classification contains an `image` item | `share-intake-runner.ts` → `requiresFullAccount` | 11 |
| 3.11 | Status → `needs-auth`. Nothing is routed. The record is exempt from the 1 h TTL and from quota eviction | `intake-store.ts` → `NEEDS_AUTH_TTL_MS`, `makeRoomFor` | 6 |
| 3.12 | **Visible prompt**: the auth drawer opens on sign-in with share-specific copy, plus a toast | `authDrawerState.show("signin", "share-image-signin")` | 11 |
| 3.13 | User taps the emailed link. Best case it deep-links into the running app and `EmailLinkConfirmModal` completes in place (`AppShellLoader.svelte:35-37`); worst case the process was killed and this is a fresh cold start. Both are covered because the bytes are in IndexedDB, not in memory | `auth/services/email-link-completion.ts` → `completeEmailLinkSignIn` | — |
| 3.14 | `onAuthStateChanged` updates `authState` (`auth-state.svelte.ts:400`) | — | — |
| 3.15 | **The resume point.** `ShareIntakeHost`'s `$effect` on `authState.isFullAccount` re-fires and calls the runner. On a cold start its `onMount` does the same | `ShareIntakeHost.svelte` | 12 |
| 3.16 | Gate now passes; trace 2 resumes at 2.11 | — | 10, 11 |

**Terminal state:** the conversation picker is open on the shared image, with
the user signed in and the send able to succeed.
**Bytes:** survive. They were written to IndexedDB at 3.6 — before any auth
check — and `needs-auth` is the one status exempt from both the TTL and quota
eviction, so nothing can reap them during the round trip.

**Correction worth recording:** completing a magic link is **not** a full page
reload. `src/lib/shared/auth/services/email-link-completion.ts:249-253` uses
`window.history.replaceState`
to strip the consumed Firebase params and stays on the same route; there is no
`window.location` assignment, no `reload()`, no `goto()`. The durability
requirement stands anyway — the round trip leaves the app for an email client,
and the process can be killed while it is gone — but no step here may assume a
reload happens or that one is needed to re-trigger anything.

---

## Trace closure

Tasks run in dependency order. Each closes the trace steps named in its heading.
A trace is walkable end to end after the task in the right-hand column.

| Trace | Walkable after |
|---|---|
| 1 — cold launch, card | **Task 13** |
| 2 — warm launch, three images | **Task 13** |
| 3 — signed out → magic link → resume | **Task 13** |

All three land together because they share one arrival path and one host. Tasks
3–12 build the hops; Task 13 attaches the spine to the native shell. Task 14 is
verification only.

---

## File Structure

Every row names the trace step it exists to serve. A file that cannot name one
is not in this plan.

| File | Trace step | Task |
|---|---|---|
| `src/lib/shared/share-intake/domain/share-intake-models.ts` | shared vocabulary for every hop | 2 ✅, 3, 7 |
| `src/lib/shared/share-intake/domain/derive-receipt-id.ts` | 1.6 durable id | 2 ✅ |
| `src/lib/shared/inbox/domain/image-attachment-limits.ts` | 1.4 the one copy of the limits | 3 |
| `src/lib/shared/share-intake/services/intake-validator.ts` | 1.4 pre-bridge screen, post-bridge gate | 3 |
| `src/lib/shared/qr/services/tka-qr-detector.ts` | 1.11 decode a `File` directly | 4 |
| `src/lib/shared/share-intake/services/shared-file-bridge.ts` | 1.5 URI → `File` (**highest-risk unit**) | 5 |
| `src/lib/shared/share-intake/services/intake-store.ts` | 1.6 / 2.12 / 3.11 durability | 6 |
| `src/lib/shared/share-intake/services/intake-classifier.ts` | 1.10 / 2.9 per-item classification | 7 |
| `src/lib/shared/share-intake/services/open-filed-card.ts` | **1.13 the card's destination** | 8 |
| `src/lib/shared/auth/domain/auth-nudge-trigger.ts` | 3.12 the sign-in prompt's copy | 8 |
| `src/lib/shared/inbox/domain/pending-message-attachment.ts` | 2.11 sequence arm widened | 9 |
| `src/lib/shared/inbox/state/inbox-state.svelte.ts` | 2.11 `send-sequence` → `send-attachment`, `+receiptId` | 9 |
| `src/lib/shared/inbox/state/send-sequence-state.svelte.ts` | 2.11 `openSendAttachmentSheet` — the router's entry point | 9 |
| `src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte` | 2.13 actually sends the image | 9 |
| `src/lib/shared/inbox/components/InboxDrawer.svelte` | 2.14 send completion resolves the intake | 9 |
| `src/lib/shared/share-intake/services/intake-router.ts` | 1.12 / 2.11 destinations | 10 |
| `src/lib/shared/share-intake/services/share-intake-runner.ts` | 1.10 / 1.14 / 2.10 / 2.12 / 3.10 lifecycle | 11 |
| `src/lib/shared/share-intake/state/share-intake-signal.svelte.ts` | 1.7 adapter → host handoff | 12 |
| `src/lib/shared/share-intake/components/ShareIntakeHost.svelte` | **1.9 / 2.8 / 3.15 the only caller of the runner** | 12 |
| `src/lib/shared/application/components/MainApplication.svelte` | 1.9 mounts the host beside the drawers | 12 |
| `src/lib/shared/share-intake/services/native-share-adapter.ts` | 1.3–1.7 arrival | 13 |
| `src/lib/shared/share-intake/get-share-intake.ts` | 1.3 idempotent registration | 13 |
| `src/lib/shared/platform/services/native-initializer.ts` | 1.8 always boot into the shell | 13 |
| `android/app/src/main/AndroidManifest.xml` | 1.1 intent filters | 1 ✅ |

**Tasks 0, 1 and 2 are DONE and committed** (`d412cfa4e7`, `6f1e7c1c3d`,
`6153163cd6` + `134fa444f1` — hashes verified against `git log`, not carried over
from an earlier revision). Their steps below are no-ops kept for the record,
and their contracts — `deriveReceiptId(ReceiptInput): string` and the
`SharedIntake` / `ShareIntakeStatus` shapes — do not change. Start at Task 3.

**One deliberate reuse worth flagging up front:** `ShareIntakeStatus` already
carries an unused `"ready"` member (`share-intake-models.ts:7`). Trace 2.12 uses
it for "bytes staged, picker open, waiting on the user." No new status is added,
so the committed contract is untouched.

---

### Task 0: Fix the pre-existing `clients.claim()` bug — DONE (`d412cfa4e7`)

Independent of this feature — found while investigating. `self.clients.claim()`
sits outside the `event.waitUntil()` block, so activation can complete before
clients are claimed.

**Files:**
- Modify: `static/sw.js:99-113`

- [ ] **Step 1: Read the current activate handler**

Run: `sed -n '99,114p' static/sw.js`

Expected: `self.clients.claim();` appears AFTER the closing `);` of `event.waitUntil(`.

- [ ] **Step 2: Move the claim inside waitUntil**

Replace the whole `activate` listener with:

```js
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME && name !== ASSETS_3D_CACHE)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});
```

- [ ] **Step 3: Verify the existing SW test still passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/sw-offline-behavior.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(sw): claim clients inside the activate waitUntil" -- static/sw.js
```

---

### Task 1: Install the plugin and declare the intent filters — DONE

No test — this is native config. Verified by the device checklist at the end.

**Files:**
- Modify: `package.json`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Install the plugin**

Run: `npm install @capgo/capacitor-share-target@8.0.44`
Expected: added to `dependencies`, no peer warnings (peer is `@capacitor/core >=8.0.0`; repo has 8.4.2).

- [ ] **Step 2: Add the intent filters**

In `android/app/src/main/AndroidManifest.xml`, inside the existing
`<activity android:name=".MainActivity">` block, after the App Links
`<intent-filter>`, add:

```xml
<!--
    Share target. MIME types are narrowed to what the message composer
    actually accepts (MessageAttachmentPicker: JPEG/PNG/WebP). Declaring
    image/* would advertise TKA for HEIC - Android's default camera format -
    which we would then have to reject after the user already chose us.
-->
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="image/jpeg" />
    <data android:mimeType="image/png" />
    <data android:mimeType="image/webp" />
    <data android:mimeType="text/plain" />
</intent-filter>
<intent-filter>
    <action android:name="android.intent.action.SEND_MULTIPLE" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="image/jpeg" />
    <data android:mimeType="image/png" />
    <data android:mimeType="image/webp" />
</intent-filter>
```

- [ ] **Step 3: Verify the manifest parses**

Run: `npx cap sync android`
Expected: completes without error; `@capgo/capacitor-share-target` listed in the plugin output.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(share-intake): register the Android share target" -- package.json package-lock.json android/app/src/main/AndroidManifest.xml
```

---

### Task 2: Domain types and `deriveReceiptId` — DONE (`6153163cd6`, amended by `134fa444f1`)

`BridgeActivity.java:51` calls `onNewIntent(getIntent())` right after `load()`,
and the plugin handles the intent in **both**. A cold-launch share therefore
arrives twice. A random id would produce two sheets and two uploads, so the id
must be derived from content.

**Files:**
- Create: `src/lib/shared/share-intake/domain/share-intake-models.ts`
- Create: `src/lib/shared/share-intake/domain/derive-receipt-id.ts`
- Test: `tests/unit/share-intake/derive-receipt-id.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { deriveReceiptId } from "$lib/shared/share-intake/domain/derive-receipt-id";

// The delimiters an earlier revision of deriveReceiptId used. Named rather
// than inlined: raw control bytes are invisible in an editor and easy to
// mangle in a diff.
const NUL = String.fromCharCode(0);
const STX = String.fromCharCode(2);

describe("deriveReceiptId", () => {
  const shared = {
    files: [{ uri: "/cache/shared_files/a.png", name: "a.png", mimeType: "image/png", size: 1024 }],
    texts: ["hello"],
  };

  it("returns the same id for a duplicated intent", () => {
    expect(deriveReceiptId(shared)).toBe(deriveReceiptId({ ...shared }));
  });

  it("differs when the file name differs", () => {
    const other = { ...shared, files: [{ ...shared.files[0], name: "b.png" }] };
    expect(deriveReceiptId(other)).not.toBe(deriveReceiptId(shared));
  });

  it("differs when the text differs", () => {
    expect(deriveReceiptId({ ...shared, texts: ["goodbye"] })).not.toBe(deriveReceiptId(shared));
  });

  it("handles a text-only share with no files", () => {
    expect(deriveReceiptId({ files: [], texts: ["tka.run/ABC"] })).toMatch(/^si_[0-9A-Za-z]{22}$/);
  });

  it("is order-independent across files", () => {
    const a = { files: [{ uri: "/x", name: "x", mimeType: "image/png", size: 1 }, { uri: "/y", name: "y", mimeType: "image/png", size: 2 }], texts: [] };
    const b = { files: [a.files[1], a.files[0]], texts: [] };
    expect(deriveReceiptId(a)).toBe(deriveReceiptId(b));
  });

  // The headline invariant: the two cold-launch deliveries of ONE share can
  // carry different cache paths. If a future edit folds uri into the material,
  // dedup silently breaks and every cold-launch share doubles. Guard it.
  it("ignores the uri entirely", () => {
    const a = { files: [{ uri: "/cache/first/a.png", name: "a.png", mimeType: "image/png", size: 1024 }], texts: [] };
    const b = { files: [{ ...a.files[0], uri: "/cache/second/a.png" }], texts: [] };
    expect(deriveReceiptId(a)).toBe(deriveReceiptId(b));
  });

  it("differs when only the size differs", () => {
    const other = { ...shared, files: [{ ...shared.files[0], size: 2048 }] };
    expect(deriveReceiptId(other)).not.toBe(deriveReceiptId(shared));
  });

  it("distinguishes an absent size from a zero size", () => {
    const absent = { files: [{ uri: "/a", name: "a.png", mimeType: "image/png" }], texts: [] };
    const zero = { files: [{ ...absent.files[0], size: 0 }], texts: [] };
    expect(deriveReceiptId(absent)).not.toBe(deriveReceiptId(zero));
  });

  it("differs when only the mime type differs", () => {
    const other = { ...shared, files: [{ ...shared.files[0], mimeType: "image/jpeg" }] };
    expect(deriveReceiptId(other)).not.toBe(deriveReceiptId(shared));
  });

  // mimeType and text come from whichever app invoked the share, so they are
  // untrusted input. Length-prefixing is what stops a crafted value from
  // shifting a field boundary and forging a collision with a pending intake.
  it("resists delimiter injection in untrusted fields", () => {
    const split = { files: [], texts: ["a", "b"] };
    const joined = { files: [], texts: [`a${STX}b`] };
    expect(deriveReceiptId(split)).not.toBe(deriveReceiptId(joined));

    // The bytes below are the delimiters an earlier revision of this function
    // used. Under ANY delimiter scheme, embedding them in untrusted content
    // shifts a field boundary and forges a collision. Length-prefixing makes no
    // byte special, so these pairs must stay distinct. Both assertions below
    // FAIL against the delimiter-based implementation - that is the point.
    const injectedText = { files: [], texts: [`a${STX}b`] };
    const twoTexts = { files: [], texts: ["a", "b"] };
    expect(deriveReceiptId(injectedText)).not.toBe(deriveReceiptId(twoTexts));

    const nameCarries = { files: [{ uri: "/a", name: `a${NUL}b`, mimeType: "c", size: 1 }], texts: [] };
    const mimeCarries = { files: [{ uri: "/a", name: "a", mimeType: `b${NUL}c`, size: 1 }], texts: [] };
    expect(deriveReceiptId(nameCarries)).not.toBe(deriveReceiptId(mimeCarries));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/derive-receipt-id.test.ts`
Expected: FAIL — cannot resolve module `derive-receipt-id`.

- [ ] **Step 3: Write the models**

Create `src/lib/shared/share-intake/domain/share-intake-models.ts`:

```ts
/** Where an intake came from. Only "native" is implemented; "pwa" is reserved. */
export type ShareIntakeSource = "native" | "pwa";

export type ShareIntakeStatus =
  | "received"
  | "needs-auth"
  | "ready"
  | "partially-sent"
  | "failed"
  | "expired";

/** A file as the plugin hands it to us: a path, not bytes. */
export interface SharedFileDescriptor {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}

/** Normalized payload. Everything downstream is platform-blind. */
export interface SharedIntake {
  receiptId: string;
  source: ShareIntakeSource;
  files: File[];
  text?: string;
  title?: string;
  status: ShareIntakeStatus;
  receivedAt: number;
}

/**
 * What `deriveReceiptId` hashes. Deliberately NOT `SharedIntake`: the id has to
 * be computed from the plugin's raw descriptors, before any File exists.
 *
 * `texts` is plural while `SharedIntake.text` is a single optional string
 * because Android can deliver several EXTRA_TEXT values. The adapter maps
 * absence to an EMPTY ARRAY, never to `[""]` - the two hash differently, and
 * picking the wrong one desyncs the id between the two cold-launch deliveries.
 *
 * `title` (Android EXTRA_SUBJECT) is intentionally NOT hashed: it is decorative,
 * and some senders populate it inconsistently between deliveries.
 */
export interface ReceiptInput {
  files: SharedFileDescriptor[];
  texts: string[];
}

/** Per-item routing decision. Classification is per file, never per batch. */
export type IntakeItem =
  | { kind: "card"; code: string; file: File }
  | { kind: "image"; file: File };

export interface IntakeClassification {
  items: IntakeItem[];
  /** A TKA code found in the shared text, if any. */
  textCode: string | null;
  /** Shared text that was not a TKA code. Becomes prefilled message text. */
  residualText: string | null;
}
```

- [ ] **Step 4: Write `deriveReceiptId`**

Create `src/lib/shared/share-intake/domain/derive-receipt-id.ts`:

```ts
import { hashString } from "$lib/shared/foundation/services/content-hasher";
import type { ReceiptInput } from "./share-intake-models";

/**
 * Length-prefix a field so its content cannot shift a boundary in the hashed
 * material. `mimeType` and the shared text come from whichever app invoked the
 * share, so they are untrusted: with plain delimiters, a crafted value lets an
 * unrelated share forge the receipt id of a pending one and be swallowed as a
 * duplicate.
 */
function field(value: string): string {
  return `${value.length}:${value}`;
}

/**
 * A stable id derived from the share's CONTENT, not from a counter or clock.
 *
 * Why this matters: Capacitor's BridgeActivity calls onNewIntent(getIntent())
 * immediately after load(), and @capgo/capacitor-share-target handles the
 * intent in both. A cold-launch share fires twice. Deriving the id from content
 * makes the second delivery a no-op instead of a duplicate upload.
 *
 * Files are sorted so two deliveries that enumerate in a different order still
 * collapse to one id. The uri is deliberately EXCLUDED - the plugin can write
 * the same share to a different cache path on the second delivery.
 *
 * Consequence worth knowing: two genuinely different files that agree on
 * name + mimeType + size hash identically. That is the accepted cost of
 * excluding the uri without reading bytes, and it is bounded by the store's
 * one-hour TTL (Task 5).
 */
export function deriveReceiptId(input: ReceiptInput): string {
  const fileParts = input.files
    .map((f) =>
      [
        field(f.name),
        field(f.mimeType),
        // "-" and "0" must not collapse: if one delivery reports a size and the
        // other omits it, the ids MUST diverge visibly rather than silently
        // agreeing on a sentinel that hides the desync.
        field(f.size === undefined ? "-" : String(f.size)),
      ].join("")
    )
    .sort();

  // The file count is length-prefixed first, so the files/texts boundary is
  // positional and cannot be forged by any field value.
  const material = [
    field(String(fileParts.length)),
    ...fileParts,
    ...input.texts.map(field),
  ].join("");

  // hashString is the repo's 128-bit FNV-1a, emitting a fixed-width 22-char
  // base62 digest (content-hasher.ts:156). Fixed width matters: concatenating
  // two variable-length digests makes its own split point ambiguous.
  return `si_${hashString(material)}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/derive-receipt-id.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(share-intake): content-derived receipt id for cold-launch dedup" -- src/lib/shared/share-intake/domain/ tests/unit/share-intake/derive-receipt-id.test.ts
```

---

### Task 3: Shared image limits, the problem record, and the validation gate — DONE (`d231c87d6d`, `92130ddbfe`)

**Closes trace step 1.4** (and its twin in traces 2 and 3): every arriving
descriptor is screened before a byte is read, and every drop leaves a record.

Three things that have to land together:

1. The 10 MB / JPEG-PNG-WebP limits are currently **copy-duplicated** —
   `MessageAttachmentPicker.svelte:9-11` declares them inline and the first
   draft of this plan declared them again in the validator. Two copies of a
   security boundary drift. One module owns them; both import it.
2. `IntakeProblem` — the record that makes "nothing fails silently" possible.
   Every drop from here to Task 11 pushes one of these onto the intake.
3. The gate itself, in **two halves**: `screenDescriptors` runs on the plugin's
   raw descriptors **before** the bridge reads a single byte (mime type + count),
   and `validateIntake` runs on the bridged `File`s (size, emptiness, names,
   text, title).

The split matters: with a single post-bridge gate, a 200 MB HEIC is fully read
into WebView memory and only then rejected.

**Files:**
- Create: `src/lib/shared/inbox/domain/image-attachment-limits.ts`
- Modify: `src/lib/shared/inbox/components/messages/MessageAttachmentPicker.svelte:9-11`
- Modify: `src/lib/shared/share-intake/domain/share-intake-models.ts` (add `IntakeProblem`, `SharedIntake.problems`; drop the unwritten `"expired"` status)
- Create: `src/lib/shared/share-intake/services/intake-validator.ts`
- Test: `tests/unit/share-intake/intake-validator.test.ts`

- [ ] **Step 1: Create the shared limits module**

Create `src/lib/shared/inbox/domain/image-attachment-limits.ts`:

```ts
/**
 * The one place the message-attachment image limits live.
 *
 * MessageAttachmentPicker declared these inline and share intake needs exactly
 * the same numbers - intake bypasses the picker entirely, so a second copy is
 * a security boundary that can drift. Both import from here.
 */

/** Matches the picker's original MAX_IMAGE_BYTES. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Deliberately not `image/*`. HEIC is Android's default camera format and the
 * composer cannot decode it, so advertising it would mean rejecting the user
 * AFTER they already picked TKA from the share sheet.
 */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AllowedImageType = (typeof IMAGE_TYPES)[number];

/** `accept` attribute value for a file input. */
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");

const ALLOWED = new Set<string>(IMAGE_TYPES);

export function isAllowedImageType(
  mimeType: string
): mimeType is AllowedImageType {
  return ALLOWED.has(mimeType.trim().toLowerCase());
}
```

- [ ] **Step 2: Point the picker at it**

In `src/lib/shared/inbox/components/messages/MessageAttachmentPicker.svelte`,
delete these three lines (currently 9-11):

```ts
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
  const IMAGE_ACCEPT = IMAGE_TYPES.join(",");
```

and add this import next to the other `../../domain/` import (line 6):

```ts
  import {
    MAX_IMAGE_BYTES,
    IMAGE_TYPES,
    IMAGE_ACCEPT,
  } from "../../domain/image-attachment-limits";
```

Nothing else in the file changes — the three identifiers keep their names.

- [ ] **Step 3: Add `IntakeProblem` to the domain model, and drop the dead `expired` status**

`ShareIntakeStatus` (committed in Task 2) carries an `"expired"` member that no
code ever writes: `reapExpired` (Task 6) **deletes** a stale record outright —
it never sets a status. A status value nothing produces is dead weight on an
exhaustive union; remove it here while the file is already being touched.

In `src/lib/shared/share-intake/domain/share-intake-models.ts`, change:

```ts
export type ShareIntakeStatus =
  | "received"
  | "needs-auth"
  | "ready"
  | "partially-sent"
  | "failed"
  | "expired";
```

to:

```ts
export type ShareIntakeStatus =
  | "received"
  | "needs-auth"
  | "ready"
  | "partially-sent"
  | "failed";
```

Then, still in the same file, insert after the `SharedFileDescriptor` interface:

```ts
/**
 * Why one piece of a share did not make it. Every drop in the pipeline pushes
 * one of these onto the intake and logs it. A bare `return` that swallows a
 * file is the failure mode this type exists to make impossible.
 */
export type IntakeProblemReason =
  | "unsupported-type"
  | "too-large"
  | "empty"
  | "too-many"
  | "unreachable"
  | "not-found"
  | "text-truncated"
  | "title-truncated"
  | "decode-failed"
  | "resolve-failed"
  | "route-failed"
  | "send-dropped";

export interface IntakeProblem {
  /** The file (or code) this concerns. Empty string when it concerns the share itself. */
  name: string;
  reason: IntakeProblemReason;
  /** Technical detail for the console. Never rendered raw to the user. */
  detail?: string;
}
```

and add the field to `SharedIntake`, after `receivedAt`:

```ts
  /** Everything that was dropped, truncated, or failed. Never empty silently. */
  problems: IntakeProblem[];
```

- [ ] **Step 4: Write the failing test**

Create `tests/unit/share-intake/intake-validator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MAX_IMAGE_BYTES } from "$lib/shared/inbox/domain/image-attachment-limits";
import {
  validateIntake,
  screenDescriptors,
  safeName,
  MAX_INTAKE_BYTES,
  MAX_INTAKE_FILES,
  MAX_INTAKE_TEXT,
  MAX_INTAKE_TITLE,
  MAX_INTAKE_NAME,
} from "$lib/shared/share-intake/services/intake-validator";

function fileOf(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function descriptor(name: string, mimeType: string) {
  return { uri: `/cache/shared_files/${name}`, name, mimeType };
}

const reasons = (result: { problems: { reason: string }[] }) =>
  result.problems.map((p) => p.reason);

describe("intake limits", () => {
  it("uses the picker's byte cap rather than a second copy of it", () => {
    expect(MAX_INTAKE_BYTES).toBe(MAX_IMAGE_BYTES);
  });
});

describe("safeName", () => {
  it("strips any directory component", () => {
    expect(safeName("../../evil.png")).toBe("evil.png");
  });

  it("falls back for an all-dots basename", () => {
    expect(safeName("..")).toBe("shared-image");
    expect(safeName("...")).toBe("shared-image");
  });

  it("falls back for an empty or control-only name", () => {
    expect(safeName("")).toBe("shared-image");
    expect(safeName("\u0007\u0007")).toBe("shared-image");
  });

  it("caps a long name and keeps the extension", () => {
    const long = `${"a".repeat(400)}.png`;
    const result = safeName(long);
    expect(result.length).toBe(MAX_INTAKE_NAME);
    expect(result.endsWith(".png")).toBe(true);
  });
});

describe("screenDescriptors", () => {
  it("admits the allowed mime types", () => {
    const result = screenDescriptors([
      descriptor("a.png", "image/png"),
      descriptor("b.jpg", "image/jpeg"),
      descriptor("c.webp", "image/webp"),
    ]);
    expect(result.admitted).toHaveLength(3);
    expect(result.problems).toHaveLength(0);
  });

  it("rejects an unsupported type BEFORE anything reads its bytes", () => {
    const result = screenDescriptors([descriptor("a.heic", "image/heic")]);
    expect(result.admitted).toHaveLength(0);
    expect(reasons(result)).toEqual(["unsupported-type"]);
  });

  it("reports unsupported-type, not too-many, for an over-cap rejected type", () => {
    const files = [
      ...Array.from({ length: MAX_INTAKE_FILES }, (_, i) =>
        descriptor(`ok${i}.png`, "image/png")
      ),
      descriptor("late.heic", "image/heic"),
    ];
    const result = screenDescriptors(files);
    expect(result.admitted).toHaveLength(MAX_INTAKE_FILES);
    expect(reasons(result)).toEqual(["unsupported-type"]);
  });

  it("caps the count once the type check has passed", () => {
    const files = Array.from({ length: MAX_INTAKE_FILES + 3 }, (_, i) =>
      descriptor(`f${i}.png`, "image/png")
    );
    const result = screenDescriptors(files);
    expect(result.admitted).toHaveLength(MAX_INTAKE_FILES);
    expect(reasons(result)).toEqual(["too-many", "too-many", "too-many"]);
  });

  it("reports the sanitized name, not the raw one", () => {
    const result = screenDescriptors([descriptor("../../evil.heic", "image/heic")]);
    expect(result.problems[0].name).toBe("evil.heic");
  });
});

describe("validateIntake", () => {
  it("accepts a normal png", () => {
    const result = validateIntake({ files: [fileOf("a.png", "image/png", 100)] });
    expect(result.accepted).toHaveLength(1);
    expect(result.problems).toHaveLength(0);
  });

  it("rejects a zero-byte file", () => {
    const result = validateIntake({ files: [fileOf("empty.png", "image/png", 0)] });
    expect(reasons(result)).toEqual(["empty"]);
  });

  it("rejects a file over the byte cap", () => {
    const result = validateIntake({
      files: [fileOf("big.png", "image/png", MAX_INTAKE_BYTES + 1)],
    });
    expect(reasons(result)).toEqual(["too-large"]);
  });

  it("sanitizes the accepted file's name", () => {
    const result = validateIntake({
      files: [fileOf("../../evil.png", "image/png", 10)],
    });
    expect(result.accepted[0].name).toBe("evil.png");
    expect(result.accepted[0].type).toBe("image/png");
  });

  it("truncates text past the cap and says so", () => {
    const result = validateIntake({ files: [], text: "x".repeat(5000) });
    expect(result.text?.length).toBe(MAX_INTAKE_TEXT);
    expect(reasons(result)).toEqual(["text-truncated"]);
  });

  it("truncates the sender-controlled title past its own cap", () => {
    const result = validateIntake({ files: [], title: "t".repeat(5000) });
    expect(result.title?.length).toBe(MAX_INTAKE_TITLE);
    expect(reasons(result)).toEqual(["title-truncated"]);
  });

  it("leaves a short clean title alone and reports nothing", () => {
    // A DIFFERENT input from the control-character test below, on purpose.
    // An earlier revision shipped both tests with the same input, so one of
    // the two asserted nothing the other did not.
    const result = validateIntake({ files: [], title: "Shared photos" });
    expect(result.title).toBe("Shared photos");
    expect(result.problems).toHaveLength(0);
  });

  it("strips control characters out of the title without flagging a problem", () => {
    const result = validateIntake({ files: [], title: "Pho\u0007tos" });
    expect(result.title).toBe("Photos");
    // Sanitizing is not worth reporting to the user; only truncation is.
    expect(result.problems).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Run the test and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/intake-validator.test.ts`
Expected: FAIL — `Failed to resolve import ".../intake-validator"`.

- [ ] **Step 6: Write the validator**

Create `src/lib/shared/share-intake/services/intake-validator.ts`:

```ts
import {
  MAX_IMAGE_BYTES,
  isAllowedImageType,
} from "$lib/shared/inbox/domain/image-attachment-limits";
import type {
  IntakeProblem,
  SharedFileDescriptor,
} from "../domain/share-intake-models";

/**
 * Boundary checks for content arriving from ANY app on the device.
 *
 * Scope limit, stated honestly: on native the plugin has already copied the
 * bytes to cacheDir/shared_files before we are notified, with no size or count
 * limit. This gate protects IndexedDB, the QR decoder, and the uploader. It
 * cannot protect the disk. That is an accepted cost of using the plugin
 * unmodified (see the spec's Spike results).
 */

/** Same cap as the picker, imported rather than re-declared. */
export const MAX_INTAKE_BYTES = MAX_IMAGE_BYTES;
export const MAX_INTAKE_FILES = 20;
export const MAX_INTAKE_TEXT = 2000;
export const MAX_INTAKE_TITLE = 200;
export const MAX_INTAKE_NAME = 120;

const FALLBACK_NAME = "shared-image";
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Normalize a sender-supplied filename.
 *
 * The plugin writes the sender's name verbatim into its cache dir with no
 * sanitization, so "../" and control bytes are both possible. We never reuse
 * the raw name for a filesystem write, but it DOES reach the message
 * attachment and the rejection list the user reads, so it is normalized on the
 * way in - including on the rejection path, which the first draft skipped.
 */
export function safeName(raw: string): string {
  const base = (raw.split(/[/\\]/).pop() ?? "")
    .replace(CONTROL_CHARS, "")
    .trim();

  // "." and ".." survive the split above and are not names.
  if (base.length === 0 || /^\.+$/.test(base)) return FALLBACK_NAME;
  if (base.length <= MAX_INTAKE_NAME) return base;

  // Keep a short trailing extension so the truncated name still reads as an
  // image rather than as a hash.
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 && base.length - dot <= 6 ? base.slice(dot) : "";
  return base.slice(0, MAX_INTAKE_NAME - ext.length) + ext;
}

function cleanText(raw: string, cap: number): { value: string; truncated: boolean } {
  const cleaned = raw.replace(CONTROL_CHARS, "").trim();
  return cleaned.length > cap
    ? { value: cleaned.slice(0, cap), truncated: true }
    : { value: cleaned, truncated: false };
}

export interface DescriptorScreen {
  admitted: SharedFileDescriptor[];
  problems: IntakeProblem[];
}

/**
 * Pre-bridge screen: mime type and count only, because those are the two
 * things knowable WITHOUT reading the file. Running this first is what stops a
 * 200 MB share from being pulled into WebView memory just to be rejected.
 *
 * Order is load-bearing: the type check runs before the count cap, so the 21st
 * HEIC is reported as unsupported-type rather than as too-many, which is what
 * the user actually needs to be told.
 */
export function screenDescriptors(
  descriptors: SharedFileDescriptor[]
): DescriptorScreen {
  const admitted: SharedFileDescriptor[] = [];
  const problems: IntakeProblem[] = [];

  for (const descriptor of descriptors) {
    const name = safeName(descriptor.name);

    if (!isAllowedImageType(descriptor.mimeType)) {
      problems.push({
        name,
        reason: "unsupported-type",
        detail: descriptor.mimeType,
      });
      continue;
    }
    if (admitted.length >= MAX_INTAKE_FILES) {
      problems.push({ name, reason: "too-many" });
      continue;
    }
    admitted.push({ ...descriptor, name });
  }

  return { admitted, problems };
}

export interface ValidationResult {
  accepted: File[];
  problems: IntakeProblem[];
  text: string | null;
  title: string | null;
}

/**
 * Post-bridge gate: everything that needs real bytes.
 *
 * `title` comes from Android's EXTRA_SUBJECT - unbounded, sender-controlled,
 * and persisted. The first draft validated the text and left the title
 * unchecked; both are capped here.
 */
export function validateIntake(input: {
  files: File[];
  text?: string;
  title?: string;
}): ValidationResult {
  const accepted: File[] = [];
  const problems: IntakeProblem[] = [];

  for (const file of input.files) {
    const name = safeName(file.name);

    if (!isAllowedImageType(file.type)) {
      problems.push({ name, reason: "unsupported-type", detail: file.type });
      continue;
    }
    if (file.size <= 0) {
      problems.push({ name, reason: "empty" });
      continue;
    }
    if (file.size > MAX_INTAKE_BYTES) {
      problems.push({ name, reason: "too-large", detail: `${file.size} bytes` });
      continue;
    }
    if (accepted.length >= MAX_INTAKE_FILES) {
      problems.push({ name, reason: "too-many" });
      continue;
    }

    accepted.push(
      name === file.name ? file : new File([file], name, { type: file.type })
    );
  }

  let text: string | null = null;
  if (input.text) {
    const cleaned = cleanText(input.text, MAX_INTAKE_TEXT);
    text = cleaned.value.length > 0 ? cleaned.value : null;
    // Truncation used to be silent. A share whose link sat at character 2100
    // simply stopped resolving with no trace of why.
    if (cleaned.truncated) problems.push({ name: "", reason: "text-truncated" });
  }

  let title: string | null = null;
  if (input.title) {
    const cleaned = cleanText(input.title, MAX_INTAKE_TITLE);
    title = cleaned.value.length > 0 ? cleaned.value : null;
    if (cleaned.truncated) problems.push({ name: "", reason: "title-truncated" });
  }

  return { accepted, problems, text, title };
}
```

- [ ] **Step 7: Run the test and watch it pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/intake-validator.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 8: Confirm the picker still compiles against the shared module**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error --output human 2>&1 | grep -iE "MessageAttachmentPicker|image-attachment-limits" | head -20`
Expected: no output (no errors mentioning either file).

- [ ] **Step 9: Confirm the dead status is gone**

Run: `grep -n "expired" src/lib/shared/share-intake/domain/share-intake-models.ts`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git commit -m "feat(share-intake): shared image limits, problem records, two-stage validation gate" -- src/lib/shared/inbox/domain/image-attachment-limits.ts src/lib/shared/inbox/components/messages/MessageAttachmentPicker.svelte src/lib/shared/share-intake/domain/share-intake-models.ts src/lib/shared/share-intake/services/intake-validator.ts tests/unit/share-intake/intake-validator.test.ts
```

---

### Task 4: Widen the shared QR detector to `ImageBitmapSource` — DONE (`986ad48750`)

**Closes trace step 1.11.** Without this the classifier cannot read a QR out of
a shared `File` without a hand-rolled canvas round trip.

`TkaQrDetector.detect` is typed `(frame: ImageData)` — narrower than what it
actually wraps. Verified in
`node_modules/barcode-detector/dist/es/core.d.ts`:

```ts
detect(image: ImageBitmapSourceWebCodecs): Promise<DetectedBarcode[]>;
```

and `dist/es/utils.d.ts` defines that as
`CanvasImageSourceWebCodecs | Blob | ImageData`. **The ponyfill already accepts
a `Blob`**, and a `File` *is* a `Blob`. The narrowed signature is the only
reason the first draft hand-rolled a
`createImageBitmap` → `<canvas>` → `drawImage` → `getImageData` dance to feed
it a still image. That is exactly what `.claude/rules/never-hand-roll.md`
forbids: 12 lines re-deriving a decode path the library performs internally.

Widening the shared type deletes that code before it is written. `ScanCardSheet`
keeps passing `ImageData` and is unaffected — `ImageData` is a member of the
widened union.

**Files:**
- Modify: `src/lib/shared/qr/services/tka-qr-detector.ts:26-29,45`

- [ ] **Step 1: Confirm the ponyfill's real signature**

Run: `grep -n "detect(image" node_modules/barcode-detector/dist/es/core.d.ts && grep -n "ImageBitmapSourceWebCodecs =" node_modules/barcode-detector/dist/es/utils.d.ts`

Expected:
```
20:    detect(image: ImageBitmapSourceWebCodecs): Promise<DetectedBarcode[]>;
3:export type ImageBitmapSourceWebCodecs = CanvasImageSourceWebCodecs | Blob | ImageData;
```

- [ ] **Step 2: Widen the interface**

In `src/lib/shared/qr/services/tka-qr-detector.ts`, replace the
`TkaQrDetector` interface:

```ts
export interface TkaQrDetector {
	/**
	 * Every QR found in the source, with its location.
	 *
	 * Accepts anything the underlying ponyfill accepts - an ImageData frame
	 * from the camera (ScanCardSheet), or a Blob/File straight off disk (share
	 * intake). Do NOT decode a File to ImageData by hand before calling this:
	 * zxing-wasm decodes a Blob internally and the canvas round trip is pure
	 * cost.
	 */
	detect(source: ImageBitmapSource): Promise<TkaQrDetection[]>;
}
```

and the implementation's `detect`:

```ts
		async detect(source: ImageBitmapSource): Promise<TkaQrDetection[]> {
			const results = await detector.detect(source);
```

Nothing else in the file changes.

- [ ] **Step 3: Prove the camera call site still typechecks**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error --output human 2>&1 | grep -iE "tka-qr-detector|ScanCardSheet" | head -20`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(qr): accept any ImageBitmapSource in the shared detector" -- src/lib/shared/qr/services/tka-qr-detector.ts
```

---

### Task 5: The `SharedFile` → `File` bridge — DONE (`23c86928c7`)

**Closes trace step 1.5** (and 2.x / 3.x, which share it). This is the hop that
turns the plugin's cache paths into bytes the rest of the trace can carry.

**This is the highest-risk unit in the design.** The plugin returns
`getAbsolutePath()` — a raw filesystem path, not a `file://` URI and not
fetchable from the WebView. Everything downstream (`PendingMessageAttachment`,
`IMessageImageSender`, the QR decoder) assumes a real `File`.

Four defects the first draft shipped, all fixed here:

- **The path was not percent-encoded.** `Capacitor.convertFileSrc` is a plain
  string concat onto the local bridge origin; it does not encode. The plugin
  writes the **sender's display name** verbatim into the cache path, so a file
  named `photo#2.png` truncates at the `#` and 404s.
- **Failures returned bare `null` and were `.filter()`ed away** with no record
  of what was lost.
- **The size check was downstream of the read**, so a 200 MB file was pulled
  fully into WebView memory before being rejected.
- **`Promise.all` fanned out every read at once** — 20 concurrent whole-file
  fetches.

**Files:**
- Create: `src/lib/shared/share-intake/services/shared-file-bridge.ts`
- Test: `tests/unit/share-intake/shared-file-bridge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/share-intake/shared-file-bridge.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => "android"),
    // Capacitor's real implementation is a string concat with no encoding.
    // Modelling it faithfully is the whole point of this suite.
    convertFileSrc: vi.fn((p: string) => `https://localhost/_capacitor_file_${p}`),
  },
}));

import { Capacitor } from "@capacitor/core";
import {
  sharedFileToFile,
  sharedFilesToFiles,
  toFetchableUrl,
} from "$lib/shared/share-intake/services/shared-file-bridge";
import { MAX_INTAKE_BYTES } from "$lib/shared/share-intake/services/intake-validator";

function descriptor(name: string, uri = `/cache/shared_files/${name}`) {
  return { uri, name, mimeType: "image/png" };
}

/** A duck-typed Response so a test can assert the body was never read. */
function fakeResponse(options: {
  ok?: boolean;
  status?: number;
  contentLength?: string | null;
  bytes?: Uint8Array;
  arrayBufferSpy?: ReturnType<typeof vi.fn>;
}) {
  const bytes = options.bytes ?? new Uint8Array([1, 2, 3]);
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: { get: () => options.contentLength ?? null },
    arrayBuffer:
      options.arrayBufferSpy ??
      vi.fn(async () => bytes.buffer.slice(0) as ArrayBuffer),
  };
}

describe("toFetchableUrl", () => {
  beforeEach(() => {
    vi.mocked(Capacitor.convertFileSrc).mockImplementation(
      (p: string) => `https://localhost/_capacitor_file_${p}`
    );
  });

  it("percent-encodes each path segment before converting", () => {
    // Without this the URL truncates at the '#' and the fetch 404s.
    expect(toFetchableUrl("/cache/shared_files/photo#2.png")).toBe(
      "https://localhost/_capacitor_file_/cache/shared_files/photo%232.png"
    );
  });

  it("encodes spaces and question marks too", () => {
    expect(toFetchableUrl("/c/my photo?.png")).toBe(
      "https://localhost/_capacitor_file_/c/my%20photo%3F.png"
    );
  });

  it("passes an already-schemed uri through untouched", () => {
    // The plugin's own docs say the uri may be a data URL. Encoding one
    // destroys it, and it is already fetchable.
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    expect(toFetchableUrl(dataUrl)).toBe(dataUrl);
    expect(Capacitor.convertFileSrc).not.toHaveBeenCalled();
  });
});

describe("sharedFileToFile", () => {
  beforeEach(() => {
    vi.mocked(Capacitor.convertFileSrc).mockImplementation(
      (p: string) => `https://localhost/_capacitor_file_${p}`
    );
  });

  it("returns a File with the descriptor's name, type, and real bytes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({})));

    const outcome = await sharedFileToFile(descriptor("a.png"));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.file).toBeInstanceOf(File);
    expect(outcome.file.name).toBe("a.png");
    expect(outcome.file.type).toBe("image/png");
    expect(outcome.file.size).toBe(3);
    expect(new Uint8Array(await outcome.file.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });

  it("reports the real byte size back on the descriptor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({})));

    const outcome = await sharedFileToFile(descriptor("a.png"));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // The durable receiptId is derived from this. The plugin's SharedFile has
    // no size field at all, so without it the id degrades to name+mimeType.
    expect(outcome.descriptor.size).toBe(3);
  });

  it("sanitizes a path-traversing name onto the File", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({})));

    const outcome = await sharedFileToFile(descriptor("../../evil.png", "/c/x.png"));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.file.name).toBe("evil.png");
  });

  it("records unreachable instead of throwing when the fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ENOENT");
    }));

    const outcome = await sharedFileToFile(descriptor("gone.png"));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem).toMatchObject({ name: "gone.png", reason: "unreachable" });
    expect(outcome.problem.detail).toContain("ENOENT");
  });

  it("records not-found on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ ok: false, status: 404 })));

    const outcome = await sharedFileToFile(descriptor("missing.png"));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem).toMatchObject({ reason: "not-found", detail: "HTTP 404" });
  });

  it("rejects an oversized declared length WITHOUT reading the body", async () => {
    const arrayBufferSpy = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () =>
      fakeResponse({
        contentLength: String(MAX_INTAKE_BYTES + 1),
        arrayBufferSpy,
      })
    ));

    const outcome = await sharedFileToFile(descriptor("huge.png"));

    expect(outcome.ok).toBe(false);
    // The point of the header check: a 200 MB file must never reach memory.
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it("rejects an oversized body when no length was declared", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      fakeResponse({ bytes: new Uint8Array(MAX_INTAKE_BYTES + 1) })
    ));

    const outcome = await sharedFileToFile(descriptor("huge.png"));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.reason).toBe("too-large");
  });

  it("records empty for a zero-byte body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ bytes: new Uint8Array(0) })));

    const outcome = await sharedFileToFile(descriptor("empty.png"));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.reason).toBe("empty");
  });
});

describe("sharedFilesToFiles", () => {
  beforeEach(() => {
    vi.mocked(Capacitor.convertFileSrc).mockImplementation(
      (p: string) => `https://localhost/_capacitor_file_${p}`
    );
  });

  it("keeps order, keeps failures as problems, and never drops silently", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("bad") ? fakeResponse({ ok: false, status: 404 }) : fakeResponse({})
    ));

    const result = await sharedFilesToFiles([
      descriptor("a.png"),
      descriptor("bad.png"),
      descriptor("c.png"),
    ]);

    expect(result.bridged.map((b) => b.file.name)).toEqual(["a.png", "c.png"]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].name).toBe("bad.png");
  });

  it("never runs more than four reads at once", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return fakeResponse({});
    }));

    await sharedFilesToFiles(
      Array.from({ length: 20 }, (_, i) => descriptor(`f${i}.png`))
    );

    // Promise.all over 20 descriptors fanned out 20 whole-file reads at once.
    expect(peak).toBeLessThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/shared-file-bridge.test.ts`
Expected: FAIL — `Failed to resolve import ".../shared-file-bridge"`.

- [ ] **Step 3: Write the bridge**

Create `src/lib/shared/share-intake/services/shared-file-bridge.ts`:

```ts
import { Capacitor } from "@capacitor/core";
import type {
  IntakeProblem,
  SharedFileDescriptor,
} from "../domain/share-intake-models";
import { MAX_INTAKE_BYTES, safeName } from "./intake-validator";

/** Anything already carrying a scheme (data:, blob:, https:) is fetchable as-is. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Four at a time. Each read pulls a whole image into WebView memory; a
 * Promise.all over a 20-file SEND_MULTIPLE fans out 20 of them simultaneously,
 * which on a mid-range Android device is how the WebView gets killed.
 */
const MAX_CONCURRENT_READS = 4;

/**
 * Make a plugin URI reachable from the WebView.
 *
 * Capacitor.convertFileSrc is a plain string concat onto the local bridge
 * origin - it does NOT percent-encode. The plugin writes the SENDER'S display
 * name verbatim into the cache path, so "photo#2.png" would truncate at the
 * '#' and 404, and a name with a space or '?' fails the same way. Each path
 * segment is encoded first, leaving the separators intact.
 */
export function toFetchableUrl(uri: string): string {
  if (HAS_SCHEME.test(uri)) return uri;
  const encoded = uri.split("/").map(encodeURIComponent).join("/");
  return Capacitor.convertFileSrc(encoded);
}

export type BridgeOutcome =
  | { ok: true; file: File; descriptor: SharedFileDescriptor }
  | { ok: false; problem: IntakeProblem };

/**
 * Turn one plugin descriptor into a real File.
 *
 * Isolated behind this one function on purpose: if convertFileSrc proves
 * unreliable across Android versions, the fallback is Filesystem.readFile ->
 * base64 -> Blob, and only this file changes.
 *
 * Never throws and never returns a bare null. A share can reference a file the
 * sending app already revoked; that has to be RECORDED, because
 * "TKA opened and nothing happened" is the exact symptom the device matrix is
 * hunting for.
 */
export async function sharedFileToFile(
  descriptor: SharedFileDescriptor
): Promise<BridgeOutcome> {
  const name = safeName(descriptor.name);

  let response: Response;
  try {
    response = await fetch(toFetchableUrl(descriptor.uri));
  } catch (caught) {
    return {
      ok: false,
      problem: { name, reason: "unreachable", detail: String(caught) },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      problem: { name, reason: "not-found", detail: `HTTP ${response.status}` },
    };
  }

  // Check the DECLARED length before reading. Without this a 200 MB file is
  // pulled fully into WebView memory just to be rejected one line later.
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_INTAKE_BYTES) {
    return {
      ok: false,
      problem: { name, reason: "too-large", detail: `${declared} bytes declared` },
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (caught) {
    return {
      ok: false,
      problem: { name, reason: "unreachable", detail: String(caught) },
    };
  }

  if (bytes.byteLength === 0) {
    return { ok: false, problem: { name, reason: "empty" } };
  }
  // The header is advisory and often absent on the bridge scheme, so the real
  // length is checked too.
  if (bytes.byteLength > MAX_INTAKE_BYTES) {
    return {
      ok: false,
      problem: { name, reason: "too-large", detail: `${bytes.byteLength} bytes` },
    };
  }

  // new File([bytes]), NOT new File([blob]): jsdom's File constructor
  // stringifies a Node Blob into "[object Blob]", so a blob-built File is 15
  // bytes of garbage under vitest and correct in a browser - a test that can
  // never be trusted. A Uint8Array behaves identically in both.
  const file = new File([bytes], name, { type: descriptor.mimeType });

  // The plugin's SharedFile has no size field, so the descriptor's size is
  // undefined until right here. Task 13 derives the durable receiptId from
  // THIS descriptor, which is what stops two same-named screenshots colliding.
  return { ok: true, file, descriptor: { ...descriptor, name, size: file.size } };
}

export interface BridgeBatch {
  bridged: Array<{ file: File; descriptor: SharedFileDescriptor }>;
  problems: IntakeProblem[];
}

/**
 * Bridge a batch with bounded concurrency, preserving input order and keeping
 * a problem record for every file that did not make it.
 */
export async function sharedFilesToFiles(
  descriptors: SharedFileDescriptor[]
): Promise<BridgeBatch> {
  const slots: Array<{ file: File; descriptor: SharedFileDescriptor } | undefined> =
    new Array(descriptors.length);
  const problems: IntakeProblem[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < descriptors.length) {
      const index = cursor;
      cursor += 1;
      const outcome = await sharedFileToFile(descriptors[index]);
      if (outcome.ok) {
        slots[index] = { file: outcome.file, descriptor: outcome.descriptor };
      } else {
        problems.push(outcome.problem);
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_READS, descriptors.length) },
      () => worker()
    )
  );

  return {
    bridged: slots.filter(
      (slot): slot is { file: File; descriptor: SharedFileDescriptor } =>
        slot !== undefined
    ),
    problems,
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/shared-file-bridge.test.ts`
Expected: PASS, 13 tests (3 toFetchableUrl + 8 sharedFileToFile + 2 sharedFilesToFiles — an earlier revision miscounted this suite as 12).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(share-intake): bridge plugin URIs to Files with encoding, size gating, and recorded failures" -- src/lib/shared/share-intake/services/shared-file-bridge.ts tests/unit/share-intake/shared-file-bridge.test.ts
```

---
### Task 6: Durable intake store — DONE (`daa0e693ff`)

**Closes trace steps 1.6, 2.12 and 3.11.** This is the only reason any of the
three traces can survive a reload, a crash, or a trip to an email client.

Replaces read-and-delete, which contradicted "survives an auth redirect". A
reload, crash, or rejected route must not lose the only copy.

Seven defects earlier revisions shipped, all fixed here:

- **`makeRoomFor` and the subsequent `put` ran in separate transactions.** A
  write landing between them could push the store back over the cap and the
  `put` would still commit. Both now run on one store handle inside one
  `readwrite` transaction; so does `reapExpired`, which previously opened N+1.
- **`File` was persisted directly.** jsdom's `structuredClone` of a `File`
  returns a plain object with no `name`, `size`, or bytes, so the round-trip
  test could never pass. Records store `{ bytes: ArrayBuffer, name, type }` and
  reconstruct the `File` on read — which is also the more portable shape.
- **`tx()` only closed the connection in `oncomplete`**, leaking one on every
  error. There is now a single cached connection, closed by nothing but
  `versionchange`.
- **`openDb()` had no `onblocked` and no timeout**, so an upgrade held open by
  another tab left the promise pending forever and hung every caller.
- **A new connection per operation** — `reapExpired` opened N+1 of them. The
  repo's own pattern is a cached `dbPromise`
  (`thumbnail-local-cache.ts:40-55`); follow it.
- **`updateStatus` read and wrote in separate transactions** (lost update) and
  silently succeeded when the record was gone.
- **No aggregate quota.** Every comparable store in the repo caps
  (`DEFAULT_MAX_SIZE_BYTES`, `thumbnail-local-cache.ts:26`); twenty 10 MB
  images is 200 MB of IndexedDB.

Two behavioural decisions worth stating outright:

- **`needs-auth` is exempt from the one-hour TTL** and from quota eviction. That
  status exists precisely to survive a sign-in round trip; reaping it destroys
  the case the store was built for. It gets its own seven-day ceiling so it is
  bounded rather than immortal.
- **`if (!browser)` guard**, per repo convention. Note the consequence for
  tests: `tests/setup/stubs/app-environment.ts` exports `browser = false`, so
  the suite MUST mock it (`vi.mock("$app/environment", () => ({ browser: true }))`)
  — the same thing `tests/unit/last-auth-method.test.ts:8` does.

**Files:**
- Create: `src/lib/shared/share-intake/services/intake-store.ts`
- Test: `tests/unit/share-intake/intake-store.test.ts`
- Modify: `package.json` (dev dependency `fake-indexeddb`)

- [ ] **Step 1: Install the IndexedDB test shim**

Run: `npm install -D fake-indexeddb`
Expected: added to `devDependencies`.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/share-intake/intake-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";

// The repo's app-environment stub exports browser=false; the store no-ops
// under that, so every test here would trivially "pass" against nothing.
vi.mock("$app/environment", () => ({ browser: true }));

import {
  putIntake,
  getIntake,
  listIntakes,
  updateStatus,
  deleteIntake,
  reapExpired,
  INTAKE_TTL_MS,
  NEEDS_AUTH_TTL_MS,
  MAX_INTAKE_STORE_BYTES,
} from "$lib/shared/share-intake/services/intake-store";
import type { SharedIntake } from "$lib/shared/share-intake/domain/share-intake-models";

function intake(overrides: Partial<SharedIntake> = {}): SharedIntake {
  return {
    receiptId: "si_abc",
    source: "native",
    files: [new File([new Uint8Array([1, 2])], "a.png", { type: "image/png" })],
    text: undefined,
    title: undefined,
    status: "received",
    receivedAt: Date.now(),
    problems: [],
    ...overrides,
  };
}

function bigIntake(receiptId: string, bytes: number, overrides: Partial<SharedIntake> = {}) {
  return intake({
    receiptId,
    files: [new File([new Uint8Array(bytes)], `${receiptId}.png`, { type: "image/png" })],
    ...overrides,
  });
}

describe("intake-store", () => {
  beforeEach(async () => {
    for (const record of await listIntakes()) await deleteIntake(record.receiptId);
  });

  it("round-trips a record and rebuilds a real File from the stored bytes", async () => {
    await putIntake(intake());

    const got = await getIntake("si_abc");

    expect(got?.files[0]).toBeInstanceOf(File);
    expect(got?.files[0].name).toBe("a.png");
    expect(got?.files[0].type).toBe("image/png");
    expect(got?.files[0].size).toBe(2);
    expect(new Uint8Array(await got!.files[0].arrayBuffer())).toEqual(
      new Uint8Array([1, 2])
    );
  });

  it("round-trips the problem list", async () => {
    await putIntake(
      intake({ problems: [{ name: "b.heic", reason: "unsupported-type" }] })
    );

    const got = await getIntake("si_abc");

    expect(got?.problems).toEqual([{ name: "b.heic", reason: "unsupported-type" }]);
  });

  it("does not delete on read", async () => {
    await putIntake(intake());
    await getIntake("si_abc");
    expect(await getIntake("si_abc")).not.toBeNull();
  });

  it("is idempotent on a duplicate receiptId", async () => {
    await putIntake(intake());
    await putIntake(intake());
    expect(await listIntakes()).toHaveLength(1);
  });

  it("updates status in place", async () => {
    await putIntake(intake());
    await updateStatus("si_abc", "needs-auth");
    expect((await getIntake("si_abc"))?.status).toBe("needs-auth");
  });

  it("appends problems on a status update rather than replacing them", async () => {
    await putIntake(intake({ problems: [{ name: "a", reason: "too-large" }] }));

    await updateStatus("si_abc", "partially-sent", [
      { name: "b", reason: "send-dropped" },
    ]);

    expect((await getIntake("si_abc"))?.problems).toEqual([
      { name: "a", reason: "too-large" },
      { name: "b", reason: "send-dropped" },
    ]);
  });

  it("rejects a status update for a record that is gone", async () => {
    // Silently succeeding here hid a real bug: the runner would report an
    // intake advanced that no longer existed.
    await expect(updateStatus("si_missing", "ready")).rejects.toThrow(/si_missing/);
  });

  it("reaps records past the one-hour TTL and keeps fresh ones", async () => {
    await putIntake(intake({ receiptId: "si_old", receivedAt: Date.now() - INTAKE_TTL_MS - 1 }));
    await putIntake(intake({ receiptId: "si_new" }));

    expect(await reapExpired()).toBe(1);
    expect(await getIntake("si_old")).toBeNull();
    expect(await getIntake("si_new")).not.toBeNull();
  });

  it("does NOT reap a needs-auth record at the one-hour mark", async () => {
    // This is the whole reason the store exists: a share that must outlive a
    // sign-in round trip.
    await putIntake(
      intake({
        receiptId: "si_auth",
        status: "needs-auth",
        receivedAt: Date.now() - INTAKE_TTL_MS - 1,
      })
    );

    expect(await reapExpired()).toBe(0);
    expect(await getIntake("si_auth")).not.toBeNull();
  });

  it("does reap a needs-auth record past its own long ceiling", async () => {
    await putIntake(
      intake({
        receiptId: "si_auth",
        status: "needs-auth",
        receivedAt: Date.now() - NEEDS_AUTH_TTL_MS - 1,
      })
    );

    expect(await reapExpired()).toBe(1);
  });

  it("evicts the oldest record to make room for a new one", async () => {
    const half = Math.floor(MAX_INTAKE_STORE_BYTES / 2);
    await putIntake(bigIntake("si_old", half, { receivedAt: 1 }));
    await putIntake(bigIntake("si_mid", half, { receivedAt: 2 }));

    await putIntake(bigIntake("si_new", half, { receivedAt: 3 }));

    expect(await getIntake("si_old")).toBeNull();
    expect(await getIntake("si_new")).not.toBeNull();
  });

  it("refuses the write rather than evicting a needs-auth record", async () => {
    const most = MAX_INTAKE_STORE_BYTES - 1024;
    await putIntake(bigIntake("si_auth", most, { status: "needs-auth", receivedAt: 1 }));

    await expect(putIntake(bigIntake("si_new", most, { receivedAt: 2 }))).rejects.toThrow(
      /pending sign-in/
    );
    expect(await getIntake("si_auth")).not.toBeNull();
  });

  it("reuses one connection instead of opening per operation", async () => {
    const openSpy = vi.spyOn(indexedDB, "open");

    await putIntake(intake());
    await getIntake("si_abc");
    await listIntakes();
    await reapExpired();

    // The connection was cached by the tests above; reapExpired alone used to
    // open N+1 of them.
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/intake-store.test.ts`
Expected: FAIL — `Failed to resolve import ".../intake-store"`.

- [ ] **Step 4: Write the store**

Create `src/lib/shared/share-intake/services/intake-store.ts`:

```ts
import { browser } from "$app/environment";
import type {
  IntakeProblem,
  ShareIntakeSource,
  ShareIntakeStatus,
  SharedIntake,
} from "../domain/share-intake-models";

/**
 * Durable record for a received share.
 *
 * Persisted BEFORE any auth check so a share that cold-starts the app while
 * signed out survives the sign-in round trip. Reads never delete - a reload or
 * crash mid-flow must be recoverable.
 *
 * Honest limitation: IndexedDB is best-effort and quota writes can fail. This
 * makes loss rare and VISIBLE (putIntake throws; the caller logs) rather than
 * impossible.
 */

const DB_NAME = "tka-share-intake";
const DB_VERSION = 1;
const STORE = "intakes";
const OPEN_TIMEOUT_MS = 5000;

export const INTAKE_TTL_MS = 60 * 60 * 1000;

/**
 * needs-auth outlives the ordinary TTL by a wide margin. Reaping it at one
 * hour would destroy the exact case this store exists for - a share held
 * across a sign-in. Seven days keeps it bounded rather than immortal.
 */
export const NEEDS_AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Aggregate ceiling, in the spirit of thumbnail-local-cache's own cap. */
export const MAX_INTAKE_STORE_BYTES = 64 * 1024 * 1024;

/**
 * What actually goes into IndexedDB.
 *
 * Bytes, not File. jsdom's structuredClone of a File returns a plain object
 * with no name, type, or content, so a File-valued record is untestable under
 * vitest and silently lossy anywhere structured clone is partial. An
 * ArrayBuffer clones identically everywhere.
 */
interface StoredFile {
  bytes: ArrayBuffer;
  name: string;
  type: string;
}

interface StoredIntake {
  receiptId: string;
  source: ShareIntakeSource;
  files: StoredFile[];
  text?: string;
  title?: string;
  status: ShareIntakeStatus;
  receivedAt: number;
  problems: IntakeProblem[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Both of these are load-bearing. An upgrade held open by another tab
    // fires neither onsuccess nor onerror, so without them every caller awaits
    // a promise that never settles. ShareIntakeHost awaits this on mount, so
    // without them a blocked upgrade would hang the share pipeline silently
    // for the rest of the session.
    const timer = setTimeout(
      () => reject(new Error("share-intake: IndexedDB open timed out")),
      OPEN_TIMEOUT_MS
    );
    request.onblocked = () => {
      clearTimeout(timer);
      reject(new Error("share-intake: IndexedDB open blocked by another connection"));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "receiptId" });
        store.createIndex("receivedAt", "receivedAt");
      }
    };

    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      // Close on versionchange so a later upgrade in another tab is never
      // blocked by this cached connection, and drop the cache so the next call
      // reopens rather than reusing a closed handle.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error ?? new Error("share-intake: IndexedDB open failed"));
    };
  }).catch((error: unknown) => {
    // Never cache a rejection: one transient failure would poison the store
    // for the rest of the session.
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

/**
 * Await one IDBRequest. Resolution happens inside the request's own success
 * callback, which keeps the surrounding transaction alive - awaiting a
 * macrotask between requests is what auto-commits a transaction out from under
 * you, and this deliberately does not do that.
 */
function awaitRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("share-intake: request failed"));
  });
}

/**
 * Run work inside one transaction. The connection is cached and is NOT closed
 * here; the first draft closed it in `oncomplete` only, which leaked a
 * connection on every error path.
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let outcome: T;
    let failed = false;

    transaction.oncomplete = () => {
      if (!failed) resolve(outcome);
    };
    transaction.onabort = () => {
      failed = true;
      reject(transaction.error ?? new Error("share-intake: transaction aborted"));
    };
    transaction.onerror = () => {
      failed = true;
      reject(transaction.error ?? new Error("share-intake: transaction failed"));
    };

    work(transaction.objectStore(STORE)).then(
      (value) => {
        outcome = value;
      },
      (error: unknown) => {
        failed = true;
        try {
          transaction.abort();
        } catch {
          // Already finished; the rejection below is still the real answer.
        }
        reject(error);
      }
    );
  });
}

async function toStored(record: SharedIntake): Promise<StoredIntake> {
  const files = await Promise.all(
    record.files.map(async (file) => ({
      bytes: await file.arrayBuffer(),
      name: file.name,
      type: file.type,
    }))
  );
  return { ...record, files };
}

function fromStored(stored: StoredIntake): SharedIntake {
  return {
    ...stored,
    files: stored.files.map(
      (file) => new File([file.bytes], file.name, { type: file.type })
    ),
  };
}

function storedBytes(stored: StoredIntake): number {
  return stored.files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
}

function ttlFor(status: ShareIntakeStatus): number {
  return status === "needs-auth" ? NEEDS_AUTH_TTL_MS : INTAKE_TTL_MS;
}

async function listStored(): Promise<StoredIntake[]> {
  return withStore("readonly", (store) =>
    awaitRequest<StoredIntake[]>(store.getAll())
  );
}

/**
 * Evict oldest-first inside the CALLER'S transaction, never a `needs-auth`
 * record.
 *
 * Takes an open `IDBObjectStore` rather than opening its own: an earlier
 * revision ran the eviction sweep and the subsequent `put` in two separate
 * transactions, so a concurrent write between them could push the store back
 * over the cap and the `put` would land anyway. Everything below runs on one
 * store handle, and `awaitRequest` resolves inside each request's own success
 * callback, which keeps that transaction alive.
 */
async function makeRoomFor(
  store: IDBObjectStore,
  incoming: number,
  replacing: string
): Promise<void> {
  const all = await awaitRequest<StoredIntake[]>(store.getAll());
  const others = all.filter((record) => record.receiptId !== replacing);
  let used = others.reduce((sum, record) => sum + storedBytes(record), 0);
  if (used + incoming <= MAX_INTAKE_STORE_BYTES) return;

  // Oldest first, and NEVER a needs-auth record: trace 3 parks the only copy
  // of the user's bytes there while they are away at their email client.
  const evictable = others
    .filter((record) => record.status !== "needs-auth")
    .sort((a, b) => a.receivedAt - b.receivedAt);

  for (const victim of evictable) {
    if (used + incoming <= MAX_INTAKE_STORE_BYTES) break;
    await awaitRequest(store.delete(victim.receiptId));
    used -= storedBytes(victim);
  }

  if (used + incoming > MAX_INTAKE_STORE_BYTES) {
    // Aborts the transaction via withStore, so no partial eviction survives.
    throw new Error(
      "share-intake: store is full of pending sign-in shares; refusing the write"
    );
  }
}

export async function putIntake(record: SharedIntake): Promise<void> {
  if (!browser) return;

  // File.arrayBuffer() is a macrotask await, so it MUST finish before the
  // transaction opens - awaiting it inside one auto-commits the transaction
  // out from under the eviction sweep.
  const stored = await toStored(record);
  const incoming = storedBytes(stored);

  if (incoming > MAX_INTAKE_STORE_BYTES) {
    throw new Error(
      `share-intake: record is ${incoming} bytes, over the ${MAX_INTAKE_STORE_BYTES} store cap`
    );
  }

  await withStore("readwrite", async (store) => {
    await makeRoomFor(store, incoming, stored.receiptId);
    await awaitRequest(store.put(stored));
  });
}

export async function getIntake(receiptId: string): Promise<SharedIntake | null> {
  if (!browser) return null;

  const stored = await withStore("readonly", (store) =>
    awaitRequest<StoredIntake | undefined>(store.get(receiptId))
  );
  return stored ? fromStored(stored) : null;
}

export async function listIntakes(): Promise<SharedIntake[]> {
  if (!browser) return [];
  return (await listStored()).map(fromStored);
}

/**
 * Read and write in ONE transaction. Two transactions is a lost-update race:
 * the runner advancing a record and a second delivery appending a problem
 * would each write a copy built from a stale read.
 */
export async function updateStatus(
  receiptId: string,
  status: ShareIntakeStatus,
  problems: IntakeProblem[] = []
): Promise<void> {
  if (!browser) return;

  await withStore("readwrite", async (store) => {
    const existing = await awaitRequest<StoredIntake | undefined>(
      store.get(receiptId)
    );
    if (!existing) {
      throw new Error(`share-intake: no record ${receiptId} to update`);
    }
    await awaitRequest(
      store.put({
        ...existing,
        status,
        problems:
          problems.length > 0
            ? [...existing.problems, ...problems]
            : existing.problems,
      })
    );
  });
}

export async function deleteIntake(receiptId: string): Promise<void> {
  if (!browser) return;
  await withStore("readwrite", (store) => awaitRequest(store.delete(receiptId)));
}

/**
 * Sweep abandoned records. Called on intake write AND at app boot -
 * write-only sweeping would leave records forever if no later share arrives.
 * Returns how many were removed.
 */
export async function reapExpired(now = Date.now()): Promise<number> {
  if (!browser) return 0;

  // One transaction, same reason as putIntake: an earlier revision opened
  // N+1 of them, one per stale record.
  return withStore("readwrite", async (store) => {
    const all = await awaitRequest<StoredIntake[]>(store.getAll());
    const stale = all.filter(
      (record) => now - record.receivedAt > ttlFor(record.status)
    );
    for (const record of stale) {
      await awaitRequest(store.delete(record.receiptId));
    }
    return stale.length;
  });
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/intake-store.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(share-intake): durable byte-backed IndexedDB store with quota and needs-auth TTL" -- src/lib/shared/share-intake/services/intake-store.ts tests/unit/share-intake/intake-store.test.ts package.json package-lock.json
```

---

### Task 7: Per-item classification — DONE (`4ae3942d2d`)

**Closes trace steps 1.10 and 2.9.** This is the hop that decides, per file,
whether trace 1 (card → viewer) or trace 2 (image → picker) applies.

Routes through the **existing** scan path — `extractScanCode`
(`src/lib/shared/qr/services/extract-scan-code.ts:17`), which is what
`src/lib/features/browse/collections/components/ScanCardSheet.svelte:159` uses.
It returns `null` for any QR that is not a TKA card, so a random QR is not a
failure; it falls through to the image path.

Five defects the first draft shipped:

- **The "dedup" test asserted the wrong behaviour and passed.** A repeated code
  made the second file `kind: "image"` — so sharing two photos of the same card
  sent one of them as a **photo attachment to a conversation**. There is now a
  `kind: "duplicate"` arm that the router ignores.
- **`extractScanCode` requires the ENTIRE trimmed string to be a URL** (line 24:
  `new URL(raw)` inside a try). Real-world `EXTRA_TEXT` reads
  `"Check this out https://tka.run/AB12"` and yielded `null`. URL-shaped
  substrings are pulled out and tried individually.
- **A WASM load failure turned 100% of cards into photos, silently.** The
  `catch` swallowed it per image. A failure on the first image is now recorded
  once, logged loudly, and stops further attempts.
- **The detector was constructed per image.**
- **`residualText` was dropped whenever a code was found** — so "look at this
  one" alongside a card link vanished. It is kept.

`bitmap.close()` not being in a `finally` is fixed by deletion: after Task 4
there is no bitmap, no canvas, and no `getImageData`.

**Files:**
- Modify: `src/lib/shared/share-intake/domain/share-intake-models.ts` (`IntakeItem`, `IntakeClassification`)
- Create: `src/lib/shared/share-intake/services/intake-classifier.ts`
- Test: `tests/unit/share-intake/intake-classifier.test.ts`

- [ ] **Step 1: Widen the domain types**

In `src/lib/shared/share-intake/domain/share-intake-models.ts`, replace
`IntakeItem` and `IntakeClassification`:

```ts
/** Per-item routing decision. Classification is per file, never per batch. */
export type IntakeItem
  = { kind: "card"; code: string; file: File }
  | { kind: "image"; file: File }
  /**
   * A second photo of a card already seen in this batch. NOT an image: filing
   * it as one would send a picture of a card into a conversation, which is
   * what the first draft did and what its own test asserted.
   */
  | { kind: "duplicate"; code: string; file: File };

export interface IntakeClassification {
  items: IntakeItem[];
  /** A TKA code found in the shared text, if any. */
  textCode: string | null;
  /**
   * Shared text minus any code that was extracted from it. Becomes the
   * prefilled message note. Kept even when a code WAS found - "look at this
   * one" alongside a link is exactly the case that matters.
   */
  residualText: string | null;
  problems: IntakeProblem[];
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/share-intake/intake-classifier.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyIntake,
  extractCodeFromText,
} from "$lib/shared/share-intake/services/intake-classifier";

function png(name: string): File {
  return new File([new Uint8Array([1])], name, { type: "image/png" });
}

/** The decoder is injected, so no test here needs a canvas or the WASM. */
const decodeTo =
  (values: Record<string, string[]>) => async (file: File) =>
    values[file.name] ?? [];

describe("extractCodeFromText", () => {
  it("finds a tka.run url embedded in a sentence", () => {
    // extractScanCode alone returns null here: it requires the WHOLE string to
    // parse as a URL.
    expect(extractCodeFromText("Check this out https://tka.run/AB12").code).toBe("AB12");
  });

  it("keeps the surrounding sentence as residual text", () => {
    const result = extractCodeFromText("Check this out https://tka.run/AB12 nice");
    expect(result.code).toBe("AB12");
    expect(result.residual).toBe("Check this out nice");
  });

  it("strips trailing punctuation off a matched url", () => {
    expect(extractCodeFromText("see https://tka.run/AB12.").code).toBe("AB12");
    expect(extractCodeFromText("see (https://tka.run/AB12)").code).toBe("AB12");
  });

  it("handles a scheme-less www. url", () => {
    expect(extractCodeFromText("try www.tka.run/q/XY99 later").code).toBe("XY99");
  });

  it("still handles a bare whole-string code", () => {
    expect(extractCodeFromText("AB12").code).toBe("AB12");
  });

  it("ignores a non-TKA url and keeps the whole text", () => {
    const result = extractCodeFromText("look https://example.com/hello");
    expect(result.code).toBeNull();
    expect(result.residual).toBe("look https://example.com/hello");
  });
});

describe("classifyIntake", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies an image carrying a TKA card url as a card", async () => {
    const result = await classifyIntake(
      { files: [png("card.png")] },
      decodeTo({ "card.png": ["https://TKA.RUN/AB12"] })
    );
    expect(result.items[0]).toEqual({
      kind: "card",
      code: "AB12",
      file: expect.any(File),
    });
  });

  it("treats a non-TKA QR as an ordinary image, not a failure", async () => {
    const result = await classifyIntake(
      { files: [png("other.png")] },
      decodeTo({ "other.png": ["https://example.com/hello"] })
    );
    expect(result.items[0].kind).toBe("image");
    expect(result.problems).toHaveLength(0);
  });

  it("classifies an image with no QR as an image", async () => {
    const result = await classifyIntake({ files: [png("photo.png")] }, decodeTo({}));
    expect(result.items[0].kind).toBe("image");
  });

  it("classifies a mixed batch per item, not per batch", async () => {
    const result = await classifyIntake(
      { files: [png("card.png"), png("photo.png")] },
      decodeTo({ "card.png": ["https://tka.run/q/XY99"] })
    );
    expect(result.items.map((i) => i.kind)).toEqual(["card", "image"]);
  });

  it("marks a repeated code as duplicate, never as an image", async () => {
    // The first draft made this second file kind:"image", which sent a PHOTO
    // OF A CARD to a conversation.
    const result = await classifyIntake(
      { files: [png("a.png"), png("b.png")] },
      decodeTo({
        "a.png": ["https://tka.run/AB12"],
        "b.png": ["https://tka.run/AB12"],
      })
    );
    expect(result.items.map((i) => i.kind)).toEqual(["card", "duplicate"]);
  });

  it("extracts a TKA code from shared text", async () => {
    const result = await classifyIntake(
      { files: [], text: "https://tka.run/AB12" },
      decodeTo({})
    );
    expect(result.textCode).toBe("AB12");
    expect(result.residualText).toBeNull();
  });

  it("keeps the note alongside a code found in the same text", async () => {
    const result = await classifyIntake(
      { files: [], text: "try this https://tka.run/AB12" },
      decodeTo({})
    );
    expect(result.textCode).toBe("AB12");
    expect(result.residualText).toBe("try this");
  });

  it("keeps non-code text as residual message text", async () => {
    const result = await classifyIntake({ files: [], text: "check this out" }, decodeTo({}));
    expect(result.textCode).toBeNull();
    expect(result.residualText).toBe("check this out");
  });

  it("records decode-failed once and stops decoding when the FIRST decode throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const decode = vi.fn(async () => {
      throw new Error("wasm 404");
    });

    const result = await classifyIntake(
      { files: [png("a.png"), png("b.png"), png("c.png")] },
      decode
    );

    // A decoder that fails on the first image is the ZXing WASM failing to
    // load, which turns every shared card into a photo. Retrying it 20 more
    // times helps nobody and hides the cause.
    expect(decode).toHaveBeenCalledTimes(1);
    expect(result.problems).toEqual([
      { name: "", reason: "decode-failed", detail: "wasm 404" },
    ]);
    expect(result.items.map((i) => i.kind)).toEqual(["image", "image", "image"]);
    expect(error).toHaveBeenCalled();
  });

  it("records a per-file decode-failed after an earlier decode succeeded", async () => {
    const decode = vi.fn(async (file: File) => {
      if (file.name === "b.png") throw new Error("corrupt");
      return [];
    });

    const result = await classifyIntake(
      { files: [png("a.png"), png("b.png"), png("c.png")] },
      decode
    );

    expect(decode).toHaveBeenCalledTimes(3);
    expect(result.problems).toEqual([
      { name: "b.png", reason: "decode-failed", detail: "corrupt" },
    ]);
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/intake-classifier.test.ts`
Expected: FAIL — `Failed to resolve import ".../intake-classifier"`.

- [ ] **Step 4: Write the classifier**

Create `src/lib/shared/share-intake/services/intake-classifier.ts`:

```ts
import { extractScanCode } from "$lib/shared/qr/services/extract-scan-code";
import {
  createTkaQrDetector,
  type TkaQrDetector,
} from "$lib/shared/qr/services/tka-qr-detector";
import type {
  IntakeClassification,
  IntakeItem,
  IntakeProblem,
} from "../domain/share-intake-models";

/** Decodes every QR payload found in an image. Injected so tests need no WASM. */
export type QrDecoder = (file: File) => Promise<string[]>;

let sharedDetector: TkaQrDetector | null = null;

/**
 * One detector for the whole app run. createTkaQrDetector() constructs a
 * BarcodeDetector and, on the first call, prepares the ZXing WASM module -
 * building one per image paid that cost N times for nothing.
 */
function getDetector(): TkaQrDetector {
  sharedDetector ??= createTkaQrDetector();
  return sharedDetector;
}

/**
 * Default decoder.
 *
 * The detector accepts an ImageBitmapSource (Task 4) and a File IS a Blob, so
 * the file goes straight in: no createImageBitmap, no canvas, no
 * getImageData. zxing-wasm does the decode internally, which is also why the
 * 10 MB validation cap is the resolution cap - there is no intermediate
 * bitmap for us to downscale, and inserting one to create the opportunity
 * would be the hand-rolled path this deleted.
 */
export const fileQrDecoder: QrDecoder = async (file) => {
  const detections = await getDetector().detect(file);
  return detections.map((detection) => detection.rawValue);
};

const URL_LIKE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>'"]+$/;

/**
 * Pull a TKA code out of free-form shared text.
 *
 * extractScanCode needs the WHOLE trimmed string to be a URL, an s~ payload,
 * or a bare code - it calls `new URL(raw)` directly. Android's EXTRA_TEXT is
 * almost never that: it reads "Check this out https://tka.run/AB12". So the
 * URL-shaped substrings are extracted and each is offered to extractScanCode,
 * with the whole string as a last resort for the bare-code case.
 *
 * The residual is what is left after removing the matched URL. It becomes the
 * prefilled message note; the first draft threw it away whenever a code was
 * found.
 */
export function extractCodeFromText(text: string): {
  code: string | null;
  residual: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { code: null, residual: "" };

  for (const match of trimmed.match(URL_LIKE) ?? []) {
    const candidate = match.replace(TRAILING_PUNCTUATION, "");
    const code = extractScanCode(
      candidate.toLowerCase().startsWith("www.") ? `https://${candidate}` : candidate
    );
    if (code) {
      const residual = trimmed.replace(match, " ").replace(/\s+/g, " ").trim();
      return { code, residual };
    }
  }

  const whole = extractScanCode(trimmed);
  return whole ? { code: whole, residual: "" } : { code: null, residual: trimmed };
}

/**
 * Decide, per item, whether each shared file is a TKA card, a duplicate of one
 * already in the batch, or an ordinary image.
 *
 * extractScanCode returns null for anything that is not a TKA card - a random
 * QR in a photo is NOT an error, it just means the photo is a photo.
 */
export async function classifyIntake(
  input: { files: File[]; text?: string },
  decode: QrDecoder = fileQrDecoder
): Promise<IntakeClassification> {
  const items: IntakeItem[] = [];
  const problems: IntakeProblem[] = [];
  const seen = new Set<string>();

  let decoderBroken = false;
  let anyDecodeSucceeded = false;

  for (const file of input.files) {
    let code: string | null = null;

    if (!decoderBroken) {
      try {
        const payloads = await decode(file);
        anyDecodeSucceeded = true;
        for (const raw of payloads) {
          const candidate = extractScanCode(raw);
          if (candidate) {
            code = candidate;
            break;
          }
        }
      } catch (caught) {
        const detail = caught instanceof Error ? caught.message : String(caught);
        if (anyDecodeSucceeded) {
          // One bad image among many. Noise, but recorded.
          problems.push({ name: file.name, reason: "decode-failed", detail });
        } else {
          // Nothing has EVER decoded in this run: the ZXing WASM is missing or
          // failed to instantiate, and every shared card in the app is about to
          // be treated as a photo. Say so once, loudly, and stop retrying.
          decoderBroken = true;
          problems.push({ name: "", reason: "decode-failed", detail });
          console.error(
            "[ShareIntake] QR decoding is unavailable - every shared card will be treated as a photo:",
            detail
          );
        }
      }
    }

    if (!code) {
      items.push({ kind: "image", file });
      continue;
    }
    if (seen.has(code)) {
      items.push({ kind: "duplicate", code, file });
      continue;
    }
    seen.add(code);
    items.push({ kind: "card", code, file });
  }

  const text = input.text
    ? extractCodeFromText(input.text)
    : { code: null, residual: "" };

  return {
    items,
    textCode: text.code,
    residualText: text.residual.length > 0 ? text.residual : null,
    problems,
  };
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/intake-classifier.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 6: Prove no canvas dance came back**

Run: `grep -rn "getImageData\|createImageBitmap" src/lib/shared/share-intake/ | wc -l`
Expected: `0`. The detector takes the `File` directly (Task 4); any hit here
means the hand-rolled decode path was reintroduced.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(share-intake): per-item classification with duplicate detection and embedded-url text scan" -- src/lib/shared/share-intake/domain/share-intake-models.ts src/lib/shared/share-intake/services/intake-classifier.ts tests/unit/share-intake/intake-classifier.test.ts
```

---
### Task 8: Give the card path a destination — DONE (`7bb2f311c1`)

**Closes trace step 1.13 — the terminal state of trace 1.** Until this exists,
trace 1 dead-ends: `routeIntake` returns `result.cards` and the runner reads
only `unresolved` / `queued` / `problems`, discards `cards`, and deletes the
record. For a `docBacked` card **nothing observable happens at all** — the user
shares a photo of a card, the app opens, and the screen shows `/create`.

The spec asks for View / Add to collection / Send (spec:295-297). Opening the
sequence viewer overlay delivers View by construction, and its chrome already
carries Save-to-library (`ViewerOverflowMenu.svelte:190-194`,
`ViewerHeader.svelte:142-143`) and Send (`SequenceViewerShell.svelte:277`).

**Correction:** the viewer's chrome does NOT carry an add-to-collection action.
Grepping the whole `sequence-viewer` tree for `openCollectionPicker` /
`CollectionPicker` turns up nothing; the collection picker's only caller
anywhere in the codebase is `ChoreoCardThumbnail.svelte`
(`collection-picker-state.svelte.ts:49` → `openCollectionPicker`). Save-to-library
is the accepted stand-in: it is the affordance the viewer actually has, and the
gap — no add-to-collection from a filed card — is recorded in Known accepted
limitations rather than built around. A bespoke three-button sheet would still
be a hand-rolled duplicate of the View/Send surface that already exists, so it
is not the fix for the missing third button either
(`.claude/rules/never-hand-roll.md`, `.claude/rules/sequence-viewer-shell.md`).

**Reuse evidence.** Greps run before writing anything here:
`openSequenceOverlay` (5 existing call sites, all taking an already-resolved
`SequenceData`), `hydrateSequence`, `resolveShortCode`. The canonical
resolve→hydrate→open pipeline is
`SequenceViewerDrawerHost.svelte:68-103`'s `bootstrapFromUrl()`. This task
reuses that pipeline verbatim, minus the `?v=` URL read — the router already
holds the resolved `SequenceData` from `resolveForImport`, so re-resolving
would be a second network read for data we have.

The second half of this task adds the auth-nudge copy trace 3.12 needs. It is
here rather than in Task 11 because it is a one-line domain addition with its
own exhaustive `Record` and nothing else in Task 11 touches that file.

**Files:**
- Create: `src/lib/shared/share-intake/services/open-filed-card.ts`
- Modify: `src/lib/shared/auth/domain/auth-nudge-trigger.ts`
- Test: `tests/unit/share-intake/open-filed-card.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/share-intake/open-filed-card.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const openSequenceOverlay = vi.fn();
vi.mock(
  "$lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte",
  () => ({ openSequenceOverlay })
);

const hydrateSequence = vi.fn();
vi.mock("$lib/shared/navigation/services/sequence-hydrator", () => ({
  hydrateSequence: (...args: unknown[]) => hydrateSequence(...args),
}));

const loopDetector = { detect: vi.fn() };
vi.mock("$lib/shared/create/get-loop-detector", () => ({
  getLoopDetector: () => loopDetector,
}));

const toast = { info: vi.fn(), error: vi.fn() };
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({ toast }));

import { openFiledCard } from "$lib/shared/share-intake/services/open-filed-card";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function sequence(overrides: Partial<SequenceData> = {}): SequenceData {
  return { id: "s1", name: "Practice", word: "ABAB" } as SequenceData;
}

describe("openFiledCard", () => {
  beforeEach(() => {
    openSequenceOverlay.mockReset();
    hydrateSequence.mockReset();
    hydrateSequence.mockImplementation(async (seq: SequenceData) => seq);
    toast.info.mockReset();
    toast.error.mockReset();
  });

  it("hydrates the resolved sequence before opening the viewer", async () => {
    const seq = sequence();

    await openFiledCard({ code: "AB12", sequence: seq, extraCards: 0 });

    expect(hydrateSequence).toHaveBeenCalledWith(seq, {
      loopDetector,
    });
    expect(openSequenceOverlay).toHaveBeenCalledWith(
      seq,
      expect.objectContaining({ shortCode: "AB12" })
    );
  });

  it("does NOT skip the history push, so back closes the viewer", async () => {
    // SequenceViewerDrawerHost passes skipHistoryPush because the ?v= URL is
    // already the history entry. A shared card has no such entry: skipping the
    // push would make Android back exit the app from the viewer.
    await openFiledCard({ code: "AB12", sequence: sequence(), extraCards: 0 });

    const options = openSequenceOverlay.mock.calls[0][1];
    expect(options.skipHistoryPush).toBeUndefined();
  });

  it("mentions the other cards rather than silently opening only the first", async () => {
    await openFiledCard({ code: "AB12", sequence: sequence(), extraCards: 2 });

    expect(toast.info).toHaveBeenCalledWith(
      "2 more cards were saved to your library."
    );
  });

  it("says nothing extra when there is only one card", async () => {
    await openFiledCard({ code: "AB12", sequence: sequence(), extraCards: 0 });
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("reports a hydration failure instead of leaving a dead screen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    hydrateSequence.mockRejectedValue(new Error("deriver blew up"));

    await expect(
      openFiledCard({ code: "AB12", sequence: sequence(), extraCards: 0 })
    ).rejects.toThrow("deriver blew up");

    // The router records this as route-failed and the runner keeps the record.
    expect(openSequenceOverlay).not.toHaveBeenCalled();
  });

  it("uses the simplified word in the toast copy", async () => {
    await openFiledCard({
      code: "AB12",
      sequence: sequence(),
      extraCards: 1,
      // A LOOP word repeats by construction; the user never sees the expansion.
      word: "ABABABAB",
    });

    expect(toast.info).toHaveBeenCalledWith(
      '1 more card ("AB") was saved to your library.'
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/open-filed-card.test.ts`
Expected: FAIL — `Failed to resolve import ".../open-filed-card"`.

- [ ] **Step 3: Write the destination**

Create `src/lib/shared/share-intake/services/open-filed-card.ts`:

```ts
import { getLoopDetector } from "$lib/shared/create/get-loop-detector";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { hydrateSequence } from "$lib/shared/navigation/services/sequence-hydrator";
import { openSequenceOverlay } from "$lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";

/**
 * Trace 1's terminal state: the user looking at the sequence they shared.
 *
 * The pipeline is the one SequenceViewerDrawerHost.bootstrapFromUrl() already
 * runs (resolve -> hydrate -> openSequenceOverlay), minus the resolve: the
 * router hands us the SequenceData that resolveForImport already returned, so
 * re-resolving would be a second network read for data we hold.
 *
 * hydrateSequence is NOT optional here. It is what fills in letter-per-step,
 * start/end position, word, isCircular, loopType and gridMode. Skipping it
 * opens a viewer with empty card footers and a null loop type - the exact
 * regression that helper was written to end (sequence-hydrator.ts header).
 *
 * The overlay renders inside SequenceViewerDrawerHost, which MainApplication
 * mounts at :708-710. That is why nothing in this pipeline may run before the
 * app shell is up - see Task 12.
 */
export async function openFiledCard(input: {
  code: string;
  sequence: SequenceData;
  /** How many further cards this share carried, already saved but not opened. */
  extraCards: number;
  /** Display word for the copy. Defaults to the sequence's own word. */
  word?: string;
}): Promise<void> {
  const hydrated = await hydrateSequence(input.sequence, {
    loopDetector: getLoopDetector(),
  });

  // No skipHistoryPush: unlike the ?v= bootstrap, a shared card has no history
  // entry of its own, so the overlay needs to push one or Android's back
  // button exits the app straight out of the viewer.
  openSequenceOverlay(hydrated, {
    shortCode: input.code,
    returnLabel: "Shared card",
  });

  if (input.extraCards <= 0) return;

  // Opening N viewers would have them fight each other, so the rest are filed
  // and NAMED. Saying nothing is how the previous revision lost them.
  const word = simplifyRepeatedWord(
    input.word || hydrated.word || input.sequence.word || ""
  );
  toast.info(
    input.extraCards === 1
      ? `1 more card${word ? ` ("${word}")` : ""} was saved to your library.`
      : `${input.extraCards} more cards were saved to your library.`
  );
}
```

- [ ] **Step 4: Add the sign-in copy trace 3.12 needs**

In `src/lib/shared/auth/domain/auth-nudge-trigger.ts`, add the member to the
union (after `"guest-first-save"`):

```ts
  | "guest-first-save"
  | "share-image-signin";
```

and the matching entry to `AUTH_NUDGE_TEXTS` (the `Record` is exhaustive, so
omitting it is a type error, which is the point):

```ts
  // Share intake, trace 3: the user shared an image while signed out.
  // services/implementations/MessageImageSender.ts:32-34 rejects anonymous/guest
  // uploads outright, so this is a hard requirement, not a nudge. Phrased as
  // the ask rather than the refusal - the bytes are already safe in IndexedDB
  // and the send resumes by itself once they are in.
  "share-image-signin":
    "Create a free account to send the image you shared. It's saved until you do.",
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/open-filed-card.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Prove the nudge Record stayed exhaustive**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error --output human 2>&1 | grep -iE "auth-nudge-trigger|AUTH_NUDGE_TEXTS" | head -10`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(share-intake): open the viewer on a filed card, and the share sign-in copy" -- src/lib/shared/share-intake/services/open-filed-card.ts src/lib/shared/auth/domain/auth-nudge-trigger.ts tests/unit/share-intake/open-filed-card.test.ts
```

---

### Task 9: Generalize the inbox share view so it can actually send an image — DONE (`b95a943aaf`, type fixes `319fb89da4`)

**Closes trace steps 2.11, 2.13 and 2.14.** This is the picker the image lands
in, the code that actually uploads it, and the completion hook that tells the
runner the bytes are finally consumed.

The first draft called this "genuinely small" and it was not. What it missed:

- **`SendSequenceSheet` has nine `payload.` references**, six of them in
  markup (verified: lines 51, 149, 152, 199, 201, 219, 220, 222, 223). The
  draft changed one.
- **The renamed `.test.ts` still imported `SendSequenceSheet.svelte`** and
  rendered with `payload:`, so its verification step failed on an unresolved
  import.
- **The real entry point is `openSendSequenceSheet`**
  (`send-sequence-state.svelte.ts:23`, four call sites: `ChoreoCardTab.svelte:88`,
  `ChoreoCardThumbnail.svelte:215`, `SequenceViewerShell.svelte:277`,
  `SequenceViewerPage.svelte:152`). The draft's file table omitted it.
- **The CSS class and its four selectors stayed `.send-sequence-sheet`** under a
  rename claiming to generalize.
- **`attachment.sequence as never`** — unsound, and `npm run check` rejects it.
  `PendingMessageAttachment`'s sequence arm is `SequenceData`; the sheet needs a
  `SequenceSharePayload` (`sequenceWord`, `sequenceThumbnail`, `sequenceAuthor`,
  `sequenceStepCount` — none of which exist on `SequenceData`).
- **The sheet never sent an image.** Whatever it rendered, `send()` only ever
  called `createShortCode` + `messagingService.sendMessage`, so the entire
  feature ended at a picker that could not deliver.

The arm is widened to `SequenceSharePayload` and its field is renamed
`sequence` → **`payload`**. Two reasons: `attachment.sequence.sequence` is a
trap, and with the field named `payload` a single `$derived` restores the
sheet's nine existing `payload.` references instead of rewriting them.

**Files:**
- Modify: `src/lib/shared/inbox/domain/pending-message-attachment.ts`
- Modify: `src/lib/shared/inbox/components/messages/MessageComposer.svelte:173-183,234`
- Modify: `src/lib/shared/inbox/components/messages/MessageAttachmentPicker.svelte:80-89`
- Modify: `src/lib/shared/inbox/state/inbox-state.svelte.ts`
- Modify: `src/lib/shared/inbox/state/send-sequence-state.svelte.ts`
- Modify: `src/lib/shared/inbox/components/InboxDrawer.svelte:21,274,536-537,561,600-604`
- Rename: `SendSequenceSheet.svelte` → `SendAttachmentSheet.svelte` (+ its `.svelte.test.ts`)
- Test: `tests/unit/share-intake/inbox-attachment-share.test.ts`

- [ ] **Step 1: Write the failing state test**

Create `tests/unit/share-intake/inbox-attachment-share.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { inboxState } from "$lib/shared/inbox/state/inbox-state.svelte";
import { openSendAttachmentSheet } from "$lib/shared/inbox/state/send-sequence-state.svelte";
import type { SequenceSharePayload } from "$lib/shared/inbox/domain/models/sequence-share-payload";

function imageAttachment() {
  return {
    type: "image" as const,
    file: new File([new Uint8Array([1])], "a.png", { type: "image/png" }),
    messageId: "m1",
    attachmentId: "a1",
  };
}

function sequencePayload(): SequenceSharePayload {
  return {
    sequence: { id: "s1", word: "ABC" } as SequenceSharePayload["sequence"],
    sequenceId: "s1",
    sequenceWord: "ABC",
  };
}

describe("inbox attachment share", () => {
  beforeEach(() => {
    inboxState.close();
  });

  it("opens the send-attachment view with an image attachment", () => {
    inboxState.openAttachmentShare(imageAttachment());

    expect(inboxState.isOpen).toBe(true);
    expect(inboxState.currentView).toBe("send-attachment");
    expect(inboxState.shareAttachment?.type).toBe("image");
  });

  it("carries a prefilled note through to the sheet", () => {
    inboxState.openAttachmentShare(imageAttachment(), { note: "look at this" });
    expect(inboxState.shareAttachmentNote).toBe("look at this");
  });

  it("keeps openSequenceShare working through the same view", () => {
    inboxState.openSequenceShare(sequencePayload());

    expect(inboxState.currentView).toBe("send-attachment");
    expect(inboxState.shareAttachment?.type).toBe("sequence");
  });

  it("routes openSendAttachmentSheet through the same state", () => {
    openSendAttachmentSheet(imageAttachment(), { note: "hi" });

    expect(inboxState.currentView).toBe("send-attachment");
    expect(inboxState.shareAttachmentNote).toBe("hi");
  });

  it("clears the attachment and the note when the share is cancelled", () => {
    inboxState.openAttachmentShare(imageAttachment(), { note: "hi" });
    inboxState.cancelAttachmentShare();

    expect(inboxState.shareAttachment).toBeNull();
    expect(inboxState.shareAttachmentNote).toBeNull();
  });

  it("carries the intake receiptId so the send can resolve the record", () => {
    // Trace 2.14. Without this the drawer has no way to know WHICH intake the
    // bytes it just sent belonged to, and the record can only be deleted at
    // picker-open time - which is exactly the data-loss bug this replaces.
    inboxState.openAttachmentShare(imageAttachment(), { receiptId: "si_abc" });
    expect(inboxState.shareAttachmentReceiptId).toBe("si_abc");
  });

  it("leaves the receiptId null for an ordinary in-app sequence share", () => {
    inboxState.openSequenceShare(sequencePayload());
    expect(inboxState.shareAttachmentReceiptId).toBeNull();
  });

  it("clears the receiptId on completion", () => {
    inboxState.openAttachmentShare(imageAttachment(), { receiptId: "si_abc" });
    inboxState.completeAttachmentShare("conversation-1");
    expect(inboxState.shareAttachmentReceiptId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/inbox-attachment-share.test.ts`
Expected: FAIL — `inboxState.openAttachmentShare is not a function`.

- [ ] **Step 3: Widen the attachment union**

Replace `src/lib/shared/inbox/domain/pending-message-attachment.ts` entirely:

```ts
import type { SequenceSharePayload } from "./models/sequence-share-payload";

/**
 * What is staged to send with a message.
 *
 * The sequence arm carries the full SequenceSharePayload, not a bare
 * SequenceData: the share sheet renders sequenceWord / sequenceThumbnail /
 * sequenceAuthor / sequenceStepCount, none of which exist on SequenceData.
 * The field is named `payload` rather than `sequence` so consumers reach the
 * raw sequence as `attachment.payload.sequence` instead of the
 * `attachment.sequence.sequence` trap.
 */
export type PendingMessageAttachment =
  | {
      type: "image";
      file: File;
      messageId: string;
      attachmentId: string;
    }
  | {
      type: "sequence";
      payload: SequenceSharePayload;
    };
```

- [ ] **Step 4: Update the composer's two sequence sites**

In `src/lib/shared/inbox/components/messages/MessageComposer.svelte`:

Add the builder import beside the existing `../../domain/` imports:

```ts
  import { buildSequenceSharePayload } from "../../domain/build-sequence-share-payload";
```

In `sendMessage`'s sequence branch (currently lines 173-183), change the two
`attachment.sequence` reads to `attachment.payload.sequence`:

```ts
        const sequenceAttachment =
          attachment?.type === "sequence"
            ? buildSequenceMessageAttachment(
                attachment.payload.sequence,
                (
                  await getShortCodeManager().createShortCode(
                    attachment.payload.sequence,
                    { embedSequenceData: true }
                  )
                ).code
              )
            : undefined;
```

And in `selectSequence` (currently line 234):

```ts
  function selectSequence(sequence: SequenceData) {
    // The picker hands over a raw SequenceData; the payload is what every
    // sequence-rendering consumer downstream expects.
    pendingAttachment = { type: "sequence", payload: buildSequenceSharePayload(sequence) };
    attachmentProgress = null;
  }
```

- [ ] **Step 5: Update the picker's label derivation**

In `src/lib/shared/inbox/components/messages/MessageAttachmentPicker.svelte`,
replace `sequenceLabel` (currently lines 80-89):

```ts
  const sequenceLabel = $derived.by(() => {
    if (attachment?.type !== "sequence") return "";
    const { payload } = attachment;
    // buildSequenceSharePayload already ran displayName/intendedWord/word
    // through simplifyRepeatedWord, so this is the simplified form by
    // construction (.claude/rules/simplified-word-display.md).
    return payload.sequenceWord || payload.sequenceName || payload.sequence.word || "";
  });
```

- [ ] **Step 6: Generalize the inbox state**

In `src/lib/shared/inbox/state/inbox-state.svelte.ts`:

Add the import beside the existing `SequenceSharePayload` import (line 13):

```ts
import type { PendingMessageAttachment } from "../domain/pending-message-attachment";
```

Change the `InboxView` union member (line 24) `"send-sequence"` → `"send-attachment"`:

```ts
export type InboxView =
  | "list"
  | "thread"
  | "compose"
  | "group-settings"
  | "send-attachment";
```

Replace the `shareSequencePayload` declaration (line 63) with:

```ts
  /**
   * What the share sheet is about to send. The domain already modelled
   * image | sequence; only this view was sequence-only.
   */
  shareAttachment = $state<PendingMessageAttachment | null>(null);

  /** Prefilled note — shared text that was not a TKA code (Task 10). */
  shareAttachmentNote = $state<string | null>(null);

  /**
   * The share-intake record these bytes came from, or null for an ordinary
   * in-app share.
   *
   * Trace 2.14 needs it: the intake is resolved when the image is SENT, not
   * when the picker opens. Held as a plain id rather than a callback so a
   * reload cannot strand a closure - the id is re-derivable from the store,
   * a closure is not.
   */
  shareAttachmentReceiptId = $state<string | null>(null);
```

Replace every remaining `this.shareSequencePayload = null;` with **three** lines:

```ts
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
```

There are eleven such sites: lines 95 (`open`), 106 (`close`), 122 (`setTab`),
126 (`selectConversation`), 138 (`openToConversation`), 151
(`openToConversationById`), 165 (`openToNotification`), 178 (`backToList`), 188
(`startCompose`), 196 (`startGroupCompose`), 228 (`completeSequenceShare`).

Replace `openSequenceShare` (lines 210-225) with the generalized trio:

```ts
  /** Open the picker for any attachment the domain models. */
  openAttachmentShare(
    attachment: PendingMessageAttachment,
    options: { note?: string; receiptId?: string } = {}
  ) {
    this.isOpen = true;
    this.activeTab = "messages";
    this.currentView = "send-attachment";
    this.shareAttachment = attachment;
    this.shareAttachmentNote = options.note ?? null;
    this.shareAttachmentReceiptId = options.receiptId ?? null;
    this.pendingConversationId = null;
    this.pendingNotificationId = null;
    this.selectedConversation = null;
    this.messages = [];
    this.composeRecipientId = null;
    this.composeRecipientName = null;
    this.composeGroupMode = false;
    this.replyToMessage = null;
    this.editingMessage = null;
    this.typingUsers = [];
  }

  /** Existing sequence call sites keep working unchanged. */
  openSequenceShare(payload: SequenceSharePayload) {
    this.openAttachmentShare({ type: "sequence", payload });
  }

  completeAttachmentShare(conversationId: string) {
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
    this.openToConversationById(conversationId);
  }

  /**
   * Cancel is NOT a data-loss path any more. It clears the view; the intake
   * record and its bytes stay in IndexedDB as `ready` until the TTL, so the
   * share can be resumed. The previous revision deleted the record when the
   * picker OPENED, which made cancel, reload, crash and the sign-in round trip
   * all destroy the only copy.
   */
  cancelAttachmentShare() {
    this.close();
  }
```

Then rewrite the two old completion methods (lines 227-234) as aliases so no
existing caller churns:

```ts
  completeSequenceShare(conversationId: string) {
    this.completeAttachmentShare(conversationId);
  }

  cancelSequenceShare() {
    this.cancelAttachmentShare();
  }
```

- [ ] **Step 7: Add the generalized entry point**

In `src/lib/shared/inbox/state/send-sequence-state.svelte.ts`, add beside the
existing `openSendSequenceSheet` (line 23):

```ts
import type { PendingMessageAttachment } from "../domain/pending-message-attachment";

/**
 * The share-intake entry point, called by intake-router.ts (Task 10).
 * openSendSequenceSheet stays as the sequence-shaped convenience its four
 * existing call sites already use.
 *
 * The router goes through this function rather than poking `inboxState`
 * directly so both share paths - in-app and share-sheet - enter the picker the
 * same way. An earlier revision added this function and then never called it
 * from anywhere, which is a dead export, not an entry point.
 */
export function openSendAttachmentSheet(
  attachment: PendingMessageAttachment,
  options: { note?: string; receiptId?: string } = {}
): void {
  inboxState.openAttachmentShare(attachment, options);
}
```

- [ ] **Step 8: Rename the sheet and its test**

```bash
git mv src/lib/shared/inbox/components/messages/SendSequenceSheet.svelte src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte
git mv src/lib/shared/inbox/components/messages/SendSequenceSheet.svelte.test.ts src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte.test.ts
```

- [ ] **Step 9: Update the drawer**

In `src/lib/shared/inbox/components/InboxDrawer.svelte`:

Line 21 — the import:

```svelte
  import SendAttachmentSheet from "./messages/SendAttachmentSheet.svelte";
```

Line 274 — the back/escape branch:

```ts
      } else if (inboxState.currentView === "send-attachment") {
        inboxState.cancelAttachmentShare();
```

Lines 536-537 — the header branch and its title:

```svelte
      {:else if inboxState.currentView === "send-attachment"}
        <h2 id="inbox-title">
          {inboxState.shareAttachment?.type === "image"
            ? "Send image"
            : "Send sequence"}
        </h2>
```

Line 561 — the content class:

```svelte
      class:contained={inboxState.currentView === "send-attachment"}
```

Lines 600-604 — the render:

```svelte
      {:else if inboxState.currentView === "send-attachment"}
        {#if inboxState.shareAttachment}
          <SendAttachmentSheet
            attachment={inboxState.shareAttachment}
            initialNote={inboxState.shareAttachmentNote ?? ""}
            onSent={handleSequenceSent}
          />
        {/if}
```

`handleSequenceSent` (line 245) is left alone in this task. Trace step 2.14 —
resolving the intake record when the image is actually SENT — needs
`completeShareIntake`, which lands in Task 11, so the drawer hook is wired
there. Wiring it here would leave this task's `npm run check` red on a symbol
that does not exist yet.

- [ ] **Step 10: Rework the sheet's script**

In `src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte`:

Add the image sender import beside the messaging imports:

```ts
  import { getMessageImageSender } from "$lib/shared/messaging/get-message-image-sender";
  import type { PendingMessageAttachment } from "../../domain/pending-message-attachment";
```

Replace the `Props` interface and the `payload` binding (lines 22-33):

```ts
  interface Props {
    attachment: PendingMessageAttachment;
    /** Prefilled note. Share intake passes the shared text that was not a code. */
    initialNote?: string;
    onSent: (conversationId: string) => void;
  }

  type SelectedUser = {
    id: string;
    displayName: string;
    avatar?: string;
  };

  let { attachment, initialNote = "", onSent }: Props = $props();

  // Naming this `payload` is what keeps the nine existing payload.* references
  // in this file working across the generalization.
  const payload = $derived(
    attachment.type === "sequence" ? attachment.payload : null
  );
  const image = $derived(attachment.type === "image" ? attachment : null);
```

Change the message initializer (line 40) so a prefilled note lands in it:

```ts
  let message = $state(initialNote);
```

Add an object URL for the image preview, next to the other deriveds:

```ts
  const imagePreviewUrl = $derived(image ? URL.createObjectURL(image.file) : null);

  // Revoke on swap and on unmount; a leaked blob: URL pins the whole image in
  // memory for the life of the tab.
  $effect(() => {
    const url = imagePreviewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });
```

Replace `displayWord` (lines 49-53) and add the two labels:

```ts
  const displayWord = $derived(
    payload
      ? simplifyRepeatedWord(payload.sequenceWord || payload.sequenceCloudWord || "")
      : (image?.file.name ?? "")
  );
  const kicker = $derived(attachment.type === "image" ? "Sending" : "Sharing");
  const sendLabel = $derived(
    attachment.type === "image" ? "Send image" : "Send sequence"
  );
```

Replace `send()` (lines 138-189) with the branching version:

```ts
  async function resolveConversationId(
    conversation: ConversationPreview | null,
    user: SelectedUser | null
  ): Promise<string> {
    if (conversation) return conversation.id;
    const created = await conversationService.getOrCreateConversation(user!.id, {
      silent: true,
    });
    return created.conversation.id;
  }

  async function send(): Promise<void> {
    const conversation = selectedConversation;
    const user = selectedUser;
    if ((!conversation && !user) || phase !== "idle") return;

    phase = "sending";

    try {
      await ensureGuestIdentity();

      let conversationId: string;

      if (attachment.type === "sequence") {
        // Short code first, exactly as before: creating the conversation and
        // THEN failing would leave an empty conversation behind.
        const { code } = await getShortCodeManager().createShortCode(
          attachment.payload.sequence,
          { embedSequenceData: true }
        );
        const sequenceAttachment = buildSequenceMessageAttachment(
          attachment.payload.sequence,
          code
        );
        conversationId = await resolveConversationId(conversation, user);
        await messagingService.sendMessage({
          conversationId,
          content: message.trim(),
          attachments: [sequenceAttachment],
        });
      } else {
        // The image path is a Storage upload, not a message write:
        // IMessageImageSender owns finalization and clears staging itself, and
        // it needs the conversation id up front.
        conversationId = await resolveConversationId(conversation, user);
        await getMessageImageSender().send({
          conversationId,
          messageId: attachment.messageId,
          attachmentId: attachment.attachmentId,
          file: attachment.file,
          content: message.trim(),
        }).promise;
      }

      hapticService?.trigger("success");
      onSent(conversationId);
    } catch (caught) {
      const failure =
        caught instanceof Error ? caught : new Error(String(caught));
      getErrorHandler().showUserError({
        message:
          getShortCodeShareMessage(caught) ??
          (attachment.type === "image"
            ? "The image wasn’t sent. Try again."
            : "The sequence wasn’t sent. Try again."),
        technicalDetails: failure.message,
        error: failure,
        severity: "warning",
        context: {
          module: "inbox",
          tab: "messages",
          action: attachment.type === "image" ? "sendImage" : "sendSequence",
        },
      });
      hapticService?.trigger("error");
      phase = "idle";
    }
  }
```

- [ ] **Step 11: Rework the sheet's markup and class name**

Replace the root class and the preview article (lines 192-227):

```svelte
<div
  class="send-attachment-sheet"
  class:destination-selected={hasDestination}
  aria-busy={phase === "sending"}
>
  <article class="sequence-preview" aria-label="Attachment being shared">
    <div class="preview-thumbnail">
      {#if payload && payload.sequenceThumbnail && !thumbnailFailed}
        <img
          src={payload.sequenceThumbnail}
          alt=""
          class="thumbnail-img"
          onerror={() => {
            thumbnailFailed = true;
          }}
        />
      {:else if imagePreviewUrl}
        <img src={imagePreviewUrl} alt="" class="thumbnail-img" />
      {:else}
        <div class="thumbnail-fallback" aria-hidden="true">
          <i class="fas {image ? 'fa-image' : 'fa-layer-group'}"></i>
        </div>
      {/if}
    </div>

    <div class="preview-info">
      <span class="preview-kicker">{kicker}</span>
      <strong class="preview-word">{displayWord || "Attachment"}</strong>
      <div class="preview-meta">
        {#if payload?.sequenceStepCount}
          <span>{payload.sequenceStepCount} steps</span>
        {/if}
        {#if payload?.sequenceAuthor}
          <span>by {payload.sequenceAuthor}</span>
        {/if}
      </div>
    </div>
  </article>
```

Change the send button's label (line 366):

```svelte
    <span>{phase === "sending" ? "Sending…" : sendLabel}</span>
```

Rename the CSS selector at **all four** remaining sites — lines 371, 747, 816
and 854 — from `.send-sequence-sheet` to `.send-attachment-sheet`. Nothing else
in the stylesheet changes.

Run: `grep -c "send-sequence-sheet" src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte`
Expected: `0`.

- [ ] **Step 12: Update the component test**

In `src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte.test.ts`:

Change the import (line 6):

```ts
import SendAttachmentSheet from "./SendAttachmentSheet.svelte";
```

Add the image-sender mock beside the other `vi.mock` calls:

```ts
vi.mock("$lib/shared/messaging/get-message-image-sender", () => ({
  getMessageImageSender: () => ({ send: mocks.sendImage }),
}));
```

Add `sendImage: vi.fn()` to the `vi.hoisted` block, and to `beforeEach`:

```ts
    mocks.sendImage.mockReset();
    mocks.sendImage.mockReturnValue({
      promise: Promise.resolve({
        messageId: "message-1",
        storagePath: "p",
        width: 1,
        height: 1,
      }),
      cancel: vi.fn(),
    });
```

Replace all three `render(SendSequenceSheet, { payload: createPayload(), onSent })`
calls with:

```ts
    render(SendAttachmentSheet, {
      attachment: { type: "sequence", payload: createPayload() },
      onSent,
    });
```

(the third one passes `onSent: vi.fn()` — keep that as it is).

Then append the test that proves the feature's actual point — that this sheet
can send an image at all:

```ts
  it("uploads an image attachment through the image sender", async () => {
    addGroupConversation();
    const onSent = vi.fn();

    render(SendAttachmentSheet, {
      attachment: {
        type: "image",
        file: new File([new Uint8Array([1, 2, 3])], "shared.png", {
          type: "image/png",
        }),
        messageId: "msg-1",
        attachmentId: "att-1",
      },
      initialNote: "from the share sheet",
      onSent,
    });

    await page.getByRole("button", { name: /Send to Tuesday Jam/ }).click();
    await page.getByRole("button", { name: "Send image" }).click();

    await vi.waitFor(() => {
      expect(mocks.sendImage).toHaveBeenCalledOnce();
    });

    expect(mocks.sendImage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "group-1",
        messageId: "msg-1",
        attachmentId: "att-1",
        content: "from the share sheet",
      })
    );
    // An image never goes through the message writer; the sender owns the write.
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(onSent).toHaveBeenCalledWith("group-1");
  });
```

- [ ] **Step 13: Run both suites**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/inbox-attachment-share.test.ts`
Expected: PASS, 8 tests.

Run: `npx vitest run --config tests/config/vitest.components.config.ts src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 14: Prove no stale reference survived the rename**

Run: `grep -rn "SendSequenceSheet\.svelte\|shareSequencePayload\|\"send-sequence\"" src/ | wc -l`
Expected: `0`.

The pattern is `SendSequenceSheet\.svelte`, not `SendSequenceSheet`. An earlier
revision used the bare name and could never pass: `openSendSequenceSheet` — the
identifier this task **deliberately keeps**, plus its four call sites — contains
`SendSequenceSheet` as a substring, so "Expected: 0" contradicted the task's own
design. Anchoring on `.svelte` matches the import and the file name and nothing
else. Sanity-check the distinction:

Run: `grep -rc "openSendSequenceSheet" src/ --include=*.svelte --include=*.ts | grep -v ":0" | wc -l`
Expected: `5` — the definition plus the four call sites (`ChoreoCardTab.svelte`,
`ChoreoCardThumbnail.svelte`, `SequenceViewerShell.svelte`,
`SequenceViewerPage.svelte`). If this is `0`, the rename went too far.

- [ ] **Step 15: Typecheck (capture once, grep many)**

Run: `npm run check > /tmp/check.log 2>&1; grep -ciE "^Error|: error" /tmp/check.log`
Expected: `0`. If non-zero, `grep -iE "error" /tmp/check.log | head -20` and fix.
Do **not** re-run `check` to re-filter (`.claude/rules/fast-iteration-loop.md`).

- [ ] **Step 16: Commit**

```bash
git commit -m "refactor(inbox): generalize the share sheet to send an image or a sequence" -- \
  src/lib/shared/inbox/domain/pending-message-attachment.ts \
  src/lib/shared/inbox/state/inbox-state.svelte.ts \
  src/lib/shared/inbox/state/send-sequence-state.svelte.ts \
  src/lib/shared/inbox/components/InboxDrawer.svelte \
  src/lib/shared/inbox/components/messages/MessageComposer.svelte \
  src/lib/shared/inbox/components/messages/MessageAttachmentPicker.svelte \
  src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte \
  src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte.test.ts \
  tests/unit/share-intake/inbox-attachment-share.test.ts
```

Explicit paths, not `-- src/lib/shared/inbox/`. A directory pathspec is a sweep:
the index is shared with other agent sessions, so any file another session has
touched anywhere under `inbox/` would be swept into this commit
(`.claude/rules/commit-only-your-own-changes.md`). The two `git mv`'d paths are
covered because git records the rename from the new path.

---

### Task 10: Route a classified intake to its destination — DONE (`336dff9ab7`)

**Closes trace steps 1.12, 1.13's hand-off, and 2.11.** This is where a
classification becomes something the user can see: a card opens the viewer, an
image opens the picker.

Seven defects earlier revisions shipped:

- **The card path had no destination at all.** `routeIntake` returned
  `result.cards` and nothing consumed it — the runner read `unresolved`,
  `queued` and `problems`, discarded `cards`, and deleted the record. For a
  `docBacked` card the entire feature was a no-op. It now calls
  `openFiledCard` (Task 8).
- **The comment promised a queue and the code took `images[0]`**, discarding the
  rest with no trace. The extras now come back as `queued` with a
  `send-dropped` problem each, and the runner holds the record open.
- **`resolveForImport` is a network read that can reject**, and one rejection
  killed routing for every other item. Each await is wrapped.
- **`ResolvedCard.sequence` was typed `unknown`**, discarding the very type
  needed to file a printed (non-`docBacked`) card the way
  `ScanCardSheet.svelte:172-227` (the `if (!resolution.docBacked)` branch of
  `handleHit`) does.
- **`residualText` was documented as prefilled message text and never read.**
- **Codes were not deduped across the image/text merge** — the same card
  photographed *and* linked resolved twice.
- **`.filter()` does not narrow a union**, so the draft cast with
  `as { code: string }`. Type predicates instead.

Two things this revision fixes that unit review could not see:

- **A code that failed to resolve was reported twice.** The router pushed a
  `resolve-failed` problem AND left the code in `unresolved`; the runner then
  mapped every `unresolved` entry to a second `resolve-failed`. The router is
  now the single author of those problems — it pushes one for every unresolved
  code including the "resolved to null" case — and the runner synthesizes none.
- **The router poked `inboxState` directly**, bypassing
  `openSendAttachmentSheet`, which is why that function ended up a dead export.
  It goes through the entry point like every other caller.

**Design decision — cards win a mixed share.** If a share carries both a
resolvable card and loose images, the viewer opens for the card and the images
come back as `queued` + `send-dropped`. Opening the viewer overlay and the inbox
picker simultaneously would put two overlays on screen fighting for the same
back gesture. A card-plus-unrelated-photos share is rare; a card share that
silently opens a conversation picker instead is confusing every time.

`getShortCodeManager()` **throws** unless `configureShortCodeManager()` has run
(`get-short-code-manager.ts:20-22`). The runner is invoked from
`ShareIntakeHost` inside the app shell, which is after DI; the throw is caught
and recorded rather than assumed away, and there is a test for it.

**Files:**
- Create: `src/lib/shared/share-intake/services/intake-router.ts`
- Test: `tests/unit/share-intake/intake-router.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/share-intake/intake-router.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const openSendAttachmentSheet = vi.fn();
vi.mock("$lib/shared/inbox/state/send-sequence-state.svelte", () => ({
  openSendAttachmentSheet: (...args: unknown[]) =>
    openSendAttachmentSheet(...args),
}));

const openFiledCard = vi.fn();
vi.mock("$lib/shared/share-intake/services/open-filed-card", () => ({
  openFiledCard: (...args: unknown[]) => openFiledCard(...args),
}));

const resolveForImport = vi.fn();
const getShortCodeManager = vi.fn(() => ({ resolveForImport }));
vi.mock("$lib/shared/qr/get-short-code-manager", () => ({
  getShortCodeManager: () => getShortCodeManager(),
}));

const saveSequence = vi.fn();
vi.mock("$lib/features/library/get-library-save-service", () => ({
  getLibrarySaveService: () => ({ saveSequence }),
}));

const toast = { info: vi.fn(), error: vi.fn() };
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({ toast }));

import { routeIntake } from "$lib/shared/share-intake/services/intake-router";
import type { IntakeClassification } from "$lib/shared/share-intake/domain/share-intake-models";

function png(name: string): File {
  return new File([new Uint8Array([1])], name, { type: "image/png" });
}

function classification(
  overrides: Partial<IntakeClassification> = {}
): IntakeClassification {
  return {
    items: [],
    textCode: null,
    residualText: null,
    problems: [],
    ...overrides,
  };
}

const CONTEXT = { receiptId: "si_1" };

describe("routeIntake", () => {
  beforeEach(() => {
    openSendAttachmentSheet.mockReset();
    openFiledCard.mockReset();
    openFiledCard.mockResolvedValue(undefined);
    resolveForImport.mockReset();
    saveSequence.mockReset();
    getShortCodeManager.mockReset();
    getShortCodeManager.mockReturnValue({ resolveForImport });
    toast.info.mockReset();
    toast.error.mockReset();
  });

  it("opens the conversation picker for a plain image", async () => {
    const result = await routeIntake(
      classification({ items: [{ kind: "image", file: png("a.png") }] }),
      null,
      CONTEXT
    );

    expect(openSendAttachmentSheet).toHaveBeenCalledTimes(1);
    expect(openSendAttachmentSheet.mock.calls[0][0].type).toBe("image");
    expect(result.cards).toHaveLength(0);
    expect(result.opened).toBe("picker");
  });

  it("hands the picker the intake receiptId so the send can resolve it", async () => {
    // Trace 2.14. Without this the drawer cannot tell WHICH record the bytes
    // it just sent belonged to.
    await routeIntake(
      classification({ items: [{ kind: "image", file: png("a.png") }] }),
      null,
      CONTEXT
    );

    expect(openSendAttachmentSheet.mock.calls[0][1]).toMatchObject({
      receiptId: "si_1",
    });
  });

  it("goes through openSendAttachmentSheet, not inboxState directly", async () => {
    // Named as its own test because an earlier revision poked inboxState and
    // left openSendAttachmentSheet a dead export.
    await routeIntake(
      classification({ items: [{ kind: "image", file: png("a.png") }] }),
      null,
      CONTEXT
    );
    expect(openSendAttachmentSheet).toHaveBeenCalled();
  });

  it("passes residual text through as the prefilled note", async () => {
    await routeIntake(
      classification({
        items: [{ kind: "image", file: png("a.png") }],
        residualText: "look at this",
      }),
      null,
      CONTEXT
    );

    expect(openSendAttachmentSheet.mock.calls[0][1]).toMatchObject({
      note: "look at this",
    });
  });

  it("resolves a doc-backed card without touching the library", async () => {
    resolveForImport.mockResolvedValue({
      sequence: { id: "s1", word: "ABC" },
      docBacked: true,
    });

    const result = await routeIntake(
      classification({ items: [{ kind: "card", code: "AB12", file: png("c.png") }] }),
      "user-1",
      CONTEXT
    );

    expect(resolveForImport).toHaveBeenCalledWith("AB12", "user-1");
    expect(result.cards[0]).toMatchObject({ code: "AB12", docBacked: true, targetId: "s1" });
    expect(saveSequence).not.toHaveBeenCalled();
    expect(openSendAttachmentSheet).not.toHaveBeenCalled();
  });

  it("OPENS THE VIEWER on the filed card - trace 1.13", async () => {
    // The headline gap in every previous revision: cards were computed and
    // then thrown away, so a shared card produced nothing on screen.
    resolveForImport.mockResolvedValue({
      sequence: { id: "s1", word: "ABC" },
      docBacked: true,
    });

    const result = await routeIntake(
      classification({ items: [{ kind: "card", code: "AB12", file: png("c.png") }] }),
      "user-1",
      CONTEXT
    );

    expect(openFiledCard).toHaveBeenCalledWith({
      code: "AB12",
      sequence: { id: "s1", word: "ABC" },
      extraCards: 0,
      word: "ABC",
    });
    expect(result.opened).toBe("card");
  });

  it("opens one viewer and reports the rest when a share carries several cards", async () => {
    resolveForImport
      .mockResolvedValueOnce({ sequence: { id: "s1", word: "A" }, docBacked: true })
      .mockResolvedValueOnce({ sequence: { id: "s2", word: "B" }, docBacked: true });

    await routeIntake(
      classification({
        items: [
          { kind: "card", code: "AA11", file: png("a.png") },
          { kind: "card", code: "BB22", file: png("b.png") },
        ],
      }),
      null,
      CONTEXT
    );

    expect(openFiledCard).toHaveBeenCalledTimes(1);
    expect(openFiledCard.mock.calls[0][0].extraCards).toBe(1);
  });

  it("saves a printed (non-doc-backed) card to the library before filing it", async () => {
    // ScanCardSheet.svelte:172-227 does exactly this. Without it the "card" points at
    // nothing.
    resolveForImport.mockResolvedValue({
      sequence: { id: "inline", word: "ABC" },
      docBacked: false,
    });
    saveSequence.mockResolvedValue({ sequenceId: "lib-9", persisted: true });

    const result = await routeIntake(
      classification({ items: [{ kind: "card", code: "AB12", file: png("c.png") }] }),
      "user-1",
      CONTEXT
    );

    expect(saveSequence).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inline" }),
      { name: "ABC", visibility: "public", tags: [], notes: "" }
    );
    expect(result.cards[0].targetId).toBe("lib-9");
  });

  it("queues the images and does not open the picker when a card also resolved", async () => {
    // Design decision: two overlays fighting for the back gesture is worse
    // than one reported deferral.
    resolveForImport.mockResolvedValue({
      sequence: { id: "s1", word: "A" },
      docBacked: true,
    });

    const result = await routeIntake(
      classification({
        items: [
          { kind: "card", code: "AB12", file: png("c.png") },
          { kind: "image", file: png("photo.png") },
        ],
      }),
      null,
      CONTEXT
    );

    expect(openFiledCard).toHaveBeenCalledTimes(1);
    expect(openSendAttachmentSheet).not.toHaveBeenCalled();
    expect(result.queued.map((f) => f.name)).toEqual(["photo.png"]);
    expect(result.problems).toContainEqual(
      expect.objectContaining({ name: "photo.png", reason: "send-dropped" })
    );
  });

  it("reports an unresolvable code ONCE, as both unresolved and one problem", async () => {
    // The router is the single author of resolve-failed problems. An earlier
    // revision pushed one here AND let the runner synthesize a second from
    // `unresolved`, so one bad code produced two identical entries.
    resolveForImport.mockResolvedValue(null);

    const result = await routeIntake(
      classification({ items: [{ kind: "card", code: "BAD1", file: png("c.png") }] }),
      null,
      CONTEXT
    );

    expect(result.cards).toHaveLength(0);
    expect(result.unresolved).toEqual(["BAD1"]);
    expect(
      result.problems.filter((p) => p.reason === "resolve-failed")
    ).toHaveLength(1);
    expect(result.opened).toBeNull();
  });

  it("keeps routing the other codes when one resolve rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    resolveForImport
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ sequence: { id: "s2", word: "B" }, docBacked: true });

    const result = await routeIntake(
      classification({
        items: [
          { kind: "card", code: "AA11", file: png("a.png") },
          { kind: "card", code: "BB22", file: png("b.png") },
        ],
      }),
      null,
      CONTEXT
    );

    expect(result.unresolved).toEqual(["AA11"]);
    expect(result.cards).toHaveLength(1);
    expect(result.problems).toContainEqual(
      expect.objectContaining({ name: "AA11", reason: "resolve-failed" })
    );
  });

  it("records resolve-failed when the manager itself is unconfigured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getShortCodeManager.mockImplementation(() => {
      throw new Error("getShortCodeManager(): call configureShortCodeManager() first");
    });

    const result = await routeIntake(
      classification({ items: [{ kind: "card", code: "AB12", file: png("c.png") }] }),
      null,
      CONTEXT
    );

    expect(result.unresolved).toEqual(["AB12"]);
    expect(result.problems[0].reason).toBe("resolve-failed");
  });

  it("resolves a code found in shared text", async () => {
    resolveForImport.mockResolvedValue({ sequence: { id: "s2", word: "B" }, docBacked: true });

    const result = await routeIntake(
      classification({ textCode: "XY99" }),
      null,
      CONTEXT
    );

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].code).toBe("XY99");
  });

  it("dedupes a code that appears in both an image and the text", async () => {
    resolveForImport.mockResolvedValue({ sequence: { id: "s1", word: "A" }, docBacked: true });

    const result = await routeIntake(
      classification({
        items: [{ kind: "card", code: "AB12", file: png("c.png") }],
        textCode: "AB12",
      }),
      null,
      CONTEXT
    );

    expect(resolveForImport).toHaveBeenCalledTimes(1);
    expect(result.cards).toHaveLength(1);
  });

  it("ignores a duplicate item entirely", async () => {
    const result = await routeIntake(
      classification({
        items: [{ kind: "duplicate", code: "AB12", file: png("b.png") }],
      }),
      null,
      CONTEXT
    );

    expect(openSendAttachmentSheet).not.toHaveBeenCalled();
    expect(openFiledCard).not.toHaveBeenCalled();
    expect(result.cards).toHaveLength(0);
    expect(result.queued).toHaveLength(0);
  });

  it("queues images past the first and records them rather than dropping them", async () => {
    const result = await routeIntake(
      classification({
        items: [
          { kind: "image", file: png("a.png") },
          { kind: "image", file: png("b.png") },
          { kind: "image", file: png("c.png") },
        ],
      }),
      null,
      CONTEXT
    );

    expect(openSendAttachmentSheet).toHaveBeenCalledTimes(1);
    expect(result.queued.map((f) => f.name)).toEqual(["b.png", "c.png"]);
    expect(result.problems.map((p) => p.reason)).toEqual([
      "send-dropped",
      "send-dropped",
    ]);
  });

  it("reports nothing opened for an empty classification", async () => {
    const result = await routeIntake(classification(), null, CONTEXT);
    expect(result.opened).toBeNull();
  });

  it("toasts the count of images left queued behind the picker", async () => {
    // The router is the only place that knows how many images did NOT reach a
    // screen. Without this the user sees one picker open and nothing else -
    // the other two files are gone as far as they can tell.
    await routeIntake(
      classification({
        items: [
          { kind: "image", file: png("a.png") },
          { kind: "image", file: png("b.png") },
          { kind: "image", file: png("c.png") },
        ],
      }),
      null,
      CONTEXT
    );

    expect(toast.info).toHaveBeenCalledWith(
      "2 more images are saved — share again to send them."
    );
  });

  it("says nothing when only one image was shared and none are queued", async () => {
    await routeIntake(
      classification({ items: [{ kind: "image", file: png("a.png") }] }),
      null,
      CONTEXT
    );

    expect(toast.info).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/intake-router.test.ts`
Expected: FAIL — `Failed to resolve import ".../intake-router"`.

- [ ] **Step 3: Write the router**

Create `src/lib/shared/share-intake/services/intake-router.ts`:

```ts
import { getLibrarySaveService } from "$lib/features/library/get-library-save-service";
import { openSendAttachmentSheet } from "$lib/shared/inbox/state/send-sequence-state.svelte";
import { getShortCodeManager } from "$lib/shared/qr/get-short-code-manager";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type {
  IntakeClassification,
  IntakeItem,
  IntakeProblem,
} from "../domain/share-intake-models";
import { openFiledCard } from "./open-filed-card";

type CardItem = Extract<IntakeItem, { kind: "card" }>;
type ImageItem = Extract<IntakeItem, { kind: "image" }>;

// Array.filter does NOT narrow a union on its own; these predicates are what
// make `item.code` and `item.file` legal below without a cast.
const isCard = (item: IntakeItem): item is CardItem => item.kind === "card";
const isImage = (item: IntakeItem): item is ImageItem => item.kind === "image";

export interface FiledCard {
  code: string;
  sequence: SequenceData;
  /** False for printed deck cards with no referenceable doc. */
  docBacked: boolean;
  /**
   * The id a caller should open. Equals sequence.id when docBacked; otherwise
   * the id produced by saving the printed card into My Library.
   */
  targetId: string;
}

export interface RouteResult {
  cards: FiledCard[];
  /**
   * Codes that did not resolve. Every entry here ALSO has exactly one
   * `resolve-failed` problem in `problems` - this array is the retry list, the
   * problem is the user-facing record. The runner must not synthesize a second
   * problem from this array.
   */
  unresolved: string[];
  /**
   * Files that did not reach a destination in this pass: images past the
   * first, and every image in a share where a card won. Sequential batch send
   * with per-item progress and partial-success retry is a cut WE made to keep
   * this plan shippable - see Known accepted limitations. They are REPORTED
   * rather than discarded, and their intake stays as partially-sent.
   */
  queued: File[];
  problems: IntakeProblem[];
  /** What the user is now looking at. Null means nothing reached a screen. */
  opened: "card" | "picker" | null;
}

/**
 * Send a classified intake to its destination - the hop that makes a share
 * visible.
 *
 * Cards resolve through the existing import path, are filed the same way
 * ScanCardSheet files them, and the first one OPENS THE VIEWER. Images open
 * the inbox conversation picker. `duplicate` items are ignored entirely: they
 * are second photos of a card already handled, and sending one as an image
 * would put a picture of a card into a conversation.
 */
export async function routeIntake(
  classification: IntakeClassification,
  userId: string | null,
  context: { receiptId: string }
): Promise<RouteResult> {
  const cards: FiledCard[] = [];
  const unresolved: string[] = [];
  const problems: IntakeProblem[] = [];

  // The same card can be photographed AND linked in the shared text. Resolving
  // it twice costs a second network read and files it twice.
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const code of [
    ...classification.items.filter(isCard).map((item) => item.code),
    ...(classification.textCode ? [classification.textCode] : []),
  ]) {
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }

  for (const code of codes) {
    // Each of these is a network read, and getShortCodeManager() itself throws
    // when DI has not run. One failure must not abandon the remaining codes.
    try {
      const resolution = await getShortCodeManager().resolveForImport(code, userId);
      if (!resolution) {
        unresolved.push(code);
        // ONE problem per unresolved code, authored here. The runner adds none.
        problems.push({
          name: code,
          reason: "resolve-failed",
          detail: "no sequence behind this code",
        });
        continue;
      }
      cards.push(await fileCard(code, resolution));
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      unresolved.push(code);
      problems.push({ name: code, reason: "resolve-failed", detail });
      console.error(`[ShareIntake] Could not resolve ${code}:`, detail);
    }
  }

  const images = classification.items.filter(isImage);
  const queued: File[] = [];
  let opened: "card" | "picker" | null = null;

  if (cards.length > 0) {
    // Trace 1.13. Throws on a hydration failure; the runner catches it and
    // keeps the record, which is why this is awaited rather than fired off.
    const first = cards[0];
    opened = "card";
    await openFiledCard({
      code: first.code,
      sequence: first.sequence,
      extraCards: cards.length - 1,
      word: first.sequence.word || first.sequence.name || "",
    });

    // Cards win a mixed share: the viewer overlay and the inbox picker would
    // otherwise both be on screen fighting for the same back gesture.
    for (const item of images) {
      queued.push(item.file);
      problems.push({
        name: item.file.name,
        reason: "send-dropped",
        detail: "a card in the same share opened the viewer",
      });
    }

    return { cards, unresolved, queued, problems, opened };
  }

  if (images.length > 0) {
    const [first, ...rest] = images;
    opened = "picker";
    openSendAttachmentSheet(
      {
        type: "image",
        file: first.file,
        // Same id shape MessageComposer.selectImage uses, and the same shape
        // the Storage staging path in
        // services/implementations/MessageImageSender.ts:37-39 expects.
        messageId: crypto.randomUUID(),
        attachmentId: crypto.randomUUID(),
      },
      {
        // The picker carries the intake id so the SEND - not the open - is
        // what resolves the record (trace 2.14).
        receiptId: context.receiptId,
        ...(classification.residualText
          ? { note: classification.residualText }
          : {}),
      }
    );

    for (const item of rest) {
      queued.push(item.file);
      problems.push({ name: item.file.name, reason: "send-dropped" });
    }

    // The picker only ever shows ONE image. Without this, the other N images
    // in a SEND_MULTIPLE share vanish from the user's point of view - they see
    // one picker open and nothing else. Mirrors openFiledCard's extraCards
    // toast (Task 8) for the image side of the same problem.
    if (rest.length > 0) {
      toast.info(
        rest.length === 1
          ? "1 more image is saved — share again to send it."
          : `${rest.length} more images are saved — share again to send them.`
      );
    }
  }

  return { cards, unresolved, queued, problems, opened };
}

async function fileCard(
  code: string,
  resolution: { sequence: SequenceData; docBacked: boolean }
): Promise<FiledCard> {
  if (resolution.docBacked) {
    return {
      code,
      sequence: resolution.sequence,
      docBacked: true,
      targetId: resolution.sequence.id,
    };
  }

  // No referenceable doc behind this card (printed deck cards): save it to My
  // Library under the normal public default, then file it. Exactly the branch
  // ScanCardSheet.svelte:172-227 takes.
  const name = resolution.sequence.word || resolution.sequence.name || "Sequence";
  const saved = await getLibrarySaveService().saveSequence(resolution.sequence, {
    name,
    visibility: "public",
    tags: [],
    notes: "",
  });

  return {
    code,
    sequence: resolution.sequence,
    docBacked: false,
    targetId: saved.sequenceId,
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/intake-router.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Prove no destination was left dangling**

Run: `grep -c "openFiledCard" src/lib/shared/share-intake/services/intake-router.ts && grep -c "openSendAttachmentSheet" src/lib/shared/share-intake/services/intake-router.ts`
Expected: `2` and `2` (import + call site for each). A `1` means one of the two
destinations is imported and never invoked — the exact shape of the bug this
task exists to fix.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(share-intake): route classified intakes to a viewer or a conversation picker" -- src/lib/shared/share-intake/services/intake-router.ts tests/unit/share-intake/intake-router.test.ts
```

---

### Task 11: The consumer — `share-intake-runner` — DONE (`f5c578f48c`)

**Closes trace steps 1.10, 1.14, 2.10, 2.12, 2.14 and 3.10–3.12.** This is the
lifecycle: what gets classified, what has to wait for a sign-in, when a record
is kept, and — critically — when it is finally deleted.

**Everything built so far is unreachable without it.** `classifyIntake` and
`routeIntake` are called by nothing but their own tests; a persisted intake
would sit in IndexedDB forever.

Four things this revision changes, all of them whole-picture defects rather
than unit defects:

- **`hasPendingShare` is deleted, not rewritten.** It existed for one caller:
  a boot barrier in `native-initializer.ts` that suppressed `bootIntoApp()`
  when a share was pending. That barrier is gone (Task 13) because suppressing
  `bootIntoApp()` stranded the user on the marketing landing, where nothing
  that renders a share exists. With the barrier gone, `hasPendingShare` has no
  caller and no trace step, so it does not belong in this plan.
- **The signed-out lifecycle now exists.** No production path ever wrote
  `status: "needs-auth"`, which made `NEEDS_AUTH_TTL_MS`, the store's TTL
  exemption, its eviction refusal, and the `needs-auth` arm of `UNCONSUMED`
  reachable only from their own tests — four pieces of machinery guarding a
  state nothing could enter. The gate below is what enters it, and Task 12's
  auth `$effect` is what leaves it.
- **The record is no longer deleted when the picker OPENS.** It advances to
  `ready` and is deleted by `completeShareIntake` when the image is actually
  SENT. Previously the bytes lived only in an in-memory `File` on `inboxState`
  from picker-open onward, so cancel, reload, crash, or the magic-link round
  trip destroyed the only copy.
- **`unresolved` no longer produces a second problem.** Task 10's router is the
  single author of `resolve-failed`; this runner appends none.

Lifecycle, explicitly:

| Outcome | Status | Record |
|---|---|---|
| Card opened the viewer, nothing left over | — | deleted |
| Picker opened for an image | `ready` | **kept** until `completeShareIntake` |
| Image share, no full account | `needs-auth` | kept, TTL-exempt, user prompted |
| A code did not resolve, or files were queued with nothing on screen | `partially-sent` | kept, problems appended |
| Routing threw | `failed` | kept until the TTL reaps it, not retried |

**The auth gate is whole-intake, and that is a decision.** It fires when the
classification contains at least one `image` item, because
`services/implementations/MessageImageSender.ts:32-34` throws
`"Sign in with an account to send images."` for `!user || user.isAnonymous`. A
mixed card+image share therefore waits for
sign-in even though the card alone would not need it. The alternative — route
the cards now, hold the images — means the next run after sign-in must know
which cards it already filed, which is per-item progress state on the record.
Gating whole-intake has no double-file failure mode. A **cards-only** share is
never gated: `resolveForImport` takes `userId: string | null`, and
`ScanCardSheet` files printed cards for guests today.

**Files:**
- Create: `src/lib/shared/share-intake/services/share-intake-runner.ts`
- Modify: `src/lib/shared/inbox/components/InboxDrawer.svelte:245` (`handleSequenceSent`)
- Test: `tests/unit/share-intake/share-intake-runner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/share-intake/share-intake-runner.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";

vi.mock("$app/environment", () => ({ browser: true }));

const auth = { effectiveUserId: "user-1", isFullAccount: true, loading: false };
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    get effectiveUserId() {
      return auth.effectiveUserId;
    },
    get isFullAccount() {
      return auth.isFullAccount;
    },
    get loading() {
      return auth.loading;
    },
  },
}));

const showAuthDrawer = vi.fn();
vi.mock("$lib/shared/auth/state/auth-drawer-state.svelte", () => ({
  authDrawerState: { show: showAuthDrawer },
}));

const toast = { info: vi.fn(), error: vi.fn() };
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({ toast }));

const inboxState = { shareAttachmentReceiptId: null as string | null };
vi.mock("$lib/shared/inbox/state/inbox-state.svelte", () => ({ inboxState }));

const classifyIntake = vi.fn();
vi.mock("$lib/shared/share-intake/services/intake-classifier", () => ({
  classifyIntake: (...args: unknown[]) => classifyIntake(...args),
}));

const routeIntake = vi.fn();
vi.mock("$lib/shared/share-intake/services/intake-router", () => ({
  routeIntake: (...args: unknown[]) => routeIntake(...args),
}));

import {
  runPendingIntakes,
  scheduleIntakeRun,
  completeShareIntake,
} from "$lib/shared/share-intake/services/share-intake-runner";
import {
  putIntake,
  getIntake,
  listIntakes,
  deleteIntake,
} from "$lib/shared/share-intake/services/intake-store";
import type { SharedIntake } from "$lib/shared/share-intake/domain/share-intake-models";

function intake(overrides: Partial<SharedIntake> = {}): SharedIntake {
  return {
    receiptId: "si_1",
    source: "native",
    files: [new File([new Uint8Array([1])], "a.png", { type: "image/png" })],
    status: "received",
    receivedAt: Date.now(),
    problems: [],
    ...overrides,
  };
}

const emptyClassification = {
  items: [],
  textCode: null,
  residualText: null,
  problems: [],
};

function imageClassification() {
  return {
    ...emptyClassification,
    items: [
      {
        kind: "image" as const,
        file: new File([new Uint8Array([1])], "a.png", { type: "image/png" }),
      },
    ],
  };
}

const cleanRoute = {
  cards: [],
  unresolved: [],
  queued: [],
  problems: [],
  opened: null,
};

describe("share-intake-runner", () => {
  beforeEach(async () => {
    for (const record of await listIntakes()) await deleteIntake(record.receiptId);
    auth.effectiveUserId = "user-1";
    auth.isFullAccount = true;
    auth.loading = false;
    inboxState.shareAttachmentReceiptId = null;
    showAuthDrawer.mockReset();
    toast.info.mockReset();
    toast.error.mockReset();
    classifyIntake.mockReset();
    classifyIntake.mockResolvedValue(emptyClassification);
    routeIntake.mockReset();
    routeIntake.mockResolvedValue(cleanRoute);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("routes a pending intake and deletes it once nothing is left over", async () => {
    await putIntake(intake());

    await runPendingIntakes();

    expect(classifyIntake).toHaveBeenCalledTimes(1);
    expect(routeIntake).toHaveBeenCalledWith(emptyClassification, "user-1", {
      receiptId: "si_1",
    });
    expect(await getIntake("si_1")).toBeNull();
  });

  it("KEEPS the record as ready when the picker opened - trace 2.12", async () => {
    // The data-loss fix. The bytes must outlive picker-open: cancel, reload,
    // crash and the sign-in round trip all happen after this point.
    routeIntake.mockResolvedValue({ ...cleanRoute, opened: "picker" });
    await putIntake(intake());

    await runPendingIntakes();

    const record = await getIntake("si_1");
    expect(record?.status).toBe("ready");
    expect(record?.files[0].size).toBe(1);
  });

  it("does not re-open the picker for the record it is already open on", async () => {
    routeIntake.mockResolvedValue({ ...cleanRoute, opened: "picker" });
    await putIntake(intake());
    await runPendingIntakes();

    inboxState.shareAttachmentReceiptId = "si_1";
    routeIntake.mockClear();
    await runPendingIntakes();

    expect(routeIntake).not.toHaveBeenCalled();
  });

  it("re-opens the picker for a ready record after a reload", async () => {
    // Same record, but nothing is on screen any more (fresh boot). This is the
    // recovery path that makes cancel/reload survivable rather than terminal.
    routeIntake.mockResolvedValue({ ...cleanRoute, opened: "picker" });
    await putIntake(intake({ status: "ready" }));

    await runPendingIntakes();

    expect(routeIntake).toHaveBeenCalledTimes(1);
  });

  it("parks an image share as needs-auth and PROMPTS when there is no full account", async () => {
    auth.isFullAccount = false;
    auth.effectiveUserId = null;
    classifyIntake.mockResolvedValue(imageClassification());
    await putIntake(intake());

    await runPendingIntakes();

    expect(routeIntake).not.toHaveBeenCalled();
    expect((await getIntake("si_1"))?.status).toBe("needs-auth");
    expect(showAuthDrawer).toHaveBeenCalledWith("signin", "share-image-signin");
    expect(toast.info).toHaveBeenCalled();
  });

  it("prompts once per record, not once per run", async () => {
    auth.isFullAccount = false;
    classifyIntake.mockResolvedValue(imageClassification());
    await putIntake(intake());

    await runPendingIntakes();
    await runPendingIntakes();

    expect(showAuthDrawer).toHaveBeenCalledTimes(1);
  });

  it("does NOT gate a cards-only share behind sign-in", async () => {
    // resolveForImport takes `userId: string | null` and ScanCardSheet files
    // printed cards for guests today. Gating this would be a regression.
    auth.isFullAccount = false;
    auth.effectiveUserId = null;
    classifyIntake.mockResolvedValue({
      ...emptyClassification,
      items: [
        {
          kind: "card" as const,
          code: "AB12",
          file: new File([new Uint8Array([1])], "c.png", { type: "image/png" }),
        },
      ],
    });
    await putIntake(intake());

    await runPendingIntakes();

    expect(routeIntake).toHaveBeenCalledWith(expect.anything(), null, {
      receiptId: "si_1",
    });
    expect(showAuthDrawer).not.toHaveBeenCalled();
  });

  it("resumes a needs-auth record once the account is full - trace 3.16", async () => {
    auth.isFullAccount = false;
    classifyIntake.mockResolvedValue(imageClassification());
    await putIntake(intake());
    await runPendingIntakes();
    expect((await getIntake("si_1"))?.status).toBe("needs-auth");

    auth.isFullAccount = true;
    auth.effectiveUserId = "user-1";
    routeIntake.mockResolvedValue({ ...cleanRoute, opened: "picker" });
    await runPendingIntakes();

    expect(routeIntake).toHaveBeenCalledTimes(1);
    expect((await getIntake("si_1"))?.status).toBe("ready");
    // The bytes crossed the whole round trip.
    expect((await getIntake("si_1"))?.files[0].size).toBe(1);
  });

  it("keeps a record as partially-sent when a code did not resolve", async () => {
    routeIntake.mockResolvedValue({
      ...cleanRoute,
      unresolved: ["AB12"],
      problems: [{ name: "AB12", reason: "resolve-failed" as const }],
    });
    await putIntake(intake());

    await runPendingIntakes();

    const record = await getIntake("si_1");
    expect(record?.status).toBe("partially-sent");
    // Exactly ONE resolve-failed. An earlier revision had the router push one
    // and the runner synthesize a second from the same `unresolved` entry.
    expect(
      record?.problems.filter((p) => p.reason === "resolve-failed")
    ).toHaveLength(1);
  });

  it("marks a record failed when routing throws, and does not retry it", async () => {
    routeIntake.mockRejectedValue(new Error("boom"));
    await putIntake(intake());

    await runPendingIntakes();
    const afterFirst = await getIntake("si_1");
    expect(afterFirst?.status).toBe("failed");
    expect(afterFirst?.problems).toContainEqual(
      expect.objectContaining({ reason: "route-failed", detail: "boom" })
    );

    await runPendingIntakes();
    expect(routeIntake).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent runs into one pass", async () => {
    await putIntake(intake());

    await Promise.all([scheduleIntakeRun(), scheduleIntakeRun(), scheduleIntakeRun()]);

    // Three callers, one record, one classify. The host's mount effect, its
    // signal effect and its auth effect can all fire in the same flush.
    expect(classifyIntake).toHaveBeenCalledTimes(1);
  });
});

describe("completeShareIntake", () => {
  beforeEach(async () => {
    for (const record of await listIntakes()) await deleteIntake(record.receiptId);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("deletes the record once the image has actually been sent", async () => {
    await putIntake(intake({ status: "ready" }));

    await completeShareIntake("si_1");

    expect(await getIntake("si_1")).toBeNull();
  });

  it("holds the record as partially-sent when files were queued behind it", async () => {
    await putIntake(
      intake({
        status: "ready",
        problems: [{ name: "b.png", reason: "send-dropped" }],
      })
    );

    await completeShareIntake("si_1");

    expect((await getIntake("si_1"))?.status).toBe("partially-sent");
  });

  it("is a no-op for a record that is already gone", async () => {
    await expect(completeShareIntake("si_missing")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/share-intake-runner.test.ts`
Expected: FAIL — `Failed to resolve import ".../share-intake-runner"`.

- [ ] **Step 3: Write the runner**

Create `src/lib/shared/share-intake/services/share-intake-runner.ts`:

```ts
import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { inboxState } from "$lib/shared/inbox/state/inbox-state.svelte";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import type {
  IntakeClassification,
  IntakeProblem,
  ShareIntakeStatus,
} from "../domain/share-intake-models";
import { classifyIntake } from "./intake-classifier";
import { routeIntake } from "./intake-router";
import {
  deleteIntake,
  getIntake,
  listIntakes,
  reapExpired,
  updateStatus,
} from "./intake-store";

/**
 * The consumer. Without this the whole pipeline is write-only: intakes land in
 * IndexedDB and nothing ever reads them back out.
 *
 * It is called from exactly one place - ShareIntakeHost.svelte (Task 12) -
 * because routing needs the app shell mounted. Everything it can open (the
 * inbox picker, the sequence viewer overlay) renders inside MainApplication;
 * calling this from the native initializer, as an earlier revision did,
 * routes into a page that does not exist yet.
 */

/**
 * A record in one of these states still has somewhere to go.
 *
 * `ready` is in the set deliberately: it means "picker open, bytes staged, not
 * sent yet". On a fresh boot nothing is on screen, so a `ready` record has to
 * re-open its picker or the share is silently stranded. Within a session the
 * in-picker guard below stops it re-opening on top of itself.
 *
 * `failed` is NOT in the set: a failed record must not be retried in a loop.
 * The TTL reaps it.
 */
const UNCONSUMED: readonly ShareIntakeStatus[] = ["received", "needs-auth", "ready"];

/**
 * Records this session has already prompted for. Without it, every host effect
 * that fires while the user is signed out re-opens the auth drawer on top of
 * whatever they were doing.
 */
const prompted = new Set<string>();

let running: Promise<void> | null = null;
let rerunRequested = false;

/**
 * Coalesced entry point. The host's mount, signal and auth effects can all
 * fire in one flush; the guard means an intake arriving mid-run gets one extra
 * pass instead of a second concurrent run over the same rows.
 */
export function scheduleIntakeRun(): Promise<void> {
  if (running) {
    rerunRequested = true;
    return running;
  }

  running = (async () => {
    try {
      do {
        rerunRequested = false;
        await runPendingIntakes();
      } while (rerunRequested);
    } finally {
      running = null;
    }
  })();

  return running;
}

/**
 * An image cannot be sent without a full account:
 * services/implementations/MessageImageSender.ts:32-34 throws for
 * `!user || user.isAnonymous`. Cards can - resolveForImport takes
 * `userId: string | null` and ScanCardSheet files printed cards for guests.
 */
function requiresFullAccount(classification: IntakeClassification): boolean {
  return classification.items.some((item) => item.kind === "image");
}

export async function runPendingIntakes(): Promise<void> {
  await reapExpired();

  const pending = (await listIntakes())
    .filter((record) => UNCONSUMED.includes(record.status))
    .sort((a, b) => a.receivedAt - b.receivedAt);

  for (const record of pending) {
    // The picker is open on this very record right now. Routing it again would
    // replace the user's in-progress selection with a fresh sheet.
    if (
      record.status === "ready" &&
      inboxState.shareAttachmentReceiptId === record.receiptId
    ) {
      continue;
    }

    try {
      const classification = await classifyIntake({
        files: record.files,
        text: record.text,
      });

      // Trace 3.10. Park BEFORE routing, not after: the store is the only copy
      // of the bytes and needs-auth is the one status exempt from the TTL and
      // from quota eviction.
      if (requiresFullAccount(classification) && !authState.isFullAccount) {
        await updateStatus(record.receiptId, "needs-auth", classification.problems);
        promptForSignIn(record.receiptId);
        continue;
      }

      const result = await routeIntake(
        classification,
        authState.effectiveUserId ?? null,
        { receiptId: record.receiptId }
      );

      // The router authors every resolve-failed itself; synthesizing more from
      // `result.unresolved` here produced one duplicate per bad code.
      const problems: IntakeProblem[] = [
        ...classification.problems,
        ...result.problems,
      ];

      if (result.opened === "picker") {
        // Trace 2.12. The bytes are staged in a picker the user has not
        // submitted. completeShareIntake (below), called from the drawer's
        // onSent, is what finally consumes them.
        await updateStatus(record.receiptId, "ready", problems);
        continue;
      }

      if (result.unresolved.length > 0 || result.queued.length > 0) {
        // Something this share carried never reached a destination and nothing
        // is on screen to finish it. Keeping the record is the point: the
        // bytes are still there to retry with.
        await updateStatus(record.receiptId, "partially-sent", problems);
        console.warn(
          `[ShareIntake] ${record.receiptId} kept: ${result.unresolved.length} unresolved, ${result.queued.length} queued`
        );
        continue;
      }

      if (problems.length > 0) {
        console.warn(`[ShareIntake] ${record.receiptId} completed with problems`, problems);
      }

      // Everything reached a destination. Only NOW is deleting safe - reads
      // never delete precisely so a crash mid-route leaves the bytes intact.
      await deleteIntake(record.receiptId);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      console.error(`[ShareIntake] Routing ${record.receiptId} failed:`, detail);
      // "failed" leaves the UNCONSUMED set, so this is not retried in a loop.
      // It stays visible until the TTL reaps it.
      await updateStatus(record.receiptId, "failed", [
        { name: "", reason: "route-failed", detail },
      ]);
    }
  }
}

/** Trace 3.12: a VISIBLE prompt, once per record per session. */
function promptForSignIn(receiptId: string): void {
  if (prompted.has(receiptId)) return;
  prompted.add(receiptId);

  authDrawerState.show("signin", "share-image-signin");
  toast.info("Sign in to send the image you shared — it's saved until you do.");
}

/**
 * Trace 2.14. Called by InboxDrawer when the image has actually been SENT,
 * which is the only moment the bytes are genuinely consumed.
 *
 * A record carrying send-dropped problems still has files the user has not
 * dealt with, so it is held as partially-sent rather than deleted.
 */
export async function completeShareIntake(receiptId: string): Promise<void> {
  const record = await getIntake(receiptId);
  if (!record) return;

  const leftovers = record.problems.some(
    (problem) => problem.reason === "send-dropped"
  );

  if (leftovers) {
    await updateStatus(receiptId, "partially-sent");
    console.warn(
      `[ShareIntake] ${receiptId} sent one file; ${record.files.length - 1} still queued`
    );
    return;
  }

  await deleteIntake(receiptId);
}
```

- [ ] **Step 4: Wire the send completion — trace step 2.14**

In `src/lib/shared/inbox/components/InboxDrawer.svelte`, replace
`handleSequenceSent` (line 245):

```ts
  async function handleSequenceSent(conversationId: string) {
    // Read the id BEFORE completing — completeAttachmentShare clears it.
    const receiptId = inboxState.shareAttachmentReceiptId;
    inboxState.completeAttachmentShare(conversationId);

    // Null for an ordinary in-app share; there is no intake record behind it.
    if (!receiptId) return;
    const { completeShareIntake } = await import(
      "$lib/shared/share-intake/services/share-intake-runner"
    );
    await completeShareIntake(receiptId);
  }
```

The dynamic import is deliberate. `InboxDrawer` is loaded on every app boot
(`MainApplication.svelte:623-625`); a static import would pull the share-intake
pipeline, the classifier and the IndexedDB store into that chunk for every user
who never shares anything into the app.

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/share-intake-runner.test.ts`
Expected: PASS, 14 tests (11 `share-intake-runner` + 3 `completeShareIntake`).

- [ ] **Step 6: Prove the dead barrier function did not come back**

Run: `grep -rn "hasPendingShare" src/ | wc -l`
Expected: `0`. It existed only to serve a boot barrier that Task 13 deletes; a
hit here means the barrier came back with it.

- [ ] **Step 7: Prove the runner has exactly one entry point later**

Run: `grep -rln "scheduleIntakeRun" src/ | sort`
Expected, after Task 12 and Task 13 land, exactly two files: the runner itself
and `ShareIntakeHost.svelte`. At this point in the plan the only hit is the
runner. Record the output; Task 14 re-checks it.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(share-intake): consume intakes, gate on auth, keep bytes until the send lands" -- src/lib/shared/share-intake/services/share-intake-runner.ts src/lib/shared/inbox/components/InboxDrawer.svelte tests/unit/share-intake/share-intake-runner.test.ts
```

---

### Task 12: Mount the runner inside the app shell — DONE (`29484d3b0f`)

**Closes trace steps 1.7, 1.9, 2.8 and 3.15 — the wiring whose absence is the
reason this plan failed review three times.**

Everything up to here is reachable only if something calls
`scheduleIntakeRun()`, and that something has to be inside the app shell. The
previous revision called it from `native-initializer.ts` and suppressed
`bootIntoApp()`, which put the app on `src/routes/+page.svelte` — `HomeHero` +
`LaunchpadGrid`, the marketing landing. `InboxDrawer` mounts at
`MainApplication.svelte:623-625` and `SequenceViewerDrawerHost` at `:708-710`,
both under the app shell only. Opening the picker from the landing set state
that nothing rendered.

This task inverts it. A component mounted as a sibling of those two drawers is
the only caller of the runner. It cannot possibly run before they exist, so
"the drawer is mounted before the picker opens" stops being a timing race and
becomes a structural fact. It also supplies trace 3's resume point: `authState`
has **no callback subscription API** — it is a plain object of getters over a
`$state` rune (`auth-state.svelte.ts:1014-1043`), so the only way to observe a
sign-in is a `$effect` in a component.

**Files:**
- Create: `src/lib/shared/share-intake/state/share-intake-signal.svelte.ts`
- Create: `src/lib/shared/share-intake/components/ShareIntakeHost.svelte`
- Modify: `src/lib/shared/application/components/MainApplication.svelte:622-625`
- Test: `tests/unit/share-intake/share-intake-host-contract.test.ts`
- Test: `src/lib/shared/share-intake/components/ShareIntakeHost.svelte.test.ts`

- [ ] **Step 1: Write the failing contract test**

This is a static contract test in the shape of
`tests/unit/sequence-viewer-shell-contract.test.ts` — it reads source text and
asserts the wiring, so the invariant cannot rot silently between sessions.

Create `tests/unit/share-intake/share-intake-host-contract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

/** Every source file, with forward slashes on every platform. */
function sourceFiles(): string[] {
  return readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((entry) => `src/${entry.split("\\").join("/")}`)
    .filter((path) => path.endsWith(".ts") || path.endsWith(".svelte"));
}

const MAIN_APPLICATION =
  "src/lib/shared/application/components/MainApplication.svelte";
const HOST = "src/lib/shared/share-intake/components/ShareIntakeHost.svelte";

describe("share-intake host contract", () => {
  it("MainApplication mounts the host", () => {
    expect(read(MAIN_APPLICATION)).toContain(
      "share-intake/components/ShareIntakeHost.svelte"
    );
  });

  it("the host is mounted beside the inbox drawer, not above the auth gate", () => {
    const source = read(MAIN_APPLICATION);
    const drawer = source.indexOf("inbox/components/InboxDrawer.svelte");
    const host = source.indexOf("share-intake/components/ShareIntakeHost.svelte");
    const viewer = source.indexOf(
      "sequence-viewer/components/SequenceViewerDrawerHost.svelte"
    );
    expect(drawer).toBeGreaterThan(-1);
    expect(viewer).toBeGreaterThan(-1);
    // Same block as the drawer it depends on. If the host drifts above the
    // auth gate it can run before InboxDrawer exists, which is the exact
    // failure this whole task exists to make impossible.
    expect(host).toBeGreaterThan(drawer);
    expect(host).toBeLessThan(viewer);
  });

  it("the runner has exactly one caller in the app", () => {
    // The single-entry-point invariant. Two callers means someone re-added a
    // route trigger outside the component tree, which is how the share ended
    // up opening a picker on the marketing landing.
    const callers = sourceFiles()
      .filter((file) => !file.endsWith("share-intake-runner.ts"))
      .filter((file) => read(file).includes("scheduleIntakeRun"));
    expect(callers).toEqual([HOST]);
  });

  it("the host watches the auth state so trace 3 can resume", () => {
    const source = read(HOST);
    expect(source).toContain("authState.isFullAccount");
    expect(source).toContain("scheduleIntakeRun");
  });

  it("the native initializer never routes a share itself", () => {
    const source = read("src/lib/shared/platform/services/native-initializer.ts");
    expect(source).not.toContain("scheduleIntakeRun");
    expect(source).not.toContain("hasPendingShare");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/share-intake-host-contract.test.ts`
Expected: FAIL — `MainApplication mounts the host` fails first.

- [ ] **Step 3: Write the signal**

The adapter runs outside the component tree and must not import the runner —
that is what let an earlier revision route from the native initializer. It bumps
a counter instead; the host owns the reaction.

Create `src/lib/shared/share-intake/state/share-intake-signal.svelte.ts`:

```ts
/**
 * A share arrived. That is the whole message.
 *
 * The native adapter cannot call the runner directly: routing opens the inbox
 * picker and the sequence viewer overlay, both of which live inside
 * MainApplication, and the adapter runs during native boot when that tree may
 * not exist. So the adapter bumps this counter and ShareIntakeHost - a
 * component, mounted beside those drawers - reacts.
 *
 * A counter rather than a boolean: two shares in a row must produce two
 * reactions, and a boolean that is already true produces none.
 */
let _tick = $state(0);

export const shareIntakeSignal = {
  get tick(): number {
    return _tick;
  },
};

export function bumpIntakeSignal(): void {
  _tick += 1;
}
```

- [ ] **Step 4: Write the host**

Create `src/lib/shared/share-intake/components/ShareIntakeHost.svelte`:

```svelte
<script lang="ts">
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { scheduleIntakeRun } from "../services/share-intake-runner";
  import { shareIntakeSignal } from "../state/share-intake-signal.svelte";

  /**
   * The only caller of the share-intake runner.
   *
   * Renders nothing. It exists to be a COMPONENT, because two things this
   * feature needs are only available inside the component tree:
   *
   * 1. A guarantee that the app shell is mounted. This sits beside InboxDrawer
   *    and SequenceViewerDrawerHost in MainApplication, so by the time this
   *    effect runs both of the surfaces routing can open already exist. The
   *    previous revision ran the runner from native-initializer.ts, where
   *    neither did.
   * 2. Reactivity over authState. It is a plain object of getters over a
   *    $state rune (auth-state.svelte.ts:1014-1043) with no subscribe() and no
   *    event emitter, so a $effect is the only way to notice a sign-in - which
   *    is trace 3's resume point.
   *
   * scheduleIntakeRun() coalesces, so the three reasons this effect re-runs
   * (mount, a new share, a sign-in) collapse into one pass over the store.
   */
  $effect(() => {
    // Tracked reads. Each one is a reason to (re)run.
    const tick = shareIntakeSignal.tick;
    const fullAccount = authState.isFullAccount;
    const loading = authState.loading;
    void tick;
    void fullAccount;

    // Routing asks authState whether an image share may proceed. Running
    // before Firebase has reported in would park a signed-in user's share as
    // needs-auth and prompt them to sign in twice.
    if (loading) return;

    void scheduleIntakeRun();
  });
</script>
```

- [ ] **Step 5: Mount it in the app shell**

In `src/lib/shared/application/components/MainApplication.svelte`, immediately
after the inbox drawer block (currently lines 622-625), add:

```svelte
    <!-- Share intake (Android share sheet). Mounted HERE, beside the drawers
         it routes into, so a share can never open a picker before the picker
         exists. This is the only caller of the share-intake runner. -->
    {#await import("../../share-intake/components/ShareIntakeHost.svelte") then mod}
      <mod.default />
    {/await}
```

- [ ] **Step 6: Write the component test**

One component test, and only one. It locks the behaviour whose absence was
blocking defect B3 — the sign-in resume — which is exactly the "test-on-fix"
case `.claude/rules/component-test-discipline.md` blesses. It does not widen
the browser-test surface beyond that.

Create `src/lib/shared/share-intake/components/ShareIntakeHost.svelte.test.ts`:

```ts
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scheduleIntakeRun: vi.fn(),
  auth: { isFullAccount: false, loading: true },
}));

vi.mock("$lib/shared/share-intake/services/share-intake-runner", () => ({
  scheduleIntakeRun: mocks.scheduleIntakeRun,
}));

vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    get isFullAccount() {
      return mocks.auth.isFullAccount;
    },
    get loading() {
      return mocks.auth.loading;
    },
  },
}));

import ShareIntakeHost from "./ShareIntakeHost.svelte";
import { bumpIntakeSignal } from "../state/share-intake-signal.svelte";

describe("ShareIntakeHost", () => {
  beforeEach(() => {
    mocks.scheduleIntakeRun.mockReset();
    mocks.scheduleIntakeRun.mockResolvedValue(undefined);
    mocks.auth.isFullAccount = false;
    mocks.auth.loading = true;
  });

  it("waits for auth to settle before running", async () => {
    render(ShareIntakeHost);

    // loading = true. Running now would park a signed-in user's image share as
    // needs-auth and prompt them for a sign-in they already have.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.scheduleIntakeRun).not.toHaveBeenCalled();
  });

  it("runs again when a share arrives while the app is open", async () => {
    mocks.auth.loading = false;
    render(ShareIntakeHost);

    await vi.waitFor(() => {
      expect(mocks.scheduleIntakeRun).toHaveBeenCalledTimes(1);
    });

    bumpIntakeSignal();

    await vi.waitFor(() => {
      expect(mocks.scheduleIntakeRun).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Step 7: Run both suites**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/share-intake-host-contract.test.ts`
Expected: PASS, 5 tests.

Run: `npx vitest run --config tests/config/vitest.components.config.ts src/lib/shared/share-intake/components/ShareIntakeHost.svelte.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(share-intake): run intakes from inside the app shell, and resume after sign-in" -- src/lib/shared/share-intake/state/share-intake-signal.svelte.ts src/lib/shared/share-intake/components/ShareIntakeHost.svelte src/lib/shared/share-intake/components/ShareIntakeHost.svelte.test.ts src/lib/shared/application/components/MainApplication.svelte tests/unit/share-intake/share-intake-host-contract.test.ts
```

---

### Task 13: Native adapter, and always boot into the app shell — DONE (`493d120577`)

**Closes trace steps 1.1–1.8 and 2.1–2.7 — the arrival half of every trace.**
After this task all three traces are walkable end to end.

Three problems, one task.

**Problem 1 — the cold-launch double fire.** `CapacitorShareTargetPlugin.java`
handles the intent in `load()` (line 29) *and* in `handleOnNewIntent` (line 35),
and Capacitor's `BridgeActivity` calls `onNewIntent(getIntent())` right after
`load()`. Both calls hit `notifyListeners("shareReceived", shareData, true)`
(line 89) with `retainUntilConsumed = true`, so a cold-launch share is retained
twice and replayed back to back the moment JS registers. An earlier revision
deduped by reading IndexedDB for the derived `receiptId` — an `await` — so both
deliveries passed the check before either wrote.

**Problem 2 — the false rationale, and the real one.** The committed
`derive-receipt-id.ts` comment says the uri is excluded because "the plugin can
write the same share to a different cache path on the second delivery."
**That is not true.** `copyFileToCache` (Java line 170) writes to
`new File(cacheDir, fileName)` — a deterministic path with no uniquifier — so
the second delivery replays the *same* uri, and a second share of a
same-named file simply overwrites the first. The correct reasons to keep the
uri out of the durable id are that `getFileData` falls back to
`uri.toString()` when the copy fails (Java line 114), which is a `content://`
uri that genuinely does vary between deliveries, and that a `data:` uri would
make the id enormous. That comment is corrected in this task.

Separately, `SharedFile` is `{ uri, name, mimeType }` with **no size** (verified
in `node_modules/@capgo/capacitor-share-target/dist/esm/definitions.d.ts`), so a
descriptor-only key degrades to name + mimeType and two different screenshots
Android named identically collide — the second silently swallowed.

The fix is two keys from two functions:

- **In-flight key** (`deriveDeliveryKey`), derived synchronously from the raw
  descriptors **including the uri**, held in a module-level `Set`. Nothing
  awaits between deriving it and adding it, so the twin cannot slip past. Adding
  the uri also separates the `content://`-fallback case above, which a
  name+mime key merges.
- **Durable `receiptId`** (`deriveReceiptId`, committed in Task 2), derived
  *after* bridging from descriptors that now carry the real `blob.size`.

**Problem 3 — the boot barrier, deleted.** The previous revision made
`ensureShareTargetRegistered()` resolve on "first event handled OR a 300 ms
grace", then suppressed `bootIntoApp()` when `hasPendingShare()` was true. Two
things were wrong with that:

- Suppressing `bootIntoApp()` leaves the native shell on `/`, which is
  `src/routes/+page.svelte` — the marketing landing. `routeIntake` never
  navigates; its only UI action opens a picker that renders inside
  `MainApplication`, which the landing does not mount. The share opened as
  state nothing displayed.
- Every share-**less** cold boot paid the full 300 ms, because with no share the
  delivery arm of the race never settles and only the timer can.

Both go away together. `bootIntoApp()` now runs unconditionally, exactly as it
did before this feature existed, and the share routes itself **inside** the
shell via `ShareIntakeHost` (Task 12). Registration still happens first — the
retained event needs a listener to be replayed to — but nothing awaits a grace
period, so a share-less boot costs one `addListener` round trip and nothing
else.

**Files:**
- Create: `src/lib/shared/share-intake/services/native-share-adapter.ts`
- Create: `src/lib/shared/share-intake/get-share-intake.ts`
- Modify: `src/lib/shared/share-intake/domain/derive-receipt-id.ts` (the false comment)
- Modify: `src/lib/shared/platform/services/native-initializer.ts:58-64`
- Test: `tests/unit/share-intake/native-share-adapter.test.ts`

- [ ] **Step 1: Correct the false comment on the committed receipt id**

In `src/lib/shared/share-intake/domain/derive-receipt-id.ts`, replace the
sentence beginning "The uri is deliberately EXCLUDED":

```ts
 * Files are sorted so two deliveries that enumerate in a different order still
 * collapse to one id. The uri is deliberately EXCLUDED - but NOT because the
 * plugin writes a different cache path each time. It does not:
 * copyFileToCache writes to new File(cacheDir, fileName), a deterministic
 * path (CapacitorShareTargetPlugin.java:170). The real reasons are that
 * getFileData falls back to uri.toString() when that copy fails (Java line
 * 114), which yields a content:// uri that genuinely does vary between
 * deliveries, and that a data: uri would drag the whole payload into the id.
```

Nothing else in that file changes, and `deriveReceiptId`'s behaviour and
signature are unchanged — the committed test suite must still pass untouched.

- [ ] **Step 2: Re-run the committed Task 2 suite to prove the comment edit changed nothing**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/derive-receipt-id.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 3: Write the failing adapter test**

Create `tests/unit/share-intake/native-share-adapter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";

vi.mock("$app/environment", () => ({ browser: true }));

const listeners: Record<string, (event: unknown) => void> = {};
vi.mock("@capgo/capacitor-share-target", () => ({
  CapacitorShareTarget: {
    addListener: vi.fn((name: string, cb: (event: unknown) => void) => {
      listeners[name] = cb;
      return Promise.resolve({ remove: vi.fn() });
    }),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => "android"),
    convertFileSrc: vi.fn((p: string) => `https://localhost/f${p}`),
  },
}));

const bumpIntakeSignal = vi.fn();
vi.mock("$lib/shared/share-intake/state/share-intake-signal.svelte", () => ({
  bumpIntakeSignal: () => bumpIntakeSignal(),
}));

const toast = { info: vi.fn(), error: vi.fn() };
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({ toast }));

import {
  registerNativeShareTarget,
  whenIdle,
} from "$lib/shared/share-intake/services/native-share-adapter";
import {
  listIntakes,
  deleteIntake,
} from "$lib/shared/share-intake/services/intake-store";

const EVENT = {
  title: "Share",
  texts: [],
  files: [{ uri: "/cache/a.png", name: "a.png", mimeType: "image/png" }],
};

function bodyOf(bytes: number) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () => new ArrayBuffer(bytes),
  };
}

/**
 * Deliver an event and wait for it to be FULLY handled.
 *
 * `await listeners.shareReceived(EVENT)` is not that: the listener is
 * fire-and-forget (`void handleShareReceived(...)`), so awaiting it yields one
 * microtask while the real work spans a fetch chain plus fake-indexeddb
 * macrotask round trips. Every assertion after it raced. whenIdle() awaits the
 * handler's own promise.
 */
async function deliver(event: unknown): Promise<void> {
  listeners.shareReceived(event);
  await whenIdle();
}

describe("native share adapter", () => {
  beforeEach(async () => {
    for (const record of await listIntakes()) await deleteIntake(record.receiptId);
    bumpIntakeSignal.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => bodyOf(3)));
    await registerNativeShareTarget();
  });

  it("persists a received share and signals the host", async () => {
    await deliver(EVENT);

    const all = await listIntakes();
    expect(all).toHaveLength(1);
    expect(all[0].files[0].name).toBe("a.png");
    expect(all[0].status).toBe("received");
    // The adapter signals; it never routes. Routing needs the app shell.
    expect(bumpIntakeSignal).toHaveBeenCalledTimes(1);
  });

  it("never imports the runner", async () => {
    // Structural, not behavioural: importing the runner here is what let an
    // earlier revision route a share from the native boot path.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "src/lib/shared/share-intake/services/native-share-adapter.ts",
      "utf8"
    );
    expect(source).not.toContain("share-intake-runner");
  });

  it("collapses the cold-launch double delivery into one record", async () => {
    await deliver(EVENT);
    await deliver({ ...EVENT });

    expect(await listIntakes()).toHaveLength(1);
  });

  it("collapses it even when both deliveries land before the first bridge resolves", async () => {
    // The real cold-launch shape: Capacitor replays both retained events back
    // to back, long before any fetch settles. An await-then-check dedup lets
    // BOTH through.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      await gate;
      return bodyOf(3);
    }));

    listeners.shareReceived(EVENT);
    listeners.shareReceived({ ...EVENT });
    release();
    await whenIdle();

    expect(await listIntakes()).toHaveLength(1);
  });

  it("keeps two same-named screenshots apart via the bridged byte size", async () => {
    // The plugin's SharedFile has no size field, so a descriptor-only key makes
    // these two identical and silently swallows the second. They also share a
    // cache path, because copyFileToCache overwrites - which is why the SIZE,
    // not the uri, is what separates them.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(bodyOf(11))
      .mockResolvedValueOnce(bodyOf(22));
    vi.stubGlobal("fetch", fetchMock);

    const shot = {
      title: "",
      texts: [],
      files: [
        { uri: "/cache/shared_files/Screenshot.png", name: "Screenshot.png", mimeType: "image/png" },
      ],
    };
    await deliver(shot);
    await deliver({ ...shot });

    expect(await listIntakes()).toHaveLength(2);
  });

  it("keeps two simultaneous content:// deliveries apart via the in-flight uri", async () => {
    // getFileData falls back to uri.toString() when copyFileToCache returns
    // null (CapacitorShareTargetPlugin.java:114). Those content:// uris DO
    // differ per share. Two arriving at once with the same display name would
    // produce the SAME name+mime key, so a uri-less in-flight key drops the
    // second at the door - before the bridge can discover their sizes differ.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(bodyOf(11)).mockResolvedValueOnce(bodyOf(22))
    );

    listeners.shareReceived({
      title: "",
      texts: [],
      files: [{ uri: "content://media/1", name: "IMG.png", mimeType: "image/png" }],
    });
    listeners.shareReceived({
      title: "",
      texts: [],
      files: [{ uri: "content://media/2", name: "IMG.png", mimeType: "image/png" }],
    });
    await whenIdle();

    expect(await listIntakes()).toHaveLength(2);
    expect(bumpIntakeSignal).toHaveBeenCalledTimes(2);
  });

  it("records a bridge failure on the intake instead of dropping the file", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 404,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    })));

    await deliver(EVENT);

    const [record] = await listIntakes();
    expect(record.problems).toContainEqual(
      expect.objectContaining({ name: "a.png", reason: "not-found" })
    );
  });

  it("records a ClipData-style empty share as failed rather than returning silently", async () => {
    await deliver({ title: "Share", texts: [], files: [] });

    const [record] = await listIntakes();
    // "TKA opens but receives nothing" is the exact symptom the device matrix
    // is hunting. A bare return makes it invisible.
    expect(record.status).toBe("failed");
    expect(bumpIntakeSignal).not.toHaveBeenCalled();
  });

  it("registration does not wait on a grace period", async () => {
    // Every share-LESS cold boot used to pay 300 ms here, because with no
    // share only the timer could settle the race.
    const started = Date.now();
    await registerNativeShareTarget();
    expect(Date.now() - started).toBeLessThan(50);
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/native-share-adapter.test.ts`
Expected: FAIL — `Failed to resolve import ".../native-share-adapter"`.

- [ ] **Step 5: Write the adapter**

Create `src/lib/shared/share-intake/services/native-share-adapter.ts`:

```ts
import { CapacitorShareTarget } from "@capgo/capacitor-share-target";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { deriveReceiptId } from "../domain/derive-receipt-id";
import type {
  SharedFileDescriptor,
  SharedIntake,
} from "../domain/share-intake-models";
import { bumpIntakeSignal } from "../state/share-intake-signal.svelte";
import { getIntake, putIntake } from "./intake-store";
import { screenDescriptors, validateIntake } from "./intake-validator";
import { sharedFilesToFiles } from "./shared-file-bridge";

/**
 * Arrival only. This module persists bytes and raises a flag; it does NOT
 * route, and it must never import share-intake-runner.
 *
 * Routing opens the inbox picker and the sequence viewer overlay, both of
 * which render inside MainApplication. This code runs during native boot, when
 * that tree may not exist yet. ShareIntakeHost owns the reaction (Task 12).
 */

/**
 * The plugin's event shape, read from
 * node_modules/@capgo/capacitor-share-target/dist/esm/definitions.d.ts.
 * SharedFile is { uri, name, mimeType } - there is NO size field, which is the
 * whole reason the durable receipt id is derived after bridging.
 */
export interface ShareReceivedEvent {
  title: string;
  texts: string[];
  files: SharedFileDescriptor[];
}

/**
 * Deliveries currently being processed. Held in memory rather than in
 * IndexedDB because the check has to be SYNCHRONOUS - see the listener.
 */
const inFlight = new Set<string>();

/** Handlers not yet settled. Exists so tests can await real completion. */
const handling = new Set<Promise<void>>();

/**
 * The in-flight dedup key, derived with NO I/O so it can be claimed before any
 * await.
 *
 * Unlike the durable receiptId this DOES include the uri. Capacitor replays
 * both retained cold-launch events with the identical uri, so including it
 * still collapses the twin; and when copyFileToCache fails, getFileData falls
 * back to uri.toString() (CapacitorShareTargetPlugin.java:114), giving two
 * simultaneous shares of same-named files distinct content:// uris that a
 * name+mime key would wrongly merge.
 */
function deriveDeliveryKey(event: ShareReceivedEvent): string {
  const files = event.files ?? [];
  const base = deriveReceiptId({ files, texts: event.texts ?? [] });
  // Length-prefixed for the same reason deriveReceiptId prefixes its fields:
  // a uri is sender-influenced and must not be able to shift a boundary.
  const uris = files.map((file) => `${file.uri.length}:${file.uri}`).join("");
  return `${base}|${uris}`;
}

/** Resolves when every delivery received so far has been fully handled. */
export function whenIdle(): Promise<void> {
  return Promise.all([...handling]).then(() => undefined);
}

/**
 * Bridge the plugin's events into a persisted, normalized intake.
 *
 * Resolves as soon as the listener is attached. It deliberately does NOT wait
 * for a first delivery or a grace period: nothing downstream needs the store
 * to be populated before boot continues, because ShareIntakeHost reacts to the
 * signal whenever it arrives. An earlier revision raced a 300 ms timer here and
 * charged it to every share-less cold start.
 */
export async function registerNativeShareTarget(): Promise<void> {
  await CapacitorShareTarget.addListener(
    "shareReceived",
    (event: ShareReceivedEvent) => {
      // SYNCHRONOUS claim, before any await. Capacitor replays both retained
      // cold-launch events back to back; an await-then-check against IndexedDB
      // lets both pass the check before either one writes.
      const deliveryKey = deriveDeliveryKey(event);
      if (inFlight.has(deliveryKey)) return;
      inFlight.add(deliveryKey);

      const settled = handleShareReceived(event)
        .catch((caught: unknown) => {
          console.error("[ShareIntake] Handling a share failed:", caught);
        })
        .finally(() => {
          inFlight.delete(deliveryKey);
          handling.delete(settled);
        });

      handling.add(settled);
    }
  );
}

async function handleShareReceived(event: ShareReceivedEvent): Promise<void> {
  const texts = event.texts ?? [];

  // Type and count are screened BEFORE the bridge reads a byte.
  const screen = screenDescriptors(event.files ?? []);
  const { bridged, problems: bridgeProblems } = await sharedFilesToFiles(
    screen.admitted
  );

  const gate = validateIntake({
    files: bridged.map((entry) => entry.file),
    text: texts.length > 0 ? texts.join("\n") : undefined,
    title: event.title || undefined,
  });

  // Only NOW is the durable id derivable: the bridged descriptors carry a real
  // byte size, so two different screenshots that happen to share a name and
  // mime type no longer collide.
  const receiptId = deriveReceiptId({
    files: bridged.map((entry) => entry.descriptor),
    texts,
  });

  // Second delivery of a share already persisted in an earlier session. Known
  // gap: if that existing record is `failed` or `needs-auth`, this bails out
  // with no signal bump and no bumped visibility - see Known accepted
  // limitations. A genuinely fresh share is unaffected; receiptId is
  // content-derived, so re-sharing the SAME bytes is indistinguishable from
  // the earlier delivery replaying.
  if (await getIntake(receiptId)) return;

  const problems = [...screen.problems, ...bridgeProblems, ...gate.problems];
  const empty = gate.accepted.length === 0 && !gate.text;

  const record: SharedIntake = {
    receiptId,
    source: "native",
    files: gate.accepted,
    text: gate.text ?? undefined,
    title: gate.title ?? undefined,
    // A share that produced nothing usable is RECORDED, not dropped. "TKA
    // opened and nothing happened" is the ClipData symptom the device matrix
    // is hunting for, and a bare return makes it invisible.
    status: empty ? "failed" : "received",
    receivedAt: Date.now(),
    problems,
  };

  if (problems.length > 0) {
    console.warn("[ShareIntake] Share arrived with problems:", problems);
  }

  try {
    await putIntake(record);
  } catch (caught) {
    // Quota, a blocked upgrade, or a store full of pending sign-in shares.
    // This is the one arrival exit where the bytes exist only in the
    // plugin's own cache dir with no record of them anywhere else, so a
    // console line alone would leave the user staring at "nothing happened"
    // with no way to know why. Loud on both channels, per the store's own
    // honesty note.
    console.error("[ShareIntake] Could not persist the share:", caught);
    toast.error("Couldn't save what you shared. Try sharing it again.");
    return;
  }

  // Raise the flag. ShareIntakeHost, inside the app shell, does the rest.
  if (!empty) bumpIntakeSignal();
}
```

- [ ] **Step 6: Add the idempotent registration getter**

Create `src/lib/shared/share-intake/get-share-intake.ts`:

```ts
import { registerNativeShareTarget } from "./services/native-share-adapter";

let registration: Promise<void> | null = null;

/**
 * Idempotent registration - safe to call from more than one boot path, and
 * every caller awaits the SAME promise.
 */
export function ensureShareTargetRegistered(): Promise<void> {
  registration ??= registerNativeShareTarget();
  return registration;
}
```

- [ ] **Step 7: Register early, then boot into the shell unconditionally**

In `src/lib/shared/platform/services/native-initializer.ts`, inside
`initAppLifecycle`, insert the registration immediately above the existing
"Handle deep links" comment (currently line 58) and leave everything below it —
including `bootIntoApp()` — exactly as it is:

```ts
		// Register the share target BEFORE the first await that could yield, so
		// the plugin's retained ACTION_SEND event has a listener to be replayed
		// to. Nothing here is awaited for a grace period and nothing routes:
		// the adapter persists the bytes and bumps a signal, and
		// ShareIntakeHost - mounted inside MainApplication, beside the drawers a
		// share actually opens - runs the pipeline.
		//
		// The unconditional boot-into-app-shell call below is unchanged by this
		// edit. An earlier revision skipped it when a share was pending, which
		// left the app on "/" - the marketing landing (src/routes/+page.svelte) -
		// where InboxDrawer and SequenceViewerDrawerHost do not exist, so the
		// share opened as state nothing rendered.
		const { ensureShareTargetRegistered } = await import(
			"$lib/shared/share-intake/get-share-intake"
		);
		await ensureShareTargetRegistered();
```

Nothing else in this file changes. `bootIntoApp()` keeps its existing
`if (!openedViaDeepLink)` guard and its `replaceState: true`.

- [ ] **Step 8: Prove the initializer stayed out of the routing business**

Run: `grep -n "bootIntoApp\|hasPendingShare\|scheduleIntakeRun" src/lib/shared/platform/services/native-initializer.ts`

Expected exactly two lines — the `bootIntoApp()` call and its definition. Any
`hasPendingShare` or `scheduleIntakeRun` here means the barrier came back.

- [ ] **Step 9: Run the adapter suite**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/native-share-adapter.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 10: Commit**

```bash
git commit -m "feat(share-intake): native adapter with synchronous dedup, and always boot into the app shell" -- src/lib/shared/share-intake/services/native-share-adapter.ts src/lib/shared/share-intake/get-share-intake.ts src/lib/shared/share-intake/domain/derive-receipt-id.ts src/lib/shared/platform/services/native-initializer.ts tests/unit/share-intake/native-share-adapter.test.ts
```

---

### Task 14: Full verification — DONE (steps 1-10 green; 131 tests, not the predicted 130 — intake-router is 19)

- [ ] **Step 1: Run the whole share-intake unit suite**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/share-intake/`

Expected: PASS — **11 files, 130 tests** (10 + 18 + 13 + 13 + 16 + 6 + 8 + 18 + 14 + 5 + 9):

| File | Tests | Task |
|---|---|---|
| `derive-receipt-id.test.ts` | 10 | 2 ✅ (comment-only edit in 13) |
| `intake-validator.test.ts` | 18 | 3 |
| `shared-file-bridge.test.ts` | 13 | 5 |
| `intake-store.test.ts` | 13 | 6 |
| `intake-classifier.test.ts` | 16 | 7 |
| `open-filed-card.test.ts` | 6 | 8 |
| `inbox-attachment-share.test.ts` | 8 | 9 |
| `intake-router.test.ts` | 18 | 10 |
| `share-intake-runner.test.ts` | 14 | 11 |
| `share-intake-host-contract.test.ts` | 5 | 12 |
| `native-share-adapter.test.ts` | 9 | 13 |

Earlier revisions reported 101 and, before that, 39. The 101 undercounted the
bridge suite (13, not 12) and predated Tasks 8 and 12 existing at all.

- [ ] **Step 2: Run the component tests**

Run: `npx vitest run --config tests/config/vitest.components.config.ts src/lib/shared/inbox/components/messages/SendAttachmentSheet.svelte.test.ts`
Expected: PASS, 4 tests.

Run: `npx vitest run --config tests/config/vitest.components.config.ts src/lib/shared/share-intake/components/ShareIntakeHost.svelte.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 3: Walk trace 1 statically**

Every hop in trace 1 must resolve to code that exists. Run each and confirm a
non-empty result:

```bash
grep -c "shareReceived" src/lib/shared/share-intake/services/native-share-adapter.ts
grep -c "bumpIntakeSignal" src/lib/shared/share-intake/services/native-share-adapter.ts
grep -c "shareIntakeSignal.tick" src/lib/shared/share-intake/components/ShareIntakeHost.svelte
grep -c "scheduleIntakeRun" src/lib/shared/share-intake/components/ShareIntakeHost.svelte
grep -c "openFiledCard" src/lib/shared/share-intake/services/intake-router.ts
grep -c "openSequenceOverlay" src/lib/shared/share-intake/services/open-filed-card.ts
grep -c "ShareIntakeHost" src/lib/shared/application/components/MainApplication.svelte
```

Expected: every line ≥ 1. A `0` anywhere is a severed trace — which is the
class of defect that survived three unit-level reviews of this plan.

- [ ] **Step 4: Walk trace 2 and trace 3 statically**

```bash
grep -c "receiptId" src/lib/shared/share-intake/services/intake-router.ts
grep -c "shareAttachmentReceiptId" src/lib/shared/inbox/state/inbox-state.svelte.ts
grep -c "completeShareIntake" src/lib/shared/inbox/components/InboxDrawer.svelte
grep -c "\"ready\"" src/lib/shared/share-intake/services/share-intake-runner.ts
grep -c "needs-auth" src/lib/shared/share-intake/services/share-intake-runner.ts
grep -c "share-image-signin" src/lib/shared/share-intake/services/share-intake-runner.ts
grep -c "authState.isFullAccount" src/lib/shared/share-intake/components/ShareIntakeHost.svelte
```

Expected: every line ≥ 1. `needs-auth` appearing only in the store and its own
tests — never in the runner — was blocking defect B3: four pieces of machinery
guarding a state no production path could enter.

- [ ] **Step 5: Prove the runner still has exactly one caller**

Run: `grep -rl "scheduleIntakeRun" src/ | sort`
Expected exactly two paths:
```
src/lib/shared/share-intake/components/ShareIntakeHost.svelte
src/lib/shared/share-intake/services/share-intake-runner.ts
```

- [ ] **Step 6: Prove no canvas dance and no boot barrier came back**

```bash
grep -rn "getImageData\|createImageBitmap" src/lib/shared/share-intake/ | wc -l
grep -rn "hasPendingShare" src/ | wc -l
grep -rn "SendSequenceSheet\.svelte\|shareSequencePayload\|\"send-sequence\"" src/ | wc -l
```
Expected: `0`, `0`, `0`.

- [ ] **Step 7: Full typecheck (one cold run, then grep the log)**

Run: `npm run check > /tmp/check.log 2>&1; grep -ciE "^Error|: error" /tmp/check.log`
Expected: `0`. If non-zero: `grep -iE "error" /tmp/check.log | head -20` and fix.
Do not re-run `check` to re-filter (`.claude/rules/fast-iteration-loop.md`).

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 9: Prove the ZXing WASM reaches the Capacitor web assets**

Run: `ls -l .svelte-kit/cloudflare/zxing/zxing_reader.wasm`
Expected: the file exists.

Why this is a step and not an assumption: `capacitor.config.ts` sets
`webDir: '.svelte-kit/cloudflare'`, and the detector loads the binary from
`/zxing/` (`tka-qr-detector.ts:36-38`). If it is missing from the native
bundle the fetch 404s, `classifyIntake` records one `decode-failed`, and
**every shared card silently becomes a photo** — trace 1 collapses into trace 2
for every user, and no unit test can see it.

- [ ] **Step 10: Sync the Android project**

Run: `npx cap sync android`
Expected: completes; `@capgo/capacitor-share-target` listed in the plugin output.

- [ ] **Step 11: Commit any fixes**

```bash
git commit -m "fix(share-intake): resolve verification findings" -- <the paths you actually changed>
```

---

## Device verification — REQUIRED before this ships

Unit tests cannot see any of these. `.claude/rules/verification-protocol.md`
requires evidence, and for this feature the evidence is a device. The list is
organised by trace, so a failure names the hop it broke.

**Trace 1 — cold launch, card**

- [ ] Build and install a debug APK on the Android device
- [ ] Share one image from Photos with the app fully killed. Confirm **exactly one**
      of everything — this proves the in-flight `Set` suppresses the confirmed double fire
- [ ] Confirm the app lands in the Composer, **not** on the marketing landing, and that
      the sequence viewer opens on the shared card. Landing on the marketing page is
      blocking defect B1 returning
- [ ] Share a screenshot of a **printed** choreo card; confirm it resolves, saves to My
      Library (non-`docBacked`), and the viewer opens on it
- [ ] Share two shots of the **same** card: one viewer, **no** photo attachment — the
      `duplicate` arm
- [ ] Share a photo containing a **non-TKA** QR: treated as an image, not an error
- [ ] Cold-launch with two different screenshots Android named identically: **two**
      records — this proves the post-bridge `blob.size` in the receipt id
- [ ] Text with an embedded link: share `"check this out https://tka.run/XXXX"` from a
      browser. The code resolves AND `"check this out"` survives as the note

**Trace 2 — warm launch, batch, and the data-loss fix**

- [ ] Share with the app already open in the background
- [ ] Share 3 images at once via `SEND_MULTIPLE`: one picker plus a visible report of
      the two queued — not a silent drop
- [ ] **Cancel the picker**, then relaunch. The share must still be there and the picker
      must re-open. This is blocking defect B4: the previous revision deleted the record
      when the picker opened, so cancel destroyed the only copy
- [ ] **Force-stop mid-picker**, reopen: same expectation
- [ ] Odd filename: share a file renamed `photo#2.png`. It must arrive, not 404 — the
      URL-encoding fix

**Trace 3 — signed out**

- [ ] Sign out. Share an image. Confirm a **visible** sign-in prompt appears (auth drawer
      with the share copy plus a toast) — not silence
- [ ] Complete an **email magic-link** sign-in and confirm the picker opens by itself
      with the image intact. This is the full round trip that blocking defect B3 left
      unimplemented
- [ ] Repeat, but force-stop the app while reading the email. The share must survive the
      cold start
- [ ] Leave a signed-out share for **over an hour**, then sign in: it must still be there
      (`needs-auth` is TTL-exempt)
- [ ] Sign out and share a **card only** (no loose images). It must route immediately with
      no sign-in prompt — guests file printed cards today and gating that is a regression

**Environment**

- [ ] `ClipData` hunt: share from Chrome, Photos, and a messaging app. The plugin ignores
      `ClipData` and handles only `EXTRA_STREAM`, so a sender using `ClipData` presents as
      "TKA opens but receives nothing." With this plan that leaves a `failed` record and a
      console warning — check `chrome://inspect` for `[ShareIntake]` lines. Record which
      senders work
- [ ] Boot the app normally (tap the icon, no share) and confirm no added delay before the
      Composer appears — the 300 ms registration grace is gone
- [ ] Cache growth: after ~10 shares, measure
      `adb shell run-as com.tkaflowarts.composer du -sh cache/shared_files`. **Nothing
      cleans this yet** (see limitations) — the point is to record the real growth rate

---

## Known accepted limitations

Recorded so nobody rediscovers them as bugs. Full detail in the spec's Spike results.

- The plugin copies shared bytes to cache with **no size, count, or time limit**
  before JS is notified. Not preventable from JS. The pre-bridge screen
  (Task 3) stops those bytes reaching memory, IndexedDB, and the network — it
  cannot stop them reaching disk.
- No filename sanitization in its Java. We normalize on read; a `../` name still
  lands in its cache dir first.
- **`cacheDir/shared_files` is never cleaned. This is OUR deviation from the
  spec, not something the spec permits.** The spec calls for the adapter to
  delete the copies from `cacheDir/shared_files`. Deleting native files needs
  `@capacitor/filesystem`, which is not a dependency of this repo (verified:
  no `@capacitor/filesystem` entry in `package.json`), so no task here
  implements it. We chose to measure the growth rate on-device first rather
  than add a Capacitor plugin on speculation. Android reclaims `cacheDir` under
  storage pressure, so this is untidy rather than unbounded — but it is a cut
  we made, and the spec should be updated or this fixed as its own change.
- **Batch send is one attachment plus a reported queue. This is OUR cut, not a
  spec exclusion.** The spec DOES specify batch send — "separate sequential
  messages with a single confirmation." The picker sends one image at a time,
  and sequential orchestration with per-item progress, cancel, and
  partial-success retry is a feature in its own right. We deferred it. The
  extras are surfaced (`queued` + `send-dropped`), the record is held open, and
  nothing is lost — but the user must re-open to send them, which is less than
  the spec asks for. Two earlier revisions of this plan attributed the cut to
  the spec; that was wrong both times.
- **Cards win a mixed share.** A share carrying both a card and loose images
  opens the viewer and reports the images as queued. Two overlays competing for
  the same back gesture is worse than one reported deferral. Our decision, not
  the spec's.
- **The auth gate is whole-intake.** A mixed card+image share from a signed-out
  user waits for sign-in even though the card alone would not need to. The
  alternative needs per-item progress state on the record; see Task 11.
- **A `ready` record re-opens its picker on the next launch** until the one-hour
  TTL reaps it. That is deliberate — it is what makes cancel, reload and crash
  recoverable — but it does mean an abandoned share nags once per launch for up
  to an hour.
- **Two genuinely different files that agree on name, mimeType AND byte size
  still hash to one receipt id.** That is the accepted cost of excluding the
  uri without hashing content, and it is bounded by the store's TTL.
- **No `ClipData`.** Some share sources will deliver nothing. With this plan
  that is a `failed` record plus a console warning rather than silence.
- **The viewer's chrome has no add-to-collection action.** The spec asks for
  View / Add to collection / Send from a filed card (spec:295-297);
  Save-to-library (`ViewerOverflowMenu.svelte:190-194`,
  `ViewerHeader.svelte:142-143`) is the accepted stand-in. Adding a
  collection-picker entry point to the viewer chrome — the only existing
  caller is `ChoreoCardThumbnail.svelte` — is a feature in its own right and
  out of scope here.
- **Re-sharing content that already has a `failed` or `needs-auth` record is a
  silent no-op.** `handleShareReceived`'s dedup check
  (`if (await getIntake(receiptId)) return;`) fires for ANY existing record
  with that receiptId, not only unconsumed ones. A user who re-shares after a
  routing failure, or shares the same bytes again while an earlier signed-out
  share is still pending, gets no signal, no toast, and no new attempt — the
  stale record just sits there until its TTL reaps it. Content-derived ids
  make this hard to fix cheaply: distinguishing "replay of the same delivery"
  from "the user deliberately tried again" needs either a retry affordance on
  the existing record or a nonce the plugin does not give us.
- The PWA half is not built. Installed-PWA users get no share target yet.
