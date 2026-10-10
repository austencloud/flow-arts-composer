<!--
  One section of the lab's rail: an app card whose header folds its body away.

  The rail used to stack every control at full height, so the section you were
  using sat under a long scroll. Each section now says what it holds on its
  header (the summary) and can fold to that one line. Whether it is open is a
  per-device convenience, remembered under the section's id; a blocked or
  private storage just starts every section at its default.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";

  interface Props {
    /** Stable id: names the storage key and the header/body ids. */
    id: string;
    title: string;
    /** FontAwesome icon class for the header, e.g. "fa-film". */
    icon: string;
    /** What the section holds, so it still reads when folded. */
    summary?: string;
    defaultOpen?: boolean;
    children: Snippet;
  }

  let {
    id,
    title,
    icon,
    summary,
    defaultOpen = true,
    children,
  }: Props = $props();

  const STORAGE_PREFIX = "tka:staff-grip:section:v1:";

  function readOpen(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_PREFIX + id);
      return stored === null ? defaultOpen : stored === "1";
    } catch {
      return defaultOpen;
    }
  }

  // The lab renders client-side only (ssr = false under /test), so the stored
  // state is read before first paint and nothing animates open on load.
  let open = $state(readOpen());

  function toggle(): void {
    open = !open;
    try {
      localStorage.setItem(STORAGE_PREFIX + id, open ? "1" : "0");
    } catch {
      // Storage is a convenience here; the section still toggles.
    }
  }
</script>

<section class="section" aria-labelledby={`${id}-heading`}>
  <h2 class="heading">
    <button
      type="button"
      class="toggle"
      id={`${id}-heading`}
      aria-expanded={open}
      aria-controls={`${id}-body`}
      onclick={toggle}
    >
      <i class={`fa-solid ${icon} icon`} aria-hidden="true"></i>
      <span class="title">{title}</span>
      {#if summary}
        <span class="summary">{summary}</span>
      {/if}
      <i class="fa-solid fa-chevron-down chevron" class:open aria-hidden="true"
      ></i>
    </button>
  </h2>
  {#if open}
    <div class="body" id={`${id}-body`} transition:growFade>
      <div class="body-inner">
        {@render children()}
      </div>
    </div>
  {/if}
</section>

<style>
  /* The app's settings-card surface: card background, neutral stroke. */
  .section {
    min-width: 0;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
  }

  .heading {
    margin: 0;
    font: inherit;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    min-height: 48px;
    padding: 0.5rem 0.85rem 0.5rem 1rem;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--theme-text, #fff);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .toggle:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
  }

  .toggle:focus-visible {
    outline: 2px solid var(--theme-accent, #8ab4ff);
    outline-offset: -2px;
  }

  .icon {
    flex: 0 0 1.1rem;
    font-size: var(--font-size-sm, 0.875rem);
    text-align: center;
    color: var(--theme-accent, #8ab4ff);
  }

  .title {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 650;
  }

  .summary {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  .chevron {
    flex: 0 0 auto;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    transform: rotate(-90deg);
  }

  .chevron.open {
    transform: rotate(0deg);
  }

  @media (prefers-reduced-motion: no-preference) {
    .chevron {
      transition: transform var(--transition-normal, 200ms ease-out);
    }
  }

  .body {
    min-width: 0;
  }

  .body-inner {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.15rem 1rem 1rem;
  }
</style>
