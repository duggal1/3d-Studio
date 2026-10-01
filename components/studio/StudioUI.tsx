"use client";

import type { CSSProperties } from "react";
import { formatBytes, formatTime } from "@/lib/asset";
import type { QualityTier } from "@/lib/render-scale";
import type {
  AnimationInfo,
  AssetMetadata,
  LoopMode,
  PlaybackSnapshot,
  RenderBuffer,
  ShotPreview,
  StillFormat,
} from "@/types/studio";

interface FilePanelProps {
  metadata: AssetMetadata;
  onOpen: () => void;
}

export function FilePanel({ metadata, onOpen }: FilePanelProps) {
  const bounds = metadata.bounds.map((value) => value.toFixed(2)).join(" × ");

  return (
    <section className="glass desktop-metadata pointer-events-auto absolute left-4 top-4 w-[250px] p-4 text-[11px] leading-4 text-white/60">
      <div className="mb-2.5 flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[12px] text-white/90">{metadata.fileName}</div>
          <div className="mt-1 text-white/40">
            {metadata.format} · {formatBytes(metadata.fileSize)}
          </div>
        </div>
        <button className="ui-button shrink-0 cursor-pointer rounded-none" type="button" onClick={onOpen}>
          Open
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t border-white/10 pt-2.5">
        <span>Meshes</span><span className="text-white/82">{metadata.meshes.toLocaleString()}</span>
        <span>Nodes</span><span className="text-white/82">{metadata.nodes.toLocaleString()}</span>
        <span>Triangles</span><span className="text-white/82">{metadata.triangles.toLocaleString()}</span>
        <span>Vertices</span><span className="text-white/82">{metadata.vertices.toLocaleString()}</span>
        <span>Materials</span><span className="text-white/82">{metadata.materials.toLocaleString()}</span>
        <span>Textures</span><span className="text-white/82">{metadata.textures.toLocaleString()}</span>
        <span>Animations</span><span className="text-white/82">{metadata.animations}</span>
        <span>Cameras</span><span className="text-white/82">{metadata.cameras}</span>
        <span>Source files</span><span className="text-white/82">{metadata.sourceFiles}</span>
        <span>Bounds</span><span className="max-w-[125px] truncate text-white/82" title={bounds}>{bounds}</span>
        <span>glTF</span><span className="text-white/82">{metadata.gltfVersion}</span>
        {metadata.generator ? (
          <>
            <span>Generator</span>
            <span className="max-w-[125px] truncate text-white/82" title={metadata.generator}>
              {metadata.generator}
            </span>
          </>
        ) : null}
      </div>
    </section>
  );
}

interface AnimationPanelProps {
  animations: AnimationInfo[];
  playback: PlaybackSnapshot;
  disabled: boolean;
  onSelect: (index: number) => void;
}

export function AnimationPanel({
  animations,
  playback,
  disabled,
  onSelect,
}: AnimationPanelProps) {
  if (animations.length === 0) return null;

  return (
    <section className="glass pointer-events-auto absolute right-4 top-[72px] w-[250px] overflow-hidden rounded-none">
      <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5 text-[11px] text-white/52">
        <span>Animations</span>
        <span>{animations.length}</span>
      </div>
      <div className="thin-scrollbar max-h-[42vh] space-y-0.5 overflow-y-auto p-2">
        {animations.map((animation) => {
          const active = animation.index === playback.selectedIndex;
          return (
            <button
              key={`${animation.index}:${animation.name}`}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(animation.index)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-none border border-transparent px-2.5 py-2 text-left text-[11px] transition-[background,border-color] duration-150 hover:border-white/10 hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:opacity-40"
              data-active={active}
            >
              <span className={`min-w-0 truncate ${active ? "text-white/92" : "text-white/62"}`}>
                {animation.name}
              </span>
              <span className="shrink-0 tabular-nums text-white/36" title={`${animation.tracks} tracks`}>
                {animation.duration.toFixed(2)}s · {animation.tracks} tracks
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface ShotPanelProps {
  shots: ShotPreview[];
  busy: boolean;
  count: number;
  format: StillFormat;
  formats: StillFormat[];
  onCount: (count: number) => void;
  onFormat: (format: StillFormat) => void;
  onRetake: () => void;
  onDownload: (index: number) => void;
  onDownloadAll: () => void;
}

export function ShotPanel({
  shots,
  busy,
  count,
  format,
  formats,
  onCount,
  onFormat,
  onRetake,
  onDownload,
  onDownloadAll,
}: ShotPanelProps) {
  return (
    <section className="glass pointer-events-auto absolute bottom-4 left-4 w-[268px] overflow-hidden rounded-none">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[11px] text-white/52">
        <span>Cinematic shots</span>
        <span className="tabular-nums">{busy ? "rendering" : shots.length}</span>
      </div>

      {shots.length > 0 ? (
        <div className="thin-scrollbar grid max-h-[38vh] grid-cols-2 gap-1.5 overflow-y-auto p-2">
          {shots.map((shot) => (
            <button
              key={shot.index}
              type="button"
              title={`${shot.label} — download`}
              onClick={() => onDownload(shot.index)}
              className="group relative block aspect-video cursor-pointer overflow-hidden rounded-none border border-white/10 transition-colors duration-150 hover:border-white/28"
            >
              {/* Object URLs of local blobs: next/image adds no value here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.url}
                alt={shot.label}
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-1 text-left text-[10px] text-white/78">
                {shot.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-2.5 py-2">
        <label className="flex items-center gap-1.5 text-[11px] text-white/46">
          <span className="hidden sm:inline">Shots</span>
          <select
            className="ui-select h-[26px]"
            value={count}
            disabled={busy}
            aria-label="Number of cinematic shots"
            onChange={(event) => onCount(Number(event.target.value))}
          >
            {[3, 4, 5, 6, 8].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[11px] text-white/46">
          <span className="hidden sm:inline">Format</span>
          <select
            className="ui-select h-[26px]"
            value={format}
            disabled={busy}
            aria-label="Still image format"
            onChange={(event) => onFormat(event.target.value as StillFormat)}
          >
            {formats.map((value) => (
              <option key={value} value={value}>{value === "jpeg" ? "JPEG" : "WebP"}</option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex gap-2">
          <button className="ui-button min-h-[26px] rounded-none" type="button" disabled={busy} onClick={onRetake}>
            {busy ? "Rendering…" : "Retake"}
          </button>
          <button
            className="ui-button min-h-[26px] rounded-none"
            type="button"
            disabled={busy || shots.length === 0}
            onClick={onDownloadAll}
          >
            Download all
          </button>
        </div>
      </div>
    </section>
  );
}

interface ViewControlsProps {
  canReset: boolean;
  isFullscreen: boolean;
  buffer: RenderBuffer;
  tier: QualityTier;
  onReset: () => void;
  onFullscreen: () => void;
}

export function ViewControls({
  canReset,
  isFullscreen,
  buffer,
  tier,
  onReset,
  onFullscreen,
}: ViewControlsProps) {
  const rendered = buffer.bufferWidth > 0
    ? `${buffer.bufferWidth}×${buffer.bufferHeight}`
    : `${tier.label} target`;

  return (
    <div className="glass pointer-events-auto absolute right-4 top-4 flex items-center rounded-none">
      <span
        className="px-2.5 text-[11px] tabular-nums text-white/34"
        title={
          buffer.clamped
            ? `Capped by this display's canvas limits. Target ${tier.width}×${tier.height}.`
            : `Rendered pixels per CSS pixel × actual draw buffer. Target ${tier.width}×${tier.height}.`
        }
      >
        {rendered}
        {buffer.clamped ? (
          <span className="ml-1.5 text-white/24" aria-label="capped by display">
            max
          </span>
        ) : null}
      </span>

      <div className="h-5 w-px bg-white/10" />
      <button className="ui-button cursor-pointer rounded-none border-0 bg-transparent" type="button" disabled={!canReset} onClick={onReset}>
        Reset camera
      </button>
      <div className="h-5 w-px bg-white/10" />
      <button className="ui-button cursor-pointer rounded-none border-0 bg-transparent" type="button" onClick={onFullscreen}>
        {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      </button>
    </div>
  );
}

interface PlaybackBarProps {
  animations: AnimationInfo[];
  playback: PlaybackSnapshot;
  speed: number;
  loop: LoopMode;
  busy: boolean;
  canRecord: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRestart: () => void;
  onSeek: (progress: number) => void;
  onSpeed: (speed: number) => void;
  onLoop: (mode: LoopMode) => void;
  onPlayAll: () => void;
  onCreateVideo: () => void;
}

export function PlaybackBar({
  animations,
  playback,
  speed,
  loop,
  busy,
  canRecord,
  onPlay,
  onPause,
  onStop,
  onRestart,
  onSeek,
  onSpeed,
  onLoop,
  onPlayAll,
  onCreateVideo,
}: PlaybackBarProps) {
  if (animations.length === 0) return null;

  const selected = animations[playback.selectedIndex] ?? animations[0];
  const elapsed = selected.duration * playback.progress;
  const progressStyle = {
    "--progress": `${playback.progress * 100}%`,
  } as CSSProperties;

  return (
    <section className="glass pointer-events-auto absolute bottom-4 left-1/2 w-[min(880px,calc(100vw-32px))] -translate-x-1/2 rounded-none px-3 py-2.5">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-3 px-1 text-[11px]">
        <span className="truncate text-white/72">{selected.name}</span>
        <span className="shrink-0 tabular-nums text-white/38">
          {formatTime(elapsed)} / {formatTime(selected.duration)}
        </span>
      </div>

      <input
        className="timeline block"
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={playback.progress}
        disabled={busy}
        style={progressStyle}
        aria-label="Animation timeline"
        onChange={(event) => onSeek(Number(event.target.value))}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className="ui-button cursor-pointer rounded-none" type="button" disabled={busy} onClick={playback.isPlaying ? onPause : onPlay}>
          {playback.isPlaying ? "Pause" : "Play"}
        </button>
        <button className="ui-button cursor-pointer rounded-none" type="button" disabled={busy} onClick={onRestart}>Restart</button>
        <button className="ui-button cursor-pointer rounded-none" type="button" disabled={busy} onClick={onStop}>Stop</button>

        <div className="mx-1.5 hidden h-5 w-px bg-white/10 sm:block" />

        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-white/46">
          <span className="hidden sm:inline">Speed</span>
          <select
            className="ui-select cursor-pointer rounded-none"
            value={speed}
            disabled={busy}
            aria-label="Playback speed"
            onChange={(event) => onSpeed(Number(event.target.value))}
          >
            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
              <option key={value} value={value}>{value}×</option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-white/46">
          <span className="hidden sm:inline">Loop</span>
          <select
            className="ui-select cursor-pointer rounded-none"
            value={loop}
            disabled={busy}
            aria-label="Loop mode"
            onChange={(event) => onLoop(event.target.value as LoopMode)}
          >
            <option value="once">Once</option>
            <option value="repeat">Repeat</option>
            <option value="pingpong">Ping-pong</option>
          </select>
        </label>

        <div className="ml-auto flex gap-2">
          <button className="ui-button cursor-pointer rounded-none" type="button" disabled={busy} onClick={onPlayAll}>
            Play all
          </button>
          <button
            className="ui-button cursor-pointer rounded-none"
            type="button"
            disabled={busy || !canRecord}
            title={canRecord ? "Record all animations from the 3D canvas" : "Canvas recording is not supported by this browser"}
            onClick={onCreateVideo}
          >
            {busy ? "Recording…" : "Create video"}
          </button>
        </div>
      </div>
    </section>
  );
}

interface EmptyStateProps {
  onOpen: () => void;
}

export function EmptyState({ onOpen }: EmptyStateProps) {
  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center">
      <div className="glass flex w-[min(390px,calc(100vw-32px))] flex-col items-start rounded-none p-5">
        <div className="text-[13px] text-white/90">Harshit Studio</div>
        <div className="mt-1.5 text-[12px] leading-5 text-white/46">
          Drop a GLB or GLTF here. For external GLTF textures or buffers, select them with the model.
        </div>
        <button className="ui-button mt-4 cursor-pointer rounded-none" type="button" onClick={onOpen}>
          Open model
        </button>
      </div>
    </div>
  );
}

interface LoadingIndicatorProps {
  progress: number;
}

export function LoadingIndicator({ progress }: LoadingIndicatorProps) {
  return (
    <div className="glass pointer-events-none absolute left-1/2 top-4 w-[220px] -translate-x-1/2 rounded-none px-3.5 py-2.5">
      <div className="flex items-center justify-between text-[10px] text-white/48">
        <span>Loading model</span>
        <span className="tabular-nums">{Math.round(progress * 100)}%</span>
      </div>
      <div className="mt-2.5 h-px bg-white/10">
        <div className="h-px bg-white/80 transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

interface DropOverlayProps {
  visible: boolean;
}

export function DropOverlay({ visible }: DropOverlayProps) {
  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-3 z-50 grid place-items-center rounded-none border border-dashed border-white/28 bg-black/45 backdrop-blur-md">
      <div className="text-[13px] text-white/82">Drop model files</div>
    </div>
  );
}

export function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="glass pointer-events-auto absolute left-1/2 top-4 flex max-w-[min(520px,calc(100vw-32px))] -translate-x-1/2 items-start gap-3 rounded-none px-3.5 py-2.5 text-[11px] leading-4 text-white/72">
      <span className="min-w-0 flex-1">{message}</span>
      <button className="cursor-pointer text-white/42 transition-colors duration-150 hover:text-white/80" type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
