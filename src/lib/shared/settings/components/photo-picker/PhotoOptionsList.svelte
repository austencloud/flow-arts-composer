<!--
  PhotoOptionsList.svelte

  The "Choose Photo" options: Upload, Google, Facebook.
  Shows the user's current avatar and available photo sources.
-->
<script lang="ts">
  import RobustAvatar from "$lib/shared/components/avatar/RobustAvatar.svelte";
  import ProfileColorPicker from "./ProfileColorPicker.svelte";
  import type { User } from "firebase/auth";
  import { t } from "$lib/shared/i18n/i18n.svelte";

  interface Props {
    user: User | null;
    providerIds: { googleId?: string; facebookId?: string };
    googlePhotoUrl: string | null;
    saving: boolean;
    errorMessage: string | null;
    onUploadClick: () => void;
    onGoogleClick: () => void;
    onFacebookClick: () => void;
    onDismissError: () => void;
    /** Current profile accent color */
    profileColor?: string;
    /** Called when user picks a new accent color */
    onColorChange?: (color: string) => void;
    /** Whether to use larger modal styling */
    isModal?: boolean;
  }

  let {
    user,
    providerIds,
    googlePhotoUrl,
    saving,
    errorMessage,
    onUploadClick,
    onGoogleClick,
    onFacebookClick,
    onDismissError,
    profileColor = "#8b5cf6",
    onColorChange,
    isModal = false,
  }: Props = $props();

  const hasGoogle = $derived(!!providerIds.googleId);
  const hasFacebook = $derived(!!providerIds.facebookId);
</script>

<div class="photo-options" class:modal-style={isModal}>
  <!-- Current user avatar -->
  <div class="panel-header">
    <div class="avatar-preview-wrapper" style="--ring-accent: {profileColor}">
      <RobustAvatar
        src={user?.photoURL}
        name={user?.displayName || user?.email}
        googleId={providerIds.googleId}
        alt={user?.displayName || t("settings_profile")}
        size="xl"
      />
    </div>
    <h3 class="panel-title">{t("settings_choose_photo")}</h3>
  </div>

  {#if errorMessage}
    <div class="error-banner" role="alert">
      <i class="fas fa-exclamation-circle"></i>
      <span>{errorMessage}</span>
      <button
        class="error-dismiss"
        onclick={onDismissError}
        aria-label={t("settings_dismiss_error")}
      >
        <i class="fas fa-times"></i>
      </button>
    </div>
  {/if}

  <div class="options-list">
    <button class="option-btn" onclick={onUploadClick} disabled={saving}>
      <div class="option-icon upload">
        <i class="fas fa-camera"></i>
      </div>
      <div class="option-text">
        <span class="option-label">{t("settings_upload_photo")}</span>
        <span class="option-desc">{t("settings_choose_from_device")}</span>
      </div>
      <i class="fas fa-chevron-right option-arrow"></i>
    </button>

    {#if hasGoogle}
      <button class="option-btn" onclick={onGoogleClick} disabled={saving}>
        <div class="option-icon google">
          <i class="fab fa-google"></i>
        </div>
        <div class="option-text">
          <span class="option-label">{t("settings_use_google_photo")}</span>
          <span class="option-desc">{t("settings_from_google")}</span>
        </div>
        <div class="option-preview-avatar">
          <RobustAvatar
            src={googlePhotoUrl}
            googleId={providerIds.googleId}
            alt={t("settings_google_profile")}
            size="sm"
          />
        </div>
      </button>
    {/if}

    {#if hasFacebook}
      <button class="option-btn" onclick={onFacebookClick} disabled={saving}>
        <div class="option-icon facebook">
          <i class="fab fa-facebook-f"></i>
        </div>
        <div class="option-text">
          <span class="option-label">{t("settings_use_facebook_photo")}</span>
          <span class="option-desc">{t("settings_from_facebook")}</span>
        </div>
        <img
          src="https://graph.facebook.com/{providerIds.facebookId}/picture?type=small"
          alt={t("settings_facebook_profile")}
          class="option-preview-img"
        />
      </button>
    {/if}
  </div>

  <!-- Profile accent color picker -->
  {#if onColorChange}
    <div class="color-section-divider"></div>
    <ProfileColorPicker selectedColor={profileColor} {onColorChange} {saving} />
  {/if}
</div>

<style>
  .photo-options {
    display: flex;
    flex-direction: column;
  }

  /* Panel Header */
  .panel-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm, 12px);
    margin-bottom: var(--spacing-lg, 20px);
  }

  .panel-title {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    margin: 0;
    color: var(--theme-text-dim);
  }

  /* Avatar Preview */
  .avatar-preview-wrapper {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    border: 3px solid
      var(--ring-accent, var(--theme-stroke-strong, rgba(255, 255, 255, 0.2)));
  }

  .color-section-divider {
    height: 1px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    margin: var(--spacing-sm, 8px) 0;
  }

  .avatar-preview-wrapper :global(.robust-avatar) {
    width: 100% !important;
    height: 100% !important;
  }

  /* Error Banner */
  .error-banner {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 10px);
    padding: var(--spacing-sm, 12px) var(--spacing-md, 16px);
    margin-bottom: var(--spacing-md, 16px);
    background: var(--semantic-error-dim, rgba(239, 68, 68, 0.15));
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    border-radius: var(--radius-md, 10px);
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-sm, 14px);
  }

  .error-banner i:first-child {
    flex-shrink: 0;
  }

  .error-banner span {
    flex: 1;
  }

  .error-dismiss {
    width: 32px;
    height: 32px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--semantic-error, #ef4444);
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s ease;
    margin: -8px -8px -8px 0;
  }

  .error-dismiss:hover {
    opacity: 1;
  }

  /* Options List */
  .options-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 10px);
  }

  .option-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 12px);
    padding: var(--spacing-sm, 12px) var(--spacing-md, 16px);
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 12px);
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    width: 100%;
  }

  .option-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .option-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .option-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm, 8px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-md, 16px);
    flex-shrink: 0;
  }

  .option-icon.upload {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    color: white;
  }
  .option-icon.google {
    background: linear-gradient(135deg, #ea4335, #c1271a);
    color: white;
  }
  .option-icon.facebook {
    background: linear-gradient(135deg, #1877f2, #0d5bd9);
    color: white;
  }

  .option-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .option-label {
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
  }

  .option-desc {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .option-preview-img {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--theme-card-bg);
  }

  .option-preview-avatar {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
  }

  .option-arrow {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-compact, 12px);
  }

  /* Modal-specific overrides */
  .modal-style .avatar-preview-wrapper {
    width: 120px;
    height: 120px;
  }

  .modal-style .panel-header {
    gap: var(--spacing-md, 16px);
    margin-bottom: var(--spacing-xl, 28px);
  }

  .modal-style .options-list {
    gap: var(--spacing-md, 14px);
  }

  .modal-style .option-btn {
    padding: var(--spacing-md, 16px) var(--spacing-lg, 20px);
  }

  .modal-style .option-icon {
    width: 48px;
    height: 48px;
    font-size: var(--font-size-lg, 18px);
  }
</style>
