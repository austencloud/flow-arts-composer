<script lang="ts">
  import {
    CHARACTER_DEFINITIONS,
    type CharacterId,
  } from "#lib/shared/3d/domain/character-model.js";
  import PerformerCharacterPicker from "../PerformerCharacterPicker.svelte";

  interface Props {
    currentCharacterId: CharacterId | null;
    pendingCharacterId?: CharacterId | null;
    performerColor?: string;
    onIntent: (id: CharacterId) => void;
    onCancelIntent: () => void;
    onSelect: (id: CharacterId) => void;
  }

  let {
    currentCharacterId,
    pendingCharacterId = null,
    performerColor = "var(--theme-accent)",
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

<!-- The tab already says "Character" and the tiles are the whole message, so
     the pane is the grid and nothing else. -->
<div class="character-select-shell" style:--performer-color={performerColor}>
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
    fill
    {pendingCharacterId}
    {onSelect}
    {onIntent}
    {onCancelIntent}
  />
</div>

<style>
  .character-select-shell {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
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
