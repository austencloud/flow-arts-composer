<!--
  The staff choreography article stays available in development for human
  review. The route wrapper keeps this draft out of production until that
  review is complete.
-->
<script lang="ts">
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
  import "$lib/shared/landing/styles/public-editorial.css";

  const DESCRIPTION =
    "Learn staff choreography with The Kinetic Alphabet: a notation system built for double staves, from your first isolation to written sequences.";
</script>

<svelte:head>
  <title>Learn Staff Choreography with The Kinetic Alphabet</title>
  <meta name="description" content={DESCRIPTION} />
  <link
    rel="canonical"
    href="https://tkaflowarts.com/learn/staff-spinning-choreography"
  />

  <meta property="og:type" content="article" />
  <meta
    property="og:url"
    content="https://tkaflowarts.com/learn/staff-spinning-choreography"
  />
  <meta
    property="og:title"
    content="Learn Staff Choreography with The Kinetic Alphabet"
  />
  <meta property="og:description" content={DESCRIPTION} />
  <meta
    property="og:image"
    content="https://tkaflowarts.com/branding/og-image.png"
  />

  <meta name="twitter:card" content="summary_large_image" />
  <meta
    name="twitter:title"
    content="Learn Staff Choreography with The Kinetic Alphabet"
  />
  <meta name="twitter:description" content={DESCRIPTION} />
  <meta
    name="twitter:image"
    content="https://tkaflowarts.com/branding/og-image.png"
  />

  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Learn Staff Choreography with The Kinetic Alphabet",
    "url": "https://tkaflowarts.com/learn/staff-spinning-choreography",
    "description": "${DESCRIPTION}",
    "inLanguage": "en-US",
    "author": { "@type": "Person", "name": "Austen Cloud", "url": "https://tkaflowarts.com/about" },
    "publisher": {
      "@type": "Organization",
      "name": "The Kinetic Alphabet",
      "url": "https://tkaflowarts.com/"
    }
  }
  </script>`}

  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://tkaflowarts.com/" },
      { "@type": "ListItem", "position": 2, "name": "Learn", "item": "https://tkaflowarts.com/learn/staff-spinning-choreography" },
      { "@type": "ListItem", "position": 3, "name": "Staff Choreography", "item": "https://tkaflowarts.com/learn/staff-spinning-choreography" }
    ]
  }
  </script>`}
</svelte:head>

<div class="editorial">
  <header class="editorial-header">
    <h1 class="page-title">Learn Staff Choreography</h1>
    <p class="page-subtitle">The Kinetic Alphabet started with staves</p>
  </header>

  <section class="editorial-section" style="--accent: #22c55e">
    <h2 class="section-title">Picking Up Staves for the First Time?</h2>
    <div class="prose">
      <p>That's awesome. Hell yeah.</p>
      <p>
        First question: have you ever done an isolation or a four-petal
        antispin? Those are really foundational moves. Spend five or ten minutes
        learning how to turn your body to accomplish an isolation, and how to
        use negative space to accomplish an antispin. The sooner you get those
        moves, the sooner you'll have the technicality in your body to learn a
        wide variety of others.
      </p>
    </div>
  </section>

  <section class="editorial-section" style="--accent: #14b8a6">
    <h2 class="section-title">Why Staves</h2>
    <div class="prose">
      <p>
        The Kinetic Alphabet started with staves. When it was first made it was
        called the Double Staff Alphabet; the name changed later. Staves are
        really easy to display in a pictograph: they look the same whether their
        orientation is in or out, which is not true of single-ended props like a
        fan or a club. And because they're simple straight lines, they're easy
        to draw on a page. When TKA started, all of the pictographs were
        hand-drawn.
      </p>
      <!-- Image slot: first hand-drawn staff sequences. Austen has the originals
           above his desk; add when he provides photos. -->
      <p>
        Pretty soon it became clear that all of this choreography applies to any
        static prop. That does not include poi, because poi is not a static
        prop. Static props have the magical ability to transcend gravity: hold
        any orientation for as long as you want, and reverse direction on the
        fly, instantly, with no relationship to momentum making that difficult.
      </p>
      <p>
        That distinguishes TKA from previous prop systems, in particular from
        <LinkChip size="inline" href="/history">VTG</LinkChip>, which was built for momentum-based props
        and continuous spinning at a continuous rate. TKA says: spin at whatever
        rate we want, add reversals whenever we want, turn on a dime, hold any
        prop at any of eight orientations at any of nine points, move between
        any of them, and categorize every combination therein. It explores a
        wider space, one that's only accessible to props like staves. That's why
        we start with staves.
      </p>
    </div>
  </section>

  <section class="editorial-section" style="--accent: #ec4899">
    <h2 class="section-title">The End Goal Is Expression</h2>
    <div class="prose">
      <p>
        Learning Kinetic Alphabet sequences is like learning your lines in a
        play. If you then stand and speak them flatly, you've missed the point.
        The whole point of this is creative freedom, not creative bottlenecking.
      </p>
      <p>
        The purpose of the system is to let you turn your brain off, by taking
        care of the nitty gritty of what your staves are doing on what step, so
        that you have a huge amount of freed mental space to express yourself
        and move freely. You have to train your body to get there first, and you
        have to understand the bits and pieces. Just understand that's not the
        end goal. The end goal is freedom of expression and creative output that
        feels like you're creating something new to you, because that experience
        is valuable both to you and to the art form.
      </p>
    </div>
  </section>

  <section class="editorial-section" style="--accent: #f59e0b">
    <h2 class="section-title">Learn A, B, and C</h2>
    <div class="prose">
      <p>Your first session with TKA looks like learning A, B, and C:</p>
      <ol class="next-steps">
        <li>
          <LinkChip href="/guide/level-1/the-grid">Positions and motions</LinkChip>
        </li>
        <li><LinkChip href="/guide/level-1/base-letters">Letters</LinkChip></li>
        <li><LinkChip href="/guide/level-1/words">Your first words</LinkChip></li>
      </ol>
      <p>
        <LinkChip size="inline" href="/shop">Choreo Cards</LinkChip> make practice physical.
      </p>
    </div>
  </section>

  <div class="cta-card">
    <h3>Ready to create?</h3>
    <p>Flow Arts Composer is free to use. No download required.</p>
    <a href="/create" class="cta-button" data-sveltekit-reload>
      <span>Open Flow Arts Composer</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </a>
  </div>
</div>

<style>
  .next-steps li + li {
    margin-top: 0.5rem;
  }
</style>
