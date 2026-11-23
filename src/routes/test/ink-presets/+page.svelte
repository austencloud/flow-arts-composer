<script lang="ts">
  import InkPresetPreview from "./InkPresetPreview.svelte";
  import InkProductionPreview from "./InkProductionPreview.svelte";
  import { INK_PRESET_CANDIDATES } from "./ink-preset-candidates";

  let selectedId = $state(INK_PRESET_CANDIDATES[0]?.id ?? "04");
  const selectedCandidate = $derived(
    INK_PRESET_CANDIDATES.find((candidate) => candidate.id === selectedId) ??
      INK_PRESET_CANDIDATES[0]!
  );
</script>

<svelte:head>
  <title>2D Ink Preset Review</title>
</svelte:head>

<main class="review-page mkt-shell">
  <header class="review-header">
    <div>
      <p class="eyebrow">2D INK REVIEW · 6 CANDIDATES</p>
      <h1>Pick the new default</h1>
    </div>
    <p class="intro">
      The same production motion runs while the ink changes. Everything stays on
      this screen.
    </p>
  </header>

  <section class="workbench" aria-label="Production ink comparison">
    <div class="live-stage">
      <InkProductionPreview
        intent={selectedCandidate.intent}
        candidateName={selectedCandidate.name}
      />
    </div>

    <aside
      class="preset-rail"
      style:--active-accent={selectedCandidate.accent}
      aria-label="Ink candidates 04 through 09"
    >
      <header class="active-preset" aria-live="polite">
        <div class="active-title">
          <span class="active-number">{selectedCandidate.id}</span>
          <span>
            <small>ON STAGE</small>
            <strong>{selectedCandidate.name}</strong>
            <span class="active-palette">
              {selectedCandidate.intent.palette}
            </span>
          </span>
        </div>

        <p class="active-description">{selectedCandidate.description}</p>

        <dl class="active-settings">
          <div>
            <dt>Load</dt>
            <dd>{Math.round(selectedCandidate.intent.intensity * 100)}%</dd>
          </div>
          <div>
            <dt>Break</dt>
            <dd>{Math.round(selectedCandidate.intent.viscosity * 100)}%</dd>
          </div>
          <div>
            <dt>Spray</dt>
            <dd>
              {Math.round(selectedCandidate.intent.splatterIntensity * 100)}%
            </dd>
          </div>
        </dl>
      </header>

      <div class="candidate-list">
        {#each INK_PRESET_CANDIDATES as candidate, ordinal (candidate.id)}
          <button
            class:selected={selectedId === candidate.id}
            class="candidate-card"
            style:--candidate-accent={candidate.accent}
            type="button"
            aria-pressed={selectedId === candidate.id}
            aria-label="Show {candidate.id}, {candidate.name}, on the production stage"
            onclick={() => (selectedId = candidate.id)}
          >
            <span class="candidate-preview">
              <InkPresetPreview
                intent={candidate.intent}
                accent={candidate.accent}
                {ordinal}
              />
              <span class="candidate-number">{candidate.id}</span>
            </span>

            <span class="candidate-copy">
              <span class="candidate-title">
                <strong>{candidate.name}</strong>
                <span>{candidate.intent.palette}</span>
              </span>
              <span class="candidate-settings">
                <span>{Math.round(candidate.intent.intensity * 100)} load</span>
                <span>{Math.round(candidate.intent.viscosity * 100)} break</span
                >
                <span>
                  {Math.round(candidate.intent.splatterIntensity * 100)} spray
                </span>
              </span>
            </span>
          </button>
        {/each}
      </div>
    </aside>
  </section>
</main>

<style>
  .review-page {
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: clamp(0.75rem, 1.5vh, 1.25rem);
    width: 100%;
    height: 100dvh;
    padding: clamp(1rem, 2vw, 2rem);
    overflow: hidden;
    background:
      radial-gradient(
        circle at 62% -30%,
        color-mix(in srgb, var(--theme-accent, #40b8e8) 13%, transparent),
        transparent 48%
      ),
      var(--theme-panel-bg, #05070c);
    color: var(--theme-text, #f3f6fa);
    font-family: var(
      --font-family-primary,
      ui-sans-serif,
      system-ui,
      sans-serif
    );
  }

  .review-header,
  .workbench {
    width: 100%;
    max-width: var(--shell-w, min(1720px, 92vw));
    margin-inline: auto;
  }

  .review-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: clamp(1rem, 3vw, 3rem);
  }

  .eyebrow {
    margin: 0 0 0.3rem;
    color: var(--theme-accent, #5fd0ff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.14em;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.9rem, 3.2vw, 3.4rem);
    line-height: 0.98;
    letter-spacing: -0.04em;
  }

  .intro {
    max-width: 38rem;
    margin: 0 0 0.15rem;
    color: color-mix(in srgb, var(--theme-text, #f3f6fa) 68%, transparent);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
    text-align: right;
  }

  .workbench {
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(20rem, 23vw, 27rem);
    gap: clamp(0.75rem, 1.5vw, 1.4rem);
    min-height: 0;
  }

  .live-stage {
    min-width: 0;
    min-height: 0;
  }

  .preset-rail {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 16px);
    background: var(--theme-panel-bg, #080a0f);
    box-shadow: 0 1.25rem 3rem rgba(0, 0, 0, 0.28);
  }

  .active-preset {
    display: grid;
    gap: 0.7rem;
    padding: 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--active-accent) 7%,
      var(--theme-card-bg, #0b0e14)
    );
  }

  .active-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .active-number {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    flex: 0 0 auto;
    border-radius: 0.7rem;
    background: var(--active-accent);
    color: #05070c;
    font-size: 1.1rem;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .active-title > span:last-child {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 0.1rem 0.65rem;
    min-width: 0;
    flex: 1;
  }

  .active-title small {
    grid-column: 1 / -1;
    color: var(--active-accent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.1em;
  }

  .active-title strong {
    min-width: 0;
    overflow: hidden;
    font-size: 1.15rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .active-palette {
    color: var(--active-accent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .active-description {
    min-height: 2.8em;
    margin: 0;
    color: color-mix(in srgb, var(--theme-text, #f3f6fa) 66%, transparent);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
  }

  .active-settings {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
    margin: 0;
  }

  .active-settings div {
    min-width: 0;
    padding: 0.55rem 0.6rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.09));
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--theme-card-bg, #10141d) 88%, white 3%);
  }

  .active-settings dt {
    color: color-mix(in srgb, var(--theme-text, #f3f6fa) 54%, transparent);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .active-settings dd {
    margin: 0.1rem 0 0;
    font-size: 0.95rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .candidate-list {
    display: grid;
    grid-template-rows: repeat(6, minmax(0, 1fr));
    gap: 0.5rem;
    min-height: 0;
    padding: 0.6rem;
  }

  .candidate-card {
    position: relative;
    display: grid;
    grid-template-columns: clamp(5.5rem, 7vw, 7rem) minmax(0, 1fr);
    min-width: 0;
    min-height: 2.75rem;
    padding: 0;
    overflow: hidden;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.7rem;
    background: var(--theme-card-bg, #0b0e14);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 150ms ease,
      background 150ms ease,
      transform 150ms ease;
  }

  .candidate-card:hover {
    transform: translateX(-0.15rem);
    border-color: color-mix(in srgb, var(--candidate-accent) 72%, transparent);
  }

  .candidate-card:focus-visible {
    outline: 3px solid var(--candidate-accent);
    outline-offset: 2px;
  }

  .candidate-card.selected {
    border-color: var(--candidate-accent);
    background: color-mix(
      in srgb,
      var(--candidate-accent) 9%,
      var(--theme-card-bg, #0b0e14)
    );
    box-shadow: inset 3px 0 0 var(--candidate-accent);
  }

  .candidate-preview {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #07080d;
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .candidate-number {
    position: absolute;
    z-index: 1;
    top: 0.35rem;
    left: 0.45rem;
    color: #fff;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 2px 8px #000;
  }

  .candidate-copy {
    display: grid;
    align-content: center;
    gap: 0.4rem;
    min-width: 0;
    padding: 0.5rem 0.65rem;
  }

  .candidate-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
  }

  .candidate-title strong {
    min-width: 0;
    overflow: hidden;
    font-size: var(--font-size-min, 0.875rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .candidate-title > span {
    flex: 0 0 auto;
    color: var(--candidate-accent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    text-transform: uppercase;
  }

  .candidate-settings {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    min-width: 0;
  }

  .candidate-settings span {
    color: color-mix(in srgb, var(--theme-text, #f3f6fa) 58%, transparent);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .candidate-settings span:not(:last-child)::after {
    margin-left: 0.25rem;
    content: "·";
  }

  @media (max-width: 56.25rem) and (min-height: 32.01rem) {
    .review-page {
      padding: 0.8rem;
    }

    .review-header {
      align-items: start;
    }

    .workbench {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr) auto;
    }

    .preset-rail {
      grid-template-rows: auto auto;
    }

    .active-preset {
      grid-template-columns: minmax(0, 1fr) minmax(13rem, 16rem);
      align-items: center;
      gap: 0.45rem 1rem;
      padding: 0.7rem;
    }

    .active-description {
      min-height: 0;
      margin-left: 3.75rem;
    }

    .active-settings {
      grid-column: 2;
      grid-row: 1 / span 2;
    }

    .candidate-list {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: repeat(2, 5.25rem);
      gap: 0.45rem;
      padding: 0.5rem;
    }

    .candidate-card {
      grid-template-columns: 4.8rem minmax(0, 1fr);
    }

    .candidate-settings {
      display: none;
    }

    .candidate-title {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.15rem;
    }
  }

  @media (max-width: 32rem) {
    .review-page {
      gap: 0.6rem;
      padding: 0.7rem;
    }

    .review-header {
      display: block;
    }

    .eyebrow {
      margin-bottom: 0.2rem;
    }

    h1 {
      font-size: 1.8rem;
    }

    .intro {
      margin-top: 0.35rem;
      max-width: none;
      line-height: 1.35;
      text-align: left;
    }

    .active-preset {
      display: block;
      padding: 0.5rem;
    }

    .active-number {
      width: 2.5rem;
      height: 2.5rem;
    }

    .active-title strong {
      font-size: var(--font-size-min, 0.875rem);
    }

    .active-description,
    .active-settings {
      display: none;
    }

    .candidate-list {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: repeat(2, 4.2rem);
      gap: 0.35rem;
      padding: 0.4rem;
    }

    .candidate-card {
      display: block;
    }

    .candidate-preview {
      position: absolute;
      inset: 0;
      display: block;
      border-right: 0;
      opacity: 0.66;
    }

    .candidate-card.selected .candidate-preview {
      opacity: 0.88;
    }

    .candidate-number {
      top: 0.25rem;
      left: 0.35rem;
    }

    .candidate-copy {
      position: relative;
      z-index: 2;
      align-content: end;
      height: 100%;
      padding: 0.4rem;
      background: linear-gradient(transparent 25%, rgba(0, 0, 0, 0.9));
    }

    .candidate-title {
      display: block;
    }

    .candidate-title strong {
      display: block;
      padding-top: 1rem;
      overflow: visible;
      line-height: 1.1;
      text-overflow: clip;
      white-space: normal;
    }

    .candidate-title > span,
    .candidate-settings {
      display: none;
    }
  }

  @media (max-height: 32rem) and (min-width: 44rem) {
    .review-page {
      gap: 0.55rem;
      padding: 0.55rem;
    }

    .review-header {
      align-items: center;
    }

    .eyebrow {
      margin: 0 0 0.15rem;
    }

    h1 {
      font-size: 1.55rem;
    }

    .intro {
      max-width: 24rem;
      line-height: 1.3;
    }

    .workbench {
      grid-template-columns: minmax(0, 1.45fr) minmax(22rem, 0.9fr);
      gap: 0.55rem;
    }

    .active-preset {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.5rem;
      padding: 0.45rem;
    }

    .active-number {
      width: 2.4rem;
      height: 2.4rem;
    }

    .active-title strong {
      font-size: var(--font-size-min, 0.875rem);
    }

    .active-description {
      display: none;
    }

    .active-settings {
      width: 11rem;
    }

    .active-settings div {
      padding: 0.25rem 0.35rem;
    }

    .active-settings dt {
      display: none;
    }

    .candidate-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(3, minmax(0, 1fr));
      gap: 0.35rem;
      padding: 0.4rem;
    }

    .candidate-card {
      display: block;
    }

    .candidate-preview {
      position: absolute;
      inset: 0;
      display: block;
      border-right: 0;
      opacity: 0.7;
    }

    .candidate-copy {
      position: relative;
      z-index: 2;
      align-content: end;
      height: 100%;
      padding: 0.35rem 0.45rem;
      background: linear-gradient(transparent 20%, rgba(0, 0, 0, 0.9));
    }

    .candidate-title > span,
    .candidate-settings {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .candidate-card {
      transition: none;
    }

    .candidate-card:hover {
      transform: none;
    }
  }
  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .review-page {
    border-top: var(--safe-top) solid transparent;
  }
</style>
