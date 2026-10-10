import { browser } from '$app/env';

import { SvgPropAnimator } from './services/svg-prop-animator';

let instance: SvgPropAnimator | null = null;

export function getSvgPropAnimator(): SvgPropAnimator {
	if (!browser) throw new Error('getSvgPropAnimator() is browser-only');
	return instance ??= new SvgPropAnimator();
}
