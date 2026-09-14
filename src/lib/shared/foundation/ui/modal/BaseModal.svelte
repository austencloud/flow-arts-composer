<!--
  BaseModal.svelte - 2026 Dialog Modal System

  Uses the native <dialog> element with cutting-edge CSS features:
  - @starting-style for entry animations
  - transition-behavior: allow-discrete for exit animations
  - ::backdrop pseudo-element for native backdrop

  Credential forms can opt into an app-managed backdrop. That keeps browser
  extension overlays out of the native modal top layer's inert subtree while
  preserving dialog semantics, pointer blocking, Escape handling, and a
  keyboard focus trap.

  Architecture follows Drawer.svelte patterns:
  - Separate animation state from open state
  - Lazy handler initialization
  - Pure CSS animations with data attributes
-->
<script lang="ts">
  import { onMount, untrack, type Snippet } from "svelte";
  import {
    registerModal,
    unregisterModal,
    isTopModal,
    generateModalId,
  } from "./modal-stack";
  import { FocusTrap } from "../drawer/focus-trap";
  import { FocusRestore, focusFirstOrContainer } from "./helpers/focus-restore";
  import "./modal-tokens.css";

  type CloseReason = "backdrop" | "escape" | "programmatic" | "button";
  type ModalSize = "sm" | "md" | "lg" | "xl" | "full" | "fit" | "module-grid";
  type ModalPosition = "center" | "top";
  type ModalAnimation = "pop" | "slide" | "none";

  interface Props {
    // Control
    open: boolean;
    onclose?: (reason: CloseReason) => void;
    /** Fires after the native dialog enters the top layer successfully. */
    onopened?: () => void;
    /**
     * Fires once the exit animation has finished and the native dialog has
     * left the top layer. `onclose` fires at the start of that exit, while the
     * dialog is still modal: a drawer or other non-top-layer surface opened
     * from `onclose` is painted beneath the closing dialog and made inert by
     * it. Open it from here instead.
     */
    onclosed?: () => void;

    // Behavior
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    restoreFocus?: boolean;
    /**
     * Keep third-party overlays such as password-manager suggestion cards
     * interactive. Uses a non-top-layer dialog with app-managed modality.
     */
    allowExternalOverlays?: boolean;

    // Appearance
    size?: ModalSize;
    position?: ModalPosition;
    animation?: ModalAnimation;

    // Customization
    class?: string;
    labelledBy?: string;
    describedBy?: string;

    // Slots
    children: Snippet;
    header?: Snippet;
    footer?: Snippet;
  }

  let {
    open = $bindable(false),
    onclose,
    onopened,
    onclosed,
    closeOnBackdrop = true,
    closeOnEscape = true,
    restoreFocus = true,
    allowExternalOverlays = false,
    size = "md",
    position = "center",
    animation = "pop",
    class: className = "",
    labelledBy,
    describedBy,
    children,
    header,
    footer,
  }: Props = $props();

  let dialogElement = $state<HTMLDialogElement | null>(null);
  let shouldRender = $state(false);
  let hasEntered = $state(false);
  let isClosing = $state(false);
  let wasOpen = $state(false);
  let modalId = $state(generateModalId());
  let exitTimer: ReturnType<typeof setTimeout> | null = null;

  let focusRestore: FocusRestore | null = null;
  let focusTrap: FocusTrap | null = null;
  let handlersInitialized = false;

  function initializeHandlers() {
    if (handlersInitialized) return;
    handlersInitialized = true;
    focusRestore = new FocusRestore({ enabled: restoreFocus });
    focusTrap = new FocusTrap({
      focusContainerOnInitial: true,
      returnFocusOnDeactivate: false,
      // `aria-modal`, the managed backdrop, and this focus trap provide the
      // modal boundary. Leaving body siblings non-inert is intentional: a
      // password manager mounts its interactive suggestion card outside the
      // application tree and must remain reachable from the credential field.
      setInertOnSiblings: false,
    });
  }

  function closeModal(reason: CloseReason) {
    if (!open) return;

    // Only respond if we're the top modal (for nested modals)
    if (!isTopModal(modalId) && reason !== "programmatic") return;

    open = false;
    onclose?.(reason);
  }

  function handleDialogClose(event: Event) {
    // Native dialog was closed (e.g., via form[method="dialog"])
    closeModal("programmatic");
  }

  function handleDialogCancel(event: Event) {
    // User pressed Escape - native dialog fires this
    if (!closeOnEscape) {
      event.preventDefault();
      return;
    }

    // Only close if we're the top modal
    if (!isTopModal(modalId)) {
      event.preventDefault();
      return;
    }

    closeModal("escape");
  }

  // Track where the pointer went DOWN so a drag that starts inside the modal
  // (e.g. selecting text) and releases over the backdrop is not mistaken for a
  // backdrop click. A native `click` fires on the common ancestor of the down
  // and up targets, which is the <dialog> itself when the up lands on the
  // backdrop — so target-only checking falsely closes the modal.
  let pointerDownOnBackdrop = false;

  function handleBackdropPointerDown(event: PointerEvent) {
    pointerDownOnBackdrop = event.target === dialogElement;
  }

  function handleBackdropClick(event: MouseEvent) {
    if (!closeOnBackdrop) return;

    // Require BOTH the press and the release to be on the backdrop itself.
    if (event.target === dialogElement && pointerDownOnBackdrop) {
      closeModal("backdrop");
    }
  }

  function handleManagedBackdropClick() {
    if (closeOnBackdrop) {
      closeModal("backdrop");
    }
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (
      !allowExternalOverlays ||
      event.key !== "Escape" ||
      event.defaultPrevented ||
      !open ||
      !closeOnEscape ||
      !isTopModal(modalId)
    ) {
      return;
    }

    event.preventDefault();
    closeModal("escape");
  }

  $effect(() => {
    const currentOpen = open;
    const previouslyOpen = untrack(() => wasOpen);

    if (currentOpen === previouslyOpen) return;

    untrack(() => {
      wasOpen = currentOpen;
    });

    if (currentOpen) {
      // Opening — cancel any in-flight exit animation from a prior close
      if (exitTimer !== null) {
        clearTimeout(exitTimer);
        exitTimer = null;
        // Reset exit state in case we're reopening mid-animation
        isClosing = false;
      }

      initializeHandlers();
      focusRestore?.capture();
      shouldRender = true;

      // Register with stack
      registerModal(
        modalId,
        () => closeModal("escape"),
        () => closeOnEscape
      );

      // Wait for DOM, then show modal
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (open && dialogElement && !dialogElement.open) {
            if (allowExternalOverlays) {
              dialogElement.show();
              focusTrap?.activate(dialogElement);
            } else {
              dialogElement.showModal();
            }
            onopened?.();

            // Mark as entered for content animations
            requestAnimationFrame(() => {
              hasEntered = true;
            });
          }
        });
      });
    } else {
      // Closing - trigger exit animation first, then close dialog
      hasEntered = false;
      isClosing = true;

      // Unregister from stack immediately (so escape key goes to next modal)
      unregisterModal(modalId);

      // Wait for exit animation to complete, then actually close the dialog.
      // Track the timer so a reopen within the animation window can cancel it.
      const exitDuration = animation === "none" ? 0 : 200;
      exitTimer = setTimeout(() => {
        exitTimer = null;
        focusTrap?.deactivate();
        if (dialogElement?.open) {
          dialogElement.close();
        }
        isClosing = false;
        shouldRender = false;
        focusRestore?.restore();
        onclosed?.();
      }, exitDuration);
    }
  });

  // ===== Update focus restore when prop changes =====
  $effect(() => {
    focusRestore?.setEnabled(restoreFocus);
  });

  onMount(() => {
    return () => {
      if (exitTimer !== null) {
        clearTimeout(exitTimer);
        exitTimer = null;
      }
      unregisterModal(modalId);
      focusTrap?.deactivate();
      focusRestore?.restore();
    };
  });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if shouldRender}
  {#if allowExternalOverlays}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="base-modal-managed-backdrop"
      data-entered={hasEntered}
      data-closing={isClosing}
      data-animation={animation}
      aria-hidden="true"
      onclick={handleManagedBackdropClick}
    ></div>
  {/if}

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <dialog
    bind:this={dialogElement}
    class="base-modal {className}"
    data-keyboard-shortcuts-ignore
    data-size={size}
    data-position={position}
    data-animation={animation}
    data-entered={hasEntered}
    data-closing={isClosing}
    data-external-overlays={allowExternalOverlays}
    aria-modal="true"
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    onpointerdown={handleBackdropPointerDown}
    onclick={handleBackdropClick}
    onclose={handleDialogClose}
    oncancel={handleDialogCancel}
  >
    <!-- Click barrier to prevent backdrop clicks from triggering on content -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="modal-content-wrapper"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      {#if header}
        <div class="modal-header-slot" data-animate="1">
          {@render header()}
        </div>
      {/if}

      <div class="modal-body">
        {@render children()}
      </div>

      {#if footer}
        <div class="modal-footer-slot">
          {@render footer()}
        </div>
      {/if}
    </div>
  </dialog>
{/if}

<style>
  .base-modal-managed-backdrop {
    position: fixed;
    inset-inline: 0;
    inset-block-start: var(--viewport-offset-top, 0px);
    inset-block-end: var(--viewport-offset-bottom, 0px);
    z-index: var(--z-modal, 600);
    background: var(--modal-backdrop-bg);
    backdrop-filter: blur(var(--modal-backdrop-blur));
    -webkit-backdrop-filter: blur(var(--modal-backdrop-blur));
    opacity: 0;
    transition:
      opacity var(--modal-duration-out) var(--modal-ease-out),
      backdrop-filter var(--modal-duration-out);
  }

  .base-modal-managed-backdrop[data-entered="true"] {
    opacity: 1;
  }

  .base-modal-managed-backdrop[data-closing="true"] {
    opacity: 0;
    backdrop-filter: blur(0);
    -webkit-backdrop-filter: blur(0);
  }

  .base-modal-managed-backdrop[data-animation="none"] {
    transition: none;
  }

  :global(dialog.base-modal[data-external-overlays="true"]) {
    z-index: calc(var(--z-modal, 600) + 1);
  }

  /* Managed mode focuses the dialog shell first so opening the modal does not
     light up an arbitrary control. The shell is only a focus entry point;
     interactive descendants retain their own visible focus indicators. */
  :global(dialog.base-modal[data-external-overlays="true"]:focus),
  :global(dialog.base-modal[data-external-overlays="true"]:focus-visible) {
    outline: none;
  }

  /* Content wrapper - adapts to size variant */
  .modal-content-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 0;
  }

  /* Fixed-size modals: fill the dialog height */
  :global(dialog[data-size="sm"]) .modal-content-wrapper,
  :global(dialog[data-size="md"]) .modal-content-wrapper,
  :global(dialog[data-size="lg"]) .modal-content-wrapper,
  :global(dialog[data-size="xl"]) .modal-content-wrapper,
  :global(dialog[data-size="full"]) .modal-content-wrapper {
    height: 100%;
  }

  /* Fit-size modals: content-driven height */
  :global(dialog[data-size="fit"]) .modal-content-wrapper {
    height: fit-content;
    /* The dialog itself has a viewport cap. Inherit that cap here so the body
       below can become the scroll owner when content grows past the screen. */
    max-height: inherit;
    flex: 0 1 auto;
  }

  /* Header slot */
  .modal-header-slot {
    flex-shrink: 0;
  }

  /* Body - scrollable content area */
  .modal-body {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
  }

  .modal-body {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .modal-body::-webkit-scrollbar {
    width: 8px;
  }

  .modal-body::-webkit-scrollbar-track {
    background: var(--scrollbar-track, transparent);
  }

  .modal-body::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2));
    border-radius: 4px;
  }

  .modal-body::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover, rgba(255, 255, 255, 0.35));
  }

  /* Fixed-size modals: body expands to fill space */
  :global(dialog[data-size="sm"]) .modal-body,
  :global(dialog[data-size="md"]) .modal-body,
  :global(dialog[data-size="lg"]) .modal-body,
  :global(dialog[data-size="xl"]) .modal-body,
  :global(dialog[data-size="full"]) .modal-body {
    flex: 1;
  }

  /* Fit-size modals: body sizes to content */
  :global(dialog[data-size="fit"]) .modal-body {
    /* Stay content-sized while there is room, then shrink and scroll instead
       of overflowing through the dialog's clipped viewport boundary. */
    flex: 0 1 auto;
  }

  /* Footer slot */
  .modal-footer-slot {
    flex-shrink: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .base-modal-managed-backdrop {
      transition: none;
    }
  }
</style>
