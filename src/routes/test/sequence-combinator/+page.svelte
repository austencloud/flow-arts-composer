<!--
  Sequence Combinator Lab — /test/sequence-combinator

  Drives the combination engine end to end: load two cards, set the liberties,
  and read what the engine can honestly say about them.

  The report banner is the part worth being careful about. `impossible` is a
  structural proof, but it is CAP-RELATIVE — it holds under the liberties that
  were on and bridges no longer than `ambientRunCap`. So the banner never says a
  bare "impossible"; it says how far it looked. "None found within length L" is
  a different, weaker sentence and gets a different treatment.

  The library picker is deliberately inert here. Wiring BrowsePanel needs auth
  and engine context that belongs in the verification pass, and a button that
  half-works is worse than one that says what it is waiting for.
-->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  import ResultStrip from "./ResultStrip.svelte";
  import SimilarityPanel from "./SimilarityPanel.svelte";
  import {
    createCombinatorLabState,
    DEFAULT_MAX_WORD_LENGTH,
    FIXTURE_NAMES,
    type DepthPreset,
    type SlotId,
  } from "./lab-state.svelte";

  const lab = createCombinatorLabState();

  /** How many preview words to draw before collapsing the tail into a count. */
  const PREVIEW_CHIP_LIMIT = 60;

  const DEPTH_OPTIONS: {
    value: DepthPreset;
    label: string;
    ariaLabel: string;
  }[] = [
    {
      value: "default",
      label: "Default",
      ariaLabel: "Default depth — 4096 walks, 200k nodes",
    },
    {
      value: "deep",
      label: "Deep",
      ariaLabel: "Deep — 16384 walks, 2M nodes, around 700ms",
    },
  ];

  const LENGTH_OPTIONS = ["8", "16", "32"].map((value) => ({
    value,
    label: value,
  }));
  const BLOCK_OPTIONS = ["1", "2", "4"].map((value) => ({
    value,
    label: value,
  }));
  // The number the impossibility banner quotes, so it belongs on the rail: a
  // proof at cap 0 and a proof at cap 4 are different claims.
  const AMBIENT_RUN_OPTIONS = ["0", "1", "2", "4"].map((value) => ({
    value,
    label: value,
  }));
  const RESULT_COUNT_OPTIONS = ["12", "24", "48"].map((value) => ({
    value,
    label: value,
  }));

  const results = $derived(lab.report?.results ?? []);

  const previewWords = $derived(lab.preview?.words ?? []);
  const previewShown = $derived(previewWords.slice(0, PREVIEW_CHIP_LIMIT));

  const previewCompleteness = $derived.by(() => {
    const preview = lab.preview;
    if (!preview) return "";
    if (preview.searchComplete) {
      return `Complete: every hybrid word of ${DEFAULT_MAX_WORD_LENGTH} letters or fewer that draws on both cards.`;
    }
    if (preview.resultsTruncated) {
      return "Truncated — the result cap fired before the space was swept. More words exist.";
    }
    if (preview.budgetExhausted) {
      return "Budget exhausted — the node cap fired. This list is a sample, not the set.";
    }
    return "Partial — the sweep stopped early.";
  });

  /**
   * The one sentence the report is allowed to lead with.
   *
   * Impossibility is CAP-RELATIVE and the sentence has to carry the cap, so a
   * run at `ambientRunCap: 0` gets its own wording — "no bridges considered" is
   * a materially weaker claim than "bridges up to 2 steps considered", and
   * collapsing them into "bridges up to 0 steps" reads as thoroughness it did
   * not have.
   */
  const headline = $derived.by(() => {
    const report = lab.report;
    if (!report) return null;

    if (report.gridModeMismatch) {
      return {
        tone: "impossible" as const,
        text: "Provably impossible — the two cards are in different grid modes, and no transform or bridge crosses that.",
      };
    }

    if (report.impossible) {
      const scope =
        report.ambientRunCap === 0
          ? "no bridges considered — bridge material could still change this"
          : `bridges up to ${report.ambientRunCap} ${
              report.ambientRunCap === 1 ? "step" : "steps"
            } considered`;
      return {
        tone: "impossible" as const,
        text: `Provably impossible (${scope}). No card-B seam is reachable from any card-A seam under these liberties.`,
      };
    }

    if (report.results.length === 0) {
      return {
        tone: "empty" as const,
        text: `None found within length ${report.searchedToLength}. Nothing is claimed beyond that — a longer walk, another liberty, or a longer bridge could still exist.`,
      };
    }

    // The count is a page size, not a census, whenever a cap fired. Say so in
    // the same breath rather than leaving it to a pill further down.
    const qualifier = report.resultsTruncated
      ? " — more exist beyond the cap"
      : report.budgetExhausted
        ? " — the node budget ran out, so more may exist"
        : "";
    return {
      tone: "found" as const,
      text: `${report.results.length} ${
        report.results.length === 1 ? "combination" : "combinations"
      }, fully explored to length ${report.searchedToLength}${qualifier}.`,
    };
  });

  function loadJsonInto(slot: SlotId) {
    const view = slot === "A" ? lab.slotA : lab.slotB;
    lab.loadJson(slot, view.jsonText);
  }
</script>

<svelte:head><title>Sequence Combinator Lab</title></svelte:head>

<div class="page">
  <header class="masthead">
    <h1>Sequence Combinator Lab</h1>
    <p class="sub">
      Two cards in, every closed alternating walk out — or a structural proof
      there is none.
    </p>
  </header>

  <section class="slots" aria-label="Input cards">
    {#each [{ id: "A" as SlotId, view: lab.slotA }, { id: "B" as SlotId, view: lab.slotB }] as slot (slot.id)}
      <div class="slot">
        <div class="slot-head">
          <h2>Card {slot.id}</h2>
          {#if slot.view.card}
            <span class="slot-word">{slot.view.displayWord}</span>
            <span class="slot-meta"
              >{slot.view.card.steps.length} steps · {slot.view.card.gridMode ??
                "diamond"}</span
            >
          {:else}
            <span class="slot-meta">empty</span>
          {/if}
          <span class="spacer"></span>
          <button
            type="button"
            class="btn ghost"
            disabled={!slot.view.card}
            onclick={() => lab.clearSlot(slot.id)}>Clear</button
          >
        </div>

        <div class="preset-row">
          {#each FIXTURE_NAMES as name (name)}
            <button
              type="button"
              class="btn preset"
              class:selected={slot.view.fixtureName === name}
              aria-pressed={slot.view.fixtureName === name}
              onclick={() => lab.loadFixture(slot.id, name)}>{name}</button
            >
          {/each}
          <button
            type="button"
            class="btn preset"
            disabled
            title="library picker lands with the next pass">From library</button
          >
        </div>

        <label class="json-label" for="json-{slot.id}"
          >Paste sequence JSON</label
        >
        <textarea
          id="json-{slot.id}"
          class="json"
          rows="4"
          spellcheck="false"
          placeholder={'{ "word": "GGGG", "steps": [ … ] }'}
          bind:value={slot.view.jsonText}
        ></textarea>
        <div class="json-actions">
          <button
            type="button"
            class="btn"
            onclick={() => loadJsonInto(slot.id)}>Load JSON</button
          >
          {#if slot.view.error}
            <span class="slot-error">{slot.view.error}</span>
          {/if}
        </div>

        <div class="mini-strip" aria-label="Card {slot.id} steps">
          {#if slot.view.card}
            <!-- Keyed on POSITION as well as id: pasted JSON is caller data and
                 a duplicated step would otherwise collide two keys. -->
            {#each slot.view.card.steps as step, i (`${step.id ?? "s"}-${i}`)}
              <div class="mini">
                <PictographContainer pictographData={step} />
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/each}
  </section>

  <!-- Between the slots and the rail on purpose: "are these two cards too
       alike to be worth combining" is a question about the INPUTS, and it is
       cheap enough to answer before anyone touches the liberties or spends
       700ms on a search. -->
  {#if lab.bothLoaded}
    <SimilarityPanel
      report={lab.similarityReport}
      error={lab.similarityError}
      note={lab.similarityNote}
      weights={lab.similarityWeights}
      onWeightChange={(key, value) => (lab.similarityWeights[key] = value)}
      onReset={() => lab.resetSimilarityWeights()}
    />
  {/if}

  <section class="rail" aria-label="Search options">
    <div class="rail-group">
      <span class="rail-label" id="depth-label">Depth</span>
      <SegmentedControl
        options={DEPTH_OPTIONS}
        value={lab.depth}
        onchange={(value) => (lab.depth = value)}
        size="sm"
        ariaLabelledby="depth-label"
      />
    </div>

    <div class="rail-group">
      <span class="rail-label" id="length-label">Max length</span>
      <SegmentedControl
        options={LENGTH_OPTIONS}
        value={String(lab.maxResultLength)}
        onchange={(value) => (lab.maxResultLength = Number(value))}
        size="sm"
        ariaLabelledby="length-label"
      />
    </div>

    <div class="rail-group">
      <span class="rail-label" id="block-label">Min block</span>
      <SegmentedControl
        options={BLOCK_OPTIONS}
        value={String(lab.minBlockSize)}
        onchange={(value) => (lab.minBlockSize = Number(value))}
        size="sm"
        ariaLabelledby="block-label"
      />
    </div>

    <div class="rail-group">
      <span class="rail-label" id="bridge-label">Bridge run</span>
      <SegmentedControl
        options={AMBIENT_RUN_OPTIONS}
        value={String(lab.maxAmbientRun)}
        onchange={(value) => (lab.maxAmbientRun = Number(value))}
        size="sm"
        ariaLabelledby="bridge-label"
      />
    </div>

    <div class="rail-group">
      <span class="rail-label" id="results-label">Results</span>
      <SegmentedControl
        options={RESULT_COUNT_OPTIONS}
        value={String(lab.maxResults)}
        onchange={(value) => (lab.maxResults = Number(value))}
        size="sm"
        ariaLabelledby="results-label"
      />
    </div>

    <div class="rail-group grow">
      <span class="rail-label">Liberties</span>
      <div class="chips">
        <FilterChipBase
          label="Mirror"
          mode="toggle"
          size="sm"
          active={lab.allowMirror}
          onclick={() => (lab.allowMirror = !lab.allowMirror)}
        />
        <FilterChipBase
          label="Rotation"
          mode="toggle"
          size="sm"
          active={lab.allowRotation}
          onclick={() => (lab.allowRotation = !lab.allowRotation)}
        />
        <FilterChipBase
          label="Color swap"
          mode="toggle"
          size="sm"
          active={lab.allowHandSwap}
          onclick={() => (lab.allowHandSwap = !lab.allowHandSwap)}
        />
        <FilterChipBase
          label="Rotation-faithful twin"
          mode="toggle"
          size="sm"
          active={lab.exploreRotationFaithful}
          onclick={() =>
            (lab.exploreRotationFaithful = !lab.exploreRotationFaithful)}
        />
        <FilterChipBase
          label="Ambient bridges"
          mode="toggle"
          size="sm"
          active={lab.allowAmbient}
          onclick={() => (lab.allowAmbient = !lab.allowAmbient)}
        />
        <FilterChipBase
          label="Whole units only"
          mode="toggle"
          size="sm"
          active={lab.wholeUnitsOnly}
          onclick={() => (lab.wholeUnitsOnly = !lab.wholeUnitsOnly)}
        />
      </div>
    </div>

    <button
      type="button"
      class="btn"
      disabled={!lab.bothLoaded || lab.running}
      title="Card A is the frame the result is expressed in, so the order matters"
      onclick={() => lab.swapSlots()}>Swap A ⇄ B</button
    >

    <button
      type="button"
      class="btn primary combine"
      disabled={!lab.bothLoaded || lab.running}
      onclick={() => lab.run()}
    >
      {lab.running ? "Searching…" : "Combine"}
    </button>
  </section>

  {#if lab.runError}
    <p class="banner error">The search threw: {lab.runError}</p>
  {/if}

  {#if lab.report && headline}
    <section class="report" aria-label="Search report">
      <p class="banner {headline.tone}">{headline.text}</p>

      <div class="flags">
        <span class="flag">{lab.elapsedMs} ms</span>
        {#if lab.report.resultsTruncated}
          <span class="flag warn"
            >Truncated — the raw-walk cap fired. More combinations exist than
            were collected.</span
          >
        {/if}
        {#if lab.report.budgetExhausted}
          <span class="flag warn"
            >Budget exhausted — the node budget ran out mid-sweep.</span
          >
        {/if}
        {#if lab.report.searchComplete}
          <span class="flag ok">Bounded space swept completely.</span>
        {/if}
        {#if lab.report.poolIncomplete}
          <span class="flag warn"
            >Bridge pool incomplete — a provider failed, so absence proves
            nothing here.</span
          >
        {/if}
        {#if lab.report.ambientUnavailable}
          <span class="flag warn"
            >Bridge vocabulary unavailable this session — the pictograph dataset
            did not answer, so the search ran on card material only.</span
          >
        {/if}
      </div>
    </section>
  {/if}

  {#if lab.previewError}
    <p class="banner error">
      Candidate-word preview failed for this pair: {lab.previewError}. The
      search below is unaffected.
    </p>
  {/if}

  {#if lab.preview}
    <section class="preview" aria-label="Layer 0 word preview">
      <h2>
        Candidate words
        <span class="count">{previewWords.length}</span>
      </h2>
      <p class="note">
        Letter calculus over position FAMILIES only — necessary, not sufficient.
        A word here spells a closed walk in the family graph; whether real card
        material realizes it is what the search below settles.
      </p>
      <p class="note">{previewCompleteness}</p>
      <div class="word-chips">
        {#each previewShown as candidate (candidate.word)}
          <span class="word-chip">{candidate.word}</span>
        {/each}
        {#if previewWords.length > previewShown.length}
          <span class="word-chip more"
            >+{previewWords.length - previewShown.length} more</span
          >
        {/if}
      </div>
    </section>
  {/if}

  {#if results.length > 0}
    <section class="results" aria-label="Combination results">
      {#each results as result, i (`${result.canonicalHash}#${i}`)}
        <ResultStrip {result} rank={i + 1} />
      {/each}
    </section>
  {/if}
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    background: #0f1117;
    color: #e0e0e0;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  /* 4K@100% / TV tier: test routes don't join the marketing shell's root font
   * ramp, so above ~2600px CSS the rem-sized lab renders at 1080p scale in a
   * sea of dark (verified 2026-08-04 at 3840×2160). zoom is the pragmatic
   * whole-surface step for an internal Chrome-first harness — pictograph
   * cells, type, and controls all scale together. Composition (fluid width,
   * zero dead rail) was verified sound before this; only element scale steps. */
  @media (min-width: 2600px) {
    .page {
      zoom: 1.5;
    }
  }

  .masthead h1 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
    color: #fff;
  }
  .sub {
    margin: 0.25rem 0 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.5);
  }

  .slots {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  @media (max-width: 60rem) {
    .slots {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .slot {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
  }

  .slot-head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.25rem;
  }
  .slot-head h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: #fff;
  }
  .slot-word {
    font-size: 1.05rem;
    font-weight: 700;
    color: #a5b4fc;
  }
  .slot-meta {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.45);
    font-variant-numeric: tabular-nums;
  }
  .spacer {
    flex: 1 1 auto;
  }

  .preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .json-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.45);
  }

  .json {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.35);
    color: #e0e0e0;
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
  }

  .json-actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.75rem;
  }
  .slot-error {
    font-size: 0.75rem;
    color: #f87171;
  }

  /* Reserved height: mini cells are 5rem and pictographs prepare async. */
  .mini-strip {
    display: flex;
    gap: 0.3rem;
    height: 5.25rem;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .mini {
    flex: 0 0 auto;
    width: 5rem;
    height: 5rem;
    background: #fff;
    border-radius: 0.3rem;
    overflow: hidden;
  }

  .rail {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 1rem;
    padding: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
  }
  .rail-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .rail-group.grow {
    flex: 1 1 24rem;
  }
  .rail-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.45);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .btn {
    min-height: 2.75rem;
    padding: 0.4rem 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.8);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }
  .btn:hover:not(:disabled) {
    background: rgba(139, 92, 246, 0.16);
    color: #fff;
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn.preset.selected {
    background: rgba(139, 92, 246, 0.24);
    border-color: #8b5cf6;
    color: #fff;
  }
  .btn.ghost {
    background: transparent;
  }
  .btn.primary {
    background: #8b5cf6;
    border-color: #8b5cf6;
    color: #fff;
  }
  .btn.primary:hover:not(:disabled) {
    filter: brightness(1.1);
    background: #8b5cf6;
  }
  .combine {
    min-width: 10rem;
    font-size: 0.9rem;
  }

  .report {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .banner {
    margin: 0;
    padding: 0.75rem 1rem;
    border-radius: 0.6rem;
    font-size: 0.9rem;
    line-height: 1.45;
  }
  .banner.impossible {
    border: 1px solid rgba(248, 113, 113, 0.45);
    background: rgba(248, 113, 113, 0.12);
    color: #fca5a5;
    font-weight: 700;
    font-size: 1rem;
  }
  .banner.empty {
    border: 1px solid rgba(250, 204, 21, 0.3);
    background: rgba(250, 204, 21, 0.08);
    color: #fde68a;
  }
  .banner.found {
    border: 1px solid rgba(52, 211, 153, 0.3);
    background: rgba(52, 211, 153, 0.08);
    color: #6ee7b7;
  }
  .banner.error {
    border: 1px solid rgba(248, 113, 113, 0.45);
    background: rgba(248, 113, 113, 0.12);
    color: #fca5a5;
  }

  .flags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .flag {
    padding: 0.2rem 0.55rem;
    border-radius: 0.7rem;
    background: rgba(255, 255, 255, 0.06);
    font-size: 0.72rem;
    color: rgba(255, 255, 255, 0.55);
    font-variant-numeric: tabular-nums;
  }
  .flag.warn {
    background: rgba(250, 204, 21, 0.14);
    color: #fde68a;
  }
  .flag.ok {
    background: rgba(52, 211, 153, 0.14);
    color: #6ee7b7;
  }

  /* --- layer 0 preview --------------------------------------------------- */

  .preview {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
  }
  .preview h2 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
    font-weight: 700;
    color: #fff;
  }
  .count {
    padding: 0.1rem 0.5rem;
    border-radius: 0.7rem;
    background: rgba(255, 255, 255, 0.08);
    font-size: 0.75rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.45;
    color: rgba(255, 255, 255, 0.45);
  }
  .word-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.3rem;
  }
  .word-chip {
    padding: 0.2rem 0.55rem;
    border-radius: 0.7rem;
    background: rgba(96, 165, 250, 0.14);
    color: #bfdbfe;
    font-size: 0.78rem;
    font-weight: 600;
  }
  .word-chip.more {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.5);
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
</style>
