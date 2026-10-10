<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * ClipInspector - Container for clip property editor panel
   *
   * Orchestrates the various section components for editing clip properties.
   * Decomposed from 772 lines to ~120 lines.
   */

  import { getTimelineState } from "#lib/shared/animation-engine/state/timeline-state.svelte.js";
  import type { TimelineClip } from "#lib/shared/animation-engine/domain/timeline-types.js";
  import ClipInfoSection from "./inspector/ClipInfoSection.svelte";
  import ClipSpeedSection from "./inspector/ClipSpeedSection.svelte";
  import ClipTrimSection from "./inspector/ClipTrimSection.svelte";
  import ClipLoopSection from "./inspector/ClipLoopSection.svelte";
  import ClipAppearanceSection from "./inspector/ClipAppearanceSection.svelte";
  import ClipActionsSection from "./inspector/ClipActionsSection.svelte";

  function getState() {
    return getTimelineState();
  }

  // Local reactive state (synced via effects)
  let clip = $state<TimelineClip | null>(null);
  let isClipInspectorOpen = $state(false);
  let effectiveDuration = $state(0);

  // Sync local state from timeline state
  $effect(() => {
    const state = getState();
    isClipInspectorOpen = state.isClipInspectorOpen;
    clip = state.clipBeingEdited
      ? (state.allClips.find((c) => c.id === state.clipBeingEdited) ?? null)
      : null;
  });

  // Calculate effective duration based on trim and speed
  $effect(() => {
    if (!clip) {
      effectiveDuration = 0;
      return;
    }
    const trimmedFraction = clip.outPoint - clip.inPoint;
    effectiveDuration = (clip.duration * trimmedFraction) / clip.playbackRate;
  });

  // Handler functions that delegate to state
  function updateLabel(label: string) {
    if (!clip) return;
    getState().updateClip(clip.id, { label: label || undefined });
  }

  function updateSpeed(value: number) {
    if (!clip) return;
    getState().setClipPlaybackRate(clip.id, value);
  }

  function updateInPoint(percent: number) {
    if (!clip) return;
    const outPercent = Math.round(clip.outPoint * 100);
    const value = Math.max(0, Math.min(percent, outPercent - 1)) / 100;
    getState().setClipInOutPoints(clip.id, value, clip.outPoint);
  }

  function updateOutPoint(percent: number) {
    if (!clip) return;
    const inPercent = Math.round(clip.inPoint * 100);
    const value = Math.max(inPercent + 1, Math.min(100, percent)) / 100;
    getState().setClipInOutPoints(clip.id, clip.inPoint, value);
  }

  function resetTrim() {
    if (!clip) return;
    getState().setClipInOutPoints(clip.id, 0, 1);
  }

  function updateLoop(enabled: boolean) {
    if (!clip) return;
    getState().setClipLoop(clip.id, enabled, clip.loopCount);
  }

  function updateLoopCount(count: number) {
    if (!clip) return;
    getState().setClipLoop(clip.id, clip.loop, count);
  }

  function updateColor(color: string) {
    if (!clip) return;
    getState().updateClip(clip.id, { color });
  }

  function updateRotation(degrees: number) {
    if (!clip) return;
    getState().updateClip(clip.id, { rotation: degrees });
  }

  function updateOpacity(value: number) {
    if (!clip) return;
    getState().updateClip(clip.id, {
      opacity: Math.max(0, Math.min(1, value)),
    });
  }

  function toggleLock() {
    if (!clip) return;
    getState().updateClip(clip.id, { locked: !clip.locked });
  }

  function toggleMute() {
    if (!clip) return;
    getState().updateClip(clip.id, { muted: !clip.muted });
  }

  function duplicateClip() {
    if (!clip) return;
    getState().duplicateClip(clip.id);
  }

  function deleteClip() {
    if (!clip) return;
    getState().removeClip(clip.id);
    getState().closeClipInspector();
  }
</script>

{#if isClipInspectorOpen && clip}
  <div class="clip-inspector">
    <div class="inspector-header">
      <div class="header-title">
        <i class="fa-solid fa-sliders" aria-hidden="true"></i>
        <span>{t("compose_ui_clip_inspector")}</span>
      </div>
      <button
        class="close-btn"
        onclick={() => getState().closeClipInspector()}
        title={t("compose_ui_close_inspector")}
        aria-label={t("compose_ui_close_inspector")}
      >
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    </div>

    <div class="inspector-content">
      <ClipInfoSection {clip} {effectiveDuration} onUpdateLabel={updateLabel} />

      <ClipSpeedSection
        playbackRate={clip.playbackRate}
        onUpdateSpeed={updateSpeed}
      />

      <ClipTrimSection
        inPoint={clip.inPoint}
        outPoint={clip.outPoint}
        stepCount={clip.sequence.steps.length}
        onUpdateInPoint={updateInPoint}
        onUpdateOutPoint={updateOutPoint}
        onResetTrim={resetTrim}
      />

      <ClipLoopSection
        loop={clip.loop}
        loopCount={clip.loopCount}
        onUpdateLoop={updateLoop}
        onUpdateLoopCount={updateLoopCount}
      />

      <ClipAppearanceSection
        color={clip.color}
        rotation={clip.rotation}
        opacity={clip.opacity}
        onUpdateColor={updateColor}
        onUpdateRotation={updateRotation}
        onUpdateOpacity={updateOpacity}
      />

      <ClipActionsSection
        locked={clip.locked}
        muted={clip.muted}
        onToggleLock={toggleLock}
        onToggleMute={toggleMute}
        onDuplicate={duplicateClip}
        onDelete={deleteClip}
      />
    </div>
  </div>
{/if}

<style>
  .clip-inspector {
    position: absolute;
    top: 0;
    right: 0;
    width: 300px;
    height: 100%;
    background: var(--theme-panel-bg);
    border-left: 1px solid var(--theme-stroke-strong);
    display: flex;
    flex-direction: column;
    z-index: 50;
  }

  .inspector-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    background: var(--theme-panel-elevated-bg);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-min);
    font-weight: 600;
    color: var(--theme-text);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .header-title i {
    font-size: var(--font-size-sm);
    color: var(--theme-accent);
    opacity: 0.8;
  }

  .close-btn {
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    font-size: var(--font-size-sm);
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke, var(--theme-stroke));
    color: var(--theme-text);
    transform: scale(1.05);
  }

  .close-btn:active {
    transform: scale(0.95);
  }

  .inspector-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }

  /* Custom scrollbar styling */
  .inspector-content::-webkit-scrollbar {
    width: 8px;
  }

  .inspector-content::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }

  .inspector-content::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
  }

  .inspector-content::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }
</style>
