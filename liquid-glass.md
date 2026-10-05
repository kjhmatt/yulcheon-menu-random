# Liquid Glass on the web

`js/liquid-glass.js` renders the card and all its action buttons, plus the compass
and GitHub capsule. Text, icons, focus, clicks and links remain native HTML.
The controls use capsule shapes, system blue, neutral secondary surfaces,
restrained typography and a spring press response.

Destination map bubbles share the WebGL renderer with 50% white tint for dense
translucency, edge refraction and a single Fresnel highlight without an extra CSS
border. MapLibre retains marker positioning; the DOM content lives above the
glass canvas. The CSS fallback uses the same tint and a blur.
The marker's CSS fill remains until that individual surface has rendered; the
page-wide WebGL state alone never removes its background.
The font family explicitly overrides MapLibre's default font; Pretendard is also first in the
site's font stack. Name and walking time share the same size and line height;
the pin uses SVG to avoid emoji baseline differences.

## Rendering and reference correspondence

1. **Bounded-resolution backdrop.** Composite the actual emoji and map canvases
   at up to 1.5 device pixels per CSS pixel. This bounds texture memory and
   bandwidth on high-DPR phones while DOM content and the map remain at their
   native resolution. Capture the map in its `render` event and retain a
   snapshot; later frames never read a discarded WebGL drawing buffer. Continuous
   backdrop capture is limited to 30 fps; forced resize and marker updates remain
   immediate.
2. **Vibrancy → blur → lens.** Apply 1.5 saturation before a separable Gaussian
   blur. Kernel weights depend on device pixels, and paired bilinear samples
   integrate adjacent texels. All source and framebuffer textures use the same
   bounded glass resolution. Scissoring limits work to regions around the controls.
3. **Edge height and displacement.** Match the Android reference's circular
   lens profile, `1 - sqrt(1 - x²)`. Card edge height/displacement are 24/36 CSS
   pixels, with a slight depth effect; capsule controls use 12/18. Displacement
   is 25% lower than the reference's 24/48 sheet and 12/24 button examples for
   gentler edge bending. Lens height and displacement remain independent.
4. **Surface shape and reflection.** A signed distance field follows the DOM
   bounds. `fwidth` supplies device-pixel antialiasing. Where CSS `corner-shape`
   is supported, both DOM and shader use the same superellipse exponent for
   continuous corner curvature; other browsers use matching circular corners.
   A sharp refracted rim blends into the center, following Studio's rendering
   approach. The balanced local card preset uses a 3 CSS-pixel Gaussian sigma
   and mixes 77.5% blurred / 22.5% sharp detail at the center. White tint is 11%
   on the opening card and 32% on the result card. Result action buttons use 56%
   white tint for text contrast over the map; other neutral controls use 19%.
   These clarity settings are product choices, not a claim of Apple defaults.
   Restrained RGB dispersion, Fresnel reflection and
   directional highlights complete the card surface. Capsule controls use the
   Android reference's default 0.5dp clipped outline with a 0.25dp soft edge,
   45-degree directional intensity and additive white at alpha 0.5. Controls
   have no CSS inset shadow or additional Studio Fresnel band.
5. **Glass on glass.** Render finished outer surfaces into an exported backdrop,
   excluding DOM content and child controls. Blur that export by 2 CSS pixels,
   then render the child buttons against it. No render pass reads its own output.
   This follows the Backdrop docs' `exportedBackdrop` pattern.
6. **Interaction.** A damped spring expands a pressed capsule by approximately
   4 CSS pixels in height and adds a localized highlight. A small bounded drag
   displacement follows the pointer. DOM and shader follow the same transform.

DOM transforms and press interactions can follow the display refresh rate, while
the Liquid Glass backdrop is captured at up to 30 fps. Static map views stop
drawing after transitions, tile loading and interaction settle. Hidden documents
stop drawing. Reduced motion freezes emoji particles and removes press scaling
and springs. Device ratio changes (including browser zoom) reallocate the
textures, capped at DPR 1.5 and the GPU's maximum texture size.

CSS `backdrop-filter` is the fallback for unavailable WebGL2, shader or texture
errors, and context loss. Context restoration recreates GPU resources. The
`.webgl-glass` class is applied only after a successful rendered frame.

Shaders live in `js/shaders/{vertex,copy,blur,glass}.glsl`, separate from GPU
resource management in `js/liquid-glass.js`. They load together asynchronously
from URLs relative to the script, including on subdirectory deployments. CSS
glass remains active during loading and if a shader request fails. Serve the
project over HTTP so the browser can fetch the shader files.
The CSS card fallback also uses a 3px blur and matching white tint, though CSS cannot
reproduce the shader's sharp/blurred blend or edge displacement.

## What was corrected

The first version reduced the **original** backdrop to 0.65 CSS-pixel resolution.
That degraded the sharp refraction and edge antialiasing. Its stretched five-tap
blur skipped intervening texels and could produce banding on map details. The
edge displacement was also too weak, and the inner buttons still used the
original green/yellow CSS styles.

The 0.65-resolution shortcut has been removed. A bounded DPR 1.5 source, dense
Gaussian kernel, the reference's edge profile, exported parent surfaces and
glass capsule controls replace it.

## Limits

- WebGL cannot directly sample arbitrary HTML. DOM map markers, attribution and
  labels outside the map canvas are absent from the sampled backdrop.
- The OSM map uses raster tiles. The renderer preserves their available detail;
  it cannot restore detail missing from the tile imagery when magnified.
- Cross-origin backdrop textures must permit canvas access; otherwise CSS takes
  over. This is a web approximation, not Apple's proprietary material or a
  claim of pixel parity. Safari and physical iPhone performance need validation.

## References

- [Backdrop effects](https://kyant.gitbook.io/backdrop/api/backdrop-effects):
  effect ordering, vibrancy and separate lens height/displacement.
- [Glass Bottom Sheet](https://kyant.gitbook.io/backdrop/tutorials/glass-bottom-sheet):
  24/48 edge lens and exported parent surface for nested controls.
- [Smoother rounded corners](https://kyant.gitbook.io/backdrop/tutorials/smoother-rounded-corners):
  continuous corner curvature.
- [LiquidButton](https://github.com/Kyant0/AndroidLiquidGlass/blob/kmp/app/src/commonMain/kotlin/com/kyant/backdrop/catalog/components/LiquidButton.kt):
  capsule, 2px blur, 12/24 lens and press spring. AndroidLiquidGlass is Apache-2.0.
- [Highlight](https://github.com/Kyant0/AndroidLiquidGlass/blob/kmp/backdrop/src/commonMain/kotlin/com/kyant/backdrop/highlight/Highlight.kt)
  and `HighlightModifier.kt`: default outline width/blur and clipping inside the
  shape. The web shader approximates the native blur with a soft edge; it is
  not the Skia highlight renderer itself.
- [Liquid Glass Studio](https://github.com/iyinchao/liquid-glass-studio):
  SDF material, sharp rim / blurred interior, dispersion and Fresnel reflections.
  MIT. The reference projects are not runtime dependencies.

## Local preview and verification

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open <http://127.0.0.1:4173>. A static server does not run `/api/recommend`; the
existing local restaurant fallback is used. Map tiles and routes need network.

Chromium checks cover desktop and 390px layouts, DPR 2 source/output dimensions,
actual map capture, recommendation/reroll/compass, press and release, reduced
motion, idle rendering, and WebGL context loss/restoration. The Studio building
photo was used only as an ignored local QA fixture to inspect the magnified rim;
shader loading was held back and a 404 response injected to verify that CSS
remains visible and recommendation controls still work when loading fails. The
photo is not shipped as the app background. Screenshots are in `output/playwright/`.
