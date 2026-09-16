<script lang="ts">
  /**
   * Gamma Words - body page (NEW manifest entry `lt1-gamma-words`), faithful to
   * proof p26 / "1.1 - Gamma Words - MP, NQ, OR, STUV" artboard.
   *
   * The simplest 4-letter γ→γ words, all real staff pictographs sharing one
   * Start box per block (start = left S / right E, thumbs in - the γ the previous
   * page ends on):
   *   γ→γ (Opp)  - MPMP / NQNQ / OROR: left rides the CW loop s→w→n→e→s while
   *   right rides the CCW loop e→n→w→s→e (letters alternate M,P,M,P - MCP: M/P
   *   dual-pro, N/Q dual-anti, O/R hybrid left-anti + right-pro).
   *   γ→γ (Same) - SSSS / TTTT / UUUU / VVVV: both hands ride the CCW loop,
   *   right positionally leading (left s→e→n→w→s one step behind right's
   *   e→n→w→s→e). U = leader pro (right pro / left anti); V = leader anti.
   * Anti hands flip the thumb every letter (in→out→in→out); pro hands stay in.
   *
   * Reader: each word row is one clickable strip → Start + 4 letters with
   * staffs. Facelift: lowercase γ.
   *
   * Geometry off the artboard border scan (20px/pt): 90pt cells; Start boxes
   * (89.7, 103.9) and (89.7, 414.1); rows x 179.6 at y 103.9/193.8/283.8 and
   * 414.1/504/594/683.9; heavy rule y 387.6.
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

  const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
  const hpDir = (from: GridLocation, to: GridLocation) =>
    HP_CW.has(`${from}-${to}`) ? CW : CCW;
  const hand = (
    color: HandSide,
    from: GridLocation,
    to: GridLocation,
    anti: boolean,
    so: Orientation
  ) => {
    const dir = hpDir(from, to);
    return createMotionData({
      motionType: anti ? MotionType.ANTI : MotionType.PRO,
      rotationDirection: anti ? (dir === CW ? CCW : CW) : dir,
      startLocation: from,
      endLocation: to,
      startOrientation: so,
      endOrientation: anti ? (so === IN ? OUT : IN) : so,
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

  // ── The two loops ───────────────────────────────────────────────────────────
  type Leg = [GridLocation, GridLocation];
  const LEFT_CW: Leg[] = [
    [SO_, W],
    [W, N],
    [N, E],
    [E, SO_],
  ];
  const RIGHT_CCW: Leg[] = [
    [E, N],
    [N, W],
    [W, SO_],
    [SO_, E],
  ];
  const LEFT_CCW: Leg[] = [
    [SO_, E],
    [E, N],
    [N, W],
    [W, SO_],
  ];

  type RowDef = {
    key: string;
    word: string;
    letters: Letter[];
    names: string[];
    y: number;
    block: 0 | 1;
    leftAnti: boolean;
    rightAnti: boolean;
  };
  const ROWS: RowDef[] = [
    {
      key: "gw-mpmp",
      word: "MPMP",
      letters: [Letter.M, Letter.P, Letter.M, Letter.P],
      names: ["M", "P", "M", "P"],
      y: 103.9,
      block: 0,
      leftAnti: false,
      rightAnti: false,
    },
    {
      key: "gw-nqnq",
      word: "NQNQ",
      letters: [Letter.N, Letter.Q, Letter.N, Letter.Q],
      names: ["N", "Q", "N", "Q"],
      y: 193.8,
      block: 0,
      leftAnti: true,
      rightAnti: true,
    },
    {
      key: "gw-oror",
      word: "OROR",
      letters: [Letter.O, Letter.R, Letter.O, Letter.R],
      names: ["O", "R", "O", "R"],
      y: 283.8,
      block: 0,
      leftAnti: true,
      rightAnti: false,
    },
    {
      key: "gw-ssss",
      word: "SSSS",
      letters: [Letter.S, Letter.S, Letter.S, Letter.S],
      names: ["S", "S", "S", "S"],
      y: 414.1,
      block: 1,
      leftAnti: false,
      rightAnti: false,
    },
    {
      key: "gw-tttt",
      word: "TTTT",
      letters: [Letter.T, Letter.T, Letter.T, Letter.T],
      names: ["T", "T", "T", "T"],
      y: 504.0,
      block: 1,
      leftAnti: true,
      rightAnti: true,
    },
    {
      key: "gw-uuuu",
      word: "UUUU",
      letters: [Letter.U, Letter.U, Letter.U, Letter.U],
      names: ["U", "U", "U", "U"],
      y: 594.0,
      block: 1,
      leftAnti: true,
      rightAnti: false,
    },
    {
      key: "gw-vvvv",
      word: "VVVV",
      letters: [Letter.V, Letter.V, Letter.V, Letter.V],
      names: ["V", "V", "V", "V"],
      y: 683.9,
      block: 1,
      leftAnti: false,
      rightAnti: true,
    },
  ];

  const legs = (r: RowDef, handSide: "left" | "right", i: number): Leg =>
    handSide === "right"
      ? RIGHT_CCW[i]!
      : r.block === 0
        ? LEFT_CW[i]!
        : LEFT_CCW[i]!;

  const rowStep = (r: RowDef, i: number, forStrip: boolean): StepData => {
    const leftLeg = legs(r, "left", i);
    const rightLeg = legs(r, "right", i);
    const bso = r.leftAnti ? (i % 2 === 0 ? IN : OUT) : IN;
    const rso = r.rightAnti ? (i % 2 === 0 ? IN : OUT) : IN;
    return {
      id: `${r.key}-${forStrip ? "s" : "p"}-${i + 1}`,
      letter: r.letters[i]!,
      gridMode: GridMode.DIAMOND,
      startPlacement: getGridPlacementFromLocations(leftLeg[0], rightLeg[0]),
      endPlacement: getGridPlacementFromLocations(leftLeg[1], rightLeg[1]),
      stepNumber: i + 1,
      motions: {
        left: hand(HandSide.LEFT, leftLeg[0], leftLeg[1], r.leftAnti, bso),
        right: hand(HandSide.RIGHT, rightLeg[0], rightLeg[1], r.rightAnti, rso),
      },
    } as unknown as StepData;
  };

  const startBox = (block: 0 | 1): StepData =>
    ({
      id: `gw-start-${block}`,
      letter: Letter.GAMMA,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement: getGridPlacementFromLocations(SO_, E),
      endPlacement: getGridPlacementFromLocations(SO_, E),
      motions: {
        left: staticHand(HandSide.LEFT, SO_),
        right: staticHand(HandSide.RIGHT, E),
      },
    }) as unknown as StepData;

  const rowSteps = (r: RowDef): StepData[] => [
    startBox(r.block),
    ...[0, 1, 2, 3].map((i) => rowStep(r, i, true)),
  ];

  // Override-aware resolution: an admin override (guide-overrides.svelte)
  // replaces the WHOLE strip when present; reversal dots are always DERIVED
  // via bakeReversals, never hand-authored. Reactive ($derived) so a
  // save/revert/reset while the reader is open re-renders these cells without
  // a refresh.
  const resolvedRowSteps = (r: RowDef): StepData[] => {
    const authored = rowSteps(r);
    const override = overrideStepsFor(r.key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(ROWS.map((r) => [r.key, resolvedRowSteps(r)]))
  );

  // ── Geometry ────────────────────────────────────────────────────────────────
  const CELL = 90;
  const START_X = 89.7;
  const ROW_X = 179.6;
  const BLOCKS = [
    {
      block: 0 as const,
      startY: 103.9,
      keys: ["gw-mpmp", "gw-nqnq", "gw-oror"],
    },
    {
      block: 1 as const,
      startY: 414.1,
      keys: ["gw-ssss", "gw-tttt", "gw-uuuu", "gw-vvvv"],
    },
  ];
  const HEAVY_RULE = 387.6;

  const MARGINS = [
    { mode: "(Opp)", glyphY: 135, modeY: 156, cx: 50 },
    { mode: "(Same)", glyphY: 445, modeY: 466, cx: 50 },
  ];

  let PARAS = $state([
    {
      x: 0,
      y: 71,
      fs: 15.5,
      lh: 18.6,
      html: "These are the simplest 4-letter words created with continuous γ→γ motions:",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Gamma Words (lt1-gamma-words)", () =>
      PARAS.map((p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`).join(
        "\n"
      )
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

<div class="gamma-words">
  <!-- Heavy rule between the Opp and Same blocks. -->
  <div
    class="rule"
    style="left:{20 * S}px; top:{HEAVY_RULE * S}px; width:{572 * S}px"
  ></div>

  <!-- Shared Start boxes (ring while any word in their block plays). -->
  {#each BLOCKS as blk (blk.block)}
    <div
      class="mini"
      class:guide-step-active={activeStep?.key != null &&
        blk.keys.includes(activeStep.key) &&
        activeStep.ringStep === 0}
      style="left:{START_X * S}px; top:{blk.startY * S}px; width:{CELL *
        S}px; height:{CELL * S}px"
    >
      <PictographContainer
        pictographData={startBox(blk.block)}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.STAFF}
        rightPropTypeOverride={PropType.STAFF}
        stepNumberOverride={true}
        {...PICTO_FLAGS}
      />
    </div>
  {/each}

  <!-- Seven word rows - each one clickable strip with numbered steps. -->
  {#each ROWS as r (r.key)}
    <div
      class="strip-wrap tka-seq-cell"
      class:is-hovered={selection?.isHovered(r.key)}
      class:is-selected={selection?.isSelected(r.key)}
      style="left:{ROW_X * S}px; top:{r.y * S}px; width:{CELL *
        4 *
        S}px; height:{CELL * S}px"
    >
      {#each RESOLVED[r.key]!.slice(1) as sd, i (i)}
        <div
          class="mini cell"
          class:guide-step-active={activeStep?.key === r.key &&
            activeStep.ringStep === i + 1}
          style="left:{i * CELL * S}px; top:0; width:{CELL *
            S}px; height:{CELL * S}px"
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
        groupId={r.key}
        isGroupStart
        label={`Animate the word ${r.word}`}
        onselect={() =>
          emitSequence?.({
            strip: RESOLVED[r.key]!,
            word: r.word,
            key: r.key,
            propType: "staff",
          })}
      />
    </div>
  {/each}

  <!-- Margin labels: γ→γ PlacementGlyph over the italic qualifier. -->
  {#each MARGINS as m, i (i)}
    <span
      class="margin glyph"
      style="left:{(m.cx - 40) * S}px; top:{m.glyphY * S}px; width:{80 * S}px"
    >
      <svg
        class="pos-glyph"
        viewBox="360 50 230 75"
        role="img"
        aria-label="γ→γ"
        style="height:{16 * S}px"
      >
        <PlacementGlyph
          startPlacement={GridPlacement.GAMMA1}
          endPlacement={GridPlacement.GAMMA1}
        />
      </svg>
    </span>
    <span
      class="margin i"
      style="left:{(m.cx - 40) * S}px; top:{m.modeY * S}px; width:{80 *
        S}px; font-size:{14 * S}px">{m.mode}</span
    >
  {/each}

  <!-- Intro paragraph. -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `gw-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`gw-para-${i}`, "para", p)}
      use:editText={{
        id: `gw-para-${i}`,
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
  .gamma-words {
    position: absolute;
    inset: 0;
    color: #141414;
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

  .para.edit {
    outline: 1px dashed rgba(55, 48, 163, 0.4);
    cursor: move;
  }
  .para.selected {
    outline: 1.5px solid #3730a3;
    outline-offset: 1px;
  }
</style>
