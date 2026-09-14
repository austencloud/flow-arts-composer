<script lang="ts">
  /**
   * Front + back of a real Choreo Card for the marketing page.
   * Front = baked print render (Firebase Storage URL from the admin cover
   * bake, instant load). Back = live CardBack render fed the same sequence,
   * so the anatomy can never drift from the real card design.
   *
   * No markers sit on the cards. The page's legend rows drive `highlight`;
   * the matching region gets a spotlight (everything else dims) so the
   * cards stay pristine until the reader asks about a part.
   */
  import { onMount, tick, untrack } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import CardBack from "$lib/features/choreo-card/components/card-back/CardBack.svelte";
  import { computeFrontRegions } from "../services/card-front-regions";
  import ContextMenu from "$lib/shared/components/context-menu/ContextMenu.svelte";
  import type {
    ContextMenuState,
    ContextMenuEntry,
  } from "$lib/shared/components/context-menu/context-menu-types";
  import { composeMenu } from "$lib/shared/components/context-menu/compose-menu";
  import { buildCardMenuSection } from "$lib/shared/choreo-card/services/card-menu-section";
  import { featureFlagService } from "$lib/shared/auth/services/post-hog-feature-flag-service.svelte";
  import SkeletonLoader from "$lib/shared/foundation/ui/SkeletonLoader.svelte";
  import ArtifactRegionSpotlight from "$lib/shared/components/ArtifactRegionSpotlight.svelte";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { CARD_SIZES } from "$lib/features/choreo-card/domain/card-sizes";

  let {
    highlight = null,
    onhighlight,
    face = "both",
    sequence = undefined,
    frontUrl = undefined,
    showShuffle = true,
    onstatuschange,
    handPathCard = false,
    qrUrl,
    cardTitle,
  }: {
    highlight?: string | null;
    onhighlight?: (id: string | null) => void;
    /** "both" = desktop side-by-side; "front"/"back" = mobile single face. */
    face?: "both" | "front" | "back";
    /** Drive a SPECIFIC card instead of the self-loaded/shuffled example. When
     *  set, the onMount auto-load and the shuffle button are skipped, and this
     *  sequence's real front + live back are shown (the click-to-explain modal
     *  path). Absent ⇒ the marketing page's self-chosen, shuffleable card. */
    sequence?: SequenceData;
    /** Baked front image for `sequence` (instant). Rendered on the fly when
     *  omitted but a `sequence` is given. */
    frontUrl?: string;
    /** Show the "Shuffle another card" button. Off when driven by `sequence`. */
    showShuffle?: boolean;
    /** Reports readiness so the surrounding legend can disable spotlight
     *  controls until there is a real card to point at. */
    onstatuschange?: (status: "loading" | "ready" | "error") => void;
    /** Use the live card renderer for a hand-path teaching card. */
    handPathCard?: boolean;
    /** A published scan URL for a teaching card, never a newly-created code. */
    qrUrl?: string;
    /** Plain-language title used before learners have met TKA letters. */
    cardTitle?: string;
  } = $props();

  const showFront = $derived(face === "both" || face === "front");
  const showBack = $derived(face === "both" || face === "back");

  // The shown card. The standalone example arrives from the active product
  // catalog after its near-viewport idle gate. Shuffle generates a fresh card
  // at a random count (8/12/16) with a turn pattern, so the reader sees the real
  // variety: different words, mandalas, LOOP types, difficulties, and step
  // counts. The anatomy stays accurate because front regions are computed from
  // the print layout for that step count, and back regions are measured off the
  // live CardBack DOM.
  type Shown = { sequence: SequenceData; frontUrl: string; stepCount: number };
  const pokerCardAspectRatio =
    CARD_SIZES.poker.widthInches / CARD_SIZES.poker.heightInches;
  let shown = $state<Shown | null>(null);
  let shuffling = $state(false);
  let previewState = $state<"loading" | "ready" | "error">("loading");
  let mounted = false;
  let loadAttempt = 0;

  function setPreviewState(state: "loading" | "ready" | "error"): void {
    previewState = state;
    // A host callback often closes over its selected legend item. Keep that
    // presentation state out of this card-loading effect or selecting a part
    // would restart the supplied card and clear the spotlight.
    untrack(() => onstatuschange?.(state));
  }

  // External-card mode: reflect the caller-supplied sequence into `shown`
  // (re-seeding when a different card is clicked). Uses the baked front when
  // provided, otherwise renders one through the same path shuffle uses.
  $effect(() => {
    if (!sequence) return; // page mode — onMount picks the example instead
    const seq = sequence;
    const baked = frontUrl;
    const attempt = ++loadAttempt;
    let cancelled = false;
    shown = null;
    setPreviewState("loading");
    (async () => {
      let front = baked;
      if (handPathCard) {
        if (cancelled || attempt !== loadAttempt) return;
        shown = {
          sequence: seq,
          frontUrl: "",
          stepCount: seq.steps?.length ?? 4,
        };
        // The live renderer owns its own cell loading. The anatomy controls can
        // point at the stable card frame as soon as it is mounted.
        setPreviewState("ready");
        return;
      }
      if (!front) {
        try {
          const { renderCoverFront } =
            await import("../services/cover-front-renderer");
          const { PropType } =
            await import("$lib/shared/pictograph/prop/domain/enums/prop-type");
          front = await renderCoverFront(
            { sequence: seq },
            { deckName: "Choreo Cards", propType: PropType.STAFF }
          );
        } catch (error) {
          console.warn(
            "[CardAnatomy] front render failed for supplied card",
            error
          );
          front = "";
        }
      }
      if (cancelled || attempt !== loadAttempt) return;
      shown = {
        sequence: seq,
        frontUrl: front ?? "",
        stepCount: seq.steps?.length ?? 8,
      };
      setPreviewState("ready");
    })();
    return () => {
      cancelled = true;
    };
  });

  const frontRegions = $derived(
    shown ? computeFrontRegions(shown.stepCount) : null
  );

  // Every shown card can be saved to the current library. Admin-only image/data
  // actions join that same canonical card menu when the flag is present.
  let menuState = $state<ContextMenuState>({ open: false });
  const menuItems = $derived<ContextMenuEntry[]>(
    shown
      ? composeMenu([
          {
            header: "Card",
            entries: buildCardMenuSection({
              sequenceForLibrarySave: shown.sequence,
              isAdmin: featureFlagService.isAdmin,
              sequenceForImageActions: shown.sequence,
            }),
          },
        ])
      : []
  );

  function openCardMenu(e: MouseEvent): void {
    if (!shown) return;
    e.preventDefault();
    menuState = { open: true, x: e.clientX, y: e.clientY };
  }

  async function loadCatalogExample(): Promise<void> {
    const attempt = ++loadAttempt;
    shown = null;
    setPreviewState("loading");

    try {
      // The product catalog pulls in Firebase. Load it only for the standalone
      // marketing example; card-detail modals already have their sequence and
      // should never pay for this dependency tree.
      const { loadActiveProducts } = await import("../services/product-loader");
      const products = await loadActiveProducts();
      let example: Shown | null = null;
      for (const p of products) {
        const baked = (p.coverCards ?? []).find(
          (c) => c.imageUrl && c.sequence
        );
        if (baked?.imageUrl) {
          example = {
            sequence: baked.sequence,
            frontUrl: baked.imageUrl,
            stepCount: baked.sequence.steps?.length ?? 8,
          };
          break;
        }
      }

      if (!example) {
        throw new Error("No active product has a baked card preview");
      }
      if (!mounted || sequence || attempt !== loadAttempt) return;
      shown = example;
      setPreviewState("ready");
    } catch (error) {
      if (!mounted || sequence || attempt !== loadAttempt) return;
      console.warn("[CardAnatomy] product preview load failed", error);
      setPreviewState("error");
    }
  }

  function retryCatalogExample(): void {
    if (!sequence) void loadCatalogExample();
  }

  onMount(() => {
    mounted = true;
    if (!sequence) void loadCatalogExample();

    return () => {
      mounted = false;
      loadAttempt += 1;
    };
  });

  const COUNTS = [8, 12, 16] as const;

  async function shuffle() {
    if (shuffling) return;
    shuffling = true;
    try {
      const [{ generationOrchestrator }, gen, circ, grid, prop, renderMod] =
        await Promise.all([
          import("$lib/shared/create/services/generation-orchestrator"),
          import("$lib/shared/foundation/domain/models/generation/generate-models"),
          import("$lib/shared/foundation/domain/models/generation/circular-models"),
          import("$lib/shared/pictograph/grid/domain/enums/grid-enums"),
          import("$lib/shared/pictograph/prop/domain/enums/prop-type"),
          import("../services/cover-front-renderer"),
        ]);

      const loops = [
        circ.LOOPType.ROTATED,
        circ.LOOPType.MIRRORED,
        circ.LOOPType.SWAPPED,
        circ.LOOPType.FLIPPED,
      ];
      const count = COUNTS[Math.floor(Math.random() * COUNTS.length)]!;
      const loopType = loops[Math.floor(Math.random() * loops.length)]!;
      // Max turn intensity 1, but let ~60% of cards carry a turn pattern.
      const turnIntensity = Math.random() < 0.6 ? 1 : 0;
      const period =
        count % 4 === 0 && Math.random() < 0.5
          ? circ.Period.QUARTERED
          : circ.Period.HALVED;

      const sequence = await generationOrchestrator.generateSequence({
        mode: gen.GenerationMode.CIRCULAR,
        length: count,
        gridMode: grid.GridMode.DIAMOND,
        propType: prop.PropType.STAFF,
        difficulty: gen.DifficultyLevel.INTERMEDIATE,
        propContinuity: gen.PropContinuity.CONTINUOUS,
        turnIntensity,
        loopType,
        period,
      });

      const frontUrl = await renderMod.renderCoverFront(
        { sequence },
        { deckName: "Choreo Cards", propType: prop.PropType.STAFF }
      );

      onhighlight?.(null);
      shown = {
        sequence,
        frontUrl,
        stepCount: sequence.steps?.length ?? count,
      };
    } catch (error) {
      console.error("[CardAnatomy] shuffle generation failed", error);
    } finally {
      shuffling = false;
    }
  }

  // Back regions are measured off the live CardBack DOM at hover time, so
  // they track the real element positions regardless of theme border width
  // or how many LOOP icons this card shows. Multiple matches union (loop-col).
  const BACK_SELECTORS: Record<string, string> = {
    turn: ".corner.top-left",
    reversal: ".corner.top-right",
    mandala: ".mandala-anchor",
    looptype: ".loop-col",
    difficulty: ".level-badge-slot > :first-child",
    startpos: ".corner.bottom-left",
    stepcount: ".corner.bottom-right",
  };

  const PAD = 1; // % breathing room around the measured element

  let backBox: HTMLElement | null = $state(null);
  let frontBox: HTMLElement | null = $state(null);
  let liveRegionRevision = $state(0);

  $effect(() => {
    if (!handPathCard || !frontBox || !highlight) return;
    // Let the card finish its own grid layout before measuring the visible cells.
    const frame = requestAnimationFrame(() => {
      liveRegionRevision += 1;
    });
    return () => cancelAnimationFrame(frame);
  });

  function measureRegion(selectors: readonly string[]) {
    if (!frontBox) return null;
    const els = selectors.flatMap((selector) => [
      ...frontBox!.querySelectorAll<HTMLElement>(selector),
    ]);
    if (!els.length) return null;
    const b = frontBox.getBoundingClientRect();
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    return {
      x: ((left - b.left) / b.width) * 100 - PAD,
      y: ((top - b.top) / b.height) * 100 - PAD,
      w: ((right - left) / b.width) * 100 + 2 * PAD,
      h: ((bottom - top) / b.height) * 100 + 2 * PAD,
    };
  }

  const liveFrontRegions = $derived.by(() => {
    liveRegionRevision;
    if (!handPathCard) return null;
    return {
      start: measureRegion([
        ".start-cell-wrapper",
        ".duration-start-col > .pictograph-cell:not(.qr-cell)",
      ]),
      steps: measureRegion([".step-cell-wrapper", ".duration-cell"]),
      qr: measureRegion([".qr-cell-wrapper", ".duration-start-col .qr-cell"]),
    };
  });
  const activeFrontRegions = $derived(
    handPathCard ? liveFrontRegions : frontRegions
  );

  function measureBack(id: string) {
    const sel = BACK_SELECTORS[id];
    if (!sel || !backBox) return null;
    const els = backBox.querySelectorAll(sel);
    if (els.length === 0) return null;
    const b = backBox.getBoundingClientRect();
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    return {
      x: ((left - b.left) / b.width) * 100 - PAD,
      y: ((top - b.top) / b.height) * 100 - PAD,
      w: ((right - left) / b.width) * 100 + 2 * PAD,
      h: ((bottom - top) / b.height) * 100 + 2 * PAD,
    };
  }

  const activeRegion = $derived.by(() => {
    if (!highlight) return null;
    const front = activeFrontRegions?.[highlight];
    if (front) return { face: "front" as const, ...front };
    const rg = measureBack(highlight);
    return rg ? { face: "back" as const, ...rg } : null;
  });

  // Reverse direction: pointing at a card part highlights it (and the page's
  // legend row via onhighlight). Same rects the spotlight uses, so the hit
  // zones and the drawn regions can't disagree.
  const inRect = (
    x: number,
    y: number,
    r: { x: number; y: number; w: number; h: number }
  ) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function pointerPct(e: PointerEvent) {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) / b.width) * 100,
      y: ((e.clientY - b.top) / b.height) * 100,
    };
  }

  // Hover path (mouse only): move over a region → highlight it, leave → clear.
  // Touch has no hover, so pointermove never fires on a tap — the tap path
  // below (onclick) handles touch + also works for mouse clicks.
  function frontHit(e: PointerEvent) {
    if (e.pointerType !== "mouse" || !activeFrontRegions) return;
    const p = pointerPct(e);
    for (const [id, rg] of Object.entries(activeFrontRegions)) {
      if (!rg) continue;
      if (inRect(p.x, p.y, rg)) return onhighlight?.(id);
    }
    onhighlight?.(null);
  }

  function backHit(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    const p = pointerPct(e);
    for (const id of Object.keys(BACK_SELECTORS)) {
      const rg = measureBack(id);
      if (rg && inRect(p.x, p.y, rg)) return onhighlight?.(id);
    }
    onhighlight?.(null);
  }

  // Tap path: a click fires on a real tap (mouse OR touch) but NOT on a scroll,
  // so it's the honest mobile hit-test. Toggle so tapping the lit part clears it.
  const clickPct = (e: MouseEvent) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) / b.width) * 100,
      y: ((e.clientY - b.top) / b.height) * 100,
    };
  };
  function frontTap(e: MouseEvent) {
    if (!activeFrontRegions) return;
    const p = clickPct(e);
    for (const [id, rg] of Object.entries(activeFrontRegions)) {
      if (!rg) continue;
      if (inRect(p.x, p.y, rg))
        return onhighlight?.(highlight === id ? null : id);
    }
    onhighlight?.(null);
  }
  function backTap(e: MouseEvent) {
    const p = clickPct(e);
    for (const id of Object.keys(BACK_SELECTORS)) {
      const rg = measureBack(id);
      if (rg && inRect(p.x, p.y, rg))
        return onhighlight?.(highlight === id ? null : id);
    }
    onhighlight?.(null);
  }
</script>

{#snippet spotlight(face: "front" | "back")}
  {#if activeRegion && activeRegion.face === face}
    <ArtifactRegionSpotlight
      x={activeRegion.x}
      y={activeRegion.y}
      width={activeRegion.w}
      height={activeRegion.h}
      radius="10px"
    />
  {/if}
{/snippet}

{#snippet previewFootprint(announce = true)}
  <div
    class="anatomy-stack preview-footprint"
    role={announce ? "status" : undefined}
    aria-label={announce ? "Preparing card preview" : undefined}
  >
    <div
      class="anatomy"
      class:single={face !== "both"}
      class:hand-path={handPathCard}
    >
      {#if showFront}
        <figure class="face">
          <div class="card-box preview-skeleton">
            <SkeletonLoader
              variant="card"
              width="100%"
              height="100%"
              className="card-preview-skeleton"
            />
          </div>
          {#if face === "both"}<figcaption>Front</figcaption>{/if}
        </figure>
      {/if}
      {#if showBack}
        <figure class="face">
          <div class="card-box preview-skeleton">
            <SkeletonLoader
              variant="card"
              width="100%"
              height="100%"
              className="card-preview-skeleton"
            />
          </div>
          {#if face === "both"}<figcaption>Back</figcaption>{/if}
        </figure>
      {/if}
    </div>
    {#if showShuffle}
      <div class="shuffle-bar">
        <SkeletonLoader
          variant="rect"
          width="13rem"
          height="44px"
          className="card-shuffle-skeleton"
        />
      </div>
    {/if}
  </div>
{/snippet}

{#if shown}
  <div class="anatomy-stack">
    <div
      class="anatomy"
      class:busy={shuffling}
      class:single={face !== "both"}
      class:hand-path={handPathCard}
    >
      {#if showFront}
        <figure
          class="face"
          class:backgrounded={activeRegion && activeRegion.face !== "front"}
        >
          <!-- Hover affordance only; the legend buttons are the keyboard/AT path. -->
          <div
            class="card-box"
            role="presentation"
            class:dimmable={activeRegion?.face === "front"}
            bind:this={frontBox}
            onpointermove={frontHit}
            onpointerleave={(e) =>
              e.pointerType === "mouse" && onhighlight?.(null)}
            onclick={frontTap}
            oncontextmenu={openCardMenu}
          >
            {#if handPathCard}
              <ChoreoCard
                primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
                sequence={shown.sequence}
                handPathMode
                darkMode
                cardAspectRatio={pokerCardAspectRatio}
                showWord={false}
                customTitleText={cardTitle ?? "Hand paths"}
                showDifficultyLevel={false}
                includeStartPosition
                columnCount={2}
                showNotes={false}
                showLoopGlyph={false}
                showQRCode
                {qrUrl}
                showStepNumbers
                forceContain
                onReady={() => {
                  void tick().then(() => setPreviewState("ready"));
                }}
              />
            {:else if shown.frontUrl}
              <img src={shown.frontUrl} alt="Front of a real Choreo Card" />
            {:else}
              <div
                class="front-preview-unavailable"
                role="img"
                aria-label="Front of this Choreo Card is unavailable"
              >
                <i class="fas fa-image" aria-hidden="true"></i>
                <span>Front preview unavailable</span>
              </div>
            {/if}
            {@render spotlight("front")}
          </div>
          {#if face === "both"}<figcaption>Front</figcaption>{/if}
        </figure>
      {/if}

      {#if showBack}
        <figure
          class="face"
          class:backgrounded={activeRegion && activeRegion.face !== "back"}
        >
          <div
            class="card-box back"
            role="presentation"
            bind:this={backBox}
            class:dimmable={activeRegion?.face === "back"}
            onpointermove={backHit}
            onpointerleave={(e) =>
              e.pointerType === "mouse" && onhighlight?.(null)}
            onclick={backTap}
            oncontextmenu={openCardMenu}
          >
            <CardBack sequence={shown.sequence} />
            {@render spotlight("back")}
          </div>
          {#if face === "both"}<figcaption>Back</figcaption>{/if}
        </figure>
      {/if}
    </div>

    {#if showShuffle}
      <div class="shuffle-bar">
        <button
          type="button"
          class="shuffle-btn"
          onclick={shuffle}
          disabled={shuffling}
        >
          {#if shuffling}
            <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
            <span>Dealing a card…</span>
          {:else}
            <i class="fas fa-shuffle" aria-hidden="true"></i>
            <span>Shuffle another card</span>
          {/if}
        </button>
      </div>
    {/if}
  </div>

  <ContextMenu
    {menuState}
    items={menuItems}
    onClose={() => (menuState = { open: false })}
  />
{:else if previewState === "error"}
  <div class="preview-load-failure" role="alert">
    <div aria-hidden="true">{@render previewFootprint(false)}</div>
    <div class="preview-load-message">
      <p>Card preview didn’t load.</p>
      <button
        class="preview-retry-btn"
        type="button"
        onclick={retryCatalogExample}>Try again</button
      >
    </div>
  </div>
{:else}
  {@render previewFootprint()}
{/if}

<style>
  .anatomy-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }
  .preview-footprint {
    width: 100%;
  }
  .preview-load-failure {
    position: relative;
    width: 100%;
  }
  .preview-load-failure::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 12px;
    background: oklch(0.12 0.02 275 / 0.58);
    pointer-events: none;
  }
  .preview-load-failure :global(.skeleton) {
    animation: none !important;
    opacity: 0.5;
  }
  .preview-load-message {
    position: absolute;
    z-index: 1;
    top: 50%;
    left: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    width: min(90%, 19rem);
    text-align: center;
    transform: translate(-50%, -50%);
  }
  .preview-load-message p {
    margin: 0;
    color: oklch(0.94 0.015 270);
    font-weight: 650;
  }
  .preview-retry-btn {
    min-height: 44px;
    padding: 0.7rem 1.1rem;
    border: 1px solid oklch(0.72 0.1 340 / 0.55);
    border-radius: 999px;
    color: oklch(0.96 0.01 270);
    background: oklch(0.24 0.045 295 / 0.94);
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }
  .preview-retry-btn:focus-visible {
    outline: 2px solid oklch(0.82 0.12 330);
    outline-offset: 3px;
  }

  .anatomy {
    display: flex;
    gap: clamp(1rem, 3vw, 2.5rem);
    justify-content: center;
    flex-wrap: wrap;
    width: 100%;
    transition: opacity 160ms ease;
  }
  .anatomy.busy {
    opacity: 0.55;
  }
  /* Single-face (mobile): one card, centered, sized to the column. */
  .anatomy.single .face {
    flex: 0 1 340px;
  }

  /* Beginner cards are deliberately sized by their lesson column, rather than
     the compact shop-preview cap used by the anatomy modal. */
  .anatomy.hand-path.single .face {
    flex-basis: 100%;
    min-width: 0;
  }

  .shuffle-bar {
    display: flex;
    justify-content: center;
  }

  .shuffle-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 44px;
    padding: 0.65rem 1.4rem;
    font: inherit;
    font-size: 0.95rem;
    font-weight: 600;
    color: oklch(0.93 0.01 270);
    background: oklch(0.28 0.03 275 / 0.5);
    border: 1px solid oklch(0.6 0.08 275 / 0.35);
    border-radius: 999px;
    cursor: pointer;
    transition:
      background 160ms ease,
      border-color 160ms ease,
      transform 160ms ease;
  }
  .shuffle-btn:hover,
  .shuffle-btn:focus-visible {
    background: oklch(0.34 0.05 275 / 0.6);
    border-color: oklch(0.68 0.12 275 / 0.6);
  }
  .shuffle-btn:active {
    transform: translateY(1px);
  }
  .shuffle-btn:disabled {
    cursor: default;
    opacity: 0.75;
  }
  .shuffle-btn:focus-visible {
    outline: 2px solid oklch(0.7 0.1 275 / 0.7);
    outline-offset: 2px;
  }
  .shuffle-btn i {
    font-size: 0.9rem;
    color: oklch(0.78 0.13 275);
  }
  @media (prefers-reduced-motion: reduce) {
    .shuffle-btn {
      transition: none;
    }
  }

  .face {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    flex: 1 1 240px;
    transition: opacity 200ms ease;
  }

  /* When the focus is on the other face, this one steps back. */
  .face.backgrounded {
    opacity: 0.45;
  }

  .card-box {
    position: relative;
    width: 100%;
    max-width: 430px;
    aspect-ratio: 5 / 7;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
    /* Mouse: hover reveals the part under the cursor (`help`). Touch: tapping a
       part lights it (the tap path), so coarse pointers get a real pointer
       cursor — the affordance matches the actual interaction. */
    cursor: help;
  }
  .card-box :global(.artifact-region-spotlight) {
    z-index: 2;
  }
  .card-box.preview-skeleton {
    cursor: default;
  }
  .card-box.preview-skeleton :global(.card-preview-skeleton) {
    height: 100%;
  }
  @media (pointer: coarse) {
    .card-box {
      cursor: pointer;
    }
  }

  .card-box img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .front-preview-unavailable {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    padding: 1.5rem;
    color: oklch(0.72 0.02 270);
    background: oklch(0.2 0.025 275);
    text-align: center;
  }
  .front-preview-unavailable i {
    font-size: 1.5rem;
    color: oklch(0.62 0.04 290);
  }

  /* CardBack fills its parent and sizes with container query units. */
  .card-box.back {
    container-type: size;
  }

  @media (prefers-reduced-motion: reduce) {
    .face {
      transition: none;
    }
  }

  figcaption {
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: oklch(0.65 0.02 270);
  }
</style>
