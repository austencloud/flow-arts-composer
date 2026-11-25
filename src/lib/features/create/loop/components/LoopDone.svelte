<!-- LoopDone - the end of the road: says the LOOP is made and what can be done
     with it. It stands where the step list was, so a made LOOP never looks like
     one more step to add. -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { getLoopBuilderContext } from "../context/loop-builder-context";
  import { loopFamily } from "../domain/loop-families";

  const { state: loop } = getLoopBuilderContext();
  const info = $derived(loopFamily(loop.family));

  // The button that led here is on its way out, so keyboard and screen reader
  // land on the news.
  function land(node: HTMLElement): void {
    if (document.activeElement?.closest(".workbench")) {
      node.focus({ preventScroll: true });
    }
  }
</script>

<section
  class="done"
  style:--loop-color={info.color}
  style:--loop-ink={info.ink}
  style:--loop-on={info.on}
>
  <div class="news">
    <Crossfade key={loop.broken} mode="swap">
      {#if loop.broken}
        <div class="lines">
          <span class="badge broken" aria-hidden="true">
            <i class="fas fa-exclamation"></i>
          </span>
          <h2>{t("create_loop_say_broken")}</h2>
          <p>{t("create_loop_done_turns")}</p>
        </div>
      {:else}
        <div class="lines">
          <span class="badge" aria-hidden="true">
            <i class="fas fa-check"></i>
          </span>
          <h2 tabindex="-1" {@attach land}>{t("create_loop_done_title")}</h2>
          <p>{t("create_loop_done_line")}</p>
        </div>
      {/if}
    </Crossfade>
  </div>

  <div class="acts">
    <button type="button" class="act first" onclick={loop.watch}>
      <i class="fas fa-play" aria-hidden="true"></i>
      <span>{t("create_loop_watch")}</span>
    </button>
    <button type="button" class="act" onclick={() => void loop.compareAll()}>
      <i class="fas fa-table-list" aria-hidden="true"></i>
      <span>{t("create_loop_compare")}</span>
    </button>
    <button type="button" class="act" onclick={loop.addMore}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{t("create_loop_done_more")}</span>
    </button>
  </div>

  <p class="turns" class:said={loop.broken} aria-hidden={loop.broken}>
    {t("create_loop_done_turns")}
  </p>
</section>

<style>
  .done {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(0.75rem, 3cqb, 1.5rem);
    box-sizing: border-box;
    height: 100%;
    padding: 0.75rem;
    text-align: center;
  }

  .lines {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
  }

  .badge {
    display: grid;
    width: clamp(2rem, 8cqb, 3.5rem);
    aspect-ratio: 1;
    margin-bottom: 0.25rem;
    place-items: center;
    border-radius: 50%;
    background: var(--loop-color);
    color: var(--loop-on);
    font-size: clamp(
      var(--font-size-min, 14px),
      3.4cqb,
      var(--font-size-2xl, 24px)
    );
  }

  .badge.broken {
    background: var(--semantic-warning, #f59e0b);
    color: #0b0f17;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: var(--font-size-lg, 18px);
    font-weight: 650;
    line-height: 1.25;
    text-wrap: balance;
    outline: none;
  }

  .lines p {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.35;
    text-wrap: balance;
  }

  .acts {
    display: grid;
    gap: 0.5rem;
    width: min(20rem, 100%);
  }

  .act {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    min-width: 0;
    min-height: var(--loop-tap);
    padding: 0 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 1.375rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out);
    -webkit-tap-highlight-color: transparent;
  }

  .act i {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .act.first {
    border-color: var(--loop-ink);
  }

  .act.first i {
    color: var(--loop-ink);
  }

  .turns {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    text-wrap: balance;
    transition: opacity var(--duration-normal) var(--ease-standard);
  }

  /* A broken LOOP says this line up with the news. It keeps its place here so
     the buttons stay where they are. */
  .turns.said {
    opacity: 0;
  }

  @container loop (min-width: 40rem) {
    h2 {
      font-size: var(--font-size-2xl, 24px);
    }

    .lines p {
      font-size: var(--font-size-base, 16px);
    }
  }

  /* A wide panel: the three side by side. */
  @container loop (min-width: 44rem) {
    .acts {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      width: min(44rem, 100%);
    }
  }

  /* A phone on its side: the words alone, then the buttons. */
  @container loop (max-height: 20rem) {
    .done {
      gap: 0.5rem;
      padding-block: 0.375rem;
    }

    .badge,
    .turns {
      display: none;
    }
  }

  .act:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .act:hover {
      background: var(--theme-card-hover-bg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .act,
    .turns {
      transition: none;
    }
  }
</style>
