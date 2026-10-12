// Smoke-owned passes. The shared fluid solver keeps closed walls for Fire, so
// Smoke thins itself near the pane edges instead: a plume that reaches the top
// leaves the frame rather than pooling against the wall and spreading sideways.
export const SMOKE_EDGE_SPONGE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_source;
uniform float u_dt;
uniform float u_rate;
uniform float u_sideBand;
uniform float u_topBand;

void main() {
  float side = min(min(v_uv.x, 1.0 - v_uv.x), v_uv.y);
  float sideWeight = 1.0 - smoothstep(0.0, u_sideBand, side);
  float topWeight = 1.0 - smoothstep(0.0, u_topBand, 1.0 - v_uv.y);
  float weight = max(sideWeight * sideWeight, topWeight * topWeight);
  fragColor = texture(u_source, v_uv) * exp(-u_rate * weight * u_dt);
}
`;

// Lit smoke. Density is marched toward a light above the performer so thick
// folds fall into their own shadow and thin wisps catch a bright rim, the same
// optics the 3D volume uses. Opacity is capped so the props always read
// through the smoke.
export const SMOKE_DISPLAY_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_density;
uniform sampler2D u_temperature;
uniform vec3 u_coreColor;
uniform vec3 u_edgeColor;
uniform float u_intensity;
uniform float u_time;
uniform float u_hueShift;
uniform vec2 u_texelSize;

const vec2 LIGHT_DIR = vec2(-0.38, 0.92);
const float MAX_ALPHA = 0.84;

vec3 rotateHue(vec3 color, float angle) {
  const mat3 toYiq = mat3(
    0.299, 0.587, 0.114,
    0.596, -0.274, -0.322,
    0.211, -0.523, 0.312
  );
  const mat3 toRgb = mat3(
    1.0, 0.956, 0.621,
    1.0, -0.272, -0.647,
    1.0, -1.106, 1.703
  );
  vec3 yiq = toYiq * color;
  float hue = atan(yiq.z, yiq.y) + angle;
  float chroma = length(yiq.yz);
  return clamp(toRgb * vec3(yiq.x, chroma * cos(hue), chroma * sin(hue)), 0.0, 1.0);
}

float sampleDensity(vec2 uv) {
  return max(texture(u_density, uv).r, 0.0);
}

void main() {
  float density = sampleDensity(v_uv);
  float temperature = max(texture(u_temperature, v_uv).r, 0.0);
  float opticalDepth = density * (1.15 + 1.5 * u_intensity);
  float alpha = (1.0 - exp(-opticalDepth)) * MAX_ALPHA;

  vec2 edge = min(v_uv, 1.0 - v_uv);
  alpha *= smoothstep(0.0, 0.06, min(edge.x, edge.y));
  if (alpha < 0.002) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 lightStep = LIGHT_DIR * u_texelSize * 2.6;
  float towardLight = 0.0;
  for (int i = 1; i <= 5; i++) {
    towardLight += sampleDensity(v_uv + lightStep * float(i));
  }
  float selfShadow = exp(-towardLight * 0.62);

  vec2 dx = vec2(u_texelSize.x * 3.0, 0.0);
  vec2 dy = vec2(0.0, u_texelSize.y * 3.0);
  vec2 gradient = vec2(
    sampleDensity(v_uv + dx) - sampleDensity(v_uv - dx),
    sampleDensity(v_uv + dy) - sampleDensity(v_uv - dy)
  );
  vec3 normal = normalize(vec3(-gradient * 1.6, 1.0));
  float facing = clamp(dot(normal, normalize(vec3(LIGHT_DIR, 0.75))), 0.0, 1.0);

  float interior = smoothstep(0.04, 0.9, density);
  float warmInterior = smoothstep(0.0, 0.8, temperature);
  vec3 base = mix(u_edgeColor, u_coreColor, interior * 0.7 + warmInterior * 0.3);
  base = mix(base, rotateHue(base, sin(u_time * 0.72) * 0.34), u_hueShift);

  float light = selfShadow * (0.55 + 0.45 * facing);
  vec3 shade = mix(base * vec3(0.34, 0.35, 0.4), base * 1.14, light);
  float rim = (1.0 - interior) * sqrt(selfShadow) * smoothstep(0.0, 0.5, facing);
  vec3 color = shade + u_edgeColor * rim * 0.32;
  color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
  fragColor = vec4(color * alpha, alpha);
}
`;
