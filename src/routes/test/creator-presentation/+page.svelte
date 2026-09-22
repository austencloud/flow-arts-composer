<script lang="ts">
  import { onDestroy } from "svelte";
  import SequenceShowcasePreview from "$lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte";
  import ArtifactTile from "$lib/features/creators/components/profile/stage/ArtifactTile.svelte";
  import { LiveSlots } from "$lib/features/creators/components/profile/stage/live-slots.svelte";
  import SavePropDialog from "$lib/shared/library/components/SavePropDialog.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { FALLBACK_DEMO } from "$lib/shared/landing/data/per-visit-demo";
  import { deriveWord } from "$lib/shared/foundation/services/word-deriver";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { ResolvedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
  import {
    capturePresentation,
    resolvePresentation,
    summarizePresentation,
    type PresentationSummary,
  } from "$lib/shared/foundation/services/presentation-intent";
  import {
    DEFAULT_TRAIL_SETTINGS,
    TrailMode,
    TrailEffect,
    type TrailSettings,
  } from "$lib/shared/animation-engine/domain/types/trail-types";
  import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
  import type { EffectsConfig } from "$lib/shared/effects/domain/effects-config";

  // Real multi-beat fixture: the baked per-visit-demo fallback, also used by
  // HomeHero's pre-hydration frame and the static notation prop pages. 16
  // beats, no creatorIntent of its own, so every variant below stamps its own.
  const baseWord = simplifyRepeatedWord(deriveWord(FALLBACK_DEMO));

  // --- Recorded-look presentation: distinct colors, a long visible trail, a
  // non-default 2D effect (sparkles has a 2D canvas renderer, unlike some
  // effects that only render in the 3D coven view). Built through
  // capturePresentation, same as the real save flow. ---
  const customTrail: TrailSettings = {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.PERSISTENT,
    effect: TrailEffect.GLOW,
    leftColor: "#ff8a00",
    rightColor: "#00d1ff",
    tailLength: 200,
  };
  const customEffects: EffectsConfig = {
    ...DEFAULT_EFFECTS_CONFIG,
    tipEffectMap: { "*": { effect: "sparkles" } },
  };
  const recordedIntent = capturePresentation({
    primaryPropColors: { left: "#ff8a00", right: "#00d1ff" },
    trail: customTrail,
    effects: customEffects,
  });

  // --- Sequence variants: same fixture, only creatorIntent.presentation differs. ---
  const legacySequence: SequenceData = {
    ...FALLBACK_DEMO,
    creatorIntent: {},
  };
  const recordedSequence: SequenceData = {
    ...FALLBACK_DEMO,
    creatorIntent: { presentation: recordedIntent },
  };
  const defaultLookSequence: SequenceData = {
    ...FALLBACK_DEMO,
    creatorIntent: { presentation: null },
  };

  const cardVariants: { key: string; title: string; sequence: SequenceData }[] =
    [
      {
        key: "legacy",
        title: "Legacy (no presentation)",
        sequence: legacySequence,
      },
      { key: "recorded", title: "Recorded look", sequence: recordedSequence },
      {
        key: "default",
        title: "Default look (null)",
        sequence: defaultLookSequence,
      },
    ];

  // Shared liveness budget for the ArtifactTile row. Three sequence tiles sit
  // well under the default budget of 6, so all three animate at once.
  const artifactSlots = new LiveSlots();
  onDestroy(() => artifactSlots.destroy());

  // --- Save dialog summaries, built the same way the real save flow does:
  // capture -> resolve -> summarize, not hand-written objects. ---
  const resolvedRecorded = resolvePresentation(
    { presentation: recordedIntent },
    "creator-presentation-harness-recorded"
  );
  const customColorSummary: PresentationSummary =
    resolvedRecorded.kind === "recorded"
      ? summarizePresentation(resolvedRecorded.value)
      : { colors: null, trailLabel: "Trail", effectLabels: [] };

  const noEffectsConfig: EffectsConfig = {
    ...DEFAULT_EFFECTS_CONFIG,
    tipEffectMap: { "*": { effect: "none" } },
  };
  const themeColorSummary: PresentationSummary = summarizePresentation({
    primaryPropColors: null,
    trail: DEFAULT_TRAIL_SETTINGS,
    effects: noEffectsConfig,
  });

  let saveValue = $state<ResolvedPropConfig>({
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
    catDogMode: false,
  });
  let dialogOpen = $state(false);
  let activeSummary = $state<PresentationSummary | null>(null);
  let useDefaultLook = $state(false);
  let dialogStatus = $state("Dialog not opened yet.");

  function openDialog(summary: PresentationSummary, label: string) {
    activeSummary = summary;
    useDefaultLook = false;
    dialogOpen = true;
    dialogStatus = `Opened with ${label}.`;
  }
</script>

<svelte:head>
  <title>Creator presentation review</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main>
  <h1>Creator presentation review</h1>
  <p class="sub">
    One sequence, three <code>creatorIntent.presentation</code> states, rendered through
    the real public-card components. No Firestore writes on this route.
  </p>

  <section>
    <h2>Cards</h2>
    <p class="sub">
      SequenceShowcasePreview, same component and props WorkTile passes on the
      Creators Recent Work wall.
    </p>
    <div class="grid">
      {#each cardVariants as variant (variant.key)}
        <div class="card">
          <h3>{variant.title}</h3>
          <div class="stage">
            <SequenceShowcasePreview
              word={baseWord}
              loadSequence={() => Promise.resolve(variant.sequence)}
              activation="ambient"
              allowQR={false}
              onopen={() => {}}
              openLabel="Open {baseWord} sequence, {variant.title}"
            />
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Artifact tiles</h2>
    <p class="sub">
      ArtifactTile mounts standalone with a local LiveSlots budget the same way
      ProfileStage owns one. No auth or Firestore read required.
    </p>
    <div class="grid">
      {#each cardVariants as variant (variant.key)}
        <div class="card">
          <h3>{variant.title}</h3>
          <div class="stage">
            <ArtifactTile
              slots={artifactSlots}
              medium="sequence"
              title={variant.title}
              sequence={variant.sequence}
              size="lg"
            />
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Save dialog</h2>
    <p class="sub">
      Summaries built through <code>summarizePresentation</code>, not
      hand-written.
    </p>
    <div class="actions">
      <PanelButton
        onclick={() =>
          openDialog(customColorSummary, "the custom-color recorded look")}
      >
        Open with recorded look
      </PanelButton>
      <PanelButton
        onclick={() =>
          openDialog(themeColorSummary, "theme colors, no effects")}
      >
        Open with theme look
      </PanelButton>
    </div>
    <p role="status" class="status">
      {dialogStatus} useDefaultLook: {useDefaultLook}
    </p>
  </section>
</main>

{#if dialogOpen}
  <SavePropDialog
    bind:value={saveValue}
    presentationSummary={activeSummary}
    bind:useDefaultLook
    onCancel={() => {
      dialogOpen = false;
      dialogStatus = "Save cancelled.";
    }}
    onSave={() => {
      dialogOpen = false;
      dialogStatus = `Saved locally for review. useDefaultLook was ${useDefaultLook}.`;
    }}
  />
{/if}

<style>
  main {
    padding: 20px;
    color: var(--theme-text);
    max-width: 1200px;
    margin: auto;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  h1 {
    margin: 0;
  }

  h2 {
    margin: 0 0 0.25rem;
  }

  .sub {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
    margin: 0.25rem 0 1rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .card h3 {
    margin: 0;
    font-size: var(--font-size-md, 15px);
  }

  .stage {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 0.75em;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .status {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
  }
</style>
