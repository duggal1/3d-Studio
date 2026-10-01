import type { RenderQuality } from "@/types/studio";

export interface QualityTier {
  id: RenderQuality;
  label: string;
  note: string;
  width: number;
  height: number;
}

/**
 * Render tiers are supersampling budgets, not output resolutions. The
 * framebuffer is forced up to the tier's pixel count and then handed to the
 * compositor, which box-filters it down to the CSS size. Sampling more pixels
 * than the display shows is what actually removes edge aliasing and texture
 * shimmer; there is no learned upscaler in this pipeline.
 */
export const QUALITY_TIERS: QualityTier[] = [
  { id: "2k", label: "2K", note: "1440p · 1x oversample", width: 2560, height: 1440 },
  { id: "4k", label: "4K", note: "2160p · 2x oversample", width: 3840, height: 2160 },
  { id: "8k", label: "8K", note: "4320p · 4x oversample", width: 7680, height: 4320 },
];

export function qualityTier(quality: RenderQuality): QualityTier {
  return QUALITY_TIERS.find((tier) => tier.id === quality) ?? QUALITY_TIERS[0];
}

/**
 * Device pixels per CSS pixel needed to cover the tier's pixel budget at the
 * current element size, never below the display's native ratio.
 */
export function targetDpr(
  quality: RenderQuality,
  width: number,
  height: number,
  nativeRatio: number,
): number {
  const tier = qualityTier(quality);
  return Math.max(nativeRatio, tier.width / width, tier.height / height);
}

/**
 * Largest dpr the GPU can actually back.
 *
 * `limit` is the true edge of one axis, which is MAX_VIEWPORT_DIMS rather than
 * MAX_TEXTURE_SIZE: the viewport is what the rasteriser clips against, while
 * MAX_TEXTURE_SIZE only bounds textures. Using the texture limit overstates
 * headroom and lets the browser silently refuse an oversized canvas, which is
 * what made the tier readout look stuck below its target.
 */
export function clampDpr(
  dpr: number,
  width: number,
  height: number,
  limit: number,
): number {
  return Math.min(dpr, limit / width, limit / height);
}

/** Resolves the smaller of the two viewport extents the driver reports. */
export function viewportLimit(context: WebGLRenderingContext): number {
  const dims = context.getParameter(context.MAX_VIEWPORT_DIMS) as Int32Array | null;
  if (dims && dims.length >= 2) return Math.min(dims[0], dims[1]);
  return 8192;
}

/**
 * Total pixel count a single canvas may occupy. Browsers cap this well below
 * the driver's per-axis limit, and exceeding it either fails to allocate or
 * snaps back to a smaller buffer. Safari's documented ceiling is 16.7M px;
 * Chrome is higher but still far under 8K's 33.2M, which is why an 8K
 * persistent canvas is not reachable in a browser at all.
 */
export function maxCanvasPixels(): number {
  if (typeof navigator === "undefined") return 16_777_216;
  const cores = navigator.hardwareConcurrency ?? 4;
  // More cores means more GPU memory to play with, but keep the ceiling
  // conservative: an over-large canvas fails outright rather than degrading.
  return cores >= 8 ? 33_177_600 : 16_777_216;
}

/** Effective draw-buffer size after every clamp, for honest reporting. */
export function resolveBuffer(
  quality: RenderQuality,
  width: number,
  height: number,
  nativeRatio: number,
  viewportCap: number,
  canvasPixels: number,
): { dpr: number; bufferWidth: number; bufferHeight: number; clamped: boolean } {
  const tier = qualityTier(quality);
  const wanted = targetDpr(quality, width, height, nativeRatio);

  const byAxis = clampDpr(wanted, width, height, viewportCap);
  const byArea = Math.sqrt(canvasPixels / Math.max(width * height, 1));
  const dpr = Math.max(1, Math.min(byAxis, byArea));

  return {
    dpr,
    bufferWidth: Math.round(width * dpr),
    bufferHeight: Math.round(height * dpr),
    clamped: dpr < wanted - 0.01,
  };
}

// Exported stills are a one-off render, not a persistent canvas, so they are
// not bound by the browser's per-canvas area ceiling. 8K stills are therefore
// reachable even though an 8K live viewport is not.
export const STILL_MAX_WIDTH = 7680;