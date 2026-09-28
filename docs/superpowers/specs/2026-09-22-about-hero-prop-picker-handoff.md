# About hero prop picker: handoff for Opus 5.5

Date: 2026-09-22. Requested by Austen after rejecting the current picker placement.

## Mission

Fix the hero prop picker on the fused About / Flow Arts Composer page. The
trigger is beneath the animation on the right, but opening it replaces the
introduction under the heading on the far left. Austen's latest response was:
“Bro what is this bullshit why would you put it there”. This is a placement and
interaction problem, not a request for another page rewrite or research round.

Start here:

- Worktree: `E:/tka-about-composer-fusion`
- Branch: `codex/about-composer-fusion`
- Implementation HEAD at handoff: `b7dfd7da02`
- Live preview: [About](https://localhost:5174/about)
- Shared route: [Composer](https://localhost:5174/composer)
- Primary checkout: `E:/tka-platform`. Do not edit there during implementation.

Continue this existing task branch. Do not start from primary `main` and lose
the unmerged page work. Inspect current status before editing. This handoff
does not launch or switch models; Austen will give it to Opus 5.5.

## The rejected result

Owner's screenshot:

![Rejected hero picker placement](C:/Users/Austen/AppData/Local/Temp/codex-clipboard-a65c1b86-935d-4c2f-8623-15b44bde5c8a.png)

The picker is a small independent card beneath the title, separated from both
its trigger and the animation. Opening it removes the explanation and Start
composing link. It uses the copy column simply because space was available.

The outgoing agent acknowledged that mistake and suggested an attached tray
beneath the animation, near its Props button, with the title and introduction
unchanged. That is a proposed direction, not a separately approved detailed
design. Judge the actual open state before committing to its dimensions.

**Do not treat the earlier “no visual blocker” review as approval.** Both the
builder and reviewer missed this relationship. Passing measurements and a
cropped screenshot review did not make the placement acceptable to Austen.

## Exact cause and code owners

The main fix belongs in
[ComposerExperience.svelte](<E:/tka-about-composer-fusion/src/routes/(public)/composer/_components/ComposerExperience.svelte>).

- Around line 98: `openHeroProps()` selects a desktop inline picker or the
  narrow-screen sheet.
- Around line 117: `wideHeroPicker` uses `min-width: 70.0625rem`.
- Around line 301: `Crossfade` inside `.opening-copy` switches between
  `hero-inline-props` and `hero-copy-support`. **This is the wrong composition.**
- Around line 336: `.opening-player` contains `SequenceHeroDemo`, the permanent
  `.hero-props` button, and `ComposerBackgroundCycle`.
- Around line 737: `.hero-inline-props` is capped at 22rem. Related narrow CSS
  hides it at 70rem. Reassess these rules when relocating the picker.
- `closeInlinePicker()` currently restores focus to the bound hero button.
  Keep or adjust that behavior for the new placement.

Related files, only if needed:

- [ComposerInlinePropPicker.svelte](<E:/tka-about-composer-fusion/src/routes/(public)/composer/_components/ComposerInlinePropPicker.svelte>): wraps the canonical `BentoPropGrid`, supports `docked`, and owns Done.
- [ComposerPractice.svelte](<E:/tka-about-composer-fusion/src/routes/(public)/composer/_components/ComposerPractice.svelte>): Build/Generate workspace with its own integrated prop rail. Do not dismantle it to fix the hero.
- [ComposerTunnelDemo.svelte](<E:/tka-about-composer-fusion/src/routes/(public)/composer/_components/ComposerTunnelDemo.svelte>): separate tunnel picker host. Preserve its behavior.
- [Verification record](E:/flow-arts-private/plans/about-composer-fusion-verification.md): historical implementation evidence and unresolved gates. Its positive aesthetic assessment is superseded by Austen's rejection above.

## Done: verified

These claims describe the existing implementation, not acceptance of the hero
picker's location.

- `b7dfd7da02`: permanent hero Props trigger, shared practice frame with
  full-height prop rail, and control sizing corrections. `npm run check`
  reported 0 errors and 0 warnings. Focused tests below passed, 15 total.
- In that revision, browser measurements at 375px found four letter-type
  buttons about 53x44px with 14px text. The unused settings slot had previously
  squeezed them below 44px. Do not reintroduce it on the public demo.
- In that revision, desktop Done returned focus to the hero trigger. Tablet
  Triad-family selection followed by Trigeng closed the native sheet and
  returned focus. The practice words `SRVN` and `MYΩN` survived mode switching
  and selection of Fan. These are previous observations, not a substitute for
  checking behavior affected by the next change.
- `8266e482fe`: page-local prop selection and all ten manually selected themes.
  `42373c0b91`: Ocean fish populate before its incoming canvas is revealed.
  The verification record documents 43 passing focused tests for that pass.
  Those package/background tests were not rerun while writing this handoff.
- At handoff, the worktree was clean before adding this document. The existing
  preview returned HTTP 200, and PID 102308 still matched its Vite command.

Recent focused test command, from the task worktree:

```powershell
npm run test:ci -- tests/unit/composer-presentation-state.test.ts tests/unit/composer-presentation-viewer-isolation.test.ts tests/unit/composer-hero-seed.test.ts tests/unit/create/letter-type-navigation.test.ts
```

## Believed done: unverified

- Full WCAG AAA conformance has **not** been established. The project's sizing
  policy is 44px targets, 14px essential text and 12px supplementary text.
  Use actual computed sizes, visible focus, and contrast checks where affected.
- The complete seven-tier visual matrix and actual 200% browser-zoom check
  remain incomplete. Wide geometry measurements are not visual approval.
- The current hero placement is rejected. Nothing in this handoff labels the
  proposed replacement aesthetically verified.

## In flight

No UI edits are in flight from the outgoing agent. All application changes are
on the existing branch through `b7dfd7da02`. This document is the only new work
in the handoff turn. The branch is **not merged to main or deployed**.

Persistent preview ownership:

- Worktree: `E:/tka-about-composer-fusion`
- Port: 5174, IPv6 HTTPS
- PID at handoff: 102308, verify identity before any process action
- Command: `node node_modules/vite/bin/vite.js --host :: --port 5174 --strictPort`
- Logs: `.fusion-preview-20260922.out.log` and
  `.fusion-preview-20260922.err.log` in the task worktree

Leave this preview available. Never start, restart, replace, or kill Austen's
5173 server. Do not interfere with other tasks' servers or tabs.

## Loose ends, ranked

1. Reproduce the desktop hero picker open state on `/about`. Read the current
   repository instructions and applicable UI contracts. Fix its ownership and
   position inside the player area; keep the introductory copy mounted.
2. Inspect the resulting composition with real prop choices. Keep the large
   animation visible. A useful tray should not become another giant scrolling
   section or a tiny card floating across the page. Use the existing grid and
   shared motion components rather than building a new picker.
3. Verify these acceptance conditions:
   - The open picker is visibly attached to the player and its Props trigger.
   - Heading, description, Start composing link and guest note remain visible.
   - Opening and closing do not cover the canvas, reset playback, change the
     sequence, or cause an unexplained scroll jump.
   - Family drill-in and final selection work. Selection remains page-local
     and updates hero, Build/Generate and tunnel. Native 3D and gallery prop
     settings retain their separate ownership.
   - Keyboard access and focus return work. Essential labels meet 14px and
     targets meet 44px in both dimensions. Long labels are readable.
   - The narrow-screen sheet remains usable. Resize across the desktop
     breakpoint while open; there must not be an orphan panel or missing copy.
   - The theme menu and scroll cue do not collide with the picker or trigger.
4. Run the closest checks affected by the patch. Inspect `/about` and smoke-test
   the shared `/composer` route. Capture closed/open states, selection and
   dismissal. Review the relationship between controls and content, not merely
   overflow or whether every box fits.
5. Commit only owned files. Follow the guarded local integration workflow when
   its gates are met; otherwise retain the verified worktree preview and state
   the remaining gate accurately. Deliver the actual route URL. Do not push
   or deploy without authorization.

## Decisions already made

- Austen wants the rich Composer demonstrations fused with the About page.
  Do not strip it down to sparse marketing copy.
- Keep the animation large and preserve the mandala/trail alignment fix.
- Themes change only on selection. The concise `Theme:` label is intentional.
- Props are a central control, not something to hide or move away from the
  result they affect. The full registry and native family behavior matter.
- Reuse established controls and styling tokens. Avoid explanatory filler,
  duplicate effect controls, and hand-built substitutes for existing pickers.
- On 2026-09-22 Austen rejected the hero picker's placement in the copy column.
  Fix that before expanding into unrelated page work.

## Gotchas

- `BentoPropGrid` uses `tileDensity="comfortable"`, internal scrolling, and
  no `fill=true`. Combining comfortable density with fill produced overlapping
  rows in an earlier attempt. Changing host padding once accidentally reduced
  a two-column grid to one oversized column. Measure usable inner width.
- Practice uses keyed `PanelGroup` and mounted `DualSourceCrossfade` content
  to preserve state. Its height accounts for the constructor stacking below
  1100px of **allocated result width**, not total page width. Leave this intact.
- The existing browser's raw captures repeat/crop beyond its native compositor
  area. Tablet and wide captures have shown this. Do not call those repetitions
  app defects or call a geometry table a completed visual pass. A dedicated
  test Chrome was attempted earlier but was not connected to the browser tool.
  Austen's personal Chrome session is not authorized for testing.
- Phone keyboard activation worked; emulated touch/click coordinates were
  unreliable. One agent-owned tab timed out during a reduced-motion check.
  Later checks used a fresh task-owned tab. Do not close user tabs to recover.
- Dependencies are private to the worktree. The old shared junction is
  preserved at `E:/tka-about-composer-fusion-dependencies/shared-node_modules-link`.
  Never recursively delete that junction or its target.
- Normal `npm run check` passed. An alternate `check:fast` run reported hundreds
  of diagnostics without a baseline. Do not expand this placement fix into
  unrelated checker cleanup.
- UI research is under `docs/architecture/visual-review.md`, with the evidence
  ledger last checked 2026-09-21. Reviewer calibration is NOT CALIBRATED. Use
  the current `ui-bust` workflow, but do not repeat broad web research for this
  local correction or present reviewer agreement as owner approval.

The next deliverable is a working correction, not another plan for Austen to
approve before seeing the same mistake again.
