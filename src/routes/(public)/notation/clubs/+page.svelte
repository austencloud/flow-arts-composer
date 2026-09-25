<script lang="ts">
  import Seo from "$lib/shared/components/Seo.svelte";
  import OpenChapter from "$lib/shared/landing/components/OpenChapter.svelte";
  import SequenceHeroDemo from "$lib/shared/landing/components/SequenceHeroDemo.svelte";
  import MandalaContrast from "$lib/shared/landing/components/MandalaContrast.svelte";
  import demoJson from "$lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import "$lib/shared/landing/styles/public-editorial.css";

  const demoSequence = demoJson as unknown as SequenceData;

  const TITLE = "Club Spinning Notation | The Kinetic Alphabet for Clubs";
  const DESCRIPTION =
    "How The Kinetic Alphabet applies to dual-wielded club spinning, including staff translation, one-ended isolation and extension, and open grip questions.";
  const URL = "https://tkaflowarts.com/notation/clubs";
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={URL} ogType="article">
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Club Spinning Notation",
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
      { "@type": "ListItem", "position": 3, "name": "Clubs", "item": "${URL}" }
    ]
  }
  </script>`}
</Seo>

<div class="editorial">
  <a class="back-link" href="/history">← Flow Arts History</a>

  <header class="editorial-header">
    <h1 class="page-title">Club Spinning Notation</h1>
    <p class="page-subtitle">The base single-ended prop</p>
  </header>

  <section class="editorial-section has-duo" style="--accent: #22c55e">
    <div class="section-duo">
      <div class="duo-copy">
        <div class="prose">
          <p>
            This is dual-wielded club spinning: one club in each hand, held
            throughout the move. Clubs are the base prop of the single-ended
            family and central to Vulcan Tech Gospel, the framework The Kinetic
            Alphabet builds on. The <a href="/history">history page</a> traces that
            lineage.
          </p>
          <p>
            To read a club pictograph, imagine the pinky end of a staff is
            invisible. The club's orientation follows the staff's thumb end. The
            grid, letters, and timing stay the same, as the player shows.
          </p>
        </div>
      </div>
      <div class="duo-demo">
        <SequenceHeroDemo
          sequence={demoSequence}
          note="one club per hand follows the staff pattern"
          leftPropType="club"
          rightPropType="club"
        />
      </div>
    </div>
  </section>

  <section class="editorial-section has-duo" style="--accent: #ec4899">
    <h2 class="section-title">One End, Two Moves</h2>
    <div class="section-duo flip">
      <div class="duo-copy">
        <div class="prose">
          <p>
            The two mandalas trace the identical sequence. In the staff render,
            both ends of each prop leave a path. In the club render, one does.
            On a staff, the thumb end isolates while the pinky end extends. A
            club can perform either path, so club spinners learn isolation and
            extension as separate moves with the same underlying geometry. A
            club's antispin reads as a vertical or a horizontal flower depending
            on its orientation through the pattern. VTG calls these vertical
            antispin and horizontal antispin. Both are visible at once on a <a
              href="/notation/staves">staff</a
            >.
          </p>
        </div>
      </div>
      <div class="duo-demo">
        <MandalaContrast
          sequence={demoSequence}
          note="staves trace both ends; clubs trace one"
        />
      </div>
    </div>
  </section>

  <OpenChapter
    prop="Clubs"
    heading="Club grip technique needs a spinner's account"
  >
    <p>
      The notation shows the path of each club, but the grip section still needs
      examples of finger spinning and grip changes from club spinners.
    </p>
  </OpenChapter>

  <div class="cta-card">
    <h3>Try it with clubs</h3>
    <p>Flow Arts Composer is free to use. No download required.</p>
    <a href="/create" class="cta-button" data-sveltekit-reload>
      <span>Open Flow Arts Composer</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </a>
  </div>
</div>
