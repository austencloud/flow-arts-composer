<script lang="ts">
  import { getLetterPronunciation } from "#lib/shared/pronunciation/pronunciation-plan.js";

  interface Props {
    retired: readonly (readonly string[])[];
    recorded: number;
    folderName: string | null;
    abortReason: string | null;
    failure: string | null;
  }

  let { retired, recorded, folderName, abortReason, failure }: Props = $props();

  const spoken = (word: readonly string[]) =>
    word
      .map((letter) => getLetterPronunciation(letter as never)?.shortName ?? letter)
      .join(" ");
</script>

<section class="report">
  <h2>{abortReason ? "Session stopped" : "Session complete"}</h2>
  <p class="count">{recorded} words recorded{folderName ? `, saved as ${folderName}` : ""}.</p>

  {#if abortReason}
    <p class="abort">
      Stopped because {abortReason === "early-failures"
        ? "most of the opening reads failed"
        : "several reads failed in a row"}.
    </p>
    <!-- The specific reason when there is one. Blaming the microphone for a
         rejected upload sends him to the one place that is working. -->
    <p class="abort">
      {failure ??
        "Check the input level and the selected microphone before running again. Everything recorded so far is saved."}
    </p>
  {/if}

  {#if retired.length > 0}
    <h3>Nothing usable after three tries</h3>
    <p class="retired-note">
      These are the words the microphone never caught cleanly. Nothing was saved for them, so
      the letters in them are still short a take.
    </p>
    <ul>
      {#each retired as word (word.join(""))}
        <li>
          <span class="written">{word.join("")}</span>
          <span class="said">{spoken(word)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .report {
    display: grid;
    gap: 1rem;
    max-width: var(--shell-w, min(1720px, 92vw));
    margin-inline: auto;
    padding: 2rem;
    text-align: start;
    /* The whole report scales as one block. Every measure below is `em` or
       `ch`, so raising this one number carries the headings, the list, and the
       prose together instead of leaving 16px body copy in a 4K void. */
    font-size: clamp(1rem, 1.1vw, 2.25rem);
  }

  h2 {
    margin: 0;
    font-size: 2.2em;
  }

  h3 {
    margin: 0;
    font-size: 1.3em;
    opacity: 0.7;
  }

  .count {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .abort,
  .retired-note {
    margin: 0;
    max-width: 60ch;
  }

  .retired-note {
    opacity: 0.7;
  }

  /* The TKA word is the identity; the shorthand under it is only there so a
     row that reads "ΣΩΛ" can be checked against what was actually said. */
  .written {
    font-size: 1.15em;
  }

  .said {
    margin-inline-start: 0.75em;
    opacity: 0.55;
  }

  ul {
    display: grid;
    gap: 0.5em;
    margin: 0;
    padding-inline-start: 1.5em;
  }
</style>
