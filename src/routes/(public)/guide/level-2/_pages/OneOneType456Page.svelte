<script lang="ts">
  /**
   * 1|1 - Type 4/5/6 - Level 2 body page 15 (manifest `one-one-t456`), faithful to
   * old p16. One-one examples for the dash-family and static types where both hands
   * carry turns=1, so a Same/Opp (or Open/Close for gamma) applies.
   *
   *   Type 4 (Φ, dash+static):  Phi-Same/Opp One-One - Φ[1] (blue n→n static, red n→s dash).
   *   Type 5 (Ψ-, dual-dash):   Psi-Dash Same/Opp One-One - Ψ-[1] (both n→s dash).
   *   Type 6 (Γ, dual-static):  Gamma Opp One-One, Open + Close - γ[0] (blue s→s, red e→e static).
   *
   * Same = both props rotate the same direction; Opp = opposite. Gamma's two props
   * always rotate oppositely here; Open vs Close is the two ways that opposition
   * resolves (angle opens vs closes). Glyph "1" high slot blue, low slot red - note
   * this is the reverse of p15's ordering, matching the original artboard. Self-titled
   * (section headers, no GuidePage title). Halfway poses from the engine interpolator.
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
  const DASH = MotionType.DASH;
  const STAT = MotionType.STATIC;

  const STAFF_D =
    "M251.4 67.7V10.1c0-4.8-4.1-8.7-9.1-8.7s-9.1 3.9-9.1 8.7v19.2H10.3c-4.9 0-8.9 3.8-8.9 8.5V41c0 4.6 4 8.5 8.9 8.5h222.9v18.2c0 4.8 4.1 8.7 9.1 8.7s9.1-3.9 9.1-8.7z";
  const RED_FILL = "#DC2626";
  const BLUE_FILL = "#2E3192";
  const flip = (o: Orientation) => (o === IN ? OUT : IN);

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
    id: `l2oo456-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { left, right },
  });

  type Hand = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection; turns: number };
  const H = (type: MotionType, from: GridLocation, to: GridLocation, rot: RotationDirection): Hand => ({
    type,
    from,
    to,
    rot,
    turns: 1,
  });
  const half = (h: Hand): number => (h.type === MotionType.ANTI || h.type === DASH ? 1 : 0) + h.turns;
  const endOf = (h: Hand, so: Orientation): Orientation => (half(h) % 2 === 0 ? so : flip(so));

  type Strip = {
    y: number;
    letter: string;
    labelLines: string[];
    labelTopY: number;
    tag?: string;
    tagY?: number;
    dot: "same" | "opp";
    startThumb: string;
    endThumb: string;
    showComb: boolean;
    start: ReturnType<typeof pic>;
    end: ReturnType<typeof pic>;
    combined: ReturnType<typeof pic>;
    halfway: { motion: HalfwayMotion; color: HandSide }[];
  };

  function makeStrip(opts: {
    y: number;
    letter: string;
    labelLines: string[];
    labelTopY: number;
    tag?: string;
    tagY?: number;
    dot: "same" | "opp";
    startThumb: string;
    endThumb: string;
    showComb: boolean;
    startOri: Orientation;
    left: Hand;
    right: Hand;
  }): Strip {
    const so = opts.startOri;
    const bEnd = endOf(opts.left, so);
    const rEnd = endOf(opts.right, so);
    const startPic = (c: HandSide, h: Hand) => mo(c, STAT, h.from, h.from, NOROT, so, so);
    const endPic = (c: HandSide, h: Hand, eo: Orientation) => mo(c, STAT, h.to, h.to, NOROT, eo, eo);
    const fullPic = (c: HandSide, h: Hand, eo: Orientation) =>
      h.type === STAT ? mo(c, STAT, h.to, h.to, h.rot, so, eo, h.turns) : mo(c, h.type, h.from, h.to, h.rot, so, eo, h.turns);
    const hm = (h: Hand, eo: Orientation): HalfwayMotion => ({
      type: h.type,
      from: h.from,
      to: h.to,
      rot: h.rot,
      startOri: so,
      endOri: eo,
      turns: h.turns,
    });
    return {
      y: opts.y,
      letter: opts.letter,
      labelLines: opts.labelLines,
      labelTopY: opts.labelTopY,
      tag: opts.tag,
      tagY: opts.tagY,
      dot: opts.dot,
      startThumb: opts.startThumb,
      endThumb: opts.endThumb,
      showComb: opts.showComb,
      start: pic("start", startPic(B, opts.left), startPic(R, opts.right)),
      end: pic("end", endPic(B, opts.left, bEnd), endPic(R, opts.right, rEnd)),
      combined: pic("full", fullPic(B, opts.left, bEnd), fullPic(R, opts.right, rEnd)),
      halfway: [
        { motion: hm(opts.left, bEnd), color: B },
        { motion: hm(opts.right, rEnd), color: R },
      ],
    };
  }

  const STRIPS: Strip[] = [
    // Type 4 - Φ (dash+static). Φ[1]: blue n→n static, red n→s dash.
    makeStrip({ y: 56, letter: "Φ", labelLines: ["“Phi-Same", "One-One”"], labelTopY: 68.1, dot: "same",
      startThumb: "in", endThumb: "mixed", showComb: false, startOri: IN,
      left: H(STAT, N, N, CW), right: H(DASH, N, SO_, CW) }),
    makeStrip({ y: 166, letter: "Φ", labelLines: ["“Phi-Opp", "One-One”"], labelTopY: 184.4, dot: "opp",
      startThumb: "in", endThumb: "mixed", showComb: false, startOri: IN,
      left: H(STAT, N, N, CCW), right: H(DASH, N, SO_, CW) }),
    // Type 5 - Ψ- (dual-dash). Ψ-[1]: both n→s dash.
    makeStrip({ y: 316, letter: "Ψ-", labelLines: ["“Psi-Dash", "Same", "One-One”"], labelTopY: 330.2, dot: "same",
      startThumb: "in", endThumb: "mixed", showComb: true, startOri: IN,
      left: H(DASH, N, SO_, CW), right: H(DASH, N, SO_, CW) }),
    makeStrip({ y: 421, letter: "Ψ-", labelLines: ["“Psi-Dash", "Opp", "One-One”"], labelTopY: 440.1, dot: "opp",
      startThumb: "in", endThumb: "mixed", showComb: true, startOri: IN,
      left: H(DASH, N, SO_, CCW), right: H(DASH, N, SO_, CW) }),
    // Type 6 - Γ (dual-static). γ[0]: blue s→s static, red e→e static.
    makeStrip({ y: 576, letter: "Γ", labelLines: ["“Gamma", "Opp", "One-One”"], labelTopY: 591.2, tag: "OPEN", tagY: 632.8,
      dot: "opp", startThumb: "out", endThumb: "in", showComb: true, startOri: OUT,
      left: H(STAT, SO_, SO_, CCW), right: H(STAT, E, E, CW) }),
    makeStrip({ y: 686, letter: "Γ", labelLines: ["“Gamma", "Opp", "One-One”"], labelTopY: 701.2, tag: "CLOSE", tagY: 742.9,
      dot: "opp", startThumb: "in", endThumb: "out", showComb: true, startOri: IN,
      left: H(STAT, SO_, SO_, CW), right: H(STAT, E, E, CCW) }),
  ];

  const START_X = 183;
  const HALF_X = 283;
  const END_X = 383;
  const COMB_X = 483;
  const SIZE = 78;
  const LETTER_X = 113;
  const DOT_X = 125;
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

  const HEADERS = [
    { y: 12.2, x: 22, parts: [{ t: "Type 4 - ", c: "#231f20" }, { t: "Dash", c: "#0ea14b" }] },
    { y: 259.5, x: 22, parts: [{ t: "Type 5 - ", c: "#231f20" }, { t: "Dual", c: "#00aeef" }, { t: "-", c: "#231f20" }, { t: "Dash", c: "#0ea14b" }] },
    { y: 530.8, x: 24, parts: [{ t: "Type 6 - ", c: "#231f20" }, { t: "Static", c: "#f26522" }] },
  ];
  const RULES = [
    { y: 149.5, x: 35, w: 519, heavy: false },
    { y: 259.1, x: 23, w: 564, heavy: true },
    { y: 412.0, x: 35, w: 519, heavy: false },
    { y: 520.8, x: 23, w: 564, heavy: true },
    { y: 672.9, x: 35, w: 519, heavy: false },
  ];
</script>

<div class="oo456-page">
  {#each HEADERS as h (h.y)}
    <div class="section" style="left:{h.x * S}px; top:{h.y * S}px; font-size:{26 * S}px">
      {#each h.parts as part, pi (pi)}<span style="color:{part.c}">{part.t}</span>{/each}
    </div>
  {/each}

  {#each RULES as r (r.y)}
    <div class="rule {r.heavy ? 'heavy' : 'thin'}" style="left:{r.x * S}px; top:{r.y * S}px; width:{r.w * S}px"></div>
  {/each}

  {#each STRIPS as strip, si (si)}
    {@const hp = poses(strip)}
    {#each strip.labelLines as line, li (li)}
      <div class="row-sub" style="left:{28 * S}px; top:{(strip.labelTopY + li * 14.4) * S}px; width:{86 * S}px">{line}</div>
    {/each}
    {#if strip.tag}
      <div class="row-tag" style="left:{28 * S}px; top:{strip.tagY! * S}px; width:{86 * S}px">{strip.tag}</div>
    {/if}
    <div class="row-letter" style="left:{LETTER_X * S}px; top:{(strip.y + 24) * S}px">
      <span class="tka">{strip.letter}</span><span class="oo"><span class="sup">1</span><span class="sub">1</span></span>
    </div>
    {#if strip.dot === "same"}
      <span class="dir-dot" style="left:{DOT_X * S}px; top:{(strip.y + 12) * S}px"></span>
    {:else}
      <span class="dir-dot" style="left:{DOT_X * S}px; top:{(strip.y + 54) * S}px"></span>
    {/if}

    <!-- Thumb captions over start + end columns. -->
    <span class="thumb-cap" style="left:{START_X * S}px; top:{(strip.y - 11) * S}px; width:{SIZE * S}px">{strip.startThumb}</span>
    <span class="thumb-cap" style="left:{END_X * S}px; top:{(strip.y - 11) * S}px; width:{SIZE * S}px">{strip.endThumb}</span>

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
    {#if strip.showComb}
      <div class="comb-label" style="left:{COMB_X * S}px; top:{(strip.y + SIZE - 10) * S}px; width:{SIZE * S}px">
        <span class="tka">{strip.letter}</span><span class="oo"><span class="sup">1</span><span class="sub">1</span></span>
      </div>
      {#if strip.dot === "same"}
        <span class="dir-dot" style="left:{(COMB_X + SIZE / 2) * S}px; top:{(strip.y + SIZE - 18) * S}px"></span>
      {:else}
        <span class="dir-dot" style="left:{(COMB_X + SIZE / 2) * S}px; top:{(strip.y + SIZE + 6) * S}px"></span>
      {/if}
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
  .oo456-page {
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
  }
  .tka {
    font-family: "Cambria", Georgia, serif;
  }
  .row-letter {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 30px;
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
    color: #2e3192;
  }
  .oo .sub {
    display: block;
    color: #dc2626;
  }
  .row-sub {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-size: 12px;
    color: #3c3c46;
  }
  .row-tag {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.03em;
    color: #141414;
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
