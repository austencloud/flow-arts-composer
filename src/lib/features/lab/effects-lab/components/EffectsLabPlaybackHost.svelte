<!--
  EffectsLabPlaybackHost.svelte

  Single persistent component that owns all shared playback infrastructure
  for the Effects Lab. Canvas, playback services, and sequence state live here.
  The unified EffectsPanel handles effect selection and customization.
  The animation engine reads effect state directly from the visibility manager.
-->
<script lang="ts">

import { getGenerationOrchestrator } from "$lib/features/create/generate/shared/get-generation-orchestrator";
import { sequenceTransformer } from "$lib/shared/create/services/sequence-transformer";
  import { onMount, onDestroy, untrack } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import SequencePickerModal from "$lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
  import type { SequenceRepository } from "$lib/shared/create/services/sequence-repository";
  import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { getSequenceRepository } from "$lib/shared/create/get-sequence-repository";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";

  import { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
  import { getViewerAnimationPropConfig } from "$lib/shared/animation-engine/get-viewer-animation-prop-config";
  import { AnimationStateManager } from "$lib/shared/animation-engine/services/animation-state-manager";
  import { AnimationLoop } from "$lib/shared/animation-engine/services/animation-loop";

  // Auto-chaining
  import { EndlessSpinnerOrchestrator } from "$lib/features/landing/services/endless-spinner-orchestrator";
  import { InfiniteSequenceGenerator } from "$lib/features/landing/services/infinite-sequence-generator";
  import { SpinnerMetricsRepository } from "$lib/features/landing/services/spinner-metrics-repository";
  import { orientationCycleExtender } from "$lib/features/create/generate/circular/services/orientation-cycle-extender";
  import { startPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
  import { createEndlessPlayback, type EndlessPlaybackState } from "$lib/shared/animation-engine/state/endless-playback-state.svelte";
  import type { SourceMode } from "$lib/shared/animation-engine/domain/chaining-types";

  import { getEffectDescriptor } from "../domain/effect-descriptor";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { foldTrailIntentIntoSettings } from "$lib/shared/effects/translators/canvas2d-translator";

  import EffectsPanel from "$lib/shared/animation-engine/components/effects-panel/EffectsPanel.svelte";
  import SourceControls from "$lib/shared/animation-engine/components/SourceControls.svelte";
  import SequenceHistoryPanel from "./SequenceHistoryPanel.svelte";
  import { getClaudeCodeCopier } from "$lib/shared/browse/get-claude-code-copier";
  import { saveSequence as persistSaveSequence } from "$lib/shared/persistence/services/dexie-persistence-service";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { openSequenceViewer } from "$lib/shared/sequence-viewer/services/sequence-viewer-navigator";

  const DEFAULT_BPM = 60;
  const STORAGE_KEY = "effects-lab-state";
  const visibilityManager = getAnimationVisibilityManager();

  // Shared effects config state - single source of truth for per-effect intents
  // (zap, sparkles, echo, bloom today). The Customize panels write here via
  // getEffectsConfigContext(); the AnimatorCanvas reads the same state each
  // frame so slider changes flow straight to the canvas.
  const effectsConfigState = createEffectsConfigState();
  setEffectsConfigContext(effectsConfigState);
  // The trail look (width, brightness, colours) lives on the effects config,
  // which the trail renderer never reads, so fold it into the trail settings.
  const trailSettings = $derived(
    foldTrailIntentIntoSettings(animationSettings.trail, effectsConfigState.trails)
  );

  // ─── Persisted state (playback only - effect params managed by VM) ────
  interface EffectsLabPersistedState {
    sequenceId: string | null;
    bpm: number;
    sourceMode: SourceMode;
  }

  function loadPersistedState(): Partial<EffectsLabPersistedState> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
  }

  function savePersistedState() {
    try {
      const state: EffectsLabPersistedState = {
        sequenceId: sequence?.word || sequence?.name || sequence?.id || null,
        bpm,
        sourceMode,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }

  const persisted = loadPersistedState();

  let sequenceService: SequenceRepository | null = null;
  let playbackController: AnimationPlaybackController | null = null;
  let playback = $state<EndlessPlaybackState | null>(null);
  let servicesReady = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let playbackStartTimer: ReturnType<typeof setTimeout> | null = null;
  let showPicker = $state(false);
  let sequence = $state<SequenceData | null>(null);
  let isPlaying = $state(false);
  let bpm = $state(persisted.bpm ?? DEFAULT_BPM);
  let sourceMode = $state<SourceMode>(persisted.sourceMode ?? "infinite");

  // ─── Derive active mode from visibility manager for canvas/UI hints ────
  // The EffectsPanel writes to the VM; we read from it to know which mode
  // is active for the canvas conditional props and accent color theming.
  let vmActiveMode = $state<
    "fire" | "charcoal" | "led" | "trails" | "zap" | "sparkles" | "ghost" | "bloom" | "goo" | "bubbles" | "petals" | "smoke" | "ink" | "frost" | "silk" | "animal" | "pulse" | "none"
  >("none");

  function syncActiveMode() {
    const active = effectsConfigState.activeEffect ?? "none";
    vmActiveMode = active === "none" ? "none" : active;
  }

  // Poll effectsConfigState to keep vmActiveMode in sync.
  $effect(() => {
    syncActiveMode();
    visibilityManager.registerObserver(syncActiveMode);
    return () => visibilityManager.unregisterObserver(syncActiveMode);
  });

  let descriptor = $derived(getEffectDescriptor(
    vmActiveMode === "none" ? "trails" : vmActiveMode
  ));

  // ─── Animation state (provided by the factory) ────────────────────────
  let animationState = $derived(playback?.animationState ?? null);

  // Save global effect states so we can restore them when leaving the Effects Lab.
  const savedEffectMap = { ...(effectsConfigState.tipEffectMap ?? {}) };

  // Playback state polling
  $effect(() => {
    const check = () => {
      const current = animationState?.isPlaying ?? false;
      if (current !== isPlaying) isPlaying = current;
    };
    check();
    const interval = setInterval(check, 50);
    return () => clearInterval(interval);
  });

  // Derived values from factory
  let currentLetter = $derived((playback?.currentLetter ?? null) as Letter | null);
  let currentStepData = $derived((playback?.currentStepData ?? null) as StepData | StartPlacementData | null);
  let gridMode = $derived((playback?.gridMode ?? null) as GridMode | null);

  $effect(() => {
    void bpm;
    void sequence;
    void sourceMode;
    untrack(() => savePersistedState());
  });

  // Auto-chaining is handled internally by the createEndlessPlayback factory.

  // Sync sequence from factory for local state (history, persistence, UI)
  $effect(() => {
    if (playback) {
      const seq = playback.currentSequence;
      if (seq && seq !== sequence) {
        sequence = seq;
        pushHistory(seq);
      }
    }
  });

  onMount(async () => {
    window.addEventListener("keydown", handleKeydown);
    try {
      sequenceService = getSequenceRepository();
      const stateManager = new AnimationStateManager();
      const loop = new AnimationLoop();
      const animOrchestrator = new SequenceAnimationOrchestrator(
        stateManager,
        getViewerAnimationPropConfig
      );
      playbackController = new AnimationPlaybackController(
        animOrchestrator, loop
      );

      const browseLoader = getBrowseLoader();
      const generationOrchestrator = getGenerationOrchestrator();

      const spinnerOrch = new EndlessSpinnerOrchestrator(
        browseLoader,
        generationOrchestrator,
        sequenceTransformer,
        startPlacementDeriver
      );

      const metricsRepo = new SpinnerMetricsRepository();
      const infiniteGen = new InfiniteSequenceGenerator(
        generationOrchestrator,
        metricsRepo,
        orientationCycleExtender
      );

      playback = createEndlessPlayback({
        modes: ["pick", "library", "infinite"],
        defaultMode: sourceMode,
        spinnerOrchestrator: spinnerOrch,
        infiniteGenerator: infiniteGen,
        playbackController,
      });

      await playback.initialize();
      servicesReady = true;

      if (sourceMode === "pick") {
        const savedId = persisted.sequenceId;
        if (savedId && sequenceService) {
          restoreSequence(savedId);
        }
      }
    } catch (err) {
      console.error("Effects Lab: failed to initialize:", err);
      error = "Failed to initialize animation services";
    }
  });

  async function restoreSequence(id: string) {
    if (!sequenceService || !playbackController) return;
    loading = true;
    error = null;
    try {
      const loaded = await sequenceService.getSequence(id);
      if (loaded) {
        sequence = loaded;
        await loadAnimation();
      }
    } catch (err) {
      console.error("Effects Lab: failed to restore sequence:", err);
      error = "Could not restore the previous session's sequence";
    } finally {
      loading = false;
    }
  }

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeydown);
    if (playbackStartTimer !== null) clearTimeout(playbackStartTimer);
    playback?.dispose();

    // Restore global effect states that were active before the Effects Lab took over
    effectsConfigState.setTipEffectMap(savedEffectMap);
  });

  async function handleSequenceSelected(seq: SequenceData) {
    showPicker = false;
    sequence = seq;
    pushHistory(seq);
    await loadAnimation();
  }

  async function loadAnimation() {
    if (!sequenceService || !playbackController || !sequence || !animationState) return;
    loading = true;
    error = null;

    try {
      const full = await loadSequenceData(sequence);
      if (!full) throw new Error("No motion data");

      animationState.setShouldLoop(true);
      const ok = playbackController.initialize(full, animationState);
      if (!ok) throw new Error("Playback init failed");

      if (playbackStartTimer !== null) clearTimeout(playbackStartTimer);
      playbackStartTimer = setTimeout(() => { playbackController?.togglePlayback(); playbackStartTimer = null; }, 300);
    } catch (err) {
      console.error("Effects Lab: load failed:", err);
      error = err instanceof Error ? err.message : "Load failed";
    } finally {
      loading = false;
    }
  }

  async function loadSequenceData(seq: SequenceData): Promise<SequenceData | null> {
    if (!sequenceService) return null;
    const hasMotion = (s: SequenceData) =>
      Array.isArray(s.steps) && s.steps.length > 0 &&
      s.steps.some((b) => b?.motions?.left && b?.motions?.right);
    if (hasMotion(seq)) return seq;
    const id = seq.word || seq.name || seq.id;
    if (id) {
      const loaded = await sequenceService.getSequence(id);
      if (loaded && hasMotion(loaded)) return loaded;
    }
    return seq;
  }

  function togglePlayback() {
    playbackController?.togglePlayback();
  }

  let wasPlayingBeforeScrub = false;
  function handleScrubStart() {
    wasPlayingBeforeScrub = isPlaying;
    if (wasPlayingBeforeScrub) playbackController?.togglePlayback();
  }
  function handleScrubEnd() {
    if (wasPlayingBeforeScrub) playbackController?.togglePlayback();
    wasPlayingBeforeScrub = false;
  }

  function handleBpmChange(newBpm: number) {
    bpm = newBpm;
    playbackController?.setSpeed(newBpm / DEFAULT_BPM);
  }

  function handleSourceChange(mode: SourceMode) {
    if (mode === sourceMode) return;
    sourceMode = mode;
    if (mode === "pick") return;
    playback?.setSourceMode(mode);
  }

  function handleSkip() {
    if (sourceMode === "pick") return;
    playback?.skip();
  }

  async function handleShuffle() {
    if (sourceMode === "pick") return;
    await playback?.shuffle();
  }

  const MAX_HISTORY = 30;
  const copier = getClaudeCodeCopier();

  interface HistoryEntry {
    word: string;
    stepCount: number;
    gridMode?: string;
    timestamp: number;
    sequenceData: SequenceData;
  }

  let sequenceHistory = $state<HistoryEntry[]>([]);

  function pushHistory(seq: SequenceData) {
    const entry: HistoryEntry = {
      word: seq.word ?? seq.name ?? "unknown",
      stepCount: seq.steps?.length ?? 0,
      gridMode: seq.gridMode,
      timestamp: Date.now(),
      sequenceData: seq,
    };
    sequenceHistory = [entry, ...sequenceHistory].slice(0, MAX_HISTORY);
  }

  async function getDebugData(): Promise<string> {
    const seqData = animationState?.sequenceData;
    if (!seqData) return "No sequence loaded";
    return copier.generatePrompt(seqData);
  }

  async function getHistoryDebugData(seq: SequenceData): Promise<string> {
    return copier.generatePrompt(seq);
  }

  async function saveCurrentSequence() {
    const seqData = animationState?.sequenceData;
    if (!seqData) {
      toast.error("No sequence to save");
      return;
    }
    try {
      const plain: SequenceData = JSON.parse(JSON.stringify(seqData));
      await persistSaveSequence(plain);
      toast.success(`Saved "${plain.word ?? plain.name ?? "sequence"}"`);
    } catch (err) {
      console.error("Failed to save sequence:", err);
      toast.error("Save failed");
    }
  }

  async function saveHistoryEntry(entry: { sequenceData: unknown }) {
    try {
      const plain: SequenceData = JSON.parse(JSON.stringify(entry.sequenceData));
      await persistSaveSequence(plain);
      toast.success(`Saved "${plain.word ?? plain.name ?? "sequence"}"`);
    } catch (err) {
      console.error("Failed to save sequence:", err);
      toast.error("Save failed");
    }
  }

  function viewHistoryEntry(entry: { sequenceData: unknown }) {
    const seq = JSON.parse(JSON.stringify(entry.sequenceData)) as SequenceData;
    openSequenceViewer(seq, {
      source: "effects_lab",
      returnPath: "/effects-lab",
      returnLabel: "Effects Lab",
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      togglePlayback();
    }

    if (e.code === "KeyD" && !e.repeat) {
      e.preventDefault();
      getDebugData().then((data) => navigator.clipboard.writeText(data)).catch(() => {});
    }
  }
</script>

<div class="playback-host">
  <div class="content">
    <!-- Canvas Area -->
    <div class="canvas-area">
      {#if !sequence && sourceMode === "pick"}
        <div class="empty-state">
          <i class="{descriptor.icon}" style="color: {descriptor.accentColorBorder}" aria-hidden="true"></i>
          <p>Load a sequence to start</p>
          <button
            class="pick-btn"
            style="--accent: {descriptor.accentColor}; --accent-dim: {descriptor.accentColorMid}; --accent-border: {descriptor.accentColorBorder}"
            onclick={() => (showPicker = true)}
            aria-label="Pick a sequence to load"
          >
            <i class="fas fa-folder-open" aria-hidden="true"></i>
            Pick Sequence
          </button>
        </div>
      {:else if !sequence}
        <div class="loading-state">
          <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
          <span>Generating...</span>
        </div>
      {:else if loading}
        <div class="loading-state">
          <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
          <span>Loading playback...</span>
        </div>
      {:else if error}
        <div class="error-state">
          <span>{error}</span>
          <button
            class="pick-btn"
            style="--accent: {descriptor.accentColor}; --accent-dim: {descriptor.accentColorMid}; --accent-border: {descriptor.accentColorBorder}"
            onclick={() => loadAnimation()}
            aria-label="Retry loading the sequence"
          >
            Retry
          </button>
        </div>
      {:else}
        <div class="canvas-wrapper">
          <AnimatorCanvas
            leftProp={animationState?.leftPropState ?? null}
            rightProp={animationState?.rightPropState ?? null}
            gridVisible={true}
            {gridMode}
            letter={currentLetter}
            stepData={currentStepData}
            sequenceData={animationState?.sequenceData}
            currentStep={animationState?.currentStep ?? 0}
            {isPlaying}
            onPlaybackToggle={togglePlayback}
            onProgressBarSeek={(step) => playbackController?.seekToStep(step)}
            onProgressBarScrubStart={handleScrubStart}
            onProgressBarScrubEnd={handleScrubEnd}
            word={sequence?.word || sequence?.name || null}
            backgroundAlpha={0}
            focused={true}
            {trailSettings}
            {effectsConfigState}
          />
        </div>
      {/if}
    </div>

    <!-- Controls Panel -->
    <div class="controls-panel themed-scrollbar">
      <SourceControls
        {sourceMode}
        {sequence}
        isChainingNow={playback?.isChainingNow ?? false}
        onSourceChange={handleSourceChange}
        onPick={() => (showPicker = true)}
        onSkip={handleSkip}
        onShuffle={handleShuffle}
        {getDebugData}
        onSave={saveCurrentSequence}
      />

      <SequenceHistoryPanel
        entries={sequenceHistory}
        getEntryData={(entry) => getHistoryDebugData(entry.sequenceData as SequenceData)}
        onSave={saveHistoryEntry}
        onView={viewHistoryEntry}
      />

      <EffectsPanel
        {bpm}
        onBpmChange={handleBpmChange}
        {isPlaying}
        onPlaybackToggle={togglePlayback}
        showTransport={false}
      />
    </div>
  </div>
</div>

<!-- Sequence Picker Modal -->
<SequencePickerModal
  open={showPicker}
  onSelect={handleSequenceSelected}
  onClose={() => (showPicker = false)}
  title="Select Sequence for Effects Lab"
/>

<style>
  .playback-host {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .content {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr clamp(360px, 32vw, 520px);
    gap: var(--spacing-md, 16px);
    padding: var(--spacing-md, 16px);
    min-height: 0;
    overflow: hidden;
  }

  .canvas-area {
    position: relative;
    background: var(--theme-surface-dark, #0a0a0f);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-lg, 12px);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-height: 0;
  }

  .canvas-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-state,
  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md, 16px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .empty-state i {
    font-size: 3rem;
  }

  .empty-state p,
  .loading-state span,
  .error-state span {
    font-size: var(--font-size-min, 14px);
    margin: 0;
  }

  .pick-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs, 4px);
    min-height: var(--min-touch-target);
    padding: 10px 20px;
    border: 1.5px solid var(--accent-border, rgba(255, 255, 255, 0.3));
    border-radius: var(--border-radius-md, 8px);
    background: var(--accent-dim, rgba(255, 255, 255, 0.08));
    color: var(--accent, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .pick-btn:hover {
    opacity: 0.85;
  }

  .pick-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .controls-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 16px);
    overflow-y: auto;
    min-height: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .pick-btn {
      transition: none;
    }
  }

  @media (max-width: 900px) {
    .content {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }

    .canvas-area {
      min-height: 300px;
    }
  }

</style>
