/** Exact shader sources extracted from the production Ember components. */

export const EMBER_CRACKS_VERTEX_SHADER = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

export const EMBER_CRACKS_FRAGMENT_SHADER = /* glsl */ `
    uniform float uTime;
    uniform vec3 uCrackColor;
    uniform float uIntensity;
    uniform float uScale;
    uniform float uPulseSpeed;
    uniform float uPulseIntensity;
    uniform float uEdgeFade;
    varying vec2 vUv;

    vec2 hash22(vec2 p) {
      return fract(sin(vec2(
        dot(p, vec2(127.1, 311.7)),
        dot(p, vec2(269.5, 183.3))
      )) * 43758.5453);
    }

    // Returns (F1, F2) — distances to closest and second-closest Voronoi cells
    vec2 voronoi(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float minDist = 1.0;
      float secondDist = 1.0;
      vec2 closestPoint = vec2(0.0);
      for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
          vec2 neighbor = vec2(float(x), float(y));
          vec2 point = hash22(i + neighbor);
          point = 0.5 + 0.5 * sin(uTime * 0.2 + 6.283 * point);
          vec2 diff = neighbor + point - f;
          float d = length(diff);
          if (d < minDist) {
            secondDist = minDist;
            minDist = d;
            closestPoint = i + neighbor + point;
          } else if (d < secondDist) {
            secondDist = d;
          }
        }
      }
      return vec2(minDist, secondDist);
    }

    void main() {
      vec2 scaledUv = (vUv - 0.5) * uScale * 6.0;

      // Primary crack network
      vec2 v1 = voronoi(scaledUv);
      float crackEdge = v1.y - v1.x;

      // Secondary finer crack network (overlaid)
      vec2 v2 = voronoi(scaledUv * 2.3 + 50.0);
      float fineCrack = v2.y - v2.x;

      // Thin bright cracks
      float crackLine = 1.0 - smoothstep(0.0, 0.06, crackEdge);
      float fineLines = 1.0 - smoothstep(0.0, 0.04, fineCrack);

      // Glow around cracks
      float crackGlow = 1.0 - smoothstep(0.0, 0.2, crackEdge);
      float fineGlow = 1.0 - smoothstep(0.0, 0.15, fineCrack);

      // Combine scales — primary dominates
      float combinedCrack = crackLine + fineLines * 0.4;
      float combinedGlow = crackGlow + fineGlow * 0.3;

      // Traveling pulse wave — radiates outward from center
      float distFromCenter = length(vUv - 0.5);
      float pulse = sin(distFromCenter * 8.0 - uTime * uPulseSpeed * 6.0) * 0.5 + 0.5;
      pulse = pow(pulse, 3.0);
      float pulsedIntensity = uIntensity * (1.0 + pulse * uPulseIntensity);

      float alpha = (combinedCrack * 0.9 + combinedGlow * 0.25) * pulsedIntensity;

      // Edge fadeout. Full strength on an unbounded ground decal; dialled out
      // when the plane's own border is real geometry doing the containing.
      float dist = length(vUv - 0.5) * 2.0;
      alpha *= mix(1.0, 1.0 - smoothstep(0.6, 1.0, dist), uEdgeFade);

      // Color — brighter at pulse peaks
      vec3 color = uCrackColor * (combinedCrack * 1.5 + combinedGlow * 0.5);
      color += uCrackColor * pulse * combinedGlow * 0.8;

      gl_FragColor = vec4(color, alpha);
    }
  `;

export const EMBER_POOL_VERTEX_SHADER = /* glsl */ `
    varying vec2 vUv;
    uniform float uTime;

    void main() {
      vUv = uv;
      vec3 pos = position;

      // Multi-wave surface undulation — sells molten liquid at oblique angles
      float wave = sin(pos.x * 2.3 + uTime * 0.8) * sin(pos.y * 1.7 + uTime * 0.6) * 0.5
                 + sin(pos.x * 3.1 - pos.y * 2.9 + uTime * 1.2) * 0.25
                 + sin(pos.x * 5.7 + pos.y * 4.3 + uTime * 0.9) * 0.125;
      pos.z += wave * 0.18;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

export const EMBER_POOL_FRAGMENT_SHADER = /* glsl */ `
    uniform float uTime;
    uniform vec3 uBaseColor;
    uniform vec3 uHotColor;
    uniform vec3 uCrustColor;
    uniform float uWarpIntensity;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    // Rotated FBM — rotating each octave prevents axis-aligned artifacts
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
      for (int i = 0; i < 6; i++) {
        v += a * noise(p);
        p = rot * p * 2.0 + vec2(100.0);
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 4.0;

      // === Domain warping (two layers) ===
      // First warp: sample FBM at two offset positions to create a warp vector
      vec2 q = vec2(
        fbm(uv + vec2(0.0, 0.0) + uTime * 0.12),
        fbm(uv + vec2(5.2, 1.3) + uTime * 0.1)
      );

      // Second warp: warp the warp — creates incredibly organic turbulence
      vec2 r = vec2(
        fbm(uv + uWarpIntensity * q + vec2(1.7, 9.2) + uTime * 0.07),
        fbm(uv + uWarpIntensity * q + vec2(8.3, 2.8) + uTime * 0.065)
      );

      // Final pattern: FBM at double-warped coordinates
      float f = fbm(uv + uWarpIntensity * r);

      // === Color mapping ===
      // Crust darkening based on primary warped field strength
      float crustMask = pow(length(q), 1.5);
      crustMask = clamp(crustMask, 0.0, 1.0);

      // Hot veins where secondary warp creates high displacement
      float veinHeat = pow(length(r), 1.8);
      veinHeat = clamp(veinHeat * 0.8, 0.0, 1.0);

      // Base lava color from warped noise
      vec3 color = mix(uCrustColor, uBaseColor, clamp(f * f * 4.0, 0.0, 1.0));

      // Bright magma veins
      color = mix(color, uHotColor, veinHeat * 0.7);

      // HDR-like hotspots where both warp fields align
      float hotspot = max(dot(normalize(q + 0.001), normalize(r + 0.001)), 0.0);
      hotspot = pow(hotspot, 4.0) * length(r);
      color += uHotColor * hotspot * 2.5;

      // Subtle crust chunks — darker areas that drift
      float crustChunks = smoothstep(0.4, 0.6, fbm(uv * 3.0 + uTime * 0.03));
      color = mix(color, uCrustColor, crustChunks * (1.0 - veinHeat) * 0.35);

      // Edge glow — lava brightest where it meets cooled rock
      float dist = length(vUv - 0.5) * 2.0;
      float rimGlow = smoothstep(0.6, 0.95, dist) * (1.0 - smoothstep(0.95, 1.0, dist));
      color += uHotColor * rimGlow * 0.4;

      // Very thin cooled-rock fringe at outer edge only
      float outerFringe = smoothstep(0.92, 1.0, dist);
      color = mix(color, uCrustColor, outerFringe * 0.5);

      // Emissive boost
      color *= 1.4;

      gl_FragColor = vec4(color, 1.0);
    }
  `;

export const EMBER_RIVER_NOISE = /* glsl */ `
    // sin() based hashes lose their gradient once the advected domain grows past
    // a few thousand, which on a long session turned the crust into banding, and
    // low-precision sin on mobile GPUs made it worse. This one stays stable.
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      mat2 rotation = mat2(0.8, 0.6, -0.6, 0.8);
      for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p = rotation * p * 2.03 + vec2(17.0, 31.0);
        amplitude *= 0.5;
      }
      return value;
    }
  `;

export const EMBER_RIVER_VERTEX_SHADER = /* glsl */ `
    uniform float uTime;
    uniform float uGradeRidges;
    attribute float aCross;
    attribute float aFlow;
    attribute float aRun;
    attribute float aGrade;
    varying float vCross;
    varying float vFlow;
    varying float vRun;
    varying float vGrade;
    varying vec3 vWorldPosition;
    #include <fog_pars_vertex>

    void main() {
      vCross = aCross;
      vFlow = aFlow;
      vRun = aRun;
      vGrade = aGrade;
      vec3 pos = position;
      // Metres, not curve parameter: the control points are spaced 8 to 31
      // apart, so a parameter-space wave stretched four-fold along the reach.
      float bankWeight = clamp(1.0 - aCross * aCross, 0.0, 1.0);
      // Steep reaches run faster and pile into transverse pressure ridges. This
      // is what carries the fifteen-metre fall to a side camera: the profile
      // itself only subtends about three degrees, but differential speed and
      // corrugation read as slope at any distance.
      float haste = 1.0 + aGrade * uGradeRidges * 1.6;
      float travellingFold = sin(
        aFlow * 0.51
        + sin(aCross * 3.14159265) * 0.8
        - uTime * 1.45 * haste
      ) * 0.034;
      float convectionRoll = sin(
        aFlow * 0.197
        - aCross * 2.5
        - uTime * 0.52
      ) * 0.018;
      float pressureRidge = sin(aFlow * 1.15 - uTime * 1.9 * haste)
        * aGrade * uGradeRidges * 0.055;
      pos.y += (travellingFold + convectionRoll + pressureRidge) * bankWeight;
      vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
      vWorldPosition = worldPosition.xyz;
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `;

export const EMBER_RIVER_FRAGMENT_SHADER = /* glsl */ `
    uniform float uTime;
    uniform vec3 uBaseColor;
    uniform vec3 uHotColor;
    uniform vec3 uCrustColor;
    uniform vec3 uLeveeColor;
    uniform float uWarpIntensity;
    uniform float uCrustCoverage;
    uniform float uEdgeCooling;
    uniform float uBankRadiance;
    uniform float uMarginFraction;
    uniform float uThermalFalloff;
    uniform float uCrustGain;
    uniform float uGradeRidges;
    uniform float uSourceRadiance;
    uniform float uToeStart;
    varying float vCross;
    varying float vFlow;
    varying float vRun;
    varying float vGrade;
    varying vec3 vWorldPosition;
    #include <fog_pars_fragment>

    ${EMBER_RIVER_NOISE}

    void main() {
      // Derivatives are taken before any discard so the surviving fragments in a
      // quad never read a killed neighbour.
      vec3 surfaceNormal = normalize(cross(
        dFdx(vWorldPosition),
        dFdy(vWorldPosition)
      ));
      if (surfaceNormal.y < 0.0) surfaceNormal *= -1.0;
      float footprint = fwidth(vFlow);
      float lod = smoothstep(0.14, 1.3, footprint);

      float bank = abs(vCross);
      float side = vCross < 0.0 ? -1.0 : 1.0;

      // Where the chilled margin meets the molten channel, wandering on two
      // incommensurate world wavelengths: eleven-metre lobes and two-metre
      // scallops. The term this replaced ran on a lattice whose lateral period
      // matched the strip's column count, so its cells read as rectangular
      // bites out of the shore.
      float shoreLobe = fbm(vec2(vFlow * 0.091, side * 5.31 + 2.7));
      float shoreScallop = fbm(vec2(vFlow * 0.384, side * 11.13 + 41.0));
      float shoreContour = shoreLobe * 0.62 + shoreScallop * 0.38;

      // The toe is the last stretch before the tail: a spreading, crusting lobe
      // rather than the square chop the run used to end on mid-slope.
      float toe = smoothstep(uToeStart, 1.0, vRun);
      // Its downstream edge breaks on the same scallop noise as the shore, so
      // the lobe ends ragged instead of on the geometry's final row.
      float tipCut = 0.995 - (shoreScallop - 0.5) * 0.05;
      if (vRun > tipCut) discard;

      // Distance narrows the incandescent thread rather than letting the crust
      // pattern average out into one saturated band.
      float coolingReach = uEdgeCooling * mix(1.0, 1.34, lod);
      float shoreLine = 1.0 - coolingReach + (shoreContour - 0.5) * 0.46;
      float chill = smoothstep(shoreLine - 0.2, shoreLine + 0.3, bank);

      // The surface always terminates inside the margin the geometry reserved,
      // so its straight polygon edge is never the silhouette.
      float cut = 1.0 + uMarginFraction
        * (0.06 + 0.92 * (shoreScallop * 0.6 + shoreLobe * 0.4));
      if (bank > cut) discard;

      vec2 flowUv = vec2(vFlow * 0.199 - uTime * 0.22, vCross * 1.8);
      vec2 warp = vec2(
        fbm(flowUv * 0.78 + vec2(3.1, 7.7)),
        fbm(flowUv * 0.9 + vec2(11.2, 1.4))
      ) - 0.5;
      vec2 warpedUv = flowUv + warp * uWarpIntensity;

      // A reach is tens of metres long. Real channels skin over for a stretch
      // and tear open again at a bend; without that the ribbon reads as one
      // uniform band at every viewing distance.
      float reach = fbm(vec2(vFlow * 0.0281, 3.3));

      float broadFlow = fbm(warpedUv * vec2(0.24, 0.92));
      float plateField = fbm(warpedUv * vec2(0.72, 1.18) + vec2(uTime * 0.018, 0.0));
      // Crust accumulates downstream and piles up hard across the toe. Lowering
      // the threshold hands more of the plate field to the crust term, so the
      // terminus is visibly thicker-skinned than the source.
      float crustThreshold = 0.705
        - uCrustCoverage * 0.09
        + (reach - 0.5) * 0.13
        - chill * 0.1
        - vRun * uCrustGain
        - toe * 0.14;
      float crustEdge = mix(0.045, 0.15, lod);
      float crust = smoothstep(
        crustThreshold - crustEdge,
        crustThreshold + crustEdge * 0.8,
        plateField
      );
      float fracture = (1.0 - smoothstep(0.018, 0.058, abs(plateField - crustThreshold)))
        * (1.0 - lod * 0.75);

      float center = 1.0 - smoothstep(0.0, 1.0, bank);
      float heat = clamp(broadFlow * 0.82 + fbm(warpedUv * 0.46 + 8.3) * 0.18, 0.0, 1.0);
      float convectionCell = smoothstep(
        0.68,
        0.92,
        fbm(warpedUv * vec2(0.3, 0.74) + vec2(uTime * 0.035, 19.0))
      );

      // A skin forms and tears continuously over open lava. It carries the
      // internal value range that keeps the molten field from resolving to a
      // single saturated colour once the plates are too small to see.
      float skin = smoothstep(
        0.4,
        0.8,
        fbm(warpedUv * vec2(1.35, 2.1) + vec2(-uTime * 0.05, 63.0))
      );
      float skinDepth = skin * (0.42 + chill * 0.34) * (1.0 - lod * 0.45);

      vec3 molten = mix(
        uBaseColor,
        uHotColor,
        pow(heat, 1.85) * (0.22 + center * 0.38)
          + convectionCell * (0.06 + center * 0.06)
      );
      molten *= mix(1.0, 0.34, skinDepth);
      // Emission falls off across the channel: an axial thread with cooling
      // shoulders, not a slab held at one temperature edge to edge.
      molten *= mix(1.0, 0.2, chill) * (0.78 + reach * 0.4);
      // And along it. The source is the hottest point of the run and the toe is
      // the coolest, which is the whole reason a lava river reads as directional.
      float thermal = mix(1.0, uThermalFalloff, smoothstep(0.0, 1.0, vRun));
      molten *= thermal;

      vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
      vec3 skyDirection = normalize(vec3(-0.42, 0.82, 0.38));
      float coolSky = 0.68 + max(dot(surfaceNormal, skyDirection), 0.0) * 0.34;
      float crustFresnel = pow(
        1.0 - max(dot(surfaceNormal, viewDirection), 0.0),
        4.0
      );

      // Open channels raft dark crust downstream. Brightness survives in the
      // seams between plates. Their cooled faces still catch the cold sky, so
      // they read as moving slabs instead of holes punched into an orange map.
      vec3 cooledCrust = mix(
        uCrustColor,
        vec3(0.062, 0.068, 0.07),
        0.72
      ) * (0.76 + broadFlow * 0.22) * coolSky;
      cooledCrust += vec3(0.055, 0.072, 0.078)
        * crustFresnel
        * (0.12 + broadFlow * 0.08);
      vec3 color = mix(molten, cooledCrust, crust * 0.91);

      // Everything incandescent below is damped across the toe, so the lobe
      // keeps its shape without keeping the source's brightness.
      float open = (1.0 - chill) * thermal * (1.0 - toe * 0.72);
      color += uHotColor * fracture * (0.28 + center * 0.22) * open;
      float medialLead = smoothstep(0.72, 0.92, fbm(warpedUv * vec2(0.38, 0.76) + 13.4));
      float travellingLead = smoothstep(
        0.68,
        0.9,
        fbm(warpedUv * vec2(0.46, 0.82) + vec2(-uTime * 0.09, 27.0))
      );
      color += uHotColor * medialLead * pow(center, 2.4) * (1.0 - crust) * 0.18 * open;
      color += uHotColor * travellingLead * fracture * (0.08 + center * 0.1) * open;
      color += uHotColor
        * convectionCell
        * (1.0 - crust)
        * (0.028 + center * 0.035)
        * open;

      // Pressure ridges on the steep reaches catch light on their upstream
      // faces. The vertex stage lifts them; this is the same wave shading them.
      float pressure = max(sin(vFlow * 1.15 - uTime * 1.9), 0.0);
      color += uHotColor
        * pressure
        * vGrade
        * uGradeRidges
        * (1.0 - crust)
        * 0.07
        * open;

      // The breach at the head, and the first metres out of it, run hotter than
      // anything downstream. vRun is zero across the whole vent mouth, so the
      // same term serves both without a second material.
      float sourceHeat = pow(clamp(1.0 - vRun, 0.0, 1.0), 6.0);
      color += uHotColor
        * uSourceRadiance
        * sourceHeat
        * (0.18 + center * 0.42)
        * (1.0 - chill)
        * (1.0 - crust * 0.55);

      // Static levee: solid rock the channel is running between, not a painted
      // border. It carries the radiance the channel throws onto it, falling off
      // outward, which is what makes the shore read as a lit surface rather than
      // a cut edge.
      float leveeGrain = fbm(vec2(vFlow * 0.62, side * 7.7 + 19.0));
      vec3 levee = mix(uLeveeColor, vec3(0.032, 0.028, 0.026), 0.42)
        * (0.72 + leveeGrain * 0.5)
        * coolSky;
      // Radiance integrates over a stretch of channel, so it follows the
      // reach-scale openness rather than whichever plate happens to sit under
      // this fragment — and the levee is heavily crusted by definition.
      float openness = clamp(0.25 + reach * 0.75 + (broadFlow - 0.5) * 0.4, 0.0, 1.0)
        * thermal;
      float outward = clamp(
        (bank - shoreLine) / max(uMarginFraction + coolingReach, 0.001),
        0.0,
        1.0
      );
      float spill = uBankRadiance * openness * pow(1.0 - outward, 2.2);
      levee += uBaseColor * spill * 0.9 + uHotColor * spill * spill * 0.35;
      color = mix(color, levee, chill);

      // The contact itself is the brightest thing on the bank.
      float contactOffset = (bank - shoreLine) * 7.0;
      float contact = exp(-contactOffset * contactOffset);
      color += uHotColor
        * contact
        * openness
        * (0.1 + uBankRadiance * 0.16)
        * (1.0 - lod * 0.4);

      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `;

export const EMBER_RIVER_GLOW_VERTEX_SHADER = /* glsl */ `
    attribute float aCross;
    attribute float aFlow;
    attribute float aRun;
    varying float vCross;
    varying float vFlow;
    varying float vRun;
    #include <fog_pars_vertex>

    void main() {
      vCross = aCross;
      vFlow = aFlow;
      vRun = aRun;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `;

export const EMBER_RIVER_GLOW_FRAGMENT_SHADER = /* glsl */ `
    uniform float uTime;
    uniform vec3 uBaseColor;
    uniform vec3 uHotColor;
    uniform float uReach;
    uniform float uIntensity;
    uniform float uSoftness;
    uniform float uThermalFalloff;
    varying float vCross;
    varying float vFlow;
    varying float vRun;
    #include <fog_pars_fragment>

    ${EMBER_RIVER_NOISE}

    void main() {
      float bank = abs(vCross);
      // Nothing inside the channel: the ribbon is drawn over that ground, and
      // doubling the emission there would blow out the axial thread.
      float inner = smoothstep(0.7, 1.1, bank);
      float outer = pow(
        clamp((uReach - bank) / max(uReach - 1.0, 0.001), 0.0, 1.0),
        uSoftness
      );
      // Radiance on rough basalt is blotchy, not a clean falloff ramp.
      float grain = fbm(vec2(vFlow * 0.085, vCross * 0.85 + 4.2)) * 0.55 + 0.62;
      float breathe = 0.9 + 0.1 * sin(vFlow * 0.06 - uTime * 0.35);
      float thermal = mix(1.0, uThermalFalloff, smoothstep(0.0, 1.0, vRun));

      float strength = inner * outer * grain * breathe * thermal * uIntensity;
      vec3 color = mix(uBaseColor, uHotColor, 0.3 + 0.45 * outer) * strength;

      #ifdef USE_FOG
        // Additive geometry must fade toward black with distance. Mixing toward
        // fogColor the way the stock chunk does would ADD fog to the scene.
        #ifdef FOG_EXP2
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        #else
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        color *= 1.0 - fogFactor;
      #endif

      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

// Drawn only through InstancedMesh (ember-obsidian-pillars.ts). Each part is a
// unit-height geometry stretched by the instance matrix; aLength restores the
// geometry-local position the vein and pulse patterns were tuned against.
export const EMBER_PILLAR_VERTEX_SHADER = /* glsl */ `
    attribute float aSeed;
    attribute float aLength;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    // flat: the hash amplifies any interpolation error in the seed into noise.
    flat varying float vSeed;
    void main() {
      vPosition = vec3(position.x, position.y * aLength, position.z);
      // Inverse-transpose of an instance matrix built from rotation and
      // per-axis scale, as three's defaultnormal_vertex does it.
      mat3 im = mat3(instanceMatrix);
      vec3 objectNormal = normal / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
      vNormal = normalize(normalMatrix * (im * objectNormal));
      vUv = uv;
      vSeed = aSeed;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `;

export const EMBER_PILLAR_FRAGMENT_SHADER = /* glsl */ `
    uniform vec3 uBaseColor;
    uniform vec3 uVeinColor;
    uniform float uVeinIntensity;
    uniform float uTime;
    uniform float uPulseSpeed;
    uniform vec3 uPulseColor;

    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    flat varying float vSeed;

    float hash(vec2 p) {
      return fract(sin(dot(p + vSeed, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main() {
      // Vertical vein pattern using position + UV
      vec2 veinUv = vec2(vUv.x * 8.0 + vSeed, vPosition.y * 3.0);
      float n1 = noise(veinUv * 2.0);
      float n2 = noise(veinUv * 4.0 + 50.0);
      float veinPattern = n1 * 0.6 + n2 * 0.4;

      // Thin bright veins
      float vein = smoothstep(0.55, 0.62, veinPattern);

      // Wider glow around veins
      float glow = smoothstep(0.45, 0.65, veinPattern) * 0.3;

      // Veins brighten toward base (heat from below)
      float heightFade = 1.0 - smoothstep(0.0, 0.8, vUv.y);
      float veinStrength = (vein + glow) * heightFade * uVeinIntensity;

      // Upward-traveling pulse wave
      float pulseWave = sin(vPosition.y * 3.0 - uTime * uPulseSpeed * 6.0) * 0.5 + 0.5;
      pulseWave = pow(pulseWave, 4.0); // sharpen the wave

      // Amplify vein brightness during pulse
      float pulsedVeinStrength = veinStrength * (1.0 + pulseWave * 2.0);

      // Faceted crystal shading
      float facetShade = abs(dot(vNormal, vec3(0.3, 0.8, 0.4)));
      vec3 baseShaded = uBaseColor * (0.4 + facetShade * 0.6);

      vec3 finalColor = mix(baseShaded, uVeinColor * 2.0, pulsedVeinStrength);

      // Mix in pulse color at peak
      finalColor = mix(finalColor, uPulseColor * 3.0, vein * pulseWave * heightFade * 0.5);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

export const EMBER_PLATFORM_VERTEX_SHADER = /* glsl */ `
    varying vec2 vUv;
    varying vec2 vWorldXZ;
    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldXZ = worldPos.xz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

export const EMBER_PLATFORM_FRAGMENT_SHADER = /* glsl */ `
    uniform float uTime;
    uniform vec3 uPrimaryColor;
    uniform float uGlowIntensity;
    uniform float uCrackIntensity;
    uniform float uLavaSpeed;
    uniform float uEmbedded;
    varying vec2 vUv;
    varying vec2 vWorldXZ;

    // --- Hash for voronoi cell jitter ---
    vec2 hash2(vec2 p) {
      return fract(sin(vec2(
        dot(p, vec2(127.1, 311.7)),
        dot(p, vec2(269.5, 183.3))
      )) * 43758.5453);
    }

    // --- Voronoi: returns (F1, F2) distances for crack extraction ---
    vec2 voronoi(vec2 p) {
      vec2 n = floor(p);
      vec2 f = fract(p);
      float f1 = 8.0;
      float f2 = 8.0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = hash2(n + g);
          // Slight time-driven drift so cracks feel alive
          o = 0.5 + 0.4 * sin(uTime * 0.08 + 6.2831 * o);
          vec2 r = g + o - f;
          float d = dot(r, r);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) {
            f2 = d;
          }
        }
      }
      return vec2(sqrt(f1), sqrt(f2));
    }

    // --- Simple value noise for surface detail ---
    float hash1(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash1(i), hash1(i + vec2(1.0, 0.0)), f.x),
        mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * vnoise(p);
        p = p * 2.0 + vec2(17.0, 31.0);
        a *= 0.5;
      }
      return v;
    }

    void main() {
      // Centered UV for radial calculations
      vec2 centeredUv = (vUv - 0.5) * 2.0;
      float dist = length(centeredUv);

      // Scale UV for voronoi pattern
      vec2 voronoiUv = centeredUv * 4.5;

      // Primary crack network
      vec2 v1 = voronoi(voronoiUv);
      float crackEdge1 = v1.y - v1.x;

      // Secondary finer crack network at different scale
      vec2 v2 = voronoi(voronoiUv * 2.1 + vec2(73.0, 41.0));
      float crackEdge2 = v2.y - v2.x;

      // Tertiary micro-cracks for detail
      vec2 v3 = voronoi(voronoiUv * 4.7 + vec2(150.0, 200.0));
      float crackEdge3 = v3.y - v3.x;

      // Crack lines — thresholded from cell boundary distance
      float crack1 = 1.0 - smoothstep(0.0, 0.07, crackEdge1);
      float crack2 = 1.0 - smoothstep(0.0, 0.05, crackEdge2);
      float crack3 = 1.0 - smoothstep(0.0, 0.03, crackEdge3);

      // Wider glow halo around primary cracks
      float crackGlow1 = 1.0 - smoothstep(0.0, 0.22, crackEdge1);
      float crackGlow2 = 1.0 - smoothstep(0.0, 0.15, crackEdge2);

      // Combine crack layers — primary dominates, finer adds texture
      float combinedCrack = crack1 + crack2 * 0.5 + crack3 * 0.2;
      combinedCrack = clamp(combinedCrack, 0.0, 1.0);

      float combinedGlow = crackGlow1 + crackGlow2 * 0.4;
      combinedGlow = clamp(combinedGlow, 0.0, 1.0);

      // --- Lava pulse animation ---
      float slowPulse = sin(uTime * uLavaSpeed * 1.5) * 0.5 + 0.5;
      slowPulse = mix(0.6, 1.0, slowPulse);

      // Traveling wave that radiates outward
      float wave = sin(dist * 6.0 - uTime * uLavaSpeed * 2.5) * 0.5 + 0.5;
      wave = pow(wave, 2.0);

      float lavaIntensity = slowPulse * (1.0 + wave * 0.4) * uCrackIntensity;

      // --- Downstage brightness boost ---
      // +Z is downstage in the scene; vUv.y maps to this after rotation
      // centeredUv.y > 0 corresponds to +Z (downstage)
      float downstageFactor = 1.0 + smoothstep(-0.2, 0.8, centeredUv.y) * 0.5;

      // --- Lava color ---
      vec3 lavaColorCore = vec3(1.0, 0.35, 0.05);  // bright orange
      vec3 lavaColorHot  = vec3(1.0, 0.7, 0.2);    // yellow-hot
      vec3 lavaColorDim  = vec3(0.8, 0.15, 0.02);   // deep red ember

      // Mix lava color based on crack intensity — hottest at crack center
      vec3 lavaColor = mix(lavaColorDim, lavaColorCore, combinedCrack);
      lavaColor = mix(lavaColor, lavaColorHot, combinedCrack * combinedCrack);

      // --- Obsidian base surface ---
      // Subtle surface variation via fbm
      float surfaceNoise = fbm(voronoiUv * 1.5 + vec2(50.0)) * 0.15;
      vec3 obsidianBase = uPrimaryColor * (0.85 + surfaceNoise);

      // Glassy highlight bands — obsidian has a vitreous luster
      float glassHighlight = fbm(voronoiUv * 3.0 + vec2(uTime * 0.02, 0.0));
      glassHighlight = smoothstep(0.55, 0.7, glassHighlight) * mix(0.08, 0.004, uEmbedded);
      obsidianBase += vec3(glassHighlight);

      // --- Composite: obsidian base + lava in cracks ---
      // Crack contribution with pulse, downstage boost, and glow intensity
      float crackEmission = (combinedCrack * 1.2 + combinedGlow * 0.3)
                            * lavaIntensity
                            * downstageFactor
                            * uGlowIntensity;

      vec3 finalColor = obsidianBase;
      finalColor += lavaColor * crackEmission;

      // Subsurface glow: faint lava light bleeds through obsidian near cracks
      float subsurface = combinedGlow * 0.15 * lavaIntensity * uGlowIntensity;
      finalColor += lavaColorDim * subsurface;

      // --- Edge heat shimmer ---
      float rimZone = smoothstep(0.5, 0.9, dist);
      vec3 rimColor = vec3(1.0, 0.4, 0.1) * rimZone * uGlowIntensity * 0.25;
      // Rim flickers with noise
      float rimFlicker = vnoise(centeredUv * 8.0 + uTime * 0.5) * 0.5 + 0.5;
      rimColor *= rimFlicker;
      finalColor += rimColor;

      // --- Hard edge clip for hex shape ---
      // CircleGeometry handles shape, but soften the very edge slightly
      float edgeSoften = 1.0 - smoothstep(0.88, 1.0, dist);
      finalColor *= mix(edgeSoften, 1.0, uEmbedded);
      float alpha = mix(1.0, 1.0 - smoothstep(0.82, 1.0, dist), uEmbedded);

      gl_FragColor = vec4(finalColor, alpha);
    }
  `;

export const EMBER_HEAT_VERTEX_SHADER = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    uniform float uTime;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);

      vec3 pos = position;
      float wave = sin(pos.y * 3.0 + uTime * 2.0 + pos.x * 1.5) * 0.15
                 + sin(pos.y * 5.0 + uTime * 3.5 - pos.z * 2.0) * 0.08
                 + sin(pos.y * 8.0 + uTime * 1.8 + pos.x * 3.0) * 0.04;
      pos.x += wave * normal.x;
      pos.z += wave * normal.z;

      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      vViewDir = normalize(-mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `;

export const EMBER_HEAT_FRAGMENT_SHADER = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    uniform float uTime;
    uniform float uIntensity;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main() {
      // Softer fresnel — visible at grazing angles but not a hard ring
      float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
      fresnel = pow(fresnel, 2.0);

      // Rising shimmer — turbulent, not streaky
      float n1 = noise(vec2(vUv.x * 8.0 + uTime * 0.3, vUv.y * 12.0 - uTime * 1.5));
      float n2 = noise(vec2(vUv.x * 4.0 + 7.0, vUv.y * 20.0 - uTime * 2.0));
      float n3 = noise(vec2(vUv.x * 12.0 - uTime * 0.5, vUv.y * 6.0 - uTime * 0.7));
      float shimmer = n1 * n2 + n3 * 0.15;
      shimmer = pow(clamp(shimmer, 0.0, 1.0), 2.0);

      // Aggressive bottom fade — no ground bleed; gentle top fade
      float vertFade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.75, vUv.y);

      // Warm color — hotter at base, pale at top
      vec3 color = mix(vec3(1.0, 0.35, 0.08), vec3(0.9, 0.7, 0.5), vUv.y);

      float alpha = fresnel * shimmer * vertFade * uIntensity;

      gl_FragColor = vec4(color * alpha, alpha);
    }
  `;

export const EMBER_WISP_VERTEX_SHADER = /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `;

export const EMBER_WISP_FRAGMENT_SHADER = /* glsl */ `
    uniform vec3 uColor;
    uniform float uIntensity;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
      float rim = pow(fresnel, 2.0) * 1.5;
      float core = pow(1.0 - fresnel, 3.0) * 2.0;
      float glow = rim + core;
      vec3 color = uColor * glow * uIntensity;
      float alpha = clamp(glow * 0.8, 0.0, 1.0);
      gl_FragColor = vec4(color, alpha);
    }
  `;

export const EMBER_FOUNTAIN_VERTEX_SHADER = /* glsl */ `
    attribute float aSize;
    attribute float aAlpha;
    attribute float aColorIndex;
    varying float vAlpha;
    varying float vColorIndex;
    void main() {
      vAlpha = aAlpha;
      vColorIndex = aColorIndex;
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (1000.0 / -mvPos.z);
      gl_Position = projectionMatrix * mvPos;
    }
  `;

export const EMBER_FOUNTAIN_FRAGMENT_SHADER = /* glsl */ `
    uniform vec3 uColors[4];
    varying float vAlpha;
    varying float vColorIndex;
    void main() {
      float dist = length(gl_PointCoord - 0.5);
      float glow = 1.0 - smoothstep(0.0, 0.5, dist);
      if (glow < 0.01) discard;
      int idx = int(floor(vColorIndex));
      vec3 color = uColors[min(idx, 3)];
      float core = 1.0 - smoothstep(0.0, 0.2, dist);
      vec3 finalColor = mix(color, color * 3.0, core);
      gl_FragColor = vec4(finalColor, glow * vAlpha);
    }
  `;

export const EMBER_HAZE_VERTEX_SHADER = /* glsl */ `
    varying vec3 vHazeDirection;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vHazeDirection = position;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

export const EMBER_HAZE_FRAGMENT_SHADER = /* glsl */ `
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform float uOpacity;
    uniform float uScale;
    uniform float uTime;
    uniform float uFlashEnergy;
    uniform vec3 uFlashCell;
    uniform float uLightningIntensity;
    uniform vec3 uInnerGlowColor;
    uniform vec3 uUnderglowColor;
    uniform vec2 uUnderglowBearing;
    uniform float uUnderglowStrength;
    uniform float uUnderglowFocus;
    uniform float uUnderglowWrap;
    varying vec3 vHazeDirection;

    // 3D Simplex noise implementation
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    void main() {
      vec3 dir = normalize(vHazeDirection);

      // === Multi-layer parallax ===
      // Layer 1: slow-moving deep clouds
      vec3 samplePos1 = dir * uScale + vec3(uTime * 0.06, 0.0, uTime * 0.03);
      float n1 = snoise(samplePos1 * 1.0) * 0.5 + 0.5;

      // Layer 2: faster mid-level detail
      vec3 samplePos2 = dir * uScale * 1.8 + vec3(uTime * 0.12, uTime * 0.02, uTime * 0.08);
      float n2 = snoise(samplePos2 * 1.5) * 0.5 + 0.5;

      // Layer 3: fine turbulence overlay
      vec3 samplePos3 = dir * uScale * 3.0 + vec3(-uTime * 0.04, uTime * 0.06, -uTime * 0.03);
      float n3 = snoise(samplePos3 * 2.5) * 0.5 + 0.5;

      // Combine with depth-weighted blending
      float combined = n1 * 0.5 + n2 * 0.35 + n3 * 0.15;
      combined = pow(combined, 1.25);

      // One eye-level profile shared by the wash, the cloud dissolve and the
      // underglow. Two lobes: a broad one that fills the low sky and a tighter
      // one that keeps the horizon itself the brightest part of the band. A
      // single lobe either smears the glow up the dome or draws a hard line
      // across it.
      float band = exp(-pow(abs(dir.y) * 3.1, 1.5)) * 0.62
        + exp(-pow(abs(dir.y) * 9.0, 1.6)) * 0.38;

      float lowAtmosphere = smoothstep(0.34, -0.32, dir.y);
      vec3 color = mix(uColor2, uColor1, lowAtmosphere * (0.5 + n2 * 0.32));

      // === Volcanic hemisphere glow ===
      // Lit from below — bottom hemisphere glows warmly
      float bottomGlow = smoothstep(0.1, -0.6, dir.y);
      // The dome has to carry the upper half of the frame, so cloud bodies
      // reach well past eye level before they fade out.
      float topFade = smoothstep(0.72, -0.28, dir.y);
      // Cut visible cloud bodies out of the noise instead of tinting the whole
      // dome evenly. Three averaged noise layers land near 0.42 with a spread
      // of roughly 0.1, so the band has to sit across that distribution or the
      // dome resolves to nothing at all. Across the horizon band the cut
      // dissolves back into the field: a hard-edged blob sitting on a ridgeline
      // is what made the glow read as pooled paint rather than lit air.
      float cloudBody = smoothstep(0.24, 0.64, combined);
      cloudBody = mix(cloudBody, 0.28 + combined * 0.36, band);
      float strata = 0.84 + snoise(
        vec3(dir.x * 7.0, dir.y * 1.4, dir.z * 7.0)
          + vec3(uTime * 0.018)
      ) * 0.16;
      float alpha = cloudBody * strata * uOpacity * topFade;

      // Horizon boost — volcanic glow at eye level
      float horizonBoost = band * 0.44;
      alpha += horizonBoost * uOpacity * (0.84 + combined * 0.16);

      // Warm underglow
      color = mix(color, vec3(0.46, 0.11, 0.015), bottomGlow * 0.42);

      // === Caldera underglow ===
      // A distant vent lights the low haze from one bearing. Without this the
      // dome is an even ring at eye level and the sky carries no direction.
      if (uUnderglowStrength > 0.0) {
        vec2 flatDir = vec2(dir.x, dir.z);
        float flatLength = length(flatDir);
        float bearing = flatLength > 0.0001
          ? dot(flatDir / flatLength, uUnderglowBearing) * 0.5 + 0.5
          : 0.5;
        // pow() is undefined for a negative base; rounding can push the dot
        // product a hair past -1.
        float lobe = pow(clamp(bearing, 0.0, 1.0), uUnderglowFocus);
        // The caldera lobe rides on a floor that reaches every bearing. With no
        // floor the half of the sky facing away from the vent received nothing
        // at all, which is what left the sky above the terminus a void.
        float lateral = mix(uUnderglowWrap, 1.0, lobe);
        float vertical = exp(-pow(max(dir.y, 0.0) * 3.2, 1.3)) * (0.62 + band * 0.38);
        // Light caught in layered haze still varies, but only enough to break
        // the gradient. Heavier noise here is what pooled the glow into blobs.
        float underglow = lateral * vertical * uUnderglowStrength
          * (0.82 + combined * 0.36);
        color += uUnderglowColor * underglow;
        alpha = clamp(alpha + underglow * 0.5, 0.0, 1.0);
      }

      // === Lightning flashes ===
      // The envelope is sampled on the CPU in real seconds; the dome only
      // decides where the flash sits.
      float flash = uFlashEnergy * uLightningIntensity;
      if (flash > 0.0) {
        float flashNoise = snoise(dir * 1.9 + uFlashCell);
        flash *= smoothstep(-0.25, 0.35, flashNoise);
      }

      color += uInnerGlowColor * flash;
      alpha = clamp(alpha + flash * 0.3, 0.0, 1.0);

      gl_FragColor = vec4(color, alpha);
    }
  `;

export const EMBER_PLUME_VERTEX_SHADER = /* glsl */ `
    attribute float size;
    attribute float alpha;
    attribute float rotation;
    attribute float seed;
    attribute vec3 puffColor;

    uniform float uMinPointSize;
    uniform float uMaxPointSize;
    uniform float uFogDensity;
    uniform vec3 uFogColor;

    varying float vAlpha;
    varying float vRotation;
    varying float vSeed;
    varying vec3 vColor;

    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      float dist = max(-mvPosition.z, 0.001);
      float projected = size * (1000.0 / dist);
      gl_PointSize = clamp(projected, uMinPointSize, uMaxPointSize);

      // A point below the driver's size floor is still rasterised a whole pixel
      // wide, so its coverage has to come off the alpha or a far puff reads as
      // a hot speck instead of a wisp.
      float subPixel = clamp(projected / uMinPointSize, 0.0, 1.0);

      float depth = uFogDensity * dist;
      float fog = 1.0 - exp(-depth * depth);
      vColor = mix(puffColor, uFogColor, fog);
      vAlpha = alpha * subPixel * (1.0 - fog * 0.55);

      vRotation = rotation;
      vSeed = seed;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

export const EMBER_PLUME_FRAGMENT_SHADER = /* glsl */ `
    precision mediump float;

    varying float vAlpha;
    varying float vRotation;
    varying float vSeed;
    varying vec3 vColor;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    void main() {
      vec2 centered = gl_PointCoord - 0.5;
      float c = cos(vRotation);
      float s = sin(vRotation);
      vec2 p = vec2(centered.x * c - centered.y * s, centered.x * s + centered.y * c);

      float r = length(p);
      float a = atan(p.y, p.x);

      // Three harmonics phased off the puff's own seed. No two puffs share a
      // silhouette, so a column never reads as one stamp repeated up its height.
      float phase = vSeed * 6.2831853;
      float edge = 0.44
        + 0.070 * sin(a * 3.0 + phase)
        + 0.045 * sin(a * 5.0 - phase * 1.7)
        + 0.028 * sin(a * 8.0 + phase * 2.3);

      float body = 1.0 - smoothstep(edge * 0.40, edge, r);
      if (body <= 0.0) discard;

      // Entrained air curdles a real puff into cells. Without the mottling a
      // soft-edged disc still reads as a bubble however ragged its outline is.
      vec2 np = p * 5.6 + vec2(vSeed * 31.0, vSeed * 17.0);
      float mottle = valueNoise(np) * 0.62 + valueNoise(np * 2.3) * 0.38;
      body = clamp(body * (0.40 + 0.76 * mottle), 0.0, 1.0);

      float alpha = body * vAlpha;
      if (alpha < 0.004) discard;

      gl_FragColor = vec4(vColor, alpha);
    }
  `;
