<!--
  HallOfShameGallery.svelte

  Main gallery component for the Hall of Shame.
  Shows approved adult content with filtering, sorting, and pagination.
  Requires age verification before displaying content.
-->
<script lang="ts">

import { getAgeVerifier } from "#lib/features/hall-of-shame/get-age-verifier.js";
import { getHallOfShameLoader } from "#lib/features/hall-of-shame/get-hall-of-shame-loader.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import type { HallOfShameLoader } from "../services/hall-of-shame-loader";
  import type { AgeVerifier } from "../services/age-verifier";
  import type {
    HallOfShameEntry,
    ShameCategory,
    ShameSortOption,
    PaginatedShameResult,
  } from "../domain/models/hall-of-shame-models";
  import HallOfShameGate from "./HallOfShameGate.svelte";
  import ShameSequenceCard from "./ShameSequenceCard.svelte";
  import PanelGrid from "#lib/shared/components/panel/PanelGrid.svelte";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  // State
  let isVerified = $state(false);
  let isCheckingVerification = $state(true);
  let showGate = $state(false);
  // True when the age verifier was unavailable or errored — we fail closed and
  // tell the user we couldn't confirm their age.
  let verificationError = $state(false);

  // Gallery state
  let entries = $state<HallOfShameEntry[]>([]);
  let featuredEntries = $state<HallOfShameEntry[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let hasMore = $state(false);
  let isLoadingMore = $state(false);
  let lastDoc = $state<unknown>(null);

  let selectedCategory = $state<ShameCategory | "all">("all");
  let sortOption = $state<ShameSortOption>("newest");

  const currentUser = $derived(authState.user);
  const authInitialized = $derived(authState.initialized);

  // Services
  let hallOfShameLoader: HallOfShameLoader | null = null;
  let ageVerifier: AgeVerifier | null = null;

  try {
    hallOfShameLoader = getHallOfShameLoader();
    ageVerifier = getAgeVerifier();
  } catch (error) {
    console.warn("Failed to resolve Hall of Shame services:", error);
  }

  const categories = $derived<{ value: ShameCategory | "all"; label: string }[]>([
    { value: "all", label: t('hall_of_shame_cat_all') },
    { value: "profanity", label: t('hall_of_shame_cat_profanity') },
    { value: "sexual", label: t('hall_of_shame_cat_crude') },
    { value: "creative", label: t('hall_of_shame_cat_creative') },
  ]);

  const sortOptions = $derived<{ value: ShameSortOption; label: string }[]>([
    { value: "newest", label: t('hall_of_shame_sort_newest') },
    { value: "mostVoted", label: t('hall_of_shame_sort_most_votes') },
    { value: "mostViewed", label: t('hall_of_shame_sort_most_views') },
  ]);

  // Check verification when auth becomes initialized
  $effect(() => {
    // Read reactive values to subscribe to them
    const initialized = authInitialized;
    const user = currentUser;
    const checking = isCheckingVerification;

    // Only proceed if auth is initialized and we're still in checking state
    if (initialized && checking) {
      if (user) {
        // Call checkVerification - it will set isCheckingVerification = false when done
        checkVerification();
      } else {
        // Auth is initialized but no user
        isCheckingVerification = false;
      }
    }
  });

  async function checkVerification() {
    if (!currentUser) {
      isCheckingVerification = false;
      return;
    }

    // Fail CLOSED: if the age verifier is unavailable, deny access rather than
    // silently granting it. The 18+ gate must never open on service failure.
    if (!ageVerifier) {
      console.warn("[HallOfShameGallery] Age verifier service not available, denying access");
      isVerified = false;
      verificationError = true;
      isCheckingVerification = false;
      return;
    }

    try {
      // Setting isVerified=true triggers the guarded filter $effect, which owns
      // the initial gallery load. Don't call loadGallery() here too — that's the
      // double-load this guard exists to prevent.
      isVerified = await ageVerifier.isVerified(currentUser.uid);
    } catch (e) {
      console.error("[HallOfShameGallery] Verification check failed:", e);
      // Fail CLOSED on error too — deny access and surface the failure.
      isVerified = false;
      verificationError = true;
    } finally {
      isCheckingVerification = false;
    }
  }

  async function loadGallery() {
    if (!hallOfShameLoader) {
      error = "Gallery service unavailable";
      isLoading = false;
      return;
    }

    isLoading = true;
    error = null;

    try {
      const featured = await hallOfShameLoader.loadFeatured(5);
      featuredEntries = featured;

      // Load main gallery
      const result = await hallOfShameLoader.loadApproved({
        category: selectedCategory === "all" ? undefined : selectedCategory,
        sortBy: sortOption,
        limit: 20,
      });

      entries = result.items;
      hasMore = result.hasMore;
      lastDoc = result.nextCursor;
    } catch (e) {
      console.error("[HallOfShameGallery] Failed to load gallery:", e);
      error = "Failed to load gallery. Please try again.";
    } finally {
      isLoading = false;
    }
  }

  async function loadMore() {
    if (!hallOfShameLoader || !hasMore || isLoadingMore) return;

    isLoadingMore = true;

    try {
      const result = await hallOfShameLoader.loadApproved({
        category: selectedCategory === "all" ? undefined : selectedCategory,
        sortBy: sortOption,
        limit: 20,
        cursor: lastDoc as string | undefined,
      });

      entries = [...entries, ...result.items];
      hasMore = result.hasMore;
      lastDoc = result.nextCursor;
    } catch (e) {
      console.error("[HallOfShameGallery] Failed to load more:", e);
      toast.error("Couldn't load more entries. Please try again.");
    } finally {
      isLoadingMore = false;
    }
  }

  function handleVerified() {
    // The guarded filter $effect performs the initial load once isVerified flips.
    isVerified = true;
    showGate = false;
  }

  function handleGateCanceled() {
    showGate = false;
    // Navigate back or show access denied
  }

  function handleVoteChange(entryId: string, newVoteCount: number) {
    // Update local state
    entries = entries.map((e) =>
      e.id === entryId ? { ...e, voteCount: newVoteCount } : e
    );
    featuredEntries = featuredEntries.map((e) =>
      e.id === entryId ? { ...e, voteCount: newVoteCount } : e
    );
  }

  // Reload when filters change. Guarded so the initial verification load
  // (checkVerification → loadGallery) doesn't double-fire with this effect:
  // we only reload when the category/sort combination actually differs from
  // what was last loaded.
  let lastLoadedFilters = $state<string | null>(null);
  $effect(() => {
    if (!isVerified) return;
    const combo = `${selectedCategory}|${sortOption}`;
    if (combo === lastLoadedFilters) return;
    lastLoadedFilters = combo;
    loadGallery();
  });
</script>

<div class="hall-of-shame-gallery">
  {#if !authState.initialized || isCheckingVerification}
    <div class="loading-state">
      <ProgressRing percent={-1} size={32} strokeWidth={3} />
      <p>{t('hall_of_shame_checking_access')}</p>
    </div>
  {:else if !authState.user}
    <div class="access-denied">
      <i class="fas fa-lock" aria-hidden="true"></i>
      <h2>{t('hall_of_shame_sign_in_required')}</h2>
      <p>{t('hall_of_shame_sign_in_message')}</p>
    </div>
  {:else if verificationError}
    <div class="verification-required">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <h2>{t('hall_of_shame_age_required')}</h2>
      <p>We couldn't verify your age right now. Access is blocked until age verification is available. Please try again later.</p>
      <button
        class="verify-button"
        onclick={() => {
          verificationError = false;
          isCheckingVerification = true;
          checkVerification();
        }}
      >
        {t('hall_of_shame_retry')}
      </button>
    </div>
  {:else if !isVerified}
    <div class="verification-required">
      <i class="fas fa-skull" aria-hidden="true"></i>
      <h2>{t('hall_of_shame_age_required')}</h2>
      <p>{t('hall_of_shame_age_required_message')}</p>
      <button class="verify-button" onclick={() => (showGate = true)}>
        {t('hall_of_shame_verify_age')}
      </button>
      <div class="warning-notice">
        <i class="fas fa-ban" aria-hidden="true"></i>
        <span>{t('hall_of_shame_hate_speech_warning')}</span>
      </div>
    </div>
  {:else}
    <!-- Gallery Header -->
    <header class="gallery-header">
      <div class="header-content">
        <h1>
          <i class="fas fa-skull" aria-hidden="true"></i>
          {t('hall_of_shame_title')}
        </h1>
        <p class="subtitle">{t('hall_of_shame_subtitle')}</p>
        <div class="header-warning">
          <i class="fas fa-ban" aria-hidden="true"></i>
          <span>{t('hall_of_shame_header_warning')}</span>
        </div>
      </div>

      <div class="filter-controls">
        <SegmentedControl
          options={categories}
          value={selectedCategory}
          onchange={(v) => (selectedCategory = v)}
          color="red"
          size="sm"
        />

        <SegmentedControl
          options={sortOptions}
          value={sortOption}
          onchange={(v) => (sortOption = v)}
          color="red"
          size="sm"
        />
      </div>
    </header>

    <!-- Featured Section -->
    {#if featuredEntries.length > 0 && selectedCategory === "all"}
      <section class="featured-section">
        <h2 class="section-title">
          <i class="fas fa-star" aria-hidden="true"></i>
          {t('hall_of_shame_featured')}
        </h2>
        <div class="featured-grid">
          {#each featuredEntries as entry (entry.id)}
            <ShameSequenceCard {entry} onVoteChange={handleVoteChange} />
          {/each}
        </div>
      </section>
    {/if}

    <!-- Main Gallery -->
    <section class="main-gallery">
      {#if isLoading}
        <div class="loading-state">
          <ProgressRing percent={-1} size={32} strokeWidth={3} />
          <p>{t('hall_of_shame_loading')}</p>
        </div>
      {:else if error}
        <div class="error-state">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
          <p>{error}</p>
          <button class="retry-button" onclick={loadGallery}>{t('hall_of_shame_retry')}</button>
        </div>
      {:else if entries.length === 0}
        <div class="empty-state">
          <i class="fas fa-ghost" aria-hidden="true"></i>
          <h3>{t('hall_of_shame_no_entries')}</h3>
          <p>
            {selectedCategory === "all"
              ? t('hall_of_shame_empty_all')
              : t('hall_of_shame_empty_category', { category: selectedCategory })}
          </p>
        </div>
      {:else}
        <PanelGrid minCardWidth="180px" gap="16px">
          {#each entries as entry (entry.id)}
            <ShameSequenceCard {entry} onVoteChange={handleVoteChange} />
          {/each}
        </PanelGrid>

        {#if hasMore}
          <div class="load-more">
            <button
              class="load-more-button"
              onclick={loadMore}
              disabled={isLoadingMore}
            >
              {#if isLoadingMore}
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                {t('hall_of_shame_loading_more')}
              {:else}
                {t('hall_of_shame_load_more')}
              {/if}
            </button>
          </div>
        {/if}
      {/if}
    </section>
  {/if}
</div>

<!-- Age Verification Gate -->
{#if showGate}
  <HallOfShameGate onVerified={handleVerified} onCancel={handleGateCanceled} />
{/if}

<style>
  .hall-of-shame-gallery {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    padding: 24px;
    background: var(--theme-panel-bg);
  }

  /* Loading/Access States */
  .loading-state,
  .access-denied,
  .verification-required,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 48px 24px;
    text-align: center;
    color: var(--theme-text-dim);
    flex: 1;
  }

  .access-denied i,
  .verification-required i,
  .error-state i,
  .empty-state i {
    font-size: 3rem;
    color: var(--semantic-error, #ef4444);
    opacity: 0.6;
  }

  .access-denied h2,
  .verification-required h2 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--theme-text);
  }

  .access-denied p,
  .verification-required p,
  .empty-state p {
    margin: 0;
    max-width: 400px;
    line-height: 1.5;
  }

  .warning-notice {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 24px;
    padding: 12px 16px;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    border-radius: 8px;
    max-width: 450px;
  }

  .warning-notice i {
    color: var(--semantic-error, #ef4444);
    font-size: 1rem;
    flex-shrink: 0;
  }

  .warning-notice span {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
    line-height: 1.4;
  }

  .header-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    border-radius: 6px;
  }

  .header-warning i {
    color: var(--semantic-error, #ef4444);
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  .header-warning span {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
    line-height: 1.3;
  }

  .verify-button,
  .retry-button {
    margin-top: 8px;
    padding: 12px 24px;
    background: var(--semantic-error, #ef4444);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .verify-button:hover,
  .retry-button:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 80%, black);
  }

  /* Header */
  .gallery-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 32px;
    flex-wrap: wrap;
  }

  .header-content h1 {
    margin: 0 0 8px;
    font-size: 2rem;
    font-weight: 700;
    color: var(--theme-text);
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-content h1 i {
    color: var(--semantic-error, #ef4444);
  }

  .subtitle {
    margin: 0;
    font-size: 1rem;
    color: var(--theme-text-dim);
  }

  .filter-controls {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  /* Featured Section */
  .featured-section {
    margin-bottom: 32px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 16px;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .section-title i {
    color: var(--semantic-warning, #f59e0b);
  }

  .featured-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 16px;
  }

  /* Main Gallery */
  .main-gallery {
    flex: 1;
  }

  .empty-state h3 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--theme-text);
  }

  /* Load More */
  .load-more {
    display: flex;
    justify-content: center;
    padding: 32px 0;
  }

  .load-more-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 32px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text);
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .load-more-button:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .load-more-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .hall-of-shame-gallery {
      padding: 16px;
    }

    .gallery-header {
      flex-direction: column;
      gap: 16px;
    }

    .filter-controls {
      width: 100%;
      flex-direction: column;
      align-items: stretch;
    }

    .header-content h1 {
      font-size: 1.5rem;
    }
  }

</style>
