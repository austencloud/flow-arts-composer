<!--
  LanguageTab.svelte - App Language Settings

  Allows users to select their preferred language.
  Uses Paraglide i18n for translations.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import { t, locales, baseLocale } from "$lib/shared/i18n/i18n.svelte.js";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import {
    getReactiveLocale,
    switchLocale,
  } from "$lib/shared/i18n/locale-state.svelte";

  // Language display names (native)
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

  function localizedLanguageName(locale: string): string {
    try {
      return (
        new Intl.DisplayNames([currentLocale], { type: "language" }).of(locale) ??
        languageNames[locale] ??
        locale
      );
    } catch {
      return languageNames[locale] ?? locale;
    }
  }

  // Services
  let hapticService: HapticFeedback | null = null;

  // State
  let isVisible = $state(false);
  let currentLocale = $derived(getReactiveLocale());
  let previousLocale = $state<string>("");
  let localeChanged = $state(false);

  // Initialize previousLocale on first run
  $effect.pre(() => {
    previousLocale ||= currentLocale;
  });

  // Track locale changes for screen reader announcement
  $effect(() => {
    if (currentLocale === previousLocale) return;
    localeChanged = true;
    previousLocale = currentLocale;
    // Reset after announcement
    const announcementTimer = setTimeout(() => (localeChanged = false), 3000);
    return () => clearTimeout(announcementTimer);
  });

  onMount(() => {
    hapticService = getHapticFeedback();
    const entryTimer = setTimeout(() => (isVisible = true), 30);
    return () => clearTimeout(entryTimer);
  });

  function handleLanguageSelect(locale: string) {
    hapticService?.trigger("selection");
    switchLocale(locale);
  }

  function isCurrentLocale(locale: string): boolean {
    return currentLocale === locale;
  }
</script>

<div class="language-tab" class:visible={isVisible}>
  <!-- Header -->
  <header class="tab-header">
    <div class="header-icon">
      <i class="fas fa-globe" aria-hidden="true"></i>
    </div>
    <div class="header-content">
      <h1>{t("settings_language")}</h1>
      <p>{t("settings_choose_language")}</p>
    </div>
  </header>

  <!-- Language Grid -->
  <section class="section">
    <h2 class="section-title">
      <i class="fas fa-language" aria-hidden="true"></i>
      {t("settings_available_languages")}
    </h2>

    <div class="language-grid">
      {#each locales as locale}
        <button
          type="button"
          class="language-card"
          class:selected={isCurrentLocale(locale)}
          class:base={locale === baseLocale}
          onclick={() => handleLanguageSelect(locale)}
          aria-pressed={isCurrentLocale(locale)}
        >
          <span class="native-name">{languageNames[locale] ?? locale}</span>
          <span class="english-name">{localizedLanguageName(locale)}</span>
          {#if isCurrentLocale(locale)}
            <i class="fas fa-check checkmark" aria-hidden="true"></i>
          {/if}
          {#if locale === baseLocale}
            <span class="base-badge">{t("settings_default_language")}</span>
          {/if}
        </button>
      {/each}
    </div>
  </section>

  <!-- Info Section -->
  <section class="section info-section">
    <div class="info-card">
      <i class="fas fa-info-circle" aria-hidden="true"></i>
      <p>
        {t("settings_translation_note")}
        <a
          href="https://github.com/austencloud/the-kinetic-alphabet"
          target="_blank"
          rel="noopener"
        >
          {t("settings_help_translate")}
        </a>
      </p>
    </div>
  </section>

  <!-- Screen reader announcement for locale changes -->
  <div role="status" aria-live="polite" class="sr-only">
    {#if localeChanged}
      {t("settings_language_changed_to")} {languageNames[currentLocale] ?? currentLocale}
    {/if}
  </div>
</div>

<style>
  .language-tab {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg, 24px);
    padding: var(--spacing-lg, 24px);
    opacity: 0;
    transform: translateY(10px);
    transition:
      opacity var(--duration-emphasis) ease,
      transform var(--duration-emphasis) ease;
  }

  .language-tab.visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* Header */
  .tab-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-md, 16px);
  }

  .header-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: white;
  }

  .header-content h1 {
    font-size: var(--font-size-xl, 20px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    margin: 0;
  }

  .header-content p {
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    margin: 4px 0 0;
  }

  /* Sections */
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 16px);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .section-title i {
    font-size: 12px;
    opacity: 0.7;
  }

  /* Language Grid */
  .language-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--spacing-sm, 8px);
  }

  .language-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: var(--spacing-md, 16px) var(--spacing-sm, 8px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .language-card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    transform: translateY(-2px);
  }

  .language-card.selected {
    border-color: var(--theme-accent, #0ea5e9);
    background: rgba(14, 165, 233, 0.1);
  }

  .native-name {
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .english-name {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .checkmark {
    position: absolute;
    top: 8px;
    right: 8px;
    color: var(--theme-accent, #0ea5e9);
    font-size: 14px;
  }

  .base-badge {
    position: absolute;
    bottom: 4px;
    right: 4px;
    font-size: 10px;
    padding: 2px 6px;
    background: var(--theme-accent, #0ea5e9);
    color: white;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 600;
  }

  /* Info Section */
  .info-section {
    margin-top: var(--spacing-md, 16px);
  }

  .info-card {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm, 8px);
    padding: var(--spacing-md, 16px);
    background: rgba(14, 165, 233, 0.1);
    border: 1px solid rgba(14, 165, 233, 0.2);
    border-radius: 12px;
  }

  .info-card i {
    color: var(--theme-accent, #0ea5e9);
    margin-top: 2px;
  }

  .info-card p {
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.8));
    margin: 0;
    line-height: 1.5;
  }

  .info-card a {
    color: var(--theme-accent, #0ea5e9);
    text-decoration: none;
  }

  .info-card a:hover {
    text-decoration: underline;
  }

  /* Screen reader only - visually hidden but announced */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
