<!--
  InviteTab.svelte

  Search for users and invite them to the current session.
  Also shows pending invites received.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { connectState } from '../../state/connect-state.svelte';
	import ProgressRing from '#lib/shared/components/loading/ProgressRing.svelte';
	import type { UserSearchResult, Invite } from '../../domain/models/connect-models';
	import { t } from '#lib/shared/i18n/i18n.svelte.js';
	import { toast } from '#lib/shared/toast/state/toast-state.svelte.js';

	// Local state
	let searchQuery = $state('');
	let searchResults = $state<UserSearchResult[]>([]);
	let isSearching = $state(false);
	let searchError = $state<string | null>(null);

	// Derived state
	const pendingInvites = $derived(connectState.pendingInvites);
	const isInSession = $derived(connectState.isInSession);
	const currentSession = $derived(connectState.currentSession);

	// Debounced search
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleSearchInput(event: Event) {
		const target = event.target as HTMLInputElement;
		searchQuery = target.value;

		// Clear previous timeout
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}

		// Don't search if query too short
		if (searchQuery.length < 2) {
			searchResults = [];
			searchError = null;
			return;
		}

		// Debounce search
		searchTimeout = setTimeout(() => {
			performSearch();
		}, 300);
	}

	async function performSearch() {
		isSearching = true;
		searchError = null;

		try {
			searchResults = await connectState.searchUsers(searchQuery);
		} catch (error) {
			searchError = error instanceof Error ? error.message : 'Search failed';
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	async function handleInviteUser(user: UserSearchResult) {
		try {
			await connectState.inviteUser(user.userId);
			toast.success(`Invite sent to ${user.displayName}.`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to send invite. Please try again.');
		}
	}

	async function handleAddFriend(user: UserSearchResult) {
		try {
			await connectState.addFriend(user.userId, user.displayName);
			toast.success(`Added ${user.displayName} as a friend.`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to add friend. Please try again.');
		}
	}

	async function handleAcceptInvite(invite: Invite) {
		try {
			await connectState.acceptInvite(invite.inviteId);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to accept invite. Please try again.');
		}
	}

	async function handleDeclineInvite(invite: Invite) {
		try {
			await connectState.declineInvite(invite.inviteId);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to decline invite. Please try again.');
		}
	}

	// Cleanup debounce timeout on destroy to prevent memory leak
	onDestroy(() => {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
			searchTimeout = null;
		}
	});
</script>

<div class="invite-tab">
	<!-- Search section -->
	<section class="search-section">
		<h2>{t('connect_find_users')}</h2>
		<div class="search-box">
			<i class="fas fa-search" aria-hidden="true"></i>
			<input
				type="text"
				placeholder={t('connect_search_placeholder')}
				value={searchQuery}
				oninput={handleSearchInput}
				aria-label={t('connect_search_for_users')}
			/>
			{#if isSearching}
				<ProgressRing percent={-1} size={24} strokeWidth={2} />
			{/if}
		</div>

		{#if searchError}
			<p class="search-error">{searchError}</p>
		{/if}

		<!-- Search results -->
		{#if searchResults.length > 0}
			<div class="search-results">
				{#each searchResults as user (user.userId)}
					<article class="user-card">
						<div class="user-avatar">
							{#if user.photoURL}
								<img src={user.photoURL} alt="" />
							{:else}
								<div class="avatar-placeholder">
									{user.displayName.charAt(0).toUpperCase()}
								</div>
							{/if}
						</div>

						<div class="user-info">
							<span class="user-name">{user.displayName}</span>
						</div>

						<div class="user-actions">
							{#if isInSession}
								<button class="invite-button" onclick={() => handleInviteUser(user)} aria-label={t('connect_invite_user', { name: user.displayName })}>
									<i class="fas fa-paper-plane" aria-hidden="true"></i>
									{t('connect_invite_button')}
								</button>
							{/if}
							<button
								class="add-friend-button"
								onclick={() => handleAddFriend(user)}
								aria-label={t('connect_add_friend', { name: user.displayName })}
							>
								<i class="fas fa-user-plus" aria-hidden="true"></i>
							</button>
						</div>
					</article>
				{/each}
			</div>
		{:else if searchQuery.length >= 2 && !isSearching}
			<p class="no-results">{t('connect_no_users_found', { query: searchQuery })}</p>
		{/if}
	</section>

	<!-- Pending invites section -->
	{#if pendingInvites.length > 0}
		<section class="invites-section">
			<h2>{t('connect_pending_invites')}</h2>
			<div class="invites-list">
				{#each pendingInvites as invite (invite.inviteId)}
					<article class="invite-card">
						<div class="invite-info">
							<span class="invite-from">
								<strong>{invite.fromDisplayName}</strong> {t('connect_invited_you_to_join')}
							</span>
							<span class="invite-sequence">"{invite.sequenceWord}"</span>
						</div>

						<div class="invite-actions">
							<button
								class="accept-button"
								onclick={() => handleAcceptInvite(invite)}
								aria-label={`${t('connect_join')}, ${invite.fromDisplayName}: "${invite.sequenceWord}"`}
							>
								<i class="fas fa-check" aria-hidden="true"></i>
								{t('connect_join')}
							</button>
							<button
								class="decline-button"
								onclick={() => handleDeclineInvite(invite)}
								aria-label={t('connect_decline_invite_from', { name: invite.fromDisplayName, word: invite.sequenceWord })}
							>
								<i class="fas fa-times" aria-hidden="true"></i>
							</button>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Help section when not in session -->
	{#if !isInSession}
		<div class="help-section">
			<i class="fas fa-info-circle" aria-hidden="true"></i>
			<p>
				{t('connect_start_sharing_hint')}
			</p>
		</div>
	{:else if currentSession}
		<div class="session-hint">
			<i class="fas fa-link" aria-hidden="true"></i>
			<p>
				{t('connect_sharing_sequence', { word: currentSession.sequenceWord })}
			</p>
		</div>
	{/if}
</div>

<style>
	.invite-tab {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 16px;
		gap: 24px;
		overflow-y: auto;
	}

	/* Section headers */
	h2 {
		font-size: var(--font-size-lg, 18px);
		font-weight: 600;
		margin: 0 0 12px 0;
		color: var(--theme-text, white);
	}

	/* Search section */
	.search-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 12px;
	}

	.search-box:focus-within {
		border-color: var(--theme-accent, #6366f1);
	}

	.search-box i {
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
	}

	.search-box input {
		flex: 1;
		background: none;
		border: none;
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		outline: none;
	}

	.search-box input::placeholder {
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
	}

	.search-error,
	.no-results {
		font-size: var(--font-size-sm, 14px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		margin: 0;
		padding: 8px 0;
	}

	.search-error {
		color: var(--semantic-error, #ef4444);
	}

	/* Search results */
	.search-results {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.user-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 10px;
	}

	.user-avatar {
		width: 40px;
		height: 40px;
		flex-shrink: 0;
	}

	.user-avatar img {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--theme-accent, #6366f1);
		color: white;
		font-weight: 600;
		font-size: var(--font-size-base, 16px);
		border-radius: 50%;
	}

	.user-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.user-name {
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		color: var(--theme-text, white);
	}

	.user-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.invite-button {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		background: var(--theme-accent, #6366f1);
		border: none;
		border-radius: 8px;
		color: white;
		font-size: var(--font-size-compact, 12px);
		font-weight: 600;
		cursor: pointer;
	}

	.invite-button:hover {
		background: var(--theme-accent-hover, #4f46e5);
	}

	.add-friend-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: transparent;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 8px;
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		cursor: pointer;
	}

	.add-friend-button:hover {
		background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
		color: var(--theme-text, white);
	}

	/* Invites section */
	.invites-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.invites-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.invite-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--theme-accent, #8b5cf6) 15%, transparent) 0%,
			color-mix(in srgb, var(--theme-accent, #8b5cf6) 10%, transparent) 100%
		);
		border: 1px solid color-mix(in srgb, var(--theme-accent, #8b5cf6) 30%, transparent);
		border-radius: 12px;
	}

	.invite-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.invite-from {
		font-size: var(--font-size-sm, 14px);
		color: var(--theme-text, white);
	}

	.invite-sequence {
		font-size: var(--font-size-base, 16px);
		font-weight: 600;
		color: var(--theme-accent, #6366f1);
	}

	.invite-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.accept-button {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		background: var(--theme-accent, #6366f1);
		border: none;
		border-radius: 8px;
		color: white;
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		cursor: pointer;
	}

	.accept-button:hover {
		background: var(--theme-accent-hover, #4f46e5);
	}

	.decline-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: transparent;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
		border-radius: 8px;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
		cursor: pointer;
	}

	.decline-button:hover {
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
		border-color: var(--semantic-error, #ef4444);
		color: var(--semantic-error, #ef4444);
	}

	/* Help sections */
	.help-section,
	.session-hint {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 16px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border-radius: 12px;
		margin-top: auto;
	}

	.help-section i,
	.session-hint i {
		font-size: 18px;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
		flex-shrink: 0;
		margin-top: 2px;
	}

	.session-hint i {
		color: var(--theme-accent, #6366f1);
	}

	.help-section p,
	.session-hint p {
		font-size: var(--font-size-sm, 14px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		margin: 0;
		line-height: 1.5;
	}

</style>
