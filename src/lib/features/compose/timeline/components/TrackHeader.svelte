<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * TrackHeader - Track name and controls (mute, solo, lock)
   *
   * Displayed to the left of each track lane.
   * Controls are hidden behind a three-dots menu for cleaner UI.
   */

  import type { TimelineTrack } from "#lib/shared/animation-engine/domain/timeline-types.js";
  import { getTimelineState } from "#lib/shared/animation-engine/state/timeline-state.svelte.js";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import {
    shouldConfirm,
    stopAsking,
  } from "#lib/shared/settings/confirmations.js";

  interface Props {
    track: TimelineTrack;
  }

  let { track }: Props = $props();

  function getState() {
    return getTimelineState();
  }

  // Local reactive state
  let hasSoloedTrack = $state(false);
  let isDimmed = $state(false);
  let trackCount = $state(1);

  // Track is empty if no clips
  const isEmpty = $derived(track.clips.length === 0);

  // Use track.height directly (respects vertical zoom)
  const effectiveHeight = $derived(track.height);

  // Sync local state from timeline state
  $effect(() => {
    const state = getState();
    hasSoloedTrack = state.project.tracks.some((t) => t.solo);
    isDimmed = hasSoloedTrack && !track.solo;
    trackCount = state.project.tracks.length;
  });

  // Controls menu visibility
  let showControls = $state(false);
  let menuRef: HTMLDivElement;

  // Delete confirmation
  let showDeleteConfirm = $state(false);

  function toggleControls(e: MouseEvent) {
    e.stopPropagation();
    showControls = !showControls;
  }

  function handlePointerDownOutside(e: PointerEvent) {
    if (showControls && menuRef && !menuRef.contains(e.target as Node)) {
      showControls = false;
    }
  }

  // Editable name - initialized empty, startEdit() sets from track.name
  let isEditing = $state(false);
  let editValue = $state("");
  let inputElement = $state<HTMLInputElement | null>(null);

  // Focus input when entering edit mode (proper alternative to autofocus)
  $effect(() => {
    if (isEditing && inputElement) {
      inputElement.focus();
      inputElement.select();
    }
  });

  function startEdit() {
    editValue = track.name;
    isEditing = true;
  }

  function confirmEdit() {
    if (editValue.trim()) {
      getState().updateTrack(track.id, { name: editValue.trim() });
    }
    isEditing = false;
  }

  function cancelEdit() {
    isEditing = false;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      confirmEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }
</script>

<svelte:window onpointerdown={handlePointerDownOutside} />

<div
  class="track-header"
  class:dimmed={isDimmed}
  class:empty={isEmpty}
  style="height: {effectiveHeight}px; --track-color: {track.color}"
>
  <!-- Color indicator -->
  <div class="color-indicator"></div>

  <!-- Track name -->
  <div
    class="track-name"
    ondblclick={startEdit}
    onkeydown={(e) => e.key === "Enter" && startEdit()}
    role="button"
    tabindex="0"
    aria-label="Double-click to rename track"
  >
    {#if isEditing}
      <input
        type="text"
        class="name-input"
        bind:this={inputElement}
        bind:value={editValue}
        onblur={confirmEdit}
        onkeydown={handleKeyDown}
      />
    {:else}
      <span class="name-text">{track.name}</span>
    {/if}
  </div>

  <!-- Status indicators (always visible when active) -->
  <div class="status-indicators">
    {#if track.muted}
      <span class="status-badge muted" title="Muted">M</span>
    {/if}
    {#if track.solo}
      <span class="status-badge solo" title="Solo">S</span>
    {/if}
    {#if track.locked}
      <span class="status-badge locked" title="Locked"
        ><i class="fa-solid fa-lock" aria-hidden="true"></i></span
      >
    {/if}
  </div>

  <!-- Controls menu -->
  <div class="controls-menu" bind:this={menuRef}>
    <!-- Three-dots toggle button -->
    <button
      class="menu-toggle"
      class:active={showControls}
      onclick={toggleControls}
      title="Track options"
      aria-label="Toggle track options"
    >
      <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
    </button>

    <!-- Expandable controls panel -->
    {#if showControls}
      <div class="controls-panel">
        <!-- Mute -->
        <button
          class="track-btn"
          class:active={track.muted}
          onclick={() => getState().setTrackMuted(track.id, !track.muted)}
          title="Mute track (M)"
          aria-label={track.muted ? "Unmute track" : "Mute track"}
        >
          M
        </button>

        <!-- Solo -->
        <button
          class="track-btn solo"
          class:active={track.solo}
          onclick={() => getState().setTrackSolo(track.id, !track.solo)}
          title="Solo track (S)"
          aria-label={track.solo ? "Unsolo track" : "Solo track"}
        >
          S
        </button>

        <!-- Lock -->
        <button
          class="track-btn"
          class:active={track.locked}
          onclick={() =>
            getState().updateTrack(track.id, { locked: !track.locked })}
          title="Lock track"
          aria-label={track.locked ? "Unlock track" : "Lock track"}
        >
          <i class="fa-solid fa-lock" aria-hidden="true"></i>
        </button>

        <!-- Delete button -->
        {#if trackCount > 1}
          <button
            class="delete-btn"
            onclick={() => {
              showControls = false;
              // Deleting a track is undoable, so the person may turn this off.
              if (shouldConfirm("skipDeleteTrackConfirmation")) {
                showDeleteConfirm = true;
              } else {
                getState().removeTrack(track.id);
              }
            }}
            title={t("compose_ui_delete_track")}
            aria-label={t("compose_ui_delete_track")}
          >
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<ConfirmDialog
  bind:isOpen={showDeleteConfirm}
  title="Delete Track?"
  message={track.clips.length > 0
    ? `This will remove "${track.name}" and all ${track.clips.length} clip${track.clips.length === 1 ? "" : "s"} on it.`
    : `This will remove "${track.name}".`}
  confirmText="Delete"
  cancelText="Cancel"
  variant="danger"
  confirmDelay={track.clips.length > 0 ? 2 : 0}
  showDontAskAgain={true}
  onDontAskAgainChange={() => stopAsking("skipDeleteTrackConfirmation")}
  onConfirm={() => {
    getState().removeTrack(track.id);
    showDeleteConfirm = false;
  }}
  onCancel={() => (showDeleteConfirm = false)}
/>

<style>
  .track-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    background: var(--theme-panel-elevated-bg);
    border-bottom: 1px solid var(--theme-stroke);
    transition:
      height 0.2s ease,
      opacity 0.2s ease;
    position: relative;
  }

  .track-header.dimmed {
    opacity: 0.45;
  }

  .track-header.empty {
    opacity: 0.7;
  }

  .color-indicator {
    width: 4px;
    height: 60%;
    border-radius: 2px;
    background: var(--track-color, var(--theme-accent));
    flex-shrink: 0;
    box-shadow: 0 0 8px
      color-mix(
        in srgb,
        var(--track-color, var(--theme-accent)) 40%,
        transparent
      );
  }

  .track-name {
    flex: 1;
    min-width: 0;
    /* role="button" (double-click / Enter to rename) — signal it's actionable,
       not a text-selection target. */
    cursor: pointer;
  }

  .name-text {
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: var(--theme-text, var(--theme-text));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }

  .name-input {
    width: 100%;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-accent);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: var(--font-size-compact);
    color: var(--theme-text, white);
    outline: none;
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  /* Status indicators - always visible when state is active */
  .status-indicators {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .status-badge {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    font-size: var(--font-size-compact);
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .status-badge.muted {
    background: var(--theme-accent);
    color: white;
  }

  .status-badge.solo {
    background: var(--semantic-warning);
    color: #1a1a1a;
  }

  .status-badge.locked {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.2));
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact);
  }

  /* Controls menu container */
  .controls-menu {
    position: relative;
    flex-shrink: 0;
  }

  .menu-toggle {
    width: 36px;
    height: 36px;
    min-width: var(--min-touch-target, 48px);
    min-height: var(--min-touch-target, 48px);
    border-radius: 8px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg, var(--theme-card-bg));
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    font-size: var(--font-size-compact);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) ease;
  }

  .menu-toggle:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text, var(--theme-text));
  }

  .menu-toggle.active {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-color: var(--theme-accent);
    color: var(--theme-accent);
  }

  /* Controls panel - slides out */
  .controls-panel {
    position: absolute;
    top: 50%;
    right: 100%;
    transform: translateY(-50%);
    display: flex;
    gap: 2px;
    padding: 4px 6px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    margin-right: 4px;
    animation: slideIn var(--duration-fast) ease-out;
    z-index: 10;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-50%) translateX(8px);
    }
    to {
      opacity: 1;
      transform: translateY(-50%) translateX(0);
    }
  }

  .track-btn {
    width: 36px;
    height: 36px;
    min-width: var(--min-touch-target, 48px);
    min-height: var(--min-touch-target, 48px);
    border-radius: 8px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg, var(--theme-card-bg));
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    font-size: var(--font-size-compact);
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) ease;
    flex-shrink: 0;
  }

  .track-btn:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text, var(--theme-text));
    transform: scale(1.05);
  }

  .track-btn.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent-strong);
    color: white;
    box-shadow: 0 0 10px
      color-mix(in srgb, var(--theme-accent) 35%, transparent);
  }

  .track-btn.solo.active {
    background: var(--semantic-warning);
    border-color: var(--semantic-warning, #ffb800);
    color: #1a1a1a;
    box-shadow: 0 0 10px
      color-mix(in srgb, var(--semantic-warning) 35%, transparent);
  }

  .delete-btn {
    width: 36px;
    height: 36px;
    min-width: var(--min-touch-target, 48px);
    min-height: var(--min-touch-target, 48px);
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    font-size: var(--font-size-compact);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) ease;
    flex-shrink: 0;
    margin-left: 4px;
  }

  .delete-btn:hover {
    background: color-mix(in srgb, var(--semantic-error) 20%, transparent);
    border-color: var(--semantic-error);
    color: var(--semantic-error);
    box-shadow: 0 0 8px
      color-mix(in srgb, var(--semantic-error) 30%, transparent);
    transform: scale(1.05);
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .controls-panel {
      animation: none;
    }
  }
</style>
