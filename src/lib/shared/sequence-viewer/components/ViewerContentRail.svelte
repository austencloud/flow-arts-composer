<script lang="ts">
  import type { ContentType, ViewerMode } from "../state/viewer-state.svelte";
  import {
    viewerModeOptions,
    PRACTICE_OPTION,
    type SelectableViewerMode,
  } from "../services/viewer-modes";
  import { canAccessPostStudio } from "../services/post-studio-access";
  import { viewportFits3D } from "$lib/shared/3d/capabilities/viewport-3d-gate.svelte";
  import ResizeHandle from "$lib/shared/panels/ResizeHandle.svelte";

  const RAIL_WIDTH_KEY = "tka-viewer-rail-width";
  const DEFAULT_WIDTH = 180;
  const MIN_WIDTH = 72;
  const MAX_WIDTH = 300;

  type RailMode = ViewerMode;
  type RailFooterAction =
    | { label: string; icon: string; href: string }
    | { label: string; icon: string; onSelect: () => void };

  interface Props {
    reviewPostStudio?: boolean;
    activeMode: RailMode;
    webgl2Available?: boolean;
    /** Use the icon rail without overwriting the user's preferred wide width. */
    compact?: boolean;
    practiceActive?: boolean;
    onSelectMode: (mode: SelectableViewerMode) => void;
    onSelectSplit: () => void;
    onPracticeToggle?: () => void;
    /** Optional contextual action pinned to the rail's bottom. */
    footerAction?: RailFooterAction;
  }

  let {
    reviewPostStudio = false,
    activeMode,
    webgl2Available = true,
    compact = false,
    practiceActive = false,
    onSelectMode,
    onSelectSplit,
    onPracticeToggle,
    footerAction,
  }: Props = $props();

  const railItems = $derived([
    ...viewerModeOptions(
      webgl2Available,
      viewportFits3D(),
      canAccessPostStudio() || (import.meta.env.DEV && reviewPostStudio)
    ).map((m) => ({
      id: m.id,
      icon: m.icon,
      label: m.label,
    })),
    // Practice is only listed when a toggle handler is wired (feature not ready — entry point withheld).
    ...(onPracticeToggle
      ? [
          {
            id: "practice" as const,
            icon: PRACTICE_OPTION.icon,
            label: PRACTICE_OPTION.label,
          },
        ]
      : []),
  ]);

  /**
   * The presentation-mode ghost may switch content modes — each one is another
   * view of the same sequence, which is exactly what a passerby should see. The
   * active mode is skipped so pressing it is never a no-op.
   *
   * Practice gets its own kind rather than being withheld: Austen wants the
   * ghost to enter it and open the camera mirror, because a passerby seeing
   * themselves behind the props IS the effect. The presenter only presses it
   * when the camera permission is already granted for the origin — see
   * `cameraGranted` in the attract sensors.
   */
  const ghostKindFor = (id: string): "practice" | "curio" | undefined => {
    if (id === "practice") return practiceActive ? undefined : "practice";
    return activeMode === id ? undefined : "curio";
  };

  let navEl: HTMLElement | undefined = $state();

  function loadWidth(): number {
    try {
      const raw = localStorage.getItem(RAIL_WIDTH_KEY);
      if (raw) {
        const n = parseInt(raw, 10);
        if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_WIDTH;
  }

  let railWidth = $state(loadWidth());
  let displayWidth = $derived(compact ? MIN_WIDTH : railWidth);
  let collapsed = $derived(compact || railWidth < 100);
  let dragging = $state(false);
  let dragStartWidth = DEFAULT_WIDTH;

  function persistWidth(w: number) {
    try {
      localStorage.setItem(RAIL_WIDTH_KEY, String(w));
    } catch {
      /* ignore */
    }
  }

  function onResizeStart() {
    dragStartWidth = railWidth;
    dragging = true;
  }

  function onResize(delta: number) {
    railWidth = Math.round(
      Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth + delta))
    );
  }

  function onResizeEnd() {
    if (!dragging) return;
    dragging = false;
    persistWidth(railWidth);
  }

  function onHandleDoubleClick() {
    railWidth = railWidth < 100 ? DEFAULT_WIDTH : MIN_WIDTH;
    persistWidth(railWidth);
  }

  function onResizeKeydown(event: KeyboardEvent) {
    let nextWidth: number;
    switch (event.key) {
      case "ArrowLeft":
        nextWidth = railWidth - 16;
        break;
      case "ArrowRight":
        nextWidth = railWidth + 16;
        break;
      case "Home":
        nextWidth = MIN_WIDTH;
        break;
      case "End":
        nextWidth = MAX_WIDTH;
        break;
      case "Enter":
        event.preventDefault();
        onHandleDoubleClick();
        return;
      default:
        return;
    }
    event.preventDefault();
    railWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, nextWidth));
    persistWidth(railWidth);
  }

  function focusAt(index: number) {
    const buttons =
      navEl?.querySelectorAll<HTMLButtonElement>(".rail-mode-btn");
    buttons?.[index]?.focus();
  }

  function handleKeydown(e: KeyboardEvent, index: number) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(Math.min(index + 1, railItems.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt(Math.max(index - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(railItems.length - 1);
        break;
    }
  }
</script>

<nav
  class="content-rail"
  class:collapsed
  class:dragging
  role="group"
  aria-label="Sequence views"
  bind:this={navEl}
  style:width="{displayWidth}px"
>
  <div class="rail-modes">
    {#each railItems as mode, i (mode.id)}
      <button
        type="button"
        class="rail-mode-btn"
        class:active={mode.id === "practice"
          ? practiceActive
          : activeMode === mode.id}
        aria-pressed={mode.id === "practice"
          ? practiceActive
          : activeMode === mode.id}
        aria-label={mode.label}
        data-ghost={ghostKindFor(mode.id) ? "safe" : undefined}
        data-ghost-kind={ghostKindFor(mode.id)}
        data-ghost-label={mode.label}
        onclick={() => {
          if (mode.id === "split") onSelectSplit();
          else if (mode.id === "practice") onPracticeToggle?.();
          else onSelectMode(mode.id as SelectableViewerMode);
        }}
        onkeydown={(e) => handleKeydown(e, i)}
      >
        <i
          class="fas {mode.id === 'practice' && practiceActive
            ? 'fa-stop'
            : mode.icon}"
          aria-hidden="true"
        ></i>
        {#if !collapsed}
          <span class="rail-mode-label"
            >{mode.id === "practice" && practiceActive
              ? "Stop"
              : mode.label}</span
          >
        {/if}
      </button>
    {/each}
  </div>

  {#if footerAction}
    {#if "href" in footerAction}
      <a
        class="rail-footer-action"
        href={footerAction.href}
        aria-label={footerAction.label}
      >
        <i class="fas {footerAction.icon}" aria-hidden="true"></i>
        {#if !collapsed}
          <span class="rail-mode-label">{footerAction.label}</span>
        {/if}
      </a>
    {:else}
      <button
        type="button"
        class="rail-footer-action"
        onclick={footerAction.onSelect}
        aria-label={footerAction.label}
      >
        <i class="fas {footerAction.icon}" aria-hidden="true"></i>
        {#if !collapsed}
          <span class="rail-mode-label">{footerAction.label}</span>
        {/if}
      </button>
    {/if}
  {/if}

  {#if !compact}
    <div class="resize-track">
      <ResizeHandle
        direction="horizontal"
        size={10}
        ariaLabel="Resize sidebar"
        ariaValueNow={(100 * (railWidth - MIN_WIDTH)) / (MAX_WIDTH - MIN_WIDTH)}
        onDragStart={onResizeStart}
        onDrag={onResize}
        onDragEnd={onResizeEnd}
        onKeydown={onResizeKeydown}
        onDoubleClick={onHandleDoubleClick}
      />
    </div>
  {/if}
</nav>

<style>
  .content-rail {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--theme-panel-bg, #0a0a14);
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    overflow: hidden;
    flex-shrink: 0;
    transition: width 180ms cubic-bezier(0.2, 0, 0, 1);
  }

  .content-rail.dragging {
    transition: none;
    user-select: none;
  }

  .resize-track {
    position: absolute;
    inset: 0 0 0 auto;
    width: 10px;
    z-index: 10;
  }

  .rail-modes {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .rail-mode-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: none;
    border: none;
    border-left: 3px solid transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    cursor: pointer;
    position: relative;
    transition:
      background 120ms cubic-bezier(0.2, 0, 0, 1),
      color 120ms cubic-bezier(0.2, 0, 0, 1),
      border-color 120ms cubic-bezier(0.2, 0, 0, 1);
  }

  .rail-mode-btn:hover:not(.active) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, rgba(255, 255, 255, 0.8));
  }

  .rail-mode-btn.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 12%,
      transparent
    );
    border-left-color: var(--theme-accent, #6366f1);
    color: var(--theme-text, #ffffff);
  }

  .rail-mode-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
  }

  .rail-mode-btn i {
    font-size: 20px;
  }

  .rail-footer-action {
    box-sizing: border-box;
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-shrink: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 14px 8px;
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
    border: 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 10%,
      transparent
    );
    color: var(--theme-accent, #818cf8);
    text-decoration: none;
    cursor: pointer;
    font: inherit;
    transition:
      background 120ms cubic-bezier(0.2, 0, 0, 1),
      color 120ms cubic-bezier(0.2, 0, 0, 1);
  }

  .rail-footer-action:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 22%,
      transparent
    );
    color: var(--theme-text, #ffffff);
  }

  .rail-footer-action:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
  }

  .rail-footer-action i {
    font-size: 20px;
  }

  .rail-mode-label {
    font-size: var(--font-size-xs, 11px);
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  @media (prefers-reduced-motion: reduce) {
    .content-rail {
      transition: none;
    }
    .rail-mode-btn {
      transition: none;
    }
  }
</style>
