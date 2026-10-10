<!--
TurnIntensityCard.svelte - Card for selecting turn intensity
Uses stepper pattern for direct increment/decrement interaction
-->
<script lang="ts">
  import { BackgroundType } from "@austencloud/backgrounds";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { isBrightBackground } from "../../shared/domain/card-colors";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import StepperCard from "./StepperCard/StepperCard.svelte";
  import {
    describeTurnIntensity,
    turnIntensityColor,
    turnIntensityTextColor,
  } from "./turn-intensity-palette";

  let {
    currentIntensity,
    allowedValues,
    onIntensityChange,
    brightBackgroundOverride,
    shadowColor = "0deg 0% 0%", // Neutral shadow (adapts to any color)
    gridColumnSpan = 2,
    cardIndex = 0,
    headerFontSize = "9px",
    appearance = "vivid",
  } = $props<{
    currentIntensity: number;
    allowedValues: number[];
    onIntensityChange: (intensity: number) => void;
    /** Pins the palette for isolated embeds that do not share app settings. */
    brightBackgroundOverride?: boolean;
    shadowColor?: string;
    gridColumnSpan?: number;
    cardIndex?: number;
    headerFontSize?: string;
    appearance?: "vivid" | "quiet";
  }>();

  // The app follows its selected background. Isolated embeds can pin the
  // palette so a visitor's saved setting cannot restyle the card.
  const useDarkColors = $derived.by(
    () =>
      brightBackgroundOverride ??
      isBrightBackground(
        settingsService.settings.backgroundType ?? BackgroundType.WINTER
      )
  );

  // Find current index in allowed values
  const currentIndex = $derived(allowedValues.indexOf(currentIntensity));

  // Check if we can increment/decrement within allowed values
  const canIncrement = $derived(currentIndex < allowedValues.length - 1);
  const canDecrement = $derived(currentIndex > 0);

  const minValue = $derived(Math.min(...allowedValues));
  const maxValue = $derived(Math.max(...allowedValues));

  function handleIncrement() {
    if (canIncrement) {
      const nextValue = allowedValues[currentIndex + 1];
      onIntensityChange(nextValue);
    }
  }

  function handleDecrement() {
    if (canDecrement) {
      const prevValue = allowedValues[currentIndex - 1];
      onIntensityChange(prevValue);
    }
  }

  // Format intensity display
  function formatValue(value: number): string {
    return `≤${value}`;
  }

  const description = $derived(describeTurnIntensity(currentIntensity));
  const dynamicColor = $derived(
    turnIntensityColor(currentIntensity, useDarkColors)
  );
  const textColor = $derived(
    turnIntensityTextColor(currentIntensity, useDarkColors)
  );
</script>

<StepperCard
  title={t("generator_turn_intensity")}
  currentValue={currentIntensity}
  {minValue}
  {maxValue}
  onIncrement={handleIncrement}
  onDecrement={handleDecrement}
  {formatValue}
  {description}
  color={dynamicColor}
  {shadowColor}
  {textColor}
  {gridColumnSpan}
  {cardIndex}
  {headerFontSize}
  {appearance}
/>
