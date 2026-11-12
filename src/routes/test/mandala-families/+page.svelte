<script lang="ts">
  // A brainstorming page on real data: the community pool's mandalas grouped
  // into families, ordered simple to complex by a choice of measures, with
  // three ways to move through them. Nothing here is the shipping screen.
  // window.__mandalaFamilies exposes the families for a browser check.
  import { onMount, untrack } from "svelte";
  import { flip } from "svelte/animate";
  import {
    arrive,
    flipDuration,
    flyFade,
    leave,
  } from "#lib/shared/transitions/motion.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import MandalaStill from "#lib/shared/mandala/components/MandalaStill.svelte";
  import { createBrowseEngine } from "#lib/shared/browse/engine/create-browse-engine.svelte.js";
  import { loadCanonicalTnDSequences } from "#lib/features/browse/gallery-home/canonical-tnd-pool.js";
  import {
    mandalaIndex,
    type MandalaGroup,
  } from "#lib/shared/browse/services/mandala-index.svelte.js";
  import { buildFamilyTreeInSlices } from "#lib/shared/mandala/services/mandala-family.js";
  import {
    familiesAt,
    type FamilyTree,
    type MandalaFamily,
  } from "#lib/shared/mandala/services/mandala-family-distance.js";
  import {
    blendRanks,
    mandalaShapeMeasures,
    type MandalaShapeMeasures,
  } from "#lib/shared/mandala/services/mandala-complexity.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";

  type Family = MandalaFamily<MandalaGroup>;
  type OrderId = "ink" | "spaces" | "crossings" | "line" | "blend";
  type BrowseId = "slider" | "steps" | "all";
  type ColourId = "ink" | "hands";

  /** The loose end of the "how alike" slider, as a share of the gap between lines. */
  const ALIKE_MAX = 0.95;
  const ALIKE_STEP = 0.01;
  const ALIKE_DEFAULT = 0.35;

  /** A fitted box stays at least this wide; the frame shows no more than this many. */
  const MIN_BOX_PX = 132;
  const MAX_FITTED = 24;
  const BOX_GAP_PX = 10;
  /** All's smallest box, and the room kept for its scroll bar. */
  const ALL_MIN_BOX_PX = 112;
  const ALL_SCROLLBAR_PX = 14;
  /** The width stills are drawn for, so resizing does not redraw every string. */
  const STILL_SIZES = [128, 160, 200, 256, 320];

  const STEP_LABELS = ["Simplest", "Simple", "Middle", "Complex", "Most complex"];
  const STEP_SHORT = ["Simplest", "Simple", "Middle", "Complex", "Most"];

  const engine = createBrowseEngine({
    persistKey: null,
    initialSource: "community",
    sources: ["community"],
    extraCommunitySequences: loadCanonicalTnDSequences,
  });

  let alike = $state(ALIKE_DEFAULT);
  let order = $state<OrderId>("blend");
  let browse = $state<BrowseId>("slider");
  let colour = $state<ColourId>("ink");
  /** Where the slider's window sits, 0 to 1, so it survives the list changing size. */
  let position = $state(0);
  let stepIndex = $state(0);
  let stepPage = $state(0);
  let openId = $state<string | null>(null);

  let tree = $state.raw<FamilyTree<MandalaGroup> | null>(null);
  let measures = $state.raw<ReadonlyMap<string, MandalaShapeMeasures & { blend: number }>>(new Map());
  let building = $state(false);
  let buildShare = $state(0);
  let buildMs = $state(0);
  let builtFrom = "";
  let abortBuild: AbortController | null = null;

  let frameWidth = $state(0);
  let contentWidth = $state(0);
  let contentHeight = $state(0);
  let opener: HTMLElement | null = null;

  const compact = $derived(frameWidth > 0 && (frameWidth < 620 || frameWidth >= 900));

  const orderOptions = $derived<{ value: OrderId; label: string; ariaLabel: string; shortLabel?: string }[]>(
    (
      [
        ["ink", "Ink", "Ink"],
        ["spaces", "Enclosed spaces", "Spaces"],
        ["crossings", "Crossings", frameWidth < 400 ? "Crosses" : "Crossings"],
        ["line", "Line length", "Length"],
        ["blend", "Blend", "Blend"],
      ] as const
    ).map(([value, label, short]) => ({
      value,
      label,
      ariaLabel: label,
      ...(compact ? { shortLabel: short } : {}),
    }))
  );
  const browseOptions: { value: BrowseId; label: string }[] = [
    { value: "slider", label: "Slider" },
    { value: "steps", label: "Steps" },
    { value: "all", label: "All" },
  ];
  const colourOptions: { value: ColourId; label: string }[] = [
    { value: "ink", label: "One colour" },
    { value: "hands", label: "Hands" },
  ];
  const stepOptions = $derived(
    STEP_LABELS.map((label, i) => ({
      value: String(i),
      label,
      ariaLabel: label,
      // The short rail shares its row with the pager, so it needs the short word too.
      ...(frameWidth > 0 && (frameWidth < 520 || contentWidth < 620) ? { shortLabel: STEP_SHORT[i]! } : {}),
    }))
  );

  const families = $derived(tree ? familiesAt(tree, alike) : []);
  const loneFamilies = $derived(families.filter((f) => f.sequenceCount === 1).length);

  function measureOf(family: Family, id: OrderId): number {
    return measures.get(family.representative.key)?.[id] ?? 0;
  }

  const ordered = $derived.by(() => {
    const id = order;
    return [...families].sort(
      (a, b) => measureOf(a, id) - measureOf(b, id) || a.id.localeCompare(b.id)
    );
  });

  /** The largest grid of boxes the area holds, up to the most the frame shows. */
  const fit = $derived.by(() => {
    let best = { cols: 1, rows: 1, box: Math.max(0, Math.min(contentWidth, contentHeight)) };
    for (let cols = 1; cols <= MAX_FITTED; cols++) {
      const wide = (contentWidth - (cols - 1) * BOX_GAP_PX) / cols;
      if (wide < MIN_BOX_PX) break;
      for (let rows = 1; rows * cols <= MAX_FITTED; rows++) {
        const tall = (contentHeight - (rows - 1) * BOX_GAP_PX) / rows;
        if (tall < MIN_BOX_PX) break;
        const box = Math.floor(Math.min(wide, tall));
        const count = cols * rows;
        const held = best.cols * best.rows;
        if (count > held || (count === held && box > best.box)) best = { cols, rows, box };
      }
    }
    return best;
  });
  const perPage = $derived(fit.cols * fit.rows);

  /** All pans, so only the width decides: as many columns as hold a readable box. */
  const allFit = $derived.by(() => {
    const width = Math.max(0, contentWidth - ALL_SCROLLBAR_PX);
    const cols = Math.max(1, Math.floor((width + BOX_GAP_PX) / (ALL_MIN_BOX_PX + BOX_GAP_PX)));
    return { cols, box: Math.floor((width - (cols - 1) * BOX_GAP_PX) / cols) };
  });
  const gridFit = $derived(browse === "all" ? allFit : fit);

  const windowMax = $derived(Math.max(0, ordered.length - perPage));
  const windowStart = $derived(Math.round(position * windowMax));

  const stepShare = $derived(
    ordered.slice(
      Math.floor((stepIndex * ordered.length) / 5),
      Math.floor(((stepIndex + 1) * ordered.length) / 5)
    )
  );
  const stepPages = $derived(Math.max(1, Math.ceil(stepShare.length / perPage)));
  const stepPageShown = $derived(Math.min(stepPage, stepPages - 1));

  const visible = $derived.by<readonly Family[]>(() => {
    if (browse === "all") return ordered;
    if (browse === "slider") return ordered.slice(windowStart, windowStart + perPage);
    return stepShare.slice(stepPageShown * perPage, (stepPageShown + 1) * perPage);
  });

  const stillSize = $derived(
    STILL_SIZES.find((size) => size >= gridFit.box) ?? STILL_SIZES[STILL_SIZES.length - 1]!
  );

  const openFamily = $derived(openId ? (families.find((f) => f.id === openId) ?? null) : null);

  const status = $derived.by(() => {
    if (engine.error) return `Could not load the pool: ${engine.error}`;
    if (!tree && !mandalaIndex.done) {
      const { measured, total } = mandalaIndex.progress;
      return total > 0 ? `Measuring mandalas: ${measured} of ${total}` : "Loading the pool";
    }
    if (!tree) return `Grouping shapes: ${Math.round(buildShare * 100)}%`;
    return "";
  });

  const countLine = $derived(
    tree
      ? `${families.length} ${families.length === 1 ? "family" : "families"} from ${tree.shapes.length} shapes, ${loneFamilies} with one sequence`
      : "Still grouping"
  );

  function plural(count: number, one: string): string {
    return `${count} ${one}${count === 1 ? "" : "s"}`;
  }

  function exampleWord(group: MandalaGroup): string {
    const sequence = group.sequences[0];
    return sequence ? simplifyRepeatedWord(sequence.displayName ?? sequence.word ?? "") : "";
  }

  function openPanel(family: Family, event: MouseEvent): void {
    opener = event.currentTarget as HTMLElement;
    openId = family.id;
  }

  function closePanel(): void {
    openId = null;
    opener?.focus();
    opener = null;
  }

  function focusOnMount(node: HTMLElement): void {
    node.focus({ preventScroll: true });
  }

  function chooseStep(value: string): void {
    stepIndex = Number(value);
    stepPage = 0;
  }

  /** A page's width and height tracked from outside, so the fit reads plain state. */
  function trackSize(node: HTMLElement, onSize: (width: number, height: number) => void) {
    const observer = new ResizeObserver(() => onSize(node.clientWidth, node.clientHeight));
    observer.observe(node);
    onSize(node.clientWidth, node.clientHeight);
    return { destroy: () => observer.disconnect() };
  }

  const nextTurn = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  async function build(shapes: readonly MandalaGroup[]): Promise<void> {
    abortBuild?.abort();
    const controller = new AbortController();
    abortBuild = controller;
    building = true;
    buildShare = 0;
    const started = performance.now();
    try {
      const built = await buildFamilyTreeInSlices(shapes, {
        signal: controller.signal,
        onProgress: (share) => (buildShare = share * 0.8),
      });
      // The measures walk every shape once; each is quick but there are hundreds.
      const raw: MandalaShapeMeasures[] = [];
      let sliceStart = performance.now();
      for (let i = 0; i < shapes.length; i++) {
        raw.push(mandalaShapeMeasures(shapes[i]!.paths));
        if (performance.now() - sliceStart > 12) {
          buildShare = 0.8 + (0.2 * i) / shapes.length;
          await nextTurn();
          controller.signal.throwIfAborted();
          sliceStart = performance.now();
        }
      }
      const ranks = blendRanks(raw);
      measures = new Map(
        shapes.map((shape, i) => [shape.key, { ...raw[i]!, blend: ranks[i]! }])
      );
      tree = built;
      buildMs = performance.now() - started;
      building = false;
    } catch {
      // A newer pool took over; its build owns the state now.
    }
  }

  // The engine's pool arrives in stages: saved copy, then refreshed, then extras.
  $effect(() => {
    if (engine.allSequences.length > 0) mandalaIndex.setPool(engine.allSequences);
  });

  $effect(() => {
    if (!mandalaIndex.done || engine.isLoading) return;
    const shapes = mandalaIndex.groups;
    const from = shapes.map((shape) => `${shape.key}:${shape.sequences.length}`).join("|");
    if (from === builtFrom) return;
    builtFrom = from;
    untrack(() => void build(shapes));
  });

  $effect(() => {
    // The panel closes itself when the slider dissolves the family it showed.
    if (openId && tree && !openFamily) openId = null;
  });

  onMount(() => {
    void engine.initialize();
    const harness = {
      get families() {
        return families;
      },
      get ordered() {
        return ordered;
      },
      get tree() {
        return tree;
      },
      get measures() {
        return measures;
      },
      get buildMs() {
        return buildMs;
      },
      familiesAt: (threshold: number) => (tree ? familiesAt(tree, threshold) : []),
    };
    (window as unknown as { __mandalaFamilies?: typeof harness }).__mandalaFamilies = harness;
    return () => {
      abortBuild?.abort();
      mandalaIndex.stop();
      engine.destroy();
      delete (window as unknown as { __mandalaFamilies?: typeof harness }).__mandalaFamilies;
    };
  });
</script>

<svelte:head><title>Mandala families</title></svelte:head>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && openId) closePanel();
  }}
/>

<div
  class="frame"
  use:trackSize={(width) => (frameWidth = width)}
>
  <header class="head">
    <h1>Mandala families</h1>
    <p class="count-line">{countLine}</p>
  </header>

  <main class="stage">
    <div
      class="content"
      use:trackSize={(width, height) => {
        contentWidth = width;
        contentHeight = height;
      }}
    >
      {#if status}
        <p class="status" role="status">{status}</p>
      {:else}
        <div
          class="boxes"
          class:all={browse === "all"}
          style:--cols={gridFit.cols}
          style:--box="{gridFit.box}px"
          style:--gap="{BOX_GAP_PX}px"
        >
          {#each visible as family, i (family.id)}
            <button
              class="box"
              class:ink={colour === "ink"}
              type="button"
              aria-label="{plural(family.sequenceCount, 'sequence')}, {plural(family.members.length, 'shape')}"
              animate:flip={{ duration: flipDuration() }}
              in:arrive={{ index: i }}
              out:leave
              onclick={(event) => openPanel(family, event)}
            >
              <MandalaStill
                key={family.representative.key}
                paths={family.representative.paths}
                size={stillSize}
                tone={colour === "ink" ? "ink" : "hands"}
              />
              <span class="badge">{family.sequenceCount}</span>
            </button>
          {/each}
        </div>
      {/if}

      {#if openFamily}
        <section
          class="panel"
          aria-label="This family's shapes"
          transition:flyFade
        >
          <header class="panel-head">
            <h2>
              {plural(openFamily.members.length, "shape")},
              {plural(openFamily.sequenceCount, "sequence")}
            </h2>
            <button class="close" type="button" use:focusOnMount onclick={closePanel}>Close</button>
          </header>
          <ul class="members">
            {#each openFamily.members as member (member.key)}
              <li class="member">
                <span class="member-still">
                  <MandalaStill key={member.key} paths={member.paths} size={160} />
                </span>
                <span class="member-word">{exampleWord(member)}</span>
                <span class="member-count">{plural(member.sequences.length, "sequence")}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>

    <div class="browse-slot">
      {#if browse === "slider"}
        <label class="scrub">
          <span class="visually-hidden">Move through the mandalas, simple to complex</span>
          <input
            class="range"
            type="range"
            min="0"
            max={windowMax}
            step="1"
            value={windowStart}
            disabled={windowMax === 0}
            oninput={(event) => {
              position = windowMax > 0 ? Number(event.currentTarget.value) / windowMax : 0;
            }}
          />
          <span class="ends">
            <span>Simple</span>
            <span class="where"
              >{ordered.length ? windowStart + 1 : 0} to {Math.min(windowStart + perPage, ordered.length)} of {ordered.length}</span
            >
            <span>Complex</span>
          </span>
        </label>
      {:else if browse === "steps"}
        <div class="steps">
          <SegmentedControl
            options={stepOptions}
            value={String(stepIndex)}
            onchange={chooseStep}
            semantics="radiogroup"
            size="sm"
            density="compact"
            color="accent"
            ariaLabel="How complex"
          />
          <div class="pager">
            <button
              class="page-button"
              type="button"
              disabled={stepPageShown === 0}
              onclick={() => (stepPage = stepPageShown - 1)}>Back</button
            >
            <span class="where">Page {stepPageShown + 1} of {stepPages}</span>
            <button
              class="page-button"
              type="button"
              disabled={stepPageShown >= stepPages - 1}
              onclick={() => (stepPage = stepPageShown + 1)}>Next</button
            >
          </div>
        </div>
      {:else}
        <p class="all-note">All {ordered.length} families, simple to complex</p>
      {/if}
    </div>
  </main>

  <aside class="controls" aria-label="Controls">
    <div class="control">
      <label class="control-label" for="how-alike">How alike</label>
      <div class="alike">
        <input
          id="how-alike"
          class="range"
          type="range"
          min="0"
          max={ALIKE_MAX}
          step={ALIKE_STEP}
          bind:value={alike}
        />
        <span class="ends"><span>Exact</span><span>Loose</span></span>
      </div>
    </div>
    <div class="control">
      <span class="control-label" id="order-label">Order</span>
      <SegmentedControl
        options={orderOptions}
        value={order}
        onchange={(value) => (order = value)}
        semantics="radiogroup"
        size="sm"
        density="compact"
        color="accent"
        ariaLabelledby="order-label"
      />
    </div>
    <div class="control">
      <span class="control-label" id="browse-label">Browse with</span>
      <SegmentedControl
        options={browseOptions}
        value={browse}
        onchange={(value) => (browse = value)}
        semantics="radiogroup"
        size="sm"
        density="compact"
        color="accent"
        ariaLabelledby="browse-label"
      />
    </div>
    <div class="control">
      <span class="control-label" id="colour-label">Colour</span>
      <SegmentedControl
        options={colourOptions}
        value={colour}
        onchange={(value) => (colour = value)}
        semantics="radiogroup"
        size="sm"
        density="compact"
        color="accent"
        ariaLabelledby="colour-label"
      />
    </div>
  </aside>
</div>

<style>
  /* A fixed frame: the page never moves, only the All grid and the panel pan. */
  .frame {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-areas:
      "head"
      "stage"
      "controls";
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    overflow: hidden;
    background: var(--theme-panel-bg, #11131a);
    color: var(--theme-text, #e8edf6);
  }

  .head {
    grid-area: head;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0 0.75rem;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 700;
  }
  .count-line {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-muted, #9aa6b8);
    font-variant-numeric: tabular-nums;
  }

  .stage {
    grid-area: stage;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 0.5rem;
    min-height: 0;
    min-width: 0;
  }
  .content {
    position: relative;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
  .status {
    display: grid;
    place-items: center;
    height: 100%;
    margin: 0;
    color: var(--theme-text-muted, #9aa6b8);
    font-variant-numeric: tabular-nums;
  }

  .boxes {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--cols), var(--box));
    grid-auto-rows: var(--box);
    gap: var(--gap);
    justify-content: center;
    align-content: center;
    height: 100%;
  }
  /* The one area that pans: every family, like today's screen, for comparison. */
  .boxes.all {
    justify-content: start;
    align-content: start;
    overflow-y: auto; /* scrolls: every family box in the test harness, a long list */
  }

  .box {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    padding: 0.35rem;
    border-radius: 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #e8edf6);
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .box:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }
  /* Inside the box, since the content area clips at its edges. */
  .box:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
  }
  .close:focus-visible,
  .page-button:focus-visible,
  .range:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  .badge {
    position: absolute;
    right: 0.4rem;
    bottom: 0.4rem;
    min-width: 1.5rem;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    background: var(--theme-panel-bg, #11131a);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    font-size: var(--font-size-compact);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: center;
    line-height: 1.3;
  }

  /* The family's shapes open over the boxes, inside the same area. */
  .panel {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: 16px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    /* The theme's panels are see-through; the boxes behind must not read. */
    background: var(--theme-panel-bg, #11131a);
    backdrop-filter: blur(32px);
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .members {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    align-content: start;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto; /* scrolls: one family's members, a long list */
  }
  .member {
    display: grid;
    gap: 0.2rem;
    padding: 0.5rem;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    text-align: center;
    min-width: 0;
  }
  .member-still {
    display: block;
    aspect-ratio: 1;
  }
  .member-word {
    font-weight: 700;
    font-size: var(--font-size-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .member-count {
    font-size: var(--font-size-compact);
    color: var(--theme-text-muted, #9aa6b8);
    font-variant-numeric: tabular-nums;
  }

  .close,
  .page-button {
    min-height: 36px;
    padding: 0 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, #e8edf6);
    font: inherit;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .close:hover,
  .page-button:hover:not(:disabled) {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
  }
  .page-button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* The slot keeps one height, so switching modes never resizes the boxes. */
  .browse-slot {
    display: flex;
    align-items: center;
    height: 6rem;
    min-width: 0;
  }
  .scrub,
  .steps,
  .alike {
    display: grid;
    gap: 0.2rem;
    width: 100%;
    min-width: 0;
  }
  .steps {
    gap: 0.35rem;
  }
  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
  }
  .where,
  .all-note {
    font-size: var(--font-size-sm);
    color: var(--theme-text-muted, #9aa6b8);
    font-variant-numeric: tabular-nums;
  }
  .where {
    min-width: 9ch;
    text-align: center;
  }
  .all-note {
    margin: 0 auto;
  }
  .ends {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: var(--font-size-compact);
    font-weight: 600;
  }

  .range {
    display: block;
    width: 100%;
    height: 28px;
    margin: 0;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }
  .range::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 3px;
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }
  .range::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }
  .range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 22px;
    height: 22px;
    margin-top: -8px;
    border-radius: 50%;
    border: 2px solid var(--theme-panel-bg, #11131a);
    background: var(--theme-accent, #6366f1);
  }
  .range::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--theme-panel-bg, #11131a);
    background: var(--theme-accent, #6366f1);
  }
  .range:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .controls {
    grid-area: controls;
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }
  .control {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }
  .control-label {
    font-size: var(--font-size-compact);
    font-weight: 700;
    color: var(--theme-text-muted, #9aa6b8);
  }

  /* Room to the side: the controls become a rail and the boxes get the height. */
  @media (min-width: 1024px) and (min-aspect-ratio: 1/1) {
    .frame {
      grid-template-areas:
        "head head"
        "stage controls";
      grid-template-columns: minmax(0, 1fr) 350px;
      grid-template-rows: auto minmax(0, 1fr);
      column-gap: 0.75rem;
    }
    .controls {
      align-content: start;
      gap: 0.6rem;
      overflow: hidden;
    }
    .browse-slot {
      height: 3.75rem;
    }
    .steps {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }
  }

  /* Wide but short: every row counts. */
  @media (max-height: 500px) {
    .frame {
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
    }
    .controls {
      gap: 0.2rem;
    }
    .browse-slot {
      height: 3.75rem;
    }
    .range {
      height: 22px;
    }
    .close,
    .page-button {
      min-height: 30px;
    }
  }

  /* The fold: labels sit beside their controls, since the width is there. */
  @media (min-width: 600px) and (max-width: 1023px), (min-width: 600px) and (max-aspect-ratio: 1/1) {
    .control {
      grid-template-columns: 6rem minmax(0, 1fr);
      align-items: center;
      gap: 0.5rem;
    }
    .browse-slot {
      height: 4rem;
    }
    .steps {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }
  }

  /* A short phone: labels move beside their controls to give the boxes a row. */
  @media (max-width: 599px) and (max-height: 760px) {
    .control {
      grid-template-columns: 3.6rem minmax(0, 1fr);
      align-items: center;
      gap: 0.35rem;
    }
    .control-label {
      font-size: var(--font-size-compact);
      line-height: 1.1;
    }
    .controls {
      gap: 0.2rem;
    }
    .browse-slot {
      height: 5.4rem;
    }
    .steps {
      gap: 0.15rem;
    }
    .page-button {
      min-height: 30px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .box,
    .close,
    .page-button {
      transition: none;
    }
  }
</style>
