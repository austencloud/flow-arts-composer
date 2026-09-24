# Cat Dog Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every surface honors the prop pair: settings can no longer hold a contradictory pair, readers stop trusting a stale flag, museum platforms draw the sequence's props, and Tunnel gets per-hand props.

**Architecture:** One pure rule module (`prop-pair-rule.ts`) normalizes every settings write and heals every load. Readers switch to the existing resolvers (`captureActivePropConfig`, `resolveViewingProps`, `resolveRecordedPropConfig`). Tunnel keeps its per-tunnel pair and gains a `catDog` flag, a hand selector, and the shared `HandPropToolbar`.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, zod, vitest (jsdom).

Spec: `docs/superpowers/specs/2026-09-23-cat-dog-audit-design.md`.

---

## Ground rules for every task

- Worktree: `E:/worktrees/tka-platform/cat-dog-audit`, branch `codex/cat-dog-audit`. Work only there.
- `node_modules` is a junction to the primary checkout. Never run `pnpm install`, `npm install`, or anything that writes `node_modules`.
- Tests: `npx vitest run --config tests/config/vitest.config.ts <paths>` from the worktree root.
- Type gate: `bash "C:/Users/Austen/AppData/Local/Temp/claude/E--cirque-aflame/9d585b5e-24d9-4243-bee2-7cb94dec0afc/scratchpad/branch-typecheck.sh"` must print `no errors in branch-touched files`. `npm run check` / svelte-check is not a real gate here.
- Commit with explicit paths: `git add -- <path> <path>`. Never `git add -A`, `git add .`, `git stash`, `git reset --hard`, `git checkout --`, or `git clean`.
- Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No em dashes and no emojis in code, comments, or commit messages.
- Match surrounding code style and comment density.

## File map

| File | Change |
|---|---|
| `src/lib/shared/settings/domain/prop-pair-rule.ts` | Create: `PROP_PAIR_KEYS`, `isPropPairKey`, `normalizePropPatch`, `healPropPair` |
| `src/lib/shared/settings/domain/prop-pair-rule.test.ts` | Create |
| `src/lib/shared/settings/state/settings-state.svelte.ts` | Normalize in `updateSettings`, route pair keys in `updateSetting`, heal in `initialSettings`, `loadSettingsFromStorage`, `applyRemoteSettings` |
| `src/lib/shared/settings/state/settings-state.prop-pair.test.ts` | Create |
| `src/lib/shared/settings/components/tabs/PropTypeTab.svelte` | `handleInlineSelect` emits one `propType` write when cat dog is off |
| `src/lib/shared/application/components/MainApplication.svelte` | Both-hands pick is one `updateSettings` call |
| `src/lib/shared/voice-control/services/handlers/prop-command-handler.ts` | Both-hands command is one `updateSettings` call |
| `src/lib/shared/sequence-viewer/components/SequenceViewer.svelte` | Pair from `resolveViewingProps` |
| `src/lib/shared/export-panel/components/single-media/StaticPreview.svelte` | Pair from `captureActivePropConfig` |
| `src/lib/shared/navigation/components/buttons/SelectedPropPreview.svelte` | Pair from `captureActivePropConfig` |
| `src/lib/features/museum/services/museum-prop-pair.ts` | Create: `museumPropPair` |
| `src/lib/features/museum/services/museum-prop-pair.test.ts` | Create |
| `src/lib/features/museum/scenes/procedural/components/PerformerPlatform.svelte` | Use `museumPropPair` |
| `src/lib/features/museum/components/game/MuseumPerformerStation3D.svelte` | Use `museumPropPair` |
| `src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts` | `props.catDogMode?`, capture and apply it |
| `src/lib/shared/sequence-viewer/tunnel/__tests__/tunnel-snapshot.test.ts` | Update fixtures, add flag tests |
| `src/lib/features/create/tunnel/state/tunnel-presentation-state.svelte.ts` | `catDog`, `propHand`, per-hand `setPropType`, `handProps` |
| `src/lib/features/create/tunnel/state/tunnel-presentation-state.test.ts` | Update fixture, add cat dog tests |
| `src/lib/features/create/tunnel/TunnelEditorSession.svelte` | Pass `initialCatDogMode` |
| `src/lib/shared/sequence-viewer/components/art-settings/TunnelArtSettings.svelte` | Optional `handProps`, render `HandPropToolbar` |
| `src/lib/features/create/tunnel/components/TunnelLayout.svelte` | Pass addressed prop, `handProps`, real pair to art view |

---

### Task 1: The prop pair rule

**Files:**
- Create: `src/lib/shared/settings/domain/prop-pair-rule.ts`
- Test: `src/lib/shared/settings/domain/prop-pair-rule.test.ts`

The rule: (1) hands that differ mean cat dog is on; (2) cat dog off means right equals left; (3) equal hands with cat dog on is valid and is not normalized away; (4) legacy `propType` follows the left hand.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  healPropPair,
  isPropPairKey,
  normalizePropPatch,
} from "./prop-pair-rule";

const plain = {
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogMode: false,
};
const mixed = {
  leftPropType: PropType.STAFF,
  rightPropType: PropType.FAN,
  catDogMode: true,
};

describe("normalizePropPatch", () => {
  it("returns an unrelated patch as the same object", () => {
    const patch = { darkMode: true };
    expect(normalizePropPatch(plain, patch)).toBe(patch);
  });

  it("turns cat dog on when one hand makes the hands differ", () => {
    expect(normalizePropPatch(plain, { rightPropType: PropType.FAN })).toEqual({
      rightPropType: PropType.FAN,
      catDogMode: true,
      propType: PropType.STAFF,
    });
  });

  it("turns cat dog on for a left-only pick too", () => {
    expect(normalizePropPatch(plain, { leftPropType: PropType.CLUB })).toEqual({
      leftPropType: PropType.CLUB,
      catDogMode: true,
      propType: PropType.CLUB,
    });
  });

  it("leaves the flag alone when both hands are set equal", () => {
    expect(
      normalizePropPatch(mixed, {
        leftPropType: PropType.CLUB,
        rightPropType: PropType.CLUB,
      })
    ).toEqual({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      propType: PropType.CLUB,
    });
  });

  it("folds the right hand to the left when cat dog turns off", () => {
    expect(normalizePropPatch(mixed, { catDogMode: false })).toEqual({
      catDogMode: false,
      rightPropType: PropType.STAFF,
      propType: PropType.STAFF,
    });
  });

  it("folds to the patched left hand when cat dog turns off with hands", () => {
    expect(
      normalizePropPatch(mixed, {
        catDogMode: false,
        leftPropType: PropType.FAN,
        rightPropType: PropType.CLUB,
      })
    ).toEqual({
      catDogMode: false,
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      propType: PropType.FAN,
    });
  });

  it("keeps an equal pair when cat dog turns on", () => {
    expect(normalizePropPatch(plain, { catDogMode: true })).toEqual({
      catDogMode: true,
      propType: PropType.STAFF,
    });
  });

  it("makes both hands follow a legacy propType-only patch", () => {
    expect(normalizePropPatch(mixed, { propType: PropType.CLUB })).toEqual({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      propType: PropType.CLUB,
    });
  });

  it("is idempotent", () => {
    const once = normalizePropPatch(mixed, { catDogMode: false });
    expect(normalizePropPatch(mixed, once)).toEqual(once);
  });
});

describe("healPropPair", () => {
  it("turns a stale false flag on when the stored hands differ", () => {
    expect(
      healPropPair({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.FAN,
        catDogMode: false,
      })
    ).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      propType: PropType.STAFF,
      catDogMode: true,
    });
  });

  it("keeps an equal pair with cat dog on", () => {
    expect(healPropPair({ ...plain, catDogMode: true })).toEqual({
      ...plain,
      catDogMode: true,
      propType: PropType.STAFF,
    });
  });

  it("fills hands from a legacy propType-only profile", () => {
    expect(healPropPair({ propType: PropType.FAN })).toEqual({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      propType: PropType.FAN,
      catDogMode: false,
    });
  });

  it("makes propType follow the left hand", () => {
    expect(healPropPair({ ...plain, propType: PropType.CLUB }).propType).toBe(
      PropType.STAFF
    );
  });
});

describe("isPropPairKey", () => {
  it("names exactly the four pair fields", () => {
    expect(
      ["leftPropType", "rightPropType", "propType", "catDogMode", "darkMode"].map(
        isPropPairKey
      )
    ).toEqual([true, true, true, true, false]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/settings/domain/prop-pair-rule.test.ts`
Expected: FAIL, cannot resolve `./prop-pair-rule`.

- [ ] **Step 3: Write the implementation**

```ts
import { PropType } from "../../pictograph/prop/domain/enums/prop-type";

/**
 * The settings fields that describe the performer's prop pair. Every write
 * and every load passes through this module so the store can never hold a
 * contradictory pair: hands that differ mean cat dog is on, cat dog off means
 * the right hand equals the left, and the legacy propType follows the left.
 * Equal hands with cat dog on is valid (the user turned it on and has not
 * picked a different hand yet).
 */
export interface PropPairFields {
  leftPropType?: PropType;
  rightPropType?: PropType;
  propType?: PropType;
  catDogMode?: boolean;
}

export const PROP_PAIR_KEYS = [
  "leftPropType",
  "rightPropType",
  "propType",
  "catDogMode",
] as const;

export function isPropPairKey(key: string): key is keyof PropPairFields {
  return (PROP_PAIR_KEYS as readonly string[]).includes(key);
}

function sets<P extends PropPairFields>(patch: P, key: keyof PropPairFields) {
  return (
    Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== undefined
  );
}

/** The patch with its pair fields made consistent with the stored pair. */
export function normalizePropPatch<P extends PropPairFields>(
  current: PropPairFields,
  patch: P
): P {
  if (!PROP_PAIR_KEYS.some((key) => sets(patch, key))) return patch;

  const out: P = { ...patch };
  let left = sets(patch, "leftPropType") ? patch.leftPropType : undefined;
  let right = sets(patch, "rightPropType") ? patch.rightPropType : undefined;
  // Legacy single-prop writers mean "both hands".
  if (sets(patch, "propType") && left === undefined && right === undefined) {
    left = patch.propType;
    right = patch.propType;
  }
  if (left !== undefined) out.leftPropType = left;
  if (right !== undefined) out.rightPropType = right;

  const nextLeft =
    left ?? current.leftPropType ?? current.propType ?? PropType.STAFF;
  const nextRight =
    right ?? current.rightPropType ?? current.propType ?? PropType.STAFF;

  if (sets(patch, "catDogMode")) {
    if (patch.catDogMode === false) out.rightPropType = nextLeft;
  } else if (nextLeft !== nextRight) {
    out.catDogMode = true;
  }
  out.propType = nextLeft;
  return out;
}

/** A loaded pair healed to the rule. Differing hands win over a stale flag,
 * matching captureActivePropConfig. */
export function healPropPair(
  fields: PropPairFields
): Required<PropPairFields> {
  const leftPropType =
    fields.leftPropType ?? fields.propType ?? PropType.STAFF;
  const rightPropType =
    fields.rightPropType ?? fields.propType ?? PropType.STAFF;
  return {
    leftPropType,
    rightPropType,
    propType: leftPropType,
    catDogMode:
      leftPropType !== rightPropType ? true : (fields.catDogMode ?? false),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/settings/domain/prop-pair-rule.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add -- src/lib/shared/settings/domain/prop-pair-rule.ts src/lib/shared/settings/domain/prop-pair-rule.test.ts
git commit -m "feat(settings): prop pair rule for normalizing writes and healing loads" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Settings enforce the rule, and both-hands writers become one write

**Files:**
- Modify: `src/lib/shared/settings/state/settings-state.svelte.ts` (`initialSettings` ~108, `applyRemoteSettings` ~422, `updateSetting` ~599, `updateSettings` ~646, `loadSettingsFromStorage` ~999)
- Modify: `src/lib/shared/settings/components/tabs/PropTypeTab.svelte` (`handleInlineSelect` ~297)
- Modify: `src/lib/shared/application/components/MainApplication.svelte` (`handleGlobalPropSelect` ~335)
- Modify: `src/lib/shared/voice-control/services/handlers/prop-command-handler.ts` (~63)
- Test: `src/lib/shared/settings/state/settings-state.prop-pair.test.ts`

Why the writer changes: once a single-hand write that makes the hands differ turns cat dog on, any caller that writes "both hands" as two sequential single-hand writes (`left` then `right`) flips cat dog on by accident after the first write. Those callers must write both hands in one patch. Known sites: `PropTypeTab.handleInlineSelect` (cat dog off branch emits `leftPropType` then `rightPropType` through `onUpdate`, which `SettingsModule.svelte:106` forwards to `updateSetting` one key at a time), `MainApplication.handleGlobalPropSelect` (cat dog off branch, lines 347-348), and `prop-command-handler.ts` (both-hands branch, lines 64-65). Before finishing, grep for any other place that writes `leftPropType` and `rightPropType` into global settings as two separate calls (`updateSetting(` with a hand key, or `onUpdate?.({ key: "leftPropType"`) and fix it the same way. Sequential writes that end with an explicit `catDogMode` write (PropTypeTab `handleSelectPreset`, `handleResetToDefaults`, `toggleCatDogMode`) already land on the right final state; leave them.

- [ ] **Step 1: Write the failing test**

`settingsService` is the singleton exported at the bottom of `settings-state.svelte.ts`. The vitest config aliases `$app/environment` to `tests/setup/stubs/app-environment.ts`; override it so `browser` is true, and stub auth so no Firebase work runs. If more modules need stubbing to import the file under jsdom (the persister, the scene undo manager, theme services), add `vi.mock` stubs for them in this file; see `src/lib/shared/share/state/image-composition-state.legacy-keys.test.ts` for the house pattern.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));
vi.mock("$lib/shared/auth/firebase", () => ({ auth: { currentUser: null } }));

const { settingsService } = await import("./settings-state.svelte");

const STORAGE_KEY = "tka-modern-web-settings";

describe("settings enforce the prop pair rule", () => {
  beforeEach(async () => {
    localStorage.clear();
    await settingsService.updateSettings({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      catDogMode: false,
    });
  });

  it("turns cat dog on when one hand makes the hands differ", async () => {
    await settingsService.updateSettings({ rightPropType: PropType.FAN });
    expect(settingsService.settings).toMatchObject({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
      propType: PropType.STAFF,
    });
  });

  it("folds the right hand when updateSetting turns cat dog off", async () => {
    await settingsService.updateSettings({ rightPropType: PropType.FAN });
    await settingsService.updateSetting("catDogMode", false);
    expect(settingsService.settings).toMatchObject({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      catDogMode: false,
    });
  });

  it("moves both hands for a legacy propType write", async () => {
    await settingsService.updateSetting("propType", PropType.CLUB);
    expect(settingsService.settings).toMatchObject({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      catDogMode: false,
    });
  });

  it("heals a stored stale flag on load", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.FAN,
        catDogMode: false,
      })
    );
    await settingsService.loadSettings();
    expect(settingsService.settings).toMatchObject({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
      propType: PropType.STAFF,
    });
  });
});
```

If `settingsService.settings` is not the getter name, use whatever public getter `SequenceViewer.svelte` uses (`settingsService.settings.leftPropType`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/settings/state/settings-state.prop-pair.test.ts`
Expected: FAIL on the cat dog and heal assertions (not on imports; fix any import failure by adding stubs first).

- [ ] **Step 3: Wire the rule into settings-state.svelte.ts**

Add the import next to the other `../domain/` imports:

```ts
import {
  healPropPair,
  isPropPairKey,
  normalizePropPatch,
} from "../domain/prop-pair-rule";
```

`initialSettings` (module level, ~line 122): replace `return { ...DEFAULT_SETTINGS, ...parsed };` with

```ts
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    return { ...merged, ...healPropPair(merged) };
```

`loadSettingsFromStorage()`: right after `const merged = { ...DEFAULT_SETTINGS, ...parsed };` add

```ts
      Object.assign(merged, healPropPair(merged));
```

`applyRemoteSettings()`: after the `for (const key in merged)` loop and before the `imageExport` block add

```ts
    // The pair fields are excluded from realtime sync but legacy propType is
    // not, so a remote document can land a propType that disagrees with the
    // local left hand.
    Object.assign(settingsState, healPropPair(settingsState));
```

`updateSetting()`: right after the `if (previousValue === value) return;` guard add

```ts
    // Pair fields carry companions (the other hand, the flag, propType), so
    // they go through the normalized patch path and are marked edited together.
    if (isPropPairKey(key)) {
      return this.updateSettings({ [key]: value } as Partial<AppSettings>);
    }
```

`updateSettings(newSettings)`: at the top of the method add

```ts
    newSettings = normalizePropPatch(settingsState, newSettings);
```

`AppSettings` must satisfy `PropPairFields` structurally (its fields are `PropType | undefined` and `boolean | undefined`). If the type gate complains about the generic, cast at the call site rather than loosening the rule module.

- [ ] **Step 4: Make both-hands writers write once**

`PropTypeTab.svelte` `handleInlineSelect`, current:

```ts
    selectedLeftPropType = propType;
    onUpdate?.({ key: "leftPropType", value: propType });
    if (!catDogMode) {
      selectedRightPropType = propType;
      onUpdate?.({ key: "rightPropType", value: propType });
    }
```

becomes:

```ts
    selectedLeftPropType = propType;
    if (catDogMode) {
      onUpdate?.({ key: "leftPropType", value: propType });
    } else {
      // One write for both hands: two single-hand writes would read as a
      // mixed pair in between and turn cat dog on.
      selectedRightPropType = propType;
      onUpdate?.({ key: "propType", value: propType });
    }
```

Keep any lines around it (haptics, preset sync) unchanged. Confirm `SettingsModule.svelte` forwards the `propType` key to `updateSetting` without a key allowlist; if it filters keys, emit `leftPropType` and `rightPropType` in a way that reaches one `updateSettings` call instead.

`MainApplication.svelte` `handleGlobalPropSelect` cat dog off branch:

```ts
    } else {
      updateSettings({ leftPropType: propType, rightPropType: propType });
    }
```

(`updateSettings` is already in scope in that file, used at ~459; if it is not destructured where `updateSetting` is, get it from the same source.)

`prop-command-handler.ts` both-hands branch:

```ts
    // Both hands
    await settingsService.updateSettings({
      leftPropType: propType,
      rightPropType: propType,
    });
    return { success: true, message: `Props: ${propType}` };
```

Then run the census grep described above and fix any other sequential both-hands writer.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/settings src/lib/shared/voice-control src/lib/shared/foundation/services`
Expected: PASS. If an existing test asserted the old sequential calls (for example a voice handler test expecting two `updateSetting` calls), update it to the single `updateSettings` call.

- [ ] **Step 6: Type gate**

Run the branch type gate. Expected: `no errors in branch-touched files`.

- [ ] **Step 7: Commit**

```bash
git add -- src/lib/shared/settings/state/settings-state.svelte.ts src/lib/shared/settings/state/settings-state.prop-pair.test.ts src/lib/shared/settings/components/tabs/PropTypeTab.svelte src/lib/shared/application/components/MainApplication.svelte src/lib/shared/voice-control/services/handlers/prop-command-handler.ts
git commit -m "feat(settings): enforce the prop pair rule on every write and load" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add any other files the census touched to the `git add --` list.)

---

### Task 3: Readers use the resolved pair

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewer.svelte` (~143-145, ~338-339, ~346-347)
- Modify: `src/lib/shared/export-panel/components/single-media/StaticPreview.svelte` (~98-124)
- Modify: `src/lib/shared/navigation/components/buttons/SelectedPropPreview.svelte` (~9-13)

These are markup and derivation swaps onto helpers that already have tests (`recorded-prop-intent`, `prop-viewing`). No new unit tests; the controller verifies them in the browser.

- [ ] **Step 1: SequenceViewer**

Import next to the settings import:

```ts
	import { resolveViewingProps } from "$lib/shared/foundation/services/prop-viewing";
```

Replace

```ts
	// Prop type settings for PropAwareThumbnail
	const leftPropType = $derived(settingsService.settings.leftPropType);
	const rightPropType = $derived(settingsService.settings.rightPropType);
	const catDogMode = $derived(settingsService.settings.catDogMode);
```

with

```ts
	// The same pair the viewer header and animation tab show, including
	// "as saved" viewing mode. The raw flag can lag a mixed pair.
	const viewingProps = $derived(
		resolveViewingProps(settingsService.settings, sequence).config
	);
	const leftPropType = $derived(viewingProps.leftPropType);
	const rightPropType = $derived(viewingProps.rightPropType);
	const catDogMode = $derived(viewingProps.catDogMode);
```

In both the `ChoreoCard` and `PropAwareThumbnail` blocks replace `rightPropType={catDogMode ? rightPropType : leftPropType}` with `{rightPropType}`. Keep `catDogModeEnabled={catDogMode}`. Use the file's existing indentation (tabs). `sequence` is the component's existing prop; if it is named differently, use that name.

- [ ] **Step 2: StaticPreview**

Import:

```ts
  import { captureActivePropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
```

In the `$effect`, replace the three reads

```ts
    const _catDogMode = settingsService.settings.catDogMode;
    const _leftPropType = settingsService.settings.leftPropType;
    const _rightPropType = settingsService.settings.rightPropType;
```

with

```ts
    // The real image export reads the settings pair directly, so the preview
    // resolves the same pair (reading the fields here also tracks them).
    const _props = captureActivePropConfig(settingsService.settings);
```

and the two overrides with

```ts
        leftPropTypeOverride: _props.leftPropType,
        rightPropTypeOverride: _props.rightPropType,
```

- [ ] **Step 3: SelectedPropPreview**

Import:

```ts
  import { captureActivePropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
```

Replace

```ts
  const left = $derived(settings.leftPropType ?? PropType.STAFF);
  const right = $derived(
    settings.catDogMode ? (settings.rightPropType ?? left) : left
  );
```

with

```ts
  const pair = $derived(captureActivePropConfig(settings));
  const left = $derived(pair.leftPropType);
  const right = $derived(pair.rightPropType);
```

Keep the `PropType` import if it is still used (it is, for `PropType.HAND`).

- [ ] **Step 4: Tests and type gate**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer src/lib/shared/export-panel src/lib/shared/navigation`
Expected: PASS (no regressions).
Run the branch type gate. Expected: `no errors in branch-touched files`.

- [ ] **Step 5: Commit**

```bash
git add -- src/lib/shared/sequence-viewer/components/SequenceViewer.svelte src/lib/shared/export-panel/components/single-media/StaticPreview.svelte src/lib/shared/navigation/components/buttons/SelectedPropPreview.svelte
git commit -m "fix(viewer): image tab, export preview, and nav icon read the resolved prop pair" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Museum platforms draw the sequence's props

**Files:**
- Create: `src/lib/features/museum/services/museum-prop-pair.ts`
- Test: `src/lib/features/museum/services/museum-prop-pair.test.ts`
- Modify: `src/lib/features/museum/scenes/procedural/components/PerformerPlatform.svelte:92-93`
- Modify: `src/lib/features/museum/components/game/MuseumPerformerStation3D.svelte:213-231`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { museumPropPair } from "./museum-prop-pair";

const seq = (intendedProp: unknown) =>
  ({ intendedProp }) as unknown as SequenceData;

describe("museumPropPair", () => {
  it("uses the sequence's recorded pair over settings", () => {
    expect(
      museumPropPair(
        seq({ leftPropType: "staff", rightPropType: "fan" }),
        { leftPropType: PropType.CLUB, rightPropType: PropType.CLUB }
      )
    ).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
    });
  });

  it("falls back to settings as a whole when the recording is half valid", () => {
    expect(
      museumPropPair(seq({ leftPropType: "fan" }), {
        leftPropType: PropType.CLUB,
        rightPropType: PropType.HOOP,
      })
    ).toEqual({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.HOOP,
      catDogMode: true,
    });
  });

  it("falls back to staff with no sequence and no settings", () => {
    expect(museumPropPair(null, null)).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      catDogMode: false,
    });
  });
});
```

If `PropType.HOOP` does not exist, use any other non-staff member (for example `PropType.MINIHOOP`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/museum/services/museum-prop-pair.test.ts`
Expected: FAIL, cannot resolve `./museum-prop-pair`.

- [ ] **Step 3: Write the helper**

```ts
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  captureActivePropConfig,
  resolveRecordedPropConfig,
  type ActivePropSettings,
  type ResolvedPropConfig,
} from "$lib/shared/foundation/services/recorded-prop-intent";

/**
 * The pair a museum performer holds: the sequence's recorded pair when it has
 * a valid one, else the visitor's settings. A half-valid recording falls back
 * as a whole, never mixed per hand.
 */
export function museumPropPair(
  sequence: SequenceData | null | undefined,
  settings: ActivePropSettings | null
): ResolvedPropConfig {
  return (
    resolveRecordedPropConfig(sequence) ?? captureActivePropConfig(settings ?? {})
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/museum/services/museum-prop-pair.test.ts`
Expected: PASS.

- [ ] **Step 5: PerformerPlatform**

Add imports:

```ts
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { museumPropPair } from "../../../services/museum-prop-pair";
```

(Adjust the relative path so it resolves to `src/lib/features/museum/services/museum-prop-pair.ts`, or use `$lib/features/museum/services/museum-prop-pair`.)

After the `$props()` line add:

```ts
  const propPair = $derived(museumPropPair(sequence, settingsService.settings));
```

Replace the two hardcoded lines with:

```svelte
        leftPropType={toScenePropType(propPair.leftPropType)}
        rightPropType={toScenePropType(propPair.rightPropType)}
```

Remove the `PropType` import if nothing else in the file uses it.

- [ ] **Step 6: MuseumPerformerStation3D**

Add import:

```ts
  import { museumPropPair } from "$lib/features/museum/services/museum-prop-pair";
  import type { ActivePropSettings } from "$lib/shared/foundation/services/recorded-prop-intent";
```

Replace the two `$derived.by` blocks (the comment "Prop type: prefer the sequence's intended prop..." through the end of `rightPropType`) with:

```ts
  // Prop pair: the sequence's recorded pair, else global settings, as a whole
  // (never mixed per hand). Shift+P still cycles performers whose sequence
  // recorded nothing.
  function activeSettings(): ActivePropSettings | null {
    try {
      return settingsService.settings;
    } catch {
      return null;
    }
  }
  const propPair = $derived(museumPropPair(resolvedSequence, activeSettings()));
  const leftPropType = $derived<PropType>(propPair.leftPropType);
  const rightPropType = $derived<PropType>(propPair.rightPropType);
```

Keep the `PropType` import if still used.

- [ ] **Step 7: Tests and type gate**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/museum`
Expected: PASS.
Run the branch type gate. Expected: `no errors in branch-touched files`.

- [ ] **Step 8: Commit**

```bash
git add -- src/lib/features/museum/services/museum-prop-pair.ts src/lib/features/museum/services/museum-prop-pair.test.ts src/lib/features/museum/scenes/procedural/components/PerformerPlatform.svelte src/lib/features/museum/components/game/MuseumPerformerStation3D.svelte
git commit -m "feat(museum): performers hold the sequence's recorded prop pair" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tunnel state and snapshot carry cat dog

**Files:**
- Modify: `src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts` (type ~46, zod ~188, `SnapshotDeps.settings` ~219, capture ~268, apply ~316)
- Modify: `src/lib/features/create/tunnel/state/tunnel-presentation-state.svelte.ts`
- Modify: `src/lib/features/create/tunnel/TunnelEditorSession.svelte` (~93)
- Test: `src/lib/features/create/tunnel/state/tunnel-presentation-state.test.ts`, `src/lib/shared/sequence-viewer/tunnel/__tests__/tunnel-snapshot.test.ts`

Tunnel keeps its own pair per tunnel and never writes global settings. `animationSettings.setCurrentPropType` is animation-engine state only.

- [ ] **Step 1: Write the failing state tests**

In `tunnel-presentation-state.test.ts`, add `catDogMode: false` to the `props` of `savedSnapshot()` (the round-trip test uses `toEqual`, and capture now always writes the flag). Then add a helper and these tests inside the `describe`:

```ts
  function freshState(
    overrides: Partial<Parameters<typeof createTunnelPresentationState>[0]> = {}
  ) {
    return createTunnelPresentationState({
      effects: createEffectsConfigState(undefined, { persist: false }),
      visibility: new AnimationVisibilityStateManager({ ephemeral: true }),
      animationSettings: createAnimationSettingsState({ ephemeral: true }),
      initialLeftPropType: "staff",
      initialRightPropType: "staff",
      initialLeftBuugengFlipped: false,
      initialRightBuugengFlipped: false,
      ...overrides,
    });
  }

  it("picks per hand while cat dog is on", () => {
    const state = freshState();
    state.toggleCatDog();
    state.selectPropHand("right");
    state.setPropType("fan");
    expect([state.leftPropType, state.rightPropType]).toEqual(["staff", "fan"]);
    expect(state.addressedPropType).toBe("fan");
    state.selectPropHand("left");
    state.setPropType("club");
    expect([state.leftPropType, state.rightPropType]).toEqual(["club", "fan"]);
  });

  it("sets both hands while cat dog is off", () => {
    const state = freshState();
    state.setPropType("fan");
    expect([state.leftPropType, state.rightPropType]).toEqual(["fan", "fan"]);
  });

  it("folds the right hand to the left when cat dog turns off", () => {
    const state = freshState();
    state.toggleCatDog();
    state.selectPropHand("right");
    state.setPropType("fan");
    state.toggleCatDog();
    expect(state.catDog).toBe(false);
    expect([state.leftPropType, state.rightPropType]).toEqual([
      "staff",
      "staff",
    ]);
    expect(state.propHand).toBe("left");
  });

  it("exposes handProps shaped for HandPropToolbar", () => {
    const state = freshState();
    state.handProps.onToggleCatDog();
    state.handProps.onHandChange("right");
    expect(state.handProps).toMatchObject({
      catDog: true,
      hand: "right",
      leftPropType: "staff",
      rightPropType: "staff",
    });
  });

  it("starts a new tunnel from the settings pair and flag", () => {
    expect(freshState({ initialCatDogMode: true }).catDog).toBe(true);
    expect(
      freshState({ initialRightPropType: "fan", initialCatDogMode: false }).catDog
    ).toBe(true);
  });

  it("round-trips the flag through capture", () => {
    const state = freshState();
    state.toggleCatDog();
    expect(state.capture().props.catDogMode).toBe(true);
  });

  it("infers the flag for an old snapshot without one", () => {
    const snapshot = savedSnapshot();
    delete (snapshot.props as { catDogMode?: boolean }).catDogMode;
    snapshot.props.rightPropType = "fan";
    const state = freshState({ initialSnapshot: snapshot });
    state.attachController(controllerFor());
    expect(state.catDog).toBe(true);
    expect(state.capture().props).toMatchObject({
      leftPropType: "buugeng",
      rightPropType: "fan",
      catDogMode: true,
    });
  });
```

- [ ] **Step 2: Write the failing snapshot tests**

Open `src/lib/shared/sequence-viewer/tunnel/__tests__/tunnel-snapshot.test.ts`, read how it builds `SnapshotDeps` and fixtures, and add:

1. A capture test: deps whose `settings` has `leftPropType: "staff"`, `rightPropType: "fan"` and no `catDogMode` capture `props.catDogMode === true`; with equal hands and `catDogMode: true` capture `true`; with equal hands and no flag capture `false`.
2. An apply test: applying a snapshot whose props lack `catDogMode` and whose hands differ calls `settings.updateSettings` with `catDogMode: true`; a snapshot with `catDogMode: true` and equal hands passes `catDogMode: true`.
3. A schema test: `TunnelSnapshotSchema` accepts a snapshot with `props.catDogMode: true` and one without it.

Update any existing `toEqual` expectation on a captured snapshot to include the new `catDogMode` value.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/tunnel/state src/lib/shared/sequence-viewer/tunnel`
Expected: FAIL (`toggleCatDog is not a function`, missing `catDogMode`).

- [ ] **Step 4: Snapshot changes**

In `TunnelSnapshot.props` add after `rightPropType`:

```ts
    /** Optional for snapshots saved before per-hand Tunnel props. A missing
     * flag is inferred from the hands on load. */
    catDogMode?: boolean;
```

In the zod `props` object add `catDogMode: z.boolean().optional(),`.

In `SnapshotDeps.settings` add `catDogMode?: boolean;` to the readable fields and `catDogMode?: boolean;` to the `updateSettings` patch type.

In `captureTunnelSnapshot`, `props` gains:

```ts
      catDogMode:
        (settings.catDogMode ?? false) ||
        settings.leftPropType !== settings.rightPropType,
```

In `applyTunnelSnapshot`, the `settings.updateSettings({ ... })` call gains:

```ts
    catDogMode:
      (snap.props.catDogMode ?? false) ||
      snap.props.leftPropType !== snap.props.rightPropType,
```

`ArtPane.svelte` builds capture-only deps without `catDogMode`; the inference covers it, so leave ArtPane alone.

- [ ] **Step 5: State changes**

In `tunnel-presentation-state.svelte.ts`:

Imports:

```ts
import type { HandPropToolbarProps } from "$lib/shared/settings/components/tabs/prop-type/HandPropToolbar.svelte";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
```

Input (add to `TunnelPresentationInputs` after `initialRightPropType`):

```ts
  /** The settings flag for a new tunnel. Saved tunnels use their snapshot. */
  initialCatDogMode?: boolean;
```

After the `rightBuugengFlipped` `$state` declarations add:

```ts
  // Differing hands mean cat dog, whatever an older flag says.
  let catDog = $state(
    (initialSnapshot
      ? (initialSnapshot.props.catDogMode ?? false)
      : (inputs.initialCatDogMode ?? false)) || leftPropType !== rightPropType
  );
  let propHand = $state<"left" | "right">("left");
```

In `propSettings`, add a getter and handle the flag in `updateSettings`:

```ts
    get catDogMode() {
      return catDog;
    },
```

and at the end of `updateSettings(patch)`:

```ts
      if (patch.catDogMode !== undefined) catDog = patch.catDogMode;
      if (leftPropType !== rightPropType) catDog = true;
      if (!catDog) propHand = "left";
```

In the unattached `capture()` return, `props` gains `catDogMode: catDog,` after `rightPropType`.

Before `return {` of the factory add:

```ts
  function toggleCatDog(): void {
    catDog = !catDog;
    propHand = "left";
    if (!catDog) rightPropType = leftPropType;
    inputs.animationSettings.setCurrentPropType(leftPropType);
  }

  function selectPropHand(hand: "left" | "right"): void {
    if (catDog) propHand = hand;
  }
```

In the returned object add:

```ts
    get catDog() {
      return catDog;
    },
    get propHand() {
      return propHand;
    },
    /** The prop the picker grid shows as selected: the addressed hand's. */
    get addressedPropType() {
      return catDog && propHand === "right" ? rightPropType : leftPropType;
    },
    get handProps(): HandPropToolbarProps {
      return {
        catDog,
        hand: propHand,
        leftPropType: leftPropType as PropType,
        rightPropType: rightPropType as PropType,
        onToggleCatDog: toggleCatDog,
        onHandChange: selectPropHand,
      };
    },
    toggleCatDog,
    selectPropHand,
```

Replace `setPropType`:

```ts
    setPropType(propType: string) {
      if (catDog && propHand === "right") rightPropType = propType;
      else if (catDog) leftPropType = propType;
      else {
        leftPropType = propType;
        rightPropType = propType;
      }
      inputs.animationSettings.setCurrentPropType(leftPropType);
    },
```

- [ ] **Step 6: TunnelEditorSession**

In the `createTunnelPresentationState({ ... })` call, after `initialRightPropType`, add:

```ts
    initialCatDogMode: settingsService.settings.catDogMode ?? false,
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/tunnel src/lib/shared/sequence-viewer/tunnel src/lib/features/tunnel-collection`
Expected: PASS.

- [ ] **Step 8: Type gate**

Run the branch type gate. Expected: `no errors in branch-touched files`.

- [ ] **Step 9: Commit**

```bash
git add -- src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts src/lib/shared/sequence-viewer/tunnel/__tests__/tunnel-snapshot.test.ts src/lib/features/create/tunnel/state/tunnel-presentation-state.svelte.ts src/lib/features/create/tunnel/state/tunnel-presentation-state.test.ts src/lib/features/create/tunnel/TunnelEditorSession.svelte
git commit -m "feat(tunnel): per-tunnel cat dog flag, hand selector, and snapshot field" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tunnel picker and art view

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/art-settings/TunnelArtSettings.svelte`
- Modify: `src/lib/features/create/tunnel/components/TunnelLayout.svelte` (~156-160, ~295, ~342, ~497-498)

- [ ] **Step 1: TunnelArtSettings accepts handProps**

Imports:

```ts
  import HandPropToolbar, {
    type HandPropToolbarProps,
  } from "$lib/shared/settings/components/tabs/prop-type/HandPropToolbar.svelte";
  import { viewingPropLabel } from "$lib/shared/foundation/services/prop-viewing";
```

`Props` gains (after `onPropChange`):

```ts
    /** Per-hand picking for hosts that keep a local pair (Tunnel creator). */
    handProps?: HandPropToolbarProps;
```

and destructure `handProps,` in `$props()`.

The props rail entry's `summary` becomes:

```ts
            summary: handProps
              ? viewingPropLabel({
                  leftPropType: handProps.leftPropType,
                  rightPropType: handProps.rightPropType,
                  catDogMode: handProps.catDog,
                })
              : getPropTypeDisplayInfo(selectedPropType).label,
```

In the `id === "props"` section, render the toolbar above the grid:

```svelte
      {#if onPropChange}
        {#if handProps}
          <HandPropToolbar {handProps} />
        {/if}
        <BentoPropGrid
```

Update the comment above that section so it no longer claims the pick "updates both hands": say the chosen prop goes to `onPropChange`, which the host routes to the addressed hand.

- [ ] **Step 2: TunnelLayout passes the addressed prop and the pair**

In the `<TunnelArtSettings` props replace `leftPropType={propType}` with

```svelte
        leftPropType={creator.presentation.addressedPropType}
        handProps={creator.presentation.handProps}
```

In `<TunnelArtView` replace `leftPropType={propType}` and `rightPropType={propType}` with `{leftPropType}` and `{rightPropType}`.

If `propType` (line ~160) has no remaining uses, delete it. If something else still uses it, leave it.

- [ ] **Step 3: Tests and type gate**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/tunnel src/lib/shared/sequence-viewer`
Expected: PASS.
Run the branch type gate. Expected: `no errors in branch-touched files`.

- [ ] **Step 4: Commit**

```bash
git add -- src/lib/shared/sequence-viewer/components/art-settings/TunnelArtSettings.svelte src/lib/features/create/tunnel/components/TunnelLayout.svelte
git commit -m "feat(tunnel): Cat Dog chip and hand segments in the Tunnel prop picker" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Browser verification (controller, after all tasks)

Task dev server from the worktree on a free port (5192), staff/fan pair seeded in `tka-modern-web-settings`:

- Sequence viewer image tab draws staff left and fan right.
- Export panel static preview matches.
- Nav prop icon shows both props.
- A museum procedural platform draws the sequence's recorded pair.
- Tunnel: the Props section shows the Cat Dog chip and Left/Right segments, a right-hand pick changes only the right prop in the art view, and the pair survives a reload of the saved tunnel draft.
- Construct: picking only the right prop in the step editor leaves settings with `catDogMode: true`.
- Settings Props tab with cat dog off: picking a prop leaves `catDogMode: false` with both hands equal.
