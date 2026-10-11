<!--
  Tunnel Tuner Clarity — A/B judge rig.

  Two copies of the tuner share ONE TunnelConfig, so their Performer Ring + counts
  are identical; only the toggle treatment differs:
    · Solid  — FilterChipBase emphasis="solid": active chips fill accent, matching
               the Copies SegmentedControl indicator.
    · Ghost  — FilterChipBase default: active chips are a 15% accent wash.
  Both use the contrast-overhauled PerformerRing. One live kaleidoscope below
  reflects the shared config. Pick the winner, then port it to ArtSettingsPanel.
  Real components in a test page, per visualization-routing.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import LookCell from "../tunnel-looks/LookCell.svelte";
  import PerformerRing from "#lib/shared/sequence-viewer/tunnel/PerformerRing.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import {
    DEFAULT_CONFIG,
    FOLD_OPTIONS,
    imageCount,
    propCount,
    type TunnelConfig,
  } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
  import { generationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  let config = $state<TunnelConfig>({ ...DEFAULT_CONFIG });

  const performers = $derived(imageCount(config));
  const props = $derived(propCount(config));

  // Everything multiplies ONE base performer ("you"); only active (>×1) factors
  // show, so the count reads as a build-up: 1 → ×copies → ×mirror.
  const factors = $derived(
    [
      config.fold > 1 ? { x: config.fold, label: "copies" } : null,
      config.mirror ? { x: 2, label: "mirror" } : null,
      config.flip ? { x: 2, label: "flip" } : null,
    ].filter((f): f is { x: number; label: string } => f !== null),
  );

  const foldSegOptions = FOLD_OPTIONS.map((a) => ({ value: String(a), label: `×${a}` }));

  const twinChips = $derived([
    { key: "mirror", label: "Mirror ×2", icon: "fas fa-arrows-left-right", active: config.mirror, toggle: () => (config.mirror = !config.mirror) },
    { key: "flip", label: "Flip ×2", icon: "fas fa-arrows-up-down", active: config.flip, toggle: () => (config.flip = !config.flip) },
  ]);
  const motionChips = $derived([
    { key: "invert", label: "Invert", icon: "fas fa-arrows-spin", active: config.invert, toggle: () => (config.invert = !config.invert) },
    { key: "echo", label: "Echo", icon: "fas fa-backward", active: config.echo, toggle: () => (config.echo = !config.echo) },
  ]);

  // ── live render base + shared playhead (reused from the tunnel-looks rig) ──
  let base = $state<SequenceData | null>(null);
  let status = $state("generating sample sequence…");
  let errorMsg = $state<string | null>(null);
  let step = $state(1);
  const speed = 0.4;
  const propTypeStr = String(PropType.STAFF);
  const staggerMax = $derived(Math.max(0, (base?.steps?.length ?? 8) - 1));

  async function generate() {
    status = "generating sample sequence…";
    errorMsg = null;
    base = null;
    try {
      base = await generationOrchestrator.generateSequence({
        length: 8,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
        difficulty: DifficultyLevel.INTERMEDIATE,
        constraintPreset: "smooth",
      });
      status = `${base.steps.length}-step sample`;
    } catch (e) {
      errorMsg = String(e instanceof Error ? (e.stack ?? e.message) : e);
      status = "error";
    }
  }

  onMount(generate);
  onMount(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const n = base?.steps?.length ?? 0;
      if (n > 0) step = ((step - 1 + dt * speed) % n) + 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  function setStagger(v: number) {
    config.staggerSteps = Math.max(0, Math.min(staggerMax, v));
  }
</script>

{#snippet tuner(emphasis: "soft" | "solid", title: string)}
  <section class="tuner">
    <h2 class="variant">{title}</h2>

    <!-- Hero: the contrast-overhauled Performer Ring on a real card surface. -->
    <div class="hero">
      <div class="ring-seat">
        <PerformerRing {config} size={120} />
      </div>
      <p class="result">
        <span class="n big">{performers}</span> {performers === 1 ? "performer" : "performers"}
        <span class="mid">·</span>
        <span class="n">{props}</span> props
      </p>
      {#if factors.length}
        <p class="build">
          <span class="seed">1</span>
          {#each factors as f (f.label)}
            <span class="dim">×</span> {f.x} {f.label}
          {/each}
        </p>
      {:else}
        <p class="build">just you</p>
      {/if}
    </div>

    <div class="zone">
      <span class="zone-lbl">Copies <span class="hint">— of you</span></span>
      <div class="seg">
        <SegmentedControl
          options={foldSegOptions}
          value={String(config.fold)}
          onchange={(v) => (config.fold = Number(v))}
          color="accent"
          size="sm"
        />
      </div>
    </div>

    <div class="zone">
      <span class="zone-lbl">Add twins <span class="hint">— each doubles</span></span>
      <div class="chips">
        {#each twinChips as c (c.key)}
          <FilterChipBase mode="toggle" {emphasis} size="sm" label={c.label} icon={c.icon} active={c.active} onclick={c.toggle} />
        {/each}
      </div>
    </div>

    <div class="zone">
      <span class="zone-lbl">Motion <span class="hint">— same count</span></span>
      <div class="chips">
        {#each motionChips as c (c.key)}
          <FilterChipBase mode="toggle" {emphasis} size="sm" label={c.label} icon={c.icon} active={c.active} onclick={c.toggle} />
        {/each}
      </div>
      <div class="stagger">
        <span class="stagger-lbl">Stagger</span>
        <button type="button" disabled={config.staggerSteps <= 0} onclick={() => setStagger(config.staggerSteps - 1)} aria-label="Less stagger">−</button>
        <span class="stagger-val">{config.staggerSteps}</span>
        <button type="button" disabled={config.staggerSteps >= staggerMax} onclick={() => setStagger(config.staggerSteps + 1)} aria-label="More stagger">+</button>
      </div>
    </div>
  </section>
{/snippet}

<div class="page">
  <header>
    <h1>Tunnel Tuner — Solid vs Ghost toggles</h1>
    <p class="sub">
      Same config both sides. <b>Solid</b> = active chips fill accent (match Copies).
      <b>Ghost</b> = 15% wash. Toggle either — both mirror. · {status}
    </p>
  </header>

  <div class="stage">
    {@render tuner("solid", "Solid")}
    {@render tuner("soft", "Ghost")}
  </div>

  <section class="live">
    <span class="live-lbl">Live render — {props} props</span>
    {#if base}
      <div class="live-cell">
        <LookCell {base} {config} label={`${props} props`} {step} propType={propTypeStr} spectrum={true} grid={false} />
      </div>
    {:else if !errorMsg}
      <div class="ph">{status}</div>
    {/if}
    {#if errorMsg}
      <pre class="err">{errorMsg}</pre>
    {/if}
  </section>
</div>

<style>
  .page {
    min-height: 100dvh;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    background: radial-gradient(circle at 50% 15%, #14141f 0%, #0a0a0f 72%);
    color: #e8e8f0;
    font-family: system-ui, sans-serif;
  }
  header { text-align: center; }
  h1 { margin: 0; font-size: 1.3rem; }
  .sub { margin: 6px 0 0; opacity: 0.65; font-size: 0.82rem; max-width: 640px; }
  .sub b { color: #fff; }

  .stage {
    display: grid;
    grid-template-columns: repeat(2, minmax(280px, 340px));
    gap: 24px;
    align-items: start;
  }
  @media (max-width: 720px) {
    .stage { grid-template-columns: 1fr; }
  }

  .tuner {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 20px;
    border-radius: 16px;
    background: var(--theme-panel-bg, rgba(255 255 255 / 0.03));
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.1));
  }
  .variant {
    margin: 0;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    opacity: 0.55;
    text-align: center;
  }

  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  /* The contrast win: the schematic sits on a real card, not raw black. */
  .ring-seat {
    display: grid;
    place-items: center;
    padding: 12px;
    border-radius: 14px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.1));
  }
  .result {
    margin: 0;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .result .n { font-weight: 700; color: var(--theme-text, #fff); }
  .result .n.big { font-size: 1.35rem; color: var(--theme-accent, #c79bff); }
  .result .mid { opacity: 0.4; margin: 0 6px; }

  .build {
    margin: 0;
    font-size: 0.74rem;
    opacity: 0.5;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .build .seed { color: var(--theme-accent, #c79bff); font-weight: 700; }
  .build .dim { margin: 0 1px; }

  .zone { display: flex; flex-direction: column; gap: 8px; }
  .zone-lbl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    opacity: 0.6;
  }
  .zone-lbl .hint { text-transform: none; letter-spacing: 0; opacity: 0.7; }
  .seg { max-width: 240px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }

  .stagger { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
  .stagger-lbl { font-size: 0.8rem; opacity: 0.75; }
  .stagger button {
    width: 28px; height: 28px;
    border-radius: 8px;
    border: 1px solid rgba(255 255 255 / 0.15);
    background: rgba(255 255 255 / 0.06);
    color: inherit; cursor: pointer;
    font-size: 1rem; line-height: 1;
  }
  .stagger button:disabled { opacity: 0.3; cursor: default; }
  .stagger-val { font-variant-numeric: tabular-nums; width: 1.5ch; text-align: center; }

  .live {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    width: min(360px, 90vw);
  }
  .live-lbl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    opacity: 0.6;
  }
  .live-cell { width: 100%; }
  .ph { opacity: 0.5; padding: 40px; text-align: center; font-size: 0.85rem; }
  .err {
    white-space: pre-wrap;
    background: rgba(220 60 60 / 0.12);
    border: 1px solid rgba(220 60 60 / 0.4);
    color: #ffb4b4;
    padding: 10px; border-radius: 10px; font-size: 0.7rem;
  }
</style>
