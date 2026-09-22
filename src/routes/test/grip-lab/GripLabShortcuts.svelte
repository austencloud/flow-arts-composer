<script lang="ts">
  import { onMount } from "svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";
  import KeyboardKeyDisplay from "$lib/shared/keyboard/components/settings/KeyboardKeyDisplay.svelte";
  import EditHistoryShortcutBridge from "$lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";
  import { KeyboardShortcutManager } from "$lib/shared/keyboard/services/keyboard-shortcut-manager";
  import { ShortcutRegistry } from "$lib/shared/keyboard/services/shortcut-registry";
  import { registerEditHistoryShortcuts } from "$lib/shared/keyboard/registration/register-edit-history-shortcuts";
  import { keyboardShortcutState } from "$lib/shared/keyboard/state/keyboard-shortcut-state.svelte";
  import {
    createGripLabShortcuts,
    shouldIgnoreGripLabKey,
    type GripLabShortcutActions,
  } from "./grip-lab-shortcuts";

  interface Props extends Omit<GripLabShortcutActions, "onHelp"> {
    open: boolean;
    blocked: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
  }
  let {
    open = $bindable(false),
    blocked,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onDelete,
    onAdd,
    onPlay,
    onStep,
    onNeighbor,
    onStart,
  }: Props = $props();
  const modifier = keyboardShortcutState.isMac ? "meta" : "ctrl";
  const shortcuts = createGripLabShortcuts({
    onDelete: () => onDelete(),
    onAdd: () => onAdd(),
    onPlay: () => onPlay(),
    onStep: (direction) => onStep(direction),
    onNeighbor: (direction) => onNeighbor(direction),
    onStart: () => onStart(),
    onHelp: () => (open = true),
  });
  const historyHelp = [
    { label: "Undo", combos: [`${modifier}+z`] },
    {
      label: "Redo",
      combos: [
        `${modifier}+shift+z`,
        ...(modifier === "ctrl" ? ["ctrl+y"] : []),
      ],
    },
  ];
  onMount(() => {
    // Test routes omit the app's shortcut coordinator. Use its manager and
    // history routing with a registry that lives only as long as this page.
    const manager = new KeyboardShortcutManager(new ShortcutRegistry());
    registerEditHistoryShortcuts(manager, keyboardShortcutState.isMac);
    for (const shortcut of shortcuts) manager.register(shortcut);
    manager.addInputSuppressor(
      (event) => blocked || open || shouldIgnoreGripLabKey(event)
    );
    manager.initialize();
    return () => manager.dispose();
  });
</script>

<EditHistoryShortcutBridge
  {onUndo}
  {onRedo}
  {canUndo}
  {canRedo}
  undoLabel="Pose change"
  redoLabel="Pose change"
/>
<Drawer
  bind:isOpen={open}
  title="Grip Lab shortcuts"
  placement="right"
  respectLayoutMode
>
  <DrawerHeader title="Grip Lab shortcuts" onClose={() => (open = false)} />
  <div class="shortcut-list">
    <p>
      Select a diamond to delete its keyframe. Text fields and open dialogs keep
      their own keys.
    </p>
    <dl>
      {#each historyHelp as shortcut}
        <div class="shortcut-row">
          <dt>{shortcut.label}</dt>
          <dd>
            {#each shortcut.combos as keyCombo}<KeyboardKeyDisplay
                {keyCombo}
                size="small"
              />{/each}
          </dd>
        </div>
      {/each}
      {#each shortcuts as shortcut}
        <div class="shortcut-row">
          <dt>{shortcut.label}</dt>
          <dd>
            <KeyboardKeyDisplay
              parsed={{
                key: shortcut.key,
                modifiers: shortcut.modifiers ?? [],
              }}
              size="small"
            />
            {#each shortcut.alternateBindings ?? [] as parsed}<KeyboardKeyDisplay
                {parsed}
                size="small"
              />{/each}
          </dd>
        </div>
      {/each}
      <div class="shortcut-row">
        <dt>Close dialog</dt>
        <dd><KeyboardKeyDisplay keyCombo="Escape" size="small" /></dd>
      </div>
    </dl>
    <p>
      Delete removes the entire pose keyframe. Undo and redo last until you
      reload the page.
    </p>
  </div>
</Drawer>

<style>
  .shortcut-list {
    padding: 0 1.25rem 1.25rem;
    font-size: var(--font-size-min, 14px);
  }
  p {
    color: var(--theme-text-dim);
    line-height: 1.5;
    margin: 0 0 1rem;
  }
  dl {
    margin: 0 0 1rem;
  }
  .shortcut-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid var(--theme-stroke);
  }
  dt {
    color: var(--theme-text);
  }
  dd {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
  }
</style>
