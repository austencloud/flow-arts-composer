import { json, type RequestHandler } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isRetiredModelSprite } from "$lib/shared/pictograph/prop/domain/retired-model-sprites";

// Dev-only: /test/prop-3d-studio/sprites POSTs each captured prop sprite here.
// The dev server runs from the project root, so resolve from cwd.
const SPRITE_DIR = join(process.cwd(), "static/images/props/appearances/model");
const MANIFEST_JSON = join(SPRITE_DIR, "manifest.json");
const MANIFEST_TS = join(
  process.cwd(),
  "src/lib/shared/pictograph/prop/domain/prop-model-sprites.generated.ts"
);

interface PaintedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ManifestEntry {
  width: number;
  height: number;
  fit: number;
  capturedAt: string;
  extent?: { x: number; y: number; z: number };
  gripOffset?: { x: number; y: number };
  /** Painted window of the capture in box units (see painted-bounds.ts). */
  bounds?: PaintedBounds;
  colors?: string[];
}

function isPaintedBounds(value: unknown): value is PaintedBounds {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["x", "y", "width", "height"].every(
    (key) => typeof record[key] === "number" && Number.isFinite(record[key])
  );
}

function boundsLiteral(bounds: PaintedBounds): string {
  return `bounds: { x: ${bounds.x}, y: ${bounds.y}, width: ${bounds.width}, height: ${bounds.height} }`;
}

function readManifest(): Record<string, ManifestEntry> {
  if (!existsSync(MANIFEST_JSON)) return {};
  try {
    return JSON.parse(readFileSync(MANIFEST_JSON, "utf8"));
  } catch {
    return {};
  }
}

function sortedManifest(
  manifest: Record<string, ManifestEntry>
): Record<string, ManifestEntry> {
  return Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))
  );
}

function writeManifest(manifest: Record<string, ManifestEntry>): void {
  const sorted = sortedManifest(manifest);
  writeFileSync(MANIFEST_JSON, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

// The generated module is imported (transitively) by the capture page, so
// writing it mid-run makes Vite hot-reload the page and restart the capture.
// It is written once, when the driver posts { finalize: true }.
function writeGeneratedModule(manifest: Record<string, ManifestEntry>): void {
  const sorted = sortedManifest(manifest);
  // Only complete pairs reach the app; a half-captured prop keeps its
  // pictograph look instead of drawing one hand blank.
  const complete = Object.entries(sorted).filter(
    ([, entry]) =>
      entry.colors?.includes("blue") && entry.colors?.includes("red")
  );
  const rows = complete
    .map(([prop, entry]) => {
      const fields = [
        `width: ${entry.width}`,
        `height: ${entry.height}`,
        `fit: ${Number(entry.fit.toFixed(3))}`,
        `capturedAt: ${JSON.stringify(entry.capturedAt)}`,
      ];
      if (entry.bounds) fields.push(boundsLiteral(entry.bounds));
      return `  ${JSON.stringify(prop)}: { ${fields.join(", ")} },`;
    })
    .join("\n");
  const ts = `/**
 * AUTO-WRITTEN by /test/prop-3d-studio/sprites. Do not edit by hand.
 *
 * Every prop whose 2D "3D model" look has a captured sprite pair under
 * static/images/props/appearances/model/<prop>-{blue,red}.svg. The box is the
 * same pictograph box PROP_DIMENSIONS already uses for that prop, so tip
 * points, trails, and mandala reach are unchanged by the look.
 */
export interface PropModelSpriteBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PropModelSpriteEntry {
  readonly width: number;
  readonly height: number;
  /** Uniform scale (2D units per meter) that fit the 3D model into the box. */
  readonly fit: number;
  /** ISO timestamp of the capture that wrote the sprite pair. */
  readonly capturedAt: string;
  /**
   * Where the prop paints inside the grip-centred box, in box units. A
   * one-sided prop fills only half its box; picker tiles crop to this.
   */
  readonly bounds?: PropModelSpriteBounds;
}

export const PROP_MODEL_SPRITES: Readonly<
  Record<string, PropModelSpriteEntry>
> = {
${rows}
};
`;
  writeFileSync(MANIFEST_TS, ts, "utf8");
}

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) return json({ ok: false, error: "dev only" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "bad JSON body" }, { status: 400 });
  }
  if (body.finalize === true) {
    try {
      writeGeneratedModule(readManifest());
    } catch (err) {
      return json(
        { ok: false, error: err instanceof Error ? err.message : "write failed" },
        { status: 500 }
      );
    }
    return json({ ok: true });
  }

  const { prop, color, width, height, fit, dataUrl, extent, gripOffset, bounds } =
    body;
  if (
    typeof prop !== "string" ||
    !/^[a-z0-9_]+$/.test(prop) ||
    (color !== "blue" && color !== "red") ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof fit !== "number" ||
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith("data:image/webp;base64,")
  ) {
    return json(
      { ok: false, error: "invalid capture payload" },
      { status: 400 }
    );
  }
  if (isRetiredModelSprite(prop)) {
    return json(
      { ok: false, error: `${prop} has no Version 2: its capture duplicates another look` },
      { status: 400 }
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" data-prop-look="model" data-prop="${prop}" data-motion-color="${color}">
  <title>${prop} 3D model sprite (${color})</title>
  <desc>Captured from the production Prop3D model by /test/prop-3d-studio/sprites. Centered in and scaled to fill the pictograph box, like the pictograph artwork.</desc>
  <image href="${dataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>
</svg>
`;

  try {
    mkdirSync(SPRITE_DIR, { recursive: true });
    writeFileSync(join(SPRITE_DIR, `${prop}-${color}.svg`), svg, "utf8");
    const manifest = readManifest();
    const previous = manifest[prop];
    const colors = new Set(previous?.colors ?? []);
    colors.add(color);
    manifest[prop] = {
      width,
      height,
      fit,
      capturedAt: new Date().toISOString(),
      extent:
        extent && typeof extent === "object"
          ? (extent as ManifestEntry["extent"])
          : previous?.extent,
      gripOffset:
        gripOffset && typeof gripOffset === "object"
          ? (gripOffset as ManifestEntry["gripOffset"])
          : previous?.gripOffset,
      bounds: isPaintedBounds(bounds) ? bounds : previous?.bounds,
      colors: [...colors].sort(),
    };
    writeManifest(manifest);
  } catch (err) {
    return json(
      { ok: false, error: err instanceof Error ? err.message : "write failed" },
      { status: 500 }
    );
  }
  return json({ ok: true });
};
