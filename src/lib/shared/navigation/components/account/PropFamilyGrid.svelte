<!-- Profile skill families. Only families with real skill splits open details. -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    PROFILE_PROP_FAMILIES,
    getProfilePropFamilyByRepresentative,
    getSelectedFamilyChoices,
  } from "#lib/shared/community/domain/profile-prop-catalog.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import PropFamilyCard from "./PropFamilyCard.svelte";
  import PropVariantPicker from "./PropVariantPicker.svelte";

  interface Props {
    selectedProps: PropType[];
    activeFamily: PropType | null;
    disabled?: boolean;
    onselectfamily: (representative: PropType) => void;
    ontoggleskill: (propType: PropType) => void;
  }

  let {
    selectedProps,
    activeFamily,
    disabled = false,
    onselectfamily,
    ontoggleskill,
  }: Props = $props();

  const activeFamilyInfo = $derived(
    activeFamily
      ? getProfilePropFamilyByRepresentative(activeFamily)
      : undefined
  );
</script>

<div class="family-picker">
  <div class="family-grid" role="group" aria-label={t("nav_ui_prop_skills")}>
    {#each PROFILE_PROP_FAMILIES as family (family.representative)}
      <PropFamilyCard
        {family}
        selectedChoices={getSelectedFamilyChoices(selectedProps, family)}
        active={activeFamily === family.representative}
        {disabled}
        onselect={onselectfamily}
      />
    {/each}
  </div>

  {#if activeFamilyInfo && activeFamilyInfo.choices.length > 1}
    <div transition:growFade={{ axis: "y" }}>
      <PropVariantPicker
        family={activeFamilyInfo}
        {selectedProps}
        {disabled}
        ontoggle={ontoggleskill}
      />
    </div>
  {/if}
</div>

<style>
  .family-picker {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0 0.5rem 0.25rem;
  }

  .family-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.625rem;
  }

  @container (min-width: 36rem) {
    .family-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container (min-width: 52rem) {
    .family-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }
</style>
