import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  POST_BOX,
  POST_DEFAULT_CANVAS,
  PostProjectSchema,
  createEmptyPostProject,
  projectDurationSeconds,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import { studioProjectKindFromId } from "#lib/shared/media-composition/domain/studio-project-id.js";
import { loadPostDraft } from "#lib/shared/media-composition/services/post-draft-storage.js";
import { loadPostProject } from "#lib/shared/media-composition/services/post-project-store.js";
import {
  currentPostAccount,
  readAccountPostProjectPreview,
} from "./post-account-projects.js";
import {
  assertStudioAccount,
  persistStudioProject,
} from "./studio-arrangement-projects.js";
import {
  cachedPostSequence,
  resolvePostSequence,
} from "./post-workspace-projects.js";

export interface StudioProjectPreview {
  sequence: SequenceData | null;
  duration: number;
  width: number;
  height: number;
  itemCount: number;
  kinds: string[];
  cover: { kind: "image" | "video"; url: string; time?: number } | null;
  title?: string;
  kind: "tutorial" | "showcase" | "arrangement" | "video";
}

// Cards enter the viewport together. Keep their cloud and disk reads bounded.
let activePreviewReads = 0;
const waitingPreviewReads: Array<() => void> = [];

async function withPreviewReadSlot<T>(read: () => Promise<T>): Promise<T> {
  if (activePreviewReads < 4) activePreviewReads++;
  else await new Promise<void>((resume) => waitingPreviewReads.push(resume));
  try {
    return await read();
  } finally {
    const next = waitingPreviewReads.shift();
    if (next) next();
    else activePreviewReads--;
  }
}

function linkedUrl(
  ref: { kind: string; url?: string } | undefined
): string | null {
  if (ref?.kind !== "linked" || !ref.url) return null;
  const url = ref.url.trim();
  return /^https?:\/\/[^\s]+$/i.test(url) ||
    /^\/api\/dev\/feature-videos\/[^\s]+\/media\/[^\s]+$/.test(url)
    ? url
    : null;
}

/** A cheap, truthful card description from a saved timeline. No media is loaded here. */
export function describeStudioProject(
  project: PostProject,
  sequence: SequenceData | null,
  options: { title?: string; kind?: StudioProjectPreview["kind"] } = {}
): StudioProjectPreview {
  const [width, height] = (project.canvas ?? POST_DEFAULT_CANVAS)
    .split(":")
    .map(Number) as [number, number];
  const items = project.tracks
    .filter((track) => !track.hidden)
    .flatMap((track) => track.items);
  const kinds = [...new Set(items.map((item) => item.kind))];
  let cover: StudioProjectPreview["cover"] = null;
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    if (item.kind === "image") {
      const url = linkedUrl(
        project.images?.find((image) => image.id === item.imageId)?.ref
      );
      if (url) {
        cover = { kind: "image", url };
        break;
      }
    }
    if (item.kind === "video") {
      const url = linkedUrl(
        project.takes.find((take) => take.id === item.takeId)?.ref
      );
      if (url) {
        cover = { kind: "video", url, time: item.sourceIn };
        break;
      }
    }
  }
  const title =
    options.title?.trim() ||
    sequence?.displayName ||
    sequence?.name ||
    sequence?.word ||
    undefined;
  return {
    sequence,
    duration: projectDurationSeconds(project),
    width,
    height,
    itemCount: items.length,
    kinds,
    cover,
    ...(title ? { title } : {}),
    kind:
      options.kind ?? studioProjectKindFromId(project.sequenceId) ?? "video",
  };
}

/** Reads a visible card's saved project without selecting it or opening an editor. */
export async function loadStudioProjectPreview(input: {
  sequenceId?: string;
  featureSlug?: string;
}): Promise<StudioProjectPreview | null> {
  return withPreviewReadSlot(() => readStudioProjectPreview(input));
}

async function readStudioProjectPreview(input: {
  sequenceId?: string;
  featureSlug?: string;
}): Promise<StudioProjectPreview | null> {
  if (input.featureSlug) {
    if (!import.meta.env.DEV) return null;
    const uid = await currentPostAccount();
    const { loadFeatureVideo } =
      await import("#lib/shared/media-composition/services/feature-video-client.js");
    const file = await loadFeatureVideo(input.featureSlug);
    assertStudioAccount(uid);
    return describeStudioProject(
      file.project,
      cachedPostSequence(file.project.sequenceId),
      {
        title: file.title,
        kind: "showcase",
      }
    );
  }
  const id = input.sequenceId;
  if (!id) return null;
  const { project, sequence } = await readStudioProject(id, false);
  if (!project) return null;
  return describeStudioProject(project, sequence);
}

async function readStudioProject(
  id: string,
  resolveSource = true
): Promise<{
  project: PostProject | null;
  sequence: SequenceData | null;
  uid: string | null;
}> {
  const uid = await currentPostAccount();
  const local = loadPostProject(id);
  // The dev disk archive is shared across browser accounts. Signed-in cards
  // must use only this account's scoped device copy and cloud document.
  const disk = uid ? null : (await loadPostDraft(id)).project;
  assertStudioAccount(uid);
  let cloud: Awaited<ReturnType<typeof readAccountPostProjectPreview>> = null;
  if (uid) {
    try {
      cloud = await readAccountPostProjectPreview(uid, id);
    } catch (cause) {
      if (!local) throw cause;
    }
  }
  assertStudioAccount(uid);
  const project =
    [local, disk, cloud?.project ?? null]
      .filter((candidate): candidate is PostProject => candidate !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  const sequence = project
    ? (cloud?.source ??
      (resolveSource ? await resolvePostSequence(id) : cachedPostSequence(id)))
    : null;
  assertStudioAccount(uid);
  return { project, sequence, uid };
}

/** Dev feature copies get a new folder and their own media files. */
export async function duplicateSoftwareFeatureVideo(
  slug: string,
  title: string
): Promise<string> {
  if (!import.meta.env.DEV)
    throw new Error("Feature video copies are available on the dev server.");
  const client =
    await import("#lib/shared/media-composition/services/feature-video-client.js");
  return client.duplicateSoftwareFeatureVideo(slug, title);
}

function nameFor(
  sequence: SequenceData,
  title: string | undefined,
  fallback: string
): string {
  return (
    title?.trim() ||
    sequence.displayName ||
    sequence.name ||
    sequence.word ||
    fallback
  );
}

async function createIndependentProject(
  sequence: SequenceData,
  title: string | undefined,
  kind: "tutorial" | "showcase" | "arrangement",
  template?: PostProject
): Promise<string> {
  if (!sequence.steps?.length) throw new Error("Choose a sequence with steps.");
  const uid = await currentPostAccount();
  const id =
    kind === "arrangement"
      ? `studio-arrangement:${crypto.randomUUID()}`
      : `studio-project:${kind}:${crypto.randomUUID()}`;
  const name = nameFor(
    sequence,
    title,
    kind === "tutorial"
      ? "Tutorial"
      : kind === "arrangement"
        ? "Arrangement"
        : "Software showcase"
  );
  const source = structuredClone({
    ...sequence,
    id,
    name,
    displayName: name,
  }) as SequenceData;
  const now = Date.now();
  const empty = createEmptyPostProject({ sequenceId: id, now });
  const project = template
    ? PostProjectSchema.parse({
        ...structuredClone(template),
        sequenceId: id,
        updatedAt: now,
      })
    : kind === "tutorial"
      ? PostProjectSchema.parse({
          ...empty,
          tracks: [
            {
              ...empty.tracks[0]!,
              items: [
                {
                  id: "sequence-card-1",
                  kind: "card",
                  start: 0,
                  duration: 6,
                  box: { ...POST_BOX.full },
                  opacity: 1,
                  fadeIn: 0,
                  fadeOut: 0,
                  anchor: null,
                  fill: false,
                },
              ],
            },
            {
              id: "sequence-animation",
              hidden: false,
              locked: false,
              items: [
                {
                  id: "sequence-animation-1",
                  kind: "animation",
                  start: 0,
                  duration: 6,
                  box: { ...POST_BOX.bottom },
                  opacity: 1,
                  fadeIn: 0,
                  fadeOut: 0,
                  anchor: { itemId: "sequence-card-1", offset: 0 },
                  fill: true,
                  overlay: true,
                },
              ],
            },
          ],
        })
      : empty;
  await persistStudioProject(source, project, uid);
  return id;
}

/** Starts a tutorial from a chosen sequence, with its animation ready to edit. */
export function createStudioTutorial(
  sequence: SequenceData,
  title?: string
): Promise<string> {
  return createIndependentProject(sequence, title, "tutorial");
}

/** Copies a saved tutorial or showcase into a new independent draft. */
export async function duplicateStudioProject(
  sequenceId: string,
  title?: string
): Promise<string> {
  const uid = await currentPostAccount();
  const saved = await readStudioProject(sequenceId);
  assertStudioAccount(uid);
  if (!saved.project) throw new Error("This project is unavailable.");
  const source = saved.sequence;
  if (!source)
    throw new Error("This project's source sequence is unavailable.");
  const kind = studioProjectKindFromId(sequenceId) ?? "tutorial";
  return createIndependentProject(
    source,
    title || `${nameFor(source, undefined, "Project")} (copy)`,
    kind,
    saved.project
  );
}

/** A source is explicit because the current Post editor requires real sequence steps. */
export function createSoftwareProject(
  title: string,
  source: SequenceData
): Promise<string> {
  if (!title.trim()) throw new Error("Name this software showcase.");
  return createIndependentProject(source, title, "showcase");
}
