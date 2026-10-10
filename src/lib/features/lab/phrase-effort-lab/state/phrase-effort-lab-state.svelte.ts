import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
import type { EffortTimeline } from "../domain/effort-timeline-types";
import { createEffortTimeline, removePhrase, insertPhrase, createEffortPhrase } from "../domain/effort-timeline-types";
import { persistTimeline, restoreTimeline, persistSequenceId, getPersistedSequenceId } from "../services/phrase-effort-lab-persister";

const DEFAULT_PROP_STATE: PropState = {
  centerPathAngle: 0,
  staffRotationAngle: 0,
};

export interface PhraseEffortLabState {
  selectedEffort: EffortId;
  readonly timeline: EffortTimeline;
  readonly selectedPhraseId: string | null;
  isPlaying: boolean;
  playbackBeat: number;
  showPicker: boolean;
  sequence: SequenceData | null;
  readonly steps: readonly StepData[];
  leftProp: PropState;
  rightProp: PropState;
  currentStep: number;
  currentLetter: Letter | null;
  currentStepData: StepData | null;
  saving: boolean;
  saveStatus: "idle" | "saved" | "error";
  showPresetMenu: boolean;
  bpm: number;
  rafId: number | null;
  lastTime: number | null;
  readonly gridMode: GridMode;
  readonly sequenceWord: string | null;
  readonly totalSteps: number;
  readonly currentStepForTimeline: number;
  readonly hasUnsavedChanges: boolean;
  readonly DEFAULT_PROP_STATE: PropState;
  loadSequence(seq: SequenceData): void;
  togglePlayback(): void;
  setBpm(newBpm: number): void;
  updateTimeline(updated: EffortTimeline): void;
  selectPhrase(id: string | null): void;
  toggleTransition(): void;
  restart(): void;
  deleteSelected(): void;
  clearTimeline(): void;
  applyPreset4x4(efforts: [EffortId, EffortId, EffortId, EffortId]): void;
  tryRestoreTimeline(): boolean;
  getPersistedSequenceId(): string | null;
}

export function createPhraseEffortLabState(): PhraseEffortLabState {
  let selectedEffort: EffortId = $state("linear");
  let timeline: EffortTimeline = $state(createEffortTimeline());
  let selectedPhraseId: string | null = $state(null);
  let isPlaying = $state(true);
  let playbackBeat = $state(0);

  let showPicker = $state(false);
  let sequence = $state<SequenceData | null>(null);
  let steps = $state<readonly StepData[]>([]);
  let leftProp = $state<PropState>({ ...DEFAULT_PROP_STATE });
  let rightProp = $state<PropState>({ ...DEFAULT_PROP_STATE });
  let currentStep = $state(0);
  let currentLetter = $state<Letter | null>(null);
  let currentStepData = $state<StepData | null>(null);
  let saving = $state(false);
  let saveStatus = $state<"idle" | "saved" | "error">("idle");
  let showPresetMenu = $state(false);

  let bpm = $state(60);
  let rafId: number | null = null;
  let lastTime: number | null = null;

  const gridMode = $derived(sequence?.gridMode ?? GridMode.DIAMOND);
  const sequenceWord = $derived(sequence?.word ?? sequence?.name ?? null);
  const totalSteps = $derived(steps.length);
  const currentStepForTimeline = $derived(Math.floor(playbackBeat) + 1);
  const hasUnsavedChanges = $derived(sequence !== null && timeline.phrases.length > 0);

  function loadSequence(seq: SequenceData) {
    showPicker = false;
    sequence = seq;
    steps = seq.steps ?? [];
    playbackBeat = 0;
    lastTime = null;
    saveStatus = "idle";

    if (seq.id) {
      persistSequenceId(seq.id);
    }

    if (seq.effortTimeline) {
      timeline = seq.effortTimeline;
    } else {
      timeline = createEffortTimeline();
    }

    if (steps.length > 0) {
      isPlaying = true;
    }
  }

  function togglePlayback() {
    if (steps.length === 0) return;
    isPlaying = !isPlaying;
    if (!isPlaying) {
      lastTime = null;
    }
  }

  function setBpm(newBpm: number) {
    bpm = newBpm;
  }

  function updateTimeline(updated: EffortTimeline) {
    timeline = updated;
    saveStatus = "idle";
    persistTimeline(timeline);
  }

  function selectPhrase(id: string | null) {
    selectedPhraseId = id;
  }

  function toggleTransition() {
    timeline = {
      ...timeline,
      transition: timeline.transition === "hard" ? "blend" : "hard",
      ...(timeline.transition === "hard" ? { blendSteps: 1 } : {}),
    };
    saveStatus = "idle";
    persistTimeline(timeline);
  }

  function restart() {
    playbackBeat = 0;
    lastTime = null;
    if (!isPlaying) {
      isPlaying = true;
    }
  }

  function deleteSelected() {
    if (!selectedPhraseId) return;
    timeline = removePhrase(timeline, selectedPhraseId);
    selectedPhraseId = null;
    saveStatus = "idle";
    persistTimeline(timeline);
  }

  function clearTimeline() {
    timeline = createEffortTimeline();
    selectedPhraseId = null;
    saveStatus = "idle";
    persistTimeline(timeline);
  }

  function applyPreset4x4(efforts: [EffortId, EffortId, EffortId, EffortId]) {
    if (totalSteps < 4) return;

    const sectionSize = Math.floor(totalSteps / 4);
    let newTimeline = createEffortTimeline();

    for (let i = 0; i < 4; i++) {
      const startStep = i * sectionSize + 1;
      const endStep = i === 3 ? totalSteps : (i + 1) * sectionSize;
      const phrase = createEffortPhrase(efforts[i]!, startStep, endStep);
      newTimeline = insertPhrase(newTimeline, phrase);
    }

    newTimeline = { ...newTimeline, transition: timeline.transition, blendSteps: timeline.blendSteps };
    timeline = newTimeline;
    selectedPhraseId = null;
    saveStatus = "idle";
    showPresetMenu = false;
    persistTimeline(timeline);
  }

  function tryRestoreTimeline(): boolean {
    const saved = restoreTimeline();
    if (saved?.phrases) {
      timeline = saved;
      return true;
    }
    return false;
  }

  return {
    get selectedEffort() { return selectedEffort; },
    set selectedEffort(v: EffortId) { selectedEffort = v; },
    get timeline() { return timeline; },
    get selectedPhraseId() { return selectedPhraseId; },
    get isPlaying() { return isPlaying; },
    set isPlaying(v: boolean) { isPlaying = v; },
    get playbackBeat() { return playbackBeat; },
    set playbackBeat(v: number) { playbackBeat = v; },
    get showPicker() { return showPicker; },
    set showPicker(v: boolean) { showPicker = v; },
    get sequence() { return sequence; },
    set sequence(v: SequenceData | null) { sequence = v; },
    get steps() { return steps; },
    get leftProp() { return leftProp; },
    set leftProp(v: PropState) { leftProp = v; },
    get rightProp() { return rightProp; },
    set rightProp(v: PropState) { rightProp = v; },
    get currentStep() { return currentStep; },
    set currentStep(v: number) { currentStep = v; },
    get currentLetter() { return currentLetter; },
    set currentLetter(v: Letter | null) { currentLetter = v; },
    get currentStepData() { return currentStepData; },
    set currentStepData(v: StepData | null) { currentStepData = v; },
    get saving() { return saving; },
    set saving(v: boolean) { saving = v; },
    get saveStatus() { return saveStatus; },
    set saveStatus(v: "idle" | "saved" | "error") { saveStatus = v; },
    get showPresetMenu() { return showPresetMenu; },
    set showPresetMenu(v: boolean) { showPresetMenu = v; },
    get bpm() { return bpm; },
    set bpm(v: number) { bpm = v; },
    get rafId() { return rafId; },
    set rafId(v: number | null) { rafId = v; },
    get lastTime() { return lastTime; },
    set lastTime(v: number | null) { lastTime = v; },
    get gridMode() { return gridMode; },
    get sequenceWord() { return sequenceWord; },
    get totalSteps() { return totalSteps; },
    get currentStepForTimeline() { return currentStepForTimeline; },
    get hasUnsavedChanges() { return hasUnsavedChanges; },
    DEFAULT_PROP_STATE,
    loadSequence,
    togglePlayback,
    setBpm,
    updateTimeline,
    selectPhrase,
    toggleTransition,
    restart,
    deleteSelected,
    clearTimeline,
    applyPreset4x4,
    tryRestoreTimeline,
    getPersistedSequenceId,
  };
}
