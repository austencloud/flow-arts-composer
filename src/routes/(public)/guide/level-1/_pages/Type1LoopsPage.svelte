<script lang="ts">
  /**
   * Type 1 LOOPs - body page (manifest `misc-permutations`, retitled "Type 1
   * LOOPs"), faithful to proof p37 / "1.2 - Type 1 Permutations - DJII, BBLF,
   * KIEC" artboard ("Type 1 CAPs" - CAP→LOOP facelift).
   *
   * Three 8-step Type 1 LOOPs (Start + 2 rows of 4, real staff pictographs):
   *   DJII - from β (both S): D and J are self-mirrored tog-opp shapes, so
   *   steps 5-6 repeat 1-2 and only the I steps mirror (W side → E side).
   *   A Mirrored LOOP.
   *   BBLF - from α (blue S / red N): the anti lap out (BB), hybrid close
   *   (L F). The second half is the swap+half-turn-rotation transform of the
   *   first, so the closing L/F trade the colors' roles: step 7 is blue-PRO
   *   n→w + red-ANTI s→w, step 8 continues those motion types home (blue w→s,
   *   red w→n). Swapped & Rotated. (Corrected 2026-07-10 - the first build
   *   repeated steps 3-4's roles without the swap; Austen caught it.)
   *   KIEC - from α (blue W / red E): the second half swaps the colors' roles
   *   on both hybrids (I: step 2 blue-pro/red-anti vs step 6 blue-anti/red-pro;
   *   C: step 4 blue-pro/red-anti vs step 8 blue-anti/red-pro). Swapped &
   *   Mirrored. (Step 2's I corrected 2026-07-10 - first build used the
   *   blue-anti variation, breaking the swap symmetry and spawning bogus
   *   reversal dots; Austen caught it. Now I[13] per dataset.)
   * All letters MCP-verified (D/J pro, B/E/K anti, I/L/F/C hybrids - hybrids
   * keep their letter under a color swap; L/F re-verified 2026-07-10).
   * Orientations follow the algebra (anti flips, pro keeps).
   * Reversal dots are DERIVED from the motion data via bakeReversals (never
   * hand-authored): DJII flags both hands at step 7 (the mirror point flips
   * both prop directions); BBLF and KIEC flag nothing (constant per-hand
   * rotation sense the whole loop - KIEC blue CCW / red CW).
   *
   * Reader: each LOOP is one clickable strip playing Start + 8 steps.
   *
   * Geometry off the artboard border scan (20px/pt): 90pt cells; Start x 103.4,
   * step rows x 193.3; DJII y 125.9/215.8, BBLF y 327.4/417.3, KIEC
   * y 532.4/622.3; heavy rules y 319.1/521.7.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
    Orientation,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { GridMode, GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
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

  const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
  const flip = (o: Orientation) => (o === IN ? OUT : IN);
  type HandStep = { anti: boolean; from: GridLocation; to: GridLocation; so: Orientation };
  const h = (anti: boolean, from: GridLocation, to: GridLocation, so: Orientation = IN): HandStep => ({ anti, from, to, so });
  const handMotion = (color: HandSide, x: HandStep) => {
    const dir = HP_CW.has(`${x.from}-${x.to}`) ? CW : CCW;
    return createMotionData({
      motionType: x.anti ? MotionType.ANTI : MotionType.PRO,
      rotationDirection: x.anti ? (dir === CW ? CCW : CW) : dir,
      startLocation: x.from,
      endLocation: x.to,
      startOrientation: x.so,
      endOrientation: x.anti ? flip(x.so) : x.so,
      turns: 0,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  };
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

  type Step = { letter: Letter; left: HandStep; right: HandStep };
  const st = (letter: Letter, left, right): Step => ({ letter, left, right });

  type LoopDef = {
    key: string;
    word: string;
    tag?: string;
    startLetter: Letter;
    startLeft: GridLocation;
    startRight: GridLocation;
    rowYs: [number, number];
    steps: Step[];
  };
  const LOOPS: LoopDef[] = [
    {
      // DJII ×2 - Mirrored LOOP from β (both S).
      key: "t1l-djii",
      word: "DJII Mirrored",
      startLetter: Letter.BETA,
      startLeft: SO_,
      startRight: SO_,
      rowYs: [125.9, 215.8],
      steps: [
        st(Letter.D, h(false, SO_, W), h(false, SO_, E)),
        st(Letter.J, h(false, W, N), h(false, E, N)),
        st(Letter.I, h(true, N, W), h(false, N, W)),
        st(Letter.I, h(true, W, SO_, OUT), h(false, W, SO_)),
        st(Letter.D, h(false, SO_, W), h(false, SO_, E)),
        st(Letter.J, h(false, W, N), h(false, E, N)),
        st(Letter.I, h(true, N, E), h(false, N, E)),
        st(Letter.I, h(true, E, SO_, OUT), h(false, E, SO_)),
      ],
    },
    {
      // BBLF ×2 - Swapped & Rotated LOOP from α (blue S / red N).
      key: "t1l-bblf",
      word: "BBLF Swapped & Rotated",
      tag: "Swapped & Rotated LOOP",
      startLetter: Letter.ALPHA,
      startLeft: SO_,
      startRight: N,
      rowYs: [327.4, 417.3],
      steps: [
        st(Letter.B, h(true, SO_, W), h(true, N, E)),
        st(Letter.B, h(true, W, N, OUT), h(true, E, SO_, OUT)),
        st(Letter.L, h(true, N, E), h(false, SO_, E)),
        st(Letter.F, h(true, E, SO_, OUT), h(false, E, N)),
        st(Letter.B, h(true, SO_, W), h(true, N, E)),
        st(Letter.B, h(true, W, N, OUT), h(true, E, SO_, OUT)),
        st(Letter.L, h(false, N, W), h(true, SO_, W)),
        st(Letter.F, h(false, W, SO_), h(true, W, N, OUT)),
      ],
    },
    {
      // KIEC ×2 - Swapped & Mirrored LOOP from α (blue W / red E); the second
      // half swaps the colors' pro/anti roles (compare steps 4 and 8's C).
      key: "t1l-kiec",
      word: "KIEC Swapped & Mirrored",
      startLetter: Letter.ALPHA,
      startLeft: W,
      startRight: E,
      rowYs: [532.4, 622.3],
      steps: [
        st(Letter.K, h(true, W, N), h(true, E, N)),
        st(Letter.I, h(false, N, W, OUT), h(true, N, W, OUT)),
        st(Letter.E, h(true, W, N, OUT), h(true, W, SO_)),
        st(Letter.C, h(false, N, W), h(true, SO_, E, OUT)),
        st(Letter.K, h(true, W, N), h(true, E, N)),
        st(Letter.I, h(true, N, E, OUT), h(false, N, E, OUT)),
        st(Letter.E, h(true, E, SO_), h(true, E, N, OUT)),
        st(Letter.C, h(true, SO_, W, OUT), h(false, N, E)),
      ],
    },
  ];

  const stepData = (l: LoopDef, i: number): StepData => {
    const s = l.steps[i]!;
    return {
      id: `${l.key}-${i + 1}`,
      letter: s.letter,
      gridMode: GridMode.DIAMOND,
      startPlacement: getGridPlacementFromLocations(s.left.from, s.right.from),
      endPlacement: getGridPlacementFromLocations(s.left.to, s.right.to),
      stepNumber: i + 1,
      motions: {
        left: handMotion(HandSide.LEFT, s.left),
        right: handMotion(HandSide.RIGHT, s.right),
      },
    } as unknown as StepData;
  };
  const startBox = (l: LoopDef): StepData =>
    ({
      id: `${l.key}-0`,
      letter: l.startLetter,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement: getGridPlacementFromLocations(l.startLeft, l.startRight),
      endPlacement: getGridPlacementFromLocations(l.startLeft, l.startRight),
      motions: {
        left: stat(HandSide.LEFT, l.startLeft),
        right: stat(HandSide.RIGHT, l.startRight),
      },
    }) as unknown as StepData;

  // Static authoring - build each LOOP's full strip (start + numbered steps),
  // with reversal dots derived from the motions themselves (bakeReversals;
  // never hand-authored). An admin override (guide-overrides.svelte) replaces
  // the WHOLE strip when present, resolved before baking - reversal dots stay
  // derived either way. Reactive ($derived) so a save/revert/reset while the
  // reader is open re-renders these cells without a refresh.
  const resolvedStrip = (l: LoopDef): StepData[] => {
    const authored = [startBox(l), ...l.steps.map((_, i) => stepData(l, i))];
    const override = overrideStepsFor(l.key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(LOOPS.map((l) => [l.key, resolvedStrip(l)]))
  );
  const loopSteps = (l: LoopDef): StepData[] => RESOLVED[l.key]!;

  // ── Geometry ────────────────────────────────────────────────────────────────
  const CELL = 90;
  const START_X = 103.4;
  const ROW_X = 193.3;
  const RULES = [319.1, 521.7];
  const MARGINS = [
    { t: "DJII", y: 160, tagY: null },
    { t: "BBLF", y: 360, tagY: 395 },
    { t: "KIEC", y: 565, tagY: null },
  ];

  // ── Text at proof coords (CAP→LOOP + typo fix) ──────────────────────────────
  type Para = { y: number; fs: number; lh: number; html: string };
  let PARAS: Para[] = $state([
    {
      y: 70.3,
      fs: 15,
      lh: 18,
      html:
        "In this example of DJII, the graphs in the second repetition (steps 5-8) mirror the<br>" +
        "graphs in the first repetition (steps 1-4), classifying it as a <em>Mirrored LOOP</em>.",
    },
    {
      y: 736.8,
      fs: 15,
      lh: 18,
      html:
        "In this example of KIEC, the colors are swapped in the second half,<br>" +
        "so it is classified as a <em>Swapped & Mirrored LOOP</em>.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Type 1 LOOPs (misc-permutations)", () =>
      PARAS.map((p, i) => `  para[${i}]: y: ${r1(p.y)}`).join("\n")
    )
  );

  const PICTO_FLAGS = {
    showGrid: true,
    showTKA: true,
    showPlacements: false,
    showReversals: true,
    showTnD: false,
    showElemental: false,
    showNonRadialPoints: false,
    showHandPoints: true,
    darkMode: false,
    printMode: true,
    disableTransitions: true,
  } as const;
</script>

<div class="t1-loops">
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"></div>
  {/each}

  <!-- Margin word labels (+ the BBLF classification tag). -->
  {#each MARGINS as m (m.t)}
    <span class="margin-word" style="left:{10 * S}px; top:{m.y * S}px; width:{86 * S}px; font-size:{20 * S}px"
      ><span class="tka-font">{m.t}</span></span
    >
    {#if m.tagY != null}
      <span class="margin-tag" style="left:{4 * S}px; top:{m.tagY * S}px; width:{96 * S}px; font-size:{13 * S}px">Swapped &amp; Rotated LOOP</span>
    {/if}
  {/each}

  <!-- The three LOOPs: Start + 2 rows of 4, each one clickable strip. -->
  {#each LOOPS as l (l.key)}
    <div
      class="loop tka-seq-cell"
      class:is-hovered={selection?.isHovered(l.key)}
      class:is-selected={selection?.isSelected(l.key)}
      style="left:{START_X * S}px; top:{l.rowYs[0] * S}px; width:{(ROW_X + CELL * 4 - START_X) * S}px; height:{(l.rowYs[1] - l.rowYs[0] + CELL) * S}px"
    >
      <div
        class="mini"
        class:guide-step-active={activeStep?.key === l.key && activeStep.ringStep === 0}
        style="left:0; top:0; width:{CELL * S}px; height:{CELL * S}px"
      >
        <PictographContainer
          pictographData={RESOLVED[l.key]![0]}
          gridMode={GridMode.DIAMOND}
          leftPropTypeOverride={PropType.STAFF}
          rightPropTypeOverride={PropType.STAFF}
          stepNumberOverride={true}
          {...PICTO_FLAGS}
        />
      </div>
      {#each RESOLVED[l.key]!.slice(1) as sd, i (i)}
        <div
          class="mini"
          class:guide-step-active={activeStep?.key === l.key && activeStep.ringStep === i + 1}
          style="left:{(ROW_X - START_X + (i % 4) * CELL) * S}px; top:{(Math.floor(i / 4) * (l.rowYs[1] - l.rowYs[0])) * S}px; width:{CELL * S}px; height:{CELL * S}px"
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
        groupId={l.key}
        isGroupStart
        label={`Animate the ${l.word} LOOP`}
        onselect={() => emitSequence?.({ strip: loopSteps(l), word: l.word, key: l.key, propType: "staff" })}
      />
    </div>
  {/each}

  <!-- Paragraphs (proof coords). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `t1l-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`t1l-para-${i}`, "para", p)}
      use:editText={{ id: `t1l-para-${i}`, label: "para", get: () => p.html, set: (h2) => (p.html = h2) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .t1-loops {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .rule {
    position: absolute;
    height: 2.5px;
    background: #141414;
  }

  .loop {
    position: absolute;
  }

  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }

  .margin-word {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-weight: 700;
    text-align: center;
    line-height: 1;
    white-space: nowrap;
    letter-spacing: 0.02em;
  }
  /* The word itself renders in the TKA letterforms (still real, selectable
     text - the webfont). Single-weight font: don't synthesize bold. */
  .margin-word .tka-font {
    font-weight: normal;
    letter-spacing: 0.06em;
  }
  .margin-tag {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-style: italic;
    text-align: center;
    line-height: 1.25;
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
