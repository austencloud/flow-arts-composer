export interface PostVideoColorGrade {
  brightness: number;
  contrast: number;
  saturation: number;
  /** Older saved clips have no hue value; zero keeps their original hues. */
  hue?: number;
}

const IDENTITY: PostVideoColorGrade = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
};

export function videoColorFilter(grade?: PostVideoColorGrade | null): string {
  if (!grade) return "none";
  const hue = grade.hue ?? 0;
  if (
    grade.brightness === 1 &&
    grade.contrast === 1 &&
    grade.saturation === 1 &&
    hue === 0
  )
    return "none";
  return `brightness(${grade.brightness}) contrast(${grade.contrast}) saturate(${grade.saturation}) hue-rotate(${hue}deg)`;
}

function percentile(
  histogram: Uint32Array,
  count: number,
  fraction: number
): number {
  let seen = 0;
  const target = count * fraction;
  for (let index = 0; index < histogram.length; index += 1) {
    seen += histogram[index] ?? 0;
    if (seen >= target) return index / 255;
  }
  return 1;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** Where the clip's median luma should land: dark footage lifts up to 12%,
 * ordinary footage 5%, and overexposed footage comes down. */
function targetMedian(median: number): number {
  if (median > 0.6) return 0.63 + (median - 0.6) * 0.55;
  const lift = 1.12 - clamp((median - 0.15) / 0.1, 0, 1) * 0.07;
  return median * lift;
}

/** One grade for the whole clip, measured on a few frames so it never pumps.
 *
 * Tuned against InShot's Auto Adjust on Austen's footage: sink a lifted black
 * floor to black, keep the midtones where they were (slightly brighter), and
 * give dull colour a little more life. Brightness then contrast is a straight
 * line through two anchors: the black point goes to black and the median goes
 * to its target. Guards keep the median from ever getting darker on dim
 * footage and keep highlight clipping to a sliver. */
export function analyzeVideoColor(
  frames: readonly ImageData[]
): PostVideoColorGrade {
  const histogram = new Uint32Array(256);
  let count = 0;
  let chroma = 0;
  let chromaCount = 0;
  for (const frame of frames) {
    const pixels = frame.data;
    for (let i = 0; i < pixels.length; i += 16) {
      if ((pixels[i + 3] ?? 0) < 128) continue;
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      histogram[y] = (histogram[y] ?? 0) + 1;
      count += 1;
      if (y >= 16 && y <= 230) {
        chroma += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        chromaCount += 1;
      }
    }
  }
  if (count < 64) return { ...IDENTITY };
  const median = percentile(histogram, count, 0.5);
  // About half of the darkest 0.5% goes to black, never more than 0.08 and
  // never close enough to the median to flatten a dim scene.
  const black = Math.min(
    0.08,
    0.55 * percentile(histogram, count, 0.005),
    0.35 * median
  );
  const target = targetMedian(median);
  let brightness = target / Math.max(median, 1 / 255);
  let contrast = 1;
  if (black >= 0.005) {
    contrast = 1 + (2 * target * black) / (median - black);
    brightness = (0.5 * (1 - 1 / contrast)) / black;
  }
  brightness = clamp(brightness, 0.9, 1.2);
  contrast = clamp(contrast, 1, 1.3);
  // After clamping, keep the black point at or above black...
  if (2 * brightness * black < 1)
    contrast = Math.min(contrast, 1 / (1 - 2 * brightness * black));
  // ...and a dim median from getting darker than it started.
  if (median * brightness < 0.5 && target >= median)
    contrast = Math.min(contrast, (0.5 - median) / (0.5 - median * brightness));
  contrast = Math.max(1, contrast);
  // Shrink the whole move until at most 1.5% of the sampled luma clips, judged
  // on the rounded values the sliders will hold. Fine detail such as sky
  // between leaves averages out in the small sample and can clip a little more.
  const highlight = percentile(histogram, count, 0.985);
  const clips = () =>
    (highlight * round2(brightness) - 0.5) * round2(contrast) + 0.5 > 1;
  for (let step = 0; step < 40 && clips(); step += 1) {
    if (brightness > 1) brightness = 1 + (brightness - 1) * 0.9;
    contrast = 1 + (contrast - 1) * 0.9;
  }
  // Vibrance: dull colour gains up to 15%, already vivid colour stays put.
  const averageChroma = chromaCount ? chroma / chromaCount : 0;
  const saturation = clamp(1 + (0.26 - averageChroma) * 0.9, 1, 1.15);
  return {
    brightness: round2(brightness),
    contrast: round2(contrast),
    saturation: round2(saturation),
  };
}

/** Analyze a few small frames from the source span, without seeking the live preview. */
export async function autoGradeVideo(
  url: string,
  sourceIn: number,
  sourceOut: number
): Promise<PostVideoColorGrade> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  const wait = (event: string) =>
    new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Video analysis timed out"));
      }, 8000);
      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener(event, done);
        video.removeEventListener("error", failed);
      };
      const done = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error("Could not read video frames"));
      };
      video.addEventListener(event, done, { once: true });
      video.addEventListener("error", failed, { once: true });
    });
  try {
    if (video.readyState < HTMLMediaElement.HAVE_METADATA)
      await wait("loadedmetadata");
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not sample video frames");
    const frames: ImageData[] = [];
    for (const fraction of [0.15, 0.5, 0.85]) {
      const at = Math.min(
        video.duration - 0.05,
        sourceIn + (sourceOut - sourceIn) * fraction
      );
      const seeking = wait("seeked");
      video.currentTime = Math.max(0, at);
      await seeking;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(context.getImageData(0, 0, canvas.width, canvas.height));
    }
    return analyzeVideoColor(frames);
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
