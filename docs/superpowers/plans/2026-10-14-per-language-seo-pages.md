# Per-Language Search Pages Implementation Plan

> **For agentic workers:** Execute inline in one session (Austen's Agent Budget
> overrides the subagent default). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give every translated public guide page its own address per language
(`/de/guide/...`, `/es/guide/...`), prerendered in that language with the tags
search engines need, so the guides can rank outside English-language search.

**Architecture:** One registry module names the search locales and the paths
that have translated versions. A universal `reroute` hook maps `/de/guide/x` to
the existing `/guide/x` route, so no route folders are copied. On the server the
page language comes from the URL. A request-scoped catalog keeps concurrent
prerenders from mixing languages. On the client the public layout loads that
catalog before hydration. Head components emit a self canonical, reciprocal
hreflang links and x-default. A post-build script fails the build if a
translated page leaks English, misses a tag, or links to an English page.

**Tech Stack:** SvelteKit 3.0.1 (`reroute`, `getRequestEvent`, `read` from
`$app/server`), Svelte 5, adapter-cloudflare 8, Vitest, the existing
`src/lib/shared/i18n/i18n.svelte.ts` runtime.

**Implementation branch:** `codex/seo-locale-pages` in
`E:/worktrees/tka-platform/seo-locale-pages`.

---

## Why the current setup cannot rank in other languages

Facts from main at 53ffc1da25, 2026-10-14:

- Each page has one address. `getInitialLocale()` in `i18n.svelte.ts` picks
  the language from the `PARAGLIDE_LOCALE` cookie, then from
  `navigator.languages`. Crawlers send neither, so they always see English.
- Every route under `src/routes/(public)/` is prerendered (`+layout.ts`:
  `prerender = true`). `+layout@.svelte` resets the layout, so the root
  `initI18n()` never runs. All public pages render English for every visitor,
  German included (checked in the browser 10-14).
- `src/app.html` hardcodes `<html lang="en">`. `Seo.svelte` and
  `GuideSeo.svelte` hardcode `og:locale` `en_US` and JSON-LD `inLanguage: "en"`.
  No page emits hreflang.
- The branch `codex/complete-german-support` (09-29) solved a different
  problem. It turns guide prerendering off and renders German when the cookie
  says `de`. That helps a returning German user, but the URL stays the same, so
  search engines still see one English page. **This plan replaces that branch's
  guide-locale code.** Its 99 newly externalized English strings remain Phase 2
  work.

## Which pages can have language versions today

Translation coverage (released prefixes, 10-14): de/es/fr/it/pt about 98.5%,
ja/ru/ko about 60% with no guide or verified-lesson text yet, zh/ar about 7%.

Pages whose text actually goes through `t()`:

| Public route                                                                                                 | Files using `t()`                                                                             | Language-ready         |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------- |
| `/guide` (hub, level-1 via `localize-level1-content.ts`, level-2, codex, motion-paths, ratios, zans-diamond) | 82 of 201 components; level-1 prose and SEO copy map English text to `verified_level1_*` keys | Yes for de/es/fr/it/pt |
| `/` landing, `/about`, `/faq`, `/notation/*`, `/shop/*`, `/tricks`, `/timing-and-direction`, `/composer`     | 0 to 4                                                                                        | No, hard-coded English |

**Scope of this plan:** the `/guide` tree in de, es, fr, it and pt. The
registry is built so a later phase adds the landing page and others after their
copy is moved into the catalogs (Phase 2 externalization). It also adds
ja/ru/ko once their guide batches land. The English-leak gate (Task 7) decides
readiness by measurement, not by trust.

Excluded inside `/guide`: `/guide/level-1/print`, `/guide/level-1/book`,
`/guide/level-1/handbook` and `/guide/level-1/cover-lab`. These are noindex
replicas or tools.

## Decisions (defaults shown; Austen confirms in chat)

1. **URL scheme:** language folders on the same domain (`/de/guide/...`).
   Alternatives are subdomains (`de.tkaflowarts.com`: more DNS and Cloudflare
   work, splits domain authority) and `?lang=de` (search engines handle query
   parameters poorly).
2. **Slugs stay English** (`/de/guide/level-1/hand-placements`). Translated
   slugs give a small ranking gain but cost a slug map per locale, per page.
3. **Launch set:** de, es, fr, it, pt. ja/ru/ko join after their guide batches
   pass the leak gate; zh/ar after wave 3 (ar also gets `dir="rtl"`).
4. **No automatic redirects by language.** Search engines advise against them
   because their crawlers would never see the other versions. Visitors switch
   with a row of language links at the foot of each guide page. A click also
   saves the choice to the existing cookie, so the app opens in that language.
5. **Old branch:** drop its guide-locale code and keep its strings for Phase 2.

## Cost and limits

- **Money:** none. The pages are static files on Cloudflare Pages, where
  static requests are free. There are no new services and no CI.
- **Build:** the guide tree has about 60 prerendered pages, so this adds about
  300 HTML files. The last local build output held 6,683 files; Cloudflare's
  per-deploy limit is 20,000. Measure the prerender time on d2 in Task 8.
- **Worker size:** Cloudflare's hard cap is 25 MiB and the worker was 20.5 MB
  after v0.46.0. Statically importing five 600 KB catalogs into server code
  would add about 3 MB. Task 3 avoids that: it imports catalogs with `?url`
  and reads them with `read()`, so they stay static assets. Task 8 measures
  the worker the way Cloudflare builds it.
- **Routing rules:** `_routes.json` is capped at 100 rules and
  `pagesRouteExcludes` already uses 29 before the `<prerendered>` tail. This
  adds 5 (`/de/*` and the other four).

## File map

| File                                                                                                           | Role                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Create `src/lib/shared/i18n/seo-locales.ts`                                                                    | Registry: locales, localized-path test, path split/join, alternates, `localizeHref`          |
| Create `tests/unit/seo-locales.test.ts`                                                                        | Registry unit tests                                                                          |
| Create `src/hooks.ts`                                                                                          | Universal `reroute`                                                                          |
| Modify `src/hooks.server.ts`                                                                                   | Request page locale, catalog via `read()`, `<html lang dir>`                                 |
| Modify `src/app.d.ts`                                                                                          | `App.Locals.pageLocale`, `pageMessages`                                                      |
| Modify `src/lib/shared/i18n/i18n.svelte.ts`                                                                    | SSR reads the request catalog; `setPageLocale()` sets the language without saving the cookie |
| Create `tests/unit/page-locale-ssr.test.ts`                                                                    | Concurrency and scope tests (adapted from the old branch's `guide-ssr-locale.test.ts`)       |
| Modify `src/routes/(public)/+layout.ts`                                                                        | Browser `load` sets the page locale before hydration                                         |
| Create `src/lib/shared/components/LocaleAlternates.svelte`                                                     | hreflang, x-default, og:locale alternates                                                    |
| Modify `src/lib/shared/components/Seo.svelte`, `src/routes/(public)/guide/level-1/_components/GuideSeo.svelte` | Localized canonical, og:locale, inLanguage, alternates                                       |
| Modify about 46 guide files that build `/guide/...` hrefs                                                      | Wrap with `localizeHref`                                                                     |
| Create `src/routes/(public)/guide/_components/GuideLanguageLinks.svelte`                                       | Foot-of-page language links                                                                  |
| Modify `vite.config.ts`                                                                                        | Prerender entries, route excludes                                                            |
| Modify `src/routes/sitemap.xml/+server.ts`                                                                     | Localized URLs                                                                               |
| Modify `src/app.html`                                                                                          | Boot script prefers the URL's language                                                       |
| Create `scripts/check-localized-prerender.mjs`, add `seo:check-locales` to `package.json`                      | Post-build gate                                                                              |

---

### Task 1: Locale registry

**Files:** create `src/lib/shared/i18n/seo-locales.ts` and
`tests/unit/seo-locales.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  SEO_LOCALES,
  alternatesFor,
  isLocalizedPublicPath,
  localizeHref,
  localizePath,
  splitLocalePath,
} from "#lib/shared/i18n/seo-locales.js";
import { normalizeModuleId } from "#lib/shared/navigation/config/module-definitions.js";

describe("seo locale registry", () => {
  it("splits a language folder off the path", () => {
    expect(splitLocalePath("/de/guide/level-2")).toEqual({
      locale: "de",
      path: "/guide/level-2",
    });
    expect(splitLocalePath("/guide/level-2")).toEqual({
      locale: "en",
      path: "/guide/level-2",
    });
    expect(splitLocalePath("/de")).toEqual({ locale: "de", path: "/" });
    expect(splitLocalePath("/ja/guide")).toEqual({
      locale: "en",
      path: "/ja/guide",
    });
  });

  it("localizes only the guide tree, minus replicas and tools", () => {
    expect(isLocalizedPublicPath("/guide")).toBe(true);
    expect(isLocalizedPublicPath("/guide/zans-diamond")).toBe(true);
    expect(isLocalizedPublicPath("/guide/level-1/print")).toBe(false);
    expect(isLocalizedPublicPath("/guide/level-1/book/3")).toBe(false);
    expect(isLocalizedPublicPath("/guidebook")).toBe(false);
    expect(isLocalizedPublicPath("/about")).toBe(false);
  });

  it("builds localized paths and hrefs", () => {
    expect(localizePath("/guide/level-2", "en")).toBe("/guide/level-2");
    expect(localizePath("/guide/level-2", "fr")).toBe("/fr/guide/level-2");
    const here = new URL("https://tkaflowarts.com/es/guide");
    expect(localizeHref("/guide/level-1/letters#a", here)).toBe(
      "/es/guide/level-1/letters#a"
    );
    expect(localizeHref("/about", here)).toBe("/about");
    expect(localizeHref("https://example.com/guide", here)).toBe(
      "https://example.com/guide"
    );
    expect(
      localizeHref("/guide", new URL("https://tkaflowarts.com/guide"))
    ).toBe("/guide");
  });

  it("lists every language plus x-default for a localized path", () => {
    const alt = alternatesFor("/guide/ratios");
    expect(alt.map((a) => a.hreflang)).toEqual([
      "en",
      ...SEO_LOCALES,
      "x-default",
    ]);
    expect(alt.find((a) => a.hreflang === "x-default")?.path).toBe(
      "/guide/ratios"
    );
    expect(alternatesFor("/about")).toEqual([]);
  });

  it("never collides with an app module id", () => {
    for (const locale of SEO_LOCALES)
      expect(normalizeModuleId(locale)).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/seo-locales.test.ts`
Expected: FAIL, cannot resolve `seo-locales.js`.

- [ ] **Step 3: Implement**

```ts
/**
 * Languages that publish their own crawlable copy of public pages, and which
 * pages have one. A locale joins only after its pages pass
 * scripts/check-localized-prerender.mjs (no English left in the text).
 * Every consumer reads this module: reroute, the server hook, head tags,
 * links, the sitemap, prerender entries and Cloudflare route excludes.
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
const EXCLUDED_PREFIXES = [
  "/guide/level-1/print",
  "/guide/level-1/book",
  "/guide/level-1/handbook",
  "/guide/level-1/cover-lab",
];

const under = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

export function isSeoLocale(value: string): value is SeoLocale {
  return (SEO_LOCALES as readonly string[]).includes(value);
}

export function isLocalizedPublicPath(path: string): boolean {
  return (
    LOCALIZED_ROOTS.some((root) => under(path, root)) &&
    !EXCLUDED_PREFIXES.some((prefix) => under(path, prefix))
  );
}

export function splitLocalePath(pathname: string): {
  locale: PageLocale;
  path: string;
} {
  const [, first = "", ...rest] = pathname.split("/");
  if (!isSeoLocale(first)) return { locale: "en", path: pathname };
  return { locale: first, path: `/${rest.join("/")}` };
}

export function localizePath(path: string, locale: PageLocale): string {
  return locale === "en" ? path : `/${locale}${path === "/" ? "" : path}`;
}

/** Point an internal link at the current page's language when that page exists. */
export function localizeHref(href: string, current: URL): string {
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

export function alternatesFor(
  path: string
): Array<{ hreflang: string; path: string }> {
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
```

- [ ] **Step 4: Run it and see it pass**

Run the same command. Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/i18n/seo-locales.ts tests/unit/seo-locales.test.ts
git commit -m "feat(seo): registry of search locales and localized public paths" -- src/lib/shared/i18n/seo-locales.ts tests/unit/seo-locales.test.ts
```

### Task 2: Route `/de/guide/...` to the existing guide routes

**Files:** create `src/hooks.ts`.

- [ ] **Step 1: Implement** (it is a thin wrapper; Task 1 tests the logic)

```ts
import type { Reroute } from "@sveltejs/kit/hooks";
import {
  isLocalizedPublicPath,
  splitLocalePath,
} from "#lib/shared/i18n/seo-locales.js";

/**
 * /de/guide/x renders the /guide/x route; the URL keeps its language folder,
 * which the server hook and the public layout read. Paths with no localized
 * version fall through and 404 (a language folder is not an app module).
 */
export const reroute: Reroute = ({ url }) => {
  const { locale, path } = splitLocalePath(url.pathname);
  if (locale !== "en" && isLocalizedPublicPath(path)) return path;
};
```

Use the same `@sveltejs/kit/hooks` import source as `src/hooks.server.ts`.

- [ ] **Step 2: Check routing in a worktree dev server**

Follow `.claude/rules/resource-budget.md` first. Then start Vite from the task
worktree on a free port, never 5173. Then run:
`curl.exe -k -s -o NUL -w "%{http_code}" https://localhost:<port>/de/guide/zans-diamond`
Expected: `200`. `/de/about` and `/de/create` give `404`.

- [ ] **Step 3: Commit** `src/hooks.ts` with an explicit pathspec.

### Task 3: Server renders the URL's language, request by request

**Files:** modify `src/hooks.server.ts`, `src/app.d.ts` and
`src/lib/shared/i18n/i18n.svelte.ts`; create `tests/unit/page-locale-ssr.test.ts`.

- [ ] **Step 1: Spike `read()` for catalogs (10 minutes, then decide)**

In `hooks.server.ts` import one catalog as an asset URL and read it:

```ts
import { read } from "$app/server";
import deCatalogUrl from "../messages/de.json?url";
// inside handle, temporary:
const de = await read(deCatalogUrl).json();
```

Confirm it works in Vite dev and during prerender. For prerender, run
`pwsh scripts/d2-run.ps1 "pnpm run build"` on d2 after a WIP commit, and check
that `.svelte-kit/output/prerendered/pages/de/guide.html` (Task 8 adds it as an
entry) contains German. If `read()` fails for JSON `?url` assets, fall back to
a dynamic `import()` of `../messages/${locale}.json`. Then measure the worker
in Task 8 with the recipe in memory note `reference_cf_worker_size_limit`.
Record which path won in the commit message.

- [ ] **Step 2: Write the failing concurrency test**

```ts
import type { Handle } from "@sveltejs/kit/hooks";
import { describe, expect, it, vi } from "vitest";

vi.mock("#lib/server/auth/firebase-auth-handler-proxy.js", () => ({
  isFirebaseAuthHandlerPath: () => false,
  proxyFirebaseAuthHandler: vi.fn(),
}));
vi.mock("#lib/server/auth/meta-oauth-proxy.js", () => ({
  isMetaOAuthProxyPath: () => false,
  proxyMetaOAuthRequest: vi.fn(),
}));

import { handle } from "../../src/hooks.server";

async function render(path: string) {
  const request = new Request(`https://tkaflowarts.com${path}`);
  const locals = {} as App.Locals;
  const event = {
    url: new URL(request.url),
    request,
    route: { id: "/(public)/guide/level-2" },
    params: {},
    locals,
    cookies: { get: () => undefined },
  };
  const resolve: Parameters<Handle>[0]["resolve"] = async (_e, options) => {
    await Promise.resolve();
    const html = await options?.transformPageChunk?.({
      html: '<html lang="en" class="dark"><body></body></html>',
      done: true,
    });
    return new Response(html);
  };
  const response = await handle({
    event,
    resolve,
  } as unknown as Parameters<Handle>[0]);
  return { html: await response.text(), locals };
}

describe("page language from the URL", () => {
  it("keeps concurrent German and English renders apart", async () => {
    const [de, en] = await Promise.all([
      render("/de/guide/level-2"),
      render("/guide/level-2"),
    ]);
    expect(de.html).toContain('<html lang="de" dir="ltr"');
    expect(de.locals.pageMessages?.action_cancel).toBe("Abbrechen");
    expect(en.html).toContain('<html lang="en"');
    expect(en.locals.pageMessages).toBeUndefined();
  });

  it("ignores the cookie and non-localized paths", async () => {
    const other = await render("/de/about");
    expect(other.locals.pageLocale).toBeUndefined();
  });
});
```

If the spike chose `read()`, mock `$app/server` `read` in this test to return
`new Response(JSON.stringify(deJson))` for the German catalog URL.

- [ ] **Step 3: Run it and see it fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/page-locale-ssr.test.ts`

- [ ] **Step 4: Implement**

`src/app.d.ts`, inside `namespace App`:

```ts
interface Locals {
  /** Language of a localized public page, from its URL folder. */
  pageLocale?: import("#lib/shared/i18n/seo-locales.js").SeoLocale;
  pageMessages?: Record<string, string>;
}
```

Keep any existing `Locals` members.

`src/hooks.server.ts`. Install the request accessor once at module level. The
shared i18n module also runs in the browser and in workers, so it must not
import `$app/server` itself:

```ts
import { getRequestEvent, read } from "$app/server";
import {
  isLocalizedPublicPath,
  splitLocalePath,
  type SeoLocale,
} from "#lib/shared/i18n/seo-locales.js";
import { rtlLocales } from "#lib/shared/i18n/i18n.svelte.js";
import deUrl from "../messages/de.json?url";
import esUrl from "../messages/es.json?url";
import frUrl from "../messages/fr.json?url";
import itUrl from "../messages/it.json?url";
import ptUrl from "../messages/pt.json?url";

const CATALOG_URL: Record<SeoLocale, string> = {
  de: deUrl,
  es: esUrl,
  fr: frUrl,
  it: itUrl,
  pt: ptUrl,
};
const catalogCache = new Map<SeoLocale, Promise<Record<string, string>>>();
const catalogFor = (locale: SeoLocale) => {
  if (!catalogCache.has(locale))
    catalogCache.set(locale, read(CATALOG_URL[locale]).json());
  return catalogCache.get(locale)!;
};

(
  globalThis as typeof globalThis & {
    __tkaRequestEvent?: typeof getRequestEvent;
  }
).__tkaRequestEvent = getRequestEvent;
```

In `handle`, before `resolve`, and wrapping the existing transformer:

```ts
const { locale: pageLocale, path: pagePath } = splitLocalePath(
  event.url.pathname
);
if (pageLocale !== "en" && isLocalizedPublicPath(pagePath)) {
  event.locals.pageLocale = pageLocale;
  event.locals.pageMessages = await catalogFor(pageLocale);
}
const transformLandingChunk = createLandingPageTransformer(routePath);
const response = await resolve(event, {
  preload: (asset) => shouldPreloadRouteAsset(routePath, asset),
  transformPageChunk: (chunk) => {
    const html = transformLandingChunk(chunk);
    const lang = event.locals.pageLocale;
    if (!lang) return html;
    const dir = rtlLocales.includes(lang) ? "rtl" : "ltr";
    return html.replace('<html lang="en"', `<html lang="${lang}" dir="${dir}"`);
  },
});
```

`src/lib/shared/i18n/i18n.svelte.ts`. Add a request-scoped lookup and use it in
`getLocale`, `t` and `tDynamic`, as the old branch did. The fallback chain stays
unchanged; only the active catalog and locale come from the request:

```ts
function requestCatalog(): { locale: Locale; messages: Messages } | undefined {
  if (!import.meta.env.SSR) return undefined;
  try {
    const getEvent = (
      globalThis as typeof globalThis & {
        __tkaRequestEvent?: () => { locals: App.Locals };
      }
    ).__tkaRequestEvent;
    const locals = getEvent?.().locals;
    if (locals?.pageLocale && locals.pageMessages) {
      return {
        locale: locals.pageLocale,
        messages: locals.pageMessages as Messages,
      };
    }
  } catch {
    // Utility calls outside a request (tests, scripts) have no event.
  }
  return undefined;
}

export function getLocale(): Locale {
  return requestCatalog()?.locale ?? currentLocale;
}
```

In `t()` and `tDynamic()` replace the first lines with:

```ts
const scoped = requestCatalog();
const activeLocale = scoped?.locale ?? currentLocale;
let text = (scoped?.messages ?? messages)[key];
```

Then use `activeLocale` everywhere those functions now read `currentLocale`.

Add the client-side setter. Split `setLocale` into a shared body with a
`persist` flag:

```ts
export async function setLocale(locale: Locale): Promise<void> {
  await applyLocale(locale, true);
}

/** A localized public page's language: shown, never saved as the visitor's choice. */
export async function setPageLocale(locale: Locale): Promise<void> {
  await applyLocale(locale, false);
}
```

Move the current `setLocale` body into `applyLocale(locale, persist)`, and guard
the cookie write with `if (persist && typeof document !== "undefined")`.

- [ ] **Step 5: Run the new test and the i18n set**

```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/page-locale-ssr.test.ts tests/unit/seo-locales.test.ts tests/unit/i18n-catalog-contract.test.ts
```

Add the other four existing i18n test files (`ls tests/unit | grep -i i18n`)
to the same command. Expected: all pass.

- [ ] **Step 6: Commit** the four files with explicit pathspecs.

### Task 4: Browser keeps the page's language through hydration

**Files:** modify `src/routes/(public)/+layout.ts`.

- [ ] **Step 1: Implement**

```ts
import { browser } from "$app/env";
import {
  isLocalizedPublicPath,
  splitLocalePath,
} from "#lib/shared/i18n/seo-locales.js";

// Public routes are prerendered as static HTML at build time
export const prerender = true;
export const ssr = true;

// A localized page's HTML is already in its language. Load that catalog
// before hydration so the first browser render matches it, and set English
// back on unprefixed public pages. Neither choice is saved to the cookie;
// public pages follow their URL.
export async function load({ url }) {
  if (!browser) return {};
  const { locale, path } = splitLocalePath(url.pathname);
  const { setPageLocale } = await import("#lib/shared/i18n/i18n.svelte.js");
  await setPageLocale(
    locale !== "en" && isLocalizedPublicPath(path) ? locale : "en"
  );
  return {};
}
```

Use the same `browser` import source as the rest of the codebase
(`rg -n "browser \} from \"\\\$app" src | head -1`).

- [ ] **Step 2: Browser check**

In the agent browser, against the worktree server, open `/de/guide/zans-diamond`.
Check that there is no hydration warning in the console, that the heading and
body are German before and after hydration (read the accessibility tree), and
that `document.cookie` has no `PARAGLIDE_LOCALE` set by the visit. Then open
`/guide/zans-diamond` in the same tab and confirm it is English.

- [ ] **Step 3: Commit.**

### Task 5: Head tags: canonical, hreflang, og:locale, inLanguage

**Files:** create `src/lib/shared/components/LocaleAlternates.svelte`; modify
`Seo.svelte` and `GuideSeo.svelte`.

- [ ] **Step 1: Implement `LocaleAlternates.svelte`**

```svelte
<script lang="ts">
  /**
   * hreflang alternates for a page that exists in several languages: one per
   * language plus x-default (English). Search engines need the set on every
   * version, each listing all the others and itself.
   */
  import { LANDING_DOMAIN } from "../../../config/domains";
  import {
    OG_LOCALE,
    SEO_LOCALES,
    alternatesFor,
    type PageLocale,
  } from "../i18n/seo-locales.js";

  let { path, locale }: { path: string; locale: PageLocale } = $props();
  const alternates = $derived(alternatesFor(path));
  const otherLocales = $derived(
    (["en", ...SEO_LOCALES] as PageLocale[]).filter((other) => other !== locale)
  );
</script>

{#each alternates as alt (alt.hreflang)}
  <link
    rel="alternate"
    hreflang={alt.hreflang}
    href={`${LANDING_DOMAIN}${alt.path}`}
  />
{/each}
{#if alternates.length}
  {#each otherLocales as other (other)}
    <meta property="og:locale:alternate" content={OG_LOCALE[other]} />
  {/each}
{/if}
```

- [ ] **Step 2: Wire into `GuideSeo.svelte`**

```ts
import { page } from "$app/state";
import LocaleAlternates from "#lib/shared/components/LocaleAlternates.svelte";
import {
  OG_LOCALE,
  localizePath,
  splitLocalePath,
} from "#lib/shared/i18n/seo-locales.js";

const pageLocale = $derived(splitLocalePath(page.url.pathname).locale);
const canonical = $derived(abs(localizePath(path, pageLocale)));
```

Replace `inLanguage: "en"` with `inLanguage: pageLocale` in both JSON-LD
branches and `content="en_US"` with `content={OG_LOCALE[pageLocale]}`. Then
render `<LocaleAlternates {path} locale={pageLocale} />` inside
`<svelte:head>`. The `educationalLevel`, `teaches` and
`learningResourceType` strings move to catalog keys: add three `guide_seo_*`
keys to `messages/en.json` at their prefix position and translate them for
de/es/fr/it/pt through the normal batch path. Do not hardcode per-language
ternaries as the old branch did. Breadcrumb `path`s and `partOf.path` pass
through `localizePath(..., pageLocale)`.

- [ ] **Step 3: Wire into `Seo.svelte`** the same way: canonical is
      `localizePath` of the English canonical path, and `og:locale` and
      `<LocaleAlternates>` are added. Pages outside the localized set get an empty
      alternates list, so their output stays identical.

- [ ] **Step 4: Check** `curl` of `/de/guide/ratios` from the worktree server.
      It must show `<link rel="canonical" href="https://tkaflowarts.com/de/guide/ratios">`,
      six `hreflang` links plus `x-default`, `og:locale` `de_DE` and
      `"inLanguage":"de"`. Check `/about` and confirm it gained no alternates.

- [ ] **Step 5: Commit.**

### Task 6: Links stay in the reader's language, and visitors can switch

**Files:** about 46 files under `src/routes/(public)/guide/` that build
`/guide/...` hrefs. List them with
`rg -l "[\"'\`]/guide(/|[\"'\`])" "src/routes/(public)/guide" src/lib/shared/guide-topics`.
Create `src/routes/(public)/guide/\_components/GuideLanguageLinks.svelte`.

- [ ] **Step 1: Wrap every internal guide href**

In components: `import { page } from "$app/state"` and
`href={localizeHref("/guide/level-2", page.url)}`. Link builders in `_data/*.ts`
(such as `guide-page-links.ts`) return English paths. Wrap them where a
component renders them, so data modules stay free of `$app/state`. `goto(...)`
calls get the same wrap. This step is mechanical; one agent (`haiku`) may do it
with the file list and this rule.

- [ ] **Step 2: Add the language links** at the foot of `GuideShell` (and the
      level-1 reader footer). Each link uses the language's own name:

```svelte
<script lang="ts">
  import { page } from "$app/state";
  import { setLocale, t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    alternatesFor,
    splitLocalePath,
    type PageLocale,
  } from "#lib/shared/i18n/seo-locales.js";

  // Each language is named in itself, so a reader finds their own.
  const NAMES: Record<PageLocale, string> = {
    en: "English",
    de: "Deutsch",
    es: "Español",
    fr: "Français",
    it: "Italiano",
    pt: "Português",
  };
  const here = $derived(splitLocalePath(page.url.pathname));
  const links = $derived(
    alternatesFor(here.path).filter(
      (a) => a.hreflang !== "x-default"
    ) as Array<{
      hreflang: PageLocale;
      path: string;
    }>
  );
</script>

{#if links.length}
  <nav class="guide-languages" aria-label={t("guide_languages_label")}>
    {#each links as link (link.hreflang)}
      <a
        href={link.path}
        hreflang={link.hreflang}
        lang={link.hreflang}
        aria-current={link.hreflang === here.locale ? "page" : undefined}
        onclick={() => void setLocale(link.hreflang)}>{NAMES[link.hreflang]}</a
      >
    {/each}
  </nav>
{/if}
```

Add `guide_languages_label` ("Language") to `messages/en.json` at its prefix
position, with translations for the five locales. Style the row with the guide
footer's existing tokens per `src/AGENTS.md` and
`docs/architecture/visual-design-canon.md`.

- [ ] **Step 3: Visual check** in the agent browser at phone, tablet and desktop
      widths on `/fr/guide/level-2`. The row must not overflow, the current language
      must be marked, a click moves to the same page in the chosen language, and
      then opening `/create` shows the app in that language.

- [ ] **Step 4: Commit** with an explicit list of every touched file.

### Task 7: Post-build gate

**Files:** create `scripts/check-localized-prerender.mjs` and
`tests/unit/check-localized-prerender.test.ts`; add
`"seo:check-locales": "node scripts/check-localized-prerender.mjs"` to
`package.json`.

- [ ] **Step 1: Write the fixture test first**

The test builds two small trees in a temp directory: one German page with the
right lang, canonical, hreflang set and German text, and one that repeats the
English sentences. It runs the script with `ROOT` overridden by the
`SEO_PRERENDER_ROOT` environment variable, expecting exit 0 for the first and
exit 1 naming "still English" for the second.

- [ ] **Step 2: Implement**

```js
// Checks the prerendered language pages after `pnpm run build`.
// Fails when a page is missing, mislabeled, links back into English, or still
// shows English text. Run on d2 with the build.
import fs from "node:fs";
import path from "node:path";

const ROOT =
  process.env.SEO_PRERENDER_ROOT ?? ".svelte-kit/output/prerendered/pages";
const SITE = "https://tkaflowarts.com";
const LOCALES = ["de", "es", "fr", "it", "pt"]; // keep equal to SEO_LOCALES
const MAX_ENGLISH_SHARE = 0.1;
const failures = [];

const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : entry.name.endsWith(".html")
          ? [path.join(dir, entry.name)]
          : []
    );

// Visible sentences of four or more words inside <main>.
const sentences = (html) =>
  (html.split(/<main[\s>]/)[1] ?? html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .split(/\n|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4);

// Anchors into the English guide that are not the language row's own links.
const englishLinks = (html) =>
  (html.match(/<a\b[^>]*>/g) ?? []).filter(
    (tag) => /href="\/guide(\/[^"]*)?"/.test(tag) && !/hreflang=/.test(tag)
  );

for (const locale of LOCALES) {
  const dir = path.join(ROOT, locale);
  if (!fs.existsSync(dir)) {
    failures.push(`${locale}: no pages`);
    continue;
  }
  for (const file of walk(dir)) {
    const rel = file
      .slice(dir.length)
      .replace(/\\/g, "/")
      .replace(/\.html$/, "");
    const where = `/${locale}${rel}`;
    const html = fs.readFileSync(file, "utf8");
    if (!html.includes(`<html lang="${locale}"`))
      failures.push(`${where}: lang`);
    if (!html.includes(`rel="canonical" href="${SITE}${where}"`))
      failures.push(`${where}: canonical`);
    for (const tag of ["en", ...LOCALES, "x-default"])
      if (!html.includes(`hreflang="${tag}"`))
        failures.push(`${where}: hreflang ${tag}`);
    const stray = englishLinks(html);
    if (stray.length)
      failures.push(
        `${where}: ${stray.length} links into English, e.g. ${stray[0]}`
      );
    const enFile = path.join(ROOT, `${rel.replace(/^\//, "")}.html`);
    if (!fs.existsSync(enFile)) {
      failures.push(`${where}: no English twin`);
      continue;
    }
    const english = new Set(sentences(fs.readFileSync(enFile, "utf8")));
    const mine = sentences(html);
    const leaked = mine.filter((s) => english.has(s));
    if (mine.length && leaked.length / mine.length > MAX_ENGLISH_SHARE)
      failures.push(
        `${where}: ${leaked.length}/${mine.length} sentences still English, e.g. "${leaked[0]}"`
      );
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("localized prerender ok");
```

- [ ] **Step 3: Run the fixture test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/check-localized-prerender.test.ts`
Expected: both cases pass.

- [ ] **Step 4: Commit** the script, the fixture test and `package.json`.

### Task 8: Prerender entries, Cloudflare routes, sitemap, boot screen

**Files:** modify `vite.config.ts`, `src/routes/sitemap.xml/+server.ts` and
`src/app.html`.

- [ ] **Step 1: `vite.config.ts`**

```ts
import { SEO_LOCALES } from "./src/lib/shared/i18n/seo-locales";
// in svelteKitOptions.prerender:
entries: ["*", ...SEO_LOCALES.map((locale) => `/${locale}/guide`)],
```

The crawler follows `<a href>` and `<link href>`, so the hreflang links and
localized nav reach every page from these roots. In `pagesRouteExcludes`, add
`...SEO_LOCALES.map((locale) => \`/${locale}/\*\`)`before the`<prerendered>`marker. All language pages are static; an unknown`/de/...` path gets
Cloudflare's static 404.

- [ ] **Step 2: Sitemap.** For every entry whose path passes
      `isLocalizedPublicPath`, also emit `localizePath(path, locale)` for each
      `SEO_LOCALES` locale. The HTML hreflang tags carry the language pairing, so the
      sitemap only lists the URLs.

- [ ] **Step 3: Boot screen.** In the `src/app.html` boot script, read
      `location.pathname.split("/")[1]` first. If it is a known boot locale, use it
      before the cookie, so `/de/...` pages start in German.

- [ ] **Step 4: Build and gate on d2** (commit first; only committed work runs there)

```powershell
pwsh scripts/d2-run.ps1 -Name seo-build "pnpm run build && pnpm run seo:check-locales"
```

Expected: the build passes and the script prints `localized prerender ok`.
Record the prerender time and page count against the previous build. Then
measure the worker on d2 with the wrangler recipe in memory note
`reference_cf_worker_size_limit`. It must stay under 23 MB, leaving room under
the 25 MiB cap. A leak failure for a locale means that locale's guide strings
are incomplete. Fix the catalog, don't loosen the threshold.

- [ ] **Step 5: Commit.**

### Task 9: Integrate and deliver

- [ ] Bring the branch current with local main and re-run the focused tests
      from Tasks 1, 3 and 7.
- [ ] From `E:/tka-platform`:
      `npm run wt:finish -- codex/seo-locale-pages --route /de/guide/zans-diamond`.
- [ ] On the primary server, open
      [https://localhost:5173/de/guide/zans-diamond](https://localhost:5173/de/guide/zans-diamond)
      and [https://localhost:5173/guide/zans-diamond](https://localhost:5173/guide/zans-diamond)
      in the agent browser and confirm language, head tags and links.
- [ ] Do not push. Shipping is Austen's go. After it ships, he resubmits the
      sitemap in Search Console (his account) and uses URL Inspection on one `/de/`
      page.

## Later phases (not in this plan)

- **Landing, about, FAQ, notation, tricks, timing-and-direction:** move their
  copy into the catalogs (Phase 2), translate, add each root to
  `LOCALIZED_ROOTS`, and let the leak gate admit them.
- **ja/ru/ko:** run their P batches, add them to `SEO_LOCALES`, and pass the gate.
- **zh/ar:** wave 3; ar exercises `dir="rtl"`.
- **Stale translations:** when English guide text changes, the translated page
  keeps the old meaning. The open follow-up (record an English source hash per
  key) matters more once these pages are public.

## Self-review

- Coverage: URLs (T1, T2), server language (T3), hydration (T4), head tags
  (T5), links and switching (T6), quality gate (T7), discovery, routing,
  sitemap and limits (T8), delivery (T9). Cost, worker size, route cap and file
  count are measured in T8.
- Names used across tasks: `SEO_LOCALES`, `SeoLocale`, `PageLocale`,
  `OG_LOCALE`, `isLocalizedPublicPath`, `splitLocalePath`, `localizePath`,
  `localizeHref`, `alternatesFor`, `setPageLocale`, `requestCatalog`,
  `App.Locals.pageLocale` and `pageMessages`, all defined in T1 or T3.
- Open measurement: whether `read()` serves JSON `?url` assets during
  prerender (T3 step 1 spike, with a stated fallback).
