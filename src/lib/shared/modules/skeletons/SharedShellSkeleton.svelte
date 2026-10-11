<!--
  Neutral module-loading fallback. Deliberately claims NO layout shape — a thin
  indeterminate bar over the app background. A skeleton that mimics the wrong
  layout is worse than none, so modules without an accurate bespoke skeleton use
  this honest, shape-neutral loader. It is also visually continuous with the
  per-module internal loaders (e.g. CreateModule's own IndeterminateBar) that
  take over once a module's chunk has mounted.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import IndeterminateBar from "#lib/shared/components/loading/IndeterminateBar.svelte";
</script>

<div class="neutral-loader" role="status" aria-live="polite" aria-busy="true">
  <IndeterminateBar height={3} position="top" />
  <span class="sr-only">{t("common_loading")}</span>
</div>

<style>
  .neutral-loader {
    position: relative;
    width: 100%;
    height: 100%;
    /* transparent — the app background shows through; no fake panels */
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
