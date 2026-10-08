import {
  ANIMATION_OVERLAY_ROLE,
  IDENTITY_TRANSFORM,
  PIP_HANDOFF_MAX_CLOCK_SECONDS,
  POST_STUDIO_ROLE,
  POST_TIME_EPSILON,
  clampBox,
  itemEnd,
  pipHandoffBoxAt,
  stripRole,
  takeRole,
  timingVideoAt,
  withPipHandoffBoxKeys,
  type CompileEnv,
  type CompileItemEnv,
  type FootageIntro,
  type PluginCompiledOutputs,
  type PostBox,
  type PostItem,
  type PostProject,
  type PostVideoItem,
  type PresetSourceRole,
  type ProjectCompileHooks,
} from "@austencloud/video-editor/core";
import {
  pipHandoffOf,
  type PipHandoff,
} from "$lib/shared/media-composition/domain/pip-handoff";
import {
  titlesPlanOf,
  type TunnelTitlesPlan,
} from "$lib/shared/media-composition/domain/tunnel-titles";
// Types only: item-kinds imports this module by value for each kind's compile.
import type {
  PostAnimationItem,
  PostCarouselItem,
  PostMovesItem,
} from "./item-kinds";

// This module and everything it reaches must never import the plugin index by
// value: item-kinds imports this module, create-plugin imports item-kinds, and
// the index re-exports create-plugin. tests/unit/video-editor-value-closure.test.ts
// guards it.

/**
 * tka's part of `compilePostProject`: the `compile` of its four item kinds
 * and the hooks around the core kinds (the picture-in-picture hand-off
 * pre-pass, the tunnel intro over footage, a video's staff effect clip and an
 * animation's intro span). The case bodies are the compiler's own, reading
 * its helpers through `env`.
 *
 * A sequence layer (animation, moves, carousel) is split into pieces at the
 * edges of the main-track videos under it, so each piece reads the move of
 * whatever footage is on screen at that point rather than one clock for the
 * whole layer. A piece over a card or a gap has nothing to read a move from,
 * so it just holds the opening pose.
 */

/** Scoped Moves use the animation renderer, with appearance owned by the item. */
export function movesAnimationRole(itemId: string): string {
  return `moves-animation:${itemId}`;
}

export function itemIdFromMovesAnimationRole(role: string): string | null {
  const prefix = "moves-animation:";
  return role.startsWith(prefix) ? role.slice(prefix.length) : null;
}

export const STAFF_EFFECT_ROLE_PREFIX = "staff:";

/** The painted layer that draws a video clip's staff effect. */
export function staffEffectRole(itemId: string): string {
  return `${STAFF_EFFECT_ROLE_PREFIX}${itemId}`;
}

export function itemIdFromStaffEffectRole(role: string): string | null {
  return role.startsWith(STAFF_EFFECT_ROLE_PREFIX)
    ? role.slice(STAFF_EFFECT_ROLE_PREFIX.length)
    : null;
}

type SequenceItem = PostAnimationItem | PostMovesItem | PostCarouselItem;

function sequenceRoleFor(item: SequenceItem): {
  key: string;
  label: string;
  resolution: PresetSourceRole["resolution"];
  acceptedKinds: PresetSourceRole["acceptedKinds"];
} {
  switch (item.kind) {
    case "animation":
      return {
        key: POST_STUDIO_ROLE.animation,
        label: "Animation",
        resolution: "linked-sequence-animation",
        acceptedKinds: ["sequence-animation"],
      };
    case "moves":
      return {
        key: item.animationAppearance
          ? movesAnimationRole(item.id)
          : stripRole(item.mode),
        label: "Strip",
        resolution: "linked-sequence-derived",
        acceptedKinds: ["sequence-animation"],
      };
    case "carousel":
      return {
        key: POST_STUDIO_ROLE.carousel,
        label: "Carousel",
        resolution: "linked-sequence-derived",
        acceptedKinds: ["beat-carousel"],
      };
  }
}

interface SequencePiece {
  start: number;
  end: number;
  sourceIn: number;
  sourceOut: number;
  rate: number;
  useResolvedTimeMap: boolean;
  timeMapRole?: string;
  takeId?: string;
  /** Inside the item's tunnel intro, which owns the sequence clock. */
  intro?: boolean;
}

/**
 * Where an item's tunnel intro ends, in post seconds; null when it has none.
 * A hook saved as its own item, with no stated length, is all intro.
 */
function tunnelIntroEnd(item: SequenceItem): number | null {
  if (item.kind !== "animation" || !item.tunnelHook) return null;
  const seconds = item.tunnelHook.seconds;
  return seconds === undefined
    ? itemEnd(item)
    : Math.min(itemEnd(item), item.start + seconds);
}

/**
 * Splits a sequence item's span at the main-track video edges strictly
 * inside it, so each piece can copy the source mapping of whatever footage
 * plays under it. A piece not fully covered by one main video - it sits over
 * a card, a gap, or (in a malformed project) straddles two videos - falls
 * back to holding its own opening pose rather than reading a move from
 * nothing. An item with a tunnel intro is also cut where the intro ends. An
 * intro played over its footage reads that footage's beats; any other intro
 * reads no footage and runs on its own speed curve.
 */
function splitIntoPieces(
  item: SequenceItem,
  mainVideos: readonly PostVideoItem[]
): SequencePiece[] {
  const start = item.start;
  const end = itemEnd(item);
  const introEnd = tunnelIntroEnd(item);
  const introOverFootage =
    item.kind === "animation" && item.tunnelHook?.backdrop === true;
  const boundaries = new Set<number>([start, end]);
  if (introEnd !== null && introEnd > start && introEnd < end) {
    boundaries.add(introEnd);
  }
  for (const video of mainVideos) {
    const videoStart = video.start;
    const videoEnd = itemEnd(video);
    if (videoStart > start && videoStart < end) boundaries.add(videoStart);
    if (videoEnd > start && videoEnd < end) boundaries.add(videoEnd);
  }
  const sorted = [...boundaries].sort((a, b) => a - b);

  const pieces: SequencePiece[] = [];
  for (let index = 0; index < sorted.length - 1; index++) {
    const a = sorted[index]!;
    const b = sorted[index + 1]!;
    if (b - a < POST_TIME_EPSILON) continue;

    const intro = introEnd !== null && b <= introEnd + POST_TIME_EPSILON;
    // The outgoing linked layer must finish its own motion as it fades.
    const covering =
      intro && !introOverFootage
        ? undefined
        : timingVideoAt(mainVideos, (a + b) / 2, item.anchor?.itemId);
    const piece: SequencePiece = covering
      ? {
          start: a,
          end: b,
          sourceIn: covering.sourceIn + (a - covering.start) * covering.speed,
          sourceOut: covering.sourceIn + (b - covering.start) * covering.speed,
          rate: covering.speed,
          useResolvedTimeMap: true,
          timeMapRole: takeRole(covering.takeId),
          takeId: covering.takeId,
        }
      : {
          start: a,
          end: b,
          sourceIn: 0,
          sourceOut: b - a,
          rate: 1,
          useResolvedTimeMap: false,
        };
    pieces.push(intro ? { ...piece, intro: true } : piece);
  }
  return pieces;
}

/**
 * The tunnel intro with footage behind it, or null. Its footage fills the
 * frame while the tunnel does and moves into its own framing with the canvas.
 */
function footageIntroOf(project: PostProject): FootageIntro | null {
  for (const track of project.tracks) {
    if (track.hidden) continue;
    for (const item of track.items) {
      if (
        item.kind === "animation" &&
        item.tunnelHook?.backdrop &&
        item.tunnelHook.seconds !== undefined
      ) {
        return {
          start: item.start,
          seconds: Math.min(item.tunnelHook.seconds, item.duration),
          ...(item.tunnelHook.backdropFrame
            ? { frame: item.tunnelHook.backdropFrame }
            : {}),
        };
      }
    }
  }
  return null;
}

/** The `env.state` key the hand-off pre-pass stores its result under. */
const PIP_STATE_KEY = "tka:pipHandoff";

interface PipPass {
  pipHandoff: PipHandoff | null;
  pipBoxes: { from: PostBox; to: PostBox } | null;
}

function pipPassOf(env: CompileEnv): PipPass {
  const pass = env.state.get(PIP_STATE_KEY) as PipPass | undefined;
  if (!pass) {
    throw new Error(
      "tka compile: the hand-off pre-pass (compileHooks.begin) did not run"
    );
  }
  return pass;
}

/** The `compile` of the animation, moves and carousel kinds. */
export function compileSequenceItem(
  item: PostItem,
  env: CompileItemEnv
): boolean {
  if (
    item.kind !== "animation" &&
    item.kind !== "moves" &&
    item.kind !== "carousel"
  )
    return false;
  const { project, context, output, mainVideos, box, zIndex, label } = env;
  const { useRole, useTake, region, presetRole } = env;
  const { regionKeyframesFor, motionFor, seconds } = env;
  const { pipHandoff, pipBoxes } = pipPassOf(env);
  const handoffRole =
    pipHandoff?.animation === item
      ? ("from" as const)
      : pipHandoff?.moves === item
        ? ("to" as const)
        : null;
  // A shared hand-off draws the square on the animation's own surface,
  // so the square's pieces join the animation's region and role.
  const sharedHandoff = handoffRole && pipHandoff?.shared ? pipHandoff : null;
  const sequenceRole = sequenceRoleFor(
    sharedHandoff && handoffRole === "to" ? sharedHandoff.animation : item
  );
  const pieceRegionId =
    sharedHandoff && handoffRole === "to"
      ? sharedHandoff.animation.id
      : item.id;
  useRole(
    presetRole(
      sequenceRole.key,
      sequenceRole.label,
      sequenceRole.resolution,
      sequenceRole.acceptedKinds
    )
  );
  const movesTrack = sharedHandoff
    ? project.tracks.findIndex((track) =>
        track.items.includes(sharedHandoff.moves)
      )
    : -1;
  env.addRegion(
    region(
      item.id,
      label,
      box,
      "contain",
      sharedHandoff && handoffRole === "from"
        ? Math.max(zIndex, (movesTrack + 1) * 10)
        : zIndex
    )
  );
  {
    const regionKeyframes = regionKeyframesFor(item, output);
    if (handoffRole && pipHandoff && pipBoxes) {
      const handoffKeys = withPipHandoffBoxKeys(
        regionKeyframes?.keyframes ?? [],
        pipHandoff,
        pipBoxes.from,
        pipBoxes.to,
        handoffRole === "from"
          ? regionKeyframes?.keyframes
          : regionKeyframesFor(pipHandoff.animation, output)?.keyframes
      );
      env.addRegionKeyframes({
        regionId: item.id,
        // The shared surface goes on to follow the square's own box.
        keyframes:
          sharedHandoff && handoffRole === "from"
            ? [
                ...handoffKeys.filter(
                  (key) => key.atSeconds < sharedHandoff.end + POST_TIME_EPSILON
                ),
                ...(
                  regionKeyframesFor(sharedHandoff.moves, output)?.keyframes ??
                  []
                ).filter(
                  (key) => key.atSeconds > sharedHandoff.end + POST_TIME_EPSILON
                ),
              ]
            : handoffKeys,
      });
    } else if (regionKeyframes) {
      env.addRegionKeyframes(regionKeyframes);
    }
  }
  // An animation shrinking into its square dissolves into it, or the
  // square into the animation, whichever draws on top; the one beneath
  // stays solid so the panel never thins in the middle. On a shared
  // surface nothing dissolves: the one surface changes its look.
  const overlap = pipHandoff ? pipHandoff.end - pipHandoff.start : 0;
  const fadeIn =
    handoffRole === "to"
      ? pipHandoff!.movesOnTop && !sharedHandoff
        ? overlap
        : 0
      : item.fadeIn;
  const fadeOut =
    handoffRole === "from"
      ? pipHandoff!.movesOnTop || sharedHandoff
        ? 0
        : overlap
      : item.fadeOut;
  const sequenceMotion = motionFor(item);

  const pieces = splitIntoPieces(item, mainVideos);
  const wantsOverlay =
    item.kind === "animation" &&
    item.overlay &&
    !item.animationAppearance &&
    !!context.animationOverlay;
  if (wantsOverlay) {
    useRole(
      presetRole(ANIMATION_OVERLAY_ROLE, "Beat and letter", "manual", ["image"])
    );
  }

  // A cut can land inside the whole item's fade-in or fade-out window,
  // so more than one piece can carry a share of it. Each such piece
  // reads the fade against the whole item's own start or end - not its
  // own, which a middle piece does not share - so opacity keeps one
  // continuous ramp across the cut instead of restarting at each piece.
  const itemStart = item.start;
  const itemFinish = itemEnd(item);
  pieces.forEach((piece, index) => {
    if (piece.takeId) useTake(piece.takeId);
    const inFadeIn = fadeIn > 0 && piece.start < itemStart + fadeIn;
    const inFadeOut = fadeOut > 0 && piece.end > itemFinish - fadeOut;
    // Both sides of a hand-off read one clock from the overlap on. A
    // shared surface marks every piece, so it is ready to turn early.
    const clockHandoff =
      handoffRole &&
      pipHandoff &&
      (handoffRole === "from"
        ? !!sharedHandoff || piece.end > pipHandoff.start + POST_TIME_EPSILON
        : piece.start < pipHandoff.end + PIP_HANDOFF_MAX_CLOCK_SECONDS)
        ? {
            id: pipHandoff.animation.id,
            role: handoffRole,
            start: pipHandoff.start,
            end: pipHandoff.end,
            ...(sharedHandoff ? { shared: true } : {}),
          }
        : null;
    const timing = {
      start: seconds(piece.start),
      end: seconds(piece.end),
      sourceIn: seconds(piece.sourceIn),
      sourceOut: seconds(piece.sourceOut),
      playbackRate: piece.rate,
      loop: false as const,
      opacity: item.opacity,
      ...(inFadeIn
        ? {
            fadeInSeconds: fadeIn,
            ...(piece.start !== itemStart
              ? { fadeInStartSeconds: itemStart }
              : {}),
          }
        : {}),
      ...(inFadeOut
        ? {
            fadeOutSeconds: fadeOut,
            ...(piece.end !== itemFinish
              ? { fadeOutEndSeconds: itemFinish }
              : {}),
          }
        : {}),
      transform: IDENTITY_TRANSFORM,
      useResolvedTimeMap: piece.useResolvedTimeMap,
      ...(piece.timeMapRole ? { timeMapRole: piece.timeMapRole } : {}),
      ...(item.kind === "animation" && item.tunnelHook && piece.intro
        ? { tunnelHook: item.tunnelHook }
        : {}),
      ...(clockHandoff ? { clockHandoff } : {}),
      ...(sequenceMotion ? { motion: sequenceMotion } : {}),
    };
    env.addClip({
      id: `${item.id}~${index}`,
      kind: "visual",
      sourceRole: sequenceRole.key,
      regionId: pieceRegionId,
      ...timing,
    });
    if (wantsOverlay) {
      env.addClip({
        id: `${item.id}~${index}:overlay`,
        kind: "visual",
        sourceRole: ANIMATION_OVERLAY_ROLE,
        regionId: item.id,
        ...timing,
      });
    }
  });
  return true;
}

/** The `compile` of the titles kind; its plan joins the `titles` output. */
export function compileTitlesItem(
  item: PostItem,
  env: CompileItemEnv
): boolean {
  if (item.kind !== "titles") return false;
  const { output, box, zIndex, label } = env;
  const { useRole, region, presetRole } = env;
  const { regionKeyframesFor, motionFor, seconds } = env;
  const plan = titlesPlanOf(item);
  useRole(presetRole(plan.role, "Titles", "manual", ["image"]));
  env.addRegion(region(item.id, label, box, "fill", zIndex));
  {
    const regionKeyframes = regionKeyframesFor(item, output);
    if (regionKeyframes) env.addRegionKeyframes(regionKeyframes);
  }
  const titlesMotion = motionFor(item);
  env.addClip({
    id: item.id,
    kind: "visual",
    sourceRole: plan.role,
    regionId: item.id,
    start: seconds(item.start),
    end: seconds(itemEnd(item)),
    sourceIn: seconds(0),
    sourceOut: seconds(item.duration),
    playbackRate: 1,
    loop: false,
    opacity: item.opacity,
    ...(item.fadeIn > 0 ? { fadeInSeconds: item.fadeIn } : {}),
    ...(item.fadeOut > 0 ? { fadeOutSeconds: item.fadeOut } : {}),
    transform: IDENTITY_TRANSFORM,
    useResolvedTimeMap: false,
    ...(titlesMotion ? { motion: titlesMotion } : {}),
  });
  env.addOutput("titles", plan);
  return true;
}

/**
 * tka's hooks around the core kinds, listed in the compiler's call order
 * (`regionSpan` also runs from inside `begin`).
 */
export const TKA_COMPILE_HOOKS: ProjectCompileHooks = {
  footageIntro: (env) => footageIntroOf(env.project),
  begin: (env) => {
    const { project, output, regionKeyframesFor } = env;
    // An animation ending over its picture-in-picture square shrinks into it.
    const pipHandoff = pipHandoffOf(project);
    const pipBoxes = pipHandoff
      ? {
          from: pipHandoffBoxAt(
            regionKeyframesFor(pipHandoff.animation, output)?.keyframes ?? [],
            pipHandoff.start,
            clampBox(pipHandoff.animation.box)
          ),
          to: pipHandoffBoxAt(
            regionKeyframesFor(pipHandoff.moves, output)?.keyframes ?? [],
            pipHandoff.end,
            clampBox(pipHandoff.moves.box)
          ),
        }
      : null;
    env.state.set(PIP_STATE_KEY, { pipHandoff, pipBoxes } satisfies PipPass);
  },
  // An animation's tunnel intro carries its region from the full frame.
  regionSpan: (item) =>
    item.kind === "animation" && item.tunnelHook?.seconds !== undefined
      ? {
          start: item.start,
          seconds: Math.min(item.tunnelHook.seconds, item.duration),
        }
      : null,
  videoCompanions: (item, env, footage) => {
    const { useRole, presetRole } = env;
    // The staff effect rides the footage: same span, media time, framing
    // and fades, so its painter lands on the picture's own staff ends.
    if (item.staffEffect) {
      const staffRole = staffEffectRole(item.id);
      useRole(presetRole(staffRole, "Staff effect", "manual", ["image"]));
      env.addClip({
        id: `${item.id}~staff`,
        kind: "visual",
        sourceRole: staffRole,
        ...footage,
        useResolvedTimeMap: false,
      });
    }
  },
};

/** tka's compiled outputs: each titles clip's words, for `tunnel-titles-painter.ts`. */
export const TKA_COMPILE_OUTPUTS = {
  titles: () => [] as TunnelTitlesPlan[],
} satisfies {
  [K in keyof PluginCompiledOutputs]: () => PluginCompiledOutputs[K];
};
