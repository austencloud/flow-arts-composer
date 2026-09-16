<script lang="ts">
  /**
   * The Cross-Reference Room's terminal.
   *
   * The Order spent sixty-one revisions of the nomenclature key trying to read
   * a sequence as a message. The visitor applies the key: each pictograph's
   * letter comes up in turn, the connective forms dim, and four letters remain.
   * K's note says the rest.
   */
  import "../museum-theme.css";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { MUSEUM_EXHIBIT_SEQUENCES } from "../../data/museum-exhibit-sequences";
  import { openInComposer } from "../../services/museum-composer-handoff";
  import StickyNote from "./StickyNote.svelte";

  interface Props {
    sequenceId: string;
    /** What the key finds, e.g. "OOGA". */
    reveal: string;
    /** K's note, shown after the reveal. */
    annotation: string;
  }

  let { sequenceId, reveal, annotation }: Props = $props();

  let sequence = $derived(MUSEUM_EXHIBIT_SEQUENCES[sequenceId] ?? null);

  /** How many step letters have come up so far. */
  let revealed = $state(0);
  let running = $state(false);
  let done = $derived(sequence !== null && revealed >= sequence.steps.length);

  /**
   * Which steps are the message and which are the connective forms: greedy
   * left-to-right match of `reveal` against the step letters. Whatever the key
   * skips over is a bridge the Order's transcription rule dims.
   */
  let messageIndexes = $derived.by(() => {
    if (!sequence) return new Set<number>();
    const hits = new Set<number>();
    let cursor = 0;
    for (let i = 0; i < sequence.steps.length && cursor < reveal.length; i++) {
      const letter = String(sequence.steps[i]?.letter ?? "").toUpperCase();
      if (letter === reveal[cursor]?.toUpperCase()) {
        hits.add(i);
        cursor++;
      }
    }
    return hits;
  });

  let readout = $derived.by(() => {
    if (!sequence) return "";
    return sequence.steps
      .slice(0, revealed)
      .map((step, i) => {
        const letter = String(step.letter ?? "?").toUpperCase();
        return messageIndexes.has(i) ? letter : `(${letter.toLowerCase()})`;
      })
      .join(" ");
  });

  let timer: ReturnType<typeof setTimeout> | null = null;

  function applyKey(): void {
    if (!sequence || running || done) return;
    running = true;
    const tick = () => {
      revealed += 1;
      if (sequence && revealed < sequence.steps.length) {
        timer = setTimeout(tick, 450);
      } else {
        running = false;
        timer = null;
      }
    };
    timer = setTimeout(tick, 250);
  }

  // The terminal's own copy says PRESS E. Honour it while the key is idle;
  // once the key has run, E is the walker's again.
  function onKey(e: KeyboardEvent): void {
    if (e.key !== "e" && e.key !== "E") return;
    if (running || done) return;
    e.preventDefault();
    applyKey();
  }

  function reset(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    running = false;
    revealed = 0;
  }

  $effect(() => () => {
    if (timer) clearTimeout(timer);
  });

  let opening = $state(false);
  async function takeIt(): Promise<void> {
    opening = true;
    const ok = await openInComposer(sequenceId, `Archive: ${reveal}`);
    if (!ok) opening = false;
  }
</script>

<svelte:window onkeydown={onKey} />

{#if sequence}
  <section class="console museum-gold-scope" aria-label="Nomenclature console">
    <div class="console-head">
      <span class="console-title">NOMENCLATURE KEY · REV. 61</span>
      <span class="console-status">{done ? "COMPLETE" : running ? "APPLYING…" : "READY"}</span>
    </div>

    <div class="strip">
      {#each sequence.steps as step, i (step.id)}
        <div
          class="cell"
          class:hidden-letter={i >= revealed}
          class:connective={i < revealed && !messageIndexes.has(i)}
          class:message={i < revealed && messageIndexes.has(i)}
        >
          <PictographContainer
            pictographData={step}
            showGrid={true}
            showTKA={i < revealed}
            showPlacements={false}
            showReversals={false}
          />
          <span class="cell-index">{String(i + 1).padStart(2, "0")}</span>
        </div>
      {/each}
    </div>

    <div class="readout" aria-live="polite">
      <span class="prompt">&gt;</span>
      <span class="readout-text">{readout}{#if !done}<span class="cursor"></span>{/if}</span>
    </div>

    {#if done}
      <div class="result">
        <span class="result-label">READS:</span>
        <span class="result-word">{reveal}</span>
        <span class="result-note">connective forms dropped per §4.2</span>
      </div>
      <div class="note-wrap">
        <StickyNote text={annotation} era="established" lean={1.2} />
      </div>
    {/if}

    <div class="actions">
      {#if !done}
        <button type="button" class="key-btn" disabled={running} onclick={applyKey}>
          <i class="fas fa-key" aria-hidden="true"></i>
          Apply nomenclature key
        </button>
      {:else}
        <button type="button" class="key-btn take-btn" disabled={opening} onclick={takeIt}>
          <i class="fas fa-hand" aria-hidden="true"></i>
          {opening ? "Opening the Composer…" : "Read it with your hands"}
        </button>
        <button type="button" class="reset-btn" onclick={reset}>Run again</button>
      {/if}
    </div>
  </section>
{:else}
  <div class="console-missing museum-gold-scope">
    <i class="fas fa-terminal" aria-hidden="true"></i>
    <p>NO KEY LOADED · {sequenceId}</p>
  </div>
{/if}

<style>
  .console {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    background: #07100c;
    border: 1px solid #1f3a2a;
    border-radius: 4px;
    box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.6);
    font-family: Consolas, "Courier New", monospace;
    color: #9cf5b0;
  }

  .console-head {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    letter-spacing: 0.1em;
    color: #4fd37a;
  }

  .console-title {
    color: #7dff9a;
  }

  .strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .cell {
    position: relative;
    width: 72px;
    height: 72px;
    background: #fff;
    border: 1px solid #1f3a2a;
    transition: opacity 0.4s ease, filter 0.4s ease;
  }

  .cell.hidden-letter {
    filter: grayscale(1) brightness(0.9);
  }

  .cell.connective {
    opacity: 0.3;
    filter: grayscale(1);
  }

  .cell.message {
    box-shadow: 0 0 0 2px #7dff9a;
  }

  .cell-index {
    position: absolute;
    left: 2px;
    bottom: 1px;
    font-size: 9px;
    color: #1f3a2a;
  }

  .readout {
    display: flex;
    gap: 8px;
    min-height: 1.4em;
    font-size: 15px;
    letter-spacing: 0.1em;
  }

  .prompt {
    color: #4fd37a;
  }

  .cursor {
    display: inline-block;
    width: 0.6em;
    height: 1em;
    margin-left: 2px;
    vertical-align: text-bottom;
    background: #9cf5b0;
    animation: blink 1s steps(2) infinite;
  }

  @keyframes blink {
    to {
      opacity: 0;
    }
  }

  .result {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 12px;
    border: 1px solid #1f3a2a;
  }

  .result-label {
    font-size: 11px;
    color: #4fd37a;
    letter-spacing: 0.1em;
  }

  .result-word {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: #7dff9a;
  }

  .result-note {
    flex-basis: 100%;
    font-size: 10px;
    color: #4fd37a;
    opacity: 0.7;
  }

  .note-wrap {
    padding: 6px 4px;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .key-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px 16px;
    background: rgba(125, 255, 154, 0.08);
    border: 1px solid #1f3a2a;
    border-radius: 3px;
    color: #7dff9a;
    font-family: inherit;
    font-size: var(--font-size-min, 13px);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .key-btn:hover:not(:disabled) {
    background: rgba(125, 255, 154, 0.16);
    border-color: #4fd37a;
  }

  .key-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .take-btn {
    border-color: #4fd37a;
  }

  .reset-btn {
    align-self: flex-end;
    background: none;
    border: none;
    color: #4fd37a;
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    opacity: 0.7;
  }

  .console-missing {
    padding: 16px;
    background: #07100c;
    color: #4fd37a;
    font-family: Consolas, monospace;
    font-size: 12px;
    text-align: center;
  }
</style>
