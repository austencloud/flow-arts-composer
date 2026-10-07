---
status: active
value: null
effort: null
remaining: "Verify impersonated library identity and permission boundary against current owner resolution and runtime."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
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
