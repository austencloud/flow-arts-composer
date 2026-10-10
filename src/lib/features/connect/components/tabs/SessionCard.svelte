<!--
  SessionCard.svelte

  Displays a single nearby session with host info and join button.
-->
<script lang="ts">
	import type { SyncSession } from '../../domain/models/connect-models';
	import { t } from '#lib/shared/i18n/i18n.svelte.js';

	interface Props {
		session: SyncSession;
		onJoin: () => void;
		isOwnSession?: boolean;
	}

	let { session, onJoin, isOwnSession = false }: Props = $props();

	// Format time since session started
	const timeAgo = $derived(formatTimeAgo(session.createdAt));

	function formatTimeAgo(timestamp: number): string {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);

		if (seconds < 60) return t('connect_just_now');
		if (seconds < 3600) return t('connect_minutes_ago', { count: Math.floor(seconds / 60) });
		if (seconds < 86400) return t('connect_hours_ago', { count: Math.floor(seconds / 3600) });
		return t('connect_days_ago', { count: Math.floor(seconds / 86400) });
	}
</script>

<article class="session-card" class:own-session={isOwnSession}>
	<!-- Host info -->
	<div class="host-section">
		<div class="host-avatar">
			{#if session.hostAvatarUrl}
				<img src={session.hostAvatarUrl} alt="" />
			{:else}
				<div class="avatar-placeholder">
					{session.hostDisplayName.charAt(0).toUpperCase()}
				</div>
			{/if}
		</div>

		<div class="host-info">
			<span class="host-name">{session.hostDisplayName}</span>
			<span class="session-time">{timeAgo}</span>
		</div>
	</div>

	<!-- Sequence info -->
	<div class="sequence-section">
		<span class="sharing-label">{t('connect_is_sharing')}</span>
		<span class="sequence-word">"{session.sequenceWord}"</span>
	</div>

	<!-- Participant count -->
	<div class="participants-section">
		<i class="fas fa-users" aria-hidden="true"></i>
		<span>{t('connect_synced_count', { count: session.participantCount })}</span>
	</div>

	<!-- Join button -->
	<div class="action-section">
		{#if isOwnSession}
			<span class="own-session-badge">{t('connect_your_session')}</span>
		{:else}
			<button
				class="join-button"
				onclick={onJoin}
				aria-label={`${t('connect_join')}: ${session.hostDisplayName}`}
			>
				<i class="fas fa-link" aria-hidden="true"></i>
				{t('connect_join')}
			</button>
		{/if}
	</div>
</article>

<style>
	.session-card {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: 16px;
		padding: 16px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 12px;
		transition: all 0.15s ease;
	}

	.session-card:hover {
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
	}

	.session-card.own-session {
		border-color: var(--theme-accent, #6366f1);
		background: color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent);
	}

	/* Host section */
	.host-section {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.host-avatar {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
	}

	.host-avatar img {
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

	.host-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.host-name {
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		color: var(--theme-text, white);
	}

	.session-time {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
	}

	/* Sequence section */
	.sequence-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.sharing-label {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
	}

	.sequence-word {
		font-size: var(--font-size-base, 16px);
		font-weight: 600;
		color: var(--theme-accent, #6366f1);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Participants */
	.participants-section {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		white-space: nowrap;
	}

	.participants-section i {
		font-size: 12px;
	}

	/* Action section */
	.action-section {
		display: flex;
		align-items: center;
	}

	.join-button {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		background: var(--theme-accent, #6366f1);
		border: none;
		border-radius: 8px;
		color: white;
		font-weight: 600;
		font-size: var(--font-size-sm, 14px);
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.join-button:hover {
		background: var(--theme-accent-hover, #4f46e5);
	}

	.join-button:focus-visible {
		outline: 2px solid var(--theme-accent, #6366f1);
		outline-offset: 2px;
	}

	.own-session-badge {
		padding: 8px 16px;
		background: var(--theme-accent, #6366f1);
		color: white;
		font-size: var(--font-size-compact, 12px);
		font-weight: 600;
		border-radius: 8px;
		opacity: 0.7;
	}

	/* Mobile layout */
	@media (max-width: 600px) {
		.session-card {
			grid-template-columns: auto 1fr;
			grid-template-rows: auto auto;
			gap: 12px;
		}

		.host-section {
			grid-column: 1;
			grid-row: 1;
		}

		.sequence-section {
			grid-column: 2;
			grid-row: 1;
			text-align: right;
		}

		.participants-section {
			grid-column: 1;
			grid-row: 2;
		}

		.action-section {
			grid-column: 2;
			grid-row: 2;
			justify-content: flex-end;
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.session-card,
		.join-button {
			transition: none;
		}
	}
</style>
