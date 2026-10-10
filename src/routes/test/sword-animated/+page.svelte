<script lang="ts">
  import { onMount } from "svelte";
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
  import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

  const styles = [
    { id: "sword-knight", label: "Knight" },
    { id: "sword-saber", label: "Saber" },
    { id: "sword-flamberge", label: "Flamberge" },
    { id: "sword-khopesh", label: "Khopesh" },
    { id: "sword-claymore", label: "Claymore" },
  ];

  let sequence = $state<SequenceData | null>(null);
  let seqName = $state<string>("");
  let error = $state<string | null>(null);
  let allMeta = $state<Array<{ name?: string; word?: string }>>([]);

  async function loadSequence(name?: string) {
    const loader: PublicSequencesLoader = getBrowseLoader();
    if (allMeta.length === 0) {
      allMeta = await loader.loadSequenceMetadata();
    }
    if (allMeta.length === 0) {
      error = "No sequences in browse gallery";
      return;
    }
    const pick = name
      ? allMeta.find((m) => (m.name ?? m.word) === name) ?? allMeta[0]!
      : allMeta[Math.floor(Math.random() * allMeta.length)]!;
    const full = await loader.loadFullSequenceData(pick.name ?? pick.word ?? "");
    if (!full || !full.steps?.length) {
      error = "Failed to load sequence data";
      return;
    }
    seqName = full.word ?? pick.name ?? "sequence";
    sequence = full;
  }

  onMount(async () => {
    try {
      getAnimationVisibilityManager().setDarkMode(true);
      await loadSequence();
    } catch (err) {
      error = String(err);
    }
  });

  function reroll() {
    sequence = null;
    loadSequence();
  }
</script>

<div class="page">
  <header>
    <h1>Sword styles — live on a real sequence</h1>
    <p>
      Five sword styles, same sequence, animating side by side through the real
      engine. Both hands use the style (blue + red) so the gold wick stays gold
      and only the hardware takes the hand color.
    </p>
    <div class="row">
      <button onclick={reroll}>Reroll sequence</button>
      {#if seqName}<span class="seq">Playing: <strong>{seqName}</strong></span>{/if}
    </div>
  </header>

  {#if error}
    <p class="error">{error}</p>
  {:else if !sequence}
    <p class="loading">loading sequence…</p>
  {:else}
    <div class="grid">
      {#each styles as s (s.id)}
        <figure>
          <div class="player">
            <InlineAnimationPlayer
              {sequence}
              autoPlay={true}
              showControls={false}
              leftPropType={s.id}
              rightPropType={s.id}
            />
          </div>
          <figcaption>{s.label}</figcaption>
        </figure>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 2rem;
    background: #15171c;
    color: #e8e8ea;
    font-family: system-ui, sans-serif;
  }
  header {
    max-width: 70ch;
    margin-bottom: 1.5rem;
  }
  h1 {
    margin: 0 0 0.5rem;
  }
  header p {
    opacity: 0.8;
    line-height: 1.5;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.75rem;
  }
  button {
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid currentColor;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .seq {
    opacity: 0.8;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1.25rem;
  }
  figure {
    margin: 0;
  }
  .player {
    aspect-ratio: 1 / 1;
    border-radius: 14px;
    overflow: hidden;
    background: #0c0d11;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  figcaption {
    text-align: center;
    margin-top: 0.5rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .error {
    color: #ff7a7a;
  }
  .loading {
    opacity: 0.6;
  }
</style>
