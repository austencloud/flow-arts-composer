<script lang="ts">
  /**
   * Full-Reversal LOOPs - body page (manifest `full-reversal-loops`), faithful
   * to "1.2 - Full-Reversal Permutations" artboard (old p43; "Full-reversal
   * CAPs" - CAP→LOOP facelift).
   *
   * Three sequences that each use a full-reversal (plus prop-reversals within -
   * the page's challenge is spotting each). Reversal dots are DERIVED via
   * bakeReversals and land exactly on the artboard's R marks:
   *   CCKE (8) - R/R on 2, 3, 5, 6, 7. The C-C corner is the full reversal
   *   (both handpath and prop flip, so each C keeps hybrid form with the
   *   colors' roles trading). C C[swap] K[6] E[7] / C[6] C[swap] K[1] E[2].
   *   FLII (8) - blue R on 3, red R on 5 and 7. F[14] L[15] I[13] I[12] /
   *   F[6] L[7] I[3] I[0].
   *   DAK ×4 (12) - alternating single-hand flips: blue R on 2, 6, 8, 12; red
   *   R on 3, 5, 9, 11. D[6] A K[5] / D[2] A K[2] / D[5] A K[6] / D[0] A K[0].
   * Every step MCP-verified against list_letter_variations this build.
   *
   * Reader: each sequence is one clickable strip.
   *
   * Geometry off the artboard scan (20px/pt): CCKE/FLII 93.9pt cells, Start
   * x 100.8, rows x 194.7, ys 142.6/236.5 and 354.7/448.6; DAK 87.4pt cells,
   * Start x 5.6, rows x 93, ys 591.2/688.5; heavy rules y 135.3/340.2/556.4.
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
  type HandStep = { anti?: boolean; still?: boolean; from: GridLocation; to: GridLocation; so: Orientation };
  const h = (anti: boolean, from: GridLocation, to: GridLocation, so: Orientation = IN): HandStep => ({ anti, from, to, so });
  const sh = (loc: GridLocation, so: Orientation = IN): HandStep => ({ still: true, from: loc, to: loc, so });
  const handMotion = (color: HandSide, x: HandStep) => {
    if (x.still) {
      return createMotionData({
        motionType: MotionType.STATIC,
        startLocation: x.from,
        endLocation: x.to,
        startOrientation: x.so,
        endOrientation: x.so,
        color,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      });
    }
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

  type Step = { letter: Letter; left: HandStep; right: HandStep };
  const st = (letter: Letter, left, right): Step => ({ letter, left, right });
  const { A, C, D, F, I, K, L } = Letter;
  const EL = Letter.E;

  type SeqDef = {
    key: string;
    word: string;
    startLetter: Letter;
    startLeft: GridLocation;
    startRight: GridLocation;
    startX: number;
    rowX: number;
    cell: number;
    rowYs: [number, number];
    perRow: number;
    steps: Step[];
  };
  const SEQS: SeqDef[] = [
    {
      // CCKE ×2 - full reversal at each C-C corner; R/R derives on 2,3,5,6,7.
      key: "frl-ccke",
      word: "CCKE",
      startLetter: Letter.ALPHA,
      startLeft: SO_,
      startRight: N,
      startX: 100.8,
      rowX: 194.7,
      cell: 93.9,
      rowYs: [142.6, 236.5],
      perRow: 4,
      steps: [
        st(C, h(true, SO_, W), h(false, N, E)),
        st(C, h(false, W, N, OUT), h(true, E, SO_)),
        st(K, h(true, N, E, OUT), h(true, SO_, E, OUT)),
        st(EL, h(true, E, SO_), h(true, E, N)),
        st(C, h(true, SO_, E, OUT), h(false, N, W, OUT)),
        st(C, h(false, E, N), h(true, W, SO_, OUT)),
        st(K, h(true, N, W), h(true, SO_, W)),
        st(EL, h(true, W, SO_, OUT), h(true, W, N, OUT)),
      ],
    },
    {
      // FLII ×2 - blue R on 3, red R on 5 and 7.
      key: "frl-flii",
      word: "FLII",
      startLetter: Letter.BETA,
      startLeft: SO_,
      startRight: SO_,
      startX: 100.8,
      rowX: 194.7,
      cell: 93.9,
      rowYs: [354.7, 448.6],
      perRow: 4,
      steps: [
        st(F, h(false, SO_, W), h(true, SO_, E)),
        st(L, h(false, W, N), h(true, E, N, OUT)),
        st(I, h(false, N, W), h(true, N, W)),
        st(I, h(false, W, SO_), h(true, W, SO_, OUT)),
        st(F, h(true, SO_, W), h(false, SO_, E)),
        st(L, h(true, W, N, OUT), h(false, E, N)),
        st(I, h(true, N, E), h(false, N, E)),
        st(I, h(true, E, SO_, OUT), h(false, E, SO_)),
      ],
    },
    {
      // DAK ×4 - alternating single-hand flips: blue R on 2,6,8,12; red R on
      // 3,5,9,11.
      key: "frl-dak",
      word: "DAK",
      startLetter: Letter.BETA,
      startLeft: SO_,
      startRight: SO_,
      startX: 5.6,
      rowX: 93,
      cell: 87.4,
      rowYs: [591.2, 688.5],
      perRow: 6,
      steps: [
        st(D, h(false, SO_, W), h(false, SO_, E)),
        st(A, h(false, W, SO_), h(false, E, N)),
        st(K, h(true, SO_, W), h(true, N, W)),
        st(D, h(false, W, SO_, OUT), h(false, W, N, OUT)),
        st(A, h(false, SO_, E, OUT), h(false, N, W, OUT)),
        st(K, h(true, E, N, OUT), h(true, W, N, OUT)),
        st(D, h(false, N, E), h(false, N, W)),
        st(A, h(false, E, N), h(false, W, SO_)),
        st(K, h(true, N, E), h(true, SO_, E)),
        st(D, h(false, E, N, OUT), h(false, E, SO_, OUT)),
        st(A, h(false, N, W, OUT), h(false, SO_, E, OUT)),
        st(K, h(true, W, SO_, OUT), h(true, E, SO_, OUT)),
      ],
    },
  ];

  const stepData = (q: SeqDef, i: number): StepData => {
    const s = q.steps[i]!;
    return {
      id: `${q.key}-${i + 1}`,
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
  const startBox = (q: SeqDef): StepData =>
    ({
      id: `${q.key}-0`,
      letter: q.startLetter,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement: getGridPlacementFromLocations(q.startLeft, q.startRight),
      endPlacement: getGridPlacementFromLocations(q.startLeft, q.startRight),
      motions: {
        left: handMotion(HandSide.LEFT, sh(q.startLeft)),
        right: handMotion(HandSide.RIGHT, sh(q.startRight)),
      },
    }) as unknown as StepData;

  const resolvedStrip = (q: SeqDef): StepData[] => {
    const authored = [startBox(q), ...q.steps.map((_, i) => stepData(q, i))];
    const override = overrideStepsFor(q.key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(SEQS.map((q) => [q.key, resolvedStrip(q)]))
  );

  // ── Geometry ────────────────────────────────────────────────────────────────
  const RULES = [135.3, 340.2, 556.4];
  const MARGINS = [
    { t: "CCKE", x: 4, y: 187.8, w: 92 },
    { t: "FLII", x: 4, y: 400, w: 92 },
    { t: "DAK", x: 8, y: 570, w: 80 },
  ];

  // ── Text (LOOP facelift) ────────────────────────────────────────────────────
  type Para = { y: number; fs: number; lh: number; html: string };
  let PARAS: Para[] = $state([
    {
      y: 68,
      fs: 15,
      lh: 18,
      html:
        "Each of these words uses a full-reversal.<br>" +
        "There are also prop-reversals within these words.<br>" +
        "Challenge yourself to identify each one.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Full-Reversal LOOPs (full-reversal-loops)", () =>
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

<div class="fr-loops">
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"></div>
  {/each}

  <!-- Margin word labels. -->
  {#each MARGINS as m (m.t)}
    <span class="margin-word" style="left:{m.x * S}px; top:{m.y * S}px; width:{m.w * S}px; font-size:{18 * S}px"
      ><span class="tka-font">{m.t}</span></span
    >
  {/each}

  <!-- The three sequences: Start + rows, each one clickable strip. -->
  {#each SEQS as q (q.key)}
    <div
      class="loop tka-seq-cell"
      class:is-hovered={selection?.isHovered(q.key)}
      class:is-selected={selection?.isSelected(q.key)}
      style="left:{q.startX * S}px; top:{q.rowYs[0] * S}px; width:{(q.rowX + q.cell * q.perRow - q.startX) * S}px; height:{(q.rowYs[1] - q.rowYs[0] + q.cell) * S}px"
    >
      <div
        class="mini"
        class:guide-step-active={activeStep?.key === q.key && activeStep.ringStep === 0}
        style="left:0; top:0; width:{q.cell * S}px; height:{q.cell * S}px"
      >
        <PictographContainer
          pictographData={RESOLVED[q.key]![0]}
          gridMode={GridMode.DIAMOND}
          leftPropTypeOverride={PropType.STAFF}
          rightPropTypeOverride={PropType.STAFF}
          stepNumberOverride={true}
          {...PICTO_FLAGS}
        />
      </div>
      {#each RESOLVED[q.key]!.slice(1) as sd, i (i)}
        <div
          class="mini"
          class:guide-step-active={activeStep?.key === q.key && activeStep.ringStep === i + 1}
          style="left:{(q.rowX - q.startX + (i % q.perRow) * q.cell) * S}px; top:{(Math.floor(i / q.perRow) * (q.rowYs[1] - q.rowYs[0])) * S}px; width:{q.cell * S}px; height:{q.cell * S}px"
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
        groupId={q.key}
        isGroupStart
        label={`Animate ${q.word}`}
        onselect={() => emitSequence?.({ strip: RESOLVED[q.key]!, word: q.word, key: q.key, propType: "staff" })}
      />
    </div>
  {/each}

  <!-- Paragraphs (artboard coords). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `frl-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`frl-para-${i}`, "para", p)}
      use:editText={{ id: `frl-para-${i}`, label: "para", get: () => p.html, set: (h2) => (p.html = h2) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .fr-loops {
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
    text-align: center;
    line-height: 1;
    white-space: nowrap;
  }
  .margin-word .tka-font {
    font-weight: normal;
    letter-spacing: 0.06em;
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
