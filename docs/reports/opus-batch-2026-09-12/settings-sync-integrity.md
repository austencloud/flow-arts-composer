# Settings Sync Integrity — Preference Persistence Race Defects

Opus batch 2026-09-12 · settings persistence assignment

| Field           | Value                                                    |
| --------------- | -------------------------------------------------------- |
| Base SHA        | `6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` (`origin/main`) |
| Fix SHA         | `2ca4cb27bb39a1ecb7edb22dfcab065b2793744e`                |
| Final SHA       | `adef7239` (this report)                                  |
| Branch          | `claude/settings-persistence-defects-yoobmn`              |
| Defects fixed   | 2 reproduced, 1 shared root cause                         |
| Environment     | Isolated cloud checkout, Linux, `pnpm` install of the committed lockfile |

## Owned files

| Path                                                          | Change             |
| ------------------------------------------------------------- | ------------------ |
| `src/lib/shared/settings/state/settings-state.svelte.ts`       | Modified (+103/−7) |
| `tests/unit/settings/settings-local-edit-race.test.ts`         | Added (6 tests)    |
| `docs/reports/opus-batch-2026-09-12/settings-sync-integrity.md` | Added (this file)  |

Nothing else was touched. The auth service, guest/library state, prop
appearance and color domain, Drawer/keyboard, and app bootstrap were read for
context only — `auth-boot-orchestrator.ts` and `auth-state.svelte.ts` were read
to establish call ordering and were not modified.

## Defect 1 — a toggle made while the account document loads is reverted

**Severity:** user-visible preference loss on every sign-in with a slow
Firestore read. Also writes the reverted value back to the server, so the
choice is lost permanently rather than only for the session.

**Causal path (read from code, then reproduced):**

`initializeChildServices` fires settings sync without awaiting it
(`src/lib/shared/auth/services/auth-boot-orchestrator.ts:30-41`), so the UI is
interactive and already hydrated from `localStorage` while
`syncFromFirebase()` awaits `loadSettings()`
(`settings-state.svelte.ts:226`). A toggle made in that window sets
`settingsState[key]` and schedules a 300 ms debounced upload. When the load
resolves, `applyRemoteSettings()` assigned every non-excluded key from the
account document unconditionally, overwriting the fresh edit. The debounced
upload then ran against the overwritten state and published the stale remote
value back to Firestore.

The realtime listener already guards against exactly this with
`!this.isSavingToFirebase && !this.firebaseSaveDebounceTimer`
(`settings-state.svelte.ts:202-206`). The initial-load path had no equivalent
guard — that asymmetry is the defect.

**Proof (measured, before fix):**
`tests/unit/settings/settings-local-edit-race.test.ts` →
*"keeps a toggle made while the account document is still loading"*.
A controlled deferred promise holds `loadSettings()` open; the test calls
`updateSetting("hapticFeedback", false)` during the await, then resolves the
load with the pre-toggle document.

```
AssertionError: expected true to be false
  ❯ tests/unit/settings/settings-local-edit-race.test.ts:124
    expect(service.currentSettings.hapticFeedback).toBe(false);
```

A second reproduction of the same path covers the background setting
(*"keeps Cosmic when the user picks it while the account document loads"*):
`syncFromFirebase` treated `backgroundType === COSMIC` as "never chosen"
(`settings-state.svelte.ts:242`), so a user who deliberately selected Cosmic
during the load was indistinguishable from a user who had never chosen, and
the remote background replaced their choice.

## Defect 2 — a snapshot echoing an earlier write reverts the newer toggle

**Severity:** user-visible revert during ordinary rapid toggling, where two
edits land more than 300 ms apart but the first write is still in flight.

**Causal path:**

`saveToFirebaseWithRetry()` sets `isSavingToFirebase = true` and clears it in
`.finally()` (`settings-state.svelte.ts:622`, `:672-675`). The flag is a single
boolean shared by overlapping writes, and `pendingFirebaseSave` is assigned but
never awaited. With write A and write B both open, A's `finally` clears the
flag while B is still open. The realtime listener's guard then passes, and a
Firestore snapshot carrying the document as of write A is applied — reverting
the key write B is still carrying. `_localTimestamp` was also cleared by A's
`.then()` even though B's edit was unconfirmed.

**Proof (measured, before fix):**
*"keeps the newer toggle when a snapshot echoes an earlier in-flight save"* —
two controlled save promises, resolve the first, then deliver a snapshot with
the pre-second-toggle values.

```
AssertionError: expected false to be true
  ❯ tests/unit/settings/settings-local-edit-race.test.ts:176
    expect(service.currentSettings.reducedMotion).toBe(true);
```

## Fix

One mechanism, because both defects are the same root cause: nothing recorded
*which keys the user had changed but Firestore had not confirmed*.

- `unsavedLocalKeys: Map<keyof AppSettings, number>` records each locally
  edited key with the sequence number of its latest edit; `unsavedLocalOwner`
  scopes the map to the editing UID.
- `markLocallyEdited()` is called from `updateSetting()` and `updateSettings()`.
  A **signed-out** edit is deliberately not recorded: browser-local settings
  are shared by every identity on this device and must still yield to the
  account document, which is the existing documented contract
  (`settings-state.svelte.ts:230-232`). A regression test pins this.
- `applyRemoteSettings()` and the `syncFromFirebase` background/`darkMode`
  branches skip keys with an unconfirmed local edit.
- A write captures `payloadSequence` at payload-build time but releases pins
  only in `.then()`, via `releaseConfirmedLocalEdits()`, and only for keys
  whose sequence is `<= payloadSequence`. Keys edited while the write is open
  keep a higher sequence and stay protected for the next write.
- A failed write keeps its pins (the server never took those edits). A
  successful offline-queue replay releases exactly the pins its queued payload
  carried.

The release point is load-bearing. An earlier iteration released pins at
payload-build time; defect 2's test still failed, because a stale snapshot can
arrive while the write that carries the edit is open. Release must be tied to
server confirmation, not to write start.

## Verification

All commands run in the isolated cloud checkout with the project's own config.

**Before/after — `tests/unit/settings/settings-local-edit-race.test.ts`** (new
suite run against the unmodified production file, then against the fix):

| Test                                                            | Base `6e4c1b5a` | Fix `2ca4cb27` |
| ---------------------------------------------------------------- | --------------- | -------------- |
| keeps a toggle made while the account document is still loading  | ✗ fail          | ✓ pass         |
| keeps the newer toggle when a snapshot echoes an earlier save    | ✗ fail          | ✓ pass         |
| keeps Cosmic when the user picks it while the document loads     | ✗ fail          | ✓ pass         |
| re-pins an edit whose upload failed so a snapshot cannot revert  | ✗ fail          | ✓ pass         |
| still lets the account document outrank a pre-sign-in edit       | ✓ pass          | ✓ pass         |
| releases the pin once the queued offline payload reaches server  | ✓ pass          | ✓ pass         |

The last two pass on base by construction — they are regression guards, not
defect reproductions. The pre-sign-in guard protects existing documented
behavior the fix must not break. The offline-replay guard protects the fix's
own release path; it was mutation-checked by deleting the
`releaseConfirmedLocalEdits` call from `processOfflineQueue`, which made it the
only failing test in the suite.

**Regression runs (measured):**

| Scope                                                   | Result           |
| -------------------------------------------------------- | ---------------- |
| `tests/unit/settings/` (incl. 7 pre-existing sync tests) | 22/22 pass       |
| `tests/unit/share`, `collections/settings-checkpoint`, `prop-studio-lightweight-bootstrap`, `profile-stage-prop-contract`, `browse-engine-identity-switch`, `animation-engine` | 72 files, 564/564 pass |
| Full default Vitest project (`vitest run --config tests/config/vitest.config.ts`) | 1973 files passed, 5 skipped; **15981 tests passed**, 106 skipped, 1 todo, **0 failed** (656 s) |
| `svelte-fast-check --tsconfig ./tsconfig.json`           | 582 errors / 44 warnings, **identical to the measured base count**; zero reference the changed files |

The 582 type errors are a pre-existing project-wide baseline, measured on this
same checkout with the production change stashed. They are not introduced by
this work.

## Claim provenance

- **Measured:** every test result and type-error count above; the before/after
  table; the mutation check.
- **Inferred from code, not observed at runtime:** that
  `initializeChildServices` leaves the UI interactive during the load. This
  follows from the un-awaited dynamic import at
  `auth-boot-orchestrator.ts:30-41`; the test reproduces the resulting timing
  with a controlled promise rather than a live browser.
- **Mocked:** Firestore. The suite drives the real `SettingsState` with a mock
  persister, realistic stored `localStorage` payloads, and controlled
  promises — the harness the existing `settings-account-sync.test.ts` already
  established. No production data was read or written.

## Limitations

- No browser verification. The change is non-visual state logic; the settings
  UI renders whatever `settingsState` holds, and its geometry is unchanged.
- Firestore's own write ordering is not exercised. The tests model the SDK as
  independent promises, which is the pessimistic case. If the SDK guarantees
  in-order delivery of a single client's writes, defect 2's window is narrower
  than modelled but the snapshot-echo revert still stands.
- Component tests (`vitest.components.config.ts`), emulator suites
  (`test:rules`, `test:e2e`), and the full `npm run check` / build gates were
  not run. The change is non-visual, emulator-independent state logic, and the
  default unit project plus the project's fast type check cover it; the broad
  gates belong to the integration step.

## Risks

- **A permanently pinned key.** If a write never succeeds for the whole
  session (persistent offline), its keys stay protected and cross-device
  changes to *those keys* are ignored until reload or sign-out. This is the
  intended trade — an unsaved local choice outranks a document that predates
  it — and is bounded by `cleanup()` on sign-out and by the offline-queue
  release. It is a behavior change from "remote always wins".
- **`updateSettings()` marks every key it is handed**, including keys assigned
  the value they already had. A caller that passes a large partial object
  pins more keys than the user actually changed, for the ~300 ms until the
  next write confirms. Low impact, but wider than strictly necessary.

## Follow-ups (not done — out of this assignment's scope)

1. `pendingFirebaseSave` is assigned but never awaited, so overlapping writes
   are still possible. Serializing writes behind it would close defect 2's
   window at the source rather than defending against its symptom.
2. `initialSettings` and `loadSettingsFromStorage()` both use
   `{ ...DEFAULT_SETTINGS, ...parsed }`. A stored explicit `null` outranks the
   default (JSON cannot carry `undefined`, but `null` round-trips). Not
   reproduced as a user-visible defect here, so not changed.
3. `resetToDefaults()` and `clearStoredSettings()` use
   `Object.assign(settingsState, DEFAULT_SETTINGS)`, which cannot remove keys
   absent from `DEFAULT_SETTINGS` (`backgroundColor`, `gradientColors`,
   `visibility`, `compositionRecipeOverrides`). A reset leaves those stale and
   re-uploads them.
4. `processOfflineQueue()` replays a snapshot captured at failure time without
   reconciling it against state that moved on afterwards.
