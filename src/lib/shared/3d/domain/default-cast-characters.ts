/**
 * The three real-looking people who join Jade (ch07) as the default cast,
 * replacing the faceless x-bot mannequin. Austen chose the four on
 * 2026-11-12 from the casting page: two women, two men.
 *
 * Until their files are uploaded to the CDN these are `local-evaluation`
 * bodies. They load from the gitignored bake-off folder on a machine that
 * has them (converted in the October avatar hunt, branch `codex/avatar-hunt`)
 * and do not exist in a production build, so the live site keeps the
 * mannequin until the upload is approved and these entries move to CDN paths.
 *
 * Licences, for the move to the CDN:
 * - Sophia and Manuel are Renderpeople photo scans. The copies on disk came
 *   from renderpeople.com and are evaluation-only (its terms forbid serving
 *   them as downloadable files). The same models are on Sketchfab under
 *   CC BY 4.0; ship those copies, with a credit line.
 * - Owen is Microsoft Rocketbox "Male Adult 08", MIT licensed.
 *
 * Registered here, at the scene-package boundary, because the package owns
 * the catalog array every picker and loader reads.
 */
import { AVATAR_DEFINITIONS, type AvatarDefinition } from "@austencloud/scene-3d";

const BAKEOFF = "/models/avatars/bakeoff";

export const DEFAULT_CAST_LOCAL_DEFINITIONS: readonly AvatarDefinition[] = [
  {
    id: "renderpeople-sophia",
    name: "Sophia",
    modelPath: `${BAKEOFF}/intake-hunt-renderpeople-sophia.glb`,
    icon: "fa-person-dress",
    description: "Renderpeople scan, Sophia Animated 003",
    availability: "local-evaluation",
  },
  {
    id: "renderpeople-manuel",
    name: "Manuel",
    modelPath: `${BAKEOFF}/intake-hunt-renderpeople-manuel.glb`,
    icon: "fa-person",
    description: "Renderpeople scan, Manuel Animated 001",
    availability: "local-evaluation",
  },
  {
    id: "rocketbox-male-adult-08",
    name: "Owen",
    modelPath: `${BAKEOFF}/intake-hunt-rocketbox-male-adult-08.glb`,
    icon: "fa-person",
    description: "Microsoft Rocketbox Male Adult 08",
    availability: "local-evaluation",
  },
];

// Same rule the package applies to its own local-evaluation body: a
// production build has no route to discover or request these.
if (import.meta.env?.DEV === true) {
  for (const definition of DEFAULT_CAST_LOCAL_DEFINITIONS) {
    if (!AVATAR_DEFINITIONS.some(({ id }) => id === definition.id)) {
      AVATAR_DEFINITIONS.push(definition);
    }
  }
}
