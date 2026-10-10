<script lang="ts">
  /**
   * ProfileAdminSection - Admin controls for user profile
   *
   * Privileged actions are sent through the authoritative admin endpoint.
   */

  import { auth } from "#lib/shared/auth/firebase.js";
  import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
  import type { AdminUserProfile } from "../domain/admin-user-profile";
  import AdminAccountControls from "./AdminAccountControls.svelte";
  import AdminConfirmationModal from "./AdminConfirmationModal.svelte";
  import AdminEditNameModal from "./AdminEditNameModal.svelte";
  import AdminProfileMetadataEditor from "./AdminProfileMetadataEditor.svelte";
  import { untrack } from "svelte";

  interface Props {
    userProfile: AdminUserProfile;
    contributorActive: boolean;
    onUserUpdated?: (updates: Partial<AdminUserProfile>) => void;
    onUserDeleted?: () => void;
  }

  let { userProfile, contributorActive, onUserUpdated, onUserDeleted }: Props =
    $props();

  // State
  let isActionPending = $state(false);
  let actionError = $state<string | null>(null);
  let confirmAction = $state<{
    type: "disable" | "delete";
    message: string;
  } | null>(null);
  let editNameOpen = $state(false);

  function closeConfirmModal() {
    confirmAction = null;
  }

  function closeEditNameModal() {
    editNameOpen = false;
  }

  // Contributor state
  let isContributor = $state(false);
  let isTogglingContributor = $state(false);
  let syncedUserId = "";
  let requestGeneration = 0;
  const activeRequestControllers = new Set<AbortController>();
  let controlsPending = $derived(isActionPending || isTogglingContributor);

  interface RequestContext {
    userId: string;
    generation: number;
  }

  function abortActiveRequests() {
    for (const controller of activeRequestControllers) controller.abort();
    activeRequestControllers.clear();
  }

  function currentRequestContext(): RequestContext {
    return { userId: userProfile.id, generation: requestGeneration };
  }

  function isCurrentRequest(context: RequestContext): boolean {
    return (
      context.generation === requestGeneration &&
      context.userId === userProfile.id
    );
  }

  function isAbortError(cause: unknown): boolean {
    return cause instanceof DOMException && cause.name === "AbortError";
  }

  // Sync local state with prop changes
  $effect(() => {
    const userId = userProfile.id;
    if (userId === syncedUserId) return;
    requestGeneration += 1;
    abortActiveRequests();
    syncedUserId = userId;
    untrack(() => {
      isContributor = contributorActive;
      isActionPending = false;
      isTogglingContributor = false;
      actionError = null;
      confirmAction = null;
      editNameOpen = false;
    });
  });

  $effect(() => abortActiveRequests);

  async function adminRequest(
    userId: string,
    init: RequestInit & { body?: string } = {}
  ): Promise<unknown> {
    const controller = new AbortController();
    activeRequestControllers.add(controller);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Admin session expired");
      const token = await currentUser.getIdToken();
      if (controller.signal.aborted)
        throw new DOMException("Aborted", "AbortError");
      const response = await fetch(
        `/api/admin/user-auth/${encodeURIComponent(userId)}`,
        {
          ...init,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
          },
        }
      );
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          result.message || `Admin action failed (${response.status})`
        );
      return result;
    } finally {
      activeRequestControllers.delete(controller);
    }
  }

  async function mutate(
    userId: string,
    body: Record<string, unknown>
  ): Promise<{
    auth?: {
      disabled: boolean;
      contributor: { active: boolean; id: string | null };
    };
  }> {
    return (await adminRequest(userId, {
      method: "PATCH",
      body: JSON.stringify(body),
    })) as {
      auth?: {
        disabled: boolean;
        contributor: { active: boolean; id: string | null };
      };
    };
  }

  async function toggleContributor() {
    if (isTogglingContributor) return;
    const context = currentRequestContext();
    isTogglingContributor = true;
    actionError = null;

    try {
      const next = !isContributor;
      const result = await mutate(context.userId, {
        action: "contributor",
        active: next,
      });
      if (!isCurrentRequest(context)) return;
      if (!result.auth?.contributor)
        throw new Error("Admin endpoint omitted contributor status");
      isContributor = result.auth.contributor.active;
    } catch (err) {
      if (!isCurrentRequest(context) || isAbortError(err)) return;
      console.error("[ProfileAdminSection] Failed to toggle contributor:", err);
      actionError = "Failed to update contributor status";
    } finally {
      if (isCurrentRequest(context)) isTogglingContributor = false;
    }
  }

  async function changeRole(newRole: UserRole) {
    if (isActionPending || userProfile.role === newRole) return;
    const context = currentRequestContext();

    isActionPending = true;
    actionError = null;

    try {
      await mutate(context.userId, { action: "role", role: newRole });
      if (!isCurrentRequest(context)) return;
      onUserUpdated?.({ role: newRole });
    } catch (err) {
      if (!isCurrentRequest(context) || isAbortError(err)) return;
      console.error("[ProfileAdminSection] Failed to change role:", err);
      actionError = "Failed to update role";
    } finally {
      if (isCurrentRequest(context)) isActionPending = false;
    }
  }

  async function toggleDisabled() {
    if (isActionPending) return;
    const context = currentRequestContext();

    isActionPending = true;
    actionError = null;

    try {
      const currentlyDisabled = userProfile.isDisabled ?? false;
      const result = await mutate(context.userId, {
        action: "disabled",
        disabled: !currentlyDisabled,
      });
      if (!isCurrentRequest(context)) return;
      if (!result.auth || typeof result.auth.disabled !== "boolean") {
        throw new Error("Admin endpoint omitted account status");
      }
      onUserUpdated?.({ isDisabled: result.auth.disabled });
    } catch (err) {
      if (!isCurrentRequest(context) || isAbortError(err)) return;
      console.error("[ProfileAdminSection] Failed to toggle disabled:", err);
      actionError = "Failed to update account status";
    } finally {
      if (isCurrentRequest(context)) {
        isActionPending = false;
        confirmAction = null;
      }
    }
  }

  async function deleteUser() {
    if (isActionPending) return;
    const context = currentRequestContext();

    isActionPending = true;
    actionError = null;

    try {
      await adminRequest(context.userId, { method: "DELETE" });
      if (!isCurrentRequest(context)) return;
      onUserDeleted?.();
    } catch (err) {
      if (!isCurrentRequest(context) || isAbortError(err)) return;
      console.error("[ProfileAdminSection] Failed to delete user:", err);
      actionError = "Failed to delete user";
    } finally {
      if (isCurrentRequest(context)) {
        isActionPending = false;
        confirmAction = null;
      }
    }
  }

  function handleConfirm() {
    if (!confirmAction) return;

    switch (confirmAction.type) {
      case "disable":
        toggleDisabled();
        break;
      case "delete":
        deleteUser();
        break;
    }
  }

  function openEditNameModal() {
    editNameOpen = true;
  }

  async function saveAdminMetadata(update: {
    adminLabel?: string | null;
    adminNotes?: string | null;
  }) {
    const context = currentRequestContext();
    actionError = null;
    try {
      await mutate(context.userId, { action: "profile", ...update });
    } catch (err) {
      if (!isCurrentRequest(context) || isAbortError(err)) return;
      throw err;
    }
    if (!isCurrentRequest(context)) return;
    onUserUpdated?.({
      ...(Object.hasOwn(update, "adminLabel")
        ? { adminLabel: update.adminLabel ?? undefined }
        : {}),
      ...(Object.hasOwn(update, "adminNotes")
        ? { adminNotes: update.adminNotes ?? undefined }
        : {}),
    });
  }

  async function saveDisplayName(value: string) {
    if (isActionPending) return;
    const context = currentRequestContext();

    const newName = value.trim();
    if (!newName || newName === userProfile.displayName) {
      editNameOpen = false;
      return;
    }

    isActionPending = true;
    actionError = null;

    try {
      await mutate(context.userId, {
        action: "profile",
        displayName: newName,
      });
      if (!isCurrentRequest(context)) return;
      onUserUpdated?.({ displayName: newName });
      editNameOpen = false;
    } catch (err) {
      if (!isCurrentRequest(context) || isAbortError(err)) return;
      console.error(
        "[ProfileAdminSection] Failed to update display name:",
        err
      );
      actionError = "Failed to update display name";
    } finally {
      if (isCurrentRequest(context)) isActionPending = false;
    }
  }
</script>

<section class="admin-section" aria-labelledby="admin-controls-title">
  <header class="section-header">
    <div class="title-group">
      <span class="title-icon">
        <i class="fas fa-shield-halved" aria-hidden="true"></i>
      </span>
      <div>
        <h3 id="admin-controls-title" class="section-title">Admin Controls</h3>
        <p>Private context, permissions, and account lifecycle.</p>
      </div>
    </div>
    <div class="status-summary" aria-label="Current administrative state">
      <span class:disabled={userProfile.isDisabled} class="status-chip">
        <i
          class="fas {userProfile.isDisabled ? 'fa-ban' : 'fa-circle-check'}"
          aria-hidden="true"
        ></i>
        {userProfile.isDisabled ? "Disabled" : "Enabled"}
      </span>
      <span class="status-chip role-chip">
        <i class="fas fa-shield" aria-hidden="true"></i>
        {userProfile.role ?? "user"}
      </span>
      {#if isContributor}
        <span class="status-chip contributor-chip">
          <i class="fas fa-star" aria-hidden="true"></i>
          Contributor
        </span>
      {/if}
    </div>
  </header>

  {#if actionError}
    <div class="error-banner" role="alert" aria-live="assertive">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      {actionError}
      <button onclick={() => (actionError = null)} aria-label="Dismiss">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  {/if}

  <div class="admin-grid">
    <section class="admin-card metadata-card" aria-labelledby="metadata-title">
      <div class="card-heading">
        <span class="card-icon"
          ><i class="fas fa-address-card" aria-hidden="true"></i></span
        >
        <div>
          <h4 id="metadata-title">Private context</h4>
          <p>Only administrators can read these fields.</p>
        </div>
      </div>
      <AdminProfileMetadataEditor
        userId={userProfile.id}
        initialLabel={userProfile.adminLabel ?? ""}
        initialNotes={userProfile.adminNotes ?? ""}
        onsave={saveAdminMetadata}
        onerror={(message) => (actionError = message)}
      />
    </section>

    <section class="admin-card account-card" aria-labelledby="account-title">
      <div class="card-heading">
        <span class="card-icon"
          ><i class="fas fa-user-lock" aria-hidden="true"></i></span
        >
        <div>
          <h4 id="account-title">Permissions and actions</h4>
          <p>Changes apply immediately to this account.</p>
        </div>
      </div>
      <AdminAccountControls
        role={userProfile.role ?? "user"}
        disabled={userProfile.isDisabled ?? false}
        contributor={isContributor}
        actionPending={controlsPending}
        contributorPending={controlsPending}
        onchangeRole={changeRole}
        oneditName={openEditNameModal}
        ontoggleContributor={toggleContributor}
        onrequestDisabledChange={() => {
          confirmAction = {
            type: "disable",
            message: userProfile.isDisabled
              ? `Enable ${userProfile.displayName}'s account?`
              : `Disable ${userProfile.displayName}'s account? They won't be able to log in.`,
          };
        }}
        onrequestDelete={() => {
          confirmAction = {
            type: "delete",
            message: `Delete ${userProfile.displayName}'s account?`,
          };
        }}
      />
    </section>
  </div>
</section>

<AdminConfirmationModal
  action={confirmAction}
  profileName={userProfile.displayName}
  pending={isActionPending}
  onclose={closeConfirmModal}
  onconfirm={handleConfirm}
/>

<AdminEditNameModal
  open={editNameOpen}
  currentName={userProfile.displayName}
  pending={isActionPending}
  onclose={closeEditNameModal}
  onsave={saveDisplayName}
/>

<style>
  .admin-section {
    container-type: inline-size;
    background: transparent;
    border: none;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
    padding-bottom: 1rem;
  }

  .title-group,
  .status-summary,
  .card-heading {
    display: flex;
    align-items: center;
  }

  .title-group {
    gap: 0.75rem;
  }

  .title-icon,
  .card-icon {
    display: grid;
    flex: none;
    place-items: center;
    border-radius: 0.625rem;
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
    color: var(--theme-accent);
  }

  .title-icon {
    width: 2.5rem;
    height: 2.5rem;
  }

  .section-title {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 650;
    color: var(--theme-text);
  }

  .title-group p,
  .card-heading p {
    margin: 0.2rem 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .status-summary {
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.55rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--semantic-success) 13%, transparent);
    color: var(--semantic-success);
    font-size: var(--font-size-compact);
    font-weight: 650;
    text-transform: capitalize;
  }

  .status-chip.disabled {
    background: color-mix(in srgb, var(--semantic-error) 13%, transparent);
    color: var(--semantic-error);
  }

  .role-chip {
    background: color-mix(in srgb, var(--semantic-info) 13%, transparent);
    color: var(--semantic-info);
  }

  .contributor-chip {
    background: color-mix(in srgb, var(--semantic-warning) 13%, transparent);
    color: var(--semantic-warning);
  }

  .admin-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
  }

  .admin-card {
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--theme-card-bg) 88%, transparent);
    container-type: inline-size;
  }

  .card-heading {
    gap: 0.75rem;
    padding-bottom: 1rem;
    color: var(--theme-text);
  }

  .card-icon {
    width: 2.25rem;
    height: 2.25rem;
  }

  .card-heading h4 {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 650;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0.875rem;
    margin-bottom: 1rem;
    background: color-mix(in srgb, var(--semantic-error) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error) 35%, transparent);
    border-radius: 0.5rem;
    color: var(--semantic-error);
    font-size: var(--font-size-compact);
  }

  .error-banner button {
    margin-left: auto;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 12px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .error-banner button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @container (min-width: 60rem) {
    .admin-grid {
      grid-template-columns: minmax(22rem, 0.85fr) minmax(30rem, 1.15fr);
      align-items: start;
    }
  }

  @media (min-width: 2600px) {
    .section-header {
      padding-bottom: 1.5rem;
    }

    .admin-grid {
      gap: 1.5rem;
    }

    .admin-card {
      padding: 1.5rem;
      border-radius: 1.125rem;
    }

    .card-heading {
      gap: 0.75rem;
      padding-bottom: 1.25rem;
    }
  }

  @container (max-width: 36rem) {
    .section-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .status-summary {
      justify-content: flex-start;
    }
  }
</style>
