import type { SequenceData } from '#lib/shared/foundation/domain/models/sequence-data.js';
import type {
	SyncConnectionState,
	SyncedRoomState,
	ViewMode,
	SyncConnectionStatus
} from '../domain/sync-types';
import type { DeviceSyncCoordinator } from '../services/device-sync-coordinator';
import { createInitialConnectionState } from '../domain/sync-types';


class DeviceSyncState {
	private _connectionState = $state<SyncConnectionState>(createInitialConnectionState());
	private _roomState = $state<SyncedRoomState | null>(null);
	private _viewMode = $state<ViewMode>('animation');
	private _currentStep = $state<number>(0);

	private coordinator: DeviceSyncCoordinator | null = null;
	private unsubscribers: Array<() => void> = [];
	private animationFrameId: number | null = null;

	get connectionState(): SyncConnectionState {
		return this._connectionState;
	}

	get roomState(): SyncedRoomState | null {
		return this._roomState;
	}

	get viewMode(): ViewMode {
		return this._viewMode;
	}

	/** Updated every animation frame during playback */
	get currentStep(): number {
		return this._currentStep;
	}

	get isConnected(): boolean {
		return this._connectionState.status === 'connected';
	}

	get isPlaying(): boolean {
		return this._roomState?.playback.playing ?? false;
	}

	get peerCount(): number {
		return this._connectionState.peerCount;
	}

	get sequenceWord(): string | null {
		return this._roomState?.sequence.word ?? null;
	}

	get roomCode(): string | null {
		return this._connectionState.roomCode;
	}

	get totalSteps(): number {
		return this._roomState?.playback.totalSteps ?? 0;
	}

	get speed(): number {
		return this._roomState?.playback.speed ?? 1.0;
	}

	get loop(): boolean {
		return this._roomState?.playback.loop ?? true;
	}

	get quality(): SyncConnectionState['quality'] {
		return this._connectionState.quality;
	}

	initialize(coordinator: DeviceSyncCoordinator): void {
		this.cleanup();
		this.coordinator = coordinator;

		this.unsubscribers.push(
			coordinator.onConnectionStateChange((state) => {
				this._connectionState = state;
			})
		);

		this.unsubscribers.push(
			coordinator.onRoomStateChange((state) => {
				this._roomState = state;

				if (state?.playback.playing) {
					this.startStepUpdateLoop();
				} else {
					this.stopStepUpdateLoop();
					if (this.coordinator) {
						this._currentStep = this.coordinator.getCurrentStep();
					}
				}
			})
		);
	}

	async sync(sequence: SequenceData, displayName: string): Promise<string> {
		if (!this.coordinator) {
			throw new Error('Device sync not initialized');
		}
		return this.coordinator.sync(sequence, displayName);
	}

	async joinRoom(roomCode: string, displayName: string): Promise<void> {
		if (!this.coordinator) {
			throw new Error('Device sync not initialized');
		}
		return this.coordinator.joinRoom(roomCode, displayName);
	}

	disconnect(): void {
		this.stopStepUpdateLoop();
		this.coordinator?.disconnect();
	}

	play(): void {
		this.coordinator?.play();
	}

	pause(): void {
		this.coordinator?.pause();
	}

	seek(step: number): void {
		this.coordinator?.seek(step);
		this._currentStep = step;
	}

	setSpeed(speed: number): void {
		this.coordinator?.setSpeed(speed);
	}

	toggleLoop(): void {
		this.coordinator?.toggleLoop();
	}

	setViewMode(mode: ViewMode): void {
		this._viewMode = mode;
	}

	private startStepUpdateLoop(): void {
		if (this.animationFrameId !== null) return;

		const update = () => {
			if (this.coordinator && this._roomState?.playback.playing) {
				this._currentStep = this.coordinator.getCurrentStep();
			}
			this.animationFrameId = requestAnimationFrame(update);
		};

		this.animationFrameId = requestAnimationFrame(update);
	}

	private stopStepUpdateLoop(): void {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	cleanup(): void {
		this.stopStepUpdateLoop();

		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];

		this.coordinator?.destroy();
		this.coordinator = null;

		this._connectionState = createInitialConnectionState();
		this._roomState = null;
		this._currentStep = 0;
	}
}

export const deviceSyncState = new DeviceSyncState();

export function getConnectionStatusText(status: SyncConnectionStatus): string {
	switch (status) {
		case 'disconnected':
			return 'Not connected';
		case 'creating-room':
			return 'Creating room...';
		case 'waiting-for-peer':
			return 'Waiting for device...';
		case 'joining-room':
			return 'Joining room...';
		case 'connected':
			return 'Connected';
		case 'reconnecting':
			return 'Reconnecting...';
		case 'error':
			return 'Connection error';
		default:
			return 'Unknown';
	}
}

export function getQualityIndicator(quality: SyncConnectionState['quality']): {
	label: string;
	color: string;
} {
	switch (quality) {
		case 'excellent':
			return { label: 'Excellent', color: 'var(--semantic-success)' };
		case 'good':
			return { label: 'Good', color: 'var(--semantic-success)' };
		case 'degraded':
			return { label: 'Fair', color: 'var(--semantic-warning)' };
		case 'poor':
			return { label: 'Poor', color: 'var(--semantic-error)' };
		case 'disconnected':
			return { label: 'Disconnected', color: 'var(--theme-text-muted)' };
		default:
			return { label: 'Unknown', color: 'var(--theme-text-muted)' };
	}
}
