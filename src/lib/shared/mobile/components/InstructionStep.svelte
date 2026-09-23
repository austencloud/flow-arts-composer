<!--
  InstructionStep.svelte

  Displays a single instruction step with an optional screenshot.
  Reusable component that adapts to compact mode.
-->
<script lang="ts">
  import type { InstructionStep } from "../config/pwa-install-instructions";

  let {
    step,
    index,
    compact = false,
  }: {
    step: InstructionStep;
    index: number;
    compact?: boolean;
  } = $props();
</script>

<div class="step-card" class:compact>
  <div class="step-header">
    <div class="step-number">{index + 1}</div>
    <!--
      SANITIZATION CONTRACT: step.text is rendered with {@html} and MUST remain
      trusted, static, developer-authored markup. Its only source is the
      `pwa-install-instructions.ts` config (literal strings with <strong> tags).
      Never wire step.text to user input, URL params, network responses, or any
      dynamic source without first sanitizing — doing so opens an XSS surface.
    -->
    <div class="step-text">{@html step.text}</div>
  </div>

  <!-- A step without a screenshot renders as text only. "Screenshot coming
       soon" placeholders shipped to real users for months; an empty promise
       box is worse than no box. -->
  {#if !compact && step.image}
    <div class="step-image-container">
      <img
        src={step.image}
        alt={step.alt ?? `Step ${index + 1}`}
        class="step-image"
      />
    </div>
  {/if}
</div>

<style>
  .step-card {
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: clamp(8px, 2cqw, 12px);
    padding: clamp(10px, 2.5cqh, 14px);
    transition: all var(--duration-normal) ease;
  }

  .compact.step-card {
    padding: clamp(8px, 2cqh, 10px);
  }

  .step-card:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .step-header {
    display: flex;
    align-items: flex-start;
    gap: clamp(8px, 2cqw, 12px);
    margin-bottom: clamp(6px, 1.5cqh, 10px);
  }

  .compact .step-header {
    margin-bottom: 0;
  }

  .step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(26px, 6cqw, 30px);
    height: clamp(26px, 6cqw, 30px);
    flex-shrink: 0;
    border-radius: clamp(6px, 1.5cqw, 8px);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent) 30%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent) 30%, transparent) 100%
    );
    border: 1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
    color: var(--theme-accent);
    font-weight: 700;
    font-size: clamp(13px, 3cqw, 15px);
  }

  .step-text {
    flex: 1;
    margin: 0;
    color: var(--theme-text);
    line-height: 1.5;
    font-size: clamp(12px, 3cqw, 14px);
  }

  .compact .step-text {
    font-size: clamp(11px, 2.5cqw, 13px);
    line-height: 1.4;
  }

  .step-text :global(strong) {
    color: var(--theme-text);
    font-weight: 600;
  }

  /* Step Screenshot Thumbnails - Fluid sizing */
  .step-image-container {
    position: relative;
    margin-top: clamp(6px, 1.5cqh, 8px);
    border-radius: clamp(6px, 1.5cqw, 8px);
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    /* Android capture crops are tall relative to their width (tablet-layout
       screenshots); 200px left small text like menu items hard to read. */
    max-width: clamp(152px, 44cqw, 280px);
  }

  .step-image {
    width: 100%;
    height: auto;
    display: block;
  }
</style>
