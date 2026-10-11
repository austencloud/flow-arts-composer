<!--
  The Ghost's card — a small draggable window for the person running a demo.

  This used to be a dense engineering HUD (activity, intention, target,
  sidebar reads, candidate scores). Austen's verdict (2026-08-09): he is not
  going to read that. What earns the pixels is the character — its thought,
  its mood, its plan — plus somewhere sensible for the parked ghost to live.
  The full decision hierarchy stays inspectable at window.__ghost.status().

  When the tour is parked (the visitor took the wheel), the ghost docks HERE:
  the pointer dot hides and this card grows a Play button, so resuming is a
  visible control instead of a dot hiding behind a panel.
-->
<script lang="ts">
  import { portal } from "#lib/features/create/generate/components/modals/portal.js";
  import type { GhostMood } from "../domain/intention";
  import type { GhostMindStatus } from "../services/mind.svelte";

  let {
    status,
    thought,
    mood,
    seed,
    stage = false,
    parked = false,
    onResume,
    onClose,
  }: {
    status: GhostMindStatus;
    thought: string | null;
    mood: GhostMood;
    seed: number;
    stage?: boolean;
    /** The visitor has the wheel; the ghost is docked here waiting. */
    parked?: boolean;
    /** Resume the tour from the card's Play button. */
    onResume?: () => void;
    /** Hide the card entirely (window.__ghost.debug(true) brings it back). */
    onClose?: () => void;
  } = $props();

  // Collapsed = just the pill header. The card is for the operator,
  // not the audience — it must never be the thing hiding the ghost.
  let minimized = $state(false);

  // Drag anywhere: grab the header, drop the card where it isn't in the way.
  // Until the first drag it sits in its default bottom-right corner.
  let card = $state<HTMLElement | null>(null);
  let pos = $state<{ x: number; y: number } | null>(null);
  let dragging = $state(false);
  let grabX = 0;
  let grabY = 0;

  function startDrag(event: PointerEvent): void {
    if (!card || (event.target as HTMLElement).closest("button")) return;
    const rect = card.getBoundingClientRect();
    grabX = event.clientX - rect.left;
    grabY = event.clientY - rect.top;
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent): void {
    if (!dragging || !card) return;
    pos = {
      x: Math.min(
        Math.max(0, event.clientX - grabX),
        window.innerWidth - card.offsetWidth
      ),
      y: Math.min(
        Math.max(0, event.clientY - grabY),
        window.innerHeight - card.offsetHeight
      ),
    };
  }

  function endDrag(): void {
    dragging = false;
  }

  const planLabel = $derived(
    status.activityId
      ? `${status.activityId}${
          status.activityVariantId && status.activityVariantId !== "default"
            ? ` · ${status.activityVariantId}`
            : ""
        } · ${status.activityStepIndex + 1}/${status.activityStepCount}`
      : null
  );
  const currentStep = $derived(status.plan[status.activityStepIndex] ?? null);
  const nextSteps = $derived(
    status.plan.slice(status.activityStepIndex + 1, status.activityStepIndex + 4)
  );
</script>

<!-- Portaled to <body>: PresenterHost mounts inside .tka-app, whose z-index:2
     stacking context traps the card BELOW body-level drawers — their footer
     was eating the card's clicks even while the card looked on top. -->
<aside
  use:portal
  class="mind-overlay"
  class:stage
  class:minimized
  class:dragging
  bind:this={card}
  style={pos ? `left: ${pos.x}px; top: ${pos.y}px; right: auto; bottom: auto;` : ""}
>
  <header
    title="seed {seed} — drag to move"
    onpointerdown={startDrag}
    onpointermove={moveDrag}
    onpointerup={endDrag}
    onpointercancel={endDrag}
  >
    <span class="eyebrow">Ghost</span>
    <span class="phase phase-{parked ? 'parked' : status.phase}">
      {parked ? "parked" : status.phase}
    </span>
    <span class="mood">{mood}</span>
    <span class="controls">
      {#if parked && minimized}
        <button
          type="button"
          class="hud-button play-small"
          aria-label="Resume the ghost"
          onclick={() => onResume?.()}>▶</button
        >
      {/if}
      <button
        type="button"
        class="hud-button"
        aria-label={minimized ? "Expand ghost card" : "Minimize ghost card"}
        onclick={() => (minimized = !minimized)}
      >
        {minimized ? "▴" : "▾"}
      </button>
      <button
        type="button"
        class="hud-button"
        aria-label="Close ghost card"
        onclick={() => onClose?.()}
      >
        ✕
      </button>
    </span>
  </header>

  {#if !minimized}
    <p class="thought">{thought ?? "Watching quietly."}</p>

    <div class="plan">
      {#if planLabel && currentStep}
        <span class="plan-label">{planLabel}</span>
        <span class="plan-now">{currentStep}</span>
        {#if nextSteps.length}
          <span class="plan-next">then {nextSteps.join(" · ")}</span>
        {/if}
      {:else}
        <span class="plan-label">between activities</span>
      {/if}
    </div>

    {#if parked}
      <button
        type="button"
        class="resume"
        aria-label="Resume the ghost tour"
        onclick={() => onResume?.()}
      >
        ▶ Resume the ghost
      </button>
    {/if}
  {/if}
</aside>

<style>
  .mind-overlay {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483002;
    width: min(320px, calc(100vw - 32px));
    box-sizing: border-box;
    padding: 10px 12px 12px;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b8cff) 45%, black);
    border-radius: 14px;
    /* Fully opaque on purpose: app content bleeding through made the card
       unreadable and the card made the content unreadable — nobody won.
       --theme-panel-bg is itself translucent (rgba alpha), so paint it OVER
       an opaque base instead of using it alone. */
    background-color: #0d0d16;
    background-image: linear-gradient(
      var(--theme-panel-bg, #101018),
      var(--theme-panel-bg, #101018)
    );
    box-shadow:
      0 18px 48px -20px rgba(0, 0, 0, 0.78),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    color: var(--theme-text, #f4f4f8);
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    line-height: 1.4;
    /* The body stays inert so the card can never eat an app click the ghost
       is about to make; the header (drag) and buttons opt back in. */
    pointer-events: none;
  }

  .mind-overlay.minimized {
    width: auto;
    min-width: 230px;
    padding: 6px 10px;
  }

  .mind-overlay.dragging {
    user-select: none;
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: -4px -6px 6px;
    padding: 4px 6px;
    border-radius: 8px;
    cursor: grab;
    pointer-events: auto;
    touch-action: none;
  }

  .mind-overlay.dragging header {
    cursor: grabbing;
  }

  .mind-overlay.minimized header {
    margin-bottom: -4px;
  }

  .eyebrow {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
  }

  .phase {
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b8cff) 18%,
      transparent
    );
    color: var(--theme-accent, #a7a8ff);
    text-transform: uppercase;
    font-size: 11px;
    font-weight: 800;
  }

  .phase-perceiving {
    color: #67e8f9;
    background: rgba(34, 211, 238, 0.16);
  }

  .phase-acting {
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.16);
  }

  .phase-watching,
  .phase-waiting {
    color: #c4b5fd;
    background: rgba(139, 92, 246, 0.14);
  }

  .phase-parked {
    color: #86efac;
    background: rgba(74, 222, 128, 0.16);
  }

  .mood {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-style: italic;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .controls {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }

  .hud-button {
    pointer-events: auto;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin: -12px -6px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font: inherit;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
  }

  .hud-button:hover {
    color: var(--theme-text, #f4f4f8);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b8cff) 20%,
      transparent
    );
  }

  .play-small {
    color: #86efac;
  }

  .thought {
    display: -webkit-box;
    overflow: hidden;
    margin: 0 0 8px;
    color: #f8fafc;
    font-style: italic;
    font-size: 13px;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .plan {
    display: grid;
    gap: 2px;
  }

  .plan-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 10px;
    font-weight: 700;
  }

  .plan-now {
    color: #fff;
    font-weight: 700;
  }

  .plan-next {
    display: -webkit-box;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.5);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .resume {
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    margin-top: 10px;
    border: 1px solid rgba(74, 222, 128, 0.45);
    border-radius: 10px;
    background: rgba(74, 222, 128, 0.14);
    color: #86efac;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }

  .resume:hover {
    background: rgba(74, 222, 128, 0.24);
    color: #bbf7d0;
  }

  .mind-overlay.stage {
    width: min(480px, calc(100vw - 48px));
    padding: 16px 18px;
    border-radius: 20px;
    font-size: 15px;
  }

  .mind-overlay.stage .thought {
    font-size: 17px;
  }

  .mind-overlay.stage .phase {
    font-size: 13px;
  }

  .mind-overlay.stage .plan-label {
    font-size: 12px;
  }
</style>
