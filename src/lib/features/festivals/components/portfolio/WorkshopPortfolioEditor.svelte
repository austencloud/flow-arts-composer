<script lang="ts">
  import { getFestivalContext } from "../../context/festival-context";
  import { auth } from "#lib/shared/auth/firebase.js";
  import { Timestamp } from "firebase/firestore";
  import type { TeachingPortfolio, BioVersion } from "../../domain/models/teaching-portfolio";
  import { AUSTEN_PORTFOLIO_SEED } from "../../data/portfolio-seed";
  import WorkshopSection from "./WorkshopSection.svelte";
  import ActSection from "./ActSection.svelte";
  import BioEditor from "./BioEditor.svelte";
  import ProfileSection from "./ProfileSection.svelte";
  import VideosSection from "./VideosSection.svelte";

  const { state: festivalState } = getFestivalContext();

  let editBioId = $state<string | null>(null);

  function addBio() {
    const uid = auth.currentUser?.uid;
    if (!uid || !festivalState.portfolio) return;
    const newBio: BioVersion = {
      id: crypto.randomUUID(),
      label: "New Bio",
      text: "",
    };
    const updated: TeachingPortfolio = {
      ...festivalState.portfolio,
      bios: [...festivalState.portfolio.bios, newBio],
    };
    festivalState.savePortfolio(uid, updated);
    editBioId = newBio.id;
  }

  function createBlankPortfolio() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const now = Timestamp.now();
    festivalState.savePortfolio(uid, {
      userId: uid,
      classes: [],
      acts: [],
      bios: [],
      performanceCredits: [],
      performanceVideos: [],
      socialLinks: {},
      homeCity: "",
      homeCountry: "",
      yearsTeaching: 0,
      yearsPerforming: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  function importSeed() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const now = Timestamp.now();
    const portfolio: TeachingPortfolio = {
      ...AUSTEN_PORTFOLIO_SEED,
      userId: uid,
      createdAt: now,
      updatedAt: now,
    };
    festivalState.savePortfolio(uid, portfolio);
  }
</script>

<div class="portfolio-editor">
  {#if !festivalState.portfolio}
    <div class="empty-state">
      <i class="fas fa-chalkboard-teacher empty-icon" aria-hidden="true"></i>
      <h3 class="empty-title">Set up your teaching portfolio</h3>
      <p class="empty-body">
        Add your workshops, bios, and performance history so festival organizers can find you.
      </p>
      <div class="empty-actions">
        <button class="primary-btn" onclick={createBlankPortfolio}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          Start from scratch
        </button>
        <button class="secondary-btn" onclick={importSeed}>
          <i class="fas fa-file-import" aria-hidden="true"></i>
          Import sample portfolio
        </button>
      </div>
    </div>
  {:else}
    <div class="portfolio-grid">
      <WorkshopSection />
      <ActSection />

      <section class="section-card">
        <div class="section-header">
          <h3 class="section-title">Bios</h3>
          <button class="ghost-add-btn" onclick={addBio}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            Add Bio
          </button>
        </div>
        <BioEditor bind:editBioId />
      </section>

      <ProfileSection />
      <VideosSection />
    </div>
  {/if}
</div>

<style>
  .portfolio-editor {
    height: 100%;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .portfolio-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(400px, 100%), 1fr));
    gap: 1.25rem;
    padding: 1.25rem;
    max-width: 1400px;
    margin: 0 auto;
  }


  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 48px 24px;
    text-align: center;
  }

  .empty-icon {
    font-size: 48px;
    color: var(--theme-accent, #6366f1);
    opacity: 0.5;
  }

  .empty-title {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .empty-body {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    max-width: 360px;
    line-height: 1.6;
  }

  .empty-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .primary-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--theme-accent, #6366f1);
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    cursor: pointer;
  }

  .primary-btn:hover {
    opacity: 0.85;
  }

  .secondary-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: none;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
    border-radius: 6px;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
  }

  .secondary-btn:hover {
    color: var(--theme-text, #ffffff);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
  }

  /* ─── Bio section (kept inline - small) ──────────────────────────────────── */

  .section-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 12px);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .ghost-add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: none;
    border: none;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: color var(--transition-fast, 0.15s);
  }

  .ghost-add-btn:hover {
    color: var(--theme-accent, #6366f1);
  }
</style>
