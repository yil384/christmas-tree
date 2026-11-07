# Scene backgrounds

## Current: fairytale winter castle

`fairytale-castle-winter.webp` is an AI-generated environment plate made with the built-in imagegen tool for this Christmas gift website. It depicts an imagined fairytale castle, not a photograph of an identified real location. The foreground Christmas tree, photographs, star and falling snow are rendered separately in Three.js.

The generated image was 1536 × 1024 px, then encoded as WebP for the repository. The build creates an optimized runtime copy without metadata. No external image service is requested at runtime. The current focus in `public/scene.json` preserves the main tower in narrow crops; the foreground lighting uses a matching lavender-blue and champagne-gold palette.

### Generation prompt

Use case: stylized-concept. Asset type: cinematic background plate for a real-time 3D Christmas gift website, wide landscape 1536x1024. Create a luxurious, enchanting fairytale winter castle at blue hour, with the magical atmosphere of a Disney-style illuminated princess castle at Christmas, photographed as a physically believable real place rather than a flat cartoon. Elegant tall pale stone towers, slender blue-silver conical roofs, intricate but readable architecture, glowing warm champagne-gold windows, a delicate canopy of golden festive lights on distant trees, pale lavender and sapphire twilight, a few faint natural stars and delicate atmospheric haze. Composition is essential: the website will render a large separate Christmas tree in the CENTRAL foreground, occupying x=34–66% and y=15–85%; do NOT draw that Christmas tree. Put the most recognizable illuminated castle tower cluster at x=70% and y=30–55%, with lower castle wings spanning the distant middle background and a secondary slender tower around x=28%; castle must remain recognizable around the central overlay. The center is quieter open lavender-blue air above and a softly lit empty snow courtyard below. Snow-covered gardens and warm tiny lanterns at left and right edges lead the eye into the castle. Lower 25% is a continuous gently textured dusky lavender snow field, open and free of large objects, matching a level virtual ground plane. Soft golden reflections on snow, creamy highlight rolloff, luminous but calm and comfortable at night, clear layered depth, rich elegant warm/cool balance, a little romantic wonder. Eye-level natural 40mm perspective. Keep central areas low contrast for readable photo ornaments. No people, no characters, no text, no logo, no watermark, no foreground hero tree, no giant bright moon, no fireworks, no hard spotlight beams, no neon, no baked large falling snowflakes. The falling snow and foreground tree are rendered separately.

## Previous: winter-night forest

`winter-night-photo.webp` is an AI-generated, photographic-style environment plate created with the built-in imagegen tool for this Christmas-tree scene. It is not a photograph of a real identified location. The previous SVG background remains available for reference.

The generated image was 1536 × 1024 px, then encoded as WebP for the repository. `scripts/prepare-scene.mjs` generates the runtime copy and strips metadata. No external image service is requested at runtime.

### Generation brief

Use case: photorealistic-natural. A realistic quiet winter-night forest photograph with an empty foreground clearing for a separately rendered 3D evergreen. Distant natural spruce forest around the left and right edges, soft haze, sparse faint stars, subtle moonlight from the upper left outside the frame. Open dark blue atmospheric air in the center. Lower 22 percent is a gently textured slate-blue snow field. Natural exposure, charcoal/navy and icy grey palette, low-contrast distant trees, real snow surface microtexture and a natural camera look. No foreground hero tree, people, buildings, ornaments, tracks, text, watermark, cartoon outlines, fantasy neon glow, or baked foreground snowflakes. Snowfall is rendered separately by the app.

To replace it, put a local image in this directory and change `background.image` in `public/scene.json`.
