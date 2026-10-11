<script lang="ts">
  // Test harness for the composer-page "five wings" rework. Mounts the REAL
  // section components (built to reuse existing primitives) so the layout can
  // be evaluated with actual rendered content, not a wireframe.
  //
  // PARITY PORT (2026-07-20): this harness now carries every block the live
  // /composer page has — the hero, the Tunnel/Choreo-Card/3D demos (folded into
  // the new Outputs wing), and the closing tail (Features/Roadmap/Foundation/
  // Try-it/CTA) — so full parity can be eyeballed before the swap. The only
  // thing NOT reproduced here is the SEO <head> JSON-LD: this route is
  // ssr=false + robots-disallowed, so it would never be crawled; it graduates
  // onto the real page at swap time.
  //
  // 4K composition: adopts the shared public-editorial width system (.editorial
  // + .has-duo / .breakout.cinema / .breakout.wide). Prose keeps the readable
  // essay measure; the live demos break OUT of it and fill the canvas. The
  // big-screen tier engages at 1680px CSS (a 4K monitor at Windows 200% reports
  // ~1904 CSS px; see the composer-4k spec).
  //
  // The wing section components AND the heavy /composer demos load via
  // CLIENT-ONLY dynamic import. A static top-level import would drag the heavy
  // pictograph graph (incl. special-arrow-placement -> zod) through the dev SSR
  // module runner, which throws "Cannot find module 'zod'". Lazy client import
  // is how /composer avoids the same trap.
  import "#lib/shared/landing/styles/public-editorial.css";
  import type { Component } from "svelte";
  import { onMount } from "svelte";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import SequenceHeroDemo from "#lib/shared/landing/components/SequenceHeroDemo.svelte";
  import FanSkeleton from "../../(public)/composer/_components/FanSkeleton.svelte";
  import PlayWithItSkeleton from "../../landing/components/PlayWithItSkeleton.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { generatePerVisitDemo } from "#lib/shared/landing/data/per-visit-demo.js";

  // The five-wing section components, loaded once each slot scrolls near.
  // Sections graduated into the live composer route (2026-07-20); the harness
  // now consumes them from there so both surfaces render the same components.
  const loaders: Record<string, () => Promise<{ default: Component }>> = {
    construct: () =>
      import("../../(public)/composer/_sections/ConstructSection.svelte"),
    generate: () =>
      import("../../(public)/composer/_sections/GenerateSection.svelte"),
    mandala: () =>
      import("../../(public)/composer/_sections/MandalaSection.svelte"),
    games: () =>
      import("../../(public)/composer/_sections/GamesStripSection.svelte"),
    connect: () =>
      import("../../(public)/composer/_sections/ConnectSection.svelte"),
    library: () =>
      import("../../(public)/composer/_sections/LibrarySection.svelte"),
  };

  const comp = $state<Record<string, Component | null>>({
    construct: null,
    generate: null,
    mandala: null,
    games: null,
    connect: null,
    library: null,
  });

  // Verification escape hatch: IntersectionObserver never fires in a hidden tab
  // (Chrome pauses rendering steps), which makes automated checks impossible
  // without focusing the tab. `?eager` loads every section immediately —
  // harness-only affordance, the lazy path stays the default.
  const eager =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("eager");

  function load(key: string) {
    const loader = loaders[key];
    if (loader) void loader().then((m) => (comp[key] = m.default));
  }

  function whenNear(node: HTMLElement, key: string) {
    if (eager) {
      load(key);
      return {};
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load(key);
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }

  // ── Hero demo (same per-visit draw the live /composer hero uses) ──
  // Freshly generated for every visitor. The hero player is keyed on sequence
  // id, so the dice button reloads it in place without a page refresh.
  let demoSeq = $state<SequenceData | null>(null);
  let rerollingDemo = $state(false);
  onMount(() => {
    void generatePerVisitDemo().then((seq) => {
      demoSeq = seq;
    });
  });
  async function rerollDemo() {
    if (rerollingDemo) return;
    rerollingDemo = true;
    try {
      demoSeq = await generatePerVisitDemo();
    } finally {
      rerollingDemo = false;
    }
  }

  // Heavy canvas demos in the Outputs wing + the Try-it tail: mount each only
  // when its section approaches the viewport (matches the live /composer).
  let tunnelActive = $state(false);
  let choreoCardsActive = $state(false);
  let viewer3DActive = $state(false);
  let playWithItActive = $state(false);
  function activateWhenNear(activate: () => void) {
    return (node: HTMLElement) => {
      if (eager) {
        activate();
        return;
      }
      if (typeof IntersectionObserver === "undefined") {
        activate();
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            activate();
            io.disconnect();
          }
        },
        { rootMargin: "400px" }
      );
      io.observe(node);
      return { destroy: () => io.disconnect() };
    };
  }
  const activateTunnelWhenNear = activateWhenNear(() => (tunnelActive = true));
  const activateChoreoCardsWhenNear = activateWhenNear(
    () => (choreoCardsActive = true)
  );
  const activate3DWhenNear = activateWhenNear(() => (viewer3DActive = true));
  const activatePlayWithItWhenNear = activateWhenNear(
    () => (playWithItActive = true)
  );

  const ROADMAP = [
    {
      label: "Community video repository",
      detail: "performances stored for generations instead of lost to the feed",
    },
    {
      label: "3D performance composing",
      detail: "build entire acts with virtual performers",
    },
    {
      label: "Camera practice overlay",
      detail: "spin in front of your camera, get feedback",
    },
    {
      label: "Higher levels",
      detail: "three of the system's nine levels are in the app so far",
    },
  ];
</script>

<svelte:head>
  <title>Composer wings — layout test</title>
</svelte:head>

<div class="page">
  <div class="editorial">
    <p class="harness-note">Test harness · not yet live at /composer</p>

    <!-- HERO: identical to the live /composer hero. Stacked and centered by
         default; from 1680px up it splits into copy-left / player-right. -->
    <div class="hero-duo">
      <header class="editorial-header">
        <h1 class="page-title">Flow Arts Composer</h1>
        <p class="page-subtitle">
          Free flow arts software for choreography, built on <LinkChip
            size="inline"
            href="/notation">The Kinetic Alphabet</LinkChip
          >
        </p>
      </header>

      <div class="lede">
        <p>
          Flow Arts Composer is free flow arts software for building
          choreography in your browser. Construct sequences step by step,
          generate them from parameters, watch them animate, and share them with
          other flow artists. It supports staff, fans, clubs, hoops, buugeng,
          and more, all built on The Kinetic Alphabet notation system.
        </p>
      </div>

      <div class="hero-stage">
        <SequenceHeroDemo
          sequence={demoSeq}
          note="a rotated LOOP from the generator, animating live"
          onReroll={rerollDemo}
          rerolling={rerollingDemo}
        />
      </div>

      <div class="hero-ctas">
        <a href="/create" class="cta-button" data-sveltekit-reload>
          <span>Open Composer</span>
          <i class="fas fa-arrow-right" aria-hidden="true"></i>
        </a>
        <a href="/notation" class="cta-secondary">
          <span>See the notation</span>
        </a>
      </div>
    </div>

    <!-- WING 1: CREATE -->
    <div class="wing-band" style="--wc:#8b8cff">
      <span class="wn">①</span><span class="wname">Create</span>
      <span class="wtag">make it</span>
    </div>

    <!-- Construct: prose in the column, the live picker as a wide centered stage. -->
    <section class="editorial-section" style="--accent:#8b8cff">
      <span class="section-kicker">Construct</span>
      <h2 class="section-title">Build it step by step</h2>
      <div class="prose">
        <p>
          Pick a starting position and tap through the options. Each tap adds a
          step, and every step animates the moment you add it. You're never
          presented with an invalid option: the app tracks what's physically
          possible so you don't have to.
        </p>
      </div>
      <div class="breakout wide slot" use:whenNear={"construct"}>
        {#if comp.construct}
          {@const Section = comp.construct}
          <Section />
        {:else}
          <div class="ph">loading on scroll…</div>
        {/if}
      </div>
    </section>

    <!-- Generate: stacked below 1680, prose|demo split on 4K (duo-uw + duo-max). -->
    <section
      class="editorial-section has-duo duo-uw duo-max"
      style="--accent:#ec4899"
    >
      <div class="section-duo">
        <div class="duo-copy">
          <span class="section-kicker">Generate</span>
          <h2 class="section-title">Or skip the building entirely</h2>
          <div class="prose">
            <p>
              Set your parameters, hit generate, and a valid sequence lands in
              front of you. Watch it animate, keep it if you like it, run it
              again if you don't.
            </p>
          </div>
        </div>
        <div class="duo-demo slot" use:whenNear={"generate"}>
          {#if comp.generate}
            {@const Section = comp.generate}
            <Section />
          {:else}
            <div class="ph">loading on scroll…</div>
          {/if}
        </div>
      </div>
    </section>

    <!-- WING 2: OUTPUTS -->
    <div class="wing-band" style="--wc:#ec6ba8">
      <span class="wn">②</span><span class="wname">Outputs</span>
      <span class="wtag">what it becomes</span>
    </div>

    <!-- Mandala: the star. Prose in the column, the chosen wall breaks out. -->
    <section class="editorial-section" style="--accent:#ec6ba8">
      <span class="section-kicker">Mandala</span>
      <h2 class="section-title">The shape decides the mandala</h2>
      <div class="prose">
        <p>
          A mandala is the path a sequence traces. Change the movement and the
          shape changes with it, and the Kinetic Alphabet reaches shapes older
          systems couldn't hold.
        </p>
      </div>
      <div class="breakout cinema slot" use:whenNear={"mandala"}>
        {#if comp.mandala}
          {@const Section = comp.mandala}
          <Section />
        {:else}
          <div class="ph">loading on scroll…</div>
        {/if}
      </div>
    </section>

    <!-- Multiply / Tunnel (ported from live /composer). -->
    <section class="editorial-section has-duo duo-max" style="--accent:#14b8a6">
      <div class="section-duo flip">
        <div class="duo-copy">
          <span class="section-kicker">Multiply</span>
          <h2 class="section-title">Unfold it into a tunnel</h2>
          <div class="prose">
            <p>
              Every sequence can unfold into a tunnel: the same choreography
              multiplied across two, four, or eight performers in a ring, with
              mirrors, echoes, and staggered canons on top. What starts as one
              pattern becomes a stage full of them. This is running live:
            </p>
          </div>
        </div>
        <div class="duo-demo" use:activateTunnelWhenNear>
          <LazyMount
            loader={() =>
              import("../../(public)/composer/_components/ComposerTunnelDemo.svelte")}
            active={tunnelActive && !!demoSeq}
            props={{ sequence: demoSeq }}
          >
            {#snippet placeholder()}
              <div class="sk-demo" aria-hidden="true">
                <div class="sk-stage sk-stage-square"></div>
                <div class="sk-pill sk-pill-tunnel"></div>
              </div>
            {/snippet}
          </LazyMount>
        </div>
      </div>
    </section>

    <!-- Choreo Cards (ported from live /composer). -->
    <section class="editorial-section" style="--accent:#8b5cf6">
      <span class="section-kicker">Card</span>
      <h2 class="section-title">The alphabet leaves the screen</h2>
      <div class="cards-block has-duo duo-max">
        <!-- demo-star: fan first in source (phones keep fan-above-copy), copy
             takes the narrower left column from 1100px up. -->
        <div class="section-duo demo-star">
          <div class="duo-demo">
            <div class="cards-fan" use:activateChoreoCardsWhenNear>
              <LazyMount
                loader={() =>
                  import("../../(public)/composer/_components/ComposerChoreoCardsDemo.svelte")}
                active={choreoCardsActive}
              >
                {#snippet placeholder()}
                  <FanSkeleton />
                {/snippet}
              </LazyMount>
            </div>
          </div>
          <div class="duo-copy">
            <div class="prose">
              <p>
                Choreo Cards put a sequence on a physical card: the word, every
                step, the mandalas, and a QR that opens it in Composer with any
                prop at any speed. Shuffle a deck and the game keeps going away
                from the app, one card in your hand at a time. Every card the app
                builds can print, and the decks in the shop are already composed
                and ready to spin.
              </p>
            </div>
            <div class="hero-ctas cards-ctas">
              <a href="/shop/loop-deck" class="cta-button">
                <span>See how Choreo Cards work</span>
                <i class="fas fa-arrow-right" aria-hidden="true"></i>
              </a>
              <a href="/shop" class="cta-secondary">
                <span>Browse the decks</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 3D viewer (ported from live /composer). -->
    <section class="editorial-section" style="--accent:#06b6d4">
      <span class="section-kicker">3D</span>
      <h2 class="section-title">Watch it performed in 3D</h2>
      <div class="prose">
        <p>
          Any sequence plays back in a full 3D scene: a performer spinning your
          choreography on a stage you can orbit. The one below is running live.
          Drag to look around, drop it into a different environment, or multiply
          it into a ring performing in unison. The 2D notation is the score. The
          3D viewer is the performance.
        </p>
      </div>
      <div class="breakout cinema" use:activate3DWhenNear>
        <LazyMount
          loader={() =>
            import("../../(public)/composer/_components/Composer3DViewerDemo.svelte")}
          active={viewer3DActive && !!demoSeq}
          props={{ sequence: demoSeq }}
        >
          {#snippet placeholder()}
            <div class="sk-demo" aria-hidden="true">
              <div class="sk-stage sk-stage-wide"></div>
              <div class="sk-pill sk-pill-viewer"></div>
              <div class="sk-pill sk-pill-viewer"></div>
            </div>
          {/snippet}
        </LazyMount>
      </div>
      <p class="demo-hint">
        Drag to orbit. Switch the scene, or multiply into a ring. This is the
        real viewer, running live.
      </p>
      <div class="resource-row">
        <LinkChip href="/create" data-sveltekit-reload
          >Open a sequence in 3D</LinkChip
        >
      </div>
    </section>

    <!-- WING 3: LEARN -->
    <div class="wing-band" style="--wc:#f0a83c">
      <span class="wn">③</span><span class="wname">Learn</span>
      <span class="wtag">learn it &amp; get better</span>
    </div>

    <!-- Games: the arcade strip as a wide grid band. -->
    <section class="editorial-section" style="--accent:#f0a83c">
      <span class="section-kicker">Play</span>
      <h2 class="section-title">A whole arcade, not one game</h2>
      <div class="prose">
        <p>
          The arcade's own animated preview tiles. The four that need no alphabet
          knowledge lead.
        </p>
      </div>
      <div class="breakout wide slot" use:whenNear={"games"}>
        {#if comp.games}
          {@const Section = comp.games}
          <Section />
        {:else}
          <div class="ph">loading on scroll…</div>
        {/if}
      </div>
    </section>

    <p class="note-line">
      Guide tease (cover emblem + spine) and Practice tease (tempo-ramp cockpit)
      come next in this wing.
    </p>

    <!-- WING 4: CONNECT -->
    <div class="wing-band" style="--wc:#35c7d6">
      <span class="wn">④</span><span class="wname">Connect</span>
      <span class="wtag">share it</span>
    </div>

    <section class="editorial-section" style="--accent:#35c7d6">
      <span class="section-kicker">Follow</span>
      <h2 class="section-title">Follow the flow you like</h2>
      <div class="prose">
        <p>
          Follow the people whose flow you like. Their new sequences surface when
          you come back — a set of creators worth watching, not a feed to scroll.
        </p>
      </div>
      <div class="breakout wide slot" use:whenNear={"connect"}>
        {#if comp.connect}
          {@const Section = comp.connect}
          <Section />
        {:else}
          <div class="ph">loading on scroll…</div>
        {/if}
      </div>
    </section>

    <!-- WING 5: LIBRARY & BROWSE -->
    <div class="wing-band" style="--wc:#5bd6a8">
      <span class="wn">⑤</span><span class="wname">Library &amp; Browse</span>
      <span class="wtag">find it</span>
    </div>

    <section class="editorial-section" style="--accent:#5bd6a8">
      <span class="section-kicker">Browse</span>
      <h2 class="section-title">Everyone's sequences, yours to collect</h2>
      <div class="prose">
        <p>
          Browse everything the community has shared, filter it down, and drop
          what you like into a collection. Smart Collections fill themselves from
          a rule you set once.
        </p>
      </div>
      <div class="breakout wide slot" use:whenNear={"library"}>
        {#if comp.library}
          {@const Section = comp.library}
          <Section />
        {:else}
          <div class="ph">loading on scroll…</div>
        {/if}
      </div>
    </section>

    <!-- ── TAIL (page-level, below the five wings — kept per Austen's call) ── -->

    <!-- Features bento -->
    <section class="editorial-section" style="--accent:#22c55e">
      <span class="section-kicker">Features</span>
      <h2 class="section-title">Also in the app today</h2>
      <div class="prose"><p>Every one of these is live in the app today.</p></div>
      <div class="breakout wide">
        <div class="bento">
          <div class="bento-cell text-only">
            <div class="bento-text">
              <strong>Community gallery</strong>
              <span
                >real public sequences shared across the community, filterable by
                level</span
              >
            </div>
          </div>
          <div class="bento-cell text-only">
            <div class="bento-text">
              <strong>Image and video export</strong>
              <span
                >render any sequence as an image or a video, straight from the
                viewer</span
              >
            </div>
          </div>
          <div class="bento-cell text-only">
            <div class="bento-text">
              <strong>QR share links</strong>
              <span
                >every export carries a scan code that opens the sequence on any
                phone</span
              >
            </div>
          </div>
          <div class="bento-cell text-only">
            <div class="bento-text">
              <strong>Library</strong>
              <span
                >collections and smart collections for everything you save</span
              >
            </div>
          </div>
          <div class="bento-cell text-only">
            <div class="bento-text">
              <strong>Props</strong>
              <span
                >eleven supported: staff, fan, hoop, buugeng, triad, club, sword,
                double star, eight rings, guitar, quiad</span
              >
            </div>
          </div>
          <div class="bento-cell text-only">
            <div class="bento-text">
              <strong>Games</strong>
              <span
                >an arcade built from the alphabet, with best scores to chase</span
              >
            </div>
          </div>
          <div class="bento-cell text-only">
            <div class="bento-text">
              <strong>Practice modes</strong>
              <span>drill sequences step by step</span>
            </div>
          </div>
          <div class="bento-cell text-only">
            <div class="bento-text">
              <strong>Installable</strong>
              <span>works as an app on your phone, no app store</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Roadmap -->
    <section class="editorial-section" style="--accent:#a3e635">
      <span class="section-kicker">Roadmap</span>
      <h2 class="section-title">Where it's headed</h2>
      <ul class="bullet-list">
        {#each ROADMAP as item}
          <li><strong>{item.label}</strong>: {item.detail}</li>
        {/each}
      </ul>
    </section>

    <!-- Foundation -->
    <section class="editorial-section" style="--accent:#8b5cf6">
      <span class="section-kicker">Foundation</span>
      <h2 class="section-title">Built on The Kinetic Alphabet</h2>
      <div class="prose">
        <p>
          The Kinetic Alphabet exists on paper. It existed before this app, and
          it works without it: two pens and a notebook are enough to record
          choreography. Composer is an instrument built for that language. And
          like any instrument, you don't have to read the music to play it. The
          app handles the letters. You handle the movement.
        </p>
      </div>
      <div class="resource-row">
        <LinkChip href="/notation">Read about the notation</LinkChip>
        <LinkChip href="/about">About the project</LinkChip>
      </div>
    </section>

    <!-- Try it -->
    <section class="editorial-section" style="--accent:#38bdf8">
      <span class="section-kicker">Try it</span>
      <h2 class="section-title">Play with it right here</h2>
      <div class="prose">
        <p>
          This is the app in miniature, running live. Swap effects, props, and
          tempo with the same controls the real thing gives you. The strip along
          the bottom is the sequence's notation, keeping time with the animation.
        </p>
      </div>
      <div
        class="breakout cinema playwithit-slot"
        use:activatePlayWithItWhenNear
      >
        <LazyMount
          loader={() => import("../../landing/components/PlayWithItInner.svelte")}
          active={playWithItActive}
        >
          {#snippet placeholder()}
            <PlayWithItSkeleton />
          {/snippet}
        </LazyMount>
      </div>
    </section>

    <!-- Final CTA -->
    <div class="cta-card">
      <h3>Ready to compose?</h3>
      <p>Flow Arts Composer is free to use. No download required.</p>
      <a href="/create" class="cta-button" data-sveltekit-reload>
        <span>Open Flow Arts Composer</span>
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </a>
    </div>

    <div class="tail"></div>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    color: #e7e9f5;
    background: radial-gradient(
      120% 80% at 50% -8%,
      #171a3a 0%,
      #0e1024 45%,
      #0a0b16 100%
    );
    background-attachment: fixed;
    font-family: "Inter", system-ui, sans-serif;
  }

  /* This route has no fixed SiteHeader, so the editorial's 88px clearance is
     dead space — reclaim it. */
  .editorial {
    padding-top: 24px;
  }
  .editorial-section:not(.panel) {
    padding-top: 1.1rem;
  }

  /* Slim harness marker above the real hero. */
  .harness-note {
    text-align: center;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #f0a83c;
    margin: 0 0 0.6rem;
  }

  .wing-band {
    display: flex;
    align-items: baseline;
    gap: 0.7rem;
    border-top: 2px solid var(--wc);
    padding-top: 0.6rem;
    margin: 2.8rem 0 0.4rem;
  }
  .wn {
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--wc);
  }
  .wname {
    font-size: 1.1rem;
    font-weight: 720;
  }
  .wtag {
    color: #9aa0c4;
    font-style: italic;
    font-size: 0.9rem;
  }

  /* Demo cell inside a duo centers its content vertically. */
  .duo-demo.slot {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  /* Reserve scroll height on the PLACEHOLDER only, so the observers don't all
     fire at once before load — once a section mounts, the slot sizes to its
     content and leaves no dead gap under short sections. */
  .ph {
    min-height: 42vh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7099;
    font-size: 0.85rem;
    text-align: center;
  }

  .note-line {
    color: #6b7099;
    font-size: 0.85rem;
    font-style: italic;
    margin: 1.2rem 0 0;
  }
  .tail {
    height: 30vh;
  }

  /* ── Hero + tail styles (carried verbatim from the live /composer page so the
     parity preview matches pixel-for-pixel) ── */

  .hero-ctas {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.9rem;
    margin: 2.2rem 0 3.6rem;
  }

  .cta-secondary {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    font-size: clamp(1.05rem, 1rem + 0.12vw, 1.2rem);
    font-weight: 650;
    color: oklch(0.9 0.015 270);
    text-decoration: none;
    padding: 0.9em 1.8em;
    border-radius: 13px;
    background: oklch(0.3 0.04 270 / 0.18);
    border: 1px solid oklch(0.5 0.06 270 / 0.3);
    transition:
      transform 160ms ease,
      border-color 160ms ease,
      background 160ms ease;
  }
  .cta-secondary:hover {
    transform: translateY(-2px);
    background: oklch(0.34 0.05 270 / 0.26);
    border-color: oklch(0.6 0.08 270 / 0.5);
  }

  .cards-ctas {
    margin: 1.8rem 0 0;
  }

  .playwithit-slot {
    display: flex;
    flex-direction: column;
  }
  @media (max-width: 600px) {
    .playwithit-slot {
      height: min(34rem, 80vh);
    }
  }

  .sk-demo {
    display: flex;
    flex-direction: column;
    align-items: center;
    animation: sk-pulse 1.8s ease-in-out infinite;
  }
  .sk-stage {
    width: 100%;
    border-radius: 16px;
    border: 1px solid oklch(0.4 0.04 270 / 0.16);
    background: radial-gradient(
      circle at 50% 42%,
      oklch(0.2 0.035 270) 0%,
      oklch(0.11 0.02 270) 70%
    );
  }
  .sk-stage-square {
    aspect-ratio: 1;
    max-width: min(30rem, 100%);
    border-radius: 18px;
  }
  @media (min-width: 1680px) {
    .sk-stage-square {
      max-width: min(72vh, 100%);
    }
    .sk-stage-wide {
      max-width: min(100%, calc(78vh * 16 / 9));
      margin-inline: auto;
    }
  }
  .sk-stage-wide {
    aspect-ratio: 16 / 9;
  }
  .sk-pill {
    height: 52px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .sk-pill-tunnel {
    margin-top: 1rem;
    width: min(100%, 22rem);
  }
  .sk-pill-viewer {
    margin-top: 1rem;
    width: min(100%, 30rem);
  }
  .sk-pill-viewer + .sk-pill-viewer {
    margin-top: 0.8rem;
  }

  @keyframes sk-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sk-demo {
      animation: none;
    }
  }

  .demo-hint {
    margin: -0.7rem 0 1.4rem;
    font-size: clamp(0.8rem, 0.76rem + 0.12vw, 0.95rem);
    color: oklch(0.62 0.02 270);
    text-align: center;
  }

  /* feature bento */
  .bento {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(17rem, 100%), 1fr));
    gap: 1rem;
  }
  .bento-cell {
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    overflow: hidden;
    background: oklch(0.16 0.018 270 / 0.45);
    border: 1px solid oklch(0.4 0.04 270 / 0.14);
  }
  .bento-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.9rem 1.1rem 1.1rem;
    margin-top: auto;
  }
  .bento-cell.text-only .bento-text {
    justify-content: center;
    flex: 1;
    min-height: 6.5rem;
  }
  .bento-text strong {
    font-size: clamp(1rem, 0.95rem + 0.15vw, 1.2rem);
    font-weight: 650;
    color: oklch(0.92 0.02 270);
  }
  .bento-text span {
    font-size: clamp(0.88rem, 0.84rem + 0.12vw, 1.05rem);
    line-height: 1.5;
    color: oklch(0.68 0.015 270);
  }

  .cards-block {
    margin-top: 2rem;
  }
  .cards-fan {
    margin: 0.4rem auto 1.4rem;
    max-width: 40rem;
    container-type: inline-size;
  }
  @media (min-width: 1100px) {
    .cards-fan {
      max-width: none;
      margin: 0;
    }
  }

  /* Duo helpers: below the duo breakpoints the copy block centers. */
  @media (max-width: 1099.98px) {
    .section-duo > .duo-copy {
      margin-inline: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cta-secondary {
      transition: none;
    }
    .cta-secondary:hover {
      transform: none;
    }
  }

  /* ── split hero (big tier ≥1680px) — carried verbatim from live /composer ── */
  @media (min-width: 1680px) {
    .hero-duo {
      position: relative;
      left: 50%;
      translate: -50% 0;
      width: min(90vw, 130rem);
      display: grid;
      grid-template-columns: auto auto;
      grid-template-rows: auto 1fr auto auto 1fr;
      grid-template-areas:
        "header header"
        ".      stage"
        "lede   stage"
        "ctas   stage"
        ".      stage";
      justify-content: center;
      column-gap: clamp(3rem, 4vw, 6rem);
      padding-top: clamp(1.5rem, 2.5vw, 3.5rem);
      margin-bottom: 3.6rem;
    }
    .hero-duo > .editorial-header {
      grid-area: header;
      text-align: center;
      margin: 0 0 clamp(2rem, 3vw, 3.25rem);
    }
    .hero-duo > .lede {
      grid-area: lede;
      text-align: left;
      margin: 0;
      width: 40rem;
      max-width: 100%;
    }
    .hero-duo > .hero-ctas {
      grid-area: ctas;
      justify-content: flex-start;
      margin: 1.4rem 0 0;
      width: 40rem;
      max-width: 100%;
    }
    .hero-duo > .hero-stage {
      grid-area: stage;
      align-self: center;
    }
    .hero-duo > .hero-stage :global(.hero-demo) {
      width: min(60vh, 44rem);
      margin-top: 0;
    }
  }
</style>
