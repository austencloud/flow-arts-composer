<!-- Optional presentation step for the skill featured beside a creator name. -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getProfilePropLabel } from "$lib/shared/community/domain/profile-prop-catalog";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import PropSelectionButton from "$lib/shared/settings/components/tabs/prop-type/PropSelectionButton.svelte";

  interface Props {
    selectedProps: PropType[];
    value: PropType | null;
    disabled?: boolean;
    onselect: (propType: PropType | null) => void;
  }

  let { selectedProps, value, disabled = false, onselect }: Props = $props();
</script>

<div
  class="profile-prop-picker"
  role="group"
  aria-label={t("nav_ui_choose_a_featured_prop_skill")}
>
  {#each selectedProps as prop (prop)}
    {@const label = getProfilePropLabel(prop)}
    <PropSelectionButton
      {label}
      selected={value === prop}
      actionLabel={`Feature ${label} on your profile`}
      {disabled}
      onpress={() => onselect(prop)}
    >
      {#snippet art()}
        <PropCompositionPreview propType={prop} neutral />
      {/snippet}
    </PropSelectionButton>
  {/each}

  <PropSelectionButton
    label={t("nav_ui_no_featured_skill")}
    selected={value === null}
    actionLabel={t("nav_ui_do_not_feature_a_prop_skill")}
    {disabled}
    onpress={() => onselect(null)}
  >
    {#snippet art()}
      <span class="prop-selection-art no-preference-icon">
        <i class="fas fa-layer-group"></i>
      </span>
    {/snippet}
  </PropSelectionButton>
</div>

<style>
  .profile-prop-picker {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(6.5rem, 7.75rem));
    justify-content: center;
    gap: 0.625rem;
    padding: 0.5rem;
  }

  .no-preference-icon {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    color: var(--theme-accent, #6366f1);
    font-size: clamp(1.5rem, 8cqi, 2.5rem);
  }
</style>
