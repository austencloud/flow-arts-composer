<!--
  AssembleToolPanel - Tool panel content for the Assemble tab.

  The grid stays anchored while phase-specific controls update in reserved slots.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import type { AssembleTabState } from "../../shared/state/assemble-tab-state.svelte";
  import BuilderInstructionHeader from "$lib/features/assemble-lab/components/BuilderInstructionHeader.svelte";
  import BuilderControls from "$lib/features/assemble-lab/components/BuilderControls.svelte";
  import InteractiveGrid from "$lib/features/assemble-lab/components/InteractiveGrid.svelte";
  import { attachAssembleKeyboard } from "$lib/features/assemble-lab/services/assemble-keyboard-dispatcher";
  import type { SettingsState } from "$lib/shared/settings/state/settings-state.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import { resolveAccessTier } from "$lib/shared/auth/domain/access-tier";
  import { isPremiumOrAbove } from "$lib/shared/auth/domain/models/user-role";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { motionDuration } from "$lib/shared/transitions/motion";

  const props: { tabState: AssembleTabState } = $props();

  const builderState = $derived(props.tabState.assembleBuilderState);
  let builderSurfaceRef: HTMLDivElement | null = $state(null);

  $effect(() => {
    const plan = builderState.historyTransition;
    const epoch = builderState.historyTransitionEpoch;
    if (!plan || !builderSurfaceRef || epoch === 0 || !plan.affectsControls) {
      return;
    }

    const duration = motionDuration(240);
    if (duration === 0) return;
    const targets = builderSurfaceRef.querySelectorAll<HTMLElement>(
      ".header-section, .builder-controls-overlay, .action-row"
    );
    const animations = Array.from(targets).map((target) =>
      target.animate(
        [
          { opacity: 0.62, transform: "translateY(-3px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        {
          duration,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        }
      )
    );
    return () => animations.forEach((animation) => animation.cancel());
  });

  // Auth/tier state for step cap enforcement
  const accessTier = $derived(
    resolveAccessTier(
      authState.isAuthenticated,
      authState.isAnonymous,
      isPremiumOrAbove(authState.role)
    )
  );
  /**
   * Called by InteractiveGrid before adding a motion.
   * Returns true to block the action.
   *
   * Guests go straight to the auth screen, whose contextual step-cap copy
   * carries the why — no intermediate nudge (Austen, 2026-08-10). Signed-in
   * users get direct feedback instead of a screen advertising an unavailable
   * upgrade.
   *
   * A completed step = one paired step (one on each hand).
   * We cap when the current paired step count would reach the tier limit.
   */
  function checkStepCap(): boolean {
    const sequenceId = props.tabState.sequenceState?.currentSequence?.id;
    const maxSteps = authDrawerState.guestEncore.maxSteps(
      accessTier,
      sequenceId
    );
    // Completed steps = min of both hands' step counts (each pair = one step)
    const pairedSteps = Math.min(
      builderState.leftSteps.length,
      builderState.rightSteps.length
    );
    if (pairedSteps >= maxSteps) {
      if (accessTier === "guest") {
        authDrawerState.show("signup", "step-cap-guest", sequenceId);
      } else {
        toast.info(`Assemble supports up to ${maxSteps} steps.`, 4000);
      }
      return true;
    }
    return false;
  }

  // Numpad building: while keyboard mode is on, route numpad input through the
  // shared dispatcher. Mounting is scoped to the active Assemble tab (the
  // {#key activeToolPanel} in CreationToolPanelSlot unmounts this on tab switch),
  // so the window listener never leaks into other Create tabs. Location adds go
  // through checkStepCap so the numpad respects the tier cap like mouse clicks.
  $effect(() => {
    if (!builderState.keyboardMode) return;
    return attachAssembleKeyboard(builderState, {
      onStepCapExceeded: checkStepCap,
      isModalOpen: () => authDrawerState.open,
    });
  });

  // Load last-used grid preferences from settings.
  // Wrapped in $effect.pre so tabState is read reactively (avoids state_referenced_locally).
  //
  // The setGridMode/setShowCenter calls MUST be untracked. They read builder state
  // (steps, currentPosition, showCenter) and end in notifyDocumentChange(), which
  // reads AND writes sequenceState.currentSequence with a fresh object every call.
  // Left tracked, this effect invalidates itself the moment a start location exists,
  // which is exactly what the first grid click creates -> effect_update_depth_exceeded.
  let settingsState: SettingsState | null = null;
  $effect.pre(() => {
    try {
      settingsState = settingsService as SettingsState;
      const saved = settingsState.currentSettings;
      const preferredGridMode = saved.preferredGridMode;
      const preferredShowCenter = saved.preferredShowCenter;
      untrack(() => {
        if (preferredGridMode) {
          props.tabState.assembleBuilderState.setGridMode(preferredGridMode);
        }
        if (preferredShowCenter) {
          props.tabState.assembleBuilderState.setShowCenter(
            preferredShowCenter
          );
        }
      });
    } catch {
      // Settings unavailable - use defaults
    }
  });

  // Persist grid mode changes for next session
  $effect(() => {
    const mode = builderState.gridMode;
    const center = builderState.showCenter;
    if (settingsState) {
      void settingsState.updateSetting("preferredGridMode", mode);
      void settingsState.updateSetting("preferredShowCenter", center);
    }
  });
</script>

<div class="assemble-tool-panel">
  {#if props.tabState.hasError}
    <div class="restore-error" role="alert">
      Couldn't restore your saved Assemble work. You can keep building, but this
      session may not save.
    </div>
  {/if}

  <div
    bind:this={builderSurfaceRef}
    class="builder-surface"
    data-history-direction={builderState.historyTransition?.direction}
  >
    <div class="header-section">
      <BuilderInstructionHeader {builderState} />
    </div>

    <div class="main-area">
      <div class="grid-slot">
        <div class="stage-slot">
          <InteractiveGrid {builderState} onStepCapExceeded={checkStepCap} />
        </div>
        <BuilderControls {builderState} />
      </div>
    </div>
  </div>
</div>

<style>
  .assemble-tool-panel {
    --assemble-builder-surface: color-mix(
      in srgb,
      var(--theme-panel-bg, #10141f) 78%,
      transparent
    );
    --assemble-builder-surface-raised: color-mix(
      in srgb,
      var(--theme-panel-bg, #10141f) 86%,
      transparent
    );
    --assemble-builder-stroke: color-mix(
      in srgb,
      var(--theme-stroke, rgba(255, 255, 255, 0.12)) 74%,
      transparent
    );
    --assemble-text-secondary: color-mix(
      in srgb,
      var(--theme-text, #fff) 84%,
      transparent
    );
    --assemble-text-tertiary: color-mix(
      in srgb,
      var(--theme-text, #fff) 72%,
      transparent
    );
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    position: relative;
    padding: 0;
    gap: 0;
  }

  .builder-surface {
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    min-height: 0;
    margin: 0;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: linear-gradient(
      180deg,
      var(--assemble-builder-surface-raised),
      var(--assemble-builder-surface)
    );
    box-shadow: none;
  }

  .header-section {
    width: 100%;
    flex-shrink: 0;
  }

  .main-area {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 0;
    min-width: 0;
  }

  .grid-slot {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    width: 100%;
    max-width: none;
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    justify-items: center;
  }

  .stage-slot {
    grid-row: 2;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: start center;
    container-type: size;
    container-name: assemble-stage;
  }

  .restore-error {
    flex: 0 0 auto;
    margin: 0 auto;
    width: min(100%, 720px);
    padding: var(--settings-spacing-sm, 8px) var(--settings-spacing-md, 12px);
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-error, var(--prop-red)) 45%,
        transparent
      );
    border-radius: var(--settings-radius-md, 12px);
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--prop-red)) 10%,
      transparent
    );
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    text-align: center;
  }

  @container tool-panel (max-width: 768px) {
    .assemble-tool-panel {
      padding: 0;
      gap: 0;
    }

    .builder-surface {
      width: 100%;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }

    .main-area {
      flex-direction: column;
      gap: 0;
    }

    .grid-slot {
      width: 100%;
    }

    .grid-slot {
      grid-template-rows: minmax(0, 1fr);
    }

    .stage-slot {
      grid-row: 1;
    }

    .stage-slot {
      place-items: center;
    }

    .header-section {
      display: none;
    }
  }

  /* Native 4K/TV viewports do not receive Windows display scaling. Raise the
     builder's local control and type tokens so the workflow remains readable
     and clickable across the room without changing the two-panel composition. */
  @media (min-width: 2600px) {
    .assemble-tool-panel {
      --font-size-compact: 16px;
      --font-size-min: 18px;
      --min-touch-target: 58px;
      --assemble-instruction-size: 22px;
      --assemble-hand-heading-size: 20px;
      --assemble-hand-label-size: 21px;
      --assemble-action-size: 19px;
      --assemble-step-badge-size: 22px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .main-area {
      transition: none;
    }
  }
</style>
