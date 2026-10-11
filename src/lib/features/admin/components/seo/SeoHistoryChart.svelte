<script lang="ts">
  import type { SeoHistoryPoint } from "#lib/features/admin/domain/models/seo-dashboard-model.js";
  import {
    formatDate,
    formatInteger,
    getSeoHistoryStory,
  } from "./seo-dashboard-format";

  let { history }: { history: SeoHistoryPoint[] } = $props();

  const maxImpressions = $derived(
    Math.max(1, ...history.map((point) => point.treatmentImpressions))
  );
  const story = $derived(getSeoHistoryStory(history));

  function barHeight(point: SeoHistoryPoint): number {
    if (point.treatmentImpressions === 0) return 4;
    return Math.max(8, (point.treatmentImpressions / maxImpressions) * 100);
  }

  function barStyle(point: SeoHistoryPoint): string {
    return "height: " + barHeight(point) + "%";
  }

  function pointLabel(point: SeoHistoryPoint): string {
    return (
      formatDate(point.generatedDate) +
      ": " +
      formatInteger(point.treatmentImpressions) +
      " Google appearances"
    );
  }
</script>

<section class="panel" aria-labelledby="history-title">
  <div class="panel-heading">
    <div>
      <span class="panel-kicker">Growth record</span>
      <h3 id="history-title">Are the pages showing up more often?</h3>
    </div>
    <span class="run-count">
      {history.length} reading{history.length === 1 ? "" : "s"}
    </span>
  </div>

  <div class="trend-summary trend-{story.tone}">
    <span class="trend-icon" aria-hidden="true">
      <i
        class="fas {story.tone === 'positive'
          ? 'fa-arrow-trend-up'
          : story.tone === 'negative'
            ? 'fa-arrow-trend-down'
            : story.tone === 'neutral'
              ? 'fa-minus'
              : 'fa-hourglass-half'}"
      ></i>
    </span>
    <div>
      <strong>{story.headline}</strong>
      <span>{story.explanation}</span>
    </div>
  </div>

  {#if history.length === 0}
    <div class="chart-placeholder">
      <i class="fas fa-chart-column" aria-hidden="true"></i>
      <span>The graph appears after the first reading.</span>
    </div>
  {:else if history.length === 1}
    <div class="single-reading">
      <span class="single-value">
        {formatInteger(history[0]?.treatmentImpressions)}
      </span>
      <div>
        <strong>Google appearances</strong>
        <span>{formatDate(history[0]?.generatedDate)}</span>
      </div>
    </div>
  {:else}
    <div
      class="history-chart"
      role="img"
      aria-label={"Google appearances across " +
        history.length +
        " measurement checks"}
    >
      {#each history as point (point.generatedDate)}
        <div class="history-column" title={pointLabel(point)}>
          <span class="history-value">
            {formatInteger(point.treatmentImpressions)}
          </span>
          <span class="history-track">
            <span class="history-bar" style={barStyle(point)}></span>
          </span>
          <span class="history-date">{point.generatedDate.slice(5)}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .panel {
    container-type: inline-size;
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    padding: clamp(14px, 1.2vw, 20px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 14px;
    background: var(--theme-card-bg, rgba(15, 23, 42, 0.74));
  }

  .panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-kicker {
    color: var(--semantic-seo-accent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  h3 {
    margin: 3px 0 0;
    font-size: clamp(1rem, 0.92rem + 0.35vw, 1.25rem);
  }

  .run-count {
    min-width: 4.2rem;
    padding: 5px 9px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-text, #fff) 7%, transparent);
    text-align: center;
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .trend-summary {
    display: grid;
    min-height: 76px;
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: center;
    gap: 11px;
    margin: 12px 0;
    padding: 10px 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.09));
    border-radius: 10px;
    background: color-mix(in srgb, var(--theme-text, #fff) 3%, transparent);
  }

  .trend-icon {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--semantic-seo-accent) 14%, transparent);
    color: var(--semantic-seo-accent);
  }

  .trend-positive .trend-icon {
    color: var(--semantic-success, #22c55e);
  }

  .trend-negative .trend-icon {
    color: var(--semantic-error, #ef4444);
  }

  .trend-summary > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
  }

  .trend-summary strong {
    font-size: var(--font-size-min, 0.875rem);
  }

  .trend-summary span:not(.trend-icon) {
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.62));
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.35;
  }

  .chart-placeholder,
  .single-reading {
    display: flex;
    min-height: 174px;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 13px;
    padding: 20px;
    border-radius: 11px;
    background: color-mix(in srgb, var(--theme-text, #fff) 3%, transparent);
  }

  .chart-placeholder > i {
    color: var(--semantic-seo-accent);
    font-size: 1.35rem;
  }

  .chart-placeholder > span {
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.6));
    font-size: var(--font-size-min, 0.875rem);
  }

  .single-reading > div {
    display: flex;
    max-width: 23rem;
    flex-direction: column;
    gap: 5px;
  }

  .single-reading span:not(.single-value) {
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.6));
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.4;
  }

  .single-value {
    color: var(--semantic-seo-accent);
    font-size: clamp(2.25rem, 1.75rem + 1.2vw, 3.25rem);
    font-weight: 800;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }

  .history-chart {
    display: flex;
    min-height: 174px;
    flex: 1;
    align-items: flex-end;
    gap: clamp(4px, 0.45vw, 9px);
    padding: 4px 4px 0;
  }

  .history-column {
    display: grid;
    min-width: 10px;
    height: 100%;
    flex: 1;
    grid-template-rows: 22px minmax(0, 1fr) 20px;
    align-items: end;
    gap: 5px;
  }

  .history-value {
    justify-self: center;
    color: var(--theme-text, #f8fafc);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .history-track {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: flex-end;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
  }

  .history-bar {
    display: block;
    width: 100%;
    min-height: 4px;
    border-radius: 5px 5px 2px 2px;
    background: linear-gradient(
      180deg,
      var(--semantic-seo-accent),
      var(--semantic-seo-accent-deep)
    );
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--semantic-seo-accent) 20%, transparent);
  }

  .history-date {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.46));
    font-size: var(--font-size-compact, 0.75rem);
    text-align: center;
    text-overflow: clip;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  @container (max-width: 520px) {
    .panel-heading {
      flex-direction: column;
    }
  }
</style>
