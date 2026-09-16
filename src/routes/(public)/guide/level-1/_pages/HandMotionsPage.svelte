<script lang="ts">
  /**
   * Hand Motions - body page 3, a faithful reproduction of the proof PDF
   * (level-1-v05.pdf, page 9). Text runs sit at the PDF's own coordinates
   * (top-left origin, 612×792pt sheet, ×4/3 to px); multi-line passages render
   * as GROUPED blocks (one box per paragraph, like the original), not
   * per-line runs.
   *
   * Every motion box is a REAL single-hand pictograph through the current
   * renderer - nothing hand-drawn on them:
   *   shift  → PRO W→N / W→S; PictographPreparer's hand-path mode converts to
   *            FLOAT so the arrow pipeline places the canonical float arrows
   *   dash   → DASH W→E; the system dash arrow
   *   static → STATIC at W; no arrow (matching the proof)
   * The left hand shows the end position (visibleHand="left").
   *
   * The flowchart is the proof's: one thick line leaves the Start box, runs
   * straight through to the dash row (same height), with a spine splitting up
   * to shift and down to static. Each branch passes UNDER its bold word
   * (underlining it) and ends in a solid arrowhead pointing at the pictograph
   * box itself.
   *
   * The six combination names are two-tone colored from LETTER_TYPE_COLORS -
   * the system's canonical letter-type color code (Type1 Dual-Shift …
   * Type6 Static) - with hairline table dividers between the six cells,
   * matching the original.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import {
    createMotionData,
    createPlaceholderMotion,
  } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
    Orientation,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    GridMode,
    GridLocation,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { LETTER_TYPE_COLORS } from "$lib/shared/pictograph/shared/domain/constants/pictograph-constants";
  import { LetterType } from "$lib/shared/foundation/domain/models/letter-type";
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

  // Reader wiring (all null on /print,/book - pages stay pristine).
  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  // ── Motion boxes: real single-hand pictographs (blue hand only) ────────────
  // Movers author as PRO/DASH; hand-path mode floats the shifts and the arrow
  // pipeline renders the canonical arrows. Static shows the resting hand only.
  const singleHand = (
    id: string,
    type: MotionType,
    from: GridLocation,
    to: GridLocation
  ) => ({
    id: `hm-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      left: createMotionData({
        motionType: type,
        startLocation: from,
        endLocation: to,
        hand: HandSide.LEFT,
        propType: PropType.HAND,
        gridMode: GridMode.DIAMOND,
      }),
    },
  });

  // 110pt squares, measured off the proof.
  const SIZE = 110;
  type DemoBox = {
    x: number;
    y: number;
    word?: string;
    data: ReturnType<typeof singleHand>;
  };
  const boxes: DemoBox[] = [
    { x: 60.6, y: 233.1, data: singleHand("start", MotionType.STATIC, W, W) },
    {
      x: 298.5,
      y: 134.9,
      word: "Shift",
      data: singleHand("shift-cw", MotionType.PRO, W, N),
    },
    {
      x: 429.8,
      y: 134.9,
      word: "Shift",
      data: singleHand("shift-ccw", MotionType.PRO, W, SO_),
    },
    {
      x: 298.5,
      y: 241.1,
      word: "Dash",
      data: singleHand("dash", MotionType.DASH, W, E),
    },
    {
      x: 298.5,
      y: 348.6,
      word: "Static",
      data: singleHand("static", MotionType.STATIC, W, W),
    },
  ];

  // ── Reader click-to-animate ─────────────────────────────────────────────────
  // A demo box plays its single blue-hand motion (the other hand is an invisible
  // placeholder - the both-hands step contract); a combination cell plays a
  // canonical two-hand example of exactly what its description says. Every strip
  // is Start + one step, so the companion opens from the resting pose.
  const demoStep = (
    key: string,
    type: MotionType,
    from: GridLocation,
    to: GridLocation,
    stepNumber: number
  ) =>
    ({
      id: `hm-anim-${key}-${stepNumber}`,
      letter: null,
      gridMode: GridMode.DIAMOND,
      stepNumber,
      motions: {
        left: createMotionData({
          motionType: type,
          startLocation: from,
          endLocation: to,
          hand: HandSide.LEFT,
          propType: PropType.HAND,
          gridMode: GridMode.DIAMOND,
        }),
        right: createPlaceholderMotion(HandSide.RIGHT, {
          location: E,
          orientation: Orientation.IN,
        }),
      },
    }) as unknown as StepData;

  const authoredDemoSteps = (
    key: string,
    type: MotionType,
    from: GridLocation,
    to: GridLocation
  ): StepData[] => [
    demoStep(key, MotionType.STATIC, from, from, 0),
    demoStep(key, type, from, to, 1),
  ];

  // Admin override (guide-overrides.svelte) replaces the WHOLE strip when
  // present, resolved before baking - reversal dots stay derived either way.
  // Reactive ($derived) so a save/revert/reset re-renders without a refresh.
  const resolvedDemoStrip = (
    key: string,
    type: MotionType,
    from: GridLocation,
    to: GridLocation
  ): StepData[] => {
    const authored = authoredDemoSteps(key, type, from, to);
    const override = overrideStepsFor(key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED_DEMOS: Record<string, StepData[]> = $derived(
    Object.fromEntries(
      boxes
        .filter((b) => !!b.word)
        .map((b) => {
          const m = b.data.motions.left!;
          return [
            b.data.id,
            resolvedDemoStrip(
              b.data.id,
              m.motionType,
              m.startLocation,
              m.endLocation
            ),
          ];
        })
    )
  );
  const demoSteps = (key: string): StepData[] => RESOLVED_DEMOS[key]!;

  // Two-hand combination examples - one per named cell, blue does the first
  // motion of the description, red the second. Locations keep the ends distinct.
  type ComboHand = { type: MotionType; from: GridLocation; to: GridLocation };
  type ComboDemo = { word: string; left: ComboHand; right: ComboHand };
  const move = (
    type: MotionType,
    from: GridLocation,
    to: GridLocation
  ): ComboHand => ({ type, from, to });
  const COMBO_DEMOS: ComboDemo[] = [
    {
      word: "Dual-Shift",
      left: move(MotionType.PRO, W, N),
      right: move(MotionType.PRO, E, SO_),
    },
    {
      word: "Shift",
      left: move(MotionType.PRO, W, N),
      right: move(MotionType.STATIC, E, E),
    },
    {
      word: "Cross-Shift",
      left: move(MotionType.PRO, W, N),
      right: move(MotionType.DASH, E, W),
    },
    {
      word: "Dash",
      left: move(MotionType.DASH, W, E),
      right: move(MotionType.STATIC, N, N),
    },
    {
      word: "Dual-Dash",
      left: move(MotionType.DASH, W, E),
      right: move(MotionType.DASH, E, W),
    },
    {
      word: "Static",
      left: move(MotionType.STATIC, W, W),
      right: move(MotionType.STATIC, E, E),
    },
  ];

  const comboHand = (color: HandSide, h: ComboHand) =>
    createMotionData({
      motionType: h.type,
      startLocation: h.from,
      endLocation: h.to,
      color,
      propType: PropType.HAND,
      gridMode: GridMode.DIAMOND,
    });

  const comboStep = (ci: number, d: ComboDemo, asStart: boolean): StepData =>
    ({
      id: `hm-combo-anim-${ci}-${asStart ? 0 : 1}`,
      letter: null,
      gridMode: GridMode.DIAMOND,
      stepNumber: asStart ? 0 : 1,
      motions: {
        left: comboHand(
          HandSide.LEFT,
          asStart ? move(MotionType.STATIC, d.left.from, d.left.from) : d.left
        ),
        right: comboHand(
          HandSide.RIGHT,
          asStart
            ? move(MotionType.STATIC, d.right.from, d.right.from)
            : d.right
        ),
      },
    }) as unknown as StepData;

  const authoredComboSteps = (ci: number, d: ComboDemo): StepData[] => [
    comboStep(ci, d, true),
    comboStep(ci, d, false),
  ];

  // Admin override (guide-overrides.svelte) replaces the WHOLE strip when
  // present, resolved before baking - reversal dots stay derived either way.
  // Reactive ($derived) so a save/revert/reset re-renders without a refresh.
  const resolvedComboStrip = (
    ci: number,
    d: ComboDemo,
    key: string
  ): StepData[] => {
    const authored = authoredComboSteps(ci, d);
    const override = overrideStepsFor(key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED_COMBOS: Record<string, StepData[]> = $derived(
    Object.fromEntries(
      COMBO_DEMOS.map((d, ci) => [
        `hm-combo-${ci}`,
        resolvedComboStrip(ci, d, `hm-combo-${ci}`),
      ])
    )
  );
  const comboSteps = (ci: number, d: ComboDemo): StepData[] =>
    RESOLVED_COMBOS[`hm-combo-${ci}`]!;

  // Invisible hit regions over the six combination cells (name + description),
  // bounded by the table's own dividers.
  const COMBO_CELLS = [0, 1, 2, 3, 4, 5].map((i) => {
    const rows = [518, 598.5, 695.5, 762];
    const row = Math.floor(i / 2);
    return {
      x: i % 2 === 0 ? 10 : 306,
      y: rows[row]!,
      w: 296,
      h: rows[row + 1]! - rows[row]!,
    };
  });

  // ── Flowchart (pt) - the proof's thick line + solid arrowheads ─────────────
  // One line leaves the Start box's right edge at its centre and runs straight
  // through to the dash pictograph (same height). A spine splits up to the
  // shift row and down to the static row. Each branch underlines its word and
  // ends in a solid arrowhead pointing at the pictograph box.
  const START_RX = 60.6 + SIZE; // Start box right edge (170.6)
  const START_CY = 233.1 + SIZE / 2; // 288.1 - also the dash branch line
  const SPINE_X = 178;
  const TIP_X = 295.5; // arrowhead tip, just left of the boxes at x 298.5
  const ROWS_Y = [172, START_CY, 401.5]; // shift / dash / static branch lines
  const LINE_W = 2.6;
  const HEAD_L = 9; // solid arrowhead length
  const HEAD_H = 7.4;

  // ── Six combination names - the system's letter-type color code ────────────
  const T1 = LETTER_TYPE_COLORS[LetterType.TYPE1]; // Dual-Shift: cyan, purple
  const T2 = LETTER_TYPE_COLORS[LetterType.TYPE2]; // Shift: purple
  const T3 = LETTER_TYPE_COLORS[LetterType.TYPE3]; // Cross-Shift: green, purple
  const T4 = LETTER_TYPE_COLORS[LetterType.TYPE4]; // Dash: green
  const T5 = LETTER_TYPE_COLORS[LetterType.TYPE5]; // Dual-Dash: blue, green
  const T6 = LETTER_TYPE_COLORS[LetterType.TYPE6]; // Static: orange

  type Combo = {
    x: number;
    y: number;
    w: number;
    fs: number;
    segs: { t: string; c: string }[];
  };
  let COMBOS: Combo[] = $state([
    {
      x: 99,
      y: 527.4,
      w: 114.2,
      fs: 25,
      segs: [
        { t: "Dual-", c: T1[0] },
        { t: "Shift", c: T1[1] },
      ],
    },
    { x: 417.8, y: 522.1, w: 52.9, fs: 25, segs: [{ t: "Shift", c: T2[0] }] },
    {
      x: 90.4,
      y: 611,
      w: 123.3,
      fs: 25,
      segs: [
        { t: "Cross-", c: T3[0] },
        { t: "Shift", c: T3[1] },
      ],
    },
    { x: 417, y: 608.5, w: 57.4, fs: 25, segs: [{ t: "Dash", c: T4[0] }] },
    {
      x: 92.8,
      y: 708.4,
      w: 119.5,
      fs: 25,
      segs: [
        { t: "Dual-", c: T5[0] },
        { t: "Dash", c: T5[1] },
      ],
    },
    { x: 415.8, y: 707.3, w: 64, fs: 25, segs: [{ t: "Static", c: T6[0] }] },
  ]);

  // Table dividers between the six cells (pt), matching the proof's hairlines:
  // a centre vertical through both columns, horizontals between the rows.
  const DIV_X = 306;
  const DIV_TOP = 518;
  const DIV_BOTTOM = 762;
  const DIV_ROWS_Y = [598.5, 695.5];
  const DIV_MARGIN_X = 10;

  // ── Text (pt) ───────────────────────────────────────────────────────────────
  // Grouped centred/left blocks (one draggable box per passage); positioned
  // single-word runs for the flowchart labels. Coordinates from the proof
  // (baseline − fs = top).
  type Para = {
    x: number; // centred blocks: horizontal offset from centred (0 = centred)
    y: number;
    fs: number;
    lh: number;
    html: string;
    left?: boolean; // left-aligned block positioned at x (flowchart captions)
    i?: boolean; // italic
  };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 59.7,
      fs: 16,
      lh: 19.2,
      html:
        "There are three fundamental hand motions in the Alphabet.<br>" +
        "The arrow shows the direction of motion.<br>" +
        "The hand shows the end position.",
    },
    {
      x: 205.3,
      y: 176.6,
      fs: 14,
      lh: 16.8,
      left: true,
      i: true,
      html: "Move to an<br>adjacent point",
    },
    {
      x: 206.9,
      y: 293.7,
      fs: 14,
      lh: 16.8,
      left: true,
      i: true,
      html: "Move to the<br>opposite point",
    },
    {
      x: 204.7,
      y: 405.4,
      fs: 14,
      lh: 16.8,
      left: true,
      i: true,
      html: "Stay at the<br>current point",
    },
    {
      x: 0,
      y: 473.7,
      fs: 16,
      lh: 19.2,
      html:
        "Using these, we can derive six combinations, named below.<br>" +
        "We’ll explore each one individually:",
    },
    // Combination descriptions (centred within their cells via x offset).
    {
      x: -151.7,
      y: 564,
      fs: 16,
      lh: 19.2,
      html: "Both hands travel to an adjacent point.",
    },
    {
      x: 136.5,
      y: 552.2,
      fs: 16,
      lh: 19.2,
      html: "One hand travels to an adjacent point<br>and the other hand remains static.",
    },
    // These two are left-aligned in the proof (both lines share the same x).
    {
      x: 11.3,
      y: 642.6,
      fs: 16,
      lh: 19.2,
      left: true,
      html: "One hand travels to an adjacent point and<br>the other travels to the opposite point.",
    },
    {
      x: 328.9,
      y: 645.3,
      fs: 16,
      lh: 19.2,
      left: true,
      html: "One hand travels to the opposite point<br>and the other hand remains static",
    },
    {
      x: -151.7,
      y: 738.2,
      fs: 16,
      lh: 19.2,
      html: "Both hands travel to the opposite point",
    },
    { x: 140.7, y: 737.9, fs: 16, lh: 19.2, html: "Both hands remain static." },
  ]);

  type Run = {
    x: number;
    y: number;
    w: number;
    fs: number;
    txt: string;
    b?: boolean;
    i?: boolean;
  };
  let RUNS: Run[] = $state([
    { x: 100, y: 213.2, w: 31.1, fs: 15, txt: "Start" },
    { x: 216.9, y: 149, w: 39.2, fs: 19, b: true, txt: "shift" },
    { x: 411.6, y: 178.2, w: 12.8, fs: 14, i: true, txt: "or" },
    { x: 212.6, y: 262.5, w: 41.6, fs: 19, b: true, txt: "dash" },
    { x: 209.2, y: 379.1, w: 47.6, fs: 19, b: true, txt: "static" },
  ]);

  // Edit mode: dump coords for CoordsPanel's Copy button.
  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Hand Motions (p3)", () => {
      const P = PARAS.map(
        (p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`
      ).join("\n");
      const R = RUNS.map(
        (r) => `  ${JSON.stringify(r.txt)}: x: ${r1(r.x)}, y: ${r1(r.y)}`
      ).join("\n");
      const C = COMBOS.map(
        (c) =>
          `  ${JSON.stringify(c.segs.map((s) => s.t).join(""))}: x: ${r1(c.x)}, y: ${r1(c.y)}`
      ).join("\n");
      return `PARAS\n${P}\n\nRUNS\n${R}\n\nCOMBOS\n${C}`;
    })
  );
</script>

<div class="hand-motions">
  <!-- Flowchart: thick trunk + spine + three branches, each underlining its
       word and ending in a solid arrowhead at the pictograph box. -->
  <svg
    class="connectors"
    viewBox="0 0 612 792"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <!-- Start box → spine (the dash branch continues straight through). -->
    <line x1={START_RX} y1={START_CY} x2={SPINE_X} y2={START_CY} />
    <!-- Spine: shift row down to static row. -->
    <line x1={SPINE_X} y1={ROWS_Y[0]} x2={SPINE_X} y2={ROWS_Y[2]} />
    {#each ROWS_Y as ry}
      <line x1={SPINE_X} y1={ry} x2={TIP_X - HEAD_L + 1} y2={ry} />
      <path
        class="head"
        d="M {TIP_X - HEAD_L} {ry - HEAD_H / 2} L {TIP_X} {ry} L {TIP_X -
          HEAD_L} {ry + HEAD_H / 2} Z"
      />
    {/each}
  </svg>

  <!-- 5 real single-hand pictographs (canonical float / dash arrows). In the
       reader the three motion demos are clickable and play the single blue-hand
       motion in the companion (the Start box is display-only). -->
  {#each boxes as box (box.data.id)}
    {@const key = box.data.id}
    <div
      class="mini"
      class:tka-seq-cell={!!box.word}
      class:is-hovered={!!box.word && selection?.isHovered(key)}
      class:is-selected={!!box.word && selection?.isSelected(key)}
      class:guide-step-active={activeStep?.key === key}
      style="left:{box.x * S}px; top:{box.y * S}px; width:{SIZE *
        S}px; height:{SIZE * S}px"
    >
      <PictographContainer
        pictographData={box.word
          ? ({
              ...RESOLVED_DEMOS[key]![1],
              stepNumber: undefined,
            } as unknown as StepData)
          : box.data}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.HAND}
        rightPropTypeOverride={PropType.HAND}
        visibleHand="left"
        showGrid={true}
        showTKA={false}
        showPlacements={false}
        showReversals={false}
        showTnD={false}
        showElemental={false}
        showNonRadialPoints={false}
        showHandPoints={true}
        darkMode={false}
        printMode={true}
        disableTransitions={true}
      />
      {#if box.word}
        <SelectionHit
          groupId={key}
          isGroupStart
          label={`Animate a ${box.word.toLowerCase()}`}
          onselect={() =>
            emitSequence?.({
              strip: demoSteps(key),
              word: box.word!,
              key,
              propType: "hand",
            })}
        />
      {/if}
    </div>
  {/each}

  <!-- Combination cells: invisible hit regions over name + description - click
       plays a canonical two-hand example of that combination. -->
  {#each COMBO_DEMOS as d, ci (d.word + ci)}
    {@const key = `hm-combo-${ci}`}
    {@const cell = COMBO_CELLS[ci]!}
    <div
      class="combo-hit tka-seq-cell"
      class:is-hovered={selection?.isHovered(key)}
      class:is-selected={selection?.isSelected(key)}
      class:guide-step-active={activeStep?.key === key}
      style="left:{cell.x * S}px; top:{cell.y * S}px; width:{cell.w *
        S}px; height:{cell.h * S}px"
    >
      <SelectionHit
        groupId={key}
        isGroupStart
        label={`Animate the ${d.word} combination`}
        onselect={() =>
          emitSequence?.({
            strip: comboSteps(ci, d),
            word: d.word,
            key,
            propType: "hand",
          })}
      />
    </div>
  {/each}

  <!-- Table dividers between the six combination cells. -->
  <svg
    class="dividers"
    viewBox="0 0 612 792"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <line x1={DIV_X} y1={DIV_TOP} x2={DIV_X} y2={DIV_BOTTOM} />
    {#each DIV_ROWS_Y as dy}
      <line x1={DIV_MARGIN_X} y1={dy} x2={612 - DIV_MARGIN_X} y2={dy} />
    {/each}
  </svg>

  <!-- Six combination names: two-tone via the canonical letter-type colors. -->
  {#each COMBOS as combo, i (i)}
    <span
      class="combo"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `hm-combo-${i}`}
      style="left:{combo.x * S}px; top:{combo.y * S}px; width:{combo.w *
        S}px; font-size:{combo.fs * S}px"
      use:ptDrag={pt(
        `hm-combo-${i}`,
        combo.segs.map((s) => s.t).join(""),
        combo
      )}
    >
      {#each combo.segs as seg}<span style="color:{seg.c}">{seg.t}</span>{/each}
    </span>
  {/each}

  <!-- Grouped text blocks. -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:left={p.left}
      class:i={p.i}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `hm-para-${i}`}
      style={p.left
        ? `left:${p.x * S}px; top:${p.y * S}px; font-size:${p.fs * S}px; line-height:${p.lh * S}px`
        : `transform: translateX(${p.x * S}px); top:${p.y * S}px; font-size:${p.fs * S}px; line-height:${p.lh * S}px`}
      use:ptDrag={pt(`hm-para-${i}`, "paragraph", p)}
      use:editText={{
        id: `hm-para-${i}`,
        label: "paragraph",
        get: () => p.html,
        set: (h) => (p.html = h),
      }}
    >
      {@html p.html}
    </p>
  {/each}

  <!-- Positioned single-word runs (flowchart labels). -->
  {#each RUNS as r, i (i)}
    <span
      class="run"
      class:b={r.b}
      class:i={r.i}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `hm-run-${i}`}
      style="left:{r.x * S}px; top:{r.y * S}px; width:{r.w *
        S}px; font-size:{r.fs * S}px"
      use:ptDrag={pt(`hm-run-${i}`, r.txt, r)}>{r.txt}</span
    >
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .hand-motions {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .run {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }
  .run.b {
    font-weight: 700;
  }
  .run.i {
    font-style: italic;
  }

  /* Grouped passages: centred blocks span the sheet; .left blocks anchor at x
     (the flowchart captions, left-aligned like the proof). */
  .para {
    position: absolute;
    left: 0;
    right: 0;
    margin: 0;
    text-align: center;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
  }
  .para.left {
    right: auto;
    text-align: left;
  }
  .para.i {
    font-style: italic;
  }

  /* Two-tone combination names - bold, canonical letter-type colors inline. */
  .combo {
    position: absolute;
    font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }

  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }

  /* Invisible hit region spanning a combination cell (name + description). */
  .combo-hit {
    position: absolute;
    border-radius: 8px;
  }

  /* Flowchart - thick ink lines + solid arrowheads, proof style. */
  .connectors {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .connectors line {
    stroke: #1c1c1f;
    stroke-width: 2.6;
  }
  .connectors .head {
    fill: #1c1c1f;
  }

  /* Combination-table hairlines. */
  .dividers {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .dividers line {
    stroke: #9a9aa4;
    stroke-width: 0.8;
  }

  .run.edit,
  .para.edit,
  .combo.edit {
    outline: 1px dashed rgba(55, 48, 163, 0.4);
    cursor: move;
  }
  .run.selected,
  .para.selected,
  .combo.selected {
    outline: 1.5px solid #3730a3;
    outline-offset: 1px;
  }
</style>
