<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
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
    fill = false,
  }: {
    propType: string;
    value?: PropLook | null;
    onchange: (look: PropLook) => void;
    /** Share a bounded host's height; see PropBuildPicker. */
    fill?: boolean;
  } = $props();

  const look = $derived(normalizePropLook(value));
  const available = $derived(hasModelSprite(propType));
  // The domain carries plain English fallbacks; the picker names the versions
  // in the viewer's language.
  const options = $derived(
    propLookOptions(propType).map((option) => ({
      ...option,
      label: t("settings_prop_version_n", {
        version: option.id === "model" ? 2 : 1,
      }),
    }))
  );
</script>

{#if available}
  <div
    class="prop-look-picker"
    class:fill
    style:--prop-picker-accent="var(--theme-accent, #8b7cf6)"
    style:--prop-picker-stroke="var(--theme-stroke, rgba(255, 255, 255, 0.12))"
  >
    <PropBuildPicker
      label={t("settings_prop_version")}
      value={look}
      {options}
      {onchange}
      {fill}
    />
  </div>
{/if}

<style>
  .prop-look-picker {
    --build-option-count: 2;
    container-type: inline-size;
    display: grid;
    min-width: 0;
  }

  .prop-look-picker.fill {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }
</style>
