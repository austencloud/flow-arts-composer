> Archived 2026-10-14: Matching scope is recorded in `docs/superpowers/specs/shipped/2026-07-17-poi-legal-composer-filtering-design.md`.

# Poi Picker Activation + Session State — Handoff (2026-07-18)

## Mission

Make the **poi-legal composer filter** usable end-to-end by surfacing **poi**
as a selectable prop in the composer's prop picker, gated to dev/admin so the
public app still treats poi as "planned." This is the last wiring gap in the
poi-legal-composer-filtering project — the filter logic and its option-picker
wiring already shipped; nothing could *trigger* it because poi was never
selectable in the UI.

- Design spec: `docs/superpowers/specs/active/2026-07-17-poi-legal-composer-filtering-design.md`
- Plan: `docs/superpowers/plans/2026-07-18-poi-legal-composer-filtering.md`
- Project memory: `project_poi_legal_composer_filtering` (updated this session)

Secondary artifact from the same arc: a standalone Svelte 5 + TS clone of
[tiffanyfong/PoiNotation](https://github.com/tiffanyfong/PoiNotation) at
`C:/poi-notation` — an epicyclic poi-trail visualizer (petals = |armRevs −
poiRevs|). Candidate poi trail renderer for the Poi Lab later.

## Done — verified

1. **Poi is selectable in the flat prop picker, dev/admin-gated.**
   Commit **`85e12c5586`** on `origin/main` (pushed: `c53fbeadce..85e12c5586`).
   - Files: `src/lib/shared/pictograph/prop/domain/prop-type-display-registry.ts`
     (added `PropType.POI` to `PROP_PICKER_SECTIONS` Novelty; updated the
     docstring + the `DEACTIVATED_PROP_TYPES` comment) and
     `src/lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte`
     (added `poiPickerEnabled = $derived(import.meta.env.DEV || isAdmin())` and
     a per-prop filter special-casing poi).
   - Design of the gate: poi **stays** in `DEACTIVATED_PROP_TYPES` (so the
     category pickers and `getBasePropsByCategory` remain poi-free everywhere);
     `BentoPropGrid` — verified the **sole** consumer of `PROP_PICKER_SECTIONS`
     — re-includes poi only when dev/admin. Same gate as the filter itself
     (`isPoiComposerFilterEnabled` in
     `src/lib/features/levels/poi-lab/services/apply-poi-legal-filter.ts`).
   - Evidence — typecheck: `npm run check` exit 0; grep of the log shows
     `svelte-check found 1 error and 1 warning in 2 files`, and **both are in
     `src/routes/test/composer-wings/`** (another session's untracked scaffold,
     `+page.svelte:35` "Cannot invoke an object which is possibly 'undefined'"),
     **zero** diagnostics in the two changed files.

2. **Poi filter logic is proven.** 7/7 unit tests.
   - Evidence: `npx vitest run tests/unit/poi-lab/poi-option-filter-decorator.test.ts`
     → `Test Files 1 passed`, `Tests 7 passed`, 5ms.

3. **Main app build is healthy on `:5173`** (Austen's dev server).
   - Evidence: `curl -sk https://localhost:5173/` → HTTP 200, 271 KB, 0.9s;
     `curl .../composer` → HTTP 200. The earlier "broken build" was **RAM
     starvation** (a concurrent 3 GB `svelte-check` from another session; free
     RAM hit ~2.5 GB), not code. Resolved once that check finished.

4. **poi-notation clone builds + runs.**
   - Evidence: `cd /c/poi-notation && npx vite build` → 122 modules, 535ms,
     0 errors. Dev server on `:7764` returned HTTP 200 (4.5ms).

## Believed done — unverified

- **The live composer filtering behavior** (select poi → illegal next-moves
  disappear from the Construct option grid). Typecheck + unit tests +
  reactivity analysis all say it works (`PROP_LOCKING_ENABLED` is `false` so
  poi is clickable; `getSettings()` returns the reactive settings object so the
  `filteredOptions` derived re-runs on prop change), but it was **NOT** opened
  in a live browser this session. **This is loose end #1.**

## In flight

- **Mine: nothing uncommitted.** The two poi-picker files are committed and
  pushed (`85e12c5586`). Working tree has no changes of mine.
- **Other sessions' WIP in the shared checkout — DO NOT TOUCH or commit:**
  `src/routes/test/composer-wings/*` (owns the 1 svelte-check error above),
  `src/routes/test/landing-directions/`, `src/routes/test/mandala-pick/`,
  `tests/unit/landing-directions-contract.test.ts`, plus the pre-existing
  modified files from session start (arrow-positioning expert md,
  float-rotation-maps, composer/glossary routes, HandPathFloatSeparation test).
  These belong to parallel sessions; scope every commit with an explicit
  pathspec.
- **A dev server this session spawned: poi-notation on `:7764` (was PID 64032).**
  Being reaped as part of this handoff since the laptop is being closed. If it
  outlives the session, `Stop-Process` it.

## Loose ends (ranked)

1. **Verify the live filter in a browser.** Open `https://localhost:5173/`,
   Settings → Prop Type → Novelty → **Poi**, then Create → Construct, pick a
   start position, confirm the option grid shows **fewer** options than with
   Staff. This is the one unproven claim.
2. **Real `poi.svg` glyph.** Poi still borrows `club.svg` as its picker icon
   (`prop-type-display-registry.ts:177`). It renders as a club labeled "Poi".
3. **Public exposure stays deferred deliberately** — poi is dev/admin-gated on
   purpose (Austen's "poi is planned publicly" stance). Do not un-gate without
   his say.
4. **Poi trail renderer** — the `C:/poi-notation` epicyclic visualizer is the
   candidate. The `pro/anti ↔ inspin/antispin` correspondence is the bridge
   between TKA motion terms and poi-native terms.
5. **VTG terminology in the picker; dual-hand phase modeling** — still deferred.

## Decisions already made (this session, 2026-07-18)

- Austen: **"add poi i'll try it out"** → activate poi in the picker for a
  hands-on tryout. Done, gated.
- Austen: **"stop calling it POI, it's not an acronym"** → write **poi**
  lowercase in prose/UI/labels. The `PropType.POI` enum constant stays as code.
- Austen (earlier today): worktree mandate reversed → **work on main directly,
  commit + push frequently** (`.claude/rules/worktree-workflow.md`,
  `feedback_merge_to_main_when_done`).
- The poi-legal filter is **dark-gated** (`import.meta.env.DEV || isAdmin()`);
  the picker uses the identical gate.

## Gotchas

- **`svelte-check` exit 0 is misleading** — always grep the log for
  `found N error`. The current 1 error is NOT from this change; it's in another
  session's untracked `src/routes/test/composer-wings/+page.svelte:35`.
- **Shared checkout, many live sessions.** Commit ONLY your files with an
  explicit pathspec (`git commit -- <paths>`). Do **not** `git stash` (it grabs
  other sessions' work). `git pull --rebase` fails while another session has
  unstaged changes — commit your scoped files first, then push; a plain push
  fast-forwarded fine this session.
- **"Broken build" was RAM starvation, not code.** Before diagnosing `:5173`
  slowness, check free RAM + concurrent `svelte-check` count (`resource-budget`
  rule). The machine dipped to ~2.5 GB free with a 3 GB check running; pages
  took 9–17s and read as hung.
- **Native canvas is broken on the C: machine** (memory
  `reference_canvas_native_broken_c_machine`) — a fresh worktree couldn't boot
  the full app earlier (std::terminate). On main + `:5173` it serves fine.
- **`C:/poi-notation` is not git-tracked** (standalone throwaway) and serves
  **HTTP** (plain vite, no cert) — link it as `http://localhost:7764/`, not
  https.
- **Prop selection is per-hand** (`settings.bluePropType`/`redPropType`). In
  non-cat-dog mode, picking poi sets BOTH hands to poi; the filter runs
  per-hand. If the grid doesn't refresh on prop change, re-pick the start
  position to force `getFilteredOptions()`.
- **Expert agents:** no update made. The change is a UI picker activation +
  gate, not prop-positioning canon (base placement / rotation / beta offsets /
  classification), so `prop-positioning-expert` was left untouched deliberately.

## Where things live / quick links

- Filter wiring: `apply-poi-legal-filter.ts`, decorator
  `src/lib/features/levels/poi-lab/services/poi-option-filter-decorator.ts`,
  consumed in `option-picker-state.svelte.ts` (`filteredOptions` derived) via
  `OptionPicker.svelte`.
- Picker UI: `BentoPropGrid.svelte` ← `PropTypeTab.svelte` (Settings) and the
  mobile dock. Option grid: `ConstructTabContent.svelte` (Create → Construct).
- Registry: `prop-type-display-registry.ts` (`PROP_PICKER_SECTIONS`,
  `DEACTIVATED_PROP_TYPES`, `isPropActive`).
