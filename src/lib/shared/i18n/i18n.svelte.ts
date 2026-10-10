/**
 * Lightweight JSON-based i18n System (A+ Grade)
 *
 * Replaces Paraglide's 1,114 barrel-exported files with a single JSON loader.
 * Loads ONE file per locale instead of 1,114 files per page load.
 *
 * Features:
 * - Type-safe translation keys with IDE autocomplete
 * - Reactive locale switching without page reload
 * - Lazy loading of non-default locales
 * - Parameter interpolation support
 * - Zero dependencies - uses native Intl APIs
 */

import type { TranslationKey } from "./i18n-types.js";
import enMessagesStatic from "../../../../messages/en.json";

// Available locales - must match messages/*.json files
export const locales = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "zh",
  "ja",
  "ko",
  "ar",
  "ru",
  "it",
] as const;

// Regional locale variants that fall back to base locales
// e.g., es-MX → es → en
export const regionalLocales = [
  "es-MX", // Spanish (Mexico) → es
  "es-AR", // Spanish (Argentina) → es
  "pt-BR", // Portuguese (Brazil) → pt
  "pt-PT", // Portuguese (Portugal) → pt
  "zh-CN", // Chinese (Simplified) → zh
  "zh-TW", // Chinese (Traditional) → zh
  "fr-CA", // French (Canada) → fr
] as const;

export type BaseLocale = (typeof locales)[number];
export type RegionalLocale = (typeof regionalLocales)[number];
export type Locale = BaseLocale | RegionalLocale;
export const baseLocale: BaseLocale = "en";

// RTL locales that require right-to-left text direction
export const rtlLocales: ReadonlyArray<Locale> = ["ar"] as const;

type Messages = Record<string, string>;

// Cookie configuration for persistence
const LOCALE_COOKIE_NAME = "PARAGLIDE_LOCALE";
const LOCALE_COOKIE_MAX_AGE = 34560000; // ~400 days

// English messages - loaded synchronously to prevent missing-key warnings on first render
// English messages loaded synchronously as fallback
let enMessages: Messages = enMessagesStatic as Messages;

// Cache for loaded locales
const localeCache = new Map<Locale, Messages>();
localeCache.set("en", enMessages);

// Reactive state (initialized synchronously with English)
let currentLocale = $state<Locale>(getInitialLocale());
let messages = $state<Messages>(enMessages);
let localeRequest = 0;
const _i18nInitialized = true;

// HMR support - reload messages when locale JSON files change.
// The i18nHmrPlugin reads the changed file on the server and sends
// the full message object via a custom HMR event, so no fetch or
// dynamic import is needed (both would hit Vite's module cache).
if (import.meta.hot) {
  import.meta.hot.on(
    "i18n-update",
    (data: { locale: string; messages: Messages }) => {
      const locale = data.locale as Locale;
      const fresh = data.messages;

      if (locale === "en") {
        enMessages = fresh;
      }

      localeCache.set(locale, fresh);

      if (currentLocale === locale) {
        messages = fresh;
      }
    }
  );
}

/**
 * Get initial locale from cookie or browser preference
 */
function getInitialLocale(): Locale {
  if (typeof document !== "undefined") {
    // Try cookie first
    const match = document.cookie.match(
      new RegExp(`(^| )${LOCALE_COOKIE_NAME}=([^;]+)`)
    );
    const cookieLocale = toLocale(match?.[2] ?? "");
    if (cookieLocale) {
      return cookieLocale;
    }
  }

  if (typeof navigator !== "undefined" && navigator.languages) {
    // Browsers name regional variants such as "pt-BR". We pick the plain
    // language because the Language settings list offers plain languages and
    // highlights the one in use. A saved regional choice comes from the cookie.
    for (const lang of navigator.languages) {
      const baseTag = toLocale(lang.split("-")[0] ?? "");
      if (baseTag) {
        return baseTag;
      }
    }
  }

  return baseLocale;
}

/**
 * Check if a string is a valid locale (base or regional), ignoring case
 */
export function isLocale(value: string): boolean {
  return toLocale(value) !== undefined;
}

/**
 * Find the supported locale a string names, spelled the way our message files
 * are: "es-mx" and "ES-MX" both give "es-MX". Saved cookies and browsers don't
 * agree on capitalization, and a differently spelled tag would load English.
 */
export function toLocale(value: string): Locale | undefined {
  const lowerValue = value.toLowerCase();
  return [...locales, ...regionalLocales].find(
    (locale) => locale.toLowerCase() === lowerValue
  );
}

/**
 * Get the base locale from a regional locale
 * e.g., es-MX → es, pt-BR → pt, en → en
 */
export function getBaseLocale(locale: Locale): BaseLocale {
  // If already a base locale, return as-is
  if (locales.includes(locale as BaseLocale)) {
    return locale as BaseLocale;
  }

  // Extract base from regional locale (es-MX → es)
  const base = locale.split("-")[0]?.toLowerCase();
  if (base && locales.includes(base as BaseLocale)) {
    return base as BaseLocale;
  }

  // Fallback to English
  return baseLocale;
}

/**
 * Get the current locale (reactive)
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Get the text direction for a locale
 * @returns "rtl" for Arabic, "ltr" for all others
 */
export function getLocaleDirection(
  locale: Locale = currentLocale
): "ltr" | "rtl" {
  return rtlLocales.includes(locale) ? "rtl" : "ltr";
}

// The language a page is actually written in, when it differs from the chosen
// locale. Public pages fall back to English copy for most locales, and turning
// English text right-to-left for an Arabic reader mirrors the layout and moves
// sentence punctuation to the wrong end.
let pinnedDocumentLocale: Locale | null = null;

/**
 * Keep assistive technology in sync with the displayed language.
 * Automatically called by setLocale()
 */
function updateHtmlLanguage(): void {
  if (typeof document !== "undefined") {
    const locale = pinnedDocumentLocale ?? currentLocale;
    document.documentElement.setAttribute("lang", locale);
    document.documentElement.setAttribute("dir", getLocaleDirection(locale));
  }
}

/**
 * Declare the language the current page is written in, or null to follow the
 * chosen locale again. Sets the document's lang and text direction.
 */
export function pinDocumentLanguage(locale: Locale | null): void {
  pinnedDocumentLocale = locale;
  updateHtmlLanguage();
}

/**
 * Whether the chosen locale (or its base language) translates this key itself,
 * rather than falling back to English.
 */
export function isTranslated(key: TranslationKey): boolean {
  if (messages[key]) return true;
  const base = getBaseLocale(currentLocale);
  return base !== currentLocale && Boolean(localeCache.get(base)?.[key]);
}

/**
 * Set the locale and load messages
 * Does NOT reload the page - UI updates reactively
 *
 * For regional locales (e.g., es-MX), automatically loads the base locale (es)
 * to enable the fallback chain: es-MX → es → en
 */
export async function setLocale(locale: Locale): Promise<void> {
  const request = ++localeRequest;
  const canonicalLocale = toLocale(locale);
  if (!canonicalLocale) {
    console.warn(`Invalid locale: ${locale}, falling back to ${baseLocale}`);
  }
  locale = canonicalLocale ?? baseLocale;

  // For regional locales, ensure base locale is loaded first
  const base = getBaseLocale(locale);
  if (base !== locale && !localeCache.has(base)) {
    try {
      const baseMessages = await loadLocaleMessages(base);
      localeCache.set(base, baseMessages);
    } catch (error) {
      console.error(`Failed to load base locale ${base}:`, error);
    }
  }

  // Load regional locale messages if not cached
  if (!localeCache.has(locale)) {
    try {
      const loadedMessages = await loadLocaleMessages(locale);
      localeCache.set(locale, loadedMessages);
    } catch (error) {
      console.error(`Failed to load locale ${locale}:`, error);
      // Fall back to English
      locale = baseLocale;
    }
  }

  // A slower download must not undo a more recent language choice.
  if (request !== localeRequest) return;

  currentLocale = locale;
  messages = localeCache.get(locale) || (enMessages as Messages);

  if (typeof document !== "undefined") {
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}`;
  }
  updateHtmlLanguage();
}

/**
 * Regional override files, as a static glob. A template-literal import here
 * breaks Vite's dependency scan whenever a module imports this file without
 * its extension, and the browser test runner then reloads mid-run.
 */
const regionalMessageFiles = import.meta.glob<{ default: Messages }>(
  "../../../../messages/*-*.json"
);

/**
 * Dynamically import locale messages
 *
 * For regional locales (e.g., es-MX), attempts to load a regional override file.
 * If the file doesn't exist, falls back to the base locale file.
 * The translation fallback chain handles missing keys.
 */
async function loadLocaleMessages(locale: Locale): Promise<Messages> {
  // The server renders English only; setLocale runs in the browser. Returning
  // here drops the other locale files from the server build, which Cloudflare
  // must fit into its 25 MiB Worker bundle limit.
  if (import.meta.env.SSR) return enMessages as Messages;

  // Base locales - always have full translation files
  const asBaseLocale = locale as BaseLocale;
  if (locales.includes(asBaseLocale)) {
    switch (asBaseLocale) {
      case "en":
        return enMessages as Messages;
      case "es":
        return (await import("../../../../messages/es.json"))
          .default as Messages;
      case "fr":
        return (await import("../../../../messages/fr.json"))
          .default as Messages;
      case "de":
        return (await import("../../../../messages/de.json"))
          .default as Messages;
      case "pt":
        return (await import("../../../../messages/pt.json"))
          .default as Messages;
      case "zh":
        return (await import("../../../../messages/zh.json"))
          .default as Messages;
      case "ja":
        return (await import("../../../../messages/ja.json"))
          .default as Messages;
      case "ko":
        return (await import("../../../../messages/ko.json"))
          .default as Messages;
      case "ar":
        return (await import("../../../../messages/ar.json"))
          .default as Messages;
      case "ru":
        return (await import("../../../../messages/ru.json"))
          .default as Messages;
      case "it":
        return (await import("../../../../messages/it.json"))
          .default as Messages;
    }
  }

  // Regional locales - load the override file if there is one, else the base
  if (regionalLocales.includes(locale as RegionalLocale)) {
    try {
      // A regional override file (e.g., messages/es-MX.json) only needs the
      // keys that differ from the base locale
      const loadRegional =
        regionalMessageFiles[`../../../../messages/${locale}.json`];
      if (loadRegional) return (await loadRegional()).default;
    } catch {
      // Unreadable override file - use the base locale
    }
    return loadLocaleMessages(getBaseLocale(locale));
  }

  // Unknown locale - fall back to English
  return enMessages as Messages;
}

/**
 * Translate a message key with optional parameter interpolation
 *
 * Type-safe: Only accepts valid keys from messages/en.json
 * IDE autocomplete shows all available translation keys
 *
 * Implements fallback chain for regional locales:
 * - Regional locale (e.g., es-MX) → Base locale (es) → English (en)
 *
 * @param params - MUST be trusted values only (numbers, system strings, IDs).
 *                 NEVER pass unsanitized user input - XSS risk if rendered in HTML.
 *                 Current usage is safe (module IDs, Firebase Auth usernames).
 *
 * @example
 * t("app_name") // "Flow Arts Composer"
 * t("dashboard_viewing_as", { name: "John" }) // "Viewing as John"
 * t("invalid_key") // TypeScript error!
 */
export function t(
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  let text = messages[key];

  // Fallback chain: regional → base → English
  if (!text) {
    // Try base locale if current is regional
    const base = getBaseLocale(currentLocale);
    if (base !== currentLocale && localeCache.has(base)) {
      text = localeCache.get(base)?.[key];
    }

    // Try English as final fallback
    if (!text && currentLocale !== "en") {
      text = (enMessages as Messages)[key];
    }
  }

  if (!text) {
    // Development warning for missing keys
    if (import.meta.env.DEV) {
      console.warn(
        `Missing translation key: ${key} (locale: ${currentLocale})`
      );
    }
    return key;
  }

  // Handle parameter interpolation: {paramName}
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replace(
        new RegExp(`\\{${paramKey}\\}`, "g"),
        String(paramValue)
      );
    }
  }

  return text;
}

/**
 * Initialize the i18n system
 * Call this once in your root layout
 */
export async function initI18n(): Promise<void> {
  const initialLocale = getInitialLocale();

  await setLocale(initialLocale);

  // Preload likely next locales during idle time
  preloadBrowserLocales();
}

/**
 * Preload locales from browser language preferences during idle time
 * Makes locale switching instant if user switches to a browser language
 *
 * Uses requestIdleCallback to avoid blocking critical rendering
 */
function preloadBrowserLocales(): void {
  if (typeof window === "undefined" || !("requestIdleCallback" in window)) {
    return; // SSR or old browser
  }

  // Get browser languages (excluding current locale)
  const browserLocales = (navigator.languages || [])
    .map((lang) => lang.split("-")[0]?.toLowerCase())
    .filter((lang): lang is string => Boolean(lang))
    .filter((lang) => isLocale(lang) && lang !== currentLocale)
    .slice(0, 3); // Only preload top 3

  if (browserLocales.length === 0) {
    return; // No additional locales to preload
  }

  // Preload during idle time
  window.requestIdleCallback(
    async () => {
      for (const locale of browserLocales) {
        // Skip if already cached
        if (localeCache.has(locale as Locale)) {
          continue;
        }

        try {
          const messages = await loadLocaleMessages(locale as Locale);
          localeCache.set(locale as Locale, messages);

          if (import.meta.env.DEV) {
            console.log(`✅ Preloaded locale: ${locale}`);
          }
        } catch (error) {
          // Silent failure - preloading is optimization, not critical
          if (import.meta.env.DEV) {
            console.warn(`Failed to preload locale ${locale}:`, error);
          }
        }
      }
    },
    { timeout: 2000 } // Give up if idle doesn't happen within 2 seconds
  );
}

/**
 * Options for tDynamic translation
 */
interface TDynamicOptions {
  params?: Record<string, string | number>;
  /** Suppress warning for missing keys (useful for admin-only modules) */
  silent?: boolean;
}

/**
 * Translate with dynamic key (bypasses type checking)
 * Use only for computed keys like `module_${id}`
 *
 * Implements fallback chain for regional locales:
 * - Regional locale (e.g., es-MX) → Base locale (es) → English (en)
 *
 * @param params - MUST be trusted values only (numbers, system strings, IDs).
 *                 NEVER pass unsanitized user input - XSS risk if rendered in HTML.
 * @param options.silent - If true, suppresses missing key warnings (for admin-only modules)
 *
 * @example
 * tDynamic(`module_${moduleId}`) // For dynamic key construction
 * tDynamic(`tab_admin_${tabId}`, { silent: true }) // Suppress warning for admin modules
 */
export function tDynamic(
  key: string,
  paramsOrOptions?: Record<string, string | number> | TDynamicOptions
): string {
  // Handle both legacy (params only) and new (options object) signatures
  let params: Record<string, string | number> | undefined;
  let silent = false;

  if (paramsOrOptions) {
    if ("silent" in paramsOrOptions || "params" in paramsOrOptions) {
      // New options format
      const opts = paramsOrOptions as TDynamicOptions;
      params = opts.params;
      silent = opts.silent ?? false;
    } else {
      // Legacy params format
      params = paramsOrOptions as Record<string, string | number>;
    }
  }

  let text = messages[key];

  // Fallback chain: regional → base → English
  if (!text) {
    // Try base locale if current is regional
    const base = getBaseLocale(currentLocale);
    if (base !== currentLocale && localeCache.has(base)) {
      text = localeCache.get(base)?.[key];
    }

    // Try English as final fallback
    if (!text && currentLocale !== "en") {
      text = (enMessages as Messages)[key];
    }
  }

  if (!text) {
    if (import.meta.env.DEV && !silent) {
      console.warn(
        `Missing translation key: ${key} (locale: ${currentLocale})`
      );
    }
    return key;
  }

  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replace(
        new RegExp(`\\{${paramKey}\\}`, "g"),
        String(paramValue)
      );
    }
  }

  return text;
}

// Re-export type for external use
export type { TranslationKey };
