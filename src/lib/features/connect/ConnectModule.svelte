<script lang="ts">

import { getConnectOrchestrator } from "#lib/features/connect/get-connect-orchestrator.js";
	/**
	 * ConnectModule
	 *
	 * Collaborative sync for viewing sequences together.
	 * Auto-browse nearby sessions, invite friends, or search by username.
	 */
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import { onMount, onDestroy } from 'svelte';
	import { connectState } from './state/connect-state.svelte';
	import type { ErrorHandler } from '#lib/shared/application/services/error-handler.js'

	// Tab components
	import NearbyTab from './components/tabs/NearbyTab.svelte';
	import FriendsTab from './components/tabs/FriendsTab.svelte';
	import InviteTab from './components/tabs/InviteTab.svelte';

	// Session viewer overlay
	import SessionViewer from './components/session/SessionViewer.svelte';
	import ProgressRing from '#lib/shared/components/loading/ProgressRing.svelte';
	import { t } from '#lib/shared/i18n/i18n.svelte.js';

	type TabId = 'nearby' | 'friends' | 'invite';

	let activeTab = $state<TabId>('nearby');
	let isInitializing = $state(true);
	let initError = $state<string | null>(null);
	let showSessionViewer = $state(false);

	// Derived state from connectState
	const isInSession = $derived(connectState.isInSession);
	const currentSession = $derived(connectState.currentSession);
	const nearbySessions = $derived(connectState.nearbySessions);
	const onlineFriends = $derived(connectState.onlineFriends);
	const pendingInviteCount = $derived(connectState.pendingInviteCount);

	function openSessionViewer() {
		showSessionViewer = true;
	}

	function closeSessionViewer() {
		showSessionViewer = false;
	}

	function switchTab(tab: TabId) {
		activeTab = tab;
	}

	async function initializeModule() {
		isInitializing = true;
		initError = null;

		try {
			const orchestrator = getConnectOrchestrator();
			await connectState.initialize(orchestrator);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to initialize';
			initError = message;
			const errorHandler = getErrorHandler() as ErrorHandler;
			errorHandler.showError(message, error instanceof Error ? error : new Error(String(error)), {
				module: 'connect',
				action: 'initialize'
			});
		} finally {
			isInitializing = false;
		}
	}

	async function handleRetry() {
		await initializeModule();
	}

	onMount(() => {
		initializeModule();
	});

	onDestroy(() => {
		// Don't cleanup on destroy - state persists for overlay use
		// connectState.cleanup();
	});
</script>

<div class="connect-module">
	{#if isInitializing}
		<div class="loading-state">
			<ProgressRing percent={-1} size={32} strokeWidth={3} />
			<p>{t('connect_connecting')}</p>
		</div>
	{:else if initError}
		<div class="error-state">
			<i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
			<p>{initError}</p>
			<button onclick={handleRetry}>{t('connect_retry')}</button>
		</div>
	{:else}
		<!-- Tab Navigation -->
		<div class="tab-nav" role="tablist" aria-label="Connect module tabs">
			<button
				id="tab-nearby"
				class="tab-button"
				class:active={activeTab === 'nearby'}
				onclick={() => switchTab('nearby')}
				role="tab"
				aria-selected={activeTab === 'nearby'}
				aria-controls="tabpanel-connect"
			>
				<i class="fas fa-broadcast-tower" aria-hidden="true"></i>
				<span>{t('connect_nearby')}</span>
				{#if nearbySessions.length > 0}
					<span class="badge" aria-label="{nearbySessions.length} sessions">{nearbySessions.length}</span>
				{/if}
			</button>

			<button
				id="tab-friends"
				class="tab-button"
				class:active={activeTab === 'friends'}
				onclick={() => switchTab('friends')}
				role="tab"
				aria-selected={activeTab === 'friends'}
				aria-controls="tabpanel-connect"
			>
				<i class="fas fa-user-friends" aria-hidden="true"></i>
				<span>{t('connect_friends')}</span>
				{#if onlineFriends.length > 0}
					<span class="badge online" aria-label="{onlineFriends.length} online">{onlineFriends.length}</span>
				{/if}
			</button>

			<button
				id="tab-invite"
				class="tab-button"
				class:active={activeTab === 'invite'}
				onclick={() => switchTab('invite')}
				role="tab"
				aria-selected={activeTab === 'invite'}
				aria-controls="tabpanel-connect"
			>
				<i class="fas fa-paper-plane" aria-hidden="true"></i>
				<span>{t('connect_invite')}</span>
				{#if pendingInviteCount > 0}
					<span class="badge pending" aria-label="{pendingInviteCount} pending">{pendingInviteCount}</span>
				{/if}
			</button>
		</div>

		<!-- Tab Content -->
		<div id="tabpanel-connect" class="tab-content" role="tabpanel" aria-labelledby="tab-{activeTab}">
			{#if activeTab === 'nearby'}
				<NearbyTab />
			{:else if activeTab === 'friends'}
				<FriendsTab />
			{:else if activeTab === 'invite'}
				<InviteTab />
			{/if}
		</div>

		<!-- Current Session Banner (if in session) -->
		{#if isInSession && currentSession}
			<div class="current-session-banner">
				<button class="session-info-button" onclick={openSessionViewer} aria-label={t('connect_view_session_details')}>
					<i class="fas fa-link" aria-hidden="true"></i>
					<span>
						{t('connect_synced_label')}: <strong>"{currentSession.sequenceWord}"</strong>
						({t('connect_connected_count', { count: currentSession.participantCount })})
					</span>
					<i class="fas fa-chevron-right view-icon" aria-hidden="true"></i>
				</button>
				<button class="leave-button" onclick={() => connectState.leaveSession()} aria-label={t('connect_leave_session')}>
					{t('connect_leave')}
				</button>
			</div>
		{/if}
	{/if}
</div>

<!-- Session Viewer Overlay -->
{#if isInSession && currentSession && showSessionViewer}
	<SessionViewer session={currentSession} onClose={closeSessionViewer} />
{/if}

<style>
	.connect-module {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
		color: var(--theme-text, #ffffff);
	}

	/* Loading & Error States */
	.loading-state,
	.error-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		text-align: center;
		padding: 24px;
	}

	.error-state i {
		font-size: 48px;
		color: var(--semantic-error, #ef4444);
	}

	.error-state button {
		background: var(--theme-accent, #6366f1);
		color: white;
		border: none;
		padding: 12px 24px;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
	}

	/* Tab Navigation */
	.tab-nav {
		display: flex;
		border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		padding: 0 16px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
	}

	.tab-button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 16px 12px;
		background: none;
		border: none;
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		cursor: pointer;
		font-size: var(--font-size-sm, 14px);
		font-weight: 500;
		position: relative;
		transition: color 0.2s ease;
	}

	.tab-button:hover {
		color: var(--theme-text, #ffffff);
	}

	.tab-button.active {
		color: var(--theme-accent, #6366f1);
	}

	.tab-button.active::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 16px;
		right: 16px;
		height: 2px;
		background: var(--theme-accent, #6366f1);
		border-radius: 2px 2px 0 0;
	}

	.tab-button i {
		font-size: 16px;
	}

	.badge {
		background: var(--theme-accent, #6366f1);
		color: white;
		font-size: var(--font-size-xs, 11px);
		padding: 2px 6px;
		border-radius: 10px;
		min-width: 18px;
		text-align: center;
	}

	.badge.online {
		background: var(--semantic-success, #10b981);
	}

	.badge.pending {
		background: var(--semantic-warning, #f59e0b);
	}

	/* Tab Content */
	.tab-content {
		flex: 1;
		overflow: hidden;
	}

	/* Current Session Banner */
	.current-session-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: linear-gradient(
			135deg,
			var(--theme-accent, #8b5cf6) 0%,
			var(--theme-accent-hover, #7c3aed) 100%
		);
		color: white;
		padding: 12px 16px;
	}

	.session-info-button {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 12px;
		background: none;
		border: none;
		color: white;
		font-size: var(--font-size-sm, 14px);
		cursor: pointer;
		text-align: left;
		padding: 0;
	}

	.session-info-button:hover {
		opacity: 0.9;
	}

	.session-info-button .view-icon {
		margin-left: auto;
		opacity: 0.7;
		font-size: 12px;
	}

	.leave-button {
		background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
		border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
		color: var(--theme-text, white);
		padding: 8px 16px;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		font-size: var(--font-size-compact, 12px);
	}

	.leave-button:hover {
		background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.3));
	}

	/* Responsive */
	@media (max-width: 600px) {
		.tab-button span {
			display: none;
		}

		.tab-button {
			padding: 16px;
		}

		.tab-button i {
			font-size: 20px;
		}
	}

</style>
