<!--
  LetterTypeGuide.svelte

  The letter-type reference inside the option picker's shared utility tray.
  The tray owns disclosure behavior; this component owns only the guide content
  and responsive card layout.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { LETTER_TYPE_DESCRIPTORS } from "../services/section-title-formatter";

  const letterTypes = Object.values(LETTER_TYPE_DESCRIPTORS);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -- Keyboard users need to scroll this compact reference when its cards exceed the tray. -->
<section
  class="type-info-panel themed-scrollbar"
  tabindex="0"
  aria-label={t("create_ui_letter_type_reference")}
>
  <header class="type-info-header">
    <h2>{t("create_ui_letter_types")}</h2>
    <p>
      Shift moves a hand to an adjacent point. Dash moves it to the opposite
      point.
    </p>
  </header>

  <div class="type-grid">
    {#each letterTypes as letterType (letterType.key)}
      <article class="type-card">
        <div class="type-card-heading">
          <strong>
            <span class="sr-only">{t("create_ui_type")} </span>
            {letterType.typeName.replace("Type ", "")}
          </strong>
          <span
            class="type-palette"
            aria-hidden="true"
            title={t(letterType.translationKey)}
          >
            {#each letterType.coloredParts as part}
              {#if part.color && part.color !== "currentColor"}
                <span style:background-color={part.color}></span>
              {/if}
            {/each}
          </span>
          <span class="type-name">
            {t(letterType.translationKey)}
          </span>
        </div>
        <p>{letterType.explanation}</p>
      </article>
    {/each}
  </div>
</section>

<style>
  .type-info-panel {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 10px;
    overflow-y: auto;
    overscroll-behavior: contain;
    color: var(--theme-text, #fff);
  }

  .type-info-panel:focus-visible {
    outline: 2px solid var(--theme-accent, #22b8db);
    outline-offset: -3px;
    border-radius: var(--radius-xl, 16px);
  }

  .type-info-header {
    margin-bottom: 10px;
  }

  .type-info-header h2 {
    margin: 0;
    font-size: var(--font-size-base, 16px);
    font-weight: 750;
    line-height: 1.2;
  }

  .type-info-header p {
    margin: 3px 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: var(--font-size-min, 14px);
    line-height: 1.3;
  }

  .type-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .type-card {
    min-width: 0;
    padding: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: var(--radius-md, 10px);
  }

  .type-card-heading {
    display: grid;
    grid-template-columns: auto 24px minmax(0, 1fr);
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .type-card-heading strong,
  .type-name {
    font-size: var(--font-size-min, 14px);
    line-height: 1.15;
  }

  .type-card-heading strong {
    white-space: nowrap;
  }

  .type-name {
    min-width: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.78));
  }

  .type-palette {
    display: flex;
    width: 20px;
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
  }

  .type-palette span {
    flex: 1;
    min-width: 0;
  }

  .type-card p {
    margin: 6px 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.76));
    font-size: var(--font-size-min, 14px);
    line-height: 1.28;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @container (min-width: 32rem) {
    .type-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
