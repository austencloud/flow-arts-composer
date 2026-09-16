<script lang="ts">
  /**
   * Type 4/5/6 letters - body page (manifest `lt456-phi-psi-lambda`), faithful
   * to proof p29 / "1.1 - Type 4,5,6" artboard. ONE physical page, THREE
   * calligraphic titled sections (selfTitled, Type456Page precedent).
   *
   * All nine cells are real staff pictographs (MCP `get_pictograph_data`:
   * Φ/Ψ/Λ = one static + one dash; the dash letters both dash):
   *   Type 4 - Dash      - Φ (β→α: blue static W, red dash w→e), Ψ (α→β: blue
   *                        static S, red dash n→s), Λ (γ→γ: blue static S,
   *                        red dash w→e).
   *   Type 5 - Dual-Dash - Φ- (α→α swap: blue w→e, red e→w), Ψ- (β→β: both
   *                        n→s), Λ- (γ→γ: blue n→s, red w→e). The letter keys
   *                        the dash-location maps that separate coinciding
   *                        arrows (PHI_DASH_PSI_DASH_MAP / LAMBDA map).
   *   Type 6 - Static    - α (blue W / red E), β (both S), γ (blue S / red E).
   * Dash flips the thumb (in→out); statics stay in.
   *
   * Reader: every cell click-animates Start→letter with staffs (Type 6 plays a
   * deliberate one-beat hold). Facelift: lowercase γ.
   *
   * Geometry off the artboard border scan (20px/pt): 80pt cells at x 185.9;
   * boxes y 96.7 / 377.5 / 626; heavy rules y 285.6 / 560.6.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import PlacementGlyph from "$lib/shared/pictograph/shared/components/PlacementGlyph.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
    Orientation,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { GridMode, GridLocation, GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import { LETTER_TYPE_COLORS } from "$lib/shared/pictograph/shared/domain/constants/pictograph-constants";
  import { LetterType } from "$lib/shared/foundation/domain/models/letter-type";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { pt, ptDrag, editText, guideEdit, registerEditSource } from "../_data/guide-edit.svelte";
  import { bakeReversals } from "../_data/guide-sequence-adapter";
  import { getGuideSequenceClick } from "../_data/guide-data-context";
  import { getGuideActiveStep } from "../_data/guide-active-step.svelte";
  import { overrideStepsFor } from "../_data/guide-overrides.svelte";

  const S = 816 / 612; // pt → px (4/3)
  const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
  const { IN, OUT } = Orientation;
  const NOROT = RotationDirection.NO_ROTATION;
  const T4_GREEN = LETTER_TYPE_COLORS[LetterType.TYPE4][0];
  const [T5_CYAN, T5_GREEN] = LETTER_TYPE_COLORS[LetterType.TYPE5];
  const T6_ORANGE = LETTER_TYPE_COLORS[LetterType.TYPE6][0];

  // Reader wiring (all null on /print,/book - pages stay pristine).
  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  const dash = (color: HandSide, from: GridLocation, to: GridLocation) =>
    createMotionData({
      motionType: MotionType.DASH,
      rotationDirection: NOROT,
      startLocation: from,
      endLocation: to,
      startOrientation: IN,
      endOrientation: OUT,
      turns: 0,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  const stat = (color: HandSide, loc: GridLocation) =>
    createMotionData({
      motionType: MotionType.STATIC,
      startLocation: loc,
      endLocation: loc,
      startOrientation: IN,
      endOrientation: IN,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });

  type Hand = { from: GridLocation; to: GridLocation; dash: boolean };
  const mv = (from: GridLocation, to: GridLocation): Hand => ({ from, to, dash: true });
  const st = (loc: GridLocation): Hand => ({ from: loc, to: loc, dash: false });
  type CellDef = { letter: Letter; name: string; left: Hand; right: Hand; label?: { start: GridPlacement; end: GridPlacement; t: string } };

  type Section = {
    key: string;
    y: number;
    titleY: number;
    titleHtml: string;
    nameY: number;
    labels: boolean;
    cells: CellDef[];
    names: string[];
  };
  const gp = (s: GridPlacement, e: GridPlacement, t: string) => ({ start: s, end: e, t });
  const SECTIONS: Section[] = [
    {
      key: "t4",
      y: 96.7,
      titleY: 12,
      titleHtml: `Type 4 - <span style="color:${T4_GREEN}">Dash</span>`,
      nameY: 181,
      labels: true,
      cells: [
        { letter: Letter.PHI, name: "Φ", left: st(W), right: mv(W, E), label: gp(GridPlacement.BETA1, GridPlacement.ALPHA1, "β→α") },
        { letter: Letter.PSI, name: "Ψ", left: st(SO_), right: mv(N, SO_), label: gp(GridPlacement.ALPHA1, GridPlacement.BETA1, "α→β") },
        { letter: Letter.LAMBDA, name: "Λ", left: st(SO_), right: mv(W, E), label: gp(GridPlacement.GAMMA1, GridPlacement.GAMMA1, "γ→γ") },
      ],
      names: ["Phi", "Psi", "Lambda"],
    },
    {
      key: "t5",
      y: 377.5,
      titleY: 305,
      titleHtml: `Type 5 - <span style="color:${T5_CYAN}">Dual</span><span style="color:${T5_GREEN}">-Dash</span>`,
      nameY: 462,
      labels: true,
      cells: [
        { letter: Letter.PHI_DASH, name: "Φ-", left: mv(W, E), right: mv(E, W), label: gp(GridPlacement.ALPHA1, GridPlacement.ALPHA1, "α→α") },
        { letter: Letter.PSI_DASH, name: "Ψ-", left: mv(N, SO_), right: mv(N, SO_), label: gp(GridPlacement.BETA1, GridPlacement.BETA1, "β→β") },
        { letter: Letter.LAMBDA_DASH, name: "Λ-", left: mv(N, SO_), right: mv(W, E), label: gp(GridPlacement.GAMMA1, GridPlacement.GAMMA1, "γ→γ") },
      ],
      names: ["Phi Dash", "Psi Dash", "Lam Dash"],
    },
    {
      key: "t6",
      y: 626,
      titleY: 578,
      titleHtml: `Type 6 - <span style="color:${T6_ORANGE}">Static</span>`,
      nameY: 710,
      labels: false,
      cells: [
        { letter: Letter.ALPHA, name: "α", left: st(W), right: st(E) },
        { letter: Letter.BETA, name: "β", left: st(SO_), right: st(SO_) },
        { letter: Letter.GAMMA, name: "γ", left: st(SO_), right: st(E) },
      ],
      names: ["Alpha", "Beta", "Gamma"],
    },
  ];

  const hand = (color: HandSide, h: Hand) => (h.dash ? dash(color, h.from, h.to) : stat(color, h.from));

  const cellStep = (c: CellDef, id: string, stepNumber: number | null): StepData =>
    ({
      id,
      letter: c.letter,
      gridMode: GridMode.DIAMOND,
      startPlacement: getGridPlacementFromLocations(c.left.from, c.right.from),
      endPlacement: getGridPlacementFromLocations(c.left.to, c.right.to),
      stepNumber,
      motions: {
        left: hand(HandSide.LEFT, c.left),
        right: hand(HandSide.RIGHT, c.right),
      },
    }) as unknown as StepData;

  const startFor = (c: CellDef, id: string): StepData =>
    ({
      id,
      letter: null,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement: getGridPlacementFromLocations(c.left.from, c.right.from),
      endPlacement: getGridPlacementFromLocations(c.left.from, c.right.from),
      motions: {
        left: stat(HandSide.LEFT, c.left.from),
        right: stat(HandSide.RIGHT, c.right.from),
      },
    }) as unknown as StepData;

  const cellSteps = (c: CellDef, key: string): StepData[] => [startFor(c, `${key}-0`), cellStep(c, `${key}-1`, 1)];

  // Override-aware resolution: an admin override (guide-overrides.svelte)
  // replaces the WHOLE strip when present; reversal dots are always DERIVED
  // via bakeReversals, never hand-authored. Reactive ($derived) so a
  // save/revert/reset while the reader is open re-renders these cells without
  // a refresh.
  const resolvedCellSteps = (c: CellDef, key: string): StepData[] => {
    const authored = cellSteps(c, key);
    const override = overrideStepsFor(key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(
      SECTIONS.flatMap((sec) =>
        sec.cells.map((c, ci) => {
          const key = `t456-${sec.key}-${ci}`;
          return [key, resolvedCellSteps(c, key)];
        })
      )
    )
  );

  // ── Geometry ────────────────────────────────────────────────────────────────
  const CELL = 80;
  const GRID_X = 185.9;
  const RULES = [285.6, 560.6];

  // ── Section body text ───────────────────────────────────────────────────────
  type Para = { x: number; y: number; fs: number; lh: number; html: string };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 213,
      fs: 15,
      lh: 18,
      html:
        `With a <strong style="color:${T4_GREEN}">Dash</strong>, one prop executes a dash and the other remains static.<br><br>` +
        "“Lambda” can be further shortened by calling it “Lam”.",
    },
    {
      x: 0,
      y: 505,
      fs: 15,
      lh: 18,
      html:
        `In a <strong style="color:${T5_CYAN}">Dual</strong><strong style="color:${T5_GREEN}">-Dash</strong>, both hands are dashing.<br>` +
        "The end position remains the same.",
    },
    {
      x: 0,
      y: 740,
      fs: 15,
      lh: 18,
      html:
        `In a <strong style="color:${T6_ORANGE}">Static</strong> motion, both hands remain still for a beat.<br>` +
        "These become more interesting when adding turns.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Type 4/5/6 letters (lt456)", () =>
      PARAS.map((p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`).join("\n")
    )
  );

  const PICTO_FLAGS = {
    showGrid: true,
    showTKA: true,
    showPlacements: false,
    showReversals: false,
    showTnD: false,
    showElemental: false,
    showNonRadialPoints: false,
    showHandPoints: true,
    darkMode: false,
    printMode: true,
    disableTransitions: true,
  } as const;
</script>

<div class="t456-letters">
  {#each SECTIONS as sec (sec.key)}
    <!-- Section title (shared calligraphic face, canonical type colors). -->
    <div class="guide-title" style="top:{sec.titleY * S}px">{@html sec.titleHtml}</div>

    <!-- Position labels above the cells. -->
    {#if sec.labels}
      {#each sec.cells as c, ci (ci)}
        {#if c.label}
          <span class="cell-label glyph" style="left:{(GRID_X + ci * CELL + CELL / 2 - 30) * S}px; top:{(sec.y - 17) * S}px; width:{60 * S}px">
            <svg class="pos-glyph" viewBox="360 50 230 75" role="img" aria-label={c.label.t} style="height:{14 * S}px">
              <PlacementGlyph startPlacement={c.label.start} endPlacement={c.label.end} />
            </svg>
          </span>
        {/if}
      {/each}
    {/if}

    <!-- The three cells (each clickable). -->
    {#each sec.cells as c, ci (ci)}
      {@const key = `t456-${sec.key}-${ci}`}
      <div
        class="mini tka-seq-cell"
        class:is-hovered={selection?.isHovered(key)}
        class:is-selected={selection?.isSelected(key)}
        class:guide-step-active={activeStep?.key === key}
        style="left:{(GRID_X + ci * CELL) * S}px; top:{sec.y * S}px; width:{CELL * S}px; height:{CELL * S}px"
      >
        <PictographContainer
          pictographData={RESOLVED[key]![1]}
          gridMode={GridMode.DIAMOND}
          leftPropTypeOverride={PropType.STAFF}
          rightPropTypeOverride={PropType.STAFF}
          {...PICTO_FLAGS}
        />
        <SelectionHit
          groupId={key}
          isGroupStart
          label={`Animate ${c.name}`}
          onselect={() => emitSequence?.({ strip: RESOLVED[key]!, word: c.name, key, propType: "staff" })}
        />
      </div>
    {/each}

    <!-- Names under the cells. -->
    {#each sec.names as nm, ni (nm)}
      <span class="name" style="left:{(GRID_X + ni * CELL + CELL / 2 - 45) * S}px; top:{sec.nameY * S}px; width:{90 * S}px; font-size:{13 * S}px">{nm}</span>
    {/each}
  {/each}

  <!-- Heavy rules between sections. -->
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"></div>
  {/each}

  <!-- Section paragraphs. -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `t456-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`t456-para-${i}`, "para", p)}
      use:editText={{ id: `t456-para-${i}`, label: "para", get: () => p.html, set: (h) => (p.html = h) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .t456-letters {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }

  .cell-label {
    position: absolute;
  }
  .cell-label.glyph {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pos-glyph {
    width: auto;
    display: block;
    overflow: visible;
  }

  .name {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-style: italic;
    text-align: center;
    line-height: 1;
    white-space: nowrap;
  }

  .rule {
    position: absolute;
    height: 2.5px;
    background: #141414;
  }

  .para {
    position: absolute;
    left: 0;
    right: 0;
    margin: 0;
    text-align: center;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    color: #141414;
  }

  .para.edit {
    outline: 1px dashed rgba(55, 48, 163, 0.4);
    cursor: move;
  }
  .para.selected {
    outline: 1.5px solid #3730a3;
    outline-offset: 1px;
  }
</style>
