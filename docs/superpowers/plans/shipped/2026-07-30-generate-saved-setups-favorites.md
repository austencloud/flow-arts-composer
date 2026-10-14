# Generate Saved Setups and Community Favorite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session constraints (override defaults):** Work on `main` in `E:\tka-platform` directly. Do NOT create a branch, worktree, or PR, do NOT dispatch subagents, and do NOT commit — Austen will ask for commits separately. The working tree contains unrelated dirty files from concurrent sessions: edit only the exact paths in the File Map, never revert or restage anything you did not change.

**Goal:** Replace the single-slot public favorite with up to 10 private saved setups per user (owner-only Firestore subcollection) plus at most one explicitly shared community Favorite, with honest write outcomes, truthful Active/Modified state, idempotent lazy migration, and a rebuilt tabbed drawer.

**Architecture:** A pure snapshot/comparator module and a pure migration planner carry all the silent-bug-prone logic and get TDD. The repository (`favorite-config-repository.ts`) grows the `GeneratorSetupRepository` surface with Firestore batches for shared-write atomicity and a fire-and-forget migration commit. `createFavoriteState()` becomes dependency-injected (repository + auth getters + live-snapshot getter) with `Promise<boolean>` mutations. `PresetDrawer.svelte` is rebuilt on `DrawerHeader` + `SegmentedControl` tabs + `OverflowMenu` + `ConfirmDialog` + `SkeletonLoader` + `RobustAvatar`.

**Tech Stack:** Svelte 5 runes, Firestore web SDK (`writeBatch`, `deleteField`, `serverTimestamp`), zod schemas via `$lib/shared/firestore`, vitest (`tests/config/vitest.config.ts`), vitest-browser-svelte component tests, `@firebase/rules-unit-testing` emulator suite.

**Spec:** `docs/superpowers/specs/active/2026-07-30-generate-saved-setups-favorites-design.md` (reconciled 2026-07-30). Re-read it at the start of each task; the spec is authority over this plan when they disagree.

---

## Implementation outcome

- [x] Domain snapshots, canonical equality, and idempotent migration planner
- [x] Private setup repository, shared Favorite projection, and atomic shared writes
- [x] Owner-only Firestore rules and emulator coverage
- [x] Identity-aware state with honest mutation outcomes and Active/Modified provenance
- [x] Rebuilt Setups card and Saved/Community drawer with full CRUD controls
- [x] Guest-safe Community access and over-limit apply gates
- [x] Step terminology in setup summaries
- [x] Exact Generate-panel coverage on foldable and narrow layouts
- [x] Focused unit, component, repository, and rules verification
- [x] Seven-viewport responsive review, including 4K and landscape mobile
- [x] Production Firestore rules deployment to `the-kinetic-alphabet`
- [ ] Production-backed CRUD smoke check with an authorized disposable setup

Codex implemented the plan inline after Fable 5 authored and reviewed it. The
verification workflow used the connected Chrome session instead of launching a
second browser process. Populated/action states were covered by component
tests; the live page covered responsive geometry and built error/empty states.
The Firestore rules were deployed on 2026-07-30. A production CRUD smoke check
is intentionally separate because it creates and deletes account data and may
run the lazy legacy-Favorite migration.

The final UX pass routes guest Community access through the shared AuthNudge
pattern before any generator mutation. It also blocks over-limit saved setups,
uses step terminology in summaries, removes the drawer handle, and makes the
narrow-layout drawer inherit the measured Generate-panel geometry.

---

## Verified API facts this plan builds on (do not re-derive)

| API                                                                                       | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SegmentedControl` (`src/lib/shared/ui/components/SegmentedControl.svelte`)               | Has `semantics="tabs"`, per-option `id`/`controls`, `disabled`, roving focus + arrow keys. Options: `{ value, label, id?, controls? }`.                                                                                                                                                                                                                                                                                                            |
| `OverflowMenu` (`src/lib/shared/ui/components/OverflowMenu.svelte`)                       | `items: { label; icon; action; variant?: "danger" }[]`, `disabled` (whole trigger), `ariaLabel`, `placement: "top"\|"bottom"`. **No per-item disabled yet** — Task 7 adds it.                                                                                                                                                                                                                                                                      |
| `DrawerHeader` (`src/lib/shared/foundation/ui/DrawerHeader.svelte`)                       | `{ title, onClose, subtitle?, icon? }`. Renders h2 + labeled Close button.                                                                                                                                                                                                                                                                                                                                                                         |
| `ConfirmDialog` (`src/lib/shared/foundation/ui/ConfirmDialog.svelte`)                     | `{ isOpen ($bindable), title, message, confirmText?, cancelText?, onConfirm, onCancel, variant?: "warning"\|"danger"\|"info" }`. Bits UI portal — layers above the drawer.                                                                                                                                                                                                                                                                         |
| `SkeletonLoader` (`src/lib/shared/foundation/ui/SkeletonLoader.svelte`)                   | `{ variant: "text"\|"rect"\|"circle"\|"card", width?, height?, count? }`.                                                                                                                                                                                                                                                                                                                                                                          |
| `RobustAvatar` (`src/lib/shared/components/avatar/RobustAvatar.svelte`)                   | `{ src?, name?, size?: "xs"\|"sm"\|"md"\|"lg"\|"xl" }` with initials fallback. `sm` = 32px.                                                                                                                                                                                                                                                                                                                                                        |
| `AuthNudge` (`src/lib/shared/auth/components/AuthNudge.svelte`)                           | `{ trigger: AuthNudgeTrigger, text?, onCreateAccount, onLogin, onDismiss }`. Trigger registry: `src/lib/shared/auth/domain/auth-nudge-trigger.ts`. Existing wrap pattern: `BaseModal` + `AuthNudge` in GeneratePanel.svelte:311-324.                                                                                                                                                                                                               |
| `Drawer` (`src/lib/shared/foundation/ui/Drawer.svelte`)                                   | `{ isOpen, placement, respectLayoutMode, closeOnBackdrop, ariaLabel, onclose, trapFocus (default true) }`.                                                                                                                                                                                                                                                                                                                                         |
| DAL (`src/lib/shared/firestore/firestore-crud.ts`)                                        | `firestoreGet/firestoreList/firestoreSet/firestoreDelete` all **throw** on transport error (`handleCrudError` rethrows). `firestoreSet(path, null, …)` = `addDoc`, returns id, auto-stamps `createdAt`/`updatedAt` `serverTimestamp()`; `{merge:true}` for partial sets; `{trackOffline:true, repoName}` routes through `trackWrite`.                                                                                                              |
| `trackWrite` (`src/lib/shared/offline/state/sync-status-state.svelte.ts:252`)             | `trackWrite(() => promise, repoName)` — awaits the op, marks sync status, rethrows.                                                                                                                                                                                                                                                                                                                                                                |
| Toast                                                                                     | `showToast(message, "success")` from `$lib/shared/toast/state/toast-state.svelte`.                                                                                                                                                                                                                                                                                                                                                                 |
| Error handler                                                                             | `getErrorHandler().showUserError({ message, technicalDetails, error, severity, context })` — pattern already in `favorite-state.svelte.ts:75-85`.                                                                                                                                                                                                                                                                                                  |
| Auth                                                                                      | `getEffectiveUserId()` returns **previewed uid** when `userPreviewState.isActive` (`auth-state.svelte.ts:189-194`). `userPreviewState` from `$lib/shared/debug/state/user-preview-state.svelte`. `authState.isAuthenticated`, `authState.isAnonymous`.                                                                                                                                                                                             |
| Rules                                                                                     | `isOwner(userId)` = `request.auth.uid == userId` (firestore.rules:23-25). `isAdmin()` reads `users/{uid}.role == 'admin'                                                                                                                                                                                                                                                                                                                           |     | isAdmin == true`(firestore.rules:132-136). Rules tests:`tests/integration/firestore-rules/firestore.rules.test.ts`with`anonCtx()/fullCtx()/adminCtx()`, `SDK_SETTINGS = { experimentalForceLongPolling: true }`, run via `npm run test:rules:core`. |
| Unit tests                                                                                | Config `tests/config/vitest.config.ts` includes `tests/unit/**` and `src/**/__tests__/**`. Rune state factories are already tested in `tests/unit/create/construct-tutorial-state.test.ts` and `tests/unit/animation-engine/endless-playback-state.test.ts` — copy their harness conventions (including the `*.svelte.ts` test-helper trick from `tests/unit/browse-engine-test-helpers.svelte.ts` if a `$derived` needs a rune-compiled wrapper). |
| Component tests                                                                           | Co-located `*.svelte.test.ts`, config `tests/config/vitest.components.config.ts`, conventions in `docs/reference/component-testing.md` (note the `.svelte.test.ts` naming footgun).                                                                                                                                                                                                                                                                |
| `UIGenerationConfig` (`src/lib/shared/create/utils/config-mapper.ts:62-89`)               | All scalar/nullable fields, three optional fields (`inversionInterval?`, `inversionMode?`, `reflectionAxis?`), **no arrays**. JSON-serializable (localStorage persistence proves it).                                                                                                                                                                                                                                                              |
| `StartEndOptions` (`src/lib/shared/create/state/panel-coordination-state.svelte.ts:106+`) | Set-semantics arrays: `blockedStartPositions`, `mustContainLetters`, `mustNotContainLetters`. Also `startPosition/endPosition: PictographData\|null`, `blueStartOrientation`, `redStartOrientation`. JSON-serializable.                                                                                                                                                                                                                            |
| `startEndState` (`generate/state/start-end-options-state.svelte.ts`)                      | `options` getter, `setOptions(full)`, `resetOptions()` (clears to defaults incl. synced blocked positions).                                                                                                                                                                                                                                                                                                                                        |
| Spell coupling                                                                            | `CardBasedSettingsContainer.svelte:136-150` — effects reset `config.spellTargetLength` to `null` when the word is absent/changed. GeneratePanel derives spell-ness from word presence (line 94-95) and clears the word on apply (119-121). This is why snapshots normalize `mode`/`spellTargetLength`.                                                                                                                                             |
| `withFavoriteDeselect`                                                                    | `CardBasedSettingsContainer.svelte:390-397`, wraps every handler at 427-454. Removed in Task 9.                                                                                                                                                                                                                                                                                                                                                    |
| PresetDrawer width fix                                                                    | The compact-width rule `:global(.drawer-content.preset-drawer-sheet.side-by-side-layout[data-placement="right"]) { width: min(var(--create-panel-width, 400px), 400px); … }` already exists in the working tree (main agent's fix). **Preserve it verbatim.**                                                                                                                                                                                      |

---

## File Map

**Create:**

| Path                                                                                     | Responsibility                                                                                                    |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/lib/features/create/generate/domain/setup-snapshot.ts`                              | Pure snapshot capture (spell-field normalization) + canonical equality (set-array sorting).                       |
| `src/lib/features/create/generate/domain/__tests__/setup-snapshot.test.ts`               | Comparator earned tests.                                                                                          |
| `src/lib/features/create/generate/domain/setup-migration.ts`                             | Pure migration planner (`planPersonalMigration`, deterministic `legacy-favorite` ID, missing-source re-adoption). |
| `src/lib/features/create/generate/domain/__tests__/setup-migration.test.ts`              | Migration earned tests.                                                                                           |
| `src/lib/features/create/generate/services/__tests__/favorite-config-repository.test.ts` | Repository seam tests (nonblocking migration commit, batch composition, read rejection).                          |
| `tests/unit/create/favorite-state.test.ts`                                               | State factory tests with injected fake repository.                                                                |
| `src/lib/features/create/generate/components/presets/SavedSetupRow.svelte`               | One saved-setup row: apply button, badges, overflow menu, inline rename.                                          |
| `src/lib/features/create/generate/components/presets/PresetDrawer.svelte.test.ts`        | Focused component contract tests.                                                                                 |

**Modify:**

| Path                                                                            | Change                                                                                                                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/features/create/generate/domain/models/favorite-config.ts`             | Add `SavedGeneratorSetup`, `SharedGeneratorFavorite`, `SavedSetupDraft`, `PersonalSetupSnapshot`, `ActiveSetupSource`, `PendingSetupAction`.                    |
| `src/lib/features/create/generate/domain/models/favorite-config-schemas.ts`     | Add `SavedGeneratorSetupSchema`; add `sourceSetupId` to `UserWithFavoriteSchema.favoriteConfig`.                                                                |
| `src/lib/features/create/generate/services/favorite-config-repository.ts`       | `GeneratorSetupRepository` implementation; delete dead `getMyFavorite`/`setMyFavorite`; keep/rename `clearMyFavorite` → `unshareSetup`; `loadCommunity` throws. |
| `src/lib/features/create/generate/state/favorite-state.svelte.ts`               | DI rewrite of `createFavoriteState()`.                                                                                                                          |
| `src/lib/features/create/generate/components/presets/PresetDrawer.svelte`       | Rebuild: header, tabs, saved/community panels, states, guest gate, and measured narrow-layout coverage.                                                         |
| `src/lib/shared/ui/components/OverflowMenu.svelte`                              | Per-item `disabled?: boolean`.                                                                                                                                  |
| `src/lib/features/create/generate/components/GeneratePanel.svelte`              | New handlers, apply/reset semantics, community/share/step-cap nudges, drawer props.                                                                             |
| `src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte` | Remove `withFavoriteDeselect`; new Setups-card props.                                                                                                           |
| `src/lib/features/create/generate/components/cards/PresetCard.svelte`           | "Setups" card face: value + reserved status slot.                                                                                                               |
| `src/lib/features/create/generate/components/cards/BaseCard.svelte`             | Optional `ariaLabel` override prop.                                                                                                                             |
| `src/lib/shared/auth/domain/auth-nudge-trigger.ts`                              | New triggers `"share-setup"` and `"community-setups"`.                                                                                                          |
| `tests/unit/auth/auth-nudge-trigger.test.ts`                                    | Registry coverage for the setup account prompts.                                                                                                                |
| `src/lib/shared/create/domain/generator-help-content.ts`                        | Rewrite the `favorite` help entry.                                                                                                                              |
| `firestore.rules`                                                               | `generatorSetups` nested match block.                                                                                                                           |
| `tests/integration/firestore-rules/firestore.rules.test.ts`                     | New describe block.                                                                                                                                             |

**Do not touch:** anything else, including the other dirty files in `git status`.

---

## Requirement Ledger

Mark `[x]` with proof (test name / command output / screenshot) as tasks complete. `- [~] deferred` requires a written reason.

| #    | Acceptance criterion (spec)                                                                | Task             | Proof                                                                                   |
| ---- | ------------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------- |
| AC1  | Save current setup remains visible after setups exist                                      | T8, T10          | Component test `save button renders with populated setups` + screenshot                 |
| AC2  | Create, apply, rename, update, share, unshare, delete from drawer                          | T6, T8, T9, T12  | State tests + manual browser pass in T12                                                |
| AC3  | Personal setups are owner-only Firestore records                                           | T5               | `npm run test:rules:core` output                                                        |
| AC4  | At most one setup projected as public Favorite                                             | T4, T6           | Repo `shareSetup` replaces field wholesale; state test `sharing replaces sharedSetupId` |
| AC5  | Legacy `favoriteConfig` migrates idempotently, keeps shared state                          | T3, T4           | Planner tests (idempotent, deterministic ID, re-adoption) + repo test (link batch)      |
| AC6  | Failed read distinguishable from empty, offers Retry                                       | T6, T8, T10      | State test `failed reads expose error state`; component test `error vs empty distinct`  |
| AC7  | Failed write leaves drawer open, state unchanged                                           | T6, T9           | State test `failed writes do not mutate state`; GeneratePanel no longer closes on save  |
| AC8  | Applying null start/end resets prior constraints                                           | T9               | Code: `startEndState.resetOptions()` branch + T12 manual check                          |
| AC9  | Editing applied setup shows Modified, keeps provenance                                     | T2, T6, T9       | Comparator tests; `withFavoriteDeselect` removed; T12 manual check                      |
| AC10 | At 10 setups Save disabled with cap message                                                | T6, T8           | State `canSave` test + screenshot of cap state                                          |
| AC11 | Drawer compact on desktop and exactly covers the measured Generate panel on narrow layouts | T8, T12          | Measured geometry + viewport screenshots                                                |
| AC12 | Focus, keyboard, targets, reduced motion, state labels                                     | T8, T13          | A11y checklist in T13 against built UI                                                  |
| AC13 | Comparator, state, migration, atomic writes, rules all have automated proof                | T2–T6, T10       | All test commands green, pasted output                                                  |
| AC14 | Seven viewports have current visual proof                                                  | T12              | Screenshot set                                                                          |
| AC15 | Guests cannot enter Community or apply an over-limit setup before account creation         | T8, T9, T10, T12 | Component gate test + running guest flow                                                |
| AC16 | Setup summaries use step terminology                                                       | T8, T10          | Component summary assertion                                                             |
| AC17 | Foldable landscape has no exposed setup cards, detached handle, or maroon fallback surface | T8, T12          | 960×412 screenshot + exact geometry                                                     |

---

### Task 0: Preflight

**Files:** none (read-only).

- [ ] **Step 0.1:** Run `git status --short` and record which File-Map paths are already dirty (expect at least `src/lib/features/create/generate/components/presets/PresetDrawer.svelte`). These edits are the main agent's width fix and concurrent work — build on top, never restore/checkout.
- [ ] **Step 0.2:** Open `src/lib/features/create/generate/components/presets/PresetDrawer.svelte` and confirm the compact width rule quoted in the facts table exists. If it does not, STOP and report — the working tree differs from this plan's baseline.
- [ ] **Step 0.3:** Load the `testing`, `state-management`, `code-style`, and `styling` skills (Skill tool) before their respective tasks — `expert-routing.md` makes skill loading binding for this work.

---

### Task 1: Domain types and schemas

**Files:**

- Modify: `src/lib/features/create/generate/domain/models/favorite-config.ts`
- Modify: `src/lib/features/create/generate/domain/models/favorite-config-schemas.ts`

- [ ] **Step 1.1:** Append to `favorite-config.ts` (keep existing `FavoriteConfig`/`CommunityFavorite` exports — `CommunityFavorite` is still the community row type):

```ts
export interface SavedGeneratorSetup {
  id: string;
  name: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SharedGeneratorFavorite {
  sourceSetupId: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
  setAt: Date;
}

export interface SavedSetupDraft {
  name: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
}

export interface PersonalSetupSnapshot {
  setups: SavedGeneratorSetup[];
  sharedSetupId: string | null;
}

export type ActiveSetupSource =
  | { kind: "setup"; setupId: string }
  | { kind: "community"; userId: string };

export type PendingSetupAction =
  | { kind: "create" }
  | { kind: "rename" | "update" | "share" | "delete"; setupId: string }
  | { kind: "unshare" };
```

- [ ] **Step 1.2:** In `favorite-config-schemas.ts`, add after `UserWithFavoriteSchema`:

```ts
export const SavedGeneratorSetupSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    config: z.record(z.string(), z.unknown()),
    startEndOptions: z.record(z.string(), z.unknown()).nullable().optional(),
    createdAt: firestoreDate.optional(),
    updatedAt: firestoreDate.optional(),
  })
  .passthrough();

export type SavedGeneratorSetupDoc = z.infer<typeof SavedGeneratorSetupSchema>;
```

and add `sourceSetupId: z.string().optional(),` inside the existing `UserWithFavoriteSchema` → `favoriteConfig` object (before `config`).

- [ ] **Step 1.3:** Run `npm run check:fast`. Expected: no new errors in the two touched files (pre-existing unrelated errors from concurrent sessions may appear; only regressions in your files block).

---

### Task 2: Pure snapshot module (TDD)

**Files:**

- Create: `src/lib/features/create/generate/domain/setup-snapshot.ts`
- Create: `src/lib/features/create/generate/domain/__tests__/setup-snapshot.test.ts`

- [ ] **Step 2.1: Write the failing tests** (`setup-snapshot.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import {
  captureSetupSnapshot,
  setupSnapshotsEqual,
  type SetupSnapshot,
} from "../setup-snapshot";
import { GenerationMode } from "../../shared/domain/models/generate-models";
import type { UIGenerationConfig } from "../../state/generate-config.svelte";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";

const baseConfig = (): UIGenerationConfig =>
  ({
    mode: GenerationMode.FREEFORM,
    loopEnabled: false,
    length: 8,
    level: 2,
    turnIntensity: 1,
    gridMode: "diamond",
    propContinuity: "continuous",
    period: "halved",
    loopType: "rotated",
    constraintPreset: "smooth",
    handPathMode: "smooth",
    motionTypeFilter: null,
    durationTemplateId: null,
    spellTargetLength: null,
  }) as unknown as UIGenerationConfig;

const baseStartEnd = (): StartEndOptions =>
  ({
    blockedStartPositions: ["alpha1", "beta3"],
    startPosition: null,
    endPosition: null,
    mustContainLetters: ["A", "B"],
    mustNotContainLetters: [],
    blueStartOrientation: "in",
    redStartOrientation: "in",
  }) as unknown as StartEndOptions;

function snap(
  config = baseConfig(),
  startEnd: StartEndOptions | null = baseStartEnd()
): SetupSnapshot {
  return captureSetupSnapshot(config, startEnd);
}

describe("setupSnapshotsEqual", () => {
  it("ignores object key order", () => {
    const a = snap();
    const reordered = JSON.parse(
      JSON.stringify(a.config, Object.keys(a.config).sort().reverse())
    ) as UIGenerationConfig;
    expect(setupSnapshotsEqual(a, snap(reordered))).toBe(true);
  });

  it("treats undefined object values as absent", () => {
    const withUndefined = { ...baseConfig(), reflectionAxis: undefined };
    expect(setupSnapshotsEqual(snap(withUndefined), snap(baseConfig()))).toBe(
      true
    );
  });

  it("normalizes absent and undefined start/end options to null", () => {
    expect(
      setupSnapshotsEqual(
        captureSetupSnapshot(baseConfig(), undefined),
        captureSetupSnapshot(baseConfig(), null)
      )
    ).toBe(true);
  });

  it("compares reordered set-semantics arrays as equal", () => {
    const shuffled = {
      ...baseStartEnd(),
      blockedStartPositions: ["beta3", "alpha1"],
      mustContainLetters: ["B", "A"],
    } as unknown as StartEndOptions;
    expect(setupSnapshotsEqual(snap(baseConfig(), shuffled), snap())).toBe(
      true
    );
  });

  it("detects nested config changes", () => {
    const changed = { ...baseConfig(), level: 3 } as UIGenerationConfig;
    expect(setupSnapshotsEqual(snap(changed), snap())).toBe(false);
  });

  it("a setup saved during spell mode compares Active immediately after apply", () => {
    const spellLive = {
      ...baseConfig(),
      mode: GenerationMode.SPELL,
      spellTargetLength: 6,
    } as unknown as UIGenerationConfig;
    const saved = captureSetupSnapshot(spellLive, baseStartEnd());
    // After apply: word cleared, effects reset spellTargetLength to null, mode derived freeform.
    const liveAfterApply = captureSetupSnapshot(
      {
        ...saved.config,
        mode: GenerationMode.FREEFORM,
        spellTargetLength: null,
      },
      baseStartEnd()
    );
    expect(setupSnapshotsEqual(saved, liveAfterApply)).toBe(true);
    expect(saved.config.spellTargetLength).toBeNull();
    expect(saved.config.mode).toBe(GenerationMode.FREEFORM);
  });
});
```

- [ ] **Step 2.2:** Run `npm run test:ci -- src/lib/features/create/generate/domain/__tests__/setup-snapshot.test.ts`. Expected: FAIL — module not found.
- [ ] **Step 2.3: Implement** `setup-snapshot.ts`:

```ts
/**
 * Pure snapshot capture + canonical equality for saved generator setups.
 *
 * Setups capture generator settings, not spell words: mode and
 * spellTargetLength are derived from the (unsaved) word, so both are
 * normalized at capture time. Compare ONLY capture() outputs — never raw
 * stored docs — so both sides share one normalization.
 */
import { GenerationMode } from "../shared/domain/models/generate-models";
import type { UIGenerationConfig } from "../state/generate-config.svelte";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";

export interface SetupSnapshot {
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
}

// These StartEndOptions arrays carry set semantics; element order is a UI
// accident and must not produce a "Modified" badge.
const SET_SEMANTIC_KEYS = new Set([
  "blockedStartPositions",
  "mustContainLetters",
  "mustNotContainLetters",
]);

function canonicalize(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const items = value.map((v) => canonicalize(v));
    if (key !== undefined && SET_SEMANTIC_KEYS.has(key)) {
      return items
        .map((v) => JSON.stringify(v))
        .sort()
        .map((v) => JSON.parse(v) as unknown);
    }
    return items;
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(source).sort()) {
      if (source[k] === undefined) continue;
      out[k] = canonicalize(source[k], k);
    }
    return out;
  }
  return value;
}

export function captureSetupSnapshot(
  config: UIGenerationConfig,
  startEndOptions: StartEndOptions | null | undefined
): SetupSnapshot {
  // JSON round-trip: detaches $state proxies, drops undefined, and both
  // structures are JSON-serializable (their localStorage persistence relies
  // on exactly that).
  const plainConfig = JSON.parse(JSON.stringify(config)) as UIGenerationConfig;
  plainConfig.mode = GenerationMode.FREEFORM;
  plainConfig.spellTargetLength = null;
  const plainStartEnd =
    startEndOptions == null
      ? null
      : (JSON.parse(JSON.stringify(startEndOptions)) as StartEndOptions);
  return { config: plainConfig, startEndOptions: plainStartEnd };
}

export function setupSnapshotsEqual(
  a: SetupSnapshot,
  b: SetupSnapshot
): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}
```

- [ ] **Step 2.4:** Re-run the same command. Expected: 6 passed. Paste output. Stop condition: if `GenerationMode` import fails, verify the enum name in `src/lib/features/create/generate/shared/domain/models/generate-models.ts` and fix the import, not the concept.

---

### Task 3: Pure migration planner (TDD)

**Files:**

- Create: `src/lib/features/create/generate/domain/setup-migration.ts`
- Create: `src/lib/features/create/generate/domain/__tests__/setup-migration.test.ts`

- [ ] **Step 3.1: Write the failing tests:**

```ts
import { describe, expect, it } from "vitest";
import {
  LEGACY_FAVORITE_SETUP_ID,
  planPersonalMigration,
} from "../setup-migration";
import type { SavedGeneratorSetup } from "../models/favorite-config";

const NOW = new Date("2026-07-30T12:00:00Z");

const setup = (id: string, name = id): SavedGeneratorSetup =>
  ({
    id,
    name,
    config: { level: 1 },
    startEndOptions: null,
    createdAt: NOW,
    updatedAt: NOW,
  }) as unknown as SavedGeneratorSetup;

const legacyFavorite = (sourceSetupId?: string) => ({
  sourceSetupId,
  config: { level: 3 },
  startEndOptions: null,
  setAt: new Date("2026-03-21T00:00:00Z"),
});

describe("planPersonalMigration", () => {
  it("no favorite: nothing shared, no write", () => {
    const plan = planPersonalMigration([setup("a")], null, NOW);
    expect(plan).toEqual({
      setups: [setup("a")],
      sharedSetupId: null,
      write: null,
    });
  });

  it("unlinked favorite migrates to the deterministic legacy ID and links it", () => {
    const plan = planPersonalMigration([], legacyFavorite(undefined), NOW);
    expect(plan.write?.setup.id).toBe(LEGACY_FAVORITE_SETUP_ID);
    expect(plan.write?.setup.name).toBe("My Favorite");
    expect(plan.write?.linkFavoriteToSetupId).toBe(LEGACY_FAVORITE_SETUP_ID);
    expect(plan.sharedSetupId).toBe(LEGACY_FAVORITE_SETUP_ID);
    expect(plan.setups.map((s) => s.id)).toContain(LEGACY_FAVORITE_SETUP_ID);
  });

  it("is idempotent: planning the migrated result produces no write", () => {
    const first = planPersonalMigration([], legacyFavorite(undefined), NOW);
    const second = planPersonalMigration(
      first.setups,
      legacyFavorite(LEGACY_FAVORITE_SETUP_ID),
      NOW
    );
    expect(second.write).toBeNull();
    expect(second.sharedSetupId).toBe(LEGACY_FAVORITE_SETUP_ID);
    expect(second.setups).toEqual(first.setups);
  });

  it("re-adopts a missing source setup at that exact ID without touching others", () => {
    const others = [setup("keep-me")];
    const plan = planPersonalMigration(others, legacyFavorite("gone-id"), NOW);
    expect(plan.write?.setup.id).toBe("gone-id");
    expect(plan.write?.linkFavoriteToSetupId).toBeNull();
    expect(plan.setups.map((s) => s.id).sort()).toEqual(["gone-id", "keep-me"]);
  });

  it("linked favorite with existing source needs no write", () => {
    const plan = planPersonalMigration(
      [setup("s1")],
      legacyFavorite("s1"),
      NOW
    );
    expect(plan.write).toBeNull();
    expect(plan.sharedSetupId).toBe("s1");
  });
});
```

- [ ] **Step 3.2:** Run `npm run test:ci -- src/lib/features/create/generate/domain/__tests__/setup-migration.test.ts`. Expected: FAIL — module not found.
- [ ] **Step 3.3: Implement** `setup-migration.ts`:

```ts
/**
 * Pure planner for the lazy legacy-favorite migration. The repository
 * executes the returned write (fire-and-forget batch); this module owns the
 * decision so idempotency and stale-pointer recovery are unit-testable.
 */
import type { SavedGeneratorSetup } from "./models/favorite-config";

export const LEGACY_FAVORITE_SETUP_ID = "legacy-favorite";

export interface LegacyFavoriteRecord {
  sourceSetupId?: string;
  config: Record<string, unknown>;
  startEndOptions?: Record<string, unknown> | null;
  setAt?: Date;
}

export interface MigrationWrite {
  setup: SavedGeneratorSetup;
  /** Non-null when favoriteConfig.sourceSetupId must also be written. */
  linkFavoriteToSetupId: string | null;
}

export interface PersonalMigrationPlan {
  setups: SavedGeneratorSetup[];
  sharedSetupId: string | null;
  write: MigrationWrite | null;
}

export function planPersonalMigration(
  setups: SavedGeneratorSetup[],
  favorite: LegacyFavoriteRecord | null,
  now: Date
): PersonalMigrationPlan {
  if (!favorite) return { setups, sharedSetupId: null, write: null };

  const sourceId = favorite.sourceSetupId;
  if (sourceId && setups.some((s) => s.id === sourceId)) {
    return { setups, sharedSetupId: sourceId, write: null };
  }

  // Unlinked legacy favorite, or a link whose private document is missing
  // (stale-tab delete): converge on one deterministic document.
  const setupId = sourceId ?? LEGACY_FAVORITE_SETUP_ID;
  const recovered: SavedGeneratorSetup = {
    id: setupId,
    name: "My Favorite",
    config: favorite.config as SavedGeneratorSetup["config"],
    startEndOptions: (favorite.startEndOptions ??
      null) as SavedGeneratorSetup["startEndOptions"],
    createdAt: favorite.setAt ?? now,
    updatedAt: now,
  };
  return {
    setups: [...setups.filter((s) => s.id !== setupId), recovered],
    sharedSetupId: setupId,
    write: {
      setup: recovered,
      linkFavoriteToSetupId: sourceId ? null : setupId,
    },
  };
}
```

- [ ] **Step 3.4:** Re-run. Expected: 5 passed. Paste output.

---

### Task 4: Repository rework

**Files:**

- Modify: `src/lib/features/create/generate/services/favorite-config-repository.ts`
- Create: `src/lib/features/create/generate/services/__tests__/favorite-config-repository.test.ts`

- [ ] **Step 4.1: Rewrite the repository.** Full new content of `favorite-config-repository.ts`:

```ts
import {
  doc,
  updateDoc,
  deleteField,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import { trackWrite } from "$lib/shared/offline/state/sync-status-state.svelte";
import { reportErrorTelemetry } from "$lib/shared/error/services/error-telemetry-reporter";
import {
  firestoreDelete,
  firestoreGet,
  firestoreList,
  firestoreSet,
} from "$lib/shared/firestore";
import {
  SavedGeneratorSetupSchema,
  UserWithFavoriteSchema,
} from "../domain/models/favorite-config-schemas";
import type {
  CommunityFavorite,
  PersonalSetupSnapshot,
  SavedGeneratorSetup,
  SavedSetupDraft,
} from "../domain/models/favorite-config";
import {
  planPersonalMigration,
  type LegacyFavoriteRecord,
  type MigrationWrite,
} from "../domain/setup-migration";
import type { UIGenerationConfig } from "../state/generate-config.svelte";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";

const USERS_COLLECTION = "users";
const setupsPath = (userId: string) => `users/${userId}/generatorSetups`;

export interface GeneratorSetupRepository {
  loadPersonal(
    userId: string,
    options: { allowMigration: boolean }
  ): Promise<PersonalSetupSnapshot>;
  loadCommunity(limit?: number): Promise<CommunityFavorite[]>;
  createSetup(
    userId: string,
    draft: SavedSetupDraft
  ): Promise<SavedGeneratorSetup>;
  renameSetup(userId: string, setupId: string, name: string): Promise<void>;
  updateSetup(
    userId: string,
    setup: SavedGeneratorSetup,
    shared: boolean
  ): Promise<void>;
  deleteSetup(userId: string, setupId: string, shared: boolean): Promise<void>;
  shareSetup(userId: string, setup: SavedGeneratorSetup): Promise<void>;
  unshareSetup(userId: string): Promise<void>;
}

function sharedProjection(setup: SavedGeneratorSetup) {
  return {
    sourceSetupId: setup.id,
    config: setup.config as unknown as Record<string, unknown>,
    startEndOptions: setup.startEndOptions,
    setAt: serverTimestamp(),
  };
}

async function commitMigrationWrite(
  userId: string,
  write: MigrationWrite
): Promise<void> {
  const db = await getFirestoreInstance();
  const batch = writeBatch(db);
  batch.set(
    doc(db, setupsPath(userId), write.setup.id),
    {
      name: write.setup.name,
      config: write.setup.config,
      startEndOptions: write.setup.startEndOptions,
      createdAt: write.setup.createdAt,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  if (write.linkFavoriteToSetupId) {
    batch.set(
      doc(db, USERS_COLLECTION, userId),
      { favoriteConfig: { sourceSetupId: write.linkFavoriteToSetupId } },
      { merge: true }
    );
  }
  await trackWrite(() => batch.commit(), "favorites");
}

export async function loadPersonal(
  userId: string,
  options: { allowMigration: boolean }
): Promise<PersonalSetupSnapshot> {
  const [setupDocs, userDoc] = await Promise.all([
    firestoreList(setupsPath(userId), SavedGeneratorSetupSchema, {
      orderBy: [{ field: "createdAt" }],
    }),
    firestoreGet(USERS_COLLECTION, userId, UserWithFavoriteSchema),
  ]);

  const setups: SavedGeneratorSetup[] = setupDocs.map((d) => ({
    id: d.id,
    name: d.name,
    config: d.config as unknown as UIGenerationConfig,
    startEndOptions:
      (d.startEndOptions as unknown as StartEndOptions | null) ?? null,
    createdAt: d.createdAt ?? new Date(),
    updatedAt: d.updatedAt ?? new Date(),
  }));

  const favorite = (userDoc?.favoriteConfig ??
    null) as LegacyFavoriteRecord | null;
  const plan = planPersonalMigration(setups, favorite, new Date());

  if (plan.write && options.allowMigration) {
    // Compatibility write inside a read path: never await server ack here —
    // offline, batch.commit() stays pending until reconnect and would hang
    // the Saved tab. The deterministic ID makes any retry converge.
    void commitMigrationWrite(userId, plan.write).catch((error) => {
      reportErrorTelemetry({
        message: `Generator setup migration failed: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`,
        severity: "warning",
        context: { module: "create", action: "generatorSetupMigration" },
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });
  }

  return { setups: plan.setups, sharedSetupId: plan.sharedSetupId };
}

export async function loadCommunity(
  limitCount = 20
): Promise<CommunityFavorite[]> {
  // No catch: a transport/permission failure must reject so the UI can show
  // an error state instead of an empty community.
  const users = await firestoreList(USERS_COLLECTION, UserWithFavoriteSchema, {
    where: [{ field: "favoriteConfig", op: "!=", value: null }],
    orderBy: [{ field: "favoriteConfig" }],
    limit: limitCount,
  });

  const results: CommunityFavorite[] = [];
  for (const user of users) {
    const fav = user.favoriteConfig;
    if (!fav?.config) continue;
    results.push({
      userId: user.id,
      displayName: user.displayName ?? "Unknown",
      avatar: user.photoURL ?? undefined,
      config: fav.config as unknown as UIGenerationConfig,
      startEndOptions:
        (fav.startEndOptions as unknown as StartEndOptions | null) ?? null,
      setAt: fav.setAt ?? new Date(),
    });
  }
  return results;
}

export async function createSetup(
  userId: string,
  draft: SavedSetupDraft
): Promise<SavedGeneratorSetup> {
  const id = await firestoreSet(
    setupsPath(userId),
    null,
    {
      name: draft.name,
      config: draft.config as unknown as Record<string, unknown>,
      startEndOptions: draft.startEndOptions,
    },
    { trackOffline: true, repoName: "favorites" }
  );
  const now = new Date();
  return {
    id,
    name: draft.name,
    config: draft.config,
    startEndOptions: draft.startEndOptions,
    createdAt: now,
    updatedAt: now,
  };
}

export async function renameSetup(
  userId: string,
  setupId: string,
  name: string
): Promise<void> {
  await firestoreSet(
    setupsPath(userId),
    setupId,
    { name },
    { merge: true, trackOffline: true, repoName: "favorites" }
  );
}

export async function updateSetup(
  userId: string,
  setup: SavedGeneratorSetup,
  shared: boolean
): Promise<void> {
  const db = await getFirestoreInstance();
  const batch = writeBatch(db);
  batch.set(
    doc(db, setupsPath(userId), setup.id),
    {
      config: setup.config as unknown as Record<string, unknown>,
      startEndOptions: setup.startEndOptions,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  if (shared) {
    // update() replaces the favoriteConfig map wholesale so no stale keys
    // survive from an older projection.
    batch.update(doc(db, USERS_COLLECTION, userId), {
      favoriteConfig: sharedProjection(setup),
    });
  }
  await trackWrite(() => batch.commit(), "favorites");
}

export async function deleteSetup(
  userId: string,
  setupId: string,
  shared: boolean
): Promise<void> {
  if (!shared) {
    await firestoreDelete(setupsPath(userId), setupId, {
      trackOffline: true,
      repoName: "favorites",
    });
    return;
  }
  const db = await getFirestoreInstance();
  const batch = writeBatch(db);
  batch.delete(doc(db, setupsPath(userId), setupId));
  batch.update(doc(db, USERS_COLLECTION, userId), {
    favoriteConfig: deleteField(),
  });
  await trackWrite(() => batch.commit(), "favorites");
}

export async function shareSetup(
  userId: string,
  setup: SavedGeneratorSetup
): Promise<void> {
  const db = await getFirestoreInstance();
  await trackWrite(
    () =>
      updateDoc(doc(db, USERS_COLLECTION, userId), {
        favoriteConfig: sharedProjection(setup),
      }),
    "favorites"
  );
}

export async function unshareSetup(userId: string): Promise<void> {
  const db = await getFirestoreInstance();
  await trackWrite(
    () =>
      updateDoc(doc(db, USERS_COLLECTION, userId), {
        favoriteConfig: deleteField(),
      }),
    "favorites"
  );
}

export const generatorSetupRepository: GeneratorSetupRepository = {
  loadPersonal,
  loadCommunity,
  createSetup,
  renameSetup,
  updateSetup,
  deleteSetup,
  shareSetup,
  unshareSetup,
};
```

Delete the old `getMyFavorite`, `setMyFavorite`, `clearMyFavorite`, `getCommunityFavorites` exports. Then `Grep` for each old name across `src/` — the only importer is `favorite-state.svelte.ts` (rewritten in Task 6). If anything else imports them, STOP and report the overlap instead of editing that file.

- [ ] **Step 4.2: Write the seam tests** (`services/__tests__/favorite-config-repository.test.ts`). Mock the DAL and SDK; test only what's earned — nonblocking migration, batch composition, read rejection:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const batch = {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
  };
  return {
    batch,
    writeBatch: vi.fn(() => batch),
    firestoreList: vi.fn(),
    firestoreGet: vi.fn(),
    firestoreSet: vi.fn(),
    firestoreDelete: vi.fn(),
  };
});

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  updateDoc: vi.fn(async () => undefined),
  deleteField: vi.fn(() => "__DELETE__"),
  serverTimestamp: vi.fn(() => "__SERVER_TS__"),
  writeBatch: h.writeBatch,
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));
vi.mock("$lib/shared/offline/state/sync-status-state.svelte", () => ({
  trackWrite: vi.fn((op: () => Promise<unknown>) => op()),
}));
vi.mock("$lib/shared/error/services/error-telemetry-reporter", () => ({
  reportErrorTelemetry: vi.fn(),
}));
vi.mock("$lib/shared/firestore", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  firestoreList: h.firestoreList,
  firestoreGet: h.firestoreGet,
  firestoreSet: h.firestoreSet,
  firestoreDelete: h.firestoreDelete,
}));

import {
  deleteSetup,
  loadCommunity,
  loadPersonal,
  updateSetup,
} from "../favorite-config-repository";
import type { SavedGeneratorSetup } from "../../domain/models/favorite-config";

const NOW = new Date();
const aSetup = {
  id: "s1",
  name: "Setup 1",
  config: { level: 2 } as unknown as SavedGeneratorSetup["config"],
  startEndOptions: null,
  createdAt: NOW,
  updatedAt: NOW,
} satisfies SavedGeneratorSetup;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadPersonal migration commit", () => {
  it("returns the migrated snapshot without awaiting the batch commit", async () => {
    h.firestoreList.mockResolvedValue([]);
    h.firestoreGet.mockResolvedValue({
      id: "u1",
      favoriteConfig: { config: { level: 3 }, startEndOptions: null },
    });
    h.batch.commit.mockReturnValue(new Promise(() => {})); // never resolves = offline

    const result = await loadPersonal("u1", { allowMigration: true });

    expect(result.sharedSetupId).toBe("legacy-favorite");
    expect(result.setups.map((s) => s.id)).toEqual(["legacy-favorite"]);
    expect(h.batch.set).toHaveBeenCalledTimes(2); // setup doc + favoriteConfig link
  });

  it("skips the migration write entirely when migration is not allowed (admin preview)", async () => {
    h.firestoreList.mockResolvedValue([]);
    h.firestoreGet.mockResolvedValue({
      id: "u1",
      favoriteConfig: { config: { level: 3 }, startEndOptions: null },
    });

    const result = await loadPersonal("u1", { allowMigration: false });

    expect(result.sharedSetupId).toBe("legacy-favorite"); // local projection still coherent
    expect(h.writeBatch).not.toHaveBeenCalled();
  });
});

describe("shared batches", () => {
  it("updateSetup(shared) writes the private doc and the public projection in one batch", async () => {
    h.batch.commit.mockResolvedValue(undefined);
    await updateSetup("u1", aSetup, true);
    expect(h.batch.set).toHaveBeenCalledTimes(1);
    expect(h.batch.update).toHaveBeenCalledTimes(1);
    expect(h.batch.commit).toHaveBeenCalledTimes(1);
    const projection = h.batch.update.mock.calls[0]![1] as {
      favoriteConfig: { sourceSetupId: string };
    };
    expect(projection.favoriteConfig.sourceSetupId).toBe("s1");
  });

  it("deleteSetup(shared) deletes the private doc and removes the public field in one batch", async () => {
    h.batch.commit.mockResolvedValue(undefined);
    await deleteSetup("u1", "s1", true);
    expect(h.batch.delete).toHaveBeenCalledTimes(1);
    expect(h.batch.update).toHaveBeenCalledWith(expect.anything(), {
      favoriteConfig: "__DELETE__",
    });
    expect(h.batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe("loadCommunity", () => {
  it("rejects on read failure instead of returning []", async () => {
    h.firestoreList.mockRejectedValue(new Error("permission-denied"));
    await expect(loadCommunity()).rejects.toThrow("permission-denied");
  });
});
```

- [ ] **Step 4.3:** Run `npm run test:ci -- src/lib/features/create/generate/services/__tests__/favorite-config-repository.test.ts`. Expected: 5 passed. If the `$lib/shared/firestore` partial mock fights the barrel, mock `$lib/shared/firestore` fully (list/get/set/delete plus a passthrough `firestoreDate` re-export is not needed here). Paste output.

---

### Task 5: Firestore rules + emulator tests

**Files:**

- Modify: `firestore.rules` (inside the existing `match /users/{userId}` block, alongside the `devices` and `settings` nested matches, ~line 338+)
- Modify: `tests/integration/firestore-rules/firestore.rules.test.ts` (append a describe block)

- [ ] **Step 5.1:** Add to `firestore.rules` directly after the `settings` nested match block:

```text
      // -------------------------------------------------------------------------
      // GENERATOR SETUPS (Private saved generator configs — admin can read for
      // impersonation preview, mirroring /settings. The public share lives on
      // users/{uid}.favoriteConfig, written only by the owner.)
      // -------------------------------------------------------------------------
      match /generatorSetups/{setupId} {
        allow read: if isOwner(userId) || isAdmin();
        allow create, update, delete: if isOwner(userId);
      }
```

- [ ] **Step 5.2:** Append to `firestore.rules.test.ts` (reuse the file's existing `anonCtx/fullCtx/adminCtx`, `SDK_SETTINGS`, and imports — all already present):

```ts
describe("generator setups: private saved configs", () => {
  const setupPath = (uid: string, id = "s1") =>
    `users/${uid}/generatorSetups/${id}`;

  it("owner can create, read, update, and delete a setup", async () => {
    const db = fullCtx().firestore(SDK_SETTINGS);
    await assertSucceeds(
      setDoc(doc(db, setupPath(FULL_UID)), {
        name: "Setup 1",
        config: { level: 1 },
      })
    );
    await assertSucceeds(getDoc(doc(db, setupPath(FULL_UID))));
    await assertSucceeds(
      updateDoc(doc(db, setupPath(FULL_UID)), { name: "Renamed" })
    );
    await assertSucceeds(deleteDoc(doc(db, setupPath(FULL_UID))));
  });

  it("anonymous owner can use their own setups", async () => {
    const db = anonCtx().firestore(SDK_SETTINGS);
    await assertSucceeds(
      setDoc(doc(db, setupPath(ANON_UID)), { name: "Setup 1", config: {} })
    );
    await assertSucceeds(getDoc(doc(db, setupPath(ANON_UID))));
  });

  it("another authenticated user can neither read nor write", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), setupPath(FULL_UID)), {
        name: "Setup 1",
        config: {},
      });
    });
    const other = anonCtx().firestore(SDK_SETTINGS);
    await assertFails(getDoc(doc(other, setupPath(FULL_UID))));
    await assertFails(setDoc(doc(other, setupPath(FULL_UID)), { name: "x" }));
  });

  it("admin can read but not write another user's setups", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ADMIN_UID}`), {
        role: "admin",
      });
      await setDoc(doc(ctx.firestore(), setupPath(FULL_UID)), {
        name: "Setup 1",
        config: {},
      });
    });
    const admin = adminCtx().firestore(SDK_SETTINGS);
    await assertSucceeds(getDoc(doc(admin, setupPath(FULL_UID))));
    await assertFails(
      updateDoc(doc(admin, setupPath(FULL_UID)), { name: "hacked" })
    );
  });

  it("signed-out clients cannot read setups; public favoriteConfig reads are unchanged", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${FULL_UID}`), {
        favoriteConfig: { sourceSetupId: "s1", config: {} },
      });
      await setDoc(doc(ctx.firestore(), setupPath(FULL_UID)), {
        name: "Setup 1",
        config: {},
      });
    });
    const unauthed = testEnv.unauthenticatedContext().firestore(SDK_SETTINGS);
    await assertFails(getDoc(doc(unauthed, setupPath(FULL_UID))));
    await assertSucceeds(getDoc(doc(unauthed, `users/${FULL_UID}`)));
  });
});
```

- [ ] **Step 5.3:** Resource gate, then run. This spawns Firebase emulators — check available RAM first per `.claude/rules/resource-budget.md` (`(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue` ≥ 4096). Then: `npm run test:rules:core`. Expected: all existing tests plus 5 new ones pass. Stop condition: if emulators cannot bind (port conflict from another session), report the conflict — do not kill other sessions' processes.

---

### Task 6: State factory rewrite + tests

**Files:**

- Modify: `src/lib/features/create/generate/state/favorite-state.svelte.ts` (full rewrite, keep the exported name `createFavoriteState`)
- Create: `tests/unit/create/favorite-state.test.ts`

- [ ] **Step 6.1: Rewrite the factory.** Full new content:

```ts
/**
 * Saved-setups + community-Favorite state for GeneratePanel.
 *
 * Dependency-injected per state-management conventions: persistence, auth,
 * and the live panel snapshot come in through deps so tests inject fakes.
 * Mutations return Promise<boolean> — false means the error was already
 * reported and no state changed. The UI must not act optimistically.
 */
import {
  generatorSetupRepository,
  type GeneratorSetupRepository,
} from "../services/favorite-config-repository";
import {
  getEffectiveUserId,
  authState,
} from "$lib/shared/auth/state/auth-state.svelte";
import { userPreviewState } from "$lib/shared/debug/state/user-preview-state.svelte";
import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
import {
  captureSetupSnapshot,
  setupSnapshotsEqual,
  type SetupSnapshot,
} from "../domain/setup-snapshot";
import type {
  ActiveSetupSource,
  CommunityFavorite,
  PendingSetupAction,
  SavedGeneratorSetup,
} from "../domain/models/favorite-config";

export const SETUP_CAP = 10;
export const SETUP_NAME_MAX_LENGTH = 60;

export interface FavoriteStateDeps {
  repository: GeneratorSetupRepository;
  getUserId: () => string | null;
  isPreviewActive: () => boolean;
  isAnonymousUser: () => boolean;
  getLiveSnapshot: () => SetupSnapshot;
  notifySuccess: (message: string) => void;
  reportUserError: (message: string, error: unknown, action: string) => void;
}

function defaultDeps(getLiveSnapshot: () => SetupSnapshot): FavoriteStateDeps {
  return {
    repository: generatorSetupRepository,
    getUserId: getEffectiveUserId,
    isPreviewActive: () => userPreviewState.isActive,
    isAnonymousUser: () => !authState.isAuthenticated || authState.isAnonymous,
    getLiveSnapshot,
    notifySuccess: (message) => showToast(message, "success"),
    reportUserError: (message, error, action) => {
      getErrorHandler().showUserError({
        message,
        technicalDetails:
          error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error : new Error(String(error)),
        severity: "error",
        context: { module: "create", tab: "generate", action },
      });
    },
  };
}

function nextSetupName(existing: SavedGeneratorSetup[]): string {
  const names = new Set(existing.map((s) => s.name));
  for (let i = 1; i <= existing.length; i++) {
    if (!names.has(`Setup ${i}`)) return `Setup ${i}`;
  }
  return `Setup ${existing.length + 1}`;
}

export function createFavoriteState(
  getLiveSnapshot: () => SetupSnapshot,
  overrides?: Partial<FavoriteStateDeps>
) {
  const deps: FavoriteStateDeps = {
    ...defaultDeps(getLiveSnapshot),
    ...overrides,
  };

  let setups = $state<SavedGeneratorSetup[]>([]);
  let communityFavorites = $state<CommunityFavorite[]>([]);
  let sharedSetupId = $state<string | null>(null);
  let activeSource = $state<ActiveSetupSource | null>(null);
  let isLoadingSetups = $state(true);
  let isLoadingCommunity = $state(true);
  let setupsLoadError = $state<string | null>(null);
  let communityLoadError = $state<string | null>(null);
  let pendingAction = $state<PendingSetupAction | null>(null);

  const activeStoredSnapshot = $derived.by<SetupSnapshot | null>(() => {
    if (!activeSource) return null;
    if (activeSource.kind === "setup") {
      const source = activeSource;
      const s = setups.find((x) => x.id === source.setupId);
      return s ? captureSetupSnapshot(s.config, s.startEndOptions) : null;
    }
    const source = activeSource;
    const c = communityFavorites.find((x) => x.userId === source.userId);
    return c ? captureSetupSnapshot(c.config, c.startEndOptions ?? null) : null;
  });

  const activeStatus = $derived.by<"active" | "modified" | null>(() => {
    if (!activeStoredSnapshot) return null;
    return setupSnapshotsEqual(activeStoredSnapshot, deps.getLiveSnapshot())
      ? "active"
      : "modified";
  });

  const canSave = $derived(
    deps.getUserId() !== null &&
      !deps.isPreviewActive() &&
      !isLoadingSetups &&
      setupsLoadError === null &&
      setups.length < SETUP_CAP &&
      pendingAction === null
  );

  loadPersonal();
  loadCommunity();

  async function loadPersonal(): Promise<void> {
    const userId = deps.getUserId();
    if (!userId) {
      isLoadingSetups = false;
      return;
    }
    isLoadingSetups = true;
    setupsLoadError = null;
    try {
      const snapshot = await deps.repository.loadPersonal(userId, {
        allowMigration: !deps.isPreviewActive(),
      });
      setups = snapshot.setups;
      sharedSetupId = snapshot.sharedSetupId;
    } catch (error) {
      setupsLoadError = "Saved setups could not load";
      console.error("[FavoriteState] loadPersonal failed:", error);
    } finally {
      isLoadingSetups = false;
    }
  }

  async function loadCommunity(): Promise<void> {
    isLoadingCommunity = true;
    communityLoadError = null;
    try {
      const all = await deps.repository.loadCommunity(20);
      const userId = deps.getUserId();
      communityFavorites = all.filter((f) => f.userId !== userId);
    } catch (error) {
      communityLoadError = "Community favorites could not load";
      console.error("[FavoriteState] loadCommunity failed:", error);
    } finally {
      isLoadingCommunity = false;
    }
  }

  function guardMutation(): string | null {
    const userId = deps.getUserId();
    if (!userId || deps.isPreviewActive() || pendingAction) return null;
    return userId;
  }

  async function saveCurrentSetup(): Promise<boolean> {
    const userId = guardMutation();
    if (!userId || setups.length >= SETUP_CAP) return false;
    pendingAction = { kind: "create" };
    try {
      const snapshot = deps.getLiveSnapshot();
      const created = await deps.repository.createSetup(userId, {
        name: nextSetupName(setups),
        config: snapshot.config,
        startEndOptions: snapshot.startEndOptions,
      });
      setups = [...setups, created];
      activeSource = { kind: "setup", setupId: created.id };
      deps.notifySuccess("Setup saved");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't save your setup",
        error,
        "saveCurrentSetup"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function renameSetup(
    setupId: string,
    rawName: string
  ): Promise<boolean> {
    const userId = guardMutation();
    const name = rawName.trim().slice(0, SETUP_NAME_MAX_LENGTH);
    if (!userId || !name) return false;
    pendingAction = { kind: "rename", setupId };
    try {
      await deps.repository.renameSetup(userId, setupId, name);
      setups = setups.map((s) =>
        s.id === setupId ? { ...s, name, updatedAt: new Date() } : s
      );
      deps.notifySuccess("Setup renamed");
      return true;
    } catch (error) {
      deps.reportUserError("Couldn't rename the setup", error, "renameSetup");
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function updateSetupFromCurrent(setupId: string): Promise<boolean> {
    const userId = guardMutation();
    const existing = setups.find((s) => s.id === setupId);
    if (!userId || !existing) return false;
    pendingAction = { kind: "update", setupId };
    try {
      const snapshot = deps.getLiveSnapshot();
      const updated: SavedGeneratorSetup = {
        ...existing,
        config: snapshot.config,
        startEndOptions: snapshot.startEndOptions,
        updatedAt: new Date(),
      };
      await deps.repository.updateSetup(
        userId,
        updated,
        sharedSetupId === setupId
      );
      setups = setups.map((s) => (s.id === setupId ? updated : s));
      deps.notifySuccess("Setup updated");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't update the setup",
        error,
        "updateSetupFromCurrent"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function shareSetup(setupId: string): Promise<boolean> {
    const userId = guardMutation();
    const setup = setups.find((s) => s.id === setupId);
    if (!userId || !setup || deps.isAnonymousUser()) return false;
    pendingAction = { kind: "share", setupId };
    try {
      await deps.repository.shareSetup(userId, setup);
      sharedSetupId = setupId;
      deps.notifySuccess("Shared as your Favorite");
      return true;
    } catch (error) {
      deps.reportUserError("Couldn't share the setup", error, "shareSetup");
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function unshareSetup(): Promise<boolean> {
    const userId = guardMutation();
    if (!userId || sharedSetupId === null) return false;
    pendingAction = { kind: "unshare" };
    try {
      await deps.repository.unshareSetup(userId);
      sharedSetupId = null;
      deps.notifySuccess("Your setup is no longer shared");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't stop sharing the setup",
        error,
        "unshareSetup"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function deleteSetup(setupId: string): Promise<boolean> {
    const userId = guardMutation();
    if (!userId) return false;
    pendingAction = { kind: "delete", setupId };
    try {
      await deps.repository.deleteSetup(
        userId,
        setupId,
        sharedSetupId === setupId
      );
      setups = setups.filter((s) => s.id !== setupId);
      if (sharedSetupId === setupId) sharedSetupId = null;
      if (activeSource?.kind === "setup" && activeSource.setupId === setupId) {
        activeSource = null;
      }
      deps.notifySuccess("Setup deleted");
      return true;
    } catch (error) {
      deps.reportUserError("Couldn't delete the setup", error, "deleteSetup");
      return false;
    } finally {
      pendingAction = null;
    }
  }

  function setActiveSource(source: ActiveSetupSource): void {
    activeSource = source;
  }

  return {
    get setups() {
      return setups;
    },
    get communityFavorites() {
      return communityFavorites;
    },
    get sharedSetupId() {
      return sharedSetupId;
    },
    get activeSource() {
      return activeSource;
    },
    get activeStatus() {
      return activeStatus;
    },
    get isLoadingSetups() {
      return isLoadingSetups;
    },
    get isLoadingCommunity() {
      return isLoadingCommunity;
    },
    get setupsLoadError() {
      return setupsLoadError;
    },
    get communityLoadError() {
      return communityLoadError;
    },
    get pendingAction() {
      return pendingAction;
    },
    get canSave() {
      return canSave;
    },

    loadPersonal,
    loadCommunity,
    saveCurrentSetup,
    renameSetup,
    updateSetupFromCurrent,
    shareSetup,
    unshareSetup,
    deleteSetup,
    setActiveSource,
  };
}

export type FavoriteState = ReturnType<typeof createFavoriteState>;
```

- [ ] **Step 6.2: Write the state tests** (`tests/unit/create/favorite-state.test.ts`). Mirror the harness conventions of `tests/unit/create/construct-tutorial-state.test.ts` (rune-compiled test setup). Inject a fully fake deps object — no module mocks needed:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createFavoriteState,
  type FavoriteStateDeps,
} from "$lib/features/create/generate/state/favorite-state.svelte";
import type {
  CommunityFavorite,
  SavedGeneratorSetup,
} from "$lib/features/create/generate/domain/models/favorite-config";
import { captureSetupSnapshot } from "$lib/features/create/generate/domain/setup-snapshot";

const NOW = new Date();
const CONFIG = {
  level: 2,
  length: 8,
  mode: "freeform",
  spellTargetLength: null,
} as unknown as SavedGeneratorSetup["config"];

function makeSetup(id: string, name = id): SavedGeneratorSetup {
  return {
    id,
    name,
    config: CONFIG,
    startEndOptions: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

interface FakeOptions {
  personal?:
    | { setups: SavedGeneratorSetup[]; sharedSetupId: string | null }
    | Error;
  community?: CommunityFavorite[] | Error;
}

function makeDeps(opts: FakeOptions = {}) {
  const personal = opts.personal ?? { setups: [], sharedSetupId: null };
  const community = opts.community ?? [];
  const repository = {
    loadPersonal: vi.fn(async () => {
      if (personal instanceof Error) throw personal;
      return personal;
    }),
    loadCommunity: vi.fn(async () => {
      if (community instanceof Error) throw community;
      return community;
    }),
    createSetup: vi.fn(async (_uid: string, draft: { name: string }) =>
      makeSetup("new-id", draft.name)
    ),
    renameSetup: vi.fn(async () => undefined),
    updateSetup: vi.fn(async () => undefined),
    deleteSetup: vi.fn(async () => undefined),
    shareSetup: vi.fn(async () => undefined),
    unshareSetup: vi.fn(async () => undefined),
  };
  const deps: Partial<FavoriteStateDeps> = {
    repository,
    getUserId: () => "u1",
    isPreviewActive: () => false,
    isAnonymousUser: () => false,
    notifySuccess: vi.fn(),
    reportUserError: vi.fn(),
  };
  return { repository, deps };
}

const liveSnapshot = () => captureSetupSnapshot(CONFIG, null);

async function settled<
  T extends { isLoadingSetups: boolean; isLoadingCommunity: boolean },
>(state: T): Promise<T> {
  await vi.waitFor(() => {
    expect(state.isLoadingSetups).toBe(false);
    expect(state.isLoadingCommunity).toBe(false);
  });
  return state;
}

describe("favorite state", () => {
  it("personal and community loads settle independently", async () => {
    const { deps } = makeDeps({ community: new Error("outage") });
    const state = await settled(createFavoriteState(liveSnapshot, deps));
    expect(state.setupsLoadError).toBeNull();
    expect(state.communityLoadError).toBe("Community favorites could not load");
    expect(state.communityFavorites).toEqual([]);
  });

  it("failed personal read exposes error state, not an empty list", async () => {
    const { deps } = makeDeps({ personal: new Error("permission-denied") });
    const state = await settled(createFavoriteState(liveSnapshot, deps));
    expect(state.setupsLoadError).toBe("Saved setups could not load");
    expect(state.canSave).toBe(false);
  });

  it("save activates the returned setup and reports success", async () => {
    const { deps } = makeDeps();
    const state = await settled(createFavoriteState(liveSnapshot, deps));
    await expect(state.saveCurrentSetup()).resolves.toBe(true);
    expect(state.setups.map((s) => s.id)).toEqual(["new-id"]);
    expect(state.activeSource).toEqual({ kind: "setup", setupId: "new-id" });
    expect(state.activeStatus).toBe("active");
  });

  it("failed writes mutate nothing", async () => {
    const { deps, repository } = makeDeps({
      personal: { setups: [makeSetup("s1")], sharedSetupId: "s1" },
    });
    repository.deleteSetup.mockRejectedValue(new Error("offline"));
    repository.shareSetup.mockRejectedValue(new Error("offline"));
    const state = await settled(createFavoriteState(liveSnapshot, deps));
    await expect(state.deleteSetup("s1")).resolves.toBe(false);
    expect(state.setups).toHaveLength(1);
    expect(state.sharedSetupId).toBe("s1");
    expect(deps.reportUserError).toHaveBeenCalled();
  });

  it("deleting the active setup clears provenance", async () => {
    const { deps } = makeDeps({
      personal: { setups: [makeSetup("s1")], sharedSetupId: null },
    });
    const state = await settled(createFavoriteState(liveSnapshot, deps));
    state.setActiveSource({ kind: "setup", setupId: "s1" });
    await expect(state.deleteSetup("s1")).resolves.toBe(true);
    expect(state.activeSource).toBeNull();
    expect(state.setups).toEqual([]);
  });

  it("sharing replaces sharedSetupId", async () => {
    const { deps } = makeDeps({
      personal: {
        setups: [makeSetup("s1"), makeSetup("s2")],
        sharedSetupId: "s1",
      },
    });
    const state = await settled(createFavoriteState(liveSnapshot, deps));
    await expect(state.shareSetup("s2")).resolves.toBe(true);
    expect(state.sharedSetupId).toBe("s2");
  });

  it("anonymous users cannot reach the public share write", async () => {
    const { deps, repository } = makeDeps({
      personal: { setups: [makeSetup("s1")], sharedSetupId: null },
    });
    deps.isAnonymousUser = () => true;
    const state = await settled(createFavoriteState(liveSnapshot, deps));
    await expect(state.shareSetup("s1")).resolves.toBe(false);
    expect(repository.shareSetup).not.toHaveBeenCalled();
  });

  it("admin preview loads without migration and blocks mutations", async () => {
    const { deps, repository } = makeDeps({
      personal: { setups: [makeSetup("s1")], sharedSetupId: null },
    });
    deps.isPreviewActive = () => true;
    const state = await settled(createFavoriteState(liveSnapshot, deps));
    expect(repository.loadPersonal).toHaveBeenCalledWith("u1", {
      allowMigration: false,
    });
    await expect(state.saveCurrentSetup()).resolves.toBe(false);
    expect(state.canSave).toBe(false);
  });

  it("retry clears the error after a successful reload", async () => {
    const { deps, repository } = makeDeps({ community: new Error("outage") });
    const state = await settled(createFavoriteState(liveSnapshot, deps));
    repository.loadCommunity.mockResolvedValue([]);
    await state.loadCommunity();
    expect(state.communityLoadError).toBeNull();
  });

  it("cap: canSave is false at 10 setups", async () => {
    const ten = Array.from({ length: 10 }, (_, i) =>
      makeSetup(`s${i}`, `Setup ${i + 1}`)
    );
    const { deps } = makeDeps({
      personal: { setups: ten, sharedSetupId: null },
    });
    const state = await settled(createFavoriteState(liveSnapshot, deps));
    expect(state.canSave).toBe(false);
    await expect(state.saveCurrentSetup()).resolves.toBe(false);
  });
});
```

- [ ] **Step 6.3:** Run `npm run test:ci -- tests/unit/create/favorite-state.test.ts`. Expected: 10 passed. If `$derived` reads throw outside a reactive root, wrap factory creation in the `$effect.root` helper pattern from `tests/unit/browse-engine-test-helpers.svelte.ts` (create a sibling `favorite-state-test-helpers.svelte.ts` if needed). Paste output.

---

### Task 7: OverflowMenu per-item disabled state

**Files:**

- Modify: `src/lib/shared/ui/components/OverflowMenu.svelte`

- [ ] **Step 7.1:** Extend the shared primitive (do not fork). `MenuItem` gains `disabled?: boolean`; the item button honors it:

```ts
interface MenuItem {
  label: string;
  icon: string;
  action: () => void;
  variant?: "danger";
  /** Rendered but not activatable — keeps unavailable actions discoverable. */
  disabled?: boolean;
}
```

```svelte
        <button
          type="button"
          class="overflow-item"
          class:danger={item.variant === "danger"}
          role="menuitem"
          disabled={item.disabled}
          aria-disabled={item.disabled || undefined}
          onclick={() => { if (!item.disabled) handleItemClick(item); }}
        >
```

Add style: `.overflow-item:disabled { opacity: 0.4; cursor: not-allowed; }` and scope the existing hover rule to `.overflow-item:not(:disabled):hover`.

- [ ] **Step 7.2:** Grep consumers to confirm the optional prop breaks nobody: `Grep pattern:"OverflowMenu" glob:"**/*.svelte"` — existing item literals without `disabled` remain valid. No behavior change for them.

---

### Task 8: Drawer UI rebuild

**Files:**

- Create: `src/lib/features/create/generate/components/presets/SavedSetupRow.svelte`
- Modify: `src/lib/features/create/generate/components/presets/PresetDrawer.svelte`

Load the `styling` skill first. Preserve the existing width-fix `:global` rules and the `.preset-drawer-content` gradient background verbatim.

- [ ] **Step 8.1: `SavedSetupRow.svelte`.** Props and behavior (complete contract — implement exactly):

```ts
import type { SavedGeneratorSetup } from "../../domain/models/favorite-config";
import OverflowMenu from "$lib/shared/ui/components/OverflowMenu.svelte";

let {
  setup,               // SavedGeneratorSetup
  summary,             // string — precomputed config summary
  isActive,            // boolean — activeSource matches AND snapshots equal
  isModified,          // boolean — activeSource matches AND snapshots differ
  isShared,            // boolean — sharedSetupId === setup.id
  isBusy,              // boolean — pendingAction targets this setup
  disableMutations,    // boolean — admin preview / signed-out
  onApply,             // () => void
  onUpdate,            // () => void  (menu item disabled unless isModified)
  onRenameSubmit,      // (name: string) => Promise<boolean>
  onShareToggle,       // () => void  (Share or Unshare per isShared)
  onDelete,            // () => void  (opens ConfirmDialog in parent)
}: { … } = $props();
```

Template requirements (all mandatory):

- Row = flex container: main **Apply** `<button class="favorite-item">` (reuses the existing `.favorite-item` styles in PresetDrawer — move/copy that class block here) holding name, summary, and badge; plus an `OverflowMenu` on the right with `placement="bottom"` and `ariaLabel={"Actions for " + setup.name}`.
- Apply button: `aria-current={isActive ? "true" : undefined}`, `aria-busy={isBusy || undefined}`, `disabled={isBusy}`, min-height `var(--min-touch-target, 44px)`.
- Badge: one text span in a **reserved slot** — `min-width: 4.5rem; text-align: right;` (fits "Modified", the longest label; prevents row reflow per `no-layout-shift.md`). Shows `Active` | `Modified` | empty. A separate small `Shared` chip renders next to the name when `isShared` (its slot also reserved with `visibility: hidden` when unshared, not `display: none`).
- Menu items (exact order and labels):
  1. `{ label: "Update with current settings", icon: "fa-solid fa-arrows-rotate", action: onUpdate, disabled: !isModified || disableMutations }`
  2. `{ label: "Rename", icon: "fa-solid fa-pen", action: startRename, disabled: disableMutations }`
  3. `{ label: isShared ? "Unshare" : "Share as my Favorite", icon: "fa-solid fa-heart", action: onShareToggle, disabled: disableMutations }`
  4. `{ label: "Delete", icon: "fa-solid fa-trash", action: onDelete, variant: "danger", disabled: disableMutations }`
- Inline rename: local `renaming = $state(false)`, `draft = $state("")`. `startRename` sets draft to `setup.name`, flips flag, focuses the input (`$effect` + `input.focus()`; `select()` the text). Input: `maxlength={60}`, visible label via `aria-label={"Rename " + setup.name}`, Enter → `if (draft.trim()) { const ok = await onRenameSubmit(draft); if (ok) renaming = false; }` (failure keeps editor open with typed value), Escape → `renaming = false` without submit. Submit button not required — Enter/Escape only, plus blur does nothing (no accidental submits). While renaming, the Apply button is replaced by the input in the same grid cell (no height change: input `min-height` matches the row).
- Reduced motion: no new transitions beyond the existing `.favorite-item` border transition (already guarded in-file).

- [ ] **Step 8.2: Rebuild `PresetDrawer.svelte`.** Keep: portal wrapper, `Drawer` invocation (`placement="right"`, `respectLayoutMode`, `closeOnBackdrop`, `class="preset-drawer-sheet"`), the `:global` width/height rules, `.preset-drawer-content` shell, `summarize()`. Replace everything else. New props contract:

```ts
import type { FavoriteState } from "../../state/favorite-state.svelte";
import type { ActiveSetupSource, SavedGeneratorSetup } from "../../domain/models/favorite-config";

let {
  isOpen,
  favoriteState,          // FavoriteState
  isSignedOut,            // boolean — no effective uid
  isPreview,              // boolean — admin preview (read-only)
  onApply,                // (source: ActiveSetupSource) => void
  onRequestShareAccount,  // () => void — anonymous picked Share
  onRequestSignIn,        // () => void — signed-out Saved tab CTA
  onClose,                // () => void
}: { … } = $props();
```

Structure (all mandatory):

1. `<DrawerHeader title="Generator setups" onClose={onClose} />` replaces the h3. Drawer `ariaLabel="Generator setups"`.
2. Tabs directly under the header:

```svelte
<SegmentedControl
  options={[
    {
      value: "saved",
      label: "Saved",
      id: "setups-tab-saved",
      controls: "setups-panel-saved",
    },
    {
      value: "community",
      label: "Community",
      id: "setups-tab-community",
      controls: "setups-panel-community",
    },
  ]}
  value={activeTab}
  onchange={(v) => (activeTab = v)}
  semantics="tabs"
  ariaLabel="Setup lists"
/>
```

with `let activeTab = $state<"saved" | "community">("saved")`. Each panel: `<section role="tabpanel" id="setups-panel-saved" aria-labelledby="setups-tab-saved">` (same for community), hidden with `display: none` when inactive (state preserved, no remount — do NOT use `{#if}`).

3. **Saved panel**, in order:
   - Preview banner when `isPreview`: two lines, exact copy `Previewing saved setups` / `Apply is available. Changes are disabled in preview.`
   - Signed-out block when `isSignedOut`: heading `Save generator setups`, body `Sign in to keep setups across sessions.`, and a real button (reuse `.save-button` styling) labeled `Sign in` → `onRequestSignIn`. Skip the rest of the panel.
   - Primary action button (reuse `.save-button`): label `Save current setup`, busy label `Saving...` while `favoriteState.pendingAction?.kind === "create"` (with `aria-busy="true"`), `disabled={!favoriteState.canSave}`. Below it, when `favoriteState.setups.length >= 10`, the cap line: `10 setups saved. Delete one to save another.`
   - Loading: `<SkeletonLoader variant="rect" height="64px" count={3} />` while `isLoadingSetups`.
   - Error: when `setupsLoadError`, message `Saved setups could not load` + `Try again` button → `favoriteState.loadPersonal()`. Never render the empty state simultaneously.
   - Empty (loaded, no error, zero setups, signed in): `No saved setups yet` / `Save the current controls so you can bring them back in one tap.`
   - List: `{#each favoriteState.setups as setup (setup.id)}` → `SavedSetupRow` with:
     - `isActive={isRowActive(setup.id) && favoriteState.activeStatus === "active"}`
     - `isModified={isRowActive(setup.id) && favoriteState.activeStatus === "modified"}` where `isRowActive(id)` checks `activeSource?.kind === "setup" && activeSource.setupId === id`
     - `isShared={favoriteState.sharedSetupId === setup.id}`
     - `isBusy` from `pendingAction` matching this `setupId`
     - `disableMutations={isPreview || isSignedOut}`
     - `onApply={() => onApply({ kind: "setup", setupId: setup.id })}`
     - `onUpdate={() => favoriteState.updateSetupFromCurrent(setup.id)}`
     - `onRenameSubmit={(name) => favoriteState.renameSetup(setup.id, name)}`
     - `onShareToggle`: if shared → `favoriteState.unshareSetup()`; else if the viewer is anonymous (pass a derived `isAnonymous` prop or route through GeneratePanel — see Task 9 wiring) → `onRequestShareAccount()`; else `favoriteState.shareSetup(setup.id)`
     - `onDelete={() => (deleteTarget = setup)}`
4. **Delete confirmation** (once, outside the list): `let deleteTarget = $state<SavedGeneratorSetup | null>(null);`

```svelte
<ConfirmDialog
  isOpen={deleteTarget !== null}
  title={deleteTarget ? `Delete “${deleteTarget.name}”?` : ""}
  message={deleteTarget && favoriteState.sharedSetupId === deleteTarget.id
    ? "This removes the saved setup and stops sharing it as your Favorite. Your current generator settings will not change."
    : "This removes the saved setup. Your current generator settings will not change."}
  confirmText="Delete"
  cancelText="Cancel"
  variant="danger"
  onConfirm={async () => {
    if (deleteTarget) {
      await favoriteState.deleteSetup(deleteTarget.id);
      deleteTarget = null;
    }
  }}
  onCancel={() => (deleteTarget = null)}
/>
```

5. **Community panel**: skeleton while loading (`variant="rect" height="64px" count={3}`); error block `Community favorites could not load` + `Try again` → `favoriteState.loadCommunity()`; empty copy `No shared setups yet` / `Community Favorites will appear here when people choose to share.`; else rows — keep the existing `.favorite-item` button structure but replace the hand-rolled `img`/`avatarColor` fallback with `<RobustAvatar src={fav.avatar} name={fav.displayName} size="sm" />` (delete `getInitial`/`avatarColor` and the `.avatar`/`.avatar-fallback` styles), badge slot shows `Active`/`Modified` when `activeSource` is that community user, `aria-current` likewise, click → `onApply({ kind: "community", userId: fav.userId })`.

- [ ] **Step 8.3:** Run `npm run check:fast`. Expected: no new errors in the two components. (GeneratePanel still passes old props — it breaks until Task 9; that is the expected intermediate state, which is why Tasks 8+9 run back-to-back before any check gate is treated as final.)

---

### Task 9: Wiring — GeneratePanel, CardBasedSettingsContainer, PresetCard, nudge trigger, help copy

**Files:**

- Modify: `src/lib/features/create/generate/components/GeneratePanel.svelte`
- Modify: `src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte`
- Modify: `src/lib/features/create/generate/components/cards/PresetCard.svelte`
- Modify: `src/lib/features/create/generate/components/cards/BaseCard.svelte`
- Modify: `src/lib/shared/auth/domain/auth-nudge-trigger.ts`
- Modify: `src/lib/shared/create/domain/generator-help-content.ts`

- [ ] **Step 9.1: GeneratePanel.** Replace the favorite section (lines ~82, 98-132, 299-309) with:

```ts
import { captureSetupSnapshot } from "../domain/setup-snapshot";
import type { ActiveSetupSource } from "../domain/models/favorite-config";
import { getEffectiveUserId } from "$lib/shared/auth/state/auth-state.svelte";
import { userPreviewState } from "$lib/shared/debug/state/user-preview-state.svelte";

const favoriteState = createFavoriteState(() =>
  captureSetupSnapshot(configState.config, startEndState.options)
);

const isSignedOut = $derived(getEffectiveUserId() === null);
const isPreview = $derived(userPreviewState.isActive);
const isAnonymousViewer = $derived(
  !authState.isAuthenticated || authState.isAnonymous
);
let shareSignupOpen = $state(false);

function handleApplySource(source: ActiveSetupSource): void {
  const snap =
    source.kind === "setup"
      ? favoriteState.setups.find((s) => s.id === source.setupId)
      : favoriteState.communityFavorites.find(
          (f) => f.userId === source.userId
        );
  if (!snap) return;

  const normalized = captureSetupSnapshot(
    snap.config,
    snap.startEndOptions ?? null
  );
  configState.updateConfig(normalized.config);
  if (normalized.startEndOptions) {
    startEndState.setOptions(normalized.startEndOptions);
  } else {
    // A null snapshot means "no constraints": reset, never retain the
    // previous setup's constraints.
    startEndState.resetOptions();
  }
  if (spellModeState.inputWord?.trim()) {
    spellModeState.setInputWord("");
  }
  favoriteState.setActiveSource(source);
  panelState?.closePresetDrawer();
}
```

`handleSaveAsFavorite` is deleted (the drawer calls `favoriteState.saveCurrentSetup()` itself; the drawer never closes on save — AC7). New drawer invocation:

```svelte
<PresetDrawer
  isOpen={panelState.isPresetDrawerOpen}
  {favoriteState}
  {isSignedOut}
  {isPreview}
  isAnonymous={isAnonymousViewer}
  onApply={handleApplySource}
  onRequestShareAccount={() => (shareSignupOpen = true)}
  onRequestSignIn={() => authDrawerState.show("signin")}
  onClose={() => panelState.closePresetDrawer()}
/>
```

(Add the `isAnonymous` prop to PresetDrawer's contract in Task 8 — it decides the Share menu routing.) Add the share nudge next to the existing LOOP one:

```svelte
<BaseModal
  open={shareSignupOpen}
  size="fit"
  class="chromeless"
  onclose={() => (shareSignupOpen = false)}
>
  <AuthNudge
    trigger="share-setup"
    onCreateAccount={() => {
      shareSignupOpen = false;
      authDrawerState.show("signup");
    }}
    onLogin={() => {
      shareSignupOpen = false;
      authDrawerState.show("signin");
    }}
    onDismiss={() => (shareSignupOpen = false)}
  />
</BaseModal>
```

- [ ] **Step 9.2: Nudge trigger.** In `auth-nudge-trigger.ts` add `| "share-setup"` to the union and to the registry:

```ts
  // Generate drawer: an anonymous user picked "Share as my Favorite". The
  // community card shows their name and avatar, so sharing needs a full
  // account (favorite-state blocks the write as the second gate).
  "share-setup": "Create a free account to share your setup with the community.",
```

- [ ] **Step 9.3: CardBasedSettingsContainer.** Delete `withFavoriteDeselect` (lines 390-397) and unwrap all handler call sites (lines 427-454) back to the bare handlers. In the card-props object (lines ~455-466), replace `activeFavoriteId`/`activeFavoriteName` with:

```ts
setupsCardValue: (() => {
  const src = favoriteState.activeSource;
  if (src?.kind === "setup") {
    return favoriteState.setups.find((s) => s.id === src.setupId)?.name
      ?? `${favoriteState.setups.length} saved`;
  }
  if (src?.kind === "community") {
    return favoriteState.communityFavorites.find((f) => f.userId === src.userId)?.displayName
      ?? "Browse";
  }
  return favoriteState.setups.length > 0 ? `${favoriteState.setups.length} saved` : "Browse";
})(),
setupsCardStatus: favoriteState.activeStatus,
```

Then `Grep pattern:"activeFavoriteName" path:"src"` and update the card-builder service's type/pass-through to the new names (mechanical rename at every hit; same for `activeFavoriteId` hits that feed the preset card). Update the `favoriteState` prop type annotation to `FavoriteState` from the state module.

- [ ] **Step 9.4: BaseCard + PresetCard.** BaseCard: add `ariaLabel?: string` prop; both branches use `aria-label={ariaLabel ?? \`${title}: ${currentValue}. Click to change.\`}`. PresetCard full replacement:

```svelte
<!-- PresetCard - the Setups card: shows the applied setup and opens the drawer -->
<script lang="ts">
  import BaseCard from "./BaseCard.svelte";

  let {
    setupsCardValue = "Browse",
    setupsCardStatus = null,
    onOpenDrawer,
    color = "",
    shadowColor = "",
    cardIndex = 0,
  } = $props<{
    setupsCardValue?: string;
    setupsCardStatus?: "active" | "modified" | null;
    onOpenDrawer?: () => void;
    color?: string;
    shadowColor?: string;
    cardIndex?: number;
  }>();

  const statusLabel = $derived(
    setupsCardStatus === "active"
      ? "Active"
      : setupsCardStatus === "modified"
        ? "Modified"
        : ""
  );
</script>

<BaseCard
  title="Setups"
  currentValue={setupsCardValue}
  ariaLabel={`Setups: ${setupsCardValue}${statusLabel ? `, ${statusLabel}` : ""}. Click to change.`}
  {color}
  {shadowColor}
  {cardIndex}
  clickable
  onClick={onOpenDrawer}
>
  <span class="setup-status">
    <span class="setup-status-sizer" aria-hidden="true">Modified</span>
    <span class="setup-status-live">{statusLabel}</span>
  </span>
</BaseCard>

<style>
  /* Ghost-sizer: the slot is always as wide/tall as the longest label so
     Active <-> Modified <-> empty never resizes the card. */
  .setup-status {
    display: inline-grid;
    justify-items: center;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-accent, #3b82f6);
  }
  .setup-status-sizer {
    grid-area: 1 / 1;
    visibility: hidden;
  }
  .setup-status-live {
    grid-area: 1 / 1;
  }
</style>
```

Long names: BaseCard's `.card-value` already truncates within fixed card geometry; verify visually in Task 12.

- [ ] **Step 9.5: Help copy** (`generator-help-content.ts`, keep `id: "favorite"`):

```ts
  {
    id: "favorite",
    icon: "fa-heart",
    name: "Setups",
    color: "#e11d48",
    shortDesc: "Save and reuse your settings",
    fullDesc:
      "Save your current generator settings as a private setup and bring them back in one tap. Share one setup as your Favorite so other people can try it.",
    bullets: [
      "Save: Keeps up to 10 private setups with your Level, Length, Grid, and LOOP settings",
      "Apply: Tap a setup to load all of its settings",
      "Share: Pick one setup as your public Favorite for the Community tab",
    ],
    tip: "Setups are private until you share one as your Favorite.",
  },
```

- [ ] **Step 9.6:** Run `npm run check:fast`. Expected: zero errors across all files touched in Tasks 8-9. Then `npm run test:ci -- tests/unit/create/favorite-state.test.ts src/lib/features/create/generate/domain/__tests__/ src/lib/features/create/generate/services/__tests__/`. Expected: all green.

---

### Task 10: Component contract tests

**Files:**

- Create: `src/lib/features/create/generate/components/presets/PresetDrawer.svelte.test.ts`

- [ ] **Step 10.1:** Read `docs/reference/component-testing.md` and mirror its render/query conventions exactly (vitest-browser-svelte; note the `.svelte.test.ts` naming requirement). Build a plain fake `favoriteState` object literal (the component only reads getters and calls methods — a plain object with `vi.fn()` methods satisfies `FavoriteState` structurally; cast via `as unknown as FavoriteState`).
- [ ] **Step 10.2:** Implement exactly four focused assertions (no breadth beyond these — `component-test-discipline.md`):

1. **Save stays present with populated setups:** render with 2 setups → `getByRole("button", { name: "Save current setup" })` exists and is enabled. (Locks the original `{:else}` regression.)
2. **Error and empty are distinct:** render with `setupsLoadError: "Saved setups could not load"` → error text + `Try again` button present, empty-state copy (`No saved setups yet`) absent; re-render with no error and zero setups → inverse.
3. **Update disabled until Modified:** render an applied-but-equal setup (`activeStatus: "active"`), open its overflow menu → `Update with current settings` menu item has `disabled`; re-render with `activeStatus: "modified"` → enabled.
4. **Delete copy switches for the shared setup:** trigger Delete on a row whose id equals `sharedSetupId` → dialog message contains "stops sharing it as your Favorite"; on a non-shared row → it does not.

- [ ] **Step 10.3:** Run `npm run test:components:ci -- src/lib/features/create/generate/components/presets/PresetDrawer.svelte.test.ts`. Expected: 4 passed. Paste output. Stop condition: if the component-test infra can't render the Drawer portal, follow the portal guidance in `docs/reference/component-testing.md`; if it genuinely cannot without screenshot-duplicating scaffolding, mark these `- [~] deferred` in the ledger with that reason (the spec allows this conditional).

---

### Task 11: Full gates (resource-gated)

- [ ] **Step 11.1:** Confirm no other `svelte-check` is running machine-wide and ≥4 GB RAM free (PowerShell gates from `.claude/rules/resource-budget.md`).
- [ ] **Step 11.2:** One cold check, captured once: `npm run check > $env:TEMP/setups-check.log 2>&1` then grep the log for errors (`fast-iteration-loop.md`: capture once, grep many). Expected: zero errors attributable to File-Map paths. Fix and re-grep the log's file list; only re-run the full check after fixes if errors appeared.
- [ ] **Step 11.3:** Full unit config once: `npm run test:ci`. Expected: no failures beyond any pre-existing failures already present on `main` before this work (verify by comparing failing test names against a pre-task run if anything fails; do not chase unrelated breakage from concurrent sessions — report it instead).

---

### Task 12: Responsive visual verification (seven viewports)

The main agent owns visual judgment. Standing permission applies — no asking.

- [ ] **Step 12.1:** Launch own Chrome instance (never :5173's owner window):

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList `
  '--remote-debugging-port=9222','--user-data-dir=C:\Users\Austen\.claude\chrome-profile', `
  '--force-device-scale-factor=1','about:blank'
```

Navigate to the Create module's Generate tab over `https://localhost:5173/` (confirm the exact route from `src/routes` if unsure — do not guess in the report), open the drawer via the Setups card.

- [ ] **Step 12.2:** For each of **1440×900, 1920×1080, 2560×1440, 3840×2160, 820×1180, 960×412, 375×667** (`resize_page`, screenshots `format: "webp", quality: 70`), capture these states — populate by saving 3 setups, sharing one, applying one and changing a control (Modified):
  1. Saved tab populated (Active/Modified/Shared badges visible)
  2. Overflow menu open on a row (must stay inside the viewport)
  3. Inline rename open (no horizontal overflow)
  4. Delete confirmation over the drawer (layers above)
  5. Community tab: loading skeleton, then loaded rows, and the error+Retry state (simulate by toggling network offline in DevTools)
  6. Saved tab at the 10-setup cap (disabled Save + cap message)
  7. At 375×667 and 960×412: bottom sheet ≤85dvh with internal scroll
- [ ] **Step 12.3:** `evaluate_script` measurements to confirm arithmetic: desktop drawer content width ≤ 420px at 2560 and 3840; every Apply row and overflow trigger ≥ 44px tall.
- [ ] **Step 12.4:** Read every frame against the defect list in `visual-verification-mandatory.md` (absurdly wide controls, dead space, orphans, layout shift when badges change). Fix → reload → recapture until the frames are right. Also verify keyboard: Tab through drawer (focus trapped), arrow keys move tabs, Escape closes drawer, focus returns to the Setups card.

---

### Task 13: Final self-review and ledger close-out

- [ ] **Step 13.1: Type/API consistency sweep.** Grep-verify these names are identical everywhere they appear (definition + all call sites): `captureSetupSnapshot`, `setupSnapshotsEqual`, `planPersonalMigration`, `loadPersonal`, `loadCommunity`, `createSetup`, `renameSetup`, `updateSetupFromCurrent` (state) vs `updateSetup` (repo), `shareSetup`, `unshareSetup`, `deleteSetup`, `setActiveSource`, `activeStatus`, `canSave`, `sharedSetupId`, `setupsCardValue`, `setupsCardStatus`, `share-setup` trigger.
- [ ] **Step 13.2: Migration idempotency + stale-tab recovery.** Re-read `setup-migration.ts` against spec §Legacy migration: deterministic ID, missing-source re-adoption at the exact ID, fire-and-forget commit with telemetry catch, `allowMigration:false` under preview. Confirm the repository seam test proving `loadPersonal` resolves with a never-resolving commit is green.
- [ ] **Step 13.3: Accessibility checklist** against spec §Accessibility, item by item, in the built UI (tabs/tabpanel wiring, `aria-current`, `aria-busy`, overflow trigger labels, rename input label, dialog title contains setup name, 44px targets, visible focus rings, reduced motion, badge text not color-only).
- [ ] **Step 13.4: Spec coverage.** Walk every spec section and every acceptance criterion; complete the Requirement Ledger above with proof references. Any `- [~]` entries need written reasons.
- [ ] **Step 13.5: Docs.** Update the spec file: set frontmatter `plan_path: "docs/superpowers/plans/2026-07-30-generate-saved-setups-favorites.md"`, tick the design-ledger boxes for plan + implementation as they become true, and update `remaining:`. Do not commit — report completion with the evidence bundle (test outputs + screenshot set) and wait for Austen.

---

## Plan self-review (done at authoring time)

- **Spec coverage:** every spec section maps to a task — product model (T6/T8), data model (T1/T4), rules (T5), migration incl. nonblocking + re-adoption (T3/T4), repository contract (T4), state model (T6), equality incl. spell/set-array normalization (T2), IA incl. Setups card (T8/T9), action flows (T8/T9), error/busy (T6/T8), a11y (T8/T13), earned tests (T2-T6, T10), viewports (T12), out-of-scope respected (no quota rules, no renames, no marketplace).
- **Placeholder scan:** no TBDs; every code step carries real code; styling steps name exact classes, tokens, and geometry rules.
- **Type consistency:** repository `updateSetup(userId, setup, shared)` vs state `updateSetupFromCurrent(setupId)` is intentional layering (state resolves `shared` from `sharedSetupId`); `createFavoriteState(getLiveSnapshot, overrides?)` signature is consistent across factory, GeneratePanel (T9.1), and state tests (T6.2); drawer props match between T8.2 contract and T9.1 invocation, including the `isAnonymous` prop noted in both.
