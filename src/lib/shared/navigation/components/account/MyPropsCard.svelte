<!-- Persistent Account-page summary of public prop identity. -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import type { PropPreferenceState } from "$lib/shared/community/state/prop-preference-state.svelte";
  import {
    getProfilePropLabel,
    normalizeProfileSkill,
    normalizeProfileSkills,
  } from "$lib/shared/community/domain/profile-prop-catalog";

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
</script>

<section class="flow-identity" aria-labelledby="flow-identity-title">
  <header class="identity-header">
    <span class="identity-heading">
      <span class="identity-icon" aria-hidden="true">
        <i class="fas fa-fire"></i>
      </span>
      <span>
        <span class="identity-title" id="flow-identity-title"
          >{t("nav_ui_flow_identity")}</span
        >
        <span class="identity-description">
          {t(
            "nav_ui_shown_on_your_public_creator_profile_and_used_for_prop_based_discovery"
          )}
        </span>
      </span>
    </span>

    <PanelButton
      variant="secondary"
      onclick={onOpenPropEditor}
      disabled={loading || propState === null}
      ariaLabel={t("nav_ui_change_props_you_spin_and_profile_prop")}
    >
      <i class="fas fa-pen" aria-hidden="true"></i>
      <span>{t("nav_ui_change")}</span>
    </PanelButton>
  </header>

  <div class="identity-values">
    <div class="identity-value">
      <span class="value-label">{t("nav_ui_props_you_spin")}</span>
      {#if loading}
        <span class="value-empty">{t("nav_ui_loading")}</span>
      {:else if selectedProps.length > 0}
        <span
          class="prop-list"
          aria-label={selectedProps.map(getProfilePropLabel).join(", ")}
        >
          {#each selectedProps.slice(0, 5) as prop (prop)}
            {@const label = getProfilePropLabel(prop)}
            <span class="prop-chip">
              <span class="summary-prop-preview" aria-hidden="true">
                <PropCompositionPreview
                  propType={prop}
                  size={26}
                  useSavedOverrides={false}
                />
              </span>
              <span>{label}</span>
            </span>
          {/each}
          {#if selectedProps.length > 5}
            <span class="more-count"
              >{t("nav_more_count", { count: selectedProps.length - 5 })}</span
            >
          {/if}
        </span>
      {:else}
        <span class="value-empty">{t("profile_pronouns_not_set")}</span>
      {/if}
    </div>

    <div class="identity-value profile-prop-value">
      <span class="value-label"
        >{t("nav_ui_profile_prop")} <span>{t("nav_ui_optional")}</span></span
      >
      {#if loading}
        <span class="value-empty">{t("nav_ui_loading")}</span>
      {:else if effectiveProfileProp}
        {@const label = getProfilePropLabel(effectiveProfileProp)}
        <span class="profile-prop">
          <span class="summary-prop-preview" aria-hidden="true">
            <PropCompositionPreview
              propType={effectiveProfileProp}
              size={26}
              useSavedOverrides={false}
            />
          </span>
          <span>{label}</span>
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
    </div>
  </div>

  {#if propState?.error}
    <p class="identity-error" role="status">{propState.error}</p>
  {/if}
</section>

<style>
  .flow-identity {
    display: flex;
    width: 100%;
    min-width: 0;
    flex-direction: column;
    gap: 0.8em;
  }

  .identity-header,
  .identity-heading,
  .identity-title,
  .identity-description,
  .identity-values,
  .identity-value,
  .prop-list,
  .prop-chip,
  .profile-prop {
    display: flex;
  }

  .identity-header {
    align-items: center;
    justify-content: space-between;
    gap: 1em;
  }

  .identity-heading {
    min-width: 0;
    align-items: center;
    gap: 0.75em;
  }

  .identity-heading > span:last-child,
  .identity-value {
    min-width: 0;
    flex-direction: column;
  }

  .identity-icon {
    display: grid;
    width: 2.4em;
    height: 2.4em;
    flex: 0 0 auto;
    place-items: center;
    color: var(--theme-accent-text, var(--theme-accent));
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 24%, transparent);
    border-radius: 0.7em;
  }

  .identity-title {
    color: var(--theme-text, white);
    font-size: max(1rem, var(--font-size-base));
    font-weight: 750;
  }

  .identity-description {
    margin-top: 0.15em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: max(0.875rem, var(--font-size-min));
    line-height: 1.35;
  }

  .identity-header :global(.panel-btn) {
    flex: 0 0 auto;
  }

  .identity-values {
    min-width: 0;
    gap: 1em;
  }

  .identity-value {
    flex: 1 1 0;
    gap: 0.45em;
    padding: 0.75em;
    background: color-mix(in srgb, var(--theme-text) 4%, transparent);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.7em;
  }

  .value-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: max(0.875rem, var(--font-size-min));
    font-weight: 650;
  }

  .value-label span {
    margin-left: 0.35em;
    font-size: max(0.875rem, var(--font-size-min));
    font-weight: 500;
  }

  .prop-list {
    min-width: 0;
    align-items: center;
    gap: 0.35em;
    overflow: hidden;
  }

  .prop-chip,
  .profile-prop {
    align-items: center;
    gap: 0.35em;
    color: var(--theme-text, white);
    font-size: max(0.875rem, var(--font-size-min));
    font-weight: 650;
  }

  .prop-chip {
    min-width: 0;
    padding: 0.25em 0.45em;
    background: color-mix(in srgb, var(--theme-accent) 9%, transparent);
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
  }

  .implicit-note {
    font-size: max(0.875rem, var(--font-size-min));
    font-weight: 500;
  }

  .identity-error {
    margin: 0;
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 72%, white);
    font-size: max(0.875rem, var(--font-size-min));
  }

  @container profile-tab (max-width: 34rem) {
    .identity-values {
      flex-direction: column;
    }

    .identity-header {
      align-items: flex-start;
    }

    .identity-header :global(.panel-btn) {
      min-width: var(--min-touch-target, 44px);
      padding-inline: 0.75rem;
    }

    .identity-header :global(.panel-btn span) {
      display: none;
    }
  }
</style>
