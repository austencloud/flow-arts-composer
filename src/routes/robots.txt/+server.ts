import { LANDING_DOMAIN } from "../../config/domains";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const robots = `User-agent: *
Allow: /

# Sitemap
Sitemap: ${LANDING_DOMAIN}/sitemap.xml

# Block internal + utility paths
Disallow: /api/
Disallow: /admin/
Disallow: /test/
Disallow: /demo/
Disallow: /composer/auth-lab
Disallow: /.svelte-kit/
Disallow: /embed/
Disallow: /render-pictographs
Disallow: /endless-spinner
Disallow: /coven
Disallow: /hall-of-shame
Disallow: /grant-feature
Disallow: /1989
Disallow: /1995
Disallow: /1998
Disallow: /2003`;

  return new Response(robots, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
