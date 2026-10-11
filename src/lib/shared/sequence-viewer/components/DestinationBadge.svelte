<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  interface Props {
    label: "VIEWER" | "STAGE";
    accent?: string; // CSS color; defaults to the viewer blue
  }
  let { label, accent = "#4a9eff" }: Props = $props();
</script>

<span
  class="badge"
  style:--badge-accent={accent}
  aria-label={t("browse_audit_destination", { destination: label })}
>
  {label}
</span>

<style>
  .badge {
    padding: 4px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--badge-accent) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--badge-accent) 36%, transparent);
    color: color-mix(in srgb, var(--badge-accent) 85%, white);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    line-height: 1;
    display: inline-block;
  }
</style>
