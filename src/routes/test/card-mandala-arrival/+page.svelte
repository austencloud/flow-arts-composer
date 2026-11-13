<!--
  /test/card-mandala-arrival — the slow-card mandala, on demand.

  Real gallery cards from the public pool, with every picture held back by a
  pretend network delay, so each card shows what a slow card shows: its own
  mandala drawing itself, then flying into the card's mandala squares as the
  picture fades in (Austen, 2026-11-12: "Own mandala, slow cards").

  The page patches the shared thumbnail orchestrator while it is open (no
  memory hits, no early previews, each result held for the chosen delay) and
  puts it back when it closes.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import ChoreoCardThumbnail from "#lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte";
  import { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
  import { getThumbnailRenderOrchestrator } from "#lib/shared/browse/get-thumbnail-render-orchestrator.js";
  import type { ThumbnailRenderOrchestrator } from "#lib/shared/browse/services/thumbnail-render-orchestrator.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  type Speed = "phone" | "slow" | "mixed" | "fast";
  const SPEEDS: { id: Speed; label: string; range: [number, number] }[] = [
    { id: "phone", label: "Phone (0.4 to 4 s)", range: [400, 4000] },
    { id: "slow", label: "Slow (3 to 5 s)", range: [3000, 5000] },
    { id: "mixed", label: "Mixed (0.05 to 2 s)", range: [50, 2000] },
    { id: "fast", label: "Fast (under 0.2 s)", range: [0, 200] },
  ];

  let speed = $state<Speed>("phone");
  let round = $state(0);
  let sequences = $state<SequenceData[]>([]);
  let poolCount = $state(0);
  let withSteps = $state(0);
  let failure = $state<string | null>(null);

  let orchestrator: ThumbnailRenderOrchestrator | null = null;
  let restore: (() => void) | null = null;

  function delayFor(): number {
    const [low, high] = SPEEDS.find((s) => s.id === speed)!.range;
    return low + Math.random() * (high - low);
  }

  function patchOrchestrator(target: ThumbnailRenderOrchestrator): () => void {
    const getCached = target.getCached;
    const getThumbnail = target.getThumbnail;
    target.getCached = () => null;
    target.getThumbnail = async (request) => {
      const hold = delayFor();
      const startedAt = performance.now();
      const result = await getThumbnail.call(target, {
        ...request,
        onPreview: undefined,
      });
      // With getCached patched to miss, a card being replaced thinks its blob
      // picture is uncached and frees it, while the orchestrator still hands
      // that same URL to the next card. Each card gets its own copy here, so a
      // replay never shows a freed picture.
      const url = result.url?.startsWith("blob:")
        ? URL.createObjectURL(await (await fetch(result.url)).blob())
        : result.url;
      const left = hold - (performance.now() - startedAt);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      if (request.signal?.aborted) {
        if (url !== result.url && url) URL.revokeObjectURL(url);
        throw new Error("Cancelled");
      }
      return { ...result, url };
    };
    return () => {
      target.getCached = getCached;
      target.getThumbnail = getThumbnail;
    };
  }

  /** A spread of lengths, so the cards show each mandala layout. */
  function pick(pool: SequenceData[]): SequenceData[] {
    const byLength = new Map<number, SequenceData[]>();
    for (const sequence of pool) {
      const length = sequence.steps?.length ?? 0;
      if (length === 0) continue;
      const list = byLength.get(length) ?? [];
      list.push(sequence);
      byLength.set(length, list);
    }
    const lengths = [...byLength.keys()].sort((a, b) => a - b);
    const chosen: SequenceData[] = [];
    for (let pass = 0; chosen.length < 24 && pass < 8; pass++) {
      for (const length of lengths) {
        const next = byLength.get(length)![pass];
        if (next && chosen.length < 24) chosen.push(next);
      }
    }
    return chosen;
  }

  onMount(async () => {
    orchestrator = getThumbnailRenderOrchestrator();
    restore = patchOrchestrator(orchestrator);
    try {
      const pool = await new PublicSequencesLoader().loadSequenceMetadata();
      poolCount = pool.length;
      withSteps = pool.filter((s) => (s.steps?.length ?? 0) > 0).length;
      sequences = pick(pool);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
  });

  onDestroy(() => restore?.());

  function replay(): void {
    round += 1;
  }

  function setSpeed(next: Speed): void {
    speed = next;
    replay();
  }
</script>

<svelte:head>
  <title>Card mandala arrival</title>
</svelte:head>

<main class="page">
  <header class="bar">
    <h1>Slow-card mandala</h1>
    <div class="speeds" role="group" aria-label="Pretend picture delay">
      {#each SPEEDS as option (option.id)}
        <button
          type="button"
          class="speed"
          aria-pressed={speed === option.id}
          onclick={() => setSpeed(option.id)}
        >
          {option.label}
        </button>
      {/each}
    </div>
    <button type="button" class="replay" onclick={replay}>Replay</button>
    <p class="note">
      {#if failure}
        Could not load the pool: {failure}
      {:else if poolCount}
        {withSteps} of {poolCount} pool sequences carry steps; showing {sequences.length}.
        Cards wait {DURATION.emphasis} ms before drawing.
      {:else}
        Loading the pool…
      {/if}
    </p>
  </header>

  {#key round}
    <section class="grid">
      {#each sequences as sequence (sequence.id)}
        <div class="cell">
          <ChoreoCardThumbnail {sequence} eager />
        </div>
      {/each}
    </section>
  {/key}
</main>

<style>
  .page {
    min-height: 100dvh;
    padding: 16px;
    box-sizing: border-box;
    background: var(--theme-panel-bg, #111);
    color: var(--theme-text, #fff);
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin-bottom: 16px;
  }

  h1 {
    font-size: var(--font-size-lg, 18px);
    margin: 0 8px 0 0;
  }

  .speeds {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .speed,
  .replay {
    min-height: 44px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg, #1b1b22);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .speed[aria-pressed="true"] {
    background: var(--theme-accent, #6366f1);
    border-color: transparent;
  }

  .replay {
    font-weight: 600;
  }

  .note {
    flex-basis: 100%;
    margin: 0;
    font-size: var(--font-size-compact, 13px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }

  .cell {
    min-width: 0;
  }
</style>
