import { browser } from '$app/environment';
import { ThumbnailRenderer } from './services/thumbnail-renderer';
import { getCompositionDispatcher } from '$lib/shared/render/get-composition-dispatcher';
import { startPlacementDeriver } from '$lib/shared/pictograph/shared/services/start-placement-deriver';
import { getBrowseLoader } from '$lib/shared/browse/get-browse-loader';
import { loopDetector } from '$lib/shared/create/services/loop-detector';
import { getQRCodeGenerator } from '$lib/shared/qr/get-qr-code-generator';

let instance: ThumbnailRenderer | null = null;

export function getThumbnailRenderer(): ThumbnailRenderer {
	if (!browser) throw new Error('getThumbnailRenderer() is browser-only');
	return instance ??= new ThumbnailRenderer(
		getCompositionDispatcher(),
		startPlacementDeriver,
		getBrowseLoader(),
		loopDetector,
		// Lazy: the QR generator needs the short-code manager configured first, so
		// resolve it per-render and swallow the pre-config window (renders no QR).
		() => {
			try {
				return getQRCodeGenerator();
			} catch {
				return null;
			}
		},
	);
}
