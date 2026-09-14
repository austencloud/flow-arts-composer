<!-- The Setups card shows the applied source and opens the setup drawer. -->
<script lang="ts">
  import BaseCard from "./BaseCard.svelte";

  let {
    setupsCardValue = "Browse",
    setupsCardStatus = null,
    onOpenDrawer,
    color = "",
    shadowColor = "",
    cardIndex = 0,
  } = $props<{
    setupsCardValue?: string;
    setupsCardStatus?: "active" | null;
    onOpenDrawer?: () => void;
    color?: string;
    shadowColor?: string;
    cardIndex?: number;
  }>();

  const statusLabel = $derived(
    setupsCardStatus === "active" ? "Active" : ""
  );
</script>

<div class="preset-card-shell">
  <BaseCard
    title="Setups"
    currentValue={setupsCardValue}
    ariaLabel={`Setups: ${setupsCardValue}${statusLabel ? `, ${statusLabel}` : ""}. Click to change.`}
    {color}
    {shadowColor}
    {cardIndex}
    clickable
    onClick={onOpenDrawer}
  >
    <span class="setup-status">
      <span class="setup-status-sizer" aria-hidden="true">Active</span>
      <span class="setup-status-live">{statusLabel}</span>
    </span>
  </BaseCard>
</div>

<style>
  .preset-card-shell {
    container: preset-card / size;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .setup-status {
    display: inline-grid;
    justify-items: center;
    color: var(--theme-accent, #3b82f6);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
  }

  .setup-status-sizer,
  .setup-status-live {
    grid-area: 1 / 1;
  }

  .setup-status-sizer {
    visibility: hidden;
  }

  /* The setup state is supplemental; keep the setup name legible when the
     generator panel is compressed on a short phone viewport. */
  @container preset-card (height < 90px) {
    .preset-card-shell :global(.card-content) {
      display: none;
    }
  }
</style>
