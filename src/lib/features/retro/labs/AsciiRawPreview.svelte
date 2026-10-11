<!--
  AsciiRawPreview.svelte - Clean monospace render without CRT effects.

  Dark background, no scanlines, no glow, no vignette. Every character
  is rendered at full clarity for iterating on the ASCII renderer.

  Domain: Retro DOS Terminal Lab
-->
<script lang="ts">
  import "#lib/features/retro/dos/styles/dos-terminal.css";

  /**
   * SANITIZATION CONTRACT: `htmlLines` and `compact` are rendered with
   * `{@html}` below. They MUST come from a trusted internal source only -
   * the ASCII/Braille renderer (SvgToBrailleConverter) which emits exactly
   * `<span class="dos-...">` colour wrappers around escaped glyph text. Never
   * pass user-supplied or network-fetched HTML to these props; doing so would
   * open an XSS hole. If an external source is ever needed, sanitize first.
   */
  let {
    htmlLines = [],
    compact = "",
  }: {
    htmlLines: string[];
    compact: string;
  } = $props();

  let copied = $state(false);

  function stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  async function copyToClipboard() {
    const plain = htmlLines.map(stripHtml).join("\n");
    await navigator.clipboard.writeText(plain);
    copied = true;
    setTimeout(() => { copied = false; }, 1500);
  }
</script>

<div class="raw-wrap">
  <div class="raw-canvas">
    {#each htmlLines as line}
      <div class="raw-line">{@html line}</div>
    {/each}
    {#if compact}
      <div class="compact-divider"></div>
      <div class="raw-line">{@html compact}</div>
    {/if}
  </div>

  <button
    class="copy-btn"
    onclick={copyToClipboard}
    aria-label="Copy ASCII art to clipboard"
  >
    {#if copied}
      <i class="fas fa-check" aria-hidden="true"></i> Copied
    {:else}
      <i class="fas fa-copy" aria-hidden="true"></i> Copy
    {/if}
  </button>
</div>

<style>
  .raw-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
    height: 100%;
  }

  .raw-canvas {
    background: #0a0a0f;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    padding: 16px 20px;
    overflow: auto;
    width: 100%;
    max-width: 900px;
    flex: 1;
    min-height: 0;
    container-type: inline-size;
    font-family: "Cascadia Mono", "SF Mono", "Fira Code", "Courier New", monospace;
    font-size: clamp(6px, calc((100cqw - 40px) / 66), 14px);
    line-height: 1.15;
    white-space: pre;
  }

  .raw-line {
    min-height: 1em;
  }

  /* Inherit the DOS terminal color classes for span coloring */
  .raw-canvas :global(.dos-blue) { color: #4fc3f7; }
  .raw-canvas :global(.dos-red) { color: #ef5350; }
  .raw-canvas :global(.dos-cyan) { color: #80deea; }
  .raw-canvas :global(.dos-green) { color: #33ff33; }
  .raw-canvas :global(.dos-gray) { color: rgba(255, 255, 255, 0.25); }
  .raw-canvas :global(.dos-white) { color: rgba(255, 255, 255, 0.7); }

  .compact-divider {
    height: 1px;
    margin: 8px 0;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
  }

  .copy-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 100px;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-family: "Courier New", "Consolas", monospace;
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition:
      color var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }

  @media (hover: hover) {
    .copy-btn:hover {
      color: var(--theme-text, #fff);
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    }
  }

  .copy-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #33ff33);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .copy-btn {
      transition: none;
    }
  }
</style>
