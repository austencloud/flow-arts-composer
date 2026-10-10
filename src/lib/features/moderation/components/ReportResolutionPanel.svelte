<script lang="ts">
	import { getReportResolver } from '#lib/features/moderation/get-report-resolver.js';
	import { toast } from '#lib/shared/toast/state/toast-state.svelte.js';
	import { adminReportsState } from '../state/admin-reports-state.svelte';
	import {
		REPORT_RESOLUTIONS,
		type ReportResolution,
		type UserReport
	} from '../domain/models/report-models';
	import { t } from '#lib/shared/i18n/i18n.svelte.js';

	interface Props {
		report: UserReport;
	}

	let { report }: Props = $props();

	let selectedResolution = $state<ReportResolution | null>(null);
	let adminNotes = $state('');
	let isSubmitting = $state(false);

	const resolutions = Object.entries(REPORT_RESOLUTIONS) as [
		ReportResolution,
		(typeof REPORT_RESOLUTIONS)[ReportResolution]
	][];

	async function handleResolve() {
		if (!selectedResolution) {
			toast.error(t('moderation_select_resolution'));
			return;
		}

		// Confirm if disabling account
		if (selectedResolution === 'account_disabled') {
			const confirmed = confirm(
				t('moderation_confirm_disable', { name: report.reportedUserDisplayName })
			);
			if (!confirmed) return;
		}

		isSubmitting = true;

		try {
			const reportResolver = getReportResolver();
			const updated = await reportResolver.resolve({
				reportId: report.id,
				resolution: selectedResolution,
				adminNotes: adminNotes || undefined
			});

			adminReportsState.updateLocalReport(updated);
			await adminReportsState.loadCounts();

			toast.success(t('moderation_resolved_success'));

			// Reset form
			selectedResolution = null;
			adminNotes = '';
		} catch (error) {
			const message = error instanceof Error ? error.message : t('moderation_resolve_failed');
			toast.error(message);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="resolution-panel">
	<h3>{t('moderation_resolve_report')}</h3>

	<div class="resolution-options">
		{#each resolutions as [key, config]}
			<button
				type="button"
				class="resolution-option"
				class:selected={selectedResolution === key}
				class:severity-high={config.severity === 'high'}
				onclick={() => (selectedResolution = key)}
				aria-pressed={selectedResolution === key}
			>
				<i class="fa-solid {config.icon}" aria-hidden="true"></i>
				<div class="option-content">
					<span class="option-label">{config.label}</span>
					<span class="option-description">{config.description}</span>
				</div>
			</button>
		{/each}
	</div>

	<div class="notes-field">
		<label for="admin-notes">{t('moderation_admin_notes')}</label>
		<textarea
			id="admin-notes"
			bind:value={adminNotes}
			placeholder={t('moderation_admin_notes_placeholder')}
			rows="3"
		></textarea>
	</div>

	<div class="actions">
		<button
			type="button"
			class="btn-primary"
			class:btn-danger={selectedResolution === 'account_disabled'}
			onclick={handleResolve}
			disabled={!selectedResolution || isSubmitting}
		>
			{#if isSubmitting}
				<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
				{t('moderation_resolving')}
			{:else if selectedResolution === 'account_disabled'}
				<i class="fa-solid fa-user-lock" aria-hidden="true"></i>
				{t('moderation_disable_and_resolve')}
			{:else}
				<i class="fa-solid fa-check" aria-hidden="true"></i>
				{t('moderation_resolve_report')}
			{/if}
		</button>
	</div>
</div>

<style>
	.resolution-panel {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md, 16px);
		padding: var(--spacing-md, 16px);
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: var(--radius-lg, 12px);
	}

	h3 {
		margin: 0;
		font-size: var(--font-size-md, 16px);
		font-weight: 600;
		color: var(--theme-text, #ffffff);
	}

	.resolution-options {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs, 4px);
	}

	.resolution-option {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm, 8px);
		padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.5));
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: var(--radius-md, 8px);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		width: 100%;
	}

	.resolution-option:hover {
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
	}

	.resolution-option.selected {
		border-color: var(--theme-accent, #3b82f6);
		background: color-mix(in srgb, var(--theme-accent, #3b82f6) 10%, transparent);
	}

	.resolution-option.severity-high:hover {
		border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 40%, transparent);
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 5%, transparent);
	}

	.resolution-option.severity-high.selected {
		border-color: var(--semantic-error, #ef4444);
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
	}

	.resolution-option i {
		width: 20px;
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		margin-top: 2px;
	}

	.resolution-option.selected i {
		color: var(--theme-accent, #3b82f6);
	}

	.resolution-option.severity-high.selected i {
		color: var(--semantic-error, #ef4444);
	}

	.option-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
	}

	.option-label {
		font-size: var(--font-size-min, 14px);
		font-weight: 500;
		color: var(--theme-text, #ffffff);
	}

	.option-description {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
	}

	.notes-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs, 4px);
	}

	.notes-field label {
		font-size: var(--font-size-min, 14px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
	}

	.notes-field textarea {
		width: 100%;
		padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.5));
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: var(--radius-md, 8px);
		color: var(--theme-text, #ffffff);
		font-size: var(--font-size-min, 14px);
		font-family: inherit;
		resize: vertical;
	}

	.notes-field textarea:focus {
		outline: none;
		border-color: var(--theme-accent, #3b82f6);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
	}

	.btn-primary {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs, 4px);
		padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
		background: var(--theme-accent, #3b82f6);
		border: none;
		border-radius: var(--radius-md, 8px);
		color: white;
		font-size: var(--font-size-min, 14px);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		min-height: 40px;
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
</style>
