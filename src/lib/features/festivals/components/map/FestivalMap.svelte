<!--
  FestivalMap.svelte

  Google Maps display with clustered festival location markers.
  Orange pins, MarkerClusterer grouping, popup on click.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { PUBLIC_GOOGLE_MAPS_API_KEY } from "$lib/shared/maps/google-maps-api-key";
  import { MarkerClusterer } from "@googlemaps/markerclusterer";
  import { getFestivalContext } from "../../context/festival-context";
  import FestivalMapPopup from "./FestivalMapPopup.svelte";
  import type { Festival } from "../../domain/models/festival";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import { getGoogleMapsLibraryLoader } from "$lib/shared/maps/getGoogleMapsLibraryLoader";

  const { state: festivalState } = getFestivalContext();

  // Single source of truth for the festival pin color. Mirrors the
  // --festival-pin-color CSS token; Google Maps PinElement needs a literal.
  const PIN_COLOR = "#f97316";

  let mapContainer: HTMLDivElement;
  let map: google.maps.Map | null = null;
  let markers: google.maps.marker.AdvancedMarkerElement[] = [];
  let clusterer: MarkerClusterer | null = null;
  let selectedFestival: Festival | null = $state(null);
  let markerTimer: ReturnType<typeof setTimeout> | null = null;
  let failureReported = false;
  const mapsLoader = getGoogleMapsLibraryLoader();

  onMount(() => {
    let mounted = true;

    async function loadMap(): Promise<void> {
      try {
        await mapsLoader.load(PUBLIC_GOOGLE_MAPS_API_KEY ?? "");
        if (!mounted) return;
        initializeMap();
      } catch (caught) {
        if (mounted) showMapFailure(caught);
      }
    }

    void loadMap();

    return () => {
      mounted = false;
      if (markerTimer) clearTimeout(markerTimer);
      for (const marker of markers) marker.map = null;
      clusterer?.clearMarkers();
      markers = [];
      clusterer = null;
      map = null;
    };
  });

  function showMapFailure(caught: unknown): void {
    if (failureReported) return;
    failureReported = true;
    const failure =
      caught instanceof Error ? caught : new Error(String(caught));
    getErrorHandler().showUserError({
      message: "Festival map could not load.",
      technicalDetails: failure.message,
      error: failure,
      severity: "error",
      context: {
        module: "festivals",
        tab: "map",
        action: "loadGoogleMap",
      },
    });
  }

  function initializeMap(): void {
    const { Map } = google.maps;

    map = new Map(mapContainer, {
      center: { lat: 20, lng: 0 },
      zoom: 3,
      minZoom: 3,
      mapId: "tka-festival-map",
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });

    // Give festivals a moment to load, then pin them
    markerTimer = setTimeout(() => {
      refreshMarkers();
    }, 100);
  }

  function createMarkers(): void {
    if (!map) return;

    // Clear existing markers and clusterer
    markers.forEach((m) => {
      m.map = null;
    });
    markers.length = 0;

    if (clusterer) {
      clusterer.clearMarkers();
    }

    if (festivalState.festivals.length === 0) return;

    const { AdvancedMarkerElement, PinElement } = google.maps.marker;

    for (const festival of festivalState.festivals) {
      const { lat, lng } = festival.location.coordinates;

      const pin = new PinElement({
        background: PIN_COLOR,
        borderColor: "#ffffff",
        glyphColor: "#ffffff",
      });

      const marker = new AdvancedMarkerElement({
        map,
        position: { lat, lng },
        content: pin,
        title: `${festival.name} - ${festival.location.city}, ${festival.location.country}`,
      });

      marker.addListener("click", () => {
        selectedFestival = festival;
        map?.panTo({ lat, lng });
      });

      markers.push(marker);
    }

    // Hand all markers to the clusterer so nearby pins collapse into groups
    if (clusterer) {
      clusterer.clearMarkers();
    }
    clusterer = new MarkerClusterer({ map, markers });
  }

  function refreshMarkers(): void {
    try {
      createMarkers();
    } catch (caught) {
      showMapFailure(caught);
    }
  }

  function handleViewDetails() {
    if (selectedFestival) {
      festivalState.selectedFestival = selectedFestival;
    }
    selectedFestival = null;
  }

  function closePopup() {
    selectedFestival = null;
  }

  // Rebuild markers whenever the festivals list changes
  $effect(() => {
    // Explicitly reference festivals so Svelte tracks this dependency
    const _festivals = festivalState.festivals;
    if (map) {
      refreshMarkers();
    }
  });
</script>

<div class="map-wrapper">
  <div bind:this={mapContainer} class="map-container"></div>

  {#if selectedFestival}
    <button
      class="popup-overlay"
      onclick={closePopup}
      aria-label="Close festival popup"
      type="button"
    ></button>
    <div class="popup-wrapper">
      <FestivalMapPopup
        festival={selectedFestival}
        onviewdetails={handleViewDetails}
        onclose={closePopup}
      />
    </div>
  {/if}

  {#if festivalState.festivals.length === 0 && !festivalState.isLoading}
    <div class="empty-state">
      <i class="fas fa-globe" aria-hidden="true"></i>
      <p>No festivals to show</p>
      <p class="subtext">Try adjusting your filters</p>
    </div>
  {/if}
</div>

<style>
  .map-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .map-container {
    width: 100%;
    height: 100%;
  }

  .popup-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 10;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .popup-overlay:hover {
    background: rgba(0, 0, 0, 0.4);
  }

  .popup-overlay:focus-visible {
    outline: 2px solid var(--festival-pin-color, #f97316);
    outline-offset: -2px;
  }

  .popup-wrapper {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 11;
    animation: popupAppear 0.2s ease;
  }

  @keyframes popupAppear {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .popup-wrapper {
      animation: none;
    }
  }

  .empty-state {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    pointer-events: none;
    z-index: 5;
  }

  .empty-state i {
    font-size: 64px;
    color: var(--festival-pin-color, #f97316);
    opacity: 0.3;
    margin-bottom: 16px;
  }

  .empty-state p {
    font-size: var(--font-size-sm, 16px);
    margin: 8px 0;
  }

  .empty-state .subtext {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.7;
  }
</style>
