<script lang="ts">
  /**
   * Bench for the Create front door's method previews. Spec:
   * docs/superpowers/specs/2026-10-06-create-method-previews-design.md
   *
   * "Sizes" shows every scene in the four box sizes the front door's tiers
   * produce. "Compositions" shows the two card compositions the composition
   * review compares, at the opened Fold's card sizes. One turn coordinator
   * drives both views, with the front door's hover and keyboard holds.
   *
   * `?view=front-door` renders the real front door alone, for the layout
   * check: `count` (2 to 6 methods, in board order), `guest=1` (Free
   * account badges), and `last` (a method id, or `none`; default Generate);
   * `w` and `h` (CSS px) size the board like /create's, which loses the
   * app's navigation.
   */
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import LastUsedBadge from "$lib/shared/components/LastUsedBadge.svelte";
  import { isTabAccessible } from "$lib/shared/auth/domain/guest-access-config";
  import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";
  import CreateFrontDoor from "$lib/features/create/shared/components/CreateFrontDoor.svelte";
  import CreateMethodPreview from "$lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte";
  import { methodPreviewHold } from "$lib/features/create/shared/components/method-previews/method-preview-hold";
  import {
    createMethodPreviewTurns,
    previewMotionReduced,
  } from "$lib/features/create/shared/state/method-preview-turns.svelte";

  const ORDER = [
    "construct",
    "generate",
    "shape-engine",
    "fuse",
    "tunnel",
    "assemble",
  ];
  const methods = ORDER.flatMap((id) =>
    CREATE_TABS.filter((tab) => tab.id === id)
  );

  const BOXES = [
    { label: "Strip 146×48 (iPhone SE)", width: 146, height: 48 },
    { label: "Roomy strip 308×96 (Fold portrait)", width: 308, height: 96 },
    { label: "Square 144×144 (Fold landscape)", width: 144, height: 144 },
    { label: "Large square 200×200 (desktop)", width: 200, height: 200 },
  ];

  const CARDS = {
    portrait: { label: "Fold portrait 336×207", width: 336, height: 207 },
    landscape: { label: "Fold landscape 394×172", width: 394, height: 172 },
  } as const;
  type CardShape = keyof typeof CARDS;
  type View = "sizes" | "compositions" | "front-door";

  // Each check loads the page fresh, so the URL is read once.
  const params = page.url.searchParams;
  const frontDoorCount = Math.min(
    6,
    Math.max(2, Number(params.get("count") ?? 6) || 6)
  );
  const frontDoorLastParam = params.get("last") ?? "generate";
  const frontDoorLast =
    frontDoorLastParam === "none" ? null : frontDoorLastParam;
  const frontDoorMethods = methods.slice(0, frontDoorCount);
  const frontDoorLocked: ReadonlySet<string> = new Set(
    params.get("guest") === "1"
      ? frontDoorMethods
          .filter((method) => !isTabAccessible("create", method.id, "guest"))
          .map((method) => method.id)
      : []
  );
  // The layout check passes /create's board size (`w`, `h`, in CSS px), so the
  // bench board gets the same container as the real one, which loses the
  // app's navigation. Without them the board fills the window.
  const sizeParam = (name: string) => {
    const value = Number(params.get(name));
    return Number.isFinite(value) && value > 0 ? `${value}px` : null;
  };
  const frontDoorWidth = sizeParam("w");
  const frontDoorHeight = sizeParam("h");

  let view = $state<View>(
    params.get("view") === "front-door" ? "front-door" : "sizes"
  );
  let cardShape = $state<CardShape>("portrait");
  let reduce = $state(false);
  let initialPreference: string | undefined;
  /** The front door marks the last used method; Generate stands in for it. */
  const LAST_USED = "generate";
  let guest = $state(false);
  /**
   * A portrait board's height: its card rows and the 16px gaps between them.
   * The front door's rows share their board's height the same way. A
   * landscape board sizes by its cards.
   */
  const portraitBoardHeight = $derived(
    cardShape === "portrait"
      ? Math.ceil(methods.length / 2) * CARDS.portrait.height +
          (Math.ceil(methods.length / 2) - 1) * 16
      : undefined
  );

  /** As a guest, methods outside the guest tier carry the Free account badge. */
  function lockedFor(id: string): boolean {
    return guest && !isTabAccessible("create", id, "guest");
  }

  const readyIds = new Set<string>();
  const turns = createMethodPreviewTurns({
    order: () => methods.map((method) => method.id),
    isReady: (id) => readyIds.has(id),
  });

  function handleReady(id: string): void {
    if (readyIds.has(id)) return;
    readyIds.add(id);
    turns.notifyReady(id);
  }

  /** A new view mounts new boxes, so readiness and rounds start over. */
  function showView(next: View): void {
    if (next === view) return;
    view = next;
    readyIds.clear();
    turns.start();
  }

  /** Same boxes at a new size: the scenes re-compose, and rounds restart. */
  function showCardShape(next: CardShape): void {
    cardShape = next;
    turns.start();
  }

  function setMotionAttribute(value: string | undefined): void {
    const root = document.documentElement;
    if (value === undefined) delete root.dataset.motionPreference;
    else root.dataset.motionPreference = value;
  }

  /** Flips the reduced-motion attribute on <html>, which reducedMotion() reads like the system setting. */
  function toggleReduce(): void {
    setMotionAttribute(
      document.documentElement.dataset.motionPreference === "reduce"
        ? undefined
        : "reduce"
    );
    reduce = previewMotionReduced();
    turns.start();
  }

  onMount(() => {
    // This route renders outside the app shell, so nothing has set the theme
    // variables the cards paint with. Reading the device's saved background
    // keeps the cards in the app's palette.
    void import("$lib/shared/settings/utils/background-theme-calculator").then(
      ({ ensureThemeApplied }) => ensureThemeApplied()
    );
    initialPreference = document.documentElement.dataset.motionPreference;
    reduce = previewMotionReduced();
    // The front door view runs the real front door's own turns.
    if (view !== "front-door") turns.start();
    return () => {
      turns.dispose();
      setMotionAttribute(initialPreference);
    };
  });
</script>

<svelte:head>
  <title>Create method previews</title>
</svelte:head>

{#if view === "front-door"}
  <div
    class="front-door-frame"
    style:width={frontDoorWidth}
    style:height={frontDoorHeight}
    data-count={frontDoorMethods.length}
    data-last={frontDoorLast ?? "none"}
    data-guest={frontDoorLocked.size > 0}
  >
    <CreateFrontDoor
      methods={frontDoorMethods}
      lockedMethodIds={frontDoorLocked}
      active={true}
      source="direct"
      lastUsedMode={frontDoorLast}
      onSelect={() => {}}
      onLockedSelect={() => {}}
    />
  </div>
{:else}
  <main class="bench">
    <header class="bench-bar">
      <h1>Create method previews</h1>
      <div class="bench-controls">
        <button
          type="button"
          aria-pressed={view === "sizes"}
          onclick={() => showView("sizes")}>Sizes</button
        >
        <button
          type="button"
          aria-pressed={view === "compositions"}
          onclick={() => showView("compositions")}>Compositions</button
        >
        <button type="button" onclick={() => turns.start()}
          >Restart rounds</button
        >
        <button type="button" aria-pressed={reduce} onclick={toggleReduce}
          >Reduce motion</button
        >
        <output data-testid="turn-status"
          >{turns.playingId ?? "resting"} · turn {turns.turn}</output
        >
      </div>
    </header>

    {#if view === "sizes"}
      <div class="sizes-scroll">
        <table class="sizes">
          <thead>
            <tr>
              <th scope="col">Method</th>
              {#each BOXES as box (box.label)}
                <th scope="col">{box.label}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each methods as method (method.id)}
              <tr>
                <th scope="row">{t(method.labelKey)}</th>
                {#each BOXES as box (box.label)}
                  <td>
                    <span
                      class="bench-box"
                      style:width="{box.width}px"
                      style:height="{box.height}px"
                      use:methodPreviewHold={{ turns, id: method.id }}
                    >
                      <CreateMethodPreview
                        methodId={method.id}
                        color={method.color ?? "#8b8cff"}
                        playing={turns.playingId === method.id}
                        turn={turns.turn}
                        onready={handleReady}
                      />
                    </span>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="bench-controls">
        {#each Object.entries(CARDS) as [key, card] (key)}
          <button
            type="button"
            aria-pressed={cardShape === key}
            onclick={() => showCardShape(key as CardShape)}>{card.label}</button
          >
        {/each}
        <button
          type="button"
          aria-pressed={guest}
          onclick={() => (guest = !guest)}>Guest</button
        >
      </div>
      <div class="compositions">
        {#each ["inset", "edge"] as composition (composition)}
          <section aria-labelledby={`composition-${composition}`}>
            <h2 id={`composition-${composition}`}>
              {composition === "inset" ? "A: inset stage" : "B: edge to edge"}
            </h2>
            <div
              class="mock-board"
              class:landscape={cardShape === "landscape"}
              style:height={portraitBoardHeight === undefined
                ? undefined
                : `${portraitBoardHeight}px`}
            >
              {#each methods as method (method.id)}
                <button
                  type="button"
                  class="mock-card"
                  class:edge={composition === "edge"}
                  class:square={cardShape === "landscape"}
                  style:--method-color={method.color ?? "#8b8cff"}
                  style:width="{CARDS[cardShape].width}px"
                  style:height={cardShape === "landscape"
                    ? `${CARDS.landscape.height}px`
                    : undefined}
                  use:methodPreviewHold={{ turns, id: method.id }}
                >
                  {#if lockedFor(method.id)}
                    <LastUsedBadge label={t("create_ui_account_badge")} />
                  {:else if method.id === LAST_USED}
                    <LastUsedBadge />
                  {/if}
                  <span class="mock-stage">
                    <CreateMethodPreview
                      methodId={method.id}
                      color={method.color ?? "#8b8cff"}
                      playing={turns.playingId === method.id}
                      turn={turns.turn}
                      onready={handleReady}
                    />
                  </span>
                  <span class="mock-copy">
                    <span class="mock-name">
                      <span class="mock-icon" aria-hidden="true"
                        >{@html method.icon}</span
                      >
                      {t(method.labelKey)}
                    </span>
                    {#if method.descKey}
                      <span class="mock-description">{t(method.descKey)}</span>
                    {/if}
                  </span>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    {/if}
  </main>
{/if}

<style>
  .bench {
    min-height: 100dvh;
    padding: 16px;
    box-sizing: border-box;
    background: var(--theme-panel-bg, #0f0f14);
    color: var(--theme-text, #f4f4f8);
  }

  .bench-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  h1 {
    margin: 0;
    font-size: 1.25rem;
  }

  h2 {
    margin: 0 0 12px;
    font-size: 1rem;
  }

  .bench-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .bench-controls button[aria-pressed="true"] {
    outline: 2px solid currentColor;
  }

  .sizes-scroll {
    overflow-x: auto;
  }

  .sizes {
    border-collapse: separate;
    border-spacing: 12px;
  }

  .sizes th {
    text-align: left;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--theme-text-dim, #b8b8c4);
  }

  .bench-box {
    position: relative;
    display: block;
    border-radius: 10px;
    outline: 1px dashed color-mix(in srgb, currentColor 30%, transparent);
  }

  .compositions {
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
  }

  /* A portrait card takes two rows, its stage and its words. Cards side by
     side share both, so their names line up. The rows share the board's
     height, as on the front door: a row whose description wraps runs a
     little taller, and the average card keeps the Fold's measured height. */
  .mock-board {
    display: grid;
    grid-template-columns: repeat(2, max-content);
    grid-auto-rows: minmax(0, 1fr) auto;
    gap: 16px 8px;
  }

  /* A landscape card sets its square beside its words, one row each. */
  .mock-board.landscape {
    grid-auto-rows: minmax(min-content, 1fr);
  }

  /* Mirrors the front door card Task 18 plans (.method-item and
     .method-card), at the bench's fixed card width. */
  .mock-card {
    --last-used-badge-accent: var(--method-color);

    position: relative;
    box-sizing: border-box;
    grid-row: span 2;
    display: grid;
    grid-template-rows: subgrid;
    grid-template-columns: minmax(0, 1fr);
    row-gap: 12px;
    padding: 14px;
    border: 1px solid
      color-mix(in srgb, var(--method-color) 30%, var(--theme-stroke, #2c2c36));
    border-radius: var(--radius-2026-md, 14px);
    background: color-mix(
      in srgb,
      var(--method-color) 11%,
      var(--theme-card-bg, #16161d)
    );
    color: var(--theme-text, #f4f4f8);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .mock-card:focus-visible {
    outline: 3px solid
      color-mix(in srgb, var(--method-color) 76%, var(--theme-text, #fff));
    outline-offset: 2px;
  }

  .mock-stage {
    position: relative;
    grid-row: 1;
    display: block;
    min-height: 44px;
    border-radius: var(--radius-2026-sm, 10px);
  }

  /* The badge overhangs the top border by 11px each way, so B's strip
     starts just below it and runs to the side borders. */
  .mock-card.edge .mock-stage {
    margin: -2px -14px 0;
    border-radius: 0;
  }

  .mock-card.square {
    grid-row: auto;
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }

  .mock-card.square .mock-stage {
    flex: none;
    align-self: stretch;
    aspect-ratio: 1;
    min-width: 44px;
  }

  .mock-card.square.edge .mock-stage {
    margin: -14px 0 -14px -14px;
    border-radius: 13px 0 0 13px;
  }

  .mock-copy {
    grid-row: 2;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .mock-name {
    display: flex;
    align-items: center;
    gap: 0.4em;
    font-size: 1.25rem;
    font-weight: 720;
    line-height: 1.15;
  }

  .mock-icon {
    color: var(--method-color);
    font-size: 0.9em;
  }

  .mock-description {
    color: var(--theme-text-dim, #b8b8c4);
    font-size: 14px;
    line-height: 1.42;
    text-wrap: pretty;
  }

  /* The front door view fills the window unless `w` and `h` size it. */
  .front-door-frame {
    position: fixed;
    inset: 0;
    background: var(--theme-panel-bg, #0f0f14);
    color: var(--theme-text, #f4f4f8);
  }
</style>
