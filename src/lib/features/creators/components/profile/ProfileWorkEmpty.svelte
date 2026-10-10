<!--
  What fills the work column when there is nothing in it.

  The first attempt at an empty profile dropped the column entirely and centred
  the identity rail as a lone card. Austen (2026-07-29): "I'm not really a fan in
  general of how we made it so that when somebody doesn't have content it just
  loads the single vertical strip of their regular information we could have a
  giant empty area on the right and encourage them to create content with action
  buttons."

  So the layout no longer changes shape at all — two columns for everyone — and
  this panel is what the second column holds. On your own profile it is the
  invitation. On someone else's it says plainly that they have not published
  anything, and offers the gallery instead of a dead end.

  Built on PanelState + PanelButton, which is the pattern this feature already
  uses for its error state a few lines up in UserProfilePanel.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PanelState from "#lib/shared/components/panel/PanelState.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";

  let {
    isOwnProfile,
    displayName,
  }: {
    isOwnProfile: boolean;
    /** Used to name the person in the visitor copy. */
    displayName?: string;
  } = $props();

  const who = $derived(displayName?.trim() || t("browse_verified_this_creator"));

  function goBuild(): void {
    void handleModuleChange("create", "construct");
  }

  /**
   * Navigates to the Generate tab. It does NOT generate anything — a one-tap
   * starter that generated, loaded and auto-saved a sequence nobody asked for
   * was removed from GenerateEmptyState on 2026-07-29 at Austen's direction.
   * This is a door, not an action.
   */
  function goGenerate(): void {
    void handleModuleChange("create", "generate");
  }

  function goGallery(): void {
    void handleModuleChange("browse", "gallery");
  }
</script>

<div class="work-empty">
  <!-- Opens like every other section in this column: uppercase label, hairline
       rule, count on the right. Without it the empty state floated as a centred
       icon in a bare panel and read as a different page from the bands it
       replaces. "Sequences 0" rather than a slogan, so the head still states a
       fact the way Showcase / Archive / Collections do. -->
  <header class="band-head">
    <h2>{t("browse_ui_sequences_tab")}</h2>
    <span class="rule" aria-hidden="true"></span>
    <span class="band-count">0</span>
  </header>

  <div class="middle">
    {#if isOwnProfile}
      <PanelState
        type="empty"
        icon="fa-wand-magic-sparkles"
        title={t("browse_verified_own_profile_empty_title")}
        message={t("browse_verified_own_profile_empty_message")}
      />
      <div class="actions">
        <PanelButton variant="primary" onclick={goBuild}>
          <i class="fas fa-pen-ruler" aria-hidden="true"></i>
          {t("browse_verified_build_sequence")}
        </PanelButton>
        <PanelButton variant="secondary" onclick={goGenerate}>
          <i class="fas fa-dice" aria-hidden="true"></i>
          {t("browse_verified_generate_one")}
        </PanelButton>
        <PanelButton variant="secondary" onclick={goGallery}>
          <i class="fas fa-images" aria-hidden="true"></i>
          {t("browse_verified_see_others_work")}
        </PanelButton>
      </div>
    {:else}
      <!-- No message line: "hasn't published anything yet" and "will show up
           here when they publish" say the same thing twice, and the second one
           wrapped mid-sentence inside PanelState's measure. -->
      <PanelState
        type="empty"
        icon="fa-folder-open"
        title={t("browse_verified_profile_not_published", { name: who })}
      />
      <div class="actions">
        <PanelButton variant="secondary" onclick={goGallery}>
          <i class="fas fa-images" aria-hidden="true"></i>
          {t("browse_verified_browse_gallery")}
        </PanelButton>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Fills the column rather than floating a small notice in a large box. The
     measures share the standard logical unit used by the populated stage. */
  .work-empty {
    display: flex;
    flex-direction: column;
    gap: 0.85em;
    /* Generous on a desktop column, but capped against the viewport so a phone —
       where this panel stacks BELOW an already-tall identity rail — does not get
       400px of empty panel on a 667px screen. */
    min-height: min(26em, 55vh);
    height: 100%;
  }

  /* ── Copied deliberately from ProfileStage's band head, values and all, so the
     empty column opens exactly like the bands it stands in for. Svelte's scoped
     CSS is why this is a copy rather than an import; the alternative is a shared
     BandHead component, which is the right move the moment a THIRD surface needs
     it (never-hand-roll.md — two is a coincidence, three is a pattern). ── */
  .band-head {
    display: flex;
    align-items: center;
    gap: 0.9em;
  }

  .band-head h2 {
    margin: 0;
    font-size: 0.9375em;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-dim);
    white-space: nowrap;
  }

  .rule {
    flex: 1;
    height: 1px;
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.12));
  }

  .band-count {
    font-size: 0.9375em;
    color: var(--theme-text-dim);
    font-variant-numeric: tabular-nums;
  }

  /* Takes the leftover height and centres the invitation in it, so the head
     stays pinned to the top like a band's does. */
  .middle {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.75em;
    text-align: center;
  }

  /* PanelState hardcodes `padding: 60px 20px` and caps its message at `300px`.
     Both are px, so on this surface they alone refused to scale while the type
     around them did — and the 300px measure is what broke a one-line message
     into an awkward two-line wrap in a 1400px column. Restated in `em` so the
     whole block moves together. */
  .middle :global(.panel-state) {
    padding: 0;
    gap: 0.75em;
  }

  .middle :global(.panel-state__message) {
    max-width: 26em;
  }

  /* Wraps rather than squeezing: three buttons fit one row on a desktop column
     and stack on a phone, and each keeps the 44px floor PanelButton sets. */
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.75em;
  }
</style>
