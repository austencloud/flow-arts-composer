<!--
LOOPExplanationPanel.svelte - Displays explanation of selected LOOP transformations
Shows contextual information based on current selection
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  let { explanationText } = $props<{
    explanationText: string;
  }>();
</script>

<div class="explanation-panel">
  <h3>{t("create_generate_what_this_does")}</h3>
  <p>{explanationText}</p>
</div>

<style>
  .explanation-panel {
    background: var(--theme-shadow);
    border-radius: 10px;
    padding: 10px 14px;
    border: 1px solid var(--theme-stroke-strong);
    flex-shrink: 0;
  }

  .explanation-panel h3 {
    color: var(--theme-text, white);
    font-size: var(--font-size-sm);
    font-weight: 600;
    margin: 0 0 6px 0;
    text-shadow: 0 2px 4px var(--theme-shadow);
  }

  .explanation-panel p {
    color: var(--theme-text);
    font-size: var(--font-size-compact);
    line-height: 1.4;
    margin: 0;
    text-shadow: 0 1px 2px var(--theme-shadow);
  }
</style>
