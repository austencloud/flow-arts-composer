<!--
  Centred Guide text, one sentence per line: each sentence starts on its own
  line and balances its own wrap so no word is stranded (the "Guide pages"
  rule in visual-design-canon.md). Pass `text` for plain copy or `html` for
  authored markup; the parent element owns alignment and type. `lead` opens
  the first sentence (a bold "Pro:" label) and `tail` closes the last (an
  inline <strong> term the string leaves out). A layout that moves the text
  beside a figure sets `--sentence-display: inline` to read it as one
  paragraph again.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { htmlSentences, sentences } from "./sentences";

  let {
    text,
    html,
    lead,
    tail,
  }: { text?: string; html?: string; lead?: Snippet; tail?: Snippet } =
    $props();

  const pieces = $derived(
    html !== undefined ? htmlSentences(html) : sentences(text ?? "")
  );
  const last = $derived(pieces.length - 1);
</script>

<!-- The space between sentences collapses while each is a block, and keeps
     the words apart where a layout sets --sentence-display: inline. -->
{#each pieces as sentence, i (i)}{#if i > 0}{" "}{/if}<span class="sentence"
    >{#if i === 0 && lead}{@render lead()}{/if}{#if html !== undefined}{@html sentence}{:else}{sentence}{/if}{#if i === last && tail}{@render tail()}{/if}</span
  >{/each}

<style>
  .sentence {
    display: var(--sentence-display, block);
    text-wrap: balance;
  }
</style>
