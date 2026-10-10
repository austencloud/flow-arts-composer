<!--
  Choosing what to describe.

  The Level 1 check is the point of this screen. Level 1 is a closed world - no
  turns, every orientation radial - and its 52 movements are the target. Footage
  of anything above it would fill the corpus with movements the coverage count
  cannot represent, which is how a bounded mapping effort quietly becomes an
  unbounded one. Higher levels are not refused permanently, they are refused
  until this world is finished.
-->
<script lang="ts">
  import SequencePickerModal from "#lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import PropAwareThumbnail from "#lib/shared/browse/components/PropAwareThumbnail.svelte";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { getMovementMapContext } from "../context/movement-map-context";

  const { state: movementMap } = getMovementMapContext();

  let pickerOpen = $state(false);
  let fileInput = $state<HTMLInputElement | undefined>();
  let fileError = $state<string | null>(null);

  const displayWord = $derived(
    movementMap.sequence?.word ? simplifyRepeatedWord(movementMap.sequence.word) : ""
  );

  const ready = $derived(!!movementMap.video && !!movementMap.sequence && movementMap.isLevelOne);

  async function onFileChosen(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    fileError = null;
    const url = URL.createObjectURL(file);

    try {
      const duration = await readDuration(url);
      movementMap.setVideo({
        // The file's name and size identify the clip across sessions, so
        // reopening the same footage finds the observations already made on it
        // rather than starting a second empty record of the same take.
        id: `${file.name}:${file.size}`,
        label: file.name,
        url,
        duration,
        isLocal: true,
      });
    } catch {
      URL.revokeObjectURL(url);
      fileError = "That file could not be read as video.";
    }
  }

  function readDuration(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => resolve(probe.duration);
      probe.onerror = () => reject(new Error("unreadable"));
      probe.src = url;
    });
  }

  function selectSequence(sequence: SequenceData): void {
    movementMap.setSequence(sequence);
    pickerOpen = false;
  }

  function clearVideo(): void {
    movementMap.setVideo(null);
    fileError = null;
    // Reset the input's value so re-picking the SAME file still fires change.
    // Without it, removing a clip and choosing it again is a silent no-op.
    if (fileInput) fileInput.value = "";
  }

  function clearSequence(): void {
    movementMap.setSequence(null);
  }
</script>

<div class="setup">
  <section class="intro">
    <h2>Map what the body does</h2>
    <p>
      The notation already knows where the props go. This records what the arms,
      shoulders and torso had to do to get them there, one instant at a time,
      until every movement in Level 1 has been described.
    </p>
  </section>

  <div class="choices">
    <section class="choice" aria-labelledby="choose-footage">
      <h3 id="choose-footage">1. Footage</h3>
      <p class="hint">
        Slow motion is what makes an instant findable. Shoot at 120 or 240 fps
        if the camera offers it. The file stays on this machine.
      </p>

      <input
        bind:this={fileInput}
        type="file"
        accept="video/*"
        class="visually-hidden"
        onchange={onFileChosen}
      />
      <button type="button" class="action" onclick={() => fileInput?.click()}>
        <i class="fas fa-film" aria-hidden="true"></i>
        <span>{movementMap.video ? "Choose different footage" : "Choose footage"}</span>
      </button>

      {#if movementMap.video}
        <div class="chosen-row" transition:growFade>
          <p class="chosen">
            <i class="fas fa-check" aria-hidden="true"></i>
            {movementMap.video.label}
            <span class="muted">{movementMap.video.duration.toFixed(1)}s</span>
          </p>
          <button
            type="button"
            class="remove"
            onclick={clearVideo}
            aria-label={`Remove footage ${movementMap.video.label}`}
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
            <span>Remove</span>
          </button>
        </div>
      {/if}
      {#if fileError}
        <p class="error" role="alert">{fileError}</p>
      {/if}
    </section>

    <section class="choice" aria-labelledby="choose-sequence">
      <h3 id="choose-sequence">2. Sequence</h3>
      <p class="hint">
        The sequence performed in that footage. Its steps become the timeline
        every observation is filed against.
      </p>

      <button type="button" class="action" onclick={() => (pickerOpen = true)}>
        <i class="fas fa-list" aria-hidden="true"></i>
        <span>{movementMap.sequence ? "Choose different sequence" : "Choose sequence"}</span>
      </button>

      {#if movementMap.sequence}
        <div class="chosen-block" transition:growFade>
          <div class="sequence-chosen">
            <div class="thumb">
              <PropAwareThumbnail sequence={movementMap.sequence} alt="" />
            </div>
            <div class="sequence-meta">
              <p class="chosen">
                <i class="fas fa-check" aria-hidden="true"></i>
                {displayWord || movementMap.sequence.name}
              </p>
              <p class="muted">{movementMap.sequence.steps.length} steps</p>
            </div>
            <button
              type="button"
              class="remove"
              onclick={clearSequence}
              aria-label={`Remove sequence ${displayWord || movementMap.sequence.name}`}
            >
              <i class="fas fa-xmark" aria-hidden="true"></i>
              <span>Remove</span>
            </button>
          </div>

          {#if movementMap.isLevelOne}
            <p class="verdict ok" role="status">
              <i class="fas fa-circle-check" aria-hidden="true"></i>
              Level 1. No turns, every orientation radial.
            </p>
          {:else}
            <p class="verdict blocked" role="alert">
              <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
              Level {movementMap.difficulty?.level}{movementMap.difficulty?.trigger === "turns"
                ? " — this sequence carries turns."
                : movementMap.difficulty?.trigger === "nonRadial"
                  ? " — this sequence uses non-radial orientations."
                  : "."}
              Level 1 is the world being mapped first. Remove it and pick a
              sequence with no turns and radial orientations only.
            </p>
          {/if}
        </div>
      {/if}
    </section>
  </div>

  <div class="go">
    <button
      type="button"
      class="action primary"
      disabled={!ready}
      onclick={() => movementMap.goToStage("timing")}
    >
      <span>Set the timing</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </button>
    <p class="hint">
      Next you mark when each move lands, so an observation can name a moment
      inside a move rather than a raw timestamp.
    </p>
  </div>
</div>

<SequencePickerModal
  bind:open={pickerOpen}
  onClose={() => (pickerOpen = false)}
  onSelect={selectSequence}
  title="Sequence performed in this footage"
/>

<style>
  .setup {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    max-width: 70rem;
    margin: 0 auto;
    width: 100%;
  }

  .intro h2 {
    margin: 0 0 0.4rem;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--theme-text, #fff);
  }

  .intro p,
  .hint {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.55;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.65));
    max-width: 60ch;
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
    gap: 1rem;
  }

  .choice {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
  }

  .choice h3 {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    color: var(--theme-text, #fff);
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    padding: 0 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    align-self: flex-start;
    transition:
      background-color var(--transition-fast, 120ms) ease,
      border-color var(--transition-fast, 120ms) ease;
  }

  .action:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-accent, #6366f1);
  }

  .action:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .action.primary {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
    color: #fff;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  .chosen {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    color: var(--theme-text, #fff);
    word-break: break-word;
  }

  .chosen i {
    color: var(--semantic-success, #22c55e);
  }

  .muted {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 500;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.55));
    margin: 0;
  }

  .sequence-chosen {
    display: flex;
    gap: 0.65rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .thumb {
    width: 4.5rem;
    aspect-ratio: 1;
    flex-shrink: 0;
    border-radius: 0.5rem;
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.25));
  }

  .verdict {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
    margin: 0;
    padding: 0.55rem 0.7rem;
    border-radius: 0.5rem;
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.45;
  }

  .verdict.ok {
    border: 1px solid var(--semantic-success, #22c55e);
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 12%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .verdict.blocked {
    border: 1px solid var(--semantic-warning, #f59e0b);
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 12%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .error {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--semantic-red, #ef4444);
  }

  .go {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-start;
  }

  .chosen-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .chosen-row .chosen,
  .sequence-meta {
    flex: 1 1 auto;
    min-width: 0;
  }

  .chosen-block {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    flex: 0 0 auto;
    min-height: 2.75rem;
    padding: 0 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color var(--transition-fast, 120ms) ease,
      border-color var(--transition-fast, 120ms) ease,
      color var(--transition-fast, 120ms) ease;
  }

  .remove:hover {
    color: var(--theme-text, #fff);
    border-color: var(--semantic-red, #ef4444);
    background: color-mix(
      in srgb,
      var(--semantic-red, #ef4444) 14%,
      transparent
    );
  }

  .remove:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .action,
    .remove {
      transition: none;
    }
  }
</style>
