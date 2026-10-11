<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
  import { localizeFilterChip } from "#lib/shared/browse/components/localize-filter-chip.js";
  import { loopComponentDescription } from "#lib/features/create/generate/components/loop-component-presentation.js";
  import { LOOPComponent } from "#lib/features/create/generate/shared/domain/constants/loop-components.js";
  import type {
    GalleryValueHeadSnippet,
    GalleryWorkspaceProps,
  } from "../gallery-workspace-types";

  type Props = Pick<
    GalleryWorkspaceProps,
    | "catalog"
    | "activeLoopValues"
    | "onToggleLoop"
    | "loopConnective"
    | "onLoopConnectiveChange"
    | "onPickLoop"
  > & { valueHead: GalleryValueHeadSnippet };

  function loopDescription(value: string, fallback: string): string {
    if (value === "component:rotated_halved")
      return t("browse_dynamic_rotated_halved_description");
    if (value === "component:rotated_quartered")
      return t("browse_dynamic_rotated_quartered_description");
    const component = value.replace(/^component:/, "") as LOOPComponent;
    return Object.values(LOOPComponent).includes(component)
      ? loopComponentDescription(component)
      : fallback;
  }

  let {
    catalog,
    activeLoopValues,
    onToggleLoop,
    loopConnective,
    onLoopConnectiveChange,
    onPickLoop,
    valueHead,
  }: Props = $props();
</script>

{#snippet loopConnectiveControl()}
  <SegmentedControl
    size="sm"
    color="accent"
    ariaLabel={t("browse_audit_loop_combine")}
    options={[
      { value: "any", label: t("browse_audit_match_any") },
      { value: "all", label: t("browse_audit_match_all") },
    ]}
    value={loopConnective}
    onchange={(v) => onLoopConnectiveChange?.(v)}
  />
{/snippet}

<div class="drill-screen screen-loop">
  {@render valueHead(
    t("browse_audit_pick_loop"),
    onToggleLoop
      ? loopConnective === "all"
        ? t("browse_audit_every_loop_hint")
        : t("browse_audit_any_loop_hint")
      : undefined,
    onLoopConnectiveChange ? loopConnectiveControl : undefined
  )}
  <div class="value-list">
    {#each catalog.loopValues as v (v.value)}
      {@const isOn = activeLoopValues?.has(v.value) ?? false}
      <button
        class="length-row tall monument tinted"
        class:loop-active={isOn}
        style:--row-color={v.color}
        type="button"
        aria-pressed={onToggleLoop ? isOn : undefined}
        disabled={Boolean(onToggleLoop) && v.count === 0 && !isOn}
        onclick={() => onPickLoop(v)}
      >
        <span class="loop-icon" style:color={v.color} aria-hidden="true">
          <i class="fas {v.icon}"></i>
        </span>
        <span class="value-main">
          <span class="value-label"
            >{localizeFilterChip({
              type: BrowseFilterType.LOOP_TYPE,
              value: v.value,
              label: v.label,
            })}</span
          >
          <span class="value-desc">{loopDescription(v.value, v.desc)}</span>
          <span class="density-bar">
            <span
              class="density-fill"
              style:width="{(v.count / catalog.maxLoopCount) * 100}%"
              style:background={v.color}
            ></span>
          </span>
        </span>
        <span class="value-count">{v.count}</span>
        <!-- Slot reserved either way — appearing check must not shift the row. -->
        {#if onToggleLoop}
          <span class="loop-check" class:on={isOn} aria-hidden="true">
            <i class="fas fa-check"></i>
          </span>
        {/if}
      </button>
    {/each}
  </div>
</div>
