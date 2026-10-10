<script lang="ts">
  import { format } from "date-fns";
  import type { Festival } from "../../domain/models/festival";
  import type { UserFestivalTracker } from "../../domain/models/festival-tracker";
  import { toDate } from "../../domain/models/timestamp-utils";
  import { getFestivalContext } from "../../context/festival-context";
  import TrackerControls from "./TrackerControls.svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";

  interface Props {
    open: boolean;
    festival: Festival | null;
    tracker: UserFestivalTracker | undefined;
    onclose: () => void;
  }
  let { open, festival, tracker, onclose }: Props = $props();

  const { state: festivalState } = getFestivalContext();

  let imageLoaded = $state(false);
  let imageError = $state(false);
  let showTracker = $state(false);

  const startDate = $derived(festival ? toDate(festival.dates.start) : new Date());
  const endDate = $derived(festival ? toDate(festival.dates.end) : new Date());

  const dateRange = $derived(
    `${format(startDate, "MMMM d")} – ${format(endDate, "MMMM d, yyyy")}`
  );

  const deadlineFormatted = $derived(
    festival?.applicationDeadline
      ? format(toDate(festival.applicationDeadline), "MMMM d, yyyy")
      : null
  );

  const locationParts = $derived(festival ? [
    festival.location.venue,
    festival.location.city,
    festival.location.state,
    festival.location.country,
  ].filter(Boolean) : []);

  const locationFull = $derived(locationParts.join(", "));

  const attendanceCount = $derived(
    festival ? (festivalState.attendanceCounts.get(festival.id) ?? 0) : 0
  );

  const nameHue = $derived(
    festival ? festival.name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360 : 0
  );

  const regionLabels: Record<string, string> = {
    "north-america": "N. America",
    "south-america": "S. America",
    europe: "Europe",
    asia: "Asia",
    oceania: "Oceania",
    africa: "Africa",
  };
</script>

{#if festival}
<BaseModal
  {open}
  onclose={() => onclose()}
  size="xl"
  animation="pop"
  labelledBy="festival-detail-title"
>
  {#snippet header()}
    <ModalHeader
      title={festival.name}
      subtitle={regionLabels[festival.region] ?? festival.region}
      icon="fa-calendar-star"
      iconColor="hsl({nameHue}, 60%, 45%)"
      onClose={() => onclose()}
      id="festival-detail-title"
    />
  {/snippet}

  <div class="detail-layout" class:expanded={showTracker}>
    <div class="main-col">
      <!-- Hero image -->
      <div
        class="hero"
        style="--fallback-bg: linear-gradient(135deg, hsl({nameHue}, 60%, 25%), hsl({nameHue}, 60%, 15%))"
      >
        {#if festival.imageUrl && !imageError}
          <img
            src={festival.imageUrl}
            alt={festival.name}
            class="hero-img"
            class:loaded={imageLoaded}
            onload={() => (imageLoaded = true)}
            onerror={() => (imageError = true)}
          />
        {/if}

        <div class="fallback-text" class:hidden={imageLoaded && !imageError}>
          <span>{festival.name}</span>
        </div>
      </div>

      <!-- Content -->
      <div class="detail-content" data-animate="3">
        <!-- Title bar -->
        <div class="title-bar">
          <h2 class="festival-title">{festival.name}</h2>
          <div class="title-actions">
            {#if festival.estimatedSize}
              <span class="size-badge">{festival.estimatedSize}</span>
            {/if}
            {#if attendanceCount > 0}
              <span class="attendance-badge">
                <i class="fas fa-user-check" aria-hidden="true"></i>
                {attendanceCount}
              </span>
            {/if}
            <button
              class="app-toggle"
              class:active={showTracker}
              onclick={() => (showTracker = !showTracker)}
              aria-expanded={showTracker}
            >
              <i class="fas fa-clipboard-list" aria-hidden="true"></i>
              My Application
            </button>
          </div>
        </div>

        <!-- Info row -->
        <div class="info-row">
          <span class="info-chip">
            <i class="fas fa-building" aria-hidden="true"></i>
            {festival.organization}
          </span>
          <span class="info-chip">
            <i class="fas fa-calendar-alt" aria-hidden="true"></i>
            {dateRange}
          </span>
          <span class="info-chip">
            <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
            {locationFull}
          </span>
          {#if deadlineFormatted}
            <span class="info-chip deadline">
              <i class="fas fa-clock" aria-hidden="true"></i>
              Deadline: {deadlineFormatted}
            </span>
          {/if}
        </div>

        <!-- Description -->
        {#if festival.description}
          <p class="description">{festival.description}</p>
        {/if}

        <!-- Tags + actions -->
        <div class="bottom-row">
          {#if festival.tags.length > 0}
            <div class="tags">
              {#each festival.tags as tag}
                <span class="tag">{tag}</span>
              {/each}
            </div>
          {/if}

          <div class="actions">
            {#if festival.applicationUrl}
              <a href={festival.applicationUrl} target="_blank" rel="noopener noreferrer" class="apply-btn">
                <i class="fas fa-external-link-alt" aria-hidden="true"></i> Apply
              </a>
            {/if}
            {#if festival.websiteUrl}
              <a href={festival.websiteUrl} target="_blank" rel="noopener noreferrer" class="link-btn">
                <i class="fas fa-globe" aria-hidden="true"></i> Website
              </a>
            {/if}
            {#if festival.applicationContact}
              <a href="mailto:{festival.applicationContact}" class="link-btn">
                <i class="fas fa-envelope" aria-hidden="true"></i> Contact
              </a>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <!-- Application tracker - side panel that widens the modal -->
    {#if showTracker}
      <div class="tracker-side" data-animate="4">
        <h3 class="tracker-heading">My Application</h3>
        <TrackerControls {festival} {tracker} />
      </div>
    {/if}
  </div>
</BaseModal>
{/if}

<style>
  /* ── Detail layout (two-column: main + tracker) ───── */

  .detail-layout {
    display: flex;
    flex-direction: row;
    width: 100%;
    min-height: 0;
  }


  .hero {
    position: relative;
    width: 100%;
    aspect-ratio: 21 / 9;
    overflow: hidden;
    background: var(--fallback-bg);
    flex-shrink: 0;
  }

  .hero-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .hero-img.loaded {
    opacity: 1;
  }

  .fallback-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    text-align: center;
    font-size: 1.75rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.8);
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }

  .fallback-text.hidden {
    opacity: 0;
    pointer-events: none;
  }


  .main-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem 1.5rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.15)) transparent;
  }

  .detail-content::-webkit-scrollbar { width: 6px; }
  .detail-content::-webkit-scrollbar-track { background: transparent; }
  .detail-content::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(255, 255, 255, 0.15));
    border-radius: 3px;
  }


  .title-bar {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }

  .festival-title {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--theme-text, #ffffff);
    flex: 1;
    min-width: 200px;
    line-height: 1.2;
  }

  .title-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .size-badge {
    padding: 4px 10px;
    border-radius: 8px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    text-transform: capitalize;
    background: rgba(255, 255, 255, 0.06);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .attendance-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    background: rgba(34, 197, 94, 0.1);
    color: var(--semantic-success, #22c55e);
    border: 1px solid rgba(34, 197, 94, 0.2);
  }

  .attendance-badge i { font-size: 11px; }

  .app-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 8px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    background: transparent;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .app-toggle:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    color: var(--theme-text, #ffffff);
  }

  .app-toggle.active {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 15%, transparent);
    border-color: var(--theme-accent, #6366f1);
    color: var(--theme-accent, #6366f1);
  }


  .info-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .info-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text, #ffffff);
  }

  .info-chip i {
    font-size: 12px;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.45));
    flex-shrink: 0;
  }

  .info-chip.deadline {
    background: color-mix(in srgb, var(--semantic-warning, #eab308) 8%, transparent);
    border-color: color-mix(in srgb, var(--semantic-warning, #eab308) 20%, transparent);
    color: var(--semantic-warning, #eab308);
  }

  .info-chip.deadline i { color: var(--semantic-warning, #eab308); }


  .description {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.75));
    line-height: 1.6;
  }


  .bottom-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .tag {
    padding: 3px 10px;
    border-radius: 12px;
    font-size: var(--font-size-xs, 11px);
    background: rgba(255, 255, 255, 0.06);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .apply-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--theme-accent, #6366f1);
    border: none;
    border-radius: 8px;
    color: #fff;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .apply-btn:hover { opacity: 0.88; }

  .link-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: transparent;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .link-btn:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
  }


  .tracker-side {
    width: 340px;
    flex-shrink: 0;
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    overflow-y: auto;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.15)) transparent;
  }

  .tracker-heading {
    margin: 0 0 1rem;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
  }


  @media (max-width: 600px) {
    .hero { aspect-ratio: 16 / 9; }

    .fallback-text { font-size: 1.25rem; }

    .detail-content { padding: 1rem; }

    .bottom-row { flex-direction: column; }
  }


  @media (prefers-reduced-motion: reduce) {
    .hero-img,
    .apply-btn,
    .link-btn,
    .app-toggle,
    .detail-layout {
      transition: none;
    }
  }
</style>
