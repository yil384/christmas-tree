# Princess ride assets

These are the final image assets used by the mobile princess-castle experience.
Both were generated for this project with the built-in `image_gen.imagegen`
tool on 2026-11-09. No external reference image, stock image, or existing
third-party artwork was supplied. The tool did not report an underlying model
version.

## Image inventory

| Asset | Shipped file | Shipped dimensions | Shipped size | Generated source dimensions |
| --- | --- | --- | --- | --- |
| Castle arrival poster | `public/princess/arrival-poster.webp` | 1080 × 1919 | 315,626 bytes | 941 × 1672 PNG |
| Princess tiara | `public/princess/crown.webp` | 800 × 400 | 129,726 bytes | 1774 × 887 PNG, RGBA |

### Preserved originals

Castle tool output:
`/workspace/scratch/7dbdec9a2b48/generated_images/exec-0511aee4-1f48-43d0-ac9d-7fb2eff5c1a5.png`

Castle named source copy, suitable as a Google Vids image reference:
`/workspace/scratch/7dbdec9a2b48/princess-arrival-assets/arrival-original.png`

Tiara tool output:
`/workspace/scratch/7dbdec9a2b48/generated_images/exec-410546f3-b1d7-45eb-8c41-abb1141330c3.png`

Tiara named source copy:
`/workspace/scratch/7dbdec9a2b48/princess-arrival-assets/crown-original.png`

These absolute source paths identify the original generation workspace; the
deployable assets are the repository-relative WebP files listed above.

## Encoding and validation

- Castle: Sharp proportional resize to width 1080, WebP quality 84, effort 6.
  The source was 941 pixels wide; this is a modest proportional resize, not
  generative upscaling or a claim of newly recovered detail.
- Tiara: Sharp proportional resize to width 800 with `withoutEnlargement:true`,
  WebP quality 91, alpha quality 100, effort 6.
- No crop, perspective warp, geometric stretching, creative compositing,
  repainting, or background blur was applied to either deliverable.
- Both final WebPs were visually inspected.
- The final crown has a real alpha channel with values from 0 through 255.
  Its outline and filigree openings were also inspected on a temporary
  midnight-blue QA background; that composite is not the delivered asset.
- The poster is an image/poster reference, not a video and not an interactive
  3D model.

## Castle: final exact prompt

Tool settings: `transparent_background:false`; no image references.

```text
Create one original cinematic architectural visualization of a magnificent fairytale palace at night. Portrait composition, 9:16. This is an environment image without any people or characters. An elegant pearl-white stone palace with a central tall spire and balanced smaller towers stands across a graceful stone bridge over calm reflective water. Champagne gold light shines from the windows. Subtle rose gardens, ornate open wrought-gold entrance gates at the left and right foreground, a midnight-blue sky with a faint blush-lavender glow. Magical, luxurious and inviting, bright enough to read all the architecture. Ultra-detailed physically based materials: fine pale limestone carving, delicate gold fittings, smooth reflective water, realistic tiny light reflections. Gentle cool moonlight balances the warm window lighting. The central palace is crisp and clearly visible, contained mainly within the central half of the image width and between 22% and 73% of image height. The top 20% is calm deep-blue sky. The lower 25% is a quiet softly lit dark-blue stone path with clear open space. Natural perspective, careful straight architecture, elaborate but coherent original design, no distortion. Full cinematic 3D environment rendering with restrained soft atmospheric depth, detailed sharp focal architecture, no heavy mist and no blurry glow. No text, logos, UI, people, animals, snow, holiday decorations, fireworks, neon lights, or frames.
```

## Tiara: final exact prompt

Tool settings: `transparent_background:true`; no image references.

```text
Use case: product-mockup.
Asset type: final transparent-background princess tiara asset for a premium real-time 3D mobile fairy-tale experience.
Create ONE exquisite original haute-joaillerie princess tiara, on a genuine transparent alpha background. Front view turned just very slightly into a three-quarter angle (about 12 degrees), complete object fully inside the canvas with generous clear margins. Horizontal tiara shape, elegant and wearable, not a tall royal crown. Fine champagne-gold double arcing bands, delicate symmetrical scrolling foliate ornament and graceful fleur-de-lis tips, a central blush-pink faceted gemstone, smaller matching pink stones, tiny diamond pavé borders and a few creamy pearls. Subtle old-world princess elegance. Render like a meticulous high-end physically based jewellery advertising photograph: fine real metal, precise facets, beautiful small specular highlights, diamond refraction and depth, pearl lustre. Champagne gold, pale blush pink, clear diamonds and warm ivory pearls.
The result must be a genuinely dimensional precious object that matches a pearl-white princess castle with warm champagne light and a midnight-blue atmosphere. Do not make a cartoon, icon, paper sticker, cheap toy, spiky pointed king's crown or plastic. Keep every gold edge sharp and graceful, avoid huge bloomed glow. No pedestal, no cushion, no floor, no background, no cast shadow outside the object, no checkerboard pattern, no text, no logo, no watermark. Preserve clean true transparency around and through open filigree.
```

## Film continuity note

The foreground path ends at the reflecting pool; the bridge crosses in front
of the palace. For image-to-video continuity, describe a gentle camera move
through the open gates and over the water toward the central palace entrance.
Do not imply a continuous walkable road straight from the camera to the door.

## Chinese title font

The locally hosted title font is
`public/princess/siyi-serif.woff2`, a text-specific Simplified Chinese
subset of the installed Noto Serif CJK SC Regular face (TTC face index 2).
Use the CSS `@font-face` alias `SiyiStorySerif`, weight 400, normal style.
Use a normal system-font fallback for text outside the subset.

The initial shipped subset is 34,912 bytes and covers 181 Chinese characters
plus the page's punctuation, for 190 mapped characters in total. The encoded
WOFF2 was reopened and checked against the current page and required title
characters; none were missing.

The source identity, source and output checksums, included characters, exact
output size, and reproducible build command are recorded in
`public/princess/siyi-serif.SOURCE.txt`. The full SIL Open Font License 1.1
and attribution accompany the font in
`public/princess/siyi-serif.LICENSE.txt`.

Rebuild after changing the story copy:

```sh
/usr/bin/python3 scripts/build-siyi-font.py
```

The script uses the system's existing fontTools and Brotli installations.
It adds no npm or Python project dependency, reads all Chinese characters
from the current `src/confession/ConfessionPage.tsx`, and includes the
approved story-title seed and the Chinese punctuation used by that page. This font is
a limited derivative named Siyi Story Serif; its source attribution and
OFL metadata remain embedded.

