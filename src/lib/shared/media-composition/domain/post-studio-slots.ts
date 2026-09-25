/**
 * A Post Studio post is two stacked slots. Each slot is a TRACK: one or more
 * clips in time order, crossfading at the seams. One clip spanning the whole
 * duration is the default case, not a special one.
 *
 * Before this module the four entries in `post-studio-presets.ts` WERE the
 * model — four frozen (regions + clips + transitions) triples, so of the nine
 * two-slot pairings only two were reachable and there was no verb that could
 * change what sat in a slot. These functions are that missing verb set. They
 * are pure: they take a preset and return a new one, and the state layer owns
 * when to call them.
 *
 * Region ids are normalised to `top` and `bottom` so a slot is a POSITION,
 * independent of which source happens to be in it.
 */
import {
  MediaCompositionPresetSchema,
  type MediaCompositionPreset,
} from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import type { LayoutRegion } from "$lib/shared/media-composition/domain/media-layout-schema";
import {
  POST_STUDIO_ROLE,
  POST_STUDIO_SOURCES,
  type PostStudioRoleKey,
} from "$lib/shared/media-composition/domain/post-studio-presets";

export const POST_STUDIO_SLOTS = ["top", "bottom"] as const;
export type PostStudioSlotId = (typeof POST_STUDIO_SLOTS)[number];

export const DEFAULT_SLOT_SPLIT = 0.56;
const MIN_SLOT_SPLIT = 0.2;
const MAX_SLOT_SPLIT = 0.8;

const SLOT_FALLBACK_LABEL: Record<PostStudioSlotId, string> = {
  top: "Top",
  bottom: "Bottom",
};

type PresetClip = MediaCompositionPreset["clips"][number];
type VisualPresetClip = Extract<PresetClip, { kind: "visual" }>;
type PresetTransition = MediaCompositionPreset["transitions"][number];

function isVisual(clip: PresetClip): clip is VisualPresetClip {
  return clip.kind === "visual";
}

export interface SlotOccupancy {
  top: PostStudioRoleKey[];
  bottom: PostStudioRoleKey[];
}

/** Which source roles sit in each slot, in time order. */
export function slotOccupancy(preset: MediaCompositionPreset): SlotOccupancy {
  const forSlot = (slot: PostStudioSlotId): PostStudioRoleKey[] =>
    preset.clips
      .filter((clip) => isVisual(clip) && clip.regionId === slot)
      .map(
        (clip) => (clip as VisualPresetClip).sourceRole as PostStudioRoleKey
      );
  return { top: forSlot("top"), bottom: forSlot("bottom") };
}

export function slotIsOccupied(
  preset: MediaCompositionPreset,
  slot: PostStudioSlotId
): boolean {
  return preset.clips.some((clip) => isVisual(clip) && clip.regionId === slot);
}

/**
 * The split is stored as the top region's height, which is only meaningful
 * while both slots are filled. A lone slot is full-frame, so its height carries
 * no ratio and the caller gets the default back.
 */
export function slotSplit(preset: MediaCompositionPreset): number {
  const top = preset.regions.find((region) => region.id === "top");
  const bothFilled =
    slotIsOccupied(preset, "top") && slotIsOccupied(preset, "bottom");
  if (!top || !bothFilled) return DEFAULT_SLOT_SPLIT;
  return clampSplit(top.height);
}

function clampSplit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SLOT_SPLIT;
  return Math.min(MAX_SLOT_SPLIT, Math.max(MIN_SLOT_SPLIT, value));
}

/**
 * Geometry is derived from occupancy every time, never edited in place. An
 * emptied slot has to collapse its neighbour to full frame, and doing that by
 * patching rects at each call site is how the two drift apart.
 */
function regionsForOccupancy(
  occupancy: SlotOccupancy,
  split: number,
  previous: readonly LayoutRegion[]
): LayoutRegion[] {
  const filled = POST_STUDIO_SLOTS.filter((slot) => occupancy[slot].length > 0);
  const ratio = clampSplit(split);

  return filled.map((slot) => {
    const geometry =
      filled.length === 1
        ? { x: 0, y: 0, width: 1, height: 1 }
        : slot === "top"
          ? { x: 0, y: 0, width: 1, height: ratio }
          : { x: 0, y: ratio, width: 1, height: 1 - ratio };

    const carried = previous.find((region) => region.id === slot);
    return {
      id: slot,
      // The id is the position; the NAME stays what the slot holds. Labelling
      // regions "Top"/"Bottom" would leave the preview's accessible names
      // saying only where a control is, never what it edits.
      label: labelForRoles(occupancy[slot], slot),
      ...geometry,
      zIndex: 0,
      // Fit belongs to the source, not the position: a card wants `contain`
      // wherever it sits. `withSlotSource` sets it; everything else carries it.
      fit: carried?.fit ?? fitForRoles(occupancy[slot]),
      clipContent: true,
      respectSafeArea: false,
    } satisfies LayoutRegion;
  });
}

function fitForRoles(roles: readonly PostStudioRoleKey[]): LayoutRegion["fit"] {
  const first = roles[0];
  return first ? (POST_STUDIO_SOURCES[first]?.defaultFit ?? "cover") : "cover";
}

/**
 * A time-sliced slot is named for what it opens on, which is what the viewer
 * sees first and what the timeline lane is headed with.
 */
function labelForRoles(
  roles: readonly PostStudioRoleKey[],
  slot: PostStudioSlotId
): string {
  const first = roles[0];
  return (
    (first ? POST_STUDIO_SOURCES[first]?.label : undefined) ??
    SLOT_FALLBACK_LABEL[slot]
  );
}

/** Drop transitions whose endpoints no longer exist. */
function pruneTransitions(
  transitions: readonly PresetTransition[],
  clips: readonly PresetClip[]
): PresetTransition[] {
  const ids = new Set(clips.map((clip) => clip.id));
  return transitions.filter(
    (transition) =>
      ids.has(transition.outgoingClipId) && ids.has(transition.incomingClipId)
  );
}

/**
 * `sourceRoles` is rebuilt from the clips rather than edited, because the
 * schema rejects a preset whose clips reference an undeclared role and it is
 * far too easy to add a clip and forget the declaration.
 */
function rolesForClips(clips: readonly PresetClip[]) {
  const seen: PostStudioRoleKey[] = [];
  for (const clip of clips) {
    const key = clip.sourceRole as PostStudioRoleKey;
    if (POST_STUDIO_SOURCES[key] && !seen.includes(key)) seen.push(key);
  }
  return seen.map((key) => POST_STUDIO_SOURCES[key]!.role);
}

/**
 * The post is as long as its footage.
 *
 * Performance footage is the only source that arrives with a length of its own
 * — everything else is generated from the sequence and will fill whatever
 * duration it is given. So a post holding footage runs for the footage, and a
 * post that no longer holds any falls back to the tempo grid rather than
 * following a role that is gone and resolving to zero seconds.
 *
 * Both directions live here because this is the one place every slot verb
 * passes through. Reconciling in only one of them is what let a post keep a
 * 60bpm clock after a 43-second take was dropped into it, cutting the take off
 * a third of the way through.
 */
function durationForClips(
  duration: MediaCompositionPreset["duration"],
  clips: readonly PresetClip[]
): MediaCompositionPreset["duration"] {
  const holdsPerformance = clips.some(
    (clip) => clip.sourceRole === POST_STUDIO_ROLE.performance
  );
  if (holdsPerformance) {
    return {
      mode: "follow-source-role",
      sourceRole: POST_STUDIO_ROLE.performance,
    };
  }
  if (duration.mode !== "follow-source-role") return duration;
  const present = clips.some((clip) => clip.sourceRole === duration.sourceRole);
  return present ? duration : { mode: "sequence-tempo", bpm: 60 };
}

function rebuild(
  preset: MediaCompositionPreset,
  clips: PresetClip[],
  split: number
): MediaCompositionPreset {
  const occupancy: SlotOccupancy = {
    top: clips
      .filter((clip) => isVisual(clip) && clip.regionId === "top")
      .map(
        (clip) => (clip as VisualPresetClip).sourceRole as PostStudioRoleKey
      ),
    bottom: clips
      .filter((clip) => isVisual(clip) && clip.regionId === "bottom")
      .map(
        (clip) => (clip as VisualPresetClip).sourceRole as PostStudioRoleKey
      ),
  };

  // Motion tracks name regions by id, and the slot model renames regions and
  // derives their rects from occupancy. A slot post does not move.
  const { regionMotion: _motion, ...still } = preset;

  return MediaCompositionPresetSchema.parse({
    ...still,
    duration: durationForClips(preset.duration, clips),
    sourceRoles: rolesForClips(clips),
    regions: regionsForOccupancy(occupancy, split, preset.regions),
    clips,
    transitions: pruneTransitions(preset.transitions, clips),
    audioMix: {
      ...preset.audioMix,
      tracks: preset.audioMix.tracks.filter((track) =>
        clips.some((clip) => clip.id === track.clipId)
      ),
    },
    updatedAt: Date.now(),
  });
}

/**
 * Bring any preset onto the slot model. Built-in presets name their regions
 * `motion` / `card` / `performance`, and presets already saved to Firestore
 * carry whatever ids they were built with, so identity comes from vertical
 * order rather than from the id: topmost region is `top`, the next is `bottom`.
 * A single full-frame region becomes `top`, which is the same shape an emptied
 * bottom slot produces.
 */
export function normalizePresetToSlots(
  preset: MediaCompositionPreset
): MediaCompositionPreset {
  // A free layout keeps its own regions; see `layoutModel`.
  if (preset.layoutModel === "free") return preset;
  const ordered = [...preset.regions].sort((left, right) => left.y - right.y);
  if (ordered.length === 0) return preset;

  const idBySlot = new Map<string, PostStudioSlotId>();
  ordered.slice(0, POST_STUDIO_SLOTS.length).forEach((region, index) => {
    idBySlot.set(region.id, POST_STUDIO_SLOTS[index]!);
  });

  // A third region has no home in a two-slot model. Fold it into the slot it
  // overlaps most rather than dropping its clips on the floor.
  for (const region of ordered.slice(POST_STUDIO_SLOTS.length)) {
    idBySlot.set(region.id, region.y < 0.5 ? "top" : "bottom");
  }

  const clips = preset.clips.map((clip) =>
    isVisual(clip)
      ? { ...clip, regionId: idBySlot.get(clip.regionId) ?? "top" }
      : clip
  );

  const carried = ordered.map((region) => ({
    ...region,
    id: idBySlot.get(region.id) ?? region.id,
  }));

  return rebuild({ ...preset, regions: carried }, clips, ordered[0]!.height);
}

/**
 * Put a source in a slot, replacing whatever was there. Filling an empty slot
 * pulls the other one out of full-frame automatically.
 */
export function withSlotSource(
  preset: MediaCompositionPreset,
  slot: PostStudioSlotId,
  roleKey: PostStudioRoleKey
): MediaCompositionPreset {
  const source = POST_STUDIO_SOURCES[roleKey];
  if (!source) return preset;

  const kept = preset.clips.filter(
    (clip) => !(isVisual(clip) && clip.regionId === slot)
  );
  const clips = [...kept, source.clip(`${slot}-${roleKey}`, slot)];
  const next = rebuild(preset, clips, slotSplit(preset));

  return {
    ...next,
    regions: next.regions.map((region) =>
      region.id === slot ? { ...region, fit: source.defaultFit } : region
    ),
  };
}

/**
 * Empty a slot; the survivor goes full frame. The last remaining slot cannot be
 * cleared — a post with nothing in it has no meaning and the schema requires at
 * least one clip.
 */
export function withClearedSlot(
  preset: MediaCompositionPreset,
  slot: PostStudioSlotId
): MediaCompositionPreset {
  const clips = preset.clips.filter(
    (clip) => !(isVisual(clip) && clip.regionId === slot)
  );
  if (!clips.some(isVisual)) return preset;
  return rebuild(preset, clips, slotSplit(preset));
}

/**
 * Trade the two slots' contents. The rects stay put, so the split ratio is
 * preserved and only the content moves — dragging the divider afterwards is a
 * separate, undoable decision.
 */
export function withSwappedSlots(
  preset: MediaCompositionPreset
): MediaCompositionPreset {
  const clips = preset.clips.map((clip) =>
    isVisual(clip)
      ? {
          ...clip,
          regionId: clip.regionId === "top" ? "bottom" : "top",
        }
      : clip
  );
  const swappedFit = rebuild(preset, clips, slotSplit(preset));
  const fitFor = (slot: PostStudioSlotId) =>
    preset.regions.find(
      (region) => region.id === (slot === "top" ? "bottom" : "top")
    )?.fit;

  return {
    ...swappedFit,
    regions: swappedFit.regions.map((region) => ({
      ...region,
      fit: fitFor(region.id as PostStudioSlotId) ?? region.fit,
    })),
  };
}

/** Move the divider between the two slots. No-op unless both are filled. */
export function withSlotSplit(
  preset: MediaCompositionPreset,
  split: number
): MediaCompositionPreset {
  if (!slotIsOccupied(preset, "top") || !slotIsOccupied(preset, "bottom")) {
    return preset;
  }
  return rebuild(preset, [...preset.clips], clampSplit(split));
}
