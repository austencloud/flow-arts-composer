<script lang="ts">
  /**
   * Language tags for a public page head: og:locale for the language this URL
   * shows, and, when the page is published in several languages, one hreflang
   * link per language plus x-default (English) and the og:locale alternates.
   * Search engines need the full set on every version, each listing the
   * others and itself. `path` is the page's English path.
   */
  import { page } from "$app/state";
  import { LANDING_DOMAIN } from "../../../config/domains";
  import {
    OG_LOCALE,
    SEO_LOCALES,
    alternatesFor,
    splitLocalePath,
    type PageLocale,
  } from "../i18n/seo-locales";

  let { path }: { path: string } = $props();

  const locale = $derived(splitLocalePath(page.url.pathname).locale);
  const alternates = $derived(alternatesFor(path));
  const otherLocales = $derived(
    (["en", ...SEO_LOCALES] as PageLocale[]).filter((other) => other !== locale)
  );
</script>

<meta property="og:locale" content={OG_LOCALE[locale]} />
{#if alternates.length}
  {#each otherLocales as other (other)}
    <meta property="og:locale:alternate" content={OG_LOCALE[other]} />
  {/each}
  {#each alternates as alternate (alternate.hreflang)}
    <link
      rel="alternate"
      hreflang={alternate.hreflang}
      href={`${LANDING_DOMAIN}${alternate.path}`}
    />
  {/each}
{/if}
