> Archived 2026-10-14: Matching scope is recorded in `docs/superpowers/specs/shipped/2026-07-29-endless-spinner-rebuild-design.md`; later `docs/superpowers/handoffs/2026-07-30-endless-spinner-rebuild-handoff.md` retains rollout/cleanup follow-ups.

# Endless Spinner 4K Standards Pass — Handoff (2026-07-28)

> **Status 2026-07-29: SUPERSEDED.** The 4K pass landed as `6277d794a2`, and the
> page was then rebuilt ground-up per
> [`2026-07-29-endless-spinner-rebuild-design.md`](2026-07-29-endless-spinner-rebuild-design.md)
> (plan: `docs/superpowers/plans/2026-07-29-endless-spinner-rebuild.md`). The
> rebuild retired Live mode (its backend no longer exists), made Infinite the
> default, and answered this document's remaining open questions: the route now
> SHIPS in production builds (feature-flag promotion `804f29acb9`) and the
> chrome-less navigation stays, with the button-styled Home link. Nothing here
> remains actionable.

## Mission

Bring `/endless-spinner` from its current repair/redesign pass to the codebase's shipping standard, including correct page-scoped animation state, continuous 4K scaling, stable mode changes, complete UX states, and the required responsive visual proof. Preserve the three source modes and the route-owned controls defined by the shipped [Endless Playback Unification design](shipped/2026-05-20-endless-playback-unification-design.md). Austen requested the source audit and Fable's second review on 2026-07-28.

## Done — verified

- The current dirty spinner tree was audited against the codebase rules. Reference base commit: `1df03747142ba462c72c7669574ab03da46fbef0`. The corrected tracker record was written at `2026-07-28T17:45:22.202Z`. Evidence: `npx -p @austencloud/code-quality ac-audit status "features/landing/components"` reported Architecture C, Code Quality B, Svelte 5 A+, Accessibility B, UX States C, UI Consistency F, Performance A, Security A+, and 12 findings. The tracker has no route-level target, so this record is stored under the closest canonical landing-components target while covering the route and its local components.
- Fable completed a read-only source review. Fable retracted the proposed replacement of `SpinnerControls` with `AnimationPanel`, reframed the controller finding around global instance selection rather than factory injection, added the variable-height mode-info layout shift, and strengthened the 4K finding with the missing root ramp. Evidence: the shipped design's section 10 preserves `SpinnerControls`, the mode toggle, stats, debug panel, and `StepGrid`; `src/routes/+layout.svelte:167-193` excludes `/endless-spinner` from `MARKETING_EXACT`; `src/app.css:758-771` scopes the continuous 4K root ramp to `.mkt-shell` and `.legal-container`; `src/routes/endless-spinner/+page.svelte:921-983` instead enlarges selected values at a 2600px step.
- Targeted animation-engine tests pass against the dirty tree. Evidence: `pnpm exec vitest run tests/unit/animation-engine/endless-playback-state.test.ts tests/unit/animation-engine/sequence-chaining-orchestrator.test.ts` returned 2 test files passed and 20 tests passed.
- Spinner CSS passes the targeted style check. Evidence: `pnpm exec stylelint "src/routes/endless-spinner/**/*.svelte" "src/lib/features/landing/components/{InfiniteModeInfo,LibraryModeInfo,LiveModeInfo,SpinnerModeToggle,SpinnerStatsBar}.svelte"` exited 0 with no findings.
- The spinner diff has no whitespace errors. Evidence: `git diff --check -- <the 14 spinner paths listed below>` exited 0.
- Austen's HTTPS development server serves the route. Evidence: `curl.exe -k -s -o NUL -w "HTTP %{http_code}" https://localhost:5173/endless-spinner` returned `HTTP 200`.

No source fix from this audit/review turn is committed. The evidence above applies to the dirty tree described below, not a shippable commit.

## Believed done — unverified

- The first repair pass adds substantial route, chaining, state, and responsive work. The two focused test suites verify the covered state-machine behavior, but they do not verify Library, Infinite, and Live mode behavior through the rendered page.
- The route has explicit desktop, 2600px, mobile, and short-horizontal CSS. Its actual composition is not visually verified. Required screenshots and measurements are missing at 1920×1080, 2560×1440, 3840×2160, 1440×900, 820×1180, 960×412, and 375×667.
- Chrome DevTools MCP was unavailable in this session. `codex mcp list` exposed only `flow-arts` and `node_repl`, so the mandated browser sweep could not run. Do not infer visual quality from the HTTP response, tests, or CSS arithmetic.
- Live broadcast synchronization, clipboard success and failure feedback, source-empty behavior, reduced-motion behavior, and navigation intent remain unverified end to end.

## In flight

Work is on `main` in the primary checkout. No branch or worktree was created.

At handoff preparation, the base commit was `1df03747142ba462c72c7669574ab03da46fbef0`; `origin/main` was `8c85236ff11e5c5b5a015c28cded2b8919cc1686`. Two unrelated commits were already ahead of the remote:

- `1df0374714 fix(profile): stop one user's saved art rendering on another user's profile`
- `41d8b87053 docs(share-intake): rewrite Tasks 3-10 after a pre-execution audit`

The first spinner repair pass is uncommitted in these 14 paths:

- `src/lib/features/landing/components/InfiniteModeInfo.svelte`
- `src/lib/features/landing/components/LibraryModeInfo.svelte`
- `src/lib/features/landing/components/LiveModeInfo.svelte`
- `src/lib/features/landing/components/SpinnerModeToggle.svelte`
- `src/lib/features/landing/components/SpinnerStatsBar.svelte`
- `src/lib/features/landing/services/infinite-sequence-generator.ts`
- `src/lib/shared/animation-engine/domain/chaining-types.ts`
- `src/lib/shared/animation-engine/services/sequence-chaining-orchestrator.ts`
- `src/lib/shared/animation-engine/state/endless-playback-state.svelte.ts`
- `src/routes/endless-spinner/+page.svelte`
- `src/routes/endless-spinner/components/EndlessSpinnerDebugPanel.svelte`
- `src/routes/endless-spinner/components/SpinnerControls.svelte`
- `tests/unit/animation-engine/endless-playback-state.test.ts`
- `tests/unit/animation-engine/sequence-chaining-orchestrator.test.ts`

That scope currently contains 1,736 insertions and 406 deletions. The audit and Fable review did not edit those files.

Other sessions own the remaining dirty paths. At handoff preparation they included the shipped energy-saber spec move, ScanActivityWatcher, two start-position picker components, the QFT route/model/session/stage plus new QFT files and test, and two temporary scripts. Do not stage, revert, format, or commit them.

## Loose ends (ranked)

1. Isolate the route's animation environment. `+page.svelte:123-127` changes auto-persisted `animationSettings`, the global visibility manager, and the playback-controller singleton without restoration. Keep controller injection into `createEndlessPlayback`; that is the designed factory contract. Change which instances the route supplies, following the newer page-scoped `AnimationScope` direction.
2. Adopt the real 4K mechanism. `/endless-spinner` never receives the continuous root ramp in `src/app.css:758-771`. Replace the scaling-only `@media (min-width: 2600px)` tiers in the route and child components with a continuous 1680→3840 scale that covers the whole surface. Preserve the route's correct `--shell-w` usage. The 2560px viewport must not be an unscaled seam.
3. Stabilize the mode-information stage. `+page.svelte:312-320` directly swaps three variable-height components while `.mode-info` reserves only `3.5rem`. Infinite mode also removes its badge after three seconds. Reserve the stage and use the canonical `Crossfade` in `fill` mode so neither switching nor timed content moves the canvas and controls.
4. Complete failure, empty, and motion states:
   - Do not mark the page ready when initialization returns no sequence.
   - Handle the `CopyResult` for history entries.
   - Give the pressed history toggle an explicit empty-history panel.
   - Gate the route's fly transitions and `LibraryModeInfo`'s fade for reduced motion.
   - Preserve the existing user-facing source-switch failure path.
5. Move the hardcoded route palette into the theme and semantic-token hierarchy, then finish i18n coverage. The corrected audit records 79 hardcoded-color occurrences and mixed translated/hardcoded English UI.
6. Decompose the 1,139-line route along actual responsibilities. Keep route-owned chrome that the shipped design assigns here; do not replace the page wholesale with landing-page `AnimationPanel` or `TransportControls`.
7. Release the Infinite metrics subscription when leaving Infinite mode. Keep destruction cleanup as a fallback.
8. Decide whether the navigation-free page is intentionally immersive. The route is outside `MarketingChrome` and renders no replacement navigation, but `SiteFooter.svelte:41` and `faq-items.ts:62` link public visitors into it.
9. Run the Chrome DevTools verification loop after each visual correction. Cover 1920×1080, 2560×1440, 3840×2160, 1440×900, 820×1180, 960×412, and 375×667. At tablet/mobile widths, measure whether the stacked canvas and notation panel push transport controls below a usable first view. Inspect console errors and exercise all three modes, grid/history/debug toggles, pause, skip, retry, copy success/failure, and reduced motion.
10. Re-run focused tests, targeted stylelint, `git diff --check`, and the project check after the fixes. Commit only the 14 spinner paths plus any newly extracted spinner-owned files with an explicit pathspec.

## Decisions already made

- On 2026-07-28, Austen rejected an unproven 4K signoff and requested an audit against codebase patterns.
- On 2026-07-28, Austen asked for Fable's independent review and authorized additions to the handoff.
- `SpinnerControls`, the mode toggle, stats bar, debug panel, and `StepGrid` are intentional route-owned UI under the shipped Endless Playback design. Do not remove them merely because `PlayWithItInner` uses `AnimationPanel`.
- Passing a controller into `createEndlessPlayback` is intentional. The open issue is selecting global persisted instances for a page-scoped surface.
- The audit's overall B is not a visual signoff. UI Consistency is below the accepted threshold and is stored as F because the tracker supports A+, A, B, C, and F.
- Work stays on `main` in the primary checkout. No branch or worktree is authorized.

## Gotchas

- Chrome DevTools MCP is the only permitted browser automation. Do not substitute Playwright, shell-driven browser control, or extension control. Restart Codex if the MCP is still absent.
- Port 5173 is Austen's HTTPS/2 VS Code server. Do not start, stop, restart, or kill it. Use `https://localhost:5173`.
- The audit tracker lacks an `/endless-spinner` route target. The corrected record is stored under `features/landing/components`; read this handoff before treating that target's findings as component-only.
- The earlier audit's four missing-ARIA-label hits were false positives because the buttons have visible text. Its two console-only hits were also reconciled: initialization renders an error state and mode switching reports a user-facing error.
- The mobile/tablet control-placement concern is a verification risk, not a proven visual defect. Only screenshots and measurements can promote it to a finding.
- The git index and working tree are shared. Use `git commit -m "<message>" -- <explicit spinner paths>` and leave every unrelated path untouched.
- Pushing a handoff commit from the state captured above would also publish two unrelated commits already ahead of `origin/main`. Re-check the remote and do not push another session's commits without confirming they have landed or Austen has authorized that publication.
