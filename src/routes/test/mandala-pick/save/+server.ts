import type { RequestHandler } from "@sveltejs/kit";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Dev-only: the Choose button POSTs the picked mandala objects here, and we bake
// them into chosen-mandalas.ts so the composer showcase renders them with no
// auth. The dev server runs from the project root, so resolve from cwd.
const OUT = join(
  process.cwd(),
  "src/routes/(public)/composer/_sections/chosen-mandalas.ts",
);

export const POST: RequestHandler = async ({ request }) => {
  let chosen: unknown;
  try {
    ({ chosen } = await request.json());
  } catch {
    return Response.json({ ok: false, error: "bad JSON body" }, { status: 400 });
  }
  if (!Array.isArray(chosen)) {
    return Response.json({ ok: false, error: "expected { chosen: [...] }" }, { status: 400 });
  }

  const body = JSON.stringify(chosen, null, 2);
  const ts = `import type { ShowcaseMandala } from "./showcase-mandalas";

/* AUTO-WRITTEN by the Choose button on /test/mandala-pick. ${chosen.length} pick(s). */
export const CHOSEN_MANDALAS = ${body} as unknown as ShowcaseMandala[];
`;

  try {
    writeFileSync(OUT, ts, "utf8");
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "write failed" },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, count: chosen.length });
};
