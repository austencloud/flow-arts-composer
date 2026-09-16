import type { MediaSourceKind } from "$lib/shared/media-composition/domain/media-source-schema";
import type { MediaCompositionPreset } from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import type {
  ClipTransform,
  LayoutRegion,
} from "$lib/shared/media-composition/domain/media-layout-schema";
import {
  evaluatePresetFrame,
  resolvePresetTimePoint,
} from "$lib/shared/media-composition/services/frame-evaluator";
import type { SequenceTimeMap } from "$lib/shared/media-composition/domain/sequence-time-map";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { MediaCompositionPresetSchema } from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import { clampTempoBpm } from "$lib/shared/animation-engine/domain/tempo-behavior";
import { getStepDuration } from "$lib/shared/animation-engine/timeline/services/step-grid-calculator";
import {
  POST_STUDIO_SOURCES,
  type PostStudioRenderMode,
  type PostStudioRoleKey,
} from "$lib/shared/media-composition/domain/post-studio-presets";
import {
  normalizePresetToSlots,
  slotIsOccupied,
  slotOccupancy,
  withClearedSlot,
  withSlotSource,
  withSlotSplit,
  type PostStudioSlotId,
} from "$lib/shared/media-composition/domain/post-studio-slots";

type VisualPresetClip = Extract<
  MediaCompositionPreset["clips"][number],
  { kind: "visual" }
>;

export type CompositionSourceStatus = "ready" | "preparing" | "missing";

/** The span of a source the post uses, in that source's own seconds. */
export interface SourceTrim {
  readonly inSeconds: number;
  readonly outSeconds: number;
}

/** A clip shorter than this is a frame, not an edit. */
const MINIMUM_TRIM_SECONDS = 0.5;

export interface CompositionSourceBinding {
  roleKey: string;
  kind: MediaSourceKind;
  label: string;
  previewUrl: string | null;
  previewType?: "video" | "image";
  renderMode?: PostStudioRenderMode;
  durationSeconds?: number;
  hasAudio?: boolean;
  status: CompositionSourceStatus;
  missingMessage?: string;
}

export interface MediaCompositionStateDeps {
  presets: readonly MediaCompositionPreset[];
  initialPresetId?: string;
  getBindings: () => readonly CompositionSourceBinding[];
  getSequenceTimeMap?: (durationSeconds: number) => SequenceTimeMap | null;
  getSequenceSteps?: () => readonly StepData[];
  startPlacementDuration?: number;
  requestSource?: (roleKey: string) => void;
}

function clonePreset(preset: MediaCompositionPreset): MediaCompositionPreset {
  // Presets are schema-constrained JSON. Serializing here deliberately strips
  // Svelte's nested reactive proxies before the snapshot crosses into Dexie or
  // Firestore, both of which require structured-cloneable plain data.
  return JSON.parse(JSON.stringify(preset)) as MediaCompositionPreset;
}

/**
 * Every preset entering the working set is put on the slot model first, so the
 * rest of this file — and every consumer — can assume region ids are `top` and
 * `bottom`. Built-ins name their regions `motion` / `card` / `performance`, and
 * presets already saved to Firestore carry whatever they were built with.
 */
function adoptPreset(preset: MediaCompositionPreset): MediaCompositionPreset {
  return normalizePresetToSlots(clonePreset(preset));
}

export function createMediaCompositionState(deps: MediaCompositionStateDeps) {
  if (deps.presets.length === 0) {
    throw new Error("Media composition state needs at least one preset");
  }

  const adopted = deps.presets.map(adoptPreset);
  const firstPreset = adopted[0]!;
  // Seeds are read from the ADOPTED copy, not the input. Reading region ids off
  // the raw preset would seed the selection with `motion`, an id that no longer
  // exists once the preset is on the slot model.
  const seededPreset =
    adopted.find((preset) => preset.id === deps.initialPresetId) ?? firstPreset;
  let workingPresets = $state<Record<string, MediaCompositionPreset>>(
    Object.fromEntries(adopted.map((preset) => [preset.id, preset]))
  );
  let activePresetId = $state(seededPreset.id);
  let selectedRegionId = $state<string | null>(
    seededPreset.regions[0]?.id ?? null
  );
  let selectedRoleKey = $state<string | null>(
    seededPreset.clips.find(
      (clip) => clip.kind === "visual" && clip.regionId === selectedRegionId
    )?.sourceRole ?? null
  );
  // Off by default. The dashed rectangle and its warm bands are a measuring
  // aid, not part of the post — leaving them on means every glance at the
  // canvas is a glance at scaffolding. The composition bar carries the switch.
  let safeZonesVisible = $state(false);
  let previewSeconds = $state(0);
  let isPlaying = $state(false);
  let durationOverrides = $state<Record<string, number>>({});
  /**
   * Which span of a source the post uses, in that source's own seconds. Held
   * beside the preset rather than inside the clip because a clip's
   * `sourceIn`/`sourceOut` are its montage in and out INSIDE the post, and the
   * timeline's clip handles already own those. A trim is a fact about the
   * footage: it shortens the post, offsets the media clock, and offsets the
   * step map, none of which a clip boundary does.
   */
  let sourceTrims = $state<Record<string, SourceTrim>>({});

  function getActivePreset(): MediaCompositionPreset {
    return workingPresets[activePresetId] ?? workingPresets[firstPreset.id]!;
  }

  function getRegions(): LayoutRegion[] {
    return getActivePreset().regions;
  }

  function getSelectedRegion(): LayoutRegion | null {
    const regions = getRegions();
    return (
      regions.find((region) => region.id === selectedRegionId) ??
      regions[0] ??
      null
    );
  }

  function getBindings(): readonly CompositionSourceBinding[] {
    return deps.getBindings();
  }

  function getMissingRequiredRoles(): CompositionSourceBinding[] {
    const bindings = getBindings();
    const requiredRoleKeys = getActivePreset()
      .sourceRoles.filter((role) => role.required)
      .map((role) => role.key);
    return requiredRoleKeys.flatMap((roleKey) => {
      const binding = bindings.find(
        (candidate) => candidate.roleKey === roleKey
      );
      return binding?.status !== "ready"
        ? [
            binding ?? {
              roleKey,
              kind: "image" as const,
              label: roleKey,
              previewUrl: null,
              status: "missing" as const,
            },
          ]
        : [];
    });
  }

  function getDurationSeconds(): number {
    const activePreset = getActivePreset();
    if (activePreset.duration.mode === "fixed") {
      return activePreset.duration.seconds;
    }
    if (activePreset.duration.mode === "sequence-tempo") {
      const startPlacementDuration = deps.startPlacementDuration ?? 1;
      const motionDuration = (deps.getSequenceSteps?.() ?? []).reduce(
        (total, step) => total + (step.duration ?? 1),
        0
      );
      return (
        (startPlacementDuration + motionDuration) *
        getStepDuration(activePreset.duration.bpm)
      );
    }
    const roleKey = activePreset.duration.sourceRole;
    const trim = getSourceTrim(roleKey);
    if (trim) return trim.outSeconds - trim.inSeconds;
    return getSourceLength(roleKey);
  }

  /** How long a source runs before any trim, in its own seconds. */
  function getSourceLength(roleKey: string): number {
    const binding = getBindings().find(
      (candidate) => candidate.roleKey === roleKey
    );
    return durationOverrides[roleKey] ?? binding?.durationSeconds ?? 8;
  }

  /**
   * A trim is clamped against the source it trims, so a map or a video that
   * resolves its true length after the trim was set cannot leave the post
   * pointing past the end of the footage.
   */
  function getSourceTrim(roleKey: string): SourceTrim | null {
    const stored = sourceTrims[roleKey];
    if (!stored) return null;
    const length = getSourceLength(roleKey);
    const inSeconds = Math.max(
      0,
      Math.min(stored.inSeconds, length - MINIMUM_TRIM_SECONDS)
    );
    const outSeconds = Math.min(
      length,
      Math.max(stored.outSeconds, inSeconds + MINIMUM_TRIM_SECONDS)
    );
    if (outSeconds - inSeconds >= length) return null;
    return { inSeconds, outSeconds };
  }

  /** Where project time zero sits in each trimmed source. */
  function getSourceTimeOffsets(): Record<string, number> {
    const offsets: Record<string, number> = {};
    for (const roleKey of Object.keys(sourceTrims)) {
      const trim = getSourceTrim(roleKey);
      if (trim) offsets[roleKey] = trim.inSeconds;
    }
    return offsets;
  }

  function setSourceTrim(roleKey: string, trim: SourceTrim | null): void {
    if (!trim) {
      if (!(roleKey in sourceTrims)) return;
      const { [roleKey]: _removed, ...rest } = sourceTrims;
      sourceTrims = rest;
      previewSeconds = Math.min(previewSeconds, getDurationSeconds());
      return;
    }
    if (!Number.isFinite(trim.inSeconds) || !Number.isFinite(trim.outSeconds)) {
      return;
    }
    const length = getSourceLength(roleKey);
    const inSeconds = Math.max(
      0,
      Math.min(trim.inSeconds, length - MINIMUM_TRIM_SECONDS)
    );
    const outSeconds = Math.min(
      length,
      Math.max(trim.outSeconds, inSeconds + MINIMUM_TRIM_SECONDS)
    );
    sourceTrims = { ...sourceTrims, [roleKey]: { inSeconds, outSeconds } };
    previewSeconds = Math.min(previewSeconds, getDurationSeconds());
  }

  /**
   * The step map is recorded against the mapped source as shot, so the offset
   * that rebases it is that source's trim — not whichever role happens to drive
   * the duration.
   */
  function getMappedTimeOffset(): number {
    const activePreset = getActivePreset();
    const mappedRole =
      activePreset.duration.mode === "follow-source-role"
        ? activePreset.duration.sourceRole
        : null;
    return mappedRole ? (getSourceTrim(mappedRole)?.inSeconds ?? 0) : 0;
  }

  function getFrameLayers() {
    const durationSeconds = getDurationSeconds();
    const timeMap = deps.getSequenceTimeMap?.(durationSeconds) ?? null;
    const steps = deps.getSequenceSteps?.() ?? [];
    return evaluatePresetFrame(
      getActivePreset(),
      durationSeconds,
      previewSeconds,
      timeMap
        ? {
            timeMap,
            steps,
            startPlacementDuration: deps.startPlacementDuration ?? 1,
            mediaTimeOffsetSeconds: getMappedTimeOffset(),
          }
        : null,
      getSourceTimeOffsets()
    );
  }

  function selectPreset(id: string): void {
    const next = workingPresets[id];
    if (!next) return;
    activePresetId = id;
    selectedRegionId = next.regions[0]?.id ?? null;
    selectedRoleKey =
      next.clips.find(
        (clip) => clip.kind === "visual" && clip.regionId === selectedRegionId
      )?.sourceRole ?? null;
    previewSeconds = 0;
    isPlaying = false;
  }

  function addPreset(
    input: MediaCompositionPreset,
    select = false
  ): MediaCompositionPreset {
    const preset = adoptPreset(MediaCompositionPresetSchema.parse(input));
    workingPresets = { ...workingPresets, [preset.id]: preset };
    if (select) selectPreset(preset.id);
    return preset;
  }

  function createPreset(name: string, ownerId: string): MediaCompositionPreset {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Preset name is required");
    const now = Date.now();
    return MediaCompositionPresetSchema.parse({
      ...clonePreset(getActivePreset()),
      id: crypto.randomUUID(),
      ownerId,
      name: trimmedName,
      description: `Saved from ${getActivePreset().name}.`,
      createdAt: now,
      updatedAt: now,
    });
  }

  function selectRegion(id: string, roleKey?: string | null): void {
    if (!getRegions().some((region) => region.id === id)) return;
    selectedRegionId = id;
    const clips = getActivePreset().clips.filter(
      (clip): clip is VisualPresetClip =>
        clip.kind === "visual" && clip.regionId === id
    );
    selectedRoleKey =
      clips.find((clip) => clip.sourceRole === roleKey)?.sourceRole ??
      clips[0]?.sourceRole ??
      null;
  }

  /**
   * Selects the layer carrying a role. If the role is not in the composition,
   * nothing happens — this used to search the other presets and silently switch
   * to one that contained the role, so clicking a source in the rail rearranged
   * the layout without saying so. Putting a source somewhere is `setSlotSource`
   * now, and it names the slot.
   */
  function selectRole(roleKey: string): void {
    const clip = getActivePreset().clips.find(
      (candidate) =>
        candidate.kind === "visual" && candidate.sourceRole === roleKey
    );
    if (clip?.kind !== "visual") return;
    selectedRegionId = clip.regionId;
    selectedRoleKey = roleKey;
  }

  function commitPreset(next: MediaCompositionPreset): void {
    workingPresets = { ...workingPresets, [activePresetId]: next };

    // A slot edit can delete the region or the role the selection pointed at,
    // and can change the duration policy underneath the playhead.
    const regions = next.regions;
    if (!regions.some((region) => region.id === selectedRegionId)) {
      selectedRegionId = regions[0]?.id ?? null;
    }
    const rolesInSelectedSlot = next.clips
      .filter(
        (clip) => clip.kind === "visual" && clip.regionId === selectedRegionId
      )
      .map((clip) => clip.sourceRole);
    if (!selectedRoleKey || !rolesInSelectedSlot.includes(selectedRoleKey)) {
      selectedRoleKey = rolesInSelectedSlot[0] ?? null;
    }
    previewSeconds = Math.min(previewSeconds, getDurationSeconds());
  }

  /** Which source roles occupy each slot, in time order. */
  function getSlotOccupancy() {
    return slotOccupancy(getActivePreset());
  }

  /**
   * A source may be blocked from a slot even though it exists — today only 3D,
   * which holds a live WebGL context and is limited to one slot at a time.
   */
  function slotAccepts(slot: PostStudioSlotId, roleKey: PostStudioRoleKey) {
    if (!POST_STUDIO_SOURCES[roleKey]?.exclusive) return true;
    const other: PostStudioSlotId = slot === "top" ? "bottom" : "top";
    return !getSlotOccupancy()[other].includes(roleKey);
  }

  function setSlotSource(
    slot: PostStudioSlotId,
    roleKey: PostStudioRoleKey
  ): void {
    if (!slotAccepts(slot, roleKey)) return;
    commitPreset(withSlotSource(getActivePreset(), slot, roleKey));
    selectedRegionId = slot;
    selectedRoleKey = roleKey;
  }

  /** Empties a slot. The survivor goes full frame; the last slot cannot go. */
  function clearSlot(slot: PostStudioSlotId): void {
    const preset = getActivePreset();
    if (!slotIsOccupied(preset, slot)) return;
    commitPreset(withClearedSlot(preset, slot));
  }

  // No swapSlots here. It existed for a circular button hanging off the seam of
  // the preview, which read as a rendering artefact rather than a control, and
  // swapping is two picks in the composition bar once the sources are named
  // there. `withSwappedSlots` remains in the slots module as a pure transform.

  function setSlotSplit(split: number): void {
    commitPreset(withSlotSplit(getActivePreset(), split));
  }

  function setSelectedFit(fit: LayoutRegion["fit"]): void {
    const selectedRegion = getSelectedRegion();
    if (!selectedRegion) return;
    const preset = workingPresets[activePresetId];
    if (!preset) return;
    workingPresets = {
      ...workingPresets,
      [activePresetId]: {
        ...preset,
        regions: preset.regions.map((region) =>
          region.id === selectedRegion.id ? { ...region, fit } : region
        ),
        updatedAt: Date.now(),
      },
    };
  }

  function selectedRegionSupportsFit(): boolean {
    if (!selectedRoleKey) return false;
    const binding = getBindings().find(
      (candidate) => candidate.roleKey === selectedRoleKey
    );
    return (binding?.renderMode ?? "external-media") === "external-media";
  }

  function setTempoBpm(value: number): void {
    const preset = workingPresets[activePresetId];
    if (!preset || preset.duration.mode !== "sequence-tempo") return;
    const bpm = clampTempoBpm(value);
    workingPresets = {
      ...workingPresets,
      [activePresetId]: {
        ...preset,
        duration: { mode: "sequence-tempo", bpm },
        updatedAt: Date.now(),
      },
    };
    previewSeconds = Math.min(previewSeconds, getDurationSeconds());
  }

  function setAnimationPlaybackMode(mode: "continuous" | "step"): void {
    const preset = workingPresets[activePresetId];
    if (!preset) return;
    workingPresets = {
      ...workingPresets,
      [activePresetId]: {
        ...preset,
        animationPlaybackMode: mode,
        updatedAt: Date.now(),
      },
    };
  }

  function getSelectedVisualClips(): VisualPresetClip[] {
    const selectedRegion = getSelectedRegion();
    if (!selectedRegion) return [];
    return getActivePreset().clips.filter(
      (clip): clip is VisualPresetClip =>
        clip.kind === "visual" &&
        clip.regionId === selectedRegion.id &&
        (!selectedRoleKey || clip.sourceRole === selectedRoleKey)
    );
  }

  function updateSelectedVisualClips(
    update: (clip: VisualPresetClip) => VisualPresetClip
  ): void {
    const selectedRegion = getSelectedRegion();
    const preset = workingPresets[activePresetId];
    if (!selectedRegion || !preset) return;

    workingPresets = {
      ...workingPresets,
      [activePresetId]: {
        ...preset,
        clips: preset.clips.map((clip) =>
          clip.kind === "visual" &&
          clip.regionId === selectedRegion.id &&
          (!selectedRoleKey || clip.sourceRole === selectedRoleKey)
            ? update(clip)
            : clip
        ),
        updatedAt: Date.now(),
      },
    };
  }

  function setSelectedTransform(patch: Partial<ClipTransform>): void {
    const validPatch: Partial<ClipTransform> = {};
    if (patch.scale !== undefined && Number.isFinite(patch.scale)) {
      validPatch.scale = Math.min(4, Math.max(0.25, patch.scale));
    }
    if (
      patch.rotationDegrees !== undefined &&
      Number.isFinite(patch.rotationDegrees)
    ) {
      validPatch.rotationDegrees = Math.min(
        360,
        Math.max(-360, patch.rotationDegrees)
      );
    }
    if (patch.translateX !== undefined && Number.isFinite(patch.translateX)) {
      validPatch.translateX = Math.min(1, Math.max(-1, patch.translateX));
    }
    if (patch.translateY !== undefined && Number.isFinite(patch.translateY)) {
      validPatch.translateY = Math.min(1, Math.max(-1, patch.translateY));
    }
    if (patch.flipHorizontal !== undefined) {
      validPatch.flipHorizontal = patch.flipHorizontal === true;
    }
    if (Object.keys(validPatch).length === 0) return;

    updateSelectedVisualClips((clip) => ({
      ...clip,
      transform: { ...clip.transform, ...validPatch },
    }));
  }

  function setSelectedOpacity(opacity: number): void {
    if (!Number.isFinite(opacity)) return;
    const clampedOpacity = Math.min(1, Math.max(0, opacity));
    updateSelectedVisualClips((clip) => ({ ...clip, opacity: clampedOpacity }));
  }

  /**
   * Reflects the selected layer's pixels. Only external media should reach
   * this: notation carries letters and glyphs that read backwards when the
   * pixels flip, so it mirrors through the sequence transforms instead.
   */
  function toggleSelectedFlip(): void {
    const current = getSelectedVisualClips()[0]?.transform.flipHorizontal;
    setSelectedTransform({ flipHorizontal: !current });
  }

  function resetSelectedAppearance(): void {
    updateSelectedVisualClips((clip) => ({
      ...clip,
      opacity: 1,
      transform: {
        scale: 1,
        rotationDegrees: 0,
        translateX: 0,
        translateY: 0,
        flipHorizontal: false,
      },
    }));
  }

  function setClipBoundary(
    clipId: string,
    boundary: "start" | "end",
    seconds: number
  ): void {
    if (!Number.isFinite(seconds)) return;
    const preset = getActivePreset();
    const clip = preset.clips.find(
      (candidate) => candidate.kind === "visual" && candidate.id === clipId
    );
    if (!clip || clip.kind !== "visual") return;

    const duration = getDurationSeconds();
    const minimumClipSeconds = Math.min(0.25, duration / 4);
    const minimumTransitionSeconds = Math.min(0.2, duration / 5);
    const currentStart = resolvePresetTimePoint(clip.start, duration);
    const currentEnd = resolvePresetTimePoint(clip.end, duration);

    let nextStart = currentStart;
    let nextEnd = currentEnd;
    if (boundary === "start") {
      nextStart = Math.min(
        currentEnd - minimumClipSeconds,
        Math.max(0, seconds)
      );
    } else {
      nextEnd = Math.max(
        currentStart + minimumClipSeconds,
        Math.min(duration, seconds)
      );
    }

    for (const transition of preset.transitions) {
      if (transition.outgoingClipId === clipId && boundary === "end") {
        const incoming = preset.clips.find(
          (candidate) => candidate.id === transition.incomingClipId
        );
        if (incoming) {
          nextEnd = Math.max(
            nextEnd,
            resolvePresetTimePoint(incoming.start, duration) +
              minimumTransitionSeconds
          );
        }
      }
      if (transition.incomingClipId === clipId && boundary === "start") {
        const outgoing = preset.clips.find(
          (candidate) => candidate.id === transition.outgoingClipId
        );
        if (outgoing) {
          nextStart = Math.min(
            nextStart,
            resolvePresetTimePoint(outgoing.end, duration) -
              minimumTransitionSeconds
          );
        }
      }
    }

    nextStart = Math.max(0, nextStart);
    nextEnd = Math.min(duration, nextEnd);
    const start = {
      unit: "duration-fraction" as const,
      value: nextStart / duration,
    };
    const end = {
      unit: "duration-fraction" as const,
      value: nextEnd / duration,
    };
    const clips = preset.clips.map((candidate) =>
      candidate.id === clipId
        ? { ...candidate, start, end, sourceIn: start, sourceOut: end }
        : candidate
    );
    const transitions = preset.transitions.map((transition) => {
      const outgoing = clips.find(
        (candidate) => candidate.id === transition.outgoingClipId
      );
      const incoming = clips.find(
        (candidate) => candidate.id === transition.incomingClipId
      );
      if (!outgoing || !incoming) return transition;
      return {
        ...transition,
        start: {
          unit: "duration-fraction" as const,
          value:
            Math.max(
              resolvePresetTimePoint(outgoing.start, duration),
              resolvePresetTimePoint(incoming.start, duration)
            ) / duration,
        },
        end: {
          unit: "duration-fraction" as const,
          value:
            Math.min(
              resolvePresetTimePoint(outgoing.end, duration),
              resolvePresetTimePoint(incoming.end, duration)
            ) / duration,
        },
      };
    });

    workingPresets = {
      ...workingPresets,
      [activePresetId]: {
        ...preset,
        clips,
        transitions,
        updatedAt: Date.now(),
      },
    };
  }

  function toggleSafeZones(): void {
    safeZonesVisible = !safeZonesVisible;
  }

  function setSourceDuration(roleKey: string, seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    durationOverrides = { ...durationOverrides, [roleKey]: seconds };
  }

  function seek(seconds: number): void {
    previewSeconds = Math.min(getDurationSeconds(), Math.max(0, seconds));
  }

  function togglePlayback(): void {
    if (previewSeconds >= getDurationSeconds()) previewSeconds = 0;
    isPlaying = !isPlaying;
  }

  function pause(): void {
    isPlaying = false;
  }

  function advance(deltaSeconds: number): void {
    if (!isPlaying || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0)
      return;
    const next = previewSeconds + deltaSeconds;
    if (next >= getDurationSeconds()) {
      previewSeconds = 0;
      return;
    }
    previewSeconds = next;
  }

  function roleForRegion(regionId: string): string | null {
    const activePreset = getActivePreset();
    const clip = activePreset.clips.find(
      (candidate) =>
        candidate.kind === "visual" && candidate.regionId === regionId
    );
    return clip?.sourceRole ?? null;
  }

  function bindingForRole(roleKey: string): CompositionSourceBinding | null {
    return getBindings().find((binding) => binding.roleKey === roleKey) ?? null;
  }

  function requestSource(roleKey: string): void {
    deps.requestSource?.(roleKey);
  }

  return {
    get presets() {
      return Object.values(workingPresets);
    },
    get activePresetId() {
      return activePresetId;
    },
    get activePreset() {
      return getActivePreset();
    },
    get regions() {
      return getRegions();
    },
    get selectedRegion() {
      return getSelectedRegion();
    },
    get selectedRole() {
      return selectedRoleKey;
    },
    get selectedBinding() {
      return selectedRoleKey ? bindingForRole(selectedRoleKey) : null;
    },
    get selectedTransform() {
      return getSelectedVisualClips()[0]?.transform ?? null;
    },
    get selectedOpacity() {
      return getSelectedVisualClips()[0]?.opacity ?? null;
    },
    get selectedSupportsFit() {
      return selectedRegionSupportsFit();
    },
    get selectedFlipHorizontal() {
      return getSelectedVisualClips()[0]?.transform.flipHorizontal ?? false;
    },
    get bindings() {
      return getBindings();
    },
    get missingRequiredRoles() {
      return getMissingRequiredRoles();
    },
    get isReady() {
      return getMissingRequiredRoles().length === 0;
    },
    get safeZonesVisible() {
      return safeZonesVisible;
    },
    get durationSeconds() {
      return getDurationSeconds();
    },
    /** The role whose footage sets the post's length, when one does. */
    get durationSourceRole() {
      const duration = getActivePreset().duration;
      return duration.mode === "follow-source-role" ? duration.sourceRole : null;
    },
    sourceLengthFor: getSourceLength,
    sourceTrimFor: getSourceTrim,
    setSourceTrim,
    get tempoBpm() {
      const duration = getActivePreset().duration;
      return duration.mode === "sequence-tempo" ? duration.bpm : null;
    },
    get animationPlaybackMode() {
      return getActivePreset().animationPlaybackMode ?? "continuous";
    },
    get previewSeconds() {
      return previewSeconds;
    },
    get isPlaying() {
      return isPlaying;
    },
    get frameLayers() {
      return getFrameLayers();
    },
    get sequenceTimeMap() {
      return deps.getSequenceTimeMap?.(getDurationSeconds()) ?? null;
    },
    get slotOccupancy() {
      return getSlotOccupancy();
    },
    slotAccepts,
    setSlotSource,
    clearSlot,
    setSlotSplit,
    selectPreset,
    addPreset,
    createPreset,
    selectRegion,
    selectRole,
    setSelectedFit,
    setTempoBpm,
    setAnimationPlaybackMode,
    setSelectedTransform,
    setSelectedOpacity,
    toggleSelectedFlip,
    resetSelectedAppearance,
    setClipBoundary,
    toggleSafeZones,
    setSourceDuration,
    seek,
    togglePlayback,
    pause,
    advance,
    roleForRegion,
    bindingForRole,
    requestSource,
  };
}

export type MediaCompositionState = ReturnType<
  typeof createMediaCompositionState
>;
