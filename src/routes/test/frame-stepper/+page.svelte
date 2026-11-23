<script lang="ts">
  /**
   * Frame stepper / scrubber — load any MP4 and inspect EXACT frames.
   * Default loads /debug-recording.mp4. ?clip=<path> loads a baked clip
   * (e.g. ?clip=/mandala-rosetta/linear/antispin-0-arc.mp4).
   * Frame timestamps are read in presentation order so stepping + the scrub
   * slider are exact even for variable-frame-rate screen recordings.
   */
  import { onMount } from "svelte";
  import { Input, BufferSource, ALL_FORMATS, VideoSampleSink, EncodedPacketSink } from "mediabunny";

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let sink: VideoSampleSink | null = null;
  let stamps: number[] = [];

  let idx = $state(0);
  let total = $state(0);
  let tSec = $state(0);
  let status = $state("loading…");
  let src = $state("/debug-recording.mp4");
  let jump = $state(0);

  // latest-wins guard: getSample is async, so during a fast scrub only render
  // the most recently requested frame instead of queuing every one.
  let busy = false;
  let pending: number | null = null;

  async function load(url: string) {
    status = "loading…";
    sink = null; stamps = []; total = 0; idx = 0;
    try {
      const buf = await (await fetch(url)).arrayBuffer();
      const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(new Uint8Array(buf)) });
      const track = await input.getPrimaryVideoTrack();
      if (!track) { status = "no video track"; return; }
      sink = new VideoSampleSink(track);
      const ps = new EncodedPacketSink(track);
      const ts: number[] = [];
      for await (const p of ps.packets()) ts.push(p.timestamp);
      ts.sort((a, b) => a - b);
      stamps = ts;
      total = ts.length;
      status = `${total} frames · ${track.displayWidth}×${track.displayHeight}`;
      await show(0);
    } catch (e: any) {
      status = `error: ${e?.message ?? e}`;
    }
  }

  async function show(i: number) {
    if (!sink || !ctx || total === 0) return;
    i = Math.max(0, Math.min(total - 1, Math.round(i)));
    if (busy) { pending = i; return; }
    busy = true;
    idx = i; jump = i; tSec = stamps[i] ?? 0;
    try {
      const s = await sink.getSample((stamps[i] ?? 0) + 1e-4);
      if (s) {
        const f = s.toVideoFrame();
        if (canvas.width !== f.displayWidth) canvas.width = f.displayWidth;
        if (canvas.height !== f.displayHeight) canvas.height = f.displayHeight;
        ctx.drawImage(f, 0, 0);
        f.close();
        s.close();
      }
    } finally {
      busy = false;
      if (pending !== null) { const p = pending; pending = null; show(p); }
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement && e.target.type === "text") return;
    const k = e.key;
    if (k === "ArrowRight" || k === ".") { show(idx + 1); e.preventDefault(); }
    else if (k === "ArrowLeft" || k === ",") { show(idx - 1); e.preventDefault(); }
    else if (k === "Home") { show(0); e.preventDefault(); }
    else if (k === "End") { show(total - 1); e.preventDefault(); }
    else if (k === "PageUp") { show(idx + 10); e.preventDefault(); }
    else if (k === "PageDown") { show(idx - 10); e.preventDefault(); }
  }

  onMount(() => {
    ctx = canvas.getContext("2d");
    const q = new URLSearchParams(location.search).get("clip");
    if (q) src = q;
    load(src);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
</script>

<div class="wrap">
  <div class="bar">
    <strong>Frame scrubber</strong>
    <input class="src" bind:value={src} spellcheck="false" onkeydown={(e) => e.key === "Enter" && load(src)} />
    <button onclick={() => load(src)}>Load</button>
    <span class="hint">{status}</span>
  </div>

  <div class="stage">
    <canvas bind:this={canvas}></canvas>
  </div>

  <div class="scrub">
    <button onclick={() => show(0)} title="Home">⏮</button>
    <button onclick={() => show(idx - 1)} title="prev (←)">◀</button>
    <input
      class="slider"
      type="range"
      min="0"
      max={Math.max(0, total - 1)}
      value={idx}
      oninput={(e) => show(+(e.currentTarget as HTMLInputElement).value)}
    />
    <button onclick={() => show(idx + 1)} title="next (→)">▶</button>
    <button onclick={() => show(total - 1)} title="End">⏭</button>
    <span class="counter">#{idx} / {Math.max(0, total - 1)}</span>
    <span class="tcode">{tSec.toFixed(3)}s</span>
    <label class="jump">
      go
      <input
        type="text"
        inputmode="numeric"
        bind:value={jump}
        onkeydown={(e) => { if (e.key === "Enter") show(+jump); }}
      />
    </label>
  </div>
  <div class="keys">← / → one frame · PgUp / PgDn ±10 · Home / End · drag the slider to scrub · type a number + Enter to jump</div>
</div>

<style>
  .wrap { height: 100dvh; display: flex; flex-direction: column; background: #07090c; color: #e7eef3; font: 14px system-ui, sans-serif; }
  .bar { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.8rem; background: #0d1116; border-bottom: 1px solid #1c2530; flex: none; flex-wrap: wrap; }
  .src { flex: 1; min-width: 300px; background: #11161c; border: 1px solid #263041; color: #cfe6f2; border-radius: 6px; padding: 0.3rem 0.5rem; font: 12px monospace; }
  .hint { color: #6b7a88; font-size: 12px; }
  .stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 0.5rem; }
  canvas { max-width: 100%; max-height: 100%; object-fit: contain; background: #000; border: 1px solid #1c2530; }

  .scrub { flex: none; display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.9rem; background: #0d1116; border-top: 1px solid #1c2530; }
  .slider { flex: 1; height: 28px; cursor: pointer; accent-color: #7fd6ef; }
  button { background: #1d6f86; border: 1px solid #7fd6ef; color: #fff; border-radius: 6px; padding: 0.35rem 0.7rem; cursor: pointer; font-weight: 700; font-size: 15px; line-height: 1; }
  button:hover { background: #2487a3; }
  .counter { font: 700 15px monospace; color: #7fd6ef; font-variant-numeric: tabular-nums; min-width: 11ch; text-align: right; }
  .tcode { font: 600 13px monospace; color: #9fb2bd; font-variant-numeric: tabular-nums; min-width: 8ch; }
  .jump { display: flex; align-items: center; gap: 0.3rem; font-size: 12px; color: #9fb2bd; }
  .jump input { width: 5ch; background: #11161c; border: 1px solid #263041; color: #cfe6f2; border-radius: 5px; padding: 0.25rem 0.4rem; font: 13px monospace; text-align: center; }
  .keys { flex: none; padding: 0.35rem 0.9rem 0.6rem; color: #64748b; font-size: 12px; background: #0d1116; }

  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .wrap {
    border-top: var(--safe-top) solid transparent;
  }
</style>
