<!--
  CommunityMapBand

  The community map's front door, living inside the Creators roster as one more
  band. Everything above it in the tree is a host: this component owns the
  composition — heading, map stage, invitation slot, privacy line — and the
  height the stage occupies.

  It sizes the stage itself rather than using `GlobalUserMap`'s `size="embedded"`
  variant. That variant is a hard 260px and has three other hosts
  (`Community.svelte`, `ActiveUsersPanel`, `ScanActivityTab`); converting it
  would silently change the height of three surfaces this feature has no
  business touching. `size="full"` fills whatever box it is given, and the box
  is sized in `em` so it rides CreatorsPanel's own font ramp instead of freezing
  at 1080p proportions.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import GlobalUserMap from "./GlobalUserMap.svelte";
  import CommunityInvitationSlot from "./CommunityInvitationSlot.svelte";
  import { getCommunityMapContext } from "../context/community-map-context";

  interface Props {
    /**
     * Short-landscape recomposition (Z Fold folded, phone landscape). The map
     * and the slot go side by side and the stage shrinks, because at ~412px
     * tall a stacked band would leave no roster below it. Hiding the map would
     * remove the only front door the feature has.
     */
    compact?: boolean;
  }

  let { compact = false }: Props = $props();

  // Not named `state`: a variable of that name in scope turns every
  // `$state(...)` in this module into a store subscription.
  const { state: mapState, getApiKey } = getCommunityMapContext();

  const apiKey = $derived(getApiKey());
  const configured = $derived(
    Boolean(apiKey) && apiKey !== "your-google-maps-api-key",
  );
  const locations = $derived(mapState.locations);
  const status = $derived(mapState.locationsStatus);

  // The read is deliberately tied to the band mounting rather than to the
  // panel: the band is behind LazyMount and an IntersectionObserver, so a
  // visitor who never scrolls to it never pays for the query.
  onMount(() => {
    if (configured) void mapState.loadLocations();
  });
</script>

<section class="map-band" class:compact aria-labelledby="community-map-band">
  <header class="band-header">
    <h3 class="band-name" id="community-map-band">On the map</h3>
    <span class="rule" aria-hidden="true"></span>
    {#if status === "loaded"}
      <span class="count">{locations.length}</span>
    {/if}
  </header>

  <div class="band-body">
    <div class="stage">
      {#if !configured}
        <p class="stage-note">Map unavailable in this environment.</p>
      {:else if status === "failed"}
        <div class="stage-note" role="alert">
          <p>Couldn't load the map.</p>
          <button type="button" onclick={() => void mapState.loadLocations()}>
            Try again
          </button>
        </div>
      {:else}
        <!-- Framed to the pins rather than to a fixed world view: with one
             marker the default centres on the Atlantic and puts it off-screen. -->
        <GlobalUserMap
          {locations}
          userLocation={null}
          {apiKey}
          size="full"
          frame="markers"
          controls="minimal"
          keepMapAs="creators-map-band"
        />
      {/if}
    </div>

    <div class="slot-area">
      <CommunityInvitationSlot />
      <!-- The accurate distinction is city-center coordinates versus device
           coordinates, not city versus coordinates: a lat/lng IS stored. This
           sentence has to survive someone opening the Firestore document. -->
      <p class="privacy">
        We store your city and its map point, never your device location.
      </p>
    </div>
  </div>
</section>

<style>
  .map-band {
    display: flex;
    flex-direction: column;
    gap: 0.75em;
    /* `.scroller` has no gap of its own; siblings own their spacing, the way
       `.wall-slot` does. */
    margin-bottom: 2.25em;
  }

  /* Matches RosterBand's header exactly: this reads as one more band in the
     roster, not as a widget bolted on above it. */
  .band-header {
    display: flex;
    align-items: center;
    gap: 0.75em;
    /* Explicit rather than derived from the label's line box, so the host's
       LazyMount placeholder can mirror it with a number instead of a guess. */
    min-height: 1.25em;
  }

  .band-name {
    margin: 0;
    font-size: 0.8125em;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    white-space: nowrap;
  }

  .rule {
    flex: 1;
    height: 1px;
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.12));
  }

  .count {
    font-size: 0.8125em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    font-variant-numeric: tabular-nums;
  }

  .band-body {
    display: grid;
    gap: 1em;
  }

  .stage {
    position: relative;
    /*
     * The host owns this number and the matching placeholder reserve, because
     * the two must agree or the chunk landing shifts the whole roster. It is
     * measured from the panel's height rather than tiered, and expressed in
     * `em` so it rides the panel's font ramp. The fallback is what this band
     * would want on a host that does not set it.
     */
    height: var(--map-band-stage-h, 15em);
    border-radius: 0.75em;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .stage-note {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6em;
    height: 100%;
    margin: 0;
    padding: 1em;
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .stage-note p {
    margin: 0;
  }

  .stage-note button {
    min-height: var(--min-touch-target);
    padding: 0.5em 1em;
    border-radius: 0.5em;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
  }

  .slot-area {
    display: flex;
    flex-direction: column;
    gap: 0.35em;
    /* Same source as the placeholder's reserve. The children already sum to
       this; declaring it states the contract in the place a future edit will
       be looking. */
    min-height: var(
      --map-band-slot-h,
      calc(var(--min-touch-target) * 2 + 5.65em)
    );
  }

  .privacy {
    margin: 0;
    /* Two lines' worth, reserved. The sentence is one line on a laptop and two
       on a phone; letting it grow into the roster on the narrow case is the
       shift this whole band is measured to avoid. */
    min-height: 2.2em;
    font-size: var(--font-size-compact);
    line-height: 1.35;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  /*
   * Wide: the map and the invitation sit side by side, spanning the band.
   *
   * The pair was capped at first, on the theory that a band-height map only
   * reads as a map near 2:1. Both compositions were rendered at 1920 and 3840
   * and the theory was wrong. Capped, the map stops around 40% of the band and
   * the invitation floats in a pocket with 1639px of nothing beside it at 4K,
   * while every roster row underneath runs the full width — the band stops
   * looking like part of the page. Spanning, the map is a 3.6:1 continent
   * strip at 1920 and a 5.8:1 world strip at 3840, which is what a world strip
   * looks like, and its edges line up with the cards below it.
   *
   * 900 rather than a tablet-ish 640: the slot needs ~17em whatever the
   * container does, so at 820 a two-column body left the map 330px wide beside
   * a 352px stage — a portrait map. The seam is set where a landscape map
   * still fits next to the slot, not where a tablet begins.
   */
  @container creators (min-width: 900px) {
    .band-body {
      grid-template-columns: minmax(0, 1fr) minmax(17em, 24em);
      align-items: center;
    }
  }

  .map-band.compact {
    margin-bottom: 1.25em;
  }

  /* Last, so it wins over the wide rule above: at 412px tall the slot has to
     give the map back some width, which the wide rule's 17em floor will not. */
  .map-band.compact .band-body {
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    align-items: center;
  }
</style>
