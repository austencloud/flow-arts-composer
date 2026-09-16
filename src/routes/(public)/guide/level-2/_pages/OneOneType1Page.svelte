<script lang="ts">
  /**
   * 1|1 Turns - Type 1 - Level 2 body page 13 (manifest `one-one-t1`), faithful to
   * old p14. A turn on BOTH props writes a "1" in the high and low slot (1|1). Four
   * cherry-picked Type 1 (dual-shift) examples, each with turns=1 on both hands:
   *
   *   D¹₁ "D-One-One"  - D[3]: blue n→w pro ccw, red n→e pro cw
   *   I¹₁ "I-One-One"  - I[0]: blue e→s anti ccw, red e→s pro cw
   *   N¹₁ "N-One-One"  - N[2]: blue s→e anti cw, red w→n anti ccw
   *   V¹₁ "V-One-One"  - V[1]: blue w→n anti ccw, red s→w pro cw
   *
   * (MCP-verified.) No continuation and no same/opp - Type 1 hybrids. Both slot
   * glyphs are "1" (red). Halfway poses from the engine interpolator.
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
    id: `l2oo1-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { left, right },
  });
  const stat = (color: HandSide, loc: GridLocation, ori: Orientation) =>
    mo(color, MotionType.STATIC, loc, loc, NOROT, ori, ori);

  type Hand = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection };
  type Strip = {
    y: number;
    letter: string;
    label: string;
    captions: boolean;
    endThumb: string;
    halfThumb: string | null;
    start: ReturnType<typeof pic>;
    end: ReturnType<typeof pic>;
    combined: ReturnType<typeof pic>;
    halfway: { motion: HalfwayMotion; color: HandSide }[];
  };

  const half = (t: MotionType): number => (t === MotionType.ANTI || t === MotionType.DASH ? 1 : 0) + 1;
  const endOf = (t: MotionType): Orientation => (half(t) % 2 === 0 ? IN : OUT);

  function makeStrip(opts: {
    y: number;
    letter: string;
    label: string;
    captions: boolean;
    endThumb: string;
    halfThumb?: string;
    left: Hand;
    right: Hand;
  }): Strip {
    const bEnd = endOf(opts.left.type);
    const rEnd = endOf(opts.right.type);
    const hm = (h: Hand, eo: Orientation): HalfwayMotion => ({
      type: h.type,
      from: h.from,
      to: h.to,
      rot: h.rot,
      startOri: IN,
      endOri: eo,
      turns: 1,
    });
    return {
      y: opts.y,
      letter: opts.letter,
      label: opts.label,
      captions: opts.captions,
      endThumb: opts.endThumb,
      halfThumb: opts.halfThumb ?? null,
      start: pic("start", stat(B, opts.left.from, IN), stat(R, opts.right.from, IN)),
      end: pic("end", stat(B, opts.left.to, bEnd), stat(R, opts.right.to, rEnd)),
      combined: pic(
        "full",
        mo(B, opts.left.type, opts.left.from, opts.left.to, opts.left.rot, IN, bEnd, 1),
        mo(R, opts.right.type, opts.right.from, opts.right.to, opts.right.rot, IN, rEnd, 1)
      ),
      halfway: [
        { motion: hm(opts.left, bEnd), color: B },
        { motion: hm(opts.right, rEnd), color: R },
      ],
    };
  }

  const H = (type: MotionType, from: GridLocation, to: GridLocation, rot: RotationDirection): Hand => ({ type, from, to, rot });
  const PRO = MotionType.PRO;
  const ANTI = MotionType.ANTI;

  const STRIPS: Strip[] = [
    makeStrip({ y: 249, letter: "D", label: "“D-One-One”", captions: true, endThumb: "out",
      left: H(PRO, N, W, CCW), right: H(PRO, N, E, CW) }),
    makeStrip({ y: 365, letter: "I", label: "“I-One-One”", captions: false, endThumb: "mixed",
      left: H(ANTI, E, SO_, CCW), right: H(PRO, E, SO_, CW) }),
    makeStrip({ y: 505, letter: "N", label: "“N-One-One”", captions: false, endThumb: "in", halfThumb: "out",
      left: H(ANTI, SO_, E, CW), right: H(ANTI, W, N, CCW) }),
    makeStrip({ y: 627, letter: "V", label: "“V-One-One”", captions: false, endThumb: "mixed",
      left: H(ANTI, W, N, CCW), right: H(PRO, SO_, W, CW) }),
  ];

  const START_X = 184;
  const HALF_X = 283;
  const END_X = 384;
  const COMB_X = 484;
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

<div class="oo1-page">
  <!-- Intro. -->
  <p class="para" style="top:{59 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    For a turn on both props, add a “1” in both the high and the low slot.<br />
    This can also be written as 1|1.
  </p>
  <p class="para" style="top:{113 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Here are some cherry-picked examples of 1|1 in each Type.<br />
    Since you know all the mechanisms involved, explanation is kept to a minimum.
  </p>

  <!-- Section header. -->
  <div class="section" style="left:{33 * S}px; top:{163 * S}px; font-size:{26 * S}px">
    Type 1 - <span style="color:#1b9fd8">Dual</span><span style="color:#7b3fa0">-Shift</span>
  </div>

  <!-- Closing. -->
  <p class="para" style="top:{740 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Pause at the halfway point of each motion while learning.<br />
    This will ensure accurate timing.
  </p>

  <!-- Rules. -->
  <div class="rule thin" style="left:{122 * S}px; top:{342.5 * S}px; width:{435 * S}px"></div>
  <div class="rule heavy" style="left:{33 * S}px; top:{472.5 * S}px; width:{524 * S}px"></div>
  <div class="rule thin" style="left:{122 * S}px; top:{602.5 * S}px; width:{435 * S}px"></div>

  <!-- Four breakdown strips. -->
  {#each STRIPS as strip, si (si)}
    {@const hp = poses(strip)}
    <div class="row-letter" style="left:{160 * S}px; top:{(strip.y + 2) * S}px">
      {strip.letter}<span class="oo"><span class="sup">1</span><span class="sub">1</span></span>
    </div>
    <div class="row-sub" style="left:{28 * S}px; top:{(strip.y + 42) * S}px; width:{120 * S}px">{strip.label}</div>

    <!-- Captions. -->
    {#if strip.captions}
      <span class="cap" style="left:{166 * S}px; top:{(strip.y - 32) * S}px">thumbs:</span>
      <span class="frame-cap" style="left:{START_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">start</span>
      <span class="frame-cap" style="left:{HALF_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">halfway</span>
      <span class="frame-cap" style="left:{END_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">end</span>
    {/if}
    <span class="thumb-cap" style="left:{START_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">in</span>
    {#if strip.halfThumb}
      <span class="thumb-cap" style="left:{HALF_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">{strip.halfThumb}</span>
    {/if}
    <span class="thumb-cap" style="left:{END_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">{strip.endThumb}</span>

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
      {strip.letter}<span class="oo"><span class="sup">1</span><span class="sub">1</span></span>
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
  .oo1-page {
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
  .para {
    position: absolute;
    left: 0;
    right: 0;
    margin: 0;
    text-align: center;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    color: #141414;
  }
  .section {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    color: #141414;
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
  .oo {
    display: inline-flex;
    flex-direction: column;
    font-size: 0.42em;
    line-height: 0.95;
    vertical-align: middle;
    color: #dc2626;
  }
  .oo .sup {
    display: block;
  }
  .oo .sub {
    display: block;
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
    font-weight: 700;
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
