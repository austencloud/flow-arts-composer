<!--
  Hand Tunnel toy.

  Several performers stacked in one wall plane, each running a timing-and-
  direction hand path, drawn as hands only on one AnimatorCanvas. Every TnD is
  a closed four-beat loop, so one shared playhead drives all of them; the
  performers differ only in which loop they run and how it sits on the grid
  (rotate, mirror, flip, phase).

  Built for Ryan's 2026-09-11 ask: see two mirrored split-opps stacked against
  a tog-opp, then change any performer's TnD and placement and watch the
  composite. Same rendering owners as /test/prop-tunnel; the geometry comes
  from the canonical hand-path reference cards via
  $lib/features/lab/hand-tunnel. /test/hand-tunnel wraps this same component
  for dev.

  State lives in localStorage and, on Share, in the URL hash so a formation
  can be sent as a link.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import type { AdditionalLayerProps } from "$lib/shared/animation-engine/domain/types/trail-capture-types";
  import { interpolatePropAngles } from "$lib/shared/animation-engine/services/prop-interpolator";
  import { tunnelPropColor } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import {
    LOOP_BEATS,
    MAX_PERFORMERS,
    type Performer,
    type Segment,
  } from "$lib/features/lab/hand-tunnel/domain/hand-tunnel-types";
  import {
    HAND_TUNNEL_PRESETS,
    clonePerformers,
    presetById,
  } from "$lib/features/lab/hand-tunnel/domain/hand-tunnel-presets";
  import {
    buildPerformerSequence,
    cycleForSegment,
    describeHands,
  } from "$lib/features/lab/hand-tunnel/services/build-hand-tunnel-sequence";
  import PerformerCard from "./components/PerformerCard.svelte";

  const STORAGE_KEY = "tka_hand_tunnel_lab";
  const HASH_PREFIX = "#s=";
  const LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
  const DEFAULT_PROP_STATE: PropState = {
    centerPathAngle: 0,
    staffRotationAngle: 0,
  };

  interface SavedState {
    performers: Performer[];
    selectedId: string | null;
  }

  let performers = $state<Performer[]>(
    clonePerformers(presetById("ryan-trio").performers)
  );
  let selectedId = $state<string | null>(null);
  let playheadBeat = $state(0);
  let isPlaying = $state(true);
  let speed = $state(0.5); // beats per second
  let showGrid = $state(true);
  let shareNote = $state("");

  // ── Persistence ─────────────────────────────────────────────
  function encodeState(): string {
    const saved: SavedState = { performers, selectedId };
    return btoa(unescape(encodeURIComponent(JSON.stringify(saved))));
  }
  function decodeState(raw: string): SavedState | null {
    try {
      const parsed = JSON.parse(
        decodeURIComponent(escape(atob(raw)))
      ) as SavedState;
      if (!Array.isArray(parsed.performers) || parsed.performers.length === 0)
        return null;
      return parsed;
    } catch {
      return null;
    }
  }
  function applySaved(saved: SavedState) {
    performers = relabel(
      clonePerformers(saved.performers.slice(0, MAX_PERFORMERS))
    );
    selectedId = performers.some((p) => p.id === saved.selectedId)
      ? saved.selectedId
      : null;
  }
  function persist() {
    if (typeof localStorage === "undefined") return;
    try {
      const saved: SavedState = { performers, selectedId };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      /* storage unavailable; the lab still works for the session */
    }
  }

  onMount(() => {
    const hash = window.location.hash;
    if (hash.startsWith(HASH_PREFIX)) {
      const fromHash = decodeState(hash.slice(HASH_PREFIX.length));
      if (fromHash) {
        applySaved(fromHash);
        return;
      }
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedState;
        if (Array.isArray(parsed.performers) && parsed.performers.length > 0) {
          applySaved(parsed);
        }
      }
    } catch {
      /* ignore a bad save and keep the default trio */
    }
  });

  $effect(() => {
    // Track the fields that matter so any edit persists.
    void performers.map((p) => p.segments[0]);
    void selectedId;
    persist();
  });

  // ── Lineup edits ────────────────────────────────────────────
  function relabel(list: Performer[]): Performer[] {
    return list.map((p, i) => ({ ...p, label: LABELS[i] ?? `P${i + 1}` }));
  }

  function updateSegment(id: string, patch: Partial<Segment>) {
    performers = performers.map((p) =>
      p.id === id
        ? {
            ...p,
            segments: [{ ...p.segments[0]!, ...patch }, ...p.segments.slice(1)],
          }
        : p
    );
  }

  function addPerformer() {
    if (performers.length >= MAX_PERFORMERS) return;
    const source =
      performers.find((p) => p.id === selectedId) ??
      performers[performers.length - 1];
    const seed: Segment = source
      ? { ...source.segments[0]! }
      : {
          fromBeat: 0,
          tnd: "to",
          rotation: 0,
          mirror: false,
          flip: false,
          phase: 0,
        };
    const id = `p${Date.now().toString(36)}`;
    performers = relabel([...performers, { id, label: "", segments: [seed] }]);
    selectedId = id;
  }

  function removePerformer(id: string) {
    if (performers.length <= 1) return;
    performers = relabel(performers.filter((p) => p.id !== id));
    if (selectedId === id) selectedId = null;
  }

  /** Spotlight one performer; click again to see everyone at full strength. */
  function toggleSelect(id: string) {
    selectedId = selectedId === id ? null : id;
  }

  function loadPreset(id: string) {
    applySaved({ performers: presetById(id).performers, selectedId: null });
    playheadBeat = 0;
    shareNote = "";
  }

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}${HASH_PREFIX}${encodeState()}`;
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      shareNote = "Link copied";
    } catch {
      shareNote = "Link is in the address bar";
    }
  }

  // ── Playback ────────────────────────────────────────────────
  onMount(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (isPlaying) playheadBeat = (playheadBeat + dt * speed) % LOOP_BEATS;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  function stepBeat(delta: number) {
    isPlaying = false;
    playheadBeat =
      (((Math.round(playheadBeat) + delta) % LOOP_BEATS) + LOOP_BEATS) %
      LOOP_BEATS;
  }

  // ── Derived geometry ────────────────────────────────────────
  const sequences = $derived(performers.map((p) => buildPerformerSequence(p)));
  const cycles = $derived(
    performers.map((p) => cycleForSegment(p.segments[0]!))
  );
  const beatIndex = $derived(
    Math.min(LOOP_BEATS - 1, Math.max(0, Math.floor(playheadBeat)))
  );
  const beatProgress = $derived(
    Math.max(0, Math.min(0.9999, playheadBeat - Math.floor(playheadBeat)))
  );
  const onBeat = $derived(
    Math.abs(playheadBeat - Math.round(playheadBeat)) < 0.02
  );

  type LayerProps = {
    left: PropState;
    right: PropState;
    step: StepData | null;
  };

  function layerFor(index: number): LayerProps {
    const seq = sequences[index];
    const step = seq?.steps[beatIndex] ?? null;
    if (!step) {
      return {
        left: { ...DEFAULT_PROP_STATE },
        right: { ...DEFAULT_PROP_STATE },
        step: null,
      };
    }
    const r = interpolatePropAngles(step, beatProgress);
    return {
      left: r.isValid
        ? (r.leftAngles ?? { ...DEFAULT_PROP_STATE })
        : { ...DEFAULT_PROP_STATE },
      right: r.isValid
        ? (r.rightAngles ?? { ...DEFAULT_PROP_STATE })
        : { ...DEFAULT_PROP_STATE },
      step,
    };
  }

  const baseLayer = $derived(layerFor(0));
  const additionalLayers = $derived<AdditionalLayerProps[]>(
    performers.slice(1).map((_, i) => {
      const p = layerFor(i + 1);
      return { leftProp: p.left, rightProp: p.right };
    })
  );
  const selectedIndex = $derived(
    performers.findIndex((p) => p.id === selectedId)
  );
  const layerCount = $derived(Math.max(0, performers.length - 1));

  function positionLabel(index: number): string {
    const cycle = cycles[index];
    if (!cycle) return "";
    if (!onBeat) return "moving";
    const k = Math.round(playheadBeat) % LOOP_BEATS;
    return describeHands(cycle.left[k]!, cycle.right[k]!);
  }

  const readout = $derived(
    performers.map((p, i) => `${p.label} ${positionLabel(i)}`).join("  ·  ")
  );
</script>

<div class="hand-tunnel-toy">
  <p class="sub">
    Stack up to {MAX_PERFORMERS} performers' hand paths in one plane. Pick a TnD per
    performer, then rotate, mirror, flip, or phase it.
  </p>

  <div class="toolbar">
    <div class="group">
      <span class="lbl">Preset</span>
      <div class="row">
        {#each HAND_TUNNEL_PRESETS as preset (preset.id)}
          <button
            onclick={() => loadPreset(preset.id)}
            title={preset.description}
          >
            {preset.name}
          </button>
        {/each}
      </div>
    </div>
    <div class="group">
      <button onclick={share}>Share link</button>
      {#if shareNote}<span class="note">{shareNote}</span>{/if}
    </div>
  </div>

  <div class="workspace">
    <div class="stage-col">
      <div class="stage">
        {#if sequences[0]}
          <AnimatorCanvas
            leftProp={baseLayer.left}
            rightProp={baseLayer.right}
            {additionalLayers}
            leftPropType="hand"
            rightPropType="hand"
            sequenceData={sequences[0]}
            stepData={baseLayer.step}
            currentStep={beatIndex + 1}
            {isPlaying}
            gridMode={GridMode.DIAMOND}
            gridVisible={showGrid}
            tunnelSpectrum={true}
            tunnelSelectedLayer={selectedIndex >= 0 ? selectedIndex : null}
            hideHeader={true}
            hideProgressBar={true}
            hideTkaGlyph={true}
            hideStepNumbers={true}
            fillContainer={true}
          />
        {/if}
      </div>

      <div class="transport">
        <button onclick={() => stepBeat(-1)} aria-label="Step back one beat"
          >◀</button
        >
        <button
          class="play"
          class:active={isPlaying}
          onclick={() => (isPlaying = !isPlaying)}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button onclick={() => stepBeat(1)} aria-label="Step forward one beat"
          >▶</button
        >
        <span class="beat"
          >beat {Math.floor(playheadBeat) + 1} / {LOOP_BEATS}</span
        >
        <label class="speed">
          <span class="lbl">Speed</span>
          <input type="range" min="0.1" max="2" step="0.1" bind:value={speed} />
          <span class="val">{speed.toFixed(1)}</span>
        </label>
        <button class:active={showGrid} onclick={() => (showGrid = !showGrid)}
          >Grid</button
        >
      </div>

      <div class="readout" aria-live="polite">{readout}</div>
    </div>

    <aside class="rail">
      {#each performers as performer, i (performer.id)}
        <PerformerCard
          {performer}
          cycle={cycles[i]!}
          leftColor={tunnelPropColor(2 * i, layerCount).hex}
          rightColor={tunnelPropColor(2 * i + 1, layerCount).hex}
          selected={performer.id === selectedId}
          positionLabel={positionLabel(i)}
          canRemove={performers.length > 1}
          onSelect={() => toggleSelect(performer.id)}
          onChange={(patch) => updateSegment(performer.id, patch)}
          onRemove={() => removePerformer(performer.id)}
        />
      {/each}
      {#if performers.length < MAX_PERFORMERS}
        <button class="add" onclick={addPerformer}>Add performer</button>
      {/if}
    </aside>
  </div>
</div>

<style>
  .hand-tunnel-toy {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
    overflow: auto;
    background: transparent;
    color: var(--theme-text, #e8e8f0);
  }
  .sub {
    margin: 0;
    text-align: center;
    color: var(--theme-text-dim, rgba(255 255 255 / 0.6));
    font-size: 0.85rem;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    justify-content: center;
    align-items: center;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .lbl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.5;
  }
  .row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .note {
    font-size: 0.75rem;
    opacity: 0.7;
  }

  button {
    background: var(--theme-panel-bg, rgba(255 255 255 / 0.06));
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.12));
    color: inherit;
    padding: 7px 12px;
    border-radius: 9px;
    font-size: 0.82rem;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      transform 0.12s;
  }
  button:hover {
    background: rgba(255 255 255 / 0.12);
  }
  button:active {
    transform: scale(0.96);
  }
  button.active {
    background: linear-gradient(135deg, #6d5ef0, #b14ddb);
    border-color: transparent;
    color: #fff;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 18px;
    align-items: start;
    width: min(1180px, 100%);
    margin: 0 auto;
  }
  @media (max-width: 860px) {
    .workspace {
      grid-template-columns: 1fr;
    }
  }

  .stage-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
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

  .transport {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .play {
    min-width: 76px;
  }
  .beat {
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
    opacity: 0.8;
  }
  .speed {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .val {
    font-variant-numeric: tabular-nums;
    width: 2.2ch;
    opacity: 0.7;
    font-size: 0.8rem;
  }

  .readout {
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
    text-align: center;
    min-height: 1.2em;
  }

  .rail {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .add {
    align-self: stretch;
  }
</style>
