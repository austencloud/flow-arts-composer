# Flow Arts Composer Visual Design Canon

## Status and Scope

This document defines the visual direction of Flow Arts Composer. It governs
new product surfaces and substantial restyles. It sits above component-level
CSS decisions and beside the enforced rules in `.claude/rules/`.

Use `docs/reference/styling-guide.md` for token and CSS implementation details.
Use the shared primitives named here for interaction behavior. If a legacy
screen conflicts with this document, treat the screen as debt, not precedent.

Use [Visual Review](visual-review.md) for aesthetic evaluation and the
`ui-bust` skill for its planning, review, and research-refresh workflow. This
canon records product choices, not universal evidence of AI authorship.
Research sources, limits, and freshness live in the
[evidence ledger](../reference/visual-design-evidence.md).

## The Product in One Paragraph

Flow Arts Composer is an artifact-centered creative tool. The interface should
feel like a dark, precise working environment built around pictographs,
sequences, props, and motion. The background supplies atmosphere. Neutral,
theme-aware surfaces organize the work without competing with it. Domain color
lives in the artifact, the icon, or the whole state that owns it. Hierarchy
comes from composition, scale, spacing, type, and real content. Controls are
obvious, compact, and close to the thing they affect.

## 1. Product Character

The target is a human-curated creative instrument, not a generic dashboard.

- **Artifact first.** Pictographs, sequences, deck art, thumbnails, and actual
  user work should carry the strongest visual weight.
- **Quiet chrome.** Navigation and controls should remain legible and
  deliberate without becoming the composition's main event.
- **Direct hierarchy.** Use scale, placement, grouping, and alignment before
  adding decoration.
- **Real choices.** When a choice concerns content, show representative content
  whenever the product has it. A real sequence preview explains more than an
  abstract infographic.
- **Progressive disclosure.** Present the decision needed now. Reveal detail
  close to the object it modifies instead of building click ladders.
- **One visual grammar.** Similar actions and states should look related because
  they share owners, not because each feature recreated the resemblance.

The interface should never need decorative noise to prove that it was designed.

## 2. Canvas and Page Composition

### Authenticated workspace

The signed-in application is a full-height working canvas with persistent
navigation and a content region that owns the remaining space. Background art
may remain visible around and between surfaces. The workspace should not be
wrapped in an arbitrary centered website card.

Major modules choose a composition that matches their job:

- creation tools are canvas-first, with the artifact dominant and controls
  anchored around it;
- browse and onboarding screens use one authored content band with clear
  primary decisions and supporting choices;
- settings use one coherent workspace divided into aligned functional zones;
- content collections use the canonical grid, rail, viewer, or drawer owner.

### Public pages

Public pages may use the shell width token and a centered reading band. This is
separate from the authenticated workspace and should not be copied into tool
screens by default.

### Guide pages

Austen set this for every `/guide` page on 2026-10-15
(`src/routes/(public)/guide/zans-diamond` is the reference):

- Page headers and section intros are centred section breaks. Text beside a
  player or figure stays left-aligned.
- Copy is short. Let the players and figures carry routes, proofs, and
  bookkeeping instead of explaining them step by step.
- In centred text, each sentence starts on its own line, and a sentence that
  wraps balances its lines (`display: block; text-wrap: balance` per
  sentence) so no word is stranded. Split by sentence at render time so every
  locale follows without separate strings. `src/routes/(public)/guide/_components/Sentences.svelte`
  does this; text beside a figure sets `--sentence-display: inline`.

### Composition rules

- Give every region one clear owner.
- Align related controls to a shared edge or baseline.
- Keep actions near the object or decision they affect.
- Reserve geometry for persistent controls so content does not jump.
- Use a second column, rail, or authored band when a wide screen earns it.
- Avoid dead side rails, orphan rows, isolated cards, and controls stretched
  far beyond the size of their labels.
- Avoid a page made from equal, disconnected cards when the information is one
  connected task.
- Avoid nested scrolling. One region should own each scroll axis.

## 3. Surface and Material Grammar

The active background theme calculates the contrast system. Components consume
that system instead of painting a competing palette over it.

| Role                 | Canonical treatment                                        |
| -------------------- | ---------------------------------------------------------- |
| Main panel or drawer | `--theme-panel-bg`, matte and contrast-aware               |
| Card or subpanel     | `--theme-card-bg` with `--theme-stroke`                    |
| Hover                | Whole-surface change using theme stroke or card background |
| Selected item        | Full ring, full outline, or whole-surface tint/fill        |
| Modal                | `BaseModal`; blur belongs to the backdrop only             |
| Structural boundary  | Neutral theme stroke, used sparingly                       |

Use a small radius family and shallow, single-layer elevation. Corners and
shadows should clarify containment, not turn every object into a floating pill.

Content panels, drawers, forms, and interactive surfaces do not use blur. Old
comments or variables labeled "glassmorphism" are historical residue. They are
not the current visual direction.

### Container-edge accent strips are forbidden

Never place a thin decorative colored line on one edge of a container. Common
names for the pattern include left accent border, accent rail, status stripe,
and callout or inset border. The ban includes selection color, identity color,
status color, severity color, and decorative emphasis. It applies to every
edge and every CSS spelling.

See `.claude/rules/no-left-edge-accent-bar.md` for the enforced rule. The old
identity-color exception is revoked.

## 4. Typography

The authenticated product uses the system sans stack for interface text. It is
compact, familiar, and readable at tool density.

Serif type is reserved for places with a real editorial, brand, artifact, or
teaching role:

- the Flow Arts Composer wordmark and selected public-page headings;
- a sequence word or label that belongs to the artifact;
- an intentional teaching or guided-onboarding voice.

Serif is not a shortcut for making an ordinary card feel premium.

### Hierarchy

- Page titles are clear, left aligned, and anchored to the composition.
- Section headings name a region. They do not repeat the page title in new
  words.
- Body copy is short and functional.
- Helper text is visibly secondary but remains readable.
- Labels and buttons use direct language that states the action or value.

Essential text has a 14px minimum. Supplementary metadata has a 12px minimum.
Do not shrink explanations until they fit. Edit the copy or change the layout.

### Scripts without capitals

Chinese, Japanese and Korean have no capital letters and their own bold
faces. Two rules keep them from looking broken:

- No forced capitals. Under `:lang(zh)`, `:lang(ja)` and `:lang(ko)` every
  `text-transform` is off, so an eyebrow label never shouts the Latin word
  inside it ("本 APP").
- Traditional Chinese names its own fonts. `body:lang(zh-Hant)` keeps the
  Latin system fonts first and then names Microsoft JhengHei, PingFang TC and
  Noto Sans TC, so bold uses a real weight and not a faked one.

Owner: the two rules after `body` in `src/app.css`. Decided with the
translation desk, 2026-11-14.

## 5. Color

### Theme color

`--theme-*` values own contrast-aware surfaces, strokes, text, and the active
accent. Components consume them. A feature must not locally redefine
theme-looking variables to escape the current background.

### Semantic and domain color

Color is strongest when it belongs to something concrete:

- blue and red prop identity;
- success, warning, error, play, save, and destructive actions;
- an icon or glyph representing a creation method;
- a pictograph, thumbnail, sequence, or other artifact;
- a whole selected state.

Keep destructive color bounded to the destructive control. Do not turn a whole
page or section edge red to announce that one action is dangerous.

Color may encode identity inside an icon, glyph, thumbnail, plot, or artifact.
It may not be glued to a container as a thin edge strip.

The start-placement pictograph carries the hand colour key as part of the
pictograph itself, not as a viewer decoration. Two swatch-and-letter pairs
(`L`, `R`) sit centred in the bottom band of the 950-unit viewBox, the one slot
no other glyph uses, in the same Georgia bold as the step number. Geometry
lives in `packages/render-core` (`calculateHandColorKeyLayout`) so the viewer
start cell, rasterized card fronts and exports, and MCP images bake in the same
key. A hand
that is hidden or absent drops out of the key; the remaining pair recentres.
The key is on by default and is the `Hand key` chip in the export panel's
Pictograph row (`handColorKey` in the visibility manager, `showHandColorKey`
in the render and export options); locked deck cards always keep it.
Live card cells pass `animateVisibility`, so every in-cell overlay (both grid
layers, non-radial points, TKA, TnD, Placements, hand key) stays mounted and
fades through its opacity transition when toggled; exports omit the flag and
still hard-unmount hidden overlays.

A pictograph can carry two timing-and-direction relationships. The hand
relationship is the fused element glyph in the bottom-right slot (`TnD`
chip). The prop relationship, read from each step's spin directions and
start bearings, is the same element icon in the top-right slot (`Prop TnD`
chip, `propTndGlyph`, off by default). The corner is the whole distinction;
neither glyph carries a ring or label. The slot geometry lives in
`elemental-glyph-layout.ts` (`getElementalGlyphBox`) so the live DOM, the
canvas compositor and the MCP renderer draw the same mark. A start position,
a float, and unequal turn rates have no prop element and draw nothing.

## 6. Controls and Selection

Actions must look actionable before hover. Tap sizes follow
[layout-law.md](layout-law.md).
Short actions size to their content instead of expanding across available
space.

| Need                                | Owner                 |
| ----------------------------------- | --------------------- |
| Primary or secondary panel action   | `PanelButton`         |
| Exactly one option from a small set | `SegmentedControl`    |
| Independent filters or toggles      | `FilterChipBase`      |
| Dialog                              | `BaseModal`           |
| Side or bottom sheet                | `Drawer`              |
| Structural resizable workspace      | `PanelGroup`          |
| Sequence viewing chrome             | `SequenceViewerShell` |

Do not hand-roll a lookalike when the behavior owner exists.

Selection belongs to the whole selected object. Use a complete ring, outline,
surface tint, filled indicator, or primitive-owned selected state. Preserve a
non-color cue through semantics such as `aria-selected`, `aria-pressed`, or
`aria-current`.

Do not use browser-default checkboxes as product controls. Do not present values
as fake disabled inputs when plain text is the honest form. Links go somewhere,
and look like it: every link is a `LinkChip` pill, never underlined text (see
`.claude/rules/no-text-links.md`);
buttons perform actions.

One setting, one control. Inside the Composer, the prop is picked only from the
bottom bar's prop switcher. No tab, panel or embedded tool (Shape Engine
included) adds its own prop picker or Props button; an embedded tool reads the
current prop and leaves the choosing to the bottom bar. Austen's call,
2026-11-13: "We should always pick the prop through the bottom bar."

The sequence viewer covers that bar, so its Props pill is a door to the same
switcher, not a picker of its own: it wears the switcher button's crossed-props
drawing and opens the full Change Prop sheet, on phones and desktop alike. Only
a host whose prop is local to it (Post Studio, a profile photo, a page with no
app shell) keeps an inline catalogue. Austen's pick, 2026-11-13 ("D").

A delete control says what it removes. When one tap takes more than the item
it sits on, the screen says how much before the tap, in the control's own
colour, and the control's accessible name says the same. The step editor's
Delete pill on a middle step shows "Delete takes steps 2–8" under the title.
Austen's pick, 2026-11-13 ("B").

A choice is named by what it does, in plain words that translate: Both, Left,
Right. Not by a coined mode name, and where a direct choice does the job there
is no mode switch in front of it. The prop picker opens on one always-visible
Both / Left / Right choice, each option a small picture over its word; there is
no "Cat Dog" switch, chip or explaining line in it, and no info modal. A pick
under Both gives both hands one prop, under Left or Right it changes that hand
only, and the stored flag just follows whether the hands differ. With Left
or Right chosen, every prop tile in the grid shows one prop in that hand's
colour; with Both, the pair (Austen 2026-11-15). Austen,
2026-11-15: "No mode: Both / Left / Right might actually be the better
all-language approach that directly describes it....catdog is colloquial and
random to many people".

The one prop picker is also where a saved pair is chosen. "Save with props"
and Browse's viewing-props control open the same prop screen as Change Prop:
the same Both / Left / Right row, the same tiles, every prop in view, no group
headings and no scroll. A pick does not close it; it closes by its X. A saved
pair keeps props, not colours, so that host shows no colour block. Austen's
pick, 2026-11-15 ("A, one picker"): "choosing your prop should just be one
consistent experience across the board ... With no scroll bars attached."

On a phone, the viewer's Props button opens that same prop screen at full
height, on a shared link as well as inside the app. The viewer has no smaller
prop tray of its own on a phone, however tall the phone is. Austen's pick,
2026-11-16 ("Keep full screen").

## 7. Information Hierarchy and Content

The screen should answer these questions without a tutorial covering it:

1. Where am I?
2. What can I do here?
3. Which choice is primary?
4. What will happen when I choose it?
5. How do I change course?

Use one title and one useful description when that is enough. Do not add
persona-like sublines that restate the same option as "I want..." copy. Do not
invent infographics when the actual workflow or artifact can carry the meaning.

Cards are not the default unit of explanation. Use them when the items are
genuinely parallel choices or contained objects. Use aligned zones, rows,
toolbars, rails, or direct canvas controls when those structures better match
the task.

Tutorials should support a legible surface, not repair one. They must not cover
the title or the first decision they are meant to explain.

## 8. Icons and Imagery

Use icons to name recognizable actions and methods, not to decorate empty
space. Put method identity color inside the icon treatment when color helps.

Use real product imagery when the decision is visual:

- sequence and pictograph previews for creation or browsing choices;
- card art for deck choices;
- prop imagery for prop identity;
- scene imagery when the background or environment is the object of choice.

Abstract diagrams must accurately describe the actual workflow. If they do
not, remove them.

### Marks on an artifact

A count, badge, or short label drawn on top of a prop, pictograph, or card
preview stays quieter than the artifact it sits on. The artifact is the
brightest and highest-contrast shape in its tile.

- Use text in `--theme-text-tertiary` at the 12 px supplementary size, in a
  corner. No filled disc, chip, or light background behind it: a light fill is
  the brightest shape in the tile and pulls the eye off the artifact.
- Never shrink the mark below 12 px to make it fit a small tile. Move it into
  the corner padding instead.
- The selected-state checkmark is a control cue, not a secondary mark, and keeps
  its accent treatment.

Owner example: the build count on the prop picker
(`PropSelectionButton.svelte`). Austen, 2026-11-13, on the old white discs: the
numbers were "kind of overpowering over the prop itself."

### Props in small pictographs

A prop in a small pictograph is drawn to be found, not to be accurate. Under
180 px wide, a live pictograph switches to its small art:

- The grid steps back: the grid layer draws at 70%, the outer points at r 16
  (from 25) and the centre at r 8 (from 12). The prop is the loudest thing in
  the picture.
- A thin prop gets a small drawing of its own: one bold mark, whole in its
  hand's colour. Poi is the first, with a 24-unit cord and a 34-unit head, no
  knob, and a ring in the picture's background colour so two heads at one
  point stay apart.
- At 180 px and up, in the animation and in every export, the prop keeps its
  real drawing. For poi that is the grey cord and knob with only the head in
  colour.

The cutoff is where the real poi stops reading: under 180 px its head is
under 6 px across and its cord under 1 px. Owners:
`SMALL_PICTOGRAPH_ART_MAX_SIZE` in `pictograph-legibility.ts` and the
`data-poi-art="small"` group in `static/images/props/pictograph/poi.svg`.
Austen, 2026-11-14, on the 64 px start pictures: "it's hard to tell where the
poi are." He picked the hand-colour drawing.

### Style tiles show what you will get

A tile that picks a prop's look shows the prop the way the view you are in
will draw it. In 2D that is the pair in the two hand colours; photos of the 3D
model belong to the 3D scene. A tile never shows a picture the current view
cannot produce.

Owner: the fan look tiles in the Change Prop switcher (`FanAppearancePicker`
with pair pictures, drawn by `PropCompositionPreview`); the 3D signal lives in
`prop-drawer-state.svelte.ts`. Austen, 2026-11-14, after a visitor picked the
DoodleGrip Day fan from a photo tile while watching 2D: "they chose a 3D model
for their 3D viewer, but then ended up looking at a 2D." He picked the drawn
pair.

### TKA letters are drawn, never typed

A TKA letter (α, β, γ and every other letter of the alphabet) is always its
own letter artwork from `static/images/letters_trimmed/`: in the app, in
mocks, and in pictures made for review. Never type it in a text font. The
typed Greek letter is a different shape from the TKA letter, and a typed α
beside the word "Apart" reads as "A for Apart".

Austen, 2026-11-14, on a review board that typed them: "I'm disappointed that
you didn't put the glyph in the right font."

### A pictograph is not an icon

A full pictograph is never shrunk to stand in as an icon or a button label.
At 40 px its props, arrows and letter are specks. A control that names a
family or a kind of placement uses a small drawing made for that size, with a
plain word beside it.

Austen, 2026-11-14, on the old Construct start switch: "It shows a teeny tiny
pictograph with a teeny tiny letter."

### Small grid drawings keep the grid's proportions

A small drawing of the grid puts the hands on the hand points, a little under
halfway out (143 of 300 units), with the outer points outside them. A hand
never sits on an outer point. Blue and red are the two hands, in the colours
the pictographs on the same surface use.

Owner: `HandsStartDrawing.svelte` (the Construct start switch). Austen,
2026-11-14, on a drawing that put the hands on the outer points: "That's not
how our grids work exactly."

## 9. Motion

Motion explains change.

- Prevent accidental movement by reserving stable geometry.
- Animate intentional structural movement through the canonical motion system.
- Use `Crossfade` or `DualSourceCrossfade` for content replacement.
- Use `PanelGroup` for structural workspaces.
- Use `animate:flip` with `flipDuration()` for keyed list movement.
- Use `createLayoutMotion()` for coordinated recomposition.
- Let pointer-driven dragging follow the pointer without easing.
- Collapse to the accessible final state for reduced motion.

The clock and the shared owners (`flyFade`, `growFade`, `popIn`, `arrive`,
`leave`, `Crossfade`, `flipDuration`) are `@austencloud/motion`, imported
through `#lib/shared/transitions/*`;
`src/lib/shared/transitions/motion-coverage.test.ts` is the gate that keeps raw
timings out of feature code. Use the shared duration and transition tokens. Do
not create feature-local easing systems or use `transition: all`. Ambient
animation is appropriate only when it belongs to the scene or artifact, not as
generic activity around UI chrome.

## 10. Responsive Composition

Responsive design handles four separate concerns:

1. logical control and text size;
2. composition;
3. reading (text fills its box; long lines are fixed by arrangement);
4. presentation distance.

Do not solve a wide display by enlarging every control and label. Keep logical
sizes stable, then recompose the available space through columns, rails, wider
artifact areas, and authored content bands.

Use container queries when a component responds to its own allocated space.
Use media queries for shell-level composition and input-model changes.

Mobile keeps the same capability ownership. It may stack, move controls into a
drawer, or give a tool the full screen, but it should not hide core capability
to make the screenshot cleaner.

A smaller screen may shorten a name but never drop it. Where one panel mixes
kinds of thing (Construct's 4-6 panel holds Dash, Dual-Dash and Static), each
kind stays named at every size; a phone gets a one-line coloured label in place
of the header chip. Austen's call, 2026-11-13, after a visitor on a phone could
not tell Types 4, 5 and 6 apart.

Review at every size on the device list in [layout-law.md](layout-law.md),
plus 200 percent zoom. Check the composition at each size instead of
only proving that nothing overflows.

## 11. Canonical Patterns Seen in the Product

These current surfaces provide useful evidence when they remain consistent
with this document:

### Browse

The Browse entry screen uses a clear header band, a small segmented mode
control, real sequence or card imagery for primary decisions, and compact
secondary choices. Its hierarchy comes from art, scale, and grouping.

### Account settings

Account settings form one coherent workspace with aligned identity, personal
details, and access zones. Values display as values. Actions are bounded.
Destructive color remains attached to the destructive action.

### Construct

Construct gives the pictograph and sequence artifact the canvas. Command and
editing controls stay anchored around the work. Whole controls carry semantic
action color where the meaning is concrete.

The start switch names the three start families in plain words (Apart,
Together, Adjacent), each with the small hands drawing. It carries no TKA
letter and no pictograph: the tiles below show the letter in their corner,
and change with the switch. On a wide, tall window each option adds one line
saying what the word means. Austen picked this on 2026-11-14.

On a phone the word sits under the drawing in every option. Which way an
option is arranged follows the picker's width, never the length of its word,
so the three options match each other in every language. Austen kept this on
2026-11-14 over a smaller drawing beside the word.

While a sequence plays on a phone, Pause rides on the picture's corner,
opposite the X, and the row under the picture holds the scrubber and the
effect button only. The open effects list has one head row: a single Effects
on/off control and Done. The effect is named once, on its tile, and not again
in the head; turning Effects back on returns the last effect used. Pause
stays in reach with the list open and does not close it, so a person can
freeze the picture and compare looks. Austen's pick, 2026-11-15 ("D, pause on
picture").

Each prop can wear its own effect, and the hand is chosen with the prop
screen's own Both / Left / Right row (section 6), in a one-line size, directly
under the head row. There is no second way to pick a hand in the list: not
words in the head row, not a tap on the prop in the picture. The list opens on
Both, and under Both a pick gives both props that effect, as before. While the
two props wear different effects, each tile in use carries a 6 px dot in its
hand's colour with a thin dark outline: the left hand's in the tile's top left
corner, the right hand's in the top right, so place tells the hand as well as
colour. The dot is never a number, a ring or a filled disc, and there are no
dots while both props wear the same effect. Austen's pick, 2026-11-16 ("A, the
row").

On every portrait phone the list is that one structure: head row, hand row,
then all the effects four across, with nothing scrolling in either direction.
The tiles give way before anything scrolls: smaller first, then an icon over
the name. A name may be shortened by its translator but is never cut
(section 10).

### Application shell

The persistent navigation rail is narrow and stable. The active background can
remain visible through the workspace. Navigation items use whole-surface hover
and selected treatments rather than decorative edge marks.

No single current screen is the entire system. Use these as evidence of the
shared grammar, not as permission to copy a feature-specific layout.

## 12. Forbidden Defaults

Do not introduce these patterns:

- decorative colored strips attached to container edges;
- generic dashboard grids made from equal cards;
- abstract infographics that do not match the workflow;
- glass blur on content surfaces;
- excessive nested cards and floating pills;
- dashed borders used to make an ordinary region feel special;
- stretched text actions and faint text-only calls to action;
- duplicate headings and explanatory lines that say the same thing;
- serif type used as generic prestige styling;
- one-off controls that imitate an existing primitive;
- color as the only selected-state cue;
- motion that does not communicate a change;
- desktop layouts that merely magnify mobile UI;
- mobile layouts that remove core capability;
- tutorials that obscure the title or first decision.

## 13. Review Checklist

Before approving a new or substantially restyled surface, verify:

- The artifact or task owns the visual emphasis.
- The page has one clear title and one clear primary decision.
- Real product content replaces generic diagrams where possible.
- Regions have clear ownership and align to an authored composition.
- Theme surfaces remain matte, contrast-aware, and free of content blur.
- No container has a decorative colored edge strip.
- Color belongs to an artifact, icon, semantic action, or whole state.
- Actions look actionable and meet the tap-size floor.
- Shared primitives own familiar controls and interaction behavior.
- Selection affects the whole object and has a non-color cue.
- Structural changes use the canonical motion system.
- Wide layouts recompose; narrow layouts retain capability.
- The rendered composition has evidence-backed findings under Visual Review,
  separate from functional checks. Unassessed aesthetics cannot count as a pass.

The checklist establishes conformance to this product's visual grammar. It
does not certify distinctiveness, human origin, or Austen's approval. New
surfaces and substantial restyles also require the proportional aesthetic
review in [Visual Review](visual-review.md).

## 14. Evidence and Authority

This canon synthesizes the current token system, shell, shared primitives,
responsive architecture, motion architecture, enforced design rules, shipped
design specifications, and direct inspection of Create, Browse, Settings, and
Construct at `https://localhost:5173` on 2026-09-01.

Industry terminology was checked against established design systems. USWDS
describes the alert treatment as a colored bar on the left. GOV.UK names a
related left-border callout pattern "Inset text" and advises sparse use. These
sources show that the pattern predates AI; they do not make it part of this
product's visual language.

- USWDS Alert: <https://designsystem.digital.gov/components/alert/>
- GOV.UK Inset text: <https://design-system.service.gov.uk/components/inset-text/>
- Apple focus and selection guidance:
  <https://developer.apple.com/design/human-interface-guidelines/focus-and-selection/>

Primary repository sources:

- `src/app.css`
- `src/lib/shared/settings/utils/background-theme-calculator.ts`
- `docs/reference/styling-guide.md`
- `docs/architecture/responsive-design.md`
- `docs/architecture/layout-motion.md`
- `.claude/rules/no-left-edge-accent-bar.md`
- `.claude/rules/no-layout-shift.md`
- `.claude/rules/visual-verification-mandatory.md`
- `.claude/rules/never-hand-roll.md`
- `.claude/rules/chip-primitives.md`
- `.claude/rules/clickables-look-like-buttons.md`
- `.claude/rules/no-checkboxes.md`
- `.claude/rules/sequence-viewer-shell.md`

## 15. Create Front Door

The Create front door is the canonical onboarding composition for parallel
creation methods. One authored content band places the question directly above
a responsive bento so their relationship remains explicit. Desktop and tablet
give the two foundational methods the first row and arrange the three more
specialized methods beneath them. Narrow phones give the default Construct
method one full-width tile, followed by the other four methods in a two-column
grid. When the method count changes, the board rebalances instead of leaving a
tile alone: three methods share one row, six put four secondary methods in the
second desktop row, and on phones Construct leads alone only when the rest pair
evenly. This hierarchy is stable: the Last used label never reorders or resizes
the board. That annotation uses the shared `LastUsedBadge` primitive so Create
and sign-in communicate device-local history the same way.

Guests see the account-only methods in their usual places, marked with a Free
account label from the same badge primitive. Tapping one opens sign-up with copy
that names the method, so the board has one shape for everyone and signing in
never rearranges it.

Each method remains a complete button with one useful description. Its icon,
restrained whole-surface tint, and full perimeter border carry its tab color.
The tiles do not use list-row chevrons, blur, decorative edge strips, or
invented workflow graphics.

Each tile also holds a live preview drawn with its method's own renderers and
data: Construct's pictographs and demo taps, Generate's diagonal wave, the
Shape Matrix's mandala reveal, Fuse's one-hand paths, the real tunnel, and
Assemble's grid and hops. They show each method's real output, so they are not
invented workflow graphics. The previews take turns in board order for two
rounds, then rest on finished pictures. Only the playing preview animates, and
reduced motion leaves every preview on its finished picture. The icon sits
beside the method name in the method color, and every tile keeps its
description: a preview never explains a method alone.

On desktop, the chooser uses a deliberately generous front-door scale because
it presents one focused decision rather than dense workspace chrome. The
authored band grows fluidly toward 1440px while its title, icons, descriptions,
and tiles use the desktop baseline defined for this surface. True wide canvases
may extend the band to 1600px, but the controls do not keep magnifying with the
viewport.

Height-constrained landscape screens keep the same two-band bento and compact
its vertical rhythm. The question remains above the choices at every viewport.
