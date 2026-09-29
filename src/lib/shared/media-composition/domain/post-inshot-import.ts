import {
  PostProjectSchema,
  type PostBox,
  type PostEasing,
  type PostImageItem,
  type PostProject,
  type PostSourceGeometry,
  type PostTextItem,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import type { PostTakeRef } from "$lib/shared/media-composition/domain/post-plan";

type Native = Record<string, unknown>;
const US = 1_000_000;
const ASPECT = 9 / 16;
const FULL = { x: 0, y: 0, width: 1, height: 1 } as const;

export interface InShotAssetManifestEntry {
  source: string;
  local: string;
  bytes: number;
  sha256: string;
}

/** A prepared, playable file for one draft item; repeated source paths bind separately. */
export interface InShotMediaBinding {
  ref: PostTakeRef;
  label: string;
  durationSeconds: number;
  /** Original media seconds removed from the prepared file's front. */
  sourceOffsetSeconds: number;
}

export interface ImportRecoveredInShotOptions {
  rawDraftText: string;
  assetManifest: InShotAssetManifestEntry[];
  bindings: Record<string, InShotMediaBinding | undefined>;
  sequenceId: string;
  now: number;
}

function object(value: unknown, name: string): Native {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`InShot ${name} must be an object`);
  }
  return value as Native;
}

function list(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`InShot ${name} must be a list`);
  return value;
}

/** The phone profile stores each ConfigJson as serialized JSON; the decoded view stores arrays. */
function configList(root: Native, section: string): unknown[] {
  const value = object(root[section], section).ConfigJson;
  return list(
    typeof value === "string" ? (JSON.parse(value) as unknown) : value,
    `${section}.ConfigJson`
  );
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`InShot ${name} must be a finite number`);
  }
  return value;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`InShot ${name} must be text`);
  return value;
}

function seconds(value: unknown, name: string): number {
  return number(value, name) / US;
}

function playbackRate(
  sourceInUs: unknown,
  sourceOutUs: unknown,
  durationUs: unknown
): number {
  const sourceSpan =
    number(sourceOutUs, "source out") - number(sourceInUs, "source in");
  const duration = number(durationUs, "clip duration");
  const rate = sourceSpan / duration;
  return Math.abs(rate - 1) < 1e-12 ? 1 : rate;
}

function sourcePath(clip: Native): string {
  return string(object(clip.MCI_1, "MCI_1").VFI_1, "VFI_1");
}

function requireAsset(
  path: string,
  assets: ReadonlyMap<string, InShotAssetManifestEntry>
): void {
  if (!assets.has(path))
    throw new Error(`InShot source asset is absent from manifest: ${path}`);
}

function bindingFor(
  id: string,
  bindings: ImportRecoveredInShotOptions["bindings"]
): InShotMediaBinding {
  const binding = bindings[id];
  if (
    !binding ||
    !Number.isFinite(binding.durationSeconds) ||
    binding.durationSeconds <= 0 ||
    !Number.isFinite(binding.sourceOffsetSeconds) ||
    binding.sourceOffsetSeconds < 0
  ) {
    throw new Error(`InShot item ${id} needs a prepared media binding`);
  }
  return binding;
}

function cropOf(clip: Native): PostSourceGeometry["crop"] {
  const crop = object(clip.MCI_11, "MCI_11");
  return {
    left: number(crop.CP_1, "CP_1"),
    top: number(crop.CP_2, "CP_2"),
    right: number(crop.CP_3, "CP_3"),
    bottom: number(crop.CP_4, "CP_4"),
  };
}

/** InShot's 4×4 affine transform uses a [-9/16,9/16] horizontal GL axis. */
function geometry(
  matrix: unknown,
  crop: PostSourceGeometry["crop"]
): PostSourceGeometry {
  const m = list(matrix, "transform matrix").map((entry, index) =>
    number(entry, `matrix[${index}]`)
  );
  if (m.length !== 16 || m[1] !== 0 || m[4] !== 0) {
    throw new Error("InShot transform has unsupported skew or matrix length");
  }
  const width = m[0]! / ASPECT;
  const height = m[5]!;
  return {
    x: (1 + m[12]! / ASPECT - width) / 2,
    y: (1 - m[13]! - height) / 2,
    width,
    height,
    rotation: 0,
    crop,
  };
}

function keyGeometry(
  key: Native,
  crop: PostSourceGeometry["crop"]
): PostSourceGeometry {
  const width = number(key.VKF_1, "VKF_1") / ASPECT;
  const height = number(key.VKF_2, "VKF_2");
  const centerX = number(key.VKF_3, "VKF_3");
  const centerY = number(key.VKF_4, "VKF_4");
  return {
    x: (1 + centerX / ASPECT - width) / 2,
    y: (1 - centerY - height) / 2,
    width,
    height,
    rotation: number(key.VKF_5, "VKF_5"),
    crop,
  };
}

function easing(code: number, unresolved: Set<string>): PostEasing {
  if (code === 0) return [0, 0, 1, 1];
  if (code === 4)
    return { kind: "sampled-bezier", curve: [0.3, 0, 0.7, 1], samples: 300 };
  if (code === 5)
    return { kind: "sampled-bezier", curve: [0.47, 0, 0, 1], samples: 300 };
  if (code === 6)
    return { kind: "sampled-bezier", curve: [1, 0, 0.53, 1], samples: 300 };
  unresolved.add(`VKF_9 easing code ${code}`);
  return "hold";
}

function nativeBox(bounds: unknown, width: number, height: number): PostBox {
  const p = list(bounds, "BI_13").map((v, i) => number(v, `BI_13[${i}]`));
  if (p.length < 8) throw new Error("InShot BI_13 bounds are incomplete");
  const xs = [p[0]!, p[2]!, p[4]!, p[6]!];
  const ys = [p[1]!, p[3]!, p[5]!, p[7]!];
  const left = Math.max(0, Math.min(1, Math.min(...xs) / width));
  const top = Math.max(0, Math.min(1, Math.min(...ys) / height));
  return {
    x: left,
    y: top,
    width: Math.max(
      0.05,
      Math.min(1 - left, (Math.max(...xs) - Math.min(...xs)) / width)
    ),
    height: Math.max(
      0.05,
      Math.min(1 - top, (Math.max(...ys) - Math.min(...ys)) / height)
    ),
  };
}

function adjustOf(
  clip: Native
): { enabled: boolean; strength: number } | undefined {
  const filter = object(clip.MCI_12, "MCI_12");
  const adjust = object(filter.FP_31, "FP_31");
  const enabled = adjust.AAP_5 === true;
  const strength = number(adjust.AAP_1, "AAP_1");
  return enabled || strength !== 0 ? { enabled, strength } : undefined;
}

/** Import this recovered draft's editable features from its decoded JSON text. */
export function importRecoveredInShotDraft(
  options: ImportRecoveredInShotOptions
): PostProject {
  const raw = object(JSON.parse(options.rawDraftText) as unknown, "draft");
  const assets = new Map(
    options.assetManifest.map((asset) => [asset.source, asset])
  );
  const unresolved = new Set<string>();
  unresolved.add(
    "AutoAdjust uses a recovered native model and LUTs; its inference and blend are not yet reproduced in Post Studio"
  );
  unresolved.add(
    "Letter-slide text animation uses a Post Studio approximation of InShot's glyph motion"
  );
  const nativeMain = configList(raw, "MediaClipConfig");
  const nativePip = configList(raw, "PipClipConfig");
  const nativeText = configList(raw, "TextConfig");
  if (
    nativeMain.length !== 3 ||
    nativePip.length !== 1 ||
    nativeText.length !== 4
  ) {
    throw new Error(
      "This importer expects the recovered three-clip, one-PIP, four-text draft"
    );
  }
  const scopedId = (id: string) => `inshot-${options.now}-${id}`;

  const takes: PostProject["takes"] = [];
  const images: NonNullable<PostProject["images"]> = [];
  const main: (PostVideoItem | PostImageItem)[] = [];
  for (let index = 0; index < nativeMain.length; index++) {
    const clip = object(nativeMain[index], `main clip ${index}`);
    const bindingId = `main-${index + 1}`;
    const id = scopedId(bindingId);
    const path = sourcePath(clip);
    requireAsset(path, assets);
    const binding = bindingFor(bindingId, options.bindings);
    const start = seconds(clip.MCI_56, "MCI_56");
    const duration = seconds(clip.MCI_8, "MCI_8");
    const crop = cropOf(clip);
    const sourceGeometry = geometry(clip.MCI_22, crop);
    const transition = object(clip.MCI_33, "MCI_33");
    const transitionDuration = seconds(transition.TI_1, "TI_1");
    const transitionType = number(transition.TI_2, "TI_2");
    if (transitionDuration > 0 && transitionType !== 1) {
      throw new Error(`Unsupported InShot transition type ${transitionType}`);
    }
    const common = {
      id,
      label: binding.label,
      start,
      duration,
      box: FULL,
      opacity: 1,
      fadeIn: 0,
      fadeOut: 0,
      anchor: null,
      fill: false,
      sourceGeometry,
      ...(transitionDuration > 0
        ? {
            transitionOut: {
              duration: transitionDuration,
              type: "crossfade" as const,
              sourceTypeCode: String(transitionType),
            },
          }
        : {}),
    };
    if (path.toLowerCase().endsWith(".png")) {
      if (binding.sourceOffsetSeconds !== 0) {
        throw new Error(
          `Prepared image binding for ${id} cannot have a source offset`
        );
      }
      images.push({ id, label: binding.label, ref: binding.ref });
      main.push({ ...common, kind: "image", imageId: id });
      continue;
    }
    const originalIn = seconds(clip.MCI_2, "MCI_2");
    const originalOut = seconds(clip.MCI_3, "MCI_3");
    const sourceIn = originalIn - binding.sourceOffsetSeconds;
    const sourceOut = originalOut - binding.sourceOffsetSeconds;
    if (sourceIn < -1e-6 || sourceOut > binding.durationSeconds + 1e-6) {
      throw new Error(
        `Prepared binding for ${id} does not cover its source span`
      );
    }
    const speed = playbackRate(clip.MCI_2, clip.MCI_3, clip.MCI_8);
    const rawKeys = list(clip.MCI_54, "MCI_54");
    const sourceGeometryKeys = rawKeys.map((entry, keyIndex) => {
      const key = object(entry, `MCI_54[${keyIndex}]`);
      const originalTimeUs = number(key.VKF_8, "VKF_8");
      const anchorUs = number(key.VKF_7, "VKF_7");
      if (number(key.VKF_6, "VKF_6") !== 1) {
        throw new Error(
          `InShot key ${keyIndex} has unsupported animated opacity`
        );
      }
      if (
        Math.abs(originalTimeUs - number(clip.MCI_2, "MCI_2") - anchorUs) > 2
      ) {
        throw new Error(
          `InShot key ${keyIndex} source time does not match its anchor`
        );
      }
      return {
        t: (originalTimeUs - binding.sourceOffsetSeconds * US) / US,
        value: keyGeometry(key, crop),
        easing: easing(number(key.VKF_9, "VKF_9"), unresolved),
      };
    });
    takes.push({
      id,
      label: binding.label,
      ref: binding.ref,
      takeKey: `inshot:${id}`,
      durationSeconds: binding.durationSeconds,
    });
    main.push({
      ...common,
      kind: "video",
      takeId: id,
      sourceIn: Math.max(0, sourceIn),
      sourceOut,
      speed,
      fit: "contain",
      zoom: 1,
      panX: 0,
      panY: 0,
      rotation: 0,
      flip: false,
      volume: number(clip.MCI_10, "MCI_10"),
      ...(adjustOf(clip) ? { autoAdjust: adjustOf(clip) } : {}),
      ...(sourceGeometryKeys.length > 0
        ? { keyframes: { sourceGeometry: sourceGeometryKeys } }
        : {}),
    });
  }

  const pipRecord = object(nativePip[0], "PipClipConfig[0]");
  const pipClip = object(pipRecord.PCI_0, "PCI_0");
  const pipPath = sourcePath(pipClip);
  requireAsset(pipPath, assets);
  const pipBinding = bindingFor("pip-1", options.bindings);
  const pipIn =
    seconds(pipClip.MCI_2, "pip MCI_2") - pipBinding.sourceOffsetSeconds;
  const pipOut =
    seconds(pipClip.MCI_3, "pip MCI_3") - pipBinding.sourceOffsetSeconds;
  const pipDuration = seconds(pipClip.MCI_8, "pip MCI_8");
  if (pipIn < -1e-6 || pipOut > pipBinding.durationSeconds + 1e-6) {
    throw new Error(
      "Prepared binding for pip-1 does not cover its source span"
    );
  }
  takes.push({
    id: scopedId("pip-1"),
    label: pipBinding.label,
    ref: pipBinding.ref,
    takeKey: scopedId("pip-1"),
    durationSeconds: pipBinding.durationSeconds,
  });
  const pip: PostVideoItem = {
    id: scopedId("pip-1"),
    kind: "video",
    label: pipBinding.label,
    start: seconds(pipClip.MCI_56, "pip MCI_56"),
    duration: pipDuration,
    box: FULL,
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    takeId: scopedId("pip-1"),
    sourceIn: Math.max(0, pipIn),
    sourceOut: pipOut,
    speed: playbackRate(pipClip.MCI_2, pipClip.MCI_3, pipClip.MCI_8),
    fit: "contain",
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    flip: false,
    volume: number(pipClip.MCI_10, "pip MCI_10"),
    sourceGeometry: geometry(pipRecord.BOI_2, cropOf(pipClip)),
  };

  const texts: PostTextItem[] = nativeText.map((entry, index) => {
    const native = object(entry, `TextConfig[${index}]`);
    const style = object(object(native.TI_15, "TI_15"), "TI_15");
    const animation = object(native.BOI_9, "BOI_9");
    if (
      number(animation.AP_7, "AP_7") !== 26 ||
      number(animation.AP_8, "AP_8") !== 26
    ) {
      throw new Error(`Unsupported InShot text animation on text ${index + 1}`);
    }
    const canvasWidth = number(native.BI_5, "BI_5");
    const canvasHeight = number(native.BI_6, "BI_6");
    const alignmentCode = number(style.TAS_4, "TAS_4");
    if (alignmentCode !== 2)
      throw new Error(`Unsupported InShot alignment ${alignmentCode}`);
    const duration = seconds(native.BCI_5, "BCI_5");
    const animationDuration = seconds(animation.AP_3, "AP_3");
    return {
      id: scopedId(`text-${index + 1}`),
      kind: "text",
      start: seconds(native.BCI_3, "BCI_3"),
      duration,
      box: nativeBox(native.BI_13, canvasWidth, canvasHeight),
      opacity: 1,
      fadeIn: 0,
      fadeOut: 0,
      anchor: null,
      fill: false,
      text: string(native.TI_1, "TI_1"),
      size: "m",
      style: {
        fontFamily: string(style.TAS_7, "TAS_7"),
        fontSizeNative: number(style.TAS_1, "TAS_1"),
        fontScale: number(native.BI_3, "BI_3"),
        sourceCanvasWidth: canvasWidth,
        letterSpacing: number(style.TAS_2, "TAS_2"),
        lineSpacing: number(style.TAS_3, "TAS_3"),
        alignment: "center",
        alpha: number(style.TAS_0, "TAS_0") / 255,
      },
      animation: {
        kind: "letter-slide",
        inDurationSeconds: animationDuration,
        outDurationSeconds: animationDuration,
        entranceProgress: number(animation.AP_15, "AP_15"),
        exitProgress: number(animation.AP_16, "AP_16"),
      },
    };
  });

  // The separate ORIGINAL effect clip covers the second main clip.
  const effects = configList(raw, "EffectClipConfig");
  if (
    effects.length !== 1 ||
    object(effects[0], "effect").ECI_0 !== "ORIGINAL"
  ) {
    unresolved.add("EffectClipConfig semantics");
  } else {
    const effect = object(effects[0], "effect");
    const effectStart = seconds(effect.BCI_3, "effect BCI_3");
    const effectEnd = effectStart + seconds(effect.BCI_5, "effect BCI_5");
    const filter = object(effect.ECI_2, "ECI_2");
    const adjust = object(filter.FP_31, "effect FP_31");
    if (adjust.AAP_5 === true) {
      const second = main[1];
      if (second?.kind === "video")
        second.autoAdjust = {
          enabled: true,
          strength: number(adjust.AAP_1, "effect AAP_1"),
          startSeconds: effectStart,
          endSeconds: effectEnd,
        };
    }
  }
  if (
    main[1]?.kind === "video" &&
    main[1].keyframes?.sourceGeometry?.length !== 17
  ) {
    throw new Error(
      "Recovered camera clip must retain all 17 geometry keyframes"
    );
  }
  return PostProjectSchema.parse({
    schemaVersion: 2,
    sequenceId: options.sequenceId,
    takes,
    images,
    tracks: [
      { id: scopedId("main"), hidden: false, locked: false, items: main },
      { id: scopedId("pip"), hidden: false, locked: false, items: [pip] },
      { id: scopedId("texts"), hidden: false, locked: false, items: texts },
    ],
    audio: "takes",
    canvas: "9:16",
    background: "dark",
    updatedAt: options.now,
    importSource: {
      format: "inshot-recovery",
      rawDraftText: options.rawDraftText,
      unresolved: [...unresolved],
    },
  });
}
