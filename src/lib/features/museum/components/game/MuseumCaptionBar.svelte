<script lang="ts">
  /**
   * The audio guide's caption bar. Sits above the interaction prompt; styled
   * as the building's PA readout with the tape's recording stamp.
   */
  import "../museum-theme.css";
  import type { ActiveCaption } from "../../services/museum-narration-player.svelte";

  interface Props {
    caption: ActiveCaption | null;
  }

  let { caption }: Props = $props();

  let stamp = $derived.by(() => {
    if (!caption) return "";
    const { voice, recorded } = caption.cue;
    if (voice === "curator") return `CURATOR'S TAPE · ${recorded}`;
    if (voice === "tape") return recorded;
    return `ARCHIVE AUDIO GUIDE · ${recorded}`;
  });

  let progress = $derived(
    caption ? `${caption.lineIndex + 1}/${caption.cue.lines.length}` : ""
  );
</script>

{#if caption}
  <div
    class="caption-bar voice-{caption.cue.voice}"
    role="status"
    aria-live="polite"
    data-cue={caption.cue.id}
  >
    <div class="caption-stamp">
      <span class="rec-dot" aria-hidden="true"></span>
      <span>{stamp}</span>
      {#if caption.cue.draft}<span class="draft">DRAFT</span>{/if}
      <span class="progress">{progress}</span>
    </div>
    {#key `${caption.cue.id}-${caption.lineIndex}`}
      <p class="caption-line">{caption.line}</p>
    {/key}
    <span class="skip-hint"><kbd>N</kbd> skip</span>
  </div>
{/if}

<style>
  .caption-bar {
    position: absolute;
    bottom: clamp(7rem, 5.5rem + 1.5vw, 10.5rem);
    left: 50%;
    transform: translateX(-50%);
    width: min(720px, calc(100% - 2 * var(--museum-hud-edge, 1rem)));
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 18px 10px;
    background: rgba(10, 10, 16, 0.86);
    border: 1px solid var(--museum-gold-20);
    border-left: 3px solid var(--museum-gold-60);
    border-radius: 6px;
    color: var(--museum-gold-90);
    pointer-events: none;
    z-index: 11;
    animation: caption-in var(--duration-normal) var(--ease-standard);
  }

  .caption-stamp {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: monospace;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--museum-gold-50);
  }

  .rec-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #d04040;
    box-shadow: 0 0 6px rgba(208, 64, 64, 0.8);
    animation: rec-blink 1.2s ease-in-out infinite;
  }

  .draft {
    color: #f0b040;
    border: 1px dashed rgba(240, 176, 64, 0.5);
    padding: 0 5px;
    border-radius: 2px;
  }

  .progress {
    margin-left: auto;
    opacity: 0.7;
  }

  .caption-line {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(0.95rem, 0.7rem + 0.3vw, 1.35rem);
    line-height: 1.45;
    animation: line-in var(--duration-emphasis) var(--ease-standard);
  }

  .skip-hint {
    align-self: flex-end;
    font-size: 10px;
    color: var(--museum-gold-30);
    letter-spacing: 0.06em;
  }

  .skip-hint kbd {
    display: inline-block;
    min-width: 16px;
    padding: 0 4px;
    border: 1px solid var(--museum-gold-25);
    border-radius: 3px;
    font-family: monospace;
    font-size: 10px;
    text-align: center;
    color: var(--museum-gold-60);
  }

  /* The curator's tape, fifteen years later: warmer, no red light. */
  .voice-curator {
    border-left-color: #8cc88c;
  }
  .voice-curator .rec-dot {
    background: #8cc88c;
    box-shadow: 0 0 6px rgba(140, 200, 140, 0.8);
    animation: none;
  }
  .voice-curator .caption-stamp {
    color: rgba(140, 200, 140, 0.7);
  }

  /* The end of the tape: hiss, no voice. */
  .voice-tape {
    border-left-color: rgba(255, 255, 255, 0.25);
    color: rgba(255, 255, 255, 0.55);
  }
  .voice-tape .caption-line {
    font-family: monospace;
    letter-spacing: 0.08em;
  }
  .voice-tape .rec-dot {
    background: #666;
    box-shadow: none;
    animation: none;
  }

  @keyframes caption-in {
    from {
      opacity: 0;
      transform: translate(-50%, 6px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @keyframes line-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes rec-blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }

  @media (max-width: 40rem) {
    .caption-bar {
      bottom: clamp(8.5rem, 7rem + 2vw, 11rem);
      padding: 10px 12px 8px;
    }
  }
</style>
