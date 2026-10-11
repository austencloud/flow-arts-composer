<script lang="ts">
  import {
    CHARACTER_DEFINITIONS,
    type CharacterId,
  } from "#lib/shared/3d/domain/character-model.js";
  import type { CharacterInstanceState } from "#lib/shared/3d/state/character-instance-state.svelte.js";
  import PerformerCharacterPicker from "../PerformerCharacterPicker.svelte";

  interface Props {
    currentCharacterId: CharacterId | null;
    pendingCharacterId?: CharacterId | null;
    performerColor?: string;
    previewPerformer: CharacterInstanceState | null;
    previewPerformerNumber: number;
    onIntent: (id: CharacterId) => void;
    onCancelIntent: () => void;
    onSelect: (id: CharacterId) => void;
  }

  let {
    currentCharacterId,
    pendingCharacterId = null,
    performerColor = "var(--theme-accent)",
    previewPerformer,
    previewPerformerNumber,
    onIntent,
    onCancelIntent,
    onSelect,
  }: Props = $props();

  const currentDefinition = $derived(
    CHARACTER_DEFINITIONS.find(
      (definition) => definition.id === currentCharacterId
    ) ?? null
  );
  const pendingDefinition = $derived(
    CHARACTER_DEFINITIONS.find(
      (definition) => definition.id === pendingCharacterId
    ) ?? null
  );
</script>

<div class="character-select-shell" style:--performer-color={performerColor}>
  <div class="picker-heading">
    <strong>Choose a character</strong>
    <span>
      Hover to preview {previewPerformerNumber === 1
        ? "Performer 1's"
        : `Performer ${previewPerformerNumber}'s`} sequence. Choose one to update
      the scene; Undo switches back.
    </span>
  </div>

  <span class="selection-status" aria-live="polite">
    {pendingDefinition
      ? `Loading ${pendingDefinition.name}`
      : currentDefinition
        ? `${currentDefinition.name} is active`
        : "Performers use different characters"}
  </span>

  <PerformerCharacterPicker
    selectedCharacterId={currentCharacterId}
    groupLabel="Choose a character"
    {previewPerformer}
    {pendingCharacterId}
    {onSelect}
    {onIntent}
    {onCancelIntent}
  />
</div>

<style>
  .character-select-shell {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    container-type: inline-size;
  }

  .picker-heading {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
  }

  .picker-heading strong {
    color: var(--theme-text);
    font-size: 1rem;
    font-weight: 650;
  }

  .picker-heading span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.4;
  }

  .selection-status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
