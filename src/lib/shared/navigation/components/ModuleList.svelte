<!--
  ModuleList - Module grid for the navigation sheet

  One tile size on every screen. getModuleGridLayout() picks the column count:
  the fewest rows the width allows, where only the last row may be short. The
  grid runs on half-column tracks (each tile spans two), so a short last row
  sits centered instead of hanging off the left edge.

  Keeps module-colored tiles, the active glow, the staggered entrance,
  link-out entries, and the drag-vs-tap guard for swipes that start on a tile.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { ModuleDefinition, ModuleId } from "../domain/types";
  import type { HapticFeedback } from "../../application/services/haptic-feedback";
  import { onMount } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { getReactiveLocale } from "$lib/shared/i18n/locale-state.svelte";
  import {
    getModuleGridLayout,
    MODULE_GRID_GAP,
    type ModuleGridLayout,
  } from "../domain/module-grid-layout";

  // Reactive locale for re-rendering translations
  const locale = $derived(getReactiveLocale());

  let {
    currentModule,
    modules = [],
    onModuleSelect,
  } = $props<{
    currentModule: ModuleId;
    modules: ModuleDefinition[];
    onModuleSelect?: (moduleId: ModuleId) => void;
  }>();

  let hapticService: HapticFeedback;

  // Track drag state to prevent clicks during swipe gestures
  let dragState = $state<{
    isDragging: boolean;
    startY: number;
    startTime: number;
  }>({
    isDragging: false,
    startY: 0,
    startTime: 0,
  });

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Static order from module-definitions.ts. Settings lives in the account
  // footer, not the module grid.
  const mainModules = $derived(
    modules.filter((m: ModuleDefinition) => m.isMain)
  );
  const devModules = $derived(
    modules.filter((m: ModuleDefinition) => !m.isMain && m.id !== "settings")
  );

  // Each grid measures its own width; the layout follows width and count.
  let mainGridWidth = $state(0);
  let devGridWidth = $state(0);
  const mainLayout = $derived(
    getModuleGridLayout(mainModules.length, mainGridWidth)
  );
  const devLayout = $derived(
    getModuleGridLayout(devModules.length, devGridWidth)
  );

  /** Start track for the first tile of a short last row, which centers it. */
  function columnStart(
    layout: ModuleGridLayout,
    index: number
  ): string | undefined {
    return index === layout.lastRowStart && layout.lastRowIndent > 0
      ? String(layout.lastRowIndent + 1)
      : undefined;
  }

  /**
   * Extract primary color from module icon HTML
   * Parses gradient/color values from icon SVG or inline styles
   * Falls back to purple if no color found
   */
  function extractModuleColor(iconHtml: string): string {
    // Try to find gradient color in SVG or inline styles
    const gradientMatch = iconHtml.match(/stop-color[:\s=]\s*["']?([#\w]+)/);
    if (gradientMatch?.[1]) return gradientMatch[1];

    // Match inline style color (e.g., style="color: var(--semantic-warning);")
    const colorMatch = iconHtml.match(/color[:\s=]\s*["']?([#\w]+)/);
    if (colorMatch?.[1]) return colorMatch[1];

    // Default fallback color
    return "#667eea";
  }

  function handlePointerDown(event: PointerEvent | MouseEvent) {
    dragState.isDragging = false;
    dragState.startY = event.clientY;
    dragState.startTime = Date.now();
  }

  function handlePointerMove(event: PointerEvent | MouseEvent) {
    const deltaY = Math.abs(event.clientY - dragState.startY);
    // If moved more than 10px vertically, consider it a drag
    if (deltaY > 10) {
      dragState.isDragging = true;
    }
  }

  function handleModuleClick(
    moduleId: ModuleId,
    event: PointerEvent | MouseEvent,
    isDisabled: boolean = false
  ) {
    // Don't trigger click for disabled modules
    if (isDisabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // If user was dragging, don't trigger the click
    if (dragState.isDragging) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // If the pointer was down for more than 300ms and moved, likely a drag
    const duration = Date.now() - dragState.startTime;
    const deltaY = Math.abs(event.clientY - dragState.startY);
    if (duration > 300 && deltaY > 5) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    hapticService?.trigger("selection");
    onModuleSelect?.(moduleId);
  }

  /**
   * Get badge count for a module
   * Currently unused - notifications are shown in inbox drawer
   */
  function getModuleBadgeCount(_moduleId: ModuleId): number {
    return 0;
  }

  /**
   * Format badge count for display
   */
  function formatBadgeCount(count: number): string {
    if (count > 99) return "99+";
    return count.toString();
  }
</script>

<!-- Main Modules Section -->
<section class="module-section">
  <h3 class="section-title">Modules</h3>
  {#key locale}
    <div
      class="module-grid"
      bind:clientWidth={mainGridWidth}
      style:--module-grid-tracks={mainLayout.columns * 2}
      style:--module-grid-gap="{MODULE_GRID_GAP}px"
    >
      {#each mainModules as module, index}
        {@const moduleColor = module.color || extractModuleColor(module.icon)}
        {@const isActive = currentModule === module.id}
        {@const isDisabled = module.disabled ?? false}
        {@const badgeCount = getModuleBadgeCount(module.id)}

        {#if module.linkHref}
          <!-- Link-out entry (e.g. Shop): plain navigation, never activates the
               module renderer. Same cell markup/classes as a module button so it
               looks and sizes identically. -->
          <a
            class="module-cell"
            href={module.linkHref}
            style="--module-color: {moduleColor}; --stagger-index: {index};"
            style:grid-column-start={columnStart(mainLayout, index)}
          >
            <div class="cell-background"></div>
            <div class="cell-glow"></div>

            <div class="cell-content">
              <span class="cell-icon">{@html module.icon}</span>
              <span class="cell-label">{t(module.labelKey)}</span>
            </div>
          </a>
        {:else}
          <button
            class="module-cell"
            class:active={isActive}
            class:disabled={isDisabled}
            class:has-badge={badgeCount > 0}
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onclick={(e) => handleModuleClick(module.id, e, isDisabled)}
            style="--module-color: {moduleColor}; --stagger-index: {index};"
            style:grid-column-start={columnStart(mainLayout, index)}
            aria-disabled={isDisabled}
            disabled={isDisabled}
          >
            <div class="cell-background"></div>
            <div class="cell-glow"></div>

            <div class="cell-content">
              <span class="cell-icon">{@html module.icon}</span>
              <span class="cell-label">{t(module.labelKey)}</span>

              {#if badgeCount > 0}
                <span class="unread-badge" aria-label="{badgeCount} unread">
                  {formatBadgeCount(badgeCount)}
                </span>
              {/if}

              {#if isDisabled && module.disabledMessage}
                <div class="cell-badge">{module.disabledMessage}</div>
              {/if}
            </div>
          </button>
        {/if}
      {/each}
    </div>
  {/key}
</section>

<!-- Developer/Admin Modules Section -->
{#if devModules.length > 0}
  <section class="module-section dev-section">
    <h3 class="section-title">Developer</h3>
    {#key locale}
      <div
        class="module-grid"
        bind:clientWidth={devGridWidth}
        style:--module-grid-tracks={devLayout.columns * 2}
        style:--module-grid-gap="{MODULE_GRID_GAP}px"
      >
        {#each devModules as module, index}
          {@const moduleColor = module.color || extractModuleColor(module.icon)}
          {@const isActive = currentModule === module.id}
          {@const isDisabled = module.disabled ?? false}

          <button
            class="module-cell"
            class:active={isActive}
            class:disabled={isDisabled}
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onclick={(e) => handleModuleClick(module.id, e, isDisabled)}
            style="--module-color: {moduleColor};"
            style:grid-column-start={columnStart(devLayout, index)}
            aria-disabled={isDisabled}
            disabled={isDisabled}
          >
            <div class="cell-background"></div>
            <div class="cell-glow"></div>

            <div class="cell-content">
              <span class="cell-icon">{@html module.icon}</span>
              <span class="cell-label">{t(module.labelKey)}</span>

              {#if isDisabled && module.disabledMessage}
                <div class="cell-badge">{module.disabledMessage}</div>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/key}
  </section>
{/if}

<style>
  .module-section {
    display: flex;
    flex-direction: column;
    margin-bottom: 16px;
  }

  .module-section:last-child {
    margin-bottom: 0;
  }

  .dev-section {
    padding-top: 16px;
    border-top: 1px solid var(--theme-stroke);
  }

  .section-title {
    margin: 0 0 10px 4px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: var(--theme-text-dim);
  }

  /* Half-column tracks: every tile spans two, so a short last row can start
     on an odd track and sit centered. ModuleList writes the track count and
     the gap from module-grid-layout.ts. */
  .module-grid {
    display: grid;
    grid-template-columns: repeat(var(--module-grid-tracks, 4), minmax(0, 1fr));
    gap: var(--module-grid-gap, 10px);
  }

  .module-grid > .module-cell {
    grid-column: auto / span 2;
  }

  /* One logical tile size everywhere. A translated label that wraps may
     make its row taller; nothing scales with the viewport. */
  .module-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 84px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 14px;
    text-decoration: none; /* anchors (linkHref entries) shouldn't underline */
    color: var(--theme-text);
    cursor: pointer;
    text-align: center;
    overflow: hidden;
    isolation: isolate;

    /* Staggered entrance. `backwards` holds the first keyframe through the
       delay, then hands transform back to the hover, press, and active rules;
       `forwards` pinned transform over them. The rise stays inside the list's
       bottom padding so the entrance never makes the list scrollable. */
    animation: cellEntrance 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
    animation-delay: calc(var(--stagger-index, 0) * 50ms + 100ms);

    transition:
      transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.2s ease;
  }

  @keyframes cellEntrance {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.95);
    }
  }

  .cell-background {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--module-color) 18%, rgba(255, 255, 255, 0.06)) 0%,
      color-mix(in srgb, var(--module-color) 8%, rgba(255, 255, 255, 0.02)) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--module-color) 25%, var(--theme-stroke));
    border-radius: 16px;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 0;
  }

  .cell-glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at 50% 25%,
      var(--module-color, #667eea) 0%,
      transparent 60%
    );
    opacity: 0.1;
    transition: opacity var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1;
    mix-blend-mode: screen;
  }

  .cell-content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 8px;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    z-index: 2;
  }

  .module-cell:hover .cell-background {
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--module-color) 20%, var(--theme-card-bg)) 0%,
      color-mix(in srgb, var(--module-color) 10%, rgba(255, 255, 255, 0.03))
        100%
    );
    border-color: color-mix(
      in srgb,
      var(--module-color) 35%,
      rgba(255, 255, 255, 0.12)
    );
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--module-color) 18%, transparent);
  }

  .module-cell:hover .cell-glow {
    opacity: 0.12;
  }

  .module-cell:hover {
    transform: scale(1.02);
  }

  /* Current module: brighter border, soft glow, gentle pulse */
  .module-cell.active {
    transform: scale(1.05);
    z-index: 2;
  }

  .module-cell.active .cell-background {
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--module-color) 25%, rgba(255, 255, 255, 0.08)) 0%,
      color-mix(in srgb, var(--module-color) 15%, rgba(255, 255, 255, 0.03))
        100%
    );
    border-color: color-mix(
      in srgb,
      var(--module-color) 50%,
      rgba(255, 255, 255, 0.2)
    );
    border-width: 2px;
    box-shadow:
      0 0 20px color-mix(in srgb, var(--module-color) 25%, transparent),
      0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .module-cell.active .cell-glow {
    opacity: 0.18;
    animation: activeGlowPulse 3s ease-in-out infinite;
  }

  @keyframes activeGlowPulse {
    0%,
    100% {
      opacity: 0.15;
    }
    50% {
      opacity: 0.22;
    }
  }

  .module-cell.active .cell-icon {
    transform: scale(1.1);
  }

  .module-cell.active .cell-label {
    font-weight: 700;
  }

  .cell-icon {
    font-size: 1.75rem;
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .module-cell:hover .cell-icon {
    transform: scale(1.1);
  }

  .cell-icon :global(svg),
  .cell-icon :global(i) {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
  }

  .module-cell.active .cell-icon :global(svg),
  .module-cell.active .cell-icon :global(i) {
    filter: drop-shadow(
      0 0 6px color-mix(in srgb, var(--module-color) 35%, transparent)
    );
  }

  .cell-label {
    max-width: 100%;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text);
    letter-spacing: 0.01em;
    line-height: 1.2;
    overflow-wrap: break-word;
    transition: color var(--duration-normal) ease;
  }

  .cell-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    font-size: var(--font-size-compact);
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 5px;
    border-radius: 4px;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    border: 1px solid var(--theme-stroke-strong);
    letter-spacing: 0.4px;
    z-index: 3;
  }

  .unread-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: var(--semantic-error);
    border-radius: 9px;
    color: white;
    font-size: var(--font-size-compact);
    font-weight: 600;
    line-height: 18px;
    text-align: center;
    box-shadow: 0 2px 4px var(--theme-shadow);
    animation: badgePop var(--duration-emphasis) ease;
    z-index: 3;
  }

  @keyframes badgePop {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
    }
  }

  .module-cell:active {
    transform: scale(0.96);
  }

  .module-cell.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .module-cell.disabled:hover {
    transform: none;
  }

  .module-cell.disabled:hover .cell-background {
    background: linear-gradient(
      145deg,
      var(--theme-card-hover-bg) 0%,
      var(--theme-card-bg) 100%
    );
    border-color: var(--theme-stroke);
  }

  .module-cell.disabled:hover .cell-glow {
    opacity: 0;
  }

  .module-cell.disabled:hover .cell-icon {
    transform: none;
  }

  /* Landscape phones: same type and icon size, less padding, so more rows
     fit in the side drawer before it scrolls. */
  @media (max-height: 500px) and (orientation: landscape) {
    .module-cell {
      min-height: 68px;
    }

    .cell-content {
      gap: 4px;
      padding: 8px;
    }
  }

  .module-cell:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 60%, transparent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .module-cell {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }

    .module-cell,
    .cell-background,
    .cell-glow,
    .cell-icon {
      transition: none !important;
    }

    .module-cell:hover,
    .module-cell:active,
    .module-cell.active {
      transform: none !important;
    }

    .module-cell.active .cell-glow,
    .unread-badge {
      animation: none !important;
    }
  }

  @media (prefers-contrast: high) {
    .cell-background {
      background: var(
        --theme-card-hover-bg,
        rgba(255, 255, 255, 0.15)
      ) !important;
      border: 2px solid var(--theme-stroke-strong) !important;
    }

    .module-cell.active .cell-background {
      background: var(
        --theme-card-hover-bg,
        rgba(255, 255, 255, 0.25)
      ) !important;
      border: 2px solid white !important;
    }
  }
</style>
