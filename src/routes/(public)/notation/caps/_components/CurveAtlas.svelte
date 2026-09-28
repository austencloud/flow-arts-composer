<script lang="ts">
  import {
    CAP_MATH_MODEL,
    countTrochoidFeatures,
    type CAPAssembly,
    type ElementaryPatternNotation,
  } from "@caps/domain";
  import rosette14Svg from "../_generated/rosette-1-4.svg?raw";
  import rosette1Neg6Svg from "../_generated/rosette-1-neg6.svg?raw";
  import cycloid14Svg from "../_generated/cycloid-1-4.svg?raw";
  import cycloid1Neg3Svg from "../_generated/cycloid-1-neg3.svg?raw";
  import yutaSvg from "../_generated/yuta-cap.svg?raw";
  import yutaThreeQuarterSvg from "../_generated/yuta-cap-three-quarter.svg?raw";
  import composition13Svg from "../_generated/cap-1-3-composition.svg?raw";

  let {
    selectedId,
    onselect,
  }: {
    selectedId: string | null;
    onselect: (id: string) => void;
  } = $props();

  type ElementaryCard = {
    kind: "elementary";
    pattern: ElementaryPatternNotation;
    svg: string;
    count: number;
  };

  type AssemblyCard = {
    kind: "assembly";
    assembly: CAPAssembly;
    svg: string;
  };

  const ELEMENTARY_IDS = [
    "rosette-1-4",
    "rosette-1-neg6",
    "cycloid-1-4",
    "cycloid-1-neg3",
  ] as const;
  const ASSEMBLY_IDS = [
    "yuta-cap",
    "yuta-cap-three-quarter",
    "cap-1-3-composition",
  ] as const;
  const SVG_BY_ID: Record<string, string> = {
    "rosette-1-4": rosette14Svg,
    "rosette-1-neg6": rosette1Neg6Svg,
    "cycloid-1-4": cycloid14Svg,
    "cycloid-1-neg3": cycloid1Neg3Svg,
    "yuta-cap": yutaSvg,
    "yuta-cap-three-quarter": yutaThreeQuarterSvg,
    "cap-1-3-composition": composition13Svg,
  };

  const elementaryCards: ElementaryCard[] = ELEMENTARY_IDS.map((id) => {
    const pattern = CAP_MATH_MODEL.elementaryPatterns.find(
      (candidate) => candidate.id === id
    );
    if (!pattern) throw new Error(`Missing CAP elementary pattern: ${id}`);
    return {
      kind: "elementary",
      pattern,
      svg: SVG_BY_ID[id]!,
      count: countTrochoidFeatures(pattern),
    };
  });

  const assemblyCards: AssemblyCard[] = ASSEMBLY_IDS.map((id) => {
    const assembly = CAP_MATH_MODEL.assemblies.find(
      (candidate) => candidate.id === id
    );
    if (!assembly) throw new Error(`Missing CAP assembly: ${id}`);
    return { kind: "assembly", assembly, svg: SVG_BY_ID[id]! };
  });

  let atlasElement = $state<HTMLElement | null>(null);

  function notationFor(pattern: ElementaryPatternNotation): string {
    return `${scalar(pattern.theta1)} ${scalar(pattern.theta2)} ; ${scalar(pattern.rho1)} ${scalar(pattern.rho2)} ; ${scalar(pattern.d)}`;
  }

  function scalar(value: number): string {
    if (Math.abs(value - Math.round(value)) < 1e-8) {
      return String(Math.round(value));
    }
    for (const denominator of [2, 3, 4, 5, 8]) {
      const numerator = Math.round(value * denominator);
      if (Math.abs(value - numerator / denominator) < 1e-8) {
        return `${numerator}/${denominator}`;
      }
    }
    return String(Number(value.toFixed(2)));
  }

  $effect(() => {
    const root = atlasElement;
    if (
      !root ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const cards = Array.from(
      root.querySelectorAll<HTMLElement>("[data-curve-card]")
    );
    for (const card of cards) card.classList.add("pre-draw");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const card = entry.target as HTMLElement;
          card.classList.remove("pre-draw");
          card.classList.add("drawing");
          observer.unobserve(card);
        }
      },
      { rootMargin: "0px 0px -8%", threshold: 0.12 }
    );

    for (const card of cards) observer.observe(card);
    return () => observer.disconnect();
  });
</script>

<div class="curve-atlas" bind:this={atlasElement}>
  <section class="atlas-group" aria-labelledby="elementary-curves-title">
    <header class="group-heading">
      <div>
        <span>Elementary patterns</span>
        <h3 id="elementary-curves-title">
          One equation, one uninterrupted curve
        </h3>
      </div>
      <p>
        Rosettes share equal radii. Cycloids tune the radii until cusps appear.
      </p>
    </header>

    <div class="elementary-grid">
      {#each elementaryCards as card (card.pattern.id)}
        <button
          class="curve-card"
          class:selected={selectedId === card.pattern.id}
          type="button"
          data-curve-card
          aria-pressed={selectedId === card.pattern.id}
          onclick={() => onselect(card.pattern.id)}
        >
          <span class="plot">{@html card.svg}</span>
          <span class="card-copy">
            <strong>{card.pattern.name}</strong>
            <span class="count-fact">
              {card.count}
              {card.pattern.patternType === "cycloid" ? "cusps" : "petals"}
            </span>
            <code>{notationFor(card.pattern)}</code>
          </span>
        </button>
      {/each}
    </div>
  </section>

  <section
    id="math-assembled"
    class="atlas-group assembled-group"
    aria-labelledby="assembled-curves-title"
  >
    <header class="group-heading">
      <div>
        <span>Assembled CAPs</span>
        <h3 id="assembled-curves-title">Fragments joined into a cycle</h3>
      </div>
      <p>
        These are the three composite plots Damien published in the 2009
        framework.
      </p>
    </header>

    <div class="assembly-grid">
      {#each assemblyCards as card (card.assembly.id)}
        <button
          class="curve-card assembly-card"
          class:selected={selectedId === card.assembly.id}
          type="button"
          data-curve-card
          aria-pressed={selectedId === card.assembly.id}
          onclick={() => onselect(card.assembly.id)}
        >
          <span class="plot">{@html card.svg}</span>
          <span class="card-copy">
            <strong>{card.assembly.name}</strong>
            <span class="source-fact">Damien, 2009</span>
            <code>{card.assembly.notation}</code>
          </span>
        </button>
      {/each}
    </div>
  </section>
</div>

<style>
  .curve-atlas {
    container-type: inline-size;
    display: grid;
    gap: clamp(2.25rem, 4cqi, 4.5rem);
  }

  .group-heading {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 0.8fr);
    align-items: end;
    gap: 1.5rem;
    margin-bottom: clamp(1rem, 1.8cqi, 1.6rem);
  }

  .group-heading span {
    color: color-mix(in srgb, var(--accent, #34d399) 74%, white);
    font-size: 0.75rem;
    font-weight: 720;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .group-heading h3 {
    margin: 0.3rem 0 0;
    color: var(--theme-text, #f8fafc);
    font-size: clamp(1.25rem, 1rem + 0.8cqi, 2rem);
    letter-spacing: -0.025em;
    line-height: 1.12;
  }

  .group-heading p {
    margin: 0;
    color: var(--theme-text-dim, #aab4c3);
    font-size: clamp(0.875rem, 0.82rem + 0.16cqi, 1.05rem);
    line-height: 1.55;
  }

  .elementary-grid,
  .assembly-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: clamp(0.8rem, 1.25cqi, 1.35rem);
  }

  .curve-card {
    position: relative;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 44px;
    padding: clamp(0.85rem, 1.25cqi, 1.25rem);
    overflow: hidden;
    border: 1px solid
      color-mix(in oklch, var(--theme-stroke, #ffffff1f) 76%, #34d399);
    border-radius: clamp(0.9rem, 1.3cqi, 1.35rem);
    background:
      radial-gradient(
        circle at 50% 28%,
        rgb(52 211 153 / 0.1),
        transparent 52%
      ),
      color-mix(in oklch, var(--theme-card-bg, #11151f) 90%, #071b19);
    box-shadow: inset 0 1px rgb(255 255 255 / 0.045);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 180ms ease,
      background-color 180ms ease,
      transform 180ms ease,
      box-shadow 180ms ease;
  }

  .curve-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--accent, #34d399) 52%, transparent);
    box-shadow:
      0 18px 42px -28px rgb(52 211 153 / 0.58),
      inset 0 1px rgb(255 255 255 / 0.07);
  }

  .curve-card.selected {
    border-color: var(--accent, #34d399);
    background:
      radial-gradient(
        circle at 50% 28%,
        rgb(52 211 153 / 0.18),
        transparent 56%
      ),
      color-mix(in oklch, var(--theme-card-bg, #11151f) 84%, #0b3027);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--accent, #34d399) 28%, transparent),
      0 22px 54px -34px rgb(52 211 153 / 0.68);
  }

  .curve-card:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 3px;
  }

  .plot {
    display: grid;
    place-items: center;
    min-height: 0;
    aspect-ratio: 1;
    padding: 0.15rem;
  }

  .plot :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .card-copy {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 0.42rem 0.75rem;
    padding-top: 0.65rem;
  }

  .card-copy strong {
    min-width: 0;
    color: var(--theme-text, #f8fafc);
    font-size: clamp(0.93rem, 0.86rem + 0.22cqi, 1.12rem);
    line-height: 1.25;
  }

  .count-fact,
  .source-fact {
    color: color-mix(in srgb, var(--accent, #34d399) 70%, white);
    font-size: 0.75rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .card-copy code {
    grid-column: 1 / -1;
    width: fit-content;
    max-width: 100%;
    overflow: hidden;
    color: var(--theme-text-dim, #aab4c3);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
  }

  @container (min-width: 44rem) {
    .elementary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (min-width: 64rem) {
    .assembly-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container (min-width: 90rem) {
    .elementary-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container (max-width: 42rem) {
    .group-heading {
      grid-template-columns: 1fr;
      gap: 0.6rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .curve-card {
      transition: none;
    }
    .curve-card:hover {
      transform: none;
    }
  }
</style>
