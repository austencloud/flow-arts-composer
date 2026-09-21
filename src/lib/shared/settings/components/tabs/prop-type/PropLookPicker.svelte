<script lang="ts">
  import PropBuildPicker from "$lib/shared/3d/components/controls/PropBuildPicker.svelte";
  import {
    hasModelSprite,
    normalizePropLook,
    propLookOptions,
    type PropLook,
  } from "$lib/shared/pictograph/prop/domain/prop-look";

  let {
    propType,
    value,
    onchange,
  }: {
    propType: string;
    value?: PropLook | null;
    onchange: (look: PropLook) => void;
  } = $props();

  const look = $derived(normalizePropLook(value));
  const available = $derived(hasModelSprite(propType));
  const options = $derived(propLookOptions(propType));
</script>

{#if available}
  <div
    class="prop-look-picker"
    style:--prop-picker-accent="var(--theme-accent, #8b7cf6)"
    style:--prop-picker-stroke="var(--theme-stroke, rgba(255, 255, 255, 0.12))"
  >
    <PropBuildPicker label="Prop look" value={look} {options} {onchange} />
  </div>
{/if}

<style>
  .prop-look-picker {
    --build-option-count: 2;
    container-type: inline-size;
    display: grid;
    min-width: 0;
  }
</style>
