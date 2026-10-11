import { browser } from '$app/env';

import { ExtensionFlowCoordinator } from './services/extension-flow-coordinator';
import { getSequenceExtender } from './get-sequence-extender';

let instance: ExtensionFlowCoordinator | null = null;

export function getExtensionFlowCoordinator(): ExtensionFlowCoordinator {
	if (!browser) throw new Error('getExtensionFlowCoordinator() is browser-only');
	return instance ??= new ExtensionFlowCoordinator(getSequenceExtender());
}
