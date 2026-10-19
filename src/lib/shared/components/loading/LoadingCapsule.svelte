<script lang="ts">
  /**
   * LoadingCapsule - the app's loading bar, the same capsule the boot screen
   * shows (src/app.html .boot-capsule): a pill whose brand-gradient fill is
   * the progress, with the status inside it. The fill is driven by a
   * LoadingSession's self-timing bar (scaleX, compositor-run), so it keeps
   * moving while the main thread is busy compiling or decoding.
   *
   * `labels` lists every status this load can show; the capsule reserves
   * the widest, so a status change crossfades in place without resizing it.
   *
   * `variant="line"` is the same bar inside a view rather than over a whole
   * screen: the status above a slim track in the theme accent, for a load
   * that has a stage of its own to show (the 3D viewer's loading screen).
   */
  import { onMount } from "svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    LOADING_FLOOR_PERCENT,
    type LoadingSession,
  } from "#lib/shared/loading/loading-session.svelte.js";

  interface Props {
    session: LoadingSession;
    label: string;
    labels?: readonly string[];
    /** "light" is the deep-tinted track for light surfaces. */
    tone?: "dark" | "light";
    variant?: "capsule" | "line";
  }

  let {
    session,
    label,
    labels = [],
    tone = "dark",
    variant = "capsule",
  }: Props = $props();

  let fillElement = $state<HTMLDivElement>();

  const sizing = $derived(labels.includes(label) ? labels : [...labels, label]);
  // The progressbar value is the share of the scale past its empty end.
  const value = $derived(
    session.done
      ? 100
      : Math.max(
          0,
          Math.min(
            99,
            Math.round(
              (100 * (session.percent - LOADING_FLOOR_PERCENT)) /
                (100 - LOADING_FLOOR_PERCENT)
            )
          )
        )
  );

  onMount(() => {
    if (!fillElement) return;
    return session.attach(fillElement);
  });
</script>

<div
  class="loading-capsule"
  class:light={tone === "light"}
  class:line={variant === "line"}
  role="progressbar"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={value}
  data-loading-bar={session.key}
  data-loading-bar-label={label}
>
  {#if variant === "line"}
    {@render status()}
    <div class="loading-line-track">
      {@render fill()}
    </div>
  {:else}
    {@render fill()}
    {@render status()}
  {/if}
</div>

{#snippet fill()}
  <div
    class="loading-capsule-fill"
    bind:this={fillElement}
    data-loading-bar-fill
  ></div>
{/snippet}

{#snippet status()}
  <span class="loading-capsule-label">
    {#each sizing as text (text)}
      <span class="ghost" aria-hidden="true">{text}</span>
    {/each}
    <span class="live">
      <Crossfade key={label} duration={DURATION.normal}>{label}</Crossfade>
    </span>
  </span>
{/snippet}

<style>
  /* Kept in step with src/app.html .boot-capsule: one loading bar look. */
  .loading-capsule {
    position: relative;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: max-content;
    min-width: min(240px, 100%);
    max-width: min(360px, 100%);
    height: 48px;
    padding: 0 24px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.16),
      0 18px 40px rgba(0, 0, 0, 0.35);
    white-space: nowrap;
  }

  /* A deep brand tint, so the white label passes 4.5:1 on the unfilled
     track over a light surface. */
  .loading-capsule.light {
    background: rgba(63, 80, 190, 0.92);
  }

  /* Full width, scaled from the left inside the capsule's clip, so the
     gradient always spans the visible fill. The session's bar moves it by
     transform alone; the first frame shows the empty end of the scale. */
  .loading-capsule-fill {
    position: absolute;
    inset: 0;
    width: 100%;
    background: linear-gradient(90deg, #6f8cff, #8b6cff);
    transform: scaleX(0.04);
    transform-origin: left center;
    will-change: transform;
  }

  /* Ghost-sizer: every status in one grid cell, only the live one shown. */
  .loading-capsule-label {
    position: relative;
    z-index: 1;
    display: grid;
    min-width: 0;
    color: #fff;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1.2;
  }

  .ghost,
  .live {
    grid-area: 1 / 1;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }

  .ghost {
    visibility: hidden;
  }

  /* Line: the status over a slim track. The host may size it to its view
     with --loading-line-width and --loading-line-font-size. */
  .loading-capsule.line {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    width: min(var(--loading-line-width, 320px), 100%);
    min-width: 0;
    max-width: none;
    height: auto;
    padding: 0;
    overflow: visible;
    border-radius: 0;
    background: none;
    box-shadow: none;
  }

  .line .loading-capsule-label {
    color: rgba(255, 255, 255, 0.86);
    font-size: var(--loading-line-font-size, var(--font-size-sm, 14px));
    font-weight: 500;
    letter-spacing: 0.02em;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.45);
  }

  .loading-line-track {
    position: relative;
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
  }

  .line .loading-capsule-fill {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--theme-accent, #8b6cff) 70%, white),
      var(--theme-accent, #8b6cff)
    );
  }
</style>
