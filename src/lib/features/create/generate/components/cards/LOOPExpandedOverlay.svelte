<!--
LOOPExpandedOverlay.svelte - Expanded LOOP selection that covers the card grid
Animates forward in z-axis and expands to fill the container space
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { fly, scale } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { onMount, tick } from "svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    generateLOOPType,
    buildLoopSpec,
  } from "$lib/shared/create/services/loop-type-utils";
  import { gateRhythm } from "$lib/shared/create/services/loop-rhythm-gating";
  import {
    guestLoopGate,
    type GuestLoopLockKind,
  } from "$lib/shared/create/services/loop-guest-gate";
  import { LOOPComponent } from "$lib/features/create/generate/shared/domain/constants/loop-components";
  import { LOOPType } from "../../circular/domain/models/circular-models";
  import LOOPComponentGrid from "../modals/LOOPComponentGrid.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import FontAwesomeIcon from "$lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import LoopDetailPanel from "./LoopDetailPanel.svelte";
  import LoopOverlayHeader from "./LoopOverlayHeader.svelte";
  import LoopRhythmConfigurator from "./LoopRhythmConfigurator.svelte";
  import LoopSelectionSummary from "./LoopSelectionSummary.svelte";
  import {
    buildLoopOverlayModel,
    normalizeReflectionSelection,
    type LoopRhythmValue,
  } from "./loop-expanded-overlay-model";

  let {
    currentType,
    selectedComponents,
    onChange,
    onClose,
    entrance = "scale",
    titleId,
    onLoopDisable,
    layout = "grid",
    rhythm,
    sequenceLength,
    onRhythmChange,
    guestMaxLength,
    onRequestSignup,
  } = $props<{
    currentType: LOOPType;
    selectedComponents: Set<LOOPComponent>;
    onChange: (loopType: LOOPType) => void;
    onClose: () => void;
    /** "none" when a host transition (the card morph) is already carrying the
     *  panel in; the root then skips its own scale entrance. "none" also
     *  skips the outro; the decision made at open time applies to the close. */
    entrance?: "scale" | "none";
    /** Forwarded to LoopOverlayHeader as the heading's id, so a host stage's
     *  aria-labelledby points at the title this overlay actually renders. */
    titleId?: string;
    onLoopDisable?: () => void;
    layout?: "grid" | "list" | "responsive";
    /** Current rhythm + context for the Rhythm tier. All optional — absent = tier hidden (legacy callers unaffected). */
    rhythm?: LoopRhythmValue;
    sequenceLength?: number;
    onRhythmChange?: (updates: Partial<LoopRhythmValue>) => void;
    /** Guest step cap. Set (by guest-facing hosts) turns on guest LOOP gating;
        absent = no gating (deck/store/admin hosts unaffected). */
    guestMaxLength?: number;
    /** Called with the lock kind when a guest taps a gated LOOP. The host
        routes straight to the auth screen, whose contextual copy is picked by
        kind (category → every-LOOP-type, length → step cap). */
    onRequestSignup?: (kind: GuestLoopLockKind) => void;
  }>();

  let hapticService: HapticFeedback | null = null;
  let overlayElement: HTMLDivElement;
  let gridContainerElement = $state<HTMLDivElement>();
  let drawerHeightAnimation: Animation | null = null;
  let componentRevealFrame: number | null = null;
  let pendingCloseTimer: ReturnType<typeof setTimeout> | null = null;
  // A reopened multi-component combo lands on the Combo screen it was applied
  // from, not back on Single (the overlay remounts per open — props are nulled
  // on close — so mount-time init is the reopen path).
  let isMultiSelectMode = $state(selectedComponents.size > 1);
  let localSelectedComponents = $state(new Set<LOOPComponent>());
  let detailComponent = $state<LOOPComponent | null>(null);

  // Sync local state with prop changes
  $effect(() => {
    localSelectedComponents = normalizeReflectionSelection(
      new Set<LOOPComponent>(selectedComponents)
    );
    if (selectedComponents.size > 1) {
      isMultiSelectMode = true;
    }
  });

  // Combo edits stay local until Apply. Single LOOP settings write through as
  // soon as they form a valid configuration, while this local copy keeps an
  // invalid choice visible long enough to explain what needs changing.
  let localRhythm = $state<LoopRhythmValue>({
    rotationInterval: 2,
    inversionInterval: 2,
    inversionMode: "expand",
    reflectionAxis:
      currentType === LOOPType.FLIPPED ? "east-west" : "north-south",
  });

  $effect(() => {
    if (rhythm) {
      localRhythm = { ...rhythm };
    }
  });

  onMount(() => {
    hapticService = getHapticFeedback();
    const initialComponents = normalizeReflectionSelection(
      new Set(selectedComponents)
    );
    const lowestExpandedComponent = [
      LOOPComponent.MIRRORED,
      LOOPComponent.INVERTED,
      LOOPComponent.ROTATED,
    ].find((component) => initialComponents.has(component));
    if (lowestExpandedComponent && !usesMobileDrawerPresentation()) {
      void keepExpandedComponentVisible(lowestExpandedComponent);
    }

    return () => {
      drawerHeightAnimation?.cancel();
      drawerHeightAnimation = null;
      if (componentRevealFrame !== null) {
        cancelAnimationFrame(componentRevealFrame);
        componentRevealFrame = null;
      }
      if (pendingCloseTimer !== null) {
        clearTimeout(pendingCloseTimer);
        pendingCloseTimer = null;
      }
    };
  });

  // The pure model owns compatibility, validation, and display decisions. The
  // component keeps the interaction lifecycle that crosses DOM boundaries.
  const overlayModel = $derived.by(() =>
    buildLoopOverlayModel({
      selectedComponents: localSelectedComponents,
      isMultiSelectMode,
      rhythm: localRhythm,
      rhythmControlsAvailable: !!rhythm && !!onRhythmChange,
      detailComponent,
      sequenceLength,
      guestMaxLength,
    })
  );
  const explanationText = $derived(overlayModel.explanationText);
  const isImplemented = $derived(overlayModel.isImplemented);
  const disabledComponents = $derived(overlayModel.disabledComponents);
  const selectionCount = $derived(overlayModel.selectionCount);
  const configurableComponents = $derived(overlayModel.configurableComponents);
  const canConfigureRotation = $derived(
    configurableComponents.has(LOOPComponent.ROTATED)
  );
  const canConfigureInversion = $derived(
    configurableComponents.has(LOOPComponent.INVERTED)
  );
  const canConfigureReflection = $derived(
    configurableComponents.has(LOOPComponent.MIRRORED)
  );
  const detailInfo = $derived(overlayModel.detailInfo);
  const detailView = $derived(overlayModel.detailView);
  const specWire = $derived(overlayModel.specWire);
  const rhythmGate = $derived(overlayModel.rhythmGate);
  const guestLock = $derived(overlayModel.guestLock);
  const lockedComponents = $derived(overlayModel.lockedComponents);
  const wordMathText = $derived(overlayModel.wordMathText);
  const inversionCaption = $derived(overlayModel.inversionCaption);
  const buttonText = $derived(overlayModel.buttonText);

  function usesMobileDrawerPresentation(): boolean {
    const mobileStage = overlayElement?.querySelector<HTMLElement>(
      ".mobile-loop-stage, .single-loop-stage"
    );
    if (mobileStage && getComputedStyle(mobileStage).display !== "none") {
      return true;
    }
    const drawer = overlayElement?.closest<HTMLElement>(".loop-drawer-sheet");
    if (drawer) return drawer.dataset.placement === "bottom";
    return (
      layout === "responsive" &&
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 768px)").matches
    );
  }

  function hasComponentConfigurator(component: LOOPComponent): boolean {
    if (!rhythm || !onRhythmChange) return false;
    return (
      component === LOOPComponent.ROTATED ||
      component === LOOPComponent.INVERTED ||
      component === LOOPComponent.MIRRORED
    );
  }

  function handleToggle(component: LOOPComponent) {
    hapticService?.trigger("selection");
    const usesFocusedDetail = usesMobileDrawerPresentation();

    // Single stays spatially continuous on desktop: the selected card expands
    // around its controls and pushes its siblings down. Compact drawers use a
    // focused settings screen because the full list no longer fits beside it.
    if (!isMultiSelectMode) {
      // Guest-gated single pick routes to sign-up instead of applying.
      if (guestMaxLength !== undefined) {
        const gate = guestLoopGate(
          generateLOOPType(new Set([component])),
          buildLoopSpec(new Set([component]), localRhythm),
          guestMaxLength
        );
        if (gate.locked) {
          onRequestSignup?.(gate.kind);
          return;
        }
      }
      const nextComponents = new Set([component]);
      localSelectedComponents = nextComponents;
      const newLoopType = generateLOOPType(nextComponents);
      if (newLoopType === null) return;

      const nextRhythmGate =
        sequenceLength === undefined
          ? null
          : gateRhythm(nextComponents, localRhythm, sequenceLength);
      const isValid = !nextRhythmGate || nextRhythmGate.ok;

      if (isValid) {
        onChange(newLoopType);
      }

      if (hasComponentConfigurator(component)) {
        if (usesFocusedDetail) {
          void openConfigurator(component, false);
        } else {
          detailComponent = null;
          void keepExpandedComponentVisible(component);
        }
        return;
      }

      if (isValid) onClose();
      return;
    }

    // Multi-select mode: Toggle selection
    const newSet = new Set(localSelectedComponents);
    const isAdding = !newSet.has(component);
    if (!isAdding) {
      newSet.delete(component);
    } else {
      newSet.add(component);
    }
    localSelectedComponents = newSet;
    if (!isAdding && detailComponent === component) {
      detailComponent = null;
    }
    if (
      isAdding &&
      !usesFocusedDetail &&
      (component === LOOPComponent.ROTATED ||
        component === LOOPComponent.MIRRORED ||
        component === LOOPComponent.INVERTED)
    ) {
      void keepExpandedComponentVisible(component);
    }
  }

  async function openConfigurator(
    component: LOOPComponent,
    triggerHaptic = true
  ) {
    if (!hasComponentConfigurator(component)) return;
    if (triggerHaptic) hapticService?.trigger("selection");
    detailComponent = component;
    await tick();
    overlayElement
      ?.querySelector<HTMLButtonElement>(".loop-detail-back")
      ?.focus({ preventScroll: true });
  }

  async function closeConfigurator() {
    const previousComponent = detailComponent;
    if (!previousComponent) return;
    hapticService?.trigger("selection");
    detailComponent = null;
    await tick();
    const focusSelector = isMultiSelectMode
      ? `.mobile-loop-stage [data-configure-component="${previousComponent}"]`
      : `.single-loop-stage [data-component="${previousComponent}"] .loop-component-button`;
    overlayElement
      ?.querySelector<HTMLButtonElement>(focusSelector)
      ?.focus({ preventScroll: true });
  }

  async function keepExpandedComponentVisible(component: LOOPComponent) {
    await tick();

    if (componentRevealFrame !== null) {
      cancelAnimationFrame(componentRevealFrame);
      componentRevealFrame = null;
    }

    const card = gridContainerElement?.querySelector<HTMLElement>(
      `[data-component="${component}"]`
    );
    if (!card || !gridContainerElement?.isConnected) return;

    let scrollViewport: HTMLElement | null = card.parentElement;
    while (scrollViewport) {
      const overflowY = getComputedStyle(scrollViewport).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") break;
      scrollViewport = scrollViewport.parentElement;
    }
    scrollViewport ??= gridContainerElement;

    const duration = motionDuration(DURATION.dramatic);
    const startedAt = performance.now();
    const edgePadding = 8;

    // The last selected card can keep growing after its first rendered frame.
    // Follow that growth for the same duration as the row animation so its
    // controls never disappear underneath the sticky Apply area.
    const followExpansion = (now: number) => {
      if (!card.isConnected || !scrollViewport.isConnected) {
        componentRevealFrame = null;
        return;
      }

      const viewport = scrollViewport.getBoundingClientRect();
      const cardBounds = card.getBoundingClientRect();
      const bottomOverflow =
        cardBounds.bottom - (viewport.bottom - edgePadding);
      const topOverflow = viewport.top + edgePadding - cardBounds.top;

      if (bottomOverflow > 0) {
        scrollViewport.scrollTop += bottomOverflow;
      } else if (topOverflow > 0) {
        scrollViewport.scrollTop -= topOverflow;
      }

      if (now - startedAt < duration + 32) {
        componentRevealFrame = requestAnimationFrame(followExpansion);
      } else {
        componentRevealFrame = null;
      }
    };

    componentRevealFrame = requestAnimationFrame(followExpansion);
  }

  async function handleModeChange(isMulti: boolean) {
    if (isMulti === isMultiSelectMode) return;

    hapticService?.trigger("selection");

    const drawer = overlayElement?.closest<HTMLElement>(".loop-drawer-sheet");
    const animationDuration = motionDuration(DURATION.dramatic);
    const shouldAnimateDrawer =
      drawer !== null &&
      drawer.dataset.placement === "bottom" &&
      animationDuration > 0;

    // Single ends at its content while Combo fills the phone. Numeric
    // endpoints keep that intrinsic-height morph smooth in iPhone WebKit too.
    const startHeight = shouldAnimateDrawer
      ? drawer.getBoundingClientRect().height
      : 0;

    drawerHeightAnimation?.cancel();
    drawerHeightAnimation = null;
    detailComponent = null;
    if (!isMulti && localSelectedComponents.size > 1) {
      // A committed combo has no honest preselection in Single mode. Leave the
      // active combo untouched until the user chooses the single LOOP that
      // should replace it.
      localSelectedComponents = new Set();
    }
    isMultiSelectMode = isMulti;

    if (!shouldAnimateDrawer) return;

    await tick();
    if (!drawer.isConnected) return;

    const endHeight = drawer.getBoundingClientRect().height;
    if (Math.abs(startHeight - endHeight) < 1) return;

    const easing =
      getComputedStyle(drawer).getPropertyValue("--ease-out").trim() ||
      "cubic-bezier(0.16, 1, 0.3, 1)";
    const animation = drawer.animate(
      [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
      { duration: animationDuration, easing }
    );

    drawerHeightAnimation = animation;
    void animation.finished
      .catch(() => undefined)
      .finally(() => {
        if (drawerHeightAnimation === animation) {
          drawerHeightAnimation = null;
        }
      });
  }

  function updateRhythm(updates: Partial<LoopRhythmValue>) {
    hapticService?.trigger("selection");
    const nextRhythm = { ...localRhythm, ...updates };

    if (!isMultiSelectMode && selectionCount > 0) {
      const newLoopType = generateLOOPType(localSelectedComponents);
      if (newLoopType !== null && guestMaxLength !== undefined) {
        const nextGuestLock = guestLoopGate(
          newLoopType,
          buildLoopSpec(localSelectedComponents, nextRhythm),
          guestMaxLength
        );
        if (nextGuestLock.locked) {
          onRequestSignup?.(nextGuestLock.kind);
          return;
        }
      }
    }

    localRhythm = nextRhythm;
    if (isMultiSelectMode || selectionCount === 0) return;

    const newLoopType = generateLOOPType(localSelectedComponents);
    if (newLoopType === null) return;
    const nextRhythmGate =
      sequenceLength === undefined
        ? null
        : gateRhythm(localSelectedComponents, nextRhythm, sequenceLength);
    if (nextRhythmGate && !nextRhythmGate.ok) return;

    onRhythmChange?.(updates);
    onChange(newLoopType);

    // Rotation period and reflection axis are terminal picks: the value is
    // already applied, so the open drawer only costs a manual dismiss.
    // Close after a beat so the segment indicator lands first. Inversion
    // keeps two controls (timing + build mode) and must stay open.
    if ("rotationInterval" in updates || "reflectionAxis" in updates) {
      if (pendingCloseTimer !== null) clearTimeout(pendingCloseTimer);
      pendingCloseTimer = setTimeout(() => {
        pendingCloseTimer = null;
        onClose();
      }, motionDuration(DURATION.emphasis));
    }
  }

  function applyAndClose() {
    if (selectionCount === 0) return;

    const newLoopType = generateLOOPType(localSelectedComponents);
    if (newLoopType === null) return; // unmapped combo — Apply is disabled anyway

    // Rhythm changes are LOCAL until Apply — fire the diff BEFORE onChange so
    // the config-mapper reads both the new rhythm and the new loop type on
    // the next generate.
    if (rhythm && onRhythmChange) {
      const diff: Partial<LoopRhythmValue> = {};
      if (localRhythm.rotationInterval !== rhythm.rotationInterval) {
        diff.rotationInterval = localRhythm.rotationInterval;
      }
      if (localRhythm.inversionInterval !== rhythm.inversionInterval) {
        diff.inversionInterval = localRhythm.inversionInterval;
      }
      if (localRhythm.inversionMode !== rhythm.inversionMode) {
        diff.inversionMode = localRhythm.inversionMode;
      }
      if (localRhythm.reflectionAxis !== rhythm.reflectionAxis) {
        diff.reflectionAxis = localRhythm.reflectionAxis;
      }
      if (Object.keys(diff).length > 0) {
        onRhythmChange(diff);
      }
    }

    onChange(newLoopType);
    onClose();
  }

  function handleConfirm() {
    if (selectionCount === 0 || !isImplemented) return;
    // Guest-gated combo routes to sign-up instead of applying.
    if (guestLock.locked) {
      hapticService?.trigger("selection");
      onRequestSignup?.(guestLock.kind);
      return;
    }
    if (rhythmGate && !rhythmGate.ok) return;
    hapticService?.trigger("selection");
    applyAndClose();
  }

  function handleClose() {
    hapticService?.trigger("selection");
    onClose();
  }

  function handleDisableLoop() {
    hapticService?.trigger("selection");
    onLoopDisable?.();
  }
</script>

<div
  bind:this={overlayElement}
  class="loop-expanded-overlay"
  class:combo-mode={isMultiSelectMode}
  transition:scale={{
    start: entrance === "none" ? 1 : 0.95,
    duration: entrance === "none" ? 0 : motionDuration(DURATION.emphasis),
    easing: quintOut,
  }}
>
  <LoopOverlayHeader
    {titleId}
    onClose={handleClose}
    onDisable={onLoopDisable ? handleDisableLoop : undefined}
  />

  {#snippet modeSelector()}
    <SegmentedControl
      options={[
        { value: "single", label: "Single" },
        { value: "combo", label: "Combo" },
      ]}
      value={isMultiSelectMode ? "combo" : "single"}
      onchange={(v) => handleModeChange(v === "combo")}
      size="sm"
      color="accent"
    />
  {/snippet}

  {#snippet configurator(
    component: LOOPComponent,
    idPrefix: string,
    includeStatus = false
  )}
    <LoopRhythmConfigurator
      {component}
      rhythm={localRhythm}
      {inversionCaption}
      statusReason={includeStatus && rhythmGate && !rhythmGate.ok
        ? rhythmGate.reason
        : undefined}
      {idPrefix}
      onChange={updateRhythm}
    />
  {/snippet}

  {#snippet desktopRotationConfigurator()}
    {@render configurator(LOOPComponent.ROTATED, "desktop")}
  {/snippet}

  {#snippet desktopInversionConfigurator()}
    {@render configurator(LOOPComponent.INVERTED, "desktop")}
  {/snippet}

  {#snippet desktopReflectionConfigurator()}
    {@render configurator(LOOPComponent.MIRRORED, "desktop")}
  {/snippet}

  {#snippet desktopSingleRotationConfigurator()}
    {@render configurator(LOOPComponent.ROTATED, "desktop-single", true)}
  {/snippet}

  {#snippet desktopSingleInversionConfigurator()}
    {@render configurator(LOOPComponent.INVERTED, "desktop-single", true)}
  {/snippet}

  {#snippet desktopSingleReflectionConfigurator()}
    {@render configurator(LOOPComponent.MIRRORED, "desktop-single", true)}
  {/snippet}

  {#snippet loopDetail(idPrefix: string)}
    {#if detailInfo}
      <LoopDetailPanel
        detail={detailInfo}
        rhythm={localRhythm}
        {inversionCaption}
        {rhythmGate}
        {isMultiSelectMode}
        {idPrefix}
        onBack={closeConfigurator}
        onRhythmChange={updateRhythm}
      />
    {/if}
  {/snippet}

  {#if isMultiSelectMode}
    {@render modeSelector()}

    <!-- Combo keeps its attached desktop configurators because several
         selections and settings are reviewed together before Apply. -->
    <div
      class="grid-container desktop-loop-grid themed-scrollbar"
      bind:this={gridContainerElement}
    >
      <LOOPComponentGrid
        selectedComponents={localSelectedComponents}
        {disabledComponents}
        {lockedComponents}
        {isMultiSelectMode}
        {layout}
        componentConfigurators={{
          [LOOPComponent.ROTATED]:
            rhythm && onRhythmChange ? desktopRotationConfigurator : undefined,
          [LOOPComponent.INVERTED]:
            rhythm && onRhythmChange ? desktopInversionConfigurator : undefined,
          [LOOPComponent.MIRRORED]:
            rhythm && onRhythmChange
              ? desktopReflectionConfigurator
              : undefined,
        }}
        expandedComponents={new Set([
          ...(canConfigureRotation ? [LOOPComponent.ROTATED] : []),
          ...(canConfigureInversion ? [LOOPComponent.INVERTED] : []),
          ...(canConfigureReflection ? [LOOPComponent.MIRRORED] : []),
        ])}
        onToggleComponent={handleToggle}
      />
    </div>

    <div class="mobile-loop-stage">
      {#key detailView}
        <div
          class="loop-stage-layer"
          in:fly={{
            x: detailInfo ? 32 : -32,
            duration: motionDuration(DURATION.normal),
            easing: quintOut,
          }}
        >
          {#if detailInfo}
            {@render loopDetail("mobile-combo")}
          {:else}
            <div class="mobile-loop-picker">
              <LOOPComponentGrid
                selectedComponents={localSelectedComponents}
                {disabledComponents}
                {lockedComponents}
                {isMultiSelectMode}
                layout="grid"
                {configurableComponents}
                onConfigureComponent={openConfigurator}
                onToggleComponent={handleToggle}
              />
              <p class="mobile-picker-hint">
                Tap a LOOP to select it. Use
                <FontAwesomeIcon icon="fas fa-sliders" size="0.85em" />
                to change its settings.
              </p>
            </div>
          {/if}
        </div>
      {/key}
    </div>
  {:else}
    <!-- A desktop selection expands the card the user already touched. The
         identity stays put while its controls reveal and the other LOOP types
         slide around it, keeping the full-height drawer meaningfully occupied. -->
    <div class="desktop-single-stack">
      {@render modeSelector()}
      <div
        class="grid-container desktop-single-grid themed-scrollbar"
        bind:this={gridContainerElement}
      >
        <LOOPComponentGrid
          selectedComponents={localSelectedComponents}
          {disabledComponents}
          {lockedComponents}
          {isMultiSelectMode}
          {layout}
          componentConfigurators={{
            [LOOPComponent.ROTATED]:
              rhythm && onRhythmChange
                ? desktopSingleRotationConfigurator
                : undefined,
            [LOOPComponent.INVERTED]:
              rhythm && onRhythmChange
                ? desktopSingleInversionConfigurator
                : undefined,
            [LOOPComponent.MIRRORED]:
              rhythm && onRhythmChange
                ? desktopSingleReflectionConfigurator
                : undefined,
          }}
          expandedComponents={configurableComponents}
          onToggleComponent={handleToggle}
        />
      </div>
    </div>

    <!-- Narrow drawers keep the deliberate two-level flow. The old layer is
         removed synchronously and the next layer pushes in directionally, so
         there is never a ghosted duplicate under the live controls. -->
    <div class="single-loop-stage">
      {#key detailView}
        <div
          class="loop-stage-layer"
          in:fly={{
            x: detailInfo ? 32 : -32,
            duration: motionDuration(DURATION.normal),
            easing: quintOut,
          }}
        >
          {#if detailInfo}
            {@render loopDetail("single")}
          {:else}
            <div class="single-loop-picker">
              {@render modeSelector()}
              <div class="single-loop-grid-shell themed-scrollbar">
                <LOOPComponentGrid
                  selectedComponents={localSelectedComponents}
                  {disabledComponents}
                  {lockedComponents}
                  {isMultiSelectMode}
                  layout="grid"
                  onToggleComponent={handleToggle}
                />
              </div>
            </div>
          {/if}
        </div>
      {/key}
    </div>
  {/if}

  {#if isMultiSelectMode}
    <LoopSelectionSummary
      {wordMathText}
      {specWire}
      {explanationText}
      {isImplemented}
      {selectionCount}
      {guestLock}
      {rhythmGate}
      {buttonText}
      onConfirm={handleConfirm}
    />
  {/if}
</div>

<style>
  .loop-expanded-overlay {
    position: absolute;
    inset: 0;
    z-index: 100;

    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;

    /* Solid background matching the card theme */
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent-strong, #6366f1) 25%, #1a1a2e) 0%,
      color-mix(in srgb, var(--theme-accent, #818cf8) 15%, #1a1a2e) 50%,
      color-mix(in srgb, var(--theme-accent-strong, #6366f1) 20%, #1a1a2e) 100%
    );
    border-radius: 16px;
    border: 2px solid color-mix(in srgb, var(--theme-accent) 50%, transparent);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 24px color-mix(in srgb, var(--theme-accent) 30%, transparent);

    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
  }

  .grid-container {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-anchor: none;
    overscroll-behavior: contain;
  }

  .mobile-loop-stage {
    display: none;
  }

  .desktop-single-stack {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    flex-direction: column;
    gap: 10px;
  }

  .desktop-single-grid {
    flex: 1 1 auto;
  }

  .mobile-loop-stage,
  .single-loop-stage {
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  .single-loop-stage {
    display: none;
    flex: 1 1 auto;
  }

  .loop-stage-layer {
    position: absolute;
    inset: 0;
    display: flex;
    min-height: 0;
    flex-direction: column;
  }

  .mobile-loop-picker,
  .single-loop-picker {
    height: 100%;
    min-height: 0;
  }

  .single-loop-picker {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .single-loop-grid-shell {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    align-items: stretch;
    overflow-y: auto;
    overflow-anchor: none;
    overscroll-behavior: contain;
  }

  .single-loop-grid-shell :global(.loop-component-grid) {
    width: 100%;
  }

  .mobile-loop-picker {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 12px;
  }

  /* Six tracks preserve the three-card first row while giving the two-card
     second row equal breathing room on both sides. Every card still spans the
     same two tracks, so nothing changes size between rows. */
  .mobile-loop-picker :global(.loop-component-grid) {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .mobile-loop-picker :global(.loop-component-shell) {
    grid-column: span 2;
  }

  .mobile-loop-picker :global(.loop-component-shell:nth-child(4)) {
    grid-column: 2 / span 2;
  }

  .mobile-loop-picker :global(.loop-component-shell:nth-child(5)) {
    grid-column: 4 / span 2;
  }

  .mobile-picker-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
    text-align: center;
  }

  /* Below the side-by-side breakpoint the bottom nav overlaps the sheet's
     foot (the drawer content reserves clearance for it) — stick above it. */
  @media (max-width: 768px) {
    .desktop-loop-grid,
    .desktop-single-stack {
      display: none;
    }

    .mobile-loop-stage,
    .single-loop-stage {
      display: block;
      width: 100%;
      height: clamp(260px, 45dvh, 320px);
      flex: 0 0 clamp(260px, 45dvh, 320px);
      min-height: 0;
      overflow: hidden;
    }

    .mobile-loop-picker :global(.loop-component-grid),
    .single-loop-picker :global(.loop-component-grid) {
      grid-auto-rows: 76px;
      gap: 8px;
    }

    .mobile-loop-picker :global(.loop-component-shell),
    .mobile-loop-picker :global(.loop-component-button),
    .single-loop-picker :global(.loop-component-shell),
    .single-loop-picker :global(.loop-component-button) {
      min-height: 76px;
    }

    .single-loop-picker :global(.loop-component-grid) {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    .single-loop-picker :global(.loop-component-shell) {
      grid-column: span 2;
    }

    .single-loop-picker :global(.loop-component-shell:nth-child(4)) {
      grid-column: 2 / span 2;
    }

    .single-loop-picker :global(.loop-component-shell:nth-child(5)) {
      grid-column: 4 / span 2;
    }
  }

  /* Portrait tablets remain bottom sheets until the shared layout manager
     actually chooses side-by-side mode. Match the Drawer's data-placement
     decision instead of letting a raw width breakpoint expose the desktop
     accordion inside a bottom sheet. */
  @media (min-width: 769px) and (max-width: 1023px) {
    :global(.loop-drawer-sheet[data-placement="bottom"]) .desktop-loop-grid,
    :global(.loop-drawer-sheet[data-placement="bottom"]) .desktop-single-stack {
      display: none;
    }

    :global(.loop-drawer-sheet[data-placement="bottom"]) .mobile-loop-stage,
    :global(.loop-drawer-sheet[data-placement="bottom"]) .single-loop-stage {
      display: block;
      width: 100%;
      height: clamp(260px, 45dvh, 320px);
      flex: 0 0 clamp(260px, 45dvh, 320px);
      min-height: 0;
      overflow: hidden;
    }

    :global(.loop-drawer-sheet[data-placement="bottom"])
      .mobile-loop-picker
      :global(.loop-component-grid),
    :global(.loop-drawer-sheet[data-placement="bottom"])
      .single-loop-picker
      :global(.loop-component-grid) {
      grid-auto-rows: 76px;
      gap: 8px;
    }

    :global(.loop-drawer-sheet[data-placement="bottom"])
      .mobile-loop-picker
      :global(.loop-component-shell),
    :global(.loop-drawer-sheet[data-placement="bottom"])
      .mobile-loop-picker
      :global(.loop-component-button),
    :global(.loop-drawer-sheet[data-placement="bottom"])
      .single-loop-picker
      :global(.loop-component-shell),
    :global(.loop-drawer-sheet[data-placement="bottom"])
      .single-loop-picker
      :global(.loop-component-button) {
      min-height: 76px;
    }

    :global(.loop-drawer-sheet[data-placement="bottom"])
      .single-loop-picker
      :global(.loop-component-grid) {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    :global(.loop-drawer-sheet[data-placement="bottom"])
      .single-loop-picker
      :global(.loop-component-shell) {
      grid-column: span 2;
    }

    :global(.loop-drawer-sheet[data-placement="bottom"])
      .single-loop-picker
      :global(.loop-component-shell:nth-child(4)) {
      grid-column: 2 / span 2;
    }

    :global(.loop-drawer-sheet[data-placement="bottom"])
      .single-loop-picker
      :global(.loop-component-shell:nth-child(5)) {
      grid-column: 4 / span 2;
    }
  }

  /* Landscape phones and short laptop panes may use a right-side drawer, but
     they do not have the vertical room for three open desktop accordions. The
     compact picker owns the remaining height and each settings screen scrolls
     inside that stable stage. */
  @media (min-width: 769px) and (max-height: 700px) {
    :global(.loop-drawer-sheet[data-placement="right"]) .desktop-loop-grid,
    :global(.loop-drawer-sheet[data-placement="right"]) .desktop-single-stack {
      display: none;
    }

    :global(.loop-drawer-sheet[data-placement="right"]) .mobile-loop-stage,
    :global(.loop-drawer-sheet[data-placement="right"]) .single-loop-stage {
      display: block;
      width: 100%;
      height: auto;
      flex: 1 1 0;
      min-height: 188px;
      overflow: hidden;
    }

    :global(.loop-drawer-sheet[data-placement="right"])
      .mobile-loop-picker
      :global(.loop-component-grid),
    :global(.loop-drawer-sheet[data-placement="right"])
      .single-loop-picker
      :global(.loop-component-grid) {
      grid-auto-rows: 68px;
      gap: 6px;
    }

    :global(.loop-drawer-sheet[data-placement="right"])
      .mobile-loop-picker
      :global(.loop-component-shell),
    :global(.loop-drawer-sheet[data-placement="right"])
      .mobile-loop-picker
      :global(.loop-component-button),
    :global(.loop-drawer-sheet[data-placement="right"])
      .single-loop-picker
      :global(.loop-component-shell),
    :global(.loop-drawer-sheet[data-placement="right"])
      .single-loop-picker
      :global(.loop-component-button) {
      min-height: 68px;
    }

    :global(.loop-drawer-sheet[data-placement="right"])
      .single-loop-picker
      :global(.loop-component-grid) {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    :global(.loop-drawer-sheet[data-placement="right"])
      .single-loop-picker
      :global(.loop-component-shell) {
      grid-column: span 2;
    }

    :global(.loop-drawer-sheet[data-placement="right"])
      .single-loop-picker
      :global(.loop-component-shell:nth-child(4)) {
      grid-column: 2 / span 2;
    }

    :global(.loop-drawer-sheet[data-placement="right"])
      .single-loop-picker
      :global(.loop-component-shell:nth-child(5)) {
      grid-column: 4 / span 2;
    }
  }
</style>
