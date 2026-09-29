<script lang="ts">
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import type { AdditionalLayerProps } from "$lib/shared/animation-engine/domain/types/trail-capture-types";
  import { interpolatePropAngles } from "$lib/shared/animation-engine/services/prop-interpolator";
  import { buildTunnelLayers } from "$lib/shared/sequence-viewer/tunnel/tunnel-layer-builder";
  import { DEFAULT_CONFIG } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
  import { getPropDemoLoop, generateFreshDemoLoop } from "../data/prop-demo-loop";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { EffectType, TipEffectMap } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { propCelebration, closePropCelebration } from "../state/prop-celebration-state.svelte";
  import { remainingLockedProps } from "../state/prop-collection-state.svelte";
  import { getPropUnlockManager } from "../get-prop-unlock-manager";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import { scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  const DEFAULT_PROP_STATE: PropState = { centerPathAngle: 0, staffRotationAngle: 0 };

  // Morph duration — every state change crossfades/scales rather than snapping.
  // Collapses to 0 under reduced-motion so the swap is instant but never jarring.
  function morphMs(): number {
    return typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 280;
  }

  let phase = $state<"pick" | "reveal">("pick");
  let chosen = $state<PropType | null>(null);

  const locked = $derived(remainingLockedProps());
  const isGuest = $derived(!authState.isFullAccount);

  let base = $state<SequenceData | null>(null);
  let rotated = $state<SequenceData[]>([]);
  let playheadBeat = $state(0);
  let isRemixing = $state(false);
  const SPEED = 0.3; // beats per second — validated tunnel cadence

  // Bumped on every reveal/remix so a slow build can't overwrite a newer one.
  let revealToken = 0;

  // Per-tip effects are deferred to the Tunnel View feature: today the engine
  // applies tip effects to the base pair only, so cycling them here decorates
  // 1 of 4 pairs asymmetrically. Keep the tunnel uniform (no per-tip effect)
  // until the engine renders effects across all overlaid layers.
  let currentEffect = $state<EffectType>("none");
  const tipEffectMap = $derived<TipEffectMap | undefined>(
    currentEffect === "none" ? undefined : { "*": { effect: currentEffect } },
  );

  function prefersReducedMotion(): boolean {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }
  // Reveal shape: a pure rotational (Radial) Tunnel config at a chosen fold
  // (shared vocabulary with Tunnel View). 4 arms (90/180/270, 8 props) is the
  // lush default; 2 arms (a single 180° copy, 4 props) is the lighter look.
  // Reduced-motion always uses the lighter one; remix occasionally rolls it.
  function defaultArms(): number {
    return prefersReducedMotion() ? 2 : 4;
  }
  function remixArms(): number {
    if (prefersReducedMotion()) return 2;
    return Math.random() < 0.35 ? 2 : 4;
  }

  // Shared loader: builds the overlaid tunnel layers; the token guard drops a
  // stale build if a newer reveal/remix started while this one was awaiting.
  async function loadReveal(
    seqPromise: Promise<SequenceData>,
    token: number,
    arms: number,
  ) {
    const seq = await seqPromise;
    const copies = await buildTunnelLayers(seq, { ...DEFAULT_CONFIG, fold: arms, mirror: false });
    if (token !== revealToken) return;
    base = seq;
    rotated = copies;
    isRemixing = false;
  }

  function choose(prop: PropType) {
    chosen = prop;
    phase = "reveal";
    base = null;
    rotated = [];
    playheadBeat = 0;
    currentEffect = "none"; // first look is the clean tunnel; remix adds effects
    isRemixing = false;
    revealToken += 1;
    void loadReveal(getPropDemoLoop(), revealToken, defaultArms());
  }

  /** Remix the meet view: a fresh random sequence + a new random effect. */
  function remix() {
    if (!chosen || isRemixing) return;
    isRemixing = true;
    base = null;
    rotated = [];
    playheadBeat = 0;
    revealToken += 1;
    void loadReveal(generateFreshDemoLoop(), revealToken, remixArms());
  }

  // This component is mounted unconditionally by CreateModule, so the playhead
  // clock must be gated on the modal actually being open. It used to start on
  // mount and re-arm every frame forever, guarding only the *work* and not the
  // *loop* — a permanent rAF slot on every Create page, measured at ~1 tick per
  // frame on /create/generate with no celebration anywhere in sight.
  $effect(() => {
    if (!propCelebration.isOpen) return;

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (base && base.steps.length > 0) {
        playheadBeat = (playheadBeat + dt * SPEED) % base.steps.length;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  type LayerProps = { left: PropState; right: PropState; step: StepData | null; stepOneBased: number };
  function propsFor(seq: SequenceData | null): LayerProps {
    if (!seq || seq.steps.length === 0) {
      return { left: { ...DEFAULT_PROP_STATE }, right: { ...DEFAULT_PROP_STATE }, step: null, stepOneBased: 1 };
    }
    const n = seq.steps.length;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(playheadBeat)));
    const progress = Math.max(0, Math.min(0.9999, playheadBeat - Math.floor(playheadBeat)));
    const step = seq.steps[idx] ?? null;
    if (!step) return { left: { ...DEFAULT_PROP_STATE }, right: { ...DEFAULT_PROP_STATE }, step: null, stepOneBased: idx + 1 };
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
  // Canvas needs the enum STRING; heading/toast need the human LABEL.
  const chosenPropStr = $derived(chosen ? String(chosen) : null);
  const chosenLabel = $derived(chosen ? getPropTypeDisplayInfo(chosen).label : "");
  const gridMode = $derived(base?.gridMode ?? GridMode.DIAMOND);

  function reset() {
    phase = "pick";
    chosen = null;
    base = null;
    rotated = [];
    currentEffect = "none";
    isRemixing = false;
    revealToken += 1;
  }

  async function confirm() {
    if (!chosen) return;
    const label = getPropTypeDisplayInfo(chosen).label;
    await getPropUnlockManager().claimPick(chosen);
    toast.success(`${label} added to your props.`);
    closePropCelebration();
    reset();
  }
  function onClose() {
    closePropCelebration();
    reset();
  }
  function signUpToKeep() {
    authDrawerState.show("signup", "prop-collection");
  }
</script>

<BaseModal open={propCelebration.isOpen} size="fit" class="chromeless prop-celebration-modal" onclose={onClose}>
  <div class="celebration">
    <div class="phase-stack">
      {#if phase === "pick"}
        <div
          class="pane"
          in:scale={{ duration: morphMs(), start: 0.94, opacity: 0, easing: cubicOut }}
          out:scale={{ duration: morphMs(), start: 0.96, opacity: 0, easing: cubicOut }}
        >
          <h2 data-animate="1">You've earned a new prop</h2>
          <p class="sub" data-animate="2">Pick one to add to your collection.</p>
          <div class="grid" data-animate="3">
            {#each locked as prop (prop)}
              <button class="tile" onclick={() => choose(prop)}>
                <span class="tile-image">
                  <PropCompositionPreview propType={prop} neutral />
                </span>
                <span class="tile-label">{getPropTypeDisplayInfo(prop).label}</span>
              </button>
            {/each}
          </div>
          {#if isGuest}
            <div class="actions" data-animate="4">
              <button onclick={signUpToKeep}>Sign up to keep your collection</button>
            </div>
          {/if}
        </div>
      {:else}
        <div
          class="pane"
          in:scale={{ duration: morphMs(), start: 0.94, opacity: 0, easing: cubicOut }}
          out:scale={{ duration: morphMs(), start: 0.96, opacity: 0, easing: cubicOut }}
        >
          <h2 data-animate="1">Meet your {chosenLabel}</h2>
          <div class="stage" data-animate="2">
            <div
              class="canvas-box"
              role="button"
              tabindex="0"
              aria-label="Remix the demo sequence"
              onclick={remix}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  remix();
                }
              }}
            >
              {#if base}
                <div
                  class="canvas-holder"
                  in:scale={{ duration: morphMs(), start: 0.9, opacity: 0, easing: cubicOut }}
                >
                  <AnimatorCanvas
                  leftProp={baseLayer.left}
                  rightProp={baseLayer.right}
                  {additionalLayers}
                  leftPropType={chosenPropStr}
                  rightPropType={chosenPropStr}
                  sequenceData={base}
                  stepData={baseLayer.step}
                  currentStep={baseLayer.stepOneBased}
                  isPlaying={true}
                  {gridMode}
                  {tipEffectMap}
                  gridVisible={true}
                  hideHeader={true}
                  hideProgressBar={true}
                  hideTkaGlyph={true}
                  hideStepNumbers={true}
                  fillContainer={true}
                  fireConfig={{ disableFrameCache: true }}
                />
                </div>
                <span class="remix-hint">
                  {currentEffect === "none" ? "Tap to remix ✨" : `✨ ${currentEffect}`}
                </span>
              {:else}
                <div class="loading">{isRemixing ? "Remixing…" : "Summoning…"}</div>
              {/if}
            </div>
          </div>
          <div class="actions">
            <button class="back" onclick={reset}>Back</button>
            <button class="remix" onclick={remix}>
              <i class="fas fa-shuffle dice" aria-hidden="true"></i> Remix
            </button>
            <button class="confirm" onclick={confirm}>Add to my props</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</BaseModal>

<style>
  /* The chromeless variant caps the dialog at 420px (built for the small
     AuthNudge). This modal's prop grid needs more room — raise the cap so the
     540px panel shows fully and stays centered (extra class beats chromeless). */
  :global(dialog.base-modal.chromeless.prop-celebration-modal) {
    max-width: min(560px, calc(100vw - 32px));
  }
  .celebration {
    width: min(540px, calc(100vw - 32px));
    height: min(640px, calc(100dvh - 48px));
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 20px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 14px;
    color: var(--theme-text, #fff);
    text-align: center;
  }
  /* Both phases overlay in one reserved box so PICK <-> REVEAL crossfades and
     scales in place — the morph never moves the frame (no layout shift). */
  .phase-stack {
    position: relative;
    flex: 1 1 auto;
  }
  .pane {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    transform-origin: center;
    will-change: transform, opacity;
  }
  .canvas-holder {
    width: 100%;
    height: 100%;
    transform-origin: center;
  }
  h2 { margin: 0; font-size: 1.3rem; }
  .sub { margin: 0; opacity: 0.7; font-size: 0.9rem; }
  .grid {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    grid-auto-rows: min-content;
    align-content: start;
    gap: 10px;
    overflow-y: auto;
    padding-right: 4px;
  }
  .tile {
    aspect-ratio: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    color: inherit;
    cursor: pointer;
    transition: transform 0.15s, background 0.15s, border-color 0.15s;
  }
  .tile:hover {
    transform: scale(1.05);
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(150, 120, 240, 0.6);
  }
  .tile-image {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
  }
  .tile-image :global(.prop-composition-preview) {
    width: 100%;
    height: 100%;
  }
  .tile-label { font-size: 0.72rem; opacity: 0.85; }
  .stage {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* Largest centered square that fits the reserved height — never distorts.
     Clickable: tap the meet view to remix a fresh sequence + effect. */
  .canvas-box {
    position: relative;
    height: 100%;
    aspect-ratio: 1 / 1;
    max-width: 100%;
    border-radius: 14px;
    overflow: hidden;
    background: #07070b;
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .canvas-box:hover { border-color: rgba(150, 120, 240, 0.55); }
  .canvas-box:focus-visible { outline: 2px solid var(--theme-accent, #b14ddb); outline-offset: 2px; }
  .remix-hint {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    font-size: 0.68rem;
    letter-spacing: 0.02em;
    opacity: 0;
    transition: opacity 0.18s;
    pointer-events: none;
    text-transform: capitalize;
  }
  .canvas-box:hover .remix-hint,
  .canvas-box:focus-visible .remix-hint { opacity: 0.9; }
  .loading { width: 100%; height: 100%; display: grid; place-items: center; opacity: 0.5; }
  .actions { display: flex; gap: 10px; justify-content: center; }
  .actions button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 10px 18px;
    border-radius: 11px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    transition: transform 0.14s ease, background 0.14s ease,
      border-color 0.14s ease, box-shadow 0.14s ease;
  }
  .actions button:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.12);
  }
  .actions button:active { transform: translateY(0) scale(0.97); }
  .actions button:focus-visible {
    outline: 2px solid var(--theme-accent, #b14ddb);
    outline-offset: 2px;
  }
  .actions .remix {
    background: rgba(150, 120, 240, 0.16);
    border-color: rgba(150, 120, 240, 0.45);
  }
  .actions .remix:hover {
    background: rgba(150, 120, 240, 0.3);
    border-color: rgba(170, 140, 250, 0.75);
    box-shadow: 0 4px 18px rgba(150, 120, 240, 0.34);
  }
  .actions .remix .dice { transition: transform 0.3s ease; }
  .actions .remix:hover .dice { transform: rotate(-18deg) scale(1.18); }
  .actions .confirm {
    background: linear-gradient(135deg, #6d5ef0, #b14ddb);
    border-color: transparent;
    color: #fff;
  }
  .actions .confirm:hover { box-shadow: 0 6px 22px rgba(150, 80, 219, 0.45); }
  @media (prefers-reduced-motion: reduce) {
    .actions button,
    .actions .remix .dice { transition: none; }
    .actions button:hover { transform: none; }
    .actions .remix:hover .dice { transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .tile { transition: none; }
    .tile:hover { transform: none; }
  }
</style>
