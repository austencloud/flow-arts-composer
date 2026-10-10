<script lang="ts">
  // Harness for the sequence-viewer choreo-card display panel (ExportImagePanel)
  // rebuilt on ControlDock. The card preview is a placeholder; the dock + its
  // real display toggles (Content/Columns/Theme) are the live components.
  import ExportImagePanel from "#lib/shared/sequence-viewer/components/ExportImagePanel.svelte";
  import { getExportOptionsState } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";

  const exportOptions = getExportOptionsState();

  type Device = { id: string; label: string; w: number; h: number };
  const DEVICES: Device[] = [
    { id: "se", label: "iPhone SE", w: 375, h: 667 },
    { id: "i15", label: "iPhone 15", w: 393, h: 852 },
    { id: "pixel", label: "Pixel 7", w: 412, h: 915 },
    { id: "desktop", label: "Desktop", w: 1100, h: 720 },
  ];
  let deviceId = $state("se");
  const device = $derived(DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0]!);
  const isDesktop = $derived(device.w >= 700);

  const cells = Array.from({ length: 8 });
</script>

<div class="page">
  <header class="harness">
    <div class="title">Choreo Card Display · ControlDock</div>
    <div class="seg device-seg">
      {#each DEVICES as d}
        <button class:active={deviceId === d.id} onclick={() => (deviceId = d.id)}>{d.label}</button>
      {/each}
    </div>
  </header>

  <div
    class="phone"
    style:width="{device.w + 24}px"
    style:height="min({device.h + 24}px, calc(100vh - 6rem))"
  >
    <div class="screen">
      {#if isDesktop}
        <div class="viewer row">
          <div class="hero"><div class="card"><div class="card-grid">{#each cells as _}<div class="pcell"></div>{/each}</div></div><span class="hero-tag">choreo card</span></div>
          <div class="sidebar-slot">
            <ExportImagePanel {exportOptions} layout="sidebar" stepCount={8} onClose={() => {}} />
          </div>
        </div>
      {:else}
        <div class="viewer col">
          <div class="hero"><div class="card"><div class="card-grid">{#each cells as _}<div class="pcell"></div>{/each}</div></div><span class="hero-tag">choreo card</span></div>
          <ExportImagePanel {exportOptions} layout="bottom" stepCount={8} />
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 1rem; background: #07070f; color: #e2e8f0; }
  .harness { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.75rem; }
  .title { font-size: 0.85rem; font-weight: 600; opacity: 0.7; display: flex; align-items: center; gap: 8px; }
  .seg { display: flex; gap: 1px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 3px; }
  .seg button { padding: 0.35rem 0.7rem; border: none; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; opacity: 0.55; font-size: 0.72rem; }
  .seg button.active { background: rgba(99, 102, 241, 0.25); opacity: 1; }

  .phone {
    max-width: 100%;
    border-radius: 44px;
    padding: 12px;
    background: #15151f;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.06), 0 30px 80px rgba(0, 0, 0, 0.6);
    transition: width 320ms cubic-bezier(0.2, 0.8, 0.2, 1), height 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .screen {
    position: relative; width: 100%; height: 100%; border-radius: 32px; overflow: hidden;
    display: flex; flex-direction: column;
    background: radial-gradient(120% 90% at 50% 16%, #1a1a2e 0%, #0c0c14 60%, #08080e 100%);
  }
  .viewer { position: relative; flex: 1; min-height: 0; display: flex; }
  .viewer.col { flex-direction: column; }
  .viewer.row { flex-direction: row; }

  .hero { flex: 1; min-height: 0; position: relative; display: flex; align-items: center; justify-content: center; padding: 14px; }
  .card {
    width: min(62%, 200px);
    aspect-ratio: 2.5 / 3.5;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: linear-gradient(160deg, rgba(99, 102, 241, 0.14), rgba(255, 255, 255, 0.03));
    padding: 10px;
    display: flex;
  }
  .card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; flex: 1; }
  .pcell { border-radius: 4px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.08); }
  .hero-tag { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); color: rgba(255, 255, 255, 0.32); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }

  .sidebar-slot { flex: 0 0 360px; max-width: 360px; height: 100%; display: flex; flex-direction: column; }
</style>
