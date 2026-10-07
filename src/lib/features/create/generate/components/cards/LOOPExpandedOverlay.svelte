<!--
LOOPExpandedOverlay.svelte - Expanded LOOP selection that covers the card grid
Animates forward in z-axis and expands to fill the container space
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { scale } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { onMount, tick } from "svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    generateLOOPType,
    buildLoopSpec,
    effectiveInversionInterval,
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
  import LoopOverlayHeader from "./LoopOverlayHeader.svelte";
  import LoopRhythmConfigurator from "./LoopRhythmConfigurator.svelte";
  import LoopSelectionSummary from "./LoopSelectionSummary.svelte";
  import {
    loopComponentLabel,
    loopComponentDescription,
  } from "../loop-component-presentation";
  import { describeCreateTnDSelection } from "./tnd-presentation";
  import {
    buildLoopOverlayModel,
    normalizeReflectionSelection,
    type LoopRhythmValue,
  } from "./loop-expanded-overlay-model";
  import type { TnDSelection } from "$lib/shared/create/domain/hand-relationship";

  let {
    currentType,
    selectedComponents,
    onChange,
    onClose,
    entrance = "scale",
    titleId,
    onLoopDisable,
    rhythm,
    sequenceLength,
    onRhythmChange,
    guestMaxLength,
    onRequestSignup,
    handRelationship,
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
    /** The hand mode from the TnD card; reflection modes narrow the LOOP
        choices here. Absent reads as Free (legacy callers unaffected). */
    handRelationship?: TnDSelection;
  }>();

  let hapticService: HapticFeedback | null = null;
  let overlayElement: HTMLDivElement;
  let drawerHeightAnimation: Animation | null = null;
  let pendingCloseTimer: ReturnType<typeof setTimeout> | null = null;
  // A reopened multi-component combo lands on the Combo screen it was applied
  // from, not back on Single (the overlay remounts per open — props are nulled
  // on close — so mount-time init is the reopen path).
  let isMultiSelectMode = $state(selectedComponents.size > 1);
  let localSelectedComponents = $state(new Set<LOOPComponent>());

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
    return () => {
      drawerHeightAnimation?.cancel();
      if (pendingCloseTimer !== null) clearTimeout(pendingCloseTimer);
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
      detailComponent: null,
      sequenceLength,
      guestMaxLength,
      handRelationship,
    })
  );
  const explanationText = $derived.by(() => {
    const components = Array.from(localSelectedComponents);
    if (components.length === 0)
      return t("create_deep_loop_select_explanation");
    if (components.length === 1)
      return loopComponentDescription(components[0]!);
    return t("create_deep_loop_combo_explanation", {
      components: components.map(loopComponentLabel).join(" + "),
    });
  });
  const isImplemented = $derived(overlayModel.isImplemented);
  const disabledComponents = $derived(overlayModel.disabledComponents);
  const disabledReasons = $derived.by(() => {
    const reasons = { ...overlayModel.disabledReasons };
    for (const component of Object.keys(reasons) as LOOPComponent[]) {
      reasons[component] = t("create_deep_loop_incompatible_hands", {
        hands: describeCreateTnDSelection(handRelationship ?? "free"),
      });
    }
    return reasons;
  });
  const reflectionAxisOptions = $derived(overlayModel.reflectionAxisOptions);
  const quarteredAvailable = $derived(overlayModel.quarteredAvailable);
  const selectionCount = $derived(overlayModel.selectionCount);
  const configurableComponents = $derived(overlayModel.configurableComponents);
  const specWire = $derived(overlayModel.specWire);
  const rhythmGate = $derived(overlayModel.rhythmGate);
  const guestLock = $derived(overlayModel.guestLock);
  const lockedComponents = $derived(overlayModel.lockedComponents);
  const wordMathText = $derived.by(() => {
    if (!rhythmGate) return null;
    if (!rhythmGate.ok) {
      if (rhythmGate.reason.startsWith("No LOOP type"))
        return t("create_deep_loop_no_match");
      if (rhythmGate.reason.startsWith("Too short"))
        return t("create_deep_loop_too_short");
      const match = rhythmGate.reason.match(
        /^(\d+) beats can't split into (\d+) equal parts$/
      );
      return match?.[1] && match[2]
        ? t("create_deep_loop_cannot_split", {
            beats: match[1],
            parts: match[2],
          })
        : rhythmGate.reason;
    }
    return t("create_deep_loop_word_math", {
      seed: rhythmGate.seedLength,
      multiplier: rhythmGate.multiplier,
      total: sequenceLength ?? 0,
      overlay:
        localSelectedComponents.has(LOOPComponent.INVERTED) &&
        localRhythm.inversionMode === "overlay"
          ? t("create_deep_loop_word_math_overlay")
          : "",
    });
  });
  const inversionCaption = $derived(
    localRhythm.inversionMode === "overlay"
      ? t(
          effectiveInversionInterval(localRhythm) === 4
            ? "create_deep_inversion_quarter_caption"
            : "create_deep_inversion_half_caption"
        )
      : t("create_deep_inversion_expand_caption")
  );
  const buttonText = $derived.by(() => {
    if (selectionCount === 0) return t("create_deep_select_components");
    if (!isImplemented) return t("create_deep_combo_unsupported");
    if (guestLock.locked) return t("create_deep_signup_unlock");
    if (
      selectionCount === 1 &&
      localSelectedComponents.has(LOOPComponent.MIRRORED)
    ) {
      return t("create_deep_apply_reflection", {
        axis:
          localRhythm.reflectionAxis === "north-south"
            ? t("generator_loop_mirrored")
            : localRhythm.reflectionAxis === "east-west"
              ? t("generator_loop_flipped")
              : localRhythm.reflectionAxis === "northeast-southwest"
                ? t("create_deep_ne_sw_reflection")
                : t("create_deep_nw_se_reflection"),
      });
    }
    if (selectionCount === 1) {
      const component = Array.from(localSelectedComponents)[0]!;
      return t("create_deep_apply_component", {
        component: loopComponentLabel(component),
      });
    }
    return t("create_deep_apply_combo", { count: selectionCount });
  });

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

    // Single changes apply immediately; settings stay below stable choices.
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

      if (hasComponentConfigurator(component)) return;

      if (isValid) onClose();
      return;
    }

    // Multi-select mode: Toggle selection
    const newSet = new Set(localSelectedComponents);
    if (newSet.has(component)) {
      newSet.delete(component);
    } else {
      newSet.add(component);
    }
    localSelectedComponents = newSet;
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
    <div class="mode-selector">
      <SegmentedControl
        options={[
          { value: "single", label: t("create_deep_single") },
          { value: "combo", label: t("create_deep_combo") },
        ]}
        value={isMultiSelectMode ? "combo" : "single"}
        onchange={(v) => handleModeChange(v === "combo")}
        size="sm"
        color="accent"
      />
    </div>
  {/snippet}

  <div class="picker-content themed-scrollbar">
    {@render modeSelector()}
    <div class="grid-container">
      <LOOPComponentGrid
        selectedComponents={localSelectedComponents}
        {disabledComponents}
        {disabledReasons}
        {lockedComponents}
        {isMultiSelectMode}
        layout="grid"
        compactChooser
        onToggleComponent={handleToggle}
      />
    </div>

    {#if selectionCount === 1 && !isMultiSelectMode}
      <p class="selection-description">
        {loopComponentDescription(Array.from(localSelectedComponents)[0]!)}
      </p>
    {/if}

    {#if rhythm && onRhythmChange && configurableComponents.size > 0}
      <div class="settings-list">
        {#each [LOOPComponent.ROTATED, LOOPComponent.INVERTED, LOOPComponent.MIRRORED] as component}
          {#if configurableComponents.has(component)}
            <section
              class="settings-section"
              aria-label={loopComponentLabel(component)}
            >
              {#if isMultiSelectMode}
                <h3>{loopComponentLabel(component)}</h3>
              {/if}
              <LoopRhythmConfigurator
                {component}
                rhythm={localRhythm}
                {inversionCaption}
                statusReason={!isMultiSelectMode && rhythmGate && !rhythmGate.ok
                  ? rhythmGate.reason
                  : undefined}
                idPrefix={`loop-${component.toLowerCase()}`}
                {reflectionAxisOptions}
                {quarteredAvailable}
                onChange={updateRhythm}
              />
            </section>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

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
    gap: 12px;
    padding: 16px;
    /* Theme panel washes can be translucent. Give the picker an opaque floor
       so the Generate cards never read through its choices or settings. */
    background:
      linear-gradient(
        var(--theme-panel-bg, rgba(18, 18, 28, 0.98)),
        var(--theme-panel-bg, rgba(18, 18, 28, 0.98))
      ),
      #12141c;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.26);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .picker-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex-shrink: 0;
  }
  .mode-selector {
    width: min(100%, 280px);
    margin-inline: auto;
    flex-shrink: 0;
  }
  .grid-container {
    container-type: inline-size;
    flex-shrink: 0;
    min-width: 0;
  }
  .selection-description {
    align-self: center;
    width: min(100%, 480px);
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
    line-height: 1.45;
  }
  .settings-list {
    display: flex;
    flex-direction: column;
    align-self: center;
    gap: 14px;
    width: min(100%, 480px);
    min-width: 0;
  }
  .settings-section {
    container-type: inline-size;
  }
  .settings-section + .settings-section {
    padding-top: 14px;
    border-top: 1px solid var(--theme-stroke);
  }
  .settings-section h3 {
    margin: 0 0 8px;
    color: var(--theme-text);
    font-size: var(--font-size-sm, 14px);
    font-weight: 700;
  }
  @media (max-width: 768px) {
    .loop-expanded-overlay {
      padding: 12px;
    }
  }
</style>
