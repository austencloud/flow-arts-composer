<script lang="ts">
  /**
   * Prototype of /notation/qft — the archive reader.
   *
   * The restored animations and the computed model. No narrator and no
   * pull-quotes: every label states a fact about the knob values that produce
   * the move.
   */
  import QftUnit from "./_components/QftUnit.svelte";
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";

  const SOURCES = [
    {
      label: "Charlie Cushing — QfT Tutorial Series",
      href: "https://www.youtube.com/playlist?list=PL45D3844B85CB8D80"
    },
    {
      label: "Drex — A Beginner's Guide to Prop QFT Notation",
      href: "https://www.homeofpoi.com/en/community/forums/topics/932537/A-Beginner-s-Guide-to-Prop-QFT-Notation"
    },
    {
      label: "the same guide, mirrored",
      href: "https://drexfactor.com/weirdscience/2011/05/18/beginners_guide_poi_qft_notation"
    }
  ];

  const TIMELINE = [
    { when: "2011", what: "Charlie Cushing devises QfT. Drex writes up the notation." },
    { when: "May 2011", what: "The guide is posted to Home of Poi." },
    { when: "Nov 2011", what: "Charlie publishes ten video chapters covering the full formula." },
    { when: "2022", what: "A forum question about horizontal-plane moves goes unanswered." },
    { when: "since", what: "No further published work. The forum's images stop loading." }
  ];

  /*
   * Aspect ratios come from the frame manifest written by
   * scripts/extract-qft-frames.mjs. They are the crops' real proportions, not
   * chosen values — several of these drawings are markedly tall or wide, and
   * the card is shaped to fit each one.
   */
  const UNITS = [
    {
      title: "Static spin",
      stem: "static2",
      aspect: "384/389",
      knobs: { radius: 0, downbeats: 1, spin: "inspin" as const },
      spec: "radius 0 · one prop rotation per hand rotation"
    },
    {
      title: "Pendulum",
      stem: "pendulum",
      aspect: "196/189",
      knobs: { radius: 0, downbeats: 1, spin: "inspin" as const },
      pendulum: true,
      spec: "radius 0 · the swing never reaches 7, 8 or 1"
    },
    {
      title: "Extension",
      stem: "extension",
      aspect: "296/298",
      knobs: { radius: 1, downbeats: 1, spin: "inspin" as const },
      spec: "radius 1 · hand and prop orientations identical"
    },
    {
      title: "Isolation",
      stem: "isolationanimated",
      aspect: "191/219",
      knobs: { radius: 0.5, downbeats: 1, spin: "inspin" as const, phase: 4 },
      spec: "radius 0.5 · prop opposite the hand on the compass"
    },
    {
      title: "Cateye",
      stem: "cateyeanimated",
      aspect: "124/200",
      knobs: { radius: 0.5, downbeats: 1, spin: "antispin" as const },
      spec: "radius 0.5 · prop advances one position per step"
    },
    {
      title: "Triquetra",
      stem: "triquetraanimated",
      aspect: "421/265",
      knobs: { radius: 1, downbeats: 2, spin: "antispin" as const },
      spec: "radius 1 · two prop rotations per hand rotation"
    },
    {
      title: "4-petal antispin",
      stem: "antispindiranimated",
      aspect: "350/488",
      knobs: { radius: 1, downbeats: 3, spin: "antispin" as const },
      spec: "radius 1 · three prop rotations per hand rotation"
    },
    {
      title: "4-petal inspin",
      stem: "inspindiranimated",
      aspect: "350/486",
      knobs: { radius: 1, downbeats: 5, spin: "inspin" as const },
      spec: "radius 1 · five prop rotations · same positions as antispin, opposite directions"
    }
  ];

  /**
   * Below this the notation collapses to the step on screen. Matched to the
   * point where eight rows of seven numbers stop being legible, not to a device.
   */
  let compact = $state(false);
  $effect(() => {
    const q = matchMedia("(max-width: 48rem), (max-height: 34rem)");
    const sync = () => (compact = q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  });
</script>

<svelte:head><title>QfT Notation — archive</title></svelte:head>

<main class="page qft-archive">
  <section class="intro">
    <h1>QfT Notation</h1>
    <p class="standfirst">
      A poi notation devised by Charlie Cushing and written up by Ben "DrexFactor" Drexler in
      2011. The diagrams no longer load on the forum where they were posted. They are restored
      here, each one running beside a model that computes the same move from the published rules.
    </p>
    <ul class="sources">
      {#each SOURCES as s (s.href)}
        <li><LinkChip href={s.href}>{s.label}</LinkChip></li>
      {/each}
    </ul>
  </section>

  {#each UNITS as u (u.stem)}
    <QftUnit {...u} {compact} />
  {/each}

  <section class="end">
    <h2>Dates</h2>
    <ol class="timeline">
      {#each TIMELINE as t (t.when)}
        <li><span class="when">{t.when}</span><span>{t.what}</span></li>
      {/each}
    </ol>

    <p class="note">
      As published, the direction column has two variants: Charlie's, in which a direction that
      does not land on the eight-point compass is written <em>n</em>, and Drex's, in which
      direction is always a right angle to the tether and every cell resolves. The tables here use
      Drex's. Both appear in the source.
    </p>
  </section>
</main>

<style>
  /*
   * This archive is a deliberate rendered-artifact scale test. Ordinary app
   * and public surfaces keep a 16px root; this isolated harness owns its curve.
   */
  :global(html:has(.qft-archive)) {
    font-size: clamp(16px, 9.78px + 0.3704vw, 24px);
  }

  /*
   * Snap per concept. The reader lands on one whole idea at a time rather than
   * the tail of one and the head of the next. Proximity rather than mandatory
   * so a short unit on a tall screen is never trapped mid-gesture.
   */
  .page {
    height: 100dvh;
    overflow-y: auto;
    scroll-snap-type: y proximity;
    /*
     * The reading band. Widens on large screens so the side-by-side unit
     * composition has room to use the horizontal axis rather than sitting in
     * dead rail.
     */
    --band: min(64rem, 92vw);
  }

  @media (min-width: 105rem) and (min-height: 50rem) {
    .page {
      --band: min(104rem, 92vw);
    }
  }

  .page > :global(*) {
    max-width: var(--band);
    margin-inline: auto;
    padding-inline: 1.5rem;
  }

  .intro,
  .end {
    min-height: 100dvh;
    scroll-snap-align: start;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1.25rem;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.2rem, 1.4rem + 2.6vw, 4rem);
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .standfirst {
    margin: 0;
    font-size: clamp(1rem, 0.95rem + 0.35vw, 1.3rem);
    line-height: 1.6;
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.72));
  }

  .sources {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.4rem;
    font-size: 0.95rem;
  }

  .end h2 {
    margin: 0;
    font-size: 1.3rem;
  }

  .timeline {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.5rem;
  }

  .timeline li {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr);
    gap: 1rem;
    font-size: 0.95rem;
  }

  .when {
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.55));
    font-variant-numeric: tabular-nums;
  }

  .note {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.6));
  }

  @media (max-width: 30rem) {
    .timeline li {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.15rem;
    }
  }
</style>
