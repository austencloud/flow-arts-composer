<!--
LayerReadout.svelte - the layers a generated sequence will walk through.

Shown under the turn strip so the effect of a turn choice is visible while it
is being made rather than after generating. Hidden by its parent below level 3,
where every sequence sits in layer 1 from beginning to end and the reading
carries no information.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  let {
    signature,
    uncertain = false,
  }: { signature: string; uncertain?: boolean } = $props();
</script>

{#if signature}
  <div class="readout" aria-live="polite">
    <span class="label">{t("create_ui_layers")}</span>
    <span class="value" class:uncertain>{signature}</span>
    {#if uncertain}
      <span class="note">{t("create_review_float_depends_on_the_letters")}</span>
    {/if}
  </div>
{/if}

<style>
  .readout {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }

  .label {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  /* Digits must not jitter as the strip is edited. */
  .value {
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.08em;
    color: var(--theme-text, #fff);
  }

  .value.uncertain {
    opacity: 0.7;
  }

  .note {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: 0.75rem;
  }
</style>
