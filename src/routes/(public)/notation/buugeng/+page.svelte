<script lang="ts">
  import Seo from "$lib/shared/components/Seo.svelte";
  import OpenChapter from "$lib/shared/landing/components/OpenChapter.svelte";
  import SequenceHeroDemo from "$lib/shared/landing/components/SequenceHeroDemo.svelte";
  import demoJson from "$lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import "$lib/shared/landing/styles/public-editorial.css";

  const demoSequence = demoJson as unknown as SequenceData;

  const TITLE = "Buugeng Notation | The Kinetic Alphabet for Buugeng";
  const DESCRIPTION =
    "How The Kinetic Alphabet applies to buugeng: dual-ended like staves, so the notation carries over directly, with finger spinning welcomed where the staff pedagogy is strict.";
  const URL = "https://tkaflowarts.com/notation/buugeng";
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={URL} ogType="article">
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Buugeng Notation",
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
      { "@type": "ListItem", "position": 3, "name": "Buugeng", "item": "${URL}" }
    ]
  }
  </script>`}
</Seo>

<div class="editorial">
  <a class="back-link" href="/history">← Flow Arts History</a>

  <header class="editorial-header">
    <h1 class="page-title">Buugeng Notation</h1>
    <p class="page-subtitle">Dual-ended, like staves</p>
  </header>

  <section class="editorial-section has-duo" style="--accent: #22c55e">
    <div class="section-duo">
      <div class="duo-copy">
        <div class="prose">
          <p>
            Buugeng have two visible ends, so the <a href="/notation/staves"
              >staff notation</a
            > carries over, including the isolation and antispin relationships. The
            two end references still apply, as do the grid positions and timing of
            each letter. Eight rings and double contact ball belong to the same dual-ended
            family.
          </p>
          <p>
            Buugeng can be strange and unwieldy because they curve around the
            body. Finger spinning is well established with them. Some Kinetic
            Alphabet patterns may be hard to finger spin, but you can finger
            spin to your heart's desire. The fixed thumb reference is a staff
            teaching method; once you can read the turn value in a pictograph,
            you can change grip as the prop allows.
          </p>
        </div>
      </div>
      <div class="duo-demo">
        <SequenceHeroDemo
          sequence={demoSequence}
          note="the demo sequence, on buugeng"
          leftPropType="buugeng"
          rightPropType="buugeng"
        />
      </div>
    </div>
  </section>

  <OpenChapter prop="Buugeng" heading="How buugeng artists handle the curves">
    <p>
      The notation was worked out on double staves. It still needs a buugeng
      artist's account of grips, finger spinning, and how the curves change body
      mechanics.
    </p>
    <p>Buugeng artists can contribute those details.</p>
  </OpenChapter>

  <div class="cta-card">
    <h3>Take it to your buugeng</h3>
    <p>Flow Arts Composer is free to use. No download required.</p>
    <a href="/create" class="cta-button" data-sveltekit-reload>
      <span>Open Flow Arts Composer</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </a>
  </div>
</div>
