---
status: active
value: 3
effort: M
remaining: "Plan and build: pair picker tiles, Flow DNA model handedness fix with art handedness test, and the props-page chirality explainer."
depends_on: ""
plan_path: ""
tags: [props, buugeng, settings]
last_triaged: 2026-10-15
work_state: ready
---
# Buugeng Pair Chirality

- **Date:** 2026-10-15
- **Status:** Design approved by Austen, 2026-10-15. Not built.
- **Mockups:** `.superpowers/brainstorm/104801-1792050427/content/` (gitignored): `pair-picker-real-grid.html`, `props-page-explainer.html`.

## Why

Austen, reviewing the Change Prop sheet on 2026-10-15: chirality is not explained, the previews do not respond to the A/B choice, and the two Version cards already show opposite chirality.

What the code shows:

1. `PropChiralityRow.svelte` offers A/B per hand with a single-prop glyph per segment. A single prop off the grid cannot show the only effect chirality has: at a shared hand point, two buugeng of opposite chirality nest into one figure eight (`calculateBetaOffset` Gate 4 in `src/lib/shared/render/core/calculations/beta-offset.ts` skips the separation), and two of the same chirality get the normal beta separation of 950/45 units each way.
2. The Version cards (`PropLookPicker.svelte`) draw the base art and ignore chirality.
3. The Version 1 notation art (`static/images/props/buugeng.svg`) and the Version 2 model capture (`static/images/props/appearances/model/buugeng-*.svg`, from `static/models/props/buugeng.glb`) are mirror images. "A" is a different shape depending on the version, which is a bug.
4. Nothing in the app or on `/notation/props#buugeng` says what chirality is.

## Decisions

### 1. The picker becomes "Buugeng pair"

- Heading "Buugeng pair". Hint: "Mirrored pairs join into one shape. Matching pairs sit side by side." A small pill button, "What's this?", opens `/notation/props#buugeng` scrolled to the chirality part (follows `clickables-look-like-buttons.md` and `no-text-links.md`).
- Hosts that set both hands get four tiles in one `SegmentedControl` (exactly one active, per `chip-primitives.md`):
  - Mirrored: left A, right B
  - Mirrored: left B, right A
  - Matching: both A
  - Matching: both B
- One tap writes both `leftBuugengFlipped` and `rightBuugengFlipped` through the existing `PropChiralitySeam.onChange`. The seam contract (per-hand states, per-hand writes) stays; the row maps a tile to two writes.
- Each tile shows both props on the real diamond grid, both at the south hand point with In orientation, cropped to the props' area (about viewBox `245 420 460 400` of the 950 grid). The tile is rendered by the real pictograph pipeline with the chosen flips, the selected prop type, the selected version (`propLook`) and the viewer's colors. No hand-drawn grid or hand-placed props.
- Hosts that set one hand (cat-dog mode, the per-hand sheets in `PropTypeTab.svelte`) get two tiles, A and B, each drawn as a pair using the other hand's current pick, so the outcome stays visible. The other hand's prop is drawn at reduced opacity.
- Tile captions name the relationship and the letters ("Mirrored", "Left A, right B"). Accessible names carry the full description. Tiles keep visible hand identity through color plus the caption, never color alone.

### 2. One meaning of "A" across versions

- The notation art defines A (its proportions are canonical, per `prop-look.ts`).
- Mirror the Flow DNA model at its source (`scripts/build-buugeng-model.py` output, `static/models/props/buugeng.glb`) so the model matches the notation art, then recapture the Version 2 sprites for `buugeng` and `bigbuugeng` and regenerate `prop-model-sprites.generated.ts`. Fixing it at the model also aligns the 3D viewer; confirm the 3D view's unflipped buugeng matches the notation art before and after.
- Version cards always draw shape A. They show style only; the pair tiles show chirality.
- Add a test that measures handedness from each buugeng artwork (notation SVGs, both model sprite colors, standard and big) and fails when any disagrees. Measure from the path geometry, for example which side of the vertical midline holds the upper lobe's ink.

### 3. Props page explainer

- The Buugeng panel on `/notation/props` (`props-content.ts`, `+page.svelte`) gets a "Chirality" part after its two paragraphs: a short paragraph, then the same pair tiles (both-hands form).
- Pressing a tile sets page-local `leftBuugengFlipped`/`rightBuugengFlipped` on `SequenceHeroDemo`, which already accepts them, and the demo replays with that pair. It never writes user settings. It starts on Both A, the app default.
- The part has a stable anchor that the picker's "What's this?" pill targets, and the `#buugeng` hash keeps opening the Buugeng tab.
- Draft paragraph (final wording goes through the writing-style rules): "Every buugeng is an S that can face one of two ways, called A and B. When both props land on the same spot, a mirrored pair stacks into one figure eight, and a matching pair sits side by side. Pick a pair to watch it."

### 4. Copy

New strings go through i18n (`t()`), replacing `settings_buugeng_chirality` and `settings_buugeng_choose_side` in the picker. Pictograph-inspect's A/B labels stay as they are.

## Out of scope

- Renaming the stored settings fields.
- Chirality for non-buugeng props.
- Changing beta-offset behavior.

## Verification

- Unit: tile to `(leftFlipped, rightFlipped)` mapping in both directions, single-hand tiles, and the art handedness test.
- Browser (in-app pane): the Change Prop sheet on desktop and at the Fold sizes (707 by 772 inner, 412 by 915 cover), both-hands and single-hand hosts, both versions, Standard and Big. Tiles read the real render and the selected tile tracks the setting.
- Props page: press each tile and watch the demo change; confirm "What's this?" lands on the part.
- 3D view: unflipped buugeng matches the notation art.
