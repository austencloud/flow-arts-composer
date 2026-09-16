<script lang="ts">
  /**
   * Type 2 - Shifts - body page 6, a faithful rebuild of the proof PDF
   * (level-1-v05.pdf, page 12) in the CURRENT renderer's language. Same recipe
   * as GammaPage: three proof-placed strips of real PictographContainers, every
   * adornment system-owned (float arrows, Start/count StepNumber, per-box
   * position glyph), grouped centred paragraphs.
   *
   * A Type 2 motion (a "Shift") = ONE hand shifts while the OTHER stays static.
   * So every box has exactly one moving hand → one float arrow; the still hand
   * is STATIC (from === to, no arrow). One arrow per box means no same-edge
   * collision, so - unlike Gamma's antiparallel cells - NO box needs a letter;
   * default float placement is correct everywhere.
   *
   *   - Hand motion   → the moving hand is a PRO shift (hand-path mode makes it a
   *                     FLOAT); the still hand is STATIC.
   *   - Count numbers → StepData.stepNumber (0 → "Start", 1..n) via StepNumber.
   *   - Positions     → startPlacement/endPlacement → the top-centre PlacementGlyph
   *                     (β→γ, γ→α, … vary per box; all derive geometrically).
   *   - No elemental  → the proof shows no mode badge (Shifts aren't a T&D), so
   *                     showElemental is off.
   *
   * Three strips (proof image placements, pt, top-left origin, x/y used directly
   * - the proof page already carries its own "Type 2 - Shifts" title, so unlike
   * Gamma there is no fitY squeeze):
   *   single  L56 T118.2 500×100  (Start + 4)   - one hand shifts, one static
   *   same    L56 T308.8 500×200  (Start + 8)   - both handpaths same direction
   *   opp     L56 T550.9 500×200  (Start + 8)   - handpaths opposite directions
   * The 8-box strips lay out Start,1,2,3,4 on top and _,5,6,7,8 below (box 5
   * under box 1), like Gamma's switch. Sequences decoded from the artboard and
   * verified to close: single = blue static S, red floats CCW; same = every
   * shift clockwise, the anchor hand swapping at beta; opp = red always CCW /
   * blue always CW, alternating the shifting hand each count.
   *
   * Facelift convention (matches Gamma): lowercase γ where the proof used Γ; the
   * Type-2 term "Shift"/"Shifts" tinted the Type-2 letter colour (purple).
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    GridMode,
    GridLocation,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { describePictograph } from "$lib/shared/pictograph/shared/domain/utils/pictograph-description";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
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
  // stays → STATIC (no arrow). Positions/numbers derive downstream.
  const motion = (color: HandSide, from: GridLocation, to: GridLocation) =>
    createMotionData({
      motionType: from === to ? MotionType.STATIC : MotionType.PRO,
      startLocation: from,
      endLocation: to,
      color,
      propType: PropType.HAND,
      gridMode: GridMode.DIAMOND,
    });

  // [leftFrom, leftTo, rightFrom, rightTo]; Start boxes hold (from === to on both).
  type Move = [GridLocation, GridLocation, GridLocation, GridLocation];
  const box = (m: Move, step: number): StepData =>
    ({
      id: `type2-${step}-${m.join("-")}`,
      letter: null,
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

  const BOX = 100;
  type Cell = { m: Move; step: number } | null;
  type Strip = { x: number; y: number; rows: Cell[][] };
  const c = (m: Move, step: number): Cell => ({ m, step });

  const STRIPS: Strip[] = [
    // Single Shift - blue holds at S; red floats CCW one point per count.
    {
      x: 56,
      y: 118.2,
      rows: [
        [
          c([SO_, SO_, SO_, SO_], 0), // Start: both S (beta)
          c([SO_, SO_, SO_, E], 1), //  β→γ  red S→E
          c([SO_, SO_, E, N], 2), //    γ→α  red E→N
          c([SO_, SO_, N, W], 3), //    α→γ  red N→W
          c([SO_, SO_, W, SO_], 4), //  γ→β  red W→S
        ],
      ],
    },
    // Same direction - every shift clockwise; anchor hand swaps at beta.
    {
      x: 56,
      y: 308.8,
      rows: [
        [
          c([SO_, SO_, N, N], 0), // Start: blue S, red N (alpha)
          c([SO_, SO_, N, E], 1), //  α→γ  red N→E
          c([SO_, SO_, E, SO_], 2), // γ→β  red E→S
          c([SO_, W, SO_, SO_], 3), // β→γ  blue S→W
          c([W, N, SO_, SO_], 4), //  γ→α  blue W→N
        ],
        [
          null,
          c([N, E, SO_, SO_], 5), //  α→γ  blue N→E
          c([E, SO_, SO_, SO_], 6), // γ→β  blue E→S
          c([SO_, SO_, SO_, W], 7), // β→γ  red S→W
          c([SO_, SO_, W, N], 8), //  γ→α  red W→N  (→ Start)
        ],
      ],
    },
    // Opposite directions - red always CCW, blue always CW; shifting hand alternates.
    {
      x: 56,
      y: 550.9,
      rows: [
        [
          c([SO_, SO_, E, E], 0), // Start: blue S, red E (gamma)
          c([SO_, SO_, E, N], 1), //  γ→α  red E→N (CCW)
          c([SO_, W, N, N], 2), //    α→γ  blue S→W (CW)
          c([W, W, N, W], 3), //      γ→β  red N→W (CCW)
          c([W, N, W, W], 4), //      β→γ  blue W→N (CW)
        ],
        [
          null,
          c([N, N, W, SO_], 5), //    γ→α  red W→S (CCW)
          c([N, E, SO_, SO_], 6), //  α→γ  blue N→E (CW)
          c([E, E, SO_, E], 7), //    γ→β  red S→E (CCW)
          c([E, SO_, E, E], 8), //    β→γ  blue E→S (CW)  (→ Start)
        ],
      ],
    },
  ];

  // ── Text: grouped centred blocks (one draggable box per paragraph) ─────────
  // Proof coords, hand-seated so each block sits in a gutter between the strips
  // (never overlapping one). y = top-from-page; x offset 0 = centred on sheet.
  type Para = { x: number; y: number; fs: number; lh: number; html: string };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 75.5,
      fs: 16,
      lh: 19.2,
      html:
        "To move between γ and α/β, you can shift one hand and keep the other hand static.<br>" +
        'This combination is called a <strong class="pu">Shift</strong> (with a capital “S”). Here’s a simple example:',
    },
    {
      // One block (proof split it into two runs, but it reads as one thought)
      // seated in the gap above the same-direction strip so nothing overlaps it.
      x: 0,
      y: 244,
      fs: 16,
      lh: 19.2,
      html:
        "The following examples explore both same and opposite handpaths.<br>" +
        "They alternate the shifting hand.<br>" +
        "Here, they are shifting in the same direction:",
    },
    {
      // Seated in the gap between the same and opposite strips (clears both).
      x: 0,
      y: 520,
      fs: 16,
      lh: 19.2,
      html: "And here, they are shifting in opposite directions.",
    },
    {
      x: 0,
      y: 760,
      fs: 15,
      lh: 18,
      html:
        '<span class="pu">Shifts</span> seems mundane here, but they’re very useful ' +
        "later for constructing dynamic sequences.",
    },
  ]);

  // Reader companion handoff: present ONLY inside GuideReader (null on /print,
  // /book), so the printable pages stay pristine and gain no click affordance.
  const emitSequence = getGuideSequenceClick();
  const SEQ_WORDS = [
    "Single Shift",
    "Same-Direction Shifts",
    "Opposite Shifts",
  ];
  const stripSteps = (strip: Strip): StepData[] =>
    strip.rows
      .flat()
      .filter((cell): cell is { m: Move; step: number } => cell !== null)
      .map((cell) => box(cell.m, cell.step));

  // Override-resolving rows: an admin override (guide-overrides.svelte) replaces
  // the WHOLE strip when present; reversal dots stay derived either way
  // (bakeReversals, never hand-authored). Re-laid into the strip's own null-
  // preserving row/col shape so the template's existing iteration is untouched.
  // Reactive so a save/revert/reset while the reader is open re-renders these
  // cells without a refresh.
  const resolvedRows = (strip: Strip, si: number): (StepData | null)[][] => {
    const authored = stripSteps(strip);
    const override = overrideStepsFor(`t2-${si}`);
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

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Type 2 (p6)", () =>
      PARAS.map((p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`).join(
        "\n"
      )
    )
  );
</script>

<div class="type2-page">
  <!-- Three strips of real pictographs. All adornments (float arrow, Start/count
       numerals, position glyphs) are renderer-owned. -->
  {#each STRIPS as strip, si (si)}
    <div
      class="strip-wrap tka-seq-cell"
      class:is-hovered={selection?.isHovered(`t2-${si}`)}
      class:is-selected={selection?.isSelected(`t2-${si}`)}
      style="left:{strip.x * S}px; top:{strip.y * S}px; width:{BOX *
        5 *
        S}px; height:{strip.rows.length * BOX * S}px"
    >
      {#each strip.rows as row, ri (ri)}
        {#each row as cell, ci (ci)}
          {#if cell}
            {@const cellStep = RESOLVED[si]![ri]![ci]!}
            <div
              class="pbox"
              class:guide-step-active={activeStep?.key === `t2-${si}` &&
                activeStep.ringStep === cellStep.stepNumber}
              title={describePictograph(cellStep)}
              style="left:{ci * BOX * S}px; top:{ri * BOX * S}px; width:{BOX *
                S}px; height:{BOX * S}px"
            >
              <PictographContainer
                pictographData={cellStep}
                gridMode={GridMode.DIAMOND}
                leftPropTypeOverride={PropType.HAND}
                rightPropTypeOverride={PropType.HAND}
                showGrid={true}
                showTKA={false}
                showPlacements={(cellStep.stepNumber ?? 0) > 0}
                showElemental={false}
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
        groupId={`t2-${si}`}
        isGroupStart
        label={`Animate the ${SEQ_WORDS[si]} sequence`}
        onselect={() =>
          emitSequence?.({
            strip: RESOLVED[si]!.flat().filter(
              (sd): sd is StepData => sd !== null
            ),
            word: SEQ_WORDS[si],
            key: `t2-${si}`,
          })}
      />
    </div>
  {/each}

  <!-- Grouped centred paragraphs (one box each, like the original PDF). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `type2-para-${i}`}
      style="transform: translateX({p.x * S}px); top:{p.y *
        S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`type2-para-${i}`, "paragraph", p)}
      use:editText={{
        id: `type2-para-${i}`,
        label: "paragraph",
        get: () => p.html,
        set: (h) => (p.html = h),
      }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .type2-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  /* Each pictograph box carries its own hairline; adjacent boxes share the edge. */
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
  .para :global(.pu) {
    color: #6f2da8;
    font-weight: 700;
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
