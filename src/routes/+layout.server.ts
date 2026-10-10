import type { LayoutServerLoad } from "./$types";
import { parseCloudflareGeo } from "#lib/shared/presence/domain/models/presence-models.js";
import { requestCf } from "#lib/server/cloudflare/worker-env.js";

export const load: LayoutServerLoad = ({ request }) => {
  const cf = requestCf(request);
  return {
    geo: parseCloudflareGeo(request.headers, cf),
    // The one trustworthy reduced-data signal, and the only one available
    // before hydration. `Save-Data: on` is sent only when the visitor has
    // actually turned on the browser's data-saver mode — unlike the Network
    // Information API's bandwidth estimate, which reports '3g' on gigabit
    // desktops. Reading it here lets the SERVER render the correct hero for
    // each visitor instead of shipping everyone the degraded one and undoing
    // it after hydration.
    saveData: request.headers.get("save-data") === "on",
  };
};
