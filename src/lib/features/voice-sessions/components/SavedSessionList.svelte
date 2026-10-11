<!--
  SavedSessionList - Collapsible section showing saved voice sessions

  Fetches sessions from the repository on mount.
  Manages list view, detail expansion, delete confirmation, and refresh.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type * as VoiceSessionRepositoryModule from "#lib/shared/voice-sessions/services/voice-session-repository.js";
  import type * as VoiceSessionFormatterModule from "#lib/features/voice-sessions/services/voice-session-formatter.js";
  import type { VoiceSessionReplayer } from "#lib/features/voice-sessions/services/voice-session-replayer.js";
  import type { VoiceSessionPreview, VoiceSession } from "#lib/shared/voice-control/domain/voice-session-types.js";
  import SavedSessionItem from "./SavedSessionItem.svelte";
  import SessionDetailView from "./SessionDetailView.svelte";

  let {
    repository,
    formatter,
    replayer = null,
    refreshTrigger = 0,
  }: {
    repository: typeof VoiceSessionRepositoryModule;
    formatter: typeof VoiceSessionFormatterModule;
    replayer?: VoiceSessionReplayer | null;
    refreshTrigger?: number;
  } = $props();

  let sessions = $state<VoiceSessionPreview[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let collapsed = $state(false);

  // Detail view state
  let selectedSessionId = $state<string | null>(null);
  let selectedSession = $state<VoiceSession | null>(null);
  let loadingDetail = $state(false);

  // Delete confirmation state
  let deleteTargetId = $state<string | null>(null);
  let deleting = $state(false);

  onMount(() => {
    fetchSessions();
  });

  // Refetch when parent increments refreshTrigger (e.g. after saving a session)
  $effect(() => {
    if (refreshTrigger > 0) {
      fetchSessions();
    }
  });

  async function fetchSessions() {
    loading = true;
    error = null;
    try {
      sessions = await repository.listSessions({ sortDirection: "desc", limit: 20 });
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load sessions";
    } finally {
      loading = false;
    }
  }

  async function selectSession(id: string) {
    if (selectedSessionId === id) {
      // Deselect
      selectedSessionId = null;
      selectedSession = null;
      return;
    }
    selectedSessionId = id;
    loadingDetail = true;
    error = null;
    try {
      selectedSession = await repository.getSession(id);
    } catch (e) {
      selectedSession = null;
      selectedSessionId = null;
      error = e instanceof Error ? e.message : "Failed to load session";
    } finally {
      loadingDetail = false;
    }
  }

  function closeDetail() {
    selectedSessionId = null;
    selectedSession = null;
  }

  function requestDelete(id: string) {
    deleteTargetId = id;
  }

  async function confirmDelete() {
    if (!deleteTargetId) return;
    deleting = true;
    try {
      await repository.deleteSession(deleteTargetId);
      // If we deleted the currently viewed session, close detail
      if (selectedSessionId === deleteTargetId) {
        selectedSessionId = null;
        selectedSession = null;
      }
      sessions = sessions.filter(s => s.id !== deleteTargetId);
      deleteTargetId = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete session";
    } finally {
      deleting = false;
    }
  }

  function cancelDelete() {
    deleteTargetId = null;
  }
</script>

<section class="saved-sessions-section">
  <button class="section-header" onclick={() => collapsed = !collapsed} aria-expanded={!collapsed} aria-label={collapsed ? t('voice_sessions_expand') : t('voice_sessions_collapse')}>
    <h2>
      {t('voice_sessions_saved_sessions')}
      {#if sessions.length > 0 && !loading}
        <span class="count-badge">{sessions.length}</span>
      {/if}
    </h2>
    <i class="fas {collapsed ? 'fa-chevron-right' : 'fa-chevron-down'}" aria-hidden="true"></i>
  </button>

  {#if !collapsed}
    <div class="section-content">
      {#if loading}
        <div class="state-message">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>{t('voice_sessions_loading')}</span>
        </div>
      {:else if error}
        <div class="state-message error">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
          <span>{error}</span>
          <button class="retry-btn" onclick={fetchSessions}>{t('voice_sessions_retry')}</button>
        </div>
      {:else if selectedSession && selectedSessionId}
        <SessionDetailView
          session={selectedSession}
          {formatter}
          {replayer}
          onClose={closeDetail}
          onDelete={() => requestDelete(selectedSessionId!)}
        />
      {:else if loadingDetail}
        <div class="state-message">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>{t('voice_sessions_loading_detail')}</span>
        </div>
      {:else if sessions.length === 0}
        <div class="state-message empty">
          <i class="fas fa-microphone-alt" aria-hidden="true"></i>
          <span>{t('voice_sessions_no_sessions')}</span>
          <p>{t('voice_sessions_no_sessions_help')}</p>
        </div>
      {:else}
        <div class="sessions-list">
          {#each sessions as preview (preview.id)}
            <SavedSessionItem
              {preview}
              isSelected={selectedSessionId === preview.id}
              onSelect={() => selectSession(preview.id)}
              onDelete={() => requestDelete(preview.id)}
            />
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Delete Confirmation -->
  {#if deleteTargetId}
    <div class="confirm-overlay" role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-desc">
      <div class="confirm-dialog">
        <p id="confirm-delete-desc">{t('voice_sessions_delete_confirm')}</p>
        <div class="confirm-actions">
          <button class="confirm-btn cancel" onclick={cancelDelete} disabled={deleting}>{t('voice_sessions_cancel')}</button>
          <button class="confirm-btn delete" onclick={confirmDelete} disabled={deleting}>
            {deleting ? t('voice_sessions_deleting') : t('voice_sessions_delete')}
          </button>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .saved-sessions-section {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    padding: 16px;
    position: relative;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .section-header h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
    color: inherit;
  }

  .section-header i {
    font-size: 12px;
    transition: transform 0.15s ease;
  }

  .count-badge {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--theme-accent, #6366f1);
    color: white;
    text-transform: none;
    letter-spacing: 0;
  }

  .section-content {
    margin-top: 12px;
  }

  .sessions-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* State Messages */
  .state-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px;
    text-align: center;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-sm, 14px);
  }

  .state-message i {
    font-size: 20px;
    opacity: 0.6;
  }

  .state-message.error {
    color: var(--semantic-error, #ef4444);
  }

  .state-message.empty p {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    opacity: 0.7;
  }

  .retry-btn {
    padding: 4px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    color: var(--theme-text, white);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
  }

  .retry-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  /* Delete Confirmation */
  .confirm-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }

  .confirm-dialog {
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 10px;
    padding: 20px;
    max-width: 280px;
    text-align: center;
  }

  .confirm-dialog p {
    margin: 0 0 16px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
  }

  .confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  .confirm-btn {
    padding: 8px 16px;
    min-height: 40px;
    border-radius: 8px;
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .confirm-btn.cancel {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, white);
  }

  .confirm-btn.cancel:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .confirm-btn.delete {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    color: var(--semantic-error, #ef4444);
  }

  .confirm-btn.delete:hover:not(:disabled) {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 35%, transparent);
  }

  .confirm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .section-header i,
    .confirm-btn {
      transition: none;
    }
  }
</style>
