<script lang="ts">
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte";
  let { accent }: { accent: string } = $props();
</script>

<div class="bridge-preview" style="--preview-accent: {accent}">
  <div class="sequence-row">
    <span class="letter">B</span>
    <span class="connector left"></span>
    <span class="bridge-letter">Σ</span>
    <span class="connector right"></span>
    <span class="letter">O</span>
  </div>
  <span class="preview-label">{tDynamic("learn_controls_bridge_found")}</span>
</div>

<style>
  .bridge-preview {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 8cqh;
    width: 100%;
    height: 100%;
    container-type: size;
  }

  .sequence-row {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .letter,
  .bridge-letter {
    display: grid;
    place-items: center;
    width: 21cqh;
    height: 21cqh;
    border-radius: 4cqh;
    font-family: "JetBrains Mono", "Fira Code", "SF Mono", monospace;
    font-size: 10cqh;
    font-weight: 850;
    line-height: 1;
  }

  .letter {
    border: 1px solid color-mix(in srgb, var(--preview-accent) 30%, transparent);
    background: rgba(255, 255, 255, 0.045);
    color: rgba(255, 255, 255, 0.88);
  }

  .bridge-letter {
    border: 1.5px solid var(--preview-accent);
    background: color-mix(
      in srgb,
      var(--preview-accent) 17%,
      rgba(7, 10, 16, 0.95)
    );
    color: var(--preview-accent);
    box-shadow: 0 0 18cqh -8cqh var(--preview-accent);
    animation: bridge-arrive 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  }

  .connector {
    width: 10cqh;
    height: 1.2cqh;
    background: color-mix(in srgb, var(--preview-accent) 72%, transparent);
    transform: scaleX(0);
    animation: connect 2.8s ease-out infinite;
  }

  .connector.left {
    transform-origin: right;
  }

  .connector.right {
    transform-origin: left;
  }

  .preview-label {
    color: color-mix(in srgb, var(--preview-accent) 78%, white);
    font-size: max(var(--font-size-compact, 12px), 6cqh);
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    animation: label-reveal 2.8s ease-out infinite;
  }

  @keyframes bridge-arrive {
    0%,
    18% {
      opacity: 0;
      transform: translateY(12cqh) scale(0.8);
    }
    38%,
    82% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes connect {
    0%,
    34% {
      opacity: 0;
      transform: scaleX(0);
    }
    50%,
    82% {
      opacity: 1;
      transform: scaleX(1);
    }
    100% {
      opacity: 0;
      transform: scaleX(1);
    }
  }

  @keyframes label-reveal {
    0%,
    42% {
      opacity: 0;
      transform: translateY(2cqh);
    }
    56%,
    82% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bridge-letter,
    .connector,
    .preview-label {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }
</style>
