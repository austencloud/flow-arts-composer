import { browser } from "$app/env";

export function isDesktop(): boolean {
	return browser && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
