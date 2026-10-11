<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PanelSpinner from "#lib/shared/components/panel/PanelSpinner.svelte";
  import TkaLabel from "#lib/shared/components/TkaLabel.svelte";
  import type { TunnelDiscoverySummary } from "#lib/features/tunnel-collection/domain/tunnel-discovery.js";

  let {
    name,
    poster,
    summary = null,
    eyebrow = null,
    dateLabel,
    active = false,
    posterState = null,
    actionLabel,
    onclick,
  }: {
    name: string;
    poster?: string;
    summary?: TunnelDiscoverySummary | null;
    eyebrow?: string | null;
    dateLabel: string;
    active?: boolean;
    posterState?: "queued" | "refreshing" | "failed" | null;
    actionLabel: string;
    onclick: () => void;
  } = $props();

  const detailLabel = $derived(
    summary
      ? t("tunnel_discovery_summary", { authored: summary.authoredCount, rendered: summary.renderedCount, props: summary.propsLabel, recipe: summary.recipeLabel, formation: summary.formationLabel, effect: summary.effectLabel, bpm: summary.bpm })
      : t("tunnel_details_loading")
  );
</script>

<button
  type="button"
  class="tunnel-card"
  class:active
  {onclick}
  aria-label={`${actionLabel} ${name}; ${detailLabel}`}
  aria-current={active ? "true" : undefined}
>
  <span class="poster-frame">
    {#if poster}
      <img src={poster} alt="" loading="lazy" />
    {:else}
      <i class="fas fa-fan poster-fallback" aria-hidden="true"></i>
    {/if}

    {#if posterState === "refreshing"}
      <span class="poster-progress" role="status">
        <PanelSpinner size={11} />
        {t("create_review_building_a_better_preview")}
      </span>
    {:else if posterState === "failed"}
      <span class="poster-progress poster-failed">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        {t("create_review_preview_kept_retry_available")}
      </span>
    {:else if active}
      <span class="active-badge">
        <i class="fas fa-pen" aria-hidden="true"></i>
        {t("tunnel_editing")}
      </span>
    {/if}
  </span>

  <span class="tunnel-copy">
    {#if eyebrow}
      <span class="eyebrow">{eyebrow}</span>
    {/if}
    <span class="tunnel-name">
      <TkaLabel text={name} darkMode />
    </span>

    {#if summary}
      <span class="counts">
        <strong>{summary.authoredCount}</strong> {t("tunnel_count_authored")}
        <span aria-hidden="true">·</span>
        <strong>{summary.renderedCount}</strong> {t("tunnel_count_on_stage")}
        <span aria-hidden="true">·</span>
        <strong>{summary.propCount}</strong> {t("tunnel_count_props")}
      </span>
      <span class="props">{summary.propsLabel}</span>
      <span class="recipe">{summary.recipeLabel}</span>
      <span class="formation">{summary.formationLabel}</span>
      <span class="playback">
        {summary.effectLabel} <span aria-hidden="true">·</span>
        {summary.bpm} BPM
      </span>
    {:else}
      <span class="detail-placeholder" aria-hidden="true"></span>
      <span class="detail-placeholder short" aria-hidden="true"></span>
      <span class="loading-copy">{t("create_review_loading_props_and_formation")}</span>
    {/if}

    <span class="saved-date">{dateLabel}</span>
  </span>

  <span class="open-cue" aria-hidden="true">
    <i class={`fas ${active ? "fa-check" : "fa-chevron-right"}`}></i>
  </span>
</button>

<style>
  .tunnel-card {
    display: grid;
    grid-template-columns: 7.25rem minmax(0, 1fr) 2rem;
    align-items: center;
    gap: var(--settings-spacing-md, 14px);
    width: 100%;
    min-width: 0;
    min-height: 9rem;
    padding: 10px 8px 10px 10px;
    border: 0;
    border-bottom: 1px solid var(--theme-stroke);
    border-radius: 0;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) var(--ease-out, ease),
      box-shadow var(--duration-fast, 150ms) var(--ease-out, ease);
  }

  .tunnel-card:hover {
    background: var(--theme-card-hover-bg);
  }

  .tunnel-card.active {
    background: color-mix(
      in srgb,
      var(--theme-accent) 8%,
      var(--theme-card-bg)
    );
    box-shadow: inset 3px 0 var(--theme-accent);
  }

  .tunnel-card:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  .poster-frame {
    position: relative;
    display: grid;
    width: 7.25rem;
    aspect-ratio: 1;
    place-items: center;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--theme-stroke) 68%, transparent);
    border-radius: var(--settings-radius-sm, 10px);
    background:
      radial-gradient(
        circle at 50% 48%,
        color-mix(in srgb, var(--theme-accent) 10%, transparent),
        transparent 68%
      ),
      #050507;
  }

  .poster-frame img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    mix-blend-mode: screen;
  }

  .poster-fallback {
    color: color-mix(in srgb, var(--theme-accent) 60%, var(--theme-text-dim));
    font-size: 2rem;
  }

  .active-badge,
  .poster-progress {
    position: absolute;
    right: 5px;
    bottom: 5px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 1.5rem;
    max-width: calc(100% - 10px);
    padding: 2px 6px;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 55%, transparent);
    border-radius: 999px;
    color: var(--theme-text);
    background: color-mix(in srgb, var(--theme-panel-bg) 90%, transparent);
    font-size: 0.65rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .poster-progress {
    left: 5px;
    justify-content: center;
  }

  .poster-failed {
    border-color: color-mix(
      in srgb,
      var(--warning-color, #f5a623) 58%,
      transparent
    );
  }

  .tunnel-copy {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding-block: 2px;
  }

  .eyebrow {
    overflow: hidden;
    color: var(--theme-accent);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.045em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .tunnel-name {
    display: block;
    min-width: 0;
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 760;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .counts,
  .props,
  .recipe,
  .formation,
  .playback,
  .saved-date,
  .loading-copy {
    overflow: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.32;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .counts strong {
    color: var(--theme-text);
    font-variant-numeric: tabular-nums;
  }

  .props,
  .recipe {
    color: color-mix(in srgb, var(--theme-text) 84%, var(--theme-text-dim));
  }

  .saved-date {
    margin-top: 2px;
    font-size: 0.68rem;
  }

  .open-cue {
    display: grid;
    width: 2rem;
    height: var(--min-touch-target, 44px);
    place-items: center;
    color: var(--theme-text-dim);
  }

  .tunnel-card.active .open-cue {
    color: var(--theme-accent);
  }

  .detail-placeholder {
    display: block;
    width: 88%;
    height: 0.6rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-text-dim) 15%, transparent);
  }

  .detail-placeholder.short {
    width: 62%;
  }

  @container tunnel-library (max-width: 25rem) {
    .tunnel-card {
      grid-template-columns: 5.5rem minmax(0, 1fr) 1.5rem;
      gap: var(--settings-spacing-sm, 8px);
      min-height: 7rem;
      padding-left: 8px;
    }

    .poster-frame {
      width: 5.5rem;
    }

    .formation,
    .playback {
      display: none;
    }

    .active-badge {
      width: 1.6rem;
      padding: 0;
      justify-content: center;
      font-size: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tunnel-card {
      transition: none;
    }
  }
</style>
