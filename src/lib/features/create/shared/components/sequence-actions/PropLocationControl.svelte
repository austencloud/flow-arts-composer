<!--
  PropLocationControl.svelte

  Location-specific labels and behavior for the shared prop cycle control.
-->
<script lang="ts">
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
  import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import PropCycleControl from "./PropCycleControl.svelte";

  type LocationRotationDirection = "clockwise" | "counterclockwise";

  interface Props {
    hand: "left" | "right";
    location: GridLocation;
    active?: boolean;
    disabled?: boolean;
    compact?: boolean;
    onRotate: (direction: LocationRotationDirection) => void;
    onChoose: () => void;
  }

  let {
    hand,
    location,
    active = false,
    disabled = false,
    compact = false,
    onRotate,
    onChoose,
  }: Props = $props();

  const accessibleHand = $derived(tDynamic(`create_action_hand_${hand}`));
</script>

<PropCycleControl
  valueLabel={tDynamic(`create_action_location_${location}_short`)}
  previousLabel={tDynamic("create_action_rotate_location_counterclockwise", {
    hand: accessibleHand,
  })}
  nextLabel={tDynamic("create_action_rotate_location_clockwise", {
    hand: accessibleHand,
  })}
  selectLabel={disabled
    ? tDynamic("create_action_location_unavailable_at_center_control")
    : tDynamic("create_action_choose_location", {
        hand: accessibleHand,
        location: tDynamic(`create_action_location_${location}_full`),
      })}
  {active}
  {disabled}
  {compact}
  onPrevious={() => onRotate("counterclockwise")}
  onNext={() => onRotate("clockwise")}
  onSelect={onChoose}
/>
