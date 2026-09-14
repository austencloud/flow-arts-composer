# Flow Arts Composer Visual Design Canon

## Status and Scope

This document defines the visual direction of Flow Arts Composer. It governs
new product surfaces and substantial restyles. It sits above component-level
CSS decisions and beside the enforced rules in `.claude/rules/`.

Use `docs/reference/styling-guide.md` for token and CSS implementation details.
Use the shared primitives named here for interaction behavior. If a legacy
screen conflicts with this document, treat the screen as debt, not precedent.

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

The start-position pictograph carries the hand colour key as part of the
pictograph itself, not as a viewer decoration. Two swatch-and-letter pairs
(`L`, `R`) sit centred in the bottom band of the 950-unit viewBox, the one slot
no other glyph uses, in the same Georgia bold as the step number. Geometry
lives in `packages/render-core` (`calculateHandColorKeyLayout`) so the viewer
start cell, rasterized card fronts and exports, and MCP images bake in the same
key. A hand
that is hidden or absent drops out of the key; the remaining pair recentres.

## 6. Controls and Selection

Actions must look actionable before hover. The minimum pointer target is 44px.
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
as fake disabled inputs when plain text is the honest form. Links go somewhere;
buttons perform actions.

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

Use the shared duration and transition tokens. Do not create feature-local
easing systems or use `transition: all`. Ambient animation is appropriate only
when it belongs to the scene or artifact, not as generic activity around UI
chrome.

## 10. Responsive Composition

Responsive design handles four separate concerns:

1. logical control and text size;
2. composition;
3. reading measure;
4. presentation distance.

Do not solve a wide display by enlarging every control and label. Keep logical
sizes stable, then recompose the available space through columns, rails, wider
artifact areas, and authored content bands.

Use container queries when a component responds to its own allocated space.
Use media queries for shell-level composition and input-model changes.

Mobile keeps the same capability ownership. It may stack, move controls into a
drawer, or give a tool the full screen, but it should not hide core capability
to make the screenshot cleaner.

Review at 375x667, 960x412, 820x1180, 1440x900, 1920x1080, 2560x1440, and
3840x2160, plus 200 percent zoom. Check the composition at each size instead of
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
- Actions look actionable and meet the 44px target.
- Shared primitives own familiar controls and interaction behavior.
- Selection affects the whole object and has a non-color cue.
- Structural changes use the canonical motion system.
- Wide layouts recompose; narrow layouts retain capability.
- The final screenshots look like a product, not generated output.

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
grid. This hierarchy is stable: the Last used label never reorders or resizes
the board. That annotation uses the shared `LastUsedBadge` primitive so Create
and sign-in communicate device-local history the same way.

Each method remains a complete button with one useful description. Its icon,
restrained whole-surface tint, and full perimeter border carry its tab color.
The tiles do not use list-row chevrons, blur, decorative edge strips, or
invented workflow graphics.

On desktop, the chooser uses a deliberately generous front-door scale because
it presents one focused decision rather than dense workspace chrome. The
authored band grows fluidly toward 1440px while its title, icons, descriptions,
and tiles use the desktop baseline defined for this surface. True wide canvases
may extend the band to 1600px, but the controls do not keep magnifying with the
viewport.

Height-constrained landscape screens keep the same two-band bento and compact
its vertical rhythm. The question remains above the choices at every viewport.
