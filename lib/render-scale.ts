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
 * Largest dpr the GPU can actually back. Both limits matter: a 7680px-wide
 * draw buffer needs MAX_RENDERBUFFER_SIZE headroom, and mipmapped textures
 * are capped by MAX_TEXTURE_SIZE.
 */
export function clampDpr(
  dpr: number,
  width: number,
  height: number,
  hardwareLimit: number,
): number {
  const byWidth = hardwareLimit / width;
  const byHeight = hardwareLimit / height;
  return Math.min(dpr, byWidth, byHeight);
}

// A still is encoded in JS, so its readback buffer costs 4 bytes per pixel and
// is copied twice during the vertical flip. 4K is the ceiling that keeps that
// under control; the viewport itself is still allowed to run at 8K.
export const STILL_MAX_WIDTH = 3840;