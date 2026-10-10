<!--
  GhostPointer — the attract act's visible "finger", and in presentation mode
  the only body a curious presence has.

  It was a dot with two states: idle, and pressed. That is enough to show WHERE
  a demo is clicking and not nearly enough to read as a someone. Meanwhile the
  mind has been computing a mood on every single decision since it was built,
  and nothing rendered it. This component now does.

  Austen (2026-08-05): "I want him to feel alive ... anybody from afar who's
  watching the program on the projection screen is curious and is drawn in ...
  this thing is a character."

  The vocabulary, in the order it buys life per line of code:

  - CONSIDERING — on target, hovering, not yet committed. The body leans in.
    Set by the motor between arrival and the press. This is the single largest
    "it's alive" tell there is: without it the ghost arrives and fires in the
    same instant, which no hand has ever done.
  - The TRAIL — a wisp behind the dot, length and opacity tracking `speed`. At
    fifteen feet a bare dot changing position reads as a rendering glitch; a
    tail reads as a thing that moved, and it points where it came from.
  - BREATHING at rest, always (it used to be parked-only). A perfectly still
    ghost reads as a frozen app, which is the exact wrong message for a screen
    whose whole job is to look live.
  - MOOD as colour and motion, never iconography. No faces, no emoji: the same
    bar the Taco Cat spec sets for its poses, and the reason this component can
    later be swapped for a character behind an unchanged interface.
  - RECOIL — the press scale releases through an overshooting curve, so contact
    rebounds instead of snapping flat.

  STAGE MODE (`?present=stage`) is the projector case. Every tier in here used
  to key off `min-width: 2600px`, which means a 1080p projector at a jam got the
  laptop treatment — the worst case in the room. Size now comes from an explicit
  flag set once at setup, not from guessing at the viewport.

  Two lifecycle poses survive unchanged:
  - Acting: pure decoration — pointer-events none, aria-hidden.
  - Parked (after takeover): the dot sits in the corner showing a play glyph and
    BECOMES a real button. The ghost is its own "watch it again" affordance.
-->
<script lang="ts">
  import type { GhostMood } from "../domain/intention";

  let {
    x,
    y,
    pressed = false,
    visible = false,
    parked = false,
    mood = "curious",
    speed = 0,
    heading = 0,
    dimmed = false,
    considering = false,
    stage = false,
    compact = false,
    onResume,
  }: {
    x: number;
    y: number;
    pressed?: boolean;
    visible?: boolean;
    parked?: boolean;
    /** From the mind. Rendered as colour and motion — never as a face. */
    mood?: GhostMood;
    /** 0..1 against a brisk glide. Drives the trail. */
    speed?: number;
    /** Direction of travel, radians. */
    heading?: number;
    /** Stepped back so the app can be looked at (savor). */
    dimmed?: boolean;
    /** On target, not yet committed. */
    considering?: boolean;
    /** Projection/TV sizing. */
    stage?: boolean;
    /**
     * A small finger for preview boxes: the dot sizes off the nearest
     * `container-type: size` ancestor (14 to 28px) and is 28px without one.
     * Callers pass no `speed`, as the Composer demos don't: the trail is
     * sized for page-length glides.
     */
    compact?: boolean;
    onResume?: () => void;
  } = $props();

  /**
   * Mood → hue rotation and breath rate. Deliberately a small table with no
   * per-mood art: everything here is a transform of the SAME shape, so a mood
   * can never fail to render and adding one costs a row.
   *
   * `still` is the watching pose (linger, and the quiet half of the invitation
   * family) — it should look settled, not sleepy, which is why it slows the
   * breath without dimming the colour the way `bored` does.
   */
  const MOODS: Record<GhostMood, { hue: number; breath: number; sat: number }> = {
    curious: { hue: 0, breath: 3.4, sat: 1 },
    delighted: { hue: -28, breath: 2.1, sat: 1.25 },
    bored: { hue: 8, breath: 5.2, sat: 0.55 },
    unsure: { hue: 22, breath: 2.7, sat: 0.75 },
    still: { hue: -8, breath: 4.6, sat: 0.9 },
  };

  const tone = $derived(MOODS[mood] ?? MOODS.curious);

  // The trail only earns its pixels while actually moving. Below this it is
  // noise around a stationary dot.
  const trailing = $derived(speed > 0.12 && !parked && !dimmed);
  const trailLen = $derived(Math.round(speed * (stage ? 96 : 54)));
  // `heading` is the direction of travel. The wisp faces the other way, back
  // toward where the dot came from.
  const tailDeg = $derived((heading * 180) / Math.PI + 180);
</script>

<div
  class="ghost"
  class:visible
  class:parked
  class:stage
  class:dimmed
  class:considering
  class:compact
  style={`transform: translate(${x}px, ${y}px); --mood-hue: ${tone.hue}deg; --mood-sat: ${tone.sat}; --breath: ${tone.breath}s`}
  aria-hidden={!parked}
>
  <!-- Behind the dot, pointing back along the path just travelled. -->
  {#if trailing}
    <span
      class="trail"
      aria-hidden="true"
      style={`width:${trailLen}px; opacity:${0.16 + speed * 0.4}; transform: rotate(${tailDeg}deg)`}
    ></span>
  {/if}

  <!--
    Two nested boxes on purpose. The breath is an infinite ANIMATION on
    `.dot`; press, lean-in and step-back are TRANSITIONS on `.core`. A CSS
    animation always wins the transform property over a declared value —
    including while paused — so putting both on one element means the scale
    states silently never render. Nesting lets them compose instead of fight.
  -->
  <div class="dot">
    <div class="core" class:pressed>
      {#if parked}
        <i class="fas fa-play" aria-hidden="true"></i>
      {/if}
    </div>
  </div>

  {#if parked}
    <!-- 44px hit area over the dot — touch-target floor. -->
    <button
      type="button"
      class="resume-hit"
      onclick={onResume}
      aria-label="Watch the demo again"
      title="Watch the demo again"
    ></button>
  {/if}
</div>

<style>
  .ghost {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 6;
    pointer-events: none;
    opacity: 0;
    transition: opacity 200ms ease;
    will-change: transform;
    /* One knob every child sizes off, so stage mode is a single override
       instead of six. */
    --size: 28px;
  }

  .ghost.visible {
    opacity: 1;
  }

  .ghost.parked {
    pointer-events: auto;
  }

  /* Stepped back to let the app be seen: smaller, quieter, still there. Not
     hidden — a ghost that vanishes and reappears reads as a bug, and the point
     is that it is politely watching alongside you. */
  .ghost.dimmed {
    opacity: 0.4;
  }

  .ghost.dimmed .core {
    transform: scale(0.62);
  }

  /* Breath only. Nothing else may set transform on this element. */
  .dot {
    width: var(--size);
    height: var(--size);
    margin: calc(var(--size) / -2) 0 0 calc(var(--size) / -2);
    animation: ghost-breathe var(--breath, 3.4s) ease-in-out infinite;
  }

  .core {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(
      circle at 35% 35%,
      color-mix(in srgb, var(--accent, #8b8cff) 90%, white),
      color-mix(in srgb, var(--accent, #8b8cff) 65%, transparent) 70%
    );
    box-shadow:
      0 0 18px color-mix(in srgb, var(--accent, #8b8cff) 65%, transparent),
      0 0 40px color-mix(in srgb, var(--accent, #8b8cff) 30%, transparent);
    /* Mood lives here: one hue rotation and one saturation step over the SAME
       gradient, so it tints with whatever accent the app is currently on
       instead of fighting the theme with hardcoded colours. */
    filter: hue-rotate(var(--mood-hue, 0deg)) saturate(var(--mood-sat, 1));
    /* Overshooting curve = the recoil. The motor holds still for ~120ms after
       a click precisely so this can play out (see moveAndPress). */
    transition:
      transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 200ms ease,
      filter 600ms ease;
  }

  .core.pressed {
    transform: scale(0.72);
  }

  /* Leaning in. The moment before committing — bigger and brighter, because
     that is what "I'm about to press this" looks like from across a room. */
  .ghost.considering .core {
    transform: scale(1.22);
    box-shadow:
      0 0 26px color-mix(in srgb, var(--accent, #8b8cff) 80%, transparent),
      0 0 62px color-mix(in srgb, var(--accent, #8b8cff) 40%, transparent);
  }

  /* Create method previews press inside boxes as small as 40px. The size
     follows the preview box (its nearest size container), and the glow
     tightens so it lights the target without covering it. */
  .ghost.compact {
    --size: clamp(14px, 18cqmin, 28px);
  }

  .ghost.compact .core {
    box-shadow:
      0 0 8px color-mix(in srgb, var(--accent, #8b8cff) 65%, transparent),
      0 0 16px color-mix(in srgb, var(--accent, #8b8cff) 30%, transparent);
  }

  .ghost.compact.considering .core {
    box-shadow:
      0 0 12px color-mix(in srgb, var(--accent, #8b8cff) 80%, transparent),
      0 0 24px color-mix(in srgb, var(--accent, #8b8cff) 40%, transparent);
  }

  /* The wisp. Its left end is pinned to the dot's centre and the script turns
     it to face opposite the heading (tailDeg), so it streams back down the path
     just travelled. Brightest where it meets the dot and fading toward the tip,
     so it trails rather than leads. */
  .trail {
    position: absolute;
    left: 0;
    top: 0;
    height: calc(var(--size) * 0.42);
    margin-top: calc(var(--size) * -0.21);
    border-radius: 999px;
    transform-origin: 0 50%;
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--accent, #8b8cff) 70%, transparent),
      transparent
    );
    filter: hue-rotate(var(--mood-hue, 0deg)) blur(2px);
    pointer-events: none;
  }

  .core i {
    font-size: calc(var(--size) * 0.32);
    color: #fff;
    /* Optical centering: a play triangle reads centered a hair right of true. */
    margin-left: 2px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  /* Parked: breathe harder than at rest, so the corner dot reads as an
     invitation rather than as leftover decoration. */
  .ghost.parked .dot {
    animation-duration: 2.4s;
  }

  .ghost.parked:hover .dot {
    animation-play-state: paused;
  }

  .ghost.parked:hover .core {
    transform: scale(1.15);
  }

  @keyframes ghost-breathe {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.09);
    }
  }

  .resume-hit {
    position: absolute;
    left: -22px;
    top: -22px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .resume-hit:focus-visible {
    outline: 2px solid var(--accent, #8b8cff);
    outline-offset: 2px;
  }

  /* A 28px dot on a projection screen is a speck, and viewport width cannot
     tell a projector from a laptop — so this is a flag, not a media query
     (?present=stage). The 44px hit area is untouched: it is a touch-target
     floor, not a size. */
  .ghost.stage {
    --size: 60px;
  }

  .ghost.stage .core {
    box-shadow:
      0 0 34px color-mix(in srgb, var(--accent, #8b8cff) 70%, transparent),
      0 0 80px color-mix(in srgb, var(--accent, #8b8cff) 34%, transparent);
  }

  /* 4K at 100% is its own case: nothing is scaling for you, and the laptop
     ghost lands a full tier small even at arm's length (4k-native-layout.md). */
  @media (min-width: 2600px) {
    .ghost {
      --size: 44px;
    }
  }

  /* Motion IS the feature here, so there is no reduced-motion variant of the
     ghost — presentation mode does not mount at all under
     prefers-reduced-motion (presentation-mode.ts), and the composer attract
     sections do the same. Suppressing the animation while keeping the ghost
     would leave a mute dot teleporting around, which is worse for the people
     the setting protects than not running the demo. */
</style>
