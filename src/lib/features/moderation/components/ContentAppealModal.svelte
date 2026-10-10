<!--
  ContentAppealModal.svelte

  Modal for appealing content that was flagged by moderation.
  Shows what was flagged, why, and allows user to submit an appeal.
-->
<script lang="ts">
  import { getAuth } from "firebase/auth";
  import BaseModal from '#lib/shared/foundation/ui/modal/BaseModal.svelte';
	import ModalHeader from '#lib/shared/foundation/ui/modal/ModalHeader.svelte';
	import ModalFooter from '#lib/shared/foundation/ui/modal/ModalFooter.svelte';
	import { getContentAppealManager } from '#lib/features/moderation/get-content-appeal-manager.js';
	import type { FlaggedTerm, CreateAppealData } from '../domain/models/content-moderation-models';
	import { t } from '#lib/shared/i18n/i18n.svelte.js';
	import TKAWordGlyph from '#lib/shared/choreo-card/components/TKAWordGlyph.svelte';

	interface Props {
		/** The word/content that was flagged */
		word: string;
		/** ID of the content (sequence or act) */
		contentId: string;
		/** Type of content */
		contentType: 'sequence' | 'act';
		/** Terms that triggered the moderation flag */
		flaggedTerms: FlaggedTerm[];
		/** Called when modal is closed */
		onClose: () => void;
		/** Called when appeal is successfully submitted */
		onAppealSubmitted?: () => void;
	}

	let { word, contentId, contentType, flaggedTerms, onClose, onAppealSubmitted }: Props = $props();

	let isOpen = $state(true);
	let appealReason = $state('');
	let isSubmitting = $state(false);
	let submitError = $state<string | null>(null);
	let closeTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		// Clear any pending close timer if the component unmounts.
		return () => {
			if (closeTimer !== null) {
				clearTimeout(closeTimer);
				closeTimer = null;
			}
		};
	});

	// Category labels for display
	const categoryLabels: Record<string, string> = {
		profanity: 'Profanity',
		slur: 'Offensive term',
		hate: 'Hate speech',
		sexual: 'Explicit content'
	};

	function handleClose() {
		isOpen = false;
		if (closeTimer !== null) {
			clearTimeout(closeTimer);
		}
		closeTimer = setTimeout(() => {
			closeTimer = null;
			onClose();
		}, 250);
	}

	async function handleSubmit() {
		if (!appealReason.trim()) {
			submitError = t('moderation_appeal_explain_required');
			return;
		}

		isSubmitting = true;
		submitError = null;

		try {
			const appealManager = getContentAppealManager();
			const userId = getAuth().currentUser?.uid;

			if (!userId) {
				throw new Error(t('moderation_sign_in_required'));
			}

			const data: CreateAppealData = {
				contentType,
				contentId,
				word,
				flaggedTerms,
				appealReason: appealReason.trim()
			};

			await appealManager.submitAppeal(userId, data);

			onAppealSubmitted?.();
			handleClose();
		} catch (error) {
			submitError = error instanceof Error ? error.message : t('moderation_appeal_submit_failed');
		} finally {
			isSubmitting = false;
		}
	}
</script>

<BaseModal bind:open={isOpen} onclose={handleClose} size="md" animation="pop" labelledBy="appeal-modal-title">
	{#snippet header()}
		<ModalHeader
			title={t('moderation_appeal_title')}
			subtitle={t('moderation_appeal_subtitle')}
			icon="fa-gavel"
			iconColor="var(--semantic-warning, #f59e0b)"
			onClose={handleClose}
			id="appeal-modal-title"
		/>
	{/snippet}

	<div class="appeal-content">
		<!-- Flagged content display -->
		<div class="flagged-section" data-animate="2">
			<h3 class="section-title">{t('moderation_flagged_content')}</h3>
			<div class="flagged-word"><TKAWordGlyph {word} height={18} darkMode /></div>
		</div>

		<!-- {t('moderation_why_flagged')} -->
		<div class="reasons-section" data-animate="3">
			<h3 class="section-title">{t('moderation_why_flagged')}</h3>
			<ul class="reasons-list">
				{#each flaggedTerms as term}
					<li>
						<span class="reason-category">{categoryLabels[term.category] || term.category}</span>
						<span class="reason-term">{t('moderation_matched')}: "{term.matchedPattern}"</span>
					</li>
				{/each}
			</ul>
		</div>

		<!-- Info box -->
		<div class="info-box" data-animate="4">
			<i class="fas fa-info-circle info-icon" aria-hidden="true"></i>
			<div class="info-text">
				<p>{t('moderation_appeal_info')}</p>
			</div>
		</div>

		<!-- Appeal form -->
		<div class="appeal-form" data-animate="5">
			<h3 class="section-title">{t('moderation_your_appeal')}</h3>
			<p class="form-description">
				{t('moderation_appeal_form_description')}
			</p>
			<textarea
				bind:value={appealReason}
				placeholder={t('moderation_appeal_placeholder')}
				rows="4"
				disabled={isSubmitting}
			></textarea>
		</div>

		<!-- Error display -->
		{#if submitError}
			<div class="error-box" data-animate="6">
				<i class="fas fa-exclamation-circle" aria-hidden="true"></i>
				<span>{submitError}</span>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<ModalFooter>
			<button class="secondary" onclick={handleClose} disabled={isSubmitting}>
				{t('moderation_cancel')}
			</button>
			<button class="primary" onclick={handleSubmit} disabled={isSubmitting || !appealReason.trim()}>
				{#if isSubmitting}
					<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
					{t('moderation_submitting')}
				{:else}
					{t('moderation_submit_appeal')}
				{/if}
			</button>
		</ModalFooter>
	{/snippet}
</BaseModal>

<style>
	.appeal-content {
		padding: var(--modal-padding, 24px);
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.section-title {
		margin: 0 0 8px 0;
		font-size: var(--font-size-min, 14px);
		font-weight: 600;
		color: var(--theme-text, rgba(255, 255, 255, 0.9));
	}

	/* Flagged content display */
	.flagged-section {
		text-align: center;
	}

	.flagged-word {
		display: inline-block;
		padding: 12px 24px;
		font-size: 18px;
		font-weight: 700;
		font-family: var(--font-mono, monospace);
		letter-spacing: 2px;
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
		border-radius: 8px;
		color: color-mix(in srgb, var(--semantic-error, #ef4444) 55%, white);
	}

	/* Reasons list */
	.reasons-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.reasons-list li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
		border-radius: 6px;
	}

	.reason-category {
		padding: 2px 8px;
		font-size: var(--font-size-compact, 12px);
		font-weight: 600;
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
		border-radius: 4px;
		color: color-mix(in srgb, var(--semantic-error, #ef4444) 55%, white);
	}

	.reason-term {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
		font-family: var(--font-mono, monospace);
	}

	/* Info box */
	.info-box {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 14px;
		background: color-mix(in srgb, var(--semantic-info, #3b82f6) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--semantic-info, #3b82f6) 20%, transparent);
		border-radius: 8px;
	}

	.info-icon {
		flex-shrink: 0;
		color: color-mix(in srgb, var(--semantic-info, #3b82f6) 65%, white);
		margin-top: 2px;
	}

	.info-text p {
		margin: 0;
		font-size: var(--font-size-min, 14px);
		line-height: 1.5;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.85));
	}

	/* Appeal form */
	.form-description {
		margin: 0 0 12px 0;
		font-size: var(--font-size-min, 14px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
		line-height: 1.5;
	}

	textarea {
		width: 100%;
		padding: 12px;
		font-size: var(--font-size-min, 14px);
		font-family: inherit;
		line-height: 1.5;
		color: var(--theme-text, rgba(255, 255, 255, 0.9));
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 8px;
		resize: vertical;
		transition: border-color 0.2s ease;
	}

	textarea:focus {
		outline: none;
		border-color: var(--theme-accent, #3b82f6);
	}

	textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	textarea::placeholder {
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
	}

	/* Error box */
	.error-box {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
		border-radius: 8px;
		font-size: var(--font-size-min, 14px);
		color: color-mix(in srgb, var(--semantic-error, #ef4444) 55%, white);
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
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
		color: var(--theme-text, rgba(255, 255, 255, 0.9));
	}

	button.secondary:hover:not(:disabled) {
		background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.15));
	}

	button.primary {
		background: var(--theme-accent, #3b82f6);
		color: white;
	}

	button.primary:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Mobile responsive */
	@media (max-width: 480px) {
		.appeal-content {
			padding: var(--modal-padding-mobile, 20px);
		}

		.flagged-word {
			font-size: 16px;
			padding: 10px 18px;
		}
	}
</style>
