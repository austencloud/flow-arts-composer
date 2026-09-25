import {
  MediaCompositionPresetSchema,
  type MediaCompositionPreset,
  type PresetClip,
  type PresetSourceRole,
} from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import type { LayoutRegion } from "$lib/shared/media-composition/domain/media-layout-schema";
import {
  POST_PLAN_MIN_ACT_SECONDS,
  type Caption,
  type PerformanceAct,
  type PostPlan,
  type PostStrip,
} from "$lib/shared/media-composition/domain/post-plan";
import {
  BREAKDOWN_GEOMETRY,
  POST_STUDIO_ROLE,
} from "$lib/shared/media-composition/domain/post-studio-presets";

/**
 * Turns a plan into the free-layout preset the evaluator already plays.
 *
 * Every act is laid end to end. A performance act's clips carry the take's own
 * media seconds as their source span, and every layer drawn from the sequence
 * over that footage copies the span and names the take in `timeMapRole`, so
 * each one reads its move from the take's clock at the footage on screen.
 * An act's speed is the ratio of those spans; the rate on the clip only tells
 * the video element how fast to run.
 */

export const TAKE_ROLE_PREFIX = "take:";
export const STRIP_ROLE_PREFIX = "strip:";
export const CAPTIONS_ROLE = "post-captions";

export function takeRole(takeId: string): string {
  return `${TAKE_ROLE_PREFIX}${takeId}`;
}

export function stripRole(strip: Exclude<PostStrip, "off">): string {
  return `${STRIP_ROLE_PREFIX}${strip}`;
}

export function takeIdFromRole(role: string): string | null {
  return role.startsWith(TAKE_ROLE_PREFIX)
    ? role.slice(TAKE_ROLE_PREFIX.length)
    : null;
}

export function stripModeFromRole(
  role: string
): Exclude<PostStrip, "off"> | null {
  if (!role.startsWith(STRIP_ROLE_PREFIX)) return null;
  const mode = role.slice(STRIP_ROLE_PREFIX.length);
  return mode === "arrows" || mode === "mandala" || mode === "alternate"
    ? mode
    : null;
}

/** Where one act sits in the post and in its take. */
export interface CompiledAct {
  actId: string;
  kind: "performance" | "card";
  label: string;
  startSeconds: number;
  endSeconds: number;
  takeId: string | null;
  speed: number;
  /** Take media seconds; 0 for a card act. */
  sourceIn: number;
  sourceOut: number;
  layout: PerformanceAct["layout"] | null;
}

/** A caption on the post's own clock. */
export interface CompiledCaption {
  id: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
  position: Caption["position"];
  size: Caption["size"];
}

export interface CompiledPost {
  preset: MediaCompositionPreset;
  acts: CompiledAct[];
  captions: CompiledCaption[];
  durationSeconds: number;
  /** Take ids the preset draws, in first-use order. */
  takeIds: string[];
}

export interface CompilePostPlanContext {
  /** When the preset was made; kept out of the plan's own timestamp. */
  now: number;
}

const OUTPUT = {
  width: 1080,
  height: 1920,
  frameRate: 30,
  backgroundColor: "#08080c",
} as const;

/** A short dissolve at each act boundary so a cut to the next take is soft. */
const ACT_FADE_SECONDS = 0.25;

/**
 * The split: the take takes the upper half, the animation the lower. At 1080
 * wide the animation's square sits in 960 px of height, which keeps the
 * trails and glyphs as large as the full-width panel allows.
 */
export const SPLIT_TAKE_HEIGHT = 0.5;

type Rect = Pick<LayoutRegion, "x" | "y" | "width" | "height">;

const FULL_FRAME: Rect = { x: 0, y: 0, width: 1, height: 1 };
const SPLIT_TAKE: Rect = { x: 0, y: 0, width: 1, height: SPLIT_TAKE_HEIGHT };
const SPLIT_ANIMATION: Rect = {
  x: 0,
  y: SPLIT_TAKE_HEIGHT,
  width: 1,
  height: 1 - SPLIT_TAKE_HEIGHT,
};
const STRIP_SQUARE: Rect = {
  x: 0,
  y: BREAKDOWN_GEOMETRY.stripTop,
  width: BREAKDOWN_GEOMETRY.animationWidth,
  height: BREAKDOWN_GEOMETRY.stripHeight,
};
const STRIP_CAROUSEL: Rect = {
  x: BREAKDOWN_GEOMETRY.animationWidth,
  y: BREAKDOWN_GEOMETRY.stripTop,
  width: BREAKDOWN_GEOMETRY.carouselWidth,
  height: BREAKDOWN_GEOMETRY.stripHeight,
};
const ABOVE_STRIP: Rect = {
  x: 0,
  y: 0,
  width: 1,
  height: BREAKDOWN_GEOMETRY.stripTop,
};
/** The square alone spans the strip when the carousel is off. */
const STRIP_WIDE: Rect = {
  x: 0,
  y: BREAKDOWN_GEOMETRY.stripTop,
  width: 1,
  height: BREAKDOWN_GEOMETRY.stripHeight,
};

/** The area the strip covers, so framing can keep prop ends clear of it. */
export const STRIP_AREA: Rect = STRIP_WIDE;

const seconds = (value: number) => ({ unit: "seconds" as const, value });

function region(
  id: string,
  label: string,
  rect: Rect,
  fit: LayoutRegion["fit"],
  zIndex: number
): LayoutRegion {
  return {
    id,
    label,
    ...rect,
    zIndex,
    fit,
    clipContent: true,
    respectSafeArea: false,
  };
}

function role(
  key: string,
  label: string,
  resolution: PresetSourceRole["resolution"],
  acceptedKinds: PresetSourceRole["acceptedKinds"]
): PresetSourceRole {
  return { key, label, acceptedKinds, required: true, resolution };
}

/** The act's span of its take, clamped to the footage. */
function actSpan(
  act: PerformanceAct,
  takeDurationSeconds: number
): { sourceIn: number; sourceOut: number } | null {
  const sourceIn = Math.min(Math.max(0, act.sourceIn), takeDurationSeconds);
  const sourceOut = Math.min(
    act.sourceOut ?? takeDurationSeconds,
    takeDurationSeconds
  );
  if (sourceOut - sourceIn < POST_PLAN_MIN_ACT_SECONDS * act.speed) return null;
  return { sourceIn, sourceOut };
}

export function compilePostPlan(
  plan: PostPlan,
  context: CompilePostPlanContext
): CompiledPost | null {
  const takes = new Map(plan.takes.map((take) => [take.id, take]));
  const regions: LayoutRegion[] = [];
  const clips: PresetClip[] = [];
  const roles = new Map<string, PresetSourceRole>();
  const acts: CompiledAct[] = [];
  const takeIds: string[] = [];
  let cursor = 0;

  const useRole = (entry: PresetSourceRole) => {
    if (!roles.has(entry.key)) roles.set(entry.key, entry);
  };

  plan.acts.forEach((act, actIndex) => {
    if (!act.enabled) return;
    // Later acts draw above earlier ones, so the frame both share at a
    // boundary shows the act that is starting.
    const z = actIndex * 10;
    const fadeIn = acts.length > 0 ? ACT_FADE_SECONDS : undefined;

    if (act.kind === "card") {
      const start = cursor;
      const end = start + act.seconds;
      const regionId = `${act.id}:card`;
      regions.push(region(regionId, act.label, FULL_FRAME, "contain", z));
      useRole(
        role(POST_STUDIO_ROLE.card, "Choreo card", "linked-choreo-card", [
          "choreo-card",
        ])
      );
      clips.push({
        id: regionId,
        kind: "visual",
        sourceRole: POST_STUDIO_ROLE.card,
        regionId,
        start: seconds(start),
        end: seconds(end),
        sourceIn: seconds(0),
        sourceOut: seconds(act.seconds),
        playbackRate: 1,
        loop: false,
        opacity: 1,
        ...(fadeIn ? { fadeInSeconds: fadeIn } : {}),
        transform: {
          scale: 1,
          rotationDegrees: 0,
          translateX: 0,
          translateY: 0,
          flipHorizontal: false,
        },
        // The card closes the post whole; no move is highlighted.
        useResolvedTimeMap: false,
      });
      acts.push({
        actId: act.id,
        kind: "card",
        label: act.label,
        startSeconds: start,
        endSeconds: end,
        takeId: null,
        speed: 1,
        sourceIn: 0,
        sourceOut: act.seconds,
        layout: null,
      });
      cursor = end;
      return;
    }

    const take = act.takeId ? takes.get(act.takeId) : undefined;
    if (!take) return;
    const span = actSpan(act, take.durationSeconds);
    if (!span) return;
    const start = cursor;
    const end = start + (span.sourceOut - span.sourceIn) / act.speed;
    const timeMapRole = takeRole(take.id);
    if (!takeIds.includes(take.id)) takeIds.push(take.id);

    // Every clip over this act shares the act's timing, so their source time
    // is the take's media time and they all read one move.
    const timing = {
      start: seconds(start),
      end: seconds(end),
      sourceIn: seconds(span.sourceIn),
      sourceOut: seconds(span.sourceOut),
      playbackRate: act.speed,
      loop: false,
    };
    const derived = (
      id: string,
      sourceRole: string,
      regionId: string
    ): PresetClip => ({
      id,
      kind: "visual",
      sourceRole,
      regionId,
      ...timing,
      opacity: 1,
      ...(fadeIn ? { fadeInSeconds: fadeIn } : {}),
      transform: {
        scale: 1,
        rotationDegrees: 0,
        translateX: 0,
        translateY: 0,
        flipHorizontal: false,
      },
      useResolvedTimeMap: true,
      timeMapRole,
    });

    useRole(role(timeMapRole, take.label, "selected-video", ["video"]));
    const takeRegionId = `${act.id}:take`;
    const hasStrip = act.strip !== "off" || act.carousel;
    regions.push(
      region(
        takeRegionId,
        take.label,
        act.layout === "split"
          ? SPLIT_TAKE
          : hasStrip && act.framing.area === "above-strip"
            ? ABOVE_STRIP
            : FULL_FRAME,
        act.framing.fit,
        z
      )
    );
    clips.push({
      ...derived(takeRegionId, timeMapRole, takeRegionId),
      transform: {
        scale: act.framing.zoom,
        rotationDegrees: 0,
        translateX: act.framing.panX,
        translateY: act.framing.panY,
        flipHorizontal: false,
      },
    });

    if (act.layout === "split") {
      const animationRegionId = `${act.id}:animation`;
      useRole(
        role(
          POST_STUDIO_ROLE.animation,
          "Animation",
          "linked-sequence-animation",
          ["sequence-animation"]
        )
      );
      regions.push(
        region(animationRegionId, "Animation", SPLIT_ANIMATION, "contain", z)
      );
      clips.push(
        derived(animationRegionId, POST_STUDIO_ROLE.animation, animationRegionId)
      );
    } else {
      const strip = act.strip !== "off" ? stripRole(act.strip) : null;
      if (strip) {
        const squareRegionId = `${act.id}:strip`;
        useRole(
          role(strip, "Strip", "linked-sequence-derived", [
            "sequence-animation",
          ])
        );
        regions.push(
          region(
            squareRegionId,
            "Strip",
            act.carousel ? STRIP_SQUARE : STRIP_WIDE,
            "contain",
            z + 1
          )
        );
        clips.push(derived(squareRegionId, strip, squareRegionId));
      }
      if (act.carousel) {
        const carouselRegionId = `${act.id}:carousel`;
        useRole(
          role(
            POST_STUDIO_ROLE.carousel,
            "Carousel",
            "linked-sequence-derived",
            ["beat-carousel"]
          )
        );
        regions.push(
          region(
            carouselRegionId,
            "Carousel",
            strip ? STRIP_CAROUSEL : STRIP_WIDE,
            "contain",
            z + 1
          )
        );
        clips.push(
          derived(carouselRegionId, POST_STUDIO_ROLE.carousel, carouselRegionId)
        );
      }
    }

    acts.push({
      actId: act.id,
      kind: "performance",
      label: act.label,
      startSeconds: start,
      endSeconds: end,
      takeId: take.id,
      speed: act.speed,
      sourceIn: span.sourceIn,
      sourceOut: span.sourceOut,
      layout: act.layout,
    });
    cursor = end;
  });

  if (acts.length === 0 || cursor <= 0) return null;
  const durationSeconds = cursor;

  const captions = compileCaptions(plan.captions, acts);
  if (captions.length > 0) {
    const captionRegionId = "captions";
    useRole(role(CAPTIONS_ROLE, "Captions", "manual", ["image"]));
    regions.push(
      region(captionRegionId, "Captions", FULL_FRAME, "fill", 10_000)
    );
    clips.push({
      id: captionRegionId,
      kind: "visual",
      sourceRole: CAPTIONS_ROLE,
      regionId: captionRegionId,
      start: seconds(0),
      end: seconds(durationSeconds),
      sourceIn: seconds(0),
      sourceOut: seconds(durationSeconds),
      playbackRate: 1,
      loop: false,
      opacity: 1,
      transform: {
        scale: 1,
        rotationDegrees: 0,
        translateX: 0,
        translateY: 0,
        flipHorizontal: false,
      },
      useResolvedTimeMap: false,
    });
  }

  const preset = MediaCompositionPresetSchema.parse({
    schemaVersion: 1,
    id: `post-plan:${plan.sequenceId}`,
    ownerId: "post-plan",
    name: "Tutorial",
    createdAt: context.now,
    updatedAt: context.now,
    output: OUTPUT,
    duration: { mode: "fixed", seconds: durationSeconds },
    layoutModel: "free",
    markers: acts.map((act) => ({
      id: `act:${act.actId}:start`,
      label: act.label,
      time: seconds(act.startSeconds),
    })),
    sourceRoles: [...roles.values()],
    regions,
    clips,
    transitions: [],
    audioMix: { masterGain: 1, tracks: [] },
    targetDefaults: {
      instagram: { delivery: "handoff", coverFrameSeconds: 0 },
    },
  } satisfies MediaCompositionPreset);

  return { preset, acts, captions, durationSeconds, takeIds };
}

/**
 * Captions count from their act's start and stop at its end, so trimming or
 * slowing an earlier act carries them along instead of stranding them.
 */
export function compileCaptions(
  captions: readonly Caption[],
  acts: readonly CompiledAct[]
): CompiledCaption[] {
  const byId = new Map(acts.map((act) => [act.actId, act]));
  return captions.flatMap((caption): CompiledCaption[] => {
    const act = byId.get(caption.actId);
    const text = caption.text.trim();
    if (!act || text.length === 0) return [];
    const startSeconds = act.startSeconds + caption.startSeconds;
    const endSeconds = Math.min(
      act.endSeconds,
      act.startSeconds + caption.endSeconds
    );
    if (endSeconds - startSeconds < 0.1) return [];
    return [
      {
        id: caption.id,
        text,
        startSeconds,
        endSeconds,
        position: caption.position,
        size: caption.size,
      },
    ];
  });
}

/** The act playing at a post time; the later act at a shared boundary. */
export function actAtTime(
  acts: readonly CompiledAct[],
  timeSeconds: number
): CompiledAct | null {
  let found: CompiledAct | null = null;
  for (const act of acts) {
    if (timeSeconds >= act.startSeconds && timeSeconds <= act.endSeconds) {
      found = act;
    }
  }
  return found;
}

/** The post time at which an act shows a moment of its take, or null. */
export function postTimeForTakeTime(
  act: CompiledAct,
  takeSeconds: number
): number | null {
  if (act.kind !== "performance") return null;
  if (takeSeconds < act.sourceIn || takeSeconds > act.sourceOut) return null;
  return act.startSeconds + (takeSeconds - act.sourceIn) / act.speed;
}
