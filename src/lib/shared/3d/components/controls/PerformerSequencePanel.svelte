<script lang="ts">
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  interface Props {
    performerName: string;
    sequenceWord: string | null;
    sequenceSteps: number | null;
    hasSequence: boolean;
    onSelect: (sequence: SequenceData) => void;
    onClear: () => void;
  }

  let {
    performerName,
    sequenceWord,
    sequenceSteps,
    hasSequence,
    onSelect,
    onClear,
  }: Props = $props();

  let pickerOpen = $state(false);

  // The picker browses the library and the community through Firebase, so it
  // loads when first opened rather than with the 3D scene controls.
  const loadPicker = () =>
    import("$lib/shared/components/sequence-picker/SequencePickerModal.svelte");

  function selectSequence(sequence: SequenceData): void {
    onSelect(sequence);
    pickerOpen = false;
  }
</script>

<div class="sequence-section">
  {#if hasSequence}
    <div class="sequence-summary">
      <strong>{sequenceWord ?? "Untitled sequence"}</strong>
      {#if sequenceSteps !== null}
        <span>{sequenceSteps} steps</span>
      {/if}
    </div>
    <div class="sequence-actions">
      <button
        class="sequence-button primary"
        type="button"
        onclick={() => (pickerOpen = true)}
      >
        <i class="fas fa-folder-open" aria-hidden="true"></i>
        <span>Change sequence</span>
      </button>
      <button class="sequence-button" type="button" onclick={onClear}>
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>Clear</span>
      </button>
    </div>
  {:else}
    <div class="sequence-empty">
      <i class="fas fa-film" aria-hidden="true"></i>
      <strong>No sequence loaded</strong>
      <span>Choose from your library or the community.</span>
      <button
        class="sequence-button primary"
        type="button"
        onclick={() => (pickerOpen = true)}
      >
        <i class="fas fa-folder-open" aria-hidden="true"></i>
        <span>Choose sequence</span>
      </button>
    </div>
  {/if}
</div>

<LazyMount
  loader={loadPicker}
  active={pickerOpen}
  debugName="SequencePickerModal"
  props={{
    open: pickerOpen,
    title: `Choose a sequence for ${performerName}`,
    onSelect: selectSequence,
    onClose: () => (pickerOpen = false),
  }}
/>

<style>
  .sequence-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sequence-summary {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sequence-summary strong {
    color: var(--theme-text);
    font-size: 22px;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .sequence-summary span {
    color: var(--theme-text-dim);
    font-size: 14px;
    font-weight: 550;
  }
  .sequence-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sequence-button {
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 7px;
    width: fit-content;
    font-size: 14px;
    font-weight: 700;
    transition:
      background 140ms ease,
      border-color 140ms ease,
      color 140ms ease;
  }
  .sequence-button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }
  .sequence-button.primary {
    background: color-mix(in srgb, var(--performer-color) 22%, transparent);
    border-color: color-mix(in srgb, var(--performer-color) 52%, transparent);
    color: white;
  }
  .sequence-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 18px 0;
    color: var(--theme-text-dim);
    text-align: center;
  }
  .sequence-empty > i {
    font-size: 24px;
    opacity: 0.55;
  }
  .sequence-empty strong {
    color: var(--theme-text);
    font-size: 14px;
  }
  .sequence-empty > span {
    max-width: 300px;
    color: var(--theme-text-dim);
    font-size: 14px;
    line-height: 1.4;
  }
  button:focus-visible {
    outline: 2px solid var(--performer-color);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .sequence-button {
      transition: none;
    }
  }
</style>
