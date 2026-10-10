<!-- Multi-select skill choices for families where the distinction matters. -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { ProfilePropFamily } from "#lib/shared/community/domain/profile-prop-catalog.js";
  import PropCompositionPreview from "#lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import PropSelectionButton from "#lib/shared/settings/components/tabs/prop-type/PropSelectionButton.svelte";

  interface Props {
    family: ProfilePropFamily;
    selectedProps: PropType[];
    disabled?: boolean;
    ontoggle: (propType: PropType) => void;
  }

  let { family, selectedProps, disabled = false, ontoggle }: Props = $props();

  const selectedSet = $derived(new Set(selectedProps));
</script>

<section
  class="variant-picker"
  id="prop-family-skill-choices"
  aria-labelledby="active-family-title"
>
  <header class="variant-heading">
    <strong id="active-family-title">{family.label} size</strong>
  </header>

  <div class="variant-grid" role="group" aria-labelledby="active-family-title">
    {#each family.choices as choice (choice.prop)}
      {@const selected = selectedSet.has(choice.prop)}
      <PropSelectionButton
        label={choice.label.replace(" Hoop", "")}
        {selected}
        actionLabel={t(selected ? "nav_remove_skill" : "nav_add_skill", {
          prop: choice.label,
        })}
        {disabled}
        onpress={() => ontoggle(choice.prop)}
      >
        {#snippet art()}
          <PropCompositionPreview propType={choice.prop} neutral />
        {/snippet}
      </PropSelectionButton>
    {/each}
  </div>
</section>

<style>
  .variant-picker {
    width: min(100%, 17.5rem);
    box-sizing: border-box;
    padding: 0.65rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid
      color-mix(in srgb, var(--theme-accent) 26%, var(--theme-stroke));
    border-radius: 0.85rem;
  }

  .variant-heading {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    color: var(--theme-text, white);
    font-size: max(0.875rem, var(--font-size-min, 0.875rem));
  }

  .variant-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(6.5rem, 7.75rem));
    justify-content: start;
    gap: 0.5rem;
  }
</style>
