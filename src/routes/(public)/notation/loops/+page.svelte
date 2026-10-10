<!--
  /notation/loops - GATED. Production returns 404 via +page.server.ts;
  development renders the full page so it can be finished at its canonical URL.

  The LOOP algebra page is not ready to be seen: it is filed with the other
  withdrawn public pages (/learn/staff-spinning-choreography, /roots/software)
  until it earns its place.

  To un-gate: delete +page.server.ts, re-add "notation/loops" to
  src/routes/sitemap.xml/+server.ts, restore the SiteHeader "Learn" entry and
  the /notation/caps cross-links, and update
  tests/unit/withdrawn-public-pages-contract.test.ts.
-->
<script lang="ts">
  import Seo from "#lib/shared/components/Seo.svelte";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import SequenceHeroDemo from "#lib/shared/landing/components/SequenceHeroDemo.svelte";
  import { activateWhenNear } from "#lib/actions/activate-when-near.js";
  import LOOPIconStrip from "#lib/shared/components/LOOPIconStrip.svelte";
  import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import { LOOP_COMPONENTS } from "#lib/shared/browse/domain/constants/loop-constants.js";
  import { NOTATION_LOOP_TEASER_SEQUENCE } from "#lib/shared/loop-explorer/domain/notation-loop-teaser.js";
  import "#lib/shared/landing/styles/public-editorial.css";

  const TITLE = "The LOOP Algebra | The Kinetic Alphabet";
  const DESCRIPTION =
    "Six transformation components, compositional notation, and a fixed-point theorem for sequences that return to where they started. Try every combination live.";
  const URL = "https://tkaflowarts.com/notation/loops";

  // The hero's live example: a real verified sequence from A3's harness, not
  // a mockup. Rotated/quartered passed 25/25 exact-match runs, so it shows
  // the deepest form (90-degree steps, four passes) cleanly.
  const heroSequence = NOTATION_LOOP_TEASER_SEQUENCE;

  // Fixed-point table, grounded in MCP get_domain_topic("loop"). Rotation has
  // no L1-L5 fixed point, which is WHY it can never sit outside another
  // transform (see "Rotation is always innermost" below) — shown as an
  // empty cell here, not omitted, so the absence itself reads as data.
  const FIXED_POINTS: { transform: string; positions: string }[] = [
    { transform: "Mirrored", positions: "alpha1, alpha5, beta1, beta5" },
    { transform: "Flipped", positions: "alpha3, alpha7, beta3, beta7" },
    { transform: "Swapped", positions: "all beta" },
    { transform: "Rotated", positions: "none at L1-L5" },
    { transform: "Inverted", positions: "all positions" },
  ];

  const COMPOSABILITY: { composition: string; from: string; result: string }[] = [
    { composition: "Swapped + Mirrored/Inverted", from: "alpha1", result: "Valid" },
    { composition: "Swapped + Flipped/Inverted", from: "alpha1", result: "Blocked" },
    { composition: "Rotated + Swapped", from: "alpha1", result: "Blocked" },
    { composition: "Rotated + Mirrored/Inverted", from: "alpha1", result: "Valid" },
    { composition: "Mirrored/Inverted + Swapped", from: "alpha1", result: "Blocked" },
    { composition: "Rotated + Swapped", from: "beta3", result: "Valid" },
    { composition: "Mirrored/Inverted + Swapped", from: "beta3", result: "Valid" },
  ];

  // CAPs lineage, grounded in MCP get_term_definition("CAP"). Credits verbatim
  // per spec section 3.5 — not paraphrased into vaguer attribution.
  const CAP_CREDITS: { name: string; role: string }[] = [
    { name: "Damien (Zaltymbunk)", role: "coined the term, on the Home of Poi forums" },
    { name: "Alien Jon", role: "promoted it" },
    { name: "Nick Woolsey (PlayPoi)", role: "popularized it as Capped Antispin Patterns" },
    { name: "DrexFactor", role: "documented it" },
    {
      name: "Charlie Cushing",
      role: "extended it with the 8-step CAP and 9-Square Theory",
    },
  ];

  // The six components, driving both the "how to read the strip" legend and
  // the LOOPIconStrip instances below. Reuses the same LOOP_COMPONENT_MAP
  // data the picker and card exports already read from (never-hand-roll).
  const LEGEND = LOOP_COMPONENTS;

  let explorerActive = $state(false);
  const activateExplorerWhenNear = (node: HTMLElement) =>
    activateWhenNear(node, {
      activate: () => (explorerActive = true),
      rootMargin: "500px",
      deferUntilIdle: true,
    });
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={URL} ogType="article">
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "The LOOP Algebra",
    "url": "${URL}",
    "description": "${DESCRIPTION}",
    "inLanguage": "en-US",
    "author": { "@type": "Person", "name": "Austen Cloud", "url": "https://tkaflowarts.com/about" },
    "publisher": { "@type": "Organization", "name": "The Kinetic Alphabet", "url": "https://tkaflowarts.com/" },
    "about": {
      "@type": "CreativeWork",
      "name": "The LOOP Algebra",
      "creator": { "@type": "Person", "name": "Austen Cloud", "url": "https://tkaflowarts.com/about" },
      "isPartOf": { "@id": "https://tkaflowarts.com/#tka" }
    }
  }
  </script>`}
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://tkaflowarts.com/" },
      { "@type": "ListItem", "position": 2, "name": "Flow Arts History", "item": "https://tkaflowarts.com/history" },
      { "@type": "ListItem", "position": 3, "name": "The LOOP Algebra", "item": "${URL}" }
    ]
  }
  </script>`}
</Seo>

<div class="editorial loops-page">
  <!-- Back to the Guide, not the archive. The LOOP Algebra is TKA's own
       theory; pointing it back at /notation filed it alongside the systems
       other people built, which is the framing this page had to shed. -->
  <a class="back-link" href="/guide">← The Kinetic Alphabet Guide</a>

  <!-- 1. Hero — zero-prerequisite hook, real renderer -->
  <header class="editorial-header">
    <h1 class="page-title">The LOOP Algebra</h1>
    <p class="page-subtitle">
      Every pattern here returns to where it started. There are exactly six ways to do it.
    </p>
  </header>

  {#if heroSequence}
    <SequenceHeroDemo
      sequence={heroSequence}
      note="a Rotated LOOP, stepping 90 degrees on repeat"
    />
  {/if}

  <div class="lede">
    <p>
      A LOOP is a sequence built to come back around: run it out, and the second half
      (or third, or fourth) answers the first under one of six transformations. Mirror
      it, flip it, swap the hands, invert the motions, rewind it, rotate it forward,
      or stack several at once. The chips below build any combination TKA has verified
      and show you a real example, worked out.
    </p>
  </div>

  <!-- 2. The Explorer — the core instrument -->
  <section class="editorial-section" style="--accent: #36c3ff">
    <span class="section-kicker">Try it</span>
    <h2 class="section-title">Pick components, get a verified example</h2>
    <div class="prose">
      <p>
        Toggle any combination the alphabet supports. Illegal combinations disable with
        the reason why. Every example on screen passed the same detector the app uses to
        classify a LOOP. Nothing here is staged.
      </p>
    </div>
    <div class="explorer-wrap" use:activateExplorerWhenNear>
      <LazyMount
        loader={() =>
          import("#lib/shared/loop-explorer/components/LoopExplorer.svelte")}
        active={explorerActive}
      >
        {#snippet placeholder()}
          <div class="explorer-placeholder" aria-hidden="true">
            <div class="explorer-placeholder-picker"></div>
            <div class="explorer-placeholder-body">
              <div></div>
              <div></div>
            </div>
          </div>
        {/snippet}
        {#snippet error(_error, retry)}
          <div class="explorer-load-error" role="alert">
            <span>The LOOP explorer did not load.</span>
            <button type="button" onclick={retry}>Try again</button>
          </div>
        {/snippet}
      </LazyMount>
    </div>
  </section>

  <!-- 3. The Theorem — the deep floor -->
  <section class="editorial-section" style="--accent: #a78bfa">
    <span class="section-kicker">How it's built</span>
    <h2 class="section-title">The theorem underneath the chips</h2>

    <div class="prose">
      <p>
        The picker composes transforms in one of two ways. A slash, as in
        <code class="inline-tok">Mirrored/Inverted</code>, applies both simultaneously as
        one compound operation. A plus, as in
        <code class="inline-tok">Swapped + Mirrored/Inverted</code>, applies them in
        order: build the inner pattern first, then transform the whole thing with the
        outer one. Order matters:
        <code class="inline-tok">Swapped + Mirrored/Inverted</code> and
        <code class="inline-tok">Mirrored/Inverted + Swapped</code> are different
        sequences, valid from different starting positions.
      </p>
      <p>
        That constraint has a name: the fixed-point theorem. Say the inner pattern runs
        from position S back to S. That's what makes it circular on its own. The outer
        transform then has to take that closed loop and double it without breaking the
        seam, which means the outer transform has to leave S exactly where it is.
        <strong>The starting position has to be a fixed point of the outer transform.</strong>
      </p>
    </div>

    <div class="table-scroll">
      <table class="theorem-table">
        <caption>Fixed points by transform: where each one can sit outermost</caption>
        <thead>
          <tr>
            <th scope="col">Transform</th>
            <th scope="col">Fixed at</th>
          </tr>
        </thead>
        <tbody>
          {#each FIXED_POINTS as row (row.transform)}
            <tr>
              <th scope="row">{row.transform}</th>
              <td>{row.positions}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="prose">
      <p>
        Rotated has no fixed point anywhere on the L1-L5 grid. Every standard position
        moves when the pattern rotates 180 degrees. That's not a design choice; it's the
        reason rotation can never sit outermost. It only ever works as the innermost
        layer, the thing everything else gets built on top of.
      </p>
      <p>
        Beta is the one position every transform agrees on: it's a fixed point for
        Swapped by construction (swapping two hands standing at the same spot changes
        nothing), and it overlaps Mirrored's and Flipped's fixed sets too. That overlap
        is what makes beta the position where the most compositions become legal. It is
        the universal connector between components.
      </p>
    </div>

    <div class="table-scroll">
      <table class="theorem-table">
        <caption>Composability from a starting position: order changes the answer</caption>
        <thead>
          <tr>
            <th scope="col">Composition</th>
            <th scope="col">From</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {#each COMPOSABILITY as row (row.composition + row.from)}
            <tr>
              <th scope="row">{row.composition}</th>
              <td>{row.from}</td>
              <td class:result-blocked={row.result === "Blocked"}>{row.result}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="prose">
      <p>
        Length is a separate question from shape. A LOOP's position period is set by its
        outer transform: two passes for a halved rotation, four for a quartered one. But
        the props also carry an orientation, and orientation has its own period: every
        anti, dash, or hash motion flips it at the base, and turns step it further. If a
        hand's orientation hasn't cycled back to its start by the time the positions have,
        the LOOP keeps running extra passes until it does.
      </p>
      <p>
        Realized length is the seed multiplied by the least common multiple of those two
        periods, position and orientation. That's why one LOOP type can render at two
        different lengths: same skeleton, but a seed heavy on anti and dash motions
        drifts in orientation even at zero turns, and needs more passes to close the loop
        than a plainer one does.
      </p>
      <p>
        None of this is a new symmetry. Mirror, flip, rotate, swap are old moves. What's
        unformalized is applying them to this particular movement space, and the
        orientation-period structure in particular: TKA hasn't found this worked out
        anywhere else.
      </p>
    </div>
  </section>

  <!-- 3.5 Lineage — CAPs, credit where due -->
  <section class="editorial-section" style="--accent: #ec4899">
    <span class="section-kicker">Where this sits in the family</span>
    <h2 class="section-title">CAPs and LOOPs are cousins, not parent and child</h2>
    <div class="prose">
      <p>
        Continuous Assembly Patterns are the poi community's answer to the same problem:
        a pattern that closes back on itself. The lineage runs through the Home of Poi
        forums and out into the wider community:
      </p>
    </div>
    <ul class="bullet-list cap-credits">
      {#each CAP_CREDITS as credit (credit.name)}
        <li><strong>{credit.name}</strong>: {credit.role}</li>
      {/each}
    </ul>
    <div class="prose">
      <p>
        The two ideas overlap in what they're for but not in how they're built. A CAP
        composes per-hand trajectories: lay the left hand's path over the right hand's
        and see how they interlock. A LOOP composes per-step snapshots: one letter
        already holds both hands, so the composition works on the whole picture at once,
        step by step. Parallel concepts, not one contained in the other. CAPs get their
        own full treatment on a dedicated page.
      </p>
    </div>
  </section>

  <!-- 4. The Deck — product woven in -->
  <section class="editorial-section" style="--accent: #34d399">
    <span class="section-kicker">On the cards</span>
    <h2 class="section-title">Reading the icon strip on every card back</h2>
    <div class="prose">
      <p>
        Every physical Choreo Card carries a small icon strip on its back, one glyph per
        active component. Once you know the six shapes, the strip tells you what the
        card does before you scan it.
      </p>
    </div>
    <ul class="icon-legend">
      {#each LEGEND as entry (entry.component)}
        <li class="legend-row">
          <span class="legend-icon">
            <LOOPIconStrip activeComponents={new Set([entry.component])} size={20} />
          </span>
          <span class="legend-text">
            <strong>{entry.label}</strong>: {entry.description}
          </span>
        </li>
      {/each}
    </ul>
    <div class="prose">
      <p>
        A card carrying more than one icon is running them together, same rules as the
        picker above. A strip reading Rotated and Mirrored is a
        <code class="inline-tok">Mirrored/Rotated</code> LOOP, built the same way you just
        built one.
      </p>
    </div>
    <a href="/shop/loop-deck" class="cta-button deck-cta">
      <span>See the LOOP deck</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </a>
  </section>

  <!-- 5. Build your own -->
  <div class="cta-card">
    <h3>Build your own LOOP</h3>
    <p>Flow Arts Composer is free to use. No download required.</p>
    <a href="/create" class="cta-button" data-sveltekit-reload>
      <span>Open Flow Arts Composer</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </a>
  </div>
</div>

<style>
  .lede {
    margin-top: 2.6rem;
  }

  .explorer-wrap {
    margin-top: 1.6rem;
  }

  .explorer-placeholder,
  .explorer-load-error {
    min-height: 34rem;
  }

  .explorer-placeholder {
    display: grid;
    grid-template-rows: 5.5rem minmax(0, 1fr);
    gap: 1.25rem;
  }

  .explorer-placeholder-picker,
  .explorer-placeholder-body > div {
    border: 1px solid oklch(0.4 0.04 270 / 0.16);
    border-radius: 16px;
    background: oklch(0.16 0.018 270 / 0.45);
  }

  .explorer-placeholder-body {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    gap: 1.75rem;
  }

  .explorer-load-error {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.85rem;
    padding: 2rem;
    color: oklch(0.88 0.025 270);
    text-align: center;
    border: 1px solid oklch(0.4 0.04 270 / 0.16);
    border-radius: 16px;
    background: oklch(0.16 0.018 270 / 0.45);
  }

  .explorer-load-error button {
    min-height: var(--min-touch-target, 44px);
    padding-inline: 1rem;
    color: oklch(0.94 0.02 270);
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    border: 1px solid oklch(0.62 0.1 270 / 0.55);
    border-radius: 10px;
    background: oklch(0.36 0.08 270 / 0.5);
  }

  @media (max-width: 767px) {
    .explorer-placeholder {
      min-height: 46rem;
    }
    .explorer-placeholder-body {
      grid-template-columns: 1fr;
      grid-template-rows: repeat(2, minmax(0, 1fr));
      gap: 1.25rem;
    }
  }

  .inline-tok {
    font-family: "SFMono-Regular", ui-monospace, "Cascadia Code", Menlo, monospace;
    font-size: 0.92em;
    color: oklch(0.82 0.13 200);
    padding: 0 0.15em;
  }

  /* ── theorem tables ──
     Wide content scrolls in its own container rather than the page (no
     horizontal page scroll, per artifact/no-layout-shift discipline). */
  .table-scroll {
    overflow-x: auto;
    margin: 1.6rem 0;
    border-radius: 12px;
    border: 1px solid oklch(0.4 0.04 270 / 0.16);
  }
  .theorem-table {
    width: 100%;
    min-width: 32rem;
    border-collapse: collapse;
    font-size: clamp(0.85rem, 0.8rem + 0.14vw, 0.98rem);
  }
  .theorem-table caption {
    caption-side: top;
    text-align: left;
    padding: 0.8rem 1rem 0.6rem;
    font-size: 0.82rem;
    color: oklch(0.6 0.02 270);
    background: oklch(0.16 0.018 270 / 0.6);
  }
  .theorem-table th,
  .theorem-table td {
    padding: 0.65rem 1rem;
    text-align: left;
    border-top: 1px solid oklch(0.4 0.04 270 / 0.14);
    color: oklch(0.82 0.012 270);
  }
  .theorem-table thead th {
    color: oklch(0.7 0.02 270);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-top: none;
  }
  .theorem-table tbody th[scope="row"] {
    font-weight: 600;
    color: oklch(0.92 0.02 270);
    white-space: nowrap;
  }
  .theorem-table td.result-blocked {
    color: oklch(0.68 0.16 25);
  }

  .icon-legend {
    list-style: none;
    margin: 1.4rem 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .legend-row {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.6rem 0.9rem;
    background: oklch(0.16 0.018 270 / 0.45);
    border: 1px solid oklch(0.4 0.04 270 / 0.14);
    border-radius: 10px;
  }
  .legend-icon {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 32px;
  }
  .legend-text {
    font-size: clamp(0.88rem, 0.84rem + 0.12vw, 1rem);
    color: oklch(0.78 0.012 270);
  }
  .legend-text strong {
    color: oklch(0.92 0.02 270);
  }

  .deck-cta {
    margin-top: 0.6rem;
  }
</style>
