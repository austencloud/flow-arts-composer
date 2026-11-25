<!-- LoopBar - two lines: which LOOP is being built with Make beside it, and
     the one thing to do next with a dot for each of the three stages. The name
     is the picker for the kind of LOOP. -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade, opaqueFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { getLoopBuilderContext } from "../context/loop-builder-context";
  import {
    LOOP_FAMILIES,
    loopFamily,
    loopFamilyIcon,
  } from "../domain/loop-families";
  import {
    familyFullKey,
    familyNameKey,
    readyKey,
    resultKey,
  } from "../domain/loop-words";

  let {
    menuOpen,
    menuId,
    onToggleMenu,
    onReplay,
    trigger = $bindable(null),
  }: {
    menuOpen: boolean;
    menuId: string;
    onToggleMenu: () => void;
    /** Plays the film again while it is showing. */
    onReplay: () => void;
    trigger?: HTMLButtonElement | null;
  } = $props();

  const { state: loop } = getLoopBuilderContext();

  // Stands in a sentence where the mark itself is drawn.
  const MARK = "";
  const STAGES = [
    "create_loop_stage_start",
    "create_loop_stage_steps",
    "create_loop_stage_repeat",
  ] as const;

  const info = $derived(loopFamily(loop.family));
  const icon = $derived(loopFamilyIcon(loop.family, loop.variant));
  const away = $derived(loop.view !== "tools");
  const action = $derived.by(() => {
    if (loop.view === "watch") return "replay";
    if (loop.view === "compare") return "none";
    return loop.stage === "steps" || loop.stage === "ready" ? "make" : "none";
  });

  // The whole name, "Rotated LOOP", wherever it fits beside the buttons, and in
  // the middle of the panel wherever that leaves room for them on one side.
  const GAP = 8;
  /** The name button's own padding and border, past what hangs outside. */
  const NAME_EDGE = 22;
  let rowWidth = $state(0);
  let actionWidth = $state(0);
  let makeWidth = $state(0);
  let playWidth = $state(0);
  let longestWidth = $state(0);
  let fullWidth = $state(0);
  let shortWidth = $state(0);
  const centred = $derived(
    rowWidth > 0 &&
      fullWidth + NAME_EDGE + (Math.max(makeWidth, playWidth) + GAP) * 2 <=
        rowWidth
  );
  const endWidth = $derived(action === "none" ? 0 : GAP + actionWidth);
  const full = $derived(
    centred || (rowWidth > 0 && fullWidth + NAME_EDGE + endWidth <= rowWidth)
  );
  // A long word for a kind of LOOP takes the room of Make's icon, for every
  // kind at once so that Make stays the same while kinds are tried out.
  const tight = $derived(
    rowWidth > 0 && longestWidth + NAME_EDGE + GAP + makeWidth > rowWidth
  );
  const name = $derived(
    t(full ? familyFullKey(loop.family) : familyNameKey(loop.family))
  );
  // Both eased, so nothing beside them jumps when the words or Make change.
  const nameWidth = $derived(full ? fullWidth : shortWidth);

  /** 0 to 2 for the stage being worked on, 3 once the LOOP is made. A LOOP that
   *  an edit has broken loses its last tick. */
  const at = $derived(
    loop.broken
      ? 2
      : ({ start: 0, steps: 1, ready: 2, made: 3 }[loop.stage] as 0 | 1 | 2 | 3)
  );
  const line = $derived.by(() => {
    if (loop.view === "compare") return t("create_loop_compare_line");
    if (loop.made)
      return loop.broken
        ? t("create_loop_done_broken")
        : t(resultKey(loop.made.family, loop.made.variant));
    if (loop.stage === "ready" && loop.variant)
      return t(readyKey(loop.family, loop.variant));
    if (loop.stage === "start") return t("create_loop_say_start");
    if (!loop.marks) return t("create_loop_say_any");
    if (loop.closing) return t("create_loop_say_pick", { mark: MARK });
    if (loop.noneClose) return t("create_loop_say_none");
    return t("create_loop_say_steps", { mark: MARK });
  });
  const parts = $derived(line.split(MARK));
  /** A LOOP put back to being steps: one tap undoes that. */
  const wayBack = $derived(!away && loop.setAside && !loop.closing);
  const showsStages = $derived(!wayBack && !away && !loop.broken && at < 3);
  let lineWidth = $state(0);

  function handleNameKey(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !menuOpen) return;
    event.preventDefault();
    event.stopPropagation();
    onToggleMenu();
  }
</script>

<header
  class="bar"
  class:menu-open={menuOpen}
  style:--loop-color={info.color}
  style:--loop-ink={info.ink}
  style:--loop-on={info.on}
>
  <div class="row" class:centred class:tight bind:clientWidth={rowWidth}>
    <!-- The names and the buttons, drawn out of sight, so their room is known. -->
    <span class="sizers name" aria-hidden="true">
      <span class="name-words" bind:offsetWidth={fullWidth}>
        <i class="fas {icon}"></i>
        <span>{t(familyFullKey(loop.family))}</span>
        <i class="fas fa-chevron-down chevron"></i>
      </span>
      <span class="name-words" bind:offsetWidth={shortWidth}>
        <i class="fas {icon}"></i>
        <span>{t(familyNameKey(loop.family))}</span>
        <i class="fas fa-chevron-down chevron"></i>
      </span>
      <span class="loop-act" bind:offsetWidth={makeWidth}>
        <i class="fas {info.icon}"></i>
        <span>{t("create_loop_make")}</span>
      </span>
      <span class="loop-act" bind:offsetWidth={playWidth}>
        <i class="fas fa-rotate-right"></i>
        <span>{t("create_loop_play_again")}</span>
      </span>
      <span class="longest" bind:offsetWidth={longestWidth}>
        {#each LOOP_FAMILIES as family (family.id)}
          <span class="name-words">
            <i class="fas {family.icon}"></i>
            <span>{t(familyNameKey(family.id))}</span>
            <i class="fas fa-chevron-down chevron"></i>
          </span>
        {/each}
      </span>
    </span>
    {#if away}
      <div class="back" transition:opaqueFade={{ duration: DURATION.normal }}>
        <button type="button" class="loop-act" onclick={loop.backToTools}>
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
          <span>{t("common_back")}</span>
        </button>
      </div>
    {/if}
    {#if !away || (centred && loop.view === "watch")}
      <div class="title" transition:opaqueFade={{ duration: DURATION.normal }}>
        <button
          type="button"
          class="name"
          class:open={menuOpen}
          bind:this={trigger}
          onclick={onToggleMenu}
          onkeydown={handleNameKey}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={`${t("create_loop_kind_label")}: ${t(familyNameKey(loop.family))}`}
        >
          <span
            class="name-room"
            style:width={nameWidth > 0 ? `${nameWidth}px` : null}
          >
            <Crossfade key={`${name} ${icon}`}>
              <span class="name-words">
                <i class="fas {icon}" aria-hidden="true"></i>
                <span>{name}</span>
                <i class="fas fa-chevron-down chevron" aria-hidden="true"></i>
              </span>
            </Crossfade>
          </span>
        </button>
      </div>
    {/if}

    <div class="end">
      <div
        class="action"
        style:width={action === "none" ? "0px" : `${actionWidth}px`}
      >
        <div class="action-room">
          <Crossfade key={action}>
            {#if action === "make"}
              <!-- The same button from the first step on: an outline while the
                   steps can't close yet, filled once they can. -->
              <div class="act-size" bind:offsetWidth={actionWidth}>
                <button
                  type="button"
                  class="loop-act make"
                  class:ready={loop.stage === "ready"}
                  disabled={loop.stage === "ready"
                    ? loop.preparing
                    : !loop.marks || loop.noneClose}
                  onclick={loop.make}
                >
                  <i class="fas {info.icon}" aria-hidden="true"></i>
                  <span>{t("create_loop_make")}</span>
                </button>
              </div>
            {:else if action === "replay"}
              <div class="act-size" bind:offsetWidth={actionWidth}>
                <button type="button" class="loop-act" onclick={onReplay}>
                  <i class="fas fa-rotate-right" aria-hidden="true"></i>
                  <span>{t("create_loop_play_again")}</span>
                </button>
              </div>
            {/if}
          </Crossfade>
        </div>
      </div>
    </div>
  </div>

  <ol class="visually-hidden">
    {#each STAGES as stage, index (stage)}
      <li aria-current={index === at ? "step" : undefined}>{t(stage)}</li>
    {/each}
  </ol>

  <div class="say" class:hushed={menuOpen}>
    <span class="stages" class:gone={!showsStages} aria-hidden="true">
      {#each STAGES as stage, index (stage)}
        <span class="dot" class:done={index < at} class:now={index === at}
        ></span>
      {/each}
    </span>
    <!-- Its width is eased, so the dots slide as the words change. -->
    <div
      class="line"
      style:width={lineWidth > 0 ? `${lineWidth}px` : null}
      aria-live="polite"
    >
      <Crossfade key={wayBack ? "back" : line} mode="swap">
        <div class="line-size" bind:offsetWidth={lineWidth}>
          {#if wayBack}
            <button type="button" class="way" onclick={loop.backToMade}>
              <i class="fas fa-chevron-left" aria-hidden="true"></i>
              <span>{t("create_loop_done_back")}</span>
            </button>
          {:else}
            <p>
              {#if loop.broken && !away}
                <span class="chip" aria-hidden="true">
                  <i class="fas fa-exclamation"></i>
                </span>
              {/if}
              <span class="words"
                >{#each parts as part, index (index)}{#if index > 0}<span
                      class="mark"
                      role="img"
                      aria-label={t(familyNameKey(loop.family))}
                      ><i class="fas {info.icon}"></i></span
                    >{/if}<span>{part}</span>{/each}</span
              >
            </p>
          {/if}
        </div>
      </Crossfade>
    </div>
  </div>
</header>

<style>
  .bar {
    position: relative;
    z-index: 3;
    flex: none;
    box-sizing: border-box;
    padding: 0.375rem 0.75rem;
    border-bottom: 1px solid var(--theme-stroke);
  }

  /* Taps beside the buttons reach what closes the menu. */
  .bar.menu-open {
    pointer-events: none;
  }

  .menu-open button {
    pointer-events: auto;
  }

  .row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 0.5rem;
    min-height: var(--loop-tap);
  }

  .back,
  .title {
    grid-row: 1;
    grid-column: 1;
    justify-self: start;
    max-width: 100%;
  }

  .end {
    display: flex;
    grid-row: 1;
    grid-column: 2;
    align-items: center;
    justify-self: end;
    gap: 0.5rem;
  }

  .row.centred {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  }

  .centred .title {
    grid-column: 2;
    justify-self: center;
  }

  .centred .end {
    grid-column: 3;
  }

  .centred .name {
    margin: 0;
  }

  .action {
    display: flex;
    justify-content: flex-end;
    transition: width var(--duration-normal) var(--ease-in-out);
  }

  .action-room {
    flex: none;
  }

  .act-size {
    width: max-content;
  }

  button {
    min-width: 0;
    min-height: 0;
    border: 0;
    color: var(--theme-text);
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .loop-act {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: var(--loop-tap);
    padding: 0 0.875rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 1.375rem;
    background: var(--theme-card-bg);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    white-space: nowrap;
    transition:
      background-color var(--duration-normal) var(--ease-out),
      border-color var(--duration-normal) var(--ease-out),
      color var(--duration-normal) var(--ease-out),
      opacity var(--duration-fast) var(--ease-out);
  }

  .loop-act i {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .loop-act.make {
    border-color: var(--loop-ink);
    background: transparent;
  }

  .loop-act.make i {
    color: var(--loop-ink);
    transition: color var(--duration-normal) var(--ease-out);
  }

  .tight .loop-act.make {
    padding: 0 0.625rem;
  }

  .tight .loop-act.make i {
    display: none;
  }

  .loop-act.make.ready {
    border-color: var(--loop-color);
    background: var(--loop-color);
    color: var(--loop-on);
  }

  .loop-act.make.ready i {
    color: inherit;
  }

  .loop-act:disabled {
    cursor: default;
    opacity: 0.6;
  }

  /* The engine is usually done at once; only a real wait dims the button. */
  .loop-act.make.ready:disabled {
    transition-delay: 0s, 0s, 0s, var(--duration-normal);
  }

  .name {
    position: relative;
    display: flex;
    align-items: center;
    height: var(--loop-tap);
    margin-inline-start: -0.5rem;
    padding: 0 0.625rem;
    border: 1px solid transparent;
    border-radius: 1.375rem;
    background: transparent;
    font-size: var(--font-size-base, 16px);
    font-weight: 650;
    white-space: nowrap;
    transition:
      background-color var(--duration-normal) var(--ease-out),
      border-color var(--duration-normal) var(--ease-out);
  }

  .name.open {
    border-color: var(--theme-stroke);
    background: var(--theme-card-hover-bg);
  }

  .sizers {
    position: absolute;
    inset-inline-start: 0;
    top: 0;
    display: grid;
    justify-items: start;
    height: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
  }

  .longest {
    display: grid;
  }

  .name-room {
    display: flex;
    transition: width var(--duration-normal) var(--ease-in-out);
  }

  .name-words {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .name-words i {
    color: var(--loop-ink);
  }

  .name-words .chevron {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    transition: rotate var(--duration-emphasis) var(--ease-in-out);
  }

  .name.open .chevron {
    rotate: 180deg;
  }

  .say {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 1.75rem;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .say.hushed {
    opacity: 0;
  }

  /* One dot for each stage: behind you, where you are, still to come. */
  .stages {
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.1875rem;
    width: 2rem;
    margin-inline-end: 0.5rem;
    overflow: hidden;
    transition:
      width var(--duration-emphasis) var(--ease-in-out),
      margin var(--duration-emphasis) var(--ease-in-out),
      opacity var(--duration-normal) var(--ease-out);
  }

  .stages.gone {
    width: 0;
    margin: 0;
    opacity: 0;
  }

  .dot {
    flex: none;
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 0.1875rem;
    background: color-mix(in srgb, var(--theme-text) 28%, transparent);
    transition:
      width var(--duration-emphasis) var(--ease-in-out),
      background-color var(--duration-normal) var(--ease-out);
  }

  .dot.done,
  .dot.now {
    background: var(--loop-ink);
  }

  .dot.now {
    width: 0.875rem;
  }

  .line {
    display: grid;
    min-width: 0;
    transition: width var(--duration-emphasis) var(--ease-in-out);
  }

  .line-size {
    width: max-content;
  }

  p {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    line-height: 1.75rem;
    white-space: nowrap;
  }

  /* Laid out as a row so the mark sits on the middle of the words and never
     makes the line taller. */
  .words {
    display: inline-flex;
    align-items: center;
    white-space: pre;
  }

  .way {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    height: 1.75rem;
    margin-inline: auto;
    padding: 0 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
    background: var(--theme-card-bg);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    white-space: nowrap;
  }

  /* Easier to hit than it looks. */
  .way::after {
    position: absolute;
    inset: -0.375rem 0;
    content: "";
  }

  .way i {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .chip,
  .mark {
    display: inline-grid;
    flex: none;
    place-items: center;
    box-sizing: border-box;
    border-radius: 50%;
    font-weight: 700;
    line-height: 1;
  }

  .chip {
    width: 1.375rem;
    height: 1.375rem;
    margin-inline-end: 0.5rem;
    background: var(--semantic-warning, #f59e0b);
    color: #0b0f17;
    font-size: var(--font-size-compact, 12px);
  }

  .mark {
    width: 1.25em;
    height: 1.25em;
    margin-inline: 0.0625em;
    background: var(--loop-color);
    color: var(--loop-on);
  }

  .mark i {
    font-size: 60%;
  }

  /* A wide panel has room for the next size up of each. */
  @container loop (min-width: 40rem) {
    .name {
      font-size: var(--font-size-xl, 20px);
    }

    p {
      font-size: var(--font-size-base, 16px);
    }
  }

  button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .way:hover,
    .loop-act:not(.make):hover:not(:disabled),
    .name:hover {
      background: var(--theme-card-hover-bg);
    }

    .loop-act.make:hover:not(:disabled) {
      background: color-mix(in srgb, var(--loop-color) 18%, transparent);
    }

    .loop-act.make.ready:hover:not(:disabled) {
      background: color-mix(in srgb, var(--loop-color) 86%, white);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron,
    .name,
    .name-room,
    .action,
    .loop-act,
    .loop-act.make i,
    .stages,
    .dot,
    .line,
    .say {
      transition: none;
    }
  }
</style>
