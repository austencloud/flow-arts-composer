---
status: active
value: 3
effort: S
remaining: "Implementation shipped in 89759afefb (effective-user scoping in create-browse-engine.svelte.ts, collections-state, collection-state preview projection, isPreviewReadOnly write guards; tests browse-engine-identity-switch, library-preview-access). Remaining: the approved browser pass switching admin -> user A -> user B -> admin in Browse > Library, confirming no stale data and blocked writes."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-11-01
work_state: verification
---
# Library Impersonation Identity

## Problem

Browse > Library mixes the signed-in administrator with the previewed user.
Sequence repositories read `authState.effectiveUserId`, but the visible All
grid keeps an unscoped cache and collection subscriptions remain keyed to
`authState.user.uid`. Switching preview users can therefore leave the previous
account's sequences, collections, followed collections, shared collections,
counts, or saved Art on screen.

Preview mode is read-only. Library surfaces currently bypass some of the
existing guards and call repositories directly.

## Contract

- Every Library read is scoped to the current effective user ID.
- A preview-user change clears old data before the new request or subscription
  can publish results.
- Returning from preview restores the signed-in user's Library without a page
  reload.
- Preview mode cannot save, edit, file, follow, favorite, publish, or delete.
- Saved Art keeps its write owner attached to the signed-in account. A separate
  read-only projection displays the previewed user's Art.
- The public gallery remains independent from Library identity changes.

## Ownership

- `authState.effectiveUserId` owns the active read identity.
- `createBrowseEngine` owns sequence cache invalidation and stale-load checks.
- Library collection state owns collection subscription restarts and mirrors.
- `LibraryRepository` and collection persistence services own write rejection.
- `CollectionState` owns the separate saved-Art preview projection.

This work extends existing owners. It does not add a second impersonation or
Library implementation.

## Verification

Focused tests must cover administrator to user A to user B to administrator,
late responses from an old identity, per-user cache isolation, subscription
restart, saved-Art projection isolation, and rejected preview writes. Project
checks and an approved browser pass complete verification.
