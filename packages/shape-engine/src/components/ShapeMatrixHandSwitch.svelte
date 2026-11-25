<!-- packages/shape-engine/src/components/ShapeMatrixHandSwitch.svelte
  Which hands the stage plays: both, or one of them alone. The same switch in
  the same place on both surfaces, in both views, so a one-hand view always
  says it is one hand by choice and always shows the way back to both and the
  way across to the other hand. Left and Right are the two hands of the pair on
  stage, so switching never changes what either hand does. -->
<script lang="ts">
  import { s as t } from "../strings.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  type HandsOnStage = "both" | "left" | "right";

  let {
    value,
    onchange,
  }: {
    value: HandsOnStage;
    onchange: (next: HandsOnStage) => void;
  } = $props();

  const options = $derived([
    {
      value: "both" as const,
      label: t("shape_engine_hands_both"),
      tone: "both" as const,
    },
    {
      value: "left" as const,
      label: t("shape_engine_hands_left"),
      tone: "blue" as const,
    },
    {
      value: "right" as const,
      label: t("shape_engine_hands_right"),
      tone: "red" as const,
    },
  ]);
</script>

<div class="hand-switch">
  <SegmentedControl
    {options}
    {value}
    onchange={(next: HandsOnStage) => {
      if (next !== value) onchange(next);
    }}
    size="phone"
    density="tight"
    semantics="radiogroup"
    ariaLabel={t("shape_engine_hands_switch")}
  />
</div>

<style>
  .hand-switch {
    flex: none;
    min-width: 0;
  }

  /* Each segment is its own word plus 7px a side, in a 36px track. Three equal
     shares let the longest word run over its edge: Italian "Entrambe" was
     wider than its third of the switch. More than 7px puts the switch on a
     second line under the Ratios heading on a narrow phone. */
  .hand-switch :global(.ui-segments.segmented-control.phone) {
    padding: 2px;
  }
  .hand-switch :global(.ui-segments.segmented-control.phone button) {
    flex: 1 0 auto;
    min-height: calc(var(--alt-touch-target, 36px) - 6px);
    padding-inline: 0.375rem;
  }
</style>
