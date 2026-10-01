"use client";

import dynamic from "next/dynamic";
import {
  DragEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createLocalAssetBundle } from "@/lib/asset";
import { canRecordCanvas, downloadBlob, recordCanvasSequence } from "@/lib/recording";
import type {
  AnimationInfo,
  AnimationRuntimeHandle,
  AssetMetadata,
  LocalAssetBundle,
  LoopMode,
  PlaybackSnapshot,
} from "@/types/studio";
import {
  AnimationPanel,
  DropOverlay,
  EmptyState,
  ErrorToast,
  FilePanel,
  LoadingIndicator,
  PlaybackBar,
  ViewControls,
} from "./StudioUI";

const Viewport = dynamic(() => import("./Viewport"), {
  ssr: false,
  loading: () => null,
});

const INITIAL_PLAYBACK: PlaybackSnapshot = {
  selectedIndex: 0,
  isPlaying: false,
  progress: 0,
};

export default function Studio() {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const runtimeRef = useRef<AnimationRuntimeHandle | null>(null);
  const dragDepthRef = useRef(0);

  const [asset, setAsset] = useState<LocalAssetBundle | null>(null);
  const [metadata, setMetadata] = useState<AssetMetadata | null>(null);
  const [animations, setAnimations] = useState<AnimationInfo[]>([]);
  const [playback, setPlayback] = useState<PlaybackSnapshot>(INITIAL_PLAYBACK);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState<LoopMode>("repeat");
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const recorderSupported = useMemo(() => canRecordCanvas(), []);

  const loadFiles = useCallback((files: File[]) => {
    try {
      const nextAsset = createLocalAssetBundle(files);
      runtimeRef.current?.cancelSequence();
      setAsset(nextAsset);
      setMetadata(null);
      setAnimations([]);
      setPlayback(INITIAL_PLAYBACK);
      setLoadingProgress(0.01);
      setError(null);
      setSpeed(1);
      setLoop("repeat");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not open these files.");
    }
  }, []);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const handleLoaded = useCallback((nextMetadata: AssetMetadata, nextAnimations: AnimationInfo[]) => {
    setMetadata(nextMetadata);
    setAnimations(nextAnimations);
  }, []);

  const handlePlayback = useCallback((snapshot: PlaybackSnapshot) => {
    setPlayback(snapshot);
  }, []);

  const handleError = useCallback((message: string) => {
    setError(message);
  }, []);

  const handleLoading = useCallback((progress: number | null) => {
    setLoadingProgress(progress);
  }, []);

  const handleSpeed = useCallback((nextSpeed: number) => {
    setSpeed(nextSpeed);
    runtimeRef.current?.setSpeed(nextSpeed);
  }, []);

  const handleLoop = useCallback((nextLoop: LoopMode) => {
    setLoop(nextLoop);
    runtimeRef.current?.setLoop(nextLoop);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;

    try {
      if (!document.fullscreenElement) {
        await root.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setError("Fullscreen mode is not available in this browser context.");
    }
  }, []);

  const createVideo = useCallback(async () => {
    const runtime = runtimeRef.current;
    const canvas = rootRef.current?.querySelector("canvas");
    if (!runtime || !(canvas instanceof HTMLCanvasElement) || animations.length === 0) return;

    setRecording(true);
    setError(null);

    try {
      const result = await recordCanvasSequence(canvas, () => runtime.playAll());
      const stem = (metadata?.fileName ?? "model").replace(/\.(glb|gltf)$/i, "");
      downloadBlob(result.blob, `${stem}-animations.${result.extension}`);
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : "Could not create the video.");
    } finally {
      setRecording(false);
    }
  }, [animations.length, metadata?.fileName]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    return () => {
      runtimeRef.current?.cancelSequence();
      asset?.release();
    };
  }, [asset]);

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepthRef.current += 1;
    setDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    loadFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <main
      ref={rootRef}
      className="relative h-dvh w-screen overflow-hidden bg-[#080808]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        multiple
        accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.avif,.ktx2,.basis"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) loadFiles(files);
          event.currentTarget.value = "";
        }}
      />

      <div className="absolute inset-0">
        <Suspense fallback={null}>
          <Viewport
            asset={asset}
            resetToken={resetToken}
            runtimeRef={runtimeRef}
            controlsEnabled={!recording}
            onLoading={handleLoading}
            onLoaded={handleLoaded}
            onPlayback={handlePlayback}
            onError={handleError}
          />
        </Suspense>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        {!asset ? <EmptyState onOpen={openPicker} /> : null}

        {metadata ? <FilePanel metadata={metadata} onOpen={openPicker} /> : null}

        <ViewControls
          disabled={!metadata || recording}
          isFullscreen={isFullscreen}
          onReset={() => setResetToken((value) => value + 1)}
          onFullscreen={() => void toggleFullscreen()}
        />

        <AnimationPanel
          animations={animations}
          playback={playback}
          disabled={recording}
          onSelect={(index) => runtimeRef.current?.play(index)}
        />

        <PlaybackBar
          animations={animations}
          playback={playback}
          speed={speed}
          loop={loop}
          busy={recording}
          canRecord={recorderSupported}
          onPlay={() => runtimeRef.current?.play(playback.selectedIndex)}
          onPause={() => runtimeRef.current?.pause()}
          onStop={() => runtimeRef.current?.stop()}
          onRestart={() => runtimeRef.current?.restart()}
          onSeek={(progress) => runtimeRef.current?.seek(progress)}
          onSpeed={handleSpeed}
          onLoop={handleLoop}
          onPlayAll={() => void runtimeRef.current?.playAll()}
          onCreateVideo={() => void createVideo()}
        />

        {loadingProgress !== null ? <LoadingIndicator progress={loadingProgress} /> : null}
        {error ? <ErrorToast message={error} onDismiss={() => setError(null)} /> : null}
      </div>

      <DropOverlay visible={dragging} />
    </main>
  );
}
