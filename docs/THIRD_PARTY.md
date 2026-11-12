# Optional hand recognition: sources and notices

The hand-magic mode uses an opt-in, locally executed MediaPipe recognizer. The SDK, WebAssembly binary and model are served from this website. They are prepared during development/build and are only requested by the browser after the visitor explicitly starts the camera mode and camera access succeeds.

## MediaPipe SDK

| Item | Pinned value |
| --- | --- |
| npm package | `@mediapipe/tasks-vision` |
| Version | **1.2.2**, exact, including `package-lock.json` integrity |
| Published package license | **Apache-2.0** |
| Browser entry | Unmodified classic IIFE `vision_bundle.js`, exporting `Vision` |
| WASM files | `vision_wasm_internal.js` and `vision_wasm_internal.wasm` from the same npm package |
| Source | [Google AI Edge / MediaPipe](https://github.com/google-ai-edge/mediapipe) |
| Upstream license | [MediaPipe LICENSE](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE) |

The published npm package's `package.json` was checked for both version and license. A copy of the upstream license text is kept at `src/hand-tracking/licenses/mediapipe-LICENSE.txt` and is emitted as `generated/hand-tracking/LICENSE-MediaPipe.txt`. The SDK and WASM files are copied without modification.

The [official JavaScript API](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.gesturerecognizer) describes `recognizeForVideo` as a synchronous call. This application therefore runs it in a dedicated classic Worker, using the SDK's `importScripts`-compatible IIFE and WASM loader. Its inference delegate is explicitly **CPU**. MediaPipe still uses an OffscreenCanvas/WebGL bridge for camera input; an unavailable worker canvas produces a friendly unsupported-browser result instead of moving inference to the main thread.

## Pinned Google model

| Item | Value |
| --- | --- |
| Task | Gesture Recognizer |
| Variant | `gesture_recognizer / gesture_recognizer / float16 / 1` |
| Official download | [Version 1 model bundle](https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task) |
| Size | **8,373,440 bytes** |
| SHA-256 | `97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482` |
| Alterations | None; the model is copied byte-for-byte |

The download URL is also the versioned example in Google's [MediaPipe vision README](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md). `scripts/prepare-hand-tracking.mjs` verifies the full byte length and SHA-256 before caching or publishing the model. It never uses a `latest` model URL.

The bundle contains `hand_landmarker.task` (hand detector and hand landmark detector) and `hand_gesture_recognizer.task` (gesture embedder and canned gesture classifier). These model sources were reviewed separately from the SDK license:

- Google's [Hand Tracking model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf) explicitly names **Apache License, Version 2.0** for the detector/tracker models.
- Google's separate [Hand Gesture Classification model card](https://storage.googleapis.com/mediapipe-assets/gesture_recognizer/model_card_hand_gesture_classification_with_faireness_2022.pdf) explains the gesture embedder/classifier, intended uses and limitations. The reviewed six-page card does **not** state a standalone license grant for the complete gesture-classification bundle. No such license text was found inside the downloaded `.task` archives either. This notice therefore does not assert that the SDK's license, or the documentation page's footer license, automatically licenses every model component.

This application uses the model for optional entertainment controls. It does not identify people or attempt sign-language translation. The classification model recognizes individual held hand shapes; motion, two-hand zoom and hold confirmation are application logic built from successive local landmarks.

## No SDK telemetry leaves the Worker

Google's [MediaPipe privacy notice](https://github.com/google-ai-edge/mediapipe#privacy-notice) distinguishes local input processing from performance/utilization metrics sent to Google. The installed **1.2.2** JavaScript bundle was inspected: its task initialization creates a metrics logger which uses `fetch` to POST to `https://odml.pa.googleapis.com/v1/log`.

Before importing that SDK, `src/hand-tracking/worker.js` installs the application's network restrictions within its own Worker:

- `fetch`, `XMLHttpRequest.open` and `importScripts` resolve URLs and require the same origin **and** the Worker's `generated/hand-tracking/` directory prefix.
- Parent-directory escapes, external origins, URL credentials, query strings, fragments and encoded path escapes are rejected before the native network operation.
- Only GET reads are allowed. `fetch` additionally rejects bodies, omits credentials, requires same-origin mode and rejects redirects.
- Thus the SDK's external metrics POST is rejected before dispatch. The SDK files themselves remain unmodified. No camera frame or landmark result is passed to any network function or app logger.

These restrictions are a scoped integration boundary for this pinned SDK, not a general sandbox for arbitrary untrusted code. Executable regression tests exercise allowed local paths and blocked metrics, POST, XHR, import and normalized-path requests. The application passes only a single transferable bitmap at a time to the Worker, closes each bitmap after use, drops stale results and terminates the Worker on exit.

## Generated assets and verification

`npm run hand-assets` runs before `npm run dev` and `npm run build`. It prepares `public/generated/hand-tracking/` with:

- A content-hashed copy of the application's classic Worker.
- A versioned SDK directory and only the classic runtime/WASM files it needs.
- A model filename containing its pinned revision and checksum prefix.
- An atomic `manifest.json`, published after the referenced files exist.
- `LICENSE-MediaPipe.txt` and `NOTICE.txt` carrying the source/version/license details above.

The SDK/model payload is approximately **22.4 MiB** before HTTP compression. These bytes are absent from the initial page's module imports. Generated files are excluded by the existing `public/generated/` ignore rule; the verified model cache is under the already ignored `node_modules/.cache/hand-tracking/` directory. The runtime never fetches model data from a CDN or Google after deployment.

`npm test` includes `src/hand-tracking/*.test.mjs`. These tests cover camera cancellation and restart races, late permission, worker/model cancellation, resource release, inference backpressure, stale frames, desktop/mobile frame caps, adaptive cadence, worker errors and the network restrictions. They test lifecycle behavior through injected browser boundaries and execute the real Worker source in an isolated JavaScript context; they do not claim to replace an end-to-end camera test on a supported physical browser.
