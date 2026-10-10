<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
  import { localizeFilterChip } from "#lib/shared/browse/components/localize-filter-chip.js";
  import type {
    GalleryValueHeadSnippet,
    GalleryWorkspaceProps,
  } from "../gallery-workspace-types";

  type Props = Pick<
    GalleryWorkspaceProps,
    | "catalog"
    | "activeFamilyValues"
    | "onToggleFamily"
    | "familyConnective"
    | "onFamilyConnectiveChange"
    | "onPickFamily"
  > & { valueHead: GalleryValueHeadSnippet };

  let {
    catalog,
    activeFamilyValues,
    onToggleFamily,
    familyConnective,
    onFamilyConnectiveChange,
    onPickFamily,
    valueHead,
  }: Props = $props();
</script>

{#snippet familyConnectiveControl()}
  <SegmentedControl
    size="sm"
    color="accent"
    ariaLabel={t("browse_audit_family_combine")}
    options={[
      { value: "any", label: t("browse_audit_match_any") },
      { value: "all", label: t("browse_audit_match_all") },
    ]}
    value={familyConnective}
    onchange={(v) => onFamilyConnectiveChange?.(v)}
  />
{/snippet}

<div class="drill-screen screen-family">
  {@render valueHead(
    t("browse_audit_pick_family"),
    onToggleFamily
      ? familyConnective === "all"
        ? t("browse_audit_every_family_hint")
        : t("browse_audit_any_family_hint")
      : undefined,
    onFamilyConnectiveChange ? familyConnectiveControl : undefined
  )}
  <div class="value-list">
    {#each catalog.familyValues as v (v.value)}
      {@const isOn = activeFamilyValues?.has(v.value) ?? false}
      {@const label = localizeFilterChip({
        type: BrowseFilterType.TND_FAMILY,
        value: v.value,
        label: v.label,
      })}
      <button
        class="length-row tall family-row monument tinted"
        class:loop-active={isOn}
        style:--row-color={v.color}
        type="button"
        aria-label={`${label}, ${t(v.count === 1 ? "browse_audit_one_sequence" : "browse_audit_many_sequences", { count: v.count })}`}
        aria-pressed={onToggleFamily ? isOn : undefined}
        disabled={Boolean(onToggleFamily) && v.count === 0 && !isOn}
        onclick={() => onPickFamily(v)}
      >
        <img
          class="value-img family-icon"
          src={v.icon}
          alt=""
          width="44"
          height="44"
          loading="eager"
        />
        <span class="value-main">
          <span class="value-label">{label}</span>
          <span class="density-bar">
            <span
              class="density-fill"
              style:width="{(v.count / catalog.maxFamilyCount) * 100}%"
              style:background={v.color}
            ></span>
          </span>
        </span>
        <span class="value-count">{v.count}</span>
        {#if onToggleFamily}
          <span class="loop-check" class:on={isOn} aria-hidden="true">
            <i class="fas fa-check"></i>
          </span>
        {/if}
      </button>
    {/each}
  </div>
</div>
