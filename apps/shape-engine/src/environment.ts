// The shared renderer also runs in SvelteKit. This host always runs on a client.
export const browser = true;
export const building = false;
export const dev = import.meta.env.DEV;
export const version = "1.0.0";
