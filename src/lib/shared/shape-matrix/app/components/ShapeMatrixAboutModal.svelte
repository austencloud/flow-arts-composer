<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "$lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import { localizedLevelDescription } from "../../domain/shape-matrix-display";
  import { SHAPE_MATRIX_LEVELS } from "../shape-matrix-levels";
  import {
    KINETIC_SHAPE_ENGINE_AUTHOR,
    KINETIC_SHAPE_ENGINE_NAME,
    ORIGINAL_SHAPE_MATRIX_URL,
    ORIGINAL_SHAPE_MATRIX_VTG_RATIOS,
    SPIN_SCIENCE_URL,
  } from "../shape-engine-identity";

  /* Named for what it is rather than `state`: a binding called `state` makes
     `$state` in this file a store read of it, which is how this modal came to
     throw store_invalid_shape the moment it gained a rune. */
  const appState = getShapeMatrixAppContext();

  let levelsSection = $state<HTMLElement | null>(null);

  /* Opened from the difficulty control's question mark, About is being asked one
     question rather than being browsed, so it goes to the answer. The modal
     mounts its body on open, hence the frame's wait for the node. */
  $effect(() => {
    if (appState.aboutFocus !== "levels" || !appState.aboutOpen) return;
    const frame = requestAnimationFrame(() => {
      levelsSection?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

{#snippet header()}
  <ModalHeader
    id="shape-matrix-about-title"
    title={t("shape_engine_about_name")}
    subtitle={t("shape_engine_about_subtitle")}
    icon="fa-table-cells-large"
    iconColor="#d9901a"
    onClose={appState.closeAbout}
  />
{/snippet}

<BaseModal
  open={appState.aboutOpen}
  onclose={appState.closeAbout}
  size="xl"
  labelledBy="shape-matrix-about-title"
  {header}
>
  <div class="about-copy">
    <p>
      {t("shape_engine_about_intro_before")}
      {KINETIC_SHAPE_ENGINE_AUTHOR}. {t("shape_engine_about_intro_middle")}
      <LinkChip size="inline" href="/composer">Flow Arts Composer</LinkChip>{t(
        "shape_engine_about_intro_after"
      )}
    </p>
    <div class="about-columns">
      <section>
        <span class="section-kicker">{t("shape_engine_notation_kicker")}</span>
        <h2>{t("shape_engine_notation_heading")}</h2>
        <p>
          {t("shape_engine_notation_prose", {
            ratios: ORIGINAL_SHAPE_MATRIX_VTG_RATIOS,
          })}
        </p>
      </section>

      <section bind:this={levelsSection} class="levels-section">
        <span class="section-kicker">{t("shape_engine_difficulty_kicker")}</span
        >
        <h2>{t("shape_engine_levels_heading")}</h2>
        <p>
          {t("shape_engine_levels_prose")}
        </p>
        <ol class="level-list">
          {#each SHAPE_MATRIX_LEVELS as level (level)}
            <li>
              <span class="level-numeral">{level}</span>
              <span class="level-copy">
                <strong>{localizedLevelDescription(level).name}</strong>
                <span>{localizedLevelDescription(level).blurb}</span>
              </span>
            </li>
          {/each}
        </ol>
      </section>

      <section>
        <span class="section-kicker">{t("shape_engine_source_kicker")}</span>
        <h2>{t("shape_engine_source_heading")}</h2>
        <p>
          {t("shape_engine_source_before")}
          <LinkChip size="inline" href={SPIN_SCIENCE_URL}>Spin Science</LinkChip
          >{t("shape_engine_source_after")}
        </p>
        <p>
          {t("shape_engine_independence_prose")}
        </p>
      </section>
    </div>
    <div class="source-links">
      <a href="/guide/ratios">
        {t("shape_engine_read_ratios")}
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </a>
      <a href="/history#archive-record-vtg">
        {t("shape_engine_vtg_record")}
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </a>
      <a href="/history#archive-record-lorq">
        {t("shape_engine_lorq_record")}
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </a>
      <a
        href={ORIGINAL_SHAPE_MATRIX_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("shape_engine_view_original_matrix")}
        <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
      </a>
    </div>
  </div>
</BaseModal>

<style>
  .about-copy {
    display: grid;
    gap: 1.5rem;
    padding: clamp(1rem, 2.2vw, 2rem);
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    font-size: 0.98rem;
    line-height: 1.65;
  }

  .about-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(1.5rem, 4vw, 4rem);
  }

  section {
    display: grid;
    align-content: start;
    gap: 0.8rem;
  }

  /* The one section a reader can be sent to directly, so it spans the columns
     rather than being half a row someone has to find. */
  .levels-section {
    grid-column: 1 / -1;
  }

  .level-list {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .level-list li {
    display: flex;
    align-items: baseline;
    gap: 0.65rem;
  }

  .level-numeral {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.16));
    border-radius: 8px;
    color: var(--theme-text, #fff);
    font-size: 0.85rem;
    font-weight: 700;
  }

  .level-copy {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.4rem;
    min-width: 0;
  }

  .level-copy strong {
    color: var(--theme-text, #fff);
  }

  p {
    margin: 0;
  }

  h2 {
    color: var(--theme-text, #fff);
  }

  .section-kicker {
    color: #f4b54c;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    margin: -0.25rem 0 0;
    font-size: clamp(1.2rem, 1.8vw, 1.55rem);
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .source-links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    margin-top: 0.25rem;
  }

  .source-links a {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.55rem 0.8rem;
    border: 1px solid rgb(245 158 11 / 0.42);
    border-radius: 12px;
    background: rgb(245 158 11 / 0.08);
    color: var(--theme-text, #fff);
    font-weight: 600;
    text-align: center;
    text-decoration: none;
  }

  .source-links a:hover {
    background: rgb(245 158 11 / 0.14);
    border-color: rgb(245 158 11 / 0.7);
  }

  .source-links a:focus-visible {
    outline: 2px solid #f59e0b;
    outline-offset: 2px;
  }

  @media (max-width: 52rem) {
    .about-columns {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 36rem) {
    .source-links {
      grid-template-columns: 1fr;
    }

    .about-copy {
      padding: 1rem;
    }
  }
</style>
