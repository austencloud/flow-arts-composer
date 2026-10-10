<!--
  TIKA Review Panel - Unified Review Workflow

  Single source of truth for reviewing Tika conversations.
  Replaces the old dual-source (Firestore + file-based evaluations) approach.

  Workflow:
  - Conversations are flagged by users → status: "pending"
  - /tika command claims and reviews → status: "claimed" → "approved" | "in-review" | "needs-correction"
  - Human reviews AI's assessment → can approve, request correction, or archive
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/env';
	import * as tikaSessionRepository from '../services/tika-session-repository';
	import { formatForAIReview } from '../services/tika-session-formatter';
	import { authState } from '#lib/shared/auth/state/auth-state.svelte.js';
	import type { TikaSession, ReviewStatus } from '../domain/models/tika-conversation-models';
	import CopyAsImageButton from '#lib/shared/foundation/ui/CopyAsImageButton.svelte';
	import CopyForAIButton from '#lib/shared/foundation/ui/CopyForAIButton.svelte';
	import TikaConversationReadOnly from './TikaConversationReadOnly.svelte';

	// Props
	let { onBack, onLoadSession }: {
		onBack?: () => void;
		onLoadSession?: (sessionId: string) => void;
	} = $props();

	// Services - use module functions directly (only on browser for Firestore)
	const sessionRepository = browser ? tikaSessionRepository : null;

	// State
	let sessions = $state<TikaSession[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedSession = $state<TikaSession | null>(null);

	// Filter state - which status tabs to show
	type FilterTab = 'pending' | 'in-review' | 'completed' | 'all';
	let activeTab = $state<FilterTab>('pending');

	// Notes input state
	let notesInput = $state('');
	let savingNotes = $state(false);

	// Check if user is authenticated
	const isAuthenticated = $derived(authState.isAuthenticated);

	// Filter sessions by active tab
	const filteredSessions = $derived.by(() => {
		if (activeTab === 'all') return sessions;
		if (activeTab === 'pending') {
			return sessions.filter(s => s.reviewStatus === 'pending');
		}
		if (activeTab === 'in-review') {
			return sessions.filter(s =>
				s.reviewStatus === 'claimed' ||
				s.reviewStatus === 'in-review' ||
				s.reviewStatus === 'needs-correction'
			);
		}
		if (activeTab === 'completed') {
			return sessions.filter(s =>
				s.reviewStatus === 'approved' ||
				s.reviewStatus === 'archived'
			);
		}
		return sessions;
	});

	// Count by status for tab badges
	const statusCounts = $derived.by(() => {
		const pending = sessions.filter(s => s.reviewStatus === 'pending').length;
		const inReview = sessions.filter(s =>
			s.reviewStatus === 'claimed' ||
			s.reviewStatus === 'in-review' ||
			s.reviewStatus === 'needs-correction'
		).length;
		const completed = sessions.filter(s =>
			s.reviewStatus === 'approved' ||
			s.reviewStatus === 'archived'
		).length;
		return { pending, inReview, completed };
	});

	// Load sessions from Firestore
	async function loadSessions() {
		if (!sessionRepository || !isAuthenticated) {
			loading = false;
			return;
		}

		loading = true;
		error = null;

		try {
			// Get all flagged sessions (they all have review status)
			sessions = await sessionRepository.getReviewQueue();
		} catch (e) {
			console.error('[TikaReviewPanel] Failed to load sessions:', e);
			error = 'Failed to load review queue';
		} finally {
			loading = false;
		}
	}

	// Get status indicator info
	function getStatusInfo(status: ReviewStatus | undefined): {
		color: string;
		icon: string;
		label: string;
	} {
		switch (status) {
			case 'pending':
				return { color: '#f59e0b', icon: 'fa-flag', label: 'Pending' };
			case 'claimed':
				return { color: '#3b82f6', icon: 'fa-robot', label: 'Claimed by AI' };
			case 'in-review':
				return { color: '#8b5cf6', icon: 'fa-user-check', label: 'In Review' };
			case 'approved':
				return { color: '#22c55e', icon: 'fa-check-circle', label: 'Approved' };
			case 'needs-correction':
				return { color: '#ef4444', icon: 'fa-exclamation-circle', label: 'Needs Fix' };
			case 'archived':
				return { color: '#64748b', icon: 'fa-archive', label: 'Archived' };
			default:
				return { color: '#64748b', icon: 'fa-question', label: 'Unknown' };
		}
	}

	// Format relative time
	function formatRelativeTime(date: Date | undefined): string {
		if (!date) return 'Unknown';
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const hours = Math.floor(diff / (1000 * 60 * 60));
		if (hours < 1) return 'Just now';
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	// Save notes for a session
	async function saveNotes() {
		if (!sessionRepository || !selectedSession || !notesInput.trim()) return;

		savingNotes = true;
		try {
			await sessionRepository.addReviewNotes(selectedSession.id, notesInput);
			// Update local state
			const idx = sessions.findIndex(s => s.id === selectedSession!.id);
			if (idx >= 0) {
				const currentSession = sessions[idx];
				if (currentSession) {
					const updatedSession: TikaSession = {
						...currentSession,
						reviewMetadata: {
							...(currentSession.reviewMetadata || {}),
							notes: notesInput,
						}
					};
					sessions = [...sessions.slice(0, idx), updatedSession, ...sessions.slice(idx + 1)];
					selectedSession = updatedSession;
				}
			}
		} catch (e) {
			console.error('[TikaReviewPanel] Failed to save notes:', e);
			error = 'Failed to save notes';
		} finally {
			savingNotes = false;
		}
	}

	// Archive a session
	async function archiveSession(sessionId: string) {
		if (!sessionRepository) return;

		try {
			await sessionRepository.archiveReview(sessionId);
			// Update local state
			const idx = sessions.findIndex(s => s.id === sessionId);
			if (idx >= 0) {
				const currentSession = sessions[idx];
				if (currentSession) {
					const updatedSession: TikaSession = { ...currentSession, reviewStatus: 'archived' as const };
					sessions = [...sessions.slice(0, idx), updatedSession, ...sessions.slice(idx + 1)];
					if (selectedSession?.id === sessionId) {
						selectedSession = updatedSession;
					}
				}
			}
		} catch (e) {
			console.error('[TikaReviewPanel] Failed to archive session:', e);
			error = 'Failed to archive session';
		}
	}

	// Approve a session (after human review)
	async function approveSession(sessionId: string) {
		if (!sessionRepository) return;

		try {
			await sessionRepository.updateReviewStatus(sessionId, 'approved');
			// Update local state
			const idx = sessions.findIndex(s => s.id === sessionId);
			if (idx >= 0) {
				const currentSession = sessions[idx];
				if (currentSession) {
					const updatedSession: TikaSession = { ...currentSession, reviewStatus: 'approved' as const };
					sessions = [...sessions.slice(0, idx), updatedSession, ...sessions.slice(idx + 1)];
					if (selectedSession?.id === sessionId) {
						selectedSession = updatedSession;
					}
				}
			}
		} catch (e) {
			console.error('[TikaReviewPanel] Failed to approve session:', e);
			error = 'Failed to approve session';
		}
	}

	// Open conversation in chat
	function openInChat(session: TikaSession) {
		if (onLoadSession) {
			onLoadSession(session.id);
			onBack?.();
		}
	}

	// Handle session selection
	function selectSession(session: TikaSession) {
		selectedSession = session;
		notesInput = session.reviewMetadata?.notes || '';
	}

	// Reference for image capture - will be set by the TikaConversationReadOnly component
	let conversationReadOnlyComponent = $state<ReturnType<typeof TikaConversationReadOnly> | null>(null);
	let conversationPreviewEl: HTMLElement | null = $derived(
		conversationReadOnlyComponent?.getContainerElement() ?? null
	);

	// Generate comprehensive conversation data for AI review (delegated to service)
	function generateCopyForAI(): string {
		if (!selectedSession) return '';
		return formatForAIReview(selectedSession);
	}

	onMount(() => {
		loadSessions();
	});
</script>

<div class="review-panel">
	<header class="panel-header">
		{#if onBack}
			<button class="back-btn" onclick={onBack} title="Back to conversation" aria-label="Back to conversation">
				<i class="fas fa-arrow-left" aria-hidden="true"></i>
			</button>
		{/if}
		<div class="header-content">
			<h2>Tika Review</h2>
		</div>
		<button aria-label="Refresh review queue"
			class="refresh-btn"
			onclick={loadSessions}
			disabled={loading}
			title="Refresh"
		>
			<i class="fas fa-sync-alt" class:spinning={loading}></i>
		</button>
	</header>

	<!-- Status Filter Tabs -->
	<nav class="status-tabs">
		<button aria-label="Filter by pending status"
			class:active={activeTab === 'pending'}
			onclick={() => (activeTab = 'pending')}
		>
			<span class="tab-icon" style="color: var(--semantic-warning)">
				<i class="fas fa-flag" aria-hidden="true"></i>
			</span>
			Pending
			{#if statusCounts.pending > 0}
				<span class="badge pending">{statusCounts.pending}</span>
			{/if}
		</button>
		<button aria-label="Filter by in-review status"
			class:active={activeTab === 'in-review'}
			onclick={() => (activeTab = 'in-review')}
		>
			<span class="tab-icon" style="color: #8b5cf6">
				<i class="fas fa-user-check" aria-hidden="true"></i>
			</span>
			In Review
			{#if statusCounts.inReview > 0}
				<span class="badge in-review">{statusCounts.inReview}</span>
			{/if}
		</button>
		<button aria-label="Filter by completed status"
			class:active={activeTab === 'completed'}
			onclick={() => (activeTab = 'completed')}
		>
			<span class="tab-icon" style="color: var(--semantic-success)">
				<i class="fas fa-check-circle" aria-hidden="true"></i>
			</span>
			Completed
			{#if statusCounts.completed > 0}
				<span class="badge completed">{statusCounts.completed}</span>
			{/if}
		</button>
		<button aria-label="Show all sessions"
			class:active={activeTab === 'all'}
			onclick={() => (activeTab = 'all')}
		>
			<span class="tab-icon" style="color: var(--theme-text-muted)">
				<i class="fas fa-list" aria-hidden="true"></i>
			</span>
			All
		</button>
	</nav>

	<div class="content-area">
		<!-- Session List -->
		<div class="session-list">
			{#if loading}
				<div class="state-message">
					<i class="fas fa-spinner fa-spin"></i>
					<span>Loading sessions...</span>
				</div>
			{:else if error}
				<div class="state-message error">
					<i class="fas fa-exclamation-triangle"></i>
					<span>{error}</span>
					<button onclick={loadSessions}>Retry</button>
				</div>
			{:else if !isAuthenticated}
				<div class="state-message">
					<i class="fas fa-lock"></i>
					<span>Sign in to access review queue</span>
				</div>
			{:else if filteredSessions.length === 0}
				<div class="state-message">
					<i class="fas fa-inbox"></i>
					<span>No conversations in this view</span>
					{#if activeTab === 'pending'}
						<p class="hint">Flag conversations from the chat to review them here</p>
					{/if}
				</div>
			{:else}
				{#each filteredSessions as session (session.id)}
					{@const statusInfo = getStatusInfo(session.reviewStatus)}
					<button aria-label={`Review session: ${session.title}`}
						class="session-card"
						class:selected={selectedSession?.id === session.id}
						onclick={() => selectSession(session)}
					>
						<div class="card-header">
							<span class="status-badge" style="background: {statusInfo.color}">
								<i class="fas {statusInfo.icon}" aria-hidden="true"></i>
								{statusInfo.label}
							</span>
							{#if session.reviewMetadata?.grade}
								<span class="grade-badge" class:good={session.reviewMetadata.grade.startsWith('A') || session.reviewMetadata.grade.startsWith('B')}>
									{session.reviewMetadata.grade}
									{#if session.reviewMetadata.confidence}
										<span class="confidence">({session.reviewMetadata.confidence}%)</span>
									{/if}
								</span>
							{/if}
						</div>
						<h3>{session.title}</h3>
						<p class="preview">{session.lastUserMessage}</p>
						<div class="card-footer">
							<span class="meta">
								<i class="fas fa-comments" aria-hidden="true"></i>
								{session.messageCount}
							</span>
							<span class="meta">
								<i class="fas fa-clock" aria-hidden="true"></i>
								{formatRelativeTime(session.flaggedAt)}
							</span>
							{#if session.reviewMetadata?.claimedBy === 'claude-tika'}
								<span class="meta claimed">
									<i class="fas fa-robot" aria-hidden="true"></i>
									AI reviewed
								</span>
							{/if}
						</div>
					</button>
				{/each}
			{/if}
		</div>

		<!-- Detail Panel -->
		{#if selectedSession}
			{@const statusInfo = getStatusInfo(selectedSession.reviewStatus)}
			<div class="detail-panel">
				<div class="detail-header">
					<div class="detail-title-row">
						<h3>{selectedSession.title}</h3>
						<span class="status-indicator" style="background: {statusInfo.color}">
							<i class="fas {statusInfo.icon}" aria-hidden="true"></i>
							{statusInfo.label}
						</span>
					</div>
					<div class="detail-actions">
						<button aria-label="Open conversation in chat"
							class="action-btn primary"
							onclick={() => selectedSession && openInChat(selectedSession)}
							title="Open in chat"
						>
							<i class="fas fa-external-link-alt" aria-hidden="true"></i>
							Open
						</button>
						{#if selectedSession.reviewStatus === 'in-review' || selectedSession.reviewStatus === 'needs-correction'}
							<button aria-label="Approve this session"
								class="action-btn success"
								onclick={() => selectedSession && approveSession(selectedSession.id)}
								title="Approve"
							>
								<i class="fas fa-check" aria-hidden="true"></i>
								Approve
							</button>
						{/if}
						{#if selectedSession.reviewStatus !== 'archived'}
							<button aria-label="Archive this session"
								class="action-btn neutral"
								onclick={() => selectedSession && archiveSession(selectedSession.id)}
								title="Archive"
							>
								<i class="fas fa-archive" aria-hidden="true"></i>
								Archive
							</button>
						{/if}
					</div>
				</div>

				<div class="detail-content">
					<!-- Review Info Section -->
					{#if selectedSession.reviewMetadata?.grade}
						<section class="detail-section review-summary">
							<h4>AI Review Summary</h4>
							<div class="review-grade">
								<span class="big-grade" class:good={selectedSession.reviewMetadata.grade.startsWith('A') || selectedSession.reviewMetadata.grade.startsWith('B')}>
									{selectedSession.reviewMetadata.grade}
								</span>
								{#if selectedSession.reviewMetadata.confidence}
									<span class="confidence-label">
										{selectedSession.reviewMetadata.confidence}% confidence
									</span>
								{/if}
							</div>
							{#if selectedSession.reviewMetadata.aiNotes}
								<div class="ai-notes">
									<p>{selectedSession.reviewMetadata.aiNotes}</p>
								</div>
							{/if}
							{#if selectedSession.reviewMetadata.correctedResponse}
								<div class="corrected-response">
									<h5>Suggested Correction</h5>
									<div class="response-text">{selectedSession.reviewMetadata.correctedResponse}</div>
								</div>
							{/if}
						</section>
					{/if}

					<!-- Human Notes Section -->
					<section class="detail-section">
						<h4>Notes</h4>
						{#if selectedSession.reviewStatus === 'pending' || selectedSession.reviewStatus === 'in-review'}
							<div class="notes-input">
								<textarea
									bind:value={notesInput}
									placeholder="Add context or notes before review..."
									rows="3"
								></textarea>
								<button data-save-shortcut aria-label="Save review notes"
									class="save-notes-btn"
									onclick={saveNotes}
									disabled={savingNotes || !notesInput.trim()}
								>
									{savingNotes ? 'Saving...' : 'Save Notes'}
								</button>
							</div>
						{:else if selectedSession.reviewMetadata?.notes}
							<div class="notes-display">
								<p>{selectedSession.reviewMetadata.notes}</p>
							</div>
						{:else}
							<p class="no-notes">No notes added</p>
						{/if}
					</section>

					<!-- Conversation Preview -->
					<section class="detail-section conversation-section">
						<div class="section-header">
							<h4>Conversation</h4>
							<div class="section-actions">
								<CopyForAIButton
									getData={generateCopyForAI}
									ariaLabel="Copy conversation for AI review"
									size="sm"
									variant="icon-only"
								/>
								<CopyAsImageButton
									targetElement={conversationPreviewEl}
									ariaLabel="Copy conversation as image"
									size="sm"
								/>
							</div>
						</div>
						<div class="conversation-preview-wrapper">
							<TikaConversationReadOnly
								bind:this={conversationReadOnlyComponent}
								messages={selectedSession.messages}
							/>
						</div>
					</section>

					<!-- Metadata -->
					<section class="detail-section metadata">
						<h4>Details</h4>
						<dl>
							<dt>Session ID</dt>
							<dd><code>{selectedSession.id}</code></dd>
							<dt>Created</dt>
							<dd>{selectedSession.createdAt.toLocaleString()}</dd>
							<dt>Flagged</dt>
							<dd>{selectedSession.flaggedAt?.toLocaleString() || 'Unknown'}</dd>
							{#if selectedSession.reviewMetadata?.claimedAt}
								<dt>Claimed</dt>
								<dd>
									{selectedSession.reviewMetadata.claimedAt.toLocaleString()}
									{#if selectedSession.reviewMetadata.claimedBy}
										by {selectedSession.reviewMetadata.claimedBy}
									{/if}
								</dd>
							{/if}
							{#if selectedSession.reviewMetadata?.reviewedAt}
								<dt>Reviewed</dt>
								<dd>{selectedSession.reviewMetadata.reviewedAt.toLocaleString()}</dd>
							{/if}
						</dl>
					</section>
				</div>
			</div>
		{:else}
			<div class="no-selection">
				<i class="fas fa-hand-pointer"></i>
				<span>Select a conversation to review</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.review-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
	}

	/* Header */
	.panel-header {
		display: flex;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		gap: 12px;
		background: var(--theme-panel-bg, rgba(15, 20, 30, 0.95));
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--min-touch-target, 48px);
		height: var(--min-touch-target, 48px);
		padding: 0;
		border-radius: 50%;
		background: var(--theme-card-bg, rgba(100, 100, 120, 0.85));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
		color: var(--theme-text, #ffffff);
		font-size: 16px;
		cursor: pointer;
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.back-btn:hover {
		background: linear-gradient(135deg, var(--theme-card-bg, rgba(120, 120, 140, 0.95)), var(--theme-card-bg, rgba(120, 120, 140, 0.95)));
		transform: scale(1.05);
	}

	.back-btn:focus-visible {
		outline: 2px solid var(--theme-accent, #6366f1);
		outline-offset: 2px;
	}

	.header-content {
		flex: 1;
	}

	h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.refresh-btn {
		width: 40px;
		height: 40px;
		border: none;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.refresh-btn:hover {
		background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
		color: var(--theme-text, #fff);
	}

	.spinning {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	/* Status Tabs */
	.status-tabs {
		display: flex;
		padding: 8px 16px;
		gap: 4px;
		border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		background: color-mix(in srgb, var(--theme-panel-bg, rgba(15, 20, 30, 0.95)) 60%, transparent);
	}

	.status-tabs button {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border: none;
		background: transparent;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
		font-size: 14px;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.status-tabs button:hover {
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		color: var(--theme-text, #fff);
	}

	.status-tabs button.active {
		background: var(--theme-accent, #6366f1);
		color: white;
	}

	.tab-icon {
		font-size: 12px;
	}

	.badge {
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 600;
	}

	.badge.pending { background: color-mix(in srgb, var(--semantic-warning, #f59e0b) 20%, transparent); color: var(--semantic-warning, #fbbf24); }
	.badge.in-review { background: color-mix(in srgb, var(--theme-accent, #8b5cf6) 20%, transparent); color: var(--theme-accent, #a78bfa); }
	.badge.completed { background: color-mix(in srgb, var(--semantic-success, #22c55e) 20%, transparent); color: var(--semantic-success, #4ade80); }

	/* Content Area */
	.content-area {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	/* Session List */
	.session-list {
		width: 340px;
		min-width: 280px;
		border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.session-card {
		display: block;
		width: 100%;
		text-align: left;
		padding: 12px;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.session-card:hover {
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
	}

	.session-card.selected {
		border-color: var(--theme-accent, #6366f1);
		background: color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}

	.status-badge {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 6px;
		font-size: var(--font-size-compact, 12px);
		font-weight: 600;
		color: white;
	}

	.grade-badge {
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 700;
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
		color: var(--semantic-error, #fca5a5);
	}

	.grade-badge.good {
		background: color-mix(in srgb, var(--semantic-success, #22c55e) 20%, transparent);
		color: var(--semantic-success, #4ade80);
	}

	.grade-badge .confidence {
		font-weight: 400;
		opacity: 0.8;
	}

	.session-card h3 {
		margin: 0 0 6px;
		font-size: 14px;
		font-weight: 500;
		color: var(--theme-text, #fff);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.session-card .preview {
		margin: 0;
		font-size: 13px;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-footer {
		display: flex;
		gap: 12px;
		margin-top: 10px;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
	}

	.meta.claimed {
		color: var(--semantic-info, #60a5fa);
	}

	/* Detail Panel */
	.detail-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.detail-header {
		padding: 16px;
		border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		flex-shrink: 0;
	}

	.detail-title-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.detail-header h3 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.status-indicator {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		color: white;
	}

	.detail-actions {
		display: flex;
		gap: 8px;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.action-btn.primary {
		background: var(--theme-accent, #6366f1);
		color: white;
	}

	.action-btn.primary:hover {
		background: color-mix(in srgb, var(--theme-accent, #4f46e5) 80%, black);
	}

	.action-btn.success {
		background: var(--semantic-success, #22c55e);
		color: white;
	}

	.action-btn.success:hover {
		background: color-mix(in srgb, var(--semantic-success, #22c55e) 80%, black);
	}

	.action-btn.neutral {
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
	}

	.action-btn.neutral:hover {
		background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
		color: var(--theme-text, #fff);
	}

	.detail-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
	}

	.detail-section {
		margin-bottom: 24px;
	}

	.detail-section h4 {
		margin: 0 0 12px;
		font-size: 12px;
		font-weight: 600;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.detail-section h5 {
		margin: 12px 0 8px;
		font-size: 13px;
		font-weight: 500;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
	}

	/* Review Summary */
	.review-summary {
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border-radius: 12px;
		padding: 16px;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
	}

	.review-grade {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 12px;
	}

	.big-grade {
		font-size: 2rem;
		font-weight: 700;
		color: var(--semantic-error, #fca5a5);
	}

	.big-grade.good {
		color: var(--semantic-success, #4ade80);
	}

	.confidence-label {
		font-size: 14px;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
	}

	.ai-notes {
		padding: 12px;
		background: var(--theme-shadow-bg, rgba(0, 0, 0, 0.2));
		border-radius: 8px;
	}

	.ai-notes p {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
	}

	.corrected-response {
		margin-top: 16px;
	}

	.response-text {
		padding: 12px;
		background: var(--theme-shadow-bg, rgba(0, 0, 0, 0.2));
		border-radius: 8px;
		font-size: 14px;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	/* Notes */
	.notes-input {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.notes-input textarea {
		width: 100%;
		padding: 12px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 8px;
		color: var(--theme-text, #fff);
		font-size: 14px;
		resize: none;
	}

	.notes-input textarea:focus {
		outline: none;
		border-color: var(--theme-accent, #6366f1);
	}

	.save-notes-btn {
		align-self: flex-end;
		padding: 8px 16px;
		background: var(--theme-accent, #6366f1);
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.save-notes-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--theme-accent, #4f46e5) 80%, black);
	}

	.save-notes-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.notes-display {
		padding: 12px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border-radius: 8px;
	}

	.notes-display p {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
	}

	.no-notes {
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
		font-style: italic;
		font-size: 14px;
	}

	/* Section Header with Actions */
	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.section-header h4 {
		margin: 0;
	}

	.section-actions {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	/* Make CopyAsImageButton and CopyForAIButton smaller in this context */
	.section-actions :global(.capture-btn),
	.section-actions :global(.copy-btn) {
		width: 36px;
		height: 36px;
		font-size: 14px;
	}

	.no-content {
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
		font-style: italic;
	}

	/* Conversation Section - expandable to fit content */
	.conversation-section {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.conversation-preview-wrapper {
		flex: 1;
		overflow-y: auto;
		max-height: 500px;
		border-radius: 12px;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
	}

	/* Metadata */
	.metadata dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 16px;
		margin: 0;
	}

	.metadata dt {
		font-size: 13px;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
	}

	.metadata dd {
		margin: 0;
		font-size: 13px;
	}

	.metadata code {
		font-family: monospace;
		font-size: 12px;
		padding: 2px 6px;
		background: var(--theme-shadow-bg, rgba(0, 0, 0, 0.2));
		border-radius: 4px;
	}

	/* State Messages */
	.state-message {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		gap: 12px;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
		text-align: center;
		padding: 32px;
	}

	.state-message i {
		font-size: 2rem;
		opacity: 0.5;
	}

	.state-message.error {
		color: var(--semantic-error, #ef4444);
	}

	.state-message button {
		margin-top: 8px;
		padding: 8px 16px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		color: var(--theme-text, #fff);
		border-radius: 6px;
		cursor: pointer;
	}

	.hint {
		font-size: 13px;
		opacity: 0.7;
		margin-top: 4px;
	}

	.no-selection {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		gap: 12px;
		color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
	}

	.no-selection i {
		font-size: 2.5rem;
		opacity: 0.4;
	}

	/* Mobile */
	@media (max-width: 768px) {
		.content-area {
			flex-direction: column;
		}

		.session-list {
			width: 100%;
			max-height: 40vh;
			border-right: none;
			border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		}

		.status-tabs {
			overflow-x: auto;
			padding: 8px;
		}

		.status-tabs button {
			padding: 8px 12px;
			font-size: 13px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinning {
			animation: none;
		}
	}
</style>
