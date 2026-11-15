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
  import { releaseSettle } from "#lib/shared/transitions/motion.js";
  import { watchBackToClose } from "./modal/helpers/back-close-watcher";

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
  const settleClass = `app-${drawerId}`;
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

  // The stock drawer opens with dialog.show(), which gets no close watcher,
  // so Android's Back skipped an open sheet and went back a page instead. A
  // visitor report found the same gap in the sign-in box. The watcher puts
  // Back on the sheet: the top open sheet closes, and nothing else moves.
  // Sheets that pushed an address entry still lose it, because their close
  // goes through the sheet router, which steps history back itself.
  // Chrome also routes the Escape key through close watchers. Escape keeps
  // its own path (handleKeydown and the app shortcut), which leaves the first
  // press to a focused text field, so a watcher fired by Escape only re-arms.
  let dropBackWatcher: () => void = () => {};
  let backArmedOpen = false;
  let escapeKeyAt = -Infinity;
  // Back and the Escape key both close as "escape". The close event carries
  // `viaBack` so a host can tell them apart (the viewer's close analytics).
  let closingViaBack = false;
  const ESCAPE_KEY_WINDOW_MS = 300;

  function noteEscapeKey(event: KeyboardEvent) {
    if (event.key === "Escape") escapeKeyAt = performance.now();
  }

  function armBackWatcher() {
    dropBackWatcher();
    if (!backArmedOpen || !closeOnEscape || !dismissible) return;
    dropBackWatcher = watchBackToClose(() => {
      if (performance.now() - escapeKeyAt < ESCAPE_KEY_WINDOW_MS) {
        queueMicrotask(armBackWatcher);
        return;
      }
      // A refused close (an unsaved-changes prompt) keeps Back armed.
      closingViaBack = true;
      if (!requestClose("escape")) {
        closingViaBack = false;
        armBackWatcher();
      }
    });
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

  // A swipe close continues at the hand's speed instead of restarting the
  // stock slide from rest. Drag samples give the release velocity, and the
  // settle is set as the sheet's own inline transition until the next open.
  // It is not routed through --sheet-transition: a custom property inherits,
  // so changing it restyled the whole sheet content at release (about 300 ms
  // under the sequence viewer).
  const RELEASE_WINDOW_MS = 100;
  let dragSamples: { t: number; offset: number }[] = [];
  let releaseSamples: { t: number; offset: number }[] = [];
  let dragSize = 0;

  function sheetElement(): HTMLElement | null {
    return document.querySelector<HTMLElement>(`.${settleClass}`);
  }

  function isHorizontal() {
    return effectivePlacement === "left" || effectivePlacement === "right";
  }

  function handleDragChange(offset: number, progress: number, dragging: boolean) {
    if (dragging) {
      // Measured as the drag starts, while nothing is moving; a layout read
      // at release would start the sheet sliding back toward open.
      if (dragSamples.length === 0) {
        const sheet = sheetElement();
        dragSize = sheet ? (isHorizontal() ? sheet.offsetWidth : sheet.offsetHeight) : 0;
      }
      const t = performance.now();
      dragSamples.push({ t, offset });
      while (dragSamples.length > 2 && t - dragSamples[0]!.t > RELEASE_WINDOW_MS) {
        dragSamples.shift();
      }
    } else if (dragSamples.length > 0) {
      releaseSamples = dragSamples;
      dragSamples = [];
    }
    onDragChange?.(offset, progress, dragging);
  }

  function settleFromRelease() {
    const samples = releaseSamples;
    releaseSamples = [];
    const sheet = sheetElement();
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (!sheet || !first || !last) return;
    // A hand that stopped before letting go releases from rest.
    const elapsed = last.t - first.t;
    const moving = performance.now() - last.t < RELEASE_WINDOW_MS && elapsed > 0;
    const velocity = moving ? Math.abs(last.offset - first.offset) / elapsed : 0;
    const settle = releaseSettle(velocity, dragSize - Math.abs(last.offset));
    if (!settle) return;
    const timing = `${settle.durationMs}ms ${settle.easing}`;
    sheet.style.transition = `transform ${timing}, opacity ${timing}`;
  }

  function handleClose(event: CustomEvent<{ reason: CloseReason }>) {
    const reason = event.detail?.reason;
    if (reason === "swipe" || reason === "snap") settleFromRelease();
    const viaBack = closingViaBack && reason === "escape";
    closingViaBack = false;
    onclose?.(
      viaBack
        ? new CustomEvent("close", { detail: { reason, viaBack: true } })
        : event
    );
  }

  function handleOpenChange(open: boolean) {
    if (open) {
      dragSamples = [];
      releaseSamples = [];
      sheetElement()?.style.removeProperty("transition");
      registerAppDrawer();
      backArmedOpen = true;
      armBackWatcher();
    } else {
      unregisterDrawer(drawerId);
      backArmedOpen = false;
      dropBackWatcher();
    }
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

  $effect(() => {
    window.addEventListener("keydown", noteEscapeKey, true);
    return () => window.removeEventListener("keydown", noteEscapeKey, true);
  });

  onDestroy(() => {
    unregisterDrawer(drawerId);
    backArmedOpen = false;
    dropBackWatcher();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<SharedDrawer
  bind:this={sharedDrawer}
  bind:isOpen bind:activeSnapPoint
  {closeOnBackdrop} closeOnEscape={false} {dismissible} {modal}
  {dragHandleOnly} {labelledBy} {ariaLabel} {title} {describedBy}
  {role} showHandle={showHandle ?? (dismissible && effectivePlacement === "bottom")}
  class={`${drawerClass} ${layoutClass} ${settleClass}`.trim()}
  backdropClass={`${backdropClass} ${layoutClass}`.trim()}
  placement={effectivePlacement} {responsivePlacement} {mobileBreakpoint}
  {trapFocus} {initialFocusElement}
  {focusContainerOnOpen} {returnFocusOnClose} {setInertOnSiblings}
  inertExclusions={[...DEFAULT_INERT_EXCLUSIONS, ...inertExclusions]}
  {snapPoints} {closeOnSnapToZero} {resizeWithSnapPoints}
  {springAnimation} {scaleBackground} {preventScroll}
  {keepMounted} {holdOpen} {autoFocus} {keyboardShortcutsPassthrough}
  onclose={handleClose} onBeforeClose={handleBeforeClose}
  onOpenChange={handleOpenChange} {onbackdropclick}
  onDragChange={handleDragChange} {onSnapPointChange}
>
  {@render children?.()}
</SharedDrawer>
