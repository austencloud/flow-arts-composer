<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
  import { valueDisabled } from "../gallery-value-editor";
  import type {
    GalleryValueHeadSnippet,
    GalleryWorkspaceProps,
  } from "../gallery-workspace-types";

  type Props = Pick<
    GalleryWorkspaceProps,
    "catalog" | "stackHint" | "isValueApplied" | "onPickValue"
  > & { valueHead: GalleryValueHeadSnippet };

  let { catalog, stackHint, isValueApplied, onPickValue, valueHead }: Props =
    $props();
</script>

<div class="drill-screen screen-performance">
  {@render valueHead(
    t("browse_audit_performances_results"),
    t("browse_audit_performance_filter_hint")
  )}
  <div class="value-list">
    {#each catalog.performanceValues as v (v.value)}
      {@const applied = isValueApplied?.(v.type, v.value) ?? false}
      <button
        class="length-row tall monument"
        class:value-applied={applied}
        type="button"
        aria-pressed={isValueApplied ? applied : undefined}
        disabled={valueDisabled(v.count, applied)}
        onclick={() => onPickValue(v.type, v.value, v.label)}
      >
        <span class="loop-icon" aria-hidden="true">
          <i class="fas {v.icon}"></i>
        </span>
        <span class="value-main">
          <span class="value-label"
            >{v.value === "has-public-performance"
              ? t("browse_audit_with_public_performance")
              : v.value === "no-public-performance"
                ? t("browse_audit_without_public_performance")
                : t("browse_audit_recently_performed")}</span
          >
          <span class="value-desc">
            {t("browse_audit_in_results", { count: v.count })}
            {#if v.count !== v.overallCount}
              · {t("browse_audit_overall", { count: v.overallCount })}
            {/if}
          </span>
          <span class="density-bar">
            <span
              class="density-fill"
              style:width="{(v.count / catalog.maxPerformanceCount) * 100}%"
            ></span>
          </span>
        </span>
        <span class="value-count">{v.count}</span>
      </button>
    {/each}
  </div>
</div>
