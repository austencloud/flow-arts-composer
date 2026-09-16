/**
 * Sequence Chaining Orchestrator Implementation
 *
 * Extracted from FireTuningTab.svelte. Manages the auto-chaining
 * subsystem: preloading next sequences, detecting sequence completion,
 * and hot-swapping sequences into the playback controller.
 */

import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
import type { AnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import type { EndState } from "$lib/shared/landing/domain/types";
import type {
  IEndlessSpinnerOrchestrator,
  IInfiniteSequenceGenerator,
  PlaybackHistoryEntry,
  SourceMode,
} from "$lib/shared/animation-engine/domain/chaining-types";
// re-export for existing consumers
export type { SourceMode };

import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import * as propTypeApplierModule from "$lib/shared/landing/services/prop-type-applier";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import type { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

interface SequenceChainingOptions {
  historyCapacity?: number;
}

export class SequenceChainingOrchestrator {
  private playbackController: AnimationPlaybackController | null = null;
  private animationState: AnimationPanelState | null = null;
  private readonly propTypeApplier = propTypeApplierModule;

  private _isChainingNow = false;
  private _isPreloading = false;
  private _chainingEnabled = true;
  private preloadedSequence: SequenceData | null = null;
  private lastStep = -1;
  private currentSequence: SequenceData | null = null;

  private swapCallback: ((seq: SequenceData) => void) | null = null;
  private errorCallback: ((message: string) => void) | null = null;

  private _propType: PropType = PropType.STAFF;

  private _history: PlaybackHistoryEntry[] = [];
  private _historyCapacity: number;

  // --- Source selection ---
  private _sourceMode: SourceMode = "library";
  private sourceRevision = 0;

  constructor(
    private readonly spinnerOrchestrator: IEndlessSpinnerOrchestrator,
    private readonly infiniteGenerator: IInfiniteSequenceGenerator,
    options?: SequenceChainingOptions
  ) {
    this._historyCapacity = options?.historyCapacity ?? 30;
  }

  get isChainingNow(): boolean {
    return this._isChainingNow;
  }

  get isPreloading(): boolean {
    return this._isPreloading;
  }

  get propType(): PropType {
    return this._propType;
  }

  setPropType(type: PropType): void {
    this._propType = type;
  }

  setChainingEnabled(enabled: boolean): void {
    this._chainingEnabled = enabled;
    if (!enabled) {
      this.preloadedSequence = null;
    }
  }

  get historyCapacity(): number {
    return this._historyCapacity;
  }

  getHistory(): readonly PlaybackHistoryEntry[] {
    return this._history;
  }

  async initialize(
    playbackController: AnimationPlaybackController,
    animationState: AnimationPanelState
  ): Promise<void> {
    this.playbackController = playbackController;
    this.animationState = animationState;
    await this.spinnerOrchestrator.initialize();
  }

  async startAutoMode(mode: SourceMode): Promise<void> {
    const revision = ++this.sourceRevision;
    this._sourceMode = mode;
    this.preloadedSequence = null;
    this.lastStep = -1;
    this._isChainingNow = false;
    this._isPreloading = false;

    if (mode === "library") {
      const initial = await this.spinnerOrchestrator.getInitialSequence();
      if (revision !== this.sourceRevision || mode !== this._sourceMode) return;
      if (initial) {
        this.doHotSwap(initial);
        this.preloadNext(mode);
      }
    } else if (mode === "infinite") {
      const generated = await this.infiniteGenerator.generateInitial();
      if (revision !== this.sourceRevision || mode !== this._sourceMode) return;
      if (generated) {
        this.doHotSwap(generated.sequence);
        this.preloadNext(mode);
      }
    }
  }

  skip(): void {
    if (this._sourceMode === "pick") return;
    this.chainToNext();
  }

  async shuffle(): Promise<void> {
    if (!this.playbackController) return;
    this._isChainingNow = true;
    try {
      const generated = await this.infiniteGenerator.generateInitial();
      if (generated) this.doHotSwap(generated.sequence);
    } catch (err) {
      console.error("SequenceChainingOrchestrator: shuffle failed:", err);
      this.notifyError("Shuffle failed - could not generate a new sequence");
    } finally {
      this._isChainingNow = false;
    }
  }

  hotSwapSequence(sequenceData: SequenceData): void {
    this.doHotSwap(sequenceData);
  }

  checkAndChain(
    currentStep: number,
    totalSteps: number,
    sourceMode: SourceMode,
    servicesReady: boolean,
    hasSequence: boolean
  ): void {
    if (!this._chainingEnabled || sourceMode === "pick") {
      return;
    }

    const floored = Math.floor(currentStep);

    if (
      servicesReady &&
      !this._isChainingNow &&
      hasSequence &&
      this.lastStep >= totalSteps - 1 &&
      floored <= 1 &&
      totalSteps > 0
    ) {
      this.chainToNext();
    }

    this.lastStep = floored;
  }

  checkAndPreload(
    currentStep: number,
    totalSteps: number,
    sourceMode: SourceMode,
    servicesReady: boolean,
    hasSequence: boolean
  ): void {
    if (!this._chainingEnabled || sourceMode === "pick") {
      return;
    }

    const floored = Math.floor(currentStep);
    const shouldPreload =
      servicesReady &&
      !this._isPreloading &&
      !this.preloadedSequence &&
      hasSequence &&
      totalSteps > 2 &&
      floored >= 2 &&
      floored < totalSteps - 1;

    if (shouldPreload) this.preloadNext(sourceMode);
  }

  onSequenceSwapped(callback: (seq: SequenceData) => void): void {
    this.swapCallback = callback;
  }

  onError(callback: (message: string) => void): void {
    this.errorCallback = callback;
  }

  dispose(): void {
    this.sourceRevision++;
    this.playbackController = null;
    this.animationState = null;
    this.preloadedSequence = null;
    this.swapCallback = null;
    this.errorCallback = null;
    this._history = [];
  }


  /** Surface a failure to the user: consumer callback when wired, toast otherwise. */
  private notifyError(message: string): void {
    if (this.errorCallback) {
      this.errorCallback(message);
    } else {
      toast.error(message);
    }
  }

  private doHotSwap(sequenceData: SequenceData): boolean {
    if (!this.playbackController || !this.animationState) return false;

    const applied = this.propTypeApplier.applyToSequence(
      sequenceData,
      this._propType
    );

    this.animationState.setShouldLoop(true);
    const ok = this.playbackController.initialize(applied, this.animationState);
    if (!ok) {
      this.notifyError("The sequence could not be played");
      return false;
    }

    this._history = [
      {
        sequence: sequenceData,
        timestamp: Date.now(),
        sourceMode: this._sourceMode,
        word: sequenceData.word ?? sequenceData.name,
      },
      ...this._history,
    ].slice(0, this._historyCapacity);

    this.currentSequence = sequenceData;
    this.lastStep = -1;

    this.animationState.setPlaybackMode("continuous");
    this.playbackController.seekToStep(1);

    if (!this.animationState.isPlaying) {
      this.playbackController.togglePlayback();
    }

    this.swapCallback?.(sequenceData);
    return true;
  }

  private extractEndState(): EndState {
    if (!this.currentSequence) {
      return { placement: null, leftOrientation: null, rightOrientation: null };
    }

    const seq = this.currentSequence;
    const finalStep = seq.steps?.[seq.steps.length - 1];
    let placement = finalStep?.endPlacement ?? null;

    // Fallback 1: derive from motion end locations
    if (!placement && finalStep?.motions) {
      const leftMotion = finalStep.motions[HandSide.LEFT];
      const rightMotion = finalStep.motions[HandSide.RIGHT];
      if (leftMotion?.endLocation && rightMotion?.endLocation) {
        try {
          placement = getGridPlacementFromLocations(
            leftMotion.endLocation,
            rightMotion.endLocation
          );
        } catch {
          /* silently fail */
        }
      }
    }

    // Fallback 2: for circular sequences, end placement = start placement
    if (!placement && seq.isCircular) {
      const startPos = seq.startPlacement ?? seq.startingPlacement;
      if (startPos) {
        placement = startPos.gridPlacement ?? startPos.startPlacement ?? null;
      }
    }

    return {
      placement,
      // Invisible placeholder = hand not really there (both-required Step
      // shape): null orientation disables orientation matching downstream.
      leftOrientation: (isVisibleMotion(finalStep?.motions?.left)
        ? finalStep.motions.left.endOrientation
        : null) as Orientation | null,
      rightOrientation: (isVisibleMotion(finalStep?.motions?.right)
        ? finalStep.motions.right.endOrientation
        : null) as Orientation | null,
    };
  }

  private chainToNext(): void {
    if (!this.playbackController || this._isChainingNow) return;

    // Synchronous swap from preloaded sequence
    if (this.preloadedSequence) {
      this._isChainingNow = true;
      this.doHotSwap(this.preloadedSequence);
      this.preloadedSequence = null;
      this._isChainingNow = false;
      this.preloadNext(this._sourceMode);
      return;
    }

    // Fallback: async generation if preload wasn't ready
    this._isChainingNow = true;
    this.chainAsync();
  }

  private async chainAsync(): Promise<void> {
    const revision = this.sourceRevision;
    const mode = this._sourceMode;
    try {
      const endState = this.extractEndState();
      if (mode === "infinite") {
        const generated =
          await this.infiniteGenerator.generateFromEndState(endState);
        if (
          generated &&
          this._chainingEnabled &&
          revision === this.sourceRevision &&
          mode === this._sourceMode
        ) {
          this.doHotSwap(generated.sequence);
        }
      } else if (mode === "library") {
        const nextSeq =
          await this.spinnerOrchestrator.getNextSequence(endState);
        if (
          nextSeq &&
          this._chainingEnabled &&
          revision === this.sourceRevision &&
          mode === this._sourceMode
        ) {
          this.doHotSwap(nextSeq);
        }
      }
    } catch (err) {
      if (revision === this.sourceRevision) {
        console.error("SequenceChainingOrchestrator: chain failed:", err);
        this.notifyError("Failed to load the next sequence");
      }
    } finally {
      if (revision === this.sourceRevision) {
        this._isChainingNow = false;
        this.preloadNext(this._sourceMode);
      }
    }
  }

  private async preloadNext(mode: SourceMode): Promise<void> {
    if (
      !this._chainingEnabled ||
      !this.currentSequence ||
      this._isPreloading ||
      this.preloadedSequence
    ) {
      return;
    }
    const revision = this.sourceRevision;
    this._isPreloading = true;
    try {
      const endState = this.extractEndState();
      let nextSequence: SequenceData | null = null;

      if (mode === "infinite") {
        const generated =
          await this.infiniteGenerator.generateFromEndState(endState);
        nextSequence = generated?.sequence ?? null;
      } else if (mode === "library") {
        const nextSeq =
          await this.spinnerOrchestrator.getNextSequence(endState);
        nextSequence =
          nextSeq ?? (await this.spinnerOrchestrator.getInitialSequence());
      }

      if (
        this._chainingEnabled &&
        revision === this.sourceRevision &&
        mode === this._sourceMode
      ) {
        this.preloadedSequence = nextSequence;
      }
    } catch (err) {
      if (revision === this.sourceRevision && mode === this._sourceMode) {
        console.error("SequenceChainingOrchestrator: preload failed:", err);
        // Preload is a background optimization (chaining falls back to async
        // generation), so warn rather than error.
        toast.warning("Couldn't preload the next sequence");
      }
    } finally {
      if (revision === this.sourceRevision) {
        this._isPreloading = false;
      }
    }
  }
}
