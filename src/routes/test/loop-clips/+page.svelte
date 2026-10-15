<!--
  Loop-clip bake harness.

  Renders a pre-rendered loop clip for every sequence in the pilot set with
  the real export engine, writes each one through the dev endpoint, and
  shows the results two ways: the raw clips in a grid, and the same clips
  inside the real showcase preview (what a Creators wall tile is), so the
  hover-to-card and step-strip behaviour can be judged before anything is
  uploaded. `?autorun=1` starts the bake on load.

  Upload afterwards with `node scripts/upload-loop-clips.mjs`.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import SequenceShowcasePreview from "#lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte";
  import { renderLoopClip } from "#lib/shared/sequence-clips/render-loop-clip.js";
  import {
    LOOP_CLIP_FPS,
    LOOP_CLIP_RENDERER_VERSION,
    LOOP_CLIP_RESOLUTION,
  } from "#lib/shared/sequence-clips/loop-clip-spec.js";
  import { ZANS_DIAMOND_PILOT } from "./_data/zans-diamond-pilot";

  type RowStatus =
    | "queued"
    | "loading"
    | "rendering"
    | "saving"
    | "done"
    | "failed";

  interface Row {
    id: string;
    word: string;
    status: RowStatus;
    progress: number;
    seconds: number;
    bytes: number;
    renderMs: number;
    url: string | null;
    sequence: SequenceData | null;
    error: string | null;
  }

  let rows = $state<Row[]>(
    ZANS_DIAMOND_PILOT.sequenceIds.map((id) => ({
      id,
      word: "",
      status: "queued",
      progress: 0,
      seconds: 0,
      bytes: 0,
      renderMs: 0,
      url: null,
      sequence: null,
      error: null,
    }))
  );
  let running = $state(false);
  let finished = $state(false);
  let bakeDir = $state<string | null>(null);

  const done = $derived(rows.filter((row) => row.status === "done"));
  const totalBytes = $derived(done.reduce((sum, row) => sum + row.bytes, 0));
  const totalSeconds = $derived(
    done.reduce((sum, row) => sum + row.seconds, 0)
  );

  async function bakeOne(row: Row): Promise<void> {
    const loader = getBrowseLoader();
    row.status = "loading";
    const sequence = await loader.loadFullSequenceData(row.id, row.id);
    if (!sequence) throw new Error("not public or failed to load");
    row.sequence = sequence;
    row.word = sequence.word ?? sequence.name ?? row.id;

    row.status = "rendering";
    const started = performance.now();
    const rendered = await renderLoopClip(sequence, {
      onProgress: (progress) => {
        row.progress = progress.progress;
      },
    });
    row.renderMs = Math.round(performance.now() - started);
    row.seconds = rendered.entry.seconds;
    row.bytes = rendered.blob.size;

    row.status = "saving";
    const meta = encodeURIComponent(JSON.stringify(rendered.entry));
    const response = await fetch(
      `/api/dev/loop-clip?id=${encodeURIComponent(row.id)}&meta=${meta}`,
      { method: "POST", body: rendered.blob }
    );
    if (!response.ok) {
      throw new Error(
        `save failed: ${response.status} ${await response.text()}`
      );
    }
    const saved = (await response.json()) as { path: string };
    bakeDir = saved.path.replace(/\/[^/]+$/, "");

    if (row.url) URL.revokeObjectURL(row.url);
    row.url = URL.createObjectURL(rendered.blob);
    row.status = "done";
  }

  async function bakeAll(): Promise<void> {
    if (running) return;
    running = true;
    finished = false;
    for (const row of rows) {
      if (row.status === "done") continue;
      try {
        await bakeOne(row);
      } catch (error) {
        row.status = "failed";
        row.error = error instanceof Error ? error.message : String(error);
        console.error(`[loop-clips] ${row.id} failed`, error);
      }
    }
    running = false;
    finished = true;
  }

  onMount(() => {
    if (page.url.searchParams.get("autorun") === "1") void bakeAll();
    return () => {
      for (const row of rows) if (row.url) URL.revokeObjectURL(row.url);
    };
  });

  function kb(bytes: number): string {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
</script>

<svelte:head>
  <title>Loop clip bake</title>
</svelte:head>

<main class="harness" data-bake-complete={finished || undefined}>
  <header>
    <h1>Loop clip bake</h1>
    <p>
      Renderer r{LOOP_CLIP_RENDERER_VERSION}, {LOOP_CLIP_RESOLUTION}px square,
      {LOOP_CLIP_FPS} fps, H.264. Pilot set: Zan's Diamond ({rows.length}
      sequences).
    </p>
    <div class="actions">
      <button type="button" onclick={bakeAll} disabled={running}>
        {running ? "Baking…" : "Render all"}
      </button>
      <span
        class="totals"
        data-bake-results={JSON.stringify({
          done: done.length,
          bytes: totalBytes,
          seconds: totalSeconds,
        })}
      >
        {done.length}/{rows.length} done · {kb(totalBytes)} · {totalSeconds}s of
        motion
        {#if bakeDir}· files in {bakeDir}{/if}
      </span>
    </div>
  </header>

  <table>
    <thead>
      <tr>
        <th>Sequence</th>
        <th>Word</th>
        <th>Status</th>
        <th>Seconds</th>
        <th>Size</th>
        <th>Render</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.id)}
        <tr data-status={row.status}>
          <td class="mono">{row.id}</td>
          <td class="mono">{row.word}</td>
          <td>
            {row.status}
            {#if row.status === "rendering"}
              {Math.round(row.progress * 100)}%
            {/if}
            {#if row.error}<span class="error">{row.error}</span>{/if}
          </td>
          <td>{row.seconds || ""}</td>
          <td>{row.bytes ? kb(row.bytes) : ""}</td>
          <td>{row.renderMs ? `${(row.renderMs / 1000).toFixed(1)}s` : ""}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if done.length > 0}
    <h2>Raw clips</h2>
    <div class="grid">
      {#each done as row (row.id)}
        <figure>
          <video src={row.url} muted loop autoplay playsinline></video>
          <figcaption class="mono">{row.word}</figcaption>
        </figure>
      {/each}
    </div>

    <h2>As wall tiles</h2>
    <p>
      The real showcase preview with the clip. Hover flips to the still card;
      the strip below follows the clip's beat.
    </p>
    <div class="tiles grid">
      {#each done as row (row.id)}
        {#if row.sequence}
          <div class="tile">
            <SequenceShowcasePreview
              word={row.word}
              sequence={row.sequence}
              loopClipUrl={row.url}
              activation="ambient"
              allowQR={false}
            />
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</main>

<style>
  .harness {
    padding: 1.5rem;
    color: var(--theme-text, #fff);
    background: var(--theme-bg, #0b0d12);
    min-height: 100vh;
  }
  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.4rem;
  }
  h2 {
    margin: 2rem 0 0.5rem;
    font-size: 1.1rem;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 0.75rem 0 1.25rem;
  }
  button {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  table {
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th,
  td {
    padding: 0.3rem 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    text-align: left;
  }
  .mono {
    font-family: ui-monospace, monospace;
  }
  .error {
    margin-left: 0.5rem;
    color: #ff8a80;
  }
  tr[data-status="done"] td:nth-child(3) {
    color: #9be69b;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
  }
  .grid.tiles {
    grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
  }
  figure {
    margin: 0;
  }
  video {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    background: #05070a;
    border-radius: 0.5rem;
  }
  figcaption {
    font-size: 0.75rem;
    opacity: 0.8;
    margin-top: 0.25rem;
  }
  .tile {
    aspect-ratio: 1;
  }
</style>
