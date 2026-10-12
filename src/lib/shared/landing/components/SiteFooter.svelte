<script lang="ts">
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  /**
   * SiteFooter: one composition on every public page (brand column, the
   * Explore and Learn link rows, and the legal bottom). MarketingChrome
   * renders it outside the route crossfade.
   *
   * It never paints a seat of its own: no top margin, no hairline, no scrim.
   * It continues whatever surface the page above shows, the page's opaque
   * surface when MarketingChrome hands one over, or the star field (it is
   * transparent) when the page floats on the sky. The `.bottom` rule is the
   * only line it draws.
   *
   * Terms/Privacy keep LandingFooter's behavior: on narrow viewports they
   * open the in-place LegalSheet instead of navigating.
   */
  import LegalSheet from "#lib/shared/legal/components/LegalSheet.svelte";
  import { trackCtaClick } from "#lib/shared/analytics/landing-events.js";
  import { siteCopy } from "../site-copy";

  let {
    surface,
  }: {
    /**
     * The opaque surface the page above runs to the viewport edge, when it has
     * one. Given it, the footer paints that same surface so the two read as
     * one continuous page. Pages that float their content on the star field
     * leave this unset and the footer stays transparent over the sky.
     */
    surface?: string;
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
        <li><LinkChip href={link.href}>{siteCopy(link.label)}</LinkChip></li>
      {/each}
    </ul>
  </div>
{/snippet}

<footer class="site-footer" style:background={surface}>
  <div class="inner">
    <div class="cols">
      <div class="brand">
        <a
          href="/"
          class="wordmark"
          aria-label={siteCopy("TKA, The Kinetic Alphabet, Home")}>TKA</a
        >
        <p class="tagline">{siteCopy("Notation for flow arts.")}</p>
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
      </div>

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
  /* No margin, hairline or scrim: each of them draws a seam between the page
     and its own bottom. The background comes only from the `surface` prop,
     so the footer is transparent over the star field and opaque only where
     the page above is. The gap above the columns is .inner's padding. */
  .site-footer {
    position: relative;
  }

  .inner {
    /* Same band as SiteHeader's .inner so the chrome edges align. */
    max-width: var(--shell-w, min(1720px, 92vw));
    margin: 0 auto;
    padding: 48px 1.4rem 28px;
  }

  .cols {
    display: grid;
    grid-template-columns: 1fr;
    gap: 40px;
  }

  .brand {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
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
      border-color var(--duration-normal) var(--ease-standard),
      background var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
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
    transition: background var(--duration-fast) var(--ease-standard);
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
    transition: transform var(--duration-normal) var(--ease-standard);
  }
  .col-disclosure[open] .col-chevron {
    transform: rotate(180deg);
  }
  /* Several standalone links share a wrapping row, as LinkChip asks. A
     single-file stack left each pill a different width down a ragged edge. */
  .col ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
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
      border-color var(--duration-normal) var(--ease-standard),
      background var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
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
      /* Translated labels need to wrap at their natural width. */
      width: 100%;
    }
    .bottom-links a {
      justify-content: center;
      padding-inline: 0.75rem;
      white-space: nowrap;
    }
    .inner {
      padding-top: 2rem;
    }
    .cols {
      gap: 0.625rem;
    }
    .brand {
      margin-bottom: 0.75rem;
    }
    .col-static {
      display: none;
    }
    .col-disclosure {
      display: block;
    }
    .col {
      overflow: clip;
      border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.09));
      border-radius: 0.875rem;
      background: var(--theme-card-bg, rgba(255, 255, 255, 0.025));
    }
    .col ul {
      padding: 0.25rem 0.5rem 0.5rem;
    }
    /* A phone's row holds one or two pills. Growing them to fill it keeps
       both edges straight instead of a ragged stack. */
    .col-disclosure li {
      flex: 1 1 auto;
    }
    .col-disclosure :global(.link-chip) {
      width: 100%;
      justify-content: space-between;
    }
  }

  /* ≥560px: each link group is one full-width row under the brand block.
     Side by side, the halves were too narrow for the rows to wrap well. */
  @media (min-width: 560px) {
    .cols {
      gap: 1.75rem;
    }
    .brand {
      margin-bottom: 0.75rem;
    }
  }

  /* ≥1024px: the brand holds the left and the two link rows stack on the
     right; the bottom bar splits left/right. The rows' track is sized to its
     content, so on a wide screen each group sits on one line against the right
     edge and the slack stays between brand and links, not inside a group. */
  @media (min-width: 1024px) {
    .cols {
      grid-template-columns: minmax(15rem, 1fr) auto;
      column-gap: clamp(32px, 3.5vw, 84px);
    }
    .brand {
      grid-row: span 2;
      margin-bottom: 0;
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
    .col-toggle,
    .col-chevron,
    .bottom-links a,
    .composer-cta {
      transition: none;
    }
  }
</style>
