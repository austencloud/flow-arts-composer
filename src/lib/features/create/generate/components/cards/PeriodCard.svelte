<!--
PeriodCard.svelte - reusable LOOP period selector for deck tooling.

Replaces SliceSizeCard. Period is the integer count of passes required for
a LOOP to return to identity (placement AND orientation):
  2 = halved, 4 = quartered, 8 = reserved for L5 grid / L7 wheel LOOPs.

The generator owns this choice inside its Rotated transformation card so the
same setting is not exposed in two places.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import ToggleCard from "./ToggleCard.svelte";

  let {
    currentPeriod,
    onPeriodChange,
    color = "linear-gradient(135deg, #ec4899 0%, #db2777 50%, #be185d 100%)",
    shadowColor = "330deg 75% 55%",
    gridColumnSpan = 2,
    cardIndex = 0,
    headerFontSize = "9px",
  } = $props<{
    currentPeriod: number;
    onPeriodChange: (period: number) => void;
    color?: string;
    shadowColor?: string;
    gridColumnSpan?: number;
    cardIndex?: number;
    headerFontSize?: string;
  }>();

  // Period 4 uses fa-arrows-spin (four-arrow spin) - this mirrors the icon-
  // strip distinction added in the scope-B slice-aware icon work, but at the
  // control level so users can tell the two periods apart before generating.
  // Period 2 keeps the classic fa-rotate (two-arrow loop).
</script>

<ToggleCard
  title={t("generator_period")}
  option1={{
    value: 4,
    label: t("generator_period_quartered"),
    icon: "circle-quarter-custom",
  }}
  option2={{
    value: 2,
    label: t("generator_period_halved"),
    icon: "circle-half-stroke",
  }}
  activeOption={currentPeriod}
  onToggle={onPeriodChange}
  {color}
  {shadowColor}
  {gridColumnSpan}
  {cardIndex}
  {headerFontSize}
/>
