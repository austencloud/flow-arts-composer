<script lang="ts">
  import HomeHero from "$lib/shared/landing/components/HomeHero.svelte";
  import LaunchpadGrid from "$lib/shared/landing/components/launchpad/LaunchpadGrid.svelte";
</script>

<svelte:head>
  <title>Flow Arts Notation | The Kinetic Alphabet</title>
  <meta
    name="description"
    content="The Kinetic Alphabet is a notation system for flow arts. Use Flow Arts Composer to write, animate, save, and share choreography."
  />

  <!-- Additional SEO meta tags -->
  <meta
    name="robots"
    content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
  />
  <meta name="author" content="The Kinetic Alphabet" />
  <meta name="application-name" content="Flow Arts Composer" />
  <meta name="generator" content="SvelteKit" />

  <!-- Geographic targeting (global, but origin matters for trust) -->
  <meta name="geo.region" content="US" />
  <meta name="language" content="English" />

  <!-- Open Graph (Facebook, LinkedIn, Pinterest) -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="The Kinetic Alphabet" />
  <meta property="og:url" content="https://tkaflowarts.com/" />
  <meta
    property="og:title"
    content="Flow Arts Notation | The Kinetic Alphabet"
  />
  <meta
    property="og:description"
    content="A notation system for flow arts, with free software to write, animate, save, and share choreography."
  />
  <meta
    property="og:image"
    content="https://tkaflowarts.com/branding/og-image.png"
  />
  <meta
    property="og:image:alt"
    content="Flow Arts Composer animating a staff sequence"
  />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="en_US" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@tkaflowarts" />
  <meta name="twitter:creator" content="@tkaflowarts" />
  <meta
    name="twitter:title"
    content="Flow Arts Notation | The Kinetic Alphabet"
  />
  <meta
    name="twitter:description"
    content="A notation system for flow arts, with free software to write, animate, save, and share choreography."
  />
  <meta
    name="twitter:image"
    content="https://tkaflowarts.com/branding/og-image.png"
  />
  <meta
    name="twitter:image:alt"
    content="Flow Arts Composer animating a staff sequence"
  />

  <!-- Canonical URL -->
  <link rel="canonical" href="https://tkaflowarts.com/" />

  <!-- JSON-LD Structured Data: WebSite -->
  {@html `<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@type": "WebSite",
		"@id": "https://tkaflowarts.com/#website",
		"name": "The Kinetic Alphabet",
		"alternateName": "TKA",
		"url": "https://tkaflowarts.com/",
		"description": "The Kinetic Alphabet is a notation system for flow arts, created by Austen Cloud in 2022: every pair of grid placements is given a letter, so a sequence can be written down, read back, and searched as a word. Use Flow Arts Composer to write, animate, save, and share choreography.",
		"inLanguage": "en-US",
		"publisher": { "@id": "https://tkaflowarts.com/#organization" }
	}
	</script>`}

  <!-- JSON-LD Structured Data: Organization -->
  {@html `<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@type": "Organization",
		"@id": "https://tkaflowarts.com/#organization",
		"name": "The Kinetic Alphabet",
		"alternateName": "TKA",
		"url": "https://tkaflowarts.com/",
		"logo": "https://tkaflowarts.com/pwa/icons/icon-512x512.png",
		"description": "The Kinetic Alphabet is a notation system for flow arts and the organization behind Flow Arts Composer.",
		"disambiguatingDescription": "The Kinetic Alphabet is a movement notation system for flow arts and prop spinning. It is not related to the NATO phonetic alphabet or any spelling alphabet.",
		"founder": { "@id": "https://tkaflowarts.com/about#austen-cloud" },
		"knowsAbout": [
			"flow arts",
			"staff spinning",
			"double staff",
			"prop spinning",
			"movement notation",
			"choreography notation"
		],
		"foundingDate": "2022-03-27",
		"sameAs": [
			"https://instagram.com/tkaflowarts",
			"https://facebook.com/tkaflowarts",
			"https://www.youtube.com/@tkaflowarts"
		],
		"contactPoint": {
			"@type": "ContactPoint",
			"contactType": "customer support",
			"email": "support@tkaflowarts.com"
		}
	}
	</script>`}

  <!-- SoftwareApplication JSON-LD lives on /composer. The homepage owns the
       WebSite and Organization entities. -->

  <!-- The FAQ lives on its own page (/faq, in the header's Learn menu); its
       FAQPage JSON-LD is emitted there, matching that page's visible content. -->
</svelte:head>

<div class="landing-page">
  <!-- Cosmic background + SiteHeader come from MarketingChrome (root layout). -->
  <a href="#main-content" class="skip-link">Skip to main content</a>

  <div class="content-layer">
    <HomeHero />
    <main id="main-content" class="launchpad-main">
      <LaunchpadGrid />
    </main>
  </div>
</div>

<style>
  /* Skip link - visible only on focus for keyboard users */
  .skip-link {
    position: absolute;
    top: -100px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--primary, #6366f1);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    z-index: var(--z-overlay);
    transition: top var(--duration-normal) ease;
  }

  .skip-link:focus {
    top: 16px;
    outline: 2px solid white;
    outline-offset: 2px;
  }

  .landing-page {
    position: relative;
    min-height: 100vh;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    --landing-heading-font: "Playfair Display", Georgia, serif;
    color: var(--theme-text, #ffffff);
    line-height: 1.6;
    overflow-x: hidden;
  }

  .content-layer {
    position: relative;
    z-index: 1;
  }

  .launchpad-main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1.25rem;
  }

  /* Landscape tablets and foldables have enough width for the complete front
     door, but not enough room for the four-column desktop bento. Width plus a
     modest height floor identifies that geometry without relying on a device
     model or fold posture. Short phone-landscape viewports stay stacked. */
  @media (width >= 42rem) and (width < 105rem) and (height >= 500px) {
    .content-layer {
      display: grid;
      grid-template-columns: minmax(16rem, 5fr) minmax(0, 7fr);
      column-gap: clamp(1rem, 2.5vw, 2rem);
      align-items: stretch;
      width: 100%;
      max-width: var(--shell-w, min(1720px, 92vw));
      height: 100svh;
      min-height: 500px;
      margin-inline: auto;
      padding: 4.75rem clamp(1rem, 2vw, 1.5rem) 1.25rem;
    }

    .launchpad-main {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      max-width: none;
      margin: 0;
      padding: 0;
    }
  }

  /* Foldable landscape: reclaim the narrow vertical bands around the fixed
     header while preserving the same two-pane hierarchy and touch targets. */
  @media (min-width: 42rem) and (max-width: 1180px) and (min-height: 500px) and (max-height: 44rem) {
    .content-layer {
      column-gap: 0.75rem;
      padding: 4.25rem 0.75rem 0.5rem;
    }
  }

  /* A phone on its side has enough inline room for two panes but almost no
     block room. The destination bento and its four small utility links stay
     beside the hero instead of beginning below it. */
  @media (width >= 35rem) and (height < 500px),
    (width >= 105rem) and (height < 56.25rem) {
    .content-layer {
      display: grid;
      grid-template-columns: minmax(12rem, 5fr) minmax(0, 7fr);
      column-gap: 0.5rem;
      align-items: stretch;
      width: 100%;
      max-width: none;
      height: 100svh;
      min-height: 300px;
      margin: 0;
      padding: 4.25rem 0.5rem 0.25rem;
    }

    .launchpad-main {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      max-width: none;
      margin: 0;
      padding: 0;
    }
  }

  /* Phones use a real document flow. The previous one-viewport grid divided
     whatever height remained after the hero among ten destinations, which
     made a 375 × 667 screen read like a compressed site map. The hero now gets
     a focused first screen and the launchpad follows at its natural height.
     Short phone-landscape viewports still use the two-pane composition above. */
  @media (width < 35rem), (width < 42rem) and (height >= 500px) {
    .content-layer {
      display: block;
      width: 100%;
      min-height: 100svh;
      padding: 4.25rem clamp(0.625rem, 3vw, 0.875rem) 1.25rem;
    }

    .launchpad-main {
      width: 100%;
      height: auto;
      min-height: 0;
      max-width: none;
      margin: 0;
      padding: 0;
    }
  }

  /* Split tier: hero (left pane) + launchpad grid (right pane) compose into
     ONE viewport on wide screens — a practitioner on a 1080p/1440p/4K display
     sees the whole front door without scrolling. Recomposition, not scaling
     (per the 4K landing spec's wave-3 rule). Below 1680px the stacked layout
     above is untouched. The shared shell band keeps this composition aligned
     with the header while growing continuously on 4K/5K screens. */
  @media (width >= 105rem) and (height >= 56.25rem) {
    .content-layer {
      display: grid;
      grid-template-columns: minmax(32.5rem, 5fr) minmax(0, 7fr);
      column-gap: clamp(2.5rem, 4vw, 5.5rem);
      align-items: center;
      width: 100%;
      max-width: var(--shell-w, min(1720px, 92vw));
      margin-inline: auto;
      padding-inline: clamp(1.5rem, 2.5vw, 4rem);
      /* The fixed MarketingChrome header overlays the top ~64px, so the
         composition budgets for it: top padding pushes both panes clear, and
         min-height (not height) lets a short window scroll instead of clip. */
      padding-top: 4.75rem;
      min-height: 100svh;
    }

    .launchpad-main {
      max-width: none;
      padding: 0;
      /* The base margin:0 auto must go: auto inline margins on a grid item
         mean shrink-to-fit, and the tiles' content is absolutely positioned,
         so the whole grid collapsed to its strip row's width (~390px). */
      margin: 0;
      width: 100%;
    }
  }
</style>
