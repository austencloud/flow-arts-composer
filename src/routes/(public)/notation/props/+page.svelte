<script lang="ts">
  /*
    One page for every prop (2026-10-15). The five per-prop pages under
    /notation/{staves,clubs,fans,buugeng,poi} were each one or two paragraphs
    around the same demo, so they read as stubs. Here one demo plays the same
    sequence with whichever prop is picked, and the text beside it says what
    carries over from the staff and where it stops. The old addresses 301 to
    /notation/props#<prop>, and the hash picks the prop on arrival.

    Every prop's text stays in the HTML, so search engines and the no-JS case
    see all five. The panels share one grid cell: the tallest sets the height
    and switching never moves the page.
  */
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import Seo from "#lib/shared/components/Seo.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import SequenceHeroDemo from "#lib/shared/landing/components/SequenceHeroDemo.svelte";
  import MandalaContrast from "#lib/shared/landing/components/MandalaContrast.svelte";
  import demoJson from "#lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { PROP_KEYS, PROPS, isPropKey, type PropKey } from "./props-content";
  import "#lib/shared/landing/styles/public-editorial.css";

  const demoSequence = demoJson as unknown as SequenceData;

  const TITLE = "Prop Notation | The Kinetic Alphabet for Every Prop";
  const DESCRIPTION =
    "How The Kinetic Alphabet carries over from double staff to clubs, fans, buugeng, and poi, and where each prop reaches the edge of the notation.";
  const URL = "https://tkaflowarts.com/notation/props";

  let selected = $state<PropKey>("staves");

  // The hash is the shareable state: /notation/props#poi opens on poi, and
  // the header's prop links change the pick without leaving the page.
  $effect(() => {
    const fromHash = page.url.hash.slice(1);
    if (isPropKey(fromHash)) selected = fromHash;
  });

  function choose(prop: PropKey) {
    selected = prop;
    replaceState(`#${prop}`, page.state);
  }

  const current = $derived(PROPS[selected]);
  const options = PROP_KEYS.map((key) => ({
    value: key,
    label: PROPS[key].label,
    id: `prop-tab-${key}`,
    controls: `prop-panel-${key}`,
  }));
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={URL} ogType="article">
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Prop Notation",
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
      { "@type": "ListItem", "position": 2, "name": "Prop Notation", "item": "${URL}" }
    ]
  }
  </script>`}
</Seo>

<div class="editorial">
  <header class="editorial-header">
    <h1 class="page-title">Prop Notation</h1>
    <p class="page-subtitle">Pick a prop to play the same sequence with it</p>
  </header>

  <!-- The prop pick is the page's one decision, so it leads, directly above
       the player and text it changes (2026-10-15, Austen's call). -->
  <section
    class="editorial-section has-duo prop-picker"
    style="--accent: #14b8a6"
  >
    <div class="prop-switcher">
      <SegmentedControl
        {options}
        value={selected}
        onchange={choose}
        color="accent"
        semantics="tabs"
        ariaLabel="Prop"
      />
    </div>
    <div class="section-duo demo-star">
      <div class="duo-demo">
        <SequenceHeroDemo
          sequence={demoSequence}
          note={current.note}
          leftPropType={current.propType}
          rightPropType={current.propType}
        />
      </div>
      <div class="duo-copy">
        <div class="prop-panels">
          {#each PROP_KEYS as key (key)}
            {@const prop = PROPS[key]}
            <div
              class="prop-panel prose"
              id="prop-panel-{key}"
              role="tabpanel"
              aria-labelledby="prop-tab-{key}"
              inert={key !== selected}
              class:active={key === selected}
            >
              <h2 class="section-title">{prop.label}</h2>
              <p class="prop-kind">{prop.kind}</p>
              {#each prop.paragraphs as paragraph, i (i)}
                <p>{paragraph}</p>
              {/each}
            </div>
          {/each}
        </div>
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
            club or fan can perform either path, so their spinners learn
            isolation and extension as separate moves with the same underlying
            geometry.
          </p>
          <p>
            When you're ready to learn the notation, the <LinkChip
              size="inline"
              href="/guide">guide</LinkChip
            > introduces every concept in order, and the <LinkChip
              size="inline"
              href="/guide/codex">Double Staff Codex</LinkChip
            > collects the pictographs themselves.
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

  <div class="cta-card">
    <h3>Write your first sequence</h3>
    <p>Flow Arts Composer is free to use. No download required.</p>
    <a href="/create" class="cta-button" data-sveltekit-reload>
      <span>Open Flow Arts Composer</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </a>
  </div>
</div>

<style>
  /* The switcher heads the picker section, centred over both columns. The
     header above already separates it from the title, so no rule line. */
  .prop-picker.editorial-section {
    border-top: 0;
    padding-top: 0;
  }
  /* SegmentedControl fills its container, so the wrapper sets the width:
     enough for five labels, never a page-wide bar. */
  .prop-switcher {
    width: min(100%, 32rem);
    margin: 0 auto clamp(1.5rem, 1rem + 1vw, 2.5rem);
  }
  /* Text and player start on the same line under the switcher. The panel
     cell is sized for the longest prop, so centring would float a short
     prop's text away from the top. */
  .prop-picker .section-duo {
    align-items: start;
  }

  /* All five panels sit in one cell. The tallest sets the height, so the
     page never shifts when the pick changes. */
  .prop-panels {
    display: grid;
  }
  .prop-panel {
    grid-area: 1 / 1;
    visibility: hidden;
    opacity: 0;
    transition:
      opacity 180ms ease,
      visibility 0s linear 180ms;
  }
  .prop-panel.active {
    visibility: visible;
    opacity: 1;
    transition:
      opacity 180ms ease,
      visibility 0s;
  }
  .prop-panel .section-title {
    margin-bottom: 0.25rem;
  }
  .prop-kind {
    margin-top: 0;
    /* Same tone as the page subtitle in public-editorial.css. */
    color: oklch(0.62 0.02 270);
    font-weight: 600;
  }
  @media (prefers-reduced-motion: reduce) {
    .prop-panel,
    .prop-panel.active {
      transition: none;
    }
  }
</style>
