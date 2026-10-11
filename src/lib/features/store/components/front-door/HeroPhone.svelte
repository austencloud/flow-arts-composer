<!--
  The hero's phone — and the page's whole argument.

  Every previous version of this hero DESCRIBED what a scan does, or mimed it:
  a drawn mandala standing in for the sequence coming alive. It was pretty and
  it was fiction. Austen's call (2026-08-03): "on that phone it literally loads
  the exact component that they will literally see when they go to the literal
  QR code scan ... a miniature phone simulating what the phone will experience."

  So this screen is an iframe of the real `/q/<code>` for the card on the stack
  beside it. The ingress performs the same handoff to the canonical /sequence
  viewer as a printed scan. Nothing here is a mock, and nothing here forks its
  chrome.

  THREE THINGS MAKE THAT SAFE:

  1. `?demo=1`. A page that shows the scan route must not be counted as
     scanning. The /q ingress and /sequence host read the flag and skip the scan
     visit and physical-card ledger write, which silences every downstream
     captureScan* call by construction.
  2. The code is LOOKED UP, never minted. `findExistingCodeForSequence` is a
     pure Firestore read; a public marketing page must never write short codes
     (one-code-per-hash). No code, no phone — the composition just holds the
     cards.
  3. The screen is LIVE WHEN IT IS BIG ENOUGH TO BE USED BY THE POINTER YOU
     HAVE, and inert below that (see `bigEnough`). It used to be pointer-inert
     at every size, on the argument that it was a depiction rather than a
     control surface. Austen (2026-08-04): "on my 4K device I actually could
     click each one of these buttons very easily." Right — at 4K the embedded
     viewer's controls render LARGER than they do on a real phone, so refusing
     the click was the only dishonest thing left on an otherwise honest
     picture. Below the gate the old argument still holds and the old behavior
     is unchanged. Either way "Open this scan" stays: the real /q, no demo
     flag, new tab.
  4. The embed shows the scan, so the chrome that LEAVES the scan is not in it
     — the /q host passes `embedded` to the shared viewer shell when demo=1,
     and the shell drops close, the account entry, Share, and every
     navigate-away menu item. See SequenceViewerShell.svelte.

  The iframe renders at a true 375 CSS viewport WIDTH — a phone's width, so /q
  lays itself out exactly as it does on a phone — and is scaled into the frame
  with a transform. Its HEIGHT is derived from the measured screen so the
  embedded page's own viewport fits below the camera's top bar (see `frameH`).
  Nothing loads until the first scan press.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  interface Props {
    /** The real short code for the card on the stack. Null = no phone content. */
    code: string | null;
    /** Boot the iframe. False until the phone has landed on stage (lazy). */
    armed: boolean;
    /** The phone has entered the scene. False = parked off-stage, invisible. */
    onstage: boolean;
    /** The viewfinder is mid-choreography: screen shows the camera view. */
    viewfinder: boolean;
    /** The code has been RECOGNISED — the beat the chip belongs to. */
    locked: boolean;
    /** The screen has swiped up into the loading/loaded scan page. */
    opened: boolean;
    /** Baked cover art for the camera view — the card the phone is aimed at. */
    coverUrl: string | null;
    /**
     * The printed QR's cell as % of the trimmed card, from the same print
     * layout math the bake used (card-front-regions). The camera view IS that
     * card, so the viewfinder brackets land on the actual code rather than on
     * the middle of the frame — and they move with the step count, because the
     * cell does.
     */
    qrCell: { x: number; y: number; w: number; h: number } | null;
    /** Reduced motion: skip the camera beat entirely. */
    reducedMotion: boolean;
  }
  let {
    code,
    armed,
    onstage,
    viewfinder,
    locked,
    opened,
    coverUrl,
    qrCell,
    reducedMotion,
  }: Props = $props();

  /** A phone's CSS viewport WIDTH. /q lays out its real mobile design here, so
   *  this one is a constant: 375 is a phone, and a derived width would just be
   *  a smaller phone. */
  const FRAME_W = 375;
  // Reserve the camera's status bar in the same phone pixels as the live page.
  const SAFE_AREA_TOP = 28;
  /** Only until the screen has been measured — see `frameH`. */
  const FALLBACK_H = 812;

  let loaded = $state(false);
  let screenW = $state(0);
  let screenH = $state(0);

  // Re-boot the loading state whenever the target changes: a new card is a new
  // page load, and phones load. Pretending otherwise would be the one dishonest
  // frame in an otherwise honest picture.
  const src = $derived(code && armed ? `/q/${code}?demo=1` : null);
  $effect(() => {
    void src;
    loaded = false;
  });

  const scale = $derived(screenW ? screenW / FRAME_W : 0);

  /**
   * THE FRAME'S HEIGHT IS DERIVED, NEVER DECLARED.
   *
   * It used to be a hardcoded 375x812 — an iPhone X's viewport — scaled by
   * width alone into a screen whose aspect ratio is set by the phone body
   * (1:2.02 with a 2.4% bezel, so the screen is about 1:2.07). 812/375 is
   * 2.165, which is TALLER than the box it lands in, so /q laid itself out to
   * a page ~4% longer than the visible screen and the bottom 4% fell outside
   * it. What fell outside was the viewer's bottom navigation. Austen
   * (2026-08-04): "it appears to have its bottom navigation that's cut off as
   * though the component isn't properly telling its contents how big it is."
   *
   * Exactly right, so the component tells it. Width stays 375 because that is
   * what makes /q lay out as a phone; the height is whatever, at this scale,
   * fills the screen below the camera bar — measured, not assumed. /q's own
   * `svh`/`dvh` rules then resolve against the iframe, and its bottom bar sits
   * on the visible bottom edge by construction, at every viewport.
   *
   * `clientWidth`/`clientHeight` are the right measures rather than a bounding
   * rect: the phone is rotated in 3D and scaled by the deal flourish, and
   * those are LAYOUT boxes, unmoved by any of it. Svelte's bindings are
   * ResizeObserver-backed, so this re-derives itself whenever the stage
   * resizes. Rounding up spends a sub-pixel of overfill (clipped by the
   * screen's `overflow: hidden`) to guarantee no sliver of backdrop can show
   * along the bottom edge.
   */
  const frameH = $derived(
    scale && screenH
      ? Math.ceil(screenH / scale - SAFE_AREA_TOP)
      : FALLBACK_H - SAFE_AREA_TOP
  );

  /**
   * THE TARGET-SIZE GATE — the number that decides whether the screen is a
   * control surface or a picture of one. There are two of them, because a
   * thumb and a mouse are not the same instrument.
   *
   * The embedded page lays itself out at 375 CSS px and is then scaled by
   * `scale`, so every control inside it is scaled too: the app's 44px floor
   * (`--min-touch-target`) lands on screen at `44 * scale`.
   *
   * The first version of this gate had ONE threshold, 0.9, derived from that
   * 44px floor — and 44px is a TOUCH norm (it is the size of a fingertip, not
   * the size of a thing a cursor can hit). Applied to a mouse it made the most
   * common real 4K setup, 4K at 200% Windows scaling = a 1920 CSS viewport,
   * inert. Austen's own machine. He pressed the nav inside the phone and
   * nothing happened: "right now when I try to click on them inside the fake
   * phone it still does not work."
   *
   * So the floor follows the pointer. For a fine pointer the governing number
   * is WCAG 2.2's Target Size (Minimum), 24 CSS px — the pointer-agnostic
   * minimum, and the one that actually describes a cursor. The embedded
   * viewer's smallest real control is a bottom-nav tab, measured 67.6 x 44.0
   * CSS px in the frame's own coordinates, so 24 / 44 = 0.545 -> 0.55.
   *
   * Measured, not assumed (2026-08-04, Chrome, one CSS px per device px; tab
   * = a bottom-nav tab's on-screen height, and it is exactly the 44px floor):
   *
   *   viewport      screen px  scale   tab lands at   fine    coarse
   *   3840 x 2160      399     1.064       46.8       live    live
   *   2560 x 1440      347     0.925       40.7       live    live
   *   1920 x 1080      255     0.680       29.9       live    inert
   *   1440 x  900      217     0.579       25.5       live    inert
   *    820 x 1180      194     0.517       22.8       inert   inert
   *    960 x  412       75     0.200        8.8       inert   inert
   *    375 x  667      110     0.293       12.9       inert   inert
   *
   * Both lines fall in empty GAPS in that ladder — 0.55 between 0.517 and
   * 0.579, 0.9 between 0.680 and 0.925 — which is what makes them stable
   * thresholds rather than lucky ones. 820 sits just under the fine line on
   * purpose: at 0.517 a tab is 22.9px, under the 24px minimum, and a real
   * 820-wide device is a tablet reporting a coarse pointer anyway.
   *
   * Coarse keeps the old rule verbatim: a visitor on a phone, tapping a phone
   * drawn inside their phone, is looking at a picture. Nothing about a real
   * touch screen makes a 13px tab hittable.
   *
   * The one thing that could chatter is a live RESIZE dragged across a line,
   * so each gate has hysteresis: it opens at its threshold and does not close
   * until slightly below. A gate that chattered would flash the cue on and off.
   *
   * Reactive off the measured screen width — the same ResizeObserver-backed
   * binding `frameH` derives from — never a viewport media query. The screen's
   * size is a function of the stage's container tiers and `svh`, not of the
   * viewport width alone, so only the measurement knows the answer. The
   * POINTER is the one thing a measurement cannot know, so that half is a
   * media query, listened to rather than sampled: a convertible folding into
   * tablet mode flips it without a resize.
   */
  const LIVE_IN_FINE = 0.55;
  const LIVE_OUT_FINE = 0.52;
  const LIVE_IN_COARSE = 0.9;
  const LIVE_OUT_COARSE = 0.86;

  let finePointer = $state(false);
  $effect(() => {
    const mq = matchMedia("(hover: hover) and (pointer: fine)");
    finePointer = mq.matches;
    const onPointerChange = () => (finePointer = mq.matches);
    mq.addEventListener("change", onPointerChange);
    return () => mq.removeEventListener("change", onPointerChange);
  });

  let bigEnough = $state(false);
  $effect(() => {
    const s = scale;
    const fine = finePointer;
    if (!s) return;
    const open = fine ? LIVE_IN_FINE : LIVE_IN_COARSE;
    const shut = fine ? LIVE_OUT_FINE : LIVE_OUT_COARSE;
    bigEnough = s >= (untrack(() => bigEnough) ? shut : open);
  });

  /** The screen accepts the pointer: big enough, page up, page loaded. */
  const live = $derived(bigEnough && opened && loaded);
</script>

<div
  class="phone"
  class:onstage
  class:leaning={viewfinder}
  class:opened
  class:live
>
  <!-- The body's hardware, all of it decorative and all of it pointer-inert:
       the screen underneath is a control surface now, and nothing drawn on top
       of a phone may eat a press meant for it. -->
  <span class="earpiece" aria-hidden="true"></span>
  <span class="nub vol-up" aria-hidden="true"></span>
  <span class="nub vol-down" aria-hidden="true"></span>
  <span class="nub power" aria-hidden="true"></span>

  <div
    class="screen"
    bind:clientWidth={screenW}
    bind:clientHeight={screenH}
    style:--phone-safe-area-top="{SAFE_AREA_TOP * scale}px"
  >
    <!-- CAMERA VIEW: what the phone sees before it resolves the code — a photo
         of a card lying in the room, not a card pasted over the screen.

         It used to be `width: 116%` bled to every edge, and with the phone body
         itself rotated in Y the whole frame read as one warped surface. Austen
         (2026-08-03): "the take a picture screen looks kinda warped in a weird
         way, it doesn't seem clear that this is a 3D phone that's being rotated
         to take a picture of an actual 2D card in space." The fix is scene, not
         card: the room is visible around the card, the card sits at a modest
         real perspective inside it, and the two drift by different amounts so
         the gap between them reads as depth. -->
    {#if coverUrl && !opened}
      <div
        class="camera"
        class:live={viewfinder}
        out:fade={{ duration: DURATION.fast }}
      >
        <span class="room" aria-hidden="true"></span>
        <span class="shot">
          <img src={coverUrl} alt="" draggable="false" />
          <span
            class="reticle"
            aria-hidden="true"
            style:left="{qrCell ? qrCell.x - 6 : 27}%"
            style:top="{qrCell ? qrCell.y - 4 : 40}%"
            style:width="{qrCell ? qrCell.w + 12 : 46}%"
            style:height="{qrCell ? qrCell.h + 8 : 20}%"
          ></span>
        </span>
        <!-- Camera chrome, at the SCREEN's edges rather than the card's: it is
             the frame you look through, which is what tells you the card is a
             subject inside a viewfinder and not the viewfinder itself. -->
        <span class="frame" aria-hidden="true"></span>
        {#if locked}
          <span class="chip" aria-hidden="true">
            <i class="fas fa-qrcode"></i>
            <span>tka.run/{code}</span>
          </span>
        {/if}
      </div>
    {/if}

    <!-- THE REAL PAGE. -->
    {#if src}
      <div class="page" class:up={opened}>
        {#if !loaded}
          <div class="loading" aria-hidden="true">
            <span class="spinner"></span>
            <span class="loading-text">Opening tka.run/{code}</span>
          </div>
        {/if}
        <div
          class="viewport"
          class:live
          style:width="{FRAME_W}px"
          style:height="{frameH}px"
          style:transform="scale({scale})"
        >
          <iframe
            title="The scan page this card opens"
            {src}
            width={FRAME_W}
            height={frameH}
            loading="lazy"
            referrerpolicy="same-origin"
            onload={() => (loaded = true)}
          ></iframe>
        </div>
      </div>
    {/if}

    <!-- The sheen of glass held at an angle. Last child of the screen so the
         screen's own `overflow: hidden` clips it to the rounded rect, and
         pointer-inert so it cannot come between a visitor and a live page. -->
    <span class="glare" aria-hidden="true"></span>
  </div>

  <!-- The camera sits in the display's reserved top bar, above the live page. -->
  <span class="punch" aria-hidden="true"></span>

  <!-- Quiet, and only where the screen actually takes a press. Absolutely
       placed above the phone, so it can appear and disappear with the gate
       without moving anything (no-layout-shift.md). -->
  {#if live}
    <span
      class="live-cue"
      transition:fade={{ duration: reducedMotion ? 0 : DURATION.fast }}
    >
      <span class="dot" aria-hidden="true"></span>
      This screen is live
    </span>
  {/if}

  <!-- The way out, at every size: the same code without the demo flag, so a
       visitor who wants the real page gets the real page, counted like any
       other visit. -->
  {#if code && opened}
    <a
      class="open-real"
      href="/q/{code}"
      target="_blank"
      rel="noopener"
      transition:fade={{ duration: reducedMotion ? 0 : DURATION.fast }}
    >
      Open this scan
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </a>
  {/if}
</div>

<style>
  /* Sized by the host from one --phone-h, so the hero can make the phone its
     dominant object per viewport without this component knowing the layout. */
  .phone {
    position: relative;
    height: var(--phone-h, 30rem);
    aspect-ratio: 1 / 2.02;
    border-radius: clamp(1.1rem, 7%, 2.4rem);
    padding: 2.4%;
    background: linear-gradient(
      158deg,
      #333a4b,
      #12151d 52%,
      #262c3a 86%,
      #171b25
    );
    box-shadow:
      0 2rem 4rem rgba(0, 0, 0, 0.6),
      0 0.35rem 0.9rem rgba(0, 0, 0, 0.45),
      inset 0 0 0 1px rgba(0, 0, 0, 0.55);
    /* THE ENTRANCE, and then the lean. Both are the same `transform`, so they
       have to be one ladder of states rather than two properties.

       Off-stage: swung out to the right, turned away, small. It reads as an
       object still edge-on to the viewer, which is why the arrival reads as a
       rotation into the scene rather than a slide of a flat rectangle. The
       overshoot easing is the spring settle; --card-stage clips the travel, so
       it genuinely comes from off the edge of the stage.

       On stage: the lean, tipped toward the card it is about to read.
       Perspective on the parent would apply to the cards too, so it lives here. */
    transform: perspective(1400px) translateX(88%) rotateY(-52deg) scale(0.86);
    opacity: 0;
    transition:
      transform 640ms cubic-bezier(0.22, 1.12, 0.36, 1),
      opacity 320ms ease-out;
    will-change: transform;
  }
  .phone.onstage {
    transform: perspective(1400px) rotateY(-13deg) rotateX(3deg) rotateZ(-2deg);
    opacity: 1;
  }
  .phone.onstage.leaning {
    transform: perspective(1400px) rotateY(-4deg) rotateX(1deg) scale(1.03);
  }
  .phone.onstage.opened {
    transform: perspective(1400px) rotateY(-6deg) rotateX(1deg);
  }

  /* ── the body's hardware ────────────────────────────────────────────────
     A phone is a machined object, and the flat gradient it used to be read as
     a rounded rectangle with a picture in it. Everything below is CSS — no
     device frame asset, and nothing that cosplays a particular manufacturer.
     Austen (2026-08-04): "is this the most realistic we can make the phone
     look." Four cues do it: a rim that catches light, buttons that break the
     silhouette, a camera cut into the display, and glass that has a sheen.

     THE RIM. The old edge was one flat inset hairline, the same brightness the
     whole way round, which is exactly what an edge of real metal never is. A
     conic gradient masked to the border box gives the frame a light source: it
     flares along the upper-left and lower-right chamfers and goes near-dark on
     the runs between them, so turning the phone (the lean, the entrance) reads
     as an object catching a highlight. `mask-composite: exclude` over a
     content-box mask is the standard gradient-border trick — the padding value
     IS the rim's thickness. */
  .phone::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 4;
    border-radius: inherit;
    padding: clamp(1px, 0.6%, 3px);
    background: conic-gradient(
      from 205deg at 50% 50%,
      rgba(255, 255, 255, 0.05),
      rgba(255, 255, 255, 0.58) 34deg,
      rgba(158, 178, 208, 0.16) 88deg,
      rgba(255, 255, 255, 0.08) 148deg,
      rgba(255, 255, 255, 0.46) 202deg,
      rgba(150, 168, 196, 0.14) 258deg,
      rgba(255, 255, 255, 0.3) 316deg,
      rgba(255, 255, 255, 0.05) 360deg
    );
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    mask-composite: exclude;
    pointer-events: none;
  }

  /* The earpiece slit, on the bezel where it belongs. It used to be a 26%-wide
     bar sitting on the seam, half of it over the screen. */
  .earpiece {
    position: absolute;
    z-index: 5;
    top: 0.34%;
    left: 50%;
    translate: -50% 0;
    width: 15%;
    height: 0.5%;
    border-radius: 999px;
    background: linear-gradient(
      180deg,
      rgba(0, 0, 0, 0.9),
      rgba(255, 255, 255, 0.16)
    );
    pointer-events: none;
  }

  /* Power and volume, hanging off the frame — the silhouette break that stops
     the body reading as a rounded rectangle. Widths are % of the phone's WIDTH
     and heights % of its HEIGHT, so they hold their proportions at every size
     the stage hands this component. */
  .nub {
    position: absolute;
    z-index: 5;
    width: 1.15%;
    background: linear-gradient(180deg, #4d556a, #262c39 55%, #414a5d);
    box-shadow: 0 0 0.12rem rgba(0, 0, 0, 0.75);
    pointer-events: none;
  }
  .nub.vol-up,
  .nub.vol-down {
    left: -0.9%;
    border-radius: 0.14rem 0 0 0.14rem;
  }
  .nub.vol-up {
    top: 19.5%;
    height: 5.6%;
  }
  .nub.vol-down {
    top: 26.5%;
    height: 5.6%;
  }
  .nub.power {
    right: -0.9%;
    top: 24%;
    height: 8.2%;
    border-radius: 0 0.14rem 0.14rem 0;
  }

  /* The camera stays above the live page, inside its reserved top bar. */
  .punch {
    position: absolute;
    z-index: 5;
    top: 1.75%;
    left: 50%;
    translate: -50% 0;
    width: 3.7%;
    aspect-ratio: 1;
    border-radius: 50%;
    background:
      radial-gradient(
        circle at 36% 30%,
        rgba(104, 138, 182, 0.5),
        rgba(5, 7, 11, 0.98) 60%
      ),
      #05070a;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.85),
      0 0 0.3rem rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }

  .screen {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: clamp(0.7rem, 5%, 1.6rem);
    overflow: hidden;
    background: #0b0d12;
    /* Containing block for both layers. */
    isolation: isolate;
  }

  .screen::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: var(--phone-safe-area-top);
    z-index: 4;
    background: #0b0d12;
    pointer-events: none;
  }

  .camera {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: #05070b;
    /* The camera's own depth, separate from the phone body's. Shallow, because
       a phone camera a foot from a card is a shallow view. */
    perspective: 900px;
    perspective-origin: 52% 45%;
    overflow: hidden;
  }

  /* THE ROOM the card is lying in — the hero's own backdrop, seen through the
     lens. Slightly oversized and blurred: it is the out-of-focus far field that
     makes the sharp card read as the thing being focused on. */
  .room {
    position: absolute;
    inset: -12%;
    background:
      radial-gradient(
        circle at 62% 28%,
        rgba(126, 224, 255, 0.26),
        transparent 56%
      ),
      radial-gradient(
        circle at 22% 84%,
        rgba(255, 122, 184, 0.2),
        transparent 60%
      ),
      linear-gradient(168deg, #15203a, #0a0f1c 60%, #121a30);
    filter: blur(2px);
    transform: scale(1.04) translate(1.2%, -0.8%);
    transition: transform 900ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* The card as the camera sees it: a flat object lying in that room, taking a
     bit over half the frame, turned a few degrees off square. The reticle is
     positioned inside THIS box, so its percentages stay percentages of the CARD
     — which is what the QR cell rect from card-front-regions is expressed in,
     and why the brackets still land on the printed code. */
  .shot {
    position: relative;
    display: block;
    width: 58%;
    transform-style: preserve-3d;
    transform: rotateX(7deg) rotateY(-9deg) rotateZ(-2.5deg) translateZ(-14px);
    /* The drift: a hand holding a phone is never still. The card and the room
       move by DIFFERENT amounts and in opposite directions — that parallax is
       the whole depth cue. Slow enough to read as breathing. */
    transition: transform 900ms cubic-bezier(0.22, 1, 0.36, 1);
    filter: drop-shadow(0 0.6rem 1.1rem rgba(0, 0, 0, 0.65));
  }
  .camera.live .shot {
    transform: rotateX(4deg) rotateY(-5deg) rotateZ(-1deg) translateZ(26px)
      scale(1.05);
  }
  .camera.live .room {
    transform: scale(1.09) translate(-1.4%, 1%);
  }
  .camera img {
    display: block;
    width: 100%;
    max-width: none;
    border-radius: 0.15rem;
    filter: brightness(0.94) contrast(1.04);
  }

  /* Corner marks at the screen's edges — the frame you look THROUGH. */
  .frame {
    position: absolute;
    inset: 7%;
    border: 0.12rem solid rgba(255, 255, 255, 0.34);
    border-radius: 0.5rem;
    -webkit-mask-image:
      linear-gradient(to right, #000 0 12%, transparent 12% 88%, #000 88% 100%),
      linear-gradient(to bottom, #000 0 9%, transparent 9% 91%, #000 91% 100%);
    -webkit-mask-composite: source-in;
    mask-image:
      linear-gradient(to right, #000 0 12%, transparent 12% 88%, #000 88% 100%),
      linear-gradient(to bottom, #000 0 9%, transparent 9% 91%, #000 91% 100%);
    mask-composite: intersect;
  }

  /* Viewfinder corners, the same bracket treatment the card carried — now
     framing the printed code inside the camera view. */
  .reticle {
    position: absolute;
    border: 0.14rem solid rgba(255, 255, 255, 0.7);
    border-radius: 0.5rem;
    -webkit-mask-image:
      linear-gradient(to right, #000 0 22%, transparent 22% 78%, #000 78% 100%),
      linear-gradient(to bottom, #000 0 22%, transparent 22% 78%, #000 78% 100%);
    -webkit-mask-composite: source-in;
    mask-image:
      linear-gradient(to right, #000 0 22%, transparent 22% 78%, #000 78% 100%),
      linear-gradient(to bottom, #000 0 22%, transparent 22% 78%, #000 78% 100%);
    mask-composite: intersect;
  }

  /* The iOS-style chip that pops over a recognised code. */
  .chip {
    position: absolute;
    bottom: 14%;
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    max-width: 84%;
    padding: 0.45em 0.8em;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.94);
    color: #10131a;
    font-size: clamp(0.55rem, 4cqw, 0.8rem);
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
    box-shadow: 0 0.5rem 1.4rem rgba(0, 0, 0, 0.45);
    animation: chip-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes chip-pop {
    from {
      opacity: 0;
      transform: translateY(30%) scale(0.86);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  /* Swipes up from below, the way tapping a code hands you the page. */
  .page {
    position: absolute;
    inset: var(--phone-safe-area-top) 0 0;
    background: #0b0d12;
    transform: translateY(100%);
    transition: transform 560ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .page.up {
    transform: none;
  }

  .viewport {
    transform-origin: top left;
    /* Below the target-size gate this is a depiction, not a control surface —
       see the header and `bigEnough`. Above it, the press goes through. */
    pointer-events: none;
  }
  .viewport.live {
    pointer-events: auto;
  }
  .viewport iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }

  .loading {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.9em;
    background: #0b0d12;
    color: rgba(255, 255, 255, 0.72);
    font-size: clamp(0.55rem, 4cqw, 0.8rem);
  }
  .spinner {
    width: 1.8em;
    height: 1.8em;
    border-radius: 50%;
    border: 0.18em solid rgba(255, 255, 255, 0.18);
    border-top-color: #7ee0ff;
    animation: spin 900ms linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .loading-text {
    opacity: 0.8;
  }

  /* ── glass ──────────────────────────────────────────────────────────────
     A diagonal sweep and its thin trailing band: the reflection a flat sheet
     of glass carries when it is held at an angle to a light. It blends in
     `screen`, so it can only ever ADD light, and the strongest band is 11%
     white — the embedded page reads through it at every size. Above every
     layer in the screen, and the last word in the screen's stacking context;
     `isolation: isolate` on .screen keeps the blend off everything else. */
  .glare {
    position: absolute;
    inset: 0;
    z-index: 3;
    background: linear-gradient(
      118deg,
      rgba(255, 255, 255, 0) 24%,
      rgba(255, 255, 255, 0.05) 34%,
      rgba(255, 255, 255, 0.11) 41%,
      rgba(255, 255, 255, 0.03) 47%,
      rgba(255, 255, 255, 0) 55%,
      rgba(255, 255, 255, 0.045) 64%,
      rgba(255, 255, 255, 0) 72%
    );
    mix-blend-mode: screen;
    pointer-events: none;
  }

  /* ── the live cue ───────────────────────────────────────────────────────
     Two signals, both quiet. The chip says it in words, and the body picks up
     a cyan edge so the object itself looks powered. The pointer affordance is
     the embedded page's own: with the iframe live, /q's buttons hover and
     cursor exactly as they do on the real route — a cursor rule out here
     could not reach inside the frame anyway. */
  .phone.live {
    box-shadow:
      0 2rem 4rem rgba(0, 0, 0, 0.6),
      0 0.35rem 0.9rem rgba(0, 0, 0, 0.45),
      0 0 2.4rem rgba(126, 224, 255, 0.16),
      inset 0 0 0 1px rgba(0, 0, 0, 0.55);
  }

  .live-cue {
    position: absolute;
    bottom: calc(100% + 0.55rem);
    left: 50%;
    translate: -50% 0;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(126, 224, 255, 0.3);
    background: rgba(9, 14, 22, 0.85);
    color: rgba(255, 255, 255, 0.86);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
  }
  .live-cue .dot {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: #7ee0ff;
    box-shadow: 0 0 0.4rem rgba(126, 224, 255, 0.8);
  }

  /* Seated fully BELOW the phone, never on its bezel. It used to hang at
     `bottom: -1.4rem`, which put its top 19px INSIDE the screen and covered the
     embedded viewer's bottom bar. `top: 100% + gap` starts it where the phone
     ends. The host reserves `--pill-gap + --pill-h` under the phone slot, so the
     pill arriving after a scan still moves nothing (no-layout-shift.md). */
  .open-real {
    position: absolute;
    left: 50%;
    top: calc(100% + var(--pill-gap, 0.7rem));
    translate: -50% 0;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--pill-h, var(--min-touch-target, 44px));
    padding: 0 1.1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(12, 16, 24, 0.92);
    color: #fff;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
    box-shadow: 0 0.8rem 2rem rgba(0, 0, 0, 0.5);
  }
  .open-real:hover {
    border-color: rgba(255, 255, 255, 0.45);
  }
  .open-real:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .phone,
    .shot,
    .room,
    .camera img,
    .page {
      transition: none;
    }
    .chip,
    .spinner {
      animation: none;
    }
  }
</style>
