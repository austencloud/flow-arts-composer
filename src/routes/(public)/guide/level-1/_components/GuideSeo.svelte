<script lang="ts">
  /**
   * One SEO surface for every indexable guide page - canonical URL, Open Graph,
   * Twitter card, and a schema.org JSON-LD graph (the learning resource / course
   * + author + publisher + breadcrumb trail). Pages pass structured props; this
   * owns the head markup so no guide page hand-rolls meta tags (and so the
   * canonical/OG/JSON-LD stay consistent across the chapter set).
   *
   * The /print + /book replicas stay `noindex` (they're derivatives); the
   * canonical always points at the reflowable article route rendered here.
   */
  import { page } from "$app/state";
  import LocaleAlternates from "#lib/shared/components/LocaleAlternates.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    localizePath,
    splitLocalePath,
  } from "#lib/shared/i18n/seo-locales.js";
  import { LANDING_DOMAIN } from "../../../../../config/domains";

  type Crumb = { name: string; path: string };
  let {
    title,
    description,
    path,
    image = "/guide/level-1/images/_shared/level-1-front-cover.png",
    kind = "LearningResource",
    breadcrumbs = [] as Crumb[],
    partOf = null as { name: string; path: string } | null,
    datePublished = "2026-03-27",
  }: {
    title: string;
    description: string;
    path: string;
    image?: string;
    kind?: "Course" | "LearningResource";
    breadcrumbs?: Crumb[];
    partOf?: { name: string; path: string } | null;
    datePublished?: string;
  } = $props();

  const abs = (p: string) => (p.startsWith("http") ? p : `${LANDING_DOMAIN}${p}`);
  // /de/guide/... is the German edition of the English path it is given.
  const pageLocale = $derived(splitLocalePath(page.url.pathname).locale);
  const localized = (p: string) => abs(localizePath(p, pageLocale));
  const canonical = $derived(localized(path));
  const imageAbs = $derived(abs(image));

  const AUTHOR = { "@type": "Person", name: "Austen Cloud", url: `${LANDING_DOMAIN}/about` };
  const PUBLISHER = {
    "@type": "Organization",
    name: "The Kinetic Alphabet",
    url: `${LANDING_DOMAIN}/`,
    logo: { "@type": "ImageObject", url: `${LANDING_DOMAIN}/pwa/icons/icon-512x512.png` },
  };

  const jsonLd = $derived.by(() => {
    const main =
      kind === "Course"
        ? {
            "@type": "Course",
            name: title,
            description,
            url: canonical,
            provider: PUBLISHER,
            author: AUTHOR,
            inLanguage: pageLocale,
            educationalLevel: t("guide_seo_educational_level"),
            teaches: t("guide_seo_teaches"),
          }
        : {
            "@type": "LearningResource",
            name: title,
            description,
            url: canonical,
            learningResourceType: t("guide_seo_resource_type"),
            educationalUse: "instruction",
            educationalLevel: t("guide_seo_educational_level"),
            author: AUTHOR,
            publisher: PUBLISHER,
            inLanguage: pageLocale,
            datePublished,
            ...(partOf
              ? { isPartOf: { "@type": "Course", name: partOf.name, url: localized(partOf.path) } }
              : {}),
          };

    const graph: Record<string, unknown>[] = [main];
    if (breadcrumbs.length) {
      graph.push({
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((b, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: b.name,
          item: localized(b.path),
        })),
      });
    }
    // Escape "<" so the serialized graph can't break out of the <script> element.
    return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(
      /</g,
      "\\u003c"
    );
  });
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />

  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="The Kinetic Alphabet" />
  <LocaleAlternates {path} />
  <meta property="og:url" content={canonical} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={imageAbs} />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@tkaflowarts" />
  <meta name="twitter:creator" content="@tkaflowarts" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={imageAbs} />

  {@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>
