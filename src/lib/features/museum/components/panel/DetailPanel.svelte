<script lang="ts">
  import "../museum-theme.css";
  import { getMuseumContext } from "../../state/museum-context";
  import PlaqueView from "./PlaqueView.svelte";
  import SequenceView from "./SequenceView.svelte";
  import SequenceBrowserOverlay from "#lib/features/museum/scenes/procedural/overlay/SequenceBrowserOverlay.svelte";

  const { state: museum } = getMuseumContext();

  let showSequencePicker = $state(false);

  function handleSequenceSelected(sequenceId: string) {
    if (museum.focusedPerformerId) {
      museum.updatePerformerSequence(museum.focusedPerformerId, sequenceId);
    }
    showSequencePicker = false;
  }

  // Resolve focused definitions from their IDs
  let focusedExhibit = $derived(
    museum.focusedExhibitId
      ? museum.grid.exhibits.find((e) => e.id === museum.focusedExhibitId) ?? null
      : null
  );

  let focusedPerformer = $derived(
    museum.focusedPerformerId
      ? museum.grid.performers.find((p) => p.id === museum.focusedPerformerId) ?? null
      : null
  );

  let focusedTrigger = $derived(
    museum.focusedTriggerId
      ? museum.grid.triggers.find((t) => t.id === museum.focusedTriggerId) ?? null
      : null
  );

  let hasContent = $derived(!!focusedExhibit || !!focusedPerformer || !!focusedTrigger);

  // Current wing for contextual display when nothing is focused
  let currentWing = $derived(museum.currentWing);
</script>

<div class="detail-panel museum-gold-scope">
  {#if focusedExhibit}
    <div class="panel-content">
      {#if focusedExhibit.plaque}
        <PlaqueView
          title={focusedExhibit.plaque.title}
          subtitle={focusedExhibit.plaque.subtitle}
          body={focusedExhibit.plaque.body}
        />
      {/if}
      {#if focusedExhibit.sequenceId}
        <div class="panel-section">
          <SequenceView sequenceId={focusedExhibit.sequenceId} />
        </div>
      {/if}
    </div>
  {:else if focusedPerformer}
    <div class="panel-content">
      <div class="performer-info">
        <div class="performer-header">
          <i class="fas fa-person" aria-hidden="true"></i>
          <h3>Performer Station</h3>
        </div>
        <p class="performer-detail">Facing {focusedPerformer.facing}</p>
        {#if focusedPerformer.autoPlay}
          <p class="performer-detail auto-play">Auto-playing</p>
        {/if}
      </div>
      {#if focusedPerformer.sequenceId}
        <div class="panel-section">
          <SequenceView sequenceId={focusedPerformer.sequenceId} />
        </div>
      {/if}
      <button class="change-sequence-btn" onclick={() => (showSequencePicker = true)}>
        <i class="fas fa-exchange-alt" aria-hidden="true"></i>
        Change Sequence
      </button>
    </div>
    <SequenceBrowserOverlay
      visible={showSequencePicker}
      onSelect={handleSequenceSelected}
      onClose={() => (showSequencePicker = false)}
    />
  {:else if focusedTrigger}
    <div class="panel-content">
      {#if focusedTrigger.content}
        <PlaqueView
          title={focusedTrigger.content.title ?? "Inscription"}
          body={focusedTrigger.content.body}
        />
      {:else}
        <p class="trigger-action">Trigger: {focusedTrigger.action}</p>
      {/if}
    </div>
  {:else if currentWing}
    <div class="panel-wing">
      <div class="wing-header">
        <i class="fas fa-location-dot wing-icon" aria-hidden="true"></i>
        <h2 class="wing-name">{currentWing.name}</h2>
      </div>
      {#if currentWing.description}
        <p class="wing-description">{currentWing.description}</p>
      {/if}
      <div class="wing-hint">
        <p>Walk up to an exhibit and press <kbd>E</kbd> to examine it.</p>
      </div>
    </div>
  {:else}
    <div class="panel-empty">
      <i class="fas fa-compass" aria-hidden="true"></i>
      <p class="empty-title">Corridor</p>
      <p class="empty-hint">Keep walking. Something ahead.</p>
    </div>
  {/if}
</div>

<style>
  .detail-panel {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, var(--museum-gold-20)) transparent;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .panel-content {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    animation: panel-slide-in 0.25s ease;
  }

  @keyframes panel-slide-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .panel-section {
    border-top: 1px solid var(--museum-gold-10);
    padding-top: 16px;
  }

  .performer-info {
    padding: 20px;
    background: rgba(140, 200, 140, 0.04);
    border: 1px solid rgba(140, 200, 140, 0.12);
    border-radius: 8px;
  }

  .performer-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .performer-header i {
    color: #8cc88c;
    font-size: 1.1rem;
  }

  .performer-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #8cc88c;
    font-weight: 500;
  }

  .performer-detail {
    margin: 4px 0;
    font-size: var(--font-size-min, 14px);
    color: rgba(140, 200, 140, 0.6);
  }

  .performer-detail.auto-play {
    color: var(--museum-gold-50);
    font-style: italic;
  }

  .change-sequence-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px 16px;
    background: rgba(140, 200, 140, 0.08);
    border: 1px solid rgba(140, 200, 140, 0.2);
    border-radius: 6px;
    color: rgba(140, 200, 140, 0.7);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .change-sequence-btn:hover {
    background: rgba(140, 200, 140, 0.14);
    border-color: rgba(140, 200, 140, 0.35);
    color: rgba(140, 200, 140, 0.9);
  }

  .trigger-action {
    padding: 20px;
    font-size: var(--font-size-min, 14px);
    color: var(--museum-gold-50);
    font-style: italic;
  }

  .panel-wing {
    padding: 28px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: panel-slide-in 0.25s ease;
  }

  .wing-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .wing-icon {
    font-size: 1rem;
    color: var(--museum-gold-50);
  }

  .wing-name {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.3rem;
    font-weight: 400;
    color: var(--museum-gold-85);
    letter-spacing: 0.02em;
  }

  .wing-description {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    line-height: 1.7;
    color: var(--museum-gold-45);
  }

  .wing-hint {
    margin-top: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--museum-gold-08);
  }

  .wing-hint p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--museum-gold-25);
  }

  .wing-hint kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    background: var(--museum-gold-10);
    border: 1px solid var(--museum-gold-20);
    border-radius: 3px;
    font-family: monospace;
    font-size: var(--font-size-compact, 12px);
    color: var(--museum-gold-50);
    vertical-align: middle;
  }

  .panel-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    padding: 40px 24px;
    text-align: center;
  }

  .panel-empty i {
    font-size: 2rem;
    color: var(--museum-gold-15);
  }

  .empty-title {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.1rem;
    color: var(--museum-gold-40);
  }

  .empty-hint {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--museum-gold-25);
    line-height: 1.5;
  }

</style>
