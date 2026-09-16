<script lang="ts">
  /**
   * Type 4 / 5 / 6 - Dash, Dual-Dash, Static - body page 8, a faithful rebuild of
   * the proof PDF ("1.0 - Type 5 and 6" artboard, which actually leads with Type 4)
   * in the CURRENT renderer's language. Same recipe as Type3CrossShiftsPage: proof-
   * placed strips of real PictographContainers, every adornment system-owned (dash
   * arrows, Start/count StepNumber, per-box PlacementGlyph or TKA letter glyph),
   * grouped centred paragraphs.
   *
   * ONE physical page, THREE titled sections (three calligraphic .guide-title
   * headers + two full-width divider rules). The manifest entry is `selfTitled`, so
   * GuidePage does NOT draw its single header - this page paints all three.
   *
   * Motion authoring (both props are HAND):
   *   - dash hand  → DASH (opposite cardinals; straight dash arrow through centre).
   *   - still hand → STATIC (no arrow).
   *   - Count numbers → StepData.stepNumber (0 → "Start", 1..n) via StepNumber.
   *   - Positions (Type 4/5) → startPlacement/endPlacement → top-centre PlacementGlyph.
   *   - Letter (Type 6)     → showTKA → the bottom-left α/β/γ glyph (the teaching
   *                           point IS the static letter; matches the artboard).
   *   - No elemental        → the proof shows no mode badge, so showElemental off.
   *
   * LETTERS carry real MCP-verified values, because the dash-location calculator
   * keys arrow placement off the letter (dash-location-calculator.ts):
   *   - Type 4 (one dash + one static) never collides → letter null; the DEFAULT
   *     zero-turn dash map already matches the artboard (S→N=W, N→S=E, E→W=S, W→E=N).
   *   - Type 5 α→α (Φ-) / β→β (Ψ-) put TWO dashes on the SAME vertical line. letter
   *     null gives both the same location (overlap). Φ-/Ψ- both route through
   *     PHI_DASH_PSI_DASH_MAP → blue side WEST, red side EAST (the artboard's
   *     side-by-side arrows). Letters MCP-verified: Φ-=α→α, Ψ-=β→β. The letter is a
   *     prop-only glyph, never shown for hands (page showTKA off; companion gates it).
   *   - Type 5 γ→γ needs Λ- (LAMBDA_DASH_ZERO_TURNS_MAP): blue S→N→EAST, red E→W→SOUTH
   *     (letter null would wrongly place blue WEST). Verified box-by-box vs the map.
   *   - Type 6 α/β/γ → the canonical Type-6 static letters (showTKA glyph).
   * The position glyph derives from startPlacement/endPlacement (NOT the letter), so a
   * pedagogical α→α labelled Ψ- still shows the correct α→α glyph.
   *
   * Facelift: lowercase γ (proof used Γ); keyword tints - Dash/Dual-Dash green
   * (#2f9e44), Dual cyan (#36c3ff), Cross green + Shift purple (#6f2da8), Static
   * orange (#f08c00). The "two beta / 4-beat" proof OCR is corrected to "two-step /
   * 4-step". Geometry measured off the artboard border grid (4px/pt): Type 4 boxes
   * 100pt, Type 5/6 boxes 95pt. Edit mode (press E) can still nudge + Copy.
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
  const OPP: Partial<Record<GridLocation, GridLocation>> = {
    [N]: SO_,
    [SO_]: N,
    [E]: W,
    [W]: E,
  };

  // Golden step ring: which strip cell the companion is currently animating (null
  // outside the reader - /print + /book render no ring).
  const activeStep = getGuideActiveStep();
  const selection = getSequenceSelection();
  // Reader companion handoff: present ONLY inside GuideReader (null on /print,/book).
  const emitSequence = getGuideSequenceClick();

  // Motion type from the location pair: same → STATIC, opposite cardinals → DASH.
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

  // Positions only derive for cardinal pairs.
  const gp = (a: GridLocation, b: GridLocation) => {
    try {
      return getGridPlacementFromLocations(a, b);
    } catch {
      return null;
    }
  };

  // [leftFrom, leftTo, rightFrom, rightTo]
  type Move = [GridLocation, GridLocation, GridLocation, GridLocation];
  const box = (
    m: Move,
    step: number | null,
    id: string,
    letter: Letter | null = null
  ): StepData =>
    ({
      id,
      letter,
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

  // ── Strips (single-row). tka=Type-6 letter glyph; animate=has a companion hook ──
  type Cell = { m: Move; step: number; letter?: Letter };
  type Strip = {
    key: string;
    x: number;
    y: number;
    box: number;
    cells: Cell[];
    tka: boolean;
    animate: boolean;
    word: string;
  };

  const STRIPS: Strip[] = [
    // Type 4 - Dash. One hand dashes, one static → one arrow, never collides.
    {
      key: "t56-4a",
      x: 156.5,
      y: 98.5,
      box: 100,
      tka: false,
      animate: true,
      word: "α → β",
      cells: [
        { m: [SO_, SO_, SO_, SO_], step: 0 }, // Start: both S (beta)
        { m: [SO_, SO_, SO_, N], step: 1 }, //  β→α  red dash S→N, blue static S
        { m: [SO_, SO_, N, SO_], step: 2 }, //  α→β  red dash N→S, blue static S
      ],
    },
    {
      key: "t56-4b",
      x: 56.5,
      y: 228.5,
      box: 100,
      tka: false,
      animate: true,
      word: "γ → γ",
      cells: [
        { m: [SO_, SO_, E, E], step: 0 }, // Start: blue S, red E (gamma)
        { m: [SO_, N, E, E], step: 1 }, //  blue dash S→N, red static E
        { m: [N, N, E, W], step: 2 }, //    red dash E→W, blue static N
        { m: [N, SO_, W, W], step: 3 }, //  blue dash N→S, red static W
        { m: [SO_, SO_, W, E], step: 4 }, //  red dash W→E, blue static S  (→ Start)
      ],
    },
    // Type 5 - Dual-Dash. Both dash → letters key the arrow separation.
    {
      key: "t56-5a",
      x: 7.5,
      y: 426.3,
      box: 95,
      tka: false,
      animate: true,
      word: "α → α",
      cells: [
        { m: [SO_, SO_, N, N], step: 0 }, // Start: blue S, red N (alpha)
        { m: [SO_, N, N, SO_], step: 1, letter: Letter.PHI_DASH }, // α→α = Φ- (MCP); dash arrows blue W / red E
      ],
    },
    {
      key: "t56-5b",
      x: 213,
      y: 426.3,
      box: 95,
      tka: false,
      animate: true,
      word: "β → β",
      cells: [
        { m: [SO_, SO_, SO_, SO_], step: 0 }, // Start: both S (beta)
        { m: [SO_, N, SO_, N], step: 1, letter: Letter.PSI_DASH }, // β→β = Ψ- (MCP); dash arrows blue W / red E
      ],
    },
    {
      key: "t56-5c",
      x: 415.5,
      y: 426.3,
      box: 95,
      tka: false,
      animate: true,
      word: "γ → γ",
      cells: [
        { m: [SO_, SO_, E, E], step: 0 }, // Start: blue S, red E (gamma)
        { m: [SO_, N, E, W], step: 1, letter: Letter.LAMBDA_DASH }, // blue S→N (E) / red E→W (S)
      ],
    },
    // Type 6 - Static. No hand movement → no arrows; the letter glyph is the point.
    {
      key: "t56-6a",
      x: 7.5,
      y: 662.5,
      box: 95,
      tka: true,
      animate: false,
      word: "α",
      cells: [
        { m: [SO_, SO_, N, N], step: 0, letter: Letter.ALPHA },
        { m: [SO_, SO_, N, N], step: 1, letter: Letter.ALPHA },
      ],
    },
    {
      key: "t56-6b",
      x: 213,
      y: 662.5,
      box: 95,
      tka: true,
      animate: false,
      word: "β",
      cells: [
        { m: [SO_, SO_, SO_, SO_], step: 0, letter: Letter.BETA },
        { m: [SO_, SO_, SO_, SO_], step: 1, letter: Letter.BETA },
      ],
    },
    {
      key: "t56-6c",
      x: 415.5,
      y: 662.5,
      box: 95,
      tka: true,
      animate: false,
      word: "γ",
      cells: [
        { m: [SO_, SO_, E, E], step: 0, letter: Letter.GAMMA },
        { m: [SO_, SO_, E, E], step: 1, letter: Letter.GAMMA },
      ],
    },
  ];

  // Flatten a strip into ordered StepData for the animation companion.
  const stripSteps = (s: Strip): StepData[] =>
    s.cells.map((c, i) => box(c.m, c.step, `seq-${i}`, c.letter ?? null));

  // Override-resolving strip: an admin override (guide-overrides.svelte) replaces
  // the WHOLE strip when present; reversal dots stay derived either way
  // (bakeReversals, never hand-authored). Reactive so a save/revert/reset while
  // the reader is open re-renders these cells without a refresh.
  const resolvedStrip = (s: Strip): StepData[] => {
    const authored = stripSteps(s);
    const override = overrideStepsFor(s.key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(STRIPS.map((s) => [s.key, resolvedStrip(s)]))
  );

  // ── Three calligraphic section titles (reuse the shared .guide-title) ──────────
  type Title = { t: string; y: number };
  const TITLES: Title[] = [
    { t: "Type 4 - Dash", y: 12 }, // matches the global --guide-title-top (12pt)
    { t: "Type 5 - Dual-Dash", y: 340 },
    { t: "Type 6 - Static", y: 592 },
  ];
  // Full-width divider rules between the three sections.
  const RULES = [336, 587];

  // ── Grouped centred paragraphs (proof coords, pt) ─────────────────────────────
  type Para = {
    x: number;
    y: number;
    fs: number;
    lh: number;
    bold?: boolean;
    html: string;
  };
  const DASH = (s: string) => `<span class="k-dash">${s}</span>`;
  const DUAL = (s: string) => `<span class="k-dual">${s}</span>`;
  const CROSS = (s: string) => `<span class="k-cross">${s}</span>`;
  const SHIFT = (s: string) => `<span class="k-shift">${s}</span>`;
  const STATIC = (s: string) => `<span class="k-static">${s}</span>`;
  let PARAS: Para[] = $state([
    {
      // Proof y=53.3/71.3. With the title now riding at 12pt, the strips sit at
      // their measured artboard positions and the intro clears the descenders.
      x: 0,
      y: 64,
      fs: 13,
      lh: 15.5,
      html:
        `With a ${DASH("Dash")}, one hand executes a dash while the other hand remains static.<br>` +
        "With alpha → beta, this creates a two-step sequence:",
    },
    {
      x: 0,
      y: 201,
      fs: 14,
      lh: 17,
      html: "And with gamma → gamma, it creates a 4-step sequence:",
    },
    {
      x: 0,
      y: 395,
      fs: 15,
      lh: 18,
      html: `With a ${DUAL("Dual")}${DASH("-Dash")}, both hands dash simultaneously to their opposite points.`,
    },
    {
      x: 0,
      y: 535,
      fs: 15,
      lh: 18,
      bold: true,
      html:
        `Practice using ${DUAL("Dual")}${DASH("-Dashes")}, ${DASH("Dashes")}, and ${CROSS("Cross")}${SHIFT("-Shifts")}<br>` +
        "from different start positions.",
    },
    {
      x: 0,
      y: 639,
      fs: 15,
      lh: 18,
      html: `Finally, ${STATIC("Static")} motions are indicated by no arrow:`,
    },
    {
      x: 0,
      y: 765,
      fs: 15,
      lh: 18,
      html: "Later on, static sequences gain complexity when adding prop rotations.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Type 4/5/6 (p8)", () =>
      PARAS.map((p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`).join(
        "\n"
      )
    )
  );
</script>

<div class="type456-page">
  <!-- Three section titles (shared calligraphic .guide-title, positioned per proof) -->
  {#each TITLES as ti (ti.t)}
    <div class="guide-title" style="top:{ti.y * S}px">{ti.t}</div>
  {/each}

  <!-- Section divider rules -->
  {#each RULES as ry (ry)}
    <div class="section-rule" style="top:{ry * S}px"></div>
  {/each}

  <!-- Pictograph strips -->
  {#each STRIPS as s (s.key)}
    <div
      class="strip-wrap tka-seq-cell"
      class:is-hovered={selection?.isHovered(s.key)}
      class:is-selected={selection?.isSelected(s.key)}
      style="left:{s.x * S}px; top:{s.y * S}px; width:{s.cells.length *
        s.box *
        S}px; height:{s.box * S}px"
    >
      {#each s.cells as cell, i (i)}
        <div
          class="cell"
          class:guide-step-active={activeStep?.key === s.key &&
            activeStep.ringStep === cell.step}
          style="left:{i * s.box * S}px; top:0; width:{s.box *
            S}px; height:{s.box * S}px"
          title={describePictograph(RESOLVED[s.key]![i]!)}
        >
          <PictographContainer
            pictographData={RESOLVED[s.key]![i]}
            gridMode={GridMode.DIAMOND}
            leftPropTypeOverride={PropType.HAND}
            rightPropTypeOverride={PropType.HAND}
            showGrid={true}
            showTKA={s.tka}
            showPlacements={!s.tka && cell.step > 0}
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
      {/each}
      {#if s.animate}
        <SelectionHit
          groupId={s.key}
          isGroupStart
          label={`Animate the ${s.word} sequence`}
          onselect={() =>
            emitSequence?.({
              strip: RESOLVED[s.key]!,
              word: s.word,
              key: s.key,
            })}
        />
      {/if}
    </div>
  {/each}

  <!-- Grouped centred paragraphs -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:strong={p.bold}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `t456-para-${i}`}
      style="transform: translateX({p.x * S}px); top:{p.y *
        S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`t456-para-${i}`, "paragraph", p)}
      use:editText={{
        id: `t456-para-${i}`,
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
  .type456-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  /* Pictograph boxes - hairline square like the proof. */
  .cell {
    position: absolute;
    border: 1px solid #c4c4cc;
    background: #fff;
    box-sizing: border-box;
    overflow: hidden;
  }

  /* Full-width black divider rules between the three sections. */
  .section-rule {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: #141414;
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
  .para.strong {
    font-weight: 700;
  }
  /* Keyword colour-coding (matches the artboard + prior pages). */
  .para :global(.k-dash),
  .para :global(.k-cross) {
    color: #2f9e44;
    font-weight: 700;
  }
  .para :global(.k-dual) {
    color: #36c3ff;
    font-weight: 700;
  }
  .para :global(.k-shift) {
    color: #6f2da8;
    font-weight: 700;
  }
  .para :global(.k-static) {
    color: #f08c00;
    font-weight: 700;
  }

  /* Edit-mode affordances. */
  .para.edit {
    outline: 1px dashed rgba(55, 48, 163, 0.4);
    cursor: move;
  }
  .para.selected {
    outline: 1.5px solid #3730a3;
    outline-offset: 1px;
  }
</style>
