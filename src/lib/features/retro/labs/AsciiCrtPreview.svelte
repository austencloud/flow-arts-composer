<!--
  AsciiCrtPreview.svelte - CRT monitor preview of the ASCII pictograph render.

  Uses the same dos-monitor > dos-terminal structure as the real /1989 page,
  including scanlines, vignette, and phosphor glow, so what you see in the
  lab is what you get in the actual app.

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
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }

  async function copyToClipboard() {
    const plain = htmlLines.map(stripHtml).join("\n");
    await navigator.clipboard.writeText(plain);
    copied = true;
    setTimeout(() => { copied = false; }, 1500);
  }
</script>

<div class="monitor-wrap">
  <!-- Physical CRT bezel - same classes as /1989 -->
  <div class="dos-monitor lab-monitor">
    <div class="dos-terminal">
      <div class="dos-output lab-output">
        {#each htmlLines as line}
          <div class="dos-line">{@html line}</div>
        {/each}
        {#if compact}
          <div class="compact-divider"></div>
          <div class="dos-line">{@html compact}</div>
        {/if}
      </div>

      <!-- CRT scanline overlay -->
      <div class="dos-crt-overlay" aria-hidden="true"></div>
    </div>
  </div>

  <!-- Copy button floats outside the monitor -->
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
  .monitor-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
    height: 100%;
  }

  /* Override the global .dos-monitor to fit inside the lab panel
     instead of filling the viewport. Keep the bezel look. */
  .monitor-wrap :global(.lab-monitor) {
    width: 100%;
    max-width: 840px;
    aspect-ratio: 4 / 3;
    max-height: 75vh;
  }

  /* "High-res" CRT: doubled textual resolution (132 cols × 52 rows).
     Each 66×26 pictograph occupies roughly half the screen width and
     half the height, leaving room for vertical sequence stacking.
     Uses full size containment for both cqw and cqh. */
  .monitor-wrap :global(.dos-terminal) {
    container-type: size;
    font-size: clamp(4px, min(calc((100cqw - 24px) / 80), calc((100cqh - 24px) / 68)), 14px);
  }

  /* Let content start at top and scroll naturally */
  .monitor-wrap :global(.lab-output) {
    display: flex;
    flex-direction: column;
  }

  .compact-divider {
    height: 1px;
    margin: 8px 0;
    background: rgba(51, 255, 51, 0.15);
  }

  .copy-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 14px;
    border: 1px solid rgba(51, 255, 51, 0.3);
    border-radius: 100px;
    background: transparent;
    color: rgba(51, 255, 51, 0.7);
    font-family: "Courier New", "Consolas", monospace;
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition:
      color var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }

  @media (hover: hover) {
    .copy-btn:hover {
      color: #33ff33;
      border-color: rgba(51, 255, 51, 0.6);
    }
  }

  .copy-btn:focus-visible {
    outline: 2px solid #33ff33;
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .copy-btn {
      transition: none;
    }
  }
</style>
