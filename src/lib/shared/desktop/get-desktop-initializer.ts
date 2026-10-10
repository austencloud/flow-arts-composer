import { browser } from "$app/env";
import { DesktopInitializer } from "./desktop-initializer";

let instance: DesktopInitializer | null = null;

export function getDesktopInitializer(): DesktopInitializer {
	if (!browser) throw new Error("getDesktopInitializer() is browser-only");
	return (instance ??= new DesktopInitializer());
}
