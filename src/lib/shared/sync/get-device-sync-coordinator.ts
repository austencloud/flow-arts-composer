import { DeviceSyncCoordinator } from './services/device-sync-coordinator';
import { getPeerConnectionManager } from '#lib/shared/lan-sync/get-peer-connection-manager.js';
import { getSequenceLocalCache } from './get-sequence-local-cache';
import { getAdaptiveHeartbeat } from './get-adaptive-heartbeat';
import { getMessageBatcher } from './get-message-batcher';
import { getMobileConnectionAdapter } from './get-mobile-connection-adapter';

let instance: DeviceSyncCoordinator | null = null;

export function getDeviceSyncCoordinator(): DeviceSyncCoordinator {
  return instance ??= new DeviceSyncCoordinator(
    getPeerConnectionManager(),
    {},
    getSequenceLocalCache(),
    {
      adaptiveHeartbeat: getAdaptiveHeartbeat(),
      messageBatcher: getMessageBatcher(),
      connectionAdapter: getMobileConnectionAdapter(),
    }
  );
}
