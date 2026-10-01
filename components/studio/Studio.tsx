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
import { QUALITY_TIERS } from "@/lib/render-scale";
import { canRecordCanvas, downloadBlob, recordCanvasSequence } from "@/lib/recording";
import { availableStillFormats, downloadStill } from "@/lib/stills";
import type {
  AnimationInfo,
  AnimationRuntimeHandle,
  AssetMetadata,
  LocalAssetBundle,
  LoopMode,
  PlaybackSnapshot,
  RenderQuality,
  RenderSettings,
  ShotPreview,
  StillFormat,
} from "@/types/studio";
import Menu, { type MenuOption } from "./Menu";
import SettingsPanel from "./SettingsPanel";
import {
  AnimationPanel,
  DropOverlay,
  EmptyState,
  ErrorToast,
  FilePanel,
  LoadingIndicator,
  PlaybackBar,
  ShotPanel,
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
  const [quality, setQuality] = useState<RenderQuality>("2k");
  const [dpr, setDpr] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<RenderSettings>({
    shadow: 0.55,
    reflection: 1,
  });
  const [shots, setShots] = useState<ShotPreview[]>([]);
  const [shooting, setShooting] = useState(false);
  const [shotCount, setShotCount] = useState(5);
  const [shotFormat, setShotFormat] = useState<StillFormat>("webp");
  const shotBlobsRef = useRef(new Map<number, Blob>());
  const recorderSupported = useMemo(() => canRecordCanvas(), []);
  const shotFormats = useMemo(() => availableStillFormats(), []);

  const clearShots = useCallback(() => {
    setShots((current) => {
      for (const shot of current) URL.revokeObjectURL(shot.url);
      return [];
    });
    shotBlobsRef.current.clear();
  }, []);

  const loadFiles = useCallback((files: File[]) => {
    try {
      const nextAsset = createLocalAssetBundle(files);
      runtimeRef.current?.cancelSequence();
      clearShots();
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
  }, [clearShots]);

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

  const handleDprChange = useCallback((nextDpr: number) => {
    setDpr(nextDpr);
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

  const shoot = useCallback(async (count: number) => {
    const runtime = runtimeRef.current;
    if (!runtime || shooting) return;

    setShooting(true);
    setError(null);

    try {
      let captured = await runtime.shoot(count, shotFormat, 0.92);

      // The first attempt can land before the model group is mounted in the
      // scene graph, in which case the runtime has nothing to shoot yet.
      for (let retry = 0; retry < 8 && captured.length === 0; retry += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        captured = await runtime.shoot(count, shotFormat, 0.92);
      }

      if (captured.length === 0) {
        setError("No stills could be rendered for this model.");
        return;
      }

      clearShots();
      shotBlobsRef.current = new Map(captured.map((shot) => [shot.index, shot.blob]));
      setShots(captured.map((shot) => ({
        index: shot.index,
        label: shot.label,
        kind: shot.kind,
        url: URL.createObjectURL(shot.blob),
      })));
    } catch (shootError) {
      setError(shootError instanceof Error ? shootError.message : "Could not render the stills.");
    } finally {
      setShooting(false);
    }
  }, [clearShots, shotFormat, shooting]);

  // Shot list is refreshed automatically on a fresh model so the panel is
  // never empty once something is loaded.
  useEffect(() => {
    if (!metadata || shots.length > 0 || shooting) return;
    void shoot(shotCount);
  }, [metadata, shots.length, shooting, shoot, shotCount]);

  const downloadShot = useCallback((index: number) => {
    const blob = shotBlobsRef.current.get(index);
    if (!blob) return;
    const stem = (metadata?.fileName ?? "model").replace(/\.(glb|gltf)$/i, "");
    const shot = shots.find((candidate) => candidate.index === index);
    const label = (shot?.label ?? "shot").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadStill(blob, `${stem}-${index + 1}-${label}`, shotFormat);
  }, [metadata?.fileName, shotFormat, shots]);

  const downloadAllShots = useCallback(() => {
    for (const shot of [...shots].sort((a, b) => a.index - b.index)) {
      downloadShot(shot.index);
    }
  }, [downloadShot, shots]);

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
            quality={quality}
            settings={settings}
            runtimeRef={runtimeRef}
            controlsEnabled={!recording}
            onLoading={handleLoading}
            onLoaded={handleLoaded}
            onPlayback={handlePlayback}
            onDprChange={handleDprChange}
            onError={handleError}
          />
        </Suspense>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        {!asset ? <EmptyState onOpen={openPicker} /> : null}

        {metadata ? <FilePanel metadata={metadata} onOpen={openPicker} /> : null}



        {shots.length > 0 || shooting ? (
          <ShotPanel
            shots={shots}
            busy={shooting}
            count={shotCount}
            format={shotFormat}
            formats={shotFormats}
            onCount={(value) => {
              setShotCount(value);
              void shoot(value);
            }}
            onFormat={setShotFormat}
            onRetake={() => void shoot(shotCount)}
            onDownload={downloadShot}
            onDownloadAll={downloadAllShots}
          />
        ) : null}

        <ViewControls
          canReset={Boolean(metadata) && !recording}
          isFullscreen={isFullscreen}
            dpr={dpr}
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

      <div className="glass pointer-events-auto absolute bottom-4 right-4 z-20 flex items-center rounded-none">
        <Menu<RenderQuality>
          label="Quality"
          value={quality}
          options={QUALITY_TIERS.map<MenuOption<RenderQuality>>((tier) => ({
            value: tier.id,
            label: tier.label,
            note: tier.note,
          }))}
          onChange={setQuality}
        />
        <div className="h-5 w-px bg-white/10" />
        <button
          type="button"
          className="h-[30px] cursor-pointer px-2.5 text-[11px] text-white/60 transition-colors duration-150 hover:bg-white/8 hover:text-white/92"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((current) => !current)}
        >
          Settings
        </button>

        {settingsOpen ? (
          <SettingsPanel settings={settings} onChange={setSettings} />
        ) : null}
      </div>

      <DropOverlay visible={dragging} />
    </main>
  );
}
