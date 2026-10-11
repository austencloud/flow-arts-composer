<script lang="ts">
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import {
    BASE_COLOR_CURVE,
    BASE_FIRE_PHYSICS,
    intensityToPhysics,
    type FireOverlayConfig,
  } from "#lib/shared/animation-engine/domain/types/fire-types.js";
  import type {
    TipEffectMap,
    TipEffortMap,
  } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
  import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import demoSequenceJson from "#lib/shared/landing/data/demo-sequence.json";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import { NOTATION_LOOP_TEASER_SEQUENCE } from "#lib/shared/loop-explorer/domain/notation-loop-teaser.js";
  import { rotateSequenceGeometry } from "#lib/shared/create/services/sequence-derived-fields.js";

  const INTENSITY = 0.7;
  type LabEffect = "fire" | "smoke";
  type SequenceKey = "orbit" | "quartered" | "mirrored" | "crosswind";
  const fallbackSequence = demoSequenceJson as unknown as SequenceData;
  const sequenceOptions = [
    { value: "orbit", label: "Orbit" },
    { value: "quartered", label: "Quartered" },
    { value: "mirrored", label: "Half-turn" },
    { value: "crosswind", label: "Crosswind" },
  ] satisfies { value: SequenceKey; label: string }[];
  const sequences: Record<SequenceKey, SequenceData> = {
    orbit: fallbackSequence,
    quartered: NOTATION_LOOP_TEASER_SEQUENCE,
    mirrored: rotateSequenceGeometry(fallbackSequence, 2),
    crosswind: rotateSequenceGeometry(NOTATION_LOOP_TEASER_SEQUENCE, 1),
  };
  let labEffect = $state<LabEffect>("fire");
  let sequenceKey = $state<SequenceKey>("orbit");
  const sequence = $derived(sequences[sequenceKey]);
  const tipEffectMap = $derived<TipEffectMap>({ "*": { effect: labEffect } });
  const tipEffortMap: TipEffortMap = { "*": { effort: "linear" } };
  const sharedFireConfig: FireOverlayConfig = {
    intensity: INTENSITY,
    brightness: 0.5,
    flameHeight: INTENSITY,
    velocityReactive: true,
    quality: 2,
    colorBlend: 0,
    turbulence: 0.5,
    bloomStrength: 0.08,
    disableFrameCache: true,
    physicsPreset: {
      ...BASE_FIRE_PHYSICS,
      ...intensityToPhysics(INTENSITY),
    },
    colorCurve: BASE_COLOR_CURVE,
  };
  const legacyFireConfig: FireOverlayConfig = {
    ...sharedFireConfig,
    quality: 2,
    renderingProfile: "legacy",
  };
  const cinematicFireConfig: FireOverlayConfig = {
    ...sharedFireConfig,
    quality: 4,
    renderingProfile: "cinematic",
  };

  const legacyVisibility = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  const cinematicVisibility = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  legacyVisibility.setDarkMode(true);
  cinematicVisibility.setDarkMode(true);

  const legacySmokeState = createEffectsConfigState(DEFAULT_EFFECTS_CONFIG, {
    persist: false,
  });
  const fluidSmokeState = createEffectsConfigState(DEFAULT_EFFECTS_CONFIG, {
    persist: false,
  });
  legacySmokeState.setActiveEffect("smoke");
  fluidSmokeState.setActiveEffect("smoke");
  legacySmokeState.updateEffect("smoke", {
    palette: "incense",
    intensity: 0.68,
  });
  fluidSmokeState.updateEffect("smoke", {
    palette: "campfire",
    intensity: 0.68,
  });

  let legacyReady = $state(false);
  let cinematicReady = $state(false);
  const bothReady = $derived(legacyReady && cinematicReady);
</script>

<svelte:head>
  <title>2D Fire Styles</title>
  <meta
    name="description"
    content="Liquid Fire and Natural Fire on the same staff sequence."
  />
</svelte:head>

<main class="comparison-shell">
  <header class="comparison-header">
    <div>
      <p class="eyebrow">Synchronized fluid-effects lab</p>
      <h1>
        {labEffect === "fire"
          ? "Fire on the choreography"
          : "Smoke on the choreography"}
      </h1>
    </div>
    <div class="comparison-copy">
      <p class="lede">
        Both players perform {sequence.name || sequence.word} at 60 BPM. Only the
        effect renderer changes.
      </p>
      <p class="status" aria-live="polite">
        {bothReady ? "Playing together" : "Preparing both renderers…"}
      </p>
    </div>
  </header>

  <nav class="lab-controls" aria-label="Fluid effect comparison controls">
    <SegmentedControl
      options={[
        { value: "fire", label: "Fire" },
        { value: "smoke", label: "Smoke" },
      ]}
      value={labEffect}
      onchange={(value) => (labEffect = value)}
      semantics="radiogroup"
      ariaLabel="Effect"
    />
    <SegmentedControl
      options={sequenceOptions}
      value={sequenceKey}
      onchange={(value) => (sequenceKey = value)}
      semantics="radiogroup"
      ariaLabel="Sequence"
      size="sm"
    />
  </nav>

  <section class="comparison-grid" aria-label="Synchronized 2D fire comparison">
    <article class="comparison-card legacy-card">
      <div class="card-heading">
        <div>
          <p class="card-kicker">{labEffect === "fire" ? "Liquid" : "Cool"}</p>
          <h2>
            {labEffect === "fire" ? "Liquid Fire" : "Incense fluid smoke"}
          </h2>
        </div>
        <span class="profile-chip"
          >{labEffect === "fire"
            ? "128² simulation"
            : "Cool neutral palette"}</span
        >
      </div>
      <div class="sequence-stage" data-fire-profile="legacy">
        <InlineAnimationPlayer
          {sequence}
          autoPlay={bothReady}
          showControls={false}
          chrome="minimal"
          fill={true}
          showWordHeader={true}
          externalBpm={60}
          leftPropType="staff"
          rightPropType="staff"
          {tipEffectMap}
          {tipEffortMap}
          fireConfig={legacyFireConfig}
          effectsConfigState={labEffect === "smoke"
            ? legacySmokeState
            : undefined}
          visibilityManagerOverride={legacyVisibility}
          interactive={false}
          disableContextMenu={true}
          onReady={() => (legacyReady = true)}
        />
      </div>
      <p class="card-note">
        {labEffect === "fire"
          ? "First-order transport with the original simulation-sized presentation."
          : "The production density solver with a cool, neutral smoke palette."}
      </p>
    </article>

    <article class="comparison-card cinematic-card">
      <div class="card-heading">
        <div>
          <p class="card-kicker">{labEffect === "fire" ? "Natural" : "Warm"}</p>
          <h2>
            {labEffect === "fire"
              ? "Natural Fire HD"
              : "Fire-colored fluid smoke"}
          </h2>
        </div>
        <span class="profile-chip upgraded">
          {labEffect === "fire"
            ? "256² simulation · 1024px HDR"
            : "160² density · display resolution"}
        </span>
      </div>
      <div class="sequence-stage" data-fire-profile="cinematic">
        <InlineAnimationPlayer
          {sequence}
          autoPlay={bothReady}
          showControls={false}
          chrome="minimal"
          fill={true}
          showWordHeader={true}
          externalBpm={60}
          leftPropType="staff"
          rightPropType="staff"
          {tipEffectMap}
          {tipEffortMap}
          fireConfig={cinematicFireConfig}
          effectsConfigState={labEffect === "smoke"
            ? fluidSmokeState
            : undefined}
          visibilityManagerOverride={cinematicVisibility}
          interactive={false}
          disableContextMenu={true}
          onReady={() => (cinematicReady = true)}
        />
      </div>
      <p class="card-note">
        {labEffect === "fire"
          ? "Reaction-aware fire with a transported white-hot interior and controlled occlusion."
          : "Palette-colored density with thermal lift, pressure projection, and soft full-size reconstruction."}
      </p>
    </article>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #070503;
  }

  .comparison-shell {
    --settings-page-pad: clamp(1rem, 2.6vw, 3rem);
    min-height: 100svh;
    padding: var(--settings-page-pad);
    box-sizing: border-box;
    color: #fff8ee;
    background:
      radial-gradient(
        circle at 50% -15%,
        rgba(168, 66, 16, 0.25),
        transparent 42%
      ),
      linear-gradient(155deg, #0e0906, #050403 72%);
    container-type: inline-size;
  }

  .comparison-header,
  .lab-controls,
  .comparison-grid {
    width: min(100%, 162.5rem);
    margin-inline: auto;
  }

  .comparison-header {
    display: grid;
    grid-template-columns: minmax(18rem, 0.85fr) minmax(22rem, 1.15fr);
    align-items: end;
    gap: clamp(1rem, 4vw, 5rem);
    margin-bottom: clamp(1.25rem, 2.4vw, 2.5rem);
  }

  .eyebrow,
  .card-kicker {
    margin: 0 0 0.45rem;
    color: #ffad5c;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0;
    font-size: clamp(2rem, 3.6vw, 4.6rem);
    line-height: 0.96;
    letter-spacing: -0.045em;
  }

  .comparison-copy {
    padding-bottom: 0.25rem;
  }

  .lede {
    margin-bottom: 0.55rem;
    color: #d9c8b7;
    font-size: clamp(1rem, 1.3vw, 1.3rem);
    line-height: 1.5;
  }

  .status {
    margin: 0;
    color: #ffb968;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
  }

  .comparison-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(1rem, 2vw, 2rem);
  }

  .lab-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1.5rem;
    margin-bottom: clamp(1rem, 1.8vw, 1.6rem);
    padding: 0.65rem;
    border: 1px solid rgba(255, 190, 111, 0.16);
    border-radius: 1rem;
    background: rgba(12, 9, 7, 0.72);
  }

  .comparison-card {
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgba(255, 190, 111, 0.2);
    border-radius: clamp(1rem, 1.5vw, 1.5rem);
    background: rgba(12, 9, 7, 0.92);
    box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.34);
  }

  .cinematic-card {
    border-color: rgba(255, 179, 77, 0.42);
    box-shadow:
      0 1.5rem 5rem rgba(0, 0, 0, 0.34),
      0 0 3rem rgba(255, 102, 24, 0.08);
  }

  .card-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: clamp(1rem, 1.7vw, 1.5rem);
  }

  h2 {
    margin-bottom: 0;
    font-size: clamp(1.2rem, 1.7vw, 1.8rem);
    letter-spacing: -0.025em;
  }

  .profile-chip {
    flex: 0 0 auto;
    padding: 0.45rem 0.7rem;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 999px;
    color: #cbb9a7;
    background: rgba(255, 255, 255, 0.045);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
  }

  .profile-chip.upgraded {
    border-color: rgba(255, 170, 72, 0.32);
    color: #ffd4a0;
    background: rgba(255, 117, 24, 0.1);
  }

  .sequence-stage {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    isolation: isolate;
    background:
      radial-gradient(
        circle at 50% 48%,
        rgba(45, 29, 18, 0.5),
        transparent 49%
      ),
      radial-gradient(circle at 50% 50%, #100b08, #040302 73%);
  }

  .card-note {
    min-height: 3.1em;
    margin: 0;
    padding: 1rem clamp(1rem, 1.7vw, 1.5rem) 1.25rem;
    color: #bfae9d;
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.55;
  }

  @container (max-width: 54rem) {
    .comparison-header {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .comparison-grid {
      grid-template-columns: 1fr;
    }

    .lab-controls {
      align-items: stretch;
      flex-direction: column;
    }
  }

  @media (min-width: 1680px) {
    .comparison-shell {
      font-size: clamp(1rem, 0.72rem + 0.26vw, 1.5rem);
    }
  }

  @media (max-height: 34rem) and (min-width: 48rem) {
    .comparison-shell {
      padding-block: 0.75rem;
    }

    .comparison-header {
      grid-template-columns: auto 1fr;
      margin-bottom: 0.75rem;
    }

    .eyebrow,
    .status,
    .card-note {
      display: none;
    }

    h1,
    .lede {
      margin-bottom: 0;
    }

    .comparison-grid {
      width: min(100%, 48rem);
    }

    .card-heading {
      padding-block: 0.65rem;
    }

    .profile-chip {
      display: none;
    }
  }
</style>
