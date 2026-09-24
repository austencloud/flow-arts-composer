<script lang="ts">
  import Seo from "$lib/shared/components/Seo.svelte";
  import SequenceHeroDemo from "$lib/shared/landing/components/SequenceHeroDemo.svelte";
  import demoJson from "$lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import "$lib/shared/landing/styles/public-editorial.css";

  const demoSequence = demoJson as unknown as SequenceData;

  const TITLE = "Double Staff Notation | The Kinetic Alphabet for Staves";
  const DESCRIPTION =
    "How The Kinetic Alphabet notates double staff spinning, including its paper origins, dual-end geometry, and fixed-reference teaching method.";
  const URL = "https://tkaflowarts.com/notation/staves";
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={URL} ogType="article">
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Double Staff Notation",
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
      { "@type": "ListItem", "position": 2, "name": "Flow Arts History", "item": "https://tkaflowarts.com/history" },
      { "@type": "ListItem", "position": 3, "name": "Staves", "item": "${URL}" }
    ]
  }
  </script>`}
</Seo>

<div class="editorial">
  <a class="back-link" href="/history">← Flow Arts History</a>

  <header class="editorial-header">
    <h1 class="page-title">Double Staff Notation</h1>
    <p class="page-subtitle">The prop The Kinetic Alphabet was built for</p>
  </header>

  <section class="editorial-section" style="--accent: #22c55e">
    <div class="prose">
      <p>
        The Kinetic Alphabet began on paper with a red pen and a blue pen. A pen
        works like a small staff: each has two visible ends. For the first
        couple of years, sequences were built on a hand-drawn grid, with arrows
        drawn in the same two colors. Working sequences got their own pages.
      </p>
      <p>
        A staff's straight shape is easy to draw without covering the arrows in
        a pictograph. Two staves placed end to end form one longer line, which
        makes their orientations easy to see on the grid.
      </p>
    </div>
  </section>

  <section class="editorial-section has-duo" style="--accent: #14b8a6">
    <div class="section-duo">
      <div class="duo-copy">
        <div class="prose">
          <p>
            Each staff has a thumb end and a pinky end. Hold the thumb end at
            center during an isolation and the pinky end performs an extension
            at the same time. A club has one visible end, so its isolation and
            extension are separate moves, despite sharing the same geometry. The <a
              href="/notation/clubs">club comparison</a
            > shows the difference. A staff also covers both the vertical-flower and
            horizontal-flower antispin variants that VTG names for one-ended props.
          </p>
          <p>
            A fan or club visibly points in one of eight directions. A staff
            radiating from center makes those eight orientations look like four.
            Orientation does not change the letter in a pictograph, so the
            reduced visual detail makes patterns easier to distinguish while
            learning.
          </p>
        </div>
      </div>
      <div class="duo-demo">
        <SequenceHeroDemo
          sequence={demoSequence}
          note="both ends of each staff stay visible"
        />
      </div>
    </div>
  </section>

  <section class="editorial-section" style="--accent: #8b5cf6">
    <div class="prose">
      <p>
        Staff lessons keep the thumb and pinky ends as fixed references. The
        spinner uses the space above and below the shoulder, and turns into the
        plane behind the body, without finger spinning or changing grip. The
        notation also allows finger spins and grip changes. Those are left out
        of the staff lessons so the turn value stays easy to follow.
      </p>
      <p>
        When you're ready to learn the notation, the <a href="/guide">guide</a>
        introduces every concept in order, the
        <a href="/guide/codex">Double Staff Codex</a> collects the pictographs
        themselves, and the <a href="/atlas">Kinetic Atlas</a> defines every term
        used on this page.
      </p>
    </div>
  </section>

  <div class="cta-card">
    <h3>Write your first sequence</h3>
    <p>Flow Arts Composer is free to use. No download required.</p>
    <a href="/create" class="cta-button" data-sveltekit-reload>
      <span>Open Flow Arts Composer</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </a>
  </div>
</div>
