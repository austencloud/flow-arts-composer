<!--
MisconceptionHint - Shows a targeted hint when a wrong answer
matches a known confusion pair in the knowledge graph.

Appears below the feedback banner during the feedback window.
Tappable: navigates to TIKA with the misconception pre-loaded.
-->
<script lang="ts">
  import { compare } from "#lib/features/learn/services/letter-breakdown-generator.js";
  import type { DetectedGap } from "../../../services/types";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import { browser } from "$app/env";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let { gap }: { gap: DetectedGap } = $props();

  const correctLetter = $derived(gap.correctLabel);
  const chosenLetter = $derived(gap.chosenLabel);

  const hintText = $derived(
    t("learn_ui_ask_tika_difference", {
      first: correctLetter,
      second: chosenLetter,
    })
  );

  function openInTika() {
    if (!browser) return;

    const comparison = compare(correctLetter, chosenLetter);

    let question: string;
    if (comparison) {
      question =
        `I confused ${correctLetter} with ${chosenLetter} in a quiz. Here's what I need to understand:\n\n` +
        `${comparison.letterA.summary}. It's a Type ${comparison.letterA.typeNumber} (${comparison.letterA.typeName}) letter.\n` +
        `${comparison.letterB.summary}. It's a Type ${comparison.letterB.typeNumber} (${comparison.letterB.typeName}) letter.\n\n` +
        `Key difference: ${comparison.explanation}`;
    } else {
      question = `I confused ${correctLetter} with ${chosenLetter} in a quiz. What's the difference?`;
    }

    sessionStorage.setItem("tika-seed-message", question);
    handleModuleChange("tika");
  }
</script>

<button
  class="misconception-hint"
  onclick={openInTika}
  aria-label={t("learn_ui_ask_tika_misconception")}
>
  <span class="hint-icon">i</span>
  <span class="hint-text">{hintText}</span>
  <span class="hint-arrow" aria-hidden="true">
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  </span>
</button>

<style>
  .misconception-hint {
    position: fixed;
    bottom: calc(var(--primary-nav-height, 64px) + 4.5rem);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: color-mix(
      in srgb,
      var(--semantic-info, #3b82f6) 85%,
      transparent
    );
    border: none;
    border-radius: 10px;
    max-width: 340px;
    z-index: 149;
    cursor: pointer;
    animation: hintSlideIn var(--duration-emphasis, 300ms)
      cubic-bezier(0.16, 1, 0.3, 1);
    animation-delay: 200ms;
    animation-fill-mode: backwards;
    transition: filter var(--duration-fast, 150ms) ease;
  }

  .misconception-hint:hover {
    filter: brightness(1.15);
  }

  .misconception-hint:active {
    filter: brightness(0.95);
  }

  .hint-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-text, #ffffff) 20%, transparent);
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    flex-shrink: 0;
  }

  .hint-text {
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
    text-align: left;
  }

  .hint-arrow {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  @keyframes hintSlideIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .misconception-hint {
      animation: none;
    }
  }
</style>
