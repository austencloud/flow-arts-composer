<script lang="ts">
  import { onMount } from "svelte";
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
  import OverflowMenu from "$lib/shared/ui/components/OverflowMenu.svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import {
    getBaseLocale,
    getLocale,
    locales,
    t,
  } from "$lib/shared/i18n/i18n.svelte.js";
  import { switchLocale } from "$lib/shared/i18n/locale-state.svelte";

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
  <div class="language-row">
    <div class="language-label">
      <i class="fas fa-globe" aria-hidden="true"></i>
      <h2 id="language-heading">{t("settings_language")}</h2>
    </div>
    <div class="language-selector">
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
    </div>
  </div>
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
    gap: 8px;
  }

  .language-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: var(--min-touch-target);
    padding: 10px 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
  }

  .language-label {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .language-label i {
    color: var(--theme-text-dim);
    width: 20px;
    text-align: center;
  }

  h2 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-base);
    font-weight: 500;
  }

  .language-selector {
    min-width: 160px;
    flex-shrink: 0;
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
    padding: 0 16px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
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

  @media (max-width: 480px) {
    .language-row {
      padding: 8px 12px;
    }

    .language-selector {
      min-width: 135px;
    }

    .translation-note {
      padding: 0 12px;
    }
  }
</style>
