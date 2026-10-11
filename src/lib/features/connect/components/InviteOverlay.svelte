<!--
  InviteOverlay.svelte

  Modal overlay shown when a user receives an invite.
  Allows accepting or declining the invite.
-->
<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { connectState } from '../state/connect-state.svelte';
	import ProgressRing from '#lib/shared/components/loading/ProgressRing.svelte';
	import type { Invite } from '../domain/models/connect-models';
	import { t } from '#lib/shared/i18n/i18n.svelte.js';

	// Derived from state
	const activeInvite = $derived(connectState.activeInviteOverlay);
	const isConnecting = $derived(connectState.isConnecting);

	async function handleAccept() {
		if (!activeInvite) return;
		await connectState.acceptInvite(activeInvite.inviteId);
	}

	async function handleDecline() {
		if (!activeInvite) return;
		await connectState.declineInvite(activeInvite.inviteId);
	}

	function handleDismiss() {
		connectState.dismissInviteOverlay();
	}
</script>

{#if activeInvite}
	<div
		class="invite-overlay"
		role="dialog"
		aria-labelledby="invite-title"
		aria-describedby="invite-description"
		transition:fade={{ duration: 200 }}
	>
		<button class="overlay-backdrop" onclick={handleDismiss} type="button" aria-label="Dismiss invite overlay"></button>

		<div class="invite-card" transition:fly={{ y: 100, duration: 300 }}>
			<!-- Header -->
			<div class="invite-header">
				<div class="invite-icon">
					<i class="fas fa-paper-plane" aria-hidden="true"></i>
				</div>
				<h2 id="invite-title">Sync Invite</h2>
			</div>

			<!-- Content -->
			<div class="invite-content" id="invite-description">
				<div class="sender-info">
					<span class="sender-name">{activeInvite.fromDisplayName}</span>
					<span class="invite-action">invited you to sync</span>
				</div>

				<div class="sequence-info">
					<span class="sequence-label">Sequence:</span>
					<span class="sequence-word">"{activeInvite.sequenceWord}"</span>
				</div>
			</div>

			<!-- Actions -->
			<div class="invite-actions">
				<button
					class="decline-button"
					onclick={handleDecline}
					disabled={isConnecting}
					aria-label={`Decline ${activeInvite.fromDisplayName}'s invite to sync ${activeInvite.sequenceWord}`}
				>
					<i class="fas fa-times" aria-hidden="true"></i>
					Decline
				</button>

				<button
					class="accept-button"
					onclick={handleAccept}
					disabled={isConnecting}
					aria-label={`Join ${activeInvite.fromDisplayName}'s session for ${activeInvite.sequenceWord}`}
				>
					{#if isConnecting}
						<ProgressRing percent={-1} size={24} strokeWidth={2} />
						Joining...
					{:else}
						<i class="fas fa-check" aria-hidden="true"></i>
						Join Session
					{/if}
				</button>
			</div>

			<!-- Dismiss button -->
			<button
				class="dismiss-button"
				onclick={handleDismiss}
				aria-label="Dismiss"
			>
				<i class="fas fa-times" aria-hidden="true"></i>
			</button>
		</div>
	</div>
{/if}

<style>
	.invite-overlay {
		position: fixed;
		inset: 0;
		z-index: var(--z-overlay);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.overlay-backdrop {
		position: absolute;
		inset: 0;
		background: var(--theme-overlay-bg, rgba(0, 0, 0, 0.7));
		border: none;
		padding: 0;
		margin: 0;
		cursor: default;
	}

	.invite-card {
		position: relative;
		width: 100%;
		max-width: 400px;
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 16px;
		overflow: hidden;
	}

	/* Header */
	.invite-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 32px 24px 16px;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--theme-accent, #8b5cf6) 20%, transparent) 0%,
			color-mix(in srgb, var(--theme-accent, #8b5cf6) 10%, transparent) 100%
		);
	}

	.invite-icon {
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--theme-accent, #6366f1);
		border-radius: 50%;
	}

	.invite-icon i {
		font-size: 24px;
		color: var(--theme-text, white);
	}

	.invite-header h2 {
		font-size: var(--font-size-lg, 18px);
		font-weight: 600;
		margin: 0;
		color: var(--theme-text, white);
	}

	/* Content */
	.invite-content {
		padding: 24px;
		text-align: center;
	}

	.sender-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 16px;
	}

	.sender-name {
		font-size: var(--font-size-lg, 18px);
		font-weight: 600;
		color: var(--theme-text, white);
	}

	.invite-action {
		font-size: var(--font-size-sm, 14px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
	}

	.sequence-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 16px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border-radius: 12px;
	}

	.sequence-label {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.sequence-word {
		font-size: var(--font-size-xl, 20px);
		font-weight: 700;
		color: var(--theme-accent, #6366f1);
	}

	/* Actions */
	.invite-actions {
		display: flex;
		gap: 12px;
		padding: 0 24px 24px;
	}

	.decline-button,
	.accept-button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 14px 20px;
		border-radius: 12px;
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.decline-button {
		background: transparent;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
	}

	.decline-button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
		border-color: var(--semantic-error, #ef4444);
		color: var(--semantic-error, #ef4444);
	}

	.accept-button {
		background: var(--theme-accent, #6366f1);
		border: none;
		color: white;
	}

	.accept-button:hover:not(:disabled) {
		background: var(--theme-accent-hover, #4f46e5);
	}

	.decline-button:disabled,
	.accept-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Dismiss button */
	.dismiss-button {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
		cursor: pointer;
		border-radius: 8px;
		transition: all 0.15s ease;
	}

	/* Expand the hit area to the 44px WCAG touch-target minimum without
	   growing the visual button. */
	.dismiss-button::before {
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

	.dismiss-button:hover {
		background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
		color: var(--theme-text, white);
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.decline-button,
		.accept-button,
		.dismiss-button {
			transition: none;
		}
	}
</style>
