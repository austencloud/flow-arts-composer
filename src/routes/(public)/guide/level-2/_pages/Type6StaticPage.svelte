<script lang="ts">
  /**
   * Type 6 - Static - Level 2 body page 12 (manifest `t6-static`), faithful to old
   * p13. Type 6 letters keep both hands static; matching type means the single turn
   * goes in the high slot by default. Two sections:
   *
   *   α¹ "Alpha-One"      - one strip (α variation [0]: blue w→w / red e→e static),
   *                         1 turn on one static hand (red). No opening/closing (alpha).
   *   Γ¹ opening/closing  - Γ is a gamma static, so it uses opening/closing with a
   *                         Continuation column. Both static (blue@S, red@W); 1 turn on
   *                         the red hand. cw = opening→W (alpha), ccw = closing→Y (beta).
   *
   * α section uses wide columns; Γ section uses compressed columns + a continuation
   * column. Halfway poses (a static prop spun 90°) come from the engine interpolator.
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
    id: `l2t6-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { left, right },
  });
  const statPic = (color: HandSide, loc: GridLocation, ori: Orientation, rot: RotationDirection = NOROT, turns = 0) =>
    mo(color, MotionType.STATIC, loc, loc, rot, ori, turns % 2 === 1 ? OUT : IN, turns);

  type Cont = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection };
  type Cols = { start: number; half: number; end: number; comb: number };
  type Strip = {
    y: number;
    letter: string;
    label: string;
    labelY: number;
    opcl: string | null;
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

  const staticEnd = (turns: number): Orientation => (turns % 2 === 1 ? OUT : IN);
  const contMo = (c: HandSide, m: Cont) =>
    m.type === MotionType.STATIC ? statPic(c, m.from, IN) : mo(c, m.type, m.from, m.to, m.rot, IN, IN, 0);

  const WIDE: Cols = { start: 165, half: 257, end: 367, comb: 467 };
  const NARROW: Cols = { start: 98, half: 197, end: 297, comb: 397 };
  const CONT_X = 497;
  const SIZE = 78;

  type StaticHand = { loc: GridLocation; rot: RotationDirection; turns: number };

  function makeStrip(opts: {
    y: number;
    letter: string;
    label: string;
    labelY: number;
    opcl: string | null;
    captions: boolean;
    endThumb: string;
    cols: Cols;
    contLetter: string | null;
    left: StaticHand;
    right: StaticHand;
    contLeft?: Cont;
    contRight?: Cont;
  }): Strip {
    const bEnd = staticEnd(opts.left.turns);
    const rEnd = staticEnd(opts.right.turns);
    const hm = (h: StaticHand, eo: Orientation): HalfwayMotion => ({
      type: MotionType.STATIC,
      from: h.loc,
      to: h.loc,
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
      captions: opts.captions,
      endThumb: opts.endThumb,
      cols: opts.cols,
      contLetter: opts.contLetter,
      start: pic("start", statPic(B, opts.left.loc, IN), statPic(R, opts.right.loc, IN)),
      end: pic("end", statPic(B, opts.left.loc, bEnd, opts.left.rot, opts.left.turns), statPic(R, opts.right.loc, rEnd, opts.right.rot, opts.right.turns)),
      combined: pic(
        "full",
        statPic(B, opts.left.loc, bEnd, opts.left.rot, opts.left.turns),
        statPic(R, opts.right.loc, rEnd, opts.right.rot, opts.right.turns)
      ),
      continuation:
        opts.contLeft && opts.contRight ? pic("cont", contMo(B, opts.contLeft), contMo(R, opts.contRight)) : null,
      halfway: [
        { motion: hm(opts.left, bEnd), color: B },
        { motion: hm(opts.right, rEnd), color: R },
      ],
    };
  }

  const SH = (loc: GridLocation, turns: number, rot: RotationDirection): StaticHand => ({ loc, turns, rot });
  const STATIC = (loc: GridLocation): Cont => ({ type: MotionType.STATIC, from: loc, to: loc, rot: NOROT });
  const PRO = (from: GridLocation, to: GridLocation, rot: RotationDirection): Cont => ({ type: MotionType.PRO, from, to, rot });

  const STRIPS: Strip[] = [
    // α section - both static (blue@W, red@E, alpha); 1 turn on the red hand.
    makeStrip({
      y: 289, letter: "α", label: "“Alpha-One”", labelY: 327, opcl: null, captions: true,
      endThumb: "in", cols: WIDE, contLetter: null,
      left: SH(W, 0, NOROT), right: SH(E, 1, CW),
    }),
    // Γ section - both static at gamma (blue@S, red@W); 1 turn on the red hand.
    makeStrip({
      y: 509, letter: "Γ", label: "“Gamma-One”", labelY: 549, opcl: "OPEN", captions: true,
      endThumb: "in", cols: NARROW, contLetter: "W",
      left: SH(SO_, 0, NOROT), right: SH(W, 1, CW),
      contLeft: STATIC(SO_), contRight: PRO(W, N, CW),
    }),
    makeStrip({
      y: 617, letter: "Γ", label: "“Gamma-One”", labelY: 659, opcl: "CLOSE", captions: false,
      endThumb: "in", cols: NARROW, contLetter: "Y",
      left: SH(SO_, 0, NOROT), right: SH(W, 1, CCW),
      contLeft: STATIC(SO_), contRight: PRO(W, SO_, CCW),
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

<div class="t6-page">
  <!-- Intro. -->
  <p class="para" style="top:{66 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Finally, Type 6 letters have both hands remaining static.<br />
    Both types are the same (static|static), so the number goes in the high slot by default.
  </p>
  <p class="para" style="top:{152 * S}px; right:{200 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    This includes <span class="tka">α</span>, <span class="tka">β</span>, and <span class="tka">Γ</span>.
  </p>
  <div class="big-letter" style="left:{350 * S}px; top:{118 * S}px"><span class="tka">α</span></div>
  <span class="lr hi" style="left:{438 * S}px; top:{115 * S}px">Left</span>
  <span class="lr lo" style="left:{433 * S}px; top:{163 * S}px">Right</span>
  <span class="psi-cap" style="left:{380 * S}px; top:{181 * S}px">Alpha</span>

  <p class="para" style="top:{221 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Let’s break down <span class="tka">α</span><sup>1</sup>:
  </p>

  <!-- α note. -->
  <p class="para" style="top:{362 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Note that the arrow can follow the path of either the thumb end or pinky end.<br />
    The optimal placement depends on context.
  </p>
  <p class="para" style="top:{417 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    <span class="tka">Γ</span><sup>1</sup> also presents variations on <em>opening/closing.</em>
  </p>
  <div class="cont-header" style="left:{493 * S}px; top:{465 * S}px">Continuation</div>

  <!-- Closing. -->
  <p class="para" style="top:{718 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    These static single-turns are relatively simple.<br />
    Next we’ll look at dual-turns, in which both props are receiving a turn.
  </p>

  <!-- Rules. -->
  <div class="rule heavy" style="left:0; top:{447 * S}px; width:{612 * S}px"></div>
  <div class="rule thin" style="left:{26 * S}px; top:{593 * S}px; width:{541 * S}px"></div>
  <div class="rule vdiv" style="left:{486 * S}px; top:{471.8 * S}px; height:{231 * S}px"></div>

  <!-- Strips. -->
  {#each STRIPS as strip, si (si)}
    {@const hp = poses(strip)}
    {@const c = strip.cols}
    <div class="row-letter" style="left:{(c === WIDE ? 132 : 40) * S}px; top:{(strip.y + 4) * S}px">
      <span class="tka">{strip.letter}</span><span class="sup" style="color:{RED_FILL}">1</span>
    </div>
    <div class="row-sub" style="left:{(c === WIDE ? 60 : 6) * S}px; top:{strip.labelY * S}px; width:{104 * S}px">{strip.label}</div>
    {#if strip.opcl}
      <div class="row-opcl" style="left:{6 * S}px; top:{(strip.labelY + 13) * S}px; width:{104 * S}px">{strip.opcl}</div>
    {/if}

    <!-- Captions. -->
    <span class="cap" style="left:{(c.start - 18) * S}px; top:{(strip.y - 32) * S}px">thumbs:</span>
    {#if strip.captions}
      <span class="frame-cap" style="left:{c.start * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">start</span>
      <span class="frame-cap" style="left:{c.half * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">halfway</span>
      <span class="frame-cap" style="left:{c.end * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">end</span>
    {/if}
    <span class="thumb-cap" style="left:{c.start * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">in</span>
    <span class="thumb-cap" style="left:{c.end * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">{strip.endThumb}</span>
    {#if strip.opcl}
      <span class="cont-opcl" style="left:{(CONT_X - 6) * S}px; top:{(strip.y - 18) * S}px; width:{(SIZE + 30) * S}px">{strip.opcl === "OPEN" ? "OPENING" : "CLOSING"}</span>
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
      <span class="tka">{strip.letter}</span><span class="sup" style="color:{RED_FILL}">1</span>
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
  .t6-page {
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
