import { browser } from '$app/env';
import { SequenceRenderer } from './services/sequence-renderer';
import { getImageComposer } from './get-image-composer';
import { getImageFormatConverter } from './get-image-format-converter';

let instance: SequenceRenderer | null = null;

export function getSequenceRenderer(): SequenceRenderer {
	if (!browser) throw new Error('getSequenceRenderer() is browser-only');
	return instance ??= new SequenceRenderer(
		getImageComposer(),
		getImageFormatConverter()
	);
}
