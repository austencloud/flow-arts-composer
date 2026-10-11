/**
 * Network conditions reader.
 *
 * Reads the browser's Network Information API (navigator.connection) so the app
 * can back off speculative work — background prefetches, fresh-data syncs, full
 * resolution background rendering — when the user is on a slow or metered link.
 *
 * Why this exists: on a fast connection the app's boot-time speculative downloads
 * (gallery sync, creator profiles) finish in a blink, so nobody notices them. On
 * a congested 4G connection those same downloads drag on for seconds, and while
 * they do they steal bandwidth and main-thread time from whatever the user is
 * actually looking at — animations stutter, the page feels laggy. Detecting the
 * slow link lets us skip the speculative work and keep the foreground smooth.
 *
 * The Network Information API is Chromium-only (Chrome, Edge, Android browsers).
 * Safari and Firefox don't expose it, so `known` is false there and we treat the
 * connection as unconstrained — we can't detect "slow", so we don't change
 * behavior rather than guess wrong.
 */

import { browser } from '$app/env';

/** A snapshot of what the browser tells us about the current connection. */
export interface NetworkConditions {
	/** True when the user turned on the browser's data-saver / reduced-data mode. */
	saveData: boolean;
	/**
	 * The browser's bucketed estimate of connection quality, derived from observed
	 * round-trip time and throughput: 'slow-2g' | '2g' | '3g' | '4g'. Null when the
	 * API isn't available. Note this is a *measured* bucket, not the radio type —
	 * a congested LTE link routinely reports '3g' or '2g' here.
	 */
	effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | null;
	/** Estimated downlink bandwidth in Mbps, or null when unknown. */
	downlinkMbps: number | null;
	/** Estimated round-trip time in ms, or null when unknown. */
	rttMs: number | null;
	/** True when we got a real reading (Chromium). False on Safari/Firefox/SSR. */
	known: boolean;
}

/**
 * The Network Information API surface we read. It isn't in the standard DOM lib
 * typings yet, so we declare the slice we use rather than cast to `any`.
 */
interface NavigatorConnection {
	saveData?: boolean;
	effectiveType?: string;
	downlink?: number;
	rtt?: number;
}

function readConnection(): NavigatorConnection | null {
	if (!browser) return null;
	const conn = (navigator as Navigator & { connection?: NavigatorConnection }).connection;
	return conn ?? null;
}

/** Read the current connection conditions. Safe on the server (returns unknown). */
export function getNetworkConditions(): NetworkConditions {
	const conn = readConnection();
	if (!conn) {
		return {
			saveData: false,
			effectiveType: null,
			downlinkMbps: null,
			rttMs: null,
			known: false
		};
	}

	const effectiveType = conn.effectiveType;
	const isKnownBucket =
		effectiveType === '4g' ||
		effectiveType === '3g' ||
		effectiveType === '2g' ||
		effectiveType === 'slow-2g';

	return {
		saveData: conn.saveData === true,
		effectiveType: isKnownBucket ? effectiveType : null,
		downlinkMbps: typeof conn.downlink === 'number' ? conn.downlink : null,
		rttMs: typeof conn.rtt === 'number' ? conn.rtt : null,
		known: true
	};
}

// Thresholds for calling a connection "constrained". These are deliberately a
// little eager: the only thing a false positive costs is that we load some data
// on-demand instead of pre-warming it, which is a mild, recoverable slowdown.
// A false negative — speculating on a genuinely slow link — is the bug we're
// fixing, so we'd rather over-trigger than under-trigger.
const SLOW_DOWNLINK_MBPS = 2; // congested 4G commonly measures 1–3 Mbps
const SLOW_RTT_MS = 300; // congested 4G latency climbs well past this

/**
 * True when we should back off speculative network and rendering work.
 *
 * Triggers on any of: the user's explicit data-saver mode, a measured 3g-or-worse
 * bucket, low measured bandwidth, or high measured latency. On browsers without
 * the API (Safari/Firefox) this is always false — we can't tell, so we don't
 * degrade their experience on a guess.
 */
export function isConstrainedConnection(): boolean {
	const c = getNetworkConditions();
	if (!c.known) return false;

	if (c.saveData) return true;
	if (c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g')
		return true;
	if (c.downlinkMbps !== null && c.downlinkMbps > 0 && c.downlinkMbps < SLOW_DOWNLINK_MBPS)
		return true;
	if (c.rttMs !== null && c.rttMs >= SLOW_RTT_MS) return true;

	return false;
}

/**
 * True only when the user has explicitly asked the browser to conserve data.
 *
 * For work that is NOT a speculative network fetch — mounting a local JS chunk,
 * rendering a decorative embed — this is the correct predicate, not
 * isConstrainedConnection(). Chrome's NetInfo estimate is unreliable enough to
 * be disqualifying here: on a gigabit desktop it routinely reports
 * effectiveType '3g' with downlink under 1 Mbps, which made every homepage
 * launchpad tile serve its CSS placeholder poster permanently instead of the
 * real mandala / choreo card / book cover.
 *
 * A wrong "slow" reading costs a deferred prefetch (recoverable) but costs a
 * permanently degraded page here, so this reads only the one signal the user
 * actually set themselves.
 */
export function prefersReducedData(): boolean {
	return getNetworkConditions().saveData;
}

/**
 * True when the background should render at reduced canvas resolution.
 *
 * Deliberately distinct from isConstrainedConnection(). That predicate keys off a
 * noisy *bandwidth* estimate to back off speculative network prefetch, where a
 * false positive is cheap and recoverable (fetch on demand instead of pre-warming).
 *
 * Background canvas resolution is a *render* cost, not a network cost — downlink
 * Mbps says nothing about whether the GPU can repaint a full-viewport canvas — and
 * a false positive here is a visible, persistent defect: the canvas paints at a
 * fraction of the viewport and the browser stretches it up, so the whole background
 * looks zoomed in and blurry. Chrome's `downlink` routinely under-reports to 1–2
 * Mbps on perfectly capable links (and on localhost), which would otherwise cap the
 * background forever. So we cap resolution ONLY on signals that actually correlate
 * with a device that can't afford a full-res repaint: the user's explicit
 * data-saver mode, or a genuinely slow radio bucket (3g or worse). A plain '4g'
 * bucket keeps full resolution regardless of its measured bandwidth number.
 */
export function shouldReduceBackgroundResolution(): boolean {
	const c = getNetworkConditions();
	if (!c.known) return false;

	if (c.saveData) return true;
	if (c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g')
		return true;

	return false;
}
