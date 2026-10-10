import { ConnectOrchestrator } from './services/connect-orchestrator';
import { getConnectPresenceTracker } from './get-connect-presence-tracker';
import { getConnectSessionManager } from './get-connect-session-manager';
import { getConnectInviteHandler } from './get-connect-invite-handler';
import { getConnectFriendshipManager } from './get-connect-friendship-manager';
import { getLanSyncCoordinator } from '#lib/shared/lan-sync/get-lan-sync-coordinator.js';

let instance: ConnectOrchestrator | null = null;
export function getConnectOrchestrator(): ConnectOrchestrator {
  return instance ??= new ConnectOrchestrator(
    getConnectPresenceTracker(),
    getConnectSessionManager(),
    getConnectInviteHandler(),
    getConnectFriendshipManager(),
    getLanSyncCoordinator()
  );
}
