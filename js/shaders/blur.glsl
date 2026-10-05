#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_step;
uniform float u_weights[64];
uniform float u_offsets[64];
uniform int u_count;
uniform float u_vibrancy;
out vec4 color;
vec3 sampleColor(vec2 uv) {
  vec3 c = texture(u_texture, uv).rgb;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return clamp(mix(vec3(luma), c, u_vibrancy), 0.0, 1.0);
}
void main() {
  // Pair adjacent native texels using bilinear filtering. Unlike a stretched
  // five-tap kernel, this integrates every texel in the Gaussian support.
  vec3 c = sampleColor(v_uv) * u_weights[0];
  for (int i = 1; i < 64; i++) {
    if (i >= u_count) break;
    vec2 offset = u_step * u_offsets[i];
    c += (sampleColor(v_uv + offset) + sampleColor(v_uv - offset)) * u_weights[i];
  }
  color = vec4(c, 1.0);
}
