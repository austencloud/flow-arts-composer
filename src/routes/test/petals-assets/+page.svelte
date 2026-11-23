<!--
  /test/petals-assets

  Style bake-off for the raster petal-asset upgrade (Plan B). Three art
  styles, each fed a petal + leaf PNG you generate in ChatGPT and drop into
  static/petal-assets/test/. The same synthetic two-prop motion drives all
  three so you compare the LOOK in-context (real airstream motion, real
  props), not in isolation.

  Drop files (transparent PNG) here, then refresh:
    static/petal-assets/test/painterly-petal.png
    static/petal-assets/test/painterly-leaf.png
    static/petal-assets/test/photoreal-petal.png
    static/petal-assets/test/photoreal-leaf.png
    static/petal-assets/test/pressed-petal.png
    static/petal-assets/test/pressed-leaf.png

  Disposable test route.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  const RES = 520;
  const TAU = Math.PI * 2;

  interface Style { id: string; title: string; petal: string; leaf: string; }
  const STYLES: Style[] = [
    { id: "painterly", title: "Painterly-realistic", petal: "/petal-assets/test/painterly-petal.png", leaf: "/petal-assets/test/painterly-leaf.png" },
    { id: "photoreal", title: "Photoreal cutout", petal: "/petal-assets/test/photoreal-petal.png", leaf: "/petal-assets/test/photoreal-leaf.png" },
    { id: "pressed", title: "Pressed-botanical", petal: "/petal-assets/test/pressed-petal.png", leaf: "/petal-assets/test/pressed-leaf.png" },
  ];

  let playing = $state(true);
  let baseSize = $state(22);
  let density = $state(1.0);

  // ── Image loading (per URL) ──────────────────────────────────────────
  type ImgState = { img: HTMLImageElement | null; ok: boolean };
  const imgCache = new Map<string, ImgState>();
  function getImg(url: string): ImgState {
    let st = imgCache.get(url);
    if (st) return st;
    st = { img: null, ok: false };
    if (typeof Image === "undefined") return st; // SSR: no image loading
    imgCache.set(url, st);
    const im = new Image();
    im.onload = () => { st!.img = im; st!.ok = true; };
    im.onerror = () => { st!.ok = false; };
    im.src = url;
    return st;
  }

  // ── Sprite emitter (airstream, per cell) ─────────────────────────────
  interface Sprite { x:number;y:number;vx:number;vy:number;age:number;maxAge:number;size:number;rot:number;freq:number;phase:number;leaf:boolean; }
  type TipMap = Record<"blueA"|"blueB"|"redA"|"redB", {x:number;y:number}|null>;
  const KEYS = ["blueA","blueB","redA","redB"] as const;

  class Emitter {
    pool: Sprite[] = [];
    last: Record<string,{x:number;y:number}|undefined> = {};
    sv: Record<string,{vx:number;vy:number}|undefined> = {};
    clock = 0;
    render(ctx: CanvasRenderingContext2D, tips: TipMap, dt: number, petal: ImgState, leaf: ImgState) {
      this.clock += dt;
      for (const k of KEYS) {
        const tip = tips[k];
        if (!tip) { this.last[k] = undefined; this.sv[k] = undefined; continue; }
        const last = this.last[k];
        let vx = 0, vy = 0;
        if (last && dt > 0) { vx = (tip.x-last.x)/dt; vy = (tip.y-last.y)/dt; }
        const prev = this.sv[k];
        const a = 1 - Math.pow(0.6, dt*60);
        const svx = prev ? prev.vx+(vx-prev.vx)*a : vx;
        const svy = prev ? prev.vy+(vy-prev.vy)*a : vy;
        if (prev) { prev.vx=svx; prev.vy=svy; } else this.sv[k] = {vx:svx,vy:svy};
        const sp = Math.hypot(svx, svy);
        this.spawn(tip, svx, svy, sp, dt);
        if (last) { last.x=tip.x; last.y=tip.y; } else this.last[k] = {x:tip.x,y:tip.y};
      }
      // integrate
      let w = 0;
      for (let i=0;i<this.pool.length;i++) {
        const p = this.pool[i]!;
        p.age += dt;
        if (p.age >= p.maxAge || p.y > RES+60) continue;
        p.vx *= Math.pow(0.32, dt);
        p.vy += (90 - p.vy) * (1 - Math.pow(0.25, dt));
        const flut = Math.sin(this.clock*p.freq + p.phase) * 16;
        p.x += (p.vx + flut) * dt;
        p.y += p.vy * dt;
        p.rot += (p.vx*0.0016 + flut*0.02) * dt * 60;
        if (i!==w) this.pool[w] = p;
        w++;
      }
      this.pool.length = w;
      // draw
      for (const p of this.pool) {
        const lifeT = p.age / p.maxAge;
        const fIn = p.age < 0.12 ? p.age/0.12 : 1;
        const fOut = lifeT > 0.75 ? (1-lifeT)/0.25 : 1;
        const alpha = Math.max(0, fIn*fOut);
        if (alpha <= 0.02) continue;
        const src = p.leaf ? leaf : petal;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (src.ok && src.img) {
          const s = p.size * 2;
          ctx.drawImage(src.img, -s/2, -s/2, s, s);
        } else {
          // placeholder dot until the asset is dropped in
          ctx.fillStyle = p.leaf ? "rgba(80,180,90,0.6)" : "rgba(255,150,190,0.6)";
          ctx.beginPath(); ctx.arc(0,0,p.size*0.5,0,TAU); ctx.fill();
        }
        ctx.restore();
      }
    }
    spawn(tip:{x:number;y:number}, svx:number, svy:number, sp:number, dt:number) {
      if (this.pool.length >= 1200) return;
      const scalar = Math.min(1, sp/650);
      const expected = (2 + 30*scalar) * density * dt;
      let n = Math.floor(expected); if (Math.random() < expected-n) n++;
      for (let i=0;i<n;i++) {
        this.pool.push({
          x: tip.x + (Math.random()-0.5)*8,
          y: tip.y + (Math.random()-0.5)*6,
          vx: svx*0.72 + (Math.random()-0.5)*40,
          vy: svy*0.72 + 10 + Math.random()*20,
          age: 0, maxAge: (1.0 + 0.7) * (0.8 + Math.random()*0.5),
          size: baseSize * (0.7 + Math.random()*0.6),
          rot: Math.random()*TAU, freq: 1.4 + Math.random()*2.6, phase: Math.random()*TAU,
          leaf: Math.random() < 0.5,
        });
      }
    }
    dispose() { this.pool = []; this.last = {}; this.sv = {}; this.clock = 0; }
  }

  const emitters = STYLES.map(() => new Emitter());
  let canvases: (HTMLCanvasElement|null)[] = $state(Array(STYLES.length).fill(null));

  let clock = 0, lastT = 0, raf = 0;

  function tipsAt(t:number): TipMap {
    const W=RES,H=RES, cx=W/2, cy=H/2, handR=Math.min(W,H)*0.12, staffR=Math.min(W,H)*0.2;
    const bh = { x: W*0.34 + Math.cos(t*1.1)*handR, y: cy + Math.sin(t*1.1)*handR };
    const rh = { x: W*0.66 + Math.cos(-t*1.1+Math.PI)*handR, y: cy + Math.sin(-t*1.1)*handR };
    const bang = t*3.0, rang = -t*3.0 + Math.PI/2;
    return {
      blueA: { x: bh.x+Math.cos(bang)*staffR, y: bh.y+Math.sin(bang)*staffR },
      blueB: { x: bh.x-Math.cos(bang)*staffR, y: bh.y-Math.sin(bang)*staffR },
      redA: { x: rh.x+Math.cos(rang)*staffR, y: rh.y+Math.sin(rang)*staffR },
      redB: { x: rh.x-Math.cos(rang)*staffR, y: rh.y-Math.sin(rang)*staffR },
    };
  }
  function drawStaff(ctx:CanvasRenderingContext2D, a:{x:number;y:number}, b:{x:number;y:number}, color:string) {
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=3; ctx.lineCap="round"; ctx.globalAlpha=0.55;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); ctx.restore();
  }

  function frame(now:number) {
    raf = requestAnimationFrame(frame);
    if (lastT===0) lastT = now;
    let dt = (now-lastT)/1000; lastT = now;
    if (dt > 0.05) dt = 0.05;
    if (playing) clock += dt;
    const tips = tipsAt(clock);
    for (let i=0;i<STYLES.length;i++) {
      const c = canvases[i]; if (!c) continue;
      const ctx = c.getContext("2d"); if (!ctx) continue;
      ctx.clearRect(0,0,RES,RES);
      drawStaff(ctx, tips.blueA!, tips.blueB!, "#5b8cff");
      drawStaff(ctx, tips.redA!, tips.redB!, "#ff5b6e");
      emitters[i]!.render(ctx, tips, playing?dt:0, getImg(STYLES[i]!.petal), getImg(STYLES[i]!.leaf));
    }
  }

  onMount(() => { raf = requestAnimationFrame(frame); });
  onDestroy(() => { if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(raf); emitters.forEach(e=>e.dispose()); });

  function imgStatus(s: Style) {
    const p = getImg(s.petal), l = getImg(s.leaf);
    return { petal: p.ok, leaf: l.ok };
  }
</script>

<div class="page">
  <header>
    <h1>Petal asset style bake-off</h1>
    <p class="sub">
      Generate the 6 test PNGs in ChatGPT (transparent background), drop them in
      <code>static/petal-assets/test/</code> with the exact names below, refresh.
      Pink dots = petal asset missing, green dots = leaf asset missing.
    </p>
  </header>

  <div class="controls">
    <button class="seg" aria-pressed={playing} onclick={() => (playing=!playing)}>{playing?"❚❚ Pause":"▶ Play"}</button>
    <button class="seg" onclick={() => emitters.forEach(e=>e.dispose())}>↺ Reset</button>
    <label class="slider">Size <b>{baseSize}px</b><input type="range" min="8" max="40" step="1" bind:value={baseSize} /></label>
    <label class="slider">Density <b>{density.toFixed(1)}×</b><input type="range" min="0.2" max="3" step="0.1" bind:value={density} /></label>
  </div>

  <div class="grid">
    {#each STYLES as s, i}
      {@const st = imgStatus(s)}
      <figure class="cell">
        <figcaption>
          <span class="title">{s.title}</span>
          <span class="status" class:ok={st.petal && st.leaf}>
            {st.petal ? "✓ petal" : "○ petal"} · {st.leaf ? "✓ leaf" : "○ leaf"}
          </span>
        </figcaption>
        <canvas bind:this={canvases[i]} width={RES} height={RES} aria-label={s.title}></canvas>
      </figure>
    {/each}
  </div>
</div>

<style>
  .page { min-height:100vh; background:#0a0a0f; color:#e8e8ef; padding:20px; font-family:system-ui,sans-serif; }
  header h1 { margin:0 0 4px; font-size:22px; font-weight:700; }
  .sub { margin:0 0 16px; max-width:760px; color:#a8a8b8; font-size:14px; line-height:1.5; }
  code { background:#1c1c26; padding:1px 6px; border-radius:5px; color:#ffb0c8; }
  .controls { display:flex; flex-wrap:wrap; gap:16px; align-items:center; padding:12px 14px; margin-bottom:18px; background:#14141c; border:1px solid rgba(255,255,255,0.08); border-radius:12px; }
  .seg { min-height:36px; padding:6px 12px; border:1px solid rgba(255,255,255,0.14); border-radius:8px; background:transparent; color:#d8d8e2; font-size:13px; cursor:pointer; }
  .seg[aria-pressed="true"] { background:rgba(123,140,255,0.18); border-color:#7b8cff; color:#fff; }
  .slider { display:flex; align-items:center; gap:8px; font-size:12px; color:#9a9aac; text-transform:uppercase; letter-spacing:0.04em; }
  .slider b { color:#fff; font-variant-numeric:tabular-nums; }
  input[type="range"] { width:140px; accent-color:#ffb0c8; }
  .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  @media (max-width: 1100px) { .grid { grid-template-columns:1fr; } }
  .cell { margin:0; background:#101018; border:1px solid rgba(255,255,255,0.08); border-radius:12px; overflow:hidden; }
  figcaption { display:flex; justify-content:space-between; align-items:baseline; padding:10px 12px 8px; }
  .title { font-size:14px; font-weight:600; color:#fff; }
  .status { font-size:11px; color:#c87; font-variant-numeric:tabular-nums; }
  .status.ok { color:#6c6; }
  canvas { display:block; width:100%; aspect-ratio:1/1; background:radial-gradient(circle at 50% 40%, #181826, #0c0c12); }
  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .page {
    border-top: var(--safe-top) solid transparent;
  }
</style>
