<script lang="ts">
  /**
   * Glyphs / PADS - Level 2 body page 4 (manifest `glyphs-pads`), faithful to
   * old p5. High/low turn slots, the PADS priority list, and the five hybrid
   * examples - every pictograph MCP-verified against the dataset:
   *
   *   Type 1 pro|anti  = C[11]  (blue s→w pro cw · red n→e anti ccw)
   *   S and T          = S[8]   (blue s→w pro cw · red e→s pro cw)
   *   Type 2           = W[9]   (blue s→w pro cw · red static e)
   *   Type 3           = Σ-[9]  (blue s→w pro cw · red s→n dash)
   *   Type 4           = Φ[4]   (blue e→w dash · red static e)
   *   Left/Right ex.   = A[3]   (blue s→w pro cw · red n→e pro cw)
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

  const S = 816 / 612;
  const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
  const { IN, OUT } = Orientation;
  const CW = RotationDirection.CLOCKWISE;
  const CCW = RotationDirection.COUNTER_CLOCKWISE;
  const NOROT = RotationDirection.NO_ROTATION;

  const mo = (
    color: HandSide,
    type: MotionType,
    from: GridLocation,
    to: GridLocation,
    rot: RotationDirection,
    so: Orientation,
    eo: Orientation
  ) =>
    createMotionData({
      motionType: type,
      rotationDirection: rot,
      startLocation: from,
      endLocation: to,
      startOrientation: so,
      endOrientation: eo,
      turns: 0,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  const pic = (id: string, left, right) => ({
    id: `l2gp-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { left, right },
  });

  const B = HandSide.LEFT;
  const R = HandSide.RIGHT;
  // MCP-verified hybrid examples (variation indices in the header comment).
  const EX_C = pic("c11", mo(B, MotionType.PRO, SO_, W, CW, IN, IN), mo(R, MotionType.ANTI, N, E, CCW, IN, OUT));
  const EX_S = pic("s8", mo(B, MotionType.PRO, SO_, W, CW, IN, IN), mo(R, MotionType.PRO, E, SO_, CW, IN, IN));
  const EX_W = pic("w9", mo(B, MotionType.PRO, SO_, W, CW, IN, IN), mo(R, MotionType.STATIC, E, E, NOROT, IN, IN));
  const EX_SIGD = pic("sigd9", mo(B, MotionType.PRO, SO_, W, CW, IN, IN), mo(R, MotionType.DASH, SO_, N, NOROT, IN, OUT));
  const EX_PHI = pic("phi4", mo(B, MotionType.DASH, E, W, NOROT, IN, OUT), mo(R, MotionType.STATIC, E, E, NOROT, IN, IN));
  const EX_A = pic("a3", mo(B, MotionType.PRO, SO_, W, CW, IN, IN), mo(R, MotionType.PRO, N, E, CW, IN, IN));

  // ── Five hybrid columns ─────────────────────────────────────────────────────
  type Col = {
    cx: number; // column center x (pt)
    head?: { t1: string; t2: string; parts: [string, string][] };
    data: ReturnType<typeof pic>;
    hi: string;
    lo: string;
    letters: string[];
  };
  const DUAL = "#00aeef";
  const SHIFT = "#7a28a8";
  const CROSS = "#14a44d";
  const DASHC = "#14a44d";
  const COLS: Col[] = [
    {
      cx: 78,
      head: { t1: "Type 1", t2: "", parts: [["Dual", DUAL], ["-Shift", SHIFT]] },
      data: EX_C,
      hi: "Pro",
      lo: "Anti",
      letters: ["C, F, I, L,", "O, R, U, V"],
    },
    { cx: 212, data: EX_S, hi: "Leading", lo: "Following", letters: ["S, T"] },
    {
      cx: 348,
      head: { t1: "Type 2", t2: "", parts: [["Shift", SHIFT]] },
      data: EX_W,
      hi: "Shift",
      lo: "Static",
      letters: ["W, X, Y, Z,", "Σ, Δ, Θ, Ω"],
    },
    {
      cx: 462,
      head: { t1: "Type 3", t2: "", parts: [["Cross", CROSS], ["-Shift", SHIFT]] },
      data: EX_SIGD,
      hi: "Shift",
      lo: "Dash",
      letters: ["W-, X-, Y-, Z-,", "Σ-, Δ-, Θ-, Ω-"],
    },
    {
      cx: 562,
      head: { t1: "Type 4", t2: "", parts: [["Dash", DASHC]] },
      data: EX_PHI,
      hi: "Dash",
      lo: "Static",
      letters: ["Φ, Ψ, Λ"],
    },
  ];
  const VRULES = [146, 288, 412, 514];
  const COL_TOP = 428;
  const BOX = 82;
  const BOX_Y = 470;

  type Para = { y: number; fs: number; lh: number; html: string; x?: number; w?: number; left?: boolean };
  const PARAS: Para[] = [
    { y: 58, fs: 16, lh: 19, html: "A <strong>glyph</strong> is a letter combined with other characters, such as numbers or symbols." },
    {
      y: 92,
      fs: 15.5,
      lh: 19,
      html: "To the right of each letter, there are two slots - high and low.<br>These slots contain numbers that indicate turns.",
    },
    {
      x: 36,
      w: 300,
      y: 236,
      fs: 14.5,
      lh: 18,
      left: true,
      html: "In a hybrid, motion types are<br>different and must be disambiguated.<br>These rules indicate where to place numbers:",
    },
    {
      x: 322,
      w: 262,
      y: 205,
      fs: 15,
      lh: 19,
      left: true,
      html: "<strong>The motion that is higher on the list is indicated by the high slot.</strong>",
    },
    {
      x: 322,
      w: 262,
      y: 258,
      fs: 15,
      lh: 19,
      left: true,
      html: "Remember the order with the acronym <strong>PADS</strong>, for <strong>Pro, Anti, Dash, Static.</strong>",
    },
    {
      x: 322,
      w: 262,
      y: 308,
      fs: 15,
      lh: 19,
      left: true,
      html: "The letters S and T have another factor - <em>leading/following</em>.<br>In their case, leading is high and following is low.",
    },
    {
      x: 322,
      w: 276,
      y: 396,
      fs: 14.5,
      lh: 19,
      left: true,
      html: "There are five hybrids, each shown below in their corresponding high/low slots.",
    },
    {
      x: 30,
      w: 330,
      y: 648,
      fs: 14.5,
      lh: 17,
      left: true,
      html: "The remaining letters have combinations of the same motion type.",
    },
    {
      x: 30,
      w: 330,
      y: 682,
      fs: 14.5,
      lh: 17,
      left: true,
      html: "For these, put <strong style=\"color:#2342c9\">left</strong> in the high slot and <strong style=\"color:#c01b1b\">right</strong> in the low slot.",
    },
    {
      x: 30,
      w: 330,
      y: 712,
      fs: 14.5,
      lh: 17,
      left: true,
      html: "These letters include:<br><strong>A, B, D, E, G, H, J, K, M, N, P, Q, S, T<br>Φ-, Ψ-, Λ-<br>α, β, Γ</strong>",
    },
  ];

  const PADS_WORDS = ["Pro", "Anti", "Dash", "Static"];
</script>

<div class="gp-page">
  <!-- Big A with High/Low slots (right of the intro). -->
  <div class="big-a" style="left:{432 * S}px; top:{100 * S}px">A</div>
  <span class="slot-label" style="left:{506 * S}px; top:{124 * S}px">High</span>
  <span class="slot-label" style="left:{506 * S}px; top:{178 * S}px">Low</span>

  <!-- Update note box. -->
  <div class="update-box" style="left:{50 * S}px; top:{136 * S}px; width:{330 * S}px">
    <p><strong><em>Update May 2025:</em></strong><br /><em>TKA software now handles the placement of these numbers,
    so it’s less important that you learn this. Don’t sweat it.<br />Focus on the motions.</em></p>
  </div>

  <!-- PADS priority list with the High/Low arrow + Shifts brace. -->
  <div class="pads" style="left:{92 * S}px; top:{288 * S}px">
    <div class="pads-arrow">
      <span class="hl hi">High</span>
      <svg width="16" height={92 * S} viewBox="0 0 16 {92 * S}" aria-hidden="true">
        <line x1="8" y1="10" x2="8" y2={92 * S - 10} stroke="#141414" stroke-width="2.5" />
        <polygon points="8,0 2.5,11 13.5,11" fill="#141414" />
        <polygon points="8,{92 * S} 2.5,{92 * S - 11} 13.5,{92 * S - 11}" fill="#141414" />
      </svg>
      <span class="hl lo">Low</span>
    </div>
    <div class="pads-list">
      {#each PADS_WORDS as w (w)}<span>{w}</span>{/each}
    </div>
    <div class="pads-brace">
      <svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true">
        <path d="M2 4 Q 14 4 14 14 L 14 20 Q 14 26 24 26 Q 14 26 14 32 L 14 38 Q 14 48 2 48" fill="none" stroke="#141414" stroke-width="1.8" />
      </svg>
      <span class="brace-label">Shifts</span>
    </div>
  </div>

  <!-- Five hybrid columns. -->
  {#each VRULES as vx, vi (vx)}
    <div class="vrule" style="left:{vx * S}px; top:{(vi === 0 ? COL_TOP + 40 : COL_TOP) * S}px; height:{(vi === 0 ? 172 : 212) * S}px"></div>
  {/each}
  {#each COLS as c, i (i)}
    {#if c.head}
      <div class="type-head" style="left:{(c.cx - (i === 0 ? -66 : 0) - 70) * S}px; top:{COL_TOP * S}px; width:{140 * S}px">
        <span class="th1">{c.head.t1}</span><br />
        {#each c.head.parts as [t, col] (t)}<span class="th2" style="color:{col}">{t}</span>{/each}
      </div>
    {/if}
    <div class="mini" style="left:{(c.cx - BOX / 2) * S}px; top:{BOX_Y * S}px; width:{BOX * S}px; height:{BOX * S}px">
      <PictographContainer
        pictographData={c.data}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.STAFF}
        rightPropTypeOverride={PropType.STAFF}
        showGrid={true}
        showTKA={false}
        showPlacements={false}
        showReversals={false}
        showTnD={false}
        showElemental={false}
        showNonRadialPoints={false}
        showHandPoints={true}
        darkMode={false}
        printMode={true}
        disableTransitions={true}
      />
    </div>
    <div class="hilo" style="left:{(c.cx - 70) * S}px; top:{(BOX_Y + BOX + 14) * S}px; width:{140 * S}px">
      <span class="hi-word">{c.hi}</span><br /><span class="lo-word">{c.lo}</span>
    </div>
    <div class="letters" style="left:{(c.cx - 70) * S}px; top:{(BOX_Y + BOX + 62) * S}px; width:{140 * S}px">
      {#each c.letters as ln (ln)}{ln}<br />{/each}
    </div>
  {/each}

  <!-- Left/Right same-type example. -->
  <div class="mini" style="left:{(452 - 45) * S}px; top:{648 * S}px; width:{90 * S}px; height:{90 * S}px">
    <PictographContainer
      pictographData={EX_A}
      gridMode={GridMode.DIAMOND}
      leftPropTypeOverride={PropType.STAFF}
      rightPropTypeOverride={PropType.STAFF}
      showGrid={true}
      showTKA={false}
      showPlacements={false}
      showReversals={false}
      showTnD={false}
      showElemental={false}
      showNonRadialPoints={false}
      showHandPoints={true}
      darkMode={false}
      printMode={true}
      disableTransitions={true}
    />
  </div>
  <div class="hilo" style="left:{(452 - 70) * S}px; top:{744 * S}px; width:{140 * S}px">
    <span class="hi-word">Left</span><br /><span class="lo-word">Right</span>
  </div>

  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:left={p.left}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px; {p.left ? `left:${(p.x ?? 0) * S}px; width:${(p.w ?? 300) * S}px; right:auto; text-align:left;` : ''}"
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  .gp-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }
  .big-a {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 130px;
    line-height: 0.9;
  }
  .slot-label {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-size: 24px;
  }
  .update-box {
    position: absolute;
    border: 1.5px solid #141414;
    padding: 8px 14px;
    box-sizing: border-box;
  }
  .update-box p {
    margin: 0;
    font-family: "Cambria", Georgia, serif;
    font-size: 17px;
    line-height: 1.35;
    text-align: center;
  }

  .pads {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .pads-arrow {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .hl {
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 20px;
  }
  .pads-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pads-list span {
    font-family: "Cambria", Georgia, serif;
    font-size: 26px;
    line-height: 1.15;
  }
  .pads-brace {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: -46px;
  }
  .brace-label {
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-size: 22px;
  }

  .vrule {
    position: absolute;
    width: 1.8px;
    background: #141414;
  }
  .type-head {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
  }
  .th1 {
    font-size: 24px;
  }
  .th2 {
    font-size: 22px;
    font-weight: 700;
  }
  .mini {
    position: absolute;
  }
  .hilo {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 20px;
    line-height: 1.25;
  }
  .hi-word {
    color: #2342c9;
  }
  .lo-word {
    color: #c01b1b;
  }
  .letters {
    position: absolute;
    text-align: center;
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.3;
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
</style>
