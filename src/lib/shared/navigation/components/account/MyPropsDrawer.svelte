<!-- Two-step editor for prop skills and the optional featured profile skill. -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import {
    getLegacyProfileProps,
    getProfilePropFamily,
    getProfilePropFamilyByRepresentative,
    getProfilePropLabel,
    normalizeProfileSelection,
    normalizeProfileSkill,
    normalizeProfileSkills,
    removeProfileProp,
    toggleProfileSkill,
  } from "$lib/shared/community/domain/profile-prop-catalog";
  import type { PropPreferenceState } from "$lib/shared/community/state/prop-preference-state.svelte";
  import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import { tryGetAccountSetupContext } from "$lib/shared/onboarding/context/account-setup-context";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { growFade } from "$lib/shared/transitions/motion";
  import ProfilePropPicker from "./ProfilePropPicker.svelte";
  import PropFamilyGrid from "./PropFamilyGrid.svelte";
  import SelectionFooterBar from "./SelectionFooterBar.svelte";

  interface Props {
    isOpen: boolean;
    propState: PropPreferenceState;
    onclose: () => void;
  }

  let { isOpen = $bindable(), propState, onclose }: Props = $props();
  let step = $state<"props" | "profile-prop">("props");
  let draftProps = $state<PropType[]>([]);
  let draftProfileProp = $state<PropType | null>(null);
  let activeFamily = $state<PropType | null>(null);
  let submitting = $state(false);
  let saveFailed = $state(false);
  let editorContentElement = $state<HTMLElement | null>(null);
  let wasOpen = false;
  const accountSetupState = tryGetAccountSetupContext();

  const legacyProps = $derived(getLegacyProfileProps(draftProps));
  const profilePropChoices = $derived(normalizeProfileSkills(draftProps));
  const primaryLabel = $derived(
    step === "profile-prop"
      ? t("browse_save")
      : profilePropChoices.length > 1
        ? t("attribution_continue")
        : t("feedback_done")
  );

  function resetDraft(): void {
    draftProps = normalizeProfileSelection(propState.propsISpinWith);
    const normalizedFavorite = propState.favoriteProp
      ? normalizeProfileSkill(propState.favoriteProp)
      : null;
    draftProfileProp =
      normalizedFavorite && draftProps.includes(normalizedFavorite)
        ? normalizedFavorite
        : null;
    const initialFamily = getProfilePropFamily(
      draftProfileProp ?? draftProps[0]
    );
    activeFamily =
      initialFamily && initialFamily.choices.length > 1
        ? initialFamily.representative
        : null;
    step = "props";
    saveFailed = false;
    propState.clearError();
    scrollEditorToTop();
  }

  function scrollEditorToTop(): void {
    requestAnimationFrame(() => {
      editorContentElement?.parentElement?.scrollTo({ top: 0 });
    });
  }

  function showStep(nextStep: "props" | "profile-prop"): void {
    step = nextStep;
    scrollEditorToTop();
  }

  $effect(() => {
    if (isOpen && !wasOpen) resetDraft();
    wasOpen = isOpen;
  });

  function triggerHaptic(type: "selection" | "success" = "selection") {
    try {
      const haptic = getHapticFeedback() as HapticFeedback;
      haptic?.trigger(type);
    } catch {
      // Haptics are an enhancement and may not exist on this device.
    }
  }

  function noteDraftChange(): void {
    saveFailed = false;
    propState.clearError();
    triggerHaptic("selection");
  }

  function handleFamilySelect(representative: PropType): void {
    const family = getProfilePropFamilyByRepresentative(representative);
    if (!family) return;

    if (family.choices.length > 1) {
      activeFamily = representative;
      triggerHaptic("selection");
      requestAnimationFrame(() => {
        editorContentElement
          ?.querySelector<HTMLElement>("#prop-family-skill-choices")
          ?.scrollIntoView({ block: "nearest" });
      });
      return;
    }

    const skill = family.choices[0]?.prop;
    if (!skill) return;
    const removing = draftProps.includes(skill);
    draftProps = toggleProfileSkill(draftProps, skill);
    if (removing && draftProfileProp === skill) draftProfileProp = null;
    activeFamily = null;
    noteDraftChange();
  }

  function handleSkillToggle(prop: PropType): void {
    const removing = draftProps.includes(prop);
    draftProps = toggleProfileSkill(draftProps, prop);
    if (removing && draftProfileProp === prop) draftProfileProp = null;
    activeFamily = getProfilePropFamily(prop)?.representative ?? activeFamily;
    noteDraftChange();
  }

  function handleLegacyRemove(prop: PropType): void {
    draftProps = removeProfileProp(draftProps, prop);
    if (draftProfileProp === prop) draftProfileProp = null;
    noteDraftChange();
  }

  function handlePropsPrimary(): void {
    if (profilePropChoices.length === 0 || submitting) return;
    if (profilePropChoices.length === 1) {
      void persistDraft(null);
      return;
    }

    if (draftProfileProp && !draftProps.includes(draftProfileProp)) {
      draftProfileProp = null;
    }
    showStep("profile-prop");
    triggerHaptic("selection");
  }

  function handleProfilePropChoice(propType: PropType | null) {
    draftProfileProp = propType;
    noteDraftChange();
  }

  async function persistDraft(profileProp: PropType | null): Promise<void> {
    if (submitting || profilePropChoices.length === 0) return;
    submitting = true;
    saveFailed = false;
    let saved = false;
    try {
      await propState.saveProfileSelection(draftProps, profileProp);
      accountSetupState?.markPropsPresent(true);
      triggerHaptic("success");
      saved = true;
    } catch (error) {
      saveFailed = true;
      scrollEditorToTop();
      console.error("[MyPropsDrawer] Prop preferences save failed", error);
    } finally {
      submitting = false;
    }
    if (saved) closeModal();
  }

  async function reloadPreferences(): Promise<void> {
    await propState.reload();
    if (!propState.error) resetDraft();
  }

  function closeModal() {
    if (submitting) return;
    step = "props";
    isOpen = false;
    onclose();
  }
</script>

<BaseModal
  bind:open={isOpen}
  onclose={closeModal}
  size="fit"
  animation="pop"
  class="my-props-modal"
>
  {#snippet header()}
    <DrawerHeader
      title={step === "props"
        ? t("nav_ui_what_do_you_spin")
        : t("nav_ui_feature_a_skill")}
      subtitle={step === "props"
        ? t("nav_ui_step_1_of_2_on_your_profile_and_in_prop_search")
        : t("nav_ui_optional_step_2_of_2_beside_your_name_on_creator_cards")}
      onClose={closeModal}
      closeDisabled={submitting}
      closeLabel={t("nav_ui_close_prop_editor")}
    />
  {/snippet}

  <div class="prop-editor-content" bind:this={editorContentElement}>
    {#if propState.error}
      <div class="prop-error" role="alert">
        <span>{propState.error}</span>
        <button
          type="button"
          onclick={saveFailed
            ? () =>
                void persistDraft(
                  profilePropChoices.length === 1 ? null : draftProfileProp
                )
            : () => void reloadPreferences()}
          disabled={submitting || propState.loading}
        >
          {submitting || propState.loading
            ? t("nav_ui_working")
            : saveFailed
              ? t("nav_ui_retry_save")
              : t("nav_ui_reload")}
        </button>
      </div>
    {/if}

    {#if step === "props"}
      <div class="editor-step" transition:growFade={{ axis: "y" }}>
        <PropFamilyGrid
          selectedProps={draftProps}
          {activeFamily}
          disabled={submitting || propState.loading}
          onselectfamily={handleFamilySelect}
          ontoggleskill={handleSkillToggle}
        />

        {#if legacyProps.length > 0}
          <section class="legacy-props" aria-labelledby="legacy-props-title">
            <strong id="legacy-props-title"
              >{t("nav_ui_old_saved_props")}</strong
            >
            <div class="legacy-list">
              {#each legacyProps as prop (prop)}
                <button
                  type="button"
                  class="legacy-chip"
                  onclick={() => handleLegacyRemove(prop)}
                  disabled={submitting}
                  aria-label={t("nav_remove_saved_prop", {
                    prop: getProfilePropLabel(prop),
                  })}
                >
                  <span class="legacy-preview" aria-hidden="true">
                    <PropCompositionPreview
                      propType={prop}
                      size={32}
                      useSavedOverrides={false}
                    />
                  </span>
                  <span>{getProfilePropLabel(prop)}</span>
                  <i class="fas fa-xmark" aria-hidden="true"></i>
                </button>
              {/each}
            </div>
          </section>
        {/if}
      </div>
    {:else}
      <div class="editor-step" transition:growFade={{ axis: "y" }}>
        <ProfilePropPicker
          selectedProps={profilePropChoices}
          value={draftProfileProp}
          disabled={submitting}
          onselect={handleProfilePropChoice}
        />
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <SelectionFooterBar
      selectedProps={profilePropChoices}
      saving={submitting}
      {primaryLabel}
      primaryDisabled={step === "props" && profilePropChoices.length === 0}
      onprimary={step === "props"
        ? handlePropsPrimary
        : () => void persistDraft(draftProfileProp)}
      onback={step === "profile-prop" ? () => showStep("props") : undefined}
    />
  {/snippet}
</BaseModal>

<style>
  :global(.my-props-modal) {
    width: min(94vw, 64rem) !important;
  }

  .editor-step {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .prop-editor-content {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    overflow-y: auto;
    padding-bottom: 0.5rem;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      transparent;
  }

  .prop-error,
  .legacy-props {
    margin-inline: 0.5rem;
  }

  .prop-error {
    display: flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem 0.75rem;
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, white);
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    border-radius: 0.75rem;
    font-size: max(0.875rem, var(--font-size-min, 0.875rem));
  }

  .prop-error button {
    min-height: var(--min-touch-target, 44px);
    flex: 0 0 auto;
    padding: 0.55rem 0.85rem;
    color: var(--theme-text, white);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 0.55rem;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  .legacy-props {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
  }

  .legacy-props strong {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: max(0.75rem, var(--font-size-compact, 0.75rem));
  }

  .legacy-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
  }

  .legacy-chip {
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.65rem;
    color: var(--theme-text, white);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 999px;
    cursor: pointer;
    font: inherit;
    font-size: max(0.875rem, var(--font-size-min, 0.875rem));
    font-weight: 650;
  }

  .legacy-preview {
    display: grid;
    width: 1.75rem;
    height: 1.75rem;
    place-items: center;
  }

  .legacy-preview :global(.prop-composition-preview) {
    width: 100%;
    height: 100%;
  }
</style>
