<script lang="ts" generics="T extends string">
  import type { Snippet } from "svelte";
  import { fade, fly } from "svelte/transition";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import IconRailNav from "../pill-nav/IconRailNav.svelte";

  interface RailPill {
    id: T;
    icon?: string;
    propType?: PropType;
    fanAppearance?: FanAppearance;
    label: string;
    summary?: string;
    accentColor?: string;
  }

  let {
    pills,
    activeId,
    activeLabel,
    onSelect,
    body,
    footer,
    direction = 1,
    reduceMotion = false,
    fillBody = false,
    fluidBody = false,
    exporting = false,
    artPanel = false,
    regionLabel = "Animation controls",
    onNavMount,
    onScrollMount,
  }: {
    pills: RailPill[];
    activeId: T | null;
    activeLabel: string;
    onSelect: (id: T) => void;
    body: Snippet;
    footer?: Snippet;
    direction?: number;
    reduceMotion?: boolean;
    fillBody?: boolean;
    /** The page's own layout measures its width and reflows, so it may take
     *  the pane's whole width instead of the reading measure. */
    fluidBody?: boolean;
    exporting?: boolean;
    artPanel?: boolean;
    regionLabel?: string;
    onNavMount?: (element: HTMLElement | null) => void;
    onScrollMount?: (element: HTMLElement | null) => void;
  } = $props();

  let panelScrollElement = $state<HTMLElement>();

  $effect(() => {
    onScrollMount?.(panelScrollElement ?? null);
    return () => onScrollMount?.(null);
  });
</script>

<div
  class="animator-inspector export-panel sidebar"
  class:art-settings-panel={artPanel}
  class:exporting
  transition:fade={{ duration: reduceMotion ? 0 : 200 }}
  role="region"
  aria-label={regionLabel}
  inert={exporting || undefined}
>
  <div class="sidebar-rail-layout">
    <IconRailNav {pills} {activeId} {onSelect} {onNavMount} reservedSlots={6} />

    <div class="sidebar-main">
      <div class="panel-scroll" bind:this={panelScrollElement}>
        <div class="panel-content-center">
          {#if activeId}
            {#key activeId}
              <div
                class="panel-transition"
                in:fly={{
                  y: reduceMotion ? 0 : direction * 24,
                  duration: reduceMotion ? 0 : 200,
                  delay: reduceMotion ? 0 : 60,
                }}
                out:fly={{
                  y: reduceMotion ? 0 : direction * -12,
                  duration: reduceMotion ? 0 : 120,
                }}
              >
                <div
                  class="panel-center-inner"
                  class:fill-body={fillBody}
                  class:fluid-body={fluidBody}
                >
                  <h2 class="panel-title">{activeLabel}</h2>
                  {@render body()}
                </div>
              </div>
            {/key}
          {/if}
        </div>
      </div>

      {#if footer}{@render footer()}{/if}
    </div>
  </div>
</div>

<style>
  .animator-inspector {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    height: 100%;
    min-width: 0;
    overflow: hidden;
    box-sizing: border-box;
    container: animation-sidebar / inline-size;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    z-index: 10;
  }

  .animator-inspector.art-settings-panel {
    width: clamp(300px, 38%, 420px);
    min-width: 300px;
    flex: 0 0 auto;
  }

  .animator-inspector.exporting {
    opacity: 0.5;
  }

  .sidebar-rail-layout {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .sidebar-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .panel-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
  }

  .panel-content-center {
    flex: 1;
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  .panel-transition {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
    display: flex;
    flex-direction: column;
    will-change: opacity, transform;
    backface-visibility: hidden;
  }

  /* A page of control rows keeps a reading measure, so a wide sidebar does
     not stretch its rows across the whole pane. */
  .panel-center-inner {
    margin: auto 0;
    width: 100%;
    max-width: 560px;
    align-self: center;
  }

  /* A page that was handed its whole body height. */
  .panel-center-inner.fill-body {
    margin: 0;
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* A page whose own layout measures the width it gets and reflows (the prop
     grid) takes the pane's whole width too, so a pane the user drags wider
     gets more tiles per row rather than a fixed column with a margin either
     side. Pages of control rows keep the measure above. */
  .panel-center-inner.fluid-body {
    max-width: none;
  }

  .panel-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
    margin: 0;
    padding: 12px 16px 4px;
  }

  .panel-scroll::-webkit-scrollbar,
  .panel-transition::-webkit-scrollbar {
    width: 5px;
  }

  .panel-scroll::-webkit-scrollbar-track,
  .panel-transition::-webkit-scrollbar-track {
    background: transparent;
  }

  .panel-scroll::-webkit-scrollbar-thumb,
  .panel-transition::-webkit-scrollbar-thumb {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.12));
    border-radius: 3px;
  }

  /* The measure widens with the pane it is in, not with the viewport: a
     sidebar the user dragged wide on a laptop and a sidebar on a 4K panel
     want the same column for the same width. */
  @container animation-sidebar (min-width: 900px) {
    .panel-center-inner {
      max-width: 800px;
    }
  }

  @container animation-sidebar (min-width: 1200px) {
    .panel-center-inner {
      max-width: 1000px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .animator-inspector {
      transition: none;
    }
  }
</style>
