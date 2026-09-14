<script lang="ts">
  import VisualSavePrompt from "./VisualSavePrompt.svelte";
  let savePrompt: VisualSavePrompt | undefined = $state();
  import ContextMenu from "$lib/shared/components/context-menu/ContextMenu.svelte";
  import type {
    ContextMenuEntry,
    ContextMenuState,
  } from "$lib/shared/components/context-menu/context-menu-types";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { VisualSequenceSaveIntent } from "$lib/shared/library/services/contracts/IVisualSequenceSaveCoordinator";
  import { buildVisualSequenceSaveMenuItem } from "$lib/shared/library/services/visual-sequence-save-menu-item";

  interface Props {
    sequence: SequenceData;
    intent?: VisualSequenceSaveIntent;
    onSaveToLibrary?: () => void | Promise<void>;
  }

  let { sequence, intent = {}, onSaveToLibrary }: Props = $props();

  let menuState: ContextMenuState = $state({ open: false });
  const menuItems = $derived<ContextMenuEntry[]>([
    buildVisualSequenceSaveMenuItem(
      sequence,
      intent,
      onSaveToLibrary ?? (() => savePrompt?.request(sequence, intent))
    ),
  ]);

  export function openContextMenu(x: number, y: number): void {
    menuState = { open: true, x, y };
  }
</script>

<VisualSavePrompt bind:this={savePrompt} />

<ContextMenu
  {menuState}
  items={menuItems}
  onClose={() => (menuState = { open: false })}
/>
