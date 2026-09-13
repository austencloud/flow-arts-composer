<!--
  Audit harness: a Drawer holding a keyboard-navigable option list — the shape
  of the prop-selection sheet (PropSelectionSheet), the gallery filter drill,
  and every other "pick one of these" sheet in Create and Browse.

  Owned by tests/opus-accessibility-audit. No production behavior lives here.
-->
<script lang="ts">
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";

  let { isOpen = $bindable(true) }: { isOpen?: boolean } = $props();

  const OPTIONS = ["Staff", "Club", "Fan"];
  let selected = $state("Staff");
</script>

<Drawer bind:isOpen ariaLabel="Audit prop sheet" placement="bottom">
  <div role="listbox" aria-label="Prop type" tabindex="-1">
    {#each OPTIONS as option (option)}
      <button
        type="button"
        role="option"
        aria-selected={selected === option}
        data-testid={`option-${option}`}
        onclick={() => (selected = option)}
      >
        {option}
      </button>
    {/each}
  </div>
</Drawer>
