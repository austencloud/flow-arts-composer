<script lang="ts">
  /**
   * Gamma - γ→γ Quarter-Opp / Quarter-Same - body page 5, a faithful rebuild of
   * the proof PDF (level-1-v05.pdf, page 11) in the CURRENT renderer's language.
   * Nothing on the pictographs is hand-drawn - every adornment is the system's:
   *
   *   - Hand motion   → real FLOAT motions (author as PRO shift; because both
   *                     props are HAND, PictographPreparer's hand-path mode makes
   *                     them floats and the arrow pipeline draws the system arrow).
   *   - Count numbers → StepData.stepNumber (0 → "Start", 1..n numerals) via the
   *                     renderer's top-left StepNumber overlay.
   *   - Positions     → startPlacement/endPlacement (getGridPlacementFromLocations)
   *                     → the top-centre γ→γ PlacementGlyph.
   *   - Mode          → bottom-right ElementalGlyph, derived GEOMETRICALLY by the
   *                     TnD deriver (deriveTnD is letter-free and classifies both
   *                     gamma halves + the quarter modes), so no letter is needed.
   *
   * Positions + elementals derive geometrically, so letters are null on most
   * boxes. The exception is the QO strip's two "antiparallel" cells, where blue
   * and red float along the SAME edge (W→N vs N→W, E→S vs S→E): their arrows
   * collide, and the pipeline separates them only via the letter-gated special-
   * placement tier - so those two carry letter "P" (both-PRO Quarter-Opp), the
   * gamma analogue of the α/β Tog rows' G/H. Every other box stays null.
   *
   * Geometry comes from the proof's own image placements + text runs (extracted
   * from the PDF operator list). Proof strips (pt, top-left origin) were
   *   QO   L90.6 T124   500×100  (Start + 4)
   *   QS   L90   T279.2 500×100  (Start + 4)
   *   swap L56.2 T512.9 500×200  (5×2 grid - Start,1..4 / _,5..8; box 5 under 1)
   * Text y = baseline − fs (the proof's convention); the row-label glyph line
   * (γ→γ, dropped by the glyph-font extraction) sits 21.7pt above the mode name.
   * The proof page carried NO title; our facelift adds the 48pt calligraphic
   * page title (occupies ~22–70pt). Every y below is the proof value mapped
   * through fitY(y) = 72 + (y − 30.8)·0.92117 - a gentle ~8% squeeze of the
   * content range [30.8, 745.1] → [72, 730] so the header clears the title and
   * the footer still lands on the page. Values are baked (not applied live) so
   * edit-mode drag stays 1:1.
   *
   * Sequences decoded from the artboard and cross-checked with MCP VTG data:
   *   QO = opposite-spin, 90°-apart loop; its four counts are Parallel /
   *        Antiparallel / Parallel / Antiparallel (the column headers).
   *   QS = same-spin, 90°-out-of-phase loop (red leads blue by one point).
   *   swap = alternates QO/QS each count and closes back to Start.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import PlacementGlyph from "$lib/shared/pictograph/shared/components/PlacementGlyph.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    GridMode,
    GridLocation,
    GridPlacement,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import {
    guideEdit,
    ptDrag,
    pt,
    editText,
    registerEditSource,
  } from "../_data/guide-edit.svelte";
  import { bakeReversals } from "../_data/guide-sequence-adapter";
  import { getGuideSequenceClick } from "../_data/guide-data-context";
  import { getGuideActiveStep } from "../_data/guide-active-step.svelte";
  import { overrideStepsFor } from "../_data/guide-overrides.svelte";

  const S = 816 / 612; // pt → px (4/3)
  const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;

  // Golden step ring: which strip cell the companion is currently animating
  // (null outside the reader - /print + /book render no ring).
  const activeStep = getGuideActiveStep();
  const selection = getSequenceSelection();

  // A hand that moves → PRO shift (hand-path mode converts to FLOAT); a hand that
  // stays → STATIC (no arrow). Positions/elemental/numbers all derive downstream.
  const motion = (color: HandSide, from: GridLocation, to: GridLocation) =>
    createMotionData({
      motionType: from === to ? MotionType.STATIC : MotionType.PRO,
      startLocation: from,
      endLocation: to,
      color,
      propType: PropType.HAND,
      gridMode: GridMode.DIAMOND,
    });

  // [leftFrom, leftTo, rightFrom, rightTo]; Start boxes hold (from === to).
  type Move = [GridLocation, GridLocation, GridLocation, GridLocation];
  const box = (m: Move, step: number, letter: Letter | null = null): StepData =>
    ({
      id: `gamma-${step}-${m.join("-")}`,
      letter,
      gridMode: GridMode.DIAMOND,
      startPlacement: getGridPlacementFromLocations(m[0], m[2]),
      endPlacement: getGridPlacementFromLocations(m[1], m[3]),
      motions: {
        left: motion(HandSide.LEFT, m[0], m[1]),
        right: motion(HandSide.RIGHT, m[2], m[3]),
      },
      stepNumber: step,
      duration: 1,
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
    }) as unknown as StepData;

  // ── Strip geometry from the proof's image placements (pt) ──────────────────
  const BOX = 100;
  // letter is null on every box EXCEPT the QO same-edge "antiparallel" cells:
  // there blue and red float along the SAME edge (e.g. W→N vs N→W), so their
  // arrows collide. The arrow pipeline separates them only through the special-
  // placement tier, which is letter-gated - letter "P" (both-PRO Quarter-Opp,
  // canonical DiamondPictographDataframe rows 187/188) unlocks P_placements.json's
  // "(fl, fl)" red offset [70,-75] with blue falling to default [30,-30]. No other
  // strip has a same-edge box (QS's one-point lead keeps hands off a shared edge).
  type Cell = { m: Move; step: number; letter?: Letter | null } | null;
  type Strip = { x: number; y: number; rows: Cell[][] };
  const c = (m: Move, step: number, letter: Letter | null = null): Cell => ({
    m,
    step,
    letter,
  });

  const STRIPS: Strip[] = [
    // γ→γ Quarter-Opp - opposite spin, hands 90° apart the whole loop.
    {
      x: 90.6,
      y: 157.9,
      rows: [
        [
          c([SO_, SO_, E, E], 0), // Start: blue S, red E
          c([SO_, W, E, N], 1), //  Parallel
          c([W, N, N, W], 2, Letter.P), //    Antiparallel - same W↔N edge; P separates
          c([N, E, W, SO_], 3), //  Parallel
          c([E, SO_, SO_, E], 4, Letter.P), // Antiparallel - same E↔S edge; P separates
        ],
      ],
    },
    // γ→γ Quarter-Same - same spin, red leads blue by one point.
    {
      x: 90,
      y: 300.8,
      rows: [
        [
          c([SO_, SO_, E, E], 0), // Start
          c([SO_, E, E, N], 1),
          c([E, N, N, W], 2),
          c([N, W, W, SO_], 3),
          c([W, SO_, SO_, E], 4),
        ],
      ],
    },
    // Switching sequence - alternates QO/QS each count; closes back to Start.
    // 5×2 grid: Start,1,2,3,4 on top; _,5,6,7,8 on the bottom (box 5 under box 1).
    {
      x: 56.2,
      y: 516.1,
      rows: [
        [
          c([SO_, SO_, E, E], 0), // Start
          c([SO_, W, E, N], 1), //  QO
          c([W, SO_, N, W], 2), //  QS
          c([SO_, E, W, N], 3), //  QO
          c([E, N, N, W], 4), //    QS
        ],
        [
          null,
          c([N, E, W, SO_], 5), // QO
          c([E, N, SO_, E], 6), // QS
          c([N, W, E, SO_], 7), // QO
          c([W, SO_, SO_, E], 8), // QS
        ],
      ],
    },
  ];

  // ── Text: grouped centred blocks (one draggable box per paragraph) ─────────
  // x = horizontal offset from centred (0 = centred). y = css top = baseline − fs.
  type Para = { x: number; y: number; fs: number; lh: number; html: string };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 72,
      fs: 15,
      lh: 18,
      html:
        "Gamma, aka quarter-time, is based on two often forgotten modes:<br>" +
        "<strong>Quarter-Opp</strong> and <strong>Quarter-Same</strong>.<br>" +
        "Quarter-Opp has variations of parallel and antiparallel.",
    },
    {
      x: 0,
      y: 267.4,
      fs: 15,
      lh: 18,
      html: "In Quarter-Same, this doesn’t happen:",
    },
    {
      x: 0,
      y: 419.8,
      fs: 16,
      lh: 19.2,
      html:
        "When in gamma, you can move to any other variation of gamma.<br>" +
        "These examples are continuous, but non-continuous sequence are also possible.",
    },
    {
      x: 0,
      y: 472.9,
      fs: 16,
      lh: 19.2,
      html: "Here’s one that switches between Quarter-Opp and Quarter-Same:",
    },
    {
      x: 0,
      y: 730,
      fs: 16,
      lh: 19.2,
      html:
        '<strong>Practice using <span class="cy">Dual</span><span class="pu">-Shifts</span> ' +
        "to create other non-continuous γ→γ variations!</strong>",
    },
  ]);

  // Left row labels (γ→γ glyph over the italic mode name) + QO column headers,
  // at the proof's own coordinates (glyph line 21.7pt above the mode name).
  // `pos` renders the real TKA start→end PlacementGlyph instead of Greek text.
  type Label = {
    x: number;
    y: number;
    w: number;
    fs: number;
    t: string;
    i?: boolean;
    pos?: { start: GridPlacement; end: GridPlacement };
  };
  let LABELS: Label[] = $state([
    {
      x: 8,
      y: 183.3,
      w: 72,
      fs: 18,
      t: "γ→γ",
      pos: { start: GridPlacement.GAMMA1, end: GridPlacement.GAMMA1 },
    },
    { x: 8, y: 203.3, w: 72, fs: 13, i: true, t: "Quarter-Opp" },
    {
      x: 8,
      y: 325.6,
      w: 72,
      fs: 18,
      t: "γ→γ",
      pos: { start: GridPlacement.GAMMA1, end: GridPlacement.GAMMA1 },
    },
    { x: 8, y: 345.6, w: 72, fs: 13, i: true, t: "Quarter-Same" },
    { x: 190.6, y: 139.5, w: 100, fs: 14, i: true, t: "Parallel" },
    { x: 290.6, y: 139.5, w: 100, fs: 14, i: true, t: "Antiparallel" },
    { x: 390.6, y: 139.5, w: 100, fs: 14, i: true, t: "Parallel" },
    { x: 490.6, y: 139.5, w: 100, fs: 14, i: true, t: "Antiparallel" },
  ]);

  // Reader companion handoff: present ONLY inside GuideReader (null on /print,
  // /book), so the printable pages stay pristine and gain no click affordance.
  const emitSequence = getGuideSequenceClick();
  const SEQ_WORDS = [
    "γ→γ Quarter-Opp",
    "γ→γ Quarter-Same",
    "Quarter-Opp / Same switch",
  ];
  const stripSteps = (strip: Strip): StepData[] =>
    strip.rows
      .flat()
      .filter(
        (cell): cell is { m: Move; step: number; letter?: Letter | null } =>
          cell !== null
      )
      .map((cell) => box(cell.m, cell.step, cell.letter ?? null));

  // Override-resolving rows: an admin override (guide-overrides.svelte) replaces
  // the WHOLE strip when present; reversal dots stay derived either way
  // (bakeReversals, never hand-authored). Re-laid into the strip's own null-
  // preserving row/col shape so the template's existing iteration is untouched.
  // Reactive so a save/revert/reset while the reader is open re-renders these
  // cells without a refresh.
  const resolvedRows = (strip: Strip, si: number): (StepData | null)[][] => {
    const authored = stripSteps(strip);
    const override = overrideStepsFor(`gamma-${si}`);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    const baked = [start!, ...bakeReversals(steps)];
    let idx = 0;
    return strip.rows.map((row) =>
      row.map((cell) => {
        if (!cell) return null;
        const sd = baked[idx];
        idx++;
        return sd ?? null;
      })
    );
  };
  const RESOLVED: Record<number, (StepData | null)[][]> = $derived(
    Object.fromEntries(STRIPS.map((s, si) => [si, resolvedRows(s, si)]))
  );

  // Edit mode: dump paragraph + label coords for CoordsPanel's Copy button.
  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Gamma (p5)", () => {
      const P = PARAS.map(
        (p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`
      ).join("\n");
      const L = LABELS.map(
        (l) => `  ${JSON.stringify(l.t)}: x: ${r1(l.x)}, y: ${r1(l.y)}`
      ).join("\n");
      return `PARAS\n${P}\n\nLABELS\n${L}`;
    })
  );
</script>

<div class="gamma-page">
  <!-- Three strips of real pictographs. All adornments (float arrows, Start/count
       numerals, γ→γ position glyphs, elementals) are renderer-owned. -->
  {#each STRIPS as strip, si (si)}
    <div
      class="strip-wrap tka-seq-cell"
      class:is-hovered={selection?.isHovered(`gamma-${si}`)}
      class:is-selected={selection?.isSelected(`gamma-${si}`)}
      style="left:{strip.x * S}px; top:{strip.y * S}px; width:{BOX *
        5 *
        S}px; height:{strip.rows.length * BOX * S}px"
    >
      {#each strip.rows as row, ri (ri)}
        {#each row as cell, ci (ci)}
          {#if cell}
            {@const sd = RESOLVED[si]![ri]![ci]!}
            <div
              class="pbox"
              class:guide-step-active={activeStep?.key === `gamma-${si}` &&
                activeStep.ringStep === sd.stepNumber}
              style="left:{ci * BOX * S}px; top:{ri * BOX * S}px; width:{BOX *
                S}px; height:{BOX * S}px"
            >
              <PictographContainer
                pictographData={sd}
                gridMode={GridMode.DIAMOND}
                leftPropTypeOverride={PropType.HAND}
                rightPropTypeOverride={PropType.HAND}
                showGrid={true}
                showTKA={false}
                showPlacements={(sd.stepNumber ?? 0) > 0}
                showElemental={(sd.stepNumber ?? 0) > 0}
                showReversals={false}
                showTnD={false}
                showNonRadialPoints={false}
                showHandPoints={true}
                stepNumberOverride={true}
                darkMode={false}
                printMode={true}
                disableTransitions={true}
              />
            </div>
          {/if}
        {/each}
      {/each}
      <SelectionHit
        groupId={`gamma-${si}`}
        isGroupStart
        label={`Animate the ${SEQ_WORDS[si]} sequence`}
        onselect={() =>
          emitSequence?.({
            strip: RESOLVED[si]!.flat().filter(
              (sd): sd is StepData => sd !== null
            ),
            word: SEQ_WORDS[si],
            key: `gamma-${si}`,
          })}
      />
    </div>
  {/each}

  <!-- Grouped centred paragraphs (one box each, like the original PDF). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `gamma-para-${i}`}
      style="transform: translateX({p.x * S}px); top:{p.y *
        S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`gamma-para-${i}`, "paragraph", p)}
      use:editText={{
        id: `gamma-para-${i}`,
        label: "paragraph",
        get: () => p.html,
        set: (h) => (p.html = h),
      }}
    >
      {@html p.html}
    </p>
  {/each}

  <!-- Left row labels: the γ→γ lines render the real TKA PlacementGlyph; the
       italic mode names + QO column headers stay as text. -->
  {#each LABELS as l, i (i)}
    <span
      class="label"
      class:i={l.i}
      class:glyph={l.pos}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `gamma-label-${i}`}
      style="left:{l.x * S}px; top:{l.y * S}px; width:{l.w *
        S}px; font-size:{l.fs * S}px"
      use:ptDrag={pt(`gamma-label-${i}`, l.t, l)}
    >
      {#if l.pos}
        <svg
          class="pos-glyph"
          viewBox="360 50 230 75"
          role="img"
          aria-label={l.t}
          style="height:{l.fs * S}px"
        >
          <PlacementGlyph startPlacement={l.pos.start} endPlacement={l.pos.end} />
        </svg>
      {:else}{l.t}{/if}
    </span>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .gamma-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  /* Each pictograph box carries its own hairline; adjacent boxes share the edge
     (border-box → coincident 1px lines) and the empty switch cell draws none. */
  .pbox {
    position: absolute;
    border: 1px solid #c4c4cc;
    background: #fff;
    box-sizing: border-box;
    overflow: hidden;
  }

  /* Per-sequence wrapper - carries the shared selection ring (.tka-seq-cell). */
  .strip-wrap {
    position: absolute;
  }

  /* Centred paragraph blocks - full sheet width, one box per paragraph. */
  .para {
    position: absolute;
    left: 0;
    right: 0;
    margin: 0;
    text-align: center;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
  }
  /* Colour-coded terms are always bold. */
  .para :global(.cy) {
    color: #36c3ff;
    font-weight: 700;
  }
  .para :global(.pu) {
    color: #6f2da8;
    font-weight: 700;
  }

  /* Row labels (γ→γ glyph over the italic mode name) + column headers, centred
     in their own column like the proof. */
  .label {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }
  .label.i {
    font-weight: 400;
    font-style: italic;
  }
  /* γ→γ renders as the real TKA PlacementGlyph SVG, centred in the column. */
  .label.glyph {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pos-glyph {
    width: auto;
    display: block;
    overflow: visible;
  }

  .para.edit,
  .label.edit {
    outline: 1px dashed rgba(55, 48, 163, 0.4);
    cursor: move;
  }
  .para.selected,
  .label.selected {
    outline: 1.5px solid #3730a3;
    outline-offset: 1px;
  }
</style>
