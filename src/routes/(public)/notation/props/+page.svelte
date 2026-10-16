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
  import BuugengChirality from "./BuugengChirality.svelte";
  import MandalaContrast from "#lib/shared/landing/components/MandalaContrast.svelte";
  import demoJson from "#lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import {
    findPropTypeByValue,
    getPropTypeDisplayInfo,
  } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import { PROP_KEYS, PROPS, isPropKey, type PropKey } from "./props-content";
  import "#lib/shared/landing/styles/public-editorial.css";

  const demoSequence = demoJson as unknown as SequenceData;

  const TITLE = "Prop Notation | The Kinetic Alphabet for Every Prop";
  const DESCRIPTION =
    "How The Kinetic Alphabet carries over from double staff to clubs, fans, buugeng, and poi, and where each prop reaches the edge of the notation.";
  const URL = "https://tkaflowarts.com/notation/props";

  let selected = $state<PropKey>("staves");
  // The Buugeng panel's pair pick. Page-local: it plays the demo and never
  // touches the visitor's own prop settings.
  let leftBuugengFlipped = $state(false);
  let rightBuugengFlipped = $state(false);

  // The hash is the shareable state: /notation/props#poi opens on poi, and
  // the header's prop links change the pick without leaving the page. A part
  // of a prop's text (#buugeng-chirality) opens that prop too.
  $effect(() => {
    const fromHash = page.url.hash.slice(1);
    const prop = fromHash.split("-")[0] ?? "";
    if (isPropKey(prop)) selected = prop;
  });

  function choose(prop: PropKey) {
    selected = prop;
    replaceState(`#${prop}`, page.state);
  }

  const current = $derived(PROPS[selected]);
  // The picker art the app's own prop picker uses, drawn as a mask so it
  // takes the segment's ink (the raw SVGs are dark blue and vanish here).
  const propImage = Object.fromEntries(
    PROP_KEYS.map((key) => {
      const type = findPropTypeByValue(PROPS[key].propType);
      return [key, type ? getPropTypeDisplayInfo(type).image : null];
    })
  ) as Record<PropKey, string | null>;

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
      >
        {#snippet optionContent(key: PropKey)}
          <span class="prop-option">
            {#if propImage[key]}
              <span
                class="prop-art"
                aria-hidden="true"
                style:mask-image={`url("${propImage[key]}")`}
              ></span>
            {/if}
            <span class="prop-option-label">{PROPS[key].label}</span>
          </span>
        {/snippet}
      </SegmentedControl>
    </div>
    <div class="section-duo demo-star">
      <div class="duo-demo">
        <SequenceHeroDemo
          sequence={demoSequence}
          note={current.note}
          leftPropType={current.propType}
          rightPropType={current.propType}
          {leftBuugengFlipped}
          {rightBuugengFlipped}
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
              {#if key === "buugeng"}
                <BuugengChirality
                  leftFlipped={leftBuugengFlipped}
                  rightFlipped={rightBuugengFlipped}
                  onchange={(left, right) => {
                    leftBuugengFlipped = left;
                    rightBuugengFlipped = right;
                  }}
                />
              {/if}
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
            > introduces every concept in order.
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
  /* SegmentedControl fills its container, so the wrapper sets the width.
     Each tab carries the prop's picture above its name, so the picker reads
     at a glance and holds its own against the player below it. */
  .prop-switcher {
    /* Grows with the screen so it keeps pace with the player on 4K. */
    width: min(100%, clamp(44rem, 32vw, 76rem));
    margin: 0 auto clamp(1.5rem, 1rem + 1vw, 2.5rem);
  }
  .prop-switcher :global(.segmented-control) {
    border-radius: 14px;
    padding: 4px;
  }
  .prop-switcher :global(.indicator) {
    top: 4px;
    bottom: 4px;
    border-radius: 10px;
  }
  .prop-switcher :global(.segment) {
    padding: clamp(0.6rem, 0.4rem + 0.4vw, 1.25rem) 0.25rem
      clamp(0.55rem, 0.35rem + 0.35vw, 1.1rem);
    min-width: 0;
  }
  .prop-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(0.4rem, 0.3rem + 0.25vw, 0.8rem);
    width: 100%;
  }
  .prop-art {
    display: block;
    /* A set width, not a share of the label: the label is narrower than
       most props, so the art would shrink to the word under it. */
    width: clamp(2.75rem, 1.5rem + 4vw, 9rem);
    max-width: 100%;
    height: clamp(1.75rem, 1rem + 1.4vw, 4.5rem);
    mask-size: contain;
    mask-position: center;
    mask-repeat: no-repeat;
    background: currentColor;
    opacity: 0.6;
    transition: opacity var(--duration-fast) var(--ease-standard);
  }
  .prop-switcher :global(.segment.selected .prop-art),
  .prop-switcher :global(.segment:hover .prop-art) {
    opacity: 1;
  }
  .prop-option-label {
    font-size: clamp(0.8rem, 0.7rem + 0.3vw, 1.4rem);
    font-weight: 600;
  }
  /* Text and player start on the same line under the switcher. */
  .prop-picker .section-duo {
    align-items: start;
  }
  /* Side by side, the longest text (Staves) still runs past the player, so
     the player rides along while it is read instead of leaving a gap. */
  @media (min-width: 1100px) {
    .prop-picker .duo-demo {
      position: sticky;
      top: 5.5rem;
    }
  }

  /* Only the picked prop's text takes up room. When every panel shared one
     cell, the longest text (Staves) set the height for all five and left a
     blank band under the player. The switcher sits above, so a height change
     only moves what is below the section, never the control being pressed.
     Inactive panels stay in the HTML for search and no-JS readers, laid over
     the active one so the swap cross-fades. */
  .prop-panels {
    position: relative;
  }
  .prop-panel {
    position: absolute;
    inset: 0 0 auto;
    visibility: hidden;
    opacity: 0;
    transition:
      opacity var(--duration-fast) var(--ease-standard),
      visibility 0s linear var(--duration-fast);
  }
  .prop-panel.active {
    position: relative;
    visibility: visible;
    opacity: 1;
    transition:
      opacity var(--duration-fast) var(--ease-standard),
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
