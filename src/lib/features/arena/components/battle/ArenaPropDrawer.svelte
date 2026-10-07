<!--
  ArenaPropDrawer.svelte

  Prop type selector for the arena.
  Unlike the settings prop drawer, this changes neither the global prop nor
  the global version. It returns the selected prop type, and the version
  picked with it, via callbacks; the arena holds both.
-->
<script lang="ts">
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { PropLook } from "$lib/shared/pictograph/prop/domain/prop-look";
  import PropSelectionSheet from "$lib/shared/settings/components/tabs/prop-type/PropSelectionSheet.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";

  let {
    isOpen = $bindable(false),
    selectedPropType,
    propLook,
    onSelect,
    onPropLookChange,
  }: {
    isOpen: boolean;
    selectedPropType: PropType;
    propLook: PropLook;
    onSelect: (propType: PropType, look?: PropLook) => void;
    onPropLookChange: (look: PropLook) => void;
  } = $props();
</script>

<PropSelectionSheet
  bind:isOpen
  {selectedPropType}
  color="blue"
  title={t('arena_battle_prop_title')}
  {propLook}
  {onPropLookChange}
  {onSelect}
/>
