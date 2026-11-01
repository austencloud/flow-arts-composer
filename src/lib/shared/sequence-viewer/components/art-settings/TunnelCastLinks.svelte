<!--
  The tunnel's performers who each dance a sequence of their own, one row per
  performer: who they are by position, and a link to their sequence's page.
  The other views show only the lead, so this is where the rest of the cast
  opens. Short codes stay in the address, never in the text.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import type { ViewerCastLink } from "../../services/viewer-cast";

  let { links }: { links: readonly ViewerCastLink[] } = $props();
  const labelId = $props.id();
</script>

{#if links.length > 0}
  <section class="tunnel-cast" aria-labelledby={labelId}>
    <span id={labelId} class="section-label">{t("viewer_ui_performers")}</span>
    <ul>
      {#each links as link (link.performerId)}
        <li>
          <span class="role">{link.label}</span>
          <LinkChip href={link.href} wrap
            >{link.word || t("viewer_ui_open")}</LinkChip
          >
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .tunnel-cast {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }

  .role {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-sm, 14px);
  }

  :global(.dock-dense) .tunnel-cast {
    gap: 4px;
  }
</style>
