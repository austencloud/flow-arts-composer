/**
 * Sync Status State
 *
 * Tracks Firestore sync status - whether local changes have been
 * persisted to the server.
 *
 * States:
 * - synced: All changes saved to server
 * - syncing: Actively syncing changes
 * - pending: Offline with unsaved changes
 * - error: Sync failed (will retry)
 */

import { networkStatusState } from "./network-status-state.svelte";

// Public pages import this tracker through the feature-flag and settings
// stores. It only talks to Firestore while writes are pending, so it loads
// Firebase then, keeping it off those pages' first download.
async function loadFirestore() {
	const { getFirestoreInstance } = await import("#lib/shared/auth/firebase.js");
	return getFirestoreInstance();
}

export type SyncState = "synced" | "syncing" | "pending" | "error";

/** Default timeout for waitForSync in milliseconds */
const DEFAULT_SYNC_TIMEOUT_MS = 10_000;

interface SyncStatus {
	state: SyncState;
	pendingWrites: boolean;
	lastSyncedAt: number | null;
	errorMessage: string | null;
}

function createSyncStatusState() {
	let state = $state<SyncState>("synced");
	let pendingWrites = $state(false);
	let lastSyncedAt = $state<number | null>(null);
	let errorMessage = $state<string | null>(null);
	let pendingCount = $state(0);

	// Track active write count for accurate sync detection
	let activeWriteCount = 0;

	// Per-repository pending counts for granular tracking
	const repositoryPending = new Map<string, number>();

	/**
	 * Mark that we have pending local changes
	 * Call this after any Firestore write operation
	 * @param repoName Optional repository name for granular tracking
	 */
	function markPendingWrite(repoName?: string) {
		activeWriteCount++;
		pendingCount = activeWriteCount;
		pendingWrites = true;
		if (repoName) {
			repositoryPending.set(
				repoName,
				(repositoryPending.get(repoName) || 0) + 1
			);
		}
		if (networkStatusState.isOnline) {
			state = "syncing";
		} else {
			state = "pending";
		}
	}

	/**
	 * Mark that a write has completed (success or failure)
	 * @param repoName Optional repository name for granular tracking
	 */
	function markWriteComplete(repoName?: string) {
		activeWriteCount = Math.max(0, activeWriteCount - 1);
		pendingCount = activeWriteCount;
		if (repoName) {
			const current = repositoryPending.get(repoName) || 0;
			if (current <= 1) {
				repositoryPending.delete(repoName);
			} else {
				repositoryPending.set(repoName, current - 1);
			}
		}
		if (activeWriteCount === 0) {
			pendingWrites = false;
			state = "synced";
			lastSyncedAt = Date.now();
			errorMessage = null;
		}
	}

	/**
	 * Mark that all writes have been synced
	 */
	function markSynced() {
		activeWriteCount = 0;
		pendingCount = 0;
		pendingWrites = false;
		state = "synced";
		lastSyncedAt = Date.now();
		errorMessage = null;
		repositoryPending.clear();
	}

	/**
	 * Mark a sync error
	 */
	function markError(message: string) {
		state = "error";
		errorMessage = message;
	}

	/**
	 * Wait for all pending writes to complete
	 * Returns true if successful, false if failed/timeout
	 */
	async function waitForSync(timeoutMs = DEFAULT_SYNC_TIMEOUT_MS): Promise<boolean> {
		if (!pendingWrites) return true;

		try {
			const { waitForPendingWrites } = await import("firebase/firestore");
			const db = await loadFirestore();

			state = "syncing";

			// Race between waitForPendingWrites and timeout
			const result = await Promise.race([
				waitForPendingWrites(db).then(() => true),
				new Promise<boolean>((resolve) =>
					setTimeout(() => resolve(false), timeoutMs)
				),
			]);

			if (result) {
				markSynced();
				return true;
			} else {
				// Timeout - still pending
				state = pendingWrites ? "pending" : "synced";
				return false;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Sync failed";
			markError(message);
			return false;
		}
	}

	/**
	 * Handle network status changes
	 * Called via networkStatusState callbacks
	 */
	async function handleOnline() {
		if (pendingWrites) {
			// Coming back online with pending changes - wait for Firestore to sync
			state = "syncing";

			// Use waitForPendingWrites to know when sync is complete
			try {
				const { waitForPendingWrites } = await import("firebase/firestore");
				const db = await loadFirestore();
				await waitForPendingWrites(db);
				markSynced();
			} catch (error) {
				console.warn("[SyncStatus] waitForPendingWrites failed:", error);
				// Don't mark error - Firestore will retry automatically
				// Just mark as synced after a delay as fallback
				setTimeout(() => {
					if (state === "syncing") {
						markSynced();
					}
				}, 3000);
			}
		}
	}

	function handleOffline() {
		if (pendingWrites) {
			// Going offline with pending changes
			state = "pending";
		}
	}

	/**
	 * Clear all tracking for a specific repository.
	 * Call when a repository is destroyed to prevent memory leaks.
	 */
	function clearRepository(repoName: string): void {
		const pending = repositoryPending.get(repoName) || 0;
		repositoryPending.delete(repoName);
		activeWriteCount = Math.max(0, activeWriteCount - pending);
		pendingCount = activeWriteCount;

		if (activeWriteCount === 0) {
			pendingWrites = false;
			state = "synced";
		}
	}

	// Subscribe to network status changes when module loads
	if (typeof window !== "undefined") {
		networkStatusState.onOnline(handleOnline);
		networkStatusState.onOffline(handleOffline);
	}

	return {
		get state() {
			return state;
		},
		get pendingWrites() {
			return pendingWrites;
		},
		get pendingCount() {
			return pendingCount;
		},
		get lastSyncedAt() {
			return lastSyncedAt;
		},
		get errorMessage() {
			return errorMessage;
		},
		get status(): SyncStatus {
			return {
				state,
				pendingWrites,
				lastSyncedAt,
				errorMessage,
			};
		},
		// Actions
		markPendingWrite,
		markWriteComplete,
		markSynced,
		markError,
		waitForSync,
		clearRepository,
	};
}

export const syncStatusState = createSyncStatusState();

/**
 * Helper to wrap Firestore write operations with sync tracking
 *
 * Usage:
 * ```typescript
 * await trackWrite(async () => {
 *   await setDoc(docRef, data);
 * });
 *
 * // With repository name for granular tracking
 * await trackWrite(async () => {
 *   await setDoc(docRef, data);
 * }, "library");
 * ```
 */
export async function trackWrite<T>(
	operation: () => Promise<T>,
	repoName?: string
): Promise<T> {
	syncStatusState.markPendingWrite(repoName);
	try {
		const result = await operation();
		syncStatusState.markWriteComplete(repoName);
		return result;
	} catch (error) {
		// Always decrement pending count so it doesn't leak
		syncStatusState.markWriteComplete(repoName);
		const message = error instanceof Error ? error.message : "Write failed";
		syncStatusState.markError(message);
		throw error;
	}
}
