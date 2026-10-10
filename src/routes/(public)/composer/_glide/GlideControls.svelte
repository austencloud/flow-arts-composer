<script lang="ts">
  /**
   * Section rail and Back/Next for the /composer stage. The rail names every
   * section on hover or focus and marks the one resting on the stage; Next
   * names where it goes and, from the last section, returns to the start.
   */
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";

  let {
    stops,
    active,
    onGo,
  }: {
    stops: readonly string[];
    active: number;
    onGo: (index: number) => void;
  } = $props();

  const back = $derived(active > 0 ? active - 1 : null);
  const next = $derived(active < stops.length - 1 ? active + 1 : null);
</script>

{#if stops.length > 1}
  <nav class="glide-rail" aria-label="Page sections">
    <ol>
      {#each stops as title, index (index)}
        <li>
          <button
            type="button"
            class="rail-stop"
            aria-current={index === active ? "step" : undefined}
            onclick={() => onGo(index)}
          >
            <span class="rail-label">{title}</span>
            <span class="rail-dot" aria-hidden="true"></span>
          </button>
        </li>
      {/each}
    </ol>
  </nav>

  <!-- Back stays in place, disabled at the start, so Next never shifts. -->
  <div class="glide-step">
    <PanelButton
      variant="secondary"
      disabled={back === null}
      ariaLabel={back === null ? "Back" : `Back to ${stops[back]}`}
      onclick={() => {
        if (back !== null) onGo(back);
      }}
    >
      <i class="fas fa-arrow-up" aria-hidden="true"></i>
    </PanelButton>
    <PanelButton
      variant="primary"
      ariaLabel={next === null ? "Back to the start" : `Next: ${stops[next]}`}
      onclick={() => onGo(next ?? 0)}
    >
      <span class="step-label">
        {next === null ? "Back to the start" : `Next: ${stops[next]}`}
      </span>
      <i
        class="fas {next === null ? 'fa-arrow-up' : 'fa-arrow-down'}"
        aria-hidden="true"
      ></i>
    </PanelButton>
  </div>
{/if}

<style>
  .glide-rail {
    position: fixed;
    top: 50%;
    right: max(0.5rem, env(safe-area-inset-right));
    z-index: 150;
    transform: translateY(-50%);
  }

  .glide-rail ol {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Only the dot column takes space and catches the pointer; a name hangs
     off to its left, so the rail never covers a section's own controls. */
  .rail-stop {
    position: relative;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--theme-text, #fff);
    font: inherit;
    cursor: pointer;
  }

  .rail-stop:focus-visible {
    outline: 2px solid var(--theme-accent, #7aa2ff);
    outline-offset: -2px;
    border-radius: 999px;
  }

  .rail-dot {
    flex: none;
    width: 10px;
    height: 10px;
    border: 1.5px solid
      color-mix(in oklab, var(--theme-text, #fff) 70%, transparent);
    border-radius: 50%;
    transition:
      transform var(--transition-fast),
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .rail-stop:hover .rail-dot {
    border-color: var(--theme-text, #fff);
  }

  .rail-stop[aria-current="step"] .rail-dot {
    border-color: var(--theme-accent, #7aa2ff);
    background: var(--theme-accent, #7aa2ff);
    transform: scale(1.35);
  }

  /* Hovering or focusing the rail reveals every name at once, like a
     contents list; at rest only the dots show so the rail stays off the text. */
  .rail-label {
    position: absolute;
    top: 50%;
    right: 100%;
    padding: 0.3rem 0.65rem;
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
    border-radius: 999px;
    background:
      linear-gradient(
        var(--theme-panel-bg, rgb(15, 15, 20)),
        var(--theme-panel-bg, rgb(15, 15, 20))
      ),
      var(--sheet-bg-solid, rgb(15, 15, 20));
    font-size: var(--font-size-sm, 0.875rem);
    white-space: nowrap;
    opacity: 0;
    transform: translate(0.5rem, -50%);
    pointer-events: none;
    transition:
      opacity var(--transition-fast),
      transform var(--transition-fast);
  }

  .glide-rail:hover .rail-label,
  .glide-rail:focus-within .rail-label {
    opacity: 1;
    transform: translate(0, -50%);
    pointer-events: auto;
  }

  /* The last item in the stage's column track: it sticks to the bottom of
     the window while the stage holds it, then rides up above the footer. */
  .glide-step {
    position: sticky;
    bottom: max(1rem, env(safe-area-inset-bottom));
    z-index: 150;
    display: flex;
    gap: 0.5rem;
    align-self: center;
    margin-block: auto max(1rem, env(safe-area-inset-bottom));
  }

  .step-label {
    white-space: nowrap;
  }
</style>
