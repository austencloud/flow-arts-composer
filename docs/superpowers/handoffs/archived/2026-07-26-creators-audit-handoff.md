> Archived 2026-10-14: Matching scope is recorded in `docs/superpowers/specs/shipped/2026-07-25-creators-discovery-design.md`.

# Handoff: audit the Creators rebuild (2026-07-26)

You are auditing work I finished today, adversarially. Assume it is wrong until
you have evidence otherwise. I have listed my own evidence below precisely so
you can go and check whether it actually supports what I claimed.

The single most useful thing you can do is **open the page and look at it at the
viewports I did not re-check** (listed in §5). The bug that started this whole
session was a 1765px-wide button visible in the first screenshot nobody took.

---

## 1. Scope

Three commits, in order:

| SHA | What |
|---|---|
| `3618f1fb12` | Rules: made visual verification mandatory, removed the permission blocker in `CLAUDE.md` that was stopping agents from opening a browser |
| `e2b29aa735` | Creators discovery page rebuilt; feature moved `features/browse/creators/` → `features/creators/`; work wall added |
| `0c8a70bdc7` | Follow from the roster; bands centred; `FollowButton` gains a `weight` prop; auth-timing bug fixed |

Primary surface: `https://localhost:5173/creators`

Files you care about:

```
src/lib/features/creators/components/CreatorsPanel.svelte   <- column math, wall selection, follow handler, $effect
src/lib/features/creators/components/CreatorCell.svelte     <- restructured from <button> to container
src/lib/features/creators/components/RosterBand.svelte      <- grid, cell caps, centring
src/lib/features/creators/components/WorkTile.svelte        <- new
src/lib/features/creators/components/WorkWall.svelte        <- new
src/lib/features/creators/domain/fit-columns.ts             <- orphan avoidance
src/lib/shared/community/components/FollowButton.svelte     <- `weight` prop added
```

Design doc this implements: `docs/superpowers/specs/2026-07-25-creators-discovery-design.md`
(Phases 0–3 done. Phase 4 motion and Phase 5 close-out are NOT done — see §6.)

---

## 2. How to run it

Do not use `npm run dev` and do not touch port 5173 — that is Austen's server.
Launch your own Chrome:

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList `
  '--remote-debugging-port=9222','--user-data-dir=C:\Users\Austen\.claude\chrome-profile', `
  '--force-device-scale-factor=1','about:blank'
```

`--force-device-scale-factor=1` is required to reach a real 3840 CSS viewport —
Windows runs the display at 200%, so without it Chrome tops out at 1920 and
`resize_page(3840, …)` cannot exceed the physical screen. Expect Chrome's own UI
to render tiny in that window; that is the flag working.

Then Chrome DevTools MCP: `new_page` → `https://localhost:5173/creators`,
`resize_page` per viewport, `evaluate_script` for measurements,
`take_screenshot` with `format: "webp", quality: 70`.

The roster takes ~10–20s to populate on a cold load. Poll for
`.creators-panel .cell` before measuring, then wait a further ~2.5s for
thumbnails, or you will measure a skeleton. Scroll the `.scroller` to 0 after a
resize — scroll position survives and I was briefly fooled by it.

Gates: `npx vitest run tests/unit/creator-*.test.ts tests/unit/deal-by-owner.test.ts tests/unit/fit-columns.test.ts`
and one `npm run check` captured to a log (see `fast-iteration-loop.md` — do not
run it repeatedly).

---

## 3. Claims I made. Falsify them.

Each of these is something I asserted to Austen. The evidence column is what I
actually observed; check whether it holds and whether it means what I said.

| Claim | My evidence | How you could break it |
|---|---|---|
| View switcher is 272px, not 1765px | `evaluate_script` at 1920 | Check 2560/3840/375. The fix is `width: auto` in the consumer overriding SegmentedControl's own `width: 100%` — confirm nothing else in the app relied on that consumer selector |
| Bands land on one full row from 1440 up | measured cols 8/7/6 at 1440 and 1920 | Try widths BETWEEN my samples (1600, 1750, 2000, 3000). My column maths is `floor(contentWidth / (9.5em × unitPx))`; there will be widths where it wraps badly |
| Bands are centred, 111px each side | measured at 1920, first band only | Check every band at several widths; check the wall and the index band too |
| 4K fills the canvas: content 2005 = viewport 2005 | measured at 3840 | This was BEFORE follow buttons were added (+~40px per portrait card). Re-measure |
| Wall can never strand a tile | `limit = wallCap`, so `count % cols === 0` | Force fewer items than the cap (sign out; filter). `fitColumns(n, min(cap, n))` should still be safe — prove it |
| 19 of 20 cards show Following; switcher reads 54 | `evaluate_script` after the `$effect` fix | Sign out and back in. Does the `$effect` re-fire? Does it loop? |
| Follow writes are not optimistic | code reading | Trace `handleFollow` — I never exercised the write path at all (§4) |
| `svelte-check` has no errors in my files | full run, log captured | Re-run. One error exists in `create/generate/CardBasedSettingsContainer.svelte` from another session; confirm it is genuinely not mine |
| Prop marks illegible at 16px, so words only | screenshots | Judgement call. Disagree if you think the glyph was worth keeping at a larger size |

---

## 4. Never exercised at all

I did not click anything. Following a real creator writes to production
Firestore and I would not do that unasked. Everything below is **unverified
behaviour**, not verified-working:

- **Follow / unfollow round trip.** `followUser` / `unfollowUser` are called and
  `updateUserFollowStatus` patches local state on success. Untested end to end.
- **The failure path is silent.** `handleFollow`'s `catch` does
  `console.error` and nothing else. A failed follow leaves the button snapping
  back to its old state with no explanation to the user. I think this is a real
  defect; it needs a toast or an inline error. Confirm and fix.
- **Wall tile click** → `openSequenceViewer(sequence, { returnPath: "/creators" })`.
  Never clicked. Check the return path actually returns here.
- **Credit chip click** → opens that creator's profile. Never clicked.
- **`New here` and `Following` views.** Never switched to them on screen. Both
  suppress the wall and the bands by design — check the empty states render.
- **Search.** The wall hides while a query is active (code-verified only).
- **Signed-out / guest view.** My browser was signed in for the final passes.
  `FollowButton` self-gates for guests, so cards should have no follow row and
  no phantom gap (`.follow:has(button)`), but I never saw it.
- **Keyboard.** `CreatorCell` changed from a single `<button>` to a container
  with two sibling controls. Tab order, focus ring (`:focus-within` on the
  card, `:focus-visible` on `.open`), and Enter/Space all need a real check.
- **Screen reader / `forced-colors` / `prefers-reduced-motion`.** Untested.
  Route to `accessibility-auditor`.
- **Performance.** 58 avatars plus 6–9 pictograph thumbnail renders on one
  screen. `loading="lazy"` past the first band, `allowQR={false}` on tiles. No
  profiling done.

---

## 5. Viewports NOT re-verified after the last two changes

This is the highest-value gap. My final code changes were `PORTRAIT_CELL_EM`
9.5, `INDEX_CELL_EM` 11, `--cell-max` 14em, then follow buttons + centring.
Coverage after those landed:

| Viewport | Last seen |
|---|---|
| 1920 × 1080 | ✅ after everything |
| 375 × 667 | ✅ after everything |
| 1440 × 900 | ⚠️ before follow buttons and centring |
| 3840 × 2160 | ⚠️ before follow buttons and centring |
| 2560 × 1440 | ⚠️ before the cell-cap changes AND before follow |
| 820 × 1180 | ⚠️ before the cell-cap changes AND before follow |
| 960 × 412 | ⚠️ before the cell-cap changes AND before follow |

Portrait cards grew ~40px taller with the follow row. 960×412 should be
unaffected (short-landscape forces index density, and follow is portrait-only)
but that is reasoning, not observation. **Go look at all five.**

---

## 6. Known-unfixed, deliberately

Do not treat these as audit findings — they are already known. Confirm they are
still true and judge whether the reasoning holds.

1. **Portrait bands do not fill the width at 3840** (~76% / 66% / 57% for the
   8/7/6-person bands, pre-centring). A band of 6 cannot fill 3644px at a card
   size that doesn't read as scattered dots. Centring splits the leftover space
   rather than removing it. The alternative — merging the three bands into one
   wrapping grid — trades away the recency banding. If you think that trade is
   right, say so.
2. **`simplifyRepeatedWord` is not used anywhere in this feature**, and there
   are three raw renders: `profile/ProfileTabs.svelte:79`,
   `profile/ConnectionSharedSequences.svelte:63` and `:89`. This violates
   `.claude/rules/simplified-word-display.md` (a LOOP word like FΨFΨFΨFΨ must
   display as FΨ). Predates this work but I now own the file. **Real bug, fix
   it.**
3. **Follow is portrait-only.** Index rows (37 people in "Earlier") have no
   follow control — the button plus its ghost-sizer is most of a 178px row.
   Adding it needs an icon-only mode on `FollowButton`.
4. **Four inline copies of `PROP_TYPE_DISPLAY_REGISTRY` markup remain.** I built
   a `PropGlyph` component to retire them, then removed its only consumer and
   deleted it rather than ship an unused component. The duplication is still
   there.
5. **Phase 4 (motion) and Phase 5 (close-out)** of the design doc are not
   started: mount stagger, band `growFade`, reorder `flip`, view-transition
   morph, reduced-motion and forced-colors handling.
6. **`FollowButton.svelte` was untracked** when I committed it — a new
   extraction that arrived alongside an in-flight `UserCard.svelte`
   modification belonging to another session. I committed the component (my
   `weight` prop needs it) but deliberately not their `UserCard` changes. Check
   I did not break `UserCard`.

---

## 7. Constraints you must respect

- **Port 5173 is Austen's dev server.** Never `npm run dev`, never kill it.
  Launch your own Chrome instance as in §2; reap anything you spawn.
- **The git index is shared with live sessions.** Always
  `git commit -m "…" -- <explicit paths>`. Never `git add -A` / `.` / `-u`,
  never a bare `git commit`, never stash/reset/checkout --.
  `create/generate/` and `shared/community/UserCard.svelte` currently hold
  another session's in-flight work — do not touch, do not commit, do not revert.
- **One `svelte-check` machine-wide at a time**, one per turn; capture to a log
  and grep the log rather than re-running (`fast-iteration-loop.md`,
  `resource-budget.md`).
- **Never render pictographs or sequences** except via the `generate_pictograph`
  / `generate_sequence` MCP tools.
- **Any TKA domain claim needs an MCP call** in the same turn
  (`mcp-ground-truth.md`).
- **If you change how anything looks, screenshot it yourself** before reporting
  — `.claude/rules/visual-verification-mandatory.md`. That rule exists because
  of the exact failure that opened this session.

---

## 8. What a good audit returns

Ranked findings, most severe first, each with: the file and line, a concrete
failure scenario (inputs/state → wrong output), and the evidence that
distinguishes it from a guess. A screenshot beats a description for anything
visual.

Explicitly tell Austen which of my §3 claims you checked and which you could
not, rather than leaving silence to imply verification. If you find nothing at
a given viewport, say that you looked and it was fine — the value here is
knowing what has actually been observed by someone.
