<script lang="ts">
	import { onMount } from 'svelte';
	import { reportModalState } from '../state/report-modal-state.svelte';
	import { getReportSubmitter } from '#lib/features/moderation/get-report-submitter.js';
	import { toast } from '#lib/shared/toast/state/toast-state.svelte.js';
	import ReportCategorySelector from './ReportCategorySelector.svelte';
	import type { ReportCategory } from '../domain/models/report-models';
	import { t } from '#lib/shared/i18n/i18n.svelte.js';

	const MAX_DESCRIPTION_LENGTH = 1000;

	let modalContentRef = $state<HTMLDivElement | null>(null);
	let previouslyFocusedElement: HTMLElement | null = null;

	// Focus trap: get all focusable elements within the modal
	function getFocusableElements(): HTMLElement[] {
		if (!modalContentRef) return [];
		return Array.from(
			modalContentRef.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		);
	}

	// Focus trap: handle Tab key to keep focus within modal
	function handleFocusTrap(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;

		const focusableElements = getFocusableElements();
		if (focusableElements.length === 0) return;

		const firstElement = focusableElements[0];
		const lastElement = focusableElements[focusableElements.length - 1];

		if (event.shiftKey) {
			// Shift+Tab: if on first element, wrap to last
			if (document.activeElement === firstElement && lastElement) {
				event.preventDefault();
				lastElement.focus();
			}
		} else {
			// Tab: if on last element, wrap to first
			if (document.activeElement === lastElement && firstElement) {
				event.preventDefault();
				firstElement.focus();
			}
		}
	}

	// Store previous focus and set initial focus when modal opens
	$effect(() => {
		if (reportModalState.isOpen) {
			previouslyFocusedElement = document.activeElement as HTMLElement;
			// Focus the first focusable element after render
			requestAnimationFrame(() => {
				const focusable = getFocusableElements();
				if (focusable.length > 0 && focusable[0]) {
					focusable[0].focus();
				}
			});
		} else if (previouslyFocusedElement) {
			// Restore focus when modal closes
			previouslyFocusedElement.focus();
			previouslyFocusedElement = null;
		}
	});

	function handleCategorySelect(category: ReportCategory) {
		reportModalState.setCategory(category);
	}

	function handleDescriptionInput(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		reportModalState.setDescription(target.value);
	}

	async function handleSubmit() {
		if (!reportModalState.validate()) {
			return;
		}

		if (!reportModalState.targetUser) {
			reportModalState.setError(t('moderation_no_user_selected'));
			return;
		}

		reportModalState.setSubmitting(true);
		reportModalState.setError(null);

		try {
			const reportSubmitter = getReportSubmitter();
			await reportSubmitter.submit({
				reportedUserId: reportModalState.targetUser.id,
				reportedUserDisplayName: reportModalState.targetUser.displayName,
				category: reportModalState.selectedCategory!,
				description: reportModalState.description
			});

			reportModalState.setSuccess();
			toast.success(t('moderation_report_submitted_success'));
		} catch (error) {
			const message = error instanceof Error ? error.message : t('moderation_submit_failed');
			reportModalState.setError(message);
			toast.error(message);
		} finally {
			reportModalState.setSubmitting(false);
		}
	}

	function handleClose() {
		reportModalState.close();
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleClose();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClose();
		}
		handleFocusTrap(event);
	}
</script>

{#if reportModalState.isOpen}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="modal-backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="report-modal-title"
		tabindex="-1"
		bind:this={modalContentRef}
	>
		<div class="modal-content">
			{#if reportModalState.success}
				<!-- Success State -->
				<div class="success-state">
					<div class="success-icon">
						<i class="fa-solid fa-check-circle" aria-hidden="true"></i>
					</div>
					<h2 id="report-modal-title">{t('moderation_report_submitted')}</h2>
					<p>{t('moderation_report_submitted_message')}</p>
					<button type="button" class="btn-primary" onclick={handleClose}>
						{t('moderation_done')}
					</button>
				</div>
			{:else}
				<!-- Report Form -->
				<header class="modal-header">
					<h2 id="report-modal-title">{t('moderation_report_user')}</h2>
					<button
						type="button"
						class="close-btn"
						onclick={handleClose}
						aria-label={t('moderation_close_modal')}
					>
						<i class="fa-solid fa-xmark" aria-hidden="true"></i>
					</button>
				</header>

				<div class="modal-body">
					{#if reportModalState.targetUser}
						<div class="target-user">
							<span class="target-label">{t('moderation_reporting')}:</span>
							<span class="target-name">{reportModalState.targetUser.displayName}</span>
						</div>
					{/if}

					<ReportCategorySelector
						selected={reportModalState.selectedCategory}
						onSelect={handleCategorySelect}
					/>

					<div class="description-field">
						<label for="report-description">
							{t('moderation_additional_details')}
							{#if reportModalState.selectedCategory === 'other'}
								<span class="required">({t('moderation_required')})</span>
							{:else}
								<span class="optional">({t('moderation_optional')})</span>
							{/if}
						</label>
						<textarea
							id="report-description"
							placeholder={t('moderation_description_placeholder')}
							value={reportModalState.description}
							oninput={handleDescriptionInput}
							rows="4"
							maxlength={MAX_DESCRIPTION_LENGTH}
						></textarea>
						<div class="char-count">
							{reportModalState.description.length}/{MAX_DESCRIPTION_LENGTH}
						</div>
					</div>

					{#if reportModalState.error}
						<div class="error-message" role="alert">
							<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
							{reportModalState.error}
						</div>
					{/if}
				</div>

				<footer class="modal-footer">
					<button type="button" class="btn-secondary" onclick={handleClose}>
						{t('moderation_cancel')}
					</button>
					<button
						type="button"
						class="btn-primary btn-danger"
						onclick={handleSubmit}
						disabled={!reportModalState.canSubmit}
					>
						{#if reportModalState.isSubmitting}
							<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
							{t('moderation_submitting')}
						{:else}
							<i class="fa-solid fa-flag" aria-hidden="true"></i>
							{t('moderation_submit_report')}
						{/if}
					</button>
				</footer>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: var(--z-modal);
		padding: var(--spacing-md, 16px);
		animation: fadeIn 0.15s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal-content {
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: var(--radius-lg, 12px);
		width: 100%;
		max-width: 480px;
		max-height: 90vh;
		overflow-y: auto;
		animation: slideUp 0.2s ease;
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md, 16px);
		border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
	}

	.modal-header h2 {
		margin: 0;
		font-size: var(--font-size-lg, 18px);
		font-weight: 600;
		color: var(--theme-text, #ffffff);
	}

	.close-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm, 6px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
		color: var(--theme-text, #ffffff);
	}

	.modal-body {
		padding: var(--spacing-md, 16px);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md, 16px);
	}

	.target-user {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm, 8px);
		padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border-radius: var(--radius-md, 8px);
	}

	.target-label {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
	}

	.target-name {
		font-size: var(--font-size-min, 14px);
		font-weight: 500;
		color: var(--theme-text, #ffffff);
	}

	.description-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs, 4px);
	}

	.description-field label {
		font-size: var(--font-size-min, 14px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
	}

	.required {
		color: var(--semantic-error, #ef4444);
	}

	.optional {
		color: var(--theme-text-tertiary, rgba(255, 255, 255, 0.4));
	}

	.description-field textarea {
		width: 100%;
		padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: var(--radius-md, 8px);
		color: var(--theme-text, #ffffff);
		font-size: var(--font-size-min, 14px);
		font-family: inherit;
		resize: vertical;
		min-height: 80px;
	}

	.description-field textarea::placeholder {
		color: var(--theme-text-tertiary, rgba(255, 255, 255, 0.4));
	}

	.description-field textarea:focus {
		outline: none;
		border-color: var(--theme-accent, #3b82f6);
	}

	.char-count {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-tertiary, rgba(255, 255, 255, 0.4));
		text-align: right;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm, 8px);
		padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
		border-radius: var(--radius-md, 8px);
		color: var(--semantic-error, #ef4444);
		font-size: var(--font-size-min, 14px);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-sm, 8px);
		padding: var(--spacing-md, 16px);
		border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
	}

	.btn-secondary,
	.btn-primary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-xs, 4px);
		padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
		border-radius: var(--radius-md, 8px);
		font-size: var(--font-size-min, 14px);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		min-height: 40px;
	}

	.btn-secondary {
		background: transparent;
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
		color: var(--theme-text, #ffffff);
	}

	.btn-secondary:hover {
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
	}

	.btn-primary {
		background: var(--theme-accent, #3b82f6);
		border: none;
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--theme-accent-hover, #2563eb);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-danger {
		background: var(--semantic-error, #ef4444);
	}

	.btn-danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 88%, black);
	}

	/* Success State */
	.success-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--spacing-xl, 32px) var(--spacing-md, 16px);
		text-align: center;
		gap: var(--spacing-md, 16px);
	}

	.success-icon {
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--semantic-success, #22c55e) 10%, transparent);
		border-radius: 50%;
		color: var(--semantic-success, #22c55e);
		font-size: 32px;
	}

	.success-state h2 {
		margin: 0;
		font-size: var(--font-size-xl, 20px);
		font-weight: 600;
		color: var(--theme-text, #ffffff);
	}

	.success-state p {
		margin: 0;
		font-size: var(--font-size-min, 14px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		max-width: 320px;
	}
</style>
