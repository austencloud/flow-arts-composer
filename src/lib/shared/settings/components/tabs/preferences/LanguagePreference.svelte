<script lang="ts">
  import { onMount } from "svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import OverflowMenu from "#lib/shared/ui/components/OverflowMenu.svelte";
  import SettingsSectionHeader from "../../SettingsSectionHeader.svelte";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import {
    getBaseLocale,
    getLocale,
    locales,
    t,
  } from "#lib/shared/i18n/i18n.svelte.js";
  import { switchLocale } from "#lib/shared/i18n/locale-state.svelte.js";

  const languageNames: Record<string, string> = {
    en: "English",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
    pt: "Português",
    zh: "中文",
    ja: "日本語",
    ko: "한국어",
    ar: "العربية",
    ru: "Русский",
    it: "Italiano",
  };

  let currentLocale = $derived(getLocale());
  let currentLanguage = $derived(getBaseLocale(currentLocale));
  let previousLocale = $state("");
  let localeChanged = $state(false);
  let hapticService = $state<ReturnType<typeof getHapticFeedback> | null>(null);

  let languageItems = $derived(
    locales.map((locale) => ({
      label: languageNames[locale],
      icon: "fas fa-language",
      selected: currentLanguage === locale,
      action: () => selectLanguage(locale),
    }))
  );

  $effect(() => {
    if (!previousLocale) {
      previousLocale = currentLocale;
      return;
    }
    if (currentLocale === previousLocale) return;
    previousLocale = currentLocale;
    localeChanged = true;
    const announcementTimer = setTimeout(() => (localeChanged = false), 3000);
    return () => clearTimeout(announcementTimer);
  });

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  function selectLanguage(locale: string) {
    hapticService?.trigger("selection");
    // Re-selecting Spanish, for example, must keep es-MX and its regional format.
    if (currentLanguage !== locale) switchLocale(locale);
  }
</script>

<section class="language-preference" aria-labelledby="language-heading">
  <SettingsSectionHeader
    icon="fas fa-globe"
    title={t("settings_language")}
    description={t("tab_desc_settings_language")}
    headingId="language-heading"
  >
    {#snippet action()}
      <span class="language-selector">
        <OverflowMenu
          items={languageItems}
          placement="bottom"
          align="right"
          triggerPresentation="labelled"
          ariaLabel={t("settings_choose_language") +
            ": " +
            languageNames[currentLanguage]}
        >
          {#snippet trigger()}
            <span>{languageNames[currentLanguage]}</span>
            <i class="fas fa-chevron-down" aria-hidden="true"></i>
          {/snippet}
        </OverflowMenu>
      </span>
    {/snippet}
  </SettingsSectionHeader>
  <p class="translation-note">
    {t("settings_translation_note")}
    <LinkChip
      size="inline"
      href="https://github.com/austencloud/the-kinetic-alphabet"
      >{t("settings_help_translate")}</LinkChip
    >
  </p>
  <div role="status" aria-live="polite" class="sr-only">
    {#if localeChanged}
      {t("settings_language_changed_to")}
      {languageNames[currentLanguage]}
    {/if}
  </div>
</section>

<style>
  .language-preference {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .language-selector {
    display: block;
    min-width: 10rem;
  }

  .language-selector :global(.overflow-trigger) {
    justify-content: space-between;
  }

  .language-selector :global(.overflow-dropdown) {
    max-height: min(440px, 60vh, calc(100dvh - 240px));
    overflow-y: auto;
  }

  .translation-note {
    margin: 0;
    padding: 0.85em 1.15em 1em;
    color: var(--theme-text-dim);
    font-size: max(0.875rem, var(--font-size-min));
    line-height: 1.5;
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

  @container (min-width: 105rem) {
    .translation-note {
      padding-inline: 1.35em;
    }
  }

  @container (max-width: 32rem) {
    .language-selector {
      min-width: 8.5rem;
    }

    .translation-note {
      padding-inline: 0.9rem;
    }
  }
</style>
