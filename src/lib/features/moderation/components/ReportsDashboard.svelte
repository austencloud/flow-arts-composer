<script lang="ts">
	import { onMount } from 'svelte';
	import { adminReportsState } from '../state/admin-reports-state.svelte';
	import { REPORT_STATUSES, REPORT_CATEGORIES, type ReportStatus, type ReportCategory } from '../domain/models/report-models';
	import ReportCard from './ReportCard.svelte';
	import ReportDetailPanel from './ReportDetailPanel.svelte';
	import { t, tDynamic } from '#lib/shared/i18n/i18n.svelte.js';

	const statusTabs: { key: ReportStatus | 'all'; labelKey: string }[] = [
		{ key: 'all', labelKey: 'moderation_tab_all' },
		{ key: 'new', labelKey: 'moderation_tab_new' },
		{ key: 'reviewing', labelKey: 'moderation_tab_reviewing' },
		{ key: 'resolved', labelKey: 'moderation_tab_resolved' }
	];

	const categoryOptions: { key: ReportCategory | 'all'; label: string }[] = [
		{ key: 'all', label: t('moderation_all_categories') },
		...Object.entries(REPORT_CATEGORIES).map(([key, config]) => ({
			key: key as ReportCategory,
			label: config.label
		}))
	];

	let activeTab = $state<ReportStatus | 'all'>('new');
	let selectedCategory = $state<ReportCategory | 'all'>('all');

	onMount(() => {
		adminReportsState.loadReports();
		adminReportsState.loadCounts();
		adminReportsState.subscribeToNewReports();

		return () => {
			adminReportsState.cleanup();
		};
	});

	async function handleTabChange(tab: ReportStatus | 'all') {
		activeTab = tab;
		const status = tab === 'all' ? undefined : tab;
		const category = selectedCategory === 'all' ? undefined : selectedCategory;
		await adminReportsState.setFilters({ status, category });
	}

	async function handleCategoryChange(category: ReportCategory | 'all') {
		selectedCategory = category;
		const status = activeTab === 'all' ? undefined : activeTab;
		const cat = category === 'all' ? undefined : category;
		await adminReportsState.setFilters({ status, category: cat });
	}

	function handleSelectReport(reportId: string) {
		adminReportsState.selectReport(reportId);
	}

	function handleLoadMore() {
		adminReportsState.loadMoreReports();
	}

	function handleCloseMobileDrawer() {
		adminReportsState.closeMobileDetail();
	}

	function handleMobileBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleCloseMobileDrawer();
		}
	}

	function handleMobileKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleCloseMobileDrawer();
		}
	}

	function getTabCount(tab: ReportStatus | 'all'): number {
		if (tab === 'all') {
			return (
				adminReportsState.counts.new +
				adminReportsState.counts.reviewing +
				adminReportsState.counts.resolved
			);
		}
		return adminReportsState.counts[tab];
	}
</script>

<div class="dashboard">
	<!-- Header -->
	<header class="dashboard-header">
		<h1>
			<i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
			{t('moderation_user_reports')}
		</h1>
		{#if adminReportsState.counts.new > 0}
			<span class="new-badge">{t('moderation_new_count', { count: adminReportsState.counts.new })}</span>
		{/if}
	</header>

	<!-- Content Area -->
	<div class="dashboard-content">
		<!-- Reports List -->
		<div class="reports-list-panel">
			<!-- Filters Row -->
			<div class="filters-row">
				<!-- Status Tabs -->
				<div class="status-tabs" role="tablist">
					{#each statusTabs as tab}
						<button
							type="button"
							class="tab-btn"
							class:active={activeTab === tab.key}
							onclick={() => handleTabChange(tab.key)}
							role="tab"
							aria-selected={activeTab === tab.key}
						>
							<span class="tab-label">{tDynamic(tab.labelKey, { silent: true })}</span>
							{#if getTabCount(tab.key) > 0}
								<span class="tab-count">{getTabCount(tab.key)}</span>
							{/if}
						</button>
					{/each}
				</div>

				<!-- Category Filter -->
				<div class="category-filter">
					<select
						value={selectedCategory}
						onchange={(e) => handleCategoryChange((e.target as HTMLSelectElement).value as ReportCategory | 'all')}
						aria-label={t('moderation_filter_by_category')}
					>
						{#each categoryOptions as option}
							<option value={option.key}>{option.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Reports List -->
			<div class="reports-list">
				{#if adminReportsState.isLoading}
					<div class="loading-state">
						<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
						<span>{t('moderation_loading_reports')}</span>
					</div>
				{:else if adminReportsState.error}
					<div class="error-state">
						<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
						<span>{adminReportsState.error}</span>
						<button type="button" onclick={() => adminReportsState.loadReports()}>
							{t('moderation_retry')}
						</button>
					</div>
				{:else if adminReportsState.reports.length === 0}
					<div class="empty-state">
						<i class="fa-solid fa-inbox" aria-hidden="true"></i>
						<span>{t('moderation_no_reports')}</span>
					</div>
				{:else}
					{#each adminReportsState.reports as report (report.id)}
						<ReportCard
							{report}
							isSelected={adminReportsState.selectedReport?.id === report.id}
							onSelect={handleSelectReport}
						/>
					{/each}

					<!-- {t('moderation_load_more')} Button -->
					{#if adminReportsState.hasMore}
						<button
							type="button"
							class="load-more-btn"
							onclick={handleLoadMore}
							disabled={adminReportsState.isLoadingMore}
						>
							{#if adminReportsState.isLoadingMore}
								<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
								{t('moderation_loading')}
							{:else}
								<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
								{t('moderation_load_more')}
							{/if}
						</button>
					{/if}
				{/if}
			</div>
		</div>

		<!-- Detail Panel (Desktop) -->
		<div class="detail-panel-container desktop-only">
			<ReportDetailPanel />
		</div>
	</div>
</div>

<!-- Mobile Detail Drawer -->
{#if adminReportsState.mobileDetailOpen}
	<div
		class="mobile-drawer-backdrop"
		onclick={handleMobileBackdropClick}
		onkeydown={handleMobileKeydown}
		role="dialog"
		aria-modal="true"
		aria-label={t('moderation_report_details')}
		tabindex="-1"
	>
		<div class="mobile-drawer">
			<ReportDetailPanel />
		</div>
	</div>
{/if}

<style>
	.dashboard {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
	}

	.dashboard-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-md, 16px);
		padding: var(--spacing-lg, 24px) var(--spacing-xl, 32px);
		border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
	}

	.dashboard-header h1 {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm, 8px);
		margin: 0;
		font-size: var(--font-size-2xl, 24px);
		font-weight: 700;
		color: var(--theme-text, #ffffff);
	}

	.dashboard-header h1 i {
		color: var(--theme-accent, #3b82f6);
	}

	.new-badge {
		display: inline-flex;
		align-items: center;
		padding: 4px 12px;
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 15%, transparent);
		border-radius: var(--radius-full, 9999px);
		font-size: var(--font-size-min, 14px);
		font-weight: 600;
		color: var(--semantic-error, #ef4444);
	}

	.dashboard-content {
		display: grid;
		grid-template-columns: 1fr 400px;
		flex: 1;
		overflow: hidden;
	}

	.reports-list-panel {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.filters-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md, 16px);
		padding: var(--spacing-md, 16px) var(--spacing-lg, 24px);
		border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		flex-wrap: wrap;
	}

	.status-tabs {
		display: flex;
		gap: var(--spacing-xs, 4px);
	}

	.tab-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs, 4px);
		padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-md, 8px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
		font-size: var(--font-size-min, 14px);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tab-btn:hover {
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		color: var(--theme-text, #ffffff);
	}

	.tab-btn.active {
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
		border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
		color: var(--theme-text, #ffffff);
	}

	.tab-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: var(--radius-full, 9999px);
		font-size: var(--font-size-compact, 12px);
		font-weight: 600;
	}

	.tab-btn.active .tab-count {
		background: var(--theme-accent, #3b82f6);
		color: white;
	}

	.category-filter select {
		padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: var(--radius-md, 8px);
		color: var(--theme-text, #ffffff);
		font-size: var(--font-size-min, 14px);
		cursor: pointer;
		min-width: 160px;
	}

	.category-filter select:focus {
		outline: none;
		border-color: var(--theme-accent, #3b82f6);
	}

	.category-filter select option {
		background: var(--theme-panel-bg, #1a1a2e);
		color: var(--theme-text, #ffffff);
	}

	.reports-list {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-md, 16px) var(--spacing-lg, 24px);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm, 8px);
	}

	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-xl, 48px);
		gap: var(--spacing-md, 16px);
		color: var(--theme-text-tertiary, rgba(255, 255, 255, 0.4));
	}

	.loading-state i,
	.error-state i,
	.empty-state i {
		font-size: 32px;
	}

	.error-state {
		color: var(--semantic-error, #ef4444);
	}

	.error-state button {
		padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
		border-radius: var(--radius-md, 8px);
		color: var(--theme-text, #ffffff);
		cursor: pointer;
	}

	.load-more-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-xs, 4px);
		padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: var(--radius-md, 8px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		font-size: var(--font-size-min, 14px);
		cursor: pointer;
		transition: all 0.15s ease;
		margin-top: var(--spacing-sm, 8px);
	}

	.load-more-btn:hover:not(:disabled) {
		background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
		color: var(--theme-text, #ffffff);
	}

	.load-more-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.detail-panel-container {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Mobile Drawer */
	.mobile-drawer-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		z-index: var(--z-modal);
		display: none;
		animation: fadeIn 0.15s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.mobile-drawer {
		position: absolute;
		right: 0;
		top: 0;
		bottom: 0;
		width: 100%;
		max-width: 400px;
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
		animation: slideIn 0.2s ease;
	}

	@keyframes slideIn {
		from { transform: translateX(100%); }
		to { transform: translateX(0); }
	}

	/* Mobile Layout */
	@media (max-width: 900px) {
		.dashboard-header {
			padding: var(--spacing-md, 16px);
		}

		.dashboard-header h1 {
			font-size: var(--font-size-lg, 18px);
		}

		.dashboard-content {
			grid-template-columns: 1fr;
		}

		.desktop-only {
			display: none;
		}

		.mobile-drawer-backdrop {
			display: block;
		}

		.filters-row {
			flex-direction: column;
			align-items: stretch;
			gap: var(--spacing-sm, 8px);
			padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
		}

		.status-tabs {
			overflow-x: auto;
			padding-bottom: var(--spacing-xs, 4px);
		}

		.category-filter select {
			width: 100%;
		}

		.reports-list {
			padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
		}
	}
</style>
