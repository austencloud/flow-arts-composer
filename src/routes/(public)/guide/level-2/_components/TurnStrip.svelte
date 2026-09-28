<script lang="ts" module>
  import type { HalfwayMotion } from "../_data/halfway-pose";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

  /**
   * One reflowable lesson strip: start pose → (poses/half) → end pose → an
   * optional trailing full-motion, click-to-animate pictograph - the mobile
   * article-lane form of the print artboards' turn-breakdown strips (see
   * TwoTurnsDashStaticPage.svelte / TwoTurnsShiftsPage.svelte's `FrameRender`
   * union, which this mirrors kind-for-kind):
   *
   *   - "start" / "end": a real single-staff pose (no arrow - it's a hold, not
   *     a motion slice).
   *   - "half": the real halved pictograph at the motion's midpoint
   *     (`buildHalvedStep(step, 0.5)`), when the pipeline can represent it.
   *     `step: null` falls back to the runtime PoseFrame pose (same visual as
   *     "pose", fixed at t=0.5) for the null contract.
   *   - "pose": an off-lattice fraction (quarters/thirds) that has a legal
   *     45deg orientation but no legal named grid location - rendered via the
   *     visual-only PoseFrame path (poseAt + Austen's own end-direction glyphs).
   *   - "combined": the real full-motion pictograph, the click-to-animate
   *     target. Selection highlighting / click-to-animate degrade to a plain
   *     static pictograph when no selection context is provided (both
   *     `getSequenceSelection` and `getGuideSequenceClick` return null off any
   *     host that doesn't set one - see SelectionHit.svelte - so no guard is
   *     needed beyond the same optional chaining the artboards already use).
   */
  export type TurnStripFrame =
    | {
        kind: "start" | "end";
        step: StepData;
        frameLabel?: string;
        thumbLabel?: string;
      }
    | {
        kind: "half";
        step: StepData | null;
        fallbackMotion: HalfwayMotion;
        frameLabel?: string;
        thumbLabel?: string;
      }
    | {
        kind: "pose";
        motion: HalfwayMotion;
        t: number;
        arrowStart: number;
        frameLabel?: string;
        thumbLabel?: string;
      }
    | {
        kind: "combined";
        step: StepData;
        /** Selection/animation identity - must be unique across the page. */
        animKey: string;
        /** Spoken/derived word for the click-to-animate label. */
        word: string;
        /** Full strip (start + baked reversal steps) the animation companion plays. */
        rowSteps: StepData[];
        frameLabel?: string;
        thumbLabel?: string;
      }
    | {
        /**
         * Both-hands-turning halfway pose - for 1|1 hybrids (OneOneTurns,
         * S/T, Lam opening/closing) where BOTH staves are mid-turn at once,
         * unlike every other frame kind here (single moving hand). Renders
         * one PoseFrame per entry grid-stacked in the same cell (same
         * technique as Crossfade - see crossfade-primitive.md), so both
         * staves draw over one shared 5-dot grid with no layout cost.
         */
        kind: "dual-pose";
        poses: { motion: HalfwayMotion; color: HandSide; t: number }[];
        frameLabel?: string;
        thumbLabel?: string;
      };
</script>

<script lang="ts">
  import GuidePictograph from "../../level-1/_components/GuidePictograph.svelte";
  import { t as translate } from "$lib/shared/i18n/i18n.svelte.js";
  import PoseFrame from "./PoseFrame.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import "$lib/shared/selection/selection.css";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import { getGuideSequenceClick } from "../../level-1/_data/guide-data-context";
  import { getGuideActiveStep } from "../../level-1/_data/guide-active-step.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    MotionType,
    HandSide,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  let {
    frames,
    picTheme = "light",
    caption,
    activeT = null,
  }: {
    frames: TurnStripFrame[];
    picTheme?: "light" | "dark";
    caption?: string;
    /**
     * The showcase's live playhead ratio (0..1 across the whole sequence).
     * null (default) = no highlight, so every existing caller (ch20/ch21
     * sections that don't forward it through their `strip` snippet) renders
     * byte-identical. The highlight walks the BREAKDOWN frames in step with
     * the playhead: each frame depicts a specific moment (start=0, a pose at
     * its own fraction, halfway=0.5, end=1) and the frame nearest the playhead
     * lights. The "combined" summary frame has no single moment — it never
     * lights from the scrub (only on companion-click), so the scrub can't
     * highlight the end result mid-motion.
     */
    activeT?: number | null;
  } = $props();

  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  // The playhead fraction each breakdown frame depicts, or null for the
  // "combined" summary (no single moment — excluded from the scrub highlight).
  function frameNominalT(frame: TurnStripFrame): number | null {
    switch (frame.kind) {
      case "start":
        return 0;
      case "end":
        return 1;
      case "half":
        return 0.5;
      case "pose":
        return frame.t;
      case "dual-pose":
        return frame.poses[0]?.t ?? 0.5;
      case "combined":
        return null;
    }
  }

  // The index of the breakdown frame nearest the live playhead — a full
  // nearest-checkpoint partition of [0,1], so the scrub walks start ->
  // (quarter ->) halfway -> (three-quarter ->) end with no gaps. The prior
  // fixed narrow bands left wide gaps that fell through to the "combined"
  // end-result frame mid-scrub (the reported bug), and never reached the
  // quarter/three-quarter frames of the 6-frame dash breakdowns at all.
  const activeCheckpointIndex = $derived.by((): number | null => {
    const t = activeT;
    if (t === null || t === undefined) return null;
    let bestIdx: number | null = null;
    let bestDist = Infinity;
    frames.forEach((frame, i) => {
      const nt = frameNominalT(frame);
      if (nt === null) return;
      const d = Math.abs(nt - t);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    return bestIdx;
  });

  function isFrameActive(frame: TurnStripFrame, i: number): boolean {
    // Companion click (open-the-drawer) rings the combined frame regardless of
    // the scrub playhead; the scrub itself only rings breakdown frames.
    if (frame.kind === "combined" && activeStep?.key === frame.animKey)
      return true;
    return activeCheckpointIndex === i;
  }

  // "pose" and the null-fallback "half" frames aren't real StepData, so they
  // don't get GuidePictograph's synchronous describePictograph aria-label -
  // this builds the equivalent sentence from the HalfwayMotion + fraction.
  const motionName = (motion: MotionType): string => {
    switch (motion) {
      case MotionType.PRO:
        return translate("guide_l2_aria_pro_shift");
      case MotionType.ANTI:
        return translate("guide_l2_aria_anti_shift");
      case MotionType.DASH:
        return translate("guide_l2_aria_dash");
      case MotionType.STATIC:
        return translate("guide_l2_aria_static");
      default:
        return String(motion);
    }
  };
  const locName = (loc: string): string => {
    switch (loc) {
      case "n":
        return translate("guide_l2_aria_north");
      case "e":
        return translate("guide_l2_aria_east");
      case "s":
        return translate("guide_l2_aria_south");
      case "w":
        return translate("guide_l2_aria_west");
      case "ne":
        return translate("guide_l2_aria_northeast");
      case "se":
        return translate("guide_l2_aria_southeast");
      case "sw":
        return translate("guide_l2_aria_southwest");
      case "nw":
        return translate("guide_l2_aria_northwest");
      default:
        return loc;
    }
  };
  const fractionWord = (t: number): string => {
    if (Math.abs(t - 0.25) < 1e-6) return translate("guide_l2_aria_quarter");
    if (Math.abs(t - 0.75) < 1e-6)
      return translate("guide_l2_aria_three_quarters");
    if (Math.abs(t - 1 / 3) < 1e-6) return translate("guide_l2_aria_one_third");
    if (Math.abs(t - 2 / 3) < 1e-6)
      return translate("guide_l2_aria_two_thirds");
    if (Math.abs(t - 0.5) < 1e-6) return translate("guide_l2_aria_halfway");
    return `${Math.round(t * 100)}%`;
  };
  const poseAriaLabel = (motion: HalfwayMotion, t: number): string => {
    const verb = motionName(motion.type);
    const from = locName(motion.from);
    const to = locName(motion.to);
    const where =
      from === to
        ? translate("guide_l2_aria_at", { place: from })
        : translate("guide_l2_aria_from_to", { from, to });
    return translate("guide_l2_aria_pose", {
      fraction: fractionWord(t),
      motion: verb,
      where,
    });
  };
  const dualPoseAriaLabel = (
    poses: { motion: HalfwayMotion; color: HandSide; t: number }[]
  ): string =>
    poses
      .map(
        (p) =>
          `${p.color === HandSide.LEFT ? translate("guide_l2_aria_left") : translate("guide_l2_aria_right")} ${poseAriaLabel(p.motion, p.t)}`
      )
      .join(" ");
  const frameText = (value?: string): string => {
    switch (value) {
      case "start":
        return translate("guide_l2_frame_start");
      case "halfway":
        return translate("guide_l2_frame_halfway");
      case "end":
        return translate("guide_l2_frame_end");
      case "in":
        return translate("guide_l2_frame_in");
      case "out":
        return translate("guide_l2_frame_out");
      default:
        return value ?? "";
    }
  };
</script>

<div
  class="turn-strip"
  role="group"
  aria-label={caption ?? translate("guide_l2_turn_breakdown")}
>
  {#each frames as frame, i (i)}
    <div class="turn-frame">
      <span class="frame-cap top">{frameText(frame.frameLabel)}</span>
      <div class="frame-box" class:guide-step-active={isFrameActive(frame, i)}>
        {#if frame.kind === "pose"}
          <div
            class="pose-box"
            role="img"
            aria-label={poseAriaLabel(frame.motion, frame.t)}
          >
            <PoseFrame
              motion={frame.motion}
              t={frame.t}
              arrow={{ tStart: frame.arrowStart, tEnd: frame.t }}
            />
          </div>
        {:else if frame.kind === "dual-pose"}
          <div
            class="pose-box dual"
            role="img"
            aria-label={dualPoseAriaLabel(frame.poses)}
          >
            {#each frame.poses as p, pi (pi)}
              <div class="pose-layer">
                <PoseFrame motion={p.motion} t={p.t} color={p.color} />
              </div>
            {/each}
          </div>
        {:else if frame.kind === "half" && !frame.step}
          <div
            class="pose-box"
            role="img"
            aria-label={poseAriaLabel(frame.fallbackMotion, 0.5)}
          >
            <PoseFrame
              motion={frame.fallbackMotion}
              t={0.5}
              arrow={{ tStart: 0, tEnd: 0.5 }}
            />
          </div>
        {:else if frame.kind === "combined"}
          <div
            class="tka-seq-cell combined-cell"
            class:is-hovered={selection?.isHovered(frame.animKey)}
            class:is-selected={selection?.isSelected(frame.animKey)}
          >
            <GuidePictograph
              data={frame.step}
              size="md"
              eager
              forceTheme={picTheme}
              propType={PropType.STAFF}
            />
            <SelectionHit
              groupId={frame.animKey}
              isGroupStart
              label={translate("guide_l2_animate", {
                word:
                  frame.word === "Prospin with a turn"
                    ? translate("guide_runtime_prospin_turn")
                    : frame.word === "Antispin with a turn"
                      ? translate("guide_runtime_antispin_turn")
                      : frame.word,
              })}
              onselect={() =>
                emitSequence?.({
                  strip: frame.rowSteps,
                  word: frame.word,
                  key: frame.animKey,
                  propType: "staff",
                })}
            />
          </div>
        {:else}
          <GuidePictograph
            data={frame.step}
            size="md"
            eager
            forceTheme={picTheme}
            propType={PropType.STAFF}
            showArrows={frame.kind === "half"}
          />
        {/if}
      </div>
      <span class="frame-cap bottom">{frameText(frame.thumbLabel)}</span>
    </div>
    {#if i < frames.length - 1}
      <div class="connector" aria-hidden="true">
        <span class="cap-spacer"></span>
        <span class="arrow-slot">
          {#if i === frames.length - 2}
            <span class="equals">=</span>
          {:else}
            <svg class="flow-arrow" viewBox="0 0 14.5 10">
              <line
                x1="0"
                y1="5"
                x2="7.5"
                y2="5"
                stroke="currentColor"
                stroke-width="2"
              />
              <polygon points="6.5,1.3 14.5,5 6.5,8.7" fill="currentColor" />
            </svg>
          {/if}
        </span>
        <span class="cap-spacer"></span>
      </div>
    {/if}
  {/each}
</div>
{#if caption}<p class="turn-strip-caption">{caption}</p>{/if}

<style>
  /* Palette follows FlowFrame's contract: --ink/--ink-dim are consumed via
     var(), never declared as a fixed color. The level-2 host (ch20/ch21,
     rendered inside .guide-content's dark glassmorphic shell - see
     level-1/_styles/guide.css) never sets --ink/--ink-dim itself (unlike
     GuidePageHost, which sets them for FlowFrame), so the fallback here is
     tuned to that actual host background - the same light-ink values
     GuidePageHost declares for its own dark theme - rather than FlowFrame's
     print-oriented dark-on-white fallback, which renders near-invisible on
     the dark host. A future host that DOES set --ink still wins outright. */
  .turn-strip {
    --frame-size: clamp(5rem, 18cqw, 11rem);
    container-type: inline-size;
    /* inline-size containment zeroes this element's intrinsic width, so it
       MUST take a definite width from its context (width: 100%); auto-margin
       shrink-to-fit collapsed it to 0 and stacked the frames vertically. */
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: center;
    gap: 0.75rem 0.6rem;
    margin: 1.9rem auto;
    max-width: 72rem;
    /* Break out of the inherited prose column: GuideSection is a CSS subgrid
       (level-1/_styles/guide.css) whose `.guide-section > *` rule confines
       every direct child (including this strip) to the narrow `prose` track.
       This selector's specificity (two classes) beats that universal-child
       rule (one class), so it wins without editing guide.css - the strip
       spans the section's full width instead of squeezing into the text
       column, the level-2 equivalent of FlowFrame's `.flow-showcase`
       breakout. `max-width` above still caps how wide the strip itself gets. */
    grid-column: full-start / full-end;
  }

  .turn-frame {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
  }

  /* Reserved-height caption slots - always rendered (empty string when a frame
     carries no label) so every frame's box lands at the same vertical offset
     regardless of which frames have labels, and so the connector's own
     matching spacers line its arrow up with the frame boxes' centers without
     runtime measurement (no-layout-shift rule: reserve space for the widest/
     tallest case up front). */
  .frame-cap {
    display: block;
    min-height: 1.1rem;
    font-family: "Cormorant Garamond", Georgia, serif;
    font-style: italic;
    font-size: 0.85rem;
    letter-spacing: 0.01em;
    line-height: 1.1;
    text-align: center;
  }
  .frame-cap.top {
    font-weight: 600;
    color: var(--ink, #ececf2);
  }
  .frame-cap.bottom {
    color: var(--ink-dim, #a8a8b4);
  }

  .frame-box {
    position: relative;
    width: var(--frame-size);
    height: var(--frame-size);
    border: 1px solid color-mix(in oklab, var(--ink, #ececf2) 16%, transparent);
    border-radius: 12px;
    overflow: hidden;
    background: color-mix(in oklab, var(--ink, #ececf2) 5%, transparent);
    box-shadow: 0 1px 4px
      color-mix(in oklab, var(--ink, #ececf2) 7%, transparent);
  }
  .pose-box {
    width: 100%;
    height: 100%;
  }
  .pose-box.dual {
    display: grid;
  }
  .pose-layer {
    grid-area: 1 / 1;
    width: 100%;
    height: 100%;
  }
  .combined-cell {
    width: 100%;
    height: 100%;
  }
  .frame-box :global(.guide-pictograph) {
    width: 100%;
    height: 100%;
  }
  .frame-box :global(.pictograph-wrapper) {
    max-width: none !important;
    width: 100%;
    height: 100%;
  }

  .connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
  }
  .cap-spacer {
    display: block;
    min-height: 1.1rem;
  }
  .arrow-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: var(--frame-size);
    color: var(--ink-dim, #a8a8b4);
  }
  .flow-arrow {
    display: block;
    width: 100%;
    height: 0.8rem;
  }
  .equals {
    font-family: "Cambria", Georgia, serif;
    font-weight: 700;
    font-size: 1.5rem;
    line-height: 1;
  }

  .turn-strip-caption {
    font-size: 1rem;
    font-style: italic;
    letter-spacing: 0.01em;
    color: var(--ink-dim, #a8a8b4);
    text-align: center;
    line-height: 1.4;
    max-width: 30rem;
    margin: 0.35rem auto 0.25rem;
  }

  @container (max-width: 360px) {
    .turn-strip {
      --frame-size: clamp(3.6rem, 22cqw, 6rem);
      gap: 0.5rem 0.35rem;
    }
  }
</style>
