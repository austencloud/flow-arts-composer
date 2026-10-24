import {
  AdditiveBlending,
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  Euler,
  LinearFilter,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  RGBAFormat,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
} from "three";

/** Lighttoys' published layout: two independently controlled 39-emitter zones. */
export const MOON_FAN_ZONE_LED_COUNT = 39;
export const MOON_FAN_LED_COUNT = MOON_FAN_ZONE_LED_COUNT * 2;

/**
 * Samples the middle of each physical 39-emitter zone instead of its seam.
 * This keeps animated strip patterns legible as the two colors that the real
 * A/B controller can show through the fabric.
 */
export function moonFanZoneSampleIndices(
  ledCount = MOON_FAN_LED_COUNT
): readonly [number, number] {
  const count = Math.max(2, Math.round(ledCount));
  return [Math.floor(count * 0.25), Math.floor(count * 0.75)];
}

export interface MoonFanDiffuserColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface MoonFanDiffuserPose {
  readonly worldPosition: { x: number; y: number; z: number };
  readonly worldRotation: { x: number; y: number; z: number; w: number };
}

export interface MoonFanDiffuserFrame {
  readonly propState?: MoonFanDiffuserPose;
  readonly bodyToEffects?: Matrix4;
  readonly rigLocalCenter: { x: number; y: number; z: number };
  readonly ledColors: readonly MoonFanDiffuserColor[];
  readonly brightness: number;
  readonly scale?: number;
}

const WIDTH_M = 0.6;
const RADIUS_X_M = WIDTH_M / 2;
const ARC_CENTER_Y_M = 0.03;
const RADIUS_Y_M = 0.288;
const NOTCH_RADIUS_M = 0.058;
// The GLB shell, perimeter tubing and fabric relief occupy roughly 10 mm in
// depth. Place the optical faces just outside that envelope so their depth
// tests remain honest without z-fighting against the physical skin.
const SURFACE_OFFSET_M = 0.012;
const HORIZONTAL_QUATERNION = new Quaternion().setFromEuler(
  new Euler(0, 0, Math.PI / 2)
);

/** The same measured outline authored into `fan.glb`. */
export function createMoonFanDiffuserGeometry(): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(-RADIUS_X_M, ARC_CENTER_Y_M);

  const notchSegments = 16;
  for (let index = 0; index <= notchSegments; index++) {
    const angle = ((145 - (110 * index) / notchSegments) * Math.PI) / 180;
    shape.lineTo(
      NOTCH_RADIUS_M * Math.cos(angle),
      NOTCH_RADIUS_M * Math.sin(angle)
    );
  }

  shape.lineTo(RADIUS_X_M, ARC_CENTER_Y_M);
  const arcSegments = 48;
  for (let index = 1; index <= arcSegments; index++) {
    const angle = (Math.PI * index) / arcSegments;
    shape.lineTo(
      RADIUS_X_M * Math.cos(angle),
      ARC_CENTER_Y_M + RADIUS_Y_M * Math.sin(angle)
    );
  }
  shape.closePath();

  const geometry = new ShapeGeometry(shape);
  geometry.name = "MoonFanDiffuserSurface";
  return geometry;
}

function createMoonFanStripTexture(pixels: Uint8Array): DataTexture {
  const texture = new DataTexture(
    pixels,
    MOON_FAN_LED_COUNT,
    1,
    RGBAFormat,
    UnsignedByteType
  );
  texture.name = "MoonFanLedStrip";
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createMoonFanDiffuserMaterial(
  stripTexture: DataTexture
): ShaderMaterial {
  const material = new ShaderMaterial({
    name: "MoonFanDiffuserMaterial",
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uLedStrip: { value: stripTexture },
      uBrightness: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vLocal;

      void main() {
        vLocal = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uLedStrip;
      uniform float uBrightness;
      varying vec2 vLocal;

      const float PI = 3.141592653589793;
      const float LEDS_PER_ZONE = ${MOON_FAN_ZONE_LED_COUNT.toFixed(1)};
      const float LED_COUNT = ${MOON_FAN_LED_COUNT.toFixed(1)};

      float sdSegment(vec2 point, vec2 start, vec2 end) {
        vec2 offset = point - start;
        vec2 segment = end - start;
        float along = clamp(dot(offset, segment) / dot(segment, segment), 0.0, 1.0);
        return length(offset - segment * along);
      }

      float gaussian(float value, float sigma) {
        return exp(-(value * value) / (2.0 * sigma * sigma));
      }

      void main() {
        vec2 ellipsePoint = vec2(
          vLocal.x / 0.300,
          (vLocal.y - 0.030) / 0.288
        );
        float radial = length(ellipsePoint);
        float edgeTransmission = smoothstep(0.70, 0.985, radial);

        // The 78 real emitters sit along the outer crescent: 39 on either
        // side. Their cores stay legible at rest while their broad halos merge
        // into the luminous field a diffusion skin produces in photographs.
        float arcAngle = atan(
          max(0.0, ellipsePoint.y),
          max(0.0001, abs(ellipsePoint.x))
        );
        float diodeCoordinate =
          arcAngle / (0.5 * PI) * (LEDS_PER_ZONE - 1.0);
        // The strip runs continuously from the left endpoint to the crown and
        // back down to the right endpoint. Sampling the full texture preserves
        // uploaded images and multi-color generator patterns instead of
        // flattening a 78-pixel instrument into two solid halves.
        float stripIndex = vLocal.x < 0.0
          ? diodeCoordinate
          : LED_COUNT - 1.0 - diodeCoordinate;
        vec3 ledColor = texture2D(
          uLedStrip,
          vec2((stripIndex + 0.5) / LED_COUNT, 0.5)
        ).rgb;
        float diodePhase = abs(fract(diodeCoordinate + 0.5) - 0.5);
        float diodeRadial = abs(radial - 0.91);
        float diodeCore =
          gaussian(diodeRadial, 0.009) * gaussian(diodePhase, 0.12);
        float diodeHalo =
          gaussian(diodeRadial, 0.038) * gaussian(diodePhase, 0.31);

        // The lower hem is lit by spill from the end emitters and controller
        // cavity, rather than a second invented strip.
        float lowerTransmission =
          gaussian(vLocal.y - 0.044, 0.028) *
          smoothstep(0.055, 0.145, abs(vLocal.x));

        // Frame members below the stretched skin interrupt the transmitted
        // light. These pressure lines are what make the surface read as cloth
        // pulled over a fan instead of a flat acrylic semicircle.
        vec2 grip = vec2(0.0, 0.050);
        float ribDistance = sdSegment(vLocal, grip, vec2(0.0, 0.308));
        ribDistance = min(
          ribDistance,
          sdSegment(vLocal, grip, vec2(-0.166, 0.265))
        );
        ribDistance = min(
          ribDistance,
          sdSegment(vLocal, grip, vec2(0.166, 0.265))
        );
        ribDistance = min(
          ribDistance,
          sdSegment(vLocal, grip, vec2(-0.265, 0.140))
        );
        ribDistance = min(
          ribDistance,
          sdSegment(vLocal, grip, vec2(0.265, 0.140))
        );
        float ribPressure = gaussian(ribDistance, 0.0038);
        float ribBloom = gaussian(ribDistance - 0.0055, 0.0035);

        // Softer secondary folds radiate from the grip between the ribs. They
        // fade toward the rim as the perimeter seam takes over the tension.
        float creaseDistance = sdSegment(vLocal, grip, vec2(-0.230, 0.205));
        creaseDistance = min(
          creaseDistance,
          sdSegment(vLocal, grip, vec2(-0.088, 0.300))
        );
        creaseDistance = min(
          creaseDistance,
          sdSegment(vLocal, grip, vec2(0.088, 0.300))
        );
        creaseDistance = min(
          creaseDistance,
          sdSegment(vLocal, grip, vec2(0.230, 0.205))
        );
        float crease = gaussian(creaseDistance, 0.0024) * (1.0 - radial * 0.62);

        float centerSeam = gaussian(vLocal.x, 0.0045);
        float gripOcclusion = smoothstep(0.058, 0.142, length(vLocal - grip));

        // Crossed, sub-pixel-stable fibres break the perfectly smooth shader
        // field. The low amplitude preserves the diffuser instead of turning
        // it into a visible checker texture.
        float warp = sin((vLocal.x + vLocal.y * 0.09) * 1760.0);
        float weft = sin((vLocal.y - vLocal.x * 0.07) * 1420.0);
        float weave = 1.0 + warp * weft * 0.018;

        float field =
          0.13 +
          0.38 * edgeTransmission +
          0.92 * diodeCore +
          0.44 * diodeHalo +
          0.14 * lowerTransmission +
          0.035 * ribBloom;
        field *= 1.0 - 0.24 * ribPressure;
        field *= 1.0 - 0.09 * crease;
        field *= 1.0 - 0.16 * centerSeam;
        field *= mix(0.42, 1.0, gripOcclusion);
        field *= weave;

        // The GLB supplies the white physical skin. This additive pass supplies
        // only light transmitted through it, including the slight cool lift a
        // camera sees between saturated emitters.
        vec3 fabricScatter = vec3(0.035, 0.045, 0.060) * field;
        vec3 emission = ledColor * field * uBrightness * 2.45;
        float alpha = clamp((0.12 + field * 0.58) * uBrightness, 0.0, 0.94);
        gl_FragColor = vec4(fabricScatter + emission, alpha);
      }
    `,
  });
  material.extensions = { clipCullDistance: false, multiDraw: false };
  return material;
}

/**
 * One live fabric light field per fan. The physical GLB owns the frame and
 * white skin; this renderer owns only the light transmitted through that skin.
 */
export class MoonFanDiffuserRenderer3D {
  private meshes:
    | readonly [
        Mesh<ShapeGeometry, ShaderMaterial>,
        Mesh<ShapeGeometry, ShaderMaterial>,
      ]
    | null = null;
  private parent: Object3D | null = null;
  private stripTexture: DataTexture | null = null;
  private stripPixels: Uint8Array | null = null;
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly surfaceOffset = new Vector3();

  initialize(parent: Object3D): void {
    if (this.meshes) return;
    this.parent = parent;
    this.stripPixels = new Uint8Array(MOON_FAN_LED_COUNT * 4);
    this.stripPixels.fill(255);
    this.stripTexture = createMoonFanStripTexture(this.stripPixels);
    const geometry = createMoonFanDiffuserGeometry();
    const material = createMoonFanDiffuserMaterial(this.stripTexture);
    const front = new Mesh(geometry, material);
    const back = new Mesh(geometry, material);
    front.name = "MoonFanLiveDiffuserFront";
    back.name = "MoonFanLiveDiffuserBack";
    for (const mesh of [front, back]) {
      mesh.frustumCulled = false;
      mesh.renderOrder = 99;
      mesh.visible = false;
      parent.add(mesh);
    }
    this.meshes = [front, back];
  }

  update(frame: MoonFanDiffuserFrame): void {
    if (!this.meshes) return;
    const { propState, rigLocalCenter, ledColors } = frame;
    const [front, back] = this.meshes;
    if (frame.bodyToEffects) {
      for (const [index, mesh] of this.meshes.entries()) {
        mesh.matrixAutoUpdate = false;
        mesh.matrix
          .copy(frame.bodyToEffects)
          .scale(new Vector3().setScalar(frame.scale ?? 1))
          .multiply(
            new Matrix4().makeTranslation(
              0,
              0,
              index === 0 ? SURFACE_OFFSET_M : -SURFACE_OFFSET_M
            )
          );
        mesh.matrixWorldNeedsUpdate = true;
        mesh.visible = frame.brightness > 0;
      }
    } else if (propState) {
      this.position.set(rigLocalCenter.x, rigLocalCenter.y, rigLocalCenter.z);
      this.rotation
        .set(
          propState.worldRotation.x,
          propState.worldRotation.y,
          propState.worldRotation.z,
          propState.worldRotation.w
        )
        .multiply(HORIZONTAL_QUATERNION);

      // A real diffuser emits from both faces. Two depth-tested skins sit just
      // outside the GLB shell so the active face remains visible while the fan
      // still passes correctly behind hands, bodies and other scene geometry.
      this.surfaceOffset
        .set(0, 0, SURFACE_OFFSET_M)
        .applyQuaternion(this.rotation);
      front.position.copy(this.position).add(this.surfaceOffset);
      back.position.copy(this.position).sub(this.surfaceOffset);
      for (const mesh of this.meshes) {
        mesh.matrixAutoUpdate = true;
        mesh.quaternion.copy(this.rotation);
        mesh.scale.setScalar(frame.scale ?? 1);
        mesh.visible = frame.brightness > 0;
      }
    } else {
      this.reset();
      return;
    }
    if (this.stripPixels && this.stripTexture) {
      for (let index = 0; index < MOON_FAN_LED_COUNT; index++) {
        const color = ledColors[index];
        const offset = index * 4;
        this.stripPixels[offset] = Math.round(
          Math.max(0, Math.min(1, color?.r ?? 0)) * 255
        );
        this.stripPixels[offset + 1] = Math.round(
          Math.max(0, Math.min(1, color?.g ?? 0)) * 255
        );
        this.stripPixels[offset + 2] = Math.round(
          Math.max(0, Math.min(1, color?.b ?? 0)) * 255
        );
        this.stripPixels[offset + 3] = 255;
      }
      this.stripTexture.needsUpdate = true;
    }
    front.material.uniforms.uBrightness!.value = frame.brightness;
  }

  reset(): void {
    for (const mesh of this.meshes ?? []) mesh.visible = false;
  }

  dispose(): void {
    if (!this.meshes) return;
    const [front] = this.meshes;
    for (const mesh of this.meshes) this.parent?.remove(mesh);
    front.geometry.dispose();
    front.material.dispose();
    this.stripTexture?.dispose();
    this.meshes = null;
    this.stripTexture = null;
    this.stripPixels = null;
    this.parent = null;
  }
}
