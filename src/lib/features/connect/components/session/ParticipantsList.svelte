<!--
  ParticipantsList.svelte

  Displays the list of participants in a sync session.
  Shows host indicator and online status.
-->
<script lang="ts">
	import type { SessionParticipant } from '../../domain/models/connect-models';
	import { t } from '#lib/shared/i18n/i18n.svelte.js';

	interface Props {
		participants: SessionParticipant[];
		hostUserId: string;
	}

	let { participants, hostUserId }: Props = $props();

	// Sort: host first, then alphabetically
	const sortedParticipants = $derived(
		[...participants].sort((a, b) => {
			if (a.userId === hostUserId) return -1;
			if (b.userId === hostUserId) return 1;
			return a.displayName.localeCompare(b.displayName);
		})
	);
</script>

<div class="participants-list" role="list" aria-label={t('connect_session_participants')}>
	{#each sortedParticipants as participant (participant.userId)}
		<div class="participant-item" role="listitem">
			<div class="participant-avatar">
				<div class="avatar-placeholder">
					{participant.displayName.charAt(0).toUpperCase()}
				</div>
				<span class="status-dot connected"></span>
			</div>

			<div class="participant-info">
				<span class="participant-name">
					{participant.displayName}
					{#if participant.userId === hostUserId}
						<span class="host-badge">{t('connect_host')}</span>
					{/if}
				</span>
				<span class="participant-status">
					{participant.isSynced ? t('connect_synced') : t('connect_solo_practice')}
				</span>
			</div>
		</div>
	{/each}

	{#if participants.length === 0}
		<div class="empty-state">
			<i class="fas fa-users" aria-hidden="true"></i>
			<p>{t('connect_no_one_joined')}</p>
		</div>
	{/if}
</div>

<style>
	.participants-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.participant-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border-radius: 8px;
	}

	/* Avatar */
	.participant-avatar {
		position: relative;
		width: 36px;
		height: 36px;
		flex-shrink: 0;
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
		font-size: var(--font-size-sm, 14px);
		border-radius: 50%;
	}

	.status-dot {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 10px;
		height: 10px;
		background: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
		border: 2px solid var(--theme-panel-bg, #12121c);
		border-radius: 50%;
	}

	.status-dot.connected {
		background: var(--semantic-success, #10b981);
	}

	/* Info */
	.participant-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.participant-name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--font-size-sm, 14px);
		font-weight: 500;
		color: var(--theme-text, white);
	}

	.host-badge {
		padding: 2px 6px;
		background: var(--theme-accent, #6366f1);
		color: white;
		font-size: var(--font-size-xs, 11px);
		font-weight: 600;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.participant-status {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 16px;
		text-align: center;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
	}

	.empty-state i {
		font-size: 24px;
		opacity: 0.5;
	}

	.empty-state p {
		margin: 0;
		font-size: var(--font-size-compact, 12px);
	}
</style>
