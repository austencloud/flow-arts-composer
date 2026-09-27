<!-- One profile skill. Hoop is the only family that opens a size choice. -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { ProfilePropFamily } from "$lib/shared/community/domain/profile-prop-catalog";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import PropSelectionButton from "$lib/shared/settings/components/tabs/prop-type/PropSelectionButton.svelte";

  interface Props {
    family: ProfilePropFamily;
    selectedChoices: PropType[];
    active: boolean;
    disabled?: boolean;
    onselect: (representative: PropType) => void;
  }

  let {
    family,
    selectedChoices,
    active,
    disabled = false,
    onselect,
  }: Props = $props();

  const selected = $derived(selectedChoices.length > 0);
  const hasChoices = $derived(family.choices.length > 1);
  const previewProp = $derived(
    selectedChoices[selectedChoices.length - 1] ?? family.representative
  );
  const selectionSummary = $derived(
    family.choices
      .filter((choice) => selectedChoices.includes(choice.prop))
      .map((choice) => choice.label.replace(" Hoop", ""))
      .join(" + ")
  );
</script>

<PropSelectionButton
  label={family.label}
  detail={selected && hasChoices ? selectionSummary : undefined}
  {selected}
  {active}
  badge={hasChoices ? family.choices.length : undefined}
  actionLabel={hasChoices
    ? t("nav_choose_skill", { prop: family.label })
    : t(selected ? "nav_remove_skill" : "nav_add_skill", {
        prop: family.label,
      })}
  {disabled}
  buttonProps={{
    "aria-expanded": hasChoices ? active : undefined,
    "aria-controls": hasChoices ? "prop-family-skill-choices" : undefined,
  }}
  onpress={() => onselect(family.representative)}
>
  {#snippet art()}
    <PropCompositionPreview propType={previewProp} neutral />
  {/snippet}
</PropSelectionButton>
