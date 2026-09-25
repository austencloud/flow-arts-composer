<script lang="ts">
  import { CHARACTER_DEFINITIONS } from "$lib/shared/3d/domain/character-model";
  import type { CharacterInstanceState } from "../../state/character-instance-state.svelte";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "$lib/shared/sequence-viewer/domain/viewer-control-analytics";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

  interface Props {
    performer: CharacterInstanceState | null;
    performerCount: number;
    selectedCount: number;
    isAllMode: boolean;
    performerColor: string;
    sequenceWord: string | null;
    sequenceSteps: number | null;
    canRemove: boolean;
    onRemove: () => void;
    /** One-line hint for the current tab when no performer is selected. */
    emptyHint?: string | null;
    onSelectAll?: () => void;
    onSettingChange?: ViewerControlSink;
  }

  let {
    performer,
    performerCount,
    selectedCount,
    isAllMode,
    performerColor,
    sequenceWord,
    sequenceSteps,
    canRemove,
    onRemove,
    emptyHint = null,
    onSelectAll,
    onSettingChange,
  }: Props = $props();

  const isMultiMode = $derived(selectedCount > 1 && !isAllMode);
  const characterDefinition = $derived(
    CHARACTER_DEFINITIONS.find(
      (character) => character.id === performer?.characterId
    ) ?? CHARACTER_DEFINITIONS[0]
  );
  const performerName = $derived(
    performer?.displayName ?? characterDefinition?.name ?? "—"
  );
  const characterInitials = $derived(
    performerName !== "—" ? performerName.slice(0, 2).toUpperCase() : "?"
  );

  let isEditingName = $state(false);
  let nameDraft = $state("");
  let nameInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (isEditingName && nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  });

  function startEditName(): void {
    if (!performer) return;
    nameDraft = performerName === "—" ? "" : performerName;
    isEditingName = true;
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_performer",
      "name_editor_open",
      false,
      true
    );
  }

  function commitName(): void {
    if (!isEditingName) return;
    performer?.setDisplayName(nameDraft);
    isEditingName = false;
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_performer",
      "display_name_changed",
      false,
      true
    );
  }

  function cancelEditName(): void {
    isEditingName = false;
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_performer",
      "name_editor_open",
      true,
      false
    );
  }

  function handleNameKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commitName();
    } else if (event.key === "Escape") {
      event.preventDefault();
      // Escape here only cancels the rename; without this, the hub's
      // window-level dismiss would also collapse the whole detail panel.
      event.stopPropagation();
      cancelEditName();
    }
  }
</script>

<div class="header" style:--performer-color={performerColor}>
  {#if isAllMode || isMultiMode}
    <div class="identity">
      <div class="character-circle all-mode" aria-hidden="true">
        <i class="fas fa-users"></i>
      </div>
      <div class="identity-meta">
        <span class="performer-name">
          {isAllMode ? "All performers" : `${selectedCount} performers`}
        </span>
        <div class="sub-row">
          <span class="count-badge" style:background-color={performerColor}
            >{performerCount}</span
          >
          <span class="all-hint">
            {isAllMode
              ? `Changes apply to all ${performerCount}`
              : "Changes apply to the selected group"}
          </span>
        </div>
      </div>
    </div>
    {#if canRemove}
      <button
        class="remove-button"
        type="button"
        onclick={onRemove}
        aria-label={`Remove ${selectedCount} performers`}
        title={`Remove ${selectedCount} performers`}
      >
        <i class="fas fa-trash-alt" aria-hidden="true"></i>
        <span>Remove {selectedCount}</span>
      </button>
    {/if}
  {:else if selectedCount === 0}
    <div class="identity">
      <div class="character-circle empty-mode" aria-hidden="true">
        <i class="fas fa-user-slash"></i>
      </div>
      <div class="identity-meta">
        <span class="performer-name">No performers selected</span>
        {#if emptyHint}
          <div class="sub-row">
            <span class="all-hint" role="status">{emptyHint}</span>
          </div>
        {/if}
      </div>
    </div>
    {#if onSelectAll}
      <button
        class="select-all-button"
        type="button"
        onclick={onSelectAll}
        aria-label="Select all performers"
        title="Select all performers"
      >
        <i class="fas fa-users" aria-hidden="true"></i>
        <span>Select all</span>
      </button>
    {/if}
  {:else if performer}
    <div class="identity">
      <div class="character-circle" aria-hidden="true">
        <span class="character-initials">{characterInitials}</span>
      </div>
      <div class="identity-meta">
        {#if isEditingName}
          <input
            bind:this={nameInput}
            class="name-input"
            bind:value={nameDraft}
            onblur={commitName}
            onkeydown={handleNameKeydown}
            maxlength="24"
            placeholder={characterDefinition?.name ?? "Name"}
            aria-label="Performer name"
          />
        {:else}
          <button
            class="performer-name-btn"
            type="button"
            onclick={startEditName}
            title="Rename performer"
          >
            <span class="performer-name">{performerName}</span>
            <i class="fas fa-pen edit-hint" aria-hidden="true"></i>
          </button>
        {/if}
        <div class="sub-row">
          {#if sequenceWord}
            <div
              class="sequence-chip"
              role="img"
              aria-label={simplifyRepeatedWord(sequenceWord)}
              title={simplifyRepeatedWord(sequenceWord)}
            >
              <TKAWordGlyph
                word={sequenceWord}
                height={16}
                darkMode
                fitToParent
              />
            </div>
            <span class="sequence-dot" aria-hidden="true">·</span>
          {/if}
          <span class:muted={sequenceSteps === null} class="sequence-steps">
            {sequenceSteps === null ? "No sequence" : `${sequenceSteps} steps`}
          </span>
        </div>
      </div>
    </div>
    {#if canRemove}
      <button
        class="remove-button"
        type="button"
        onclick={onRemove}
        aria-label={`Remove ${performerName}`}
        title="Remove performer"
      >
        <i class="fas fa-trash-alt" aria-hidden="true"></i>
        <span>Remove</span>
      </button>
    {/if}
  {/if}
</div>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 58px 10px 14px;
  }
  .identity {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }
  .character-circle {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    border: 2px solid var(--performer-color);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--performer-color) 14%, transparent);
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--performer-color) 20%, transparent);
  }
  .character-circle.all-mode {
    color: color-mix(in srgb, var(--performer-color) 60%, white);
    font-size: 14px;
  }
  .character-circle.empty-mode {
    border: 2px dashed var(--theme-stroke);
    background: transparent;
    box-shadow: none;
    color: var(--theme-text-dim);
    font-size: 14px;
  }
  .character-initials {
    color: var(--performer-color);
    font-size: 13px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.03em;
  }
  .identity-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .performer-name {
    color: var(--theme-text);
    font-size: 18px;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .performer-name-btn {
    min-height: 44px;
    padding: 1px 4px 1px 0;
    margin: 0 0 1px;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: text;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
  }
  .performer-name-btn:hover {
    background: var(--theme-card-hover-bg);
  }
  .edit-hint {
    color: var(--theme-text-tertiary);
    font-size: 12px;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }
  .performer-name-btn:hover .edit-hint,
  .performer-name-btn:focus-visible .edit-hint {
    opacity: 1;
  }
  .name-input {
    max-width: 100%;
    margin: 0 0 1px;
    padding: 1px 6px;
    border: 1.5px solid var(--performer-color);
    border-radius: 6px;
    background: var(--theme-input-bg);
    color: var(--theme-text);
    font-size: 18px;
    font-weight: 800;
    line-height: 1.15;
    outline: none;
  }
  .sub-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .count-badge {
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--text-on-accent);
    font-size: 13px;
    font-weight: 800;
    line-height: 1.3;
  }
  .all-hint,
  .sequence-dot,
  .sequence-steps {
    color: var(--theme-text-dim);
    font-size: 14px;
  }
  .all-hint {
    font-style: italic;
  }
  .sequence-chip {
    /* TKAWordGlyph's fallback text uses the same "TKA Letters" font as the
       resolved glyph images, so the fallback-to-image swap on cold cache
       keeps this chip's width stable — no layout shift on the siblings. */
    display: inline-flex;
    align-items: center;
    min-width: 0;
    max-width: 14rem;
    overflow: hidden;
  }
  .sequence-dot {
    color: var(--theme-text-tertiary);
  }
  .sequence-steps {
    font-weight: 550;
    white-space: nowrap;
  }
  .sequence-steps.muted {
    color: var(--theme-text-tertiary);
    font-style: italic;
  }
  .remove-button {
    min-width: 88px;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid var(--theme-danger-border);
    border-radius: 9px;
    background: var(--theme-danger-bg);
    color: var(--semantic-error);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    flex-shrink: 0;
    font-size: 14px;
    font-weight: 700;
  }
  .remove-button:hover {
    background: var(--theme-danger-hover-bg);
    border-color: var(--theme-danger-hover-border);
    color: var(--theme-text);
  }
  .select-all-button {
    min-width: 88px;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 50%, transparent);
    border-radius: 9px;
    background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
    color: var(--theme-accent-text);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    flex-shrink: 0;
    font-size: 14px;
    font-weight: 700;
    transition: background-color var(--transition-fast);
  }
  .select-all-button:hover {
    background: color-mix(in srgb, var(--theme-accent) 26%, transparent);
  }
  button:focus-visible {
    outline: 2px solid var(--performer-color);
    outline-offset: 2px;
  }
  @container (max-width: 460px) {
    .header {
      padding-right: 52px;
    }
    .remove-button,
    .select-all-button {
      min-width: 44px;
      width: 44px;
      padding: 0;
    }
    .remove-button span,
    .select-all-button span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .edit-hint {
      transition: none;
    }
  }
</style>
