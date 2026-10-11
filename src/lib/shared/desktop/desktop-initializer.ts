import { isDesktop } from "./is-desktop";
import { DesktopDataSeeder } from "./desktop-data-seeder";

export class DesktopInitializer {
	private seeder = new DesktopDataSeeder();
	private seeded: Promise<void> = Promise.resolve();

	/**
	 * Resolves once bundled data (deck catalog, public gallery index) is in
	 * IndexedDB. Boot code that reads those tables waits on this so a first
	 * launch finds the bundle rather than an empty cache. Already resolved on
	 * the web.
	 */
	get dataSeeded(): Promise<void> {
		return this.seeded;
	}

	async initialize(): Promise<void> {
		if (!isDesktop()) return;

		this.seeded = this.initDataSeeder();
		await Promise.all([
			this.initWindowState(),
			this.initNavigation(),
			this.initServiceWorkerTeardown(),
			this.initUpdater(),
			this.seeded,
		]);
	}

	private async initWindowState(): Promise<void> {
		// Window state plugin remembers size/position across launches — no code needed,
		// the Tauri plugin handles it automatically via the registration in lib.rs.
	}

	// The desktop shell serves the static bundle: only prerendered pages exist as
	// files, and any other path falls back to index.html (the landing). Every
	// route must therefore be entered through the client router. Two pieces:
	//
	// 1. Boot into the app. The webview loads "/" — the marketing landing. Like
	//    the Capacitor shell (NativeInitializer.bootIntoApp), a standalone app
	//    boots straight into the Composer, replacing the history entry so Back
	//    exits cleanly.
	// 2. Neutralize data-sveltekit-reload. Landing chrome marks /create links
	//    with data-sveltekit-reload to cross from public pages into the app
	//    shell via a full document load. On desktop that full load can only
	//    return the index.html fallback, so convert those clicks to client
	//    navigations instead.
	private async initNavigation(): Promise<void> {
		const { goto } = await import("$app/navigation");

		document.addEventListener(
			"click",
			(event) => {
				if (event.defaultPrevented || event.button !== 0) return;
				if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

				const anchor = (event.target as Element | null)?.closest?.("a");
				if (!anchor || !anchor.hasAttribute("data-sveltekit-reload")) return;
				if (anchor.target && anchor.target !== "_self") return;
				if (anchor.hasAttribute("download")) return;

				const url = new URL(anchor.href, location.href);
				if (url.origin !== location.origin) return;

				event.preventDefault();
				void goto(url.pathname + url.search + url.hash);
			},
			{ capture: true }
		);

		if (location.pathname === "/") {
			await goto("/create", { replace: true });
		}
	}

	// The PWA service worker must never run in the desktop shell: updates are
	// owned by the Tauri updater, and a worker installed by an older desktop
	// build keeps serving its cached bundle after the binary updates.
	// hooks.client.ts skips registration on desktop; this cleans up workers that
	// earlier desktop builds already installed in the persistent webview profile.
	private async initServiceWorkerTeardown(): Promise<void> {
		if (!("serviceWorker" in navigator)) return;
		try {
			const registrations = await navigator.serviceWorker.getRegistrations();
			await Promise.all(registrations.map((reg) => reg.unregister()));
			if ("caches" in window) {
				const keys = await caches.keys();
				await Promise.all(keys.map((key) => caches.delete(key)));
			}
		} catch (err) {
			console.warn("[Desktop] Service worker teardown skipped:", err);
		}
	}

	private async initUpdater(): Promise<void> {
		try {
			const { check } = await import("@tauri-apps/plugin-updater");
			// Offline or captive networks must not hold the desktop boot hostage.
			const update = await check({ timeout: 5000 });
			if (update) {
				console.log(`[Desktop] Update available: ${update.version}`);
				await update.downloadAndInstall();
			}
		} catch (err) {
			console.warn("[Desktop] Update check skipped:", err);
		}
	}

	private async initDataSeeder(): Promise<void> {
		try {
			const appVersion = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
			await this.seeder.seedIfNeeded(appVersion);
		} catch (err) {
			console.error("[Desktop] Data seeding failed:", err);
		}
	}
}
