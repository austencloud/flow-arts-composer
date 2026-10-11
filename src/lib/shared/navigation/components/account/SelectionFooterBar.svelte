<!--
  SelectionFooterBar.svelte - Sticky actions in the My Props drawer.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";

  interface Props {
    selectedProps: PropType[];
    saving: boolean;
    primaryLabel: string;
    primaryDisabled?: boolean;
    onprimary: () => void;
    onback?: () => void;
  }

  let {
    selectedProps,
    saving,
    primaryLabel,
    primaryDisabled = false,
    onprimary,
    onback,
  }: Props = $props();

  const count = $derived(selectedProps.length);
</script>

<div class="selection-footer">
  {#if count === 0}
    <span class="selection-error">{t("nav_ui_choose_at_least_one")}</span>
  {/if}

  <div class="footer-actions">
    {#if onback}
      <PanelButton variant="secondary" onclick={onback} disabled={saving}>
        {t("learn_back")}
      </PanelButton>
    {/if}
    <PanelButton
      variant="primary"
      onclick={onprimary}
      ariaBusy={saving}
      disabled={saving || primaryDisabled}
    >
      {saving ? t("nav_ui_saving") : primaryLabel}
    </PanelButton>
  </div>
</div>

<style>
  .selection-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .selection-error {
    font-size: max(0.875rem, var(--font-size-min, 0.875rem));
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 72%, white);
    white-space: nowrap;
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .footer-actions :global(.panel-btn) {
    min-width: 7rem;
    white-space: nowrap;
  }

  @media (max-width: 480px) {
    .footer-actions :global(.panel-btn) {
      min-width: 5.5rem;
      padding-inline: 0.75rem;
    }
  }
</style>
