<!--
  AccountSetupWizard - Post-signup overlay for accounts that still need a
  display name. Magic-link accounts skip this overlay and enter Create.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import AccountSetupStep from "./AccountSetupStep.svelte";
  import { FocusTrap } from "#lib/shared/foundation/ui/drawer/focus-trap.js";

  interface Props {
    forcePreview?: boolean;
    onComplete: () => void;
  }

  const { forcePreview = false, onComplete }: Props = $props();

  let animateIn = $state(false);
  let wizardEl = $state<HTMLDivElement | null>(null);

  onMount(() => {
    requestAnimationFrame(() => {
      animateIn = true;
    });
  });

  // Trap focus inside the wizard while it's open: focus moves to the wizard
  // container on open, Tab is trapped within, everything else (MainInterface
  // behind it) goes inert, and focus returns to the trigger on close. Empty
  // inertExclusions — full-page blocking takeover, matches ErrorModal.
  const focusTrap = new FocusTrap({
    focusContainerOnInitial: true,
    inertExclusions: [],
  });

  $effect(() => {
    if (!wizardEl) return;
    focusTrap.activate(wizardEl);
    return () => focusTrap.deactivate();
  });
</script>

<div
  class="account-setup-wizard"
  class:animate-in={animateIn}
  bind:this={wizardEl}
  role="dialog"
  aria-modal="true"
  aria-labelledby="account-setup-title"
  tabindex="-1"
>
  <div class="step-container">
    <AccountSetupStep {forcePreview} {onComplete} />
  </div>
</div>

<style>
  .account-setup-wizard {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.4));
    z-index: var(--z-priority);
    overflow-y: auto;
  }

  /* Programmatic focus target (tabindex=-1) — the wizard container is the
     dialog root, not an interactive control, so suppress the focus ring the
     global `:focus-visible` rule would otherwise draw around the whole
     overlay. Matches Drawer.svelte / TutorialPrompt.svelte. */
  .account-setup-wizard:focus,
  .account-setup-wizard:focus-visible {
    outline: none;
  }

  .step-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 600px;
    padding: 0 16px;
  }

  .account-setup-wizard :global(.account-setup-step) {
    opacity: 0;
    transform: translateY(20px);
    transition:
      opacity 0.4s ease,
      transform 0.4s ease;
  }

  .account-setup-wizard.animate-in :global(.account-setup-step) {
    opacity: 1;
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .account-setup-wizard :global(.account-setup-step) {
      transition: none;
      opacity: 1;
      transform: none;
    }
  }
</style>
