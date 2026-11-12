import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Photo } from '../lib/content';
import type { HandSceneInput } from '../lib/hand-types';
import type { SceneBackground, SceneCat } from '../lib/scene-config';
import type { PerspectiveBackgroundSurface } from './ground-composite';
import PhotoOrnaments from './PhotoOrnaments';
import TreeDetails, { TreeAtmosphere } from './TreeDetails';
import TreeBody from './TreeBody';
import NightBackground from './NightBackground';
import SnowGround from './SnowGround';
import HandMagic from './HandMagic';
import ChristmasCat from './ChristmasCat';
import FairytaleFireworks from './FairytaleFireworks';
import { getCameraFraming, setCameraOpticalZoom } from './camera-framing';
import { createCatGroundContact } from './cat-placement';
import { advanceCameraOrbit, CAMERA_RESUME_DELAY_MS, createCameraArcController, PERSPECTIVE_CAMERA_LIMITS } from './camera-orbit';
import { clearHandSceneInput, createHandCameraController, HAND_INTERACTION_HOLD_MS } from './hand-scene';
import { DEFAULT_CAMERA_TARGET_Y, DEFAULT_CAMERA_Y, MIN_CAMERA_DISTANCE, TREE_OFFSET_Y } from './tree-profile';

interface TreeSceneProps {
  photos: Photo[];
  state: 'CHAOS' | 'FORMED';
  paused: boolean;
  reducedMotion: boolean;
  active: boolean;
  onPhotoPress: (index: number) => void;
  background: SceneBackground;
  snow: boolean;
  cat: SceneCat;
  onCatPress?: () => void;
  onCatInteract?: () => void;
  handInput?: MutableRefObject<HandSceneInput>;
  /** React flag matching the mailbox, so demand rendering wakes when hands start. */
  handActive?: boolean;
  onHandPhotoSelect?: (index: number | null) => void;
}

function CameraControls({ interacting, handInput, handActive, paused, reducedMotion, active, projection }: {
  interacting: MutableRefObject<number>;
  handInput?: MutableRefObject<HandSceneInput>;
  handActive: boolean;
  paused: boolean;
  reducedMotion: boolean;
  active: boolean;
  projection: SceneBackground['projection'];
}) {
  const { camera, gl, size, invalidate } = useThree();
  const perspectiveBackdrop = projection === 'perspective';
  const controls = useMemo(() => {
    const instance = new OrbitControls(camera);
    instance.enableDamping = false;
    return instance;
  }, [camera]);
  const arcController = useMemo(() => createCameraArcController(), []);
  const handController = useMemo(() => handInput && handActive ? createHandCameraController() : null, [handInput, handActive]);
  const previousFraming = useRef<ReturnType<typeof getCameraFraming> | null>(null);
  useEffect(() => {
    if (!handActive && handInput) clearHandSceneInput(handInput.current);
  }, [handActive, handInput]);
  useEffect(() => () => {
    if (handInput) clearHandSceneInput(handInput.current);
  }, [handInput]);
  useEffect(() => {
    controls.domElement = gl.domElement;
    controls.connect();
    controls.enablePan = false;
    // Dolly changes the tree-to-background size ratio. Route every zoom input
    // through the same projection, so the complete world enlarges together.
    controls.enableZoom = false;
    controls.touches.TWO = null;
    controls.dampingFactor = 0.06;
    controls.zoomSpeed = 0.8;
    controls.target.set(0, DEFAULT_CAMERA_TARGET_Y, 0);
    let moved = false;
    const onStart = () => { moved = false; interacting.current = Infinity; };
    const onEnd = () => { interacting.current = moved ? performance.now() + CAMERA_RESUME_DELAY_MS : 0; };
    const onChange = () => { if (interacting.current === Infinity) moved = true; invalidate(); };
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);
    controls.addEventListener('change', onChange);
    const perspective = camera as THREE.PerspectiveCamera;
    const touches = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    let pinched = false;
    let safariGestureActive = false;
    const zoomBy = (factor: number) => {
      if (!Number.isFinite(factor) || factor <= 0) return;
      setCameraOpticalZoom(perspective, perspective.zoom * factor);
      moved = true;
      interacting.current = touches.size ? Infinity : performance.now() + CAMERA_RESUME_DELAY_MS;
      invalidate();
    };
    const distanceBetweenTouches = () => {
      const [first, second] = [...touches.values()];
      return first && second ? Math.hypot(second.x - first.x, second.y - first.y) : 0;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size >= 2) {
        pinched = true;
        pinchDistance = distanceBetweenTouches();
        interacting.current = Infinity;
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!touches.has(event.pointerId)) return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size !== 2) return;
      const distance = distanceBetweenTouches();
      if (pinchDistance > 0 && distance > 0) zoomBy(distance / pinchDistance);
      pinchDistance = distance;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!touches.delete(event.pointerId)) return;
      pinchDistance = distanceBetweenTouches();
      if (pinched) interacting.current = touches.size ? Infinity : performance.now() + CAMERA_RESUME_DELAY_MS;
      if (!touches.size) pinched = false;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (safariGestureActive) return;
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? gl.domElement.clientHeight : 1;
      zoomBy(Math.exp(-Math.max(-600, Math.min(600, event.deltaY * units)) * 0.0018));
    };
    // Safari trackpad gestures can zoom the HTML document independently.
    // Avoid applying both Safari and PointerEvent pinch streams at once.
    let gestureScale = 1;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      gestureScale = 1;
      safariGestureActive = true;
      interacting.current = Infinity;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const scale = (event as Event & { scale?: number }).scale ?? 1;
      if (Number.isFinite(scale) && scale > 0 && touches.size < 2) {
        zoomBy(scale / gestureScale);
      }
      gestureScale = scale > 0 && Number.isFinite(scale) ? scale : 1;
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      safariGestureActive = false;
      interacting.current = touches.size ? Infinity : performance.now() + CAMERA_RESUME_DELAY_MS;
    };
    const canvas = gl.domElement;
    canvas.addEventListener('gesturestart', onGestureStart, { passive: false });
    canvas.addEventListener('gesturechange', onGestureChange, { passive: false });
    canvas.addEventListener('gestureend', onGestureEnd, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      controls.removeEventListener('change', onChange);
      canvas.removeEventListener('gesturestart', onGestureStart);
      canvas.removeEventListener('gesturechange', onGestureChange);
      canvas.removeEventListener('gestureend', onGestureEnd);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      controls.dispose();
    };
  }, [camera, controls, gl, interacting, invalidate]);

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const framing = getCameraFraming(size.width, size.height, perspective.fov);
    const prior = previousFraming.current;
    const offset = camera.position.clone().sub(controls.target);
    const distance = framing.defaultDistance;
    controls.minDistance = distance;
    controls.maxDistance = distance;
    controls.minPolarAngle = perspectiveBackdrop ? PERSPECTIVE_CAMERA_LIMITS.minPolarAngle : framing.minPolarAngle;
    controls.maxPolarAngle = perspectiveBackdrop ? PERSPECTIVE_CAMERA_LIMITS.maxPolarAngle : framing.maxPolarAngle;
    controls.minAzimuthAngle = perspectiveBackdrop ? PERSPECTIVE_CAMERA_LIMITS.minAzimuthAngle : -Infinity;
    controls.maxAzimuthAngle = perspectiveBackdrop ? PERSPECTIVE_CAMERA_LIMITS.maxAzimuthAngle : Infinity;
    // Release stops at the chosen pose; no opposing pointer momentum can
    // reverse the constant-direction automatic orbit when it resumes.
    controls.enableDamping = false;
    controls.rotateSpeed = perspectiveBackdrop ? 0.28 : 0.42;
    controls.target.set(0, DEFAULT_CAMERA_TARGET_Y, 0);
    if (prior) camera.position.copy(offset.normalize().multiplyScalar(distance).add(controls.target));
    else camera.position.set(0, DEFAULT_CAMERA_TARGET_Y + distance * 0.09, distance * Math.sqrt(1 - 0.09 ** 2));
    previousFraming.current = framing;
    camera.lookAt(controls.target);
    controls.update();
    invalidate();
  }, [camera, controls, size.width, size.height, invalidate, perspectiveBackdrop]);
  useFrame((_, delta) => {
    const input = handInput?.current;
    if (input && handController) {
      if (input.enabled && Number.isFinite(input.lastInputAt) && input.lastInputAt > 0) {
        interacting.current = Math.max(interacting.current, Math.min(performance.now(), input.lastInputAt) + HAND_INTERACTION_HOLD_MS);
      }
      handController.update(input, camera, controls.target, controls, delta, handActive);
    }
    const autoEnabled = active && !paused && !reducedMotion && performance.now() > interacting.current;
    if (perspectiveBackdrop) arcController.update(camera, controls.target, delta, autoEnabled);
    else advanceCameraOrbit(camera, controls.target, delta, autoEnabled);
    controls.update(Math.min(delta, 0.05));
    // Photo picking later in this frame must use the new camera pose as well.
    camera.updateMatrixWorld();
  }, -1);
  return null;
}

/** Keep the scene at Retina resolution; limit total pixels rather than blurring all phones. */
function RenderResolution() {
  const { size, viewport, setDpr } = useThree();
  useEffect(() => {
    const native = Math.min(window.devicePixelRatio || 1, 3);
    const budget = Math.sqrt(8_000_000 / Math.max(1, size.width * size.height));
    const desired = Math.max(1, Math.min(native, budget));
    // Canvas can restore its native DPR when a parent rerenders. Observe that
    // change as well as resizing, and avoid a state-update loop once corrected.
    if (Math.abs(viewport.dpr - desired) > 0.0001) setDpr(desired);
  }, [size.width, size.height, viewport.dpr, setDpr]);
  return null;
}

function Bloom({ compact }: { compact: boolean }) {
  const { gl, scene, camera, size, viewport } = useThree();
  const physicalPixels = size.width * size.height * viewport.dpr ** 2;
  // Large Retina framebuffers already resolve fine edges. Multisampling those
  // HDR targets would multiply their memory without improving source detail.
  const sampleBudget = physicalPixels > 4_000_000 ? 0 : physicalPixels > 2_000_000 ? 2 : compact ? 2 : 4;
  const pipeline = useMemo(() => {
    const composer = new EffectComposer(gl);
    // Canvas MSAA does not cover the offscreen scene used by the composer.
    // Only request sample counts supported by both its HDR colour and depth
    // attachments, so fine star edges remain smooth on compatible devices.
    const context = gl.getContext() as WebGL2RenderingContext;
    const supportedSamples = (format: number) => Array.from(
      (context.getInternalformatParameter(context.RENDERBUFFER, format, context.SAMPLES) as Int32Array | null) ?? [],
    );
    const depthSamples = supportedSamples(context.DEPTH_COMPONENT24);
    const sampleLimit = Math.min(sampleBudget, gl.capabilities.maxSamples);
    const samples = Math.max(0, ...supportedSamples(context.RGBA16F)
      .filter(count => count <= sampleLimit && depthSamples.includes(count)));
    composer.renderTarget1.samples = samples;
    composer.renderTarget2.samples = samples;
    const scenePass = new RenderPass(scene, camera);
    // HDR lights glow; ordinary photo whites stay sharp below the threshold.
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), compact ? 0.38 : 0.50, 0.42, 1.35);
    // A soft knee prevents small moving highlights from abruptly switching
    // bloom on and off as they cross the luminance threshold.
    (bloom.highPassUniforms as { smoothWidth: { value: number } }).smoothWidth.value = 0.16;
    const output = new OutputPass();
    composer.addPass(scenePass);
    composer.addPass(bloom);
    composer.addPass(output);
    return { composer, scenePass, bloom, output };
  }, [gl, scene, camera, compact, sampleBudget]);
  useEffect(() => {
    // Every pass must use the same device resolution as the canvas. A 1x
    // mobile composer was upscaling the entire tree, photos and cat after render.
    pipeline.composer.setPixelRatio(viewport.dpr);
    pipeline.composer.setSize(size.width, size.height);
  }, [pipeline, viewport.dpr, size.width, size.height]);
  useEffect(() => () => {
    pipeline.bloom.dispose();
    pipeline.output.dispose();
    pipeline.scenePass.dispose();
    pipeline.composer.dispose();
  }, [pipeline]);
  useFrame((_, delta) => pipeline.composer.render(Math.min(delta, 0.05)), 1);
  return null;
}

function SceneContents({ photos, state, paused, reducedMotion, active, onPhotoPress, background, snow, cat, onCatPress, onCatInteract, handInput, handActive = false, onHandPhotoSelect }: TreeSceneProps) {
  const interacting = useRef(0);
  const backgroundSurface = useRef<PerspectiveBackgroundSurface | null>(null);
  const companionContact = useRef(createCatGroundContact());
  const compact = useThree(root => root.size.width < 700);
  const handsEnabled = active && handActive;
  return <>
    <RenderResolution />
    <NightBackground background={background} surface={backgroundSurface} />
    <hemisphereLight args={['#c7dff0', '#354d46', 1.0]} />
    <directionalLight position={[-22, 32, 18]} intensity={1.5} color="#b9d8f2" />
    <directionalLight position={[14, 10, 24]} intensity={1.8} color="#ffe6ba" />
    <directionalLight position={[8, 16, -25]} intensity={1.25} color="#d3e3ef" />
    <pointLight position={[0, -13, 3]} intensity={105} distance={24} decay={2} color="#ffcb8c" />
    <SnowGround state={state} reducedMotion={reducedMotion} background={background} backgroundSurface={backgroundSurface} companion={Boolean(cat.src)} companionContact={companionContact} />
    <TreeAtmosphere compact={compact} reducedMotion={reducedMotion} snow={snow} stars={!background.src} />
    <FairytaleFireworks compact={compact} paused={paused} active={active} reducedMotion={reducedMotion} rotation={background.rotation} />
    <group position={[0, TREE_OFFSET_Y, 0]}>
      <TreeBody state={state} reducedMotion={reducedMotion} />
      <TreeDetails state={state} compact={compact} reducedMotion={reducedMotion} />
      <PhotoOrnaments state={state} photos={photos} count={compact ? 96 : 128} reducedMotion={reducedMotion} onPhotoPress={onPhotoPress}
        handInput={handInput} handActive={handsEnabled} onHandPhotoSelect={onHandPhotoSelect} />
    </group>
    {cat.src && <ChristmasCat src={cat.src} reducedMotion={reducedMotion} paused={paused} active={active} companionContact={companionContact} handInput={handInput} onPress={onCatPress} onInteract={onCatInteract} />}
    {handsEnabled && handInput && !reducedMotion && <HandMagic handInput={handInput} reducedMotion={reducedMotion} />}
    <CameraControls interacting={interacting} handInput={handInput} handActive={handsEnabled} paused={paused} reducedMotion={reducedMotion} active={active} projection={background.projection} />
    <Bloom compact={compact} />
  </>;
}

export default function TreeScene(props: TreeSceneProps) {
  const handActive = props.handActive ?? Boolean(props.handInput?.current.enabled);
  return <Canvas
    camera={{ position: [0, DEFAULT_CAMERA_Y, MIN_CAMERA_DISTANCE], fov: 45, near: 0.1, far: 700 }}
    dpr={[1, 3]}
    frameloop={props.active ? (props.reducedMotion && !handActive ? 'demand' : 'always') : 'never'}
    gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
    onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; gl.outputColorSpace = THREE.SRGBColorSpace; }}
    fallback={<div className="scene-message" role="status"><p>当前浏览器无法显示 3D 圣诞树。</p><span>请在系统浏览器中打开。</span></div>}
  >
    <SceneContents {...props} handActive={handActive} />
  </Canvas>;
}
