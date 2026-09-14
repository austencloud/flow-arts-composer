<script lang="ts">
  /**
   * HeroCarouselSection
   *
   * The landing page hero: title and subtitle above a 4:5 portrait video carousel.
   * The featured list ships with the page so the first video and its poster are
   * discoverable in the initial HTML. Videos crossfade every 5 seconds; manual
   * navigation resets the timer.
   *
   * Performer credit + prop type are shown below the carousel frame.
   */
  import { onMount, onDestroy } from "svelte";
  import { LANDING_VIDEOS } from "../landing-videos";


  interface CarouselEntry {
    src: string;
    performer: string;
    label: string;
  }


  const entries: CarouselEntry[] = LANDING_VIDEOS;

  // Which entry is currently "front" (fully visible)
  let currentIndex = $state(0);
  let isTransitioning = $state(false);

  // Two video elements for crossfading - A is front, B is back
  let videoA = $state<HTMLVideoElement | null>(null);
  let videoB = $state<HTMLVideoElement | null>(null);
  let opacityA = $state(1);
  let opacityB = $state(0);
  // true means A is the visible layer
  let isAFront = $state(true);

  const CROSSFADE_DURATION = 800; // ms
  const AUTO_ADVANCE_INTERVAL = 5000; // ms

  let autoTimer: ReturnType<typeof setInterval> | null = null;
  let rafHandle: number | null = null;


  const currentEntry = $derived(entries[currentIndex] ?? null);


  function getNextIndex(from: number): number {
    return (from + 1) % entries.length;
  }

  function getPrevIndex(from: number): number {
    return (from - 1 + entries.length) % entries.length;
  }

  function cancelRaf() {
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  }

  /**
   * Load a URL into the inactive player and resolve when data is ready.
   */
  async function loadIntoInactive(url: string): Promise<boolean> {
    const inactive = isAFront ? videoB : videoA;
    if (!inactive) return false;

    return new Promise<boolean>((resolve) => {
      const finish = (loaded: boolean) => {
        inactive.removeEventListener("loadeddata", onReady);
        inactive.removeEventListener("error", onError);
        resolve(loaded);
      };
      const onReady = () => {
        finish(true);
      };
      const onError = () => {
        finish(false);
      };
      inactive.addEventListener("loadeddata", onReady, { once: true });
      inactive.addEventListener("error", onError, { once: true });
      inactive.src = url;
      inactive.load();
    });
  }

  async function crossfadeTo(targetIndex: number): Promise<void> {
    if (isTransitioning || entries.length <= 1) return;
    if (targetIndex === currentIndex) return;

    isTransitioning = true;
    cancelRaf();

    const target = entries[targetIndex];
    if (!target) {
      isTransitioning = false;
      return;
    }

    const loaded = await loadIntoInactive(target.src);
    if (!loaded) {
      isTransitioning = false;
      return;
    }

    const inactive = isAFront ? videoB : videoA;
    if (inactive) {
      inactive.currentTime = 0;
      inactive.play().catch(() => {});
    }

    const startTime = performance.now();

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / CROSSFADE_DURATION, 1);
      // Ease in-out
      const eased =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      if (isAFront) {
        opacityA = 1 - eased;
        opacityB = eased;
      } else {
        opacityA = eased;
        opacityB = 1 - eased;
      }

      if (progress < 1) {
        rafHandle = requestAnimationFrame(animate);
      } else {
        // Snap to final state
        opacityA = isAFront ? 0 : 1;
        opacityB = isAFront ? 1 : 0;

        const active = isAFront ? videoA : videoB;
        active?.pause();

        isAFront = !isAFront;
        currentIndex = targetIndex;
        isTransitioning = false;
        rafHandle = null;
      }
    };

    rafHandle = requestAnimationFrame(animate);
  }

  function advanceAuto() {
    crossfadeTo(getNextIndex(currentIndex));
  }

  function startAutoTimer() {
    stopAutoTimer();
    autoTimer = setInterval(advanceAuto, AUTO_ADVANCE_INTERVAL);
  }

  function stopAutoTimer() {
    if (autoTimer !== null) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  function resetTimer() {
    startAutoTimer();
  }


  async function goNext() {
    await crossfadeTo(getNextIndex(currentIndex));
    resetTimer();
  }

  async function goPrev() {
    await crossfadeTo(getPrevIndex(currentIndex));
    resetTimer();
  }

  async function jumpTo(index: number) {
    if (index === currentIndex) return;
    await crossfadeTo(index);
    resetTimer();
  }


  onMount(() => {
    if (entries.length > 1) {
      startAutoTimer();
    }
  });

  onDestroy(() => {
    stopAutoTimer();
    cancelRaf();

    if (videoA) {
      videoA.pause();
      videoA.src = "";
    }
    if (videoB) {
      videoB.pause();
      videoB.src = "";
    }
  });
</script>

<svelte:head>
  <link
    rel="preload"
    as="image"
    href="/images/landing/hero-poster-DAME3bEvN3N.webp"
    type="image/webp"
    fetchpriority="high"
  />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link
    href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,400..900&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<section class="hero-carousel" aria-label="Flow Arts Composer introduction">
  <!-- Left column on wide screens / stacked top on mobile+laptop. Holds the
       name, tagline, primary CTA and the wide-only quick links. Below 1200px
       .hero-copy is display:contents, so these behave as direct flex children of
       the hero exactly as before; `order` keeps the mobile stack title→video→CTA.
       At ≥1200px .hero-copy becomes the real left column (see the wide query). -->
  <div class="hero-copy">
    <!-- Title block — header shows the compact "TKA", so the hero carries the
         full name (Fraunces) as the centrepiece, with the tagline beneath. -->
    <div class="title-block">
      <h1 class="hero-title">
        The Kinetic Alphabet
        <span class="hero-tagline">Notation for Flow Arts</span>
      </h1>
    </div>

    <!-- Primary CTA — pinned to the foot of the stack on mobile via order. -->
    <nav class="hero-links" aria-label="Get started">
      <a class="hero-link primary" href="/create" data-sveltekit-reload>
        <i class="fas fa-rocket" aria-hidden="true"></i>
        <span>Open Flow Arts Composer</span>
      </a>
    </nav>

    <!-- Secondary paths — only rendered in the ≥920px split (display:none
         below), so the mobile single-CTA row is untouched. Icons match the
         SiteHeader nav so the labels read consistently. -->
    <nav class="hero-quicklinks" aria-label="Explore">
      <!-- /composer is the Composer's front page (what it is), distinct from the
           primary CTA above which opens the app itself at /create. -->
      <a class="hero-link hero-chip" href="/composer">
        <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span
          >Composer</span
        >
      </a>
      <a class="hero-link hero-chip" href="/guide">
        <i class="fas fa-book-open" aria-hidden="true"></i><span>Guide</span>
      </a>
      <a class="hero-link hero-chip" href="/history">
        <i class="fas fa-language" aria-hidden="true"></i><span>History</span>
      </a>
      <a class="hero-link hero-chip" href="/shop">
        <i class="fas fa-bag-shopping" aria-hidden="true"></i><span>Shop</span>
      </a>
    </nav>
  </div>

  <!-- Video column -->
  <div class="hero-body">
    <!-- Video + dots/credit column -->
    <div class="carousel-column">
      <!-- Video frame -->
      <div class="carousel-stage">
        {#if entries.length === 0}
          <div class="placeholder error">
            <i class="fas fa-film" aria-hidden="true"></i>
            <span>No videos available</span>
          </div>
        {:else}
          <!-- Crossfade layers -->
          <div class="video-layers">
            <video
              bind:this={videoA}
              class="video-layer"
              style="opacity: {opacityA};"
              src={entries[0]?.src}
              poster={LANDING_VIDEOS[0]?.poster}
              width="368"
              height="640"
              preload="auto"
              muted
              autoplay
              loop
              playsinline
              aria-hidden="true"
            >
              <track kind="captions" />
            </video>
            <video
              bind:this={videoB}
              class="video-layer"
              style="opacity: {opacityB};"
              preload="none"
              muted
              autoplay
              loop
              playsinline
              aria-hidden="true"
            >
              <track kind="captions" />
            </video>
          </div>

          <!-- Prev / Next -->
          <button
            class="nav-btn prev"
            onclick={goPrev}
            disabled={isTransitioning || entries.length <= 1}
            aria-label="Previous video"
          >
            <i class="fas fa-chevron-left" aria-hidden="true"></i>
          </button>
          <button
            class="nav-btn next"
            onclick={goNext}
            disabled={isTransitioning || entries.length <= 1}
            aria-label="Next video"
          >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
          </button>
        {/if}
      </div>

      <!-- Dots + credit - directly under the video -->
      {#if entries.length > 0}
        <div class="carousel-footer">
          {#if entries.length > 1}
            <div class="dots" role="tablist" aria-label="Video indicators">
              {#each entries as _, i}
                <button
                  class="dot"
                  class:active={i === currentIndex}
                  onclick={() => jumpTo(i)}
                  role="tab"
                  aria-selected={i === currentIndex}
                  aria-label="Video {i + 1} of {entries.length}"
                ></button>
              {/each}
            </div>
          {/if}

          {#if currentEntry}
            <p class="credit" aria-live="polite">
              <span class="performer">{currentEntry.performer}</span>
              <span class="separator" aria-hidden="true">·</span>
              <span class="prop">{currentEntry.label}</span>
            </p>
          {/if}
        </div>
      {/if}
    </div>
    <!-- /.carousel-column -->
  </div>
  <!-- /.hero-body -->
</section>

<style>
  .hero-carousel {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0;
    /* dvh tracks the *real* visible viewport as the browser's tab strip + URL bar
       (and a foldable unfold) show/hide — 100vh would size to the chrome-retracted
       height, pushing the "Open Flow Arts Composer" link below the fold. vh is the fallback. */
    min-height: 100vh;
    min-height: 100dvh;
    box-sizing: border-box;
    /* Top padding clears the fixed SiteHeader (64px) so the tagline isn't hidden. */
    padding: clamp(84px, 11vh, 108px) 24px 40px;
    text-align: center;
  }

  /* Hero centrepiece — same Fraunces wonky italic as the guide cover. */
  .hero-title {
    font-family: "Fraunces", Georgia, serif;
    font-style: italic;
    font-weight: 640;
    font-variation-settings:
      "opsz" 144,
      "wght" 640,
      "SOFT" 0,
      "WONK" 1;
    font-size: clamp(2.4rem, 5.5vw, 4rem);
    line-height: 1.02;
    letter-spacing: -0.015em;
    color: #fff;
    margin: 0;
  }

  /* ── Hero copy wrapper ───────────────────────────────────────────────────────
     Below the split (<1200px) the wrapper dissolves (display:contents), so the
     name, CTA and quick links stay direct flex children of .hero-carousel and
     `order` reproduces the original mobile stack: title → video → CTA. At
     ≥1200px it becomes the real left column (see the wide media query). */
  .hero-copy {
    display: contents;
  }

  .title-block {
    order: 1;
  }
  .hero-body {
    order: 2;
  }
  .hero-links {
    order: 3;
  }
  .hero-quicklinks {
    order: 4;
  }


  .title-block {
    margin-bottom: clamp(16px, 3vw, 32px);
    max-width: 680px;
    flex-shrink: 0;
    animation: fade-up 0.7s ease both;
    animation-delay: 0.1s;
  }

  /* Subtitle beneath the title — quieter, lets the name lead. Rendered as a
     <span> now that it lives inside the H1 (single-heading SEO structure); the
     explicit display:block reproduces the line-break + spacing the old <p>
     gave for free, so the visual result is byte-identical to before. */
  .hero-tagline {
    display: block;
    font-family: "Fraunces", Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: clamp(1rem, 1.8vw, 1.35rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    margin: clamp(6px, 1vw, 12px) 0 0;
    line-height: 1.3;
  }

  /* ── Hero body: centred video ──────────────────────────────────────────────── */

  .hero-body {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(24px, 4vw, 48px);
    width: 100%;
    max-width: 1400px;
    /* Natural height so the title + video + links sit as one tight group that
       the parent centres — no grow, which was creating a big gap above the video. */
    flex: 0 1 auto;
    min-height: 0;
  }

  /* ── Carousel column (video + dots stacked) ─────────────────────────────────── */

  .carousel-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 0 1 auto;
    min-width: 0;
    min-height: 0;
  }


  .carousel-stage {
    position: relative;
    /* Explicit width (not 100%) so the shrink-wrapped column can't collapse it.
       Height term tuned so the whole hero (title→links) fits a laptop fold. */
    width: min(34vw, 36vh / 0.8);
    width: min(34vw, 36dvh / 0.8);
    max-height: calc(100vh - 200px);
    max-height: calc(100dvh - 200px);
    aspect-ratio: 4 / 5;
    border-radius: 16px;
    overflow: hidden;
    background:
      radial-gradient(
        circle at 50% 42%,
        rgba(114, 94, 226, 0.2),
        transparent 58%
      ),
      var(--theme-card-bg, #0a0a0f);
    box-shadow:
      0 24px 80px rgba(0, 0, 0, 0.6),
      0 0 0 1px rgba(255, 255, 255, 0.05);
    animation: fade-up 0.7s ease both;
    animation-delay: 0.3s;
  }


  .video-layers {
    position: absolute;
    inset: 0;
  }

  .video-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    /* Sub-frame opacity handled by JS rAF; transition here smooths any micro-gaps */
    transition: opacity 0.05s linear;
  }


  .placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-sm, 0.875rem);
  }

  .placeholder.error i {
    font-size: 32px;
    opacity: 0.4;
  }


  .nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      opacity 0.2s ease;
    opacity: 0;
    backdrop-filter: blur(6px);
    z-index: 2;
  }

  /* Show nav on hover over the stage */
  .carousel-stage:hover .nav-btn {
    opacity: 1;
  }

  .nav-btn.prev {
    left: 16px;
  }

  .nav-btn.next {
    right: 16px;
  }

  .nav-btn:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.7);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .nav-btn:disabled {
    opacity: 0;
    cursor: default;
    pointer-events: none;
  }


  .carousel-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-top: 18px;
    animation: fade-up 0.7s ease both;
    animation-delay: 0.5s;
  }


  .dots {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .dot {
    width: 8px;
    height: 8px;
    min-width: 8px;
    min-height: 8px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    padding: 0;
    box-sizing: content-box;
    background: rgba(255, 255, 255, 0.25);
    transition:
      background 0.25s ease,
      transform 0.25s ease;
  }

  .dot:hover {
    background: rgba(255, 255, 255, 0.55);
    transform: scale(1.25);
  }

  .dot.active {
    background: var(--theme-accent, #d4813a);
    transform: scale(1.15);
  }


  .credit {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    letter-spacing: 0.01em;
    transition: opacity 0.3s ease;
  }

  .separator {
    opacity: 0.4;
  }


  .hero-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    margin-top: 22px;
    animation: fade-up 0.7s ease both;
    animation-delay: 0.6s;
  }

  .hero-link {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 12px 22px;
    border-radius: 999px;
    font-family: var(--font-body, system-ui, sans-serif);
    font-size: 0.95rem;
    font-weight: 600;
    text-decoration: none;
    color: #e8e6f4;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    cursor: pointer;
    transition:
      transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.18s ease,
      background 0.18s ease,
      border-color 0.18s ease;
  }

  .hero-link i {
    font-size: 0.9rem;
    transition: transform 0.18s ease;
  }

  .hero-link:hover,
  .hero-link:focus-visible {
    transform: translateY(-3px);
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.28);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    color: #fff;
    outline: none;
  }

  .hero-link:hover i,
  .hero-link:focus-visible i {
    transform: scale(1.15) rotate(-4deg);
  }

  .hero-link:active {
    transform: translateY(-1px);
  }

  /* Primary = Open Flow Arts Composer */
  .hero-link.primary {
    color: #fff;
    background: linear-gradient(135deg, #6f8cff, #8b6cff);
    border-color: transparent;
    box-shadow: 0 4px 18px rgba(111, 140, 255, 0.4);
  }

  .hero-link.primary:hover,
  .hero-link.primary:focus-visible {
    box-shadow: 0 10px 30px rgba(111, 140, 255, 0.55);
    filter: brightness(1.06);
  }

  .hero-link.primary i {
    color: #fff;
  }

  /* Support heart hint */
  .hero-link:last-child:hover i {
    color: #ff8fbf;
  }

  /* ── Hero quick links (wide-only secondary paths) ───────────────────────────── */

  /* Hidden until the split; the ≥1200px query flips it to a flex row. */
  .hero-quicklinks {
    display: none;
  }

  /* Slightly denser than the primary CTA to read as secondary, but padding is
     tuned to keep the ~44px touch-target floor. Reuses the .hero-link primitive
     for all hover/focus/transition behaviour. */
  .hero-chip {
    padding: 12px 18px;
    font-size: 0.9rem;
  }


  @keyframes fade-up {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── Wide screens: two-column split hero ────────────────────────────────────
     ≥920px, aligned with PlayWithIt's split so the page commits to desktop in
     one move (Z Fold unfolded ~928px and iPad landscape live in this band).
     The lonely centred column becomes [copy | video]: the name, tagline, CTA
     and quick links anchor the left; the portrait video grows into a real hero
     on the right. Bounded to 1240px and centred so a 4K monitor reads as one
     balanced composition instead of a tiny island in a sea of space. Nothing
     in here can touch the <920px layout. */
  @media (min-width: 920px) {
    .hero-carousel {
      display: grid;
      grid-template-columns: minmax(300px, 440px) auto;
      align-content: center;
      justify-content: center;
      column-gap: clamp(48px, 6vw, 96px);
      max-width: 1240px;
      margin-inline: auto;
      text-align: left;
    }

    /* Wrapper becomes the real left column here. */
    .hero-copy {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: clamp(18px, 2vw, 30px);
      grid-column: 1;
      align-self: center;
      min-width: 0;
      /* The video column (.hero-body) includes the dots + credit footer below
         the stage (55px tall incl. its margin), so a plain center-align sits the
         copy ~28px below the video's midline. This padding re-centres the copy
         on the stage itself, not the stage + footer. */
      padding-bottom: 56px;
    }

    .title-block {
      margin-bottom: 0;
      max-width: none;
    }

    .hero-title {
      /* Anchors the left column now, so a touch larger than the centred size. */
      font-size: clamp(3rem, 3.2vw, 4.2rem);
    }

    .hero-links {
      margin-top: 0;
      justify-content: flex-start;
    }

    .hero-quicklinks {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-start;
    }

    .hero-body {
      grid-column: 2;
      align-self: center;
      max-width: none;
      width: auto;
    }

    .carousel-stage {
      /* Height-driven on wide so the portrait video is a proper hero; width
         derives from the 4/5 aspect ratio (height * 0.8). */
      width: auto;
      height: min(62vh, 640px);
      max-height: none;
    }
  }

  /* ── Split entry band: 920–1199px (Z Fold unfolded, iPad landscape) ─────────
     The 640px stage (512px wide) plus the 300px copy floor leaves ~10px of
     slack at 920 once a classic scrollbar takes its cut. A shorter stage and
     tighter gap buy that margin back, and the title steps down so 48px type
     isn't wedged into a 300px column. */
  @media (min-width: 920px) and (max-width: 1199px) {
    .hero-carousel {
      column-gap: clamp(32px, 4vw, 56px);
    }

    .hero-title {
      font-size: clamp(2.5rem, 3.9vw, 3rem);
    }

    .carousel-stage {
      height: min(62vh, 560px);
    }
  }

  /* ── 4K / ultrawide: scale the split up ──────────────────────────────────────
     ≥2200px. The 1240px/640px caps that balance a 1080p–1440p desktop read as a
     small island on a 4K monitor (at 3840 the whole composition was ~27% of the
     width). Same split, bigger canvas: wider bound, taller stage, larger type.
     Everything below 2200px keeps the verified tier above. */
  @media (min-width: 2200px) {
    .hero-carousel {
      /* Fluid past 3840: 44.8vw == 1720px at 3840, so a 5K/6K screen keeps
         scaling instead of re-shrinking into an island. Same at/below 3840. */
      max-width: max(1720px, 44.8vw);
      grid-template-columns: minmax(380px, max(600px, 15.6vw)) auto;
      column-gap: clamp(96px, 6vw, 220px);
    }

    .hero-copy {
      gap: clamp(26px, 1.6vw, 40px);
      /* Footer block grew (24px margin + bigger dots/credit ≈ 66px), keep the
         copy centred on the stage. */
      padding-bottom: 66px;
    }

    .hero-title {
      /* 2.42vw == 92.9px at 3840 (the verified size); keeps growing beyond. */
      font-size: clamp(4rem, 2.42vw, 9rem);
    }

    .hero-tagline {
      font-size: clamp(1.35rem, 0.9vw, 2rem);
    }

    .carousel-stage {
      /* 25vw == 960px at 3840; a 5K screen gets a proportionally taller stage
         instead of freezing at the 4K cap. vh still bounds it on short windows. */
      height: min(64vh, max(960px, 25vw));
      border-radius: 20px;
    }

    /* Bump the interactive text one step so it doesn't read miniature next to
       the scaled title. Touch-target floor already cleared. */
    .hero-link {
      font-size: 1.05rem;
      padding: 14px 26px;
    }

    .hero-chip {
      font-size: 1rem;
      padding: 13px 21px;
    }

    .carousel-footer {
      margin-top: 24px;
      gap: 12px;
    }

    .credit {
      font-size: 14px;
    }

    .dot {
      width: 10px;
      height: 10px;
      min-width: 10px;
      min-height: 10px;
    }
  }


  /* ── Mobile: title near the top, video as the hero, links pinned to the foot.
        (On desktop the stack is a centred group; on phones it spreads to fill.) */
  @media (max-width: 768px) {
    .hero-carousel {
      justify-content: space-between;
      padding: 68px 14px 18px; /* clear the 56px mobile header */
      gap: 10px;
    }

    .title-block {
      margin-bottom: 0;
      flex-shrink: 0;
    }

    .hero-title {
      font-size: clamp(1.9rem, 8.5vw, 2.6rem);
    }

    .hero-tagline {
      font-size: clamp(0.85rem, 3.4vw, 1.05rem);
      margin-top: 4px;
    }

    /* Video fills the middle and is the visual hero. */
    .hero-body {
      flex: 1 1 auto;
      flex-direction: column;
      align-items: stretch; /* let the column take full width so the video can grow */
      min-height: 0;
    }

    .carousel-column {
      width: 100%;
      flex: 1 1 auto;
      justify-content: center;
      min-height: 0;
    }

    .carousel-stage {
      border-radius: 12px;
      width: 100%;
      max-width: min(92vw, 58vh / 0.8);
      max-width: min(92vw, 58dvh / 0.8);
      max-height: calc(100dvh - 260px);
      margin: 0 auto;
    }

    .carousel-footer {
      margin-top: 10px;
    }

    /* Save vertical room so the video stays big. */
    .credit {
      display: none;
    }

    /* Three equal pills across the foot. */
    .hero-links {
      width: 100%;
      flex-wrap: nowrap;
      gap: 8px;
      margin-top: 12px;
      flex-shrink: 0;
    }

    .hero-link {
      flex: 1 1 0;
      justify-content: center;
      padding: 12px 6px;
      font-size: 0.82rem;
      gap: 6px;
    }

    /* Always show nav buttons on touch devices - no hover */
    .nav-btn {
      opacity: 1;
      width: 38px;
      height: 38px;
      font-size: 14px;
    }

    .nav-btn:disabled {
      opacity: 0;
    }
  }

  @media (max-width: 380px) {
    .hero-link span {
      font-size: 0.76rem;
    }

    .hero-link i {
      display: none; /* labels alone keep the three pills readable on tiny screens */
    }
  }


  @media (prefers-reduced-motion: reduce) {
    .title-block,
    .carousel-stage,
    .carousel-footer,
    .hero-links {
      animation: none;
      opacity: 1;
      transform: none;
    }

    .hero-link,
    .hero-link i {
      transition: none;
    }

    .video-layer {
      transition: none;
    }

    .dot,
    .nav-btn {
      transition: none;
    }

    .credit {
      transition: none;
    }

    .buffering-shimmer {
      animation: none;
    }

    .buffering-content {
      animation: none;
      opacity: 0.4;
    }
  }
</style>
