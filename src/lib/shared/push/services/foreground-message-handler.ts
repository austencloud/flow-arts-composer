/**
 * ForegroundMessageHandler
 *
 * Listens for FCM messages while the app is in the foreground.
 * Displays incoming notifications as toast messages since the browser
 * suppresses native notifications when the page is focused.
 */
import { getMessaging, isSupported, onMessage } from "firebase/messaging";
import { app } from "#lib/shared/auth/firebase.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

let unsubscribe: (() => void) | null = null;
// Bumped by every start/stop so a support check that resolves after the caller
// already tore down can tell it lost the race and skip subscribing.
let generation = 0;

export function startForegroundMessageListener(): void {
	if (unsubscribe) return;
	const claimed = ++generation;

	void (async () => {
		// iOS Safari exposes the Push API only to installed PWAs, so getMessaging
		// throws messaging/unsupported-browser for every visitor in a normal tab.
		// That is expected, not a fault — but the old unguarded call routed it
		// through console.error, and PostHog's capture_console_errors promoted it
		// to an $exception on every single iOS session.
		const supported = await isSupported().catch(() => false);
		if (!supported || claimed !== generation || unsubscribe) return;

		try {
			const messaging = getMessaging(app);

			unsubscribe = onMessage(messaging, (payload) => {
				const data = payload.data || {};
				// State-sync messages (badge/dismiss) are not user-facing.
				if (data.action) return;
				const title = data.title || "New notification";
				const body = data.body || "";

				toast.info(`${title}: ${body}`, 5000);
			});
		} catch (error) {
			console.error(
				"[ForegroundMessageHandler] Failed to start listener:",
				error,
			);
		}
	})();
}

export function stopForegroundMessageListener(): void {
	// Invalidates any start() still awaiting its support check, so an unmount
	// during that window can't leave a listener behind with nobody to clean it up.
	generation++;
	if (unsubscribe) {
		unsubscribe();
		unsubscribe = null;
	}
}
