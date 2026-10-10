<!--
  FriendsTab.svelte

  Displays friends list with online status.
  Allows inviting friends to current session.
-->
<script lang="ts">
	import { connectState } from '../../state/connect-state.svelte';
	import type { Friend } from '../../domain/models/connect-models';
	import { t } from '#lib/shared/i18n/i18n.svelte.js';
	import { toast } from '#lib/shared/toast/state/toast-state.svelte.js';

	// Derived state
	const friends = $derived(connectState.friends);
	const onlineFriends = $derived(connectState.onlineFriends);
	const isInSession = $derived(connectState.isInSession);

	// Sort: online first, then alphabetically
	const sortedFriends = $derived(
		[...friends].sort((a, b) => {
			const aOnline = onlineFriends.some((f) => f.userId === a.userId);
			const bOnline = onlineFriends.some((f) => f.userId === b.userId);
			if (aOnline && !bOnline) return -1;
			if (!aOnline && bOnline) return 1;
			return (a.nickname || a.displayName).localeCompare(b.nickname || b.displayName);
		})
	);

	function isOnline(friend: Friend): boolean {
		return onlineFriends.some((f) => f.userId === friend.userId);
	}

	async function handleInvite(friend: Friend) {
		const name = friend.nickname || friend.displayName;
		try {
			await connectState.inviteUser(friend.userId);
			toast.success(`Invite sent to ${name}.`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to send invite. Please try again.');
		}
	}

	async function handleRemoveFriend(friend: Friend) {
		const name = friend.nickname || friend.displayName;
		try {
			await connectState.removeFriend(friend.userId);
			toast.success(`Removed ${name} from your friends.`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to remove friend. Please try again.');
		}
	}
</script>

<div class="friends-tab">
	<!-- Header -->
	<header class="tab-header">
		<div class="header-info">
			<h2>{t('connect_friends_heading')}</h2>
			<p class="subtitle" aria-live="polite" aria-atomic="true">
				{#if onlineFriends.length === 0}
					{t('connect_no_friends_online')}
				{:else}
					{t('connect_online_count', { count: onlineFriends.length })}
				{/if}
			</p>
		</div>
	</header>

	<!-- Friends list -->
	<div class="friends-list">
		{#if friends.length === 0}
			<div class="empty-state">
				<div class="empty-icon">
					<i class="fas fa-user-friends" aria-hidden="true"></i>
				</div>
				<h3>{t('connect_no_friends_yet')}</h3>
				<p>{t('connect_add_friends_hint')}</p>
			</div>
		{:else}
			{#each sortedFriends as friend (friend.userId)}
				<article class="friend-card" class:online={isOnline(friend)}>
					<!-- Avatar -->
					<div class="friend-avatar">
						{#if friend.avatarUrl}
							<img src={friend.avatarUrl} alt="" />
						{:else}
							<div class="avatar-placeholder">
								{(friend.nickname || friend.displayName).charAt(0).toUpperCase()}
							</div>
						{/if}
						<span class="status-dot" class:online={isOnline(friend)}></span>
					</div>

					<!-- Info -->
					<div class="friend-info">
						<span class="friend-name">{friend.nickname || friend.displayName}</span>
						<span class="friend-status">
							{isOnline(friend) ? t('connect_online') : t('connect_offline')}
						</span>
					</div>

					<!-- Actions -->
					<div class="friend-actions">
						{#if isInSession && isOnline(friend)}
							<button
								class="invite-button"
								onclick={() => handleInvite(friend)}
								title={t('connect_invite_to_session')}
								aria-label={t('connect_invite_user', { name: friend.nickname || friend.displayName })}
							>
								<i class="fas fa-paper-plane" aria-hidden="true"></i>
								{t('connect_invite_button')}
							</button>
						{/if}

						<button
							class="remove-button"
							onclick={() => handleRemoveFriend(friend)}
							title={t('connect_remove_friend')}
							aria-label={t('connect_remove_user', { name: friend.nickname || friend.displayName })}
						>
							<i class="fas fa-times" aria-hidden="true"></i>
						</button>
					</div>
				</article>
			{/each}
		{/if}
	</div>
</div>

<style>
	.friends-tab {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 16px;
		gap: 16px;
	}

	/* Header */
	.tab-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.header-info h2 {
		font-size: var(--font-size-lg, 18px);
		font-weight: 600;
		margin: 0;
		color: var(--theme-text, white);
	}

	.subtitle {
		font-size: var(--font-size-sm, 14px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		margin: 4px 0 0 0;
	}

	/* Friends list */
	.friends-list {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 12px;
		overflow-y: auto;
	}

	/* Friend card */
	.friend-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 12px;
		transition: border-color 0.15s ease;
	}

	.friend-card:hover {
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
	}

	.friend-card.online {
		border-color: color-mix(in srgb, var(--semantic-success, #10b981) 30%, transparent);
	}

	/* Avatar */
	.friend-avatar {
		position: relative;
		width: 44px;
		height: 44px;
		flex-shrink: 0;
	}

	.friend-avatar img {
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
		font-size: var(--font-size-lg, 18px);
		border-radius: 50%;
	}

	.status-dot {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 12px;
		height: 12px;
		background: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
		border: 2px solid var(--theme-panel-bg, #12121c);
		border-radius: 50%;
	}

	.status-dot.online {
		background: var(--semantic-success, #10b981);
	}

	/* Info */
	.friend-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.friend-name {
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		color: var(--theme-text, white);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.friend-status {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
	}

	.friend-card.online .friend-status {
		color: var(--semantic-success, #10b981);
	}

	/* Actions */
	.friend-actions {
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
		transition: background 0.15s ease;
	}

	.invite-button:hover {
		background: var(--theme-accent-hover, #4f46e5);
	}

	.remove-button {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 8px;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	/* Expand the hit area to the 44px WCAG touch-target minimum without
	   growing the visual button. */
	.remove-button::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		min-width: var(--min-touch-target, 44px);
		min-height: var(--min-touch-target, 44px);
		width: 100%;
		height: 100%;
	}

	.remove-button:hover {
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
		border-color: var(--semantic-error, #ef4444);
		color: var(--semantic-error, #ef4444);
	}

	/* Empty state */
	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 32px;
		gap: 16px;
	}

	.empty-icon {
		width: 80px;
		height: 80px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border-radius: 50%;
	}

	.empty-icon i {
		font-size: 32px;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
	}

	.empty-state h3 {
		font-size: var(--font-size-lg, 18px);
		font-weight: 600;
		margin: 0;
		color: var(--theme-text, white);
	}

	.empty-state p {
		font-size: var(--font-size-sm, 14px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		margin: 0;
		max-width: 280px;
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.friend-card,
		.invite-button,
		.remove-button {
			transition: none;
		}
	}
</style>
