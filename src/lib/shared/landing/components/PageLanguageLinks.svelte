<script lang="ts">
  /**
   * The current page in every language it is published in, named in its own
   * language. Renders only on pages that have language versions (the guide),
   * so search engines and readers can reach each one from any other.
   */
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { currentRoutePath } from "#lib/shared/i18n/localized-href.svelte.js";
  import {
    isLocalizedPublicPath,
    localizePath,
    splitLocalePath,
    type PageLocale,
  } from "#lib/shared/i18n/seo-locales.js";
  import { page } from "$app/state";

  const ENDONYMS: Record<PageLocale, string> = {
    en: "English",
    de: "Deutsch",
    es: "Español",
    fr: "Français",
    it: "Italiano",
    pt: "Português",
  };
  const LOCALES = Object.keys(ENDONYMS) as PageLocale[];

  const path = $derived(currentRoutePath());
  const current = $derived(splitLocalePath(page.url.pathname).locale);
</script>

{#if isLocalizedPublicPath(path)}
  <nav class="languages" aria-label={t("settings_language")}>
    <i class="fa-solid fa-language" aria-hidden="true"></i>
    <ul>
      {#each LOCALES as locale (locale)}
        <li>
          <a
            href={localizePath(path, locale)}
            hreflang={locale}
            lang={locale}
            aria-current={locale === current ? "page" : undefined}
            >{ENDONYMS[locale]}</a
          >
        </li>
      {/each}
    </ul>
  </nav>
{/if}

<style>
  .languages {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 32px;
    color: #7d7999;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  a {
    display: inline-flex;
    align-items: center;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.625rem;
    border-radius: 999px;
    color: #b8b4d0;
    font-size: 0.875rem;
    text-decoration: none;
  }
  a:hover,
  a:focus-visible {
    color: #fff;
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
  }
  a:focus-visible {
    outline: 2px solid rgba(184, 166, 255, 0.9);
    outline-offset: 2px;
  }
  a[aria-current="page"] {
    color: #fff;
    font-weight: 600;
  }
  @media (min-width: 1024px) {
    .languages {
      justify-content: flex-start;
    }
  }
</style>
