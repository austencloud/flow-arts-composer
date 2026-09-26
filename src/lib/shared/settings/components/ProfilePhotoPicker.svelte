<script lang="ts">
  import { getProviderIds } from "$lib/shared/auth/services/profile-picture-manager";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import {
    ALL_GRADIENTS,
    THEME_TO_GRADIENT,
  } from "$lib/shared/settings/domain/avatar-gradients";
  import { detectLayout } from "$lib/shared/settings/services/photo-picker-layout-detector";
  import type { PhotoSelection } from "$lib/shared/settings/domain/photo-picker-types";
  import {
    assertProfilePhotoInput,
    getProfilePhotoErrorMessage,
  } from "$lib/shared/auth/services/profile-photo-image";
  import { reportErrorTelemetry } from "$lib/shared/error/services/error-telemetry-reporter";
  import { t } from "$lib/shared/i18n/i18n.svelte";

  import PhotoOptionsList from "$lib/shared/settings/components/photo-picker/PhotoOptionsList.svelte";
  import AvatarGenerator from "$lib/shared/settings/components/photo-picker/AvatarGenerator.svelte";
  import AvatarGeneratorWizard from "$lib/shared/settings/components/photo-picker/AvatarGeneratorWizard.svelte";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onPhotoSelected: (photoData: PhotoSelection) => Promise<void>;
    /** Current profile accent color */
    profileColor?: string;
    /** Called when user picks a new accent color */
    onColorChange?: (color: string) => void;
    /** Persisted Google photo URL from Firestore (survives avatar switches) */
    savedGooglePhotoUrl?: string | null;
  }

  let {
    isOpen = $bindable(),
    onClose,
    onPhotoSelected,
    profileColor,
    onColorChange,
    savedGooglePhotoUrl,
  }: Props = $props();

  let activeTab = $state<"options" | "generate">("options");
  let selectedGradientId = $state<string>("twilight");
  let selectedProp = $state<PropType>(PropType.STAFF);
  let saving = $state(false);
  let errorMessage = $state<string | null>(null);
  let fileInputRef: HTMLInputElement | null = $state(null);
  let initialized = $state(false);

  let wizardRef: AvatarGeneratorWizard | null = $state(null);
  let wizardStep = $state<"style" | "shade" | "prop" | "confirm">("style");

  const user = $derived(authState.user);
  const providerIds = $derived(user ? getProviderIds(user) : {});

  const googlePhotoUrl = $derived.by(() => {
    if (!user) return null;
    const googleProvider = user.providerData.find(
      (p) => p.providerId === "google.com"
    );
    return googleProvider?.photoURL || savedGooglePhotoUrl || null;
  });

  let viewportWidth = $state(
    typeof window !== "undefined" ? window.innerWidth : 800
  );
  let viewportHeight = $state(
    typeof window !== "undefined" ? window.innerHeight : 600
  );

  $effect(() => {
    function handleResize() {
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  const layout = $derived(detectLayout(viewportWidth, viewportHeight));
  const isDesktop = $derived(layout.isDesktop);
  const useWizardMode = $derived(layout.useWizardMode);

  const selectedGradient = $derived(
    ALL_GRADIENTS.find((g) => g.id === selectedGradientId) ?? ALL_GRADIENTS[0]!
  );

  $effect(() => {
    if (initialized) return;

    const settings = getSettings();

    if (settings.backgroundType) {
      const matchingGradientId = THEME_TO_GRADIENT[settings.backgroundType];
      if (matchingGradientId) {
        selectedGradientId = matchingGradientId;
      }
    }

    if (settings.leftPropType) {
      selectedProp = settings.leftPropType;
    }

    initialized = true;
  });

  function handleClose() {
    activeTab = "options";
    wizardStep = "style";
    errorMessage = null;
    onClose();
  }

  function triggerFileUpload() {
    fileInputRef?.click();
  }

  function handleSelectionError(
    error: unknown,
    action: string,
    additionalData?: Record<string, unknown>
  ) {
    errorMessage = getProfilePhotoErrorMessage(error);
    const reportedError =
      error instanceof Error ? error : new Error(String(error));
    void reportErrorTelemetry({
      message: "Profile photo update failed",
      technicalDetails: reportedError.message,
      error: reportedError,
      severity: "warning",
      context: {
        module: "settings",
        tab: "profile",
        action,
        ...(additionalData ? { additionalData } : {}),
      },
    });
  }

  async function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      assertProfilePhotoInput(file);
    } catch (error) {
      errorMessage = getProfilePhotoErrorMessage(error);
      input.value = "";
      return;
    }

    saving = true;
    errorMessage = null;
    try {
      await onPhotoSelected({ type: "upload", file });
      handleClose();
    } catch (error) {
      handleSelectionError(error, "upload-profile-photo", {
        fileType: file.type,
        fileBytes: file.size,
      });
    } finally {
      saving = false;
      input.value = "";
    }
  }

  async function useGooglePhoto() {
    if (!googlePhotoUrl) return;
    saving = true;
    errorMessage = null;
    try {
      await onPhotoSelected({ type: "google", url: googlePhotoUrl });
      handleClose();
    } catch (error) {
      handleSelectionError(error, "use-google-profile-photo");
    } finally {
      saving = false;
    }
  }

  async function useFacebookPhoto() {
    if (!providerIds.facebookId) return;
    saving = true;
    errorMessage = null;
    try {
      const url = `https://graph.facebook.com/${providerIds.facebookId}/picture?type=large`;
      await onPhotoSelected({ type: "facebook", url });
      handleClose();
    } catch (error) {
      handleSelectionError(error, "use-facebook-profile-photo");
    } finally {
      saving = false;
    }
  }

  async function useGeneratedAvatar() {
    saving = true;
    errorMessage = null;
    try {
      await onPhotoSelected({
        type: "generated",
        generatedData: {
          gradientId: selectedGradient.id,
          gradient: selectedGradient.gradient,
          propType: selectedProp,
        },
      });
      handleClose();
    } catch (error) {
      handleSelectionError(error, "generate-profile-photo");
    } finally {
      saving = false;
    }
  }

  function handleGradientChange(gradientId: string) {
    selectedGradientId = gradientId;
  }

  function handlePropChange(prop: PropType) {
    selectedProp = prop;
  }

  function handleWizardBack() {
    if (wizardStep === "style") {
      activeTab = "options";
    }
  }

  $effect(() => {
    if (wizardRef) {
      wizardStep = wizardRef.getStep();
    }
  });
</script>

{#if isDesktop}
  <BaseModal
    open={isOpen}
    onclose={handleClose}
    size="fit"
    labelledBy="photo-picker-title"
    class="profile-photo-modal"
  >
    <div class="modal-layout tabbed-modal">
      <header class="modal-header">
        <h2 id="photo-picker-title">{t("settings_profile_photo")}</h2>
        <button
          class="close-btn"
          onclick={handleClose}
          aria-label={t("common_close")}
        >
          <i class="fas fa-times"></i>
        </button>
      </header>

      <div class="modal-tabbed-body">
        {#if activeTab === "options"}
          <PhotoOptionsList
            {user}
            {providerIds}
            {googlePhotoUrl}
            {saving}
            {errorMessage}
            onUploadClick={triggerFileUpload}
            onGoogleClick={useGooglePhoto}
            onFacebookClick={useFacebookPhoto}
            onDismissError={() => (errorMessage = null)}
            {profileColor}
            {onColorChange}
            isModal
          />
        {:else}
          <AvatarGenerator
            {selectedGradientId}
            {selectedProp}
            {saving}
            onGradientChange={handleGradientChange}
            onPropChange={handlePropChange}
            onSave={useGeneratedAvatar}
            compact
          />
        {/if}
      </div>

      <div class="modal-tab-switcher">
        <button
          class="tab-btn"
          class:active={activeTab === "options"}
          onclick={() => (activeTab = "options")}
        >
          <i class="fas fa-image"></i>
          <span>{t("settings_choose_photo")}</span>
        </button>
        <button
          class="tab-btn"
          class:active={activeTab === "generate"}
          onclick={() => (activeTab = "generate")}
        >
          <i class="fas fa-magic"></i>
          <span>{t("settings_create_avatar")}</span>
        </button>
      </div>
    </div>
  </BaseModal>
{:else}
  <Drawer
    {isOpen}
    placement="bottom"
    respectLayoutMode={false}
    onclose={handleClose}
    ariaLabel={t("settings_change_profile_photo")}
  >
    <div class="drawer-layout">
      <header class="drawer-header">
        {#if useWizardMode && activeTab === "generate"}
          <button
            class="back-btn"
            onclick={() => wizardRef?.goBack()}
            aria-label={t("common_back")}
          >
            <i class="fas fa-arrow-left"></i>
          </button>
          <h2 id="photo-picker-title">
            {#if wizardStep === "style"}{t("settings_pick_style")}
            {:else if wizardStep === "shade"}{t("settings_pick_shade")}
            {:else if wizardStep === "prop"}{t("settings_pick_prop")}
            {:else}{t("settings_confirm")}
            {/if}
          </h2>
        {:else}
          <h2 id="photo-picker-title">{t("settings_profile_photo")}</h2>
        {/if}
        <button
          class="close-btn"
          onclick={handleClose}
          aria-label={t("common_close")}
        >
          <i class="fas fa-times"></i>
        </button>
      </header>

      <div class="drawer-body">
        {#if activeTab === "options"}
          <PhotoOptionsList
            {user}
            {providerIds}
            {googlePhotoUrl}
            {saving}
            {errorMessage}
            onUploadClick={triggerFileUpload}
            onGoogleClick={useGooglePhoto}
            onFacebookClick={useFacebookPhoto}
            onDismissError={() => (errorMessage = null)}
            {profileColor}
            {onColorChange}
          />
        {:else if useWizardMode}
          <AvatarGeneratorWizard
            bind:this={wizardRef}
            {selectedGradientId}
            {selectedProp}
            {saving}
            onGradientChange={handleGradientChange}
            onPropChange={handlePropChange}
            onSave={useGeneratedAvatar}
            onBack={handleWizardBack}
          />
        {:else}
          <AvatarGenerator
            {selectedGradientId}
            {selectedProp}
            {saving}
            onGradientChange={handleGradientChange}
            onPropChange={handlePropChange}
            onSave={useGeneratedAvatar}
          />
        {/if}
      </div>

      {#if !useWizardMode || activeTab === "options"}
        <div class="tab-switcher">
          <button
            class="tab-btn"
            class:active={activeTab === "options"}
            onclick={() => (activeTab = "options")}
          >
            <i class="fas fa-image"></i>
            <span>{t("settings_choose_photo")}</span>
          </button>
          <button
            class="tab-btn"
            class:active={activeTab === "generate"}
            onclick={() => {
              activeTab = "generate";
              wizardStep = "style";
            }}
          >
            <i class="fas fa-magic"></i>
            <span>{t("settings_create_avatar")}</span>
          </button>
        </div>
      {/if}
    </div>
  </Drawer>
{/if}

<input
  type="file"
  accept="image/*"
  aria-label={t("settings_choose_profile_photo")}
  onchange={handleFileSelected}
  bind:this={fileInputRef}
  class="sr-only"
/>

<style>
  .modal-layout {
    display: flex;
    flex-direction: column;
    min-height: 0;
    color: var(--theme-text, #ffffff);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--modal-padding, 24px);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .modal-header h2 {
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    margin: 0;
  }

  .tabbed-modal .modal-tabbed-body {
    padding: var(--modal-padding, 24px);
    min-height: 0;
  }

  .modal-tab-switcher {
    display: flex;
    justify-content: center;
    padding: var(--spacing-md, 16px) var(--modal-padding, 24px);
    gap: var(--spacing-sm, 8px);
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .modal-tab-switcher .tab-btn {
    flex: 0 1 auto;
    min-width: 160px;
    max-width: 240px;
  }

  .drawer-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--theme-text, #ffffff);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md, 16px) var(--spacing-lg, 20px);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .drawer-header h2 {
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    margin: 0;
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md, 16px);
    container-type: inline-size;
    container-name: drawer-content;
  }

  .tab-switcher {
    display: flex;
    padding: var(--spacing-sm, 12px) var(--spacing-md, 16px);
    gap: var(--spacing-sm, 8px);
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .close-btn {
    width: 40px;
    height: 40px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .back-btn {
    width: 40px;
    height: 40px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    border-radius: 50%;
    background: transparent;
    border: none;
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease;
  }

  .back-btn:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
  }

  .tab-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    padding: var(--spacing-sm, 10px);
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 10px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 13px);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
  }

  .tab-btn.active {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
    color: white;
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
</style>
