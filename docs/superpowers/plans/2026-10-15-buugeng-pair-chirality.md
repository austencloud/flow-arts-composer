# Buugeng Pair Chirality Implementation Plan

> Executed inline in one run (Austen, 2026-10-15). Spec: `docs/superpowers/specs/active/2026-10-15-buugeng-pair-chirality-design.md`.

**Goal:** Make buugeng chirality understandable: pair tiles drawn on the real grid, one meaning of "A" across versions, and a hands-on explainer on `/notation/props#buugeng`.

**Architecture:** A pure module maps the four pair choices to `(leftFlipped, rightFlipped)`. A `BuugengPairPreview` component renders a real pose-only pictograph (both hands static at south, In) through `PictographContainer`, cropped to the props' area. `PropChiralityRow` becomes the pair picker on `SegmentedControl`. The Flow DNA model is mirrored at its Blender source so Version 2 sprites and the 3D view match the notation art; a raster test guards handedness.

**Tech:** Svelte 5, Vitest, sharp, Blender 5.0 headless.

**Worktree:** `E:/worktrees/tka-platform/buugeng-pair`, branch `codex/buugeng-pair`.

---

### Task 1: One meaning of A

**Files:** `tests/unit/buugeng-art-handedness.test.ts` (new), `scripts/build-buugeng-model.py`, `static/models/props/buugeng.glb`, `static/images/props/appearances/model/{buugeng,bigbuugeng}-{blue,red}.svg`, `src/lib/shared/pictograph/prop/domain/prop-model-sprites.generated.ts`.

1. Test: rasterize each artwork with sharp and take the sign of the alpha-weighted covariance of x and y about the ink centroid. Mirroring flips that sign. Assert every buugeng artwork (notation `buugeng.svg`, `bigbuugeng.svg`, the four model sprites) has the notation art's sign. Run it: the model sprites fail.
2. Mirror the trace in `import_body`: negate the width coordinate when placing vertices and flip the fill's normals so face orientation is unchanged.
3. `blender -b --python scripts/build-buugeng-model.py -- --output static/models/props/buugeng.glb`, then `node scripts/verify-buugeng-glb.cjs`.
4. Recapture sprites at `/test/prop-3d-studio/sprites?prop=buugeng` and `?prop=bigbuugeng` from a worktree dev server on a free port.
5. Test passes. Check the 3D view's unflipped buugeng against the notation art. Commit.

### Task 2: Pair tiles in the picker

**Files:** `src/lib/shared/settings/components/tabs/prop-type/buugeng-pair.ts` (+ test), `.../BuugengPairPreview.svelte` (new), `.../PropChiralityRow.svelte`, i18n locale files.

1. `buugeng-pair.ts`: `BUUGENG_PAIRS` (four ids with flips and kind), `pairFor(left, right)`, `flipsFor(pairId)`, plus the one-hand options. Unit test both directions.
2. `BuugengPairPreview.svelte`: builds static south/In pictograph data once, renders `PictographContainer` with `poseOnly`, `showArrow={false}`, prop type, look and buugeng overrides, colors, dark mode; crops with an inner box scaled and offset so viewBox region `245 420 460 400` fills the tile. Optional `dimHand` for the one-hand form.
3. `PropChiralityRow.svelte`: heading "Buugeng pair", hint, "What's this?" pill to `/notation/props#buugeng-chirality`; both hands: one `SegmentedControl` of four with `optionContent` = preview + caption; one hand: A/B with the other hand's pick shown dimmed. Writes go through the existing `onChange(hand, flipped)`.
4. Strings through `t()`. Run the prop-type tests and svelte-check on touched files. Commit.

### Task 3: Props page explainer

**Files:** `src/routes/(public)/notation/props/BuugengChirality.svelte` (new), `+page.svelte`, `props-content.ts` if copy lives there.

1. Component: heading "Chirality", paragraph, the four pair tiles; emits the chosen flips. Anchor id `buugeng-chirality`.
2. Page: page-local `$state` flips, passed to `SequenceHeroDemo` and to the component; render it in the Buugeng panel only. Starts on Both A.
3. Hash `#buugeng-chirality` opens the Buugeng tab and scrolls to the part. Commit.

### Task 4: Verify and finish

- In-app browser on the worktree server: Change Prop sheet (both-hands and per-hand hosts, Version 1 and 2, Standard and Big) at desktop, 707x772 and 412x915; props page tiles change the demo; the pill lands on the part.
- Gates on d2 where possible; `npm run wt:finish -- codex/buugeng-pair --route /notation/props`.
