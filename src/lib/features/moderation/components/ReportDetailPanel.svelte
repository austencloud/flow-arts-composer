<script lang="ts">
	import { adminReportsState } from '../state/admin-reports-state.svelte';
	import {
		getCategoryConfig,
		getStatusConfig,
		getResolutionConfig,
		formatReportDate
	} from '../domain/models/report-models';
	import ReportResolutionPanel from './ReportResolutionPanel.svelte';
	import { t } from '#lib/shared/i18n/i18n.svelte.js';

	const report = $derived(adminReportsState.selectedReport);
	const categoryConfig = $derived(report ? getCategoryConfig(report.category) : null);
	const statusConfig = $derived(report ? getStatusConfig(report.status) : null);
	const resolutionConfig = $derived(
		report?.resolution ? getResolutionConfig(report.resolution) : null
	);

	async function handleStartReview() {
		if (!report) return;
		try {
			await adminReportsState.startReview(report.id);
		} catch {
			// Error already handled in state
		}
	}
</script>

{#if report}
	<div class="detail-panel">
		<header class="panel-header">
			<h2>{t('moderation_report_details')}</h2>
			<button
				type="button"
				class="close-btn"
				onclick={() => adminReportsState.clearSelectedReport()}
				aria-label={t('moderation_close_details')}
			>
				<i class="fa-solid fa-xmark" aria-hidden="true"></i>
			</button>
		</header>

		<div class="panel-body">
			<!-- Status & Category -->
			<div class="badges-row">
				{#if categoryConfig}
					<div class="badge category-badge">
						<i class="fa-solid {categoryConfig.icon}" aria-hidden="true"></i>
						<span>{categoryConfig.label}</span>
					</div>
				{/if}
				{#if statusConfig}
					<div class="badge status-badge" style="--badge-color: {statusConfig.color}">
						<i class="fa-solid {statusConfig.icon}" aria-hidden="true"></i>
						<span>{statusConfig.label}</span>
					</div>
				{/if}
			</div>

			<!-- Reported User -->
			<section class="section">
				<h3>{t('moderation_reported_user')}</h3>
				<div class="user-info">
					<div class="info-row">
						<span class="label">{t('moderation_name')}:</span>
						<span class="value">{report.reportedUserDisplayName}</span>
					</div>
					<div class="info-row">
						<span class="label">{t('moderation_user_id')}:</span>
						<code class="value-code">{report.reportedUserId}</code>
					</div>
				</div>
			</section>

			<!-- {t('moderation_description')} -->
			<section class="section">
				<h3>{t('moderation_description')}</h3>
				<p class="description">{report.description || t('moderation_no_description')}</p>
			</section>

			<!-- Reporter -->
			<section class="section">
				<h3>{t('moderation_reported_by')}</h3>
				<div class="user-info">
					<div class="info-row">
						<span class="label">{t('moderation_name')}:</span>
						<span class="value">{report.reporterDisplayName}</span>
					</div>
					<div class="info-row">
						<span class="label">{t('moderation_date')}:</span>
						<span class="value">{formatReportDate(report.createdAt)}</span>
					</div>
				</div>
			</section>

			<!-- {t('moderation_resolution')} (if resolved) -->
			{#if report.resolution && resolutionConfig}
				<section class="section">
					<h3>{t('moderation_resolution')}</h3>
					<div class="resolution-info">
						<div class="resolution-badge" class:severity-high={resolutionConfig.severity === 'high'}>
							<i class="fa-solid {resolutionConfig.icon}" aria-hidden="true"></i>
							<span>{resolutionConfig.label}</span>
						</div>
						{#if report.adminNotes}
							<p class="admin-notes">{report.adminNotes}</p>
						{/if}
						{#if report.resolvedAt}
							<p class="resolved-date">{t('moderation_resolved')}: {formatReportDate(report.resolvedAt)}</p>
						{/if}
					</div>
				</section>
			{/if}

			<!-- Actions -->
			{#if report.status === 'new'}
				<section class="section">
					<button type="button" class="btn-secondary" onclick={handleStartReview}>
						<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
						{t('moderation_start_review')}
					</button>
				</section>
			{/if}

			{#if report.status === 'reviewing'}
				<ReportResolutionPanel {report} />
			{/if}
		</div>
	</div>
{:else}
	<div class="empty-state">
		<i class="fa-solid fa-file-lines" aria-hidden="true"></i>
		<p>{t('moderation_select_report')}</p>
	</div>
{/if}

<style>
	.detail-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
		border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md, 16px);
		border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
	}

	.panel-header h2 {
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

	.panel-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-md, 16px);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg, 24px);
	}

	.badges-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm, 8px);
		flex-wrap: wrap;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs, 4px);
		padding: 6px 12px;
		border-radius: var(--radius-md, 8px);
		font-size: var(--font-size-min, 14px);
		font-weight: 500;
	}

	.category-badge {
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
		color: var(--theme-text, #ffffff);
	}

	.status-badge {
		background: color-mix(in srgb, var(--badge-color) 15%, transparent);
		color: var(--badge-color);
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm, 8px);
	}

	.section h3 {
		margin: 0;
		font-size: var(--font-size-min, 14px);
		font-weight: 600;
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.user-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs, 4px);
	}

	.info-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm, 8px);
		font-size: var(--font-size-min, 14px);
	}

	.info-row .label {
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
		min-width: 60px;
	}

	.info-row .value {
		color: var(--theme-text, #ffffff);
	}

	.value-code {
		font-family: monospace;
		font-size: var(--font-size-compact, 12px);
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		padding: 2px 6px;
		border-radius: var(--radius-sm, 4px);
	}

	.description {
		margin: 0;
		font-size: var(--font-size-min, 14px);
		color: var(--theme-text, #ffffff);
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.resolution-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm, 8px);
	}

	.resolution-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs, 4px);
		padding: 6px 12px;
		background: color-mix(in srgb, var(--semantic-success, #22c55e) 15%, transparent);
		border-radius: var(--radius-md, 8px);
		font-size: var(--font-size-min, 14px);
		font-weight: 500;
		color: var(--semantic-success, #22c55e);
		width: fit-content;
	}

	.resolution-badge.severity-high {
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 15%, transparent);
		color: var(--semantic-error, #ef4444);
	}

	.admin-notes {
		margin: 0;
		font-size: var(--font-size-min, 14px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		font-style: italic;
	}

	.resolved-date {
		margin: 0;
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-tertiary, rgba(255, 255, 255, 0.5));
	}

	.btn-secondary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-xs, 4px);
		padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
		border-radius: var(--radius-md, 8px);
		color: var(--theme-text, #ffffff);
		font-size: var(--font-size-min, 14px);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		width: fit-content;
	}

	.btn-secondary:hover {
		background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: var(--spacing-md, 16px);
		color: var(--theme-text-tertiary, rgba(255, 255, 255, 0.4));
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
		border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
	}

	.empty-state i {
		font-size: 48px;
	}

	.empty-state p {
		margin: 0;
		font-size: var(--font-size-min, 14px);
	}
</style>
