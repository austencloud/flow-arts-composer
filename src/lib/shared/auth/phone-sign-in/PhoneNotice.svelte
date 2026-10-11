<!--
  PhoneNotice: one notice on the phone sign-in pages. An icon and a sentence
  on a whole-surface tint of the state's color. `strong` is the
  different-connection warning, the loudest thing on the approve page.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    tone: "good" | "warn" | "error" | "plain";
    /** A Font Awesome solid icon, such as "fa-check". */
    icon: string;
    strong?: boolean;
    children: Snippet;
  }

  let { tone, icon, strong = false, children }: Props = $props();
</script>

<div class="notice {tone}" class:strong>
  <i class="fa-solid {icon} mark" aria-hidden="true"></i>
  <div class="body">{@render children()}</div>
</div>

<style>
  .notice {
    --tone: var(--theme-text-dim);
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 8px;
    font-size: var(--font-size-sm);
    line-height: 1.45;
    color: var(--theme-text);
    background: color-mix(in srgb, var(--tone) 13%, transparent);
    border: 1px solid color-mix(in srgb, var(--tone) 38%, transparent);
  }

  .good {
    --tone: var(--semantic-success);
  }

  .warn {
    --tone: var(--semantic-warning);
  }

  .error {
    --tone: var(--semantic-error);
  }

  .plain {
    color: var(--theme-text-dim);
    background: var(--theme-card-bg);
    border-color: var(--theme-stroke);
  }

  .strong {
    padding: 14px;
    border: 2px solid var(--tone);
  }

  /* Sits on the first line of text, whatever the line count. */
  .mark {
    flex-shrink: 0;
    width: 1.15em;
    margin-top: 0.2em;
    text-align: center;
    color: var(--tone);
  }

  .body {
    min-width: 0;
  }

  .body :global(p) {
    margin: 0;
  }

  .body :global(.title) {
    font-size: var(--font-size-base);
    font-weight: 700;
  }

  .body :global(.title + p) {
    margin-top: 4px;
  }
</style>
