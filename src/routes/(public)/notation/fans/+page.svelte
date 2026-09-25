<script lang="ts">
  import Seo from "$lib/shared/components/Seo.svelte";
  import OpenChapter from "$lib/shared/landing/components/OpenChapter.svelte";
  import SequenceHeroDemo from "$lib/shared/landing/components/SequenceHeroDemo.svelte";
  import demoJson from "$lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import "$lib/shared/landing/styles/public-editorial.css";

  const demoSequence = demoJson as unknown as SequenceData;

  const TITLE = "Fan Spinning Notation | The Kinetic Alphabet for Fans";
  const DESCRIPTION =
    "How The Kinetic Alphabet applies to fan spinning: the translation from staves and why folds cannot yet be fully written in pictographs.";
  const URL = "https://tkaflowarts.com/notation/fans";
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={URL} ogType="article">
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Fan Spinning Notation",
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
      { "@type": "ListItem", "position": 3, "name": "Fans", "item": "${URL}" }
    ]
  }
  </script>`}
</Seo>

<div class="editorial">
  <a class="back-link" href="/history">← Flow Arts History</a>

  <header class="editorial-header">
    <h1 class="page-title">Fan Spinning Notation</h1>
    <p class="page-subtitle">The Kinetic Alphabet, applied to fans</p>
  </header>

  <section class="editorial-section has-duo" style="--accent: #22c55e">
    <div class="section-duo">
      <div class="duo-copy">
        <div class="prose">
          <p>
            Fans use the same single-ended translation as <a
              href="/notation/clubs">clubs</a
            >. Imagine the pinky end of a staff is invisible. A fan's
            orientation follows the staff's thumb end, and its flat face makes
            that direction easy to read. The grid positions, letters, and timing
            remain the same.
          </p>
        </div>
      </div>
      <div class="duo-demo">
        <SequenceHeroDemo
          sequence={demoSequence}
          note="the staff pattern played with two fans"
          leftPropType="fan"
          rightPropType="fan"
        />
      </div>
    </div>
  </section>

  <section class="editorial-section" style="--accent: #14b8a6">
    <div class="prose">
      <p>
        A fan's leaves form a plane, much like a triad's arms. The notation
        assumes the prop's plane matches the plane of the movement. During a
        fold, the fan leaves that plane, moves through 3D space, and returns
        with the hand turned from front to back. The Kinetic Alphabet does not
        yet encode hand orientation, so it cannot fully describe folds. A
        hand-orientation matrix for pictographs is planned.
      </p>
    </div>
  </section>

  <OpenChapter prop="Fans" heading="Fan folds and grips need documentation">
    <p>
      Fan spinners can help document the grips and hand turns used in folds,
      with examples of movements the current pictographs cannot record.
    </p>
  </OpenChapter>

  <div class="cta-card">
    <h3>Spin it yourself</h3>
    <p>Flow Arts Composer is free to use. No download required.</p>
    <a href="/create" class="cta-button" data-sveltekit-reload>
      <span>Open Flow Arts Composer</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </a>
  </div>
</div>
