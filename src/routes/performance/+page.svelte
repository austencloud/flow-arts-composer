<script lang="ts">
  import {
    decodePerformanceTransfer,
    MAX_PERFORMANCE_TRANSFER_BYTES,
    type DecodedPerformanceTransfer,
    withPerformanceTransferOrigin,
  } from "#lib/shared/3d/services/performance-transfer.js";
  import { deepLinker } from "#lib/shared/navigation/services/deep-linker.js";
  import { goto } from "$app/navigation";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";

  let pasted = $state("");
  let decoded = $state<DecodedPerformanceTransfer | null>(null);
  let error = $state("");
  let opening = $state(false);
  let inspectionGeneration = 0;

  function clearInspection(): number {
    decoded = null;
    error = "";
    return ++inspectionGeneration;
  }

  async function inspect(text: string, generation = clearInspection()) {
    try {
      const result = await decodePerformanceTransfer(text);
      if (generation === inspectionGeneration) decoded = result;
    } catch (cause) {
      if (generation === inspectionGeneration)
        error =
          cause instanceof Error
            ? cause.message
            : "Could not read performance transfer";
    }
  }

  async function readFile(event: Event) {
    const generation = clearInspection();
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > MAX_PERFORMANCE_TRANSFER_BYTES) {
      error = "Performance transfer exceeds the size limit";
      return;
    }
    try {
      const contents = await file.text();
      if (generation !== inspectionGeneration) return;
      pasted = contents;
      await inspect(contents, generation);
    } catch {
      if (generation === inspectionGeneration)
        error = "Could not read that file. Try choosing it again.";
    }
  }

  async function openComposer() {
    if (!decoded || opening) return;
    opening = true;
    try {
      // Opening is explicit so pasting cannot replace work in progress.
      const editorSequence = withPerformanceTransferOrigin(
        {
          ...createSequenceData(decoded.sequence),
          ...decoded.sequence,
        },
        decoded.transfer
      );
      deepLinker.setData("create", editorSequence, "construct");
      try {
        localStorage.setItem(
          "tka-pending-edit-sequence",
          JSON.stringify(editorSequence)
        );
      } catch {
        // The in-memory deep link remains available when storage is disabled.
      }
      await goto("/create/construct");
    } catch (cause) {
      error =
        cause instanceof Error ? cause.message : "Could not open Composer";
    } finally {
      opening = false;
    }
  }
</script>

<svelte:head>
  <title>Import a performance | Flow Arts Composer</title>
  <meta
    name="description"
    content="Inspect a complete performance transfer before opening its sequence in Flow Arts Composer."
  />
</svelte:head>

<main>
  <LinkChip href="/">Flow Arts Composer</LinkChip>
  <section aria-labelledby="title">
    <p class="eyebrow">Performance transfer</p>
    <h1 id="title">Bring a performance into Composer</h1>
    <p>
      Paste a transfer from Museum or Flow Fest, or choose its JSON file.
      Inspect the sequence before opening it. Opening it for editing will not
      start playback.
    </p>

    <label for="transfer-text">Transfer JSON</label>
    <textarea
      id="transfer-text"
      bind:value={pasted}
      oninput={clearInspection}
      rows="8"
      spellcheck="false"
      placeholder="Paste the performance you copied"
    ></textarea>
    <div class="actions">
      <PanelButton onclick={() => inspect(pasted)}
        >Inspect performance</PanelButton
      >
      <input
        id="transfer-file"
        aria-label="Choose transfer file"
        type="file"
        accept=".json,.tka-performance.json,application/json"
        onchange={readFile}
      />
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if decoded}
      <div class="result" aria-live="polite">
        <p class="eyebrow">Verified sequence</p>
        <h2>
          {decoded.sequence.displayName ||
            decoded.sequence.name ||
            decoded.sequence.word}
        </h2>
        <dl>
          <div>
            <dt>ID</dt>
            <dd>{decoded.sequence.id}</dd>
          </div>
          <div>
            <dt>Word</dt>
            <dd>{decoded.sequence.word}</dd>
          </div>
          <div>
            <dt>Steps</dt>
            <dd>{decoded.sequence.steps.length}</dd>
          </div>
          {#if decoded.transfer.selection}
            <div>
              <dt>Native selection</dt>
              <dd>
                {decoded.transfer.selection.characterId} / {decoded.transfer
                  .selection.propFamily}
              </dd>
            </div>
          {/if}
        </dl>
        <p>
          The complete sequence is ready to open for editing. Museum or Flow
          Fest may need a prepared character and prop before it can play there.
        </p>
        <PanelButton variant="primary" disabled={opening} onclick={openComposer}
          >Open in Composer</PanelButton
        >
      </div>
    {/if}
  </section>
</main>

<style>
  main {
    min-height: 100vh;
    padding: clamp(1rem, 4vw, 3rem);
    color: var(--theme-text, #eee);
    background: var(--theme-bg, #171923);
  }
  section {
    max-width: 48rem;
    margin: clamp(2rem, 7vw, 6rem) auto;
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.13em;
    font-size: 0.75rem;
    opacity: 0.7;
  }
  h1 {
    font-size: clamp(2rem, 5vw, 3.5rem);
    line-height: 1.1;
    margin: 0.5rem 0 1rem;
  }
  p {
    line-height: 1.55;
  }
  label {
    display: block;
    margin: 1.5rem 0 0.5rem;
    font-weight: 700;
  }
  textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 12rem;
    resize: vertical;
    padding: 1rem;
    border: 1px solid #888;
    border-radius: 0.5rem;
    color: inherit;
    background: #ffffff10;
    font: 0.85rem/1.4 monospace;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  textarea:focus-visible,
  input:focus-visible {
    outline: 3px solid currentColor;
    outline-offset: 2px;
  }
  input[type="file"] {
    width: 15rem;
    max-width: 100%;
    min-height: 2.75rem;
    box-sizing: border-box;
    padding-block: 0.5rem;
  }
  .result {
    margin-top: 2rem;
    padding: clamp(1rem, 3vw, 2rem);
    border: 1px solid var(--theme-stroke, #888);
    border-radius: 0.5rem;
    background: var(--theme-card-bg, #ffffff10);
  }
  h2 {
    margin: 0.25rem 0 1rem;
  }
  dl {
    display: grid;
    gap: 0.6rem;
  }
  dl div {
    display: grid;
    grid-template-columns: 9rem minmax(0, 1fr);
    gap: 0.5rem;
  }
  dt {
    opacity: 0.7;
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .error {
    color: #ffb3a8;
    font-weight: 700;
  }
</style>
