<!--
FilterRuleStrip — the grouped rule sentence.

Renders the active rule as one readable sentence — "Start: Alpha or Beta ·
Level: 1 or 2 · LOOPs: Mirrored and Swapped" — instead of a flat chip row.
Values stay individual chips: chip body edits (opens that category's editor),
the split × removes just that value. The connective word between values
mirrors the applied semantics (see filter-rule-groups.ts).

Shared by the Smart Collection builder today and, per the unified filter
workspace spec, the main gallery next — one component, never a copy.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
  import { localizeFilterChip } from "./localize-filter-chip";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import {
    groupRuleFilters,
    type RuleStripFilter,
  } from "#lib/shared/browse/services/filter-rule-groups.js";
  import type { FilterConnectives } from "#lib/shared/browse/services/multi-filter.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  let {
    filters,
    connectives,
    searchQuery = "",
    interactive = true,
    motionScope,
    onEditFilter,
    onRemoveFilter,
  }: {
    filters: readonly RuleStripFilter[];
    /** Match any / all choices for connective-bearing categories. */
    connectives?: FilterConnectives;
    /** Text search is part of the saved rule even though it is not an engine filter. */
    searchQuery?: string;
    /** False keeps the canonical chip treatment without edit/remove controls. */
    interactive?: boolean;
    /** Stable prefix for shared-element removal motion. Hosts opt in when
     * their mutation runs through `startMorph`. */
    motionScope?: string;
    /** Chip body action: open that category's editor. */
    onEditFilter?: (type: string) => void;
    /** Split × action: remove that one value. */
    onRemoveFilter?: (key: string) => void;
  } = $props();

  const visibleFilters = $derived.by((): RuleStripFilter[] => {
    const query = searchQuery.trim();
    return query
      ? [
          ...filters,
          {
            key: "__search__",
            type: "search",
            label: query,
            chipColor: "#6aa0ff",
          },
        ]
      : [...filters];
  });
  const groups = $derived(groupRuleFilters(visibleFilters, connectives));

  const GROUP_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
    startPlacement: "browse_audit_chip_group_start",
    endPlacement: "browse_audit_chip_group_end",
    difficulty: "browse_audit_chip_group_level",
    length: "browse_audit_chip_group_length",
    starting_letter: "browse_audit_chip_group_letters",
    contains_letters: "browse_audit_chip_group_contains",
    letter_occurrence: "browse_audit_chip_group_letter",
    gridMode: "browse_audit_chip_group_grid",
    gridJoin: "browse_audit_chip_group_layout",
    owner: "browse_audit_chip_group_creator",
    author: "browse_audit_chip_group_author",
    performance_availability: "browse_audit_chip_group_performances",
    recent_performance: "browse_audit_chip_group_performed",
    cap_type: "browse_audit_chip_group_loops",
    tnd_family: "browse_audit_chip_group_families",
    max_turn_intensity: "browse_audit_chip_group_max_turns",
    collection: "browse_audit_chip_group_in",
    reversal_pattern: "browse_audit_chip_group_reversals",
    favorites: "browse_audit_chip_group_favorites",
    recent: "browse_audit_chip_group_added",
    search: "browse_audit_chip_group_search",
  };

  function groupLabel(group: { type: string; label: string }): string {
    const key = GROUP_LABEL_KEYS[group.type];
    return key ? t(key) : group.label;
  }

  function motionName(kind: string, key: string): string {
    if (!motionScope) return "none";
    let hash = 2166136261;
    const source = `${kind}:${key}`;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${motionScope}-${kind}-${(hash >>> 0).toString(36)}`;
  }

  function fallbackDuration(): number {
    return typeof document !== "undefined" && document.startViewTransition
      ? 0
      : DURATION.emphasis;
  }
</script>

<div class="rule-sentence" aria-label={t("browse_ui_current_rule")}>
  {#each groups as group, groupIndex (group.type)}
    <span
      class="rule-group"
      role="group"
      aria-label={groupLabel(group)}
      transition:growFade={{
        axis: "x",
        duration: fallbackDuration(),
        x: -4,
      }}
    >
      {#if groupIndex > 0}
        <span
          class="group-sep rule-motion-token"
          class:motion-enabled={Boolean(motionScope)}
          style:view-transition-name={motionName("separator", group.type)}
          aria-hidden="true">·</span
        >
      {/if}
      <span
        class="group-label rule-motion-token"
        class:motion-enabled={Boolean(motionScope)}
        style:view-transition-name={motionName("label", group.type)}
        >{groupLabel(group)}:</span
      >
      {#each group.chips as chip, chipIndex (chip.key)}
        <span
          class="rule-chip-block rule-motion-token"
          class:motion-enabled={Boolean(motionScope)}
          style:view-transition-name={motionName("chip", chip.key)}
          transition:growFade|local={{
            axis: "x",
            duration: fallbackDuration(),
            x: -4,
          }}
        >
          {#if chipIndex > 0 && group.connectiveWord}
            <span class="connective-word"
              >{t(
                group.connectiveWord === "or"
                  ? "browse_audit_chip_or"
                  : "browse_audit_chip_and"
              )}</span
            >
          {/if}
          {#if interactive}
            <FilterChipBase
              label={localizeFilterChip({ ...chip, label: chip.displayLabel })}
              active
              mode="action"
              size="sm"
              chipColor={chip.chipColor}
              ariaLabel={t("browse_audit_chip_edit_filter", {
                filter: localizeFilterChip(chip),
              })}
              onclick={() => onEditFilter?.(chip.type)}
              onremove={() => onRemoveFilter?.(chip.key)}
              removeAriaLabel={t("browse_audit_remove_filter", {
                filter: localizeFilterChip(chip),
              })}
            />
          {:else}
            <FilterChipBase
              label={localizeFilterChip({ ...chip, label: chip.displayLabel })}
              active
              mode="display"
              size="sm"
              chipColor={chip.chipColor}
            />
          {/if}
        </span>
      {/each}
    </span>
  {/each}
</div>

<style>
  .rule-sentence {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.45rem;
    min-width: 0;
  }

  .rule-group {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.45rem;
    min-width: 0;
    max-width: 100%;
  }

  .rule-chip-block {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    flex-shrink: 0;
  }

  .rule-motion-token.motion-enabled {
    view-transition-class: filter-rule-token;
  }

  .group-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.72));
    white-space: nowrap;
  }

  .connective-word,
  .group-sep {
    font-size: 0.8rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    white-space: nowrap;
  }

  .group-sep {
    margin-inline-end: 0.15rem;
  }
</style>
