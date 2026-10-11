/**
 * SyncRoomBroadcaster
 *
 * Broadcasts sync room presence to Firebase RTDB for discovery by other devices.
 * Uses onDisconnect() for automatic cleanup when host closes browser.
 */

import {
	ref,
	set,
	remove,
	onDisconnect,
	serverTimestamp,
	type DatabaseReference
} from 'firebase/database';
import { getDatabaseInstance, getAuthSync } from '#lib/shared/auth/firebase.js';
import type { SyncRoom } from '../domain/models/lan-sync-models';
import { localSyncSessionId } from '../domain/models/lan-sync-models';

export class SyncRoomBroadcaster {
	private _isBroadcasting = false;
	private _currentRoom: SyncRoom | null = null;
	private roomRef: DatabaseReference | null = null;
	private disconnectRef: ReturnType<typeof onDisconnect> | null = null;

	get isBroadcasting(): boolean {
		return this._isBroadcasting;
	}

	get currentRoom(): SyncRoom | null {
		return this._currentRoom;
	}

	async broadcast(
		sequenceId: string,
		sequenceWord: string,
		peerJsRoomCode: string
	): Promise<void> {
		// Stop any existing broadcast first
		if (this._isBroadcasting) {
			await this.stopBroadcasting();
		}

		const auth = getAuthSync();
		const user = auth.currentUser;
		if (!user) {
			console.warn('[SyncRoomBroadcaster] Cannot broadcast: user not authenticated');
			return;
		}

		const database = await getDatabaseInstance();

		// Room ID is unique per user+sequence combination
		const roomId = `${user.uid}_${sequenceId}`;
		this.roomRef = ref(database, `sync-rooms/${roomId}`);

		// Create room data
		const roomData: SyncRoom = {
			hostUserId: user.uid,
			hostDisplayName: user.displayName || 'Anonymous',
			hostSessionId: localSyncSessionId,
			sequenceId,
			sequenceWord,
			createdAt: Date.now(),
			peerJsRoomCode
		};

		// Set up onDisconnect handler FIRST (before writing data)
		// This ensures room is removed even if browser crashes
		this.disconnectRef = onDisconnect(this.roomRef);
		await this.disconnectRef.remove();

		// Now write the room data
		await set(this.roomRef, {
			...roomData,
			createdAt: serverTimestamp()
		});

		this._currentRoom = roomData;
		this._isBroadcasting = true;

	}

	async stopBroadcasting(): Promise<void> {
		if (!this._isBroadcasting || !this.roomRef) {
			return;
		}

		try {
			// Cancel the onDisconnect handler since we're cleaning up manually
			if (this.disconnectRef) {
				await this.disconnectRef.cancel();
				this.disconnectRef = null;
			}

			// Remove the room from Firebase
			await remove(this.roomRef);
		} catch (error) {
			console.error('[SyncRoomBroadcaster] Error stopping broadcast:', error);
		} finally {
			this.roomRef = null;
			this._currentRoom = null;
			this._isBroadcasting = false;
		}
	}

	destroy(): void {
		// Fire-and-forget cleanup
		this.stopBroadcasting().catch((err) => {
			console.warn('[SyncRoomBroadcaster] Cleanup error:', err);
		});
	}
}
