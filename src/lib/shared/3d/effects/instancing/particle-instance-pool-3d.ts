import {
  AdditiveBlending,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  NormalBlending,
  Object3D,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Blending,
  type BufferGeometry,
  type Texture,
} from "three";

export interface ParticleSurfaceLightingOptions {
  /** How strongly scene lights tint and shade the particle surface. */
  strength?: number;
  /** Minimum retained light so thin sprites remain legible in dark scenes. */
  floor?: number;
}

export interface ParticleContrastAdaptationOptions {
  /** Approximate linear-space luminance behind the effect. */
  backdropLuminance: number;
  /** Lowest surface luminance retained against a dark background. */
  minimumSurfaceLuminance: number;
  /** Highest surface luminance retained against a bright background. */
  maximumSurfaceLuminance: number;
  /** Overall correction strength. */
  strength: number;
  /** Extra separation limited to the texture's soft silhouette edge. */
  edgeStrength: number;
}

export interface ParticleInstancePoolOptions {
  capacity: number;
  geometry: BufferGeometry;
  billboard?: boolean;
  texture?: Texture | null;
  wireframe?: boolean;
  additive?: boolean;
  renderOrder?: number;
  /** View-space distance where near-camera particles begin appearing. */
  nearFadeStart?: number;
  /** View-space distance where near-camera particles reach full opacity. */
  nearFadeEnd?: number;
  /** View-space distance where atmospheric depth fading begins. */
  farFadeStart?: number;
  /** View-space distance where atmospheric depth fading reaches its limit. */
  farFadeEnd?: number;
  /** Opacity retained once a particle reaches the far-depth limit. */
  farFadeOpacity?: number;
  /** How much distant texture edges soften into their environment. */
  farSoftness?: number;
  /** Opts this pool into the scene's fog uniforms. */
  fog?: boolean;
  /** Applies the renderer's tone mapping and output color space. */
  colorManaged?: boolean;
  /** Opts this pool into two-sided ambient and direct scene lighting. */
  surfaceLighting?: ParticleSurfaceLightingOptions;
  /** Gives a curved thin surface distinct front and transmitted back lighting. */
  thinSurfaceLighting?: boolean;
  /** Preserves silhouette separation as the scene behind it changes. */
  contrastAdaptation?: ParticleContrastAdaptationOptions;
}

export interface ParticleInstanceWrite {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  quaternionX?: number;
  quaternionY?: number;
  quaternionZ?: number;
  quaternionW?: number;
  right: number;
  green: number;
  left: number;
  alpha: number;
  uvX?: number;
  uvY?: number;
  uvWidth?: number;
  uvHeight?: number;
}

const orientedVertexShader = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec3 aScale;
  attribute vec4 aQuaternion;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute vec4 aUvRect;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vViewDepth;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  #ifdef USE_PARTICLE_THIN_SURFACE
    varying vec2 vSurfaceUv;
  #endif

  #include <fog_pars_vertex>

  vec3 rotateByQuaternion(vec3 value, vec4 quaternion) {
    vec3 offset = 2.0 * cross(quaternion.xyz, value);
    return value + quaternion.w * offset + cross(quaternion.xyz, offset);
  }

  void main() {
    vUv = aUvRect.xy + uv * aUvRect.zw;
    vColor = aColor;
    vAlpha = aAlpha;
    #ifdef USE_PARTICLE_THIN_SURFACE
      vSurfaceUv = uv;
    #endif

    vec3 local = rotateByQuaternion(position * aScale, aQuaternion);
    vec3 localNormal = rotateByQuaternion(normal, aQuaternion);
    vec4 mvPosition = modelViewMatrix * vec4(aCenter + local, 1.0);
    vViewDepth = -mvPosition.z;
    vViewPosition = -mvPosition.xyz;
    vViewNormal = normalize(normalMatrix * localNormal);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const billboardVertexShader = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec3 aScale;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute vec4 aUvRect;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vViewDepth;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  #ifdef USE_PARTICLE_THIN_SURFACE
    varying vec2 vSurfaceUv;
  #endif

  #include <fog_pars_vertex>

  void main() {
    vUv = aUvRect.xy + uv * aUvRect.zw;
    vColor = aColor;
    vAlpha = aAlpha;
    #ifdef USE_PARTICLE_THIN_SURFACE
      vSurfaceUv = uv;
    #endif

    vec4 mvPosition = modelViewMatrix * vec4(aCenter, 1.0);
    mvPosition.xy += position.xy * aScale.xy;
    vViewDepth = -mvPosition.z;
    vViewPosition = -mvPosition.xyz;
    vViewNormal = vec3(0.0, 0.0, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const particleLightingFragment = /* glsl */ `
  #ifdef USE_PARTICLE_SURFACE_LIGHTING
    #include <common>
    #include <lights_pars_begin>

    uniform float uLightingStrength;
    uniform float uLightingFloor;
    varying vec3 vViewNormal;
    varying vec3 vViewPosition;
    #ifdef USE_PARTICLE_THIN_SURFACE
      varying vec2 vSurfaceUv;
    #endif

    float particleDiffuseWeight(vec3 normal, vec3 lightDirection) {
      #ifdef USE_PARTICLE_THIN_SURFACE
        float facing = dot(normal, lightDirection);
        float across = abs(vSurfaceUv.x - 0.5 - 0.035 * (vSurfaceUv.y - 0.5));
        float thinEdge = smoothstep(0.06, 0.3, across);
        float thinTip = smoothstep(0.58, 0.82, vSurfaceUv.y);
        float transmission = 0.11 + 0.23 * thinEdge + 0.05 * thinTip;
        return 0.04 + 0.88 * max(facing, 0.0) +
          transmission * max(-facing, 0.0);
      #else
      // Petals and leaves transmit light through both faces. The wrapped floor
      // keeps edge-on particles readable while rotation still changes their tone.
      return 0.28 + 0.72 * abs(dot(normal, lightDirection));
      #endif
    }

    vec3 resolveParticleLighting() {
      vec3 particleNormal = normalize(vViewNormal);
      #ifdef USE_PARTICLE_THIN_SURFACE
        if (!gl_FrontFacing) particleNormal = -particleNormal;
      #endif
      vec3 irradiance = ambientLightColor;

      #if NUM_HEMI_LIGHTS > 0
        for (int index = 0; index < NUM_HEMI_LIGHTS; index++) {
          #ifdef USE_PARTICLE_THIN_SURFACE
            float skyWeight = 0.5 + 0.5 * dot(
              particleNormal, hemisphereLights[index].direction
            );
          #else
            float skyWeight = 0.28 + 0.72 * abs(
              dot(particleNormal, hemisphereLights[index].direction)
            );
          #endif
          irradiance += mix(
            hemisphereLights[index].groundColor,
            hemisphereLights[index].skyColor,
            skyWeight
          );
        }
      #endif

      #if NUM_DIR_LIGHTS > 0
        for (int index = 0; index < NUM_DIR_LIGHTS; index++) {
          irradiance += directionalLights[index].color * particleDiffuseWeight(
            particleNormal,
            directionalLights[index].direction
          );
        }
      #endif

      #if NUM_POINT_LIGHTS > 0
        for (int index = 0; index < NUM_POINT_LIGHTS; index++) {
          IncidentLight pointLight;
          getPointLightInfo(pointLights[index], -vViewPosition, pointLight);
          irradiance += pointLight.color * particleDiffuseWeight(
            particleNormal,
            pointLight.direction
          );
        }
      #endif

      #if NUM_SPOT_LIGHTS > 0
        for (int index = 0; index < NUM_SPOT_LIGHTS; index++) {
          IncidentLight spotLight;
          getSpotLightInfo(spotLights[index], -vViewPosition, spotLight);
          irradiance += spotLight.color * particleDiffuseWeight(
            particleNormal,
            spotLight.direction
          );
        }
      #endif

      #ifdef USE_PARTICLE_THIN_SURFACE
        // A small fill keeps petals visible in dark scenes without erasing
        // the light differences across the cup and central fold.
        irradiance += vec3(uLightingFloor * 0.5);
      #endif
      float peak = max(max(irradiance.r, irradiance.g), irradiance.b);
      if (peak > 1.35) irradiance *= 1.35 / peak;
      #ifdef USE_PARTICLE_THIN_SURFACE
        return mix(
          vec3(1.0), irradiance, min(1.0, uLightingStrength + 0.28)
        );
      #else
        irradiance = max(irradiance, vec3(uLightingFloor));
        return mix(vec3(1.0), irradiance, uLightingStrength);
      #endif
    }
  #endif
`;

const particleContrastFragment = /* glsl */ `
  #ifdef USE_PARTICLE_CONTRAST_ADAPTATION
    uniform float uBackdropLuminance;
    uniform float uMinimumSurfaceLuminance;
    uniform float uMaximumSurfaceLuminance;
    uniform float uContrastStrength;
    uniform float uContrastEdgeStrength;

    float particleLuminance(vec3 color) {
      return dot(color, vec3(0.2126, 0.7152, 0.0722));
    }

    vec3 adaptParticleContrast(vec3 surfaceColor, float coverage) {
      float surfaceLuminance = particleLuminance(surfaceColor);
      bool darkBackdrop = uBackdropLuminance < 0.34;
      float targetLuminance = darkBackdrop
        ? max(surfaceLuminance, uMinimumSurfaceLuminance)
        : min(surfaceLuminance, uMaximumSurfaceLuminance);
      float luminanceScale = clamp(
        targetLuminance / max(surfaceLuminance, 0.001),
        0.18,
        3.4
      );
      vec3 correctedColor = surfaceColor * luminanceScale;
      float edgeBand = smoothstep(0.05, 0.34, coverage) *
        (1.0 - smoothstep(0.34, 0.78, coverage));
      vec3 edgeColor = darkBackdrop
        ? correctedColor * 1.16
        : correctedColor * 0.7;
      correctedColor = mix(
        correctedColor,
        edgeColor,
        edgeBand * uContrastEdgeStrength
      );
      return mix(surfaceColor, correctedColor, uContrastStrength);
    }
  #endif
`;

const texturedFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform float uNearFadeStart;
  uniform float uNearFadeEnd;
  uniform float uFarFadeStart;
  uniform float uFarFadeEnd;
  uniform float uFarFadeOpacity;
  uniform float uFarSoftness;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vViewDepth;

  #include <fog_pars_fragment>
  ${particleLightingFragment}
  ${particleContrastFragment}

  void main() {
    vec4 sampleColor = texture2D(uMap, vUv);
    float nearFade = smoothstep(uNearFadeStart, uNearFadeEnd, vViewDepth);
    float farDepth = smoothstep(uFarFadeStart, uFarFadeEnd, vViewDepth);
    float farFade = mix(1.0, uFarFadeOpacity, farDepth);
    float softenedAlpha = mix(
      sampleColor.a,
      sampleColor.a * sampleColor.a,
      farDepth * uFarSoftness
    );
    float alpha = softenedAlpha * vAlpha * nearFade * farFade;
    if (alpha < 0.004) discard;
    vec3 surfaceColor = sampleColor.rgb * vColor;
    #if defined(USE_PARTICLE_THIN_SURFACE) && defined(USE_PARTICLE_CONTRAST_ADAPTATION)
      surfaceColor = adaptParticleContrast(surfaceColor, sampleColor.a);
    #endif
    #ifdef USE_PARTICLE_SURFACE_LIGHTING
      surfaceColor *= resolveParticleLighting();
    #endif
    #if defined(USE_PARTICLE_CONTRAST_ADAPTATION) && !defined(USE_PARTICLE_THIN_SURFACE)
      surfaceColor = adaptParticleContrast(surfaceColor, sampleColor.a);
    #endif
    gl_FragColor = vec4(surfaceColor, alpha);
    #ifdef USE_PARTICLE_COLOR_MANAGEMENT
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    #endif
    #include <fog_fragment>
  }
`;

const solidFragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vViewDepth;
  uniform float uNearFadeStart;
  uniform float uNearFadeEnd;
  uniform float uFarFadeStart;
  uniform float uFarFadeEnd;
  uniform float uFarFadeOpacity;

  #include <fog_pars_fragment>
  ${particleLightingFragment}
  ${particleContrastFragment}

  void main() {
    float nearFade = smoothstep(uNearFadeStart, uNearFadeEnd, vViewDepth);
    float farDepth = smoothstep(uFarFadeStart, uFarFadeEnd, vViewDepth);
    float farFade = mix(1.0, uFarFadeOpacity, farDepth);
    float alpha = vAlpha * nearFade * farFade;
    if (alpha < 0.004) discard;
    vec3 surfaceColor = vColor;
    #if defined(USE_PARTICLE_THIN_SURFACE) && defined(USE_PARTICLE_CONTRAST_ADAPTATION)
      surfaceColor = adaptParticleContrast(surfaceColor, 1.0);
    #endif
    #ifdef USE_PARTICLE_SURFACE_LIGHTING
      surfaceColor *= resolveParticleLighting();
    #endif
    #if defined(USE_PARTICLE_CONTRAST_ADAPTATION) && !defined(USE_PARTICLE_THIN_SURFACE)
      surfaceColor = adaptParticleContrast(surfaceColor, 1.0);
    #endif
    gl_FragColor = vec4(surfaceColor, alpha);
    #ifdef USE_PARTICLE_COLOR_MANAGEMENT
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    #endif
    #include <fog_fragment>
  }
`;

/**
 * One GPU draw for a whole effect pool.
 *
 * Renderers write directly into stable typed attributes. There are no
 * per-particle Svelte components, object arrays, matrices, colors, or
 * quaternions to allocate in the frame loop.
 */
export class ParticleInstancePool3D {
  readonly capacity: number;
  readonly mesh: InstancedMesh;

  private readonly centers: Float32Array;
  private readonly scales: Float32Array;
  private readonly quaternions: Float32Array;
  private readonly colors: Float32Array;
  private readonly alphas: Float32Array;
  private readonly uvRects: Float32Array;
  private readonly attributes: readonly InstancedBufferAttribute[];
  private readonly material: ShaderMaterial;
  private visibleCount = 0;
  private parent: Object3D | null = null;

  constructor(options: ParticleInstancePoolOptions) {
    this.capacity = options.capacity;
    this.centers = new Float32Array(this.capacity * 3);
    this.scales = new Float32Array(this.capacity * 3);
    this.quaternions = new Float32Array(this.capacity * 4);
    this.colors = new Float32Array(this.capacity * 3);
    this.alphas = new Float32Array(this.capacity);
    this.uvRects = new Float32Array(this.capacity * 4);

    const centerAttribute = new InstancedBufferAttribute(
      this.centers,
      3
    ).setUsage(DynamicDrawUsage);
    const scaleAttribute = new InstancedBufferAttribute(
      this.scales,
      3
    ).setUsage(DynamicDrawUsage);
    const quaternionAttribute = new InstancedBufferAttribute(
      this.quaternions,
      4
    ).setUsage(DynamicDrawUsage);
    const colorAttribute = new InstancedBufferAttribute(
      this.colors,
      3
    ).setUsage(DynamicDrawUsage);
    const alphaAttribute = new InstancedBufferAttribute(
      this.alphas,
      1
    ).setUsage(DynamicDrawUsage);
    const uvRectAttribute = new InstancedBufferAttribute(
      this.uvRects,
      4
    ).setUsage(DynamicDrawUsage);
    this.attributes = [
      centerAttribute,
      scaleAttribute,
      quaternionAttribute,
      colorAttribute,
      alphaAttribute,
      uvRectAttribute,
    ];

    options.geometry.setAttribute("aCenter", centerAttribute);
    options.geometry.setAttribute("aScale", scaleAttribute);
    options.geometry.setAttribute("aQuaternion", quaternionAttribute);
    options.geometry.setAttribute("aColor", colorAttribute);
    options.geometry.setAttribute("aAlpha", alphaAttribute);
    options.geometry.setAttribute("aUvRect", uvRectAttribute);

    const blending: Blending = options.additive
      ? AdditiveBlending
      : NormalBlending;
    const nearFadeStart = Math.max(0, options.nearFadeStart ?? 0);
    const nearFadeEnd = Math.max(
      nearFadeStart + 0.001,
      options.nearFadeEnd ?? nearFadeStart + 0.001
    );
    const farFadeStart = Math.max(
      nearFadeEnd,
      options.farFadeStart ?? 1_000_000
    );
    const farFadeEnd = Math.max(
      farFadeStart + 0.001,
      options.farFadeEnd ?? farFadeStart + 0.001
    );
    const surfaceLighting = options.surfaceLighting;
    const contrastAdaptation = options.contrastAdaptation;
    const sharedUniforms = {
      ...(options.texture ? { uMap: { value: options.texture } } : {}),
      uNearFadeStart: { value: nearFadeStart },
      uNearFadeEnd: { value: nearFadeEnd },
      uFarFadeStart: { value: farFadeStart },
      uFarFadeEnd: { value: farFadeEnd },
      uFarFadeOpacity: {
        value: Math.min(1, Math.max(0, options.farFadeOpacity ?? 1)),
      },
      uFarSoftness: {
        value: Math.min(1, Math.max(0, options.farSoftness ?? 0)),
      },
      uLightingStrength: {
        value: Math.min(1, Math.max(0, surfaceLighting?.strength ?? 0)),
      },
      uLightingFloor: {
        value: Math.min(1, Math.max(0, surfaceLighting?.floor ?? 0.2)),
      },
      uBackdropLuminance: {
        value: Math.min(
          1,
          Math.max(0, contrastAdaptation?.backdropLuminance ?? 0.18)
        ),
      },
      uMinimumSurfaceLuminance: {
        value: Math.min(
          1,
          Math.max(0, contrastAdaptation?.minimumSurfaceLuminance ?? 0.08)
        ),
      },
      uMaximumSurfaceLuminance: {
        value: Math.min(
          1,
          Math.max(0, contrastAdaptation?.maximumSurfaceLuminance ?? 0.72)
        ),
      },
      uContrastStrength: {
        value: Math.min(1, Math.max(0, contrastAdaptation?.strength ?? 0)),
      },
      uContrastEdgeStrength: {
        value: Math.min(1, Math.max(0, contrastAdaptation?.edgeStrength ?? 0)),
      },
    };
    this.material = new ShaderMaterial({
      uniforms: UniformsUtils.merge([
        ...(options.fog ? [UniformsLib.fog] : []),
        ...(surfaceLighting ? [UniformsLib.lights] : []),
        sharedUniforms,
      ]),
      ...(surfaceLighting || options.colorManaged || contrastAdaptation
        ? {
            defines: {
              ...(surfaceLighting ? { USE_PARTICLE_SURFACE_LIGHTING: "" } : {}),
              ...(surfaceLighting && options.thinSurfaceLighting
                ? { USE_PARTICLE_THIN_SURFACE: "" }
                : {}),
              ...(options.colorManaged
                ? { USE_PARTICLE_COLOR_MANAGEMENT: "" }
                : {}),
              ...(contrastAdaptation
                ? { USE_PARTICLE_CONTRAST_ADAPTATION: "" }
                : {}),
            },
          }
        : {}),
      vertexShader: options.billboard
        ? billboardVertexShader
        : orientedVertexShader,
      fragmentShader: options.texture
        ? texturedFragmentShader
        : solidFragmentShader,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      wireframe: options.wireframe ?? false,
      blending,
      fog: options.fog ?? false,
      lights: surfaceLighting !== undefined,
    });

    this.mesh = new InstancedMesh(
      options.geometry,
      this.material,
      this.capacity
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = options.renderOrder ?? 100;
  }

  initialize(parent: Object3D): void {
    if (this.parent === parent) return;
    this.parent?.remove(this.mesh);
    this.parent = parent;
    parent.add(this.mesh);
  }

  beginFrame(): void {
    this.visibleCount = 0;
  }

  write(instance: ParticleInstanceWrite): boolean {
    const index = this.visibleCount;
    if (index >= this.capacity) return false;

    const i3 = index * 3;
    const i4 = index * 4;
    this.centers[i3] = instance.x;
    this.centers[i3 + 1] = instance.y;
    this.centers[i3 + 2] = instance.z;
    this.scales[i3] = instance.scaleX;
    this.scales[i3 + 1] = instance.scaleY;
    this.scales[i3 + 2] = instance.scaleZ;
    this.quaternions[i4] = instance.quaternionX ?? 0;
    this.quaternions[i4 + 1] = instance.quaternionY ?? 0;
    this.quaternions[i4 + 2] = instance.quaternionZ ?? 0;
    this.quaternions[i4 + 3] = instance.quaternionW ?? 1;
    this.colors[i3] = instance.right;
    this.colors[i3 + 1] = instance.green;
    this.colors[i3 + 2] = instance.left;
    this.alphas[index] = instance.alpha;
    this.uvRects[i4] = instance.uvX ?? 0;
    this.uvRects[i4 + 1] = instance.uvY ?? 0;
    this.uvRects[i4 + 2] = instance.uvWidth ?? 1;
    this.uvRects[i4 + 3] = instance.uvHeight ?? 1;
    this.visibleCount++;
    return true;
  }

  commit(): void {
    // An empty material variant has no changed instance data to upload. This
    // matters for the full roster: normal/emissive variants coexist, but only
    // the active one should touch the GPU on a given frame.
    if (this.visibleCount > 0) {
      for (const attribute of this.attributes) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, this.visibleCount * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    }
    this.mesh.count = this.visibleCount;
  }

  clear(): void {
    this.visibleCount = 0;
    this.mesh.count = 0;
  }

  setContrastAdaptation(options: ParticleContrastAdaptationOptions): void {
    this.material.uniforms.uBackdropLuminance!.value = Math.min(
      1,
      Math.max(0, options.backdropLuminance)
    );
    this.material.uniforms.uMinimumSurfaceLuminance!.value = Math.min(
      1,
      Math.max(0, options.minimumSurfaceLuminance)
    );
    this.material.uniforms.uMaximumSurfaceLuminance!.value = Math.min(
      1,
      Math.max(0, options.maximumSurfaceLuminance)
    );
    this.material.uniforms.uContrastStrength!.value = Math.min(
      1,
      Math.max(0, options.strength)
    );
    this.material.uniforms.uContrastEdgeStrength!.value = Math.min(
      1,
      Math.max(0, options.edgeStrength)
    );
  }

  dispose(): void {
    this.parent?.remove(this.mesh);
    this.parent = null;
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
