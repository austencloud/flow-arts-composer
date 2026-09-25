<!--
  Community.svelte

  The full-page community map: where TKA practitioners are, worldwide. Its old
  consent sheet requested precise device coordinates after a delayed prompt.
  The opt-in now goes through `CommunityInvitationSlot`, the same one the
  Creators band uses: a city named by the Cloudflare edge, correctable by
  search, written with city-center coordinates and no device-location prompt.
  Flow Fest field mode may use the first-party geolocation permission elsewhere;
  this community surface intentionally never asks for it.
  This host owns the page composition; the slot owns the opt-in, and the state
  factory owns the write.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import GlobalUserMap from "./components/GlobalUserMap.svelte";
  import CommunityInvitationSlot from "./components/CommunityInvitationSlot.svelte";
  import { setCommunityMapContext } from "./context/community-map-context";
  import { createCommunityMapState } from "./state/community-map-state.svelte";
  import { createFirestoreCommunityMapPort } from "./services/community-map-port";
  import { createEdgeCitySuggestion } from "./services/edge-city-suggestion";
  import { getGeocodingService } from "./get-geocoding-service";
  import { PUBLIC_GOOGLE_MAPS_API_KEY } from "$lib/shared/maps/google-maps-api-key";

  // Not named `state`: a variable of that name in scope turns every
  // `$state(...)` in this module into a store subscription.
  const mapState = createCommunityMapState({
    port: createFirestoreCommunityMapPort(),
    getSuggestion: () => edgeCitySuggestion,
  });

  setCommunityMapContext({
    state: mapState,
    getApiKey: () => PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  });

  // The edge names a city on every request, for free, with no permission
  // prompt. `getGeocodingService()` is browser-only by contract, so this stays
  // null through SSR and resolves on hydration.
  const edgeCitySuggestion = $derived(
    browser
      ? createEdgeCitySuggestion(page.data.geo, getGeocodingService())
      : null
  );

  const locations = $derived(mapState.locations);
  const status = $derived(mapState.locationsStatus);
  const configured = $derived(
    Boolean(PUBLIC_GOOGLE_MAPS_API_KEY) &&
      PUBLIC_GOOGLE_MAPS_API_KEY !== "your-google-maps-api-key"
  );

  $effect(() => {
    if (!authState.initialized) {
      mapState.setIdentity({ status: "pending" });
      return;
    }
    const uid = authState.user?.uid;
    mapState.setIdentity(
      authState.isFullAccount && uid
        ? { status: "user", uid }
        : { status: "guest" }
    );
  });

  onMount(() => {
    if (configured) void mapState.loadLocations();
  });
</script>

<div class="community-container">
  <div class="header">
    <div class="header-content">
      <h1>
        <i class="fas fa-globe" aria-hidden="true"></i>
        {t("community_title")}
      </h1>
      <p class="subtitle">
        {locations.length === 1
          ? t("community_practitioners_count_one")
          : t("community_practitioners_count_other", {
              count: locations.length,
            })}
      </p>
    </div>

    <div class="location-controls">
      <CommunityInvitationSlot />
      <!-- The accurate distinction is city-center coordinates versus device
           coordinates, not city versus coordinates: a lat/lng IS stored. This
           sentence has to survive someone opening the Firestore document. -->
      <p class="privacy">
        We store your city and its map point, never your device location.
      </p>
    </div>
  </div>

  <div class="map-section">
    {#if !configured}
      <div class="api-key-warning">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <h2>{t("community_api_key_required")}</h2>
        <p>
          Add <code>env.PUBLIC_GOOGLE_MAPS_API_KEY</code> to your
          <code>.env</code> file to enable the community map.
        </p>
        <p class="subtext">
          Get your API key from the
          <a
            href="https://console.cloud.google.com/google/maps-apis"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Cloud Console
          </a>
        </p>
      </div>
    {:else if status === "loading" || status === "idle"}
      <div class="loading-state">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <p>{t("community_loading_map")}</p>
      </div>
    {:else if status === "failed"}
      <div class="error-state" role="alert">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <h2>{t("community_error_map_title")}</h2>
        <p>{t("community_error_map_body")}</p>
        <button
          class="control-btn share-btn"
          onclick={() => void mapState.loadLocations()}
        >
          <i class="fas fa-rotate-right" aria-hidden="true"></i>
          {t("community_error_retry")}
        </button>
      </div>
    {:else}
      <!-- Framed to the pins rather than to a fixed world view: with one
           marker the default centres on the Atlantic and puts it off-screen. -->
      <GlobalUserMap
        {locations}
        userLocation={null}
        apiKey={PUBLIC_GOOGLE_MAPS_API_KEY}
        frame="markers"
      />
    {/if}
  </div>
</div>

<style>
  .community-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .header {
    padding: 20px 24px;
    border-bottom: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .header-content h1 {
    font-size: var(--font-size-xl, 24px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    margin: 0 0 4px 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-content h1 i {
    color: var(--theme-accent, #4a9eff);
  }

  .subtitle {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    margin: 0;
  }

  /* The slot and the privacy line stack. The slot owns its own two rows and
     their reserved heights, so this adds no geometry of its own; the floor
     keeps the header from squeezing the slot's action row onto two lines. */
  .location-controls {
    display: flex;
    flex-direction: column;
    gap: 0.35em;
    min-width: min(17em, 100%);
  }

  .privacy {
    margin: 0;
    /* Two lines' worth, reserved. The sentence is one line on a laptop and two
       on a phone; letting it grow would move the map edge under it. */
    min-height: 2.2em;
    font-size: var(--font-size-compact);
    line-height: 1.35;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .control-btn {
    min-height: var(--min-touch-target);
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    border-radius: 10px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .control-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #4a9eff);
    outline-offset: 2px;
  }

  .share-btn {
    background: var(--theme-accent, #4a9eff);
    color: var(--text-on-accent, #000);
  }

  .share-btn:hover {
    opacity: 0.9;
  }

  .map-section {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .api-key-warning,
  .loading-state,
  .error-state {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    max-width: 500px;
    padding: 32px;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .error-state i {
    font-size: 48px;
    color: var(--semantic-error, #ef4444);
    margin-bottom: 4px;
  }

  .error-state h2 {
    font-size: var(--font-size-lg, 20px);
    color: var(--theme-text, #ffffff);
    margin: 0;
  }

  .error-state p {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    line-height: 1.5;
    margin: 0 0 8px 0;
  }

  .api-key-warning i {
    font-size: 64px;
    color: var(--semantic-warning, #f59e0b);
    margin-bottom: 16px;
  }

  .api-key-warning h2 {
    font-size: var(--font-size-lg, 20px);
    color: var(--theme-text, #ffffff);
    margin: 0 0 12px 0;
  }

  .api-key-warning p {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    line-height: 1.5;
    margin: 8px 0;
  }

  .api-key-warning code {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: var(--font-size-compact, 12px);
  }

  .api-key-warning .subtext {
    font-size: var(--font-size-compact, 12px);
    margin-top: 12px;
  }

  .api-key-warning a {
    color: var(--theme-accent, #4a9eff);
    text-decoration: none;
  }

  .api-key-warning a:hover {
    text-decoration: underline;
  }

  .loading-state i {
    font-size: 48px;
    color: var(--theme-accent, #4a9eff);
    margin-bottom: 16px;
  }

  .loading-state p {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
  }

  @media (max-width: 768px) {
    .header {
      flex-direction: column;
      align-items: flex-start;
    }

    .location-controls {
      width: 100%;
    }

    .control-btn {
      width: 100%;
      justify-content: center;
    }
  }

  /*
   * Short landscape (Z Fold 7 folded is 960x412). Stacked, the slot and the
   * privacy line make a 202px header — half the viewport — and the map, which
   * is the only thing on this page, was left 210px. Side by side the pair is as
   * tall as the slot alone and the header drops to ~149px, without touching the
   * slot's own reserved rows: those are the no-layout-shift contract it keeps
   * with the Creators band, and they are not this page's to shorten.
   *
   * The thresholds are CreatorsPanel's `isShortLandscape` (height <= 600, aspect
   * > 1.7) written as CSS, so both surfaces agree on what short landscape means.
   * `min-width: 769px` keeps this clear of the phone rule above, which stacks
   * the whole header instead.
   */
  @media (min-width: 769px) and (max-height: 600px) and (min-aspect-ratio: 17 / 10) {
    .header {
      padding: 10px 24px;
    }

    .location-controls {
      flex-direction: row;
      align-items: center;
      gap: 0.75em;
    }

    .privacy {
      /* Shrinks before the header runs out of room, and drops its reserved
         height: in a row the slot sets the height, so a wrapping sentence can
         no longer move the map edge. */
      flex: 0 1 14em;
      min-width: 0;
      min-height: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .control-btn {
      transition: none;
    }
  }
</style>
