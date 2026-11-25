<!-- LoopTypeMenu - the five ways to repeat your steps, each with the plain
     words for what it does. Drops from under the name at the top. -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getEscapeLayerManager } from "#lib/shared/keyboard/get-escape-layer-manager.js";
  import { flyFade, opaqueFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { tick } from "svelte";
  import { getLoopBuilderContext } from "../context/loop-builder-context";
  import { LOOP_FAMILIES, type LoopFamily } from "../domain/loop-families";
  import { familyNameKey, familyPlainKey } from "../domain/loop-words";

  let {
    id,
    open,
    onClose,
  }: {
    id: string;
    open: boolean;
    /** Closed by a choice, Escape or a tap outside. */
    onClose: () => void;
  } = $props();

  const { state: loop } = getLoopBuilderContext();
  let menu = $state<HTMLElement | null>(null);
  let width = $state(0);
  /** Long words in some languages: the plain words go under the names. */
  let stacked = $state(false);

  const items = () =>
    Array.from(menu?.querySelectorAll<HTMLButtonElement>("button.row") ?? []);

  $effect(() => {
    if (!open) return;
    void tick().then(() => {
      const all = items();
      const chosen = all.find(
        (item) => item.getAttribute("aria-checked") === "true"
      );
      (chosen ?? all[0])?.focus({ preventScroll: true });
    });
    return getEscapeLayerManager().register({
      id: "loop-type-menu",
      canDismiss: () => true,
      dismiss: onClose,
    });
  });

  $effect(() => {
    if (!open || width === 0) return;
    stacked = false;
    void tick().then(() => {
      const plain = menu?.querySelectorAll<HTMLElement>(".row span") ?? [];
      stacked = Array.from(plain).some((words) => {
        const line = Number.parseFloat(getComputedStyle(words).lineHeight);
        return (
          words.scrollWidth > words.clientWidth + 1 ||
          words.offsetHeight > line * 1.5
        );
      });
    });
  });

  function handleKey(event: KeyboardEvent): void {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const target: Record<string, number> = {
      ArrowDown: at + 1,
      ArrowUp: at - 1,
      Home: 0,
      End: all.length - 1,
    };
    const next = target[event.key];
    if (next !== undefined) {
      event.preventDefault();
      all[(next + all.length) % all.length]?.focus();
    } else if (event.key === "Tab") {
      onClose();
    } else if (event.key === "Escape") {
      // The app's own Escape leaves an open menu to close itself.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  function choose(family: LoopFamily): void {
    onClose();
    void loop.chooseFamily(family);
  }

  function compare(): void {
    onClose();
    void loop.compareAll();
  }

  function explain(): void {
    onClose();
    loop.openExplainer();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="scrim"
    onclick={onClose}
    transition:opaqueFade={{ duration: DURATION.normal }}
  ></div>
  <div
    {id}
    class="menu"
    class:stacked
    role="menu"
    tabindex="-1"
    aria-label={t("create_loop_repeat_lead")}
    bind:this={menu}
    bind:clientWidth={width}
    transition:flyFade={{ y: -12, duration: DURATION.emphasis }}
    onkeydown={handleKey}
  >
    <p class="lead" role="presentation">{t("create_loop_repeat_lead")}</p>
    {#each LOOP_FAMILIES as info (info.id)}
      {@const chosen = info.id === loop.family}
      <button
        type="button"
        class="row"
        class:chosen
        style:--loop-ink={info.ink}
        role="menuitemradio"
        aria-checked={chosen}
        tabindex="-1"
        onclick={() => choose(info.id)}
      >
        <i class="fas {info.icon}" aria-hidden="true"></i>
        <b>{t(familyNameKey(info.id))}</b>
        <span>{t(familyPlainKey(info.id))}</span>
      </button>
    {/each}
    {#if loop.stepCount > 0}
      <button
        type="button"
        class="row all"
        role="menuitem"
        tabindex="-1"
        onclick={compare}
      >
        <i class="fas fa-table-list" aria-hidden="true"></i>
        <b>{t("create_loop_compare")}</b>
      </button>
    {/if}
    <button
      type="button"
      class="row all"
      role="menuitem"
      tabindex="-1"
      onclick={explain}
    >
      <i class="fas fa-question" aria-hidden="true"></i>
      <b>{t("create_loop_explain_title")}</b>
    </button>
  </div>
{/if}

<style>
  /* Under the LOOP bar, so the name stays lit while the menu is open. */
  .scrim {
    position: absolute;
    z-index: 2;
    inset: 0;
    background: color-mix(in srgb, #040812 60%, transparent);
  }

  .menu {
    position: absolute;
    z-index: 4;
    top: calc(var(--loop-tap) + 0.75rem);
    left: 50%;
    display: grid;
    grid-template-columns:
      1.5rem minmax(4.75rem, max-content) minmax(0, 1fr)
      auto;
    column-gap: 0.625rem;
    box-sizing: border-box;
    width: min(22rem, calc(100% - 1.5rem));
    max-height: calc(100% - var(--loop-tap) - 1.5rem);
    padding: 0.5rem;
    overflow-y: auto; /* scrolls: the five kinds, only in a very short window */
    border: 1px solid var(--theme-stroke);
    border-radius: 1rem;
    background: var(--surface-panel-opaque);
    translate: -50% 0;
  }

  .lead {
    grid-column: 1 / -1;
    margin: 0.375rem 0.625rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
  }

  .row {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    width: 100%;
    min-width: 0;
    min-height: 2.75rem;
    padding: 0 0.625rem;
    border: 0;
    border-radius: 0.625rem;
    background: transparent;
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-base, 16px);
    text-align: start;
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out);
  }

  .row i {
    color: var(--loop-ink, var(--theme-text-dim));
    text-align: center;
  }

  .row b {
    font-weight: 650;
  }

  .row span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.2;
    text-wrap: balance;
  }

  .row.chosen {
    background: color-mix(in srgb, var(--theme-text) 9%, transparent);
  }

  .all b {
    grid-column: 2 / -1;
  }

  .stacked .row {
    padding-block: 0.375rem;
  }

  .stacked .row i {
    grid-row: 1 / 3;
  }

  .stacked .row:not(.all) b {
    grid-row: 1;
    grid-column: 2 / 4;
  }

  .stacked .row span {
    grid-row: 2;
    grid-column: 2 / 4;
  }

  /* A rule between the kinds and what else there is. */
  .row:not(.all) + .all {
    margin-top: 0.5rem;
    border-top: 1px solid var(--theme-stroke);
    border-radius: 0 0 0.625rem 0.625rem;
  }

  /* A phone on its side: the whole list stays in view. */
  @container loop (max-height: 26rem) {
    .menu {
      width: min(28rem, calc(100% - 1.5rem));
      max-height: calc(100% - var(--loop-tap) - 1rem);
      padding: 0.375rem;
    }

    .lead {
      display: none;
    }

    .row {
      min-height: 2.25rem;
    }

    .row:not(.all) + .all {
      margin-top: 0.25rem;
    }
  }

  .row:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  @media (hover: hover) {
    .row:not(.chosen):hover {
      background: color-mix(in srgb, var(--theme-text) 5%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .row {
      transition: none;
    }
  }
</style>
