import type { LayoutRegion } from "$lib/shared/media-composition/domain/media-layout-schema";
import type { PostStaffEffectId } from "$lib/shared/media-composition/domain/post-project";
import {
  staffTipPath,
  staffTipsAt,
  type StaffColor,
  type StaffTipTrack,
} from "$lib/shared/media-composition/domain/staff-tip-track";
import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";
import {
  calculateMediaFit,
  resolvePanOffset,
  turnOf,
} from "$lib/shared/media-composition/services/media-fit";
import type {
  PaintRect,
  PostStudioLayerPainter,
} from "$lib/shared/media-composition/services/post-studio-layer-painter";
import { Canvas2DTrailRenderer } from "$lib/shared/animation-engine/services/canvas2d/canvas-2d-trail-renderer";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
  type TrailPoint,
  type TrailSettings,
} from "$lib/shared/animation-engine/domain/types/trail-types";
import {
  createCanvas2DEffectHost,
  type Canvas2DEffectHost,
} from "$lib/shared/effects/services/canvas2d-effect-host";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import type { EmitterTip } from "$lib/shared/effects/renderers/emitter-tip";

/**
 * Draws an effect on the lit ends of the LED staffs in a filmed take, from
 * the positions `staff-tip-analyzer.ts` found once and saved with the take.
 *
 * The layer rides its video clip: same span, same media time, same framing.
 * Points move with the footage's zoom, pan, turn and flip, but the effect is
 * drawn upright in the output's own pixels, so smoke still rises and sparks
 * still fall when the picture is turned.
 *
 * Particles run on the footage's own clock: a slowed clip gets slow sparks,
 * the way a slowed film of a real spark would look.
 */

/** Close to the LEDs in the footage, a little brighter so the effect reads. */
export const STAFF_EFFECT_COLORS: Readonly<Record<StaffColor, string>> = {
  blue: "#4da3ff",
  red: "#ff3b3b",
};

/** How much of the path behind an end the trail shows, in media seconds. */
export const STAFF_TRAIL_SECONDS = 0.3;

/** A jump longer than this restarts the particles instead of fast-forwarding. */
const MAX_STEP_SECONDS = 0.5;
/** Particles are run this far ahead of a jump so the effect is already full. */
const WARM_UP_SECONDS = 1;
const WARM_UP_STEP = 1 / 30;
/** Pulse keeps an overtone schedule in beats; a steady 120 per minute. */
const PULSE_BEATS_PER_SECOND = 2;

const TRAIL_SETTINGS: TrailSettings = {
  ...DEFAULT_TRAIL_SETTINGS,
  mode: TrailMode.FADE,
  fadeDurationMs: STAFF_TRAIL_SECONDS * 1000,
  lineWidth: 5,
  glowBlur: 3,
  leftColor: STAFF_EFFECT_COLORS.blue,
  rightColor: STAFF_EFFECT_COLORS.red,
};

type Transform = EvaluatedFrameLayer["transform"];

const IDENTITY: Transform = {
  scale: 1,
  rotationDegrees: 0,
  translateX: 0,
  translateY: 0,
  flipHorizontal: false,
};

/**
 * Where a point of the picture (as fractions of its width and height) lands
 * in `rect`, fitted and framed exactly the way the video layer draws.
 * Mirrors the compositor's fit, pan and layer transform so the effect sits on
 * the staff the viewer sees, in the preview and in the file.
 */
export function createStaffPointMapper(input: {
  rect: PaintRect;
  sourceWidth: number;
  sourceHeight: number;
  fit: LayoutRegion["fit"];
  transform?: Transform;
}): (x: number, y: number) => { x: number; y: number } {
  const { rect } = input;
  const transform = input.transform ?? IDENTITY;
  const fit = calculateMediaFit({
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    regionWidth: rect.width,
    regionHeight: rect.height,
    fit: input.fit,
  });
  const pan = resolvePanOffset({
    drawWidth: fit.drawRect.width,
    drawHeight: fit.drawRect.height,
    regionWidth: rect.width,
    regionHeight: rect.height,
    scale: transform.scale,
    translateX: transform.translateX,
    translateY: transform.translateY,
    rotationDegrees: transform.rotationDegrees,
  });
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const { cos, sin } = turnOf(transform.rotationDegrees);
  const flip = transform.flipHorizontal ? -1 : 1;
  const left = rect.x + fit.drawRect.x;
  const top = rect.y + fit.drawRect.y;

  return (x, y) => {
    // Relative to the slot's centre, flipped, scaled, turned, then panned:
    // the same order the compositor applies to the video itself.
    const dx = (left + x * fit.drawRect.width - centerX) * flip * transform.scale;
    const dy = (top + y * fit.drawRect.height - centerY) * transform.scale;
    return {
      x: centerX + pan.x + dx * cos - dy * sin,
      y: centerY + pan.y + dx * sin + dy * cos,
    };
  };
}

export interface StaffEffectSource {
  /** The take's staff ends, or null while none are found. */
  track(): StaffTipTrack | null;
  /** The effect the clip asks for, or null for none. */
  effect(): PostStaffEffectId | null;
  /** How the clip's slot fits its footage. */
  fit(): LayoutRegion["fit"];
}

interface ParticleRun {
  host: Canvas2DEffectHost;
  lastSeconds: number;
}

let scratchContext: CanvasRenderingContext2D | null | undefined;

/** A 1×1 canvas to run particles on without showing them. */
function scratch(): CanvasRenderingContext2D | null {
  if (scratchContext !== undefined) return scratchContext;
  try {
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(1, 1)
        : typeof document !== "undefined"
          ? document.createElement("canvas")
          : null;
    scratchContext = (canvas?.getContext("2d") ??
      null) as CanvasRenderingContext2D | null;
  } catch {
    scratchContext = null;
  }
  return scratchContext;
}

export function createStaffEffectPainter(
  source: StaffEffectSource
): PostStudioLayerPainter {
  const trails = new Canvas2DTrailRenderer();
  // One run per effect and size: the preview and an export can paint the
  // same clip at different sizes, and each needs its own particles.
  const runs = new Map<string, ParticleRun>();

  function emitters(
    track: StaffTipTrack,
    seconds: number,
    place: (x: number, y: number) => { x: number; y: number }
  ): EmitterTip[] {
    return staffTipsAt(track, seconds).map((tip) => ({
      ...place(tip.x, tip.y),
      propIndex: tip.staff,
      tipIndex: tip.end,
      end: tip.end === 0 ? "A" : "B",
      color: STAFF_EFFECT_COLORS[tip.color],
    }));
  }

  function paintTrails(
    context: CanvasRenderingContext2D,
    track: StaffTipTrack,
    seconds: number,
    size: number,
    place: (x: number, y: number) => { x: number; y: number }
  ): void {
    const byStaff: TrailPoint[][] = [[], []];
    track.staffs.forEach((_staff, staffIndex) => {
      for (const end of [0, 1] as const) {
        const runsOfEnd = staffTipPath(
          track,
          staffIndex,
          end,
          seconds - STAFF_TRAIL_SECONDS,
          seconds
        );
        runsOfEnd.forEach((run, runIndex) => {
          // The trail renderer draws one curve per tip index, so each run
          // gets its own and a hidden stretch is never bridged.
          const tipIndex = end * 1000 + runIndex;
          for (const point of run) {
            byStaff[staffIndex]!.push({
              ...place(point.x, point.y),
              timestamp: point.seconds * 1000,
              propIndex: staffIndex === 0 ? 0 : 1,
              tipIndex,
            });
          }
        });
      }
    });
    trails.renderTrails(
      context,
      byStaff[0]!,
      byStaff[1]!,
      TRAIL_SETTINGS,
      seconds * 1000,
      byStaff[0]!.length > 1,
      byStaff[1]!.length > 1,
      size
    );
  }

  function paintParticles(
    context: CanvasRenderingContext2D,
    effect: Exclude<PostStaffEffectId, "trails">,
    track: StaffTipTrack,
    seconds: number,
    rect: PaintRect,
    place: (x: number, y: number) => { x: number; y: number }
  ): void {
    // The renderers measure from the canvas corner, so they get tips
    // relative to the slot and the context moves to the slot instead.
    const local = (x: number, y: number) => {
      const point = place(x, y);
      return { x: point.x - rect.x, y: point.y - rect.y };
    };
    const key = `${effect}:${Math.round(rect.width)}x${Math.round(rect.height)}`;
    let run = runs.get(key);
    const step = run ? seconds - run.lastSeconds : Infinity;
    if (!run || step < 0 || step > MAX_STEP_SECONDS) {
      // A seek: start over and run the last second unseen, so the sparks
      // already trailing the staff are the ones a viewer would see.
      run = { host: createCanvas2DEffectHost(), lastSeconds: seconds };
      runs.set(key, run);
      const hidden = scratch();
      if (hidden) {
        const from = Math.max(
          track.firstSampleSeconds,
          seconds - WARM_UP_SECONDS
        );
        for (let at = from; at < seconds; at += WARM_UP_STEP) {
          run.host.render(
            hidden,
            effect,
            DEFAULT_EFFECTS_CONFIG,
            emitters(track, at, local),
            WARM_UP_STEP,
            rect.width,
            rect.height,
            at * PULSE_BEATS_PER_SECOND
          );
        }
      }
    }
    const dt = seconds - run.lastSeconds;
    run.lastSeconds = seconds;
    context.save();
    context.translate(rect.x, rect.y);
    run.host.render(
      context,
      effect,
      DEFAULT_EFFECTS_CONFIG,
      emitters(track, seconds, local),
      // Paused on a frame, the particles hold still.
      dt > 0 ? dt : 0.0001,
      rect.width,
      rect.height,
      seconds * PULSE_BEATS_PER_SECOND
    );
    context.restore();
  }

  return {
    ownsTransform: true,
    prepare: () => Promise.resolve(),
    paint(ctx, rect, frame) {
      const track = source.track();
      const effect = source.effect();
      if (!track || !effect || rect.width <= 0 || rect.height <= 0) return;
      const context = ctx as CanvasRenderingContext2D;
      const place = createStaffPointMapper({
        rect,
        sourceWidth: track.sourceWidth,
        sourceHeight: track.sourceHeight,
        fit: source.fit(),
        transform: frame.transform,
      });
      const seconds = frame.sourceTimeSeconds;
      if (effect === "trails") {
        paintTrails(
          context,
          track,
          seconds,
          Math.min(rect.width, rect.height),
          place
        );
        return;
      }
      paintParticles(context, effect, track, seconds, rect, place);
    },
  };
}
