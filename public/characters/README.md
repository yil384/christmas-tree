# Christmas cat

`christmas-cat.png` is a 1254×1254 RGBA character generated with the built-in imagegen tool from the user's supplied gray-and-white long-haired cat photograph. The original cat photograph is not included here. This artwork is an original fairytale interpretation, not an official Disney character or asset.

The website preserves the 1254×1254 source dimensions, builds an alpha-preserving WebP at quality 96, and uses Retina-resolution composition. It never upscales this source. The website and anchors a sprite at the snow height beside the tree. The illustration is a 2.5D asset, not a rigged 3D animal. A small cape, white trim and gold star clasp tie it to the Christmas setting. The cat reference is not used to modify the faces in the photo album.

## Generation prompt

Use case: stylized-concept. Asset type: transparent full-body character cutout for a Christmas fairytale 3D website. The input is the CAT IDENTITY reference, not a composition or background reference. Create one lovable Disney-inspired cinematic fairytale animation cat, recognizably based on this real cat: long fluffy silver-grey fur, creamy white muzzle, chin and chest, rounded face, short pink-grey nose, natural pale green-hazel eyes, ear tufts, long white whiskers and a large fluffy grey tail. Keep its specific grey-and-cream markings and gentle character. Sitting comfortably in a three-quarter front pose, softly looking toward the viewer, paws visible, tail curled beside its feet. Small deep-crimson velvet Christmas cape, cream fur trim and a champagne-gold star clasp; no hat hiding ears. Feature-animation rendering, soft individual fur, warm gold rim light and cool winter-blue fill; not plastic or chibi and no enormous anime eyes. Entire cat and whiskers in frame, real transparent background, no floor or scene, no text, no watermark or extra animals. Cat upright rather than copying the tilted reference orientation.

## Optional movie

Place a reviewed H.264 MP4 in `public/videos/`, then set `cat.video` in `public/scene.json`. It must be a regular file smaller than 24 MiB. The build emits a content-hashed copy in `generated/videos/`, while originals are excluded from `dist`. The default remains `null`: the current release includes the cat illustration and star interaction, not an invented Veo movie. Production prompts and face-preserving compositing steps are in `docs/CHRISTMAS_VIDEO.md`.
