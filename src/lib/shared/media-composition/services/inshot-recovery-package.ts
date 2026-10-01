import { z } from "zod";
import { PostTakeRefSchema, type PostTakeRef } from "../domain/post-plan";
import { importRecoveredInShotDraft } from "../domain/post-inshot-import";
import type { PostProject } from "../domain/post-project";

const PackageSchema = z
  .object({
    format: z.literal("post-studio-inshot-recovery-v1"),
    rawDraftText: z.string().min(1),
    assetManifest: z.array(
      z.object({
        source: z.string(),
        local: z.string(),
        bytes: z.number().nonnegative(),
        sha256: z.string(),
      })
    ),
    bindings: z.record(
      z.string(),
      z.object({
        ref: PostTakeRefSchema,
        label: z.string().min(1),
        durationSeconds: z.number().positive(),
        sourceOffsetSeconds: z.number().nonnegative(),
      })
    ),
    fonts: z
      .array(z.object({ family: z.string().min(1), ref: PostTakeRefSchema }))
      .default([]),
  })
  .strict();

/** File selection is explicit; neither draft phone paths nor missing files are treated as playable URLs. */
export async function readInShotRecoveryPackage(
  selected: readonly File[],
  sequenceId: string,
  now: number
): Promise<{ project: PostProject; files: Map<string, File> }> {
  const bundles = selected.filter((file) =>
    file.name.endsWith(".post-studio.json")
  );
  if (bundles.length !== 1)
    throw new Error(
      "Select one .post-studio.json recovery file and its media files."
    );
  const bundleFile = bundles[0]!;
  if (bundleFile.size > 10_000_000)
    throw new Error("The recovery description is too large.");
  const bundle = PackageSchema.parse(JSON.parse(await bundleFile.text()));
  const files = new Map<string, File>();
  for (const file of selected) {
    if (files.has(file.name))
      throw new Error(`Two selected files have the name ${file.name}.`);
    files.set(file.name, file);
  }
  function bind(ref: PostTakeRef): PostTakeRef {
    if (ref.kind !== "local") return ref;
    const file = files.get(ref.name);
    if (!file)
      throw new Error(`Also select ${ref.name} from the recovered files.`);
    if (ref.size !== file.size)
      throw new Error(
        `The size of ${ref.name} does not match the recovered asset.`
      );
    return {
      kind: "local",
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    };
  }
  const bindings = Object.fromEntries(
    Object.entries(bundle.bindings).map(([id, value]) => [
      id,
      { ...value, ref: bind(value.ref) },
    ])
  );
  const fonts = bundle.fonts.map((font) => ({ ...font, ref: bind(font.ref) }));
  const project = importRecoveredInShotDraft({
    ...bundle,
    bindings,
    sequenceId,
    now,
  });
  project.fonts = fonts;
  await loadPostProjectFonts(project, files);
  return { project, files };
}

const loadedFonts = new Map<string, Promise<void>>();

/** Wait for the actual recovered font before the first preview or export frame. */
export async function loadPostProjectFonts(
  project: PostProject,
  files: ReadonlyMap<string, File> = new Map()
): Promise<void> {
  for (const font of project.fonts ?? []) {
    const ref = font.ref;
    if (ref.kind === "catalog")
      throw new Error("A project font needs a local file or a URL.");
    const key = `${font.family}:${ref.kind === "linked" ? ref.url : `${ref.name}:${ref.size}:${ref.lastModified}`}`;
    let pending = loadedFonts.get(key);
    if (!pending) {
      pending = (async () => {
        const file = ref.kind === "local" ? files.get(ref.name) : null;
        if (ref.kind === "local" && !file)
          throw new Error(
            `Relink the font ${ref.name} to show this post correctly.`
          );
        const source = file
          ? await file.arrayBuffer()
          : `url(${JSON.stringify(ref.kind === "linked" ? ref.url : "")})`;
        const face = new FontFace(font.family, source);
        await face.load();
        document.fonts.add(face);
      })();
      loadedFonts.set(key, pending);
      pending.catch(() => loadedFonts.delete(key));
    }
    await pending;
  }
}
