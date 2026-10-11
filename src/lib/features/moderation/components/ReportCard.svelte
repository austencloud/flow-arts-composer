<script lang="ts">
	import type { UserReport } from '../domain/models/report-models';
	import {
		getCategoryConfig,
		getStatusConfig,
		formatReportDate
	} from '../domain/models/report-models';
	import { t } from '#lib/shared/i18n/i18n.svelte.js';

	interface Props {
		report: UserReport;
		isSelected?: boolean;
		onSelect: (reportId: string) => void;
	}

	let { report, isSelected = false, onSelect }: Props = $props();

	const categoryConfig = $derived(getCategoryConfig(report.category));
	const statusConfig = $derived(getStatusConfig(report.status));
</script>

<button
	class="report-card"
	class:selected={isSelected}
	onclick={() => onSelect(report.id)}
	aria-pressed={isSelected}
>
	<div class="card-header">
		<div class="category-badge">
			<i class="fa-solid {categoryConfig.icon}" aria-hidden="true"></i>
			<span>{categoryConfig.label}</span>
		</div>
		<div class="status-badge" style="--badge-color: {statusConfig.color}">
			<i class="fa-solid {statusConfig.icon}" aria-hidden="true"></i>
			<span>{statusConfig.label}</span>
		</div>
	</div>

	<div class="card-body">
		<div class="reported-user">
			<span class="label">{t('moderation_reported')}:</span>
			<span class="value">{report.reportedUserDisplayName}</span>
		</div>

		<p class="description">
			{report.description || t('moderation_no_description')}
		</p>
	</div>

	<div class="card-footer">
		<div class="reporter">
			<i class="fa-solid fa-user" aria-hidden="true"></i>
			<span>{report.reporterDisplayName}</span>
		</div>
		<time class="timestamp">{formatReportDate(report.createdAt)}</time>
	</div>
</button>

<style>
	.report-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm, 8px);
		padding: var(--spacing-md, 16px);
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: var(--radius-lg, 12px);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		width: 100%;
	}

	.report-card:hover {
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
		background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
	}

	.report-card.selected {
		border-color: var(--theme-accent, #3b82f6);
		background: color-mix(in srgb, var(--theme-accent, #3b82f6) 8%, transparent);
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm, 8px);
	}

	.category-badge,
	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs, 4px);
		padding: 4px 8px;
		border-radius: var(--radius-sm, 4px);
		font-size: var(--font-size-compact, 12px);
		font-weight: 500;
	}

	.category-badge {
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.5));
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
	}

	.status-badge {
		background: color-mix(in srgb, var(--badge-color) 15%, transparent);
		color: var(--badge-color);
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs, 4px);
	}

	.reported-user {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs, 4px);
		font-size: var(--font-size-min, 14px);
	}

	.reported-user .label {
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
	}

	.reported-user .value {
		font-weight: 600;
		color: var(--theme-text, #ffffff);
	}

	.description {
		margin: 0;
		font-size: var(--font-size-min, 14px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm, 8px);
		padding-top: var(--spacing-xs, 4px);
		border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
	}

	.reporter {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs, 4px);
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-tertiary, rgba(255, 255, 255, 0.5));
	}

	.reporter i {
		font-size: 10px;
	}

	.timestamp {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-tertiary, rgba(255, 255, 255, 0.5));
	}
</style>
