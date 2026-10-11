// Materializes `_app/env.js` for the native (Capacitor) bundle.
//
// adapter-cloudflare serves the dynamic `$app/env/public` values (src/env.ts)
// from the Worker at runtime (GET /_app/env.js). The native shell has no
// Worker — Capacitor serves the built files statically — so that request
// 404s, the client's dynamic import of `/_app/env.js` rejects, and ALL client
// hydration dies (no interactivity, no native init, no redirect). The page
// still paints because prerendered HTML is static, which is why this was
// latent until on-device hydration was checked.
//
// This writes the same file SvelteKit's own builder emits for prerendered deps
// (`@sveltejs/kit/src/core/adapt/builder.js`: `export const env=${uneval(values)}`;
// JSON is a valid spelling of those string values) from the PUBLIC_* vars in
// the environment / .env. The client reads only the names src/env.ts declares,
// so extra keys are ignored. Run AFTER `vite build` (so the output dir exists)
// and BEFORE `cap sync`.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = ".svelte-kit/cloudflare/_app/env.js";
const PREFIX = "PUBLIC_"; // SvelteKit default publicPrefix

const pub = {};

// process.env wins (CI injects real secrets there); .env fills any gaps.
for (const [k, v] of Object.entries(process.env)) {
	if (k.startsWith(PREFIX) && v !== undefined) pub[k] = v;
}
if (existsSync(".env")) {
	for (const line of readFileSync(".env", "utf8").split("\n")) {
		const m = line.match(/^\s*(PUBLIC_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
		if (m && !(m[1] in pub)) {
			let val = m[2];
			if (
				(val.startsWith('"') && val.endsWith('"')) ||
				(val.startsWith("'") && val.endsWith("'"))
			) {
				val = val.slice(1, -1);
			}
			pub[m[1]] = val;
		}
	}
}

if (Object.keys(pub).length === 0) {
	console.warn("[native-env] WARNING: no PUBLIC_ vars found; env.js will be empty");
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `export const env=${JSON.stringify(pub)}`);
console.log(
	`[native-env] wrote ${OUT} with ${Object.keys(pub).length} PUBLIC_ vars: ${Object.keys(pub).join(", ")}`
);
