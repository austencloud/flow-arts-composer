<!--
  /test/card-mandala-arrival — the slow-card mandala, on demand.

  Real gallery cards from the public pool, with every picture held back by a
  pretend network delay, so each card shows what a slow card shows: its own
  mandala drawing itself, then flying into the card's mandala squares as the
  picture fades in (Austen, 2026-11-12: "Own mandala, slow cards").

  The page patches the shared thumbnail orchestrator while it is open (no
  memory hits, no early previews, each result held for the chosen delay) and
  puts it back when it closes. The card hears a pretend loading story in
  place of the real one: waiting in line for the whole delay; loading with
  no step numbers (Stuck, the long wait that once drew the figure whole and
  stopped); or waiting, then step numbers, then saving. So the travelling
  line, its length following the steps, each caption and the finish can all
  be seen. The captions come from the cards themselves, as on the gallery.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import ChoreoCardThumbnail from "#lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte";
  import { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
  import { getThumbnailRenderOrchestrator } from "#lib/shared/browse/get-thumbnail-render-orchestrator.js";
  import type { ThumbnailRenderOrchestrator } from "#lib/shared/browse/services/thumbnail-render-orchestrator.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  type Speed =
    | "phone"
    | "slow"
    | "long"
    | "counted"
    | "stuck"
    | "lined"
    | "mixed"
    | "fast";
  /**
   * What the card hears over its wait: "line" waiting in line the whole
   * time, "loading" rendering with no step numbers the whole time, or
   * "counted" in line, then step numbers, then saving.
   */
  type Story = "line" | "loading" | "counted";
  interface SpeedOption {
    id: Speed;
    label: string;
    range: [number, number];
    story: Story;
    /**
     * For a counted story, the in-line and saving parts in ms; without
     * them they are shares of the wait (COUNT_FROM, COUNT_TO).
     */
    lineMs?: number;
    saveMs?: number;
  }
  const SPEEDS: SpeedOption[] = [
    {
      id: "phone",
      label: "Phone (0.4 to 4 s)",
      range: [400, 4000],
      story: "line",
    },
    {
      id: "slow",
      label: "Slow (3 to 5 s)",
      range: [3000, 5000],
      story: "line",
    },
    {
      id: "long",
      label: "Long (8 to 10 s)",
      range: [8000, 10000],
      story: "line",
    },
    {
      id: "counted",
      label: "Counted steps (6 to 9 s)",
      range: [6000, 9000],
      story: "counted",
    },
    // The fault Austen filmed: a long wait with no step numbers. The line
    // must keep travelling and never draw itself whole.
    {
      id: "stuck",
      label: "Stuck (45 s, no numbers)",
      range: [45_000, 45_000],
      story: "loading",
    },
    {
      id: "lined",
      label: "In line, then counted (15 s + 15 s)",
      range: [32_000, 32_000],
      story: "counted",
      lineMs: 15_000,
      saveMs: 2000,
    },
    {
      id: "mixed",
      label: "Mixed (0.05 to 2 s)",
      range: [50, 2000],
      story: "line",
    },
    {
      id: "fast",
      label: "Fast (under 0.2 s)",
      range: [0, 200],
      story: "line",
    },
  ];
  /** The counted speed's story: in line, then steps, then saving. */
  const COUNT_FROM = 0.25;
  const COUNT_TO = 0.85;

  let speed = $state<Speed>("phone");
  let round = $state(0);
  let sequences = $state<SequenceData[]>([]);
  let poolCount = $state(0);
  let withSteps = $state(0);
  let failure = $state<string | null>(null);

  let orchestrator: ThumbnailRenderOrchestrator | null = null;
  let restore: (() => void) | null = null;

  function delayFor(option: SpeedOption): number {
    const [low, high] = option.range;
    return low + Math.random() * (high - low);
  }

  /**
   * Tell the card a pretend loading story over `hold` ms. Returns a stop.
   */
  function narrate(
    request: Parameters<ThumbnailRenderOrchestrator["getThumbnail"]>[0],
    option: SpeedOption,
    hold: number
  ): () => void {
    const say = request.onStatusChange;
    if (option.story === "loading") {
      say?.({ state: "rendering" });
      return () => {};
    }
    say?.({ state: "queued", position: 0 });
    if (option.story !== "counted") return () => {};
    const total = (request.sequence.steps?.length ?? 0) + 1;
    const countFrom = option.lineMs ?? hold * COUNT_FROM;
    const countTo =
      option.saveMs !== undefined ? hold - option.saveMs : hold * COUNT_TO;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, tell: () => void) =>
      timers.push(setTimeout(tell, ms));
    for (let current = 1; current <= total; current++) {
      at(countFrom + ((countTo - countFrom) * (current - 1)) / total, () =>
        say?.({
          state: "rendering",
          progress: { current, total, stage: "rendering" },
        })
      );
    }
    at(countTo, () => say?.({ state: "uploading" }));
    return () => timers.forEach(clearTimeout);
  }

  function patchOrchestrator(target: ThumbnailRenderOrchestrator): () => void {
    const getCached = target.getCached;
    const getThumbnail = target.getThumbnail;
    target.getCached = () => null;
    target.getThumbnail = async (request) => {
      const option = SPEEDS.find((s) => s.id === speed)!;
      const hold = delayFor(option);
      const startedAt = performance.now();
      const hush = narrate(request, option, hold);
      request.signal?.addEventListener("abort", hush, { once: true });
      const result = await getThumbnail.call(target, {
        ...request,
        onPreview: undefined,
        onStatusChange: undefined,
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
      hush();
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

  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .page {
    border-top: var(--safe-top) solid transparent;
  }
</style>
