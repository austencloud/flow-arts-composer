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

/** One restrained correction for the whole clip. Dark stage pixels and bright LEDs
 * cannot each make a moving auto exposure chase the other from frame to frame. */
export function analyzeVideoColor(
  frames: readonly ImageData[]
): PostVideoColorGrade {
  const histogram = new Uint32Array(256);
  const peakHistogram = new Uint32Array(256);
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
      const peak = Math.max(r, g, b);
      peakHistogram[peak] = (peakHistogram[peak] ?? 0) + 1;
      count += 1;
      if (y >= 16 && y <= 220) {
        chroma += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        chromaCount += 1;
      }
    }
  }
  if (count < 64) return { ...IDENTITY };
  const median = percentile(histogram, count, 0.5);
  const shadow = percentile(histogram, count, 0.1);
  const highlight = percentile(peakHistogram, count, 0.99);
  // CSS contrast below one adds a positive offset even to pure black. A dark
  // stage with bright LEDs is intentional, so never use its median to lift the
  // background or compress its highlights into gray.
  const darkStage = median < 0.24 && shadow < 0.2;
  const brightness =
    !darkStage && median > 0.65
      ? Math.round(Math.max(0.9, 1 - (median - 0.65) * 0.25) * 100) / 100
      : 1;
  // Improve a washed-out range only when its shadows are already raised and
  // there is room below the top end. Keep the 99th-percentile channel under
  // 0.98 so skin and colored lights do not clip just to deepen the shadows.
  const peakAfterBrightness = brightness * highlight;
  const safeContrast =
    peakAfterBrightness > 0.5 ? 0.48 / (peakAfterBrightness - 0.5) : 1.12;
  const contrast =
    !darkStage && shadow > 0.14 && highlight - shadow > 0.2
      ? Math.round(
          Math.max(1, Math.min(1.12, 1 + (shadow - 0.14) * 0.7, safeContrast)) *
            100
        ) / 100
      : 1;
  const averageChroma = chromaCount ? chroma / chromaCount : 0;
  const saturation =
    !darkStage && averageChroma > 0.03 && averageChroma < 0.12 ? 1.04 : 1;
  return { brightness, contrast, saturation };
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
