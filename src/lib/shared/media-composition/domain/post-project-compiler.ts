import {
  MediaCompositionPresetSchema,
  type MediaCompositionPreset,
  type MotionKey,
  type MotionTransformValue,
  type PresetClip,
  type PresetTransition,
  type PresetRegionKeyframesTrack,
  type PresetSourceRole,
  type PresetVisualClipMotion,
} from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import type {
  LayoutRegion,
  RegionEdge,
} from "$lib/shared/media-composition/domain/media-layout-schema";
import { regionEdge } from "$lib/shared/media-composition/domain/post-clip-edge";
import {
  ANIMATION_OVERLAY_ROLE,
  stripRole,
  takeRole,
} from "$lib/shared/media-composition/domain/post-plan-compiler";
import { POST_STUDIO_ROLE } from "$lib/shared/media-composition/domain/post-studio-presets";
import {
  MAIN_TRACK_INDEX,
  POST_TIME_EPSILON,
  clampBox,
  itemEnd,
  shortestTurn,
  type PostAnimationItem,
  type PostBox,
  type PostCarouselItem,
  type PostItem,
  type PostImageItem,
  type PostMovesItem,
  type PostProject,
  type PostTextSize,
  type PostTextStyle,
  type PostTextAnimation,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import { postSecondsOfKeyframe } from "$lib/shared/media-composition/domain/post-project-keyframes";
import {
  clipBox,
  postOutputSize,
  type PostOutputSize,
} from "$lib/shared/media-composition/domain/post-canvas";

/**
 * Turns an edited project into the free-layout preset the evaluator, the
 * preview and the export already play, plus the video spans (for the audio
 * mix) and the text items (for `text-item-painter.ts`) resolved out of it.
 *
 * A sequence layer (animation, moves, carousel) is split into pieces at the
 * edges of the main-track videos under it, so each piece reads the move of
 * whatever footage is on screen at that point rather than one clock for the
 * whole layer. A piece over a card or a gap has nothing to read a move from,
 * so it just holds the opening pose.
 */

export const TEXT_ROLE_PREFIX = "text:";

export function textRole(itemId: string): string {
  return `${TEXT_ROLE_PREFIX}${itemId}`;
}

export function itemIdFromTextRole(role: string): string | null {
  return role.startsWith(TEXT_ROLE_PREFIX)
    ? role.slice(TEXT_ROLE_PREFIX.length)
    : null;
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

/**
 * A piece clip's id is `<itemId>~<k>` and its overlay clip
 * `<itemId>~<k>:overlay`; a plain (unsplit) item's clip id is its own item
 * id and its staff effect clip `<itemId>~staff`. Either way the item it
 * belongs to is the text up to the first `~`.
 */
export function itemIdFromClipId(clipId: string): string {
  const split = clipId.indexOf("~");
  return split === -1 ? clipId : clipId.slice(0, split);
}

export interface CompilePostProjectContext {
  /** When the preset was made; kept out of the project's own timestamp. */
  now: number;
  /** Paint the beat number, letter and progress over an overlaid animation.
   *  Only a host with a painter for them asks for it. */
  animationOverlay?: boolean;
}

/** A drawn video item, flattened for the audio mixer. */
export interface CompiledVideoSegment {
  itemId: string;
  takeId: string;
  trackIndex: number;
  startSeconds: number;
  endSeconds: number;
  sourceIn: number;
  sourceOut: number;
  speed: number;
  volume: number;
}

/** A drawn text item, for `text-item-painter.ts` to read live. */
export interface CompiledTextItem {
  itemId: string;
  role: string;
  text: string;
  size: PostTextSize;
  style?: PostTextStyle;
  animation?: PostTextAnimation;
  box: PostBox;
  startSeconds: number;
  endSeconds: number;
}

export interface CompiledPostProject {
  preset: MediaCompositionPreset;
  durationSeconds: number;
  /** Take ids the preset draws, in first-use order. */
  takeIds: string[];
  imageIds: string[];
  videoSegments: CompiledVideoSegment[];
  texts: CompiledTextItem[];
}

const OUTPUT_FRAME_RATE = 30;
const OUTPUT_BACKGROUND = "#08080c";

const IDENTITY_TRANSFORM = {
  scale: 1,
  rotationDegrees: 0,
  translateX: 0,
  translateY: 0,
  flipHorizontal: false,
} as const;

const seconds = (value: number) => ({ unit: "seconds" as const, value });

function region(
  id: string,
  label: string,
  box: PostBox,
  fit: LayoutRegion["fit"],
  zIndex: number,
  edge?: RegionEdge
): LayoutRegion {
  return {
    id,
    label,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    zIndex,
    fit,
    clipContent: true,
    respectSafeArea: false,
    ...(edge ? { edge } : {}),
    ...(box.turn ? { turn: box.turn } : {}),
  };
}

function presetRole(
  key: string,
  label: string,
  resolution: PresetSourceRole["resolution"],
  acceptedKinds: PresetSourceRole["acceptedKinds"]
): PresetSourceRole {
  return { key, label, acceptedKinds, required: true, resolution };
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
        key: stripRole(item.mode),
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
}

/**
 * Splits a sequence item's span at the main-track video edges strictly
 * inside it, so each piece can copy the source mapping of whatever footage
 * plays under it. A piece not fully covered by one main video - it sits over
 * a card, a gap, or (in a malformed project) straddles two videos - falls
 * back to holding its own opening pose rather than reading a move from
 * nothing.
 */
function splitIntoPieces(
  item: SequenceItem,
  mainVideos: readonly PostVideoItem[]
): SequencePiece[] {
  const start = item.start;
  const end = itemEnd(item);
  const boundaries = new Set<number>([start, end]);
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

    // During a crossfade both videos cover the overlap. The incoming video
    // owns the picture on top, so its source clock must own linked layers too.
    let covering: PostVideoItem | undefined;
    for (const video of mainVideos) {
      if (
        a >= video.start - POST_TIME_EPSILON &&
        b <= itemEnd(video) + POST_TIME_EPSILON &&
        (!covering || video.start >= covering.start)
      ) {
        covering = video;
      }
    }
    if (covering) {
      pieces.push({
        start: a,
        end: b,
        sourceIn: covering.sourceIn + (a - covering.start) * covering.speed,
        sourceOut: covering.sourceIn + (b - covering.start) * covering.speed,
        rate: covering.speed,
        useResolvedTimeMap: true,
        timeMapRole: takeRole(covering.takeId),
        takeId: covering.takeId,
      });
    } else {
      pieces.push({
        start: a,
        end: b,
        sourceIn: 0,
        sourceOut: b - a,
        rate: 1,
        useResolvedTimeMap: false,
      });
    }
  }
  return pieces;
}

/**
 * Keyed turns as the compiled track plays them: each continues from the one
 * before it the short way round, as the editor blends them, so a turn
 * across -180..180 does not spin.
 */
function continuousTurns(stored: readonly number[]): number[] {
  let turn = 0;
  return stored.map((value, index) => {
    turn = index === 0 ? value : turn + shortestTurn(stored[index - 1]!, value);
    return turn;
  });
}

function transformMotionKeys(
  item: PostVideoItem
): MotionKey<MotionTransformValue>[] | undefined {
  const frames = item.keyframes?.framing;
  if (!frames || frames.length === 0) return undefined;
  const turns = continuousTurns(frames.map((kf) => kf.value.rotation));
  return frames.map((kf, index) => ({
    atSeconds: postSecondsOfKeyframe(item, kf.t),
    value: {
      scale: kf.value.zoom,
      rotationDegrees: turns[index]!,
      translateX: kf.value.panX,
      translateY: kf.value.panY,
    },
    easing: kf.easing,
  }));
}

function opacityMotionKeys(item: PostItem): MotionKey<number>[] | undefined {
  const frames = item.keyframes?.opacity;
  if (!frames || frames.length === 0) return undefined;
  return frames.map((kf) => ({
    atSeconds: postSecondsOfKeyframe(item, kf.t),
    value: kf.value,
    easing: kf.easing,
  }));
}

function sourceGeometryKeys(item: PostVideoItem | PostImageItem) {
  const keys = item.keyframes?.sourceGeometry?.map((kf) => ({
    atSeconds: postSecondsOfKeyframe(item, kf.t),
    value: kf.value,
    easing: kf.easing,
  }));
  if (!keys?.length) return undefined;
  // The native base matrix holds until the first authored transform key.
  if (
    item.sourceGeometry &&
    keys[0]!.atSeconds > item.start + POST_TIME_EPSILON
  ) {
    return [
      {
        atSeconds: item.start,
        value: item.sourceGeometry,
        easing: "hold" as const,
      },
      ...keys,
    ];
  }
  return keys;
}

/** The clip's `motion`, or undefined so an unanimated clip stays as it was. */
function motionFor(
  item: PostItem,
  transform?: MotionKey<MotionTransformValue>[]
): PresetVisualClipMotion | undefined {
  const opacity = opacityMotionKeys(item);
  if (!opacity && !transform) return undefined;
  return {
    ...(transform ? { transform } : {}),
    ...(opacity ? { opacity } : {}),
  };
}

/**
 * A `regionKeyframes` track for the item's own region, or undefined. A
 * shaped clip's region is its shape inside each keyed box. When any key is
 * turned, every key carries its turn, a straight one as 0.
 */
function regionKeyframesFor(
  item: PostItem,
  output: PostOutputSize
): PresetRegionKeyframesTrack | null {
  const frames = item.keyframes?.box;
  if (!frames || frames.length === 0) return null;
  const turns = frames.some((kf) => kf.value.turn !== undefined)
    ? continuousTurns(frames.map((kf) => kf.value.turn ?? 0))
    : null;
  return {
    regionId: item.id,
    keyframes: frames.map((kf, index) => {
      const rect =
        item.kind === "video" ? clipBox(item, kf.value, output) : kf.value;
      return {
        atSeconds: postSecondsOfKeyframe(item, kf.t),
        value: turns ? { ...rect, turn: turns[index]! } : rect,
        easing: kf.easing,
      };
    }),
  };
}

export function compilePostProject(
  project: PostProject,
  context: CompilePostProjectContext
): CompiledPostProject | null {
  const takes = new Map(project.takes.map((entry) => [entry.id, entry]));
  const images = new Map(
    (project.images ?? []).map((entry) => [entry.id, entry])
  );
  const output = postOutputSize(project.canvas);
  // Pieces read a main video's timing even when its own track is hidden - the
  // footage still exists, Austen just doesn't want its own picture on screen.
  const mainVideos = (project.tracks[MAIN_TRACK_INDEX]?.items ?? []).filter(
    (item): item is PostVideoItem => item.kind === "video"
  );

  const regions: LayoutRegion[] = [];
  const regionKeyframesList: PresetRegionKeyframesTrack[] = [];
  const clips: PresetClip[] = [];
  const roleByKey = new Map<string, PresetSourceRole>();
  const takeIds: string[] = [];
  const imageIds: string[] = [];
  const transitions: PresetTransition[] = [];
  const videoSegments: CompiledVideoSegment[] = [];
  const texts: CompiledTextItem[] = [];
  let maxEnd = 0;

  const useRole = (entry: PresetSourceRole): void => {
    if (!roleByKey.has(entry.key)) roleByKey.set(entry.key, entry);
  };
  const useTake = (takeId: string): void => {
    if (!takeIds.includes(takeId)) takeIds.push(takeId);
    const take = takes.get(takeId);
    useRole(
      presetRole(takeRole(takeId), take?.label ?? takeId, "selected-video", [
        "video",
      ])
    );
  };

  const compileItem = (item: PostItem, trackIndex: number): boolean => {
    const box = clampBox(item.box);
    const zIndex = (trackIndex + 1) * 10;
    const label = item.label ?? item.kind;

    switch (item.kind) {
      case "video": {
        if (!takes.has(item.takeId)) return false;
        useTake(item.takeId);
        const roleKey = takeRole(item.takeId);
        regions.push(
          region(
            item.id,
            label,
            item.sourceGeometry
              ? { x: 0, y: 0, width: 1, height: 1 }
              : clipBox(item, box, output),
            item.fit,
            zIndex,
            regionEdge(item.edge)
          )
        );
        const regionKeyframes = regionKeyframesFor(item, output);
        if (regionKeyframes) regionKeyframesList.push(regionKeyframes);
        const motion = motionFor(item, transformMotionKeys(item));
        const footage = {
          regionId: item.id,
          start: seconds(item.start),
          end: seconds(itemEnd(item)),
          sourceIn: seconds(item.sourceIn),
          sourceOut: seconds(item.sourceOut),
          playbackRate: item.speed,
          loop: false as const,
          opacity: item.opacity,
          ...(item.fadeIn > 0 ? { fadeInSeconds: item.fadeIn } : {}),
          ...(item.fadeOut > 0 ? { fadeOutSeconds: item.fadeOut } : {}),
          transform: {
            scale: item.zoom,
            rotationDegrees: item.rotation,
            translateX: item.panX,
            translateY: item.panY,
            flipHorizontal: item.flip,
          },
          ...(item.sourceGeometry
            ? { sourceGeometry: item.sourceGeometry }
            : {}),
          ...(item.autoAdjust ? { autoAdjust: item.autoAdjust } : {}),
          ...(item.colorGrade ? { colorGrade: item.colorGrade } : {}),
          ...(sourceGeometryKeys(item)
            ? { sourceGeometryKeyframes: sourceGeometryKeys(item) }
            : {}),
          ...(motion ? { motion } : {}),
        };
        clips.push({
          id: item.id,
          kind: "visual",
          sourceRole: roleKey,
          ...footage,
          useResolvedTimeMap: true,
          timeMapRole: roleKey,
        });
        // The staff effect rides the footage: same span, media time, framing
        // and fades, so its painter lands on the picture's own staff ends.
        if (item.staffEffect) {
          const staffRole = staffEffectRole(item.id);
          useRole(presetRole(staffRole, "Staff effect", "manual", ["image"]));
          clips.push({
            id: `${item.id}~staff`,
            kind: "visual",
            sourceRole: staffRole,
            ...footage,
            useResolvedTimeMap: false,
          });
        }
        videoSegments.push({
          itemId: item.id,
          takeId: item.takeId,
          trackIndex,
          startSeconds: item.start,
          endSeconds: itemEnd(item),
          sourceIn: item.sourceIn,
          sourceOut: item.sourceOut,
          speed: item.speed,
          volume: item.volume,
        });
        return true;
      }

      case "image": {
        if (!images.has(item.imageId)) return false;
        if (!imageIds.includes(item.imageId)) imageIds.push(item.imageId);
        const roleKey = `image:${item.imageId}`;
        useRole(
          presetRole(roleKey, images.get(item.imageId)!.label, "manual", [
            "image",
          ])
        );
        regions.push(
          region(
            item.id,
            label,
            item.sourceGeometry ? { x: 0, y: 0, width: 1, height: 1 } : box,
            "contain",
            zIndex
          )
        );
        const regionKeyframes = regionKeyframesFor(item, output);
        if (regionKeyframes) regionKeyframesList.push(regionKeyframes);
        const motion = motionFor(item);
        clips.push({
          id: item.id,
          kind: "visual",
          sourceRole: roleKey,
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
          ...(item.sourceGeometry
            ? { sourceGeometry: item.sourceGeometry }
            : {}),
          ...(sourceGeometryKeys(item)
            ? { sourceGeometryKeyframes: sourceGeometryKeys(item) }
            : {}),
          ...(motion ? { motion } : {}),
        });
        return true;
      }

      case "card": {
        useRole(
          presetRole(
            POST_STUDIO_ROLE.card,
            "Choreo card",
            "linked-choreo-card",
            ["choreo-card"]
          )
        );
        regions.push(region(item.id, label, box, "contain", zIndex));
        {
          const regionKeyframes = regionKeyframesFor(item, output);
          if (regionKeyframes) regionKeyframesList.push(regionKeyframes);
        }
        const cardMotion = motionFor(item);
        clips.push({
          id: item.id,
          kind: "visual",
          sourceRole: POST_STUDIO_ROLE.card,
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
          ...(cardMotion ? { motion: cardMotion } : {}),
        });
        return true;
      }

      case "animation":
      case "moves":
      case "carousel": {
        const sequenceRole = sequenceRoleFor(item);
        useRole(
          presetRole(
            sequenceRole.key,
            sequenceRole.label,
            sequenceRole.resolution,
            sequenceRole.acceptedKinds
          )
        );
        regions.push(region(item.id, label, box, "contain", zIndex));
        {
          const regionKeyframes = regionKeyframesFor(item, output);
          if (regionKeyframes) regionKeyframesList.push(regionKeyframes);
        }
        const sequenceMotion = motionFor(item);

        const pieces = splitIntoPieces(item, mainVideos);
        const wantsOverlay =
          item.kind === "animation" &&
          item.overlay &&
          !item.animationAppearance &&
          !!context.animationOverlay;
        if (wantsOverlay) {
          useRole(
            presetRole(ANIMATION_OVERLAY_ROLE, "Beat and letter", "manual", [
              "image",
            ])
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
          const inFadeIn =
            item.fadeIn > 0 && piece.start < itemStart + item.fadeIn;
          const inFadeOut =
            item.fadeOut > 0 && piece.end > itemFinish - item.fadeOut;
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
                  fadeInSeconds: item.fadeIn,
                  ...(piece.start !== itemStart
                    ? { fadeInStartSeconds: itemStart }
                    : {}),
                }
              : {}),
            ...(inFadeOut
              ? {
                  fadeOutSeconds: item.fadeOut,
                  ...(piece.end !== itemFinish
                    ? { fadeOutEndSeconds: itemFinish }
                    : {}),
                }
              : {}),
            transform: IDENTITY_TRANSFORM,
            useResolvedTimeMap: piece.useResolvedTimeMap,
            ...(piece.timeMapRole ? { timeMapRole: piece.timeMapRole } : {}),
            ...(sequenceMotion ? { motion: sequenceMotion } : {}),
          };
          clips.push({
            id: `${item.id}~${index}`,
            kind: "visual",
            sourceRole: sequenceRole.key,
            regionId: item.id,
            ...timing,
          });
          if (wantsOverlay) {
            clips.push({
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

      case "text": {
        if (item.text.trim().length === 0) return false;
        const roleKey = textRole(item.id);
        useRole(presetRole(roleKey, "Text", "manual", ["image"]));
        regions.push(region(item.id, label, box, "fill", zIndex));
        {
          const regionKeyframes = regionKeyframesFor(item, output);
          if (regionKeyframes) regionKeyframesList.push(regionKeyframes);
        }
        const textMotion = motionFor(item);
        clips.push({
          id: item.id,
          kind: "visual",
          sourceRole: roleKey,
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
          ...(textMotion ? { motion: textMotion } : {}),
        });
        texts.push({
          itemId: item.id,
          role: roleKey,
          text: item.text,
          size: item.size,
          ...(item.style ? { style: item.style } : {}),
          ...(item.animation ? { animation: item.animation } : {}),
          box,
          startSeconds: item.start,
          endSeconds: itemEnd(item),
        });
        return true;
      }
    }
  };

  project.tracks.forEach((track, trackIndex) => {
    if (track.hidden) return;
    for (const item of track.items) {
      if (compileItem(item, trackIndex))
        maxEnd = Math.max(maxEnd, itemEnd(item));
    }
  });

  const main = project.tracks[MAIN_TRACK_INDEX]?.items ?? [];
  for (let index = 0; index < main.length - 1; index++) {
    const outgoing = main[index]!;
    const incoming = main[index + 1]!;
    if (
      (outgoing.kind !== "video" && outgoing.kind !== "image") ||
      (incoming.kind !== "video" && incoming.kind !== "image") ||
      !outgoing.transitionOut?.duration ||
      !clips.some((clip) => clip.id === outgoing.id) ||
      !clips.some((clip) => clip.id === incoming.id)
    )
      continue;
    const start = Math.max(
      incoming.start,
      itemEnd(outgoing) - outgoing.transitionOut.duration
    );
    const end = Math.min(itemEnd(outgoing), itemEnd(incoming));
    if (end <= start) continue;
    transitions.push({
      id: `transition:${outgoing.id}:${incoming.id}`,
      kind: "crossfade",
      outgoingClipId: outgoing.id,
      incomingClipId: incoming.id,
      start: seconds(start),
      end: seconds(end),
      curve: "linear",
    });
  }

  if (clips.length === 0 || maxEnd <= 0) return null;

  // A blurred background draws the main clip on screen, so only main clips
  // the post draws can fill it.
  const drawn = new Set(clips.map((clip) => clip.id));
  const backdropClipIds =
    project.background === "blur"
      ? mainVideos.map((item) => item.id).filter((id) => drawn.has(id))
      : [];

  const preset = MediaCompositionPresetSchema.parse({
    schemaVersion: 1,
    id: `post-project:${project.sequenceId}`,
    ownerId: "post-project",
    name: "Post",
    createdAt: context.now,
    updatedAt: context.now,
    output: {
      ...output,
      frameRate: OUTPUT_FRAME_RATE,
      backgroundColor: OUTPUT_BACKGROUND,
    },
    duration: { mode: "fixed", seconds: maxEnd },
    layoutModel: "free",
    sourceRoles: [...roleByKey.values()],
    regions,
    ...(regionKeyframesList.length > 0
      ? { regionKeyframes: regionKeyframesList }
      : {}),
    ...(backdropClipIds.length > 0
      ? { backdrop: { kind: "blur" as const, clipIds: backdropClipIds } }
      : {}),
    clips,
    transitions,
    audioMix: { masterGain: 1, tracks: [] },
    targetDefaults: {
      instagram: { delivery: "handoff", coverFrameSeconds: 0 },
    },
  } satisfies MediaCompositionPreset);

  return {
    preset,
    durationSeconds: maxEnd,
    takeIds,
    imageIds,
    videoSegments,
    texts,
  };
}
