import {
  type PostBox,
  type PostFraming,
  type PostItem,
  type PostKeyframe,
  type PostProject,
  type PostSourceGeometry,
} from "#lib/shared/media-composition/domain/post-project.js";
import {
  finish,
  type EditContext,
} from "#lib/shared/media-composition/domain/post-project-edits.js";

const reverse = (value: number): number => (value === 0 ? 0 : -value);

function mirrorBox(box: PostBox): PostBox {
  return {
    ...box,
    x: 1 - box.x - box.width,
    ...(box.turn !== undefined ? { turn: reverse(box.turn) } : {}),
  };
}

function mirrorGeometry(geometry: PostSourceGeometry): PostSourceGeometry {
  return {
    ...geometry,
    x: 1 - geometry.x - geometry.width,
    rotation: reverse(geometry.rotation),
    // The same source pixels must remain selected. Flipping the footage after
    // cropping reflects the picture without changing which part was chosen.
  };
}

function mirrorFraming(framing: PostFraming): PostFraming {
  return {
    ...framing,
    panX: reverse(framing.panX),
    rotation: reverse(framing.rotation),
  };
}

function mirrorKeys<Value>(
  keys: readonly PostKeyframe<Value>[] | undefined,
  mirror: (value: Value) => Value
): PostKeyframe<Value>[] | undefined {
  return keys?.map((key) => ({ ...key, value: mirror(key.value) }));
}

function mirrorItem(item: PostItem): PostItem {
  const box = mirrorBox(item.box);
  const boxKeys = mirrorKeys(item.keyframes?.box, mirrorBox);
  if (item.kind === "video") {
    const keys = item.keyframes;
    return {
      ...item,
      box,
      flip: !item.flip,
      panX: reverse(item.panX),
      rotation: reverse(item.rotation),
      ...(item.sourceGeometry
        ? { sourceGeometry: mirrorGeometry(item.sourceGeometry) }
        : {}),
      ...(keys
        ? {
            keyframes: {
              ...keys,
              ...(boxKeys ? { box: boxKeys } : {}),
              ...(keys.framing
                ? { framing: mirrorKeys(keys.framing, mirrorFraming) }
                : {}),
              ...(keys.sourceGeometry
                ? {
                    sourceGeometry: mirrorKeys(
                      keys.sourceGeometry,
                      mirrorGeometry
                    ),
                  }
                : {}),
            },
          }
        : {}),
    };
  }
  if (item.kind === "image") {
    const keys = item.keyframes;
    return {
      ...item,
      box,
      ...(item.sourceGeometry
        ? { sourceGeometry: mirrorGeometry(item.sourceGeometry) }
        : {}),
      ...(keys
        ? {
            keyframes: {
              ...keys,
              ...(boxKeys ? { box: boxKeys } : {}),
              ...(keys.sourceGeometry
                ? {
                    sourceGeometry: mirrorKeys(
                      keys.sourceGeometry,
                      mirrorGeometry
                    ),
                  }
                : {}),
            },
          }
        : {}),
    };
  }
  return {
    ...item,
    box,
    ...(item.keyframes
      ? {
          keyframes: {
            ...item.keyframes,
            ...(boxKeys ? { box: boxKeys } : {}),
          },
        }
      : {}),
  };
}

/** Reflects authored picture motion while leaving text and source crops readable. */
export function mirrorPostProject(
  project: PostProject,
  ctx: EditContext
): PostProject {
  return finish(
    {
      ...project,
      mirrored: !project.mirrored,
      tracks: project.tracks.map((track) => ({
        ...track,
        items: track.items.map(mirrorItem),
      })),
    },
    ctx
  );
}
