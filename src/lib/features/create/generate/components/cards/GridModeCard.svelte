<!--
GridModeCard.svelte - Card for toggling grid mode
Shows BOTH grid mode options vertically with clear active/inactive states
-->
<script lang="ts">
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import ToggleCard from "./ToggleCard.svelte";

  let {
    currentMode,
    onModeChange,
    // 🎨 Luminance-aware emerald gradient - adapts to background brightness
    color = "linear-gradient(135deg, var(--card-emerald, #10b981) 0%, var(--card-emerald-end, #059669) 100%)",
    shadowColor = "160deg 75% 45%", // Green-matched shadow
    gridColumnSpan = 2,
    cardIndex = 0,
    headerFontSize = "9px",
    appearance = "vivid",
  } = $props<{
    currentMode: GridMode;
    onModeChange: (mode: GridMode) => void;
    color?: string;
    shadowColor?: string;
    gridColumnSpan?: number;
    cardIndex?: number;
    headerFontSize?: string;
    appearance?: "vivid" | "quiet";
  }>();
</script>

<ToggleCard
  title={t("generator_grid")}
  option1={{
    value: GridMode.DIAMOND,
    label: t("generator_grid_diamond"),
    icon: "gem",
  }}
  option2={{
    value: GridMode.BOX,
    label: t("generator_grid_box"),
    icon: "square",
  }}
  activeOption={currentMode}
  onToggle={onModeChange}
  {color}
  {shadowColor}
  {gridColumnSpan}
  {cardIndex}
  {headerFontSize}
  {appearance}
/>
