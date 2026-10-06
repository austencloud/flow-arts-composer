<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import type { Section } from "$lib/shared/navigation/domain/types";
  import type { CreateFrontDoorSource } from "$lib/shared/navigation/state/navigation-state.svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import LastUsedBadge from "$lib/shared/components/LastUsedBadge.svelte";
  import {
    logCreateFrontDoorViewed,
    logCreateMethodSelected,
  } from "../services/create-entry-analytics";

  const METHOD_ORDER = new Map([
    ["construct", 0],
    ["generate", 1],
    ["shape-engine", 2],
    ["fuse", 3],
    ["tunnel", 4],
    ["assemble", 5],
  ]);

  const NO_LOCKED_METHODS: ReadonlySet<string> = new Set();

  let {
    methods,
    lockedMethodIds = NO_LOCKED_METHODS,
    active,
    source,
    lastUsedMode = null,
    onSelect,
    onLockedSelect,
  }: {
    methods: Section[];
    /** Methods a guest can see but needs a free account to open. They keep
     *  their place in the bento so the board never changes shape at sign-in. */
    lockedMethodIds?: ReadonlySet<string>;
    active: boolean;
    source: CreateFrontDoorSource;
    lastUsedMode?: string | null;
    onSelect: (methodId: string) => void;
    onLockedSelect?: (methodId: string) => void;
  } = $props();

  const orderedMethods = $derived(
    [...methods].sort(
      (a, b) =>
        (METHOD_ORDER.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (METHOD_ORDER.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    )
  );
  let wasActive = false;
  let haptics: ReturnType<typeof getHapticFeedback> | null = null;

  onMount(() => {
    try {
      haptics = getHapticFeedback();
    } catch {
      // A browser without haptics still gets the complete button interaction.
    }
  });

  $effect(() => {
    if (active && !wasActive) {
      logCreateFrontDoorViewed({
        source,
        methodCount: orderedMethods.length,
      });
    }
    wasActive = active;
  });

  function selectMethod(methodId: string, trigger: HTMLButtonElement): void {
    const locked = lockedMethodIds.has(methodId);
    haptics?.trigger("selection");
    logCreateMethodSelected({
      method: methodId,
      source,
      isLastUsed: !locked && methodId === lastUsedMode,
      isLocked: locked,
    });
    trigger.blur();
    if (locked) {
      onLockedSelect?.(methodId);
      return;
    }
    onSelect(methodId);
  }

  function accessibleName(method: Section): string | undefined {
    const values = {
      name: t(method.labelKey),
      description: t(method.descKey),
    };
    if (lockedMethodIds.has(method.id)) {
      return t("create_ui_account_method", values);
    }
    if (method.id === lastUsedMode) {
      return t("create_ui_last_used_method", values);
    }
    return undefined;
  }
</script>

<section class="front-door" aria-labelledby="create-front-door-title">
  <div class="front-door-inner" class:two-methods={orderedMethods.length === 2}>
    <header class="front-door-header">
      <h1 id="create-front-door-title">
        {t("create_ui_how_do_you_want_to_create")}
      </h1>
    </header>

    <div
      class="method-index"
      role="list"
      aria-label={t("create_ui_creation_methods")}
      data-method-count={orderedMethods.length}
    >
      {#each orderedMethods as method (method.id)}
        <!-- On the two-column phone board Construct leads with its own row
             only when that leaves the rest in even pairs. -->
        <div
          class="method-item"
          class:primary-method={method.id === "construct" ||
            method.id === "generate"}
          class:default-method={method.id === "construct" &&
            orderedMethods.length % 2 === 1}
          role="listitem"
        >
          <button
            type="button"
            class="method-card"
            data-method-id={method.id}
            style:--method-color={method.color ?? "var(--theme-accent)"}
            aria-label={accessibleName(method)}
            onclick={(event) => selectMethod(method.id, event.currentTarget)}
          >
            {#if lockedMethodIds.has(method.id)}
              <LastUsedBadge label={t("create_ui_account_badge")} />
            {:else if method.id === lastUsedMode}
              <LastUsedBadge />
            {/if}

            <span class="method-icon" aria-hidden="true">
              {@html method.icon}
            </span>

            <span class="method-copy">
              <span class="method-name">{t(method.labelKey)}</span>
              {#if method.descKey}
                <span class="method-description">{t(method.descKey)}</span>
              {/if}
            </span>
          </button>
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  .front-door {
    width: 100%;
    height: 100%;
    overflow: auto;
    container: create-entry / size;
  }

  .front-door-inner {
    width: calc(100% - clamp(20px, 3cqi, 80px));
    min-height: 100%;
    margin: 0 auto;
    padding-block: clamp(20px, 4cqh, 52px);
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(min-content, 1fr);
    gap: clamp(16px, 2.5cqh, 24px);
  }

  .front-door-header {
    width: 100%;
  }

  h1 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-3xl, 1.875rem);
    font-weight: 720;
    line-height: 1.08;
    letter-spacing: -0.025em;
    text-wrap: balance;
  }

  .method-index {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: minmax(min-content, 1fr);
    column-gap: 8px;
    row-gap: 16px;
    width: 100%;
    padding-top: 12px;
    box-sizing: border-box;
  }

  .method-item {
    min-width: 0;
    display: flex;
  }

  .method-item.default-method {
    grid-column: 1 / -1;
  }

  .method-card {
    --last-used-badge-accent: var(--method-color);

    position: relative;
    width: 100%;
    min-height: 174px;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 12px;
    padding: 14px;
    box-sizing: border-box;
    border: 1px solid
      color-mix(in srgb, var(--method-color) 30%, var(--theme-stroke));
    border-radius: var(--radius-2026-md, 14px);
    background: color-mix(
      in srgb,
      var(--method-color) 11%,
      var(--theme-card-bg)
    );
    color: var(--theme-text);
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
  }

  .method-item.default-method .method-card {
    min-height: 92px;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
  }

  .method-card:hover {
    background: color-mix(
      in srgb,
      var(--method-color) 18%,
      var(--theme-card-bg)
    );
    border-color: color-mix(
      in srgb,
      var(--method-color) 58%,
      var(--theme-stroke-strong)
    );
  }

  .method-card:active {
    background: color-mix(
      in srgb,
      var(--method-color) 22%,
      var(--theme-card-bg)
    );
  }

  .method-card:focus-visible {
    z-index: 1;
    outline: 3px solid
      color-mix(in srgb, var(--method-color) 76%, var(--theme-text));
    outline-offset: 2px;
  }

  .method-icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid
      color-mix(in srgb, var(--method-color) 42%, var(--theme-stroke));
    border-radius: var(--radius-2026-sm, 10px);
    background: color-mix(
      in srgb,
      var(--method-color) 20%,
      var(--theme-card-bg)
    );
    color: var(--method-color);
    font-size: var(--font-size-base, 1rem);
    flex: 0 0 auto;
  }

  .method-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .method-name {
    color: var(--theme-text);
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: 720;
    line-height: 1.15;
  }

  .method-description {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.42;
    text-wrap: pretty;
  }

  @container create-entry (min-width: 480px) and (max-width: 1199px) {
    .front-door-inner {
      width: calc(100% - 28px);
    }

    .method-card,
    .method-item.default-method .method-card {
      --settings-method-icon-size: clamp(44px, 6cqi, 56px);
      min-height: 132px;
      display: grid;
      grid-template-columns: var(--settings-method-icon-size) minmax(0, 1fr);
      align-items: center;
      gap: 14px;
      padding: 14px;
    }

    .method-icon {
      width: var(--settings-method-icon-size);
      height: var(--settings-method-icon-size);
      font-size: var(--font-size-lg, 1.125rem);
    }

    .method-name {
      font-size: clamp(1.125rem, 2.8cqi, 1.5rem);
    }

    .method-description {
      font-size: clamp(14px, 1.9cqi, 1rem);
    }
  }

  @container create-entry (max-width: 619px) {
    .two-methods .method-index {
      grid-template-columns: minmax(0, 1fr);
      grid-auto-rows: 1fr;
    }

    .two-methods .method-item {
      grid-column: 1 / -1;
    }

    .two-methods .method-card,
    .two-methods .method-item.default-method .method-card {
      min-height: 112px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 16px;
      padding: 18px;
    }
  }

  /* Foldables keep two readable columns. Four secondary cards only fit
     once each card has room for its icon, padding, and description. */
  @container create-entry (min-width: 1200px) {
    .front-door-inner {
      width: calc(100% - clamp(48px, 6cqi, 160px));
      max-width: 1440px;
      grid-template-rows: auto auto;
      align-content: center;
      gap: 28px;
      padding-block: 40px;
    }

    /* Two primary cards fill the first row and the secondary cards share
       the second, so no card ever wraps alone. Three methods sit in one
       row of three. */
    .method-index {
      grid-template-columns: repeat(12, minmax(0, 1fr));
      grid-auto-rows: auto;
      column-gap: 20px;
      row-gap: 28px;
    }

    h1 {
      font-size: clamp(2.5rem, 3cqi, 3rem);
    }

    .method-item.primary-method {
      grid-column: span 6;
    }

    .method-item:not(.primary-method),
    .method-index[data-method-count="3"] .method-item {
      grid-column: span 4;
    }

    .method-index[data-method-count="4"] .method-item:not(.primary-method) {
      grid-column: span 6;
    }

    .method-index[data-method-count="6"] .method-item:not(.primary-method) {
      grid-column: span 3;
    }

    .method-card,
    .method-item.default-method .method-card {
      --settings-method-icon-size: 48px;
      min-height: 208px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: flex-start;
      gap: 20px;
      padding: 28px;
      background: color-mix(
        in srgb,
        var(--method-color) 6%,
        var(--theme-card-bg)
      );
    }

    .method-item.primary-method .method-card {
      --settings-method-icon-size: 72px;
      min-height: 200px;
      display: grid;
      grid-template-columns: var(--settings-method-icon-size) minmax(0, 1fr);
      align-items: center;
      gap: 24px;
      padding: 32px;
      background: color-mix(
        in srgb,
        var(--method-color) 11%,
        var(--theme-card-bg)
      );
    }

    .method-icon {
      width: var(--settings-method-icon-size);
      height: var(--settings-method-icon-size);
      font-size: 1.25rem;
    }

    .primary-method .method-icon {
      font-size: 1.75rem;
    }

    .method-copy {
      gap: 8px;
    }

    .method-name {
      font-size: 1.5rem;
    }

    .primary-method .method-name {
      font-size: 2rem;
    }

    .method-description {
      font-size: 1rem;
      max-width: 38ch;
      text-wrap: pretty;
    }

    .primary-method .method-description {
      font-size: 1.125rem;
    }
  }

  /* A larger window adds breathing room around the decision. It doesn't
     enlarge the controls or separate related choices across the monitor. */
  @container create-entry (min-width: 2000px) {
    .front-door-inner {
      max-width: 1600px;
    }
  }

  @container create-entry (max-height: 640px) and (min-width: 760px) {
    .front-door-inner {
      width: calc(100% - 28px);
      gap: 8px;
      padding-block: 6px 8px;
    }

    h1 {
      font-size: var(--font-size-3xl, 1.875rem);
    }

    .method-index {
      column-gap: 6px;
      row-gap: 16px;
    }

    .method-card,
    .method-item.primary-method .method-card,
    .method-item.default-method .method-card {
      min-height: 104px;
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
    }

    .method-icon {
      width: 36px;
      height: 36px;
      font-size: var(--font-size-base, 1rem);
    }

    .primary-method .method-icon {
      font-size: var(--font-size-base, 1rem);
    }

    .method-copy {
      gap: 2px;
    }

    .method-name,
    .primary-method .method-name {
      font-size: var(--font-size-lg, 1.125rem);
    }

    .method-description,
    .primary-method .method-description {
      font-size: var(--font-size-min, 14px);
      line-height: 1.25;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .method-card {
      transition: none;
    }
  }
</style>
