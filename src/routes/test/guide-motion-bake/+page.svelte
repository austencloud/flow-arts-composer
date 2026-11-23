<script lang="ts">
  import { GUIDE_MOTION_CONFIGS } from "../../(public)/guide/level-1/_components/guide-motion-configs";
  import { bakeGuideMotion } from "./bake-motion";

  type Row = {
    id: string;
    label: string;
    status: "pending" | "baking" | "done" | "error";
    url: string | null;
    bytes: number | null;
    error: string | null;
  };

  let rows = $state<Row[]>(
    GUIDE_MOTION_CONFIGS.map((c) => ({
      id: c.id, label: c.label, status: "pending", url: null, bytes: null, error: null,
    }))
  );
  let running = $state(false);
  let doneCount = $derived(rows.filter((r) => r.status === "done").length);

  // Optional ?only=id1,id2 — bake just those configs (keeps a commit to the
  // demos you actually changed instead of re-encoding all of them).
  const onlyParam =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("only")
      : null;
  const onlyIds = onlyParam ? new Set(onlyParam.split(",").map((s) => s.trim()).filter(Boolean)) : null;

  async function bakeOne(i: number) {
    const config = GUIDE_MOTION_CONFIGS[i]!;
    rows[i] = { ...rows[i]!, status: "baking", error: null };
    try {
      const blob = await bakeGuideMotion(config);
      const res = await fetch(`/test/guide-motion-bake?id=${config.id}`, {
        method: "POST",
        body: blob,
      });
      if (!res.ok) throw new Error(`write failed: ${res.status} ${await res.text()}`);
      const { bytes } = await res.json();
      const prev = rows[i]!.url;
      if (prev) URL.revokeObjectURL(prev);
      rows[i] = { ...rows[i]!, status: "done", url: URL.createObjectURL(blob), bytes };
    } catch (e) {
      rows[i] = { ...rows[i]!, status: "error", error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function bakeAll() {
    if (running) return;
    running = true;
    for (let i = 0; i < GUIDE_MOTION_CONFIGS.length; i++) {
      if (onlyIds && !onlyIds.has(GUIDE_MOTION_CONFIGS[i]!.id)) continue;
      await bakeOne(i);
    }
    running = false;
  }
</script>

<div class="bake-page">
  <header>
    <h1>Guide Motion Bake</h1>
    <p>Dev-only. Bakes the {GUIDE_MOTION_CONFIGS.length} Level 1 Guide hand-motion demos to
      <code>static/guide/level-1/motions/&lcub;id&rcub;.mp4</code>. Eyeball the grid, then commit the assets.</p>
    <button onclick={bakeAll} disabled={running}>
      {running ? `Baking… ${doneCount}/${rows.length}` : `Bake all (${rows.length})`}
    </button>
    <span class="progress">{doneCount} / {rows.length} baked</span>
  </header>

  <div class="grid">
    {#each rows as row (row.id)}
      <figure class="cell" data-status={row.status}>
        <div class="preview">
          {#if row.url}
            <video src={row.url} autoplay loop muted playsinline></video>
          {:else}
            <div class="placeholder">{row.status}</div>
          {/if}
        </div>
        <figcaption>
          <code>{row.id}</code>
          {#if row.bytes}<span class="bytes">{(row.bytes / 1024).toFixed(0)} KB</span>{/if}
          {#if row.error}<span class="err">{row.error}</span>{/if}
        </figcaption>
      </figure>
    {/each}
  </div>
</div>

<style>
  .bake-page { padding: 2rem; color: #eee; background: #1a1a1a; min-height: 100vh; }
  header { margin-bottom: 1.5rem; display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
  header h1 { width: 100%; margin: 0 0 0.5rem; }
  header p { width: 100%; margin: 0 0 0.5rem; opacity: 0.8; }
  button { padding: 0.6rem 1.2rem; font-size: 1rem; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: default; }
  .progress { opacity: 0.8; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
  .cell { margin: 0; background: #222; border: 1px solid #333; border-radius: 6px; overflow: hidden; }
  .cell[data-status="error"] { border-color: #b00; }
  .cell[data-status="done"] { border-color: #2a7; }
  .preview { aspect-ratio: 1; background: #000; }
  .preview video { width: 100%; height: 100%; object-fit: contain; }
  .placeholder { display: grid; place-items: center; width: 100%; height: 100%; opacity: 0.5; font-size: 0.85rem; }
  figcaption { padding: 0.5rem; font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .bytes { opacity: 0.7; }
  .err { color: #f88; word-break: break-word; }
  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .bake-page {
    border-top: var(--safe-top) solid transparent;
  }
</style>
