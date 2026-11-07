# Winter-night background

`winter-night-photo.webp` is an AI-generated, photographic-style environment plate created with the built-in imagegen tool for this Christmas-tree scene. It is not a photograph of a real identified location. The previous SVG background remains available for reference.

The generated image was 1536 × 1024 px, then encoded as WebP for the repository. `scripts/prepare-scene.mjs` generates the runtime copy and strips metadata. No external image service is requested at runtime.

## Generation brief

Use case: photorealistic-natural. A realistic quiet winter-night forest photograph with an empty foreground clearing for a separately rendered 3D evergreen. Distant natural spruce forest around the left and right edges, soft haze, sparse faint stars, subtle moonlight from the upper left outside the frame. Open dark blue atmospheric air in the center. Lower 22 percent is a gently textured slate-blue snow field. Natural exposure, charcoal/navy and icy grey palette, low-contrast distant trees, real snow surface microtexture and a natural camera look. No foreground hero tree, people, buildings, ornaments, tracks, text, watermark, cartoon outlines, fantasy neon glow, or baked foreground snowflakes. Snowfall is rendered separately by the app.

To replace it, put a local image in this directory and change `background.image` in `public/scene.json`.
