<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ControlDock, {
    type ControlDockTab,
  } from "#lib/shared/sequence-viewer/components/ControlDock.svelte";
  import { getQftAppContext } from "../_context/qft-app-context";
  import type { QftHandCount } from "#lib/shared/notation/qft/qft-session.js";
  import QftHandControls from "./QftHandControls.svelte";
  import QftLayerControls from "./QftLayerControls.svelte";
  import QftNotationPanel from "./QftNotationPanel.svelte";
  import QftPresetControls from "./QftPresetControls.svelte";
  import QftRelationshipControls from "./QftRelationshipControls.svelte";
  import QftTransport from "./QftTransport.svelte";
  import QftWorkbench from "./QftWorkbench.svelte";

  const state = getQftAppContext();

  const handCountOptions = [
    { value: "one" as const, label: "One hand" },
    { value: "two" as const, label: "Two hands" },
  ];

  const ONE_HAND_TABS: ControlDockTab[] = [
    { id: "shape", label: "Shape", icon: "fa-shapes" },
    { id: "presets", label: "Presets", icon: "fa-book-open" },
    { id: "start", label: "Start", icon: "fa-location-dot" },
    { id: "table", label: "Table", icon: "fa-table-list" },
    { id: "layers", label: "Layers", icon: "fa-layer-group" },
  ];

  const TWO_HAND_TABS: ControlDockTab[] = [
    { id: "left", label: "Left", accentColor: "var(--prop-blue, #3575e2)" },
    { id: "right", label: "Right", accentColor: "var(--prop-red, #ed1c24)" },
    { id: "timing", label: "Timing", icon: "fa-arrows-left-right" },
    { id: "table", label: "Table", icon: "fa-table-list" },
    { id: "layers", label: "Layers", icon: "fa-layer-group" },
  ];

  const dockTabs = $derived(
    state.handCount === "one" ? ONE_HAND_TABS : TWO_HAND_TABS
  );
</script>

{#snippet dockTray()}
  <div class="tray-content">
    {#if state.dockTab === "shape"}
      <QftHandControls hand="left" tone="accent" showPresets={false} />
    {:else if state.dockTab === "presets"}
      <QftPresetControls hand="left" tone="accent" />
    {:else if state.dockTab === "left"}
      <QftHandControls hand="left" tone="blue" />
    {:else if state.dockTab === "right"}
      <QftHandControls hand="right" tone="red" />
    {:else if state.dockTab === "start" || state.dockTab === "timing"}
      <QftRelationshipControls />
    {:else if state.dockTab === "table"}
      <QftNotationPanel />
    {:else if state.dockTab === "layers"}
      <QftLayerControls />
    {/if}
  </div>
{/snippet}

<div class="app qft-app" inert={!state.entered}>
  <header class="qft-topbar">
    <div class="brand">
      <span class="brand-full">QfT Notation</span>
      <span class="brand-short">QfT</span>
      <small>Cushing · 2011</small>
    </div>

    <div class="mode-control">
      <SegmentedControl
        options={handCountOptions}
        value={state.handCount}
        onchange={(mode: QftHandCount) => state.setHandCount(mode)}
        size="sm"
        ariaLabel="Number of hands"
        semantics="radiogroup"
        color="accent"
      />
    </div>

    <div class="top-actions">
      <button
        type="button"
        onclick={state.openArchive}
        aria-label="Open the 2011 diagrams"
      >
        <i class="fas fa-images" aria-hidden="true"></i>
        <span>Archive</span>
      </button>
      <button
        type="button"
        onclick={state.openInfo}
        aria-label="About QfT notation"
      >
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        <span>About</span>
      </button>
    </div>
  </header>

  <QftWorkbench />

  {#if state.phone}
    <div class="bottom-chrome">
      <ControlDock
        tabs={dockTabs}
        activeTab={state.dockTab}
        onTabSelect={state.toggleDockTab}
        tray={dockTray}
        labelMinWidth={0}
        trayMaxHeight="40vh"
      />
      <QftTransport compact />
    </div>
  {:else}
    <footer class="footer">
      <div class="footer-layers"><QftLayerControls showReset={false} /></div>
      <QftTransport />
    </footer>
  {/if}
</div>

<style>
  .app {
    position: fixed;
    inset: 0;
    z-index: 1;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    color: var(--theme-text, #fff);
  }

  .qft-topbar,
  .footer,
  .bottom-chrome {
    background: var(--theme-panel-bg, rgb(10 12 26 / 0.96));
    border-color: var(--theme-stroke, rgb(255 255 255 / 0.12));
  }

  .qft-topbar {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) minmax(12rem, 22rem) minmax(
        8rem,
        1fr
      );
    align-items: center;
    gap: 0.75rem;
    min-height: 4rem;
    padding: 0.45rem 0.8rem;
    border-bottom: 1px solid;
  }

  .brand {
    display: flex;
    align-items: baseline;
    gap: 0.65rem;
    min-width: 0;
    color: var(--theme-text, #fff);
    font-size: 1rem;
    font-weight: 700;
  }

  .brand-short {
    display: none;
  }

  .brand small {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 500;
    white-space: nowrap;
  }

  .mode-control {
    width: 100%;
    max-width: 22rem;
    justify-self: center;
  }

  .top-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
  }

  .top-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.45rem 0.75rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    border-radius: 999px;
    background: var(--theme-card-bg, rgb(255 255 255 / 0.05));
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  .top-actions button:hover {
    border-color: var(--theme-stroke-strong, rgb(255 255 255 / 0.3));
    color: var(--theme-text, #fff);
  }

  .footer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    min-height: 5.25rem;
    padding: 0.45rem 0.75rem;
    border-top: 1px solid;
  }

  .footer-layers {
    grid-column: 1;
    min-width: 0;
    container-type: inline-size;
  }

  .footer :global(.transport) {
    grid-column: 2;
  }

  .bottom-chrome {
    display: grid;
    border-top: 1px solid;
  }

  .tray-content {
    min-width: 0;
    padding: 0.5rem;
    container-type: inline-size;
  }

  @media (max-height: 36rem) and (min-width: 48.01rem) {
    .qft-topbar {
      min-height: 3.2rem;
      padding-block: 0.2rem;
    }

    .footer {
      min-height: 4rem;
      padding-block: 0.2rem;
    }
  }

  @media (max-width: 70rem) {
    .top-actions button span,
    .brand small {
      display: none;
    }

    .top-actions button {
      width: var(--min-touch-target, 44px);
      padding: 0;
    }
  }

  @media (max-width: 48rem) {
    .qft-topbar {
      grid-template-columns: auto minmax(9rem, 1fr) auto;
      min-height: 3.5rem;
      gap: 0.4rem;
      padding: 0.25rem 0.45rem;
    }

    .brand-full {
      display: none;
    }

    .brand-short {
      display: inline;
    }

    .top-actions {
      gap: 0.2rem;
    }

    .top-actions button {
      width: 2.75rem;
      min-height: 2.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .top-actions button {
      transition: none;
    }
  }
</style>
