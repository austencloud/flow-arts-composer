<script lang="ts">
  /**
   * SiteFooter owns three compositions of the same navigation: the full
   * interior footer, the compact homepage footer, and a sitemap-only handoff
   * for pages that already finish with their own brand and Composer action.
   * MarketingChrome renders it outside the route crossfade, while the guide
   * subtree uses the full default.
   *
   * Terms/Privacy keep LandingFooter's behavior: on narrow viewports they
   * open the in-place LegalSheet instead of navigating.
   */
  import LegalSheet from "$lib/shared/legal/components/LegalSheet.svelte";
  import { trackCtaClick } from "$lib/shared/analytics/landing-events";
  import { siteCopy } from "../site-copy";

  let {
    variant = "full",
    surface,
    immersive = false,
  }: {
    variant?: "full" | "compact" | "sitemap";
    /**
     * The opaque surface the page above runs to the viewport edge, when it has
     * one. Given it, the footer continues that surface rather than settling
     * onto the cosmic background: no handoff gap, no sky scrim, no hairline
     * across what should read as one continuous page. Pages that float their
     * content on the star field leave this unset.
     */
    surface?: string;
    /**
     * Hide the footer after a viewport-sized room on non-phone layouts. The
     * room's persistent header already provides global navigation; phones keep
     * the compact footer after their document-flow version of the same page.
     */
    immersive?: boolean;
  } = $props();

  let sheetOpen = $state(false);
  let sheetType = $state<"terms" | "privacy">("terms");

  const MOBILE_BREAKPOINT = 768;

  function handleLegalClick(e: MouseEvent, type: "terms" | "privacy") {
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      e.preventDefault();
      sheetType = type;
      sheetOpen = true;
    }
  }

  interface FooterColumn {
    title: string;
    links: { label: string; href: string }[];
  }

  /**
   * Eight links, two columns — cut from eighteen across four on 2026-08-25.
   *
   * The footer sits on every public page, so a link here is a claim that the
   * destination is a site-level place. Four of the old columns did not clear
   * that bar:
   *
   * - Props (Double Staves, Clubs, Fans, Buugeng) — four per-prop notation
   *   pages the header's Notation menu deliberately omits. They are leaves of
   *   /notation, reachable from it, not destinations in their own right.
   * - Endless LOOPs, Poi and TKA, Double Staff Codex — the other three links
   *   that existed only here. Same reason: leaf pages under /endless-spinner,
   *   /history, and /guide.
   * - The Shop column was a verbatim copy of the header's Shop dropdown, and
   *   `SALES_LIVE` is false, so all four pointed into a storefront that says it
   *   is not open. The storefront stays browsable, so one "Shop" link remains
   *   and the product links stay with the header, which owns that menu.
   *
   * Anything cut is still reachable from its parent page and from the header.
   * Before adding a row here, ask whether the header already carries it.
   */
  const COLUMNS: FooterColumn[] = [
    {
      title: "Explore",
      links: [
        { label: "History", href: "/history" },
        { label: "Composer", href: "/composer" },
        { label: "Shop", href: "/shop" },
        { label: "About", href: "/about" },
      ],
    },
    {
      title: "Learn",
      links: [
        { label: "Interactive lessons", href: "/learn/concepts" },
        { label: "Timing & Direction", href: "/timing-and-direction" },
        { label: "Trick names", href: "/tricks" },
        { label: "Shape names", href: "/flowers" },
        { label: "Read the Guide", href: "/guide" },
        { label: "Kinetic Atlas", href: "/atlas" },
        { label: "FAQ", href: "/faq" },
      ],
    },
  ];

  const year = new Date().getFullYear();
</script>

{#snippet columnLinks(col: FooterColumn)}
  <div class="col-content">
    <ul>
      {#each col.links as link}
        <li><a href={link.href}>{siteCopy(link.label)}</a></li>
      {/each}
    </ul>
  </div>
{/snippet}

<footer
  class="site-footer"
  class:compact={variant === "compact"}
  class:full={variant === "full"}
  class:sitemap={variant === "sitemap"}
  class:surfaced={Boolean(surface)}
  class:immersive
  style:background={surface}
>
  <div class="inner">
    <div
      class:cols={variant !== "compact"}
      class:compact-main={variant === "compact"}
    >
      {#if variant !== "sitemap"}
        <div class="brand">
          <a
            href="/"
            class="wordmark"
            aria-label={siteCopy("TKA, The Kinetic Alphabet, Home")}>TKA</a
          >
          <p class="tagline">{siteCopy("Notation for flow arts.")}</p>
          {#if variant === "full"}
            <a
              class="composer-cta"
              href="/create"
              data-sveltekit-reload
              onclick={() =>
                trackCtaClick("footer", {
                  cta_type: "open_composer",
                  destination: "/create",
                })}
            >
              {siteCopy("Open Flow Arts Composer")}
            </a>
          {/if}
        </div>
      {/if}

      {#if variant !== "compact"}
        {#each COLUMNS as col}
          <nav
            class="col col-static"
            aria-label={siteCopy(col.title) + " " + siteCopy("links")}
          >
            <h2 class="col-title">{siteCopy(col.title)}</h2>
            {@render columnLinks(col)}
          </nav>
          <details class="col col-disclosure">
            <summary class="col-toggle">
              <span class="col-title">{siteCopy(col.title)}</span>
              <i class="fas fa-chevron-down col-chevron" aria-hidden="true"></i>
            </summary>
            {@render columnLinks(col)}
          </details>
        {/each}
      {/if}
    </div>

    <div class="bottom">
      <p class="legal-line">
        {siteCopy(
          "Flow Arts Composer and The Kinetic Alphabet are operated by Austen Cloud."
        )} © {year} Austen Cloud.
      </p>
      <nav
        class="bottom-links"
        aria-label={siteCopy("Support and legal links")}
      >
        <a href="/support"
          ><i class="fas fa-heart heart" aria-hidden="true"></i>
          {siteCopy("Support")}</a
        >
        <a href="/create?sheet=auth" data-sveltekit-reload
          >{siteCopy("Sign in")}</a
        >
        <a href="/terms" onclick={(e) => handleLegalClick(e, "terms")}
          >{siteCopy("Terms")}</a
        >
        <a href="/privacy" onclick={(e) => handleLegalClick(e, "privacy")}
          >{siteCopy("Privacy")}</a
        >
      </nav>
    </div>
  </div>
</footer>

<LegalSheet
  isOpen={sheetOpen}
  type={sheetType}
  onClose={() => (sheetOpen = false)}
/>

<style>
  .site-footer {
    position: relative;
    margin-top: 4.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    /* Quiet grounding gradient so the columns read over any cosmic-canvas
       brightness without a hard panel edge. */
    background: linear-gradient(
      180deg,
      rgba(8, 8, 20, 0.1),
      rgba(8, 8, 20, 0.55)
    );
  }
  .site-footer.compact {
    margin-top: 1.5rem;
  }
  .site-footer.sitemap {
    margin-top: 0;
  }
  /* Continuing the page's own surface. The handoff gap, the scrim (replaced by
     the inline background) and the hairline all exist to seat the footer on the
     star field; with no star field beneath it, all three only draw the seam
     they were meant to prevent. */
  .site-footer.surfaced {
    margin-top: 0;
    border-top: 0;
  }

  @media (min-width: 761px), (min-width: 700px) and (max-height: 560px) {
    .site-footer.immersive {
      display: none;
    }
  }

  .inner {
    /* Same band as SiteHeader's .inner so the chrome edges align. */
    max-width: var(--shell-w, min(1720px, 92vw));
    margin: 0 auto;
    padding: 48px 1.4rem 28px;
  }
  .compact .inner {
    padding: 1.5rem 1.4rem 1.25rem;
  }
  .sitemap .inner {
    padding: 1.5rem 1.4rem 1.25rem;
  }

  .cols {
    display: grid;
    grid-template-columns: 1fr;
    gap: 40px;
  }
  .compact-main {
    display: flex;
    justify-content: center;
  }

  .brand {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .compact .brand {
    align-items: center;
    gap: 0.25rem;
  }
  .wordmark {
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-style: italic;
    font-weight: 700;
    font-size: 1.6rem;
    letter-spacing: 0.04em;
    text-decoration: none;
    background: linear-gradient(135deg, #6f8cff, #c0a3ff);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .tagline {
    margin: 0;
    font-size: 0.92rem;
    color: #9b97bd;
  }
  .composer-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    margin-top: 6px;
    padding: 10px 18px;
    border-radius: 999px;
    border: 1px solid rgba(176, 163, 255, 0.4);
    color: #d7d4ea;
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 600;
    transition:
      border-color 0.2s ease,
      background 0.2s ease,
      color 0.2s ease;
  }
  .composer-cta:hover,
  .composer-cta:focus-visible {
    border-color: rgba(176, 163, 255, 0.8);
    background: rgba(139, 108, 255, 0.14);
    color: #fff;
    outline: none;
  }
  .col-title {
    margin: 0 0 12px;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8f8bb0;
  }
  .col-disclosure {
    display: none;
  }
  .col-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0 1rem;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    list-style: none;
    text-align: left;
    cursor: pointer;
    transition: background 0.18s ease;
  }
  .col-toggle::-webkit-details-marker {
    display: none;
  }
  .col-toggle .col-title {
    margin: 0;
  }
  .col-toggle:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .col-toggle:focus-visible {
    background: rgba(139, 108, 255, 0.12);
    outline: 2px solid rgba(184, 166, 255, 0.9);
    outline-offset: -2px;
  }
  .col-chevron {
    color: #8f8bb0;
    font-size: 0.75rem;
    transition: transform 0.25s ease;
  }
  .col-disclosure[open] .col-chevron {
    transform: rotate(180deg);
  }
  .col ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .col a {
    display: inline-block;
    padding: 7px 0;
    color: #b9b6cf;
    text-decoration: none;
    font-size: 0.92rem;
    transition: color 0.2s ease;
  }
  .col a:hover,
  .col a:focus-visible {
    color: #fff;
  }
  .col a:focus-visible {
    border-radius: 0.5rem;
    outline: 2px solid rgba(184, 166, 255, 0.9);
    outline-offset: 2px;
  }

  .bottom {
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 16px;
    margin-top: 44px;
    padding-top: 22px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .compact .bottom {
    margin-top: 1rem;
    padding-top: 1rem;
  }
  .sitemap .bottom {
    margin-top: 2rem;
  }
  .legal-line {
    margin: 0;
    font-size: 0.875rem;
    color: #7d7999;
    text-align: center;
  }
  .bottom-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.375rem;
  }
  .bottom-links a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.09));
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.025));
    color: #9b97bd;
    text-decoration: none;
    font-size: 0.875rem;
    transition:
      border-color 0.2s ease,
      background 0.2s ease,
      color 0.2s ease;
  }
  .bottom-links a:hover,
  .bottom-links a:focus-visible {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
    color: #fff;
  }
  .bottom-links a:focus-visible {
    outline: 2px solid rgba(184, 166, 255, 0.9);
    outline-offset: 2px;
  }
  .heart {
    font-size: 0.8rem;
    color: #ff8a9d;
  }

  /* Phones use native disclosure rows from first paint. The parallel static
     navigation is only rendered visually above this breakpoint, so every link
     remains usable with or without JavaScript and hydration cannot move the
     footer. */
  @media (max-width: 559px) {
    .bottom-links {
      display: grid;
      grid-template-columns: repeat(4, max-content);
      justify-content: space-between;
      width: 100%;
    }
    .bottom-links a {
      justify-content: center;
      padding-inline: 0.75rem;
      white-space: nowrap;
    }
    .full .inner {
      padding-top: 2rem;
    }
    .sitemap .inner {
      padding-top: 1.25rem;
    }
    .full .cols,
    .sitemap .cols {
      gap: 0.625rem;
    }
    .full .brand {
      margin-bottom: 0.75rem;
    }
    .col-static {
      display: none;
    }
    .col-disclosure {
      display: block;
    }
    .full .col,
    .sitemap .col {
      overflow: clip;
      border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.09));
      border-radius: 0.875rem;
      background: var(--theme-card-bg, rgba(255, 255, 255, 0.025));
    }
    .full .col ul,
    .sitemap .col ul {
      padding: 0.25rem 0.5rem 0.5rem;
    }
    .full .col a,
    .sitemap .col a {
      display: flex;
      align-items: center;
      min-height: var(--min-touch-target, 44px);
      padding: 0.625rem 0.5rem;
      border-radius: 0.5rem;
    }
    .full .col a:hover,
    .full .col a:focus-visible,
    .sitemap .col a:hover,
    .sitemap .col a:focus-visible {
      background: rgba(255, 255, 255, 0.05);
    }
  }

  /* The labels still keep full-size touch targets on extra-narrow browsers,
     but get two roomy rows instead of overflowing their pills. */
  @media (max-width: 22.5rem) {
    .bottom-links {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* ≥560px: the two link columns sit side by side under the brand block. */
  @media (min-width: 560px) {
    .cols {
      grid-template-columns: repeat(2, 1fr);
    }
    .brand {
      grid-column: 1 / -1;
    }
  }

  /* ≥1024px: brand joins the row; bottom bar splits left/right.
     `auto` tracks for the two link columns, not `1fr` each: with only two
     columns left, equal fractions stretched four short link labels across
     ~800px apiece at 4K and left a lake of nothing inside each column. Sized
     to content, the pair anchors to the right edge of the band and the brand
     holds the left, which is the shape a footer is supposed to have. The slack
     lives between the two groups, not inside them. */
  @media (min-width: 1024px) {
    .cols {
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: clamp(32px, 3.5vw, 84px);
    }
    .sitemap .cols {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .brand {
      grid-column: auto;
    }
    .compact-main {
      justify-content: flex-start;
    }
    .compact .brand {
      align-items: flex-start;
    }
    .bottom {
      flex-direction: row;
      justify-content: space-between;
    }
    .legal-line {
      text-align: left;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .col a,
    .col-toggle,
    .col-chevron,
    .bottom-links a,
    .composer-cta {
      transition: none;
    }
  }
</style>
