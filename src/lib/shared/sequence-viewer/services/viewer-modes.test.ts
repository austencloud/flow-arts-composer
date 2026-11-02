import { describe, it, expect } from 'vitest';
import {
	viewerModeOptions,
	viewerModeForSubject,
	showsViewerModeSwitcher,
	coerce3DContent,
	coerce3DSplit,
	legacyViewModeFor
} from './viewer-modes';

const has = (webgl2: boolean, fits3D: boolean) =>
	viewerModeOptions(webgl2, fits3D).some((m) => m.id === 'animation-3d');

describe('viewerModeOptions', () => {
	it('shows 3D only when WebGL2 is available AND the viewport fits', () => {
		expect(has(true, true)).toBe(true);
		expect(has(true, false)).toBe(false); // small screen: no 3D
		expect(has(false, true)).toBe(false); // no WebGL2: no 3D
		expect(has(false, false)).toBe(false);
	});

	it('defaults viewportFits3D to true (back-compat with single-arg callers)', () => {
		expect(viewerModeOptions(true).some((m) => m.id === 'animation-3d')).toBe(true);
	});

	it('never drops the always-available 2D modes', () => {
		const ids = viewerModeOptions(false, false).map((m) => m.id);
		expect(ids).toContain('animation');
		expect(ids).toContain('card');
		expect(ids).toContain('split');
	});

	// Post Studio is in early access (capability:viewer:post-studio). Hidden by
	// default so a call site that forgets the access check fails closed; when
	// access IS granted it appears on every device — it composes 2D media, so
	// neither the WebGL2 nor the viewport gate applies to it.
	it('withholds Post Studio unless early access is granted', () => {
		expect(viewerModeOptions(false, false).some((m) => m.id === 'post-studio')).toBe(false);
		expect(viewerModeOptions(true, true).some((m) => m.id === 'post-studio')).toBe(false);
		expect(viewerModeOptions(false, false, true).some((m) => m.id === 'post-studio')).toBe(true);
		expect(viewerModeOptions(true, true, true).some((m) => m.id === 'post-studio')).toBe(true);
	});
});

describe('a cast subject', () => {
	const ids = (postStudioAccess: boolean) =>
		viewerModeOptions(true, true, postStudioAccess, 'cast').map((m) => m.id);

	it('offers only the views that draw the whole cast, tunnel first', () => {
		expect(ids(false)).toEqual(['tunnel', 'animation-3d']);
		expect(ids(true)).toEqual(['tunnel', 'animation-3d', 'post-studio']);
	});

	it('drops the cast 3D view behind the same WebGL2 and viewport gates', () => {
		const castIds = (webgl2: boolean, fits3D: boolean) =>
			viewerModeOptions(webgl2, fits3D, false, 'cast').map((m) => m.id);
		expect(castIds(false, true)).toEqual(['tunnel']);
		expect(castIds(true, false)).toEqual(['tunnel']);
	});

	it('keeps every view for a sequence subject', () => {
		expect(viewerModeOptions(true, true, false, 'sequence')).toEqual(
			viewerModeOptions(true, true, false)
		);
	});

	it('lands a performer-only mode on the tunnel', () => {
		for (const mode of ['split', 'animation', 'card', 'videos', 'mandala'] as const) {
			expect(viewerModeForSubject(mode, 'cast')).toBe('tunnel');
		}
		expect(viewerModeForSubject('tunnel', 'cast')).toBe('tunnel');
		expect(viewerModeForSubject('animation-3d', 'cast')).toBe('animation-3d');
		expect(viewerModeForSubject('post-studio', 'cast')).toBe('post-studio');
		expect(viewerModeForSubject('card', 'sequence')).toBe('card');
	});

	it('shows no switcher when there is one view and no practice toggle', () => {
		expect(showsViewerModeSwitcher(viewerModeOptions(true, false, false, 'cast'))).toBe(false);
		expect(showsViewerModeSwitcher(viewerModeOptions(true, true, false, 'cast'))).toBe(true);
		expect(showsViewerModeSwitcher(viewerModeOptions(true, false, true, 'cast'))).toBe(true);
		expect(showsViewerModeSwitcher(viewerModeOptions(true, false, false, 'cast'), true)).toBe(true);
	});
});

describe('coerce3DContent', () => {
	it('maps animation-3d to animation only when the viewport does not fit', () => {
		expect(coerce3DContent('animation-3d', false)).toBe('animation');
		expect(coerce3DContent('animation-3d', true)).toBe('animation-3d');
	});

	it('leaves non-3D content untouched regardless of fit', () => {
		expect(coerce3DContent('card', false)).toBe('card');
		expect(coerce3DContent('animation', false)).toBe('animation');
		expect(coerce3DContent('mandala', true)).toBe('mandala');
	});
});

describe('coerce3DSplit', () => {
	it('coerces both panes away from 3D when the viewport does not fit', () => {
		expect(coerce3DSplit({ leftPane: 'animation-3d', rightPane: 'card' }, false)).toEqual({
			leftPane: 'animation',
			rightPane: 'card'
		});
		expect(coerce3DSplit({ leftPane: 'animation', rightPane: 'animation-3d' }, false)).toEqual({
			leftPane: 'animation',
			rightPane: 'animation'
		});
	});

	it('returns the config unchanged when the viewport fits', () => {
		const cfg = { leftPane: 'animation-3d', rightPane: 'card' } as const;
		expect(coerce3DSplit(cfg, true)).toBe(cfg);
	});
});

describe('legacyViewModeFor', () => {
	it('keeps a still card still so an autoplay open does not start motion behind it', () => {
		expect(legacyViewModeFor('card')).toBe('image');
	});

	it('allows motion on every surface that animates', () => {
		expect(legacyViewModeFor('animation')).toBe('animation');
		expect(legacyViewModeFor('animation-3d')).toBe('animation');
		expect(legacyViewModeFor('split')).toBe('animation');
		expect(legacyViewModeFor('tunnel')).toBe('animation');
	});
});
