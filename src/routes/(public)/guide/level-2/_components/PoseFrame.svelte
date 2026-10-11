<script lang="ts">
  /**
   * Runtime pose frame for Level-2 turn pedagogy: a single staff pose at
   * fraction `t` of a motion, for the fractions the halved-pictograph pipeline
   * cannot represent - quarters (1/4, 3/4) and thirds (1/3, 2/3). Those have a
   * legal 45deg-lattice ORIENTATION (Phase 1's algebra doesn't care which
   * fraction) but no legal named grid LOCATION (a shift's quarter/third point
   * sits between the grid's 8 named points), so `buildHalvedStep` always
   * returns null for them - see build-halved-step.ts's module doc comment.
   * This is the guide's visual-only fallback for exactly that case: it never
   * builds a synthetic StepData or touches the pipeline, it just asks the real
   * animation engine where the staff physically is (`poseAt`, halfway-pose.ts)
   * and draws it, the same way LiftedTurnFrame's baked artwork used to.
   *
   * Draws the same minimal 5-dot grid LiftedTurnFrame used (4 hand points +
   * center) rather than the full app pictograph grid - the real grid's big
   * outer points (radius 300) dwarf this scale (see LiftedTurnFrame's doc
   * comment) - plus the staff (STAFF_D, the same asset path OneOneType1Page's
   * halfway frame draws) at `poseAt(motion, t)`, plus an optional
   * end-direction arrow glyph for the slice [tStart, tEnd] via pose-arrow.ts
   * (Austen's own curl/zig-zag/bow drawings, not the app's motion-arrow
   * assets - see pose-arrow.ts's doc comment).
   */
  import { poseAt, type HalfwayMotion } from "../_data/halfway-pose";
  import { poseArrow, POSE_ARROW_RED } from "../_data/pose-arrow";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

  let {
    motion,
    t,
    arrow = null,
    color = HandSide.RIGHT,
  }: {
    motion: HalfwayMotion;
    /** Fraction of the motion to pose the staff at (0 = start, 1 = end). */
    t: number;
    /** End-direction arrow glyph spanning this slice of the motion, or none. */
    arrow?: { tStart: number; tEnd: number } | null;
    color?: HandSide;
  } = $props();

  // The renderer's own staff asset path (static/images/props/staff.svg),
  // native 252.8x77.8, centerPoint (126.4, 38.9), crossbar at the +x end -
  // same constant OneOneType1Page and StaffMotionsPage draw from.
  const STAFF_D =
    "M251.4 67.7V10.1c0-4.8-4.1-8.7-9.1-8.7s-9.1 3.9-9.1 8.7v19.2H10.3c-4.9 0-8.9 3.8-8.9 8.5V41c0 4.6 4 8.5 8.9 8.5h222.9v18.2c0 4.8 4.1 8.7 9.1 8.7s9.1-3.9 9.1-8.7z";
  const RED_FILL = "#DC2626";
  const BLUE_FILL = "#2E3192";

  const HAND_POINTS = [
    { cx: 475, cy: 331.9 },
    { cx: 618.1, cy: 475 },
    { cx: 475, cy: 618.1 },
    { cx: 331.9, cy: 475 },
  ];

  const pose = $derived(poseAt(motion, t, color));
  const staffFill = $derived(color === HandSide.LEFT ? BLUE_FILL : RED_FILL);
  const arrowGlyph = $derived(arrow ? poseArrow(motion, arrow.tStart, arrow.tEnd) : null);
</script>

<svg class="pose-frame" viewBox="0 0 950 950" aria-hidden="true">
  <g class="grid-dots">
    {#each HAND_POINTS as p (p.cx + "-" + p.cy)}
      <circle cx={p.cx} cy={p.cy} r="12" />
    {/each}
    <circle cx="475" cy="475" r="5.8" />
  </g>
  {#if arrowGlyph}
    <path d={arrowGlyph.d} transform={arrowGlyph.transform} fill={POSE_ARROW_RED} />
  {/if}
  <g transform="translate({pose.cx}, {pose.cy}) rotate({pose.deg}) translate(-126.4, -38.9)">
    <path d={STAFF_D} fill={staffFill} />
  </g>
</svg>

<style>
  .pose-frame {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .grid-dots circle {
    fill: currentColor;
  }
</style>
