<script lang="ts">
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import PropPairField from "$lib/shared/pictograph/prop/components/PropPairField.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import type { ResolvedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
  import type { PresentationSummary } from "$lib/shared/foundation/services/presentation-intent";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  let {
    value = $bindable(),
    presentationSummary = null,
    useDefaultLook = $bindable(false),
    onSave,
    onCancel,
  }: {
    value: ResolvedPropConfig;
    /** Null when the surface has no live scene to capture. */
    presentationSummary?: PresentationSummary | null;
    useDefaultLook?: boolean;
    onSave: () => void;
    onCancel: () => void;
  } = $props();
  const titleId = $props.id();
  const themeLeft = getMotionColor(HandSide.LEFT, "dark");
  const themeRight = getMotionColor(HandSide.RIGHT, "dark");

  const lookText = $derived.by(() => {
    if (!presentationSummary) return "";
    const parts = [presentationSummary.trailLabel];
    parts.push(
      presentationSummary.effectLabels.length
        ? presentationSummary.effectLabels.join(", ")
        : "No effects"
    );
    return parts.join(" · ");
  });
</script>

<BaseModal open={true} onclose={onCancel} size="fit" labelledBy={titleId}>
  {#snippet header()}<h2 id={titleId}>Save to Library</h2>{/snippet}
  <div class="body">
    <PropPairField bind:value />
    <p>Used when someone chooses As saved.</p>
    {#if presentationSummary}
      <div class="look" class:muted={useDefaultLook}>
        <span class="look-label">Saved look</span>
        <span class="swatches" aria-hidden="true">
          <span
            class="swatch"
            style:background={presentationSummary.colors?.left ?? themeLeft}
          ></span>
          <span
            class="swatch"
            style:background={presentationSummary.colors?.right ?? themeRight}
          ></span>
        </span>
        <span class="look-text">
          {presentationSummary.colors ? "Custom colors" : "Theme colors"} · {lookText}
        </span>
        <FilterChipBase
          label="Use default look"
          mode="toggle"
          active={useDefaultLook}
          labelScale="readable"
          onclick={() => (useDefaultLook = !useDefaultLook)}
        />
      </div>
    {/if}
  </div>
  {#snippet footer()}
    <div class="actions">
      <PanelButton variant="secondary" onclick={onCancel}>Cancel</PanelButton>
      <PanelButton onclick={onSave}>Save</PanelButton>
    </div>
  {/snippet}
</BaseModal>

<style>
  .body {
    padding: 0 20px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 20px;
  }
  h2 {
    padding: 20px;
    margin: 0;
    font-size: var(--font-size-lg, 18px);
  }
  p {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
  }
  .look {
    display: grid;
    grid-template-columns: auto auto 1fr;
    grid-template-areas:
      "label swatches text"
      "chip chip chip";
    align-items: center;
    column-gap: 10px;
    row-gap: 10px;
    padding: 12px 0 16px;
    font-size: var(--font-size-sm, 14px);
  }
  .look.muted .look-label,
  .look.muted .look-text,
  .look.muted .swatches {
    opacity: 0.45;
  }
  .look-label {
    grid-area: label;
    color: var(--theme-text-dim);
    transition: opacity var(--duration-fast, 150ms) ease;
  }
  .swatches {
    grid-area: swatches;
    display: inline-flex;
    gap: 4px;
    transition: opacity var(--duration-fast, 150ms) ease;
  }
  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
  }
  .look-text {
    grid-area: text;
    min-width: 0;
    overflow-wrap: anywhere;
    transition: opacity var(--duration-fast, 150ms) ease;
  }
  .look :global(.filter-chip) {
    grid-area: chip;
    justify-self: start;
  }
</style>
