<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { SmartFilterSpec } from "#lib/shared/library/domain/models/collection.js";

  interface Props {
    spec: SmartFilterSpec;
    /** `null` means the matching pool is still loading. */
    matchCount?: number | null;
    /** Compact treatment for cards and narrow headers. */
    compact?: boolean;
    /** One-line treatment for builders whose surrounding controls already
     * explain the source and save behavior. */
    dense?: boolean;
    /** Draft rules have not been saved yet. */
    draft?: boolean;
    /** Built-in collections are maintained by TKA and cannot be edited. */
    builtIn?: boolean;
    /** The matching pool failed to load. Without this the null matchCount
     * renders "Counting matches" beside the host's error state — a live
     * region promising progress while the body reports failure. */
    countUnavailable?: boolean;
  }

  let {
    spec,
    matchCount = null,
    compact = false,
    dense = false,
    draft = false,
    builtIn = false,
    countUnavailable = false,
  }: Props = $props();

  const sourceLabel = $derived(
    spec.source === "my-library"
      ? t("browse_audit_my_library")
      : t("browse_audit_community")
  );

  const matchLabel = $derived(
    countUnavailable
      ? t("browse_audit_matches_unavailable")
      : matchCount == null
        ? t("browse_audit_counting_matches")
        : t("browse_audit_matches_now", { count: matchCount })
  );

  const sortLabels = $derived<Record<string, string>>({
    alphabetical: t("browse_audit_alphabetical"),
    date: t("browse_audit_date_added"),
    level: t("browse_audit_level"),
    length: t("browse_audit_sequence_length"),
    author: t("browse_audit_creator"),
    popularity: t("browse_audit_popularity"),
  });

  const sortLabel = $derived(
    t("browse_audit_sort_direction", {
      sort: sortLabels[spec.sortMethod] ?? t("browse_audit_default_order"),
      direction:
        spec.sortDirection === "desc"
          ? t("browse_audit_descending")
          : t("browse_audit_ascending"),
    })
  );

  const ruleEyebrow = $derived(
    draft ? t("browse_audit_rule_preview") : t("browse_audit_saved_rule")
  );
  const ruleBehavior = $derived(
    builtIn
      ? t("browse_audit_built_in")
      : draft
        ? t("browse_audit_updates_after_saving")
        : t("browse_audit_updates_automatically")
  );
</script>

<section
  class="rule-summary"
  class:compact
  class:dense
  aria-label={t("library_ui_smart_collection_rule")}
>
  {#if dense}
    <header class="dense-head">
      <span class="dense-label">{ruleEyebrow}</span>
      <span class="match-count" aria-live="polite">{matchLabel}</span>
    </header>
  {:else}
    <header class="summary-head">
      <span class="summary-icon" aria-hidden="true">
        <i class="fas fa-wand-magic-sparkles"></i>
      </span>
      <span class="summary-title">
        <span class="eyebrow">{ruleEyebrow}</span>
        <strong>{ruleBehavior}</strong>
      </span>
      <span class="match-count" aria-live="polite">{matchLabel}</span>
    </header>
  {/if}

  {#if !dense}
    <div class="rule-facts">
      <span class="fact">
        <i class="fas fa-database" aria-hidden="true"></i>
        <span>
          <span class="fact-label">{t("library_ui_looks_in")}</span>
          <strong>{sourceLabel}</strong>
        </span>
      </span>
      <span class="fact">
        <i class="fas fa-arrow-down-wide-short" aria-hidden="true"></i>
        <span>
          <span class="fact-label">{t("library_ui_sorts_by")}</span>
          <strong>{sortLabel}</strong>
        </span>
      </span>
    </div>
  {/if}

  <div class="criteria" aria-label={t("library_ui_matching_criteria")}>
    {#if spec.filters.length > 0}
      {#each spec.filters as filter (filter.key)}
        <span class="criterion" style:--criterion-color={filter.chipColor}>
          <span class="criterion-dot" aria-hidden="true"></span>
          {filter.label}
        </span>
      {/each}
    {:else}
      <span class="no-rule">
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        {t("browse_audit_add_filter_to_define")}
      </span>
    {/if}
  </div>
</section>

<style>
  .rule-summary {
    container: smart-rule / inline-size;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: clamp(14px, 3cqi, 20px);
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, #8b6cff) 28%,
        var(--theme-stroke, rgba(255, 255, 255, 0.1))
      );
    border-radius: 16px;
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--theme-accent, #8b6cff) 10%, transparent),
        transparent 58%
      ),
      var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .summary-head {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }

  .summary-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 22%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #8b6cff) 78%, white);
    font-size: 15px;
  }

  .summary-title {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
    color: var(--theme-text, white);
  }

  .eyebrow,
  .fact-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
  }

  .summary-title strong {
    overflow: hidden;
    font-size: var(--font-size-sm, 14px);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .match-count {
    min-width: 112px;
    padding: 7px 10px;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b6cff) 34%, transparent);
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 13%,
      transparent
    );
    color: var(--theme-text, white);
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    text-align: center;
    white-space: nowrap;
  }

  /* Facts hug their content — two half-width slabs holding a word each read
     as enormous empty controls on wide panes (audit X-9). */
  .rule-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .fact {
    display: flex;
    min-width: 0;
    max-width: 100%;
    flex: 0 1 auto;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #11131a) 86%,
      transparent
    );
  }

  .fact > i {
    width: 18px;
    flex-shrink: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: 12px;
    text-align: center;
  }

  .fact > span {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
  }

  .fact strong {
    overflow: hidden;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .criteria {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .criterion {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    gap: 7px;
    padding: 6px 11px;
    border: 1px solid
      color-mix(in srgb, var(--criterion-color) 34%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--criterion-color) 12%, transparent);
    color: var(--theme-text, white);
    font-size: var(--font-size-compact, 12px);
    font-weight: 550;
    line-height: 1.2;
  }

  .criterion-dot {
    width: 7px;
    height: 7px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--criterion-color);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--criterion-color) 14%, transparent);
  }

  .no-rule {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-sm, 14px);
    line-height: 1.4;
  }

  .rule-summary.compact {
    gap: 10px;
    padding: 12px;
  }

  .rule-summary.dense {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 12px;
  }

  .dense-head {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .dense-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    white-space: nowrap;
  }

  .dense .match-count {
    min-width: 0;
    padding: 6px 9px;
  }

  .dense .criteria {
    min-width: 0;
  }

  .dense .criterion {
    min-height: 30px;
    padding: 5px 9px;
  }

  .compact .summary-icon {
    width: 36px;
    height: 36px;
  }

  .compact .summary-head {
    grid-template-columns: 36px minmax(0, 1fr) auto;
  }

  .compact .rule-facts {
    display: none;
  }

  @container smart-rule (max-width: 420px) {
    .rule-summary:not(.dense) .summary-head {
      grid-template-columns: 40px minmax(0, 1fr);
    }

    .rule-summary:not(.dense) .match-count {
      grid-column: 1 / -1;
      width: 100%;
    }

    .fact {
      flex: 1 1 100%;
    }

    .fact strong {
      white-space: normal;
    }
  }

  @container smart-rule (max-width: 320px) {
    .dense-head {
      align-items: stretch;
      flex-direction: column;
      gap: 4px;
    }
  }
</style>
