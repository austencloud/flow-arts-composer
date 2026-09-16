<script lang="ts">
  /**
   * LOOPs - body page (manifest `permutations`, retitled "LOOPs"), faithful to
   * proof p32 / "1.2 - Permutations" artboard ("CAPs"). FACELIFT TERMINOLOGY:
   * the old guide's "CAP / Continuous Assembly Pattern" reads "LOOP" here, per
   * the tracker convention (the app's term).
   *
   * Three 8-step LOOPs (Start + 2 rows of 4, real staff pictographs), one per
   * LOOP type, with the system's reversal indicators exactly where the prop
   * rotation flips (`leftReversal`/`rightReversal` - dots are prop-only):
   *   Mirrored - AABB then its horizontal-plane reflection (both hands flag R
   *   on step 5, where CW becomes CCW).
   *   Rotated  - DΨDΨDΨDΨ from β: each D+Ψ repetition ends 90° rotated
   *   (S→W→N→E→S, home). No reversals (D never flips; Ψ's dash has none).
   *   Swapped  - Δ-TQZ- twice from β: the second repetition swaps the
   *   right/left roles. Blue flags R on steps 3 and 5, red on step 7.
   * All letters MCP-verified earlier this run (A/B, D, Ψ, T, Q, Δ-, Z-).
   *
   * Reader: each LOOP is one clickable strip playing Start + 8 steps.
   *
   * Geometry off the artboard border scan (20px/pt): 75pt cells; Mirrored
   * start (217.7, 193) rows x 292.7 y 193/268; Rotated start (9.6, 398.6)
   * rows x 84.5 y 398.6/473.6; Swapped start (224.6, 619.4) rows x 299.5
   * y 619.4/694.3; heavy rules y 151.1/372.8/584.7. Text at PROOF_TEXT coords.
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
  const NOROT = RotationDirection.NO_ROTATION;

  // Reader wiring (all null on /print,/book - pages stay pristine).
  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  // Each hand per step: motion type, path, start orientation; end orientation
  // follows the algebra (pro/static keep, anti/dash flip). Prop rotation: pro
  // rides the handpath, anti counter-rotates, dash/static none.
  const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
  type HandStep = { t: "pro" | "anti" | "dash" | "static"; from: GridLocation; to: GridLocation; so: Orientation };
  const handMotion = (color: HandSide, h: HandStep) => {
    const dir = HP_CW.has(`${h.from}-${h.to}`) ? CW : CCW;
    const type =
      h.t === "pro" ? MotionType.PRO : h.t === "anti" ? MotionType.ANTI : h.t === "dash" ? MotionType.DASH : MotionType.STATIC;
    const flips = h.t === "anti" || h.t === "dash";
    return createMotionData({
      motionType: type,
      rotationDirection: h.t === "pro" ? dir : h.t === "anti" ? (dir === CW ? CCW : CW) : NOROT,
      startLocation: h.from,
      endLocation: h.to,
      startOrientation: h.so,
      endOrientation: flips ? (h.so === IN ? OUT : IN) : h.so,
      turns: 0,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  };

  type Step = { letter: Letter; name: string; left: HandStep; right: HandStep; bRev?: boolean; rRev?: boolean };
  const hs = (t: HandStep["t"], from: GridLocation, to: GridLocation, so: Orientation = IN): HandStep => ({ t, from, to, so });

  type LoopDef = {
    key: string;
    word: string;
    startLetter: Letter;
    startLeft: GridLocation;
    startRight: GridLocation;
    startX: number;
    rowX: number;
    rowYs: [number, number];
    steps: Step[];
  };

  const LOOPS: LoopDef[] = [
    {
      // Mirrored: AABB + its horizontal-plane reflection (R R on step 5).
      key: "loop-mirror",
      word: "AABB Mirrored",
      startLetter: Letter.ALPHA,
      startLeft: W,
      startRight: E,
      startX: 217.7,
      rowX: 292.7,
      rowYs: [193, 268],
      steps: [
        { letter: Letter.A, name: "A", left: hs("pro", W, N), right: hs("pro", E, SO_) },
        { letter: Letter.A, name: "A", left: hs("pro", N, E), right: hs("pro", SO_, W) },
        { letter: Letter.B, name: "B", left: hs("anti", E, N), right: hs("anti", W, SO_) },
        { letter: Letter.B, name: "B", left: hs("anti", N, W, OUT), right: hs("anti", SO_, E, OUT) },
        { letter: Letter.A, name: "A", left: hs("pro", W, SO_), right: hs("pro", E, N), bRev: true, rRev: true },
        { letter: Letter.A, name: "A", left: hs("pro", SO_, E), right: hs("pro", N, W) },
        { letter: Letter.B, name: "B", left: hs("anti", E, SO_), right: hs("anti", W, N) },
        { letter: Letter.B, name: "B", left: hs("anti", SO_, W, OUT), right: hs("anti", N, E, OUT) },
      ],
    },
    {
      // Rotated: each DΨ repetition lands 90° around (S→W→N→E→S).
      key: "loop-rotate",
      word: "DΨDΨDΨDΨ Rotated",
      startLetter: Letter.BETA,
      startLeft: SO_,
      startRight: SO_,
      startX: 9.6,
      rowX: 84.5,
      rowYs: [398.6, 473.6],
      steps: [
        { letter: Letter.D, name: "D", left: hs("pro", SO_, W), right: hs("pro", SO_, E) },
        { letter: Letter.PSI, name: "Ψ", left: hs("static", W, W), right: hs("dash", E, W) },
        { letter: Letter.D, name: "D", left: hs("pro", W, N), right: hs("pro", W, SO_, OUT) },
        { letter: Letter.PSI, name: "Ψ", left: hs("static", N, N), right: hs("dash", SO_, N, OUT) },
        { letter: Letter.D, name: "D", left: hs("pro", N, E), right: hs("pro", N, W) },
        { letter: Letter.PSI, name: "Ψ", left: hs("static", E, E), right: hs("dash", W, E) },
        { letter: Letter.D, name: "D", left: hs("pro", E, SO_), right: hs("pro", E, N, OUT) },
        { letter: Letter.PSI, name: "Ψ", left: hs("static", SO_, SO_), right: hs("dash", N, SO_, OUT) },
      ],
    },
    {
      // Swapped: Δ-TQZ- twice, second repetition swaps right/left roles.
      key: "loop-swap",
      word: "Δ-TQZ- Swapped",
      startLetter: Letter.BETA,
      startLeft: SO_,
      startRight: SO_,
      startX: 224.6,
      rowX: 299.5,
      rowYs: [619.4, 694.3],
      steps: [
        { letter: Letter.DELTA_DASH, name: "Δ-", left: hs("dash", SO_, N), right: hs("anti", SO_, E) },
        { letter: Letter.T, name: "T", left: hs("anti", N, W, OUT), right: hs("anti", E, N, OUT) },
        { letter: Letter.Q, name: "Q", left: hs("anti", W, N), right: hs("anti", N, W), bRev: true },
        { letter: Letter.Z_DASH, name: "Z-", left: hs("dash", N, SO_, OUT), right: hs("anti", W, SO_, OUT) },
        { letter: Letter.DELTA_DASH, name: "Δ-", left: hs("anti", SO_, E), right: hs("dash", SO_, N), bRev: true },
        { letter: Letter.T, name: "T", left: hs("anti", E, N, OUT), right: hs("anti", N, W, OUT) },
        { letter: Letter.Q, name: "Q", left: hs("anti", N, W), right: hs("anti", W, N), rRev: true },
        { letter: Letter.Z_DASH, name: "Z-", left: hs("anti", W, SO_, OUT), right: hs("dash", N, SO_, OUT) },
      ],
    },
  ];

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

  const stepData = (l: LoopDef, i: number): StepData => {
    const st = l.steps[i]!;
    return {
      id: `${l.key}-${i + 1}`,
      letter: st.letter,
      gridMode: GridMode.DIAMOND,
      startPlacement: getGridPlacementFromLocations(st.left.from, st.right.from),
      endPlacement: getGridPlacementFromLocations(st.left.to, st.right.to),
      stepNumber: i + 1,
      leftReversal: !!st.bRev,
      rightReversal: !!st.rRev,
      motions: {
        left: handMotion(HandSide.LEFT, st.left),
        right: handMotion(HandSide.RIGHT, st.right),
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
  const CELL = 75;
  const RULES = [151.1, 372.8, 584.7];
  const HEADS = [
    { t: "Mirrored", x: 51.8, y: 154.4 },
    { t: "Rotated", x: 453.7, y: 377.3 },
    { t: "Swapped", x: 66.8, y: 587 },
  ];

  // ── Text at proof coords (CAP → LOOP facelift) ──────────────────────────────
  type Para = { x: number; y: number; fs: number; lh: number; left?: number; width?: number; html: string };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 46,
      fs: 15,
      lh: 18,
      html:
        "When a word ends on a variation of its start position, we can repeat it to trace a<br>" +
        "complimentary pattern, eventually returning back to the start position (aka home).<br>" +
        "This type of sequence is called a <strong><em>LOOP</em></strong>.",
    },
    {
      x: 0,
      y: 118,
      fs: 15,
      lh: 18,
      html: "Three common types of LOOPs are <em>Mirrored</em>, <em>Rotated</em>, and <em>Swapped</em>.",
    },
    {
      x: 0, y: 190.6, fs: 15, lh: 18, left: 12, width: 195,
      html: "In a mirrored LOOP, the second repetition’s pictographs reflect the first, which changes their rotation direction.",
    },
    {
      x: 0, y: 298.6, fs: 15, lh: 18, left: 12, width: 195,
      html: "In this example, each column is reflected across a horizontal plane.",
    },
    {
      x: 0, y: 418.2, fs: 15, lh: 18, left: 388, width: 214,
      html: "In a rotated LOOP, each repetition ends in a rotated variation on its previous position.",
    },
    {
      x: 0, y: 490.2, fs: 15, lh: 18, left: 388, width: 214,
      html: "In this example, there is a 90° rotation, finally returning to the start position (aka “home”).",
    },
    {
      x: 0, y: 630.6, fs: 15, lh: 18, left: 12, width: 195,
      html: 'In a swapped LOOP, each repetition swaps the roles of <strong class="cR">right</strong>/<strong class="cB">left</strong>.',
    },
    {
      x: 0, y: 702.6, fs: 15, lh: 18, left: 12, width: 195,
      html: "Though the prop’s shapes look the same, this swap changes the body motion significantly.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("LOOPs (permutations)", () =>
      PARAS.map((p, i) => `  para[${i}]: y: ${r1(p.y)}${p.left != null ? `, left: ${r1(p.left)}` : ""}`).join("\n")
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

<div class="loops-page">
  <!-- Heavy rules + side section heads (shared script face). -->
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"></div>
  {/each}
  {#each HEADS as h (h.t)}
    <div class="guide-title side-head" style="left:{h.x * S}px; right:auto; top:{h.y * S}px">{h.t}</div>
  {/each}

  <!-- The three LOOPs: Start + 2 rows of 4, each a single clickable strip. -->
  {#each LOOPS as l (l.key)}
    <div
      class="loop tka-seq-cell"
      class:is-hovered={selection?.isHovered(l.key)}
      class:is-selected={selection?.isSelected(l.key)}
      style="left:{Math.min(l.startX, l.rowX) * S}px; top:{l.rowYs[0] * S}px; width:{(l.rowX + CELL * 4 - Math.min(l.startX, l.rowX)) * S}px; height:{(l.rowYs[1] - l.rowYs[0] + CELL) * S}px"
    >
      <!-- Start box -->
      <div
        class="mini"
        class:guide-step-active={activeStep?.key === l.key && activeStep.ringStep === 0}
        style="left:{(l.startX - Math.min(l.startX, l.rowX)) * S}px; top:0; width:{CELL * S}px; height:{CELL * S}px"
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
      <!-- 8 steps in two rows of 4 -->
      {#each RESOLVED[l.key]!.slice(1) as sd, i (i)}
        <div
          class="mini"
          class:guide-step-active={activeStep?.key === l.key && activeStep.ringStep === i + 1}
          style="left:{(l.rowX + (i % 4) * CELL - Math.min(l.startX, l.rowX)) * S}px; top:{(Math.floor(i / 4) * (l.rowYs[1] - l.rowYs[0])) * S}px; width:{CELL * S}px; height:{CELL * S}px"
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

  <!-- Paragraphs: centred intro + side blocks beside the grids. -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:side={p.left != null}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `loops-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px; {p.left != null
        ? `left:${p.left * S}px; right:auto; width:${(p.width ?? 200) * S}px;`
        : ''}"
      use:ptDrag={pt(`loops-para-${i}`, "para", p)}
      use:editText={{ id: `loops-para-${i}`, label: "para", get: () => p.html, set: (h) => (p.html = h) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .loops-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .rule {
    position: absolute;
    height: 2.5px;
    background: #141414;
  }

  /* Side section heads reuse the calligraphic face at a sub-title size,
     anchored at the proof's own x instead of centred. */
  .side-head {
    font-size: 42px;
    text-align: left;
  }

  .loop {
    position: absolute;
  }

  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
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
  .para :global(.cR) {
    color: #cc2127;
  }
  .para :global(.cB) {
    color: #2e3192;
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
