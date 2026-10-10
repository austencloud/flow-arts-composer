<script lang="ts">
  import { onDestroy, type Snippet } from "svelte";
  import ContextMenu from "#lib/shared/components/context-menu/ContextMenu.svelte";
  import type {
    ContextMenuEntry,
    ContextMenuState,
  } from "#lib/shared/components/context-menu/context-menu-types.js";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { getPronunciationPlayer } from "#lib/shared/pronunciation/get-pronunciation-player.js";
  import type { IPronunciationPlayer } from "#lib/shared/pronunciation/services/types.js";
  import type { ErrorContext } from "#lib/shared/error/domain/error-models.js";
  import {
    compressWord,
    simplifyRepeatedWord,
  } from "#lib/shared/foundation/utils/word-simplifier.js";

  interface WordActionTrigger {
    copyableWord: string;
    copied: boolean;
    isOpen: boolean;
    onclick: (event: MouseEvent) => void;
    oncontextmenu: (event: MouseEvent) => void;
    onpointerdown: (event: PointerEvent) => void;
    onpointermove: (event: PointerEvent) => void;
    onpointerup: () => void;
    onpointercancel: () => void;
    onpointerleave: () => void;
  }

  interface Props {
    word: string;
    enabled?: boolean;
    errorContext?: Partial<ErrorContext>;
    trigger: Snippet<[WordActionTrigger]>;
  }

  let { word, enabled = true, errorContext = {}, trigger }: Props = $props();

  const LONG_PRESS_MS = 500;
  const DRAG_THRESHOLD_PX = 8;
  const FOLLOW_UP_EVENT_WINDOW_MS = 1_000;

  let menuState: ContextMenuState = $state({ open: false });
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressStartX = 0;
  let longPressStartY = 0;
  let longPressMoved = false;
  let suppressClickUntil = 0;
  let suppressContextMenuUntil = 0;
  let pronunciationPlayer: IPronunciationPlayer | null = null;

  const copyableWord = $derived.by(() => {
    if (!word) return "";

    const segments = compressWord(word);
    const hasRepeatedRun = segments.some((segment) => segment.repeat > 1);
    const representativeLetterCount = segments.reduce(
      (count, segment) => count + segment.tokens.length,
      0
    );

    if (hasRepeatedRun && representativeLetterCount <= 12) {
      return segments.map((segment) => segment.tokens.join("")).join(" · ");
    }

    return simplifyRepeatedWord(word);
  });

  const menuItems: ContextMenuEntry[] = [
    {
      id: "copy-word",
      label: "Copy word",
      icon: "fa-copy",
      action: copyWord,
    },
    {
      id: "read-word-aloud",
      label: "Read aloud",
      icon: "fa-volume-high",
      action: readWordAloud,
    },
  ];

  function canOpen(): boolean {
    return enabled && copyableWord.length > 0;
  }

  async function copyWord(): Promise<void> {
    if (!canOpen()) return;

    try {
      await navigator.clipboard.writeText(copyableWord);
      copied = true;
      if (copiedTimer) clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copied = false;
        copiedTimer = null;
      }, 2_000);
    } catch (cause) {
      reportActionError(
        "Couldn't copy the word. Check clipboard access and try again.",
        "copy-word",
        cause
      );
    }
  }

  async function readWordAloud(): Promise<void> {
    if (!canOpen()) return;

    try {
      pronunciationPlayer ??= getPronunciationPlayer();
      await pronunciationPlayer.speak(copyableWord);
    } catch (cause) {
      reportActionError(
        "Read aloud isn't available on this device.",
        "read-word-aloud",
        cause
      );
    }
  }

  function reportActionError(
    message: string,
    action: string,
    cause: unknown
  ): void {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    getErrorHandler().showUserError({
      message,
      technicalDetails: error.message,
      error,
      severity: "warning",
      context: {
        ...errorContext,
        action,
        additionalData: {
          ...errorContext.additionalData,
          word: copyableWord,
        },
      },
    });
  }

  function openMenu(x: number, y: number): void {
    if (!canOpen()) return;
    menuState = { open: true, x, y };
  }

  function openMenuAtTrigger(target: EventTarget | null): void {
    const rect =
      target instanceof HTMLElement ? target.getBoundingClientRect() : null;
    openMenu(
      rect?.left ?? window.innerWidth / 2,
      (rect?.bottom ?? window.innerHeight / 2) + 4
    );
  }

  function closeMenu(): void {
    menuState = { open: false };
  }

  function clearLongPressTimer(): void {
    if (!longPressTimer) return;
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!canOpen() || event.button !== 0 || event.pointerType === "mouse") {
      return;
    }

    clearLongPressTimer();
    longPressMoved = false;
    longPressStartX = event.clientX;
    longPressStartY = event.clientY;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (longPressMoved) return;

      const now = Date.now();
      suppressClickUntil = now + FOLLOW_UP_EVENT_WINDOW_MS;
      suppressContextMenuUntil = now + FOLLOW_UP_EVENT_WINDOW_MS;
      getHapticFeedback().impact("light");
      openMenu(longPressStartX, longPressStartY);
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!longPressTimer || longPressMoved) return;
    const movedX = Math.abs(event.clientX - longPressStartX);
    const movedY = Math.abs(event.clientY - longPressStartY);
    if (movedX <= DRAG_THRESHOLD_PX && movedY <= DRAG_THRESHOLD_PX) return;

    longPressMoved = true;
    suppressClickUntil = Date.now() + FOLLOW_UP_EVENT_WINDOW_MS;
    clearLongPressTimer();
  }

  function handlePointerEnd(): void {
    clearLongPressTimer();
    longPressMoved = false;
  }

  function handleClick(event: MouseEvent): void {
    if (!canOpen()) return;
    event.preventDefault();

    if (Date.now() < suppressClickUntil) return;
    if (menuState.open) {
      closeMenu();
      return;
    }

    openMenuAtTrigger(event.currentTarget);
  }

  function handleContextMenu(event: MouseEvent): void {
    if (!canOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    clearLongPressTimer();

    if (Date.now() < suppressContextMenuUntil) return;
    suppressClickUntil = Date.now() + FOLLOW_UP_EVENT_WINDOW_MS;
    if (event.clientX === 0 && event.clientY === 0) {
      openMenuAtTrigger(event.currentTarget);
      return;
    }

    openMenu(event.clientX, event.clientY);
  }

  onDestroy(() => {
    clearLongPressTimer();
    if (copiedTimer) clearTimeout(copiedTimer);
    pronunciationPlayer?.cancel();
  });
</script>

{@render trigger({
  copyableWord,
  copied,
  isOpen: menuState.open,
  onclick: handleClick,
  oncontextmenu: handleContextMenu,
  onpointerdown: handlePointerDown,
  onpointermove: handlePointerMove,
  onpointerup: handlePointerEnd,
  onpointercancel: handlePointerEnd,
  onpointerleave: handlePointerEnd,
})}

<ContextMenu {menuState} items={menuItems} onClose={closeMenu} />
