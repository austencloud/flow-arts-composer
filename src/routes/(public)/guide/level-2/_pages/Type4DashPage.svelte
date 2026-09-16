<script lang="ts">
  /**
   * Type 4 - Dash - Level 2 body page 9 (manifest `t4-dash`), faithful to old
   * p10. Type 4 hybrids combine a dash and a static motion (no shift); PADS puts
   * the dash high and the static low. Two breakdown strips (all from Φ variation
   * [3]: blue s→s static, red s→n dash - MCP-verified):
   *
   *   Φ¹  "Phi-High-One"  - 1 turn on the dash (red).
   *   Φ₁  "Phi-Low-One"   - 1 turn on the static hand (blue).
   *
   * Only one prop rotates per strip, so there is no Same/Opp relationship and no
   * dots - an opposite-direction turn is just the mirror image. High glyph = red,
   * low = blue. Halfway poses come from the engine interpolator.
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
  const { NORTH: N, SOUTH: SO_ } = GridLocation;
  const { IN, OUT } = Orientation;
  const CW = RotationDirection.CLOCKWISE;
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
    id: `l2t4-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { left, right },
  });
  const stat = (color: HandSide, loc: GridLocation, ori: Orientation) =>
    mo(color, MotionType.STATIC, loc, loc, NOROT, ori, ori);

  type Hand = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection; turns: number };
  type Strip = {
    y: number;
    label: string;
    labelY: number;
    supPos: "hi" | "lo";
    supColor: string;
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
    label: string;
    labelY: number;
    supPos: "hi" | "lo";
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
      label: opts.label,
      labelY: opts.labelY,
      supPos: opts.supPos,
      supColor: opts.supPos === "hi" ? RED_FILL : BLUE_FILL,
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

  // Φ = static(blue @S) + dash(red s→n), variation [3].
  const STAT_BLUE = (turns: number, rot: RotationDirection): Hand => ({ type: MotionType.STATIC, from: SO_, to: SO_, rot, turns });
  const DASH_RED = (turns: number): Hand => ({ type: MotionType.DASH, from: SO_, to: N, rot: NOROT, turns });

  const STRIPS: Strip[] = [
    makeStrip({ y: 316, label: "“Phi-High-One”", labelY: 353, supPos: "hi", captions: true, left: STAT_BLUE(0, NOROT), right: DASH_RED(1) }),
    makeStrip({ y: 541, label: "“Phi-Low-One”", labelY: 582, supPos: "lo", captions: false, left: STAT_BLUE(1, CW), right: DASH_RED(0) }),
  ];

  // ── Layout (pt) ─────────────────────────────────────────────────────────────
  const START_X = 171;
  const HALF_X = 271;
  const END_X = 370;
  const COMB_X = 472;
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

<div class="t4-page">
  <!-- Intro. -->
  <p class="para" style="top:{65 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Type 4 hybrids combine a dash with a static motion. There is no shift involved.<br />
    According to PADS, a dash is higher than a static motion.<br />
    We reflect that by using the high slot for dash and the low slot for static.
  </p>

  <!-- Slot rule + big Φ (dash|static). -->
  <p class="para bold" style="top:{146 * S}px; right:{142 * S}px; font-size:{20 * S}px; line-height:{24 * S}px">
    For Type 4,<br />high = dash and low = static.
  </p>
  <p class="para" style="top:{212 * S}px; right:{142 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    This includes <span class="tka">Φ</span>, <span class="tka">Ψ</span>, and <span class="tka">Λ</span>.
  </p>
  <div class="big-letter" style="left:{408 * S}px; top:{150 * S}px">Φ</div>
  <span class="cs hi" style="left:{452 * S}px; top:{155 * S}px">Dash</span>
  <span class="cs lo" style="left:{452 * S}px; top:{205 * S}px">Static</span>
  <span class="phi-cap" style="left:{418 * S}px; top:{222 * S}px">Phi</span>

  <p class="para" style="top:{245 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    First we’ll look at <span class="tka">Φ</span>.
  </p>

  <!-- Post-Φ¹ note. -->
  <p class="para" style="top:{389 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Since only one prop is rotating, there is no rotational relationship to describe.<br />
    If we follow the same dash while rotating in the opposite direction,<br />
    the pictograph is a mirror image and needs no disambiguation.
  </p>

  <!-- Φ₁ lead-in. -->
  <p class="para" style="top:{481 * S}px; font-size:{16 * S}px; line-height:{19 * S}px">
    Now let’s add 1 turn to the static hand, leaving the dash in its base form.
  </p>

  <!-- Closing. -->
  <p class="para bold-italic" style="top:{611 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    Pause at the halfway point and check your position.
  </p>
  <p class="para" style="top:{634 * S}px; font-size:{16 * S}px; line-height:{18 * S}px">
    Here, there is a hand-to-end relationship with the <strong style="color:#2342c9">left</strong> hand and the <strong style="color:#c01b1b">right</strong> pinky end.<br />
    Again, there is no rotational relationship to describe,<br />
    so we don’t need to separate them.
  </p>

  <!-- Footnote. -->
  <div class="rule footnote" style="left:0; top:{705.1 * S}px; width:{612 * S}px"></div>
  <p class="para italic" style="top:{708 * S}px; font-size:{14.5 * S}px; line-height:{18 * S}px">
    When typing the words for sequences containing greek symbols,<br />
    it’s easier to just type the word or its first three letters. E.g. “phi(0,1)”<br />
    The corresponding symbol can easily be swapped in with a simple script.<br />
    The short versions of the seven greek letters are “sig, del, the, om, phi, psi, lam”
  </p>

  <!-- Group separator. -->
  <div class="rule heavy" style="left:0; top:{466.6 * S}px; width:{612 * S}px"></div>

  <!-- Two breakdown strips. -->
  {#each STRIPS as strip, si (si)}
    {@const hp = poses(strip)}
    <div class="row-letter" style="left:{112 * S}px; top:{(strip.y + 4) * S}px">
      Φ<span class="sup {strip.supPos}" style="color:{strip.supColor}">1</span>
    </div>
    <div class="row-sub" style="left:{56 * S}px; top:{strip.labelY * S}px; width:{110 * S}px">{strip.label}</div>

    <!-- Captions. -->
    {#if strip.captions}
      <span class="cap" style="left:{178 * S}px; top:{(strip.y - 32) * S}px">thumbs:</span>
      <span class="frame-cap" style="left:{START_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">start</span>
      <span class="frame-cap" style="left:{HALF_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">halfway</span>
      <span class="frame-cap" style="left:{END_X * S}px; top:{(strip.y - 32) * S}px; width:{SIZE * S}px">end</span>
      <span class="thumb-cap" style="left:{START_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">in</span>
      <span class="thumb-cap" style="left:{END_X * S}px; top:{(strip.y - 16) * S}px; width:{SIZE * S}px">in</span>
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
    <div class="comb-label" style="left:{COMB_X * S}px; top:{(strip.y + SIZE - 22) * S}px; width:{SIZE * S}px">
      Φ<span class="sup {strip.supPos}" style="color:{strip.supColor}">1</span>
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
  .t4-page {
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
  .phi-cap {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-size: 14px;
    color: #3c3c46;
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
