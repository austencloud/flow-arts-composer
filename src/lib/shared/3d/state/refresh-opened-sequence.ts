import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export function sequence3DContentSignature(sequence: SequenceData): string {
  return JSON.stringify({
    id: sequence.id,
    word: sequence.word,
    gridMode: sequence.gridMode,
    conjoined: sequence.conjoined,
    startPlacement: sequence.startPlacement,
    startingPlacement: sequence.startingPlacement,
    steps: sequence.steps,
  });
}

export interface SequenceRefreshPerformer {
  readonly loadedSequence: SequenceData | null;
  readonly currentStepIndex: number;
  readonly progress: number;
  readonly isPlaying: boolean;
  loadSequence(sequence: SequenceData): void;
  goToStep(step: number): void;
  setProgress(progress: number): void;
  play(): void;
}

export function isOpenedSequence(
  candidate: SequenceData | null,
  opened: SequenceData
): boolean {
  return (
    candidate !== null &&
    sequence3DContentSignature(candidate) === sequence3DContentSignature(opened)
  );
}

export function refreshOpenedPerformers(
  performers: readonly SequenceRefreshPerformer[],
  previous: SequenceData,
  next: SequenceData
): void {
  for (const performer of performers) {
    if (!isOpenedSequence(performer.loadedSequence, previous)) continue;
    const step = performer.currentStepIndex;
    const progress = performer.progress;
    const wasPlaying = performer.isPlaying;
    performer.loadSequence(next);
    performer.goToStep(step);
    performer.setProgress(progress);
    if (wasPlaying) performer.play();
  }
}
