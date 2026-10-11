import { browser } from '$app/env';
import { URLSyncer } from './services/url-syncer';

let instance: URLSyncer | null = null;

export function getURLSyncer(): URLSyncer {
	if (!browser) throw new Error('getURLSyncer() is browser-only');
	return instance ??= new URLSyncer();
}
