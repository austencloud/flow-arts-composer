<!--
  PipelineTraceSection.svelte

  Shows the full arrow positioning pipeline trace for one motion.
  Displays all 4 tiers with their values, highlights the active tier.
  Read-only display: editing lives in PipelineEditorDock.
-->
<script lang="ts">
  import type {
    PipelineDiagnostics,
    PipelineTier,
  } from "#lib/shared/pictograph/arrow/positioning/calculation/domain/pipeline-diagnostics.js";
  import { livePipelineEdit } from "./live-pipeline-edit.svelte";
  import type { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

  interface Props {
    diagnostics: PipelineDiagnostics | null;
    hand: HandSide;
  }

  let { diagnostics, hand }: Props = $props();

  // The in-flight edit for THIS motion's color, or null. Lets every tier row show
  // the value being dragged live (before Save) — a plain reactive read off the
  // shared editor signal, no async pipeline rerun.
  const liveEdit = $derived(
    livePipelineEdit.current?.hand === hand ? livePipelineEdit.current : null
  );

  function tierLabel(tier: PipelineTier): string {
    switch (tier) {
      case "global":
        return "Global Override";
      case "special-json":
        return "Special JSON";
      case "prop-geometry":
        return "Prop Geometry";
      case "default":
        return "Default";
    }
  }

  function tierColor(tier: PipelineTier): string {
    switch (tier) {
      case "global":
        return "var(--semantic-success, #22c55e)";
      case "special-json":
        return "var(--theme-accent, #a78bfa)";
      case "prop-geometry":
        return "var(--semantic-info, #22d3d8)";
      case "default":
        return "var(--theme-text-dim, #8b949e)";
    }
  }

  function formatValue(v: { x: number; y: number } | null): string {
    if (!v) return "none";
    return `[${v.x}, ${v.y}]`;
  }
</script>

<div class="pipeline-trace">
  <div class="trace-header">
    <h4>
      <i class="fas fa-layer-group" aria-hidden="true"></i>
      Pipeline
    </h4>
  </div>

  {#if diagnostics}
    <!-- Tier rows -->
    {@const tiers = [
      {
        tier: "special-json" as const,
        info: diagnostics.specialJson,
        detail: diagnostics.specialJson?.filePath ?? null,
      },
      { tier: "default" as const, info: diagnostics.default, detail: null },
    ]}

    {#each tiers as { tier, info, detail }}
      {@const isActive = diagnostics.activeTier === tier}
      {@const isSuppressed =
        tier === "special-json" && diagnostics.specialJson?.suppressed === true}
      <div
        class="tier-row"
        class:active={isActive}
        class:has-value={info != null}
        class:suppressed={isSuppressed}
        style="--tier-color: {tierColor(tier)}"
      >
        <span class="tier-icon">
          {#if isSuppressed}
            <i class="fas fa-ban" aria-hidden="true"></i>
          {:else if isActive}
            <i class="fas fa-star" aria-hidden="true"></i>
          {:else}
            <i class="fas fa-circle" aria-hidden="true"></i>
          {/if}
        </span>
        <span class="tier-name">{tierLabel(tier)}</span>
        {#if isSuppressed}
          <span class="tier-badge suppressed-badge">(removed)</span>
        {:else if tier === "special-json" && diagnostics.specialJson?.firestoreOverride}
          <span class="tier-badge">(override)</span>
        {/if}
        {#if detail}
          <span class="tier-detail">{detail}</span>
        {/if}
        <span
          class="tier-value"
          class:none={!info && liveEdit?.tier !== tier}
          class:live={liveEdit?.tier === tier}
        >
          {#if liveEdit?.tier === tier}
            {formatValue({ x: liveEdit.x, y: liveEdit.y })}
          {:else}
            {info ? formatValue(info.value) : "none"}
          {/if}
        </span>
      </div>

      {#if tier === "special-json" && diagnostics.specialJson?.firestoreOverride?.original}
        <div class="original-row">
          <span class="original-icon">└</span>
          <span class="original-label">original</span>
          <span class="original-value">
            {formatValue(diagnostics.specialJson.firestoreOverride.original)}
          </span>
        </div>
      {/if}
    {/each}

    <!-- Summary row -->
    <div class="summary-row">
      <span class="summary-label">base</span>
      <span class="summary-value"
        >{formatValue(diagnostics.baseAdjustment)}</span
      >
      <span class="summary-arrow">→</span>
      <span class="summary-label">rotated</span>
      <span class="summary-value"
        >{formatValue(diagnostics.finalAdjustment)}</span
      >
    </div>
  {:else}
    <div class="loading">calculating...</div>
  {/if}
</div>

<style>
  .pipeline-trace {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }
  .trace-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .trace-header h4 {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    color: var(--theme-text, #fff);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tier-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    min-height: 44px;
    border-radius: 14px;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text, #fff);
    width: 100%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    text-align: left;
    margin-bottom: 10px;
  }
  .tier-icon {
    width: 14px;
    text-align: center;
    font-size: 11px;
    color: var(--tier-color);
    flex: none;
  }
  .tier-name {
    font-weight: 600;
    min-width: 110px;
    font-size: var(--font-size-min, 14px);
  }
  .tier-detail {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }
  .tier-value {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text, #fff);
  }
  .tier-value.none {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-style: italic;
  }
  .tier-value.live {
    color: var(--tier-color);
    font-weight: 700;
  }
  .tier-badge {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-accent, #a78bfa);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  /* Suppressed: the row stays legible (it names what's hidden and is the entry
     point for Restore) but reads as inert — struck value, warning accent. */
  .suppressed-badge {
    color: var(--semantic-warning, #f59e0b);
  }
  .tier-row.suppressed {
    opacity: 0.66;
  }
  .tier-row.suppressed .tier-value {
    text-decoration: line-through;
  }
  .original-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 16px 8px 30px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }
  .original-value {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    text-decoration: line-through;
  }
  .summary-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px 0;
    margin-top: 4px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }
  .summary-value {
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, #fff);
    font-weight: 600;
  }
  .summary-arrow {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }
  .loading {
    padding: 12px;
    text-align: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-sm, 14px);
  }
</style>
