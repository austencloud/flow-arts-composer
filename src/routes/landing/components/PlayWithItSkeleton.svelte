<!--
  PlayWithItSkeleton

  Structural stand-in for PlayWithItInner's showcase with the SAME footprint
  at every breakpoint. The /test/composer-wings "Play with it" slot shows it
  until the lazy import lands, so the swap never reflows the page —
  identical by construction, the sequence-viewer-shell playbook applied to a
  skeleton (no-layout-shift.md).

  Geometry mirrors PlayWithItInner exactly:
  - .showcase: column flex, max 800px (min(1600px, 94vw) + 380px sidebar
    placeholder at the ≥920px isDesktopLayout breakpoint), 1px border.
  - .sk-canvas = .canvas-area: square, max-height min(1100px, 70vh); below
    600px it flexes to fill the height the host gives it.
  - .sk-beat-strip = StepStrip's fixed frame: viewportHeight = FRAME(98) + 26
    = 124px at every width (default 72px cells).
  - .sk-dock = the closed ControlDock bar (<920px only): 46px buttons + 6px
    padding + 1px border = 59px.
-->
<script lang="ts">
  let { failed = false }: { failed?: boolean } = $props();
</script>

<div class="showcase skeleton-showcase" class:load-failed={failed} aria-hidden="true">
  <div class="sk-stage-row">
    <div class="sk-canvas"></div>
    <div class="sk-panel"></div>
  </div>
  <div class="sk-beat-strip">
    {#each { length: 5 } as _, i (i)}
      <div class="sk-beat-cell"></div>
    {/each}
  </div>
  <div class="sk-dock"></div>
</div>

<style>
  /* Matches .showcase in PlayWithItInner: column-flex, max 800px, radius 16,
     dark border + shadow. */
  .showcase {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.35);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  /* Canvas — square with the same height cap as .canvas-area. */
  .sk-canvas {
    width: 100%;
    aspect-ratio: 1;
    max-height: min(1100px, 70vh);
    background: rgba(255, 255, 255, 0.02);
    flex-shrink: 0;
  }

  /* Mobile default: the row wrapper dissolves and the canvas flows in the
     showcase column. The sidebar placeholder only exists on desktop. */
  .sk-stage-row {
    display: contents;
  }

  .sk-panel {
    display: none;
  }

  /* Desktop (PlayWithItInner's 920px isDesktopLayout breakpoint): canvas +
     380px AnimationPanel sidebar at min(1600px, 94vw) wide. */
  @media (min-width: 920px) {
    .showcase {
      max-width: min(1600px, 94vw);
    }
  }

  @media (min-width: 920px) {

    .sk-stage-row {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      width: 100%;
    }

    .sk-canvas {
      flex: 1 1 auto;
      min-width: 0;
      width: auto;
    }

    .sk-panel {
      display: block;
      flex: 0 0 380px;
      max-width: 380px;
      background: rgba(255, 255, 255, 0.02);
      border-left: 1px solid rgba(255, 255, 255, 0.06);
    }

    /* Desktop has the sidebar instead of the bottom dock. */
    .sk-dock {
      display: none;
    }
  }

  /* Ultrawide: mirrors PlayWithItInner's 4K step (showcase cap, canvas
     height key, panel width). Must sit AFTER the 920px block so these win
     by source order. */
  @media (min-width: 1680px) {
    .showcase {
      /* Mirror PlayWithItInner's cinema-band cap (175rem == 2800px). */
      max-width: min(2800px, 94vw);
    }
    .sk-canvas {
      max-height: min(1500px, 72vh);
    }
    .sk-panel {
      flex: 0 0 440px;
      max-width: 440px;
    }
  }

  /* Beat strip — StepStrip's fixed 124px frame, cells centered. */
  .sk-beat-strip {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    padding: 0 16px;
    height: 124px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0, 0, 0, 0.2);
    flex-shrink: 0;
    overflow: hidden;
  }

  .sk-beat-cell {
    flex: 0 0 72px;
    width: 72px;
    height: 72px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    border: 1.5px solid rgba(255, 255, 255, 0.06);
  }

  /* Closed ControlDock bar (mobile/tablet layouts only). */
  .sk-dock {
    height: 59px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(18, 18, 28, 0.6);
    flex-shrink: 0;
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .skeleton-showcase {
    animation: skeleton-pulse 1.8s ease-in-out infinite;
  }

  .skeleton-showcase.load-failed {
    animation: none;
  }

  /* Phones: mirror PlayWithItInner's flex-fill — the showcase fills the height
     the host gives it and the canvas flexes to whatever the fixed-height strip
     + dock leave. */
  @media (max-width: 600px) {
    .showcase {
      flex: 1 1 auto;
      min-height: 0;
      max-width: 100%;
      border-radius: 12px;
    }

    .sk-canvas {
      aspect-ratio: auto;
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
    }

    .sk-beat-cell {
      flex: 0 0 56px;
      width: 56px;
      height: 56px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-showcase {
      animation: none;
    }
  }
</style>
