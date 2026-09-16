<script lang="ts">
  /**
   * Alpha/Beta Words · Same Direction - body page (manifest `lt1-abc-ghi`),
   * faithful to the proof p22 / "1.1 - Basic Words, ABC, GHI" artboard.
   *
   * The first WORDS: six four-letter repetitions sharing one Start box per
   * block, every cell a real staff letter pictograph:
   *   α block (Start = α, blue S / red N, thumbs in):
   *     AAAA (pro), BBBB (anti), CCCC (hybrid) - the CW Split-Same loop
   *     blue s→w→n→e→s, red n→e→s→w→n (A's four MCP variations chained,
   *     alpha1→alpha3→alpha5→alpha7→alpha1).
   *   β block (Start = β, both S, thumbs in):
   *     GGGG (pro), HHHH (anti), IIII (hybrid) - the CW Tog-Same loop
   *     both hands s→w→n→e→s.
   * Pro keeps the prop with the handpath (CW, thumb in throughout); anti
   * counter-rotates (CCW, thumb alternating in/out each letter); hybrids =
   * blue anti + red pro (the Base Letters convention).
   *
   * In the reader each word row is one clickable strip → the companion plays
   * Start + 4 letters with staffs from the in orientation; the shared Start
   * box rings for whichever word in its block is playing.
   *
   * Geometry off the artboard border scan (20px/pt): 90pt cells; α block
   * Start (106.5, 194.6), word rows x 196.5 at y 194.6/284.5/374.5; heavy
   * divider y 483.3; β block Start (106.5, 504), rows y 504/593.9/683.8.
   * Rows per word (B/C/H/I own no Start box - they reuse the block's).
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
  import {
    GridMode,
    GridLocation,
    GridPlacement,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import {
    pt,
    ptDrag,
    editText,
    guideEdit,
    registerEditSource,
  } from "../_data/guide-edit.svelte";
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

  // Pro rides the CW handpath (prop CW, in→in); anti counter-rotates (prop CCW)
  // and flips the thumb every letter, so its legs alternate in→out / out→in.
  type Leg = [GridLocation, GridLocation];
  const proHand = (color: HandSide, [from, to]: Leg) =>
    createMotionData({
      motionType: MotionType.PRO,
      rotationDirection: CW,
      startLocation: from,
      endLocation: to,
      startOrientation: IN,
      endOrientation: IN,
      turns: 0,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  const antiHand = (color: HandSide, [from, to]: Leg, legIndex: number) =>
    createMotionData({
      motionType: MotionType.ANTI,
      rotationDirection: CCW,
      startLocation: from,
      endLocation: to,
      startOrientation: legIndex % 2 === 0 ? IN : OUT,
      endOrientation: legIndex % 2 === 0 ? OUT : IN,
      turns: 0,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
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

  // The CW quarter-loop both blocks ride: s→w→n→e→s.
  const CW_LOOP: Leg[] = [
    [SO_, W],
    [W, N],
    [N, E],
    [E, SO_],
  ];
  // The α block's right hand runs the same loop two legs ahead (n→e→s→w→n).
  const CW_LOOP_RED: Leg[] = [
    [N, E],
    [E, SO_],
    [SO_, W],
    [W, N],
  ];

  type WordDef = {
    key: string;
    word: string;
    letter: Letter;
    y: number;
    block: "alpha" | "beta";
    leftAnti: boolean;
    rightAnti: boolean;
  };
  const WORDS: WordDef[] = [
    {
      key: "w-aaaa",
      word: "AAAA",
      letter: Letter.A,
      y: 194.6,
      block: "alpha",
      leftAnti: false,
      rightAnti: false,
    },
    {
      key: "w-bbbb",
      word: "BBBB",
      letter: Letter.B,
      y: 284.5,
      block: "alpha",
      leftAnti: true,
      rightAnti: true,
    },
    {
      key: "w-cccc",
      word: "CCCC",
      letter: Letter.C,
      y: 374.5,
      block: "alpha",
      leftAnti: true,
      rightAnti: false,
    },
    {
      key: "w-gggg",
      word: "GGGG",
      letter: Letter.G,
      y: 504.0,
      block: "beta",
      leftAnti: false,
      rightAnti: false,
    },
    {
      key: "w-hhhh",
      word: "HHHH",
      letter: Letter.H,
      y: 593.9,
      block: "beta",
      leftAnti: true,
      rightAnti: true,
    },
    {
      key: "w-iiii",
      word: "IIII",
      letter: Letter.I,
      y: 683.8,
      block: "beta",
      leftAnti: true,
      rightAnti: false,
    },
  ];

  const legOf = (w: WordDef, hand: "left" | "right", i: number): Leg =>
    w.block === "alpha" && hand === "right" ? CW_LOOP_RED[i]! : CW_LOOP[i]!;

  const wordStep = (w: WordDef, i: number, forStrip: boolean): StepData => {
    const bl = legOf(w, "left", i);
    const rl = legOf(w, "right", i);
    return {
      id: `${w.key}-${i + 1}`,
      letter: w.letter,
      gridMode: GridMode.DIAMOND,
      startPlacement: getGridPlacementFromLocations(bl[0], rl[0]),
      endPlacement: getGridPlacementFromLocations(bl[1], rl[1]),
      stepNumber: forStrip ? i + 1 : null,
      motions: {
        left: w.leftAnti
          ? antiHand(HandSide.LEFT, bl, i)
          : proHand(HandSide.LEFT, bl),
        right: w.rightAnti
          ? antiHand(HandSide.RIGHT, rl, i)
          : proHand(HandSide.RIGHT, rl),
      },
    } as unknown as StepData;
  };

  // Block Start boxes: α = left S / right N (thumbs in); β = both S.
  const startBox = (block: "alpha" | "beta"): StepData =>
    ({
      id: `w-${block}-start`,
      letter: block === "alpha" ? Letter.ALPHA : Letter.BETA,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement:
        block === "alpha"
          ? getGridPlacementFromLocations(SO_, N)
          : getGridPlacementFromLocations(SO_, SO_),
      endPlacement:
        block === "alpha"
          ? getGridPlacementFromLocations(SO_, N)
          : getGridPlacementFromLocations(SO_, SO_),
      motions: {
        left: staticHand(HandSide.LEFT, SO_),
        right: staticHand(HandSide.RIGHT, block === "alpha" ? N : SO_),
      },
    }) as unknown as StepData;

  const authoredWordSteps = (w: WordDef): StepData[] => [
    startBox(w.block),
    ...[0, 1, 2, 3].map((i) => wordStep(w, i, true)),
  ];

  // Admin override (guide-overrides.svelte) replaces the WHOLE strip when
  // present, resolved before baking - reversal dots stay derived either way.
  // Reactive ($derived) so a save/revert/reset re-renders without a refresh.
  const resolvedWordStrip = (w: WordDef): StepData[] => {
    const authored = authoredWordSteps(w);
    const override = overrideStepsFor(w.key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(WORDS.map((w) => [w.key, resolvedWordStrip(w)]))
  );
  const wordSteps = (w: WordDef): StepData[] => RESOLVED[w.key]!;

  // ── Geometry (artboard border scan) ─────────────────────────────────────────
  const CELL = 90;
  const START_X = 106.5;
  const ROW_X = 196.5;
  const BLOCKS = [
    { id: "alpha", startY: 194.6 },
    { id: "beta", startY: 504.0 },
  ] as const;
  const DIVIDER_Y = 483.3;

  // Keys per block, for ringing the shared Start box while any of its words play.
  const BLOCK_KEYS: Record<"alpha" | "beta", string[]> = {
    alpha: ["w-aaaa", "w-bbbb", "w-cccc"],
    beta: ["w-gggg", "w-hhhh", "w-iiii"],
  };

  // ── Margin labels: real TKA PlacementGlyph over the italic mode name ─────────
  const MARGIN_CX = 64;
  const MARGINS = [
    {
      pos: GridPlacement.ALPHA1,
      t: "α→α",
      mode: "Split-Same",
      glyphY: 219,
      modeY: 240.3,
    },
    {
      pos: GridPlacement.BETA1,
      t: "β→β",
      mode: "Tog-Same",
      glyphY: 528.5,
      modeY: 549.8,
    },
  ];

  // ── Text (artboard coords - this proof page has no extracted PROOF_TEXT) ────
  const SUBTITLE_Y = 60;
  type Para = {
    x: number;
    y: number;
    fs: number;
    lh: number;
    bold?: boolean;
    html: string;
  };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 104.5,
      fs: 16,
      lh: 19.2,
      html:
        "The first words we will learn correspond to VTG’s 1:1 motions.<br>" +
        "To execute these, <strong><em>you’ll need to use body turns and/or negative space</em></strong>.",
    },
    {
      x: 0,
      y: 155.5,
      fs: 16,
      lh: 19.2,
      bold: true,
      html: "Practice each word once in both directions, then again starting with thumbs out.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Alpha/Beta Words (lt1-abc-ghi)", () =>
      PARAS.map((p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`).join(
        "\n"
      )
    )
  );
</script>

<div class="ab-words">
  <!-- Subtitle under the manifest-painted title. -->
  <div class="subtitle" style="top:{SUBTITLE_Y * S}px; font-size:{18 * S}px">
    Same Direction
  </div>

  <!-- Heavy divider between the α and β blocks. -->
  <div
    class="rule"
    style="left:{20 * S}px; top:{DIVIDER_Y * S}px; width:{572 * S}px"
  ></div>

  <!-- Shared Start boxes (ring while any word in their block plays). -->
  {#each BLOCKS as blk (blk.id)}
    <div
      class="mini"
      class:guide-step-active={activeStep?.key != null &&
        BLOCK_KEYS[blk.id].includes(activeStep.key) &&
        activeStep.ringStep === 0}
      style="left:{START_X * S}px; top:{blk.startY * S}px; width:{CELL *
        S}px; height:{CELL * S}px"
    >
      <PictographContainer
        pictographData={startBox(blk.id)}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.STAFF}
        rightPropTypeOverride={PropType.STAFF}
        showGrid={true}
        showTKA={true}
        showPlacements={false}
        showReversals={false}
        showTnD={false}
        showElemental={false}
        showNonRadialPoints={false}
        showHandPoints={true}
        stepNumberOverride={true}
        darkMode={false}
        printMode={true}
        disableTransitions={true}
      />
    </div>
  {/each}

  <!-- Six word rows - each row is one clickable strip. -->
  {#each WORDS as w (w.key)}
    <div
      class="strip-wrap tka-seq-cell"
      class:is-hovered={selection?.isHovered(w.key)}
      class:is-selected={selection?.isSelected(w.key)}
      style="left:{ROW_X * S}px; top:{w.y * S}px; width:{CELL *
        4 *
        S}px; height:{CELL * S}px"
    >
      {#each [0, 1, 2, 3] as i (i)}
        <div
          class="mini cell"
          class:guide-step-active={activeStep?.key === w.key &&
            activeStep.ringStep === i + 1}
          style="left:{i * CELL * S}px; top:0; width:{CELL *
            S}px; height:{CELL * S}px"
        >
          <PictographContainer
            pictographData={{
              ...RESOLVED[w.key]![i + 1],
              stepNumber: undefined,
            } as unknown as StepData}
            gridMode={GridMode.DIAMOND}
            leftPropTypeOverride={PropType.STAFF}
            rightPropTypeOverride={PropType.STAFF}
            showGrid={true}
            showTKA={true}
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
        </div>
      {/each}
      <SelectionHit
        groupId={w.key}
        isGroupStart
        label={`Animate the word ${w.word}`}
        onselect={() =>
          emitSequence?.({
            strip: wordSteps(w),
            word: w.word,
            key: w.key,
            propType: "staff",
          })}
      />
    </div>
  {/each}

  <!-- Margin labels: real TKA PlacementGlyph over the italic handpath mode. -->
  {#each MARGINS as m (m.t)}
    <span
      class="margin glyph"
      style="left:{(MARGIN_CX - 40) * S}px; top:{m.glyphY * S}px; width:{80 *
        S}px"
    >
      <svg
        class="pos-glyph"
        viewBox="360 50 230 75"
        role="img"
        aria-label={m.t}
        style="height:{20 * S}px"
      >
        <PlacementGlyph startPlacement={m.pos} endPlacement={m.pos} />
      </svg>
    </span>
    <span
      class="margin i"
      style="left:{(MARGIN_CX - 50) * S}px; top:{m.modeY * S}px; width:{100 *
        S}px; font-size:{16.8 * S}px">{m.mode}</span
    >
  {/each}

  <!-- Centred paragraphs. -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:bold={p.bold}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `abw-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`abw-para-${i}`, "para", p)}
      use:editText={{
        id: `abw-para-${i}`,
        label: "para",
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
  .ab-words {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  /* Italic serif subtitle centred under the calligraphic page title. */
  .subtitle {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-style: italic;
    font-weight: 600;
  }

  .rule {
    position: absolute;
    height: 2.5px;
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
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }
  .margin.i {
    font-style: italic;
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
