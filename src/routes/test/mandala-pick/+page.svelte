<script lang="ts">
  // Interactive picker for the composer mandala showcase. Renders the baked pool
  // (Austen's 36 saved mandalas), lets you select the coolest, and Choose POSTs
  // them to /test/mandala-pick/save, which bakes them into chosen-mandalas.ts.
  import { browser } from "$app/env";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import { SHOWCASE_MANDALAS } from "../../(public)/composer/_sections/showcase-mandalas";

  let sizes = $state<number[]>([]);
  let selected = $state<Set<number>>(new Set());
  let saving = $state(false);
  let saveMsg = $state("");
  let saveOk = $state(false);

  const keepList = $derived(
    [...selected].sort((a, b) => a - b).map((n) => n + 1).join(", "),
  );

  function toggle(i: number) {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    selected = next;
  }

  async function choose() {
    if (selected.size === 0 || saving) return;
    saving = true;
    saveMsg = "";
    const chosen = [...selected].sort((a, b) => a - b).map((i) => SHOWCASE_MANDALAS[i]);
    try {
      const res = await fetch("/test/mandala-pick/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chosen }),
      });
      const out = await res.json();
      saveOk = !!out.ok;
      saveMsg = out.ok
        ? `Saved ${out.count} picks. They're baked in now.`
        : `Save failed: ${out.error}`;
    } catch {
      saveOk = false;
      saveMsg = "Save failed (network).";
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Pick your mandalas</title></svelte:head>

<div class="page">
  <header class="head">
    <h1>Pick your showcase mandalas</h1>
    <p>Click the coolest, then Choose. Your picks bake straight into the composer showcase.</p>
  </header>

  <div class="bar">
    <button class="choose" onclick={choose} disabled={selected.size === 0 || saving}>
      {saving ? "Saving…" : `Choose ${selected.size || ""}`.trim()}
    </button>
    {#if keepList}<span class="keep">Selected: {keepList}</span>{/if}
    {#if saveMsg}<span class="msg" class:ok={saveOk}>{saveMsg}</span>{/if}
  </div>

  <div class="grid">
    {#each SHOWCASE_MANDALAS as m, i (m.id)}
      <button
        type="button"
        class="tile"
        class:selected={selected.has(i)}
        aria-pressed={selected.has(i)}
        onclick={() => toggle(i)}
        bind:clientWidth={sizes[i]}
      >
        <LazyMount
          loader={() => import("#lib/shared/mandala/components/SequenceMandala.svelte")}
          active={browser && sizes[i] > 0}
          props={{
            sequence: { steps: m.steps },
            size: sizes[i] || 300,
            show: m.variant,
            style: "stroke",
            leftPropType: m.leftPropType,
            rightPropType: m.rightPropType,
            pathShape: "arc",
            strokeWidth: 2.5,
            animate: false,
          }}
        />
        <span class="idx">{i + 1}</span>
        {#if selected.has(i)}<span class="chk">✓</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    background: radial-gradient(120% 80% at 50% -8%, #171a3a 0%, #0e1024 45%, #0a0b16 100%);
    background-attachment: fixed;
    color: #e7e9f5;
    font-family: "Inter", system-ui, sans-serif;
    padding: 2rem 1.4rem 5rem;
  }
  .head {
    max-width: 60rem;
    margin: 0 auto 1.4rem;
    text-align: center;
  }
  .head h1 {
    font-size: clamp(1.5rem, 1.2rem + 1.2vw, 2.1rem);
    font-weight: 720;
    margin: 0 0 0.4rem;
  }
  .head p {
    margin: 0;
    color: #9aa0c4;
  }

  .bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.7rem 1rem;
    max-width: 72rem;
    margin: 0 auto 1.4rem;
    padding: 0.7rem 0.2rem;
    background: rgba(10, 11, 22, 0.82);
    backdrop-filter: blur(10px);
  }
  .choose {
    font-size: 0.95rem;
    font-weight: 680;
    color: #fff;
    border: none;
    border-radius: 11px;
    padding: 0.7rem 1.4rem;
    background: linear-gradient(135deg, #6f8cff, #8b6cff);
    cursor: pointer;
  }
  .choose:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .keep {
    font-size: 0.85rem;
    color: #9aa0c4;
  }
  .msg {
    font-size: 0.85rem;
    font-weight: 640;
    color: #ffb08a;
  }
  .msg.ok {
    color: oklch(0.82 0.14 150);
  }

  .grid {
    max-width: 72rem;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.9rem;
  }
  .tile {
    position: relative;
    aspect-ratio: 1;
    border-radius: 14px;
    overflow: hidden;
    display: grid;
    place-items: center;
    padding: 0;
    cursor: pointer;
    background: oklch(0.16 0.018 270 / 0.55);
    border: 1px solid oklch(0.5 0.03 270 / 0.18);
    box-shadow: 0 10px 24px oklch(0.1 0.02 270 / 0.3);
    transition:
      border-color 140ms ease,
      box-shadow 140ms ease,
      transform 140ms ease;
  }
  .tile:hover {
    transform: translateY(-2px);
    border-color: oklch(0.7 0.1 275 / 0.5);
  }
  .tile.selected {
    border-color: oklch(0.75 0.16 275);
    box-shadow:
      0 0 0 2px oklch(0.75 0.16 275) inset,
      0 12px 30px oklch(0.4 0.16 275 / 0.4);
  }
  .idx {
    position: absolute;
    top: 6px;
    left: 8px;
    font-size: 0.78rem;
    font-weight: 720;
    color: oklch(0.8 0.02 270);
    background: oklch(0.12 0.02 270 / 0.7);
    border-radius: 6px;
    padding: 0.05rem 0.35rem;
    font-variant-numeric: tabular-nums;
  }
  .chk {
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 0.95rem;
    font-weight: 800;
    color: oklch(0.85 0.16 275);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  }
</style>
