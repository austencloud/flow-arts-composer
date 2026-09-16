<!--
  SessionViewer.svelte

  Full-screen overlay for viewing a synced sequence.
  Features:
  - Display preference (animation/pictograph/split)
  - Synced playback controls
  - Solo mode toggle
  - Participant count
-->
<script lang="ts">

import { loadByIdentifier } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import { onMount, onDestroy } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { connectState } from '../../state/connect-state.svelte';
	import { getBrowseLoader } from '$lib/shared/browse/get-browse-loader';
	import { t } from '$lib/shared/i18n/i18n.svelte';
	import { lanSyncState } from '$lib/shared/lan-sync/state/lan-sync-state.svelte';
	import type { DisplayPreference, SyncSession } from '../../domain/models/connect-models';
	import {
		createSequenceData,
		type SequenceData
	} from '$lib/shared/foundation/domain/models/sequence-data';
	import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
	import type { AnimationPanelState } from '$lib/shared/animation-engine/state/animation-panel-state.svelte';
	import SessionControls from './SessionControls.svelte';
	import SyncToggle from './SyncToggle.svelte';
	import ParticipantsList from './ParticipantsList.svelte';
	import DisplayPreferenceSelector from './DisplayPreferenceSelector.svelte';
	import ProgressRing from '$lib/shared/components/loading/ProgressRing.svelte';

	// Lazy load heavy components
	import AnimationPlayer from '$lib/shared/sequence-viewer/components/AnimationPlayer.svelte';
	import ChoreoCard from '$lib/shared/sequence-viewer/components/ChoreoCard.svelte';

	interface Props {
		session: SyncSession;
		onClose: () => void;
	}

	let { session, onClose }: Props = $props();

	// State
	let sequence = $state<SequenceData | null>(null);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let showParticipants = $state(false);

	// Animation controller reference for driving playback from sync state
	let animController = $state<AnimationPlaybackController | null>(null);
	let animStateRef = $state<AnimationPanelState | null>(null);
	let animStateUnsub: (() => void) | null = null;
	// Timestamp of the last sync state we applied locally - prevents echo loops
	let lastAppliedSyncTimestamp = 0;
	// Flag to suppress broadcasting while we apply remote state
	let applyingRemoteState = false;

	// Derived from connectState
	const displayPreference = $derived(connectState.displayPreference);
	const isSoloMode = $derived(connectState.isSoloMode);
	const participants = $derived(connectState.participants);
	const isHost = $derived(connectState.isHost);

	// Synced playback state from lanSyncState
	const playbackState = $derived(lanSyncState.playbackState);
	const currentStep = $derived(playbackState.currentStep);
	const isPlaying = $derived(playbackState.isPlaying);
	const playbackSpeed = $derived(playbackState.speed);

	// Called when AnimationPlayer's internal controller is ready
	function handleControllerReady(ctrl: AnimationPlaybackController, state: AnimationPanelState) {
		animController = ctrl;
		animStateRef = state;

		// Subscribe to local animation state changes → broadcast to peers
		animStateUnsub?.();
		animStateUnsub = state.subscribe((key, value) => {
			if (applyingRemoteState || isSoloMode) return;

			if (key === 'isPlaying') {
				lanSyncState.updatePlayback({ isPlaying: value as boolean });
			} else if (key === 'currentStep') {
				lanSyncState.updatePlayback({ currentStep: value as number });
			}
		});
	}

	// Apply incoming sync state from peers → local animation controller
	$effect(() => {
		const sync = lanSyncState.playbackState;
		const ctrl = animController;
		if (!ctrl || !lanSyncState.isActive || isSoloMode) return;

		// Only apply if this is a genuinely new remote update
		if (sync.timestamp <= lastAppliedSyncTimestamp) return;
		lastAppliedSyncTimestamp = sync.timestamp;

		applyingRemoteState = true;
		try {
			// Apply play/pause
			const localPlaying = animStateRef?.isPlaying ?? false;
			if (sync.isPlaying !== localPlaying) {
				ctrl.togglePlayback();
			}

			// Apply seek (only if difference is significant - avoids jitter from continuous playback)
			const localStep = animStateRef?.currentStep ?? 0;
			if (Math.abs(sync.currentStep - localStep) > 0.5) {
				ctrl.seekToStep(sync.currentStep);
			}

			const localSpeed = animStateRef?.speed ?? 1;
			if (sync.speed !== undefined && sync.speed !== localSpeed) {
				ctrl.setSpeed(sync.speed);
			}
		} finally {
			applyingRemoteState = false;
		}
	});

	// Load sequence data using a multi-source fallback chain:
	// P2P received data → wait for P2P delivery → unified provider → legacy browse loader
	onMount(async () => {
		try {
			// Source 1: P2P data already received from host
			const p2pData = lanSyncState.receivedSequence;
			if (p2pData) {
				sequence = createSequenceData(p2pData as Partial<SequenceData>);
				return;
			}

			// Source 2: Wait for P2P delivery (host may still be transmitting)
			const waitedData = await lanSyncState.waitForSequence(5000);
			if (waitedData) {
				sequence = createSequenceData(waitedData as Partial<SequenceData>);
				return;
			}

			// Source 3: Unified provider - tries local repo then public Firestore
			const fromProvider = await loadByIdentifier(session.sequenceWord);
			if (fromProvider) {
				sequence = fromProvider;
				return;
			}

			// Source 4: Legacy browse loader (by document ID)
			const browseLoader = getBrowseLoader();
			const fromBrowse = await browseLoader.loadFullSequenceData(session.sequenceId);
			if (fromBrowse) {
				sequence = fromBrowse;
				return;
			}

			// All sources exhausted
			loadError = t('connect_sequence_not_found');
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Failed to load sequence';
			const errorHandler = getErrorHandler();
			errorHandler.showUserError({
				message: t('connect_load_sequence_failed'),
				technicalDetails: error instanceof Error ? error.message : String(error),
				error: error instanceof Error ? error : new Error(String(error)),
				severity: 'error',
				context: {
					module: 'connect',
					action: 'load-session-sequence',
					additionalData: { sessionId: session.sessionId, sequenceWord: session.sequenceWord }
				}
			});
		} finally {
			isLoading = false;
		}
	});

	// Clean up animation state subscription
	onDestroy(() => {
		animStateUnsub?.();
		animStateUnsub = null;
	});

	// Keyboard shortcuts
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}

	// Display preference change. The service surfaces a toast and rolls back
	// local state on failure; catch here so the rejection isn't unhandled.
	async function handleDisplayChange(pref: DisplayPreference) {
		try {
			await connectState.setDisplayPreference(pref);
		} catch {
			// Failure already surfaced via toast at the service layer.
		}
	}

	// Solo mode toggle
	async function handleSoloToggle() {
		await connectState.toggleSoloMode();
	}

	// Playback controls - drive both local controller and P2P sync
	function handlePlay() {
		if (animController && !animStateRef?.isPlaying) {
			animController.togglePlayback();
		}
		if (!isSoloMode) {
			lanSyncState.updatePlayback({ isPlaying: true });
		}
	}

	function handlePause() {
		if (animController && animStateRef?.isPlaying) {
			animController.togglePlayback();
		}
		if (!isSoloMode) {
			lanSyncState.updatePlayback({ isPlaying: false });
		}
	}

	function handleSeek(beat: number) {
		animController?.seekToStep(beat);
		if (!isSoloMode) {
			lanSyncState.updatePlayback({ currentStep: beat });
		}
	}

	function handlePrevious() {
		if (currentStep > 0) {
			const target = currentStep - 1;
			animController?.seekToStep(target);
			if (!isSoloMode) {
				lanSyncState.updatePlayback({ currentStep: target, isPlaying: false });
			}
		}
	}

	function handleNext() {
		const maxBeat = sequence?.steps?.length ?? 0;
		if (currentStep < maxBeat) {
			const target = currentStep + 1;
			animController?.seekToStep(target);
			if (!isSoloMode) {
				lanSyncState.updatePlayback({ currentStep: target, isPlaying: false });
			}
		}
	}

	function handleFirst() {
		animController?.seekToStep(0);
		if (!isSoloMode) {
			lanSyncState.updatePlayback({ currentStep: 0, isPlaying: false });
		}
	}

	function handleLast() {
		const maxBeat = sequence?.steps?.length ?? 0;
		animController?.seekToStep(maxBeat);
		if (!isSoloMode) {
			lanSyncState.updatePlayback({ currentStep: maxBeat, isPlaying: false });
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="session-viewer-overlay" transition:fade={{ duration: 200 }}>
	<div class="session-viewer" transition:fly={{ y: 50, duration: 300 }}>
		<!-- Header -->
		<header class="viewer-header">
			<button class="back-button" onclick={onClose} aria-label={t('connect_leave_session')}>
				<i class="fas fa-arrow-left" aria-hidden="true"></i>
			</button>

			<div class="header-info">
				<h1 class="sequence-word">"{session.sequenceWord}"</h1>
				<button
					class="participants-badge"
					onclick={() => (showParticipants = !showParticipants)}
					aria-expanded={showParticipants}
					aria-label={t('connect_synced_participants', { count: participants.length })}
				>
					<i class="fas fa-users" aria-hidden="true"></i>
					<span>{t('connect_synced_count', { count: participants.length })}</span>
				</button>
			</div>

			<div class="header-actions">
				<DisplayPreferenceSelector
					value={displayPreference}
					onChange={handleDisplayChange}
				/>

				<button class="leave-button" onclick={onClose} aria-label={t('connect_leave_session')}>
					{t('connect_leave')}
				</button>
			</div>
		</header>

		<!-- Participants dropdown -->
		{#if showParticipants}
			<div class="participants-dropdown" transition:fly={{ y: -10, duration: 150 }}>
				<ParticipantsList {participants} hostUserId={session.hostUserId} />
			</div>
		{/if}

		<!-- Main content area -->
		<main class="viewer-content">
			{#if isLoading}
				<div class="loading-state">
					<ProgressRing percent={-1} size={32} strokeWidth={3} />
					<p>{t('connect_loading_sequence')}</p>
				</div>
			{:else if loadError}
				<div class="error-state">
					<i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
					<p>{loadError}</p>
				</div>
			{:else if sequence}
				<div class="display-area">
					{#if displayPreference === 'animation'}
						<div class="animation-container">
							<AnimationPlayer
								{sequence}
								autoPlay={false}
								showControls={false}
								layout="vertical"
								onControllerReady={handleControllerReady}
							/>
						</div>
					{:else if displayPreference === 'pictograph'}
						<div class="pictograph-container">
							<ChoreoCard
								{sequence}
								showStepNumbers={true}
								showDifficultyLevel={false}
								includeStartPlacement={true}
								darkMode={true}
							/>
						</div>
					{:else if displayPreference === 'split'}
						<div class="split-container">
							<div class="split-left">
								<AnimationPlayer
									{sequence}
									autoPlay={false}
									showControls={false}
									layout="vertical"
									onControllerReady={handleControllerReady}
								/>
							</div>
							<div class="split-right">
								<ChoreoCard
									{sequence}
									showStepNumbers={true}
									showDifficultyLevel={false}
									includeStartPlacement={true}
									darkMode={true}
								/>
							</div>
						</div>
					{/if}
				</div>

				<!-- Step indicator -->
				<div class="step-indicator">
					{t('connect_beat_of', { current: currentStep, total: sequence.steps?.length ?? 0 })}
				</div>
			{/if}
		</main>

		<!-- Footer with controls -->
		<footer class="viewer-footer">
			<SessionControls
				{isPlaying}
				{currentStep}
				maxBeat={sequence?.steps?.length ?? 0}
				disabled={isSoloMode}
				onPlay={handlePlay}
				onPause={handlePause}
				onPrevious={handlePrevious}
				onNext={handleNext}
				onFirst={handleFirst}
				onLast={handleLast}
				onSeek={handleSeek}
			/>

			<SyncToggle isSolo={isSoloMode} onToggle={handleSoloToggle} />
		</footer>
	</div>
</div>

<style>
	.session-viewer-overlay {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal);
		background: var(--theme-overlay-bg-dark, rgba(0, 0, 0, 0.9));
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.session-viewer {
		width: 100%;
		height: 100%;
		max-width: 100vw;
		max-height: 100vh;
		max-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
		color: var(--theme-text, #ffffff);
	}

	/* Header */
	.viewer-header {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 12px 16px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		flex-shrink: 0;
	}

	.back-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		background: none;
		border: none;
		color: var(--theme-text, white);
		cursor: pointer;
		border-radius: 8px;
		transition: background 0.15s ease;
	}

	.back-button:hover {
		background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
	}

	.header-info {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.sequence-word {
		font-size: var(--font-size-lg, 18px);
		font-weight: 600;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--theme-accent, #6366f1);
	}

	.participants-badge {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 20px;
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		font-size: var(--font-size-compact, 12px);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.participants-badge:hover {
		background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
		color: var(--theme-text, white);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.leave-button {
		padding: 8px 16px;
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
		border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
		border-radius: 8px;
		color: var(--semantic-error, #ef4444);
		font-weight: 600;
		font-size: var(--font-size-compact, 12px);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.leave-button:hover {
		background: color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
	}

	/* Participants dropdown */
	.participants-dropdown {
		position: absolute;
		top: 64px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 12px;
		padding: 12px;
		min-width: 200px;
		box-shadow: 0 8px 32px var(--theme-shadow-color, rgba(0, 0, 0, 0.3));
	}

	/* Main content */
	.viewer-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 16px;
		min-height: 0;
		overflow: hidden;
		position: relative;
	}

	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		text-align: center;
	}

	.error-state i {
		font-size: 48px;
		color: var(--semantic-error, #ef4444);
	}

	.display-area {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.split-container {
		width: 100%;
		height: 100%;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.split-left,
	.split-right {
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.step-indicator {
		position: absolute;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		padding: 8px 16px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 20px;
		font-size: var(--font-size-sm, 14px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
	}

	/* Footer */
	.viewer-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		flex-shrink: 0;
	}

	/* Mobile */
	@media (max-width: 600px) {
		.viewer-header {
			padding: 8px 12px;
		}

		.sequence-word {
			font-size: var(--font-size-base, 16px);
		}

		.header-actions {
			gap: 8px;
		}

		.leave-button {
			padding: 6px 12px;
		}

		.split-container {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr 1fr;
		}

		.viewer-footer {
			flex-direction: column;
			gap: 12px;
		}
	}

</style>
