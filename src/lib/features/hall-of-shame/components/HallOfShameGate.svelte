<!--
  HallOfShameGate.svelte

  Age verification modal for accessing Hall of Shame content.
  Uses an honor-system toggle button confirmation (18+).
  Stores consent in user profile for persistence.
-->
<script lang="ts">

import { getAgeVerifier } from "#lib/features/hall-of-shame/get-age-verifier.js";
	import { t } from '#lib/shared/i18n/i18n.svelte.js';
	import BaseModal from '#lib/shared/foundation/ui/modal/BaseModal.svelte';
	import ModalHeader from '#lib/shared/foundation/ui/modal/ModalHeader.svelte';
	import ModalFooter from '#lib/shared/foundation/ui/modal/ModalFooter.svelte';
	import { authState } from '#lib/shared/auth/state/auth-state.svelte.js';

	interface Props {
		/** Called when user successfully verifies age */
		onVerified: () => void;
		/** Called when user cancels/closes without verifying */
		onCancel: () => void;
	}

	let { onVerified, onCancel }: Props = $props();

	let isOpen = $state(true);
	let confirmed = $state(false);
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	function handleClose() {
		isOpen = false;
		setTimeout(onCancel, 250);
	}

	async function handleConfirm() {
		if (!confirmed) return;

		isSubmitting = true;
		error = null;

		try {
			const ageVerifier = getAgeVerifier();
			const userId = authState.user?.uid;

			if (!userId) {
				error = t('hall_of_shame_sign_in_message');
				return;
			}

			await ageVerifier.recordVerification(userId);

			isOpen = false;
			setTimeout(onVerified, 250);
		} catch (err) {
			console.error('[HallOfShameGate] Verification error:', err);
			error = t('hall_of_shame_verification_error');
		} finally {
			isSubmitting = false;
		}
	}
</script>

<BaseModal bind:open={isOpen} onclose={handleClose} size="sm" animation="pop" labelledBy="age-gate-title">
	{#snippet header()}
		<ModalHeader
			title={t('hall_of_shame_gate_title')}
			subtitle={t('hall_of_shame_gate_subtitle')}
			icon="fa-skull"
			iconColor="#ef4444"
			onClose={handleClose}
			id="age-gate-title"
		/>
	{/snippet}

	<div class="gate-content">
		<div class="warning-icon" aria-hidden="true">
			<i class="fas fa-exclamation-triangle"></i>
		</div>

		<p class="warning-text">
			{t('hall_of_shame_gate_warning')}
		</p>

		<p class="disclaimer">
			{t('hall_of_shame_gate_disclaimer')}
		</p>

		<button
			type="button"
			class="confirm-toggle"
			class:confirmed
			role="switch"
			aria-checked={confirmed}
			disabled={isSubmitting}
			onclick={() => (confirmed = !confirmed)}
		>
			<span class="toggle-indicator" aria-hidden="true">
				{#if confirmed}
					<i class="fas fa-check"></i>
				{/if}
			</span>
			<span class="toggle-text">{t('hall_of_shame_confirm_age')}</span>
		</button>

		{#if error}
			<div class="error-message" role="alert">
				<i class="fas fa-exclamation-circle" aria-hidden="true"></i>
				<span>{error}</span>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<ModalFooter>
			<button class="secondary" onclick={handleClose} disabled={isSubmitting}>
				{t('hall_of_shame_cancel')}
			</button>
			<button
				class="primary danger"
				onclick={handleConfirm}
				disabled={!confirmed || isSubmitting}
			>
				{#if isSubmitting}
					<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
					{t('hall_of_shame_verifying')}
				{:else}
					{t('hall_of_shame_enter')}
				{/if}
			</button>
		</ModalFooter>
	{/snippet}
</BaseModal>

<style>
	.gate-content {
		padding: var(--modal-padding, 24px);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		text-align: center;
	}

	.warning-icon {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 15%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 28px;
		color: var(--semantic-error, #ef4444);
	}

	.warning-text {
		margin: 0;
		font-size: var(--font-size-min, 14px);
		line-height: 1.6;
		color: var(--theme-text, rgba(255, 255, 255, 0.9));
	}

	.disclaimer {
		margin: 0;
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
		line-height: 1.5;
	}

	.confirm-toggle {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		min-height: var(--min-touch-target);
		width: 100%;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 8px;
		cursor: pointer;
		text-align: left;
		transition: border-color 0.2s ease;
	}

	.confirm-toggle:hover:not(:disabled) {
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
	}

	.confirm-toggle:focus-visible {
		outline: 2px solid var(--theme-accent, #3b82f6);
		outline-offset: 2px;
	}

	.confirm-toggle.confirmed {
		border-color: var(--semantic-error, #ef4444);
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 12%, transparent);
	}

	.confirm-toggle:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.toggle-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		min-width: 24px;
		border-radius: 6px;
		border: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
		background: transparent;
		color: white;
		font-size: 13px;
		transition: background 0.2s ease, border-color 0.2s ease;
	}

	.confirm-toggle.confirmed .toggle-indicator {
		background: var(--semantic-error, #ef4444);
		border-color: var(--semantic-error, #ef4444);
	}

	.toggle-text {
		font-size: var(--font-size-min, 14px);
		color: var(--theme-text, rgba(255, 255, 255, 0.9));
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
		border-radius: 8px;
		font-size: var(--font-size-min, 14px);
		color: color-mix(in srgb, var(--semantic-error, #ef4444) 60%, white);
	}

	/* Footer buttons */
	button {
		padding: 10px 20px;
		font-size: var(--font-size-min, 14px);
		font-weight: 500;
		border-radius: 8px;
		border: none;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	button.secondary {
		background: rgba(255, 255, 255, 0.1);
		color: var(--theme-text, rgba(255, 255, 255, 0.9));
	}

	button.secondary:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.15);
	}

	button.primary.danger {
		background: var(--semantic-error, #ef4444);
		color: white;
	}

	button.primary.danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 80%, black);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Respect reduced-motion: drop all transitions */
	@media (prefers-reduced-motion: reduce) {
		.confirm-toggle,
		.toggle-indicator,
		button {
			transition: none;
		}
	}

	/* Mobile responsive */
	@media (max-width: 480px) {
		.gate-content {
			padding: var(--modal-padding-mobile, 20px);
		}

		.warning-icon {
			width: 56px;
			height: 56px;
			font-size: 24px;
		}
	}
</style>
