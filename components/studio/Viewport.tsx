"use client";

import {
  Environment,
  Lightformer,
  OrbitControls,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  MutableRefObject,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { specularGlossinessPlugin } from "@/lib/gltf-specular-glossiness";
import { buildMetadata, disposeScene } from "@/lib/metadata";
import { installThreeClockCompat } from "@/lib/three-compat";
import { resolveNestedTransmission } from "@/lib/transmission-nesting";

installThreeClockCompat();
import type {
  AnimationInfo,
  AnimationRuntimeHandle,
  AssetMetadata,
  LocalAssetBundle,
  LoopMode,
  PlaybackSnapshot,
} from "@/types/studio";

interface ViewportProps {
  asset: LocalAssetBundle | null;
  resetToken: number;
  runtimeRef: MutableRefObject<AnimationRuntimeHandle | null>;
  onLoading: (progress: number | null) => void;
  onLoaded: (metadata: AssetMetadata, animations: AnimationInfo[]) => void;
  onPlayback: (snapshot: PlaybackSnapshot) => void;
  onError: (message: string) => void;
  controlsEnabled: boolean;
}

interface LoadedModel {
  gltf: GLTF;
  center: THREE.Vector3;
  size: THREE.Vector3;
}

function readFile(
  file: File,
  onProgress: (progress: number) => void,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}

function applyLoop(action: THREE.AnimationAction, mode: LoopMode): void {
  action.clampWhenFinished = mode === "once";
  if (mode === "once") action.setLoop(THREE.LoopOnce, 1);
  if (mode === "repeat") action.setLoop(THREE.LoopRepeat, Infinity);
  if (mode === "pingpong") action.setLoop(THREE.LoopPingPong, Infinity);
}

function frameCamera(
  camera: THREE.Camera,
  controls: OrbitControlsImpl | null,
  size: THREE.Vector3,
): void {
  if (!(camera instanceof THREE.PerspectiveCamera)) return;

  const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const fitHeightDistance = maxDimension / (2 * Math.tan(verticalFov / 2));
  const fitWidthDistance = fitHeightDistance / Math.max(camera.aspect, 0.01);
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.45;
  const direction = new THREE.Vector3(1, 0.72, 1).normalize();

  camera.position.copy(direction.multiplyScalar(distance));
  camera.near = Math.max(maxDimension / 1000, 0.001);
  camera.far = Math.max(maxDimension * 1000, 1000);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.set(0, 0, 0);
    controls.minDistance = maxDimension * 0.04;
    controls.maxDistance = maxDimension * 120;
    controls.update();
  }
}

function ModelRuntime({
  asset,
  resetToken,
  controlsRef,
  runtimeRef,
  onLoading,
  onLoaded,
  onPlayback,
  onError,
}: ViewportProps & {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera, gl, invalidate } = useThree();
  const [model, setModel] = useState<LoadedModel | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clipsRef = useRef<THREE.AnimationClip[]>([]);
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const activeIndexRef = useRef(0);
  const loopRef = useRef<LoopMode>("repeat");
  const speedRef = useRef(1);
  // Throttle playback UI updates via accumulated frame delta instead of the
  // deprecated `state.clock` (THREE.Clock). R3F still owns its own clock
  // internally (patched in lib/three-compat.ts); we stay off it entirely.
  const uiAccumRef = useRef(0);
  const sequenceTokenRef = useRef(0);
  const pendingSequenceCancelRef = useRef<(() => void) | null>(null);
  const latestPlaybackRef = useRef<PlaybackSnapshot>({
    selectedIndex: 0,
    isPlaying: false,
    progress: 0,
  });

  const publishPlayback = (next: PlaybackSnapshot) => {
    invalidate();
    latestPlaybackRef.current = next;
    onPlayback(next);
  };

  const cancelSequence = () => {
    sequenceTokenRef.current += 1;
    pendingSequenceCancelRef.current?.();
    pendingSequenceCancelRef.current = null;
  };

  const activate = (index: number, reset: boolean, loopMode = loopRef.current) => {
    const mixer = mixerRef.current;
    const clips = clipsRef.current;
    if (!mixer || clips.length === 0) return null;

    const safeIndex = THREE.MathUtils.clamp(index, 0, clips.length - 1);
    const clip = clips[safeIndex];
    const previous = activeActionRef.current;
    const action = mixer.clipAction(clip);

    if (previous && previous !== action) previous.stop();
    activeIndexRef.current = safeIndex;
    activeActionRef.current = action;
    mixer.timeScale = speedRef.current;
    applyLoop(action, loopMode);

    if (reset) action.reset();
    action.enabled = true;
    action.paused = false;
    action.play();

    publishPlayback({ selectedIndex: safeIndex, isPlaying: true, progress: 0 });
    return action;
  };

  useImperativeHandle(
    runtimeRef,
    (): AnimationRuntimeHandle => ({
      play(index = activeIndexRef.current) {
        cancelSequence();
        const current = activeActionRef.current;
        const safeIndex = THREE.MathUtils.clamp(index, 0, clipsRef.current.length - 1);

        if (current && safeIndex === activeIndexRef.current) {
          current.enabled = true;
          current.paused = false;
          current.play();
          publishPlayback({
            selectedIndex: safeIndex,
            isPlaying: true,
            progress: latestPlaybackRef.current.progress,
          });
          return;
        }

        activate(safeIndex, true);
      },
      pause() {
        cancelSequence();
        const action = activeActionRef.current;
        if (!action) return;
        action.paused = true;
        publishPlayback({
          ...latestPlaybackRef.current,
          isPlaying: false,
        });
      },
      stop() {
        cancelSequence();
        const mixer = mixerRef.current;
        const action = activeActionRef.current;
        if (!mixer || !action) return;
        action.stop();
        mixer.update(0);
        publishPlayback({
          selectedIndex: activeIndexRef.current,
          isPlaying: false,
          progress: 0,
        });
      },
      restart() {
        cancelSequence();
        activate(activeIndexRef.current, true);
      },
      seek(progress) {
        cancelSequence();
        const mixer = mixerRef.current;
        const action = activeActionRef.current;
        const clip = clipsRef.current[activeIndexRef.current];
        if (!mixer || !action || !clip || clip.duration <= 0) return;

        const wasPlaying = latestPlaybackRef.current.isPlaying;
        action.time = THREE.MathUtils.clamp(progress, 0, 1) * clip.duration;
        mixer.update(0);
        publishPlayback({
          selectedIndex: activeIndexRef.current,
          isPlaying: wasPlaying,
          progress: THREE.MathUtils.clamp(progress, 0, 1),
        });
      },
      setSpeed(speed) {
        speedRef.current = THREE.MathUtils.clamp(speed, 0.1, 4);
        if (mixerRef.current) mixerRef.current.timeScale = speedRef.current;
      },
      setLoop(mode) {
        loopRef.current = mode;
        if (activeActionRef.current) applyLoop(activeActionRef.current, mode);
      },
      async playAll() {
        cancelSequence();
        const token = sequenceTokenRef.current;
        const mixer = mixerRef.current;
        if (!mixer || clipsRef.current.length === 0) return;

        for (let index = 0; index < clipsRef.current.length; index += 1) {
          if (sequenceTokenRef.current !== token) return;

          const action = activate(index, true, "once");
          if (!action) return;
          const clip = clipsRef.current[index];

          if (clip.duration <= 0) continue;

          const completed = await new Promise<boolean>((resolve) => {
            const handleFinished = (event: { action: THREE.AnimationAction }) => {
              if (event.action !== action) return;
              mixer.removeEventListener("finished", handleFinished);
              pendingSequenceCancelRef.current = null;
              resolve(true);
            };

            const cancel = () => {
              mixer.removeEventListener("finished", handleFinished);
              resolve(false);
            };

            pendingSequenceCancelRef.current = cancel;
            mixer.addEventListener("finished", handleFinished);
          });

          if (!completed || sequenceTokenRef.current !== token) return;
        }

        const finalIndex = Math.max(0, clipsRef.current.length - 1);
        if (activeActionRef.current) applyLoop(activeActionRef.current, loopRef.current);
        publishPlayback({
          selectedIndex: finalIndex,
          isPlaying: false,
          progress: 1,
        });
      },
      cancelSequence,
    }),
    // The exposed methods intentionally use refs so the handle stays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!asset) return;
    let disposed = false;
    let loadedScene: THREE.Object3D | null = null;
    const manager = new THREE.LoadingManager();
    const draco = new DRACOLoader(manager);
    const ktx2 = new KTX2Loader(manager);
    const loader = new GLTFLoader(manager);
    loader.register(specularGlossinessPlugin);
    let highWaterProgress = 0;

    const report = (value: number) => {
      highWaterProgress = Math.max(highWaterProgress, value);
      onLoading(Math.min(highWaterProgress, 0.99));
    };

    manager.setURLModifier(asset.resolveUrl);
    manager.onStart = () => report(0.38);
    manager.onProgress = (_url, loaded, total) => {
      if (total > 0) report(0.38 + (loaded / total) * 0.56);
    };

    draco.setDecoderPath("/decoders/draco/");
    draco.setWorkerLimit(2);
    ktx2.setTranscoderPath("/decoders/basis/");
    ktx2.setWorkerLimit(2);
    ktx2.detectSupport(gl);

    loader.setDRACOLoader(draco);
    loader.setKTX2Loader(ktx2);
    loader.setMeshoptDecoder(MeshoptDecoder);

    const load = async () => {
      try {
        onLoading(0.01);
        const buffer = await readFile(asset.entry, (progress) => report(progress * 0.34));
        if (disposed) return;

        const input =
          asset.format === "gltf" ? new TextDecoder().decode(buffer) : buffer;
        const gltf = await loader.parseAsync(input, "");

        if (disposed) {
          disposeScene(gltf.scene);
          return;
        }

        loadedScene = gltf.scene;
        const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
        gltf.scene.traverse((object) => {
          object.frustumCulled = true;
          if (!(object instanceof THREE.Mesh)) return;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) {
            for (const value of Object.values(material)) {
              if (value instanceof THREE.Texture && value.anisotropy < maxAnisotropy) {
                value.anisotropy = maxAnisotropy;
                value.needsUpdate = true;
              }
            }
          }
        });

        // Transmissive objects are invisible through other transmissive
        // objects (e.g. wine inside a glass). Convert nested ones to alpha
        // blending so they render in the transmission buffer. See
        // lib/transmission-nesting.ts.
        resolveNestedTransmission(gltf.scene);

        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        if (size.lengthSq() === 0) size.setScalar(1);

        const mixer = new THREE.AnimationMixer(gltf.scene);
        mixer.timeScale = speedRef.current;
        mixerRef.current = mixer;
        clipsRef.current = gltf.animations;
        activeActionRef.current = null;
        activeIndexRef.current = 0;

        const animations: AnimationInfo[] = gltf.animations.map((clip, index) => ({
          index,
          name: clip.name.trim() || `Animation ${index + 1}`,
          duration: clip.duration,
          tracks: clip.tracks.length,
        }));

        setModel({ gltf, center, size });
        onLoaded(buildMetadata(gltf, asset), animations);
        publishPlayback({ selectedIndex: 0, isPlaying: false, progress: 0 });
        onLoading(1);
        requestAnimationFrame(() => onLoading(null));
        requestAnimationFrame(() => frameCamera(camera, controlsRef.current, size));
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : "Could not load this model.";
          onError(message);
          onLoading(null);
        }
      }
    };

    void load();

    return () => {
      disposed = true;
      cancelSequence();
      mixerRef.current?.stopAllAction();
      if (loadedScene && mixerRef.current) mixerRef.current.uncacheRoot(loadedScene);
      mixerRef.current = null;
      clipsRef.current = [];
      activeActionRef.current = null;
      setModel(null);
      if (loadedScene) disposeScene(loadedScene);
      draco.dispose();
      ktx2.dispose();
      asset.release();
    };
    // The asset identity defines the full loader lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, gl]);

  useEffect(() => {
    if (!model) return;
    frameCamera(camera, controlsRef.current, model.size);
  }, [resetToken, model, camera, controlsRef]);

  useFrame((_state, delta) => {
    const mixer = mixerRef.current;
    const action = activeActionRef.current;
    if (!mixer || !action) return;

    mixer.update(Math.min(delta, 0.1));
    if (action.isRunning() && !action.paused) invalidate();
    uiAccumRef.current += delta;
    if (uiAccumRef.current < 0.08) return;
    uiAccumRef.current = 0;

    const clip = clipsRef.current[activeIndexRef.current];
    if (!clip || clip.duration <= 0) return;
    const progress = THREE.MathUtils.clamp(action.time / clip.duration, 0, 1);
    const isPlaying = action.isRunning() && !action.paused;
    const previous = latestPlaybackRef.current;

    if (
      Math.abs(previous.progress - progress) > 0.002 ||
      previous.isPlaying !== isPlaying ||
      previous.selectedIndex !== activeIndexRef.current
    ) {
      publishPlayback({
        selectedIndex: activeIndexRef.current,
        isPlaying,
        progress,
      });
    }
  });

  if (!model) return null;

  return (
    <group position={[-model.center.x, -model.center.y, -model.center.z]}>
      <primitive object={model.gltf.scene} />
    </group>
  );
}

const StudioLighting = memo(function StudioLighting() {
  return (
    <>
      <ambientLight intensity={0.22} />
      <hemisphereLight args={[0xffffff, 0x222222, 1.35]} />
      <directionalLight position={[4, 7, 5]} intensity={2.3} />
      <directionalLight position={[-5, 2, -4]} intensity={0.7} />
      <Environment resolution={256} frames={1}>
        <Lightformer
          form="rect"
          intensity={3}
          position={[0, 5, -7]}
          scale={[8, 8, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.7}
          position={[6, 1, 2]}
          rotation={[0, -Math.PI / 2, 0]}
          scale={[5, 7, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.2}
          position={[-5, -1, 4]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[4, 5, 1]}
        />
      </Environment>
    </>
  );
});

function CameraFriction({ controlsRef }: { controlsRef: MutableRefObject<OrbitControlsImpl | null> }) {
  useFrame((_state, delta) => {
    if (controlsRef.current) {
      controlsRef.current.dampingFactor = 1 - Math.pow(1 - 0.14, Math.min(delta, 0.05) * 60);
    }
  }, -2);
  return null;
}

export default function Viewport(props: ViewportProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pixelRatio, setPixelRatio] = useState(2);
  const [moving, setMoving] = useState(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCameraChange = useCallback(() => {
    setMoving(true);
    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => setMoving(false), 180);
  }, []);

  useEffect(() => () => {
    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
  }, []);
  const [hardwareLimit, setHardwareLimit] = useState<number | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateResolution = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const targetRatio = Math.max(
        window.devicePixelRatio || 1,
        3840 / width,
        2160 / height,
      );
      setPixelRatio(hardwareLimit === null ? targetRatio : Math.min(
        targetRatio,
        hardwareLimit / width,
        hardwareLimit / height,
      ));
    };
    updateResolution();
    const observer = new ResizeObserver(updateResolution);
    observer.observe(container);
    window.addEventListener("resize", updateResolution);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateResolution);
    };
  }, [hardwareLimit]);

  return (
    <div ref={containerRef} className="h-full w-full">
    <Canvas
      camera={{ fov: 45, near: 0.01, far: 10000, position: [3, 2, 3] }}
      dpr={moving && props.controlsEnabled
        ? Math.min(pixelRatio, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1)
        : pixelRatio}
      frameloop={props.controlsEnabled ? "demand" : "always"}
      gl={{
        alpha: false,
        antialias: true,
        depth: true,
        stencil: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      }}
      onCreated={({ gl }) => {
        const context = gl.getContext();
        const renderbufferLimit: unknown = context.getParameter(context.MAX_RENDERBUFFER_SIZE);
        setHardwareLimit(Math.min(
          gl.capabilities.maxTextureSize,
          typeof renderbufferLimit === "number" ? renderbufferLimit : gl.capabilities.maxTextureSize,
        ));
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1;
        gl.setClearColor("#080808", 1);
      }}
    >
      <CameraFriction controlsRef={controlsRef} />
      <StudioLighting />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={props.controlsEnabled}
        onChange={handleCameraChange}
        enableDamping
        dampingFactor={0.14}
        rotateSpeed={0.65}
        panSpeed={0.72}
        zoomSpeed={0.8}
        minPolarAngle={0}
        maxPolarAngle={Math.PI}
        screenSpacePanning
      />
      {props.asset ? <ModelRuntime {...props} controlsRef={controlsRef} /> : null}
    </Canvas>
    </div>
  );
}
