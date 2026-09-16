<script lang="ts">
  /**
   * Type 3 - Cross-Shift - Level 2 body page 8 (manifest `t3-cross-shift`),
   * faithful to old p9. Type 3 hybrids combine a shift and a dash; PADS puts
   * the shift high and the dash low. Three breakdown strips (all from Z- variation
   * [7]: blue s→n dash, red e→n anti cw - MCP-verified):
   *
   *   Z-¹   "Z-Dash High-One"      - 1 turn on the shift (red).
   *   Ż-₁   "Z-Dash Same Low-One"  - 1 turn on the dash (blue) spinning the SAME
   *                                  sense as the shift (cw) → dot ABOVE.
   *   Ẓ-₁   "Z-Dash Opp Low-One"   - 1 turn on the dash spinning OPPOSITE (ccw) → dot BELOW.
   *
   * The dash passes through the grid center, so the halfway frame lands on the
   * "centric" position the page teaches. Halfway poses come from the engine
   * interpolator (dash forced linear). High glyph = red, low = blue.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
    Orientation,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { GridMode, GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { halfwayPose, type HalfwayMotion } from "../_data/halfway-pose";

  const S = 816 / 612;
  const { NORTH: N, EAST: E, SOUTH: SO_ } = GridLocation;
  const { IN, OUT } = Orientation;
  const CW = RotationDirection.CLOCKWISE;
  const CCW = RotationDirection.COUNTER_CLOCKWISE;
  const NOROT = RotationDirection.NO_ROTATION;
  const B = HandSide.LEFT;
  const R = HandSide.RIGHT;

  const STAFF_D =
    "M251.4 67.7V10.1c0-4.8-4.1-8.7-9.1-8.7s-9.1 3.9-9.1 8.7v19.2H10.3c-4.9 0-8.9 3.8-8.9 8.5V41c0 4.6 4 8.5 8.9 8.5h222.9v18.2c0 4.8 4.1 8.7 9.1 8.7s9.1-3.9 9.1-8.7z";
  const RED_FILL = "#DC2626";
  const BLUE_FILL = "#2E3192";

  const mo = (
    color: HandSide,
    type: MotionType,
    from: GridLocation,
    to: GridLocation,
    rot: RotationDirection,
    so: Orientation,
    eo: Orientation,
    turns = 0
  ) =>
    createMotionData({
      motionType: type,
      rotationDirection: rot,
      startLocation: from,
      endLocation: to,
      startOrientation: so,
      endOrientation: eo,
      turns,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  const pic = (id: string, left, right) => ({
    id: `l2t3-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { left, right },
  });
  const stat = (color: HandSide, loc: GridLocation, ori: Orientation) =>
    mo(color, MotionType.STATIC, loc, loc, NOROT, ori, ori);

  type Hand = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection; turns: number };
  type Strip = {
    y: number;
    labelLines: string[];
    labelY: number;
    supPos: "hi" | "lo";
    supColor: string;
    dot: "same" | "opp" | null;
    captions: boolean;
    start: ReturnType<typeof pic>;
    end: ReturnType<typeof pic>;
    combined: ReturnType<typeof pic>;
    halfway: { motion: HalfwayMotion; color: HandSide }[];
  };

  const half = (h: Hand): number => (h.type === MotionType.ANTI || h.type === MotionType.DASH ? 1 : 0) + h.turns;
  const endOf = (h: Hand): Orientation => (half(h) % 2 === 0 ? IN : OUT);

  function makeStrip(opts: {
    y: number;
    labelLines: string[];
    labelY: number;
    supPos: "hi" | "lo";
    dot: "same" | "opp" | null;
    captions: boolean;
    left: Hand;
    right: Hand;
  }): Strip {
    const bEnd = endOf(opts.left);
    const rEnd = endOf(opts.right);
    const hm = (h: Hand, eo: Orientation): HalfwayMotion => ({
      type: h.type,
      from: h.from,
      to: h.to,
      rot: h.rot,
      startOri: IN,
      endOri: eo,
      turns: h.turns,
    });
    return {
      y: opts.y,
      labelLines: opts.labelLines,
      labelY: opts.labelY,
      supPos: opts.supPos,
      supColor: opts.supPos === "hi" ? RED_FILL : BLUE_FILL,
      dot: opts.dot,
      captions: opts.captions,
      start: pic("start", stat(B, opts.left.from, IN), stat(R, opts.right.from, IN)),
      end: pic("end", stat(B, opts.left.to, bEnd), stat(R, opts.right.to, rEnd)),
      combined: pic(
        "full",
        mo(B, opts.left.type, opts.left.from, opts.left.to, opts.left.rot, IN, bEnd, opts.left.turns),
        mo(R, opts.right.type, opts.right.from, opts.right.to, opts.right.rot, IN, rEnd, opts.right.turns)
      ),
      halfway: [
        { motion: hm(opts.left, bEnd), color: B },
        { motion: hm(opts.right, rEnd), color: R },
      ],
    };
  }

  // Z- = dash(blue s→n) + anti shift(red e→n cw), variation [7].
  const DASH_BLUE = (turns: number, rot: RotationDirection): Hand => ({ type: MotionType.DASH, from: SO_, to: N, rot, turns });
  const SHIFT_RED = (turns: number): Hand => ({ type: MotionType.ANTI, from: E, to: N, rot: CW, turns });

  const STRIPS: Strip[] = [
    makeStrip({ y: 266, labelLines: ["“Z-Dash", "High-One”"], labelY: 260, supPos: "hi", dot: null, captions: true, left: DASH_BLUE(0, NOROT), right: SHIFT_RED(1) }),
    makeStrip({ y: 510, labelLines: ["“Z-Dash", "Same", "Low-One”"], labelY: 506, supPos: "lo", dot: "same", captions: true, left: DASH_BLUE(1, CW), right: SHIFT_RED(0) }),
    makeStrip({ y: 613, labelLines: ["“Z-Dash", "Opp", "Low-One”"], labelY: 614, supPos: "lo", dot: "opp", captions: false, left: DASH_BLUE(1, CCW), right: SHIFT_RED(0) }),
  ];

  // ── Layout (pt) ─────────────────────────────────────────────────────────────
  const START_X = 152;
  const HALF_X = 252;
  const END_X = 351;
  const COMB_X = 452;
  const SIZE = 78;
  const LETTER_CX = 116; // "Z-" row-letter center (pt), for the same/opp dot
  const COMB_CX = COMB_X + SIZE / 2;
  const rowMid = (y: number) => y + SIZE / 2;

  const PICTO_FLAGS = {
    showGrid: true,
    showTKA: false,
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

  const ARROW_W = 14.5;

  const poses = (strip: Strip) =>
    strip.halfway.map((h) => ({ ...halfwayPose(h.motion, h.color), fill: h.color === HandSide.LEFT ? BLUE_FILL : RED_FILL }));
</script>

<div class="t3-page">
  <!-- Intro. -->
  <p class="para" style="top:{54 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Type 3 hybrids combine a shift with a dash.<br />
    When we consult PADS, we find that a shift is higher than a dash, therefore:
  </p>

  <!-- Slot rule + big Z- (shift|dash). -->
  <p class="para bold" style="top:{99 * S}px; right:{142 * S}px; font-size:{20 * S}px; line-height:{24 * S}px">
    For Type 3,<br />high = shift and low = dash.
  </p>
  <p class="para" style="top:{165 * S}px; right:{142 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    This includes W-, X-, Y-, Z-, <span class="tka">Σ</span>-, <span class="tka">Δ</span>-, <span class="tka">Θ</span>-, and <span class="tka">Ω</span>-.
  </p>
  <div class="big-letter" style="left:{430 * S}px; top:{112 * S}px">Z-</div>
  <span class="cs hi" style="left:{489 * S}px; top:{112 * S}px">Shift</span>
  <span class="cs lo" style="left:{489 * S}px; top:{160 * S}px">Dash</span>

  <p class="para" style="top:{199 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    First, we’ll add 1 high turn to Z-, which only affects the shift.
  </p>

  <!-- Halfway-position teaching. -->
  <p class="para bold-italic" style="top:{348 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    Take note of this strange position at the halfway point.
  </p>
  <p class="para" style="top:{370 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    There is a hand-to-end relationship between the <strong style="color:#2342c9">left</strong> hand and the <strong style="color:#c01b1b">right</strong> staff’s pinky end.<br />
    It is important to pass through this position for the timing to be accurate.
  </p>

  <!-- Same/Opp lead-in. -->
  <p class="para" style="top:{428 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    Now let’s add 1 turn to the dash, leaving the shifting hand unmodified.<br />
    This creates a rotational relationship, so we’ll need to use Same-dots and Opp-dots.
  </p>

  <!-- Closing. -->
  <p class="para bold-italic" style="top:{695 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    The halfway position holds the key for executing cross-shifts with accurate timing.
  </p>
  <p class="para" style="top:{717 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    Though unfamiliar now, these centric positions will be thoroughly deconstructed later on.
  </p>

  <!-- Footnote. -->
  <div class="rule footnote" style="left:0; top:{752.1 * S}px; width:{612 * S}px"></div>
  <p class="para italic" style="top:{758 * S}px; font-size:{14.5 * S}px; line-height:{18 * S}px">
    When writing code, put the dash after the letter and before the parentheses. “E.g. Z-(s,0,1)”
  </p>

  <!-- Group separators. -->
  <div class="rule heavy" style="left:0; top:{414.6 * S}px; width:{612 * S}px"></div>
  <div class="rule thin" style="left:{88 * S}px; top:{596 * S}px; width:{436 * S}px"></div>

  <!-- Three breakdown strips. -->
  {#each STRIPS as strip, si (si)}
    {@const hp = poses(strip)}
    <div class="row-letter" style="left:{92 * S}px; top:{(strip.y + 4) * S}px">
      Z-<span class="sup {strip.supPos}" style="color:{strip.supColor}">1</span>
    </div>
    {#if strip.dot === "same"}
      <span class="dir-dot" style="left:{LETTER_CX * S}px; top:{(strip.y - 2) * S}px"></span>
    {:else if strip.dot === "opp"}
      <span class="dir-dot" style="left:{LETTER_CX * S}px; top:{(strip.y + 44) * S}px"></span>
    {/if}
    {#each strip.labelLines as line, li (li)}
      <div class="row-sub" style="left:{16 * S}px; top:{(strip.labelY + li * 13) * S}px; width:{92 * S}px">{line}</div>
    {/each}

    <!-- Captions. -->
    {#if strip.captions}
      <span class="cap" style="left:{150 * S}px; top:{(strip.y - 32) * S}px">thumbs:</span>
      <span class="frame-cap" style="left:{START_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">start</span>
      <span class="frame-cap" style="left:{HALF_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">halfway</span>
      <span class="frame-cap" style="left:{END_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">end</span>
      <span class="thumb-cap" style="left:{START_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">in</span>
      <span class="thumb-cap" style="left:{END_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">mixed</span>
    {:else}
      <span class="thumb-cap" style="left:{START_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">in</span>
      <span class="thumb-cap" style="left:{END_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">out</span>
    {/if}

    <!-- start -->
    <div class="mini" style="left:{START_X * S}px; top:{strip.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
      <PictographContainer pictographData={strip.start} gridMode={GridMode.DIAMOND} leftPropTypeOverride={PropType.STAFF} rightPropTypeOverride={PropType.STAFF} {...PICTO_FLAGS} />
    </div>
    <!-- halfway -->
    <div class="mini" style="left:{HALF_X * S}px; top:{strip.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
      <svg class="halfway-staff" viewBox="0 0 950 950" aria-hidden="true">
        {#each hp as p (p.fill)}
          <g transform="translate({p.cx}, {p.cy}) rotate({p.deg}) translate(-126.4, -38.9)">
            <path d={STAFF_D} fill={p.fill} />
          </g>
        {/each}
      </svg>
    </div>
    <!-- end -->
    <div class="mini" style="left:{END_X * S}px; top:{strip.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
      <PictographContainer pictographData={strip.end} gridMode={GridMode.DIAMOND} leftPropTypeOverride={PropType.STAFF} rightPropTypeOverride={PropType.STAFF} {...PICTO_FLAGS} />
    </div>
    <!-- combined -->
    <div class="mini" style="left:{COMB_X * S}px; top:{strip.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
      <PictographContainer pictographData={strip.combined} gridMode={GridMode.DIAMOND} leftPropTypeOverride={PropType.STAFF} rightPropTypeOverride={PropType.STAFF} {...PICTO_FLAGS} />
    </div>
    <div class="comb-label" style="left:{COMB_X * S}px; top:{(strip.y + SIZE - 10) * S}px; width:{SIZE * S}px">
      Z-<span class="sup {strip.supPos}" style="color:{strip.supColor}">1</span>
    </div>
    {#if strip.dot === "same"}
      <span class="dir-dot" style="left:{COMB_CX * S}px; top:{(strip.y + SIZE - 18) * S}px"></span>
    {:else if strip.dot === "opp"}
      <span class="dir-dot" style="left:{COMB_CX * S}px; top:{(strip.y + SIZE + 6) * S}px"></span>
    {/if}

    <!-- flow arrows + "=" -->
    <svg class="flow-arrow" style="left:{(HALF_X - 22) * S}px; top:{(rowMid(strip.y) - 5) * S}px; width:{ARROW_W * S}px; height:{10 * S}px" viewBox="0 0 {ARROW_W} 10" aria-hidden="true">
      <line x1="0" y1="5" x2={ARROW_W - 7} y2="5" stroke="#141414" stroke-width="2" /><polygon points="{ARROW_W - 8},1.3 {ARROW_W},5 {ARROW_W - 8},8.7" fill="#141414" />
    </svg>
    <svg class="flow-arrow" style="left:{(END_X - 22) * S}px; top:{(rowMid(strip.y) - 5) * S}px; width:{ARROW_W * S}px; height:{10 * S}px" viewBox="0 0 {ARROW_W} 10" aria-hidden="true">
      <line x1="0" y1="5" x2={ARROW_W - 7} y2="5" stroke="#141414" stroke-width="2" /><polygon points="{ARROW_W - 8},1.3 {ARROW_W},5 {ARROW_W - 8},8.7" fill="#141414" />
    </svg>
    <span class="equals" style="left:{(COMB_X - 15) * S}px; top:{rowMid(strip.y) * S}px">=</span>
  {/each}
</div>

<style>
  .t3-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }
  .mini {
    position: absolute;
    box-sizing: border-box;
  }
  .halfway-staff {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .flow-arrow {
    position: absolute;
  }
  .equals {
    position: absolute;
    transform: translate(-50%, -50%);
    font-family: "Cambria", Georgia, serif;
    font-size: 32px;
    font-weight: 700;
    line-height: 1;
  }
  .rule {
    position: absolute;
    background: #141414;
  }
  .rule.heavy {
    height: 2.5px;
  }
  .rule.thin {
    height: 1px;
    background: #b8b8be;
  }
  .rule.footnote {
    height: 1px;
    background: #6c6c74;
  }
  .dir-dot {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #141414;
    transform: translateX(-50%);
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
  .para.italic {
    font-style: italic;
  }
  .para.bold-italic {
    font-weight: 700;
    font-style: italic;
  }
  .tka {
    font-family: "Cambria", Georgia, serif;
  }
  .big-letter {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 74px;
    line-height: 0.9;
  }
  .cs {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-weight: 400;
    font-size: 19px;
    color: #141414;
  }
  .row-letter {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 36px;
    line-height: 1;
  }
  .comb-label {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 15px;
  }
  .sup {
    font-size: 0.6em;
    vertical-align: super;
  }
  .sup.lo {
    vertical-align: sub;
  }
  .row-sub {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #3c3c46;
  }
  .cap {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #3c3c46;
    text-align: right;
    transform: translateX(-100%);
  }
  .frame-cap {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-size: 15px;
  }
  .thumb-cap {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #3c3c46;
  }
</style>
