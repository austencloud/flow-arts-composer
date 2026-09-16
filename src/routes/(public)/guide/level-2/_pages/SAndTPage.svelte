<script lang="ts">
  /**
   * S and T - Level 2 body page 6 (manifest `s-and-t`), faithful to old p7.
   * S and T are the leading/following hybrids: their two hands trace a matching
   * shift path one position apart (leader ahead, follower behind), so the
   * high/low slots mean leading/following instead of the pro/anti of Type 1.
   *
   * Four breakdown strips, each start → halfway → end = combined:
   *   S¹ "S-High-One"  - S[6] (left w→s pro ccw leads, right s→e pro ccw follows), turn on leading (left)
   *   S₁ "S-Low-One"   - same base, turn on following (right)
   *   T¹ "T-High-One"  - T[6] (left w→s anti cw leads, right s→e anti cw follows), turn on leading (left)
   *   T₁ "T-Low-One"   - same base, turn on following (right)
   *
   * (S/T verified via MCP list_letter_variations; variation [6] matches the
   * original's start left@W right@S / end left@S right@E framing.) Halfway staff
   * poses come from the engine interpolator at t=0.5 (halfway-pose.ts). On this
   * page the slot hand assignment flips vs Type 1: high = right, low = left.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
    Orientation,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    GridMode,
    GridLocation,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { halfwayPose, type HalfwayMotion } from "../_data/halfway-pose";

  const S = 816 / 612;
  const { EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
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
    id: `l2st-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { left, right },
  });
  const stat = (color: HandSide, loc: GridLocation, ori: Orientation) =>
    mo(color, MotionType.STATIC, loc, loc, NOROT, ori, ori);

  type Strip = {
    y: number;
    letter: string;
    supColor: string;
    supPos: "hi" | "lo";
    sub: string;
    startTop: string;
    endTop: string;
    start: ReturnType<typeof pic>;
    end: ReturnType<typeof pic>;
    combined: ReturnType<typeof pic>;
    halfway: { motion: HalfwayMotion; color: HandSide }[];
  };

  function makeStrip(opts: {
    y: number;
    letter: string;
    supPos: "hi" | "lo";
    sub: string;
    left: {
      type: MotionType;
      from: GridLocation;
      to: GridLocation;
      rot: RotationDirection;
    };
    right: {
      type: MotionType;
      from: GridLocation;
      to: GridLocation;
      rot: RotationDirection;
    };
    leftTurns: number;
    rightTurns: number;
  }): Strip {
    const halfTurns = (type: MotionType, turns: number) =>
      (type === MotionType.ANTI || type === MotionType.DASH ? 1 : 0) + turns;
    const endOri = (type: MotionType, turns: number): Orientation =>
      halfTurns(type, turns) % 2 === 0 ? IN : OUT;
    const bEnd = endOri(opts.left.type, opts.leftTurns);
    const rEnd = endOri(opts.right.type, opts.rightTurns);
    const bHalf: HalfwayMotion = {
      type: opts.left.type,
      from: opts.left.from,
      to: opts.left.to,
      rot: opts.left.rot,
      startOri: IN,
      endOri: bEnd,
      turns: opts.leftTurns,
    };
    const rHalf: HalfwayMotion = {
      type: opts.right.type,
      from: opts.right.from,
      to: opts.right.to,
      rot: opts.right.rot,
      startOri: IN,
      endOri: rEnd,
      turns: opts.rightTurns,
    };
    return {
      y: opts.y,
      letter: opts.letter,
      // On S/T the slot hand assignment flips vs Type 1: high = right, low = left.
      supColor: opts.supPos === "hi" ? RED_FILL : BLUE_FILL,
      supPos: opts.supPos,
      sub: opts.sub,
      startTop: "in",
      endTop: "mixed",
      start: pic(
        `${opts.letter}${opts.supPos}-start`,
        stat(B, opts.left.from, IN),
        stat(R, opts.right.from, IN)
      ),
      end: pic(
        `${opts.letter}${opts.supPos}-end`,
        stat(B, opts.left.to, bEnd),
        stat(R, opts.right.to, rEnd)
      ),
      combined: pic(
        `${opts.letter}${opts.supPos}-full`,
        mo(
          B,
          opts.left.type,
          opts.left.from,
          opts.left.to,
          opts.left.rot,
          IN,
          bEnd,
          opts.leftTurns
        ),
        mo(
          R,
          opts.right.type,
          opts.right.from,
          opts.right.to,
          opts.right.rot,
          IN,
          rEnd,
          opts.rightTurns
        )
      ),
      halfway: [
        { motion: bHalf, color: B },
        { motion: rHalf, color: R },
      ],
    };
  }

  // S = pro|pro; T = anti|anti. Both use variation [6]: left w→s leads, right s→e follows.
  const S_BLUE = { type: MotionType.PRO, from: W, to: SO_, rot: CCW };
  const S_RED = { type: MotionType.PRO, from: SO_, to: E, rot: CCW };
  const T_BLUE = { type: MotionType.ANTI, from: W, to: SO_, rot: CW };
  const T_RED = { type: MotionType.ANTI, from: SO_, to: E, rot: CW };

  const STRIPS: Strip[] = [
    makeStrip({
      y: 332,
      letter: "S",
      supPos: "hi",
      sub: "“S-High-One”",
      left: S_BLUE,
      right: S_RED,
      leftTurns: 1,
      rightTurns: 0,
    }),
    makeStrip({
      y: 432,
      letter: "S",
      supPos: "lo",
      sub: "“S-Low-One”",
      left: S_BLUE,
      right: S_RED,
      leftTurns: 0,
      rightTurns: 1,
    }),
    makeStrip({
      y: 557,
      letter: "T",
      supPos: "hi",
      sub: "“T-High-One”",
      left: T_BLUE,
      right: T_RED,
      leftTurns: 1,
      rightTurns: 0,
    }),
    makeStrip({
      y: 657,
      letter: "T",
      supPos: "lo",
      sub: "“T-Low-One”",
      left: T_BLUE,
      right: T_RED,
      leftTurns: 0,
      rightTurns: 1,
    }),
  ];

  // ── Layout (pt, columns shared with the Type 1 page) ─────────────────────────
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

  const poses = (strip: Strip) =>
    strip.halfway.map((h) => ({
      ...halfwayPose(h.motion, h.color),
      fill: h.color === HandSide.LEFT ? BLUE_FILL : RED_FILL,
    }));
</script>

<div class="st-page">
  <!-- Intro. -->
  <p
    class="para"
    style="top:{59 * S}px; font-size:{16 * S}px; line-height:{19 * S}px"
  >
    S and T are a different type of hybrid.
  </p>
  <p
    class="para"
    style="top:{98 * S}px; font-size:{16 * S}px; line-height:{19.2 * S}px"
  >
    Even though their motions are a matching shift type (pro|pro, anti|anti),
    each has one hand <strong><em>leading</em></strong> and the other
    <strong><em>following</em></strong>. Though this doesn’t affect their base
    forms, it produces additional variations when modifying their motions.
  </p>
  <p
    class="para bold"
    style="top:{152 * S}px; font-size:{16 * S}px; line-height:{19 * S}px"
  >
    S and T are the only letters with this unique quality.
  </p>
  <p
    class="para"
    style="top:{196 * S}px; font-size:{16 * S}px; line-height:{19 * S}px"
  >
    Fortunately, we have a tool to disambiguate hybrids - the high/low slots.
  </p>

  <!-- Slot rule + big S (leading|following). -->
  <p
    class="para bold"
    style="top:{224 * S}px; right:{142 * S}px; font-size:{20 *
      S}px; line-height:{24 * S}px"
  >
    For S and T,<br />high = leading and low = following.
  </p>
  <div class="big-letter" style="left:{430 * S}px; top:{228 * S}px">S</div>
  <span class="cs hi" style="left:{462 * S}px; top:{228 * S}px">Leading</span>
  <span class="cs lo" style="left:{462 * S}px; top:{278 * S}px">Following</span>

  <!-- Bottom note (U/V carve-out). -->
  <p
    class="para bold-italic"
    style="top:{740 * S}px; font-size:{15 * S}px; line-height:{21.7 * S}px"
  >
    Note that these leading/following rules do NOT apply to U and V.
  </p>
  <p
    class="para"
    style="top:{761.7 * S}px; font-size:{15 * S}px; line-height:{21.7 * S}px"
  >
    Even though U and V have a leader/follower, their slots refer to pro/anti.
  </p>

  <!-- Group separators: thin within-group rules + one heavy between S and T. -->
  <div
    class="rule thin"
    style="left:{170 * S}px; top:{412 * S}px; width:{380 * S}px"
  ></div>
  <div
    class="rule heavy"
    style="left:0; top:{515 * S}px; width:{612 * S}px"
  ></div>
  <div
    class="rule thin"
    style="left:{170 * S}px; top:{637 * S}px; width:{380 * S}px"
  ></div>

  <!-- Four breakdown strips. -->
  {#each STRIPS as strip, si (si)}
    {@const hp = poses(strip)}
    <div class="row-letter" style="left:{92 * S}px; top:{(strip.y + 4) * S}px">
      {strip.letter}<span
        class="sup {strip.supPos}"
        style="color:{strip.supColor}">1</span
      >
    </div>
    <div
      class="row-sub"
      style="left:{56 * S}px; top:{(strip.y + 42) * S}px; width:{88 * S}px"
    >
      {strip.sub}
    </div>

    <!-- Captions. -->
    {#if si === 0}
      <span class="cap" style="left:{150 * S}px; top:{(strip.y - 30) * S}px"
        >thumbs:</span
      >
      <span
        class="frame-cap"
        style="left:{START_X * S}px; top:{(strip.y - 44) * S}px; width:{SIZE *
          S}px">start</span
      >
      <span
        class="frame-cap"
        style="left:{HALF_X * S}px; top:{(strip.y - 44) * S}px; width:{SIZE *
          S}px">halfway</span
      >
      <span
        class="frame-cap"
        style="left:{END_X * S}px; top:{(strip.y - 44) * S}px; width:{SIZE *
          S}px">end</span
      >
    {:else if si === 2}
      <span class="cap" style="left:{150 * S}px; top:{(strip.y - 30) * S}px"
        >thumbs:</span
      >
    {/if}
    <span
      class="thumb-cap"
      style="left:{START_X * S}px; top:{(strip.y - 26) * S}px; width:{SIZE *
        S}px">{strip.startTop}</span
    >
    <span
      class="thumb-cap"
      style="left:{END_X * S}px; top:{(strip.y - 26) * S}px; width:{SIZE * S}px"
      >{strip.endTop}</span
    >

    <!-- start -->
    <div
      class="mini"
      style="left:{START_X * S}px; top:{strip.y * S}px; width:{SIZE *
        S}px; height:{SIZE * S}px"
    >
      <PictographContainer
        pictographData={strip.start}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.STAFF}
        rightPropTypeOverride={PropType.STAFF}
        {...PICTO_FLAGS}
      />
    </div>
    <!-- halfway -->
    <div
      class="mini"
      style="left:{HALF_X * S}px; top:{strip.y * S}px; width:{SIZE *
        S}px; height:{SIZE * S}px"
    >
      <svg class="halfway-staff" viewBox="0 0 950 950" aria-hidden="true">
        {#each hp as p (p.fill)}
          <g
            transform="translate({p.cx}, {p.cy}) rotate({p.deg}) translate(-126.4, -38.9)"
          >
            <path d={STAFF_D} fill={p.fill} />
          </g>
        {/each}
      </svg>
    </div>
    <!-- end -->
    <div
      class="mini"
      style="left:{END_X * S}px; top:{strip.y * S}px; width:{SIZE *
        S}px; height:{SIZE * S}px"
    >
      <PictographContainer
        pictographData={strip.end}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.STAFF}
        rightPropTypeOverride={PropType.STAFF}
        {...PICTO_FLAGS}
      />
    </div>
    <!-- combined -->
    <div
      class="mini"
      style="left:{COMB_X * S}px; top:{strip.y * S}px; width:{SIZE *
        S}px; height:{SIZE * S}px"
    >
      <PictographContainer
        pictographData={strip.combined}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.STAFF}
        rightPropTypeOverride={PropType.STAFF}
        {...PICTO_FLAGS}
      />
    </div>
    <div
      class="comb-label"
      style="left:{COMB_X * S}px; top:{(strip.y + SIZE - 12) *
        S}px; width:{SIZE * S}px"
    >
      {strip.letter}<span
        class="sup {strip.supPos}"
        style="color:{strip.supColor}">1</span
      >
    </div>

    <!-- flow arrows + "=" -->
    <svg
      class="flow-arrow"
      style="left:{(HALF_X - 22) * S}px; top:{(rowMid(strip.y) - 5) *
        S}px; width:{ARROW_W * S}px; height:{10 * S}px"
      viewBox="0 0 {ARROW_W} 10"
      aria-hidden="true"
    >
      <line
        x1="0"
        y1="5"
        x2={ARROW_W - 7}
        y2="5"
        stroke="#141414"
        stroke-width="2"
      /><polygon
        points="{ARROW_W - 8},1.3 {ARROW_W},5 {ARROW_W - 8},8.7"
        fill="#141414"
      />
    </svg>
    <svg
      class="flow-arrow"
      style="left:{(END_X - 22) * S}px; top:{(rowMid(strip.y) - 5) *
        S}px; width:{ARROW_W * S}px; height:{10 * S}px"
      viewBox="0 0 {ARROW_W} 10"
      aria-hidden="true"
    >
      <line
        x1="0"
        y1="5"
        x2={ARROW_W - 7}
        y2="5"
        stroke="#141414"
        stroke-width="2"
      /><polygon
        points="{ARROW_W - 8},1.3 {ARROW_W},5 {ARROW_W - 8},8.7"
        fill="#141414"
      />
    </svg>
    <span
      class="equals"
      style="left:{(COMB_X - 15) * S}px; top:{rowMid(strip.y) * S}px">=</span
    >
  {/each}
</div>

<style>
  .st-page {
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
  .para.bold-italic {
    font-weight: 700;
    font-style: italic;
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
