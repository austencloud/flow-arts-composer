<script lang="ts">
  import CodexCell from "../../guide/codex/_components/CodexCell.svelte";
  import { CODEX_CELLS_BY_LABEL } from "./codex-boards/codex-letters";

  interface LetterRef {
    label: string;
    href: string;
  }

  let { letters }: { letters: LetterRef[] } = $props();

  function resolvePictograph(letter: LetterRef) {
    const cell = CODEX_CELLS_BY_LABEL.get(letter.label);
    if (!cell) {
      throw new Error(
        `[glossary] No canonical Codex pictograph for ${letter.label}`
      );
    }
    return { ...letter, cell };
  }

  const pictographs = $derived(letters.map(resolvePictograph));
</script>

<div class="letter-pictographs-shell">
  <div class="letter-pictographs">
    {#each pictographs as pictograph (pictograph.label)}
      <a
        class="letter-pictograph"
        href={pictograph.href}
        aria-label={`Open letter ${pictograph.label} in the Letter Codex`}
      >
        <CodexCell
          cell={pictograph.cell}
          theme="dark"
          showName={false}
          showTransition={false}
        />
      </a>
    {/each}
  </div>
</div>

<style>
  .letter-pictographs-shell {
    container-type: inline-size;
  }

  .letter-pictographs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 5.25rem), 1fr));
    gap: 0.65rem;
  }

  @container (min-width: 16rem) {
    .letter-pictographs {
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 6.75rem), 1fr));
    }
  }

  .letter-pictograph {
    display: block;
    min-width: 0;
    min-height: 44px;
    padding: 0.3rem;
    border: 1px solid var(--theme-stroke, oklch(0.55 0.08 274 / 0.35));
    border-radius: var(--radius-md, 12px);
    color: var(--theme-text, #fff);
    background: var(--theme-panel-bg, oklch(0.2 0.025 274 / 0.55));
    text-decoration: none;
    --codex-picto-size: 100%;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }

  .letter-pictograph:hover {
    border-color: var(--theme-accent, oklch(0.65 0.13 275));
    background: color-mix(
      in srgb,
      var(--theme-accent, oklch(0.65 0.13 275)) 12%,
      var(--theme-panel-bg, #171524)
    );
    transform: translateY(-2px);
  }

  .letter-pictograph:focus-visible {
    outline: 2px solid var(--theme-accent, oklch(0.65 0.13 275));
    outline-offset: 2px;
  }

  .letter-pictograph :global(.codex-cell) {
    width: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .letter-pictograph {
      transition: none;
    }

    .letter-pictograph:hover {
      transform: none;
    }
  }
</style>
