<script lang="ts">
  /**
   * 1|1 - Type 2/3 - Level 2 body page 14 (manifest `one-one-t23`), faithful to old
   * p15. Cherry-picked 1|1 examples where both hands rotate, so a Same/Opp dot
   * applies (dot above = same, below = opp). Both hands carry turns=1.
   *
   *   Type 2 (X, shift+static): X-Same/Opp One-One - X[3] (blue w→w static, red n→e anti ccw).
   *   Type 3 (Θ-, dash+shift):  Θ-Same/Opp One-One - Θ-[3] (blue s→n dash, red n→e pro cw).
   *   Type 3 (Δ-, dash+anti):   Δ-Same/Opp One-One - Δ-[3] (blue n→s dash, red n→e anti ccw).
   *
   * Same = both props rotate the same direction; Opp = opposite (set on the blue
   * hand's rotation relative to red). High slot glyph "1" red, low "1" blue.
   * Self-titled page (section headers, no GuidePage title). Halfway from the engine.
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
    id: `l2oo23-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { left, right },
  });
  const statPic = (color: HandSide, loc: GridLocation, ori: Orientation, rot: RotationDirection = NOROT, turns = 0) =>
    mo(color, MotionType.STATIC, loc, loc, rot, ori, turns % 2 === 1 ? OUT : IN, turns);

  type Hand = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection; turns: number };
  type Strip = {
    y: number;
    letter: string;
    labelLines: string[];
    labelY: number;
    dot: "same" | "opp";
    captions: boolean;
    endThumb: string;
    start: ReturnType<typeof pic>;
    end: ReturnType<typeof pic>;
    combined: ReturnType<typeof pic>;
    halfway: { motion: HalfwayMotion; color: HandSide }[];
  };

  const half = (h: Hand): number => (h.type === MotionType.ANTI || h.type === MotionType.DASH ? 1 : 0) + h.turns;
  const endOf = (h: Hand): Orientation => (half(h) % 2 === 0 ? IN : OUT);
  const handStart = (c: HandSide, h: Hand) => statPic(c, h.from, IN);
  const handEnd = (c: HandSide, h: Hand, eo: Orientation) =>
    h.type === MotionType.STATIC ? statPic(c, h.to, eo) : statPic(c, h.to, eo);
  const handFull = (c: HandSide, h: Hand, eo: Orientation) =>
    h.type === MotionType.STATIC ? statPic(c, h.to, eo, h.rot, h.turns) : mo(c, h.type, h.from, h.to, h.rot, IN, eo, h.turns);

  function makeStrip(opts: {
    y: number;
    letter: string;
    labelLines: string[];
    labelY: number;
    dot: "same" | "opp";
    captions: boolean;
    endThumb: string;
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
      letter: opts.letter,
      labelLines: opts.labelLines,
      labelY: opts.labelY,
      dot: opts.dot,
      captions: opts.captions,
      endThumb: opts.endThumb,
      start: pic("start", handStart(B, opts.left), handStart(R, opts.right)),
      end: pic("end", handEnd(B, opts.left, bEnd), handEnd(R, opts.right, rEnd)),
      combined: pic("full", handFull(B, opts.left, bEnd), handFull(R, opts.right, rEnd)),
      halfway: [
        { motion: hm(opts.left, bEnd), color: B },
        { motion: hm(opts.right, rEnd), color: R },
      ],
    };
  }

  const D = (type: MotionType, from: GridLocation, to: GridLocation, rot: RotationDirection): Hand => ({ type, from, to, rot, turns: 1 });
  const ST = (loc: GridLocation, rot: RotationDirection): Hand => ({ type: MotionType.STATIC, from: loc, to: loc, rot, turns: 1 });
  const DASH = MotionType.DASH;
  const PRO = MotionType.PRO;
  const ANTI = MotionType.ANTI;

  const STRIPS: Strip[] = [
    // Type 2 - X (shift+static). X[3]: blue w→w static, red n→e anti ccw.
    makeStrip({ y: 64, letter: "X", labelLines: ["“X-Same", "One-One”"], labelY: 94, dot: "same", captions: true, endThumb: "mixed",
      left: ST(W, CCW), right: D(ANTI, N, E, CCW) }),
    makeStrip({ y: 169, letter: "X", labelLines: ["“X-Opp", "One-One”"], labelY: 199, dot: "opp", captions: false, endThumb: "mixed",
      left: ST(W, CW), right: D(ANTI, N, E, CCW) }),
    // Type 3 - Θ- (dash+shift). Θ-[3]: blue s→n dash, red n→e pro cw.
    makeStrip({ y: 346, letter: "Θ-", labelLines: ["“Theta-Dash", "Same", "One-One”"], labelY: 368, dot: "same", captions: true, endThumb: "mixed",
      left: D(DASH, SO_, N, CW), right: D(PRO, N, E, CW) }),
    makeStrip({ y: 455, letter: "Θ-", labelLines: ["“Theta-Dash", "Opp", "One-One”"], labelY: 477, dot: "opp", captions: false, endThumb: "out",
      left: D(DASH, SO_, N, CCW), right: D(PRO, N, E, CW) }),
    // Type 3 - Δ- (dash+anti). Δ-[3]: blue n→s dash, red n→e anti ccw.
    makeStrip({ y: 574, letter: "Δ-", labelLines: ["“Delta-Dash", "Same", "One-One”"], labelY: 596, dot: "same", captions: false, endThumb: "mixed",
      left: D(DASH, N, SO_, CCW), right: D(ANTI, N, E, CCW) }),
    makeStrip({ y: 683, letter: "Δ-", labelLines: ["“Delta-Dash", "Opp", "One-One”"], labelY: 705, dot: "opp", captions: false, endThumb: "out",
      left: D(DASH, N, SO_, CW), right: D(ANTI, N, E, CCW) }),
  ];

  const START_X = 191;
  const HALF_X = 290;
  const END_X = 391;
  const COMB_X = 491;
  const SIZE = 78;
  const LETTER_X = 100;
  const DOT_X = 112;
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

<div class="oo23-page">
  <!-- Section headers. -->
  <div class="section" style="left:{22 * S}px; top:{4 * S}px; font-size:{26 * S}px">
    Type 2 - <span style="color:#7b3fa0">Shift</span>
  </div>
  <div class="section" style="left:{22 * S}px; top:{279 * S}px; font-size:{26 * S}px">
    Type 3 - <span style="color:#2e9e5b">Cross</span><span style="color:#7b3fa0">-Shift</span>
  </div>

  <!-- Rules. -->
  <div class="rule thin" style="left:{119 * S}px; top:{150.6 * S}px; width:{444 * S}px"></div>
  <div class="rule heavy" style="left:{28 * S}px; top:{270.9 * S}px; width:{564 * S}px"></div>
  <div class="rule thin" style="left:{119 * S}px; top:{437.7 * S}px; width:{444 * S}px"></div>
  <div class="rule thin" style="left:{42 * S}px; top:{542.8 * S}px; width:{521 * S}px"></div>
  <div class="rule thin" style="left:{119 * S}px; top:{667.8 * S}px; width:{444 * S}px"></div>

  <!-- Six breakdown strips. -->
  {#each STRIPS as strip, si (si)}
    {@const hp = poses(strip)}
    {#each strip.labelLines as line, li (li)}
      <div class="row-sub" style="left:{4 * S}px; top:{(strip.labelY + li * 13) * S}px; width:{88 * S}px">{line}</div>
    {/each}
    <div class="row-letter" style="left:{LETTER_X * S}px; top:{(strip.y + 20) * S}px">
      <span class="tka">{strip.letter}</span><span class="oo"><span class="sup">1</span><span class="sub">1</span></span>
    </div>
    {#if strip.dot === "same"}
      <span class="dir-dot" style="left:{DOT_X * S}px; top:{(strip.y + 8) * S}px"></span>
    {:else}
      <span class="dir-dot" style="left:{DOT_X * S}px; top:{(strip.y + 54) * S}px"></span>
    {/if}

    <!-- Captions. -->
    {#if strip.captions}
      <span class="cap" style="left:{186 * S}px; top:{(strip.y - 32) * S}px">thumbs:</span>
      <span class="frame-cap" style="left:{START_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">start</span>
      <span class="frame-cap" style="left:{HALF_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">halfway</span>
      <span class="frame-cap" style="left:{END_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">end</span>
    {/if}
    <span class="thumb-cap" style="left:{START_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">in</span>
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
      <span class="tka">{strip.letter}</span><span class="oo"><span class="sup">1</span><span class="sub">1</span></span>
    </div>
    {#if strip.dot === "same"}
      <span class="dir-dot" style="left:{(COMB_X + SIZE / 2) * S}px; top:{(strip.y + SIZE - 20) * S}px"></span>
    {:else}
      <span class="dir-dot" style="left:{(COMB_X + SIZE / 2) * S}px; top:{(strip.y + SIZE + 4) * S}px"></span>
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
  .oo23-page {
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
  .dir-dot {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #141414;
    transform: translateX(-50%);
  }
  .section {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    color: #141414;
  }
  .tka {
    font-family: "Cambria", Georgia, serif;
  }
  .row-letter {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 32px;
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
  }
  .oo .sup {
    display: block;
    color: #dc2626;
  }
  .oo .sub {
    display: block;
    color: #2e3192;
  }
  .row-sub {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-size: 12px;
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
