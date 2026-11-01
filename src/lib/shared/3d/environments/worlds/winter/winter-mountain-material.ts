import {
  Color,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from "three";
import type { WinterDetailTier } from "../../scenes/winter/authored/winter-layout";

/**
 * Runtime look for Blue Hour Lodge's Blender-authored mountains: fresh snow on
 * the faces that can hold it, dark stratified rock where they are too steep,
 * a cold moonlit rim on the crests and aerial perspective that layers the near
 * ranges against the far ring. No textures: every signal is analytic noise or
 * baked into the mesh's COLOR_0 by scripts/build-winter-mountains.py
 * (r = convexity, g = exposure, b = scree), so the worker renderer runs it too.
 */

export interface WinterMountainLook {
  /** Sky moon direction (the visible moon, not the shadow light). */
  moonDirection: readonly [number, number, number];
  /** Horizon band colour the haze leans toward. */
  hazeColor: string;
}

export interface WinterMountainUniforms {
  moonDirection: { value: Vector3 };
  moonColor: { value: Color };
  moonStrength: { value: number };
  rimStrength: { value: number };
  keyScale: { value: number };
  skyFillColor: { value: Color };
  skyFillStrength: { value: number };
  snowColor: { value: Color };
  snowShadowColor: { value: Color };
  rockColor: { value: Color };
  weatheredRockColor: { value: Color };
  hazeColor: { value: Color };
  hazeDensity: { value: number };
  hazeStart: { value: number };
  hazeMaximum: { value: number };
  valleyHaze: { value: number };
  valleyHeight: { value: number };
  reliefStrength: { value: number };
}

const OCTAVES: Record<WinterDetailTier, number> = {
  low: 1,
  medium: 2,
  high: 3,
};
const PATCH_KEY = "winterMountainPatch";
const FAR_HAZE_TINT = new Color("#5c5c8a");

function createUniforms(
  look: WinterMountainLook,
  far: boolean
): WinterMountainUniforms {
  // The far ring leans violet so it separates from the near ranges as a
  // distinct paler, cooler layer.
  const haze = new Color(look.hazeColor);
  if (far) haze.lerp(FAR_HAZE_TINT, 0.5);
  return {
    moonDirection: {
      value: new Vector3(...look.moonDirection).normalize(),
    },
    moonColor: { value: new Color("#cfdcf2") },
    moonStrength: { value: far ? 0.5 : 1.0 },
    rimStrength: { value: far ? 0.8 : 3.5 },
    keyScale: { value: far ? 0.3 : 0.5 },
    skyFillColor: { value: new Color("#5d7fb8") },
    skyFillStrength: { value: far ? 0.05 : 0.11 },
    snowColor: { value: new Color("#d3e0f3") },
    snowShadowColor: { value: new Color("#5a7cc2") },
    rockColor: { value: new Color("#1e2634") },
    weatheredRockColor: { value: new Color("#5b6576") },
    hazeColor: { value: haze },
    hazeDensity: { value: far ? 0.006 : 0.0016 },
    hazeStart: { value: far ? 60 : 100 },
    hazeMaximum: { value: far ? 0.8 : 0.35 },
    valleyHaze: { value: far ? 0.35 : 0.3 },
    valleyHeight: { value: far ? 46 : 26 },
    reliefStrength: { value: far ? 0 : 3.4 },
  };
}

const VERTEX_PARS = /* glsl */ `
  varying vec3 vMtnWorld;
  varying vec3 vMtnLocal;
  varying vec3 vMtnNormal;
`;

const VERTEX_MAIN = /* glsl */ `
  vMtnLocal = transformed;
  vMtnNormal = objectNormal;
  vMtnWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAGMENT_PARS = /* glsl */ `
  uniform mat3 normalMatrix;
  uniform vec3 uMtnMoonDirection;
  uniform vec3 uMtnMoonColor;
  uniform float uMtnMoonStrength;
  uniform float uMtnRimStrength;
  uniform float uMtnKeyScale;
  uniform vec3 uMtnSkyFillColor;
  uniform float uMtnSkyFillStrength;
  uniform vec3 uMtnSnowColor;
  uniform vec3 uMtnSnowShadowColor;
  uniform vec3 uMtnRockColor;
  uniform vec3 uMtnWeatheredRockColor;
  uniform vec3 uMtnHazeColor;
  uniform float uMtnHazeDensity;
  uniform float uMtnHazeStart;
  uniform float uMtnHazeMaximum;
  uniform float uMtnValleyHaze;
  uniform float uMtnValleyHeight;
  uniform float uMtnReliefStrength;
  varying vec3 vMtnWorld;
  varying vec3 vMtnLocal;
  varying vec3 vMtnNormal;

  float mtnHash(vec2 p) {
    p = fract(p * vec2(0.1031, 0.1030));
    p += dot(p, p.yx + 33.33);
    return fract((p.x + p.y) * p.x);
  }

  // Value noise with its analytic derivative (value, d/dx, d/dy).
  vec3 mtnNoised(vec2 x) {
    vec2 i = floor(x);
    vec2 f = fract(x);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = mtnHash(i);
    float b = mtnHash(i + vec2(1.0, 0.0));
    float c = mtnHash(i + vec2(0.0, 1.0));
    float d = mtnHash(i + vec2(1.0, 1.0));
    float k1 = b - a;
    float k2 = c - a;
    float k4 = a - b - c + d;
    return vec3(
      a + k1 * u.x + k2 * u.y + k4 * u.x * u.y,
      du * (vec2(k1, k2) + k4 * u.yx)
    );
  }

  float mtnNoise(vec2 x) {
    return mtnNoised(x).x;
  }

  float mtnFbm(vec2 x) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < MTN_OCTAVES; i++) {
      value += amplitude * mtnNoise(x);
      x = x * 2.07 + vec2(17.1, 9.3);
      amplitude *= 0.5;
    }
    return value / (1.0 - pow(0.5, float(MTN_OCTAVES)));
  }

  // Triplanar gradient of a ridged height field, in object space. The side
  // projections are stretched vertically so steep faces get fall-line
  // gullies and ribs rather than round lumps.
  vec3 mtnRelief(vec3 p, vec3 n) {
    vec3 w = pow(abs(n), vec3(4.0));
    w /= (w.x + w.y + w.z);
    vec3 gradient = vec3(0.0);
    vec2 fall = vec2(1.0, 0.28);
    float amplitude = 1.0;
    float frequency = 0.16;
    for (int i = 0; i < MTN_OCTAVES; i++) {
      vec3 sx = mtnNoised(p.zy * fall * frequency + float(i) * 7.1);
      vec3 sy = mtnNoised(p.xz * frequency + float(i) * 3.7);
      vec3 sz = mtnNoised(p.xy * fall * frequency + float(i) * 5.3);
      sx.yz *= fall;
      sz.yz *= fall;
      // Ridged: fold the noise around its midline so crests are sharp.
      sx.yz *= sign(sx.x - 0.5);
      sy.yz *= sign(sy.x - 0.5);
      sz.yz *= sign(sz.x - 0.5);
      gradient += amplitude * (
        w.x * vec3(0.0, sx.z, sx.y)
        + w.y * vec3(sy.y, 0.0, sy.z)
        + w.z * vec3(sz.y, sz.z, 0.0)
      );
      amplitude *= 0.55;
      frequency *= 2.13;
    }
    return gradient;
  }
`;

// Appended after FRAGMENT_PARS: structure fields shared by snow and relief.
const FRAGMENT_STRUCTURE = /* glsl */ `
  // Fall-line ribs: ridged noise on the two side projections, stretched
  // vertically so ribs and the gullies between them run straight downhill.
  // Returns (rib 0..1, object-space gradient).
  vec4 mtnRibs(vec3 p, vec3 n) {
    vec2 w = pow(abs(n.xz), vec2(2.0));
    w /= max(w.x + w.y, 1e-4);
    vec2 fall = vec2(0.075, 0.012);
    vec3 sx = mtnNoised(p.zy * fall + vec2(3.1, 0.0));
    vec3 sz = mtnNoised(p.xy * fall + vec2(0.0, 7.7));
    sx.yz *= fall;
    sz.yz *= fall;
    float rx = 1.0 - abs(2.0 * sx.x - 1.0);
    float rz = 1.0 - abs(2.0 * sz.x - 1.0);
    vec2 gx = -2.0 * sign(2.0 * sx.x - 1.0) * sx.yz;
    vec2 gz = -2.0 * sign(2.0 * sz.x - 1.0) * sz.yz;
    float rib = w.x * rx + w.y * rz;
    vec3 gradient = w.x * vec3(0.0, gx.y, gx.x) + w.y * vec3(gz.x, gz.y, 0.0);
    return vec4(rib, gradient);
  }
`;

const FRAGMENT_SURFACE = /* glsl */ `
  vec3 mtnN = normalize(vMtnNormal);
  vec3 mtnP = vMtnLocal;
  float mtnConvexity = vColor.r;
  float mtnExposure = vColor.g;
  float mtnScree = vColor.b;
  float mtnAltitude = clamp(mtnP.y / 80.0, 0.0, 1.0);

  // How steep the underlying face is: 0 flat, 0.29 at 45 degrees, 0.5 at 60.
  float mtnSlope = 1.0 - mtnN.y;
  float mtnFace = smoothstep(0.12, 0.36, mtnSlope);

  // Strata coordinate: altitude tilted by a dip whose direction and angle
  // drift slowly across the ranges, then domain-warped at low frequency so
  // beds fold and pinch instead of running as level stripes.
  float mtnRagged = mtnFbm(mtnP.xz * 0.055 + mtnP.y * 0.02);
  float mtnWarp = mtnFbm(mtnP.xz * 0.03 + 4.7);
  float mtnDipAim = mtnNoise(mtnP.xz * 0.0035 + 1.3) * 6.283;
  float mtnDip = 0.05 + 0.2 * mtnNoise(mtnP.xz * 0.003 + 7.1);
  float mtnStrataY = mtnP.y
    + dot(mtnP.xz, vec2(cos(mtnDipAim), sin(mtnDipAim))) * mtnDip
    + (mtnFbm(mtnP.xz * 0.011 + 2.3) - 0.5) * 16.0
    + (mtnFbm(mtnP.xz * 0.045 + mtnP.y * 0.03 + 9.1) - 0.5) * 3.5;
  // Band spacing and bedding strength vary slowly: some faces are massive,
  // others thinly bedded. Detail fades with distance so beyond about 150 m
  // only the broad tonal structure remains.
  float mtnBedding = smoothstep(0.3, 0.7, mtnFbm(mtnP.xz * 0.009 + mtnStrataY * 0.006 + 5.5));
  float mtnSpacing = mix(11.0, 6.0, mtnBedding);
  float mtnDetailFade = 1.0 - smoothstep(80.0, 150.0, distance(vMtnWorld, cameraPosition));
  float mtnBand = mtnStrataY / mtnSpacing + (mtnRagged - 0.5) * 0.8;
  float mtnBandT = fract(mtnBand);
  // Not every band carries a ledge, and each ledge breaks into segments.
  float mtnBandLive = smoothstep(0.35, 0.6,
    mtnNoise(vec2(floor(mtnBand) * 3.7, (mtnP.x + mtnP.z) * 0.035)));
  float mtnLedge = smoothstep(0.72, 0.84, mtnBandT)
    * (1.0 - smoothstep(0.94, 1.0, mtnBandT)) * mtnBandLive
    * smoothstep(0.3, 0.55, mtnNoise(vec2((mtnP.x - mtnP.z) * 0.11, mtnBand * 2.0)));
  float mtnCliff = smoothstep(0.3, 0.45, mtnBandT)
    * (1.0 - smoothstep(0.68, 0.76, mtnBandT)) * mtnBandLive * (0.45 + 0.55 * mtnBedding);
  float mtnStrata = mix(0.5, 0.5 + 0.5 * sin(mtnBand * 12.566),
    mtnBedding * (0.3 + 0.7 * mtnDetailFade));

  vec4 mtnRib = mtnRibs(mtnP, mtnN);
  float mtnRibMask = smoothstep(0.56, 0.8, mtnRib.x);

  // Fine bedding and crack lines on steep near faces: thin horizontal beds
  // about 1.4 m apart, and joint cracks running down the fall line.
  #ifndef MTN_FAR
    float mtnBedPhase = mtnStrataY * mix(3.2, 5.6, mtnBedding) + (mtnRagged - 0.5) * 2.0;
    float mtnBed = mix(0.5, 0.5 + 0.5 * sin(mtnBedPhase), mtnBedding * mtnDetailFade);
    // Joints run across the beds, so they follow the warped strata too.
    float mtnJoint = abs(mtnNoise(vec2((mtnP.x - mtnP.z) * 0.38, mtnStrataY * 0.07)) - 0.5);
    float mtnCrack = (1.0 - smoothstep(0.015, 0.05, mtnJoint))
      + (1.0 - smoothstep(0.05, 0.16, abs(sin(mtnBedPhase * 0.5)))) * 0.6
        * step(0.55, mtnNoise(vec2((mtnP.x + mtnP.z) * 0.09, floor(mtnBedPhase / 6.283))));
    mtnCrack = saturate(mtnCrack) * mtnFace * mtnDetailFade;
  #else
    float mtnBedPhase = 0.0;
    float mtnBed = 0.5;
    float mtnCrack = 0.0;
  #endif

  #ifdef MTN_RELIEF
    // Fine relief wherever the slope can show it, plus the fall-line ribs and
    // the ledge steps, so faces read as carved rock at 100 to 200 m.
    float mtnSteep = smoothstep(0.08, 0.4, mtnSlope);
    vec3 mtnGradient = mtnRelief(mtnP, mtnN) * uMtnReliefStrength * (0.35 + 0.65 * mtnSteep);
    mtnGradient += mtnRib.yzw * uMtnReliefStrength * 22.0 * mtnFace;
    // Bedding steps: each bed tilts the normal up and down along the face.
    mtnGradient.y += cos(mtnBedPhase) * uMtnReliefStrength * 0.22 * mtnFace
      * mtnBedding * mtnDetailFade;
    vec3 mtnBumped = normalize(mtnN - 0.42 * (mtnGradient - dot(mtnGradient, mtnN) * mtnN));
    // Ledges tip toward level; the cliff band beneath them stands steeper.
    vec3 mtnFlat = normalize(vec3(mtnBumped.x * 0.35, 1.0, mtnBumped.z * 0.35));
    mtnBumped = normalize(mix(mtnBumped, mtnFlat, mtnLedge * mtnFace * 0.55));
    vec3 mtnSheer = normalize(vec3(mtnBumped.x, mtnBumped.y * 0.55, mtnBumped.z));
    mtnBumped = normalize(mix(mtnBumped, mtnSheer, mtnCliff * mtnFace * 0.5));
  #else
    vec3 mtnBumped = mtnN;
  #endif

  // Snow holds on low-angle and lee slopes, on ledges and in the gullies
  // between ribs. Steep faces, ribs, cliff bands and scoured crests go to rock.
  float mtnFine = mtnNoise(mtnP.xz * 0.31 + mtnP.y * 0.17);
  float mtnLee = smoothstep(-0.2, 0.6,
      dot(normalize(mtnN.xz + 1e-4), normalize(vec2(-0.55, 0.83))))
    * smoothstep(0.05, 0.3, mtnSlope);
  float mtnScour = smoothstep(0.72, 0.95, mtnConvexity)
    * smoothstep(0.55, 0.95, mtnExposure)
    * mtnAltitude;
  float mtnSlopeEff = mix(mtnSlope, 1.0 - mtnBumped.y, 0.5)
    + (mtnRagged - 0.5) * 0.18
    + (mtnFine - 0.5) * 0.04
    - mtnLee * 0.07
    - mtnAltitude * 0.03
    + (mtnConvexity - 0.5) * 0.3
    + (mtnExposure - 0.5) * 0.12
    + mtnScree * 0.04;
  #ifdef MTN_FAR
    float mtnSnow = 1.0 - smoothstep(0.24, 0.42, mtnSlopeEff);
  #else
    // A narrow threshold gives a crisp snow line against the rock.
    float mtnSnow = 1.0 - smoothstep(0.235, 0.265, mtnSlopeEff);
    float mtnGully = (1.0 - mtnRibMask) * smoothstep(0.42, 0.72,
      mtnFbm(vec2((mtnP.x + mtnP.z * 0.6) * 0.05, mtnP.y * 0.02)));
    mtnSnow = max(mtnSnow, mtnGully * mtnFace * (1.0 - smoothstep(0.55, 0.75, mtnSlope)));
    mtnSnow = max(mtnSnow, mtnLedge * (1.0 - smoothstep(0.5, 0.7, mtnSlope)));
    mtnSnow *= 1.0 - mtnCliff * mtnFace * 0.9;
    mtnSnow *= 1.0 - mtnRibMask * mtnFace * 0.9;
    // Wind-drawn snow streaks on lee slopes just below the crests, stretched
    // along the wind.
    vec2 mtnWind = normalize(vec2(-0.55, 0.83));
    float mtnStreakSnow = smoothstep(0.58, 0.8, mtnNoise(vec2(
      dot(mtnP.xz, mtnWind) * 0.035,
      dot(mtnP.xz, vec2(-mtnWind.y, mtnWind.x)) * 0.55 + mtnP.y * 0.05)));
    float mtnBelowCrest = smoothstep(0.3, 0.6, mtnAltitude)
      * (1.0 - smoothstep(0.62, 0.85, mtnConvexity));
    mtnSnow = max(mtnSnow, mtnStreakSnow * mtnLee * mtnBelowCrest * 0.55
      * (1.0 - smoothstep(0.6, 0.8, mtnSlope)));
  #endif
  mtnSnow *= 1.0 - mtnScour * 0.6;
  mtnSnow = saturate(mtnSnow);

  // Rock: dark blue-grey, strata, fall-line streaks, lighter weathered patches.
  float mtnWeathered = smoothstep(0.45, 0.8, mtnFbm(mtnP.xz * 0.021 + mtnP.y * 0.04 + 3.1));
  float mtnStreak = mtnNoise(vec2((mtnP.x + mtnP.z) * 0.45, mtnP.y * 0.05));
  vec3 mtnRock = mix(uMtnRockColor, uMtnWeatheredRockColor, mtnWeathered * 0.8);
  mtnRock *= (0.7 + 0.5 * mtnStrata) * (0.78 + 0.4 * mtnStreak);
  mtnRock *= mix(1.0, 0.72, mtnCliff);
  mtnRock *= mix(1.0, 1.25, mtnRibMask * mtnWeathered);
  mtnRock *= mix(1.0, 0.82, mtnScree * (1.0 - mtnSnow));
  mtnRock *= (0.86 + 0.24 * mtnBed * mtnFace) * (1.0 - 0.45 * mtnCrack);

  normal = normalize(normalMatrix * mtnBumped) * faceDirection;

  // Snow: cold white toward the key light, deep blue where it turns away, so
  // shadowed snow never reads as grey. Faint wind-drawn sastrugi.
  // The basin's key light is scaled down on the mountains (see the
  // atmosphere block); the low moon behind the massif is their main light.
  #if NUM_DIR_LIGHTS > 0
    float mtnKey = dot(normal, directionalLights[0].direction) * uMtnKeyScale;
  #else
    float mtnKey = 0.5 * uMtnKeyScale;
  #endif
  vec3 mtnMoonView = normalize((viewMatrix * vec4(uMtnMoonDirection, 0.0)).xyz);
  float mtnMoonFacing = dot(normal, mtnMoonView);
  float mtnKeyLit = smoothstep(-0.1, 0.5, max(mtnKey, mtnMoonFacing * 1.4));
  float mtnSastrugi = mtnNoise(vec2(mtnP.x * 0.9 + mtnP.z * 0.35, mtnP.z * 0.12));
  vec3 mtnSnowAlbedo = mix(uMtnSnowShadowColor, uMtnSnowColor, mtnKeyLit)
    * (0.95 + 0.07 * mtnSastrugi);
  // Old snow in sheltered hollows reads slightly bluer still, and the
  // deepest couloirs take a faint blue-ice tint.
  mtnSnowAlbedo *= mix(vec3(0.86, 0.93, 1.0), vec3(1.0), mtnExposure);
  #ifndef MTN_FAR
  float mtnCouloir = (1.0 - smoothstep(0.12, 0.3, mtnConvexity))
    * (1.0 - smoothstep(0.25, 0.5, mtnExposure)) * mtnFace;
  mtnSnowAlbedo = mix(mtnSnowAlbedo, mtnSnowAlbedo * vec3(0.74, 0.88, 1.08), mtnCouloir * 0.7);
  // Steep faces turned away from the moon fall into a cooler, deeper blue.
  float mtnLeeShade = mtnFace * (1.0 - smoothstep(-0.25, 0.35, mtnMoonFacing));
  mtnRock = mix(mtnRock, mtnRock * vec3(0.66, 0.78, 1.12), mtnLeeShade * 0.7);
  mtnSnowAlbedo = mix(mtnSnowAlbedo, mtnSnowAlbedo * vec3(0.8, 0.88, 1.04), mtnLeeShade * 0.6);
  #endif

  diffuseColor.rgb = mix(mtnRock, mtnSnowAlbedo, mtnSnow);
  roughnessFactor = mix(0.95, 0.72, mtnSnow);
  metalnessFactor = 0.0;

  vec3 mtnViewDirection = normalize(vViewPosition);
  float mtnFresnel = pow(1.0 - saturate(dot(normal, mtnViewDirection)), 2.5);
  float mtnCrest = smoothstep(0.55, 0.9, mtnConvexity) * (0.4 + 0.6 * mtnExposure);
  vec3 mtnExtraLight = uMtnMoonColor * uMtnMoonStrength * saturate(mtnMoonFacing)
    * mix(0.45, 1.0, mtnSnow) * diffuseColor.rgb;
  mtnExtraLight += uMtnSkyFillColor * uMtnSkyFillStrength
    * (0.5 + 0.5 * mtnBumped.y) * diffuseColor.rgb;
  mtnExtraLight += uMtnMoonColor * uMtnRimStrength * 0.25 * mtnFresnel
    * smoothstep(-0.2, 0.5, mtnMoonFacing) * (0.2 + 0.8 * mtnCrest)
    * mix(0.35, 1.0, mtnSnow);
  // Moonlit rim: a thin cold line where a crest turns away from the viewer,
  // strongest near the summits, and a lift on moon-facing summit snow.
  float mtnEdge = smoothstep(0.55, 0.85, 1.0 - saturate(dot(normal, mtnViewDirection)));
  float mtnRidge = smoothstep(0.6, 0.8, mtnConvexity) * smoothstep(0.35, 0.8, mtnExposure);
  float mtnHigh = smoothstep(0.25, 0.6, mtnAltitude);
  float mtnRimLine = mtnEdge * mtnRidge * (0.35 + 0.65 * mtnHigh);
  mtnExtraLight += uMtnMoonColor * uMtnRimStrength * 0.16 * mtnRimLine * mix(0.4, 1.0, mtnSnow);
  // Thin bright crest on silhouette edges that face the moon.
  #ifndef MTN_FAR
  float mtnSilhouette = smoothstep(0.72, 0.92, 1.0 - saturate(dot(normal, mtnViewDirection)));
  float mtnMoonEdge = smoothstep(-0.05, 0.45, mtnMoonFacing);
  mtnExtraLight += uMtnMoonColor * uMtnRimStrength * 0.32 * mtnSilhouette * mtnMoonEdge
    * smoothstep(0.5, 0.75, mtnConvexity) * (0.5 + 0.5 * mtnHigh);
  #endif
  mtnExtraLight += uMtnMoonColor * uMtnMoonStrength * 0.22 * mtnHigh * mtnSnow
    * smoothstep(0.0, 0.5, mtnMoonFacing);
`;

const FRAGMENT_ATMOSPHERE = /* glsl */ `
  outgoingLight -= (1.0 - uMtnKeyScale)
    * (reflectedLight.directDiffuse + reflectedLight.directSpecular);
  outgoingLight += mtnExtraLight;
  float mtnDistance = distance(vMtnWorld, cameraPosition);
  float mtnAerial = 1.0 - exp(-max(mtnDistance - uMtnHazeStart, 0.0) * uMtnHazeDensity);
  float mtnValley = (1.0 - smoothstep(0.0, uMtnValleyHeight, mtnP.y)) * uMtnValleyHaze;
  float mtnHaze = min(uMtnHazeMaximum, mtnAerial + mtnValley * (0.35 + 0.65 * mtnAerial));
  outgoingLight = mix(outgoingLight, uMtnHazeColor, mtnHaze);
`;

interface PatchState {
  uniforms: WinterMountainUniforms;
}

/** True for the far ring, which the exporter keeps as its own mesh by material. */
export const WINTER_FAR_RANGE_MATERIAL = "Distant blue range";

export function isWinterFarRangeMaterial(material: Material): boolean {
  return material.name === WINTER_FAR_RANGE_MATERIAL;
}

/**
 * Patch a mountain mesh's own MeshStandardMaterial in place. The material
 * belongs to the loaded GLB, so the renderer adapter that disposes the asset
 * also disposes it; the patch creates only plain uniform data.
 */
export function patchWinterMountainMaterial(
  material: MeshStandardMaterial,
  options: { far: boolean; tier: WinterDetailTier; look: WinterMountainLook }
): WinterMountainUniforms {
  const existing = material.userData[PATCH_KEY] as PatchState | undefined;
  if (existing) return existing.uniforms;

  const uniforms = createUniforms(options.look, options.far);
  material.color.set("#ffffff");
  material.map = null;
  material.metalness = 0;
  material.roughness = 0.9;
  // The patch owns aerial perspective for the mountains: scene fog is tuned
  // for the basin and would wash every range to the same flat grey.
  material.fog = false;
  // COLOR_0 carries terrain data, not albedo; the patch reads vColor itself.
  material.vertexColors = true;
  material.defines = {
    ...material.defines,
    MTN_OCTAVES: OCTAVES[options.tier],
    ...(options.far ? { MTN_FAR: "" } : {}),
    ...(options.far || options.tier === "low" ? {} : { MTN_RELIEF: "" }),
  };

  const previousCompile = material.onBeforeCompile.bind(material);
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (
    shader: WebGLProgramParametersWithUniforms,
    renderer
  ) => {
    previousCompile(shader, renderer);
    shader.uniforms.uMtnMoonDirection = uniforms.moonDirection;
    shader.uniforms.uMtnMoonColor = uniforms.moonColor;
    shader.uniforms.uMtnMoonStrength = uniforms.moonStrength;
    shader.uniforms.uMtnRimStrength = uniforms.rimStrength;
    shader.uniforms.uMtnKeyScale = uniforms.keyScale;
    shader.uniforms.uMtnSkyFillColor = uniforms.skyFillColor;
    shader.uniforms.uMtnSkyFillStrength = uniforms.skyFillStrength;
    shader.uniforms.uMtnSnowColor = uniforms.snowColor;
    shader.uniforms.uMtnSnowShadowColor = uniforms.snowShadowColor;
    shader.uniforms.uMtnRockColor = uniforms.rockColor;
    shader.uniforms.uMtnWeatheredRockColor = uniforms.weatheredRockColor;
    shader.uniforms.uMtnHazeColor = uniforms.hazeColor;
    shader.uniforms.uMtnHazeDensity = uniforms.hazeDensity;
    shader.uniforms.uMtnHazeStart = uniforms.hazeStart;
    shader.uniforms.uMtnHazeMaximum = uniforms.hazeMaximum;
    shader.uniforms.uMtnValleyHaze = uniforms.valleyHaze;
    shader.uniforms.uMtnValleyHeight = uniforms.valleyHeight;
    shader.uniforms.uMtnReliefStrength = uniforms.reliefStrength;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${VERTEX_MAIN}`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${FRAGMENT_PARS}\n${FRAGMENT_STRUCTURE}`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>\n${FRAGMENT_SURFACE}`
      )
      .replace(
        "#include <opaque_fragment>",
        `${FRAGMENT_ATMOSPHERE}\n#include <opaque_fragment>`
      );
  };
  material.customProgramCacheKey = () =>
    `${previousCacheKey()}|winter-mountain-v4|${options.far ? "far" : "near"}|${options.tier}`;
  material.userData[PATCH_KEY] = { uniforms } satisfies PatchState;
  material.needsUpdate = true;
  return uniforms;
}
