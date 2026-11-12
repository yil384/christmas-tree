# Scene backgrounds

## Current: storybook castle panorama (v9)

`storybook-castle-360.webp` is an AI-generated painting for a Christmas scene inspired by classic Disney fairytales and the enchanted-forest atmosphere of Snow White. The art direction combines a dream castle, snowy fir forest, warm lanterns, ivory light, midnight blue, and Christmas red. The current source has native dimensions of 1774×887; it is not native 4K, a real-location photograph, or a complete 3D castle model. The build preserves its native dimensions without enlargement.

The built-in image generation tool produced the art and its framing correction. The final edit prompt is retained in [the generation record](../../docs/storybook-background-prompt.txt). The renderer uses a narrow two-degree join at each longitude edge and periodic texture derivatives; the castle and the interior image mapping remain unchanged by that join.

The active `projection: "equirectangular"` mode samples the artwork as a 360×180° environment. The camera makes one full revolution every 30 seconds and keeps moving in the same direction across the revolution boundary. The environment has fixed world directions, with no independent automatic background rotation. `background.rotation` sets its orientation; the active brightness and other settings are defined in `public/scene.json`.

A 2:1 image-size check alone does not establish a correct panorama or a seamless painted environment. The artwork's angular composition, polar regions, and left/right boundary require actual projection checks. Current results belong in `docs/panorama-contact-validation.json`; the older perspective-plate validation cannot certify this artwork. No perfect-seam or full browser visual acceptance is implied by this file's name or dimensions.

The real snow contact receiver borrows the background's exact texture, orientation, brightness, and sampling implementation. Each fragment uses the same camera ray as the sky behind it. The receiver is opaque and writes depth to hide buried roots and paw bottoms; only small root, body, and paw contact areas are darkened. It adds no pale lit disk, radial transparency, fog-color blend, or white halo. Cat contact positions come from the same `cat-placement.ts` data as the actual 3D kitten.

The foreground tree, photo cards, star, sculpted kitten, falling snow, and live fireworks are separate 3D scene elements seen by the same camera. The kitten has side and rear volume, replacing the previous camera-facing sprite. Champagne, ivory, and soft-rose fireworks rise and arc downward above the castle direction; they are depth-tested world-space points, not a CSS overlay or a second rotating sky. Reduced motion and pause freeze the fireworks' current pose. The old transparent cat reference remains useful for the share card.

One panorama is active, without a separately generated castle detail patch. The source is served with the site and requires no external image service at runtime. Runtime WebP copies use quality 95; the equirectangular processing limit is 8192 px, while perspective/legacy flat images have a 4096 px limit. These limits do not describe the resolution of this 1774×887 source. Canvas and postprocessing share the same actual device-pixel ratio, up to DPR 3 with an approximately 8-megapixel framebuffer budget; DPR never falls below 1. Render resolution cannot recover details absent from the artwork.

The UI follows the same storybook palette: ivory and gold lettering, red berry accents, midnight-blue panels, and fine holly borders. The original greeting shapes, personal photos, hidden interactions, and optional film entry remain intact.

## Previous perspective courtyard (v6–v8; retained, not active)

`castle-courtyard-grounded.webp` is the AI-generated photographic-style view of an invented winter castle courtyard used in v7–v8. The source is an ordinary rectilinear perspective image, natively 1774×887, stored as a lossless WebP without enlargement. Its 2:1 aspect ratio does not make it a spherical panorama. The retained v6 `castle-courtyard-natural.webp` is another ordinary perspective view.

The v7 composition moved the building bases from about 72% of image height to about 48%, leaving continuous foreground snow below 52% across the central area. This corrected views where the physical root contact projected onto the previous building strip. Neither the plane nor the image was stretched to achieve that change.

Those releases used `projection: "perspective"`: a fixed world-space plane with the original image proportions and a camera limited to a ±8° arc. The complete back-and-forth period was 150 seconds in the earlier revision and 30 seconds in v8; the polar angle was limited to 1.42–1.54 radians. V8 moved the staging plane from Z=−280 to Z=−18 to reduce its excess relative screen drift, and set the vertical composition focus to 0.20. These are historical perspective settings, not v9's continuous 30-second full revolution.

The perspective receiver sampled the exact plane texture along each camera ray, wrote depth for buried roots, and applied only a local contact darkening. Shared trilinear filtering with anisotropy 1 removed inconsistent sampling at shallow angles. The v8 native shader comparison and root framing evidence remain in `docs/ground-composite-validation.json`, `docs/ground-contact-framing.json`, and `docs/ground-contact-offline.png`. Their pixel counts and snow-region annotations refer only to that source image and camera range.

## Earlier detail-patch attempt (retained sources, not active)

`fairytale-courtyard-detail.webp` is a retained 1774×887 AI-generated perspective image. It was incorrectly described and configured as an equirectangular panorama. `castle-center-detail.webp` is a separately generated 1448×1086 castle patch. Both were losslessly encoded for source storage; neither was a native 4K output. Mapping the base image over a full sphere distorted its ordinary perspective, while the independently generated patch introduced a different composition. Neither file is used by the current background configuration.

The patch was requested as the middle-third longitude and middle-half latitude crop of the base image. Grayscale registration measured normalized correlation 0.936 after translation/scale alignment, compared with 0.279 at the requested crop. Those measurements established a fitted image rectangle only: they did not establish a correct spherical projection, matching architectural perspective, or a successful WebGL composition. The previous shader feathered the patch edges by 12% and supplied approximately 2.30× more source samples per angle in that rectangle. That sampling-density increase did not correct the underlying projection error or restore real architectural detail.

### Recorded detail-generation brief

Preserve the prior single fairytale castle, open snowy courtyard, lavender-sapphire dusk and champagne-lit windows. Redraw crisp architectural edges, window frames, stonework and snow without lens blur, heavy haze, foreground tree, people, cats or text. Then redraw a separate 4:3 central crop with matching composition and illumination for higher angular detail; align its actual crop before sampling.

## Earlier panorama request (retained source, incorrect projection)

### Generated output and correction

`fairytale-courtyard-360.webp` is a retained 1774×887 AI-generated image, created with the preceding castle image as an architectural and palette reference. Despite its filename and generation request, the output uses ordinary perspective rather than a valid 360×180° equirectangular projection. It is retained as source history and is not active.

Earlier releases used `EquirectangularReflectionMapping`; the later detail-image version used direct spherical sampling. Both approaches treated ordinary perspective sources as full spherical environments, which was incorrect. A 2:1 ratio check after EXIF orientation validates image proportions only; it cannot verify projection or recover the missing directions. The legacy `equirectangular` mode should be used only with an actual spherical panorama. The request below records what was asked for, not what the generated output achieved.

### Recorded generation prompt

Use case: stylized-concept. Asset type: seamless 360-degree equirectangular spherical environment panorama for a real-time 3D Christmas scene. Use the previous castle plate for architectural style, lighting and color only. Exact 2:1 lat-long panorama; full 360 horizontal degrees and 180 vertical degrees; matching left and right edges; viewpoint in the center of a large open snow-covered fairytale castle courtyard at blue hour. One magnificent Disney-like dream castle on one side, lavender-blue roofs, slender spires, ivory stone, champagne-gold windows and Christmas garlands. Other directions show distant snowy fir forests, stone balustrades, lanterns and garden pavilions, not repeated castles. Rich blue-violet twilight, sparse stars, softly bluish snow with distant warm light pools. Keep a large empty central clearing. No foreground tree, people, cats, text, watermark, fireworks or baked snowfall; the foreground is rendered separately. Preserve lat-long polar mapping rather than an ordinary perspective photograph.


## Previous perspective plate: fairytale winter castle

`fairytale-castle-winter.webp` is an AI-generated environment plate made with the built-in imagegen tool for this Christmas gift website. It depicts an imagined fairytale castle, not a photograph of an identified real location. The foreground Christmas tree, photographs, star and falling snow are rendered separately in Three.js.

The generated image was 1536 × 1024 px, then encoded as WebP for the repository. The build creates an optimized runtime copy without metadata. No external image service is requested at runtime. The previous focus in `public/scene.json` preserves the main tower in narrow crops; the foreground lighting uses a matching lavender-blue and champagne-gold palette.

### Generation prompt

Use case: stylized-concept. Asset type: cinematic background plate for a real-time 3D Christmas gift website, wide landscape 1536x1024. Create a luxurious, enchanting fairytale winter castle at blue hour, with the magical atmosphere of a Disney-style illuminated princess castle at Christmas, photographed as a physically believable real place rather than a flat cartoon. Elegant tall pale stone towers, slender blue-silver conical roofs, intricate but readable architecture, glowing warm champagne-gold windows, a delicate canopy of golden festive lights on distant trees, pale lavender and sapphire twilight, a few faint natural stars and delicate atmospheric haze. Composition is essential: the website will render a large separate Christmas tree in the CENTRAL foreground, occupying x=34–66% and y=15–85%; do NOT draw that Christmas tree. Put the most recognizable illuminated castle tower cluster at x=70% and y=30–55%, with lower castle wings spanning the distant middle background and a secondary slender tower around x=28%; castle must remain recognizable around the central overlay. The center is quieter open lavender-blue air above and a softly lit empty snow courtyard below. Snow-covered gardens and warm tiny lanterns at left and right edges lead the eye into the castle. Lower 25% is a continuous gently textured dusky lavender snow field, open and free of large objects, matching a level virtual ground plane. Soft golden reflections on snow, creamy highlight rolloff, luminous but calm and comfortable at night, clear layered depth, rich elegant warm/cool balance, a little romantic wonder. Eye-level natural 40mm perspective. Keep central areas low contrast for readable photo ornaments. No people, no characters, no text, no logo, no watermark, no foreground hero tree, no giant bright moon, no fireworks, no hard spotlight beams, no neon, no baked large falling snowflakes. The falling snow and foreground tree are rendered separately.

## Previous: winter-night forest

`winter-night-photo.webp` is an AI-generated, photographic-style environment plate created with the built-in imagegen tool for this Christmas-tree scene. It is not a photograph of a real identified location. The previous SVG background remains available for reference.

The generated image was 1536 × 1024 px, then encoded as WebP for the repository. `scripts/prepare-scene.mjs` generates the runtime copy and strips metadata. No external image service is requested at runtime.

### Generation brief

Use case: photorealistic-natural. A realistic quiet winter-night forest photograph with an empty foreground clearing for a separately rendered 3D evergreen. Distant natural spruce forest around the left and right edges, soft haze, sparse faint stars, subtle moonlight from the upper left outside the frame. Open dark blue atmospheric air in the center. Lower 22 percent is a gently textured slate-blue snow field. Natural exposure, charcoal/navy and icy grey palette, low-contrast distant trees, real snow surface microtexture and a natural camera look. No foreground hero tree, people, buildings, ornaments, tracks, text, watermark, cartoon outlines, fantasy neon glow, or baked foreground snowflakes. Snowfall is rendered separately by the app.

To replace the active background, put a local image in this directory and update `background.image` in `public/scene.json`. Use `projection: "perspective"` for an ordinary perspective image; use `equirectangular` only for a verified 360×180° spherical panorama. The legacy `image` mode remains available for a screen-aligned background.
