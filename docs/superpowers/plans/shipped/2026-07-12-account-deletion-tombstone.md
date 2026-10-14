# Account Deletion Tombstone — Implementation Plan

Date: 2026-07-12. Agreed conversationally with Austen (no spec gate).

## Why

A user self-deleted their account ~2026-07-05 and left no trace of who they
were: `deleteAccount` removes the users doc + Auth record (email lives only in
Auth), and orphans every subcollection under `users/{uid}` (settings,
onboarding, devices survived — the opposite of what the user asked for).
Austen wants to know WHO deleted, legally and morally: a minimal, disclosed,
time-boxed deletion log (tombstone), standard practice under GDPR Art. 17(3)
(retain minimal data to prove/audit the erasure itself).

## Design (locked)

- **Tombstone doc** `accountDeletions/{uid}`:
  `uid`, `email`, `displayName`, `providerIds` (string[]),
  `accountCreatedAt`, `deletedAt`, `expireAt` (= deletedAt + 365 days),
  optional `reason` (user-supplied, ≤500 chars).
- **Retention: 12 months**, enforced by a daily scheduled function purge.
- **Server-side capture** via Firebase Auth `onDelete` trigger — fires on ANY
  auth deletion (app flow, console, future policies), receives the full
  UserRecord (email, displayName, metadata.creationTime, providerData).
- **Cascade cleanup** in the same trigger: recursively delete `users/{uid}`
  (doc + ALL subcollections) and the RTDB `presence/{uid}` node. Fixes the
  orphaned-subcollection GDPR gap.
- **Pulse notification** to admins via existing `notifyAdmins` helper.
- **Optional exit reason** in the client delete dialog, written to the
  tombstone doc BEFORE auth deletion (user still authed); trigger merge-writes
  the identity fields so the reason survives.
- **Privacy disclosure** line on the privacy page.

## Tasks (ledger — mark [x] as you land each)

- [x] **T1. Auth onDelete trigger** — `firebase-functions/src/accountDeletions/onAuthUserDeleted.ts`
  - firebase-functions v5: auth onDelete exists ONLY in the v1 API
    (`import * as functionsV1 from "firebase-functions/v1"` →
    `functionsV1.auth.user().onDelete(handler)`). v2 identity triggers are
    blocking-only (no delete). VERIFY the exact v5 import path against current
    docs (context7: firebase-functions) before writing — do not guess.
  - Handler steps, in order, each step try/caught so one failure doesn't stop
    the rest (log failures loudly):
    1. Merge-write tombstone to `accountDeletions/{uid}` (merge preserves a
       client-written `reason`): fields per Design. `deletedAt` = event time,
       `expireAt` = deletedAt + 365d.
    2. `getFirestore().recursiveDelete(doc('users/{uid}'))` — removes the doc
       and all subcollections (collections, devices, onboarding, settings,
       activityLog, notifications, ...). recursiveDelete is on the Firestore
       client from `firebase-admin/firestore` — verify signature via context7.
    3. Remove RTDB `presence/{uid}` (admin.database().ref().remove()); RTDB
       databaseURL: `https://the-kinetic-alphabet-default-rtdb.firebaseio.com`
       — check how existing functions init admin (`firebase-functions/src`)
       and follow that pattern; only add databaseURL if not already configured.
    4. `notifyAdmins` (import from `../pulse/notifyAdmins`) — follow the
       existing pulseTriggers.ts call shape. Message like:
       `"{displayName or email or uid} deleted their account"` with the reason
       appended when present.
  - Export the trigger from `firebase-functions/src/index.ts` following how
    existing triggers are exported (read index.ts first).
- [x] **T2. Scheduled purge** — `firebase-functions/src/accountDeletions/purgeExpiredTombstones.ts`
  - v2 `onSchedule` (import from `firebase-functions/v2/scheduler` — verify via
    context7), daily (`"every 24 hours"` or cron `0 4 * * *`).
  - Query `accountDeletions` where `expireAt <= now`, batch-delete. Log count.
  - Export from index.ts.
- [x] **T3. Firestore rules** — `firestore.rules`
  - `match /accountDeletions/{uid}`:
    - `read`: admin only (reuse the existing isAdmin() pattern in the file —
      read how scanEvents/admin-only collections do it and match style).
    - `create, update`: `request.auth.uid == uid` AND the written keys are a
      subset of `['uid','reason']` AND `uid == request.auth.uid` AND `reason`
      is a string ≤ 500 chars. (Client writes the reason pre-deletion; the
      trigger uses the Admin SDK and bypasses rules.)
    - `delete`: false (purge uses Admin SDK).
- [x] **T4. Client: optional exit reason** — `src/lib/shared/settings/components/tabs/ProfileTab.svelte`
    (+ `src/lib/shared/auth/services/account-manager.ts`)
  - READ ProfileTab's existing delete-account dialog flow first. Add an
    optional, skippable free-text reason field to the confirm step (placeholder
    like "Why are you leaving? (optional)"). Design system rules apply: no
    checkboxes, buttons look like buttons, tokens, 44px touch targets, no
    layout shift. Reuse existing input/dialog primitives — grep before adding
    anything new.
  - `AccountManager.deleteAccount` accepts optional `reason?: string`; after
    successful reauth and BEFORE `deleteUser`, when reason is non-empty:
    `setDoc(doc(firestore, 'accountDeletions', user.uid), { uid: user.uid, reason }, { merge: true })`
    — best-effort try/catch (a rules failure must never block deletion).
  - Keep the existing best-effort users-doc delete (trigger is the real
    cleanup; belt and suspenders).
- [x] **T5. Privacy disclosure** — `src/routes/(public)/privacy/+page.svelte`
  - READ the page, match its structure/tone. Add a sentence under the
    account-deletion/data section (create a short section if none): when you
    delete your account, all content and profile data are deleted; a minimal
    record (name, email, deletion date, optional reason you provide) is kept
    for 12 months for audit purposes, then permanently removed.
  - Writing style: plain, specific, no em dashes, no AI-isms, no hedging.
- [x] **T6. Gates**
  - `cd firebase-functions && npm run build` — must pass (this is the
    functions typecheck).
  - Root: run the affected unit tests if any exist for touched files; then ONE
    full `npm run check > /tmp/check2.log 2>&1` and grep it for errors — must
    be 0.
- [x] **T7. Commit** — explicit pathspec ONLY of files this task touched
  (functions files, firestore.rules, ProfileTab.svelte, account-manager.ts,
  privacy +page.svelte, this plan file). Bare `git commit` forbidden.
  Message: `feat(auth): account-deletion tombstone — onDelete capture, cascade cleanup, 12mo purge`
  plus body. Do NOT push. Do NOT deploy functions or rules — the controller
  deploys after review.

## Executor discipline

1. Re-read this plan at the start of each task — the plan is authority.
2. Verify library APIs (firebase-functions v5 v1/v2 import paths,
   recursiveDelete) via context7 MCP before writing them — no guessing.
3. Prove completion with tool output: build output, check log grep, git show
   --stat. Claims without evidence are rejected.
4. Never run `npm run dev`, never touch port 5173. Full check at most once.
5. If firestore.rules has a tests file (`tests/**/rules*`), extend it for
   accountDeletions; if none, skip (do not stand up new rules-test infra).
