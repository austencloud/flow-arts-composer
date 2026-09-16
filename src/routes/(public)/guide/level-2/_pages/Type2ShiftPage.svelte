<script lang="ts">
  /**
   * Type 2 - Shift - Level 2 body page 7 (manifest `t2-shift`), faithful to old
   * p8. Type 2 hybrids combine a shift and a static motion; PADS puts the shift
   * high and the static low. Three breakdown strips (all from W variation [3]:
   * blue w→w static, red n→e pro cw - MCP-verified):
   *
   *   W¹  "W-High-One"       - 1 turn on the shift (red). Simple: the static hand is still.
   *   W₁• "W-Same Low-One"   - 1 turn on the static hand (blue) spinning the SAME
   *                            sense as the shift (cw) → Same relationship, dot ABOVE.
   *   •W₁ "W-Opp Low-One"    - 1 turn on the static hand spinning OPPOSITE (ccw) →
   *                            Opposite relationship, dot BELOW.
   *
   * High slot glyph = red, low = blue (as on the S/T page). The same/opp dot is
   * a pedagogical direction mark on the letter, not a pictograph adornment.
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
  const { NORTH: N, EAST: E, WEST: W } = GridLocation;
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
    id: `l2t2-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { left, right },
  });
  const stat = (color: HandSide, loc: GridLocation, ori: Orientation, rot: RotationDirection = NOROT, turns = 0) =>
    mo(color, MotionType.STATIC, loc, loc, rot, ori, turns % 2 === 1 ? OUT : IN, turns);

  type Hand = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection; turns: number };
  type Strip = {
    y: number;
    labelLines: string[];
    labelY: number; // pt, top of first label line
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
    const handStart = (c: HandSide, h: Hand) =>
      h.type === MotionType.STATIC ? stat(c, h.from, IN) : stat(c, h.from, IN);
    const handEnd = (c: HandSide, h: Hand, eo: Orientation) =>
      h.type === MotionType.STATIC ? stat(c, h.to, eo, h.rot, h.turns) : stat(c, h.to, eo);
    const combinedHand = (c: HandSide, h: Hand, eo: Orientation) =>
      mo(c, h.type, h.from, h.to, h.rot, IN, eo, h.turns);
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
      start: pic("start", handStart(B, opts.left), handStart(R, opts.right)),
      end: pic("end", handEnd(B, opts.left, bEnd), handEnd(R, opts.right, rEnd)),
      combined: pic("full", combinedHand(B, opts.left, bEnd), combinedHand(R, opts.right, rEnd)),
      halfway: [
        { motion: hm(opts.left, bEnd), color: B },
        { motion: hm(opts.right, rEnd), color: R },
      ],
    };
  }

  // W = static(blue @W) + pro shift(red n→e cw), variation [3].
  const STAT_BLUE = (turns: number, rot: RotationDirection): Hand => ({ type: MotionType.STATIC, from: W, to: W, rot, turns });
  const SHIFT_RED = (turns: number): Hand => ({ type: MotionType.PRO, from: N, to: E, rot: CW, turns });

  const STRIPS: Strip[] = [
    makeStrip({ y: 305, labelLines: ["“W-High-One”"], labelY: 327, supPos: "hi", dot: null, captions: true, left: STAT_BLUE(0, NOROT), right: SHIFT_RED(1) }),
    makeStrip({ y: 563, labelLines: ["“W-Same", "Low-One”"], labelY: 576, supPos: "lo", dot: "same", captions: true, left: STAT_BLUE(1, CW), right: SHIFT_RED(0) }),
    makeStrip({ y: 666, labelLines: ["“W-Opp", "Low-One”"], labelY: 684, supPos: "lo", dot: "opp", captions: false, left: STAT_BLUE(1, CCW), right: SHIFT_RED(0) }),
  ];

  // ── Layout (pt) ─────────────────────────────────────────────────────────────
  const START_X = 152;
  const HALF_X = 252;
  const END_X = 351;
  const COMB_X = 452;
  const SIZE = 78;
  const LETTER_CX = 106; // W row-letter center (pt), for the same/opp dot
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

<div class="t2-page">
  <!-- Intro block. -->
  <p class="para" style="top:{60 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    Type 2 hybrids combine a shift and a static motion.<br />
    These two motion types are different, so we use the high/low slots to differentiate them.<br />
    To determine where they go, remember PADS.<br />
    Because a shift (pro/anti) is higher than a static motion, we can confidently state that:
  </p>

  <!-- Slot rule + big W (shift|static). -->
  <p class="para bold" style="top:{149 * S}px; right:{142 * S}px; font-size:{20 * S}px; line-height:{24 * S}px">
    For Type 2,<br />high = shift and low = static.
  </p>
  <p class="para" style="top:{215 * S}px; right:{142 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    This includes W, X, Y, Z, <span class="tka">Σ</span>, <span class="tka">Δ</span>, <span class="tka">Θ</span>, and <span class="tka">Ω</span>.
  </p>
  <div class="big-letter" style="left:{408 * S}px; top:{150 * S}px">W</div>
  <span class="cs hi" style="left:{458 * S}px; top:{152 * S}px">Shift</span>
  <span class="cs lo" style="left:{458 * S}px; top:{200 * S}px">Static</span>

  <p class="para" style="top:{251 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Let’s add 1 high turn to a Type 2 motion, which only affects the shift.
  </p>
  <p class="para" style="top:{397 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Since the static hand is still, this should be simple to execute.
  </p>

  <!-- Same/Opposite explanation. -->
  <p class="para" style="top:{441 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    Type 2 motions become more complex when we add turns to the static hand.<br />
    Since this causes both props to rotate, it creates either a Same or Opposite relationship.<br />
    To indicate this, add a dot above or below the letter.*
  </p>
  <p class="para bold" style="top:{492 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    A same-dot goes above and an opp-dot goes below.
  </p>

  <!-- Footnote. -->
  <div class="rule footnote" style="left:0; top:{757.2 * S}px; width:{612 * S}px"></div>
  <p class="para italic" style="top:{761 * S}px; font-size:{14.5 * S}px; line-height:{18 * S}px">
    You can also use (s) or (o) as parameters to indicate “same” or “opp”. E.g. “W(s,0,1)”
  </p>

  <!-- Group separators. -->
  <div class="rule heavy" style="left:0; top:{431 * S}px; width:{612 * S}px"></div>
  <div class="rule thin" style="left:{88 * S}px; top:{650 * S}px; width:{436 * S}px"></div>

  <!-- Three breakdown strips. -->
  {#each STRIPS as strip, si (si)}
    {@const hp = poses(strip)}
    <div class="row-letter" style="left:{92 * S}px; top:{(strip.y + 4) * S}px">
      W<span class="sup {strip.supPos}" style="color:{strip.supColor}">1</span>
    </div>
    {#if strip.dot === "same"}
      <span class="dir-dot" style="left:{LETTER_CX * S}px; top:{(strip.y - 2) * S}px"></span>
    {:else if strip.dot === "opp"}
      <span class="dir-dot" style="left:{LETTER_CX * S}px; top:{(strip.y + 44) * S}px"></span>
    {/if}
    {#each strip.labelLines as line, li (li)}
      <div class="row-sub" style="left:{20 * S}px; top:{(strip.labelY + li * 13) * S}px; width:{100 * S}px">{line}</div>
    {/each}

    <!-- Captions. -->
    {#if strip.captions}
      <span class="cap" style="left:{150 * S}px; top:{(strip.y - 32) * S}px">thumbs:</span>
      <span class="frame-cap" style="left:{START_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">start</span>
      <span class="frame-cap" style="left:{HALF_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">halfway</span>
      <span class="frame-cap" style="left:{END_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">end</span>
    {/if}
    <span class="thumb-cap" style="left:{START_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">in</span>
    <span class="thumb-cap" style="left:{END_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">out</span>

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
      W<span class="sup {strip.supPos}" style="color:{strip.supColor}">1</span>
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
  .t2-page {
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
