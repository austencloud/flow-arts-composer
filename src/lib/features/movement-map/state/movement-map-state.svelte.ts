import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepMap } from "#lib/shared/video-collaboration/domain/collaborative-video.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { analyzeDifficulty } from "#lib/shared/browse/services/sequence-difficulty-calculator.js";
import {
  loadLevelOneSpace,
  type LevelOneSpace,
} from "../domain/level-one-space";
import {
  buildCoverageReport,
  coverageForKeys,
  type CoverageReport,
} from "../domain/annotation-coverage";
import {
  EMPTY_DRAFT,
  isDraftEmpty,
  isSameInstant,
  signatureFromStep,
  signatureKey,
  type AnnotationDraft,
  type MovementAnnotation,
} from "../domain/movement-annotation";
import { stepPhaseAt, type StepPhasePosition } from "../domain/step-phase";
import type { MovementAnnotationStore } from "../services/movement-annotation-store";

export type MovementMapStage = "setup" | "timing" | "annotate";

/**
 * Frame rates the transport can step in. Slow-motion phone footage is the point
 * of the exercise: at 120 fps a single frame is 8 ms, which is fine enough to
 * land on the instant an arm changes direction.
 */
export const FRAME_RATES = [24, 30, 60, 120, 240] as const;

export interface VideoSource {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly duration: number;
  /** True when the url is a blob that must be revoked on teardown. */
  readonly isLocal: boolean;
}

export function createMovementMapState(store: MovementAnnotationStore) {
  let stage = $state<MovementMapStage>("setup");
  let video = $state<VideoSource | null>(null);
  let sequence = $state<SequenceData | null>(null);
  let stepMap = $state<StepMap | null>(null);

  let currentTime = $state(0);
  let isPlaying = $state(false);
  let playbackRate = $state(1);
  let frameRate = $state<number>(30);

  let annotations = $state<MovementAnnotation[]>([]);
  let space = $state<LevelOneSpace | null>(null);
  let spaceLoading = $state(false);
  let draft = $state<AnnotationDraft>(EMPTY_DRAFT);
  let selectedAnnotationId = $state<string | null>(null);
  let statusMessage = $state<string | null>(null);

  /**
   * Whether the chosen sequence is Level 1. Everything above Level 1 is out of
   * scope until this world is mapped, so the setup screen says so rather than
   * quietly letting the corpus fill with movements the coverage count cannot
   * even represent.
   */
  const difficulty = $derived(
    sequence ? analyzeDifficulty([...sequence.steps]) : null
  );
  const isLevelOne = $derived(difficulty?.level === 1);

  const position = $derived<StepPhasePosition | null>(
    stepMap ? stepPhaseAt(currentTime, stepMap) : null
  );

  const currentStep = $derived(
    position && sequence ? (sequence.steps[position.stepIndex] ?? null) : null
  );

  const leftSignature = $derived(
    currentStep ? signatureFromStep(currentStep, HandSide.LEFT) : null
  );
  const rightSignature = $derived(
    currentStep ? signatureFromStep(currentStep, HandSide.RIGHT) : null
  );

  const coverage = $derived<CoverageReport | null>(
    space ? buildCoverageReport(space, annotations) : null
  );

  /** The movement keys this sequence exercises, for a per-video progress line. */
  const sequenceKeys = $derived.by(() => {
    if (!sequence) return [] as string[];
    const keys: string[] = [];
    for (const step of sequence.steps) {
      for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
        const signature = signatureFromStep(step, hand);
        if (signature) keys.push(signatureKey(signature));
      }
    }
    return keys;
  });

  const sequenceCoverage = $derived(
    coverage ? coverageForKeys(coverage, sequenceKeys) : null
  );

  /** Annotations already recorded on the move currently in view. */
  const annotationsForCurrentStep = $derived.by(() => {
    if (!position || !video) return [] as MovementAnnotation[];
    return annotations
      .filter(
        (a) => a.videoId === video!.id && a.stepIndex === position!.stepIndex
      )
      .sort((a, b) => a.phase - b.phase);
  });

  async function loadSpace(): Promise<void> {
    if (space || spaceLoading) return;
    spaceLoading = true;
    try {
      space = await loadLevelOneSpace();
    } finally {
      spaceLoading = false;
    }
  }

  async function loadAnnotations(): Promise<void> {
    annotations = await store.loadAll();
  }

  function setVideo(next: VideoSource | null): void {
    if (video?.isLocal && video.url.startsWith("blob:")) {
      URL.revokeObjectURL(video.url);
    }
    video = next;
    currentTime = 0;
  }

  function setSequence(next: SequenceData | null): void {
    sequence = next;
    stepMap = null;
  }

  function setStepMap(next: StepMap | null): void {
    stepMap = next;
  }

  function goToStage(next: MovementMapStage): void {
    stage = next;
  }

  function seek(time: number): void {
    const duration = video?.duration ?? 0;
    currentTime = Math.min(Math.max(0, time), duration);
  }

  function stepFrames(frames: number): void {
    seek(currentTime + frames / frameRate);
  }

  function resetDraft(): void {
    draft = EMPTY_DRAFT;
    selectedAnnotationId = null;
  }

  function setReading(
    scope: "left" | "right" | "body",
    dimensionId: string,
    valueId: string | null
  ): void {
    const current = { ...draft[scope] };
    if (valueId === null) delete current[dimensionId];
    else current[dimensionId] = valueId;
    draft = { ...draft, [scope]: current };
  }

  function setNotes(notes: string): void {
    draft = { ...draft, notes };
  }

  /**
   * Loads an existing annotation back into the editor so revisiting an instant
   * corrects the record rather than stacking a second opinion beside it.
   */
  function editAnnotation(annotation: MovementAnnotation): void {
    selectedAnnotationId = annotation.id;
    draft = {
      left: { ...annotation.left },
      right: { ...annotation.right },
      body: { ...annotation.body },
      notes: annotation.notes,
    };
    seek(annotation.timestamp);
  }

  async function saveDraft(): Promise<boolean> {
    if (!position || !video || !sequence || isDraftEmpty(draft)) return false;

    const now = new Date().toISOString();
    const existing = selectedAnnotationId
      ? annotations.find((a) => a.id === selectedAnnotationId)
      : annotations.find(
          (a) =>
            a.videoId === video!.id &&
            isSameInstant(a, {
              videoId: video!.id,
              stepIndex: position!.stepIndex,
              phase: position!.phase,
            })
        );

    const annotation: MovementAnnotation = {
      id: existing?.id ?? crypto.randomUUID(),
      leftSignature,
      rightSignature,
      phase: position.phase,
      // The readings come off reactive state, which hands out proxies. IndexedDB
      // structured-clones what it stores and throws DataCloneError on a proxy,
      // so an observation would silently fail to save. Snapshotting turns them
      // back into plain objects.
      left: $state.snapshot(draft.left),
      right: $state.snapshot(draft.right),
      body: $state.snapshot(draft.body),
      notes: draft.notes.trim(),
      videoId: video.id,
      videoLabel: video.label,
      timestamp: currentTime,
      stepIndex: position.stepIndex,
      stepLetter: currentStep?.letter ? String(currentStep.letter) : null,
      sequenceId: sequence.id,
      sequenceWord: sequence.word,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await store.save(annotation);
    annotations = existing
      ? annotations.map((a) => (a.id === annotation.id ? annotation : a))
      : [...annotations, annotation];

    resetDraft();
    statusMessage = existing ? "Observation updated" : "Observation recorded";
    return true;
  }

  async function deleteAnnotation(id: string): Promise<void> {
    await store.remove(id);
    annotations = annotations.filter((a) => a.id !== id);
    if (selectedAnnotationId === id) resetDraft();
    statusMessage = "Observation removed";
  }

  async function importAnnotations(
    incoming: readonly MovementAnnotation[]
  ): Promise<number> {
    const added = await store.importAll(incoming);
    await loadAnnotations();
    statusMessage = `Merged ${added} observations`;
    return added;
  }

  function clearStatus(): void {
    statusMessage = null;
  }

  function teardown(): void {
    if (video?.isLocal && video.url.startsWith("blob:")) {
      URL.revokeObjectURL(video.url);
    }
  }

  return {
    get stage() {
      return stage;
    },
    get video() {
      return video;
    },
    get sequence() {
      return sequence;
    },
    get stepMap() {
      return stepMap;
    },
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      currentTime = value;
    },
    get isPlaying() {
      return isPlaying;
    },
    set isPlaying(value: boolean) {
      isPlaying = value;
    },
    get playbackRate() {
      return playbackRate;
    },
    set playbackRate(value: number) {
      playbackRate = value;
    },
    get frameRate() {
      return frameRate;
    },
    set frameRate(value: number) {
      frameRate = value;
    },
    get annotations() {
      return annotations;
    },
    get space() {
      return space;
    },
    get spaceLoading() {
      return spaceLoading;
    },
    get draft() {
      return draft;
    },
    get selectedAnnotationId() {
      return selectedAnnotationId;
    },
    get statusMessage() {
      return statusMessage;
    },
    get difficulty() {
      return difficulty;
    },
    get isLevelOne() {
      return isLevelOne;
    },
    get position() {
      return position;
    },
    get currentStep() {
      return currentStep;
    },
    get leftSignature() {
      return leftSignature;
    },
    get rightSignature() {
      return rightSignature;
    },
    get coverage() {
      return coverage;
    },
    get sequenceCoverage() {
      return sequenceCoverage;
    },
    get annotationsForCurrentStep() {
      return annotationsForCurrentStep;
    },
    loadSpace,
    loadAnnotations,
    setVideo,
    setSequence,
    setStepMap,
    goToStage,
    seek,
    stepFrames,
    resetDraft,
    setReading,
    setNotes,
    editAnnotation,
    saveDraft,
    deleteAnnotation,
    importAnnotations,
    clearStatus,
    teardown,
  };
}

export type MovementMapState = ReturnType<typeof createMovementMapState>;
