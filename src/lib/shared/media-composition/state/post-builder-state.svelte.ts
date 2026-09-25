import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
import {
  POST_ACT,
  addCaption as addPlanCaption,
  addTakeToPlan,
  editPlan,
  removeCaption as removePlanCaption,
  removeTakeFromPlan,
  updateAct as updatePlanAct,
  updateCaption as updatePlanCaption,
  type Caption,
  type PostAct,
  type PostPlan,
  type PostTake,
} from "$lib/shared/media-composition/domain/post-plan";
import {
  actAtTime,
  compilePostPlan,
  takeRole,
  type CompiledPost,
} from "$lib/shared/media-composition/domain/post-plan-compiler";
import {
  confirmTakeTiming,
  editTimingSection,
  resolveTakeTiming,
  takeSampleAt,
  takeTimingFromLegacyMarks,
  takeTimingStatus,
  type ResolvedTakeTiming,
  type TakeTiming,
  type TakeTimingStatus,
  type TimingSection,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  evaluatePresetFrame,
  type EvaluatedFrameLayer,
  type TakeClock,
} from "$lib/shared/media-composition/services/frame-evaluator";
import {
  openPostPlan,
  savePostPlan,
} from "$lib/shared/media-composition/services/post-plan-store";
import {
  catalogTakeKey,
  loadTakeTiming,
  localTakeKey,
  openTakeTiming,
  saveTakeTiming,
} from "$lib/shared/media-composition/services/take-timing-store";

/**
 * The tutorial builder's working state: the plan of acts, each take's timing
 * and footage, and the preview clock. Everything the canvas, the steps and the
 * export read comes from here, so a change in one step shows everywhere.
 *
 * Nothing here touches Firestore. The plan and the timings save on this
 * device as they change.
 */

export type PostBuilderStep =
  | "takes"
  | "timing"
  | "acts"
  | "captions"
  | "render";

export const POST_BUILDER_STEPS: readonly PostBuilderStep[] = [
  "takes",
  "timing",
  "acts",
  "captions",
  "render",
];

/** A catalog video as the builder needs it. */
export interface CatalogTakeSource {
  videoId: string;
  label: string;
  url: string;
  durationSeconds: number;
  /** A map tapped in an older editor, seeded into the timing on first open. */
  legacyStepMap?: StepMap;
}

interface TakeMedia {
  url: string;
  /** An object URL this state made and must release. */
  owned: boolean;
}

/** How many edits of one take's timing can be undone. */
const UNDO_DEPTH = 50;

export interface PostBuilderDeps {
  getSequence: () => SequenceData;
  /** Catalog videos for the sequence, looked up by id. */
  getCatalogVideo?: (videoId: string) => CatalogTakeSource | null;
  /** True when a painter can draw the split's beat overlay. */
  hasAnimationOverlay?: () => boolean;
  now?: () => number;
}

export function createPostBuilderState(deps: PostBuilderDeps) {
  const now = deps.now ?? (() => Date.now());
  const sequence = $derived(deps.getSequence());
  const moveBeats = $derived(sequence.steps.map((step) => step.duration ?? 1));

  let plan = $state.raw<PostPlan>(openPostPlan(sequence.id, now()));
  let media = $state.raw<Record<string, TakeMedia>>({});
  let timings = $state.raw<Record<string, TakeTiming>>({});
  let undoStacks = $state.raw<Record<string, TakeTiming[]>>({});

  let previewSeconds = $state(0);
  let playing = $state(false);
  let step = $state<PostBuilderStep>("takes");
  let selectedTakeId = $state<string | null>(null);
  let selectedActId = $state<string>(POST_ACT.fullSpeed);

  const resolved = $derived.by(() => {
    const out: Record<string, ResolvedTakeTiming> = {};
    for (const [takeId, timing] of Object.entries(timings)) {
      out[takeId] = resolveTakeTiming(timing, moveBeats);
    }
    return out;
  });

  const clocks = $derived.by(() => {
    const out: Record<string, TakeClock> = {};
    for (const [takeId, timing] of Object.entries(resolved)) {
      out[takeRole(takeId)] = {
        sampleAt: (mediaSeconds) => takeSampleAt(timing, mediaSeconds),
      };
    }
    return out;
  });

  const compiled = $derived<CompiledPost | null>(
    compilePostPlan(plan, {
      now: plan.updatedAt,
      animationOverlay: deps.hasAnimationOverlay?.() ?? false,
    })
  );
  const durationSeconds = $derived(compiled?.durationSeconds ?? 0);

  const frameLayers = $derived.by((): EvaluatedFrameLayer[] => {
    if (!compiled || durationSeconds <= 0) return [];
    return evaluatePresetFrame(
      compiled.preset,
      durationSeconds,
      previewSeconds,
      {
        steps: sequence.steps,
        startPlacementDuration: 1,
        clocks,
      }
    );
  });

  const currentAct = $derived(
    compiled ? actAtTime(compiled.acts, previewSeconds) : null
  );

  function statusOf(takeId: string): TakeTimingStatus {
    const timing = timings[takeId];
    return timing ? takeTimingStatus(timing, moveBeats) : "untapped";
  }

  /** Takes an enabled act draws, the ones whose timing the post depends on. */
  const takesInUse = $derived(
    plan.takes.filter((take) =>
      plan.acts.some(
        (act) =>
          act.enabled && act.kind === "performance" && act.takeId === take.id
      )
    )
  );

  const stepDone = $derived<Record<PostBuilderStep, boolean>>({
    takes:
      plan.takes.length > 0 &&
      plan.takes.every((take) => Boolean(media[take.id])),
    timing:
      takesInUse.length > 0 &&
      takesInUse.every((take) => statusOf(take.id) === "confirmed"),
    acts: Boolean(compiled?.acts.some((act) => act.kind === "performance")),
    captions: plan.captions.length > 0,
    render: false,
  });

  function commitPlan(next: PostPlan): void {
    if (next === plan) return;
    plan = next;
    savePostPlan(next);
  }

  function openTiming(take: PostTake, legacy?: StepMap): TakeTiming {
    const saved = loadTakeTiming(sequence.id, take.takeKey);
    if (saved) return saved;
    // A catalog video mapped in the older editor seeds its landings once.
    if (legacy && legacy.stepCount === moveBeats.length) {
      const seeded = takeTimingFromLegacyMarks({
        sequenceId: sequence.id,
        takeKey: take.takeKey,
        durationSeconds: take.durationSeconds,
        marks: legacy.beatTimestamps,
        ...(legacy.endTimestamp !== undefined
          ? { endMark: legacy.endTimestamp }
          : {}),
        now: now(),
      });
      if (seeded) {
        saveTakeTiming(seeded);
        return seeded;
      }
    }
    return openTakeTiming({
      sequenceId: sequence.id,
      takeKey: take.takeKey,
      durationSeconds: take.durationSeconds,
      movesPerPass: moveBeats.length,
      now: now(),
    });
  }

  function attach(
    take: PostTake,
    url: string,
    owned: boolean,
    legacy?: StepMap
  ) {
    const previous = media[take.id];
    if (previous?.owned && previous.url !== url)
      URL.revokeObjectURL(previous.url);
    media = { ...media, [take.id]: { url, owned } };
    if (!timings[take.id]) {
      timings = { ...timings, [take.id]: openTiming(take, legacy) };
    }
  }

  function nextTakeId(): string {
    let index = plan.takes.length + 1;
    while (plan.takes.some((take) => take.id === `take-${index}`)) index += 1;
    return `take-${index}`;
  }

  /** Set once Austen picks a step, so a late catalog list never moves him. */
  let stepChosen = false;

  function openingStep(): PostBuilderStep {
    return !stepDone.takes ? "takes" : !stepDone.timing ? "timing" : "acts";
  }

  // Takes saved in the plan: catalog and linked ones come straight back, a
  // local file waits for Austen to pick it again.
  for (const take of plan.takes) {
    if (take.ref.kind === "catalog") {
      const video = deps.getCatalogVideo?.(take.ref.videoId);
      // Without its video yet, the timing waits too, so an older editor's
      // map can still seed it when the catalog arrives.
      if (video) attach(take, video.url, false, video.legacyStepMap);
    } else if (take.ref.kind === "linked") {
      attach(take, take.ref.url, false);
    } else {
      timings = { ...timings, [take.id]: openTiming(take) };
    }
  }
  step = openingStep();
  selectedTakeId =
    takesInUse.find((take) => statusOf(take.id) !== "confirmed")?.id ??
    plan.takes[0]?.id ??
    null;

  /**
   * The catalog loads after the studio opens. Saved catalog takes that were
   * waiting for it get their video now.
   */
  function attachCatalogTakes(): void {
    let attached = false;
    for (const take of plan.takes) {
      if (take.ref.kind !== "catalog" || media[take.id]) continue;
      const video = deps.getCatalogVideo?.(take.ref.videoId);
      if (!video) continue;
      attach(take, video.url, false, video.legacyStepMap);
      attached = true;
    }
    if (attached && !stepChosen) step = openingStep();
  }

  function addLocalTake(file: File, durationSeconds: number): PostTake {
    const takeKey = localTakeKey(file);
    const existing = plan.takes.find((take) => take.takeKey === takeKey);
    const take: PostTake = existing ?? {
      id: nextTakeId(),
      label: file.name.replace(/\.[^.]+$/, "") || "Take",
      ref: {
        kind: "local",
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      },
      takeKey,
      durationSeconds,
    };
    if (!existing) commitPlan(addTakeToPlan(plan, take, now()));
    attach(take, URL.createObjectURL(file), true);
    selectedTakeId = take.id;
    return take;
  }

  /** Reattaches a saved local take; false when the file is a different one. */
  function relinkLocalTake(takeId: string, file: File): boolean {
    const take = plan.takes.find((candidate) => candidate.id === takeId);
    if (!take || take.takeKey !== localTakeKey(file)) return false;
    attach(take, URL.createObjectURL(file), true);
    return true;
  }

  function addCatalogTake(video: CatalogTakeSource): PostTake {
    const takeKey = catalogTakeKey(video.videoId);
    const existing = plan.takes.find((take) => take.takeKey === takeKey);
    const take: PostTake = existing ?? {
      id: nextTakeId(),
      label: video.label.slice(0, 120) || "Take",
      ref: { kind: "catalog", videoId: video.videoId },
      takeKey,
      durationSeconds: video.durationSeconds,
    };
    if (!existing) commitPlan(addTakeToPlan(plan, take, now()));
    attach(take, video.url, false, video.legacyStepMap);
    selectedTakeId = take.id;
    return take;
  }

  function removeTake(takeId: string): void {
    const held = media[takeId];
    if (held?.owned) URL.revokeObjectURL(held.url);
    const { [takeId]: _media, ...restMedia } = media;
    const { [takeId]: _timing, ...restTimings } = timings;
    media = restMedia;
    timings = restTimings;
    commitPlan(removeTakeFromPlan(plan, takeId, now()));
    if (selectedTakeId === takeId) selectedTakeId = plan.takes[0]?.id ?? null;
  }

  function renameTake(takeId: string, label: string): void {
    const trimmed = label.trim().slice(0, 120);
    if (!trimmed) return;
    commitPlan(
      editPlan(
        plan,
        (current) => ({
          ...current,
          takes: current.takes.map((take) =>
            take.id === takeId ? { ...take, label: trimmed } : take
          ),
        }),
        now()
      )
    );
  }

  function setTiming(takeId: string, next: TakeTiming, remember: boolean) {
    const current = timings[takeId];
    if (!current || next === current) return;
    if (remember) {
      const stack = [...(undoStacks[takeId] ?? []), current].slice(-UNDO_DEPTH);
      undoStacks = { ...undoStacks, [takeId]: stack };
    }
    timings = { ...timings, [takeId]: next };
    saveTakeTiming(next);
  }

  function editSection(
    takeId: string,
    sectionId: string,
    edit: (section: TimingSection) => TimingSection
  ): void {
    const current = timings[takeId];
    const section = current?.sections.find((entry) => entry.id === sectionId);
    if (!current || !section) return;
    // An edit that changes nothing (beat 1 moved with nothing fitted yet)
    // must not cost the confirmation or an undo step.
    const next = edit(section);
    if (next === section) return;
    setTiming(
      takeId,
      editTimingSection(current, sectionId, () => next, now()),
      true
    );
  }

  function editTiming(
    takeId: string,
    edit: (timing: TakeTiming) => TakeTiming
  ) {
    const current = timings[takeId];
    if (!current) return;
    const next = edit(current);
    if (next === current) return;
    setTiming(takeId, { ...next, confirmedAt: null, updatedAt: now() }, true);
  }

  function undoTiming(takeId: string): void {
    const stack = undoStacks[takeId];
    const previous = stack?.[stack.length - 1];
    if (!previous) return;
    undoStacks = { ...undoStacks, [takeId]: stack.slice(0, -1) };
    setTiming(takeId, { ...previous, updatedAt: now() }, false);
  }

  function confirmTiming(takeId: string): void {
    const current = timings[takeId];
    if (!current) return;
    setTiming(takeId, confirmTakeTiming(current, moveBeats, now()), false);
  }

  function updateAct(actId: string, edit: (act: PostAct) => PostAct): void {
    commitPlan(updatePlanAct(plan, actId, edit, now()));
  }

  function setAudio(audio: PostPlan["audio"]): void {
    commitPlan(editPlan(plan, (current) => ({ ...current, audio }), now()));
  }

  /** A caption in the act under the playhead, three seconds long. */
  function addCaptionAtPlayhead(text: string): string | null {
    const act = currentAct ?? compiled?.acts[compiled.acts.length - 1] ?? null;
    if (!act) return null;
    const length = act.endSeconds - act.startSeconds;
    const start = Math.min(
      Math.max(0, previewSeconds - act.startSeconds),
      Math.max(0, length - 1)
    );
    const id = `caption-${now().toString(36)}`;
    const caption: Caption = {
      id,
      actId: act.actId,
      text: text.slice(0, 140),
      startSeconds: start,
      endSeconds: Math.min(length, start + 3),
      position: "top",
      size: "l",
    };
    const next = addPlanCaption(plan, caption, now());
    commitPlan(next);
    return next === plan ? null : id;
  }

  function updateCaption(
    captionId: string,
    edit: (caption: Caption) => Caption
  ) {
    commitPlan(updatePlanCaption(plan, captionId, edit, now()));
  }

  function removeCaption(captionId: string): void {
    commitPlan(removePlanCaption(plan, captionId, now()));
  }

  function seek(seconds: number): void {
    previewSeconds = Math.min(durationSeconds, Math.max(0, seconds));
  }

  function advance(deltaSeconds: number): void {
    if (!playing) return;
    const next = previewSeconds + deltaSeconds;
    if (next >= durationSeconds) {
      previewSeconds = durationSeconds;
      playing = false;
      return;
    }
    previewSeconds = next;
  }

  function togglePlayback(): void {
    if (!playing && previewSeconds >= durationSeconds - 1e-3)
      previewSeconds = 0;
    playing = durationSeconds > 0 && !playing;
  }

  function pause(): void {
    playing = false;
  }

  function dispose(): void {
    for (const held of Object.values(media)) {
      if (held.owned) URL.revokeObjectURL(held.url);
    }
  }

  return {
    get sequence() {
      return sequence;
    },
    get moveBeats() {
      return moveBeats;
    },
    get plan() {
      return plan;
    },
    get compiled() {
      return compiled;
    },
    get durationSeconds() {
      return durationSeconds;
    },
    get frameLayers() {
      return frameLayers;
    },
    get currentAct() {
      return currentAct;
    },
    get previewSeconds() {
      return previewSeconds;
    },
    get isPlaying() {
      return playing;
    },
    get step() {
      return step;
    },
    set step(next: PostBuilderStep) {
      stepChosen = true;
      step = next;
    },
    get stepDone() {
      return stepDone;
    },
    get selectedTakeId() {
      return selectedTakeId;
    },
    set selectedTakeId(next: string | null) {
      selectedTakeId = next;
    },
    get selectedActId() {
      return selectedActId;
    },
    set selectedActId(next: string) {
      selectedActId = next;
    },
    get takesInUse() {
      return takesInUse;
    },
    mediaUrl(takeId: string): string | null {
      return media[takeId]?.url ?? null;
    },
    timing(takeId: string): TakeTiming | null {
      return timings[takeId] ?? null;
    },
    resolvedTiming(takeId: string): ResolvedTakeTiming | null {
      return resolved[takeId] ?? null;
    },
    timingStatus: statusOf,
    canUndoTiming(takeId: string): boolean {
      return (undoStacks[takeId]?.length ?? 0) > 0;
    },
    addLocalTake,
    relinkLocalTake,
    addCatalogTake,
    attachCatalogTakes,
    removeTake,
    renameTake,
    editSection,
    editTiming,
    undoTiming,
    confirmTiming,
    updateAct,
    setAudio,
    addCaptionAtPlayhead,
    updateCaption,
    removeCaption,
    seek,
    advance,
    togglePlayback,
    pause,
    dispose,
  };
}

export type PostBuilderState = ReturnType<typeof createPostBuilderState>;
