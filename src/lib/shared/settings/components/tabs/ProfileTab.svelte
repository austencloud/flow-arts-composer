<!-- Account settings: identity, sign-in methods, and security. -->
<script module lang="ts">
  // The account details this session last loaded. Coming back to Account
  // draws the username, pronouns and color at once and refreshes quietly,
  // instead of popping them in when Firestore answers.
  let accountDetailsCache: {
    userId: string;
    pronouns: string;
    username: string;
    profileColor: string;
    googlePhotoUrl: string | null;
    instagramLinked: boolean;
  } | null = null;
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { doc, getDoc } from "firebase/firestore";
  import { updateProfile, type User } from "firebase/auth";

  import { getUserDocumentManager } from "#lib/shared/auth/get-user-document-manager.js";
  import {
    deletePreviousStoredProfilePhoto,
    generateAndUploadAvatar,
    uploadProfilePhoto,
  } from "#lib/shared/auth/services/profile-picture-manager.js";
  import { ProfilePhotoError } from "#lib/shared/auth/services/profile-photo-image.js";
  import { getAccountManager } from "#lib/shared/auth/get-account-manager.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { signInWithFacebook } from "#lib/shared/auth/services/authenticator.js";
  import { trackAuthProviderResult } from "#lib/shared/analytics/auth-events.js";
  import { recordAuthSubmission } from "#lib/shared/auth/services/auth-analytics-bridge.js";
  import {
    authState,
    refreshUser,
  } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
  import { hasInstagramAccount } from "#lib/shared/auth/services/instagram-auth.js";
  import { knownAccountProfile } from "#lib/shared/auth/state/account-profile-snapshot.js";
  import {
    userPreviewState,
    loadPreviewSection,
    isSectionLoaded,
    type PreviewUserProfile,
  } from "#lib/shared/debug/state/user-preview-state.svelte.js";
  import {
    createProfileSettingsState,
    setProfileSettingsContext,
  } from "#lib/shared/navigation/state/profile-settings-context.svelte.js";
  import ConnectedAccounts from "#lib/shared/navigation/components/profile-settings/ConnectedAccounts.svelte";
  import ConnectedAccountsPreview from "#lib/shared/navigation/components/profile-settings/ConnectedAccountsPreview.svelte";
  import AccountSettingsSection from "#lib/shared/navigation/components/profile-settings/AccountSettingsSection.svelte";
  import AccountValueRow from "#lib/shared/navigation/components/profile-settings/AccountValueRow.svelte";
  import PasswordChangeForm from "#lib/shared/navigation/components/profile-settings/PasswordChangeForm.svelte";
  import DangerZone from "#lib/shared/navigation/components/profile-settings/DangerZone.svelte";
  import ProfileHeroSection from "./profile/ProfileHeroSection.svelte";
  import AuthPrompt from "./profile/AuthPrompt.svelte";
  import ProfilePhotoPicker from "../ProfilePhotoPicker.svelte";
  import SettingsSectionHeader from "../SettingsSectionHeader.svelte";
  import MyPropsCard from "#lib/shared/navigation/components/account/MyPropsCard.svelte";
  import AccountSetupChecklist from "#lib/shared/onboarding/components/account-setup/AccountSetupChecklist.svelte";
  import { tryGetAccountSetupContext } from "#lib/shared/onboarding/context/account-setup-context.js";
  import {
    ACCOUNT_SETUP_SETTINGS_DESTINATIONS,
    type AccountSetupTaskId,
  } from "#lib/shared/onboarding/state/account-setup-state.svelte.js";
  import {
    createPropPreferenceState,
    type PropPreferenceState,
  } from "#lib/shared/community/state/prop-preference-state.svelte.js";
  import { myPropsDrawerState } from "#lib/shared/navigation/components/account/my-props-drawer-state.svelte.js";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";

  import type {
    AccountManager,
    DeleteReauth,
  } from "#lib/shared/auth/services/account-manager.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type { PhotoSelection } from "#lib/shared/settings/domain/photo-picker-types.js";

  interface Props {
    currentSettings?: unknown;
    onSettingUpdate?: (event: { key: string; value: unknown }) => void;
  }

  let {
    currentSettings: _currentSettings,
    onSettingUpdate: _onSettingUpdate,
  }: Props = $props();

  const profileState = createProfileSettingsState();
  setProfileSettingsContext(profileState);

  const accountSetupState = tryGetAccountSetupContext();
  const showAccountSetup = $derived(
    accountSetupState !== null &&
      !accountSetupState.loading &&
      accountSetupState.available &&
      !accountSetupState.isComplete
  );
  const showAccountSetupUnavailable = $derived(
    accountSetupState !== null &&
      !accountSetupState.loading &&
      !accountSetupState.available
  );

  let setupPropState = $state<PropPreferenceState | null>(null);
  let setupPropUserId = $state<string | null>(null);
  let displayNameEditRequest = $state(0);
  let hapticService = $state<HapticFeedback | null>(null);
  let accountManager = $state<AccountManager | null>(null);
  // On a first open, start from what sign-in read; the load below still
  // refreshes it and adds the Instagram link.
  const signInProfile = knownAccountProfile(authState.user?.uid);
  const knownDetails =
    accountDetailsCache?.userId === authState.user?.uid
      ? accountDetailsCache
      : signInProfile && {
          ...signInProfile,
          profileColor: signInProfile.profileColor ?? "#8b5cf6",
          instagramLinked: false,
        };
  let userPronouns = $state(knownDetails?.pronouns ?? "");
  let userUsername = $state(knownDetails?.username ?? "");
  let profileColor = $state(knownDetails?.profileColor ?? "#8b5cf6");
  let savedGooglePhotoUrl = $state<string | null>(
    knownDetails?.googlePhotoUrl ?? null
  );
  let instagramLinked = $state(knownDetails?.instagramLinked ?? false);
  let detailsLoadedFor = $state<string | null>(knownDetails?.userId ?? null);
  let manageSignInMethods = $state(false);
  let loadedAccountUserId = $state<string | null>(null);
  let setupWasIncomplete = $state(false);
  let showSetupCompletion = $state(false);

  const PHOTO_PICKER_KEY = "tka_photo_picker_open";
  let showPhotoPicker = $state(
    typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(PHOTO_PICKER_KEY) === "1"
  );

  const isPreviewMode = $derived(
    userPreviewState.isActive && userPreviewState.data.profile !== null
  );
  const previewAuthData = $derived(userPreviewState.data.authData);
  const isLoadingAuthData = $derived(
    userPreviewState.loadingSection === "authData"
  );
  const authDataLoaded = $derived(isSectionLoaded("authData"));
  const connectedProviderIds = $derived([
    ...(authState.user?.providerData.map((provider) => provider.providerId) ??
      []),
    ...(instagramLinked ? ["instagram.com"] : []),
  ]);

  $effect(() => {
    const userId = authState.isFullAccount
      ? (authState.user?.uid ?? null)
      : null;
    if (userId === setupPropUserId) return;

    setupPropUserId = userId;
    setupPropState = userId ? createPropPreferenceState(userId) : null;
  });

  $effect(() => {
    if (
      !accountSetupState ||
      accountSetupState.loading ||
      !accountSetupState.available
    ) {
      return;
    }

    if (!accountSetupState.isComplete) {
      setupWasIncomplete = true;
      showSetupCompletion = false;
      return;
    }

    if (setupWasIncomplete) {
      setupWasIncomplete = false;
      showSetupCompletion = true;
    }
  });

  $effect(() => {
    if (isPreviewMode && !authDataLoaded && !isLoadingAuthData) {
      void loadPreviewSection("authData");
    }
  });

  $effect(() => {
    const user = authState.isFullAccount ? authState.user : null;
    if (!user) {
      loadedAccountUserId = null;
      return;
    }
    if (loadedAccountUserId === user.uid) return;

    loadedAccountUserId = user.uid;
    void loadAccountDetails(user);
  });

  // Keeps the cache current with loads and with edits made on this tab.
  $effect(() => {
    if (!detailsLoadedFor || detailsLoadedFor !== authState.user?.uid) return;
    accountDetailsCache = {
      userId: detailsLoadedFor,
      pronouns: userPronouns,
      username: userUsername,
      profileColor,
      googlePhotoUrl: savedGooglePhotoUrl,
      instagramLinked,
    };
  });

  onMount(() => {
    hapticService = getHapticFeedback();
    accountManager = getAccountManager();
  });

  async function loadAccountDetails(user: User) {
    try {
      const firestore = await getFirestoreInstance();
      const [isInstagramLinked, userDoc, privateDoc] = await Promise.all([
        hasInstagramAccount(user).catch(() => false),
        getDoc(doc(firestore, "users", user.uid)),
        getDoc(doc(firestore, "userPrivateProfiles", user.uid)),
      ]);

      if (authState.user?.uid !== user.uid) return;
      instagramLinked = isInstagramLinked;

      if (userDoc.exists()) {
        const data = userDoc.data();
        userPronouns = data?.pronouns || "";
        userUsername = data?.username || "";
        if (data?.profileColor) profileColor = data.profileColor;
      }
      if (privateDoc.exists()) {
        savedGooglePhotoUrl = privateDoc.data()?.googlePhotoURL ?? null;
      }
      detailsLoadedFor = user.uid;
    } catch (error) {
      console.error("Failed to load account details:", error);
    }
  }

  function createPreviewUser(profile: PreviewUserProfile): User {
    return {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName,
      photoURL: profile.photoURL,
      emailVerified: false,
      isAnonymous: false,
      metadata: {},
      providerData: [],
      refreshToken: "",
      tenantId: null,
      phoneNumber: null,
      providerId: "firebase",
      delete: async () => {},
      getIdToken: async () => "",
      getIdTokenResult: async () => ({}) as never,
      reload: async () => {},
      toJSON: () => ({}),
    } as User;
  }

  async function handleSignOut() {
    hapticService?.trigger("selection");
    try {
      await authState.signOut();
    } catch (error) {
      console.error("Sign out failed:", error);
      toast.error(t("settings_sign_out_failed"));
    }
  }

  async function handleFacebookAuth() {
    hapticService?.trigger("selection");
    recordAuthSubmission("facebook");
    try {
      await signInWithFacebook();
      trackAuthProviderResult("facebook", "completed");
    } catch (error) {
      trackAuthProviderResult(
        "facebook",
        "failed",
        (error as { code?: string })?.code ?? "unknown"
      );
      console.error("Facebook sign-in failed:", error);
      hapticService?.trigger("error");
    }
  }

  async function handleChangePassword() {
    if (!accountManager || profileState.ui.saving) return;
    profileState.ui.saving = true;

    try {
      await accountManager.changePassword(
        profileState.password.current,
        profileState.password.new
      );
    } finally {
      profileState.ui.saving = false;
    }
  }

  async function handleDeleteAccount(reauth: DeleteReauth, reason?: string) {
    if (!accountManager) return;
    await accountManager.deleteAccount(reauth, reason);
  }

  function handleOpenPhotoPicker() {
    hapticService?.trigger("selection");
    showPhotoPicker = true;
    sessionStorage.setItem(PHOTO_PICKER_KEY, "1");
  }

  function handleAccountSetupTask(taskId: AccountSetupTaskId) {
    hapticService?.trigger("selection");

    switch (taskId) {
      case "display-name":
        displayNameEditRequest += 1;
        break;
      case "profile-photo":
        handleOpenPhotoPicker();
        break;
      case "props":
        handleOpenPropEditor(false);
        break;
      case "theme":
        void handleModuleChange(
          "settings",
          ACCOUNT_SETUP_SETTINGS_DESTINATIONS.theme
        );
        break;
    }
  }

  function handleOpenPropEditor(triggerFeedback = true) {
    if (triggerFeedback) hapticService?.trigger("selection");
    if (setupPropState) {
      myPropsDrawerState.open(setupPropState);
      return;
    }

    toast.info(t("settings_props_still_loading"));
  }

  async function handleColorChange(color: string) {
    const previousColor = profileColor;
    profileColor = color;

    const user = authState.user;
    if (!user) return;

    try {
      await getUserDocumentManager().updateProfileColor(user.uid, color);
    } catch (error) {
      console.error("Failed to save profile color:", error);
      profileColor = previousColor;
      toast.error(t("settings_profile_color_save_failed"));
    }
  }

  async function handlePhotoSelected(selection: PhotoSelection) {
    const user = authState.user;
    if (!user) {
      throw new ProfilePhotoError(
        "signed-out",
        t("settings_photo_sign_in_again")
      );
    }

    hapticService?.trigger("selection");
    const userDocumentManager = getUserDocumentManager();
    const previousPhotoURL = user.photoURL;
    let newPhotoURL: string | null = null;

    switch (selection.type) {
      case "upload":
        if (selection.file) {
          newPhotoURL = await uploadProfilePhoto(user, selection.file);
        }
        break;
      case "google":
      case "facebook":
        newPhotoURL = selection.url ?? null;
        break;
      case "generated":
        if (selection.generatedData) {
          newPhotoURL = await generateAndUploadAvatar(
            user,
            selection.generatedData
          );
        }
        break;
    }

    if (newPhotoURL) {
      await updateProfile(user, { photoURL: newPhotoURL });
      await userDocumentManager.updatePhotoURL(user, newPhotoURL);
      await refreshUser();
      hapticService?.trigger("success");
      void deletePreviousStoredProfilePhoto(
        user.uid,
        previousPhotoURL,
        newPhotoURL
      );
    }
  }
</script>

<div class="profile-tab">
  {#if isPreviewMode && userPreviewState.data.profile}
    {@const previewProfile = userPreviewState.data.profile}
    <div class="profile-content">
      <div class="preview-banner">
        <i class="fas fa-eye" aria-hidden="true"></i>
        <span>
          {t("settings_viewing_as")}
          <strong
            >{previewProfile.displayName ||
              previewProfile.email ||
              t("settings_user")}</strong
          >
        </span>
      </div>

      <div class="account-workspace">
        <div class="identity-pane">
          <ProfileHeroSection
            user={createPreviewUser(previewProfile)}
            username={previewProfile.username}
            onSignOut={() => {}}
            disabled={true}
          />
        </div>

        <section class="workspace-section personal-section">
          <SettingsSectionHeader
            icon="fas fa-user"
            title={t("profile_personal_details")}
            description={t("profile_preview_appearance")}
          />
          <div class="section-body value-list">
            <AccountValueRow
              label={t("profile_display_name")}
              value={previewProfile.displayName || t("profile_not_set")}
              empty={!previewProfile.displayName}
            />
            <AccountValueRow
              label={t("profile_username")}
              value={previewProfile.username
                ? `@${previewProfile.username}`
                : t("profile_not_set")}
              empty={!previewProfile.username}
            />
            <AccountValueRow
              label={t("auth_email")}
              value={previewProfile.email || t("profile_not_set")}
              empty={!previewProfile.email}
            />
          </div>
        </section>

        <div class="access-pane">
          <section class="workspace-group sign-in-section">
            <SettingsSectionHeader
              icon="fas fa-link"
              title={t("profile_sign_in_methods")}
              description={t("profile_connected_providers")}
            />
            <div class="section-body">
              <ConnectedAccountsPreview
                providers={previewAuthData?.providers ?? []}
                emailVerified={previewAuthData?.emailVerified ?? false}
                loading={isLoadingAuthData}
              />
            </div>
          </section>

          <section class="workspace-group security-section">
            <SettingsSectionHeader
              icon="fas fa-shield-halved"
              title={t("profile_security")}
              description={t("profile_security_preview_desc")}
            />
            <div class="section-body value-list">
              <AccountValueRow
                label={t("auth_password")}
                value={previewAuthData?.providers.some(
                  (provider) => provider.providerId === "password"
                )
                  ? t("profile_password_enabled")
                  : t("profile_no_password")}
              />
              {#if previewAuthData && !previewAuthData.emailVerified}
                <p class="security-note warning">
                  <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                  {t("profile_email_unverified")}
                </p>
              {/if}
              <p class="security-note">
                {t("profile_preview_actions_unavailable")}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  {:else if authState.isFullAccount && authState.user}
    <div class="profile-content">
      {#if showAccountSetup && accountSetupState}
        <div class="setup-notice" transition:growFade>
          <AccountSetupChecklist
            state={accountSetupState}
            onTaskAction={handleAccountSetupTask}
            variant="prompt"
          />
        </div>
      {:else if showSetupCompletion}
        <div class="setup-notice" transition:growFade>
          <section class="setup-complete" role="status" aria-live="polite">
            <span class="setup-complete-icon" aria-hidden="true">
              <i class="fas fa-check"></i>
            </span>
            <span class="setup-complete-copy">
              <strong>{t("profile_setup_complete")}</strong>
              <span>{t("profile_setup_saved")}</span>
            </span>
            <button
              type="button"
              class="dismiss-completion"
              onclick={() => (showSetupCompletion = false)}
              aria-label={t("profile_dismiss_setup_confirmation")}
            >
              <i class="fas fa-xmark" aria-hidden="true"></i>
            </button>
          </section>
        </div>
      {:else if showAccountSetupUnavailable && accountSetupState}
        <div class="setup-notice" transition:growFade>
          <section class="setup-unavailable" role="status">
            <span>
              <strong>{t("profile_setup_status_unavailable")}</strong>
              {t("profile_account_still_available")}
            </span>
            <PanelButton
              variant="secondary"
              onclick={() => void accountSetupState.loadForCurrentUser()}
            >
              {t("action_retry")}
            </PanelButton>
          </section>
        </div>
      {/if}

      <div class="account-workspace">
        <div class="identity-pane">
          <ProfileHeroSection
            user={authState.user}
            username={userUsername}
            pronouns={userPronouns}
            {profileColor}
            onSignOut={handleSignOut}
            onAvatarClick={handleOpenPhotoPicker}
          />
          <div class="identity-props">
            <MyPropsCard
              propState={setupPropState}
              onOpenPropEditor={handleOpenPropEditor}
            />
          </div>
        </div>

        <section
          id="profile-account-settings"
          class="workspace-section personal-section"
        >
          <SettingsSectionHeader
            icon="fas fa-user"
            title={t("profile_personal_details")}
            description={t("profile_personal_details_desc")}
          />
          <div class="section-body">
            <AccountSettingsSection
              user={authState.user}
              {hapticService}
              onPronounsChanged={(pronouns) => (userPronouns = pronouns)}
              onUsernameChanged={(username) => (userUsername = username)}
              {displayNameEditRequest}
            />
          </div>
        </section>

        <div class="access-pane">
          <section class="workspace-group sign-in-section">
            <SettingsSectionHeader
              icon="fas fa-link"
              title={t("profile_sign_in_methods")}
              description={t("profile_sign_in_methods_desc")}
            >
              {#snippet action()}
                <PanelButton
                  variant="quiet"
                  onclick={() => (manageSignInMethods = !manageSignInMethods)}
                  ariaLabel={manageSignInMethods
                    ? t("profile_finish_manage_sign_in")
                    : t("profile_manage_sign_in")}
                >
                  <i
                    class={manageSignInMethods ? "fas fa-check" : "fas fa-gear"}
                    aria-hidden="true"
                  ></i>
                  <span
                    >{manageSignInMethods
                      ? t("settings_presets_done")
                      : t("settings_presets_manage")}</span
                  >
                </PanelButton>
              {/snippet}
            </SettingsSectionHeader>
            <div class="section-body">
              <ConnectedAccounts
                managing={manageSignInMethods}
                onInstagramChange={(linked) => (instagramLinked = linked)}
              />
            </div>
          </section>

          <section class="workspace-group security-section">
            <SettingsSectionHeader
              icon="fas fa-shield-halved"
              title={t("profile_security")}
              description={t("profile_security_desc")}
            />
            <div class="section-body security-body">
              {#if profileState.hasPasswordProvider(authState.user)}
                <PasswordChangeForm
                  onChangePassword={handleChangePassword}
                  {hapticService}
                />
              {/if}
              <DangerZone
                onDeleteAccount={handleDeleteAccount}
                {hapticService}
                isAdmin={authState.isAdmin}
                userIdentifier={authState.user.displayName ||
                  authState.user.email ||
                  ""}
                providerIds={connectedProviderIds}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  {:else}
    <AuthPrompt onFacebookAuth={handleFacebookAuth} />
  {/if}
</div>

<ProfilePhotoPicker
  bind:isOpen={showPhotoPicker}
  onClose={() => {
    showPhotoPicker = false;
    sessionStorage.removeItem(PHOTO_PICKER_KEY);
  }}
  onPhotoSelected={handlePhotoSelected}
  {profileColor}
  onColorChange={handleColorChange}
  {savedGooglePhotoUrl}
/>

<style>
  .profile-tab {
    container: profile-tab / inline-size;
    display: grid;
    flex: 1 1 auto;
    align-content: safe center;
    width: 100%;
    min-height: 100%;
    min-width: 0;
    padding: clamp(0.75em, 1.4cqi, 1.75em) clamp(0.75em, 2cqi, 3em);
    overflow: visible;
  }

  .profile-content {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
  }

  /* The notice owns the space below it, so dismissing it can ease that space
     closed with the notice instead of leaving a gap to snap shut afterwards. */
  .setup-notice {
    padding-bottom: clamp(0.75em, 1cqi, 1em);
  }

  .setup-complete,
  .setup-unavailable {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: var(--min-touch-target, 48px);
    padding: 0.75rem 1rem;
    border-radius: 0.85rem;
    font-size: max(0.875rem, var(--font-size-min));
  }

  .setup-complete {
    color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 58%,
      var(--theme-text)
    );
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 10%,
      var(--theme-panel-bg)
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-success, #22c55e) 28%, transparent);
  }

  .setup-complete-icon {
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    flex: 0 0 auto;
    place-items: center;
    color: var(--semantic-success, #22c55e);
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 14%,
      transparent
    );
    border-radius: 50%;
  }

  .setup-complete-copy {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.15rem;
  }

  .setup-complete-copy strong {
    color: var(--theme-text);
  }

  .setup-complete-copy span {
    color: var(--theme-text-dim);
    line-height: 1.35;
  }

  .dismiss-completion {
    display: grid;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    flex: 0 0 auto;
    place-items: center;
    color: var(--theme-text-dim);
    background: color-mix(in srgb, var(--theme-text) 5%, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.65rem;
    cursor: pointer;
  }

  .dismiss-completion:hover {
    color: var(--theme-text);
    background: color-mix(in srgb, var(--theme-text) 9%, transparent);
  }

  .dismiss-completion:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .setup-unavailable {
    justify-content: space-between;
    color: var(--theme-text-dim);
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
  }

  .setup-unavailable strong {
    color: var(--theme-text);
  }

  .account-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 1.25em;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(0, 0, 0, 0.88)) 14%,
      #070b10 86%
    );
    box-shadow: var(--theme-panel-shadow, 0 1rem 3rem rgba(0, 0, 0, 0.35));
    isolation: isolate;
  }

  :global(html[data-theme-luminance="bright"]) .account-workspace {
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(255, 255, 255, 0.88)) 14%,
      #f6f7f9 86%
    );
  }

  .identity-pane,
  .workspace-section,
  .access-pane,
  .workspace-group {
    min-width: 0;
  }

  .identity-pane {
    display: flex;
    flex-direction: column;
    padding: clamp(1.25em, 2cqi, 2.25em);
    background: linear-gradient(
      155deg,
      color-mix(in srgb, var(--theme-accent) 12%, transparent),
      transparent 58%
    );
  }

  .identity-props {
    margin-top: 1.25em;
    padding-top: 1.25em;
    border-top: 1px solid var(--theme-stroke);
  }

  .workspace-section {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-text) 2%, transparent);
  }

  .access-pane {
    display: grid;
    align-content: start;
    border-top: 1px solid var(--theme-stroke);
  }

  .workspace-group {
    display: flex;
    flex-direction: column;
  }

  .workspace-group + .workspace-group {
    border-top: 1px solid var(--theme-stroke);
  }

  .section-body {
    min-width: 0;
    padding: 0.45em 1.15em 0.85em;
  }

  .personal-section .section-body {
    display: flex;
    flex: 1 1 auto;
  }

  .personal-section .section-body :global(.account-settings) {
    flex: 1 1 auto;
  }

  .security-body {
    display: flex;
    flex-direction: column;
    gap: 1em;
    padding-top: 1em;
  }

  .security-body :global(.danger-section) {
    margin-top: 0;
  }

  .value-list :global(.account-value-row:last-child) {
    border-bottom: 0;
  }

  .preview-banner {
    display: flex;
    margin-bottom: clamp(0.75em, 1cqi, 1em);
    align-items: center;
    gap: 0.6rem;
    min-height: var(--min-touch-target);
    padding: 0.65rem 0.9rem;
    border: 1px solid color-mix(in srgb, #8b5cf6 45%, transparent);
    border-radius: 0.75rem;
    color: #ddd6fe;
    background: color-mix(in srgb, #8b5cf6 14%, var(--theme-panel-bg));
    font-size: max(0.875rem, var(--font-size-sm));
  }

  .security-note {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.75rem 0 0;
    color: var(--theme-text-dim);
    font-size: max(0.875rem, var(--font-size-min));
    line-height: 1.4;
  }

  .security-note.warning {
    color: var(--semantic-warning);
  }

  /* Two columns that share one seam: profile, flow identity and security on
     the left; personal details and sign-in methods on the right. The middle
     row is flexible, so the shorter column ends early instead of stretching
     the personal rows to match the taller one. */
  @container profile-tab (min-width: 48rem) {
    .account-workspace {
      grid-template-columns: minmax(15rem, 0.78fr) minmax(24rem, 1.22fr);
      grid-template-rows: auto 1fr auto;
    }

    .identity-pane {
      grid-column: 1;
      grid-row: 1 / span 2;
    }

    .personal-section {
      grid-column: 2;
      grid-row: 1;
      border-top: 0;
      border-left: 1px solid var(--theme-stroke);
    }

    .access-pane {
      display: contents;
    }

    .sign-in-section {
      grid-column: 2;
      grid-row: 2 / span 2;
      border-top: 1px solid var(--theme-stroke);
      border-left: 1px solid var(--theme-stroke);
    }

    .security-section {
      grid-column: 1;
      grid-row: 3;
    }
  }

  @container profile-tab (min-width: 75rem) {
    .account-workspace {
      grid-template-columns:
        minmax(18rem, 1fr)
        minmax(26rem, 1.15fr)
        minmax(22rem, 1fr);
      grid-template-rows: auto;
      min-height: clamp(30em, 50vh, 42em);
    }

    .identity-pane {
      grid-column: 1;
      grid-row: 1;
    }

    .personal-section {
      grid-column: 2;
      grid-row: 1;
    }

    .access-pane {
      display: grid;
      grid-column: 3;
      grid-row: 1;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto;
      border-top: 0;
      border-left: 1px solid var(--theme-stroke);
    }

    .sign-in-section,
    .security-section {
      grid-column: auto;
      grid-row: auto;
    }

    .sign-in-section {
      border-top: 0;
      border-left: 0;
    }
  }

  @container profile-tab (min-width: 105rem) {
    .identity-pane {
      padding: 2.5em;
    }

    .section-body {
      padding-inline: 1.35em;
    }

    .personal-section .section-body {
      padding-block: 0.8em 1em;
    }
  }

  @container profile-tab (max-width: 32rem) {
    .profile-tab {
      align-content: start;
      padding-inline: 0.65rem;
    }

    .section-body {
      padding-inline: 0.85rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .profile-tab {
      transition: none;
    }
  }

  @media (prefers-contrast: high) {
    .account-workspace,
    .preview-banner {
      border-width: 2px;
    }
  }
</style>
