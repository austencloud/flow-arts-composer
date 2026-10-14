# /notation/caps Exhibit Redesign: Curve Atlas and Focused Construction

**Date:** 2026-08-01
**Status:** PROPOSED governing design. Authored by Claude Fable 5 at Austen's request,
following the 2026-08-01 Fable design review. Ready for Codex implementation planning.
**Awaiting Austen's explicit approval before any implementation.**
**Route:** `/notation/caps`
**Supersedes:** the article-depth sections and the interactive-math section of
`docs/superpowers/specs/2026-07-19-notation-caps-destination-design.md` (sections 2 through 6
of that spec's page structure). Preserves that spec's research gates and attribution
discipline. Preserves the shipped hero decisions of
`docs/superpowers/specs/2026-07-20-notation-caps-redesign-design.md` and
`docs/superpowers/plans/shipped/2026-07-20-notation-caps-redesign.md` (CapsHub bento hero,
YutaCapLiveDemo, thumbnail video cards) except where section 5.1 explicitly changes one
tile behavior.

---

## 1. Executive decision and user problem

**Decision:** rebuild everything below the CapsHub hero as an exhibit-led chapter. A curve
atlas becomes the mathematics entry point: a curated seven-example atlas holding four
representative elementary patterns and all three source-published assembled CAP plots,
reconstructed from their exact parameters in TKA's own SVG rendering. Damien published or
referenced the parameter examples; the linked elementary illustrations he embedded are
Robert Ferréol's (mathcurve.com). Selecting an atlas
curve opens one focused live construction with three progressive layers (Trace, Assembly,
Mechanism). History, credits, the CAPs/LOOPs comparison, videos, and sources follow in a
fixed order with fixed grids.

**The user problem, in concrete terms.** On a 4K monitor (the 2600px `--shell-w` band):

- Prose spans the full band beneath a full-viewport hero, and the same explanation appears
  three times: in the hub tile copy, in `#what-is`, and in `#breakdown`
  (`src/routes/(public)/notation/caps/+page.svelte`).
- `.cap-people` uses `repeat(auto-fill, minmax(280px, 1fr))`: roughly nine tracks holding
  five cards. `.cap-media-grid` uses `repeat(auto-fill, minmax(320px, 1fr))`: roughly
  eight tracks holding six cards. Both produce stranded tracks, which
  `.claude/rules/4k-native-layout.md` forbids.
- `TrochoidModel.svelte` gives its square stage `1.42fr` of the band. At the 2600px shell
  the stage renders roughly 1500px on a side while the `0.72fr` control rail holds five
  sliders and empty space. The embedded app dominates the page and the rail reads as
  unfinished.
- The source-published CAP plots surface only as two archived JPGs (one inline figure,
  one in a collapsed drawer) plus one TKA redraw. They are the most interesting
  mathematical artifacts the page owns and they are not primary content.

**Why atlas-first is the right information architecture.** The page's job is education
plus provenance. The atlas gives the math section an immediate visual payoff, makes the
source-published plots the primary educational material (Austen's stated goal), and fixes
the giant-stage defect structurally: the full construction is opt-in per curve instead of
rendered at full size for one abstract default.

---

## 2. Goals, non-goals, source of truth

### Goals

1. A curated atlas of four representative elementary patterns and all three
   source-published assembled CAP plots, reconstructed in TKA's rendering from structured
   parameter data, with Damien's archived originals retained as contextual provenance.
2. One live construction, entered from the atlas, with progressive disclosure instead of a
   permanently maximized parameter lab.
3. Fixed, orphan-free grids at every required viewport. Deliberate composition at 1920,
   2560, and 3840.
4. Attribution that is factual, source-linked, and narrowed to documented contributions.
5. A single mathematical source of truth in `packages/caps-domain`, consumed by the build
   script and the page, with the join mathematics corrected (section 7).

### Non-goals

- No TKA-native CAP notation system and no lineage claims in either direction between
  CAPs and LOOPs.
- No per-hand trajectory rendering inside the TKA animation engine.
- No Spin Science material, credit, or contact. That thread belongs to the shape-matrix
  surface and is out of scope here.
- No comparative limitation claims about Charlie's larger system (9-Square Theory, QFT).
  It is not understood well enough here for that.
- No new shared primitives, no chart or plotting dependency, no changes to
  `src/lib/shared/landing/styles/public-editorial.css`.
- No launchpad bento tile (unchanged from the 2026-07-19 spec).
- No general CAP builder UI. The assembly solver ships scoped to the three
  source-published assemblies plus tests.
- No atlas expansion beyond the pinned seven in v1. The source material references ten
  Ferréol/mathcurve elementary illustrations across more parameter pairs; the remaining
  elementary examples stay outside the initial atlas.

### Source-of-truth hierarchy

1. **Archived primary sources:** `docs/research/caps-archive/thread-transcript.md`
   (verbatim thread text) and `docs/research/caps-archive/MANIFEST.md` (image provenance
   and licensing gate).
2. **The Math of CAPs**, Zaltymbunk's framework text hosted at
   https://drexfactor.com/reference/math_caps.
3. **MCP domain tools** for every TKA-side claim (`mcp-ground-truth.md`). The CAPs/LOOPs
   ground truth used in this spec was retrieved fresh via MCP on 2026-08-01 (section 9.5).
   Final user-facing copy for that section requires one more MCP check at authoring time.
4. **`packages/caps-domain` data**, which must carry `SourcedClaim` provenance pointing at
   items 1 and 2.
5. Nothing from model memory. A claim without a source in this hierarchy does not ship.

---

## 3. Final page sequence and anchor contract

Order of render in `+page.svelte`:

| # | Section | Anchor id | Content |
|---|---------|-----------|---------|
| 1 | CapsHub hero | (none) | Unchanged layout; one tile behavior change (5.1) |
| 2 | What is a CAP | `what-is` (nested `breakdown`) | Two-pane definition: copy beside live CapsAssembly. Absorbs the current `#what-is` and `#breakdown` sections |
| 3 | The curve atlas + focused construction | `math` (group sub-anchor `math-assembled`) | Section 4 and section 5 |
| 4 | Origin chronology | `origin` | "Named on a forum, built at a burn" as a dated chronology |
| 5 | Credits | `credits` | Evidence-backed contributor entries, fixed layout |
| 6 | CAPs and LOOPs | `relationship` | The comparison, placed after the model is understood |
| 7 | Watch | `watch` | Fixed 3x2 video gallery |
| 8 | Sources | `sources` | Composed bibliography including the Ferréol credit |
| 9 | CTA to /notation/loops | (none) | Existing `.cta-card` pattern |

**Anchor contract:**

- Stable ids preserved for external links: `what-is`, `breakdown`, `math`, `origin`,
  `watch`.
- New ids: `math-assembled` (the assembled group inside the atlas), `credits`,
  `relationship`, `sources`.
- `breakdown` is preserved as a nested anchor: the "How this CAP is built" sub-heading
  inside the merged `what-is` section carries `id="breakdown"`, so existing external
  deep links to `#breakdown` land on the four-step explanation, not at page top.
- CapsHub tile hrefs after this change: `what-is -> #what-is`, `breakdown -> #math-assembled`
  (heading "How this CAP is built" stays accurate: the assembled group is exactly that),
  `watch -> #watch`, `relationship -> /notation/loops` (unchanged), `math -> #math`,
  `origin -> #origin`.

**Section 2 composition.** Uses the existing `.section-duo demo-star` grid from
`public-editorial.css` (copy in the narrower column, demo in the wider column from 1100px
up, stacked demo-first below). The demo cell is `CapsAssembly.svelte` unchanged. The copy
cell carries: the definition paragraph, the coined-by credit line with the "posting as"
phrasing, and the four-step bullet list currently in `#breakdown`, under a
"How this CAP is built" sub-heading that carries `id="breakdown"` (anchor contract
above). The two figures currently in `.cap-lens-duo` move: the TKA redraw is represented
by the Yuta atlas card; Damien's original JPG moves into the contextual provenance area
beside the focused construction (4.5).

Renderer note, binding: `CapsAssembly` renders the real prop path via the mandala geometry
calculator (club tip dx 150). The atlas renders Damien's parametric trochoid model via
`@caps/domain`. These are two intentional renderers for two jobs. Do not unify them and do
not add a third (section 8).

---

## 4. Atlas inventory, grouping, provenance

### 4.1 Curve inventory (pinned; nothing else in v1)

All parameters are Damien's published values, notation `theta1 theta2 ; rho1 rho2 ; d`
(archive: `thread-transcript.md`; equation and model as implemented in
`packages/caps-domain/src/mathematics/trochoid.ts`). Authorship split, binding for copy:
Damien published or referenced the parameter examples; the elementary illustrations he
embedded to show them are Robert Ferréol's mathcurve.com animations (ten of them per
`MANIFEST.md`). The three assembled plots are Damien's own figures. Group A below is a
curated four of the elementary examples; the remaining elementary examples stay outside
the v1 atlas.

**Group A: elementary patterns** (single trochoid segments, four representative worked
examples):

| Card name (user-facing) | Notation | Count fact | Existing asset |
|---|---|---|---|
| Four-petal inspin rosette | `1 4 ; 1 1 ; 1` | 4 petals | `static/caps/rosette-1-4.svg` |
| Six-petal antispin rosette | `1 -6 ; 1 1 ; 1` | 6 petals | `static/caps/rosette-1-neg6.svg` |
| Four-cusp cycloid | `1 4 ; 1 1/5 ; 1` | 4 cusps | `static/caps/cycloid-1-4.svg` |
| Three-cusp antispin cycloid | `1 -3 ; 1 1/2 ; 1` | 3 cusps | `static/caps/cycloid-1-neg3.svg` |

**Group B: assembled CAPs** (the only three composite plots Damien published, all his own
figures per `MANIFEST.md`):

| Card name | Notation | Existing asset |
|---|---|---|
| The Yuta CAP (half cycle) | `1 0 ; 1 3/4 ; 1/2 & -1 4 ; 1 3/4 ; 1/2` | `static/caps/yuta-cap.svg` |
| The Yuta CAP at d = 3/4 | same segment parameters, `d = 3/4` per segment | none, must be generated |
| The 1 3 composition | `1 3 ; 1 3/4 ; 2/3 & -1 3 ; 1 3/4 ; 2/3` | none, must be generated |

### 4.2 Corrected names and counts (blocking)

The current labels "five-petal inspin rosette", "five-petal antispin rosette", and
"Five-lobed cycloid" (`scripts/generate-caps-trochoids.mjs` lines 268, 274;
`TrochoidModel.svelte` presets) are wrong. They misread the mathcurve source filenames
"bolas 5 pour 1": five prop turns per one arm turn in the ground frame
(`theta1 + theta2 = +-5`), not five petals. The petal or cusp count of an
integer-frequency full-cycle curve is the frequency difference between the two harmonic
terms, which equals `|theta2|`. Numerically verified during the 2026-08-01 review:
`1 4` has 4 petals, `1 -6` has 6 petals, `1 -3` has 3 petals, cycloid `1 4 ; 1 1/5` has
4 cusps, cycloid `1 -3 ; 1 1/2` has 3 cusps. This agrees with the petal formula already
recorded in `packages/caps-domain/src/data/mathematics.ts` (`CAPTrigModel` comment,
petals = `|1 - d|` with d the ground-frame ratio).

Corrections apply to: script labels, construction labels, atlas card names, every
aria-label, and all new copy. The archived filenames (`rosette-5petal-*.gif`) stay
untouched as archival record and must not leak into user-facing text.

**Terminology policy:** Damien's terms stay primary (rosette, cycloid, O/M/E,
theta/rho/d). Gloss the standard names once in the atlas intro: the family is the
centered trochoid; Damien's "cycloid" special case is the epicycloid or hypocycloid with
cusps. Credit Robert Ferréol's Encyclopédie des formes mathématiques remarquables
(mathcurve.com) for the standard naming and for the animated illustrations Damien
referenced (section 9).

### 4.3 Grouping (structural, not typographic)

Two labeled groups, never one mixed grid. A mixed 7-item grid orphans at every common
column count. Group A renders as its own row set, Group B as its own row set with the
`math-assembled` anchor. The grouping itself teaches the elementary-versus-assembled
distinction. Column counts in section 6.

### 4.4 Card anatomy

Each card is one real `<button>` (`clickables-look-like-buttons.md`) containing: the
curve SVG, the visible corrected name, the visible count fact, and the notation in a
`<code>` chip (`tabular-nums`, the existing page `code` style). Accessible-name rule,
binding: the button exposes exactly one accessible name, derived from its visible text
(name, count, notation). The inline SVG inside the button is decorative for assistive
technology: `aria-hidden="true"` and `focusable="false"`, no `role="img"`, no duplicate
label. Assembled cards additionally show a non-interactive source label (for example
"Damien, 2009"); no interactive element nests inside the button. Selected state is
visually distinct and carried by `aria-pressed`.

### 4.5 Provenance policy (binding)

- Published archival images are **only Damien's four imageshotel originals**:
  `model.jpg`, `cap-yuta-halfcycle.jpg`, `cap-yuta-3quarter.jpg`,
  `cap-1-3-composition.jpg`. They ship with credit per Austen's documented 2026-07-19
  instruction for the archive work, evidenced by the current shipped page (which already
  publishes two of them with credit) and consistent with the `MANIFEST.md` licensing
  gate's recreate-and-credit path.
- Placement: **no provenance UI nests inside atlas card buttons**, and no card expands
  into a large archival image. One contextual provenance area (the existing `<details>`
  `.archival-model` pattern) renders immediately after the focused construction and
  updates with the selected assembled curve: it shows that curve's Damien original
  (`cap-yuta-halfcycle.jpg`, `cap-yuta-3quarter.jpg`, or `cap-1-3-composition.jpg`) with
  caption and source links. It renders empty-collapsed or hidden for elementary and
  Custom selections. The general `model.jpg` diagram belongs to the Mechanism layer's
  content (its existing drawer moves there).
- The ten mathcurve GIFs in the archive are **Robert Ferréol's work, hotlinked by Damien,
  and not cleared for republication** (`MANIFEST.md` licensing section). They must never
  be copied into `static/`, embedded, or served. Elementary curves get a link credit to
  mathcurve.com instead. The clean-room SVG reconstruction from parameters is the ship
  path.

---

## 5. Interaction contract

### 5.1 CapsHub change (the one hero delta)

The `what-is` tile drops `activate: true` and becomes a plain anchor to `#what-is`, like
its five siblings. `CapsCard.svelte` and the FLIP morph machinery in `CapsHub.svelte`
(openCard, closeCard, flip, card-backdrop, card-morph markup and styles) are deleted.
Rationale: `CapsCard` only ever renders `CapsAssembly` (its other five cards say "Coming
next." and are unreachable because only `what-is` sets `activate`), and section 2 now
shows the same `CapsAssembly` one scroll below. Everything else in CapsHub (layout, demo,
tiles, hover treatment, narrow stacking) is preserved. This deletion is part of the
proposed design Austen approves or rejects with this spec as a whole.

### 5.2 Atlas selection and the focused construction

- One persistent construction panel renders directly below the two atlas groups, inside
  section `#math`. Selecting a card updates it in place. No modal, no navigation.
- Default selection on load: the Yuta CAP (half cycle), tying the hero demo to the math.
- Selecting a card moves keyboard focus to the construction panel heading (an `h3` with
  `tabindex="-1"`). The panel is a labeled region. The selected card carries
  `aria-pressed="true"`.
- The construction panel reuses the `TrochoidModel.svelte` stage (SVG markup, gradients,
  O/M/E nodes, orbits, grid, styles) refactored into `FocusedConstruction` and its
  route-local `construction/` subcomponents (section 8). The `SegmentedControl` preset
  picker is removed: atlas selection replaces it.

### 5.3 Layers per curve kind

| Curve kind | Layers | Content |
|---|---|---|
| Elementary | Trace, Mechanism | Trace: the drawn curve with the moving E point. Mechanism: adds O/M/E vectors, both orbit circles, rho labels, the equation, the instant readout |
| Assembled | Trace, Assembly, Mechanism | Assembly: the two fragments draw in two colors with a leading marker and a fragment legend (the `CapsAssembly` interaction pattern, rendered by the trochoid renderer with the assembly's resolved segments). Mechanism: as above, plus the junction marked |

- Layer switcher: one `SegmentedControl` (`src/lib/shared/ui/components/SegmentedControl.svelte`),
  exactly one layer active, default Trace. Options vary by curve kind (two or three).
  This is the routing required by `.claude/rules/chip-primitives.md`.
- Transport (Play/Pause button, cycle scrubber, percent readout) sits with the stage and
  is available on every layer. Reuse the existing `TrochoidModel` transport including its
  reduced-motion behavior.
- Advanced parameter controls (the five theta/rho/d sliders) appear **only for
  elementary curves**, behind a disclosure inside the Mechanism layer labeled
  "Adjust parameters". The assembled Mechanism layer is inspect-only in v1 (consistent
  with 7.6: Custom edits a single elementary segment). Opening the disclosure and
  editing detaches the panel into a Custom state: the notation chip updates live and the
  atlas card selection clears. Closing the disclosure does not reset values; selecting
  any atlas card resets the panel to that card's source data.
- The rail beside the stage carries the active layer's content: classification, notation,
  the instant readout, the disclosure. The rail is never empty (this replaces the current
  mostly-empty slider rail).

### 5.4 Atlas motion: draw-once-on-entry, then hold (resolved, not a fork)

- Generated atlas SVG modules (7.5) define the draw-on animation with a pinned
  `animation-duration` of **3.5 seconds** (a single deterministic value, under the WCAG
  2.2.2 five-second line), `animation-iteration-count: 1`, and `fill-mode: forwards`,
  gated behind classes the page controls:
  - Default (no class, covers SSR, no-JS, and any script failure): the complete trace is
    visible. The un-enhanced state is the finished state, never a blank.
  - At hydration, for cards not yet in the viewport and only when
    `prefers-reduced-motion` is not `reduce`, the page applies a `pre-draw` class (path
    hidden at full dash offset, animation paused).
  - One shared `IntersectionObserver` swaps `pre-draw` for `drawing` on first entry; the
    animation runs once and holds complete. The observer disconnects per card after
    firing.
- Reduced motion: the media query baked into each generated SVG forces the complete
  static trace regardless of classes (the generator already emits this rule).
- The construction stage keeps its own transport; the draw-once policy applies to atlas
  cards only.
- To support class control the atlas embeds the SVGs inline via `?raw` imports of the
  generated **source-owned** modules in
  `src/routes/(public)/notation/caps/_generated/` (7.5). Files under `static/` are
  public-directory assets served by root URL and are not imported as modules; the
  full-precision `static/caps/` files stay for direct asset URLs only. No runtime fetch
  of SVGs. Payload budget in section 10.

---

## 6. Responsive composition contract

**No new global big-screen seam.** The site seam stays 1680 (`4k-native-layout.md`).
Route-local components respond via **container queries at content-driven thresholds**
(the thresholds named below are per-component container conditions, not new global
breakpoints). All new styles are page-scoped (component `<style>` blocks).
`public-editorial.css` is not modified. No auto-fill anywhere on this page.

### Base (below the 1680 seam)

- Hub: existing behavior (stacks below 1020).
- Section 2: stacked, demo above copy (existing `.section-duo` source order).
- Atlas Group A: 2x2 when the group container affords at least 20rem per card, 1 column
  below that.
- Atlas Group B: 3 across **only** when the group container affords at least 20rem per
  card (roughly a 64rem container including gaps); otherwise 1 column. At the required
  960x412 viewport this yields stacked assembled cards, never three small plots in a
  row.
- Construction: stage above rail (the existing 55rem container query governs).
- Videos: 2x3 when the container affords two 20rem cards, 1 column below.
- Chronology: single column rows. Credits: Damien primary entry first, then the four
  supporting contributors in a 2x2 grid when the container affords it, else one column.

### 1680 tier (the existing site seam)

- Section 2 goes two-pane (`.section-duo demo-star`: copy 5fr, demo 6fr, existing rules).
- Atlas Group A: 4 across (4 % 4 = 0). Group B: 3 across (3 % 3 = 0).
- Videos: fixed 3x2 (6 % 3 = 0), replacing the current
  `repeat(auto-fill, minmax(320px, 1fr))`.
- Chronology: year-rail rows (fixed year column of about 8rem, entry text spanning the
  remaining band).
- Credits, fixed composition: **Damien as the primary feature occupying the left
  column; the four supporting contributors (Alien Jon, Nick Woolsey, Charlie, Drex) in
  a fixed 2x2 grid on the right.** Never five narrow columns, never a 4-column grid of
  five entries (5 % 4 = 1).
- Construction: stage and rail side by side per its container query.

### 2600 shell / native 3840

- `--shell-w` caps the band at 2600; at 3840 the band centers with margins. Composition
  from the 1680 tier holds. Per `4k-native-layout.md`, a tier above 2600 is added only
  when something recomposes; nothing here does.
- **Stage sizing rule (binding, all widths): no width-driven square stages.** The
  construction stage box is square with
  `inline-size: min(100%, 72dvh, 1040px)`, centered in its column. This kills the
  roughly-1500px stage the current `1.42fr` grid produces at the 2600 band. The atlas
  card SVGs are sized by their fixed grid tracks and inherit no such risk.
- Prose measure: controlled by composition only (the two-pane split and the year-rail).
  Reading-width `max-width` caps on public prose stay banned
  (`feedback_no_text_max_width`, `public-editorial.css` `.prose p` comment). Type sizes
  stay on the existing clamp ramps; nothing on this page re-sizes type at a breakpoint.

### Required verification viewports

1920x1080, 2560x1440, 3840x2160, 1440x900, 820x1180, 960x412, 375x667, per
`visual-verification-mandatory.md`, with the acceptance checks in section 12.

---

## 7. Mathematics and data architecture

### 7.1 Single source registry

Populate `CAP_MATH_MODEL` in `packages/caps-domain/src/data/mathematics.ts` (currently an
empty TODO stub whose types were designed for this data):

- `elementaryPatterns`: the **seven** elementary curves the generator currently emits
  (its CURVES array holds eight entries: these seven plus the Yuta assembly). They are
  the four atlas curves plus `1 -3 ; 1 1` (three-petal antispin rosette), `2 -5 ; 1 1`,
  and `3 2 ; 1 1`, retained for the generator manifest. Each carries `SourcedClaim`
  provenance to the thread transcript or The Math of CAPs.
- `assemblies`: the three assemblies of section 4.1, with provenance (the registry adds
  the two assemblies the script does not yet define).
- Registry totals: seven elementary entries plus three assemblies. The registry is a
  superset; the atlas consumes the pinned seven by id (four elementary plus all three
  assemblies).

### 7.2 Structured assembly types

`CAPAssembly` currently stores segments as notation strings plus `d1`/`d2`. Add a
resolved-segment shape so consumers never re-parse notation:

```ts
interface CAPSegment {
  theta1: number;
  theta2: number;
  rho1: number;
  rho2: number;
  d: number; // fraction of the segment's full cycle
}
```

Either extend `CAPAssembly` with `segments: CAPSegment[]` or add a parallel resolved type
exported beside it. The implementation plan picks the shape; the requirement is that the
generator, atlas, and construction all read structured segments from the package.

### 7.3 Promoted join algorithm with the M-plus-E continuity contract

New module `packages/caps-domain/src/mathematics/assembly.ts`, exported from the package
index. It replaces `solveJoinPhases` and `buildCurve` in
`scripts/generate-caps-trochoids.mjs`.

**The correction.** The script's solver enforces only E (tip) continuity via a two-circle
intersection. Damien's model is physical: M (the hand) cannot teleport at a junction. The
promoted algorithm:

1. **Phase continuation (primary path).** When consecutive segments share `rho1` and
   `rho2`, set the next segment's phase offsets to the previous segment's end angles:
   `phi1 = 2*pi*theta1_prev*d_prev + phi1_prev`, `phi2 = 2*pi*(theta1_prev+theta2_prev)*d_prev + phi2_prev`.
   This guarantees both M and E continuity by construction. All three source assemblies
   take this path.
2. **Two-circle solve (radius-change path only).** When radii change between segments
   (a wrap), solve the law-of-cosines intersection for the E target, evaluate both
   branches, and select the branch whose M position matches the previous segment's M
   within tolerance. If neither branch preserves M continuity, fail with a typed error.
3. **Typed failures.** `CAPJoinError` with a discriminant:
   `"infeasible-target"` (|target| outside `[|rho1-rho2|, rho1+rho2]`),
   `"hand-discontinuity"` (no branch preserves M), `"tip-gap"` (post-solve numeric E gap
   above tolerance). No silent fallback.
4. **Tolerances.** At every junction, both `|M_next(0) - M_prev(d)|` and
   `|E_next(0) - E_prev(d)|` must be below `1e-9` in model units.
5. **Cycle closure.** A CAP is cyclic: for each of the three source assemblies, the
   assembled curve's start-to-end closure must also hold, `|M(T) - M(0)|` and
   `|E(T) - E(0)|` below `1e-9`, where T is the end of the final segment. Internal
   junction continuity and whole-cycle closure are separate assertions; both ship.

**Property worth pinning in tests:** all three source assemblies join at full extension
(the arm and prop angles are congruent at the junction, so `|E| = rho1 + rho2` and the
two intersection branches coincide). Add one deliberately off-extension test case so the
branch-selection path is exercised rather than trusted.

### 7.4 Count helper

Export a documented helper returning the petal or cusp count as the harmonic frequency
difference `|theta2|` (equivalently `|theta1 - (theta1 + theta2)|`), valid for
integer-frequency full-cycle curves. Atlas names and aria-labels derive counts from this
helper, not from hand-typed strings.

### 7.5 Consumers and generator deduplication

- Consumers of the package math: `scripts/generate-caps-trochoids.mjs` (build-time SVGs),
  the atlas component, the focused construction, and the existing `getCAPAssembly`
  lookups in `packages/caps-domain/src/reference/math-lookup.ts`.
- The script's local `evalPoint`, `solveJoinPhases`, and `buildCurve` are deleted; it
  imports `@caps/domain` and keeps only SVG concerns (sampling density config, bbox,
  viewBox, path serialization, file IO, the console report). The implementation plan
  chooses the import mechanics (convert the script to TypeScript run via
  `node --import tsx`, the repo's established pattern, or import the package's built
  output). Re-implementing the math in the script is prohibited.
- The generator emits **two output sets**:
  1. Full-precision SVGs into `static/caps/` (public-directory assets, served by root
     URL, used as direct asset URLs such as the hero poster; never imported as modules
     and never fetched by page JS at runtime). This set gains the two missing assembled
     SVGs (Yuta d = 3/4, the 1 3 composition).
  2. Atlas-optimized SVG modules into
     `src/routes/(public)/notation/caps/_generated/` (source-owned, importable with
     `?raw` per Vite's source-import model; generated-only and trusted, never
     hand-edited, header comment marks them generated). Optimizations: second path via
     `<use>` of the first path's `d`, coordinate precision 2, the pinned 3.5 second
     draw duration (5.4), and the class-gated animation states (5.4). Payload budget in
     section 10.

### 7.6 Scope limits

The assembly solver ships exercised by exactly the three source assemblies plus its unit
tests. No UI exposes free-form multi-segment assembly in v1. The Custom state (5.3) edits
a single elementary segment only.

---

## 8. Component and file ownership map

### Reused, unchanged

| Component | Path | Role here |
|---|---|---|
| `CapsAssembly` | `src/routes/(public)/notation/caps/_components/CapsAssembly.svelte` | Section 2 demo cell. Also consumed by the notation archive (`ArtifactVisual.svelte`); do not change its API |
| `YutaCapLiveDemo` | same dir | Hub demo, untouched |
| `LaunchpadTile` | `src/lib/shared/landing/components/launchpad/LaunchpadTile.svelte` | Hub tiles, untouched |
| `SourceVideoCard` | `src/lib/shared/components/SourceVideoCard.svelte` | Video gallery cards |
| `SegmentedControl` | `src/lib/shared/ui/components/SegmentedControl.svelte` | Layer switcher. The 2026-07-19 SSR/prerender resolution bug is fixed (component relocated; imports repointed in commit `1c35df3dbc`, "fix(build): restore public prerendered routes") |
| Editorial classes | `src/lib/shared/landing/styles/public-editorial.css` | `.section-duo demo-star`, `.bullet-list`, `.resource-chip`, `.cta-card`, section scaffolding. Read-only |

### Created

| File | Content |
|---|---|
| `src/routes/(public)/notation/caps/_components/CurveAtlas.svelte` | The two grouped grids, card buttons, inline SVG embedding, IntersectionObserver draw-once, selection state |
| `src/routes/(public)/notation/caps/_components/FocusedConstruction.svelte` | Route-local **orchestrator** for the construction: owns selection input, layer state, Custom state, and composition. The stage, rail, transport, layer content, and the contextual provenance area live as route-local subcomponents under `_components/construction/` as the monolith size check dictates (the current `TrochoidModel.svelte` is already about 1200 lines and this gains behavior). These are route-local files, not shared primitives |
| `src/routes/(public)/notation/caps/_components/construction/*.svelte` | The subcomponents above (stage, rail, transport, layers, provenance area), extracted from the `TrochoidModel.svelte` refactor |
| `src/routes/(public)/notation/caps/_generated/*.svg` | Generator-emitted atlas SVG modules (7.5, output set 2). Generated-only, trusted, never hand-edited |
| `packages/caps-domain/src/mathematics/assembly.ts` | Section 7.3 |

### Modified

| File | Change |
|---|---|
| `src/routes/(public)/notation/caps/+page.svelte` | Section order, anchor contract, section 2 duo, chronology, credits, fixed video grid, sources, copy deltas (section 9) |
| `src/routes/(public)/notation/caps/_components/CapsHub.svelte` | `what-is` tile to plain anchor; morph code and styles deleted; tile hrefs per section 3 |
| `packages/caps-domain/src/data/mathematics.ts` | Registry population (7.1), types (7.2) |
| `packages/caps-domain/src/index.ts` | Export assembly module and count helper |
| `scripts/generate-caps-trochoids.mjs` | Consume the package; corrected labels; both output sets per 7.5 (full-precision `static/caps/`, atlas modules `_generated/`) |
| `tests/unit/caps-trochoid-model.test.ts` (or sibling new test file) | Assembly and count tests (section 12) |

### Deleted

- `src/routes/(public)/notation/caps/_components/CapsCard.svelte` (5.1)
- `src/routes/(public)/notation/caps/_components/TrochoidModel.svelte` (superseded by
  `FocusedConstruction.svelte`; delete only after the refactor lands, no orphan copy)

### Prohibitions

- No second plotting engine. Curve geometry comes from exactly two existing sources:
  the mandala geometry calculator (prop-true demos: `CapsAssembly`, `YutaCapLiveDemo`)
  and `@caps/domain` trochoid sampling serialized to SVG paths. Nothing else draws
  curves.
- No new runtime or build dependency for charting, plotting, animation of paths, or
  intersection observation (the platform API suffices).
- No forked copy of `SegmentedControl`, no `<input type="checkbox">`
  (`no-checkboxes.md`), no raw chip-class filter buttons (`chip-primitives.md`).

---

## 9. Attribution and copy contract

House style applies: `docs/reference/ai-writing-guide.md`, no em dashes in shipped copy,
"step" never "beat" for sequence entries.

### 9.1 Verified, keep (citations verified against `thread-transcript.md` on 2026-08-01)

- Alien Jon, verbatim: "I got the term from Damien." (transcript line 63).
- The naming debate details: "pac men" and "a cap is a type of small hat"
  (transcript line 71).
- The wrap table and feasibility discussion (transcript lines 164 onward).
- Damien as mononym with the "posting as Zaltymbunk / French_Saltimbanque" phrasing,
  forum title "Trochoïd Master", Angers, France. No surname exists in any source; never
  add one.
- Yuta as the pattern namesake, mononym (per `packages/caps-domain/src/data/contributors.ts`).
- The Burning Man 2007 OMCC room per Alien Jon's own quoted post.
- Nick Woolsey / PlayPoi 2016 tutorial as the source of the "Capped Antispin Patterns"
  expansion.
- Drex's documentation record (Tech Poi Blog, 2012 C-CAPs tutorial, 2016 8-step recipe,
  hosting The Math of CAPs).
- The 2009 thread has no Internet Archive snapshot (MANIFEST, retried and recorded).

### 9.2 Narrowed (exact replacements)

- The Burning Man room list uses the first names the thread uses. Replacement for the
  current footnote (`+page.svelte` around lines 370-374):
  "Also in the room at Burning Man 2007: Noel, Greg, Jordan, and Zan of the OMCC crew."
- Charlie: cited sources say only "Charlie" (DrexFactor: "Charlie's 9-square theory").
  Ship "Charlie" unless a primary source for the surname (his own channel or site; lead:
  the charlicopter YouTube channel noted in
  `packages/caps-domain/src/data/external-links.ts`) is captured into
  `docs/research/caps-archive/` before copy freeze. The credits entry describes: 9-Square
  Theory, the 8-step CAP as credited by DrexFactor. No claims about the scope or limits
  of his larger system.
- Encyclo-poi-dia Vol. 2: the thread evidences only that the book exists and contains a
  CAP chapter. Drop the "by Alien Jon and Zan Moore" byline unless the book's own credits
  are captured as a source before copy freeze.

### 9.3 Removed

- The clause crediting "Noel Yee and Jordan Campbell, whose Transition Theory work
  describes the mechanism that joins pattern fragments" is removed from this page. It
  stacks three unsourced steps: full-name identification of the thread's first names, and
  a cross-system relationship claim with no primary source. This is the move the
  2026-07-29 attribution handoff prohibits ("No relationship claims between notation
  systems without primary-source evidence on both sides"), and
  `packages/caps-domain/src/data/contributors.ts` itself marks these entries
  "per project scaffold notes". Transition Theory keeps its home on the VTG and notation
  catalog surfaces where its evidence lives.

### 9.4 Prohibited

- Forest Stearns and the corrected spelling Forest Sterns: must not appear on any caps
  surface (page, components, caps-domain data consumed by this page). Currently absent
  (grep-verified 2026-08-01); this spec makes the absence a contract.
- No Spin Science material, credit, or outreach dependency.
- No surname for Damien; no legal-identity assertion beyond "posting as".
- No republication of Ferréol's mathcurve GIFs (4.5). Required instead: a Sources entry
  and an atlas-intro link credit naming Robert Ferréol and the Encyclopédie des formes
  mathématiques remarquables (mathcurve.com) as the source of the animated curve
  illustrations Damien referenced.
- No fabricated or paraphrase-inflated quotes. Quotation marks only around verbatim
  transcript text.

### 9.5 CAPs and LOOPs section copy

Ground truth (MCP, retrieved by Codex 2026-08-01): CAPs and LOOPs address the same need,
patterns that can repeat forever. They are parallel concepts, not parent and child;
neither contains the other. CAPs compose per-hand trajectories. LOOPs compose per-step
snapshots where one letter represents both hands simultaneously. Canonical CAP
definition: a cyclic pattern assembled serially from two or more elementary trochoid
patterns, each iterated one or more times.

The section uses only this distinction plus Damien's own serial-assembly versus
parallel-superposition (hybrids) framing already in the shipped copy. **Requirement: run
one MCP check (`get_term_definition("CAP")`) when the final user-facing copy for this
section is authored, before ship.**

---

## 10. Accessibility, motion, performance, SSR, failure states

### Accessibility

- Atlas cards: one accessible name per button, derived from the visible curve name,
  corrected count (from the 7.4 helper), and notation (4.4). The inline SVG inside each
  button is `aria-hidden="true"` and `focusable="false"`; it carries no `role="img"` and
  no aria-label, so nothing is announced twice and no interactive or named element nests
  inside the button.
- The focused construction SVG remains the meaningful visualization: `role="img"` with
  a descriptive aria-label, the visible textual description, and the labeled O/M/E data
  (the existing `TrochoidModel.svelte` pattern).
- Atlas cards: real buttons, 44px minimum target, visible `:focus-visible` ring,
  `aria-pressed` selection state, DOM order equals visual order.
- Selection moves focus to the construction heading (5.2). No focus traps; the panel is
  in-page, not modal.
- Construction: keep the existing labeled sliders, `role="math"` equation with its spoken
  aria-label, the O/M/E text labels, and the stage aria-label pattern from
  `TrochoidModel.svelte`. All changing numeric readouts use `tabular-nums` (existing
  pattern, keep).
- Fragment colors in the Assembly layer stay double-encoded with text labels (the
  "Extension + Antispin" legend pattern from `CapsAssembly`).
- Layout stability: reserve the construction panel's box before content swaps
  (`no-layout-shift.md`); layer switches must not move the transport or resize the stage.

### Motion

- Atlas: draw-once-on-entry per 5.4 with the pinned 3.5 second duration. WCAG 2.2.2
  applies to auto-starting motion lasting longer than five seconds; running once is not
  sufficient on its own, so the duration is pinned under that line and the final frame
  holds. Reduced motion stays fully static.
- Construction: autoplay only when `prefers-reduced-motion` is not `reduce`; Play
  disabled and scrubber operable under reduced motion (existing `TrochoidModel`
  behavior, preserved).
- The hub's `YutaCapLiveDemo` no-pause stance with the reduced-motion static poster is
  Austen's standing decision (component header comment) and is recorded here as the
  accepted deviation; this spec does not change it.

### Performance and payload

- Inline atlas SVG budget: at most 15KB per curve, at most 120KB total in the prerendered
  HTML. Achieved via the `_generated/` atlas modules (7.5): shared path via `<use>`,
  precision 2. The full-precision SVGs in `static/caps/` remain public-directory assets
  for direct asset URLs (the hero poster); they are never module-imported and never
  fetched by page JS at runtime.
- The construction panel computes traces client-side from `@caps/domain` (the existing
  `TrochoidModel` approach); no additional runtime cost class is introduced.
- One `IntersectionObserver` instance for the whole atlas.

### SSR, prerender, failure states

- The route is prerendered (`src/routes/(public)/+layout.ts`, `prerender = true`).
- No-JS and pre-hydration state: atlas shows complete static traces (5.4 default state);
  the construction renders its default curve's full trace server-side (the trace path is
  computed in component init, which runs at prerender) with transport controls inert.
  No blank stages in the prerendered HTML.
- Known hazard: `svelte.config.js` `handleHttpError` swallows `/notation/*` prerender
  errors, so a green build proves nothing for this route. Acceptance requires direct
  inspection of the built HTML (section 12).
- Runtime failure: if an SVG asset import or observer setup throws, cards must still
  render their complete static traces (the default state is the finished state). Errors
  surface in the console, not as blank UI. No silent catch-and-hide.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Silent prerender failure class (the SegmentedControl incident shipped silently because `/notation/*` errors are swallowed) | Acceptance criterion 12.2: built-HTML inspection plus zero-console-error runtime proof |
| Assembly solver behaves differently off the full-extension boundary | 7.3 branch-selection contract, typed errors, the off-extension unit test |
| Script-to-package import boundary (mjs versus TS) | Implementation plan picks tsx conversion or built-output import; math re-implementation prohibited (7.5) |
| Anchor churn breaks hub tiles or external links | Section 3 anchor contract; hub hrefs updated in the same change; stable ids preserved |
| Damien's original Yuta figure lost in the section merge | Explicit relocation to the contextual provenance area beside the construction (4.5) |
| Inline SVG payload bloats prerendered HTML | 10 payload budget with the `<use>`/precision-2 atlas variants |
| In-flight parallel work in the repo | Implementation touches only the files in section 14; commits use explicit pathspecs (`commit-only-your-own-changes.md`); no push without Austen's explicit go (pushing main auto-deploys via CF Pages) |
| Copy drift back into unverified claims | Section 9 lists are the contract; acceptance greps in 12.5 |

---

## 12. Acceptance criteria (objective)

1. **Math.** Unit tests green:
   - For each of the three source assemblies, at every junction both M and E continuity
     gaps are below `1e-9`.
   - For each of the three source assemblies, start-to-end cycle closure holds: both
     `|M(T) - M(0)|` and `|E(T) - E(0)|` below `1e-9` (7.3 item 5), asserted separately
     from the junction checks.
   - The full-extension property holds for all three source assemblies
     (`|E_junction| = rho1 + rho2` within `1e-9`).
   - One off-extension assembly case exercises two-circle branch selection; a constructed
     hand-discontinuous case raises `CAPJoinError` with kind `"hand-discontinuity"`.
   - The count helper returns 4, 6, 3 for `1 4`, `1 -6`, `1 -3` rosettes and 4, 3 for the
     two cycloids.
2. **Build proof.** `pnpm run build` succeeds AND the prerendered `/notation/caps` HTML
   (build output) contains: the `id="math"` section, at least one atlas curve name from
   section 4.1, and at least one inline `<svg` atlas element. A green build alone is
   insufficient (10, SSR hazard).
3. **Runtime proof.** Chrome DevTools MCP against the built or dev-served route: zero
   console errors on load; `evaluate_script` confirms 7 atlas cards, the default Yuta
   selection, and the video grid's computed column count (3 at 1920 and above, 2 at
   1024, 1 at 375). Accessibility check: each atlas card button exposes exactly one
   accessible name (containing the corrected count); every SVG inside a card button has
   `aria-hidden="true"` and `focusable="false"`; no interactive element nests inside a
   card button.
4. **Viewports.** Screenshots at 1920x1080, 2560x1440, 3840x2160, 1440x900, 820x1180,
   960x412, 375x667 showing: no stranded grid tracks or orphan rows; construction stage
   rendered height at most 72dvh and at most 1040px (measured); no horizontal overflow at
   375; Group A at 4 columns and videos at 3x2 at 1920 and above; two-pane section 2 at
   1680 and above; at 960x412 the assembled group renders stacked (one column), not
   three small plots in a row; credits at 1680 and above render Damien primary left
   with the four supporting contributors in a 2x2 grid.
5. **Grep proofs** (over the diff and the caps route tree): zero matches for
   `five-petal`, `Five-lobed`, `Stearns`, `Sterns`, `Forest`, `Jordan Campbell`,
   `Transition Theory`, `type="checkbox"`; no `.gif` under `static/caps/`; no new
   dependencies in `package.json`; no diff in `public-editorial.css`.
6. **Keyboard and focus.** Tab reaches every atlas card in DOM order; Enter and Space
   select; selection moves focus to the construction heading; a visible focus indicator
   exists on cards, layer switcher, transport, sliders, and disclosure.
7. **Motion.** With `prefers-reduced-motion: reduce` emulated: atlas cards show complete
   static traces with no animation; construction does not autoplay; scrubber updates the
   frame. Without it: an off-screen card's draw animation runs exactly once on first
   scroll into view and holds; the measured `animation-duration` of every atlas draw is
   the pinned 3.5 seconds, and no atlas value exceeds 4 seconds (verified in the
   `_generated/` module source and via computed style).
8. **Payload.** Each inline atlas SVG at most 15KB; total at most 120KB (measured in the
   prerendered HTML).
9. **Copy.** Section 9.2 replacements present verbatim where specified; the 9.5 MCP
   re-check performed and its output recorded in the implementation notes.

---

## 13. Planning handoff to Codex

Decompose by dependency; phases A and B are prerequisites for C.

- **Phase A: caps-domain.** 7.2 types, 7.3 assembly module with typed errors, 7.4 count
  helper, 7.1 registry population, exports, unit tests (12.1). Pure package work, no UI.
- **Phase B: generator.** Deduplicate onto the package (7.5), corrected labels (4.2),
  emit both output sets: the two missing assembled SVGs into `static/caps/` and the
  atlas modules into `_generated/` with the payload budget and pinned duration (7.5,
  10). Regenerate assets, verify the script's own continuity report.
- **Phase C: page recomposition.** `CurveAtlas`, `FocusedConstruction` as orchestrator
  with its `construction/` subcomponents (refactor of `TrochoidModel`), `+page.svelte`
  section order and anchors including the nested `breakdown` id, CapsHub tile change and
  morph deletion, fixed grids, the contextual provenance area, chronology and credits
  layout. Depends on A and B assets.
- **Phase D: copy and attribution.** Apply section 9 exactly; run the 9.5 MCP check;
  house-style pass (no em dashes, fire-jam test).
- **Phase E: verification.** Full acceptance sweep (12.1 through 12.9), including the
  seven-viewport screenshot pass and the built-HTML inspection.

Standing constraints for every phase: explicit-pathspec commits only
(`commit-only-your-own-changes.md`); work on `main`, no branches or worktrees without
Austen's explicit request (`worktree-workflow.md`); this is a pnpm workspace, so gates
run `pnpm run check` and `pnpm run build`, one full check at the gate, not in the inner
loop (`fast-iteration-loop.md`); do not push to `main` without Austen's explicit go
(pushes auto-deploy via Cloudflare Pages).

**Approval gates:** exactly one remains. Austen approves this spec, then implementation
proceeds through all phases without further approval stops. The 5.1 morph retirement and
the 9.2/9.3 copy changes are approved or rejected as part of this spec, not separately.

---

## 14. Affected-file scope

### In scope (the only files implementation may touch)

- `src/routes/(public)/notation/caps/+page.svelte`
- `src/routes/(public)/notation/caps/_components/CapsHub.svelte`
- `src/routes/(public)/notation/caps/_components/CurveAtlas.svelte` (new)
- `src/routes/(public)/notation/caps/_components/FocusedConstruction.svelte` (new)
- `src/routes/(public)/notation/caps/_components/construction/*` (new, route-local
  subcomponents)
- `src/routes/(public)/notation/caps/_generated/*` (new, generator-emitted SVG modules
  only)
- `src/routes/(public)/notation/caps/_components/CapsCard.svelte` (delete)
- `src/routes/(public)/notation/caps/_components/TrochoidModel.svelte` (delete after refactor)
- `packages/caps-domain/src/mathematics/assembly.ts` (new)
- `packages/caps-domain/src/data/mathematics.ts`
- `packages/caps-domain/src/index.ts`
- `scripts/generate-caps-trochoids.mjs` (or its TS successor per 7.5)
- `static/caps/` generated SVG outputs (script-emitted only)
- `tests/unit/caps-trochoid-model.test.ts` plus new sibling test files
- Optional research capture into `docs/research/caps-archive/` for 9.2 verification
  (Charlie surname, Encyclo-poi-dia credits), additive only

### Out of scope (must not change)

- `src/lib/shared/landing/styles/public-editorial.css`
- `CapsAssembly.svelte`, `YutaCapLiveDemo.svelte`, `yuta-cap-sequence.ts`
- `SegmentedControl.svelte`, `LaunchpadTile.svelte`, `SourceVideoCard.svelte`
- The notation archive components consuming `CapsAssembly`
  (`src/routes/(public)/notation/_components/archive/`)
- `svelte.config.js`, `src/hooks.server.ts`, any CSP or prerender configuration
- The archived research files' existing content (`thread-transcript.md`, `MANIFEST.md`,
  archived images)
- Every route and package not listed in scope

---

*Authored by Claude Fable 5, 2026-08-01, at Austen's request, from the same-day Fable
design review. Implementation blocked until Austen approves this document.*
