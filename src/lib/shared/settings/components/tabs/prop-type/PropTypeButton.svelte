<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import { localizedPropName } from "./localized-prop-name";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import PropSelectionButton from "./PropSelectionButton.svelte";

  let {
    propType,
    selected = false,
    selectedLeft = false,
    selectedRight = false,
    color = "blue",
    badge,
    actionLabel,
    buttonProps,
    onSelect,
  } = $props<{
    propType: PropType;
    selected?: boolean;
    selectedLeft?: boolean;
    selectedRight?: boolean;
    color?: "blue" | "red" | (string & {});
    badge?: number;
    actionLabel?: string;
    buttonProps?: HTMLButtonAttributes;
    onSelect?: (propType: PropType) => void;
  }>();

  const displayLabel = $derived(localizedPropName(propType));
  const resolvedActionLabel = $derived(
    actionLabel ?? t("settings_select_prop_type", { prop: displayLabel })
  );
</script>

<PropSelectionButton
  label={displayLabel}
  {selected}
  {selectedLeft}
  {selectedRight}
  {color}
  {badge}
  actionLabel={resolvedActionLabel}
  {buttonProps}
  ghost={true}
  onpress={onSelect ? () => onSelect?.(propType) : undefined}
>
  {#snippet art()}
    <PropCompositionPreview {propType} neutral />
  {/snippet}
</PropSelectionButton>
