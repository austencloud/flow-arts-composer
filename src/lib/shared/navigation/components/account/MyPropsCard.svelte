<!-- Persistent Account-page summary of public prop identity. -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import PropCompositionPreview from "#lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import type { PropPreferenceState } from "#lib/shared/community/state/prop-preference-state.svelte.js";
  import {
    getProfilePropLabel,
    normalizeProfileSkill,
    normalizeProfileSkills,
  } from "#lib/shared/community/domain/profile-prop-catalog.js";

  interface Props {
    propState: PropPreferenceState | null;
    onOpenPropEditor: () => void;
  }

  let { propState, onOpenPropEditor }: Props = $props();

  const selectedProps = $derived(
    normalizeProfileSkills(propState?.propsISpinWith ?? [])
  );
  const normalizedFavorite = $derived(
    propState?.favoriteProp
      ? normalizeProfileSkill(propState.favoriteProp)
      : null
  );
  const explicitProfileProp = $derived(
    normalizedFavorite && selectedProps.includes(normalizedFavorite)
      ? normalizedFavorite
      : null
  );
  const effectiveProfileProp = $derived(
    explicitProfileProp ??
      (selectedProps.length === 1 ? selectedProps[0] : null)
  );
  const loading = $derived(propState?.loading ?? true);

  // Chips wrap onto extra lines, so the cap only keeps a long list from
  // outgrowing the column beside it.
  const MAX_VISIBLE_PROPS = 8;
  const hiddenPropCount = $derived(
    Math.max(0, selectedProps.length - MAX_VISIBLE_PROPS)
  );
</script>

<section class="flow-identity" aria-labelledby="flow-identity-title">
  <header class="identity-header">
    <span class="identity-icon" aria-hidden="true">
      <i class="fas fa-fire"></i>
    </span>
    <span class="identity-title" id="flow-identity-title"
      >{t("nav_ui_flow_identity")}</span
    >
    <span class="identity-action">
      <PanelButton
        variant="quiet"
        onclick={onOpenPropEditor}
        disabled={loading || propState === null}
        ariaLabel={t("nav_ui_change_props_you_spin_and_profile_prop")}
      >
        <i class="fas fa-pen" aria-hidden="true"></i>
        <span>{t("nav_ui_change")}</span>
      </PanelButton>
    </span>
    <span class="identity-description">
      {t(
        "nav_ui_shown_on_your_public_creator_profile_and_used_for_prop_based_discovery"
      )}
    </span>
  </header>

  <dl class="identity-values">
    <div class="identity-value">
      <dt class="value-label">{t("nav_ui_props_you_spin")}</dt>
      <dd>
        {#if loading}
          <span class="value-empty">{t("nav_ui_loading")}</span>
        {:else if selectedProps.length > 0}
          <ul class="prop-list">
            {#each selectedProps.slice(0, MAX_VISIBLE_PROPS) as prop (prop)}
              <li class="prop-chip">
                <span class="summary-prop-preview" aria-hidden="true">
                  <PropCompositionPreview
                    propType={prop}
                    size={26}
                    useSavedOverrides={false}
                  />
                </span>
                <span>{getProfilePropLabel(prop)}</span>
              </li>
            {/each}
            {#if hiddenPropCount > 0}
              <li class="more-count">
                {t("nav_more_count", { count: hiddenPropCount })}
              </li>
            {/if}
          </ul>
        {:else}
          <span class="value-empty">{t("profile_pronouns_not_set")}</span>
        {/if}
      </dd>
    </div>

    <div class="identity-value">
      <dt class="value-label">
        {t("nav_ui_profile_prop")}
        <span class="optional">{t("nav_ui_optional")}</span>
      </dt>
      <dd>
        {#if loading}
          <span class="value-empty">{t("nav_ui_loading")}</span>
        {:else if effectiveProfileProp}
          <span class="profile-prop">
            <span class="summary-prop-preview" aria-hidden="true">
              <PropCompositionPreview
                propType={effectiveProfileProp}
                size={26}
                useSavedOverrides={false}
              />
            </span>
            <span>{getProfilePropLabel(effectiveProfileProp)}</span>
            {#if !explicitProfileProp && selectedProps.length === 1}
              <span class="implicit-note"
                >{t("nav_ui_your_only_selected_prop")}</span
              >
            {/if}
          </span>
        {:else if selectedProps.length > 1}
          <span class="value-empty">{t("nav_ui_no_preference")}</span>
        {:else}
          <span class="value-empty">{t("profile_pronouns_not_set")}</span>
        {/if}
      </dd>
    </div>
  </dl>

  {#if propState?.error}
    <p class="identity-error" role="status">{propState.error}</p>
  {/if}
</section>

<style>
  .flow-identity {
    container: flow-identity / inline-size;
    display: flex;
    width: 100%;
    min-width: 0;
    flex-direction: column;
    gap: 1.1em;
  }

  /* Icon, title and action share the first row; the description runs under
     the title so a narrow column never squeezes it beside the button. */
  .identity-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 0.75em;
    row-gap: 0.2em;
  }

  .identity-icon {
    display: grid;
    width: 2.4em;
    height: 2.4em;
    place-items: center;
    color: var(--theme-accent-text, var(--theme-accent));
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 24%, transparent);
    border-radius: 0.7em;
  }

  .identity-title {
    min-width: 0;
    color: var(--theme-text, white);
    font-size: max(1rem, var(--font-size-base));
    font-weight: 750;
  }

  .identity-action :global(.panel-btn) {
    min-width: 5.25em;
  }

  .identity-description {
    grid-column: 2 / -1;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: max(0.875rem, var(--font-size-min));
    line-height: 1.35;
  }

  .identity-values {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1em;
    margin: 0;
  }

  .identity-value {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.5em;
  }

  .identity-value dd {
    min-width: 0;
    margin: 0;
  }

  .value-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: max(0.875rem, var(--font-size-min));
    font-weight: 650;
  }

  .optional {
    margin-left: 0.35em;
    font-weight: 500;
  }

  .prop-list {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4em;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .prop-chip,
  .profile-prop {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    color: var(--theme-text, white);
    font-size: max(0.875rem, var(--font-size-min));
    font-weight: 650;
  }

  .profile-prop {
    flex-wrap: wrap;
  }

  .prop-chip {
    flex: 0 0 auto;
    padding: 0.3em 0.7em 0.3em 0.4em;
    background: color-mix(in srgb, var(--theme-accent) 9%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 16%, transparent);
    border-radius: 999px;
    white-space: nowrap;
  }

  .summary-prop-preview {
    display: grid;
    width: 1.65em;
    height: 1.65em;
    flex: 0 0 auto;
    place-items: center;
  }

  .summary-prop-preview :global(.prop-composition-preview) {
    width: 100%;
    height: 100%;
  }

  .more-count,
  .value-empty,
  .implicit-note {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: max(0.875rem, var(--font-size-min));
    font-weight: 500;
  }

  .more-count {
    padding-inline: 0.35em;
  }

  .identity-error {
    margin: 0;
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 72%, white);
    font-size: max(0.875rem, var(--font-size-min));
  }

  @container flow-identity (max-width: 18rem) {
    .identity-action :global(.panel-btn) {
      min-width: var(--min-touch-target, 44px);
      padding-inline: 0.75rem;
    }

    .identity-action :global(.panel-btn span) {
      display: none;
    }
  }
</style>
