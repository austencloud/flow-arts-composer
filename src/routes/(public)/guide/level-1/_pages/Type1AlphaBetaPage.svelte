<script lang="ts">
  /**
   * Type 1 Dual-Shifts (Alpha, Beta) - body page 4, a faithful reproduction of
   * the proof PDF (level-1-v05.pdf, page 10) rebuilt in the CURRENT renderer's
   * own language. Nothing on the pictographs is hand-drawn - every adornment is
   * the system's:
   *
   *   - Hand motion   → real FLOAT motions (Level 1's base motion), so the
   *                     arrow pipeline places the system's float arrows.
   *   - Count numbers → StepData.stepNumber (0 renders "Start", 1–4 numerals)
   *                     via the renderer's top-left StepNumber overlay.
   *   - Positions     → startPlacement/endPlacement (getGridPlacementFromLocations)
   *                     rendered by the top-centre PlacementGlyph (α→β etc.).
   *   - Mode          → bottom-right ElementalGlyph, derived by the renderer
   *                     from the four hand locations (deriveTnDFromPictograph).
   *
   * Strip geometry comes from the proof's own image placements (extracted from
   * the PDF operator list): 500×100pt strips of five 100pt boxes at
   * (95.3, 142.8) / (95.3, 262.0) / (92.6, 472.0) / (92.6, 588.3).
   *
   * Text renders as GROUPED centred blocks (one box per paragraph, like the
   * original PDF), not per-line runs; the left row labels (α→α / Split-Same …)
   * stay individual runs at the proof's coordinates. Content confirmed against
   * MCP VTG data: α→α = Split-Same, β→β = Tog-Same, α↔β = Split-Opp from a
   * side-point start / Tog-Opp from a bottom start.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import PlacementGlyph from "$lib/shared/pictograph/shared/components/PlacementGlyph.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
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

  // ── Box data: real pictographs, system-derived adornments ──────────────────
  // A hand that moves is authored as a PRO shift; because both props are HAND,
  // PictographPreparer's hand-path mode converts it to a FLOAT ("fl", handPath
  // derived from the locations) and the arrow pipeline renders the system float
  // arrow along the path - the same route the app itself takes for hand
  // pictographs. A hand that stays is STATIC (no arrow). Positions derive from
  // the location pairs, the elemental from the motions, numbers from stepNumber.
  const motion = (color: HandSide, from: GridLocation, to: GridLocation) =>
    createMotionData({
      motionType: from === to ? MotionType.STATIC : MotionType.PRO,
      startLocation: from,
      endLocation: to,
      color,
      propType: PropType.HAND,
      gridMode: GridMode.DIAMOND,
    });

  // [leftFrom, leftTo, rightFrom, rightTo]; start boxes hold (from === to).
  // The letter keys the special-placement tier - G's per-color "(fl, fl)"
  // adjustments are what separate the Tog rows' same-path float arrows.
  // MCP-confirmed: A = α→α, G = β→β, D = β→α, J = α→β (all Type 1 dual-pro).
  type Move = [GridLocation, GridLocation, GridLocation, GridLocation];
  const box = (m: Move, stepNumber: number, letter: Letter | null): StepData =>
    ({
      id: `t1ab-${stepNumber}-${m.join("-")}`,
      letter,
      gridMode: GridMode.DIAMOND,
      startPlacement: getGridPlacementFromLocations(m[0], m[2]),
      endPlacement: getGridPlacementFromLocations(m[1], m[3]),
      motions: {
        left: motion(HandSide.LEFT, m[0], m[1]),
        right: motion(HandSide.RIGHT, m[2], m[3]),
      },
      stepNumber,
      duration: 1,
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
    }) as unknown as StepData;

  // ── Strip geometry from the proof's image placements (pt) ──────────────────
  const BOX = 100;
  type Strip = {
    x: number;
    y: number;
    moves: Move[];
    letters: (Letter | null)[];
  };

  // Each row = Start + a four-count loop, read straight off the proof page.
  const STRIPS: Strip[] = [
    // Split-Same: α→α (letter A), both hands clockwise.
    {
      x: 95.3,
      y: 142.8,
      letters: [null, Letter.A, Letter.A, Letter.A, Letter.A],
      moves: [
        [SO_, SO_, N, N],
        [SO_, W, N, E],
        [W, N, E, SO_],
        [N, E, SO_, W],
        [E, SO_, W, N],
      ],
    },
    // Tog-Same: β→β (letter G), both hands clockwise together.
    {
      x: 95.3,
      y: 262.0,
      letters: [null, Letter.G, Letter.G, Letter.G, Letter.G],
      moves: [
        [SO_, SO_, SO_, SO_],
        [SO_, W, SO_, W],
        [W, N, W, N],
        [N, E, N, E],
        [E, SO_, E, SO_],
      ],
    },
    // Split-Opp: side-point start (β at W); β→α = D, α→β = J.
    {
      x: 92.6,
      y: 472.0,
      letters: [null, Letter.D, Letter.J, Letter.D, Letter.J],
      moves: [
        [W, W, W, W],
        [W, N, W, SO_],
        [N, E, SO_, E],
        [E, SO_, E, N],
        [SO_, W, N, W],
      ],
    },
    // Tog-Opp: bottom start (β at S), the same shape a quarter-turn around.
    {
      x: 92.6,
      y: 588.3,
      letters: [null, Letter.D, Letter.J, Letter.D, Letter.J],
      moves: [
        [SO_, SO_, SO_, SO_],
        [SO_, W, SO_, E],
        [W, N, E, N],
        [N, E, N, W],
        [E, SO_, W, SO_],
      ],
    },
  ];

  // ── Text: grouped centred blocks (one draggable box per paragraph) ─────────
  // Content = the proof's own runs, regrouped the way the original PDF set
  // them: centred paragraphs, inline bold/italic. x is a horizontal offset from
  // centred (0 = centred, as authored); y/fs/lh in pt (lh = the proof's 16.8pt
  // line pitch on 14pt body).
  type Para = { x: number; y: number; fs: number; lh: number; html: string };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 68.5,
      fs: 14,
      lh: 16.8,
      html:
        'When both hands move to adjacent locations, it’s called a <span class="cy">Dual</span><span class="pu">-Shift</span>.<br>' +
        'Our first <span class="cy">Dual</span><span class="pu">-Shifts</span> correspond to the four modes of time/direction: SS, TS, SO, TO.<br>' +
        "You can determine the start position by looking at the non-pointed end of the arrow.",
    },
    {
      x: 0,
      y: 383.6,
      fs: 14,
      lh: 16.8,
      html:
        "The Kinetic Alphabet puts focus on simultaneous motions between<br>" +
        "two positions, relative to the center point.<br>" +
        'Let’s try another type of <span class="cy">Dual</span><span class="pu">-Shift</span>.<br>' +
        "What happens when we move between α and β?",
    },
    {
      x: 0,
      y: 712.9,
      fs: 14,
      lh: 16.8,
      html: "Notice that it can be either <em>Split-Opp</em> or <em>Tog-Opp</em> depending on start position.",
    },
    {
      x: 0,
      y: 746.5,
      fs: 14,
      lh: 16.8,
      html: '<strong>Practice using <span class="cy">Dual</span><span class="pu">-Shifts</span> to travel between Alpha and Beta in each mode.</strong>',
    },
  ]);

  // Left row labels at the proof's own coordinates: the α→α / β→β glyph lines
  // (dropped by the text extraction - glyph font) over the italic mode names.
  // `pos` renders the real TKA start→end PlacementGlyph instead of Greek text.
  type Label = {
    x: number;
    y: number;
    w: number;
    fs: number;
    t: string;
    i?: boolean;
    pos?: { start: GridPlacement; end: GridPlacement };
  };
  let LABELS: Label[] = $state([
    {
      x: 12.7,
      y: 168.5,
      w: 70.6,
      fs: 18,
      t: "α→α",
      pos: { start: GridPlacement.ALPHA1, end: GridPlacement.ALPHA1 },
    },
    { x: 12.7, y: 190.2, w: 70.6, fs: 16, i: true, t: "Split-Same" },
    {
      x: 15.3,
      y: 286.5,
      w: 65.4,
      fs: 18,
      t: "β→β",
      pos: { start: GridPlacement.BETA1, end: GridPlacement.BETA1 },
    },
    { x: 15.3, y: 308.2, w: 65.4, fs: 16, i: true, t: "Tog-Same" },
    { x: 19.4, y: 511.6, w: 61.7, fs: 16, i: true, t: "Split-Opp" },
    { x: 21.4, y: 627.9, w: 56.5, fs: 16, i: true, t: "Tog-Opp" },
  ]);

  // Reader companion handoff: present ONLY inside GuideReader (null on /print,
  // /book), so the printable pages stay pristine and gain no click affordance.
  const emitSequence = getGuideSequenceClick();
  const SEQ_WORDS = [
    "α→α Split-Same",
    "β→β Tog-Same",
    "α↔β Split-Opp",
    "α↔β Tog-Opp",
  ];
  const authoredStripSteps = (strip: Strip): StepData[] =>
    strip.moves.map((m, i) => box(m, i, strip.letters[i] ?? null));

  // Admin override (guide-overrides.svelte) replaces the WHOLE strip when
  // present, resolved before baking - reversal dots stay derived either way.
  // Reactive ($derived) so a save/revert/reset re-renders without a refresh.
  const resolvedStripSteps = (strip: Strip, key: string): StepData[] => {
    const authored = authoredStripSteps(strip);
    const override = overrideStepsFor(key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(
      STRIPS.map((strip, si) => [
        `t1-${si}`,
        resolvedStripSteps(strip, `t1-${si}`),
      ])
    )
  );
  const stripSteps = (strip: Strip, key: string): StepData[] => RESOLVED[key]!;

  // Edit mode: dump paragraph + label coords for CoordsPanel's Copy button.
  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Type 1 α/β (p4)", () => {
      const P = PARAS.map(
        (p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`
      ).join("\n");
      const L = LABELS.map(
        (l) => `  ${JSON.stringify(l.t)}: x: ${r1(l.x)}, y: ${r1(l.y)}`
      ).join("\n");
      return `PARAS\n${P}\n\nLABELS\n${L}`;
    })
  );
</script>

<div class="type1-page">
  <!-- Four strips of five real pictographs. All adornments (float arrows, Start/
       count numerals, position glyphs, elementals) are renderer-owned. -->
  {#each STRIPS as strip, si (si)}
    <div
      class="strip tka-seq-cell"
      class:is-hovered={selection?.isHovered(`t1-${si}`)}
      class:is-selected={selection?.isSelected(`t1-${si}`)}
      style="left:{strip.x * S}px; top:{strip.y * S}px; width:{BOX *
        5 *
        S}px; height:{BOX * S}px"
    >
      {#each strip.moves as m, bi (bi)}
        <div
          class="cell"
          class:guide-step-active={activeStep?.key === `t1-${si}` &&
            activeStep.ringStep === bi}
        >
          <PictographContainer
            pictographData={RESOLVED[`t1-${si}`]![bi]}
            gridMode={GridMode.DIAMOND}
            leftPropTypeOverride={PropType.HAND}
            rightPropTypeOverride={PropType.HAND}
            showGrid={true}
            showTKA={false}
            showPlacements={bi > 0}
            showElemental={bi > 0}
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
      {/each}
      <SelectionHit
        groupId={`t1-${si}`}
        isGroupStart
        label={`Animate the ${SEQ_WORDS[si]} sequence`}
        onselect={() =>
          emitSequence?.({
            strip: stripSteps(strip, `t1-${si}`),
            word: SEQ_WORDS[si],
            key: `t1-${si}`,
          })}
      />
    </div>
  {/each}

  <!-- Grouped centred paragraphs (one box each, like the original PDF). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `t1-para-${i}`}
      style="transform: translateX({p.x * S}px); top:{p.y *
        S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`t1-para-${i}`, "paragraph", p)}
      use:editText={{
        id: `t1-para-${i}`,
        label: "paragraph",
        get: () => p.html,
        set: (h) => (p.html = h),
      }}
    >
      {@html p.html}
    </p>
  {/each}

  <!-- Left row labels: the α→α / β→β lines render the real TKA PlacementGlyph;
       the italic mode names stay as text. -->
  {#each LABELS as l, i (i)}
    <span
      class="label"
      class:i={l.i}
      class:glyph={l.pos}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `t1-label-${i}`}
      style="left:{l.x * S}px; top:{l.y * S}px; width:{l.w *
        S}px; font-size:{l.fs * S}px"
      use:ptDrag={pt(`t1-label-${i}`, l.t, l)}
    >
      {#if l.pos}
        <svg
          class="pos-glyph"
          viewBox="360 50 230 75"
          role="img"
          aria-label={l.t}
          style="height:{l.fs * S}px"
        >
          <PlacementGlyph startPlacement={l.pos.start} endPlacement={l.pos.end} />
        </svg>
      {:else}{l.t}{/if}
    </span>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .type1-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  /* One strip = five abutting square cells sharing hairline dividers. */
  .strip {
    position: absolute;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    border: 1px solid #c4c4cc;
    background: #fff;
  }
  .cell {
    position: relative;
    overflow: hidden;
  }
  .cell + .cell {
    border-left: 1px solid #c4c4cc;
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
  /* Two-tone Type-1 colour code for "Dual-Shift" (matches the original guide):
     Dual = cyan, -Shift = purple (Type-1 letter colours). Colour-coded terms are
     always bold. */
  .para :global(.cy) {
    color: #36c3ff;
    font-weight: 700;
  }
  .para :global(.pu) {
    color: #6f2da8;
    font-weight: 700;
  }

  /* Left row labels - bold glyph line over italic mode name, centred in their
     own column like the proof. */
  .label {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }
  .label.i {
    font-weight: 400;
    font-style: italic;
  }
  /* α→α / β→β render as the real TKA PlacementGlyph SVG, centred in the column. */
  .label.glyph {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pos-glyph {
    width: auto;
    display: block;
    overflow: visible;
  }

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
