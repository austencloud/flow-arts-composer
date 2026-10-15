/**
 * Languages that publish their own crawlable copy of public pages, and which
 * pages have one. A locale joins only after its pages pass
 * scripts/check-localized-prerender.mjs (no English left in the text).
 *
 * Every consumer reads this module: the reroute hook, the server hook, the
 * head tags, guide links, the sitemap, prerender entries and Cloudflare's
 * route excludes. Plan: docs/superpowers/plans/2026-10-14-per-language-seo-pages.md
 */
export const SEO_LOCALES = ["de", "es", "fr", "it", "pt"] as const;
export type SeoLocale = (typeof SEO_LOCALES)[number];
export type PageLocale = "en" | SeoLocale;

/** Open Graph locale per page language (es is neutral Latin American). */
export const OG_LOCALE: Record<PageLocale, string> = {
  en: "en_US",
  de: "de_DE",
  es: "es_LA",
  fr: "fr_FR",
  it: "it_IT",
  pt: "pt_BR",
};

const LOCALIZED_ROOTS = ["/guide"];

// Noindex replicas (print, book) and dev tools inside the guide tree.
const EXCLUDED_PREFIXES = [
  "/guide/level-1/print",
  "/guide/level-1/book",
  "/guide/level-1/handbook",
  "/guide/level-1/cover-lab",
  "/guide/level-2/print",
  "/guide/level-2/book",
  "/guide/codex/parity",
  "/guide/codex/poster",
  "/guide/codex/print",
];

const under = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

export function isSeoLocale(value: string): value is SeoLocale {
  return (SEO_LOCALES as readonly string[]).includes(value);
}

/** Whether an English path has a version in every SEO locale. */
export function isLocalizedPublicPath(path: string): boolean {
  return (
    LOCALIZED_ROOTS.some((root) => under(path, root)) &&
    !EXCLUDED_PREFIXES.some((prefix) => under(path, prefix))
  );
}

/** Split `/de/guide/x` into its language and the English path it mirrors. */
export function splitLocalePath(pathname: string): {
  locale: PageLocale;
  path: string;
} {
  const [, first = "", ...rest] = pathname.split("/");
  if (!isSeoLocale(first)) return { locale: "en", path: pathname };
  return { locale: first, path: `/${rest.join("/")}` };
}

/** The language a URL's page is published in, when it is a localized page. */
export function localizedPageLocale(pathname: string): SeoLocale | undefined {
  const { locale, path } = splitLocalePath(pathname);
  return locale !== "en" && isLocalizedPublicPath(path) ? locale : undefined;
}

/** The route path a URL renders: `/de/guide/x` renders `/guide/x`. */
export function routePathFor(pathname: string): string {
  return localizedPageLocale(pathname)
    ? splitLocalePath(pathname).path
    : pathname;
}

export function localizePath(path: string, locale: PageLocale): string {
  return locale === "en" ? path : `/${locale}${path === "/" ? "" : path}`;
}

/** Point an internal link at the current page's language when that page exists. */
export function localizeHref(
  href: string,
  current: Pick<URL, "pathname">
): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const { locale } = splitLocalePath(current.pathname);
  if (locale === "en") return href;
  const cut = href.search(/[?#]/);
  const path = cut === -1 ? href : href.slice(0, cut);
  const tail = cut === -1 ? "" : href.slice(cut);
  return isLocalizedPublicPath(path)
    ? `${localizePath(path, locale)}${tail}`
    : href;
}

/** Every language version of a path, plus x-default (English). */
export function alternatesFor(
  path: string
): Array<{ hreflang: PageLocale | "x-default"; path: string }> {
  if (!isLocalizedPublicPath(path)) return [];
  return [
    { hreflang: "en", path },
    ...SEO_LOCALES.map((locale) => ({
      hreflang: locale,
      path: localizePath(path, locale),
    })),
    { hreflang: "x-default", path },
  ];
}

/**
 * The asset path SvelteKit's read() can find for a `?url` import. After a
 * catalog edit the dev server appends a cache-busting `?t=` query, which
 * read() treats as part of the file name.
 */
export function catalogAssetPath(url: string): string {
  return url.split("?")[0] ?? url;
}
