<script lang="ts">
  /**
   * Gamma Letters - body page (manifest `lt1-mp-nq-or-stuv`, retitled "Gamma
   * Letters"), faithful to proof p25 / "1.1 - Gamma Letters" artboard.
   *
   * The γ→γ letters, all real staff pictographs:
   *   Quarter-Opp grid - M N O (left w→n, right s→e) over P Q R (left n→e,
   *   right e→n) in Iso/Anti/Hybrid columns; MCP-confirmed M/P dual-pro,
   *   N/Q dual-anti, O/R hybrid left-anti + right-pro.
   *   MP / NQ / OR word strips - M chains into P exactly (end left N right E =
   *   P's start) with the proof's phrases (Magic Potion / Never Quit / Open
   *   Road).
   *   Quarter-Same row - S T U V (both hands w→s / s→e, right positionally
   *   LEADING per the proof's "the right is leading"): S dual-pro, T
   *   dual-anti, U = leader pro (right pro, left anti), V = leader anti (right
   *   anti, left pro) - the leader/follower rule (U leads with an isolation,
   *   V with an antispin).
   * Facelift: lowercase γ (the proof's Γ is stale per the tracker convention);
   * follower thumb orientations follow the algebra (anti flips in→out) even
   * where the old artboard drew them loosely.
   *
   * Reader: every grid cell animates Start→letter; word strips animate
   * Start→2 letters (staffs, in orientation).
   *
   * Geometry off the artboard border scan (20px/pt): 90pt cells; QO grid
   * x 172.9, rows y 117.1/207.1; word strips y 363.7 at x 23.3/215.6/409.4
   * (divider bars ~206/403); QS row x 125.7, y 572.5. Text at PROOF_TEXT
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

  // ── Motion authoring (same helpers as the Compound Letters page) ───────────
  const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
  const hpDir = (from: GridLocation, to: GridLocation) =>
    HP_CW.has(`${from}-${to}`) ? CW : CCW;
  type HandSpec = {
    from: GridLocation;
    to: GridLocation;
    anti: boolean;
    so?: Orientation;
  };
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

  type CellDef = {
    letter: Letter;
    name: string;
    left: HandSpec;
    right: HandSpec;
  };
  const cell = (letter: Letter, name: string, left, right): CellDef => ({
    letter,
    name,
    left,
    right,
  });
  const mv = (
    from: GridLocation,
    to: GridLocation,
    anti = false,
    so?: Orientation
  ): HandSpec => ({ from, to, anti, ...(so ? { so } : {}) });

  // ── Quarter-Opp grid (M N O / P Q R) ────────────────────────────────────────
  const QO_ROWS: CellDef[][] = [
    [
      cell(Letter.M, "M", mv(W, N), mv(SO_, E)),
      cell(Letter.N, "N", mv(W, N, true), mv(SO_, E, true)),
      cell(Letter.O, "O", mv(W, N, true), mv(SO_, E)),
    ],
    [
      cell(Letter.P, "P", mv(N, E), mv(E, N)),
      cell(Letter.Q, "Q", mv(N, E, true), mv(E, N, true)),
      cell(Letter.R, "R", mv(N, E, true), mv(E, N)),
    ],
  ];

  // ── Quarter-Same row (S T U V; right positionally leads) ────────────────────
  // U = leader pro (right pro / left anti); V = leader anti (right anti / left pro).
  const QS_ROW: CellDef[] = [
    cell(Letter.S, "S", mv(W, SO_), mv(SO_, E)),
    cell(Letter.T, "T", mv(W, SO_, true), mv(SO_, E, true)),
    cell(Letter.U, "U", mv(W, SO_, true), mv(SO_, E)),
    cell(Letter.V, "V", mv(W, SO_), mv(SO_, E, true)),
  ];

  // ── Word strips: MP / NQ / OR (anti hands continue out→in on step 2) ────────
  type WordDef = { word: string; phrase: string; x: number; steps: CellDef[] };
  const WORDS: WordDef[] = [
    {
      word: "MP",
      phrase: "Magic Potion",
      x: 23.3,
      steps: [
        cell(Letter.M, "M", mv(W, N), mv(SO_, E)),
        cell(Letter.P, "P", mv(N, E), mv(E, N)),
      ],
    },
    {
      word: "NQ",
      phrase: "Never Quit",
      x: 215.6,
      steps: [
        cell(Letter.N, "N", mv(W, N, true), mv(SO_, E, true)),
        cell(Letter.Q, "Q", mv(N, E, true, OUT), mv(E, N, true, OUT)),
      ],
    },
    {
      word: "OR",
      phrase: "Open Road",
      x: 409.4,
      steps: [
        cell(Letter.O, "O", mv(W, N, true), mv(SO_, E)),
        cell(Letter.R, "R", mv(N, E, true, OUT), mv(E, N)),
      ],
    },
  ];

  const cellStep = (
    c: CellDef,
    key: string,
    stepNumber: number | null
  ): StepData =>
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
      id: `gl-start-${c.left.from}-${c.right.from}`,
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

  const cellSteps = (c: CellDef, key: string): StepData[] => [
    startFor(c),
    cellStep(c, `${key}-s`, 1),
  ];
  const wordKey = (w: WordDef) => `gl-word-${w.word}`;
  const wordSteps = (w: WordDef): StepData[] => [
    startFor(w.steps[0]!),
    ...w.steps.map((c, i) => cellStep(c, `${wordKey(w)}-s`, i + 1)),
  ];

  // ── Override resolution (admin edits replace the WHOLE strip when present;
  // reversal dots stay derived via bakeReversals either way). Reactive so a
  // save/revert/reset while the reader is open re-renders these cells. One
  // shared resolver per source function - Quarter-Opp cells, MP/NQ/OR words,
  // and Quarter-Same cells all key off `gl-${c.name}` / `gl-word-${word}`.
  const ALL_CELLS: CellDef[] = [...QO_ROWS.flat(), ...QS_ROW];
  const resolvedCellSteps = (c: CellDef, key: string): StepData[] => {
    const authored = cellSteps(c, key);
    const override = overrideStepsFor(key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const CELL_RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(
      ALL_CELLS.map((c) => [
        `gl-${c.name}`,
        resolvedCellSteps(c, `gl-${c.name}`),
      ])
    )
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
  const QO = { x: 172.9, rows: [117.1, 207.1] };
  const WORD_Y = 363.7;
  const WORD_DIVIDERS = [206.3, 402.9];
  const QS = { x: 125.7, y: 572.5 };
  const HEAVY_RULE = 488;

  const SUBS = ["Iso", "Anti", "Hybrid"];
  const SUB_CENTERS = [217.9, 307.9, 397.9];
  const SUB_Y = 100;

  // Margin labels (γ→γ over the italic mode qualifier).
  const MARGINS = [
    { t: "γ→γ", mode: "(Opp)", glyphY: 144, modeY: 165, cx: 138 },
    { t: "γ→γ", mode: "(Same)", glyphY: 600, modeY: 621, cx: 88 },
  ];

  // ── Text at proof coords (Γ→γ per the facelift convention) ─────────────────
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
      // Proof y 49.7 collides with the Tangerine title's descenders - nudged.
      x: 0,
      y: 58,
      fs: 15,
      lh: 18,
      html:
        "γ→γ motions can combine with any other γ→γ motion to create lots of words!<br>" +
        "First let’s look at the compound letters (<em>Quarter-Opp</em>).",
    },
    {
      x: 0,
      y: 313.3,
      fs: 15,
      lh: 18,
      html:
        "When combined as a continuous motion, these form MP, NQ, and OR.<br>" +
        "Here they are along with a memorable phrase:",
    },
    {
      x: 0,
      y: 502.9,
      fs: 15,
      lh: 18,
      html:
        "The final γ→γ group (<em>Quarter-Same</em>) has 4 instead of 3.<br>" +
        "It may seem like U and V contain the same information, but it’s impossible to rotate or<br>" +
        "reflect U in order to turn it into V, and vice-versa, so they must be disambiguated.",
    },
    {
      x: 0,
      y: 675.7,
      fs: 16,
      lh: 19.2,
      html:
        "Note that all four have a <em>leading</em> hand and a <em>following</em> hand.<br>" +
        'Here, the <strong class="cR">right</strong> is leading and <strong class="cB">left</strong> is following, but it’s equally valid to swap this.<br>' +
        "<strong><em>U leads with an isolation</em></strong> (a round motion like the letter U).<br>" +
        "<strong><em>V leads with an antispin</em></strong> (a spiky motion like the letter V).<br>" +
        "These self-combine to form the words SS, TT, UU, and VV.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Gamma Letters (lt1-mp-nq-or-stuv)", () =>
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

<div class="gamma-letters">
  <!-- Iso/Anti/Hybrid column labels over the Quarter-Opp grid. -->
  {#each SUB_CENTERS as cx, i (cx)}
    <span
      class="sub"
      style="left:{(cx - 30) * S}px; top:{SUB_Y * S}px; width:{60 *
        S}px; font-size:{13 * S}px">{SUBS[i]}</span
    >
  {/each}

  <!-- Quarter-Opp grid (each cell clickable). -->
  {#each QO_ROWS as row, ri (ri)}
    {#each row as c, ci (ci)}
      {@const key = `gl-${c.name}`}
      <div
        class="mini tka-seq-cell"
        class:is-hovered={selection?.isHovered(key)}
        class:is-selected={selection?.isSelected(key)}
        class:guide-step-active={activeStep?.key === key}
        style="left:{(QO.x + ci * CELL) * S}px; top:{QO.rows[ri]! *
          S}px; width:{CELL * S}px; height:{CELL * S}px"
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
          label={`Animate letter ${c.name}`}
          onselect={() =>
            emitSequence?.({
              strip: CELL_RESOLVED[key]!,
              word: `Letter ${c.name}`,
              key,
              propType: "staff",
            })}
        />
      </div>
    {/each}
  {/each}

  <!-- MP / NQ / OR word strips with divider bars. -->
  {#each WORD_DIVIDERS as dx (dx)}
    <div
      class="vdivider"
      style="left:{dx * S}px; top:{(WORD_Y + 4) * S}px; height:{(CELL - 8) *
        S}px"
    ></div>
  {/each}
  {#each WORDS as w (w.word)}
    {@const key = wordKey(w)}
    <div
      class="strip-wrap tka-seq-cell"
      class:is-hovered={selection?.isHovered(key)}
      class:is-selected={selection?.isSelected(key)}
      style="left:{w.x * S}px; top:{WORD_Y * S}px; width:{CELL *
        2 *
        S}px; height:{CELL * S}px"
    >
      {#each WORD_RESOLVED[key]!.slice(1) as sd, i (i)}
        <div
          class="mini cell"
          class:guide-step-active={activeStep?.key === key &&
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
        groupId={key}
        isGroupStart
        label={`Animate the word ${w.word}`}
        onselect={() =>
          emitSequence?.({
            strip: WORD_RESOLVED[key]!,
            word: w.word,
            key,
            propType: "staff",
          })}
      />
    </div>
    <p
      class="caption"
      style="left:{w.x * S}px; top:{462.5 * S}px; width:{CELL *
        2 *
        S}px; font-size:{16 * S}px"
    >
      <span class="tka-font">{w.word}</span> - <em>{w.phrase}</em>
    </p>
  {/each}

  <!-- Heavy rule before the Quarter-Same group. -->
  <div
    class="rule"
    style="left:{20 * S}px; top:{HEAVY_RULE * S}px; width:{572 * S}px"
  ></div>

  <!-- Quarter-Same row (S T U V). -->
  {#each QS_ROW as c, ci (ci)}
    {@const key = `gl-${c.name}`}
    <div
      class="mini tka-seq-cell"
      class:is-hovered={selection?.isHovered(key)}
      class:is-selected={selection?.isSelected(key)}
      class:guide-step-active={activeStep?.key === key}
      style="left:{(QS.x + ci * CELL) * S}px; top:{QS.y * S}px; width:{CELL *
        S}px; height:{CELL * S}px"
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
        label={`Animate letter ${c.name}`}
        onselect={() =>
          emitSequence?.({
            strip: CELL_RESOLVED[key]!,
            word: `Letter ${c.name}`,
            key,
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
        aria-label={m.t}
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

  <!-- Centred paragraphs (proof coords). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:bold={p.bold}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `gl-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`gl-para-${i}`, "para", p)}
      use:editText={{
        id: `gl-para-${i}`,
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
  .gamma-letters {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .sub {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-style: italic;
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }

  .rule {
    position: absolute;
    height: 2.5px;
    background: #141414;
  }

  .vdivider {
    position: absolute;
    width: 3px;
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
