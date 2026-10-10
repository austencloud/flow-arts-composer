<!--
  Tunnel View — knobs-forward judge harness (throwaway).

  Drives the Tunnel View concept the way the real feature would: one sequence
  overlaid with rotated (and optionally mirrored) copies of itself on a single
  AnimatorCanvas via additionalLayers, rendering a chosen prop. Knobs first —
  play with fold / mirror / effect / speed, TUNE the active effect with the real
  per-effect panels, then SAVE the look as a named preset (localStorage).

  Design note (2026-06-20): Tunnel View is a MODE inside the 2D animation pane
  (AnimationPlayer), not a new viewer pane. This harness validates the rendering
  + tuning that mode will own.

  Real components only: generationOrchestrator + rotateSequence + mirrorSequence
  + AnimatorCanvas + the real effects-panel customize/settings components, driven
  by an ISOLATED effects config (persist:false → never touches the user's global
  tka_effects_config). Not feature code — a visual de-risk + interaction judge.

  Fold math: TKA grid = 8 points (45° steps). rotateSequence only lands on 45°
  multiples, so valid rotational folds are 2 (180°), 4 (90°), 8 (45°). 3/6-fold
  are not grid-representable. Mirror adds the dihedral reflections.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Component } from "svelte";
  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import type { AdditionalLayerProps } from "#lib/shared/animation-engine/domain/types/trail-capture-types.js";
  import { interpolatePropAngles } from "#lib/shared/animation-engine/services/prop-interpolator.js";
  import { rotateSequence, mirrorSequence } from "#lib/shared/create/services/sequence-transforms.js";
  import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";
  import { generationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { EffectType, TipEffectMap } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";

  // Isolated effects config + the real per-effect tuning panels.
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import FirePanel from "#lib/shared/animation-engine/components/settings-panels/FirePanel.svelte";
  import CharcoalPanel from "#lib/shared/animation-engine/components/settings-panels/CharcoalPanel.svelte";
  import LedCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/LedCustomize.svelte";
  import TrailsPanel from "#lib/shared/animation-engine/components/settings-panels/TrailsPanel.svelte";
  import ZapCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/ZapCustomize.svelte";
  import SparklesCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/SparklesCustomize.svelte";
  import GhostCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/GhostCustomize.svelte";
  import BloomCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/BloomCustomize.svelte";
  import GooCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/GooCustomize.svelte";
  import BubblesCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/BubblesCustomize.svelte";
  import PetalsCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/PetalsCustomize.svelte";
  import SmokeCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/SmokeCustomize.svelte";
  import InkCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/InkCustomize.svelte";
  import FrostCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/FrostCustomize.svelte";
  import SilkCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/SilkCustomize.svelte";
  import PulseCustomize from "#lib/shared/animation-engine/components/effects-panel/customize/PulseCustomize.svelte";

  const DEFAULT_PROP_STATE: PropState = { centerPathAngle: 0, staffRotationAngle: 0 };
  const PRESETS_KEY = "tka_tunnel_test_presets";

  type Fold = 2 | 4 | 8;

  // Isolated effects config — persist:false keeps it off the shared global key.
  const effectsConfig = createEffectsConfigState(undefined, { persist: false });
  setEffectsConfigContext(effectsConfig);

  let propType = $state<PropType>(PropType.SWORD);
  let fold = $state<Fold>(4);
  let mirror = $state(false);
  let activeEffect = $state<EffectType>("none");
  let speed = $state(0.3); // beats per second — validated 4-fold cadence
  let isPlaying = $state(true);
  let showGrid = $state(true);
  let status = $state("loading…");
  let errorMsg = $state<string | null>(null);
  let layerCount = $state(1);

  const propChoices: { type: PropType; label: string }[] = [
    { type: PropType.SWORD, label: "Sword" },
    { type: PropType.CHICKEN, label: "Chicken" },
    { type: PropType.DOUBLESTAR, label: "Doublestar" },
    { type: PropType.TRIQUETRA, label: "Triquetra" },
    { type: PropType.EIGHTRINGS, label: "Eightrings" },
    { type: PropType.TORCH, label: "Torch" },
    { type: PropType.BUUGENG, label: "Buugeng" },
    { type: PropType.STAFF, label: "Staff" },
    { type: PropType.BIGSTAFF, label: "Big Staff" },
  ];

  const folds: Fold[] = [2, 4, 8];

  const effectChoices: EffectType[] = [
    "none", "fire", "charcoal", "led", "trails", "zap", "sparkles", "ghost",
    "bloom", "goo", "bubbles", "petals", "smoke", "ink", "frost", "silk", "pulse",
  ];

  const tipEffectMap = $derived<TipEffectMap | undefined>(
    activeEffect === "none" ? undefined : { "*": { effect: activeEffect } },
  );

  // Active effect → its real tuning panel. Settings-panels (fire/charcoal/led/
  // trails) take no onBack; the customize views take an onBack (noop here).
  type PanelEntry = { comp: Component<any>; needsBack: boolean };
  const EFFECT_PANELS: Record<string, PanelEntry> = {
    fire: { comp: FirePanel, needsBack: false },
    charcoal: { comp: CharcoalPanel, needsBack: false },
    led: { comp: LedCustomize, needsBack: true },
    trails: { comp: TrailsPanel, needsBack: false },
    zap: { comp: ZapCustomize, needsBack: true },
    sparkles: { comp: SparklesCustomize, needsBack: true },
    ghost: { comp: GhostCustomize, needsBack: false },
    bloom: { comp: BloomCustomize, needsBack: true },
    goo: { comp: GooCustomize, needsBack: true },
    bubbles: { comp: BubblesCustomize, needsBack: true },
    petals: { comp: PetalsCustomize, needsBack: true },
    smoke: { comp: SmokeCustomize, needsBack: true },
    ink: { comp: InkCustomize, needsBack: true },
    frost: { comp: FrostCustomize, needsBack: true },
    silk: { comp: SilkCustomize, needsBack: true },
    pulse: { comp: PulseCustomize, needsBack: true },
  };
  const activePanel = $derived(activeEffect === "none" ? null : EFFECT_PANELS[activeEffect] ?? null);
  const noBack = () => {};

  let base = $state<SequenceData | null>(null);
  let rotated = $state<SequenceData[]>([]); // additional layers beyond base
  let playheadBeat = $state(0);

  function rotAmountsFor(f: Fold): number[] {
    if (f === 8) return [1, 2, 3, 4, 5, 6, 7]; // 45° steps
    if (f === 4) return [2, 4, 6]; // 90 / 180 / 270
    return [4]; // 180 only
  }

  async function buildSequences() {
    status = "generating sequence…";
    errorMsg = null;
    base = null;
    rotated = [];
    try {
      const seq = await generationOrchestrator.generateSequence({
        length: 8,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF, // generation prop irrelevant; render prop is separate
        difficulty: DifficultyLevel.INTERMEDIATE,
        constraintPreset: "smooth",
      });
      status = "building tunnel layers…";

      const amounts = rotAmountsFor(fold);
      const rotExtras = await Promise.all(
        amounts.map((amt) => rotateSequence(seq, amt, motionQueryHandler)),
      );
      const layers: SequenceData[] = [...rotExtras];

      if (mirror) {
        // Reflect the whole rotational stack (base + extras) for dihedral symmetry.
        const mirroredBase = await mirrorSequence(seq, motionQueryHandler);
        const mirroredExtras = await Promise.all(
          rotExtras.map((r) => mirrorSequence(r, motionQueryHandler)),
        );
        layers.push(mirroredBase, ...mirroredExtras);
      }

      base = seq;
      rotated = layers;
      layerCount = layers.length + 1;
      playheadBeat = 0;
      status = `tunnel ready · ${layerCount} layers · ${fold}-fold${mirror ? " + mirror" : ""} · ${seq.steps.length} steps`;
    } catch (e) {
      errorMsg = String(e instanceof Error ? (e.stack ?? e.message) : e);
      status = "error";
    }
  }

  // Rebuild only when the layer topology changes (fold or mirror). Prop / effect
  // / speed are instant — no regeneration.
  let lastTopo = "";
  $effect(() => {
    const topo = `${fold}|${mirror}`;
    if (topo !== lastTopo) {
      lastTopo = topo;
      void buildSequences();
    }
  });

  onMount(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (isPlaying && base && base.steps.length > 0) {
        playheadBeat = (playheadBeat + dt * speed) % base.steps.length;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  // ── Per-layer prop derivation at the shared playhead ────────
  type LayerProps = { left: PropState; right: PropState; step: StepData | null; stepOneBased: number };

  function propsFor(seq: SequenceData | null): LayerProps {
    if (!seq || seq.steps.length === 0) {
      return { left: { ...DEFAULT_PROP_STATE }, right: { ...DEFAULT_PROP_STATE }, step: null, stepOneBased: 1 };
    }
    const n = seq.steps.length;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(playheadBeat)));
    const progress = Math.max(0, Math.min(0.9999, playheadBeat - Math.floor(playheadBeat)));
    const step = seq.steps[idx] ?? null;
    if (!step) {
      return { left: { ...DEFAULT_PROP_STATE }, right: { ...DEFAULT_PROP_STATE }, step: null, stepOneBased: idx + 1 };
    }
    const r = interpolatePropAngles(step, progress);
    return {
      left: r.isValid ? (r.leftAngles ?? { ...DEFAULT_PROP_STATE }) : { ...DEFAULT_PROP_STATE },
      right: r.isValid ? (r.rightAngles ?? { ...DEFAULT_PROP_STATE }) : { ...DEFAULT_PROP_STATE },
      step,
      stepOneBased: idx + 1,
    };
  }

  const baseLayer = $derived(propsFor(base));
  const additionalLayers = $derived<AdditionalLayerProps[]>(
    rotated.map((seq) => {
      const p = propsFor(seq);
      return { leftProp: p.left, rightProp: p.right };
    }),
  );
  const propTypeStr = $derived(String(propType));
  const gridMode = $derived(base?.gridMode ?? GridMode.DIAMOND);

  // ── Save-your-own presets ───────────────────────────────────
  type TunnelPreset = {
    id: string;
    name: string;
    config: {
      fold: Fold;
      mirror: boolean;
      effect: EffectType;
      speed: number;
      propType: PropType;
      // Snapshot of the active effect's full tuning (intent object). Optional —
      // older saved presets / the "none" effect have none.
      effectConfig?: Record<string, unknown>;
    };
  };

  let presets = $state<TunnelPreset[]>([]);
  let newName = $state("");

  function loadPresets() {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      presets = raw ? (JSON.parse(raw) as TunnelPreset[]) : [];
    } catch {
      presets = [];
    }
  }
  function persistPresets() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  }
  function savePreset() {
    const name = newName.trim() || `Look ${presets.length + 1}`;
    const effectConfig =
      activeEffect === "none"
        ? undefined
        : ($state.snapshot((effectsConfig as unknown as Record<string, unknown>)[activeEffect]) as Record<string, unknown>);
    const preset: TunnelPreset = {
      id: `${name}-${presets.length}-${Math.floor(performance.now())}`,
      name,
      config: { fold, mirror, effect: activeEffect, speed, propType, effectConfig },
    };
    presets = [...presets, preset];
    persistPresets();
    newName = "";
  }
  function applyPreset(p: TunnelPreset) {
    propType = p.config.propType;
    activeEffect = p.config.effect;
    speed = p.config.speed;
    if (p.config.effect !== "none" && p.config.effectConfig) {
      // Restore the effect's full tuning into the isolated config.
      effectsConfig.updateEffect(
        p.config.effect as Parameters<typeof effectsConfig.updateEffect>[0],
        p.config.effectConfig as Parameters<typeof effectsConfig.updateEffect>[1],
      );
    }
    fold = p.config.fold; // change topo last so a single rebuild runs
    mirror = p.config.mirror;
  }
  function deletePreset(id: string) {
    presets = presets.filter((p) => p.id !== id);
    persistPresets();
  }

  onMount(loadPresets);
</script>

<div class="page">
  <header>
    <h1>Tunnel View — knobs judge</h1>
    <p class="sub">
      Play with the knobs, tune the effect, save the look. {layerCount} layers ·
      {fold}-fold{mirror ? " + mirror" : ""}.
    </p>
  </header>

  <div class="controls">
    <div class="group">
      <span class="lbl">Prop</span>
      <div class="row">
        {#each propChoices as c (c.type)}
          <button class:active={propType === c.type} onclick={() => (propType = c.type)}>{c.label}</button>
        {/each}
      </div>
    </div>

    <div class="group">
      <span class="lbl">Fold</span>
      <div class="row">
        {#each folds as f (f)}
          <button class:active={fold === f} onclick={() => (fold = f)}>{f}×</button>
        {/each}
        <button class:active={mirror} onclick={() => (mirror = !mirror)}>Mirror</button>
      </div>
    </div>

    <div class="group">
      <span class="lbl">Speed</span>
      <input type="range" min="0.1" max="2.5" step="0.1" bind:value={speed} />
      <span class="val">{speed.toFixed(1)}</span>
    </div>

    <div class="group">
      <button class:active={isPlaying} onclick={() => (isPlaying = !isPlaying)}>{isPlaying ? "Pause" : "Play"}</button>
      <button class:active={showGrid} onclick={() => (showGrid = !showGrid)}>Grid</button>
      <button onclick={() => void buildSequences()}>Regenerate</button>
    </div>
  </div>

  <div class="group effects">
    <span class="lbl">Effect</span>
    <div class="row">
      {#each effectChoices as e (e)}
        <button class:active={activeEffect === e} onclick={() => (activeEffect = e)}>{e}</button>
      {/each}
    </div>
  </div>
  <p class="note">
    Effects blanket every overlaid layer (tip-tracker + LED + trails). Pick one,
    then tune it below with its real per-effect panel.
  </p>

  {#if activePanel}
    {@const Panel = activePanel.comp}
    <div class="effect-panel">
      {#if activePanel.needsBack}
        <Panel onBack={noBack} />
      {:else}
        <Panel />
      {/if}
    </div>
  {/if}

  <div class="stage">
    {#if base}
      <AnimatorCanvas
        leftProp={baseLayer.left}
        rightProp={baseLayer.right}
        {additionalLayers}
        leftPropType={propTypeStr}
        rightPropType={propTypeStr}
        sequenceData={base}
        stepData={baseLayer.step}
        currentStep={baseLayer.stepOneBased}
        {isPlaying}
        {gridMode}
        {tipEffectMap}
        effectsConfigState={effectsConfig}
        gridVisible={showGrid}
        hideHeader={true}
        hideProgressBar={true}
        hideTkaGlyph={true}
        hideStepNumbers={true}
        fillContainer={true}
        fireConfig={{ disableFrameCache: true }}
      />
    {:else}
      <div class="placeholder">{status}</div>
    {/if}
  </div>

  <div class="presets">
    <div class="save-row">
      <input
        class="name-input"
        type="text"
        placeholder="name this look…"
        bind:value={newName}
        onkeydown={(e) => { if (e.key === "Enter") savePreset(); }}
      />
      <button class="save" onclick={savePreset}>Save preset</button>
    </div>
    {#if presets.length > 0}
      <div class="chips">
        {#each presets as p (p.id)}
          <div class="chip">
            <button class="chip-apply" onclick={() => applyPreset(p)} title={`${p.config.fold}× ${p.config.mirror ? "mirror " : ""}${p.config.effect}`}>
              {p.name}
            </button>
            <button class="chip-del" aria-label={`Delete ${p.name}`} onclick={() => deletePreset(p.id)}>×</button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="note">No saved looks yet. Tune the knobs and hit Save.</p>
    {/if}
  </div>

  <div class="status">{status}</div>
  {#if errorMsg}
    <pre class="err">{errorMsg}</pre>
  {/if}
</div>

<style>
  .page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 20px;
    background: radial-gradient(circle at 50% 30%, #14141f 0%, #0a0a0f 70%);
    color: #e8e8f0;
    font-family: system-ui, sans-serif;
  }
  header { text-align: center; }
  h1 { margin: 0; font-size: 1.4rem; }
  .sub { margin: 4px 0 0; opacity: 0.6; font-size: 0.85rem; }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    justify-content: center;
    align-items: center;
  }
  .group { display: flex; align-items: center; gap: 8px; }
  .group.effects { flex-direction: column; gap: 6px; max-width: 760px; }
  .lbl { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.5; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
  .val { font-variant-numeric: tabular-nums; width: 2.2ch; opacity: 0.7; }
  .note { margin: 0; max-width: 720px; text-align: center; font-size: 0.72rem; opacity: 0.5; }

  /* Hosts the real per-effect tuning panel. The panel brings its own
     theme-token styling (with fallbacks), so just give it a constrained card. */
  .effect-panel {
    width: min(560px, 100%);
    padding: 14px 16px;
    border: 1px solid rgba(150 120 240 / 0.3);
    border-radius: 12px;
    background: rgba(20 20 30 / 0.6);
  }

  button {
    background: rgba(255 255 255 / 0.06);
    border: 1px solid rgba(255 255 255 / 0.12);
    color: inherit;
    padding: 7px 12px;
    border-radius: 9px;
    font-size: 0.82rem;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, transform 0.12s;
  }
  button:hover { background: rgba(255 255 255 / 0.12); }
  button:active { transform: scale(0.96); }
  button.active {
    background: linear-gradient(135deg, #6d5ef0, #b14ddb);
    border-color: transparent;
    color: #fff;
  }

  .stage {
    width: min(72vmin, 620px);
    aspect-ratio: 1 / 1;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(255 255 255 / 0.1);
    background: #07070b;
    box-shadow: 0 20px 60px rgba(0 0 0 / 0.5);
  }
  .placeholder {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    opacity: 0.5;
    font-size: 0.9rem;
  }

  .presets {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: min(760px, 100%);
  }
  .save-row { display: flex; gap: 8px; align-items: center; }
  .name-input {
    background: rgba(255 255 255 / 0.06);
    border: 1px solid rgba(255 255 255 / 0.14);
    color: inherit;
    padding: 7px 12px;
    border-radius: 9px;
    font-size: 0.82rem;
    width: 200px;
  }
  .name-input:focus-visible { outline: 2px solid #8a6cf0; outline-offset: 1px; }
  .save { background: rgba(150 120 240 / 0.18); border-color: rgba(150 120 240 / 0.5); }
  .save:hover { background: rgba(150 120 240 / 0.3); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .chip {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid rgba(150 120 240 / 0.4);
    border-radius: 999px;
    overflow: hidden;
    background: rgba(150 120 240 / 0.12);
  }
  .chip-apply { border: none; border-radius: 0; background: transparent; padding: 6px 12px; }
  .chip-apply:hover { background: rgba(150 120 240 / 0.25); }
  .chip-del {
    border: none;
    border-radius: 0;
    background: transparent;
    padding: 6px 10px;
    opacity: 0.6;
    font-size: 1rem;
    line-height: 1;
  }
  .chip-del:hover { background: rgba(220 60 60 / 0.3); opacity: 1; }

  .status { font-size: 0.8rem; opacity: 0.6; font-variant-numeric: tabular-nums; text-align: center; }
  .err {
    max-width: 760px;
    white-space: pre-wrap;
    background: rgba(220 60 60 / 0.12);
    border: 1px solid rgba(220 60 60 / 0.4);
    color: #ffb4b4;
    padding: 12px;
    border-radius: 10px;
    font-size: 0.72rem;
  }
</style>
