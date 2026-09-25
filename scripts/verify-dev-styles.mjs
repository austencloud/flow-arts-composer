import http from "node:http";
import https from "node:https";

// Read-only probe of the running server. A component test uses its own Vite
// instance and cannot detect a broken stylesheet cached by the user's server.
const origin = new URL(process.argv[2] ?? "https://[::1]:5173");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
  !["http:", "https:"].includes(origin.protocol)
) {
  throw new Error("This diagnostic only accepts a local development server.");
}

function read(url) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.get(
      url,
      { rejectUnauthorized: false, headers: { Accept: "*/*" } },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("error", reject);
        response.on("end", () => {
          if (response.statusCode !== 200) {
            reject(
              new Error(
                `HTTP ${response.statusCode} for ${url.pathname}${url.search}`
              )
            );
          } else resolve(body);
        });
      }
    );
    request.setTimeout(15000, () =>
      request.destroy(new Error("Request timed out"))
    );
    request.on("error", reject);
  });
}

const components = [
  "/src/routes/+layout.svelte",
  "/src/lib/shared/foundation/ui/modal/BaseModal.svelte",
  "/src/lib/shared/share/components/ShareSheetFrame.svelte",
  "/src/lib/shared/share/components/PostShareSheet.svelte",
];

for (const component of components) {
  try {
    // Svelte's CSS loader reads compilation metadata from its owning module.
    await read(new URL(component, origin));
    const response = await read(
      new URL(`${component}?svelte&type=style&lang.css`, origin)
    );
    const literal = response.match(/^const __vite__css = (".*")\s*$/m)?.[1];
    if (!literal) throw new Error("Missing Vite stylesheet response");
    const css = JSON.parse(literal);
    if (/<\/?(?:script|style)\b|:global\(/.test(css)) {
      throw new Error(
        "Raw component source served as CSS; sizing rules cannot apply"
      );
    }
    if (component.endsWith("/BaseModal.svelte")) {
      const intrinsicRule = css.match(
        /dialog\[data-intrinsic-size=["']?true["']?\][^{]*\.modal-content-wrapper[^{]*\{([^}]*)\}/
      )?.[1];
      if (
        !intrinsicRule ||
        !/flex:\s*0\s+0\s+auto\s*[;}]/.test(`${intrinsicRule}}`)
      ) {
        throw new Error("Missing intrinsic modal sizing rule");
      }
    }
    console.log(`PASS ${component}`);
  } catch (error) {
    console.error(`FAIL ${component}: ${error.message}`);
    process.exitCode = 1;
  }
}
