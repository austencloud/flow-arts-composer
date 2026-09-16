<script lang="ts">
  /**
   * Mandala Rosetta — full enumeration, baked clips.
   * Each cell is a pre-baked, self-contained MP4 (grid + single club + lit FADE
   * trail + dotted hand-path + the glowing mandala baked in), looping in sync.
   * Rows = all 7 turn values; cols = arc → linear → concave. One full clip set per
   * effort; the chip row swaps the whole grid between efforts. ?bake auto-renders
   * every effort to static/mandala-rosetta/<effort>/ via the dev write endpoint.
   */
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import {
    resolveRotationStyleMatrices,
    type RotationStyleMatrix,
  } from "$lib/features/lab/vtg-lab/services/resolve-rotation-style-matrices";
  import { TURN_VALUES } from "$lib/features/choreo-card/domain/turn-pattern-parser";
  import { TND_TURNS_RATIO_MAP } from "$lib/features/choreo-card/domain/tnd-element";
  import { bakeMandalaClips, type BakeJob } from "$lib/features/lab/vtg-lab/services/bake-mandala-clips";
  import { EFFORTS, type EffortId } from "$lib/shared/effort/domain/effort-types";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import SeamlessLoopVideo from "$lib/features/lab/vtg-lab/components/SeamlessLoopVideo.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  type Style = "iso" | "antispin";
  type PathShape = "arc" | "linear" | "concave";

  let iso = $state<RotationStyleMatrix | null>(null);
  let anti = $state<RotationStyleMatrix | null>(null);
  let err = $state("");

  // Effort currently displayed (default linear). Swapping it points every cell at
  // that effort's pre-baked clip set.
  let effort = $state<EffortId>("linear");
  const effortOptions = EFFORTS.map((e) => ({ value: e.id, label: e.label }));

  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const keyOf = (t: number) => `${fmt(t)}|${fmt(t)}`;
  const turnsSlug = (t: number) => fmt(t).replace(".", "_");
  const clipSrc = (style: Style, t: number, ps: PathShape) =>
    `/mandala-rosetta/${effort}/${style}-${turnsSlug(t)}-${ps}.mp4`;

  function seq(style: Style, turns: number): SequenceData | null {
    const mat = style === "iso" ? iso : anti;
    return mat?.byTurn.get(keyOf(turns)) ?? null;
  }
  const petals = (style: Style, t: number) => (style === "iso" ? 2 * t : 2 * t + 2);

  const PATH_SHAPES: PathShape[] = ["arc", "linear", "concave"];
  const SPINS: { id: Style; label: string }[] = [
    { id: "iso", label: "Pro · inspin" },
    { id: "antispin", label: "Anti · antispin" },
  ];

  let zoom = $state<{ style: Style; turns: number; ps: PathShape; label: string } | null>(null);
  function open(style: Style, turns: number, ps: PathShape) {
    if (!seq(style, turns)) return;
    zoom = {
      style, turns, ps,
      label: `${SPINS.find((x) => x.id === style)?.label} · ${fmt(turns)}t · ${TND_TURNS_RATIO_MAP[turns] ?? ""} · ${ps}`,
    };
  }

  // ── Bake mode (?bake → auto-render every effort) ───────────────────────────
  // Optional ?efforts=elastic,bounce filters which effort sets to (re)bake — keeps
  // a single Chrome run well under the per-instance WebGL-context ceiling when
  // resuming a partial bake.
  let bakeMode = $derived($page.url.searchParams.has("bake"));
  let bakeEfforts = $derived(
    ($page.url.searchParams.get("efforts") || "")
      .split(",").map((s) => s.trim()).filter(Boolean),
  );
  let baking = $state(false);
  let bakeStatus = $state("");

  // ── Repair mode (?transcode → drop spurious frame 0 from existing clips) ────
  // Each baked clip's frame 0 is the static start-placement snapshot (off the
  // continuous mandala curve), which flashes at every MSE loop seam. Decode→drop
  // frame 0→re-mux fixes the seam without re-rendering (no WebGL → no crash).
  // ?efforts=… filters which effort sets to repair, same as bake.
  let transcodeMode = $derived($page.url.searchParams.has("transcode"));
  let transcoding = $state(false);
  let transcodeStatus = $state("");

  async function runTranscode() {
    if (transcoding) return;
    const jobs = buildJobs();
    if (jobs.length === 0) { transcodeStatus = "no sequences loaded"; return; }
    const efforts = (bakeEfforts.length
      ? EFFORTS.filter((e) => bakeEfforts.includes(e.id))
      : EFFORTS).map((e) => e.id);
    const { rotateClipToBestSeam } = await import(
      "$lib/features/lab/vtg-lab/services/transcode-mandala-clips"
    );
    transcoding = true;
    let done = 0;
    const total = efforts.length * jobs.length;
    try {
      for (const eff of efforts) {
        for (const job of jobs) {
          const buf = await (await fetch(`/mandala-rosetta/${eff}/${job.filename}`)).arrayBuffer();
          const { buffer, frames, seamAt } = await rotateClipToBestSeam(buf, { fps: 30 });
          const res = await fetch(
            `/api/bake-clip?effort=${encodeURIComponent(eff)}&name=${encodeURIComponent(job.filename)}`,
            { method: "POST", body: new Blob([buffer], { type: "video/mp4" }) },
          );
          if (!res.ok) throw new Error(`write failed ${eff}/${job.filename}: ${res.status}`);
          done++;
          transcodeStatus = `${done}/${total} — ${eff}/${job.filename} (seam@${seamAt}/${frames})`;
        }
      }
      transcodeStatus = `done — ${done}/${total} re-seamed to max-motion`;
    } catch (e: any) {
      transcodeStatus = `error: ${e?.message ?? e}`;
    } finally {
      transcoding = false;
    }
  }

  function buildJobs(): BakeJob[] {
    const jobs: BakeJob[] = [];
    for (const spin of SPINS) {
      for (const t of TURN_VALUES) {
        const base = seq(spin.id, t);
        if (!base) continue;
        for (const ps of PATH_SHAPES) {
          jobs.push({ filename: `${spin.id}-${turnsSlug(t)}-${ps}.mp4`, sequence: base, pathShape: ps });
        }
      }
    }
    return jobs;
  }

  async function runBake() {
    if (baking) return;
    const jobs = buildJobs();
    if (jobs.length === 0) { bakeStatus = "no sequences loaded"; return; }
    const efforts = bakeEfforts.length
      ? EFFORTS.filter((e) => bakeEfforts.includes(e.id))
      : EFFORTS;
    baking = true;
    try {
      let ei = 0;
      for (const e of efforts) {
        ei++;
        await bakeMandalaClips(jobs, {
          effort: e.id,
          resolution: 720,
          fps: 30,
          onProgress: (d, t, label) =>
            (bakeStatus = `[${ei}/${efforts.length} ${e.id}] ${d}/${t} — ${label}`),
        });
      }
      bakeStatus = `done — ${efforts.length}×${jobs.length} clips written`;
    } catch (e: any) {
      bakeStatus = `error: ${e?.message ?? e}`;
    } finally {
      baking = false;
    }
  }

  onMount(() => {
    // Expose status for headless monitoring during an automated bake.
    (window as any).__rosettaBake = {
      get status() { return bakeStatus; },
      get baking() { return baking; },
    };
    (window as any).__rosettaTranscode = {
      get status() { return transcodeStatus; },
      get running() { return transcoding; },
    };

    resolveRotationStyleMatrices("diamond")
      .then((m) => {
        iso = m.find((x) => x.style === "iso") ?? null;
        anti = m.find((x) => x.style === "antispin") ?? null;
        if (bakeMode) runBake();
        else if (transcodeMode) runTranscode();
      })
      .catch((e: any) => (err = e?.message ?? "Failed to load sequences"));
  });
</script>

<div class="page">
  <header>
    <h1>Mandala Rosetta — full enumeration</h1>
    <p class="sub">
      Pre-baked clips: <strong>one hand (blue)</strong>, <strong>single-end
      (club)</strong>, glowing mandala baked in. One full set per <strong>effort</strong>
      (easing) — switch with the chips. Rows = all 7 turn values (hands:props).
      Columns = <strong>arc → linear → concave</strong>. Only <strong>arc</strong> exists in VTG.
    </p>
  </header>

  {#if bakeMode}
    <div class="controls">
      <button class="modebtn on" onclick={runBake} disabled={baking}>Bake all efforts</button>
      <span class="ctl-label">{bakeStatus || "auto-running…"}</span>
    </div>
  {:else if transcodeMode}
    <div class="controls">
      <button class="modebtn on" onclick={runTranscode} disabled={transcoding}>Transcode (strip B-frames)</button>
      <span class="ctl-label">{transcodeStatus || "auto-running…"}</span>
    </div>
  {:else}
    <div class="effortbar">
      <SegmentedControl
        options={effortOptions}
        value={effort}
        onchange={(v) => (effort = v as EffortId)}
        color="accent"
        size="sm"
      />
    </div>
  {/if}

  {#if err}<p class="err">{err}</p>{/if}

  {#if !bakeMode && !transcodeMode && !$page.url.searchParams.has("inspect")}
  <div class="boards">
  {#each SPINS as spin}
    <section>
      <h2>{spin.label}</h2>
      <div class="matrix">
        <div class="mhead corner">turns · ratio</div>
        {#each PATH_SHAPES as ps}
          <div class="mhead">{ps}{#if ps !== "arc"}<span class="tka">TKA</span>{/if}</div>
        {/each}

        {#each TURN_VALUES as t}
          <div class="mlabel">
            <b>{fmt(t)}t</b>
            <span class="ratio">{TND_TURNS_RATIO_MAP[t] ?? fmt(t)}</span>
            <span class="pet">{petals(spin.id, t)} petal{petals(spin.id, t) === 1 ? "" : "s"}</span>
          </div>
          {#each PATH_SHAPES as ps}
            <button class="cell" onclick={() => open(spin.id, t, ps)} aria-label="enlarge">
              {#if seq(spin.id, t)}
                {#key effort}
                  <SeamlessLoopVideo klass="clip" src={clipSrc(spin.id, t, ps)} />
                {/key}
              {/if}
            </button>
          {/each}
        {/each}
      </div>
    </section>
  {/each}
  </div>
  {/if}
</div>

{#if zoom}
  <div class="overlay" role="button" tabindex="-1" aria-label="Close" onclick={() => (zoom = null)} onkeydown={(e) => e.key === "Escape" && (zoom = null)}>
    <div class="zoomcard" role="dialog" aria-label={zoom.label} onclick={(e) => e.stopPropagation()} onkeydown={() => {}} tabindex="-1">
      <div class="player">
        {#key `${zoom.style}-${zoom.turns}-${zoom.ps}-${effort}`}
          <SeamlessLoopVideo klass="clip" src={clipSrc(zoom.style, zoom.turns, zoom.ps)} />
        {/key}
      </div>
      <div class="zoomcap">{zoom.label} <span class="hint">· click outside to close</span></div>
    </div>
  </div>
{/if}

<style>
  .page {
    height: 100dvh;
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    background: radial-gradient(1100px 650px at 70% -10%, #16323e 0%, #0c151b 60%);
    color: #e7eef3;
    font: 15px/1.55 -apple-system, "Segoe UI", system-ui, sans-serif;
    padding: 0.75rem 1.25rem;
  }
  header { max-width: 1600px; width: 100%; margin: 0 auto; flex: none; }
  h1 { font-size: 1.25rem; margin: 0 0 0.15rem; }
  .sub {
    color: #9fb2bd; margin: 0; max-width: 130ch; font-size: 0.78rem; line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .sub strong { color: #fff; }
  .err { max-width: 1600px; margin: 0 auto; color: #f87171; }

  .controls {
    flex: none;
    max-width: 1600px;
    width: 100%;
    margin: 0 auto;
    padding: 0.5rem 0.85rem;
    box-sizing: border-box;
    background: rgba(12, 21, 27, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }
  .modebtn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #cfe6f2;
    border-radius: 7px;
    padding: 0.3rem 0.7rem;
    font-size: 0.8rem;
    cursor: pointer;
    text-transform: capitalize;
  }
  .modebtn.on { background: #1d6f86; border-color: #7fd6ef; color: #fff; }
  .modebtn:disabled { opacity: 0.5; cursor: default; }
  .ctl-label { font-size: 0.78rem; color: #9fb2bd; font-weight: 600; }

  .effortbar { max-width: 1100px; width: 100%; margin: 0 auto; flex: none; }

  /* Two boards side by side; cells sized off viewport height so all 7 rows of
     both matrices fit one screen with no scroll. --cell binds on vh (4K and
     down) but caps on vw so it never overflows width on narrow screens. */
  .boards {
    --cell: min(11vh, 12vw);
    flex: 1;
    min-height: 0;
    display: flex;
    justify-content: center;
    gap: clamp(1rem, 3vw, 4rem);
    overflow: hidden;
  }
  section { display: flex; flex-direction: column; min-width: 0; }
  h2 {
    font-size: 0.95rem;
    margin: 0 0 0.35rem;
    color: #cfe6f2;
    flex: none;
  }

  .matrix {
    display: grid;
    grid-template-columns: minmax(4rem, max-content) repeat(3, var(--cell));
    grid-template-rows: auto repeat(7, var(--cell));
    gap: 0.4rem;
    align-content: start;
  }
  .mhead {
    text-align: center;
    font-size: 0.8rem;
    font-weight: 600;
    color: #cfe6f2;
    text-transform: capitalize;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }
  .mhead.corner { text-transform: none; color: #7fd6ef; justify-content: flex-start; }
  .tka {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #0c151b;
    background: #7fd6ef;
    border-radius: 4px;
    padding: 0.05rem 0.3rem;
  }
  .mlabel { display: flex; flex-direction: column; justify-content: center; line-height: 1.2; font-size: 0.82rem; }
  .mlabel b { color: #fff; }
  .mlabel .ratio { font-variant-numeric: tabular-nums; color: #7fd6ef; font-size: 0.85rem; }
  .mlabel .pet { font-size: 0.75rem; color: #9fb2bd; }

  .cell {
    width: 100%;
    height: 100%;
    min-width: 0;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease;
  }
  .cell:hover { border-color: rgba(127, 214, 239, 0.5); background: rgba(127, 214, 239, 0.07); }
  .cell:focus-visible { outline: 2px solid rgba(127, 214, 239, 0.7); outline-offset: 2px; }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 1000);
    background: rgba(4, 12, 18, 0.72);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }
  .zoomcard {
    background: rgba(16, 28, 38, 0.97);
    border: 1px solid rgba(127, 214, 239, 0.35);
    border-radius: 18px;
    padding: 1rem;
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
  }
  .player { width: min(78vw, 520px); aspect-ratio: 1; }
  .zoomcap { font-size: 0.95rem; color: #cfe6f2; font-variant-numeric: tabular-nums; }
  .hint { color: #64748b; font-size: 0.8rem; }
</style>
