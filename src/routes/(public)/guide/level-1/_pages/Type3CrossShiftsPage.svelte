<script lang="ts">
  /**
   * Type 3 - Cross-Shifts - body page 7, a faithful rebuild of the proof PDF
   * (level-1-v05.pdf, "Type 3 - Cross-Shifts") in the CURRENT renderer's language.
   * Same recipe as GammaPage/Type2ShiftsPage: proof-placed strips of real
   * PictographContainers, every adornment system-owned (float arrows, dash arrows,
   * Start/count StepNumber, per-box PlacementGlyph), grouped centred paragraphs.
   *
   * A Cross-Shift = one hand SHIFTS (90°, adjacent) and one hand DASHES (180°,
   * straight through the centre to the opposite point). So each box has ONE float
   * arrow (the shift) + ONE dash arrow (the dash). Authoring:
   *   - shift hand  → PRO (hand-path mode → FLOAT, arced arrow).
   *   - dash hand   → DASH (opposite cardinals; PictographPreparer keeps it a hand
   *                   dash → straight dash arrow through centre).
   *   - still hand  → STATIC (Start boxes only).
   *   - Count numbers → StepData.stepNumber (0 → "Start", 1..8) via StepNumber.
   *   - Positions     → startPlacement/endPlacement → top-centre PlacementGlyph
   *                     (α→γ / γ→α, β→γ / γ→β per box, geometric).
   *   - No elemental  → the proof shows no mode badge, so showElemental is off.
   *
   * Layout (Type-2 grid): each sequence is Start,1,2,3,4 on top / _,5,6,7,8 below.
   * Both sequences decoded from the artboard and verified to close the loop:
   *   α→γ: shifts all CW, dash/shift swaps hands each count, returns to blue S/red N.
   *   β→γ: shifts all CCW, returns to both-S (beta).
   * The breakdown row decomposes one Cross-Shift into poses: start (both S) →
   * halfway (dash hand at centre, shift hand on the SE diagonal) → end (blue N,
   * red E) → the combined pictograph with both real arrows.
   *
   * Facelift: lowercase γ (PlacementGlyph renders the canonical glyph); "Cross"
   * tinted the Type-3 green, "-Shift(s)" the shift purple, both bold.
   *
   * Geometry is EXACT: the two sequence strips are single flattened 500×200 images
   * pulled from the proof PDF operator list (x56, y320.4 / y554.9, 100pt boxes);
   * the vector breakdown row was measured off the artboard (20px/pt): 4×100pt boxes
   * at x74.6/194.2/314.6/434.6, top 127. Text at proof coords (intro shifted to
   * clear the calligraphic title). Edit mode (press E) can still nudge + Copy.
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
  const {
    NORTH: N,
    EAST: E,
    SOUTH: SO_,
    WEST: W,
    SOUTHEAST: SE,
    CENTER: C,
  } = GridLocation;

  // Golden step ring: which strip cell the companion is currently animating
  // (null outside the reader - /print + /book render no ring).
  const activeStep = getGuideActiveStep();
  const selection = getSequenceSelection();
  const OPP: Partial<Record<GridLocation, GridLocation>> = {
    [N]: SO_,
    [SO_]: N,
    [E]: W,
    [W]: E,
  };

  // Motion type from the location pair: same → STATIC, opposite cardinals → DASH,
  // otherwise (adjacent) → PRO shift (hand-path mode floats it).
  const motion = (color: HandSide, from: GridLocation, to: GridLocation) =>
    createMotionData({
      motionType:
        from === to
          ? MotionType.STATIC
          : OPP[from] === to
            ? MotionType.DASH
            : MotionType.PRO,
      startLocation: from,
      endLocation: to,
      color,
      propType: PropType.HAND,
      gridMode: GridMode.DIAMOND,
    });

  // Positions only derive for cardinal pairs; breakdown poses (centre/diagonal)
  // don't show a glyph, so a null position is fine.
  const gp = (a: GridLocation, b: GridLocation) => {
    try {
      return getGridPlacementFromLocations(a, b);
    } catch {
      return null;
    }
  };

  // [leftFrom, leftTo, rightFrom, rightTo]
  type Move = [GridLocation, GridLocation, GridLocation, GridLocation];
  const box = (m: Move, step: number | null, id: string): StepData =>
    ({
      id,
      letter: null,
      gridMode: GridMode.DIAMOND,
      startPlacement: gp(m[0], m[2]),
      endPlacement: gp(m[1], m[3]),
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
  const c = (m: Move, step: number): Cell => ({ m, step });

  // ── Breakdown: one Cross-Shift decomposed (blue dashes S→N, red shifts S→E) ──
  type BD = {
    key: string;
    label: string | null;
    m: Move;
    arrows: boolean;
    connector?: string;
  };
  const BREAKDOWN: BD[] = [
    {
      key: "start",
      label: "start",
      m: [SO_, SO_, SO_, SO_],
      arrows: false,
      connector: "→",
    },
    {
      key: "half",
      label: "halfway",
      m: [C, C, SE, SE],
      arrows: false,
      connector: "→",
    },
    {
      key: "end",
      label: "end",
      m: [N, N, E, E],
      arrows: false,
      connector: "=",
    },
    { key: "combined", label: null, m: [SO_, N, SO_, E], arrows: true },
  ];
  // Measured from the proof artboard (20px/pt): 4 × 100pt boxes, connectors in
  // the ~20pt gaps.
  const BD_Y = 127;
  const BD_BOX = 100;
  const BD_X = [74.6, 194.2, 314.6, 434.6];
  const CONN_X = [178, 298, 418]; // → → = centred in the gaps between the boxes

  // ── Sequences: Start + 8, laid out Start,1,2,3,4 / _,5,6,7,8 ──────────────────
  type Strip = { x: number; y1: number; y2: number; rows: Cell[][] };

  // Sequence 1 - alpha→gamma. Shifts all CW; dash & shift swap hands each count.
  const SEQ1: Strip = {
    x: 56,
    y1: 320.4,
    y2: 420.4,
    rows: [
      [
        c([SO_, SO_, N, N], 0), // Start: blue S, red N (alpha)
        c([SO_, N, N, E], 1), //  α→γ  blue dash S→N, red shift N→E
        c([N, E, E, W], 2), //    γ→α  blue shift N→E, red dash E→W
        c([E, W, W, N], 3), //    α→γ  blue dash E→W, red shift W→N
        c([W, N, N, SO_], 4), //  γ→α  blue shift W→N, red dash N→S
      ],
      [
        null,
        c([N, SO_, SO_, W], 5), //  α→γ  blue dash N→S, red shift S→W
        c([SO_, W, W, E], 6), //    γ→α  blue shift S→W, red dash W→E
        c([W, E, E, SO_], 7), //    α→γ  blue dash W→E, red shift E→S
        c([E, SO_, SO_, N], 8), //  γ→α  blue shift E→S, red dash S→N  (→ Start)
      ],
    ],
  };

  // Sequence 2 - beta→gamma. Shifts all CCW; returns to both-S (beta).
  const SEQ2: Strip = {
    x: 56,
    y1: 554.9,
    y2: 654.9,
    rows: [
      [
        c([SO_, SO_, SO_, SO_], 0), // Start: both S (beta)
        c([SO_, N, SO_, E], 1), //  β→γ  blue dash S→N, red shift S→E
        c([N, W, E, W], 2), //      γ→β  blue shift N→W, red dash E→W
        c([W, E, W, SO_], 3), //    β→γ  blue dash W→E, red shift W→S
        c([E, N, SO_, N], 4), //    γ→β  blue shift E→N, red dash S→N
      ],
      [
        null,
        c([N, SO_, N, W], 5), //    β→γ  blue dash N→S, red shift N→W
        c([SO_, E, W, E], 6), //    γ→β  blue shift S→E, red dash W→E
        c([E, W, E, N], 7), //      β→γ  blue dash E→W, red shift E→N
        c([W, SO_, N, SO_], 8), //  γ→β  blue shift W→S, red dash N→S  (→ Start)
      ],
    ],
  };

  // ── Grouped centred paragraphs (proof coords, pt) ─────────────────────────────
  type Para = { x: number; y: number; fs: number; lh: number; html: string };
  const CROSS = '<span class="cross">Cross</span>';
  const SHIFT = (s: string) => `<span class="shift">-${s}</span>`;
  let PARAS: Para[] = $state([
    {
      // Proof y=49.4, but the facelift's 48pt calligraphic page title occupies
      // ~22–72pt; the 3-line intro is shifted down + tightened to fit the slot
      // between the title above and the breakdown labels (116.2) below.
      x: 0,
      y: 72,
      fs: 13,
      lh: 13,
      html:
        `A ${CROSS}${SHIFT("Shift")} combines a shift and a dash.<br>` +
        "Since a dash has further to travel, it moves slightly faster.<br>" +
        `To understand ${CROSS}${SHIFT("Shifts")}, let’s break one down into parts:`,
    },
    {
      x: 0,
      y: 237.8,
      fs: 15,
      lh: 18,
      html:
        "Note the halfway point. One hand is in the center point and one is on a diagonal hand point.<br>" +
        "By pausing at this halfway point, it ensures that the dash moves at the correct speed.<br>" +
        "The following sequences demonstrate their capabilities.<br>" +
        "This one explores alpha → gamma:",
    },
    { x: 0, y: 524, fs: 15, lh: 18, html: "And this one shows beta → gamma:" },
    {
      x: 0,
      y: 764.5,
      fs: 15,
      lh: 18,
      html: `Tech nerds will notice these ${CROSS}${SHIFT("Shifts")} create <em>Zan’s Diamond</em> variations. Neat!`,
    },
  ]);

  // Breakdown pose labels (start / halfway / end), italic, at the proof coords.
  type Label = { x: number; y: number; w: number; t: string };
  let LABELS: Label[] = $state([
    { x: 108.4, y: 116.2, w: 40, t: "start" },
    { x: 217.4, y: 116.2, w: 50, t: "halfway" },
    { x: 351.6, y: 116.2, w: 30, t: "end" },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Type 3 Cross-Shifts (p7)", () => {
      const P = PARAS.map(
        (p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`
      ).join("\n");
      const L = LABELS.map(
        (l) => `  ${JSON.stringify(l.t)}: x: ${r1(l.x)}, y: ${r1(l.y)}`
      ).join("\n");
      return `PARAS\n${P}\n\nLABELS\n${L}`;
    })
  );

  // Shared pictograph data builder for every box.
  const boxData = (m: Move, step: number | null, key: string) =>
    box(m, step, `t3-${key}`);

  // Reader companion handoff: present ONLY inside GuideReader (null on /print,
  // /book), so the printable pages stay pristine and gain no click affordance.
  const emitSequence = getGuideSequenceClick();

  // Flatten a strip's rows (row-major, skipping null cells) into ordered StepData
  // - Start(0) then 1..8 - for the animation companion.
  function stripSteps(strip: Strip): StepData[] {
    return strip.rows
      .flat()
      .filter((cell): cell is { m: Move; step: number } => cell !== null)
      .map((cell) => box(cell.m, cell.step, `seq-${cell.step}`));
  }
  const SEQ_WORDS = ["α → γ", "β → γ"];
  const STRIP_LIST = [SEQ1, SEQ2];

  // Override-resolving rows: an admin override (guide-overrides.svelte) replaces
  // the WHOLE strip when present; reversal dots stay derived either way
  // (bakeReversals, never hand-authored). Re-laid into the strip's own null-
  // preserving row/col shape so the template's existing iteration is untouched.
  // Reactive so a save/revert/reset while the reader is open re-renders these
  // cells without a refresh.
  const resolvedRows = (strip: Strip, si: number): (StepData | null)[][] => {
    const authored = stripSteps(strip);
    const override = overrideStepsFor(`t3-${si}`);
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
    Object.fromEntries(STRIP_LIST.map((s, si) => [si, resolvedRows(s, si)]))
  );
</script>

<div class="type3-page">
  <!-- Breakdown: start → halfway → end = combined Cross-Shift -->
  {#each BREAKDOWN as b, i (b.key)}
    <div
      class="bdbox"
      class:combined={b.key === "combined"}
      style="left:{BD_X[i]! * S}px; top:{BD_Y * S}px; width:{BD_BOX *
        S}px; height:{BD_BOX * S}px"
      title={b.arrows
        ? describePictograph(boxData(b.m, null, b.key))
        : undefined}
    >
      <PictographContainer
        pictographData={boxData(b.m, null, b.key)}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.HAND}
        rightPropTypeOverride={PropType.HAND}
        showGrid={true}
        showTKA={false}
        showPlacements={false}
        showElemental={false}
        showReversals={false}
        showTnD={false}
        showNonRadialPoints={false}
        showHandPoints={true}
        stepNumberOverride={false}
        darkMode={false}
        printMode={true}
        disableTransitions={true}
      />
    </div>
    {#if b.connector}
      <span
        class="connector"
        style="left:{CONN_X[i]! * S}px; top:{(BD_Y + BD_BOX / 2 - 9) * S}px"
        >{b.connector}</span
      >
    {/if}
  {/each}

  <!-- Two sequences of real Cross-Shift pictographs -->
  {#each [SEQ1, SEQ2] as strip, si (si)}
    <div
      class="strip-wrap tka-seq-cell"
      class:is-hovered={selection?.isHovered(`t3-${si}`)}
      class:is-selected={selection?.isSelected(`t3-${si}`)}
      style="left:{strip.x * S}px; top:{strip.y1 * S}px; width:{5 *
        BOX *
        S}px; height:{(strip.y2 - strip.y1 + BOX) * S}px"
    >
      {#each strip.rows as row, ri (ri)}
        {#each row as cell, ci (ci)}
          {#if cell}
            {@const sd = RESOLVED[si]![ri]![ci]!}
            <div
              class="cell"
              class:guide-step-active={activeStep?.key === `t3-${si}` &&
                activeStep.ringStep === sd.stepNumber}
              style="left:{ci * BOX * S}px; top:{(ri === 0
                ? 0
                : strip.y2 - strip.y1) * S}px; width:{BOX * S}px; height:{BOX *
                S}px"
              title={describePictograph(sd)}
            >
              <PictographContainer
                pictographData={sd}
                gridMode={GridMode.DIAMOND}
                leftPropTypeOverride={PropType.HAND}
                rightPropTypeOverride={PropType.HAND}
                showGrid={true}
                showTKA={false}
                showPlacements={(sd.stepNumber ?? 0) > 0}
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
        groupId={`t3-${si}`}
        isGroupStart
        label={`Animate the ${SEQ_WORDS[si]} sequence`}
        onselect={() =>
          emitSequence?.({
            strip: RESOLVED[si]!.flat().filter(
              (sd): sd is StepData => sd !== null
            ),
            word: SEQ_WORDS[si],
            key: `t3-${si}`,
          })}
      />
    </div>
  {/each}

  <!-- Breakdown pose labels -->
  {#each LABELS as l, i (i)}
    <span
      class="label"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `t3-label-${i}`}
      style="left:{l.x * S}px; top:{l.y * S}px; width:{l.w *
        S}px; font-size:{16 * S}px"
      use:ptDrag={pt(`t3-label-${i}`, l.t, l)}>{l.t}</span
    >
  {/each}

  <!-- Grouped centred paragraphs -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `t3-para-${i}`}
      style="transform: translateX({p.x * S}px); top:{p.y *
        S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`t3-para-${i}`, "paragraph", p)}
      use:editText={{
        id: `t3-para-${i}`,
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
  .type3-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  /* Pictograph boxes (breakdown + sequences) - hairline square like the proof. */
  .bdbox,
  .cell {
    position: absolute;
    border: 1px solid #c4c4cc;
    background: #fff;
    box-sizing: border-box;
    overflow: hidden;
  }

  .connector {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-size: 20px;
    font-weight: 700;
    color: #141414;
    line-height: 1;
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
  /* Colour code: Cross = Type-3 green, -Shift = shift purple; always bold. */
  .para :global(.cross) {
    color: #2f9e44;
    font-weight: 700;
  }
  .para :global(.shift) {
    color: #6f2da8;
    font-weight: 700;
  }

  /* Breakdown pose labels - italic, centred in their column. */
  .label {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-style: italic;
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }

  /* Edit-mode affordances. */
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
