# About / Composer fusion verification

Updated 2026-09-22. Worktree: `E:/tka-about-composer-fusion`.
Branch: `codex/about-composer-fusion`. Implementation is not yet integrated.

## September 22 hero prop rail correction

Austen rejected the hero picker opening in the copy column, where it replaced
the introduction and sat away from its trigger. The earlier "no visual
blocker" review below missed that relationship and does not stand for it.

- The picker is now a rail inside `.opening-player`, docked against the
  stage's right edge. It starts level with the stage top and ends level with
  the Props button, whose chevron points at it. The copy column no longer
  swaps content; heading, lede, Start composing and the guest note stay put.
- Opening widens the player by the rail and its gap. The stage shrinks only by
  the width the column lacks, and matching bottom padding keeps the centred
  copy still. Measured stage width closed → open: 1280x800 376 → 324,
  1440x900 423 → 404, 1680x1050 536 → 515, 1920x1080 551 → 539,
  2560x1440 734 → 734, 3840x2160 832 → 832. The lede moved at most 1px, the
  scroll position stayed 0, and the stage canvas node did not change.
- Rail 17.5rem (22rem from 120rem). Host insets are trimmed and the
  comfortable track floor is 7rem inside the rail only, so it holds two
  columns: 114x108 tiles, 150px from 1920. Labels are 14px; "Double Contact
  Ball" wraps to two lines. Done is 67x44.
- Below 80rem the trigger opens the native sheet (checked at 1200x800 and
  375x812). Narrowing past 80rem while open unmounts the rail and clears it;
  no orphan panel, copy intact, no horizontal overflow.
- Triad drill-in and Trigeng selection worked inside the rail. Fan selected in
  the rail reached Build/Generate and tunnel controls. Done and a second
  trigger click close it; focus returns to the trigger. Keyboard Enter opens
  it and Tab moves from the trigger to Done with a visible 2.67px outline.
- Theme menu at 1920 (989–1389px) cleared the rail (1481px+). `/composer`
  behaves identically. No console errors or warnings.

Evidence: agent Chrome on 9222 through DevTools MCP, task-owned tab. The 15
focused tests pass and `npm run check` reports 0 errors and 0 warnings.
Owner acceptance of the new placement is still pending. The full seven-tier
matrix and 200% zoom gate below still apply to the whole page.

## September 22 wide-screen composition

Austen's 4K screenshot showed the copy pinned far left, with both columns'
slack pooled between it and the stage. The rail also had room for more than
two tile columns. From 120rem, each opening track now hugs its content: the
copy's own measure and the stage's exact width. The pair is centred. Opening
the rail widens the player track by the rail width, so the whole composition
glides and re-centres as one unit. The stage keeps its full width and does
not move vertically, which supersedes the 1920 figure above (it was 551 → 539
and is now 551 → 551). The rail is 22rem from 120rem and 30rem from 150rem.

| Viewport      | Closed copy x / stage x, side margins | Open rail                                   |
| ------------- | ------------------------------------- | ------------------------------------------- |
| 1920x1080     | 324 / 1035, margins 324 · 334         | 352px, two 150px columns, stage 551 kept    |
| 2560x1250@1.5 | 581 / 1331, margins 408 · 409         | 480px, three 139px columns, stage 638 kept  |
| 3840x2160     | 1121 / 1877, margins 1121 · 1131      | 480px, three 142px columns, stage 832 kept  |

1440x900, 1280x800 and 1280x540 match the rail correction above. At 1280x800
the stage goes 376 → 324, and at 1280x540 the 18rem cap still holds. No tier
overflows horizontally. Reduced motion also disables the opening-track
transition. The three composer presentation test files pass (11 tests), and
`npm run check` reports 0 errors and 0 warnings. Commit `47b9647026`.

## September 22 family look tiles

Austen reported that Triad styles showed Triad and Trigeng only as
pictographs, even though both have 3D sprites. A first fix added a Look switch
to the styles view. He rejected it as too many buttons and dials and asked for
every variation in one place.

- A family drill now lists each style once per look. Every style gets a
  pictograph tile. A style with a captured sprite also gets a "<Style> 3D"
  tile, listed after the pictographs. One tap sets the prop and the global look
  together. The switch is gone. Triad styles show Triad, Trigeng, Triad 3D and
  Trigeng 3D. Club styles show Club, Classic Club, Torch, Club 3D and Torch 3D.
  Classic Club has no sprite.
- A style picked from these tiles no longer repeats a look picker in its
  details drill. Triad details show only Size.
- `drillLayout` picks the column count that gives the largest tile.
- Evidence from the 2560×1250@1.5 rail: Triad is 2×2 at 220×275. Club is 2+2+1
  at 220×239 with the last tile centered. Neither drill scrolls. In the
  1200×800 sheet, Club is 3+2 at 238×297 with no overflow. The console shows no
  errors or warnings.
- Component test "lists every family style in each look as its own tile".
  PropGrid and BentoPropGrid component tests pass (8 of 8).

## September 22 drills fill the rail

Austen's screenshots showed the Club styles, Chicken details, and Fan look
drills stopping near the top of the rail with a large empty area below.

- The composer picker now runs PropGrid in `fill` mode. Family drills size
  their tiles to the rail. The all-props grid picks the column count that gives
  the largest tile. PropGrid's `comfortable` density no longer overrides a fill
  grid's tracks.
- The prop-look cards (PropLookPicker → PropBuildPicker `fill`) stack and share
  the remaining height, with a 7rem row floor.
- Look cards frame the painted window through the existing measured crops
  (`modelSpriteCrop`, `NOTATION_GLYPH_CROPS`). The chicken sprites paint only
  one half of their 325-wide box, so without the crop both cards sat off-center.
- `.detail-options.fill` clips x overflow, which removes a 1px horizontal
  scrollbar under the fan builds.

Evidence, from the DevTools DOM and screenshots:

- 2560×1250@1.5 rail (480px): the all-props grid is 4 columns with 122px rows
  and no scroll (819/819). The 3 Club tiles are 220×275 each (two plus a
  centered orphan). The two Chicken look cards are 445×281 each, stacked, with
  the art centered. The fan look is 3×3 with no x scrollbar. In Buugeng, the
  look cards plus the chirality row fit.
- 1920×1080 rail (352px): the Chicken cards are 319×275, with no overflow
  (652/652).
- 1200×800 sheet: Club tiles are 363×311. The Chicken cards stack at 731×265.
- `prop-look.test.ts` adds a crop contract for chicken, and it passes.
  `npm run check` found 0 errors and 0 warnings.
- `prop-chirality-picker-contract.test.ts` has 2 failures. The same failures
  occur on main, whose PropGrid has no `chirality-dock`, so this change did not
  cause them.

## September 22 full prop appearance

Austen could not reach the 3D chicken or fan builds from the composer pickers.
The hero rail passed `showAppearance={false}`, which hid four controls: prop
size, the 3D-model/pictograph look, the fan build and buugeng chirality. Even
with them shown, the picker wrote the global settings. The public page never
starts that settings service, so each write was dropped with "Settings
service not initialized". The composer now keeps fan appearance, prop look
and chirality page-local, like the prop type. It passes them to the rail, the
narrow sheet, the hero, Generate and the tunnel.
BentoPropGrid and PropSelectionSheet accept host-owned appearance and fall
back to the global settings, so the app's hosts are unchanged. The animation
engine takes a `propLook` override beside its existing `fanAppearance` and
chirality overrides. The sheet no longer closes on every pick. Its own
contract keeps it open, and the fan, size and look details open only after a
pick.

Verified at 2560x1250@1.5:

- Chicken → 3D model drew the model chickens in the hero.
- Fan → Moon LED drew that build.
- Big switched the prop to Big Fan.
- Buugeng showed the look and A/B chirality per hand. The right prop took B.
- The tunnel drew the 3D buugeng.

At 1200x800 the sheet stayed open through Fan → Star Fire. No console
warnings or errors. A new crossfade test fails without the engine override
and passes with it. The composer and engine tests pass (20), and
`npm run check` reports 0 errors and 0 warnings.

## September 22 connected-picker and minimum-size pass

Preview: `https://localhost:5174/about`. This pass supersedes the practice
picker's detached-card layout described below.

- The hero has a permanent `Props: <selection>` button beneath its animation.
  Wide screens open the inline picker; narrower screens use the native sheet.
  Closing the desktop picker returns focus to that button. The sheet also
  returned focus after selecting Trigeng from the Triad family on tablet.
- Practice now owns one frame containing its result and full-height prop rail.
  The canonical comfortable grid retains two readable columns and scrolls.
  Build and Generate remain mounted. Their words (`SRVN` and `MYΩN` in the
  observed session) survived switching modes and selecting Fan.
- Height follows the result's allocated width, including when the rail makes
  the constructor stack. At 1440px the stacked frame measured 832px high.
  At 1920, 2560 and 3840px, the frame measured 672px and its rail and picker
  both measured 670.3px inside the border.
- Existing policy remains 44px targets, 14px essential text and 12px
  supplementary text. Letter-type and tunnel controls now use the standard
  size. At 375px, all four letter-type tabs measured about 53x44px with 14px
  text. Removing the unused settings slot made room for those targets.
  The hero prop button measured about 218x50px with 14px text.
- The letter utility disclosure anchors to the actual header height instead
  of a fixed offset. Hero bottom spacing reserves room for the enlarged scroll
  control; at 820px it cleared the theme button by 9px.

Evidence: 15 focused tests pass across presentation state, viewer isolation,
hero seeding and letter-type navigation. The seed regression test now targets
the extracted shared experience, retaining the same fixture assertions.
Final `npm run check` reports 0 errors and 0 warnings.

Browser observations cover phone, short horizontal, tablet and laptop layouts,
plus geometry at the three wide tiers. No horizontal overflow was measured.
The independent VR-1 reviewer found no visual blocker in the inspected hero,
practice and phone frames. This is not a full WCAG AAA certification or owner
acceptance. The review remains NOT CALIBRATED.

Current frames in the existing `pickers` evidence directory use the `polish-`
prefix: `laptop-build`, `laptop-generate`, `phone-build`, `laptop-hero-open`,
and `landscape-controls` (all WebP). They are scrolled crops. The tablet capture
repeated its content beyond the browser's native compositor area, so it is not
complete visual evidence. The wide-capture and actual 200% browser-zoom limits
below still block the complete integration gate. Phone checks used keyboard
activation, not verified touch coordinates. One test tab timed out during a
reduced-motion check; the remaining checks used a fresh task-owned tab.

## September 22 picker and Ocean revision

Preview ready at `https://localhost:5174/about`. This section supersedes older
picker and process details below. The same experience is also on `/composer`.

- Ocean initialization now requests on-screen fish and awaits asynchronous
  initialization before revealing the incoming crossfade canvas. Stale async
  completion cannot restart a disposed controller. This is part of the existing
  `@austencloud/backgrounds@0.7.12` package patch, with its lockfile hash updated.
- The manual `Theme:` menu offers all ten registry themes: Cosmic, Winter,
  Ocean, Ember, Blossom, Forest, Autumn, Rainbow, Celestial and Void. It reuses
  package card artwork; the menu scrolls within available viewport height.
- Wide layouts place the canonical prop grid beside the hero, practice result,
  or tunnel. Family drill-in remains native. Selection stays page-local and
  updates the shared demonstrations without closing the desktop comparison.
- Narrow layouts retain the canonical prop sheet. Drilling into a family keeps
  it open; choosing a specific prop closes it. Desktop-to-narrow resizing
  restores hero supporting copy and preserves the practice sequence.
- Hero and tunnel swaps use Crossfade; practice uses keyed PanelGroup panels.
  Comfortable prop tiles scroll instead of squeezing the entire registry into
  a small frame. The fixed-height fill layout is intentionally not combined
  with the grid's comfortable density.

### Current evidence

- `npm run check`: 0 errors and 0 warnings after the final implementation.
- 43 tests pass across nine focused files: background lifecycle (7), Ocean
  interactions (5), quality recovery (2), background hold (4), mandala alignment
  (8), guide crossfade (7), overlay attachment (1), presentation state (8), and
  viewer isolation (1). Existing multiple-Three.js warning only.
- Fresh-page laptop inspection: readable native prop tiles beside the hero,
  generated notation and animation beside the practice family chooser, and
  desktop theme menu contained within the viewport. Ocean fish are visibly
  populated; precise asynchronous reveal ordering is covered by tests.
- Keyboard interaction at 375x667, including reduced motion: Triad family
  drill-in followed by Trigeng selection closes the sheet and updates the shared
  triggers. All ten theme items were enumerated in the rendered menu and Ocean
  was selected. This is not a claim of verified phone touch targeting.
- Generated word `T` survived selecting Club, opening/closing the picker, and
  resizing the practice layout from 1440x900 to 960x412. The narrow result had no
  leftover empty picker column. Earlier interaction also preserved `OΛSS`.
- Zero horizontal overflow measured at all seven CSS tiers: 375x667, 960x412,
  820x1180, 1440x900, 1920x1080, 2560x1440 and 3840x2160. Geometry measurements
  are not seven complete visual approvals.
- Evidence: `C:/Users/Austen/.codex/visualizations/2026/09/21/01a0c19d-9d73-7a21-a1c4-4c2b282c9483/pickers`.
  Final desktop frames use `laptop-props-final.webp`,
  `laptop-practice-final.webp`, `laptop-tunnel-final.webp`, and
  `laptop-themes-final.webp`. Earlier frames
  may show intermediate density and are not final evidence.

The ui-bust/VR-1 review used the evidence ledger checked 2026-09-21 and the
owner's explicit beside-canvas/native-control constraints. It is limited visual
judgment, not AI-authorship detection or owner acceptance. Calibration remains
NOT CALIBRATED. The previously recorded wide-capture and actual 200% zoom
limitations remain; the complete visual integration gate is not claimed.
An independent review of the final hero, practice and theme frames found no
visual blocker in those observed desktop states; the parent separately checked
the final tunnel. Interaction claims above come from live checks, not that
screenshot review.

### Current live preview ownership

- Detached Vite PID **102308**, port **5174**, rooted in this exact worktree.
- Command: `node node_modules/vite/bin/vite.js --host :: --port 5174 --strictPort`.
- Logs: `.fusion-preview-20260922.out.log` and
  `.fusion-preview-20260922.err.log` in the worktree.
- Private dependencies installed with `pnpm install --frozen-lockfile
  --ignore-scripts --offline`; workspace packages built. The former shared
  dependency junction is preserved at
  `E:/tka-about-composer-fusion-dependencies/shared-node_modules-link`.
- Main's Composer startup ownership fix is included through merge
  `466b72c34f`. Port 5173 and other tasks' previews remain untouched.
- Keep this preview and its delivered browser tab alive. Integration remains
  pending the complete visual gate; do not report this version as on main.

## September 21 owner-feedback revision

The changes below supersede the initial implementation/evidence recorded later
in this document. They are live on the same 5174 preview, not on main/5173.

- Corrected the mandala guide's backing-pixel/logical-pixel conversion. The
  painter applies DPR exactly once, even when a late-mounted overlay has a
  different backing size from the prop renderer. Late attachment also sizes the
  overlay to the current render frame. The hero remains the original size.
- Removed the background timer. The picker is labelled `Theme:` and only changes
  the environment on a visitor's selection.
- Added one shared, page-local prop pair with the canonical PropSelectionSheet.
  Hero, Build, Generate and tunnel use it. The 3D scene retains its independent,
  native performer controls; the gallery retains its own existing prop control.
- Put Build and Generate behind one canonical segmented control. Both remain
  mounted so switching modes preserves work. Inactive playback and the hidden
  construction attract act pause. Sequence words sit over their workspaces;
  redundant panel captions are removed. Both players use the same trail preset.
- Replaced the cramped play-phase buttons with PanelButton and made Generate a
  centered primary action. The construction attract act still locates and
  presses the real Build another button.
- Centered and shortened the TKA bridge and section headings. Guide/history/FAQ
  and creator links use the existing button-link treatment.
- Removed the extra 3D effects strip, the double-staff scope paragraph, and the
  biography's grant paragraph/announcement link. Native performer Effects and
  the authentic creator photograph remain.
- Increased the gallery to 88rem on desktop and 56rem at the compact breakpoint.
  At the observed desktop density, its 1,183px internal viewport fits complete
  first and second rows (424px and 446px plus their gap).

### Revision checks

- `npm run check`: 0 errors, 0 warnings after the revision.
- 27 tests passed across six focused files: presentation state (5), presentation
  viewer isolation (1), construct attract act (5), mandala prop alignment (8),
  guide crossfade/pixel conversion (7), and late overlay attachment (1).
  The scale regression exercises DPR 1, 1.2, 2 and 3. The test runner emits the
  existing multiple-Three.js-instance warning; no test failed.
- Svelte components and changed tests formatted; engine files retain their
  existing surrounding style to avoid an unrelated formatting rewrite.
- Browser interaction: took over Build, changed `BC` to `BCA`, played it, switched
  modes and returned without losing it. Generation produced a new 16-count
  sequence. The carried sequence reached the tunnel. The canonical prop drawer
  changed the hero and tunnel to fans. Ocean remained selected while scrolling
  and working with the demos. These controls did not write the page's prop choice
  to global settings.
- Native 3D performer Effects opens its existing color-coded picker. The separate
  strip is absent. Tunnel count and arrangement controls measure approximately
  48px high; the prop trigger is approximately 50px high.
- Direct native-desktop and phone visual inspection performed. The corrected
  hero's guide follows the tip/trail geometry; phone Build choices and Generate
  action are reachable. A discovered tablet overlap between the stacked player
  and action was corrected by increasing the shared stage at that breakpoint.

Final geometry checks (not seven visual approvals):

| CSS viewport | Horizontal overflow | Player-to-footer clearance |
| --- | --- | --- |
| 375 x 667 | 0 | 16px |
| 960 x 412 | 0 | 16px |
| 820 x 1180 | 0 | 16px |
| 1440 x 900 | 0 | 16px |
| 1920 x 1080 | 0 | 16px |
| 2560 x 1440 | 0 | 16px |
| 3840 x 2160 | 0 | 16px |

Fresh screenshots in the evidence directory below use `revision-final-*` and
`revision-phone-*`. The phone Generate action has its own
`revision-phone-generate-action.webp` frame. Frames are scrolled crops; they do
not prove off-screen content. Earlier `revision-*` frames without `final` include
intermediate geometry and should not be treated as final desktop evidence.

A separate screenshot reviewer found one non-blocking concern: the canonical
glowing clear control is visually prominent on the phone Build panel. It remains
the product's existing ClearSequenceButton, with its accessible name, rather
than a new page-specific control. The reviewer could not assess off-screen
controls; the parent separately inspected the phone Generate action and live
native 3D controls. This is limited visual judgment, not an AI-authorship score
or owner approval. Calibration remains NOT CALIBRATED.

The wide-capture and actual 200% zoom limitations below still prevent a complete
visual gate. Phone emulation renders correctly through raw screenshot capture,
but locator clicks in that emulated viewport do not reliably land; interaction
checks therefore use the native viewport, not a claim of tested phone touch.

## Initial implementation (historical)

Both public routes render one `ComposerExperience.svelte`, with their original
route-specific SEO and structured data retained. The existing live hero,
background cycle, construction, generation, tunnel, 3D, gallery, lazy mounts,
sequence ownership, reduced-motion behavior, and capability gates remain.
TKA context precedes construction; scope follows the 3D output; the authentic
creator photograph and factual authorship/grant/contact information close it.
The 2022 date describes TKA's creation, not the application's creation.

## Passed evidence

- `npm run check`: 0 errors and 0 warnings before the final link-grouping-only
  correction; rerun required with the final integration gate.
- Two focused Vitest files: `composer-presentation-state.test.ts` (5 tests),
  `composer-presentation-viewer-isolation.test.ts` (1 test): all 6 passed.
- Prettier checks on all four changed Svelte files and `git diff --check` pass.
- About and Composer metadata compared with their pre-extraction versions;
  original IDs, types, values, feature list, offer, breadcrumbs, and TKA
  disambiguation remain.
- Browser: hero resolves from loading to animated notation; background selection
  changes the actual environment. Manual gamma placement followed by Add M
  produces `Current word: M` and the generator's carried word `M`. Generation
  produces a 16-step result. Tunnel and supported 3D render and animate. Public
  gallery loads actual sequence cards (610 in this observed session).
- Phone: 375x667, no horizontal overflow, uncropped portrait and readable story,
  visible keyboard link focus. Reduced-motion media yields `scroll-behavior:
  auto`. Phone and short landscape hide the 3D viewer and show its explicit
  capability note.
- Seven CSS viewport measurements: 375x667, 960x412, 820x1180, 1440x900,
  1920x1080, 2560x1440, 3840x2160. All have one main, one h1, zero horizontal
  overflow, approximately 44px minimum new-link height, and original portrait
  aspect ratio. These are geometry evidence, not seven visual passes.
- Native desktop captures: CSS1600x900, browser zoom80%, DPR1.2. Directly
  observed hero, notation/build, tunnel, 3D, scope, real gallery, creator.

## Aesthetic review

VR-1, research checked 2026-09-21; reviewer NOT CALIBRATED. Separate reviewer
received the owner's full-fusion requirement and actual desktop frames. It
supported project specificity, hierarchy, real evidence, craft, and product
continuity. It identified detached notation links as a grouping concern. The
links now sit directly under their explanation, alongside the heading; the
parent inspected that correction in the browser. This is scoped professional
judgment, not owner approval or a validated authorship detector.

Screenshots are in the task-owned external evidence directory:
`C:/Users/Austen/.codex/visualizations/2026/09/21/01a0c19d-9d73-7a21-a1c4-4c2b282c9483/fusion`.
Use `desktop-notation-build-corrected.webp` for the final bridge; the earlier
bridge image is retained only as before-correction evidence. Individual frames
are scrolled crops, not claims of absent off-screen content.

## Remaining gate and exact tool limitation

The full visual matrix and actual 200% browser-zoom check remain unassessed.
The selected in-app browser duplicates or crops captures that extend beyond its
native compositor area. Attempts with device metrics, viewport scaling, clip
scaling, lower DPR, and visible-size changes did not yield reliable complete
wide captures. Direct CDP captures at real phone DPR1.5 work; ordinary browser
screenshots misleadingly shrink that phone into the native desktop canvas.
Do not classify those capture defects as application layout failures, and do
not treat the geometry table as visual approval.

The user approved the separate project-owned test Chrome on the follow-up turn.
The dedicated profile launched on9222, but is not connected to the browser
runtime: the supported extension diagnostic reports its browser extension is
not installed. The runtime's only connected Chrome is profile `Austen`, which
was not used. No personal browser, external data, or accounts were changed.
Port5173 was not restarted or replaced. The earlier HTTPS5174 Vite preview was
stopped before that turn ended.

The branch was brought current with local main on the follow-up turn and both
focused Vitest files passed again (6 tests). Development-server slots were
initially occupied by other tasks, so a local production build was attempted.
A slot then freed up; the task-owned build (PID91788) was stopped and the normal
worktree preview started. No build was deployed.

## September 21 live preview (historical; superseded above)

- URL: `https://localhost:5174/about` (also `/composer`).
- Worktree: `E:/tka-about-composer-fusion`.
- Detached task-owned Node/Vite PID104116; port5174, IPv6 HTTPS.
- Started 2026-09-21 14:13 America/Chicago, with `TKA_VITE_PORT=5174` and strict
  port selection. Port5173 remains untouched.
- Logs: `.fusion-preview.out.log` and `.fusion-preview.err.log` in the worktree.
- HTTP200 and actual rendered DOM confirmed the fused page, including all demos,
  TKA bridge, scope, and creator story. The in-app tab is marked as a deliverable.
- Keep this preview alive for Austen's review. It reserves one agent-owned Vite
  slot. Stop it only after successful integration supersedes it or Austen
  finishes the task. Verify PID/command identity before stopping it.

This delivery follows the updated repository lifecycle permitting persistent
worktree previews; incomplete wide-screen/200% verification is still not a pass.

After the remaining visual checks, bring the branch current with local main,
repeat only invalidated checks, and use the guarded project finish workflow:
`npm run wt:finish -- codex/about-composer-fusion --route /about` from the primary
checkout. Do not claim the updated page is on5173 until that integration succeeds.

## September 22 tip alignment across looks

Austen reported that trails missed the prop tips on Triad and Big Triad 3D and on
Big Fan builds. A runtime census of every model sprite against its tip table
found two causes.

- Model captures of radial and hooped props (triad, big triad, trigeng, mini and
  big hoop, triquetra, triquetra2) and the sword painted on the opposite side
  of the hand from their tip tables. The rotation rule covered only axial
  props. `modelSpriteFacesAwayFromTips` now turns any capture whose painted
  bias opposes the table's tip bias. An invariant test covers every sprite.
- Trails, LEDs, and the live mandala guide looked up the notation table
  (`bigfan`, primary tip 297) instead of the loaded build (`bigfan__fire_bare`,
  219.8). The render loop now passes the loaded render keys to the trail
  capturer, both trail overlays, the LED sampler, and the mandala tip offsets.
  Fire already used them. Tunnel layers keep the notation type, as the fire
  tracker does.
- Evidence: 69 focused tests and 622 related tests passed, and `npm run check`
  reported 0 errors. Paused, zoomed hero frames on 5174 showed Triad 3D, Big
  Triad 3D, and Big Fan DoodleGrip Fire trails ending on the drawn arm caps and
  the centre wick.
- Still open: the torch and big torch model tips sit on the shaft about 40
  units short of the wick head, which needs its own calibration.
