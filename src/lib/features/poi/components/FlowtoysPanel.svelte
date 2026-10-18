<!--
  FlowtoysPanel.svelte - Cue Flowtoys props through a Flowtoys Bridge.

  Flowtoys props only play their own built-in modes, so this picks a mode for
  the groups the bridge has heard, and can override colour, brightness, speed
  and density. A cue plays the moment it is picked.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { FlowtoysState } from "../state/flowtoys-state.svelte";
  import {
    FLOWTOYS_ADJUSTS,
    type FlowtoysAdjust,
  } from "../services/flowtoys/flowtoys-packet";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";

  const flowtoys = new FlowtoysState();
  onDestroy(() => flowtoys.dispose());

  const ADJUST_LABEL: Record<FlowtoysAdjust, string> = {
    hue: "Colour",
    saturation: "Saturation",
    brightness: "Brightness",
    speed: "Speed",
    density: "Density",
  };

  const pageOptions = $derived(
    flowtoys.pages.map((p) => ({
      value: String(p),
      label: String(p),
      ariaLabel: `Page ${p}`,
    }))
  );
  const modeOptions = $derived(
    flowtoys.pageModes.map((m) => ({ value: String(m.mode), label: m.name }))
  );
  const adjusted = $derived(Object.keys(flowtoys.adjust).length > 0);

  function groupLabel(id: number): string {
    return `Group ${id.toString(16).toUpperCase().padStart(4, "0")}`;
  }
</script>

<section class="flowtoys-panel" aria-labelledby="flowtoys-panel-title">
  <header class="panel-header">
    <h3 id="flowtoys-panel-title" class="section-title">Flowtoys</h3>
    {#if flowtoys.bridgeName}
      <span class="header-meta">{flowtoys.bridgeName}</span>
    {/if}
  </header>

  {#if !flowtoys.supported}
    <p class="hint">
      Cueing Flowtoys props needs Chrome or Edge with Bluetooth.
    </p>
  {:else if !flowtoys.bridgeName}
    <p class="hint">
      Flowtoys props play their own built-in modes; they can't take a picture.
      Connect a Flowtoys Bridge to pick their modes from here.
    </p>
    <PanelButton
      variant="secondary"
      fullWidth
      onclick={() => flowtoys.connect()}
      disabled={flowtoys.connecting}
    >
      <i class="fab fa-bluetooth-b" aria-hidden="true"></i>
      {flowtoys.connecting ? "Connecting…" : "Connect Flowtoys Bridge"}
    </PanelButton>
  {:else}
    {#if flowtoys.groups.length === 0}
      <p class="hint" aria-live="polite">
        Press a prop's button five times so the bridge hears it.
      </p>
    {:else}
      <div class="groups" role="group" aria-label="Groups to cue">
        {#each flowtoys.groups as group (group.id)}
          <FilterChipBase
            label={groupLabel(group.id)}
            mode="toggle"
            size="sm"
            active={flowtoys.chosen.length === 0 ||
              flowtoys.chosen.includes(group.id)}
            onclick={() => flowtoys.toggleGroup(group.id)}
          />
        {/each}
      </div>

      <SegmentedControl
        options={pageOptions}
        value={String(flowtoys.page)}
        onchange={(v) => flowtoys.setPage(Number(v))}
        color="accent"
        size="sm"
        ariaLabel="Mode page"
      />

      <div class="modes">
        <SegmentedControl
          options={modeOptions}
          value={String(flowtoys.mode)}
          onchange={(v) => flowtoys.cue(Number(v))}
          color="accent"
          size="sm"
          density="compact"
          columns={2}
          semantics="radiogroup"
          ariaLabel="Mode"
        />
      </div>

      <div class="settings">
        {#each FLOWTOYS_ADJUSTS as key (key)}
          {@const value = flowtoys.adjust[key]}
          <ValueSlider
            label={ADJUST_LABEL[key]}
            value={value ?? 128}
            min={0}
            max={255}
            step={1}
            format={(v) =>
              value === undefined
                ? "Prop's own"
                : key === "hue"
                  ? `${Math.round((v / 256) * 360)}°`
                  : `${Math.round((v / 255) * 100)}%`}
            onchange={(v) => flowtoys.setAdjust(key, v)}
          />
        {/each}
        {#if adjusted}
          <PanelButton variant="quiet" onclick={() => flowtoys.clearAdjust()}>
            <i class="fas fa-rotate-left" aria-hidden="true"></i>
            Use the props' own settings
          </PanelButton>
        {/if}
      </div>

      <div class="actions">
        <PanelButton variant="secondary" onclick={() => flowtoys.wake()}>
          <i class="fas fa-sun" aria-hidden="true"></i>
          Wake
        </PanelButton>
        <PanelButton variant="secondary" onclick={() => flowtoys.powerOff()}>
          <i class="fas fa-power-off" aria-hidden="true"></i>
          Turn off
        </PanelButton>
      </div>
    {/if}

    <PanelButton variant="quiet" onclick={() => flowtoys.disconnect()}>
      <i class="fas fa-xmark" aria-hidden="true"></i>
      Disconnect bridge
    </PanelButton>
  {/if}

  {#if flowtoys.error}
    <p class="error" role="alert">{flowtoys.error}</p>
  {/if}
</section>

<style>
  .flowtoys-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
  }

  .panel-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .section-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-primary, #e2e8f0);
    margin: 0;
  }

  .header-meta {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #94a3b8);
  }

  .hint {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    line-height: 1.45;
    color: var(--theme-text-secondary, #94a3b8);
  }

  .groups {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .modes {
    max-height: 18rem;
    overflow-y: auto;
  }

  .settings {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .error {
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, white);
    font-size: var(--font-size-compact, 12px);
  }
</style>
