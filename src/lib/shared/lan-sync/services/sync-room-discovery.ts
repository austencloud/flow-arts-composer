/**
 * SyncRoomDiscovery
 *
 * Browses nearby sync rooms by watching Firebase RTDB.
 * Filters out the current user's own rooms to avoid self-discovery.
 */

import {
	ref,
	onValue,
	off,
	type DatabaseReference
} from 'firebase/database';
import {
	getDatabaseInstance,
	createHMRSafeDatabaseListener
} from '#lib/shared/auth/firebase.js';
import type { SyncRoom, SyncRoomWithId } from '../domain/models/lan-sync-models';
import { localSyncSessionId } from '../domain/models/lan-sync-models';

export class SyncRoomDiscovery {
	private _isBrowsing = false;
	private _nearbyRooms: SyncRoomWithId[] = [];
	private roomsRef: DatabaseReference | null = null;
	private unsubscribeListener: (() => void) | null = null;
	private callbacks: Set<(rooms: SyncRoomWithId[]) => void> = new Set();

	get isBrowsing(): boolean {
		return this._isBrowsing;
	}

	get nearbyRooms(): SyncRoomWithId[] {
		return this._nearbyRooms;
	}

	async startDiscovery(): Promise<void> {
		if (this._isBrowsing) {
			return;
		}

		const database = await getDatabaseInstance();
		this.roomsRef = ref(database, 'sync-rooms');

		// Use HMR-safe listener for development stability
		this.unsubscribeListener = createHMRSafeDatabaseListener(
			'sync-room-discovery',
			'sync-rooms',
			() => {
				const handleValue = (snapshot: { val: () => Record<string, SyncRoom> | null }) => {
					this.processRoomsSnapshot(snapshot.val());
				};

				onValue(this.roomsRef!, handleValue);

				return () => {
					if (this.roomsRef) {
						off(this.roomsRef, 'value', handleValue);
					}
				};
			}
		);

		this._isBrowsing = true;
	}

	stopDiscovery(): void {
		if (!this._isBrowsing) {
			return;
		}

		if (this.unsubscribeListener) {
			this.unsubscribeListener();
			this.unsubscribeListener = null;
		}

		this.roomsRef = null;
		this._nearbyRooms = [];
		this._isBrowsing = false;
		this.notifyCallbacks();
	}

	onNearbyRoomsChange(callback: (rooms: SyncRoomWithId[]) => void): () => void {
		this.callbacks.add(callback);

		// Immediately notify with current state
		callback(this._nearbyRooms);

		return () => {
			this.callbacks.delete(callback);
		};
	}

	destroy(): void {
		this.stopDiscovery();
		this.callbacks.clear();
	}

	private processRoomsSnapshot(data: Record<string, SyncRoom> | null): void {
		if (!data) {
			this._nearbyRooms = [];
			this.notifyCallbacks();
			return;
		}

		// Convert to array with IDs, filter out rooms from THIS device/tab only.
		// Same user on a different device should still see the banner.
		const rooms: SyncRoomWithId[] = Object.entries(data)
			.map(([roomId, room]) => ({
				roomId,
				...room
			}))
			.filter((room) => {
				// Filter out rooms hosted by THIS browser tab (same session ID).
				// Rooms from the same user on another device have a different session ID
				// and will pass through - which is the whole point of multi-device sync.
				if (room.hostSessionId === localSyncSessionId) {
					return false;
				}
				return true;
			})
			// Sort by most recent first
			.sort((a, b) => {
				const timeA = typeof a.createdAt === 'number' ? a.createdAt : 0;
				const timeB = typeof b.createdAt === 'number' ? b.createdAt : 0;
				return timeB - timeA;
			});

		this._nearbyRooms = rooms;
		this.notifyCallbacks();
	}

	private notifyCallbacks(): void {
		for (const callback of this.callbacks) {
			callback(this._nearbyRooms);
		}
	}
}
