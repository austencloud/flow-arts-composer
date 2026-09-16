<script lang="ts">
  /**
   * 2-Turns (Shifts) - Level 2 body page (manifest `two-turns-shifts`), faithful
   * to the source artboard (level-2.pdf page 22). Two turns = a full 360° added
   * to a shift. Three strips, now REAL pictographs end to end (Phase 3 of the
   * halved-pictograph pipeline - docs/superpowers/specs/
   * 2026-07-14-halved-pictograph-pipeline-design.md §7):
   *
   *   Pro (halves)   - start E(in) → halfway pose (45°, out) → end S(in)
   *                    = PRO e→s IN→IN CW turns=2 (in → out → in, 2 switches).
   *   Anti (thirds)  - start E(in) → ⅓ pose (out) → ⅔ pose (in) → end S(out)
   *                    = ANTI e→s IN→OUT CCW turns=2 (3 switches, ends out).
   *                    "At each third there is a staff end at the center point."
   *   Anti (halves)  - the same anti motion sampled in half (start/halfway/end).
   *
   * start/end frames are real single-staff pictographs (red hand only,
   * showArrow=false). Halfway frames (pro, anti-halves) are
   * buildHalvedStep(combined, 0.5) - a real pictograph at the midpoint with the
   * correct halfway orientation (Phase 1) and half-arrow asset (Phase 2); both
   * are whole 2-turn shifts, always on-lattice, so this always succeeds - the
   * PoseFrame fallback exists only for the null contract. Thirds (1/3, 2/3) are
   * NOT pipeline-representable - 60° never lands on the 45deg orientation
   * lattice, a domain fact, not a gap (see build-halved-step.ts) - so they stay
   * on the visual-only PoseFrame path (poseAt + Austen's own end-direction
   * glyphs via pose-arrow.ts), same as the old lifted artwork, just computed
   * at runtime instead of baked. The combined frame of each strip is the real
   * full-motion pictograph (system arrow) and the click-to-animate target.
   *
   * Header corner art is the divider mandala facelift.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import {
    createMotionData,
    createPlaceholderMotion,
  } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { buildHalvedStep } from "$lib/shared/animation-engine/services/build-halved-step";
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
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { HalfwayMotion } from "../_data/halfway-pose";
  import PoseFrame from "../_components/PoseFrame.svelte";
  import { bakeReversals } from "../../level-1/_data/guide-sequence-adapter";
  import { getGuideSequenceClick } from "../../level-1/_data/guide-data-context";
  import { getGuideActiveStep } from "../../level-1/_data/guide-active-step.svelte";

  const S = 816 / 612; // pt → px
  const { EAST: E, SOUTH: SO_ } = GridLocation;
  const { IN, OUT } = Orientation;
  const CW = RotationDirection.CLOCKWISE;
  const CCW = RotationDirection.COUNTER_CLOCKWISE;
  const NOROT = RotationDirection.NO_ROTATION;

  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  const rightStaff = (
    id: string,
    type: MotionType,
    from: GridLocation,
    to: GridLocation,
    startOri: Orientation,
    endOri: Orientation,
    rot: RotationDirection,
    turns = 0
  ) => ({
    id: `l2ts-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      right: createMotionData({
        motionType: type,
        rotationDirection: rot,
        startLocation: from,
        endLocation: to,
        startOrientation: startOri,
        endOrientation: endOri,
        turns,
        hand: HandSide.RIGHT,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      }),
    },
  });
  const stat = (id: string, loc: GridLocation, ori: Orientation) =>
    rightStaff(id, MotionType.STATIC, loc, loc, ori, ori, NOROT);
  /** Motion → the HalfwayMotion shape poseAt/poseArrow (PoseFrame) expect. */
  const toHM = (
    m: ReturnType<typeof rightStaff>["motions"]["right"]
  ): HalfwayMotion => ({
    type: m.motionType,
    from: m.startLocation,
    to: m.endLocation,
    rot: m.rotationDirection,
    startOri: m.startOrientation,
    endOri: m.endOrientation,
    turns: typeof m.turns === "number" ? m.turns : 0,
  });

  const proCombined = rightStaff(
    "pro-full",
    MotionType.PRO,
    E,
    SO_,
    IN,
    IN,
    CW,
    2
  );
  const antiCombined = rightStaff(
    "anti-full",
    MotionType.ANTI,
    E,
    SO_,
    IN,
    OUT,
    CCW,
    2
  );
  const antiHalfCombined = rightStaff(
    "anti-half-full",
    MotionType.ANTI,
    E,
    SO_,
    IN,
    IN,
    CCW,
    2
  );

  // ── Click-to-animate (combined pictograph plays Start → motion) - also the
  // "full step" buildHalvedStep needs (both hands present; blue is an
  // invisible placeholder, per the both-required step contract). ────────────
  const ANIM = {
    "l2ts-pro": {
      data: proCombined,
      word: "Prospin with 2 turns",
      startLoc: E,
    },
    "l2ts-anti": {
      data: antiCombined,
      word: "Antispin with 2 turns",
      startLoc: E,
    },
    "l2ts-antih": {
      data: antiHalfCombined,
      word: "Antispin with 2 turns",
      startLoc: E,
    },
  } as const;
  const animStep = (
    data: ReturnType<typeof rightStaff>,
    stepNumber: number,
    startLoc: GridLocation
  ): StepData =>
    ({
      ...data,
      id: `${data.id}-anim-${stepNumber}`,
      stepNumber,
      motions: {
        left: createPlaceholderMotion(HandSide.LEFT, {
          location: startLoc,
          orientation: IN,
        }),
        right: data.motions.right,
      },
    }) as unknown as StepData;
  const animKeyStat = (key: string): ReturnType<typeof rightStaff> =>
    stat(`${key}-start`, ANIM[key as keyof typeof ANIM].startLoc, IN);
  const rowSteps = (key: string): StepData[] => {
    const cfg = ANIM[key as keyof typeof ANIM];
    const [start, ...steps] = [
      animStep(animKeyStat(key), 0, cfg.startLoc),
      animStep(cfg.data, 1, cfg.startLoc),
    ];
    return [start!, ...bakeReversals(steps)];
  };

  // ── Strip model ────────────────────────────────────────────────────────────
  // Every frame carries a `render` mode: a real pose (start/end), a real
  // halved pictograph (half, PoseFrame fallback), a runtime PoseFrame pose
  // (pose - off-lattice thirds), or the real full-motion pictograph (combined,
  // click-to-animate).
  type FrameRender =
    | { kind: "start" | "end"; loc: GridLocation; ori: Orientation }
    | {
        kind: "half";
        combined: ReturnType<typeof rightStaff>;
        half: StepData | null;
      }
    | { kind: "pose"; motion: HalfwayMotion; t: number; arrowStart: number }
    | { kind: "combined"; animKey: keyof typeof ANIM };
  type Frame = { left: number; render: FrameRender };
  type Strip = { y: number; size: number; frames: Frame[] };

  const halfOf = (
    combined: ReturnType<typeof rightStaff>,
    startLoc: GridLocation
  ) => buildHalvedStep(animStep(combined, 1, startLoc), 0.5);

  const proStrip: Strip = {
    y: 200,
    size: 100,
    frames: [
      { left: 95, render: { kind: "start", loc: E, ori: IN } },
      {
        left: 215,
        render: {
          kind: "half",
          combined: proCombined,
          half: halfOf(proCombined, E),
        },
      },
      {
        left: 335,
        render: {
          kind: "end",
          loc: SO_,
          ori: proCombined.motions.right.endOrientation,
        },
      },
      { left: 455, render: { kind: "combined", animKey: "l2ts-pro" } },
    ],
  };
  const antiThirds: Strip = {
    y: 455,
    size: 88,
    frames: [
      { left: 30, render: { kind: "start", loc: E, ori: IN } },
      {
        left: 148,
        render: {
          kind: "pose",
          motion: toHM(antiCombined.motions.right),
          t: 1 / 3,
          arrowStart: 0,
        },
      },
      {
        left: 266,
        render: {
          kind: "pose",
          motion: toHM(antiCombined.motions.right),
          t: 2 / 3,
          arrowStart: 1 / 3,
        },
      },
      {
        left: 384,
        render: {
          kind: "end",
          loc: SO_,
          ori: antiCombined.motions.right.endOrientation,
        },
      },
      { left: 508, render: { kind: "combined", animKey: "l2ts-anti" } },
    ],
  };
  const antiHalves: Strip = {
    y: 670,
    size: 100,
    frames: [
      { left: 95, render: { kind: "start", loc: E, ori: IN } },
      {
        left: 215,
        render: {
          kind: "half",
          combined: antiHalfCombined,
          half: halfOf(antiHalfCombined, E),
        },
      },
      {
        left: 335,
        render: {
          kind: "end",
          loc: SO_,
          ori: antiHalfCombined.motions.right.endOrientation,
        },
      },
      { left: 455, render: { kind: "combined", animKey: "l2ts-antih" } },
    ],
  };
  const STRIPS = [proStrip, antiThirds, antiHalves];

  // Arrows sit in every inter-frame gap except the last (which gets "="). Each
  // connector centers in the gap between neighbouring boxes.
  const connectors = (strip: Strip) => {
    const out: { x: number; y: number; equals: boolean }[] = [];
    const midY = strip.y + strip.size / 2;
    for (let i = 0; i < strip.frames.length - 1; i++) {
      const rightEdge = strip.frames[i]!.left + strip.size;
      const nextLeft = strip.frames[i + 1]!.left;
      out.push({
        x: (rightEdge + nextLeft) / 2,
        y: midY,
        equals: i === strip.frames.length - 2,
      });
    }
    return out;
  };

  const ARROW_W = 14.5;

  const PICTO_FLAGS = {
    // The halved anim step carries a stepNumber; these frames are lesson
    // diagrams, not sequence beats, so the badge stays off.
    stepNumberOverride: false,
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

  // ── Text (pt coords, proof wording verbatim) ────────────────────────────────
  type Para = { y: number; fs: number; lh: number; html: string };
  const PARAS: Para[] = [
    {
      y: 60,
      fs: 16,
      lh: 20,
      html: "2 turns add a 360 degree rotation to a motion.",
    },
    {
      y: 138,
      fs: 16,
      lh: 19,
      html: "On a prospin with a double turn, note the 45° angle of the halfway position.",
    },
    {
      y: 302,
      fs: 16,
      lh: 20,
      html: "A base prospin (ASA isolation) has 0 thumb switches, therefore<br><strong>A prospin with 2 turns has 2 thumb switch (in → out → in)</strong>",
    },
    {
      y: 358,
      fs: 16,
      lh: 20,
      html: "With a double-turning antispin, it’s easier to visually conceive of the motion in thirds<br>At each third there is a staff end at the center point.",
    },
    {
      y: 558,
      fs: 16,
      lh: 20,
      html: "A base antispin has 1 thumb switch. (in → out), therefore<br><strong>An antispin with 2 turns has 3 thumb switches (in → out → in → out).</strong>",
    },
    { y: 608, fs: 16, lh: 20, html: "Here is the same motion broken in half:" },
  ];

  type Run = {
    x: number;
    y: number;
    fs: number;
    style: "title" | "mode" | "frame" | "cap" | "vtg";
    t: string;
  };
  const RUNS: Run[] = [
    { x: 0, y: 8, fs: 40, style: "title", t: "2-Turns" },
    { x: 0, y: 94, fs: 28, style: "mode", t: "Shifts" },
    { x: 522, y: 102, fs: 20, style: "vtg", t: "VTG: 1:5" },

    // Pro strip captions
    { x: 28, y: 155, fs: 24, style: "mode", t: "Pro" },
    { x: 122, y: 179, fs: 14, style: "frame", t: "start" },
    { x: 236, y: 179, fs: 14, style: "frame", t: "halfway" },
    { x: 368, y: 179, fs: 14, style: "frame", t: "end" },
    { x: 62, y: 197, fs: 13, style: "cap", t: "thumbs:" },
    { x: 132, y: 197, fs: 13, style: "cap", t: "in" },
    { x: 248, y: 197, fs: 13, style: "cap", t: "out" },
    { x: 372, y: 197, fs: 13, style: "cap", t: "in" },

    // Anti thirds strip captions
    { x: 20, y: 392, fs: 24, style: "mode", t: "Anti" },
    { x: 56, y: 431, fs: 14, style: "frame", t: "start" },
    { x: 420, y: 431, fs: 14, style: "frame", t: "end" },
    { x: 6, y: 449, fs: 13, style: "cap", t: "thumbs:" },
    { x: 66, y: 449, fs: 13, style: "cap", t: "in" },
    { x: 182, y: 449, fs: 13, style: "cap", t: "out" },
    { x: 305, y: 449, fs: 13, style: "cap", t: "in" },
    { x: 422, y: 449, fs: 13, style: "cap", t: "out" },

    // Anti halves strip captions
    { x: 122, y: 649, fs: 14, style: "frame", t: "start" },
    { x: 236, y: 649, fs: 14, style: "frame", t: "halfway" },
    { x: 368, y: 649, fs: 14, style: "frame", t: "end" },
    { x: 62, y: 667, fs: 13, style: "cap", t: "thumbs:" },
    { x: 132, y: 667, fs: 13, style: "cap", t: "in" },
    { x: 248, y: 667, fs: 13, style: "cap", t: "out" },
    { x: 372, y: 667, fs: 13, style: "cap", t: "in" },
  ];

  // Corner mandala forms (facelift, divider family) - iso left, anti right.
  const m = (
    mt: string,
    rd: string,
    sl: string,
    el: string,
    so: string,
    eo: string
  ) => ({
    motionType: mt,
    rotationDirection: rd,
    startLocation: sl,
    endLocation: el,
    startOrientation: so,
    endOrientation: eo,
  });
  const mstep = (left, right) => ({ motions: { left, right } });
  const mseq = (steps: unknown[]) => ({
    leftPropType: "staff",
    rightPropType: "staff",
    steps,
  });
  const ISO = mseq([
    mstep(
      m("pro", "cw", "n", "e", "in", "in"),
      m("pro", "cw", "s", "w", "in", "in")
    ),
    mstep(
      m("pro", "cw", "e", "s", "in", "in"),
      m("pro", "cw", "w", "n", "in", "in")
    ),
    mstep(
      m("pro", "cw", "s", "w", "in", "in"),
      m("pro", "cw", "n", "e", "in", "in")
    ),
    mstep(
      m("pro", "cw", "w", "n", "in", "in"),
      m("pro", "cw", "e", "s", "in", "in")
    ),
  ]);
  const ANTIM = mseq([
    mstep(
      m("anti", "ccw", "n", "e", "in", "out"),
      m("anti", "ccw", "s", "w", "in", "out")
    ),
    mstep(
      m("anti", "ccw", "e", "s", "out", "in"),
      m("anti", "ccw", "w", "n", "out", "in")
    ),
    mstep(
      m("anti", "ccw", "s", "w", "in", "out"),
      m("anti", "ccw", "n", "e", "in", "out")
    ),
    mstep(
      m("anti", "ccw", "w", "n", "out", "in"),
      m("anti", "ccw", "e", "s", "out", "in")
    ),
  ]);
</script>

<div class="tt-page">
  <div
    class="corner"
    style="left:{40 * S}px; top:{16 * S}px; width:{58 * S}px; height:{58 * S}px"
  >
    <SequenceMandala
      sequence={ISO}
      size={58 * S}
      darkMode={false}
      leftPropType="staff"
      rightPropType="staff"
      pathShape="arc"
      strokeWidth={2.5}
    />
  </div>
  <div
    class="corner"
    style="left:{514 * S}px; top:{16 * S}px; width:{58 * S}px; height:{58 *
      S}px"
  >
    <SequenceMandala
      sequence={ANTIM}
      size={58 * S}
      darkMode={false}
      leftPropType="staff"
      rightPropType="staff"
      pathShape="arc"
      strokeWidth={2.5}
    />
  </div>
  <div
    class="rule heavy"
    style="left:{20 * S}px; top:{89 * S}px; width:{572 * S}px"
  ></div>
  <div
    class="rule heavy"
    style="left:{26 * S}px; top:{353 * S}px; width:{570 * S}px"
  ></div>

  {#each STRIPS as strip, si (si)}
    {#each strip.frames as frame, fi (fi)}
      {@const r = frame.render}
      {#if r.kind === "combined"}
        {@const animKey = r.animKey}
        <div
          class="mini tka-seq-cell"
          class:is-hovered={selection?.isHovered(animKey)}
          class:is-selected={selection?.isSelected(animKey)}
          class:guide-step-active={activeStep?.key === animKey}
          style="left:{frame.left * S}px; top:{strip.y *
            S}px; width:{strip.size * S}px; height:{strip.size * S}px"
        >
          <PictographContainer
            pictographData={{
              ...animStep(ANIM[animKey].data, 1, ANIM[animKey].startLoc),
              stepNumber: undefined,
            } as unknown as StepData}
            gridMode={GridMode.DIAMOND}
            rightPropTypeOverride={PropType.STAFF}
            leftPropTypeOverride={PropType.STAFF}
            {...PICTO_FLAGS}
          />
          <SelectionHit
            groupId={animKey}
            isGroupStart
            label={`Animate: ${ANIM[animKey].word}`}
            onselect={() =>
              emitSequence?.({
                strip: rowSteps(animKey),
                word: ANIM[animKey].word,
                key: animKey,
                propType: "staff",
              })}
          />
        </div>
      {:else if r.kind === "half"}
        <div
          class="mini"
          style="left:{frame.left * S}px; top:{strip.y *
            S}px; width:{strip.size * S}px; height:{strip.size * S}px"
        >
          {#if r.half}
            <PictographContainer
              pictographData={r.half}
              gridMode={GridMode.DIAMOND}
              rightPropTypeOverride={PropType.STAFF}
              leftPropTypeOverride={PropType.STAFF}
              {...PICTO_FLAGS}
            />
          {:else}
            <PoseFrame
              motion={toHM(r.combined.motions.right)}
              t={0.5}
              arrow={{ tStart: 0, tEnd: 0.5 }}
            />
          {/if}
        </div>
      {:else if r.kind === "pose"}
        <div
          class="mini"
          style="left:{frame.left * S}px; top:{strip.y *
            S}px; width:{strip.size * S}px; height:{strip.size * S}px"
        >
          <PoseFrame
            motion={r.motion}
            t={r.t}
            arrow={{ tStart: r.arrowStart, tEnd: r.t }}
          />
        </div>
      {:else}
        <div
          class="mini"
          style="left:{frame.left * S}px; top:{strip.y *
            S}px; width:{strip.size * S}px; height:{strip.size * S}px"
        >
          <PictographContainer
            pictographData={stat(`p22-${si}-${fi}`, r.loc, r.ori)}
            gridMode={GridMode.DIAMOND}
            rightPropTypeOverride={PropType.STAFF}
            showArrow={false}
            {...PICTO_FLAGS}
          />
        </div>
      {/if}
    {/each}

    {#each connectors(strip) as c (c.x)}
      {#if c.equals}
        <span class="equals" style="left:{c.x * S}px; top:{c.y * S}px">=</span>
      {:else}
        <svg
          class="flow-arrow"
          style="left:{(c.x - ARROW_W / 2) * S}px; top:{(c.y - 5) *
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
          />
          <polygon
            points="{ARROW_W - 8},1.3 {ARROW_W},5 {ARROW_W - 8},8.7"
            fill="#141414"
          />
        </svg>
      {/if}
    {/each}
  {/each}

  {#each PARAS as p, i (i)}
    <p
      class="para"
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
    >
      {@html p.html}
    </p>
  {/each}
  {#each RUNS as r, i (i)}
    {#if r.style === "title" || (r.style === "mode" && r.x === 0)}
      <span
        class="run {r.style} centered"
        style="top:{r.y * S}px; font-size:{r.fs * S}px">{r.t}</span
      >
    {:else}
      <span
        class="run {r.style}"
        style="left:{r.x * S}px; top:{r.y * S}px; font-size:{r.fs * S}px"
        >{r.t}</span
      >
    {/if}
  {/each}
</div>

<style>
  .tt-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }
  .corner {
    position: absolute;
  }
  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }
  .flow-arrow {
    position: absolute;
  }
  .equals {
    position: absolute;
    transform: translate(-50%, -50%);
    font-family: "Cambria", Georgia, serif;
    font-size: 36px;
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
  .run {
    position: absolute;
    line-height: 1;
    white-space: nowrap;
  }
  .run.centered {
    left: 0;
    right: 0;
    text-align: center;
  }
  .run.title {
    font-family: var(--guide-display);
    font-style: italic;
    font-weight: 700;
  }
  .run.mode {
    font-family: var(--guide-display);
    font-style: italic;
    font-weight: 600;
  }
  .run.vtg {
    font-family: var(--guide-display);
    font-style: italic;
  }
  .run.frame,
  .run.cap {
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
  }
  .run.cap {
    color: #3c3c46;
  }
</style>
