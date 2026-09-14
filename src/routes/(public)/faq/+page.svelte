<script lang="ts">
  import FaqInterview from "$lib/shared/landing/components/FaqInterview.svelte";
  import "$lib/shared/landing/styles/public-editorial.css";
</script>

<svelte:head>
  <title>FAQ | The Kinetic Alphabet</title>
  <meta
    name="description"
    content="Common questions about The Kinetic Alphabet: what the notation is, which props it covers, where to start, and what Flow Arts Composer costs."
  />
  <link rel="canonical" href="https://tkaflowarts.com/faq" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://tkaflowarts.com/faq" />
  <meta property="og:title" content="FAQ | Flow Arts Composer" />
  <meta
    property="og:description"
    content="Common questions about The Kinetic Alphabet: what the notation is, which props it covers, where to start, and what Flow Arts Composer costs."
  />
  <meta property="og:image" content="https://tkaflowarts.com/branding/og-image.png" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="FAQ | Flow Arts Composer" />
  <meta
    name="twitter:description"
    content="Common questions about The Kinetic Alphabet: what the notation is, which props it covers, where to start, and what Flow Arts Composer costs."
  />
  <meta name="twitter:image" content="https://tkaflowarts.com/branding/og-image.png" />

  <!-- JSON-LD: BreadcrumbList for search result hierarchy. The FAQPage schema
       itself is emitted by <FaqInterview emitSchema> below, generated from the
       canonical FAQ_ITEMS so schema and visible answers never drift. -->
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://tkaflowarts.com/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "FAQ",
        "item": "https://tkaflowarts.com/faq"
      }
    ]
  }
  </script>`}
</svelte:head>

<div class="editorial faq-editorial">
  <header class="editorial-header" style:view-transition-name="launchpad-faq">
    <h1 class="page-title">FAQ</h1>
    <p class="page-subtitle">Getting started, props, and cost</p>
  </header>

  <FaqInterview emitSchema heading="" />

  <div class="cta-card">
    <h3>Out of questions?</h3>
    <p>Ten minutes in the composer answers more than this page can. Free, in your browser.</p>
    <a class="cta-button" href="/create" data-sveltekit-reload>
      <span>Open Flow Arts Composer</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </a>
  </div>
</div>

<style>
  /* ── Wide-screen composition ─────────────────────────────────────────
     Below 1500px this page is the centered reading column (phone through
     laptop, verified per-tier). From 1500px up the exchanges flow into a
     two-column magazine spread (FaqInterview owns the column flow); this
     page only widens the band the spread lives in. No side column, no
     reserved chrome: every region of the page is content. A live-notation
     hero was tried here and pulled (2026-07-17) — a big animation stage
     reads as awkward furniture on a quiet text page; demos live behind
     the answer doors instead. */
  @media (min-width: 1500px) {
    /* The closing card stays a readable centered band inside the wide
       spread (same treatment as the glossary's). */
    .faq-editorial :global(.cta-card) {
      max-width: 46rem;
      margin-left: auto;
      margin-right: auto;
    }
  }
</style>
