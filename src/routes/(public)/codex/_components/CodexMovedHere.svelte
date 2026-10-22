<script lang="ts">
  /**
   * The Codex moved from /guide/codex to /codex. The old pages are prerendered
   * and served as static files, where a server redirect cannot keep the query,
   * so this sends the reader on with the letter, prop and explorer state they
   * linked to, in the language of the old URL.
   */
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import {
    isLocalizedPublicPath,
    localizePath,
    splitLocalePath,
  } from "#lib/shared/i18n/seo-locales.js";
  import { LANDING_DOMAIN } from "../../../../config/domains";

  let { to }: { to: string } = $props();

  // The print sheets have no translated copies, so /de/guide/codex/print
  // lands on the English /codex/print instead of a page that does not exist.
  const target = $derived(
    isLocalizedPublicPath(to)
      ? localizePath(to, splitLocalePath(page.url.pathname).locale)
      : to
  );

  onMount(() => {
    window.location.replace(
      `${target}${window.location.search}${window.location.hash}`
    );
  });
</script>

<svelte:head>
  <meta name="robots" content="noindex" />
  <link rel="canonical" href={`${LANDING_DOMAIN}${target}`} />
  <!-- Without scripts the query cannot ride along, so only then fall back. -->
  <noscript>
    <meta http-equiv="refresh" content={`0; url=${target}`} />
  </noscript>
</svelte:head>

<p class="moved">The Codex has moved to <a href={target}>{target}</a>.</p>

<style>
  .moved {
    padding: 6rem 1.5rem;
    text-align: center;
  }
</style>
