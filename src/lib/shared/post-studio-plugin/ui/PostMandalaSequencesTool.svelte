<script lang="ts">
  /**
   * The ordered list a mandala clip shifts through. Each row names the
   * sequence and its length, with Up, Down, Replace and Remove; Add takes the
   * post's own sequence or one from the library. Any lengths go together:
   * unequal sequences pair by tip, which is the flowing look.
   */
  import { updateItem } from "@austencloud/video-editor/core";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { MANDALA_MAX_SEQUENCES } from "#lib/shared/mandala/domain/mandala-shift-types.js";
  import { mandalaSequenceSnapshot } from "#lib/shared/media-composition/domain/post-mandala-item.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SequencePickerModal from "#lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import type { MandalaSequenceSnapshot, PostMandalaItem } from "../item-kinds";
  import { useTkaEditor } from "./tka-editor-context";

  let {
    editor,
    item,
    locked = false,
  }: {
    editor: VideoEditorState;
    item: PostMandalaItem;
    locked?: boolean;
  } = $props();

  const tka = useTkaEditor();
  const postSequence = $derived(
    tka.sequence && tka.sequence.steps.length > 0 ? tka.sequence : null
  );
  const full = $derived(item.sequences.length >= MANDALA_MAX_SEQUENCES);

  let pickerOpen = $state(false);
  let pickerTarget = $state<number | null>(null);

  function setSequences(sequences: MandalaSequenceSnapshot[]): void {
    if (locked) return;
    editor.edit((project, ctx) =>
      updateItem(project, item.id, { sequences }, ctx)
    );
  }

  function add(chosen: SequenceData): void {
    if (full) return;
    setSequences([...item.sequences, mandalaSequenceSnapshot(chosen)]);
  }

  function replace(index: number, chosen: SequenceData): void {
    setSequences(
      item.sequences.map((entry, i) =>
        i === index ? mandalaSequenceSnapshot(chosen) : entry
      )
    );
  }

  function remove(index: number): void {
    setSequences(item.sequences.filter((_, i) => i !== index));
  }

  function move(index: number, by: -1 | 1): void {
    const to = index + by;
    if (to < 0 || to >= item.sequences.length) return;
    const next = [...item.sequences];
    const [entry] = next.splice(index, 1);
    next.splice(to, 0, entry!);
    setSequences(next);
  }

  function openPicker(replaceIndex: number | null): void {
    pickerTarget = replaceIndex;
    pickerOpen = true;
  }

  function closePicker(): void {
    pickerOpen = false;
    pickerTarget = null;
  }

  function picked(chosen: SequenceData): void {
    const target = pickerTarget;
    closePicker();
    if (target === null) add(chosen);
    else replace(target, chosen);
  }

  function beatsOf(entry: MandalaSequenceSnapshot): string {
    const count = entry.sequence.steps?.length ?? 0;
    return `${count} ${count === 1 ? "beat" : "beats"}`;
  }

  function nameOf(entry: MandalaSequenceSnapshot, index: number): string {
    return entry.name || `Sequence ${index + 1}`;
  }
</script>

<div class="sequences-tool">
  {#if item.sequences.length === 0}
    <p class="hint">Add the sequences this mandala shifts between.</p>
  {:else}
    <ol class="list" aria-label="Sequences in this mandala, in order">
      {#each item.sequences as entry, index (index)}
        <li class="row">
          <span class="place">{index + 1}</span>
          <span class="name">{nameOf(entry, index)}</span>
          <span class="meta">{beatsOf(entry)}</span>
          <PanelButton
            disabled={locked || index === 0}
            ariaLabel={`Move ${nameOf(entry, index)} up`}
            title="Move up"
            onclick={() => move(index, -1)}
          >
            <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
          </PanelButton>
          <PanelButton
            disabled={locked || index === item.sequences.length - 1}
            ariaLabel={`Move ${nameOf(entry, index)} down`}
            title="Move down"
            onclick={() => move(index, 1)}
          >
            <i class="fa-solid fa-arrow-down" aria-hidden="true"></i>
          </PanelButton>
          <PanelButton
            disabled={locked}
            ariaLabel={`Replace ${nameOf(entry, index)}`}
            onclick={() => openPicker(index)}
          >
            Replace
          </PanelButton>
          <PanelButton
            disabled={locked}
            ariaLabel={`Remove ${nameOf(entry, index)}`}
            title="Remove"
            onclick={() => remove(index)}
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </PanelButton>
        </li>
      {/each}
    </ol>
  {/if}
  <div class="actions">
    {#if postSequence}
      <PanelButton
        variant="primary"
        disabled={locked || full}
        onclick={() => add(postSequence)}
      >
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
        Add this post's sequence
      </PanelButton>
    {/if}
    <PanelButton disabled={locked || full} onclick={() => openPicker(null)}>
      <i class="fa-solid fa-book-open" aria-hidden="true"></i>
      Choose from library…
    </PanelButton>
  </div>
  <p class="hint">
    {#if full}
      A mandala shifts through up to {MANDALA_MAX_SEQUENCES} sequences.
    {:else if item.sequences.length === 1}
      One sequence holds still; add another to shift between them.
    {:else}
      The mandala shifts down the list on the beat and wraps to the top.
    {/if}
  </p>
</div>

<SequencePickerModal
  bind:open={pickerOpen}
  onClose={closePicker}
  onSelect={picked}
  title={pickerTarget !== null ? "Replace this sequence" : "Add a sequence"}
/>

<style>
  .sequences-tool {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .list {
    display: grid;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .place {
    flex: 0 0 auto;
    min-width: 1.25rem;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    flex: 0 0 auto;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
