<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import type { TunnelViewController } from "../../tunnel/tunnel-view-controller.svelte";

  interface Props {
    controller: TunnelViewController;
    dense: boolean;
  }

  let { controller, dense }: Props = $props();

  const presetName = $derived(
    controller.presetRecipe?.name ?? t("viewer_ui_custom")
  );
  const renderedSummary = $derived(
    t("viewer_ui_formation_summary", {
      instances: controller.performerCount,
      instanceLabel:
        controller.performerCount === 1
          ? t("viewer_ui_instance")
          : t("viewer_ui_instances"),
      props: controller.propCount,
    })
  );
  // The preset cards already identify an unmodified mobile formation. Reserve
  // this row for the one state the cards cannot express: edits that can be reset.
  const visible = $derived(!dense || controller.presetRecipeModified);
</script>

{#if visible}
  <section
    class:compact={dense}
    class="configuration-status"
    aria-label={t("viewer_ui_tunnel_formation_status")}
    aria-live="polite"
    transition:growFade={{ axis: "y" }}
  >
    <div class="status-copy">
      <strong>{presetName}</strong>
      {#if controller.presetRecipeModified}
        <span class="modified-badge">{t("viewer_ui_modified")}</span>
      {/if}
      {#if !dense}
        <span class="rendered-summary">{renderedSummary}</span>
      {/if}
    </div>

    {#if controller.presetRecipe && controller.presetRecipeModified}
      <button
        type="button"
        class="reset-button"
        aria-label={t("viewer_ui_reset_named_formation", {
          name: controller.presetRecipe.name,
        })}
        title={t("viewer_ui_reset_named", {
          name: controller.presetRecipe.name,
        })}
        onclick={() => controller.resetPresetRecipe()}
      >
        <i class="fas fa-rotate-left" aria-hidden="true"></i>
        <span
          >{dense
            ? t("viewer_ui_reset")
            : t("viewer_ui_reset_named", {
                name: controller.presetRecipe.name,
              })}</span
        >
      </button>
    {/if}
  </section>
{/if}

<style>
  .configuration-status {
    display: flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-inline: 4px;
  }

  .status-copy {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .status-copy strong {
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }

  .modified-badge {
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 16%,
      transparent
    );
    color: var(--theme-accent, #a78bfa);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
  }

  .rendered-summary {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .reset-button {
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    flex: 0 0 auto;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 38%, transparent);
    border-radius: 9px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 8%,
      transparent
    );
    color: var(--theme-accent, #a78bfa);
    cursor: pointer;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
  }

  .reset-button:hover {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 58%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 14%,
      transparent
    );
  }

  .reset-button:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .compact {
    padding-inline: 2px;
  }

  @media (forced-colors: active) {
    .modified-badge,
    .reset-button {
      border: 1px solid ButtonText;
    }
  }
</style>
