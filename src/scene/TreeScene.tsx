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
import PhotoOrnaments from './PhotoOrnaments';
import TreeDetails, { TreeAtmosphere } from './TreeDetails';

interface TreeSceneProps {
  photos: Photo[];
  state: 'CHAOS' | 'FORMED';
  paused: boolean;
  reducedMotion: boolean;
  active: boolean;
  onPhotoSelect: (index: number) => void;
}

function CameraControls({ interacting }: { interacting: MutableRefObject<number> }) {
  const { camera, gl, size, invalidate } = useThree();
  const controls = useMemo(() => new OrbitControls(camera), [camera]);
  useEffect(() => {
    controls.domElement = gl.domElement;
    controls.connect();
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 22;
    controls.maxDistance = 115;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = Math.PI / 1.65;
    controls.target.set(0, -6, 0);
    const onStart = () => { interacting.current = Infinity; };
    const onEnd = () => { interacting.current = performance.now() + 1400; };
    const onChange = () => invalidate();
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);
    controls.addEventListener('change', onChange);
    return () => {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      controls.removeEventListener('change', onChange);
      controls.dispose();
    };
  }, [controls, gl, interacting, invalidate]);

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    // Fit the same broad original cone without cropping its photos on narrow screens.
    const aspect = size.width / Math.max(1, size.height);
    const distance = Math.max(50, 11.8 / (Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)) * aspect));
    controls.maxDistance = Math.max(115, distance * 1.5);
    camera.position.set(0, 2, distance);
    controls.target.set(0, -6, 0);
    camera.lookAt(controls.target);
    controls.update();
    invalidate();
  }, [camera, controls, size.width, size.height, invalidate]);
  useFrame(() => controls.update());
  return null;
}

function Bloom({ compact }: { compact: boolean }) {
  const { gl, scene, camera, size } = useThree();
  const pipeline = useMemo(() => {
    const composer = new EffectComposer(gl);
    const scenePass = new RenderPass(scene, camera);
    // HDR lights glow; ordinary photo whites stay sharp below the threshold.
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), compact ? 0.85 : 1.15, 0.45, 1.05);
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

function SceneContents({ photos, state, paused, reducedMotion, onPhotoSelect }: TreeSceneProps) {
  const tree = useRef<THREE.Group>(null);
  const interacting = useRef(0);
  const compact = useThree(root => root.size.width < 700);
  useFrame((_, delta) => {
    if (tree.current && !paused && !reducedMotion && performance.now() > interacting.current) {
      tree.current.rotation.y += Math.min(delta, 0.05) * 0.065;
    }
  });
  return <>
    <color attach="background" args={['#000300']} />
    <ambientLight intensity={0.6} color="#9ab79d" />
    <pointLight position={[25, 30, 30]} intensity={100} color="#FFD54F" />
    <pointLight position={[-25, 10, -20]} intensity={65} color="#FFD700" />
    <pointLight position={[0, -20, 10]} intensity={35} color="#FFFFFF" />
    <TreeAtmosphere compact={compact} reducedMotion={reducedMotion} />
    <group ref={tree} position={[0, -6, 0]}>
      <TreeDetails state={state} compact={compact} reducedMotion={reducedMotion} />
      <PhotoOrnaments state={state} photos={photos} count={compact ? 220 : 300} reducedMotion={reducedMotion} onPhotoSelect={onPhotoSelect} />
    </group>
    <CameraControls interacting={interacting} />
    <Bloom compact={compact} />
  </>;
}

export default function TreeScene(props: TreeSceneProps) {
  return <Canvas
    camera={{ position: [0, 2, 50], fov: 45, near: 0.1, far: 500 }}
    dpr={[1, 1.5]}
    frameloop={props.active ? (props.reducedMotion ? 'demand' : 'always') : 'never'}
    gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
    onCreated={({ gl }) => { gl.toneMapping = THREE.NoToneMapping; gl.outputColorSpace = THREE.SRGBColorSpace; }}
    fallback={<div className="scene-message" role="status"><p>当前浏览器无法显示 3D 圣诞树。</p><span>请在系统浏览器中打开。</span></div>}
  >
    <SceneContents {...props} />
  </Canvas>;
}
