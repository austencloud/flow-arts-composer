<script lang="ts">
  /**
   * The reflow frame: stacks GuideBlocks in reading order down a mobile-first,
   * theme-aware editorial column. Ignores the `sheet` pt hints. Rendered inside
   * the reader (flow toggle) AND on the prerendered /guide/level-1/<slug> route
   * (crawlable). Pictographs render eagerly via GuidePictograph, whose synchronous
   * describePictograph aria-label lands in SSR HTML. One source with SheetFrame.
   *
   * Owns its OWN light/dark palette (prefers-color-scheme + [data-theme]) - it does
   * NOT inherit the app's --theme-* vars, which are set for the dark-cosmic canvas
   * and render faint ink on the white editorial column.
   */
  import GuidePictograph from "./GuidePictograph.svelte";
  import GuideGridExplorer from "./GuideGridExplorer.svelte";
  import GuideStepStrip from "./GuideStepStrip.svelte";
  import SequenceShowcase from "./SequenceShowcase.svelte";
  import GridSvg from "$lib/shared/pictograph/grid/components/GridSvg.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { stripToSequence } from "../_data/guide-sequence-adapter";
  import { deriveWord } from "$lib/shared/foundation/services/word-deriver";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type {
    GuideBlock,
    PictographRender,
  } from "../_data/guide-content-blocks";

  let {
    content,
    darkMode = false,
    tagline = "",
    layout = "default",
  }: {
    content: GuideBlock[];
    darkMode?: boolean;
    tagline?: string;
    layout?: "default" | "grid-reference";
  } = $props();

  // Theme handed to each pictograph: "dark" renders on the dark editorial theme
  // (dark fill + light grid/props); "light" keeps the print ink-on-white look.
  const picTheme = $derived(darkMode ? "dark" : "light");

  const stripHtml = (html: string) =>
    html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // The prose carries hard <br> line-wraps authored for the fixed-width print
  // sheet; in the reflow column they force awkward mid-phrase breaks. Drop them so
  // the text wraps to the column naturally (a flow-only transform - the sheet keeps
  // its <br>s). Keep every other tag (the red/blue spans, <strong>, <em>).
  const flowProse = (html: string) =>
    html.replace(/<br\s*\/?>/gi, " ").replace(/\s{2,}/g, " ");

  // The page title (level-1 heading) and the intro line are already shown by the
  // host hero (calligraphic title + tagline deck). Drop them here so the flow
  // column doesn't repeat the title as a section head or the tagline as its first
  // paragraph. Only the FIRST prose is checked, and only removed on an exact match
  // - unique intros stay verbatim.
  const rendered = $derived.by(() => {
    const tag = stripHtml(tagline);
    const out: GuideBlock[] = [];
    let firstProseSeen = false;
    for (const b of content) {
      if (b.kind === "heading" && b.level === 1) continue;
      if (!firstProseSeen && b.kind === "prose") {
        firstProseSeen = true;
        if (tag && stripHtml(b.html) === tag) continue;
      }
      out.push(b);
    }
    return out;
  });

  // Every `card: true` pictographGroup renders as ONE SequenceShowcase.
  // Spec: docs/superpowers/specs/2026-07-16-sequence-showcase-design.md.
  //
  // Which text the card owns:
  //   • Preceding text is absorbed ONLY as a complete heading-led mini-section
  //     (heading → prose → card, the permutations shape). A prose run with no
  //     heading directly above it is shared narrative for the whole page/family
  //     (the dj-ek-fl intro) - it stays in the flow.
  //   • Trailing prose up to the next heading/card is the card's own label or
  //     explanation - always absorbed.
  //   • Cards in a run of 2+ absorb nothing; the shared prose stays above.
  //
  // Which SHAPE the showcase takes (the layout answers to content density):
  //   • feature - a heading or substantial prose: banner (canvas left, text
  //     right) + full-width strip beneath.
  //   • compact - caption-sized text or none: one tight band (canvas | label +
  //     strip) hugging its content. A one-line label in the feature banner's
  //     text column would float in a void of empty space.
  type CardBlock = Extract<GuideBlock, { kind: "pictographGroup" }>;
  type RenderItem =
    | { type: "block"; block: GuideBlock }
    | {
        type: "showcase";
        card: CardBlock;
        text: GuideBlock[];
        variant: "feature" | "compact";
      };
  const isCard = (b: GuideBlock): b is CardBlock =>
    b.kind === "pictographGroup" && !!b.card;
  const isFlowText = (b: GuideBlock) =>
    b.kind === "prose" || b.kind === "glyphImage";
  const isSectionHead = (
    it: RenderItem
  ): it is { type: "block"; block: GuideBlock } =>
    it.type === "block" && it.block.kind === "heading" && it.block.level !== 1;
  // Substantial = a heading, or more plain-text than a caption-sized label.
  const FEATURE_TEXT_CHARS = 180;
  const showcaseVariant = (text: GuideBlock[]): "feature" | "compact" => {
    if (text.some((b) => b.kind === "heading")) return "feature";
    const chars = text.reduce(
      (n, b) => n + (b.kind === "prose" ? stripHtml(b.html).length : 0),
      0
    );
    return chars > FEATURE_TEXT_CHARS ? "feature" : "compact";
  };
  const renderItems = $derived.by(() => {
    const items: RenderItem[] = [];
    const blocks = rendered;
    let i = 0;
    while (i < blocks.length) {
      const b = blocks[i]!;
      if (!isCard(b)) {
        items.push({ type: "block", block: b });
        i++;
        continue;
      }
      // Collect the run of consecutive cards.
      const run: CardBlock[] = [];
      while (i < blocks.length && isCard(blocks[i]!))
        run.push(blocks[i++] as CardBlock);
      if (run.length >= 2) {
        for (const c of run)
          items.push({
            type: "showcase",
            card: c,
            text: [],
            variant: "compact",
          });
        continue;
      }
      // Lone card. Measure the contiguous text run already emitted above it,
      // and absorb it (with its heading) only if a heading sits directly above
      // - a complete mini-section that belongs to this card.
      let k = items.length;
      while (k > 0) {
        const it = items[k - 1]!;
        if (it.type === "block" && isFlowText(it.block)) k--;
        else break;
      }
      const before: GuideBlock[] = [];
      if (k < items.length && k > 0 && isSectionHead(items[k - 1]!)) {
        const section = items.splice(k - 1);
        for (const it of section)
          before.push((it as { type: "block"; block: GuideBlock }).block);
      }
      // Trailing prose/glyphs are the card's own label or explanation.
      const after: GuideBlock[] = [];
      while (i < blocks.length && isFlowText(blocks[i]!))
        after.push(blocks[i++]!);
      const text = [...before, ...after];
      items.push({
        type: "showcase",
        card: run[0]!,
        text,
        variant: showcaseVariant(text),
      });
    }
    return items;
  });

  // Render hints → GuidePictograph props, defaulting to FlowFrame's prior hardcoded
  // behavior (HAND props, TKA glyph on, every other layer off).
  const r = (render?: PictographRender) => ({
    propType: render?.propType ?? PropType.HAND,
    showTKA: render?.showTKA ?? true,
    showPlacements: render?.showPlacements ?? false,
    showElemental: render?.showElemental ?? false,
    showReversals: render?.showReversals ?? false,
    showNonRadialPoints: render?.showNonRadialPoints ?? false,
  });

  // A sequence group → a playable SequenceData for the ChoreoCard. The word is
  // derived from the steps' own letters (unique per sequence, so cards don't
  // collide on the thumbnail cache key) rather than parsed from the caption.
  const groupSequence = (items: readonly unknown[]): SequenceData => {
    const strip = items as unknown as StepData[];
    // Derive the word from the strip's OWN step letters (skipping the start box) -
    // robust even when stripToSequence doesn't surface letters on `.steps` (some
    // sources, e.g. the reversal demos, otherwise fall back to a generic name).
    const fromLetters = strip
      .filter((s) => (s.stepNumber ?? 0) > 0)
      .map((s) => (s.letter as unknown as string) ?? "")
      .filter(Boolean)
      .join("");
    const full =
      fromLetters || deriveWord(stripToSequence(strip, {})) || "sequence";
    // A LOOP repeats its word by construction - show the smallest form (AABB, not
    // AABBAABB), per the simplified-word-display rule.
    const w = simplifyRepeatedWord(full) || full;
    return stripToSequence(strip, { word: w, name: w });
  };

  const gridLabel = (mode: "diamond" | "box" | "merged") =>
    mode === "diamond"
      ? "Diamond grid: four points at north, east, south, and west"
      : mode === "box"
        ? "Box grid: four points on the diagonals"
        : "8-point grid: diamond and box combined";

  const areaClass = (block: GuideBlock) =>
    block.flowArea ? `flow-area-${block.flowArea}` : "";
</script>

<div class="flow-frame" class:grid-reference={layout === "grid-reference"}>
  {#each renderItems as item, i (i)}
    {#if item.type === "showcase"}
      <!-- A word sequence's showcase: square live animation beside the section's
           text, the steps unrolled as a strip beneath. The strip + text are
           prerendered (crawlable); only the animation is browser-gated, inside
           SequenceShowcase. -->
      {@const scard = item.card}
      {@const sseq = groupSequence(scard.sequenceItems ?? scard.items)}
      <div class="flow-showcase" class:compact={item.variant === "compact"}>
        <SequenceShowcase
          sequence={sseq}
          items={scard.items}
          stepLabels={scard.stepLabels}
          render={scard.render}
          variant={item.variant}
          pool={scard.pool?.entries}
          {picTheme}
        >
          {#snippet text()}
            {#if item.text.length}
              {#each item.text as tb, m (m)}
                {#if tb.kind === "heading"}
                  {#if tb.level === 2}
                    <h2 class="flow-h2 showcase-h">{tb.text}</h2>
                  {:else}
                    <h3 class="flow-h3 showcase-h">{tb.text}</h3>
                  {/if}
                {:else if tb.kind === "prose"}
                  <p class="flow-p showcase-p">{@html flowProse(tb.html)}</p>
                {:else if tb.kind === "glyphImage"}
                  <img
                    class="flow-glyph showcase-glyph"
                    src={tb.src}
                    alt={tb.alt}
                  />
                {/if}
              {/each}
            {:else if scard.caption}
              <!-- Authored captions already name the word ("EK - Exploding
                   Kitten") - showing the derived word above one doubles it. -->
              <p class="flow-caption showcase-caption">{scard.caption}</p>
            {:else}
              <h3 class="flow-h3 showcase-h">{sseq.word}</h3>
            {/if}
          {/snippet}
        </SequenceShowcase>
      </div>
    {:else}
      {@const block = item.block}
      {#if block.kind === "heading"}
        {#if block.level === 2}
          <h2 class="flow-h2">{block.text}</h2>
        {:else}
          <h3 class="flow-h3">{block.text}</h3>
        {/if}
      {:else if block.kind === "prose"}
        <p class="flow-p {areaClass(block)}">{@html flowProse(block.html)}</p>
      {:else if block.kind === "glyphImage"}
        <img class="flow-glyph" src={block.src} alt={block.alt} />
      {:else if block.kind === "pictograph"}
        {@const rp = r(block.render)}
        <figure class="flow-figure {areaClass(block)}">
          <div class="pic-card">
            <GuidePictograph
              data={block.data}
              size="md"
              eager
              forceTheme={picTheme}
              propType={rp.propType}
              showTKA={rp.showTKA}
              showPlacements={rp.showPlacements}
              showElemental={rp.showElemental}
              showReversals={rp.showReversals}
              showNonRadialPoints={rp.showNonRadialPoints}
            />
          </div>
          {#if block.caption}<figcaption>{block.caption}</figcaption>{/if}
        </figure>
      {:else if block.kind === "pictographGroup"}
        {@const rp = r(block.render)}
        {#if block.layout === "strip"}
          <!-- A sequence: one left-to-right strip (scrolls on narrow screens),
             the mobile-faithful form of the sheet's step rows. -->
          <GuideStepStrip
            items={block.items}
            stepLabels={block.stepLabels}
            caption={block.caption}
            render={block.render}
            {picTheme}
          />
        {:else}
          <div class="flow-grid" style:--cols={block.flowCols ?? 4}>
            {#each block.items as pos, n (pos.id ?? n)}
              <div class="pic-card">
                <GuidePictograph
                  data={pos}
                  size="sm"
                  eager
                  forceTheme={picTheme}
                  propType={rp.propType}
                  showTKA={rp.showTKA}
                  showPlacements={rp.showPlacements}
                  showElemental={rp.showElemental}
                  showReversals={rp.showReversals}
                  showNonRadialPoints={rp.showNonRadialPoints}
                />
              </div>
            {/each}
          </div>
          {#if block.caption}<p class="flow-caption">{block.caption}</p>{/if}
        {/if}
      {:else if block.kind === "gridFigure"}
        <figure class="flow-grid-figure">
          <svg
            class="grid-fig"
            viewBox="0 0 950 950"
            role="img"
            aria-label={block.caption ?? gridLabel(block.mode)}
            style:background={darkMode ? "#0a0a0f" : "#ffffff"}
          >
            <desc>{block.caption ?? gridLabel(block.mode)}</desc>
            <rect
              width="950"
              height="950"
              fill={darkMode ? "#0a0a0f" : "#ffffff"}
            />
            {#if block.mode === "merged"}
              <GridSvg gridMode={GridMode.DIAMOND} {darkMode} />
              <GridSvg gridMode={GridMode.BOX} {darkMode} />
            {:else}
              <GridSvg
                gridMode={block.mode === "box"
                  ? GridMode.BOX
                  : GridMode.DIAMOND}
                {darkMode}
              />
            {/if}
          </svg>
          {#if block.caption}<figcaption>{block.caption}</figcaption>{/if}
        </figure>
      {:else if block.kind === "gridExplorer"}
        <div class={areaClass(block)}>
          <GuideGridExplorer
            modes={block.modes}
            initialMode={block.initialMode}
            {darkMode}
          />
        </div>
      {:else if block.kind === "printOnly"}
        {#each block.flow as fb, m (m)}
          {#if fb.kind === "prose"}<p class="flow-p">
              {@html flowProse(fb.html)}
            </p>{/if}
          {#if fb.kind === "heading"}<h3 class="flow-h3">{fb.text}</h3>{/if}
        {/each}
      {/if}
      <!-- rule blocks are print-only chrome; the flow column uses spacing, not hairlines -->
    {/if}
  {/each}
</div>

<style>
  /* Palette comes from the host via --ink/--ink-dim/--glyph-invert (with dark-ink
     fallbacks for a white host). FlowFrame must NOT declare --ink on .flow-frame -
     a local declaration would shadow the host's value and break the dark theme. */
  /* This column renders INSIDE the guide SPA shell (.guide-content), whose
     dark-scroll typography (Inter, lavender oklch, weight 370, smaller sizes) is
     set with (0,1,1) rules that beat inheritance. Every text element below
     therefore states its OWN color / font-family / size / weight explicitly - the
     scoped .flow-* selectors out-specify .guide-content h2/h3/p, but only for the
     properties they actually set. Leave one unset and the dark-SPA value shows
     through. */
  /* The frame is a WIDE container; the reading measure is enforced per-element
     (.flow-p caps at 34rem, headings are short centred text), so prose pages look
     unchanged - their content still sits centred at its own width. The extra
     frame width only exists so card rows can break past the reading measure and
     show 3 legible cards across. */
  .flow-frame {
    max-width: 62rem;
    margin: 0 auto;
    padding: 0.5rem 1.5rem 4rem;
    color: var(--ink, #1a1a1a);
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 1.2rem;
    line-height: 1.7;
  }
  .flow-h2 {
    font-family: "Cormorant Garamond", Georgia, serif;
    color: var(--ink, #1a1a1a);
    font-size: clamp(1.6rem, 4vw, 2.1rem);
    margin: 2.25rem 0 0.6rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-align: center;
    text-wrap: balance;
  }
  .flow-h3 {
    font-family: "Cormorant Garamond", Georgia, serif;
    color: var(--ink, #1a1a1a);
    font-size: clamp(1.25rem, 3vw, 1.55rem);
    margin: 1.75rem 0 0.35rem;
    font-weight: 650;
    text-align: center;
    text-wrap: balance;
  }
  .flow-p {
    font-family: "Cormorant Garamond", Georgia, serif;
    color: var(--ink, #1a1a1a);
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.7;
    margin: 0 0 1.1rem;
    text-align: center;
    max-width: 34rem;
    margin-inline: auto;
    /* Even the line lengths on these short centred blocks so breaks land on
       phrase boundaries instead of stranding "the / shoulder" (2026 native). */
    text-wrap: balance;
  }
  /* Plain <strong> emphasis stays ink + bold (guide-content colours it lavender);
     the red/blue letter spans below still win their own colour. */
  .flow-p :global(strong) {
    color: var(--ink, #1a1a1a);
    font-weight: 700;
  }
  .flow-p :global(.cR) {
    color: #cc2127;
    font-weight: 700;
  }
  .flow-p :global(.cB) {
    color: #2e3192;
    font-weight: 700;
  }
  .flow-p :global(.lg) {
    display: inline-block;
    width: 0.8em;
  }
  /* Section glyph: a modest opener, centered above the section name. */
  .flow-glyph {
    display: block;
    height: 3rem;
    width: auto;
    margin: 2.25rem auto 0.35rem;
    filter: invert(var(--glyph-invert, 0));
  }
  /* First section glyph shouldn't push a big gap under the intro. */
  .flow-glyph:first-of-type,
  .flow-p + .flow-glyph {
    margin-top: 1.5rem;
  }

  /* ── Pictograph card: a framed cell so every pictograph reads as a discrete
     figure (the sheet minis' hairline border), theme-aware in one rule - a faint
     border + matching fill derived from --ink, so it works on both the warm-white
     and dark editorial columns. Rounds + clips the pictograph's square corners. */
  .pic-card {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border: 1px solid color-mix(in oklab, var(--ink, #1a1a1a) 16%, transparent);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 4px
      color-mix(in oklab, var(--ink, #1a1a1a) 7%, transparent);
  }
  .pic-card :global(.guide-pictograph) {
    width: 100%;
  }
  .pic-card :global(.pictograph-wrapper) {
    /* guide.css sizes wrappers by size class (.size-sm { width/height: 7.5rem })
       at higher specificity than the component's own width: 100%. Inside a
       pic-card the CARD is the sizer - the wrapper must fill it, or the frame
       letterboxes its pictograph between gray side bands. */
    width: 100% !important;
    height: auto !important;
    aspect-ratio: 1;
    max-width: none !important;
  }

  .flow-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 0.75rem;
    max-width: 30rem;
    margin: 1rem auto 1.25rem;
  }
  @media (max-width: 520px) {
    .flow-grid {
      grid-template-columns: repeat(2, 1fr);
      max-width: 22rem;
    }
  }
  .flow-figure {
    margin: 1.5rem auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.55rem;
    max-width: 15rem;
  }

  /* ── Sequence showcase: banner (square animation + section text) over the
     step strip. SequenceShowcase owns its internal layout; this wrapper owns
     PLACEMENT - break out of the narrow reading measure to use the content
     width on large screens. 94cqw = 94% of the guide route's own width (a
     container set in GuidePageHost), so it uses the 4K width without colliding
     with the sidebar; 72rem caps the text measure. Prose elsewhere stays
     narrow-centred. */
  .flow-showcase {
    width: min(72rem, 94cqw);
    margin-inline: calc((100% - min(72rem, 94cqw)) / 2);
    margin-block: 1.9rem;
  }
  /* Compact showcases (caption-only) read as figures in the flow, not feature
     bands - tighter rhythm between consecutive ones. */
  .flow-showcase.compact {
    margin-block: 1.4rem;
  }
  /* Inside the compact label, tight paragraph rhythm - the band is shallow. */
  .flow-showcase.compact .showcase-h {
    margin: 0 0 0.25rem;
  }
  .flow-showcase.compact .showcase-p {
    margin-bottom: 0.4rem;
  }
  .flow-showcase.compact .showcase-p:last-child,
  .flow-showcase.compact .showcase-h:last-child {
    margin-bottom: 0;
  }
  /* Text inside the showcase banner reads left-aligned and full-width in its
     column (not the centred narrow measure standalone flow prose uses);
     headings drop the standalone section head's big top margin. Inside a
     stacked (narrow) showcase - the nearest @container is the showcase itself -
     everything re-centres. */
  .flow-p.showcase-p {
    text-align: left;
    max-width: none;
    margin-inline: 0;
    margin-bottom: 0.7rem;
  }
  .flow-h2.showcase-h,
  .flow-h3.showcase-h {
    text-align: left;
    margin: 0 0 0.35rem;
  }
  .flow-glyph.showcase-glyph {
    margin-inline: 0;
  }
  .flow-caption.showcase-caption {
    margin: 0;
    max-width: none;
    text-align: left;
  }
  @container (max-width: 600px) {
    .flow-p.showcase-p,
    .flow-h2.showcase-h,
    .flow-h3.showcase-h,
    .flow-caption.showcase-caption {
      text-align: center;
    }
    .flow-glyph.showcase-glyph {
      margin-inline: auto;
    }
  }

  .flow-figure figcaption,
  .flow-caption,
  .flow-grid-figure figcaption {
    font-size: 1rem;
    font-style: italic;
    color: var(--ink-dim, #555);
    text-align: center;
    line-height: 1.4;
  }
  .flow-caption {
    margin: 0.15rem auto 0.25rem;
    max-width: 30rem;
  }

  /* Grid diagram (The Grid page): the canonical GridSvg on a white square,
     points only - matching the printed proof's diamond/box/8-point figures. */
  .flow-grid-figure {
    margin: 1.5rem auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    max-width: 18rem;
  }
  .grid-fig {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    border: 1px solid color-mix(in oklab, var(--ink, #1a1a1a) 16%, transparent);
    border-radius: 12px;
    /* background is set inline (theme-aware): white in light, near-black in dark */
  }
  /* The proof shows points only - drop GridSvg's connecting lines. */
  .grid-fig :global(line) {
    display: none;
  }
  .grid-fig :global(.grid-container) {
    opacity: 1;
  }

  /* The Grid is the guide's one diagram-led reference page. Its authored prose
     stays in reading order in the DOM, while named areas recover the print
     sheet's deliberate left / figure / right relationship on roomy screens. */
  .flow-frame.grid-reference {
    max-width: 76rem;
    padding-top: 0.75rem;
    display: grid;
    grid-template-columns:
      minmax(15rem, 0.9fr)
      minmax(17rem, 0.8fr)
      minmax(15rem, 0.9fr);
    grid-template-areas:
      "overview hands points"
      "combination combination combination"
      "explorer explorer explorer"
      "closing closing closing";
    column-gap: clamp(1.5rem, 3cqw, 3.5rem);
    row-gap: 0.75rem;
    align-items: center;
  }

  .grid-reference .flow-area-grid-overview {
    grid-area: overview;
  }
  .grid-reference .flow-area-grid-hands {
    grid-area: hands;
  }
  .grid-reference .flow-area-grid-points {
    grid-area: points;
  }
  .grid-reference .flow-area-grid-combination {
    grid-area: combination;
  }
  .grid-reference .flow-area-grid-explorer {
    grid-area: explorer;
  }
  .grid-reference .flow-area-grid-closing {
    grid-area: closing;
  }

  .grid-reference .flow-area-grid-overview,
  .grid-reference .flow-area-grid-points {
    max-width: 21rem;
    margin: 0;
    text-align: left;
    text-wrap: pretty;
  }

  .grid-reference .flow-area-grid-hands {
    width: min(100%, 18rem);
    margin-block: 0;
  }

  .grid-reference .flow-area-grid-combination {
    margin: 0.25rem auto 0;
  }

  .grid-reference .flow-area-grid-closing {
    margin: -0.1rem auto 0;
  }

  @container (max-width: 60rem) {
    .flow-frame.grid-reference {
      max-width: 48rem;
      grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.85fr);
      grid-template-areas:
        "overview hands"
        "points hands"
        "combination combination"
        "explorer explorer"
        "closing closing";
      column-gap: 2rem;
    }

    .grid-reference .flow-area-grid-overview,
    .grid-reference .flow-area-grid-points {
      max-width: 28rem;
    }
  }

  @container (max-width: 42rem) {
    .flow-frame.grid-reference {
      padding-inline: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .grid-reference .flow-area-grid-overview,
    .grid-reference .flow-area-grid-points {
      max-width: 34rem;
      margin-inline: auto;
      text-align: center;
      text-wrap: balance;
    }

    .grid-reference .flow-area-grid-hands {
      width: min(100%, 17rem);
      margin-block: 0.25rem;
    }
  }

  /* Wide/4K ramp: FlowFrame's own reading measures stay narrow-centred (prose is
     capped independently of this), but the card grids/figures below are square
     content in a WIDE frame - below 1680px they're already sized right; above
     it there's room to let them breathe rather than staying pinned to their
     sub-1680 caps forever. Base (sub-1680) values above are untouched. */
  @media (min-width: 1680px) {
    .flow-grid {
      max-width: 40rem;
    }
    .flow-grid-figure {
      max-width: 24rem;
    }
    .flow-figure {
      max-width: 20rem;
    }
  }

  /* Palette is HOST-owned: the reader's flow page is always a white sheet (keep
     the dark-ink default), the crawl route sets --ink/--glyph-invert per
     light/dark. FlowFrame never assumes its own background, so it can't flip ink
     to light on a white host. */
</style>
