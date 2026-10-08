<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { onMount, untrack } from "svelte";
  import type { Section } from "$lib/shared/navigation/domain/types";
  import type { CreateFrontDoorSource } from "$lib/shared/navigation/state/navigation-state.svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import LastUsedBadge from "$lib/shared/components/LastUsedBadge.svelte";
  import {
    createRenderActivityGate,
    renderGateTarget,
  } from "$lib/shared/render-gating/render-activity-gate";
  import { runAfterNamedRouteMorphIdle } from "$lib/shared/transitions/named-route-morph-state.svelte";
  import {
    logCreateFrontDoorViewed,
    logCreateMethodSelected,
  } from "../services/create-entry-analytics";
  import { createMethodPreviewTurns } from "../state/method-preview-turns.svelte";
  import CreateMethodPreview from "./method-previews/CreateMethodPreview.svelte";
  import { methodPreviewHold } from "./method-previews/method-preview-hold";
  import { METHOD_PREVIEW_SCENES } from "./method-previews/method-preview-scenes";

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

  // Each card shows its method at work, and the cards take turns (spec:
  // docs/superpowers/specs/2026-10-06-create-method-previews-design.md).
  // A method without a preview scene keeps its icon box.
  function hasScene(methodId: string): boolean {
    return Object.hasOwn(METHOD_PREVIEW_SCENES, methodId);
  }

  /** Cards whose scene has drawn its finished picture. */
  const readyIds = new Set<string>();

  const turns = createMethodPreviewTurns({
    order: () =>
      orderedMethods
        .filter((method) => hasScene(method.id))
        .map((method) => method.id),
    isReady: (methodId) => readyIds.has(methodId),
    defer: runAfterNamedRouteMorphIdle,
  });

  function handleReady(methodId: string): void {
    readyIds.add(methodId);
    turns.notifyReady(methodId);
  }

  // Turns pause while the page is hidden or the board is off screen.
  const previewGate = createRenderActivityGate({
    name: "create-method-previews",
  });

  // CreateModule keeps the front door mounted behind a workspace, so the
  // previews mount the first time the board opens, not on every Create route.
  let previewsWanted = $state(false);

  // The system setting reports changes through its media query.
  let systemMotion = $state(0);
  const appReducedMotion = $derived(getSettings().reducedMotion ?? false);

  onMount(() => {
    try {
      haptics = getHapticFeedback();
    } catch {
      // A browser without haptics still gets the complete button interaction.
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = (): void => {
      systemMotion += 1;
    };
    motionQuery.addEventListener("change", onMotionChange);

    turns.setActive(previewGate.active);
    const unsubscribe = previewGate.subscribe((value) =>
      turns.setActive(value)
    );

    return () => {
      motionQuery.removeEventListener("change", onMotionChange);
      unsubscribe();
      previewGate.dispose();
      turns.dispose();
    };
  });

  // Opening the board starts two rounds and closing it ends them. A change
  // to either reduce-motion setting starts over, so the turns stop at once
  // when motion is reduced and come back when it is not.
  $effect(() => {
    const open = active;
    void systemMotion;
    void appReducedMotion;
    untrack(() => {
      if (!open) {
        turns.stop();
        return;
      }
      previewsWanted = true;
      turns.start();
    });
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
    // Choosing a method ends the turns.
    turns.stop();
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
      data-playing-method={turns.playingId}
      use:renderGateTarget={previewGate}
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
            use:methodPreviewHold={{ turns, id: method.id }}
          >
            {#if lockedMethodIds.has(method.id)}
              <LastUsedBadge label={t("create_ui_account_badge")} />
            {:else if method.id === lastUsedMode}
              <LastUsedBadge />
            {/if}

            <span class="method-stage" aria-hidden="true">
              {#if hasScene(method.id)}
                {#if previewsWanted}
                  <CreateMethodPreview
                    methodId={method.id}
                    color={method.color ?? "var(--theme-accent)"}
                    playing={turns.playingId === method.id}
                    turn={turns.turn}
                    onready={handleReady}
                  />
                {/if}
              {:else}
                <span class="method-icon">{@html method.icon}</span>
              {/if}
            </span>

            <span class="method-copy">
              <span class="method-name"
                >{#if hasScene(method.id)}<span
                    class="method-glyph"
                    aria-hidden="true">{@html method.icon}</span
                  >{/if}{t(method.labelKey)}</span
              >
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

  /* Each card holds a stage for its preview, then its words. A strip stage
     sits above the words and takes the room its row has; a square stage
     sits beside them (spec: Placement). --preview-min is a strip's least
     height and --preview-side a square's side. Each tier sets both from the
     room its cards have, and a square never makes its card taller. */
  .method-index {
    --preview-min: 40px;
    --preview-side: clamp(40px, 9cqh, 62px);

    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    /* A card takes two rows, its stage and its words. Cards side by side
       share both, so their stages match and their names line up. */
    grid-auto-rows: 1fr auto;
    column-gap: 8px;
    row-gap: 16px;
    width: 100%;
    padding-top: 12px;
    box-sizing: border-box;
  }

  .method-item {
    min-width: 0;
    grid-row: span 2;
    display: grid;
    grid-template-rows: subgrid;
    grid-template-columns: minmax(0, 1fr);
  }

  .method-item.default-method {
    grid-column: 1 / -1;
  }

  .method-card {
    --last-used-badge-accent: var(--method-color);

    position: relative;
    grid-row: 1 / -1;
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-rows: subgrid;
    grid-template-columns: minmax(0, 1fr);
    row-gap: 12px;
    column-gap: 12px;
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

  /* Construct, alone on its row, sets its square beside its words. */
  .method-item.default-method .method-card {
    min-height: 92px;
    grid-template-rows: none;
    grid-template-columns: var(--preview-side) minmax(0, 1fr);
    align-items: center;
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

  .method-stage {
    position: relative;
    grid-row: 1;
    grid-column: 1;
    display: grid;
    align-items: center;
    justify-items: start;
    min-width: 0;
    min-height: var(--preview-min);
    border-radius: var(--radius-2026-sm, 10px);
  }

  .method-item.default-method .method-stage {
    width: var(--preview-side);
    aspect-ratio: 1;
    min-height: 0;
    justify-items: center;
  }

  /* A method without a preview scene keeps its icon box in the stage. */
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
    grid-row: 2;
    grid-column: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .method-item.default-method .method-copy {
    grid-row: 1;
    grid-column: 2;
  }

  .method-name {
    color: var(--theme-text);
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: 720;
    line-height: 1.15;
  }

  /* The method's icon stays beside its name. */
  .method-glyph {
    display: inline-block;
    margin-inline-end: 0.4em;
    color: var(--method-color);
    font-size: 0.9em;
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

    .method-index {
      --preview-min: clamp(44px, 6cqi, 56px);
      --preview-side: clamp(56px, 12cqi, 102px);
    }

    .method-card {
      --settings-method-icon-size: clamp(44px, 6cqi, 56px);
      column-gap: 14px;
      padding: 14px;
    }

    .method-item.default-method .method-card {
      min-height: 132px;
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

  /* A landscape board is short, so every card sets its square beside its
     words and the rows share the height. */
  @container create-entry (min-width: 480px) and (max-width: 1199px) and (orientation: landscape) {
    .method-index {
      --preview-side: clamp(49px, min(18cqi, 20cqh), 140px);
      grid-auto-rows: minmax(min-content, 1fr);
    }

    .method-item {
      grid-row: auto;
      display: flex;
    }

    .method-card,
    .method-item.default-method .method-card {
      min-height: 132px;
      grid-template-rows: none;
      grid-template-columns: var(--preview-side) minmax(0, 1fr);
      align-items: start;
    }

    .method-stage,
    .method-item.default-method .method-stage {
      width: var(--preview-side);
      aspect-ratio: 1;
      min-height: 0;
      justify-items: center;
    }

    .method-copy,
    .method-item.default-method .method-copy {
      grid-row: 1;
      grid-column: 2;
    }
  }

  @container create-entry (max-width: 619px) {
    .two-methods .method-index {
      --preview-side: clamp(48px, 16cqi, 74px);
      grid-template-columns: minmax(0, 1fr);
      grid-auto-rows: 1fr;
    }

    .two-methods .method-item {
      grid-column: 1 / -1;
      grid-row: auto;
      display: flex;
    }

    .two-methods .method-card,
    .two-methods .method-item.default-method .method-card {
      min-height: 112px;
      grid-template-rows: none;
      grid-template-columns: var(--preview-side) minmax(0, 1fr);
      align-items: center;
      column-gap: 16px;
      padding: 18px;
    }

    .two-methods .method-stage,
    .two-methods .method-item.default-method .method-stage {
      width: var(--preview-side);
      aspect-ratio: 1;
      min-height: 0;
      justify-items: center;
    }

    .two-methods .method-copy,
    .two-methods .method-item.default-method .method-copy {
      grid-row: 1;
      grid-column: 2;
    }
  }

  /* Foldables keep two readable columns. Four secondary cards only fit
     once each card has room for its stage, padding, and description. */
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
      --preview-min: clamp(64px, 11cqh, 180px);
      --preview-side: clamp(72px, 9.5cqi, 134px);
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

    .method-card {
      --settings-method-icon-size: 48px;
      row-gap: 20px;
      column-gap: 20px;
      padding: 28px;
      background: color-mix(
        in srgb,
        var(--method-color) 6%,
        var(--theme-card-bg)
      );
    }

    /* Primary cards, and all three cards of a three-method board, set the
       square beside their words. */
    .method-item.primary-method .method-card,
    .method-index[data-method-count="3"] .method-card {
      min-height: 200px;
      grid-template-rows: none;
      grid-template-columns: var(--preview-side) minmax(0, 1fr);
      align-items: start;
      column-gap: 24px;
      padding: 32px;
    }

    .method-item.primary-method .method-card {
      --settings-method-icon-size: 72px;
      background: color-mix(
        in srgb,
        var(--method-color) 11%,
        var(--theme-card-bg)
      );
    }

    .method-item.primary-method .method-stage,
    .method-index[data-method-count="3"] .method-stage {
      width: var(--preview-side);
      aspect-ratio: 1;
      min-height: 0;
      justify-items: center;
    }

    .method-item.primary-method .method-copy,
    .method-index[data-method-count="3"] .method-copy {
      grid-row: 1;
      grid-column: 2;
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
      --preview-side: clamp(36px, 20cqh, 86px);
      grid-auto-rows: minmax(min-content, 1fr);
      column-gap: 6px;
      row-gap: 16px;
    }

    .method-item {
      grid-row: auto;
      display: flex;
    }

    .method-card,
    .method-item.primary-method .method-card,
    .method-item.default-method .method-card,
    .method-index[data-method-count="3"] .method-card {
      min-height: 104px;
      grid-template-rows: none;
      grid-template-columns: var(--preview-side) minmax(0, 1fr);
      align-items: start;
      column-gap: 10px;
      padding: 8px 12px;
    }

    .method-stage,
    .method-item.primary-method .method-stage,
    .method-item.default-method .method-stage,
    .method-index[data-method-count="3"] .method-stage {
      width: var(--preview-side);
      aspect-ratio: 1;
      min-height: 0;
      justify-items: center;
    }

    .method-copy,
    .method-item.primary-method .method-copy,
    .method-item.default-method .method-copy,
    .method-index[data-method-count="3"] .method-copy {
      grid-row: 1;
      grid-column: 2;
      gap: 2px;
    }

    .method-icon {
      width: 36px;
      height: 36px;
      font-size: var(--font-size-base, 1rem);
    }

    .primary-method .method-icon {
      font-size: var(--font-size-base, 1rem);
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
