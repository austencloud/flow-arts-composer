<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

  let { pictograph }: { pictograph: StepData } = $props();
</script>

<div class="rosetta-shell">
  <div class="rosetta" aria-label="Three notation systems compared">
    <figure class="specimen">
      <div class="artifact qft-artifact">
        <svg
          viewBox="0 0 200 200"
          role="img"
          aria-label="QFT circle with eight numbered points and a move from eight to one"
        >
          <defs>
            <marker
              id="lab-qft-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
            </marker>
          </defs>
          <circle cx="100" cy="100" r="78" class="qft-ring" />
          <g class="qft-points">
            <circle cx="100" cy="22" r="12" /><text x="100" y="26">8</text>
            <circle cx="155" cy="45" r="12" /><text x="155" y="49">1</text>
            <circle cx="178" cy="100" r="12" /><text x="178" y="104">2</text>
            <circle cx="155" cy="155" r="12" /><text x="155" y="159">3</text>
            <circle cx="100" cy="178" r="12" /><text x="100" y="182">4</text>
            <circle cx="45" cy="155" r="12" /><text x="45" y="159">5</text>
            <circle cx="22" cy="100" r="12" /><text x="22" y="104">6</text>
            <circle cx="45" cy="45" r="12" /><text x="45" y="49">7</text>
          </g>
          <path
            class="qft-move"
            d="M113 26 Q140 26 147 39"
            fill="none"
            marker-end="url(#lab-qft-arrow)"
          />
        </svg>
      </div>
      <figcaption>
        <strong>QFT</strong> records where a prop begins and where it arrives.
      </figcaption>
    </figure>

    <figure class="specimen">
      <div class="artifact vtg-artifact">
        <div
          class="vtg-grid"
          role="img"
          aria-label="A two by two grid with split and together timing against same and opposite direction"
        >
          <span class="vtg-corner"></span>
          <span class="vtg-heading">Same</span>
          <span class="vtg-heading">Opp</span>
          <span class="vtg-heading">Split</span>
          <strong class="vtg-cell selected">SS</strong>
          <span class="vtg-cell">SO</span>
          <span class="vtg-heading">Tog</span>
          <span class="vtg-cell">TS</span>
          <span class="vtg-cell">TO</span>
        </div>
      </div>
      <figcaption>
        <strong>VTG</strong> classifies the relationship between timing and direction.
      </figcaption>
    </figure>

    <figure class="specimen">
      <div class="artifact pictograph-artifact">
        <PictographContainer
          pictographData={pictograph}
          darkMode={true}
          showGrid={true}
          showTKA={true}
          stepNumberOverride={false}
        />
      </div>
      <figcaption>
        <strong>TKA</strong> draws the complete beat as a readable pictograph.
      </figcaption>
    </figure>
  </div>
</div>

<style>
  .rosetta-shell {
    container: rosetta / inline-size;
  }

  .rosetta {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(1.25rem, 2.4cqi, 2.8rem);
  }

  .specimen {
    min-width: 0;
    margin: 0;
  }

  .artifact {
    display: grid;
    aspect-ratio: 1;
    place-items: center;
    overflow: hidden;
    padding: clamp(0.8rem, 2.4cqi, 1.8rem);
    color: #b59cff;
    background: var(--theme-card-bg, rgba(18, 18, 34, 0.72));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 1rem);
  }

  .artifact svg {
    width: 100%;
    height: 100%;
  }

  .qft-ring {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    opacity: 0.42;
  }

  .qft-points circle {
    fill: #17172d;
    stroke: currentColor;
    stroke-width: 1.5;
  }

  .qft-points text {
    fill: var(--theme-text, #f4f1ff);
    font-family: "Inter", system-ui, sans-serif;
    font-size: 13px;
    font-weight: 650;
    text-anchor: middle;
  }

  .qft-move {
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
  }

  .vtg-grid {
    display: grid;
    grid-template-columns: 3.2rem repeat(2, minmax(4.2rem, 1fr));
    gap: 0.5rem;
    width: min(100%, 18rem);
  }

  .vtg-heading,
  .vtg-cell {
    display: grid;
    min-width: 0;
    place-items: center;
    color: var(--theme-text-dim, #9691aa);
    font-family: "Inter", system-ui, sans-serif;
  }

  .vtg-heading {
    min-height: 2.5rem;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 650;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .vtg-cell {
    aspect-ratio: 1;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 680;
    background: var(--theme-panel-bg, rgba(9, 11, 24, 0.72));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 0.65rem);
  }

  .vtg-cell.selected {
    color: var(--theme-text, #f4f1ff);
    background: color-mix(in oklch, #a855f7 28%, #15152a);
    border-color: color-mix(in oklch, #a855f7 60%, transparent);
  }

  .pictograph-artifact {
    padding: clamp(0.35rem, 1cqi, 0.85rem);
  }

  figcaption {
    margin-top: 0.8rem;
    color: var(--theme-text-dim, #aaa5bc);
    font-family: "Inter", system-ui, sans-serif;
    font-size: clamp(
      var(--font-size-compact, 0.75rem),
      0.71rem + 0.16cqi,
      1rem
    );
    line-height: 1.55;
  }

  figcaption strong {
    color: var(--theme-text, #f4f1ff);
    font-weight: 680;
  }

  @container rosetta (min-width: 52rem) {
    .rosetta {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
