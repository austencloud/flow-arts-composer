<script lang="ts">
  /**
   * Type 1 - Dual-Shift - Level 2 body page 5 (manifest `t1-dual-shift`),
   * faithful to old p6. Four two-hand breakdown strips, each start → halfway →
   * end = combined:
   *
   *   A¹ "A-One"       - A[3] (blue s→w pro cw, red n→e pro cw), turn on blue (high=left)
   *   B¹ "B-One"       - B[3] (blue s→w anti ccw, red n→e anti ccw), turn on blue
   *   C¹ "C-High-One"  - C[11] (blue s→w pro cw, red n→e anti ccw), turn on blue (high=pro)
   *   C₁ "C-Low-One"   - same C[11] base, turn on red (low=anti)
   *
   * start/end are real two-hand static pictographs; combined is the real letter
   * variation with `turns` on the appropriate hand (renderer draws the turn
   * arrows). End orientations follow the guide's thumb-switch rules
   * (pro+1turn = 1 switch, anti+0 = 1 switch, …); the halfway staff poses come
   * from the engine's own interpolator at t=0.5 (see halfway-pose.ts).
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
  const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
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
    id: `l2t1-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { left, right },
  });
  const stat = (color: HandSide, loc: GridLocation, ori: Orientation) =>
    mo(color, MotionType.STATIC, loc, loc, NOROT, ori, ori);

  type Strip = {
    y: number;
    letter: string;
    supColor: string; // superscript color (blue = high, red = low)
    supPos: "hi" | "lo";
    sub: string;
    startTop: string; // thumb caption over the start frame
    endTop: string; // thumb caption over the end frame
    start: ReturnType<typeof pic>;
    end: ReturnType<typeof pic>;
    combined: ReturnType<typeof pic>;
    halfway: { motion: HalfwayMotion; color: HandSide }[];
  };

  // Build one strip from base motion params + which hand carries the turn.
  function makeStrip(opts: {
    y: number;
    letter: string;
    supPos: "hi" | "lo";
    sub: string;
    startTop: string;
    endTop: string;
    left: { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection };
    right: { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection };
    leftTurns: number;
    rightTurns: number;
  }): Strip {
    const halfTurns = (type: MotionType, turns: number) =>
      (type === MotionType.ANTI || type === MotionType.DASH ? 1 : 0) + turns;
    const endOri = (type: MotionType, turns: number): Orientation =>
      halfTurns(type, turns) % 2 === 0 ? IN : OUT;
    const bEnd = endOri(opts.left.type, opts.leftTurns);
    const rEnd = endOri(opts.right.type, opts.rightTurns);
    const bHalf: HalfwayMotion = { type: opts.left.type, from: opts.left.from, to: opts.left.to, rot: opts.left.rot, startOri: IN, endOri: bEnd, turns: opts.leftTurns };
    const rHalf: HalfwayMotion = { type: opts.right.type, from: opts.right.from, to: opts.right.to, rot: opts.right.rot, startOri: IN, endOri: rEnd, turns: opts.rightTurns };
    return {
      y: opts.y,
      letter: opts.letter,
      supColor: opts.supPos === "hi" ? BLUE_FILL : RED_FILL,
      supPos: opts.supPos,
      sub: opts.sub,
      startTop: opts.startTop,
      endTop: opts.endTop,
      start: pic(`${opts.letter}-start`, stat(B, opts.left.from, IN), stat(R, opts.right.from, IN)),
      end: pic(`${opts.letter}-end`, stat(B, opts.left.to, bEnd), stat(R, opts.right.to, rEnd)),
      combined: pic(
        `${opts.letter}-full`,
        mo(B, opts.left.type, opts.left.from, opts.left.to, opts.left.rot, IN, bEnd, opts.leftTurns),
        mo(R, opts.right.type, opts.right.from, opts.right.to, opts.right.rot, IN, rEnd, opts.rightTurns)
      ),
      halfway: [
        { motion: bHalf, color: B },
        { motion: rHalf, color: R },
      ],
    };
  }

  const A_BLUE = { type: MotionType.PRO, from: SO_, to: W, rot: CW };
  const A_RED = { type: MotionType.PRO, from: N, to: E, rot: CW };
  const B_BLUE = { type: MotionType.ANTI, from: SO_, to: W, rot: CCW };
  const B_RED = { type: MotionType.ANTI, from: N, to: E, rot: CCW };
  const C_BLUE = { type: MotionType.PRO, from: SO_, to: W, rot: CW }; // pro = high
  const C_RED = { type: MotionType.ANTI, from: N, to: E, rot: CCW }; // anti = low

  const STRIPS: Strip[] = [
    makeStrip({ y: 162, letter: "A", supPos: "hi", sub: "“A-One”", startTop: "in", endTop: "mixed", left: A_BLUE, right: A_RED, leftTurns: 1, rightTurns: 0 }),
    makeStrip({ y: 268, letter: "B", supPos: "hi", sub: "“B-One”", startTop: "in", endTop: "mixed", left: B_BLUE, right: B_RED, leftTurns: 1, rightTurns: 0 }),
    makeStrip({ y: 576, letter: "C", supPos: "hi", sub: "“C-High-One”", startTop: "in", endTop: "out", left: C_BLUE, right: C_RED, leftTurns: 1, rightTurns: 0 }),
    makeStrip({ y: 689, letter: "C", supPos: "lo", sub: "“C-Low-One”", startTop: "in", endTop: "in", left: C_BLUE, right: C_RED, leftTurns: 0, rightTurns: 1 }),
  ];

  // ── Layout (pt, column centers from the original's frame captions) ───────────
  const START_X = 137;
  const HALF_X = 237;
  const END_X = 336;
  const COMB_X = 449;
  const SIZE = 78;
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
  const HEAVY_RULE = 352;

  const poses = (strip: Strip) =>
    strip.halfway.map((h) => ({ ...halfwayPose(h.motion, h.color), fill: h.color === HandSide.LEFT ? BLUE_FILL : RED_FILL }));
</script>

<div class="t1-page">
  <div class="rule heavy" style="left:0; top:{HEAVY_RULE * S}px; width:{612 * S}px"></div>

  <!-- Top intro + big B (left|right). -->
  <p class="para" style="top:{48 * S}px; right:{142 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    <strong><em>When motion types are exactly the same</em></strong>,<br />
    put <strong style="color:#2342c9">left</strong> in the high slot and <strong style="color:#c01b1b">right</strong> in the low slot.<br />
    Here is a breakdown of A<sup>1</sup> (pro|pro) and B<sup>1</sup> (anti|anti).
  </p>
  <div class="big-letter" style="left:{430 * S}px; top:{50 * S}px">B</div>
  <span class="lr hi" style="left:{478 * S}px; top:{46 * S}px">Left</span>
  <span class="lr lo" style="left:{478 * S}px; top:{93 * S}px">Right</span>

  <!-- Middle text between the two halves. -->
  <p class="para" style="top:{372 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    When motion types are different, high/low indicates how to label them.<br />
    With hybrids, we can add a turn to either the pro or anti motion.
  </p>
  <p class="para bold" style="top:{428 * S}px; right:{142 * S}px; font-size:{20 * S}px; line-height:{24 * S}px">
    For pro/anti hybrids,<br />high = prospin and low = antispin,
  </p>
  <div class="big-letter" style="left:{408 * S}px; top:{430 * S}px">C</div>
  <span class="cs hi" style="left:{460 * S}px; top:{435 * S}px">Prospin</span>
  <span class="cs lo" style="left:{460 * S}px; top:{487 * S}px">Antispin</span>
  <p class="para" style="top:{500 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    This includes C, F, I, L, O, R, U, and V.
  </p>

  <!-- Bottom code note. -->
  <p class="para italic" style="top:{776 * S}px; font-size:{14.5 * S}px; line-height:{18 * S}px">
    For code or file-naming, indicate turns with parentheses like so:&nbsp; C<sup>1</sup> = C(1,0) and C<sub>1</sub> = C(0,1)
  </p>

  <!-- Four breakdown strips. -->
  {#each STRIPS as strip, si (si)}
    {@const hp = poses(strip)}
    <!-- Row label (letter + super/sub) and sublabel. -->
    <div class="row-letter" style="left:{92 * S}px; top:{(strip.y + 4) * S}px">
      {strip.letter}<span class="sup {strip.supPos}" style="color:{strip.supColor}">1</span>
    </div>
    <div class="row-sub" style="left:{56 * S}px; top:{(strip.y + 42) * S}px; width:{88 * S}px">{strip.sub}</div>

    <!-- Captions (thumbs / start / halfway / end). -->
    {#if si === 0 || si === 2}
      <span class="cap" style="left:{150 * S}px; top:{(strip.y - 30) * S}px">thumbs:</span>
      <span class="frame-cap" style="left:{START_X * S}px; top:{(strip.y - 44) * S}px; width:{SIZE * S}px">start</span>
      <span class="frame-cap" style="left:{HALF_X * S}px; top:{(strip.y - 44) * S}px; width:{SIZE * S}px">halfway</span>
      <span class="frame-cap" style="left:{END_X * S}px; top:{(strip.y - 44) * S}px; width:{SIZE * S}px">end</span>
    {/if}
    <span class="thumb-cap" style="left:{START_X * S}px; top:{(strip.y - 26) * S}px; width:{SIZE * S}px">{strip.startTop}</span>
    <span class="thumb-cap" style="left:{END_X * S}px; top:{(strip.y - 26) * S}px; width:{SIZE * S}px">{strip.endTop}</span>

    <!-- start -->
    <div class="mini" style="left:{START_X * S}px; top:{strip.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
      <PictographContainer pictographData={strip.start} gridMode={GridMode.DIAMOND} leftPropTypeOverride={PropType.STAFF} rightPropTypeOverride={PropType.STAFF} {...PICTO_FLAGS} />
    </div>
    <!-- halfway: bare grid + two staff poses -->
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
    <div class="comb-label" style="left:{COMB_X * S}px; top:{(strip.y + SIZE - 8) * S}px; width:{SIZE * S}px">
      {strip.letter}<span class="sup {strip.supPos}">1</span>
    </div>

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
  .t1-page {
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
  .big-letter {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 74px;
    line-height: 0.9;
  }
  .lr,
  .cs {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 19px;
  }
  .lr.hi {
    color: #2e3192;
  }
  .lr.lo {
    color: #dc2626;
  }
  .cs {
    font-weight: 400;
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

