<!--
  UnderConstruction — the shared "this page isn't ready yet" note for any public
  surface we've taken down while it gets rebuilt.

  Reach for this instead of a 404 whenever the URL is one we intend to keep: a
  404 tells a visitor they were wrong, this tells them we're not finished. Also
  the component to use when a front-page tile points at something still being
  built — the tile stays, the destination explains itself.

  Renders over the page's own cosmic background (transparent), in the same
  editorial voice as every other public page: Fraunces wonky-italic title,
  OKLCH palette, and rem sizing so browser zoom remains coherent.
-->
<script lang="ts">
  interface Destination {
    label: string;
    href: string;
    icon?: string;
    /** Full-page navigation (leaves the marketing shell for the app). */
    reload?: boolean;
  }

  let {
    /** What is under construction, e.g. "Flow Arts Notation". */
    title,
    /** Small uppercase label above the title. */
    eyebrow = "Under construction",
    /** FontAwesome class for the eyebrow glyph. */
    icon = "fa-hammer",
    /** One or two sentences on what's happening and what to expect. */
    note,
    /** Where to send someone instead. Rendered as buttons, first is primary. */
    destinations = [],
  }: {
    title: string;
    eyebrow?: string;
    icon?: string;
    note: string;
    destinations?: Destination[];
  } = $props();
</script>

<section class="under-construction">
  <div class="inner">
    <span class="eyebrow">
      <i class="fas {icon}" aria-hidden="true"></i>
      {eyebrow}
    </span>

    <h1>{title}</h1>
    <p class="note">{note}</p>

    {#if destinations.length}
      <nav class="destinations" aria-label="Where to go instead">
        {#each destinations as destination, index (destination.href)}
          <a
            href={destination.href}
            class="destination"
            class:primary={index === 0}
            data-sveltekit-reload={destination.reload ? "" : undefined}
          >
            {#if destination.icon}
              <i class="fas {destination.icon}" aria-hidden="true"></i>
            {/if}
            <span>{destination.label}</span>
          </a>
        {/each}
      </nav>
    {/if}
  </div>
</section>

<style>
  .under-construction {
    display: grid;
    place-items: center;
    /* Fills the viewport under the fixed SiteHeader so the note sits in the
       optical center of the screen at any height, with the footer below the
       fold rather than a pool of dead space above it. */
    min-height: calc(100svh - 4rem);
    padding: 7rem 1.5rem 4rem;
    /* Transparent — the route's own BackgroundHost shows through. */
    background: transparent;
    font-family: "Inter", system-ui, sans-serif;
  }

  .inner {
    /* rem, not px: 64rem is 1024px at the 16px root and 1536px at the 24px root
       the 3840 ramp reaches, so this never reads as a postage stamp on 4K.
       (.claude/rules/4k-native-layout.md) */
    width: min(64rem, 100%);
    text-align: center;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    margin-bottom: 1.1rem;
    padding: 0.4rem 0.95rem;
    font-size: clamp(0.75rem, 0.7rem + 0.12vw, 0.85rem);
    font-weight: 640;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: oklch(0.82 0.11 75);
    background: oklch(0.7 0.13 75 / 0.1);
    border: 1px solid oklch(0.7 0.13 75 / 0.28);
    border-radius: 999px;
  }

  h1 {
    /* Same page-title voice as .page-title in public-editorial.css. */
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-style: italic;
    font-weight: 700;
    font-variation-settings:
      "opsz" 144,
      "wght" 700,
      "SOFT" 0,
      "WONK" 1;
    font-size: clamp(2.4rem, 1.8rem + 2.2vw, 3.8rem);
    line-height: 1.05;
    letter-spacing: -0.015em;
    color: oklch(0.96 0.01 270);
    margin: 0 0 0.9rem;
  }

  .note {
    font-size: clamp(1.05rem, 1rem + 0.3vw, 1.3rem);
    line-height: 1.65;
    color: oklch(0.7 0.01 270);
    margin: 0 auto 2.2rem;
  }

  /* Anything meant to be clicked is a button, never a bare text link
     (.claude/rules/clickables-look-like-buttons.md). */
  .destinations {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.75rem;
    /* Keep the destinations together on a laptop and up instead of
       stranding one or two on a second line. */
    width: min(64rem, 100%);
    margin-inline: auto;
  }

  .destination {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0 1.3rem;
    font-size: clamp(0.95rem, 0.9rem + 0.15vw, 1.05rem);
    font-weight: 620;
    color: oklch(0.9 0.02 270);
    text-decoration: none;
    background: oklch(0.3 0.04 270 / 0.35);
    border: 1px solid oklch(0.5 0.05 270 / 0.28);
    border-radius: 12px;
    transition:
      color 160ms ease,
      background 160ms ease,
      border-color 160ms ease;
  }
  /* Phones: one per line anyway, so stack them at a shared width instead of
     letting each size to its own label and read as a staircase. */
  @media (max-width: 30rem) {
    .destinations {
      flex-direction: column;
      align-items: stretch;
    }
    .destination {
      justify-content: center;
    }
  }

  .destination:hover {
    color: oklch(0.98 0.01 270);
    background: oklch(0.36 0.06 270 / 0.5);
    border-color: oklch(0.6 0.08 270 / 0.5);
  }

  .destination.primary {
    color: oklch(0.98 0.01 275);
    background: oklch(0.52 0.16 275 / 0.55);
    border-color: oklch(0.66 0.16 275 / 0.6);
  }
  .destination.primary:hover {
    background: oklch(0.58 0.18 275 / 0.7);
    border-color: oklch(0.74 0.16 275 / 0.75);
  }

  @media (prefers-reduced-motion: reduce) {
    .destination {
      transition: none;
    }
  }
</style>
