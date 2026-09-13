# Accessibility and responsive-interaction audit — shared drawers, modals, popovers

Read-only audit of the shared dismissible surfaces (`Drawer`, `BaseModal`, the
filter-chip popovers) and the Create/Browse keyboard paths that run through
them. No runtime or CSS file was modified. The only files this task owns are
this report and the isolated browser suite under
`tests/opus-accessibility-audit/`.

| | |
| --- | --- |
| Base SHA | `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main`, clean tree at start) |
| Branch | `claude/accessibility-audit-shared-components-ma20hf` |
| Audit commits | `7ce96b42` (escape-ownership suite), `245f21a1` (chip/naming/focus-restore specs), `9b5b0c6f` (measurements + this report) |
| Owned paths | `docs/reports/opus-batch-2026-09-12/accessibility-audit.md`, `tests/opus-accessibility-audit/**` |
| Browser | headless Chromium 1194 (`/opt/pw-browsers/chromium`), Playwright 1.61.1, Vitest 4.0.18 browser mode |

## How to reproduce everything in this report

```bash
pnpm install --frozen-lockfile
AUDIT_CHROMIUM_PATH=/opt/pw-browsers/chromium \
  npx vitest run --config tests/opus-accessibility-audit/vitest.audit.config.ts
```

Result on the audited SHA, stable across repeated runs:

```
 Test Files  4 failed | 3 passed (7)
      Tests  6 failed | 10 passed (16)
```

Each failing spec is a finding below. Each passing spec is either a control that
isolates a cause or a behavior this audit verified as correct (§ Verified
correct).

`AUDIT_CHROMIUM_PATH` exists because this sandbox ships Chromium revision 1194
while `playwright@1.61.1` expects 1228's headless shell. **The project's own
`pnpm run test:components:ci` cannot run here for the same reason** — it fails
at `browserType.launch` before any test executes. The audit config mirrors
`tests/config/vitest.components.config.ts` and adds only the `executablePath`
override plus an audit-local `$app/environment` stub reporting `browser === true`
(the shared stub reports `false`, which makes the app's browser-only service
getters throw). The shared stub is untouched.

## Claim types used below

- **Measured** — observed in the live Chromium page in this session.
- **Source** — read directly from the repository at the base SHA.
- **Inferred** — reasoning over measured + source evidence; labelled where used.

No screen-reader or physical-device validation was performed and none is claimed.

---

## Findings

Ordered by user impact. Every finding is reproducible from the command above.

### F1 — Escape inside an open Drawer closes the whole sheet, even while a text field owns the key

**Severity: high — keyboard users lose sheet state on a routine keystroke.**

- **Route / steps:** `/browse` → open the **Filters** sheet → focus its search
  field (`GalleryDrill.svelte:578-586`, `<input type="search" aria-label="Search
  sequences">`) → press <kbd>Esc</kbd>. The entire Filters sheet dismisses. The
  drill inside it is remounted per open (`GalleryFilterSheet.svelte:49-53`,
  `epoch`), so the user's place in the category drill is gone too.
- **Contract violated:** `docs/architecture/escape-routing.md`, ownership rule 1
  — *"Browser fullscreen and a focused input or popup keep the first Escape
  press."*
- **Cause (source):** `Drawer.svelte:485-497` installs a window-level
  `handleKeydown` that closes the drawer on Escape whenever it is the top
  *drawer*. It never consults `shouldDeferEscapeShortcut(document)` — the exact
  guard its sibling `handleDialogCancel` at `Drawer.svelte:504-516` does apply.
  The global escape owner correctly steps aside for the focused input
  (`register-escape-shortcut.ts:27`, `escape-shortcut-target.ts`
  `LOCAL_ESCAPE_OWNER_SELECTOR` includes `input`), and the drawer's own handler
  then takes the key nobody intended it to have.
- **Evidence (measured):** `escape-ownership.audit.test.ts` →
  *"leaves a focused text input inside a Drawer owning the first Escape press"* —
  fails; the drawer's `data-state` is `closed` after one Escape.
- **Bounded fix:** add the same guard `handleDialogCancel` already uses to
  `handleKeydown`:
  `if (shouldDeferEscapeShortcut(document)) return;` — one line, same import
  already present at `Drawer.svelte:25`.

### F2 — With a modal open over a drawer, Escape dismisses the drawer underneath and leaves the modal open

**Severity: high — Escape acts on the wrong layer, and the layer the user is looking at does not respond at all.**

- **Route / steps:** any flow where a `BaseModal` opens while a `Drawer` is
  already open — e.g. `/browse` collections sheet → a rename/confirm modal;
  `/create` step-editor drawer → a confirm modal. Press <kbd>Esc</kbd>. The
  sheet behind closes; the modal stays.
- **Contract violated:** `escape-routing.md` rules 2 and 3 — *"The most recently
  opened registered modal or drawer claims the key"* and *"one Escape press
  never closes two layers."* It does worse than closing two: it closes the wrong
  one.
- **Cause (source + measured):** three things compose.
  1. `Drawer.svelte:485-497` arbitrates only against the **drawer** stack
     (`isTopDrawer`, `drawer-stack.ts`). Modals live in a separate stack
     (`modal-stack.ts`), so an open drawer still believes it is the top layer
     while a modal sits above it.
  2. That handler calls `event.preventDefault()` (`Drawer.svelte:494`), which
     cancels the browser's dialog close request — the only Escape path
     `BaseModal` has in this situation.
  3. The shared arbiter that would have resolved this is out of play: both
     surfaces register with `EscapeLayerManager`, but the global `global.escape`
     shortcut never runs for a key pressed inside a `BaseModal`, because
     `BaseModal.svelte:298` carries `data-keyboard-shortcuts-ignore` and
     `keyboard-event.ts:139` short-circuits every shortcut under that marker.
- **Evidence (measured):** `escape-ownership.audit.test.ts`
  - *"control: a BaseModal on its own closes on Escape from a focused field"* —
    **passes**. BaseModal's own path is sound.
  - *"stacked modal is the layer dismissed — focus on a button in the modal"* and
    *"— focus in the modal's text field"* — both fail with
    `{"modalStillOpen":true,"drawerDismissed":true}`. The failure does not depend
    on what is focused inside the modal; it depends on a drawer being open
    underneath.
  - The same spec asserts, and observes, that the Escape keydown arrives at a
    late window listener already `defaultPrevented` — the key was consumed
    before the browser could raise the dialog's close request.
- **Bounded fix:** make `Drawer.handleKeydown` defer unless this drawer is the
  top layer of the *shared* registry it already registers with
  (`drawer-stack.ts:63` calls `getEscapeLayerManager().register`). Either check
  the shared manager, or delete the window handler entirely and let the
  registered escape layer be the single owner — which is what
  `escape-routing.md` describes ("`BaseModal` and `Drawer` register
  automatically while open").

### F3 — A bare Arrow key pressed inside an open Drawer dismisses the drawer

**Severity: high on `/create` — arrow keys are how a keyboard user moves through the options a sheet exists to present.**

- **Route / steps:** `/create` with any drawer open — the prop picker
  (`PropSelectionSheet.svelte`, reached from `StepEditorCoordinator.svelte:575`),
  the generation settings drawer, the save prompt — focus any control inside it
  and press <kbd>→</kbd>. The sheet dismisses.
- **Cause (source):**
  - `keyboard-shortcut-manager.ts:295` — `if (shortcut.isSingleKey &&
    !shortcut.preserveDrawers && hasOpenDrawers()) dismissTopDrawer();` runs
    before any matching single-key shortcut executes.
  - `BaseModal` opts its whole subtree out of the shortcut system with
    `data-keyboard-shortcuts-ignore` (`BaseModal.svelte:298`, asserted by
    `BaseModal.svelte.test.ts:46`). **`Drawer.svelte` carries no such marker**,
    so keys pressed inside a drawer still reach the global manager.
  - Create registers bare `ArrowUp/Down/Left/Right` as single-key shortcuts with
    `modifiers: []` and no `preserveDrawers`
    (`register-create-shortcuts.ts:131, 153, 173, 192`); their actions are
    still stubs (`debug.log(... "not yet implemented")`), so the *only* visible
    effect of pressing an arrow on `/create` with a sheet open is that the sheet
    disappears. `enableSingleKeyShortcuts` defaults to `true`
    (`shortcut-settings-codec.ts:15`), and
    `KeyboardShortcutCoordinator.svelte:48` registers these on every session.
  - Concretely reachable inside the prop sheet: its Left/Right hand switcher is
    a `role="tablist"` (`PropSelectionSheet.svelte:150-178`), and arrow keys are
    the APG-standard way to move between its tabs.
- **Evidence (measured):** `drawer-single-key-shortcuts.audit.test.ts` — a
  shortcut registered through the real `KeyboardShortcutManager` with the exact
  shape of `create.grid-nav-right` dismisses the real `Drawer` when
  <kbd>→</kbd> is pressed on a control inside it.
- **Bounded fix:** add `data-keyboard-shortcuts-ignore` to the `<dialog>` in
  `Drawer.svelte:618-637`, mirroring `BaseModal`. One attribute; the equivalent
  behavior on `BaseModal` is already regression-tested.

### F4 — The Browse filter-chip popovers cannot be dismissed from the keyboard

**Severity: medium-high — a keyboard user who opens a filter popover has no Escape path out of it.**

- **Route / steps:** `/browse` → the filter chip row above the gallery grid →
  focus the **Length** (or Level, LOOP, Max turn intensity) chip → <kbd>Enter</kbd>
  to open → <kbd>Esc</kbd>. Nothing happens.
- **Cause (source):** `FilterChipBase.svelte:258` sets `aria-expanded` in
  dropdown mode. `[aria-expanded='true']` is in
  `escape-shortcut-target.ts` `LOCAL_ESCAPE_OWNER_SELECTOR`, so the global escape
  owner deliberately defers the key to the widget — but no chip implements the
  handler it deferred to. All four dropdown chips dismiss on `pointerdown`
  outside the wrapper and on nothing else:
  `LengthFilterChip.svelte:55-66` (`handlePointerDownOutside` + its `$effect`), and the same construction in
  `LevelFilterChip.svelte`, `LOOPFilterChip.svelte`,
  `MaxTurnIntensityFilterChip.svelte` (verified: zero occurrences of `Escape` in
  any of the four).
- **Evidence (measured):** `filter-chip-popover-dismissal.audit.test.ts` — after
  <kbd>Esc</kbd> the trigger still reports `aria-expanded="true"` and the
  `role="listbox"` panel is still mounted.
- **Bounded fix:** handle Escape once in `FilterChipBase` (it owns the popover
  and already owns `expanded`): on Escape, call the consumer's toggle and return
  focus to the trigger button. Four call sites then inherit it, and the second
  duplicated implementation that `.claude/rules/never-hand-roll.md` warns about
  is avoided.

### F5 — Shared dialog surfaces ship without accessible names

**Severity: medium — WCAG 2.1 SC 4.1.2. Assistive tech announces a bare "dialog".**

- **Route / steps:** `/browse` → **Filters** sheet; `/create` → the save-prompt
  confirm. Both are `aria-modal="true"` dialogs with a visible `<h2>` title and
  no accessible name.
- **Cause (source):** `Drawer.svelte:630-632` forwards only `labelledBy` /
  `ariaLabel`; `BaseModal.svelte:306` forwards only `labelledBy`. Neither derives
  a name from the header the consumer already renders, and
  `DrawerHeader.svelte:92` gives its `<h2>` **no `id`**, so a consumer has
  nothing to point `aria-labelledby` at without hand-writing one.
- **Consumers with neither prop (source census at base SHA):** a file-level grep
  over the 57 files rendering `<Drawer` and the 54 rendering `<BaseModal` found
  12 and 6 respectively with no `labelledBy`/`ariaLabel`/`aria-label` anywhere in
  the file. (File-level, so it is a lower bound on named consumers and an upper
  bound on unnamed instances; each name below was then confirmed by reading the
  component.) The ones on the audited routes:
  - `src/lib/features/browse/gallery-home/GalleryFilterSheet.svelte:88` (Browse Filters)
  - `src/lib/features/browse/shared/components/GalleryTab.svelte:97` (Browse sort/jump)
  - `src/lib/features/browse/collections/components/AllLibraryView.svelte`
  - `src/lib/features/create/shared/components/dialogs/SavePromptDialog.svelte:40` (Create save confirm)
  - `src/lib/shared/sequence-viewer/components/SequenceDrawer.svelte`
  - `src/lib/shared/navigation/components/account/MyPropsDrawer.svelte`
- **Evidence (measured):** `dialog-accessible-name.audit.test.ts` reproduces
  `GalleryFilterSheet`'s exact composition and resolves the dialog's
  author-supplied name to `""` while its `<h2>` reads `"Filters"`.
- **Worth noting:** `axe-sweep.audit.test.ts` runs the project's own AAA axe
  helper over the same markup and reports **no violations** — axe's
  `aria-dialog-name` rule matches `[role="dialog"]`, not a native `<dialog>`
  element. This class of defect will not be caught by the existing component
  suite; it needs the explicit check.
- **Bounded fix:** have `DrawerHeader` mint an id for its `<h2>` (Svelte 5
  `$props.id()`) and publish it, then let `Drawer` fall back to it; or give
  `Drawer`/`BaseModal` a `title` prop that populates `aria-label` when no
  `labelledBy` is supplied. Either keeps the name with the primitive instead of
  asking 18 consumers to remember.

---

## Latent defects (no current consumer triggers them)

Reported because each will fail silently the first time it is used. Neither has
a test in this suite; both are source findings.

### L1 — `Drawer`'s `role` prop is accepted and silently dropped

`Drawer.svelte:43` and `:81` declare `role?: "dialog" | "menu" | "listbox" |
"alertdialog"` (default `"dialog"`), but the `<dialog>` markup at
`Drawer.svelte:618-637` never applies it. A consumer asking for `alertdialog` —
the correct role for `SavePromptDialog`'s "save before you proceed?" confirm —
gets a plain dialog. Verified: zero consumers currently pass `role`, so there is
no live regression. Fix: apply `role={role}` to the `<dialog>`, or delete the
prop.

### L2 — `EscapeLayerManager` latches `dismissing` and never clears it

`EscapeLayerManager.ts:16-21` tracks a per-layer `dismissing` flag;
`dismissTopLayer()` (`:42-48`) sets it to `true` before calling `dismiss()` and
nothing ever resets it. A layer whose dismiss is vetoed — a sheet with an
"unsaved changes" guard that declines to close — would never respond to Escape
again for the life of that registration, because re-registration only happens on
close/reopen and it never closes. Every current `onOpenChange` handler closes
unconditionally, so this is latent. Fix: clear `dismissing` when the dismiss call
returns without the layer unregistering, or drop the flag and rely on
`canDismiss()`.

---

## Verified correct

Behavior this audit exercised and found sound. These specs pass and are worth
keeping as regression cover.

| Behavior | Evidence |
| --- | --- |
| Focus returns to the trigger button after a `Drawer` closes | `focus-restore.audit.test.ts` (measured) |
| Focus returns to the trigger button after a `BaseModal` closes | `focus-restore.audit.test.ts` (measured) |
| Drawer over drawer: one Escape dismisses the inner sheet only | `escape-ownership.audit.test.ts` (measured) |
| A lone `BaseModal` dismisses on Escape from a focused field | `escape-ownership.audit.test.ts` (measured) |
| `DrawerHeader` close button meets the 44px pointer floor | measured `44 × 44` at a 375×667 viewport |
| Every filter-chip popover row meets the 44px pointer floor | measured `150 × 44` for all four rows |
| Reduced motion is honored by both primitives | `Drawer.css:499-535` and `modal-tokens.css:370-396` disable transitions, animations, `transition-behavior` and `@starting-style` (source); `Drawer.svelte:409-420` and `:441-447` additionally skip the RAF/timer choreography (source) |
| Swipe-to-dismiss defers to scrollable content | `swipe-to-dismiss.ts:126-184` only arms dismissal at the scroll boundary in the dismiss direction, per placement (source) |
| Axe (WCAG AAA tag set) over the drawer and chip-popover surfaces | `axe-sweep.audit.test.ts`: zero violations |

### Contrast, measured with the app's real theme

Taken with `src/app.css` loaded and `applyThemeForBackground(BackgroundType.COSMIC)`
applied — the shipped default (`background-theme-calculator.ts:getSavedBackgroundType`
falls back to `COSMIC`) — at a 375×667 CSS viewport.

| Text | Colour | Composited background | Size | Ratio | AA floor |
| --- | --- | --- | --- | --- | --- |
| `DrawerHeader` subtitle | `rgba(255,255,255,0.75)` | `rgb(15,15,20)` | 14px / 400 | **10.85:1** | 4.5 |
| Chip popover option count | `rgba(255,255,255,0.75)` | `rgb(18,20,28)` | 14px / 400 | **10.57:1** | 4.5 |
| Chip popover option label (selected) | `rgb(245,158,11)` | `rgb(18,20,28)` | 14px / 600 | **8.56:1** | 4.5 |

All three clear AAA (7:1) as well. No contrast finding is raised for these
surfaces.

**Honest limit on the contrast numbers.** These are composited from computed
`background-color` layers only. The drawer surface is opaque
(`--sheet-bg: rgb(15,15,20)`) so its reading is exact. The chip popover paints a
`linear-gradient` of `--theme-panel-bg` over an opaque `#12141c`
(`FilterChipBase.svelte:450-466`); the helper reports `sawBackgroundImage: true`
for it and samples the opaque base, which is the worst case for a dark wash over
a dark base — the real painted value is within a few percent, not better than
reported. Contrast against the authenticated app's *animated* background art was
not measured; the surfaces above are all opaque or near-opaque over it, so the
art does not reach the text.

---

## Scope covered and not covered

**Covered:** `Drawer`, `BaseModal`, `DrawerHeader`, `FilterChipBase` +
`ChipPopoverOption` and the four Browse dropdown chips, the escape/keyboard
arbitration stack (`EscapeLayerManager`, `KeyboardShortcutManager`,
`drawer-stack`, `modal-stack`, `escape-shortcut-target`), `FocusTrap` /
`FocusRestore`, and the Create/Browse consumers named in each finding.

**Not covered, and not claimed:**

- Screen-reader behavior. `aria-modal`, roles and names were read and, where
  testable, computed; nothing was validated with NVDA/JAWS/VoiceOver.
- Physical touch devices. Touch targets are CSS-pixel measurements at a
  375×667 emulated viewport.
- The full seven-viewport visual matrix in
  `.claude/rules/visual-verification-mandatory.md`. This audit changed no
  rendered surface, so that gate does not apply; the measurements above were
  taken at the 375×667 tier only.
- `AuthModal`'s `allowExternalOverlays` mode (`BaseModal.svelte:222`,
  `FocusTrap` with `setInertOnSiblings: false` and `focusContainerOnInitial`).
  Reading `focus-trap.ts:215-251` suggests Shift+Tab from the dialog container
  can step outside the trap for one stop before the next Tab pulls it back —
  **inferred, not measured**, and deliberately left unverified because the auth
  flow needs credentials this session does not have.
- The 3D control popovers (`CameraPopover`, `EffectsPopover`, …) and the
  sequence-viewer popovers. Out of the Create/Browse scope of this brief.

## Notes for whoever picks up the fixes

F1, F2 and F3 all trace to the same seam: `Drawer.svelte:485-497` is a second,
private Escape/keyboard owner living beside the shared one that
`escape-routing.md` describes and that the drawer already registers with. The
cheapest coherent fix is to make `Drawer` a pure participant in the shared
registry — add `data-keyboard-shortcuts-ignore` to its `<dialog>` (F3), and
either guard or remove the window handler (F1, F2). The audit suite is written so
those three specs flip to green without being weakened.
