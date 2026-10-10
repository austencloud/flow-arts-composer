import type { ComposerPlacement } from "../types";
import type { PlacementPersistence } from "./types";

function sceneIdToConstName(sceneId: string): string {
  return sceneId.toUpperCase().replace(/-/g, "_") + "_PLACEMENTS";
}

export function serializeComposerPlacements(
  sceneId: string,
  placements: ComposerPlacement[]
): string {
  const constName = sceneIdToConstName(sceneId);
  const lines: string[] = [];

  lines.push(
    `import type { ComposerPlacement } from "#lib/shared/3d/scene-composer/types.js";`
  );
  lines.push("");

  if (placements.length === 0) {
    lines.push(`export const ${constName}: ComposerPlacement[] = [];`);
    lines.push("");
    return lines.join("\n");
  }

  lines.push(`export const ${constName}: ComposerPlacement[] = [`);

  for (const p of placements) {
    const pos = `[${p.position.map((n) => round(n)).join(", ")}]`;
    const rot = `[${p.rotation.map((n) => round(n, 4)).join(", ")}]`;
    const scl = `[${p.scale.map((n) => round(n)).join(", ")}]`;

    lines.push("  {");
    lines.push(`    id: "${p.id}",`);
    lines.push(`    objectKey: "${p.objectKey}",`);
    lines.push(`    position: ${pos},`);
    lines.push(`    rotation: ${rot},`);
    lines.push(`    scale: ${scl},`);
    if (p.source === "native") lines.push(`    source: "native",`);
    if (p.locked) lines.push(`    locked: true,`);
    if (p.visible === false) lines.push(`    visible: false,`);
    lines.push("  },");
  }

  lines.push("];");
  lines.push("");
  return lines.join("\n");
}

function round(n: number, decimals = 2): string {
  return Number(n.toFixed(decimals)).toString();
}

export class FilePersistence implements PlacementPersistence {
  async save(sceneId: string, placements: ComposerPlacement[]): Promise<void> {
    const content = serializeComposerPlacements(sceneId, placements);
    const response = await fetch(`/__composer-placements/${sceneId}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: content,
    });
    if (!response.ok) {
      throw new Error(
        `Failed to write placements: ${response.status} ${response.statusText}`
      );
    }
  }
}
