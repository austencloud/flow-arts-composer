<!--
  PropPicker - the buyer's print-prop choice on deck configurators: the shared
  PropChoiceRow limited to the shop offering (shop-prop-options), not the full
  app prop taxonomy.
-->
<script lang="ts">
  import PropChoiceRow from "#lib/shared/pictograph/prop/components/PropChoiceRow.svelte";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { SHOP_PROP_OPTIONS } from "../domain/shop-prop-options";

  interface Props {
    value: PropType;
    onchange: (prop: PropType) => void;
    options?: readonly PropType[];
  }

  let { value, onchange, options = SHOP_PROP_OPTIONS }: Props = $props();
</script>

<PropChoiceRow {value} {onchange} {options} label="Prop" />
