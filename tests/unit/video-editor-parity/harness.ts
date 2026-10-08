import { createHash } from "node:crypto";
import { vi } from "vitest";
import type { PostStudioExportVideoFrames } from "$lib/shared/media-composition/services/post-studio-export-video-frames";

export const NL = String.fromCharCode(10);

export function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** JSON with every number rounded to 6 decimals, as describeArg rounds the draw log. */
export function roundedJson(value: unknown, space?: number): string {
  return JSON.stringify(
    value,
    (_key, entry: unknown) =>
      typeof entry === "number" ? round(entry) : entry,
    space
  );
}

export function describeArg(value: unknown): string {
  if (typeof value === "number") return String(round(value));
  // Floats inside strings (rgba alphas, font sizes) round like numbers do.
  if (typeof value === "string") {
    return JSON.stringify(
      value.replace(/-?\d+\.\d{7,}/g, (match) => String(round(Number(match))))
    );
  }
  if (value === null || value === undefined || typeof value === "boolean")
    return String(value);
  if (value instanceof HTMLCanvasElement) {
    return `canvas#${value.dataset.standin ?? `${value.width}x${value.height}`}`;
  }
  if (Array.isArray(value)) return `[${value.map(describeArg).join(",")}]`;
  if (typeof value === "object" && "__recording" in value) {
    return String((value as { __recording: string }).__recording);
  }
  if (typeof value === "object") {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      const record = value as Record<string, unknown>;
      const entries = Object.keys(record)
        .sort()
        .map((key) => `${key}:${describeArg(record[key])}`);
      return `{${entries.join(",")}}`;
    }
  }
  if (typeof value === "function") return "fn";
  return (value as object).constructor?.name ?? "object";
}

/** A captured node by its class list, or by its data attributes when it has no class. */
export function describeNode(node: Element): string {
  if (node.classList.length > 0) return `.${[...node.classList].join(".")}`;
  const data = [...node.attributes]
    .filter((attribute) => attribute.name.startsWith("data-"))
    .map(
      (attribute) => `[${attribute.name}=${JSON.stringify(attribute.value)}]`
    )
    .sort();
  return data.length > 0 ? data.join("") : node.tagName.toLowerCase();
}

/**
 * Capture options with sorted keys. includeStyleProperties is jsdom's computed
 * style list, so only its presence is logged.
 */
export function describeOptions(options: Record<string, unknown>): string {
  const entries = Object.keys(options)
    .sort()
    .map((key) => {
      const value = options[key];
      if (key === "includeStyleProperties" && Array.isArray(value)) {
        return `${key}:array`;
      }
      return `${key}:${describeArg(value)}`;
    });
  return `{${entries.join(",")}}`;
}

const DEFAULTS: Record<string, unknown> = {
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
  fillStyle: "#000000",
  strokeStyle: "#000000",
  lineWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  miterLimit: 10,
  lineDashOffset: 0,
  font: "10px sans-serif",
  textAlign: "start",
  textBaseline: "alphabetic",
  letterSpacing: "0px",
  filter: "none",
  imageSmoothingEnabled: true,
  imageSmoothingQuality: "low",
  shadowBlur: 0,
  shadowColor: "rgba(0, 0, 0, 0)",
  shadowOffsetX: 0,
  shadowOffsetY: 0,
};

/** A 2D context that records every call and property set, in order, into `log`. */
export function createRecordingContext(
  log: string[],
  canvas: HTMLCanvasElement,
  name: string
): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { ...DEFAULTS, canvas };
  const stack: Record<string, unknown>[] = [];
  let made = 0;
  const call =
    (key: string) =>
    (...args: unknown[]) => {
      log.push(`${name}.${key}(${args.map(describeArg).join(",")})`);
      return undefined;
    };
  return new Proxy({} as Record<string, unknown>, {
    get(_target, key) {
      if (typeof key === "symbol" || key === "then" || key === "toJSON")
        return undefined;
      if (Object.hasOwn(state, key)) return state[key];
      switch (key) {
        case "save":
          return () => {
            log.push(`${name}.save()`);
            stack.push({ ...state });
          };
        case "restore":
          return () => {
            log.push(`${name}.restore()`);
            const saved = stack.pop();
            if (saved) Object.assign(state, saved);
          };
        case "measureText":
          return (text: string) => {
            const size = Number(
              /([0-9.]+)px/.exec(String(state.font))?.[1] ?? 10
            );
            const width = text.length * size * 0.5;
            log.push(`${name}.measureText(${describeArg(text)})`);
            return {
              width,
              actualBoundingBoxLeft: 0,
              actualBoundingBoxRight: width,
              actualBoundingBoxAscent: size * 0.8,
              actualBoundingBoxDescent: size * 0.2,
              fontBoundingBoxAscent: size * 0.8,
              fontBoundingBoxDescent: size * 0.2,
            };
          };
        case "createLinearGradient":
        case "createRadialGradient":
        case "createConicGradient":
        case "createPattern":
          return (...args: unknown[]) => {
            made += 1;
            const id = `${name}.${key}#${made}`;
            log.push(`${id}(${args.map(describeArg).join(",")})`);
            return {
              __recording: id,
              addColorStop: (offset: number, color: string) =>
                log.push(
                  `${id}.addColorStop(${describeArg(offset)},${describeArg(color)})`
                ),
              setTransform: call(`${key}#${made}.setTransform`),
            };
          };
        case "getTransform":
          return () => {
            log.push(`${name}.getTransform()`);
            return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
          };
        case "getImageData":
          return (x: number, y: number, width: number, height: number) => {
            log.push(
              `${name}.getImageData(${[x, y, width, height].map(describeArg).join(",")})`
            );
            return {
              data: new Uint8ClampedArray(Math.max(0, width * height * 4)),
              width,
              height,
            };
          };
        default:
          return call(key);
      }
    },
    // Mirrors get: every state property and every method get serves is present.
    has(_target, key) {
      return typeof key === "string" && key !== "then" && key !== "toJSON";
    },
    set(_target, key, value) {
      if (typeof key === "symbol") return true;
      state[key] = value;
      log.push(`${name}.${key}=${describeArg(value)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/**
 * tests/setup/vitest-setup.ts replaces document.createElement with a vi.fn that
 * returns plain objects (no dataset, append or querySelector, and canvases that
 * are not HTMLCanvasElement), and jsdom 27 has no CSS global, which
 * layerElementForClip needs for CSS.escape. Plain assignments, not spies, so
 * vi.restoreAllMocks() does not undo them between renders.
 */
export function useRealDom(): void {
  document.createElement = Document.prototype.createElement.bind(
    document
  ) as typeof document.createElement;
  if (typeof globalThis.CSS === "undefined") {
    (globalThis as { CSS?: unknown }).CSS = {
      escape: (value: string) => JSON.stringify(value).slice(1, -1),
    };
  }
}

/**
 * Routes every canvas's 2D context to a recording context, named c1, c2, ... in
 * creation order. Every getContext call is logged with its arguments.
 */
export function installRecordingCanvas(log: string[]): () => void {
  useRealDom();
  const contexts = new WeakMap<
    HTMLCanvasElement,
    { name: string; context: CanvasRenderingContext2D }
  >();
  let count = 0;
  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(function (this: HTMLCanvasElement, ...args: unknown[]) {
      let entry = contexts.get(this);
      if (!entry) {
        count += 1;
        const name = `c${count}`;
        entry = { name, context: createRecordingContext(log, this, name) };
        contexts.set(this, entry);
      }
      log.push(`${entry.name}.getContext(${args.map(describeArg).join(",")})`);
      return entry.context as never;
    });
  return () => spy.mockRestore();
}

export function standIn(
  tag: string,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.dataset.standin = tag;
  return canvas;
}

/** Stand-in for PostStudioExportVideoFrames: fixed-size canvases, every request logged. */
export function createVideoFrameStandIns(
  log: string[],
  roles: ReadonlySet<string>
) {
  return {
    has: (role: string) => roles.has(role),
    frameFor: async (role: string, timeSeconds: number) => {
      log.push(`frameFor(${describeArg(role)},${describeArg(timeSeconds)})`);
      const image = role.startsWith("image");
      return standIn(
        `${role}@${timeSeconds.toFixed(3)}`,
        image ? 1200 : 1080,
        image ? 900 : 1920
      );
    },
    dispose: () => undefined,
  } satisfies Pick<PostStudioExportVideoFrames, "has" | "frameFor" | "dispose">;
}

/** Where the modern-screenshot mock logs; reset for every render. */
export interface CaptureSink {
  log: string[];
  contexts: number;
}

interface ScreenshotContextStandIn {
  __recording: string;
  node: Element;
  width: number;
  height: number;
  scale: number;
}

type CaptureOptions = Record<string, unknown> & {
  width?: number;
  height?: number;
  scale?: number;
};

/**
 * The modern-screenshot module as the render path uses it: createContext,
 * domToCanvas (on a node or a context) and destroyContext, each logged with
 * its arguments. A capture is a canvas of the requested size times its scale.
 */
export function createScreenshotMock(sink: CaptureSink) {
  const canvasFor = (width = 0, height = 0, scale = 1) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.dataset.standin = "dom-capture";
    return canvas;
  };
  return {
    createContext: async (
      node: Element,
      options: CaptureOptions = {}
    ): Promise<ScreenshotContextStandIn> => {
      sink.contexts += 1;
      const id = `screenshot-context#${sink.contexts}`;
      sink.log.push(
        `createContext(${describeNode(node)},${describeOptions(options)})`
      );
      return {
        __recording: id,
        node,
        width: options.width ?? 0,
        height: options.height ?? 0,
        scale: options.scale ?? 1,
      };
    },
    destroyContext: (context: ScreenshotContextStandIn) => {
      sink.log.push(`destroyContext(${context.__recording})`);
    },
    domToCanvas: async (
      target: Element | ScreenshotContextStandIn,
      options: CaptureOptions = {}
    ): Promise<HTMLCanvasElement> => {
      if (!(target instanceof Element)) {
        sink.log.push(`domToCanvas(${target.__recording})`);
        return canvasFor(target.width, target.height, target.scale);
      }
      sink.log.push(
        `domToCanvas(${describeNode(target)},${describeOptions(options)})`
      );
      return canvasFor(options.width, options.height, options.scale);
    },
  };
}

/**
 * One .media-layer element per layer, with the render mode the harness assigns.
 * Every element inside a layer measures `boundsFor(layer)`.
 */
export function buildLayerRoot<
  Layer extends { clipId: string; sourceRole: string },
>(
  layers: readonly Layer[],
  renderModeFor: (role: string) => string,
  boundsFor: (layer: Layer) => { width: number; height: number }
): HTMLElement {
  const root = document.createElement("div");
  const bounds = new Map<Element, { width: number; height: number }>();
  for (const layer of layers) {
    const element = document.createElement("div");
    element.className = "media-layer";
    element.dataset.clipId = layer.clipId;
    element.dataset.renderMode = renderModeFor(layer.sourceRole);
    if (element.dataset.renderMode === "choreo-card") {
      const card = document.createElement("div");
      card.className = "choreo-layer";
      element.append(card);
    }
    if (element.dataset.renderMode === "sequence-animation") {
      // The compositor queries [data-sequence-progress-visible] and throws without it.
      const surface = document.createElement("div");
      surface.dataset.sequenceProgressVisible = "true";
      element.append(surface);
    }
    bounds.set(element, boundsFor(layer));
    root.append(element);
  }
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const layer = this.closest(".media-layer");
      const size = (layer && bounds.get(layer)) ?? { width: 0, height: 0 };
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: size.width,
        height: size.height,
        right: size.width,
        bottom: size.height,
        toJSON: () => ({}),
      } as DOMRect;
    }
  );
  return root;
}
