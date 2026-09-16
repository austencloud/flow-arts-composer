<script lang="ts">
  /**
   * Opening/Closing - Level 2 body page 10 (manifest `opening-closing`), faithful
   * to old p11. Λ (Lam) is a Type 4 (dash+static) at gamma. Because gamma's
   * right-angle position is geometrically asymmetric, same/opp collapses - Λ uses
   * OPENING / CLOSING instead (MCP get_domain_topic("glyph-anatomy")): extrapolate
   * the rotating hand's trajectory into a pro-shift; opening resolves toward ALPHA
   * (opposite pts) so the continuation is W, closing resolves toward BETA (same pt)
   * so the continuation is Y.
   *
   * Four breakdown strips, each start → halfway → end = combined, plus a right
   * "Continuation" column (a hypothetical pro-shift = W or Y) behind a vertical
   * divider. All from Λ variation [14] (blue w→w static, red s→n dash - MCP):
   *
   *   Λ¹ opening / closing  - 1 turn on the dash (red); cw arc = opening→W, ccw = closing→Y.
   *   Λ₁ opening / closing  - 1 turn on the static hand (blue); the static rotates,
   *                           so its own pro-shift continuation opens (→W) or closes (→Y).
   *
   * High glyph = red, low = blue. Halfway poses from the engine interpolator.
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
    id: `l2lam-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { left, right },
  });
  const stat = (color: HandSide, loc: GridLocation, ori: Orientation) =>
    mo(color, MotionType.STATIC, loc, loc, NOROT, ori, ori);

  type Hand = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection; turns: number };
  type Cont = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection };
  type Strip = {
    y: number;
    label: string;
    labelY: number;
    opcl: string;
    supPos: "hi" | "lo";
    supColor: string;
    captions: boolean;
    endThumb: string;
    contLetter: string;
    start: ReturnType<typeof pic>;
    end: ReturnType<typeof pic>;
    combined: ReturnType<typeof pic>;
    continuation: ReturnType<typeof pic>;
    halfway: { motion: HalfwayMotion; color: HandSide }[];
  };

  const half = (h: Hand): number => (h.type === MotionType.ANTI || h.type === MotionType.DASH ? 1 : 0) + h.turns;
  const endOf = (h: Hand): Orientation => (half(h) % 2 === 0 ? IN : OUT);
  const contMo = (c: HandSide, m: Cont) =>
    m.type === MotionType.STATIC ? stat(c, m.from, IN) : mo(c, m.type, m.from, m.to, m.rot, IN, IN, 0);

  function makeStrip(opts: {
    y: number;
    label: string;
    labelY: number;
    opcl: string;
    supPos: "hi" | "lo";
    captions: boolean;
    endThumb: string;
    contLetter: string;
    left: Hand;
    right: Hand;
    contLeft: Cont;
    contRight: Cont;
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
      label: opts.label,
      labelY: opts.labelY,
      opcl: opts.opcl,
      supPos: opts.supPos,
      supColor: opts.supPos === "hi" ? RED_FILL : BLUE_FILL,
      captions: opts.captions,
      endThumb: opts.endThumb,
      contLetter: opts.contLetter,
      start: pic("start", stat(B, opts.left.from, IN), stat(R, opts.right.from, IN)),
      end: pic("end", stat(B, opts.left.to, bEnd), stat(R, opts.right.to, rEnd)),
      combined: pic(
        "full",
        mo(B, opts.left.type, opts.left.from, opts.left.to, opts.left.rot, IN, bEnd, opts.left.turns),
        mo(R, opts.right.type, opts.right.from, opts.right.to, opts.right.rot, IN, rEnd, opts.right.turns)
      ),
      continuation: pic("cont", contMo(B, opts.contLeft), contMo(R, opts.contRight)),
      halfway: [
        { motion: hm(opts.left, bEnd), color: B },
        { motion: hm(opts.right, rEnd), color: R },
      ],
    };
  }

  // Λ = static(blue @W) + dash(red s→n), variation [14].
  const STAT_BLUE = (turns: number, rot: RotationDirection): Hand => ({ type: MotionType.STATIC, from: W, to: W, rot, turns });
  const DASH_RED = (turns: number, rot: RotationDirection): Hand => ({ type: MotionType.DASH, from: SO_, to: N, rot, turns });
  const STATIC = (loc: GridLocation): Cont => ({ type: MotionType.STATIC, from: loc, to: loc, rot: NOROT });
  const PRO = (from: GridLocation, to: GridLocation, rot: RotationDirection): Cont => ({ type: MotionType.PRO, from, to, rot });

  const STRIPS: Strip[] = [
    makeStrip({
      y: 210, label: "“Lam-High-One”", labelY: 237, opcl: "OPENING", supPos: "hi", captions: true, endThumb: "in", contLetter: "W",
      left: STAT_BLUE(0, NOROT), right: DASH_RED(1, CW), contLeft: STATIC(W), contRight: PRO(N, E, CW),
    }),
    makeStrip({
      y: 306, label: "“Lam-High-One”", labelY: 333, opcl: "CLOSING", supPos: "hi", captions: false, endThumb: "in", contLetter: "Y",
      left: STAT_BLUE(0, NOROT), right: DASH_RED(1, CCW), contLeft: STATIC(W), contRight: PRO(N, W, CCW),
    }),
    makeStrip({
      y: 494, label: "“Lam-Low-One”", labelY: 531, opcl: "OPENING", supPos: "lo", captions: false, endThumb: "out", contLetter: "W",
      left: STAT_BLUE(1, CCW), right: DASH_RED(0, NOROT), contLeft: PRO(W, SO_, CCW), contRight: STATIC(N),
    }),
    makeStrip({
      y: 594, label: "“Lam-Low-One”", labelY: 631, opcl: "CLOSING", supPos: "lo", captions: false, endThumb: "out", contLetter: "Y",
      left: STAT_BLUE(1, CW), right: DASH_RED(0, NOROT), contLeft: PRO(W, N, CW), contRight: STATIC(N),
    }),
  ];

  // ── Layout (pt) - compressed columns to leave room for the continuation column.
  const START_X = 98;
  const HALF_X = 197;
  const END_X = 297;
  const COMB_X = 397;
  const CONT_X = 501;
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

  const poses = (strip: Strip) =>
    strip.halfway.map((h) => ({ ...halfwayPose(h.motion, h.color), fill: h.color === HandSide.LEFT ? BLUE_FILL : RED_FILL }));
</script>

<div class="lam-page">
  <!-- Intro. -->
  <p class="para" style="top:{57 * S}px; font-size:{16 * S}px; line-height:{16.8 * S}px">
    Because of Gamma’s asymmetry, <span class="tka">Λ</span> (Lam) presents an extra variation when adding a turn.<br />
    We can’t use rotational relationship to tell them apart, because there isn’t one to describe.<br />
    Instead, we can disambiguate them with opening and closing.<br />
    This refers to the appearance of the 90° angle if we continue the rotation into a pro-shift.
  </p>
  <p class="para" style="top:{142 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    Take a look at the sequences below and their hypothetical continuation. Note the difference.
  </p>
  <div class="cont-header" style="left:{499 * S}px; top:{165 * S}px">Continuation</div>

  <!-- Λ₁ lead-in. -->
  <p class="para" style="top:{399 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    Now let’s add 1 turn to the static hand, leaving the dash in its base form.
  </p>
  <p class="para" style="top:{433 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    Since the dashing prop is not rotating, there is no rotational relationship to describe.<br />
    However the rotating static prop can still be identified as <em>opening</em> or <em>closing</em>.
  </p>

  <!-- Closing. -->
  <p class="para" style="top:{685 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    It’s not necessary to speak all of the glyph modifications when talking about a letter.<br />
    It would be cumbersome if you were required to say <em>“Lam-Low-One-Closing”</em>.<br />
    In the context of a word or sequence, you can just refer to the base letter <em>“Lam”</em> instead.
  </p>

  <!-- Footnote. -->
  <div class="rule footnote" style="left:0; top:{750.1 * S}px; width:{612 * S}px"></div>
  <p class="para italic" style="top:{755 * S}px; font-size:{14.5 * S}px; line-height:{18 * S}px">
    To shorten this for code, include “op” or “cl” as a final parameter. E.g. “<span class="tka">Λ</span>(0,1,op)” or “<span class="tka">Λ</span>(0,1,cl)”
  </p>

  <!-- Within-group separators + continuation dividers. -->
  <div class="rule thin" style="left:{22 * S}px; top:{290.9 * S}px; width:{546 * S}px"></div>
  <div class="rule thin" style="left:{22 * S}px; top:{578.9 * S}px; width:{546 * S}px"></div>
  <div class="rule vdiv" style="left:{488 * S}px; top:{177 * S}px; height:{210 * S}px"></div>
  <div class="rule vdiv" style="left:{488 * S}px; top:{502 * S}px; height:{173 * S}px"></div>

  <!-- Four breakdown strips. -->
  {#each STRIPS as strip, si (si)}
    {@const hp = poses(strip)}
    <div class="row-letter" style="left:{34 * S}px; top:{(strip.y + 4) * S}px">
      <span class="tka">Λ</span><span class="sup {strip.supPos}" style="color:{strip.supColor}">1</span>
    </div>
    <div class="row-sub" style="left:{6 * S}px; top:{strip.labelY * S}px; width:{104 * S}px">{strip.label}</div>
    <div class="row-opcl" style="left:{6 * S}px; top:{(strip.labelY + 13) * S}px; width:{104 * S}px">{strip.opcl}</div>

    <!-- Captions. -->
    {#if strip.captions}
      <span class="cap" style="left:{80 * S}px; top:{(strip.y - 32) * S}px">thumbs:</span>
      <span class="frame-cap" style="left:{START_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">start</span>
      <span class="frame-cap" style="left:{HALF_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">halfway</span>
      <span class="frame-cap" style="left:{END_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">end</span>
    {/if}
    <span class="thumb-cap" style="left:{START_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">in</span>
    <span class="thumb-cap" style="left:{END_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">{strip.endThumb}</span>
    <span class="cont-opcl" style="left:{(CONT_X - 6) * S}px; top:{(strip.y - 18) * S}px; width:{(SIZE + 30) * S}px">{strip.opcl}</span>

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
    <div class="comb-label" style="left:{COMB_X * S}px; top:{(strip.y + SIZE - 12) * S}px; width:{SIZE * S}px">
      <span class="tka">Λ</span><span class="sup {strip.supPos}" style="color:{strip.supColor}">1</span>
    </div>
    <!-- continuation -->
    <div class="mini" style="left:{CONT_X * S}px; top:{strip.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
      <PictographContainer pictographData={strip.continuation} gridMode={GridMode.DIAMOND} leftPropTypeOverride={PropType.STAFF} rightPropTypeOverride={PropType.STAFF} {...PICTO_FLAGS} />
    </div>
    <div class="cont-letter" style="left:{CONT_X * S}px; top:{(strip.y + SIZE - 18) * S}px; width:{SIZE * S}px">{strip.contLetter}</div>

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
  .lam-page {
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
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
  }
  .rule {
    position: absolute;
    background: #141414;
  }
  .rule.thin {
    height: 1px;
    background: #b8b8be;
  }
  .rule.vdiv {
    width: 1px;
    background: #6c6c74;
  }
  .rule.footnote {
    height: 1px;
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
  .para.italic {
    font-style: italic;
  }
  .tka {
    font-family: "Cambria", Georgia, serif;
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
