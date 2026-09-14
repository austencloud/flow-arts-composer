<!--
  Drawer.svelte - Minimal, reliable drawer with pure CSS animations

  NO MORE VAUL-SVELTE. Just clean, predictable CSS transforms.

  Features:
  - Slides from right, left, top, or bottom based on placement
  - Smooth CSS transitions that actually work
  - Backdrop support
  - Escape key to close
  - Focus trapping for accessibility (WAI-ARIA compliant)
  - Inert attribute on background content
  - Focus restoration on close
  - Snap points for multi-height drawers
  - Same API as before so nothing breaks
-->
<script lang="ts">
  import "./drawer/Drawer.css";
  import { onMount, onDestroy, untrack, type Snippet } from "svelte";
  import { responsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
  import { SwipeToDismiss } from "./drawer/swipe-to-dismiss";
  import { FocusTrap } from "./drawer/focus-trap";
  import { SnapPoints, type SnapPointValue } from "./drawer/snap-points";
  import { DrawerEffects } from "./drawer/drawer-effects";
  import { shouldDeferEscapeShortcut } from "$lib/shared/keyboard/domain/escape-shortcut-target";
  import {
    generateDrawerId,
    registerDrawer,
    unregisterDrawer,
    isTopDrawer,
  } from "./drawer/drawer-stack";

  type CloseReason = "backdrop" | "escape" | "programmatic";

  let {
    isOpen = $bindable(false),
    closeOnBackdrop = true,
    closeOnEscape = true,
    dismissible = true,
    labelledBy,
    ariaLabel,
    title,
    describedBy,
    role = "dialog",
    showHandle = undefined,
    class: drawerClass = "",
    backdropClass = "",
    placement = "bottom",
    respectLayoutMode = false,
    // Focus trap options
    trapFocus = true,
    initialFocusElement = null,
    focusContainerOnOpen = false,
    returnFocusOnClose = true,
    setInertOnSiblings = true,
    // Snap points options
    snapPoints = null,
    activeSnapPoint = $bindable<number | null>(null),
    closeOnSnapToZero = true,
    // Animation options
    springAnimation = false,
    scaleBackground = false,
    preventScroll = true,
    keepMounted = false,
    // Focus behavior
    autoFocus = true,
    onclose,
    onOpenChange,
    onbackdropclick,
    onDragChange,
    onSnapPointChange,
    children,
  }: {
    isOpen?: boolean;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    dismissible?: boolean;
    labelledBy?: string;
    ariaLabel?: string;
    /**
     * The surface's visible title. Used as the dialog's accessible name when
     * neither `labelledBy` nor `ariaLabel` is supplied, so a drawer that
     * already renders a `DrawerHeader title=...` can name itself by passing the
     * same string here instead of hand-minting an id to point at.
     *
     * This is the naming contract for the primitive: an `aria-modal` dialog
     * with no accessible name is announced as a bare "dialog" (WCAG 2.1 SC
     * 4.1.2). Supply exactly one of `labelledBy`, `ariaLabel` or `title`.
     * Rendered as `aria-label`, never as the `title` attribute, so it adds no
     * native tooltip.
     */
    title?: string;
    /** ID of element that describes the drawer content. For screen reader descriptions. */
    describedBy?: string;
    role?: "dialog" | "menu" | "listbox" | "alertdialog";
    showHandle?: boolean;
    class?: string;
    backdropClass?: string;
    placement?: "bottom" | "top" | "right" | "left";
    respectLayoutMode?: boolean;
    /** Enable focus trapping inside the drawer. Default: true */
    trapFocus?: boolean;
    /** Element to focus when drawer opens. Default: first focusable element */
    initialFocusElement?: HTMLElement | null;
    /**
     * Focus the drawer container itself on open instead of its first focusable
     * control. Avoids a stray `:focus-visible` ring on a header button when the
     * drawer opens. Default: false
     */
    focusContainerOnOpen?: boolean;
    /** Return focus to trigger element when drawer closes. Default: true */
    returnFocusOnClose?: boolean;
    /** Set inert attribute on sibling elements when open. Default: true */
    setInertOnSiblings?: boolean;
    /** Snap points for multi-height drawer (e.g., ["25%", "50%", "90%"] or [200, 400]) */
    snapPoints?: SnapPointValue[] | null;
    /** Current active snap point index (bindable) */
    activeSnapPoint?: number | null;
    /** Close drawer when snapping to index 0. Default: true */
    closeOnSnapToZero?: boolean;
    /** Use spring physics animation (slight bounce). Default: false */
    springAnimation?: boolean;
    /** Scale background content when drawer opens (iOS-like depth effect). Default: false */
    scaleBackground?: boolean;
    /** Prevent body scrolling when drawer is open. Default: true */
    preventScroll?: boolean;
    /** Keep drawer children mounted while closed. Use for stateful tools whose commands remain available outside the drawer. */
    keepMounted?: boolean;
    /** Auto-focus the drawer when it opens. Set to false to keep focus on triggering element. Default: true */
    autoFocus?: boolean;
    onclose?: (event: CustomEvent<{ reason: CloseReason }>) => void;
    onOpenChange?: (open: boolean) => void;
    onbackdropclick?: (event: MouseEvent) => boolean;
    onDragChange?: (
      offset: number,
      progress: number,
      isDragging: boolean
    ) => void;
    /** Called when snap point changes */
    onSnapPointChange?: (index: number, valuePx: number) => void;
    children?: Snippet;
  } = $props();

  let layoutService = responsiveLayoutManager;
  let isSideBySideLayout = $state(false);
  let mounted = $state(false);
  let wasOpen = $state(false);
  let shouldRender = $state(false);
  let isAnimatedOpen = $state(false); // Controls visual state for animations
  let isAnimating = $state(false); // True during open/close animation - blocks swipe gestures
  let pendingCloseReason = $state<CloseReason>("programmatic");
  let closeTimeoutId: ReturnType<typeof setTimeout> | null = null; // Track close animation timeout
  let animatingTimeoutId: ReturnType<typeof setTimeout> | null = null; // Track animation duration

  /**
   * Detect if user prefers reduced motion (WCAG 2.2 / AAA).
   * When true, animations are skipped entirely.
   */
  const prefersReducedMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // Drawer stack management for nested drawers
  const drawerId = generateDrawerId();
  let stackZIndex = $state(50); // Default z-index

  // Reactive state for drag visuals
  let isDragging = $state(false);
  let dragOffsetX = $state(0);
  let dragOffsetY = $state(0);

  // Track if handlers have been initialized (lazy creation)
  let handlersInitialized = $state(false);

  // When respectLayoutMode is true and on mobile, use bottom regardless of specified placement
  // This ensures consistent UX across the app: bottom sheets on mobile, side drawers on desktop
  const effectivePlacement = $derived.by(() => {
    if (respectLayoutMode && !isSideBySideLayout) {
      // Mobile layout: always use bottom for consistent bottom sheet UX
      return "bottom";
    }
    // Desktop/side-by-side layout or no layout awareness: use specified placement
    return placement;
  });

  // The grab bar is a BOTTOM-SHEET affordance: a sheet you pull down off the
  // bottom of the screen, the way every phone sheet works. A side drawer
  // borrowed it and turned it into a 4px white tick floating inside its inner
  // edge, which reads as a stray artifact rather than as something to grab —
  // nothing about a full-height desktop panel says "drag me sideways". So the
  // default is bottom-only, and a side drawer that genuinely wants one opts in
  // with `showHandle`.
  const effectiveShowHandle = $derived(
    showHandle ?? (dismissible && effectivePlacement === "bottom")
  );

  // Internal drag change handler that updates local state AND calls parent callback
  function handleInternalDragChange(
    offset: number,
    progress: number,
    dragging: boolean
  ) {
    isDragging = dragging;
    if (effectivePlacement === "right" || effectivePlacement === "left") {
      dragOffsetX = offset;
      dragOffsetY = 0;
    } else {
      dragOffsetX = 0;
      dragOffsetY = offset;
    }
    // Forward to parent callback
    onDragChange?.(offset, progress, dragging);
  }

  // Handle drag end for snap points - returns true if handled
  function handleDragEnd(
    offset: number,
    velocity: number,
    duration: number
  ): boolean {
    if (!snapPointsInstance || !snapPoints || snapPoints.length === 0) {
      return false; // Let default dismiss logic handle it
    }

    // Calculate target snap point based on gesture
    const targetIndex = snapPointsInstance.snapToClosest(
      offset,
      velocity,
      duration
    );
    snapPointOffset = snapPointsInstance.getTransformOffset();

    // If snapping to index 0 with closeOnSnapToZero, let dismiss handle it
    if (targetIndex === 0 && closeOnSnapToZero) {
      return false; // Will trigger onDismiss
    }

    return true; // Handled - don't trigger default dismiss
  }

  // Swipe-to-dismiss handler - LAZILY CREATED on first open
  // Using native <dialog> element for proper semantic and accessibility support
  let drawerElement = $state<HTMLDialogElement | null>(null);
  let swipeToDismiss = $state<SwipeToDismiss | null>(null);

  // Focus trap handler for accessibility - LAZILY CREATED on first open
  let focusTrap: FocusTrap | null = null;

  // Snap points handler (only created when snapPoints are provided)
  let snapPointsInstance: SnapPoints | null = null;
  let snapPointOffset = $state(0); // Current snap point transform offset
  let currentSnapIndex = $state<number | null>(null);

  // Drawer effects - LAZILY CREATED on first open
  let drawerEffects: DrawerEffects | null = null;

  // Initialize handlers lazily when drawer first opens
  function initializeHandlers() {
    if (handlersInitialized) return;
    handlersInitialized = true;

    swipeToDismiss = new SwipeToDismiss({
      placement: effectivePlacement,
      dismissible,
      drawerId,
      onDismiss: () => {
        isOpen = false;
      },
      onDragChange: handleInternalDragChange,
      onDragEnd: handleDragEnd,
    });

    focusTrap = new FocusTrap({
      initialFocus: initialFocusElement ?? undefined,
      focusContainerOnInitial: focusContainerOnOpen,
      returnFocusOnDeactivate: returnFocusOnClose,
      setInertOnSiblings: setInertOnSiblings,
    });

    drawerEffects = new DrawerEffects({
      scaleBackground,
      preventScroll,
      isAnimatedOpen: false,
    });
  }

  // Update SwipeToDismiss when placement changes (only if already initialized)
  $effect(() => {
    if (!handlersInitialized) return;
    // Recreate swipe handler when placement changes
    swipeToDismiss = new SwipeToDismiss({
      placement: effectivePlacement,
      dismissible,
      drawerId,
      onDismiss: () => {
        isOpen = false;
      },
      onDragChange: handleInternalDragChange,
      onDragEnd: handleDragEnd,
    });
  });

  // Initialize snap handler when snapPoints are provided (only after drawer has opened)
  $effect(() => {
    if (!handlersInitialized) return;
    if (snapPoints && snapPoints.length > 0) {
      snapPointsInstance = new SnapPoints({
        placement: effectivePlacement,
        snapPoints,
        defaultSnapPoint: snapPoints.length - 1, // Start fully open
        onSnapPointChange: (index, valuePx) => {
          currentSnapIndex = index;
          activeSnapPoint = index;
          onSnapPointChange?.(index, valuePx);

          // Close drawer if snapping to zero and closeOnSnapToZero is true
          if (index === 0 && closeOnSnapToZero) {
            isOpen = false;
          }
        },
      });
    } else {
      snapPointsInstance = null;
      snapPointOffset = 0;
      currentSnapIndex = null;
    }
  });

  // Initialize snap handler dimensions when drawer element is available
  // Use viewport dimensions for percentage-based snap points (not drawer's own size)
  $effect(() => {
    if (drawerElement && snapPointsInstance && isAnimatedOpen) {
      // For bottom/top placement, use viewport height for percentages
      // For left/right placement, use viewport width for percentages
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      snapPointsInstance.initialize(viewportWidth, viewportHeight);
      snapPointOffset = snapPointsInstance.getTransformOffset();
    }
  });

  // Layout change subscription cleanup
  let layoutUnsubscribe: (() => void) | null = null;

  // Initialize layout service if responsive layout is enabled
  onMount(() => {
    mounted = true;
    if (keepMounted) shouldRender = true;
    if (respectLayoutMode && layoutService) {
      isSideBySideLayout = layoutService.shouldUseSideBySideLayout();

      layoutUnsubscribe = layoutService.onLayoutChange(() => {
        isSideBySideLayout = layoutService!.shouldUseSideBySideLayout();
      });
    }
  });

  // Cleanup layout subscription
  onDestroy(() => {
    layoutUnsubscribe?.();
  });

  // Track open state changes and notify parent
  $effect(() => {
    // Read wasOpen inside untrack to avoid creating a dependency
    const previouslyOpen = untrack(() => wasOpen);

    if (isOpen !== previouslyOpen) {
      onOpenChange?.(isOpen);

      // When opening, add to DOM in closed state, then animate open
      if (isOpen) {
        // CRITICAL: Cancel any pending timeouts to prevent race conditions
        if (closeTimeoutId !== null) {
          clearTimeout(closeTimeoutId);
          closeTimeoutId = null;
        }
        if (animatingTimeoutId !== null) {
          clearTimeout(animatingTimeoutId);
          animatingTimeoutId = null;
        }

        // Block swipe gestures during animation
        // This prevents conflicts when user's finger is still down from triggering the drawer
        isAnimating = true;

        // LAZY INITIALIZATION: Create handlers on first open
        initializeHandlers();

        // Register with drawer stack and get z-index for nested support
        // Pass dismiss callback so other drawers can trigger dismissal of this one
        stackZIndex = registerDrawer(
          drawerId,
          () => {
            requestClose("escape");
          },
          () => closeOnEscape
        );
        shouldRender = true;
        swipeToDismiss?.reset(); // Reset drag state when opening

        // Helper to complete the open sequence
        const completeOpen = () => {
          // Open the native dialog (non-modal) for proper accessibility tree
          // We use show() not showModal() to keep our custom backdrop and inert handling
          drawerElement?.show();
          isAnimatedOpen = true; // Trigger open animation (or instant show if reduced motion)
          // Activate focus trap after element is in DOM
          if (trapFocus && drawerElement && focusTrap) {
            focusTrap.activate(drawerElement);
          } else if (autoFocus && drawerElement) {
            // Focus the drawer for proper interaction (unless autoFocus is disabled)
            drawerElement.focus();
          }

          // Allow swipe gestures after animation completes (350ms transition)
          animatingTimeoutId = setTimeout(() => {
            isAnimating = false;
          }, 400);
        };

        // Skip RAF timing for users who prefer reduced motion - show instantly
        if (prefersReducedMotion()) {
          isAnimatedOpen = true; // Instant (CSS handles the no-animation)
          isAnimating = false; // No animation, allow gestures immediately
          // Still need to wait for DOM to render the element
          requestAnimationFrame(completeOpen);
        } else {
          isAnimatedOpen = false; // Start closed for animation
          // Force browser to render the closed state first using double-RAF
          requestAnimationFrame(() => {
            requestAnimationFrame(completeOpen);
          });
        }
      }

      // When closing, animate to closed state, then remove from DOM
      if (previouslyOpen && !isOpen) {
        emitClose(pendingCloseReason);
        pendingCloseReason = "programmatic";
        isAnimatedOpen = false; // Trigger close animation
        swipeToDismiss?.reset(); // Reset drag state when closing
        // Deactivate focus trap immediately so focus can return
        focusTrap?.deactivate();
        // Unregister from drawer stack
        unregisterDrawer(drawerId);

        // Helper to complete the close sequence
        const completeClose = () => {
          drawerElement?.close();
          if (!keepMounted) shouldRender = false;
        };

        // Skip animation delay for users who prefer reduced motion - close instantly
        if (prefersReducedMotion()) {
          completeClose();
        } else {
          // Keep in DOM during closing animation (350ms), then remove
          // Store the timeout ID so it can be cancelled if drawer reopens quickly
          closeTimeoutId = setTimeout(completeClose, 400); // var(--duration-dramatic) transition + 50ms buffer
        }
      }

      // Update wasOpen without creating a new dependency
      untrack(() => {
        wasOpen = isOpen;
      });
    }
  });

  function emitClose(reason: CloseReason) {
    if (onclose) {
      onclose(new CustomEvent("close", { detail: { reason } }));
    }
  }

  function requestClose(reason: CloseReason) {
    pendingCloseReason = reason;
    isOpen = false;
  }

  function handleBackdropClick(event: MouseEvent) {
    // If custom handler provided, use it to determine whether to close
    if (onbackdropclick) {
      const shouldClose = onbackdropclick(event);
      if (shouldClose) {
        requestClose("backdrop");
      }
      return;
    }

    // Default behavior
    if (closeOnBackdrop) {
      requestClose("backdrop");
    }
  }

  // Handle escape key - only close if this is the topmost drawer.
  //
  // `shouldDeferEscapeShortcut` is the same guard `handleDialogCancel` below
  // already applies, and the same one the global `global.escape` owner uses
  // (register-escape-shortcut.ts). Without it here, this window-level handler
  // took the first Escape press away from a focused input, combobox, menu or
  // expanded control inside the drawer — closing the whole sheet when the user
  // meant to cancel the field they were typing in. That contradicts ownership
  // rule 1 in docs/architecture/escape-routing.md, and it made the drawer the
  // only surface in the app that ignored the deferral every other Escape owner
  // honours.
  function handleKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if (shouldDeferEscapeShortcut(document)) return;

    if (
      event.key === "Escape" &&
      closeOnEscape &&
      isOpen &&
      isTopDrawer(drawerId)
    ) {
      event.preventDefault();
      requestClose("escape");
    }
  }

  /**
   * Handle native dialog `cancel` event (Escape key fires this on <dialog>).
   * This is a backup to our custom keydown handler for browsers that fire
   * the cancel event before our handler can preventDefault.
   */
  function handleDialogCancel(event: Event) {
    if (
      event.defaultPrevented ||
      shouldDeferEscapeShortcut(document) ||
      !closeOnEscape ||
      !isTopDrawer(drawerId)
    ) {
      event.preventDefault(); // Don't close if not allowed or not top drawer
      return;
    }
    // Let it close naturally - our close logic will handle cleanup
    requestClose("escape");
  }

  // `labelledBy` wins when the consumer points at real header markup; `title`
  // is the fallback for the common case where the visible name is a plain
  // string the consumer already has. Resolving to `undefined` leaves the
  // attribute off entirely rather than emitting an empty name.
  const resolvedAriaLabel = $derived(
    labelledBy ? undefined : (ariaLabel ?? title ?? undefined)
  );

  // Compute state attribute for CSS - use animated state for visual transitions
  const dataState = $derived(isAnimatedOpen ? "open" : "closed");

  // Compute full class names
  const overlayClasses = $derived(
    `drawer-overlay ${backdropClass} ${respectLayoutMode && isSideBySideLayout ? "side-by-side-layout" : ""}`.trim()
  );

  const contentClasses = $derived(
    `drawer-content ${drawerClass} ${respectLayoutMode && isSideBySideLayout ? "side-by-side-layout" : ""}`.trim()
  );

  // Compute transform including drag offset and snap point offset
  const computedTransform = $derived.by(() => {
    // During drag, show drag offset
    if (isDragging && (dragOffsetY !== 0 || dragOffsetX !== 0)) {
      const isHorizontal =
        effectivePlacement === "left" || effectivePlacement === "right";
      if (isHorizontal) {
        return `translateX(${dragOffsetX + snapPointOffset}px)`;
      } else {
        return `translateY(${dragOffsetY + snapPointOffset}px)`;
      }
    }

    // When not dragging, show snap point offset if snap points are active
    if (snapPointOffset !== 0 && isAnimatedOpen) {
      const isHorizontal =
        effectivePlacement === "left" || effectivePlacement === "right";
      if (isHorizontal) {
        return `translateX(${snapPointOffset}px)`;
      } else {
        return `translateY(${snapPointOffset}px)`;
      }
    }

    return "";
  });

  // Update focus trap options when props change (only if initialized)
  $effect(() => {
    if (!focusTrap) return;
    focusTrap.updateOptions({
      initialFocus: initialFocusElement,
      focusContainerOnInitial: focusContainerOnOpen,
      returnFocusOnDeactivate: returnFocusOnClose,
      setInertOnSiblings: setInertOnSiblings,
    });
  });

  // Attach/detach swipe handler when element changes
  $effect(() => {
    if (drawerElement && swipeToDismiss) {
      swipeToDismiss.attach(drawerElement);
    }
    return () => {
      swipeToDismiss?.detach();
    };
  });

  // Disable swipe gestures during animation to prevent conflicts
  // This fixes the issue where holding finger down from long-press trigger
  // causes jank as the swipe handler fights with the opening animation
  $effect(() => {
    swipeToDismiss?.setDisabled(isAnimating);
  });

  // Update drawer effects (only if initialized)
  $effect(() => {
    if (!drawerEffects) return;
    drawerEffects.update({
      scaleBackground,
      preventScroll,
      isAnimatedOpen,
    });
  });

  // Clean up on component destroy
  onDestroy(() => {
    swipeToDismiss?.detach();
    focusTrap?.deactivate();
    drawerEffects?.cleanup();
    // Unregister from drawer stack
    unregisterDrawer(drawerId);
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if mounted && shouldRender}
  <!-- Backdrop -->
  <div
    class={overlayClasses}
    data-state={dataState}
    onclick={handleBackdropClick}
    aria-hidden="true"
    style:z-index={stackZIndex - 1}
  ></div>

  <!-- Drawer content - uses native <dialog> for proper semantics and accessibility -->
  <dialog
    bind:this={drawerElement}
    class={contentClasses}
    class:dragging={isDragging}
    class:has-snap-points={snapPoints && snapPoints.length > 0}
    class:spring-animation={springAnimation}
    data-placement={effectivePlacement}
    data-state={dataState}
    data-snap-index={currentSnapIndex}
    data-drawer-id={drawerId}
    tabindex="-1"
    aria-modal="true"
    aria-labelledby={labelledBy}
    aria-label={resolvedAriaLabel}
    aria-describedby={describedBy}
    oncancel={handleDialogCancel}
    style:z-index={stackZIndex}
    style:transform={computedTransform || undefined}
    style:transition={isDragging ? "none" : ""}
  >
    {#if effectiveShowHandle}
      <div class="drawer-handle" aria-hidden="true"></div>
    {/if}
    <div class="drawer-inner">
      {@render children?.()}
    </div>
  </dialog>
{/if}

<style>
  /*
   * The <dialog> is a non-interactive focus entry point: focus lands here on
   * open (see FocusTrap.focusContainerOnInitial) so no header control lights up
   * a :focus-visible ring. Suppress the container's own ring — the global
   * `*:focus-visible` rule would otherwise outline the whole drawer. Real
   * controls inside still show focus rings when the user Tabs to them.
   */
  dialog.drawer-content:focus,
  dialog.drawer-content:focus-visible {
    outline: none;
  }
</style>
