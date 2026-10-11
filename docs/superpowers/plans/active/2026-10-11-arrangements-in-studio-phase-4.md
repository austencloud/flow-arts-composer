# Arrangements in Studio, Phase 4: Look and Effects per Cell

> **For agentic workers:** This plan is executed inline in one worktree
> (`E:/worktrees/tka-platform/arrangements-studio-p4`, branch
> `codex/arrangements-studio-p4`) under the Agent Budget rule: no per-task
> subagents, one review at most. Steps use checkbox (`- [ ]`) syntax for
> tracking. Phase 5 of the spec gets its own plan when it begins.

**Spec:** `docs/superpowers/specs/2026-10-11-arrangements-in-studio-design.md`,
sections "Selection" (tool rows), "Panels" (Look, Effects, Effort, Speed),
"One effects system" (`ArrangementCellCanvas` reads `appearance`), "Testing"
(`toolRow` / `availablePanels`, export frames show the cell effect), "Visual
verification" and "Phases" (phase 4).

**Goal:** A selected arrangement gets Look and Effects panels that edit the
grid's default `appearance`; a selected cell gets Look, Effects and Effort
panels that edit the cell's own override, with the cell's left/right hand
switches and a scope row (Cell · Left · Right · Tips) that writes the cell's
per-hand and per-tip `tipEffectMap` / `tipEffortMap`. The item row also gains
Speed. The cell renderer draws from the resolved appearance through the same
effects state Studio animation items use, so the preview and the export show
the cell's look.

**Architecture:** One appearance model, read in two places. A new pure module
`arrangement-look.ts` merges the grid's look under a cell's set flags
(`arrangementCellLook`) and turns a panel change into a cell override that
keeps only the flags the change moved (`arrangementLookOverride`, the rule the
tunnel look already follows in `PostItemTool`). The effects fold that
`PostStudioSequenceAnimationLayer` and `PostAnimationAppearanceTool` each
carry inline (trail look over a fallback config) becomes one function,
`postAnimationEffectsConfig`, in `post-animation-effects.svelte.ts`, which
moves from the Studio component folder into `media-composition/domain` so the
cell renderer can import it without a layering inversion. `ArrangementCellCanvas`
then owns a per-cell ephemeral `AnimationVisibilityStateManager`,
`EffectsConfigState` and trail settings, exactly as the Studio animation layer
owns them per item, and passes them to `AnimatorCanvas`; the cell's legacy
`effect` / `trailMode` / `effort` working-copy fields (still written by the
nested editor until phase 5) are folded through `migrateArrangementCell`
before the merge, so that editor's preview keeps working. Per-hand visibility
reaches the engine through a new `motionVisibility` prop on `AnimatorCanvas`
and `CanvasSurface`, which, when set, replaces the viewer's Blue/Red toggles
for that canvas. The panels reuse `PostAnimationAppearanceTool` with a new
`sections` prop so Look shows props + display, Effects shows the scoped
effects panel and Effort shows the efforts panel; `PostArrangementTool` hosts
them for the four new tools (`look`, `effects`, `effort`, `speed`) and adds
the hand switches, the scope row and the per-scope pickers.

**Deviations recorded here:**

- The item row keeps "Edit arrangement" (`arrangement`) until phase 5, as the
  spec's phase 2 note allows ("The 'Edit arrangement' button remains for
  anything not yet covered"); the spec's phase 4 row omits it.
- `transition` is not placed in the row. No kind's row lists it; it reaches
  the panel through `availablePanels` when a cut is selected, and this plan
  adds `arrangement` to the kinds that offer it (not a cell).
- A hand or tip scope has three states, all reachable: follow the cell (no
  key), off (an explicit `none`, which the cascade in `resolveEffect` honours
  over the cell-wide effect), or an effect. `EffectSelector` reports every tap
  as the tapped id, so the host turns a repeated tap of the active effect
  into `none` and offers a "Follow the cell" chip to clear the key.

**Composition check (ui-bust plan mode, self-review, less independent):** the
new panels mount in the same two placements as Grid and Layers already do:
beside the preview from 1024 px up (`PostToolPanel` side, `fill` true) and in
the dock under the preview on phones and tablets in portrait. The appearance
tool was designed for both and bounds its choosers with `fill`; the only new
intrinsic content is the scope row (four chips, plus up to four tip chips) and
the per-scope roster, which the dock scrolls. Risk to verify: at 375×667 the
Effects panel with scope "Left" stacks hint + chips + a 16-tile roster; it
must scroll inside the dock without horizontal overflow. Checked in Task 5.

**Tech stack:** Svelte 5 runes, TypeScript, zod schemas already in place,
Vitest (`npm run test:ci -- <paths>`), `check:fast`, the in-app browser on
the primary server (port 5173) after `wt:finish`.

---

## File structure

| File | Change |
| --- | --- |
| `src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts` | `effort` tool id; new arrangement and cell rows; `availablePanels` adds `transition` for an arrangement (not a cell) |
| `src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts` | `effort` icon and label; `toolLabel(id, kind)` names the arrangement's Look panel "Look" |
| `src/lib/shared/share/components/post-studio/editor/PostToolRow.svelte`, `PostToolPanel.svelte` | take `kind` for the label |
| `src/lib/shared/media-composition/domain/arrangement-edits.ts` | `setCellTipEffects`, `setCellTipEfforts`, `setCellMotionVisibility` |
| `src/lib/shared/media-composition/domain/post-project-edits.ts` | wrappers plus `setArrangementSpeed` |
| `src/lib/shared/media-composition/domain/arrangement-look.ts` (new) | `arrangementCellLook`, `arrangementLookOverride` |
| `src/lib/shared/media-composition/domain/post-animation-effects.svelte.ts` (moved from `share/components/post-studio/`) | adds `postAnimationEffectsConfig` |
| `src/lib/shared/share/components/post-studio/PostStudioSequenceAnimationLayer.svelte`, `editor/PostAnimationAppearanceTool.svelte` | use the shared fold; the tool gains `sections` |
| `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte`, `CanvasSurface.svelte` | `motionVisibility` prop |
| `src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte` | reads the resolved look; `gridAppearance` prop |
| `src/lib/shared/share/components/post-studio/PostStudioArrangementLayer.svelte` | passes `gridAppearance` |
| `src/lib/shared/share/components/post-studio/editor/PostArrangementTool.svelte` | `look`, `effects`, `effort`, `speed` panels; hand switches; scope row |
| `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte` | routes the four tools to the arrangement tool; row filter; `kind` for labels |
| `src/routes/test/studio-arrangement/fixture.ts` | one cell starts with a fire look |
| `tests/unit/media-composition/post-editor-tools.test.ts`, `arrangement-edits.test.ts`, `arrangement-look.test.ts` (new), `post-animation-effects.test.ts` (extended) | tests |

---

### Task 1: Tool rows and labels

**Files:**
- Modify: `src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts`
- Modify: `src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts`
- Modify: `src/lib/shared/share/components/post-studio/editor/PostToolRow.svelte`
- Modify: `src/lib/shared/share/components/post-studio/editor/PostToolPanel.svelte`
- Modify: `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte` (the `tools` filter, lines ~1272–1276; the `<PostToolRow>` at ~2786; the `<PostToolPanel>` in the `panel` snippet at ~2962)
- Test: `tests/unit/media-composition/post-editor-tools.test.ts`

- [ ] **Step 1: Replace the two arrangement tests**

In `post-editor-tools.test.ts`, replace the `it("offers Grid first and keeps Edit arrangement for an arrangement", …)` and `it("offers the cell's own tools, ending in Clear, for a cell", …)` blocks with:

```ts
  it("offers Grid, Edit arrangement, Speed and the look tools for an arrangement", () => {
    expect(toolRow(ARRANGEMENT)).toEqual([
      "back",
      "grid",
      "arrangement",
      "split",
      "speed",
      "look",
      "effects",
      "timing",
      "position",
      "fade",
      "rename",
      "duplicate",
      "delete",
    ]);
    expect(availablePanels(ARRANGEMENT)).toContain("transition");
  });

  it("offers the cell's own tools, Look to Effort, ending in Clear, for a cell", () => {
    expect(toolRow(CELL)).toEqual([
      "back",
      "sequence",
      "layers",
      "offset",
      "look",
      "effects",
      "effort",
      "clear",
    ]);
    expect(isPanelTool("effort")).toBe(true);
    expect(isPanelTool("clear")).toBe(false);
    expect(availablePanels(CELL)).not.toContain("transition");
  });
```

- [ ] **Step 2: Run the test file; expect the two new tests to fail**

Run: `npm run test:ci -- tests/unit/media-composition/post-editor-tools.test.ts`
Expected: 2 failed (row mismatch; `"effort"` not assignable also fails type-wise but vitest runs it).

- [ ] **Step 3: Change the rows**

In `post-editor-tools.ts`:

```ts
  | "effects"
  | "effort"
  | "labels"
```

```ts
    case "arrangement":
      if (selection.cell)
        return [
          "back",
          "sequence",
          "layers",
          "offset",
          "look",
          "effects",
          "effort",
          "clear",
        ];
      return [
        "back",
        "grid",
        "arrangement",
        "split",
        "speed",
        "look",
        "effects",
        "timing",
        ...ITEM_TAIL,
      ];
```

```ts
/** Panels the selection can show: its row's, plus Export for the post. */
export function availablePanels(
  selection: PostToolSelection
): PostPanelToolId[] {
  const panels = toolRow(selection).filter(isPanelTool);
  if (selection.music) return panels;
  if (selection.kind === null) return [...panels, "export"];
  const cuts = [
    "video",
    "image",
    "card",
    "animation",
    "moves",
    "carousel",
    "arrangement",
  ].includes(selection.kind);
  return cuts && !selection.cell ? [...panels, "transition"] : panels;
}
```

- [ ] **Step 4: Labels**

In `post-editor-labels.ts`, add `PostItemKind` to the `post-project.js` type import, add `effort: "fa-person-running",` after `effects` in `TOOL_ICON`, and change `toolLabel`:

```ts
/** The short name under a tool's icon, also its panel's title. */
export function toolLabel(
  id: PostToolId,
  kind: PostItemKind | null = null
): string {
  switch (id) {
    …
    case "look":
      return kind === "arrangement" ? "Look" : "Animation defaults";
    …
    case "effects":
      return t("post_editor_tool_effects");
    case "effort":
      return "Effort";
```

`PostToolRow.svelte`: add `kind?: PostItemKind | null;` to `Props` (import the type from `#lib/shared/media-composition/domain/post-project.js`), destructure `kind = null`, and pass it in `titleFor` (`toolLabel(id, kind)` in both returns) and in the label span `{toolLabel(id, kind)}`.

`PostToolPanel.svelte`: same `kind` prop; title `{toolLabel(tool, kind)}`.

`PostEditorWorkspace.svelte`:

```ts
  const tools = $derived(
    toolRow(selection).filter(
      (id) =>
        sequence !== null ||
        selection.kind === "arrangement" ||
        (id !== "look" && id !== "beats")
    )
  );
```

```svelte
  <PostToolRow
    {tools}
    kind={selection.kind}
    shown={panelBeside ? shown : null}
```

```svelte
  <PostToolPanel
    {tool}
    kind={editor.selectedItem?.kind ?? null}
    subject={…}
```

- [ ] **Step 5: Run the test file; expect all green**

Run: `npm run test:ci -- tests/unit/media-composition/post-editor-tools.test.ts`
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(studio): look, effects, effort and speed tools in the arrangement rows" -- src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts src/lib/shared/share/components/post-studio/editor/PostToolRow.svelte src/lib/shared/share/components/post-studio/editor/PostToolPanel.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte tests/unit/media-composition/post-editor-tools.test.ts
```

(The workspace's `panelBody` routing lands in Task 4; until then the new tools fall through to `PostItemTool`, which renders nothing for them. That is fine between commits.)

---

### Task 2: Pure edits, the look merge and the item speed

**Files:**
- Modify: `src/lib/shared/media-composition/domain/arrangement-edits.ts` (after `setCellAppearance`)
- Modify: `src/lib/shared/media-composition/domain/post-project-edits.ts` (after `setArrangementCellAppearance`, ~line 342)
- Create: `src/lib/shared/media-composition/domain/arrangement-look.ts`
- Test: `tests/unit/media-composition/arrangement-edits.test.ts`
- Test: `tests/unit/media-composition/arrangement-look.test.ts`

- [ ] **Step 1: Write the failing edit tests**

In `arrangement-edits.test.ts`, extend the imports (`setCellMotionVisibility`, `setCellTipEffects`, `setCellTipEfforts` from arrangement-edits; `setArrangementSpeed` from post-project-edits) and add inside the `describe` that holds the `setCellAppearance` test, after it:

```ts
  it("keeps per-hand effects and efforts on the cell and drops empty maps", () => {
    const start = grid(1, 1, [filled(0, 0, 4)]);
    const withHand = setCellTipEffects(start, "cell-0-0", {
      "0": { effect: "fire" },
    });
    expect(cellAt(withHand, 0, 0)?.tipEffectMap).toEqual({
      "0": { effect: "fire" },
    });
    expect(
      setCellTipEffects(withHand, "cell-0-0", { "0": { effect: "fire" } })
    ).toBe(withHand);
    expect(cellAt(setCellTipEffects(withHand, "cell-0-0", {}), 0, 0)).not.toHaveProperty(
      "tipEffectMap"
    );
    const withEffort = setCellTipEfforts(start, "cell-0-0", {
      "1": { effort: "bounce" },
    });
    expect(cellAt(withEffort, 0, 0)?.tipEffortMap).toEqual({
      "1": { effort: "bounce" },
    });
    expect(setCellTipEffects(start, "missing", { "*": { effect: "led" } })).toBe(start);
  });

  it("hides a hand with a flag and drops the flag when it shows again", () => {
    const start = grid(1, 1, [filled(0, 0, 4)]);
    const hidden = setCellMotionVisibility(start, "cell-0-0", { left: false });
    expect(cellAt(hidden, 0, 0)).toMatchObject({ leftMotionVisible: false });
    expect(cellAt(hidden, 0, 0)).not.toHaveProperty("rightMotionVisible");
    expect(setCellMotionVisibility(hidden, "cell-0-0", { left: false })).toBe(hidden);
    expect(
      cellAt(setCellMotionVisibility(hidden, "cell-0-0", { left: true }), 0, 0)
    ).not.toHaveProperty("leftMotionVisible");
    expect(setCellMotionVisibility(start, "cell-0-0", { right: true })).toBe(start);
  });
```

And a new `describe("setArrangementSpeed", …)` at the end of the file, using the same `ctx` literal the file's `clearArrangementCell` test passes:

```ts
describe("setArrangementSpeed", () => {
  it("scales the clip's length with its speed and keeps its source span", () => {
    const project = createArrangementProject(grid(1, 1, [filled(0, 0, 4)]), "seq", NOW);
    const item = project.tracks[0]!.items[0]!;
    const faster = setArrangementSpeed(project, item.id, 2, CTX);
    const next = faster.tracks[0]!.items[0]!;
    expect(next).toMatchObject({ speed: 2, sourceIn: item.sourceIn, sourceOut: item.sourceOut });
    expect(next.duration).toBeCloseTo(item.duration / 2, 6);
    expect(setArrangementSpeed(faster, item.id, 2, CTX)).toBe(faster);
    expect(setArrangementSpeed(project, item.id, 100, CTX).tracks[0]!.items[0]!.speed).toBe(4);
  });
});
```

(`CTX` is whatever name the file already uses for its edit context; reuse it rather than adding a second.)

- [ ] **Step 2: Write the failing look tests**

`tests/unit/media-composition/arrangement-look.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  arrangementCellLook,
  arrangementLookOverride,
} from "#lib/shared/media-composition/domain/arrangement-look.js";

describe("arrangementCellLook", () => {
  it("reads the cell's flags over the grid's and is null when neither says anything", () => {
    expect(arrangementCellLook(undefined, {})).toBeNull();
    expect(arrangementCellLook({ darkMode: true }, {})).toEqual({ darkMode: true });
    expect(
      arrangementCellLook({ darkMode: true, props: false }, { appearance: { props: true } })
    ).toEqual({ darkMode: true, props: true });
  });
});

describe("arrangementLookOverride", () => {
  it("keeps only the flags a change moved, over what the cell already said", () => {
    const look = { props: false, darkMode: true, effortPreset: "glide" as const };
    expect(arrangementLookOverride({ props: false }, look, ["darkMode"])).toEqual({
      props: false,
      darkMode: true,
    });
    expect(arrangementLookOverride({ props: false }, look, [])).toEqual({ props: false });
  });

  it("drops a flag the change set back to unsaid and is undefined once nothing is left", () => {
    expect(
      arrangementLookOverride({ mandalaThickness: 4 }, { props: true }, ["mandalaThickness"])
    ).toBeUndefined();
    expect(
      arrangementLookOverride({ mandalaThickness: 4, props: true }, { props: true }, [
        "mandalaThickness",
      ])
    ).toEqual({ props: true });
  });
});
```

- [ ] **Step 3: Run both files; expect failures (missing exports)**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-edits.test.ts tests/unit/media-composition/arrangement-look.test.ts`

- [ ] **Step 4: The pure edits**

In `arrangement-edits.ts`, import `TipEffectMap` and `TipEffortMap` types from `#lib/shared/animation-engine/domain/types/tip-effect-types.js` (if not already imported) and add after `setCellAppearance`:

```ts
/** Per-hand and per-tip effects for one cell; an empty map removes the field. */
export function setCellTipEffects(
  snapshot: ArrangementSnapshot,
  cellId: string,
  map: TipEffectMap | undefined
): ArrangementSnapshot {
  const cell = findCell(snapshot, cellId);
  if (!cell) return snapshot;
  const next = map && Object.keys(map).length > 0 ? map : undefined;
  if (sameJson(cell.tipEffectMap, next)) return snapshot;
  const { tipEffectMap: _previous, ...rest } = cell;
  return replaceCell(snapshot, cellId, next ? { ...rest, tipEffectMap: next } : rest);
}

/** Per-hand and per-tip efforts for one cell; an empty map removes the field. */
export function setCellTipEfforts(
  snapshot: ArrangementSnapshot,
  cellId: string,
  map: TipEffortMap | undefined
): ArrangementSnapshot {
  const cell = findCell(snapshot, cellId);
  if (!cell) return snapshot;
  const next = map && Object.keys(map).length > 0 ? map : undefined;
  if (sameJson(cell.tipEffortMap, next)) return snapshot;
  const { tipEffortMap: _previous, ...rest } = cell;
  return replaceCell(snapshot, cellId, next ? { ...rest, tipEffortMap: next } : rest);
}

/** Which hands a cell draws. Shown is the default, so a shown hand carries no flag. */
export function setCellMotionVisibility(
  snapshot: ArrangementSnapshot,
  cellId: string,
  visible: { left?: boolean; right?: boolean }
): ArrangementSnapshot {
  const cell = findCell(snapshot, cellId);
  if (!cell) return snapshot;
  const left = visible.left ?? cell.leftMotionVisible ?? true;
  const right = visible.right ?? cell.rightMotionVisible ?? true;
  const { leftMotionVisible: _left, rightMotionVisible: _right, ...rest } = cell;
  const next: ArrangementCell = {
    ...rest,
    ...(left ? {} : { leftMotionVisible: false }),
    ...(right ? {} : { rightMotionVisible: false }),
  };
  return sameJson(cell, next) ? snapshot : replaceCell(snapshot, cellId, next);
}
```

- [ ] **Step 5: The project wrappers and the item speed**

In `post-project-edits.ts`, extend the `./arrangement-edits.js` import with the three functions and add after `setArrangementCellAppearance`:

```ts
export function setArrangementCellTipEffects(
  project: PostProject,
  itemId: string,
  cellId: string,
  map: TipEffectMap | undefined,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellTipEffects(snapshot, cellId, map)
  );
}

export function setArrangementCellTipEfforts(
  project: PostProject,
  itemId: string,
  cellId: string,
  map: TipEffortMap | undefined,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellTipEfforts(snapshot, cellId, map)
  );
}

export function setArrangementCellMotionVisibility(
  project: PostProject,
  itemId: string,
  cellId: string,
  visible: { left?: boolean; right?: boolean },
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellMotionVisibility(snapshot, cellId, visible)
  );
}

/** The clip's playback speed; its source span stays and its length follows, as a video's does. */
export function setArrangementSpeed(
  project: PostProject,
  itemId: string,
  speed: number,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (located?.item.kind !== "arrangement" || !Number.isFinite(speed))
    return project;
  const item = located.item;
  const next = clamp(speed, POST_MIN_SPEED, POST_MAX_SPEED);
  if (next === item.speed) return project;
  return finish(
    replaceItem(project, itemId, {
      ...item,
      speed: next,
      duration: (item.sourceOut - item.sourceIn) / next,
    }),
    ctx
  );
}
```

(`TipEffectMap` / `TipEffortMap` types come from `#lib/shared/animation-engine/domain/types/tip-effect-types.js`; `clamp`, `POST_MIN_SPEED`, `POST_MAX_SPEED`, `finish`, `replaceItem` are already in the file.)

- [ ] **Step 6: The look module**

`src/lib/shared/media-composition/domain/arrangement-look.ts`:

```ts
import type { ArrangementCell } from "./arrangement.js";
import type { PostAnimationAppearance } from "./post-animation-appearance.js";

/**
 * The look a cell draws with: the grid's default under the cell's own set
 * flags, the way a tunnel's look is read over its animation's. Null when
 * neither says anything, so the viewer's own settings apply.
 */
export function arrangementCellLook(
  grid: PostAnimationAppearance | undefined,
  cell: Pick<ArrangementCell, "appearance">
): PostAnimationAppearance | null {
  if (!grid && !cell.appearance) return null;
  return { ...grid, ...cell.appearance };
}

/**
 * A cell's override after a panel change: the flags the change moved, over
 * what the cell already said. A flag set back to unsaid leaves the override,
 * so the cell follows the grid for it again; an empty override is undefined.
 */
export function arrangementLookOverride(
  previous: PostAnimationAppearance | undefined,
  look: PostAnimationAppearance,
  changed: readonly (keyof PostAnimationAppearance)[]
): PostAnimationAppearance | undefined {
  if (changed.length === 0) return previous;
  const next: Record<string, unknown> = { ...previous };
  for (const key of changed) {
    const value = look[key];
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return Object.keys(next).length > 0
    ? (next as PostAnimationAppearance)
    : undefined;
}
```

- [ ] **Step 7: Run both files; expect green**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-edits.test.ts tests/unit/media-composition/arrangement-look.test.ts`

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(arrangement): per-hand effect and effort edits, hand visibility, item speed and the cell look merge" -- src/lib/shared/media-composition/domain/arrangement-edits.ts src/lib/shared/media-composition/domain/post-project-edits.ts src/lib/shared/media-composition/domain/arrangement-look.ts tests/unit/media-composition/arrangement-edits.test.ts tests/unit/media-composition/arrangement-look.test.ts
```

---

### Task 3: The renderer reads the look

**Files:**
- Move: `src/lib/shared/share/components/post-studio/post-animation-effects.svelte.ts` → `src/lib/shared/media-composition/domain/post-animation-effects.svelte.ts` (`git mv`)
- Modify: `src/lib/shared/share/components/post-studio/PostStudioSequenceAnimationLayer.svelte` (import path; the fold inside the `$effect` at ~lines 149–175)
- Modify: `src/lib/shared/share/components/post-studio/editor/PostAnimationAppearanceTool.svelte` (import path; the fold at ~lines 325–345)
- Modify: `src/lib/shared/animation-engine/components/CanvasSurface.svelte` (prop + the motion effect at ~line 340)
- Modify: `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte` (prop; both `CanvasSurface` mounts)
- Modify: `src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte`
- Modify: `src/lib/shared/share/components/post-studio/PostStudioArrangementLayer.svelte`
- Test: `tests/unit/media-composition/post-animation-effects.test.ts`

- [ ] **Step 1: Write the failing fold test**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { postAnimationEffectsConfig } from "#lib/shared/media-composition/domain/post-animation-effects.svelte.js";

const TRAIL = {
  enabled: true,
  trackingMode: "tip" as const,
  thickness: 7,
  brightness: 0.5,
  tailLength: 12,
  leftColor: "#111111",
  rightColor: "#222222",
};

describe("postAnimationEffectsConfig", () => {
  it("copies the appearance's own effects and leaves the source alone", () => {
    const effects = { ...DEFAULT_EFFECTS_CONFIG, activeEffect: "fire" as const };
    const config = postAnimationEffectsConfig({ effects }, DEFAULT_EFFECTS_CONFIG);
    expect(config).toEqual(effects);
    expect(config).not.toBe(effects);
    expect(config.trails).not.toBe(effects.trails);
  });

  it("folds a trail look over the fallback when the appearance has no effects of its own", () => {
    const config = postAnimationEffectsConfig({ trail: TRAIL }, DEFAULT_EFFECTS_CONFIG);
    expect(config.activeEffect).toBe("trails");
    expect(config.tipEffectMap).toEqual({ "*": { effect: "trails" } });
    expect(config.trails).toMatchObject({ thickness: 7, brightness: 0.5, leftColor: "#111111" });
    const off = postAnimationEffectsConfig({ trail: { ...TRAIL, enabled: false } }, DEFAULT_EFFECTS_CONFIG);
    expect(off.activeEffect).toBe("none");
    expect(off.tipEffectMap).toEqual({});
  });

  it("gives back a copy of the fallback for no appearance", () => {
    const config = postAnimationEffectsConfig(null, DEFAULT_EFFECTS_CONFIG);
    expect(config).toEqual(DEFAULT_EFFECTS_CONFIG);
    expect(config).not.toBe(DEFAULT_EFFECTS_CONFIG);
  });
});
```

(If `trackingMode` is not literally `"tip"` in `TrailTrackingMode`, use the union's first member; read `trail-types.ts`.)

- [ ] **Step 2: Move the module and add the fold**

`git mv src/lib/shared/share/components/post-studio/post-animation-effects.svelte.ts src/lib/shared/media-composition/domain/post-animation-effects.svelte.ts`, then make it read:

```ts
import type { EffectsConfig } from "#lib/shared/effects/domain/effects-config.js";
import { foldTrailIntentIntoSettings } from "#lib/shared/effects/translators/canvas2d-translator.js";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
  type TrailSettings,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { PostAnimationAppearance } from "./post-animation-appearance.js";

/** Detach saved appearance effects before handing them to scoped effect state. */
export function copyPostAnimationEffects(
  effects: EffectsConfig
): EffectsConfig {
  return structuredClone($state.snapshot(effects)) as EffectsConfig;
}

/**
 * The effects an appearance draws with: its own config, else `fallback` with
 * the appearance's trail look folded over it (an item saved before effects
 * were kept whole has only a trail).
 */
export function postAnimationEffectsConfig(
  appearance: PostAnimationAppearance | null | undefined,
  fallback: EffectsConfig
): EffectsConfig {
  const effects = copyPostAnimationEffects(appearance?.effects ?? fallback);
  const trail = appearance?.trail;
  if (!trail || appearance?.effects) return effects;
  effects.trails = {
    ...effects.trails,
    trackingMode: trail.trackingMode,
    thickness: trail.thickness,
    brightness: trail.brightness,
    leftColor: trail.leftColor,
    rightColor: trail.rightColor,
  };
  effects.activeEffect = trail.enabled ? "trails" : "none";
  effects.tipEffectMap = trail.enabled ? { "*": { effect: "trails" } } : {};
  return effects;
}

/** A post's selected trail look belongs to that item, even if viewer trails are off. */
export function postAnimationTrailSettings(
  base: TrailSettings,
  effects: EffectsConfig,
  trail: PostAnimationAppearance["trail"]
): TrailSettings {
  const saved = trail?.settings;
  const source = trail ? { ...DEFAULT_TRAIL_SETTINGS, ...saved } : base;
  return foldTrailIntentIntoSettings(
    {
      ...source,
      mode: saved?.mode ?? TrailMode.FADE,
      trackingMode: trail?.trackingMode ?? source.trackingMode,
      tailLength: trail?.tailLength ?? source.tailLength,
    },
    effects.trails
  );
}
```

- [ ] **Step 3: Use the fold in the two existing owners**

`PostStudioSequenceAnimationLayer.svelte`: import `postAnimationEffectsConfig, postAnimationTrailSettings` from `#lib/shared/media-composition/domain/post-animation-effects.svelte` (drop `copyPostAnimationEffects`) and replace the body of the `$effect` after `itemVisibility.updateSettings({...})` with:

```ts
      const effectConfig = postAnimationEffectsConfig(appearance, initialEffects);
      itemTrailSettings = postAnimationTrailSettings(
        animationSettings.snapshot().trail,
        effectConfig,
        appearance.trail
      );
      itemEffects.replace(effectConfig);
```

`PostAnimationAppearanceTool.svelte`: same import change; replace from `const nextEffects = copyPostAnimationEffects(` through `trailEffects.replace(nextEffects);` with:

```ts
        const nextEffects = postAnimationEffectsConfig(appearance, initialEffects);
        trailSettings.updateSettings({
          trail: postAnimationTrailSettings(initialTrail, nextEffects, trail),
        });
        trailEffects.replace(nextEffects);
```

- [ ] **Step 4: `motionVisibility` on the canvas**

`CanvasSurface.svelte`: after `visibilityManagerOverride = undefined,` add `motionVisibility = undefined,`; after the `visibilityManagerOverride?:` type line add:

```ts
    /** This canvas's own hands to draw. Set, it replaces the viewer's Blue/Red toggles. */
    motionVisibility?: { left: boolean; right: boolean };
```

Replace the motion effect:

```ts
  $effect(() => {
    const own = motionVisibility;
    if (own) {
      engineInstance.setMotionVisibility(own.left, own.right);
      return;
    }
    if (!viewerVisibilityCtx) return;
    engineInstance.setMotionVisibility(
      viewerVisibilityCtx.leftMotion,
      viewerVisibilityCtx.rightMotion
    );
  });
```

`AnimatorCanvas.svelte`: the same prop and type (after `visibilityManagerOverride`), and `{motionVisibility}` after `{visibilityManagerOverride}` at both `CanvasSurface` mounts.

- [ ] **Step 5: The cell canvas**

In `ArrangementCellCanvas.svelte` replace the imports of `resolveLegacyCellFields`, `FireOverlayConfig`, `DEFAULT_CHARCOAL_PARAMS` and `LedOverlayConfig` with:

```ts
  import { migrateArrangementCell } from "../domain/arrangement-migration.js";
  import { arrangementCellLook } from "../domain/arrangement-look.js";
  import type { PostAnimationAppearance } from "../domain/post-animation-appearance.js";
  import {
    postAnimationEffectsConfig,
    postAnimationTrailSettings,
  } from "../domain/post-animation-effects.svelte";
  import {
    AnimationVisibilityStateManager,
    getAnimationVisibilityManager,
  } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import type { TipEffectMap } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
```

Add the prop `gridAppearance = undefined,` with type `/** The grid's default look, under the cell's own. */ gridAppearance?: PostAnimationAppearance;`.

Replace everything from `// The cell's look as the v1 fields…` through the `leftVisible` / `rightVisible` block and its TODO with:

```ts
  // The look this cell draws with: the grid's default under the cell's own
  // flags. The nested Arrange editor still writes the v1 fields on its working
  // copy, so they are folded in the way the migration folds them; phase 5
  // removes that editor and this fold with it.
  const look = $derived(
    arrangementCellLook(gridAppearance, migrateArrangementCell(cell))
  );
  // One effects state, visibility manager and trail look per cell, as the
  // Studio animation layer keeps per item, so a cell's effect never leaks
  // into its neighbours or the viewer's own settings.
  const inheritedEffects = getEffectsConfigContext();
  const fallbackEffects = inheritedEffects?.snapshot() ?? DEFAULT_EFFECTS_CONFIG;
  const cellEffects = createEffectsConfigState(fallbackEffects, {
    persist: false,
  });
  const cellVisibility = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  let cellTrailSettings = $state(animationSettings.snapshot().trail);
  $effect(() => {
    const current = look;
    untrack(() => {
      cellVisibility.updateSettings({
        ...getAnimationVisibilityManager().getSettings(),
        wordHeader: false,
        darkMode: true,
        ...current,
      });
      const config = postAnimationEffectsConfig(current, fallbackEffects);
      cellTrailSettings = postAnimationTrailSettings(
        animationSettings.snapshot().trail,
        config,
        current?.trail
      );
      cellEffects.replace(config);
    });
  });
  // The engine takes a cell map in place of the config's own, so the cell's
  // per-hand and per-tip picks are laid over the look's cell-wide effect.
  const cellTipEffects = $derived.by((): TipEffectMap | undefined => {
    const own = cell.tipEffectMap;
    if (!own || Object.keys(own).length === 0) return undefined;
    return { ...cellEffects.tipEffectMap, ...own };
  });
  const motionVisibility = $derived({
    left: cell.leftMotionVisible ?? true,
    right: cell.rightMotionVisible ?? true,
  });
  /** The props each layer's engine places: the look's prop, else the viewer's pair. */
  function cellPropConfig() {
    const propType = look?.propType;
    return propType
      ? { leftPropType: propType, rightPropType: propType }
      : getViewerAnimationPropConfig();
  }
```

Also delete the old `trailSettings` derived, `tipMapHasEffect`, `cellFireConfig` and `cellLedConfig`. In `initializeOrchestrators`, pass `cellPropConfig` instead of `getViewerAnimationPropConfig` to both `new SequenceAnimationOrchestrator(...)` calls and call `.setVisibilityManager(cellVisibility)` on each new orchestrator (primary and extra). In the markup replace the `AnimatorCanvas` props from `gridVisible={true}` on:

```svelte
      <AnimatorCanvas
        leftProp={primaryAnimationState.leftPropState}
        rightProp={primaryAnimationState.rightPropState}
        additionalLayers={additionalLayerProps}
        gridVisible={look?.gridMode !== "none"}
        gridMode={primaryLayer?.sequence.gridMode ?? null}
        letter={primaryStepData?.letter || null}
        stepData={primaryStepData}
        currentStep={primaryCurrentStep}
        isPlaying={animationPlaying}
        virtualTime={virtualTimeMs}
        onInitialized={() => (canvasReady = true)}
        sequenceData={primaryLayer?.sequence || null}
        word={null}
        leftPropType={look?.propType ?? null}
        rightPropType={look?.propType ?? null}
        propLook={look?.propLook}
        previewDarkMode={look?.darkMode ?? true}
        mandalaStrokeWidthOverride={look?.mandalaThickness}
        trailSettings={cellTrailSettings}
        hideTkaGlyph={true}
        hideStepNumbers={true}
        visibilityManagerOverride={cellVisibility}
        effectsConfigState={cellEffects}
        tipEffectMap={cellTipEffects}
        tipEffortMap={cell.tipEffortMap}
        {motionVisibility}
      />
```

`PostStudioArrangementLayer.svelte`: add `gridAppearance={snapshot.appearance}` to `<CellCanvas>`.

- [ ] **Step 6: Run the fold test and the arrangement/post suites**

Run: `npm run test:ci -- tests/unit/media-composition/post-animation-effects.test.ts tests/unit/media-composition tests/unit/post`
Expected: all passed.

- [ ] **Step 7: Type check the touched files**

Run: `npm run check:fast 2>&1 | grep -E "ArrangementCellCanvas|CanvasSurface|AnimatorCanvas|PostStudioSequenceAnimationLayer|PostAnimationAppearanceTool|post-animation-effects|PostStudioArrangementLayer"`
Expected: no lines (no errors in phase files).

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(arrangement): cells draw from the resolved appearance through per-cell effects state" -- src/lib/shared/share/components/post-studio/post-animation-effects.svelte.ts src/lib/shared/media-composition/domain/post-animation-effects.svelte.ts src/lib/shared/share/components/post-studio/PostStudioSequenceAnimationLayer.svelte src/lib/shared/share/components/post-studio/editor/PostAnimationAppearanceTool.svelte src/lib/shared/animation-engine/components/CanvasSurface.svelte src/lib/shared/animation-engine/components/AnimatorCanvas.svelte src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte src/lib/shared/share/components/post-studio/PostStudioArrangementLayer.svelte tests/unit/media-composition/post-animation-effects.test.ts
```

---

### Task 4: The panels

**Files:**
- Modify: `src/lib/shared/share/components/post-studio/editor/PostAnimationAppearanceTool.svelte` (`sections` prop; the nav block)
- Modify: `src/lib/shared/share/components/post-studio/editor/PostArrangementTool.svelte`
- Modify: `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte` (`panelBody`, ~line 2852)

- [ ] **Step 1: `sections` on the appearance tool**

Move `type Section = "props" | "effects" | "efforts" | "display";` above the `let { … } = $props();` and add `const ALL_SECTIONS: readonly Section[] = ["props", "effects", "efforts", "display"];`. Add the prop `sections = ALL_SECTIONS,` with type:

```ts
    /** Which sections to offer, in the rail's order. One section shows without the rail. */
    sections?: readonly Section[];
```

Replace `let activeSection = $state<Section>("display");` with:

```ts
  let pickedSection = $state<Section | null>(null);
  const activeSection = $derived(
    pickedSection && sections.includes(pickedSection)
      ? pickedSection
      : sections.includes("display")
        ? "display"
        : (sections[0] ?? "display")
  );
```

Rename the pill-spec derived `const sections = $derived([...])` to `const pills = $derived([...].filter((pill) => sections.includes(pill.id)))` (wrap the existing array literal), and the nav block becomes:

```svelte
    {#if sections.length > 1}
      <div class="section-navigation">
        <IconRailNav
          pills={pills}
          activeId={activeSection}
          onSelect={(section) => (pickedSection = section)}
          orientation="horizontal"
          compact
          panelIdPrefix={id}
          ariaLabel="Animation appearance"
        />
      </div>
    {/if}
```

- [ ] **Step 2: The arrangement tool**

Props: `tool: "grid" | "sequence" | "layers" | "offset" | "look" | "effects" | "effort" | "speed";` and `/** Fit the editor's bounded side column. */ fill?: boolean;` (destructure `fill = false`).

Imports to add:

```ts
  import PostAnimationAppearanceTool from "./PostAnimationAppearanceTool.svelte";
  import EffectSelector from "#lib/shared/animation-engine/components/effects-panel/EffectSelector.svelte";
  import { EFFECT_LABELS } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
  import { EFFORTS, type EffortId } from "#lib/shared/effort/domain/effort-types.js";
  import { getTipPoints } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
  import { getTipLabel } from "#lib/shared/animation-engine/domain/tip-label.js";
  import type {
    EffectType,
    TipEffectMap,
    TipEffortMap,
  } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    arrangementCellLook,
    arrangementLookOverride,
  } from "#lib/shared/media-composition/domain/arrangement-look.js";
  import type { PostAnimationAppearance } from "#lib/shared/media-composition/domain/post-animation-appearance.js";
  import {
    POST_MAX_SPEED,
    POST_MIN_SPEED,
    type PostArrangementItem,
  } from "#lib/shared/media-composition/domain/post-project.js";
  import type { PostEdit } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";
```

and extend the `post-project-edits.js` import with `setArrangementCellAppearance`, `setArrangementCellMotionVisibility`, `setArrangementCellTipEffects`, `setArrangementCellTipEfforts`, `setArrangementSpeed`.

Script, after the Offset section:

```ts
  // ---- Look, effects and effort --------------------------------------------

  type LookTool = "look" | "effects" | "effort";
  const LOOK_SECTIONS: Record<
    LookTool,
    readonly ("props" | "effects" | "efforts" | "display")[]
  > = {
    look: ["props", "display"],
    effects: ["effects"],
    effort: ["efforts"],
  };
  /** What the panel shows: the cell's look over the grid's, or the grid's own. */
  const look = $derived(
    cell
      ? arrangementCellLook(snapshot.appearance, cell)
      : (snapshot.appearance ?? null)
  );
  const lookKey = $derived(`${item.id}:${cell?.id ?? "grid"}`);
  const scopeName = $derived(
    cell ? `Cell ${cell.row * snapshot.gridCols + cell.col + 1}` : "Grid"
  );
  const leftShown = $derived(cell?.leftMotionVisible ?? true);
  const rightShown = $derived(cell?.rightMotionVisible ?? true);

  /** A cell keeps only the flags a change moved; the grid keeps the whole look. */
  function saveLook(
    next: PostAnimationAppearance,
    settingKey: string | undefined,
    changed: (keyof PostAnimationAppearance)[]
  ): void {
    if (locked) return;
    const target = cell;
    if (target && changed.length === 0) return;
    const cellId = target?.id ?? null;
    const appearance = target
      ? arrangementLookOverride(target.appearance, next, changed)
      : next;
    const change: PostEdit = (project, ctx) =>
      setArrangementCellAppearance(project, item.id, cellId, appearance, ctx);
    if (settingKey) editor.editSetting(`${lookKey}:look:${settingKey}`, change);
    else editor.edit(change);
  }

  function showHand(hand: "left" | "right", shown: boolean): void {
    if (!cell || locked) return;
    const id = cell.id;
    const visible = hand === "left" ? { left: shown } : { right: shown };
    editor.edit((project, ctx) =>
      setArrangementCellMotionVisibility(project, item.id, id, visible, ctx)
    );
  }

  type Scope = "cell" | "left" | "right" | "tips";
  const SCOPES: { id: Scope; label: string }[] = [
    { id: "cell", label: "Cell" },
    { id: "left", label: "Left" },
    { id: "right", label: "Right" },
    { id: "tips", label: "Tips" },
  ];
  let scope = $state<Scope>("cell");
  let tipKey = $state("0-0");
  $effect(() => {
    void cell?.id;
    untrack(() => {
      scope = "cell";
      tipKey = "0-0";
    });
  });
  /** The map key the scope edits: a hand, a tip, or none for the cell itself. */
  const scopeKey = $derived(
    scope === "left"
      ? "0"
      : scope === "right"
        ? "1"
        : scope === "tips"
          ? tipKey
          : null
  );
  const scopePropType = $derived(look?.propType ?? PropType.STAFF);
  const tipTargets = $derived.by(() => {
    const count = getTipPoints(scopePropType).points.length;
    const targets: { key: string; label: string }[] = [];
    for (const hand of [0, 1] as const)
      for (let tip = 0; tip < count; tip++)
        targets.push({
          key: `${hand}-${tip}`,
          label: `${hand === 0 ? "Left" : "Right"} ${getTipLabel(scopePropType, tip)}`,
        });
    return targets;
  });
  const scopeEffect = $derived(
    scopeKey ? (cell?.tipEffectMap?.[scopeKey]?.effect ?? null) : null
  );
  const scopeEffort = $derived(
    scopeKey ? (cell?.tipEffortMap?.[scopeKey]?.effort ?? null) : null
  );
  const scopeEffectHint = $derived(
    scopeEffect === null
      ? "Follows the cell's effect."
      : scopeEffect === "none"
        ? "No effect here."
        : `${EFFECT_LABELS[scopeEffect] ?? scopeEffect} here. Pick it again to turn it off.`
  );

  /** Sets one scope's effect, turns it off (the active pick again) or clears it to follow the cell. */
  function pickScopeEffect(effect: string | null): void {
    if (!cell || locked || !scopeKey) return;
    const id = cell.id;
    const key = scopeKey;
    const next: TipEffectMap = { ...cell.tipEffectMap };
    if (effect === null) delete next[key];
    else
      next[key] = {
        effect: (scopeEffect === effect ? "none" : effect) as EffectType,
      };
    editor.edit((project, ctx) =>
      setArrangementCellTipEffects(project, item.id, id, next, ctx)
    );
  }

  function pickScopeEffort(effort: EffortId | null): void {
    if (!cell || locked || !scopeKey) return;
    const id = cell.id;
    const key = scopeKey;
    const next: TipEffortMap = { ...cell.tipEffortMap };
    if (effort === null) delete next[key];
    else next[key] = { effort };
    editor.edit((project, ctx) =>
      setArrangementCellTipEfforts(project, item.id, id, next, ctx)
    );
  }

  // ---- Speed ---------------------------------------------------------------

  function setItemSpeedStop(stop: number): void {
    if (locked) return;
    const speed = Number((2 ** stop).toFixed(3));
    editor.editSetting(`arrangement-speed:${item.id}`, (project, ctx) =>
      setArrangementSpeed(project, item.id, speed, ctx)
    );
  }
```

(`untrack` from `svelte`.) Markup, after the `offset` branch and before its `{/if}`:

```svelte
  {:else if tool === "speed"}
    <ValueSlider
      label="Speed"
      value={Math.log2(item.speed)}
      min={Math.log2(POST_MIN_SPEED)}
      max={Math.log2(POST_MAX_SPEED)}
      step={SPEED_STEP}
      origin={0}
      marks={SPEED_MARKS}
      onmark={setItemSpeedStop}
      markLabel={speedLabel}
      format={speedLabel}
      fromTyped={Math.log2}
      disabled={locked}
      onchange={setItemSpeedStop}
    />
    <p class="hint">
      Speed plays the whole grid faster or slower. Each cell keeps its own
      speed inside it.
    </p>
  {:else if tool === "look" || tool === "effects" || tool === "effort"}
    {#if tool === "look" && cell}
      <div class="group" role="group" aria-label="Hands shown">
        <span class="group-name">Hands</span>
        <div class="chips">
          <FilterChipBase
            mode="toggle"
            emphasis="solid"
            label="Left"
            ariaLabel="Show the left hand"
            active={leftShown}
            disabled={locked}
            onclick={() => showHand("left", !leftShown)}
          />
          <FilterChipBase
            mode="toggle"
            emphasis="solid"
            label="Right"
            ariaLabel="Show the right hand"
            active={rightShown}
            disabled={locked}
            onclick={() => showHand("right", !rightShown)}
          />
        </div>
      </div>
    {/if}
    {#if tool !== "look" && cell}
      <div class="group" role="group" aria-label="Applies to">
        <span class="group-name">Applies to</span>
        <div class="chips">
          {#each SCOPES as entry (entry.id)}
            <FilterChipBase
              mode="toggle"
              emphasis="solid"
              label={entry.label}
              active={scope === entry.id}
              disabled={locked}
              onclick={() => (scope = entry.id)}
            />
          {/each}
        </div>
        {#if scope === "tips"}
          <div class="chips">
            {#each tipTargets as target (target.key)}
              <FilterChipBase
                mode="toggle"
                emphasis="solid"
                label={target.label}
                active={tipKey === target.key}
                disabled={locked}
                onclick={() => (tipKey = target.key)}
              />
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    {#if tool === "look" || scopeKey === null}
      {#key `${tool}:${lookKey}`}
        <PostAnimationAppearanceTool
          {editor}
          appearanceOverride={look}
          onAppearanceChange={saveLook}
          appearanceKey={lookKey}
          scopeLabel={scopeName}
          {locked}
          {fill}
          sections={LOOK_SECTIONS[tool]}
        />
      {/key}
    {:else if tool === "effects"}
      <p class="hint">{scopeEffectHint}</p>
      <div class="chips">
        <FilterChipBase
          mode="toggle"
          emphasis="solid"
          label="Follow the cell"
          active={scopeEffect === null}
          disabled={locked}
          onclick={() => pickScopeEffect(null)}
        />
      </div>
      <EffectSelector
        activeEffect={scopeEffect ?? "none"}
        onSelect={pickScopeEffect}
        disabled={locked}
      />
    {:else}
      <p class="hint">
        {scopeEffort === null
          ? "Follows the cell's effort."
          : `${EFFORTS.find((effort) => effort.id === scopeEffort)?.label ?? scopeEffort} here.`}
      </p>
      <div class="chips">
        <FilterChipBase
          mode="toggle"
          emphasis="solid"
          label="Follow the cell"
          active={scopeEffort === null}
          disabled={locked}
          onclick={() => pickScopeEffort(null)}
        />
        {#each EFFORTS as effort (effort.id)}
          <FilterChipBase
            mode="toggle"
            emphasis="solid"
            label={effort.label}
            active={scopeEffort === effort.id}
            disabled={locked}
            onclick={() => pickScopeEffort(effort.id)}
          />
        {/each}
      </div>
    {/if}
  {/if}
```

- [ ] **Step 3: Route the tools in the workspace**

```svelte
  {:else if (tool === "grid" || tool === "speed" || tool === "look" || tool === "effects" || tool === "effort" || tool === "layers" || tool === "offset" || (tool === "sequence" && editor.selectedCell !== null)) && editor.selectedItem?.kind === "arrangement"}
    <PostArrangementTool
      {editor}
      item={editor.selectedItem}
      {tool}
      cell={editor.selectedCell}
      locked={!editor.selectionEditable}
      sequence={displaySequence}
      fill={placement === "side"}
    />
```

- [ ] **Step 4: Type check the touched files**

Run: `npm run check:fast 2>&1 | grep -E "PostArrangementTool|PostAnimationAppearanceTool|PostEditorWorkspace|PostToolRow|PostToolPanel|post-editor-labels|post-editor-tools"`
Expected: no lines.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(studio): Look, Effects, Effort and Speed panels for arrangements and cells" -- src/lib/shared/share/components/post-studio/editor/PostAnimationAppearanceTool.svelte src/lib/shared/share/components/post-studio/editor/PostArrangementTool.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte
```

---

### Task 5: Fixture, gates, integration, browser pass

**Files:**
- Modify: `src/routes/test/studio-arrangement/fixture.ts`
- Plan file (this document) committed

- [ ] **Step 1: One cell starts with a fire look**

In `fixture.ts` import `DEFAULT_EFFECTS_CONFIG` from `#lib/shared/effects/domain/defaults.js` and give the cell at row 1, col 1 an appearance in the cell literal:

```ts
      ...(row === 1 && col === 1
        ? {
            appearance: {
              effects: {
                ...structuredClone(DEFAULT_EFFECTS_CONFIG),
                activeEffect: "fire" as const,
                tipEffectMap: { "*": { effect: "fire" as const } },
              },
            },
          }
        : {}),
```

Run the fixture's own tests: `npm run test:ci -- tests/unit/media-composition/studio-arrangement-draft-isolation.test.ts tests/unit/post`.

- [ ] **Step 2: Focused gates**

- `npm run test:ci -- tests/unit/media-composition tests/unit/post` → all passed.
- `npm run check:fast` → error count at or below the main baseline (642), none in phase files.

- [ ] **Step 3: Commit the fixture and the plan, bring the branch current with main**

```bash
git commit -m "test(studio): arrangement fixture cell with a fire look; phase 4 plan" -- src/routes/test/studio-arrangement/fixture.ts docs/superpowers/plans/active/2026-10-11-arrangements-in-studio-phase-4.md
git merge main
```

- [ ] **Step 4: Integrate**

From `E:/tka-platform` (PowerShell):

```powershell
npm run wt:finish -- codex/arrangements-studio-p4 --route /test/studio-arrangement
```

- [ ] **Step 5: Browser pass on the primary server**

On `https://localhost:5173/test/studio-arrangement` in the in-app browser (the resource gate forbids another server):

1. Load: cell 4 shows fire; the other three do not. Export once; the probe's `exportedBlob` is a non-empty file.
2. Select the arrangement: the row reads Back, Grid, Edit arrangement, Split, Speed, Look, Effects, Timing, …; the Look panel is titled "Look" with scope "Grid". Display: turn the grid off; every cell loses its grid. Undo restores it.
3. Select cell 1: Look → Props: pick a different prop; only cell 1 changes. Hands: turn Left off; cell 1 draws one hand. Undo twice.
4. Cell 1 → Effects: scope Cell, pick LED; cell 1 shows LED. Scope Left, pick Fire; left hand fire, right hand LED. "Follow the cell" clears it. Scope Tips lists the prop's tips.
5. Cell 1 → Effort: scope Right, pick Bounce; the right hand's `tipEffortMap["1"]` is `bounce` in `savedProject`.
6. Arrangement → Speed: 2×; the clip halves on the timeline; undo.
7. Viewports 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, 3840×2160: no horizontal overflow on the Effects panel with scope Left; the dock scrolls. 960×540 stands in for 200 % zoom at 1920×1080. `prefers-reduced-motion` via the browser's colour-scheme/emulation where available, else noted.

- [ ] **Step 6: Memory and report**

Update `project_compose_into_studio.md` with a "Phase 4 DONE" section and the `MEMORY.md` line; report with a plain opener and the clickable fixture URL.

---

## Self-review

- Spec coverage: tool rows (Task 1); Look/Effects/Effort panels on grid and cell appearance with hand switches and the scope row (Task 4); `ArrangementCellCanvas` through `createEffectsConfigState` and `postAnimationTrailSettings` (Task 3); Speed on the item (Tasks 2 and 4); transition via `availablePanels` (Task 1); `toolRow` / `availablePanels` tests (Task 1); export frames show the cell effect (Task 5, fixture fire cell + export); visual verification viewports (Task 5).
- Not in this phase: timing, position, fade, split, rename, duplicate, delete already behave for arrangements as for animations (phase 2 rows); the nested editor and its working-copy fields go in phase 5.
- Names used across tasks: `arrangementCellLook`, `arrangementLookOverride`, `postAnimationEffectsConfig`, `setCellTipEffects` / `setArrangementCellTipEffects`, `setCellTipEfforts` / `setArrangementCellTipEfforts`, `setCellMotionVisibility` / `setArrangementCellMotionVisibility`, `setArrangementSpeed`, `motionVisibility`, `gridAppearance`, `sections`.
