<script lang="ts">
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import Seo from "#lib/shared/components/Seo.svelte";
  import "#lib/shared/landing/styles/public-editorial.css";

  const TITLE = "Poi Notation | Can The Kinetic Alphabet Write Poi?";
  const DESCRIPTION =
    "Poi can perform Kinetic Alphabet patterns with steady rotation. Learn where momentum limits the notation and how it compares with Vulcan Tech Gospel.";
  const URL = "https://tkaflowarts.com/notation/poi";
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={URL} ogType="article">
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Poi Notation",
    "url": "${URL}",
    "description": "${DESCRIPTION}",
    "inLanguage": "en-US",
    "author": { "@type": "Person", "name": "Austen Cloud", "url": "https://tkaflowarts.com/about" },
    "publisher": { "@type": "Organization", "name": "The Kinetic Alphabet", "url": "https://tkaflowarts.com/" }
  }
  </script>`}
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://tkaflowarts.com/" },
      { "@type": "ListItem", "position": 2, "name": "Poi", "item": "${URL}" }
    ]
  }
  </script>`}
</Seo>

<div class="editorial">
  <header class="editorial-header">
    <h1 class="page-title">Poi Notation</h1>
    <p class="page-subtitle">Can The Kinetic Alphabet write poi?</p>
  </header>

  <section class="editorial-section" style="--accent: #22c55e">
    <div class="prose">
      <p>
        Partly. Poi can perform the Kinetic Alphabet patterns whose rotation
        stays fairly steady. Holds, hard reversals, and abrupt speed changes are
        out of reach, because a poi head hangs from a tether and keeps moving
        with swing and gravity. The alphabet was built around held props, which
        can pause at any orientation, move to another grid position, or reverse
        direction.
      </p>
      <p>
        The Kinetic Alphabet measures each orientation radially, from the prop
        toward the performer's center. Vulcan Tech Gospel (VTG) uses the
        downbeat at the bottom of the circle as its reference. That ground
        reference follows a prop that swings under gravity.
      </p>
      <p>
        The Kinetic Alphabet is its own system, but the two share some ground.
        VTG's four timing and direction categories line up with the timing and
        direction of TKA's Type 1 letters, so poi spinners who know split-same
        and tog-opposite can already read that part of the alphabet.
      </p>
      <p>
        When you're ready to read the notation, the <LinkChip
          size="inline"
          href="/guide">guide</LinkChip
        > introduces every concept in order.
      </p>
    </div>
  </section>

  <div class="cta-card">
    <h3>Build a sequence</h3>
    <p>Flow Arts Composer is free to use. No download required.</p>
    <a href="/create" class="cta-button" data-sveltekit-reload>
      <span>Open Flow Arts Composer</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </a>
  </div>
</div>
