#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_blurred;
uniform vec2 u_viewport;
uniform float u_dpr;
uniform vec4 u_rect;
uniform float u_radius;
uniform float u_roundness;
uniform vec3 u_lens;
uniform vec2 u_light;
uniform float u_opacity;
uniform vec4 u_tint;
uniform float u_press;
uniform float u_vibrancy;
uniform float u_blurMix;
uniform float u_highlightWidth;
uniform vec2 u_pressPosition;
out vec4 color;

float distanceToShape(vec2 p, float radius) {
  vec2 q = abs(p) - u_rect.zw * 0.5 + radius;
  vec2 corner = max(q, 0.0);
  // A superellipse joins the straight segments with smooth curvature when the
  // browser supports matching CSS corner-shape. Circular fallback uses n=2.
  float rounded = pow(pow(corner.x, u_roundness) + pow(corner.y, u_roundness), 1.0 / u_roundness);
  return rounded + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  vec2 screen = vec2(gl_FragCoord.x / u_dpr, u_viewport.y - gl_FragCoord.y / u_dpr);
  vec2 p = screen - u_rect.xy - u_rect.zw * 0.5;
  float sdf = distanceToShape(p, u_radius);
  float aa = max(fwidth(sdf), 0.5 / u_dpr);
  float coverage = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, sdf);
  if (coverage <= 0.0) discard;
  float inside = max(-sdf, 0.0);
  float gradRadius = min(u_radius * 1.5, min(u_rect.z, u_rect.w) * 0.5);
  float epsilon = 0.5 / u_dpr;
  vec2 gradient = vec2(
    distanceToShape(p + vec2(epsilon, 0.0), gradRadius) - distanceToShape(p - vec2(epsilon, 0.0), gradRadius),
    distanceToShape(p + vec2(0.0, epsilon), gradRadius) - distanceToShape(p - vec2(0.0, epsilon), gradRadius)
  );
  vec2 normal = gradient / max(length(gradient), 0.00001);
  vec2 radial = p / max(length(p), 0.00001);
  vec2 lensNormal = normal + u_lens.z * radial;
  lensNormal /= max(length(lensNormal), 0.00001);

  // AndroidLiquidGlass's circular edge-height profile, expressed in CSS pixels:
  // h = 1 - sqrt(1 - x*x), refractionHeight / refractionAmount are independent.
  float x = clamp(1.0 - inside / max(u_lens.x, 0.001), 0.0, 1.0);
  float cosTheta = sqrt(max(1.0 - x * x, 0.0));
  vec2 lens = -lensNormal * (1.0 - cosTheta) * u_lens.y;
  vec2 uv = (screen + lens) / u_viewport;
  uv.y = 1.0 - uv.y;
  vec2 dispersion = vec2(lens.x, -lens.y) / u_viewport * 0.018;
  vec3 sharp = vec3(texture(u_scene, uv + dispersion).r,
                    texture(u_scene, uv).g,
                    texture(u_scene, uv - dispersion).b);
  sharp = clamp(mix(vec3(dot(sharp, vec3(0.2126, 0.7152, 0.0722))), sharp, u_vibrancy), 0.0, 1.0);
  vec3 soft = texture(u_blurred, uv).rgb;
  // Preserve the sharp refracted rim; mix some original detail into the center
  // for the clearer material preset instead of transitioning to 100% blur.
  vec3 glass = mix(sharp, soft, smoothstep(0.0, u_lens.x, inside) * u_blurMix);
  glass = mix(glass, u_tint.rgb, u_tint.a);
  float fresnel = 0.04 + 0.96 * pow(1.0 - cosTheta, 5.0);
  vec2 lightDirection = normalize(vec2(-0.7, -0.7) + (u_light - 0.5) * 0.65);
  float lit = pow(max(dot(normal, lightDirection), 0.0), 2.0);
  float opposite = pow(max(dot(normal, -lightDirection), 0.0), 2.0) * 0.24;
  float rim = exp(-inside / 0.9);
  float glow = exp(-inside / 5.0);
  float shade = glow * pow(max(dot(normal, -lightDirection), 0.0), 3.0) * 0.045;
  if (u_highlightWidth > 0.0) {
    // DefaultHighlight: one clipped, softly blurred outline, directional white
    // at alpha 0.5 with falloff=1 and additive blending. This is independent of
    // Studio's broader card Fresnel / glare material.
    float stroke = 1.0 - smoothstep(u_highlightWidth - 0.25, u_highlightWidth + 0.25, inside);
    float direction = abs(dot(normal, vec2(0.70710678)));
    glass += vec3(0.5 * direction * stroke);
  } else {
    glass *= 1.0 - shade;
    glass = mix(glass, vec3(1.0), clamp(fresnel * 0.24 + rim * (0.12 + lit * 0.6 + opposite), 0.0, 1.0));
    glass += glow * lit * 0.025;
  }
  float pressSpot = 1.0 - smoothstep(0.0, min(u_rect.z, u_rect.w) * 1.5, distance(screen, u_pressPosition));
  glass = mix(glass, vec3(1.0), u_press * (0.08 + pressSpot * 0.15));
  color = vec4(clamp(glass, 0.0, 1.0), coverage * u_opacity);
}
