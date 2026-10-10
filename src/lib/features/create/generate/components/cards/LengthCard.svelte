<!--
LengthCard.svelte - Card for selecting sequence length
Shows current length with +/- stepper controls for quick adjustment.
In spell mode, shows bridge count as subtitle and allows upward adjustment.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { GenerationMode } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import StepperCard from "./StepperCard/StepperCard.svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import {
    resolveAccessTier,
    getMaxSteps,
  } from "#lib/shared/auth/domain/access-tier.js";
  import { isPremiumOrAbove } from "#lib/shared/auth/domain/models/user-role.js";

  let {
    currentLength,
    currentMode,
    loopEnabled = false,
    locked = false,
    minOverride,
    maxOverride,
    stepOverride,
    clampToMax = true,
    onLengthChange,
    onStepCapExceeded,
    subtitle = "",
    color = "radial-gradient(ellipse at top left, var(--card-blue, #3b82f6) 0%, var(--card-blue, #3b82f6) 40%, var(--card-blue-end, #1d4ed8) 100%)",
    shadowColor = "220deg 80% 55%",
    gridColumnSpan = 2,
    headerFontSize = "9px",
  } = $props<{
    currentLength: number;
    currentMode: GenerationMode;
    loopEnabled?: boolean;
    locked?: boolean;
    minOverride?: number;
    /** Pins the ceiling for isolated embeds that must not inherit auth tier. */
    maxOverride?: number;
    /** Pins the increment for isolated embeds with a fixed set of lengths. */
    stepOverride?: number;
    /**
     * Whether an over-cap length can be corrected by pushing a clamped value
     * back. False when `currentLength` is derived from something the callback
     * can't shrink (spell mode's word length) — those hosts get
     * `onStepCapExceeded` instead.
     */
    clampToMax?: boolean;
    onLengthChange: (length: number) => void;
    onStepCapExceeded?: () => void;
    subtitle?: string;
    color?: string;
    shadowColor?: string;
    gridColumnSpan?: number;
    headerFontSize?: string;
  }>();

  const MAX_LENGTH = $derived.by(() => {
    if (maxOverride !== undefined) return maxOverride;

    const accessTier = resolveAccessTier(
      authState.isAuthenticated,
      authState.isAnonymous,
      isPremiumOrAbove(authState.role)
    );
    return getMaxSteps(accessTier);
  });

  const MIN_LENGTH = $derived(minOverride ?? (loopEnabled ? 4 : 4));
  const STEP = $derived(stepOverride ?? (loopEnabled ? 2 : 1));

  // Clamp the displayed length to the tier cap. If the stored config has a
  // value above the tier limit (e.g., default 16 for a guest with cap 8),
  // push the clamped value back to the parent.
  //
  // Only the parent that owns `length` outright can honor this. In spell mode
  // `currentLength` is derived from the typed word, so a clamp pushed back
  // through `onLengthChange` can never lower it — the over-cap condition stays
  // true forever. Those hosts pass `clampToMax={false}` and the cap is enforced
  // where it can actually be applied: the stepper's own + button, and the
  // post-build cap in generate-actions.
  //
  // The callback is called untracked because the parent rebuilds it on every
  // config write. Reading it as a dependency meant a fresh closure identity
  // re-ran this effect, which called it again — an infinite loop that killed
  // the renderer (`effect_update_depth_exceeded`).
  $effect(() => {
    if (!clampToMax) return;
    if (currentLength <= MAX_LENGTH) return;
    const cappedAt = MAX_LENGTH;
    untrack(() => onLengthChange(cappedAt));
  });

  function handleIncrement() {
    if (locked) return;
    if (currentLength >= MAX_LENGTH) {
      onStepCapExceeded?.();
      return;
    }
    const newLength = Math.min(currentLength + STEP, MAX_LENGTH);
    onLengthChange(newLength);
  }

  function handleDecrement() {
    if (locked) return;
    const newLength = Math.max(currentLength - STEP, MIN_LENGTH);
    onLengthChange(newLength);
  }

  function formatValue(value: number): string {
    return value.toString();
  }
</script>

<StepperCard
  title={t("generator_length")}
  currentValue={currentLength}
  minValue={MIN_LENGTH}
  maxValue={MAX_LENGTH}
  onIncrement={handleIncrement}
  onDecrement={handleDecrement}
  onIncrementBlocked={onStepCapExceeded}
  {formatValue}
  {subtitle}
  {color}
  {shadowColor}
  {gridColumnSpan}
  {headerFontSize}
/>
