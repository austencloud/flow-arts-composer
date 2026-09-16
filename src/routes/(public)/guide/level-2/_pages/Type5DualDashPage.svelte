<script lang="ts">
  /**
   * Type 5 - Dual-Dash - Level 2 body page 11 (manifest `t5-dual-dash`), faithful
   * to old p12. Both hands dash (dash|dash), so there are no hybrids; matching type
   * means left→high, right→low. Two sections:
   *
   *   Ψ-¹ "Psi-Dash-One"  - one strip (Ψ- variation [1]: both n→s dash), 1 turn on
   *                         the high/left hand (blue). No opening/closing (beta letter).
   *   Λ-¹ opening/closing - Λ- is a gamma dual-dash, so it uses opening/closing with a
   *                         Continuation column (variation [7]: blue w→e, red s→n dash).
   *                         1 turn on the low/right hand (red); ccw = opening→W (alpha),
   *                         cw = closing→Y (beta).
   *
   * Ψ- section uses wide columns; Λ- section uses compressed columns + a continuation
   * column (like the p11 Λ page). Halfway poses from the engine interpolator.
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
    id: `l2t5-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { left, right },
  });
  const stat = (color: HandSide, loc: GridLocation, ori: Orientation) =>
    mo(color, MotionType.STATIC, loc, loc, NOROT, ori, ori);

  type Hand = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection; turns: number };
  type Cont = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection };
  type Cols = { start: number; half: number; end: number; comb: number };
  type Strip = {
    y: number;
    letter: string;
    label: string;
    labelY: number;
    opcl: string | null;
    supPos: "hi" | "lo";
    supColor: string;
    captions: boolean;
    endThumb: string;
    cols: Cols;
    contLetter: string | null;
    start: ReturnType<typeof pic>;
    end: ReturnType<typeof pic>;
    combined: ReturnType<typeof pic>;
    continuation: ReturnType<typeof pic> | null;
    halfway: { motion: HalfwayMotion; color: HandSide }[];
  };

  const half = (h: Hand): number => (h.type === MotionType.ANTI || h.type === MotionType.DASH ? 1 : 0) + h.turns;
  const endOf = (h: Hand): Orientation => (half(h) % 2 === 0 ? IN : OUT);
  const contMo = (c: HandSide, m: Cont) =>
    m.type === MotionType.STATIC ? stat(c, m.from, IN) : mo(c, m.type, m.from, m.to, m.rot, IN, IN, 0);

  const WIDE: Cols = { start: 183, half: 283, end: 382, comb: 482 };
  const NARROW: Cols = { start: 98, half: 197, end: 297, comb: 397 };
  const CONT_X = 501;
  const SIZE = 78;

  function makeStrip(opts: {
    y: number;
    letter: string;
    label: string;
    labelY: number;
    opcl: string | null;
    supPos: "hi" | "lo";
    captions: boolean;
    endThumb: string;
    cols: Cols;
    contLetter: string | null;
    left: Hand;
    right: Hand;
    contLeft?: Cont;
    contRight?: Cont;
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
      letter: opts.letter,
      label: opts.label,
      labelY: opts.labelY,
      opcl: opts.opcl,
      supPos: opts.supPos,
      supColor: opts.supPos === "hi" ? BLUE_FILL : RED_FILL,
      captions: opts.captions,
      endThumb: opts.endThumb,
      cols: opts.cols,
      contLetter: opts.contLetter,
      start: pic("start", stat(B, opts.left.from, IN), stat(R, opts.right.from, IN)),
      end: pic("end", stat(B, opts.left.to, bEnd), stat(R, opts.right.to, rEnd)),
      combined: pic(
        "full",
        mo(B, opts.left.type, opts.left.from, opts.left.to, opts.left.rot, IN, bEnd, opts.left.turns),
        mo(R, opts.right.type, opts.right.from, opts.right.to, opts.right.rot, IN, rEnd, opts.right.turns)
      ),
      continuation:
        opts.contLeft && opts.contRight ? pic("cont", contMo(B, opts.contLeft), contMo(R, opts.contRight)) : null,
      halfway: [
        { motion: hm(opts.left, bEnd), color: B },
        { motion: hm(opts.right, rEnd), color: R },
      ],
    };
  }

  const DASH = (from: GridLocation, to: GridLocation, rot: RotationDirection, turns: number): Hand => ({ type: MotionType.DASH, from, to, rot, turns });
  const STATIC = (loc: GridLocation): Cont => ({ type: MotionType.STATIC, from: loc, to: loc, rot: NOROT });
  const PRO = (from: GridLocation, to: GridLocation, rot: RotationDirection): Cont => ({ type: MotionType.PRO, from, to, rot });

  const STRIPS: Strip[] = [
    // Ψ- section - both n→s dash, 1 turn on the high/left hand (blue).
    makeStrip({
      y: 302, letter: "Ψ-", label: "“Psi-Dash-One”", labelY: 340, opcl: null, supPos: "hi", captions: true,
      endThumb: "in", cols: WIDE, contLetter: null,
      left: DASH(N, SO_, CW, 1), right: DASH(N, SO_, NOROT, 0),
    }),
    // Λ- section - blue w→e / red s→n dash; 1 turn on the low/right hand (red).
    makeStrip({
      y: 528, letter: "Λ-", label: "“Lam-Dash-One”", labelY: 562, opcl: "OPENING", supPos: "lo", captions: false,
      endThumb: "mixed", cols: NARROW, contLetter: "W",
      left: DASH(W, E, NOROT, 0), right: DASH(SO_, N, CCW, 1),
      contLeft: STATIC(E), contRight: PRO(N, W, CCW),
    }),
    makeStrip({
      y: 628, letter: "Λ-", label: "“Lam-Dash-One”", labelY: 659, opcl: "CLOSING", supPos: "lo", captions: false,
      endThumb: "mixed", cols: NARROW, contLetter: "Y",
      left: DASH(W, E, NOROT, 0), right: DASH(SO_, N, CW, 1),
      contLeft: STATIC(E), contRight: PRO(N, E, CW),
    }),
  ];

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

<div class="t5-page">
  <!-- Intro. -->
  <p class="para" style="top:{63 * S}px; font-size:{16 * S}px; line-height:{19.2 * S}px">
    In Type 5 motions, both hands are dashing, so there are no hybrids.<br />
    Since they’re the same type (dash|dash), the <strong style="color:#2342c9">left</strong> goes in the high slot,<br />
    and the <strong style="color:#c01b1b">right</strong> goes in the low slot.
  </p>
  <p class="para" style="top:{152 * S}px; right:{200 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    This includes <span class="tka">Φ</span>-, <span class="tka">Ψ</span>-, and <span class="tka">Λ</span>-.
  </p>
  <div class="big-letter" style="left:{330 * S}px; top:{118 * S}px"><span class="tka">Ψ</span>-</div>
  <span class="lr hi" style="left:{445 * S}px; top:{118 * S}px">Left</span>
  <span class="lr lo" style="left:{441 * S}px; top:{167 * S}px">Right</span>
  <span class="psi-cap" style="left:{356 * S}px; top:{184 * S}px">Psi-Dash</span>

  <p class="para" style="top:{221 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Let’s break down <span class="tka">Ψ</span>-<sup>1</sup>:
  </p>

  <!-- Ψ- note. -->
  <p class="para bold" style="top:{379 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Remember - the high/low slots do <u>not</u> refer to <span style="color:#2342c9">left</span>/<span style="color:#c01b1b">right</span>.
  </p>
  <p class="para" style="top:{401 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Instead, their purpose is to differentiate two motion types.<br />
    In Type 5, those motion types are the same (dash|dash).
  </p>

  <!-- Λ- lead-in. -->
  <p class="para" style="top:{462 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    Now let’s look at <span class="tka">Λ</span>-<sup>1</sup>, which again presents variations of <em>opening</em> and <em>closing.</em>
  </p>
  <div class="cont-header" style="left:{503 * S}px; top:{489 * S}px">Continuation</div>

  <!-- Closing. -->
  <p class="para" style="top:{724 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    As always, pause at the halfway point to drill it into your muscle memory.<br />
    This will ensure proper timing.
  </p>

  <!-- Rules. -->
  <div class="rule heavy" style="left:0; top:{455.7 * S}px; width:{612 * S}px"></div>
  <div class="rule thin" style="left:{19 * S}px; top:{612.1 * S}px; width:{552 * S}px"></div>
  <div class="rule vdiv" style="left:{490 * S}px; top:{498.5 * S}px; height:{210 * S}px"></div>

  <!-- Strips. -->
  {#each STRIPS as strip, si (si)}
    {@const hp = poses(strip)}
    {@const c = strip.cols}
    <div class="row-letter" style="left:{(c === WIDE ? 118 : 34) * S}px; top:{(strip.y + 4) * S}px">
      <span class="tka">{strip.letter}</span><span class="sup {strip.supPos}" style="color:{strip.supColor}">1</span>
    </div>
    <div class="row-sub" style="left:{(c === WIDE ? 62 : 6) * S}px; top:{strip.labelY * S}px; width:{104 * S}px">{strip.label}</div>
    {#if strip.opcl}
      <div class="row-opcl" style="left:{6 * S}px; top:{(strip.labelY + 13) * S}px; width:{104 * S}px">{strip.opcl}</div>
    {/if}

    <!-- Captions. -->
    {#if strip.captions}
      <span class="cap" style="left:{(c.start - 18) * S}px; top:{(strip.y - 32) * S}px">thumbs:</span>
      <span class="frame-cap" style="left:{c.start * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">start</span>
      <span class="frame-cap" style="left:{c.half * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">halfway</span>
      <span class="frame-cap" style="left:{c.end * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">end</span>
    {/if}
    <span class="thumb-cap" style="left:{c.start * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">in</span>
    <span class="thumb-cap" style="left:{c.end * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">{strip.endThumb}</span>
    {#if strip.opcl}
      <span class="cont-opcl" style="left:{(CONT_X - 6) * S}px; top:{(strip.y - 18) * S}px; width:{(SIZE + 30) * S}px">{strip.opcl}</span>
    {/if}

    <!-- start -->
    <div class="mini" style="left:{c.start * S}px; top:{strip.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
      <PictographContainer pictographData={strip.start} gridMode={GridMode.DIAMOND} leftPropTypeOverride={PropType.STAFF} rightPropTypeOverride={PropType.STAFF} {...PICTO_FLAGS} />
    </div>
    <!-- halfway -->
    <div class="mini" style="left:{c.half * S}px; top:{strip.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
      <svg class="halfway-staff" viewBox="0 0 950 950" aria-hidden="true">
        {#each hp as p (p.fill)}
          <g transform="translate({p.cx}, {p.cy}) rotate({p.deg}) translate(-126.4, -38.9)">
            <path d={STAFF_D} fill={p.fill} />
          </g>
        {/each}
      </svg>
    </div>
    <!-- end -->
    <div class="mini" style="left:{c.end * S}px; top:{strip.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
      <PictographContainer pictographData={strip.end} gridMode={GridMode.DIAMOND} leftPropTypeOverride={PropType.STAFF} rightPropTypeOverride={PropType.STAFF} {...PICTO_FLAGS} />
    </div>
    <!-- combined -->
    <div class="mini" style="left:{c.comb * S}px; top:{strip.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
      <PictographContainer pictographData={strip.combined} gridMode={GridMode.DIAMOND} leftPropTypeOverride={PropType.STAFF} rightPropTypeOverride={PropType.STAFF} {...PICTO_FLAGS} />
    </div>
    <div class="comb-label" style="left:{c.comb * S}px; top:{(strip.y + SIZE - 12) * S}px; width:{SIZE * S}px">
      <span class="tka">{strip.letter}</span><span class="sup {strip.supPos}" style="color:{strip.supColor}">1</span>
    </div>

    <!-- continuation -->
    {#if strip.continuation}
      <div class="mini" style="left:{CONT_X * S}px; top:{strip.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
        <PictographContainer pictographData={strip.continuation} gridMode={GridMode.DIAMOND} leftPropTypeOverride={PropType.STAFF} rightPropTypeOverride={PropType.STAFF} {...PICTO_FLAGS} />
      </div>
      <div class="cont-letter" style="left:{CONT_X * S}px; top:{(strip.y + SIZE - 18) * S}px; width:{SIZE * S}px">{strip.contLetter}</div>
    {/if}

    <!-- flow arrows + "=" -->
    <svg class="flow-arrow" style="left:{(c.half - 22) * S}px; top:{(rowMid(strip.y) - 5) * S}px; width:{ARROW_W * S}px; height:{10 * S}px" viewBox="0 0 {ARROW_W} 10" aria-hidden="true">
      <line x1="0" y1="5" x2={ARROW_W - 7} y2="5" stroke="#141414" stroke-width="2" /><polygon points="{ARROW_W - 8},1.3 {ARROW_W},5 {ARROW_W - 8},8.7" fill="#141414" />
    </svg>
    <svg class="flow-arrow" style="left:{(c.end - 22) * S}px; top:{(rowMid(strip.y) - 5) * S}px; width:{ARROW_W * S}px; height:{10 * S}px" viewBox="0 0 {ARROW_W} 10" aria-hidden="true">
      <line x1="0" y1="5" x2={ARROW_W - 7} y2="5" stroke="#141414" stroke-width="2" /><polygon points="{ARROW_W - 8},1.3 {ARROW_W},5 {ARROW_W - 8},8.7" fill="#141414" />
    </svg>
    <span class="equals" style="left:{(c.comb - 15) * S}px; top:{rowMid(strip.y) * S}px">=</span>
  {/each}
</div>

<style>
  .t5-page {
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
    font-size: 30px;
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
  .rule.vdiv {
    width: 1px;
    background: #6c6c74;
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
  .tka {
    font-family: "Cambria", Georgia, serif;
  }
  .big-letter {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 68px;
    line-height: 0.9;
  }
  .lr {
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
  .psi-cap {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-size: 14px;
    color: #3c3c46;
  }
  .cont-header {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-style: italic;
    font-size: 18px;
  }
  .row-letter {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 34px;
    line-height: 1;
  }
  .comb-label {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 13px;
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
    font-size: 12px;
    color: #3c3c46;
  }
  .row-opcl {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.04em;
    color: #3c3c46;
  }
  .cont-letter {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 20px;
  }
  .cont-opcl {
    position: absolute;
    text-align: right;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.04em;
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
    font-size: 14px;
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
