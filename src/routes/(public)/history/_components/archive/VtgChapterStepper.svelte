<!--
  Vulcan Tech Gospel artifact: VTG 1's five chapters, stepped by hand.

  Two decisions this component exists to hold:

  1. NOTHING ADVANCES ON A TIMER. An auto-crossfade takes the plate away while
     you are still reading it, and these plates take reading. Stepping is an
     action the viewer performs, so the transition can also be an instant cut —
     you chose the moment, so there is nothing to soften.

  2. THE STEPS ARE THE DOCUMENT'S OWN TABLE OF CONTENTS, not a sequence anyone
     here curated. Five chapters, five authors, in VTG V.1's printed order. A
     labelled segmented control keeps chapter navigation visibly distinct from
     the archive's chronological timeline.

  Every plate is cropped from the source PDF. Provenance and quotes:
  ../_lib/vtg-chronicle.ts
-->
<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { VTG1_CHAPTERS, vtgChapter } from "./_lib/vtg-chronicle.svelte";

  let {
    active = false,
    reader = false,
  }: { active?: boolean; reader?: boolean } = $props();

  const chapters = VTG1_CHAPTERS;
  // Shared across every instance on the page — see vtgChapter's own comment.
  const step = $derived(vtgChapter.index);
  const current = $derived(chapters[step] ?? chapters[0]!);
  const chapterOptions = $derived(
    chapters.map((chapter, index) => ({
      value: String(index),
      label: String(index + 1),
      ariaLabel: `Chapter ${index + 1} of ${chapters.length}: ${chapter.title}, ${chapter.people}`,
      disabled: !active,
      tone: "accent" as const,
    }))
  );

  function go(value: string) {
    if (!active) return;
    const n = Number(value);
    vtgChapter.index = (n + chapters.length) % chapters.length;
  }

  /* Ghost sizers: the title and the credit both change length between
	   chapters, and without a reserved box the rail below them would jump on
	   every step (.claude/rules/no-layout-shift.md). */
  const widestTitle = chapters.reduce(
    (a, c) => (c.title.length > a.length ? c.title : a),
    ""
  );
  const widestPeople = chapters.reduce(
    (a, c) => (c.people.length > a.length ? c.people : a),
    ""
  );
  const widestNote = chapters.reduce(
    (a, c) => (c.note.length > a.length ? c.note : a),
    ""
  );
</script>

<div class="vtg" class:active class:reader>
  <figure class="stage">
    <!-- No crossfade: an instant swap is correct for a hand-driven stepper,
		     and overlapping two dense line lattices produces moiré anyway. -->
    <div class="plate">
      <img
        src={`/images/notation/vtg/figures/${current.figure}.webp`}
        alt={`${current.title}, from the Vulcan Tech Gospel V.1`}
        decoding="async"
      />
    </div>

    <figcaption class="label">
      <span class="title">
        <span class="sizer" aria-hidden="true">{widestTitle}</span>
        <span class="live">{current.title}</span>
      </span>
      <span class="people">
        <span class="sizer" aria-hidden="true">{widestPeople}</span>
        <span class="live">{current.people}</span>
      </span>
      <!-- Only rendered on a tall tile (see .note's container query). A 4K hero
		     is 1702px tall and one landscape plate cannot fill it; rather than
		     stretch the artwork, the room goes to Yee's own account of who wrote
		     the chapter and where. -->
      <span class="note">
        <span class="sizer" aria-hidden="true">{widestNote}</span>
        <span class="live">{current.note}</span>
      </span>
    </figcaption>
  </figure>

  <!-- The outer archive is chronological; this is explicitly a chapter
	     selector. Different label, different control, different navigation
	     scope. The old implementation repeated the archive's hairline ticks and
	     gave a first-time reader no way to tell the two levels apart. -->
  <div class="chapter-nav" role="group" aria-label="Choose a VTG chapter">
    <div class="chapter-heading">
      <span>Choose a chapter</span>
      <strong>Chapter {step + 1} of {chapters.length}</strong>
    </div>
    <SegmentedControl
      options={chapterOptions}
      value={String(step)}
      onchange={go}
      color="accent"
      size="md"
      semantics="tabs"
      ariaLabel="Vulcan Tech Gospel volume 1 chapters"
    />
  </div>
</div>

<style>
  .vtg {
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    display: grid;
    /* All three rows hug their content and the GROUP centres, rather than
		   the stage absorbing the slack. Every VTG page is landscape and this
		   tile is portrait, so a stage that takes the leftover height strands
		   the plate in mid-air with the credit and rail marooned at the bottom
		   edge. Centring the group puts equal void above and below one
		   composed unit — plate, title, rail — which is what a plate on a wall
		   looks like. */
    grid-template-rows: auto auto;
    align-content: center;
    gap: clamp(0.35rem, 1.6cqi, 0.8rem);
    padding: clamp(0.5rem, 2.5cqi, 1.4rem);
  }

  .stage {
    margin: 0;
    min-height: 0;
    display: grid;
    place-items: center;
    gap: clamp(0.35rem, 1.6cqi, 0.8rem);
  }

  /* The paper is the FIGURE's rectangle, not the tile's. Every VTG page is
	   landscape and this tile is portrait, so a paper ground stretched to fill
	   would be ~40% blank page. Capping by max-* keeps the plate's own
	   proportions, which carry information: an isolation really is a dot beside
	   a full-size extension. */
  /* The cap is in cqh, NOT `max-height: 100%`. Once the stage stopped being a
	   `minmax(0, 1fr)` row it became auto-sized, which makes a percentage height
	   on its child indefinite — `max-height: 100%` silently stops binding and
	   the plate grows past the tile (caught at 960x412, where a 269px tile held
	   a 275px plate). 62cqh leaves room for the title, credit and rail beneath
	   it at every tile size. */
  .stage img {
    max-width: 100%;
    max-height: 62cqh;
    width: auto;
    height: auto;
    display: block;
    box-sizing: border-box;
    padding: clamp(0.4rem, 2cqi, 1rem);
    border-radius: 12px;
    background: oklch(0.96 0.008 90 / 0.95);
    border: 1px solid oklch(0.72 0.13 40 / 0.28);
    box-shadow: 0 10px 34px oklch(0.1 0.02 275 / 0.45);
  }

  .label {
    display: grid;
    justify-items: center;
    gap: 0.15rem;
    text-align: center;
    min-width: 0;
  }

  .title,
  .people {
    display: inline-grid;
    max-width: 100%;
  }

  /* The cqi COEFFICIENT is what binds here, not the ceiling — the hero tile is
	   508cqi wide at 1080 and 794cqi at 4K, so a 2.3cqi title tops out at 18px
	   even with a 2.1rem cap it can never reach. Raising the coefficient is what
	   actually scales this; the cap only stops it running away on an ultrawide. */
  .title {
    font-size: clamp(var(--font-size-min, 0.875rem), 3.6cqi, 2.2rem);
    font-weight: 600;
    letter-spacing: -0.005em;
    color: oklch(0.9 0.02 80);
  }

  .people {
    font-size: clamp(var(--font-size-compact, 0.75rem), 2.6cqi, 1.6rem);
    font-style: italic;
    color: var(--theme-text-dim, oklch(0.76 0.02 270));
  }

  .note {
    display: none;
    max-width: 44em;
    margin-top: 0.6rem;
    font-size: clamp(var(--font-size-min, 0.875rem), 2.2cqi, 1.4rem);
    line-height: 1.5;
    color: var(--theme-text-dim, oklch(0.76 0.02 270));
  }

  /* Tall tiles only. The 1080 hero (~730px) has no room to spare; the 4K hero
	   (~1700px) has more void than plate. */
  @container (min-height: 900px) {
    .note {
      display: inline-grid;
    }
  }

  .sizer,
  .live {
    grid-area: 1 / 1;
  }

  /* The sizer WRAPS, deliberately. What has to be reserved here is HEIGHT, not
	   width: the label is centred with the rail below it, so a wider string
	   moves nothing sideways, but a string that wraps to two lines pushes the
	   rail down. A `nowrap` sizer reserves the longest credit's full unwrapped
	   width instead, which overflows a 257px tile and clips the live text.
	   Wrapping it reserves exactly the tallest case at the current width. */
  .sizer {
    visibility: hidden;
  }

  .live {
    min-width: 0;
  }

  .chapter-nav {
    display: grid;
    gap: 0.35rem;
    width: min(100%, 24rem);
    margin-inline: auto;
  }

  .chapter-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding-inline: 0.15rem;
    color: var(--theme-text-dim, oklch(0.76 0.02 270));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .chapter-heading > span {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
  }

  .chapter-heading strong {
    font-variant-numeric: tabular-nums;
  }

  /* Small tile: the plate is the artifact. Credit and rail stand down rather
	   than squeezing it out of the tile — the stepper is a hero-tile affordance
	   and there is no room to hit a 44px target here anyway. */
  /* Threshold set from the archive's measured tiles: hero is 764 tall, the
	   small tiles ~378. At 378 a five-stop rail of 44px targets plus a wrapped
	   credit eats the plate, and the small tiles are posters you click, not
	   controls you operate — the stepper belongs to the hero. Keeping the
	   chapter title, which is the one thing worth reading at that size. */
  @container (max-height: 460px) {
    .people,
    .chapter-nav {
      display: none;
    }
  }

  @container (max-width: 200px) {
    .label {
      display: none;
    }
  }
  /* The history reader has room for the full publication and always keeps
     chapter controls available, including on short screens. */
  .vtg.reader {
    height: auto;
    padding: 0;
    gap: 1rem;
  }
  .plate {
    display: contents;
  }
  .reader .plate {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: min(var(--archive-preview-height), 85cqi);
  }
  .reader .stage img {
    width: auto;
    height: auto;
    max-height: 100%;
    object-fit: contain;
    padding: 0;
    background: oklch(0.96 0.008 90 / 0.95);
    border: 0;
    box-shadow: none;
  }
  .reader .title {
    font-size: 1.125rem;
  }
  .reader .people {
    display: inline-grid;
    font-size: 0.875rem;
  }
  .reader .chapter-nav {
    display: grid;
    width: min(100%, 30rem);
  }
  .reader .note {
    display: none;
  }
</style>
