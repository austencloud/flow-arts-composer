<!-- PropNavButton - Circular prop type button for bottom/side navigation -->
<!-- Tap: toggle prop drawer. Long-press (touch only): open quick feedback panel. -->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import NavButton from "./NavButton.svelte";
  import SelectedPropPreview from "./SelectedPropPreview.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { propDrawerState } from "$lib/shared/settings/state/prop-drawer-state.svelte";
  import { quickFeedbackState } from "$lib/shared/feedback/state/quick-feedback-state.svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";

  const LONG_PRESS_MS = 500;

  let hapticService: HapticFeedback | undefined;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressClick = $state(false);

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  const settings = $derived(getSettings());
  const leftPropType = $derived(settings.leftPropType ?? PropType.STAFF);
  const displayInfo = $derived(getPropTypeDisplayInfo(leftPropType));
  const rightPropType = $derived(
    settings.catDogMode
      ? (settings.rightPropType ?? leftPropType)
      : leftPropType
  );
  const propLabel = $derived(
    rightPropType === leftPropType
      ? displayInfo.label
      : `${displayInfo.label} + ${getPropTypeDisplayInfo(rightPropType).label}`
  );

  function startLongPress(event: PointerEvent) {
    if (event.pointerType === "mouse") return;
    clearLongPress();
    longPressTimer = setTimeout(() => {
      suppressClick = true;
      hapticService?.trigger("selection");
      quickFeedbackState.toggle();
    }, LONG_PRESS_MS);
  }

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handleClick() {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    propDrawerState.toggle();
  }
</script>

<div
  class="prop-nav-button-wrapper"
  onclick={handleClick}
  onpointerdown={startLongPress}
  onpointerup={clearLongPress}
  onpointerleave={clearLongPress}
  onpointercancel={clearLongPress}
  oncontextmenu={(e) => e.preventDefault()}
  onkeydown={(e) => e.key === "Enter" && handleClick()}
  role="button"
  tabindex="0"
>
  <div class="prop-button-container">
    <NavButton
      iconContent={propIcon}
      label="Prop"
      type="special"
      color="var(--theme-accent, #818cf8)"
      gradient="var(--theme-accent, #818cf8)"
      ariaLabel="Change props. Current: {propLabel}"
      active={false}
    />
  </div>
</div>

{#snippet propIcon()}<SelectedPropPreview size={36} />{/snippet}

<style>
  .prop-nav-button-wrapper {
    display: contents;
    touch-action: manipulation;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .prop-button-container {
    position: relative;
    display: inline-flex;
    touch-action: manipulation;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  /* Give the prop button an accent border so it stands out */
  .prop-button-container :global(.nav-button.special) {
    border: 1px solid var(--theme-accent, #818cf8);
  }

  @media (prefers-reduced-motion: reduce) {
    .prop-button-container :global(.nav-button.special) {
      transition: none;
    }
  }
</style>
