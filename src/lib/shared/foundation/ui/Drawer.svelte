<script lang="ts">
  import { onDestroy } from "svelte";
  import { Drawer as SharedDrawer, configureDrawerStack, type CloseReason, type DrawerProps } from "@austencloud/drawer";
  import "./drawer/Drawer.css";
  import { responsiveLayoutManager } from "#lib/shared/create/services/responsive-layout-manager.js";
  import { shouldDeferEscapeShortcut } from "#lib/shared/keyboard/domain/escape-shortcut-target.js";
  import { generateDrawerId, isTopDrawer, registerDrawer, unregisterDrawer } from "./drawer/drawer-stack";
  import { DEFAULT_INERT_EXCLUSIONS } from "./drawer/focus-trap";
  import { holdBackgroundFor } from "#lib/shared/background/shared/state/background-hold.svelte.js";
  import { Z } from "#lib/shared/ui/z-index.js";

  configureDrawerStack({ baseZIndex: Z.DRAWER });

  let {
    isOpen = $bindable(false), closeOnBackdrop = true, closeOnEscape = true,
    dismissible = true, modal = true, dragHandleOnly = false,
    labelledBy, ariaLabel, title, describedBy, role = "dialog", showHandle,
    class: drawerClass = "", backdropClass = "", placement = "bottom",
    responsivePlacement = false, mobileBreakpoint,
    respectLayoutMode = false, trapFocus = true, initialFocusElement = null,
    focusContainerOnOpen = false, returnFocusOnClose = true,
    setInertOnSiblings = true, inertExclusions = [], snapPoints = null,
    activeSnapPoint = $bindable<number | null>(null), closeOnSnapToZero = true,
    resizeWithSnapPoints = false, springAnimation = false,
    scaleBackground = false, preventScroll = true, keepMounted = false,
    holdOpen = false, autoFocus = true, keyboardShortcutsPassthrough = false,
    onclose, onBeforeClose, onOpenChange, onbackdropclick,
    onDragChange, onSnapPointChange, children,
  }: DrawerProps & { respectLayoutMode?: boolean } = $props();

  let sharedDrawer: { requestClose: (reason?: CloseReason) => boolean } | undefined;
  let isSideBySideLayout = $state(false);
  const drawerId = generateDrawerId();
  const layoutService = responsiveLayoutManager;

  const effectivePlacement = $derived(
    respectLayoutMode && !isSideBySideLayout ? "bottom" : placement
  );
  const layoutClass = $derived(
    respectLayoutMode && isSideBySideLayout ? "side-by-side-layout" : ""
  );

  function registerAppDrawer() {
    registerDrawer(
      drawerId,
      () => { if (!shouldDeferEscapeShortcut(document)) requestClose("escape"); },
      () => closeOnEscape
    );
  }

  function handleBeforeClose(reason: CloseReason): boolean | void {
    const result = onBeforeClose?.(reason);
    if (result === false && reason === "escape" && isOpen && isTopDrawer(drawerId)) {
      // Rearm this layer before a confirmation drawer can register above it.
      registerAppDrawer();
    }
    return result;
  }

  // Component previews have no global shortcut service. Keep the drawer's
  // original window fallback; the app shortcut consumes Escape first.
  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented ||
      !closeOnEscape || !isOpen || !isTopDrawer(drawerId) ||
      shouldDeferEscapeShortcut(document)) return;
    event.preventDefault();
    requestClose("escape");
  }

  function handleOpenChange(open: boolean) {
    if (open) registerAppDrawer();
    else unregisterDrawer(drawerId);
    holdBackgroundFor(`drawer-slide:${drawerId}`, 460);
    onOpenChange?.(open);
  }

  export function requestClose(reason: CloseReason = "programmatic"): boolean {
    return sharedDrawer?.requestClose(reason) ?? false;
  }

  $effect(() => {
    if (!respectLayoutMode) return;
    isSideBySideLayout = layoutService.shouldUseSideBySideLayout();
    return layoutService.onLayoutChange(() => {
      isSideBySideLayout = layoutService.shouldUseSideBySideLayout();
    });
  });

  onDestroy(() => unregisterDrawer(drawerId));
</script>

<svelte:window onkeydown={handleKeydown} />

<SharedDrawer
  bind:this={sharedDrawer}
  bind:isOpen bind:activeSnapPoint
  {closeOnBackdrop} closeOnEscape={false} {dismissible} {modal}
  {dragHandleOnly} {labelledBy} {ariaLabel} {title} {describedBy}
  {role} showHandle={showHandle ?? (dismissible && effectivePlacement === "bottom")}
  class={`${drawerClass} ${layoutClass}`.trim()}
  backdropClass={`${backdropClass} ${layoutClass}`.trim()}
  placement={effectivePlacement} {responsivePlacement} {mobileBreakpoint}
  {trapFocus} {initialFocusElement}
  {focusContainerOnOpen} {returnFocusOnClose} {setInertOnSiblings}
  inertExclusions={[...DEFAULT_INERT_EXCLUSIONS, ...inertExclusions]}
  {snapPoints} {closeOnSnapToZero} {resizeWithSnapPoints}
  {springAnimation} {scaleBackground} {preventScroll}
  {keepMounted} {holdOpen} {autoFocus} {keyboardShortcutsPassthrough}
  {onclose} onBeforeClose={handleBeforeClose}
  onOpenChange={handleOpenChange} {onbackdropclick}
  {onDragChange} {onSnapPointChange}
>
  {@render children?.()}
</SharedDrawer>
