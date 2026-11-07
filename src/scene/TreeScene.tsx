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
import type { SceneBackground } from '../lib/scene-config';
import PhotoOrnaments from './PhotoOrnaments';
import TreeDetails, { TreeAtmosphere } from './TreeDetails';
import TreeBody from './TreeBody';
import NightBackground from './NightBackground';
import SnowGround from './SnowGround';
import HandMagic from './HandMagic';
import { clampCameraDistance, getCameraFraming } from './camera-framing';
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
  handInput?: MutableRefObject<HandSceneInput>;
  /** React flag matching the mailbox, so demand rendering wakes when hands start. */
  handActive?: boolean;
  onHandPhotoSelect?: (index: number | null) => void;
}

function CameraControls({ interacting, handInput, handActive }: {
  interacting: MutableRefObject<number>;
  handInput?: MutableRefObject<HandSceneInput>;
  handActive: boolean;
}) {
  const { camera, gl, size, invalidate } = useThree();
  const controls = useMemo(() => new OrbitControls(camera), [camera]);
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
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.8;
    controls.minPolarAngle = 1.24;
    controls.maxPolarAngle = 1.52;
    controls.target.set(0, DEFAULT_CAMERA_TARGET_Y, 0);
    let moved = false;
    const onStart = () => { moved = false; interacting.current = Infinity; };
    const onEnd = () => { interacting.current = moved ? performance.now() + 1000 : 0; };
    const onChange = () => { if (interacting.current === Infinity) moved = true; invalidate(); };
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);
    controls.addEventListener('change', onChange);
    // Safari trackpad gestures can zoom the HTML document independently of
    // OrbitControls. Route those gestures through the same bounded camera.
    let gestureScale = 1;
    const touches = new Set<number>();
    const onPointerDown = (event: PointerEvent) => { if (event.pointerType === 'touch') touches.add(event.pointerId); };
    const onPointerUp = (event: PointerEvent) => touches.delete(event.pointerId);
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      gestureScale = 1;
      interacting.current = Infinity;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const scale = (event as Event & { scale?: number }).scale ?? 1;
      if (Number.isFinite(scale) && scale > 0 && touches.size < 2) {
        const distance = camera.position.distanceTo(controls.target);
        const next = clampCameraDistance(distance * gestureScale / scale, controls.minDistance, controls.maxDistance);
        camera.position.sub(controls.target).multiplyScalar(next / Math.max(distance, 0.001)).add(controls.target);
        controls.update();
        invalidate();
      }
      gestureScale = scale > 0 && Number.isFinite(scale) ? scale : 1;
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      interacting.current = performance.now() + 1000;
    };
    const canvas = gl.domElement;
    canvas.addEventListener('gesturestart', onGestureStart, { passive: false });
    canvas.addEventListener('gesturechange', onGestureChange, { passive: false });
    canvas.addEventListener('gestureend', onGestureEnd, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
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
    const ratio = prior ? offset.length() / prior.defaultDistance : 1;
    const distance = clampCameraDistance(framing.defaultDistance * ratio, framing.minDistance, framing.maxDistance);
    controls.minDistance = framing.minDistance;
    controls.maxDistance = framing.maxDistance;
    controls.minPolarAngle = framing.minPolarAngle;
    controls.maxPolarAngle = framing.maxPolarAngle;
    controls.target.set(0, DEFAULT_CAMERA_TARGET_Y, 0);
    if (prior) camera.position.copy(offset.normalize().multiplyScalar(distance).add(controls.target));
    else camera.position.set(0, DEFAULT_CAMERA_TARGET_Y + distance * 0.09, distance * Math.sqrt(1 - 0.09 ** 2));
    previousFraming.current = framing;
    camera.lookAt(controls.target);
    controls.update();
    invalidate();
  }, [camera, controls, size.width, size.height, invalidate]);
  useFrame((_, delta) => {
    const input = handInput?.current;
    if (input && handController) {
      if (input.enabled && Number.isFinite(input.lastInputAt) && input.lastInputAt > 0) {
        interacting.current = Math.max(interacting.current, Math.min(performance.now(), input.lastInputAt) + HAND_INTERACTION_HOLD_MS);
      }
      handController.update(input, camera, controls.target, controls, delta, handActive);
    }
    controls.update(delta);
  }, -1);
  return null;
}

function Bloom({ compact }: { compact: boolean }) {
  const { gl, scene, camera, size } = useThree();
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
    const sampleLimit = Math.min(compact ? 2 : 4, gl.capabilities.maxSamples);
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
  }, [gl, scene, camera, compact]);
  useEffect(() => {
    pipeline.composer.setPixelRatio(Math.min(gl.getPixelRatio(), compact ? 1 : 1.5));
    pipeline.composer.setSize(size.width, size.height);
  }, [pipeline, gl, compact, size.width, size.height]);
  useEffect(() => () => {
    pipeline.bloom.dispose();
    pipeline.output.dispose();
    pipeline.scenePass.dispose();
    pipeline.composer.dispose();
  }, [pipeline]);
  useFrame((_, delta) => pipeline.composer.render(Math.min(delta, 0.05)), 1);
  return null;
}

function SceneContents({ photos, state, paused, reducedMotion, active, onPhotoPress, background, snow, handInput, handActive = false, onHandPhotoSelect }: TreeSceneProps) {
  const tree = useRef<THREE.Group>(null);
  const interacting = useRef(0);
  const compact = useThree(root => root.size.width < 700);
  const handsEnabled = active && handActive;
  useEffect(() => { if (!paused) interacting.current = 0; }, [paused]);
  useFrame((_, delta) => {
    if (tree.current && !paused && !reducedMotion && performance.now() > interacting.current) {
      tree.current.rotation.y += Math.min(delta, 0.05) * 0.065;
    }
  }, -0.5);
  return <>
    <NightBackground background={background} />
    <hemisphereLight args={['#cbc9ef', '#342a42', 0.90]} />
    <directionalLight position={[-22, 32, 18]} intensity={1.65} color="#c8d1ff" />
    <directionalLight position={[14, 10, 24]} intensity={1.65} color="#ffe0b0" />
    <directionalLight position={[8, 16, -25]} intensity={1.10} color="#c2a8ed" />
    <pointLight position={[0, -13, 3]} intensity={105} distance={24} decay={2} color="#ffcb8c" />
    <SnowGround state={state} reducedMotion={reducedMotion} />
    <TreeAtmosphere compact={compact} reducedMotion={reducedMotion} snow={snow} stars={!background.src} />
    <group ref={tree} position={[0, TREE_OFFSET_Y, 0]}>
      <TreeBody state={state} reducedMotion={reducedMotion} />
      <TreeDetails state={state} compact={compact} reducedMotion={reducedMotion} />
      <PhotoOrnaments state={state} photos={photos} count={compact ? 90 : 128} reducedMotion={reducedMotion} onPhotoPress={onPhotoPress}
        handInput={handInput} handActive={handsEnabled} onHandPhotoSelect={onHandPhotoSelect} />
    </group>
    {handsEnabled && handInput && !reducedMotion && <HandMagic handInput={handInput} reducedMotion={reducedMotion} />}
    <CameraControls interacting={interacting} handInput={handInput} handActive={handsEnabled} />
    <Bloom compact={compact} />
  </>;
}

export default function TreeScene(props: TreeSceneProps) {
  const handActive = props.handActive ?? Boolean(props.handInput?.current.enabled);
  return <Canvas
    camera={{ position: [0, DEFAULT_CAMERA_Y, MIN_CAMERA_DISTANCE], fov: 45, near: 0.1, far: 500 }}
    dpr={[1, 1.5]}
    frameloop={props.active ? (props.reducedMotion && !handActive ? 'demand' : 'always') : 'never'}
    gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
    onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; gl.outputColorSpace = THREE.SRGBColorSpace; }}
    fallback={<div className="scene-message" role="status"><p>当前浏览器无法显示 3D 圣诞树。</p><span>请在系统浏览器中打开。</span></div>}
  >
    <SceneContents {...props} handActive={handActive} />
  </Canvas>;
}
