# Level 1 Guide — Page-by-Page Rebuild Tracker

**Started:** 2026-06-21
**Goal:** Rebuild the Level 1 printable guide page by page using the *current*
in-app renderers (post-Choreo-card), today's styles, and proper level/LOOP/
Choreo-card iconography — faithful to the original guide's intent and layout, but
a real facelift. Slow, one page at a time, each verified against the old artboard
before moving on.

**Endgame decided 2026-07-07** (ADR `docs/archive/swarm-2026-10-14/architecture/guide-single-source.md`):
these faithful `_pages/*` are THE guide — print AND online. The animated
`_sections/ch*` web version is legacy, retired only once this rebuild reaches
parity (do NOT delete it before then — it's the live web guide). Online
animations later layer onto these faithful pages. Keep each page's content in
structured data (see `Type3CrossShiftsPage`) so the online reflowable view can
consume it.

## Source-of-truth stack (per page)

1. **Old artboard** — `D:\_THE KINETIC ALPHABET\_GUIDE\artboard-exports\*.png`
   (12241×15841, ~1440dpi). Reference for content + layout + intent. NOT shipped.
   Per-page → folder map: `D:\…\_GUIDE\PAGE-IMAGE-MAPPING.md`.
   Per-concept source pictographs: `D:\…\_GUIDE\images\level-1\<concept>\`.
   Canonical old PDF: `D:\…\_GUIDE\exports\level-1.pdf`.
2. **MCP** (`generate_pictograph`, `generate_sequence`, domain tools) — ground
   truth for every letter / position / motion / VTG fact shown. Never assert
   domain facts from memory.
3. **Current renderer** — `PictographRenderer` via `GuidePictograph` /
   `GuidePictographGrid` (themeMode light, print-mode eager). Today's visual style.
   Choreo-card bake path for reference: `features/choreo-card/services/card-back/`.
4. **App component language** — level badges, LOOP/CAP markers, Choreo-card icons.
   The facelift layer (icons TBD per page — locate the real components, never
   hand-roll).

## Architecture

- `_components/GuidePage.svelte` — one real Letter-sized page (the unit). On
  screen: paper sheet w/ shadow (WYSIWYG). Print: one physical page + hard break.
  Replaces the old continuous-scroll-sliced-by-`@page` approach that caused the
  chaotic pagination.
- The print route (`print/+page@(public).svelte`) stacks `GuidePage`s.
- Pages are converted one at a time; un-converted chapters still flow below until
  their turn.

## Per-page recipe

1. Downscale + view the old artboard (`sharp(...).resize(720)` → /tmp → Read).
2. Enumerate every pictograph / sequence / diagram + the prose + the intent.
3. Confirm each pictograph/letter/position against MCP.
4. Rebuild as live current-style components inside a `GuidePage`.
5. Add proper level / LOOP / CAP / Choreo iconography where the concept calls for it.
6. Render the print route; screenshot the page; compare side-by-side to the artboard.
7. Austen signs off → mark ✅ → next page.

## Page inventory & status

Old guide = 47 pages. Mapping → our 3 chapters. Status: ⬜ todo · 🔧 in progress · ✅ done.

| # | Old page (artboard) | Our home | Status |
|---|---|---|---|
| 1 | Cover (Name / title ring) | print cover | ✅ |
| 2-3 | Drink water / Support author | front matter | ✅ |
| 4 | Read Me First | print cover pg2 | 🔧 |
| 5 | Table of Contents | front matter | 🔧 |
| 6 | 1.0 Positions & Motions (title) | positions-motions | ⬜ |
| 7 | The Grid | `_pages/TheGridPage` (body p1) | ✅ |
| 8 | Hand Positions (α/β/Γ, 16 picto) | `_pages/HandPositionsPage` (body p2) | ✅ |
| 9 | Hand Motions (shift/dash/static, 5) | `_pages/HandMotionsPage` (body p3) | ✅ |
| 10 | Type 1 Dual-Shifts (matrices) | `_pages/Type1AlphaBetaPage` (body p4) | 🔧 |
| 11 | Gamma (Quarter-Opp/Same intro) | `_pages/GammaPage` (body p5) | 🔧 |
| 12 | Type 2 Shifts | `_pages/Type2ShiftsPage` (body p6) | 🔧 |
| 13 | Type 3 Cross-Shifts (β→γ) | `_pages/Type3CrossShiftsPage` (`hm-type34`) | 🔧 |
| 14 | Type 4/5/6 Dash/Dual-Dash/Static | `_pages/Type456Page` (`hm-type56`) | 🔧 |
| 15 | Staff Positions (12) | `_pages/StaffPositionsPage` (body p9) | 🔧 |
| 16 | Staff Motions | `_pages/StaffMotionsPage` (body p10) | 🔧 |
| 17 | Negative Space / Body Turns | `_pages/NegativeSpacePage` (body p11) | 🔧 |
| 18 | 1.1 Letters (title) | letters | ⬜ |
| 19 | Double-Staff Codex Type 1-2 (30) | `_pages/DoubleStaffCodexT12Page` (bl-double-staff) | 🔧 |
| 20 | Codex Type 3-6 (17) | `_pages/DoubleStaffCodexT36Page` (bl-double-staff-36) | 🔧 |
| 21 | Type 1 Letters | `_pages/BaseLettersPage` (`base-letters`) | 🔧 |
| 22 | Basic Words ABC/GHI | ch11/AlphaBetaWords | ⬜ |
| 23 | Compound Letters (15) | ch11/CompoundLetters | ⬜ |
| 24 | Compound Words DJ/EK/FL | ch11/CompoundWords | ⬜ |
| 25 | Gamma Letters (13) | ch11/GammaLetters | ⬜ |
| 26 | Gamma Words MP/NQ/OR/STUV | ch11/GammaWords | ⬜ |
| 27-29 | Type 2/3 words + continuous | ch11/Type2ShiftLetters etc. | ⬜ |
| 30 | 1.2 Words / LOOPs / Reversals (title) | words | ⬜ |
| 31 | Complex words intro | ch12/WordsIntro | ⬜ |
| 32 | LOOPs (CAPs) | ch12/Caps + LoopsVsCaps | ⬜ |
| 33 | Full-reversal | ch12/Reversals + FullReversalCaps | ⬜ |
| 34-36 | Reversal/permutation practice (AABB etc.) | ch12/AABB*, ACAC* | ⬜ |
| 37-38 | Type 1 LOOPs / gamma connect | ch12/Type1Caps, GammaCaps | ⬜ |
| 39 | Type 2 LOOPs | ch12/Type2Caps | ⬜ |
| 40 | 16-Count Sequences | ch12/SixteenCount | ⬜ |
| 41 | 8-Letter Words | ch12/EightLetterWords | ⬜ |
| 42-43 | Prop-/Full-reversal LOOPs | ch12/PropReversalCaps, FullReversalCaps | ⬜ |
| 44-47 | Closing / festival / contact | front/back matter | ⬜ |

(Naming note: original used "CAPs"; current app uses "LOOPs" — facelift adopts
LOOP terminology, per existing section filenames already named Loops*.)

- 2026-07-08: TYPE 4/5/6 page (body p8, `hm-type56`) built —
  `_pages/Type456Page.svelte` (commit `fc7fa242a4`), proof "1.0 - Type 5 and 6"
  artboard (which actually leads with Type 4 - Dash). ONE physical page, THREE
  calligraphic titled sections + two full-width divider rules, so the manifest
  entry gained a **`selfTitled`** flag: GuidePage suppresses its single header
  and the page paints all three (`Type 4 - Dash` / `Type 5 - Dual-Dash` /
  `Type 6 - Static` via the shared `.guide-title` at proof y 22 / 340 / 592;
  rules y 336 / 587). TOC still reads the manifest title
  "Type 4/5/6 - Dash, Dual-Dash, Static". Box grid measured off the artboard
  border lines (4px/pt): Type 4 = 100pt boxes, Type 5/6 = 95pt. Sections:
  - **Type 4 (Dash)** — α→β 3-box (blue static S, red dashes S↔N) + γ→γ 5-box
    (hands alternate dashing, stays gamma). One dash + one static per box → NO
    arrow collision → `letter:null`; the DEFAULT zero-turn dash map already
    matches the artboard (S→N=W, N→S=E, E→W=S, W→E=N).
  - **Type 5 (Dual-Dash)** — α→α / β→β / γ→γ pairs. Both hands dash, so two
    dash arrows can COINCIDE (α→α, β→β sit on the same N–S line). `letter:null`
    puts both at the same location (overlap). Real letters route the separation
    via `dash-location-calculator.ts`: **Ψ-/Φ-** hit `PHI_DASH_PSI_DASH_MAP`
    (blue side WEST, red side EAST); **Λ-** hits `LAMBDA_DASH_ZERO_TURNS_MAP`
    (γ→γ: blue S→N→EAST, red E→W→SOUTH — `letter:null` would wrongly place blue
    WEST). Verified box-by-box vs the maps + artboard crops. The position glyph
    derives from `startPosition/endPosition` (NOT the letter), so a pedagogical
    α→α tagged Ψ- still shows the correct α→α glyph.
  - **Type 6 (Static)** — α/β/γ, both hands static, NO arrows. Uses
    `showTKA` (the bottom-left TKA letter glyph) instead of a position glyph, to
    match the artboard's single letter label. Facelift lowercase γ.
  Golden step ring + click-to-animate (`getGuideActiveStep` / `getGuideSequenceClick`,
  per-strip `key` `t56-4a/4b/5a/5b/5c`) wired on the five multi-step strips;
  Type 6 static is display-only (nothing animates). Facelift keyword tints:
  Dash/Cross green #2f9e44, Dual cyan #36c3ff, Shift purple #6f2da8, Static
  orange #f08c00; "two beta / 4-beat" proof OCR corrected to "two-step /
  4-step". Domain verified via MCP (`list_letters_by_type` 4/5/6 + motion-types
  topic). Verified: `npm run check` 0 errors/0 warnings; SSR `/print` HTTP 200
  with all three titles + corrected copy. Awaiting Austen's eyeball pass
  (arrow rendering, Type-6 glyph, title/rule/spacing fidelity) before ✅.

- 2026-07-09: STAFF POSITIONS page (body p9, `staff-positions`) built —
  `_pages/StaffPositionsPage.svelte`, artboard "1.0 - Layer 1 Staff Positions".
  12 real STAFF pictographs (props pinned via `bluePropTypeOverride`/`red…` so
  viewer prop settings can't leak in): α = blue W / red E, β = both S (system
  beta offset), γ = blue S / red E, × four thumb-orientation columns in
  blue/red order — in/in, out/out, out/in, in/out — authored as per-hand
  `startOrientation`/`endOrientation` on static motions (MCP: IN = toward
  center). The staff SVG's crossbar IS the thumb mark, so orientation renders
  the artboard's thumb line for free. Verified box-by-box vs artboard crops:
  alpha row 4/4, gamma row 4/4, beta row orientations 4/4 — beta's LEFT/RIGHT
  staff order differs (artboard blue-left/red-right; current beta-offset system
  renders red-left/blue-right; system-owned, kept — same path Type456Page's β
  shipped through). Facelift: lowercase γ row glyph (artboard used Γ); proof
  typos corrected ("Many of [the] pictographs", "categorizating"→
  "categorizing"). Geometry off artboard border scan (20px/pt): 99.8pt boxes,
  cols x 107.5/228.1/348.6/469.2, rows y 271.8/405.8/535.6, black 2pt rules at
  y 257.4/389.7/521.3. Text at PROOF_TEXT coords. Verified: svelte-check clean
  (3 pre-existing errors in another agent's feedback files), /print SSR 200,
  12 pictograph SVGs mounted, DevTools screenshot row-by-row vs artboard.
  Awaiting Austen's eyeball before ✅.

- 2026-07-09: STAFF MOTIONS page (body p10, `staff-motions`) built —
  `_pages/StaffMotionsPage.svelte`, artboard "1.0 - Layer 1 Staff Motions".
  Three rows (Prospin/Antispin/Dash): start/end/combined = REAL single-staff
  pictographs (red only); the HALFWAY frame (a mid-motion pose the system
  doesn't model) composes system pieces — a bare-grid pictograph (invisible
  placeholder motions) + the real staff SVG path with the renderer's own
  placement recipe (`translate(point) rotate(θ) translate(-126.4,-38.9)`,
  crossbar=+x): prospin SE-hand-point rotate(225°), antispin SE rotate(-45°),
  dash center rotate(-90°). End orientations follow the algebra (pro preserves
  in→in; anti/dash flip in→out) and matched the proof captions unprompted.
  KEY CONVENTION (MCP-verified vs letter B): `rotationDirection` = the PROP's
  rotation, not the handpath's — anti S→E (ccw handpath) takes CW; wrong
  direction renders the arc arrow swept backwards. Facelift deviations
  (flagged): frames are clean POSES (the proof drew partial-progress arrows in
  halfway/end frames; the motion arrow now lives only in the combined "="
  pictograph), and the top heavy rule moved 55.4→60pt to clear the Tangerine
  title descenders. Geometry: 100pt boxes, cols x 80.5/200.5/320.5/440.5, rows
  y 213.1/448.4/662.9; heavy rules y 60/583.1; hairline y 356.3. Verified:
  svelte-check clean (1 pre-existing store error, not mine), screenshot
  row-by-row vs artboard (thumb marks, halfway poses, arrow sweeps). Awaiting
  Austen's eyeball before ✅.

- 2026-07-09: NEGATIVE SPACE / BODY TURNS page (body p11, `negative-space`)
  built — `_pages/NegativeSpacePage.svelte`, artboard "1.0 - Prerequisites".
  Two REAL single-staff sequences, Start + 4 steps, fully system-rendered
  (StepNumber Start/1–4, arc/hook arrows, thumb crossbar from orientations):
  360° Isolation = 4×PRO S→E→N→W→S ccw, thumb in throughout; 4-Petal Antispin
  = same handpath, 4×ANTI prop-CW, thumb alternating in/out (orientation
  algebra). Companion click-to-animate deliberately NOT wired — the reader
  companion is hand-mode only today; staff playback is a deferred unlock
  (grow-on-demand). "VTG: 1:1" italic tag beside the title. Geometry:
  contiguous 99.8pt boxes, iso strip (52.2, 240.5), anti strip (48.3, 522.4),
  hairlines y 189.6/467.2; text at PROOF_TEXT coords (already "step" not
  "beat"). Verified: svelte-check 0/0, screenshot box-by-box vs artboard (both
  strips' orientations + arrows). Awaiting Austen's eyeball before ✅.

- 2026-07-09: DOUBLE-STAFF CODEX pages (bl-double-staff + NEW bl-double-staff-36)
  built by PURE REUSE — the printable codex (guide/codex, SHEET1/SHEET2, already
  parity-verified vs these exact artboards) is embedded via a new `embed` prop
  on CodexSheet (drops sheet chrome + title; GuidePage paints the manifest
  title). One codex source of truth, two frames. Manifest SPLIT (hm-gamma
  precedent): proof p19/p20 are two full sheets → "Double Staff · Types 1–2" +
  "· Types 3–6". Two context fixes in the thin page wrappers: (1) guide.css
  globally pins `.size-sm .pictograph-wrapper` to 120px which explodes the
  codex's 64px cells — scoped restore to cell-owned sizing; (2) body pages
  render FULL-BLEED (no .page-body padding) → wrapper carries `1in 0.55in 0`
  and cells scale to 86px so the sheet fills like the artboard. Verified:
  svelte-check 0/0, guide unit tests 26/26, screenshots of both pages (T1: 7
  boxes incl. STUV full row; T2: OPEN/CLOSE + Greek names; T3-6: all four
  sections + dividers), content 1016/1004px ≤ 1056 sheet. Awaiting eyeball.

- 2026-07-09: STAFF STRIPS CLICK-TO-ANIMATE (Austen directive) — the two
  Negative Space strips (360° Isolation, 4-Petal Antispin) are now clickable in
  the reader and animate REAL STAVES from the authored in-orientation. Seam:
  `GuideSequenceClick` gained `propType?: "hand" | "staff"` → GuideReader holds
  it → GuideCompanion's new `propType` prop feeds InlineAnimationPlayer's
  blue/redPropType (previously hardcoded "hand"). The adapter's linear-path
  forcing is now HAND-ONLY — staff strips keep their natural arc (linear would
  detach the isolation's pinned center end mid-sweep). Cells carry an invisible
  blue placeholder (both-hands step contract). Verified in the reader via
  DevTools: click → companion opens, red staff animates pinned-at-center
  (arc), accent ring + golden step ring track live. NOTE (Austen 2026-07-09):
  the embedded codex pages are NOT the intended look — codex will be redone
  manually; treat bl-double-staff/-36 as placeholders pending his direction.

- 2026-07-09: BASE LETTERS page (body p12, `base-letters`) built —
  `_pages/BaseLettersPage.svelte`, proof p21 / artboard "1.1 - Letters - Type 1".
  The first REAL letters: A B C (α→α Split-Same, blue s→w / red n→e) and G H I
  (β→β Tog-Same, both e→s) in the Pro - Anti - Hybrid pattern, each cell a real
  PictographContainer in the system's letter language — grid + motion arrows +
  STAFF props + bottom-left `showTKA` glyph (the codex/workspace form; the old
  artboard drew bare arrows only — flagged facelift deviation; the in-orientation
  staffs happen to read exactly like the artboard's blue/red bars). NOT authored
  as HAND: PictographPreparer's hand-path mode converts everything to FLOAT,
  which would erase the pro/anti distinction this page teaches. All six letters
  MCP-verified (`get_pictograph_data`): pro = prop CW with the handpath (in→in),
  anti = prop CCW (in→out), hybrids C/I = blue anti + red pro (proof: "right is
  in pro and left in anti"). Artboard variant identified via the source strips
  (`images/level-1/alpha-beta-words/`): A/B/C = alpha1→alpha3, G/H/I = the e→s
  frame. NOTE: MCP G var0/var2 carry internally inconsistent position names vs
  locations (beta3→beta5 with w→n locations); authored by explicit LOCATIONS.
  Reader: every cell clickable → companion animates Start→letter with staffs
  from the in orientation (per-cell 2-step strip, keys `bl-A`…`bl-I`); golden
  ring = whole cell while its letter plays. Faithful-with-corrections: "A,B, and
  C"→"A, B, and C", Tog-Same italicized to match Split-Same, the β→β margin
  label (dropped by extraction) restored symmetric to α→α, margin glyphs are
  real PositionGlyphs, Dual-Shift head reuses the Type-1 tokens (#36c3ff/#6f2da8)
  and right/left the cR/cB tokens instead of the artboard hexes. Painted title
  stays the manifest "Base Letters" (artboard says just "Letters" — flip to
  selfTitled if Austen prefers). Geometry off the artboard border scan (20px/pt):
  both boxes x 154.5, 3×120pt cells, ABC y 231.8, GHI y 563.4, heavy rule
  y 123.5, col labels y 207/536, text at PROOF_TEXT coords (intro nudged
  52.8→56 to clear the Tangerine title). Verified: svelte-check 0/0, DevTools
  screenshots vs artboard (arrow shapes pro-arc/anti-hook/hybrid per cell),
  reader deep link `/learn/guide/base-letters` lands parked, click letter A/C →
  companion staff animation + rings live, console clean. Awaiting eyeball.

- 2026-07-09: HAND MOTIONS page reimagined for clickability (Austen directive
  "let's reimagine it for clickability!") — `_pages/HandMotionsPage.svelte`,
  reader-only, print/book untouched (SelectionHit renders nothing without the
  selection scope). TEN click targets through the existing companion seam:
  - The four motion demo boxes (shift ×2, dash, static — Start box stays
    display-only) play their single blue-hand motion; the red hand is an
    invisible placeholder (both-hands step contract, NegativeSpace pattern).
    Static plays a deliberate hold — teaches the beat.
  - The six combination cells (name + description, hit region bounded by the
    table's own dividers) play a canonical two-hand example of EXACTLY what the
    cell's description says: Dual-Shift blue W→N + red E→S; Shift blue W→N +
    red static; Cross-Shift blue W→N + red dash E→W; Dash blue dash W→E + red
    static N; Dual-Dash W↔E swap (the Type-5 canonical swap-through-center);
    Static both resting. All Start + 1 step, propType "hand" (linear paths via
    the adapter's hand mode).
  Selection ring + golden play ring on whichever box/cell is animating.
  Verified in the reader via DevTools: 10 labelled hits, dash demo click →
  companion opens; Dual-Shift combo click → both hands travel simultaneously
  (mid-flight screenshot); console error-free; svelte-check 0/0. Awaiting
  eyeball.

- 2026-07-09: AUTONOMOUS BOOK RUN (Austen: skip prop codexes, full freedom to
  finish the book). LEDGER — [x] done · [ ] remaining:
  - [x] lt1-abc-ghi → `AlphaBetaWordsPage` "Alpha/Beta Words" (`a582ea0f11`) —
    AAAA/BBBB/CCCC + GGGG/HHHH/IIII word strips, shared Start per block,
    click-to-animate; proof p22.
  - [x] lt1-dj-ek-fl → `CompoundLettersPage` "Compound Letters" (`6c6551fff6`)
    — Tog-Opp/Split-Opp D–L grid + DJ/EK/FL strips; proof p23 (v05 merged the
    old letters+words pages).
  - [x] lt1-mp-nq-or-stuv → `GammaLettersPage` "Gamma Letters" (`3b831745d3`)
    — QO grid M–R, MP/NQ/OR strips, QS row STUV (red leads; U=leader-pro,
    V=leader-anti); proof p25.
  - [ ] NEW ENTRY `lt1-gamma-words` "Gamma Words" after lt1-mp-nq-or-stuv —
    proof p26 / artboard "1.1 - Gamma Words - MP, NQ, OR, STUV.png" (no
    PROOF_TEXT; text read off artboard).
  - [x] NEW `lt1-gamma-words` "Gamma Words" (`7627054b1a`) — proof p26; 7 word
    rows (MPMP/NQNQ/OROR + SSSS/TTTT/UUUU/VVVV) off shared γ Starts.
  - [x] lt2-wxyz → `Type2ShiftLettersPage` "Type 2 - Shift" (`fad6746244`) —
    selfTitled purple head, level 0, letters-type2 row removed; 4 OPEN/CLOSE
    boxes + WΣYΘ/XΔZΩ word rows.
  - [x] lt3-dash-letters → `Type3CrossShiftLettersPage` "Type 3 - Cross-Shift"
    (`07f62d8711`) — selfTitled, level 0, letters-type3 removed; LABEL
    CORRECTION: Σ-/Δ- start BETA, Θ-/Ω- start ALPHA (dataset; old guide had
    them swapped); W-/Δ- start→halfway→end=combined breakdowns w/ composed
    staff poses.
  - [x] lt456-phi-psi-lambda → `Type456LettersPage` (`df0e101b11`) —
    selfTitled 3 sections, level 0; letters-type456/-dash/-abg + letters-type1
    rows removed.
  - [x] words → `WordsPage` (`9644361cc9`) — AABB ×3 thumb orientations
    (in|in, out|out, in|out).
  - [x] permutations → `LoopsPage` "LOOPs" (`71f54965f5`) — CAP→LOOP facelift;
    Mirrored (R R step 5) / Rotated (DΨ ×4, no R) / Swapped (Δ-TQZ- ×2, blue R
    3+5, red R 7); reversal flags = prop-rotation flips only.
  - [x] reversals → `ReversalsPage` (`fefb9f213c`) — hand/prop/full reversal
    strips (single staff, Start at N); R = system indicator on the step
    (facelift from the old gutter "R"); prop-only rule throughout.
  - [x] examples-abc → `ExamplesPage` "Examples" (`6e90109b0b`) — AABB with
    reversals after 2&4 / 1&5 (Mirrored LOOP) / 3&7; steps-not-beats.
  - [x] misc-permutations → `Type1LoopsPage` "Type 1 LOOPs" (`3ceaa4808b`) —
    DJII Mirrored / BBLF Swapped & Rotated / KIEC Swapped & Mirrored, 24 cells
    decoded from artboard crops, all chains close home. NO reversal flags —
    faithful to the artboard (page teaches LOOP classification; the old guide
    draws no R here even where props flip at the repetition seam). CDP
    screenshot vs artboard verified (headless Chrome, ws+CDP recipe — the
    extension's save_to_disk files were not locatable on disk). THE MANIFEST
    IS NOW FULLY BUILT except the parked codex pages (bl-*) awaiting Austen's
    manual direction.
  - [x] Unhomed p35/36/38-43 ALL BUILT (2026-07-13 Fable run) — 8 new manifest
    entries + pages, every step matched to `list_letter_variations` indices,
    reversal dots derived via bakeReversals (land exactly on the artboard's R
    marks), print-route screenshots verified vs artboards:
    `examples-cccc` HybridReversalsPage (AABB rev-after-2nd-B + CCCC
    hand/prop/full rows) · `examples-acac` MixedWordsPage (ACAC ×2 + BCBC) ·
    `gamma-loops` GammaLoopsPage (SOTR/VPUQ/MVNU Rotated) · `type2-loops`
    Type2LoopsPage (BΣTX/EΔUZ/OYHΘ Rotated) · `sixteen-count` SixteenCountPage
    (GθOZ ×4, EΔQY ×4) · `eight-letter-words` EightLetterWordsPage (IIΩXKEΣY +
    CΣNZIΘUW; LANDSCAPE original reflowed to portrait Start+4×4; word 2's 7th
    letter is U not V — dataset U[8]/U[5] are what keep both hands continuous,
    Austen caught the initial V misread) · `prop-reversal-loops`
    PropReversalLoopsPage (EΣQY/TWKΘ/BΔMX) · `full-reversal-loops`
    FullReversalLoopsPage (CCKE/FLII/DAK×4). Convention learned: the TKA
    webfont cmaps UPPERCASE Greek only (Θ not θ) — tka-font runs must use Θ.
  RUN END 2026-07-09: 10 pages built+committed this run (lt1-abc-ghi through
  examples-abc) + Staff Motions/Hand Motions/Base Letters interactivity.
  Verification caveat for the run's later pages: dev server 5173 went down
  mid-run and the reader (/learn) redirects in the extension Chrome profile
  (logged out), so click-to-animate for pages after Compound Letters rides on
  the seam verified live 3× earlier today; print-route rendering of EVERY page
  was screenshot-verified against its artboard on a self-hosted vite :5174.
  Verification mode after DevTools MCP dropped mid-run: own vite on :5174
  (user's 5173 dev server went down; hooks forbid npm run dev), claude-in-chrome
  screenshots on /print (reader /learn/* redirects — that Chrome profile is
  logged out), check:fast per page + one full check at run end. Reader click
  runs for pages after Compound Letters ride on the seam verified 3× earlier
  today (base-letters, hand-motions, staff-motions).

- 2026-07-09: STAFF MOTIONS combined pictographs click-to-animate (Austen: "make
  the end motion animatable also") — the three combined "=" pictographs
  (Prospin/Antispin/Dash) each play Start → motion in the companion with the
  real staff from the in orientation (keys `sm-pro/anti/dash`, propType staff,
  blue invisible placeholder). Start/halfway/end frames stay display-only.
  Verified: 3 labelled hits, prospin click → staff animates from S with
  crossbar toward center + golden ring on the combined box (screenshot).
  Same-key re-click toggles selection (seam behavior, pre-existing). Also per
  Austen 2026-07-09: SKIP the prop codex pages (bl-clubs/buugeng/triads/fans/
  mini-hoops) — they stay placeholders with the double-staff codex until his
  manual codex direction; full freedom granted to finish the remaining book
  pages autonomously.

## Conventions (facelift — supersede the old guide)

- **gamma = lowercase γ** (NOT uppercase Γ). The old artboards + existing guide
  assets (`images/hand-positions/Γ*.png`, old captions) use uppercase Γ — that is
  stale. Use γ everywhere; find-and-fix the Γ usages during page work.
- "CAPs" (old) → "LOOPs" (current app term).

## Decisions log

- 2026-07-05: GAMMA/TYPE-2 PAGE SPLIT + GAMMA (body p5, `hm-gamma`) built.
  The manifest merged `hm-gamma-type2` as one entry, but the proof has TWO full,
  dense pages — p11 Gamma (γ→γ Quarter-Opp/Quarter-Same + an 8-box QO↔QS
  switching sequence) and p12 Type 2 - Shifts (single shift + same-dir 8-box +
  opp-dir 8-box). Cramming both onto one physical page = illegible, so the entry
  was split into `hm-gamma` + `hm-type2` (numbers re-derive; staff-positions and
  everything after shift +1). `_pages/GammaPage.svelte` follows the Type1 recipe
  exactly: three proof-placed strips of real PictographContainers, all adornments
  system-owned (float arrows, Start/count StepNumber, γ→γ PositionGlyph, geometric
  ElementalGlyph), grouped centred paragraphs, left row-label glyph + italic mode
  name, QO Parallel/Antiparallel column headers. Geometry from the proof operator
  list (QO L90.6/T124, QS L90/T279.2, swap L56.2/T512.9 5×2 grid, box 5 under 1);
  text y = baseline − fs, glyph line 21.7pt above the mode name (calibrated
  against proof p10 vs the shipped Type1 values — exact match). Sequences decoded
  from the artboard and cross-checked with MCP: QO = opposite-spin 90°-apart loop
  (its counts ARE the Parallel/Antiparallel columns), QS = same-spin 90°-out-of-
  phase loop (red leads blue by one point), swap alternates QO/QS and closes back
  to Start — all three verified to close. Letters left null: `deriveTnD` and the
  position deriver are purely geometric, and no gamma box has both hands on an
  identical from→end path, so default float placement separates every arrow (the
  α/β Tog special-placement tier does not apply). Verified: `npm run check` exit
  0; SSR HTTP 200 with 19 boxes + 8 labels + 5 paragraphs + float arrows. Awaiting
  Austen's eyeball pass (float-arrow directions, glyph/layout fidelity) before ✅.
  Facelift convention applied: lowercase γ→γ (proof used Γ), footer "Dual-Shifts"
  two-tone (Type-1 blue/purple).
  - 2026-07-05 (review pass 1): Austen flagged 3 issues, all fixed +
    screenshot-verified. (1) The facelift title overlapped the header text (proof
    p11 had no title) — compressed the page y-range [30.8, 745.1] → [72, 730]
    (fitY, ~8% squeeze), baked into the coords so edit-drag stays 1:1. (2) QO
    "antiparallel" boxes (b2/b4) arrows overlapped: same-edge floats (blue W→N vs
    red N→W; E→S vs S→E) need the letter-gated special-placement tier, which
    letter=null skipped. Set letter P (both-PRO Quarter-Opp; canonical
    DiamondPictographDataframe rows 187/188; P_placements.json "(fl, fl)" red
    [70,-75], blue → default float_to_layer1_gamma [30,-30]). Only b2/b4 share an
    edge (QS's one-point lead and all switch boxes don't). Root cause diagnosed by
    arrow-positioning-expert: `detectLayerInfo` gates the α/β/γ placement-key
    suffix behind a letter, so null degrades to the bare "float" key miss → (0,0)
    for both. (3) Position glyph rendered faint — PositionGlyph flips via a
    `:root.dark` invert(0.9) filter (the guide app shell carries `dark`) that fired
    on the WHITE sheet; cancelled with `.guide-page .position-glyph { filter:none }`
    in guide.css (fixes Type1's glyphs too). Step numbers were already pipeline
    `<text>` and dark (StepNumber honours the darkMode prop) — the "plain text"
    look was the same glyph faintness, not a hand-rolled overlay.
    Latent follow-up (not blocking): DirectionalTupleProcessor's float branch
    computes CW/CCW against a diagonal [NE,SE,SW,NW] order, so diamond cardinal
    floats always `indexOf === -1` → same rotation branch. Worth a ticket.

- 2026-07-05: COMPARE ROUTE DELETED (`(public)/guide/level-1/compare`).
  Scroll-fraction sync could never align two different-height documents
  (old proof 47pp vs rebuild 39pp, different order); a page-mapping table
  would rot as pages convert. Verify pages against the artboards/proof
  directly (per-page recipe step 6).

- 2026-06-21: Rejected embedding old artboard PNGs directly — they carry the OLD
  pictograph style. Rebuild with current renderers instead (Austen's call).
- 2026-06-21: Each page = a `GuidePage` unit (fixes pagination structurally).
- 2026-06-21: Cover — title (text) is the hero; supporting visuals must be
  HONESTLY distinct (rejected element-tinting identical mandalas). Feature "the
  three variations of Level 1" (trio TBD: positions α/β/γ vs spins pro/anti/hybrid).
- 2026-06-21: COVER SHIPPED. Component `_components/GuideCover.svelte` (shared by
  cover-lab + print route). Design:
  - Three motions as deterministic MCP geometry: Iso=A dual-pro (circle),
    Anti=B dual-anti (lens rose), Dash=Λ- dual-dash (a +). Closed loops → radial
    symmetry. Path = ARC only (concave/linear NOT canonical TKA yet).
  - Combined emblem (all three overlaid) above an ARC trio (iso·dash·anti).
  - Colour = the two PROP HANDS (blue/red), never motion type (rejected
    motion→hue as a false mapping). Trio/emblem share the prop colours.
  - Title font = **Fraunces wonky italic** (OFL, embeddable+sellable). Monotype
    Corsiva rejected (proprietary, illegal to embed in a sold PDF). Companion
    text = Cormorant Garamond.
  - "Level 1" = canonical baby-blue difficulty badge (inlined from
    difficulty-styles so the bare (public) route stays light — do NOT import
    @tka/render-composition here, it hangs the route).
  - TWO editions, one component, `theme` prop: `navy` (matte navy + gold foil,
    glowing line-art — digital / pro / foil) and `light` (ivory + ink rule,
    dark line-art — cheap home printer). Print route selects via `?theme=home`.
  - Mandala sizes scale to container width (bind:clientWidth) so the same
    component fills the 540px lab preview and a full 8.5×11 print page.
- 2026-06-21: Home-print affordance — navy cover is ink-heavy on inkjet (full
  dark coverage warps plain paper, no real foil, usually no borderless). Ship
  navy for digital/pro; `?theme=home` light edition for home. Interior pages
  stay white regardless.
- 2026-06-22: SUPPORT PAGE (p3) finalized. Two methods only — PayPal + Venmo
  (Cash App dropped, Austen doesn't use it). Colour brand logos, not mono (the
  cropped PayPal/Venmo wordmarks have white backgrounds, so CSS ink-tinting
  produces grey boxes; true mono would need custom transparent wordmarks — not
  worth it). Layout = two centred columns, each QR → logo centred directly below
  → italic handle, matching Austen's original donation sheet. Copy rewritten to
  drop the banned em dash and avoid "The Kinetic Alphabet" mid-sentence (so it
  can't wrap two lines). Soft "Suggested $20–30 · any amount helps" kept small
  (anchors an amount without pressure). Assets in
  `static/guide/level-1/images/_shared/`: `qr-paypal.png` + `qr-venmo.png`
  (1200px, jsqr round-trip verified) and `logo-paypal.png` + `logo-venmo.png`
  (cropped from `D:\…\_GUIDE\source\QR Codes.png`). Compare view added at
  `(public)/guide/level-1/compare` (old v0.5 PDF vs live rebuild, navy/home
  toggle).
- 2026-06-22: SUPPORT SCHEME PIVOT (Option A). The printed book now carries ONE
  QR → `tkaflowarts.com/support`, a page Austen owns, instead of per-method QRs.
  Rationale: print is permanent; a self-owned landing page lets handles change /
  methods be added without reprinting, keeps TKA branding (not Linktree), and
  reuses the existing domain. New route `(public)/support/+page.svelte`
  (prerender, registered in `domains.ts` PUBLIC_PATH_PREFIXES) — mobile-first
  (QR-scanned on phones), navy/Fraunces to read as the book's online extension,
  two tappable cards linking to `paypal.com/paypalme/austencloud` and
  `venmo.com/code?user_id=2250430063050753012` with real brand logos
  (`static/support/logo-{paypal,venmo}.png`). Book p3 simplified to the single
  boxless `qr-support.png` + the URL caption. Per-method QRs
  (`qr-paypal/venmo.png`) deleted — superseded. (Cash App dropped: Austen
  doesn't use it.)
- 2026-06-22: TABLE OF CONTENTS (p5) built. Scope = Level 1 only (1.0 Positions
  / Motions, 1.1 Letters, 1.2 Words); the artboard's 1.3 Single-Turns / 1.4
  Double-Turns are later-level content with no pages here, so omitted (flagged to
  Austen). Entries + sub-entries transcribed from the original artboard, with the
  facelift γ-not-Γ convention applied. Layout = two columns (1.0 + 1.2 left, the
  longer 1.1 right), Fraunces section heads with navy section numbers + a hairline
  rule, Cormorant entries, muted italic indented sub-entries. Page numbers
  omitted for now — to be injected programmatically once pagination is final.
  Verified: fits one 11in page (902/1018px), renders in `print/+page`.
- 2026-06-22: SUPPORT SCHEME CONFIRMED. Cross-session conflict surfaced (this
  session had locked the in-print two-up PayPal/Venmo; a parallel session pivoted
  to the single-QR → `/support` scheme). Austen confirmed: KEEP the single-QR
  pivot. The two-up is intentionally superseded; do not restore it.
- 2026-06-22: READ ME (p4) text corrected — a fabricated "In a pictograph, the
  arrow shows…" paragraph was removed and the original transcribed verbatim from
  the artboard (salutation + work-in-progress + "I can't wait to see…" closing).
- 2026-07-05: TYPE 1 α/β PAGE (body p4, `hm-type1`) built, then REDONE per
  Austen's correction — pictograph adornments must be the SYSTEM'S, never
  hand-rolled lookalikes. The standing rule for every remaining page:
  - **Hand motion arrows** = real float arrows. Author movers as PRO shifts;
    `PictographPreparer`'s hand-path mode (auto when both props are HAND)
    converts them to FLOAT ("fl", handPath derived from locations) and the
    arrow pipeline places the system float arrow. Never draw arrow SVGs.
  - **Count numbers** = `StepData.stepNumber` + `stepNumberOverride` (0 renders
    "Start", 1..n numerals) via the renderer's top-left StepNumber overlay.
  - **Positions** = `startPosition`/`endPosition` (`getGridPositionFromLocations`)
    + `showPositions` → top-centre PositionGlyph. Never type α→β as page text.
  - **Mode/elemental** = `showElemental` → bottom-right ElementalGlyph, derived
    by `deriveTnDFromPictograph` from the four hand locations. Never badge text.
  - **Text = grouped centred blocks** (one draggable box per paragraph, like
    the original PDF), not the extraction's per-line runs.
  Strip geometry from the PDF operator list: 500×100pt strips at
  (95.3,142.8)/(95.3,262.0)/(92.6,472.0)/(92.6,588.3), five 100pt boxes.
  - **Boxes carry their real letter** (MCP: A=α→α, G=β→β, D=β→α, J=α→β; start
    boxes letter-null like app start positions). The letter keys the
    special-placement tier — G/H "(fl, fl)" per-color entries are what separate
    same-path float arrows (Tog rows). SYSTEM FIX that unlocked it:
    `transformForHandPath` was blanking orientations to undefined, killing
    placement-key layer detection for every hand pictograph app-wide; floats
    now keep IN. Regression test:
    `tests/unit/arrow-adjustment/HandPathFloatSeparation.test.ts`.
  Content confirmed against MCP VTG data: α→α=SS, β→β=TS, α↔β = SO from a
  side-point start / TO from a bottom start — the original book's teaching
  matches current domain data exactly.
- 2026-06-22: PAGE NUMBERING + AUTO-TOC system shipped (spec
  `2026-06-22-guide-page-numbering-toc-design.md`). Single source of truth =
  `_data/guide-manifest.ts` (34 body pages, 1 entry = 1 page, number = index+1).
  `GuideTOC.svelte` generates the TOC (numbers, dot leaders, subs) from it;
  `GuidePage` renders a recto/verso footer number (odd→right, even→left, page
  1=recto); `page-number-prefs.svelte.ts` + `PageNumberToggle.svelte` toggle on/
  off (viewer chrome, default on). Body pages now render from the manifest:
  built component (registry `BUILT` in print route, empty for now) or
  `PagePlaceholder`. Legacy continuous chapter dump removed; section components
  (`TheGrid.svelte` etc.) retained for reuse during conversion. `@page` margin
  set to 0 so each GuidePage is a true 8.5×11 sheet supplying its own margin
  (footer prints where it shows). To convert a page (p6+): build its per-page
  component, register it in `BUILT` under the manifest id — number + TOC are
  already correct.
- 2026-07-05: TEXT-BLOCK CONSOLIDATION + COLOR-CODING (commit `5ad33718a0`).
  Per-line extraction runs merged into single draggable centred `.para`/`.intro`
  blocks so multi-line intros move as one unit (like the original PDF): Hand
  Positions intro (3 lines→1, inline `Red = Right`/`Blue = Left` legend), The
  Grid intro (4 lines→1) and its three point descriptions (center/hand/outer→1).
  Type 1 "Dual-Shift(s)" now colour-coded `Dual` cyan (#36c3ff) + `-Shift(s)`
  purple (#6F2DA8) — the Type-1 letter colours — matching the original;
  HandMotions/Gamma already did. Verified: `npm run check` exit 0 + DevTools.
- 2026-07-05: PICTOGRAPH ACCESSIBILITY / METADATA (Task D). App-wide, not
  guide-only: `PictographRenderer` swapped its static `aria-label="Pictograph"`
  for a generated description + a `<desc>` element, so every pictograph in the
  app is machine-readable by screen readers, search crawlers, AI agents, and
  anyone reading the HTML source. Generator = new pure util
  `shared/pictograph/shared/domain/utils/pictograph-description.ts`
  (`describePictograph`): builds "Letter G, beta (hands together), Together-Same
  timing. Blue hand float south to west; Red hand float north to east." from the
  data the renderer already holds (letter, start/end position groups α/β/γ with
  a plain-language gloss, per-hand motion type + from→to locations, turns),
  reusing the renderer's derived TnD mode. Hand pictographs correctly read
  "float" (a hand can't spin — detected via `propType === HAND` on a PRO/ANTI
  shift, or FLOAT/"fl"); staff pictographs elsewhere still read "pro-spin shift".
  Guide extras: α/β/γ section glyphs (`img.glyph`) got real `alt` ("Alpha (α)"
  …); the diamond/box/8-point Grid figures got `role="img"` + `aria-label` +
  `<desc>`. Verified via DevTools: 61 pictographs, 0 generic labels, `<desc>` on
  all, no console errors. On the original's "use the canonical glyph, don't type
  α/β/γ": already satisfied — position pictographs render the bottom-left TKA
  glyph via `showTKA`; the accessibility layer is what makes that glyph readable.
- 2026-07-05: TERMINOLOGY beat→step in user-facing text (commit `209bcbfd21`).
  Guide + About prose + keyboard/Village/copier labels; musical beats (Compose
  timeline, BPM, metronome, effect triggers) and code identifiers deliberately
  kept. Fixed the "two beta sequence" OCR typo → "two-step sequence" on the
  proof-text (type-5/6) page. See memory `feedback_step_not_beat` carve-out.
- 2026-07-05: TYPE 2 - SHIFTS page (body p6, `hm-type2`) built —
  `_pages/Type2ShiftsPage.svelte`, proof p12. Same recipe as GammaPage: three
  proof-placed strips of real PictographContainers, all adornments system-owned,
  grouped centred paragraphs. A Shift = one hand shifts + one hand static, so
  every box has ONE float arrow (no same-edge collision → NO letters needed,
  unlike Gamma's antiparallel P cells). Three strips: single (L56 T118.2 500×100,
  blue static S / red floats CCW), same-direction 8-box (L56 T308.8 500×200, all
  shifts clockwise, anchor hand swaps at beta), opposite-direction 8-box (L56
  T550.9 500×200, red always CCW / blue always CW, alternating shifter). All
  three sequences decoded from the "…gamma and Type 2 copy 2" artboard (=proof
  p12; the non-"copy 2" artboard is the Gamma page) and verified to close the
  loop; every arrow direction cross-checked box-by-box against the artboard
  crops. NO fitY squeeze — proof p12 already carries its own "Type 2 - Shifts"
  title, so proof coords used directly. showElemental off (Shifts aren't a T&D,
  proof shows no badge). Facelift: lowercase γ, purple "Shift"/"Shifts". Verified:
  `npm run check` exit 0; DevTools 23 pictographs, layout + glyphs + arrows match
  the proof. Awaiting Austen's eyeball pass. Registry `BUILT["hm-type2"]` added.
- 2026-07-10: POST-BUILD REVIEW ROUND (Austen's notes + board-wide self-audit).
  (a) Companion overlay fixed — InlineAnimationPlayer never passed currentStep
  to AnimatorCanvas, so the top-left label froze at "Start" (and the minimal
  progress line never moved). One-line wire-through; CDP-verified timeline now
  Start → step N → End (End only on non-loopable strips; seamless LOOPs
  correctly skip it). Commit `96cbdc1811`.
  (b) Type 1 LOOPs page: BBLF steps 7-8 corrected (Austen caught it) — the
  Swapped & Rotated second half must trade the colors' roles; step 7 = blue-PRO
  n→w + red-ANTI s→w, step 8 continues home. Letters stay L/F (hybrids keep
  their letter under color swap — L/F MCP re-verified). Reversal dots now
  DERIVED via `bakeReversals()` (new, guide-sequence-adapter.ts; canonical
  engine `deriveReversals`, propReversal channel, linear read, start box inert)
  instead of hand-authored — the old buggy 7-8 contained a real unmarked prop
  reversal, which is the exact failure derivation closes. Derived dots: DJII
  R/R at step 7 (mirror point), KIEC steps 2-3 (K→I→E retraces), BBLF none.
  showReversals now true on this page. Commit `80980389c6`.
  (c) TKA Letters webfont for sequence-word TITLES (margin words DJII/BBLF/KIEC;
  DJ/EK/FL + MP/NQ/OR strip captions) — real selectable text via `.tka-font`
  (app.css global). Austen's rule: title-position words get the font; prose
  mentions stay serif (in-paragraph glyphs sized awkwardly — reverted).
  (d) Board-wide audit (4 parallel Sonnet auditors, every BUILT page): ZERO
  motion-data bugs beyond BBLF. All four SUSPECT-LETTER flags dismissed against
  the canonical dataset (list_letter_variations): U/V on the gamma pages match
  variations U[14]/V[14] exactly (leader is positional — the compact
  get_letter_explanation line only reflects variation 0); Type 2 Σ/Δ box vs
  word-row = variations Σ[0]/Σ[5] (mirror-invariance makes opposite chirality
  legitimate); Type 3 Δ- box vs breakdown = Δ-[0]/Δ-[6]. ReversalsPage flags
  recomputed clean. Remaining NITs (unkeyed static {#each}es on
  HandPositions/TheGrid, family-only margin-glyph position literals,
  BaseLettersPage hardcoded-CW helper, GammaWordsPage dead `block` param) are
  documented-cosmetic; left as-is.
  (e) Words-chapter auditor addendum: WordsPage/LoopsPage clean (all authored
  R flags match linear recomputation exactly). ExamplesPage ex-v1's step-1 R
  flag uses CYCLIC (loop-wrap) semantics — flagged by the auditor as a linear-
  convention violation, but it is artboard-faithful (proof marks R on 1 & 3;
  "reversal after step 4" wraps onto step 1 of the repeat) and documented in
  the page comment. Deliberate; kept. KIEC observation: locations close home
  but orientations end OUT/OUT vs the IN/IN start — LOOP closure is scoped to
  positions (locations), so faithful; noted for awareness. Type1LoopsPage
  independently re-derived by the auditor (chains, swap+rotate transform,
  deriveReversals by hand): all confirmed post-fix.
