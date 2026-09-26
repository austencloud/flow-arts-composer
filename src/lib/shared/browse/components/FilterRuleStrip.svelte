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
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import {
    groupRuleFilters,
    type RuleStripFilter,
  } from "$lib/shared/browse/services/filter-rule-groups";
  import type { FilterConnectives } from "$lib/shared/browse/services/multi-filter";
  import { growFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";

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
      aria-label={group.label}
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
        >{group.label}:</span
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
            <span class="connective-word">{group.connectiveWord}</span>
          {/if}
          {#if interactive}
            <FilterChipBase
              label={chip.displayLabel}
              active
              mode="action"
              size="sm"
              chipColor={chip.chipColor}
              ariaLabel={`Edit ${chip.label} filter`}
              onclick={() => onEditFilter?.(chip.type)}
              onremove={() => onRemoveFilter?.(chip.key)}
              removeAriaLabel={`Remove ${chip.label} filter`}
            />
          {:else}
            <FilterChipBase
              label={chip.displayLabel}
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
