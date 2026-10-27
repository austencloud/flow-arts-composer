<!--
  ArenaPropDrawer.svelte

  Prop type selector for the arena.
  Unlike the settings prop drawer, this does not change the global prop. It
  returns the selected prop type via a callback; the arena holds it.
-->
<script lang="ts">
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import PropSelectionSheet from "#lib/shared/settings/components/tabs/prop-type/PropSelectionSheet.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let {
    isOpen = $bindable(false),
    selectedPropType,
    onSelect,
  }: {
    isOpen: boolean;
    selectedPropType: PropType;
    onSelect: (propType: PropType) => void;
  } = $props();
</script>

<PropSelectionSheet
  bind:isOpen
  {selectedPropType}
  color="blue"
  title={t('arena_battle_prop_title')}
  {onSelect}
/>
