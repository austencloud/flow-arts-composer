<script lang="ts">
  /**
   * Stop rail and Back/Next for the fly-through prototypes. Both versions use
   * the same controls so the comparison isolates how the camera moves. The
   * rail names every section on hover or focus; Next names where it goes.
   */
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";

  let {
    stops,
    active,
    onGo,
    placement = "corner",
  }: {
    stops: readonly string[];
    active: number;
    onGo: (index: number) => void;
    /** "stage" centres Next under a fixed stage; "corner" keeps it off the text. */
    placement?: "stage" | "corner";
  } = $props();

  const back = $derived(active > 0 ? active - 1 : null);
  const next = $derived(active < stops.length - 1 ? active + 1 : null);
</script>

{#if stops.length > 1}
  <nav class="flight-rail" aria-label="Page sections">
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

  <div class="flight-step" class:stage={placement === "stage"}>
    <!-- A centred pair keeps Back so Next never shifts; in the corner, Back
         only appears once there is somewhere to go back to. -->
    {#if placement === "stage" || back !== null}
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
    {/if}
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
  .flight-rail {
    position: fixed;
    top: 50%;
    right: max(0.5rem, env(safe-area-inset-right));
    z-index: 150;
    transform: translateY(-50%);
  }

  .flight-rail ol {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Only the dot column takes space and catches the pointer; a name hangs
     off to its left, so the rail never covers a panel's own controls. */
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

  .flight-rail:hover .rail-label,
  .flight-rail:focus-within .rail-label {
    opacity: 1;
    transform: translate(0, -50%);
    pointer-events: auto;
  }

  .flight-step {
    position: fixed;
    right: max(1rem, env(safe-area-inset-right));
    bottom: max(1rem, env(safe-area-inset-bottom));
    z-index: 150;
    display: flex;
    gap: 0.5rem;
  }

  .flight-step.stage {
    right: auto;
    left: 50%;
    transform: translateX(-50%);
  }

  .step-label {
    white-space: nowrap;
  }

  /* A phone, a landscape phone or a zoomed-in window has no room for six
     stacked targets, and a labelled Next would sit over the page's own
     controls; the arrow alone keeps its name for assistive tech. */
  @media (max-width: 699px), (max-height: 559px) {
    .flight-rail,
    .step-label {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rail-dot,
    .rail-label {
      transition: none;
    }
  }
</style>
