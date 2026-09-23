<!-- Shows the printed card and the real scan experience it opens. Dealing a
     replacement clears the phone and waits for an explicit scan. -->
<script lang="ts">
  import type { HeroCoverEntry } from "./front-door-catalog";
  import ShopEntryArt from "../ShopEntryArt.svelte";
  import BackJobPreview from "$lib/features/choreo-card/components/card-back/BackJobPreview.svelte";
  import HeroPhone from "./HeroPhone.svelte";
  import ActionButton from "$lib/shared/components/selection/ActionButton.svelte";
  import { createHeroScanTimeline } from "./hero-scan-timeline.svelte";
  import { computeFrontQrCellRect } from "../../services/card-front-regions";
  import {
    DEFAULT_SHOP_PROP,
    SHOP_BACK_THEME,
    bakedCoverUrl,
  } from "../../domain/shop-prop-options";
  import { hydrateSequence } from "$lib/features/choreo-card/services/catalog-loader";
  import { resolveHeroScanCode } from "./hero-scan-code";

  interface Props {
    /** Empty until the catalog's cover cards land. The stage holds its shape. */
    pool: readonly HeroCoverEntry[];
  }
  let { pool }: Props = $props();

  // Avoid repeats within a round and across the reshuffle boundary.
  let order = $state<number[]>([]);
  let cursor = $state(0);

  function shuffled(count: number, avoidFirst?: number): number[] {
    const next = Array.from({ length: count }, (_, i) => i);
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j]!, next[i]!];
    }
    if (next.length > 1 && next[0] === avoidFirst) {
      [next[0], next[1]] = [next[1]!, next[0]!];
    }
    return next;
  }

  // The sorted first entry is guaranteed to have the best available cover.
  $effect(() => {
    const n = pool.length;
    if (!n) {
      order = [];
      cursor = 0;
      return;
    }
    if (order.length !== n) {
      order = [0, ...shuffled(n, 0).filter((i) => i !== 0)];
      cursor = 0;
    }
  });

  const entry = $derived(pool[order[cursor] ?? 0] ?? null);
  const card = $derived(entry?.card ?? null);
  const product = $derived(entry?.product ?? null);
  const canDeal = $derived(pool.length > 1);

  // Printed art must not inherit the viewer's display settings.
  const printedProp = DEFAULT_SHOP_PROP;

  // Catalog blobs need hydration before the back can render correctly.
  const backSequence = $derived(
    card?.sequence ? hydrateSequence({ ...card.sequence }) : null
  );

  const qrCell = $derived(
    card ? computeFrontQrCellRect(card.sequence?.steps?.length ?? 8) : null
  );

  const coverUrl = $derived(
    card ? (bakedCoverUrl(card, printedProp) ?? null) : null
  );

  // A catalog/code mismatch suppresses the phone instead of showing a false scan.
  let scanCode = $state<string | null>(null);
  $effect(() => {
    const seq = backSequence;
    const cover = coverUrl;
    scanCode = null;
    if (!seq) return;
    let cancelled = false;
    void resolveHeroScanCode(seq, cover).then((code) => {
      if (!cancelled) scanCode = code;
    });
    return () => {
      cancelled = true;
    };
  });

  const timeline = createHeroScanTimeline();
  $effect(() => {
    timeline.start();
    return () => timeline.stop();
  });

  const viewfinder = $derived(
    timeline.phase === "aim" || timeline.phase === "lock"
  );
  const entered = $derived(timeline.onstage);
  const opened = $derived(
    timeline.phase === "opening" || timeline.phase === "open"
  );

  // Size from the longest reachable label so state changes cannot shift layout.
  const SCAN_LABEL = "Scan the code";
  const DEAL_LABEL = "Deal another card";
  const RESCAN_LABEL = "Scan again";
  const afterScanLabel = $derived(canDeal ? DEAL_LABEL : RESCAN_LABEL);
  const actionLabel = $derived(timeline.scanned ? afterScanLabel : SCAN_LABEL);
  const sizerLabel = $derived(
    [SCAN_LABEL, afterScanLabel].reduce((a, b) => (b.length > a.length ? b : a))
  );

  // Deal choreography: lift and dismiss the current scene, swap while both
  // faces are invisible, then land the replacement back-first. The phone stays
  // offstage afterward because dealing must never imply a scan. All movement is
  // transform/opacity within the fixed stage box.
  const LIFT_MS = 150;
  const OUT_MS = 180;
  const OUT_STAGGER_MS = 60;
  /** Covers both the offscreen render and the phone's exit fade. */
  const SWAP_HOLD_MS = 90;
  const IN_MS = 300;
  const IN_STAGGER_MS = 80;

  const OUT_AT = LIFT_MS;
  const SWAP_AT = OUT_AT + OUT_STAGGER_MS + OUT_MS;
  const IN_AT = SWAP_AT + SWAP_HOLD_MS;
  const IN_END = IN_AT + IN_STAGGER_MS + IN_MS;
  /** Avoids dropping the class on the keyframe's final paint. */
  const SETTLE_AT = IN_END + 50;

  type DealStage = "lift" | "out" | "in";
  let dealStage = $state<DealStage | null>(null);
  const dealing = $derived(dealStage !== null);
  const parting = $derived(dealStage === "lift" || dealStage === "out");
  /**
   * Starts the visible phone exit before the timeline reset, which must wait for
   * the hidden swap because it also restores the cards' resting composition.
   */
  let phoneExiting = $state(false);
  let dealTimers: ReturnType<typeof setTimeout>[] = [];

  function clearDealTimers(): void {
    for (const t of dealTimers) clearTimeout(t);
    dealTimers = [];
  }
  $effect(() => () => clearDealTimers());

  function advance(): void {
    if (pool.length < 2) return;
    if (cursor + 1 < order.length) {
      cursor += 1;
    } else {
      order = shuffled(pool.length, order[cursor]);
      cursor = 0;
    }
  }

  function press(): void {
    // Prevent a second scan or deal from overlapping the current choreography.
    if (timeline.running || dealing) return;
    if (!timeline.scanned || !canDeal) {
      timeline.scan();
      return;
    }
    clearDealTimers();
    if (timeline.reducedMotion) {
      // Reduced motion swaps at rest and still requires a separate scan.
      timeline.reset();
      advance();
      return;
    }
    phoneExiting = true;
    dealStage = "lift";
    dealTimers.push(
      setTimeout(() => (dealStage = "out"), OUT_AT),
      // Swap and restore the resting composition while both faces are invisible.
      setTimeout(() => {
        timeline.reset();
        phoneExiting = false;
        advance();
      }, SWAP_AT),
      setTimeout(() => (dealStage = "in"), IN_AT),
      setTimeout(() => (dealStage = null), SETTLE_AT)
    );
  }
</script>

<div class="stage">
  <!-- One fixed scene box prevents the phone entrance from shifting layout. -->
  <div class="scene-slot">
    <div
      class="scene"
      class:entered
      class:dealing
      class:parting
      class:deal-out={dealStage === "out"}
      class:deal-in={dealStage === "in"}
    >
      <div class="slot back">
        {#if backSequence}
          <div class="card-frame">
            <BackJobPreview
              sequence={backSequence}
              themeOverride={SHOP_BACK_THEME}
              leftPropTypeOverride={printedProp}
              rightPropTypeOverride={printedProp}
              primaryPropColorsOverride={null}
            />
          </div>
        {/if}
      </div>

      <div class="slot front">
        {#if card && product}
          <div class="art">
            <ShopEntryArt
              cards={[card]}
              {product}
              deckName={product.name}
              cardWidth={140}
              maxCardWidth={822}
              exactCount={1}
            />
          </div>
        {/if}
      </div>

      <div class="phone-holder">
        <HeroPhone
          code={scanCode}
          armed={timeline.armed}
          onstage={entered && !phoneExiting}
          {viewfinder}
          locked={timeline.phase === "lock"}
          {opened}
          {coverUrl}
          {qrCell}
          reducedMotion={timeline.reducedMotion}
        />
      </div>
    </div>
  </div>

  <!-- The hidden longest label fixes the live button's width. -->
  {#if card && timeline.available}
    <div class="scan-trigger" class:busy={timeline.running || dealing}>
      <span class="sizer" aria-hidden="true" inert>
        <ActionButton
          label={sizerLabel}
          icon="fa-qrcode"
          color="cyan"
          fullWidth
          onclick={() => {}}
        />
      </span>
      <span class="live">
        <ActionButton
          label={actionLabel}
          icon={timeline.scanned && canDeal ? "fa-shuffle" : "fa-qrcode"}
          color="cyan"
          fullWidth
          ariaDisabled={timeline.running || dealing || !scanCode}
          onclick={press}
        />
      </span>
    </div>
  {/if}
</div>

<style>
  .stage {
    /* Card height drives every object. Scene fit includes the rotated cards'
       overhang so its card-height units cannot exceed the container. */
    --scene-ratio: 1.49;
    --scene-fit: 1.55;
    --card-cap: 26rem;
    /* Rest stays fixed across tiers; only the scanned composition spreads. */
    --rest-back: -0.388;
    --rest-front: 0.388;
    --part-back: -0.29;
    --part-front: -0.03;
    --part-rot-back: -11deg;
    --card-h: min(40svh, var(--card-cap), calc(100cqw / var(--scene-fit)));
    --phone-h: calc(var(--card-h) * 1.28);
    --scene-w: calc(var(--card-h) * var(--scene-ratio));
    --scene-h: calc(var(--card-h) * 1.34);
    /* Reserve the external scan pill before it appears. */
    --pill-gap: 0.7rem;
    --pill-h: var(--min-touch-target, 44px);
    /* The tail covers perspective overhang beyond the untransformed box. */
    --pill-reserve: calc(var(--pill-gap) + var(--pill-h) + 0.25rem);
    display: grid;
    grid-template-columns: minmax(0, auto);
    grid-template-areas:
      "scene"
      "action";
    justify-items: center;
    justify-content: center;
    gap: clamp(1rem, 3cqw, 3rem);
    width: 100%;
  }

  /* Pixel-based container tiers spread the cards only when all three objects
     have physical room; typography scaling must not move these thresholds. */
  @container (min-width: 640px) {
    .stage {
      --scene-ratio: 2;
      --scene-fit: 2.12;
      --part-back: -0.6;
      --part-front: -0.06;
      --part-rot-back: -8deg;
    }
  }
  @container (min-width: 900px) {
    .stage {
      --scene-ratio: 2.36;
      --scene-fit: 2.48;
      --card-cap: 30rem;
      --part-back: -0.72;
      --part-front: 0.11;
    }
  }

  .scene-slot {
    grid-area: scene;
    padding-bottom: var(--pill-reserve);
  }

  .scene {
    position: relative;
    width: var(--scene-w);
    height: var(--scene-h);
    /* Keep these paired with the script timeline constants. */
    --deal-out-ms: 180ms;
    --deal-out-stagger: 60ms;
    --deal-in-ms: 300ms;
    --deal-in-stagger: 80ms;
  }

  .scan-trigger {
    grid-area: action;
    justify-self: center;
    display: inline-grid;
  }

  /* Centre-anchored offsets keep the resting pair unchanged as wider tiers
     expand the scene. Transform-only poses cannot reflow the stage. */
  .slot {
    position: absolute;
    top: 50%;
    left: 50%;
    height: var(--card-h);
    aspect-ratio: 5 / 7;
    border-radius: 0.75rem;
    filter: drop-shadow(0 1.25rem 2.5rem rgba(0, 0, 0, 0.55));
    transform: translate(calc(-50% + var(--card-h) * var(--x)), var(--y, -50%))
      rotate(var(--rot));
    transition: transform 640ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .slot.front {
    z-index: 2;
    --x: var(--rest-front);
    --rot: 3deg;
  }
  .scene.entered .slot.front {
    --x: var(--part-front);
    --rot: -3deg;
  }

  .slot.back {
    z-index: 1;
    --x: var(--rest-back);
    --rot: -5deg;
  }
  .scene.entered .slot.back {
    --x: var(--part-back);
    --rot: var(--part-rot-back);
  }

  /* Slot transforms fan the stack while each face runs its own exit animation. */
  .scene.entered.parting .slot.front {
    --x: calc(var(--part-front) - 0.03);
    --y: -56%;
    --rot: 1deg;
  }
  .scene.entered.parting .slot.back {
    --x: calc(var(--part-back) + 0.03);
    --y: -44%;
    --rot: calc(var(--part-rot-back) - 7deg);
  }
  .scene.dealing .slot {
    transition-duration: 240ms;
  }

  /* Individual transform properties compose scene movement with HeroPhone's
     own entrance transform without either owner restating the other. */
  .phone-holder {
    position: absolute;
    right: 0;
    top: 50%;
    z-index: 3;
    translate: 0 -50%;
    transition:
      translate 280ms cubic-bezier(0.22, 1, 0.36, 1),
      rotate 280ms cubic-bezier(0.22, 1, 0.36, 1),
      scale 280ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .scene.parting .phone-holder {
    translate: 4% -52%;
    rotate: 3deg;
    scale: 0.93;
  }

  .art {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }

  /* The printed back fills the frame throughout the deal animation. */
  .card-frame {
    position: absolute;
    inset: 0;
    border-radius: 0.75rem;
    overflow: hidden;
  }

  /* `both` fill keeps outgoing faces hidden across the offscreen swap. */
  .scene.deal-out .art {
    animation: deal-out-front var(--deal-out-ms) cubic-bezier(0.5, 0, 0.75, 0)
      both;
  }
  .scene.deal-out .card-frame {
    animation: deal-out-back var(--deal-out-ms) cubic-bezier(0.5, 0, 0.75, 0)
      var(--deal-out-stagger) both;
  }
  /* Back lands first; slight overshoot makes both faces settle instead of glide. */
  .scene.deal-in .card-frame {
    animation: deal-in-back var(--deal-in-ms) cubic-bezier(0.32, 1.34, 0.52, 1)
      both;
  }
  .scene.deal-in .art {
    animation: deal-in-front var(--deal-in-ms) cubic-bezier(0.32, 1.34, 0.52, 1)
      var(--deal-in-stagger) both;
  }

  @keyframes deal-out-front {
    from {
      transform: none;
      opacity: 1;
    }
    to {
      transform: translate(-16%, -22%) rotate(-13deg) scale(0.94);
      opacity: 0;
    }
  }
  @keyframes deal-out-back {
    from {
      transform: none;
      opacity: 1;
    }
    to {
      transform: translate(-11%, -16%) rotate(-9deg) scale(0.95);
      opacity: 0;
    }
  }

  /* Arrive from the space the phone vacated and become opaque before landing. */
  @keyframes deal-in-back {
    from {
      transform: translate(44%, 26%) rotate(12deg) scale(0.9);
      opacity: 0;
    }
    55% {
      opacity: 1;
    }
    to {
      transform: none;
      opacity: 1;
    }
  }
  @keyframes deal-in-front {
    from {
      transform: translate(40%, 22%) rotate(10deg) scale(0.91);
      opacity: 0;
    }
    50% {
      opacity: 1;
    }
    to {
      transform: none;
      opacity: 1;
    }
  }

  .scan-trigger > .sizer,
  .scan-trigger > .live {
    grid-area: 1 / 1;
    display: block;
  }
  .scan-trigger > .sizer {
    visibility: hidden;
  }
  .scan-trigger > .live {
    transition: opacity 240ms ease;
  }
  .scan-trigger.busy > .live {
    opacity: 0.55;
  }

  /* On wide, short screens the scene absorbs the height constraint because the
     header, trigger, gap, and reserved scan pill are fixed costs. */
  @media (min-width: 48rem) and (max-height: 40rem) {
    .stage {
      --card-h: min(30svh, 15rem, calc(100cqw / var(--scene-fit)));
      gap: 0.75rem;
    }
  }

  /* Also stops a flourish if the motion preference changes mid-animation. */
  @media (prefers-reduced-motion: reduce) {
    .slot,
    .phone-holder,
    .scan-trigger > .live {
      transition: none;
    }
    .scene.deal-out .art,
    .scene.deal-out .card-frame,
    .scene.deal-in .art,
    .scene.deal-in .card-frame {
      animation: none;
    }
  }
</style>
