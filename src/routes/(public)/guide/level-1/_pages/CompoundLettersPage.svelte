<script lang="ts">
  /**
   * Compound Letters - body page (manifest `lt1-dj-ek-fl`, retitled "Compound
   * Letters"), faithful to proof p23 / "1.1 - Compound Letters" artboard (the
   * v05 proof merged the old compound-letters + compound-words pages into one).
   *
   * The β↔α letters in both handpath modes, all real staff pictographs:
   *   Tog-Opp half  - β→α from N (D E F end blue W / red E);
   *                   α→β from blue W / red E (J K L end both S).
   *   Split-Opp half - β→α from W (D E F end blue S / red N);
   *                   α→β from blue S / red N (J K L end both E).
   * Columns Iso / Anti / Hybrid (the proof's own captions): D/J dual-pro,
   * E/K dual-anti, F/L hybrid blue-anti + red-pro - MCP-confirmed
   * (`get_letter_explanation` D–L), and per the page's own rule ("All
   * pictographs can be rotated or mirrored without changing letters") the
   * artboard's rotations of the MCP base variations stay the same letters.
   *
   * Bottom: the three compound WORDS as 2-step strips with the proof's cute
   * phrases - DJ Disco Jam, EK Exploding Kitten, FL Fruity Loops - chaining
   * β(S)→α(W/E)→β(N).
   *
   * Reader: every grid cell animates Start→letter; every word strip animates
   * Start→2 letters (staffs, in orientation).
   *
   * Geometry off the artboard border scan (20px/pt): 90pt cells; grid rows
   * y 265.3/355.3; Tog half x 49.4, Split half x 333.3, heavy vertical divider
   * ~x 330; word strips y 620.8 at x 16.1/216.1/416.1. Text at PROOF_TEXT
   * coords.
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
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { pt, ptDrag, editText, guideEdit, registerEditSource } from "../_data/guide-edit.svelte";
  import { bakeReversals } from "../_data/guide-sequence-adapter";
  import { getGuideSequenceClick } from "../_data/guide-data-context";
  import { getGuideActiveStep } from "../_data/guide-active-step.svelte";
  import { overrideStepsFor } from "../_data/guide-overrides.svelte";

  const S = 816 / 612; // pt → px (4/3)
  const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
  const { IN, OUT } = Orientation;
  const CW = RotationDirection.CLOCKWISE;
  const CCW = RotationDirection.COUNTER_CLOCKWISE;

  // Reader wiring (all null on /print,/book - pages stay pristine).
  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  // Handpath direction on the compass ring (N→E→S→W = CW): pro's prop rides it,
  // anti's prop counter-rotates and flips the thumb (in↔out).
  const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
  const hpDir = (from: GridLocation, to: GridLocation) => (HP_CW.has(`${from}-${to}`) ? CW : CCW);
  type HandSpec = { from: GridLocation; to: GridLocation; anti: boolean; so?: Orientation };
  const hand = (color: HandSide, h: HandSpec) => {
    const dir = hpDir(h.from, h.to);
    const so = h.so ?? IN;
    return createMotionData({
      motionType: h.anti ? MotionType.ANTI : MotionType.PRO,
      rotationDirection: h.anti ? (dir === CW ? CCW : CW) : dir,
      startLocation: h.from,
      endLocation: h.to,
      startOrientation: so,
      endOrientation: h.anti ? (so === IN ? OUT : IN) : so,
      turns: 0,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  };
  const staticHand = (color: HandSide, loc: GridLocation) =>
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

  // ── The 12 grid cells ───────────────────────────────────────────────────────
  // [letter, blue from→to, red from→to]; anti flags from the column (Iso/Anti/
  // Hybrid = none/both/blue-only).
  type CellDef = { letter: Letter; name: string; left: HandSpec; right: HandSpec };
  const cell = (letter: Letter, name: string, bf: GridLocation, bt: GridLocation, rf: GridLocation, rt: GridLocation, leftAnti, rightAnti): CellDef => ({
    letter,
    name,
    left: { from: bf, to: bt, anti: leftAnti },
    right: { from: rf, to: rt, anti: rightAnti },
  });

  type Half = { x: number; rows: CellDef[][] };
  // Tog-Opp: β→α tog at N; α→β from the W/E alpha.
  const TOG: Half = {
    x: 49.4,
    rows: [
      [
        cell(Letter.D, "D", N, W, N, E, false, false),
        cell(Letter.E, "E", N, W, N, E, true, true),
        cell(Letter.F, "F", N, W, N, E, true, false),
      ],
      [
        cell(Letter.J, "J", W, SO_, E, SO_, false, false),
        cell(Letter.K, "K", W, SO_, E, SO_, true, true),
        cell(Letter.L, "L", W, SO_, E, SO_, true, false),
      ],
    ],
  };
  // Split-Opp: β→α tog at W splitting to S/N; α→β from the S/N alpha to E.
  const SPLIT: Half = {
    x: 333.3,
    rows: [
      [
        cell(Letter.D, "D", W, SO_, W, N, false, false),
        cell(Letter.E, "E", W, SO_, W, N, true, true),
        cell(Letter.F, "F", W, SO_, W, N, true, false),
      ],
      [
        cell(Letter.J, "J", SO_, E, N, E, false, false),
        cell(Letter.K, "K", SO_, E, N, E, true, true),
        cell(Letter.L, "L", SO_, E, N, E, true, false),
      ],
    ],
  };

  const cellStep = (c: CellDef, key: string, stepNumber: number | null): StepData =>
    ({
      id: `${key}${stepNumber === null ? "" : `-${stepNumber}`}`,
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

  const startFor = (c: CellDef): StepData =>
    ({
      id: `cl-start-${c.left.from}-${c.right.from}`,
      letter: null,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement: getGridPlacementFromLocations(c.left.from, c.right.from),
      endPlacement: getGridPlacementFromLocations(c.left.from, c.right.from),
      motions: {
        left: staticHand(HandSide.LEFT, c.left.from),
        right: staticHand(HandSide.RIGHT, c.right.from),
      },
    }) as unknown as StepData;

  const cellSteps = (c: CellDef, key: string): StepData[] => [startFor(c), cellStep({ ...c }, key, 1)];

  // ── The three compound words (β S → α W/E → β N) ────────────────────────────
  // Anti hands flip thumb each step, so step 2's start orientation continues
  // from step 1's end (in→out, then out→in).
  type WordDef = { word: string; phrase: string; x: number; steps: CellDef[] };
  const WORDS: WordDef[] = [
    {
      word: "DJ",
      phrase: "Disco Jam",
      x: 16.1,
      steps: [
        cell(Letter.D, "D", SO_, W, SO_, E, false, false),
        cell(Letter.J, "J", W, N, E, N, false, false),
      ],
    },
    {
      word: "EK",
      phrase: "Exploding Kitten",
      x: 216.1,
      steps: [
        cell(Letter.E, "E", SO_, W, SO_, E, true, true),
        { ...cell(Letter.K, "K", W, N, E, N, true, true), left: { from: W, to: N, anti: true, so: OUT }, right: { from: E, to: N, anti: true, so: OUT } },
      ],
    },
    {
      word: "FL",
      phrase: "Fruity Loops",
      x: 416.1,
      steps: [
        cell(Letter.F, "F", SO_, W, SO_, E, true, false),
        { ...cell(Letter.L, "L", W, N, E, N, true, false), left: { from: W, to: N, anti: true, so: OUT } },
      ],
    },
  ];
  const wordKey = (w: WordDef) => `cl-word-${w.word}`;
  const wordSteps = (w: WordDef): StepData[] => [
    startFor(w.steps[0]!),
    ...w.steps.map((c, i) => cellStep(c, `${wordKey(w)}-s`, i + 1)),
  ];

  // ── Override resolution (admin edits replace the WHOLE strip when present;
  // reversal dots stay derived via bakeReversals either way). Reactive so a
  // save/revert/reset while the reader is open re-renders these cells.
  const cellKey = (hi: number, c: CellDef) => `cl-${hi === 0 ? "tog" : "split"}-${c.name}`;
  const ALL_CELLS: { c: CellDef; key: string }[] = [TOG, SPLIT].flatMap((half, hi) =>
    half.rows.flatMap((row) => row.map((c) => ({ c, key: cellKey(hi, c) })))
  );
  const resolvedCellSteps = (c: CellDef, key: string): StepData[] => {
    const authored = cellSteps(c, key);
    const override = overrideStepsFor(key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const CELL_RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(ALL_CELLS.map(({ c, key }) => [key, resolvedCellSteps(c, key)]))
  );

  const resolvedWordSteps = (w: WordDef): StepData[] => {
    const authored = wordSteps(w);
    const override = overrideStepsFor(wordKey(w));
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const WORD_RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(WORDS.map((w) => [wordKey(w), resolvedWordSteps(w)]))
  );

  // ── Geometry ────────────────────────────────────────────────────────────────
  const CELL = 90;
  const GRID_ROWS_Y = [265.3, 355.3];
  const WORD_Y = 620.8;
  const DIVIDER = { x: 328, y0: 250, y1: 460 };

  // Column + half headings at proof coords.
  const HEADS = [
    { t: "Tog-Opp", x: 166.7, w: 60, y: 206.7, fs: 17 },
    { t: "Split-Opp", x: 423.2, w: 65.6, y: 206.7, fs: 17 },
  ];
  const SUBS = ["Iso", "Anti", "Hybrid"];
  const SUB_CENTERS = [94.4, 184.4, 274.4, 378.3, 468.3, 558.3];
  const SUB_Y = 241.5;

  // Margin row labels (dropped by extraction - real PlacementGlyphs).
  const MARGINS = [
    { start: GridPlacement.BETA1, end: GridPlacement.ALPHA1, t: "β→α", y: 300 },
    { start: GridPlacement.ALPHA1, end: GridPlacement.BETA1, t: "α→β", y: 390 },
  ];

  // ── Text at proof coords ────────────────────────────────────────────────────
  type Para = { x: number; y: number; fs: number; lh: number; bold?: boolean; html: string };
  let PARAS: Para[] = $state([
    { x: 0, y: 91, fs: 15.5, lh: 18.6, html: "Now let’s look at the letters that move from β→α or α→β." },
    { x: 0, y: 128.2, fs: 15.5, lh: 18.6, bold: true, html: "All pictographs can be rotated or mirrored without changing letters." },
    { x: 0, y: 165.4, fs: 15.5, lh: 18.6, html: "These can be either <em>Tog-Opp</em> or <em>Split-Opp</em> depending on which α/β you start from." },
    { x: 0, y: 488.5, fs: 15.5, lh: 18.6, html: "These compound letters can’t be self-combined like the previous letters." },
    { x: 0, y: 525.7, fs: 15.5, lh: 18.6, html: "Instead, they combine with other compound letters to form the words DJ, EK, and FL." },
    { x: 0, y: 562.9, fs: 15.5, lh: 18.6, html: "Here they are along with cute phrases to help you remember:" },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Compound Letters (lt1-dj-ek-fl)", () =>
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

<div class="compound-letters">
  <!-- Half + column headings. -->
  {#each HEADS as h (h.t)}
    <span class="head" style="left:{h.x * S}px; top:{h.y * S}px; width:{h.w * S}px; font-size:{h.fs * S}px">{h.t}</span>
  {/each}
  {#each SUB_CENTERS as cx, i (cx)}
    <span class="sub" style="left:{(cx - 30) * S}px; top:{SUB_Y * S}px; width:{60 * S}px; font-size:{13 * S}px">{SUBS[i % 3]}</span>
  {/each}

  <!-- Heavy vertical divider between the two halves. -->
  <div class="vdivider" style="left:{DIVIDER.x * S}px; top:{DIVIDER.y0 * S}px; height:{(DIVIDER.y1 - DIVIDER.y0) * S}px"></div>

  <!-- The 12 letter cells (each clickable in the reader). -->
  {#each [TOG, SPLIT] as half, hi (hi)}
    {#each half.rows as row, ri (ri)}
      {#each row as c, ci (ci)}
        {@const key = cellKey(hi, c)}
        <div
          class="mini tka-seq-cell"
          class:is-hovered={selection?.isHovered(key)}
          class:is-selected={selection?.isSelected(key)}
          class:guide-step-active={activeStep?.key === key}
          style="left:{(half.x + ci * CELL) * S}px; top:{GRID_ROWS_Y[ri]! * S}px; width:{CELL * S}px; height:{CELL * S}px"
        >
          <PictographContainer
            pictographData={CELL_RESOLVED[key]![1]}
            gridMode={GridMode.DIAMOND}
            leftPropTypeOverride={PropType.STAFF}
            rightPropTypeOverride={PropType.STAFF}
            stepNumberOverride={false}
            {...PICTO_FLAGS}
          />
          <SelectionHit
            groupId={key}
            isGroupStart
            label={`Animate letter ${c.name} (${hi === 0 ? "Tog-Opp" : "Split-Opp"})`}
            onselect={() => emitSequence?.({ strip: CELL_RESOLVED[key]!, word: `Letter ${c.name}`, key, propType: "staff" })}
          />
        </div>
      {/each}
    {/each}
  {/each}

  <!-- The three compound-word strips (Start synthesized for playback only). -->
  {#each WORDS as w (w.word)}
    {@const key = wordKey(w)}
    <div
      class="strip-wrap tka-seq-cell"
      class:is-hovered={selection?.isHovered(key)}
      class:is-selected={selection?.isSelected(key)}
      style="left:{w.x * S}px; top:{WORD_Y * S}px; width:{CELL * 2 * S}px; height:{CELL * S}px"
    >
      {#each WORD_RESOLVED[key]!.slice(1) as sd, i (i)}
        <div
          class="mini cell"
          class:guide-step-active={activeStep?.key === key && activeStep.ringStep === i + 1}
          style="left:{i * CELL * S}px; top:0; width:{CELL * S}px; height:{CELL * S}px"
        >
          <PictographContainer
            pictographData={sd}
            gridMode={GridMode.DIAMOND}
            leftPropTypeOverride={PropType.STAFF}
            rightPropTypeOverride={PropType.STAFF}
            stepNumberOverride={true}
            {...PICTO_FLAGS}
          />
        </div>
      {/each}
      <SelectionHit
        groupId={key}
        isGroupStart
        label={`Animate the word ${w.word}`}
        onselect={() => emitSequence?.({ strip: WORD_RESOLVED[key]!, word: w.word, key, propType: "staff" })}
      />
    </div>
    <p class="caption" style="left:{w.x * S}px; top:{716.2 * S}px; width:{CELL * 2 * S}px; font-size:{14 * S}px">
      <span class="tka-font">{w.word}</span> - <em>{w.phrase}</em>
    </p>
  {/each}

  <!-- Margin row labels: real TKA PlacementGlyphs. -->
  {#each MARGINS as m (m.t)}
    <span class="margin glyph" style="left:{4 * S}px; top:{m.y * S}px; width:{44 * S}px">
      <svg class="pos-glyph" viewBox="360 50 230 75" role="img" aria-label={m.t} style="height:{16 * S}px">
        <PlacementGlyph startPlacement={m.start} endPlacement={m.end} />
      </svg>
    </span>
  {/each}

  <!-- Centred paragraphs (proof coords). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:bold={p.bold}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `cl-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`cl-para-${i}`, "para", p)}
      use:editText={{ id: `cl-para-${i}`, label: "para", get: () => p.html, set: (h) => (p.html = h) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .compound-letters {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .head,
  .sub {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-style: italic;
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }
  .head {
    font-weight: 600;
  }

  .vdivider {
    position: absolute;
    width: 4px;
    background: #141414;
  }

  .strip-wrap {
    position: absolute;
  }

  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }

  .margin {
    position: absolute;
  }
  .margin.glyph {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pos-glyph {
    width: auto;
    display: block;
    overflow: visible;
  }

  .caption {
    position: absolute;
    margin: 0;
    text-align: center;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
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
  .para.bold {
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
